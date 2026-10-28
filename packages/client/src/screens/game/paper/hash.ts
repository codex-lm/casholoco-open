/**
 * Hachage déterministe partagé par les rubriques du journal (bas de page) : mêmes choix pour tous
 * les joueurs, dans toutes les langues, et en rouvrant un ancien numéro. Jamais de Math.random.
 */

/** FNV-1a 32 bits sur les codes UTF-16 de la chaîne. */
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Un élément d'une liste, choisi par hachage (undefined si la liste est vide). */
export function hashPick<T>(list: readonly T[], key: string): T | undefined {
  if (!list.length) return undefined;
  return list[fnv1a(key) % list.length];
}
