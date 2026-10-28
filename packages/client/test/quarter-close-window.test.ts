/** Lifecycle harness: real views and click handlers, dependency-aware React effects, no DOM dependency. */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, resolveTurn, type Lang, type PlayerView } from '@muchomoney/core';
import { TutorialChecklist } from '../src/screens/game/TutorialChecklist';
import {
  RECAP_AUTO_DISABLED_KEY, RECAP_SEEN_PREFIX, claimQuarterClose, loadQuarterCloseAutoDisabled,
  quarterCloseAvailable, saveQuarterCloseAutoDisabled, useQuarterCloseWindow,
} from '../src/screens/game/quarterCloseWindow';
import { getState, setState, type AppState } from '../src/store';
import { EMPTY_TUTORIAL } from '../src/tutorial';

interface EffectSlot { deps?: readonly unknown[]; cleanup?: () => void }
interface HookContext {
  cursor: number;
  values: unknown[];
  effects: Map<number, EffectSlot>;
  scheduled: Map<number, { effect: () => void | (() => void); deps?: readonly unknown[] }>;
}
const hooks = vi.hoisted(() => ({
  current: { cursor: 0, values: [], effects: new Map(), scheduled: new Map() } as HookContext,
  contexts: new Map<string, HookContext>(),
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const context = hooks.current;
      const i = context.cursor++;
      if (!(i in context.values)) context.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [context.values[i], (next: unknown) => {
        context.values[i] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(context.values[i]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const context = hooks.current;
      const i = context.cursor++;
      if (!(i in context.values)) context.values[i] = { current: initial };
      return context.values[i];
    },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const context = hooks.current;
      const i = context.cursor++;
      const previous = context.effects.get(i);
      if (!previous || !deps || !previous.deps || deps.length !== previous.deps.length
        || deps.some((value, j) => !Object.is(value, previous.deps![j]))) context.scheduled.set(i, { effect, deps });
    },
    useMemo: (factory: () => unknown) => factory(),
  };
});
const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
vi.mock('../src/hooks/useGame', () => ({ useGame: () => ({ view: data.view! }) }));
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
let sequence = 0;
let storage = new Map<string, string>();
beforeEach(() => {
  hooks.contexts.clear();
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  });
  saveQuarterCloseAutoDisabled(false);
});
afterEach(() => {
  saveQuarterCloseAutoDisabled(false);
  setState(initial);
  vi.unstubAllGlobals();
});

function context(name: string): HookContext {
  let current = hooks.contexts.get(name);
  if (!current) {
    current = { cursor: 0, values: [], effects: new Map(), scheduled: new Map() };
    hooks.contexts.set(name, current);
  }
  return current;
}
function render<T>(name: string, make: () => T): T {
  hooks.current = context(name);
  hooks.current.cursor = 0;
  return make();
}
function flush(name: string): void {
  const current = context(name);
  const scheduled = [...current.scheduled];
  current.scheduled.clear();
  for (const [i, next] of scheduled) {
    current.effects.get(i)?.cleanup?.();
    const cleanup = next.effect();
    current.effects.set(i, { deps: next.deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined });
  }
}
function fixture(lang: Lang, turn = 2) {
  const room = `WINDOW-${++sequence}`;
  const game = createGame({ seed: 19, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang, mapMode: 'hex', terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: '#654321' },
  ]);
  while (game.turn < turn) resolveTurn(game);
  const view = getPlayerView(game, 'human');
  data.view = view;
  setState({ ...initial, lang, view, tutorial: EMPTY_TUTORIAL, session: { roomCode: room, playerId: 'human', token: 'test' } });
  return { room, game, view };
}
function windowFor(view: PlayerView, room: string, name = 'window') {
  render(name, () => useQuarterCloseWindow(view, room));
  flush(name);
  return render(name, () => useQuarterCloseWindow(view, room));
}
function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children as ReactNode, predicate)];
}

