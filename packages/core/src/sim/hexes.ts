/**
 * Position sur le plateau (§5.8 bis) : tables fixes et règles pures, sans tirage ni état caché de partie.
 * Les cellules portant un nœud sont ancrées à ce nœud : on retrouve exactement le réseau classique.
 */
import { ALL_CELLS, HEXES, boardCells, boardBuildable, capitalCellId, cellBoardConfig, hexById, hexDistance, pointInPolygon, segmentIntersectsPolygon, segmentWithinPolygon, type BoardConfig } from '../content/hexes';
import { CITIES, COASTLINE, DEFAULT_ZONE, DEPOSITS, ISLAND, JUNCTIONS, LAKE, MOUNTAIN_RANGE, ROAD_FACTOR, ZONES, distanceKm, roadNode, roadRoute } from '../content/map';
import { SECTORS } from '../content/sectors';
import { CITY_IDS, SECTOR_IDS, ZONE_IDS, type CityId, type GameState, type MapPoint, type SectorId, type ZoneId } from '../types';
import { MIX_REF_OTHERS, WAGE_PRESSURE_MAX_PLANTS, WAGE_PRESSURE_PER_PLANT } from './constants';
import { ownedLand, usesIndustryNetwork } from './industry';

const ZONE_HEX = Object.fromEntries(HEXES.filter((h) => h.zone).map((h) => [h.zone, h.id])) as Record<ZoneId, string>;
export const capitalHexId = ZONE_HEX.capital;
export const ISLAND_HEX_ID = 'A15';
export const FERRY_KM = 325;
export const HEAT_PRICE = 5;

/** Case du nœud d'une zone. */
export function zoneHexId(zoneId: ZoneId, config?: BoardConfig): string {
  return config?.mapMode === 'square' ? boardCells(config).find(h => h.zone === zoneId)!.id : ZONE_HEX[zoneId];
}

const NODE_IDS = [...Object.keys(ZONES), ...Object.keys(DEPOSITS), ...Object.keys(JUNCTIONS)];
const ROAD_COST = new Map(NODE_IDS.map((from) => [from, new Map(NODE_IDS.map((to) => [to, roadRoute(from, to)!.cost]))]));
// Les gisements en mer ne sont desservis que par leurs pipelines du réseau existant.
const LAND_NODES = NODE_IDS.filter((id) => pointInPolygon(roadNode(id)!, COASTLINE) && !pointInPolygon(roadNode(id)!, LAKE));
const ROUTE_ACCESS = new Map<string, Map<string, string>>();

