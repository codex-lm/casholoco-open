/**
 * Persistance locale : session de jeu (reconnexion) et pseudo préféré.
 *
 * La session vit en sessionStorage (survit à F5, propre à chaque onglet : on peut
 * jouer à deux onglets sans qu'ils se volent la socket). Les sessions récentes de ce
 * navigateur sont aussi listées en localStorage : elles servent de repli quand
 * sessionStorage est vide (onglet fermé puis rouvert), en préférant une session
 * qu'aucun onglet vivant ne tient.
 * Le repli est ignoré si l'URL porte un lien d'invitation (?code=…) : un second
 * onglet ouvert via l'invitation doit rejoindre comme nouveau joueur.
 *
 * Un onglet qui détient une session le signale par un verrou en localStorage
 * (`muchomoney:owner:<jeton>` = { onglet, horodatage }), rafraîchi toutes les
 * HEARTBEAT_MS et retiré à la fermeture de la page. Un nouvel onglet (ou un onglet
 * dupliqué, qui hérite du sessionStorage) ne reprend JAMAIS automatiquement une
 * session dont le verrou est tenu par un autre onglet vivant : il propose
 * « Reprendre ma partie » (voir api.ts), sinon le serveur éjecterait le premier onglet.
 */
import { ROOM_CODE_LENGTH } from '@muchomoney/core';

const SESSION_KEY = 'muchomoney:session';
/** Sessions récentes de ce navigateur (localStorage), la plus récente d'abord. */
const RECENT_KEY = 'muchomoney:sessions';
const RECENT_MAX = 6;
const NAME_KEY = 'muchomoney:name';
const OWNER_PREFIX = 'muchomoney:owner:';
/** Fréquence du battement de cœur du verrou. */
export const HEARTBEAT_MS = 2000;
/** Au-delà, un verrou non rafraîchi est considéré comme abandonné (onglet planté). */
export const OWNER_TTL_MS = 3 * HEARTBEAT_MS;

/** Identifiant de cet onglet (en mémoire seulement : un onglet dupliqué en a un autre). */
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export interface Session {
  roomCode: string;
  playerId: string;
  token: string;
}

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Session> | null;
    if (s && typeof s.roomCode === 'string' && typeof s.playerId === 'string' && typeof s.token === 'string') {
      return { roomCode: s.roomCode, playerId: s.playerId, token: s.token };
    }
  } catch {
    /* corrompu */
  }
  return null;
}

function read(storage: () => Storage, key = SESSION_KEY): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

/** Session propre à cet onglet (sessionStorage). */
export function loadSession(): Session | null {
  return parse(read(() => window.sessionStorage));
}

function readRecent(): Session[] {
  const out: Session[] = [];
  try {
    const arr = JSON.parse(read(() => window.localStorage, RECENT_KEY) ?? '[]') as unknown;
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const sess = parse(JSON.stringify(item));
        if (sess && !out.some((o) => o.token === sess.token)) out.push(sess);
      }
    }
  } catch {
    /* corrompu */
  }
  return out;
}

function writeRecent(list: Session[]): void {
  try {
    if (list.length) window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
    else window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* rien */
  }
}

/**
 * Session de repli (localStorage) pour un onglet sans session propre : la plus récente
 * qu'aucun autre onglet vivant ne tient (reprise automatique), sinon la plus récente
 * tout court (l'appelant proposera « Reprendre ma partie » au lieu d'éjecter l'autre onglet).
 * Ignorée si l'URL porte une invitation.
 */
export function loadFallbackSession(): Session | null {
  if (codeFromUrl()) return null;
  const list = readRecent();
  return list.find((x) => !isHeldByAnotherTab(x)) ?? list[0] ?? null;
}

export function saveSession(s: Session): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* navigation privée stricte */
  }
  writeRecent([s, ...readRecent().filter((x) => x.token !== s.token)]);
  claimSession(s);
}

export function clearSession(): void {
  const own = parse(read(() => window.sessionStorage));
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* rien */
  }
  // Retire notre session de la liste, sauf si un autre onglet vient de la reprendre.
  if (own && !isHeldByAnotherTab(own)) writeRecent(readRecent().filter((x) => x.token !== own.token));
  if (own) releaseSession(own);
}

