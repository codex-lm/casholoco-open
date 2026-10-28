/**
 * Règles reprises de docs/GAME_DESIGN.md pour les ESTIMATIONS affichées côté client.
 * Le serveur reste seul juge : ces chiffres servent à prévisualiser, pas à décider.
 *
 * Les constantes numériques viennent du moteur (@muchomoney/core, sim/constants.ts) ;
 * ce fichier ajoute les formules d’estimation et les métadonnées d’affichage.
 * Si une formule change dans la spec, la mettre à jour ici aussi.
 */
import type { CommodityId, CompanyView, ModifierKind, ScandalLevel, SectorId, ShadyKind, SupplyContract } from '@muchomoney/core';
import {
  BONUS_CAP,
  BONUS_SCANDAL_PER_TRANCHE,
  BONUS_TRANCHE,
  COMMODITIES,
  COMMODITY_CAP_RATIO,
  COMMODITY_IDS,
  COMMODITY_FLOOR_RATIO,
  COMMODITY_SELL_DISCOUNT,
  CONTROLLED_COLLATERAL_LTV as CORE_CONTROLLED_COLLATERAL_LTV,
  CRISIS_COMMS_COST as CORE_CRISIS_COMMS_COST,
  CRISIS_COMMS_REPUTATION as CORE_CRISIS_COMMS_REPUTATION,
  CRISIS_COMMS_SCANDAL as CORE_CRISIS_COMMS_SCANDAL,
  EMERGENCY_PURCHASE_PREMIUM,
  FLOAT_MIN as CORE_FLOAT_MIN,
  HQ_COST as CORE_HQ_COST,
  impactBuyTotal,
  impactPriceAfter,
  impactSellTotal,
  impactUnitsForBudget,
  INSIDER_FLASH_MIN,
  INSIDER_SCANDAL_PER_PCT,
  LAUNCH_AMORTIZATION_TURNS as CORE_LAUNCH_AMORTIZATION_TURNS,
  MARGIN_CALL_LTV,
  MAX_PRODUCTS,
  MAX_PRODUCTS_MERGED as CORE_MAX_PRODUCTS_MERGED,
  MIN_STARTUP_INVESTMENT,
  PERSONAL_LOAN_LTV as CORE_PERSONAL_LOAN_LTV,
  PERSONAL_LOAN_SPREAD as CORE_PERSONAL_LOAN_SPREAD,
  POISON_PILL_COOLDOWN,
  POISON_PILL_DISCOUNT,
  POISON_PILL_ISSUE,
  POISON_PILL_SCANDAL,
  POISON_PILL_SENTIMENT,
  POISON_PILL_TRIGGER,
  PRICE_FLOOR,
  PRICE_MAX_RATIO,
  PRICE_MIN_RATIO,
  PRODUCTION_MAX_RATIO,
  SCANDAL_RISK_EXPONENT,
  SCANDAL_RISK_FLOOR,
  SCANDAL_RISK_SPAN,
  SECTORS,
  SHADY_COSTS,
  START_SHARES,
  STAKE_THRESHOLDS,
  STARTUP_FOUNDER_STAKE,
  STARTUP_SUBSIDY as CORE_STARTUP_SUBSIDY,
  WHISTLEBLOW_COST as CORE_WHISTLEBLOW_COST,
  WHISTLEBLOW_SCANDAL as CORE_WHISTLEBLOW_SCANDAL,
  CRISIS_COMMS_REPUTATION_CAP as CORE_CRISIS_COMMS_REPUTATION_CAP,
  PE_MULTIPLE,
  ESPIONAGE_GAP_SHARE,
} from '@muchomoney/core';

