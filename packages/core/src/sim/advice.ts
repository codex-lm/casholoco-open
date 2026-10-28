import { hexLaborFactor, proximityByHex } from './hexes';
import { capitalCellId, isSpatialMap } from '../content/hexes';
import { terrainMultiplier, terrainPlantMultiplier, effectiveFixedCost, effectiveHeatCredit } from './terrains';
/**
 * Aides de lecture pour les débutants (§12) : estimation des ventes d'un produit, rentabilité d'un lancement,
 * relation entre cours et bénéfice lissé. Les fonctions pures (sans GameState) sont réexportées par
 * `@muchomoney/core` : le client peut recalculer une estimation quand le joueur bouge son prix.
 * Aucune ne consomme le RNG ni ne mute l'état.
 */
import { DEFAULT_ZONE, SECTORS } from '../content';
import { CITY_IDS, ZONE_IDS, type CityId, type CommodityId, type CompanyState, type GameState, type Id, type MarketEstimateInputs, type ProductState, type SalesEstimate, type SectorId, type ZoneId } from '../types';
import {
  DEMAND_MEAN_REVERSION,
  EMERGENCY_PURCHASE_PREMIUM,
  GREENWASHING_BONUS,
  LOBBYING_MULT,
  LOBBYING_TURNS,
  LOSS_MULTIPLE,
  MARKETING_SCALE_RATIO,
  OUTSIDE_QUALITY_GROWTH,
  PE_MULTIPLE,
  PRICE_MAX_RATIO,
  PRICE_MIN_RATIO,
  RND_SCALE_RATIO,
  START_BRAND,
  START_QUALITY,
} from './constants';
import { clamp, fin } from './util';
import { seesCurrentPrice } from './deals';
import { unitCostByHex, unitCostByZone } from './finance';
import { hexReservePrice } from './hexAuctions';
import { away, byCity, cityArray, cityTotals, cityWeights, demandIn, demandInHex, marketEntry, productAway, proximity, type MarketEntry } from './regions';
import { portOnlyTransport, portOnlyTransportHex, transportFactor, zoneLaborFactor } from './transport';
import { hasPlannedSupply, marketDemandMultiplier } from './marketDemand';
import { startingDecisions } from './opening';
import { budgetFactory, factoryAttractivenessWeight, productProfile } from './industry';

function marketSizeOf(sectorId: SectorId): number {
  const d = SECTORS[sectorId];
  return d.refPrice * d.refDemand;
}

/** Notoriété après un trimestre de marketing (§5.4). */
export function brandAfter(sectorId: SectorId, brand: number, marketing: number, budgetMultiplier = 1): number {
  const def = SECTORS[sectorId];
  const scale = MARKETING_SCALE_RATIO * marketSizeOf(sectorId);
  const persistence = def.brandPersistence ?? 0.75;
  return clamp(fin(persistence * brand + (1 - persistence) * ((def.brandBase ?? 0.3) + Math.log(1 + (Math.max(0, marketing) * budgetMultiplier * (def.marketingMultiplier ?? 1)) / scale)), 0.3), 0, 10);
}

/** Qualité après un trimestre de R&D (§5.4). */
export function qualityAfter(sectorId: SectorId, quality: number, rnd: number, budgetMultiplier = 1): number {
  const def = SECTORS[sectorId];
  const scale = RND_SCALE_RATIO * marketSizeOf(sectorId);
  const q = Math.max(quality, 0.1);
  return clamp(fin(q * (def.qualityDecay ?? 0.99) + (0.5 * Math.log(1 + (Math.max(0, rnd) * budgetMultiplier * (def.rndMultiplier ?? 1)) / scale)) / q, 1), 0.1, 20);
}

/** Outside competition follows the sector's own innovation pace. */
export function outsideQuality(sectorId: SectorId, turn: number): number {
  return 1 + (SECTORS[sectorId].outsideQualityGrowth ?? OUTSIDE_QUALITY_GROWTH) * Math.max(0, turn - 1);
}

export function outsideAttractiveness(sectorId: SectorId, turn: number): number {
  const def = SECTORS[sectorId];
  return def.outsideAttractiveness * Math.pow(outsideQuality(sectorId, turn), def.qualityExponent ?? 1.3);
}

