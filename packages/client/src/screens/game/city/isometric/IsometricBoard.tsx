import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CITIES, capitalCellId, hexPlaceLabel } from '@muchomoney/core';
import { useContent, useRoomLang, useUiLang } from '../../../../i18n';
import { useFmt } from '../../../../fmt';
import { mapFlowText } from '../../../../i18n/mapFlows';
import { IslandSalesFigures, islandSalesFigures } from './IslandSalesFigures';
import { isometricMessages } from '../../../../i18n/isometric';
import { ISOMETRIC_GRID_HIDDEN_KEY, loadFlag, saveFlag } from '../../../../storageFlags';
import type { HexBoardProps } from '../HexBoard';
import { defaultHexReference, hexArrowTarget, hexIsBuildable, hexLensColor, hexLensRange, hexLensValue, hexMarginQuintiles, hexReferenceHexId, hexReferenceIsRelative, hexSupplyFreight } from '../hexModel';
import { mapDeliveryLensValue, mapDeliveryRange } from '../mapDeliveryModel';
import { MAP_ACTIVITY_MIME } from '../MapActivityPalette';
import { MAP_DRAG_END, MAP_DRAG_HIT, type MapDragHit } from '../mapDragBridge';
import { buildIslandModel, canExpandIslandFactory } from './isometricModel';
import { IslandScene } from './islandScene';
import './isometric.css';

export interface IsometricBoardProps extends HexBoardProps {
  frozen?: boolean;
  onToggleStill?: () => void;
  onOpenFactory?: (companyId: string, productId: string) => void;
  onRequestExpansion?: (productId: string) => void;
}

