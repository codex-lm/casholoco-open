/**
 * Cadre du plateau sur ordinateur (≥ 960 px) : à ses proportions, il tient dans la hauteur de la fenêtre sous les barres
 * collées (zoom 1 = tout le pays, sans défiler la page). « + », « − » et « Ajuster », Ctrl / ⌘ + molette agrandissent
 * le dessin, qui défile alors dans le cadre et se déplace en glissant à la souris. Un glisser ne sélectionne jamais de
 * case. Le zoom est mémorisé dans ce navigateur. Zoomer ne change pas la largeur du cadre ; au-delà de 1, la colonne de
 * gauche repliée la lui donne (`frameWidth`) ; quand la largeur du cadre change (colonne de gauche repliée ou rouverte,
 * zoom avec la colonne repliée, fenêtre redimensionnée), le même centre reste au milieu, ou la case sélectionnée si elle
 * allait sortir. Sous 960 px, le cadre n'est qu'une bordure : le plateau garde la largeur de la page, sans zoom.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { cx } from '../../../util';
import {
  MAP_ZOOM_MAX, clampZoom, exceedsDragThreshold, frameRevealDelta, loadMapZoom, nextZoom, previousZoom, saveMapZoom,
  wheelPixels, wheelZoomStep, zoomScrollTarget, type Box, type ZoomAnchor,
} from './mapZoom';

export interface MapZoomLabels {
  /** Nom du groupe de boutons. */
  group: string;
  zoomIn: string;
  zoomOut: string;
  /** Texte visible du retour à 1, et son nom complet. */
  fit: string;
  fitAria: string;
}

export interface MapZoomFrameProps {
  /** Largeur / hauteur du dessin (celles de la projection). */
  aspect: number;
  labels: MapZoomLabels;
  children: ReactNode;
  /** Zoom held by the workspace (whose grid widens the board column with it); without it, the frame keeps its own. */
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

/** Sous 960 px, le zoom ne s'applique pas (le CSS l'ignore) : ni molette ni défilement du cadre. */
const desktop = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 960px)').matches;

/** La partie visible du cadre, en coordonnées de l'écran (sans ses barres de défilement). */
function frameView(frame: HTMLElement): Box {
  const box = frame.getBoundingClientRect();
  const left = box.left + (frame.clientLeft || 0), top = box.top + (frame.clientTop || 0);
  return { left, top, right: left + frame.clientWidth, bottom: top + frame.clientHeight };
}

/** Fait défiler le cadre pour montrer la case (« Aller à », intention, checklist) ; la page ne bouge pas. */
export function revealInZoomFrame(frame: HTMLElement, mark: Element): void {
  const { left, top } = frameRevealDelta(mark.getBoundingClientRect(), frameView(frame));
  if (left) frame.scrollLeft += left;
  if (top) frame.scrollTop += top;
}

/** Le centre visible et la case sélectionnée, en fractions du plateau, juste avant un changement de zoom. */
export function zoomAnchor(frame: HTMLElement, board: HTMLElement): ZoomAnchor | null {
  const box = board.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const view = frameView(frame);
  const mark = board.querySelector('[data-map-selection="true"]')?.getBoundingClientRect();
  return {
    center: { x: ((view.left + view.right) / 2 - box.left) / box.width, y: ((view.top + view.bottom) / 2 - box.top) / box.height },
    mark: mark ? {
      left: (mark.left - box.left) / box.width, right: (mark.right - box.left) / box.width,
      top: (mark.top - box.top) / box.height, bottom: (mark.bottom - box.top) / box.height,
    } : null,
  };
}

/** Vrai quand le point (coordonnées de l'écran) tombe sur une barre de défilement du cadre, hors de sa partie visible. */
export function onScrollbar(frame: HTMLElement, x: number, y: number): boolean {
  const view = frameView(frame);
  return x >= view.right || y >= view.bottom;
}

interface DragStart { pointerId: number; x: number; y: number; left: number; top: number; moved: boolean }

