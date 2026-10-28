import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeerHome } from '../src/peer/PeerHome';
import { PeerControls } from '../src/peer/PeerControls';
import { peerMessages } from '../src/peer/messages';
import { getState, setState, type AppState } from '../src/store';
import { createPeerInvite, joinPeerOffer, leavePeerGame, startPeerGame, startPeerHost } from '../src/peer/client';

const peer = vi.hoisted(() => ({
  mode: 'idle' as 'idle' | 'host' | 'guest',
  phase: 'home' as 'home' | 'lobby' | 'connecting' | 'playing' | 'disconnected',
  busy: false,
  error: null as string | null,
  offerCode: '',
  answerCode: '',
  players: [] as { id: string; name: string; isBot: boolean; connected: boolean; isHost?: boolean }[],
  canStart: false,
}));
vi.mock('../src/peer/client', () => ({
  usePeerClient: () => peer,
  startPeerHost: vi.fn(async () => {}),
  createPeerInvite: vi.fn(async () => {}),
  acceptPeerAnswer: vi.fn(async () => {}),
  joinPeerOffer: vi.fn(async () => {}),
  startPeerGame: vi.fn(async () => {}),
  leavePeerGame: vi.fn(),
}));
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(select: (state: AppState) => T) => select(actual.getState()) };
});

const initial = getState();
const escape = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
beforeEach(() => {
  Object.assign(peer, { mode: 'idle', phase: 'home', busy: false, error: null, offerCode: '', answerCode: '', players: [], canStart: false });
  vi.clearAllMocks();
});
afterEach(() => setState(initial));

describe.each(['fr', 'en'] as const)('direct multiplayer interface (%s)', (lang) => {
  it('explains the limits and lets the visitor choose a role without making a connection', () => {
    setState({ lang });
    const html = renderToStaticMarkup(createElement(PeerHome));
    const m = peerMessages(lang);
    for (const text of [m.host, m.join, m.limitsTitle, m.limits, m.hostOpen]) expect(html).toContain(escape(text));
    expect(startPeerHost).not.toHaveBeenCalled();
    expect(createPeerInvite).not.toHaveBeenCalled();
    expect(joinPeerOffer).not.toHaveBeenCalled();
    expect(html).not.toMatch(/<form|type="submit"|clipboard|https?:\/\//);
  });

  it('gives the host a manual invitation and response workflow and keeps start disabled until a guest connects', () => {
    setState({ lang });
    Object.assign(peer, { mode: 'host', phase: 'lobby', offerCode: 'casholoco-offer', players: [{ id: 'h', name: 'Ada', isHost: true, isBot: false, connected: true }] });
    const html = renderToStaticMarkup(createElement(PeerHome));
    const m = peerMessages(lang);
    expect(html).toContain('casholoco-offer');
    expect(html).toContain(escape(m.inviteStep));
    expect(html).toContain(escape(m.replyStep));
    expect(html).toContain(escape(m.needGuest));
    expect(html).toContain(escape(m.selectText));
    expect(html).toMatch(new RegExp(`<button[^>]+disabled=""[^>]*>${escape(m.start)}<`));
    expect(startPeerGame).not.toHaveBeenCalled();
  });

  it('gives the guest a selectable response and explains that the host must finish the exchange', () => {
    setState({ lang });
    Object.assign(peer, { mode: 'guest', phase: 'connecting', answerCode: 'casholoco-answer' });
    const html = renderToStaticMarkup(createElement(PeerHome));
    const m = peerMessages(lang);
    expect(html).toContain('casholoco-answer');
    expect(html).toContain(escape(m.guestReplyHelp));
    expect(html).toContain(escape(m.connectingHelp));
    expect(html).toMatch(/readonly=""/i);
    expect(html).not.toContain(escape(m.start));
  });

  it('keeps disconnected guests informed instead of claiming the host will soon start', () => {
    setState({ lang });
    Object.assign(peer, { mode: 'guest', phase: 'disconnected' });
    const html = renderToStaticMarkup(createElement(PeerHome));
    const m = peerMessages(lang);
    expect(html).toContain(escape(m.connectionLost));
    expect(html).not.toContain(escape(m.waitingHost));
  });

  it('shows the host or guest role during play and never offers a private solo-save export', () => {
    setState({ lang });
    Object.assign(peer, { mode: 'host', phase: 'playing' });
    const m = peerMessages(lang);
    const host = renderToStaticMarkup(createElement(PeerControls));
    expect(host).toContain(escape(m.hostGame));
    expect(host).toContain(escape(m.closeGame));
    Object.assign(peer, { mode: 'guest' });
    const guest = renderToStaticMarkup(createElement(PeerControls));
    expect(guest).toContain(escape(m.guestGame));
    expect(guest).toContain(escape(m.leaveGame));
    expect(guest).not.toMatch(/sauvegarde|export|save/i);
    expect(leavePeerGame).not.toHaveBeenCalled();
  });
});
