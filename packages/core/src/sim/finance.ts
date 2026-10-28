import { hexLaborFactor } from './hexes';
import { capitalCellId, isSpatialMap } from '../content/hexes';
import { terrainPlantMultiplier, effectiveHeatCredit } from './terrains';
import { ownedLand } from './industry';
/** Formules financières partagées (§5.6, §5.7, §6). Fonctions pures, sans mutation. */
import { COMMODITIES, SECTORS, zoneOf } from '../content';
import { ZONE_IDS, type CommodityId, type CompanyState, type GameState, type Id, type ModifierKind, type PlayerState, type ProductState, type QuarterReport, type SectorId, type ZoneId } from '../types';
import {
  BASE_TAX_RATE,
  BONUS_CAP,
  CONTROLLED_COLLATERAL_LTV,
  EMERGENCY_PURCHASE_PREMIUM,
  FLOAT_MIN,
  HQ_COST,
  SITE_BOOK_VALUE_RATIO,
  LOAN_BOOK_MULT,
  LOAN_REVENUE_MULT,
  LOSS_MULTIPLE,
  MAX_COMPANY_RATE,
  MAX_PRODUCTS,
  MAX_TAX_RATE,
  OFFSHORING_LABOR_MULT,
  PE_MULTIPLE,
  PERSONAL_LOAN_LTV,
  PERSONAL_LOAN_SPREAD,
  PROFIT_EMA_KEEP,
  RUMOR_CHECK_GREED,
  RUMOR_CHECK_LEAK_PROB,
  RUMOR_CHECK_MIN_COST,
  RUMOR_CHECK_RAMP,
  RUMOR_CHECK_RATE_MAX,
  RUMOR_CHECK_RATE_MIN,
  SCANDAL_RISK_EXPONENT,
  SCANDAL_RISK_FLOOR,
  SCANDAL_RISK_SPAN,
} from './constants';
import { brandAfter, estimateSales, marketInputs, qualityAfter } from './advice';
import { companyTaxRate, effectivePerishability, terrainMultiplier } from './terrains';
import { clamp, fin, getOwn, hashString } from './util';
import { estimatedTransport, estimatedTransportHex, plannedLots, siteSupply, transportFactor, transportPerLot, transportPerLotHex, zoneLaborFactor, type Extraction } from './transport';

export function marketSize(sectorId: SectorId): number {
  const d = SECTORS[sectorId];
  return d.refPrice * d.refDemand;
}

/** Untaxed cash recovered: plant and land at retained book value, stock at half its cost (`rate` overrides the half). */
export function productSalvageValue(
  p: Pick<ProductState, 'sectorId' | 'capacity' | 'pendingCapacity' | 'stock' | 'lastUnitCost' | 'landCost'>,
  hexMode: boolean,
  rate = 0.5,
): number {
  const plant = (p.capacity + p.pendingCapacity) * SECTORS[p.sectorId].capacityCost;
  return fin(rate * (plant + p.stock * p.lastUnitCost + (hexMode ? p.landCost ?? 0 : 0)));
}

/** Published profit with the stock disposal loss and its tax saving removed, for profit-based news. */
export function profitWithoutDisposal(r: Pick<QuarterReport, 'netProfit' | 'exceptionalLoss' | 'exceptionalLossTaxBenefit'>): number {
  return r.netProfit + (r.exceptionalLoss ?? 0) - (r.exceptionalLossTaxBenefit ?? 0);
}

export function hasModifier(c: CompanyState, kind: ModifierKind): boolean {
  return c.modifiers.some((m) => m.kind === kind && m.turnsLeft > 0);
}

/** Actions détenues par des joueurs. */
export function heldShares(c: CompanyState): number {
  let s = 0;
  for (const v of Object.values(c.holdings)) s += v;
  return s;
}

export function floatShares(c: CompanyState): number {
  return Math.max(0, c.sharesOutstanding - heldShares(c));
}

