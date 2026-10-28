import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, type Lang, type PlayerView } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { mapFlowText } from '../src/i18n/mapFlows';
import { mapWorkspaceMessages } from '../src/i18n/mapWorkspace';
import { hexReadabilityMessages } from '../src/i18n/hexReadability';
import { isometricMessages } from '../src/i18n/isometric';
import { getState, setState, type AppState } from '../src/store';
import {
  HexColorControls, HexLegendFold, HexLegendMenu, MapFlowFold, MapFlowMenu, MapGoToMenu, MapReferencePicker, ToolbarMenu, menuPanelShift,
  type MapFlowMenuProps, type ReferenceGroup,
} from '../src/screens/game/city/HexMapToolbar';
import { hexLegendEnds, hexLegendSteps } from '../src/screens/game/city/hexLegend';
import { hexMarginQuintiles, type HexReference } from '../src/screens/game/city/hexModel';

/** Cursor-based hooks whose effects (and their cleanup) the tests run, like pending-decisions-ui.test.ts. */
interface EffectSlot { deps?: readonly unknown[]; cleanup?: () => void }
const hooks = vi.hoisted(() => ({
  cursor: 0, values: [] as unknown[], effects: new Map<number, EffectSlot>(),
  scheduled: new Map<number, { effect: () => void | (() => void); deps?: readonly unknown[] }>(),
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks.values[i], (next: unknown) => {
        hooks.values[i] = typeof next === 'function' ? (next as (value: unknown) => unknown)(hooks.values[i]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.values)) hooks.values[i] = { current: initial };
      return hooks.values[i];
    },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const i = hooks.cursor++;
      const previous = hooks.effects.get(i);
      if (!previous || !deps || !previous.deps || deps.some((value, j) => !Object.is(value, previous.deps![j]))) hooks.scheduled.set(i, { effect, deps });
    },
    useId: () => `:menu${hooks.cursor++}:`,
    useMemo: (make: () => unknown) => make(),
  };
});
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(select: (state: AppState) => T): T => select(actual.getState()) };
});

const initial = getState();
function resetHooks() {
  for (const slot of hooks.effects.values()) slot.cleanup?.();
  hooks.cursor = 0; hooks.values = []; hooks.effects.clear(); hooks.scheduled.clear();
}
function flushEffects() {
  for (const [i, next] of hooks.scheduled) {
    hooks.effects.get(i)?.cleanup?.();
    const cleanup = next.effect();
    hooks.effects.set(i, { deps: next.deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined });
  }
  hooks.scheduled.clear();
}
beforeEach(() => resetHooks());
afterEach(() => { resetHooks(); setState(initial); vi.unstubAllGlobals(); });

const escaped = (value: string) => renderToStaticMarkup(createElement(Fragment, null, value));
function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children as ReactNode, predicate)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : '';
}
function fixture(lang: Lang): PlayerView {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode: 'hex', terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Rival', sectorId: 'yogurts', connected: true, color: '#abcdef' },
  ]);
  return getPlayerView(game, 'human');
}
const groups: ReferenceGroup[] = [
  { label: 'Vos produits', options: [{ key: 'product:a', label: 'Nuit Blanche Max' }, { key: 'product:b', label: 'Yaourt Test' }] },
  { label: 'Nouvelle usine', options: [{ key: 'launch:crypto', label: 'une nouvelle usine de Crypto' }] },
];

function islandFixture(lang: Lang) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang,
    mapMode: 'square', terrainAssignment: 'fair', industryRules: 'network' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'landowner', name: 'Bob', isBot: false, companyName: 'Vacant Parcel Holding', sectorId: 'yogurts', connected: true, color: '#abcdef' },
  ]);
  // A real network snapshot after an active company has lost its last factory but kept its parcel.
  const owner = Object.values(game.companies).find(company => company.controllerId === 'landowner')!;
  const parcelId = owner.products[0].hexId!;
  owner.land = [{ hexId: parcelId, cost: 75 }];
  owner.products = [];
  owner.sites = [];
  return { view: getPlayerView(game, 'human'), ownerId: owner.id, parcelId };
}

