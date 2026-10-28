/** Industrial ownership and shared commercial profiles. No I/O, RNG or implicit state migration. */
import { isSpatialMap } from '../content/hexes';
import { SECTORS } from '../content';
import type { CompanyState, GameState, ProductProfile, ProductState } from '../types';
import { hasPlannedSupply } from './marketDemand';

export const FACTORY_CAPACITY_MULTIPLIER = 2;
export const VACANT_LAND_UPKEEP_RATIO = .05;
export const usesIndustryNetwork = (state: Pick<GameState, 'config'>): boolean => isSpatialMap(state.config) && state.config.industryRules === 'network';
export const productIdentity = (p: Pick<ProductState, 'id' | 'factoryProductId'>): string => p.factoryProductId ?? p.id;
export const productCount = (c: { products: Pick<ProductState, 'id' | 'factoryProductId'>[] }): number => new Set(c.products.map(productIdentity)).size;
export const productProfile = (c: CompanyState, p: ProductState): ProductProfile | undefined => c.productProfiles?.find(profile => profile.id === productIdentity(p));
export const budgetFactory = (c: CompanyState, p: ProductState): ProductState => c.products.find(factory => factory.id === productProfile(c, p)?.budgetFactoryId) ?? p;
export const factoryCapacityLimit = (p: ProductState): number => Math.max(p.capacity + p.pendingCapacity,
  FACTORY_CAPACITY_MULTIPLIER * (p.initialCapacity ?? SECTORS[p.sectorId].startingCapacity));

export function ownedLand(c: CompanyState): { hexId: string; cost: number }[] {
  if (c.land) return c.land;
  return c.products.flatMap(p => p.hexId && !p.incubator ? [{ hexId: p.hexId, cost: p.landCost ?? 0 }] : []);
}
export const factoryOnLand = (c: CompanyState, hexId: string): ProductState | undefined => c.products.find(p => p.hexId === hexId || p.pendingHexId === hexId);
export function ensureLand(c: CompanyState): NonNullable<CompanyState['land']> {
  return c.land ??= ownedLand(c).map(parcel => ({ ...parcel }));
}
export function addLand(c: CompanyState, hexId: string, cost: number): void {
  const land = ensureLand(c);
  if (!land.some(parcel => parcel.hexId === hexId)) land.push({ hexId, cost });
}
export function emptyLandCount(state: GameState, controllerId: string | null): number {
  return Object.values(state.companies).filter(c => c.status === 'active' && c.controllerId === controllerId)
    .reduce((sum, c) => sum + ownedLand(c).filter(parcel => !factoryOnLand(c, parcel.hexId)).length, 0);
}

/** Called when creating a second factory, never when reading a view. */
export function ensureProductProfile(c: CompanyState, p: ProductState): ProductProfile {
  const found = productProfile(c, p);
  if (found) return found;
  const profile: ProductProfile = { id: p.id, name: p.name, sectorId: p.sectorId, price: p.price, quality: p.quality,
    brand: p.brand, marketing: p.marketing, rnd: p.rnd, budgetFactoryId: p.id };
  p.factoryProductId = p.id;
  (c.productProfiles ??= []).push(profile);
  return profile;
}

/** Mirrors public commercial fields for old readers; budgets are charged exactly once. */
export function syncProductProfiles(c: CompanyState): void {
  for (const profile of c.productProfiles ?? []) {
    const factories = c.products.filter(p => productIdentity(p) === profile.id);
    if (!factories.length) continue;
    if (!factories.some(p => p.id === profile.budgetFactoryId)) profile.budgetFactoryId = factories[0].id;
    for (const p of factories) {
      p.name = profile.name; p.price = profile.price; p.quality = profile.quality; p.brand = profile.brand;
      p.marketing = p.id === profile.budgetFactoryId ? profile.marketing : 0;
      p.rnd = p.id === profile.budgetFactoryId ? profile.rnd : 0;
    }
  }
  if (c.productProfiles) c.productProfiles = c.productProfiles.filter(profile => c.products.some(p => productIdentity(p) === profile.id));
}

/** A brand contributes one attraction in total, distributed over its active physical capacity. */
export function factoryAttractivenessWeight(c: CompanyState, p: ProductState, knownPlans = true, includePending = false): number {
  if (!p.factoryProductId) return 1;
  const active = c.products.filter(q => productIdentity(q) === productIdentity(p)
    && (knownPlans ? hasPlannedSupply({ ...q, capacity: q.capacity + (includePending ? q.pendingCapacity : 0) }) : q.capacity + (includePending ? q.pendingCapacity : 0) > 0));
  if (!active.some(q => q.id === p.id)) return 0;
  const weight = (q: ProductState) => Math.max(1, q.capacity + (includePending ? q.pendingCapacity : 0));
  return weight(p) / active.reduce((sum, q) => sum + weight(q), 0);
}
