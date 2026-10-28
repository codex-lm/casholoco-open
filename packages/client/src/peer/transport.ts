import { decodeBase64, decodePeerSignal, encodeBase64, encodePeerSignal, PEER_ID_PATTERN, PeerError,
  type PeerRole, type PeerSignal } from './signal';

export { PeerError, peerErrorMessage } from './signal';
export type PeerConnectionState = 'opening' | 'open' | 'closed' | 'failed';
export type PeerMessage = Record<string, unknown>;
export const MAX_PEER_MESSAGE_BYTES = 4 * 1024 * 1024;
export const MAX_PEER_BUFFER_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 9000;
const MAX_CHUNKS = Math.ceil(MAX_PEER_MESSAGE_BYTES / CHUNK_BYTES);
const MAX_FRAME_CHARACTERS = 12_200;
const CHANNEL_LABEL = 'casholoco';
const CHANNEL_PROTOCOL = 'casholoco-peer/1';

export interface PeerCallbacks {
  onMessage: (message: PeerMessage) => void;
  onState?: (state: PeerConnectionState) => void;
  onError?: (error: PeerError) => void;
}
export interface PeerTransportOptions extends PeerCallbacks {
  /** Test seam only. Production always constructs RTCPeerConnection with no ICE servers. */
  createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection;
  gatheringTimeoutMs?: number;
  connectionTimeoutMs?: number;
  invitationTimeoutMs?: number;
  messageTimeoutMs?: number;
}
export interface HostInvitationOptions extends PeerTransportOptions { sessionId: string; peerId: string }
export interface PeerConnection {
  readonly sessionId: string;
  readonly peerId: string;
  readonly role: PeerRole;
  readonly state: PeerConnectionState;
  send(message: PeerMessage): void;
  close(): void;
}
export interface HostPeerConnection extends PeerConnection { acceptAnswer(code: string): Promise<void> }

type Timer = ReturnType<typeof setTimeout>;
interface PendingMessage { id: number; count: number; next: number; bytes: number; chunks: Uint8Array[] }

function duration(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.min(600_000, value)) : fallback;
}
function safeCallback(callback: (() => void) | undefined): void {
  try { callback?.(); } catch { /* Application callbacks must not leave RTC resources open. */ }
}
function jsonObject(value: unknown): value is PeerMessage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (++visited > 150_000 || item.depth > 40) return false;
    const entry = item.value;
    // Optional view fields are omitted by JSON.stringify; they are normal in PlayerView.
    if (entry === undefined || entry === null || typeof entry === 'string' || typeof entry === 'boolean') continue;
    if (typeof entry === 'number') { if (!Number.isFinite(entry)) return false; continue; }
    if (typeof entry !== 'object') return false;
    if (!Array.isArray(entry) && Object.getPrototypeOf(entry) !== Object.prototype && Object.getPrototypeOf(entry) !== null) return false;
    for (const [key, child] of Object.entries(entry)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
      stack.push({ value: child, depth: item.depth + 1 });
    }
  }
  return true;
}

/** A single host↔guest link. Create another invitation for every additional guest. */
class ManualPeer implements HostPeerConnection {
  readonly sessionId: string;
  readonly peerId: string;
  readonly role: PeerRole;
  private currentState: PeerConnectionState = 'opening';
  private readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private readonly cleanup: (() => void)[] = [];
  private readonly pendingRejects = new Set<(error: PeerError) => void>();
  private invitationTimer: Timer | undefined;
  private connectionTimer: Timer | undefined;
  private messageTimer: Timer | undefined;
  private pending: PendingMessage | null = null;
  private sentSequence = 0;
  private receivedSequence = 0;
  private answered = false;
  private answering = false;

