import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { COASTLINE, DEPOSITS, HEX_R, SQUARE_SIZE, boardCells, ISLAND, LAKE, SECTORS, hexPlaceLabel, hexReservePrice, type PlayerView } from '@muchomoney/core';
import { useElementWidth } from '../../../hooks/useElementWidth';
import { useContent, useRoomLang, useT, useUiLang } from '../../../i18n';
import { hexReadabilityMessages } from '../../../i18n/hexReadability';
import { freightMessages } from '../../../i18n/freight';
import { useFmt } from '../../../fmt';
import { cx } from '../../../util';
import { BaseMap, MAP_VIEW } from './BaseMap';
import { mapScale, smoothPath } from './mapModel';
import { COMMODITY_GLYPH } from './MapSheets';
import { COMMODITY_ACCENT } from '../factories/parts';
import { MapFlowLayer, type LabelBox } from './MapFlowLayer';
import type { FlowMode, FlowModel } from './mapFlows';
import {
  HEX_NEUTRAL, HEX_PALETTES, defaultHexReference, hexArrowTarget, hexFactory,
  hexAnyBetter, hexIsBuildable, hexLensColor, hexLensRange, hexLensValue, hexMarginQuintiles, hexParcel, hexRanks,
  hexReferenceHexId, hexReferenceIsRelative, hexReferenceKey, hexReferenceOptions, hexSupplyFreight, type HexLens, type HexReference, type HexSupplyReference,
} from './hexModel';
import { isOwn, liveHexBids } from './privacy';
import { hexLegendSteps, hexLegendTitle } from './hexLegend';
import { mapDeliveryLensValue, mapDeliveryRange } from './mapDeliveryModel';
import { MAP_ACTIVITY_MIME } from './MapActivityPalette';
import './hex.css';

export interface HexBoardProps {
  view: PlayerView;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Map tab: inspect destinations on hover or focus without changing the selected origin. */
  onInspect?: (id: string | null) => void;
  /** Map tab: double-click or Shift+Enter chooses the delivery origin. */
  onSelectReference?: (id: string) => void;
  /** Native palette drop: the parent validates the activity key against the current redacted view. */
  onDropActivity?: (id: string, key: string) => void;
  reference?: HexReference | null;
  supplyReference?: HexSupplyReference | null;
  delivery?: boolean;
  lens?: HexLens;
  /** Margin change from the reference product's current cell; launch references stay absolute. */
  delta?: boolean;
  ranks?: boolean;
  /** Picker mode keeps occupied and deposit cells visible but disables their selection. */
  selectableOnlyFree?: boolean;
  showToolbar?: boolean;
  /** The map tab shows the colour scale in its toolbar and the marks in its « Légende » menu instead. */
  showLegend?: boolean;
  onReferenceChange?: (ref: HexReference) => void;
  onLensChange?: (lens: HexLens) => void;
  /** Optional operational layers used by the map tab (none = the board as it always was; placement pickers pass none). */
  flowModel?: FlowModel | null;
  flowMode?: FlowMode;
  showFlowFigures?: boolean;
  /** false mutes rivals' factory icons while a layer is on. */
  showRivals?: boolean;
  /**
   * The drawing is projected at least this wide, then scaled down to its box (the map tab's frame fitted to a short
   * window): cell ids, names and badges keep their size relative to the cells instead of crowding them. A wider box
   * (a zoomed frame) is drawn at its own width.
   */
  minDrawWidth?: number;
}

/** Narrowest projection of the map tab's board: below it, the drawing shrinks as a whole. */
export const HEX_MIN_DRAW_WIDTH = 760;

const CITY = 'M1 14V6h5v8 M6 14V1h6v13 M12 14V8h5v6 M0 14h18 M3 8v2 M8 4v2 M10 4v2 M8 9v2 M10 9v2 M14 10v2';
const ISLAND_CENTRE = { x: ISLAND.reduce((s, p) => s + p.x, 0) / ISLAND.length, y: ISLAND.reduce((s, p) => s + p.y, 0) / ISLAND.length };
const ENVELOPE = 'M1 3h14v10H1z M1 3l7 5 7-5';
const HAMMER = 'M3 2l3-1 4 5-3 2z M7 7l6 7 M2 14h8';
const STAR = 'M8 1l2 4.3 4.7.7-3.4 3.3.8 4.7L8 11.8l-4.2 2.2.8-4.7L1.2 6l4.7-.7z';
const SELECTED_COLOR = '#8b2f4a', BID_COLOR = '#a66012', RANK_COLOR = '#e4bb5d';
const REFERENCE_COLOR = SELECTED_COLOR;

