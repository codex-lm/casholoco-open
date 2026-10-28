/** Read-only spatial decomposition. These weights never participate in prices, demand resolution or sales. */
import { route } from './hexes';
import { pointInPolygon, boardCells, SQUARE_SIZE, type BoardConfig } from '../content/hexes';
import { CITIES, COASTLINE, HEX_R, LAKE } from '../content';
import { CITY_IDS, type CityId, type Id } from '../types';

// The board has no parcel population. Use a documented density around each city, decreasing with road cost.
// Sea/lake parcels have no residents; the island is inhabited. Each city's shares sum to one.
const makeShares = (config?: BoardConfig) => CITY_IDS.map((city) => {
  const weights = boardCells(config).map((hex) => {
    const inhabited = hex.terrain === 'island' || pointInPolygon(hex, COASTLINE) && !pointInPolygon(hex, LAKE);
    const distance = route(hex.id, city);
    return inhabited && Number.isFinite(distance) ? 1 / (1 + distance / (config?.mapMode === 'square' ? SQUARE_SIZE / 2 : HEX_R)) ** 2 : 0;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((weight) => weight / sum);
});
const SHARES = makeShares();
const SQUARE_SHARES = makeShares({ mapMode: 'square' });

/**
 * Project an unchanged product forecast onto destinations. Every city contributes its own customer demand.
 * The final inhabited cell receives the rounding remainder, so reducing in HEXES order reproduces total exactly.
 * Calling again with the same inputs returns the same numbers; neither inputs nor simulation state are mutated.
 */
export function projectDemandToHexes(total: number, byCity: Readonly<Record<CityId, number>>, config?: BoardConfig): Record<Id, number> {
  const HEXES = boardCells(config);
  const shares = config?.mapMode === 'square' ? SQUARE_SHARES : SHARES;
  const demand = Math.max(0, Number.isFinite(total) ? total : 0);
  const raw = HEXES.map((_hex, index) => CITY_IDS.reduce((sum, city, k) => sum + Math.max(0, byCity[city]) * shares[k][index], 0));
  const rawTotal = raw.reduce((a, b) => a + b, 0);
  let last = -1;
  raw.forEach((value, index) => { if (value > 0) last = index; });
  let assigned = 0;
  return Object.fromEntries(HEXES.map((hex, index) => {
    const value = demand === 0 || !(rawTotal > 0) ? 0 : index === last ? Math.max(0, demand - assigned) : raw[index] / rawTotal * demand;
    assigned += value;
    return [hex.id, value];
  }));
}

const POPULATION = Object.freeze(projectDemandToHexes(1, Object.fromEntries(CITY_IDS.map((city) => [city, CITIES[city].share])) as Record<CityId, number>));
const SQUARE_POPULATION = Object.freeze(projectDemandToHexes(1, Object.fromEntries(CITY_IDS.map((city) => [city, CITIES[city].share])) as Record<CityId, number>, { mapMode: 'square' }));
/** Estimated share of the national population, with the same city density as demand. Returns an independent copy. */
export function parcelPopulationShares(config?: BoardConfig): Record<Id, number> {
  return { ...(config?.mapMode === 'square' ? SQUARE_POPULATION : POPULATION) };
}
