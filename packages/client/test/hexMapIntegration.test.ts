import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMODITIES, COMMODITY_IDS, HEXES, SITE_OPENING_COST_MULT, applyAction, capitalHexId, createGame, getContent, getPlayerView, hexPlaceLabel, hexReservePrice, resolveTurn, slotCapacity, type CommodityId, type CompanyView, type Lang, type PlayerView, type SectorId } from '@muchomoney/core';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { ConfirmModal, Modal } from '../src/components/Modal';
import { HEX_MIN_DRAW_WIDTH, HexBoard } from '../src/screens/game/city/HexBoard';
import { MAP_VIEW } from '../src/screens/game/city/BaseMap';
import { HexCellSheet } from '../src/screens/game/city/HexCellSheet';
import { HexMapView } from '../src/screens/game/city/HexMapView';
import { MapActivityPalette, mapActivities, type MapActivity } from '../src/screens/game/city/MapActivityPalette';
import { MAP_DRAG_END, MAP_DRAG_HIT, type MapDragHit } from '../src/screens/game/city/mapDragBridge';
import { MapHoverReadout } from '../src/screens/game/city/MapHoverReadout';
import { CityTab, intentKey } from '../src/screens/game/city/CityTab';
import { Signs } from '../src/screens/game/city/Signs';
import { MapFlowDetail } from '../src/screens/game/city/MapFlowDetail';
import { OpeningChip } from '../src/screens/game/city/OpeningChip';
import { MapWorkspace } from '../src/screens/game/city/MapWorkspace';
import {
  HexColorControls, HexLegendMenu, MapFlowMenu, MapGoToMenu, type GoToGroup,
} from '../src/screens/game/city/HexMapToolbar';
import { HexSidePanel, type HexSidePanelProps } from '../src/screens/game/city/HexSidePanel';
import { mapFlowText } from '../src/i18n/mapFlows';
import { mapWorkspaceMessages } from '../src/i18n/mapWorkspace';
import { mapSideMessages } from '../src/i18n/mapSide';
import { hexReadabilityMessages } from '../src/i18n/hexReadability';
import { hexMarginValue, hexSupplyFreight } from '../src/screens/game/city/hexModel';
import { mapFactoryDelivery } from '../src/screens/game/city/mapDeliveryModel';
import { ProductCard } from '../src/screens/game/ProductCard';
import { IndustryPanel } from '../src/screens/game/IndustryPanel';
import { HexLaunchForm, initialBidHex } from '../src/screens/game/LaunchForms';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { DepositPanel, SiteBidFooter, SiteSheet, commodityNeed } from '../src/screens/game/DepositPanel';
import { defaultSlot, freeDepositSlot } from '../src/screens/game/sitesPickerModel';
import { getState, setState, type AppState } from '../src/store';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
const amountForms = vi.hoisted(() => ({ list: [] as Record<string, unknown>[] }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(hooks.values[index]) : value; }];
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = { current: initial };
      return hooks.values[index];
    },
    useEffect: (effect: () => void) => { hooks.effects.push(effect); },
    useMemo: (factory: () => unknown) => factory(),
    useId: () => 'map-integration',
  };
});
vi.mock('../src/hooks/useGame', () => ({ useGame: () => ({ view: data.view!, sectorsById: new Map((data.view?.sectors ?? []).map((s) => [s.id, s])) }) }));
vi.mock('../src/hooks/useElementWidth', () => ({ useElementWidth: () => [vi.fn(), 680] }));
vi.mock('../src/components/AmountForm', () => ({
  AmountForm: (props: Record<string, unknown>) => {
    amountForms.list.push(props);
    return null;
  },
}));
const transport = vi.hoisted(() => ({ emit: vi.fn(), connected: true }));
// Preserve the tested action boundary while replacing the former network transport.
vi.mock('../src/solo/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/solo/runtime')>();
  return {
    ...actual,
    applySoloAction: (action: import('@muchomoney/core').Action, turn?: number) =>
      new Promise<import('@muchomoney/core').ActionResult>((resolve) => transport.emit('game:action', turn === undefined ? { action } : { action, turn }, resolve)),
    advanceSoloTurn: (turn?: number) => {
      transport.emit('game:ready', turn === undefined ? { ready: true } : { ready: true, turn });
      return { ok: true, message: 'OK' };
    },
  };
});
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

interface CapturedForm {
  label: ReactNode;
  min?: number;
  max: number;
  initial?: number;
  submitLabel: string;
  disabledReason?: string | null;
  onSubmit: (amount: number) => Promise<{ ok: boolean }>;
}
const lastForm = (): CapturedForm => amountForms.list[amountForms.list.length - 1] as unknown as CapturedForm;

const initial = getState();
beforeEach(() => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  transport.emit.mockReset();
  transport.emit.mockImplementation((_event: string, _payload: unknown, ack?: (r: unknown) => void) => ack?.({ ok: true }));
});
afterEach(() => {
  setState(initial);
  vi.unstubAllGlobals();
  data.view = null;
  hooks.values = [];
  hooks.cursor = 0;
  hooks.effects = [];
  amountForms.list.length = 0;
});
function fixture(lang: Lang, network = false, mapMode: 'hex' | 'square' = 'hex') {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode, terrainAssignment: 'fair', ...(network ? { industryRules: 'network' as const } : {}) }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  return { game, company, view: getPlayerView(game, 'human') };
}
function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  // MapWorkspace receives the toolbar and contextual sheet as named slots.
  return [
    ...(predicate(node) ? [node] : []),
    ...elements(node.props.children as ReactNode, predicate),
    ...elements(node.props.toolbar as ReactNode, predicate),
    ...elements(node.props.sheet as ReactNode, predicate),
    ...elements(node.props.boardHeader as ReactNode, predicate),
    ...elements(node.props.actions as ReactNode, predicate),
  ];
}
function renderMap(view: PlayerView, lang: Lang, company: CompanyView | null = null, options: Partial<Parameters<typeof HexMapView>[0]> = {}) {
  data.view = view;
  setState({ view, lang, lobby: null });
  hooks.cursor = 0;
  hooks.effects = [];
  return HexMapView({ company, onSelect: () => {}, goTo: () => {}, ...options });
}
function child(node: ReactNode, type: unknown) { return elements(node, (element) => element.type === type)[0]; }
/** Pointer capture stays on the palette button while the 3D surface supplies its drop cell. */
function paletteDrag(lang: Lang) {
  const { view } = fixture(lang), map = renderMap(view, lang, view.companies.find(c => c.private)!);
  const place = vi.fn(), prepare = vi.fn(), cancel = vi.fn();
  const props = { ...child(map, MapActivityPalette).props, onPlace: place, onPrepare: prepare, onCancel: cancel } as unknown as Parameters<typeof MapActivityPalette>[0];
  const cursor = hooks.cursor;
  const render = () => { hooks.cursor = cursor; return MapActivityPalette(props); };
  const palette = render(), tool = elements(palette, e => e.props['data-map-activity'] === 'launch:scooters')[0];
  const owner = {}, attributes = new Map<string, string>();
  const surface = {
    closest: (selector: string): object | null => selector === '.hx-map-view' ? owner
      : selector === '[data-map-drop-surface]' || selector === '[data-map-drop-cell]' && attributes.has('data-map-drop-cell') ? surface : null,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: vi.fn((name: string) => attributes.delete(name)),
    dispatchEvent: vi.fn((event: Event) => {
      if (event.type === MAP_DRAG_HIT) (event as CustomEvent<MapDragHit>).detail.cellId = 'C6';
      return true;
    }),
  };
  let captured = false;
  const target = { closest: () => owner,
    setPointerCapture: vi.fn(() => { captured = true; }), hasPointerCapture: () => captured,
    releasePointerCapture: vi.fn(() => { captured = false; }) };
  vi.stubGlobal('document', { elementFromPoint: () => surface });
  const event = (x = 30) => ({ button: 0, isPrimary: true, pointerId: 7, clientX: x, clientY: 0, currentTarget: target, preventDefault: vi.fn() });
  const pointer = (name: string, x?: number) => (tool.props[name] as (event: unknown) => void)(event(x));
  const click = (detail: number) => (tool.props.onClick as (event: { detail: number }) => void)({ detail });
  const start = () => { pointer('onPointerDown', 0); pointer('onPointerMove', 30); };
  return { palette, render, start, pointer, click, target, surface, attributes, place, prepare, cancel };
}
/** Construction and land controls belong to the activity band, never to the information sheet. */
function paletteButton(node: ReactNode, label: string) {
  return elements(child(node, MapActivityPalette).props.actions as ReactNode,
    element => element.type === 'button' && element.props.children === label)[0];
}
/** The left column (wide desktops): MapWorkspace's other slot, mounted instead of the toolbar row from 1200 px. */
function side(node: ReactNode): HexSidePanelProps {
  const panel = child(node, MapWorkspace).props.sidePanel as ReactElement<HexSidePanelProps>;
  expect(panel.type).toBe(HexSidePanel);
  return panel.props;
}
/** The flow layer's figures: in the tracked product's card from 1200 px (as in these tests), below the board otherwise. */
function flowDetail(node: ReactNode) {
  return child(node, MapFlowDetail) ?? (side(node).flowDetail(true) as ReactElement<Record<string, unknown>> | null) ?? undefined;
}
const escape = (value: string) => renderToStaticMarkup(createElement('span', null, value)).replace(/^<span>|<\/span>$/g, '');
/** A fresh mount of the view (the app keys it on the intent): forget every state and effect. */
function remount() {
  hooks.values = [];
  hooks.cursor = 0;
  hooks.effects = [];
}