/** Apply the same demand-news sensitivity in forecasts and realized markets. */
export function sectorNewsMultiplier(sectorId: SectorId, multiplier: number): number {
  return Math.pow(Math.max(0, multiplier), SECTORS[sectorId].newsSensitivity ?? 1);
}

/** Attractivité d'un produit dans le logit (§5.2). */
export function productAttractiveness(sectorId: SectorId, quality: number, brand: number, reputation: number, price: number, bonus = 1): number {
  const def = SECTORS[sectorId];
  const a =
    Math.pow(Math.max(quality, 0.01), def.qualityExponent ?? 1.3) *
    (0.5 + Math.max(brand, 0)) *
    Math.max(reputation, 0) *
    Math.pow(def.refPrice / Math.max(price, 1e-6), def.elasticity) *
    bonus;
  return Math.max(0, fin(a));
}

/** Décisions d'un produit dont on estime les ventes. */
export interface EstimateDecisions {
  quality: number; // qualité actuelle (avant la R&D du trimestre)
  brand: number; // notoriété actuelle (avant le marketing du trimestre)
  price: number;
  production: number;
  capacity: number;
  stock: number;
  marketing: number;
  rnd: number;
}

/** Shared attractiveness and national market-size response, preserving the ordinary estimate's arithmetic. */
function estimatedDemandInputs(sectorId: SectorId, market: MarketEstimateInputs, d: EstimateDecisions): { a: number; D: number } {
  const quality = qualityAfter(sectorId, d.quality, d.rnd, market.rndMultiplier);
  const brand = brandAfter(sectorId, d.brand, d.marketing, market.marketingMultiplier);
  const a = hasPlannedSupply(d) ? productAttractiveness(sectorId, quality, brand, market.reputation, d.price * (market.priceMultiplier ?? 1), market.bonus) * (market.attractivenessWeight ?? 1) : 0;
  const priceMass = market.othersPriceAttractiveness ?? market.othersAttractiveness * SECTORS[sectorId].refPrice;
  const D = market.demand * marketDemandMultiplier(sectorId, market.othersAttractiveness + a, priceMass + a * d.price);
  return { a, D };
}

/** Expected customer demand in the five city markets, using the same inputs as the national forecast. */
export function estimateDemandByCity(sectorId: SectorId, market: MarketEstimateInputs, d: EstimateDecisions): Record<CityId, number> {
  const { a, D } = estimatedDemandInputs(sectorId, market, d);
  const weights = cityWeights(sectorId);
  const factors = market.hexId !== undefined ? proximityByHex(sectorId, market.hexId) : proximity(sectorId, market.zoneId ?? DEFAULT_ZONE);
  return Object.fromEntries(CITY_IDS.map((city) => {
    const mine = a * factors[city];
    const total = mine + Math.max(0, market.othersByCity?.[city] ?? market.othersAttractiveness);
    return [city, (total > 0 ? fin(Math.max(0, D) * weights[city] * mine / total) : 0) * (market.demandMultiplier ?? 1)];
  })) as Record<CityId, number>;
}

/** Expected sales and quarterly margin, without the demand shock and using known rival prices (§5.2). */
export function estimateSales(sectorId: SectorId, market: MarketEstimateInputs, d: EstimateDecisions, zoneId: ZoneId | undefined = market.zoneId): SalesEstimate {
  const { a, D } = estimatedDemandInputs(sectorId, market, d);
  const rawDemand = market.hexId !== undefined
    ? demandInHex(sectorId, D, a, market.hexId, market.othersAttractiveness, market.othersByCity ? cityArray(market.othersByCity) : undefined)
    : demandIn(sectorId, D, a, zoneId, market.othersAttractiveness, market.othersByCity ? cityArray(market.othersByCity) : undefined);
  const demand = rawDemand * (market.demandMultiplier ?? 1);
  const produced = Math.max(0, Math.floor(Math.min(Math.max(0, d.production), Math.max(0, d.capacity))));
  const sales = Math.max(0, Math.min(demand, Math.max(0, d.stock) + produced));
  const revenue = fin(sales * d.price);
  const margin = fin(revenue - produced * market.unitCost - (Math.max(0, d.marketing) + Math.max(0, d.rnd)) * (market.budgetShare ?? 1) - market.fixedCost);
  return { demand, sales, revenue, margin };
}

