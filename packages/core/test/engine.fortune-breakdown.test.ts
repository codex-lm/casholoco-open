import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { closeRecap } from '../src/sim/closeRecap';
import { computeNetWorth, personalInterestRate, rumorCheckPrice } from '../src/sim/finance';
import { freeBuildableHexes } from '../src/sim/hexes';
import { hexReservePrice } from '../src/sim/hexAuctions';
import { emptyTurnLog } from '../src/sim/turn';
import { WHISTLEBLOW_COST } from '../src/sim/constants';
import type { Action, CloseRecap, GameState, Lang } from '../src/types';
import { companyOf, config, human } from './helpers';

function game(seed = 17, mapMode: 'classic' | 'hex' = 'classic', lang: Lang = 'fr') {
  const state = createGame({ ...config(seed, 6), mapMode, lang }, [human('a'), human('b', 'gadgets')]);
  for (const player of Object.values(state.players)) player.cash = 50_000;
  for (const company of Object.values(state.companies)) {
    company.cash = 50_000;
    for (const product of company.products) { product.production = 0; product.marketing = 0; product.rnd = 0; }
  }
  return state;
}

function ok(state: GameState, playerId: string, action: Action) {
  const result = applyAction(state, playerId, action);
  expect(result.ok, result.message).toBe(true);
}

/** Isolate a close from production/news to test exact causal attribution. */
function capture(state: GameState, turn: number): CloseRecap {
  const player = state.players.a;
  player.netWorthHistory.push(computeNetWorth(state, player.id));
  const recap = closeRecap(state, player, emptyTurnLog(turn));
  player.closeRecap = recap;
  player.quarterPersonalCosts = 0;
  return recap;
}

function reconciles(recap: CloseRecap) {
  expect(recap.breakdown).toBeDefined();
  const b = recap.breakdown!;
  const delta = recap.netWorth - recap.previousNetWorth!;
  expect(b.otherMovements).toBe(delta - (b.sharePrices + b.dividendsAndBonuses + b.personalCosts));
  expect(b.sharePrices + b.dividendsAndBonuses + b.personalCosts + b.otherMovements).toBeCloseTo(delta, 8);
}