// ---------------------------------------------------------------------------
// Verrou « cet onglet détient la session »
// ---------------------------------------------------------------------------

interface OwnerLock {
  tab: string;
  at: number;
}

function readLock(token: string): OwnerLock | null {
  const raw = read(() => window.localStorage, OWNER_PREFIX + token);
  if (!raw) return null;
  try {
    const l = JSON.parse(raw) as Partial<OwnerLock> | null;
    if (l && typeof l.tab === 'string' && typeof l.at === 'number') return { tab: l.tab, at: l.at };
  } catch {
    /* corrompu */
  }
  return null;
}

/** Vrai si un AUTRE onglet vivant (battement récent) détient cette session. */
export function isHeldByAnotherTab(s: Session, now = Date.now()): boolean {
  const l = readLock(s.token);
  return l !== null && l.tab !== TAB_ID && now - l.at < OWNER_TTL_MS && l.at - now < OWNER_TTL_MS;
}

/** Marque la session comme tenue par cet onglet (à appeler avant de la reprendre, puis périodiquement). */
export function claimSession(s: Session, now = Date.now()): void {
  try {
    window.localStorage.setItem(OWNER_PREFIX + s.token, JSON.stringify({ tab: TAB_ID, at: now } satisfies OwnerLock));
  } catch {
    /* rien */
  }
}

/** Retire le verrou s'il est à cet onglet. */
export function releaseSession(s: Session): void {
  try {
    if (readLock(s.token)?.tab === TAB_ID) window.localStorage.removeItem(OWNER_PREFIX + s.token);
  } catch {
    /* rien */
  }
}

/**
 * Entretient le verrou de la session courante (`current()`), et le libère quand
 * elle change ou que la page se ferme. Renvoie une fonction d'arrêt.
 */
export function startOwnershipHeartbeat(current: () => Session | null): () => void {
  let held: Session | null = null;
  const tick = () => {
    const s = current();
    if (held && (!s || s.token !== held.token)) releaseSession(held);
    held = s;
    // Un autre onglet a repris la session (le serveur va nous éjecter) : on ne se bat pas pour le verrou.
    if (s && !isHeldByAnotherTab(s)) claimSession(s);
  };
  const release = () => {
    if (held) releaseSession(held);
  };
  // Après un bfcache (retour arrière), la page revit : on reprend le verrou.
  const revive = () => tick();
  tick();
  const id = window.setInterval(tick, HEARTBEAT_MS);
  window.addEventListener('pagehide', release);
  window.addEventListener('pageshow', revive);
  return () => {
    window.clearInterval(id);
    window.removeEventListener('pagehide', release);
    window.removeEventListener('pageshow', revive);
    release();
  };
}

export function loadName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    /* rien */
  }
}

/** Code de salon lu dans l'URL (?code=XXXX), normalisé. */
export function codeFromUrl(): string {
  try {
    const c = new URLSearchParams(window.location.search).get('code') ?? '';
    return normalizeCode(c);
  } catch {
    return '';
  }
}

/**
 * Alphabet des codes de salon, identique à ROOM_CODE_ALPHABET du serveur (packages/server/src/config.ts) :
 * ni chiffres, ni I, ni O (pour ne pas les confondre avec 1 et 0).
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Majuscules, lettres de l'alphabet des codes uniquement (ex. « KXMP »), ROOM_CODE_LENGTH caractères. */
export function normalizeCode(raw: string): string {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (ROOM_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length >= ROOM_CODE_LENGTH) break;
  }
  return out;
}

/** Vrai si la saisie contient des caractères qu'un code ne contient jamais (chiffres, I, O…). */
export function hasInvalidCodeChars(raw: string): boolean {
  for (const ch of raw.toUpperCase()) {
    if (/\s/.test(ch)) continue;
    if (!ROOM_CODE_ALPHABET.includes(ch)) return true;
  }
  return false;
}

/** Retire ?code= de l'URL sans recharger la page. */
export function clearCodeFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('code')) return;
    url.searchParams.delete('code');
    window.history.replaceState(null, '', url.toString());
  } catch {
    /* rien */
  }
}

/** Limites imposées par le serveur. */
export const PLAYER_NAME_MAX = 20;
export const COMPANY_NAME_MAX = 30;
