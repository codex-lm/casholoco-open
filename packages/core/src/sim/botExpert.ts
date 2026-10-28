/**
 * Bots « experts » (GameConfig.botLevel = 'expert', §10) : un joueur chevronné, porté du banc d'essai
 * (tools/balance-lab, stratégies « compétent » et « expert »). Ils ne lisent que leur vue de joueur, celle d'un
 * humain (prix des rivaux du trimestre précédent, jauges des autres en trois paliers, rumeurs avec leur fiabilité
 * affichée), et agissent par les mêmes actions validées. Aucun tirage : tout se décide sur la vue.
 *
 * Ce qui les rend forts (mesuré sur le banc) :
 *  - prix et production à l'optimum du modèle de demande (logit du §5.2, recalculé depuis la vue) ;
 *  - marketing et R&D choisis en simulant les trimestres restants, chaque bénéfice pesé par son poids dans la valeur
 *    finale (40 × bénéfice lissé : un bénéfice du T15 vaut ~9 fois un bénéfice du T1) : investir tôt, récolter tard ;
 *  - lancements dès qu'ils se rentabilisent sur la partie restante, à crédit s'il le faut ; capacité qui suit ;
 *  - contrôle de sa propre entreprise (50 % + 1) et défense anti-OPA ;
 *  - jauge de scandale tenue sous un seuil à la résolution (combines et achats d'initié dosés, com' de crise).
 * Les seuils et dosages sont des réglages (ExpertParams), trouvés par le banc d'essai.
 * La personnalité garde son rôle : l'agressivité ouvre les OPA, les paris de valeur et l'alerte ; le goût des combines,
 * le greenwashing, l'optimisation fiscale et le lobbying ; l'avidité, la taille des bonus (nulle avec les réglages du
 * jeu) ; le goût du risque, le levier.
 */
import { proximityOfHex } from './hexes';
import { capitalCellId, isSpatialMap } from '../content/hexes';
import { boardTerrains } from '../content/boardTerrains';

import { COMMODITIES, FAKE_RUMORS, getContent, NEWS_CARDS, SECTORS } from '../content';
import { productCount, productIdentity } from './industry';
import {
  SECTOR_IDS,
  ZONE_IDS,
  type Action,
  type ActionResult,
  type BotPersonality,
  type CommodityId,
  type CompanyView,
  type ExpertMemory,
  type PlayerView,
  type ProductView,
  type SectorId,
  type ShadyKind,
  type ZoneId,
} from '../types';
import {
  BONUS_SCANDAL_PER_TRANCHE,
  BONUS_TRANCHE,
  COMMODITY_CAP_RATIO,
  CRISIS_COMMS_COST,
  CRISIS_COMMS_SCANDAL,
  EMERGENCY_PURCHASE_PREMIUM,
  FLOAT_MIN,
  HQ_COST,
  LAUNCH_AMORTIZATION_TURNS,
  LOSS_MULTIPLE,
  MAX_PRODUCTS,
  MAX_PRODUCTS_MERGED,
  PE_MULTIPLE,
  POISON_PILL_DISCOUNT,
  POISON_PILL_ISSUE,
  PROFIT_EMA_KEEP,
  PRICE_MAX_RATIO,
  PRICE_MIN_RATIO,
  SHADY_COSTS,
  START_BRAND,
  WHISTLEBLOW_COST,
} from './constants';
import { brandAfter, outsideAttractiveness, productAttractiveness, qualityAfter } from './advice';
import {
  companyHasCrypto,
  CRYPTO_DUMP_CLOSE_THRESHOLD,
  CRYPTO_DUMP_CONTROL_KEEP,
  CRYPTO_DUMP_EXPOSURE_MIN,
  CRYPTO_DUMP_SELL_BASE,
  CRYPTO_DUMP_SELL_CONTROLLER,
  CRYPTO_DUMP_SELL_COOLDOWN,
  CRYPTO_DUMP_SELL_MAX,
  CRYPTO_DUMP_SELL_SCORE,
  CRYPTO_DUMP_SELL_THRESHOLD,
  CRYPTO_DUMP_THRESHOLD_SWING,
  cryptoDumpSignals,
  cryptoExposure,
} from './cryptoSignals';
import { startingDecisions } from './opening';
import { deliveryPerLot } from './transport';
import { productSalvageValue } from './finance';
import { botZoneMode } from './bots';
import { bestAuctionHex, botHexBid, capitalCandidate } from './botHexes';
import { hexReservePrice } from './hexAuctions';
import { impactBuyTotal, impactUnitsForBudget } from './market';
import { hasKnownSupply, marketDemandMultiplier } from './marketDemand';
import { away, cityTotals, proximityOf, weightsOf, type MarketEntry } from './regions';

/** Ce que voit et fait un bot expert : sa vue de joueur, les actions d'un joueur, sa mémoire, de quoi baptiser ses créations. */
export interface BotIO {
  view(): PlayerView;
  act(action: Action): ActionResult;
  memory(): ExpertMemory;
  productName(sectorId: SectorId, companyName: string): string;
  startupName(): string;
}

// ---------------------------------------------------------------------------
// Règles publiques (GAME_DESIGN) et aides
// ---------------------------------------------------------------------------

/**
 * Réglages d'un bot expert : ce que l'on peut régler sans changer sa logique. Les valeurs par défaut sont celles du jeu ;
 * le banc d'essai les cherche automatiquement (tools/balance-lab/expert-tune.ts, GAME_DESIGN §13).
 */
export interface ExpertParams {
  /**
   * Bénéfice avant impôt minimal visé (k), en début de partie puis en fin de partie (interpolé selon les trimestres
   * restants) : marketing et R&D sont rabotés en dessous. Négatif, il autorise une perte modérée pour investir. Trop bas,
   * le bénéfice lissé devient négatif, le cours retombe vers la valeur de l'actif (§6.1) et l'entreprise devient une
   * proie ; à une table d'experts, tous investissent en même temps (mesuré).
   */
  floorStart: number;
  floorEnd: number;
  /** Part de la marge brute prévue que l'on croit, pour tenir le plancher. */
  grossTrust: number;
  /** Progression supposée de l'attractivité des rivaux par trimestre (ils investissent aussi). */
  rivalGrowth: number;
  /** Valeur actualisée exigée d'un lancement, en part de son coût. */
  launchHurdle: number;
  /** Plus de lancement quand il reste moins de trimestres que cela. */
  launchMinLeft: number;
  /** Plafond du marketing et de la R&D d'un produit, en part de la taille de son marché. */
  budgetMax: number;
  /** Poids du futur : multiplie la part « 40 × bénéfice lissé » du poids d'un bénéfice dans le score (1 = règles). */
  futureWeight: number;
  /** Crédit sur le CA dans l'objectif de prix (la croissance porte la valorisation), puis dans les 5 derniers trimestres. */
  revenueCredit: number;
  revenueCreditLate: number;
  /** Gain pondéré exigé d'une extension de capacité, en part de son coût net. */
  capHurdle: number;
  /** Jauge de scandale visée à la résolution (§8 : 15 → risque d’éclatement ~1,3 % par trimestre, 20 → ~3,7 %). */
  safeScandal: number;
  /** Calibrage du modèle de demande : vitesse d'apprentissage et borne de la correction (log). */
  calibRate: number;
  calibBound: number;
  /** Contrôle : part visée de sa propre entreprise = 50 % + ownExtra × goût du risque. */
  ownExtra: number;
  /** Levier perso : dette ≤ (ltvBase + ltvRisk × goût du risque) × portefeuille. */
  ltvBase: number;
  ltvRisk: number;
  /** OPA : part du plafond de prêt perso mobilisable = raidBase + raidRisk × goût du risque. */
  raidBase: number;
  raidRisk: number;
  /** Paris de valeur : juste prix / cours exigé pour acheter. */
  valueEdge: number;
  /** Bonus : part du bonus maximal = bonusBase + bonusGreed × avidité (0 dans le jeu : l'argent rapporte plus dans l'entreprise). */
  bonusBase: number;
  bonusGreed: number;
}

/**
 * Réglages du jeu, trouvés par le banc d'essai (septembre 2026, GAME_DESIGN §13) : CMA-ES contre les joueurs scriptés
 * « compétent » et « expert », avec des garde-fous de santé de l'économie. Le budget d'OPA (raidBase, raidRisk) garde
 * sa valeur d'avant le réglage, pour que les experts ne rachètent pas le joueur plus souvent qu'avant.
 */
export const DEFAULT_EXPERT_PARAMS: ExpertParams = {
  floorStart: -500,
  floorEnd: -800,
  grossTrust: 0.87,
  rivalGrowth: 0.08,
  launchHurdle: 0.3,
  launchMinLeft: 5,
  budgetMax: 0.05,
  futureWeight: 0.9,
  revenueCredit: 0.015,
  revenueCreditLate: 0.12,
  capHurdle: 0.5,
  safeScandal: 20,
  calibRate: 0.17,
  calibBound: 0.8,
  ownExtra: 0.15,
  ltvBase: 0.34,
  ltvRisk: 0.3,
  raidBase: 0.2,
  raidRisk: 0.6,
  valueEdge: 1.03,
  bonusBase: 0,
  bonusGreed: 0,
};

let activeParams: ExpertParams = DEFAULT_EXPERT_PARAMS;
/** Remplace les réglages des bots experts (banc d'essai seulement : le jeu garde les valeurs par défaut). */
export function setExpertParams(params: Partial<ExpertParams> | null): void {
  activeParams = params ? { ...DEFAULT_EXPERT_PARAMS, ...params } : DEFAULT_EXPERT_PARAMS;
}
/** Réglages du tour en cours, fixés au début de expertTurn (le moteur est synchrone). */
let P: ExpertParams = DEFAULT_EXPERT_PARAMS;

/** Plancher de bénéfice du tour : de floorStart (premier trimestre) à floorEnd (dernier). */
function floorAt(v: PlayerView): number {
  const span = Math.max(1, v.config.totalTurns - 1);
  const share = clamp(turnsLeft(v) / span, 0, 1);
  return P.floorEnd + (P.floorStart - P.floorEnd) * share;
}

const CRISIS_DROP = -CRISIS_COMMS_SCANDAL;
const EMA_NEW = 1 - PROFIT_EMA_KEEP;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const marketSize = (sid: SectorId) => SECTORS[sid].refPrice * SECTORS[sid].refDemand;
const turnsLeft = (v: PlayerView) => v.config.totalTurns - v.turn; // 0 au dernier tour
const isLast = (v: PlayerView) => v.turn >= v.config.totalTurns;
/** Fast obsolescence makes maintenance valuable even for current-quarter sales. */
const rndAt = (sid: SectorId, turn: number, total: number, budget: number) =>
  turn >= total - 1 && (SECTORS[sid].qualityDecay ?? 0.99) >= 0.99 ? 0 : budget;
const me = (v: PlayerView) => v.players.find((p) => p.id === v.you)!;
const mine = (v: PlayerView) => v.companies.filter((c) => c.controllerId === v.you && c.status === 'active');
const active = (v: PlayerView) => v.companies.filter((c) => c.status === 'active');
const sectorOf = (v: PlayerView, id: SectorId) => v.sectors.find((s) => s.id === id)!;
const fresh = (io: BotIO, id: string) => io.view().companies.find((x) => x.id === id);
const held = (c: CompanyView, id: string) => c.holdings[id] ?? 0;
/** Une charge x passée au compte de résultat du tour de poids w (combines, com' de crise) coûte aussi en cours. */
const netShare = (c: CompanyView) => 1 - (c.private?.taxRate ?? c.taxRate ?? 0.25);
const plCost = (x: number, w: number, c: CompanyView) => x * (1 + Math.max(0, w - 1) * netShare(c));

/** Le taux du trimestre projeté respecte la fin des combines et des suspensions connues. */
const projectedNetShare = (c: CompanyView, offset: number) => offset === 0 ? netShare(c)
  : 1 - (c.private?.taxRateHorizon?.[offset] ?? c.horizonSeatTaxRate ?? c.taxRate ?? 0.25);

/** Poids d'un bénéfice du tour t dans la valeur nette finale : 1 k de cash, plus 40 × sa part dans le bénéfice lissé. */
function scoreWeight(total: number) {
  return (t: number) => (t >= total ? 1 : 1 + P.futureWeight * PE_MULTIPLE * EMA_NEW * Math.pow(PROFIT_EMA_KEEP, total - 1 - t));
}

/** Matelas de base : 1 000 k, deux trimestres de coûts fixes, l'impôt et les amendes dus (§5.7). */
function baseReserveOf(c: CompanyView): number {
  let fixed = HQ_COST;
  for (const p of c.products) fixed += p.private?.market?.fixedCost ?? SECTORS[p.sectorId].fixedCost;
  // L'impôt et les amendes du trimestre clos sont dans la caisse, mais dus à la prochaine clôture (§5.7).
  const dues = c.private?.closePlan ? c.private.closePlan.obligations.taxDue + c.private.closePlan.obligations.finesDue : 0;
  return 1000 + 2 * fixed + dues;
}

/**
 * Ce que la clôture demandera à la caisse (§5.7), en sus des coûts fixes et des dus du matelas de base : intérêts, achats
 * par contrat, et ce que les ventes attendues ne couvriraient pas (mises, production, marketing et R&D), avec une marge
 * d'un écart type de la demande.
 */
function closeNeedOf(c: CompanyView): number {
  const p = c.private?.closePlan;
  if (!p) return 0;
  const uncovered = Math.max(0, p.bids + p.production.plannedCost + p.marketing.planned - p.sales.planned + p.margin);
  return p.obligations.interest + p.obligations.contracts + uncovered;
}

/** Trésorerie à garder avant de distribuer, d'investir ou de miser : le matelas de base et l'argent de la clôture. */
function reserveOf(c: CompanyView): number {
  return baseReserveOf(c) + closeNeedOf(c);
}

