import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView } from '@muchomoney/core';
import { TopBar } from '../src/screens/game/TopBar';
import { GameProvider } from '../src/hooks/useGame';
import { GuidePanel } from '../src/components/Guide';
import { getState, setState, type AppState } from '../src/store';
import { messages } from '../src/i18n';
import { peerMessages } from '../src/peer/messages';

vi.mock('../src/edition', () => ({ IS_PEER: true }));
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(select: (state: AppState) => T) => select(actual.getState()) };
});
const initial = getState();
const escape = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
afterEach(() => setState(initial));

describe.each(['fr', 'en'] as const)('peer edition readiness (%s)', (lang) => {
  it('shows connected human readiness rather than solo immediate advancement', () => {
    const game = createGame({ seed: 77, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang }, [
      { id: 'host', name: 'Ada', companyName: 'Alpha', sectorId: 'gadgets', isBot: false, connected: true, color: '#123456' },
      { id: 'guest', name: 'Ben', companyName: 'Beta', sectorId: 'yogurts', isBot: false, connected: true, color: '#654321' },
    ]);
    const view = getPlayerView(game, 'host');
    view.players.find((player) => player.id === 'guest')!.ready = true;
    setState({ lang, view, lobby: null });
    const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(TopBar) }));
    expect(html).toContain(escape(peerMessages(lang).playingPeer));
    expect(html).toContain(escape(messages(lang).topbar.readyCount(1, 2)));
    expect(html).toContain('ready-dots');
    expect(html).not.toContain('solo-ready-hint');
  });

  it('names the Direct edition and explains collective readiness in the guide', () => {
    setState({ lang, view: null, lobby: null });
    expect(messages(lang).meta.title).toBe('Casholoco Direct');
    const html = renderToStaticMarkup(createElement(GuidePanel, { section: 'basics' }));
    expect(html).toContain(escape(lang === 'fr' ? 'tous les joueurs humains connectés' : 'all connected human players'));
  });
});
