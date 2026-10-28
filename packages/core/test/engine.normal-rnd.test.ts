import { afterEach, expect, it, vi } from 'vitest';
import { SECTORS } from '../src/content';
import { createGame, getPlayerView } from '../src/engine';
import * as advice from '../src/sim/advice';
import { runBots, setBotZoneMode } from '../src/sim/bots';
import { estimatedUnitCost } from '../src/sim/finance';
import { runAction } from '../src/sim/actions';
import { awardHexes, hexReservePrice } from '../src/sim/hexAuctions';
import { resolveTurnWithLog } from '../src/sim/resolve';
import { companyOf, config, human } from './helpers';

afterEach(() => {
  setBotZoneMode('market');
  vi.restoreAllMocks();
});

function forecastScenario(mapMode: 'classic' | 'hex' = 'classic') {
  setBotZoneMode('capital');
  const state = createGame({ ...config(17, 4), mapMode }, [human('a', 'gadgets')]);
  const company = companyOf(state, 'a');
  state.companies = { [company.id]: company };
  state.players.a.isBot = true;
  state.players.a.botLevel = 'normal';
  state.players.a.cash = 0;
  company.cash = 100_000;
  company.inventory = {};
  company.reports = [];
  const product = company.products[0];
  Object.assign(product, { quality: 1, brand: 0.3, stock: 20,
    capacity: 100, pendingCapacity: 0, production: 50,
    lastProduced: 0, lastSales: 0, marketing: 0, rnd: 0 });
  state.activeEffects = [{ id: 'known-demand', newsId: 'known-demand',
    kind: 'sectorDemand', sectorId: product.sectorId, value: 1.5, turnsLeft: 2 }];
  return { state, company, product };
}

it('normal R&D values future outside competition and expires known demand news', () => {
  const { state, product } = forecastScenario();
  const expectedDemand = [0, 1, 2].map((quarter) => advice.expectedSectorDemand(state,
    product.sectorId, state.turn + quarter, 'a'));
  const expectedOthers = [0, 1, 2].map((quarter) => advice.outsideAttractiveness(product.sectorId,
    state.turn + quarter));
  const before = JSON.stringify(state.activeEffects);
  const estimates = vi.spyOn(advice, 'estimateSales'); // Observe the real engine calculation.
  runBots(state);
  const firstCandidate = estimates.mock.calls.slice(0, 3);
  expect(firstCandidate).toHaveLength(3);
  expect(firstCandidate.map(([, market]) => market.demand)).toEqual(expectedDemand);
  expect(firstCandidate.map(([, market]) => market.othersAttractiveness)).toEqual(expectedOthers);
  expect(expectedOthers[2]).toBeGreaterThan(expectedOthers[0]);
  expect(expectedDemand[2]).toBeLessThan(expectedDemand[1]);
  expect(JSON.stringify(state.activeEffects)).toBe(before);
});

it('normal R&D carries only unsold, unexpired stock into the next forecast quarter', () => {
  const { state, product } = forecastScenario();
  const initialStock = product.stock;
  const estimates = vi.spyOn(advice, 'estimateSales');
  runBots(state);
  const calls = estimates.mock.calls.slice(0, 3);
  expect(calls[0][2].stock).toBe(initialStock);
  for (let quarter = 1; quarter < calls.length; quarter++) {
    const [, market, decisions] = calls[quarter - 1];
    const estimate = estimates.mock.results[quarter - 1].value as ReturnType<typeof advice.estimateSales>;
    const produced = Math.floor(Math.min(decisions.production, decisions.capacity));
    const surviving = Math.max(0, decisions.stock + produced - estimate.sales)
      * (1 - SECTORS[product.sectorId].perishability * (market.perishabilityMultiplier ?? 1));
    expect(calls[quarter][2].stock).toBeCloseTo(surviving, 10);
  }
  // This is a real surplus/depletion witness, so recycling the initial stock
  // on every iteration cannot accidentally satisfy the recurrence above.
  expect(calls[1][2].stock).not.toBe(initialStock);
});

it.each(['classic', 'hex'] as const)('normal budget forecasts expire known labor costs in %s', (mapMode) => {
  const { state, company, product } = forecastScenario(mapMode);
  state.activeEffects = [{ id: 'known-wage-discount', newsId: 'known-wage-discount',
    kind: 'laborCost', sectorId: product.sectorId, value: 0.5, turnsLeft: 1 }];
  const currentUnit = estimatedUnitCost(state, company, product);
  const future = structuredClone(state);
  future.turn++;
  future.activeEffects = [];
  const ordinaryUnit = estimatedUnitCost(future, future.companies[company.id], future.companies[company.id].products[0]);
  expect(ordinaryUnit).toBeGreaterThan(currentUnit);
  const effects = JSON.stringify(state.activeEffects);
  const estimates = vi.spyOn(advice, 'estimateSales');
  runBots(state);
  expect(estimates.mock.calls.slice(0, 3).map(([, market]) => market.unitCost))
    .toEqual([currentUnit, ordinaryUnit, ordinaryUnit]);
  expect(JSON.stringify(state.activeEffects)).toBe(effects);
});

it.each(['classic', 'hex'] as const)('normal physical budgets expire their own greenwashing in %s', (mapMode) => {
  const { state, company } = forecastScenario(mapMode);
  state.activeEffects = [];
  expect(runAction(state, 'a', { type: 'shady', companyId: company.id, kind: 'greenwashing' }).ok).toBe(true);
  expect(company.modifiers.find((m) => m.kind === 'greenwashing')!.turnsLeft).toBe(1);
  const modifiers = JSON.stringify(company.modifiers);
  const estimates = vi.spyOn(advice, 'estimateSales');
  runBots(state);
  const bonuses = estimates.mock.calls.slice(0, 3).map(([, market]) => market.bonus);
  expect(bonuses).toHaveLength(3);
  expect(bonuses[0]).toBeGreaterThan(1);
  expect(bonuses.slice(1)).toEqual([1, 1]);
  expect(JSON.stringify(company.modifiers)).toBe(modifiers);
});

