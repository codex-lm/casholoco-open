import { useSyncExternalStore } from 'react';
import type { Action, ActionResult, PlayerView, SectorId } from '@muchomoney/core';
import { installPeerBackend, receivePeerView, type StartSoloGameOptions } from '../api';
import { setUiLang } from '../i18n';
import { getState, setState } from '../store';
import { createPeerAuthority, PEER_HOST_ID, type PeerSnapshot } from './authority';
import { answerHostInvitation, createHostInvitation, peerErrorMessage,
  type HostPeerConnection, type PeerConnection, type PeerMessage } from './transport';

export interface PeerClientState {
  mode: 'idle' | 'host' | 'guest';
  phase: 'home' | 'lobby' | 'connecting' | 'playing' | 'disconnected';
  busy: boolean;
  error: string | null;
  offerCode: string;
  answerCode: string;
  players: { id: string; name: string; isBot: boolean; connected: boolean; isHost?: boolean }[];
  canStart: boolean;
}
const initial: PeerClientState = { mode: 'idle', phase: 'home', busy: false, error: null,
  offerCode: '', answerCode: '', players: [], canStart: false };
let state = initial;
const listeners = new Set<() => void>();
const update = (patch: Partial<PeerClientState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
export const getPeerClientState = () => state;
export function usePeerClient(): PeerClientState {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getPeerClientState, getPeerClientState);
}
let authority: ReturnType<typeof createPeerAuthority> | null = null;
const links = new Map<string, HostPeerConnection>();
const admitted = new Set<string>();
const failedSends = new Set<string>();
let guest: PeerConnection | null = null;
let invitation: HostPeerConnection | null = null;
let shuttingDown = false;
let generation = 0;
let requestSequence = 0;
const pending = new Map<string, { resolve: (result: ActionResult) => void; timer: ReturnType<typeof setTimeout> }>();
const words = () => getState().lang === 'en'
  ? { offline: 'The host is disconnected. This experimental game cannot continue without its host.',
    failed: 'Connection failed. Try on the same local network and exchange a fresh invitation.',
    invalid: 'That message does not belong to this game.', wait: 'Wait for a connected guest before starting.',
    timeout: 'The host did not answer. Check that its tab is still open.', expired: 'This invitation is no longer active.' }
  : { offline: 'L’hôte est déconnecté. Cette partie expérimentale ne peut pas continuer sans lui.',
    failed: 'Connexion impossible. Essayez sur le même réseau local avec une nouvelle invitation.',
    invalid: 'Ce message n’appartient pas à cette partie.', wait: 'Attendez qu’un invité soit connecté avant de lancer.',
    timeout: 'L’hôte ne répond pas. Vérifiez que son onglet est toujours ouvert.', expired: 'Cette invitation n’est plus active.' };
