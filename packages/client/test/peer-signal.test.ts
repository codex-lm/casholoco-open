import { describe, expect, it } from 'vitest';
import { decodePeerSignal, encodeBase64, encodePeerSignal, MAX_SIGNAL_CODE_LENGTH, MAX_SIGNAL_SDP_BYTES,
  PEER_SIGNAL_PREFIX, peerErrorMessage, PeerError, validatePeerSignal, type PeerSignal } from '../src/peer/signal';

const sdp = 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=ice-ufrag:local\r\na=ice-pwd:abcdefghijklmnopqrstuv\r\na=fingerprint:sha-256 AA:BB:CC\r\na=candidate:1 1 UDP 2122260223 example.local 12345 typ host\r\na=end-of-candidates\r\n';
const signal = (role: 'host' | 'guest' = 'host'): PeerSignal => ({ format: 'casholoco-peer', version: 1,
  role, sessionId: 'session-123', peerId: 'guest-1', description: { type: role === 'host' ? 'offer' : 'answer', sdp } });
const unchecked = (value: unknown) => PEER_SIGNAL_PREFIX + encodeBase64(new TextEncoder().encode(JSON.stringify(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('manual peer signal codec', () => {
  it.each(['host', 'guest'] as const)('round-trips the complete %s SDP and ignores surrounding paste whitespace', role => {
    const original = signal(role), code = encodePeerSignal(original);
    expect(code).toMatch(/^CASHOLOCO-PEER-1:[A-Za-z0-9_-]+$/);
    expect(decodePeerSignal(`\n ${code} \r\n`)).toEqual(original);
  });
  it('checks role, session and invitation independently', () => {
    const code = encodePeerSignal(signal('guest'));
    expect(() => decodePeerSignal(code, { role: 'host' })).toThrow(expect.objectContaining({ code: 'WRONG_ROLE' }));
    expect(() => decodePeerSignal(code, { sessionId: 'other' })).toThrow(expect.objectContaining({ code: 'WRONG_SESSION' }));
    expect(() => decodePeerSignal(code, { peerId: 'other' })).toThrow(expect.objectContaining({ code: 'WRONG_PEER' }));
  });
  it.each(['', 'OTHER:abc', PEER_SIGNAL_PREFIX + '!', PEER_SIGNAL_PREFIX + 'A', PEER_SIGNAL_PREFIX + 'bnVsbA'])('rejects malformed pasted data', code => {
    expect(() => decodePeerSignal(code)).toThrow(PeerError);
  });
  it('rejects oversized code before decoding and oversized SDP before encoding', () => {
    expect(() => decodePeerSignal('A'.repeat(MAX_SIGNAL_CODE_LENGTH + 101))).toThrow(expect.objectContaining({ code: 'SIGNAL_TOO_LARGE' }));
    const huge = signal(); huge.description.sdp += 'x'.repeat(MAX_SIGNAL_SDP_BYTES);
    expect(() => encodePeerSignal(huge)).toThrow(expect.objectContaining({ code: 'SIGNAL_TOO_LARGE' }));
  });
  it.each([
    { version: 2 }, { format: 'other' }, { role: 'spectator' }, { sessionId: '../other' }, { peerId: 'a'.repeat(81) },
    { extra: 'field' }, { description: { type: 'answer', sdp } }, { description: { type: 'offer', sdp, candidates: [] } },
  ])('rejects unsupported format, IDs, roles and extra fields', patch => {
    expect(() => decodePeerSignal(unchecked({ ...signal(), ...patch }))).toThrow(PeerError);
  });
  it.each([
    sdp.replace('m=application', 'm=audio'),
    sdp + 'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
    sdp.replace('typ host', 'typ relay'),
    sdp.replace('typ host', 'typ srflx'),
    sdp + 'a=ice-server:stun:example.invalid\r\n',
    sdp.replace('a=ice-pwd:', 'a=other:'),
    sdp.replace('v=0', 'v=1'),
  ])('only accepts data-channel SDP with host candidates', value => {
    expect(() => validatePeerSignal({ ...signal(), description: { type: 'offer', sdp: value } })).toThrow(PeerError);
  });
  it('provides a safe localised explanation without echoing pasted metadata', () => {
    const err = new PeerError('WRONG_PEER');
    expect(peerErrorMessage(err, 'fr')).toContain('invitation');
    expect(peerErrorMessage(err, 'en')).toContain('invitation');
    expect(peerErrorMessage(new Error('private SDP here'), 'en')).not.toContain('private');
  });
});