describe('personal fortune attribution', () => {
  it('attributes a price-only quarter to shares held at the previous close without consuming RNG or mutating state', () => {
    const state = game();
    const company = companyOf(state, 'a');
    company.holdings.a = 600;
    company.sharePrice = 10;
    const first = capture(state, 1);
    expect(first.breakdown).toBeUndefined();
    company.sharePrice = 12;
    state.players.a.netWorthHistory.push(computeNetWorth(state, 'a'));
    const before = JSON.stringify(state), rng = state.rngState;
    const recap = closeRecap(state, state.players.a, emptyTurnLog(2));
    expect(recap.breakdown).toEqual({ sharePrices: 1200, dividendsAndBonuses: 0, personalCosts: 0, otherMovements: 0 });
    expect(recap.netWorth - recap.previousNetWorth!).toBe(1200);
    expect(state.rngState).toBe(rng);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('uses the previous holding quantity even after a sale; trade execution belongs in the remainder', () => {
    const state = game();
    const company = companyOf(state, 'a');
    company.holdings.a = 600;
    company.sharePrice = 10;
    capture(state, 1);
    state.players.a.cash += 100 * 11;
    company.holdings.a -= 100;
    company.sharePrice = 12;
    const recap = capture(state, 2);
    expect(recap.breakdown!.sharePrices).toBe(1200);
    expect(recap.breakdown!.otherMovements).toBe(-100);
    reconciles(recap);
  });

  it('keeps borrowing and principal repayment neutral, including a loan carried across the close', () => {
    const state = game();
    capture(state, 1);
    const before = computeNetWorth(state, 'a');
    ok(state, 'a', { type: 'takePersonalLoan', amount: 100 });
    expect(computeNetWorth(state, 'a')).toBe(before);
    ok(state, 'a', { type: 'repayPersonalLoan', amount: 40 });
    expect(computeNetWorth(state, 'a')).toBe(before);
    expect(capture(state, 2).breakdown).toEqual({ sharePrices: 0, dividendsAndBonuses: 0, personalCosts: 0, otherMovements: 0 });
    ok(state, 'a', { type: 'repayPersonalLoan', amount: 60 });
    expect(capture(state, 3).breakdown).toEqual({ sharePrices: 0, dividendsAndBonuses: 0, personalCosts: 0, otherMovements: 0 });
  });

  it('records tips and whistleblowing once, excludes refused actions and company fines, and resets at close', () => {
    const state = game();
    capture(state, 1);
    const rival = companyOf(state, 'b');
    state.journal.at(-1)!.rumors.push({ text: 'Test', reliability: 'faible' });
    const tip = rumorCheckPrice(state, state.players.a);
    ok(state, 'a', { type: 'checkRumor', turn: state.turn, index: 0 });
    ok(state, 'a', { type: 'whistleblow', companyId: rival.id });
    expect(state.players.a.quarterPersonalCosts).toBe(tip + WHISTLEBLOW_COST);
    expect(applyAction(state, 'a', { type: 'whistleblow', companyId: rival.id }).ok).toBe(false);
    state.players.a.stats.finesPaid += 900;
    const recap = capture(state, 2);
    expect(recap.breakdown!.personalCosts).toBe(-(tip + WHISTLEBLOW_COST));
    expect(recap.breakdown!.otherMovements).toBeCloseTo(0, 8);
    expect(capture(state, 3).breakdown!.personalCosts).toBe(0);
  });

  it('records the whole personal interest charge when cash is insufficient and interest becomes debt', () => {
    const state = game();
    resolveTurn(state);
    const player = state.players.a;
    player.cash = 0;
    player.debt = 100;
    const interest = player.debt * personalInterestRate(state);
    resolveTurn(state);
    expect(player.closeRecap!.breakdown!.personalCosts).toBe(-interest);
    expect(player.quarterPersonalCosts).toBe(0);
    reconciles(player.closeRecap!);
  });

  it.each(['bankrupt', 'merged'] as const)('values previous %s positions at zero and leaves conversions in the remainder', (status) => {
    const state = game();
    const company = companyOf(state, 'a');
    company.holdings.a = 600;
    company.sharePrice = 10;
    capture(state, 1);
    company.status = status;
    company.holdings = {};
    // The engine retains an absorbed company's last quotation, but it has no portfolio value.
    const recap = capture(state, 2);
    expect(recap.breakdown!.sharePrices).toBe(-6000);
    expect(recap.breakdown!.otherMovements).toBe(0);
    reconciles(recap);
  });

  it('reconciles a real merger conversion without counting an absorbed ticker at its stale price', () => {
    const state = game();
    const absorber = companyOf(state, 'a'), target = companyOf(state, 'b');
    absorber.holdings = { a: 600 }; absorber.sharePrice = 10;
    target.holdings = { a: 600 }; target.sharePrice = 20; target.controllerId = 'a';
    capture(state, 1);
    ok(state, 'a', { type: 'merge', absorberId: absorber.id, targetId: target.id });
    expect(target.status).toBe('merged');
    expect(target.sharePrice).toBe(20);
    const recap = capture(state, 2);
    expect(recap.breakdown!.sharePrices).toBe(-12_000);
    expect(recap.breakdown!.otherMovements).toBe(12_000);
    expect(recap.netWorth).toBe(recap.previousNetWorth);
    expect(recap.settlements!.events).toContainEqual(expect.objectContaining({
      event: expect.objectContaining({ type: 'merger', actorId: 'a' }), companyIds: [absorber.id, target.id],
    }));
    reconciles(recap);
  });

  it.each(['no recap', 'old recap', 'missing fees'] as const)('restores %s without inventing a partial-quarter breakdown', (legacy) => {
    let state = game();
    resolveTurn(state);
    for (const player of Object.values(state.players)) {
      if (legacy === 'no recap') delete player.closeRecap;
      if (legacy === 'old recap') delete player.closeRecap!.fortuneSnapshot;
      delete player.quarterPersonalCosts;
    }
    state = JSON.parse(JSON.stringify(state)) as GameState;
    resolveTurn(state);
    expect(state.players.a.closeRecap!.previousNetWorth).toBeDefined();
    expect(state.players.a.closeRecap!.breakdown).toBeUndefined();
    resolveTurn(state);
    reconciles(state.players.a.closeRecap!);
  });

  it.each(['interest', 'tip', 'whistleblow'] as const)('does not manufacture missing fee history when new %s is charged', (cost) => {
    const state = game();
    resolveTurn(state);
    delete state.players.a.quarterPersonalCosts;
    if (cost === 'interest') ok(state, 'a', { type: 'takePersonalLoan', amount: 100 });
    if (cost === 'tip') {
      state.journal.at(-1)!.rumors.push({ text: 'Test', reliability: 'faible' });
      ok(state, 'a', { type: 'checkRumor', turn: state.turn, index: 0 });
    }
    if (cost === 'whistleblow') ok(state, 'a', { type: 'whistleblow', companyId: companyOf(state, 'b').id });
    expect(state.players.a.quarterPersonalCosts).toBeUndefined();
    resolveTurn(state);
    expect(state.players.a.closeRecap!.breakdown).toBeUndefined();
    expect(state.players.a.quarterPersonalCosts).toBe(0);
    resolveTurn(state);
    reconciles(state.players.a.closeRecap!);
  });

  it('exposes the breakdown only to its owner and detaches its nested display baseline', () => {
    const state = game();
    resolveTurn(state); resolveTurn(state);
    const view = getPlayerView(state, 'a');
    expect(view.self!.closeRecap!.breakdown).toEqual(state.players.a.closeRecap!.breakdown);
    expect(view.players.every((p) => !('closeRecap' in p) && !('quarterPersonalCosts' in p))).toBe(true);
    expect(getPlayerView(state, 'spectator').self).toBeUndefined();
    view.self!.closeRecap!.breakdown!.personalCosts = -999;
    view.self!.closeRecap!.fortuneSnapshot!.positions[0].shares = 0;
    expect(state.players.a.closeRecap!.breakdown!.personalCosts).toBe(0);
    expect(state.players.a.closeRecap!.fortuneSnapshot!.positions[0].shares).toBeGreaterThan(0);
  });
});

describe.each(['classic', 'hex'] as const)('complete quarter flows (%s)', (mapMode) => {
  it.each([5, 17, 44])('reconciles dividends, bonuses, buyback, trades, loans, bankruptcy and start-up for seed %s in FR/EN', (seed) => {
    const fr = game(seed, mapMode, 'fr'), en = game(seed, mapMode, 'en');
    const act = (action: Action) => { ok(fr, 'a', action); ok(en, 'a', action); };
    const close = () => {
      resolveTurn(fr); resolveTurn(en);
      expect(fr.rngState).toBe(en.rngState);
      for (const id of ['a', 'b']) {
        const a = fr.players[id].closeRecap!, b = en.players[id].closeRecap!;
        expect(a.breakdown).toEqual(b.breakdown);
        expect(a.fortuneSnapshot).toEqual(b.fortuneSnapshot);
        expect(a.netWorth).toBe(b.netWorth);
        if (a.previousNetWorth !== undefined) reconciles(a);
      }
    };
    close();
    const mine = companyOf(fr, 'a'), rival = companyOf(fr, 'b');
    const baseline = fr.players.a.closeRecap!.fortuneSnapshot!;
    act({ type: 'payDividend', companyId: mine.id, amount: 100 });
    act({ type: 'ceoBonus', companyId: mine.id, amount: 50 });
    act({ type: 'buyback', companyId: mine.id, shares: 10 });
    act({ type: 'buyShares', companyId: rival.id, shares: 10 });
    act({ type: 'sellShares', companyId: rival.id, shares: 5 });
    act({ type: 'takePersonalLoan', amount: 1000 });
    act({ type: 'repayPersonalLoan', amount: 600 });
    const interest = fr.players.a.debt * personalInterestRate(fr);
    const receipts = (fr.players.a.stats.dividendsReceived - baseline.dividendsReceived)
      + (fr.players.a.stats.bonusesTaken - baseline.bonusesTaken);
    close();
    expect(fr.players.a.closeRecap!.breakdown!.dividendsAndBonuses).toBe(receipts);
    expect(receipts).toBeGreaterThan(50);
    expect(fr.players.a.closeRecap!.breakdown!.personalCosts).toBe(-interest);
    // Genuine bankruptcy close, followed by an actual comeback foundation action.
    fr.companies[mine.id].cash = 0; en.companies[mine.id].cash = 0;
    close();
    expect(fr.companies[mine.id].status).toBe('bankrupt');
    const hexId = mapMode === 'hex' ? freeBuildableHexes(fr)[0] : undefined;
    act({ type: 'foundStartup', name: 'Fresh Start', sectorId: 'energy_drinks', investment: 2000,
      ...(hexId ? { hexId, bid: hexReservePrice(hexId), fallback: 'nearest' as const } : {}) });
    expect(fr.players.a.stats.startupsFounded).toBe(1);
    close();
    expect(fr.players.a.closeRecap!.breakdown!.otherMovements).not.toBe(0);
  });
});
