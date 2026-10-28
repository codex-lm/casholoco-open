import { basin, hexOf, proximityOfHex } from './hexes';
import { isSpatialMap } from '../content/hexes';
import { terrainMultiplier, effectivePerishability, companyTaxRate, addScandal, revokeTerrain } from './terrains';
/**
 * Résolution d'un tour (§5, §6, §8) puis démarrage du suivant ou fin de partie (§11).
 *
 * Ordre : obligations (siège, coûts fixes, intérêts, impôt et amendes du trimestre précédent ; faillite si la
 * trésorerie ne les couvre pas) → demande → ce que chacun pourra payer avec sa trésorerie et ses ventes (close.ts) →
 * marketing/R&D → demande de chaque produit → production décidée → filiales (besoins) et contrats → production →
 * ventes → enchères (trésorerie de fin de trimestre) → extraction en surplus → charges du compte de résultat (coûts
 * fixes, charges étalées, intérêts) → scandales et ententes (amendes dues à la clôture suivante) → réputation → impôt
 * (dû à la clôture suivante) et compte de résultat → matières premières → intérêts perso → décompte des
 * modificateurs/effets → capacité livrée
 * → cours de bourse → appels de marge → contrôle → historiques → valeur nette.
 */
import { COMMODITIES, getContent, SECTORS, zoneOf } from '../content';
import { COMMODITY_IDS, SECTOR_IDS, type CityId, type CommodityId, type CompanyState, type GameState, type PlayerState, type ProductReport, type ProductState, type QuarterReport, type SectorId } from '../types';
import {
  CARTEL_FINE_MIN,
  CARTEL_FINE_RATIO,
  CARTEL_SCANDAL,
  COMMODITY_CAP_RATIO,
  COMMODITY_FLOOR_RATIO,
  DEMAND_MEAN_REVERSION,
  EMERGENCY_PURCHASE_PREMIUM,
  GREENWASHING_BONUS,
  LOBBYING_MULT,
  MARGIN_CALL_LTV,
  PRICE_FLOOR,
  PRICE_NOISE,
  PROFIT_EMA_KEEP,
  REPUTATION_DRIFT,
  REPUTATION_MAX,
  REPUTATION_MIN,
  SCANDAL_DECAY,
  SCANDAL_FINE_BASE,
  SCANDAL_FINE_FLAT,
  SCANDAL_REPUTATION,
  SCANDAL_RESET,
  SCANDAL_SENTIMENT,
  SENTIMENT_DECAY,
  SENTIMENT_MAX,
  SENTIMENT_MIN,
} from './constants';
import { brandAfter, outsideAttractiveness, outsideQuality, productAttractiveness, qualityAfter, sectorNewsMultiplier } from './advice';
import { updateCryptoMarket } from './cryptoMarket';
import { checkControl } from './control';
import { closeObligations, demandFrom, pendingBids, planOperations, plannedAttractiveness, type DemandOf, type MarketOutlook, type Operations } from './close';
import { awardSites, cartelMembers, cartelQuarters, cartelRisk, contractPurchases, deliverContracts, pruneCartels, runSites, siteCurrentUnitCost } from './deals';
import {
  computeNetWorth,
  hasModifier,
  laborMultiplier,
  laborPerLot,
  personalInterestRate,
  scandalProbability,
  targetSharePrice,
} from './finance';
import { langOf, tr } from './i18n';
import { currentIssue, headlineText, makeArticle, body } from './journal';
import { executeShareSell, shareSellQuote } from './market';
import { next, normal } from './rng';
import { sanitizeState } from './sanitize';
import { computeResults } from './trophies';
import { buildResultArticles, emptyTurnLog, startTurn, type TurnLog } from './turn';
import { clamp, controllerOf, fin } from './util';
import { byCity, cityTotals, isRegional, marketEntry, productProximity, proximityOf, weightsOf, type MarketEntry } from './regions';
import { siteSupply, transportBreakdown, transportBreakdownHex, transportFactor, transportPerLot, transportPerLotHex, zoneLaborFactor } from './transport';
import { awardHexes } from './hexAuctions';
import { realizeHexFactory, realizeHexLaunch } from './actions';
import { budgetFactory, factoryAttractivenessWeight, ownedLand, productProfile, syncProductProfiles, usesIndustryNetwork } from './industry';
import { settlementArticle } from './terrainNews';
import { engineDiagnostics } from './sanitize';
import { hasPlannedSupply, marketDemandMultiplier } from './marketDemand';
import { closeRecap } from './closeRecap';

interface Acc {
  revenue: number;
  cogs: number;
  marketing: number;
  rnd: number;
  fixed: number;
  amortization: number;
  special: number;
  exceptionalLoss: number;
  interest: number;
  fines: number;
  products: ProductReport[];
}