/**
 * Trimestres pour rentabiliser un lancement : un trimestre d'attente (le produit vend à partir du trimestre
 * suivant, §7), puis le coût divisé par le bénéfice trimestriel du produit. null si ce bénéfice est ≤ 0.
 */
export function launchPaybackQuarters(launchCost: number, quarterlyProfit: number): number | null {
  if (!(quarterlyProfit > 0) || !Number.isFinite(launchCost)) return null;
  return 1 + Math.max(1, Math.ceil(Math.max(0, launchCost) / quarterlyProfit));
}

/**
 * Relation cours / bénéfice (§6.1), sans le plancher, la croissance ni le sentiment :
 * cours ≈ (valeur comptable + 40 × bénéfice lissé) / actions (multiple 8 si le bénéfice lissé est négatif).
 */
export function valuationPerShare(bookValue: number, smoothedProfit: number, shares: number): number {
  const earnings = smoothedProfit >= 0 ? PE_MULTIPLE * smoothedProfit : LOSS_MULTIPLE * smoothedProfit;
  return fin((bookValue + earnings) / Math.max(shares, 1));
}

// ---------------------------------------------------------------------------
// Estimations tirées de l'état (utilisées par la vue joueur)
// ---------------------------------------------------------------------------

/**
 * Demande attendue d'un secteur au tour `turn` : le retour vers 1 du multiplicateur, sans le choc aléatoire (§5.1).
 * Avec `viewerId`, le lobbying décidé ce tour par une entreprise que `viewerId` ne contrôle pas est ignoré :
 * c'est une décision cachée jusqu'à la résolution (§12).
 */
export function expectedSectorDemand(state: GameState, sectorId: SectorId, turn = state.turn, viewerId?: Id | null): number {
  const def = SECTORS[sectorId];
  const s = state.sectors[sectorId];
  const steps = Math.max(1, turn - state.turn + 1);
  let dm = Math.max(s.demandMultiplier, 1e-3);
  for (let i = 0; i < steps; i++) dm = Math.pow(dm, DEMAND_MEAN_REVERSION);
  let D = def.refDemand * clamp(dm, 0.2, 5) * Math.pow(1 + def.growth, turn - 1);
  for (const e of state.activeEffects) {
    if (e.kind === 'sectorDemand' && (e.sectorId === sectorId || e.sectorId === 'all') && e.turnsLeft > turn - state.turn) D *= sectorNewsMultiplier(sectorId, e.value);
  }
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    const hideFresh = viewerId !== undefined && (viewerId === null || c.controllerId !== viewerId);
    for (const m of c.modifiers) {
      // Un lobbying pris ce tour a encore toute sa durée (le décompte se fait à la résolution).
      if (hideFresh && m.kind === 'lobbying' && m.turnsLeft >= LOBBYING_TURNS) continue;
      if (m.kind === 'lobbying' && m.sectorId === sectorId && m.turnsLeft > turn - state.turn) D *= m.value ?? LOBBYING_MULT;
    }
  }
  return Math.max(0, fin(D));
}

/** Un produit est en rayon s'il a de la capacité ou du stock (un produit lancé ce tour n'y est pas encore). */
export function onShelf(p: ProductState): boolean {
  return p.capacity > 0 || p.stock > 0;
}

/**
 * Prix d'un produit tel que le voit `viewerId` : le prix courant s'il contrôle l'entreprise ou s'il s'entend avec
 * elle sur ce secteur (§7 bis), sinon celui du trimestre précédent.
 */
export function shownPrice(state: GameState, c: CompanyState, p: ProductState, viewerId: Id | null): number {
  return seesCurrentPrice(state, viewerId, c, p.sectorId) ? p.price : (p.lastPrice ?? p.price);
}

/**
 * Σ attractivité des produits en rayon d'un secteur (hors `excludeId`), aux prix connus de `viewerId`
 * et à la qualité et la notoriété publiques, plus les « autres concurrents » (§5.2).
 */
export function knownOthersAttractiveness(state: GameState, sectorId: SectorId, viewerId: Id | null, excludeId: Id | null, turn = state.turn): number {
  return knownOthersByCity(state, sectorId, viewerId, excludeId, turn).total;
}