describe('toolbar menu: keyboard and pointer behaviour', () => {
  function harness() {
    const listeners = new Map<string, Set<(event: unknown) => void>>();
    const documentHarness = {
      activeElement: null as unknown,
      addEventListener: vi.fn((name: string, listener: (event: unknown) => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(listener);
      }),
      removeEventListener: vi.fn((name: string, listener: (event: unknown) => void) => listeners.get(name)?.delete(listener)),
    };
    vi.stubGlobal('document', documentHarness);
    const inside = {};
    const focusTrigger = vi.fn();
    const items = [0, 1, 2].map(() => ({ focus: vi.fn(function (this: unknown) { documentHarness.activeElement = this; }) }));
    const panel = { focus: vi.fn(), querySelectorAll: () => items };
    const render = () => {
      hooks.cursor = 0;
      const tree = ToolbarMenu({ label: 'Flux : aucun', panelLabel: 'Flux',
        children: [createElement('button', { key: 'a', type: 'button' }, 'Aucun'), createElement('button', { key: 'b', type: 'button', 'data-menu-close': true }, 'Ventes')] }) as ReactElement<{
        children: ReactNode; ref: { current: unknown }; onBlur: (event: unknown) => void }>;
      tree.props.ref.current = { contains: (target: unknown) => target === inside };
      const trigger = elements(tree, (element) => element.type === 'button' && element.props['aria-expanded'] !== undefined)[0];
      (trigger.props.ref as { current: unknown }).current = { focus: focusTrigger };
      const region = elements(tree, (element) => element.props.role === 'group')[0];
      if (region) (region.props.ref as { current: unknown }).current = panel;
      flushEffects();
      return { tree, trigger, region };
    };
    const fire = (name: string, event: unknown) => { for (const listener of [...(listeners.get(name) ?? [])]) listener(event); };
    return { listeners, render, fire, inside, focusTrigger, items, panel, documentHarness };
  }

  it('opens from its button, focuses the first entry, and closes on Escape with the focus back on the button', () => {
    const { render, fire, listeners, focusTrigger, items } = harness();
    let { trigger, region } = render();
    expect(trigger.props['aria-expanded']).toBe(false);
    expect(region).toBeUndefined();
    expect(text(trigger.props.children as ReactNode)).toBe('Flux : aucun ▾');
    (trigger.props.onClick as () => void)();
    ({ trigger, region } = render());
    expect(trigger.props['aria-expanded']).toBe(true);
    expect(trigger.props['aria-controls']).toBe(region.props.id);
    expect(region.props['aria-label']).toBe('Flux');
    expect(items[0].focus).toHaveBeenCalledTimes(1);
    expect(listeners.get('keydown')?.size).toBe(1);
    expect(listeners.get('pointerdown')?.size).toBe(1);
    fire('keydown', { key: 'Enter' });
    expect(render().trigger.props['aria-expanded']).toBe(true);
    fire('keydown', { key: 'Escape' });
    expect(render().trigger.props['aria-expanded']).toBe(false);
    expect(focusTrigger).toHaveBeenCalledTimes(1);
    expect(listeners.get('keydown')?.size).toBe(0);
    expect(listeners.get('pointerdown')?.size).toBe(0);
  });

  it('closes on a click outside, not inside, and when the focus tabs out of it', () => {
    const { render, fire, inside, listeners } = harness();
    let { tree, trigger } = render();
    (trigger.props.onClick as () => void)();
    render();
    fire('pointerdown', { target: inside });
    expect(render().trigger.props['aria-expanded']).toBe(true);
    fire('pointerdown', { target: {} });
    ({ tree, trigger } = render());
    expect(trigger.props['aria-expanded']).toBe(false);
    expect(listeners.get('pointerdown')?.size).toBe(0);
    (trigger.props.onClick as () => void)();
    ({ tree } = render());
    tree.props.onBlur({ relatedTarget: inside });
    expect(render().trigger.props['aria-expanded']).toBe(true);
    ({ tree } = render());
    tree.props.onBlur({ relatedTarget: {} });
    expect(render().trigger.props['aria-expanded']).toBe(false);
  });

  it('moves between entries with the arrows, Home and End, and leaves a select its own arrows', () => {
    const { render, items, documentHarness } = harness();
    (render().trigger.props.onClick as () => void)();
    const { region } = render();
    const key = (k: string, tagName = 'BUTTON') => {
      const preventDefault = vi.fn();
      (region.props.onKeyDown as (event: unknown) => void)({ key: k, target: { tagName }, preventDefault });
      return preventDefault;
    };
    expect(documentHarness.activeElement).toBe(items[0]);
    expect(key('ArrowDown')).toHaveBeenCalledOnce();
    expect(documentHarness.activeElement).toBe(items[1]);
    key('End');
    expect(documentHarness.activeElement).toBe(items[2]);
    key('ArrowDown');
    expect(documentHarness.activeElement).toBe(items[0]);
    key('ArrowUp');
    expect(documentHarness.activeElement).toBe(items[2]);
    key('Home');
    expect(documentHarness.activeElement).toBe(items[0]);
    expect(key('ArrowDown', 'SELECT')).not.toHaveBeenCalled();
    expect(documentHarness.activeElement).toBe(items[0]);
    expect(key('a')).not.toHaveBeenCalled();
  });

  it('keeps an open panel inside the window, also when its content grows or the window narrows', () => {
    const { render, fire, panel } = harness();
    const windowListeners = new Map<string, () => void>();
    vi.stubGlobal('window', {
      innerWidth: 1280,
      addEventListener: vi.fn((name: string, listener: () => void) => windowListeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => windowListeners.delete(name)),
    });
    const observers: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(public callback: () => void) { observers.push(this); }
    });
    // « Flux ▾ » near x≈920 on a 1280 px row: its 440 px panel would end at 1360 and be cut off.
    let box = { left: 920, right: 1360 };
    const style = { transform: 'stale' };
    Object.assign(panel, { style, getBoundingClientRect: () => box });
    (render().trigger.props.onClick as () => void)();
    render();
    expect(style.transform).toBe('translateX(-96px)');
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledWith(panel);
    // The content shrinks (layer turned off): back to its natural place.
    box = { left: 920, right: 1160 };
    observers[0].callback();
    expect(style.transform).toBe('');
    // The window narrows while the menu is open.
    box = { left: 920, right: 1250 };
    (window as unknown as { innerWidth: number }).innerWidth = 1200;
    windowListeners.get('resize')!();
    expect(style.transform).toBe('translateX(-66px)');
    fire('keydown', { key: 'Escape' });
    render();
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(windowListeners.has('resize')).toBe(false);
  });

  it('shifts a panel left when it overflows on the right, right when it overflows on the left, the left edge first', () => {
    expect(menuPanelShift(100, 400, 1280)).toBe(0);
    expect(menuPanelShift(920, 1360, 1280)).toBe(-96);
    // « Légende » opens leftwards: wrapped to the start of a row, it would start before the window.
    expect(menuPanelShift(-30, 300, 1280)).toBe(46);
    // Wider than the window: its start stays readable.
    expect(menuPanelShift(100, 1500, 1280)).toBe(-84);
  });

  it('closes after choosing a destination entry and gives the focus back to its button', () => {
    const { render, focusTrigger } = harness();
    (render().trigger.props.onClick as () => void)();
    const { region } = render();
    const click = (marked: boolean) => (region.props.onClick as (event: unknown) => void)({ target: { closest: (selector: string) => marked && selector === '[data-menu-close]' ? {} : null } });
    click(false);
    expect(render().trigger.props['aria-expanded']).toBe(true);
    click(true);
    expect(render().trigger.props['aria-expanded']).toBe(false);
    expect(focusTrigger).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });
});

