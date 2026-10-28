import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { closeRecap } from '../src/sim/closeRecap';
import { basin, hexOf } from '../src/sim/hexes';
import { emptyTurnLog } from '../src/sim/turn';
import type { CloseRecap, GameState } from '../src/types';
import { bots, companyOf, config, human, newGame } from './helpers';

function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

describe('frozen quarter-close recap', () => {
  it('starts at the first actual close and compares only two completed quarters', () => {
    const state = newGame(14, [human('a'), human('b', 'gadgets')]);
    expect(getPlayerView(state, 'a').self?.closeRecap).toBeUndefined();
    const company = companyOf(state, 'a');
    resolveTurn(state);
    const first = getPlayerView(state, 'a').self!.closeRecap!;
    expect(first.turn).toBe(1);
    expect(first.netWorth).toBe(state.players.a.netWorthHistory[0]);
    expect(first).not.toHaveProperty('previousNetWorth');
    expect(first.facts).toContainEqual({ type: 'netProfit', companyId: company.id,
      companyName: company.name, amount: company.reports[0].netProfit });
    expect(first.facts.length).toBeLessThanOrEqual(3);
    resolveTurn(state);
    const second = getPlayerView(state, 'a').self!.closeRecap!;
    expect(second.turn).toBe(2);
    expect(second.netWorth).toBe(state.players.a.netWorthHistory[1]);
    expect(second.previousNetWorth).toBe(first.netWorth);
  });

  it('remains frozen after next-quarter share trades, decisions and JSON persistence', () => {
    let state = newGame(18, [human('a'), human('b', 'gadgets'), ...bots(2)]);
    const company = companyOf(state, 'a');
    resolveTurn(state);
    const recap = copy(state.players.a.closeRecap!);
    expect(applyAction(state, 'a', { type: 'sellShares', companyId: company.id, shares: 100 }).ok).toBe(true);
    expect(applyAction(state, 'a', { type: 'setProductDecisions', companyId: company.id,
      productId: company.products[0].id, production: 0 }).ok).toBe(true);
    expect(getPlayerView(state, 'a').self!.closeRecap).toEqual(recap);
    state = copy(state);
    expect(getPlayerView(state, 'a').self!.closeRecap).toEqual(recap);
    // A view is a detached copy, including its nested facts.
    const view = getPlayerView(state, 'a');
    view.self!.closeRecap!.netWorth = -1;
    view.self!.closeRecap!.facts.length = 0;
    expect(state.players.a.closeRecap).toEqual(recap);
  });

  it('captures closing prices before the next quarter headline immediately moves them', () => {
    const state = newGame(44, [human('a'), human('b', 'gadgets')]);
    state.scheduledNews = [{ turn: 2, cardId: 'central_bank_cut' }];
    resolveTurn(state);
    const player = state.players.a;
    const closingPortfolio = Object.values(state.companies).reduce((sum, company) =>
      sum + (company.holdings.a ?? 0) * company.priceHistory[1], 0);
    expect(player.closeRecap!.netWorth).toBeCloseTo(player.cash + closingPortfolio - player.debt, 8);
    expect(state.journal[1].articles.some((a) => a.kind === 'headline')).toBe(true);
    expect(getPlayerView(state, 'a').players.find((p) => p.id === 'a')!.netWorth).not.toBe(player.closeRecap!.netWorth);
  });

  it('uses the report leader even if control has since passed to someone else', () => {
    const state = newGame(22, [human('a'), human('b', 'gadgets')]);
    const company = companyOf(state, 'a');
    resolveTurn(state);
    const log = emptyTurnLog(1);
    log.leaders[company.id] = 'a';
    company.controllerId = 'b';
    company.products[0].stock = 12.5;
    company.reports[0].fines = 75;
    const a = closeRecap(state, state.players.a, log);
    const b = closeRecap(state, state.players.b, log);
    expect(a.facts).toContainEqual({ type: 'fines', companyId: company.id, companyName: company.name, amount: 75 });
    expect(a.facts.some((f) => f.type === 'netProfit' && f.companyId === company.id)).toBe(true);
    expect(b.facts).toEqual([]);
    // Stock stays private to the company's controller once the close is over.
    expect(a.facts.some((f) => f.type === 'stock')).toBe(false);
    // Snapshot construction reads state without mutating it or consuming RNG.
    const before = JSON.stringify(state);
    closeRecap(state, state.players.a, log);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('records positive remaining stock and verifies first sales from actual reports', () => {
    const state = newGame(22, [human('a'), human('b', 'gadgets')]);
    const company = companyOf(state, 'a');
    const product = company.products[0];
    product.production = 0;
    product.stock = 0;
    product.firstSalesTurn = 1; // Eligibility alone does not mean any sale took place.
    resolveTurn(state);
    expect(state.players.a.closeRecap!.facts.some((f) => f.type === 'firstSales')).toBe(false);
    const log = emptyTurnLog(1);
    log.leaders[company.id] = 'a';
    product.stock = 7.25;
    expect(closeRecap(state, state.players.a, log).facts).toContainEqual({ type: 'stock',
      companyId: company.id, companyName: company.name, productId: product.id, productName: product.name, lots: 7.25 });
    product.production = 1;
    resolveTurn(state);
    const report = company.reports.find((r) => r.turn === 2)!;
    expect(report.products[0].sold).toBeGreaterThan(0);
    expect(state.players.a.closeRecap!.facts).toContainEqual({ type: 'firstSales', companyId: company.id,
      companyName: company.name, productId: product.id, productName: product.name, lots: report.products[0].sold });
    resolveTurn(state);
    expect(state.players.a.closeRecap!.facts.some((f) => f.type === 'firstSales' && f.productId === product.id)).toBe(false);
  });

  it('does not announce first sales for a product that sold before a merger moved it', () => {
    const state = newGame(5, [human('a'), human('b', 'gadgets')]);
    const mine = companyOf(state, 'a');
    resolveTurn(state);
    resolveTurn(state);
    const target = Object.values(state.companies).find((c) => c.controllerId === null && c.status === 'active'
      && c.reports.some((r) => r.products.some((p) => p.sold > 0)))!;
    target.holdings = { ...target.holdings, a: Math.ceil(target.sharesOutstanding * 0.6) };
    target.controllerId = 'a';
    resolveTurn(state);
    const moved = target.products.map((p) => p.id);
    expect(applyAction(state, 'a', { type: 'merge', absorberId: mine.id, targetId: target.id }).ok).toBe(true);
    expect(mine.products.some((p) => moved.includes(p.id))).toBe(true);
    resolveTurn(state);
    const facts = state.players.a.closeRecap!.facts;
    expect(facts.some((f) => f.type === 'firstSales' && moved.includes(f.productId))).toBe(false);
  });

  it('places hex sales origins in the basin of their cell', () => {
    const state = newGame(9, [human('a'), human('b', 'gadgets')]);
    state.config.mapMode = 'hex';
    resolveTurn(state);
    for (const company of Object.values(state.companies)) {
      for (const product of company.products) {
        if (!product.lastSalesOrigin) continue;
        expect(product.lastSalesOrigin.hexId).toBe(hexOf(product));
        expect(product.lastSalesOrigin.zoneId).toBe(basin(product.lastSalesOrigin.hexId));
      }
    }
  });

  it('keeps a bankrupt company associated with its evicted leader', () => {
    const state = newGame(22, [human('a'), human('b', 'gadgets')]);
    const company = companyOf(state, 'a');
    company.cash = 0;
    resolveTurn(state);
    expect(company.status).toBe('bankrupt');
    expect(company.controllerId).toBeNull();
    expect(state.players.a.closeRecap!.facts).toContainEqual({ type: 'bankruptcy', companyId: company.id, companyName: company.name });
    expect(state.players.b.closeRecap!.facts.some((f) => f.companyId === company.id)).toBe(false);
  });

  it('uses current-quarter OPA flashes without mistaking previous results for current events', () => {
    const state = newGame(31, [human('a'), human('b', 'gadgets')]);
    const company = companyOf(state, 'a');
    state.journal[0].articles.push({ id: 'test-opa', title: '', body: '', kind: 'flash', tone: 'drama',
      companyIds: [company.id], event: { type: 'takeover', actorId: 'b', subjectId: 'a' } });
    resolveTurn(state);
    const base = { type: 'takeover', companyId: company.id, companyName: company.name, journalTurn: 1 };
    expect(state.players.a.closeRecap!.facts).toContainEqual({ ...base, direction: 'lost' });
    expect(state.players.b.closeRecap!.facts).toContainEqual({ ...base, direction: 'won' });
    resolveTurn(state);
    expect(state.players.a.closeRecap!.facts.some((f) => f.type === 'takeover')).toBe(false);
  });

  it('exposes only the viewer recap and withholds it from spectators and pending bot claims', () => {
    const state = newGame(36, [human('a'), human('b', 'gadgets'), ...bots(1)]);
    resolveTurn(state);
    const a = getPlayerView(state, 'a');
    expect(a.self!.closeRecap).toEqual(state.players.a.closeRecap);
    expect(a.players.every((p) => !Object.hasOwn(p, 'closeRecap'))).toBe(true);
    expect(a.self!.closeRecap!.facts.every((f) => f.companyId !== companyOf(state, 'b').id)).toBe(true);
    expect(getPlayerView(state, 'spectator').self).toBeUndefined();
    state.players.bot1.botTakeover = { previousName: 'Bot', activeFromTurn: state.turn + 1 };
    expect(getPlayerView(state, 'bot1').self).toBeUndefined();
  });

  it('accepts old saved states without a recap and creates one at the next close', () => {
    let state = newGame(38, [human('a'), human('b', 'gadgets')]);
    resolveTurn(state);
    for (const player of Object.values(state.players)) delete player.closeRecap;
    state = copy(state) as GameState;
    expect(getPlayerView(state, 'a').self!.closeRecap).toBeUndefined();
    resolveTurn(state);
    expect(getPlayerView(state, 'a').self!.closeRecap!.previousNetWorth).toBe(state.players.a.netWorthHistory[0]);
  });

  it('has identical facts and numbers in French and English without extra RNG draws', () => {
    const fr = createGame({ ...config(41), lang: 'fr' }, [human('a'), human('b', 'gadgets')]);
    const en = createGame({ ...config(41), lang: 'en' }, [human('a'), human('b', 'gadgets')]);
    const numerical = (recap: CloseRecap) => JSON.parse(JSON.stringify(recap, (key, value) =>
      ['companyName', 'companyNames', 'productName', 'name'].includes(key) ? undefined : value));
    for (let turn = 1; turn <= 4; turn++) {
      resolveTurn(fr);
      resolveTurn(en);
      expect(en.rngState).toBe(fr.rngState);
      expect(numerical(en.players.a.closeRecap!)).toEqual(numerical(fr.players.a.closeRecap!));
    }
  });
});