/** Coût de piste : relief mesuré au milieu de tronçons égaux de 5 km au plus, une fois au chargement. */
function pisteCost(a: MapPoint, b: MapPoint): number {
  const km = distanceKm(a, b);
  const samples = Math.max(1, Math.ceil(km / 5));
  let mountainSamples = 0;
  for (let i = 0; i < samples; i++) {
    const t = (i + 0.5) / samples;
    if (pointInPolygon({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, MOUNTAIN_RANGE)) mountainSamples++;
  }
  const inside = km * mountainSamples / samples;
  return 1.5 * ((km - inside) + ROAD_FACTOR.mountain * inside);
}

const ROUTES = new Map(ALL_CELLS.map((h) => {
  const ownNode = h.zone ?? h.deposit;
  const costs = new Map<string, number>();
  const accesses = new Map<string, string>();
  const pistes = !ownNode && h.terrain !== 'island'
    ? LAND_NODES.filter((node) => !segmentIntersectsPolygon(h, roadNode(node)!, LAKE) && segmentWithinPolygon(h, roadNode(node)!, COASTLINE))
      .map((node) => ({ node, cost: pisteCost(h, roadNode(node)!) }))
    : [];
  for (const target of NODE_IDS) {
    if (h.terrain === 'island') {
      costs.set(target, FERRY_KM * ROAD_FACTOR.highway + ROAD_COST.get(DEFAULT_ZONE)!.get(target)!);
    } else if (ownNode) {
      // Pas de raccourci de piste gratuit entre deux nœuds : symétrie et parité du réseau existant.
      costs.set(target, ROAD_COST.get(ownNode)!.get(target)!);
    } else {
      let best = Infinity;
      for (const piste of pistes) {
        const cost = piste.cost + ROAD_COST.get(piste.node)!.get(target)!;
        if (cost < best) {
          best = cost;
          accesses.set(target, piste.node);
        }
      }
      costs.set(target, best);
    }
  }
  ROUTE_ACCESS.set(h.id, accesses);
  return [h.id, costs] as const;
}));

/** Route cellule → nœud, en km pondérés ; nœud/case inconnus : Infinity. */
export function route(hexId: string, targetNodeId: string): number {
  return ROUTES.get(hexId)?.get(targetNodeId) ?? Infinity;
}

/** Nœud atteint par la piste retenue ; absent pour une case ancrée, le ferry ou une route inconnue. */
export function routeAccessNode(hexId: string, targetNodeId: string): string | undefined {
  return ROUTE_ACCESS.get(hexId)?.get(targetNodeId);
}

export interface HexTransportRouteSegment {
  kind: 'road' | 'track' | 'ferry';
  /** Coordonnées natives de la carte (km), dans le sens case → destination. */
  points: MapPoint[];
  /** Distance physique ; pour le ferry, distance forfaitaire du modèle. */
  km: number;
  /** Distance pondérée utilisée par le coût du transport. */
  cost: number;
  /** Le moteur ne stocke pas de tracé maritime : seul le raccord du ferry est indicatif. */
  indicative?: boolean;
}

export interface HexTransportRoute {
  points: MapPoint[];
  km: number;
  cost: number;
  segments: HexTransportRouteSegment[];
}

const ISLAND_CENTRE: MapPoint = {
  x: ISLAND.reduce((sum, point) => sum + point.x, 0) / ISLAND.length,
  y: ISLAND.reduce((sum, point) => sum + point.y, 0) / ISLAND.length,
};
const copyPoint = ({ x, y }: MapPoint): MapPoint => ({ x, y });

/**
 * Géométrie de l'itinéraire déjà choisi par `route`, sans nouvelle règle ni tirage.
 * Une case ancrée part du nœud réel ; son raccord au centre dessiné reste cosmétique.
 * Les points retournés sont des copies, indépendantes du catalogue et des autres appels.
 */
export function hexTransportRoute(hexId: string, targetNodeId: string): HexTransportRoute | undefined {
  const hex = hexById(hexId);
  if (!hex || !roadNode(targetNodeId)) return undefined;
  const ownNode = hex.zone ?? hex.deposit;
  const access = hex.terrain === 'island' ? DEFAULT_ZONE : ownNode ?? routeAccessNode(hexId, targetNodeId);
  if (!access) return undefined;
  const road = roadRoute(access, targetNodeId);
  if (!road) return undefined;

  const segments: HexTransportRouteSegment[] = [];
  if (hex.terrain === 'island') {
    segments.push({
      kind: 'ferry', points: [copyPoint(ISLAND_CENTRE), copyPoint(roadNode(DEFAULT_ZONE)!)],
      km: FERRY_KM, cost: FERRY_KM * ROAD_FACTOR.highway, indicative: true,
    });
  } else if (!ownNode) {
    const node = roadNode(access)!;
    segments.push({
      kind: 'track', points: [copyPoint(hex), copyPoint(node)],
      km: distanceKm(hex, node), cost: pisteCost(hex, node),
    });
  }
  segments.push({ kind: 'road', points: road.points.map(copyPoint), km: road.km, cost: road.cost });
  return {
    points: segments.flatMap((segment, index) => segment.points.slice(index ? 1 : 0).map(copyPoint)),
    km: segments.reduce((sum, segment) => sum + segment.km, 0),
    cost: segments.reduce((sum, segment) => sum + segment.cost, 0),
    segments,
  };
}

const BASINS = new Map(ALL_CELLS.map((h) => {
  let closest = DEFAULT_ZONE;
  for (const zone of ZONE_IDS) if (route(h.id, zone) < route(h.id, closest)) closest = zone;
  return [h.id, closest] as const;
}));
const RINGS = new Map(ALL_CELLS.map((h) => [h.id, hexDistance(h.id, zoneHexId(BASINS.get(h.id)!, cellBoardConfig(h.id)))]));

/** Bassin le moins cher à rejoindre ; égalités dans l'ordre du catalogue. */
export function basin(hexId: string | undefined): ZoneId {
  return (hexId && BASINS.get(hexId)) || DEFAULT_ZONE;
}

/** Éloignement du centre du bassin en cases, sans détour routier. */
export function ring(hexId: string | undefined): number {
  return (hexId && RINGS.get(hexId)) || 0;
}

/** Une ancienne position absente est la capitale ; les actions valident séparément les ids reçus. */
export function hexOf(product: { hexId?: string }, config?: BoardConfig): string {
  return product.hexId && hexById(product.hexId) ? product.hexId : capitalCellId(config);
}

/** Nombre d'usines actives dans un bassin, à l'exclusion du produit évalué. */
export function plantsInBasin(state: GameState, zoneId: ZoneId, exceptProductId?: string): number {
  let count = 0;
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    for (const p of c.products) if (p.id !== exceptProductId && basin(p.hexId) === zoneId) count++;
  }
  return count;
}