/** Coût d'achat de n actions au flottant, impact de prix compris (§6.2). */
const buyCost = (c: CompanyView, n: number) => impactBuyTotal(c.sharePrice, n, c.sharesOutstanding);
function sharesFor(c: CompanyView, budget: number): number {
  if (!(budget > 0) || !(c.sharePrice > 0)) return 0;
  return Math.max(0, Math.floor(impactUnitsForBudget(c.sharePrice, budget, c.sharesOutstanding) * 0.999));
}
/** Plus gros actionnaire joueur autre que moi. */
function biggestOther(c: CompanyView, myId: string): { id: string; shares: number } {
  let best = { id: '', shares: 0 };
  for (const [pid, h] of Object.entries(c.holdings)) if (pid !== myId && h > best.shares) best = { id: pid, shares: h };
  return best;
}
/** Plus grand achat permis par le flottant minimal : jusqu'à 50 % + 1, ou tant que le public garde 40 % (§6.2). */
function maxBuyAllowed(c: CompanyView, have: number): number {
  const S = c.sharesOutstanding;
  return Math.max(0, Math.min(c.floatShares, Math.max(Math.floor(S / 2) + 1 - have, Math.floor(c.floatShares - FLOAT_MIN * S + 1e-6))));
}
/** Plus grand rachat d'actions permis par le flottant minimal (miroir de la règle du moteur, avec les avoirs publics). */
function maxBuybackAllowed(c: CompanyView, wanted: number): number {
  const top = Math.max(0, ...Object.values(c.holdings));
  const breach = (k: number) => top > Math.floor((c.sharesOutstanding - k) / 2) + 1 && c.floatShares - k < FLOAT_MIN * (c.sharesOutstanding - k) - 1e-6;
  let lo = 0;
  let hi = Math.max(0, Math.min(Math.floor(wanted), c.floatShares));
  if (!breach(hi)) return hi;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (breach(mid)) hi = mid - 1;
    else lo = mid;
  }
  return lo;
}

const commodityPrice = (v: PlayerView, cid: CommodityId) => v.commodities.find((x) => x.id === cid)?.price ?? COMMODITIES[cid].basePrice;
/** Coût unitaire à la capitale sans stock de matières : achat d'urgence, travail et livraison absolue. */
function spotUnitCost(v: PlayerView, sid: SectorId): number {
  const def = SECTORS[sid];
  let cost = def.laborCost + deliveryPerLot('capital', sid) * (v.transportFactor ?? 1);
  for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) cost += per * commodityPrice(v, cid) * EMERGENCY_PURCHASE_PREMIUM;
  return cost;
}
/** Besoins de matières d'une entreprise pour une production donnée par produit. */
function needsFor(c: CompanyView, production: (p: ProductView) => number): Map<CommodityId, number> {
  const needs = new Map<CommodityId, number>();
  for (const p of c.products) {
    const q = production(p);
    for (const [cid, per] of Object.entries(SECTORS[p.sectorId].inputs) as [CommodityId, number][]) needs.set(cid, (needs.get(cid) ?? 0) + q * per);
  }
  return needs;
}
/** Achat de matières au marché, dans le budget et sous une part de la liquidité. */
function buyMaterials(io: BotIO, companyId: string, cid: CommodityId, lots: number, budget: number, maxShareOfLiquidity: number): void {
  const def = COMMODITIES[cid];
  let n = Math.floor(Math.min(lots, def.liquidity * maxShareOfLiquidity));
  const price = commodityPrice(io.view(), cid);
  const cost = (k: number) => impactBuyTotal(price, k, def.liquidity, def.basePrice * COMMODITY_CAP_RATIO);
  while (n >= 1 && cost(n) > budget) n = Math.floor(n * 0.7);
  if (n >= 1) io.act({ type: 'buyCommodity', companyId, commodityId: cid, lots: n });
}

// ---------------------------------------------------------------------------
// Modèle de demande (§5.1-5.2), calculé depuis la vue publique
// ---------------------------------------------------------------------------

function outsideAtt(sid: SectorId, turn: number): number {
  return outsideAttractiveness(sid, turn);
}
function attractiveness(sid: SectorId, q: number, b: number, rep: number, price: number, green = 1): number {
  return productAttractiveness(sid, q, b, rep, price, green);
}
function factoryWeight(c: CompanyView, p: ProductView, offset = 0): number {
  if (!p.factoryProductId) return 1;
  const family = c.products.filter(q => productIdentity(q) === productIdentity(p) && hasKnownSupply(q, offset));
  const capacity = (q: ProductView) => Math.max(1, q.capacity + (offset > 0 ? q.private?.pendingCapacity ?? 0 : 0));
  return family.some(q => q.id === p.id) ? capacity(p) / family.reduce((sum, q) => sum + capacity(q), 0) : 0;
}

/** Demande totale attendue d'un secteur, pour la résolution du tour courant (+ décalage), effets en cours amortis. */
export function expectedDemand(v: PlayerView, sid: SectorId, turnOffset = 0): number {
  const publicDemand = sectorOf(v, sid).expectedDemandHorizon?.[turnOffset];
  if (publicDemand !== undefined && Number.isFinite(publicDemand) && publicDemand >= 0) return publicDemand;
  const def = SECTORS[sid];
  const s = sectorOf(v, sid);
  const t = v.turn + turnOffset;
  const dm = Math.pow(Math.max(s.demandMultiplier, 1e-3), Math.pow(0.85, turnOffset + 1));
  let D = def.refDemand * dm * Math.pow(1 + def.growth, t - 1);
  if (s.lastTotalDemand > 0 && v.turn >= 2) {
    const prevBase = def.refDemand * s.demandMultiplier * Math.pow(1 + def.growth, v.turn - 2)
      * (s.lastMarketPriceMultiplier ?? 1);
    const ratio = clamp(s.lastTotalDemand / Math.max(prevBase, 1e-6), 0.6, 1.7);
    D *= Math.pow(ratio, turnOffset === 0 ? 0.6 : 0.2);
  }
  return D;
}

/**
 * Le secteur se joue ville par ville (§5.2 bis) : un produit du secteur (lancements compris) a son usine hors de la
 * capitale, ou `zoneId` (l'usine dont on évalue les ventes) y est.
 */
function regionalIn(v: PlayerView, sid: SectorId, zoneId?: ZoneId, hexId?: string): boolean {
  if (isSpatialMap(v.config)) {
    if (hexId !== undefined && hexId !== capitalCellId(v.config)) return true;
    return active(v).some((c) => c.products.some((p) => p.sectorId === sid && p.hexId !== undefined && p.hexId !== capitalCellId(v.config)));
  }
  if (away(zoneId)) return true;
  return active(v).some((c) => c.products.some((p) => p.sectorId === sid && away(p.zoneId)));
}

/**
 * Attractivité cumulée des autres produits du secteur (prix connus : ceux du trimestre précédent pour les rivaux), par
 * marché : [total] en national, ville par ville (ordre de `CITY_IDS`) quand le secteur est régional.
 */
function othersAtt(v: PlayerView, sid: SectorId, excludeId: string, regional: boolean): number[] {
  const entries: MarketEntry[] = [];
  for (const c of active(v)) {
    for (const p of c.products) {
      if (p.sectorId !== sid || p.id === excludeId || !hasKnownSupply(p)) continue;
      entries.push({ a: attractiveness(sid, p.quality * 1.02, p.brand, c.reputation, p.price) * factoryWeight(c, p), zoneId: p.zoneId, ...(isSpatialMap(v.config) ? { hexId: p.hexId } : {}) });
    }
  }
  return cityTotals(sid, outsideAtt(sid, v.turn), entries, regional);
}

/** Attractivité des produits lancés ce trimestre par d'autres, par marché : ils ne vendent qu'à partir du trimestre suivant. */
function comingAtt(v: PlayerView, sid: SectorId, excludeId: string, regional: boolean): number[] {
  const entries: MarketEntry[] = [];
  for (const c of active(v)) {
    for (const p of c.products) {
      if (p.sectorId !== sid || p.id === excludeId || !p.comingSoon || !hasKnownSupply(p, 1)) continue;
      entries.push({ a: attractiveness(sid, p.quality, p.brand, c.reputation, p.price) * factoryWeight(c, p, 1), zoneId: p.zoneId, ...(isSpatialMap(v.config) ? { hexId: p.hexId } : {}) });
    }
  }
  return cityTotals(sid, 0, entries, regional);
}

/** National price mass, including outside firms at reference price. Geography only reallocates buyers. */
function othersPriceMass(v: PlayerView, sid: SectorId, excludeId: string, offset = 0, rivalGrowth = P.rivalGrowth): { marketA: number; marketAPrice: number } {
  const outside = outsideAtt(sid, v.turn + offset);
  let marketA = outside;
  let marketAPrice = outside * SECTORS[sid].refPrice;
  for (const c of active(v)) for (const p of c.products) {
    if (p.sectorId !== sid || p.id === excludeId || !hasKnownSupply(p, offset)) continue;
    const a = attractiveness(sid, p.quality * (p.comingSoon ? 1 : 1.02), p.brand, c.reputation, p.price)
      * (1 + rivalGrowth * offset) * factoryWeight(c, p, offset);
    marketA += a;
    marketAPrice += a * p.price;
  }
  return { marketA, marketAPrice };
}

interface Env {
  sid: SectorId;
  boost: number; // calibrage : e^logk, appris sur les parts de marché observées
  calibrationBoost?: number; // Raw learned factor; the factory's physical share must never be learned a second time.
  D: number; // demande du secteur
  w: readonly number[]; // poids de chaque marché dans la demande ([1] en national, §5.2 bis)
  pi: readonly number[]; // facteur de l'usine à chaque marché (1 + localBonus dans sa ville, 1 sinon)
  A: number[]; // attractivité des autres, par marché
  marketA: number; // national attraction of rivals and outside firms
  marketAPrice: number; // national sum of rival attraction times price
  rivalScale?: number; // projected growth of rivals, shared by national and city masses
  rivalDeltas?: readonly { product: ProductView; a: number }[]; // hypothetical sibling attraction minus public baseline
  q: number; // qualité après la R&D du tour
  b: number; // notoriété après le marketing du tour
  rep: number;
  green: number;
  uc: number; // coût unitaire
  cap: number; // capacité
  stock: number;
  perishMultiplier: number;
  demandMultiplier: number;
  priceMultiplier: number; // levier « prix perçus » du terrain : attractivité seule, jamais le CA
}
/** Project the same prepared rival mass as the city logits, with outside firms and future entrants. */
function projectedPriceMass(v: PlayerView, env: Env, excludeId: string, offset: number, rivalGrowth = P.rivalGrowth): { marketA: number; marketAPrice: number; rivalScale: number } {
  const outside0 = outsideAtt(env.sid, v.turn);
  const outside = outsideAtt(env.sid, v.turn + offset);
  let comingA = 0, comingAPrice = 0;
  if (offset > 0) for (const c of active(v)) for (const p of c.products) {
    if (p.sectorId !== env.sid || p.id === excludeId || !p.comingSoon || !hasKnownSupply(p, offset)) continue;
    const a = attractiveness(env.sid, p.quality, p.brand, c.reputation, p.price) * factoryWeight(c, p, offset);
    comingA += a;
    comingAPrice += a * p.price;
  }
  const growth = 1 + rivalGrowth * offset;
  return { rivalScale: growth, marketA: (env.marketA - outside0 + comingA) * growth + outside,
    marketAPrice: (env.marketAPrice - outside0 * SECTORS[env.sid].refPrice + comingAPrice) * growth + outside * SECTORS[env.sid].refPrice };
}

interface Eval {
  price: number;
  demand: number;
  sold: number;
  production: number;
  revenue: number;
  gross: number; // marge brute (hors marketing, R&D, fixes), pertes de stock comprises
}
/**
 * Ce qui ne dépend pas du prix, calculé une fois par recherche de prix : les mêmes opérations dans le même ordre que
 * `attractiveness` et le logit (préfixe du produit gauche à droite), donc les mêmes arrondis.
 */
interface Prep {
  base: number; // q^sector qualityExponent × (0,5 + b) × réputation
  ref: number;
  elasticity: number;
  perish: number;
  n: number;
  Dw: Float64Array; // D × poids de chaque marché
  pi: Float64Array;
  A: Float64Array;
}
function prepOf(e: Env): Prep {
  const def = SECTORS[e.sid];
  const n = e.A.length;
  const Dw = new Float64Array(n);
  const pi = new Float64Array(n);
  const A = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    Dw[k] = e.D * e.w[k];
    pi[k] = e.pi[k];
    A[k] = e.A[k];
  }
  return { base: Math.pow(Math.max(e.q, 0.01), def.qualityExponent ?? 1.3) * (0.5 + Math.max(e.b, 0)) * e.rep, ref: def.refPrice, elasticity: def.elasticity, perish: def.perishability * e.perishMultiplier, n, Dw, pi, A };
}
function evalPrice(e: Env, x: Prep, price: number): Eval {
  const a = e.boost * (x.base * Math.pow(x.ref / Math.max(price * e.priceMultiplier, 1e-6), x.elasticity) * e.green);
  let demand = 0;
  for (let k = 0; k < x.n; k++) demand += (x.Dw[k] * a * x.pi[k]) / (x.A[k] + a * x.pi[k]);
  demand *= e.demandMultiplier * marketDemandMultiplier(e.sid, e.marketA + a, e.marketAPrice + a * price);
  const production = clamp(Math.ceil(demand * 1.04 - e.stock), 0, e.cap);
  const sold = Math.min(demand, e.stock + production);
  const leftover = Math.max(0, e.stock + production - sold);
  const revenue = sold * price;
  const gross = revenue - production * e.uc - leftover * e.uc * x.perish;
  return { price, demand, sold, production, revenue, gross };
}
/** Meilleur prix (multiple du prix de référence entre lo et hi) : grille grossière, puis fine autour du meilleur. */
function bestPrice(e: Env, revenueCredit = 0, objective?: (result: Eval) => number): Eval {
  const ref = SECTORS[e.sid].refPrice;
  // Every forecast searches the same legal domain. Sector and market elasticity,
  // not a narrower hardcoded horizon range, determine the worthwhile markup.
  const lo = PRICE_MIN_RATIO;
  const hi = PRICE_MAX_RATIO;
  const x = prepOf(e);
  let best: Eval | undefined;
  let bestObj = -Infinity;
  const tryAt = (m: number) => {
    const r = evalPrice(e, x, ref * m);
    const obj = objective ? objective(r) : r.gross + revenueCredit * r.revenue;
    if (obj > bestObj) {
      bestObj = obj;
      best = r;
    }
  };
  for (let m = lo; m <= hi + 1e-9; m += 0.05) tryAt(m);
  const m0 = best!.price / ref;
  for (let m = Math.max(lo, m0 - 0.04); m <= Math.min(hi, m0 + 0.04) + 1e-9; m += 0.01) tryAt(m);
  return best!;
}

