import { afterEach, describe, expect, it, vi } from 'vitest';
import * as actions from '../src/sim/actions';
import * as advice from '../src/sim/advice';
import { createGame } from '../src/engine';
import { runBots, setBotZoneMode } from '../src/sim/bots';
import { PRICE_MAX_RATIO, PRICE_MIN_RATIO } from '../src/sim/constants';
import { estimatedUnitCost } from '../src/sim/finance';
import { resolveTurnWithLog } from '../src/sim/resolve';
import { COMMODITIES, SECTORS } from '../src/content';
import { type QuarterReport, type SectorId } from '../src/types';
import { companyOf, config, human } from './helpers';

afterEach(() => {
  setBotZoneMode('market');
  vi.restoreAllMocks();
});

function scenario(sectorId: SectorId, autopilot = false, hex = false) {
  setBotZoneMode('capital');
  const state = createGame({ ...config(17, 4), ...(hex ? { mapMode: 'hex' as const } : {}) }, [human('p', sectorId)]);
  state.companies = Object.fromEntries(Object.entries(state.companies).filter(([, c]) => c.founderId === 'p'));
  state.activeEffects = [];
  state.players.p.cash = 0;
  state.players.p.isBot = !autopilot;
  state.players.p.botLevel = 'normal';
  const company = companyOf(state, 'p');
  company.controllerId = autopilot ? null : 'p';
  company.cash = 100_000;
  company.inventory = {};
  company.reputation = 1;
  company.reports = [];
  const product = company.products[0];
  Object.assign(product, { capacity: 100, pendingCapacity: 0, production: 100,
    lastProduced: 100, lastSales: 20, stock: 35, price: SECTORS[sectorId].refPrice,
    lastUnitCost: 0, marketing: 0, rnd: 0, zoneId: 'capital' });
  return { state, company, product };
}

