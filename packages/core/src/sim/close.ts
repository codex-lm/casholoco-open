import { hexOf } from './hexes';
import { isSpatialMap } from '../content/hexes';
import { terrainMultiplier, effectiveFixedCost } from './terrains';
/**
 * Clôture d'une entreprise (§5.7) : qui est payé, avec quoi, et ce qui ne se fait pas faute d'argent.
 *
 * En tête de clôture, la trésorerie paie les obligations : siège, coûts fixes des produits, entretien des filiales en
 * sommeil, intérêts, impôt et amendes du trimestre précédent ; elle met aussi de côté les achats prévus par contrat.
 * Si elle ne les couvre pas : faillite.
 *
 * Tout le reste se paie avec ce qui reste et les ventes du trimestre : la trésorerie de fin de trimestre ne passe
 * jamais sous zéro. Par ordre de priorité : les mises aux enchères (réglées en fin de trimestre), la production (le
 * stock, puis les filiales, puis les achats d'urgence, plus la main-d'œuvre ; tous les produits réduits dans la même
 * proportion), le marketing et la R&D, enfin l'extraction en surplus des filiales, vers le stock, avec ce qui reste
 * une fois gardé de quoi payer une clôture d'obligations. Quand l'argent manque, le moins prioritaire saute d'abord ;
 * une production qui se vend avec une marge se paie elle-même.
 *
 * Aucun emprunt automatique. Le même calcul sert à la résolution (demande tirée, décisions de tous : ventes exactes)
 * et à la vue du dirigeant (demande attendue, prix connus des rivaux : une estimation, avec une marge d'un écart type
 * de la demande).
 */
import { SECTORS, zoneOf } from '../content';
import type { ClosePlan, CommodityId, CompanyState, GameState, Id, ProductState, SectorId } from '../types';
import { COMMODITY_IDS } from '../types';
import { brandAfter, expectedSectorDemand, onShelf, outsideAttractiveness, productAttractiveness, qualityAfter, shownPrice } from './advice';
import { EMERGENCY_PURCHASE_PREMIUM, GREENWASHING_BONUS, HQ_COST } from './constants';
import { contractPurchases, dormantUpkeep, siteCurrentUnitCost } from './deals';
import { companyInterestRate, hasModifier, laborPerLot } from './finance';
import { pendingHexCommitments, vacantLandUpkeep } from './hexAuctions';
import { budgetFactory, factoryAttractivenessWeight, productProfile, usesIndustryNetwork } from './industry';
import { fin, getOwn } from './util';
import { cityTotals, marketEntry, productAway, productProximity, proximityOf, weightsOf, type MarketEntry } from './regions';
import { siteSupply, transportFactor, transportPerLot, transportPerLotHex } from './transport';
import { hasPlannedSupply, marketDemandMultiplier } from './marketDemand';

/** Intérêts de la clôture ; `extraDebt` : si l'entreprise empruntait encore autant d'ici là. */
function closeInterest(state: GameState, c: CompanyState, extraDebt = 0): number {
  return fin(Math.max(c.debt + extraDebt, 0) * companyInterestRate(state, c, extraDebt));
}

/** Obligations de la clôture : payées en premier, la faillite si la trésorerie ne les couvre pas. */
export function closeObligations(state: GameState, c: CompanyState): ClosePlan['obligations'] {
  let fixed = HQ_COST + dormantUpkeep(c);
  if (usesIndustryNetwork(state)) fixed += vacantLandUpkeep(c);
  for (const p of c.products) fixed += effectiveFixedCost(state, p, c);
  const interest = closeInterest(state, c);
  const taxDue = Math.max(0, fin(c.taxDue ?? 0));
  const finesDue = Math.max(0, fin(c.finesDue ?? 0));
  const contracts = contractPurchases(state, c);
  return { fixed: fin(fixed), interest, taxDue, finesDue, contracts, total: fin(fixed + interest + taxDue + finesDue + contracts) };
}

/**
 * Mises en cours de l'entreprise (pas encore réglées), posées par son dirigeant actuel : celle d'un prédécesseur tombe à
 * la clôture (§5.5 bis), et elle reste secrète.
 */
