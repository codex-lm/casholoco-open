import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerHostInvitation, createHostInvitation, MAX_PEER_MESSAGE_BYTES, PeerError, type PeerConnection } from '../src/peer/transport';
import { decodePeerSignal, encodePeerSignal } from '../src/peer/signal';

const sdp = 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=ice-ufrag:local\r\na=ice-pwd:abcdefghijklmnopqrstuv\r\na=fingerprint:sha-256 AA:BB:CC\r\na=candidate:1 1 UDP 2122260223 example.local 12345 typ host\r\na=end-of-candidates\r\n';

class FakeChannel extends EventTarget {
  label = 'casholoco'; protocol = 'casholoco-peer/1'; ordered = true;
  maxRetransmits = null; maxPacketLifeTime = null;
  readyState = 'connecting'; bufferedAmount = 0; sent: string[] = [];
  partner?: FakeChannel;
  send(value: string) { this.sent.push(value); this.partner?.dispatchEvent(new MessageEvent('message', { data: value })); }
  open() { this.readyState = 'open'; this.dispatchEvent(new Event('open')); }
  close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; this.dispatchEvent(new Event('close')); }
}
class FakePeer extends EventTarget {
  connectionState = 'new'; iceGatheringState = 'complete';
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  channel = new FakeChannel(); channels: unknown[] = []; closed = false;
  configuration?: RTCConfiguration;
  delayIce = false;
  createDataChannel(label: string, options: RTCDataChannelInit) { this.channels.push({ label, options }); return this.channel; }
  async createOffer() { return { type: 'offer', sdp } as RTCSessionDescriptionInit; }
  async createAnswer() { return { type: 'answer', sdp } as RTCSessionDescriptionInit; }
  async setLocalDescription(description: { type: string; sdp?: string }) {
    this.localDescription = { type: description.type, sdp: description.sdp ?? sdp };
    if (this.delayIce) this.iceGatheringState = 'gathering';
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) { this.remoteDescription = description; }
  completeIce() { this.iceGatheringState = 'complete'; this.dispatchEvent(new Event('icegatheringstatechange')); }
  receiveChannel(channel: FakeChannel) { const event = new Event('datachannel'); Object.assign(event, { channel }); this.dispatchEvent(event); }
  close() { this.closed = true; this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')); }
  factory = (configuration: RTCConfiguration) => { this.configuration = configuration; return this as unknown as RTCPeerConnection; };
}
const links: PeerConnection[] = [];
afterEach(() => { links.splice(0).forEach(link => link.close()); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function host(pc = new FakePeer(), overrides = {}) {
  const result = await createHostInvitation({ sessionId: 'game-1', peerId: 'guest-1', onMessage: vi.fn(), createPeerConnection: pc.factory, ...overrides });
  links.push(result.connection);
  return { ...result, pc };
}
async function pair() {
  const receivedHost = vi.fn(), receivedGuest = vi.fn();
  const h = await host(new FakePeer(), { onMessage: receivedHost });
  const pc = new FakePeer();
  const g = await answerHostInvitation(h.code, { onMessage: receivedGuest, createPeerConnection: pc.factory });
  links.push(g.connection);
  await h.connection.acceptAnswer(g.code);
  const guestChannel = new FakeChannel();
  pc.receiveChannel(guestChannel);
  h.pc.channel.partner = guestChannel; guestChannel.partner = h.pc.channel;
  h.pc.channel.open(); guestChannel.open();
  return { h, g, guestChannel, pc, receivedHost, receivedGuest };
}

describe('manual direct transport', () => {
  it('uses no ICE servers and creates one ordered, reliable data channel', async () => {
    const h = await host();
    expect(h.pc.configuration).toEqual({ iceServers: [], iceCandidatePoolSize: 0 });
    expect(h.pc.channels).toEqual([{ label: 'casholoco', options: { ordered: true, protocol: 'casholoco-peer/1' } }]);
    expect(decodePeerSignal(h.code)).toMatchObject({ role: 'host', sessionId: 'game-1', peerId: 'guest-1', description: { type: 'offer', sdp } });
  });
  it('waits for complete candidate gathering before giving the user a code', async () => {
    const pc = new FakePeer(); pc.delayIce = true;
    const pending = host(pc); const done = vi.fn(); void pending.then(done);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    pc.completeIce(); await pending;
    expect(done).toHaveBeenCalledOnce();
  });
  it('times out candidate gathering and releases the connection', async () => {
    vi.useFakeTimers(); const pc = new FakePeer(); pc.delayIce = true;
    const promise = host(pc, { gatheringTimeoutMs: 20 });
    const rejected = expect(promise).rejects.toMatchObject({ code: 'GATHERING_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(21); await rejected;
    expect(pc.closed).toBe(true);
  });
  it('an unreturned invitation expires and reports a safe error', async () => {
    vi.useFakeTimers(); const onError = vi.fn();
    const h = await host(new FakePeer(), { invitationTimeoutMs: 20, onError });
    await vi.advanceTimersByTimeAsync(21);
    expect(h.connection.state).toBe('failed'); expect(h.pc.closed).toBe(true);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITATION_EXPIRED' }));
  });
  it('checks the matching answer without consuming an invitation on a paste error', async () => {
    const h = await host(); const signal = decodePeerSignal(h.code);
    const answer = { ...signal, role: 'guest' as const, description: { type: 'answer' as const, sdp } };
    await expect(h.connection.acceptAnswer(encodePeerSignal({ ...answer, peerId: 'guest-2' }))).rejects.toMatchObject({ code: 'WRONG_PEER' });
    expect(h.pc.remoteDescription).toBeNull();
    await h.connection.acceptAnswer(encodePeerSignal(answer));
    expect(h.pc.remoteDescription?.type).toBe('answer');
    await expect(h.connection.acceptAnswer(encodePeerSignal(answer))).rejects.toMatchObject({ code: 'WRONG_ROLE' });
  });
  it('times out an accepted answer that never opens a direct channel', async () => {
    vi.useFakeTimers(); const h = await host(new FakePeer(), { connectionTimeoutMs: 20 });
    const signal = decodePeerSignal(h.code);
    await h.connection.acceptAnswer(encodePeerSignal({ ...signal, role: 'guest', description: { type: 'answer', sdp } }));
    await vi.advanceTimersByTimeAsync(21);
    expect(h.connection.state).toBe('failed'); expect(h.pc.closed).toBe(true);
  });
  it('sends object messages both ways, including Unicode and repeated references', async () => {
    const p = await pair(); const shared = { quantity: 3 };
    p.h.connection.send({ action: 'produire', company: 'Crème fraîche', one: shared, two: shared });
    expect(p.receivedGuest).toHaveBeenCalledWith({ action: 'produire', company: 'Crème fraîche', one: { quantity: 3 }, two: { quantity: 3 } });
    p.g.connection.send({ ready: true, turn: 2 });
    expect(p.receivedHost).toHaveBeenCalledWith({ ready: true, turn: 2 });
  });
  it('omits optional undefined view fields using the normal JSON representation', async () => {
    const p = await pair();
    p.h.connection.send({ kind: 'game', view: { turn: 1, turnEndsAt: undefined, rows: [{ value: 2 }] } });
    expect(p.receivedGuest).toHaveBeenCalledExactlyOnceWith({ kind: 'game', view: { turn: 1, rows: [{ value: 2 }] } });
  });
  it('chunks a large view into small reliable messages and delivers it only once complete', async () => {
    const p = await pair(); const message = { view: 'é'.repeat(60_000), turn: 24 };
    p.h.connection.send(message);
    expect(p.h.pc.channel.sent.length).toBeGreaterThan(10);
    expect(Math.max(...p.h.pc.channel.sent.map(x => x.length))).toBeLessThan(12_200);
    expect(p.receivedGuest).toHaveBeenCalledExactlyOnceWith(message);
  });
  it('rejects non-finite numbers, cycles, oversized payloads and excessive queued data', async () => {
    const p = await pair(); const circular: Record<string, unknown> = {}; circular.self = circular;
    expect(() => p.h.connection.send({ value: Infinity })).toThrow(expect.objectContaining({ code: 'MESSAGE_INVALID' }));
    expect(() => p.h.connection.send(circular)).toThrow(expect.objectContaining({ code: 'MESSAGE_INVALID' }));
    expect(() => p.h.connection.send({ value: 'x'.repeat(MAX_PEER_MESSAGE_BYTES) })).toThrow(expect.objectContaining({ code: 'MESSAGE_TOO_LARGE' }));
    p.h.pc.channel.bufferedAmount = 8 * 1024 * 1024;
    expect(() => p.h.connection.send({ value: 1 })).toThrow(expect.objectContaining({ code: 'SEND_BACKPRESSURE' }));
    expect(p.receivedGuest).not.toHaveBeenCalled();
  });
  it('closes on malformed, oversized or replayed frames', async () => {
    const p = await pair(); p.h.connection.send({ value: 1 });
    const replay = p.h.pc.channel.sent[0];
    p.guestChannel.dispatchEvent(new MessageEvent('message', { data: replay }));
    expect(p.g.connection.state).toBe('failed');
    expect(p.receivedGuest).toHaveBeenCalledTimes(1);
  });
  it('does not keep partial messages indefinitely', async () => {
    vi.useFakeTimers(); const h = await host(); const pc = new FakePeer(); const onError = vi.fn();
    const g = await answerHostInvitation(h.code, { onMessage: vi.fn(), onError, messageTimeoutMs: 20, createPeerConnection: pc.factory }); links.push(g.connection);
    const channel = new FakeChannel(); pc.receiveChannel(channel); channel.open();
    channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ v: 1, id: 1, index: 0, count: 2, data: btoa('a'.repeat(9000)) }) }));
    await vi.advanceTimersByTimeAsync(21);
    expect(g.connection.state).toBe('failed'); expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'MESSAGE_TIMEOUT' }));
  });
  it('closes a guest channel that requests unreliable or unordered delivery', async () => {
    const h = await host(); const pc = new FakePeer(); const g = await answerHostInvitation(h.code, { onMessage: vi.fn(), createPeerConnection: pc.factory }); links.push(g.connection);
    const channel = new FakeChannel(); channel.ordered = false; pc.receiveChannel(channel);
    expect(g.connection.state).toBe('failed'); expect(channel.readyState).toBe('closed');
  });
  it('isolates multiple invitations and shuts down without later timer errors', async () => {
    vi.useFakeTimers(); const errors = vi.fn();
    const a = await host(new FakePeer(), { peerId: 'guest-1', onError: errors });
    const b = await host(new FakePeer(), { peerId: 'guest-2', onError: errors });
    expect(decodePeerSignal(a.code).peerId).not.toBe(decodePeerSignal(b.code).peerId);
    a.connection.close(); expect(b.connection.state).toBe('opening'); b.connection.close();
    await vi.advanceTimersByTimeAsync(600_001);
    expect(errors).not.toHaveBeenCalled();
    expect(() => a.connection.send({ value: 1 })).toThrow(PeerError);
  });
  it('fails clearly when the browser has no peer API', async () => {
    vi.stubGlobal('RTCPeerConnection', undefined);
    await expect(createHostInvitation({ sessionId: 'game', peerId: 'guest', onMessage: vi.fn() })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });
});
