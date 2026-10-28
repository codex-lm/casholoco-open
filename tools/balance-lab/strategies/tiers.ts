/**
 * Quatre stratégies de niveau croissant, écrites comme des humains de plus en plus bons.
 *
 *   novice     : règle prix et production au jugé (±10 %, usine à fond). Rien d'autre.
 *   casual     : tâtonnement de prix sur les ventes, marketing/R&D modérés, achète ses matières
 *                quand elles ne sont pas chères, parie un peu sur les actions qui montent.
 *   competent  : modèle de demande (logit du §5.2, calculable depuis la vue) pour arbitrer marge et
 *                parts de marché, capacité ajustée à la demande, dette gérée, bonus/dividendes raisonnables,
 *                consolidation du contrôle et défense anti-OPA.
 *   expert     : tout ça, plus :
 *                - pondère chaque décision par ce qu'elle rapporte au score final (cash × 1, bénéfice
 *                  lissé × 40 × poids de l'EMA : un bénéfice du T15 vaut ~9 fois un bénéfice du T1) ;
 *                - lit le journal : carnet de rumeurs appris (quelle rumeur annonce quelle news), fiabilité
 *                  « faible » = toujours fausse ; spécule sur les matières et le sentiment de marché ;
 *                - valorise chaque entreprise cotée depuis ses comptes publics, achète les sous-évaluées,
 *                  lance des OPA quand le contrôle est à portée et que la cible vaut le prix, puis fusionne ;
 *                - levier personnel plafonné ; actions discutables dosées pour que la jauge reste ≤ 20 à la
 *                  résolution (zéro risque d'éclatement), en rachetant la jauge avec la com' de crise ;
 *                - fin de partie : coupe marketing/R&D quand ils ne paient plus, optimisation fiscale au dernier
 *                  trimestre qui compte dans profitEma, arbitrage du cours de clôture (= cible sans inertie).
 *
 * Règles du banc : uniquement la vue (getPlayerView), les règles publiques (GAME_DESIGN.md) et les données
 * statiques de contenu (SECTORS, COMMODITIES ; et, pour l'expert, le texte des rumeurs, qu'un joueur
 * chevronné finit par connaître par cœur). Hasard : ctx.rng uniquement. Actions : api.act.
 *
 * Lancer : tsx strategies/tiers.ts [nbGraines]
 */
import { hasKnownSupply, marketDemandMultiplier } from '../../../packages/core/src/sim/marketDemand';
import { brandAfter, outsideAttractiveness, productAttractiveness, qualityAfter, sectorNewsMultiplier } from '../../../packages/core/src/sim/advice';
import {
  runTournament,
  formatReport,
  passive,
  me,
  myCompanies,
  activeCompanies,
  sectorOf,
  mean,
  type Strategy,
  type StrategyApi,
  type StrategyCtx,
  type TournamentResult,
} from '../harness';
import {
  SECTORS,
  COMMODITIES,
  getContent,
  SECTOR_IDS,
  type PlayerView,
  type CompanyView,
  type ProductView,
  type SectorId,
  type CommodityId,
  type NewsEffect,
  type ShadyKind,
} from '../../../packages/core/src/index';

// ===========================================================================
// Constantes des règles (GAME_DESIGN.md) : ce qu'un joueur lit dans les règles
// ===========================================================================

import { CRISIS_COMMS_SCANDAL as CORE_CRISIS_SCANDAL, PRICE_MAX_RATIO, PRICE_MIN_RATIO } from '../../../packages/core/src/sim/constants';
const HQ_COST = 250; // §5.3 frais de siège
const MKT_SCALE = 0.02; // §5.4
const RND_SCALE = 0.05; // §5.4
const EMERGENCY = 1.1; // §5.3 achat d'urgence
const PE = 40; // §6.1 multiple des bénéfices
const EMA_NEW = 0.2; // §5.6 poids du dernier trimestre dans profitEma
const SAFE_SCANDAL = 15; // §8 (lot 1) : p = ((s − 10)/90)^1.5 → 1,3 % à 15, 3,7 % à 20
const CRISIS_COST = 400; // §7
const CRISIS_DROP = -CORE_CRISIS_SCANDAL; // −13 depuis la mesure finale // lot 1 : −15, une seule par entreprise et par tour
/** lot 1 : une charge ponctuelle de x k (action discutable, com' de crise) passe dans le résultat du tour. */
const plCost = (x: number, w: number) => x * (1 + Math.max(0, w - 1) * 0.75);
/** Jauge encore disponible ce tour, com' de crise (si pas encore faite) comprise. */
function scandalRoom(c: CompanyView, allowCrisis: boolean): number {
  if (!c.private) return 0;
  const crisis = allowCrisis && !c.private.turnFlags.crisisDone && c.cash > CRISIS_COST + 200 ? CRISIS_DROP : 0;
  return SAFE_SCANDAL + crisis - c.private.scandal;
}
const SHADY: Record<ShadyKind, { cost: number; scandal: number }> = {
  lobbying: { cost: 1000, scandal: 10 },
  tax_optimisation: { cost: 300, scandal: 15 },
  greenwashing: { cost: 500, scandal: 10 },
  industrial_espionage: { cost: 1000, scandal: 20 },
  offshoring: { cost: 800, scandal: 15 },
  smear_campaign: { cost: 500, scandal: 20 },
};

// ===========================================================================
// Aides génériques
// ===========================================================================

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const marketSize = (sid: SectorId) => SECTORS[sid].refPrice * SECTORS[sid].refDemand;
const turnsLeft = (v: PlayerView) => v.config.totalTurns - v.turn; // 0 au dernier tour
const isLast = (v: PlayerView) => v.turn >= v.config.totalTurns;

function reserveOf(c: CompanyView): number {
  let fixed = HQ_COST;
  for (const p of c.products) fixed += SECTORS[p.sectorId].fixedCost;
  return 1000 + 2 * fixed;
}

/**
 * Clôture (§5.7) : rien n'est emprunté d'office. En fin de tour, comme un joueur qui lit le bandeau « trésorerie
 * insuffisante », on emprunte ce qu'il propose (intérêts en plus compris), dans la limite du plafond.
 */
function coverClose(api: StrategyApi): void {
  for (const c of myCompanies(api.view())) {
    const loan = Math.min(c.private?.closePlan?.loan ?? 0, Math.floor(c.private?.loanLimit ?? 0));
    if (loan >= 1) api.act({ type: 'takeLoan', companyId: c.id, amount: loan });
  }
}
const held = (c: CompanyView, id: string) => c.holdings[id] ?? 0;
const frac = (c: CompanyView, id: string) => held(c, id) / Math.max(c.sharesOutstanding, 1);

/** Coût d'achat de n actions au flottant (§6.2). */
function buyCost(c: CompanyView, n: number): number {
  return c.sharePrice * (1 + n / (2 * c.sharesOutstanding)) * n;
}
function sharesFor(c: CompanyView, budget: number): number {
  if (!(budget > 0) || !(c.sharePrice > 0)) return 0;
  const S = c.sharesOutstanding;
  const n = S * (Math.sqrt(1 + (2 * budget) / (c.sharePrice * S)) - 1);
  return Math.max(0, Math.floor(n * 0.999));
}
/** Plus gros actionnaire joueur autre que moi. */
function biggestOther(c: CompanyView, myId: string): { id: string; shares: number } {
  let best = { id: '', shares: 0 };
  for (const [pid, h] of Object.entries(c.holdings)) if (pid !== myId && h > best.shares) best = { id: pid, shares: h };
  return best;
}
/** Coût unitaire sans stock de matières (spot × 1,1 + main-d'œuvre). */
function spotUnitCost(v: PlayerView, sid: SectorId): number {
  const def = SECTORS[sid];
  let cost = def.laborCost;
  for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) {
    cost += per * (v.commodities.find((x) => x.id === cid)!.price * EMERGENCY);
  }
  return cost;
}
function commodityPrice(v: PlayerView, cid: CommodityId) {
  return v.commodities.find((x) => x.id === cid)!.price;
}

/** Besoins de matières d'une entreprise pour une production donnée par produit. */
function needsFor(c: CompanyView, production: (p: ProductView) => number): Map<CommodityId, number> {
  const needs = new Map<CommodityId, number>();
  for (const p of c.products) {
    const q = production(p);
    for (const [cid, per] of Object.entries(SECTORS[p.sectorId].inputs) as [CommodityId, number][]) {
      needs.set(cid, (needs.get(cid) ?? 0) + q * per);
    }
  }
  return needs;
}