/** The board's symbols (selection, own cell, terrain, pending bid, award, ranks, deposits), under the board or in a menu. */
export function HexLegendMarks({ ranks, view, inspection = false }: { ranks: boolean; view?: PlayerView; inspection?: boolean }) {
  const h = useT().hex;
  const markers = hexReadabilityMessages(useUiLang());
  const ownColor = view?.companies.find(isOwn)?.color ?? '#8a8273';
  const territoryIds = new Set([...Object.values(view?.hexes?.occupied ?? {}), ...(view?.siteSlots ?? []).flatMap((slot) => slot.companyId ?? [])]);
  const territories = view?.companies.filter((company) => territoryIds.has(company.id) && company.status === 'active') ?? [];
  return <div className="hx-legend-marks">
    <span><i className="hx-reference-mark" aria-hidden="true" />{markers.reference}</span>
    {inspection ? <span><i className="hx-hover-mark" aria-hidden="true" />{markers.hoverMark}</span>
      : <span><i className="hx-selected-mark" aria-hidden="true" />{markers.selected}</span>}
    <span><i className="hx-own-mark" style={{ color: ownColor }} aria-hidden="true" />{markers.mine}</span>
    <span><svg className="hx-city-legend" viewBox="-1 -1 20 17" aria-hidden="true"><path d={CITY} fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>{markers.cityMark}</span>
    <span>☆ {h.legendTerrain}</span><span><svg className="hx-pending-mark" viewBox="-2 -1 20 18" aria-hidden="true"><rect x="-1" y="0" width="18" height="16" rx="2" fill="#fff4d8" stroke={BID_COLOR} strokeWidth="1.5" /><path d={ENVELOPE} fill="none" stroke={BID_COLOR} strokeWidth="1.5" /></svg>{h.legendPending}</span>
    <span>⚒ {h.legendAwarded}</span>{ranks && <span><i className="hx-rank-mark" aria-hidden="true">1</i>{h.legendRanks}</span>}<span>{h.legendDeposits}</span>
    {territories.length > 0 && <div className="hx-territory-legend" aria-label={markers.territories}>
      <p>{markers.territoryHint}</p>
      {territories.map((company) => <span key={company.id}><i style={{ backgroundColor: company.color }} aria-hidden="true" />{company.name}</span>)}
    </div>}
  </div>;
}

