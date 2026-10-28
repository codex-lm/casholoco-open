import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardCells, createGame, getPlayerView, type Lang, type PlayerView } from '@muchomoney/core';
import { ConfirmModal } from '../src/components/Modal';
import { messages } from '../src/i18n';
import { hexReadabilityMessages } from '../src/i18n/hexReadability';
import { industryMessages } from '../src/i18n/industry';
import { IndustryPanel } from '../src/screens/game/IndustryPanel';
import { HexLaunchForm } from '../src/screens/game/LaunchForms';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { HexMapView } from '../src/screens/game/city/HexMapView';
import { MapActivityPalette } from '../src/screens/game/city/MapActivityPalette';
import { MapWorkspace } from '../src/screens/game/city/MapWorkspace';
import { getState, setState, type AppState } from '../src/store';

interface Slots {
  cursor: number; values: unknown[]; dirty: boolean;
  effects: Map<number, { deps?: readonly unknown[]; cleanup?: () => void }>;
  pending: Map<number, { deps?: readonly unknown[]; run: () => void | (() => void) }>;
}
const hooks = vi.hoisted(() => ({ active: null as Slots | null }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useState: (initial: unknown) => {
      const slots = hooks.active!, i = slots.cursor++;
      if (!(i in slots.values)) slots.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [slots.values[i], (next: unknown) => {
        const value = typeof next === 'function' ? (next as (previous: unknown) => unknown)(slots.values[i]) : next;
        if (!Object.is(value, slots.values[i])) { slots.values[i] = value; slots.dirty = true; }
      }];
    },
    useRef: (initial: unknown) => {
      const slots = hooks.active!, i = slots.cursor++;
      if (!(i in slots.values)) slots.values[i] = { current: initial };
      return slots.values[i];
    },
    useEffect: (run: () => void | (() => void), deps?: readonly unknown[]) => {
      const slots = hooks.active!, i = slots.cursor++, previous = slots.effects.get(i);
      if (!previous || !deps || !previous.deps || deps.some((value, j) => !Object.is(value, previous.deps![j]))) slots.pending.set(i, { run, deps });
    },
    useMemo: (make: () => unknown) => make(),
  };
});
const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
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
vi.mock('../src/hooks/useGame', () => ({ useGame: () => ({ view: data.view!, sectorsById: new Map(data.view!.sectors.map(s => [s.id, s])) }) }));
vi.mock('../src/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(select: (state: AppState) => T) => select(actual.getState()) };
});

const initialState = getState();
const mountedSlots: Slots[] = [];
function newSlots(): Slots {
  const slots: Slots = { cursor: 0, values: [], dirty: false, effects: new Map(), pending: new Map() };
  mountedSlots.push(slots);
  return slots;
}
function render<T>(slots: Slots, make: () => T): T {
  hooks.active = slots; slots.cursor = 0; slots.dirty = false;
  const result = make(); hooks.active = null;
  return result;
}
function flush(slots: Slots) {
  for (const [i, next] of slots.pending) {
    slots.effects.get(i)?.cleanup?.();
    const cleanup = next.run();
    slots.effects.set(i, { deps: next.deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined });
  }
  slots.pending.clear();
}
beforeEach(() => {
  transport.emit.mockReset();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => {
  for (const slots of mountedSlots.splice(0)) for (const effect of slots.effects.values()) effect.cleanup?.();
  hooks.active = null; data.view = null; setState(initialState); vi.unstubAllGlobals();
});

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...['children', 'boardHeader', 'actions', 'sheet'].flatMap(key => elements(node.props[key] as ReactNode))];
}
function child(node: ReactNode, type: unknown) { return elements(node).find(element => element.type === type); }
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : '';
}
function fixture(lang: Lang, network = true) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang,
    mapMode: network ? 'square' : 'hex', terrainAssignment: 'fair', ...(network ? { industryRules: 'network' as const } : {}) }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  const company = Object.values(game.companies).find(c => c.controllerId === 'human')!;
  company.cash = 100_000;
  return { game, company, view: getPlayerView(game, 'human') };
}

/** Real map/form handlers and dependency-aware effects; the small DOM shell binds their actual refs
 * and models focus lost when a form unmounts. Browser QA owns native layout and portal bubbling. */