// §3 Bonus du PDG
export const CEO_BONUS_CAP_PCT = BONUS_CAP;
export const CEO_BONUS_SCANDAL_PER_TRANCHE = BONUS_SCANDAL_PER_TRANCHE;
export const CEO_BONUS_TRANCHE_PCT = BONUS_TRANCHE;
// §6.3 Contrôle
export const CONTROL_THRESHOLD = 0.5;
export const STAKE_FLASH_THRESHOLDS = [...STAKE_THRESHOLDS].sort((a, b) => a - b);
// §6.4 Prêt personnel : taux de base + 0,5 pt ; plafond 50 % du portefeuille (25 % pour les entreprises
// que l'on contrôle) ; appel de marge à 80 %
export const PERSONAL_LOAN_SPREAD = CORE_PERSONAL_LOAN_SPREAD;
export const PERSONAL_LOAN_LTV = CORE_PERSONAL_LOAN_LTV;
export const CONTROLLED_LOAN_LTV = CORE_CONTROLLED_COLLATERAL_LTV;
// §6.2 Délit d'initié : le contrôleur qui achète ses propres actions (+1 de jauge par 1 % du capital)
export const INSIDER_FLASH_PCT = INSIDER_FLASH_MIN;
/** Hausse de la jauge de scandale si le contrôleur achète n actions sur S (§6.2). */
export function insiderScandal(n: number, shares: number, multiplier = 1): number {
  if (!(n > 0) || !(shares > 0)) return 0;
  return ((INSIDER_SCANDAL_PER_PCT * 100 * n) / shares) * multiplier;
}
export const MARGIN_CALL_RATIO = MARGIN_CALL_LTV;
// §7 Startup
export const STARTUP_MIN_INVESTMENT = MIN_STARTUP_INVESTMENT;
export const STARTUP_SUBSIDY = CORE_STARTUP_SUBSIDY;
export const STARTUP_SHARES = START_SHARES;
export const STARTUP_FOUNDER_PCT = STARTUP_FOUNDER_STAKE;
/** Cours d'introduction = (investissement + subvention) / 10 000 (§7). La subvention vaut au moins le parachute reçu. */
export function startupInitialPrice(investment: number, subsidy: number = STARTUP_SUBSIDY): number {
  return Math.max(PRICE_FLOOR, (investment + subsidy) / STARTUP_SHARES);
}
/** Start-up de retour en jeu (§7) : réservée au joueur qui ne contrôle plus aucune entreprise active. */
export function canFoundStartup(
  companies: Pick<CompanyView, 'controllerId' | 'status'>[],
  playerId: string,
  soldControlThisTurn: readonly string[] = [],
): boolean {
  // Céder le contrôle en vendant ce trimestre repousse la start-up au trimestre suivant (§7).
  return soldControlThisTurn.length === 0 && !companies.some((c) => c.status === 'active' && c.controllerId === playerId);
}
// §7 Lanceur d'alerte : cash perso, une fois par tour ; jauge de la cible doublée dans la limite de +15
export const WHISTLEBLOW_COST = CORE_WHISTLEBLOW_COST;
export const WHISTLEBLOW_SCANDAL = CORE_WHISTLEBLOW_SCANDAL;
// §6.1 Valorisation : cours ≈ (valeur comptable + 40 × bénéfice lissé) / actions
export const PROFIT_MULTIPLE = PE_MULTIPLE;
// §6.2 Flottant minimal
export const FLOAT_MIN_PCT = CORE_FLOAT_MIN;
/** Le moteur refuse de dépasser 50 % + 1 action si le flottant doit tomber sous FLOAT_MIN (40 %) du capital (§6.2). */
function breachesFloatMin(holding: number, float: number, shares: number): boolean {
  return holding > Math.floor(shares / 2) + 1 && float < CORE_FLOAT_MIN * shares - 1e-6;
}
/** Plus gros achat perso permis par le flottant minimal (§6.2), comme dans le moteur. */
export function floatMinBuyMax(held: number, float: number, shares: number): number {
  const f = Math.max(0, Math.floor(float));
  if (!breachesFloatMin(held + f, float - f, shares)) return f;
  return Math.min(f, Math.max(Math.floor(shares / 2) + 1 - held, Math.floor(float - CORE_FLOAT_MIN * shares + 1e-6), 0));
}
/** Plus gros rachat d'actions permis par le flottant minimal (§6.2), comme dans le moteur. */
export function floatMinBuybackMax(c: Pick<CompanyView, 'holdings' | 'floatShares' | 'sharesOutstanding'>): number {
  const top = Math.max(0, ...Object.values(c.holdings));
  const breach = (k: number) => breachesFloatMin(top, c.floatShares - k, c.sharesOutstanding - k);
  let lo = 0;
  let hi = Math.max(0, Math.floor(c.floatShares));
  if (!breach(hi)) return hi;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (breach(mid)) hi = mid - 1;
    else lo = mid;
  }
  return lo;
}
/**
 * Espionnage industriel (§7) : produits de `company` distancés en qualité par `target` (ou par n'importe quel
 * concurrent actif si `target` est absent), avec le gain attendu (30 % de l'écart). Vide : rien à copier.
 */
