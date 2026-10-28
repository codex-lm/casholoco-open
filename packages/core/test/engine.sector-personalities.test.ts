import { afterEach, describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { createGame, getPlayerView, resolveTurn } from '../src/engine';
import { brandAfter, estimateLaunchIn, estimateLaunchInHex, estimateSales, expectedSectorDemand, hexValues, LOCATION_PRICE_RATIOS, outsideAttractiveness, outsideQuality, productAttractiveness, qualityAfter, sectorNewsMultiplier, zoneValues } from '../src/sim/advice';
import { demandFrom, expectedOutlook, planClose, plannedAttractiveness } from '../src/sim/close';
import { capitalHexId } from '../src/sim/hexes';
import { terrainValues } from '../src/sim/terrainAssignment';
import { SECTOR_IDS, type SectorDef, type SectorId } from '../src/types';
import { companyOf, config, human } from './helpers';

const originals = Object.fromEntries(SECTOR_IDS.map((sid) => [sid, { ...SECTORS[sid] }])) as Record<SectorId, SectorDef>;
afterEach(() => {
  for (const sid of SECTOR_IDS) {
    for (const key of Object.keys(SECTORS[sid]) as (keyof SectorDef)[]) if (!(key in originals[sid])) delete SECTORS[sid][key];
    Object.assign(SECTORS[sid], originals[sid]);
  }
});

function isolated(sid: SectorId, mapMode: 'classic' | 'hex') {
  const s = createGame({ ...config(91, 4), mapMode, terrainAssignment: 'host', terrains: { a: 'quai-port-dividende' } }, [human('a', sid)]);
  const c = companyOf(s, 'a');
  s.companies = { [c.id]: c };
  s.activeEffects = [];
  c.cash = 1e9;
  c.modifiers = [];
  c.reputation = 1;
  delete c.terrainId;
  const p = c.products[0];
  delete p.terrainId;
  Object.assign(p, { quality: 2, brand: 2, price: 1.8 * SECTORS[sid].refPrice,
    marketing: 0.03 * SECTORS[sid].refDemand * SECTORS[sid].refPrice,
    rnd: 0.02 * SECTORS[sid].refDemand * SECTORS[sid].refPrice,
    stock: 10_000, production: 0, capacity: 1000, pendingCapacity: 0,
    zoneId: 'capital', hexId: capitalHexId });
  s.sectors[sid].demandMultiplier = 1;
  SECTORS[sid].volatility = 0;
  return { s, c, p };
}

describe('per-sector brand and quality formulas', () => {
  it.each(SECTOR_IDS)('keeps the original defaults when optional traits are absent: %s', (sid) => {
    const def = SECTORS[sid];
    delete def.brandPersistence;
    delete def.brandBase;
    delete def.marketingMultiplier;
    delete def.rndMultiplier;
    delete def.qualityDecay;
    const size = def.refPrice * def.refDemand;
    for (const budget of [0, 250, -100]) {
      const effective = Math.max(0, budget) * 1.3;
      expect(brandAfter(sid, 0.8, budget, 1.3)).toBe(0.75 * 0.8 + 0.25 * (0.3 + Math.log(1 + effective / (0.02 * size))));
      expect(qualityAfter(sid, 1.7, budget, 1.3)).toBe(1.7 * 0.99 + 0.5 * Math.log(1 + effective / (0.05 * size)) / 1.7);
    }
  });

  it('composes sector sensitivity and local budget multipliers before logarithms', () => {
    Object.assign(SECTORS.gadgets, { brandPersistence: 0.6, marketingMultiplier: 1.5, rndMultiplier: 1.8, qualityDecay: 0.92 });
    const size = SECTORS.gadgets.refPrice * SECTORS.gadgets.refDemand;
    expect(brandAfter('gadgets', 2, 200, 1.4)).toBeCloseTo(0.6 * 2 + 0.4 * (0.3 + Math.log(1 + 200 * 1.4 * 1.5 / (0.02 * size))), 12);
    expect(qualityAfter('gadgets', 2, 200, 1.4)).toBeCloseTo(2 * 0.92 + 0.5 * Math.log(1 + 200 * 1.4 * 1.8 / (0.05 * size)) / 2, 12);
  });

  it('retains loyal customers, forgets fashion, and ages fast-changing technology', () => {
    Object.assign(SECTORS.yogurts, { brandPersistence: 0.9 });
    Object.assign(SECTORS.energy_drinks, { brandPersistence: 0.6 });
    Object.assign(SECTORS.gadgets, { qualityDecay: 0.94, rndMultiplier: 1.5 });
    expect(brandAfter('yogurts', 2, 0)).toBeGreaterThan(brandAfter('energy_drinks', 2, 0));
    expect(qualityAfter('gadgets', 2, 0)).toBe(1.88);
    const size = SECTORS.gadgets.refPrice * SECTORS.gadgets.refDemand;
    const stronger = qualityAfter('gadgets', 2, size * 0.05);
    SECTORS.gadgets.rndMultiplier = 1;
    expect(stronger).toBeGreaterThan(qualityAfter('gadgets', 2, size * 0.05));
  });

  it('retains a loyal base without granting the founder customer base to a fresh entrant', () => {
    Object.assign(SECTORS.yogurts, { brandPersistence: 0.85, brandBase: 0.6 });
    let founder = 0.9, entrant = 0.3;
    for (let quarter = 0; quarter < 16; quarter++) {
      const nextFounder = brandAfter('yogurts', founder, 0);
      const nextEntrant = brandAfter('yogurts', entrant, 0);
      expect(nextFounder).toBeLessThan(founder);
      expect(nextFounder).toBeGreaterThan(0.6);
      expect(nextEntrant).toBeGreaterThan(entrant);
      expect(nextEntrant).toBeLessThan(0.6);
      founder = nextFounder;
      entrant = nextEntrant;
    }
    expect(founder).toBeGreaterThan(0.62);
    expect(entrant).toBeGreaterThan(0.57);
    expect(founder).toBeGreaterThan(entrant);
  });
});

describe('sector parameters reach market consumers', () => {
  it('lets location and terrain evaluations search both ends of the legal price domain', () => {
    expect(LOCATION_PRICE_RATIOS[0]).toBe(0.3);
    expect(LOCATION_PRICE_RATIOS.at(-1)).toBe(3);
    expect(LOCATION_PRICE_RATIOS).toContain(1);
  });

  for (const mapMode of ['classic', 'hex'] as const) {
    it.each(SECTOR_IDS)(`uses each sector in close planning, client estimates and resolution (${mapMode}): %s`, (sid) => {
      const { s, c, p } = isolated(sid, mapMode);
      Object.assign(SECTORS[sid], { elasticity: 2.3, marketElasticity: 0.7,
        brandPersistence: 0.86, brandBase: 0.6, marketingMultiplier: 1.6, rndMultiplier: 1.4, qualityDecay: 0.95, qualityExponent: 1.3 });
      const size = SECTORS[sid].refPrice * SECTORS[sid].refDemand;
      const updatedBrand = (fraction: number) => 0.86 * 2 + 0.14 * (0.6 + Math.log(1 + p.marketing * fraction * 1.6 / (0.02 * size)));
      const updatedQuality = (fraction: number) => 0.95 * 2 + 0.5 * Math.log(1 + p.rnd * fraction * 1.4 / (0.05 * size)) / 2;
      const att = (fraction: number) => updatedQuality(fraction) ** 1.3 * (0.5 + updatedBrand(fraction)) * 1.8 ** -2.3;
      for (const fraction of [0, 0.4, 1]) expect(plannedAttractiveness(c, p, fraction, s)).toBeCloseTo(att(fraction), 11);
      const outside = SECTORS[sid].outsideAttractiveness;
      const total = outside + att(1);
      const averagePrice = (outside * SECTORS[sid].refPrice + att(1) * p.price) / total;
      const expectedDemand = SECTORS[sid].refDemand * (SECTORS[sid].refPrice / averagePrice) ** 0.7 * att(1) / total;
      const planned = demandFrom(c, expectedOutlook(s, c), s)(p, 1);
      expect(planned).toBeCloseTo(expectedDemand, 10);
      expect(planClose(s, c).sales.funded).toBeCloseTo(expectedDemand * p.price, 8);
      const visible = getPlayerView(s, 'a').companies.find((x) => x.id === c.id)!.products[0];
      expect(visible.private!.estimate!.demand).toBeCloseTo(expectedDemand, 10);
      expect(estimateSales(sid, visible.private!.market!, p).demand).toBeCloseTo(expectedDemand, 10);
      const copy = structuredClone(s);
      resolveTurn(s);
      resolveTurn(copy);
      expect(s).toEqual(copy);
      expect(p.brand).toBeCloseTo(updatedBrand(1), 12);
      expect(p.quality).toBeCloseTo(updatedQuality(1), 12);
      expect(p.lastSales).toBeCloseTo(expectedDemand, 10);
    });
  }

  it.each(SECTOR_IDS)('uses the sector elasticity in public attractiveness: %s', (sid) => {
    const ref = SECTORS[sid].refPrice;
    for (const elasticity of [1.5, 2, 3.5, 4.5, 6.5]) {
      SECTORS[sid].elasticity = elasticity;
      expect(productAttractiveness(sid, 2, 1, 1, 2 * ref) / productAttractiveness(sid, 2, 1, 1, ref)).toBeCloseTo(2 ** -elasticity, 12);
    }
  });

  it.each(['classic', 'hex'] as const)('reads elasticity during location price searches and launch estimates (%s)', (mapMode) => {
    const { s, c, p } = isolated('gadgets', mapMode);
    SECTORS.gadgets.marketElasticity = 0.8;
    const read = () => ({
      positions: mapMode === 'hex' ? hexValues(s, c, p, 'a', [capitalHexId]).value : zoneValues(s, c, p, 'a').value,
      launch: Object.values(mapMode === 'hex' ? estimateLaunchInHex(s, 'gadgets', 'a', [capitalHexId]) : estimateLaunchIn(s, 'gadgets', 'a', ['capital']))[0]!,
    });
    SECTORS.gadgets.elasticity = 2;
    const gentle = read();
    SECTORS.gadgets.elasticity = 6.5;
    const sensitive = read();
    expect(sensitive.positions).not.toEqual(gentle.positions);
    // The incumbent is expensive: a sensitive sector leaves more buyers for the reference-priced launch.
    expect(sensitive.launch.demand).toBeGreaterThan(gentle.launch.demand);
    const before = read().launch;
    SECTORS.gadgets.qualityDecay = 0.8;
    SECTORS.gadgets.rndMultiplier = 2;
    SECTORS.gadgets.brandPersistence = 0.5;
    expect(read().launch).not.toEqual(before);
  });

  it.each(['elasticity', 'brandPersistence', 'rndMultiplier', 'qualityDecay', 'qualityExponent', 'outsideQualityGrowth'] as const)('projects %s in terrain values without consuming RNG or mutating input', (trait) => {
    const { s, c, p } = isolated('gadgets', 'hex');
    Object.assign(p, { production: 1000, stock: 0 });
    const beforeState = structuredClone(s);
    const baseline = terrainValues(s, c, p, false);
    SECTORS.gadgets[trait] = { elasticity: 2, brandPersistence: 0.95, rndMultiplier: 3, qualityDecay: 0.7, qualityExponent: 1.3, outsideQualityGrowth: 0.01 }[trait];
    const modified = terrainValues(s, c, p, false);
    expect(modified).not.toEqual(baseline);
    expect(terrainValues(s, c, p, false)).toEqual(modified);
    expect(s).toEqual(beforeState);
  });

  it('keeps historical outside progress and quality weighting when optional fields are absent', () => {
    delete SECTORS.gadgets.qualityExponent;
    delete SECTORS.gadgets.outsideQualityGrowth;
    expect(outsideQuality('gadgets', 5)).toBe(1.16);
    expect(outsideAttractiveness('gadgets', 5)).toBeCloseTo(1.5 * 1.16 ** 1.3, 12);
    expect(productAttractiveness('gadgets', 2, 0.5, 1, SECTORS.gadgets.refPrice)).toBeCloseTo(2 ** 1.3, 12);
  });

  it.each(['classic', 'hex'] as const)('uses quality weighting and outside progress in advice, close and resolution (%s)', (mapMode) => {
    const { s, c, p } = isolated('gadgets', mapMode);
    s.turn = 5;
    Object.assign(SECTORS.gadgets, { qualityExponent: 3, outsideQualityGrowth: 0.08, growth: 0 });
    const a = productAttractiveness('gadgets', qualityAfter('gadgets', p.quality, p.rnd), brandAfter('gadgets', p.brand, p.marketing), 1, p.price);
    const outside = outsideAttractiveness('gadgets', 5);
    const average = (outside * SECTORS.gadgets.refPrice + a * p.price) / (outside + a);
    const sales = SECTORS.gadgets.refDemand * (SECTORS.gadgets.refPrice / average) ** SECTORS.gadgets.marketElasticity! * a / (outside + a);
    expect(demandFrom(c, expectedOutlook(s, c), s)(p, 1)).toBeCloseTo(sales, 10);
    expect(getPlayerView(s, 'a').companies.find((x) => x.id === c.id)!.products[0].private!.estimate!.demand).toBeCloseTo(sales, 10);
    resolveTurn(s);
    expect(s.sectors.gadgets.outsideQuality).toBe(1.32);
    expect(p.lastSales).toBeCloseTo(sales, 10);
  });

  it('makes four quarters without gadget R&D lose ground that a small price cut cannot recover', () => {
    const sid = 'gadgets';
    let quality = 1;
    for (let i = 0; i < 4; i++) quality = qualityAfter(sid, quality, 0);
    const relative = productAttractiveness(sid, quality, 0.3, 1, 0.97 * SECTORS[sid].refPrice) / outsideAttractiveness(sid, 5)
      / (productAttractiveness(sid, 1, 0.3, 1, SECTORS[sid].refPrice) / outsideAttractiveness(sid, 1));
    expect(relative).toBeLessThan(0.4);
    expect(SECTORS.gadgets.launchCost).toBeLessThanOrEqual(3000);
  });

  it.each(['classic', 'hex'] as const)('dampens scooter demand news equally in forecasts and resolution (%s)', (mapMode) => {
    const { s, c, p } = isolated('scooters', mapMode);
    s.activeEffects.push({ id: 'steady-demand', newsId: 'test', kind: 'sectorDemand', sectorId: 'scooters', value: 0.6, turnsLeft: 2 });
    expect(sectorNewsMultiplier('scooters', 0.6)).toBeGreaterThan(0.85);
    expect(expectedSectorDemand(s, 'scooters')).toBeCloseTo(SECTORS.scooters.refDemand * 0.6 ** SECTORS.scooters.newsSensitivity!, 12);
    const projected = demandFrom(c, expectedOutlook(s, c), s)(p, 1);
    resolveTurn(s);
    expect(p.lastSales).toBeCloseTo(projected, 10);
  });
});
