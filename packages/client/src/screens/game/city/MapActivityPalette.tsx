import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { COMMODITY_IDS, SECTORS, hexPlaceLabel, boardCells, type CommodityId, type PlayerView } from '@muchomoney/core';
import { useContent, useRoomLang, useUiLang } from '../../../i18n';
import { hexReadabilityMessages } from '../../../i18n/hexReadability';
import { CommodityGlyph } from './MapSheets';
import { hexReferenceHexId, hexReferenceKey, hexReferenceOptions, type HexReference, type HexSupplyReference } from './hexModel';
import { isOwn } from './privacy';
import { MAP_DRAG_END, MAP_DRAG_HIT, type MapDragHit } from './mapDragBridge';

export const MAP_ACTIVITY_MIME = 'application/x-casholoco-map-activity';
export type MapActivity = { kind: 'factory'; reference: HexReference }
  | { kind: 'supply'; commodityId: CommodityId; originHexId?: string; recipient?: HexReference };
export type MapScenario = { kind: 'factory'; reference: HexReference } | { kind: 'supply'; reference: HexSupplyReference };
export const mapActivityKey = (activity: MapActivity): string => activity.kind === 'factory'
  ? hexReferenceKey(activity.reference) : `supply:${activity.originHexId ?? 'new'}:${activity.commodityId}`;

/** Only controlled profiles enter the palette. Drag data contains an option key, never private product details. */
export function mapActivities(view: PlayerView): MapActivity[] {
  const controlled = new Set(view.companies.filter(isOwn).map(c => c.id));
  return [
    ...hexReferenceOptions(view).map(option => ({ kind: 'factory' as const, reference: option.ref })),
    ...view.siteSlots.flatMap(slot => {
      const hexId = slot.companyId && controlled.has(slot.companyId) ? boardCells(view.config).find(hex => hex.deposit === slot.id)?.id : null;
      return hexId ? [{ kind: 'supply' as const, commodityId: slot.commodityId, originHexId: hexId }] : [];
    }),
    ...COMMODITY_IDS.map(commodityId => ({ kind: 'supply' as const, commodityId })),
  ];
}

interface Props {
  view: PlayerView;
  reference: HexReference | null;
  supplyReference: HexSupplyReference | null;
  pending: MapActivity | null;
  flowProductId?: string | null;
  onPrepare: (activity: MapActivity) => void;
  onCancel: () => void;
  onRecipient: (reference: HexReference) => void;
  onShowReference: (hexId: string) => void;
  onResetOrigin: () => void;
  onPlace: (hexId: string, key: string) => void;
  actions?: ReactNode;
  singleClick?: boolean;
}

