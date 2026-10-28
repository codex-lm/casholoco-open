import { isometricMessages } from '../../../i18n/isometric';
/**
 * The hex board's tools: « Chiffrer pour », the colours with their scale, the flows, « Aller à » and the legend.
 * Below 1200 px they share one row above the board, the last three as small menus (« Flux », « Aller à », « Légende »);
 * on wider screens the left column (`HexSidePanel`) keeps « Chiffrer pour » and the colours at its foot and the flows
 * and the legend in folds (`MapFlowFold`, `HexLegendFold`); « Aller à » is spread over its cards and folds there.
 * Reading aids only: no control here pays, bids or sends anything.
 */
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { boardCells, type Lang, type PlayerView } from '@muchomoney/core';
import { useT, useUiLang } from '../../../i18n';
import { mapWorkspaceMessages } from '../../../i18n/mapWorkspace';
import { hexReadabilityMessages } from '../../../i18n/hexReadability';
import { mapFlowText } from '../../../i18n/mapFlows';
import { freightMessages } from '../../../i18n/freight';
import { useFmt } from '../../../fmt';
import { cx } from '../../../util';
import { HexLegendMarks } from './HexBoard';
import { ISLAND_MARKER_COLORS } from './isometric/markers';
import { HEX_PALETTES, hexAnyBetter, hexLensRange, hexMarginQuintiles, hexReferenceIsRelative, hexSupplyFreight, type HexLens, type HexReference, type HexSupplyReference } from './hexModel';
import { hexLegendEnds, hexLegendSteps, hexLegendTitle } from './hexLegend';
import { mapDeliveryRange } from './mapDeliveryModel';
import { FLOW_MODES, type FlowMode } from './mapFlows';
import './mapFlows.css';
import './mapToolbar.css';

/** Focusable entries of an open menu, in document order (arrow keys move between them). */
function menuItems(panel: HTMLElement | null): HTMLElement[] {
  if (!panel || typeof panel.querySelectorAll !== 'function') return [];
  return Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled])'));
}

/**
 * Horizontal shift (px) that keeps an open panel inside the window, `margin` from each edge; the left edge wins when
 * the panel is wider than the window. A panel opening rightwards from a button far right on a 1280 px row would
 * otherwise be cut off (the page hides its horizontal overflow).
 */
export function menuPanelShift(left: number, right: number, viewportWidth: number, margin = 16): number {
  let shift = 0;
  if (right > viewportWidth - margin) shift = viewportWidth - margin - right;
  if (left + shift < margin) shift = margin - left;
  return Math.round(shift);
}

/** Re-places an open panel inside the window (its natural position first, then the shift that keeps it in view). */
function keepPanelInView(node: HTMLElement | null) {
  if (!node || typeof node.getBoundingClientRect !== 'function' || !node.style || typeof window === 'undefined') return;
  node.style.transform = '';
  const box = node.getBoundingClientRect();
  const width = (typeof document !== 'undefined' && document.documentElement?.clientWidth) || window.innerWidth;
  const shift = menuPanelShift(box.left, box.right, width);
  if (shift) node.style.transform = `translateX(${shift}px)`;
}

export interface ToolbarMenuProps {
  /** Button text: the menu's name and, when it has one, its current value. */
  label: ReactNode;
  /** Accessible name of the open panel. */
  panelLabel: string;
  /** « end » opens the panel leftwards, for menus near the right edge. Either way the panel is shifted to stay in the window. */
  align?: 'start' | 'end';
  className?: string;
  children: ReactNode;
}

/**
 * Non-modal menu, like « Décisions en attente »: the button says aria-expanded/aria-controls, the panel takes the
 * focus on opening, Escape closes it and gives the focus back to its button, a click outside or a Tab out closes
 * it, arrows (and Home/End) move between its entries. An entry marked data-menu-close (a destination) closes it.
 * The open panel stays inside the window, even when its content grows (a flow hint, the comparison select).
 */
