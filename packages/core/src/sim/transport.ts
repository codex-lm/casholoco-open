/**
 * Géographie des coûts (§5.8) : main-d'œuvre de la zone et transport, partagés par la résolution, le plan de clôture,
 * les estimations et les bots, pour qu'ils comptent tous la même chose. Fonctions pures, sans RNG.
 *
 * Fret absolu, compté à partir de zéro au tarif du km × le poids au fret (`freightWeight`) :
 *   - un lot de matière venu du port (achats, achats d'urgence, contrats, stock) : trajet port → usine ;
 *   - un lot fourni par sa filiale pour les besoins du trimestre : trajet gisement → usine ;
 *   - la livraison d'un lot produit : Σ part de chaque ville dans les ventes de référence du secteur depuis la
 *     position (§5.2 bis, `salesMix` / `salesMixByHex`) × trajet usine → ville.
 * La capitale paie ses livraisons aux autres villes et les matières de ses filiales ; seul le port → capitale est
 * gratuit. Le prix de référence de chaque secteur physique inclut sa livraison standard depuis la capitale.
 */
import { capitalHexId, deliveryKmByCityHex, deliveryKmByHex, route, salesMixByHex } from './hexes';
import { capitalCellId, isSpatialMap } from '../content/hexes';
import { COMMODITIES, DEFAULT_ZONE, SECTORS, ZONES, roadRoute, zoneOf } from '../content';
import { CITY_IDS, COMMODITY_IDS, type CityId, type CommodityId, type CompanyState, type FreightBreakdown, type GameState, type Id, type ProductState, type SectorId, type ZoneId } from '../types';
import { FACTORY_MOVE_COST_RATIO, TRANSPORT_COST_PER_KM, WAGE_PRESSURE_MAX_PLANTS, WAGE_PRESSURE_PER_PLANT } from './constants';
import { deliveryKm, deliveryKmByCity, salesMix } from './regions';
import { fin, getOwn } from './util';

/** Le port est à la capitale : les matières achetées ou stockées en partent. */
const PORT = DEFAULT_ZONE;

const memo = new Map<string, number>();
/** Transport d'un lot de `weight` chargements entre deux nœuds du réseau (k), par l'itinéraire le moins cher. */
function haul(from: string, to: string, weight: number): number {
  if (from === to) return 0;
  const key = `${from}|${to}|${weight}`;
  let v = memo.get(key);
  if (v === undefined) {
    v = TRANSPORT_COST_PER_KM * weight * (roadRoute(from, to)?.cost ?? 0);
    memo.set(key, v);
  }
  return v;
}

/** Acheminer un lot de matière du port à une usine de la zone (k), au poids de la matière. */
export function portHaul(zoneId: ZoneId, commodityId: CommodityId): number {
  return haul(PORT, zoneId, COMMODITIES[commodityId].freightWeight);
}

/** Acheminer un lot extrait au gisement vers une usine de la zone (coût absolu, k). */
export function siteHaul(slotId: string, zoneId: ZoneId, commodityId: CommodityId): number {
  const weight = COMMODITIES[commodityId].freightWeight;
  return haul(slotId, zoneId, weight);
}

/**
 * Livrer un lot produit dans les villes (coût absolu, k) : au mélange de ventes de référence
 * du secteur depuis la zone (§5.2 bis), fixe, pour que le transport ne dépende ni des rivaux ni des prix, et au poids
 * du produit.
 */
export function deliveryPerLot(zoneId: ZoneId, sectorId: SectorId): number {
  if (SECTORS[sectorId].intangible) return 0;
  return TRANSPORT_COST_PER_KM * SECTORS[sectorId].freightWeight * deliveryKm(sectorId, zoneId);
}

/** Multiplicateur de la main-d'œuvre d'une usine du secteur dans la zone (capitale = 1), hors effets du moment. */
export function zoneLabor(zoneId: ZoneId, sectorId: SectorId): number {
  return ZONES[zoneId].labor[sectorId];
}

/** Usines actives d'une zone (produits des entreprises actives), sans compter le produit `exceptId`. */
export function plantsIn(state: GameState, zoneId: ZoneId, exceptId?: string): number {
  let n = 0;
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    for (const p of c.products) if (p.id !== exceptId && zoneOf(p).id === zoneId) n++;
  }
  return n;
}

/**
 * Main-d'œuvre d'une usine du secteur dans la zone, ce trimestre (§5.8) : la spécialité de la zone, les nouvelles
 * locales en cours (grève, subvention) et, hors de la capitale, la pression sur les salaires : +3 % par autre usine de
 * la zone, au plus +15 %. `productId` : l'usine elle-même, qui ne se fait pas concurrence (absent : une usine nouvelle).
 */
