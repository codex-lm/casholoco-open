import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapWorkspaceMessages } from '../src/i18n/mapWorkspace';
import { MAP_ZOOM_KEY } from '../src/storageFlags';
import {
  MAP_ZOOM_LEVELS, MAP_ZOOM_MAX, clampZoom, exceedsDragThreshold, frameRevealDelta, frameWidth, loadMapZoom, nextZoom, previousZoom,
  saveMapZoom, wheelPixels, wheelZoomStep, zoomScrollTarget,
} from '../src/screens/game/city/mapZoom';
import { MapZoomFrame, onScrollbar, revealInZoomFrame, zoomAnchor, type MapZoomLabels } from '../src/screens/game/city/MapZoomFrame';

/** Cursor-based hooks: state survives re-renders, effects and layout effects are run by the test. */
const hooks = vi.hoisted(() => ({
  cursor: 0, values: [] as unknown[],
  effects: [] as (() => void | (() => void))[], layout: [] as { effect: () => void; deps?: readonly unknown[] }[],
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
    useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
    useLayoutEffect: (effect: () => void, deps?: readonly unknown[]) => { hooks.layout.push({ effect, deps }); },
  };
});

function storage(initial: Record<string, string> = {}, broken = false) {
  const values = new Map(Object.entries(initial));
  const store = {
    getItem: vi.fn((key: string) => { if (broken) throw new Error('blocked'); return values.get(key) ?? null; }),
    setItem: vi.fn((key: string, value: string) => { if (broken) throw new Error('blocked'); values.set(key, value); }),
  };
  vi.stubGlobal('localStorage', store);
  return { store, values };
}
beforeEach(() => { hooks.cursor = 0; hooks.values = []; hooks.effects = []; hooks.layout = []; });
afterEach(() => vi.unstubAllGlobals());

function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children as ReactNode, predicate)];
}

describe('zoom levels and their memory in the browser', () => {
  it('steps through 1, 1.25, 1.5, 2 and 2.5, and stays at the ends', () => {
    expect(MAP_ZOOM_LEVELS).toEqual([1, 1.25, 1.5, 2, 2.5]);
    expect(MAP_ZOOM_MAX).toBe(2.5);
    expect([1, 1.25, 1.5, 2, 2.5].map(nextZoom)).toEqual([1.25, 1.5, 2, 2.5, 2.5]);
    expect([1, 1.25, 1.5, 2, 2.5].map(previousZoom)).toEqual([1, 1, 1.25, 1.5, 2]);
  });

  it('clamps anything else to the nearest known level, 1 when unreadable', () => {
    expect(clampZoom(1.3)).toBe(1.25);
    expect(clampZoom(1.8)).toBe(2);
    expect(clampZoom(9)).toBe(2.5);
    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(-3)).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
    expect(nextZoom(1.3)).toBe(1.5);
    expect(previousZoom(7)).toBe(2);
  });

  it('remembers the zoom per browser, 1 by default, and survives a blocked storage', () => {
    expect(loadMapZoom()).toBe(1);
    const { store, values } = storage();
    expect(loadMapZoom()).toBe(1);
    saveMapZoom(2);
    expect(store.setItem).toHaveBeenCalledWith(MAP_ZOOM_KEY, '2');
    expect(loadMapZoom()).toBe(2);
    saveMapZoom(1.7);
    expect(values.get(MAP_ZOOM_KEY)).toBe('1.5');
    for (const [raw, zoom] of [['abc', 1], ['', 1], ['1.3', 1.25], ['40', 2.5]] as const) {
      values.set(MAP_ZOOM_KEY, raw);
      expect(loadMapZoom()).toBe(zoom);
    }
    storage({ [MAP_ZOOM_KEY]: '2' }, true);
    expect(loadMapZoom()).toBe(1);
    expect(() => saveMapZoom(2)).not.toThrow();
  });
});