export function ToolbarMenu({ label, panelLabel, align = 'start', className, children }: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = `map-menu-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  useEffect(() => {
    if (!open) return;
    (menuItems(panel.current)[0] ?? panel.current)?.focus();
    const place = () => keepPanelInView(panel.current);
    place();
    const resized = typeof ResizeObserver === 'undefined' || !panel.current ? null : new ResizeObserver(place);
    if (resized && panel.current) resized.observe(panel.current);
    if (typeof window !== 'undefined') window.addEventListener('resize', place);
    const outside = (event: Event) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      resized?.disconnect();
      if (typeof window !== 'undefined') window.removeEventListener('resize', place);
    };
  }, [open]);
  const onPanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // A select keeps its own arrows.
    if ((event.target as HTMLElement | null)?.tagName === 'SELECT') return;
    const items = menuItems(panel.current);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const target = event.key === 'ArrowDown' ? items[(index + 1) % items.length]
      : event.key === 'ArrowUp' ? items[(index - 1 + items.length) % items.length]
      : event.key === 'Home' ? items[0]
      : event.key === 'End' ? items[items.length - 1] : null;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  const onPanelClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    if (!target || typeof target.closest !== 'function' || !target.closest('[data-menu-close]')) return;
    setOpen(false);
    // The destination's own reveal (the map scrolls to the selected cell) must not be undone by this focus.
    trigger.current?.focus({ preventScroll: true });
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (open && next && box.current && !box.current.contains(next)) setOpen(false);
  };
  return <div ref={box} className={cx('map-menu', className)} onBlur={onBlur}>
    <button ref={trigger} type="button" className={cx('btn tiny ghost map-menu-button', open && 'active')} aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(!open)}>{label}<span aria-hidden="true"> ▾</span></button>
    {open && <div id={id} ref={panel} className={cx('map-menu-panel', align === 'end' && 'map-menu-panel-end')} role="group" aria-label={panelLabel}
      tabIndex={-1} onKeyDown={onPanelKey} onClick={onPanelClick}>{children}</div>}
  </div>;
}

export interface ReferenceGroup { label: string; options: readonly { key: string; label: string }[] }

/** A labelled native select with one optgroup per non-empty group (plain JSX, so its select stays reachable). */
function referenceSelect(label: string, value: string, groups: readonly ReferenceGroup[], onChange: (key: string) => void, className?: string) {
  return <label className={cx('map-product-picker', className)}>{label}
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {groups.filter((group) => group.options.length > 0).map((group) => <optgroup key={group.label} label={group.label}>
        {group.options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </optgroup>)}
    </select>
  </label>;
}

export interface MapReferencePickerProps {
  /** « Vos produits », then « Nouvelle usine » (the five sectors). */
  groups: readonly ReferenceGroup[];
  trackedKey: string;
  onTrackedChange: (key: string) => void;
}

/** The reference that the colours, the sheet's figures and the flows are computed for. Choosing one starts nothing. */
export function MapReferencePicker({ groups, trackedKey, onTrackedChange }: MapReferencePickerProps) {
  const text = mapWorkspaceMessages(useUiLang());
  return referenceSelect(text.figuresFor, trackedKey, groups, onTrackedChange, 'hx-reference-picker');
}

/** The colour scale and its title for the reference, as the board draws them. */
function useLegend(view: PlayerView, reference: HexReference | null, lens: HexLens, delta: boolean, supplyReference?: HexSupplyReference | null, delivery = false) {
  const h = useT().hex;
  const fmt = useFmt();
  const freight = freightMessages(useUiLang());
  const markers = hexReadabilityMessages(useUiLang());
  const marginDelta = !delivery && !supplyReference && delta && hexReferenceIsRelative(reference);
  const supplyValues = supplyReference ? boardCells(view.config).flatMap((hex) => hexSupplyFreight(view, supplyReference, hex.id) ?? []) : [];
  const range = delivery ? mapDeliveryRange(view, reference, supplyReference, lens) : supplyReference ? [Math.min(...supplyValues), Math.max(...supplyValues)] as [number, number]
    : lens === 'margin' ? hexMarginQuintiles(view, reference, marginDelta) : hexLensRange(view, reference, lens, marginDelta);
  return {
    title: hexLegendTitle(lens, marginDelta, h, freight, delivery ? {
      margin: markers.totalMargin,
      transport: supplyReference ? markers.supplyFreight : markers.deliveryTransport,
      demand: supplyReference ? markers.supplyDemand : markers.deliveryDemand,
    } : undefined),
    steps: hexLegendSteps(range, lens, fmt, h.legendBetween, delivery),
    ends: hexLegendEnds(range, lens, fmt, delivery),
    anyBetter: hexAnyBetter(view, reference, lens, marginDelta),
  };
}

export interface HexColorControlsProps {
  view: PlayerView;
  reference: HexReference | null;
  supplyReference?: HexSupplyReference | null;
  delivery?: boolean;
  lens: HexLens;
  delta: boolean;
  onLensChange: (lens: HexLens) => void;
  /** Named while « Colorer selon un autre produit » is on, so the colours never silently follow another reference. */
  comparedLabel?: string | null;
  /**
   * Left column: the tracked product's card already says « Rien de mieux ailleurs pour l'instant. » for the product
   * these colours are priced for, so the scale does not repeat « Aucune case libre ne bat la position actuelle. ».
   */
  hideNoBetter?: boolean;
}

/** « Couleurs : Marge · Fret · Demande · Aucune », the five bands in a compact scale, and « aucune case ne bat … ». */
export function HexColorControls({ view, reference, supplyReference, delivery = false, lens, delta, onLensChange, comparedLabel = null, hideNoBetter = false }: HexColorControlsProps) {
  const h = useT().hex;
  const text = mapWorkspaceMessages(useUiLang());
  const { title, steps, ends, anyBetter } = useLegend(view, reference, lens, delta, supplyReference, delivery);
  return <div className="hx-lenses hx-toolbar-colors" role="group" aria-label={comparedLabel ? text.colorsBy(comparedLabel) : h.colorsLabel}>
    <span>{comparedLabel ? text.colorsBy(comparedLabel) : h.colorsLabel}</span>
    {(['margin', 'transport', 'demand', 'plain'] as const).map((id) => <button key={id} type="button"
      className="hx-lens" aria-pressed={lens === id} onClick={() => onLensChange(id)}>{h.lens[id]}</button>)}
    {lens !== 'plain' && ends && steps.length > 0 && <span className="hx-scale" role="img" title={title}
      aria-label={text.scaleAria(title, ends[0], ends[ends.length - 1])}>
      <span className="hx-scale-end">{ends[0]}</span>
      {steps.map(({ index, label }) => <i key={index} className="hx-scale-band" title={label} style={{ backgroundColor: HEX_PALETTES[lens][index] }} />)}
      {ends.length > 1 && <span className="hx-scale-end">{ends[1]}</span>}
    </span>}
    {!delivery && !anyBetter && !hideNoBetter && <span className="hx-lens-note" role="status">{h.lensNoBetter}</span>}
  </div>;
}

export interface MapFlowMenuProps {
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  figures: boolean;
  onFiguresChange: (shown: boolean) => void;
  /** Renderers without labels on the map keep their figures in the information panels. */
  showFiguresToggle?: boolean;
  rivals: boolean;
  onRivalsChange: (shown: boolean) => void;
  /** A launch reference has no operational flows yet. */
  unavailable?: boolean;
  /** « Colorer selon un autre produit »: the colours and the sheet's figures follow comparedKey, the flows trackedKey. */
  compare: boolean;
  onCompareChange: (enabled: boolean) => void;
  groups: readonly ReferenceGroup[];
  trackedKey: string;
  comparedKey: string;
  onComparedChange: (key: string) => void;
}

/** The four modes, then (a layer on) « Chiffres », « Concurrents », the comparison and the hint: menu and side column alike. */
function flowContent({ mode, onModeChange, figures, onFiguresChange, showFiguresToggle = true, rivals, onRivalsChange, unavailable = false,
  compare, onCompareChange, groups, trackedKey, comparedKey, onComparedChange }: MapFlowMenuProps, lang: Lang) {
  const text = mapFlowText(lang);
  const workspace = mapWorkspaceMessages(lang);
  const on = mode !== 'off';
  const optionLabel = (key: string) => groups.flatMap((group) => group.options).find((option) => option.key === key)?.label ?? '';
  return <>
    <div className="map-flow-modes" role="group" aria-label={text.menuModes}>
      {FLOW_MODES.map((id) => (
        <button key={id} type="button" className="btn tiny ghost map-flow-button" aria-pressed={mode === id} onClick={() => onModeChange(id)}>
          {text.mode[id]}
        </button>
      ))}
    </div>
    {on && <div className="map-flow-options">
      {showFiguresToggle && <label><input type="checkbox" checked={figures} onChange={(event) => onFiguresChange(event.target.checked)} /> {text.figures}</label>}
      <label><input type="checkbox" checked={rivals} onChange={(event) => onRivalsChange(event.target.checked)} /> {text.rivals}</label>
      <label><input type="checkbox" checked={compare} onChange={(event) => onCompareChange(event.target.checked)} /> {workspace.colorByOther}</label>
    </div>}
    {on && compare && <>
      {referenceSelect(workspace.colorBySelect, comparedKey, groups, onComparedChange, 'map-compared-picker')}
      <p className="map-comparison" role="status">{workspace.comparison(optionLabel(trackedKey), optionLabel(comparedKey))}</p>
    </>}
    {on && <p className="map-flow-hint" role={unavailable ? 'status' : undefined}>
      {unavailable ? workspace.needsProduct : text.hint[mode]}
    </p>}
  </>;
}

/** « Flux : aucun », « Flux : ventes (sans produit) »: the layer that is on, and when it has nothing to draw. */
function flowLabel({ mode, unavailable = false }: Pick<MapFlowMenuProps, 'mode' | 'unavailable'>, lang: Lang): string {
  const text = mapFlowText(lang);
  // A layer left on with a new-factory reference draws nothing: the closed button says so too.
  return mode !== 'off' && unavailable ? text.menuNoProduct(text.modeShort[mode]) : text.menu(text.modeShort[mode]);
}

/** « Flux : aucun ▾ »: the button always names the layer that is on, so a layer left on never goes unnoticed. */
export function MapFlowMenu(props: MapFlowMenuProps) {
  const lang = useUiLang();
  return <ToolbarMenu label={flowLabel(props, lang)} panelLabel={mapFlowText(lang).menuPanel} className="map-flow-menu">{flowContent(props, lang)}</ToolbarMenu>;
}

/** A fold of the left column whose open state the column remembers (`casholoco.map.sideOpen`). */
export interface SideFoldProps { open: boolean; onToggle: (open: boolean) => void }

/**
 * Left column: « Flux » as a fold closed by default, its summary naming the layer like the menu's button (a layer left
 * on never hides behind a closed fold); inside, the four modes and, a layer on, its options. The layer's figures for
 * the tracked product sit in that product's card.
 */
export function MapFlowFold({ open, onToggle, ...props }: MapFlowMenuProps & SideFoldProps) {
  const lang = useUiLang();
  return <details className="hx-side-fold map-flow-fold" open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
    <summary>{flowLabel(props, lang)}</summary>
    <div className="hx-side-fold-body map-flow-panel" role="group" aria-label={mapFlowText(lang).menuPanel}>{flowContent(props, lang)}</div>
  </details>;
}

export interface GoToEntry { key: string; label: string; hexId: string }
export interface GoToGroup {
  key: string;
  /** No label: the entries stand alone (« Gisements et filiales »). */
  label?: string;
  entries: readonly GoToEntry[];
}

export interface MapGoToProps { groups: readonly GoToGroup[]; onGo: (hexId: string) => void }

/** The non-empty groups and their entries; an entry also closes the menu (data-menu-close). */
function goToSections({ groups, onGo }: MapGoToProps) {
  return groups.filter((group) => group.entries.length > 0).map((group) => <div key={group.key} className="map-menu-section" data-goto-group={group.key}
    role={group.label ? 'group' : undefined} aria-label={group.label}>
    {group.label && <p className="map-menu-heading" aria-hidden="true">{group.label}</p>}
    <ul>{group.entries.map((entry) => <li key={entry.key}>
      <button type="button" className="map-menu-item" data-menu-close data-goto-hex={entry.hexId} onClick={() => onGo(entry.hexId)}>{entry.label}</button>
    </li>)}</ul>
  </div>);
}

/** « Aller à ▾ »: each entry selects its cell exactly like a click on the board. Empty groups are left out. */
export function MapGoToMenu(props: MapGoToProps) {
  const text = mapWorkspaceMessages(useUiLang());
  return <ToolbarMenu label={text.goTo} panelLabel={text.goTo} className="map-goto-menu">{goToSections(props)}</ToolbarMenu>;
}

export interface HexLegendProps { view: PlayerView; reference: HexReference | null; supplyReference?: HexSupplyReference | null; delivery?: boolean; inspection?: boolean; lens: HexLens; delta: boolean }

/** The island uses modelled buildings and ownership flags rather than the flat board's event symbols. */
function IslandLegendMarks({ view }: { view: PlayerView }) {
  const text = isometricMessages(useUiLang());
  const markers = hexReadabilityMessages(useUiLang());
  const cellIds = new Set(boardCells(view.config).map(cell => cell.id));
  const ownerIds = new Set([
    ...Object.values(view.hexes?.occupied ?? {}),
    ...view.siteSlots.flatMap(slot => slot.companyId ?? []),
    ...view.companies.filter(company => company.land?.some(land => cellIds.has(land.hexId))).map(company => company.id),
  ]);
  const owners = view.companies.filter(company => company.status === 'active' && ownerIds.has(company.id));
  return <>
    <div className="hx-legend-marks iso-legend-marks">
      <span><i style={{ borderColor: ISLAND_MARKER_COLORS.selected }} aria-hidden="true" />{text.selected}</span>
      <span><i style={{ borderColor: ISLAND_MARKER_COLORS.hover }} aria-hidden="true" />{text.inspect} / {text.place}</span>
      <span><i style={{ borderColor: ISLAND_MARKER_COLORS.reference }} aria-hidden="true" />{text.reference}</span>
    </div>
    <p className="iso-legend-ownership">{text.ownership}</p>
    {owners.length > 0 && <div className="hx-territory-legend" aria-label={markers.territories}>
      {owners.map(company => <span key={company.id}><i style={{ backgroundColor: company.color }} aria-hidden="true" />{company.name}</span>)}
    </div>}
  </>;
}

/** What the colours measure with their bands, the board's symbols, the keyboard hint and how to zoom the frame. */
function HexLegendContent({ view, reference, supplyReference, delivery = false, inspection = false, lens, delta }: HexLegendProps) {
  const h = useT().hex;
  const islandText = isometricMessages(useUiLang());
  const { title, steps } = useLegend(view, reference, lens, delta, supplyReference, delivery);
  const markers = hexReadabilityMessages(useUiLang());
  const island = view.config.mapMode === 'square';
  return <>
    <div className={cx('hx-legend', island && 'iso-legend')}>
      <strong>{title}</strong>
      {lens !== 'plain' && steps.length > 0 && <div className="hx-legend-scale">{steps.map(({ index, label }) => <span key={index} className="hx-legend-step">
        <i style={{ backgroundColor: HEX_PALETTES[lens][index] }} aria-hidden="true" /><span>{label}</span>
      </span>)}</div>}
      {island ? <IslandLegendMarks view={view} /> : <HexLegendMarks ranks={!inspection && !delivery && lens === 'margin'} view={view} inspection={inspection} />}
    </div>
    {island ? <p className="hx-keyboard-hint">{islandText.keyboard}</p> : inspection ? <p className="hx-keyboard-hint">{markers.inspectHint}</p> : <>
      <p className="hx-keyboard-hint">{h.keyboardHint}</p>
      <p className="hx-keyboard-hint">{markers.keyboardReference}</p>
    </>}
    {delivery && lens === 'margin' && <p className="hx-keyboard-hint">{markers.fullDemandBasis}</p>}
    {delivery && !supplyReference && <p className="hx-keyboard-hint">{markers.marketBasis}</p>}
    <p className="hx-keyboard-hint">{island ? islandText.controls : h.zoomHint}</p>
  </>;
}

/** « Légende ▾ »: what the colours measure with their bands, the board's symbols, the keyboard and zoom hints. */
export function HexLegendMenu(props: HexLegendProps) {
  const text = mapWorkspaceMessages(useUiLang());
  return <ToolbarMenu label={text.legend} panelLabel={text.legend} align="end" className="hx-legend-menu">
    <HexLegendContent {...props} />
  </ToolbarMenu>;
}

/**
 * Side column: the same legend in a fold closed by default, last of the column's folds. With `open` / `onToggle`, the
 * column remembers whether it was left open.
 */
export function HexLegendFold({ open, onToggle, ...props }: HexLegendProps & Partial<SideFoldProps>) {
  const text = mapWorkspaceMessages(useUiLang());
  return <details className="hx-side-section hx-side-fold hx-legend-fold" open={open} onToggle={onToggle ? (event) => onToggle(event.currentTarget.open) : undefined}>
    <summary>{text.legend}</summary>
    <HexLegendContent {...props} />
  </details>;
}
