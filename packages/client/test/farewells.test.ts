import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_START_CASH,
  createGame,
  getContent,
  getPlayerView,
  resolveTurn,
  type FarewellOutcome,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
} from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { EndScreen } from '../src/screens/EndScreen';
import { farewellOutcome, pickFarewells } from '../src/screens/end/farewells';
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

function bot(lang: Lang, id: string, personalityId: string, color: string): LobbyPlayer {
  const pers = getContent(lang).bots.find((b) => b.id === personalityId)!;
  return {
    id,
    name: pers.ceoName,
    isBot: true,
    botPersonalityId: pers.id,
    companyName: pers.companyName,
    sectorId: pers.preferredSectors[0],
    connected: true,
    color,
  };
}

function game(lang: Lang = 'fr'): GameState {
  return createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [
    { id: 'me', name: 'Ada', isBot: false, companyName: 'My Original Company', sectorId: 'gadgets', connected: true, color: '#123456' },
    bot(lang, 'bot1', 'tweetard', '#654321'),
    bot(lang, 'bot2', 'basdelaine', '#abcdef'),
    bot(lang, 'bot3', 'delarente', '#fedcba'),
  ]);
}

function finish(state: GameState): PlayerView {
  while (state.phase === 'playing') resolveTurn(state);
  expect(state.phase).toBe('finished');
  return getPlayerView(state, 'me');
}

function render(view: PlayerView, uiLang: Lang): string {
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(EndScreen) }));
}

function escaped(text: string): string {
  return renderToStaticMarkup(createElement(Fragment, null, text));
}

describe('farewellOutcome', () => {
  it('maps rank 1 to won, ranks 2-3 to podium, rank 4+ to pack', () => {
    expect(farewellOutcome(1, 999_999, false)).toBe('won');
    expect(farewellOutcome(2, 999_999, false)).toBe('podium');
    expect(farewellOutcome(3, 999_999, false)).toBe('podium');
    expect(farewellOutcome(4, 999_999, false)).toBe('pack');
    expect(farewellOutcome(7, 999_999, false)).toBe('pack');
  });

  it('maps a company-less player under a quarter of the starting cash to ruined', () => {
    const quarter = 0.25 * PLAYER_START_CASH;
    expect(farewellOutcome(2, quarter - 1, true)).toBe('ruined');
    expect(farewellOutcome(2, quarter, true)).toBe('podium');
    expect(farewellOutcome(5, quarter - 1, true)).toBe('ruined');
    // Ruiné l'emporte sur le podium, mais seulement sans entreprise contrôlée.
    expect(farewellOutcome(2, quarter - 1, true)).toBe('ruined');
    expect(farewellOutcome(2, quarter - 1, false)).toBe('podium');
    // Le vainqueur reste le vainqueur, même ruiné sur le papier.
    expect(farewellOutcome(1, 0, true)).toBe('won');
  });
});

describe('pickFarewells', () => {
  it('is deterministic and picks the same pool index in French and English', () => {
    const frView = finish(game('fr'));
    const enView = finish(game('en'));
    const frLines = pickFarewells(frView, getContent('fr'));
    const enLines = pickFarewells(enView, getContent('en'));
    expect(frLines.length).toBeGreaterThanOrEqual(3);
    expect(frLines).toEqual(pickFarewells(frView, getContent('fr')));
    expect(enLines).toEqual(pickFarewells(enView, getContent('en')));
    expect(enLines.map((l) => l.playerId)).toEqual(frLines.map((l) => l.playerId));

    for (const lang of ['fr', 'en'] as const) {
      const view = lang === 'fr' ? frView : enView;
      const content = getContent(lang);
      const lines = lang === 'fr' ? frLines : enLines;
      const ranking = view.results!.ranking;
      for (const line of lines) {
        if (line.neutral) continue;
        const p = view.players.find((pl) => pl.id === line.playerId)!;
        const rank = ranking.findIndex((r) => r.playerId === p.id) + 1;
        const outcome: FarewellOutcome = farewellOutcome(rank, ranking[rank - 1].netWorth, p.controlledCompanyIds.length === 0);
        const pool = content.bots.find((b) => b.id === p.botPersonalityId)!.farewells[outcome];
        expect(pool.indexOf(line.text), `${lang} ${p.id}`).toBeGreaterThanOrEqual(0);
        (line as { poolIndex?: number }).poolIndex = pool.indexOf(line.text);
      }
    }
    for (let i = 0; i < frLines.length; i++) {
      expect((enLines[i] as { poolIndex?: number }).poolIndex).toBe((frLines[i] as { poolIndex?: number }).poolIndex);
    }
  });

  it('gives a neutral line to a bot taken over by a human, and never a pool line', () => {
    const state = game('fr');
    state.players.bot1.botTakeover = { previousName: 'Ancien Robot', activeFromTurn: 2 };
    const view = finish(state);
    const lines = pickFarewells(view, getContent('fr'));
    const taken = lines.find((l) => l.playerId === 'bot1')!;
    expect(taken).toEqual({ playerId: 'bot1', text: '', neutral: true });
    const others = lines.filter((l) => l.playerId !== 'bot1');
    expect(others.every((l) => !l.neutral && l.text.length > 0)).toBe(true);

    const t = messages('fr');
    const fmt = fmtFor('fr');
    const html = render(view, 'fr');
    const neutral = t.end.farewellHandover('Ancien Robot', state.players.bot1.name, fmt.date(2, 2027));
    expect(html).toContain(escaped(neutral));
    const pers = getContent('fr').bots.find((b) => b.id === 'tweetard')!;
    for (const pool of Object.values(pers.farewells)) for (const line of pool) expect(html).not.toContain(escaped(line));
  });

  it('never gives a line to a human player', () => {
    const view = finish(game('fr'));
    const lines = pickFarewells(view, getContent('fr'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const p = view.players.find((pl) => pl.id === line.playerId)!;
      expect(p.isBot, line.playerId).toBe(true);
      expect(p.botPersonalityId, line.playerId).toBeTruthy();
    }
    expect(lines.some((l) => l.playerId === 'me')).toBe(false);
  });
});

describe.each(['fr', 'en'] as const)('farewells box on the end screen (%s)', (lang) => {
  it('renders the newspaper box with one quote per bot', () => {
    const view = finish(game(lang));
    const t = messages(lang);
    const html = render(view, lang);
    expect(html).toContain(escaped(t.end.farewells));
    expect(html).toContain('class="section farewells"');
    const lines = pickFarewells(view, getContent(lang));
    for (const line of lines) expect(html).toContain(escaped(line.text));
  });
});