describe('frame scrolling, drag threshold and wheel steps', () => {
  const view = { left: 100, top: 200, right: 700, bottom: 900 };

  it('leaves a visible cell alone, nudges a cell at the edge, centres a cell out of view', () => {
    expect(frameRevealDelta({ left: 300, top: 400, right: 340, bottom: 446 }, view)).toEqual({ left: 0, top: 0 });
    // Clipped on the right and the bottom (a click at the edge): just enough, with the 12 px margin.
    expect(frameRevealDelta({ left: 680, top: 870, right: 720, bottom: 916 }, view)).toEqual({ left: 32, top: 28 });
    // Clipped on the left and the top.
    expect(frameRevealDelta({ left: 90, top: 190, right: 130, bottom: 236 }, view)).toEqual({ left: -22, top: -22 });
    // Entirely out of view (« Aller à » towards the south-east): its centre comes to the frame's centre.
    expect(frameRevealDelta({ left: 1400, top: 1800, right: 1440, bottom: 1846 }, view)).toEqual({ left: 1020, top: 1273 });
    expect(frameRevealDelta({ left: -500, top: 400, right: -460, bottom: 446 }, view)).toEqual({ left: -880, top: -127 });
    // Bigger than the frame: its start.
    expect(frameRevealDelta({ left: 50, top: 300, right: 800, bottom: 340 }, view)).toEqual({ left: -62, top: 0 });
  });

  it('keeps the frame centre on a zoom change, or centres the selected cell when it would leave the frame', () => {
    const board = { width: 1500, height: 1736 }, frame = { width: 600, height: 694 };
    // Centre of the country, no selection: the same centre at the new size.
    expect(zoomScrollTarget({ center: { x: 0.5, y: 0.5 }, mark: null }, board, frame)).toEqual({ left: 450, top: 521 });
    // A selected cell near the centre stays in view: the centre is kept.
    expect(zoomScrollTarget({ center: { x: 0.5, y: 0.5 }, mark: { left: 0.45, top: 0.45, right: 0.5, bottom: 0.5 } }, board, frame)).toEqual({ left: 450, top: 521 });
    // A southern cell would leave the frame: it comes to the centre.
    expect(zoomScrollTarget({ center: { x: 0.5, y: 0.5 }, mark: { left: 0.6, top: 0.75, right: 0.64, bottom: 0.79 } }, board, frame)).toEqual({ left: 630, top: 990 });
    // Bounded by the board: a cell in a corner, a centre beyond the edge.
    expect(zoomScrollTarget({ center: { x: 0.5, y: 0.5 }, mark: { left: 0.97, top: 0.97, right: 1, bottom: 1 } }, board, frame)).toEqual({ left: 900, top: 1042 });
    expect(zoomScrollTarget({ center: { x: 0.05, y: 0.02 }, mark: null }, board, frame)).toEqual({ left: 0, top: 0 });
    // Back to 1 (the board fits): no scroll.
    expect(zoomScrollTarget({ center: { x: 0.3, y: 0.8 }, mark: null }, frame, frame)).toEqual({ left: 0, top: 0 });
  });

  it('counts a press that moves more than 5 px as a drag', () => {
    expect(exceedsDragThreshold(0, 0)).toBe(false);
    expect(exceedsDragThreshold(3, 4)).toBe(false);
    expect(exceedsDragThreshold(4, 4)).toBe(true);
    expect(exceedsDragThreshold(-6, 0)).toBe(true);
  });

  it('turns a mouse notch into one level and accumulates a trackpad pinch', () => {
    expect(wheelZoomStep(0, -100)).toEqual({ step: 1, accumulated: 0 });
    expect(wheelZoomStep(0, 100)).toEqual({ step: -1, accumulated: 0 });
    let state = { step: 0 as -1 | 0 | 1, accumulated: 0 };
    const steps: number[] = [];
    for (let i = 0; i < 6; i++) {
      state = wheelZoomStep(state.accumulated, -12);
      steps.push(state.step);
    }
    expect(steps).toEqual([0, 0, 0, 0, 1, 0]);
    // A change of direction starts again from zero.
    expect(wheelZoomStep(-40, 30)).toEqual({ step: 0, accumulated: 30 });
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelPixels({ deltaY: -1, deltaMode: 2 })).toBe(-400);
    expect(wheelPixels({ deltaY: 100, deltaMode: 0 })).toBe(100);
  });

  it('measures the visible centre and the selected cell in fractions of the board, and reveals a cell inside the frame', () => {
    const mark = { getBoundingClientRect: () => ({ left: 400, top: 700, right: 440, bottom: 746 }) };
    const board = { getBoundingClientRect: () => ({ left: 100, top: 200, width: 1000, height: 1157 }), querySelector: () => mark };
    const frame = { getBoundingClientRect: () => ({ left: 100, top: 200 }), clientLeft: 0, clientTop: 0, clientWidth: 600, clientHeight: 694, scrollLeft: 0, scrollTop: 0 };
    const anchor = zoomAnchor(frame as unknown as HTMLElement, board as unknown as HTMLElement)!;
    expect(anchor.center).toEqual({ x: 0.3, y: 347 / 1157 });
    expect(anchor.mark).toEqual({ left: 0.3, right: 0.34, top: 500 / 1157, bottom: 546 / 1157 });
    expect(zoomAnchor(frame as unknown as HTMLElement, { getBoundingClientRect: () => ({ width: 0, height: 0 }) } as unknown as HTMLElement)).toBeNull();
    // A visible cell leaves the frame alone; a south-eastern cell out of view comes to its centre.
    revealInZoomFrame(frame as unknown as HTMLElement, mark as unknown as Element);
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([0, 0]);
    revealInZoomFrame(frame as unknown as HTMLElement, { getBoundingClientRect: () => ({ left: 1200, top: 1500, right: 1240, bottom: 1546 }) } as unknown as Element);
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([820, 976]);
  });
});

