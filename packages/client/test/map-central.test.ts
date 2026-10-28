import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn, type CompanyView, type Lang, type PlayerView, type ProductView } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { mapWorkspaceMessages } from '../src/i18n/mapWorkspace';
import { type GameData } from '../src/hooks/useGame';
import { getState, setState, type AppState } from '../src/store';
import { HexBoard } from '../src/screens/game/city/HexBoard';
import { HexCellSheet } from '../src/screens/game/city/HexCellSheet';
import { HexMapView } from '../src/screens/game/city/HexMapView';
import { MapGoToMenu } from '../src/screens/game/city/HexMapToolbar';
import { MapView, type FactoryIcon } from '../src/screens/game/city/MapView';
import { ZoneSheet } from '../src/screens/game/city/MapSheets';
import { HexMoveForm, ZoneMoveForm } from '../src/screens/game/MoveForms';
import { HexLaunchForm, ZoneLaunchForm } from '../src/screens/game/LaunchForms';
import { MapProductControls, type MapProductControlsProps } from '../src/screens/game/city/MapProductControls';
import { MapFlowControls, type MapFlowControlsProps } from '../src/screens/game/city/MapFlowControls';
import { MapFlowMenu, type MapFlowMenuProps } from '../src/screens/game/city/HexMapToolbar';
import { mapFlowText } from '../src/i18n/mapFlows';
import { MapFlowDetail } from '../src/screens/game/city/MapFlowDetail';
import { MapWorkspace } from '../src/screens/game/city/MapWorkspace';
import { MapActivityPalette } from '../src/screens/game/city/MapActivityPalette';
import { hexReadabilityMessages } from '../src/i18n/hexReadability';
import type { HexSidePanelProps } from '../src/screens/game/city/HexSidePanel';
import { valueLensModel, type ValueReference } from '../src/screens/game/city/mapModel';
import type { FlowModel } from '../src/screens/game/city/mapFlows';

/** Stateful handlers without a DOM, following hexMapIntegration.test.ts. Nested SSR renders get fresh
 * hook state, so rendering the complete view cannot overwrite the root component's interaction state. */
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, active: false }));
const gameData = vi.hoisted(() => ({ current: null as GameData | null }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const seed = () => typeof initial === 'function' ? (initial as () => unknown)() : initial;
      if (!hooks.active) return [seed(), vi.fn()];
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = seed();
      return [hooks.values[index], (value: unknown) => {
        hooks.values[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(hooks.values[index]) : value;
      }];
    },
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
    useRef: (current: unknown) => ({ current }),
    useEffect: () => {},
    useLayoutEffect: () => {},
  };
});
vi.mock('../src/hooks/useGame', () => ({ useGame: () => gameData.current! }));
vi.mock('../src/hooks/useElementWidth', () => ({ useElementWidth: () => [vi.fn(), 880] }));
vi.mock('../src/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../src/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('../src/screens/game/city/a11y', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/screens/game/city/a11y')>();
  return { ...actual, useInView: () => [vi.fn(), true] };
});
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
vi.mock('../src/solo/runtime', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/solo/runtime')>(),
  applySoloAction: async () => ({ ok: true, message: 'OK' }),
  advanceSoloTurn: () => ({ ok: true, message: 'OK' }),
}));

const initialState = getState();
beforeEach(() => vi.stubGlobal('window', { setTimeout, clearTimeout }));
afterEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  hooks.active = false;
  gameData.current = null;
  setState(initialState);
  vi.unstubAllGlobals();
});