  constructor(role: PeerRole, sessionId: string, peerId: string, private readonly options: PeerTransportOptions) {
    this.role = role;
    this.sessionId = sessionId;
    this.peerId = peerId;
    if (!PEER_ID_PATTERN.test(sessionId) || !PEER_ID_PATTERN.test(peerId)) throw new PeerError('SIGNAL_INVALID');
    const factory = options.createPeerConnection ?? (typeof RTCPeerConnection === 'function' ? () => new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 }) : null);
    if (!factory) throw new PeerError('UNSUPPORTED');
    // No game server, signalling service, STUN or TURN endpoint is contacted.
    this.pc = factory({ iceServers: [], iceCandidatePoolSize: 0 });
    this.listen(this.pc, 'connectionstatechange', () => {
      if (this.currentState === 'closed' || this.currentState === 'failed') return;
      if (this.pc.connectionState === 'failed') this.fail(new PeerError('CONNECTION_FAILED'));
      else if (this.pc.connectionState === 'closed') this.close();
      else if (this.pc.connectionState === 'disconnected') { this.changeState('opening'); this.startConnectionTimer(); }
      else if (this.pc.connectionState === 'connected' && this.channel?.readyState === 'open') this.open();
    });
    this.listen(this.pc, 'datachannel', event => {
      const incoming = (event as RTCDataChannelEvent).channel;
      if (role !== 'guest' || this.channel) { incoming.close(); this.fail(new PeerError('CHANNEL_INVALID')); return; }
      this.attachChannel(incoming);
    });
    safeCallback(() => this.options.onState?.('opening'));
  }

  get state(): PeerConnectionState { return this.currentState; }
  private listen(target: EventTarget, event: string, listener: EventListener): void {
    target.addEventListener(event, listener);
    this.cleanup.push(() => target.removeEventListener(event, listener));
  }
  private changeState(state: PeerConnectionState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    safeCallback(() => this.options.onState?.(state));
  }
  private assertActive(): void {
    if (this.currentState === 'closed' || this.currentState === 'failed') throw new PeerError('CONNECTION_CLOSED');
  }
  private attachChannel(channel: RTCDataChannel): void {
    if (channel.label !== CHANNEL_LABEL || channel.protocol !== CHANNEL_PROTOCOL || !channel.ordered ||
        channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null) {
      channel.close(); this.fail(new PeerError('CHANNEL_INVALID')); return;
    }
    this.channel = channel;
    this.listen(channel, 'open', () => this.open());
    this.listen(channel, 'close', () => this.close());
    this.listen(channel, 'error', () => this.fail(new PeerError('CONNECTION_FAILED')));
    this.listen(channel, 'message', event => this.receive((event as MessageEvent).data));
    if (channel.readyState === 'open') this.open();
  }
  private open(): void {
    if (this.currentState === 'closed' || this.currentState === 'failed') return;
    clearTimeout(this.invitationTimer);
    clearTimeout(this.connectionTimer);
    this.changeState('open');
  }
  private startConnectionTimer(): void {
    clearTimeout(this.connectionTimer);
    this.connectionTimer = setTimeout(() => this.fail(new PeerError('CONNECTION_TIMEOUT')), duration(this.options.connectionTimeoutMs, 120_000));
  }
  private release(error: PeerError): void {
    clearTimeout(this.invitationTimer);
    clearTimeout(this.connectionTimer);
    clearTimeout(this.messageTimer);
    this.pending = null;
    for (const reject of this.pendingRejects) reject(error);
    this.pendingRejects.clear();
    for (const cleanup of this.cleanup.splice(0)) cleanup();
    try { this.channel?.close(); } catch { /* Already closed by the browser. */ }
    try { this.pc.close(); } catch { /* Already closed by the browser. */ }
  }
  private fail(error: PeerError): void {
    if (this.currentState === 'closed' || this.currentState === 'failed') return;
    this.changeState('failed');
    this.release(error);
    safeCallback(() => this.options.onError?.(error));
  }
  close(): void {
    if (this.currentState === 'closed' || this.currentState === 'failed') return;
    this.changeState('closed');
    this.release(new PeerError('CONNECTION_CLOSED'));
  }
  private waitForIce(): Promise<void> {
    this.assertActive();
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error?: PeerError) => {
        clearTimeout(timer);
        this.pc.removeEventListener('icegatheringstatechange', changed);
        this.pendingRejects.delete(failed);
        if (error) reject(error); else resolve();
      };
      const changed = () => { if (this.pc.iceGatheringState === 'complete') finish(); };
      const failed = (error: PeerError) => finish(error);
      const timer = setTimeout(() => finish(new PeerError('GATHERING_TIMEOUT')), duration(this.options.gatheringTimeoutMs, 12_000));
      this.pendingRejects.add(failed);
      this.pc.addEventListener('icegatheringstatechange', changed);
      changed();
    });
  }
  private signal(): string {
    this.assertActive();
    const description = this.pc.localDescription;
    if (!description || !description.sdp) throw new PeerError('SIGNALING_FAILED');
    return encodePeerSignal({ format: 'casholoco-peer', version: 1, role: this.role,
      sessionId: this.sessionId, peerId: this.peerId,
      description: { type: this.role === 'host' ? 'offer' : 'answer', sdp: description.sdp } });
  }
  async offer(): Promise<string> {
    try {
      this.attachChannel(this.pc.createDataChannel(CHANNEL_LABEL, { ordered: true, protocol: CHANNEL_PROTOCOL }));
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this.waitForIce();
      const code = this.signal();
      this.invitationTimer = setTimeout(() => this.fail(new PeerError('INVITATION_EXPIRED')), duration(this.options.invitationTimeoutMs, 600_000));
      return code;
    } catch (error) {
      const failure = error instanceof PeerError ? error : new PeerError('SIGNALING_FAILED');
      this.fail(failure); throw failure;
    }
  }
  async answer(offer: PeerSignal): Promise<string> {
    try {
      await this.pc.setRemoteDescription(offer.description);
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this.waitForIce();
      this.startConnectionTimer();
      return this.signal();
    } catch (error) {
      const failure = error instanceof PeerError ? error : new PeerError('SIGNALING_FAILED');
      this.fail(failure); throw failure;
    }
  }
  async acceptAnswer(code: string): Promise<void> {
    this.assertActive();
    if (this.role !== 'host' || this.answered || this.answering) throw new PeerError('WRONG_ROLE');
    // A paste error does not consume a valid invitation; validation happens first.
    const answer = decodePeerSignal(code, { role: 'guest', sessionId: this.sessionId, peerId: this.peerId });
    this.answering = true;
    try {
      await this.pc.setRemoteDescription(answer.description);
      this.answered = true;
      clearTimeout(this.invitationTimer);
      if (this.currentState !== 'open') this.startConnectionTimer();
    } catch { const failure = new PeerError('SIGNALING_FAILED'); this.fail(failure); throw failure; }
    finally { this.answering = false; }
  }
  send(message: PeerMessage): void {
    this.assertActive();
    if (this.currentState !== 'open' || this.channel?.readyState !== 'open') throw new PeerError('CONNECTION_CLOSED');
    if (!jsonObject(message)) throw new PeerError('MESSAGE_INVALID');
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    if (bytes.byteLength > MAX_PEER_MESSAGE_BYTES) throw new PeerError('MESSAGE_TOO_LARGE');
    // Bounded reliable frames also work when a browser's SCTP message limit is 64 KiB.
    if (this.channel.bufferedAmount + bytes.byteLength * 1.4 + 100_000 > MAX_PEER_BUFFER_BYTES) throw new PeerError('SEND_BACKPRESSURE');
    const count = Math.ceil(bytes.byteLength / CHUNK_BYTES);
    const id = ++this.sentSequence;
    if (!Number.isSafeInteger(id)) throw new PeerError('MESSAGE_INVALID');
    try {
      for (let index = 0; index < count; index++) {
        this.channel.send(JSON.stringify({ v: 1, id, index, count,
          data: encodeBase64(bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)) }));
      }
    } catch { const failure = new PeerError('CONNECTION_FAILED'); this.fail(failure); throw failure; }
  }
  private receive(data: unknown): void {
    try {
      if (typeof data !== 'string' || data.length > MAX_FRAME_CHARACTERS) throw new PeerError('MESSAGE_INVALID');
      const frame: unknown = JSON.parse(data);
      if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new PeerError('MESSAGE_INVALID');
      const f = frame as Record<string, unknown>;
      if (Object.keys(f).length !== 5 || Object.keys(f).some(k => !['v', 'id', 'index', 'count', 'data'].includes(k))) throw new PeerError('MESSAGE_INVALID');
      if (f.v !== 1 || !Number.isSafeInteger(f.id) || !Number.isInteger(f.index) || !Number.isInteger(f.count) ||
          (f.count as number) < 1 || (f.count as number) > MAX_CHUNKS ||
          (f.index as number) < 0 || (f.index as number) >= (f.count as number) ||
          typeof f.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(f.data) || f.data.length > 12_000) throw new PeerError('MESSAGE_INVALID');
      const id = f.id as number, index = f.index as number, count = f.count as number;
      if (!this.pending) {
        if (index !== 0 || id !== this.receivedSequence + 1) throw new PeerError('MESSAGE_INVALID');
        this.pending = { id, count, next: 0, bytes: 0, chunks: [] };
        this.messageTimer = setTimeout(() => this.fail(new PeerError('MESSAGE_TIMEOUT')), duration(this.options.messageTimeoutMs, 30_000));
      }
      const pending = this.pending;
      if (pending.id !== id || pending.count !== count || pending.next !== index) throw new PeerError('MESSAGE_INVALID');
      const chunk = decodeBase64(f.data);
      if (chunk.byteLength > CHUNK_BYTES || (index < count - 1 && chunk.byteLength !== CHUNK_BYTES)) throw new PeerError('MESSAGE_INVALID');
      pending.bytes += chunk.byteLength;
      if (pending.bytes > MAX_PEER_MESSAGE_BYTES) throw new PeerError('MESSAGE_TOO_LARGE');
      pending.chunks.push(chunk);
      pending.next++;
      if (pending.next !== count) return;
      clearTimeout(this.messageTimer);
      const messageBytes = new Uint8Array(pending.bytes);
      let offset = 0;
      for (const part of pending.chunks) { messageBytes.set(part, offset); offset += part.byteLength; }
      this.pending = null;
      const message: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(messageBytes));
      if (!jsonObject(message)) throw new PeerError('MESSAGE_INVALID');
      this.receivedSequence = id;
      this.options.onMessage(message);
    } catch (error) { this.fail(error instanceof PeerError && error.code.startsWith('MESSAGE_') ? error : new PeerError('MESSAGE_INVALID')); }
  }
}

export async function createHostInvitation(options: HostInvitationOptions): Promise<{ code: string; connection: HostPeerConnection }> {
  const connection = new ManualPeer('host', options.sessionId, options.peerId, options);
  return { code: await connection.offer(), connection };
}

export async function answerHostInvitation(code: string, options: PeerTransportOptions): Promise<{ code: string; connection: PeerConnection }> {
  const offer = decodePeerSignal(code, { role: 'host' });
  const connection = new ManualPeer('guest', offer.sessionId, offer.peerId, options);
  return { code: await connection.answer(offer), connection };
}