describe.each(['fr', 'en'] as const)('hex map toolbar controls (%s)', (lang) => {
  beforeEach(() => setState({ ...initial, lang, view: null, lobby: null }));

  it('« Chiffrer pour » is one select grouped into your products and new factories', () => {
    const html = renderToStaticMarkup(createElement(MapReferencePicker, { groups, trackedKey: 'product:b', onTrackedChange: () => {} }));
    expect(html).toContain(escaped(mapWorkspaceMessages(lang).figuresFor));
    expect(html).toContain('<optgroup label="Vos produits"><option value="product:a">Nuit Blanche Max</option><option value="product:b" selected="">Yaourt Test</option></optgroup>');
    expect(html).toContain('<optgroup label="Nouvelle usine"><option value="launch:crypto">');
    const onTrackedChange = vi.fn();
    const select = elements(MapReferencePicker({ groups: [...groups, { label: 'Vide', options: [] }], trackedKey: 'product:a', onTrackedChange }), (e) => e.type === 'select')[0];
    expect(elements(select, (e) => e.type === 'optgroup')).toHaveLength(2);
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'launch:crypto' } });
    expect(onTrackedChange).toHaveBeenCalledWith('launch:crypto');
  });

  it('« Flux » names the active layer in its button and keeps the options, comparison and hints in the menu', () => {
    const flows = mapFlowText(lang);
    const workspace = mapWorkspaceMessages(lang);
    const props: MapFlowMenuProps = { mode: 'off', onModeChange: vi.fn(), figures: true, onFiguresChange: vi.fn(), rivals: true, onRivalsChange: vi.fn(),
      compare: false, onCompareChange: vi.fn(), groups, trackedKey: 'product:a', comparedKey: 'product:a', onComparedChange: vi.fn() };
    expect(flows.menu(flows.modeShort.off)).toBe(lang === 'fr' ? 'Flux\u00a0: aucun' : 'Flows: none');
    expect(flows.menu(flows.modeShort.sales)).toBe(lang === 'fr' ? 'Flux\u00a0: ventes' : 'Flows: sales');
    for (const mode of ['off', 'production', 'supply', 'sales'] as const) {
      expect(renderToStaticMarkup(createElement(MapFlowMenu, { ...props, mode }))).toContain(escaped(flows.menu(flows.modeShort[mode])));
    }
    // One name for one control: the panel is « Flux », its four buttons « Mode des flux ».
    expect([flows.menuPanel, flows.menuModes]).toEqual(lang === 'fr' ? ['Flux', 'Mode des flux'] : ['Flows', 'Flow mode']);
    const menu = MapFlowMenu(props) as ReactElement<{ children: ReactNode; panelLabel: string }>;
    expect(menu.props.panelLabel).toBe(flows.menuPanel);
    expect(elements(menu.props.children, (e) => e.props.role === 'group').map((e) => e.props['aria-label'])).toEqual([flows.menuModes]);
    const content = (p: MapFlowMenuProps) => (MapFlowMenu(p) as ReactElement<{ children: ReactNode }>).props.children;
    const off = renderToStaticMarkup(createElement(Fragment, null, content(props)));
    expect([...off.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]])).toEqual([
      ['true', escaped(flows.mode.off)], ['false', escaped(flows.mode.production)], ['false', escaped(flows.mode.supply)], ['false', escaped(flows.mode.sales)]]);
    expect(off).not.toContain('type="checkbox"');
    expect(off).not.toContain(escaped(workspace.colorByOther));
    const sales = renderToStaticMarkup(createElement(Fragment, null, content({ ...props, mode: 'sales' })));
    expect(sales).toContain(escaped(flows.figures));
    expect(sales).toContain(escaped(flows.rivals));
    expect(sales).toContain(escaped(workspace.colorByOther));
    expect(sales).toContain(escaped(flows.hint.sales));
    expect(sales).not.toContain('<select');
    // Compare: the second picker and the named split appear inside the menu.
    const compared = renderToStaticMarkup(createElement(Fragment, null, content({ ...props, mode: 'sales', compare: true, comparedKey: 'launch:crypto' })));
    expect(compared).toContain(escaped(workspace.colorBySelect));
    expect(compared).toContain('<option value="launch:crypto" selected="">');
    expect(compared).toContain(escaped(workspace.comparison('Nuit Blanche Max', 'une nouvelle usine de Crypto')));
    const unavailable = renderToStaticMarkup(createElement(Fragment, null, content({ ...props, mode: 'supply', unavailable: true })));
    expect(unavailable).toContain(escaped(workspace.needsProduct));
    // A layer left on that has nothing to draw (new-factory reference) says so on the closed button too.
    expect(flows.menuNoProduct(flows.modeShort.supply)).toBe(lang === 'fr' ? 'Flux\u00a0: approvisionnement (sans produit)' : 'Flows: supply (no product)');
    expect(renderToStaticMarkup(createElement(MapFlowMenu, { ...props, mode: 'supply', unavailable: true }))).toContain(escaped(flows.menuNoProduct(flows.modeShort.supply)));
    expect(renderToStaticMarkup(createElement(MapFlowMenu, { ...props, unavailable: true }))).toContain(escaped(flows.menu(flows.modeShort.off)));
    // Handlers stay those of the map.
    const mode = elements(content(props), (e) => e.type === 'button' && text(e.props.children as ReactNode) === mapFlowText(lang).mode.sales)[0];
    (mode.props.onClick as () => void)();
    expect(props.onModeChange).toHaveBeenCalledWith('sales');
    const toggles = elements(content({ ...props, mode: 'sales' }), (e) => e.type === 'input');
    (toggles[2].props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    expect(props.onCompareChange).toHaveBeenCalledWith(true);
  });

  it('« Couleurs » uses one vocabulary, an inline five-band scale, and says when no free cell beats the current one', () => {
    const view = fixture(lang);
    setState({ ...initial, lang, view, lobby: null });
    const h = messages(lang).hex;
    const product = view.companies.find((c) => c.private)!.products[0];
    const reference: HexReference = { kind: 'product', productId: product.id };
    const props = { view, reference, lens: 'margin' as const, delta: true, onLensChange: vi.fn() };
    const html = renderToStaticMarkup(createElement(HexColorControls, props));
    expect(lang === 'fr' ? ['Marge', 'Fret', 'Demande', 'Aucune'] : ['Margin', 'Freight', 'Demand', 'None']).toEqual(Object.values(h.lens));
    for (const label of Object.values(h.lens)) expect(html).toContain(`>${escaped(label)}</button>`);
    expect(html).toContain(escaped(h.colorsLabel));
    expect(html.replace(/<[^>]*>/g, ' ')).not.toMatch(/lentille|lens\b/i);
    const range = hexMarginQuintiles(view, reference, true);
    const ends = hexLegendEnds(range, 'margin', fmtFor(lang))!;
    const steps = hexLegendSteps(range, 'margin', fmtFor(lang), h.legendBetween);
    expect(steps.length).toBeGreaterThan(1);
    expect(html.match(/class="hx-scale-band"/g)).toHaveLength(steps.length);
    expect(html).toContain(`title="${escaped(h.legendDelta)}"`);
    expect(html).toContain(`aria-label="${escaped(mapWorkspaceMessages(lang).scaleAria(h.legendDelta, ends[0], ends[ends.length - 1]))}"`);
    for (const step of steps) expect(html).toContain(`title="${escaped(step.label)}"`);
    // A product whose cell no free cell beats: the status sits next to the scale.
    const best = { ...view, hexes: { ...view.hexes!, free: [] } };
    expect(renderToStaticMarkup(createElement(HexColorControls, { ...props, view: best }))).toContain(escaped(h.lensNoBetter));
    expect(renderToStaticMarkup(createElement(HexColorControls, { ...props, lens: 'plain' }))).not.toContain('hx-scale');
    const button = elements(HexColorControls(props), (e) => e.type === 'button' && e.props.children === h.lens.transport)[0];
    (button.props.onClick as () => void)();
    expect(props.onLensChange).toHaveBeenCalledWith('transport');
    // Colours following another reference are named on the toolbar itself.
    const comparing = renderToStaticMarkup(createElement(HexColorControls, { ...props, comparedLabel: 'une nouvelle usine de Crypto' }));
    expect(comparing).toContain(escaped(mapWorkspaceMessages(lang).colorsBy('une nouvelle usine de Crypto')));
  });

  it('« Légende » holds what the colours measure, the board symbols and the keyboard hint', () => {
    const view = fixture(lang);
    setState({ ...initial, lang, view, lobby: null });
    const h = messages(lang).hex;
    const props = { view, reference: { kind: 'launch', sectorId: 'crypto' } as HexReference, lens: 'margin' as const, delta: false };
    const closed = renderToStaticMarkup(createElement(HexLegendMenu, props));
    expect(closed).toContain(`${escaped(mapWorkspaceMessages(lang).legend)}<span aria-hidden="true"> ▾</span>`);
    expect(closed).not.toContain(escaped(h.keyboardHint));
    const panel = renderToStaticMarkup(createElement(Fragment, null, (HexLegendMenu(props) as ReactElement<{ children: ReactNode }>).props.children));
    expect(panel).toContain(escaped(h.legendMargin));
    expect(panel).toContain('hx-legend-step');
    for (const mark of [hexReadabilityMessages(lang).selected, hexReadabilityMessages(lang).mine, h.legendTerrain, h.legendPending, h.legendAwarded, h.legendRanks, h.legendDeposits]) {
      expect(panel).toContain(escaped(mark));
    }
    expect(panel).toContain(escaped(h.keyboardHint));
    // The board's frame zooms: the legend says how.
    expect(h.zoomHint).toBe(lang === 'fr'
      ? 'Ctrl (⌘ sur Mac) + molette\u00a0: zoomer. Glisser\u00a0: déplacer le plateau agrandi.'
      : 'Ctrl (⌘ on a Mac) + wheel: zoom. Drag: pan the zoomed board.');
    expect(panel).toContain(escaped(h.zoomHint));
  });

  it('shows one continuous origin and a black hover mark in inspection mode, without the old destination shortcut', () => {
    const view = fixture(lang);
    setState({ ...initial, lang, view, lobby: null });
    const text = hexReadabilityMessages(lang);
    const props = { view, reference: { kind: 'launch', sectorId: 'crypto', originHexId: view.hexes!.free[0] } as HexReference,
      lens: 'margin' as const, delta: false, delivery: true, inspection: true };
    const panel = renderToStaticMarkup(createElement(Fragment, null, (HexLegendMenu(props) as ReactElement<{ children: ReactNode }>).props.children));
    expect(panel).toContain(escaped(text.totalMargin));
    expect(panel).toContain('class="hx-reference-mark"');
    expect(panel).toContain('class="hx-hover-mark"');
    expect(panel).toContain(escaped(text.reference));
    expect(panel).toContain(escaped(text.hoverMark));
    expect(panel).toContain(escaped(text.inspectHint));
    expect(panel).toContain(escaped(text.fullDemandBasis));
    expect(panel).not.toContain('class="hx-selected-mark"');
    expect(panel).not.toContain(escaped(text.selected));
    expect(panel).not.toContain(escaped(text.keyboardReference));
    expect(panel).not.toContain('hx-rank-mark');
  });

  it('« Aller à » lists only non-empty groups and each entry selects its cell', () => {
    const text = mapWorkspaceMessages(lang);
    const onGo = vi.fn();
    const menu = MapGoToMenu({ onGo, groups: [
      { key: 'factories', label: text.goToFactories, entries: [{ key: 'p', label: 'Nuit Blanche Max · Les Hauts (C5)', hexId: 'C5' }] },
      { key: 'bids', label: text.goToBids, entries: [] },
      { key: 'deposits', entries: [{ key: 'deposits', label: text.goToDeposits, hexId: 'B7' }] },
    ] }) as ReactElement<{ children: ReactNode; label: ReactNode }>;
    expect(menu.props.label).toBe(text.goTo);
    const html = renderToStaticMarkup(createElement(Fragment, null, menu.props.children));
    expect(html).toContain(escaped(text.goToFactories));
    expect(html).not.toContain(escaped(text.goToBids));
    expect(html.match(/data-menu-close/g)).toHaveLength(2);
    const entries = elements(menu.props.children, (e) => e.type === 'button');
    expect(entries.map((e) => e.props['data-goto-hex'])).toEqual(['C5', 'B7']);
    (entries[1].props.onClick as () => void)();
    expect(onGo).toHaveBeenCalledWith('B7');
  });
});

