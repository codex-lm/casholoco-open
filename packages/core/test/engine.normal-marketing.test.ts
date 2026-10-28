import { afterEach, expect, it, vi } from 'vitest';
import { SECTORS } from '../src/content';
import { createGame } from '../src/engine';
import * as advice from '../src/sim/advice';
import { runBots, setBotZoneMode } from '../src/sim/bots';
import { resolveTurnWithLog } from '../src/sim/resolve';
import { companyOf, config, human } from './helpers';

afterEach(() => {
  setBotZoneMode('market');
  vi.restoreAllMocks();
});

it.each(['classic', 'hex'] as const)('normal ads stop at their real marginal return on a sold-out %s plant', (mapMode) => {
  setBotZoneMode('capital');
  const state = createGame({ ...config(17, 4), mapMode }, [{
    ...human('a', 'energy_drinks'), botPersonalityId: 'viralier',
  }]);
  const company = companyOf(state, 'a');
  for (const rival of Object.values(state.companies)) if (rival.id !== company.id) rival.status = 'bankrupt';
  state.activeEffects = [];
  company.cash = 100_000;
  company.reports = [];
  company.inventory = {};
  state.players.a.isBot = true;
  state.players.a.botLevel = 'normal';
  state.players.a.cash = 0;
  const product = company.products[0];
  Object.assign(product, { quality: 20, brand: 10, stock: 0, capacity: 10, production: 10,
    pendingCapacity: 0, lastProduced: 0, lastSales: 0, price: SECTORS.energy_drinks.refPrice * 1.5 });
  const estimates = vi.spyOn(advice, 'estimateSales'); // Observe real public engine estimates.
  runBots(state);
  const forecasts = estimates.mock.calls.slice(0, 45);
  const fullAds = Math.max(...forecasts.map(([, , d]) => d.marketing));
  expect(fullAds).toBeGreaterThan(0); // The old forced personality target really spends.
  expect(forecasts.every(([, , d], i) => (estimates.mock.results[i].value as ReturnType<typeof advice.estimateSales>).sales === d.production)).toBe(true);
  expect(product.marketing).toBe(0);
  expect(product.rnd).toBe(0);
  const withoutAds = structuredClone(state);
  const withAds = structuredClone(state);
  withAds.companies[company.id].products[0].marketing = fullAds;
  // Same seed, installed capacity, price, production and R&D. Three real closes
  // must preserve all shipments while eliminating the pointless recurring ads.
  for (let quarter = 0; quarter < 3; quarter++) {
    withoutAds.players.a.isBot = false;
    withAds.players.a.isBot = false;
    // Hold public input/news shocks common. Different revenues can otherwise
    // change the next issue's eligible cards and create a second intervention.
    withAds.activeEffects = structuredClone(withoutAds.activeEffects);
    withAds.commodities = structuredClone(withoutAds.commodities);
    resolveTurnWithLog(withoutAds);
    resolveTurnWithLog(withAds);
    const saved = withoutAds.companies[company.id].reports.at(-1)!;
    const forced = withAds.companies[company.id].reports.at(-1)!;
    expect(saved.products[0].sold).toBe(forced.products[0].sold);
    expect(saved.marketing).toBe(0);
    expect(forced.marketing).toBe(fullAds);
    const contribution = (report: typeof saved) => report.products[0].revenue
      - report.products[0].produced * report.products[0].unitCost - report.marketing - report.rnd;
    expect(contribution(saved) - contribution(forced)).toBeCloseTo(fullAds, 8);
  }
});

it('normal budget forecasts charge spoiled stock and value only the surviving final inventory', () => {
  setBotZoneMode('capital');
  const state = createGame(config(17, 4), [human('a', 'energy_drinks')]);
  const company = companyOf(state, 'a');
  for (const rival of Object.values(state.companies)) if (rival.id !== company.id) rival.status = 'bankrupt';
  state.activeEffects = [];
  company.cash = 100_000;
  company.reports = [];
  company.inventory = {};
  state.players.a.isBot = true;
  state.players.a.botLevel = 'normal';
  state.players.a.cash = 0;
  const product = company.products[0];
  // Fashion-sensitive ads still have a visible marginal return in this weak,
  // overstocked line; loyal yogurts can correctly choose zero ads under both
  // objectives and no longer distinguish the inventory-accounting regression.
  Object.assign(product, { quality: 0.1, brand: 0.3, stock: 100, capacity: 20, production: 20,
    pendingCapacity: 0, lastProduced: 0, lastSales: 0, price: SECTORS.energy_drinks.refPrice * 1.5 });
  const initial = { stock: product.stock, stockCost: product.lastUnitCost };
  const estimates = vi.spyOn(advice, 'estimateSales');
  runBots(state);
  // Five ad levels, three legal nearby prices, three quarters each. Reconstruct
  // real contribution from the engine's observed sales, paid batches and spoilage.
  const candidates = Array.from({ length: 15 }, (_, candidate) => {
    let stockCost = initial.stockCost, contribution = 0, oldObjective = 0;
    for (let quarter = 0; quarter < 3; quarter++) {
      const i = candidate * 3 + quarter;
      const [, market, decisions] = estimates.mock.calls[i];
      const result = estimates.mock.results[i].value as ReturnType<typeof advice.estimateSales>;
      const produced = Math.floor(Math.min(decisions.production, decisions.capacity));
      const remaining = Math.max(0, decisions.stock + produced - result.sales)
        * (1 - SECTORS.yogurts.perishability * (market.perishabilityMultiplier ?? 1));
      const stockBefore = decisions.stock * stockCost;
      if (produced > 0) stockCost = market.unitCost;
      contribution += result.revenue - produced * market.unitCost - stockBefore + remaining * stockCost - decisions.marketing - decisions.rnd;
      oldObjective += result.revenue - result.sales * market.unitCost - decisions.marketing - decisions.rnd;
    }
    return { ads: estimates.mock.calls[candidate * 3][2].marketing, contribution, oldObjective };
  });
  const best = candidates.reduce((a, b) => b.contribution > a.contribution ? b : a);
  expect(product.marketing).toBe(best.ads);
  expect(best.ads).not.toBe(candidates.reduce((a, b) => b.oldObjective > a.oldObjective ? b : a).ads);
  expect(candidates.some((c) => Math.abs(c.contribution - c.oldObjective) > 1)).toBe(true);
  const first = estimates.mock.calls[0][2];
  const second = estimates.mock.calls[1][2];
  expect(first.stock).toBe(initial.stock);
  expect(second.stock).toBeLessThan(first.stock + first.production);
});
