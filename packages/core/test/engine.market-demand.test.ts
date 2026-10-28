import { afterEach, describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { createGame, getPlayerView, resolveTurn } from '../src/engine';
import { estimateSales, marketInputs, productAttractiveness } from '../src/sim/advice';
import { demandFrom, expectedOutlook, planClose } from '../src/sim/close';
import { marketDemandMultiplier } from '../src/sim/marketDemand';
import { capitalHexId, zoneHexId } from '../src/sim/hexes';
import { demandIn } from '../src/sim/regions';
import { SECTOR_IDS } from '../src/types';
import { companyOf, config, human } from './helpers';

const defaults = Object.fromEntries(SECTOR_IDS.map((sid) => [sid, { ...SECTORS[sid] }]));
afterEach(() => { for (const sid of SECTOR_IDS) Object.assign(SECTORS[sid], defaults[sid]); });

function isolated(mapMode: 'classic' | 'hex', regional: boolean) {
  const s = createGame({ ...config(39), mapMode, terrainAssignment: 'host', terrains: { a: 'quai-port-dividende' } }, [human('a', 'crypto')]);
  const c = companyOf(s, 'a');
  s.companies = { [c.id]: c };
  s.activeEffects = [];
  c.cash = 1e9;
  c.modifiers = [];
  delete c.terrainId;
  const p = c.products[0];
  delete p.terrainId;
  Object.assign(p, { capacity: 100, production: 0, stock: 10_000, pendingCapacity: 0,
    quality: 2, brand: 2, price: 2.6 * SECTORS.crypto.refPrice, marketing: 150, rnd: 75,
    zoneId: 'capital', hexId: capitalHexId });
  c.products.push({ ...p, id: `${p.id}-second`, price: 1.4 * SECTORS.crypto.refPrice, marketing: 450, rnd: 300,
    zoneId: regional ? 'north' : 'capital', hexId: regional ? zoneHexId('north') : capitalHexId });
  SECTORS.crypto.volatility = 0;
  s.sectors.crypto.demandMultiplier = 1;
  return { s, c, p };
}

describe('market-level price response', () => {
  it('includes the outside option at its reference price and shrinks a dominant cap-priced market', () => {
    SECTORS.crypto.marketElasticity = 1.25;
    const ref = SECTORS.crypto.refPrice;
    const outside = SECTORS.crypto.outsideAttractiveness;
    const a = productAttractiveness('crypto', 12, 6, 1, 3 * ref);
    const total = outside + a;
    const priceMass = outside * ref + a * 3 * ref;
    const multiplier = marketDemandMultiplier('crypto', total, priceMass);
    expect(multiplier).toBeCloseTo((ref / (priceMass / total)) ** 1.25, 12);
    expect(multiplier).toBeLessThan(0.3);
    expect(multiplier).toBeGreaterThan(3 ** -1.25); // The outside option cushions the expensive market.
    const capSales = demandIn('crypto', 110 * multiplier, a, undefined, outside);
    const referenceA = productAttractiveness('crypto', 12, 6, 1, ref);
    const referenceSales = demandIn('crypto', 110, referenceA, undefined, outside);
    expect(capSales * 3 * ref).toBeLessThan(referenceSales * ref);
    expect(marketDemandMultiplier('crypto', outside, outside * ref)).toBe(1);
  });

  it('preserves zero-elasticity sectors exactly, including malformed price sums', () => {
    for (const sid of ['energy_drinks', 'gadgets', 'scooters', 'yogurts'] as const) {
      delete SECTORS[sid].marketElasticity;
      expect(marketDemandMultiplier(sid, 10, 100_000)).toBe(1);
      expect(marketDemandMultiplier(sid, NaN, Infinity)).toBe(1);
      SECTORS[sid].marketElasticity = 0;
      expect(marketDemandMultiplier(sid, 10, 100_000)).toBe(1);
      expect(marketDemandMultiplier(sid, NaN, Infinity)).toBe(1);
    }
    SECTORS.crypto.marketElasticity = 0;
    const market = { demand: 321.123, othersAttractiveness: 6.5, othersPriceAttractiveness: NaN,
      reputation: 1, bonus: 1, unitCost: 0, fixedCost: 0 };
    const d = { quality: 1, brand: 1, price: 456, marketing: 0, rnd: 0, production: 1000, capacity: 1000, stock: 0 };
    const a = productAttractiveness('crypto', 0.99, 0.825, 1, d.price);
    expect(estimateSales('crypto', market, d).demand).toBe(demandIn('crypto', market.demand, a, undefined, market.othersAttractiveness));
  });

  it('guards empty, nonpositive and nonfinite averages without consuming randomness', () => {
    SECTORS.crypto.marketElasticity = 1.25;
    for (const [total, priceMass] of [[0, 0], [-1, 1], [1, 0], [1, -1], [NaN, 1], [1, NaN], [Infinity, 1], [1, Infinity]]) {
      expect(marketDemandMultiplier('crypto', total, priceMass)).toBe(1);
    }
    const once = marketDemandMultiplier('crypto', 7, 4200);
    expect(marketDemandMultiplier('crypto', 7, 4200)).toBe(once);
  });

  it.each([['classic', false], ['classic', true], ['hex', false], ['hex', true]] as const)(
    'agrees between close, client estimates and resolution in %s, regional=%s, with two own products', (mapMode, regional) => {
      const { s, c } = isolated(mapMode, regional);
      const outlook = expectedOutlook(s, c);
      const wanted = demandFrom(c, outlook, s);
      const estimates = c.products.map((p) => estimateSales('crypto', marketInputs(s, c, p, 'a', 0), p));
      c.products.forEach((p, i) => expect(wanted(p, 1)).toBeCloseTo(estimates[i].demand, 10));
      const revenue = c.products.reduce((sum, p, i) => sum + estimates[i].revenue, 0);
      expect(planClose(s, c).sales.funded).toBeCloseTo(revenue, 9);
      const view = getPlayerView(s, 'a').companies.find((x) => x.id === c.id)!;
      view.products.forEach((p, i) => expect(p.private!.estimate!.demand).toBeCloseTo(estimates[i].demand, 10));
      resolveTurn(s);
      c.products.forEach((p, i) => expect(p.lastSales).toBeCloseTo(estimates[i].sales, 9));
      expect(s.sectors.crypto.lastMarketPriceMultiplier).toBeLessThan(1);
      expect(s.sectors.crypto.lastTotalDemand).toBeCloseTo(SECTORS.crypto.refDemand * s.sectors.crypto.lastMarketPriceMultiplier!, 9);
    },
  );

  it('recomputes the national response for hypothetical price and budget changes and uses known rival prices', () => {
    const { s, c, p } = isolated('classic', true);
    const base = marketInputs(s, c, p, 'a', 0);
    const expensive = estimateSales('crypto', base, { ...p, price: 3 * SECTORS.crypto.refPrice });
    const cheap = estimateSales('crypto', base, { ...p, price: SECTORS.crypto.refPrice });
    expect(expensive.demand).toBeLessThan(cheap.demand);
    const direct = structuredClone(s);
    const directC = direct.companies[c.id];
    Object.assign(directC.products[0], { price: 3 * SECTORS.crypto.refPrice, marketing: 950, rnd: 500 });
    const hypothetical = estimateSales('crypto', base, { ...p, price: 3 * SECTORS.crypto.refPrice, marketing: 950, rnd: 500 });
    expect(demandFrom(directC, expectedOutlook(direct, directC), direct)(directC.products[0], 1)).toBeCloseTo(hypothetical.demand, 10);
    const other = { ...c, id: 'rival', controllerId: 'b', products: [{ ...p, id: 'rival-product', price: 600, lastPrice: 200 }] };
    s.companies[other.id] = other;
    const known = marketInputs(s, c, p, 'a', 0);
    other.products[0].price = 250;
    expect(marketInputs(s, c, p, 'a', 0)).toEqual(known);
  });
});
