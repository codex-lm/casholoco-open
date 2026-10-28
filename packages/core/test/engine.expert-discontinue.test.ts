import { describe, expect, it, vi } from 'vitest';
import { COMMODITIES, SECTORS } from '../src/content';
import { applyAction, createGame, getPlayerView, netWorth, resolveTurn } from '../src/engine';
import { expertTurn, type BotIO } from '../src/sim/botExpert';
import { NEUTRAL_PERSONALITY } from '../src/sim/bots';
import { PRICE_MAX_RATIO } from '../src/sim/constants';
import { nearestFreeHex } from '../src/sim/hexes';
import { hexReservePrice } from '../src/sim/hexAuctions';
import * as news from '../src/sim/news';
import type { Action, GameState, ProductState } from '../src/types';
import { companyOf, config, human } from './helpers';

function fixture(hex = false): GameState {
  const state = createGame({ ...config(71), ...(hex ? { mapMode: 'hex' as const,
    terrainAssignment: 'host' as const, terrains: { a: 'monts-defiscalises' } } : {}) },
  [human('a', 'crypto'), human('b', 'yogurts')]);
  state.turn = 14;
  state.activeEffects = [];
  const company = companyOf(state, 'a');
  company.cash = 100_000;
  company.debt = 0;
  company.scandal = 0;
  company.inventory = {};
  company.sites = [];
  delete company.taxDue;
  delete company.finesDue;
  company.products[0].quality = 4;
  company.products[0].brand = 1;
  company.products[0].stock = 0;
  company.products[0].capacity = 200;
  return state;
}

function addProduct(state: GameState, overrides: Partial<ProductState>): ProductState {
  const company = companyOf(state, 'a');
  const product = { ...structuredClone(company.products[0]), id: 'exit-candidate', terrainId: undefined,
    hexId: state.config.mapMode === 'hex' ? 'A10' : undefined, pendingCapacity: 0,
    launchedTurn: 4, lastSales: 0, lastRevenue: 0, ...overrides };
  company.products.push(product);
  company.reports = [state.turn - 2, state.turn - 1].map((turn) => ({ turn,
    revenue: 10_000, cogs: 1_000, marketing: 0, rnd: 0, fixedCosts: 700, interest: 0,
    fines: 0, tax: 0, netProfit: 8_300, cashEnd: company.cash, debtEnd: 0,
    products: company.products.map((p) => ({ productId: p.id, name: p.name, sectorId: p.sectorId,
      produced: 10, sold: p.id === product.id || p.quality < 0.01 ? 0 : 10,
      revenue: p.id === product.id || p.quality < 0.01 ? 0 : 10_000, marketShare: 0, unitCost: 100 })) }));
  return product;
}

/** Exercise the decision on a real player view while isolating it from financing and launches. */
function exits(state: GameState): string[] {
  const actions: Action[] = [];
  const memory = { calib: {} };
  const io: BotIO = {
    view: () => getPlayerView(state, 'a'),
    act: (action) => {
      actions.push(action);
      return action.type === 'discontinueProduct' ? applyAction(state, 'a', action)
        : { ok: false, message: 'Other decisions are isolated in this fixture.' };
    },
    memory: () => memory,
    productName: () => 'Fixture product',
    startupName: () => 'Fixture startup',
  };
  expertTurn(io, NEUTRAL_PERSONALITY);
  return actions.filter((a) => a.type === 'discontinueProduct').map((a) => a.productId);
}