describe.each(['fr', 'en'] as const)('hex map integration interactions (%s)', (lang) => {
  it('selects the origin on one click while hovering a destination keeps the colours and flows anchored', () => {
    const { view } = fixture(lang);
    const product = view.companies.find((c) => c.private)!.products[0];
    const source = view.hexes!.free[0], target = view.hexes!.free[1];
    let map = renderMap(view, lang);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(source);
    map = renderMap(view, lang);
    const reference = { kind: 'product', productId: product.id, originHexId: source };
    expect(child(map, HexBoard).props).toMatchObject({ reference, selectedId: source });
    (child(map, MapFlowMenu).props.onModeChange as (mode: string) => void)('sales');
    map = renderMap(view, lang);
    (child(map, HexBoard).props.onInspect as (id: string | null) => void)(target);
    map = renderMap(view, lang);
    expect(child(map, HexBoard).props).toMatchObject({ reference, selectedId: source, flowMode: 'sales', lens: 'margin' });
    expect(child(map, HexCellSheet).props).toMatchObject({ hexId: source, readOnly: true });
    expect(child(map, MapHoverReadout).props).toMatchObject({ reference, hoveredId: target });
    expect(child(map, MapActivityPalette).props.flowProductId).toBe(product.id);
    (child(map, HexBoard).props.onInspect as (id: string | null) => void)(null);
    map = renderMap(view, lang);
    expect(child(map, HexBoard).props.reference).toMatchObject(reference);
    expect(child(map, MapHoverReadout).props.hoveredId).toBeNull();
  });

  it('opens with the layers off: the board, its cell labels and the detail panel are those of the map without layers', () => {
    const { view } = fixture(lang);
    const map = renderMap(view, lang);
    const controls = child(map, MapFlowMenu);
    expect(controls.props.mode).toBe('off');
    expect(flowDetail(map)).toBeUndefined();
    const board = child(map, HexBoard);
    expect(board.props.flowModel).toBeNull();
    const html = renderToStaticMarkup(createElement(HexBoard, board.props));
    expect(html).not.toContain('map-flow-layer');
    expect(html).not.toContain('map-flow-ring');
    expect(html).not.toContain('hx-rivals-muted');
    expect(html).not.toContain('hx-all-cell-numbers');
    // The reference factory stays explicit even with operational layers off; ordinary cell ids keep their font.
    expect(html).toContain(`data-hx-reference-outline="${view.companies.find((c) => c.private)!.products[0].hexId}"`);
    expect(html).not.toContain('hx-reference-badge');
    expect(html).not.toContain('font-size="11"');
    // The closed « Flux » menu names the layer that is on (none) and hides its options.
    const controlsHtml = renderToStaticMarkup(createElement(MapFlowMenu, controls.props as Parameters<typeof MapFlowMenu>[0]));
    expect(controlsHtml).toContain(escape(mapFlowText(lang).menu(mapFlowText(lang).modeShort.off)));
    expect(controlsHtml).toContain('aria-expanded="false"');
    expect(controlsHtml).not.toContain('type="checkbox"');
    expect(controlsHtml).not.toContain('map-flow-hint');
  });

  it('fits the country in a zoomable frame (no size toggle) and stacks the same tools in a left column on wide screens', () => {
    const { view } = fixture(lang);
    const map = renderMap(view, lang);
    const workspace = child(map, MapWorkspace);
    const text = mapWorkspaceMessages(lang);
    // The one-row toolbar stays for windows under 1200 px; the size toggle is gone, the zoom replaces it.
    expect(workspace.props.inlineToolbar).toBe(true);
    expect([workspace.props.wholeLabel, workspace.props.enlargeLabel]).toEqual([undefined, undefined]);
    expect(text).not.toHaveProperty('wholeCountryShort');
    expect(text).not.toHaveProperty('enlargeMapShort');
    expect(workspace.props.zoom).toEqual({ aspect: MAP_VIEW.width / MAP_VIEW.height, labels: {
      group: text.zoomGroup, zoomIn: text.zoomIn, zoomOut: text.zoomOut, fit: text.zoomFit, fitAria: text.zoomFitAria } });
    expect(workspace.props.sidePanelLabel).toBe(text.sidePanel);
    // The left column (HexSidePanel: « Mes usines », folds, « Chiffrer pour » and the colours at its foot) shares the
    // toolbar's state and handlers; the toolbar row keeps its menus.
    const panel = side(map);
    expect(child(map, MapFlowMenu)).toBeDefined();
    expect(child(map, HexLegendMenu)).toBeDefined();
    expect(panel.picker).toEqual(side(map).picker);
    expect(panel.colors).toEqual(child(map, HexColorControls).props);
    expect(panel.flows).toEqual(child(map, MapFlowMenu).props);
    expect(panel.legend).toEqual(child(map, HexLegendMenu).props);
    expect(panel.handlers.showCell).toBe(child(map, MapGoToMenu).props.onGo);
    expect(workspace.props.sideFold).toMatchObject({ foldLabel: mapSideMessages(lang).foldSide, reopenText: mapSideMessages(lang).reopenSide,
      reopenLabel: mapSideMessages(lang).reopenSideAria });
    // The board is drawn at least 760 px wide and scaled down to a short frame; under 960 px (no frame, no zoom), at
    // the page width as before.
    expect(child(map, HexBoard).props.minDrawWidth).toBe(HEX_MIN_DRAW_WIDTH);
    remount();
    vi.stubGlobal('window', { setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) });
    expect(child(renderMap(view, lang), HexBoard).props.minDrawWidth).toBe(0);
  });

  it('drives the board from the left column: a fold entry selects its cell, « Flux » turns a layer on', () => {
    const { view } = fixture(lang);
    let map = renderMap(view, lang);
    const deposits = side(map).depositsHex!;
    expect(HEXES.find((hex) => hex.id === deposits)?.deposit).toBeDefined();
    side(map).handlers.showCell(deposits);
    map = renderMap(view, lang);
    expect(child(map, HexBoard).props.selectedId).toBe(deposits);
    expect(child(map, HexCellSheet).props.hexId).toBe(deposits);
    expect(child(map, MapWorkspace).props.selectedKey).toBe(deposits);
    side(map).flows.onModeChange('production');
    map = renderMap(view, lang);
    expect(child(map, HexBoard).props.flowMode).toBe('production');
    expect(side(map).flows.mode).toBe('production');
    // From 1200 px the layer's figures are in the tracked product's card, not below the board.
    expect(child(map, MapFlowDetail)).toBeUndefined();
    expect(flowDetail(map)!.props.compact).toBe(true);
  });

  it('keeps the tracked reference, lens mode and original parcel geometry when operational layers change', () => {
    const { view } = fixture(lang);
    let map = renderMap(view, lang);
    const original = renderToStaticMarkup(createElement(HexBoard, child(map, HexBoard).props));
    const parcels = (html: string) => [...html.matchAll(/<polygon data-hex-id="[^"]+"[^>]+points="([^"]+)"/g)].map((match) => match[1]);
    const reference = child(map, HexBoard).props.reference;
    const controls = child(map, MapFlowMenu);
    (controls.props.onModeChange as (mode: string) => void)('sales');
    (controls.props.onRivalsChange as (shown: boolean) => void)(false);
    map = renderMap(view, lang);
    const board = child(map, HexBoard);
    expect(board.props.flowMode).toBe('sales');
    expect(board.props.lens).toBe('margin');
    expect(board.props.reference).toEqual(reference);
    expect(board.props.showRivals).toBe(false);
    expect(flowDetail(map)).toBeDefined();
    const updated = renderToStaticMarkup(createElement(HexBoard, board.props));
    expect(parcels(original)).toHaveLength(159);
    expect(parcels(updated)).toEqual(parcels(original));
    expect(updated).toContain('map-flow-layer');
    expect(updated).toContain('hx-rivals-muted');
    expect(updated).toContain(`data-hx-reference-outline="${view.companies.find((c) => c.private)!.products[0].hexId}"`);
    expect(updated).not.toContain('hx-reference-badge');
  });

  it('selects an owned factory as the origin and shared tracked product on one click, even with layers off', () => {
    const { game, company, view } = fixture(lang);
    company.cash = 100_000;
    const hexId = view.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Second plant', hexId, bid: view.hexes!.reserve[hexId], fallback: 'nearest' }).ok).toBe(true);
    resolveTurn(game);
    const after = getPlayerView(game, 'human');
    const own = after.companies.find((c) => c.id === company.id)!;
    const [first, second] = own.products;
    const select = vi.fn(), options = { onSelectProduct: select };
    let map = renderMap(after, lang, own, options);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: first.id });
    (child(map, HexBoard).props.onSelect as (id: string) => void)(second.hexId!);
    map = renderMap(after, lang, own, options);
    expect(child(map, HexBoard).props.selectedId).toBe(second.hexId);
    expect(select).toHaveBeenCalledWith(second.id);
    expect(side(map).picker.trackedKey).toBe(`product:${second.id}`);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: second.id });
    expect(child(map, HexBoard).props.onSelectReference).toBeUndefined();
    (child(map, MapFlowMenu).props.onModeChange as (mode: string) => void)('production');
    map = renderMap(after, lang, own, options);
    expect((flowDetail(map)!.props.model as { selectedProductId: string }).selectedProductId).toBe(second.id);
    (child(map, MapGoToMenu).props.onGo as (id: string) => void)(first.hexId!);
    map = renderMap(after, lang, own, options);
    expect(select).toHaveBeenCalledWith(first.id);
    expect((flowDetail(map)!.props.model as { selectedProductId: string }).selectedProductId).toBe(first.id);
    expect(child(map, HexBoard).props.delta).toBe(false);
    expect(child(map, HexBoard).props.delivery).toBe(true);
    // The palette chooses an existing activity immediately at its actual plant location.
    (child(map, MapActivityPalette).props.onPrepare as (activity: MapActivity) => void)({ kind: 'factory', reference: { kind: 'product', productId: second.id } });
    map = renderMap(after, lang, own, options);
    expect(child(map, HexBoard).props.selectedId).toBe(second.hexId);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: second.id });
    expect(child(map, MapActivityPalette).props.pending).toBeNull();
    expect(child(map, MapActivityPalette).props.singleClick).toBe(true);
    expect(side(map).showReferencePicker).toBe(false);
  });

  it('keeps operational comparison separate and double clicking adds no origin or destination gesture', () => {
    const { game, company, view } = fixture(lang);
    company.cash = 100_000;
    const hexId = view.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Second plant', hexId, bid: view.hexes!.reserve[hexId], fallback: 'nearest' }).ok).toBe(true);
    resolveTurn(game);
    const after = getPlayerView(game, 'human'), own = after.companies.find((c) => c.id === company.id)!;
    const [first, second] = own.products;
    let map = renderMap(after, lang, own);
    (child(map, MapFlowMenu).props.onModeChange as (mode: string) => void)('production');
    (child(map, MapFlowMenu).props.onCompareChange as (enabled: boolean) => void)(true);
    map = renderMap(after, lang, own);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(second.hexId!);
    map = renderMap(after, lang, own);
    expect(child(map, MapFlowMenu).props.compare).toBe(true);
    expect(side(map).picker.trackedKey).toBe(`product:${second.id}`);
    expect(child(map, MapFlowMenu).props.comparedKey).toBe(`product:${first.id}`);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: first.id, originHexId: second.hexId });
    expect((flowDetail(map)!.props.model as { selectedProductId: string }).selectedProductId).toBe(second.id);
    const boardProps = child(map, HexBoard).props;
    expect(boardProps.onSelectReference).toBeUndefined();
    const before = hooks.values;
    hooks.values = []; hooks.cursor = 0;
    const board = HexBoard(boardProps as unknown as Parameters<typeof HexBoard>[0]);
    const cells = elements(board, e => e.props.className && String(e.props.className).split(' ').includes('hx-cell'));
    const cell = cells.find(e => String(e.props['aria-label']).includes(second.hexId!))!;
    expect(cell.props.onDoubleClick).toBeUndefined();
    const select = vi.fn();
    hooks.values = []; hooks.cursor = 0;
    const spyBoard = HexBoard({ ...boardProps, onSelect: select } as unknown as Parameters<typeof HexBoard>[0]);
    const spyCell = elements(spyBoard, e => e.props.className && String(e.props.className).split(' ').includes('hx-cell')).find(e => String(e.props['aria-label']).includes(second.hexId!))!;
    (spyCell.props.onClick as (event: { detail: number }) => void)({ detail: 2 });
    expect(select).not.toHaveBeenCalled();
    hooks.values = before;
    (child(map, MapFlowMenu).props.onModeChange as (mode: string) => void)('off');
    map = renderMap(after, lang, own);
    expect(child(map, MapFlowMenu).props.compare).toBe(false);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: second.id, originHexId: second.hexId });
  });

  it('chooses a hypothetical activity immediately and places its origin on empty or occupied land with one click', () => {
    const { view } = fixture(lang), company = view.companies.find((c) => c.private)!;
    const snapshot = JSON.stringify(view), source = view.hexes!.free[0], destination = view.hexes!.free[1];
    let map = renderMap(view, lang, company);
    const activity: MapActivity = { kind: 'factory', reference: { kind: 'launch', sectorId: 'gadgets' } };
    (child(map, MapActivityPalette).props.onPrepare as (activity: MapActivity) => void)(activity);
    map = renderMap(view, lang, company);
    expect(child(map, MapActivityPalette).props.pending).toBeNull();
    expect(child(map, HexBoard).props.reference).toMatchObject(activity.reference);
    const palette = renderToStaticMarkup(createElement(MapActivityPalette, child(map, MapActivityPalette).props as unknown as Parameters<typeof MapActivityPalette>[0]));
    expect(palette).not.toContain(hexReadabilityMessages(lang).paletteCancel);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(source);
    map = renderMap(view, lang, company);
    const ref = { kind: 'launch' as const, sectorId: 'gadgets' as const, originHexId: source };
    expect(child(map, HexBoard).props.reference).toMatchObject(ref);
    expect(mapFactoryDelivery(view, ref, source)!.transport).toBe(0);
    (child(map, HexBoard).props.onInspect as (id: string) => void)(destination);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(source);
    expect(child(map, HexBoard).props.reference).toMatchObject(ref);
    expect(child(map, MapHoverReadout).props.hoveredId).toBe(destination);
    const rivalCell = view.companies.find((c) => !c.private && c.products.some((p) => p.hexId))!.products.find((p) => p.hexId)!.hexId!;
    (child(map, HexBoard).props.onSelect as (id: string) => void)(rivalCell);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.reference).toMatchObject({ ...ref, originHexId: rivalCell });
    expect(child(map, Modal)).toBeUndefined();
    expect(JSON.stringify(view)).toBe(snapshot);
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('simulates a subsidiary with material-specific route costs and restores the actual factory reference', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const product = company.products[0];
    const source = view.hexes!.free[0], target = view.hexes!.free.at(-1)!;
    let map = renderMap(view, lang, company);
    (child(map, MapActivityPalette).props.onPrepare as (activity: MapActivity) => void)({ kind: 'supply', commodityId: 'oil' });
    map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(source);
    map = renderMap(view, lang, company);
    const supply = { originHexId: source, commodityId: 'oil' as const, recipient: { kind: 'product' as const, productId: product.id } };
    expect(child(map, HexBoard).props.supplyReference).toEqual(supply);
    expect(hexSupplyFreight(view, supply, source)).toBe(0);
    expect(hexSupplyFreight(view, supply, target)).toBeGreaterThan(0);
    expect(hexSupplyFreight(view, { ...supply, commodityId: 'chips' }, target)).not.toBe(hexSupplyFreight(view, supply, target));
    const colors = HexColorControls(child(map, HexColorControls).props as unknown as Parameters<typeof HexColorControls>[0]);
    expect(elements(colors, (element) => element.type === 'button' && element.props.disabled)).toHaveLength(0);
    (child(map, HexBoard).props.onInspect as (id: string) => void)(target);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.supplyReference).toEqual(supply);
    const palette = MapActivityPalette(child(map, MapActivityPalette).props as unknown as Parameters<typeof MapActivityPalette>[0]);
    expect(elements(palette, e => e.props['data-map-activity'] === 'supply:new:oil')[0].props['aria-pressed']).toBe(true);
    (child(map, MapActivityPalette).props.onResetOrigin as () => void)();
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.supplyReference).toBeNull();
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: product.id });
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('selects an owned subsidiary as the origin on one click and inspects another destination without changing it', () => {
    const { view } = fixture(lang), company = view.companies.find((c) => c.private)!;
    const slot = view.siteSlots.find((s) => s.commodityId === 'sugar')!;
    slot.companyId = company.id;
    const origin = HEXES.find((h) => h.deposit === slot.id)!.id, target = view.hexes!.free[0];
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(origin);
    map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onInspect as (id: string) => void)(target);
    map = renderMap(view, lang, company);
    expect(child(map, Modal)).toBeUndefined();
    expect(child(map, HexBoard).props.supplyReference).toMatchObject({ originHexId: origin, commodityId: 'sugar' });
    expect(child(map, HexBoard).props.selectedId).toBe(origin);
    expect(child(map, MapHoverReadout).props.hoveredId).toBe(target);
    expect(child(map, HexBoard).props.delivery).toBe(true);
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('drops only validated activities, selecting their origin while preserving the hover and sending no action', () => {
    const { view } = fixture(lang), company = view.companies.find(c => c.private)!;
    const source = view.hexes!.free[0], target = view.hexes!.free[1];
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onInspect as (id: string) => void)(target);
    map = renderMap(view, lang, company);
    const original = child(map, HexBoard).props.reference;
    (child(map, HexBoard).props.onDropActivity as (id: string, key: string) => void)(source, 'product:not-controlled');
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.reference).toMatchObject(original);
    (child(map, HexBoard).props.onDropActivity as (id: string, key: string) => void)(source, 'launch:scooters');
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props).toMatchObject({ selectedId: source, reference: { kind: 'launch', sectorId: 'scooters', originHexId: source } });
    expect(child(map, MapHoverReadout).props.hoveredId).toBe(target);
    expect(child(map, Modal)).toBeUndefined();
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('keeps the recipient chosen before a supply drop and allows changing it afterwards', () => {
    const { view } = fixture(lang);
    const company = view.companies.find(c => c.private)!;
    const source = view.hexes!.free[0];
    let map = renderMap(view, lang, company);
    (child(map, MapActivityPalette).props.onPrepare as (activity: MapActivity) => void)({ kind: 'supply', commodityId: 'lithium' });
    map = renderMap(view, lang, company);
    (child(map, MapActivityPalette).props.onRecipient as (ref: unknown) => void)({ kind: 'launch', sectorId: 'scooters' });
    map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onDropActivity as (id: string, key: string) => void)(source, 'supply:new:lithium');
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.supplyReference).toEqual({ originHexId: source, commodityId: 'lithium', recipient: { kind: 'launch', sectorId: 'scooters' } });
    (child(map, MapActivityPalette).props.onRecipient as (ref: unknown) => void)({ kind: 'launch', sectorId: 'gadgets' });
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.supplyReference).toMatchObject({ originHexId: source, recipient: { kind: 'launch', sectorId: 'gadgets' } });
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('opens construction from the top band at the selected origin, independently of the hovered destination', () => {
    const { view } = fixture(lang), company = view.companies.find(c => c.private)!;
    const source = view.hexes!.free[0], target = view.hexes!.free[1];
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onDropActivity as (id: string, key: string) => void)(source, 'launch:energy_drinks');
    map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onInspect as (id: string) => void)(target);
    map = renderMap(view, lang, company);
    const action = paletteButton(map, hexReadabilityMessages(lang).buildFactory);
    expect(action.props.disabled).toBe(false);
    expect(child(map, HexCellSheet).props).toMatchObject({ hexId: source, readOnly: true });
    expect(child(map, HexCellSheet).props.onLaunch).toBeUndefined();
    expect(child(map, HexLaunchForm)).toBeUndefined();
    (action.props.onClick as () => void)();
    map = renderMap(view, lang, company);
    expect(child(map, HexLaunchForm).props).toMatchObject({ hexId: source, initialSector: 'energy_drinks' });
    expect(child(map, HexBoard).props.selectedId).toBe(source);
    expect(child(map, MapHoverReadout).props.hoveredId).toBe(target);
    expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, e => e.type === HexLaunchForm)).toHaveLength(0);
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('offers subsidiary construction in the top band only for a matching available deposit', () => {
    const { view } = fixture(lang), company = view.companies.find(c => c.private)!;
    const slot = view.siteSlots.find(s => !s.companyId && s.commodityId === 'sugar')!;
    const source = HEXES.find(h => h.deposit === slot.id)!.id, text = hexReadabilityMessages(lang);
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onDropActivity as (id: string, key: string) => void)(source, 'supply:new:oil');
    map = renderMap(view, lang, company);
    expect(paletteButton(map, text.buildSubsidiary).props.disabled).toBe(true);
    expect(paletteButton(map, text.buildFactory)).toBeUndefined();
    (child(map, HexBoard).props.onDropActivity as (id: string, key: string) => void)(source, 'supply:new:sugar');
    map = renderMap(view, lang, company);
    const action = paletteButton(map, text.buildSubsidiary);
    expect(action.props.disabled).toBe(false);
    (action.props.onClick as () => void)();
    map = renderMap(view, lang, company);
    expect(child(map, DepositPanel).props.slot).toEqual(slot);
    expect(child(map, HexBoard).props.selectedId).toBe(source);
    expect(child(map, HexCellSheet).props.readOnly).toBe(true);
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('renders the shared sector and material symbols while excluding uncontrolled factory profiles', () => {
    const { view } = fixture(lang);
    const company = view.companies.find(c => c.private)!;
    const map = renderMap(view, lang, company);
    const html = renderToStaticMarkup(createElement(MapActivityPalette, child(map, MapActivityPalette).props as unknown as Parameters<typeof MapActivityPalette>[0]));
    expect(html).toContain('data-map-activity="launch:scooters"');
    expect(html).toContain('🛴');
    expect(html).toContain('data-map-activity="supply:new:oil"');
    expect(html).not.toContain('<select');
    const owned = new Set(view.companies.filter(c => c.private).flatMap(c => c.products.map(p => p.id)));
    expect(mapActivities(view).filter(a => a.kind === 'factory' && a.reference.kind === 'product')
      .every(a => a.kind === 'factory' && a.reference.kind === 'product' && owned.has(a.reference.productId))).toBe(true);
  });

  it('places a pointer drag without arming a second placement, while taps and cancelled drags stay distinct', () => {
    const { view } = fixture(lang);
    const map = renderMap(view, lang, view.companies.find(c => c.private)!);
    const place = vi.fn(), prepare = vi.fn();
    const palette = MapActivityPalette({ ...child(map, MapActivityPalette).props, onPlace: place, onPrepare: prepare } as unknown as Parameters<typeof MapActivityPalette>[0]);
    const tool = elements(palette, e => e.props['data-map-activity'] === 'launch:scooters')[0];
    const owner = {}, cell = { closest: (selector: string): object | null => selector === '[data-map-drop-cell]' ? cell : selector === '.hx-map-view' ? owner : null, getAttribute: () => 'C6', setAttribute: vi.fn(), removeAttribute: vi.fn() };
    const target = { closest: () => owner, setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() };
    vi.stubGlobal('document', { elementFromPoint: () => cell });
    const event = (x: number) => ({ button: 0, isPrimary: true, pointerId: 7, clientX: x, clientY: 0, currentTarget: target, preventDefault: vi.fn() });
    const down = tool.props.onPointerDown as (e: unknown) => void, move = tool.props.onPointerMove as typeof down, up = tool.props.onPointerUp as typeof down;
    const click = () => (tool.props.onClick as (event: { detail: number }) => void)({ detail: 1 });
    down(event(0)); move(event(2)); up(event(2)); click();
    expect(prepare).toHaveBeenCalledOnce();
    expect(place).not.toHaveBeenCalled();
    down(event(0)); move(event(30)); up(event(30)); click();
    expect(place).toHaveBeenCalledExactlyOnceWith('C6', 'launch:scooters');
    expect(prepare).toHaveBeenCalledOnce();
    expect(cell.removeAttribute).toHaveBeenCalledWith('data-map-drop-hover');
    down(event(0)); move(event(30)); (tool.props.onPointerCancel as typeof down)(event(30));
    expect(place).toHaveBeenCalledOnce();
  });

  it.each(['onPointerCancel', 'onLostPointerCapture'])('allows the next keyboard activation after a moved drag ends through %s', (end) => {
    const drag = paletteDrag(lang);
    drag.start();
    expect(drag.attributes.get('data-map-drop-cell')).toBe('C6');
    drag.pointer(end);
    expect(drag.place).not.toHaveBeenCalled();
    expect(drag.attributes.size).toBe(0);
    expect(drag.surface.dispatchEvent.mock.calls.some(([event]) => event.type === MAP_DRAG_END)).toBe(true);
    expect(elements(drag.render(), e => e.props.className === 'hx-activity-drag-picture')).toHaveLength(0);
    // Keyboard and assistive-technology clicks have detail 0; pointercancel provides no click to swallow.
    drag.click(0);
    expect(drag.prepare).toHaveBeenCalledExactlyOnceWith({ kind: 'factory', reference: { kind: 'launch', sectorId: 'scooters' } });
    drag.start(); drag.pointer('onPointerUp'); drag.click(1);
    expect(drag.place).toHaveBeenCalledExactlyOnceWith('C6', 'launch:scooters');
    expect(drag.prepare).toHaveBeenCalledOnce();
  });

  it.each([false, true])('Escape releases capture and clears the preview without swallowing the next keyboard activation (moved=%s)', (moved) => {
    const drag = paletteDrag(lang);
    if (moved) drag.start();
    else drag.pointer('onPointerDown', 0);
    const escape = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    (drag.palette.props.onKeyDown as (event: unknown) => void)(escape);
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(escape.stopPropagation).toHaveBeenCalledOnce();
    expect(drag.cancel).toHaveBeenCalledOnce();
    expect(drag.target.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(drag.attributes.size).toBe(0);
    expect(drag.surface.dispatchEvent.mock.calls.some(([event]) => event.type === MAP_DRAG_END)).toBe(moved);
    expect(elements(drag.render(), e => e.props.className === 'hx-activity-drag-picture')).toHaveLength(0);
    // Capture loss and the eventual physical release must not place the cancelled activity.
    drag.pointer('onLostPointerCapture'); drag.pointer('onPointerUp'); drag.click(1);
    expect(drag.place).not.toHaveBeenCalled();
    expect(drag.prepare).not.toHaveBeenCalled();
    drag.click(0);
    expect(drag.prepare).toHaveBeenCalledOnce();
  });

  it('shows compact destination population, exact freight, fractional demand and total margin only on hover', () => {
    const { view } = fixture(lang), company = view.companies.find((c) => c.private)!;
    const target = view.hexes!.free[0], text = hexReadabilityMessages(lang), fmt = fmtFor(lang);
    let map = renderMap(view, lang, company);
    expect(child(map, MapHoverReadout).props.hoveredId).toBeNull();
    (child(map, HexBoard).props.onInspect as (id: string) => void)(target);
    map = renderMap(view, lang, company);
    const props = child(map, MapHoverReadout).props as unknown as Parameters<typeof MapHoverReadout>[0];
    const html = renderToStaticMarkup(createElement(MapHoverReadout, props));
    const estimate = mapFactoryDelivery(view, props.reference, target)!;
    expect(html).not.toContain('<table'); expect(html).not.toContain('<button'); expect(html).not.toContain('aria-live');
    expect(html).toContain(text.population); expect(html).toContain(text.marketDemand);
    expect(html).toContain(text.totalMargin); expect(html).not.toContain(text.deliveryMargin);
    expect(html).toContain(escape(fmt.lots(estimate.demand!, 3)));
    expect(html).toContain(escape(fmt.lotPrice(estimate.transport!, 3)));
    expect(html).toContain(escape(fmt.signedMoney(estimate.demand! * estimate.margin!, 3)));
    expect(child(map, HexCellSheet).props.hexId).toBe(company.products[0].hexId);
  });

  it('replaces the notebook under the map with « Aller à »: places by name, never by grid coordinate, and no terrain list', () => {
    const { game, company, view } = fixture(lang);
    company.cash = 100_000;
    const hexId = view.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Second plant', hexId, bid: view.hexes!.reserve[hexId], fallback: 'nearest' }).ok).toBe(true);
    resolveTurn(game);
    const after = getPlayerView(game, 'human');
    const own = after.companies.find((c) => c.id === company.id)!;
    let map = renderMap(after, lang, own);
    expect(elements(map, (element) => element.type === 'section' && element.props.className === 'hx-notebook')).toHaveLength(0);
    const text = mapWorkspaceMessages(lang);
    const groups = child(map, MapGoToMenu).props.groups as GoToGroup[];
    const group = (key: string) => groups.find((g) => g.key === key)!;
    // Own factories, by name and place (the board's convention « Nom (case) », #64).
    expect(group('factories').label).toBe(text.goToFactories);
    expect(group('factories').entries.map((e) => e.hexId)).toEqual(own.products.map((p) => p.hexId));
    for (const product of own.products) {
      expect(group('factories').entries.map((e) => e.label)).toContain(`${product.name} · ${hexPlaceLabel(product.hexId!, lang, after.siteSlots)}`);
    }
    expect(after.hexes!.results.length).toBeGreaterThan(0);
    expect(group('awards').entries).toHaveLength(after.hexes!.results.length);
    for (const result of after.hexes!.results) {
      const entry = group('awards').entries.find((e) => e.hexId === result.hexId)!;
      expect(entry.label).toContain(hexPlaceLabel(result.hexId, lang, after.siteSlots));
      expect(entry.label).not.toContain(`⚒ ${result.hexId} ·`);
    }
    // No list of the eight starting terrains any more (their ☆ marks and cell sheets remain).
    expect(groups.map((g) => g.key)).toEqual(['factories', 'subsidiaries', 'bids', 'best', 'awards', 'deposits']);
    expect(groups.flatMap((g) => g.entries).some((e) => after.terrains!.some((terrain) => e.label === `${terrain.name} (${terrain.hex})`))).toBe(false);
    // The deposits entry selects the cell of the most needed commodity's deposit, like the notebook button did.
    const deposits = group('deposits').entries[0];
    expect(deposits.label).toBe(text.goToDeposits);
    expect(HEXES.find((hex) => hex.id === deposits.hexId)?.deposit).toBeDefined();
    // Choosing an entry selects its cell exactly like a click on the board.
    (child(map, MapGoToMenu).props.onGo as (hexId: string) => void)(deposits.hexId);
    map = renderMap(after, lang, own);
    expect(child(map, HexBoard).props.selectedId).toBe(deposits.hexId);
    expect(child(map, HexCellSheet).props.hexId).toBe(deposits.hexId);
    const second = own.products.find((p) => p.name === 'Second plant')!;
    (child(map, MapGoToMenu).props.onGo as (hexId: string) => void)(second.hexId!);
    map = renderMap(after, lang, own);
    expect(child(map, HexBoard).props.selectedId).toBe(second.hexId);
    // An own factory chosen there also becomes the tracked product, as on a click.
    expect(side(map).picker.trackedKey).toBe(`product:${second.id}`);
  });

  it('« Aller à » lists pending bids, subsidiaries and the best free cell for the colours, each selecting its cell', () => {
    const { game, company } = fixture(lang);
    company.cash = 1_000_000;
    const before = getPlayerView(game, 'human');
    const hexId = before.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Second plant', hexId, bid: before.hexes!.reserve[hexId], fallback: 'nearest' }).ok).toBe(true);
    const target = before.siteSlots.find((slot) => slot.id === 'sugar-3')!;
    expect(applyAction(game, 'human', { type: 'bidSite', companyId: company.id, slotId: target.id, amount: COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT + 5 }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    // A subsidiary already run by the company (public operator field).
    const subsidiary = view.siteSlots.find((slot) => slot.id !== target.id && !slot.companyId && HEXES.some((hex) => hex.deposit === slot.id))!;
    subsidiary.companyId = company.id;
    const own = view.companies.find((c) => c.id === company.id)!;
    let map = renderMap(view, lang, own);
    const groups = child(map, MapGoToMenu).props.groups as GoToGroup[];
    const group = (key: string) => groups.find((g) => g.key === key)!;
    const text = mapWorkspaceMessages(lang);
    const depositCell = (slotId: string) => HEXES.find((hex) => hex.deposit === slotId)!.id;
    expect(group('bids').label).toBe(text.goToBids);
    expect(group('bids').entries).toEqual([
      { key: `hex:0:${hexId}`, label: `${messages(lang).hex.bidKind.launch} · Second plant · ${hexPlaceLabel(hexId, lang, view.siteSlots)}`, hexId },
      { key: `site:${company.id}:${target.id}`, label: text.goToSiteBid(hexPlaceLabel(depositCell(target.id), lang, view.siteSlots)), hexId: depositCell(target.id) },
    ]);
    expect(group('subsidiaries').entries.map((e) => e.hexId)).toEqual([depositCell(subsidiary.id)]);
    expect(group('subsidiaries').entries[0].label).toContain(getContent(lang).commodities[subsidiary.commodityId].name);
    // The best free cell is the one the colours rank first (highest margin change for the tracked product).
    const reference = child(map, HexBoard).props.reference as Parameters<typeof hexMarginValue>[1];
    const best = group('best').entries[0];
    const highest = Math.max(...view.hexes!.free.map((id) => hexMarginValue(view, reference, id, true) ?? -Infinity));
    expect(hexMarginValue(view, reference, best.hexId, true)).toBe(highest);
    // No award before the first close: the group is left out of the menu.
    expect(group('awards').entries).toHaveLength(0);
    (child(map, MapGoToMenu).props.onGo as (hexId: string) => void)(depositCell(target.id));
    map = renderMap(view, lang, own);
    expect(child(map, HexBoard).props.selectedId).toBe(depositCell(target.id));
    (child(map, MapGoToMenu).props.onGo as (hexId: string) => void)(best.hexId);
    map = renderMap(view, lang, own);
    expect(child(map, HexCellSheet).props.hexId).toBe(best.hexId);
  });

  it('keeps the exact factory when opening raw materials from its flow detail', () => {
    const { view, company } = fixture(lang);
    const selected = view.companies.find((c) => c.id === company.id)!.products[0];
    const selectCompany = vi.fn();
    const selectProduct = vi.fn();
    const goTo = vi.fn();
    const options = { onSelect: selectCompany, onSelectProduct: selectProduct, goTo, selectedProductId: selected.id };
    let map = renderMap(view, lang, null, options);
    (child(map, MapFlowMenu).props.onModeChange as (mode: string) => void)('supply');
    map = renderMap(view, lang, null, options);
    const detail = flowDetail(map)!;
    (detail.props.onOpenMaterials as (companyId: string, productId: string) => void)(company.id, selected.id);
    expect(selectCompany).toHaveBeenCalledWith(company.id);
    expect(selectProduct).toHaveBeenCalledWith(selected.id);
    expect(goTo).toHaveBeenCalledWith('commodities');
    expect(detail.props.onOpenReport).toBeUndefined();
  });

  it('drops the three signs on the board (rank and threats in the game bar, the hot tip in the toolbar); the classic map keeps them', () => {
    const { company, view } = fixture(lang);
    data.view = view;
    setState({ view, lang, lobby: null });
    const own = view.companies.find((c) => c.id === company.id)!;
    const board = CityTab({ company: own, onSelect: vi.fn(), goTo: vi.fn(), openMapFor: vi.fn() });
    expect(child(board, Signs)).toBeUndefined();
    expect(child(board, HexMapView)).toBeDefined();
    // Classic map: the signs stay, and their company sheet still selects its company before asking for the factories.
    const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [
      { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    ]);
    const mine = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
    const other = Object.values(game.companies).find((c) => c.controllerId !== 'human' && c.status === 'active')!;
    game.players.human.cash = 1e9;
    expect(applyAction(game, 'human', { type: 'buyShares', companyId: other.id, shares: Math.floor(other.sharesOutstanding / 2) + 1 }).ok).toBe(true);
    const classic = getPlayerView(game, 'human');
    data.view = classic;
    setState({ view: classic, lang, lobby: null });
    remount();
    let selectedCompanyId = mine.id;
    const goTo = vi.fn();
    const openFactory = vi.fn((id: string) => { selectedCompanyId = id; });
    const map = CityTab({ company: classic.companies.find((c) => c.id === mine.id)!, onSelect: (id) => { selectedCompanyId = id; }, goTo, onOpenFactory: openFactory, openMapFor: vi.fn() });
    const signs = child(map, Signs);
    expect(signs).toBeDefined();
    (signs.props.onSelect as (id: string) => void)(other.id);
    (signs.props.onFactories as () => void)();
    expect(selectedCompanyId).toBe(other.id);
    expect(goTo).toHaveBeenCalledWith('factories');
    expect(openFactory).not.toHaveBeenCalled();
  });

  it('the toolbar hot tip selects its free cell and estimates that launch, without opening a form', () => {
    const { company, view } = fixture(lang);
    for (const sector of view.sectors) for (const estimate of Object.values(sector.launchByHex ?? {})) estimate.paybackQuarters = null;
    const sector = view.sectors[2];
    const hexId = view.hexes!.free[3];
    sector.launchByHex![hexId] = { unitCost: 10, quarterlyProfit: 500, paybackQuarters: 2, demand: 100 };
    const own = view.companies.find((c) => c.id === company.id)!;
    const goTo = vi.fn();
    let map = renderMap(view, lang, own, { goTo });
    const tip = child(map, OpeningChip);
    expect(tip).toBeDefined();
    expect(child(map, HexBoard).props.selectedId).not.toBe(hexId);
    (tip.props.onShowLaunch as (sectorId: SectorId, hexId: string) => void)(sector.id, hexId);
    map = renderMap(view, lang, own, { goTo });
    expect(child(map, HexBoard).props.selectedId).toBe(hexId);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'launch', sectorId: sector.id });
    expect(child(map, HexLaunchForm)).toBeUndefined();
    (child(map, OpeningChip).props.onCommodities as () => void)();
    expect(goTo).toHaveBeenCalledWith('commodities');
  });

  it('a « Voir sur la carte » from the close recap selects that cell only, estimated for my product when it is mine', () => {
    const { company, view } = fixture(lang);
    const own = view.companies.find((c) => c.id === company.id)!;
    const free = view.hexes!.free[5];
    let map = renderMap(view, lang, own, { intent: { kind: 'cell', hexId: free } });
    expect(child(map, HexBoard).props.selectedId).toBe(free);
    expect(child(map, HexLaunchForm)).toBeUndefined();
    expect(child(map, HexMoveForm)).toBeUndefined();
    const product = own.products[0];
    remount();
    map = renderMap(view, lang, own, { intent: { kind: 'cell', hexId: product.hexId! } });
    expect(child(map, HexBoard).props.selectedId).toBe(product.hexId);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: product.id });
  });

  it('keeps the chosen product location and opens that exact factory from its map sheet', () => {
    const { game, company, view } = fixture(lang);
    company.cash = 100_000;
    const hexId = view.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Second plant', hexId, bid: view.hexes!.reserve[hexId], fallback: 'nearest' }).ok).toBe(true);
    resolveTurn(game);
    const after = getPlayerView(game, 'human');
    const own = after.companies.find((c) => c.id === company.id)!;
    const selected = own.products.find((p) => p.name === 'Second plant')!;
    const select = vi.fn();
    const open = vi.fn();
    const options = { selectedProductId: selected.id, onSelectProduct: select, onOpenFactory: open };
    let map = renderMap(after, lang, own, options);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: selected.id });
    expect(child(map, HexBoard).props.selectedId).toBe(selected.hexId);
    (child(map, HexCellSheet).props.onOpenCompany as (companyId: string, productId: string) => void)(own.id, selected.id);
    expect(select).toHaveBeenCalledWith(selected.id);
    map = renderMap(after, lang, own, options);
    const button = elements(map, (element) => element.type === 'button' && element.props.children === messages(lang).city.shell.viewInFactories)[0];
    (button.props.onClick as () => void)();
    expect(open).toHaveBeenCalledWith(own.id, selected.id);
  });

  it('selects the engine capital when the viewer has no factory or available free cell', () => {
    const { game } = fixture(lang);
    const view = getPlayerView(game, 'spectator');
    view.hexes!.free = [];
    const map = renderMap(view, lang);
    expect(child(map, HexBoard).props.selectedId).toBe(capitalHexId);
    expect(child(map, HexCellSheet).props.hexId).toBe(capitalHexId);
  });

  it('hides the launch action when the viewer controls no company, including on a selected free cell', () => {
    const { game } = fixture(lang);
    const view = getPlayerView(game, 'spectator');
    let map = renderMap(view, lang);
    const board = child(map, HexBoard);
    (board.props.onSelect as (id: string) => void)(view.hexes!.free[0]);
    map = renderMap(view, lang);
    const sheet = child(map, HexCellSheet);
    expect(sheet.props.onLaunch).toBeUndefined();
    const html = renderToStaticMarkup(map);
    expect(html).not.toContain(messages(lang).hex.launchHere);
    expect(html).toContain('data-hex-sheet="' + view.hexes!.free[0] + '"');
    // No factory to go to and no acting company in the toolbar; « Aller à » keeps the public destinations.
    const groups = child(map, MapGoToMenu).props.groups as GoToGroup[];
    expect(groups.find((g) => g.key === 'factories')!.entries).toHaveLength(0);
    expect(groups.find((g) => g.key === 'deposits')!.entries).toHaveLength(1);
    expect(html).not.toContain('hx-toolbar-company');
    // The left column says there is no factory to visit and offers the company tab's options, without « Mes usines ».
    expect(html).toContain(escape(messages(lang).factories.noneTitle));
    expect(html).toContain(escape(messages(lang).factories.noneAction));
    expect(html).not.toContain(escape(mapSideMessages(lang).heading));
    expect(html).not.toContain('data-side-fold="deposits"');
  });

  it('opens a selected deposit panel only from the activity band and keeps the right sheet read-only', () => {
    const { view } = fixture(lang), company = view.companies.find((c) => c.private)!;
    const target = view.siteSlots.find((slot) => slot.id === 'sugar-3')!;
    const cell = HEXES.find((hex) => hex.deposit === target.id)!;
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(cell.id);
    map = renderMap(view, lang, company);
    const sheet = child(map, HexCellSheet);
    expect(sheet.props.hexId).toBe(cell.id); expect(sheet.props.readOnly).toBe(true);
    expect(sheet.props.onOpenDeposit).toBeUndefined();
    expect(child(map, DepositPanel)).toBeUndefined();
    (paletteButton(map, hexReadabilityMessages(lang).buildSubsidiary).props.onClick as () => void)();
    map = renderMap(view, lang, company);
    const panel = child(map, DepositPanel);
    expect(panel.props.company).toBe(company); expect(panel.props.slot).toBe(target);
    expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, e => e.type === DepositPanel)).toHaveLength(0);
    expect(elements(map, (element) => element.type === Modal)).toHaveLength(0);
    const wrapper = elements(child(map, MapWorkspace).props.boardHeader as ReactNode, e => e.props['data-hx-map-form'] !== undefined)[0];
    expect(wrapper).toBeDefined(); expect(wrapper.props.tabIndex).toBe(-1);
    remount();
    const html = renderToStaticMarkup(createElement(DepositPanel, panel.props as Parameters<typeof DepositPanel>[0]));
    expect(html).not.toContain(`<h4 class="pk-title">${escape(target.name)}</h4>`);
    remount();
    const titled = renderToStaticMarkup(createElement(DepositPanel, { ...(panel.props as Parameters<typeof DepositPanel>[0]), hideTitle: false, compact: false }));
    expect(titled).toContain(escape(target.name)); expect(titled).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('keeps owned subsidiary facts in the right sheet and its management controls in the top band', () => {
    const { game, company: engineCompany, view: before } = fixture(lang, true);
    engineCompany.cash = 100_000;
    const freeSlot = before.siteSlots.find(slot => !slot.companyId && slot.id === 'sugar-3')!;
    expect(applyAction(game, 'human', { type: 'bidSite', companyId: engineCompany.id, slotId: freeSlot.id, amount: 10_000 }).ok).toBe(true);
    resolveTurn(game);
    const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.id === engineCompany.id)!;
    const slot = view.siteSlots.find(s => s.id === freeSlot.id)!, source = HEXES.find(hex => hex.deposit === slot.id)!.id;
    const site = company.sites!.find(s => s.id === slot.id)!;
    expect(slot.companyId).toBe(company.id);
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(source);
    map = renderMap(view, lang, company);
    const details = child(child(map, HexCellSheet).props.details as ReactNode, SiteSheet);
    expect(details.props).toMatchObject({ company, slot, readOnly: true, hideDecision: true, hideHead: true });
    expect(child(map, DepositPanel)).toBeUndefined();
    const values = hooks.values;
    hooks.values = []; hooks.cursor = 0;
    const infoHtml = renderToStaticMarkup(createElement(SiteSheet, details.props as Parameters<typeof SiteSheet>[0]));
    expect(infoHtml).toContain(escape(messages(lang).sitesPicker.extraction(fmtFor(lang).money(site.currentUnitCost!))));
    expect(infoHtml).not.toContain('<button');
    expect(infoHtml).not.toContain(escape(messages(lang).sites.sleepAria(messages(lang).sites.names.sugar)));
    hooks.values = values;
    const action = paletteButton(map, hexReadabilityMessages(lang).manageSubsidiary);
    expect(action.props.disabled).toBe(false);
    expect(paletteButton(map, hexReadabilityMessages(lang).buildFactory)).toBeUndefined();
    (action.props.onClick as () => void)();
    map = renderMap(view, lang, company);
    expect(child(map, DepositPanel).props).toMatchObject({ company, slot });
    expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, element => element.type === DepositPanel)).toHaveLength(0);
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('opens the launch form on the best free cell for a launch intent, and on the requested cell when given', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const reference = { kind: 'launch' as const, sectorId: 'crypto' as const };
    const best = initialBidHex(view, reference, undefined);
    expect(best).not.toBeNull();
    let map = renderMap(view, lang, company, { intent: { kind: 'launch', companyId: company.id, sectorId: 'crypto' } });
    expect(child(map, HexBoard).props.reference).toMatchObject(reference);
    expect(child(map, HexCellSheet).props.hexId).toBe(best);
    const form = child(map, HexLaunchForm);
    expect(form.props.company).toBe(company);
    expect(form.props.hexId).toBe(best);
    expect(form.props.initialSector).toBe('crypto');
    expect(elements(map, (element) => element.type === Modal)).toHaveLength(0);
    remount();
    const hexId = view.hexes!.free[view.hexes!.free.length - 1];
    map = renderMap(view, lang, company, { intent: { kind: 'launch', companyId: company.id, hexId } });
    expect(child(map, HexCellSheet).props.hexId).toBe(hexId);
    expect(child(map, HexLaunchForm).props.hexId).toBe(hexId);
  });

  it('opens the move form on the best destination cell for a move intent, with the move hint', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const product = company.products[0];
    const reference = { kind: 'product' as const, productId: product.id };
    const best = view.hexes!.free.reduce<string | null>((acc, id) => {
      const gain = hexMarginValue(view, reference, id, true);
      const accGain = acc ? hexMarginValue(view, reference, acc, true) : null;
      return acc === null || (gain !== null && gain > (accGain ?? -Infinity)) ? id : acc;
    }, null);
    expect(best).not.toBeNull();
    const map = renderMap(view, lang, company, { intent: { kind: 'move', productId: product.id } });
    expect(child(map, HexBoard).props.reference).toMatchObject(reference);
    expect(child(map, HexBoard).props.selectedId).toBe(best);
    const sheet = child(map, HexCellSheet);
    const form = child(map, HexMoveForm);
    expect(form.props.company.id).toBe(company.id);
    expect(form.props.product.id).toBe(product.id);
    expect(form.props.hexId).toBe(best);
    expect(elements(map, (element) => element.props.children === messages(lang).hex.moveHint)).toHaveLength(1);
    expect(elements(map, (element) => element.type === Modal)).toHaveLength(0);
  });

  it('opens the deposit panel on the deposit cell for a deposit intent, defaulting to a truly biddable deposit', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const target = view.siteSlots.find((slot) => slot.id === 'sugar-3')!;
    const cell = HEXES.find((hex) => hex.deposit === target.id)!;
    let map = renderMap(view, lang, company, { intent: { kind: 'deposit', companyId: company.id, slotId: target.id } });
    let sheet = child(map, HexCellSheet);
    expect(sheet.props.hexId).toBe(cell.id);
    expect(child(map, DepositPanel).props.slot).toBe(target);
    expect(elements(map, (element) => element.type === Modal)).toHaveLength(0);
    // Without a slot: a free deposit (no operator, no pending bid) of the biggest unserved need.
    const need = (c: CommodityId) => commodityNeed(company, c);
    const unowned = COMMODITY_IDS.filter((c) => !company.sites?.some((s) => s.commodityId === c));
    const biggest = unowned.reduce((winner, c) => need(c) > need(winner) ? c : winner, unowned[0]);
    const slot = freeDepositSlot(view, biggest, company) ?? defaultSlot(view, biggest, company)!;
    expect(slot).toBeDefined();
    remount();
    map = renderMap(view, lang, company, { intent: { kind: 'deposit', companyId: company.id } });
    sheet = child(map, HexCellSheet);
    expect(sheet.props.hexId).toBe(HEXES.find((hex) => hex.deposit === slot.id)!.id);
    expect((child(map, DepositPanel).props.slot as { id: string }).id).toBe(slot.id);
    // A pending bid on that deposit: the intent prefers the next truly biddable one, not defaultSlot's pending pick.
    const bidded = structuredClone(view);
    bidded.self!.siteBids = [{ companyId: company.id, playerId: 'human', commodityId: biggest, slotId: slot.id, amount: 5000, turn: view.turn }];
    const biddedCompany = bidded.companies.find((c) => c.id === company.id)!;
    expect(defaultSlot(bidded, biggest, biddedCompany)!.id).toBe(slot.id); // defaultSlot would reopen the pending bid
    const next = bidded.siteSlots
      .filter((s) => s.commodityId === biggest && !s.companyId && s.id !== slot.id)
      .sort((a, b) => slotCapacity(b.id) - slotCapacity(a.id))[0];
    expect(next).toBeDefined();
    remount();
    map = renderMap(bidded, lang, biddedCompany, { intent: { kind: 'deposit', companyId: company.id } });
    sheet = child(map, HexCellSheet);
    expect((child(map, DepositPanel).props.slot as { id: string }).id).toBe(next.id);
  });

  it('sends launchProduct from the legacy launch form hosted in the top band', async () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(hexId);
    map = renderMap(view, lang, company);
    (child(map, MapActivityPalette).props.onPrepare as (activity: MapActivity) => void)({ kind: 'factory', reference: { kind: 'launch', sectorId: 'crypto' } });
    map = renderMap(view, lang, company);
    (paletteButton(map, hexReadabilityMessages(lang).buildFactory).props.onClick as () => void)();
    map = renderMap(view, lang, company);
    const hosted = child(map, HexLaunchForm);
    expect(hosted.props.hexId).toBe(hexId);
    expect(hosted.props.initialSector).toBe('crypto');
    const props = hosted.props as Parameters<typeof HexLaunchForm>[0];
    remount();
    const tree = HexLaunchForm(props);
    const input = elements(tree, (element) => element.props.id === `hex-launch-name-${company.id}`)[0];
    (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'New Widget' } });
    hooks.cursor = 0;
    renderToStaticMarkup(createElement(HexLaunchForm, props));
    const r = await lastForm().onSubmit(reserve + 10);
    expect(r.ok).toBe(true);
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'launchProduct', companyId: company.id, sectorId: 'crypto', name: 'New Widget', hexId, bid: reserve + 10, fallback: 'nearest' }, turn: view.turn },
      expect.any(Function),
    );
  });

  it('sends moveFactory from the legacy move form hosted in the top band', async () => {
    const { game, company: gameCompany } = fixture(lang);
    gameCompany.cash = 100_000;
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((c) => c.id === gameCompany.id)!;
    const product = company.products[0];
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(hexId);
    map = renderMap(view, lang, company);
    (paletteButton(map, messages(lang).hex.moveHere(product.name)).props.onClick as () => void)();
    map = renderMap(view, lang, company);
    // Move mode: the product becomes the lens reference, the hint shows, the form sits in the sheet.
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: product.id });
    expect(elements(map, (element) => element.props.children === messages(lang).hex.moveHint)).toHaveLength(1);
    const hosted = child(map, HexMoveForm);
    expect(hosted.props.hexId).toBe(hexId);
    remount();
    renderToStaticMarkup(createElement(HexMoveForm, hosted.props as Parameters<typeof HexMoveForm>[0]));
    expect(lastForm().disabledReason).toBeNull();
    const r = await lastForm().onSubmit(reserve);
    expect(r.ok).toBe(true);
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'moveFactory', companyId: company.id, productId: product.id, hexId, bid: reserve }, turn: view.turn },
      expect.any(Function),
    );
  });

  it('bids on a free deposit from the top band, withdraws the bid and puts a won subsidiary to sleep', async () => {
    const { game, company: gameCompany } = fixture(lang);
    gameCompany.cash = 1_000_000;
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((c) => c.id === gameCompany.id)!;
    const target = view.siteSlots.find((slot) => slot.id === 'sugar-3')!;
    const cell = HEXES.find((hex) => hex.deposit === target.id)!;
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(cell.id);
    map = renderMap(view, lang, company);
    (paletteButton(map, hexReadabilityMessages(lang).buildSubsidiary).props.onClick as () => void)();
    map = renderMap(view, lang, company);
    const panel = child(map, DepositPanel);
    expect(panel.props.slot).toBe(target);
    // The panel bids through its AmountForm (fake socket, guided-game-api pattern).
    remount();
    renderToStaticMarkup(createElement(DepositPanel, panel.props as Parameters<typeof DepositPanel>[0]));
    const amount = COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT + 5;
    await lastForm().onSubmit(amount);
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'bidSite', companyId: company.id, slotId: target.id, amount }, turn: view.turn },
      expect.any(Function),
    );
    // A pending bid can be withdrawn from the same panel.
    expect(applyAction(game, 'human', { type: 'bidSite', companyId: gameCompany.id, slotId: target.id, amount }).ok).toBe(true);
    const pending = getPlayerView(game, 'human');
    const pendingCompany = pending.companies.find((c) => c.id === gameCompany.id)!;
    data.view = pending;
    setState({ view: pending, lang, lobby: null });
    remount();
    const footer = SiteBidFooter({ company: pendingCompany, slot: target, desktop: true });
    const withdraw = elements(footer, (element) => element.type === 'button' && element.props.children === messages(lang).sites.withdraw)[0];
    expect(withdraw).toBeDefined();
    await (withdraw.props.onClick as () => Promise<void>)();
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'cancelSiteBid', companyId: gameCompany.id, commodityId: 'sugar' }, turn: pending.turn },
      expect.any(Function),
    );
    // Won at the close (nobody can outbid this), the subsidiary goes to sleep from the sheet.
    resolveTurn(game);
    const after = getPlayerView(game, 'human');
    const owner = after.companies.find((c) => c.id === gameCompany.id)!;
    const won = after.siteSlots.find((slot) => slot.id === target.id)!;
    expect(won.companyId).toBe(owner.id);
    expect(owner.sites?.some((site) => site.id === target.id)).toBe(true);
    data.view = after;
    setState({ view: after, lang, lobby: null });
    remount();
    const sheetTree = SiteSheet({ company: owner, slot: won });
    const sleep = elements(sheetTree, (element) => element.props['aria-label'] === messages(lang).sites.sleepAria(messages(lang).sites.names.sugar))[0];
    expect(sleep).toBeDefined();
    (sleep.props.onClick as () => void)();
    hooks.cursor = 0;
    const confirm = elements(SiteSheet({ company: owner, slot: won }), (element) => element.type === ConfirmModal)[0];
    expect(confirm).toBeDefined();
    (confirm.props.onConfirm as () => void)();
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'setSiteDormant', companyId: owner.id, commodityId: 'sugar', dormant: true }, turn: after.turn },
      expect.any(Function),
    );
  });

  it('closes the product modal and puts the board in move mode from its move button', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const product = company.products[0];
    let map = renderMap(view, lang, company);
    (child(map, HexCellSheet).props.onOpenCompany as (companyId: string, productId: string) => void)(company.id, product.id);
    map = renderMap(view, lang, company);
    const card = child(map, ProductCard);
    expect(card).toBeDefined();
    (card.props.onMove as (productId: string) => void)(product.id);
    map = renderMap(view, lang, company);
    expect(child(map, ProductCard)).toBeUndefined();
    expect(elements(map, (element) => element.type === Modal)).toHaveLength(0);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: product.id });
    expect(elements(map, (element) => element.props.children === messages(lang).hex.moveHint)).toHaveLength(1);
    // The next free-cell selection hosts the move form for that product.
    const hexId = view.hexes!.free[0];
    (child(map, HexBoard).props.onSelect as (id: string) => void)(hexId);
    map = renderMap(view, lang, company);
    const hosted = child(map, HexMoveForm);
    expect(hosted.props.product.id).toBe(product.id);
    expect(hosted.props.hexId).toBe(hexId);
  });

  it('never renders another board or map inside a modal, whatever is open', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const product = company.products[0];
    let map = renderMap(view, lang, company);
    (child(map, HexCellSheet).props.onOpenCompany as (companyId: string, productId: string) => void)(company.id, product.id);
    map = renderMap(view, lang, company);
    const modals = elements(map, (element) => element.type === Modal);
    expect(modals.length).toBeGreaterThan(0);
    for (const modal of modals) {
      const inner = modal.props.children as ReactNode;
      expect(elements(inner, (element) => element.type === HexBoard)).toHaveLength(0);
      // No modal hosts a second map scene (the deleted pickers lived under .pk-mapscene).
      expect(elements(inner, (element) => String(element.props.className ?? '').includes('pk-mapscene'))).toHaveLength(0);
    }
    // The only board of the whole view is the map's own.
    expect(elements(map, (element) => element.type === HexBoard)).toHaveLength(1);
  });

  it('reconciles a discontinued product reference to an available launch reference', () => {
    const { game, company, view } = fixture(lang);
    let map = renderMap(view, lang, view.companies.find((c) => c.private)!);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: company.products[0].id });
    const productId = company.products[0].id;
    const result = applyAction(game, 'human', { type: 'discontinueProduct', companyId: company.id, productId });
    expect(result.ok, result.message).toBe(true);
    const after = getPlayerView(game, 'human');
    map = renderMap(after, lang, after.companies.find((c) => c.private)!);
    // React runs this reconciliation after receiving the new authoritative view.
    for (const effect of hooks.effects) effect();
    map = renderMap(after, lang, after.companies.find((c) => c.private)!);
    expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'launch', sectorId: after.sectors[0].id });
    expect(child(map, HexCellSheet).props.reference).toEqual({ kind: 'launch', sectorId: after.sectors[0].id });
    expect(child(map, HexCellSheet).props.hexId).toBe(child(map, HexBoard).props.selectedId);
  });

  it('scrolls the opened form into view and focuses it when the map opens with an intent', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const map = renderMap(view, lang, company, { intent: { kind: 'launch', companyId: company.id, sectorId: 'crypto' } });
    // The focus target: the inline form wrapper in the side sheet.
    const wrapper = elements(map, (element) => element.props['data-hx-map-form'] !== undefined)[0];
    expect(wrapper).toBeDefined();
    expect(wrapper.props.tabIndex).toBe(-1);
    const form = { scrollIntoView: vi.fn(), focus: vi.fn() };
    vi.stubGlobal('document', { querySelector: (selector: string) => (selector === '[data-hx-map-form]' ? form : null) });
    for (const effect of hooks.effects) effect();
    expect(form.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(form.focus).toHaveBeenCalledTimes(1);
    // Without an intent, no scroll and no focus steal.
    remount();
    form.scrollIntoView.mockClear();
    form.focus.mockClear();
    renderMap(view, lang, company);
    for (const effect of hooks.effects) effect();
    expect(form.scrollIntoView).not.toHaveBeenCalled();
    expect(form.focus).not.toHaveBeenCalled();
  });

  it('shows the acting-company chips in the map header and switches the acting company', () => {
    const { game, company } = fixture(lang);
    const other = Object.values(game.companies).find((c) => c.controllerId !== 'human' && c.status === 'active')!;
    game.players.human.cash = 1e9;
    expect(applyAction(game, 'human', { type: 'buyShares', companyId: other.id, shares: Math.floor(other.sharesOutstanding / 2) + 1 }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const acting = view.companies.find((c) => c.id === company.id)!;
    const onSelect = vi.fn();
    const map = renderMap(view, lang, acting, { onSelect });
    const header = elements(map, (element) => element.props.className === 'map-company-header hx-toolbar-company')[0];
    expect(header).toBeDefined();
    expect(renderToStaticMarkup(header)).toContain(escape(fmtFor(lang).money(acting.cash)));
    const row = elements(header, (element) => element.props.role === 'group' && element.props['aria-label'] === messages(lang).city.map.actingCompany(acting.name))[0];
    expect(row).toBeDefined();
    expect(row.props['aria-label']).toBe(messages(lang).city.map.actingCompany(acting.name));
    const html = renderToStaticMarkup(header);
    expect(html).toContain(escape(messages(lang).city.map.actingCompany(acting.name)));
    // One chip per controlled company; only the acting one is pressed.
    const chips = elements(row, (element) => element.type === 'button' && element.props['aria-pressed'] !== undefined);
    expect(chips).toHaveLength(2);
    const pressed = chips.filter((chip) => chip.props['aria-pressed'] === true);
    expect(pressed).toHaveLength(1);
    expect(renderToStaticMarkup(pressed[0])).toContain(escape(acting.name));
    // The cash follows the acting company's name, inside its pressed chip, never after the last chip.
    const cash = escape(fmtFor(lang).money(acting.cash));
    expect(renderToStaticMarkup(pressed[0])).toContain(`${escape(acting.name)}<span aria-hidden="true"> · </span><strong aria-hidden="true">${cash}</strong>`);
    expect(renderToStaticMarkup(pressed[0])).toContain(escape(mapWorkspaceMessages(lang).companyCash(fmtFor(lang).money(acting.cash))));
    const otherChip = chips.find((chip) => chip.props['aria-pressed'] === false)!;
    expect(renderToStaticMarkup(otherChip)).not.toContain('<strong');
    expect(html.match(/<strong/g)).toHaveLength(1);
    (otherChip.props.onClick as () => void)();
    expect(onSelect).toHaveBeenCalledWith(other.id);
  });

  it('keeps the acting-company header and omits its switcher when the player controls a single company', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const map = renderMap(view, lang, company);
    const header = elements(map, (element) => element.props.className === 'map-company-header hx-toolbar-company')[0];
    expect(header).toBeDefined();
    // Compact: « Test Holding · 12,0 M€ », the « Aux manettes » wording and the cash label stay for screen readers.
    expect(header.props['aria-label']).toBe(messages(lang).city.map.actingCompany(company.name));
    const html = renderToStaticMarkup(header);
    expect(html).toContain(`<span>${escape(company.name)}<span aria-hidden="true"> · </span><strong aria-hidden="true">${escape(fmtFor(lang).money(company.cash))}</strong>`);
    expect(html).toContain(escape(mapWorkspaceMessages(lang).companyCash(fmtFor(lang).money(company.cash))));
    expect(elements(header, (element) => element.type === 'button')).toHaveLength(0);
  });

  it('keeps the best-cell legacy move intent and warns when no free parcel improves its margin', () => {
    const { view } = fixture(lang), company = view.companies.find((c) => c.private)!;
    const product = company.products[0], reference = { kind: 'product' as const, productId: product.id };
    const best = (v: PlayerView) => v.hexes!.free.reduce<string | null>((acc, id) => {
      const gain = hexMarginValue(v, reference, id, true), previous = acc ? hexMarginValue(v, reference, acc, true) : null;
      return acc === null || gain !== null && gain > (previous ?? -Infinity) ? id : acc;
    }, null);
    const noBetter = (node: ReactNode) => elements(node, e => e.props['data-hx-move-no-better'] === true);
    const options = { intent: { kind: 'move' as const, productId: product.id } };
    let map = renderMap(view, lang, company, options);
    expect(child(map, HexBoard).props.selectedId).toBe(best(view));
    expect(child(map, HexMoveForm).props.hexId).toBe(best(view));
    expect(elements(map, e => e.props.children === messages(lang).hex.moveHint)).toHaveLength(1);
    expect(hexMarginValue(view, reference, best(view)!, true)!).toBeGreaterThan(0);
    expect(noBetter(map)).toHaveLength(0);
    remount();
    for (const id of view.hexes!.free) product.private!.hexes!.unitCost[id] = 1e6;
    map = renderMap(view, lang, company, options);
    expect(child(map, HexMoveForm)).toBeDefined();
    expect(noBetter(map)).toHaveLength(1);
    expect(noBetter(map)[0].props.children).toBe(messages(lang).hex.lensNoBetter);
    const hint = elements(map, e => e.type === 'p' && e.props.role === 'status')[0];
    (elements(hint.props.children as ReactNode, e => e.type === 'button')[0].props.onClick as () => void)();
    map = renderMap(view, lang, company, options);
    expect(noBetter(map)).toHaveLength(0);
  });

  it('closes an explicit legacy move with the cancel control in the band, leaving the right sheet read-only', () => {
    const { view } = fixture(lang), company = view.companies.find((c) => c.private)!;
    const product = company.products[0], options = { intent: { kind: 'move' as const, productId: product.id } };
    let map = renderMap(view, lang, company, options);
    expect(child(map, HexMoveForm)).toBeDefined();
    expect(child(map, HexCellSheet).props.readOnly).toBe(true);
    const hint = elements(map, e => e.type === 'p' && e.props.role === 'status')[0];
    const cancel = elements(hint.props.children as ReactNode, e => e.type === 'button')[0];
    expect(cancel.props.children).toBe(messages(lang).common.cancel);
    (cancel.props.onClick as () => void)();
    map = renderMap(view, lang, company, options);
    expect(elements(map, e => e.props.children === messages(lang).hex.moveHint)).toHaveLength(0);
    expect(child(map, HexMoveForm)).toBeUndefined();
  });

  it('leaves legacy move mode when the tracked reference changes, preserving it for the same product', () => {
    const { view } = fixture(lang), company = view.companies.find((c) => c.private)!;
    const product = company.products[0], options = { intent: { kind: 'move' as const, productId: product.id } };
    let map = renderMap(view, lang, company, options);
    (side(map).picker.onTrackedChange as (key: string) => void)(`product:${product.id}`);
    map = renderMap(view, lang, company, options);
    expect(child(map, HexMoveForm)).toBeDefined();
    expect(elements(map, e => e.props.children === messages(lang).hex.moveHint)).toHaveLength(1);
    (side(map).picker.onTrackedChange as (key: string) => void)('launch:crypto');
    map = renderMap(view, lang, company, options);
    expect(child(map, HexMoveForm)).toBeUndefined();
    expect(elements(map, e => e.props.children === messages(lang).hex.moveHint)).toHaveLength(0);
  });


  it('sends a land bid for the selected parcel even while another parcel is hovered', async () => {
    const { game, company: engineCompany } = fixture(lang, true);
    engineCompany.cash = 100_000;
    const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.id === engineCompany.id)!;
    const source = view.hexes!.free[0], hovered = view.hexes!.free[1], text = hexReadabilityMessages(lang);
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(source);
    map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onInspect as (id: string) => void)(hovered);
    map = renderMap(view, lang, company);
    const action = paletteButton(map, text.buyLand);
    expect(action.props.disabled).toBe(false);
    (action.props.onClick as () => void)();
    map = renderMap(view, lang, company);
    const panel = child(map, IndustryPanel);
    expect(panel.props).toMatchObject({ hexId: source, actionMode: 'land', compact: true });
    const actions = child(map, MapActivityPalette).props.actions as ReactNode;
    const forms = elements(actions, e => e.props['data-hx-map-form'] !== undefined);
    expect(forms).toHaveLength(1);
    expect(elements(map, e => e.props['data-hx-map-form'] !== undefined)).toHaveLength(1);
    expect(child(forms[0], IndustryPanel)).toBe(panel);
    expect(elements(forms[0], e => e.type === 'strong')).toHaveLength(0);
    expect(elements(forms[0], e => e.type === 'button' && e.props.children === messages(lang).common.close)).toHaveLength(1);
    expect(child(map, MapHoverReadout).props.hoveredId).toBe(hovered);
    expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, e => e.type === IndustryPanel)).toHaveLength(0);
    const props = panel.props as unknown as Parameters<typeof IndustryPanel>[0];
    remount();
    renderToStaticMarkup(createElement(IndustryPanel, props));
    const bid = view.hexes!.landReserve![source];
    expect(lastForm().min).toBe(bid);
    await lastForm().onSubmit(bid);
    expect(transport.emit).toHaveBeenCalledWith('game:action', {
      action: { type: 'bidLand', companyId: company.id, hexId: source, bid }, turn: view.turn,
    }, expect.any(Function));
  });

  it.each(['existing', 'fresh'] as const)('hosts the %s factory fields inside the palette actions and closes them without changing the origin', actionMode => {
    const { game, company: engineCompany } = fixture(lang, true);
    engineCompany.cash = 100_000;
    const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.id === engineCompany.id)!;
    const source = view.hexes!.free[0], profile = actionMode === 'fresh'
      ? { kind: 'launch' as const, sectorId: 'scooters' as const }
      : { kind: 'product' as const, productId: company.products[0].id };
    let map = renderMap(view, lang, company);
    (child(map, MapActivityPalette).props.onPrepare as (activity: MapActivity) => void)({ kind: 'factory', reference: profile });
    map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(source);
    map = renderMap(view, lang, company);
    (paletteButton(map, hexReadabilityMessages(lang).buildFactory).props.onClick as () => void)();
    map = renderMap(view, lang, company);
    const actions = child(map, MapActivityPalette).props.actions as ReactNode;
    const forms = elements(actions, e => e.props['data-hx-map-form'] !== undefined);
    expect(forms).toHaveLength(1);
    expect(elements(map, e => e.props['data-hx-map-form'] !== undefined)).toHaveLength(1);
    expect(child(forms[0], IndustryPanel).props).toMatchObject({ company, hexId: source, reference: { ...profile, originHexId: source }, actionMode, compact: true });
    expect(elements(forms[0], e => e.type === 'strong')).toHaveLength(0);
    expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, e => e.type === IndustryPanel)).toHaveLength(0);
    const places = elements(actions, e => e.props.className === 'hx-action-place');
    expect(places).toHaveLength(1);
    expect(places[0].props.children).toBe(hexPlaceLabel(source, view.config.lang, view.siteSlots));
    const close = elements(forms[0], e => e.type === 'button' && e.props.children === messages(lang).common.close)[0];
    expect(close).toBeDefined();
    (close.props.onClick as () => void)();
    map = renderMap(view, lang, company);
    expect(child(map, IndustryPanel)).toBeUndefined();
    expect(elements(map, e => e.props['data-hx-map-form'] !== undefined)).toHaveLength(0);
    expect(child(map, HexBoard).props.selectedId).toBe(source);
    expect(child(map, HexBoard).props.reference).toMatchObject({ ...profile, originHexId: source });
    expect(paletteButton(map, hexReadabilityMessages(lang).buildFactory)).toBeDefined();
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it.each(['land', 'factory', 'launch'] as const)('reviews a %s bid with its original company and profile after another company was selected', async kind => {
    const { game, company: owner } = fixture(lang, true);
    owner.cash = 100_000;
    const other = Object.values(game.companies).find(c => c.controllerId !== 'human' && c.status === 'active')!;
    game.players.human.cash = 1e9;
    expect(applyAction(game, 'human', { type: 'buyShares', companyId: other.id, shares: Math.floor(other.sharesOutstanding / 2) + 1 }).ok).toBe(true);
    const before = getPlayerView(game, 'human'), hexId = before.hexes!.free[0];
    const action = kind === 'land' ? { type: 'bidLand' as const, companyId: owner.id, hexId, bid: before.hexes!.landReserve![hexId] }
      : kind === 'factory' ? { type: 'buildFactory' as const, companyId: owner.id, productId: owner.products[0].id, hexId, bid: before.hexes!.reserve[hexId] }
        : { type: 'launchProduct' as const, companyId: owner.id, sectorId: 'scooters' as const, name: 'New profile', hexId, bid: before.hexes!.reserve[hexId], fallback: 'abandon' as const };
    expect(applyAction(game, 'human', action).ok).toBe(true);
    const view = getPlayerView(game, 'human'), original = view.companies.find(c => c.id === owner.id)!, alternative = view.companies.find(c => c.id === other.id)!;
    const onSelect = vi.fn(), options = { onSelect, selectedProductId: alternative.products[0].id };
    let map = renderMap(view, lang, alternative, options);
    (child(map, MapGoToMenu).props.onGo as (id: string) => void)(hexId);
    map = renderMap(view, lang, alternative, options);
    expect(child(map, IndustryPanel)).toBeUndefined();
    (paletteButton(map, mapWorkspaceMessages(lang).goToBids).props.onClick as () => void)();
    expect(onSelect).toHaveBeenCalledWith(owner.id);
    map = renderMap(view, lang, original, options);
    // Apply the real company-change effects, then render again: an explicit review must keep its form open.
    for (const effect of hooks.effects) effect();
    map = renderMap(view, lang, original, options);
    const panel = child(map, IndustryPanel);
    expect(panel.props).toMatchObject({ company: original, hexId, actionMode: kind === 'land' ? 'land' : kind === 'launch' ? 'fresh' : 'existing' });
    expect(child(map, HexBoard).props.reference).toMatchObject(kind === 'launch'
      ? { kind: 'launch', sectorId: 'scooters', originHexId: hexId }
      : { kind: 'product', productId: original.products[0].id, originHexId: hexId });
    expect(transport.emit).not.toHaveBeenCalled();
    const props = panel.props as unknown as Parameters<typeof IndustryPanel>[0];
    remount();
    const form = IndustryPanel(props);
    const cancel = elements(form, element => element.type === 'button' && element.props.children === messages(lang).hex.bidCancel)[0];
    expect(cancel).toBeDefined();
    (cancel.props.onClick as () => void)();
    expect(transport.emit).toHaveBeenCalledWith('game:action', {
      action: { type: 'cancelHexBid', companyId: owner.id, hexId }, turn: view.turn,
    }, expect.any(Function));
  });

  it.each(['land', 'factory'] as const)('restores the %s bid mode and its profile when arriving from pending decisions', kind => {
    const { game, company: engineCompany } = fixture(lang, true);
    engineCompany.cash = 100_000;
    const before = getPlayerView(game, 'human'), hexId = before.hexes!.free[0];
    expect(applyAction(game, 'human', kind === 'land'
      ? { type: 'bidLand', companyId: engineCompany.id, hexId, bid: before.hexes!.landReserve![hexId] }
      : { type: 'buildFactory', companyId: engineCompany.id, productId: engineCompany.products[0].id, hexId, bid: before.hexes!.reserve[hexId] }).ok).toBe(true);
    const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.id === engineCompany.id)!;
    const map = renderMap(view, lang, company, { intent: { kind: 'launch', companyId: company.id, hexId } });
    expect(child(map, HexBoard).props.selectedId).toBe(hexId);
    expect(child(map, IndustryPanel).props).toMatchObject({ company, hexId, actionMode: kind === 'land' ? 'land' : 'existing' });
    if (kind === 'factory') expect(child(map, HexBoard).props.reference).toMatchObject({ kind: 'product', productId: company.products[0].id, originHexId: hexId });
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it.each(['hex', 'square'] as const)('opens a workshop construction for the exact existing product on the %s board', async mapMode => {
    const { view, company: engineCompany } = fixture(lang, true, mapMode);
    const company = view.companies.find(c => c.id === engineCompany.id)!;
    const productId = company.products[0].id;
    const reference = { kind: 'product' as const, productId };
    const hexId = initialBidHex(view, reference)!;
    const intent = { kind: 'launch' as const, companyId: company.id, existingProductId: productId };
    const map = renderMap(view, lang, company, { intent });
    const panel = child(map, IndustryPanel);
    expect(panel.props).toMatchObject({ company, hexId, actionMode: 'existing', reference });
    expect(child(map, HexCellSheet).props.hexId).toBe(hexId);
    expect(child(map, HexLaunchForm)).toBeUndefined();
    expect(transport.emit).not.toHaveBeenCalled();
    expect(intentKey(intent)).not.toBe(intentKey({ ...intent, existingProductId: 'different' }));
    // The real form submits the existing-product build contract, without a new product name.
    const props = panel.props as unknown as Parameters<typeof IndustryPanel>[0];
    remount();
    renderToStaticMarkup(IndustryPanel(props));
    const form = lastForm();
    expect(form.disabledReason).toBeNull();
    await form.onSubmit(view.hexes!.reserve[hexId]);
    expect(transport.emit).toHaveBeenCalledWith('game:action', {
      action: { type: 'buildFactory', companyId: company.id, productId, hexId, bid: view.hexes!.reserve[hexId] }, turn: view.turn,
    }, expect.any(Function));
  });

  it('honours an existing-product construction destination on land already owned by that company', () => {
    const { game, company: engineCompany } = fixture(lang, true);
    engineCompany.cash = 100_000;
    const before = getPlayerView(game, 'human');
    const hexId = before.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'bidLand', companyId: engineCompany.id, hexId, bid: before.hexes!.landReserve![hexId] }).ok).toBe(true);
    resolveTurn(game);
    const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.id === engineCompany.id)!;
    expect(view.hexes!.free).not.toContain(hexId);
    const map = renderMap(view, lang, company, { intent: { kind: 'launch', companyId: company.id, existingProductId: company.products[0].id, hexId } });
    expect(child(map, IndustryPanel).props).toMatchObject({ company, hexId, actionMode: 'existing' });
    expect(child(map, HexBoard).props.selectedId).toBe(hexId);
  });

  it.each(['missing', 'rival', 'other-company', 'legacy'] as const)('does not reinterpret an invalid %s existing-product intent as a new launch', invalid => {
    const { game, company: engineCompany } = fixture(lang, true);
    const other = Object.values(game.companies).find(c => c.id !== engineCompany.id)!;
    if (invalid === 'other-company') other.controllerId = 'human';
    if (invalid === 'legacy') delete game.config.industryRules;
    const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.id === engineCompany.id)!;
    const existingProductId = invalid === 'missing' ? 'missing' : invalid === 'legacy' ? company.products[0].id : other.products[0].id;
    const map = renderMap(view, lang, company, { intent: { kind: 'launch', companyId: company.id, existingProductId } });
    expect(child(map, IndustryPanel)).toBeUndefined();
    expect(child(map, HexLaunchForm)).toBeUndefined();
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('reviews an old startup bid using its move form and original product withdrawal', () => {
    const { game, company: previous } = fixture(lang);
    previous.status = 'bankrupt'; previous.controllerId = null; previous.products = [];
    game.players.human.cash = 1e6; game.turn = 2;
    const before = getPlayerView(game, 'human'), hexId = before.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'foundStartup', name: 'Comeback', sectorId: 'crypto', investment: 30_000, hexId, bid: before.hexes!.reserve[hexId], fallback: 'abandon' }).ok).toBe(true);
    const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.private)!, product = company.products[0];
    expect(view.self!.hexBids!.find(b => b.hexId === hexId)?.kind).toBe('startup');
    let map = renderMap(view, lang, company);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(hexId);
    map = renderMap(view, lang, company);
    (paletteButton(map, mapWorkspaceMessages(lang).goToBids).props.onClick as () => void)();
    map = renderMap(view, lang, company);
    const form = child(map, HexMoveForm);
    expect(form.props).toMatchObject({ company, product, hexId });
    expect(child(map, HexLaunchForm)).toBeUndefined();
    const props = form.props as unknown as Parameters<typeof HexMoveForm>[0];
    remount();
    const sheet = HexMoveForm(props);
    const withdraw = elements(sheet, element => element.type === 'button' && element.props.children === messages(lang).hex.formWithdraw)[0];
    (withdraw.props.onClick as () => void)();
    expect(transport.emit).toHaveBeenCalledWith('game:action', {
      action: { type: 'cancelHexBid', companyId: company.id, productId: product.id }, turn: view.turn,
    }, expect.any(Function));
  });

  it('keeps the inline forms out of the cell sheet live region', () => {
    const { view } = fixture(lang);
    data.view = view;
    setState({ view, lang, lobby: null });
    const hexId = view.hexes!.free[0];
    const html = renderToStaticMarkup(createElement(HexCellSheet, { view, hexId, children: createElement('div', { className: 'hx-map-form' }) }));
    expect(html).not.toMatch(/<section class="hx-cell-sheet"[^>]*aria-live/);
    expect(html).toContain('aria-live="polite"');
    // The form sits after the live region, as a sibling of it.
    expect(html).toContain('</div><div class="hx-map-form"');
  });
});