export function espionageGains(
  company: CompanyView,
  companies: CompanyView[],
  targetId?: string,
): { productId: string; name: string; gain: number }[] {
  const out: { productId: string; name: string; gain: number }[] = [];
  for (const p of company.products) {
    let best = 0;
    for (const o of companies) {
      if (o.status !== 'active' || o.id === company.id || (targetId && o.id !== targetId)) continue;
      for (const op of o.products) if (op.sectorId === p.sectorId) best = Math.max(best, op.quality);
    }
    if (best > p.quality + 1e-9) out.push({ productId: p.id, name: p.name, gain: ESPIONAGE_GAP_SHARE * (best - p.quality) });
  }
  return out;
}
// §7 Produits (le coût d'un lancement est passé en charge sur 4 trimestres, §5.6)
export const MAX_ACTIVE_PRODUCTS = MAX_PRODUCTS;
/** Une entreprise issue d'une fusion peut porter 6 produits (§7). */
export const MAX_ACTIVE_PRODUCTS_MERGED = CORE_MAX_PRODUCTS_MERGED;
export { productCount } from '@muchomoney/core';
export function maxProductsOf(c: Pick<CompanyView, 'maxProducts'>): number {
  return c.maxProducts ?? MAX_PRODUCTS;
}
export const LAUNCH_AMORTIZATION_TURNS = CORE_LAUNCH_AMORTIZATION_TURNS;
export const PRICE_MIN_PCT = PRICE_MIN_RATIO;
export const PRICE_MAX_PCT = PRICE_MAX_RATIO;
export const PRODUCTION_MAX_FACTOR = PRODUCTION_MAX_RATIO;
// §7 Communication de crise
export const CRISIS_COMMS_COST = CORE_CRISIS_COMMS_COST;
export const CRISIS_COMMS_SCANDAL = CORE_CRISIS_COMMS_SCANDAL;
export const CRISIS_COMMS_REPUTATION = CORE_CRISIS_COMMS_REPUTATION;
export const CRISIS_COMMS_REPUTATION_CAP = CORE_CRISIS_COMMS_REPUTATION_CAP;
// §5.3, §5.5
export const HQ_COST = CORE_HQ_COST;
export const EMERGENCY_PURCHASE_MARKUP = EMERGENCY_PURCHASE_PREMIUM;
export const COMMODITY_SELL_HAIRCUT = COMMODITY_SELL_DISCOUNT;
// §7 Pilule empoisonnée
export const POISON_PILL = {
  triggerPct: POISON_PILL_TRIGGER,
  newSharesPct: POISON_PILL_ISSUE,
  pricePct: POISON_PILL_DISCOUNT,
  scandal: POISON_PILL_SCANDAL,
  sentiment: POISON_PILL_SENTIMENT,
  cooldown: POISON_PILL_COOLDOWN,
};
// §8 Scandales : niveaux publics et probabilité d'éclatement
export const SCANDAL_LEVEL_THRESHOLDS = { moyen: 30, eleve: 60 };
/** Niveau d'une jauge de scandale (« faible » sous 30, « moyen » sous 60, « élevé » ensuite), comme la jauge l'affiche. */
export function scandalLevelOf(scandal: number): ScandalLevel {
  const { moyen, eleve } = SCANDAL_LEVEL_THRESHOLDS;
  return scandal < moyen ? 'faible' : scandal < eleve ? 'moyen' : 'élevé';
}
/** Probabilité d'éclatement à la clôture : clamp((jauge − 10) / 90, 0, 1)^1,5 (§8). */
export function scandalRisk(scandal: number): number {
  const x = Math.min(1, Math.max(0, (scandal - SCANDAL_RISK_FLOOR) / SCANDAL_RISK_SPAN));
  return x ** SCANDAL_RISK_EXPONENT;
}