/** Résout le tour en cours et renvoie le journal de résolution (utile aux tests et à la simulation). */
export function resolveTurnWithLog(state: GameState): TurnLog | null {
  if (state.phase !== 'playing') return null;
  const t = state.turn;
  const log = emptyTurnLog(t);
  log.closeBefore = Object.fromEntries(Object.values(state.companies).map((c) => [c.id,
    { scandal: c.scandal, reputation: c.reputation, sharePrice: c.priceHistory.at(-1) ?? c.sharePrice }]));
  log.fineCauses = {};
  log.offers = structuredClone(state.offers ?? []);
  // Keep the final delivery and contracts ended by bankruptcy, even though the live list removes them.
  const closingContracts = (state.contracts ?? []).map((contract) => ({ contract,
    playerIds: [state.companies[contract.sellerCompanyId]?.controllerId, state.companies[contract.buyerCompanyId]?.controllerId]
      .filter((id): id is string => typeof id === 'string'), delivered: false }));
  // Les offres entre joueurs ne valent que pour le trimestre qui se clôt (§7 bis).
  if (state.offers) state.offers = [];

  // 0. Obligations (§5.7) : siège, coûts fixes des produits, entretien des filiales en sommeil, intérêts, impôt et
  //    amendes du trimestre précédent, achats par contrat (mis de côté, payés à la livraison). Payées en premier ; une
  //    entreprise dont la trésorerie ne les couvre pas fait faillite (le dirigeant en était prévenu pendant le tour).
  //    Les faillites se décident d'un bloc, sans dépendre de l'ordre des entreprises : d'abord celles qui ne couvrent
  //    même pas leurs obligations hors achats par contrat (leurs livraisons ne compteront pas chez leurs acheteurs),
  //    puis, ensemble, celles qui ne couvrent pas leurs obligations avec ces achats.
  const hexCellsFreedByBankruptcy = isSpatialMap(state.config) ? new Set<string>() : undefined;
  const fail = (list: CompanyState[]) => {
    for (const c of list) {
      if (c.controllerId !== null) log.leaders[c.id] = c.controllerId;
      if (hexCellsFreedByBankruptcy) for (const p of c.products) {
        if (p.hexId) hexCellsFreedByBankruptcy.add(p.hexId);
        if (p.pendingHexId) hexCellsFreedByBankruptcy.add(p.pendingHexId);
      }
      if (hexCellsFreedByBankruptcy) for (const parcel of ownedLand(c)) hexCellsFreedByBankruptcy.add(parcel.hexId);
      goBankrupt(state, c);
      log.bankruptcies.push(c.id);
    }
  };
  const solvent = () => Object.values(state.companies).filter((c) => c.status === 'active');
  fail(
    solvent().filter((c) => {
      const ob = closeObligations(state, c);
      return c.cash + 1e-6 < ob.total - ob.contracts;
    }),
  );
  fail(solvent().filter((c) => c.cash + 1e-6 < closeObligations(state, c).total));
  const paidFixed = new Map<string, number>();
  const paidInterest = new Map<string, number>();
  // Une clôture d'obligations : ce que l'extraction en surplus laisse en caisse pour la suivante (§5.5 bis).
  const keepFor = new Map<string, number>();
  for (const c of solvent()) {
    const ob = closeObligations(state, c);
    c.cash -= ob.fixed + ob.interest + ob.taxDue + ob.finesDue;
    delete c.taxDue;
    delete c.finesDue;
    paidFixed.set(c.id, ob.fixed);
    paidInterest.set(c.id, ob.interest);
    keepFor.set(c.id, ob.total);
  }

  const companies = Object.values(state.companies).filter((c) => c.status === 'active');
  const acc = new Map<string, Acc>();
  for (const c of companies) acc.set(c.id, { revenue: 0, cogs: 0, marketing: 0, rnd: 0, fixed: 0, amortization: 0, special: 0, exceptionalLoss: 0, interest: 0, fines: 0, products: [] });
  const A = (c: CompanyState) => acc.get(c.id) as Acc;
  const producedNow = new Map<string, number>();
  /** Détail du fret par lot réellement produit ce trimestre (§5.8), y compris les produits intangibles. */
  const transportNow = new Map<string, ReturnType<typeof transportBreakdown>[number]>();
  // Valeur du stock de produits finis en début de résolution (pour le coût des ventes).
  const stockValueBefore = new Map<string, number>();
  for (const c of companies) for (const p of c.products) stockValueBefore.set(p.id, Math.max(0, p.stock) * p.lastUnitCost);

  // 1. Demande des secteurs (§5.1)
  const demand = {} as Record<SectorId, number>;
  for (const sid of SECTOR_IDS) {
    const def = SECTORS[sid];
    const s = state.sectors[sid];
    s.demandMultiplier = clamp(
      fin(Math.pow(Math.max(s.demandMultiplier, 1e-3), DEMAND_MEAN_REVERSION) * Math.exp(normal(state) * def.volatility), 1),
      0.2,
      5,
    );
    let D = def.refDemand * s.demandMultiplier * Math.pow(1 + def.growth, t - 1);
    for (const e of state.activeEffects) if (e.kind === 'sectorDemand' && (e.sectorId === sid || e.sectorId === 'all')) D *= sectorNewsMultiplier(sid, e.value);
    for (const c of companies) {
      for (const m of c.modifiers) if (m.kind === 'lobbying' && m.sectorId === sid && m.turnsLeft > 0) D *= m.value ?? LOBBYING_MULT;
    }
    s.outsideQuality = outsideQuality(sid, t);
    demand[sid] = Math.max(0, fin(D));
  }

  // 1 bis. Ce que chacun pourra payer (§5.7, close.ts) : le reste du trimestre se paie avec la trésorerie (achats par
  //        contrat mis de côté) et les ventes. Le marketing et la R&D se décident ici, avant les ventes qu'ils font : les
  //        produits des autres sont supposés recevoir tout leur marketing prévu. Le prix moyen et la demande sont
  //        recalculés une fois tous les budgets payés ; les ventes finales déterminent la production finançable.
  const fullAtt = new Map<string, number>();
  const sectorFull = {} as Record<SectorId, number>;
  const sectorFullPrice = {} as Record<SectorId, number>;
  const fullEntries = {} as Record<SectorId, MarketEntry[]>;
  for (const sid of SECTOR_IDS) {
    sectorFull[sid] = outsideAttractiveness(sid, t);
    sectorFullPrice[sid] = sectorFull[sid] * SECTORS[sid].refPrice;
    fullEntries[sid] = [];
  }
  for (const c of companies) {
    for (const p of c.products) {
      const att = plannedAttractiveness(c, p, 1, state);
      fullAtt.set(p.id, att);
      sectorFull[p.sectorId] += att;
      sectorFullPrice[p.sectorId] += att * p.price;
      fullEntries[p.sectorId].push(marketEntry(state, p, att));
    }
  }
  // Ville par ville quand une usine du secteur est hors de la capitale (§5.2 bis).
  const fullByCity: Partial<Record<SectorId, number[]>> = {};
  for (const sid of SECTOR_IDS) {
    if (isRegional(fullEntries[sid])) fullByCity[sid] = cityTotals(sid, outsideAttractiveness(sid, t), fullEntries[sid], true);
  }
  const bidsOf = new Map<string, number>();
  for (const c of companies) bidsOf.set(c.id, pendingBids(state, c));
  const marketingPlans = new Map<string, Operations>();
  for (const c of companies) {
    const outlook: MarketOutlook = {};
    for (const p of c.products) {
      const cities = fullByCity[p.sectorId];
      const o = (outlook[p.sectorId] ??= { demand: demand[p.sectorId], others: sectorFull[p.sectorId], othersPriceAttractiveness: sectorFullPrice[p.sectorId], ...(cities ? { othersByCity: [...cities] } : {}) });
      o.others -= fullAtt.get(p.id) ?? 0;
      o.othersPriceAttractiveness! -= (fullAtt.get(p.id) ?? 0) * p.price;
      if (o.othersByCity) {
        const own = fullAtt.get(p.id) ?? 0;
        const pi = productProximity(state, p, true);
        for (let k = 0; k < o.othersByCity.length; k++) o.othersByCity[k] -= own * pi[k];
      }
    }
    const base = Math.max(0, c.cash - contractPurchases(state, c));
    marketingPlans.set(c.id, planOperations(state, c, base, bidsOf.get(c.id) ?? 0, demandFrom(c, outlook, state), keepFor.get(c.id) ?? 0));
  }

  // 2. Marketing et R&D, payés maintenant, dans la limite du plan (§5.4, §5.6)
  let cryptoMarketingSpent = 0;
  for (const c of companies) {
    const a = A(c);
    const ctrl = controllerOf(state, c);
    const scale = (marketingPlans.get(c.id) as Operations).marketingScale;
    for (const p of c.products) {
      const m = Math.max(0, fin(p.marketing)) * scale;
      const r = Math.max(0, fin(p.rnd)) * scale;
      c.cash -= m + r;
      a.marketing += m;
      if (p.sectorId === 'crypto') cryptoMarketingSpent += m;
      a.rnd += r;
      if (budgetFactory(c, p).id === p.id) {
        p.brand = brandAfter(p.sectorId, p.brand, m, terrainMultiplier(state, c, p, 'marketing'));
        p.quality = qualityAfter(p.sectorId, p.quality, r, terrainMultiplier(state, c, p, 'rnd'));
        const profile = productProfile(c, p);
        if (profile) { profile.brand = p.brand; profile.quality = p.quality; }
      }
      if (ctrl) {
        ctrl.stats.marketingSpent += m;
        ctrl.stats.rndSpent += r;
      }
    }
    syncProductProfiles(c);
  }

  // 2 bis. Demande qui revient à chaque produit, marketing payé (logit du §5.2) : elle décide la production, puis les
  //        ventes. Un produit lancé ce tour (capacité en commande, ni stock) n'est pas encore en rayon : il ne prend
  //        aucune part de la demande (§7). Quand une usine du secteur est hors de la capitale, le logit se fait ville
  //        par ville (§5.2 bis) ; sinon, un seul marché national, le calcul d'avant.
  const wantedOf = new Map<string, number>();
  /** Demande de chaque produit, ville par ville (ordre de `CITY_IDS`), dans les secteurs régionaux. */
  const wantedByCity = new Map<string, number[]>();
  for (const sid of SECTOR_IDS) {
    const entries: (MarketEntry & { id: string; price: number; demandMultiplier: number })[] = [];
    for (const c of companies) {
      const green = hasModifier(c, 'greenwashing') ? GREENWASHING_BONUS : 1;
      for (const p of c.products) {
        if (p.sectorId !== sid) continue;
        entries.push({ id: p.id, price: p.price, demandMultiplier: terrainMultiplier(state, c, p, 'demand'), ...marketEntry(state, p, hasPlannedSupply(p) ? productAttractiveness(sid, p.quality, p.brand, c.reputation, p.price * terrainMultiplier(state, c, p, 'perceivedPrice'), green) * factoryAttractivenessWeight(c, p) : 0) });
      }
    }
    const regional = isRegional(entries);
    const outside = outsideAttractiveness(sid, t);
    let nationalTotal = outside;
    let priceMass = outside * SECTORS[sid].refPrice;
    for (const e of entries) {
      nationalTotal += e.a;
      priceMass += e.a * e.price;
    }
    const priceMultiplier = marketDemandMultiplier(sid, nationalTotal, priceMass);
    demand[sid] = Math.max(0, fin(demand[sid] * priceMultiplier));
    state.sectors[sid].lastMarketPriceMultiplier = priceMultiplier;
    const w = weightsOf(sid, regional);
    const total = cityTotals(sid, outside, entries, regional);
    for (const e of entries) {
      const pi = e.hexId !== undefined ? proximityOfHex(sid, e.hexId, regional) : proximityOf(sid, e.zoneId, regional);
      const split = w.map((wk, k) => (total[k] > 0 ? (demand[sid] * wk * e.a * pi[k]) / total[k] : 0) * e.demandMultiplier);
      let want = 0;
      for (const x of split) want += x;
      wantedOf.set(e.id, want);
      if (regional) wantedByCity.set(e.id, split);
    }
  }
  const wantedFor: DemandOf = (p) => wantedOf.get(p.id) ?? 0;

  // 2 ter. Production de chacun au vu de ses ventes (§5.7), puis extraction des filiales pour ses besoins et ceux des
  //        contrats à livrer, et livraisons des contrats (§5.5 bis, §7 bis)
  const prodPlans = new Map<string, Operations>();
  for (const c of companies) {
    // Pas de plancher à zéro : le marketing payé sur les ventes attendues peut avoir mis la caisse dans le rouge.
    const base = c.cash - contractPurchases(state, c);
    prodPlans.set(c.id, planOperations(state, c, base, bidsOf.get(c.id) ?? 0, wantedFor, keepFor.get(c.id) ?? 0, true));
  }
  const neededLots = new Map<string, number>();
  for (const c of companies) for (const s of (prodPlans.get(c.id) as Operations).sites) neededLots.set(`${c.id}|${s.siteId}`, s.needed);
  // Ce que les filiales fournissent à la production (transport, §5.8), sur l'état d'avant les livraisons, comme le plan.
  const supplyFor = new Map(companies.map((c) => [c.id, siteSupply(state, c)]));
  const carriage = transportFactor(state);
  runSites(state, companies, (c, siteId) => neededLots.get(`${c.id}|${siteId}`) ?? 0);
  deliverContracts(state);
  log.contracts = closingContracts.map(({ contract, playerIds }) => ({ contract: structuredClone(contract), playerIds,
    delivered: state.companies[contract.sellerCompanyId]?.status === 'active'
      && state.companies[contract.buyerCompanyId]?.status === 'active' }));

  // 3. Production (§5.3) : les lots décidés. Si une livraison a manqué, on ne produit que ce que paient la trésorerie et
  //    les ventes (la trésorerie de fin de trimestre ne passe pas sous zéro, ou le moins possible).
  for (const c of companies) {
    const a = A(c);
    const ctrl = controllerOf(state, c);
    const plan = prodPlans.get(c.id) as Operations;
    let cut = plan.fundedLots < plan.plannedLots;
    const decided = c.products.map((p) => Math.max(0, Math.floor(plan.lots[p.id] ?? 0)));
    const lotsAt = (s: number) => decided.map((n) => (s >= 1 ? n : Math.floor(n * s + 1e-9)));
    // Trésorerie de fin de trimestre si l'on produit ces lots : main-d'œuvre, achats d'urgence au-delà du stock,
    // transport (§5.8), ventes.
    const supply = supplyFor.get(c.id) ?? [];
    const endWith = (lots: number[]) => {
      let out = 0;
      let sales = 0;
      const left = new Map<CommodityId, number>();
      const transport = isSpatialMap(state.config) ? transportPerLotHex(c, lots, supply, c.products.map(p => hexOf(p, state.config)), carriage) : transportPerLot(c, lots, supply, undefined, carriage);
      c.products.forEach((p, i) => {
        const def = SECTORS[p.sectorId];
        out += isSpatialMap(state.config)
          ? lots[i] * laborPerLot(state, c, p)
          : lots[i] * def.laborCost * laborMultiplier(state, c, p.sectorId) * zoneLaborFactor(state, p.sectorId, zoneOf(p).id, p.id);
        for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) {
          const have = left.get(cid) ?? Math.max(0, c.inventory[cid]?.lots ?? 0);
          const need = lots[i] * per;
          const fromStock = Math.min(have, need);
          left.set(cid, have - fromStock);
          out += (need - fromStock) * state.commodities[cid].price * EMERGENCY_PURCHASE_PREMIUM;
        }
        out += lots[i] * transport[i];
        sales += Math.max(0, p.price) * Math.min(wantedFor(p, 1), Math.max(0, p.stock) + lots[i]);
      });
      return c.cash - out + sales;
    };
    let lots = decided;
    if (decided.some((n) => n > 0) && endWith(decided) < -1e-6) {
      // La plus grande part qui finit le trimestre à flot, sinon celle qui laisse le moins de dette envers soi-même.
      let best = 0;
      let bestEnd = endWith(lotsAt(0));
      let afloat = -1;
      for (let k = 0; k <= 40; k++) {
        const e = endWith(lotsAt(k / 40));
        if (e >= -1e-6) afloat = k / 40;
        if (e > bestEnd) {
          bestEnd = e;
          best = k / 40;
        }
      }
      lots = lotsAt(afloat >= 0 ? afloat : best);
      cut = true;
    }
    const freight = isSpatialMap(state.config) ? transportBreakdownHex(c, lots, supply, c.products.map(p => hexOf(p, state.config)), carriage) : transportBreakdown(c, lots, supply, undefined, carriage);
    const transportPer = freight.map((detail) => detail.total);
    c.products.forEach((p, i) => {
      const def = SECTORS[p.sectorId];
      const qty = lots[i];
      const labor1 = laborPerLot(state, c, p);
      let materials = 0;
      let cashOut = 0;
      for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) {
        const need = qty * per;
        if (!(need > 0)) continue;
        const line = c.inventory[cid];
        const fromInv = line ? Math.min(line.lots, need) : 0;
        if (line && fromInv > 0) {
          materials += fromInv * line.avgCost;
          line.lots -= fromInv;
          if (line.lots <= 1e-6) delete c.inventory[cid];
        }
        const shortfall = need - fromInv;
        if (shortfall > 1e-9) {
          const cost = shortfall * state.commodities[cid].price * EMERGENCY_PURCHASE_PREMIUM;
          materials += cost;
          cashOut += cost;
        }
        if (cid === 'oil' && ctrl) ctrl.stats.oilConsumed += need;
      }
      const labor = qty * labor1;
      // Fret absolu (§5.8) : acheminement des matières et livraison, capitale comprise.
      const transport = qty * transportPer[i];
      cashOut += labor;
      cashOut += transport;
      c.cash -= cashOut;
      a.cogs += labor + materials + transport + (stockValueBefore.get(p.id) ?? 0);
      producedNow.set(p.id, qty);
      if (qty > 0) transportNow.set(p.id, freight[i]);
      p.lastProduced = qty;
      if (qty > 0) p.lastUnitCost = fin((labor + materials + transport) / qty);
    });
    if (cut) log.productionCuts.push(c.id);
  }

  // 4. Ventes par secteur (§5.2) : la demande calculée en 2 bis
  for (const sid of SECTOR_IDS) {
    const def = SECTORS[sid];
    const s = state.sectors[sid];
    const D = demand[sid];
    for (const c of companies) {
      for (const p of c.products) {
        if (p.sectorId !== sid) continue;
        const wanted = wantedOf.get(p.id) ?? 0;
        const qty = producedNow.get(p.id) ?? 0;
        const available = Math.max(0, p.stock) + qty;
        const sold = Math.max(0, Math.min(wanted, available));
        const revenue = fin(sold * p.price);
        c.cash += revenue;
        const a = A(c);
        a.revenue += revenue;
        p.stock = Math.max(0, fin((available - sold) * (1 - effectivePerishability(state, p))));
        // Coût des ventes = production + stock initial − stock final (valorisé au dernier coût unitaire).
        a.cogs -= p.stock * p.lastUnitCost;
        p.lastSales = sold;
        // Une relocalisation gagnée aux enchères s'exécute après les ventes de cette clôture.
        p.lastSalesOrigin = isSpatialMap(state.config)
          ? { turn: state.turn, zoneId: basin(hexOf(p, state.config)), hexId: hexOf(p, state.config) }
          : { turn: state.turn, zoneId: zoneOf(p).id };
        p.lastRevenue = revenue;
        // Prix rendu public pour le tour suivant (décisions cachées jusqu'à la résolution, §12).
        p.lastPrice = p.price;
        p.lastMarketShare = D > 0 ? clamp(sold / D, 0, 1) : 0;
        // Ventes par ville (§5.2 bis), au prorata de la demande de chaque ville.
        const split = wantedByCity.get(p.id);
        const cities: Record<CityId, number> | undefined = split && wanted > 0 ? byCity(split.map((x) => fin((sold * x) / wanted))) : undefined;
        if (cities) p.lastSalesByCity = cities;
        else delete p.lastSalesByCity;
        a.products.push({
          productId: p.id,
          ...(usesIndustryNetwork(state) && p.hexId ? { hexId: p.hexId } : {}),
          name: p.name,
          sectorId: sid,
          produced: qty,
          sold,
          revenue,
          marketShare: p.lastMarketShare,
          unitCost: p.lastUnitCost,
          demand: wanted,
          averagePrice: p.price,
          margin: fin(revenue - (qty * p.lastUnitCost + (stockValueBefore.get(p.id) ?? 0) - p.stock * p.lastUnitCost)),
          stockLeft: p.stock,
          spoiled: Math.max(0, fin(available - sold - p.stock)),
          ...(transportNow.has(p.id) ? {
            ...(transportNow.get(p.id)!.total !== 0 ? { transport: fin(transportNow.get(p.id)!.total) } : {}),
            transportMaterials: fin((producedNow.get(p.id) ?? 0) * transportNow.get(p.id)!.materialsCost),
            transportDelivery: fin((producedNow.get(p.id) ?? 0) * transportNow.get(p.id)!.deliveryCost),
            freight: transportNow.get(p.id)!,
          } : {}),
          ...(cities ? { byCity: cities } : {}),
        });
      }
    }
    s.lastTotalDemand = D;
    s.demandHistory.push(D);
  }
  updateCryptoMarket(state, cryptoMarketingSpent);

  // 4 bis. Enchères de filiales, réglées en fin de trimestre avec la trésorerie d'après les ventes ; la filiale gagnée
  //        produit à partir de la résolution suivante (§5.5 bis).
  log.siteAwards = awardSites(state);
  const hexLaunches: { company: CompanyState; product: ProductState }[] = [];
  if (isSpatialMap(state.config)) {
    log.hexLaunchArticles = [];
    log.hexAwards = awardHexes(state, (s, company, project, hexId) => {
      const product = realizeHexLaunch(s, company, project, hexId);
      hexLaunches.push({ company, product });
      return product;
    }, hexCellsFreedByBankruptcy, (s, company, source, hexId) => {
      const product = realizeHexFactory(s, company, source, hexId);
      hexLaunches.push({ company, product });
      return product;
    });
  }

  // 4 ter. Extraction en surplus, vers le stock, avec ce qui reste une fois gardé de quoi payer une clôture
  //        d'obligations (§5.5 bis)
  const surplusLots = new Map<string, number>();
  for (const c of companies) {
    let budget = Math.max(0, c.cash - (keepFor.get(c.id) ?? 0));
    for (const line of (prodPlans.get(c.id) as Operations).sites) {
      const site = (c.sites ?? []).find((x) => x.id === line.siteId);
      if (!site) continue;
      const unit = siteCurrentUnitCost(state, site);
      const spare = Math.max(0, line.capacity - line.needed);
      const n = unit > 0 ? Math.max(0, Math.min(spare, Math.floor((budget + 1e-6) / unit))) : spare;
      budget -= n * unit;
      surplusLots.set(`${c.id}|${line.siteId}`, n);
    }
  }
  runSites(state, companies, (c, siteId) => surplusLots.get(`${c.id}|${siteId}`) ?? 0);

  // 5. Coûts fixes (par produit + frais de siège + entretien des filiales en sommeil, §5.5 bis) : payés en tête de
  //    clôture avec les obligations, ils entrent ici dans le compte de résultat.
  for (const c of companies) A(c).fixed = paidFixed.get(c.id) ?? 0;

  // 5 bis. Charges sans sortie de trésorerie ce trimestre (déjà payées pendant le tour) : quart du coût des
  //        lancements des 4 derniers trimestres, actions discutables et communication de crise du tour (§5.6).
  for (const c of companies) {
    let amortization = 0;
    for (const l of c.launchCharges ?? []) {
      if (l.turnsLeft > 0) {
        amortization += Math.max(0, l.perTurn);
        l.turnsLeft -= 1;
      }
    }
    if (c.launchCharges) {
      c.launchCharges = c.launchCharges.filter((l) => l.turnsLeft > 0);
      if (c.launchCharges.length === 0) delete c.launchCharges;
    }
    A(c).amortization = fin(amortization);
    A(c).special = Math.max(0, fin(c.turnFlags?.specialCharges ?? 0));
    A(c).exceptionalLoss = Math.max(0, fin(c.turnFlags?.exceptionalLoss ?? 0));
  }

  // 6. Intérêts de la dette d'entreprise (§5.7), payés en tête de clôture sur la dette de début de clôture
  for (const c of companies) A(c).interest = paidInterest.get(c.id) ?? 0;

  // 7. Scandales (§8)
  for (const c of companies) {
    const p = scandalProbability(c.scandal);
    if (p > 0 && next(state) < p) {
      const scandalBefore = c.scandal, reputationBefore = c.reputation;
      // Dans les comptes du trimestre, payée à la clôture suivante (§5.7).
      const fine = fin((SCANDAL_FINE_BASE + c.scandal / 500) * Math.max(c.cash, 0) + SCANDAL_FINE_FLAT);
      c.finesDue = fin((c.finesDue ?? 0) + fine);
      A(c).fines += fine;
      c.sentiment = clamp(c.sentiment * SCANDAL_SENTIMENT, SENTIMENT_MIN, SENTIMENT_MAX);
      c.reputation = clamp(c.reputation + SCANDAL_REPUTATION, REPUTATION_MIN, REPUTATION_MAX);
      c.scandal = SCANDAL_RESET;
      (log.fineCauses![c.id] ??= []).push({ cause: 'scandal', amount: fine,
        scandalBefore, scandalAfter: c.scandal, reputationBefore, reputationAfter: c.reputation,
        ...(c.turnFlags.shadyDone.length ? { shadyActions: [...c.turnFlags.shadyDone] } : {}) });
      const ctrl = controllerOf(state, c);
      if (ctrl) {
        ctrl.stats.scandals += 1;
        ctrl.stats.finesPaid += fine;
      }
      log.scandals.push({ companyId: c.id, fine });
    } else {
      c.scandal = Math.max(0, c.scandal - SCANDAL_DECAY);
    }
  }

  // 7 bis. Ententes sur les prix (§7 bis) : chacune peut être découverte ; ses membres (y compris ceux qui ont
  // demandé à sortir ce trimestre) paient alors 15 % de leur chiffre d'affaires du trimestre dans le secteur (300 k
  // au moins) et prennent +20 de jauge de scandale.
  pruneCartels(state);
  for (const k of [...(state.cartels ?? [])]) {
    const members = cartelMembers(state, k);
    if (!(next(state) < cartelRisk(members.length, cartelQuarters(members)))) continue;
    let total = 0;
    for (const c of members) {
      const revenue = A(c).products.filter((p) => p.sectorId === k.sectorId).reduce((sum, p) => sum + p.revenue, 0);
      const fine = fin(Math.max(CARTEL_FINE_MIN, CARTEL_FINE_RATIO * revenue));
      const scandalBefore = c.scandal;
      c.finesDue = fin((c.finesDue ?? 0) + fine);
      A(c).fines += fine;
      addScandal(state, c, CARTEL_SCANDAL);
      (log.fineCauses![c.id] ??= []).push({ cause: 'cartel', amount: fine, sectorId: k.sectorId,
        scandalBefore, scandalAfter: c.scandal, reputationBefore: c.reputation, reputationAfter: c.reputation });
      total += fine;
      const ctrl = controllerOf(state, c);
      if (ctrl) ctrl.stats.finesPaid += fine;
    }
    log.cartels.push({
      sectorId: k.sectorId,
      companyIds: members.map((c) => c.id),
      leaderIds: members.map((c) => c.controllerId).filter((id): id is string => id !== null),
      fines: total,
    });
    state.cartels = (state.cartels ?? []).filter((x) => x !== k);
  }
  // Les ententes restées secrètes vieillissent : chaque clôture passée en entente pèse sur le risque à venir, même
  // après l'avoir quittée (sinon quitter puis reformer l'entente à chaque trimestre effacerait tout). Puis les
  // sorties demandées pendant le trimestre prennent effet.
  const colluders = new Set((state.cartels ?? []).flatMap((k) => cartelMembers(state, k)));
  for (const c of colluders) c.cartelQuarters = (c.cartelQuarters ?? 0) + 1;
  for (const k of state.cartels ?? []) k.members = k.members.filter((m) => !m.leaving);
  pruneCartels(state);

  // 8. Réputation : retour vers 1 de 0,02 par tour
  for (const c of companies) {
    const r = c.reputation;
    c.reputation = clamp(r < 1 ? Math.min(1, r + REPUTATION_DRIFT) : Math.max(1, r - REPUTATION_DRIFT), REPUTATION_MIN, REPUTATION_MAX);
  }

  // 9. Impôt et compte de résultat (§5.6)
  const drafts = new Map<string, QuarterReport>();
  for (const c of companies) {
    const a = A(c);
    const pretax = a.revenue - a.cogs - a.marketing - a.rnd - a.fixed - a.amortization - a.special - a.interest - a.fines - a.exceptionalLoss;
    const rate = companyTaxRate(state, c);
    const tax = Math.max(0, pretax) * rate;
    const exceptionalLossTaxBenefit = Math.max(0, pretax + a.exceptionalLoss) * rate - tax;
    // Dans les comptes du trimestre, payé en tête de la clôture suivante (§5.7) : une dette d'ici là.
    if (tax > 0) c.taxDue = fin(tax);
    const net = fin(pretax - tax);
    // Les marchés lissent le résultat courant : ni amendes ni perte de stock à l'arrêt dans profitEma.
    // Les lancements étalés, actions discutables et com' de crise, eux, y entrent (§5.6).
    const recurring = pretax + a.fines + a.exceptionalLoss;
    const recurringNet = fin(recurring - Math.max(0, recurring) * rate);
    // Dernier trimestre : profitEma est figé, sinon couper marketing et R&D à la clôture gonflerait la
    // valorisation finale (×40 sur un trimestre « maquillé »). Le cash économisé compte déjà dans la valeur comptable.
    if (t < state.config.totalTurns) {
      c.profitEma = fin(PROFIT_EMA_KEEP * c.profitEma + (1 - PROFIT_EMA_KEEP) * recurringNet);
    }
    c.revenueEma = fin(0.6 * c.revenueEma + 0.4 * a.revenue);
    drafts.set(c.id, {
      turn: t,
      revenue: a.revenue,
      cogs: a.cogs,
      marketing: a.marketing,
      rnd: a.rnd,
      fixedCosts: a.fixed,
      interest: a.interest,
      fines: a.fines,
      ...(a.amortization > 0 ? { amortization: a.amortization } : {}),
      ...(a.special > 0 ? { specialCharges: a.special } : {}),
      ...(a.exceptionalLoss > 0 ? { exceptionalLoss: a.exceptionalLoss } : {}),
      ...(exceptionalLossTaxBenefit > 0 ? { exceptionalLossTaxBenefit } : {}),
      tax,
      netProfit: net,
      cashEnd: 0,
      debtEnd: 0,
      products: a.products,
    });
  }

  // 10. Matières premières (§5.5)
  for (const cid of COMMODITY_IDS) {
    const def = COMMODITIES[cid];
    const cs = state.commodities[cid];
    let eq = def.basePrice;
    for (const e of state.activeEffects) if (e.kind === 'commoditySupply' && e.commodityId === cid) eq *= e.value;
    const price = Math.max(cs.price, def.basePrice * COMMODITY_FLOOR_RATIO);
    const nextPrice = price * Math.exp(normal(state) * def.volatility) * Math.pow(eq / price, def.meanReversion);
    cs.price = clamp(fin(nextPrice, def.basePrice), def.basePrice * COMMODITY_FLOOR_RATIO, def.basePrice * COMMODITY_CAP_RATIO);
    cs.priceHistory.push(cs.price);
  }

  // 11. Intérêts des prêts personnels (§6.4)
  const personalRate = personalInterestRate(state);
  for (const p of Object.values(state.players)) {
    if (!(p.debt > 0)) continue;
    const interest = fin(p.debt * personalRate);
    p.cash -= interest;
    if (p.quarterPersonalCosts !== undefined) p.quarterPersonalCosts += interest;
    if (p.quarterPersonalCostDetails !== undefined) p.quarterPersonalCostDetails.interest += interest;
    if (p.cash < 0) {
      p.debt += -p.cash;
      p.cash = 0;
    }
  }

  // Le déplacement hexagonal prend effet après la production, les ventes et l'impôt du trimestre.
  if (isSpatialMap(state.config)) for (const c of companies) for (const p of c.products) {
    if (!p.pendingHexId) continue;
    revokeTerrain(state, c, p);
    p.hexId = p.pendingHexId;
    delete p.pendingHexId;
    if (p.incubator) delete p.incubator;
    else engineDiagnostics.factoryMoves++;
  }

  // 12. Décompte des modificateurs d'entreprise et des effets de news
  for (const c of Object.values(state.companies)) {
    for (const m of c.modifiers) m.turnsLeft -= 1;
    c.modifiers = c.modifiers.filter((m) => m.turnsLeft > 0);
  }
  for (const e of state.activeEffects) e.turnsLeft -= 1;
  state.activeEffects = state.activeEffects.filter((e) => e.turnsLeft > 0);

  // The following issue announces only privileges still active after this close's moves and effect countdown.
  for (const { company, product } of hexLaunches) {
    log.hexLaunchArticles!.push(settlementArticle(state, company, product, false, t + 1) ?? makeArticle(state, {
      title: headlineText(state, 'hexProductLaunch', {
        company: company.name, product: product.name, sector: getContent(langOf(state)).sectors[product.sectorId].name,
      }),
      body: body(state, 'hexProductLaunch', product.id), tone: 'good', kind: 'flash',
      companyIds: [company.id], sectorIds: [product.sectorId],
      event: { type: 'productLaunch', actorId: company.controllerId ?? undefined, productId: product.id },
    }));
  }

  // 13. Comptes du trimestre (les faillites se décident en tête de clôture, sur les obligations, §5.7)
  for (const c of companies) {
    // Funding searches accept a 1e-6 k€ arithmetic tolerance; settle that sub-cent residue at zero.
    // Larger deficits remain visible rather than being hidden by a blanket cash clamp.
    if (c.cash < 0 && c.cash >= -1e-6) c.cash = 0;
    const draft = drafts.get(c.id) as QuarterReport;
    draft.cashEnd = c.cash;
    draft.debtEnd = c.debt;
    c.reports.push(draft);
    if (c.controllerId !== null) log.leaders[c.id] = c.controllerId;
  }

  // 14. Capacité commandée livrée
  for (const c of companies) {
    for (const p of c.products) {
      p.capacity += p.pendingCapacity;
      p.pendingCapacity = 0;
    }
  }

  // 15. Cours de bourse (§6.1). À la dernière résolution, le cours de clôture est la cible elle-même
  //     (sans l'inertie de 0,5 × cours précédent) : un gonflement du cours pendant le dernier tour ne compte pas.
  const closing = t >= state.config.totalTurns;
  for (const c of Object.values(state.companies)) {
    if (c.status === 'bankrupt') {
      c.sharePrice = 0;
      continue;
    }
    if (c.status !== 'active') continue;
    const target = targetSharePrice(state, c);
    const anchor = closing ? target : 0.5 * c.sharePrice + 0.5 * target;
    const price = anchor * Math.exp(normal(state) * PRICE_NOISE);
    c.sharePrice = Math.max(PRICE_FLOOR, fin(price, PRICE_FLOOR));
    c.sentiment = clamp(1 + (c.sentiment - 1) * SENTIMENT_DECAY, SENTIMENT_MIN, SENTIMENT_MAX);
  }
  state.macro.marketSentiment = clamp(1 + (state.macro.marketSentiment - 1) * SENTIMENT_DECAY, SENTIMENT_MIN, SENTIMENT_MAX);

  // 16. Appels de marge (§6.4)
  for (const p of Object.values(state.players)) {
    const positions = Object.values(state.companies).map((c) => ({ companyId: c.id, shares: c.holdings[p.id] ?? 0 }));
    const sold = marginCall(state, p);
    if (sold !== null) {
      log.marginCalls.push({ playerId: p.id, sold });
      for (const position of positions) {
        const shares = position.shares - (state.companies[position.companyId].holdings[p.id] ?? 0);
        if (shares > 0) (log.forcedShareSales ??= []).push({ turn: t, playerId: p.id, companyId: position.companyId, shares });
      }
    }
  }

  // 17. Contrôle (un contrôleur liquidé à zéro action passe la main)
  for (const c of Object.values(state.companies)) checkControl(state, c);

  // 18. Historiques des cours
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'merged') c.priceHistory.push(c.sharePrice);
  }

  // 19. Valeur nette et pire perte entre deux fins de tour
  for (const p of Object.values(state.players)) {
    const nw = computeNetWorth(state, p.id);
    const prev = p.netWorthHistory.length > 0 ? p.netWorthHistory[p.netWorthHistory.length - 1] : undefined;
    if (prev !== undefined) p.stats.worstTurnLoss = Math.max(p.stats.worstTurnLoss, fin(prev - nw));
    p.netWorthHistory.push(nw);
  }

  sanitizeState(state);

  // Capture the same closing fortune as the history, before startTurn publishes news or runs bots.
  for (const p of Object.values(state.players)) {
    p.closeRecap = closeRecap(state, p, log);
    p.quarterPersonalCosts = 0;
    p.quarterPersonalCostDetails = { interest: 0, tips: 0, whistleblowing: 0 };
    delete p.openingFortuneSnapshot;
  }

  // 20. Fin de partie ou tour suivant
  if (t >= state.config.totalTurns) {
    finishGame(state, log);
  } else {
    state.turn = t + 1;
    startTurn(state, log);
    sanitizeState(state);
  }
  return log;
}