const labels = (lang: 'fr' | 'en'): MapZoomLabels => {
  const text = mapWorkspaceMessages(lang);
  return { group: text.zoomGroup, zoomIn: text.zoomIn, zoomOut: text.zoomOut, fit: text.zoomFit, fitAria: text.zoomFitAria };
};

describe.each(['fr', 'en'] as const)('zoom frame (%s)', (lang) => {
  const text = mapWorkspaceMessages(lang);
  const render = () => {
    hooks.cursor = 0;
    return MapZoomFrame({ aspect: 0.864, labels: labels(lang), children: createElement('svg', { className: 'map-svg' }) }) as ReactElement<Record<string, unknown>>;
  };
  const buttons = (node: ReactNode) => elements(node, (e) => e.type === 'button');
  const frameOf = (node: ReactNode) => elements(node, (e) => e.props.className === 'map-zoom-frame')[0];

  it('names its buttons, disables the ends and offers « Ajuster » only when zoomed', () => {
    expect([text.zoomIn, text.zoomOut, text.zoomFit, text.zoomFitAria, text.zoomGroup]).toEqual(lang === 'fr'
      ? ['Zoom avant', 'Zoom arrière', 'Ajuster', 'Ajuster le pays à l’écran', 'Zoom du plateau']
      : ['Zoom in', 'Zoom out', 'Fit', 'Fit the whole country on screen', 'Board zoom']);
    storage();
    const html = renderToStaticMarkup(render());
    expect(html).toContain('class="map-zoom" style="--map-zoom:1;--map-aspect:0.864"');
    expect(html).toContain(`role="group" aria-label="${text.zoomGroup}"`);
    expect(html).toContain(`aria-label="${text.zoomIn}" title="${text.zoomIn}">+</button>`);
    expect(html).toContain(`aria-label="${text.zoomOut}" title="${text.zoomOut}" aria-disabled="true">−</button>`);
    expect(html).not.toContain(text.zoomFit);
    expect(html).toContain('<div class="map-zoom-board"><svg class="map-svg"></svg></div>');
    // The buttons come before the board in the page (overlaid by the CSS): Tab reaches them before the 159 cells.
    expect(html.indexOf('map-zoom-controls')).toBeGreaterThan(-1);
    expect(html.indexOf('map-zoom-controls')).toBeLessThan(html.indexOf('map-zoom-frame'));
    // A remembered 2.5: the frame scrolls, « + » is at its end, « Ajuster » brings the whole country back.
    hooks.values = [];
    storage({ [MAP_ZOOM_KEY]: '2.5' });
    const zoomed = renderToStaticMarkup(render());
    expect(zoomed).toContain('class="map-zoom map-zoom-in" style="--map-zoom:2.5;');
    expect(zoomed).toContain(`aria-label="${text.zoomIn}" title="${text.zoomIn}" aria-disabled="true">+</button>`);
    expect(zoomed).not.toContain(`title="${text.zoomOut}" aria-disabled`);
    expect(zoomed).toContain(`aria-label="${escapeAttr(text.zoomFitAria)}" title="${escapeAttr(text.zoomFitAria)}">${text.zoomFit}</button>`);
  });

  it('zooms by its buttons, remembers the level, keeps the centre and gives « Ajuster »’s focus to « + »', () => {
    const { values } = storage();
    let node = render();
    const [plus, minus] = buttons(node);
    // − at 1 does nothing.
    (minus.props.onClick as () => void)();
    expect(values.has(MAP_ZOOM_KEY)).toBe(false);
    // The frame shows the whole board: zooming in keeps its centre.
    const frame = { getBoundingClientRect: () => ({ left: 0, top: 0 }), clientLeft: 0, clientTop: 0, clientWidth: 600, clientHeight: 694, offsetWidth: 600, scrollLeft: 0, scrollTop: 0 };
    const board = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 694 }), querySelector: () => null, offsetWidth: 750, offsetHeight: 868 };
    const box = { style: { setProperty: vi.fn() } };
    (node.props.ref as { current: unknown }).current = box;
    (frameOf(node).props.ref as { current: unknown }).current = frame;
    (elements(node, (e) => e.props.className === 'map-zoom-board')[0].props.ref as { current: unknown }).current = board;
    (plus.props.onClick as () => void)();
    expect(values.get(MAP_ZOOM_KEY)).toBe('1.25');
    hooks.layout = [];
    node = render();
    expect(node.props.style).toMatchObject({ '--map-zoom': 1.25 });
    for (const { effect } of hooks.layout) effect();
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([75, 87]);
    expect(box.style.setProperty).toHaveBeenCalledWith('--map-zoom-scrollbar', '0px');
    // « Ajuster » goes back to 1 and hands the focus to « + » (it disappears itself).
    const focus = vi.fn();
    (buttons(node)[0].props.ref as { current: unknown }).current = { focus };
    const fit = buttons(node).find((b) => b.props['aria-label'] === text.zoomFitAria)!;
    (fit.props.onClick as () => void)();
    expect(values.get(MAP_ZOOM_KEY)).toBe('1');
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(buttons(render()).map((b) => b.props['aria-label'])).toEqual([text.zoomIn, text.zoomOut]);
  });

  it('pans with a mouse drag beyond 5 px and never selects the cell under a drag', () => {
    storage({ [MAP_ZOOM_KEY]: '2' });
    let node = render();
    const capture = vi.fn();
    // A 600 × 694 frame at the window's corner, its scrollbars beyond that (zoomed: the board inside is twice as big).
    const frame = { scrollLeft: 300, scrollTop: 400, setPointerCapture: capture, getBoundingClientRect: () => ({ left: 0, top: 0 }),
      clientLeft: 0, clientTop: 0, clientWidth: 600, clientHeight: 694, scrollWidth: 1200, scrollHeight: 1388 };
    (frameOf(node).props.ref as { current: unknown }).current = frame;
    const on = (name: string, event: Record<string, unknown>) => (frameOf(node).props[name] as (event: unknown) => void)({ pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1, ...event });
    const click = () => {
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      (frameOf(node).props.onClickCapture as (event: unknown) => void)(event);
      return event;
    };
    // A plain click (3 px of jitter) stays a click.
    on('onPointerDown', { clientX: 100, clientY: 100 });
    on('onPointerMove', { clientX: 103, clientY: 98 });
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([300, 400]);
    on('onPointerUp', {});
    expect(click().stopPropagation).not.toHaveBeenCalled();
    // A drag scrolls the frame against the pointer, captures it, and swallows the click that ends it, once.
    on('onPointerDown', { clientX: 100, clientY: 100 });
    on('onPointerMove', { clientX: 140, clientY: 70 });
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([260, 430]);
    expect(capture).toHaveBeenCalledExactlyOnceWith(7);
    node = render();
    expect(String(node.props.className)).toContain('map-zoom-dragging');
    on('onPointerMove', { pointerId: 8, clientX: 0, clientY: 0 });
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([260, 430]);
    on('onPointerUp', {});
    expect(String(render().props.className)).not.toContain('map-zoom-dragging');
    const swallowed = click();
    expect(swallowed.preventDefault).toHaveBeenCalledOnce();
    expect(swallowed.stopPropagation).toHaveBeenCalledOnce();
    expect(click().stopPropagation).not.toHaveBeenCalled();
    // A cancelled drag produces no click; a touch or a right button never starts one (the browser scrolls touch itself).
    on('onPointerDown', { clientX: 0, clientY: 0 });
    on('onPointerMove', { clientX: 30, clientY: 0 });
    on('onPointerCancel', {});
    expect(click().stopPropagation).not.toHaveBeenCalled();
    const before = [frame.scrollLeft, frame.scrollTop];
    on('onPointerDown', { pointerType: 'touch', clientX: 0, clientY: 0 });
    on('onPointerMove', { pointerType: 'touch', clientX: 50, clientY: 50 });
    on('onPointerDown', { button: 2, clientX: 0, clientY: 0 });
    on('onPointerMove', { clientX: 50, clientY: 50 });
    expect([frame.scrollLeft, frame.scrollTop]).toEqual(before);
    // A press on the frame's scrollbars is the browser's (dragging the thumb), never a pan.
    on('onPointerDown', { clientX: 606, clientY: 300 });
    on('onPointerMove', { clientX: 606, clientY: 380 });
    on('onPointerDown', { clientX: 300, clientY: 700 });
    on('onPointerMove', { clientX: 380, clientY: 700 });
    expect([frame.scrollLeft, frame.scrollTop]).toEqual(before);
    expect(onScrollbar(frame as unknown as HTMLElement, 599, 693)).toBe(false);
    expect(onScrollbar(frame as unknown as HTMLElement, 600, 10)).toBe(true);
    // A drag released outside the window leaves no click to swallow: the next press clears it.
    on('onPointerDown', { clientX: 0, clientY: 0 });
    on('onPointerMove', { clientX: 30, clientY: 0 });
    on('onPointerUp', {});
    on('onPointerDown', { clientX: 0, clientY: 0 });
    on('onPointerUp', {});
    expect(click().stopPropagation).not.toHaveBeenCalled();
  });

  it('never leaves a drag stuck: a press released off the frame, a lost capture, a new press', () => {
    storage({ [MAP_ZOOM_KEY]: '2' });
    const node = render();
    const capture = vi.fn();
    const frame = { scrollLeft: 300, scrollTop: 400, setPointerCapture: capture, getBoundingClientRect: () => ({ left: 0, top: 0 }),
      clientLeft: 0, clientTop: 0, clientWidth: 600, clientHeight: 694, scrollWidth: 1200, scrollHeight: 1388 };
    (frameOf(node).props.ref as { current: unknown }).current = frame;
    const on = (name: string, event: Record<string, unknown>) => (frameOf(node).props[name] as (event: unknown) => void)({ pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, ...event });
    const click = () => {
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      (frameOf(node).props.onClickCapture as (event: unknown) => void)(event);
      return event;
    };
    const dragging = () => String(render().props.className).includes('map-zoom-dragging');
    // Pressed, moved 3 px, released on « + » (outside the frame, no pointerup here): the next hover, button up, pans nothing.
    on('onPointerDown', { clientX: 100, clientY: 100 });
    on('onPointerMove', { clientX: 103, clientY: 100 });
    on('onPointerMove', { buttons: 0, clientX: 180, clientY: 160 });
    on('onPointerMove', { buttons: 0, clientX: 260, clientY: 220 });
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([300, 400]);
    expect(capture).not.toHaveBeenCalled();
    expect(dragging()).toBe(false);
    // The press is forgotten: even a later move with a button down (a press that began elsewhere) does not pan.
    on('onPointerMove', { clientX: 300, clientY: 300 });
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([300, 400]);
    // A drag whose capture is lost ends there, without swallowing a later click.
    on('onPointerDown', { clientX: 100, clientY: 100 });
    on('onPointerMove', { clientX: 140, clientY: 100 });
    expect(dragging()).toBe(true);
    on('onLostPointerCapture', {});
    expect(dragging()).toBe(false);
    expect(click().stopPropagation).not.toHaveBeenCalled();
    // A normal release fires pointerup then lostpointercapture: the click that follows is still swallowed, once.
    on('onPointerDown', { clientX: 100, clientY: 100 });
    on('onPointerMove', { clientX: 140, clientY: 100 });
    on('onPointerUp', { buttons: 0 });
    on('onLostPointerCapture', {});
    expect(dragging()).toBe(false);
    expect(click().stopPropagation).toHaveBeenCalledOnce();
    // A drag left behind (its release never reached the frame) is cleared by the next press, grabbing cursor included.
    on('onPointerDown', { clientX: 100, clientY: 100 });
    on('onPointerMove', { clientX: 140, clientY: 100 });
    expect(dragging()).toBe(true);
    on('onPointerDown', { clientX: 200, clientY: 200 });
    expect(dragging()).toBe(false);
    on('onPointerUp', { buttons: 0 });
    expect(dragging()).toBe(false);
    expect(click().stopPropagation).not.toHaveBeenCalled();
  });

  it('does not drag at zoom 1, nor when nothing overflows the frame: a shaky click stays a click', () => {
    storage();
    let node = render();
    const capture = vi.fn();
    // Zoom 1: the board is the frame's size.
    const frame = { scrollLeft: 0, scrollTop: 0, setPointerCapture: capture, getBoundingClientRect: () => ({ left: 0, top: 0 }),
      clientLeft: 0, clientTop: 0, clientWidth: 600, clientHeight: 694, scrollWidth: 600, scrollHeight: 694 };
    (frameOf(node).props.ref as { current: unknown }).current = frame;
    const shakyClick = () => {
      const on = (name: string, event: Record<string, unknown>) => (frameOf(node).props[name] as (event: unknown) => void)({ pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, ...event });
      on('onPointerDown', { clientX: 100, clientY: 100 });
      on('onPointerMove', { clientX: 108, clientY: 106 });
      on('onPointerUp', { buttons: 0 });
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
      (frameOf(node).props.onClickCapture as (event: unknown) => void)(event);
      return event;
    };
    expect(shakyClick().stopPropagation).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(String(render().props.className)).not.toContain('map-zoom-dragging');
    // A remembered 2 on a narrow window (below 960 px the CSS draws no zoom, nothing overflows): no drag either.
    hooks.values = [];
    storage({ [MAP_ZOOM_KEY]: '2' });
    node = render();
    (frameOf(node).props.ref as { current: unknown }).current = frame;
    expect(shakyClick().stopPropagation).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([0, 0]);
  });

  it('zooms with Ctrl / ⌘ + wheel over the frame on desktop, and leaves the page alone otherwise', () => {
    const { values } = storage();
    const listeners = new Map<string, { handler: (event: unknown) => void; options: unknown }>();
    const frame = {
      addEventListener: vi.fn((name: string, handler: (event: unknown) => void, options: unknown) => listeners.set(name, { handler, options })),
      removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    };
    let desktop = true;
    vi.stubGlobal('window', { matchMedia: () => ({ matches: desktop }) });
    const node = render();
    (frameOf(node).props.ref as { current: unknown }).current = frame;
    const cleanups = hooks.effects.map((effect) => effect());
    const wheel = listeners.get('wheel')!;
    expect(wheel.options).toEqual({ passive: false });
    const fire = (event: Record<string, unknown>) => {
      const preventDefault = vi.fn();
      wheel.handler({ deltaY: -100, deltaMode: 0, ctrlKey: false, metaKey: false, preventDefault, ...event });
      return preventDefault;
    };
    expect(fire({})).not.toHaveBeenCalled();
    expect(values.has(MAP_ZOOM_KEY)).toBe(false);
    expect(fire({ ctrlKey: true })).toHaveBeenCalledOnce();
    expect(values.get(MAP_ZOOM_KEY)).toBe('1.25');
    expect(fire({ metaKey: true })).toHaveBeenCalledOnce();
    expect(values.get(MAP_ZOOM_KEY)).toBe('1.5');
    expect(fire({ ctrlKey: true, deltaY: 100 })).toHaveBeenCalledOnce();
    expect(values.get(MAP_ZOOM_KEY)).toBe('1.25');
    // Below 960 px there is no zoom: Ctrl + wheel stays the browser's.
    desktop = false;
    expect(fire({ ctrlKey: true })).not.toHaveBeenCalled();
    expect(values.get(MAP_ZOOM_KEY)).toBe('1.25');
    for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
    expect(listeners.has('wheel')).toBe(false);
  });
});

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

