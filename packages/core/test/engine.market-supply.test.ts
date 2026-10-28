import { afterEach, describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { createGame, getPlayerView, resolveTurn } from '../src/engine';
import { estimateSales, marketInputs } from '../src/sim/advice';
import { demandFrom, expectedOutlook, planClose } from '../src/sim/close';
import { capitalHexId, zoneHexId } from '../src/sim/hexes';
import { hasKnownSupply, hasPlannedSupply } from '../src/sim/marketDemand';
import { companyOf, config, human } from './helpers';

const volatility = SECTORS.crypto.volatility;
afterEach(() => { SECTORS.crypto.volatility = volatility; });

function market(mapMode: 'classic' | 'hex') {
  const state = createGame({ ...config(39), mapMode, terrainAssignment: 'host', terrains: { a: 'quai-port-dividende' } }, [human('a', 'crypto')]);
  const company = companyOf(state, 'a');
  state.companies = { [company.id]: company };
  state.activeEffects = [];
  company.cash = 1e9;
  company.modifiers = [];
  delete company.terrainId;
  const product = company.products[0];
  delete product.terrainId;
  Object.assign(product, { capacity: 100, production: 0, stock: 10_000, pendingCapacity: 0,
    quality: 2, brand: 2, price: 1.4 * SECTORS.crypto.refPrice, marketing: 150, rnd: 75,
    zoneId: 'capital', hexId: capitalHexId });
  SECTORS.crypto.volatility = 0;
  state.sectors.crypto.demandMultiplier = 1;
  return { state, company, product };
}

describe('only supplied lines participate in the market', () => {
  it('requires existing stock or at least one producible planned lot', () => {
    expect(hasPlannedSupply({ capacity: 100, production: 0, stock: 0 })).toBe(false);
    expect(hasPlannedSupply({ capacity: 0, production: 100, stock: 0 })).toBe(false);
    expect(hasPlannedSupply({ capacity: 100, production: 0.5, stock: 0 })).toBe(false);
    expect(hasPlannedSupply({ capacity: 0, production: 0, stock: 1 })).toBe(true);
    expect(hasPlannedSupply({ capacity: 100, production: 1, stock: 0 })).toBe(true);
  });

  it.each(['classic', 'hex'] as const)('an installed idle own line changes neither close, client estimates nor resolution in %s', (mode) => {
    const { state, company, product } = market(mode);
    const inputs = marketInputs(state, company, product, 'a', 0);
    const expected = estimateSales('crypto', inputs, product);
    const closeSales = planClose(state, company).sales.funded;
    const reference = structuredClone(state);
    const idle = { ...product, id: `${product.id}-idle`, production: 0, stock: 0,
      price: 3 * SECTORS.crypto.refPrice, zoneId: 'north' as const, hexId: zoneHexId('north') };
    company.products.push(idle);

    for (const priceRatio of [0.7, 3]) {
      idle.price = priceRatio * SECTORS.crypto.refPrice;
      expect(marketInputs(state, company, product, 'a', 0)).toEqual(inputs);
      expect(estimateSales('crypto', marketInputs(state, company, product, 'a', 0), product)).toEqual(expected);
      expect(estimateSales('crypto', marketInputs(state, company, idle, 'a', 0), idle).demand).toBe(0);
      expect(demandFrom(company, expectedOutlook(state, company), state)(idle, 1)).toBe(0);
      expect(planClose(state, company).sales.funded).toBeCloseTo(closeSales, 9);
    }
    resolveTurn(reference);
    resolveTurn(state);
    expect(product.lastSales).toBeCloseTo(reference.companies[company.id].products[0].lastSales, 9);
    expect(idle.lastSales).toBe(0);
    expect(state.sectors.crypto.lastMarketPriceMultiplier).toBeCloseTo(reference.sectors.crypto.lastMarketPriceMultiplier!, 12);
  });

  it.each(['classic', 'hex'] as const)('an idle rival price has no effect on resolved demand in %s, while its production stays private', (mode) => {
    const { state, company, product } = market(mode);
    const rival = { ...company, id: 'rival', controllerId: 'b', products: [{ ...product, id: 'rival-line',
      capacity: 100, production: 0, stock: 0, price: 0.7 * SECTORS.crypto.refPrice, lastPrice: SECTORS.crypto.refPrice }] };
    state.companies[rival.id] = rival;
    const inputs = marketInputs(state, company, product, 'a', 0);
    const outlook = expectedOutlook(state, company);
    rival.products[0].production = 100;
    expect(marketInputs(state, company, product, 'a', 0)).toEqual(inputs);
    expect(expectedOutlook(state, company)).toEqual(outlook);
    rival.products[0].production = 0;
    const expensive = structuredClone(state);
    expensive.companies.rival.products[0].price = 3 * SECTORS.crypto.refPrice;
    resolveTurn(state);
    resolveTurn(expensive);
    expect(product.lastSales).toBeCloseTo(expensive.companies[company.id].products[0].lastSales, 9);
    expect(state.sectors.crypto.lastMarketPriceMultiplier).toBeCloseTo(expensive.sectors.crypto.lastMarketPriceMultiplier!, 12);
    expect(rival.products[0].lastSales).toBe(0);
  });

  it.each(['classic', 'hex'] as const)('autopilot estimates use its own known idle sibling plans in %s', (mode) => {
    const { state, company, product } = market(mode);
    company.controllerId = null;
    const baseline = marketInputs(state, company, product, '', 0);
    company.products.push({ ...product, id: 'autopilot-idle', stock: 0, production: 0,
      price: 3 * SECTORS.crypto.refPrice, zoneId: 'north', hexId: zoneHexId('north') });
    expect(marketInputs(state, company, product, '', 0)).toEqual(baseline);
    expect(demandFrom(company, expectedOutlook(state, company), state)(product, 1))
      .toBeCloseTo(estimateSales('crypto', baseline, product).demand, 10);
  });

  it.each(['classic', 'hex'] as const)('keeps stock-only and producing lines, and waits for pending capacity, in %s', (mode) => {
    for (const supply of [{ capacity: 0, production: 0, stock: 100 }, { capacity: 100, production: 100, stock: 0 }]) {
      const { state, company, product } = market(mode);
      Object.assign(product, supply);
      const expected = estimateSales('crypto', marketInputs(state, company, product, 'a', 0), product);
      expect(expected.demand).toBeGreaterThan(0);
      expect(demandFrom(company, expectedOutlook(state, company), state)(product, 1)).toBeCloseTo(expected.demand, 10);
      resolveTurn(state);
      expect(product.lastSales).toBeCloseTo(expected.sales, 9);
      expect(state.sectors.crypto.lastMarketPriceMultiplier).toBeLessThan(1);
    }
    const { state, company, product } = market(mode);
    Object.assign(product, { capacity: 0, production: 100, stock: 0, pendingCapacity: 100 });
    const visible = getPlayerView(state, 'a').companies.find((c) => c.id === company.id)!.products[0];
    expect(hasKnownSupply(visible)).toBe(false);
    expect(hasKnownSupply(visible, 1)).toBe(true);
    resolveTurn(state);
    expect(product.lastSales).toBe(0);
    expect(state.sectors.crypto.lastMarketPriceMultiplier).toBe(1);
    resolveTurn(state);
    expect(product.lastSales).toBeGreaterThan(0);
    expect(state.sectors.crypto.lastMarketPriceMultiplier).toBeLessThan(1);
  });
});
