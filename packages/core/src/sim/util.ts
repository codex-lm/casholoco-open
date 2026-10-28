/** Petits utilitaires purs du moteur. */
import type { BotLevel, CompanyState, GameState, Id, Lang, PlayerState } from '../types';
import { textsFor } from './i18n';

/** Niveau d'un bot (§10) : le sien, réglé au salon, sinon celui de la partie, sinon 'normal'. */
export function botLevelOf(state: GameState, player: PlayerState): BotLevel {
  return player.botLevel ?? state.config.botLevel ?? 'normal';
}

export function clamp(x: number, lo: number, hi: number): number {
  if (Number.isNaN(x)) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}

/** Renvoie `x` s'il est fini, sinon `fallback`. */
export function fin(x: number, fallback = 0): number {
  return Number.isFinite(x) ? x : fallback;
}

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Entier ≥ 1 obtenu en arrondissant vers le bas (tolère 9,9999999), sinon null. */
export function toPositiveInt(x: unknown): number | null {
  if (!isFiniteNumber(x)) return null;
  const n = Math.floor(x + 1e-9);
  return n >= 1 ? n : null;
}

export function hasOwn(obj: object, key: unknown): key is string {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
}

/** Lecture sûre d'un Record indexé par une entrée utilisateur (pas de __proto__ & co). */
export function getOwn<T>(rec: Record<string, T>, key: unknown): T | undefined {
  return hasOwn(rec, key) ? rec[key] : undefined;
}

export function newId(state: GameState, prefix: string): Id {
  const n = Number.isFinite(state.nextId) && state.nextId >= 1 ? Math.floor(state.nextId) : 1;
  state.nextId = n + 1;
  return `${prefix}${n}`;
}

/** Hash FNV-1a 32 bits. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Hash FNV-1a suivi d'un brassage final (murmur3) : à préférer quand seules les dernières lettres des chaînes
 * changent (« oil|0 », « oil|1 »…), là où le FNV seul ne classe que huit façons différentes.
 */
export function mixedHash(s: string): number {
  let h = hashString(s);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Graine des choix visibles qui ne comptent pas (textes d'ambiance, noms) : jamais la graine de la simulation quand le
 * serveur en a tiré une à part, sinon ces choix publics permettraient de la retrouver par force brute (et avec elle,
 * les news et les cours à venir).
 */
export function textSeedOf(state: GameState): number {
  const t = state.config.textSeed;
  return typeof t === 'number' && Number.isFinite(t) ? t : state.config.seed;
}

/**
 * Choix déterministe d'un texte d'ambiance SANS consommer le RNG de la simulation :
 * enrichir les textes ne change donc pas le déroulé économique d'une graine.
 */
export function flavor<T>(state: GameState, list: readonly T[] | undefined, salt: string): T | undefined {
  if (!list || list.length === 0) return undefined;
  const h = hashString(`${textSeedOf(state)}|${state.turn}|${state.nextId}|${salt}`);
  return list[h % list.length];
}

/**
 * Vrai si « de »/« que » doivent s'élider devant ce mot : voyelle, h (traité comme muet),
 * ou y suivi d'une consonne (« d’Yves », mais « de Yaourts »).
 */
export function startsWithVowelSound(word: string): boolean {
  return /^(?:[aeiouàâäéèêëîïôöùûüœæ]|h|y(?![aeiouàâäéèêëîïôöùûü]))/i.test(word.trim());
}

/**
 * Anglais : « an » plutôt que « a » devant ce mot ? Voyelle prononcée comme telle
 * (sauf « uni… », « use… », « eu… », « one… ») ou h muet courant (hour, honest, heir, honor).
 */
export function takesAn(word: string): boolean {
  const w = word.trim().toLowerCase();
  if (/^(?:uni|use|usu|uti|eu|one\b|once)/.test(w)) return false;
  if (/^(?:hour|honest|honou?r|heir)/.test(w)) return true;
  if (/^[0-9]/.test(w)) return /^8/.test(w) || /^1[18](?![0-9])/.test(w);
  return /^[aeiou]/.test(w);
}

/**
 * Remplit `{clé}` ; une clé inconnue est remplacée par une formule vague (dans la langue demandée)
 * plutôt que laissée brute.
 * - fr : « de {x} » et « que {x} » deviennent « d’… » / « qu’… » quand la valeur commence par une voyelle.
 * - en : « a {x} » devient « an … » devant un son voyelle (et l'article disparaît si la formule vague
 *   en porte déjà un) ; « {x}'s » devient « {x}' » quand la valeur finit par un s.
 */
export function fillTemplate(tpl: string, vars: Record<string, string | undefined>, lang: Lang = 'fr'): string {
  const fallbacks = textsFor(lang).placeholders;
  const value = (m: string, k: string) => {
    const v = vars[k];
    if (v !== undefined) return v;
    return fallbacks[k] ?? m;
  };
  if (lang === 'en') {
    return tpl
      .replace(/(^|[^\p{L}])([Aa]n?) \{(\w+)\}/gu, (m, pre: string, art: string, k: string) => {
        const v = value(`{${k}}`, k);
        if (v === `{${k}}`) return `${pre}${art} ${v}`;
        // Formule vague déjà munie d'un article : « a {company} » -> « a listed company ».
        if (vars[k] === undefined && /^(?:an?|the) /i.test(v)) return `${pre}${art[0] === 'A' ? v[0].toUpperCase() + v.slice(1) : v}`;
        const an = takesAn(v);
        const a = art[0] === 'A' ? (an ? 'An' : 'A') : an ? 'an' : 'a';
        return `${pre}${a} ${v}`;
      })
      .replace(/\{(\w+)\}(['’])s\b/g, (m, k: string, apos: string) => {
        const v = value(`{${k}}`, k);
        return /s$/i.test(v) ? `${v}${apos}` : `${v}${apos}s`;
      })
      .replace(/\{(\w+)\}/g, (m, k: string) => value(m, k));
  }
  return tpl
    .replace(/(^|[^\p{L}])([Dd]e|[Qq]ue) \{(\w+)\}/gu, (m, pre: string, word: string, k: string) => {
      const v = value(`{${k}}`, k);
      if (v === `{${k}}` || !startsWithVowelSound(v)) return `${pre}${word} ${v}`;
      return `${pre}${word.slice(0, word.length - 1)}’${v}`;
    })
    .replace(/\{(\w+)\}/g, (m, k: string) => value(m, k));
}

/** Nettoie un nom saisi par un joueur (caractères de contrôle, espaces, longueur). */
export function cleanName(x: unknown, max = 40): string | null {
  if (typeof x !== 'string') return null;
  const s = x
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return s.length > 0 ? s : null;
}

export function activeCompanies(state: GameState): CompanyState[] {
  return Object.values(state.companies).filter((c) => c.status === 'active');
}

export function controllerOf(state: GameState, c: CompanyState): PlayerState | undefined {
  return c.controllerId !== null ? getOwn(state.players, c.controllerId) : undefined;
}

export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