function goBankrupt(state: GameState, c: CompanyState): void {
  revokeTerrain(state, c);
  for (const p of c.products) delete p.pendingHexId;
  const ctrl = controllerOf(state, c);
  if (ctrl) ctrl.stats.bankruptcies += 1;
  c.status = 'bankrupt';
  c.sharePrice = 0;
  c.products = [];
  delete c.land;
  delete c.productProfiles;
  c.inventory = {};
  c.modifiers = [];
  delete c.launchCharges;
  delete c.taxDue;
  delete c.finesDue;
  // Ses filiales retournent aux enchères (§5.5 bis).
  delete c.sites;
  c.controllerId = null;
}

/**
 * Appel de marge (§6.4) si dette > 80 % × (portefeuille + cash). Le cash rembourse d'abord ; puis ventes forcées,
 * ligne par ligne en commençant par les plus petites participations (en % du capital, donc à faible impact),
 * en ne vendant que le nécessaire. Le seuil est évalué au cours d'avant l'appel : l'impact de prix ne pèse que
 * sur la recette, ce qui évite la spirale où chaque vente d'une grosse ligne creuse l'écart. Sur une ligne,
 * on ne vend jamais plus de 20 % du capital (au-delà, vendre n'améliore plus l'écart). Si l'écart subsiste,
 * la dette reste et l'appel se renouvelle à la résolution suivante.
 * Renvoie le montant vendu, ou null s'il n'y a pas eu d'appel de marge.
 */
