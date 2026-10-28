import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getContent, getPlayerView, resolveTurn, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { JournalTab } from '../src/screens/game/JournalTab';
import { RankingTab } from '../src/screens/game/RankingTab';
import { timelineEntries } from '../src/screens/game/timeline/model';
import { getState, setState, type AppState } from '../src/store';

// Le store client n'a pas de snapshot SSR. Seul son abonnement React est remplacé :
// les sélecteurs de langue, les catalogues et le rendu du journal restent réels.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function gameView(lang: Lang): PlayerView {
  const game = createGame(
    { seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Compagnie Test', sectorId: 'gadgets', connected: true, color: '#123456' }],
  );
  resolveTurn(game);
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  expect(applyAction(game, 'human', { type: 'ceoBonus', companyId: company.id, amount: 600 }).ok).toBe(true);
  return getPlayerView(game, 'human');
}

function renderJournal(view: PlayerView, uiLang: Lang, selectedTurn?: number): string {
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(JournalTab, { selectedTurn: selectedTurn ?? null, onSelectTurn: () => {} }) }));
}

function renderRanking(view: PlayerView, uiLang: Lang): string {
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(RankingTab, { selectedTurn: null, onSelectTurn: () => {} }) }));
}

function escaped(text: string): string {
  return renderToStaticMarkup(createElement(Fragment, null, text));
}