function mount(view: PlayerView, lang: Lang, options: Partial<ComponentProps<typeof HexMapView>> = {}) {
  data.view = view; setState({ view, lang, lobby: null });
  const slots = newSlots();
  let panelSlots = newSlots(), panelKey: string | null = null;
  let map: ReactNode;
  const body = {}, field = {}, closeButton = {}, outside = {};
  const doc = { body, activeElement: body, querySelector: (selector: string): unknown => {
    if (selector === '[data-hx-map-form]') return wrapper() ? form : null;
    if (selector === '.hx-activity-actions button') return buttons.get(text(actionButtons()[0]));
    return null;
  } };
  const focusable = () => {
    const node = { disabled: false, isConnected: true, visible: true,
      getClientRects: () => node.visible ? [{}] : [],
      focus: vi.fn((_options?: FocusOptions) => { doc.activeElement = node; }) };
    return node;
  };
  const form = { ...focusable(), contains: (node: unknown) => [field, closeButton, form].includes(node as object), scrollIntoView: vi.fn() };
  form.focus.mockImplementation(() => { doc.activeElement = form; });
  const group = focusable();
  const buttons = new Map<string, ReturnType<typeof focusable>>();
  let oldRefs: unknown[] = [];
  const attach = (ref: unknown, node: unknown) => {
    if (typeof ref === 'function') ref(node);
    else if (ref && typeof ref === 'object') (ref as { current: unknown }).current = node;
  };
  vi.stubGlobal('document', doc);
  const wrapper = () => elements(map).find(element => element.props['data-hx-map-form'] !== undefined);
  const actions = () => child(map, MapActivityPalette)!.props.actions as Element;
  const actionButtons = () => elements(actions()).filter(element => element.type === 'div' && element.props.className === 'hx-action-buttons')
    .flatMap(element => elements(element.props.children as ReactNode)).filter(element => element.type === 'button');
  const draw = () => {
    for (let passes = 0; passes < 6; passes++) {
      map = render(slots, () => HexMapView({ company: data.view!.companies.find(c => c.private)!, onSelect: vi.fn(), goTo: vi.fn(), ...options }));
      oldRefs.forEach(ref => attach(ref, null)); oldRefs = [];
      buttons.forEach(button => { button.isConnected = false; });
      for (const element of actionButtons()) {
        const label = text(element);
        const button = buttons.get(label) ?? focusable(); buttons.set(label, button);
        button.disabled = Boolean(element.props.disabled); button.isConnected = true;
        if (element.props.ref) { attach(element.props.ref, button); oldRefs.push(element.props.ref); }
      }
      if (actions().props.ref) { attach(actions().props.ref, group); oldRefs.push(actions().props.ref); }
      if (!wrapper() && form.contains(doc.activeElement)) doc.activeElement = body;
      flush(slots);
      if (!slots.dirty) return map;
    }
    throw new Error('map did not settle');
  };
  const panel = () => {
    const element = child(map, IndustryPanel)!;
    if (element.key !== panelKey) { panelSlots = newSlots(); panelKey = element.key; }
    const result = render(panelSlots, () => IndustryPanel(element.props as ComponentProps<typeof IndustryPanel>));
    flush(panelSlots); return result;
  };
  const clickAction = (label: string) => {
    const element = actionButtons().find(button => text(button) === label)!;
    expect(element, label).toBeDefined(); expect(element.props.disabled).not.toBe(true);
    doc.activeElement = buttons.get(label)!;
    (element.props.onClick as () => void)(); draw();
  };
  const close = () => {
    doc.activeElement = closeButton;
    const element = elements(wrapper()).find(button => button.type === 'button' && text(button) === messages(lang).common.close)!;
    (element.props.onClick as () => void)(); draw();
  };
  const key = (patch: Record<string, unknown> = {}) => {
    const event = { key: 'Escape', defaultPrevented: false, nativeEvent: { isComposing: false }, keyCode: 27,
      currentTarget: form, target: field, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...patch };
    (wrapper()?.props.onKeyDown as ((event: unknown) => void) | undefined)?.(event);
    draw(); return event;
  };
  draw();
  return { doc, body, field, outside, form, group, buttons, draw, wrapper, panel, close, key, clickAction,
    tree: () => map,
    drop: (activity: string, cell: string) => { (child(map, MapActivityPalette)!.props.onPlace as (hexId: string, key: string) => void)(cell, activity); draw(); },
    select: (cell: string) => {
      const board = elements(map).find(element => element.props.selectedId !== undefined && element.props.onSelect)!;
      (board.props.onSelect as (hexId: string) => void)(cell); draw();
    },
  };
}