/** Achat de matières au marché, en respectant la liquidité (et en restant sous le budget). */
function buyMaterials(api: StrategyApi, c: CompanyView, cid: CommodityId, lots: number, budget: number, maxShareOfLiquidity: number) {
  const liq = COMMODITIES[cid].liquidity;
  let n = Math.floor(Math.min(lots, liq * maxShareOfLiquidity));
  const v = api.view();
  const price = commodityPrice(v, cid);
  while (n >= 1 && price * (1 + n / (2 * liq)) * n > budget) n = Math.floor(n * 0.7);
  if (n >= 1) api.act({ type: 'buyCommodity', companyId: c.id, commodityId: cid, lots: n });
}

// ===========================================================================
// Modèle de demande (§5.1-5.2) : tout est calculable depuis la vue publique
// ===========================================================================

function outsideAtt(sid: SectorId, turn: number): number {
  return outsideAttractiveness(sid, turn);
}
function attractiveness(sid: SectorId, q: number, b: number, rep: number, price: number, green = 1): number {
  return productAttractiveness(sid, q, b, rep, price, green);
}
const nextBrand = (b: number, m: number, sid: SectorId) => brandAfter(sid, b, m);
const nextQuality = (q: number, r: number, sid: SectorId) => qualityAfter(sid, q, r);

/** Demande totale attendue pour la résolution du tour courant (même formule que §5.1, effets estimés). */
function expectedDemand(v: PlayerView, sid: SectorId, turnOffset = 0): number {
  const def = SECTORS[sid];
  const s = sectorOf(v, sid);
  const t = v.turn + turnOffset;
  const dm = Math.pow(Math.max(s.demandMultiplier, 1e-3), Math.pow(0.85, turnOffset + 1));
  let D = def.refDemand * dm * Math.pow(1 + def.growth, t - 1);
  // Effets de news / lobbying actifs au dernier tour : ratio observé, amorti (ils expirent).
  if (s.lastTotalDemand > 0 && v.turn >= 2) {
    const prevBase = def.refDemand * s.demandMultiplier * Math.pow(1 + def.growth, v.turn - 2) * (s.lastMarketPriceMultiplier ?? 1);
    const ratio = clamp(s.lastTotalDemand / Math.max(prevBase, 1e-6), 0.6, 1.7);
    D *= Math.pow(ratio, turnOffset === 0 ? 0.6 : 0.2);
  }
  return D;
}

/** Attractivité cumulée des autres produits du secteur (prix déjà fixés par les bots ce tour). */
function othersAtt(v: PlayerView, sid: SectorId, excludeId: string, qualityDrift = 1.02): number {
  let A = outsideAtt(sid, v.turn);
  for (const c of activeCompanies(v)) {
    for (const p of c.products) {
      if (p.sectorId !== sid || p.id === excludeId || !hasKnownSupply(p)) continue;
      A += attractiveness(sid, p.quality * qualityDrift, p.brand, c.reputation, p.price);
    }
  }
  return A;
}

function othersPriceAtt(v: PlayerView, sid: SectorId, excludeId: string, qualityDrift = 1.02): number {
  let sum = outsideAtt(sid, v.turn) * SECTORS[sid].refPrice;
  for (const c of activeCompanies(v)) for (const p of c.products) {
    if (p.sectorId !== sid || p.id === excludeId || !hasKnownSupply(p)) continue;
    sum += attractiveness(sid, p.quality * qualityDrift, p.brand, c.reputation, p.price) * p.price;
  }
  return sum;
}

interface Env {
  APrice: number;
  sid: SectorId;
  D: number; // demande du secteur
  A: number; // attractivité des autres
  q: number; // qualité après R&D du tour
  b: number; // notoriété après marketing du tour
  rep: number;
  green: number;
  uc: number; // coût unitaire
  cap: number; // capacité
  stock: number;
}
interface Eval {
  price: number;
  demand: number;
  sold: number;
  production: number;
  revenue: number;
  gross: number; // marge brute (hors marketing/R&D/fixes), pertes de stock comprises
}
function evalPrice(e: Env, price: number): Eval {
  const a = attractiveness(e.sid, e.q, e.b, e.rep, price, e.green);
  const demand = (e.D * a) / (e.A + a) * marketDemandMultiplier(e.sid, e.A + a, e.APrice + a * price);
  const production = clamp(Math.ceil(demand * 1.04 - e.stock), 0, e.cap);
  const sold = Math.min(demand, e.stock + production);
  const leftover = Math.max(0, e.stock + production - sold);
  const revenue = sold * price;
  const gross = revenue - production * e.uc - leftover * e.uc * SECTORS[e.sid].perishability;
  return { price, demand, sold, production, revenue, gross };
}
/** Meilleur prix sur une grille (objectif : marge brute + crédit éventuel sur le CA). */
function bestPrice(e: Env, revenueCredit = 0, lo = PRICE_MIN_RATIO, hi = PRICE_MAX_RATIO): Eval {
  const ref = SECTORS[e.sid].refPrice;
  let best: Eval | undefined;
  let bestObj = -Infinity;
  for (let m = lo; m <= hi + 1e-9; m += 0.01) {
    const r = evalPrice(e, ref * m);
    const obj = r.gross + revenueCredit * r.revenue;
    if (obj > bestObj) {
      bestObj = obj;
      best = r;
    }
  }
  return best!;
}

function envFor(v: PlayerView, c: CompanyView, p: ProductView, mkt: number, rnd: number, opts: { cap?: number; green?: number; D?: number; uc?: number } = {}): Env {
  // The target may restart an idle installed line: its candidate production is chosen by evalPrice.
  return {
    sid: p.sectorId,
    D: opts.D ?? expectedDemand(v, p.sectorId),
    A: othersAtt(v, p.sectorId, p.id),
    APrice: othersPriceAtt(v, p.sectorId, p.id),
    q: nextQuality(p.quality, rnd, p.sectorId),
    b: nextBrand(p.brand, mkt, p.sectorId),
    rep: c.reputation,
    green: opts.green ?? 1,
    uc: opts.uc ?? p.private?.estimatedUnitCost ?? spotUnitCost(v, p.sectorId),
    cap: opts.cap ?? p.capacity,
    stock: p.private?.stock ?? 0,
  };
}

// ===========================================================================
// Valorisation publique d'une entreprise (§6.1) : ce qu'un bon lecteur de bilans calcule
// ===========================================================================

/** profitEma reconstruit : départ déduit du cours initial (§4), puis EMA 0,8/0,2 des résultats publiés. */
function estProfitEma(c: CompanyView): number {
  // Valeur comptable initiale (≈ cash + moitié de la capacité) ; départ = (cap. boursière initiale − VC) / 40.
  const first = c.reports[0];
  let pe = 0;
  const p0 = c.priceHistory[0] ?? c.sharePrice;
  const cash0 = first ? first.cashEnd - first.netProfit : c.cash;
  let capBook = 0;
  for (const p of c.products) capBook += 0.5 * p.capacity * SECTORS[p.sectorId].capacityCost;
  const bv0 = cash0 + capBook;
  pe = Math.max(0, (p0 * 10000 - bv0) / PE);
  if (c.founderId && c.reports.length && c.priceHistory.length && Math.abs(p0 * 10000 - cash0) < 50) pe = 0; // start-up
  for (const r of c.reports) pe = 0.8 * pe + 0.2 * (r.netProfit + r.fines * 0.75);
  return pe;
}
function revenueGrowth(c: CompanyView): number {
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
  return clamp(now / Math.max(past, 1) - 1, -0.3, 0.5);
}
/** Cours « juste » estimé (sans le sentiment propre, inconnu ; avec le sentiment de marché, public). */
function fairPrice(v: PlayerView, c: CompanyView, profitEma = estProfitEma(c)): number {
  let bv = c.cash - c.debt;
  for (const p of c.products) bv += 0.5 * p.capacity * SECTORS[p.sectorId].capacityCost;
  const earnings = profitEma >= 0 ? PE * profitEma : 8 * profitEma;
  const netCash = Math.max(0, c.cash - c.debt);
  const floor = netCash + 0.3 * Math.max(0, bv - netCash) + 500;
  const fund = Math.max(floor, bv + earnings) * (1 + 0.5 * revenueGrowth(c));
  return (fund / Math.max(c.sharesOutstanding, 1)) * v.marketSentiment;
}

// ===========================================================================
// 1. NOVICE : « je baisse si ça ne se vend pas, je monte si tout part, et l'usine tourne à fond »
// ===========================================================================

