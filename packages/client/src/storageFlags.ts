/** Petits réglages d'affichage mémorisés dans ce navigateur (jamais l'état de la partie). */

const flagsThisVisit = new Map<string, boolean>();
// Une écriture refusée laisse parfois une ancienne valeur lisible : le choix courant garde la priorité.
const unsavedFlags = new Set<string>();

export function loadFlag(key: string): boolean {
  if (unsavedFlags.has(key)) return flagsThisVisit.get(key) ?? false;
  try {
    if (typeof localStorage === 'undefined') return flagsThisVisit.get(key) ?? false;
    const value = localStorage.getItem(key) === '1';
    flagsThisVisit.set(key, value);
    return value;
  } catch {
    return flagsThisVisit.get(key) ?? false;
  }
}

export function saveFlag(key: string, on: boolean): void {
  flagsThisVisit.set(key, on);
  try {
    localStorage.setItem(key, on ? '1' : '0');
    unsavedFlags.delete(key);
  } catch {
    // Le repli survit aux démontages d'onglet et reste partagé entre la carte et l'atelier.
    unsavedFlags.add(key);
  }
}

/** Scène figée : partagé par « Mes usines » et « La carte ». */
export const STILL_KEY = 'casholoco.factories.still';

/** Quadrillage 3D masqué ; sans préférence, il reste affiché. */
export const ISOMETRIC_GRID_HIDDEN_KEY = 'casholoco.isometric.gridHidden';

/**
 * Bilan de clôture replié : une seule préférence, valable pour toutes les parties et tous les trimestres. Un bilan qui
 * appelle une décision (mise réglée, faillite, OPA, amendes, stock, fortune qui bouge de 5 % ou plus) s'ouvre quand même.
 */
export const RECAP_COLLAPSED_KEY = 'casholoco.closeRecap.collapsed';

/** Les trois panneaux se déplient ensemble ; sans préférence, ils restent compacts. */
export const SIGNS_EXPANDED_KEY = 'casholoco.signs.expanded';

/** La carte classique ajustée à la hauteur de la fenêtre (« Voir tout le pays ») ; sans préférence, toute la largeur. */
export const MAP_WHOLE_KEY = 'casholoco.map.whole';

/** Zoom du plateau hexagonal dans son cadre (1 = tout le pays à l'écran, le défaut) ; voir `city/mapZoom.ts`. */
export const MAP_ZOOM_KEY = 'casholoco.map.zoom';

/** Colonne de gauche du plateau repliée (« ‹ ») ; ne vaut qu'au-delà du zoom 1, où le plateau prend la place libérée. */
export const MAP_SIDE_FOLDED_KEY = 'casholoco.map.sideFolded';

/** Plis ouverts de la colonne de gauche du plateau : 'flows', 'deposits', 'awards', 'legend' (tous fermés par défaut). */
export const MAP_SIDE_OPEN_KEY = 'casholoco.map.sideOpen';

/** Image de l'usine suivie masquée dans la colonne de gauche du plateau (« Masquer l'image ») ; sans préférence, montrée. */
export const MAP_PLANT_SCENE_HIDDEN_KEY = 'casholoco.map.plantSceneHidden';

/** Nombre mémorisé ; `fallback` si rien de lisible n'est mémorisé ou si le stockage est indisponible. */
export function loadNumber(key: string, fallback: number): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const value = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Stockage indisponible : le réglage vaut pour cette visite.
  }
}

/** Liste de valeurs connues (cases cochées) ; `fallback` si rien de lisible n'est mémorisé. */
export function loadList<T extends string>(key: string, allowed: readonly T[], fallback: readonly T[]): T[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...fallback];
    return allowed.filter((v) => parsed.includes(v));
  } catch {
    return [...fallback];
  }
}

export function saveList(key: string, values: readonly string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Stockage indisponible : le réglage vaut pour cette visite.
  }
}
