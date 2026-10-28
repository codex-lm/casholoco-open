/**
 * Plateau fixe (§5.8 bis), généré comme la maquette à partir de la géométrie du pays.
 * q/r sont les colonnes/rangées décalées (rangées impaires vers la droite), pas des coordonnées axiales.
 * L'ordre public du plateau est colonne puis rangée : A1, A2, …, B1…
 */
import type { GameConfig, HexDef, MapPoint } from '../types';
import { CITIES, COASTLINE, DEPOSITS, ISLAND, LAKE, MAP_HEIGHT, MAP_WIDTH, MOUNTAIN_RANGE, ZONES, distanceKm } from './map';

export const HEX_R = 45;
export const HEX_WIDTH = Math.sqrt(3) * HEX_R;

/** Test géométrique commun au pavage et au coût des pistes. */
export function pointInPolygon(point: MapPoint, polygon: readonly MapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const GEOMETRY_EPSILON = 1e-9;

function pointOnSegment(point: MapPoint, a: MapPoint, b: MapPoint): boolean {
  const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  return Math.abs(cross) <= GEOMETRY_EPSILON * Math.max(1, distanceKm(a, b))
    && point.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON && point.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON
    && point.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON && point.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON;
}

function pointInOrOnPolygon(point: MapPoint, polygon: readonly MapPoint[]): boolean {
  return pointInPolygon(point, polygon) || polygon.some((a, i) => pointOnSegment(point, a, polygon[(i + 1) % polygon.length]));
}

/** Positions des intersections sur [a,b], y compris les extrémités d'un chevauchement colinéaire. */
function segmentIntersections(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint): number[] {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const lengthSquared = rx * rx + ry * ry;
  if (lengthSquared === 0) return pointOnSegment(a, c, d) ? [0] : [];
  const determinant = rx * sy - ry * sx;
  const cx = c.x - a.x, cy = c.y - a.y;
  if (Math.abs(determinant) > GEOMETRY_EPSILON) {
    const t = (cx * sy - cy * sx) / determinant;
    const u = (cx * ry - cy * rx) / determinant;
    return t >= -GEOMETRY_EPSILON && t <= 1 + GEOMETRY_EPSILON && u >= -GEOMETRY_EPSILON && u <= 1 + GEOMETRY_EPSILON
      ? [Math.max(0, Math.min(1, t))] : [];
  }
  if (Math.abs(cx * ry - cy * rx) > GEOMETRY_EPSILON * Math.max(1, Math.sqrt(lengthSquared))) return [];
  const t0 = (cx * rx + cy * ry) / lengthSquared;
  const t1 = ((d.x - a.x) * rx + (d.y - a.y) * ry) / lengthSquared;
  const start = Math.max(0, Math.min(t0, t1)), end = Math.min(1, Math.max(t0, t1));
  return start <= end + GEOMETRY_EPSILON ? [Math.max(0, Math.min(1, start)), Math.max(0, Math.min(1, end))] : [];
}

/** Vrai dès que le segment touche le polygone, même sur un sommet, une rive ou une extrémité. */
export function segmentIntersectsPolygon(a: MapPoint, b: MapPoint, polygon: readonly MapPoint[]): boolean {
  return pointInOrOnPolygon(a, polygon) || pointInOrOnPolygon(b, polygon)
    || polygon.some((c, i) => segmentIntersections(a, b, c, polygon[(i + 1) % polygon.length]).length > 0);
}

/** Le segment entier reste dans le polygone (bord compris), même lorsque celui-ci est concave. */
export function segmentWithinPolygon(a: MapPoint, b: MapPoint, polygon: readonly MapPoint[]): boolean {
  if (!pointInOrOnPolygon(a, polygon) || !pointInOrOnPolygon(b, polygon)) return false;
  const cuts = [0, 1];
  for (let i = 0; i < polygon.length; i++) cuts.push(...segmentIntersections(a, b, polygon[i], polygon[(i + 1) % polygon.length]));
  cuts.sort((x, y) => x - y);
  for (let i = 1; i < cuts.length; i++) {
    const t = (cuts[i - 1] + cuts[i]) / 2;
    if (!pointInOrOnPolygon({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, polygon)) return false;
  }
  return true;
}

interface Cell extends MapPoint {
  q: number;
  r: number;
  land: boolean;
  terrain: HexDef['terrain'];
  city?: HexDef['city'];
  zone?: HexDef['zone'];
  deposit?: string;
}

function build(): HexDef[] {
  const grid: Cell[] = [];
  for (let row = -1; row * 1.5 * HEX_R <= MAP_HEIGHT + HEX_R; row++) {
    for (let col = -1; col * HEX_WIDTH <= MAP_WIDTH + HEX_WIDTH; col++) {
      const point = { x: col * HEX_WIDTH + (row & 1 ? HEX_WIDTH / 2 : 0), y: row * 1.5 * HEX_R };
      const island = col === 1 && row === 14;
      const land = island || (pointInPolygon(point, COASTLINE) && !pointInPolygon(point, LAKE));
      grid.push({ ...point, q: col, r: row, land, terrain: island ? 'island' : pointInPolygon(point, MOUNTAIN_RANGE) ? 'mountain' : 'land' });
    }
  }
  function nearest(point: MapPoint, accepts: (cell: Cell) => boolean): Cell {
    let best: Cell | undefined, distance = Infinity;
    for (const cell of grid) {
      if (!accepts(cell)) continue;
      const d = distanceKm(cell, point);
      if (d < distance) { best = cell; distance = d; }
    }
    if (!best) throw new Error('No hex for map node');
    return best;
  }
  for (const city of Object.values(CITIES)) {
    const cell = nearest(city, (h) => h.land);
    cell.city = city.id;
    cell.zone = city.id;
  }
  for (const zone of [ZONES.plain, ZONES.mountain]) nearest(zone, (h) => h.land).zone = zone.id;
  // Les deux gisements en mer gardent leur nœud de réseau, mais n'ajoutent pas de terre au plateau.
  for (const deposit of Object.values(DEPOSITS)) {
    nearest(deposit, (h) => !h.city && !h.zone && !h.deposit).deposit = deposit.id;
  }
  const land = grid.filter((h) => h.land).sort((a, b) => a.q - b.q || a.r - b.r);
  const firstColumn = Math.min(...land.map((h) => h.q));
  return land.map(({ land: _, ...h }) => ({ id: `${String.fromCharCode(65 + h.q - firstColumn)}${h.r + 1}`, ...h }));
}

/** 158 cases continentales et l'île A15 explicitement déclarée terre : 159 cases. */
export const HEXES: readonly HexDef[] = Object.freeze(build().map((h) => Object.freeze(h)));
/** Square cells use their own namespace; old hex ids and geometry never change. */
export const SQUARE_SIZE = 75;
function buildSquares(): HexDef[] {
  const grid: Cell[] = [];
  for (let r = 0; r * SQUARE_SIZE <= MAP_HEIGHT; r++) for (let q = 0; q * SQUARE_SIZE <= MAP_WIDTH; q++) {
    const point = { x: q * SQUARE_SIZE, y: r * SQUARE_SIZE };
    grid.push({ ...point, q, r, land: pointInPolygon(point, COASTLINE) && !pointInPolygon(point, LAKE),
      terrain: pointInPolygon(point, MOUNTAIN_RANGE) ? 'mountain' : 'land' });
  }
  const centre = { x: ISLAND.reduce((n, p) => n + p.x, 0) / ISLAND.length, y: ISLAND.reduce((n, p) => n + p.y, 0) / ISLAND.length };
  const island = [...grid].sort((a, b) => distanceKm(a, centre) - distanceKm(b, centre))[0];
  island.land = true; island.terrain = 'island';
  const nearest = (point: MapPoint, accepts: (cell: Cell) => boolean) => {
    let best: Cell | undefined, distance = Infinity;
    for (const cell of grid) if (accepts(cell)) {
      const d = distanceKm(cell, point);
      if (d < distance) { best = cell; distance = d; }
    }
    if (!best) throw new Error('No square cell for map node');
    return best;
  };
  for (const city of Object.values(CITIES)) {
    const cell = nearest(city, h => h.land && h.terrain !== 'island' && !h.zone);
    cell.city = city.id; cell.zone = city.id;
  }
  for (const zone of [ZONES.plain, ZONES.mountain]) nearest(zone, h => h.land && h.terrain !== 'island' && !h.zone).zone = zone.id;
  for (const deposit of Object.values(DEPOSITS)) {
    nearest(deposit, h => !h.city && !h.zone && !h.deposit && h.terrain !== 'island').deposit = deposit.id;
  }
  return grid.filter(h => h.land).sort((a, b) => a.q - b.q || a.r - b.r)
    .map(({ land: _, ...h }) => ({ id: `S-${String.fromCharCode(65 + h.q)}${h.r + 1}`, ...h }));
}
export const SQUARES: readonly HexDef[] = Object.freeze(buildSquares().map(h => Object.freeze(h)));
/** Both immutable catalogs, only for id-keyed geometry tables. Game loops use boardCells. */
export const ALL_CELLS: readonly HexDef[] = Object.freeze([...HEXES, ...SQUARES]);
const BY_ID = new Map(ALL_CELLS.map((h) => [h.id, h]));
const BY_COORD = new Map(HEXES.map((h) => [`${h.q},${h.r}`, h]));
const SQUARE_BY_COORD = new Map(SQUARES.map(h => [`${h.q},${h.r}`, h]));
export type BoardConfig = Pick<GameConfig, 'mapMode'>;
export const isSpatialMap = (config?: BoardConfig): boolean => config?.mapMode === 'hex' || config?.mapMode === 'square';
export const boardCells = (config?: BoardConfig): readonly HexDef[] => config?.mapMode === 'square' ? SQUARES : HEXES;
const SQUARE_BUILDABLE = Object.freeze(SQUARES.filter(h => !h.deposit).map(h => h.id));
export const boardBuildable = (config?: BoardConfig): readonly string[] => config?.mapMode === 'square' ? SQUARE_BUILDABLE : BUILDABLE;
export const cellBelongsToBoard = (id: string, config: BoardConfig): boolean => isSpatialMap(config) && !!hexById(id) && (id.startsWith('S-') === (config.mapMode === 'square'));
export const capitalCellId = (config?: BoardConfig): string => boardCells(config).find(h => h.zone === 'capital')!.id;
export const cellBoardConfig = (id: string): BoardConfig => ({ mapMode: id.startsWith('S-') ? 'square' : 'hex' });

/** Une case du plateau ; la mer, le lac et les identifiants inconnus n'en sont pas. */
export function hexById(id: string): HexDef | undefined {
  return BY_ID.get(id);
}

/** Voisines présentes sur le plateau seulement (la mer et le lac sont exclus). */
export function neighbors(id: string): HexDef[] {
  const h = hexById(id);
  if (!h) return [];
  if (id.startsWith('S-')) return [[1, 0], [-1, 0], [0, -1], [0, 1]]
    .map(([dq, dr]) => SQUARE_BY_COORD.get(`${h.q + dq},${h.r + dr}`)).filter((cell): cell is HexDef => cell !== undefined);
  const steps = h.r & 1
    ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  return steps.map(([dq, dr]) => BY_COORD.get(`${h.q + dq},${h.r + dr}`)).filter((cell): cell is HexDef => cell !== undefined);
}

/** Distance cubique, même si la ligne droite traverse la mer ou le lac ; inconnue : Infinity. */
export function hexDistance(a: string | HexDef, b: string | HexDef): number {
  const from = typeof a === 'string' ? hexById(a) : a;
  const to = typeof b === 'string' ? hexById(b) : b;
  if (!from || !to) return Infinity;
  if (from.id.startsWith('S-') !== to.id.startsWith('S-')) return Infinity;
  if (from.id.startsWith('S-')) return Math.abs(from.q - to.q) + Math.abs(from.r - to.r);
  const ax = from.q - (from.r - (from.r & 1)) / 2;
  const bx = to.q - (to.r - (to.r & 1)) / 2;
  const dx = ax - bx, dz = from.r - to.r;
  return Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dx + dz));
}

/** Toute terre sans gisement est constructible, montagnes et île comprises ; les routes n'occupent pas de case. */
export const BUILDABLE: readonly string[] = Object.freeze(HEXES.filter((h) => !h.deposit).map((h) => h.id));