type MapMode = 'classic' | 'hex';
function fixture(lang: Lang, mapMode: MapMode) {
  const game = createGame({ seed: 17, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang, mapMode, terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  const before = getPlayerView(game, 'human');
  const placement = mapMode === 'hex'
    ? { hexId: before.hexes!.free[0], bid: before.hexes!.reserve[before.hexes!.free[0]], fallback: 'nearest' as const }
    : { zoneId: 'plain' as const };
  expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Second plant', ...placement }).ok).toBe(true);
  resolveTurn(game);
  const view = getPlayerView(game, 'human');
  const mine = view.companies.find((c) => c.id === company.id)!;
  expect(mine.products).toHaveLength(2);
  return { view, mine, first: mine.products[0], second: mine.products[1] };
}

function dataFor(view: PlayerView, lang: Lang): GameData {
  const playersById = new Map(view.players.map((p) => [p.id, p]));
  const companiesById = new Map(view.companies.map((c) => [c.id, c]));
  const sectorsById = new Map(view.sectors.map((s) => [s.id, s]));
  return {
    view, me: playersById.get(view.you)!, playersById, companiesById, sectorsById,
    myCompanies: view.companies.filter((c) => c.controllerId === view.you && c.status === 'active'),
    playerName: (id) => id ? playersById.get(id)?.name ?? messages(lang).common.unknown : messages(lang).common.autopilot,
    refPrice: (id) => sectorsById.get(id)?.refPrice ?? 100,
  };
}

/** Toolbar and sheet are explicit slots of MapWorkspace and need to be traversed, like children. */
function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...elements(node.props.children as ReactNode, predicate),
    ...elements(node.props.toolbar as ReactNode, predicate),
    ...elements(node.props.sheet as ReactNode, predicate),
    ...elements(node.props.boardHeader as ReactNode, predicate),
    ...elements(node.props.actions as ReactNode, predicate),
  ];
}
function child(node: ReactNode, type: unknown) {
  const found = elements(node, (element) => element.type === type)[0];
  expect(found).toBeDefined();
  return found;
}
function clickPaletteAction(node: ReactNode, label: string) {
  const action = elements(child(node, MapActivityPalette).props.actions as ReactNode,
    element => element.type === 'button' && element.props.children === label)[0];
  expect(action).toBeDefined();
  expect(action.props.disabled).not.toBe(true);
  (action.props.onClick as () => void)();
}
function productControls(node: ReactNode): MapProductControlsProps {
  return child(node, MapProductControls).props as unknown as MapProductControlsProps;
}
/** The classic map keeps its selectors; the board's palette and left-hand cards share the same reference model. */
function sideProps(node: ReactNode): HexSidePanelProps {
  return (child(node, MapWorkspace).props.sidePanel as ReactElement<HexSidePanelProps>).props;
}
interface Controls { trackedKey: string; compare: boolean; comparedKey: string; options: readonly { key: string; label: string }[] }
function controls(node: ReactNode, mapMode: MapMode): Controls {
  if (mapMode === 'hex') {
    const picker = sideProps(node).picker;
    const flows = child(node, MapFlowMenu).props as unknown as MapFlowMenuProps;
    return { trackedKey: picker.trackedKey, compare: flows.compare, comparedKey: flows.comparedKey, options: picker.groups.flatMap((group) => group.options) };
  }
  const { trackedKey, compare, comparedKey, options } = productControls(node);
  return { trackedKey, compare, comparedKey, options };
}
function flowControls(node: ReactNode, mapMode: MapMode): Pick<MapFlowControlsProps, 'mode' | 'onModeChange' | 'unavailable'> {
  return (mapMode === 'hex' ? child(node, MapFlowMenu) : child(node, MapFlowControls)).props as unknown as MapFlowControlsProps;
}
/** The open « Flux » menu's content (its panel), as the toolbar renders it. */
function flowMenuContent(node: ReactNode): ReactNode {
  const menu = MapFlowMenu(child(node, MapFlowMenu).props as unknown as MapFlowMenuProps) as ReactElement<{ children: ReactNode }>;
  return menu.props.children;
}
/** Trigger the native controls' real change handlers, then rerender their parent. */
function pickTracked(node: ReactNode, key: string, mapMode: MapMode) {
  if (mapMode === 'hex') {
    const handlers = sideProps(node).handlers;
    if (key.startsWith('product:')) handlers.track(key.slice('product:'.length));
    else handlers.pickLaunch(key.slice('launch:'.length) as Parameters<typeof handlers.pickLaunch>[0], null);
    return;
  }
  const controls = MapProductControls(productControls(node));
  const picker = elements(controls, (element) => element.type === 'select')[0];
  (picker.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: key } });
}
function toggleCompare(node: ReactNode, checked: boolean, mapMode: MapMode) {
  const toggle = mapMode === 'hex'
    ? elements(flowMenuContent(node), (element) => element.type === 'label'
      && Array.isArray(element.props.children) && (element.props.children as ReactNode[]).includes(mapWorkspaceMessages(getState().lang).colorByOther))
      .flatMap((label) => elements(label.props.children as ReactNode, (element) => element.type === 'input'))[0]
    : elements(MapProductControls(productControls(node)), (element) => element.type === 'input')[0];
  expect(toggle).toBeDefined();
  (toggle.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked } });
}
function pickCompared(node: ReactNode, key: string, mapMode: MapMode) {
  const picker = mapMode === 'hex'
    ? elements(flowMenuContent(node), (element) => element.type === 'select')[0]
    : elements(MapProductControls(productControls(node)), (element) => element.type === 'select')[1];
  (picker.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: key } });
}
const escape = (value: string) => renderToStaticMarkup(createElement('span', null, value)).slice(6, -7);