describe.each(['fr', 'en'] as const)('map action dismissal (%s)', lang => {
  it.each(['escape', 'close'] as const)('returns %s from a new factory to Build factory and preserves the dropped profile and parcel', method => {
    const { view } = fixture(lang), snapshot = JSON.stringify(view);
    const ui = mount(view, lang), cell = view.hexes!.free[0];
    ui.drop('launch:scooters', cell);
    const panel = ui.panel();
    const name = elements(panel).find(element => element.type === 'input')!;
    expect(name).toBeDefined();
    (name.props.onChange as (event: unknown) => void)({ target: { value: 'Fresh Scooters' } });
    ui.doc.activeElement = ui.field;
    if (method === 'escape') ui.key(); else ui.close();
    expect(ui.wrapper()).toBeUndefined();
    const build = ui.buttons.get(hexReadabilityMessages(lang).buildFactory)!;
    expect(ui.doc.activeElement).toBe(build);
    expect(build.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(ui.buttons.get(hexReadabilityMessages(lang).buyLand)!.focus).not.toHaveBeenCalled();
    expect(child(ui.tree(), MapWorkspace)!.props.selectedKey).toBe(cell);
    expect(child(ui.tree(), MapActivityPalette)!.props.reference).toMatchObject({ kind: 'launch', sectorId: 'scooters', originHexId: cell });
    expect(JSON.stringify(view)).toBe(snapshot);
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it.each([
    ['handled', { defaultPrevented: true }], ['composition', { nativeEvent: { isComposing: true } }],
    ['legacy composition', { keyCode: 229 }], ['other key', { key: 'Enter' }], ['portal', { target: {} }],
  ])('leaves the form and draft intact for %s keyboard events', (_name, patch) => {
    const { view } = fixture(lang), ui = mount(view, lang);
    ui.drop('launch:scooters', view.hexes!.free[0]);
    const input = elements(ui.panel()).find(element => element.type === 'input')!;
    (input.props.onChange as (event: unknown) => void)({ target: { value: 'Kept draft' } });
    ui.doc.activeElement = ui.field;
    const event = ui.key(patch as Record<string, unknown>);
    expect(ui.wrapper()).toBeDefined();
    expect(elements(ui.panel()).find(element => element.type === 'input')!.props.value).toBe('Kept draft');
    expect(ui.doc.activeElement).toBe(ui.field);
    expect(event.preventDefault).not.toHaveBeenCalled(); expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('consumes local Escape while preserving the current selection and the workspace instance', () => {
    const { view } = fixture(lang), ui = mount(view, lang);
    ui.drop('launch:scooters', view.hexes!.free[0]);
    const workspace = child(ui.tree(), MapWorkspace)!;
    ui.doc.activeElement = ui.field;
    const event = ui.key();
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(child(ui.tree(), MapWorkspace)!.key).toBe(workspace.key);
    expect(child(ui.tree(), MapWorkspace)!.props.selectionToken).toBe(workspace.props.selectionToken);
  });

  it.each(['land', 'supply', 'sell'] as const)('returns to the corresponding %s action', mode => {
    const { view } = fixture(lang), cell = view.hexes!.free[0];
    if (mode === 'sell') view.companies.find(c => c.private)!.land = [{ hexId: cell, cost: 100, upkeep: 5, vacant: true }];
    const ui = mount(view, lang), labels = hexReadabilityMessages(lang);
    const label = mode === 'land' ? labels.buyLand : mode === 'supply' ? labels.buildSubsidiary : industryMessages(lang).sell;
    if (mode === 'supply') {
      const cell = boardCells(view.config).find(cell => view.siteSlots.some(slot => slot.id === cell.deposit && !slot.companyId))!;
      const slot = view.siteSlots.find(slot => slot.id === cell.deposit)!;
      ui.drop(`supply:new:${slot.commodityId}`, cell.id);
    } else { ui.select(cell); ui.clickAction(label); }
    ui.close();
    expect(ui.wrapper()).toBeUndefined(); expect(ui.doc.activeElement).toBe(ui.buttons.get(label));
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('preserves the move mode after Escape and leaves its explicit Cancel as the way out', () => {
    const { view } = fixture(lang, false), company = view.companies.find(c => c.private)!, product = company.products[0];
    const ui = mount(view, lang, { intent: { kind: 'move', productId: product.id } });
    expect(child(ui.tree(), HexMoveForm)).toBeDefined();
    ui.doc.activeElement = ui.field; ui.key();
    expect(Boolean(child(ui.tree(), HexMoveForm))).toBe(false);
    expect(ui.doc.activeElement).toBe(ui.buttons.get(messages(lang).hex.moveHere(product.name)));
    const destination = view.hexes!.free.find(cell => cell !== child(ui.tree(), MapWorkspace)!.props.selectedKey)!;
    ui.select(destination);
    expect(child(ui.tree(), HexMoveForm)!.props.hexId).toBe(destination);
    const header = child(ui.tree(), MapWorkspace)!.props.boardHeader as ReactNode;
    const hint = elements(header).find(element => element.props.className === 'hx-sheet-note row between')!;
    (elements(hint).find(element => element.type === 'button')!.props.onClick as () => void)(); ui.draw();
    ui.select(view.hexes!.free.find(cell => cell !== destination)!);
    expect(child(ui.tree(), HexMoveForm)).toBeUndefined(); expect(transport.emit).not.toHaveBeenCalled();
  });

  it('returns a legacy launch intent to Build factory without replacing its selected parcel', () => {
    const { view } = fixture(lang, false), company = view.companies.find(c => c.private)!;
    const ui = mount(view, lang, { intent: { kind: 'launch', companyId: company.id, sectorId: 'crypto' } });
    const cell = child(ui.tree(), HexLaunchForm)!.props.hexId;
    ui.doc.activeElement = ui.field; ui.key();
    expect(Boolean(child(ui.tree(), HexLaunchForm))).toBe(false);
    expect(ui.doc.activeElement).toBe(ui.buttons.get(hexReadabilityMessages(lang).buildFactory));
    expect(child(ui.tree(), MapWorkspace)!.props.selectedKey).toBe(cell);
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('leaves the sale form mounted while its portalled confirmation handles Escape', () => {
    const { view } = fixture(lang), cell = view.hexes!.free[0];
    view.companies.find(c => c.private)!.land = [{ hexId: cell, cost: 100, upkeep: 5, vacant: true }];
    const ui = mount(view, lang); ui.select(cell); ui.clickAction(industryMessages(lang).sell);
    const sell = elements(ui.panel()).find(element => element.type === 'button' && text(element).startsWith(industryMessages(lang).sell))!;
    (sell.props.onClick as () => void)();
    const modal = child(ui.panel(), ConfirmModal)!;
    expect(modal).toBeDefined();
    ui.doc.activeElement = ui.outside;
    const event = ui.key({ target: ui.outside });
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(ui.wrapper()).toBeDefined(); expect(child(ui.panel(), ConfirmModal)).toBeDefined();
    (modal.props.onClose as () => void)();
    expect(child(ui.panel(), ConfirmModal)).toBeUndefined(); expect(ui.wrapper()).toBeDefined();
    expect(ui.doc.activeElement).toBe(ui.outside); expect(transport.emit).not.toHaveBeenCalled();
  });

  it('keeps an external focus and does not refocus the previous parcel after a new selection', () => {
    const { view } = fixture(lang), ui = mount(view, lang);
    ui.drop('launch:scooters', view.hexes!.free[0]);
    ui.doc.activeElement = ui.outside;
    (child(ui.tree(), IndustryPanel)!.props.onDone as () => void)(); ui.draw();
    expect(ui.doc.activeElement).toBe(ui.outside);
    ui.drop('launch:scooters', view.hexes!.free[0]); ui.doc.activeElement = ui.field;
    ui.select(view.hexes!.free[1]);
    expect(ui.doc.activeElement).toBe(ui.body);
    expect(ui.buttons.get(hexReadabilityMessages(lang).buildFactory)!.focus).not.toHaveBeenCalled();
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('falls back to the named action group when the closing factory action becomes disabled', () => {
    const { view } = fixture(lang), ui = mount(view, lang);
    ui.drop('launch:scooters', view.hexes!.free[0]); ui.doc.activeElement = ui.field;
    const next = structuredClone(view); next.turn = next.config.totalTurns;
    data.view = next; setState({ view: next }); ui.draw();
    expect(ui.wrapper()).toBeUndefined();
    expect(ui.buttons.get(hexReadabilityMessages(lang).buildFactory)!.disabled).toBe(true);
    expect(ui.doc.activeElement).toBe(ui.group);
    expect(ui.group.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect((child(ui.tree(), MapActivityPalette)!.props.actions as Element).props).toMatchObject({ role: 'group', tabIndex: -1 });
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('falls back to the action group if the original move control has disappeared', () => {
    const { view } = fixture(lang, false), product = view.companies.find(c => c.private)!.products[0];
    const ui = mount(view, lang, { intent: { kind: 'move', productId: product.id } });
    const moveButton = ui.buttons.get(messages(lang).hex.moveHere(product.name))!;
    expect(moveButton.isConnected).toBe(true);
    const next = structuredClone(view); next.turn = next.config.totalTurns;
    data.view = next; setState({ view: next });
    ui.doc.activeElement = ui.field; ui.key();
    expect(moveButton.isConnected).toBe(false);
    expect(ui.wrapper()).toBeUndefined(); expect(ui.doc.activeElement).toBe(ui.group);
    expect(moveButton.focus).not.toHaveBeenCalled(); expect(transport.emit).not.toHaveBeenCalled();
  });
});
