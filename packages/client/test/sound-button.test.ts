import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AUDIO, getAudioSettings, setAudioSettings } from '../src/audio/settings';
import { SoundButton } from '../src/components/SoundButton';

interface EffectSlot { deps?: readonly unknown[]; cleanup?: () => void }
const hooks = vi.hoisted(() => ({
  cursor: 0, values: [] as unknown[], lang: 'fr' as 'fr' | 'en',
  effects: new Map<number, EffectSlot>(),
  scheduled: new Map<number, { effect: () => void | (() => void); deps?: readonly unknown[] }>(),
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.values)) hooks.values[i] = initial;
      return [hooks.values[i], (next: unknown) => {
        hooks.values[i] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(hooks.values[i]) : next;
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
      if (!previous || !deps || !previous.deps || deps.some((value, j) => !Object.is(value, previous.deps![j]))) {
        hooks.scheduled.set(i, { effect, deps });
      }
    },
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  };
});
vi.mock('../src/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/i18n')>();
  return { ...actual, useT: () => actual.messages(hooks.lang) };
});

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

type Props = {
  children?: ReactNode; ref?: { current: unknown }; type?: string;
  'aria-expanded'?: boolean; onClick?: () => void;
  onChange?: (event: { target: { value?: string; checked?: boolean } }) => void;
  value?: number; checked?: boolean; disabled?: boolean;
};
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}

/** Runs the real handlers/effects. The commit models removal of a focused panel input;
 * browser acceptance also checks that Escape restores the native button without scrolling. */
function setup() {
  const body = {};
  const outside = {};
  const controls = [{}, {}, {}];
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const doc = {
    activeElement: body,
    addEventListener(type: string, listener: (event: Event) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: (event: Event) => void) { listeners.get(type)?.delete(listener); },
  };
  const button = { focus: vi.fn((_options?: FocusOptions) => { doc.activeElement = button; }) };
  const box = {
    contains: (node: unknown) => node === button || controls.includes(node as object),
    getBoundingClientRect: () => ({ left: 20, width: 32 }),
  };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { innerWidth: 1280 });
  let tree: ReactElement<Props>[] = [];
  const render = () => {
    hooks.cursor = 0;
    const root = SoundButton({});
    tree = elements(root);
    root.props.ref.current = box;
    const trigger = tree.find((node) => node.type === 'button')!;
    if (trigger.props.ref) trigger.props.ref.current = button;
    if (!trigger.props['aria-expanded'] && controls.includes(doc.activeElement)) doc.activeElement = body;
    flushEffects();
    return trigger;
  };
  render();
  const dispatch = (type: string, event: object) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener(event as Event);
    return render();
  };
  return {
    body, outside, controls, doc, button, listeners, render, dispatch,
    inputs: () => tree.filter((node) => node.type === 'input'),
    open: () => { render().props.onClick!(); return render(); },
  };
}

beforeEach(() => {
  resetHooks();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  setAudioSettings(DEFAULT_AUDIO);
});
afterEach(() => { resetHooks(); setAudioSettings(DEFAULT_AUDIO); vi.unstubAllGlobals(); });

describe.each(['fr', 'en'] as const)('sound popover keyboard and dismissal (%s)', (lang) => {
  beforeEach(() => { hooks.lang = lang; });

  it.each([0, 1, 2])('Escape returns focus from audio control %i to the sound button without scrolling', (index) => {
    const ui = setup();
    expect(ui.open().props['aria-expanded']).toBe(true);
    ui.doc.activeElement = ui.controls[index];
    const trigger = ui.dispatch('keydown', { key: 'Escape' });
    expect(trigger.props['aria-expanded']).toBe(false);
    expect(ui.doc.activeElement).toBe(ui.button);
    expect(ui.button.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(getAudioSettings()).toEqual(DEFAULT_AUDIO);
    expect(ui.listeners.get('keydown')?.size).toBe(0);
    expect(ui.listeners.get('pointerdown')?.size).toBe(0);
  });

  it('keeps inside clicks open and dismisses outside without taking focus from the destination', () => {
    const ui = setup();
    ui.open();
    ui.doc.activeElement = ui.controls[1];
    expect(ui.dispatch('pointerdown', { target: ui.controls[1] }).props['aria-expanded']).toBe(true);
    ui.doc.activeElement = ui.outside;
    expect(ui.dispatch('pointerdown', { target: ui.outside }).props['aria-expanded']).toBe(false);
    expect(ui.doc.activeElement).toBe(ui.outside);
    expect(ui.button.focus).not.toHaveBeenCalled();
    expect(getAudioSettings()).toEqual(DEFAULT_AUDIO);
  });

  it('does not steal an external focus when Escape dismisses an already abandoned panel', () => {
    const ui = setup();
    ui.open();
    ui.doc.activeElement = ui.outside;
    expect(ui.dispatch('keydown', { key: 'Escape' }).props['aria-expanded']).toBe(false);
    expect(ui.doc.activeElement).toBe(ui.outside);
    expect(ui.button.focus).not.toHaveBeenCalled();
  });

  it('preserves edited music, effects and mute across close/reopen, and removes listeners on unmount', () => {
    const ui = setup();
    ui.open();
    ui.inputs()[1].props.onChange!({ target: { value: '35' } });
    ui.inputs()[2].props.onChange!({ target: { value: '15' } });
    ui.inputs()[0].props.onChange!({ target: { checked: false } });
    ui.render();
    ui.doc.activeElement = ui.controls[0];
    ui.dispatch('keydown', { key: 'Escape' });
    ui.open();
    expect(getAudioSettings()).toEqual({ muted: true, music: 0.35, sfx: 0.15 });
    expect(ui.inputs().map((input) => [input.props.checked, input.props.value, input.props.disabled])).toEqual([
      [false, undefined, undefined], [undefined, 35, true], [undefined, 15, true],
    ]);
    expect(ui.listeners.get('keydown')?.size).toBe(1);
    expect(ui.listeners.get('pointerdown')?.size).toBe(1);
    resetHooks();
    expect(ui.listeners.get('keydown')?.size).toBe(0);
    expect(ui.listeners.get('pointerdown')?.size).toBe(0);
  });
});