describe.each(['fr', 'en'] as const)('square map construction drops (%s)', lang => {
  it('prepares construction on owned vacant land, excluding occupied and foreign-owned parcels', () => {
    const { game, company: source, view: initialView } = fixture(lang, true, 'square');
    source.cash = 1e6;
    const ownedCell = initialView.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'bidLand', companyId: source.id, hexId: ownedCell, bid: hexReservePrice(ownedCell) }).ok).toBe(true);
    resolveTurn(game);
    const after = getPlayerView(game, 'human');
    const foreignCell = after.hexes!.free[0];
    const rival = Object.values(game.companies).find(c => c.id !== source.id)!;
    (rival.land ??= []).push({ hexId: foreignCell, cost: hexReservePrice(foreignCell) });
    const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.id === source.id)!;
    const profile = `product:${company.products[0].id}`;
    let map = renderMap(view, lang, company);
    const drop = (cellId: string) => {
      (child(map, MapActivityPalette).props.onPlace as (id: string, key: string) => void)(cellId, profile);
      map = renderMap(view, lang, company);
    };
    drop(ownedCell);
    expect(child(map, IndustryPanel).props).toMatchObject({ company, hexId: ownedCell, actionMode: 'existing' });
    drop(foreignCell);
    expect(child(map, IndustryPanel)).toBeUndefined();
    drop(company.products[0].hexId!);
    expect(child(map, IndustryPanel)).toBeUndefined();
    drop(view.hexes!.free[0]);
    expect(child(map, IndustryPanel).props.hexId).toBe(view.hexes!.free[0]);
    expect(transport.emit).not.toHaveBeenCalled();
  });
});

describe.each(['fr', 'en'] as const)('map flow figure controls (%s)', lang => {
  it.each(['hex', 'square'] as const)('keeps figure panels and rival controls, showing the map-label toggle only when supported (%s)', mapMode => {
    const { view } = fixture(lang, true, mapMode);
    let map = renderMap(view, lang, view.companies.find(c => c.private)!);
    (child(map, MapFlowMenu).props.onModeChange as (mode: string) => void)('production');
    map = renderMap(view, lang, view.companies.find(c => c.private)!);
    const controls = child(map, MapFlowMenu).props as unknown as Parameters<typeof MapFlowMenu>[0];
    expect(controls.showFiguresToggle).toBe(mapMode !== 'square');
    const menu = MapFlowMenu(controls);
    const html = renderToStaticMarkup(createElement('div', null, menu.props.children as ReactNode));
    const figureLabel = escape(mapFlowText(lang).figures);
    if (mapMode === 'square') expect(html).not.toContain(figureLabel);
    else expect(html).toContain(figureLabel);
    expect(html).toContain(escape(mapFlowText(lang).rivals));
    expect(flowDetail(map)).toBeDefined();
  });
});