/** Canvas is a second input surface for the same authoritative map actions, with a native parcel alternative. */
export function IsometricBoard(props: IsometricBoardProps) {
  const { view, selectedId, reference, supplyReference, delivery = false, lens = 'plain', delta = false,
    flowModel, flowMode = 'off', showFlowFigures = true, showRivals = true, selectableOnlyFree = false } = props;
  const ui = isometricMessages(useUiLang()), roomLang = useRoomLang(), content = useContent();
  const fmt = useFmt(), flowText = mapFlowText(useUiLang());
  const sales = flowMode === 'sales' && showFlowFigures ? islandSalesFigures(flowModel) : [];
  const uid = useId();
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), label = useRef<HTMLDivElement>(null);
  const cityLabels = useRef<HTMLDivElement>(null);
  const scene = useRef<IslandScene | null>(null), latest = useRef(props); latest.current = props;
  const [assets, setAssets] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [failure, setFailure] = useState<'unsupported' | 'contextLost' | null>(null);
  const [attempt, setAttempt] = useState(0), [grid, setGrid] = useState(() => !loadFlag(ISOMETRIC_GRID_HIDDEN_KEY)), [localFrozen, setLocalFrozen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hovered, setHovered] = useState<string | null>(null), [drop, setDrop] = useState<string | null>(null);
  const frozen = (props.frozen ?? localFrozen) || reducedMotion;
  const model = useMemo(() => buildIslandModel(view, flowModel, flowMode), [view, flowModel, flowMode]);
  const modelRef = useRef(model); modelRef.current = model;
  const currentReference = reference === undefined ? defaultHexReference(view) : reference;
  const marginDelta = !delivery && !supplyReference && delta && hexReferenceIsRelative(currentReference);
  const colors = useMemo(() => {
    if (lens === 'plain') return new Map<string, string>();
    const supplyValues = supplyReference ? model.cells.flatMap(cell => hexSupplyFreight(view, supplyReference, cell.id) ?? []) : [];
    const range = delivery ? mapDeliveryRange(view, currentReference, supplyReference, lens)
      : supplyReference ? supplyValues.length ? [Math.min(...supplyValues), Math.max(...supplyValues)] as [number, number] : null
      : lens === 'margin' ? hexMarginQuintiles(view, currentReference, marginDelta) : hexLensRange(view, currentReference, lens, marginDelta);
    return new Map(model.cells.flatMap(cell => {
      const value = delivery ? mapDeliveryLensValue(view, currentReference, supplyReference, cell.id, lens)
        : supplyReference ? hexSupplyFreight(view, supplyReference, cell.id) : hexLensValue(view, currentReference, cell.id, lens, marginDelta);
      return value === null ? [] : [[cell.id, hexLensColor(value, supplyReference && !delivery ? 'transport' : lens, range)] as const];
    }));
  }, [view, model.cells, currentReference, supplyReference, delivery, lens, marginDelta]);
  const allowed = (id: string) => !selectableOnlyFree || (hexIsBuildable(id) && Boolean(view.hexes?.free.includes(id)));
  const factory = model.factories.find(item => item.cellId === selectedId);
  const site = model.sites.find(item => item.cellId === selectedId);
  const land = model.ownedLand.find(item => item.cellId === selectedId);
  const placeLabel = (id: string) => hexPlaceLabel(id, roomLang, view.siteSlots);
  const selectionName = factory?.name ?? (selectedId ? placeLabel(selectedId) : ui.noSelection);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(media.matches);
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!canvas.current || !label.current) return;
    setFailure(null); setAssets('loading');
    let runtime: IslandScene;
    try {
      runtime = new IslandScene(canvas.current, label.current, {
        selected: id => {
          const p = latest.current;
          if (!p.selectableOnlyFree || (hexIsBuildable(id) && p.view.hexes?.free.includes(id))) p.onSelect(id);
        },
        inspect: id => { setHovered(id); latest.current.onInspect?.(id); },
        doubleClick: id => {
          const item = modelRef.current.factories.find(item => item.cellId === id);
          if (item && latest.current.onOpenFactory) latest.current.onOpenFactory(item.companyId, item.id);
          else latest.current.onSelectReference?.(id);
        },
        assets: setAssets, lost: () => setFailure('contextLost'),
      }, cityLabels.current ?? undefined);
      scene.current = runtime;
    } catch { setFailure('unsupported'); return; }
    return () => { scene.current = null; runtime.dispose(); };
  }, [attempt]);
  useEffect(() => {
    scene.current?.update({ model, selectedId, referenceId: supplyReference?.originHexId ?? hexReferenceHexId(view, currentReference), colors, economicLayer: lens !== 'plain', frozen, grid, hideRivals: !showRivals });
  }, [model, selectedId, view, currentReference, supplyReference, colors, lens, frozen, grid, showRivals, showFlowFigures, ui, assets, attempt]);
  useEffect(() => {
    const host = root.current; if (!host) return;
    const hit = (event: Event) => {
      const detail = (event as CustomEvent<MapDragHit>).detail;
      const id = scene.current?.hit(detail.clientX, detail.clientY) ?? null;
      detail.cellId = id; scene.current?.preview(id, detail.activityKey); setDrop(id);
    };
    const end = () => { scene.current?.preview(null, null); setDrop(null); canvas.current?.removeAttribute('data-map-drop-cell'); };
    host.addEventListener(MAP_DRAG_HIT, hit, true); window.addEventListener(MAP_DRAG_END, end, true);
    return () => { host.removeEventListener(MAP_DRAG_HIT, hit, true); window.removeEventListener(MAP_DRAG_END, end, true); };
  }, []);
  const onKey = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const id = selectedId ?? model.factories.find(item => item.mine)?.cellId ?? capitalCellId(view.config);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
    const next = hexArrowTarget(id, event.key, allowed);
    if (next) { props.onSelect(next); scene.current?.panTo(next); }
    else if (event.key === 'Enter') { event.preventDefault(); if (event.shiftKey) props.onSelectReference?.(id); else if (allowed(id)) props.onSelect(id); }
    else if (event.key === 'Escape') {
      event.preventDefault();
      if (scene.current) scene.current.clearInspection();
      else { props.onInspect?.(null); setHovered(null); }
    }
  };
  const dropHint = drop ? `${ui.place} · ${placeLabel(drop)}` : null;
  const caption = factory?.constructing ? ui.construction : factory?.pendingExtension ? ui.extension
    : factory?.incubator ? ui.incubator : factory && factory.extensionRatio > .01 ? ui.expanded
    : site?.constructing ? ui.construction : site?.dormant ? ui.dormant : site && !site.companyId ? ui.available : null;
  return <div ref={root} className="iso-board" data-testid="isometric-board">
    <div className="iso-stage">
      <canvas key={attempt} ref={canvas} className="iso-canvas" data-map-drop-surface="true" role="application" tabIndex={0}
        aria-label={ui.scene} aria-describedby={`${uid}-keys ${uid}-motion`} onKeyDown={onKey}
        onDragOver={event => {
          if (!event.dataTransfer.types.includes(MAP_ACTIVITY_MIME)) return;
          event.preventDefault(); event.dataTransfer.dropEffect = 'move';
          const id = scene.current?.hit(event.clientX, event.clientY) ?? null;
          scene.current?.preview(id, event.dataTransfer.getData(MAP_ACTIVITY_MIME) || null); setDrop(id);
        }} onDragLeave={() => { scene.current?.preview(null, null); setDrop(null); }}
        onDrop={event => {
          const key = event.dataTransfer.getData(MAP_ACTIVITY_MIME), id = scene.current?.hit(event.clientX, event.clientY);
          if (key && id) { event.preventDefault(); props.onDropActivity?.(id, key); }
          scene.current?.preview(null, null); setDrop(null);
        }} />
      <div className="iso-map-title" aria-hidden="true"><span className="iso-map-eyebrow">CASHOLOCO</span><strong>{ui.title}</strong></div>
      <div ref={label} className="iso-world-label" aria-hidden="true"><span>{selectedId?.replace(/^S-/, '')}</span>{factory?.name ?? site?.name ?? (selectedId && placeLabel(selectedId))}</div>
      <div ref={cityLabels} className="iso-city-labels" aria-hidden="true">{Object.values(CITIES).map(city => {
        const sale = sales.find(item => !item.national && item.cityId === city.id);
        return <span key={city.id} data-iso-city={city.id} data-iso-sales={sale ? 'true' : undefined}>
          {content.mapNames.cities[city.id]}
          {sale && <strong>{flowText.soldShort(flowText.lots(fmt.num(sale.sold), Math.round(sale.sold * 100) / 100), Math.round(sale.sold * 100) / 100)}</strong>}
        </span>;
      })}</div>
      {!failure && <>
        <div className="iso-camera-tools" aria-label={ui.scene}>
          <button type="button" onClick={() => scene.current?.zoom(1)} aria-label={ui.zoomIn} title={ui.zoomIn}>＋</button>
          <button type="button" onClick={() => scene.current?.zoom(-1)} aria-label={ui.zoomOut} title={ui.zoomOut}>−</button>
          <button type="button" onClick={() => scene.current?.rotate()} aria-label={ui.rotate} title={ui.rotate}>↻</button>
          <span />
          <button type="button" onClick={() => scene.current?.fit()} aria-label={ui.fit} title={ui.fit}>⌖</button>
          <button type="button" disabled={!selectedId} onClick={() => scene.current?.focus(selectedId)} aria-label={ui.focus} title={ui.focus}>◎</button>
        </div>
        <div className="iso-scene-tools">
          <button type="button" aria-pressed={grid} onClick={() => { saveFlag(ISOMETRIC_GRID_HIDDEN_KEY, grid); setGrid(!grid); }}>{ui.grid}</button>
          <button type="button" aria-pressed={frozen} disabled={reducedMotion} onClick={() => props.onToggleStill ? props.onToggleStill() : setLocalFrozen(value => !value)}>{frozen ? ui.animate : ui.freeze}</button>
        </div>
      </>}
      {assets !== 'ready' && !failure && <div className={`iso-asset-status ${assets === 'failed' ? 'is-warning' : ''}`} role="status">{assets === 'failed' ? ui.detailUnavailable : ui.detailLoading}</div>}
      {failure && <div className="iso-unavailable" role="status"><p>{ui[failure]}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{ui.retry}</button></div>}
      {dropHint && <div className="iso-placement" role="status">{dropHint}</div>}
      {!failure && <div className="iso-map-hint" aria-hidden="true">{hovered ? placeLabel(hovered) : ui.controls}</div>}
    </div>
    <div className="iso-readout">
      <div className="iso-selection"><small>{selectedId ? ui.selectedCell(selectedId) : ui.selected}</small><strong>{selectionName}</strong>{caption && <span className="iso-state">{caption}</span>}
        {land && <span className="iso-owner"><span aria-hidden="true" style={{ color: land.color }}>⚑</span>{ui.ownedBy(land.companyName)}{land.vacant ? ` · ${ui.vacant}` : ''}</span>}
      </div>
      <div className="iso-actions">
        {factory && props.onOpenFactory && <button type="button" onClick={() => props.onOpenFactory?.(factory.companyId, factory.id)}>{ui.openFactory}</button>}
        {factory && props.onRequestExpansion && canExpandIslandFactory(view, factory.companyId, factory.id) && <button type="button" onClick={() => props.onRequestExpansion?.(factory.id)}>{ui.expand}</button>}
      </div>
    </div>
    <p className="iso-ownership-note">⚑ {ui.ownership}</p>
    <p id={`${uid}-motion`} className="iso-motion-note">{flowMode !== 'off' && <strong>{ui[flowMode]} · </strong>}{ui.ambient}</p>
    {flowMode === 'sales' && showFlowFigures && flowModel && <IslandSalesFigures model={flowModel} startYear={view.config.startYear} />}
    <details className="iso-accessible" open={failure ? true : undefined}>
      <summary>{ui.onMap}</summary>
      <label htmlFor={`${uid}-parcel`}>{ui.select}</label>
      <select id={`${uid}-parcel`} value={selectedId ?? ''} onChange={event => { if (event.target.value) { props.onSelect(event.target.value); scene.current?.focus(event.target.value); } }}>
        <option value="">{ui.select}</option>
        {model.cells.map(cell => {
          const plant = model.factories.find(item => item.cellId === cell.id);
          const owner = model.ownedLand.find(item => item.cellId === cell.id);
          return <option key={cell.id} value={cell.id} disabled={!allowed(cell.id)}>{placeLabel(cell.id)}{plant ? ` · ${plant.name}` : ''}{owner ? ` · ${ui.ownedBy(owner.companyName)}${owner.vacant ? ` · ${ui.vacant}` : ''}` : ''}</option>;
        })}
      </select>
      <p id={`${uid}-keys`}>{ui.keyboard}</p>
    </details>
  </div>;
}

export default IsometricBoard;
