/**
 * Marchés régionaux (§5.2 bis) : où sont les clients de chaque secteur. Tables fixes, tirées du contenu (population
 * et goûts des villes, routes, bonus « fabriqué ici » des secteurs), construites une seule fois. Fonctions pures,
 * sans RNG.
 *
 * La demande d'un secteur se partage entre les villes (population × goût). Dans chaque ville, c'est le logit du §5.2,
 * chaque produit pesant son attractivité × son facteur de proximité à la ville. La distance ne retire rien : le facteur
 * vaut 1 partout, sauf dans la ville de l'usine, où le bonus « fabriqué ici » du secteur le porte à 1 + localBonus
 * (la capitale n'a pas de bonus : une usine à la capitale a un facteur de 1 partout, comme les importateurs, qui
 * débarquent au port). La distance se paie en fret, au poids (§5.8, sim/transport).
 *
 * Évaluation nationale : quand toutes les usines du secteur sont à la capitale, un seul marché, de poids 1, où chaque
 * proximité vaut 1. La même boucle redonne alors exactement les calculs d'avant (x × 1 = x, 0 + x = x). Ne jamais
 * remplacer l'évaluation nationale par celle à cinq villes : le résultat serait le même, pas les arrondis.
 */
import { capitalHexId, proximityOfHex } from './hexes';
import { capitalCellId, cellBoardConfig, isSpatialMap } from '../content/hexes';
import { CITIES, DEFAULT_ZONE, SECTORS, roadRoute } from '../content';
import { CITY_IDS, SECTOR_IDS, ZONE_IDS, type CityId, type GameState, type Id, type ProductState, type SectorId, type ZoneId } from '../types';
import { MIX_REF_OTHERS } from './constants';
import { fin } from './util';

/** Le marché national : un seul marché, de poids 1, où chaque proximité vaut 1. */
export const NATIONAL: readonly number[] = Object.freeze([1]);
const ONES: readonly number[] = Object.freeze(CITY_IDS.map(() => 1));

/** Réglages des marchés régionaux (banc d'essai seulement : le jeu garde les valeurs par défaut). */
export interface RegionParams {
  /** Amplitude des goûts : τ′ = 1 + α (τ − 1). */
  tasteAmplitude: number;
  /** Livraison au prorata de la population (la règle d'avant), au lieu des ventes de référence. */
  legacyDelivery: boolean;
}
const DEFAULT_PARAMS: RegionParams = { tasteAmplitude: 1, legacyDelivery: false };
let params = DEFAULT_PARAMS;

interface Tables {
  /** Part des clients du secteur dans chaque ville (somme 1). */
  weights: Record<SectorId, readonly number[]>;
  /** Facteur d'une usine de la zone à chaque ville : 1 partout, 1 + localBonus dans sa propre ville. */
  proximity: Record<SectorId, Record<ZoneId, readonly number[]>>;
  /** Ventes de référence par ville d'une usine de la zone (somme 1) : la base de la livraison. */
  mix: Record<SectorId, Record<ZoneId, readonly number[]>>;
  /** Distance absolue moyenne d'une livraison (km pondérés), au mélange de référence. */
  deliveryKm: Record<SectorId, Record<ZoneId, number>>;
  /** Itinéraires absolus de chaque zone vers chaque ville (km pondérés), partagés par tous les secteurs. */
  cityKm: Record<ZoneId, Readonly<Record<CityId, number>>>;
}
let tables: Tables | null = null;

/** Change les réglages des marchés régionaux (banc d'essai et tests seulement) ; null : ceux du jeu. */
export function setRegionParams(p: Partial<RegionParams> | null): void {
  params = p ? { ...DEFAULT_PARAMS, ...p } : DEFAULT_PARAMS;
  tables = null;
}

function route(from: string, to: string): number {
  return from === to ? 0 : (roadRoute(from, to)?.cost ?? 0);
}