/**
 * La même somme, et ville par ville (ordre de `CITY_IDS`, §5.2 bis) quand l'un de ces produits a son usine hors de la
 * capitale : chacun pèse son attractivité × son facteur à la ville (1 + localBonus dans la ville de son usine, 1 sinon).
 * Données publiques seulement (zones, qualité, notoriété, réputation, prix connus).
 */
export function knownOthersByCity(state: GameState, sectorId: SectorId, viewerId: Id | null, excludeId: Id | null, turn = state.turn, plannedCompanyId?: Id): { total: number; priceAttractiveness: number; byCity?: number[] } {
  const def = SECTORS[sectorId];
  const outside = outsideAttractiveness(sectorId, turn);
  let total = outside;
  let priceAttractiveness = outside * def.refPrice;
  const entries: MarketEntry[] = [];
  let regional = false;
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    const green = c.controllerId === viewerId && c.modifiers.some((m) => m.kind === 'greenwashing' && m.turnsLeft > 0) ? GREENWASHING_BONUS : 1;
    for (const p of c.products) {
      if (p.sectorId !== sectorId || p.id === excludeId) continue;
      // Own supply plans are known; rivals' production and stock remain private. For a future
      // quarter, ordered capacity can participate once installed, as in launch advice.
      const knownSupply = c.id === plannedCompanyId || (viewerId !== null && c.controllerId === viewerId);
      const capacity = p.capacity + (turn > state.turn ? p.pendingCapacity : 0);
      if (knownSupply ? !hasPlannedSupply({ ...p, capacity }) : capacity <= 0 && !onShelf(p)) continue;
      const price = shownPrice(state, c, p, viewerId);
      const profile = productProfile(c, p), payer = budgetFactory(c, p);
      // Other products in the same close plan also receive their full planned budgets.
      const quality = c.id === plannedCompanyId ? qualityAfter(sectorId, p.quality, Math.max(0, fin(profile?.rnd ?? p.rnd)), terrainMultiplier(state, c, payer, 'rnd')) : p.quality;
      const brand = c.id === plannedCompanyId ? brandAfter(sectorId, p.brand, Math.max(0, fin(profile?.marketing ?? p.marketing)), terrainMultiplier(state, c, payer, 'marketing')) : p.brand;
      const a = productAttractiveness(sectorId, quality, brand, c.reputation, price * terrainMultiplier(state, c, p, 'perceivedPrice'), green) * factoryAttractivenessWeight(c, p, knownSupply, turn > state.turn);
      total += a;
      priceAttractiveness += a * price;
      entries.push(marketEntry(state, p, a));
      if (a > 0 && productAway(state, p)) regional = true;
    }
  }
  return { total: fin(total), priceAttractiveness: fin(priceAttractiveness),
    ...(regional ? { byCity: cityTotals(sectorId, outside, entries, true).map((x) => fin(x)) } : {}) };
}

/** Entrées de l'estimation des ventes d'un produit que `viewerId` contrôle. */
export function marketInputs(state: GameState, c: CompanyState, p: ProductState, viewerId: Id, unitCost: number): MarketEstimateInputs {
  const green = c.modifiers.some((m) => m.kind === 'greenwashing' && m.turnsLeft > 0) ? GREENWASHING_BONUS : 1;
  const plannedCompanyId = p.factoryProductId || (SECTORS[p.sectorId].marketElasticity ?? 0) > 0 ? c.id : undefined;
  const others = knownOthersByCity(state, p.sectorId, viewerId, p.id, state.turn, plannedCompanyId);
  const payer = budgetFactory(c, p);
  return {
    ...(p.factoryProductId ? { attractivenessWeight: factoryAttractivenessWeight(c, p), budgetShare: payer.id === p.id ? 1 : 0 } : {}),
    demand: expectedSectorDemand(state, p.sectorId, state.turn, viewerId),
    othersAttractiveness: others.total,
    othersPriceAttractiveness: others.priceAttractiveness,
    reputation: c.reputation,
    bonus: green,
    unitCost,
    fixedCost: effectiveFixedCost(state, p, c),
    ...(isSpatialMap(state.config) ? {
      rndMultiplier: terrainMultiplier(state, c, payer, 'rnd'),
      marketingMultiplier: terrainMultiplier(state, c, payer, 'marketing'),
      demandMultiplier: terrainMultiplier(state, c, p, 'demand'),
      perishabilityMultiplier: terrainMultiplier(state, c, p, 'perishability'),
      priceMultiplier: terrainMultiplier(state, c, p, 'perceivedPrice'),
    } : {}),
    ...(others.byCity ? { othersByCity: byCity(others.byCity) } : {}),
    ...(isSpatialMap(state.config) ? { hexId: p.hexId ?? capitalCellId(state.config) } : away(p.zoneId) ? { zoneId: p.zoneId } : {}),
  };
}

