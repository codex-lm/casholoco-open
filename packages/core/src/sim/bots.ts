import { candidateHexes } from './hexes';
import { capitalCellId, isSpatialMap } from '../content/hexes';
import { activeSeatTerrain, companySeatTaxRate, taxOptimisationGain, effectiveFixedCost } from './terrains';
/**
 * Bots (joueurs pilotés par une personnalité) et pilote automatique des entreprises sans contrôleur (§10).
 * Les bots passent par `runAction`, exactement comme les humains : mêmes validations, mêmes flashs.
 */
import { BOT_PERSONALITIES, COMMODITIES, DEFAULT_ZONE, FAKE_RUMORS, getContent, NEWS_CARDS, SECTORS, zoneOf } from '../content';
import { SECTOR_IDS, ZONE_IDS, type Action, type BotPersonality, type CommodityId, type CompanyState, type GameState, type Id, type PlayerState, type PlayerView, type SectorId, type SiteSlot, type ZoneId } from '../types';
import { runAction } from './actions';
import { expertTurn, type BotIO } from './botExpert';
import {
  COMMODITY_SELL_DISCOUNT,
  CRISIS_COMMS_COST,
  EMERGENCY_PURCHASE_PREMIUM,
  HQ_COST,
  LAUNCH_AMORTIZATION_TURNS,
  MAX_PRODUCTS,
  MAX_PRODUCTS_MERGED,
  MIN_STARTUP_INVESTMENT,
  POISON_PILL_DISCOUNT,
  POISON_PILL_ISSUE,
  PRICE_MAX_RATIO,
  PRICE_MIN_RATIO,
  SHADY_COSTS,
  SITE_CAPACITY,
  START_PRODUCTION_RATIO,
  STARTUP_SUBSIDY,
  WHISTLEBLOW_COST,
} from './constants';
import { brandAfter, estimateLaunchInHex, estimateSales, expectedSectorDemand, hexValues, marketInputs, qualityAfter, zoneValues } from './advice';
import {
  companyHasCrypto,
  CRYPTO_DUMP_BOT_CRASH_SELL,
  CRYPTO_DUMP_BOT_RUMOR_SELL,
  CRYPTO_DUMP_BOT_RUNUP_PANIC,
  cryptoCrashAlarm,
  cryptoDumpSignals,
} from './cryptoSignals';
import { bestAuctionHex, botHexBid, BOT_ZONE_MIN_GAIN, capitalCandidate, mergePreservesSeatValue, retainedSeatValue, unbidHexes } from './botHexes';
import { hexReservePrice } from './hexAuctions';
import { planClose } from './close';
import { cartelOf, commodityNeed, freeSlots, siteCostFactor, siteCurrentUnitCost, siteOpeningCost, slotCapacity } from './deals';
import { suggestProductName } from './factory';
import {
  companyLoanLimit,
  computeNetWorth,
  effectiveTaxRate,
  estimatedUnitCost,
  floatShares,
  fundamentalValue,
  hasModifier,
  lastReport,
  marketCap,
  marketSize,
  maxBonus,
  maxBuybackShares,
  personalLoanLimit,
  portfolioValue,
} from './finance';
import { langOf, STARTUP_SUFFIX_COUNT, textsFor, tr } from './i18n';
import { currentIssue } from './journal';
import { commodityBuyQuote, holdingOf, shareBuyQuote, sharesForBudget } from './market';
import { chance, pick, shuffle } from './rng';
import { activeCompanies, botLevelOf, clamp, getOwn, hashString, stripAccents, textSeedOf } from './util';
import { buildPlayerView } from './view';
import { factoryMoveCost, freeMove } from './transport';
import { budgetFactory, factoryCapacityLimit, productCount, usesIndustryNetwork } from './industry';
import { botFactoryNetwork } from './botIndustry';

/** Personnalité neutre du pilote automatique : prix ×1, biais 0,4, ni prédation ni magouilles. */
export const NEUTRAL_PERSONALITY: BotPersonality = {
  id: 'autopilot',
  ceoName: textsFor('fr').autopilotCeo,
  companyName: textsFor('fr').autopilotCeo,
  ticker: 'AUTO',
  emoji: '🤖',
  tagline: textsFor('fr').autopilotTagline,
  preferredSectors: [],
  aggressiveness: 0,
  riskTolerance: 0.3,
  marketingBias: 0.4,
  rndBias: 0.4,
  pricePremium: 1,
  shadyPropensity: 0,
  greed: 0,
  quotes: [],
  farewells: { won: [], podium: [], pack: [], ruined: [] },
};

/** Personnalité par défaut d'un bot dont l'identifiant est inconnu. */
const GENERIC_BOT: BotPersonality = {
  ...NEUTRAL_PERSONALITY,
  id: 'generic',
  aggressiveness: 0.4,
  riskTolerance: 0.5,
  shadyPropensity: 0.2,
  greed: 0.4,
  pricePremium: 1.05,
};

/** Les bots n'achètent leurs matières à l'avance que sur les creux (cours ≤ ce multiple du prix de base). */
const BOT_COMMODITY_MAX_PREMIUM = 0.95;
/** Part de la liquidité qu'un bot s'autorise à acheter par ordre. */
const BOT_COMMODITY_ORDER_SHARE = 0.06;
/** Leave a small contribution above the cost of each new production batch. */
const BOT_UNIT_COST_MARGIN = 1.05;

export function personalityOf(player: PlayerState): BotPersonality {
  return BOT_PERSONALITIES.find((b) => b.id === player.botPersonalityId) ?? GENERIC_BOT;
}

function controlledBy(state: GameState, playerId: Id): CompanyState[] {
  return activeCompanies(state).filter((c) => c.controllerId === playerId);
}

/** Matelas de base d'une entreprise : 1 000 k, deux trimestres de coûts fixes, l'impôt et les amendes dus (§5.7). */
function companyReserve(state: GameState, c: CompanyState): number {
  let fixed = HQ_COST;
  for (const p of c.products) fixed += effectiveFixedCost(state, p, c);
  // L'impôt et les amendes du trimestre clos sont dans la caisse, mais dus à la prochaine clôture (§5.7).
  return 1000 + 2 * fixed + Math.max(0, c.taxDue ?? 0) + Math.max(0, c.finesDue ?? 0);
}

/**
 * Trésorerie à garder avant de distribuer, d'investir ou de miser : le matelas, plus ce que la clôture demandera à la
 * caisse (§5.7) en sus des coûts fixes et des dus déjà comptés : intérêts, achats par contrat, et ce que les ventes
 * attendues ne couvriraient pas des mises, de la production, du marketing et de la R&D, avec une marge d'un écart
 * type de la demande. Sinon le bot dépenserait l'argent de la clôture et l'emprunterait ensuite.
 */
function spendingFloor(state: GameState, c: CompanyState): number {
  const p = planClose(state, c);
  const uncovered = Math.max(0, p.bids + p.production.plannedCost + p.marketing.planned - p.sales.planned + p.margin);
  return companyReserve(state, c) + p.obligations.interest + p.obligations.contracts + uncovered;
}

/** Projet chiffré sur les mêmes cases et les mêmes coûts que les estimations visibles du joueur. */
function hexLaunchBid(state: GameState, playerId: string, pers: BotPersonality, sectorId: SectorId, budget: number, cost: number) {
  if (state.turn >= state.config.totalTurns) return undefined;
  let candidates = unbidHexes(state, playerId, candidateHexes(state));
  if (zoneMode === 'capital') candidates = candidates.filter((id) => id === capitalCandidate(candidates));
  const estimates = estimateLaunchInHex(state, sectorId, playerId, candidates);
  const value = Object.fromEntries(candidates.map((id) => [id, estimates[id].quarterlyProfit]));
  const remaining = state.config.totalTurns - state.turn;
  const hexId = bestAuctionHex(candidates, value, remaining, budget, cost);
  if (!hexId) return undefined;
  const reserve = hexReservePrice(hexId);
  const bid = botHexBid(pers, reserve, value[hexId] * remaining - cost, budget - cost);
  if (bid === undefined) return undefined;
  return { hexId, bid, fallback: budget - cost >= 2 * reserve ? 'nearest' as const : 'abandon' as const };
}

/**
 * Table statique « origine de rumeur → matières annoncées en hausse », construite à partir du contenu
 * (rumeurs des cartes de news et fausses rumeurs de pénurie). Clés : 'news:<cardId>' / 'fake:<id>',
 * comme `state.rumorKeys` : la lecture ne dépend donc pas de la langue du texte publié.
 * Les bots ne lisent que le journal publié (rumeur + fiabilité affichée), comme les humains :
 * ils se font donc piéger par les fausses rumeurs de fiabilité « élevée ».
 */