/** Spécialité, éloignement, nouvelles locales et pression salariale du bassin. */
export function hexLaborFactor(state: GameState, sectorId: SectorId, hexId: string, exceptProductId?: string): number {
  const zone = basin(hexId);
  let factor = ZONES[zone].labor[sectorId] * (1 + 0.02 * Math.max(0, ring(hexId) - 1));
  for (const e of state.activeEffects) if (e.kind === 'zoneLabor' && e.zoneId === zone) factor *= e.value;
  if (zone !== DEFAULT_ZONE) factor *= 1 + WAGE_PRESSURE_PER_PLANT * Math.min(WAGE_PRESSURE_MAX_PLANTS, plantsInBasin(state, zone, exceptProductId));
  return factor;
}

interface HexMarket {
  pi: readonly number[];
  proximity: Readonly<Record<CityId, number>>;
  mix: Readonly<Record<CityId, number>>;
  deliveryKm: number;
}
const NATIONAL_HEX = Object.freeze([1]);
const ONES = Object.freeze(CITY_IDS.map(() => 1));
const CITY_KM = new Map(ALL_CELLS.map((h) => [h.id, Object.freeze(Object.fromEntries(CITY_IDS.map((city) => [city, route(h.id, city)])) as Record<CityId, number>)]));
const MARKETS = new Map(SECTOR_IDS.map((sector) => {
  const rawWeights = CITY_IDS.map((city) => CITIES[city].share * CITIES[city].taste[sector]);
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map((value) => value / weightSum);
  const cells = new Map<string, HexMarket>();
  for (const h of ALL_CELLS) {
    const config = cellBoardConfig(h.id);
    const capital = h.id === capitalCellId(config);
    const cityKm = CITY_KM.get(h.id)!;
    // Bonus « fabriqué ici » : à une case ou moins d'une ville de province (la capitale n'en a pas), sinon 1.
    const pi = capital ? ONES : Object.freeze(CITY_IDS.map((city) =>
      (city !== DEFAULT_ZONE && hexDistance(h.id, zoneHexId(city, config)) <= 1 ? 1 + SECTORS[sector].localBonus : 1)));
    const rawMix = pi.map((value, i) => (weights[i] * value) / (MIX_REF_OTHERS + value));
    const mixSum = rawMix.reduce((a, b) => a + b, 0);
    const mix = rawMix.map((value) => value / mixSum);
    cells.set(h.id, {
      pi,
      proximity: Object.freeze(Object.fromEntries(CITY_IDS.map((city, i) => [city, pi[i]])) as Record<CityId, number>),
      mix: Object.freeze(Object.fromEntries(CITY_IDS.map((city, i) => [city, mix[i]])) as Record<CityId, number>),
      deliveryKm: mix.reduce((sum, value, i) => sum + value * cityKm[CITY_IDS[i]], 0),
    });
  }
  return [sector, cells] as const;
}));

function market(sectorId: SectorId, hexId: string | undefined): HexMarket {
  return MARKETS.get(sectorId)!.get(hexId && hexById(hexId) ? hexId : capitalHexId)!;
}

/** Facteur par ville dans l'ordre de CITY_IDS ; le calcul national garde une seule composante égale à 1. */
export function proximityOfHex(sectorId: SectorId, hexId: string | undefined, regional = true): readonly number[] {
  return regional ? market(sectorId, hexId).pi : NATIONAL_HEX;
}