export function HexBoard({ view, selectedId, onSelect, onInspect, onSelectReference, onDropActivity, reference, supplyReference, delivery = false, lens, delta = false, ranks = false,
  selectableOnlyFree = false, showToolbar = true, showLegend = true, onReferenceChange, onLensChange,
  flowModel, flowMode = 'off', showFlowFigures = true, showRivals = true, minDrawWidth = 0 }: HexBoardProps) {
  const t = useT();
  const grid = boardCells(view.config);
  const h = t.hex;
  const uiLang = useUiLang();
  const freightText = freightMessages(uiLang);
  const markers = hexReadabilityMessages(useUiLang());
  const content = useContent();
  const fmt = useFmt();
  const roomLang = useRoomLang();
  const [mapRef, width] = useElementWidth<HTMLDivElement>(680);
  const [localLens, setLocalLens] = useState<HexLens>('margin');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [localReference, setLocalReference] = useState<HexReference | null>(() => defaultHexReference(view));
  const currentLens = lens ?? localLens;
  const currentReference = reference === undefined ? localReference ?? defaultHexReference(view) : reference;
  const marginDelta = !delivery && !supplyReference && delta && hexReferenceIsRelative(currentReference);
  const options = useMemo(() => hexReferenceOptions(view), [view]);
  const drawWidth = Math.max(width, minDrawWidth);
  const proj = useMemo(() => mapScale(drawWidth, MAP_VIEW), [drawWidth]);
  const ranking = useMemo(() => hexRanks(view, currentReference, marginDelta), [view, currentReference, marginDelta]);
  const range = useMemo(() => {
    if (delivery) return mapDeliveryRange(view, currentReference, supplyReference, currentLens);
    if (supplyReference) {
      const values = grid.flatMap((hex) => hexSupplyFreight(view, supplyReference, hex.id) ?? []);
      return values.length ? [Math.min(...values), Math.max(...values)] as [number, number] : null;
    }
    return currentLens === 'margin' ? hexMarginQuintiles(view, currentReference, marginDelta) : hexLensRange(view, currentReference, currentLens, marginDelta);
  }, [view, currentReference, currentLens, marginDelta, supplyReference, delivery]);
  const cells = useRef(new Map<string, SVGGElement>());
  // A native double click arrives after its first click has already selected a destination.
  // Keep that earlier destination across renders, then restore it when choosing the origin.
  const beforeClick = useRef<{ cellId: string; destinationId: string | null } | null>(null);
  // Two boards can share a page (map tab and a bid form).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const landClip = `hx-land-${uid}`;
  // Parcels stop at the shore: the mainland minus the lake (one even-odd path), plus the island, which is a cell by itself.
  const shore = useMemo(() => {
    const smooth = (points: typeof COASTLINE) => smoothPath(points.map((p) => ({ x: proj.px(p.x), y: proj.py(p.y) })), true);
    return { mainland: `${smooth(COASTLINE)} ${smooth(LAKE)}`, island: smooth(ISLAND) };
  }, [proj]);
  // The island cell is drawn as a generous hexagon that the island clip trims to the island's exact shape.
  const islandCell = (hex: (typeof grid)[number]) => Array.from({ length: 6 }, (_, i) => {
    const angle = (60 * i - 90) * Math.PI / 180;
    return `${proj.px(hex.x + 1.8 * HEX_R * Math.cos(angle)).toFixed(2)},${proj.py(hex.y + 1.8 * HEX_R * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
  const free = new Set(view.hexes?.free ?? []);
  const controlled = new Set(view.companies.filter((company) => isOwn(company) && company.controllerId === view.you).map((company) => company.id));
  const pendingSlots = new Set((view.self?.siteBids ?? []).filter((bid) => !bid.result && controlled.has(bid.companyId)).map((bid) => bid.slotId));
  const pending = new Set([...liveHexBids(view).map((b) => b.hexId), ...grid.filter((hex) => hex.deposit && pendingSlots.has(hex.deposit)).map((hex) => hex.id)]);
  const awarded = new Set((view.hexes?.results ?? []).map((r) => r.hexId));
  const allowed = (id: string) => !selectableOnlyFree || (hexIsBuildable(id) && free.has(id));
  const canReference = (_id: string) => Boolean(onSelectReference && !onInspect && !selectableOnlyFree);
  const canDrop = Boolean(onDropActivity && !selectableOnlyFree);
  const chooseClickedOrigin = (fallbackId?: string) => {
    const previous = beforeClick.current;
    // Opening the destination sheet can resize the board before the second click lands.
    const originId = previous?.cellId ?? fallbackId;
    if (!originId || !canReference(originId)) return;
    beforeClick.current = null;
    if (previous?.destinationId) onSelect(previous.destinationId);
    onSelectReference?.(originId);
  };
  const keyboard = (event: KeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === 'Enter' && event.shiftKey && canReference(id)) {
      event.preventDefault();
      onSelectReference?.(id);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (allowed(id) || !selectableOnlyFree) onSelect(id);
      return;
    }
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const next = hexArrowTarget(id, event.key, allowed);
    if (!next) return;
    if (onInspect) onInspect(next);
    else onSelect(next);
    cells.current.get(next)?.focus();
  };
  const legend = hexLegendSteps(range, currentLens, fmt, h.legendBetween, delivery);
  const selectedHex = grid.find((hex) => hex.id === selectedId);
  const referenceHexId = supplyReference?.originHexId ?? hexReferenceHexId(view, currentReference);
  const referenceHex = grid.find((hex) => hex.id === referenceHexId);
  const referenceProduct = currentReference?.kind === 'product' ? view.companies.filter(isOwn).flatMap(company => company.products).find(p => p.id === currentReference.productId) : null;
  const referenceSector = currentReference?.kind === 'launch' ? currentReference.sectorId : referenceProduct?.sectorId;
  const ghost = Boolean(referenceHex && (supplyReference
    ? !view.siteSlots.some(slot => slot.id === referenceHex.deposit && slot.commodityId === supplyReference.commodityId && slot.companyId && controlled.has(slot.companyId))
    : currentReference?.originHexId && referenceProduct?.hexId !== referenceHex.id));
  const anchorPoint = (hex: (typeof grid)[number]) => hex.terrain === 'island' ? ISLAND_CENTRE : hex;
  // Direct labels retain a readable screen size when the fitted drawing is scaled down.
  const displayRatio = drawWidth / Math.max(width, 1);
  const markFont = 12 * displayRatio;
  const markLabels = onSelectReference || onInspect ? [
    ...(referenceHex ? [{ hex: referenceHex, origin: true, name: supplyReference ? content.commodities[supplyReference.commodityId].name
      : referenceProduct?.name ?? (referenceSector ? content.sectors[referenceSector].name : '') }] : []),
    ...(selectedHex && selectedHex.id !== referenceHex?.id ? [{ hex: selectedHex, origin: false, name: selectedHex.city ? content.mapNames.cities[selectedHex.city]
      : selectedHex.deposit ? view.siteSlots.find(slot => slot.id === selectedHex.deposit)?.name ?? '' : '' }] : []),
  ].map(mark => {
    const point = anchorPoint(mark.hex), title = `${mark.origin ? markers.origin : markers.targetMark} · ${mark.hex.id}`;
    const fullName = mark.origin && ghost ? `${markers.simulated} · ${mark.name}` : mark.name;
    const name = fullName.length > 19 ? `${fullName.slice(0, 18)}…` : fullName;
    const labelWidth = Math.max(title.length, name.length) * markFont * .58 + 12 * displayRatio;
    const labelHeight = (name ? 36 : 21) * displayRatio;
    const x = Math.max(labelWidth / 2 + 3, Math.min(proj.width - labelWidth / 2 - 3, proj.px(point.x)));
    const yBelow = proj.py(point.y) + HEX_R * proj.scale + 4 * displayRatio;
    const yAbove = proj.py(point.y) - HEX_R * proj.scale - labelHeight - 4 * displayRatio;
    const y = !mark.origin && yAbove > 4 || yBelow + labelHeight > proj.height - 4 ? Math.max(4, yAbove) : yBelow;
    return { ...mark, title, shortName: name, x, y, width: labelWidth, height: labelHeight };
  }) : [];
  if (markLabels.length === 2) {
    const [a, b] = markLabels;
    if (Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 4 && a.y < b.y + b.height && b.y < a.y + a.height) {
      const below = a.y + a.height + 4 * displayRatio;
      b.y = below + b.height < proj.height ? below : Math.max(4, a.y - b.height - 4 * displayRatio);
    }
  }
  const scenarioRoute = onSelectReference && delivery && referenceHex && selectedHex && referenceHex.id !== selectedHex.id ? (() => {
    const a = anchorPoint(referenceHex), b = anchorPoint(selectedHex);
    const ax = proj.px(a.x), ay = proj.py(a.y), bx = proj.px(b.x), by = proj.py(b.y);
    const length = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / length, uy = (by - ay) / length;
    const inset = Math.min(HEX_R * proj.scale * .65, length * .25);
    const x1 = ax + ux * inset, y1 = ay + uy * inset, x2 = bx - ux * inset, y2 = by - uy * inset;
    const head = 8 * displayRatio;
    return { d: `M${x1} ${y1}L${x2} ${y2}`, head: `${x2},${y2} ${x2 - ux * head - uy * head / 2},${y2 - uy * head + ux * head / 2} ${x2 - ux * head + uy * head / 2},${y2 - uy * head - ux * head / 2}` };
  })() : null;
  // Flow labels never cover a factory/city symbol nor a city name.
  const flows = !!flowModel && flowMode !== 'off';
  const iconBoxes: LabelBox[] = flows ? Object.keys(view.hexes?.occupied ?? {}).flatMap((id) => {
    const hex = grid.find((cell) => cell.id === id);
    if (!hex || !hexFactory(view, id)) return [];
    const anchor = hex.terrain === 'island' ? ISLAND_CENTRE : hex;
    const x = proj.px(anchor.x), y = proj.py(anchor.y);
    return [{ x: x - 11, y: hex.city ? y : y - 14, width: 22, height: hex.city ? 15 : 21 }];
  }) : [];
  if (flows) iconBoxes.push(...markLabels.map(mark => ({ x: mark.x - mark.width / 2, y: mark.y, width: mark.width, height: mark.height })));
  // Nor a city name: the box spans every position the name's lines take (with or without factory or rank badge).
  if (flows) for (const hex of grid) {
    if (!hex.city) continue;
    const parts = (content.mapNames.cities[hex.city] ?? '').split(/[-\s]+/).slice(0, 3);
    const x = proj.px(hex.x), y = proj.py(hex.y), radius = HEX_R * proj.scale;
    const width = Math.max(...parts.map((part) => part.length)) * 6.2 + 6;
    const top = y - radius * .67 - 9;
    iconBoxes.push({ x: x - width / 2, y: top, width, height: y - radius * .3 + parts.length * 9 - top });
  }
  const anyBetter = hexAnyBetter(view, currentReference, currentLens, marginDelta);

  return (
    <div className={cx('hx-board', flows && !showRivals && 'hx-rivals-muted')}>
      {showToolbar && (
        <div className="hx-toolbar">
          <div className="hx-lenses" role="group" aria-label={h.colorsLabel}>
            <span>{h.colorsLabel}</span>
            {(['margin', 'transport', 'demand', 'plain'] as const).map((id) => (
              <button key={id} type="button" className="hx-lens" aria-pressed={currentLens === id} onClick={() => {
                if (onLensChange) onLensChange(id); else setLocalLens(id);
              }}>{h.lens[id]}</button>
            ))}
          </div>
          {options.length > 0 && <label className="hx-reference">
            <span>{h.referenceLabel}</span>
            <select value={currentReference ? hexReferenceKey(currentReference) : ''} onChange={(event) => {
              const option = options.find((o) => o.key === event.target.value);
              if (option) { if (onReferenceChange) onReferenceChange(option.ref); else setLocalReference(option.ref); }
            }}>
              {options.map((o) => <option key={o.key} value={o.key}>{o.ref.kind === 'launch' ? h.launchReference(content.sectors[o.ref.sectorId].name) : o.label}</option>)}
            </select>
          </label>}
        </div>
      )}
      <div className="hx-map" ref={mapRef} onMouseLeave={onInspect ? () => onInspect(null) : undefined}
        onBlur={onInspect ? event => { if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) onInspect(null); } : undefined}
        onClick={(event) => {
        // A fresh gesture on the scenery must not reuse a previous parcel's click.
        if (event.detail < 2 && event.target instanceof Element && !event.target.closest('.hx-cell')) beforeClick.current = null;
      }} onDoubleClick={onInspect ? undefined : () => chooseClickedOrigin()}>
        <BaseMap proj={proj} small={false} names={content.mapNames.landmarks} scaleBar={t.city.map.scaleBar}
          mapAria={view.config.mapMode === 'square' ? (uiLang === 'en' ? `Island board with ${grid.length} square parcels` : `Plateau de l’île : ${grid.length} parcelles carrées`) : h.boardAria}>
          <defs>
            <clipPath id={landClip}>
              <path d={shore.mainland} clipRule="evenodd" />
              <path d={shore.island} />
            </clipPath>
          </defs>
          <g className="hx-grid" clipPath={`url(#${landClip})`}>
            {grid.map((hex) => {
              const factory = hexFactory(view, hex.id);
              const buildable = hexIsBuildable(hex.id);
              const canSelect = !selectableOnlyFree || (buildable && free.has(hex.id));
              const theoretical = delivery || Boolean(currentReference?.originHexId || supplyReference);
              const value = delivery ? mapDeliveryLensValue(view, currentReference, supplyReference, hex.id, currentLens) : supplyReference ? hexSupplyFreight(view, supplyReference, hex.id)
                : free.has(hex.id) || theoretical ? hexLensValue(view, currentReference, hex.id, currentLens, marginDelta) : null;
              const better = marginDelta && currentLens === 'margin' && value !== null && value > 0;
              const selected = hex.id === selectedId;
              const terrain = view.terrains?.find((ter) => ter.hex === hex.id);
              const deposit = hex.deposit ? DEPOSITS[hex.deposit] : null;
              const slot = hex.deposit ? view.siteSlots.find((s) => s.id === hex.deposit) : null;
              const operator = slot?.companyId ? view.companies.find((company) => company.id === slot.companyId) : null;
              const owner = factory?.company ?? (operator?.status === 'active' ? operator : null);
              const mine = !!factory?.mine || !!(operator && isOwn(operator));
              const ownColor = owner?.color ?? '#8a8273';
              const cityName = hex.city ? content.mapNames.cities[hex.city] : null;
              const rank = ranking.get(hex.id);
              const current = hex.id === referenceHexId;
              const details: string[] = [];
              if (factory) details.push(h.occupiedAria(factory.company.name), ...(factory.mine && factory.product ? [h.ownAria] : []));
              else if (deposit) details.push(h.depositAria(slot?.name ?? content.commodities[deposit.commodityId].name), ...(owner ? [h.depositOperatedBy(owner.name)] : []), ...(mine ? [markers.ownDepositAria] : []));
              else details.push(h.freeAria);
              if (cityName) details.push(h.cityAria(cityName));
              if (value !== null) details.push(currentLens === 'margin' ? delivery ? `${markers.totalMargin} : ${fmt.signedMoney(value)}` : marginDelta ? h.deltaAria(fmt.signedMoney(value)) : h.marginAria(fmt.signedMoney(value)) : currentLens === 'transport' ? h.transportAria(marginDelta ? `${value > 0 ? '+' : ''}${fmt.lotPrice(value)}` : fmt.lotPrice(value)) : delivery ? `${supplyReference ? markers.supplyDemand : markers.deliveryDemand} : ${fmt.lots(value, 3)}` : h.demandAria(fmt.lots(value)));
              if (ranks && currentLens === 'margin' && rank) details.push(h.rankAria(rank));
              if (buildable) details.push(h.reserveAria(fmt.money(view.hexes?.reserve[hex.id] ?? hexReservePrice(hex.id))));
              if (terrain) details.push(h.terrainAria(terrain.name));
              if (pending.has(hex.id)) details.push(h.pendingAria);
              if (awarded.has(hex.id)) details.push(h.awardedAria);
              if (selected) details.push(h.selectedAria);
              if (current) details.push(markers.referenceAria);
              if (canReference(hex.id)) details.push(markers.chooseReferenceAria);
              else if (onInspect) details.push(markers.inspectHint);
              const aria = h.cellAria(hexPlaceLabel(hex.id, roomLang, view.siteSlots), details.join(', '));
              // The island's marks sit on the island itself, not on the engine's cell centre out at sea.
              const anchor = hex.terrain === 'island' ? ISLAND_CENTRE : hex;
              const x = proj.px(anchor.x), y = proj.py(anchor.y), radius = (hex.terrain === 'island' ? 0.75 : 1) * HEX_R * proj.scale;
              // Occupied land keeps the company's Stock-market identity in every lens. Free destinations use the scale.
              const fill = owner?.color ?? hexLensColor(value, currentLens, range);
              const washed = !owner && fill !== HEX_NEUTRAL;
              const outline = hex.terrain === 'island' ? islandCell(hex) : hexParcel(hex, proj);
              const color = '#1b1a17';
              const rankRadius = cityName ? Math.min(8, radius * .2) : 10;
              const rankX = cityName ? x + radius * .6 : x;
              const rankY = cityName ? y + radius * .12 : y - radius * .16;
              return (
                <g key={hex.id} data-map-selection={selected || undefined} data-map-reference={current || undefined} data-map-drop-cell={canDrop ? hex.id : undefined} ref={(node) => { if (node) cells.current.set(hex.id, node); else cells.current.delete(hex.id); }}
                  role="button" tabIndex={canSelect ? 0 : -1} aria-disabled={!canSelect || undefined} aria-pressed={selected}
                  aria-keyshortcuts={canReference(hex.id) ? 'Shift+Enter' : undefined}
                  aria-label={aria} className={cx('hx-cell', selected && 'hx-cell-selected', mine && 'hx-cell-mine', factory && !factory.mine && 'hx-cell-rival', pending.has(hex.id) && 'hx-cell-pending', ranks && currentLens === 'margin' && !!rank && 'hx-cell-ranked', !canSelect && 'hx-cell-disabled', dropTarget === hex.id && 'hx-cell-drop')}
                  onMouseEnter={onInspect ? () => onInspect(hex.id) : undefined}
                  onFocus={onInspect ? () => onInspect(hex.id) : undefined}
                  onDragOver={canDrop ? event => { if (event.dataTransfer.types.includes(MAP_ACTIVITY_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropTarget(hex.id); } } : undefined}
                  onDragLeave={canDrop ? event => { if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); } : undefined}
                  onDrop={canDrop ? event => {
                    const key = event.dataTransfer.getData(MAP_ACTIVITY_MIME);
                    if (!key) return;
                    event.preventDefault(); event.stopPropagation(); beforeClick.current = null; setDropTarget(null);
                    onDropActivity?.(hex.id, key);
                  } : undefined}
                  onClick={(event) => {
                    if (!canSelect) return;
                    if (onInspect && event.detail > 1) return;
                    if (canReference(hex.id)) {
                      if (event.detail > 1) return;
                      beforeClick.current = event.detail === 1 ? { cellId: hex.id, destinationId: selectedId } : null;
                    }
                    onSelect(hex.id);
                  }} onDoubleClick={onInspect ? undefined : () => chooseClickedOrigin(hex.id)} onKeyDown={(event) => { beforeClick.current = null; keyboard(event, hex.id); }}>
                  <title>{aria}</title>
                  <polygon data-hex-id={hex.id} data-buildable={buildable} data-owner-company={owner?.id} className="hx-parcel" points={outline} fill={fill} fillOpacity={owner ? .48 : washed ? .55 : 0}
                    style={washed ? { mixBlendMode: 'multiply' } : undefined} strokeLinejoin="round"
                    stroke={owner ? ownColor : '#5b544a'} strokeOpacity={owner ? 1 : 0.4}
                    strokeWidth={owner ? 2.6 : 0.7} />
                  <g aria-hidden="true" pointerEvents="none">
                    {deposit && <g transform={`translate(${x - 8} ${y - 8})`} fill="none" stroke={COMMODITY_ACCENT[deposit.commodityId]} strokeWidth="1.4">{COMMODITY_GLYPH[deposit.commodityId]}</g>}
                    {cityName && <g className="hx-city-mark" transform={`translate(${x - 8} ${y + radius * .04}) scale(.85)`}><rect x="-2" y="-2" width="22" height="18" rx="2" fill="#faf6ec" fillOpacity=".9" /><path d={CITY} fill="none" stroke={color} strokeWidth="1.4" /></g>}
                    {factory && <text className="hx-factory-mark" x={x} y={cityName ? y - 3 : y + 3} fontSize="17" textAnchor="middle" fill={color}>{factory.product ? SECTORS[factory.product.sectorId].emoji : '⚑'}</text>}
                    {cityName && cityName.split(/[-\s]+/).slice(0, 3).map((part, i) => <text key={i} x={x} y={y - radius * .67 + i * 7} className="hx-city-name" textAnchor="middle" fill={color}>{part}</text>)}
                    <text x={x} y={y + radius * .7} textAnchor="middle" fontSize="8" fontWeight={mine ? 800 : 600} fill={color}
                      className={cx('hx-id', (selected || current || mine) && 'hx-id-on')}>{hex.id}</text>
                    {mine && <g className="hx-own-badge" transform={`translate(${x - radius * .64} ${y + radius * .24})`}><rect x="-5" y="-5" width="10" height="10" rx="1" fill="#faf6ec" stroke={ownColor} strokeWidth="2" /><rect x="-2" y="-2" width="4" height="4" fill={ownColor} /></g>}
                    {terrain && <g transform={`translate(${x - radius * .56} ${y - radius * .58}) scale(.6)`} fill="#faf6ec" stroke="#1b1a17" strokeWidth="1.6"><path d={STAR} /></g>}
                    {pending.has(hex.id) && <g className="hx-pending-badge" transform={`translate(${x + radius * .47} ${y - radius * .59})`}><rect x="-9" y="-7" width="18" height="14" rx="2" fill="#fff4d8" stroke={BID_COLOR} strokeWidth="1.5" /><path d={ENVELOPE} transform="translate(-8 -8)" fill="none" stroke={BID_COLOR} strokeWidth="1.5" /></g>}
                    {awarded.has(hex.id) && <g transform={`translate(${x + radius * .25} ${y + radius * .07}) scale(.65)`} fill="none" stroke={color} strokeWidth="2"><path d={HAMMER} /></g>}
                    {ranks && currentLens === 'margin' && rank && <g className="hx-rank-badge"><circle cx={rankX} cy={rankY} r={rankRadius} fill={RANK_COLOR} stroke={color} strokeWidth="1.6" /><text x={rankX} y={rankY + (cityName ? rankRadius * .4 : 4)} textAnchor="middle" fontSize={cityName ? Math.min(10, rankRadius * 1.4) : 12} fontWeight="800" fill={color}>{rank}</text></g>}
                    {better && <polygon className="hx-better" points={outline} fill="none" stroke={HEX_PALETTES.margin[4]} strokeWidth="2.4" strokeOpacity="0.9" transform={`translate(${(x * 0.14).toFixed(2)} ${(y * 0.14).toFixed(2)}) scale(0.86)`} />}
                  </g>
                </g>
              );
            })}
            {referenceHex && <g className="hx-reference-outline" aria-hidden="true" pointerEvents="none" data-hx-reference-outline={referenceHex.id}>
              <polygon points={referenceHex.terrain === 'island' ? islandCell(referenceHex) : hexParcel(referenceHex, proj)} fill="none"
                stroke={REFERENCE_COLOR} strokeWidth="4" strokeLinejoin="round"
                transform={`translate(${(proj.px(referenceHex.x) * .12).toFixed(2)} ${(proj.py(referenceHex.y) * .12).toFixed(2)}) scale(.88)`} />
              {ghost && <g className="hx-simulated-installation" data-hx-simulated-origin={referenceHex.id} transform={`translate(${proj.px(anchorPoint(referenceHex).x) + (referenceHex.city || referenceHex.deposit || hexFactory(view, referenceHex.id) ? HEX_R * proj.scale * .36 : 0)} ${proj.py(anchorPoint(referenceHex).y)})`}>
                <rect x="-12" y="-17" width="24" height="23" rx="3" fill="#faf6ec" fillOpacity=".8" stroke={REFERENCE_COLOR} strokeDasharray="3 2" />
                {supplyReference ? <g transform="translate(-8 -14)" fill="none" stroke={REFERENCE_COLOR} strokeWidth="1.5">{COMMODITY_GLYPH[supplyReference.commodityId]}</g>
                  : <text x="0" y="1" textAnchor="middle" fontSize="17" opacity=".65">{referenceSector ? SECTORS[referenceSector].emoji : '⚒'}</text>}
              </g>}
            </g>}
            {selectedHex && !onInspect && <g className="hx-selection-outline" aria-hidden="true" pointerEvents="none">
              <polygon className="hx-selection-halo" points={selectedHex.terrain === 'island' ? islandCell(selectedHex) : hexParcel(selectedHex, proj)} fill="none" stroke="#faf6ec" strokeWidth="7" strokeLinejoin="round" />
              <polygon className="hx-selection-ring" points={selectedHex.terrain === 'island' ? islandCell(selectedHex) : hexParcel(selectedHex, proj)} fill="none" stroke={SELECTED_COLOR} strokeWidth="4" strokeDasharray="7 4" strokeLinejoin="round" />
            </g>}
          </g>
          <g className="hx-coordinates" aria-hidden="true" pointerEvents="none">
            {[...new Set(grid.map((hex) => hex.q))].map((q) => <text key={q} x={proj.px(view.config.mapMode === 'square' ? q * SQUARE_SIZE : q * Math.sqrt(3) * HEX_R)} y={proj.py(30)} textAnchor="middle">{String.fromCharCode((view.config.mapMode === 'square' ? 65 : 64) + q)}</text>)}
            {[...new Set(grid.map((hex) => hex.r))].sort((a, b) => a - b).map((r) => <text key={r} x={proj.px(28)} y={proj.py(view.config.mapMode === 'square' ? r * SQUARE_SIZE : r * HEX_R * 1.5) + 3} textAnchor="middle">{r + 1}</text>)}
          </g>
          {flows && flowModel && <MapFlowLayer proj={proj} model={flowModel} mode={flowMode} figures={showFlowFigures} rivals={showRivals} obstacles={iconBoxes} />}
          {scenarioRoute && <g className="hx-scenario-route" role="img" aria-label={markers.scenarioRoute(referenceHex!.id, selectedHex!.id)} pointerEvents="none">
            <path d={scenarioRoute.d} fill="none" stroke="#faf6ec" strokeWidth="5" vectorEffect="non-scaling-stroke" />
            <path d={scenarioRoute.d} fill="none" stroke={REFERENCE_COLOR} strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
            <polygon points={scenarioRoute.head} fill={REFERENCE_COLOR} />
          </g>}
          <g className="hx-reference-labels" aria-hidden="true" pointerEvents="none">
            {markLabels.map(mark => <g key={mark.hex.id} data-hx-map-label={mark.hex.id}>
              <title>{mark.name}</title>
              <rect x={mark.x - mark.width / 2} y={mark.y} width={mark.width} height={mark.height} rx={3 * displayRatio} fill="#faf6ec" fillOpacity=".94" />
              <text x={mark.x} y={mark.y + 14 * displayRatio} textAnchor="middle" fontSize={markFont} fill={REFERENCE_COLOR} fontWeight="700">{mark.title}</text>
              {mark.shortName && <text x={mark.x} y={mark.y + 29 * displayRatio} textAnchor="middle" fontSize={markFont} fill="#1b1a17">{mark.shortName}</text>}
            </g>)}
          </g>
        </BaseMap>
      </div>
      {showLegend && <>
        <div className="hx-legend">
          <strong>{hexLegendTitle(currentLens, marginDelta, h, freightText, delivery ? {
            margin: markers.totalMargin,
            transport: supplyReference ? markers.supplyFreight : markers.deliveryTransport,
            demand: supplyReference ? markers.supplyDemand : markers.deliveryDemand,
          } : undefined)}</strong>
          {currentLens !== 'plain' && legend.length > 0 && <div className="hx-legend-scale">{legend.map(({ index, label }) => <span key={index} className="hx-legend-step"><i style={{ backgroundColor: HEX_PALETTES[currentLens][index] }} aria-hidden="true" /><span>{label}</span></span>)}</div>}
          {!delivery && !anyBetter && <span className="hx-lens-note">{h.lensNoBetter}</span>}
          <HexLegendMarks ranks={!onInspect && ranks && currentLens === 'margin'} view={view} inspection={Boolean(onInspect)} />
        </div>
        <p className="hx-keyboard-hint">{onInspect ? markers.inspectHint : h.keyboardHint}</p>
      </>}
    </div>
  );
}