export function marginCall(state: GameState, p: PlayerState): number | null {
  const ref = new Map<string, number>();
  const lines: CompanyState[] = [];
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    ref.set(c.id, c.sharePrice);
    if ((c.holdings[p.id] ?? 0) >= 1) lines.push(c);
  }
  const portfolio = () => {
    let v = 0;
    for (const c of lines) v += (c.holdings[p.id] ?? 0) * (ref.get(c.id) ?? 0);
    return v;
  };
  const excess = () => p.debt - MARGIN_CALL_LTV * (portfolio() + Math.max(p.cash, 0));
  if (!(p.debt > 0) || !(excess() > 1e-6)) return null;
  let sold = 0;
  let repaid = 0;
  const repay = () => {
    const r = Math.min(Math.max(p.cash, 0), p.debt);
    p.cash -= r;
    p.debt -= r;
    repaid += r;
    if (p.debt < 1e-6) p.debt = 0;
  };
  repay();
  const frac = (c: CompanyState) => (c.holdings[p.id] ?? 0) / Math.max(c.sharesOutstanding, 1);
  lines.sort((a, b) => frac(a) - frac(b) || (b.holdings[p.id] ?? 0) * b.sharePrice - (a.holdings[p.id] ?? 0) * a.sharePrice);
  for (const c of lines) {
    const e0 = excess();
    if (!(e0 > 1e-6)) break;
    const held = c.holdings[p.id] ?? 0;
    const price0 = ref.get(c.id) ?? 0;
    if (held < 1 || !(price0 > 0)) continue;
    // Amélioration de l'écart en vendant n actions : recette (avec impact) − 80 % de leur valeur au cours de référence.
    const gain = (n: number) => shareSellQuote(c, n).total - MARGIN_CALL_LTV * n * price0;
    const nMax = Math.max(1, Math.min(held, Math.floor((1 - MARGIN_CALL_LTV) * c.sharesOutstanding)));
    if (!(gain(nMax) > 0)) continue;
    let n = nMax;
    if (gain(nMax) >= e0) {
      let lo = 1;
      let hi = nMax;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (gain(mid) >= e0) hi = mid;
        else lo = mid + 1;
      }
      n = lo;
    }
    // Une vente forcée n'est pas un délit d'initié : elle ne va pas au registre.
    const q = executeShareSell(state, p, c, n, { record: false });
    sold += q.total;
    repay();
  }
  repay();
  // Un joueur déjà ruiné (ni cash ni actions) ne fait pas la une à chaque tour.
  return sold > 0 || repaid > 0 ? sold : null;
}

function finishGame(state: GameState, log: TurnLog): void {
  state.phase = 'finished';
  for (const p of Object.values(state.players)) p.ready = false;
  // Les résultats du dernier trimestre complètent le dernier numéro.
  const issue = currentIssue(state);
  if (issue) {
    const res = buildResultArticles(state, log);
    issue.articles.push(...res.bankruptcyArticles, ...res.others);
  }
  state.results = computeResults(state);
  if (issue && state.results.ranking.length > 0) {
    const winner = state.players[state.results.ranking[0].playerId];
    issue.articles.push(
      makeArticle(state, {
        title: tr(state).finalTitle(winner.name, state.results.ranking[0].netWorth),
        body: body(state, 'finalEdition'),
        tone: 'good',
        kind: 'results',
      }),
    );
  }
  sanitizeState(state);
}
