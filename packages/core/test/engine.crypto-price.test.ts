import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { getPlayerView, resolveTurn } from '../src/engine';
import { estimateSales } from '../src/sim/advice';
import { PRICE_MAX_RATIO } from '../src/sim/constants';
import type { SectorId } from '../src/types';
import { companyOf, human, newGame } from './helpers';

function demandAfterPriceRise(sectorId: SectorId) {
  const state = newGame(37, [human('a', sectorId), human('b', sectorId)]);
  state.activeEffects = [];
  for (const company of Object.values(state.companies)) {
    company.cash = 1e9;
    company.reputation = 1;
    for (const product of company.products) Object.assign(product, {
      sectorId, price: SECTORS[sectorId].refPrice, quality: 1, brand: 1,
      capacity: 500, production: 500, pendingCapacity: 0, stock: 0, marketing: 0, rnd: 0,
    });
  }
  const dearer = structuredClone(state);
  companyOf(dearer, 'a').products[0].price *= 2;
  const estimate = (s: typeof state) => {
    const product = getPlayerView(s, 'a').companies.find((c) => c.controllerId === 'a')!.products[0];
    return estimateSales(sectorId, product.private!.market!, {
      quality: product.quality, brand: product.brand, price: product.price, capacity: product.capacity,
      production: 500, stock: 0, marketing: 0, rnd: 0,
    }).sales;
  };
  const estimateRatio = estimate(dearer) / estimate(state);
  resolveTurn(state);
  resolveTurn(dearer);
  return { estimateRatio, actualRatio: companyOf(dearer, 'a').products[0].lastSales / companyOf(state, 'a').products[0].lastSales };
}

describe('sector-specific price sensitivity', () => {
  it('the real market and client estimate retain more crypto buyers after doubling the price', () => {
    const crypto = demandAfterPriceRise('crypto');
    expect(crypto.actualRatio).toBeGreaterThan(1 / 3);
    expect(crypto.estimateRatio).toBeGreaterThan(1 / 3);
    const yogurts = demandAfterPriceRise('yogurts');
    const drinks = demandAfterPriceRise('energy_drinks');
    const scooters = demandAfterPriceRise('scooters');
    const gadgets = demandAfterPriceRise('gadgets');
    for (const key of ['actualRatio', 'estimateRatio'] as const) {
      expect(yogurts[key]).toBeGreaterThan(drinks[key]);
      expect(drinks[key]).toBeGreaterThan(scooters[key]);
      expect(scooters[key]).toBeGreaterThan(gadgets[key]);
      expect(gadgets[key]).toBeLessThan(0.1);
    }
    expect(SECTORS.crypto.elasticity).toBe(1.5);
    expect(PRICE_MAX_RATIO).toBe(3);
  });
});