function envFor(v: PlayerView, c: CompanyView, p: ProductView, mkt: number, rnd: number, opts: { green?: number; D?: number; boost?: number } = {}): Env {
  const regional = regionalIn(v, p.sectorId, p.zoneId, p.hexId);
  return {
    sid: p.sectorId,
    boost: (opts.boost ?? 1) * factoryWeight(c, p),
    ...(p.factoryProductId ? { calibrationBoost: opts.boost ?? 1 } : {}),
    D: opts.D ?? expectedDemand(v, p.sectorId),
    w: weightsOf(p.sectorId, regional),
    pi: isSpatialMap(v.config) ? proximityOfHex(p.sectorId, p.hexId ?? capitalCellId(v.config), regional) : proximityOf(p.sectorId, p.zoneId, regional),
    A: othersAtt(v, p.sectorId, p.id, regional),
    ...othersPriceMass(v, p.sectorId, p.id),
    q: qualityAfter(p.sectorId, p.quality, rnd, p.private?.market?.rndMultiplier),
    b: brandAfter(p.sectorId, p.brand, mkt, p.private?.market?.marketingMultiplier),
    rep: c.reputation,
    green: opts.green ?? 1,
    uc: p.private?.estimatedUnitCost ?? spotUnitCost(v, p.sectorId),
    cap: p.capacity,
    stock: p.private?.stock ?? 0,
    perishMultiplier: p.private?.market?.perishabilityMultiplier ?? 1,
    demandMultiplier: p.private?.market?.demandMultiplier ?? 1,
    priceMultiplier: p.private?.market?.priceMultiplier ?? 1,
  };
}

/** Coûts et leviers connus du terrain au trimestre visé ; même forme d'environnement à chaque appel. */
function terrainEnvAt(view: PlayerView, env: Env, p: ProductView, offset: number): Env {
  const projection = p.private?.terrainProjection?.[offset];
  if (!projection) return env;
  const hexId = projection.hexId ?? p.hexId ?? capitalCellId(view.config);
  const regional = regionalIn(view, p.sectorId, p.zoneId, hexId);
  let A = env.A;
  if (regional !== (env.A.length > 1)) {
    const rivals = othersAtt(view, p.sectorId, p.id, regional);
    const coming = comingAtt(view, p.sectorId, p.id, regional);
    if ((SECTORS[p.sectorId].marketElasticity ?? 0) > 0) {
      const outside0 = outsideAtt(p.sectorId, view.turn);
      const outside = outsideAtt(p.sectorId, view.turn + offset);
      const growth = env.rivalScale ?? 1;
      A = rivals.map((a, i) => (a - outside0 + (offset > 0 ? coming[i] : 0)) * growth + outside);
      // A changed geography must carry the same sibling budgets/prices as the national average.
      for (const delta of env.rivalDeltas ?? []) {
        const proximity = proximityOfHex(p.sectorId, delta.product.hexId ?? capitalCellId(view.config), regional);
        for (let i = 0; i < A.length; i++) A[i] += delta.a * growth * proximity[i];
      }
    } else A = rivals.map((a, i) => a + (offset > 0 ? coming[i] : 0));
  }
  return { ...env, w: weightsOf(p.sectorId, regional), pi: proximityOfHex(p.sectorId, hexId, regional), A,
    uc: projection.unitCost, perishMultiplier: projection.perishabilityMultiplier, demandMultiplier: projection.demandMultiplier,
    priceMultiplier: projection.priceMultiplier ?? env.priceMultiplier };
}

// ---------------------------------------------------------------------------
// Valorisation publique d'une entreprise (§6.1, aides de lecture du §12)
// ---------------------------------------------------------------------------

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
/** Cours « juste » : valeur fondamentale publique par action, au sentiment de marché (celui de l'entreprise est inconnu). */
function fairPrice(v: PlayerView, c: CompanyView): number {
  const bv = c.valuation?.bookValue ?? c.cash - c.debt;
  const pe = c.valuation?.smoothedProfit ?? 0;
  const earnings = pe >= 0 ? PE_MULTIPLE * pe : LOSS_MULTIPLE * pe;
  const netCash = Math.max(0, c.cash - c.debt);
  const floor = netCash + 0.3 * Math.max(0, bv - netCash) + 500;
  const fund = Math.max(floor, bv + earnings) * (1 + 0.5 * revenueGrowth(c));
  return (fund / Math.max(c.sharesOutstanding, 1)) * v.marketSentiment;
}

// ---------------------------------------------------------------------------
// Rumeurs : ce qu'annonce chaque rumeur publiée (vraie ou fausse), pesé par sa fiabilité affichée
// ---------------------------------------------------------------------------