export function zoneLaborFactor(state: GameState, sectorId: SectorId, zoneId: ZoneId, productId?: string): number {
  let m = zoneLabor(zoneId, sectorId);
  for (const e of state.activeEffects) if (e.kind === 'zoneLabor' && e.zoneId === zoneId) m *= e.value;
  if (zoneId !== PORT) m *= 1 + WAGE_PRESSURE_PER_PLANT * Math.min(WAGE_PRESSURE_MAX_PLANTS, plantsIn(state, zoneId, productId));
  return m;
}

/** Multiplicateur du prix du transport ce trimestre : produit des nouvelles en cours (gazole, péages, §5.8). */
export function transportFactor(state: GameState): number {
  let f = 1;
  for (const e of state.activeEffects) if (e.kind === 'transportCost') f *= e.value;
  return f;
}

/** Lots qu'une filiale fournit à la production du trimestre (§5.8), dans l'ordre des filiales de l'entreprise. */
export interface Extraction {
  siteId: string;
  commodityId: CommodityId;
  lots: number;
}

/**
 * Transport par lot produit de chaque produit de l'entreprise (k, dans l'ordre de `c.products`), s'ils produisent
 * `lots` et que ses filiales fournissent `extracted` (`siteSupply`). Les lots des filiales servent d'abord la
 * production, filiale par filiale ; le reste vient du port. Chaque produit prend le mélange de la matière au prorata
 * de ce qu'il en consomme. `zones` : la zone de chaque produit (par défaut, la sienne).
 */
export function transportPerLot(
  c: CompanyState,
  lots: number[],
  extracted: Extraction[],
  zones: ZoneId[] = c.products.map((p) => zoneOf(p).id),
  factor = 1,
): number[] {
  return transportPerLotBy(c, lots, extracted, zones, factor, CLASSIC_HAUL);
}

/** Champs suffisants pour calculer le fret, depuis un état serveur ou une vue client. */
export interface TransportCompany {
  products: Pick<ProductState, 'sectorId' | 'zoneId' | 'hexId'>[];
}

interface TransportRoutes<Position extends string> {
  port: (position: Position, commodityId: CommodityId) => number;
  site: (slotId: string, position: Position, commodityId: CommodityId) => number;
  km: (position: Position, nodeId: string) => number;
  cityKm: (position: Position) => Readonly<Record<CityId, number>>;
  mix: (sectorId: SectorId, position: Position) => Readonly<Record<CityId, number>>;
  zone?: (position: Position) => ZoneId;
}

const CLASSIC_HAUL: TransportRoutes<ZoneId> = {
  port: portHaul, site: siteHaul,
  km: (position, node) => roadRoute(node, position)?.cost ?? 0,
  cityKm: deliveryKmByCity, mix: salesMix, zone: (position) => position,
};
const HEX_HAUL: TransportRoutes<Id> = {
  port: portHaulHex, site: siteHaulHex,
  km: route, cityKm: deliveryKmByCityHex, mix: salesMixByHex,
};

/** Même répartition des matières et même ordre de calcul, seules les routes dépendent du plateau. */
function transportPerLotBy<Position extends string>(
  c: TransportCompany, lots: number[], extracted: Extraction[], positions: Position[], factor: number,
  routes: TransportRoutes<Position>,
): number[] {
  return transportBreakdownBy(c, lots, extracted, positions, factor, routes).map((detail) => detail.total);
}

/** Détail à la production réelle ou prévue, allocation commune à la résolution et aux estimations. */
export function transportBreakdown(
  c: TransportCompany, lots: number[], extracted: Extraction[],
  zones: ZoneId[] = c.products.map((p) => zoneOf(p).id), factor = 1,
): FreightBreakdown[] {
  return transportBreakdownBy(c, lots, extracted, zones, factor, CLASSIC_HAUL);
}

/** Détail absolu du plateau, avec la même répartition de matières que le mode classique. */
export function transportBreakdownHex(
  c: TransportCompany, lots: number[], extracted: Extraction[],
  hexes: Id[] = c.products.map((p) => p.hexId ?? capitalHexId), factor = 1,
): FreightBreakdown[] {
  return transportBreakdownBy(c, lots, extracted, hexes, factor, HEX_HAUL);
}