export const novice: Strategy = {
  name: 'novice',
  tier: '1-novice',
  act(view, api) {
    if (view.turn === 1) return; // pas encore de chiffres : on garde les réglages d'usine
    for (const c of myCompanies(view)) {
      for (const p of c.products) {
        const ref = SECTORS[p.sectorId].refPrice;
        const stock = p.private?.stock ?? 0;
        const produced = Math.max(p.private?.lastProduced ?? 0, 1);
        let price = p.price;
        if (stock > 0.2 * produced) price *= 0.9; // des invendus : trop cher
        else if (stock < 1) price *= 1.1; // tout est parti : on peut monter
        api.act({
          type: 'setProductDecisions',
          companyId: c.id,
          productId: p.id,
          price: clamp(price, 0.6 * ref, 1.6 * ref),
          production: p.capacity, // « l'usine doit tourner »
        });
      }
    }
  },
};

// ===========================================================================
// 2. CASUAL : tâtonnement ±5 %, production calée sur les ventes, budgets modérés,
//    matières achetées quand elles sont au prix de base ou moins, quelques paris boursiers « tendance »
// ===========================================================================

export const casual: Strategy = {
  name: 'casual',
  tier: '2-casual',
  act(view, api, ctx) {
    const mem = ctx.memory as { entry?: Record<string, number> };
    mem.entry ??= {};
    for (const c of myCompanies(view)) {
      const reserve = reserveOf(c);
      const tight = c.cash < reserve;
      const plannedProd = new Map<string, number>();
      for (const p of c.products) {
        const ref = SECTORS[p.sectorId].refPrice;
        const M = marketSize(p.sectorId);
        const stock = p.private?.stock ?? 0;
        const produced = p.private?.lastProduced ?? 0;
        let price = p.price;
        let production = p.private?.production ?? p.capacity;
        if (view.turn > 1) {
          if (stock < 1 && produced >= 0.95 * p.capacity) price *= 1.05; // pleine capacité, tout vendu
          else if (stock > 0.15 * Math.max(produced, 1)) price *= 0.95; // invendus
          production = Math.round(p.lastSales * 1.1 + 2 - stock);
        }
        production = clamp(production, Math.round(0.3 * p.capacity), p.capacity);
        plannedProd.set(p.id, production);
        api.act({
          type: 'setProductDecisions',
          companyId: c.id,
          productId: p.id,
          price: clamp(price, 0.75 * ref, 1.4 * ref),
          production,
          marketing: Math.round(M * 0.02 * (tight ? 0.5 : 1)),
          rnd: Math.round(M * 0.015 * (tight ? 0.5 : 1)),
        });
      }
      // Matières : on fait le plein quand ce n'est pas cher (≤ prix de base), sinon achat d'urgence.
      const fresh = api.view().companies.find((x) => x.id === c.id)!;
      for (const [cid, need] of needsFor(fresh, (p) => plannedProd.get(p.id) ?? 0)) {
        const have = fresh.private?.inventory[cid]?.lots ?? 0;
        if (need - have < 1) continue;
        if (commodityPrice(view, cid) > COMMODITIES[cid].basePrice * 1.0) continue;
        buyMaterials(api, fresh, cid, need - have, fresh.cash - reserve, 0.08);
      }
    }
    // Bourse « au feeling » : on achète ce qui monte depuis deux trimestres, on coupe à −10 %.
    const v = api.view();
    const my = me(v);
    for (const c of activeCompanies(v)) {
      const h = held(c, v.you);
      if (h > 0 && c.controllerId !== v.you) {
        const entry = mem.entry[c.id] ?? c.sharePrice;
        const ph = c.priceHistory;
        const falling = ph.length >= 2 && ph[ph.length - 1] < ph[ph.length - 2] * 0.97;
        if (c.sharePrice < entry * 0.9 || falling) {
          api.act({ type: 'sellShares', companyId: c.id, shares: h });
          delete mem.entry[c.id];
        }
      }
    }
    if (v.turn >= 2 && my.cash > 1500) {
      const lines = activeCompanies(v).filter((c) => held(c, v.you) > 0 && c.controllerId !== v.you).length;
      if (lines < 3) {
        const rising = activeCompanies(v)
          .filter((c) => c.controllerId !== v.you && c.floatShares > 100 && held(c, v.you) === 0)
          .filter((c) => {
            const ph = c.priceHistory;
            return ph.length >= 3 && ph[ph.length - 1] > ph[ph.length - 2] * 1.03 && ph[ph.length - 2] > ph[ph.length - 3] * 1.03;
          })
          .sort((a, b) => b.priceHistory[b.priceHistory.length - 1] / b.priceHistory[b.priceHistory.length - 3] - a.priceHistory[a.priceHistory.length - 1] / a.priceHistory[a.priceHistory.length - 3]);
        const t = rising[0];
        if (t) {
          const n = Math.min(t.floatShares, sharesFor(t, (my.cash - 500) * 0.3));
          if (n >= 1 && api.act({ type: 'buyShares', companyId: t.id, shares: n }).ok) mem.entry[t.id] = t.sharePrice;
        }
      }
    }
    coverClose(api);
  },
};

// ===========================================================================
// 3. COMPETENT : modèle de demande, capacité, dette, bonus mesuré, contrôle et défense
// ===========================================================================

interface ManageOpts {
  /** Poids du bénéfice de ce tour dans le score (expert), 1 sinon. */
  weight: (turn: number) => number;
  /** Crédit sur le CA (croissance, §6.1) : ~0 pour le compétent, calculé pour l'expert. */
  revenueCredit: number;
  /** Optimise marketing/R&D par simulation (expert) ; sinon budgets fixes proportionnés. */
  optimiseBudgets: boolean;
  /** Bonus d'attractivité prévu ce tour (greenwashing). */
  green: (c: CompanyView) => number;
  /** Achats de matières sur rumeur : lots supplémentaires voulus par matière. */
  extraMaterials?: Map<CommodityId, number>;
  /** Matières dont une baisse est annoncée : ne pas acheter. */
  avoidMaterials?: Set<CommodityId>;
  /** Multiplicateur de demande annoncé par une rumeur, par secteur (pour la résolution de ce tour). */
  demandBoost?: Map<SectorId, number>;
}

/** Poids d'un bénéfice du tour t dans la valeur nette finale (expert) : cash + 40 × part dans profitEma. */
function scoreWeight(total: number) {
  return (t: number) => (t >= total ? 1 : 1 + PE * EMA_NEW * Math.pow(0.8, total - 1 - t));
}

/**
 * Gestion industrielle d'une entreprise contrôlée (compétent et expert).
 * Prix : optimum du modèle logit (marge brute + crédit CA), production = demande prévue.
 * Marketing/R&D : budgets proportionnés (compétent) ou optimisés sur l'horizon restant (expert).
 * Capacité : agrandie quand la demande au prix optimal sans contrainte dépasse l'usine et que ça paie.
 */