export type ShadyTarget = 'none' | 'sector' | 'competitor' | 'company';

/** Type de cible de chaque action discutable (l'effet, en texte, est dans i18n : t.shady.effects). */
const SHADY_TARGETS: Record<ShadyKind, ShadyTarget> = {
  lobbying: 'sector',
  tax_optimisation: 'none',
  greenwashing: 'none',
  industrial_espionage: 'competitor',
  offshoring: 'none',
  smear_campaign: 'company',
};

/** §7 : coût, scandale (depuis le moteur) et type de cible des actions discutables. */
export const SHADY_RULES = Object.fromEntries(
  (Object.keys(SHADY_TARGETS) as ShadyKind[]).map((k) => [k, { ...SHADY_COSTS[k], target: SHADY_TARGETS[k] }]),
) as Record<ShadyKind, { cost: number; scandal: number; target: ShadyTarget }>;

/** Effets en cours : pictogramme et sens (le libellé est dans i18n : t.modifiers). */
export const MODIFIER_INFO: Record<ModifierKind, { emoji: string; good: boolean }> = {
  tax_optimisation: { emoji: '🏝️', good: true },
  greenwashing: { emoji: '🌱', good: true },
  offshoring: { emoji: '✈️', good: true },
  lobbying: { emoji: '🤝', good: true },
  poison_pill_cooldown: { emoji: '💊', good: false },
};

// ---------------------------------------------------------------------------
// Marché et bourse
// ---------------------------------------------------------------------------

export function marketSize(sectorId: SectorId): number {
  const s = SECTORS[sectorId];
  return s ? s.refPrice * s.refDemand : 0;
}

// §5.4 : mêmes formules de qualité et de notoriété que la résolution.
export { brandAfter as nextBrand, qualityAfter as nextQuality } from '@muchomoney/core';

/** §6.2 : coût total pour acheter n actions (impact exponentiel : p × S × (e^(n/S) − 1)). */
export function shareBuyCost(price: number, n: number, shares: number): number {
  if (n <= 0 || shares <= 0) return 0;
  return impactBuyTotal(Math.max(price, PRICE_FLOOR), n, shares);
}

/** §6.2 : produit d'une vente de n actions (p × S × (1 − e^(−n/S))). */
export function shareSellProceeds(price: number, n: number, shares: number): number {
  if (n <= 0 || shares <= 0) return 0;
  return impactSellTotal(Math.max(price, 0), n, shares);
}

export function sharePriceAfter(price: number, n: number, shares: number, side: 'buy' | 'sell'): number {
  if (shares <= 0) return price;
  return impactPriceAfter(side === 'buy' ? Math.max(price, PRICE_FLOOR) : price, n, shares, side, PRICE_FLOOR);
}

/** Nombre max d'actions achetables avec `cash`, sans dépasser le flottant. */
export function maxAffordableShares(price: number, shares: number, cash: number, float: number): number {
  if (price <= 0 || shares <= 0 || cash <= 0) return 0;
  const n = impactUnitsForBudget(price, cash, shares);
  return Math.max(0, Math.floor(Math.min(n * 0.999, float)));
}

function commodityBounds(commodityId: CommodityId): { L: number; floor: number; cap: number } {
  const def = COMMODITIES[commodityId];
  const base = def?.basePrice ?? 0;
  return {
    L: Math.max(def?.liquidity ?? 500, 1),
    floor: base ? base * COMMODITY_FLOOR_RATIO : 0,
    cap: base ? base * COMMODITY_CAP_RATIO : Number.POSITIVE_INFINITY,
  };
}

