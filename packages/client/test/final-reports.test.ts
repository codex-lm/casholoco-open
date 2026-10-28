import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn, type GameState, type Lang, type PlayerView } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { lineChartMessages } from '../src/components/lineChartMessages';
import { EndScreen } from '../src/screens/EndScreen';
import { FinalReports } from '../src/screens/FinalReports';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/api', () => ({ leaveRoom: vi.fn() }));
// Keep the actual catalogues, PlayerView selectors and components; only replace
// the browser store subscription, which has no server-rendering snapshot.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function game(lang: Lang = 'fr'): GameState {
  return createGame(
    { seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [
      { id: 'me', name: 'Ada', isBot: false, companyName: 'My Original Company', sectorId: 'gadgets', connected: true, color: '#123456' },
      { id: 'rival', name: 'Ben', isBot: false, companyName: 'Rival Company', sectorId: 'yogurts', connected: true, color: '#654321' },
    ],
  );
}

function finish(state: GameState): PlayerView {
  while (state.phase === 'playing') resolveTurn(state);
  expect(state.phase).toBe('finished');
  return getPlayerView(state, 'me');
}

function render(view: PlayerView, uiLang: Lang, endScreen = false): string {
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(endScreen ? EndScreen : FinalReports) }));
}

function escaped(text: string): string {
  return renderToStaticMarkup(createElement(Fragment, null, text));
}

describe.each(['fr', 'en'] as const)('final company reports (%s)', (lang) => {
  it('opens a read-only route to the actual eighth-quarter accounts from the result screen', () => {
    const state = game(lang);
    const view = finish(state);
    const company = view.companies.find((c) => c.controllerId === view.you)!;
    const last = company.reports.at(-1)!;
    expect(last.turn).toBe(8);
    const beforeState = JSON.stringify(state);
    const beforeView = JSON.stringify(view);
    const t = messages(lang);
    const fmt = fmtFor(lang);

    const end = render(view, lang, true);
    expect(end).toContain(`<summary class="btn">${escaped(t.end.viewReports)}</summary>`);
    expect(end).toContain(escaped(t.end.home));
    expect(end).toContain(escaped(t.end.finalRanking));
    const report = render(view, lang);
    expect(report).toContain(escaped(t.end.lastReportDate(fmt.date(8, 2027))));
    expect(report).toContain(escaped(t.report.caption(fmt.date(8, 2027))));
    expect(report).toContain(escaped(t.report.netProfit));
    expect(report).toContain(escaped(last.netProfit >= 0 ? t.end.reportProfit(fmt.money(last.netProfit)) : t.end.reportLoss(fmt.money(-last.netProfit))));
    for (const product of last.products) expect(report).toContain(escaped(product.name));
    expect(report).toContain(escaped(t.report.chart));
    expect(report).not.toMatch(/<(?:button|select|textarea|form)\b/);
    // Published accounts allow only the chart's period explorer, never an economic input.
    const inputs = report.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain('type="range"');
    expect(inputs[0]).toContain('min="0"');
    expect(inputs[0]).toContain('max="7"');
    expect(inputs[0]).toContain('step="1"');
    expect(inputs[0]).toContain(`aria-label="${escaped(lineChartMessages[lang].explore(t.report.chart))}"`);
    expect(JSON.stringify(view)).toBe(beforeView);
    expect(JSON.stringify(state)).toBe(beforeState);
  });
});

describe('final-report access and privacy', () => {
  it('includes multiple controlled companies without rendering rival reports or decisions', () => {
    const state = game();
    const acquired = Object.values(state.companies).find((c) => c.founderId === null)!;
    state.players.me.cash = 1_000_000;
    expect(applyAction(state, 'me', { type: 'buyShares', companyId: acquired.id, shares: Math.floor(acquired.sharesOutstanding / 2) + 1 }).ok).toBe(true);
    const rival = Object.values(state.companies).find((c) => c.founderId === 'rival')!;
    rival.products[0].name = 'RIVAL_PRODUCT_NOT_FOR_MY_REPORT';
    const view = finish(state);
    expect(view.companies.find((c) => c.id === rival.id)?.private).toBeUndefined();

    const html = render(view, 'fr');
    expect(html).toContain(escaped('My Original Company'));
    expect(html).toContain(escaped(acquired.name));
    expect(html).not.toContain('Rival Company');
    expect(html).not.toContain('RIVAL_PRODUCT_NOT_FOR_MY_REPORT');
  });

  it('keeps a founded company’s last published accounts after bankruptcy, dated to its actual last quarter', () => {
    const state = game();
    const company = Object.values(state.companies).find((c) => c.founderId === 'me')!;
    resolveTurn(state);
    company.cash = -1_000_000;
    resolveTurn(state);
    expect(company.status).toBe('bankrupt');
    expect(company.controllerId).toBeNull();
    const view = finish(state);
    const published = view.companies.find((c) => c.id === company.id)!;
    expect(published.private).toBeUndefined();
    // Faillite en tête de la clôture du T2, faute de payer ses obligations (§5.7) : ses derniers comptes sont ceux du T1.
    const last = published.reports.at(-1)!;
    expect(last.turn).toBe(1);

    const html = render(view, 'fr');
    expect(html).toContain(escaped(company.name));
    expect(html).toContain(escaped(messages('fr').stocks.status.bankrupt));
    expect(html).toContain(escaped(messages('fr').end.lastReportDate(fmtFor('fr').date(last.turn, 2027))));
    expect(html).not.toContain(escaped(messages('fr').end.lastReportDate(fmtFor('fr').date(8, 2027))));
  });

  it('does not show the product-level report of a founded company now controlled by a rival', () => {
    const state = game();
    const company = Object.values(state.companies).find((c) => c.founderId === 'me')!;
    company.products[0].name = 'FORMER_PRODUCT_REPORT_NOT_SHOWN';
    state.players.rival.cash = 1_000_000;
    expect(applyAction(state, 'rival', { type: 'buyShares', companyId: company.id, shares: Math.floor(company.sharesOutstanding / 2) + 1 }).ok).toBe(true);
    const view = finish(state);
    expect(view.companies.find((c) => c.id === company.id)?.private).toBeUndefined();

    const html = render(view, 'fr');
    expect(html).toContain(escaped(company.name));
    expect(html).toContain(escaped(messages('fr').report.netProfit));
    expect(html).not.toContain('FORMER_PRODUCT_REPORT_NOT_SHOWN');
  });

  it('gives an explicit empty state without inventing accounts for a spectator', () => {
    const state = game('en');
    finish(state);
    const view = getPlayerView(state, 'spectator');
    const html = render(view, 'en');
    expect(html).toContain(messages('en').end.noReports);
    expect(html).not.toContain('report-table');
  });

  it('never replaces the active game with a final-quarter preview', () => {
    expect(render(getPlayerView(game(), 'me'), 'fr')).toBe('');
  });
});
