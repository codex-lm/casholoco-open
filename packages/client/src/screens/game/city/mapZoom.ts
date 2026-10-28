/**
 * Zoom du plateau dans son cadre (client seul, aucune donnée de partie) : les niveaux, leur mémoire dans le navigateur,
 * le défilement du cadre qui garde en vue la case sélectionnée (sinon le centre), le seuil du glisser-déplacer et le
 * pas de Ctrl / ⌘ + molette. Fonctions pures, testées sans navigateur ; `MapZoomFrame` les branche sur le DOM.
 */
import { MAP_ZOOM_KEY, loadNumber, saveNumber } from '../../../storageFlags';

/** 1 = tout le pays tient dans le cadre (le défaut) ; au-delà, le cadre défile. */
export const MAP_ZOOM_LEVELS = [1, 1.25, 1.5, 2, 2.5] as const;
export const MAP_ZOOM_MAX = MAP_ZOOM_LEVELS[MAP_ZOOM_LEVELS.length - 1];
/** Un appui qui bouge de plus de 5 px est un glisser (il déplace le plateau), jamais un clic sur une case. */
export const MAP_DRAG_THRESHOLD = 5;
/** Pixels de molette cumulés pour un niveau : un cran de souris (≈ 100 px) en fait un, un pincement en cumule plusieurs. */
export const MAP_WHEEL_STEP = 50;

/** Le niveau connu le plus proche (1 pour une valeur illisible). */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return MAP_ZOOM_LEVELS.reduce<number>((best, level) => Math.abs(level - zoom) < Math.abs(best - zoom) ? level : best, 1);
}

/** Le niveau suivant, ou le dernier. */
export function nextZoom(zoom: number): number {
  const current = clampZoom(zoom);
  return MAP_ZOOM_LEVELS.find((level) => level > current) ?? current;
}

/** Le niveau précédent, ou 1. */
export function previousZoom(zoom: number): number {
  const current = clampZoom(zoom);
  return [...MAP_ZOOM_LEVELS].reverse().find((level) => level < current) ?? current;
}

/**
 * Largeur du cadre du plateau (trois colonnes), bordure de 1 px comprise : celle qui fait tenir le pays dans la hauteur
 * (`fitW`), à tout zoom, tant que la colonne de gauche est ouverte (zoomer ne déplace rien autour du cadre) ; colonne
 * repliée (au-delà de 1 seulement), le dessin agrandi plus la barre de défilement verticale du cadre (`scrollbar`), sans
 * dépasser ce que laissent la bande et la fiche (`available`) : quand il y tient, le cadre ne défile plus que
 * verticalement. Même règle que la colonne du plateau dans mapWorkspace.css (`--map-board-w`).
 */
export function frameWidth(fitW: number, zoom: number, available: number, { folded = false, scrollbar = 0 }: { folded?: boolean; scrollbar?: number } = {}): number {
  const wanted = folded ? (fitW - 2) * clampZoom(zoom) + 2 + scrollbar : fitW;
  return Math.max(0, Math.min(wanted, available));
}

export const loadMapZoom = (): number => clampZoom(loadNumber(MAP_ZOOM_KEY, 1));
export const saveMapZoom = (zoom: number): void => saveNumber(MAP_ZOOM_KEY, clampZoom(zoom));

export function exceedsDragThreshold(dx: number, dy: number, threshold = MAP_DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/**
 * Ctrl / ⌘ + molette : cumule les pixels dans le même sens (un changement de sens repart de zéro) et rend un pas
 * (+1 zoom avant pour une molette vers le haut, −1 zoom arrière) dès `threshold`, le cumul repartant alors de zéro.
 */
export function wheelZoomStep(accumulated: number, delta: number, threshold = MAP_WHEEL_STEP): { step: -1 | 0 | 1; accumulated: number } {
  const sum = accumulated !== 0 && Math.sign(accumulated) === Math.sign(delta) ? accumulated + delta : delta;
  if (Math.abs(sum) < threshold) return { step: 0, accumulated: sum };
  return { step: sum < 0 ? 1 : -1, accumulated: 0 };
}

/** Pixels d'un événement de molette, quelle que soit son unité (lignes, pages). */
export function wheelPixels(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  return event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
}

export interface Box { left: number; top: number; right: number; bottom: number }

function along(start: number, end: number, viewStart: number, viewEnd: number): number {
  // Plus grande que la vue : son début.
  if (end - start > viewEnd - viewStart || start < viewStart) return start - viewStart;
  if (end > viewEnd) return end - viewEnd;
  return 0;
}

/**
 * Défilement à ajouter au cadre pour montrer `mark` (coordonnées de l'écran, comme `view`, la partie visible du cadre).
 * Une case entièrement hors de vue (« Aller à », une intention, la checklist) vient au centre ; une case en partie
 * visible (un clic au bord) avance juste assez, `margin` compris ; une case visible ne bouge rien.
 */
export function frameRevealDelta(mark: Box, view: Box, margin = 12): { left: number; top: number } {
  const outside = mark.right <= view.left || mark.left >= view.right || mark.bottom <= view.top || mark.top >= view.bottom;
  if (outside) {
    return {
      left: Math.round((mark.left + mark.right - view.left - view.right) / 2),
      top: Math.round((mark.top + mark.bottom - view.top - view.bottom) / 2),
    };
  }
  return {
    left: Math.round(along(mark.left, mark.right, view.left + margin, view.right - margin)),
    top: Math.round(along(mark.top, mark.bottom, view.top + margin, view.bottom - margin)),
  };
}

/** Ce qu'un changement de zoom doit garder en vue, en fractions du plateau (0 à 1) mesurées avant le changement. */
export interface ZoomAnchor {
  /** Le centre de la partie visible du cadre. */
  center: { x: number; y: number };
  /** La case sélectionnée, quand elle est dessinée. */
  mark: Box | null;
}

/**
 * Défilement du cadre après un changement de zoom : le même centre, sauf si la case sélectionnée sortirait alors du
 * cadre (elle vient au centre). Borné au plateau.
 */
export function zoomScrollTarget(anchor: ZoomAnchor, board: { width: number; height: number }, view: { width: number; height: number }): { left: number; top: number } {
  let left = anchor.center.x * board.width - view.width / 2;
  let top = anchor.center.y * board.height - view.height / 2;
  const mark = anchor.mark;
  if (mark) {
    const box = { left: mark.left * board.width, right: mark.right * board.width, top: mark.top * board.height, bottom: mark.bottom * board.height };
    const shown = box.left >= left && box.right <= left + view.width && box.top >= top && box.bottom <= top + view.height;
    if (!shown) {
      left = (box.left + box.right - view.width) / 2;
      top = (box.top + box.bottom - view.height) / 2;
    }
  }
  const clamp = (value: number, size: number, visible: number) => Math.round(Math.max(0, Math.min(size - visible, value)));
  return { left: clamp(left, board.width, view.width), top: clamp(top, board.height, view.height) };
}
