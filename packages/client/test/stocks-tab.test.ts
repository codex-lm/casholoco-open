import { Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_COLORS, applyAction, createGame, getPlayerView, type Action, type GameState, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { MARGIN_CALL_RATIO } from '../src/rules';
import { StocksTab, personalLeverage, quoteOrder, revealStockDetail, revealStockRow } from '../src/screens/game/StocksTab';
import { stocksMessages } from '../src/screens/game/stocksMessages';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
afterEach(() => {
  setState(initial);
  vi.unstubAllGlobals();
});
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function ok(g: GameState, who: string, a: Action): void {
  const r = applyAction(g, who, a);
  expect(r.ok, r.message).toBe(true);
}

/** Ada (gadgets), Bob (yaourts), Cleo (trottinettes) ; Ada achète quelques actions de Cleo. */
function fixture(lang: Lang) {
  const g = createGame({ seed: 9, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [
    { id: 'ada', name: 'Ada', isBot: false, companyName: 'Atelier Ada', sectorId: 'gadgets', connected: true, color: PLAYER_COLORS[0] },
    { id: 'bob', name: 'Bob', isBot: false, companyName: 'Bob Corp', sectorId: 'yogurts', connected: true, color: PLAYER_COLORS[1] },
    { id: 'cleo', name: 'Cleo', isBot: false, companyName: 'Cleo SA', sectorId: 'scooters', connected: true, color: PLAYER_COLORS[2] },
  ]);
  const of = (id: string) => Object.values(g.companies).find((c) => c.founderId === id)!;
  ok(g, 'ada', { type: 'buyShares', companyId: of('cleo').id, shares: 20 });
  return { g, ada: of('ada'), bob: of('bob'), cleo: of('cleo') };
}

function render(view: PlayerView, lang: Lang, focusCompanyId: string | null = null): string {
  setState({ lang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(StocksTab, { selectedCompanyId: focusCompanyId, onSelectCompany: () => {}, focusCompanyId }) }));
}

/** Opening tag of a company's row in « La cote ». */
const rowTag = (html: string, companyId: string) => html.match(new RegExp(`<tr [^>]*data-stock-row="${companyId}"[^>]*>`))?.[0] ?? '';
const triggerTag = (html: string, companyId: string) => html.match(new RegExp(`<button [^>]*data-stock-trigger="${companyId}"[^>]*>`))?.[0] ?? '';

describe('Bourse : modèles purs', () => {
  it('classe la cote par capitalisation, les plus grosses en tête, les disparues à la fin', () => {
    const { g, cleo } = fixture('fr');
    const view = getPlayerView(g, 'ada');
    const order = quoteOrder(view.companies);
    const caps = order.filter((c) => c.status === 'active').map((c) => c.marketCap);
    expect(caps).toEqual([...caps].sort((a, b) => b - a));
    const dead = view.companies.find((c) => c.id === cleo.id)!;
    dead.status = 'bankrupt';
    expect(quoteOrder(view.companies).at(-1)!.id).toBe(cleo.id);
  });

  it('levier perso : dette sur actions + cash positif, comme l’appel de marge', () => {
    expect(personalLeverage(400, 800, 200)).toBeCloseTo(0.4);
    expect(personalLeverage(400, 1000, -500)).toBeCloseTo(0.4);
    expect(personalLeverage(100, 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe.each(['fr', 'en'] as const)('onglet Bourse (%s)', (lang) => {
  const t = messages(lang);
  const fmt = fmtFor(lang);

  it('chaque entreprise possède un bouton natif nommé et relié à la fiche ; les informations détaillées restent disponibles', () => {
    const { g } = fixture(lang);
    const view = getPlayerView(g, 'ada');
    const html = render(view, lang);
    for (const c of view.companies) {
      const trigger = triggerTag(html, c.id);
      expect(trigger).toContain('type="button"');
      expect(trigger).toContain('aria-expanded="false"');
      expect(trigger).toContain(`aria-label="${escaped(`${c.name} (${c.ticker}) · ${stocksMessages[lang].open}`)}"`);
      const detailId = trigger.match(/aria-controls="([^"]+)"/)?.[1];
      expect(detailId).toBeTruthy();
      expect(html).toContain(`id="${detailId}"`);
    }
    expect(html).toContain(escaped(stocksMessages[lang].myStake));
    expect(html).toContain(escaped(t.stocks.cols.marketCap));
    expect(html).toContain(escaped(t.stocks.cols.ceo));
    expect(html).toContain('stock-holding-value');
  });

  it('plus de statistiques répétées ni de « Mes positions » : la cote par capitalisation, mes lignes repérées avec part et valeur', () => {
    const { g, ada, cleo } = fixture(lang);
    const view = getPlayerView(g, 'ada');
    const html = render(view, lang);
    expect(html).not.toContain('class="stat-grid"');
    expect(html).not.toContain(escaped(t.topbar.portfolio));
    expect(html).not.toContain(escaped(t.topbar.netWorth));
    // Ordre de capitalisation ; mes lignes restent à leur rang, repérées (dirigée : « mine », détenue : « held »).
    const rows = html.split('<tr class="clickable').slice(1);
    const order = quoteOrder(view.companies);
    order.forEach((c, i) => expect(rows[i]).toContain(`<strong>${c.ticker}</strong>`));
    expect(rowTag(html, ada.id)).toContain('mine');
    expect(rowTag(html, cleo.id)).toContain('held');
    expect(html).not.toContain('first-unpinned');
    // « Mes actions » : nombre, part du capital et valeur au cours.
    const mine = view.companies.find((c) => c.id === cleo.id)!;
    const value = (mine.holdings.ada ?? 0) * mine.sharePrice;
    expect(rows[order.findIndex((c) => c.id === cleo.id)]).toContain(escaped(fmt.money(value)));
  });

  it('prêt perso replié tant qu’il n’y a pas de dette : le titre dit ce qui reste empruntable, sans formulaire de remboursement', () => {
    const { g } = fixture(lang);
    const view = getPlayerView(g, 'ada');
    const html = render(view, lang);
    expect(html).toContain(`<details class="tab-fold stocks-loan"><summary>${escaped(t.stocks.loanFold(fmt.money(view.personalLoanLimit)))}</summary>`);
    expect(html).toContain(escaped(t.stocks.borrowLabel));
    expect(html).not.toContain(escaped(t.stocks.repayLabel));
    // Le volet passe avant la cote.
    expect(html.indexOf('stocks-loan')).toBeLessThan(html.indexOf(`<h3>${escaped(t.stocks.title)}</h3>`));
  });

  it('avec une dette : volet ouvert, dette et seuil d’appel de marge visibles dans le titre, remboursement proposé', () => {
    const { g } = fixture(lang);
    ok(g, 'ada', { type: 'takePersonalLoan', amount: 500 });
    const view = getPlayerView(g, 'ada');
    const me = view.players.find((p) => p.id === 'ada')!;
    const html = render(view, lang);
    expect(html).toContain('<details class="tab-fold stocks-loan" open="">');
    const leverage = personalLeverage(me.debt, me.portfolioValue, me.cash);
    const summary = html.slice(html.indexOf('<summary>'), html.indexOf('</summary>'));
    expect(summary).toContain(escaped(t.stocks.debtLine(fmt.money(me.debt), fmt.pct(leverage, 0), fmt.pct(MARGIN_CALL_RATIO, 0))));
    expect(html).toContain(escaped(t.stocks.repayLabel));
  });

  it('sans entreprise, le retour en jeu reste en tête de l’onglet', () => {
    const { g, ada } = fixture(lang);
    const view = getPlayerView(g, 'ada');
    for (const c of view.companies) if (c.id === ada.id) c.controllerId = null;
    const html = render(view, lang);
    expect(html).toContain(`>${escaped(t.company.foundComeback)}</button>`);
    expect(html.indexOf(escaped(t.company.foundComeback))).toBeLessThan(html.indexOf('stocks-loan'));
  });
});

describe.each(['fr', 'en'] as const)('Bourse : arrivée par la puce d’alerte de la barre du jeu (%s)', (lang) => {
  it('choisit la ligne de l’entreprise visée, expose son bouton déplié et ouvre sa fiche sous la cote', () => {
    const { g, ada, bob } = fixture(lang);
    const view = getPlayerView(g, 'ada');
    const plain = render(view, lang);
    expect(rowTag(plain, ada.id)).not.toContain('selected');
    expect(plain.match(/<tr [^>]*data-stock-row[^>]*>/g)!.some((tag) => tag.includes('tabindex'))).toBe(false);
    expect(plain).not.toContain('company-detail');
    const html = render(view, lang, ada.id);
    const row = rowTag(html, ada.id);
    expect(row).toMatch(/class="[^"]*\bselected\b/);
    expect(row).not.toContain('tabindex');
    expect(triggerTag(html, ada.id)).toContain('aria-expanded="true"');
    expect(triggerTag(html, bob.id)).toContain('aria-expanded="false"');
    expect(html).toContain(`role="region" aria-label="${escaped(stocksMessages[lang].companyDetail(ada.name))}"`);
    expect(html).toContain(`data-stock-detail="${ada.id}" class="stock-detail-target" tabindex="-1"`);
    // Le focus passe par les boutons natifs, sans ajouter les lignes au parcours clavier.
    expect(rowTag(html, bob.id)).not.toContain('tabindex');
    expect(rowTag(html, bob.id)).not.toContain('selected');
    const detail = html.slice(html.indexOf('company-detail'));
    expect(html.indexOf('company-detail')).toBeGreaterThan(html.indexOf('</table>'));
    expect(detail).toContain(`<span class="ticker-chip">${ada.ticker}</span>`);
  });
});

describe('Bourse : ouverture externe et retour à la cote', () => {
  it('une alerte ou un bilan amène directement le focus dans la fiche ouverte après le changement d’onglet', () => {
    const frames: FrameRequestCallback[] = [];
    const detail = { scrollIntoView: vi.fn(), focus: vi.fn() };
    const querySelector = vi.fn(() => detail);
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('window', { requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback), cancelAnimationFrame });
    vi.stubGlobal('document', { querySelector });
    const cancel = revealStockDetail('c1');
    expect(querySelector).not.toHaveBeenCalled();
    frames.forEach((frame) => frame(0));
    expect(querySelector).toHaveBeenCalledWith('[data-stock-detail="c1"]');
    expect(detail.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(detail.focus).toHaveBeenCalledWith({ preventScroll: true });
    cancel();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it('au cadre suivant, la centre puis lui donne le focus sans refaire défiler ; annulable', () => {
    const frames: FrameRequestCallback[] = [];
    const trigger = { focus: vi.fn() };
    const row = { scrollIntoView: vi.fn(), querySelector: vi.fn(() => trigger) };
    const querySelector = vi.fn(() => row);
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('window', { requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback), cancelAnimationFrame });
    vi.stubGlobal('document', { querySelector });
    const cancel = revealStockRow('c1');
    expect(querySelector).not.toHaveBeenCalled();
    frames.forEach((frame) => frame(0));
    expect(querySelector).toHaveBeenCalledWith('[data-stock-row="c1"]');
    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(row.querySelector).toHaveBeenCalledWith('[data-stock-trigger]');
    expect(trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
    cancel();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });
});