function transportBreakdownBy<Position extends string>(
  c: TransportCompany, lots: number[], extracted: Extraction[], positions: Position[], factor: number,
  routes: TransportRoutes<Position>,
): FreightBreakdown[] {
  const out: FreightBreakdown[] = c.products.map((p, i) => ({
    sectorId: p.sectorId, hexId: positions[i],
    ...(routes.zone ? { zoneId: routes.zone(positions[i]) } : {}),
    intangible: !!SECTORS[p.sectorId].intangible, transportFactor: factor,
    materials: [], delivery: [], materialsCost: 0, deliveryCost: 0, total: 0,
  }));
  for (const cid of COMMODITY_IDS) {
    let Q = 0;
    c.products.forEach((p, i) => (Q += Math.max(0, lots[i]) * (SECTORS[p.sectorId].inputs[cid] ?? 0)));
    if (!(Q > 0)) continue;
    let fromPort = Q;
    const used: { siteId: string; lots: number }[] = [];
    for (const e of extracted) {
      if (e.commodityId !== cid || !(fromPort > 0)) continue;
      const n = Math.min(fromPort, Math.max(0, e.lots));
      if (n > 0) used.push({ siteId: e.siteId, lots: n });
      fromPort -= n;
    }
    c.products.forEach((p, i) => {
      const per = SECTORS[p.sectorId].inputs[cid] ?? 0;
      if (SECTORS[p.sectorId].intangible || !(per > 0) || !(lots[i] > 0)) return;
      const position = positions[i];
      const add = (source: 'port' | 'site', supply: number, siteId?: string) => {
        if (!(supply > 0)) return;
        const materialLots = per * supply / Q;
        const km = routes.km(position, siteId ?? PORT);
        const haul = source === 'port' ? routes.port(position, cid) : routes.site(siteId!, position, cid);
        out[i].materials.push({ commodityId: cid, source, ...(siteId ? { siteId } : {}), lots: materialLots, km, cost: materialLots * haul * factor });
      };
      add('port', fromPort);
      for (const u of used) add('site', u.lots, u.siteId);
    });
  }
  c.products.forEach((p, i) => {
    const detail = out[i];
    if (detail.intangible) return;
    const mix = routes.mix(p.sectorId, positions[i]);
    const km = routes.cityKm(positions[i]);
    detail.delivery = CITY_IDS.map((city) => ({
      city, share: mix[city], km: km[city],
      cost: mix[city] * km[city] * TRANSPORT_COST_PER_KM * SECTORS[p.sectorId].freightWeight * factor,
    }));
    detail.materialsCost = detail.materials.reduce((sum, leg) => sum + leg.cost, 0);
    detail.deliveryCost = detail.delivery.reduce((sum, leg) => sum + leg.cost, 0);
    detail.total = detail.materialsCost + detail.deliveryCost;
  });
  return out;
}

/**
 * Ce que les filiales en service fournissent à la production du trimestre (§5.8) : leur capacité, filiale par filiale,
 * moins ce que l'entreprise doit livrer par contrat de la même matière (ces lots-là partent chez l'acheteur). Que les
 * lots sortent de l'extraction du trimestre ou du stock que la filiale a rempli au trimestre précédent, ils viennent du
 * gisement : ils servent la production avant le port. La même règle sert à la résolution, au plan de clôture et aux
 * estimations, calculée sur l'état du début de la clôture.
 */
export function siteSupply(state: GameState, c: CompanyState): Extraction[] {
  const owed = {} as Record<CommodityId, number>;
  for (const cid of COMMODITY_IDS) owed[cid] = 0;
  for (const k of state.contracts ?? []) {
    if (k.sellerCompanyId !== c.id || !(k.turnsLeft > 0)) continue;
    if (getOwn(state.companies, k.buyerCompanyId)?.status !== 'active') continue;
    if (Object.hasOwn(owed, k.commodityId)) owed[k.commodityId] += Math.max(0, k.lots);
  }
  const out: Extraction[] = [];
  for (const s of c.sites ?? []) {
    if (s.dormant || s.activeFrom > state.turn) continue;
    const capacity = Math.max(0, Math.floor(s.capacity));
    const toBuyers = Math.min(capacity, owed[s.commodityId]);
    owed[s.commodityId] -= toBuyers;
    out.push({ siteId: s.id, commodityId: s.commodityId, lots: capacity - toBuyers });
  }
  return out;
}

/** Production prévue de chaque produit (lots, plafonnée par la capacité) : la base des estimations. */
export function plannedLots(c: CompanyState): number[] {
  return c.products.map((p) => Math.max(0, Math.floor(Math.min(fin(p.production), p.capacity))));
}