it.each(['classic', 'hex'] as const)('normal physical budgets expire paid offshoring after real closes in %s', (mapMode) => {
  const { state, company, product } = forecastScenario(mapMode);
  state.config.totalTurns = 6;
  state.players.a.isBot = false;
  expect(runAction(state, 'a', { type: 'shady', companyId: company.id, kind: 'offshoring' }).ok).toBe(true);
  resolveTurnWithLog(state);
  resolveTurnWithLog(state);
  expect(company.modifiers.find((m) => m.kind === 'offshoring')!.turnsLeft).toBe(1);
  // Isolate this known expiry from intervening headlines and input purchases.
  state.activeEffects = [];
  company.cash = 100_000;
  company.inventory = {};
  company.reports = [];
  state.players.a.isBot = true;
  Object.assign(product, { stock: 20, production: 50, lastProduced: 0, lastSales: 0 });
  const currentUnit = estimatedUnitCost(state, company, product);
  const future = structuredClone(state);
  future.turn++;
  const futureCompany = future.companies[company.id];
  futureCompany.modifiers = futureCompany.modifiers.filter((m) => m.kind !== 'offshoring');
  const ordinaryUnit = estimatedUnitCost(future, futureCompany, futureCompany.products[0]);
  expect(ordinaryUnit).toBeGreaterThan(currentUnit);
  const modifiers = JSON.stringify(company.modifiers);
  const estimates = vi.spyOn(advice, 'estimateSales');
  runBots(state);
  expect(estimates.mock.calls.slice(0, 3).map(([, market]) => market.unitCost))
    .toEqual([currentUnit, ordinaryUnit, ordinaryUnit]);
  expect(JSON.stringify(company.modifiers)).toBe(modifiers);
});

it.each(['classic', 'hex'] as const)('normal physical budget forecasts cannot use hidden rival modifiers in %s', (mapMode) => {
  setBotZoneMode('capital');
  const state = createGame({ ...config(17, 4), mapMode }, [human('a', 'gadgets'), human('b', 'gadgets')]);
  const company = companyOf(state, 'a'), rival = companyOf(state, 'b');
  state.companies = { [company.id]: company, [rival.id]: rival };
  state.activeEffects = [];
  state.players.a.isBot = true;
  state.players.a.botLevel = 'normal';
  state.players.a.cash = 0;
  company.cash = rival.cash = 100_000;
  company.inventory = {};
  company.reports = [];
  Object.assign(company.products[0], { stock: 20, capacity: 100, pendingCapacity: 0,
    production: 50, lastProduced: 0, lastSales: 0, marketing: 0, rnd: 0 });
  expect(runAction(state, 'b', { type: 'shady', companyId: rival.id, kind: 'greenwashing' }).ok).toBe(true);
  expect(runAction(state, 'b', { type: 'shady', companyId: rival.id, kind: 'offshoring' }).ok).toBe(true);
  const withoutPrivateModifiers = structuredClone(state);
  withoutPrivateModifiers.companies[rival.id].modifiers = [];
  const hidden = JSON.stringify(rival.modifiers);
  const estimates = vi.spyOn(advice, 'estimateSales');
  runBots(state);
  const withHidden = estimates.mock.calls.slice(0, 3).map(([, market]) => structuredClone(market));
  estimates.mockClear();
  runBots(withoutPrivateModifiers);
  expect(estimates.mock.calls.slice(0, 3).map(([, market]) => market)).toEqual(withHidden);
  const decisions = (s: typeof state) => {
    const p = s.companies[company.id].products[0];
    return { price: p.price, production: p.production, marketing: p.marketing, rnd: p.rnd };
  };
  expect(decisions(state)).toEqual(decisions(withoutPrivateModifiers));
  expect(JSON.stringify(rival.modifiers)).toBe(hidden);
  expect(state.rngState).toEqual(withoutPrivateModifiers.rngState);
});

it('normal budget forecasts use the destination cost only after an actual paid hex move', () => {
  const { state, company, product } = forecastScenario('hex');
  const target = getPlayerView(state, 'a').hexes!.free[0];
  state.players.a.isBot = false;
  expect(runAction(state, 'a', { type: 'moveFactory', companyId: company.id, productId: product.id,
    hexId: target, bid: hexReservePrice(target) }).ok).toBe(true);
  // Use the real paid adjudication phase, before the close applies its move.
  expect(awardHexes(state)).toHaveLength(1);
  expect(product.pendingHexId).toBe(target);
  expect(product.landCost).toBe(hexReservePrice(target));
  state.players.a.isBot = true;
  state.activeEffects = [];
  company.inventory = {};
  Object.assign(product, { production: 50, lastProduced: 0, lastSales: 0 });
  const currentUnit = estimatedUnitCost(state, company, product);
  const future = structuredClone(state);
  future.turn++;
  const futureCompany = future.companies[company.id], futureProduct = futureCompany.products[0];
  futureProduct.hexId = target;
  delete futureProduct.pendingHexId;
  delete futureProduct.terrainId;
  delete futureCompany.terrainId;
  const destinationUnit = estimatedUnitCost(future, futureCompany, futureProduct);
  expect(destinationUnit).not.toBe(currentUnit);
  const estimates = vi.spyOn(advice, 'estimateSales');
  runBots(state);
  expect(estimates.mock.calls.slice(0, 3).map(([, market]) => market.unitCost))
    .toEqual([currentUnit, destinationUnit, destinationUnit]);
});