/** §5.5 : coût d'achat de n lots de matière (même impact exponentiel, plafonné). */
export function commodityBuyCost(commodityId: CommodityId, price: number, n: number): number {
  if (n <= 0) return 0;
  const { L, cap } = commodityBounds(commodityId);
  return impactBuyTotal(price, n, L, cap);
}

export function commoditySellProceeds(commodityId: CommodityId, price: number, n: number): number {
  if (n <= 0) return 0;
  const { L, floor } = commodityBounds(commodityId);
  return COMMODITY_SELL_HAIRCUT * impactSellTotal(price, n, L, floor);
}

/** Lots maximum par ordre (achat ou vente) : le moteur refuse au-delà de la liquidité du marché. */
export function commodityOrderMax(commodityId: CommodityId): number {
  return Math.max(0, Math.floor(COMMODITIES[commodityId]?.liquidity ?? 500));
}

/** Prix après l'ordre, borné comme dans le moteur entre plancher et plafond (× prix de base). */
export function commodityPriceAfter(commodityId: CommodityId, price: number, n: number, side: 'buy' | 'sell'): number {
  const { L, floor, cap } = commodityBounds(commodityId);
  return impactPriceAfter(price, n, L, side, floor, cap);
}

/** Lots achetables avec `cash`, bornés par la liquidité (un seul ordre ne peut dépasser L). */
export function maxAffordableLots(commodityId: CommodityId, price: number, cash: number): number {
  const L = COMMODITIES[commodityId]?.liquidity ?? 500;
  if (price <= 0 || cash <= 0) return 0;
  // Inverse du coût exponentiel sans plafond : borne prudente (le plafond ne fait que baisser le coût).
  return Math.min(commodityOrderMax(commodityId), Math.max(0, Math.floor(impactUnitsForBudget(price, cash, L) * 0.999)));
}

/** Lots vendables en un ordre : le stock entier, dans la limite de la liquidité. */
export function maxSellableLots(commodityId: CommodityId, stock: number): number {
  // Même tolérance que sellCommodity : les consommations décimales peuvent
  // laisser 0.9999999999999998 lot alors qu'un lot entier reste vendable.
  return Math.min(commodityOrderMax(commodityId), Math.max(0, Math.floor(stock + 1e-6)));
}

// ---------------------------------------------------------------------------
// Entreprises
// ---------------------------------------------------------------------------

export function holdingPct(c: CompanyView, playerId: string): number {
  if (!c.sharesOutstanding) return 0;
  return (c.holdings[playerId] ?? 0) / c.sharesOutstanding;
}

/**
 * Décimales d'une part du capital : une d'habitude, davantage autour de 50 % (seuil du contrôle, §6.3),
 * pour ne jamais afficher « 50,0 % » à qui détient 50 % + 1 action (contrôle) ou 49,99 % (pas de contrôle).
 */
export function pctDigits(ratio: number): number {
  if (ratio === CONTROL_THRESHOLD || Math.abs(ratio - CONTROL_THRESHOLD) >= 0.0005) return 1;
  for (let d = 2; d < 4; d++) if (Math.abs(ratio - CONTROL_THRESHOLD) * 100 >= 0.5 * 10 ** -d) return d;
  return 4;
}

/** Actions qu'il manque à ce joueur pour dépasser 50 % et prendre le contrôle (0 s'il le dépasse déjà). */
export function sharesToControl(c: CompanyView, playerId: string): number {
  return Math.max(0, Math.floor(c.sharesOutstanding / 2) + 1 - (c.holdings[playerId] ?? 0));
}

/** Plus gros actionnaire joueur autre que `playerId`. */
export function biggestOtherHolder(c: CompanyView, playerId: string): { id: string; pct: number } | null {
  let best: { id: string; pct: number } | null = null;
  for (const [id, n] of Object.entries(c.holdings)) {
    if (id === playerId || !c.sharesOutstanding) continue;
    const p = n / c.sharesOutstanding;
    if (!best || p > best.pct) best = { id, pct: p };
  }
  return best;
}