export function marketCap(c: CompanyState): number {
  return fin(c.sharePrice * c.sharesOutstanding);
}

/**
 * bookValue = cash − dette − impôt et amendes dus + Σ inventaire (lots × avgCost) + Σ stock × lastUnitCost
 *           + 0,5 × Σ (capacité + capacité en commande) × capacityCost + 0,5 × Σ prix des filiales
 */
export function bookValue(c: CompanyState): number {
  // L'impôt et les amendes du trimestre clos sont dus à la clôture suivante : des dettes d'ici là (§5.7).
  let v = c.cash - c.debt - Math.max(0, c.taxDue ?? 0) - Math.max(0, c.finesDue ?? 0);
  for (const line of Object.values(c.inventory)) if (line) v += line.lots * line.avgCost;
  for (const p of c.products) {
    const def = SECTORS[p.sectorId];
    v += p.stock * p.lastUnitCost;
    v += 0.5 * (p.capacity + p.pendingCapacity) * def.capacityCost;
    if (!c.land) v += SITE_BOOK_VALUE_RATIO * Math.max(0, fin(p.landCost ?? 0));
  }
  // Filiales : la moitié de leur prix, comme les usines (§5.7).
  if (c.land) for (const parcel of ownedLand(c)) v += SITE_BOOK_VALUE_RATIO * Math.max(0, fin(parcel.cost));
  for (const s of c.sites ?? []) v += SITE_BOOK_VALUE_RATIO * Math.max(0, fin(s.cost ?? 0));
  return fin(v);
}

/**
 * Croissance du CA lissé sur 4 trimestres. L'historique de revenueEma est reconstruit
 * à partir des rapports trimestriels (EMA 0,6/0,4 du CA publié).
 */
export function revenueGrowth(c: CompanyState): number {
  const reps = c.reports;
  if (reps.length < 2) return 0;
  let e = reps[0].revenue;
  const series = [e];
  for (let i = 1; i < reps.length; i++) {
    e = 0.6 * e + 0.4 * reps[i].revenue;
    series.push(e);
  }
  const now = series[series.length - 1];
  const past = series[Math.max(0, series.length - 1 - 4)];
  return clamp(fin(now / Math.max(past, 1) - 1), -0.3, 0.5);
}

/**
 * fondamentale = max(plancher, bookValue + résultats) × (1 + 0,5 × croissance), où le plancher
 * (valeur de liquidation) compte la trésorerie nette à 100 % et les autres actifs à 30 % :
 * plancher = max(cash − dette, 0) + 0,3 × max(bookValue − max(cash − dette, 0), 0) + 500.
 * (Avec un plancher à 0,3 × bookValue, distribuer la trésorerie d'une entreprise déficitaire
 * enrichissait ses actionnaires : le marché ne valorisait son cash qu'à 30 %.)
 */
export function fundamentalValue(c: CompanyState): number {
  const bv = bookValue(c);
  const earnings = c.profitEma >= 0 ? PE_MULTIPLE * c.profitEma : LOSS_MULTIPLE * c.profitEma;
  const netCash = Math.max(0, fin(c.cash - c.debt));
  const floor = netCash + 0.3 * Math.max(0, bv - netCash) + 500;
  const base = Math.max(floor, bv + earnings);
  return fin(base * (1 + 0.5 * revenueGrowth(c)));
}

export function targetSharePrice(state: GameState, c: CompanyState): number {
  const shares = Math.max(c.sharesOutstanding, 1);
  return fin((fundamentalValue(c) / shares) * c.sentiment * state.macro.marketSentiment);
}

/** Taux trimestriel de base effectif (avec les effets de news). */
export function effectiveBaseRate(state: GameState): number {
  let r = state.macro.baseInterestRate;
  for (const e of state.activeEffects) if (e.kind === 'interestRate') r += e.value;
  return clamp(fin(r), 0, 0.2);
}

