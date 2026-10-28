/**
 * Filet de sécurité numérique : remplace toute valeur non finie de l'état par une valeur neutre.
 * Ne devrait jamais servir ; `engineDiagnostics.nonFiniteFixed` compte les corrections
 * (surveillé par les tests et par `npm run sim`).
 */
import type { GameState } from '../types';

/** Diagnostics only: never stored in GameState and never consumed by the RNG. */
export const engineDiagnostics = { nonFiniteFixed: 0, factoryMoves: 0 };

const NEUTRAL_ONE = new Set([
  'price',
  'quality',
  'sentiment',
  'marketSentiment',
  'reputation',
  'demandMultiplier',
  'outsideQuality',
]);

function neutral(key: string): number {
  if (key === 'sharePrice') return 0.01;
  return NEUTRAL_ONE.has(key) ? 1 : 0;
}

function walk(node: unknown, parentKey: string): number {
  let fixed = 0;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const v = node[i];
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) {
          node[i] = neutral(parentKey);
          fixed++;
        }
      } else if (v && typeof v === 'object') fixed += walk(v, parentKey);
    }
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) {
          obj[key] = neutral(key);
          fixed++;
        }
      } else if (v && typeof v === 'object') fixed += walk(v, key);
    }
  }
  return fixed;
}

export function sanitizeState(state: GameState): number {
  const fixed = walk(state, '');
  engineDiagnostics.nonFiniteFixed += fixed;
  return fixed;
}

/** Chemins des valeurs numériques non finies (pour les tests). */
export function findNonFinite(node: unknown, path = '$', out: string[] = []): string[] {
  if (typeof node === 'number') {
    if (!Number.isFinite(node)) out.push(path);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => findNonFinite(v, `${path}[${i}]`, out));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) findNonFinite(v, `${path}.${k}`, out);
  }
  return out;
}
