import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { cx } from '../../../util';
import { MAP_SIDE_FOLDED_KEY, MAP_WHOLE_KEY, loadFlag, saveFlag } from '../../../storageFlags';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { MapZoomFrame, revealInZoomFrame, type MapZoomLabels } from './MapZoomFrame';
import { loadMapZoom } from './mapZoom';
import './mapWorkspace.css';

/** Width from which a side panel replaces the toolbar row: three columns (tools, board, sheet). */
export const MAP_SIDE_PANEL_QUERY = '(min-width: 1200px)';

interface MapWorkspaceProps {
  /** Null leaves the whole map column available, without an empty side panel. */
  selectedKey: string | null;
  /** Increment on every selection, including a second click on the same map mark. */
  selectionToken?: number | string;
  /** A fresh requested intent owns its form scroll; ordinary selections still reveal their map mark. */
  preserveFormScroll?: boolean;
  foldLabel: string;
  reopenLabel: string;
  /**
   * Bascule de taille de la carte classique : pleine largeur (lisible, défaut) ou tout le pays dans la hauteur de la
   * fenêtre. Sans objet avec `zoom`, qui la remplace.
   */
  wholeLabel?: string;
  enlargeLabel?: string;
  toolbar?: ReactNode;
  /** One wrapping row (hex board, below 1200 px): the toolbar's items share a single flex line instead of stacked rows. */
  inlineToolbar?: boolean;
  /**
   * Hex board on wide desktops (≥ 1200 px): the same tools stacked in a left column, sticky like the sheet, instead of
   * the toolbar row (only one of the two is mounted). Narrower windows keep `toolbar`.
   */
  sidePanel?: ReactNode;
  sidePanelLabel?: string;
  /**
   * The left column folds (« ‹ ») only while the board is zoomed in: the board then widens into the freed width (the
   * fitted width × zoom, at most what the strip and the sheet leave; the columns packed to the right, so that a zoom
   * step moves neither the sheet nor the zoom buttons). At zoom 1 it cannot use that width (it is fitted to the
   * height), so the column is always open there, and it reopens by itself when the zoom comes back to 1. The choice is
   * remembered (`casholoco.map.sideFolded`) for zoomed views. The folded strip keeps one vertical button and `strip`, a
   * minimal key of the colours.
   */
  sideFold?: { foldLabel: string; reopenText: string; reopenLabel: string; strip?: ReactNode };
  /**
   * Hex board: the drawing sits in a frame fitted to the window height under the sticky bars (zoom 1 = the whole
   * country), with zoom buttons, Ctrl / ⌘ + wheel and drag. `aspect` is the drawing's width / height.
   */
  zoom?: { aspect: number; labels: MapZoomLabels };
  /** The 3D camera owns pan and zoom, while the surrounding tools may still fold. */
  nativeZoom?: boolean;
  sheet?: ReactNode;
  /** Context that stays outside the zoomed drawing and remains visible when either side panel is folded. */
  boardHeader?: ReactNode;
  children: ReactNode;
  className?: string;
}

interface FoldedSelection {
  key: string | null;
  token: number | string | undefined;
}

/** The vertical adjustment keeps the mark below the sticky bars (game bar and tabs), without horizontal map panning. */
export function mapSelectionScrollDelta(rect: Pick<DOMRect, 'top' | 'bottom'>, barsHeight: number, viewportHeight: number): number {
  const top = barsHeight + 12;
  const bottom = viewportHeight - 12;
  if (rect.top < top) return rect.top - top;
  if (rect.bottom > bottom) return rect.bottom - bottom;
  return 0;
}

/**
 * Count the full-width toolbar, map borders and below-map legend as chrome. The SVG alone
 * receives the remaining viewport height; the right-hand form never limits that measurement.
 * With the zoom frame, the frame is both column and drawing: only what sits above it counts (0 in three columns).
 */
export function mapWorkspaceChromeHeight(workspaceTop: number, columnTop: number, columnHeight: number, svgHeight: number): number {
  return Math.ceil(Math.max(0, columnTop - workspaceTop) + Math.max(0, columnHeight - svgHeight));
}

