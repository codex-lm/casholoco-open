import { isValidElement, type ReactElement, type ReactNode, type KeyboardEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView } from '@muchomoney/core';
import { IsometricBoard, type IsometricBoardProps } from '../src/screens/game/city/isometric/IsometricBoard';
import { getState, setState, type AppState } from '../src/store';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }));
const runtime = vi.hoisted(() => ({ inspect: null as null | ((id: string | null) => void),
  clearInspection: vi.fn(), panTo: vi.fn() }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = { current: initial };
      return hooks.values[index];
    },
    useEffect: (effect: () => void) => { hooks.effects.push(effect); },
    useMemo: (factory: () => unknown) => factory(), useId: () => 'island-input',
  };
});
vi.mock('../src/store', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
vi.mock('../src/screens/game/city/isometric/islandScene', () => ({ IslandScene: class {
  constructor(_canvas: unknown, _label: unknown, callbacks: { inspect: (id: string | null) => void }) {
    runtime.inspect = callbacks.inspect;
  }
  clearInspection() { runtime.clearInspection(); runtime.inspect?.(null); }
  panTo(id: string) { runtime.panTo(id); }
  update() {} dispose() {}
} }));

type Element = ReactElement<Record<string, unknown>>;
function find(node: ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  return predicate(node) ? node : find(node.props.children as ReactNode, predicate);
}
const initial = getState();
const state = createGame({ seed: 44, totalTurns: 8, turnSeconds: 0, startYear: 2027, mapMode: 'square' }, [
  { id: 'me', name: 'Ada', isBot: false, companyName: 'Manufacture', sectorId: 'yogurts', connected: true, color: '#b07b51' },
]);
const view = getPlayerView(state, 'me');
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  setState({ view, lang: 'fr', lobby: null });
});
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  setState(initial); hooks.values = []; hooks.cursor = 0; hooks.effects = [];
  runtime.inspect = null; vi.clearAllMocks(); vi.unstubAllGlobals();
});
function mount(options: Partial<IsometricBoardProps> = {}) {
  const onSelect = vi.fn(), onInspect = vi.fn();
  const props: IsometricBoardProps = { view, selectedId: 'S-E13', onSelect, onInspect, ...options };
  const render = () => { hooks.cursor = 0; hooks.effects = []; return IsometricBoard(props); };
  let tree = render();
  const canvas = find(tree, element => element.type === 'canvas')!;
  const label = find(tree, element => element.props.className === 'iso-world-label')!;
  for (const element of [tree, canvas, label]) {
    (element.props.ref as { current: unknown }).current = new EventTarget();
  }
  for (const effect of hooks.effects) {
    const cleanup = effect() as unknown;
    if (typeof cleanup === 'function') cleanups.push(cleanup as () => void);
  }
  return { onSelect, onInspect, render,
    key: (key: string) => {
      const preventDefault = vi.fn();
      (canvas.props.onKeyDown as (event: KeyboardEvent<HTMLCanvasElement>) => void)({ key, preventDefault } as unknown as KeyboardEvent<HTMLCanvasElement>);
      return preventDefault;
    },
  };
}

describe('island canvas keyboard input', () => {
  it('Escape clears the renderer inspection and the matching text without changing selection', () => {
    const board = mount();
    runtime.inspect?.('S-E12');
    expect(find(board.render(), element => element.props.className === 'iso-map-hint')?.props.children).toBe('Parcelle E12');
    const prevented = board.key('Escape');
    expect(runtime.clearInspection).toHaveBeenCalledOnce();
    expect(board.onInspect).toHaveBeenLastCalledWith(null);
    expect(find(board.render(), element => element.props.className === 'iso-map-hint')?.props.children).not.toBe('Parcelle E12');
    expect(board.onSelect).not.toHaveBeenCalled();
    expect(prevented).toHaveBeenCalledOnce();
  });

  it.each(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])('keeps %s from scrolling the document when there is no allowed parcel', key => {
    const board = mount({ view: { ...view, hexes: { ...view.hexes!, free: [] } }, selectableOnlyFree: true });
    expect(board.key(key)).toHaveBeenCalledOnce();
    expect(board.onSelect).not.toHaveBeenCalled();
    expect(runtime.panTo).not.toHaveBeenCalled();
  });

  it('still selects and pans to a valid adjacent parcel', () => {
    const board = mount();
    expect(board.key('ArrowRight')).toHaveBeenCalledOnce();
    expect(board.onSelect).toHaveBeenCalledWith('S-F13');
    expect(runtime.panTo).toHaveBeenCalledWith('S-F13');
  });

  it('leaves Tab to the browser so the canvas can be exited', () => {
    const board = mount();
    expect(board.key('Tab')).not.toHaveBeenCalled();
    expect(board.onSelect).not.toHaveBeenCalled();
  });
});