let shortageTable: Map<string, CommodityId[]> | undefined;
function rumorShortageTable(): Map<string, CommodityId[]> {
  if (shortageTable) return shortageTable;
  const table = new Map<string, CommodityId[]>();
  const add = (key: string, cid: CommodityId) => {
    const list = table.get(key) ?? [];
    if (!list.includes(cid)) list.push(cid);
    table.set(key, list);
  };
  for (const card of NEWS_CARDS) {
    if (!card.rumor) continue;
    for (const e of card.effects) {
      if ((e.type === 'commodityPrice' || e.type === 'commoditySupply') && e.commodityId !== 'random' && e.multiplier > 1) {
        add(`news:${card.id}`, e.commodityId);
      }
    }
  }
  for (const f of FAKE_RUMORS) if (f.commodityId) add(`fake:${f.id}`, f.commodityId);
  shortageTable = table;
  return table;
}

/** Matières dont une rumeur de fiabilité élevée (vraie ou fausse) annonce la hausse au prochain tour. */
function rumoredShortages(state: GameState): Set<CommodityId> {
  const out = new Set<CommodityId>();
  const issue = currentIssue(state);
  if (!issue) return out;
  const keys = state.rumorKeys?.[issue.turn] ?? [];
  const table = rumorShortageTable();
  issue.rumors.forEach((r, i) => {
    if (r.reliability !== 'élevée') return;
    const key = keys[i];
    for (const cid of (key ? table.get(key) : undefined) ?? []) out.add(cid);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Gestion d'une entreprise (bots et pilote automatique)
// ---------------------------------------------------------------------------

/** Expire only the managed company's and its controller's known modifiers. */
function knownCompaniesAfter(state: GameState, actorId: Id | null, companyId: Id, quarter: number, projected?: CompanyState): GameState['companies'] {
  return Object.fromEntries(Object.entries(state.companies).map(([id, company]) => {
    if (id !== companyId && (actorId === null || company.controllerId !== actorId)) return [id, company];
    const known = id === companyId && projected ? projected : company;
    return [id, { ...known, modifiers: known.modifiers.filter((m) => m.turnsLeft > quarter)
      .map((m) => ({ ...m, turnsLeft: m.turnsLeft - quarter })) }];
  }));
}

function manageCompany(state: GameState, actorId: Id | null, c: CompanyState, pers: BotPersonality, isAutopilot: boolean): void {
  const act = (a: Action) => runAction(state, actorId, a);
  const reserve = companyReserve(state, c);
  const health = clamp((c.cash - reserve) / (reserve + 3000), 0.25, 1);

  // 1. Décisions de production. Le prix de départ tient compte de la sensibilité du secteur, puis tâtonnement
  //    sur la marge du produit (on garde la direction qui a amélioré la marge, on inverse sinon),
  //    en hausse forcée quand tout est vendu à pleine capacité.
  const planned = new Map<string, number>();
  const recent = c.reports.slice(-2);
  for (const p of c.products) {
    const def = SECTORS[p.sectorId];
    // Dans une entente (§7 bis), le bot ne descend plus sous 110 % de son prix habituel : le prix convenu au déjeuner.
    const inCartel = cartelOf(state, c.id, p.sectorId) !== undefined;
    const bubble = p.sectorId === 'crypto';
    const sensitivity = def.elasticity + 0.5 * (def.marketElasticity ?? 0);
    const markup = bubble ? 1 : clamp(Math.pow(4.5 / Math.max(sensitivity, 1), 0.35), 0.75, 1.5);
    const basePrice = def.refPrice * pers.pricePremium * markup * (inCartel ? 1.1 : 1);
    const priceStep = bubble ? 0.05 : clamp(0.05 * 4.5 / Math.max(sensitivity, 1), 0.03, 0.09);
    const hasHistory = p.lastProduced > 0 || p.lastSales > 0;
    const h = recent.map((r) => r.products.find((x) => x.productId === p.id));
    const [h0, h1] = h;
    const cut = h0 && h1 && h0.sold > 0 && h1.sold > 0
      ? 1 - (h1.revenue / h1.sold) / (h0.revenue / h0.sold) : 0;
    // A 5% discount needs more than 5% extra buyers even before production costs.
    // Public sales history can reveal weak responses outside the loyal sectors too.
    let priceResponse = def.elasticity ** 2 / (def.elasticity ** 2 + 16);
    if (cut > 0.001 && h0 && h1 && h0.sold > 0) {
      const observed = Math.max(0, h1.sold / h0.sold - 1);
      const needed = 1 / (1 - cut) - 1;
      priceResponse *= clamp(observed / Math.max(needed, 0.001), 0, 1);
    }
    let price = p.price > 0 ? p.price * (hasHistory ? 1 : pers.pricePremium) : basePrice;
    // An empty installed line can recover after a previous input-cost shutdown.
    // It has no sales history left, so restart with the ordinary opening batch.
    let production = !hasHistory && p.production === 0 && p.capacity > 0
      ? Math.round(START_PRODUCTION_RATIO * p.capacity) : p.production;
    if (hasHistory) {
      const soldOut = p.stock < 0.5;
      const capacityBound = soldOut && p.lastProduced >= 0.95 * p.capacity;
      if (capacityBound) price *= 1 + priceStep;
      // Loyal buyers barely respond to discounts: absorb the stock with less production.
      else if (!soldOut && p.lastSales < 0.6 * p.capacity) {
        price *= 1 - priceStep * priceResponse;
      }
      else if (h.length === 2 && h0 && h1 && h0.sold > 0 && h1.sold > 0) {
        const p0 = h0.revenue / h0.sold;
        const p1 = h1.revenue / h1.sold;
        const m0 = h0.revenue - h0.sold * h0.unitCost;
        const m1 = h1.revenue - h1.sold * h1.unitCost;
        const dir = p1 > p0 * 1.001 ? 1 : p1 < p0 * 0.999 ? -1 : m1 >= 0 ? 1 : -1;
        price *= 1 + priceStep * (m1 >= m0 ? dir : -dir);
      } else if (p.stock > 0.25 * Math.max(p.lastProduced, 1)) price *= 1 - priceStep * priceResponse;
      production = soldOut ? Math.max(p.capacity, Math.round(p.lastSales * 1.15 + 5))
        : Math.round(p.lastSales * (1.05 + 0.1 * priceResponse) + 1 + 4 * priceResponse - p.stock);
    }
    const maxPrice = PRICE_MAX_RATIO * def.refPrice;
    // Un produit lancé ce tour n'a pas encore de capacité : on prépare la production du trimestre suivant.
    production = clamp(production, 0, p.capacity > 0 ? p.capacity : p.pendingCapacity);
    // Cost estimates must use the new batch size: inventories and inbound haul make
    // the unit cost depend on production, rather than just the commodity spot price.
    const next = { ...p, production, capacity: p.capacity > 0 ? p.capacity : p.pendingCapacity };
    const costCompany = { ...c, products: c.products.map((line) => line.id === p.id ? next : line) };
    const unit = estimatedUnitCost(state, costCompany, next);
    // Historical stock cost is sunk. A perishable liquidation-only line can
    // discount below it; any new batch must still cover its current unit cost.
    const stockFloor = p.stock > 0 && def.perishability === 0 ? p.lastUnitCost * BOT_UNIT_COST_MARGIN : 0;
    const productionFloor = production > 0 || p.stock <= 0 ? unit * BOT_UNIT_COST_MARGIN : 0;
    let costFloor = Math.max(productionFloor, stockFloor);
    const minPrice = Math.min(maxPrice, Math.max(inCartel ? basePrice : basePrice * 0.7, costFloor));
    price = clamp(price, minPrice, maxPrice);
    // An extraordinary input shock can put cost beyond the legal price cap.
    if (costFloor > maxPrice) {
      production = 0;
      // The unaffordable batch is cancelled. Its new-input floor cannot prevent
      // selling existing perishable goods whose production cost is already sunk.
      costFloor = Math.max(p.stock <= 0 ? unit * BOT_UNIT_COST_MARGIN : 0, stockFloor);
    }
    // Budgets proportionnels à la taille du marché selon les biais (§10), plafonnés par la marge brute
    // potentielle du produit pour ne pas se ruiner dans les secteurs à marge mince.
    const M = marketSize(p.sectorId);
    const margin = Math.max(p.capacity * (price - unit), 0.03 * p.capacity * price);
    // Only the public demand history fuels the modest crypto marketing increase.
    const demand = state.sectors[p.sectorId].demandHistory;
    const risingCrypto = !isAutopilot && p.sectorId === 'crypto' && demand.length >= 3
      && demand[demand.length - 1] > demand[demand.length - 2]
      && demand[demand.length - 2] > demand[demand.length - 3];
    // Loyal brands need fewer repeat ads; short-lived trends need more. Fast
    // obsolescence shifts investment towards R&D. Defaults keep both factors at 1.
    const marketingIntensity = bubble ? 1 : Math.sqrt((def.marketingMultiplier ?? 1) * Math.max(0, 1 - (def.brandPersistence ?? 0.75)) / 0.25);
    const marketingTarget = Math.min(M * (0.005 + 0.025 * pers.marketingBias) * (risingCrypto ? 1.15 : 1), margin * (0.1 + 0.4 * pers.marketingBias)) * marketingIntensity;
    const rndTarget = Math.min(M * (0.003 + 0.02 * pers.rndBias), margin * (0.08 + 0.35 * pers.rndBias));
    const budgetScale = (bubble ? 1 : Math.min(1, 0.65 * margin / Math.max(marketingTarget + rndTarget, 1))) * health;
    let marketing = Math.round(marketingTarget * budgetScale);
    let rnd = Math.round(rndTarget * budgetScale);
    if (!bubble && p.capacity > 0 && production > 0) {
      // Budgets follow their recurring return over three quarters, within the
      // remaining game. Personality targets bound ads rather than forcing them.
      const market = marketInputs(state, c, p, actorId ?? '', unit);
      const horizon = Math.min(3, state.config.totalTurns - state.turn + 1);
      // Future quarters use known expiry dates and outside progress. Ordered
      // assets are available once delivered; unpurchased expansion is excluded.
      const markets = Array.from({ length: horizon }, (_, quarter) => {
        if (quarter === 0) return market;
        const products = c.products.map((product) => ({ ...product,
          capacity: product.capacity + product.pendingCapacity, pendingCapacity: 0,
          ...(product.id === p.id ? { production } : {}),
          ...(product.pendingHexId ? { hexId: product.pendingHexId, terrainId: undefined, pendingHexId: undefined } : {}),
        }));
        const projectedCompany = { ...c, products,
          terrainId: c.products.some((product) => product.pendingHexId && product.terrainId === c.terrainId) ? undefined : c.terrainId,
        };
        const futureState = { ...state, turn: state.turn + quarter,
          companies: knownCompaniesAfter(state, actorId, c.id, quarter, projectedCompany),
          activeEffects: state.activeEffects.filter((e) => e.turnsLeft > quarter).map((e) => ({ ...e, turnsLeft: e.turnsLeft - quarter })),
        };
        const futureCompany = futureState.companies[c.id];
        const futureProduct = futureCompany.products.find((product) => product.id === p.id)!;
        const futureUnit = estimatedUnitCost(futureState, futureCompany, futureProduct);
        return { ...marketInputs(futureState, futureCompany, futureProduct, actorId ?? '', futureUnit),
          demand: expectedSectorDemand(state, p.sectorId, state.turn + quarter, actorId) };
      });
      const forecastReturn = (ads: number, research: number) => {
        let bestCandidate = -Infinity;
        for (const priceFactor of [1, 1 - priceStep, 1 + priceStep]) {
          let quality = p.quality, brand = p.brand, stock = p.stock, stockCost = p.lastUnitCost, value = 0;
          const candidatePrice = clamp(price * priceFactor, minPrice, maxPrice);
          for (let quarter = 0; quarter < horizon; quarter++) {
            const futureMarket = markets[quarter];
            const capacity = p.capacity + (quarter > 0 ? p.pendingCapacity : 0);
            const produced = Math.max(0, Math.floor(Math.min(production, capacity)));
            const estimate = estimateSales(p.sectorId, futureMarket, { quality, brand, price: candidatePrice,
              production, capacity, stock, marketing: ads, rnd: research });
            const initialStockValue = stock * stockCost;
            stock = Math.max(0, stock + produced - estimate.sales)
              * (1 - clamp(def.perishability * (futureMarket.perishabilityMultiplier ?? 1), 0, 1));
            if (produced > 0) stockCost = futureMarket.unitCost;
            // Real contribution charges the paid batch and spoiled stock. The
            // remaining inventory is an asset, counted once at the horizon.
            value += estimate.revenue - produced * futureMarket.unitCost - initialStockValue
              + stock * stockCost - ads - research;
            quality = qualityAfter(p.sectorId, quality, research, futureMarket.rndMultiplier);
            brand = brandAfter(p.sectorId, brand, ads, futureMarket.marketingMultiplier);
          }
          bestCandidate = Math.max(bestCandidate, value);
        }
        return bestCandidate;
      };
      let bestReturn = -Infinity;
      const adsTarget = marketing;
      for (const factor of [0, 0.25, 0.5, 0.75, 1]) {
        const candidate = Math.round(adsTarget * factor);
        const value = forecastReturn(candidate, rnd);
        if (value > bestReturn) { bestReturn = value; marketing = candidate; }
      }
      bestReturn = -Infinity;
      const target = rnd;
      for (const factor of [0, 0.5, 1, 2, 3, 4, 6]) {
        const candidate = Math.round(Math.min(target * factor, Math.max(0, 0.65 * margin * health - marketing)));
        const value = forecastReturn(marketing, candidate);
        if (value > bestReturn) { bestReturn = value; rnd = candidate; }
      }
    }
    if (hasHistory) {
      // A small local search corrects the historical guess for the sector's own
      // product/market elasticity, using the same public estimates as a player.
      const market = marketInputs(state, c, p, actorId ?? '', unit);
      const decision = { quality: p.quality, brand: p.brand, production, capacity: p.capacity,
        stock: p.stock, marketing, rnd };
      let bestMargin = -Infinity;
      const guess = price;
      const liquidating = production === 0 && p.stock > 0 && def.perishability > 0;
      const candidates = liquidating
        ? [guess, guess * (1 - priceStep), guess * 0.8, guess * 0.6, PRICE_MIN_RATIO * def.refPrice]
        : [guess, guess * (1 - priceStep), guess * (1 + priceStep)];
      for (const proposed of candidates) {
        const candidate = clamp(proposed, liquidating ? Math.max(PRICE_MIN_RATIO * def.refPrice, inCartel ? basePrice : 0) : minPrice, maxPrice);
        const estimate = estimateSales(p.sectorId, market, { ...decision, price: candidate });
        // Compare contribution from buyers; the historical production buffer
        // is already committed and must not masquerade as a price incentive.
        let contribution = estimate.revenue - estimate.sales * unit;
        if (liquidating) {
          // Recover cash over the short selling horizon instead of dumping all
          // old goods immediately. Surviving stock can still sell next quarter.
          contribution = 0;
          let stock = p.stock, quality = p.quality, brand = p.brand;
          const horizon = Math.min(3, state.config.totalTurns - state.turn + 1);
          for (let quarter = 0; quarter < horizon; quarter++) {
            const futureState = { ...state, turn: state.turn + quarter,
              companies: knownCompaniesAfter(state, actorId, c.id, quarter),
              activeEffects: state.activeEffects.filter((e) => e.turnsLeft > quarter).map((e) => ({ ...e, turnsLeft: e.turnsLeft - quarter })) };
            const futureCompany = futureState.companies[c.id];
            const futureMarket = quarter === 0 ? market : { ...marketInputs(futureState, futureCompany, p, actorId ?? '', unit),
              demand: expectedSectorDemand(state, p.sectorId, state.turn + quarter, actorId) };
            const recovery = estimateSales(p.sectorId, futureMarket, { ...decision,
              stock, quality, brand, price: candidate, production: 0 });
            contribution += recovery.revenue;
            stock = Math.max(0, stock - recovery.sales)
              * (1 - clamp(def.perishability * (futureMarket.perishabilityMultiplier ?? 1), 0, 1));
            quality = qualityAfter(p.sectorId, quality, rnd, futureMarket.rndMultiplier);
            brand = brandAfter(p.sectorId, brand, marketing, futureMarket.marketingMultiplier);
          }
        }
        if (contribution > bestMargin) {
          price = candidate;
          bestMargin = contribution;
        }
      }
    }
    // Round the cost floor upwards, so cents cannot erase the promised margin.
    const roundedPrice = Math.min(maxPrice, Math.max(Math.round(price * 100) / 100, Math.ceil(costFloor * 100) / 100));
    act(budgetFactory(c, p).id === p.id
      ? { type: 'setProductDecisions', companyId: c.id, productId: p.id, price: roundedPrice, production, marketing, rnd }
      : { type: 'setProductDecisions', companyId: c.id, productId: p.id, production });
    planned.set(p.id, p.production);
  }

  // 2. Matières : achat au marché quand le cours est bas (ou sur rumeur fiable de pénurie),
  //    sinon achat d'urgence à la résolution.
  const needs = new Map<CommodityId, number>();
  for (const p of c.products) {
    const prod = planned.get(p.id) ?? 0;
    for (const [cid, per] of Object.entries(SECTORS[p.sectorId].inputs) as [CommodityId, number][]) {
      needs.set(cid, (needs.get(cid) ?? 0) + prod * per);
    }
  }
  const bets = pers.riskTolerance > 0.6 ? rumoredShortages(state) : new Set<CommodityId>();
  for (const [cid, need] of needs) {
    const def = COMMODITIES[cid];
    const have = c.inventory[cid]?.lots ?? 0;
    const bet = bets.has(cid);
    const want = need - have + (bet ? need * 0.6 : 0);
    if (want < 1) continue;
    if (!bet && state.commodities[cid].price > def.basePrice * BOT_COMMODITY_MAX_PREMIUM) continue;
    let n = Math.min(Math.ceil(want), Math.max(1, Math.floor(def.liquidity * BOT_COMMODITY_ORDER_SHARE)));
    const budget = c.cash - reserve;
    while (n >= 1 && commodityBuyQuote(state, cid, n).total > budget) n = Math.floor(n * 0.7);
    if (n >= 1) act({ type: 'buyCommodity', companyId: c.id, commodityId: cid, lots: n });
  }

  // 3. Capacité : on agrandit quand on a tout vendu (> 90 % de la capacité) avec une marge correcte
  for (const p of c.products) {
    if (p.pendingCapacity > 0 || p.capacity <= 0) continue;
    const soldOut = p.stock < 1 && p.lastSales >= 0.9 * p.capacity;
    if (!soldOut) continue;
    const unit = estimatedUnitCost(state, c, p);
    if (p.price < unit * 1.2) continue;
    const def = SECTORS[p.sectorId];
    const lots = Math.min(Math.max(1, Math.round(p.capacity * 0.2)), usesIndustryNetwork(state) ? Math.max(0, factoryCapacityLimit(p) - p.capacity - p.pendingCapacity) : Infinity);
    if (lots < 1) continue;
    const cost = lots * def.capacityCost;
    if (c.cash - cost < spendingFloor(state, c) && pers.riskTolerance >= 0.5) {
      const loan = Math.min(companyLoanLimit(c), cost + spendingFloor(state, c) - c.cash);
      if (loan >= 100) act({ type: 'takeLoan', companyId: c.id, amount: Math.round(loan) });
    }
    if (c.cash - cost >= spendingFloor(state, c)) act({ type: 'expandCapacity', companyId: c.id, productId: p.id, lots });
  }

  // 4. Nouveau produit dans un secteur préféré peu encombré, si l'entreprise gagne de l'argent. Pas dans les
  //    derniers trimestres : le lancement serait encore en charge dans les comptes à la clôture (§5.6).
  const last = lastReport(c);
  const lateGame = state.turn > state.config.totalTurns - LAUNCH_AMORTIZATION_TURNS;
  const projects = isSpatialMap(state.config) ? (state.hexBids ?? []).filter((b) => b.companyId === c.id && b.kind === 'launch' && !b.result).length : 0;
  if (!isAutopilot && !lateGame && last && last.netProfit > 0 && productCount(c) + projects < Math.min(3, MAX_PRODUCTS) && chance(state, 0.2)) {
    const present = new Set(c.products.map((p) => p.sectorId));
    const crowd = (sid: SectorId) => activeCompanies(state).reduce((n, o) => n + o.products.filter((p) => p.sectorId === sid).length, 0);
    const options = [...pers.preferredSectors, ...SECTOR_IDS].filter((s) => !present.has(s) && crowd(s) <= 2);
    let sid: SectorId | undefined = options[0];
    let hexProject: ReturnType<typeof hexLaunchBid>;
    if (isSpatialMap(state.config) && actorId) {
      sid = undefined;
      // Le premier secteur préféré peut ne pas amortir son terrain ; essayer les autres options déjà admissibles.
      for (const option of new Set(options)) {
        const cost = SECTORS[option].launchCost;
        const budget = c.cash - spendingFloor(state, c);
        if (budget <= cost * 2) continue;
        const project = hexLaunchBid(state, actorId, pers, option, budget, cost);
        if (project) { sid = option; hexProject = project; break; }
      }
    }
    if (sid) {
      const def = SECTORS[sid];
      if (c.cash > spendingFloor(state, c) + def.launchCost * 2) {
        const hex = hexProject;
        if (!isSpatialMap(state.config) || hex) {
          act({ type: 'launchProduct', companyId: c.id, sectorId: sid, name: suggestProductName(state, sid, c.name), ...hex });
        }
      }
    }
  }

  // 5. Trésorerie : emprunter si à sec (la clôture, elle, est couverte après le tour de chacun, cf. coverClose),
  //    rembourser ce qui dépasse nettement ce que la clôture demande
  const floor = spendingFloor(state, c);
  if (c.cash < reserve * 0.5) {
    const amount = Math.min(companyLoanLimit(c), reserve - c.cash);
    if (amount >= 100) act({ type: 'takeLoan', companyId: c.id, amount: Math.round(amount) });
  } else if (c.debt > 0 && c.cash > floor + reserve * 2) {
    act({ type: 'repayLoan', companyId: c.id, amount: Math.min(c.debt, c.cash - floor - reserve) });
  }

  // 6. Communication de crise du pilote automatique (les bots la font en fin de tour, cf. botCrisis)
  if (isAutopilot) crisisIfNeeded(state, null, c, 45);

  // 7. Dividende annuel du pilote automatique
  if (isAutopilot && state.turn % 4 === 0 && c.reports.length >= 4) {
    const profit = c.reports.slice(-4).reduce((s, r) => s + r.netProfit, 0);
    const floorNow = spendingFloor(state, c);
    if (profit > 0 && c.cash > floorNow + reserve * 2) {
      const amount = Math.min(0.4 * profit, c.cash - floorNow - reserve);
      if (amount >= 50) act({ type: 'payDividend', companyId: c.id, amount: Math.round(amount) });
    }
  }
}

/** Communication de crise quand la jauge devient dangereuse (une par tour, §7 ; risque §8). */
function crisisIfNeeded(state: GameState, actorId: Id | null, c: CompanyState, threshold: number): void {
  if (c.status !== 'active' || c.scandal < threshold || c.turnFlags.crisisDone) return;
  if (c.cash - CRISIS_COMMS_COST < companyReserve(state, c)) return;
  runAction(state, actorId, { type: 'crisisComms', companyId: c.id });
}

// ---------------------------------------------------------------------------
// Tour d'un bot
// ---------------------------------------------------------------------------

/**
 * Com' de crise des bots, en fin de tour : après le bonus et l'action discutable du tour, qui font monter la jauge
 * (sinon le bot finissait son tour à plus de 50 de jauge alors qu'il pouvait encore la faire redescendre).
 */
function botCrisis(state: GameState, bot: PlayerState): void {
  for (const c of controlledBy(state, bot.id)) crisisIfNeeded(state, bot.id, c, 35);
}

function botFinance(state: GameState, bot: PlayerState, pers: BotPersonality): void {
  for (const c of controlledBy(state, bot.id)) {
    const reserve = companyReserve(state, c);
    // Jamais sur l'argent de la clôture (§5.7) : il faudrait l'emprunter ensuite.
    const floor = spendingFloor(state, c);
    // Bonus selon la cupidité, tant que la jauge de scandale reste supportable
    const last = lastReport(c);
    const profitable = !!last && last.netProfit > 0;
    if (c.scandal < 30 + 25 * pers.greed && c.cash > floor + reserve * 0.5 && (profitable || c.cash > floor + reserve * 3)) {
      const amount = Math.floor(Math.min(maxBonus(c) * pers.greed * 0.5, c.cash - floor));
      if (amount >= 50) runAction(state, bot.id, { type: 'ceoBonus', companyId: c.id, amount });
    }
    // Dividende de temps en temps
    const floorNow = spendingFloor(state, c);
    if (last && last.netProfit > 0 && c.cash > floorNow + reserve * 3 && chance(state, pers.greed * 0.3)) {
      const amount = Math.min(c.cash - floorNow - reserve * 2, last.netProfit * (0.5 + pers.greed));
      if (amount >= 100) runAction(state, bot.id, { type: 'payDividend', companyId: c.id, amount: Math.round(amount) });
    }
  }
}

function buyWithLeverage(state: GameState, bot: PlayerState, c: CompanyState, n: number, leverage: number): void {
  if (n < 1) return;
  const q = shareBuyQuote(c, n);
  const missing = q.total - (bot.cash - 100);
  if (missing > 0 && leverage > 0) {
    const loan = Math.min(personalLoanLimit(state, bot) * leverage, missing);
    if (loan >= 50) runAction(state, bot.id, { type: 'takePersonalLoan', amount: Math.floor(loan) });
  }
  let k = n;
  while (k >= 1 && shareBuyQuote(c, k).total > bot.cash) k = Math.floor(k * 0.9);
  if (k >= 1) runAction(state, bot.id, { type: 'buyShares', companyId: c.id, shares: k });
}

function botDefense(state: GameState, bot: PlayerState, pers: BotPersonality): void {
  for (const c of controlledBy(state, bot.id)) {
    let threat = 0;
    for (const [pid, h] of Object.entries(c.holdings)) if (pid !== bot.id && h > threat) threat = h;
    if (threat < 0.3 * c.sharesOutstanding) continue;

    // 1. Rachat d'actions (sans jamais faire passer le raider au-dessus de 50 %)
    if (!c.turnFlags.buybackDone) {
      const budget = Math.max(0, c.cash - spendingFloor(state, c)) * 0.5;
      const n = maxBuybackShares(c, Math.min(floatShares(c), sharesForBudget(c, budget), Math.floor(c.sharesOutstanding - 2 * threat - 1)));
      if (n >= 1) runAction(state, bot.id, { type: 'buyback', companyId: c.id, shares: n });
    }
    if (c.controllerId !== bot.id) continue;

    // 2. Achat perso pour repasser au-dessus de 50 %
    const mine = holdingOf(c, bot.id);
    const need = Math.floor(c.sharesOutstanding / 2) + 1 - mine;
    if (need > 0) {
      const budget = Math.max(0, bot.cash - 100) + personalLoanLimit(state, bot) * pers.riskTolerance;
      const n = Math.min(need, floatShares(c), sharesForBudget(c, budget));
      buyWithLeverage(state, bot, c, n, pers.riskTolerance);
    }
    if (c.controllerId !== bot.id) continue;

    // 3. Pilule empoisonnée si la menace persiste
    const S = c.sharesOutstanding;
    if (holdingOf(c, bot.id) <= S / 2 && threat >= 0.25 * S && !hasModifier(c, 'poison_pill_cooldown')) {
      const cost = Math.round(POISON_PILL_ISSUE * S) * POISON_PILL_DISCOUNT * c.sharePrice;
      if (cost <= bot.cash) runAction(state, bot.id, { type: 'poisonPill', companyId: c.id });
    }
  }
}

/** Les bots observent le marché deux trimestres avant de chasser. */
const PREDATION_FIRST_TURN = 3;

function botPredation(state: GameState, bot: PlayerState, pers: BotPersonality): void {
  if (state.turn < PREDATION_FIRST_TURN || !chance(state, pers.aggressiveness)) return;
  const cash = Math.max(0, bot.cash - 200);
  const loanRoom = personalLoanLimit(state, bot) * clamp(pers.riskTolerance, 0, 1) * 1.0;
  const budget = cash + loanRoom;
  if (budget < 300) return;

  interface Cand {
    c: CompanyState;
    held: number;
    need: number;
    cost: number;
  }
  const cands: Cand[] = [];
  for (const c of activeCompanies(state)) {
    if (c.controllerId === bot.id || !(c.sharePrice > 0)) continue;
    const held = holdingOf(c, bot.id);
    const need = Math.floor(c.sharesOutstanding / 2) + 1 - held;
    if (need <= 0 || need > floatShares(c)) continue;
    cands.push({ c, held, need, cost: shareBuyQuote(c, need).total });
  }
  if (cands.length === 0) return;
  const byCost = (a: Cand, b: Cand) => a.cost - b.cost;
  // On poursuit la cible déjà entamée, sinon la moins chère à contrôler (PNJ d'abord).
  let target: Cand | undefined = cands
    .filter((x) => x.held >= 0.1 * x.c.sharesOutstanding && x.cost <= budget * 6)
    .sort((a, b) => b.held / b.c.sharesOutstanding - a.held / a.c.sharesOutstanding)[0];
  if (!target) {
    // Cibles : les PNJ à portée, et les entreprises de joueurs quand c'est rentable (cours pas au-dessus de la valeur
    // fondamentale, entreprise bénéficiaire, flottant suffisant) pour les bots agressifs. Une conquête ouvre des
    // emplacements de produit (fusion à 6 produits, §7) : prime de 30 % au score.
    const value = (x: Cand) => fundamentalValue(x.c) / Math.max(marketCap(x.c), 1);
    const score = (x: Cand) => (value(x) * (x.c.controllerId !== null ? 1.3 : 1)) / Math.sqrt(Math.max(x.cost, 1) / Math.max(budget, 1));
    const eligible = cands.filter((x) => {
      if (x.c.controllerId === null) return x.cost <= budget * 5;
      const last = lastReport(x.c);
      return pers.aggressiveness >= 0.4 && x.cost <= budget * 3 && value(x) >= 0.9 && !!last && last.netProfit > 0;
    });
    target = eligible.sort((a, b) => score(b) - score(a) || byCost(a, b))[0];
  }
  if (!target) return;

  if (target.cost <= budget) {
    // Assaut final : on emprunte ce qui manque (effet de levier) pour franchir 50 %.
    buyWithLeverage(state, bot, target.c, target.need, clamp(pers.riskTolerance, 0, 1) * 1.0);
  } else {
    // Accumulation : le cash disponible, plus un peu de levier pour les plus joueurs.
    const leverage = clamp(pers.riskTolerance - 0.3, 0, 1) * 1.0;
    const spend = cash * (0.5 + 0.4 * pers.aggressiveness) + personalLoanLimit(state, bot) * leverage;
    const n = Math.min(target.need, sharesForBudget(target.c, spend));
    buyWithLeverage(state, bot, target.c, n, leverage);
  }
}

function botShady(state: GameState, bot: PlayerState, pers: BotPersonality): void {
  const mine = controlledBy(state, bot.id).sort((a, b) => marketCap(b) - marketCap(a));
  const c = mine[0];
  if (!c || c.scandal > 40 || !chance(state, pers.shadyPropensity * 0.5)) return;
  const floor = spendingFloor(state, c);
  const options: Action[] = [];
  const last = lastReport(c);
  if (last && (isSpatialMap(state.config) ? taxOptimisationGain(state, c, last.netProfit + last.tax) > SHADY_COSTS.tax_optimisation.cost : last.netProfit + last.tax > 1500)) options.push({ type: 'shady', companyId: c.id, kind: 'tax_optimisation' });
  if (c.products.length > 0) {
    options.push({ type: 'shady', companyId: c.id, kind: 'greenwashing' });
    const main = [...c.products].sort((a, b) => b.lastRevenue - a.lastRevenue)[0];
    if (main.lastRevenue > 4000) options.push({ type: 'shady', companyId: c.id, kind: 'lobbying', sectorId: main.sectorId });
    const behind = c.products.some((p) =>
      activeCompanies(state).some((o) => o.id !== c.id && o.products.some((op) => op.sectorId === p.sectorId && op.quality > p.quality + 0.3)),
    );
    if (behind) options.push({ type: 'shady', companyId: c.id, kind: 'industrial_espionage' });
  }
  if (!hasModifier(c, 'offshoring')) options.push({ type: 'shady', companyId: c.id, kind: 'offshoring' });
  const rival = activeCompanies(state)
    .filter((o) => o.controllerId !== null && o.controllerId !== bot.id)
    .sort((a, b) => marketCap(b) - marketCap(a))[0];
  if (rival) options.push({ type: 'shady', companyId: c.id, kind: 'smear_campaign', targetCompanyId: rival.id });
  const affordable = options.filter((o) => o.type === 'shady' && c.cash - SHADY_COSTS[o.kind].cost >= floor && !c.turnFlags.shadyDone.includes(o.kind));
  const choice = pick(state, affordable);
  if (choice) runAction(state, bot.id, choice);
}

/**
 * Lanceur d'alerte (§7) : un bot dénonce parfois l'entreprise du joueur qui le devance et dont la jauge de scandale
 * publique est au moins « moyenne ». Les bots ne lisent que le niveau affiché, comme les humains.
 */
function botWhistle(state: GameState, bot: PlayerState, pers: BotPersonality): void {
  if (state.turn < 2 || bot.cash < WHISTLEBLOW_COST + 1_500 || bot.lastWhistleblowTurn === state.turn) return;
  const myWorth = computeNetWorth(state, bot.id);
  let best: { c: CompanyState; worth: number } | undefined;
  for (const c of activeCompanies(state)) {
    if (c.controllerId === null || c.controllerId === bot.id || c.scandal < 30) continue;
    const worth = computeNetWorth(state, c.controllerId);
    if (worth <= myWorth) continue;
    if (!best || worth > best.worth || (worth === best.worth && c.scandal > best.c.scandal)) best = { c, worth };
  }
  if (!best || !chance(state, 0.15 + 0.35 * pers.aggressiveness)) return;
  runAction(state, bot.id, { type: 'whistleblow', companyId: best.c.id });
}

function botMerge(state: GameState, bot: PlayerState): void {
  const mine = controlledBy(state, bot.id).sort((a, b) => marketCap(b) - marketCap(a));
  if (mine.length < 2 || !chance(state, 0.25)) return;
  const absorber = mine[0];
  const target = mine[mine.length - 1];
  if (productCount(absorber) + productCount(target) > MAX_PRODUCTS_MERGED) return;
  if (!mergePreservesSeatValue(state, absorber, target)) return;
  runAction(state, bot.id, { type: 'merge', absorberId: absorber.id, targetId: target.id });
}


const SUFFIX_INDEXES = Array.from({ length: STARTUP_SUFFIX_COUNT }, (_, i) => i);

function botStartup(state: GameState, bot: PlayerState, pers: BotPersonality): void {
  // La start-up est un retour en jeu, réservé à qui ne contrôle plus aucune entreprise (§7).
  if (controlledBy(state, bot.id).length > 0 || !chance(state, 0.6)) return;
  if (bot.cash < MIN_STARTUP_INVESTMENT) return;
  const sectorId = pers.preferredSectors[0] ?? pick(state, SECTOR_IDS) ?? 'energy_drinks';
  // Nom dans la langue de la partie ; le tirage porte sur un indice (même consommation du RNG partout).
  const localPers = getContent(langOf(state)).bots.find((b) => b.id === pers.id) ?? pers;
  const stem = stripAccents(localPers.companyName.split(' ')[0] || bot.name.split(' ')[0] || 'Start');
  const suffixes = tr(state).startupSuffixes;
  const i = pick(state, SUFFIX_INDEXES) ?? 0;
  const suffix = suffixes[i % suffixes.length] ?? 'Next';
  const investment = Math.floor(clamp(bot.cash * 0.7, MIN_STARTUP_INVESTMENT, 8_000));
  const hex = isSpatialMap(state.config)
    ? hexLaunchBid(state, bot.id, pers, sectorId, investment + Math.max(STARTUP_SUBSIDY, bot.comebackGrant ?? 0), 0) : undefined;
  if (!isSpatialMap(state.config) || hex) {
    runAction(state, bot.id, { type: 'foundStartup', name: `${stem} ${suffix}`, sectorId, investment, ...hex });
  }
}

function botDeleverage(state: GameState, bot: PlayerState, pers: BotPersonality): void {
  if (bot.debt <= 0) return;
  const pf = portfolioValue(state, bot.id);
  const ratio = bot.debt / Math.max(pf, 1);
  if (ratio > 0.3 + 0.2 * pers.riskTolerance || pers.riskTolerance < 0.4) {
    const amount = Math.min(bot.debt, bot.cash - 200);
    if (amount >= 50) runAction(state, bot.id, { type: 'repayPersonalLoan', amount });
  }
}

/**
 * Panique crypto des petits patrons (§10) : décision prise sur la seule vue du joueur (journal du jour,
 * rumeurs avec leur fiabilité affichée, demande réalisée, cote publique) — jamais sur l'état caché de la
 * bulle. Une rumeur de krach fait vendre un paquet des participations dans les entreprises qui ont un
 * produit crypto ; le krach en une fait presque tout liquider (délibérément souvent trop tard). Une fois
 * par partie au plus, le produit crypto le plus faible (plus petit CA) d'une entreprise contrôlée est
 * arrêté impulsivement pour en récupérer la moitié — jamais le dernier produit. Sans céder le contrôle
 * dans la panique : la défense le rachèterait dans le même tour (délit d'initié, §6.2).
 */
function botCryptoDump(state: GameState, bot: PlayerState, pers: BotPersonality): void {
  // Alarme à coût nul d'abord : la vue complète n'est construite que si le journal du jour parle du krach.
  const issue = state.journal[state.journal.length - 1];
  if (!issue || !cryptoCrashAlarm(issue, langOf(state))) return;
  const view = buildPlayerView(state, bot.id, { journal: 'last', hexEstimates: 'candidates' });
  const sig = cryptoDumpSignals(view, langOf(state));
  if (!sig.crashNow && !sig.crashRumor) return;
  // Cupides et prudents allègent davantage sur rumeur ; les téméraires gardent leurs jetons plus longtemps.
  const fraction = sig.crashNow ? CRYPTO_DUMP_BOT_CRASH_SELL
    : clamp(CRYPTO_DUMP_BOT_RUMOR_SELL + 0.15 * (pers.greed - 0.5) - 0.1 * (pers.riskTolerance - 0.5), 0.25, 0.6);
  for (const c of view.companies) {
    if (c.status !== 'active' || !companyHasCrypto(c)) continue;
    const h = c.holdings[bot.id] ?? 0;
    if (h < 1) continue;
    const keep = c.controllerId === bot.id ? Math.floor(c.sharesOutstanding / 2) + 1 : 0;
    const n = Math.min(h - keep, Math.max(1, Math.floor(h * fraction)));
    if (n >= 1) runAction(state, bot.id, { type: 'sellShares', companyId: c.id, shares: n });
  }
  const panic = sig.crashNow || (!!sig.crashRumor && sig.demandFading && sig.priceRunUp >= CRYPTO_DUMP_BOT_RUNUP_PANIC);
  if (!panic || bot.cryptoPanicCloseUsed) return;
  const target = controlledBy(state, bot.id)
    .filter((c) => c.products.length > 1)
    .flatMap((c) => c.products.filter((p) => p.sectorId === 'crypto').map((p) => ({ c, p })))
    .sort((a, b) => a.p.lastRevenue - b.p.lastRevenue)[0];
  if (target && runAction(state, bot.id, { type: 'discontinueProduct', companyId: target.c.id, productId: target.p.id }).ok) {
    bot.cryptoPanicCloseUsed = true;
  }
}

/**
 * Bot « stagiaire » (niveau 'intern', §10) : garde ses réglages de départ (prix de référence,
 * production, marketing et R&D par défaut), ne lance rien, ne rachète personne, ne triche pas. Il se contente
 * d'emprunter s'il est à sec et de soigner sa réputation si une news le salit.
 */
function internTurn(state: GameState, bot: PlayerState): void {
  for (const c of controlledBy(state, bot.id)) {
    for (const p of c.products) runAction(state, bot.id, {
      type: 'setProductDecisions', companyId: c.id, productId: p.id, price: SECTORS[p.sectorId].refPrice,
    });
    const reserve = companyReserve(state, c);
    if (c.cash < reserve * 0.5) {
      const amount = Math.min(companyLoanLimit(c), reserve - c.cash);
      if (amount >= 100) runAction(state, bot.id, { type: 'takeLoan', companyId: c.id, amount: Math.round(amount) });
    }
    crisisIfNeeded(state, bot.id, c, 45);
  }
}

/**
 * Bot « expert » (niveau 'expert', §10) : décide sur sa seule vue de joueur (botExpert.ts), relue
 * après chaque action réussie ; ses filiales et ses réponses aux offres suivent les règles des autres bots.
 */
function expertIO(state: GameState, bot: PlayerState, pers: BotPersonality): BotIO {
  let cached: PlayerView | null = null;
  return {
    view: () => (cached ??= buildPlayerView(state, bot.id, { journal: 'last', hexEstimates: 'candidates' })),
    act: (action) => {
      const r = runAction(state, bot.id, action);
      if (r.ok) cached = null;
      return r;
    },
    memory: () => (bot.expertMemory ??= { calib: {} }),
    productName: (sectorId, companyName) => suggestProductName(state, sectorId, companyName),
    startupName: () => {
      const localPers = getContent(langOf(state)).bots.find((b) => b.id === pers.id) ?? pers;
      const stem = stripAccents(localPers.companyName.split(' ')[0] || bot.name.split(' ')[0] || 'Start');
      const suffixes = tr(state).startupSuffixes;
      return `${stem} ${suffixes[hashString(`${textSeedOf(state)}|${state.turn}|${bot.id}|startup`) % suffixes.length] ?? 'Next'}`;
    },
  };
}

function botTurn(state: GameState, bot: PlayerState): void {
  const level = botLevelOf(state, bot);
  if (level === 'intern') {
    internTurn(state, bot);
    return;
  }
  const pers = personalityOf(bot);
  if (level === 'expert') {
    // La zone d'abord (produits qui démarrent), pour que prix et production se règlent sur elle ; puis celle des
    // lancements du tour.
    botZones(state, bot);
    expertTurn(expertIO(state, bot, pers), pers);
    botFactoryNetwork(state, bot, c => spendingFloor(state, c));
    botSites(state, bot, pers);
    botZones(state, bot);
    return;
  }
  botZones(state, bot);
  for (const c of controlledBy(state, bot.id)) manageCompany(state, bot.id, c, pers, false);
  botFactoryNetwork(state, bot, c => spendingFloor(state, c));
  botCryptoDump(state, bot, pers);
  botFinance(state, bot, pers);
  botDefense(state, bot, pers);
  botStartup(state, bot, pers);
  botPredation(state, bot, pers);
  botShady(state, bot, pers);
  botWhistle(state, bot, pers);
  botMerge(state, bot);
  botCrisis(state, bot);
  botDeleverage(state, bot, pers);
  botSites(state, bot, pers);
  botZones(state, bot);
}

/** Règle des zones d'usine des bots : 'market' (le jeu) ou 'capital' (aucun déménagement : banc d'essai et tests). */
export type BotZoneMode = 'market' | 'capital';
let zoneMode: BotZoneMode = 'market';
/** Change la règle des zones d'usine des bots (banc d'essai et tests seulement : le jeu garde 'market'). */
export function setBotZoneMode(mode: BotZoneMode): void {
  zoneMode = mode;
}
/** Règle des zones d'usine des bots en vigueur. */
export function botZoneMode(): BotZoneMode {
  return zoneMode;
}

/**
 * Zones d'usine (§5.8) : le trimestre où un produit démarre (départ, lancement, start-up), le déménagement est gratuit ;
 * le bot installe alors l'usine dans la zone qui rapporte le plus par trimestre (`zoneValues` : meilleure marge ×
 * demande, marchés régionaux, main-d'œuvre, transport et filiales compris), si elle gagne sur la capitale au moins 1 % du
 * coût des ventes de la capitale. En mode hexagonal, chaque trimestre peut justifier une enchère : gain depuis la
 * case actuelle, après impôt et perte éventuelle du siège, sur les tours restants, moins terrain et déménagement.
 */
function botZones(state: GameState, bot: PlayerState): void {
  if (zoneMode === 'capital') return;
  for (const c of controlledBy(state, bot.id)) {
    for (const p of c.products) {
      if (p.pendingHexId) continue;
      if (isSpatialMap(state.config)) {
        if (usesIndustryNetwork(state) && !p.incubator) continue;
        if (state.turn >= state.config.totalTurns || (state.hexBids ?? []).some((b) => b.companyId === c.id && b.productId === p.id && !b.result)) continue;
        const here = p.hexId ?? capitalCellId(state.config);
        const candidates = unbidHexes(state, bot.id, candidateHexes(state, p.hexId), p.id).filter((id) => id !== p.hexId);
        if (!candidates.length) continue;
        const estimates = [...new Set([...candidates, here])];
        const { value, capitalCogs } = hexValues(state, c, p, bot.id, estimates, capitalCellId(state.config));
        const seat = retainedSeatValue(state, c, p, value[here]);
        // Le siège reste en place si ce n'est pas l'usine de départ qui part : l'entreprise garde alors son taux.
        const seatTerrain = activeSeatTerrain(state, c);
        const keepsSeat = seatTerrain !== undefined && seatTerrain.id !== p.terrainId;
        const afterTax = 1 - (keepsSeat ? companySeatTaxRate(state, c, true) : effectiveTaxRate(state));
        // L'impôt ne frappe que les bénéfices.
        for (const id of estimates) if (value[id] > 0) value[id] *= afterTax;
        value[here] += seat;
        const remaining = state.config.totalTurns - state.turn;
        const cost = p.incubator ? 0 : factoryMoveCost(state, p);
        const budget = c.cash - spendingFloor(state, c);
        const best = bestAuctionHex(candidates, value, remaining, budget, cost, p.incubator ? 0 : value[here]);
        if (!best || (!p.incubator && value[best] - value[here] < BOT_ZONE_MIN_GAIN * capitalCogs)) continue;
        const reserve = hexReservePrice(best);
        const bid = botHexBid(personalityOf(bot), reserve, (value[best] - (p.incubator ? 0 : value[here])) * remaining - cost, budget - cost);
        if (bid !== undefined) {
          runAction(state, bot.id, { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: best, bid, ...(p.incubator ? { fallback: 'nearest' as const } : {}) });
        }
        continue;
      }
      if (!freeMove(state, p)) continue;
      const here = zoneOf(p).id;
      const { value, capitalCogs } = zoneValues(state, c, p, bot.id);
      let best: ZoneId = DEFAULT_ZONE;
      for (const z of ZONE_IDS) if (value[z] > value[best] + 1e-9) best = z;
      if (value[best] - value[DEFAULT_ZONE] < BOT_ZONE_MIN_GAIN * capitalCogs) best = DEFAULT_ZONE;
      if (best !== here) runAction(state, bot.id, { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: best });
    }
  }
}

/** Part de la liquidité qu'un bot met en vente d'un coup quand sa filiale produit plus qu'il ne consomme. */
const BOT_SURPLUS_ORDER_SHARE = 0.06;

/** Filiale endormie quand l'extraction coûte plus de 115 % de ce que vaut le lot, relancée sous 95 %. */
const BOT_SITE_SLEEP_RATIO = 1.15;
const BOT_SITE_WAKE_RATIO = 0.95;

/** Marge d'un bot sur la mise à prix d'une filiale, selon son agressivité : de 10 % (Brevet) à 34 % (Tweetard). */
const BOT_SITE_BID_PREMIUM = 0.4;

/**
 * Filiales (§5.5 bis) : un bot endort ses filiales quand une news rend l'extraction trop chère et les relance quand
 * elle redevient rentable ; il revend au marché ce qu'elles produisent en trop. Prudent ou joueur, il mise au plus
 * sur une matière par tour, celle qu'il consomme le plus (au moins 30 lots par trimestre, une filiale encore libre),
 * s'il a le temps de l'amortir (8 trimestres) et de quoi payer deux fois la mise à prix sans toucher à l'argent de la
 * clôture, et jamais pendant qu'une news renchérit son extraction. Sa mise dépasse la mise à prix d'autant que son
 * agressivité est grande ; il ne paie de toute façon que le prix d'équilibre.
 */
function botSites(state: GameState, bot: PlayerState, pers: BotPersonality): void {
  // Sommeil et relance (§5.5 bis) : ce que vaut un lot extrait, c'est l'achat d'urgence qu'il évite (la moitié au moins
  // de l'extraction sert la production), sinon la revente au marché. On endort la filiale quand l'extraction coûte
  // nettement plus, on la relance quand elle redevient nettement rentable (l'écart évite de changer d'avis chaque
  // trimestre : l'entretien et le trimestre de relance coûtent).
  for (const c of controlledBy(state, bot.id)) {
    for (const s of c.sites ?? []) {
      const spot = state.commodities[s.commodityId].price;
      const worth = commodityNeed(c, s.commodityId) >= 0.5 * s.capacity ? spot * EMERGENCY_PURCHASE_PREMIUM : spot * COMMODITY_SELL_DISCOUNT;
      const unit = siteCurrentUnitCost(state, s);
      if (!s.dormant && s.activeFrom <= state.turn && unit > BOT_SITE_SLEEP_RATIO * worth) {
        runAction(state, bot.id, { type: 'setSiteDormant', companyId: c.id, commodityId: s.commodityId, dormant: true });
      } else if (s.dormant && unit < BOT_SITE_WAKE_RATIO * worth) {
        runAction(state, bot.id, { type: 'setSiteDormant', companyId: c.id, commodityId: s.commodityId, dormant: false });
      }
    }
  }
  for (const c of controlledBy(state, bot.id)) {
    for (const s of c.sites ?? []) {
      const have = c.inventory[s.commodityId]?.lots ?? 0;
      const surplus = Math.floor(have - 1.5 * commodityNeed(c, s.commodityId));
      const lots = Math.min(surplus, Math.floor(COMMODITIES[s.commodityId].liquidity * BOT_SURPLUS_ORDER_SHARE));
      if (lots >= 10 && state.commodities[s.commodityId].price >= s.unitCost * 1.1) {
        runAction(state, bot.id, { type: 'sellCommodity', companyId: c.id, commodityId: s.commodityId, lots });
      }
    }
  }
  if (pers.riskTolerance < 0.4 || state.turn > state.config.totalTurns - 8) return;
  let best: { c: CompanyState; slot: SiteSlot; value: number } | null = null;
  for (const c of controlledBy(state, bot.id)) {
    for (const cid of Object.keys(COMMODITIES) as CommodityId[]) {
      if ((c.sites ?? []).some((s) => s.commodityId === cid)) continue;
      // Pas d'enchère pendant qu'une news renchérit l'extraction de cette matière, ni sans gisement libre.
      const slot = botSlot(state, c, cid);
      if (siteCostFactor(state, cid) > 1 || !slot) continue;
      const need = commodityNeed(c, cid);
      if (need < 0.75 * SITE_CAPACITY) continue;
      if (c.cash < 2 * siteOpeningCost(cid) + spendingFloor(state, c)) continue;
      const value = need * COMMODITIES[cid].basePrice;
      if (!best || value > best.value) best = { c, slot, value };
    }
  }
  if (best) {
    const amount = Math.round(siteOpeningCost(best.slot.commodityId) * (1 + BOT_SITE_BID_PREMIUM * pers.aggressiveness));
    runAction(state, bot.id, { type: 'bidSite', companyId: best.c.id, slotId: best.slot.id, amount });
  }
}

/**
 * Gisement libre qu'un bot vise pour une matière (§5.5 bis, §5.8) : celui qui couvre le plus de ses besoins, puis le
 * plus riche (le surplus se revend), puis le premier du catalogue.
 */
function botSlot(state: GameState, c: CompanyState, cid: CommodityId): SiteSlot | undefined {
  const need = commodityNeed(c, cid);
  let best: { slot: SiteSlot; useful: number; capacity: number } | undefined;
  for (const slot of freeSlots(state, cid)) {
    const capacity = slotCapacity(slot.id);
    const useful = Math.min(capacity, need);
    if (!best || useful > best.useful + 1e-9 || (Math.abs(useful - best.useful) <= 1e-9 && capacity > best.capacity)) best = { slot, useful, capacity };
  }
  return best?.slot;
}

/**
 * Trésorerie de la clôture (§5.7) : rien n'est emprunté d'office, alors un bot (ou le pilote automatique) emprunte
 * lui-même ce qui manquera en fin de trimestre, ventes attendues comprises, avec la marge d'un écart type de la
 * demande (sa mise, tout ou rien, ne doit pas tomber pour des ventes un peu décevantes), dans la limite de ce que
 * prêtent les banques.
 */
function coverClose(state: GameState, actorId: Id | null, c: CompanyState): void {
  if (c.status !== 'active') return;
  const plan = planClose(state, c);
  if (!(plan.shortfall > 0 || plan.bids > 0) || !(plan.safeLoan > 0)) return;
  const amount = Math.floor(Math.min(companyLoanLimit(c), plan.safeLoan * 1.02 + 20));
  if (amount >= 1) runAction(state, actorId, { type: 'takeLoan', companyId: c.id, amount });
}

/** Later bots can move input prices after this company chose its selling price. */
function guardUnitCostMargin(state: GameState, c: CompanyState): void {
  // Resolution consumes the shared input inventory in product order. A sibling
  // must not price against cheap lots already reserved by the preceding batch.
  const remaining: CompanyState['inventory'] = Object.fromEntries(Object.entries(c.inventory)
    .filter(([, line]) => line && line.lots > 0)
    .map(([cid, line]) => [cid, line ? { ...line } : line]));
  const incomingCost = new Map<CommodityId, number>();
  const incoming = (cid: CommodityId, unit: number) => incomingCost.set(cid, Math.max(incomingCost.get(cid) ?? 0, unit));
  for (const site of c.sites ?? []) {
    if (!site.dormant && site.activeFrom <= state.turn && site.capacity > 0) incoming(site.commodityId, siteCurrentUnitCost(state, site));
  }
  for (const contract of state.contracts ?? []) {
    if (!(contract.turnsLeft > 0)) continue;
    if (contract.sellerCompanyId === c.id && getOwn(state.companies, contract.buyerCompanyId)?.status === 'active') {
      const line = remaining[contract.commodityId];
      if (line) line.lots = Math.max(0, line.lots - contract.lots);
    }
    if (contract.buyerCompanyId === c.id && getOwn(state.companies, contract.sellerCompanyId)?.status === 'active') incoming(contract.commodityId, contract.price);
  }
  for (const p of c.products) {
    const next = { ...p, capacity: p.capacity > 0 ? p.capacity : p.pendingCapacity };
    const inventory: CompanyState['inventory'] = Object.fromEntries(Object.entries(remaining)
      .map(([cid, line]) => [cid, line ? { ...line, avgCost: Math.max(line.avgCost, incomingCost.get(cid as CommodityId) ?? 0) } : line]));
    const costCompany = { ...c, inventory, products: c.products.map((line) => line.id === p.id ? next : line) };
    // Do not assume a cheap delivery will arrive. Known costly inputs may dominate
    // a smaller financed batch, so do not dilute their cost with cheaper emergency lots.
    const qty = Math.max(1, Math.min(next.production, next.capacity));
    let materialPremium = 0;
    for (const [cid, per] of Object.entries(SECTORS[p.sectorId].inputs) as [CommodityId, number][]) {
      const incomingUnit = incomingCost.get(cid);
      const line = inventory[cid];
      const shortage = Math.max(0, qty * per - Math.max(0, line?.lots ?? 0));
      const bound = Math.max(incomingUnit ?? 0, line?.avgCost ?? 0);
      materialPremium += shortage * Math.max(0, bound - state.commodities[cid].price * EMERGENCY_PURCHASE_PREMIUM) / qty;
    }
    const def = SECTORS[p.sectorId];
    const productionCost = estimatedUnitCost(state, costCompany, next) + materialPremium;
    const productionFloor = p.production > 0 || p.stock <= 0 ? productionCost * BOT_UNIT_COST_MARGIN : 0;
    const stockFloor = p.stock > 0 && def.perishability === 0 ? p.lastUnitCost * BOT_UNIT_COST_MARGIN : 0;
    let costFloor = Math.max(productionFloor, stockFloor);
    const cap = PRICE_MAX_RATIO * SECTORS[p.sectorId].refPrice;
    const production = costFloor > cap ? 0 : p.production;
    if (production === 0 && p.stock > 0) costFloor = stockFloor;
    const price = Math.min(cap, Math.max(p.price, Math.ceil(costFloor * 100) / 100));
    if (price !== p.price || production !== p.production) {
      runAction(state, c.controllerId, { type: 'setProductDecisions', companyId: c.id,
        productId: p.id, price, production });
    }
    // Pending capacity is not installed this quarter; a stopped batch frees its inputs.
    const produced = Math.max(0, Math.floor(Math.min(p.production, p.capacity)));
    for (const [cid, per] of Object.entries(SECTORS[p.sectorId].inputs) as [CommodityId, number][]) {
      const line = remaining[cid];
      if (line) line.lots = Math.max(0, line.lots - produced * per);
    }
  }
}

/** Actions des bots puis du pilote automatique, au début de chaque tour. */
export function runBots(state: GameState): void {
  const bots = Object.values(state.players).filter((p) => p.isBot);
  shuffle(state, bots);
  // Un bot défaillant ne doit jamais bloquer le tour des autres (chaque action est validée avant mutation).
  for (const bot of bots) {
    try {
      botTurn(state, bot);
    } catch {
      /* on passe au suivant */
    }
  }
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active' || c.controllerId !== null) continue;
    try {
      manageCompany(state, null, c, NEUTRAL_PERSONALITY, true);
    } catch {
      /* idem */
    }
  }
  // Once everyone has traded, restore the known cost margin without another
  // strategy/RNG pass. Experts and interns keep their own decision rules.
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    if (c.controllerId !== null) {
      const controller = getOwn(state.players, c.controllerId);
      if (!controller?.isBot || botLevelOf(state, controller) !== 'normal') continue;
    }
    try {
      guardUnitCostMargin(state, c);
    } catch {
      /* as with company management, a failed action cannot block the turn */
    }
  }
  // Une fois que tous ont joué (leurs achats ont pu renchérir les matières), chacun couvre sa clôture.
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    if (c.controllerId !== null && !getOwn(state.players, c.controllerId)?.isBot) continue;
    try {
      coverClose(state, c.controllerId, c);
    } catch {
      /* idem */
    }
  }
}