export function effectiveTaxRate(state: GameState): number {
  let r = Number.isFinite(state.macro.baseTaxRate) ? state.macro.baseTaxRate : BASE_TAX_RATE;
  for (const e of state.activeEffects) if (e.kind === 'taxRate') r += e.value;
  return clamp(fin(r), 0, MAX_TAX_RATE);
}

/**
 * Taux trimestriel d'une entreprise : base × (1 + 0,5 × dette / max(bookValue, 1000)). `extraDebt` : le taux si elle
 * empruntait encore autant (la trésorerie monte d'autant, la valeur comptable ne bouge pas).
 */
export function companyInterestRate(state: GameState, c: CompanyState, extraDebt = 0): number {
  const bv = bookValue(c);
  const rate = effectiveBaseRate(state) * (1 + (0.5 * Math.max(c.debt + extraDebt, 0)) / Math.max(bv, 1000));
  return clamp(fin(rate), 0, MAX_COMPANY_RATE);
}

/** Montant encore empruntable par l'entreprise. */
export function companyLoanLimit(c: CompanyState): number {
  const bv = bookValue(c);
  const cap = Math.max(0, LOAN_REVENUE_MULT * Math.max(c.revenueEma, 0) + LOAN_BOOK_MULT * Math.max(bv, 0));
  return Math.max(0, fin(cap - c.debt));
}

/** k€ empruntés par l'entreprise pendant le tour en cours. */
export function borrowedThisTurn(c: CompanyState): number {
  const b = c.turnFlags?.borrowed;
  return typeof b === 'number' && b > 0 ? b : 0;
}

/**
 * Base du bonus du PDG : cash d'avant les bonus du tour, hors emprunts contractés ce tour
 * (un aller-retour emprunt → bonus → remboursement ne gonfle pas le plafond).
 */
export function bonusBase(c: CompanyState): number {
  const taken = Math.max(0, c.turnFlags?.bonusTaken ?? 0);
  return Math.max(0, c.cash + taken - borrowedThisTurn(c));
}

/** Bonus encore possible ce tour : 10 % de la base (cf. bonusBase), moins ce qui a déjà été pris. */
export function maxBonus(c: CompanyState): number {
  if (c.turnFlags?.justFounded) return 0;
  const taken = Math.max(0, c.turnFlags?.bonusTaken ?? 0);
  return Math.max(0, Math.min(Math.max(c.cash, 0), BONUS_CAP * bonusBase(c) - taken));
}

/** Dividende encore possible : le cash, hors emprunts contractés ce tour (on ne distribue pas l'argent de la banque). */
export function maxDividend(c: CompanyState): number {
  if (c.turnFlags?.justFounded) return 0;
  return Math.max(0, Math.min(c.cash, c.cash - borrowedThisTurn(c)));
}

export function portfolioValue(state: GameState, playerId: Id, price: (c: CompanyState) => number = (c) => c.sharePrice): number {
  let v = 0;
  for (const c of Object.values(state.companies)) {
    const h = getOwn(c.holdings, playerId);
    if (h && h > 0 && c.status === 'active') v += h * price(c);
  }
  return fin(v);
}

/**
 * Cours de référence pour le crédit : le plus bas du cours courant et du dernier cours de résolution.
 * Acheter ses propres actions pendant le tour fait monter le cours, pas la capacité d'emprunt.
 */
export function collateralPrice(c: CompanyState): number {
  const last = c.priceHistory.length > 0 ? c.priceHistory[c.priceHistory.length - 1] : c.sharePrice;
  return Math.max(0, Math.min(c.sharePrice, Number.isFinite(last) ? last : c.sharePrice));
}

export function computeNetWorth(state: GameState, playerId: Id): number {
  const p = getOwn(state.players, playerId);
  if (!p) return 0;
  return fin(p.cash + portfolioValue(state, playerId) - p.debt);
}