/** Secteurs couverts par les produits d'une entreprise (dans l'ordre d'apparition). */
export function companySectors(c: CompanyView): SectorId[] {
  const out: SectorId[] = [];
  for (const p of c.products) if (!out.includes(p.sectorId)) out.push(p.sectorId);
  return out;
}

/** Variation du cours depuis la dernière clôture (fin du trimestre précédent). */
export function priceChange(history: number[], current: number): number {
  const ref = history.length ? history[history.length - 1] : current;
  if (!ref) return 0;
  return current / ref - 1;
}

/** Besoins en matières pour produire `lots` d'un secteur. */
export function inputsFor(sectorId: SectorId, lots: number): Partial<Record<CommodityId, number>> {
  const out: Partial<Record<CommodityId, number>> = {};
  const inputs = SECTORS[sectorId]?.inputs ?? {};
  for (const [cid, q] of Object.entries(inputs) as [CommodityId, number][]) out[cid] = q * lots;
  return out;
}

/** Besoins en matières d'une entreprise pour la production décidée (bornée à la capacité), §5.3. */
export function companyNeeds(company: CompanyView): Partial<Record<CommodityId, number>> {
  const out: Partial<Record<CommodityId, number>> = {};
  for (const p of company.products) {
    const lots = Math.min(p.private?.production ?? 0, p.capacity);
    const need = inputsFor(p.sectorId, lots);
    for (const [cid, q] of Object.entries(need) as [CommodityId, number][]) out[cid] = (out[cid] ?? 0) + q;
  }
  return out;
}

/** Une matière d'une entreprise d'ici la prochaine production (lots). */
export interface CommodityOutlook {
  /** Consommé par la production prévue (plafonnée à la capacité). */
  need: number;
  /** En stock maintenant. */
  stock: number;
  /** Extrait à la clôture par ses filiales en service, si la trésorerie le paie. */
  sites: number;
  /** Livré à la clôture par les contrats où elle achète. */
  contractsIn: number;
  /** Dû à la clôture aux acheteurs de ses contrats ; ce qui dépasse `contractsOut` ne sera pas livré (pénalité, §7 bis). */
  owed: number;
  /** Livré à la clôture aux acheteurs de ses contrats, dans la limite du stock et de l'extraction. */
  contractsOut: number;
  /** Ce qui manquera à la production : acheté d'urgence. */
  missing: number;
  /** Ce qui restera en stock après la production (jamais vendu d'office). */
  surplus: number;
}

/**
 * Matières d'une entreprise d'ici la prochaine production, dans l'ordre de la clôture (§5.3, §5.5 bis, §5.7, §7 bis) :
 * les filiales en service extraient ce que la production et les contrats demandent, puis du surplus tant que la
 * trésorerie le paie ; les contrats livrent (le vendeur, sur son stock et son extraction), puis la production puise
 * dans le stock ; ce qui manque est acheté d'urgence, ce qui reste demeure en stock. L'extraction vient du plan de
 * clôture du moteur (`private.closePlan`, le calcul même de la résolution) ; sans lui, chaque filiale en service est
 * comptée à pleine capacité.
 */
export function commodityOutlook(company: CompanyView, turn: number, contracts: readonly SupplyContract[] = []): Record<CommodityId, CommodityOutlook> {
  const needs = companyNeeds(company);
  const inv = company.private?.inventory ?? {};
  const out = {} as Record<CommodityId, CommodityOutlook>;
  for (const cid of COMMODITY_IDS) {
    out[cid] = { need: needs[cid] ?? 0, stock: inv[cid]?.lots ?? 0, sites: 0, contractsIn: 0, owed: 0, contractsOut: 0, missing: 0, surplus: 0 };
  }
  const plan = company.private?.closePlan;
  if (plan) {
    for (const s of plan.sites) if (out[s.commodityId]) out[s.commodityId].sites += s.needed + s.surplus;
  } else {
    for (const s of company.sites ?? []) if (!s.dormant && s.activeFrom <= turn) out[s.commodityId].sites += s.capacity;
  }
  for (const k of contracts) {
    if (!(k.turnsLeft > 0) || !out[k.commodityId]) continue;
    if (k.buyerCompanyId === company.id) out[k.commodityId].contractsIn += k.lots;
    if (k.sellerCompanyId === company.id) out[k.commodityId].owed += k.lots;
  }
  for (const cid of COMMODITY_IDS) {
    const o = out[cid];
    const available = o.stock + o.sites;
    o.contractsOut = Math.min(o.owed, available);
    const forProduction = available - o.contractsOut + o.contractsIn;
    o.missing = Math.max(0, o.need - forProduction);
    o.surplus = Math.max(0, forProduction - o.need);
  }
  return out;
}

