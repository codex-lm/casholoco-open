import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult, PlayerView } from '@muchomoney/core';
import type { PeerBackend } from '../src/api';
import type { HostInvitationOptions, HostPeerConnection, PeerCallbacks, PeerConnection, PeerMessage } from '../src/peer/transport';
import { createPeerAuthority } from '../src/peer/authority';
import { getState, setState } from '../src/store';
import { acceptPeerAnswer, createPeerInvite, getPeerClientState, joinPeerOffer, leavePeerGame, startPeerGame, startPeerHost } from '../src/peer/client';

const harness = vi.hoisted(() => ({
  backend: null as PeerBackend | null,
  views: [] as PlayerView[],
  hostOptions: null as HostInvitationOptions | null,
  hostConnection: null as HostPeerConnection | null,
  sent: [] as PeerMessage[],
  throwSend: false,
  earlyHostJoin: false,
  answer: null as null | ((options: PeerCallbacks) => Promise<{ code: string; connection: PeerConnection }>),
}));
vi.mock('../src/api', () => ({
  installPeerBackend: (backend: PeerBackend | null) => { harness.backend = backend; },
  receivePeerView: (view: PlayerView) => { harness.views.push(view); },
}));
vi.mock('../src/i18n', async () => {
  const store = await import('../src/store');
  return { setUiLang: (lang: 'fr' | 'en') => store.setState({ lang }) };
});
vi.mock('../src/peer/transport', () => ({
  peerErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Connection failed',
  createHostInvitation: async (options: HostInvitationOptions) => {
    harness.hostOptions = options;
    const connection: HostPeerConnection = {
      state: 'open', role: 'host', sessionId: options.sessionId, peerId: options.peerId,
      send: (message) => { harness.sent.push(message); if (harness.throwSend) throw new Error('broken channel'); },
      close: () => options.onState?.('closed'),
      acceptAnswer: async () => {},
    };
    harness.hostConnection = connection;
    if (harness.earlyHostJoin) options.onMessage({ type: 'join', name: 'Remote' });
    return { code: 'HOST_CODE', connection };
  },
  answerHostInvitation: async (_code: string, options: PeerCallbacks) => {
    if (!harness.answer) throw new Error('No guest transport fixture');
    return harness.answer(options);
  },
}));

const setup = { playerName: 'Host', companyName: 'Host Inc', sectorId: 'energy_drinks', botCount: 1,
  botLevel: 'intern', mapMode: 'classic', totalTurns: 8, lang: 'en' } as const;
const original = getState();
beforeEach(() => {
  harness.views = []; harness.sent = []; harness.hostOptions = null; harness.hostConnection = null;
  harness.throwSend = false; harness.earlyHostJoin = false; harness.answer = null;
  setState({ ...original, lang: 'en', view: null, session: null });
});
afterEach(() => { harness.throwSend = false; leavePeerGame(); setState(original); });

async function hostWithGuest() {
  await startPeerHost(setup);
  await createPeerInvite();
  harness.hostOptions!.onMessage({ type: 'join', name: 'Remote' });
  await startPeerGame();
  return harness.hostOptions!;
}