export function pendingBids(state: GameState, c: CompanyState): number {
  let total = 0;
  for (const b of state.siteBids ?? []) if (b.companyId === c.id && b.playerId === c.controllerId && !b.result) total += Math.max(0, b.amount);
  total += pendingHexCommitments(state, c);
  return total;
}

/** Demande (en lots) qui reviendra au produit `p` si l'entreprise paie la part `m` de son marketing et de sa R&D prévus. */
export type DemandOf = (p: ProductState, m: number) => number;

/**
 * Pour chaque secteur de l'entreprise : la demande, et l'attractivité de tout ce qui n'est pas à elle (§5.2) ;
 * `othersByCity` : la même, ville par ville (ordre de `CITY_IDS`), quand le secteur est régional (§5.2 bis).
 */
export type MarketOutlook = Partial<Record<SectorId, { demand: number; others: number; othersPriceAttractiveness?: number; othersByCity?: number[] }>>;

/** Attractivité d'un produit de l'entreprise après la part `m` de son marketing et de sa R&D prévus (§5.2, §5.4). */
export function plannedAttractiveness(c: CompanyState, p: ProductState, m: number, state?: GameState): number {
  if (!hasPlannedSupply(p)) return 0;
  const green = hasModifier(c, 'greenwashing') ? GREENWASHING_BONUS : 1;
  const profile = productProfile(c, p), payer = budgetFactory(c, p);
  const quality = qualityAfter(p.sectorId, p.quality, Math.max(0, fin(profile?.rnd ?? p.rnd)) * m, state ? terrainMultiplier(state, c, payer, 'rnd') : 1);
  const brand = brandAfter(p.sectorId, p.brand, Math.max(0, fin(profile?.marketing ?? p.marketing)) * m, state ? terrainMultiplier(state, c, payer, 'marketing') : 1);
  return productAttractiveness(p.sectorId, quality, brand, c.reputation, p.price * (state ? terrainMultiplier(state, c, p, 'perceivedPrice') : 1), green) * factoryAttractivenessWeight(c, p);
}

/** Demande de chaque produit de l'entreprise d'après un état du marché : le logit du §5.2. */
export function demandFrom(c: CompanyState, outlook: MarketOutlook, state?: GameState): DemandOf {
  return (p, m) => {
    const o = outlook[p.sectorId];
    const a = plannedAttractiveness(c, p, m, state);
    if (!o || !(a > 0)) return 0;
    let nationalTotal = Math.max(0, o.others);
    let priceMass = o.othersPriceAttractiveness ?? nationalTotal * SECTORS[p.sectorId].refPrice;
    for (const q of c.products) if (q.sectorId === p.sectorId) {
      const own = q.id === p.id ? a : plannedAttractiveness(c, q, m, state);
      nationalTotal += own;
      priceMass += own * q.price;
    }
    const D = Math.max(0, o.demand) * marketDemandMultiplier(p.sectorId, nationalTotal, priceMass);
    if (!o.othersByCity) {
      return (nationalTotal > 0 ? (D * a) / nationalTotal : 0) * (state ? terrainMultiplier(state, c, p, 'demand') : 1);
    }
    // Ville par ville (§5.2 bis) : les produits de l'entreprise pèsent chacun selon la zone de son usine.
    const sid = p.sectorId;
    const own = c.products.filter((q) => q.sectorId === sid).map((q) => ({ a: q.id === p.id ? a : plannedAttractiveness(c, q, m, state), pi: state ? productProximity(state, q, true) : proximityOf(sid, zoneOf(q).id, true) }));
    const w = weightsOf(sid, true);
    const pi = state ? productProximity(state, p, true) : proximityOf(sid, zoneOf(p).id, true);
    let demand = 0;
    for (let k = 0; k < w.length; k++) {
      let total = Math.max(0, o.othersByCity[k]);
      for (const x of own) total += x.a * x.pi[k];
      demand += total > 0 ? (D * w[k] * a * pi[k]) / total : 0;
    }
    return demand * (state ? terrainMultiplier(state, c, p, 'demand') : 1);
  };
}

