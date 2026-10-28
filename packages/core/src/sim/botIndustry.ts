import { SECTORS } from '../content';
import type { CompanyState, GameState, PlayerState, ProductState } from '../types';
import { runAction } from './actions';
import { estimateSales, marketInputs } from './advice';
import { estimatedUnitCost } from './finance';
import { candidateHexes } from './hexes';
import { hexReservePrice } from './hexAuctions';
import { ensureProductProfile, factoryCapacityLimit, ownedLand, productIdentity, productProfile, syncProductProfiles, usesIndustryNetwork } from './industry';

function margin(state: GameState, c: CompanyState): number {
  return c.products.reduce((sum, p) => {
    const profile = productProfile(c, p);
    const decisions = { ...p, marketing: profile?.marketing ?? p.marketing, rnd: profile?.rnd ?? p.rnd };
    return sum + estimateSales(p.sectorId, marketInputs(state, c, p, c.controllerId!, estimatedUnitCost(state, c, p)), decisions).margin;
  }, 0);
}

/** Conservative expansion: compare the whole company's contribution, never pretend the extra factory is a new brand. */
export function botFactoryNetwork(state: GameState, bot: PlayerState, cashFloor: (c: CompanyState) => number): void {
  if (!usesIndustryNetwork(state) || state.config.totalTurns - state.turn < 4) return;
  for (const company of Object.values(state.companies)) {
    if (company.status !== 'active' || company.controllerId !== bot.id) continue;
    if ((state.hexBids ?? []).some(b => !b.result && b.companyId === company.id && b.kind === 'factory')) continue;
    const candidates = [...new Set([...ownedLand(company).filter(l => !company.products.some(p => p.hexId === l.hexId)).map(l => l.hexId), ...candidateHexes(state)])];
    const available = company.cash - cashFloor(company);
    let best: { source: ProductState; hexId: string; bid?: number; value: number } | undefined;
    for (const source of company.products) {
      if (source.incubator || source.capacity <= 0 || source.pendingCapacity > 0 || source.capacity < factoryCapacityLimit(source)) continue;
      const profile = productProfile(company, source);
      const demand = estimateSales(source.sectorId, marketInputs(state, company, source, bot.id, estimatedUnitCost(state, company, source)),
        { ...source, marketing: profile?.marketing ?? source.marketing, rnd: profile?.rnd ?? source.rnd }).demand;
      if (demand < source.capacity * 1.1 || source.stock > .2 * source.capacity) continue;
      const cost = SECTORS[source.sectorId].launchCost;
      const baseline = margin(state, company);
      for (const hexId of candidates) {
        if ((state.hexBids ?? []).some(b => !b.result && b.playerId === bot.id && b.hexId === hexId)) continue;
        const owned = ownedLand(company).some(l => l.hexId === hexId);
        const reserve = owned ? 0 : hexReservePrice(hexId);
        if (available < cost + reserve) continue;
        const clone: CompanyState = { ...company, products: company.products.map(p => ({ ...p })), productProfiles: company.productProfiles?.map(p => ({ ...p })) };
        const copied = clone.products.find(p => p.id === source.id)!;
        const common = ensureProductProfile(clone, copied);
        const capacity = SECTORS[source.sectorId].startingCapacity;
        clone.products.push({ ...copied, id: `${source.id}-forecast`, factoryProductId: productIdentity(copied), terrainId: undefined,
          hexId, capacity, initialCapacity: capacity, pendingCapacity: 0, stock: 0, production: capacity, marketing: 0, rnd: 0 });
        syncProductProfiles(clone);
        const forecast = { ...state, companies: { ...state.companies, [clone.id]: clone } };
        const gain = margin(forecast, clone) - baseline;
        const value = gain * (state.config.totalTurns - state.turn) - cost - reserve;
        if (common && value > 0 && (!best || value > best.value)) best = { source, hexId, ...(owned ? {} : { bid: reserve }), value };
      }
    }
    if (best) runAction(state, bot.id, { type: 'buildFactory', companyId: company.id, productId: best.source.id, hexId: best.hexId, ...(best.bid !== undefined ? { bid: best.bid } : {}) });
  }
}