describe('cost-aware normal bot and autopilot pricing', () => {
  for (const autopilot of [false, true]) {
    for (const hex of [false, true]) {
      it.each(['energy_drinks', 'gadgets', 'scooters', 'crypto', 'yogurts'] as const)(`protects new production margin while absorbing unsold %s (${autopilot ? 'autopilot' : 'normal'}, ${hex ? 'hex' : 'classic'})`, (sector) => {
        const { state, company, product } = scenario(sector, autopilot, hex);
        product.stock = 10;
        const cost = estimatedUnitCost(state, company, product);
        product.price = cost * 0.9;
        runBots(state);
        expect(product.price).toBeGreaterThanOrEqual(estimatedUnitCost(state, company, product) * 1.05);
        expect(product.production).toBeGreaterThan(0);
        expect(product.production).toBeLessThan(product.lastProduced);
      });
    }
  }

  it('autopilot retains the sensible opening price instead of resetting to reference', () => {
    const { state, product } = scenario('crypto', true);
    Object.assign(product, { price: 2 * SECTORS.crypto.refPrice, production: 80,
      lastProduced: 0, lastSales: 0, stock: 0 });
    runBots(state);
    expect(product.price).toBe(2 * SECTORS.crypto.refPrice);
    expect(product.production).toBe(80);
  });

  it('changes the oversupply response smoothly across elasticity two', () => {
    const saved = SECTORS.crypto.elasticity;
    try {
      const decisions = [1.99, 2, 2.01].map((elasticity) => {
        SECTORS.crypto.elasticity = elasticity;
        const { state, product } = scenario('crypto');
        Object.assign(product, { price: 250, stock: 10 });
        runBots(state);
        return { price: product.price, production: product.production };
      });
      expect(Math.max(...decisions.map((d) => d.price)) - Math.min(...decisions.map((d) => d.price))).toBeLessThan(1);
      expect(Math.max(...decisions.map((d) => d.production)) - Math.min(...decisions.map((d) => d.production))).toBeLessThanOrEqual(1);
    } finally { SECTORS.crypto.elasticity = saved; }
  });

  it('learns a weak discount response in a normally price-sensitive sector', () => {
    const { state, company, product } = scenario('gadgets');
    product.stock = 10;
    company.reports = [400, 380].map((price, i) => ({ turn: i + 1, revenue: price * 20,
      cogs: 200 * 20, marketing: 0, rnd: 0, fixedCosts: 400, interest: 0, fines: 0,
      tax: 0, netProfit: -1, cashEnd: company.cash, debtEnd: 0,
      products: [{ productId: product.id, name: product.name, sectorId: product.sectorId,
        produced: 100, sold: 20, revenue: price * 20, marketShare: 0.1, unitCost: 200 }],
    } as QuarterReport));
    runBots(state);
    // A discount without any extra sales reduces the next batch's buffer too.
    expect(product.production).toBe(12); // 20 × 1.05 + 1 − 10
    expect(product.price).toBeGreaterThanOrEqual(estimatedUnitCost(state, company, product) * 1.05);
  });

  it.each([false, true])('liquidates perishable stock below sunk cost while keeping production stopped (autopilot=%s)', (autopilot) => {
    const { state, company, product } = scenario('crypto', autopilot);
    Object.assign(product, { stock: 1000, lastUnitCost: 2000, price: 400 });
    runBots(state);
    expect(product.production).toBe(0);
    expect(product.price).toBeLessThan(estimatedUnitCost(state, company, product));
    expect(product.price).toBeGreaterThanOrEqual(PRICE_MIN_RATIO * SECTORS.crypto.refPrice);
    const expensive = structuredClone(state);
    expensive.companies[company.id].products[0].price = 400;
    resolveTurnWithLog(state); resolveTurnWithLog(expensive);
    expect(product.lastProduced).toBe(0);
    expect(product.lastSales).toBeGreaterThan(expensive.companies[company.id].products[0].lastSales);
    expect(product.stock).toBeLessThan(expensive.companies[company.id].products[0].stock);
  });

  it('costs the increased next batch rather than the old smaller production plan', () => {
    const { state, company, product } = scenario('crypto', true);
    Object.assign(product, { lastProduced: 100, lastSales: 100, stock: 0, production: 1 });
    company.inventory = { chips: { lots: 1, avgCost: 1 }, oil: { lots: 0.6, avgCost: 1 } };
    state.commodities.chips.price = 150;
    product.price = 150;
    const oldCost = estimatedUnitCost(state, company, product);
    runBots(state);
    const nextCost = estimatedUnitCost(state, company, product);
    expect(nextCost).toBeGreaterThan(oldCost * 2);
    expect(product.production).toBe(100);
    expect(product.price).toBeGreaterThanOrEqual(nextCost * 1.05);
  });

  it('halts new production if a commodity shock puts cost above the legal cap', () => {
    const { state, product } = scenario('crypto', true);
    Object.assign(product, { stock: 0, lastSales: 100 });
    state.commodities.chips.price = 1000;
    runBots(state);
    expect(product.production).toBe(0);
    expect(product.price).toBe(PRICE_MAX_RATIO * SECTORS.crypto.refPrice);
  });

  it.each(['classic', 'hex'] as const)('releases the cancelled batch cost floor and recovers more from existing %s stock', (mapMode) => {
    const { state, company, product } = scenario('crypto', true, mapMode === 'hex');
    Object.assign(product, { stock: 80, lastSales: 100 });
    state.commodities.chips.price = 1000;
    runBots(state);
    const cap = PRICE_MAX_RATIO * SECTORS.crypto.refPrice;
    expect(product.production).toBe(0);
    expect(product.price).toBeLessThan(cap);
    expect(product.price).toBeGreaterThanOrEqual(PRICE_MIN_RATIO * SECTORS.crypto.refPrice);
    const chosen = structuredClone(state), staleFloor = structuredClone(state);
    staleFloor.companies[company.id].products[0].price = cap;
    // Human ownership holds the two chosen liquidation decisions fixed. The
    // stock is already paid; compare real cash receipts under common shocks.
    chosen.companies[company.id].controllerId = 'p';
    staleFloor.companies[company.id].controllerId = 'p';
    for (let quarter = 0; quarter < 3; quarter++) {
      staleFloor.activeEffects = structuredClone(chosen.activeEffects);
      staleFloor.commodities = structuredClone(chosen.commodities);
      resolveTurnWithLog(chosen); resolveTurnWithLog(staleFloor);
    }
    const saved = chosen.companies[company.id], old = staleFloor.companies[company.id];
    expect(saved.reports.every((r) => r.products[0].produced === 0)).toBe(true);
    expect(saved.reports.reduce((sum, r) => sum + r.products[0].revenue, 0))
      .toBeGreaterThan(old.reports.reduce((sum, r) => sum + r.products[0].revenue, 0));
    expect(saved.products[0].stock).toBeLessThan(old.products[0].stock);
  });

  it.each(['classic', 'hex'] as const)('expires an actual one-quarter greenwashing bonus in %s liquidation forecasts', (mapMode) => {
    const { state, company, product } = scenario('crypto', true, mapMode === 'hex');
    product.stock = 1000;
    expect(actions.runAction(state, null, { type: 'shady', companyId: company.id, kind: 'greenwashing' }).ok).toBe(true);
    const estimates = vi.spyOn(advice, 'estimateSales'); // Observe real engine forecasts.
    runBots(state);
    // First a current-quarter price estimate, then the three recovery quarters.
    expect(estimates.mock.calls.slice(1, 4).map(([, market]) => market.bonus)).toEqual([1.3, 1, 1]);
    expect(product.production).toBe(0);
    expect(company.modifiers.find((m) => m.kind === 'greenwashing')?.turnsLeft).toBe(1);
    company.controllerId = 'p';
    resolveTurnWithLog(state);
    expect(company.modifiers.some((m) => m.kind === 'greenwashing' && m.turnsLeft > 0)).toBe(false);
  });

  it('expires other own-company bonuses without learning a rival private modifier', () => {
    const { state, company, product } = scenario('crypto');
    product.stock = 1000;
    const own = { ...structuredClone(company), id: 'own-other', products: [{ ...product, id: 'own-other-product' }] };
    const rival = { ...structuredClone(own), id: 'rival', controllerId: 'unseen', products: [{ ...product, id: 'rival-product' }] };
    state.companies[own.id] = own;
    state.companies[rival.id] = rival;
    expect(actions.runAction(state, 'p', { type: 'shady', companyId: own.id, kind: 'greenwashing' }).ok).toBe(true);
    rival.modifiers.push({ kind: 'greenwashing', turnsLeft: 1 });
    const markets = vi.spyOn(advice, 'marketInputs');
    runBots(state);
    const future = markets.mock.calls.find(([s, c]) => s.turn === state.turn + 1 && c.id === company.id);
    expect(future).toBeDefined();
    expect(future![0].companies[own.id].modifiers.some((m) => m.kind === 'greenwashing')).toBe(false);
    expect(future![0].companies[rival.id].modifiers).toEqual(rival.modifiers);
    const withoutHiddenBonus = structuredClone(future![0]);
    withoutHiddenBonus.companies[rival.id].modifiers = [];
    const expected = advice.marketInputs(withoutHiddenBonus, future![1], future![2], future![3], future![4]);
    const observed = advice.marketInputs(...future!);
    expect(observed.othersAttractiveness).toBe(expected.othersAttractiveness);
    expect(own.modifiers.find((m) => m.kind === 'greenwashing')?.turnsLeft).toBe(1);
  });

  it('costs the pending launch batch even before its capacity is installed', () => {
    const { state, company, product } = scenario('crypto', true);
    Object.assign(product, { capacity: 0, pendingCapacity: 100, production: 100,
      lastProduced: 0, lastSales: 0, stock: 0 });
    company.inventory = { chips: { lots: 1, avgCost: 1 }, oil: { lots: 0.6, avgCost: 1 } };
    state.commodities.chips.price = 150;
    runBots(state);
    const next = { ...product, capacity: product.pendingCapacity };
    const costCompany = { ...company, products: [next] };
    expect(product.production).toBe(100);
    expect(product.price).toBeGreaterThanOrEqual(estimatedUnitCost(state, costCompany, next) * 1.05);
  });

  it('restarts an empty managed line when the input-cost shock has passed', () => {
    const { state, company, product } = scenario('crypto', true);
    Object.assign(product, { lastProduced: 0, lastSales: 0, stock: 0, production: 0 });
    state.commodities.chips.price = 1000;
    runBots(state);
    expect(product.production).toBe(0);
    state.commodities.chips.price = COMMODITIES.chips.basePrice;
    runBots(state);
    expect(product.production).toBe(80);
    expect(product.price).toBeGreaterThanOrEqual(estimatedUnitCost(state, company, product) * 1.05);
  });

  it.each([false, true])('restores the cost margin after later input trading (autopilot=%s)', (autopilot) => {
    const { state, company, product } = scenario('crypto', autopilot);
    Object.assign(product, { stock: 0, lastSales: 100 });
    const originalAction = actions.runAction;
    let decided: { production: number; marketing: number; rnd: number } | undefined;
    vi.spyOn(actions, 'runAction').mockImplementation((s, actor, action) => {
      const result = originalAction(s, actor, action);
      if (!decided && action.type === 'setProductDecisions' && action.productId === product.id) {
        decided = { production: product.production, marketing: product.marketing, rnd: product.rnd };
        // A later trader moves the spot quote after this price decision.
        state.commodities.chips.price *= 3;
      }
      return result;
    });
    runBots(state);
    expect(product.price).toBeGreaterThanOrEqual(estimatedUnitCost(state, company, product) * 1.05);
    expect({ production: product.production, marketing: product.marketing, rnd: product.rnd }).toEqual(decided);
  });

  it('a later input shock cancels the batch without raising the old-stock price to its input floor', () => {
    const { state, product } = scenario('crypto', true);
    Object.assign(product, { stock: 80, lastSales: 100 });
    const originalAction = actions.runAction;
    let beforeShock: { price: number; production: number } | undefined;
    vi.spyOn(actions, 'runAction').mockImplementation((s, actor, action) => {
      const result = originalAction(s, actor, action);
      if (!beforeShock && action.type === 'setProductDecisions' && action.productId === product.id) {
        beforeShock = { price: product.price, production: product.production };
        state.commodities.chips.price = 1000;
      }
      return result;
    });
    runBots(state);
    expect(beforeShock!.production).toBeGreaterThan(0);
    expect(product.production).toBe(0);
    expect(product.price).toBe(beforeShock!.price);
    expect(product.price).toBeLessThan(PRICE_MAX_RATIO * SECTORS.crypto.refPrice);
  });

  it('reserves shared cheap inventory once across sibling production batches', () => {
    const { state, company, product } = scenario('crypto', true);
    Object.assign(product, { production: 100, lastProduced: 100, lastSales: 100, stock: 0,
      quality: 2, brand: 2, price: 200 });
    company.products.push({ ...product, id: `${product.id}-second` });
    company.inventory = { chips: { lots: 100, avgCost: 10 }, oil: { lots: 120, avgCost: 80 } };
    state.commodities.chips.price = 300;
    runBots(state);
    expect(company.inventory.chips).toEqual({ lots: 100, avgCost: 10 });
    const first = company.products[0], second = company.products[1];
    expect(second.price).toBeGreaterThan(first.price);
    resolveTurnWithLog(state);
    const report = company.reports[0];
    expect(report.products[0].produced).toBe(100);
    expect(report.products[1].produced).toBe(100);
    expect(report.products[1].unitCost).toBeGreaterThan(report.products[0].unitCost * 4);
    for (const line of report.products) {
      expect(line.sold).toBeGreaterThan(0);
      expect(line.revenue / line.sold + 1e-8).toBeGreaterThanOrEqual(line.unitCost * 1.05);
    }
  });

  it('does not reserve cheap inputs for pending capacity before it can produce', () => {
    const { state, company, product } = scenario('crypto', true);
    Object.assign(product, { capacity: 0, pendingCapacity: 100, production: 100,
      lastProduced: 0, lastSales: 0, stock: 0, quality: 2, brand: 2, price: 200 });
    const installed = { ...product, id: `${product.id}-installed`, capacity: 100, pendingCapacity: 0,
      lastProduced: 100, lastSales: 100 };
    company.products.push(installed);
    company.inventory = { chips: { lots: 100, avgCost: 10 }, oil: { lots: 120, avgCost: 80 } };
    state.commodities.chips.price = 300;
    runBots(state);
    expect(installed.price).toBeLessThan(250);
  });

  it('protects the margin when funding cuts leave a costly retained-input batch', () => {
    const { state, company, product } = scenario('crypto', true);
    Object.assign(product, { production: 100, lastProduced: 100, lastSales: 100, stock: 0,
      quality: 2, brand: 2, price: 200 });
    company.cash = 950;
    company.debt = 20_000;
    company.revenueEma = 0;
    company.modifiers = [];
    state.players.p.cash = 0;
    state.macro.baseInterestRate = 0;
    state.sectors.crypto.demandMultiplier = 0.001;
    company.inventory = { chips: { lots: 10, avgCost: 400 }, oil: { lots: 60, avgCost: 80 } };
    state.commodities.chips.price = 250;
    const uncutEstimate = estimatedUnitCost(state, company, product);
    runBots(state);
    expect(company.inventory.chips).toEqual({ lots: 10, avgCost: 400 });
    expect(product.production).toBe(100);
    resolveTurnWithLog(state);
    const line = company.reports[0].products[0];
    expect(line.produced).toBeGreaterThan(0);
    expect(line.produced).toBeLessThan(100);
    expect(line.unitCost).toBeGreaterThan(uncutEstimate);
    expect(line.sold).toBeGreaterThan(0);
    expect(line.revenue / line.sold + 1e-8).toBeGreaterThanOrEqual(line.unitCost * 1.05);
  });

  it('ignores obsolete costs on inventory that was already empty before planning', () => {
    const { state, company, product } = scenario('crypto', true);
    Object.assign(product, { production: 100, lastProduced: 100, lastSales: 100, stock: 0,
      quality: 2, brand: 2, price: 200 });
    company.cash = 950;
    company.debt = 20_000;
    company.revenueEma = 0;
    company.modifiers = [];
    state.macro.baseInterestRate = 0;
    state.sectors.crypto.demandMultiplier = 0.001;
    company.inventory = { chips: { lots: 0, avgCost: 700 }, oil: { lots: 60, avgCost: 80 } };
    state.commodities.chips.price = 20;
    runBots(state);
    expect(product.production).toBe(100);
    expect(product.price).toBeLessThan(PRICE_MAX_RATIO * SECTORS.crypto.refPrice);
    resolveTurnWithLog(state);
    const line = company.reports[0].products[0];
    expect(line.produced).toBeGreaterThan(0);
    expect(line.sold).toBeGreaterThan(0);
    expect(line.revenue / line.sold + 1e-8).toBeGreaterThanOrEqual(line.unitCost * 1.05);
  });

  it.each(['outgoing', 'costly incoming'] as const)('accounts for %s supply contracts before production', (direction) => {
    const { state, company, product } = scenario('crypto', true);
    Object.assign(product, { production: 100, lastProduced: 100, lastSales: 100, stock: 0,
      quality: 2, brand: 2, price: 100 });
    const other = { ...structuredClone(company), id: 'contract-partner', founderId: null,
      controllerId: 'p', products: [], reports: [], inventory: { chips: { lots: 100, avgCost: 10 } } };
    state.companies[other.id] = other;
    company.inventory = { oil: { lots: 120, avgCost: 80 }, ...(direction === 'outgoing' ? { chips: { lots: 100, avgCost: 10 } } : {}) };
    state.commodities.chips.price = direction === 'outgoing' ? 300 : 20;
    state.contracts = [{ id: 'known-supply', sellerCompanyId: direction === 'outgoing' ? company.id : other.id,
      buyerCompanyId: direction === 'outgoing' ? other.id : company.id,
      commodityId: 'chips', lots: 100, price: direction === 'outgoing' ? 60 : 90, turnsLeft: 1 }];
    runBots(state);
    resolveTurnWithLog(state);
    const line = company.reports[0].products[0];
    expect(line.produced).toBe(100);
    expect(line.sold).toBeGreaterThan(0);
    expect(line.revenue / line.sold + 1e-8).toBeGreaterThanOrEqual(line.unitCost * 1.05);
  });
});