/** Profil public par ville, sans recalcul ni mutation. */
export function proximityByHex(sectorId: SectorId, hexId: string): Readonly<Record<CityId, number>> {
  return market(sectorId, hexId).proximity;
}

/** Mélange fixe de ventes de référence, utilisé pour la livraison. */
export function salesMixByHex(sectorId: SectorId, hexId: string): Readonly<Record<CityId, number>> {
  return market(sectorId, hexId).mix;
}

/** Distance absolue moyenne pondérée par les ventes de référence. */
export function deliveryKmByHex(sectorId: SectorId, hexId: string): number {
  return market(sectorId, hexId).deliveryKm;
}

/** Distance absolue de la case vers chaque ville (km pondérés), table immuable mémoïsée. */
export function deliveryKmByCityHex(hexId: string): Readonly<Record<CityId, number>> {
  return CITY_KM.get(hexId && hexById(hexId) ? hexId : capitalHexId)!;
}

const CLIMATE: Record<Exclude<CityId, 'capital'>, number> = { north: 1.5, north_east: 1.2, east: 1, south: 0.5 };
const HEAT = new Map(ALL_CELLS.map((h) => {
  const config = cellBoardConfig(h.id);
  let credit = 0;
  if (hexDistance(h.id, zoneHexId('mountain', config)) <= 1) {
    credit = HEAT_PRICE * 2;
  } else if (h.id !== capitalCellId(config) && h.id !== zoneHexId('plain', config) && h.terrain !== 'island') {
    let nearest: Exclude<CityId, 'capital'> | undefined;
    for (const city of CITY_IDS) {
      if (city === 'capital' || hexDistance(h.id, zoneHexId(city, config)) > 1) continue;
      if (!nearest || distanceKm(h, CITIES[city]) < distanceKm(h, CITIES[nearest])) nearest = city;
    }
    if (nearest) credit = HEAT_PRICE * CLIMATE[nearest];
  }
  return [h.id, credit] as const;
}));

/** Vente de chaleur, en k par lot produit ; règle crypto du plateau, sans saisonnalité. */
export function heatCredit(sectorId: SectorId, hexId: string): number {
  return sectorId === 'crypto' ? HEAT.get(hexId) ?? 0 : 0;
}

/** Occupation publique : uniquement les produits des entreprises encore actives. */
export function occupiedHexes(state: GameState): Record<string, string> {
  const occupied: Record<string, string> = {};
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    if (usesIndustryNetwork(state)) for (const parcel of ownedLand(c)) occupied[parcel.hexId] = c.id;
    for (const p of c.products) {
      if (p.hexId && hexById(p.hexId)) occupied[p.hexId] = c.id;
      if (p.pendingHexId && hexById(p.pendingHexId)) occupied[p.pendingHexId] = c.id;
    }
  }
  return occupied;
}

/** Cases libres dans l'ordre du plateau. */
export function freeBuildableHexes(state: GameState): string[] {
  const occupied = occupiedHexes(state);
  return boardBuildable(state.config).filter((id) => !Object.hasOwn(occupied, id));
}

/** Allocation déterministe : distance en cases, puis ordre du plateau. Aucun RNG n'est consommé. */
export function nearestFreeHex(state: GameState, targetHexId = capitalCellId(state.config)): string | undefined {
  let best: string | undefined, distance = Infinity;
  for (const id of freeBuildableHexes(state)) {
    const d = hexDistance(id, targetHexId);
    if (d < distance) { best = id; distance = d; }
  }
  return best;
}

/** About ten free candidates per basin, nearest its centre, then the current plant cell. */
export function candidateHexes(state: GameState, currentHexId?: string): string[] {
  const free = freeBuildableHexes(state);
  const chosen = new Set<string>();
  for (const zone of ZONE_IDS) {
    const candidates = free.filter((id) => basin(id) === zone)
      .sort((a, b) => hexDistance(a, zoneHexId(zone, state.config)) - hexDistance(b, zoneHexId(zone, state.config)));
    for (const id of candidates.slice(0, 10)) chosen.add(id);
  }
  if (currentHexId && hexById(currentHexId)) chosen.add(currentHexId);
  return [...chosen];
}