describe.each(['fr', 'en'] as const)('hex board left column: the tools in folds and at the foot (%s)', (lang) => {
  beforeEach(() => setState({ ...initial, lang, view: null, lobby: null }));
  const flowProps = (): MapFlowMenuProps => ({ mode: 'off', onModeChange: vi.fn(), figures: true, onFiguresChange: vi.fn(), rivals: true, onRivalsChange: vi.fn(),
    compare: false, onCompareChange: vi.fn(), groups, trackedKey: 'product:a', comparedKey: 'product:a', onComparedChange: vi.fn() });

  it('« Flux » is a fold whose summary names the layer like the menu button, with the modes and options inside', () => {
    const flows = mapFlowText(lang);
    const workspace = mapWorkspaceMessages(lang);
    const props = flowProps();
    const onToggle = vi.fn();
    const off = renderToStaticMarkup(createElement(MapFlowFold, { ...props, open: false, onToggle }));
    // No menu button: a closed fold, its summary « Flux : aucun », then the four modes.
    expect(off).not.toContain('aria-expanded');
    expect(off).not.toContain('▾');
    expect(off).toMatch(new RegExp(`^<details class="hx-side-fold map-flow-fold"><summary>${escaped(flows.menu(flows.modeShort.off))}</summary>`
      + `<div class="hx-side-fold-body map-flow-panel" role="group" aria-label="${flows.menuPanel}">`));
    expect([...off.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]])).toEqual([
      ['true', escaped(flows.mode.off)], ['false', escaped(flows.mode.production)], ['false', escaped(flows.mode.supply)], ['false', escaped(flows.mode.sales)]]);
    expect(off).not.toContain('type="checkbox"');
    // A layer left on is named on the closed fold, and so is a layer with nothing to draw.
    expect(renderToStaticMarkup(createElement(MapFlowFold, { ...props, mode: 'sales', open: false, onToggle })))
      .toContain(`<summary>${escaped(flows.menu(flows.modeShort.sales))}</summary>`);
    expect(renderToStaticMarkup(createElement(MapFlowFold, { ...props, mode: 'supply', unavailable: true, open: false, onToggle })))
      .toContain(`<summary>${escaped(flows.menuNoProduct(flows.modeShort.supply))}</summary>`);
    const sales = renderToStaticMarkup(createElement(MapFlowFold, { ...props, mode: 'sales', compare: true, comparedKey: 'launch:crypto', open: true, onToggle }));
    expect(sales).toMatch(/^<details class="hx-side-fold map-flow-fold" open="">/);
    for (const label of [flows.figures, flows.rivals, workspace.colorByOther, workspace.colorBySelect, flows.hint.sales]) expect(sales).toContain(escaped(label));
    expect(sales).toContain(escaped(workspace.comparison('Nuit Blanche Max', 'une nouvelle usine de Crypto')));
    // The map's own handlers; the fold reports its open state for the column to remember.
    const fold = MapFlowFold({ ...props, open: false, onToggle }) as ReactElement<{ onToggle: (event: unknown) => void; children: ReactNode }>;
    (elements(fold, (e) => e.type === 'button' && text(e.props.children as ReactNode) === flows.mode.production)[0].props.onClick as () => void)();
    expect(props.onModeChange).toHaveBeenCalledWith('production');
    fold.props.onToggle({ currentTarget: { open: true } });
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('« Légende » is a fold closed by default, last of the column, with the symbols and the hints; it can be remembered open', () => {
    const view = fixture(lang);
    setState({ ...initial, lang, view, lobby: null });
    const h = messages(lang).hex;
    const props = { view, reference: { kind: 'launch', sectorId: 'crypto' } as HexReference, lens: 'margin' as const, delta: false };
    const html = renderToStaticMarkup(createElement(HexLegendFold, props));
    expect(html).toMatch(new RegExp(`^<details class="hx-side-section hx-side-fold hx-legend-fold"><summary>${escaped(mapWorkspaceMessages(lang).legend)}</summary>`));
    expect(html).not.toContain('<details open');
    for (const label of [h.legendMargin, hexReadabilityMessages(lang).selected, h.legendTerrain, h.legendDeposits, h.keyboardHint, h.zoomHint]) expect(html).toContain(escaped(label));
    const onToggle = vi.fn();
    expect(renderToStaticMarkup(createElement(HexLegendFold, { ...props, open: true, onToggle }))).toMatch(/^<details class="[^"]+" open="">/);
    (HexLegendFold({ ...props, open: true, onToggle }) as ReactElement<{ onToggle: (event: unknown) => void }>).props.onToggle({ currentTarget: { open: false } });
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('« Couleurs » can leave « Aucune case libre ne bat » to the tracked card, which says it for the same product', () => {
    const view = fixture(lang);
    setState({ ...initial, lang, view, lobby: null });
    const h = messages(lang).hex;
    const product = view.companies.find((c) => c.private)!.products[0];
    const props = { view: { ...view, hexes: { ...view.hexes!, free: [] } }, reference: { kind: 'product', productId: product.id } as HexReference,
      lens: 'margin' as const, delta: true, onLensChange: vi.fn() };
    expect(renderToStaticMarkup(createElement(HexColorControls, props))).toContain(escaped(h.lensNoBetter));
    expect(renderToStaticMarkup(createElement(HexColorControls, { ...props, hideNoBetter: true }))).not.toContain(escaped(h.lensNoBetter));
  });

  it('« Couleurs » keeps its four buttons in place from 300 px: four columns, always on the second row, scale or not', () => {
    const view = fixture(lang);
    setState({ ...initial, lang, view, lobby: null });
    const product = view.companies.find((c) => c.private)!.products[0];
    const props = { view, reference: { kind: 'product', productId: product.id } as HexReference, delta: true, onLensChange: vi.fn() };
    // The label first, then the four buttons; the scale only with a lens on (« Aucune » removes it).
    const margin = renderToStaticMarkup(createElement(HexColorControls, { ...props, lens: 'margin' as const }));
    const plain = renderToStaticMarkup(createElement(HexColorControls, { ...props, lens: 'plain' as const }));
    expect(margin).toContain('class="hx-scale"');
    expect(plain).not.toContain('class="hx-scale"');
    expect(plain.match(/class="hx-lens"/g)).toHaveLength(4);
    // Without a fixed row the buttons would move up beside the label once the scale goes, and a fifth track would
    // open from 336 px: the column query pins four tracks and the second row.
    const css = readFileSync(join(__dirname, '../src/screens/game/city/mapToolbar.css'), 'utf8');
    const query = css.slice(css.indexOf('@container side (min-width: 300px) {'));
    const block = query.slice(0, query.indexOf('\n}') + 2);
    expect(block).toContain('  .hx-side .hx-toolbar-colors { grid-template-columns: repeat(4, minmax(0, 1fr)); }');
    expect(block).toContain('  .hx-side .hx-toolbar-colors .hx-lens { grid-row: 2; }');
    expect(block).toContain('  .hx-side .hx-toolbar-colors > span:first-child { grid-row: 1; grid-column: 1 / 2;');
    expect(block).toContain('  .hx-side .hx-toolbar-colors .hx-scale { grid-row: 1; grid-column: 2 / -1;');
    // Narrower than 300 px, as many 64 px tracks as fit (four from 268 px).
    expect(css).toContain('.hx-side .hx-toolbar-colors { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); gap: 4px; }');
  });
});

describe.each(['fr', 'en'] as const)('isometric legend matches the visible island (%s)', lang => {
  function renderLegend(surface: 'menu' | 'fold', view: PlayerView, inspection = true, delivery = true) {
    setState({ ...initial, lang, view, lobby: null });
    const props = { view, reference: { kind: 'launch', sectorId: 'crypto', originHexId: view.hexes!.free[0] } as HexReference,
      lens: 'margin' as const, delta: false, delivery, inspection };
    return surface === 'fold'
      ? renderToStaticMarkup(createElement(HexLegendFold, { ...props, open: true }))
      : renderToStaticMarkup(createElement(Fragment, null, (HexLegendMenu(props) as ReactElement<{ children: ReactNode }>).props.children));
  }

  it.each(['menu', 'fold'] as const)('%s describes 3D ownership and keyboard controls without inherited 2D marks', surface => {
    const { view } = islandFixture(lang);
    expect(view.config).toMatchObject({ mapMode: 'square', industryRules: 'network' });
    const island = isometricMessages(lang), h = messages(lang).hex, markers = hexReadabilityMessages(lang);
    for (const inspection of [false, true]) {
      const html = renderLegend(surface, view, inspection, inspection);
      for (const label of [island.selected, island.inspect, island.place, island.reference, island.ownership, island.keyboard, island.controls]) {
        expect(html).toContain(escaped(label));
      }
      for (const label of [h.legendTerrain, h.legendPending, h.legendAwarded, h.legendRanks, markers.keyboardReference, h.keyboardHint, h.zoomHint]) {
        expect(html).not.toContain(escaped(label));
      }
      expect(html).not.toMatch(/hx-pending-mark|hx-rank-mark|☆|⚒/);
      // The layer still explains its real economic basis and retains the colour bands.
      expect(html).toContain(escaped(inspection ? markers.totalMargin : h.legendMargin));
      if (inspection) expect(html).toContain(escaped(markers.fullDemandBasis));
      expect(html).toContain('hx-legend-step');
    }
  });

  it.each(['menu', 'fold'] as const)('%s names the colour of a vacant-land owner with no factory or subsidiary', surface => {
    const { view, ownerId, parcelId } = islandFixture(lang);
    const owner = view.companies.find(company => company.id === ownerId)!;
    expect(owner.status).toBe('active');
    expect(owner.products).toEqual([]);
    expect(owner.sites ?? []).toEqual([]);
    expect(owner.land).toContainEqual(expect.objectContaining({ hexId: parcelId, vacant: true }));
    // Network occupancy includes owned vacant land: absence of buildings must not erase its colour key.
    expect(view.hexes!.occupied[parcelId]).toBe(ownerId);
    expect(view.siteSlots.some(slot => slot.companyId === ownerId)).toBe(false);
    const html = renderLegend(surface, view);
    const territoryList = html.match(new RegExp(`aria-label="${escaped(hexReadabilityMessages(lang).territories)}"[^>]*>([\\s\\S]*?)</div>`));
    expect(territoryList).not.toBeNull();
    expect(territoryList![1]).toContain(escaped(owner.name));
    expect(territoryList![1]).toContain(`background-color:${owner.color}`);
  });
});
