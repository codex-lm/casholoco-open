import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, getContent, getPlayerView, resolveTurn, type CloseRecapFact, type Lang, type PlayerView } from '@muchomoney/core';
import { fmtFor, parseNumber } from '../src/fmt';
import { GameProvider } from '../src/hooks/useGame';
import { quarterCloseMessages } from '../src/i18n/quarterClose';
import { QuarterClose, factLink } from '../src/screens/game/QuarterClose';
import { displayedFortuneBalances, displayedFortuneBreakdown, latestCloseRecap } from '../src/screens/game/closeRecap';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
const initial = getState();
afterEach(() => setState(initial));
function fixture(lang: Lang) {
  return createGame({ seed: 17, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Other Holding', sectorId: 'yogurts', connected: true, color: '#654321' },
  ]);
}
function render(view: PlayerView, lang: Lang, open = true, disabled = false): string {
  setState({ lang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(QuarterClose, {
    open, disableAutoOpen: disabled, onClose: vi.fn(), onDisableAutoOpen: vi.fn(),
    openIssue: vi.fn(), openFactory: vi.fn(), openMapFor: vi.fn(), openStock: vi.fn(), openCompany: vi.fn(), goTo: vi.fn(),
  }) }));
}
const escaped = (value: string) => renderToStaticMarkup(createElement(Fragment, null, value));