/** Ordinary selections reveal their form inside the desktop sheet while the whole map stays in view. */
export function focusMapSheetTarget(target: HTMLElement, scrollPage = false): void {
  const sheet = target.closest?.<HTMLElement>('.map-workspace-sheet');
  const desktop = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 960px)').matches;
  if (sheet && desktop && !scrollPage) {
    sheet.scrollTop += target.getBoundingClientRect().top - sheet.getBoundingClientRect().top - 8;
  } else {
    // Requested intents, small screens and standalone legacy sheets keep their existing page scroll.
    target.scrollIntoView({ block: 'start' });
  }
  target.focus({ preventScroll: true });
}

function useMapWorkspaceSize(workspace: RefObject<HTMLDivElement | null>, column: RefObject<HTMLDivElement | null>, layout: string) {
  useLayoutEffect(() => {
    const root = workspace.current;
    const mapColumn = column.current;
    if (!root || !mapColumn || typeof window === 'undefined') return;
    const measure = () => {
      const zoomBox = mapColumn.querySelector<HTMLElement>('.map-zoom');
      const svg = mapColumn.querySelector<SVGSVGElement | HTMLElement>('.map-svg, .iso-board');
      const rootBox = root.getBoundingClientRect();
      root.style.setProperty('--map-viewport-h', `${window.innerHeight}px`);
      if (zoomBox) {
        const frameBox = zoomBox.getBoundingClientRect();
        root.style.setProperty('--map-chrome-h', `${mapWorkspaceChromeHeight(rootBox.top, frameBox.top, frameBox.height, frameBox.height)}px`);
        // The zoomed frame's vertical scrollbar (0 at zoom 1, or with overlay scrollbars): the folded column's board
        // track leaves room for it, so that a zoomed board that fits never pans sideways.
        const zoomFrame = zoomBox.querySelector<HTMLElement>('.map-zoom-frame');
        if (zoomFrame) root.style.setProperty('--map-zoom-scrollbar', `${Math.max(0, zoomFrame.offsetWidth - zoomFrame.clientWidth)}px`);
      } else if (svg) {
        const columnBox = mapColumn.getBoundingClientRect();
        root.style.setProperty('--map-chrome-h', `${mapWorkspaceChromeHeight(rootBox.top, columnBox.top, columnBox.height, svg.getBoundingClientRect().height)}px`);
        if (svg.classList.contains('iso-board')) root.style.setProperty('--island-stage-top', `${Math.max(stickyBarsHeight() + 12, columnBox.top)}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(mapColumn);
    const toolbar = root.querySelector<HTMLElement>('.map-workspace-toolbar');
    if (toolbar) observer?.observe(toolbar);
    const header = root.querySelector<HTMLElement>('.map-workspace-header');
    if (header) observer?.observe(header);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [workspace, column, layout]);
}

function focusedMapForm(): boolean {
  const active = document.activeElement;
  return active instanceof Element && !!active.closest('[data-map-form], [data-hx-map-form], .map-form, .hx-map-form');
}

/** What the sticky bars cover at the top of the window: the game bar, then the tabs stuck under it (0 when they do not stick). */
export function stickyBarsHeight(): number {
  const style = window.getComputedStyle(document.documentElement);
  const topbar = Number.parseFloat(style.getPropertyValue('--topbar-h')) || 65;
  const tabs = Number.parseFloat(style.getPropertyValue('--tabs-h')) || 0;
  return topbar + tabs;
}

/** Shared desktop frame for the classic and hex maps; sheet drafts remain mounted when folded. */
export function MapWorkspace({ selectedKey, selectionToken, preserveFormScroll = false, foldLabel, reopenLabel, wholeLabel, enlargeLabel, toolbar, inlineToolbar = false,
  sidePanel, sidePanelLabel, sideFold, zoom, nativeZoom = false, sheet, boardHeader, children, className }: MapWorkspaceProps) {
  const workspace = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const foldButton = useRef<HTMLButtonElement>(null);
  const sheetContent = useRef<HTMLDivElement>(null);
  const sheetId = `map-sheet-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const sideId = `${sheetId}-side`;
  const [foldedSelection, setFoldedSelection] = useState<FoldedSelection | null>(null);
  // Un pays plus haut que large (le plateau) devient étroit s'il doit tenir dans la hauteur : la pleine largeur est le
  // défaut, « Voir tout le pays » l'ajuste à la fenêtre, et le choix est mémorisé.
  const [whole, setWhole] = useState(() => loadFlag(MAP_WHOLE_KEY));
  const toggleWhole = () => {
    saveFlag(MAP_WHOLE_KEY, !whole);
    setWhole(!whole);
  };
  const selected = selectedKey !== null && sheet !== null && sheet !== undefined;
  // A new selection reopens immediately, even when its geographic key did not change.
  const folded = selected && foldedSelection !== null && foldedSelection.key === selectedKey && foldedSelection.token === selectionToken;
  const fold = () => {
    // Escape can hide a focused form field: leave keyboard focus on the visible reopening control.
    if (typeof document !== 'undefined' && sheetContent.current?.contains(document.activeElement)) foldButton.current?.focus({ preventScroll: true });
    setFoldedSelection({ key: selectedKey, token: selectionToken });
  };
  const reopen = () => setFoldedSelection(null);
  // The zoom replaces the size toggle (and a remembered « tout le pays » never constrains a zoomable board).
  const viewToggle = wholeLabel && enlargeLabel && !zoom
    ? <button type="button" className="btn tiny ghost map-workspace-view-toggle" aria-pressed={whole} onClick={toggleWhole}>{whole ? enlargeLabel : wholeLabel}</button>
    : null;
  const wideEnoughForSide = useMediaQuery(MAP_SIDE_PANEL_QUERY);
  const side = Boolean(sidePanel) && wideEnoughForSide;
  const showToolbar = Boolean(toolbar) && !side;
  // The board's zoom lives here so the grid knows it: zoomed in, the left column can fold and the board column then
  // widens with the zoom (never otherwise: zooming moves nothing around the frame).
  const [zoomLevel, setZoomLevel] = useState(loadMapZoom);
  const zoomedIn = Boolean(zoom) && zoomLevel > 1;
  const [sideFoldedChoice, setSideFoldedChoice] = useState(() => loadFlag(MAP_SIDE_FOLDED_KEY));
  const sideFoldable = side && Boolean(sideFold) && (zoomedIn || nativeZoom);
  const sideFolded = sideFoldable && sideFoldedChoice;
  const sideFoldButton = useRef<HTMLButtonElement>(null);
  const sideReopenButton = useRef<HTMLButtonElement>(null);
  const sideFocus = useRef<'fold' | 'reopen' | null>(null);
  const toggleSide = (folded: boolean) => {
    saveFlag(MAP_SIDE_FOLDED_KEY, folded);
    // The pressed button disappears: the focus goes to the one that replaces it.
    sideFocus.current = folded ? 'reopen' : 'fold';
    setSideFoldedChoice(folded);
  };
  useEffect(() => {
    const target = sideFocus.current === 'reopen' ? sideReopenButton.current : sideFocus.current === 'fold' ? sideFoldButton.current : null;
    sideFocus.current = null;
    target?.focus?.({ preventScroll: true });
  }, [sideFolded]);
  useMapWorkspaceSize(workspace, column, side ? `side:${sideFolded}:${zoomLevel}` : `row:${zoomLevel}`);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const frame = window.requestAnimationFrame(() => {
      const root = workspace.current;
      if (!root || !window.matchMedia('(min-width: 960px)').matches || (preserveFormScroll && focusedMapForm())) return;
      // Keep the compact panels in the page, then reveal the whole country on a plain map arrival.
      // Intent forms own their scroll/focus destination and take precedence over this initial reveal.
      const delta = root.getBoundingClientRect().top - stickyBarsHeight() - 12;
      if (Math.abs(delta) > 1) window.scrollTo({ top: Math.max(0, window.scrollY + delta), left: window.scrollX, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!selected || folded || typeof window === 'undefined' || typeof document === 'undefined') return;
    // Every arrival reveals the selected mark too (a southern own factory would otherwise get a sheet for an
    // off-screen cell). Intent forms scroll/focus in their own effects: run afterwards and respect their destination.
    const frame = window.requestAnimationFrame(() => {
      const root = workspace.current;
      if (!root || !window.matchMedia('(min-width: 960px)').matches) return;
      const mark = column.current?.querySelector<SVGElement>('[data-map-selection="true"]');
      // Inside a zoomed frame, the frame scrolls to the mark (the page never needs to): before the intent check,
      // since a requested form's cell must be on screen too.
      const zoomFrame = zoom ? column.current?.querySelector<HTMLElement>('.map-zoom-frame') : null;
      if (mark && zoomFrame) revealInZoomFrame(zoomFrame, mark);
      if (preserveFormScroll && focusedMapForm()) return;
      if (!mark) return;
      const bars = stickyBarsHeight();
      const svgBox = (zoomFrame ?? column.current?.querySelector<SVGSVGElement>('.map-svg'))?.getBoundingClientRect();
      // A sheet can trigger browser scroll anchoring during the layout change. Keep the entire height-constrained
      // country (or its fitted frame) visible when it fits; larger standalone maps fall back to the mark.
      // When the map has a reference header, it is part of what must remain visible with the fitted country.
      const headerBox = boardHeader ? root.querySelector<HTMLElement>('.map-workspace-header')?.getBoundingClientRect() : null;
      const fittedTop = headerBox ? Math.min(root.getBoundingClientRect().top, headerBox.top) : null;
      const fittedBox = fittedTop !== null && svgBox ? { ...svgBox, top: fittedTop, bottom: svgBox.bottom, height: svgBox.bottom - fittedTop } : svgBox;
      // Projection and borders can add a fractional pixel beyond the fitted height.
      const bounds = fittedBox && fittedBox.height <= window.innerHeight - bars - 22 ? fittedBox : mark.getBoundingClientRect();
      const delta = mapSelectionScrollDelta(bounds, bars, window.innerHeight);
      if (delta) window.scrollTo({ top: Math.max(0, window.scrollY + delta), left: window.scrollX, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected, folded, selectedKey, selectionToken, preserveFormScroll]);
  const onSheetKey = (event: KeyboardEvent<HTMLElement>) => {
    // React portal events bubble through the tree: Escape in a modal must leave this sheet alone.
    if (event.key !== 'Escape' || !event.currentTarget.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopPropagation();
    fold();
  };
  return (
    <div ref={workspace} className={cx('map-workspace', zoom && 'map-workspace-zoomable', side && 'map-workspace-with-side', selected && 'map-workspace-selected',
      folded && 'map-workspace-folded', sideFolded && 'map-workspace-side-folded', whole && viewToggle && 'map-workspace-whole', className)}
      style={zoom ? { '--map-aspect': zoom.aspect, '--map-zoom': zoomLevel } as CSSProperties : undefined}>
      {showToolbar && <div className={cx('map-workspace-toolbar', inlineToolbar && 'map-workspace-toolbar-row')}>{toolbar}</div>}
      {viewToggle && <div className="map-workspace-view">{viewToggle}</div>}
      {boardHeader && <div className="map-workspace-header">{boardHeader}</div>}
      <div className="map-workspace-grid">
        {side && <aside className={cx('map-workspace-side', sideFoldable && 'map-workspace-side-foldable', sideFolded && 'map-workspace-side-strip')} aria-label={sidePanelLabel}>
          {sideFolded && sideFold ? <>
            <button ref={sideReopenButton} type="button" className="btn tiny ghost map-workspace-side-reopen" aria-expanded={false} aria-controls={sideId}
              aria-label={sideFold.reopenLabel} onClick={() => toggleSide(false)}>{sideFold.reopenText}</button>
            {sideFold.strip}
          </> : sideFoldable && sideFold && <button ref={sideFoldButton} type="button" className="btn tiny ghost map-workspace-side-fold" aria-expanded aria-controls={sideId}
            aria-label={sideFold.foldLabel} title={sideFold.foldLabel} onClick={() => toggleSide(true)}><span aria-hidden="true">‹</span></button>}
          {/* Folded, the column's content is unmounted (its picture with it); its folds remember their state. */}
          <div id={sideId} className="map-workspace-side-content" hidden={sideFolded}>{!sideFolded && sidePanel}</div>
        </aside>}
        <div ref={column} className="map-workspace-column">
          {zoom ? <MapZoomFrame aspect={zoom.aspect} labels={zoom.labels} zoom={zoomLevel} onZoomChange={setZoomLevel}>{children}</MapZoomFrame> : children}
        </div>
        {selected && <aside className={cx('map-workspace-sheet', folded && 'map-workspace-sheet-folded')} onKeyDown={onSheetKey}>
          <div className="map-workspace-sheet-bar">
            <button ref={foldButton} type="button" className="btn tiny ghost map-workspace-fold" aria-expanded={!folded} aria-controls={sheetId} onClick={folded ? reopen : fold}>
              {folded ? reopenLabel : foldLabel}
            </button>
          </div>
          <div ref={sheetContent} id={sheetId} className="map-workspace-sheet-content" hidden={folded}>{sheet}</div>
        </aside>}
      </div>
    </div>
  );
}