/**
 * Demande estimée du produit si son usine était dans chaque zone (§5.2 bis), aux mêmes décisions et face aux mêmes
 * rivaux : pour choisir où déménager. Celle de la zone actuelle est l'estimation du produit.
 */
export function zoneDemand(sectorId: SectorId, market: MarketEstimateInputs, d: EstimateDecisions): Record<ZoneId, number> {
  const out = {} as Record<ZoneId, number>;
  for (const z of ZONE_IDS) out[z] = estimateSales(sectorId, market, d, z).demand;
  return out;
}

/** Domaine légal commun aux évaluations géographiques ; chaque objectif emploie l'élasticité du secteur. */
export const LOCATION_PRICE_RATIOS: readonly number[] = Object.freeze(Array.from(
  { length: 55 }, (_, step) => PRICE_MIN_RATIO + (PRICE_MAX_RATIO - PRICE_MIN_RATIO) * step / 54,
));

/**
 * Ce que rapporterait par trimestre l'usine du produit dans chaque zone (§5.8, bots) : la meilleure marge (prix − coût
 * unitaire) × demande, prix de 30 à 300 % du prix de référence, demande non plafonnée par la capacité, au premier
 * trimestre de ventes, face aux rivaux connus. Coût unitaire de chaque zone : main-d'œuvre (pression sur les salaires
 * comprise), transport, filiales. `capitalCogs` : coût des ventes à la capitale, à son meilleur prix (pour le seuil).
 */
export function zoneValues(state: GameState, c: CompanyState, p: ProductState, viewerId: Id | null): { value: Record<ZoneId, number>; capitalCogs: number } {
  return positionValues(state, c, p, viewerId, ZONE_IDS, DEFAULT_ZONE, unitCostByZone, demandIn);
}

/** Balayage commun des prix, avec les coûts et la demande propres à chaque géographie. */
function positionValues<Position extends string>(
  state: GameState,
  c: CompanyState,
  p: ProductState,
  viewerId: Id | null,
  candidates: readonly Position[],
  capital: Position,
  costsAt: (state: GameState, c: CompanyState, p: ProductState, candidates: readonly Position[]) => Record<Position, number>,
  demandAt: (sectorId: SectorId, D: number, a: number, position: Position, others: number, othersByCity?: readonly number[]) => number,
): { value: Record<Position, number>; capitalCogs: number } {
  const sid = p.sectorId;
  const def = SECTORS[sid];
  const t1 = onShelf(p) ? state.turn : state.turn + 1;
  const D = expectedSectorDemand(state, sid, t1, viewerId);
  const others = knownOthersByCity(state, sid, viewerId, p.id, t1);

  const green = c.modifiers.some((m) => m.kind === 'greenwashing' && m.turnsLeft > 0) ? GREENWASHING_BONUS : 1;
  const uc = costsAt(state, c, p, candidates);
  const value = {} as Record<Position, number>;
  let capitalCogs = 0;
  for (const z of candidates) {
    const candidate = isSpatialMap(state.config) ? { ...p, hexId: z } : p;
    const profile = productProfile(c, p), payer = profile ? budgetFactory(c, p) : candidate;
    const quality = qualityAfter(sid, p.quality, Math.max(0, fin(profile?.rnd ?? p.rnd)), terrainMultiplier(state, c, payer, 'rnd', t1));
    const brand = brandAfter(sid, p.brand, Math.max(0, fin(profile?.marketing ?? p.marketing)), terrainMultiplier(state, c, payer, 'marketing', t1));
    let best = -Infinity;
    let bestDemand = 0;
    for (const ratio of LOCATION_PRICE_RATIOS) {
      const price = def.refPrice * ratio;
      const a = productAttractiveness(sid, quality, brand, c.reputation, price * terrainMultiplier(state, c, candidate, 'perceivedPrice', t1), green) * factoryAttractivenessWeight(c, p);
      const marketD = D * marketDemandMultiplier(sid, others.total + a, others.priceAttractiveness + a * price);
      const demand = demandAt(sid, marketD, a, z, others.total, others.byCity) * terrainMultiplier(state, c, candidate, 'demand', t1);
      const gross = (price - uc[z]) * demand;
      const v = isSpatialMap(state.config) ? gross - (effectiveFixedCost(state, candidate, c) - def.fixedCost) : gross;
      if (v > best) {
        best = v;
        bestDemand = demand;
      }
    }
    value[z] = best;
    if (z === capital) capitalCogs = uc[z] * bestDemand;
  }
  return { value, capitalCogs };
}

