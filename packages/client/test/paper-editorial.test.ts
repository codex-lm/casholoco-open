import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { JournalTab } from '../src/screens/game/JournalTab';
import { getState, setState, type AppState } from '../src/store';

// Même montage que paper-rubrics.test.ts : sélecteurs de langue réels sur le store courant.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function gameView(lang: Lang, turns = 3): PlayerView {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Compagnie Test', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  for (let t = 0; t < turns; t++) {
    const company = Object.values(game.companies).find((c) => c.controllerId === 'human');
    if (company) applyAction(game, 'human', { type: 'ceoBonus', companyId: company.id, amount: 600 });
    resolveTurn(game);
  }
  return getPlayerView(game, 'human');
}

function renderJournal(view: PlayerView, uiLang: Lang = 'fr'): string {
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(JournalTab, { selectedTurn: null, onSelectTurn: () => {} }) }));
}

/** Ce que React produit pour un texte dans le HTML statique (& < > " ' échappés). */
const escaped = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

describe('édito du journal', () => {
  for (const lang of ['fr', 'en'] as const) {
    it(`la dernière citation du numéro est étiquetée « édito », après « la citation » (${lang})`, () => {
      const view = gameView(lang);
      const t = messages(lang);
      // Le moteur pousse deux articles 'quote' par numéro : la citation d'un bot, puis l'édito
      // (le seul avec des sectorIds). On prend un numéro qui a bien les deux.
      const issue = view.journal.find((i) => i.articles.filter((a) => a.kind === 'quote').length >= 2);
      expect(issue, 'un numéro avec une citation et un édito').toBeTruthy();
      const html = renderJournal({ ...view, journal: [issue!] });
      const quote = escaped(t.journal.quote);
      const editorial = escaped(t.journal.paper.editorial);
      expect(html).toContain(quote);
      expect(html).toContain(editorial);
      expect(html.indexOf(editorial), 'l’édito après la citation').toBeGreaterThan(html.indexOf(quote));
    });
  }
});
