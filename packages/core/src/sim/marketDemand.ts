/** Market size responds to the national attractiveness-weighted price, independently of city logits. */
import { SECTORS } from '../content';
import type { ProductView, SectorId } from '../types';

/** A line participates in the current market only when it has stock or can produce its planned lots. */
export function hasPlannedSupply(p: { stock: number; capacity: number; production: number }): boolean {
  return p.stock > 0 || (p.capacity >= 1 && p.production >= 1);
}

/** Player-view forecasts use known own plans and assume hidden rivals still operate. */
export function hasKnownSupply(p: ProductView, offset = 0): boolean {
  if (!p.private) return !p.comingSoon || offset > 0;
  return hasPlannedSupply({
    stock: p.private.stock,
    production: p.private.production,
    capacity: p.capacity + (offset > 0 ? p.private.pendingCapacity : 0),
  });
}

/**
 * `priceAttractiveness` is Σ(attractiveness × price), including the outside option at refPrice.
 * Weights are the unmodified national attractiveness of lines with stock or planned production
 * (not geography, realized sales or the size of their capacity).
 * All cities receive the same multiplier; changing a hypothetical product changes both sums.
 * Missing/zero market elasticity preserves the old calculation exactly.
 */
export function marketDemandMultiplier(sectorId: SectorId, totalAttractiveness: number, priceAttractiveness: number): number {
  const def = SECTORS[sectorId];
  const elasticity = def.marketElasticity ?? 0;
  if (!(elasticity > 0) || !Number.isFinite(elasticity)) return 1;
  if (!(totalAttractiveness > 0) || !Number.isFinite(totalAttractiveness)
    || !(priceAttractiveness > 0) || !Number.isFinite(priceAttractiveness)) return 1;
  const averagePrice = priceAttractiveness / totalAttractiveness;
  if (!(averagePrice > 0) || !Number.isFinite(averagePrice)) return 1;
  const multiplier = Math.pow(def.refPrice / averagePrice, elasticity);
  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}