function build(): Tables {
  const weights = {} as Tables['weights'];
  const proximity = {} as Tables['proximity'];
  const mix = {} as Tables['mix'];
  const deliveryKm = {} as Tables['deliveryKm'];
  const cityKm = {} as Tables['cityKm'];
  for (const z of ZONE_IDS) cityKm[z] = Object.freeze(byCity(CITY_IDS.map((k) => route(z, k))));
  for (const s of SECTOR_IDS) {
    const raw = CITY_IDS.map((k) => CITIES[k].share * (1 + params.tasteAmplitude * (CITIES[k].taste[s] - 1)));
    const sum = raw.reduce((a, b) => a + b, 0);
    const w = Object.freeze(raw.map((x) => x / sum));
    weights[s] = w;
    proximity[s] = {} as Record<ZoneId, readonly number[]>;
    mix[s] = {} as Record<ZoneId, readonly number[]>;
    deliveryKm[s] = {} as Record<ZoneId, number>;
    for (const z of ZONE_IDS) {
      // Le bonus « fabriqué ici » ne joue que si la zone est une ville de province (plaine et montagne n'en ont pas).
      const pi =
        z === DEFAULT_ZONE
          ? ONES
          : Object.freeze(CITY_IDS.map((k) => (k === z ? 1 + SECTORS[s].localBonus : 1)));
      proximity[s][z] = pi;
      const m = params.legacyDelivery ? CITY_IDS.map((k) => CITIES[k].share) : CITY_IDS.map((_, i) => (w[i] * pi[i]) / (MIX_REF_OTHERS + pi[i]));
      const total = m.reduce((a, b) => a + b, 0);
      const mz = Object.freeze(m.map((x) => x / total));
      mix[s][z] = mz;
      deliveryKm[s][z] = mz.reduce((a, x, i) => a + x * cityKm[z][CITY_IDS[i]], 0);
    }
  }
  return { weights, proximity, mix, deliveryKm, cityKm };
}

function data(): Tables {
  return (tables ??= build());
}

/** L'usine est hors de la capitale (absent : la capitale). */
export function away(zoneId?: ZoneId): boolean {
  return zoneId !== undefined && zoneId !== DEFAULT_ZONE;
}

/** Poids des villes dans la demande du secteur ; national : [1]. */
export function weightsOf(sectorId: SectorId, regional: boolean): readonly number[] {
  return regional ? data().weights[sectorId] : NATIONAL;
}

/** Facteur de proximité à chaque ville d'une usine du secteur dans la zone ; national : [1]. */
export function proximityOf(sectorId: SectorId, zoneId: ZoneId | undefined, regional: boolean): readonly number[] {
  return regional ? data().proximity[sectorId][zoneId ?? DEFAULT_ZONE] : NATIONAL;
}

/** Un produit sur un marché : son attractivité et la zone de son usine. */
export interface MarketEntry {
  a: number;
  zoneId?: ZoneId;
  hexId?: Id;
}

/** Le secteur s'évalue ville par ville : un produit en rayon (a > 0) a son usine hors de la capitale, ou `extraZone`. */
export function isRegional(entries: readonly MarketEntry[], extraZone?: ZoneId): boolean {
  if (away(extraZone)) return true;
  for (const e of entries) if (e.a > 0 && (e.hexId !== undefined ? awayHex(e.hexId) : away(e.zoneId))) return true;
  return false;
}

/**
 * Σ attractivité par marché : `base` (les importateurs, proximité 1 partout) plus chaque entrée × sa proximité, dans
 * l'ordre des entrées. National : [base + Σ a], le calcul d'avant.
 */
export function cityTotals(sectorId: SectorId, base: number, entries: readonly MarketEntry[], regional: boolean): number[] {
  if (!regional) {
    let total = base;
    for (const e of entries) total += e.a;
    return [total];
  }
  const out = CITY_IDS.map(() => base);
  for (const e of entries) {
    const pi = e.hexId !== undefined ? proximityOfHex(sectorId, e.hexId, true) : proximityOf(sectorId, e.zoneId, true);
    for (let k = 0; k < out.length; k++) out[k] += e.a * pi[k];
  }
  return out;
}

/**
 * Demande d'un produit d'attractivité `a`, usine dans `zoneId`, face à `others` (Σ des autres, importateurs compris) :
 * le logit ville par ville (§5.2 bis). `othersByCity` : les autres ville par ville (ordre de `CITY_IDS`), quand l'un
 * d'eux a son usine hors de la capitale. Sans lui, si le produit est hors de la capitale, chaque ville voit `others`
 * (tous les autres y sont) ; s'il y est aussi : le calcul national d'avant.
 */