/**
 * Tirage propre à un joueur et à un trimestre, dans [0, 1[, par hachage de la graine : ne consomme pas le RNG
 * de la simulation (acheter un tuyau ne change pas la suite de la partie) et reste imprévisible, la graine étant
 * masquée dans la vue.
 */
function playerDraw(state: GameState, playerId: Id, salt: string): number {
  return hashString(`${state.config.seed}|${state.turn}|${playerId}|${salt}`) / 2 ** 32;
}

/**
 * Part de la valeur nette demandée pour un tuyau (§7) : de 2 % au premier vers 5 % à force d'en redemander
 * (asymptote), × l'humeur du journaliste (`greed` dans [0, 1[ : ± 15 %), bornée à [2 %, 5 %].
 */
export function rumorCheckRate(previousChecks: number, greed: number): number {
  const n = Math.max(0, previousChecks);
  const base = RUMOR_CHECK_RATE_MIN + (RUMOR_CHECK_RATE_MAX - RUMOR_CHECK_RATE_MIN) * (1 - Math.exp(-RUMOR_CHECK_RAMP * n));
  return clamp(base * (1 + RUMOR_CHECK_GREED * (2 * greed - 1)), RUMOR_CHECK_RATE_MIN, RUMOR_CHECK_RATE_MAX);
}

/** Tarif d'un tuyau ce trimestre pour ce joueur (k) : part de sa valeur nette à la dernière clôture, 500 k au moins. */
export function rumorCheckPrice(state: GameState, p: PlayerState): number {
  const history = p.netWorthHistory;
  const worth = history.length > 0 ? history[history.length - 1] : computeNetWorth(state, p.id);
  const rate = rumorCheckRate(p.rumorChecks?.length ?? 0, playerDraw(state, p.id, 'tuyau'));
  return fin(Math.max(RUMOR_CHECK_MIN_COST, rate * Math.max(0, Number.isFinite(worth) ? worth : 0)), RUMOR_CHECK_MIN_COST);
}

/** La source parle-t-elle (une fois sur dix) ? Même tirage par hachage, sans RNG. */
export function rumorCheckLeaks(state: GameState, playerId: Id): boolean {
  return playerDraw(state, playerId, 'fuite') < RUMOR_CHECK_LEAK_PROB;
}

/**
 * Plafond de prêt perso : 50 % du portefeuille valorisé au cours de référence (collateralPrice), moins la dette.
 * Les actions des entreprises que le joueur contrôle ne comptent qu'à 25 % : la banque se méfie du PDG
 * qui gage sa propre boîte pour la racheter (§6.4).
 */
export function personalLoanLimit(state: GameState, p: PlayerState): number {
  let collateral = 0;
  for (const c of Object.values(state.companies)) {
    const h = getOwn(c.holdings, p.id);
    if (!h || !(h > 0) || c.status !== 'active') continue;
    const ltv = c.controllerId === p.id ? CONTROLLED_COLLATERAL_LTV : PERSONAL_LOAN_LTV;
    collateral += ltv * h * collateralPrice(c);
  }
  return Math.max(0, fin(collateral - p.debt));
}

/** Probabilité qu'un scandale éclate à la résolution (§8) : clamp((jauge − 10) / 90, 0, 1)^1,5. */
export function scandalProbability(scandal: number): number {
  const x = clamp(fin((scandal - SCANDAL_RISK_FLOOR) / SCANDAL_RISK_SPAN), 0, 1);
  return Math.pow(x, SCANDAL_RISK_EXPONENT);
}

/** k€ de lancements restant à passer en charge dans les prochains comptes de résultat (§5.6). */
export function launchChargesLeft(c: CompanyState): number {
  let left = 0;
  for (const l of c.launchCharges ?? []) left += Math.max(0, l.perTurn) * Math.max(0, l.turnsLeft);
  return fin(left);
}