describe.each([
  { uiLang: 'en' as const, roomLang: 'fr' as const },
  { uiLang: 'fr' as const, roomLang: 'en' as const },
])('journal : interface $uiLang, partie $roomLang', ({ uiLang, roomLang }) => {
  it('garde le chapeau, les rubriques, les matières et la fiabilité dans la langue des articles', () => {
    const view = gameView(roomLang);
    const issue = view.journal.at(-1)!;
    const html = renderJournal(view, uiLang);
    const paper = html.slice(html.indexOf('<article'));
    const room = messages(roomLang);
    const ui = messages(uiLang);

    expect(paper).toMatch(new RegExp(`<article\\b[^>]*\\blang="${roomLang}"`));
    // Les données du moteur exercent réellement toutes les rubriques, dont les flashs.
    expect(new Set(issue.articles.map((a) => a.kind))).toEqual(new Set(['headline', 'news', 'results', 'quote', 'flash']));
    expect(issue.rumors.length).toBeGreaterThan(0);
    for (const key of ['front', 'briefs', 'results', 'quote', 'rumors', 'flash'] as const) {
      expect.soft(paper, key).toContain(escaped(room.journal[key]));
      expect.soft(paper, `${key} dans la langue d'interface`).not.toContain(escaped(ui.journal[key]));
    }
    for (const label of [room.common.paperName, room.journal.motto, room.journal.today, room.journal.issueNo(issue.turn), room.journal.disclaimer]) {
      expect.soft(paper).toContain(escaped(label));
    }
    expect.soft(paper).not.toContain(escaped(ui.common.paperName));
    expect(paper).toContain(escaped(issue.dateLabel));

    const ticker = paper.match(/<div class="paper-ticker[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(ticker).not.toBe('');
    for (const commodity of view.commodities) {
      const expectedName = getContent(roomLang).commodities[commodity.id].name;
      const otherName = getContent(uiLang).commodities[commodity.id].name;
      expect.soft(ticker).toContain(escaped(expectedName));
      if (expectedName !== otherName) expect.soft(ticker).not.toContain(escaped(otherName));
    }

    expect.soft(paper).toContain(escaped(room.journal.reliability));
    expect.soft(paper).not.toContain(escaped(ui.journal.reliability));
    for (const rumor of issue.rumors) {
      expect.soft(paper).toContain(`aria-label="${escaped(room.reliability[rumor.reliability])}"`);
      expect(paper).toContain(escaped(room.quote(rumor.text)));
    }
    for (const article of issue.articles) {
      expect(paper).toContain(escaped(article.title));
      if (article.body) expect(paper).toContain(escaped(article.body));
    }
    expect(getState().lang).toBe(uiLang);
  });

  it('remplace la frise par la barre de numéros (langue de l’interface) ; la frise passe au classement', () => {
    const view = gameView(roomLang);
    const ui = messages(uiLang);
    const html = renderJournal(view, uiLang);
    // La frise n'est plus dans le journal : plus de colonnes ni de filtres de la chronologie.
    expect(html).not.toContain('tl-strip');
    expect(html).not.toContain(escaped(ui.history.title));
    // À la place, la barre de numéros, entièrement dans la langue de l'interface.
    const nav = html.match(/<div class="issue-nav" lang="([^"]*)">([\s\S]*?)<\/div>/);
    expect(nav?.[1]).toBe(uiLang);
    const bar = nav?.[2] ?? '';
    // Un numéro par option, le plus récent d'abord, libellé avec sa date.
    const options = [...bar.matchAll(/<option value="(\d+)"[^>]*>([\s\S]*?)<\/option>/g)];
    expect(options.map((o) => Number(o[1]))).toEqual(view.journal.map((i) => i.turn).reverse());
    for (const o of options) {
      const turn = Number(o[1]);
      const issue = view.journal.find((i) => i.turn === turn)!;
      expect(o[2]).toContain(escaped(ui.journal.nav.issue(turn, issue.dateLabel)));
    }
    // « · vous concerne » sur les numéros dont un événement me lie ; « (édition du jour) » sur le dernier.
    const mine = new Set(timelineEntries(view).filter((e) => e.role !== null).map((e) => e.turn));
    expect(mine.size).toBeGreaterThan(0);
    for (const o of options) {
      const turn = Number(o[1]);
      const isLatest = turn === view.journal.at(-1)!.turn;
      expect(o[2].includes(` (${ui.journal.today})`)).toBe(isLatest);
      expect(o[2].includes(ui.journal.nav.concernsYou)).toBe(mine.has(turn));
    }
    // Édition du jour affichée : ◀ actif, pas de bouton « retour à l'édition du jour ».
    expect(bar).toContain(`aria-label="${escaped(ui.journal.nav.prev)}"`);
    expect(bar).not.toContain(escaped(ui.journal.nav.today));

    // Sur le N° 1, ◀ est désactivé et le retour à l'édition du jour apparaît.
    const archive = renderJournal(view, uiLang, 1);
    const archiveNav = archive.match(/<div class="issue-nav"[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(archiveNav).toContain(`aria-label="${escaped(ui.journal.nav.prev)}" disabled=""`);
    expect(archiveNav).not.toContain(`aria-label="${escaped(ui.journal.nav.next)}" disabled=""`);
    expect(archiveNav).toContain(escaped(ui.journal.nav.today));

    // Les colonnes de la frise (une par trimestre de la partie) ont déménagé sous le graphe des fortunes.
    const ranking = renderRanking(view, uiLang);
    const frieze = ranking.slice(ranking.indexOf('rc-frieze-wrap'));
    expect(frieze).toContain(`aria-label="${escaped(ui.history.stripAria)}"`);
    expect(frieze.match(/class="rc-date[ "]/g)?.length).toBe(view.config.totalTurns);
    // Cliquables jusqu'au trimestre en cours seulement (colonnes transparentes, pas des boutons).
    expect(frieze.match(/fill="transparent"/g)?.length).toBe(view.turn);

    const empty = renderJournal({ ...view, journal: [] }, uiLang);
    expect(empty).toContain(escaped(ui.journal.firstIssue));
    expect(empty).not.toContain('<article');
    expect(empty).not.toContain('issue-nav');
    expect(getState().lang).toBe(uiLang);
  });

  it('localise aussi les rubriques sans articles ni rumeurs dans la langue de la partie', () => {
    const view = gameView(roomLang);
    const issue = { ...view.journal.at(-1)!, articles: [], rumors: [] };
    const html = renderJournal({ ...view, journal: [issue] }, uiLang);
    const room = messages(roomLang);
    for (const key of ['nothingTitle', 'nothingBody', 'noResults', 'noRumors'] as const) {
      expect.soft(html, key).toContain(escaped(room.journal[key]));
    }
  });
});