describe('expert discontinuation compares final scores', () => {
  it('keeps a profitable product whose booked plant is worth more than its remaining cash profit', () => {
    const state = fixture();
    state.turn = 15;
    const product = addProduct(state, { sectorId: 'gadgets', capacity: 1_000, quality: 1,
      brand: 0.3, price: 300, stock: 0 });
    expect(exits(state)).not.toContain(product.id);
    expect(companyOf(state, 'a').products.some((p) => p.id === product.id)).toBe(true);
  });

  it('keeps the full closing stock value rather than treating half its book value as a gain', () => {
    const state = fixture();
    state.turn = 16;
    // No buyers at close: isolate the full booked inventory value from the
    // economic loss incurred by selling expensive stock at ordinary prices.
    companyOf(state, 'a').reputation = 0;
    const product = addProduct(state, { sectorId: 'gadgets', capacity: 1, quality: 0.001,
      brand: 0, price: 300, stock: 20, lastUnitCost: 100_000 });
    expect(exits(state)).not.toContain(product.id);
  });

  it.each([0, 1, 2, 3, 4])('never exits a product launched %i quarters ago, even when it is losing money', (age) => {
    const state = fixture();
    state.turn = 12;
    state.commodities.chips.price = 100 * COMMODITIES.chips.basePrice;
    const product = addProduct(state, { sectorId: 'gadgets', capacity: 1, quality: 0.001,
      brand: 0, stock: 0, launchedTurn: state.turn - age });
    expect(exits(state)).not.toContain(product.id);
  });

  it('can exit an established idle line with a clear loss and improve actual final owner net worth', () => {
    const state = fixture();
    state.turn = 12;
    const product = addProduct(state, { sectorId: 'gadgets', capacity: 0, quality: 0.001,
      brand: 0, stock: 0, production: 0, marketing: 0, rnd: 0 });
    const keep = structuredClone(state);
    expect(exits(state)).toContain(product.id);
    expect(companyOf(state, 'a').products).toHaveLength(1);
    while (state.phase === 'playing') resolveTurn(state);
    while (keep.phase === 'playing') resolveTurn(keep);
    expect(netWorth(state, 'a')).toBeGreaterThan(netWorth(keep, 'a'));
  });

  it('revalues the surviving crypto line when retiring a failed sibling', () => {
    const state = fixture();
    state.turn = 12;
    const product = addProduct(state, { sectorId: 'crypto', capacity: 0, pendingCapacity: 0,
      quality: 0.001, brand: 0, stock: 0, production: 0, marketing: 0, rnd: 0 });
    const keep = structuredClone(state);
    expect(exits(state)).toContain(product.id);
    expect(companyOf(state, 'a').products).toHaveLength(1);
    while (state.phase === 'playing') resolveTurn(state);
    while (keep.phase === 'playing') resolveTurn(keep);
    expect(netWorth(state, 'a')).toBeGreaterThan(netWorth(keep, 'a'));
  });

  it('does not act on a pessimistic forecast while the product has positive realised margins', () => {
    const state = fixture();
    const product = addProduct(state, { sectorId: 'gadgets', capacity: 1, quality: 0.001,
      brand: 0, stock: 0 });
    for (const quarter of companyOf(state, 'a').reports) {
      const report = quarter.products.find((p) => p.productId === product.id)!;
      report.sold = 5;
      report.revenue = 2_000;
    }
    expect(exits(state)).not.toContain(product.id);
  });

  it('values the original plant tax privilege across the whole hex company', () => {
    const state = fixture(true);
    state.turn = 12;
    const company = companyOf(state, 'a');
    const original = company.products[0];
    original.capacity = 0;
    original.pendingCapacity = 0;
    original.sectorId = 'gadgets';
    original.price = 300;
    original.quality = 0.001;
    original.brand = 0;
    original.landCost = 0;
    addProduct(state, { sectorId: 'crypto', quality: 8, brand: 2, capacity: 200 });
    const withoutSeat = structuredClone(state);
    delete companyOf(withoutSeat, 'a').terrainId;
    delete companyOf(withoutSeat, 'a').products[0].terrainId;
    expect(exits(state)).not.toContain(original.id);
    expect(exits(withoutSeat)).toContain(original.id);
  });

  it('can still search the legal crypto cap when market elasticity is zero', () => {
    const original = SECTORS.crypto.marketElasticity;
    SECTORS.crypto.marketElasticity = 0;
    try {
      const state = fixture();
      state.turn = 16;
      // Keep sales capacity-limited even at the ceiling, so the current sector
      // parameters give the search an unambiguous optimum at the legal cap.
      companyOf(state, 'a').products[0].capacity = 1;
      const decisions: number[] = [];
      const io: BotIO = {
        view: () => getPlayerView(state, 'a'),
        act: (action) => {
          if (action.type === 'setProductDecisions' && action.price !== undefined) decisions.push(action.price);
          return { ok: false, message: 'Isolated price decision.' };
        },
        memory: () => ({ calib: {} }), productName: () => 'Fixture', startupName: () => 'Fixture',
      };
      expertTurn(io, NEUTRAL_PERSONALITY);
      expect(decisions).toContain(PRICE_MAX_RATIO * SECTORS.crypto.refPrice);
    } finally {
      SECTORS.crypto.marketElasticity = original;
    }
  });
  it.each([false, true])('prices a dominant crypto supplier below the cap with market response (siblings=%s)', (siblings) => {
    const state = fixture();
    state.turn = 16;
    const company = companyOf(state, 'a');
    for (const rival of Object.values(state.companies)) if (rival.id !== company.id) {
      for (const p of rival.products) if (p.sectorId === 'crypto') p.sectorId = 'yogurts';
    }
    Object.assign(company.products[0], { capacity: 1_000_000, quality: 8, brand: 2, pendingCapacity: 0 });
    if (siblings) addProduct(state, { id: 'crypto-sibling', capacity: 1_000_000, quality: 8, brand: 2, pendingCapacity: 0 });
    const prices: number[] = [];
    expertTurn({ view: () => getPlayerView(state, 'a'), act: (action) => {
      if (action.type === 'setProductDecisions' && action.price !== undefined) prices.push(action.price);
      return { ok: false, message: 'Isolated price decision.' };
    }, memory: () => ({ calib: {} }), productName: () => 'Fixture', startupName: () => 'Fixture' }, NEUTRAL_PERSONALITY);
    expect(prices).toHaveLength(siblings ? 2 : 1);
    expect(prices.every((price) => price < PRICE_MAX_RATIO * SECTORS.crypto.refPrice)).toBe(true);
  });

  it('keeps an actual hex scooter launch through four losing operating quarters', () => {
    const state = fixture(true);
    state.turn = 10;
    const company = companyOf(state, 'a');
    const hexId = nearestFreeHex(state)!;
    expect(applyAction(state, 'a', { type: 'launchProduct', companyId: company.id,
      sectorId: 'scooters', name: 'Observation plant', hexId, bid: hexReservePrice(hexId), fallback: 'abandon' }).ok).toBe(true);
    resolveTurn(state);
    const product = company.products.find((p) => p.name === 'Observation plant')!;
    expect(product).toMatchObject({ sectorId: 'scooters', launchedTurn: 10, firstSalesTurn: 11 });
    // A deliberately underused, unprofitable but funded plant; reports and
    // observation age come from real closes rather than historical product ids.
    Object.assign(product, { capacity: 1, pendingCapacity: 0, quality: 0.001, brand: 0,
      production: 0, stock: 0, marketing: 0, rnd: 0 });
    while (state.turn <= 14) {
      company.reputation = 0; // No buyers can make this plant cover its fixed cost.
      expect(exits(state)).not.toContain(product.id);
      expect(company.products.some((p) => p.id === product.id)).toBe(true);
      resolveTurn(state);
    }
    const reports = company.reports.flatMap((r) => r.products.filter((p) => p.productId === product.id));
    expect(reports).toHaveLength(4);
    expect(reports.every((r) => r.revenue - r.sold * r.unitCost - SECTORS.scooters.fixedCost < -50)).toBe(true);
  });

  it('retires a mature loss-making operating plant and improves actual final owner value', () => {
    // Sector-targeted headlines can choose different companies when a line
    // disappears. Neutralize their effects to compare the disposal itself.
    const applyCard = news.applyNewsCard;
    const headlines = vi.spyOn(news, 'applyNewsCard').mockImplementation((state, card, kind) =>
      applyCard(state, { ...card, effects: [] }, kind));
    try {
      const exiting = fixture();
      exiting.turn = 12;
      const product = addProduct(exiting, { sectorId: 'scooters', capacity: 1, pendingCapacity: 0,
        quality: 0.001, brand: 0, stock: 0, production: 0, marketing: 0, rnd: 0 });
      companyOf(exiting, 'a').reputation = 0;
      const retained = structuredClone(exiting);
      expect(exiting.turn - product.launchedTurn).toBeGreaterThan(4);
      expect(exits(exiting)).toContain(product.id);
      while (exiting.phase === 'playing') resolveTurn(exiting);
      while (retained.phase === 'playing') resolveTurn(retained);
      expect(companyOf(retained, 'a').products.some((p) => p.id === product.id)).toBe(true);
      expect(netWorth(exiting, 'a')).toBeGreaterThan(netWorth(retained, 'a'));
    } finally { headlines.mockRestore(); }
  });

});