/** Part des lancements (et filiales) qui passera en charge à la prochaine résolution (§5.6). */
export function launchChargesNext(c: CompanyState): number {
  let next = 0;
  for (const l of c.launchCharges ?? []) if (l.turnsLeft > 0) next += Math.max(0, l.perTurn);
  return fin(next);
}

export function personalInterestRate(state: GameState): number {
  return effectiveBaseRate(state) + PERSONAL_LOAN_SPREAD;
}

/** Multiplicateur de main-d'œuvre (effets de news × délocalisation). */
export function laborMultiplier(state: GameState, c: CompanyState, sectorId: SectorId): number {
  let m = 1;
  for (const e of state.activeEffects) {
    if (e.kind === 'laborCost' && (e.sectorId === 'all' || e.sectorId === sectorId)) m *= e.value;
  }
  if (hasModifier(c, 'offshoring')) m *= OFFSHORING_LABOR_MULT;
  return clamp(fin(m, 1), 0.05, 20);
}

/** Main-d'œuvre d'un lot de ce produit, usine dans `zoneId` (par défaut, sa zone ; capitale × 1, §5.3, §5.8). */
export function laborPerLot(state: GameState, c: CompanyState, p: ProductState, zoneId: ZoneId = zoneOf(p).id): number {
  if (isSpatialMap(state.config)) return laborPerLotHex(state, c, p);
  return SECTORS[p.sectorId].laborCost * laborMultiplier(state, c, p.sectorId) * zoneLaborFactor(state, p.sectorId, zoneId, p.id);
}

/**
 * Coût unitaire estimé pour la production prévue : matières prises dans l'inventaire au coût moyen,
 * le reste en achat d'urgence (prix spot × 1,1), comme à la résolution (§5.3) ; main-d'œuvre de la zone et transport
 * compris (§5.8), l'usine dans `zoneId` (par défaut, la sienne).
 */
export function estimatedUnitCost(state: GameState, c: CompanyState, p: ProductState, zoneId?: ZoneId): number {
  if (isSpatialMap(state.config)) return estimatedUnitCostHex(state, c, p);
  return fin(withMaterials(state, c, p, laborPerLot(state, c, p, zoneId)) + estimatedTransport(state, c, p, zoneId));
}

/** Main-d'œuvre d'un lot, plus les matières de la production prévue (inventaire au coût moyen, le reste en urgence). */
function withMaterials(state: GameState, c: CompanyState, p: ProductState, labor: number): number {
  const def = SECTORS[p.sectorId];
  const qty = Math.max(1, Math.min(fin(p.production), p.capacity));
  let cost = labor;
  for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) {
    const need = per * qty;
    const line = c.inventory[cid];
    const fromInv = line ? Math.min(Math.max(line.lots, 0), need) : 0;
    const spent = fromInv * (line?.avgCost ?? 0) + (need - fromInv) * state.commodities[cid].price * EMERGENCY_PURCHASE_PREMIUM;
    cost += spent / qty;
  }
  return cost;
}

/**
 * Coût unitaire estimé de ce produit si son usine était dans chaque zone (§5.8) : le même calcul
 * qu'`estimatedUnitCost`, avec la production prévue et l'offre des filiales calculées une seule fois.
 */
export function unitCostByZone(state: GameState, c: CompanyState, p: ProductState): Record<ZoneId, number> {
  return unitCostBy(state, c, p, ZONE_IDS, CLASSIC_COST);
}

interface CostLeaves<Position extends string> {
  positionOf: (p: ProductState, state: GameState) => Position;
  transport: (c: CompanyState, lots: number[], supply: Extraction[], positions: Position[], factor: number) => number[];
  estimatedTransport: (state: GameState, c: CompanyState, p: ProductState, position: Position) => number;
  labor: (state: GameState, c: CompanyState, p: ProductState, position: Position) => number;
}

