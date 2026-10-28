/** Sensible sector-specific starting decisions, using the ordinary public sales estimate. */
import { COMMODITIES, DEFAULT_ZONE, SECTORS } from '../content';
import type { CommodityId, SectorId } from '../types';
import { brandAfter, estimateSales, outsideAttractiveness, productAttractiveness, qualityAfter } from './advice';
import { EMERGENCY_PURCHASE_PREMIUM, START_BRAND, START_MARKETING_RATIO, START_PRODUCTION_RATIO, START_QUALITY, START_RND_RATIO } from './constants';

import { deliveryPerLot } from './transport';

export interface StartingDecisions { price: number; production: number; marketing: number; rnd: number }
const decisionsCache = new Map<string, StartingDecisions>();

/**
 * Compare recurring decisions over the ordinary 16-quarter game, against one ordinary rival and
 * the outside competitors. The same engine formulas value ads, R&D and both price
 * elasticities; this avoids a separate hand-tuned price/budget table.
 */
export function startingDecisions(sectorId: SectorId, capacity: number, spendFactor = 1, initialBrand = START_BRAND): StartingDecisions {
  const def = SECTORS[sectorId];
  // Fresh products have no stock. With no installed/planned capacity there is
  // no supplied product whose demand could justify a recurring paid budget.
  if (capacity < 1) return { price: def.refPrice, production: 0, marketing: 0, rnd: 0 };
  const inputPrices = Object.keys(def.inputs).map((cid) => COMMODITIES[cid as CommodityId].basePrice);
  const cacheKey = JSON.stringify([def, capacity, spendFactor, initialBrand, inputPrices]);
  const cached = decisionsCache.get(cacheKey);
  if (cached) return { ...cached };
  const marketSize = def.refPrice * def.refDemand;
  const production = Math.round(START_PRODUCTION_RATIO * capacity);
  let unitCost = def.laborCost + deliveryPerLot(DEFAULT_ZONE, sectorId);
  for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) unitCost += per * COMMODITIES[cid].basePrice * EMERGENCY_PURCHASE_PREMIUM;
  // Every positive batch has the same demand path for a given price and budgets.
  // Compute that path with the engine estimate once, then compare affordable
  // stocks and sales for all batch sizes without repeating the logit formulas.
  let rivalQuality = START_QUALITY, rivalBrand = initialBrand;
  const markets = Array.from({ length: 16 }, (_, index) => {
    const turn = index + 1;
    rivalQuality = qualityAfter(sectorId, rivalQuality, START_RND_RATIO * marketSize);
    rivalBrand = brandAfter(sectorId, rivalBrand, START_MARKETING_RATIO * marketSize);
    const others = outsideAttractiveness(sectorId, turn)
      + productAttractiveness(sectorId, rivalQuality, rivalBrand, 1, def.refPrice);
    return {
      demand: def.refDemand * Math.pow(1 + def.growth, index),
      othersAttractiveness: others, othersPriceAttractiveness: others * def.refPrice,
      reputation: 1, bonus: 1, unitCost, fixedCost: def.fixedCost,
    };
  });
  const demandPath = (price: number, marketing: number, rnd: number): number[] => {
    let quality = START_QUALITY, brand = initialBrand;
    return markets.map((market) => {
      const demand = estimateSales(sectorId, market, {
        quality, brand, stock: 0, capacity, production: 1, price, marketing, rnd,
      }).demand;
      quality = qualityAfter(sectorId, quality, rnd);
      brand = brandAfter(sectorId, brand, marketing);
      return demand;
    });
  };
  const score = (demands: readonly number[], { price, production, marketing, rnd }: StartingDecisions): number => {
    let stock = 0, total = 0;
    for (const demand of demands) {
      const sales = Math.min(demand, stock + production);
      const endStock = Math.max(0, stock + production - sales) * (1 - def.perishability);
      total += sales * price - production * unitCost - marketing - rnd - def.fixedCost + (endStock - stock) * unitCost;
      stock = endStock;
    }
    return total;
  };
  // A batch at least this large fills every projected quarter's demand. Any
  // additional output earns no revenue and only adds spoilage or tied-up cash.
  const batchBound = (demands: readonly number[]): number => Math.min(Math.floor(capacity), Math.max(1, Math.ceil(Math.max(...demands))));
  let best: StartingDecisions = { price: def.refPrice, production,
    marketing: Math.round(START_MARKETING_RATIO * marketSize * spendFactor),
    rnd: Math.round(START_RND_RATIO * marketSize * spendFactor) };
  const initialDemands = demandPath(best.price, best.marketing, best.rnd);
  best.production = Math.min(best.production, batchBound(initialDemands));
  let bestScore = score(initialDemands, best);
  const budgets = [0.002, 0.004, 0.008, 0.012, 0.016, 0.022, 0.03]
    .map((ratio) => Math.round(ratio * marketSize * spendFactor));
  const marketingCandidates = [...new Set([best.marketing, ...budgets])];
  const rndCandidates = [...new Set([best.rnd, ...budgets])];
  // Price, research and production interact. Changing only one at a time can
  // reject a better complete plan, so cover the same finite domain jointly.
  for (const marketing of marketingCandidates) for (const rnd of rndCandidates) {
    for (let step = 0; step < 37; step++) {
      const price = Math.round(def.refPrice * (0.7 + 0.05 * step) * 100) / 100;
      if (price < 1.08 * unitCost) continue;
      const demands = demandPath(price, marketing, rnd);
      for (let production = 1; production <= batchBound(demands); production++) {
        const candidate = { price, production, marketing, rnd };
        const result = score(demands, candidate);
        if (result > bestScore) { best = candidate; bestScore = result; }
      }
    }
  }
  // Keys include all effective sector parameters: content overrides in balance
  // experiments and tests never reuse a decision from another economy.
  if (decisionsCache.size >= 128) decisionsCache.clear();
  decisionsCache.set(cacheKey, best);
  return { ...best };
}
