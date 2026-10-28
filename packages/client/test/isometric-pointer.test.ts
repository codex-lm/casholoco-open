import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IslandScene } from '../src/screens/game/city/isometric/islandScene';

// Keep the real scene listeners and OrbitControls; replace only GPU/DOM services and asset loading.
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    shadowMap = {};
    setPixelRatio() {} setSize() {} dispose() {}
  } };
});
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {
  async loadAsync() { return { scene: new THREE.Group() }; }
} }));

class CanvasSurface extends EventTarget {
  style = {};
  clientWidth = 800;
  clientHeight = 600;
  captures = new Set<number>();
  constructor(readonly ownerDocument: EventTarget) { super(); }
  getRootNode() { return this.ownerDocument; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }; }
  parentElement = { getBoundingClientRect: () => this.getBoundingClientRect() };
  setPointerCapture(id: number) { this.captures.add(id); }
  releasePointerCapture(id: number) {
    if (this.captures.delete(id)) this.dispatchEvent(Object.assign(new Event('lostpointercapture'), { pointerId: id }));
  }
}

let canvas: CanvasSurface;
let runtime: IslandScene;
let selected: ReturnType<typeof vi.fn>;
let inspect: ReturnType<typeof vi.fn>;
let doubleClick: ReturnType<typeof vi.fn>;
const camera = () => (runtime as unknown as { camera: THREE.OrthographicCamera }).camera;
const controls = () => (runtime as unknown as { controls: OrbitControls }).controls;
function emit(type: string, init: Partial<PointerEvent & WheelEvent> = {}) {
  const { clientX = 400, clientY = 300 } = init;
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX, clientY, pageX: clientX, pageY: clientY, ...init,
  });
  canvas.dispatchEvent(event);
  // Node EventTarget does not bubble; preserve the browser order used by OrbitControls' document listeners.
  canvas.ownerDocument.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  const document = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('document', document);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', undefined);
  canvas = new CanvasSurface(document);
  selected = vi.fn(); inspect = vi.fn(); doubleClick = vi.fn();
  runtime = new IslandScene(canvas as unknown as HTMLCanvasElement, { style: {} } as HTMLElement,
    { selected, inspect, doubleClick, assets: vi.fn(), lost: vi.fn() });
  vi.spyOn(runtime, 'hit').mockReturnValue('S-A1');
});
afterEach(() => { runtime.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('island click and pan handlers', () => {
  it.each([1, 2])('does not select on a stationary button %i gesture', button => {
    const buttons = button === 1 ? 4 : 2;
    emit('pointerdown', { button, buttons });
    emit('pointerup', { button });
    expect(selected).not.toHaveBeenCalled();
  });

  it('never turns a pan that returned to its starting point into a click', () => {
    const before = controls().target.clone();
    emit('pointerdown');
    emit('pointermove', { clientX: 460 });
    expect(controls().target.equals(before)).toBe(false);
    emit('pointermove', { clientX: 400 });
    emit('pointerup');
    expect(selected).not.toHaveBeenCalled();
  });

  it.each(['mouse', 'touch', 'pen'])('keeps an ordinary primary %s click with minor hand drift', pointerType => {
    emit('pointerdown', { pointerType });
    emit('pointermove', { pointerType, clientX: 403, clientY: 302 });
    emit('pointerup', { pointerType, clientX: 403, clientY: 302 });
    expect(selected).toHaveBeenCalledExactlyOnceWith('S-A1');
  });

  it.each([0, 2])('keeps button %i camera panning without selecting', button => {
    const before = controls().target.clone(), buttons = button === 2 ? 2 : 1;
    emit('pointerdown', { button, buttons });
    emit('pointermove', { button: -1, buttons, clientX: 450, clientY: 330 });
    emit('pointerup', { button, clientX: 450, clientY: 330 });
    expect(controls().target.equals(before)).toBe(false);
    expect(selected).not.toHaveBeenCalled();
  });

  it('does not promote a chorded mouse gesture to a left click', () => {
    emit('pointerdown');
    emit('pointermove', { button: 2, buttons: 3 });
    emit('pointermove', { button: 2, buttons: 1 });
    emit('pointerup');
    expect(selected).not.toHaveBeenCalled();
  });

  it('preserves the ordinary left double click and wheel zoom through OrbitControls', () => {
    emit('pointermove', { buttons: 0 });
    emit('pointerdown'); emit('pointerup');
    emit('pointerdown'); emit('pointerup');
    emit('dblclick');
    expect(selected).toHaveBeenCalledTimes(2);
    expect(doubleClick).toHaveBeenCalledExactlyOnceWith('S-A1');
    expect(inspect).toHaveBeenLastCalledWith('S-A1');
    const before = camera().zoom;
    emit('wheel', { buttons: 0, deltaY: -100, deltaMode: 0 });
    expect(camera().zoom).toBeGreaterThan(before);
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const)('does not select or open on a %s-modified gesture', modifier => {
    const options = { [modifier]: true };
    emit('pointerdown', options); emit('pointerup', options);
    emit('dblclick', options);
    expect(selected).not.toHaveBeenCalled();
    expect(doubleClick).not.toHaveBeenCalled();
  });

  it.each([1, 2])('ignores a secondary button %i double-click event', button => {
    emit('dblclick', { button });
    expect(doubleClick).not.toHaveBeenCalled();
  });

  it('does not restore click eligibility when a held modifier is released mid-gesture', () => {
    emit('pointerdown');
    emit('pointermove', { ctrlKey: true });
    emit('pointermove', { ctrlKey: false });
    emit('pointerup');
    expect(selected).not.toHaveBeenCalled();
  });
});

describe('cancelled and multiple pointer gestures', () => {
  it.each(['pointercancel', 'lostpointercapture'])('abandons a %s gesture and permits the next fresh click', event => {
    emit('pointermove', { buttons: 0 });
    expect(inspect).toHaveBeenLastCalledWith('S-A1');
    emit('pointerdown');
    emit(event);
    expect(inspect).toHaveBeenLastCalledWith(null);
    emit('pointerup');
    expect(selected).not.toHaveBeenCalled();
    emit('pointerdown'); emit('pointerup');
    expect(selected).toHaveBeenCalledExactlyOnceWith('S-A1');
  });

  it('ignores a non-primary touch contact whose primary contact is elsewhere', () => {
    emit('pointerdown', { pointerType: 'touch', isPrimary: false });
    emit('pointerup', { pointerType: 'touch', isPrimary: false });
    expect(selected).not.toHaveBeenCalled();
  });

  it.each([1, 2])('invalidates the entire two-finger gesture when contact %i is lifted first', first => {
    const touch = { pointerType: 'touch' };
    emit('pointerdown', touch);
    emit('pointerdown', { ...touch, pointerId: 2, isPrimary: false, clientX: 440 });
    for (const id of [first, first === 1 ? 2 : 1]) emit('pointerup', {
      ...touch, pointerId: id, isPrimary: id === 1, clientX: id === 1 ? 400 : 440,
    });
    expect(selected).not.toHaveBeenCalled();
    emit('pointerdown', touch); emit('pointerup', touch);
    expect(selected).toHaveBeenCalledExactlyOnceWith('S-A1');
  });

  it('keeps real two-finger zoom while preventing a selection at release', () => {
    const touch = { pointerType: 'touch' };
    emit('pointerdown', { ...touch, clientX: 380 });
    emit('pointerdown', { ...touch, pointerId: 2, isPrimary: false, clientX: 420 });
    const before = camera().zoom;
    emit('pointermove', { ...touch, clientX: 360 });
    emit('pointermove', { ...touch, pointerId: 2, isPrimary: false, clientX: 440 });
    expect(camera().zoom).toBeGreaterThan(before);
    emit('pointerup', { ...touch, clientX: 360 });
    emit('pointerup', { ...touch, pointerId: 2, isPrimary: false, clientX: 440 });
    expect(selected).not.toHaveBeenCalled();
  });
});