const CLASSIC_COST: CostLeaves<ZoneId> = {
  positionOf: (p) => zoneOf(p).id,
  transport: transportPerLot,
  estimatedTransport,
  labor: laborPerLot,
};
const HEX_COST: CostLeaves<Id> = {
  positionOf: (p, state) => p.hexId ?? capitalCellId(state.config),
  transport: transportPerLotHex,
  estimatedTransport: estimatedTransportHex,
  labor: laborPerLotHex,
};

/** Production et offre communes à toutes les destinations ; seuls les trajets et la main-d'œuvre changent. */
function unitCostBy<Position extends string>(state: GameState, c: CompanyState, p: ProductState, candidates: readonly Position[], leaves: CostLeaves<Position>): Record<Position, number> {
  const i = c.products.indexOf(p);
  const lots = plannedLots(c);
  if (i >= 0) lots[i] = Math.max(1, lots[i]);
  const supply = siteSupply(state, c);
  const factor = transportFactor(state);
  const positions = c.products.map(p => leaves.positionOf(p, state));
  const out = {} as Record<Position, number>;
  for (const z of candidates) {
    let transport: number;
    if (i >= 0) {
      positions[i] = z;
      transport = leaves.transport(c, lots, supply, positions, factor)[i];
    } else transport = leaves.estimatedTransport(state, c, p, z);
    out[z] = fin(withMaterials(state, c, p, leaves.labor(state, c, p, z)) + transport);
  }
  return out;
}

/** Coût unitaire « normal » d'un secteur (prix de base des matières, sans effets). */
export function baseUnitCost(sectorId: SectorId): number {
  const def = SECTORS[sectorId];
  let cost = def.laborCost;
  for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) {
    cost += per * COMMODITIES[cid].basePrice;
  }
  return cost;
}

/**
 * First-year expected earnings under the actual sector defaults and opening
 * competition. Public estimates supply both price elasticities, quality, brand,
 * terrain and production costs. Closing stock is capitalised exactly as in the
 * accounts; the first four quarters use the earnings EMA's own weights.
 * Player terrain advantages enter future results, not initial founder wealth.
 * No random draw or shared state is changed.
 */
export function expectedStartProfits(state: GameState): Record<Id, number> {
  const scenario: GameState = { ...state, activeEffects: [], companies: {} };
  for (const c of Object.values(state.companies)) scenario.companies[c.id] = {
    ...c, terrainId: undefined,
    products: c.products.map((p) => ({ ...p, terrainId: undefined,
      ...(isSpatialMap(state.config) && !c.npcDefId ? { hexId: capitalCellId(state.config) } : {}),
    })), modifiers: [],
  };
  const weighted: Record<Id, number> = Object.fromEntries(Object.keys(scenario.companies).map((id) => [id, 0]));
  let weight = 0;
  for (let turn = 1; turn <= 4; turn++) {
    scenario.turn = turn;
    const advanced: GameState = { ...scenario, companies: {} };
    for (const c of Object.values(scenario.companies)) advanced.companies[c.id] = {
      ...c, products: c.products.map((p) => ({ ...p,
        quality: qualityAfter(p.sectorId, p.quality, p.rnd, terrainMultiplier(scenario, c, p, 'rnd')),
        brand: brandAfter(p.sectorId, p.brand, p.marketing, terrainMultiplier(scenario, c, p, 'marketing')),
      })),
    };
    const outcomes = new Map<string, number>();
    const pretax: Record<Id, number> = Object.fromEntries(Object.keys(scenario.companies).map((id) => [id, -HQ_COST]));
    for (const c of Object.values(scenario.companies)) for (const p of c.products) {
      const unit = estimatedUnitCost(scenario, c, p);
      const market = marketInputs(advanced, advanced.companies[c.id], p, c.controllerId ?? '', unit);
      const estimate = estimateSales(p.sectorId, market, p);
      const endStock = Math.max(0, p.stock + p.production - estimate.sales) * (1 - effectivePerishability(scenario, p));
      pretax[c.id] += estimate.margin + (endStock - p.stock) * unit;
      outcomes.set(p.id, estimate.sales);
    }
    const w = Math.pow(PROFIT_EMA_KEEP, 4 - turn);
    for (const c of Object.values(scenario.companies)) {
      const net = pretax[c.id] - Math.max(0, pretax[c.id]) * companyTaxRate(scenario, c);
      weighted[c.id] += w * net;
    }
    weight += w;
    for (const c of Object.values(scenario.companies)) for (const p of c.products) {
      p.stock = Math.max(0, p.stock + p.production - outcomes.get(p.id)!) * (1 - effectivePerishability(scenario, p));
      p.quality = qualityAfter(p.sectorId, p.quality, p.rnd, terrainMultiplier(scenario, c, p, 'rnd'));
      p.brand = brandAfter(p.sectorId, p.brand, p.marketing, terrainMultiplier(scenario, c, p, 'marketing'));
    }
  }
  return Object.fromEntries(Object.entries(weighted).map(([id, profit]) => [id, fin(profit / weight)]));
}