/** A placement tool is armed first; the board commits its profile and origin together. No modal or server action. */
export function MapActivityPalette({ view, reference, supplyReference, pending, flowProductId, onPrepare, onCancel, onRecipient, onShowReference, onResetOrigin, onPlace, actions, singleClick = false }: Props) {
  const text = hexReadabilityMessages(useUiLang());
  const content = useContent();
  const roomLang = useRoomLang();
  const activities = mapActivities(view);
  const products = view.companies.filter(isOwn).flatMap(company => company.products);
  const name = (activity: MapActivity) => activity.kind === 'supply' ? text.supplyLabel(content.commodities[activity.commodityId].name)
    : activity.reference.kind === 'product' ? products.find(p => activity.reference.kind === 'product' && p.id === activity.reference.productId)?.name ?? text.factory
      : content.sectors[activity.reference.sectorId].name;
  const icon = (activity: MapActivity) => {
    if (activity.kind === 'supply') return <CommodityGlyph id={activity.commodityId} size={20} color="currentColor" />;
    const sectorId = activity.reference.kind === 'launch' ? activity.reference.sectorId
      : products.find(p => activity.reference.kind === 'product' && p.id === activity.reference.productId)?.sectorId;
    return <span aria-hidden="true">{sectorId ? SECTORS[sectorId].emoji : '⚒'}</span>;
  };
  const active: MapActivity | null = supplyReference ? { kind: 'supply', ...supplyReference } : reference ? { kind: 'factory', reference } : null;
  const activeKey = active ? mapActivityKey(active) : '';
  const chosenKey = pending ? mapActivityKey(pending) : active?.kind === 'supply' && !activities.some(a => mapActivityKey(a) === activeKey)
    ? mapActivityKey({ kind: 'supply', commodityId: active.commodityId }) : activeKey;
  const origin = supplyReference?.originHexId ?? hexReferenceHexId(view, reference);
  const groups = [
    { name: text.paletteOwnFactories, activities: activities.filter(a => a.kind === 'factory' && a.reference.kind === 'product') },
    { name: text.paletteNewFactory, activities: activities.filter(a => a.kind === 'factory' && a.reference.kind === 'launch') },
    { name: text.paletteOwnSubsidiaries, activities: activities.filter(a => a.kind === 'supply' && a.originHexId) },
    { name: text.paletteNewSubsidiary, activities: activities.filter(a => a.kind === 'supply' && !a.originHexId) },
  ];
  const supplied = pending?.kind === 'supply' ? pending : !pending ? supplyReference : null;
  const recipient = supplied?.recipient ?? reference;
  const recipientKey = recipient ? hexReferenceKey(recipient) : '';
  const flowProduct = products.find(p => p.id === flowProductId);
  const drag = useRef<{ pointerId: number; target: HTMLButtonElement; x: number; y: number; moved: boolean; activity: MapActivity } | null>(null);
  const hover = useRef<Element | null>(null);
  const dragSurface = useRef<Element | null>(null);
  const suppressClick = useRef(false);
  const [dragPicture, setDragPicture] = useState<{ x: number; y: number; activity: MapActivity } | null>(null);
  const clearSurface = () => {
    dragSurface.current?.dispatchEvent(new CustomEvent(MAP_DRAG_END, { bubbles: true }));
    dragSurface.current?.removeAttribute('data-map-drop-cell');
    dragSurface.current = null;
  };
  useEffect(() => () => clearSurface(), []);
  const setHover = (target: Element | null) => {
    if (hover.current === target) return;
    hover.current?.removeAttribute('data-map-drop-hover');
    hover.current = target;
    target?.setAttribute('data-map-drop-hover', 'true');
  };
  const dropCellAt = (event: PointerEvent<HTMLButtonElement>) => {
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const surface = hit?.closest('[data-map-drop-surface]') ?? null;
    if (dragSurface.current !== surface) clearSurface();
    if (surface && surface.closest('.hx-map-view') === event.currentTarget.closest('.hx-map-view') && drag.current) {
      dragSurface.current = surface;
      const detail: MapDragHit = { clientX: event.clientX, clientY: event.clientY, activityKey: mapActivityKey(drag.current.activity), cellId: null };
      surface.dispatchEvent(new CustomEvent<MapDragHit>(MAP_DRAG_HIT, { detail, bubbles: true }));
      if (detail.cellId) surface.setAttribute('data-map-drop-cell', detail.cellId);
      else surface.removeAttribute('data-map-drop-cell');
    }
    const cell = hit?.closest('[data-map-drop-cell]') ?? null;
    return cell?.closest('.hx-map-view') === event.currentTarget.closest('.hx-map-view') ? cell : null;
  };
  const endDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const started = drag.current;
    if (!started || started.pointerId !== event.pointerId) return;
    const hexId = !cancelled && started.moved ? dropCellAt(event)?.getAttribute('data-map-drop-cell') : null;
    clearSurface();
    drag.current = null; setHover(null); setDragPicture(null);
    suppressClick.current = started.moved;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (hexId) onPlace(hexId, mapActivityKey(started.activity));
  };
  return <section className="hx-activity-palette" aria-label={text.paletteTitle} onKeyDown={event => {
    if (event.key === 'Escape' && (pending || drag.current)) {
      event.preventDefault(); event.stopPropagation();
      const started = drag.current;
      // The physical release may still click the tool, even when Escape preceded the drag threshold.
      suppressClick.current = Boolean(started);
      clearSurface();
      drag.current = null; setHover(null); setDragPicture(null);
      if (started?.target.hasPointerCapture(started.pointerId)) started.target.releasePointerCapture(started.pointerId);
      onCancel();
    }
  }}>
    <div className="hx-activity-main"><div className="hx-activity-groups">
      {groups.filter(group => group.activities.length).map(group => <div key={group.name} className="hx-activity-group" role="group" aria-label={group.name}>
        <span className="hx-activity-group-label">{group.name}</span>
        <div className="hx-activity-icons">{group.activities.map(activity => {
          const key = mapActivityKey(activity), label = name(activity);
          const place = activity.kind === 'supply' && activity.originHexId ? hexPlaceLabel(activity.originHexId, roomLang, view.siteSlots) : null;
          const owner = activity.kind === 'factory' && activity.reference.kind === 'product'
            ? view.companies.filter(isOwn).find(company => company.products.some(p => activity.reference.kind === 'product' && p.id === activity.reference.productId)) : null;
          const profilePlace = activity.kind === 'factory' ? hexReferenceHexId(view, activity.reference) : null;
          const details = [label, owner?.name, place ?? (owner && profilePlace ? hexPlaceLabel(profilePlace, roomLang, view.siteSlots) : null)].filter(Boolean).join(' · ');
          return <button key={key} type="button" className="hx-activity-tool" aria-label={text.paletteTool(details)}
            title={details} aria-pressed={key === chosenKey} data-map-activity={key}
            onClick={event => {
              // A cancelled pointer may emit no click at all: never swallow the next keyboard/AT activation.
              if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
              onPrepare(activity);
            }}
            onPointerDown={event => {
              if (event.button !== 0 || !event.isPrimary) return;
              suppressClick.current = false;
              drag.current = { pointerId: event.pointerId, target: event.currentTarget, x: event.clientX, y: event.clientY, moved: false, activity };
              event.currentTarget.setPointerCapture(event.pointerId);
            }} onPointerMove={event => {
              const started = drag.current;
              if (!started || started.pointerId !== event.pointerId) return;
              if (!started.moved && Math.hypot(event.clientX - started.x, event.clientY - started.y) < 6) return;
              started.moved = true; event.preventDefault();
              setDragPicture({ x: event.clientX, y: event.clientY, activity });
              setHover(dropCellAt(event));
            }} onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => endDrag(event, true)}>
            {icon(activity)}
            {(activity.kind === 'factory' && activity.reference.kind === 'product' || activity.kind === 'supply' && activity.originHexId) && <span className="hx-activity-name">{activity.kind === 'supply' ? activity.originHexId : label}</span>}
          </button>;
        })}</div>
      </div>)}
    </div>{actions && <div className="hx-activity-actions">{actions}</div>}</div>
    <div className="hx-activity-status" aria-live="polite">
      {active && <span className="hx-activity-current">{icon(active)} <strong>{name(active)}</strong></span>}
      <span className="hx-activity-hint">{pending ? text.palettePlace(name(pending)) : text.paletteGestures}</span>
      {!singleClick && pending && <button type="button" className="btn tiny ghost" onClick={onCancel}>{text.paletteCancel}</button>}
      {!pending && origin && <button type="button" className="btn tiny ghost" aria-label={text.showReferenceAria(hexPlaceLabel(origin, roomLang, view.siteSlots))}
        onClick={() => onShowReference(origin)}>{text.paletteShowOrigin}</button>}
      {!singleClick && !pending && (reference?.originHexId || supplyReference) && <button type="button" className="btn tiny ghost" onClick={onResetOrigin}>{text.paletteReset}</button>}
      {flowProduct && (supplyReference || reference?.originHexId || reference?.kind !== 'product' || reference.productId !== flowProduct.id)
        && <span className="hx-activity-hint">{text.paletteRealFlows(flowProduct.name)}</span>}
    </div>
    {supplied && <div className="hx-activity-recipient" role="group" aria-label={text.recipientChoice}>
      <span>{text.paletteFor}</span>
      {activities.filter((a): a is Extract<MapActivity, { kind: 'factory' }> => a.kind === 'factory').map(activity => <button key={mapActivityKey(activity)} type="button"
        className="hx-activity-tool" aria-label={text.paletteRecipient(name(activity))} title={name(activity)}
        aria-pressed={hexReferenceKey(activity.reference) === recipientKey} onClick={() => onRecipient(activity.reference)}>
        {icon(activity)}{activity.reference.kind === 'product' && <span className="hx-activity-name">{name(activity)}</span>}
      </button>)}
    </div>}
    {dragPicture && <div className="hx-activity-drag-picture" aria-hidden="true" style={{ left: dragPicture.x + 12, top: dragPicture.y + 12 }}>{icon(dragPicture.activity)}</div>}
  </section>;
}
