/**
 * Générateur pseudo-aléatoire à graine (mulberry32).
 * Son état (un entier non signé 32 bits) vit dans `GameState.rngState` :
 * la partie est rejouable à l'identique et l'état reste du JSON pur.
 */
import type { GameState } from '../types';

/** Transforme une graine quelconque en état initial bien mélangé. */
export function seedToRngState(seed: number): number {
  const s = Number.isFinite(seed) ? Math.floor(seed) : 0;
  let h = (s ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Nombre uniforme dans [0, 1). */
export function next(state: GameState): number {
  const base = Number.isFinite(state.rngState) ? state.rngState : 0;
  const a = (base + 0x6d2b79f5) >>> 0;
  state.rngState = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Loi normale N(mean, sd) par Box-Muller. */
export function normal(state: GameState, mean = 0, sd = 1): number {
  const u1 = Math.max(next(state), 1e-12);
  const u2 = next(state);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z;
}

/** Entier uniforme dans [min, max] (bornes incluses). */
export function int(state: GameState, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(next(state) * (max - min + 1));
}

export function chance(state: GameState, p: number): boolean {
  if (!(p > 0)) return false;
  if (p >= 1) return true;
  return next(state) < p;
}

export function pick<T>(state: GameState, list: readonly T[]): T | undefined {
  if (list.length === 0) return undefined;
  return list[Math.floor(next(state) * list.length)];
}

export function weightedPick<T>(state: GameState, list: readonly T[], weight: (x: T) => number): T | undefined {
  if (list.length === 0) return undefined;
  let total = 0;
  for (const x of list) {
    const w = weight(x);
    if (w > 0 && Number.isFinite(w)) total += w;
  }
  if (total <= 0) return pick(state, list);
  let r = next(state) * total;
  for (const x of list) {
    const w = weight(x);
    if (!(w > 0 && Number.isFinite(w))) continue;
    r -= w;
    if (r < 0) return x;
  }
  return list[list.length - 1];
}

/** Mélange de Fisher-Yates, en place. */
export function shuffle<T>(state: GameState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(next(state) * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}