/**
 * Le marché tel que son dirigeant (ou le pilote automatique) peut le prévoir : la demande attendue, sans le tirage du
 * trimestre, et les produits des autres aux prix qu'il connaît, à leur qualité et leur notoriété publiques (§12).
 */
export function expectedOutlook(state: GameState, c: CompanyState): MarketOutlook {
  const viewer = c.controllerId;
  const out: MarketOutlook = {};
  for (const p of c.products) {
    const sid = p.sectorId;
    if (out[sid]) continue;
    const outside = outsideAttractiveness(sid, state.turn);
    let others = outside;
    let othersPriceAttractiveness = outside * SECTORS[sid].refPrice;
    const rivals: MarketEntry[] = [];
    let regional = c.products.some((q) => q.sectorId === sid && onShelf(q) && productAway(state, q));
    for (const o of Object.values(state.companies)) {
      if (o.status !== 'active' || o.id === c.id) continue;
      const green = viewer !== null && o.controllerId === viewer && hasModifier(o, 'greenwashing') ? GREENWASHING_BONUS : 1;
      for (const q of o.products) {
        if (q.sectorId !== sid || !(viewer !== null && o.controllerId === viewer ? hasPlannedSupply(q) : onShelf(q))) continue;
        const price = shownPrice(state, o, q, viewer);
        const a = productAttractiveness(sid, q.quality, q.brand, o.reputation, price * terrainMultiplier(state, o, q, 'perceivedPrice'), green) * factoryAttractivenessWeight(o, q, viewer !== null && o.controllerId === viewer);
        others += a;
        othersPriceAttractiveness += a * price;
        rivals.push(marketEntry(state, q, a));
        if (a > 0 && productAway(state, q)) regional = true;
      }
    }
    out[sid] = {
      demand: expectedSectorDemand(state, sid, state.turn, viewer),
      others: fin(others),
      othersPriceAttractiveness: fin(othersPriceAttractiveness),
      ...(regional ? { othersByCity: cityTotals(sid, outside, rivals, true).map((x) => fin(x)) } : {}),
    };
  }
  return out;
}

/** Ce que l'entreprise fera du trimestre avec `base` (trésorerie une fois les obligations payées) et ses ventes. */
export interface Operations {
  /** Lots payés, par produit. */
  lots: Record<Id, number>;
  plannedLots: number;
  fundedLots: number;
  plannedCost: number;
  cost: number;
  marketingPlanned: number;
  marketingFunded: number;
  /** Part du marketing et de la R&D payée (0 à 1). */
  marketingScale: number;
  /** Ventes : si tout ce qui est prévu se fait, et avec ce qui sera payé. */
  salesPlanned: number;
  salesFunded: number;
  /** Un écart type de la demande, en ventes (au plan complet). */
  salesRisk: number;
  /** Trésorerie de fin de trimestre avant les mises, avec ce qui sera payé. */
  endCash: number;
  /** Part des mises qu'elle couvre. */
  bidsCovered: number;
  /** Lots à extraire, par filiale (besoins, puis surplus). */
  sites: ClosePlan['sites'];
}

interface SiteLine {
  siteId: Id;
  commodityId: CommodityId;
  capacity: number;
  unit: number;
}

/** Filiales qui extrairont à cette clôture (en service, chantier fini), avec le coût du lot. */
function workingSites(state: GameState, c: CompanyState): SiteLine[] {
  return (c.sites ?? [])
    .filter((s) => !s.dormant && s.activeFrom <= state.turn)
    .map((s) => ({ siteId: s.id, commodityId: s.commodityId, capacity: Math.max(0, Math.floor(s.capacity)), unit: Math.max(0, siteCurrentUnitCost(state, s)) }));
}

/** Points de la grille où l'on cherche la production qui laisse le plus de trésorerie (production invendue). */
const PEAK_GRID = 40;

/**
 * Le trimestre de l'entreprise : `base` est la trésorerie une fois payées les obligations (achats par contrat mis de
 * côté ; négative si le marketing, payé sur les ventes attendues, l'a déjà entamée), `bids` ses mises, `demandOf` la
 * demande de ses produits, `keep` ce que l'extraction en surplus laisse en caisse (une clôture d'obligations). Avec
 * `marketingPaid`, le marketing et la R&D sont déjà payés (résolution) et la demande ne dépend plus de `m`.
 */