function renderMap(view: PlayerView, lang: Lang, mapMode: MapMode, company: CompanyView, selectedProductId: string, onSelectProduct = vi.fn(), onSelect = vi.fn()) {
  gameData.current = dataFor(view, lang);
  setState({ view, lang, lobby: null });
  hooks.cursor = 0;
  hooks.active = true;
  try {
    const props = { company, selectedProductId, onSelectProduct, onSelect, goTo: vi.fn(), onOpenFactory: vi.fn() };
    return mapMode === 'hex' ? HexMapView(props) : MapView({ ...props, frozen: false, onToggleStill: vi.fn() });
  } finally {
    hooks.active = false;
  }
}
function showValueLens(node: ReactNode, lang: Lang, mapMode: MapMode) {
  if (mapMode === 'hex') return;
  const button = elements(node, (element) => element.type === 'button' && element.props.children === messages(lang).city.map.lensValue)[0];
  expect(button).toBeDefined();
  (button.props.onClick as () => void)();
}
function expectLens(node: ReactNode, view: PlayerView, mapMode: MapMode, reference: ValueReference) {
  if (mapMode === 'hex') {
    expect(child(node, HexBoard).props.reference).toEqual({ ...reference, originHexId: child(node, HexBoard).props.selectedId });
    expect(child(node, HexCellSheet).props.reference).toEqual(reference);
  } else {
    const haloLayer = elements(node, (element) => Array.isArray(element.props.halos))[0];
    expect(haloLayer).toBeDefined();
    expect((haloLayer.props.halos as Record<string, unknown>[]).map(({ text: _text, ...halo }) => halo))
      .toEqual(valueLensModel(view, reference)!.zones);
    expect(child(node, ZoneSheet).props.reference).toEqual(reference);
  }
}
function clickFactory(node: ReactNode, mapMode: MapMode, product: ProductView) {
  if (mapMode === 'hex') {
    (child(node, MapGoToMenu).props.onGo as (id: string) => void)(product.hexId!);
  } else {
    const layer = elements(node, (element) => Array.isArray(element.props.icons) && typeof element.props.onSelect === 'function')[0];
    expect(layer).toBeDefined();
    const icon = (layer.props.icons as FactoryIcon[]).find(({ mark }) => mark.productId === product.id)!;
    (layer.props.onSelect as (mark: FactoryIcon['mark']) => void)(icon.mark);
  }
}
/** The flow detail: below the classic map; on the board's left column (these tests are 1200 px wide), in the tracked card. */
function flowDetailOf(node: ReactNode): ReactElement<Record<string, unknown>> | undefined {
  const below = elements(node, (element) => element.type === MapFlowDetail)[0];
  if (below) return below;
  const panel = elements(node, (element) => element.type === MapWorkspace)[0]?.props.sidePanel as ReactElement<HexSidePanelProps> | undefined;
  return (panel?.props.flowDetail?.(true) as ReactElement<Record<string, unknown>> | null) ?? undefined;
}
function selectedFlow(node: ReactNode): string | null {
  const detail = flowDetailOf(node);
  expect(detail).toBeDefined();
  return (detail!.props.model as FlowModel).selectedProductId;
}