/**
 * Estimation d'un lancement dans un secteur, pour `viewerId` : produit neuf aux réglages de départ (§4, §7), au prix
 * adapté au secteur, qui vend à partir du trimestre suivant, face aux produits actuels à leurs prix connus.
 * Matières au prix spot × 1,1 (achat d'urgence), venues du port ; usine dans `zoneId` (main-d'œuvre et transport, §5.8).
 */
export function estimateLaunch(state: GameState, sectorId: SectorId, viewerId: Id | null, zoneId: ZoneId = DEFAULT_ZONE): LaunchEstimate {
  return estimateLaunchIn(state, sectorId, viewerId, [zoneId])[zoneId] as LaunchEstimate;
}

/** Estimation d'un lancement, avec le coût unitaire de la nouvelle usine et la demande qui lui reviendrait. */
export interface LaunchEstimate {
  unitCost: number;
  quarterlyProfit: number;
  paybackQuarters: number | null;
  demand: number;
  /** Human map delivery scenarios; omitted from bot candidate views. */
  demandByCity?: Record<CityId, number>;
}

/**
 * La même estimation pour plusieurs zones : la demande du secteur et les rivaux ne dépendent pas de la zone ; le coût,
 * et la demande qui revient au produit quand le marché est régional (§5.2 bis), si.
 */
export function estimateLaunchIn(state: GameState, sectorId: SectorId, viewerId: Id | null, zones: readonly ZoneId[]): Partial<Record<ZoneId, LaunchEstimate>> {
  return estimateLaunchAt(state, sectorId, viewerId, zones, CLASSIC_LAUNCH);
}

interface LaunchLeaves<Position extends string> {
  labor: (state: GameState, sectorId: SectorId, position: Position) => number;
  transport: (sectorId: SectorId, position: Position) => number;
  marketPosition: (position: Position) => Pick<MarketEstimateInputs, 'zoneId' | 'hexId'>;
}

const CLASSIC_LAUNCH: LaunchLeaves<ZoneId> = {
  labor: (state, sectorId, zoneId) => SECTORS[sectorId].laborCost * zoneLaborFactor(state, sectorId, zoneId),
  transport: portOnlyTransport,
  marketPosition: (zoneId) => away(zoneId) ? { zoneId } : {},
};
const HEX_LAUNCH: LaunchLeaves<Id> = {
  labor: (state, sectorId, hexId) => SECTORS[sectorId].laborCost * hexLaborFactor(state, sectorId, hexId) - effectiveHeatCredit(state, { sectorId, hexId }),
  transport: portOnlyTransportHex,
  marketPosition: (hexId) => ({ hexId }),
};