export function planOperations(
  state: GameState,
  c: CompanyState,
  base: number,
  bids: number,
  demandOf: DemandOf,
  keep: number,
  marketingPaid = false,
): Operations {
  const products = c.products.map((p) => {
    const def = SECTORS[p.sectorId];
    return {
      p,
      planned: Math.max(0, Math.floor(Math.min(fin(p.production), p.capacity))),
      labor: laborPerLot(state, c, p),
      inputs: def.inputs,
      stock: Math.max(0, p.stock),
      price: Math.max(0, p.price),
      volatility: def.volatility,
    };
  });
  const sites = workingSites(state, c);
  const capacity = {} as Record<CommodityId, number>;
  const unit = {} as Record<CommodityId, number>;
  for (const cid of COMMODITY_IDS) {
    capacity[cid] = 0;
    unit[cid] = 0;
  }
  for (const s of sites) {
    capacity[s.commodityId] += s.capacity;
    unit[s.commodityId] = Math.max(unit[s.commodityId], s.unit);
  }
  const stock = {} as Record<CommodityId, number>;
  const owedOut = {} as Record<CommodityId, number>;
  const comingIn = {} as Record<CommodityId, number>;
  for (const cid of COMMODITY_IDS) {
    stock[cid] = Math.max(0, c.inventory[cid]?.lots ?? 0);
    owedOut[cid] = 0;
    comingIn[cid] = 0;
  }
  for (const k of state.contracts ?? []) {
    if (!(k.turnsLeft > 0)) continue;
    const other = getOwn(state.companies, k.buyerCompanyId === c.id ? k.sellerCompanyId : k.buyerCompanyId);
    if (other?.status !== 'active') continue;
    if (k.buyerCompanyId === c.id) comingIn[k.commodityId] += Math.max(0, k.lots);
    if (k.sellerCompanyId === c.id) owedOut[k.commodityId] += Math.max(0, k.lots);
  }
  let marketingPlanned = 0;
  for (const p of c.products) marketingPlanned += Math.max(0, fin(p.marketing)) + Math.max(0, fin(p.rnd));
  const spend = marketingPaid ? 0 : marketingPlanned;
  const W = Math.max(0, bids);

  /** Ce que les filiales fournissent à la production (transport, §5.8), comme à la résolution. */
  const supply = siteSupply(state, c);
  const carriage = transportFactor(state);
  /** Lots par produit pour une fraction `s` de la production prévue. */
  const lotsAt = (s: number) => products.map((x) => (s >= 1 ? x.planned : Math.floor(x.planned * s + 1e-9)));
  /**
   * Extraction pour les besoins (et les contrats à livrer), coût de la production (main-d'œuvre et transport compris :
   * les lots des filiales servent d'abord la production, filiale par filiale, comme à la résolution, §5.8).
   */
  const costOf = (lots: number[]) => {
    let cost = 0;
    const need = {} as Record<CommodityId, number>;
    for (const cid of COMMODITY_IDS) need[cid] = 0;
    products.forEach((x, i) => {
      cost += lots[i] * x.labor;
      for (const [cid, per] of Object.entries(x.inputs) as [CommodityId, number][]) need[cid] += lots[i] * per;
    });
    const extract = {} as Record<CommodityId, number>;
    for (const cid of COMMODITY_IDS) {
      const wanted = need[cid] + owedOut[cid] - stock[cid] - comingIn[cid];
      extract[cid] = Math.min(capacity[cid], Math.max(0, Math.ceil(wanted - 1e-9)));
      const onHand = stock[cid] + extract[cid];
      const forProduction = onHand - Math.min(owedOut[cid], onHand) + comingIn[cid];
      const emergency = Math.max(0, need[cid] - forProduction);
      cost += extract[cid] * unit[cid] + emergency * state.commodities[cid].price * EMERGENCY_PURCHASE_PREMIUM;
    }
    const transport = isSpatialMap(state.config) ? transportPerLotHex(c, lots, supply, c.products.map(p => hexOf(p, state.config)), carriage) : transportPerLot(c, lots, supply, undefined, carriage);
    products.forEach((_, i) => (cost += lots[i] * transport[i]));
    return { cost: fin(cost), extract };
  };
  // Demande de chaque produit selon la part du marketing payée (mémorisée : la recherche la redemande).
  const wantedCache = new Map<number, number[]>();
  const wantedAt = (m: number) => {
    const key = marketingPaid ? 1 : m;
    let w = wantedCache.get(key);
    if (!w) {
      w = products.map((x) => Math.max(0, demandOf(x.p, key)));
      wantedCache.set(key, w);
    }
    return w;
  };
  const salesOf = (lots: number[], m: number) => {
    const w = wantedAt(m);
    let r = 0;
    products.forEach((x, i) => (r += x.price * Math.min(w[i], x.stock + lots[i])));
    return fin(r);
  };
  /** Trésorerie de fin de trimestre, avant les mises. */
  const endCash = (lots: number[], m: number, cost = costOf(lots).cost) => base - m * spend - cost + salesOf(lots, m);

  // 1. Production : prioritaire sur le marketing (jugée sans lui), elle ne doit ni manger l'argent des mises ni faire
  //    finir le trimestre dans le rouge. Comme elle se vend, elle n'est réduite que si elle coûte plus qu'elle ne
  //    rapporte au trimestre (invendus, prix sous le coût) : dans la même proportion pour tous les produits.
  const full = lotsAt(1);
  const fullCost = costOf(full);
  let lots = full;
  let chosen = fullCost;
  let broke = false;
  if (endCash(full, 0, fullCost.cost) < W - 1e-6) {
    let peakS = 0;
    let peak = endCash(lotsAt(0), 0);
    for (let k = 1; k <= PEAK_GRID; k++) {
      const e = endCash(lotsAt(k / PEAK_GRID), 0);
      if (e > peak + 1e-9) {
        peak = e;
        peakS = k / PEAK_GRID;
      }
    }
    if (peak < -1e-6) {
      // Même sans rien produire, l'extraction promise aux acheteurs de ses contrats dépasse ce qu'on a : on n'extrait
      // que ce qu'on paie (le reste des livraisons manquera, et le dédit sera dû à la clôture suivante).
      broke = true;
      lots = lotsAt(0);
      let budget = Math.max(0, base + salesOf(lots, 0));
      const extract = { ...costOf(lots).extract };
      for (const cid of COMMODITY_IDS) {
        if (unit[cid] > 0) extract[cid] = Math.min(extract[cid], Math.floor((budget + 1e-6) / unit[cid]));
        budget -= extract[cid] * unit[cid];
      }
      chosen = { cost: fin(Math.max(0, base + salesOf(lots, 0)) - budget), extract };
    } else {
      const target = Math.min(W, peak);
      if (endCash(full, 0, fullCost.cost) < target - 1e-6) {
        let lo = peakS;
        let hi = 1;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (endCash(lotsAt(mid), 0) >= target - 1e-6) lo = mid;
          else hi = mid;
        }
        lots = lotsAt(lo);
        chosen = costOf(lots);
      }
    }
  }

  // 2. Marketing et R&D : avec ce que laissent la production et les mises (ce qu'ils rapportent au trimestre compris).
  let m = marketingPaid ? 1 : 0;
  if (!marketingPaid && !broke && spend > 0) {
    const target = Math.max(0, Math.min(W, endCash(lots, 0, chosen.cost)));
    if (endCash(lots, 1, chosen.cost) >= target - 1e-6) m = 1;
    else {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (endCash(lots, mid, chosen.cost) >= target - 1e-6) lo = mid;
        else hi = mid;
      }
      m = lo;
    }
  }

  // 3. Les mises sont réglées avec la trésorerie de fin de trimestre ; l'extraction en surplus prend ce qui reste au-delà
  //    d'une clôture d'obligations (sans quoi une filiale viderait la caisse dont la clôture suivante a besoin).
  const salesFunded = salesOf(lots, m);
  const end = fin(base - m * spend - chosen.cost + salesFunded);
  const bidsCovered = Math.min(W, Math.max(0, end));
  let left = Math.max(0, end - bidsCovered - Math.max(0, keep));
  const lines: ClosePlan['sites'] = [];
  const toPlace = { ...chosen.extract };
  for (const s of sites) {
    const needed = Math.min(s.capacity, toPlace[s.commodityId]);
    toPlace[s.commodityId] -= needed;
    const spare = s.capacity - needed;
    const surplus = s.unit > 0 ? Math.max(0, Math.min(spare, Math.floor((left + 1e-6) / s.unit))) : spare;
    left -= surplus * s.unit;
    lines.push({ siteId: s.siteId, commodityId: s.commodityId, needed, surplus, capacity: s.capacity });
  }

  // Ventes si tout ce qui est prévu se fait, et leur écart type (la demande de chaque secteur, §5.1).
  const w1 = wantedAt(1);
  let salesPlanned = 0;
  let salesRisk = 0;
  products.forEach((x, i) => {
    const r = x.price * Math.min(w1[i], x.stock + full[i]);
    salesPlanned += r;
    salesRisk += r * x.volatility;
  });

  const record: Record<Id, number> = {};
  products.forEach((x, i) => (record[x.p.id] = lots[i]));
  return {
    lots: record,
    plannedLots: full.reduce((a, b) => a + b, 0),
    fundedLots: lots.reduce((a, b) => a + b, 0),
    plannedCost: fullCost.cost,
    cost: chosen.cost,
    marketingPlanned: fin(marketingPlanned),
    marketingFunded: fin(marketingPaid ? marketingPlanned : m * marketingPlanned),
    marketingScale: m,
    salesPlanned: fin(salesPlanned),
    salesFunded,
    salesRisk: fin(salesRisk),
    endCash: end,
    bidsCovered: fin(bidsCovered),
    sites: lines,
  };
}

