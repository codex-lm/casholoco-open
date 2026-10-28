import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_COLORS, applyAction, createGame, getPlayerView, resolveTurn, type GameState, type Lang } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { JournalTab } from '../src/screens/game/JournalTab';
import { getState, setState, type AppState } from '../src/store';

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

/** Deux joueurs, avancés jusqu'à un numéro qui publie au moins deux rumeurs. */
function game(roomLang: Lang): GameState {
  const seat = (id: string, name: string, i: number) => ({
    id, name, isBot: false, companyName: `${name} SA`, sectorId: 'gadgets' as const, connected: true, color: PLAYER_COLORS[i],
  });
  const g = createGame({ seed: 11, totalTurns: 16, turnSeconds: 90, startYear: 2027, lang: roomLang }, [seat('ada', 'Ada', 0), seat('bob', 'Bob', 1)]);
  while (g.journal.at(-1)!.rumors.length < 2 && g.turn < 12) resolveTurn(g);
  expect(g.journal.at(-1)!.rumors.length).toBeGreaterThanOrEqual(2);
  g.players.ada.cash = 1e6;
  return g;
}

function journal(g: GameState, playerId: string, uiLang: Lang): string {
  const view = getPlayerView(g, playerId);
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(JournalTab, { selectedTurn: null, onSelectTurn: () => {} }) }));
}

describe.each([
  { uiLang: 'fr' as const, roomLang: 'fr' as const },
  { uiLang: 'en' as const, roomLang: 'fr' as const },
])('tuyau dans le journal : interface $uiLang, partie $roomLang', ({ uiLang, roomLang }) => {
  it('propose de vérifier chaque rumeur au tarif du joueur, puis montre le verdict à lui seul', () => {
    const g = game(roomLang);
    const ui = messages(uiLang);
    const fmt = fmtFor(roomLang);
    const n = g.journal.at(-1)!.rumors.length;
    const price = fmt.money(getPlayerView(g, 'ada').self!.rumorCheckPrice);

    const before = journal(g, 'ada', uiLang);
    expect(before.split(escaped(ui.tip.button(price))).length - 1).toBe(n);
    expect(before).toContain(`aria-label="${escaped(ui.tip.aria(price))}"`);
    expect(before).toContain(`lang="${uiLang}"`);

    expect(applyAction(g, 'ada', { type: 'checkRumor', turn: g.turn, index: 0 }).ok).toBe(true);
    const truthful = g.players.ada.rumorChecks![0].truthful;
    const after = journal(g, 'ada', uiLang);
    expect(after).toContain(escaped(truthful ? ui.tip.truthful : ui.tip.false));
    expect(after).not.toContain(escaped(ui.tip.button(price)));
    expect(after).toContain(escaped(ui.tip.used));

    // Bob ne voit ni le verdict ni la note d'Ada, et garde ses propres boutons.
    const bob = journal(g, 'bob', uiLang);
    expect(bob).not.toContain(escaped(ui.tip.truthful));
    expect(bob).not.toContain(escaped(ui.tip.false));
    expect(bob).not.toContain(escaped(ui.tip.used));
    const bobPrice = fmt.money(getPlayerView(g, 'bob').self!.rumorCheckPrice);
    expect(bob.split(escaped(ui.tip.button(bobPrice))).length - 1).toBe(n);
  });

  it('garde le verdict dans les archives, sans bouton', () => {
    const g = game(roomLang);
    const ui = messages(uiLang);
    const turn = g.turn;
    expect(applyAction(g, 'ada', { type: 'checkRumor', turn, index: 1 }).ok).toBe(true);
    const truthful = g.players.ada.rumorChecks![0].truthful;
    resolveTurn(g);
    // Le journal ouvert sur le numéro du tuyau (archives).
    const view = getPlayerView(g, 'ada');
    setState({ lang: uiLang, view, lobby: null });
    const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(JournalTab, { selectedTurn: turn, onSelectTurn: () => {} }) }));
    expect(html).toContain(escaped(truthful ? ui.tip.truthful : ui.tip.false));
    const archivePaper = html.slice(html.indexOf('<article'));
    expect(archivePaper).not.toContain('tip-btn');
  });
});