function failPending() {
  for (const request of pending.values()) { clearTimeout(request.timer); request.resolve({ ok: false, message: words().offline }); }
  pending.clear();
}
function clearLinks() {
  shuttingDown = true;
  generation++;
  for (const connection of links.values()) connection.close();
  guest?.close();
  links.clear(); admitted.clear(); failedSends.clear(); guest = null; invitation = null; authority = null;
  failPending();
  shuttingDown = false;
}
function snapshotForLocal(snapshot: PeerSnapshot, sessionId: string, playerId: string) {
  if (snapshot.kind === 'lobby') {
    if (snapshot.lobby.you !== playerId) return;
    update({ phase: 'lobby', players: snapshot.lobby.players.map(p => ({ ...p, isHost: p.id === PEER_HOST_ID })),
      canStart: state.mode === 'host' && snapshot.lobby.players.some(p => p.id !== PEER_HOST_ID && !p.isBot && p.connected) });
    setState({ view: null, lobby: null });
  } else {
    if (snapshot.view.you !== playerId) return;
    update({ phase: 'playing', error: null, players: snapshot.view.players.map(p => ({ ...p, isHost: p.id === PEER_HOST_ID })) });
    receivePeerView(snapshot.view, sessionId);
  }
}
function sendTo(playerId: string, message: PeerMessage) {
  const connection = links.get(playerId);
  if (!connection || connection.state !== 'open' || failedSends.has(playerId)) return;
  try { connection.send(message); }
  catch {
    // Disconnecting publishes a new snapshot. Mark the failing channel first so
    // that publication cannot recursively retry the same broken send forever.
    failedSends.add(playerId);
    authority?.setConnected(playerId, false);
  }
}
function deliver(playerId: string, snapshot: PeerSnapshot) {
  if (!authority) return;
  if (playerId === PEER_HOST_ID) snapshotForLocal(snapshot, authority.getSessionId(), PEER_HOST_ID);
  else if (admitted.has(playerId)) sendTo(playerId, { type: 'snapshot', snapshot });
}
function hostMessage(playerId: string, message: PeerMessage) {
  if (!authority) return;
  if (message.type === 'join' && !admitted.has(playerId)) {
    const result = authority.joinPlayer({ id: playerId, name: typeof message.name === 'string' ? message.name : undefined,
      companyName: typeof message.companyName === 'string' ? message.companyName : undefined,
      sectorId: typeof message.sectorId === 'string' ? message.sectorId as SectorId : undefined });
    if (result.ok) admitted.add(playerId);
    sendTo(playerId, { type: 'join-result', result });
    if (result.ok) authority.publish();
    return;
  }
  if (!admitted.has(playerId) || typeof message.requestId !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(message.requestId)) return;
  let result: ActionResult = { ok: false, message: words().invalid };
  try {
    if (message.type === 'action' && message.action && typeof message.action === 'object' && !Array.isArray(message.action)
      && Number.isInteger(message.turn)) result = authority.applyAction(playerId, message.action as Action, message.turn as number);
    else if (message.type === 'ready' && typeof message.ready === 'boolean' && Number.isInteger(message.turn))
      result = authority.ready(playerId, message.ready, message.turn as number);
  } catch { /* Invalid peer input must not stop the host. */ }
  sendTo(playerId, { type: 'result', requestId: message.requestId, result });
}
function guestMessage(message: PeerMessage, sessionId: string, playerId: string) {
  if (message.type === 'snapshot' && message.snapshot && typeof message.snapshot === 'object') {
    const snapshot = message.snapshot as PeerSnapshot;
    if (snapshot.kind === 'lobby' && snapshot.lobby && Array.isArray(snapshot.lobby.players)) snapshotForLocal(snapshot, sessionId, playerId);
    else if (snapshot.kind === 'game' && snapshot.view && Array.isArray(snapshot.view.players) && Array.isArray(snapshot.view.companies)
      && snapshot.view.config && Number.isInteger(snapshot.view.turn)) snapshotForLocal(snapshot, sessionId, playerId);
  } else if (message.type === 'result' && typeof message.requestId === 'string') {
    const request = pending.get(message.requestId);
    const result = message.result as ActionResult | undefined;
    if (request && result && typeof result.ok === 'boolean' && typeof result.message === 'string') {
      pending.delete(message.requestId); clearTimeout(request.timer); request.resolve(result);
    }
  } else if (message.type === 'join-result') {
    const result = message.result as ActionResult | undefined;
    if (result && !result.ok) update({ error: result.message, phase: 'disconnected', busy: false });
  }
}
function askHost(message: PeerMessage): Promise<ActionResult> {
  if (!guest || guest.state !== 'open') return Promise.resolve({ ok: false, message: words().offline });
  const requestId = `r-${++requestSequence}`;
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(requestId); resolve({ ok: false, message: words().timeout }); }, 15000);
    pending.set(requestId, { resolve, timer });
    try { guest!.send({ ...message, requestId }); }
    catch { clearTimeout(timer); pending.delete(requestId); resolve({ ok: false, message: words().offline }); }
  });
}
function bindBackend() {
  installPeerBackend({
    action: (action, turn) => state.mode === 'host'
      ? authority?.applyAction(PEER_HOST_ID, action, turn!) ?? { ok: false, message: words().offline }
      : askHost({ type: 'action', action, turn }),
    ready: (ready, turn) => state.mode === 'host'
      ? authority?.ready(PEER_HOST_ID, ready, turn!) ?? { ok: false, message: words().offline }
      : askHost({ type: 'ready', ready, turn }),
    leave: leavePeerGame,
  });
}
export async function startPeerHost(options: StartSoloGameOptions): Promise<void> {
  clearLinks();
  setUiLang(options.lang);
  update({ ...initial, mode: 'host', phase: 'lobby' });
  authority = createPeerAuthority({ ...options, name: options.playerName });
  authority.subscribe(deliver);
  bindBackend();
  authority.publish();
}
export async function createPeerInvite(): Promise<void> {
  if (!authority || state.mode !== 'host' || state.phase !== 'lobby') throw new Error(words().expired);
  if (state.players.length >= 8) throw new Error(getState().lang === 'fr' ? 'La partie est complète.' : 'The game is full.');
  if (invitation && !admitted.has(invitation.peerId)) { links.delete(invitation.peerId); invitation.close(); }
  invitation = null;
  update({ busy: true, error: null, offerCode: '' });
  const ticket = generation;
  const peerId = `guest-${crypto.randomUUID()}`;
  const earlyMessages: PeerMessage[] = [];
  try {
    const result = await createHostInvitation({ sessionId: authority.getSessionId(), peerId,
      onMessage: msg => {
        if (ticket !== generation) return;
        if (links.has(peerId)) hostMessage(peerId, msg);
        else if (earlyMessages.length < 16) earlyMessages.push(msg);
      },
      onState: status => {
        if (ticket !== generation || shuttingDown) return;
        if (status === 'open' && admitted.has(peerId)) { failedSends.delete(peerId); authority?.setConnected(peerId, true); }
        else if (status === 'closed' || status === 'failed') {
          if (admitted.has(peerId)) authority?.setConnected(peerId, false);
          else update({ error: words().failed, busy: false });
        }
      }, onError: error => { if (ticket === generation) update({ error: peerErrorMessage(error, getState().lang), busy: false }); },
    });
    if (ticket !== generation) { result.connection.close(); return; }
    invitation = result.connection; links.set(peerId, result.connection);
    for (const message of earlyMessages) hostMessage(peerId, message);
    update({ offerCode: result.code });
  } finally { if (ticket === generation) update({ busy: false }); }
}
export async function acceptPeerAnswer(code: string): Promise<void> {
  if (!invitation) throw new Error(words().expired);
  update({ busy: true, error: null });
  try { await invitation.acceptAnswer(code); }
  finally { update({ busy: false }); }
}
export async function joinPeerOffer(code: string, playerName: string): Promise<void> {
  clearLinks();
  update({ ...initial, mode: 'guest', phase: 'connecting', busy: true });
  const ticket = generation;
  let sentJoin = false;
  const earlyMessages: PeerMessage[] = [];
  const sendJoin = () => {
    if (!sentJoin && guest?.state === 'open') { sentJoin = true; guest.send({ type: 'join', name: playerName }); }
  };
  try {
    const result = await answerHostInvitation(code, {
      onMessage: msg => {
        if (ticket !== generation) return;
        if (guest) guestMessage(msg, guest.sessionId, guest.peerId);
        else if (earlyMessages.length < 16) earlyMessages.push(msg);
      },
      onState: status => {
        if (ticket !== generation || shuttingDown) return;
        if (status === 'open') sendJoin();
        else if (status === 'closed' || status === 'failed') { failPending(); update({ phase: 'disconnected', error: words().offline, busy: false }); }
      }, onError: error => { if (ticket === generation) update({ error: peerErrorMessage(error, getState().lang), busy: false }); },
    });
    if (ticket !== generation) { result.connection.close(); return; }
    guest = result.connection; bindBackend();
    for (const message of earlyMessages) guestMessage(message, guest.sessionId, guest.peerId);
    update({ answerCode: result.code, busy: false }); sendJoin();
  } catch (error) { if (ticket === generation) update({ error: peerErrorMessage(error, getState().lang), busy: false, phase: 'disconnected' }); throw error; }
}
export async function startPeerGame(): Promise<void> {
  if (!authority || !state.canStart) throw new Error(words().wait);
  const result = authority.startGame();
  if (!result.ok) throw new Error(result.message);
}
export function leavePeerGame(): void {
  clearLinks(); installPeerBackend(null);
  setState({ view: null, lobby: null, session: null, turnStart: null, helpOpen: false, toasts: [] });
  update(initial);
}
