import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, type Lang } from '@muchomoney/core';
import { SoloHome } from '../src/solo/SoloHome';
import { SoloControls } from '../src/solo/SoloControls';
import { GuidePanel } from '../src/components/Guide';
import { TopBar } from '../src/screens/game/TopBar';
import { GameProvider } from '../src/hooks/useGame';
import { getState, setState, type AppState } from '../src/store';
import { messages } from '../src/i18n';
import { soloMessages } from '../src/solo/messages';
import { startSoloGame, resumeSoloGame, importSoloGame, leaveRoom } from '../src/api';

const local = vi.hoisted(() => ({ saved: false, storage: true }));
vi.mock('../src/api', () => ({
  hasSavedSoloGame: () => local.saved,
  getSavedSoloGameInfo: () => local.saved ? { turn: 3, totalTurns: 16, lang: 'fr', phase: 'playing', playerName: 'Ada', mapMode: 'classic' } : null,
  startSoloGame: vi.fn(async () => ({ ok: true })),
  resumeSoloGame: vi.fn(async () => ({ ok: true })),
  exportSoloGame: () => local.saved ? '{"format":"casholoco-solo"}' : null,
  importSoloGame: vi.fn(async () => ({ ok: true })),
  soloStorageAvailable: () => local.storage,
  leaveRoom: vi.fn(),
  changeLang: vi.fn(),
  readyWhenSaved: vi.fn(async () => true),
  sendAction: vi.fn(async () => ({ ok: true })),
  setReady: vi.fn(),
}));
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
beforeEach(() => { local.saved = false; local.storage = true; vi.clearAllMocks(); });
afterEach(() => setState(initial));

describe.each(['fr', 'en'] as const)('solo interface (%s)', (lang: Lang) => {
  it('shows only local setup and exposes every supported world and bot level without starting a game', () => {
    setState({ lang, view: null, lobby: null, session: null });
    const html = renderToStaticMarkup(createElement(SoloHome));
    const m = soloMessages(lang);
    expect(html).toContain(escaped(m.newGame));
    expect(html).toContain(escaped(m.guided));
    for (const value of ['classic', 'hex', 'square', 'intern', 'normal', 'expert']) {
      expect(html).toContain(`value="${value}"`);
    }
    expect(html).toContain('value="6"');
    expect(html).not.toContain('value="7"');
    expect(html).toContain('value="24"');
    expect(html).not.toMatch(/<form|type="submit"|socket\.io|https?:\/\//);
    expect(html).not.toContain(escaped(messages(lang).home.join));
    expect(startSoloGame).not.toHaveBeenCalled();
    expect(resumeSoloGame).not.toHaveBeenCalled();
    expect(importSoloGame).not.toHaveBeenCalled();
    expect(leaveRoom).not.toHaveBeenCalled();
  });

  it('offers an existing game and warns when the browser cannot persist it', () => {
    local.saved = true;
    local.storage = false;
    setState({ lang, view: null, lobby: null, session: null });
    const html = renderToStaticMarkup(createElement(SoloHome));
    const m = soloMessages(lang);
    expect(html).toContain(escaped(m.resume));
    expect(html).toContain(escaped(m.savedAt('Ada', 3, 16)));
    expect(html).toContain(escaped(m.storageUnavailable));
    expect(html).not.toContain(escaped(m.savedAutomatically));
  });

  it('describes immediate solo quarter progression without rooms or player readiness counters', () => {
    const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang }, [
      { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
      { id: 'bot', name: 'Bot', isBot: true, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: '#654321' },
    ]);
    const view = getPlayerView(game, 'human');
    setState({ lang, view, lobby: null, session: { playerId: 'human', roomCode: 'SOLO', token: 'local' } });
    const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(TopBar) }));
    expect(html).toContain(escaped(soloMessages(lang).readyHint));
    expect(html).toContain(escaped(messages(lang).topbar.ready));
    expect(html).not.toContain('ready-dots');
    expect(html).not.toContain(escaped(messages(lang).topbar.room('SOLO')));
  });

  it('keeps the guide focused on solo play and retains the economic rules', () => {
    setState({ lang, view: null, lobby: null, session: null });
    const basics = renderToStaticMarkup(createElement(GuidePanel, { section: 'basics' }));
    const more = renderToStaticMarkup(createElement(GuidePanel, { section: 'more' }));
    expect(basics).not.toMatch(/tous les humains|every human|if the room|si le salon/);
    expect(more).not.toMatch(/choisis par l’hôte|picked by the host|latecomer|joueur arrivé en retard/);
    expect(more).toContain(escaped(messages(lang).guide.more.bots.title));
    expect(more).toContain(escaped(messages(lang).guide.more.takeover.title));
    expect(messages(lang).meta.title).toBe('Casholoco Solo');
  });

  it('offers save and home controls without any network action on render', () => {
    setState({ lang });
    const html = renderToStaticMarkup(createElement(SoloControls));
    expect(html).toContain(escaped(soloMessages(lang).home));
    expect(html).toContain(escaped(soloMessages(lang).save));
    expect(html).toContain(escaped(soloMessages(lang).savedAutomatically));
    expect(leaveRoom).not.toHaveBeenCalled();
  });
});