describe.each(['fr', 'en'] as const)('quarter-close window (%s)', (lang) => {
  it('does not open at T1, including malformed saves with a current-quarter recap', () => {
    const { view, room } = fixture(lang, 1);
    expect(windowFor(view, room).available).toBe(false);
    view.self!.closeRecap = { turn: 1, netWorth: 100, facts: [] };
    const state = windowFor(view, room);
    expect(state.isOpen).toBe(false);
    state.open();
    expect(windowFor(view, room).isOpen).toBe(false);
    expect(storage.has(`${RECAP_SEEN_PREFIX}${room}.1`)).toBe(false);
  });

  it('opens the new quarter once, remains closed on updates/remounts, and opens the following close', () => {
    const { view, room, game } = fixture(lang);
    let state = windowFor(view, room);
    expect(state.isOpen).toBe(true);
    expect(storage.get(`${RECAP_SEEN_PREFIX}${room}.1`)).toBe('1');
    expect(getState().tutorial.seen.recap).toBe(true);
    state.close();
    expect(windowFor({ ...view }, room).isOpen).toBe(false);
    expect(windowFor(view, room, 'remounted').isOpen).toBe(false);
    resolveTurn(game);
    state = windowFor(getPlayerView(game, 'human'), room);
    expect(state.isOpen).toBe(true);
    expect(storage.get(`${RECAP_SEEN_PREFIX}${room}.2`)).toBe('1');
  });

  it('honours a receipt from a previous browser visit and separates rooms with the same quarter', () => {
    const { view, room } = fixture(lang);
    storage.set(`${RECAP_SEEN_PREFIX}${room}.1`, '1');
    expect(windowFor(view, room).isOpen).toBe(false);
    expect(windowFor(view, `${room}-other`, 'other').isOpen).toBe(true);
  });

  it('allows manual reopening after dismissal, immediately ticking the recap step', () => {
    const { view, room } = fixture(lang);
    storage.set(`${RECAP_SEEN_PREFIX}${room}.1`, '1');
    let state = windowFor(view, room);
    expect(getState().tutorial.seen.recap).not.toBe(true);
    state.open();
    state = windowFor(view, room);
    expect(state.isOpen).toBe(true);
    expect(getState().tutorial.seen.recap).toBe(true);
    state.close();
    expect(windowFor(view, room).isOpen).toBe(false);
  });

  it('remembers the browser checkbox, allows reopening, and resumes automatic opening only at the next close', () => {
    const { view, room, game } = fixture(lang);
    let state = windowFor(view, room);
    state.setDisableAutoOpen(true);
    state.close();
    state = windowFor(view, room);
    expect(state.disableAutoOpen).toBe(true);
    expect(storage.get(RECAP_AUTO_DISABLED_KEY)).toBe('1');
    resolveTurn(game);
    const next = getPlayerView(game, 'human');
    expect(windowFor(next, room).isOpen).toBe(false);
    const remount = windowFor(next, room, 'remounted');
    expect(remount.disableAutoOpen).toBe(true);
    remount.open();
    expect(windowFor(next, room, 'remounted').isOpen).toBe(true);
    state = windowFor(next, room);
    state.setDisableAutoOpen(false);
    expect(windowFor(next, room).isOpen).toBe(false);
    resolveTurn(game);
    expect(windowFor(getPlayerView(game, 'human'), room).isOpen).toBe(true);
  });

  it('the checklist opens the same modal without scrolling or stealing Modal focus', () => {
    const { view, room } = fixture(lang);
    saveQuarterCloseAutoDisabled(true);
    const state = windowFor(view, room);
    const tree = render('checklist', () => TutorialChecklist({ goTo: vi.fn(), tab: 'journal', openQuarterClose: state.open }));
    const [recap] = elements(tree, (element) => element.props['data-tutorial-step'] === 'recap');
    const [button] = elements(recap, (element) => element.type === 'button');
    const query = vi.fn(() => { throw new Error('Checklist must use the callback'); });
    vi.stubGlobal('document', { querySelector: query });
    (button.props.onClick as () => void)();
    expect(query).not.toHaveBeenCalled();
    expect(windowFor(view, room).isOpen).toBe(true);
    expect(getState().tutorial.seen.recap).toBe(true);
  });

  it('supports historical saves, while withholding all access for spectators and pending claims', () => {
    const { view, room } = fixture(lang);
    delete view.self!.closeRecap;
    expect(quarterCloseAvailable(view)).toBe(true);
    let state = windowFor(view, room);
    expect(state.isOpen).toBe(true);
    const spectator = { ...view, you: 'spectator', self: undefined };
    state = windowFor(spectator, room);
    expect(state.available).toBe(false);
    expect(state.isOpen).toBe(false);
    state.open();
    expect(windowFor(spectator, room).isOpen).toBe(false);
    // Returning from a non-personal view never revives a dismissed report by stale React state.
    expect(windowFor(view, room).isOpen).toBe(false);
    expect(windowFor({ ...view, self: undefined }, room).available).toBe(false);
  });
});

describe('blocked browser storage', () => {
  it.each(['read', 'write', 'both'] as const)('falls back in memory when %s throws, including screen remounts', (failure) => {
    const { view, room, game } = fixture('fr');
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => { if (failure !== 'write') throw new Error('blocked'); return storage.get(key) ?? null; },
      setItem: (key: string, value: string) => { if (failure !== 'read') throw new Error('blocked'); storage.set(key, value); },
    });
    let state = windowFor(view, room);
    expect(state.isOpen).toBe(true);
    state.close();
    expect(windowFor(view, room, 'remounted').isOpen).toBe(false);
    state.setDisableAutoOpen(true);
    expect(loadQuarterCloseAutoDisabled()).toBe(true);
    resolveTurn(game);
    state = windowFor(getPlayerView(game, 'human'), room, 'again');
    expect(state.disableAutoOpen).toBe(true);
    expect(state.isOpen).toBe(false);
    state.open();
    expect(windowFor(getPlayerView(game, 'human'), room, 'again').isOpen).toBe(true);
  });

  it('handles absent localStorage and encoded room names without reopening the same close', () => {
    vi.stubGlobal('localStorage', undefined);
    const room = `room/with spaces/${++sequence}`;
    expect(claimQuarterClose(room, 1)).toBe(true);
    expect(claimQuarterClose(room, 1)).toBe(false);
    expect(claimQuarterClose(room, 2)).toBe(true);
    saveQuarterCloseAutoDisabled(true);
    expect(loadQuarterCloseAutoDisabled()).toBe(true);
  });
});
