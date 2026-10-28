import type { Lang } from '@muchomoney/core';
import { dateLabel } from '@muchomoney/core';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function pick<T>(list: readonly T[], avoid?: T): T | undefined {
  if (!list.length) return undefined;
  if (list.length === 1) return list[0];
  let v = list[Math.floor(Math.random() * list.length)];
  if (avoid !== undefined && v === avoid) v = list[(list.indexOf(v) + 1) % list.length];
  return v;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Libellés d'axe pour un historique aligné à droite :
 * le dernier point correspond au tour `lastTurn` (0 ou moins = `words.start`, « Départ »).
 * Si `words.now` est fourni, le dernier point est la valeur en direct (« Maintenant »).
 * Les dates suivent `lang` (langue du salon) : « T3 2027 » / « Q3 2027 ».
 */
export function turnLabels(
  count: number,
  lastTurn: number,
  startYear: number,
  words: { start: string; now?: string },
  lang: Lang = 'fr',
): string[] {
  const out: string[] = [];
  const nowLabel = words.now;
  for (let i = 0; i < count; i++) {
    const back = count - 1 - i;
    if (nowLabel && back === 0) {
      out.push(nowLabel);
      continue;
    }
    const t = lastTurn - (nowLabel ? back - 1 : back);
    out.push(t <= 0 ? words.start : dateLabel(t, startYear, lang));
  }
  return out;
}

/** Chrono « 1:05 ». */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Espaces insécables : un montant (« 5,0 M€ ») ou un pourcentage ne se coupe pas en fin de ligne. */
export function nbsp(s: string): string {
  return s.replace(/ /g, '\u00a0');
}

/**
 * Typographie française : espace insécable après « et avant », ainsi qu'avant : ; ! ? % (textes du moteur
 * comme les titres du journal). Sans effet sur un texte anglais.
 */
export function frenchSpacing(s: string): string {
  return s
    .replace(/« /g, '«\u00a0')
    .replace(/ »/g, '\u00a0»')
    .replace(/ ([:;!?%])/g, '\u00a0$1');
}