function manageCompany(view: PlayerView, api: StrategyApi, c: CompanyView, o: ManageOpts) {
  const reserve = reserveOf(c);
  const left = turnsLeft(view);
  const T = view.config.totalTurns;
  const w = o.weight(view.turn);
  const planned = new Map<string, number>();
  const expansions: { p: ProductView; lots: number; value: number }[] = [];
  let cashNeeded = 0;

  for (const p of c.products) {
    const M = marketSize(p.sectorId);
    const boost = o.demandBoost?.get(p.sectorId) ?? 1;
    const D = expectedDemand(view, p.sectorId) * boost;
    const green = o.green(c);
    let mkt: number;
    let rnd: number;
    if (o.optimiseBudgets) {
      ({ mkt, rnd } = optimiseBudgets(view, c, p, o));
    } else {
      // Compétent : budgets proportionnés à la marge brute du produit, un peu au-dessus des réglages
      // de départ ; R&D coupée aux deux derniers tours (elle ne paie plus), marketing au dernier.
      const e0 = envFor(view, c, p, 0.015 * M, 0.01 * M, { D, green });
      const g = Math.max(0, bestPrice(e0).gross);
      mkt = Math.min(0.02 * M, 0.25 * g);
      rnd = Math.min(0.02 * M, 0.2 * g);
      if (left <= 1) rnd = 0;
      if (left === 0) mkt = 0;
      if (c.cash < reserve) {
        mkt *= 0.5;
        rnd *= 0.5;
      }
    }
    const env = envFor(view, c, p, mkt, rnd, { D, green });
    const best = bestPrice(env, o.revenueCredit);
    planned.set(p.id, best.production);
    api.act({
      type: 'setProductDecisions',
      companyId: c.id,
      productId: p.id,
      price: Math.round(best.price * 100) / 100,
      production: best.production,
      marketing: Math.round(mkt),
      rnd: Math.round(rnd),
    });
    cashNeeded += mkt + rnd + best.production * env.uc;

    // Capacité : demande au prix optimal si l'usine était plus grande (livrée au tour suivant).
    if (left >= 1 && (p.private?.pendingCapacity ?? 0) === 0) {
      const big = bestPrice({ ...env, D: expectedDemand(view, p.sectorId, 1), cap: p.capacity * 3, stock: 0 }, o.revenueCredit);
      const want = Math.floor(big.production * 1.02 - p.capacity);
      if (want >= Math.max(2, 0.05 * p.capacity)) {
        const lots = Math.min(want, Math.ceil(0.4 * p.capacity));
        const def = SECTORS[p.sectorId];
        const cur = bestPrice({ ...env, D: expectedDemand(view, p.sectorId, 1), stock: 0 }, o.revenueCredit);
        const bigLim = bestPrice({ ...env, D: expectedDemand(view, p.sectorId, 1), cap: p.capacity + lots, stock: 0 }, o.revenueCredit);
        const gainPerTurn = bigLim.gross - cur.gross;
        // Valeur : gain sur les tours restants (pondéré pour l'expert) − moitié du coût (l'autre reste au bilan).
        let horizon = 0;
        for (let t = view.turn + 1; t <= T; t++) horizon += o.weight(t) * 0.75;
        const value = gainPerTurn * horizon - 0.5 * lots * def.capacityCost;
        if (value > 0.3 * lots * def.capacityCost) expansions.push({ p, lots, value });
      }
    }
  }

  // Matières : besoins du tour achetés au marché si le cours est ≤ base (compétent) ; l'expert ajoute
  // ses paris de rumeur et évite les matières annoncées en baisse.
  const fresh = api.view().companies.find((x) => x.id === c.id)!;
  for (const [cid, need] of needsFor(fresh, (p) => planned.get(p.id) ?? 0)) {
    const have = fresh.private?.inventory[cid]?.lots ?? 0;
    const extra = o.extraMaterials?.get(cid) ?? 0;
    if (o.avoidMaterials?.has(cid)) continue;
    const cheap = commodityPrice(view, cid) <= COMMODITIES[cid].basePrice * 0.98;
    const want = (cheap || extra > 0 ? need - have : 0) + extra;
    if (want < 1) continue;
    const f2 = api.view().companies.find((x) => x.id === c.id)!;
    buyMaterials(api, f2, cid, want, f2.cash - reserve - cashNeeded * 0.5, extra > 0 ? 0.25 : 0.1);
  }

  // Capacité (par ordre de valeur), financée par emprunt si nécessaire : la dette coûte ~1,5 %/trim.
  expansions.sort((a, b) => b.value - a.value);
  for (const x of expansions) {
    const cost = x.lots * SECTORS[x.p.sectorId].capacityCost;
    let cv = api.view().companies.find((y) => y.id === c.id)!;
    if (cv.cash - cost < reserve + cashNeeded * 0.3) {
      const loan = Math.min(cv.private?.loanLimit ?? 0, reserve + cashNeeded * 0.3 + cost - cv.cash);
      if (loan >= 100 && cv.debt + loan < 0.6 * Math.max(1, cv.cash + loan + cv.marketCap * 0.2)) api.act({ type: 'takeLoan', companyId: c.id, amount: Math.round(loan) });
      cv = api.view().companies.find((y) => y.id === c.id)!;
    }
    if (cv.cash - cost >= reserve * 0.8) api.act({ type: 'expandCapacity', companyId: c.id, productId: x.p.id, lots: x.lots });
  }

  // Trésorerie : emprunt de précaution si à sec (la clôture, elle, est couverte en fin de tour), remboursement si opulent.
  const cv = api.view().companies.find((y) => y.id === c.id)!;
  if (cv.cash < reserve + cashNeeded * 0.3) {
    const loan = Math.min(cv.private?.loanLimit ?? 0, reserve + cashNeeded * 0.3 - cv.cash);
    if (loan >= 100) api.act({ type: 'takeLoan', companyId: c.id, amount: Math.round(loan) });
  } else if (cv.debt > 0 && cv.cash > 2.5 * reserve + cashNeeded && !isLast(view)) {
    api.act({ type: 'repayLoan', companyId: c.id, amount: Math.min(cv.debt, cv.cash - 2 * reserve - cashNeeded) });
  }
}

/**
 * Expert : choisit marketing et R&D en simulant les tours restants (notoriété et qualité suivent §5.4,
 * la concurrence extérieure progresse de 4 %/tour), chaque bénéfice étant pondéré par son poids dans le score.
 */
function optimiseBudgets(view: PlayerView, c: CompanyView, p: ProductView, o: ManageOpts): { mkt: number; rnd: number } {
  const M = marketSize(p.sectorId);
  const T = view.config.totalTurns;
  const levels = [0, 0.005, 0.01, 0.015, 0.02, 0.03, 0.04, 0.06];
  const uc = p.private?.estimatedUnitCost ?? spotUnitCost(view, p.sectorId);
  const A0 = othersAtt(view, p.sectorId, p.id);
  const price0 = othersPriceAtt(view, p.sectorId, p.id);
  const outside0 = outsideAtt(p.sectorId, view.turn);
  const capGrowth = 1.25; // on suppose que l'usine suivra une partie de la demande
  let best = { mkt: 0.015 * M, rnd: 0.01 * M, v: -Infinity };
  for (const lm of levels) {
    for (const lr of levels) {
      const mkt = lm * M;
      const rnd = lr * M;
      let b = p.brand;
      let q = p.quality;
      let total = 0;
      for (let t = view.turn; t <= T; t++) {
        // On garde le même budget ensuite (politique stationnaire), sauf au dernier tour où tout est coupé.
        const m = t === T ? 0 : mkt;
        const r = t >= T - 1 ? 0 : rnd;
        b = nextBrand(b, m, p.sectorId);
        q = nextQuality(q, r, p.sectorId);
        const k = t - view.turn;
        const A = A0 - outside0 + outsideAtt(p.sectorId, t) + (A0 - outside0) * 0.02 * k; // rivaux qui progressent
        const env: Env = {
          sid: p.sectorId,
          D: expectedDemand(view, p.sectorId, k) * (k === 0 ? (o.demandBoost?.get(p.sectorId) ?? 1) : 1),
          A,
          APrice: (price0 - outside0 * SECTORS[p.sectorId].refPrice) * (1 + 0.02 * k) + outsideAtt(p.sectorId, t) * SECTORS[p.sectorId].refPrice,
          q,
          b,
          rep: c.reputation,
          green: k === 0 ? o.green(c) : 1,
          uc,
          cap: k === 0 ? p.capacity : p.capacity * Math.min(capGrowth, 1 + 0.1 * k),
          stock: k === 0 ? (p.private?.stock ?? 0) : 0,
        };
        const r0 = bestPrice(env);
        total += o.weight(t) * 0.75 * (r0.gross - m - r); // après impôt
      }
      if (total > best.v) best = { mkt, rnd, v: total };
    }
  }
  return best;
}

/** Défense anti-OPA : rachat d'actions, achat perso (avec levier), pilule empoisonnée en dernier recours. */
function defend(view: PlayerView, api: StrategyApi, c: CompanyView, leverage: number) {
  const threat = biggestOther(c, view.you);
  const S = c.sharesOutstanding;
  if (threat.shares < 0.25 * S) return;
  let cv = api.view().companies.find((x) => x.id === c.id)!;
  // 1. Rachat (sans faire passer le raider au-dessus de 50 %) : réduit le flottant disponible.
  if (!cv.private?.turnFlags.buybackDone) {
    const budget = Math.max(0, cv.cash - reserveOf(cv)) * 0.5;
    const n = Math.min(cv.floatShares, sharesFor(cv, budget), Math.floor(cv.sharesOutstanding - 2 * threat.shares - 1));
    if (n >= 1) api.act({ type: 'buyback', companyId: c.id, shares: n });
  }
  // 2. Achat perso pour repasser au-dessus de 50 %.
  cv = api.view().companies.find((x) => x.id === c.id)!;
  if (cv.controllerId !== view.you) return;
  const need = Math.floor(cv.sharesOutstanding / 2) + 1 - held(cv, view.you);
  if (need > 0 && cv.floatShares > 0) {
    let v = api.view();
    const want = Math.min(need, cv.floatShares);
    const missing = buyCost(cv, want) - (me(v).cash - 50);
    if (missing > 0 && leverage > 0) {
      const loan = Math.min(v.personalLoanLimit * leverage, missing);
      if (loan >= 50) api.act({ type: 'takePersonalLoan', amount: Math.floor(loan) });
    }
    v = api.view();
    const n = Math.min(want, sharesFor(cv, me(v).cash - 50));
    if (n >= 1) api.act({ type: 'buyShares', companyId: c.id, shares: n });
  }
  // 3. Pilule si le raider reste menaçant et qu'on est sous 50 %.
  cv = api.view().companies.find((x) => x.id === c.id)!;
  const t2 = biggestOther(cv, view.you);
  if (held(cv, view.you) <= cv.sharesOutstanding / 2 && t2.shares >= 0.3 * cv.sharesOutstanding && !cv.private?.modifiers.some((m) => m.kind === 'poison_pill_cooldown')) {
    const cost = Math.round(0.4 * cv.sharesOutstanding) * 0.5 * cv.sharePrice;
    if (cost <= me(api.view()).cash) api.act({ type: 'poisonPill', companyId: c.id });
  }
}