describe('peer client using real host authority', () => {
  it('binds every guest command and private snapshot to its channel rather than payload IDs', async () => {
    const connection = await hostWithGuest();
    const host = harness.views.at(-1)!;
    const hostCompany = host.companies.find((c) => c.controllerId === 'host')!;
    connection.onMessage({ type: 'action', requestId: 'steal', playerId: 'host', turn: 1,
      action: { type: 'setProductDecisions', companyId: hostCompany.id, productId: hostCompany.products[0].id, production: 1 } });
    const refusal = harness.sent.find((m) => m.type === 'result' && m.requestId === 'steal')!;
    expect((refusal.result as ActionResult).ok).toBe(false);
    const snapshots = harness.sent.filter((m) => m.type === 'snapshot').map((m) => m.snapshot as { kind: string; view?: PlayerView });
    for (const snapshot of snapshots.filter((s) => s.kind === 'game')) {
      expect(snapshot.view!.you).toBe(connection.peerId);
      expect(snapshot.view!.companies.filter((c) => c.private).every((c) => c.controllerId === connection.peerId)).toBe(true);
      expect('state' in snapshot).toBe(false);
      expect('rngState' in snapshot.view!).toBe(false);
    }
  });

  it('closes only after host and guest readiness and refuses stale or malformed requests', async () => {
    const connection = await hostWithGuest();
    await harness.backend!.ready(true, 1);
    expect(harness.views.at(-1)?.turn).toBe(1);
    connection.onMessage({ type: 'ready', requestId: 'bad-ready', ready: 'true', turn: 1 });
    expect(harness.views.at(-1)?.turn).toBe(1);
    connection.onMessage({ type: 'ready', requestId: 'ready-1', ready: true, playerId: 'host', turn: 1 });
    expect(harness.views.at(-1)?.turn).toBe(2);
    connection.onMessage({ type: 'ready', requestId: 'ready-stale', ready: true, turn: 1 });
    expect((harness.sent.at(-1)!.result as ActionResult).ok).toBe(false);
    expect(harness.views.at(-1)?.turn).toBe(2);
  });

  it('marks a broken guest disconnected without recursive broadcasts', async () => {
    const connection = await hostWithGuest();
    harness.throwSend = true;
    const before = harness.sent.length;
    expect((await harness.backend!.action({ type: 'takePersonalLoan', amount: 1 }, 1)).ok).toBe(true);
    expect(harness.sent.length - before).toBeLessThan(4);
    expect(harness.views.at(-1)!.players.find((p) => p.id === connection.peerId)?.connected).toBe(false);
    harness.throwSend = false;
    connection.onState?.('open');
    expect(harness.views.at(-1)!.players.find((p) => p.id === connection.peerId)?.connected).toBe(true);
  });

  it('handles a join message before createHostInvitation resolves', async () => {
    harness.earlyHostJoin = true;
    await startPeerHost(setup);
    await createPeerInvite();
    expect(getPeerClientState().canStart).toBe(true);
    expect(harness.sent.some((m) => m.type === 'join-result')).toBe(true);
    await acceptPeerAnswer('ANSWER_CODE');
    await startPeerGame();
    expect(harness.views.at(-1)?.turn).toBe(1);
  });

  it('does not admit gameplay commands before the join handshake', async () => {
    await startPeerHost(setup);
    await createPeerInvite();
    harness.hostOptions!.onMessage({ type: 'action', requestId: 'unjoined', playerId: 'host', turn: 1,
      action: { type: 'takePersonalLoan', amount: 100 } });
    expect(harness.sent).toEqual([]);
    expect(getPeerClientState().canStart).toBe(false);
  });

  it('queues snapshots received before the guest connection is assigned and routes guest actions', async () => {
    const authority = createPeerAuthority({ name: 'Host', lang: 'en', seed: 49, totalTurns: 8, botCount: 1 });
    authority.joinPlayer({ id: 'remote', name: 'Remote' });
    let callbacks: PeerCallbacks;
    harness.answer = async (options) => {
      callbacks = options;
      authority.subscribe((id, snapshot) => { if (id === 'remote') options.onMessage({ type: 'snapshot', snapshot }); });
      options.onState?.('open');
      options.onMessage({ type: 'snapshot', snapshot: { kind: 'lobby', lobby: authority.getLobby('remote') } });
      return { code: 'ANSWER_CODE', connection: {
        state: 'open', role: 'guest', peerId: 'remote', sessionId: authority.getSessionId(), close: () => options.onState?.('closed'),
        send: (message) => {
          if (message.type === 'join') return;
          const result = message.type === 'action'
            ? authority.applyAction('remote', message.action as Parameters<typeof authority.applyAction>[1], message.turn as number)
            : authority.ready('remote', message.ready as boolean, message.turn as number);
          options.onMessage({ type: 'result', requestId: message.requestId, result });
        },
      } };
    };
    await joinPeerOffer('OFFER_CODE', 'Remote');
    expect(getPeerClientState().phase).toBe('lobby');
    expect(getPeerClientState().answerCode).toBe('ANSWER_CODE');
    authority.startGame();
    expect(harness.views.at(-1)?.you).toBe('remote');
    expect((await harness.backend!.action({ type: 'takePersonalLoan', amount: 1 }, 1)).ok).toBe(true);
    await harness.backend!.ready(true, 1);
    authority.ready('host', true, 1);
    expect(harness.views.at(-1)?.turn).toBe(2);
    callbacks!.onState?.('closed');
    expect(getPeerClientState().phase).toBe('disconnected');
  });
});