/** Single-company convenience; game creation uses the shared projection once. */
export function expectedStartProfit(state: GameState, company: CompanyState): number {
  return expectedStartProfits(state)[company.id] ?? 0;
}

export function lastReport(c: CompanyState) {
  return c.reports.length > 0 ? c.reports[c.reports.length - 1] : undefined;
}

/** Nombre maximal de produits actifs d'une entreprise : 4, ou 6 pour une entreprise issue d'une fusion (§7). */
export function maxProductsOf(c: CompanyState): number {
  return Math.max(MAX_PRODUCTS, c.productSlots ?? MAX_PRODUCTS);
}

/**
 * Flottant minimal (§6.2) : vrai si un actionnaire qui détiendrait `holding` actions sur `shares` dépasserait
 * 50 % + 1 action alors que le flottant (`float`) tomberait sous FLOAT_MIN (40 %) du capital.
 */
export function breachesFloatMin(holding: number, float: number, shares: number): boolean {
  return holding > Math.floor(shares / 2) + 1 && float < FLOAT_MIN * shares - 1e-6;
}

/** Plus grand rachat d'actions (≤ `wanted`) que le flottant minimal autorise (§6.2). */
export function maxBuybackShares(c: CompanyState, wanted: number): number {
  const float = floatShares(c);
  const top = Math.max(0, ...Object.values(c.holdings));
  const breach = (k: number) => breachesFloatMin(top, float - k, c.sharesOutstanding - k);
  let lo = 0;
  let hi = Math.max(0, Math.min(Math.floor(wanted), float));
  if (!breach(hi)) return hi;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (breach(mid)) hi = mid - 1;
    else lo = mid;
  }
  return lo;
}

/** Main-d'œuvre nette de la chaleur revendue par lot produit. La chaleur ne dépend pas des multiplicateurs de salaires. */
export function laborPerLotHex(state: GameState, c: CompanyState, p: ProductState, hexId: Id = p.hexId ?? capitalCellId(state.config)): number {
  return SECTORS[p.sectorId].laborCost * laborMultiplier(state, c, p.sectorId) * hexLaborFactor(state, p.sectorId, hexId, p.id) * terrainPlantMultiplier(state, { ...p, hexId }, 'labor') - effectiveHeatCredit(state, { ...p, hexId });
}

export function estimatedUnitCostHex(state: GameState, c: CompanyState, p: ProductState, hexId: Id = p.hexId ?? capitalCellId(state.config)): number {
  return fin(withMaterials(state, c, p, laborPerLotHex(state, c, p, hexId)) + estimatedTransportHex(state, c, p, hexId));
}

/** Même coût qu'estimatedUnitCostHex, pour la liste de cases de l'appelant (toutes les cases libres pour les vues, les candidates pour les bots). */
export function unitCostByHex(state: GameState, c: CompanyState, p: ProductState, candidates: readonly Id[]): Record<Id, number> {
  return unitCostBy(state, c, p, candidates, HEX_COST);
}
