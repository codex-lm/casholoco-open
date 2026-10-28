/** Manual, data-channel-only signalling. Codes contain connection metadata, not game state. */
export const PEER_SIGNAL_VERSION = 1;
export const PEER_SIGNAL_PREFIX = 'CASHOLOCO-PEER-1:';
export const MAX_SIGNAL_CODE_LENGTH = 160_000;
export const MAX_SIGNAL_SDP_BYTES = 96_000;
export const PEER_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export type PeerRole = 'host' | 'guest';
export type PeerErrorCode =
  | 'UNSUPPORTED' | 'SIGNAL_INVALID' | 'SIGNAL_TOO_LARGE' | 'WRONG_ROLE' | 'WRONG_SESSION' | 'WRONG_PEER'
  | 'SIGNALING_FAILED' | 'GATHERING_TIMEOUT' | 'INVITATION_EXPIRED' | 'CONNECTION_TIMEOUT'
  | 'CONNECTION_FAILED' | 'CONNECTION_CLOSED' | 'CHANNEL_INVALID' | 'MESSAGE_INVALID'
  | 'MESSAGE_TOO_LARGE' | 'SEND_BACKPRESSURE' | 'MESSAGE_TIMEOUT';

const errorCopy: Record<PeerErrorCode, { fr: string; en: string }> = {
  UNSUPPORTED: { fr: 'Ce navigateur ne permet pas les connexions directes WebRTC.', en: 'This browser does not support direct WebRTC connections.' },
  SIGNAL_INVALID: { fr: 'Ce code de connexion est invalide ou incomplet.', en: 'This connection code is invalid or incomplete.' },
  SIGNAL_TOO_LARGE: { fr: 'Ce code de connexion est trop volumineux.', en: 'This connection code is too large.' },
  WRONG_ROLE: { fr: 'Ce code ne correspond pas à cette étape de la connexion.', en: 'This code does not match this connection step.' },
  WRONG_SESSION: { fr: 'Ce code appartient à une autre partie.', en: 'This code belongs to another game.' },
  WRONG_PEER: { fr: 'Ce code répond à une autre invitation.', en: 'This code answers a different invitation.' },
  SIGNALING_FAILED: { fr: 'Le navigateur n’a pas pu préparer cette connexion directe.', en: 'The browser could not prepare this direct connection.' },
  GATHERING_TIMEOUT: { fr: 'Le navigateur n’a pas terminé le code de connexion. Réessayez.', en: 'The browser did not finish preparing the connection code. Try again.' },
  INVITATION_EXPIRED: { fr: 'Cette invitation a expiré. Créez une nouvelle invitation.', en: 'This invitation expired. Create a new invitation.' },
  CONNECTION_TIMEOUT: { fr: 'La connexion directe n’a pas abouti. Essayez sur le même réseau local.', en: 'The direct connection timed out. Try using the same local network.' },
  CONNECTION_FAILED: { fr: 'La connexion directe est interrompue. Sans relais, certains réseaux ne peuvent pas se joindre.', en: 'The direct connection failed. Without a relay, some networks cannot reach each other.' },
  CONNECTION_CLOSED: { fr: 'Cette connexion est fermée.', en: 'This connection is closed.' },
  CHANNEL_INVALID: { fr: 'Le canal reçu ne correspond pas au protocole du jeu.', en: 'The received channel does not match the game protocol.' },
  MESSAGE_INVALID: { fr: 'Un message de connexion invalide a été reçu.', en: 'An invalid connection message was received.' },
  MESSAGE_TOO_LARGE: { fr: 'Ce message dépasse la limite de la connexion.', en: 'This message exceeds the connection limit.' },
  SEND_BACKPRESSURE: { fr: 'La connexion est occupée. Attendez quelques instants avant de réessayer.', en: 'The connection is busy. Wait a moment before trying again.' },
  MESSAGE_TIMEOUT: { fr: 'Un message n’a pas été reçu entièrement. Reconnectez les joueurs.', en: 'A message was not received completely. Reconnect the players.' },
};

export class PeerError extends Error {
  constructor(readonly code: PeerErrorCode) {
    super(errorCopy[code].en);
    this.name = 'PeerError';
  }
}

export function peerErrorMessage(error: unknown, lang: 'fr' | 'en'): string {
  return errorCopy[error instanceof PeerError ? error.code : 'CONNECTION_FAILED'][lang];
}