for (const mapMode of ['classic', 'hex'] as const) describe.each(['fr', 'en'] as const)(`central ${mapMode} map (%s)`, (lang) => {
  it('renders the viewport workspace, acting company cash and one shared selector with layers off', () => {
    const { view, mine, first } = fixture(lang, mapMode);
    const acting = { ...mine, id: 'second-company', name: 'Acting company', cash: 4321, products: [] };
    view.companies.push(acting);
    const map = renderMap(view, lang, mapMode, acting, first.id);
    const html = renderToStaticMarkup(map);
    const header = elements(map, (element) => String(element.props.className ?? '').split(' ').includes('map-company-header'))[0];
    const headerHtml = renderToStaticMarkup(header);
    expect(headerHtml).toContain(escape(messages(lang).city.map.actingCompany(acting.name)));
    expect(headerHtml).toContain(escape(mapWorkspaceMessages(lang).companyCash(fmtFor(lang).money(acting.cash))));
    expect(html).toContain('map-workspace');
    expect(html).toContain('map-workspace-column');
    expect((html.match(/class="map-product-picker[ "]/g) ?? [])).toHaveLength(mapMode === 'hex' ? 0 : 1);
    if (mapMode === 'hex') {
      // A desktop: the left column (no toolbar row) with « Chiffrer pour » and its two groups, the colours, then
      // « Flux » opened up, its « Aucun » pressed (the comparison waits for a layer), « Aller à » and the legend fold.
      expect(html).toContain(`<aside class="map-workspace-side" aria-label="${escape(mapWorkspaceMessages(lang).sidePanel)}">`);
      expect(html).not.toContain('map-workspace-toolbar');
      expect(html).not.toContain(escape(mapWorkspaceMessages(lang).figuresFor));
      expect(html).toContain('class="hx-activity-palette"');
      expect(html).toContain('data-map-activity="launch:crypto"');
      expect(html).toContain(`data-map-activity="product:${first.id}"`);
      // « Flux » is a fold of the column, its summary naming the layer; no toolbar menu is mounted.
      expect(html).toContain(`<details class="hx-side-fold map-flow-fold"><summary>${escape(mapFlowText(lang).menu(mapFlowText(lang).modeShort.off))}</summary>`);
      expect(html).toContain(`aria-pressed="true">${escape(mapFlowText(lang).mode.off)}</button>`);
      expect(html).not.toContain('map-flow-menu');
      expect(html).not.toContain(escape(mapWorkspaceMessages(lang).colorByOther));
      expect(html).not.toContain(escape(mapWorkspaceMessages(lang).trackedProduct));
      // The board in its frame, with the zoom buttons.
      expect(html).toContain(`aria-label="${escape(mapWorkspaceMessages(lang).zoomIn)}"`);
    } else {
      expect(html).toContain('map-workspace-toolbar');
      expect(html).toContain(escape(mapWorkspaceMessages(lang).trackedProduct));
      expect(html).toContain(escape(mapWorkspaceMessages(lang).compare));
      // The classic map keeps its full-width drawing and its size toggle, without the board's frame.
      expect(html).not.toContain('map-zoom');
      expect(html).toContain(escape(mapWorkspaceMessages(lang).wholeCountry));
    }
    expect(html).not.toContain('map-flow-product');
    expect(flowControls(map, mapMode).mode).toBe('off');
    expect(flowDetailOf(map)).toBeUndefined();
    if (mapMode === 'hex') expect(child(map, HexBoard).props.flowModel).toBeNull();
  });

  it('changes both the lens and flow product through the tracked selector and factory clicks, including with flows off', () => {
    const { view, mine, first, second } = fixture(lang, mapMode);
    const select = vi.fn();
    const render = () => renderMap(view, lang, mapMode, mine, first.id, select);
    let map = render();
    showValueLens(map, lang, mapMode);
    clickFactory(map, mapMode, second);
    map = render();
    expect(flowControls(map, mapMode).mode).toBe('off');
    expect(controls(map, mapMode).trackedKey).toBe(`product:${second.id}`);
    expectLens(map, view, mapMode, { kind: 'product', productId: second.id });
    expect(select).toHaveBeenCalledWith(second.id);
    flowControls(map, mapMode).onModeChange('production');
    pickTracked(map, `product:${first.id}`, mapMode);
    map = render();
    expectLens(map, view, mapMode, { kind: 'product', productId: first.id });
    expect(selectedFlow(map)).toBe(first.id);
    pickTracked(map, `product:${second.id}`, mapMode);
    map = render();
    expectLens(map, view, mapMode, { kind: 'product', productId: second.id });
    expect(selectedFlow(map)).toBe(second.id);
  });

  it('names both references and preserves the compared lens when another own factory is clicked', () => {
    const { view, mine, first, second } = fixture(lang, mapMode);
    const render = () => renderMap(view, lang, mapMode, mine, first.id);
    let map = render();
    showValueLens(map, lang, mapMode);
    flowControls(map, mapMode).onModeChange('sales');
    if (mapMode === 'hex') map = render();
    toggleCompare(map, true, mapMode);
    map = render();
    pickCompared(map, 'launch:crypto', mapMode);
    map = render();
    expectLens(map, view, mapMode, { kind: 'launch', sectorId: 'crypto' });
    clickFactory(map, mapMode, second);
    map = render();
    const current = controls(map, mapMode);
    expect(current.compare).toBe(true);
    expect(current.trackedKey).toBe(`product:${second.id}`);
    expect(current.comparedKey).toBe('launch:crypto');
    expectLens(map, view, mapMode, { kind: 'launch', sectorId: 'crypto' });
    expect(selectedFlow(map)).toBe(second.id);
    const html = renderToStaticMarkup(map);
    const comparison = escape(mapWorkspaceMessages(lang).comparison(
      current.options.find((option) => option.key === current.trackedKey)!.label,
      current.options.find((option) => option.key === current.comparedKey)!.label,
    ));
    if (mapMode === 'hex') {
      // « Colorer selon un autre produit » lives in the « Flux » menu; the colour group names the other reference.
      const menu = renderToStaticMarkup(createElement(Fragment, null, flowMenuContent(map)));
      expect((menu.match(/class="map-product-picker[ "]/g) ?? [])).toHaveLength(1);
      expect(menu).toContain(comparison);
      expect(html).toContain(escape(mapWorkspaceMessages(lang).colorsBy(current.options.find((option) => option.key === 'launch:crypto')!.label)));
    } else {
      expect((html.match(/class="map-product-picker"/g) ?? [])).toHaveLength(2);
      expect(html).toContain(comparison);
    }
    toggleCompare(map, false, mapMode);
    map = render();
    expectLens(map, view, mapMode, { kind: 'product', productId: second.id });
    expect(selectedFlow(map)).toBe(second.id);
  });

  it('selects the moving product’s owner before opening a cross-company move form', () => {
    const { view, mine, first, second } = fixture(lang, mapMode);
    const owner = { ...mine, id: 'moving-company', name: 'Moving company', cash: 54321, products: [second] };
    mine.products = [first];
    view.companies.push(owner);
    if (mapMode === 'hex') view.hexes!.occupied[second.hexId!] = owner.id;
    const selectOwner = vi.fn();
    const render = () => renderMap(view, lang, mapMode, mine, first.id, vi.fn(), selectOwner);
    let map = render();
    pickTracked(map, `product:${second.id}`, mapMode);
    map = render();
    if (mapMode === 'hex') {
      const destination = view.hexes!.free[0];
      (child(map, HexBoard).props.onSelect as (hexId: string) => void)(destination);
      map = render();
      clickPaletteAction(map, messages(lang).hex.moveHere(second.name));
      map = render();
      expect((child(map, HexMoveForm).props.company as CompanyView).id).toBe(owner.id);
    } else {
      (child(map, ZoneSheet).props.onMove as (productId: string) => void)(second.id);
      map = render();
      const sheet = child(map, ZoneSheet).props;
      const moved = ZoneSheet(sheet as unknown as Parameters<typeof ZoneSheet>[0]);
      expect((child(moved, ZoneMoveForm).props.company as CompanyView).id).toBe(owner.id);
    }
    expect(selectOwner).toHaveBeenCalledWith(owner.id);
  });

    it('synchronizes launch sectors with the selected profile and the matching construction form', () => {
    const { view, mine, first } = fixture(lang, mapMode);
    const render = () => renderMap(view, lang, mapMode, mine, first.id);
    const hostedForm = (map: ReactNode) => mapMode === 'hex' ? child(map, HexLaunchForm)
      : child(ZoneSheet(child(map, ZoneSheet).props as unknown as Parameters<typeof ZoneSheet>[0]), ZoneLaunchForm);
    let map = render();
    showValueLens(map, lang, mapMode);
    if (mapMode === 'hex') {
      const destination = view.hexes!.free[0];
      (child(map, HexBoard).props.onSelect as (hexId: string) => void)(destination);
      map = render();
      pickTracked(map, 'launch:crypto', mapMode);
      map = render();
      clickPaletteAction(map, hexReadabilityMessages(lang).buildFactory);
    } else {
      pickTracked(map, 'launch:crypto', mapMode);
    }
    map = render();
    expect(hostedForm(map).props.trackedSector).toBe('crypto');
    pickTracked(map, 'launch:yogurts', mapMode);
    map = render();
    if (mapMode === 'hex') {
      expect(elements(map, element => element.type === HexLaunchForm)).toHaveLength(0);
      clickPaletteAction(map, hexReadabilityMessages(lang).buildFactory);
      map = render();
    }
    expect(hostedForm(map).props.trackedSector).toBe('yogurts');
    expectLens(map, view, mapMode, { kind: 'launch', sectorId: 'yogurts' });
    (hostedForm(map).props.onSectorChange as (sectorId: string) => void)('scooters');
    map = render();
    expect(controls(map, mapMode).trackedKey).toBe('launch:scooters');
    expect(hostedForm(map).props.trackedSector).toBe('scooters');
    expectLens(map, view, mapMode, { kind: 'launch', sectorId: 'scooters' });
  });

    it('uses a new-plant reference for the lens and explains why it cannot have current flows', () => {
    const { view, mine, first } = fixture(lang, mapMode);
    const render = () => renderMap(view, lang, mapMode, mine, first.id);
    let map = render();
    showValueLens(map, lang, mapMode);
    pickTracked(map, 'launch:crypto', mapMode);
    flowControls(map, mapMode).onModeChange('supply');
    map = render();
    expectLens(map, view, mapMode, { kind: 'launch', sectorId: 'crypto' });
    expect(flowControls(map, mapMode).unavailable).toBe(true);
    expect(flowDetailOf(map)).toBeUndefined();
    if (mapMode === 'hex') expect(child(map, HexBoard).props.flowModel).toBeNull();
    const html = mapMode === 'hex' ? renderToStaticMarkup(createElement(Fragment, null, map, flowMenuContent(map))) : renderToStaticMarkup(map);
    expect(html).toContain(escape(mapWorkspaceMessages(lang).needsProduct));
    expect(html).not.toContain('map-flow-layer');
  });
});


describe.each(['fr', 'en'] as const)('hex tracked factory and move mode (%s)', (lang) => {
  it('keeps move mode for the same factory and leaves it when another factory becomes tracked', () => {
    const { view, mine, first, second } = fixture(lang, 'hex');
    const render = () => renderMap(view, lang, 'hex', mine, first.id);
    const destination = view.hexes!.free[0];
    let map = render();
    (child(map, HexBoard).props.onSelect as (hexId: string) => void)(destination);
    map = render();
    clickPaletteAction(map, messages(lang).hex.moveHere(first.name));
    map = render();
    expect((child(map, HexMoveForm).props.product as ProductView).id).toBe(first.id);
    clickFactory(map, 'hex', first);
    map = render();
    (child(map, HexBoard).props.onSelect as (hexId: string) => void)(destination);
    map = render();
    expect((child(map, HexMoveForm).props.product as ProductView).id).toBe(first.id);
    clickFactory(map, 'hex', second);
    map = render();
    (child(map, HexBoard).props.onSelect as (hexId: string) => void)(destination);
    map = render();
    expect(controls(map, 'hex').trackedKey).toBe(`product:${second.id}`);
    expect(elements(map, (element) => element.type === HexMoveForm)).toHaveLength(0);
  });
});