export function MapZoomFrame({ aspect, labels, children, zoom: heldZoom, onZoomChange }: MapZoomFrameProps) {
  const [ownZoom, setOwnZoom] = useState(loadMapZoom);
  const zoom = heldZoom ?? ownZoom;
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const zoomInButton = useRef<HTMLButtonElement>(null);
  const anchor = useRef<ZoomAnchor | null>(null);
  // The frame's last known width and what it showed then (fractions of the board), for width changes.
  const width = useRef(0);
  const shown = useRef<ZoomAnchor | null>(null);
  const drag = useRef<DragStart | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef(0);
  // La molette (écouteur natif posé une fois) lit le zoom et l'action du dernier rendu.
  const current = useRef(zoom);
  current.current = zoom;
  const changeZoom = (next: number) => {
    const target = clampZoom(next);
    if (target === current.current) return;
    anchor.current = frame.current && board.current ? zoomAnchor(frame.current, board.current) : null;
    current.current = target;
    saveMapZoom(target);
    setOwnZoom(target);
    onZoomChange?.(target);
  };
  const change = useRef(changeZoom);
  change.current = changeZoom;
  // Après le rendu au nouveau zoom (le plateau a déjà sa nouvelle taille) : le même centre, ou la case sélectionnée.
  useLayoutEffect(() => {
    const view = frame.current, drawing = board.current, kept = anchor.current;
    anchor.current = null;
    if (!view || !drawing) return;
    // Les boutons restent à gauche de la barre de défilement verticale qui apparaît au-delà de 1.
    box.current?.style.setProperty('--map-zoom-scrollbar', `${Math.max(0, view.offsetWidth - view.clientWidth)}px`);
    if (kept) {
      const target = zoomScrollTarget(kept, { width: drawing.offsetWidth, height: drawing.offsetHeight }, { width: view.clientWidth, height: view.clientHeight });
      view.scrollLeft = target.left;
      view.scrollTop = target.top;
    }
    // The column may have widened with the zoom: this is the frame's new width, and what it now shows.
    width.current = view.clientWidth;
    shown.current = zoomAnchor(view, drawing);
  }, [zoom]);
  // A width change of the frame (the left column folds or opens, the window is resized): keep the same centre, or the
  // selected cell when it would leave the frame. What it shows is noted on every scroll, before the change.
  useEffect(() => {
    const view = frame.current, drawing = board.current;
    if (!view || !drawing || typeof view.addEventListener !== 'function') return;
    const note = () => { shown.current = zoomAnchor(view, drawing); };
    width.current = view.clientWidth;
    note();
    view.addEventListener('scroll', note, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (view.clientWidth === width.current) return;
      width.current = view.clientWidth;
      const kept = shown.current;
      if (kept && current.current > 1) {
        const target = zoomScrollTarget(kept, { width: drawing.offsetWidth, height: drawing.offsetHeight }, { width: view.clientWidth, height: view.clientHeight });
        view.scrollLeft = target.left;
        view.scrollTop = target.top;
      }
      note();
    });
    observer?.observe(view);
    return () => {
      observer?.disconnect();
      view.removeEventListener('scroll', note);
    };
  }, []);
  // Ctrl / ⌘ + molette au-dessus du cadre : le zoom du plateau, pas celui de la page (preventDefault seulement alors).
  useEffect(() => {
    const view = frame.current;
    if (!view || typeof view.addEventListener !== 'function') return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !desktop()) return;
      event.preventDefault();
      const result = wheelZoomStep(wheel.current, wheelPixels(event));
      wheel.current = result.accumulated;
      if (result.step) change.current(result.step > 0 ? nextZoom(current.current) : previousZoom(current.current));
    };
    view.addEventListener('wheel', onWheel, { passive: false });
    return () => view.removeEventListener('wheel', onWheel);
  }, []);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Un appui neuf efface tout glisser resté en suspens ; un clic qui suit un glisser interrompu (relâché hors de la
    // fenêtre) n'est jamais avalé.
    drag.current = null;
    suppressClick.current = false;
    setDragging(false);
    const view = frame.current;
    if (event.pointerType !== 'mouse' || event.button !== 0 || !view) return;
    // Rien à déplacer quand le pays tient dans le cadre (zoom 1, ou petit écran sans zoom) : un clic un peu tremblé
    // reste un clic sur sa case.
    if (current.current <= 1 || !(view.scrollWidth > view.clientWidth || view.scrollHeight > view.clientHeight)) return;
    // Un appui sur les barres de défilement du cadre les laisse au navigateur.
    if (onScrollbar(view, event.clientX, event.clientY)) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: view.scrollLeft, top: view.scrollTop, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current, view = frame.current;
    if (!start || !view || start.pointerId !== event.pointerId) return;
    // Bouton déjà relâché ailleurs (sur « + », hors du cadre) avant le seuil : le survol suivant ne déplace rien.
    if ((event.buttons & 1) === 0) {
      drag.current = null;
      setDragging(false);
      return;
    }
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.moved) {
      if (!exceedsDragThreshold(dx, dy)) return;
      start.moved = true;
      setDragging(true);
      try {
        view.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointeur déjà relâché : le glisser s'arrête au prochain pointerup.
      }
    }
    view.scrollLeft = start.left - dx;
    view.scrollTop = start.top - dy;
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    // Le clic qui termine un glisser ne sélectionne pas la case sous le pointeur (une annulation n'en produit pas).
    if (start.moved) suppressClick.current = !cancelled;
  };
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const fit = () => {
    changeZoom(1);
    // « Ajuster » disparaît à 1 : le focus passe au zoom avant plutôt que de retomber sur la page.
    zoomInButton.current?.focus({ preventScroll: true });
  };
  const zoomed = zoom > 1;
  return <div ref={box} className={cx('map-zoom', zoomed && 'map-zoom-in', dragging && 'map-zoom-dragging')}
    style={{ '--map-zoom': zoom, '--map-aspect': aspect } as CSSProperties}>
    {/* Avant le plateau dans la page (posés en surimpression par le CSS) : la tabulation atteint le zoom sans traverser
        toutes les cases. Aux bornes, les boutons restent focalisables (aria-disabled) : le focus ne retombe pas sur la page. */}
    <div className="map-zoom-controls" role="group" aria-label={labels.group}>
      <button ref={zoomInButton} type="button" className="btn tiny map-zoom-button" aria-label={labels.zoomIn} title={labels.zoomIn}
        aria-disabled={zoom >= MAP_ZOOM_MAX || undefined} onClick={() => changeZoom(nextZoom(zoom))}>+</button>
      <button type="button" className="btn tiny map-zoom-button" aria-label={labels.zoomOut} title={labels.zoomOut}
        aria-disabled={!zoomed || undefined} onClick={() => changeZoom(previousZoom(zoom))}>−</button>
      {zoomed && <button type="button" className="btn tiny map-zoom-fit" aria-label={labels.fitAria} title={labels.fitAria} onClick={fit}>{labels.fit}</button>}
    </div>
    <div ref={frame} className="map-zoom-frame" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, false)} onPointerCancel={(event) => endDrag(event, true)}
      onLostPointerCapture={(event) => endDrag(event, true)} onClickCapture={onClickCapture}>
      <div ref={board} className="map-zoom-board">{children}</div>
    </div>
  </div>;
}