describe.each(['fr', 'en'] as const)('quarter report window (%s)', (lang) => {
  it('has no T1 report or strip; closed hides everything; opened uses frozen figures in three blocks', () => {
    const game = fixture(lang);
    expect(render(getPlayerView(game, 'human'), lang)).toBe('');
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    expect(render(view, lang, false)).toBe('');
    view.players[0].netWorth = 123456789;
    const recap = latestCloseRecap(view)!;
    const fmt = fmtFor(lang);
    const text = quarterCloseMessages(lang);
    const html = render(view, lang);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(escaped(text.title(fmt.date(1, 2027))));
    for (const block of ['fortune', 'companies', 'settlements']) expect(html).toContain('data-recap-block="' + block + '"');
    for (const title of [text.fortuneTitle, text.companiesTitle, text.settlementsTitle, text.disableAutoOpen]) expect(html).toContain(escaped(title));
    expect(html).toContain(escaped(fmt.money(recap.netWorth)));
    expect(html).not.toContain(escaped(fmt.money(view.players[0].netWorth)));
    expect(html).not.toContain('quarter-close-summary');
    expect(html).not.toContain('lots lots');
    expect(html).not.toContain('Other Holding</h3>');
    expect(html).toContain('type="checkbox"');
    expect(render(view, lang, true, true)).toContain('checked=""');
  });

  it('renders personal balances, loan, every holding with prices/trades and separately labelled costs', () => {
    const game = fixture(lang);
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const fortune = view.self!.closeRecap!.fortune!;
    const text = quarterCloseMessages(lang);
    const fmt = fmtFor(lang);
    fortune.cashBefore = 4000; fortune.cashAfter = 3500;
    fortune.portfolioBefore = 22600; fortune.portfolioAfter = 24400;
    fortune.debtBefore = 100; fortune.debtAfter = 200;
    fortune.dividends = 80; fortune.bonuses = 50; fortune.interest = 4; fortune.tips = 500; fortune.whistleblowing = 500;
    const own = view.companies.find((c) => c.controllerId === 'human')!;
    fortune.holdings = [{ companyId: own.id, companyName: own.name, sharesBefore: 4000, sharesAfter: 4000, priceBefore: 5.65, priceAfter: 6.1, bought: 200, sold: 200 }];
    const html = render(view, lang);
    expect(html).toContain(escaped(text.holding(own.name, fmt.int(4000), fmt.int(4000), fmt.sharePrice(5.65) + ' → ' + fmt.sharePrice(6.1), fmt.signedMoney(4000 * 6.1 - 4000 * 5.65))));
    expect(html).toContain(escaped(text.bought(fmt.int(200))));
    expect(html).toContain(escaped(text.sold(fmt.int(200))));
    for (const label of [text.cash, text.portfolio, text.debt, text.totalWorth, text.dividends, text.bonuses, text.interest, text.tips, text.whistleblowing, text.stockMarket]) expect(html).toContain(escaped(label));
    expect(html).toContain(escaped(fmt.money(4000) + ' → ' + fmt.money(3500)));
    expect(html).toContain(escaped(fmt.money(100) + ' → ' + fmt.money(200)));
  });

  it('balances read like the top bar; the net-worth change and its four causes add up at the displayed k', () => {
    const game = fixture(lang); resolveTurn(game);
    const view = getPlayerView(game, 'human'); const recap = view.self!.closeRecap!;
    recap.previousNetWorth = 20004.49; recap.netWorth = 20049.51;
    Object.assign(recap.fortune!, { cashBefore: 4000.6, portfolioBefore: 16104, debtBefore: 100.11, netWorthBefore: 20004.49,
      cashAfter: 4000.51, portfolioAfter: 16149.51, debtAfter: 100.51 });
    const balances = displayedFortuneBalances(recap.fortune!, recap.netWorth);
    expect(balances.before!.rounding).toBe(-1);
    for (const balance of [balances.before!, balances.after])
      expect(balance.cash + balance.portfolio - balance.debt + balance.rounding).toBe(balance.netWorth);
    expect(balances.after.netWorth - balances.before!.netWorth).toBe(46);
    const html = render(view, lang); const fmt = fmtFor(lang);
    expect(html).not.toMatch(lang === 'fr' ? /Arrondi des soldes/ : /Balance rounding/);
    expect(html).toContain(escaped(fmt.money(20004.49) + ' → ' + fmt.money(20049.51)));
    expect(html).toContain(escaped(fmt.signedMoney(46, 'exact')));
    const breakdown = [...html.match(/<dl class="quarter-close-breakdown">(.*?)<\/dl>/)![1].matchAll(/<dd>(.*?)<\/dd>/g)].map((m) => m[1]);
    const wholeK = (value: string) => Math.round(parseNumber(value.replace(/[k€$+]/g, ''), lang)) || 0;
    expect(breakdown.reduce((sum, amount) => sum + wholeK(amount), 0)).toBe(46);
  });

  it('renders each product and precise fine cause/outcome without asserting that this quarter’s practice caused it', () => {
    const game = fixture(lang);
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const company = view.self!.closeRecap!.companies![0];
    const product = company.report!.products[0];
    product.sold = 12; product.demand = 20; product.averagePrice = 25; product.revenue = 300; product.margin = 120; product.stockLeft = 5; product.spoiled = 2;
    company.fineCauses = [{ cause: 'scandal', amount: 1200, scandalBefore: 64, scandalAfter: 15, reputationBefore: 1, reputationAfter: .85, shadyActions: ['tax_optimisation'] },
      { cause: 'cartel', amount: 250, sectorId: 'gadgets' }];
    const html = render(view, lang);
    const text = quarterCloseMessages(lang);
    const fmt = fmtFor(lang);
    for (const label of [text.soldDemand, text.averagePrice, text.revenue, text.margin, text.stockLeft, text.spoiled, text.netProfit, text.companyPrice]) expect(html).toContain(escaped(label));
    expect(html).toContain('12 / 20');
    expect(html).toContain(escaped(fmt.lotPrice(25)));
    expect(html).toContain(escaped(fmt.signedMoney(120)));
    expect(html).toContain('data-recap-fine="scandal"');
    expect(html).toContain(escaped(text.fine(text.scandalDiscovered, fmt.money(1200))));
    expect(html).toContain(escaped(text.fine(text.cartelDiscovered(getContent(lang).sectors.gadgets.name), fmt.money(250))));
    expect(html).toContain('64 → 15/100');
    expect(html).toContain(escaped(text.shadyContext(getContent(lang).shadyInfo.tax_optimisation.label)));
    expect(html).toContain(escaped(text.fineDue));
    expect(html).toContain(escaped(text.companyAction));
  });

  it('shows all offer outcomes, deliveries/penalties and OPA/merger involving the player', () => {
    const game = fixture(lang);
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const own = view.companies.find((c) => c.controllerId === 'human')!;
    const rival = view.companies.find((c) => c.controllerId === 'rival')!;
    view.self!.closeRecap!.settlements = {
      offers: (['accepted', 'declined', 'expired', 'cancelled', 'failed'] as const).map((status) => ({
        id: status, kind: 'shares' as const, turn: 1, fromId: 'human', toId: 'rival', companyId: own.id, shares: 10, price: 1, side: 'sell' as const, status,
      })),
      contracts: [{ id: 'c', sellerCompanyId: own.id, buyerCompanyId: rival.id, commodityId: 'chips', lots: 10, price: 5, turnsLeft: 0, lastDelivered: 3, lastPenalty: 70, outcome: 'partial' }],
      events: [{ event: { type: 'takeover', actorId: 'rival', subjectId: 'human' }, companyIds: [own.id], companyNames: [own.name], journalTurn: 1 },
        { event: { type: 'merger', actorId: 'human' }, companyIds: [own.id, rival.id], companyNames: [own.name, rival.name], journalTurn: 1 }],
    };
    const html = render(view, lang);
    const text = quarterCloseMessages(lang);
    for (const status of ['accepted', 'declined', 'expired', 'cancelled', 'failed'] as const) {
      expect(html).toContain('data-recap-offer="' + status + '"');
      expect(html).toContain(escaped(text.offer(text.offerKinds.shares, text.offerStates[status], 'Bob')));
    }
    expect(html).toContain(escaped(text.contract(getContent(lang).commodities.chips.name, own.name, rival.name, '3', '10', text.contractStates.partial, fmtFor(lang).money(70))));
    expect(html).toContain('data-recap-event="takeover"');
    expect(html).toContain('data-recap-event="merger"');
    expect(html).toContain(escaped(text.deals));
  });

  it('renders empty states and keeps exact history for old saves without inventing absent figures', () => {
    const game = fixture(lang);
    resolveTurn(game); resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const recap = view.self!.closeRecap!;
    recap.netWorth = recap.fortune!.netWorthBefore!;
    recap.previousNetWorth = recap.netWorth;
    recap.fortune!.holdings = [];
    recap.companies = []; recap.facts = [];
    recap.settlements = { offers: [], contracts: [], events: [] };
    const text = quarterCloseMessages(lang);
    let html = render(view, lang);
    for (const label of [text.noHoldings, text.quietFortune, text.noCompanies, text.quietSettlements]) expect(html).toContain(escaped(label));
    delete view.self!.closeRecap;
    const history = view.players[0].netWorthHistory;
    expect(latestCloseRecap(view)).toEqual({ turn: 2, netWorth: history[1], previousNetWorth: history[0], facts: [] });
    html = render(view, lang);
    expect(html).toContain(escaped(text.oldDetails));
    expect(html).toContain(text.change);
    expect(html).not.toContain('quarter-close-products');
    expect(html).not.toContain('quarter-close-breakdown');
  });

  it.each([
    ['positive', 12, 8, 5, -2, [12, 8, 5, -2, 1]],
    ['negative', -12, -20, 4, -1, [-12, -20, 4, -1, 5]],
    ['zero', 0, 20, 2, -5, [0, 20, 2, -5, -17]],
    ['rounding', 2.4, .6, .6, .6, [2, 1, 1, 1, -1]],
    ['cancelling large flows', 1.4, 2500000.4, .6, -2500000.1, [1, 2500000, 1, -2500000, 0]],
    ['negative zero', -.1, -.1, 0, 0, [0, 0, 0, 0, 0]],
  ] as const)('four causes sum exactly to displayed %s net worth change', (_name, change, sharePrices, dividendsAndBonuses, personalCosts, expected) => {
    const game = fixture(lang); resolveTurn(game);
    const view = getPlayerView(game, 'human');
    view.self!.closeRecap = { turn: 1, previousNetWorth: 0, netWorth: change,
      breakdown: { sharePrices, dividendsAndBonuses, personalCosts, otherMovements: change - sharePrices - dividendsAndBonuses - personalCosts }, facts: [] };
    const html = render(view, lang);
    const fmt = fmtFor(lang);
    const body = html.match(/<dl class="quarter-close-breakdown">(.*?)<\/dl>/)![1];
    const amounts = [...body.matchAll(/<dd>(.*?)<\/dd>/g)].map((m) => m[1]);
    expect(amounts).toEqual(expected.slice(1).map((amount) => escaped(fmt.signedMoney(amount, 'exact'))));
    const numbers = html.match(/<dl class="quarter-close-numbers">(.*?)<\/dl>/)![1];
    const delta = [...numbers.matchAll(/<dd[^>]*>(.*?)<\/dd>/g)][1][1];
    expect(delta).toBe(escaped(fmt.signedMoney(expected[0], 'exact')));
    const wholeK = (value: string) => Math.round(parseNumber(value.replace(/[k€$+]/g, ''), lang)) || 0;
    expect(amounts.reduce((sum, amount) => sum + wholeK(amount), 0)).toBe(wholeK(delta));
    expect(body).not.toMatch(/M€|Md€|\$[\d.,]+[MB]/);
    expect(amounts).not.toContain(lang === 'fr' ? '-0 k€' : '-$0k');
  });

  it('first report reconciles to the opening fortune even without a previous actual close', () => {
    const game = fixture(lang); resolveTurn(game);
    const view = getPlayerView(game, 'human'); const recap = latestCloseRecap(view)!;
    expect(recap.previousNetWorth).toBeUndefined();
    expect(recap.fortune!.netWorthBefore).toBeDefined();
    expect(render(view, lang)).toContain('quarter-close-breakdown');
    const b = displayedFortuneBreakdown(recap.netWorth - recap.fortune!.netWorthBefore!, recap.fortune!.breakdown!);
    expect(b.sharePrices + b.dividendsAndBonuses + b.personalCosts + b.otherMovements).toBe(b.total);
  });

  it('legacy facts link to correct reports/products or newspaper for a disappeared company', () => {
    const game = fixture(lang); resolveTurn(game);
    const view = getPlayerView(game, 'human'); const recap = latestCloseRecap(view)!;
    const own = view.companies.find((c) => c.controllerId === 'human')!;
    const facts: CloseRecapFact[] = [
      { type: 'bankruptcy', companyId: 'gone', companyName: 'Gone' },
      { type: 'stock', companyId: own.id, companyName: own.name, productId: own.products[0].id, productName: 'Gizmo', lots: 1 },
      { type: 'netProfit', companyId: own.id, companyName: own.name, amount: 120 },
    ];
    delete recap.companies; recap.facts = facts;
    expect(factLink(view, recap, facts[0])).toEqual({ kind: 'issue', turn: recap.turn + 1 });
    expect(factLink(view, recap, facts[1])).toEqual({ kind: 'product', companyId: own.id, productId: own.products[0].id });
    expect(factLink(view, recap, facts[2])).toEqual({ kind: 'report', companyId: own.id });
    expect(render(view, lang)).toContain(escaped(quarterCloseMessages(lang).stock('Gizmo', 1, fmtFor(lang).num(1))));
  });
});

it('no spectator or pending bot claim receives a personal report', () => {
  const game = fixture('fr'); resolveTurn(game);
  expect(render(getPlayerView(game, 'spectator'), 'fr')).toBe('');
  game.players.human.botTakeover = { previousName: 'Former bot', activeFromTurn: game.turn + 1 };
  const view = getPlayerView(game, 'human');
  expect(view.self).toBeUndefined();
  expect(latestCloseRecap(view)).toBeUndefined();
  expect(render(view, 'fr')).toBe('');
});