describe('zoom frame styles', () => {
  it('fits the frame to the window height at the drawing’s proportions, and scrolls only when zoomed (desktop only)', () => {
    const css = readFileSync(join(__dirname, '../src/screens/game/city/mapWorkspace.css'), 'utf8');
    const desktop = css.slice(css.indexOf('@media (min-width: 960px)'));
    expect(css.indexOf('.map-zoom-controls { display: none; }')).toBeLessThan(css.indexOf('@media (min-width: 960px)'));
    expect(desktop).toContain('--map-frame-h: max(280px, calc(var(--map-viewport-h, 100dvh) - var(--topbar-h, 65px) - var(--tabs-h, 0px) - var(--map-chrome-h) - 24px));');
    expect(desktop).toContain('--map-fit-w: calc(var(--map-frame-h) * var(--map-aspect, 0.864) + 2px);');
    // The frame keeps the fitted country's height (less when its column is narrower than the fitted width), even when
    // it widens past zoom 1; the drawing is that height × aspect × zoom wide.
    expect(desktop).toContain('.map-workspace-zoomable .map-workspace-column { container: map-column / inline-size; }');
    expect(desktop).toContain('--map-frame-inner-h: min(var(--map-frame-h, 100vh), calc((100cqw - 2px) / var(--map-aspect, 0.864)));');
    expect(desktop).toMatch(/\.map-zoom-frame \{[^}]*height: var\(--map-frame-inner-h\);\s*overflow: hidden;/);
    expect(desktop).toContain('.map-zoom-board { width: calc(var(--map-frame-inner-h) * var(--map-aspect, 0.864) * var(--map-zoom, 1)); }');
    // Zooming never widens the frame (nothing around it moves); only the folded left column gives it more room.
    expect(desktop).toContain('.map-workspace-zoomable .map-zoom { max-width: var(--map-fit-w); margin-inline: auto; }');
    expect(desktop).toContain('.map-workspace-zoomable.map-workspace-side-folded .map-zoom { max-width: var(--map-board-w); }');
    expect(desktop).toContain('.map-zoom-in .map-zoom-frame { overflow: auto; cursor: grab; }');
    expect(desktop).toContain('right: calc(8px + var(--map-zoom-scrollbar, 0px));');
  });

  it('keeps « + » and « − » big: their rule outranks `.btn.tiny` and `.btn[aria-disabled]`', () => {
    const css = readFileSync(join(__dirname, '../src/screens/game/city/mapWorkspace.css'), 'utf8');
    const global = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');
    expect(global).toMatch(/\.btn\.tiny \{\s*font-size: 0\.75rem;\s*padding: 3px 8px;/);
    expect(css).toContain('.map-zoom-controls .btn.map-zoom-button { width: 30px; height: 30px; padding: 0; font-size: 18px; line-height: 1; }');
    expect(css).toContain(".map-zoom-controls .btn.map-zoom-button[aria-disabled='true'] { opacity: 0.4; cursor: not-allowed; }");
    // No weaker rule left behind that `.btn.tiny` would silently override.
    expect(css).not.toMatch(/^\s*\.map-zoom-button[ [{]/m);
  });
});

describe('zoom frame held by the workspace, and its width changes', () => {
  const labelsFr = labels('fr');
  const render = (props: Partial<Parameters<typeof MapZoomFrame>[0]> = {}) => {
    hooks.cursor = 0;
    return MapZoomFrame({ aspect: 0.864, labels: labelsFr, children: createElement('svg', { className: 'map-svg' }), ...props }) as ReactElement<Record<string, unknown>>;
  };
  const frameOf = (node: ReactNode) => elements(node, (e) => e.props.className === 'map-zoom-frame')[0];
  const boardOf = (node: ReactNode) => elements(node, (e) => e.props.className === 'map-zoom-board')[0];

  it('keeps the fitted width at any zoom, and widens to the drawing × zoom (plus its scrollbar) only with the left column folded', () => {
    // The column open: zooming changes nothing around the frame.
    expect(frameWidth(502, 1, 900)).toBe(502);
    expect(frameWidth(502, 1.5, 900)).toBe(502);
    expect(frameWidth(502, 2.5, 900)).toBe(502);
    expect(frameWidth(502, 2, 300)).toBe(300);
    // Folded: the drawing (the fitted width less its 2 px border) × zoom, the border and the vertical scrollbar,
    // within the room left.
    expect(frameWidth(502, 1.5, 900, { folded: true })).toBe(752);
    expect(frameWidth(502, 1.5, 900, { folded: true, scrollbar: 17 })).toBe(769);
    expect(frameWidth(502, 2.5, 900, { folded: true, scrollbar: 17 })).toBe(900);
    // An unknown level is the nearest known one.
    expect(frameWidth(502, 1.4, 2000, { folded: true })).toBe(752);
    expect(frameWidth(502, 2, -10, { folded: true })).toBe(0);
  });

  it('shows the zoom it is given, reports its changes, and still remembers them', () => {
    const { values } = storage({ [MAP_ZOOM_KEY]: '2.5' });
    const onZoomChange = vi.fn();
    let node = render({ zoom: 1.5, onZoomChange });
    expect(node.props.style).toMatchObject({ '--map-zoom': 1.5 });
    const plus = elements(node, (e) => e.type === 'button')[0];
    (plus.props.onClick as () => void)();
    expect(onZoomChange).toHaveBeenCalledExactlyOnceWith(2);
    expect(values.get(MAP_ZOOM_KEY)).toBe('2');
    // The workspace answers with the new level.
    node = render({ zoom: 2, onZoomChange });
    expect(String(node.props.className)).toContain('map-zoom-in');
    expect(node.props.style).toMatchObject({ '--map-zoom': 2 });
  });

  it('keeps the same centre when the frame gets wider or narrower (the left column folds), or the selected cell in view', () => {
    storage({ [MAP_ZOOM_KEY]: '2' });
    const observers: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(public callback: () => void) { observers.push(this); }
    });
    const listeners = new Map<string, () => void>();
    // A 600 px wide frame over a 1200 × 1388 board, scrolled to its centre region.
    const frame = {
      clientLeft: 0, clientTop: 0, clientWidth: 600, clientHeight: 694, offsetWidth: 600, scrollLeft: 300, scrollTop: 347,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      addEventListener: vi.fn((name: string, listener: () => void) => listeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    };
    const board = {
      offsetWidth: 1200, offsetHeight: 1388, querySelector: () => null,
      getBoundingClientRect: () => ({ left: -frame.scrollLeft, top: -frame.scrollTop, width: 1200, height: 1388 }),
    };
    const node = render();
    (frameOf(node).props.ref as { current: unknown }).current = frame;
    (boardOf(node).props.ref as { current: unknown }).current = board;
    const cleanups = hooks.effects.map((effect) => effect());
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledWith(frame);
    expect(listeners.has('scroll')).toBe(true);
    // The column folds: the frame widens to 900 px; the view's centre (600, 694) stays the centre.
    frame.clientWidth = 900;
    observers[0].callback();
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([150, 347]);
    // A height-only change moves nothing.
    frame.clientHeight = 600;
    observers[0].callback();
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([150, 347]);
    // Panned meanwhile (a scroll is noted), then the column reopens: the new centre is kept.
    frame.clientHeight = 694;
    frame.scrollLeft = 0;
    listeners.get('scroll')!();
    frame.clientWidth = 600;
    observers[0].callback();
    expect(frame.scrollLeft).toBe(150);
    for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(listeners.has('scroll')).toBe(false);
  });

  it('leaves the frame alone at zoom 1 when its width changes (the whole country is in view)', () => {
    storage();
    const observers: { callback: () => void }[] = [];
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(public callback: () => void) { observers.push(this); }
    });
    const frame = { clientLeft: 0, clientTop: 0, clientWidth: 600, clientHeight: 694, scrollLeft: 0, scrollTop: 0,
      getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const board = { offsetWidth: 600, offsetHeight: 694, querySelector: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 694 }) };
    const node = render();
    (frameOf(node).props.ref as { current: unknown }).current = frame;
    (boardOf(node).props.ref as { current: unknown }).current = board;
    for (const effect of hooks.effects) effect();
    frame.clientWidth = 500;
    observers[0].callback();
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([0, 0]);
  });
});