/** Premier trimestre de ventes commun à toutes les destinations, avec leurs coûts et leurs marchés. */
function estimateLaunchAt<Position extends string>(state: GameState, sectorId: SectorId, viewerId: Id | null, positions: readonly Position[], leaves: LaunchLeaves<Position>, includeDestinations = false): Record<Position, LaunchEstimate> {
  const def = SECTORS[sectorId];
  const next = state.turn + 1;
  const demand = expectedSectorDemand(state, sectorId, next, viewerId);
  const others = knownOthersByCity(state, sectorId, viewerId, null, next);
  const capacity = def.startingCapacity;
  const { price, production, marketing, rnd } = startingDecisions(sectorId, capacity);
  const startingBrand = START_BRAND;
  const carriage = transportFactor(state);
  const out = {} as Record<Position, LaunchEstimate>;
  for (const position of positions) {
    let unit = leaves.labor(state, sectorId, position);
    for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) {
      unit += per * state.commodities[cid].price * EMERGENCY_PURCHASE_PREMIUM;
    }
    unit += leaves.transport(sectorId, position) * carriage;
    const market: MarketEstimateInputs = {
      demand,
      othersAttractiveness: others.total,
      othersPriceAttractiveness: others.priceAttractiveness,
      reputation: 1,
      bonus: 1,
      unitCost: unit,
      fixedCost: effectiveFixedCost(state, { sectorId, ...leaves.marketPosition(position) }),
      ...(isSpatialMap(state.config) ? { demandMultiplier: terrainPlantMultiplier(state, { sectorId, ...leaves.marketPosition(position) }, 'demand', next) } : {}),
      ...(others.byCity ? { othersByCity: byCity(others.byCity) } : {}),
      ...leaves.marketPosition(position),
    };
    // Le projet hexagonal naît après les ventes : ses premiers budgets seront ceux du trimestre suivant.
    const decisions = {
      quality: isSpatialMap(state.config) ? START_QUALITY : qualityAfter(sectorId, START_QUALITY, rnd),
      brand: isSpatialMap(state.config) ? startingBrand : brandAfter(sectorId, startingBrand, marketing),
      price,
      production,
      capacity,
      stock: 0,
      marketing,
      rnd,
    };
    const est = estimateSales(sectorId, market, decisions);
    const quarterlyProfit = fin(est.margin);
    const land = isSpatialMap(state.config) ? hexReservePrice(position) : 0;
    out[position] = { unitCost: fin(unit), quarterlyProfit, paybackQuarters: launchPaybackQuarters(def.launchCost + land, quarterlyProfit), demand: est.demand,
      ...(includeDestinations ? { demandByCity: estimateDemandByCity(sectorId, market, decisions) } : {}) };
  }
  return out;
}

/** Demande dans chaque case candidate, avec l'estimateur de ventes que lit le client. */
export function hexDemand(sectorId: SectorId, market: MarketEstimateInputs, d: EstimateDecisions, candidates: readonly Id[], context?: { state: GameState; c: CompanyState; p: ProductState }): Record<Id, number> {
  const out: Record<Id, number> = {};
  for (const hexId of candidates) {
    const candidate = context ? { ...context.p, hexId } : undefined;
    const effects = context && candidate ? {
      rndMultiplier: terrainMultiplier(context.state, context.c, candidate, 'rnd'),
      marketingMultiplier: terrainMultiplier(context.state, context.c, candidate, 'marketing'),
      demandMultiplier: terrainMultiplier(context.state, context.c, candidate, 'demand'),
      priceMultiplier: terrainMultiplier(context.state, context.c, candidate, 'perceivedPrice'),
    } : hexId === market.hexId ? {} : { rndMultiplier: 1, marketingMultiplier: 1, demandMultiplier: 1, priceMultiplier: 1 };
    out[hexId] = estimateSales(sectorId, { ...market, ...effects, hexId }, d).demand;
  }
  return out;
}

/** Valeur des cases candidates ; le coût de référence est évalué même si la case de la capitale est occupée. */
export function hexValues(state: GameState, c: CompanyState, p: ProductState, viewerId: Id | null, candidates: readonly Id[], capitalCandidate: Id = capitalCellId(state.config)): { value: Record<Id, number>; capitalCogs: number } {
  const includesCapital = candidates.includes(capitalCandidate);
  const cells = includesCapital ? candidates : [...candidates, capitalCandidate];
  const result = positionValues(state, c, p, viewerId, cells, capitalCandidate, unitCostByHex, demandInHex);
  if (!includesCapital) delete result.value[capitalCandidate];
  return result;
}

/** Premier trimestre de ventes d'un lancement, avec main-d'œuvre, chaleur et transport de chaque case candidate. */
export function estimateLaunchInHex(state: GameState, sectorId: SectorId, viewerId: Id | null, hexIds: readonly Id[], includeDestinations = false): Record<Id, LaunchEstimate> {
  return estimateLaunchAt(state, sectorId, viewerId, hexIds, HEX_LAUNCH, includeDestinations);
}