/** Transport par lot d'un produit de ce secteur dans la zone, toutes ses matières venues du port (un lancement). */
export function portOnlyTransport(sectorId: ProductState['sectorId'], zoneId: ZoneId): number {
  if (SECTORS[sectorId].intangible) return 0;
  let k = deliveryPerLot(zoneId, sectorId);
  for (const [cid, per] of Object.entries(SECTORS[sectorId].inputs) as [CommodityId, number][]) {
    if (cid in COMMODITIES) k += per * portHaul(zoneId, cid);
  }
  return k;
}

/**
 * Transport par lot estimé d'un produit de l'entreprise à la production prévue (§5.8), son usine dans `zoneId` (par
 * défaut, sa zone) : ses filiales en service fournissent d'abord, le reste vient du port.
 */
export function estimatedTransport(state: GameState, c: CompanyState, p: ProductState, zoneId?: ZoneId): number {
  if (SECTORS[p.sectorId].intangible) return 0;
  if (isSpatialMap(state.config)) return estimatedTransportHex(state, c, p);
  const i = c.products.indexOf(p);
  if (i < 0) return portOnlyTransport(p.sectorId, zoneId ?? zoneOf(p).id) * transportFactor(state);
  const lots = plannedLots(c);
  lots[i] = Math.max(1, lots[i]);
  const zones = c.products.map((q) => zoneOf(q).id);
  if (zoneId !== undefined) zones[i] = zoneId;
  return transportPerLot(c, lots, siteSupply(state, c), zones, transportFactor(state))[i];
}

/** Le trimestre où le produit démarre (départ, lancement, fondation d'une start-up), l'usine se déménage gratuitement. */
export function freeMove(state: GameState, p: ProductState): boolean {
  return !isSpatialMap(state.config) && p.launchedTurn >= state.turn;
}

/** Ce que coûte de déménager l'usine ce trimestre (k) : une part de la valeur de sa capacité, sauf au démarrage. */
export function factoryMoveCost(state: GameState, p: ProductState): number {
  if (freeMove(state, p)) return 0;
  return fin(FACTORY_MOVE_COST_RATIO * (Math.max(0, p.capacity) + Math.max(0, p.pendingCapacity)) * SECTORS[p.sectorId].capacityCost);
}

/** Transport sur le plateau : même répartition des matières, seules les tables de routes changent. */
export function portHaulHex(hexId: Id, commodityId: CommodityId): number {
  return hexId === capitalHexId ? 0 : TRANSPORT_COST_PER_KM * COMMODITIES[commodityId].freightWeight * route(hexId, PORT);
}

export function siteHaulHex(slotId: Id, hexId: Id, commodityId: CommodityId): number {
  const weight = COMMODITIES[commodityId].freightWeight;
  return TRANSPORT_COST_PER_KM * weight * route(hexId, slotId);
}

export function deliveryPerLotHex(hexId: Id, sectorId: SectorId): number {
  return SECTORS[sectorId].intangible ? 0 : TRANSPORT_COST_PER_KM * SECTORS[sectorId].freightWeight * deliveryKmByHex(sectorId, hexId);
}

export function transportPerLotHex(
  c: CompanyState,
  lots: number[],
  extracted: Extraction[],
  hexes: Id[] = c.products.map((p) => p.hexId ?? capitalHexId),
  factor = 1,
): number[] {
  return transportPerLotBy(c, lots, extracted, hexes, factor, HEX_HAUL);
}

export function portOnlyTransportHex(sectorId: SectorId, hexId: Id): number {
  if (SECTORS[sectorId].intangible) return 0;
  let k = deliveryPerLotHex(hexId, sectorId);
  for (const [cid, per] of Object.entries(SECTORS[sectorId].inputs) as [CommodityId, number][]) {
    if (cid in COMMODITIES) k += per * portHaulHex(hexId, cid);
  }
  return k;
}

export function estimatedTransportHex(state: GameState, c: CompanyState, p: ProductState, hexId: Id = p.hexId ?? capitalCellId(state.config)): number {
  if (SECTORS[p.sectorId].intangible) return 0;
  const i = c.products.indexOf(p);
  if (i < 0) return portOnlyTransportHex(p.sectorId, hexId) * transportFactor(state);
  const lots = plannedLots(c);
  lots[i] = Math.max(1, lots[i]);
  const hexes = c.products.map((q) => q.hexId ?? capitalCellId(state.config));
  hexes[i] = hexId;
  return transportPerLotHex(c, lots, siteSupply(state, c), hexes, transportFactor(state))[i];
}