const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/[’']/g, "'").trim().toLowerCase();
let claimBook: Map<string, CommodityId[]> | undefined;
/** Texte de rumeur (fr et en) → matières annoncées en hausse. Les fausses rumeurs de pénurie y figurent aussi. */
function shortageClaims(): Map<string, CommodityId[]> {
  if (claimBook) return claimBook;
  const book = new Map<string, CommodityId[]>();
  const add = (text: string | undefined, cid: CommodityId) => {
    if (!text) return;
    const key = norm(text);
    const list = book.get(key) ?? [];
    if (!list.includes(cid)) list.push(cid);
    book.set(key, list);
  };
  for (const lang of ['fr', 'en'] as const) {
    const content = getContent(lang);
    for (const card of NEWS_CARDS) {
      if (!card.rumor) continue;
      const text = content.newsCards.find((x) => x.id === card.id)?.rumor;
      for (const e of card.effects) {
        if ((e.type === 'commodityPrice' || e.type === 'commoditySupply') && e.commodityId !== 'random' && e.multiplier > 1) add(text, e.commodityId);
      }
    }
    for (const f of FAKE_RUMORS) if (f.commodityId) add(content.fakeRumors.find((x) => x.id === f.id)?.text, f.commodityId);
  }
  claimBook = book;
  return book;
}
/** Matières annoncées en hausse par une rumeur « élevée » (vraie 4 fois sur 5) du numéro du jour. */
function rumoredShortages(v: PlayerView): Set<CommodityId> {
  const out = new Set<CommodityId>();
  const issue = v.journal[v.journal.length - 1];
  if (!issue) return out;
  const book = shortageClaims();
  for (const r of issue.rumors) {
    if (r.reliability !== 'élevée') continue;
    for (const cid of book.get(norm(r.text)) ?? []) out.add(cid);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Industrie
// ---------------------------------------------------------------------------

interface ManageOpts {
  weight: (turn: number) => number;
  revenueCredit: number;
  green: number;
  extraMaterials: Map<CommodityId, number>;
  /** Calibrage appris (e^logk) du produit ; pour un produit sans historique, la moyenne de ceux de l'entreprise. */
  boost: (productId: string) => number;
  mem: ExpertMemory;
}

/** Calibrage : compare la part de marché obtenue au dernier tour à celle prévue, et corrige l'attractivité supposée. */
function recalibrate(v: PlayerView, mem: ExpertMemory): void {
  for (const c of mine(v)) {
    for (const p of c.products) {
      const e = mem.calib[p.id];
      if (!e || e.turn !== v.turn - 1 || !(e.odds > 0)) continue;
      const share = clamp(p.lastMarketShare, 1e-4, 0.98);
      const odds = share / (1 - share);
      // Rupture de stock : la demande valait au moins les ventes, on ne corrige alors qu'à la hausse.
      const soldOut = (p.private?.stock ?? 0) < 0.02 * Math.max(p.capacity, 1);
      if (soldOut && odds < e.odds) continue;
      e.logk = clamp(e.logk + P.calibRate * Math.log(odds / e.odds), -P.calibBound, P.calibBound);
    }
  }
  const alive = new Set(v.companies.flatMap((c) => c.products.map((p) => p.id)));
  for (const id of Object.keys(mem.calib)) if (!alive.has(id)) delete mem.calib[id];
}

function boostOf(mem: ExpertMemory, c: CompanyView): (productId: string) => number {
  const known = c.products.map((p) => mem.calib[p.id]?.logk).filter((x): x is number => x !== undefined);
  const prior = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  return (productId) => Math.exp(mem.calib[productId]?.logk ?? prior);
}

/**
 * Charges du trimestre hors produits : siège et coûts fixes (entretien des filiales en sommeil compris), lancements en
 * cours, intérêts, charges déjà engagées.
 */
function overheads(v: PlayerView, c: CompanyView): number {
  let fixed = HQ_COST;
  for (const p of c.products) fixed += p.private?.market?.fixedCost ?? SECTORS[p.sectorId].fixedCost;
  for (const s of c.sites ?? []) if (s.dormant) fixed += s.upkeep;
  for (const parcel of c.land ?? []) if (parcel.vacant) fixed += parcel.upkeep;
  const amortization = c.private?.launchChargesNext ?? c.reports[c.reports.length - 1]?.amortization ?? 0;
  const interest = c.debt * v.interestRate * 1.3;
  return fixed + amortization + interest + (c.private?.turnFlags.specialCharges ?? 0);
}

interface Plan {
  p: ProductView;
  mkt: number;
  rnd: number;
  env: Env;
  best: Eval;
}

/** Same-sector siblings share the market response: update their hypothetical budgets and prices jointly. */
function priceCompanyPlans(view: PlayerView, c: CompanyView, plans: Plan[], revenueCredit: number): void {
  for (const sid of SECTOR_IDS) {
    if (!((SECTORS[sid].marketElasticity ?? 0) > 0) && !plans.some(x => x.p.sectorId === sid && x.p.factoryProductId)) continue;
    const group = plans.filter((x) => x.p.sectorId === sid && x.p.capacity > 0 && !x.p.comingSoon);
    if (group.length < 2) continue;
    // Each baseline contains the public, unplanned siblings. Replace those terms, never add twice.
    const baseline = group.map((x) => x.env);
    const observed = group.map((x) => hasKnownSupply(x.p) ? attractiveness(sid, x.p.quality * 1.02, x.p.brand, c.reputation, x.p.price) * factoryWeight(c, x.p) : 0);
    const projected = (target: number, prices: number[]): Env => {
      const env = baseline[target];
      const A = env.A.slice();
      let marketA = env.marketA, marketAPrice = env.marketAPrice;
      const rivalDeltas: { product: ProductView; a: number }[] = [];
      for (let j = 0; j < group.length; j++) {
        if (j === target) continue;
        const sibling = group[j];
        const a = sibling.env.boost * attractiveness(sid, sibling.env.q, sibling.env.b, sibling.env.rep, prices[j], sibling.env.green);
        const pi = isSpatialMap(view.config)
          ? proximityOfHex(sid, sibling.p.hexId ?? capitalCellId(view.config), A.length > 1)
          : proximityOf(sid, sibling.p.zoneId, A.length > 1);
        for (let k = 0; k < A.length; k++) A[k] += (a - observed[j]) * pi[k];
        rivalDeltas.push({ product: sibling.p, a: a - observed[j] });
        marketA += a - observed[j];
        marketAPrice += a * prices[j] - observed[j] * sibling.p.price;
      }
      return { ...env, A, marketA, marketAPrice, rivalDeltas };
    };
    const prices = group.map((x) => x.best.price);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < group.length; i++) {
      const common = group[i].p.factoryProductId;
      if (common && group.slice(0, i).some(x => x.p.factoryProductId === common)) continue;
      const members = group.map((x, j) => j === i || common && x.p.factoryProductId === common ? j : -1).filter(j => j >= 0);
      const env = projected(i, prices);
      const best = bestPrice(env, revenueCredit, (ownResult) => {
        const trial = prices.slice();
        for (const j of members) trial[j] = ownResult.price;
        const own = common ? (() => { const adjusted = projected(i, trial); return evalPrice(adjusted, prepOf(adjusted), trial[i]); })() : ownResult;
        let value = own.gross + revenueCredit * own.revenue;
        for (let j = 0; j < group.length; j++) if (j !== i) {
          const otherEnv = projected(j, trial);
          const other = evalPrice(otherEnv, prepOf(otherEnv), trial[j]);
          value += other.gross + revenueCredit * other.revenue;
        }
        return value;
      });
      for (const j of members) prices[j] = best.price;
    }
    for (let i = 0; i < group.length; i++) {
      group[i].env = projected(i, prices);
      group[i].best = evalPrice(group[i].env, prepOf(group[i].env), prices[i]);
    }
  }
}

/** A forecast alone cannot justify an irreversible exit: the line must already fail to cover its fixed cost. */
function persistentProductLoss(c: CompanyView, p: ProductView): boolean {
  const reports = c.reports.flatMap((quarter) => {
    const product = quarter.products.find((report) => report.productId === p.id);
    return product ? [product] : [];
  }).slice(-2);
  const fixed = p.private?.market?.fixedCost ?? SECTORS[p.sectorId].fixedCost;
  // Exclude discretionary investment: a viable line can cut its budget instead of destroying its assets.
  return reports.length === 2 && reports.every((report) => report.revenue - report.sold * report.unitCost - fixed < -50);
}

/** Recurring accounting profit, including stock carried from one quarter to the next. */
function remainingProductProfits(view: PlayerView, x: Plan, recovery = false): number[] {
  const { p, env } = x;
  const def = SECTORS[p.sectorId];
  const regional = env.A.length > 1;
  const coming = comingAtt(view, p.sectorId, p.id, regional);
  const outside = outsideAtt(p.sectorId, view.turn);
  let quality = p.quality;
  let brand = p.brand;
  let stock = p.private?.stock ?? 0;
  let stockCost = p.private?.lastUnitCost ?? env.uc;
  const profits: number[] = [];
  for (let turn = view.turn; turn <= view.config.totalTurns; turn++) {
    const k = turn - view.turn;
    const projection = p.private?.terrainProjection?.[k];
    const marketing = turn === view.config.totalTurns ? 0 : x.mkt;
    const rnd = rndAt(p.sectorId, turn, view.config.totalTurns, x.rnd);
    quality = qualityAfter(p.sectorId, quality, rnd, projection?.rndMultiplier ?? p.private?.market?.rndMultiplier);
    brand = brandAfter(p.sectorId, brand, marketing, projection?.marketingMultiplier ?? p.private?.market?.marketingMultiplier);
    const future = terrainEnvAt(view, {
      ...env,
      D: expectedDemand(view, p.sectorId, k),
      ...projectedPriceMass(view, env, p.id, k, recovery ? 0 : P.rivalGrowth),
      A: env.A.map((a, i) => (a - outside + (k > 0 ? coming[i] : 0)) * (1 + (recovery ? 0 : P.rivalGrowth) * k) + outsideAtt(p.sectorId, turn)),
      q: quality,
      b: brand,
      green: k === 0 ? env.green : 1,
      cap: p.capacity + (k > 0 ? p.private?.pendingCapacity ?? 0 : 0),
      stock,
    }, p, k);
    if (recovery && k > 0) {
      // A temporary commodity spike is not a permanent reason to destroy a viable line.
      let reduction = 0;
      for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) {
        const commodity = COMMODITIES[cid];
        const price = commodityPrice(view, cid);
        const recovered = commodity.basePrice * Math.pow(price / commodity.basePrice, Math.pow(1 - commodity.meanReversion, k));
        reduction += per * Math.max(0, price - recovered) * EMERGENCY_PURCHASE_PREMIUM;
      }
      future.uc = Math.max(def.laborCost * 0.5, future.uc - reduction);
    }
    // The current quarter uses the selected company plan, including sibling coordination.
    const result = k === 0 && (def.marketElasticity ?? 0) > 0
      ? evalPrice(future, prepOf(future), x.best.price) : bestPrice(future);
    const beforeStockValue = stock * stockCost;
    if (result.production > 0) stockCost = future.uc;
    stock = Math.max(0, stock + result.production - result.sold) * (1 - Math.min(1, def.perishability * future.perishMultiplier));
    const fixed = projection?.fixedCost ?? p.private?.market?.fixedCost ?? def.fixedCost;
    // Book value changes with the stock, while only recurring profit feeds the earnings multiple.
    profits.push(result.revenue - result.production * future.uc - beforeStockValue + stock * stockCost - marketing - rnd - fixed);
  }
  return profits;
}

/**
 * Compare the two company scores, rather than treating the sale of a booked asset as new income.
 * Plant/land count at half cost; stock counts at cost and its consumption is in recurring profit.
 * Removing the original hex plant also removes headquarters privileges for every surviving product.
 */
function discontinueAdvantage(view: PlayerView, c: CompanyView, x: Plan, plans: Plan[],
  profits: Map<string, number[]>, weight: (turn: number) => number, survivorProfits?: Map<string, number[]>): { salvage: number; advantage: number } {
  const p = x.p, priv = p.private!;
  const hex = isSpatialMap(view.config);
  // Le taux de revente du terrain de départ est publié dans le résumé des effets (0,5 partout ailleurs).
  const salvageRate = priv.terrainEffects?.find((e) => e.lever === 'salvage')?.rate ?? 0.5;
  const salvage = productSalvageValue({ sectorId: p.sectorId, capacity: p.capacity,
    pendingCapacity: priv.pendingCapacity, stock: priv.stock, lastUnitCost: priv.lastUnitCost,
    landCost: p.landCost }, hex, salvageRate);
  const retainedAssets = 0.5 * (p.capacity + priv.pendingCapacity) * SECTORS[p.sectorId].capacityCost
    + (hex ? 0.5 * (p.landCost ?? 0) : 0) + priv.stock * priv.lastUnitCost;
  const terrain = hex ? boardTerrains(view.config).find((t) => t.id === c.terrainId && t.hex === p.hexId) : undefined;
  // The value of scandal protection is uncertain: keep that company-wide privilege conservatively.
  if (terrain?.effects.some((e) => e.lever === 'scandal' && (e.mult ?? 1) < 1)) return { salvage, advantage: -Infinity };
  let keptScore = retainedAssets;
  let exitScore = salvage;
  const fixedOverhead = HQ_COST + (c.sites ?? []).filter((s) => s.dormant).reduce((sum, s) => sum + s.upkeep, 0)
    + c.debt * view.interestRate * 1.3;
  const launchCharge = c.private?.launchChargesNext ?? c.reports[c.reports.length - 1]?.amortization ?? 0;
  for (let turn = view.turn; turn <= view.config.totalTurns; turn++) {
    const k = turn - view.turn;
    const amort = c.private?.launchChargesLeft === undefined ? launchCharge
      : Math.min(launchCharge, Math.max(0, c.private.launchChargesLeft - k * launchCharge));
    const overhead = fixedOverhead + amort + (k === 0 ? c.private?.turnFlags.specialCharges ?? 0 : 0);
    const keepPretax = plans.reduce((sum, plan) => sum + profits.get(plan.p.id)![k], -overhead);
    const exitPretax = survivorProfits
      ? plans.filter((plan) => plan.p.id !== p.id).reduce((sum, plan) => sum + survivorProfits.get(plan.p.id)![k], -overhead)
      : keepPretax - profits.get(p.id)![k];
    const keepRate = 1 - projectedNetShare(c, k);
    const optimized = c.private?.modifiers.some((m) => m.kind === 'tax_optimisation' && m.turnsLeft > k);
    const exitRate = terrain ? Math.min(view.taxRate, optimized ? 0.05 : view.taxRate) : keepRate;
    const keepTax = Math.max(0, keepPretax) * keepRate;
    const exitTax = Math.max(0, exitPretax) * exitRate;
    keptScore += weight(turn) * (keepPretax - exitPretax - keepTax + exitTax);
    // The exceptional inventory loss reduces tax once, but never the earnings multiple.
    if (k === 0) exitScore += Math.min(Math.max(0, exitPretax), (1 - salvageRate) * priv.stock * priv.lastUnitCost) * exitRate;
  }
  return { salvage, advantage: exitScore - keptScore };
}

/**
 * Gestion d'une entreprise : prix à l'optimum du modèle (marge brute + crédit sur le CA, qui porte la croissance),
 * production calée sur la demande prévue, marketing et R&D optimisés sur l'horizon puis rabotés pour tenir le
 * plancher de bénéfice, matières achetées au creux, capacité agrandie quand la demande la dépasse et que ça paie,
 * trésorerie tenue (emprunt de précaution, remboursement). Renvoie le bénéfice avant impôt prévu du trimestre.
 */
function manageCompany(view: PlayerView, io: BotIO, c: CompanyView, o: ManageOpts): number {
  const reserve = baseReserveOf(c);
  const left = turnsLeft(view);
  const T = view.config.totalTurns;
  const plans: Plan[] = [];
  const planFor = (p: ProductView, mkt: number, rnd: number): Plan => {
    const common = p.factoryProductId && p.private?.market?.budgetShare === 0 ? plans.find(x => x.p.factoryProductId === p.factoryProductId && x.p.private?.market?.budgetShare !== 0) : undefined;
    const env = envFor(view, c, p, common?.mkt ?? mkt, common?.rnd ?? rnd, { green: o.green, boost: o.boost(p.id) });
    return { p, mkt, rnd, env, best: bestPrice(env, o.revenueCredit) };
  };
  for (const p of c.products) {
    const { mkt, rnd } = p.private?.market?.budgetShare === 0 ? { mkt: 0, rnd: 0 } : optimiseBudgets(view, c, p, o);
    plans.push(planFor(p, mkt, rnd));
  }
  priceCompanyPlans(view, c, plans, o.revenueCredit);
  // Exits are evaluated at the budgets we can actually afford, after the company's floor adjustment.
  const fixed = overheads(view, c);
  const pretaxOf = (list: Plan[]) => list.reduce((sum, x) => sum + (x.p.capacity > 0 ? P.grossTrust * x.best.gross : 0) - x.mkt - x.rnd, 0) - fixed;
  let pretax = pretaxOf(plans);
  const spend = plans.reduce((sum, x) => sum + x.mkt + x.rnd, 0);
  const floor = floorAt(view);
  if (pretax < floor && spend > 0) {
    const f = clamp(1 - (floor - pretax) / spend, 0, 1);
    for (let i = 0; i < plans.length; i++) plans[i] = planFor(plans[i].p, plans[i].mkt * f, plans[i].rnd * f);
    priceCompanyPlans(view, c, plans, o.revenueCredit);
    pretax = pretaxOf(plans);
  }
  // A launch sells from the next quarter. Observe four full operating quarters before retiring it:
  // early losses can reflect initial overproduction and stock correction while launch charges run off.
  if (c.products.length > 1) {
    const candidates = plans.filter((x) => x.p.private && !x.p.comingSoon && view.turn - x.p.launchedTurn > LAUNCH_AMORTIZATION_TURNS && persistentProductLoss(c, x.p));
    const profits = new Map(candidates.length ? plans.map((x) => [x.p.id, remainingProductProfits(view, x)] as const) : []);
    const recoveryProfits = new Map(candidates.length ? plans.map((x) => [x.p.id, remainingProductProfits(view, x, true)] as const) : []);
    const exits = candidates.map((x) => {
      let survivors: Map<string, number[]> | undefined;
      let recoveredSurvivors: Map<string, number[]> | undefined;
      if ((SECTORS[x.p.sectorId].marketElasticity ?? 0) > 0 && plans.some((plan) => plan !== x && plan.p.sectorId === x.p.sectorId)) {
        // Removing a line changes the same-sector market average and every survivor's logit.
        const exitView = { ...view, companies: view.companies.map((company) => ({ ...company,
          products: company.products.filter((product) => product.id !== x.p.id) })) };
        const retainedPlans = plans.filter((plan) => plan !== x).map((plan): Plan => {
          if (plan.p.sectorId !== x.p.sectorId) return plan;
          const survivor = exitView.companies.find(company => company.id === c.id)!;
          const env = envFor(exitView, survivor, plan.p, plan.mkt, plan.rnd, { green: plan.env.green, boost: plan.env.calibrationBoost ?? plan.env.boost });
          return { ...plan, env, best: bestPrice(env, o.revenueCredit) };
        });
        priceCompanyPlans(exitView, c, retainedPlans, o.revenueCredit);
        survivors = new Map(retainedPlans.map((plan) => [plan.p.id, plan.p.sectorId === x.p.sectorId
          ? remainingProductProfits(exitView, plan) : profits.get(plan.p.id)!]));
        recoveredSurvivors = new Map(retainedPlans.map((plan) => [plan.p.id, plan.p.sectorId === x.p.sectorId
          ? remainingProductProfits(exitView, plan, true) : recoveryProfits.get(plan.p.id)!]));
      }
      const normal = discontinueAdvantage(view, c, x, plans, profits, o.weight, survivors);
      const recovery = discontinueAdvantage(view, c, x, plans, recoveryProfits, o.weight, recoveredSurvivors);
      return { x, salvage: normal.salvage, advantage: Math.min(normal.advantage, recovery.advantage) };
    })
      .filter((x) => x.advantage > Math.max(2000, 0.5 * x.salvage)).sort((a, b) => b.advantage - a.advantage);
    const exit = exits[0];
    if (exit && io.act({ type: 'discontinueProduct', companyId: c.id, productId: exit.x.p.id }).ok) {
      delete o.mem.calib[exit.x.p.id];
      const now = fresh(io, c.id);
      if (now) return manageCompany(io.view(), io, now, o);
    }
  }
  // Ce que l'on prévoit (cote de la part de marché), pour se corriger au prochain tour.
  for (const x of plans) {
    if (x.p.capacity <= 0) continue;
    const a = x.env.boost * attractiveness(x.env.sid, x.env.q, x.env.b, x.env.rep, x.best.price, x.env.green);
    const entry = (o.mem.calib[x.p.id] ??= { logk: Math.log(x.env.calibrationBoost ?? x.env.boost), odds: 0, turn: 0 });
    if (x.env.A.length === 1) entry.odds = a / Math.max(x.env.A[0], 1e-9);
    else {
      // Marché régional : la cote de la part prévue (la demande prévue sur celle du secteur).
      const priceResponse = marketDemandMultiplier(x.env.sid, x.env.marketA + a, x.env.marketAPrice + a * x.best.price);
      const share = clamp(x.best.demand / Math.max(x.env.D * priceResponse, 1e-9), 1e-4, 0.98);
      entry.odds = share / (1 - share);
    }
    entry.turn = view.turn;
  }
  const planned = new Map<string, number>();
  const expansions: { p: ProductView; lots: number; value: number }[] = [];
  let cashNeeded = 0;
  for (const { p, mkt, rnd, env, best } of plans) {
    // Un produit lancé ce tour (usine en commande) prépare le trimestre suivant : production à la capacité livrée.
    const production = p.capacity <= 0 && (p.private?.pendingCapacity ?? 0) > 0 ? p.private!.pendingCapacity : best.production;
    planned.set(p.id, production);
    const ownsBudget = (p.private?.market?.budgetShare ?? 1) > 0;
    io.act(ownsBudget ? {
      type: 'setProductDecisions',
      companyId: c.id,
      productId: p.id,
      price: Math.round(best.price * 100) / 100,
      production,
      marketing: Math.round(mkt),
      rnd: Math.round(rnd),
    } : { type: 'setProductDecisions', companyId: c.id, productId: p.id, production });
    cashNeeded += (ownsBudget ? mkt + rnd : 0) + best.production * env.uc;

    // Capacité : demande au prix optimal si l'usine était plus grande (livrée au tour suivant).
    if (left >= 1 && (p.private?.pendingCapacity ?? 0) === 0 && p.capacity > 0) {
      const D1 = expectedDemand(view, p.sectorId, 1);
      const coming = comingAtt(view, p.sectorId, p.id, env.A.length > 1);
      const marketResponds = (SECTORS[p.sectorId].marketElasticity ?? 0) > 0;
      const rivalGrowth = marketResponds ? P.rivalGrowth : 0;
      const outside0 = outsideAtt(p.sectorId, view.turn);
      const oldA1 = env.A.map((x, k) => x + coming[k]);
      const futureA = (offset: number) => marketResponds
        ? env.A.map((a, i) => (a - outside0 + coming[i]) * (1 + rivalGrowth * offset)
          + outsideAtt(p.sectorId, view.turn + offset))
        : oldA1;
      const A1 = futureA(1);
      const nextMarket = projectedPriceMass(view, env, p.id, 1, rivalGrowth);
      const nextEnv = isSpatialMap(view.config) ? terrainEnvAt(view, { ...env, ...nextMarket, A: A1, green: 1 }, p, 1) : { ...env, ...nextMarket, A: A1 };
      const big = bestPrice({ ...nextEnv, D: D1, cap: p.capacity * 3, stock: 0 }, o.revenueCredit);
      const want = Math.floor(big.production * 1.02 - p.capacity);
      if (want >= Math.max(2, 0.05 * p.capacity)) {
        const lots = Math.min(want, Math.ceil(0.4 * p.capacity), p.capacityLimit === undefined ? Infinity : Math.max(0, p.capacityLimit - p.capacity));
        if (lots < 1) continue;
        const def = SECTORS[p.sectorId];
        const cur = bestPrice({ ...nextEnv, D: D1, stock: 0 }, o.revenueCredit);
        const bigger = bestPrice({ ...nextEnv, D: D1, cap: p.capacity + lots, stock: 0 }, o.revenueCredit);
        const gainPerTurn = bigger.gross - cur.gross;
        let horizon = 0;
        for (let t = view.turn + 1; t <= T; t++) horizon += o.weight(t) * netShare(c);
        // La moitié du coût reste au bilan (§5.7).
        let grossValue = gainPerTurn * horizon;
        if (isSpatialMap(view.config)) {
          grossValue = 0;
          let q = env.q;
          let b = env.b;
          for (let t = view.turn + 1; t <= T; t++) {
            const k = t - view.turn;
            const projection = p.private?.terrainProjection?.[k];
            q = qualityAfter(p.sectorId, q, rnd, projection?.rndMultiplier);
            b = brandAfter(p.sectorId, b, mkt, projection?.marketingMultiplier);
            const future = terrainEnvAt(view, { ...env, ...projectedPriceMass(view, env, p.id, k, rivalGrowth), D: expectedDemand(view, p.sectorId, k), A: futureA(k), q, b, green: 1, stock: 0 }, p, k);
            const current = bestPrice(future, o.revenueCredit);
            const expanded = bestPrice({ ...future, cap: p.capacity + lots }, o.revenueCredit);
            grossValue += (expanded.gross - current.gross) * o.weight(t) * projectedNetShare(c, k);
          }
        }
        const value = grossValue - 0.5 * lots * def.capacityCost;
        if (value > P.capHurdle * lots * def.capacityCost) expansions.push({ p, lots, value });
      }
    }
  }

  // Matières : achetées au creux (≤ 98 % du prix de base), ou d'avance sur une rumeur de pénurie « élevée ».
  const now = fresh(io, c.id);
  if (now) {
    for (const [cid, need] of needsFor(now, (p) => planned.get(p.id) ?? 0)) {
      const have = now.private?.inventory[cid]?.lots ?? 0;
      const extra = o.extraMaterials.get(cid) ?? 0;
      const cheap = commodityPrice(view, cid) <= COMMODITIES[cid].basePrice * 0.98;
      const want = (cheap || extra > 0 ? need - have : 0) + extra;
      if (want < 1) continue;
      const cv = fresh(io, c.id);
      if (cv) buyMaterials(io, c.id, cid, want, cv.cash - reserve - cashNeeded * 0.5, extra > 0 ? 0.25 : 0.1);
    }
  }

  // Capacité, par ordre de valeur, à crédit si nécessaire, sans dépasser une dette de 60 % de la valeur comptable.
  expansions.sort((a, b) => b.value - a.value);
  for (const x of expansions) {
    const cost = x.lots * SECTORS[x.p.sectorId].capacityCost;
    let cv = fresh(io, c.id);
    if (!cv) return pretax;
    if (cv.cash - cost < reserve + cashNeeded * 0.3) {
      const loan = Math.min(cv.private?.loanLimit ?? 0, reserve + cashNeeded * 0.3 + cost - cv.cash);
      if (loan >= 100 && cv.debt + loan < 0.6 * Math.max(1, cv.valuation?.bookValue ?? 0)) io.act({ type: 'takeLoan', companyId: c.id, amount: Math.round(loan) });
      cv = fresh(io, c.id);
      if (!cv) return pretax;
    }
    if (cv.cash - cost >= reserve * 0.8) io.act({ type: 'expandCapacity', companyId: c.id, productId: x.p.id, lots: x.lots });
  }

  // Trésorerie : emprunt de précaution si à sec, remboursement si opulent. Les ventes du trimestre paient sa production
  // (§5.7) : ce que la clôture demanderait en plus, elle l'emprunte une fois que tous ont joué (bots.ts).
  const cv = fresh(io, c.id);
  if (!cv) return pretax;
  if (cv.cash < reserve + cashNeeded * 0.3) {
    const loan = Math.min(cv.private?.loanLimit ?? 0, reserve + cashNeeded * 0.3 - cv.cash);
    if (loan >= 100) io.act({ type: 'takeLoan', companyId: c.id, amount: Math.round(loan) });
  } else if (cv.debt > 0 && cv.cash > 2.5 * reserve + cashNeeded && !isLast(view)) {
    io.act({ type: 'repayLoan', companyId: c.id, amount: Math.min(cv.debt, cv.cash - 2 * reserve - cashNeeded) });
  }
  return pretax;
}

/** Budgets essayés, en part du plafond budgetMax (avec 0,04 : 0 ; 0,5 ; 1 ; 1,5 ; 2 ; 3 ; 4 % du marché). */
const BUDGET_STEPS = [0, 0.125, 0.25, 0.375, 0.5, 0.75, 1];

/**
 * Marketing et R&D : on simule les trimestres restants (notoriété et qualité suivent le §5.4, la concurrence
 * extérieure progresse de 4 % par tour, les rivaux de rivalGrowth), chaque bénéfice pesé par son poids dans le score. Même
 * budget ensuite, sauf au dernier tour (marketing coupé). La R&D est coupée dans les deux derniers trimestres pour
 * les secteurs à déclin lent ; avec une obsolescence rapide, son entretien peut payer dès les ventes du trimestre.
 */
export function optimiseBudgets(view: PlayerView, c: CompanyView, p: ProductView, o: ManageOpts): { mkt: number; rnd: number; v: number } {
  const M = marketSize(p.sectorId);
  const T = view.config.totalTurns;
  const uc = p.private?.estimatedUnitCost ?? spotUnitCost(view, p.sectorId);
  const regional = regionalIn(view, p.sectorId, p.zoneId, p.hexId);
  const w = weightsOf(p.sectorId, regional);
  const pi = isSpatialMap(view.config) ? proximityOfHex(p.sectorId, p.hexId ?? capitalCellId(view.config), regional) : proximityOf(p.sectorId, p.zoneId, regional);
  const A0 = othersAtt(view, p.sectorId, p.id, regional);
  const coming = comingAtt(view, p.sectorId, p.id, regional);
  const outside0 = outsideAtt(p.sectorId, view.turn);
  const installedCapacity = p.capacity;
  const paidCapacity = installedCapacity + (p.private?.pendingCapacity ?? 0);
  const demand = Array.from({ length: T - view.turn + 1 }, (_, k) => expectedDemand(view, p.sectorId, k));
  const market = p.private?.market;
  const current = { hexId: p.hexId, unitCost: uc, rndMultiplier: market?.rndMultiplier ?? 1, marketingMultiplier: market?.marketingMultiplier ?? 1,
    perishabilityMultiplier: market?.perishabilityMultiplier ?? 1, demandMultiplier: market?.demandMultiplier ?? 1, priceMultiplier: market?.priceMultiplier ?? 1 };
  const projections = demand.map((_, k) => p.private?.terrainProjection?.[k] ?? current);
  const positions = projections.map((projection) => {
    if (!isSpatialMap(view.config) || !projection.hexId || projection.hexId === p.hexId) return { w, pi, A0, coming };
    const nextRegional = regionalIn(view, p.sectorId, p.zoneId, projection.hexId);
    return { w: weightsOf(p.sectorId, nextRegional), pi: proximityOfHex(p.sectorId, projection.hexId, nextRegional),
      A0: nextRegional === regional ? A0 : othersAtt(view, p.sectorId, p.id, nextRegional),
      coming: nextRegional === regional ? coming : comingAtt(view, p.sectorId, p.id, nextRegional) };
  });
  // Les autres à chaque trimestre de l'horizon, par marché : les rivaux progressent, la concurrence extérieure aussi.
  const others = demand.map((_, k) => positions[k].A0.map((a0, i) => (a0 - outside0 + (k > 0 ? positions[k].coming[i] : 0)) * (1 + P.rivalGrowth * k) + outsideAtt(p.sectorId, view.turn + k)));
  const marketPrices = demand.map((_, k) => othersPriceMass(view, p.sectorId, p.id, k));
  const weights = demand.map((_, k) => o.weight(view.turn + k) * projectedNetShare(c, k));
  const boost = o.boost(p.id);
  let best = { mkt: 0.015 * M, rnd: 0.01 * M, v: -Infinity };
  const levels = BUDGET_STEPS.map((x) => x * P.budgetMax);
  for (const lm of levels) {
    for (const lr of levels) {
      const mkt = lm * M;
      const rnd = lr * M;
      let b = p.brand;
      let q = p.quality;
      let total = 0;
      for (let t = view.turn; t <= T; t++) {
        const m = t === T ? 0 : mkt;
        const r = rndAt(p.sectorId, t, T, rnd);
        const k = t - view.turn;
        const projection = projections[k];
        b = brandAfter(p.sectorId, b, m, projection.marketingMultiplier);
        q = qualityAfter(p.sectorId, q, r, projection.rndMultiplier);
        // Un produit qui n'est pas encore en rayon ne vend rien ce tour (il se prépare).
        if (k === 0 && p.capacity <= 0) {
          total -= weights[k] * (m + r);
          continue;
        }
        const env: Env = {
          sid: p.sectorId,
          boost: boost * factoryWeight(c, p, k),
          D: demand[k],
          w: positions[k].w,
          pi: positions[k].pi,
          A: others[k],
          ...marketPrices[k],
          q,
          b,
          rep: c.reputation,
          green: k === 0 ? o.green : 1,
          uc: projection.unitCost,
          cap: k === 0 ? installedCapacity : paidCapacity,
          stock: k === 0 ? (p.private?.stock ?? 0) : 0,
          perishMultiplier: projection.perishabilityMultiplier,
          demandMultiplier: projection.demandMultiplier,
          priceMultiplier: projection.priceMultiplier,
        };
        total += weights[k] * (bestPrice(env).gross - m - r);
      }
      if (total > best.v) best = { mkt, rnd, v: total };
    }
  }
  return best;
}

/** Choose the entry sector from the same public launch profit estimates used by players. */
function bestSectorForEntry(v: PlayerView, exclude: Set<SectorId> = new Set()): SectorId {
  let best: SectorId = 'gadgets';
  let bestScore = -Infinity;
  for (const sid of SECTOR_IDS) {
    if (exclude.has(sid)) continue;
    if (isSpatialMap(v.config)) {
      const hexId = launchHex(v, sid);
      const margin = hexId ? sectorOf(v, sid).launchByHex?.[hexId]?.quarterlyProfit ?? -Infinity : -Infinity;
      if (margin > bestScore) {
        bestScore = margin;
        best = sid;
      }
      continue;
    }
    const sector = sectorOf(v, sid);
    const launch = sector.launchByZone?.[launchZone(v, sid)] ?? sector.launchEstimate;
    const margin = launch?.quarterlyProfit ?? -Infinity;
    if (margin > bestScore) {
      bestScore = margin;
      best = sid;
    }
  }
  return best;
}

/**
 * Valeur d'un lancement : marge simulée sur les tours restants (le produit vend à partir du tour suivant, réglages
 * de départ), pondérée par le score, moins le coût (passé en charge par quarts sur 4 trimestres, §5.6) ; la moitié
 * de la capacité neuve reste au bilan.
 */
export function launchValue(v: PlayerView, c: CompanyView, sid: SectorId, weight: (t: number) => number, boost: number): number {
  if (isSpatialMap(v.config)) return expertLaunchProject(v, c, sid, weight, boost)?.value ?? -Infinity;
  return launchValueAt(v, c, sid, weight, boost);
}

/** The same paid-capacity horizon at one public candidate, without a first-quarter entry gate. */
export function launchValueAt(v: PlayerView, c: CompanyView, sid: SectorId, weight: (t: number) => number, boost: number, hexId?: string): number {
  return launchReturnsAt(v, c, sid, weight, boost, hexId).value;
}

/** Cash funds land bids; capitalised earnings rank projects but cannot fund an auction. */
function launchReturnsAt(v: PlayerView, c: CompanyView, sid: SectorId, weight: (t: number) => number, boost: number, hexId?: string): { value: number; cashGain: number } {
  const def = SECTORS[sid];
  const M = marketSize(sid);
  const T = v.config.totalTurns;
  const defaults = startingDecisions(sid, def.startingCapacity);
  const mkt = defaults.marketing;
  const rnd = defaults.rnd;
  // Coût absolu du lancement à sa zone candidate (§5.8), incluant la livraison depuis la capitale.
  const zone = launchZone(v, sid);
  const byZone = sectorOf(v, sid).launchByZone;
  if (isSpatialMap(v.config) && !hexId) return { value: -Infinity, cashGain: -Infinity };
  const uc = hexId
    ? (sectorOf(v, sid).launchByHex?.[hexId]?.unitCost ?? spotUnitCost(v, sid))
    : (byZone?.[zone]?.unitCost ?? spotUnitCost(v, sid));
  const regional = regionalIn(v, sid, zone, hexId);
  const w = weightsOf(sid, regional);
  const pi = hexId ? proximityOfHex(sid, hexId, regional) : proximityOf(sid, zone, regional);
  const outside0 = outsideAtt(sid, v.turn);
  const others0 = othersAtt(v, sid, '__none__', regional);
  const coming0 = comingAtt(v, sid, '__none__', regional);
  const rivals0 = others0.map((x, k) => x - outside0 + coming0[k]);
  let b = START_BRAND;
  let q = 1;
  // Expert classic launches stop ads and R&D until the first sales quarter.
  // Their brand and quality still age during the launch quarter. Hex projects
  // are adjudicated after operations and do not age until the next quarter.
  if (!isSpatialMap(v.config)) {
    b = brandAfter(sid, b, 0);
    q = qualityAfter(sid, q, 0);
  }
  let total = 0;
  let cash = 0;
  for (let t = v.turn + 1; t <= T; t++) {
    const k = t - v.turn;
    b = brandAfter(sid, b, mkt);
    q = qualityAfter(sid, q, rnd);
    const A = rivals0.map((r) => r * (1 + P.rivalGrowth * k) + outsideAtt(sid, t));
    const env: Env = { sid, boost, ...othersPriceMass(v, sid, '__none__', k), D: expectedDemand(v, sid, k), w, pi, A, q, b, rep: c.reputation, green: 1, uc, cap: def.startingCapacity, stock: 0, perishMultiplier: 1, demandMultiplier: 1, priceMultiplier: 1 };
    const profit = projectedNetShare(c, k) * (bestPrice(env).gross - mkt - rnd - def.fixedCost);
    total += weight(t) * profit;
    cash += profit;
  }
  let amort = 0;
  for (let k = 0; k < LAUNCH_AMORTIZATION_TURNS && v.turn + k <= T; k++) amort += (def.launchCost / LAUNCH_AMORTIZATION_TURNS) * (weight(v.turn + k) - 1) * projectedNetShare(c, k);
  const land = hexId ? hexReservePrice(hexId) : 0;
  return { value: total - def.launchCost - amort + 0.5 * def.startingCapacity * def.capacityCost - land,
    cashGain: cash - def.launchCost - land };
}

/** Zone d'un lancement : celle au meilleur bénéfice trimestriel estimé (la capitale si les bots n'en bougent pas). */
function launchZone(v: PlayerView, sid: SectorId): ZoneId {
  const byZone = sectorOf(v, sid).launchByZone;
  if (!byZone || botZoneMode() === 'capital') return 'capital';
  let best: ZoneId = 'capital';
  for (const z of ZONE_IDS) if (byZone[z].quarterlyProfit > byZone[best].quarterlyProfit + 1e-9) best = z;
  return best;
}

/** Case libre d'un lancement, parmi la petite sélection évaluée dans la vue. */
function availableLaunchHexes(v: PlayerView, sid: SectorId): string[] {
  const byHex = sectorOf(v, sid).launchByHex;
  if (!byHex || !v.hexes) return [];
  const free = new Set(v.hexes.free);
  const used = new Set((v.self?.hexBids ?? []).filter((b) => b.turn === v.turn && !b.result).map((b) => b.hexId));
  const candidates = Object.keys(byHex).filter((id) => free.has(id) && !used.has(id) && byHex[id]);
  const capital = capitalCandidate(candidates);
  return botZoneMode() === 'capital' ? capital ? [capital] : [] : candidates;
}

export function launchHex(v: PlayerView, sid: SectorId): string | undefined {
  const byHex = sectorOf(v, sid).launchByHex;
  const candidates = availableLaunchHexes(v, sid);
  const capital = capitalCandidate(candidates);
  if (!capital || botZoneMode() === 'capital') return capital;
  const value = Object.fromEntries(candidates.map((id) => [id, byHex![id]!.quarterlyProfit]));
  return bestAuctionHex(candidates, value, turnsLeft(v), Infinity, SECTORS[sid].launchCost);
}

/** Rank actual free sites by the expert's horizon, within the company's real financing constraints. */
export function expertLaunchProject(v: PlayerView, c: CompanyView, sid: SectorId, weight: (t: number) => number = scoreWeight(v.config.totalTurns), boost = 1): { hexId: string; value: number; cashGain: number } | undefined {
  const reserve = reserveOf(c);
  let best: { hexId: string; value: number; cashGain: number } | undefined;
  for (const hexId of availableLaunchHexes(v, sid)) {
    const cost = SECTORS[sid].launchCost + hexReservePrice(hexId);
    let loan = 0;
    if (c.cash - cost < 1.5 * reserve) {
      loan = Math.min(c.private?.loanLimit ?? 0, 1.5 * reserve + cost - c.cash);
      if (loan < 100 || c.debt + loan > 0.5 * c.marketCap) continue;
    }
    if (c.cash + loan - cost < reserve) continue;
    const returns = launchReturnsAt(v, c, sid, weight, boost, hexId);
    if (!best || returns.value > best.value + 1e-9) best = { hexId, ...returns };
  }
  return best;
}

/**
 * Lancement du meilleur nouveau produit quand il se rentabilise sur la partie restante, que la trésorerie suit, et que
 * son premier quart de coût (passé en charge ce trimestre) ne fait pas tomber le bénéfice sous le plancher.
 */
function launchPlay(v: PlayerView, io: BotIO, c: CompanyView, weight: (t: number) => number, minLeft: number, maxProducts: number, pretax: number, boost: number, pers: BotPersonality): void {
  const projects = isSpatialMap(v.config) ? (io.view().self?.hexBids ?? []).filter((b) => b.companyId === c.id && b.kind === 'launch' && !b.result).length : 0;
  if (turnsLeft(v) < minLeft || productCount(c) + projects >= maxProducts) return;
  const present = new Set(c.products.map((p) => p.sectorId));
  const launchView = io.view();
  let best: { sid: SectorId; val: number; hexId?: string; cashGain?: number } | undefined;
  for (const sid of SECTOR_IDS) {
    if (present.has(sid)) continue;
    const cost = SECTORS[sid].launchCost;
    if (pretax - cost / LAUNCH_AMORTIZATION_TURNS < floorAt(v)) continue;
    const project = isSpatialMap(v.config) ? expertLaunchProject(launchView, c, sid, weight, boost) : undefined;
    const val = isSpatialMap(v.config) ? project?.value ?? -Infinity : launchValueAt(launchView, c, sid, weight, boost);
    if (val > P.launchHurdle * cost && (!best || val > best.val)) best = { sid, val, hexId: project?.hexId, cashGain: project?.cashGain };
  }
  if (!best) return;
  const launchCost = SECTORS[best.sid].launchCost;
  const initialHex = best.hexId;
  if (isSpatialMap(v.config) && !initialHex) return;
  const cost = launchCost + (initialHex ? hexReservePrice(initialHex) : 0);
  const cv = fresh(io, c.id);
  if (!cv) return;
  if (cv.cash - cost < 1.5 * reserveOf(cv)) {
    const loan = Math.min(cv.private?.loanLimit ?? 0, 1.5 * reserveOf(cv) + cost - cv.cash);
    if (loan < 100 || cv.debt + loan > 0.5 * cv.marketCap) return;
    io.act({ type: 'takeLoan', companyId: c.id, amount: Math.round(loan) });
  }
  const cv2 = fresh(io, c.id);
  if (!cv2 || cv2.cash - cost < reserveOf(cv2)) return;
  const before = new Set(cv2.products.map((p) => p.id));
  const hexId = best.hexId;
  if (isSpatialMap(v.config) && !hexId) return;
  if (hexId && !availableLaunchHexes(io.view(), best.sid).includes(hexId)) return;
  const reserve = hexId ? hexReservePrice(hexId) : 0;
  const budget = cv2.cash - reserveOf(cv2) - launchCost;
  const value = hexId ? Math.max(reserve, (best.cashGain ?? 0) + reserve) : 0;
  const bid = hexId ? botHexBid(pers, reserve, value, budget) : undefined;
  if (hexId && bid === undefined) return;
  if (!io.act({ type: 'launchProduct', companyId: c.id, sectorId: best.sid, name: io.productName(best.sid, cv2.name), ...(hexId ? { hexId, bid, fallback: budget >= 2 * reserve ? 'nearest' as const : 'abandon' as const } : {}) }).ok) return;
  // Le produit ne vend qu'au trimestre suivant : pas de marketing ni de R&D d'ici là (le plancher de bénéfice les
  // aurait refusés) ; ses réglages seront optimisés au prochain tour.
  const launched = fresh(io, c.id)?.products.find((p) => !before.has(p.id));
  if (launched) io.act({ type: 'setProductDecisions', companyId: c.id, productId: launched.id, marketing: 0, rnd: 0 });
}

/** Revend les matières au-delà de deux tours de besoins quand leur cours a sauté (la rumeur s'est réalisée). */
function sellSpeculativeStock(v: PlayerView, io: BotIO, c: CompanyView): void {
  const cv = fresh(io, c.id);
  if (!cv?.private) return;
  for (const [cid, line] of Object.entries(cv.private.inventory) as [CommodityId, { lots: number; avgCost: number } | undefined][]) {
    if (!line) continue;
    // Les filiales produisent en continu : leur surplus se gère ailleurs (§10).
    if ((cv.sites ?? []).some((s) => s.commodityId === cid)) continue;
    let need = 0;
    for (const p of cv.products) need += (SECTORS[p.sectorId].inputs[cid] ?? 0) * p.capacity * 2;
    const surplus = Math.floor(line.lots - need);
    const px = commodityPrice(v, cid);
    if (surplus >= 1 && px * 0.95 * (1 - surplus / (2 * COMMODITIES[cid].liquidity)) > line.avgCost * 1.05) {
      io.act({ type: 'sellCommodity', companyId: c.id, commodityId: cid, lots: Math.min(surplus, Math.floor(COMMODITIES[cid].liquidity * 0.25)) });
    }
  }
}

// ---------------------------------------------------------------------------
// Jauge de scandale, bonus et combines
// ---------------------------------------------------------------------------

/** Jauge encore disponible ce tour sous le seuil visé, com' de crise (si elle reste à faire) comprise. */
function scandalRoom(c: CompanyView, allowCrisis: boolean): number {
  if (!c.private) return 0;
  const crisis = allowCrisis && !c.private.turnFlags.crisisDone && c.cash > CRISIS_COMMS_COST + 200 ? CRISIS_DROP : 0;
  return (P.safeScandal + crisis - c.private.scandal) / (c.scandalMultiplier ?? 1);
}

/** Bonus sans risque de scandale : on garde la jauge sous le seuil à la résolution (+8 par tranche de 5 %, §3). */
function safeBonus(io: BotIO, c: CompanyView, maxShareOfBase: number): void {
  const cv = fresh(io, c.id);
  if (!cv?.private || cv.private.turnFlags.justFounded) return;
  const reserve = reserveOf(cv);
  const base = Math.max(1, cv.cash + cv.private.turnFlags.bonusTaken - (cv.private.turnFlags.borrowed ?? 0));
  const room = Math.max(0, scandalRoom(cv, true));
  const byScandal = (room / BONUS_SCANDAL_PER_TRANCHE) * BONUS_TRANCHE * base;
  const amount = Math.min(cv.private.maxBonus, maxShareOfBase * base, byScandal, cv.cash - 1.5 * reserve);
  if (amount >= 50) io.act({ type: 'ceoBonus', companyId: c.id, amount: Math.floor(amount) });
}

/** Ramène la jauge sous le seuil avec l'unique com' de crise du tour, si c'est nécessaire et possible. */
function scrubScandal(io: BotIO, c: CompanyView): void {
  const cv = fresh(io, c.id);
  if (!cv?.private || cv.private.turnFlags.crisisDone || cv.private.scandal <= P.safeScandal || cv.cash < CRISIS_COMMS_COST + 200) return;
  io.act({ type: 'crisisComms', companyId: c.id });
}

/** Greenwashing (+30 % d'attractivité ce tour) quand le gain pondéré dépasse son coût (com' de crise comprise). */
function planGreenwashing(v: PlayerView, c: CompanyView, weight: (t: number) => number, boost: (productId: string) => number): boolean {
  if (!c.private || c.private.turnFlags.shadyDone.includes('greenwashing')) return false;
  const w = weight(v.turn);
  let gain = 0;
  for (const p of c.products) {
    if (p.capacity <= 0) continue;
    const e = envFor(v, c, p, p.private?.marketing ?? 0, p.private?.rnd ?? 0, { boost: boost(p.id) });
    gain += bestPrice({ ...e, green: 1.3 }).gross - bestPrice(e).gross;
  }
  const cost = SHADY_COSTS.greenwashing;
  return w * netShare(c) * gain > plCost(cost.cost + (cost.scandal * (c.scandalMultiplier ?? 1) / CRISIS_DROP) * CRISIS_COMMS_COST, w, c) + 100;
}

/** Combines dosées : seulement celles qui paient, et la jauge finit sous le seuil à la résolution. */
function shadyPlan(v: PlayerView, io: BotIO, c: CompanyView, greenwash: boolean, weight: (t: number) => number, lobby: boolean, boost: (productId: string) => number): void {
  const w = weight(v.turn);
  const cv = fresh(io, c.id);
  if (!cv?.private) return;
  const reserve = reserveOf(cv);
  const spare = () => (fresh(io, c.id)?.cash ?? 0) - reserve;
  const fits = (k: ShadyKind) => {
    const now = fresh(io, c.id);
    return !!now && !now.private?.turnFlags.shadyDone.includes(k) && scandalRoom(now, true) >= SHADY_COSTS[k].scandal;
  };
  if (greenwash && spare() > 900 && fits('greenwashing')) io.act({ type: 'shady', companyId: c.id, kind: 'greenwashing' });
  // Optimisation fiscale : l'impôt économisé (20 points) entre dans le bénéfice lissé, donc × poids.
  const last = cv.reports[cv.reports.length - 1];
  const pbt = last ? last.netProfit + last.tax + (last.exceptionalLoss ?? 0) : 0;
  const tax = SHADY_COSTS.tax_optimisation;
  if (fits('tax_optimisation') && pbt > 0 && w * (isSpatialMap(v.config) ? Math.max(0, (cv.private.taxRate ?? cv.taxRate ?? v.taxRate) - 0.05) : 0.2) * pbt > plCost(tax.cost + (tax.scandal * (cv.scandalMultiplier ?? 1) / CRISIS_DROP) * CRISIS_COMMS_COST, w, cv) + 100 && spare() > 700) {
    io.act({ type: 'shady', companyId: c.id, kind: 'tax_optimisation' });
  }
  // Lobbying sur son secteur principal : +15 % de demande pendant 2 tours, si l'usine peut servir le surcroît.
  const main = [...cv.products].filter((p) => p.capacity > 0).sort((a, b) => b.lastRevenue - a.lastRevenue)[0];
  const lob = SHADY_COSTS.lobbying;
  if (lobby && main && fits('lobbying') && turnsLeft(v) >= 1 && spare() > 1500) {
    const e = envFor(v, cv, main, main.private?.marketing ?? 0, main.private?.rnd ?? 0, { boost: boost(main.id) });
    const gain = bestPrice({ ...e, D: e.D * 1.15 }).gross - bestPrice(e).gross;
    const weightedGain = isSpatialMap(v.config) ? gain * (w * netShare(cv) + weight(v.turn + 1) * projectedNetShare(cv, 1))
      : netShare(cv) * gain * (w + weight(v.turn + 1));
    if (weightedGain > plCost(lob.cost + (lob.scandal * (cv.scandalMultiplier ?? 1) / CRISIS_DROP) * CRISIS_COMMS_COST, w, cv) + 200) {
      io.act({ type: 'shady', companyId: c.id, kind: 'lobbying', sectorId: main.sectorId });
    }
  }
}

// ---------------------------------------------------------------------------
// Contrôle, défense, bourse
// ---------------------------------------------------------------------------

/** Défense anti-OPA : rachat d'actions, achat perso (avec levier), pilule empoisonnée en dernier recours. */
function defend(v: PlayerView, io: BotIO, c: CompanyView, leverage: number): void {
  const threat = biggestOther(c, v.you);
  if (threat.shares < 0.25 * c.sharesOutstanding) return;
  let cv = fresh(io, c.id);
  if (!cv) return;
  // 1. Rachat (sans faire passer le raider au-dessus de 50 %) : réduit le flottant disponible.
  if (!cv.private?.turnFlags.buybackDone) {
    const budget = Math.max(0, cv.cash - reserveOf(cv)) * 0.5;
    const n = Math.min(maxBuybackAllowed(cv, sharesFor(cv, budget)), Math.floor(cv.sharesOutstanding - 2 * threat.shares - 1));
    if (n >= 1) io.act({ type: 'buyback', companyId: c.id, shares: n });
  }
  // 2. Achat perso pour repasser au-dessus de 50 %.
  cv = fresh(io, c.id);
  if (!cv || cv.controllerId !== v.you) return;
  const need = Math.floor(cv.sharesOutstanding / 2) + 1 - held(cv, v.you);
  if (need > 0 && cv.floatShares > 0) {
    const want = Math.min(need, maxBuyAllowed(cv, held(cv, v.you)));
    const missing = buyCost(cv, want) - (me(io.view()).cash - 50);
    if (missing > 0 && leverage > 0) {
      const loan = Math.min(io.view().personalLoanLimit * leverage, missing);
      if (loan >= 50) io.act({ type: 'takePersonalLoan', amount: Math.floor(loan) });
    }
    const cv2 = fresh(io, c.id);
    if (cv2) {
      const n = Math.min(want, sharesFor(cv2, me(io.view()).cash - 50));
      if (n >= 1) io.act({ type: 'buyShares', companyId: c.id, shares: n });
    }
  }
  // 3. Pilule si le raider reste menaçant et qu'on est sous 50 %.
  cv = fresh(io, c.id);
  if (!cv) return;
  const t2 = biggestOther(cv, v.you);
  if (
    held(cv, v.you) <= cv.sharesOutstanding / 2 &&
    t2.shares >= 0.3 * cv.sharesOutstanding &&
    !cv.private?.modifiers.some((m) => m.kind === 'poison_pill_cooldown')
  ) {
    const cost = Math.round(POISON_PILL_ISSUE * cv.sharesOutstanding) * POISON_PILL_DISCOUNT * cv.sharePrice;
    if (cost <= me(io.view()).cash) io.act({ type: 'poisonPill', companyId: c.id });
  }
}

/**
 * Contrôle de l'entreprise principale : viser 50 % + 1 (plus d'OPA possible), puis, tant que le cours reste sous le
 * juste prix, un peu plus (le cours suit le bénéfice lissé avec retard : le PDG sait mieux que le marché). Achats dans
 * le budget de jauge (délit d'initié, §6.2), financés par le cash perso et, selon le goût du risque, un prêt perso.
 * Jamais de rachat d'une participation crypto cédée (ce tour ou verrouillée en mémoire) avant le krach publié.
 */
function consolidate(io: BotIO, left: number, riskTolerance: number, skipBuy?: ReadonlySet<string>): void {
  const v = io.view();
  const main = mine(v).sort((a, b) => b.marketCap - a.marketCap)[0];
  if (!main || left <= 1) return;
  if (skipBuy?.has(main.id) || io.memory().cryptoDump?.[main.id] !== undefined) return;
  const S = main.sharesOutstanding;
  const have = held(main, v.you);
  const control = Math.floor(S / 2) + 1;
  const target = Math.max(control, Math.floor(S * (0.5 + P.ownExtra * riskTolerance)));
  const need = target - have;
  if (need <= 0) return;
  const fair = fairPrice(v, main);
  if (main.sharePrice >= fair * (have < control ? 1.1 : 0.95)) return;
  // Au-delà du contrôle, levier perso plafonné (dette ≤ ltvBase + ltvRisk × goût du risque, en part du portefeuille).
  const my = me(v);
  const ltv = P.ltvBase + P.ltvRisk * riskTolerance;
  const loanRoom = Math.max(0, Math.min(v.personalLoanLimit, ltv * my.portfolioValue - my.debt));
  const byScandal = Math.floor((Math.max(0, scandalRoom(main, true)) / 100) * S);
  const want = Math.min(need, maxBuyAllowed(main, have), Math.floor(0.06 * S), byScandal);
  if (want < 1) return;
  const missing = buyCost(main, want) - (my.cash - 300) * 0.6;
  if (missing > 0 && have >= control * 0.9 && loanRoom >= 100) io.act({ type: 'takePersonalLoan', amount: Math.floor(Math.min(loanRoom, missing)) });
  const cash = me(io.view()).cash - 300;
  const cv = fresh(io, main.id);
  if (!cv || cash <= 300) return;
  const n = Math.min(want, sharesFor(cv, missing > 0 ? cash : cash * 0.6));
  if (n >= 1) io.act({ type: 'buyShares', companyId: main.id, shares: n });
}

/** Paris de valeur : achète ce qui cote sous juste prix / valueEdge, revend quand le cours l'a rejoint. `skip` exclut des ventes et des achats les entreprises déjà traitées ce tour (sortie crypto). */
function valuePlay(io: BotIO, riskTolerance: number, skip?: ReadonlySet<string>): void {
  let v = io.view();
  const left = turnsLeft(v);
  for (const c of active(v)) {
    const h = held(c, v.you);
    if (h <= 0 || c.controllerId === v.you || skip?.has(c.id)) continue;
    // Une participation de plus de 20 % est une OPA en cours : on la garde.
    if (h >= 0.2 * c.sharesOutstanding) continue;
    const fair = fairPrice(v, c);
    if (c.sharePrice > fair * 0.98) {
      if (left === 0 && c.sharePrice < fair) continue;
      io.act({ type: 'sellShares', companyId: c.id, shares: h });
    }
  }
  v = io.view();
  if (left <= 0) return;
  let budget = (me(v).cash - 500) * (0.3 + 0.5 * riskTolerance);
  const cands = active(v)
    .filter((c) => c.controllerId !== v.you && c.floatShares > 500 && c.sharePrice > 0 && !skip?.has(c.id))
    .map((c) => ({ c, edge: fairPrice(v, c) / c.sharePrice }))
    .sort((a, b) => b.edge - a.edge);
  for (const { c, edge } of cands) {
    if (budget < 800 || edge < P.valueEdge) break;
    const n = Math.min(c.floatShares, Math.floor(0.06 * c.sharesOutstanding), sharesFor(c, budget * 0.5));
    if (n < 1) continue;
    if (io.act({ type: 'buyShares', companyId: c.id, shares: n }).ok) budget = (me(io.view()).cash - 500) * (0.3 + 0.5 * riskTolerance);
  }
}

/**
 * Sortie crypto sur signaux publics (vue seule, cryptoSignals.ts). La vente n'a lieu que sur un signal
 * réel — euphorie publiée, krach ou rumeur de krach : ni l'accélération des cours ni un repli de la demande
 * ne déclenchent seuls une vente. Ne sont vendues que les entreprises dont la crypto pèse une large part du
 * dernier CA, ou nées crypto. Un contrôleur garde sa marge de sécurité au-dessus de 50 %, et une
 * participation cédée ne peut l'être à nouveau avant un délai de refroidissement (mémoire ; le verrou est
 * levé dès que le krach est publié — le marché sait, la logique d'investissement normale reprend) ; ni
 * valuePlay ni consolidate ne rachètent la participation cédée avant ce krach. Le seuil de vente bouge
 * avec la personnalité (le goût du risque retarde, l'avidité avance) : chacun sort tôt ou tard, mais
 * jamais sur l'état caché de la bulle. Au-dessus d'un second seuil (score seul), le produit crypto le plus
 * faible (plus petit CA) d'une entreprise contrôlée est liquidé sans le filtre habituel d'âge et de perte
 * persistante — on récupère la moitié de sa valeur avant l'effondrement — sauf si c'est son dernier produit.
 * Renvoie les entreprises déjà vendues, pour que valuePlay ne les revende pas une seconde fois ce tour.
 */
function cryptoExitPlay(io: BotIO, pers: BotPersonality): Set<string> {
  const sold = new Set<string>();
  let v = io.view();
  const sig = cryptoDumpSignals(v, v.config.lang ?? 'fr');
  if (sig.score <= 0) return sold;
  const swing = CRYPTO_DUMP_THRESHOLD_SWING;
  const mem = io.memory();
  mem.cryptoDump ??= {};
  if (sig.crashNow) mem.cryptoDump = {};
  // Liquidation d'abord, tant que l'on contrôle encore l'entreprise : la vente massive qui suit peut céder le contrôle.
  const closeThreshold = clamp(CRYPTO_DUMP_CLOSE_THRESHOLD + swing * (pers.riskTolerance - 0.5) - 0.1 * (pers.greed - 0.5),
    CRYPTO_DUMP_CLOSE_THRESHOLD - swing, CRYPTO_DUMP_CLOSE_THRESHOLD + 0.1);
  if (sig.score >= closeThreshold) {
    const weakest = mine(io.view())
      .filter((c) => c.products.length > 1)
      .flatMap((c) => c.products.filter((p) => p.sectorId === 'crypto').map((p) => ({ c, p })))
      .sort((a, b) => a.p.lastRevenue - b.p.lastRevenue)[0];
    if (weakest && io.act({ type: 'discontinueProduct', companyId: weakest.c.id, productId: weakest.p.id }).ok) {
      delete io.memory().calib[weakest.p.id];
      v = io.view();
    }
  }
  const sellThreshold = clamp(CRYPTO_DUMP_SELL_THRESHOLD + swing * (pers.riskTolerance - 0.5) - swing * (pers.greed - 0.5),
    CRYPTO_DUMP_SELL_THRESHOLD - swing, CRYPTO_DUMP_SELL_THRESHOLD + swing);
  if (sig.score >= sellThreshold && (sig.euphoriaNow || sig.crashNow || sig.crashRumor)) {
    for (const c of active(v)) {
      if (!companyHasCrypto(c)) continue;
      if (cryptoExposure(c) < CRYPTO_DUMP_EXPOSURE_MIN && c.foundedSectorId !== 'crypto') continue;
      if (mem.cryptoDump[c.id] !== undefined && v.turn - mem.cryptoDump[c.id] < CRYPTO_DUMP_SELL_COOLDOWN) continue;
      const h = held(c, v.you);
      if (h < 1) continue;
      const fraction = clamp(CRYPTO_DUMP_SELL_BASE + CRYPTO_DUMP_SELL_SCORE * sig.score
        + (c.controllerId === v.you ? CRYPTO_DUMP_SELL_CONTROLLER : 0), 0, CRYPTO_DUMP_SELL_MAX);
      // Un contrôleur ne cède jamais sa marge de sécurité au-dessus de 50 %.
      const cap = c.controllerId === v.you
        ? h - Math.max(Math.floor(c.sharesOutstanding / 2) + 1, Math.ceil(c.sharesOutstanding * CRYPTO_DUMP_CONTROL_KEEP))
        : h;
      const shares = Math.min(cap, Math.max(1, Math.floor(h * fraction)));
      if (shares < 1) continue;
      if (io.act({ type: 'sellShares', companyId: c.id, shares }).ok) {
        sold.add(c.id);
        // Le verrou anti-aller-retour ne se réarme pas sur une vente à krach publié : le rachat d'après-krach
        // repasse alors par la logique d'investissement normale.
        if (!sig.crashNow) mem.cryptoDump[c.id] = v.turn;
      }
    }
  }
  return sold;
}

/** Valeur récurrente du privilège fiscal d'après la vue, sans décision privée d'un rival. */
function seatValueFromView(v: PlayerView, c: CompanyView): number {
  const seatRate = c.horizonSeatTaxRate ?? v.taxRate;
  const saving = Math.max(0, v.taxRate - seatRate);
  if (!(saving > 0)) return 0;
  const publicPretax = Math.max(0, c.valuation?.smoothedProfit ?? 0) / Math.max(1e-6, 1 - seatRate);
  let projectedPretax = -HQ_COST;
  if (c.private) {
    for (const p of c.products) {
      const mkt = p.private?.marketing ?? 0;
      const rnd = p.private?.rnd ?? 0;
      // Même marge sans contrainte de capacité que la comparaison des positions ; les futurs produits comptent aussi.
      const env = envFor(v, c, p, mkt, rnd);
      projectedPretax += bestPrice({ ...env, cap: Number.MAX_VALUE, stock: 0, green: 1 }).gross
        - (p.private?.market?.fixedCost ?? SECTORS[p.sectorId].fixedCost) - mkt - rnd;
    }
  }
  return saving * Math.max(publicPretax, projectedPretax, 0);
}

/** Garder les entreprises séparées lorsque l'économie du siège ne rembourse pas les privilèges perdus. */
function mergePays(v: PlayerView, absorber: CompanyView, target: CompanyView): boolean {
  if (!isSpatialMap(v.config)) return true;
  const remaining = Math.max(0, v.config.totalTurns - v.turn + 1);
  return (seatValueFromView(v, absorber) + seatValueFromView(v, target)) * remaining
    <= HQ_COST * (1 - v.taxRate) * remaining;
}

/**
 * OPA : l'entreprise dont le contrôle (50 % + 1) coûte le moins cher au regard de ce qu'elle vaut (juste prix) et de
 * ce que le contrôle rapporte (fusion : un siège de moins ; trésorerie). Budget : cash perso + une part du prêt perso.
 * Assaut en un seul tour quand c'est possible (les autres se défendent à partir de 30 %).
 */
function takeoverPlay(io: BotIO, riskTolerance: number): void {
  let v = io.view();
  const main = mine(v).sort((a, b) => b.marketCap - a.marketCap)[0];
  const loanShare = P.raidBase + P.raidRisk * riskTolerance;
  const budget = Math.max(0, me(v).cash - 300) + v.personalLoanLimit * loanShare;
  if (budget < 1500) return;
  let best: { c: CompanyView; need: number; cost: number; score: number } | undefined;
  for (const c of active(v)) {
    if (c.controllerId === v.you || !(c.sharePrice > 0)) continue;
    const need = Math.floor(c.sharesOutstanding / 2) + 1 - held(c, v.you);
    if (need <= 0 || need > c.floatShares) continue;
    const cost = buyCost(c, need);
    if (cost > budget) continue;
    const fair = fairPrice(v, c);
    const stakeValue = (held(c, v.you) + need) * Math.min(fair, c.sharePrice * 1.3);
    const mergeable = !!main && productCount(main) + productCount(c) <= MAX_PRODUCTS_MERGED && mergePays(v, main, c);
    const synergy = mergeable ? HQ_COST * (isSpatialMap(v.config) ? 1 - v.taxRate : 0.75) * (1 + 8 * 0.5) * 0.5 : 0;
    const cashPile = Math.max(0, c.cash - reserveOf(c)) * 0.15;
    const score = stakeValue + synergy + cashPile - (cost + held(c, v.you) * c.sharePrice);
    if (score > 0 && (!best || score > best.score)) best = { c, need, cost, score };
  }
  if (!best) return;
  const missing = best.cost - (me(v).cash - 300);
  if (missing > 0) {
    if (missing > v.personalLoanLimit * loanShare) return;
    io.act({ type: 'takePersonalLoan', amount: Math.ceil(missing + 10) });
  }
  v = io.view();
  const c = v.companies.find((x) => x.id === best!.c.id);
  if (!c) return;
  const n = Math.min(best.need, c.floatShares, sharesFor(c, me(v).cash - 50));
  if (n >= 1) io.act({ type: 'buyShares', companyId: c.id, shares: n });
}

/** Fusion : absorbe les entreprises conquises dans la principale (un siège de moins, jusqu'à 6 produits). */
function mergePlay(io: BotIO): void {
  const v = io.view();
  const list = mine(v).sort((a, b) => b.marketCap - a.marketCap);
  if (list.length < 2) return;
  const main = list[0];
  for (const t of list.slice(1)) {
    const m = fresh(io, main.id);
    if (!m || productCount(m) + productCount(t) > MAX_PRODUCTS_MERGED) continue;
    if (t.private?.turnFlags.justFounded) continue;
    if (!mergePays(v, m, t)) continue;
    // Après fusion, garder le contrôle de l'ensemble (sinon on attend).
    const ratio = t.sharePrice / Math.max(m.sharePrice, 0.01);
    const mine2 = held(m, v.you) + held(t, v.you) * ratio;
    const S2 = m.sharesOutstanding + t.sharesOutstanding * ratio;
    let maxOther = 0;
    for (const [pid, h] of Object.entries(m.holdings)) if (pid !== v.you) maxOther = Math.max(maxOther, h + (t.holdings[pid] ?? 0) * ratio);
    if (maxOther > 0.45 * S2 || mine2 < maxOther) continue;
    io.act({ type: 'merge', absorberId: main.id, targetId: t.id });
  }
}

/** Dernier tour : le cours de clôture est la cible sans inertie (§6.1) ; on achète ce qui cote nettement en dessous. */
function closingArbitrage(io: BotIO): void {
  const v = io.view();
  let cash = me(v).cash - 100;
  const cands = active(v)
    .filter((c) => c.floatShares > 50 && c.sharePrice > 0 && c.controllerId !== v.you)
    .map((c) => ({ c, edge: fairPrice(v, c) / c.sharePrice }))
    .sort((a, b) => b.edge - a.edge);
  for (const { c, edge } of cands) {
    if (edge < 1.12 || cash < 300) break;
    // Taille telle que le prix moyen reste sous le juste prix / 1,05.
    const maxN = Math.floor(c.sharesOutstanding * Math.log(edge / 1.05) * 2);
    const n = Math.min(c.floatShares, maxN, sharesFor(c, cash));
    if (n >= 1 && io.act({ type: 'buyShares', companyId: c.id, shares: n }).ok) cash = me(io.view()).cash - 100;
  }
}

/** Levier maîtrisé : dette perso sous le plafond visé (+ 10 points) ; tout rembourser en fin de partie si le cash le permet. */
function deleverage(io: BotIO, left: number, riskTolerance: number): void {
  const v = io.view();
  const my = me(v);
  if (my.debt <= 0) return;
  if (my.debt / Math.max(my.portfolioValue, 1) > P.ltvBase + 0.1 + P.ltvRisk * riskTolerance || left <= 1) {
    const amount = Math.min(my.debt, my.cash - 50);
    if (amount >= 10) io.act({ type: 'repayPersonalLoan', amount });
  }
}

/** Lanceur d'alerte contre le joueur le plus riche devant soi dont la jauge publique est au moins « moyenne ». */
function whistlePlay(io: BotIO): void {
  const v = io.view();
  if (v.turn < 2 || v.self?.whistleblownThisTurn || me(v).cash < WHISTLEBLOW_COST + 300) return;
  const my = me(v).netWorth;
  for (const r of v.players.filter((p) => p.id !== v.you && p.netWorth > my).sort((a, b) => b.netWorth - a.netWorth)) {
    const c = v.companies.filter((x) => x.status === 'active' && x.controllerId === r.id && x.scandalLevel !== 'faible').sort((a, b) => b.marketCap - a.marketCap)[0];
    if (c) {
      io.act({ type: 'whistleblow', companyId: c.id });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Tour d'un bot expert
// ---------------------------------------------------------------------------

export function expertTurn(io: BotIO, pers: BotPersonality): void {
  P = activeParams;
  const view = io.view();
  if (view.phase !== 'playing') return;
  const T = view.config.totalTurns;
  const left = turnsLeft(view);
  const weight = scoreWeight(T);
  const raider = pers.aggressiveness >= 0.3;
  const shady = pers.shadyPropensity >= 0.3;
  const shortages = rumoredShortages(view);
  const mem = io.memory();
  recalibrate(view, mem);

  // 1. Industrie, pondérée par le score final ; matières achetées d'avance sur une pénurie annoncée « élevée ».
  for (const c of mine(view)) {
    const extra = new Map<CommodityId, number>();
    for (const cid of shortages) {
      let need = 0;
      for (const p of c.products) need += (SECTORS[p.sectorId].inputs[cid] ?? 0) * p.capacity * 2;
      const have = c.private?.inventory[cid]?.lots ?? 0;
      if (need - have >= 1) extra.set(cid, need - have);
    }
    const boost = boostOf(mem, c);
    const gw = shady && planGreenwashing(view, c, weight, boost) && scandalRoom(c, true) >= SHADY_COSTS.greenwashing.scandal;
    const pretax = manageCompany(view, io, c, { weight, revenueCredit: left <= 5 ? P.revenueCreditLate : P.revenueCredit, green: gw ? 1.3 : 1, extraMaterials: extra, boost, mem });
    sellSpeculativeStock(view, io, c);
    if (shady) shadyPlan(view, io, c, gw, weight, pers.shadyPropensity >= 0.6, boost);
    defend(view, io, c, 0.3 + 0.5 * pers.riskTolerance);
    const now = fresh(io, c.id);
    // Un emplacement reste libre chez les conquérants, pour fusionner une entreprise rachetée.
    if (now) launchPlay(view, io, now, weight, P.launchMinLeft, (now.maxProducts ?? MAX_PRODUCTS) - (raider ? 1 : 0), pretax, boost('__new__'), pers);
  }

  // 2. Argent perso : bonus sous le seuil de scandale, pas dans les deux derniers tours (le sentiment pèse sur la clôture).
  if (left >= 2) for (const c of mine(io.view())) safeBonus(io, c, P.bonusBase + P.bonusGreed * pers.greed);

  // 3. Bourse : sortie crypto sur signaux publics, alerte, paris de valeur, OPA, fusions, contrôle, fin de partie.
  const cryptoSold = cryptoExitPlay(io, pers);
  if (raider) whistlePlay(io);
  if (raider) valuePlay(io, pers.riskTolerance, cryptoSold);
  if (raider && left >= 2 && view.turn >= 3) takeoverPlay(io, pers.riskTolerance);
  mergePlay(io);
  consolidate(io, left, pers.riskTolerance, cryptoSold);
  if (left === 0) closingArbitrage(io);
  deleverage(io, left, pers.riskTolerance);
  // L'unique com' de crise du tour, en dernier (après les achats d'actions et les combines).
  for (const c of mine(io.view())) scrubScandal(io, c);

  // Plus d'entreprise : start-up de retour en jeu dans le secteur le plus prometteur.
  const v2 = io.view();
  if (mine(v2).length === 0 && me(v2).cash >= 2500 && turnsLeft(v2) >= 4 && !v2.self?.soldControlThisTurn?.length) {
    const sectorId = bestSectorForEntry(v2);
    const investment = Math.floor(Math.min(me(v2).cash * 0.6, 8000));
    const hexId = isSpatialMap(v2.config) ? launchHex(v2, sectorId) : undefined;
    const budget = investment + (v2.self?.startupSubsidy ?? 1000);
    const reserve = hexId ? hexReservePrice(hexId) : 0;
    const value = hexId ? (sectorOf(v2, sectorId).launchByHex?.[hexId]?.quarterlyProfit ?? 0) * turnsLeft(v2) : 0;
    const bid = hexId ? botHexBid(pers, reserve, value, budget) : undefined;
    if (!isSpatialMap(v2.config) || (hexId && bid !== undefined)) {
      io.act({ type: 'foundStartup', name: io.startupName(), sectorId, investment, ...(hexId ? { hexId, bid, fallback: 'nearest' as const } : {}) });
    }
  }
}