/** Emprunt qui comble `shortfall`, intérêts de la clôture en plus compris (emprunter x fait monter dette et taux). */
function loanFor(state: GameState, c: CompanyState, shortfall: number, interest: number): number {
  if (!(shortfall > 0)) return 0;
  let loan = shortfall;
  for (let i = 0; i < 20; i++) {
    const next = shortfall + closeInterest(state, c, loan) - interest;
    const done = Math.abs(next - loan) < 0.01;
    loan = next;
    if (done) break;
  }
  return Math.ceil(loan - 1e-9);
}

/** Clôture prévue d'une entreprise si rien ne change d'ici là (vue du dirigeant, bots). */
export function planClose(state: GameState, c: CompanyState): ClosePlan {
  const obligations = closeObligations(state, c);
  const cash = fin(c.cash);
  const bankrupt = cash + 1e-6 < obligations.total;
  const bids = pendingBids(state, c);
  const ops = planOperations(state, c, Math.max(0, cash - obligations.total), bids, demandFrom(c, expectedOutlook(state, c), state), obligations.total);
  // Les obligations se paient d'avance ; le reste, avec les ventes attendues : ce qui manque pour tout faire, puis ce
  // qui manquerait si les ventes déçoivent d'un écart type.
  const gap = bids + ops.plannedCost + ops.marketingPlanned - ops.salesPlanned;
  const shortfall = Math.max(0, fin(obligations.total + Math.max(0, gap) - cash));
  const safeShortfall = Math.max(0, fin(obligations.total + Math.max(0, gap + ops.salesRisk) - cash));
  return {
    cash,
    obligations,
    bids: fin(bids),
    bidsCovered: ops.bidsCovered,
    production: { planned: ops.plannedLots, funded: ops.fundedLots, plannedCost: ops.plannedCost, cost: ops.cost },
    lots: ops.lots,
    marketing: { planned: ops.marketingPlanned, funded: ops.marketingFunded },
    sales: { planned: ops.salesPlanned, funded: ops.salesFunded },
    margin: ops.salesRisk,
    sites: ops.sites,
    shortfall,
    loan: loanFor(state, c, shortfall, obligations.interest),
    safeShortfall,
    safeLoan: loanFor(state, c, safeShortfall, obligations.interest),
    bankrupt,
  };
}