/** Bonus du PDG sans risque de scandale : on garde la jauge ≤ 20 à la résolution (§8). */
function safeBonus(api: StrategyApi, c: CompanyView, maxShareOfBase: number, allowCrisis: boolean) {
  const cv = api.view().companies.find((x) => x.id === c.id)!;
  if (!cv.private) return;
  const reserve = reserveOf(cv);
  const base = cv.cash + cv.private.turnFlags.bonusTaken;
  const room = Math.max(0, SAFE_SCANDAL - cv.private.scandal + (allowCrisis ? CRISIS_DROP : 0));
  // +8 de jauge par tranche de 5 % de la base.
  const byScandal = (room / 8) * 0.05 * base;
  const amount = Math.min(cv.private.maxBonus, maxShareOfBase * base, byScandal, cv.cash - 1.5 * reserve);
  if (amount < 50) return;
  api.act({ type: 'ceoBonus', companyId: c.id, amount: Math.floor(amount) });
}

/** Ramène la jauge ≤ 20 avec la com' de crise si c'est nécessaire (et possible). */
function scrubScandal(api: StrategyApi, c: CompanyView) {
  const cv = api.view().companies.find((x) => x.id === c.id);
  if (!cv?.private || cv.private.turnFlags.crisisDone || cv.private.scandal <= SAFE_SCANDAL || cv.cash < CRISIS_COST + 200) return;
  api.act({ type: 'crisisComms', companyId: c.id });
}

export const competent: Strategy = {
  name: 'competent',
  tier: '3-competent',
  act(view, api) {
    const T = view.config.totalTurns;
    for (const c of myCompanies(view)) {
      manageCompany(view, api, c, {
        weight: () => 1,
        revenueCredit: 0.03,
        optimiseBudgets: false,
        green: () => 1,
      });
      defend(view, api, c, 0.5);
      // Nouveau produit : gamme élargie si ça se rentabilise sur les tours restants (non pondérés).
      launchPlay(view, api, c, () => 1, 4, 3);
      // Bonus modeste tant que la jauge reste basse, pas en fin de partie (le sentiment pèse sur le cours).
      if (turnsLeft(view) >= 3) safeBonus(api, c, 0.05, false);
      // Dividende quand l'entreprise dort sur trop de cash.
      const cv = api.view().companies.find((x) => x.id === c.id)!;
      const reserve = reserveOf(cv);
      const last = cv.reports[cv.reports.length - 1];
      if (last && last.netProfit > 0 && cv.cash > 5 * reserve && turnsLeft(view) >= 1) {
        api.act({ type: 'payDividend', companyId: c.id, amount: Math.round(Math.min(cv.cash - 4 * reserve, last.netProfit)) });
      }
    }
    // Consolidation : racheter peu à peu ses propres actions jusqu'à 50 % + 1 (plus d'OPA possible),
    // sans levier, avec l'essentiel du cash perso (bonus, dividendes).
    const v = api.view();
    const main = myCompanies(v).sort((a, b) => b.marketCap - a.marketCap)[0];
    if (main && v.turn >= 2 && v.turn < T) {
      const need = Math.floor(main.sharesOutstanding / 2) + 1 - held(main, v.you);
      const cash = me(v).cash - 300;
      if (need > 0 && cash > 200) {
        const n = Math.min(need, main.floatShares, Math.floor(0.06 * main.sharesOutstanding), sharesFor(main, cash * 0.7));
        if (n >= 1) api.act({ type: 'buyShares', companyId: main.id, shares: n });
      }
    }
    // Perdu le contrôle et plus d'entreprise : on refonde une start-up.
    const v2 = api.view();
    if (myCompanies(v2).length === 0 && me(v2).cash >= 2500 && turnsLeft(v2) >= 4) {
      api.act({ type: 'foundStartup', name: 'Retour Gagnant', sectorId: bestSectorForEntry(v2), investment: Math.floor(Math.min(me(v2).cash * 0.7, 8000)) });
    }
    coverClose(api);
  },
};

/** Secteur le moins encombré, pondéré par la taille du marché. */
function bestSectorForEntry(v: PlayerView, exclude: Set<SectorId> = new Set()): SectorId {
  let best: SectorId = 'gadgets';
  let bestScore = -Infinity;
  for (const sid of SECTOR_IDS) {
    if (exclude.has(sid)) continue;
    const A = othersAtt(v, sid, '__none__');
    const share = 0.93 / (A + 0.93);
    const uc = spotUnitCost(v, sid);
    const response = marketDemandMultiplier(sid, A + 0.93, othersPriceAtt(v, sid, '__none__') + 0.93 * SECTORS[sid].refPrice);
    const margin = (SECTORS[sid].refPrice - uc) * expectedDemand(v, sid) * response * share - SECTORS[sid].fixedCost;
    if (margin > bestScore) {
      bestScore = margin;
      best = sid;
    }
  }
  return best;
}

/**
 * Valeur d'un nouveau produit dans un secteur où l'on n'est pas encore : marge brute simulée sur les tours
 * restants (notoriété et qualité de départ, budgets de départ), pondérée, moins le coût de lancement ;
 * la capacité neuve reste au bilan pour moitié (§5.7), le lancement ne passe pas en charges.
 */
function launchValue(v: PlayerView, c: CompanyView, sid: SectorId, weight: (t: number) => number): number {
  const def = SECTORS[sid];
  const M = marketSize(sid);
  const T = v.config.totalTurns;
  const mkt = 0.015 * M;
  const rnd = 0.01 * M;
  const A0 = othersAtt(v, sid, '__none__');
  const price0 = othersPriceAtt(v, sid, '__none__');
  let b = 0.3;
  let q = 1;
  let total = 0;
  for (let t = v.turn + 1; t <= T; t++) { // lot 2 : le produit lancé vend à partir du tour suivant
    const k = t - v.turn;
    b = nextBrand(b, mkt, sid);
    q = nextQuality(q, rnd, sid);
    const A = A0 * (1 + 0.02 * k);
    const env: Env = { sid, D: expectedDemand(v, sid, k), APrice: price0 * (1 + 0.02 * k), A, q, b, rep: c.reputation, green: 1, uc: spotUnitCost(v, sid), cap: def.startingCapacity * (1 + 0.1 * k), stock: 0 };
    total += weight(t) * 0.75 * (bestPrice(env).gross - mkt - rnd - def.fixedCost);
  }
  // lot 1 : le coût du lancement passe en charge par quarts sur 4 trimestres (§5.6), pondérés par le score
  let amort = 0;
  for (let k = 0; k < 4 && v.turn + k <= T; k++) amort += (def.launchCost / 4) * (weight(v.turn + k) - 1) * 0.75;
  return total - def.launchCost - amort + 0.5 * def.startingCapacity * def.capacityCost;
}

/** Lancement d'un produit quand il se rentabilise sur les tours restants et que la trésorerie suit. */
function launchPlay(v: PlayerView, api: StrategyApi, c: CompanyView, weight: (t: number) => number, minLeft: number, maxProducts: number) {
  if ((c.maxProducts ?? 4) > 4) maxProducts = c.maxProducts!; // lot 2 : 6 emplacements après fusion
  if (turnsLeft(v) < minLeft || c.products.length >= maxProducts) return;
  const present = new Set(c.products.map((p) => p.sectorId));
  let best: { sid: SectorId; val: number } | undefined;
  for (const sid of SECTOR_IDS) {
    if (present.has(sid)) continue;
    const val = launchValue(v, c, sid, weight);
    if (val > 0 && (!best || val > best.val)) best = { sid, val };
  }
  if (!best) return;
  const cv = api.view().companies.find((x) => x.id === c.id)!;
  const cost = SECTORS[best.sid].launchCost;
  if (cv.cash - cost < 1.5 * reserveOf(cv)) {
    const loan = Math.min(cv.private?.loanLimit ?? 0, 1.5 * reserveOf(cv) + cost - cv.cash);
    if (loan < 100 || cv.debt + loan > 0.5 * cv.marketCap) return;
    api.act({ type: 'takeLoan', companyId: c.id, amount: Math.round(loan) });
  }
  const cv2 = api.view().companies.find((x) => x.id === c.id)!;
  if (cv2.cash - cost >= reserveOf(cv2)) api.act({ type: 'launchProduct', companyId: c.id, sectorId: best.sid, name: `Nouveauté ${v.turn}` });
}