export interface PeerSignal {
  format: 'casholoco-peer';
  version: typeof PEER_SIGNAL_VERSION;
  role: PeerRole;
  sessionId: string;
  peerId: string;
  description: { type: 'offer' | 'answer'; sdp: string };
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const found = Object.keys(value);
  return found.length === keys.length && found.every(key => keys.includes(key));
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validatePeerSignal(value: unknown): PeerSignal {
  if (!record(value) || !exactKeys(value, ['format', 'version', 'role', 'sessionId', 'peerId', 'description']) ||
      value.format !== 'casholoco-peer' || value.version !== PEER_SIGNAL_VERSION ||
      (value.role !== 'host' && value.role !== 'guest') ||
      typeof value.sessionId !== 'string' || !PEER_ID_PATTERN.test(value.sessionId) ||
      typeof value.peerId !== 'string' || !PEER_ID_PATTERN.test(value.peerId) ||
      !record(value.description) || !exactKeys(value.description, ['type', 'sdp']) ||
      value.description.type !== (value.role === 'host' ? 'offer' : 'answer') ||
      typeof value.description.sdp !== 'string') throw new PeerError('SIGNAL_INVALID');
  const sdp = value.description.sdp;
  if (new TextEncoder().encode(sdp).byteLength > MAX_SIGNAL_SDP_BYTES) throw new PeerError('SIGNAL_TOO_LARGE');
  // Only browser-to-browser data channels are negotiated. No audio, video, relay
  // candidates or SDP supplied STUN/TURN service may enter this edition.
  if (!sdp.startsWith('v=0\r\n') && !sdp.startsWith('v=0\n')) throw new PeerError('SIGNAL_INVALID');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(sdp) ||
      sdp.split('\n').length > 2048 || !/^m=application\s/m.test(sdp) ||
      /^m=(?!application\s)/m.test(sdp) || !/^a=ice-ufrag:\S+/m.test(sdp) ||
      !/^a=ice-pwd:\S+/m.test(sdp) || !/^a=fingerprint:\S+\s+\S+/m.test(sdp) ||
      /\b(?:stun|stuns|turn|turns):/i.test(sdp)) throw new PeerError('SIGNAL_INVALID');
  for (const line of sdp.split(/\r?\n/)) {
    if (line.startsWith('a=candidate:') && !/\styp host(?:\s|$)/.test(line)) throw new PeerError('SIGNAL_INVALID');
  }
  return value as unknown as PeerSignal;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}
export function decodeBase64(text: string): Uint8Array {
  try {
    const binary = atob(text);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { throw new PeerError('SIGNAL_INVALID'); }
}

export function encodePeerSignal(value: PeerSignal): string {
  const signal = validatePeerSignal(value);
  const encoded = encodeBase64(new TextEncoder().encode(JSON.stringify(signal))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const code = PEER_SIGNAL_PREFIX + encoded;
  if (code.length > MAX_SIGNAL_CODE_LENGTH) throw new PeerError('SIGNAL_TOO_LARGE');
  return code;
}

export function decodePeerSignal(code: string, expected: Partial<Pick<PeerSignal, 'role' | 'sessionId' | 'peerId'>> = {}): PeerSignal {
  if (typeof code !== 'string' || code.length > MAX_SIGNAL_CODE_LENGTH + 100) throw new PeerError('SIGNAL_TOO_LARGE');
  const trimmed = code.trim();
  if (trimmed.length > MAX_SIGNAL_CODE_LENGTH) throw new PeerError('SIGNAL_TOO_LARGE');
  if (!trimmed.startsWith(PEER_SIGNAL_PREFIX)) throw new PeerError('SIGNAL_INVALID');
  const encoded = trimmed.slice(PEER_SIGNAL_PREFIX.length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new PeerError('SIGNAL_INVALID');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64(encoded.replace(/-/g, '+').replace(/_/g, '/')))); }
  catch { throw new PeerError('SIGNAL_INVALID'); }
  const signal = validatePeerSignal(value);
  if (expected.role !== undefined && signal.role !== expected.role) throw new PeerError('WRONG_ROLE');
  if (expected.sessionId !== undefined && signal.sessionId !== expected.sessionId) throw new PeerError('WRONG_SESSION');
  if (expected.peerId !== undefined && signal.peerId !== expected.peerId) throw new PeerError('WRONG_PEER');
  return signal;
}