/** Lots de matières qui manqueront à la production décidée (achetés en urgence à la clôture). */
export function commodityShortfall(company: CompanyView, turn?: number, contracts: readonly SupplyContract[] = []): number {
  // Sans le trimestre, on ne sait pas quelles filiales tournent : on n'en compte aucune.
  const outlook = commodityOutlook(company, turn ?? Number.NEGATIVE_INFINITY, contracts);
  return Object.values(outlook).reduce((sum, o) => sum + o.missing, 0);
}

// ---------------------------------------------------------------------------
// Contrôle : qui dépasserait 50 % après un rachat ou une fusion (§ contrôle, checkControl)
// ---------------------------------------------------------------------------

/** Autre joueur que `playerId` qui détiendrait strictement plus de 50 % de `shares` actions (le plus gros). */
export function rivalAboveControl(
  holdings: Record<string, number>,
  shares: number,
  playerId: string,
): { id: string; pct: number } | null {
  if (!(shares > 0)) return null;
  let best: { id: string; pct: number } | null = null;
  for (const [id, n] of Object.entries(holdings)) {
    if (id === playerId || !(n > shares / 2)) continue;
    const pct = n / shares;
    if (!best || pct > best.pct) best = { id, pct };
  }
  return best;
}

/** Rachat de n actions : le rival qui passerait au-dessus de 50 % (et prendrait le contrôle), s'il existe. */
export function buybackRivalTakeover(c: CompanyView, playerId: string, n: number): { id: string; pct: number } | null {
  return rivalAboveControl(c.holdings, c.sharesOutstanding - Math.max(0, n), playerId);
}

/** Plus grand rachat qui laisse chaque autre joueur à 50 % ou moins : n ≤ S − 2 × (plus gros rival). */
export function safeBuybackMax(c: CompanyView, playerId: string): number {
  let maxOther = 0;
  for (const [id, n] of Object.entries(c.holdings)) if (id !== playerId && n > maxOther) maxOther = n;
  return Math.max(0, Math.floor(c.sharesOutstanding - 2 * maxOther));
}

/**
 * Fusion (absorber absorbe target) : projection des avoirs comme dans le moteur
 * (parité = cours cible / cours absorbeur ; floor par porteur, flottant arrondi).
 */
export function projectMerge(absorber: CompanyView, target: CompanyView): { holdings: Record<string, number>; shares: number; ratio: number } {
  const ratio = target.sharePrice / Math.max(absorber.sharePrice, PRICE_FLOOR);
  const holdings: Record<string, number> = { ...absorber.holdings };
  let issued = 0;
  for (const [id, h] of Object.entries(target.holdings)) {
    const n = Math.floor(h * ratio);
    if (n > 0) {
      holdings[id] = (holdings[id] ?? 0) + n;
      issued += n;
    }
  }
  issued += Math.round(Math.max(0, target.floatShares) * ratio);
  return { holdings, shares: absorber.sharesOutstanding + issued, ratio };
}

/** Fusion : le joueur (autre que `playerId`) qui dépasserait 50 % de l'ensemble fusionné. */
export function mergeRivalTakeover(absorber: CompanyView, target: CompanyView, playerId: string): { id: string; pct: number } | null {
  const p = projectMerge(absorber, target);
  return rivalAboveControl(p.holdings, p.shares, playerId);
}