// ===========================================================================
// 4. EXPERT
// ===========================================================================

// --- Carnet de rumeurs : ce qu'un joueur chevronné a appris à force de lire le Capital Quotidien ---
type RumorInfo = { fake: true } | { fake: false; effects: NewsEffect[]; cardId: string };
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/[’']/g, "'").trim().toLowerCase();
let rumorBook: Map<string, RumorInfo> | undefined;
function getRumorBook(): Map<string, RumorInfo> {
  if (rumorBook) return rumorBook;
  rumorBook = new Map();
  for (const lang of ['fr', 'en'] as const) {
    const content = getContent(lang);
    for (const card of content.newsCards) if (card.rumor) rumorBook.set(norm(card.rumor), { fake: false, effects: card.effects, cardId: card.id });
    for (const f of content.fakeRumors) if (!rumorBook.has(norm(f.text))) rumorBook.set(norm(f.text), { fake: true });
  }
  return rumorBook;
}

interface Forecast {
  commodityUp: Map<CommodityId, number>; // multiplicateur de prix attendu
  commodityDown: Set<CommodityId>;
  sectorDemand: Map<SectorId, number>;
  market: number; // sentiment de marché attendu (× immédiat)
  companyHit: Map<string, number>; // entreprise → multiplicateur de cours attendu
  taxUp: boolean;
}

/** Lecture des rumeurs du numéro courant (annoncent la news du tour suivant). */
function readRumors(v: PlayerView): Forecast {
  const f: Forecast = { commodityUp: new Map(), commodityDown: new Set(), sectorDemand: new Map(), market: 1, companyHit: new Map(), taxUp: false };
  const issue = v.journal[v.journal.length - 1];
  if (!issue) return f;
  const book = getRumorBook();
  for (const r of issue.rumors) {
    if (r.reliability === 'faible') continue; // les vraies rumeurs ne sont jamais « faibles »
    const info = book.get(norm(r.text));
    if (!info || info.fake) continue;
    for (const e of info.effects) {
      switch (e.type) {
        case 'commodityPrice':
        case 'commoditySupply':
          if (e.commodityId === 'random') break;
          if (e.multiplier > 1) f.commodityUp.set(e.commodityId, Math.max(f.commodityUp.get(e.commodityId) ?? 1, e.multiplier));
          else f.commodityDown.add(e.commodityId);
          break;
        case 'sectorDemand':
          if (e.sectorId !== 'random') f.sectorDemand.set(e.sectorId, (f.sectorDemand.get(e.sectorId) ?? 1) * sectorNewsMultiplier(e.sectorId, e.multiplier));
          break;
        case 'marketSentiment':
          f.market *= e.multiplier;
          break;
        case 'taxRate':
          if (e.delta > 0) f.taxUp = true;
          break;
        case 'companySentiment': {
          const target = typeof e.target === "string" ? resolveTarget(v, e.target) : undefined;
          if (target) f.companyHit.set(target, (f.companyHit.get(target) ?? 1) * e.multiplier);
          break;
        }
        default:
          break;
      }
    }
  }
  return f;
}
/** Cibles de news calculables depuis la vue (les cibles 'random' restent inconnues). */
function resolveTarget(v: PlayerView, target: string): string | undefined {
  const act = activeCompanies(v);
  if (!act.length) return undefined;
  if (target === 'richest') return [...act].sort((a, b) => b.marketCap - a.marketCap)[0].id;
  if (target === 'smallest') return [...act].sort((a, b) => a.marketCap - b.marketCap)[0].id;
  if (target === 'topProfit') {
    const withP = act.filter((c) => (c.reports[c.reports.length - 1]?.netProfit ?? 0) > 0);
    return withP.sort((a, b) => b.reports[b.reports.length - 1].netProfit - a.reports[a.reports.length - 1].netProfit)[0]?.id;
  }
  return undefined;
}

interface ExpertMem {
  bets: Record<string, { turn: number; reason: string }>; // positions boursières ouvertes
  lastForecast?: Forecast;
  takeoverTarget?: string;
}

/** Leviers de l'expert, désactivables un par un pour mesurer ce que chacun apporte (ablation). */
export interface ExpertFlags {
  weights: boolean; // pondération par le score final + budgets optimisés (sinon : comme le compétent)
  rumors: boolean; // carnet de rumeurs
  shady: boolean; // actions discutables + com' de crise
  bonus: boolean; // bonus sous le seuil de scandale
  market: boolean; // paris boursiers (valeur, sentiment)
  takeover: boolean; // OPA + fusion
  endgame: boolean; // arbitrage de clôture
  launch: boolean; // nouveaux produits
  green: boolean; // détail de « shady » : greenwashing
  tax: boolean; // détail : optimisation fiscale
  lobby: boolean; // détail : lobbying
  crisis: boolean; // com' de crise pour effacer la jauge (sinon : jauge ≤ 20 sans l'aide de la com')
  whistle: boolean; // lot 2 : lanceur d'alerte contre le rival devant soi dont la jauge publique est ≥ « moyen »
}
const ALL_FLAGS: ExpertFlags = { weights: true, rumors: true, shady: true, bonus: true, market: true, takeover: true, endgame: true, launch: true, green: true, tax: true, lobby: true, crisis: true, whistle: true };

export function makeExpert(off: Partial<Record<keyof ExpertFlags, boolean>> = {}, name = 'expert'): Strategy {
  const F: ExpertFlags = { ...ALL_FLAGS };
  for (const k of Object.keys(off) as (keyof ExpertFlags)[]) if (off[k] === false) F[k] = false;
  return {
  name,
  tier: '4-expert',
  act(view, api, ctx) {
    const mem = ctx.memory as ExpertMem;
    mem.bets ??= {};
    const T = view.config.totalTurns;
    const left = turnsLeft(view);
    const fc = F.rumors ? readRumors(view) : readRumors({ ...view, journal: [] });
    const weight = F.weights ? scoreWeight(T) : () => 1;

    // --- 1. Industrie : même moteur que le compétent, mais pondéré par le score final et informé par les rumeurs.
    //     Les rumeurs annoncent la news du tour SUIVANT : les matières s'achètent donc maintenant (avant le saut),
    //     et une hausse de demande annoncée vaudra pour la résolution suivante (on prépare l'usine).
    for (const c of myCompanies(view)) {
      const extra = new Map<CommodityId, number>();
      for (const [cid, mult] of fc.commodityUp) {
        // Besoin de ~2 tours de production + spéculation (revente possible à 95 % du spot après le saut).
        let need = 0;
        for (const p of c.products) need += (SECTORS[p.sectorId].inputs[cid] ?? 0) * p.capacity * 2;
        const spec = mult >= 1.2 ? COMMODITIES[cid].liquidity * 0.08 : 0;
        const have = c.private?.inventory[cid]?.lots ?? 0;
        if (need + spec - have >= 1) extra.set(cid, need + spec - have);
      }
      const gw = F.shady && F.green && planGreenwashing(view, c) && scandalRoom(c, F.crisis) >= 10;
      manageCompany(view, api, c, {
        weight,
        revenueCredit: F.weights && left <= 5 ? 0.06 : 0.03,
        optimiseBudgets: F.weights,
        green: () => (gw ? 1.3 : 1),
        extraMaterials: extra,
        avoidMaterials: fc.commodityDown,
      });
      // Revente des matières spéculatives quand le saut a eu lieu (surplus > 2 tours de besoins).
      if (F.rumors) sellSpeculativeStock(view, api, c);
      if (F.shady) shadyPlan(view, api, c, gw, weight, F);
      defend(view, api, c, 0.6);
      if (F.launch) launchPlay(view, api, c, weight, 2, F.takeover ? 3 : 4);
    }

    // --- 2. Argent perso : bonus « gratuits » sous le seuil de scandale, pas dans les 2 derniers tours (sentiment).
    for (const c of myCompanies(api.view())) {
      if (F.bonus && left >= 2) safeBonus(api, c, 0.1, F.shady && F.crisis);
    }

    // --- 3. Bourse : positions sur rumeurs (sentiment de marché), valeur, OPA, fin de partie.
    if (F.whistle) whistlePlay(api);
    if (F.market) marketPlay(api, mem, fc);
    if (F.takeover && left >= 2 && view.turn >= 3) takeoverPlay(api, mem);
    mergePlay(api);
    consolidate(api, left);
    if (F.endgame && left === 0) closingArbitrage(api);
    deleverage(api, left);
    // lot 1 : l'unique com' de crise du tour, en dernier (après les achats d'actions et les combines).
    if (F.crisis) for (const c of myCompanies(api.view())) scrubScandal(api, c);

    // Plus d'entreprise : start-up dans le secteur le plus prometteur.
    const v2 = api.view();
    if (myCompanies(v2).length === 0 && me(v2).cash >= 2500 && left >= 4) {
      api.act({ type: 'foundStartup', name: 'Phénix Capital', sectorId: bestSectorForEntry(v2), investment: Math.floor(Math.min(me(v2).cash * 0.6, 8000)) });
    }
    coverClose(api);
    mem.lastForecast = fc;
  },
  };
}

export const expert = makeExpert();

/** lot 2 : lanceur d'alerte (500 k perso) contre le joueur le plus riche devant soi si sa jauge publique est ≥ « moyen ». */
function whistlePlay(api: StrategyApi) {
  const v = api.view();
  if (v.turn < 2 || v.self?.whistleblownThisTurn || me(v).cash < 800) return;
  const my = me(v).netWorth;
  for (const r of v.players.filter((p) => p.id !== v.you && p.netWorth > my).sort((a, b) => b.netWorth - a.netWorth)) {
    const c = v.companies.filter((x) => x.status === 'active' && x.controllerId === r.id && x.scandalLevel !== 'faible').sort((a, b) => b.marketCap - a.marketCap)[0];
    if (c) {
      api.act({ type: 'whistleblow', companyId: c.id });
      return;
    }
  }
}

/** Greenwashing (+30 % d'attractivité ce tour) quand le bénéfice pondéré dépasse son coût. */
function planGreenwashing(v: PlayerView, c: CompanyView): boolean {
  if (!c.private || c.private.turnFlags.shadyDone.includes('greenwashing')) return false;
  const w = scoreWeight(v.config.totalTurns)(v.turn);
  let gain = 0;
  for (const p of c.products) {
    const e = envFor(v, c, p, p.private?.marketing ?? 0, p.private?.rnd ?? 0);
    gain += bestPrice({ ...e, green: 1.3 }).gross - bestPrice(e).gross;
  }
  // Coût (lot 1, au compte de résultat) : 500 + la part de com' de crise qui efface les 10 points (10/15 × 400).
  return w * 0.75 * gain > plCost(SHADY.greenwashing.cost + (10 / CRISIS_DROP) * CRISIS_COST, w) + 100;
}

/** Actions discutables dosées : on ne garde que celles qui paient, et la jauge finit ≤ 20 à la résolution. */
function shadyPlan(v: PlayerView, api: StrategyApi, c: CompanyView, greenwash: boolean, weight: (t: number) => number, F: ExpertFlags) {
  const w = weight(v.turn);
  const cv = api.view().companies.find((x) => x.id === c.id)!;
  if (!cv.private) return;
  const reserve = reserveOf(cv);
  const spare = () => api.view().companies.find((x) => x.id === c.id)!.cash - reserve;
  // Sans com' de crise, une action discutable n'est jouée que si la jauge reste ≤ 20 après elle.
  // lot 1 : budget de jauge du tour (une seule com' de crise, −15) ; sans com' de crise, jauge ≤ 15 après l'action.
  const fits = (k: ShadyKind) => scandalRoom(api.view().companies.find((x) => x.id === c.id)!, F.crisis) >= SHADY[k].scandal;
  if (greenwash && spare() > 900 && fits('greenwashing')) api.act({ type: 'shady', companyId: c.id, kind: 'greenwashing' });
  // Optimisation fiscale : l'impôt économisé (20 points) entre dans profitEma, donc × poids.
  const last = cv.reports[cv.reports.length - 1];
  const pbt = last ? last.netProfit + last.tax : 0;
  if (F.tax && fits('tax_optimisation') && pbt > 0 && w * 0.2 * pbt > plCost(SHADY.tax_optimisation.cost + (15 / CRISIS_DROP) * CRISIS_COST, w) + 100 && spare() > 700) {
    api.act({ type: 'shady', companyId: c.id, kind: 'tax_optimisation' });
  }
  // Lobbying sur son secteur : +15 % de demande pour tout le secteur pendant 2 tours ; vaut le coup
  // si notre usine peut servir le surcroît (sinon on enrichit surtout les concurrents).
  const main = [...cv.products].sort((a, b) => b.lastRevenue - a.lastRevenue)[0];
  if (F.lobby && fits('lobbying') && main && turnsLeft(v) >= 1 && spare() > 1500) {
    const e = envFor(v, cv, main, main.private?.marketing ?? 0, main.private?.rnd ?? 0);
    const gain = bestPrice({ ...e, D: e.D * 1.15 }).gross - bestPrice(e).gross;
    const w2 = w + weight(v.turn + 1);
    if (0.75 * gain * w2 > plCost(SHADY.lobbying.cost + (10 / CRISIS_DROP) * CRISIS_COST, w) + 200) {
      api.act({ type: 'shady', companyId: c.id, kind: 'lobbying', sectorId: main.sectorId });
    }
  }
}

/** Revend les matières au-delà de 2 tours de besoins quand leur cours a sauté (la rumeur s'est réalisée). */
function sellSpeculativeStock(v: PlayerView, api: StrategyApi, c: CompanyView) {
  const cv = api.view().companies.find((x) => x.id === c.id)!;
  if (!cv.private) return;
  for (const [cid, line] of Object.entries(cv.private.inventory) as [CommodityId, { lots: number; avgCost: number }][]) {
    if (!line) continue;
    let need = 0;
    for (const p of cv.products) need += (SECTORS[p.sectorId].inputs[cid] ?? 0) * p.capacity * 2;
    const surplus = Math.floor(line.lots - need);
    const px = commodityPrice(v, cid);
    if (surplus >= 1 && px * 0.95 * (1 - surplus / (2 * COMMODITIES[cid].liquidity)) > line.avgCost * 1.05) {
      api.act({ type: 'sellCommodity', companyId: c.id, commodityId: cid, lots: Math.min(surplus, Math.floor(COMMODITIES[cid].liquidity * 0.25)) });
    }
  }
}

/**
 * Bourse de l'expert : les positions de « valeur » (cours < 85 % du juste prix estimé) et les paris de rumeur
 * (sentiment de marché annoncé en hausse : achat avant la publication, revente juste après).
 */
function marketPlay(api: StrategyApi, mem: ExpertMem, fc: Forecast) {
  let v = api.view();
  const left = turnsLeft(v);
  // Clôture des paris : revente quand le cours a rejoint le juste prix, ou pari de rumeur échu.
  for (const c of activeCompanies(v)) {
    const h = held(c, v.you);
    if (h <= 0 || c.controllerId === v.you) continue;
    const bet = mem.bets[c.id];
    if (mem.takeoverTarget === c.id) continue;
    const fair = fairPrice(v, c);
    const rumorDone = bet?.reason === 'rumor' && v.turn > bet.turn;
    const hit = fc.companyHit.get(c.id) ?? 1;
    if (rumorDone || c.sharePrice > fair * 0.98 || hit < 1 || fc.market < 1) {
      if (left === 0 && c.sharePrice < fair) continue; // au dernier tour, on garde ce qui clôturera plus haut
      api.act({ type: 'sellShares', companyId: c.id, shares: h });
      delete mem.bets[c.id];
    }
  }
  v = api.view();
  if (left <= 0) return;
  // Pari de sentiment : un choc de marché positif annoncé → on charge des titres liquides peu chers.
  let budget = me(v).cash - 500;
  const cands = activeCompanies(v)
    .filter((c) => c.controllerId !== v.you && c.floatShares > 500 && c.sharePrice > 0)
    .map((c) => ({ c, edge: fairPrice(v, c) / c.sharePrice * (fc.market > 1 ? fc.market : 1) * (fc.companyHit.get(c.id) ?? 1) }))
    .sort((a, b) => b.edge - a.edge);
  for (const { c, edge } of cands) {
    if (budget < 800) break;
    // Coût aller-retour ≈ n/S ; on n'entre que si l'écart le couvre largement.
    if (edge < 1.18) break;
    const n = Math.min(c.floatShares, Math.floor(0.06 * c.sharesOutstanding), sharesFor(c, budget * 0.5));
    if (n < 1) continue;
    if (api.act({ type: 'buyShares', companyId: c.id, shares: n }).ok) {
      mem.bets[c.id] ??= { turn: v.turn, reason: fc.market > 1 ? 'rumor' : 'value' };
      budget = me(api.view()).cash - 500;
    }
  }
}

/**
 * OPA : on cherche l'entreprise dont le contrôle (50 % + 1) coûte le moins cher par rapport à ce qu'elle vaut
 * (juste prix estimé) et à ce que le contrôle rapporte (fusion : un siège de moins, soit 250 k/trim × 40 ;
 * trésorerie qu'on pourra verser en bonus). Budget : cash perso + une part du prêt perso (levier maîtrisé).
 * Assaut en un seul tour quand c'est possible (les bots se défendent à partir de 30 %, et jouent avant nous).
 */
function takeoverPlay(api: StrategyApi, mem: ExpertMem) {
  let v = api.view();
  const mine = myCompanies(v);
  const main = mine.sort((a, b) => b.marketCap - a.marketCap)[0];
  const my = me(v);
  const loanRoom = v.personalLoanLimit * 0.6;
  const budget = Math.max(0, my.cash - 300) + loanRoom;
  if (budget < 1500) return;
  let best: { c: CompanyView; need: number; cost: number; score: number } | undefined;
  for (const c of activeCompanies(v)) {
    if (c.controllerId === v.you || !(c.sharePrice > 0)) continue;
    const S = c.sharesOutstanding;
    const need = Math.floor(S / 2) + 1 - held(c, v.you);
    if (need <= 0 || need > c.floatShares) continue;
    const cost = buyCost(c, need);
    if (cost > budget) continue;
    const fair = fairPrice(v, c);
    const stakeValue = (held(c, v.you) + need) * Math.min(fair, c.sharePrice * 1.3);
    const mergeable = main && main.products.length + c.products.length <= 6; // lot 2
    const synergy = mergeable ? HQ_COST * 0.75 * (1 + 8 * 0.5) * 0.5 : 0; // siège économisé, pondéré
    const cashPile = Math.max(0, c.cash - reserveOf(c)) * 0.15;
    const score = stakeValue + synergy + cashPile - (cost + held(c, v.you) * c.sharePrice);
    if (score > 0 && (!best || score > best.score)) best = { c, need, cost, score };
  }
  if (!best) return;
  const missing = best.cost - (my.cash - 300);
  if (missing > 0) {
    if (missing > v.personalLoanLimit * 0.6) return;
    api.act({ type: 'takePersonalLoan', amount: Math.ceil(missing + 10) });
  }
  v = api.view();
  const c = v.companies.find((x) => x.id === best!.c.id)!;
  const n = Math.min(best.need, c.floatShares, sharesFor(c, me(v).cash - 50));
  if (n >= 1 && api.act({ type: 'buyShares', companyId: c.id, shares: n }).ok) mem.takeoverTarget = c.id;
}

/** Fusion : absorbe les filiales dans l'entreprise principale (un siège de moins, profitEma additionnés). */
function mergePlay(api: StrategyApi) {
  const v = api.view();
  const mine = myCompanies(v).sort((a, b) => b.marketCap - a.marketCap);
  if (mine.length < 2) return;
  const main = mine[0];
  for (const t of mine.slice(1)) {
    const m = api.view().companies.find((x) => x.id === main.id)!;
    if (m.products.length + t.products.length > 6) continue; // lot 2
    if (t.private?.turnFlags.justFounded) continue;
    // Après fusion, garder le contrôle de l'ensemble (sinon on attend).
    const ratio = t.sharePrice / Math.max(m.sharePrice, 0.01);
    const mine2 = held(m, v.you) + held(t, v.you) * ratio;
    const S2 = m.sharesOutstanding + t.sharesOutstanding * ratio;
    let maxOther = 0;
    for (const [pid, h] of Object.entries(m.holdings)) if (pid !== v.you) maxOther = Math.max(maxOther, h + (t.holdings[pid] ?? 0) * ratio);
    if (maxOther > 0.45 * S2 || mine2 < maxOther) continue;
    api.act({ type: 'merge', absorberId: main.id, targetId: t.id });
  }
}

/** Contrôle de l'entreprise principale : viser 50 % + 1 pour être à l'abri des OPA. */
function consolidate(api: StrategyApi, left: number) {
  const v = api.view();
  const main = myCompanies(v).sort((a, b) => b.marketCap - a.marketCap)[0];
  if (!main || left <= 0) return;
  const need = Math.floor(main.sharesOutstanding / 2) + 1 - held(main, v.you);
  const fair = fairPrice(v, main);
  const cash = me(v).cash - 300;
  if (need > 0 && cash > 300 && main.sharePrice < fair * 1.1) {
    // lot 1, délit d'initié : +1 de jauge par 1 % du capital racheté ; on reste dans le budget de jauge du tour
    const byScandal = Math.floor((Math.max(0, scandalRoom(main, true)) / 100) * main.sharesOutstanding);
    const n = Math.min(need, main.floatShares, Math.floor(0.06 * main.sharesOutstanding), sharesFor(main, cash * 0.6), byScandal);
    if (n >= 1) api.act({ type: 'buyShares', companyId: main.id, shares: n });
  }
}

/**
 * Dernier tour : le cours de clôture est la cible sans inertie (§6.1). On vend ce qui cote au-dessus de sa
 * valeur estimée et on achète (avec le cash disponible) ce qui cote nettement en dessous.
 */
function closingArbitrage(api: StrategyApi) {
  const v = api.view();
  let cash = me(v).cash - 100;
  const cands = activeCompanies(v)
    .filter((c) => c.floatShares > 50 && c.sharePrice > 0)
    .map((c) => ({ c, edge: fairPrice(v, c) / c.sharePrice }))
    .sort((a, b) => b.edge - a.edge);
  for (const { c, edge } of cands) {
    if (edge < 1.12 || cash < 300) break;
    // Taille telle que le prix moyen reste ≤ juste prix / 1,05.
    const maxN = Math.floor(2 * c.sharesOutstanding * (edge / 1.05 - 1));
    const n = Math.min(c.floatShares, maxN, sharesFor(c, cash));
    if (n >= 1 && api.act({ type: 'buyShares', companyId: c.id, shares: n }).ok) cash = me(api.view()).cash - 100;
  }
}

/** Levier maîtrisé : dette perso ≤ 30 % du portefeuille ; tout rembourser au dernier tour si le cash le permet. */
function deleverage(api: StrategyApi, left: number) {
  const v = api.view();
  const my = me(v);
  if (my.debt <= 0) return;
  const ratio = my.debt / Math.max(my.portfolioValue, 1);
  if (ratio > 0.3 || left <= 1) {
    const amount = Math.min(my.debt, my.cash - 50);
    if (amount >= 10) api.act({ type: 'repayPersonalLoan', amount });
  }
}

// ===========================================================================
// Tests rapides
// ===========================================================================

export const TIERS = [novice, casual, competent, expert];

const isMain = (() => {
  try {
    return !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
  } catch {
    return false;
  }
})();

if (isMain) {
  const nSeeds = Number(process.argv[2] ?? 20);
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const only = process.argv[3];
  const t0 = Date.now();
  const show = (title: string, r: TournamentResult) => {
    console.log(`\n=== ${title} (${r.games.length} parties) ===`);
    console.log(formatReport(r));
  };
  if (only === 'ablation') {
    // Chaque levier de l'expert retiré à tour de rôle, face à passive + 3 bots (mêmes graines).
    const variants: Strategy[] = [expert];
    for (const k of (process.argv[4] ? process.argv[4].split(',') : Object.keys(ALL_FLAGS)) as (keyof ExpertFlags)[]) variants.push(makeExpert({ [k]: false }, `expert-sans-${k}`));
    console.log('variante                 medNW   moyNW  win%  rang   vs bots (part des paires gagnées)');
    for (const s of variants) {
      const r = runTournament({ seeds, lineups: [[s, passive]], bots: 3 });
      const me2 = r.summary.find((x) => x.name === s.name)!;
      const vsBots = Object.entries(r.headToHead[s.name] ?? {}).filter(([k]) => k.startsWith('bot:'));
      const botRate = vsBots.reduce((a, [, c]) => a + c.rate * c.n, 0) / Math.max(1, vsBots.reduce((a, [, c]) => a + c.n, 0));
      console.log(`${s.name.padEnd(24)} ${(me2.medianNW / 1000).toFixed(1).padStart(6)} ${(me2.meanNW / 1000).toFixed(1).padStart(7)} ${(me2.winRate * 100).toFixed(0).padStart(5)} ${me2.meanRank.toFixed(2).padStart(5)}   ${(botRate * 100).toFixed(0)} %`);
    }
    console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
    process.exit(0);
  }
  // Chaque niveau seul contre passive (+3 bots), sièges tournés.
  for (const s of TIERS) {
    if (only && s.name !== only) continue;
    const r = runTournament({ seeds, lineups: [[s, passive]], bots: 3 });
    show(`${s.name} vs passive`, r);
    const errs = r.games.flatMap((g) => g.log).filter((l) => l.includes('EXCEPTION'));
    if (errs.length) console.log('EXCEPTIONS', errs.slice(0, 3));
  }
  if (!only) {
    // Les quatre niveaux à la même table (+1 bot), sièges tournés.
    const r = runTournament({ seeds, lineups: [TIERS], bots: 1 });
    show('les quatre niveaux ensemble + 1 bot', r);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