export function demandIn(sectorId: SectorId, D: number, a: number, zoneId: ZoneId | undefined, others: number, othersByCity?: readonly number[]): number {
  return demandInBy(sectorId, D, a, zoneId, others, othersByCity, away, proximityOf);
}

/** Logit commun aux zones et aux cases : mêmes multiplications, divisions et additions dans le même ordre. */
function demandInBy<Position>(
  sectorId: SectorId,
  D: number,
  a: number,
  position: Position,
  others: number,
  othersByCity: readonly number[] | undefined,
  isAway: (position: Position) => boolean,
  proximityAt: (sectorId: SectorId, position: Position, regional: boolean) => readonly number[],
): number {
  const regional = othersByCity !== undefined || isAway(position);
  const w = weightsOf(sectorId, regional);
  const pi = proximityAt(sectorId, position, regional);
  let demand = 0;
  for (let k = 0; k < w.length; k++) {
    const mine = a * pi[k];
    const total = mine + Math.max(0, othersByCity ? othersByCity[k] : others);
    demand += total > 0 ? fin((Math.max(0, D) * w[k] * mine) / total) : 0;
  }
  return demand;
}

/** Tableau dans l'ordre de `CITY_IDS` → enregistrement par ville. */
export function byCity(values: readonly number[]): Record<CityId, number> {
  const out = {} as Record<CityId, number>;
  CITY_IDS.forEach((k, i) => (out[k] = values[i]));
  return out;
}

/** Enregistrement par ville → tableau dans l'ordre de `CITY_IDS`. */
export function cityArray(values: Record<CityId, number>): number[] {
  return CITY_IDS.map((k) => values[k]);
}

/** Part des clients du secteur dans chaque ville (somme 1). */
export function cityWeights(sectorId: SectorId): Record<CityId, number> {
  return byCity(data().weights[sectorId]);
}

/** Facteur de proximité à chaque ville d'une usine du secteur dans la zone (1 partout à la capitale et hors des villes). */
export function proximity(sectorId: SectorId, zoneId: ZoneId): Record<CityId, number> {
  return byCity(data().proximity[sectorId][zoneId]);
}

/** Ventes de référence par ville d'une usine du secteur dans la zone (somme 1) : la base de la livraison (§5.8). */
export function salesMix(sectorId: SectorId, zoneId: ZoneId): Record<CityId, number> {
  return byCity(data().mix[sectorId][zoneId]);
}

/** Distance absolue moyenne d'une livraison (km pondérés), au mélange de ventes de référence. */
export function deliveryKm(sectorId: SectorId, zoneId: ZoneId): number {
  return data().deliveryKm[sectorId][zoneId];
}

/** Distance absolue de la zone vers chaque ville (km pondérés), table immuable mémoïsée. */
export function deliveryKmByCity(zoneId: ZoneId): Readonly<Record<CityId, number>> {
  return data().cityKm[zoneId];
}

/** Le choix explicite du mode conserve les calculs régionaux d'un état classique. */
export function awayHex(hexId?: Id): boolean {
  return hexId !== undefined && hexId !== capitalCellId(cellBoardConfig(hexId));
}

export function productAway(state: GameState, p: ProductState): boolean {
  return isSpatialMap(state.config) ? awayHex(p.hexId) : away(p.zoneId);
}

export function productProximity(state: GameState, p: ProductState, regional: boolean): readonly number[] {
  return isSpatialMap(state.config) ? proximityOfHex(p.sectorId, p.hexId ?? capitalCellId(state.config), regional) : proximityOf(p.sectorId, p.zoneId, regional);
}

export function marketEntry(state: GameState, p: ProductState, a: number): MarketEntry {
  return isSpatialMap(state.config) ? { a, hexId: p.hexId ?? capitalCellId(state.config) } : { a, zoneId: p.zoneId };
}

/** Même logit pour une case, en conservant le calcul national à un seul marché. */
export function demandInHex(sectorId: SectorId, D: number, a: number, hexId: Id | undefined, others: number, othersByCity?: readonly number[]): number {
  return demandInBy(sectorId, D, a, hexId ?? capitalHexId, others, othersByCity, awayHex, proximityOfHex);
}
