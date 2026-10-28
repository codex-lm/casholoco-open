/**
 * Onglets collés sous la barre du jeu : leur hauteur publiée (`--tabs-h`, 0 quand ils ne collent pas) et chaque
 * décalage collant ou de défilement qui se calait sur la seule barre du jeu l'ajoute, pour qu'aucune case ni fiche ne
 * passe sous les barres.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePublishedHeight } from '../src/hooks/usePublishedHeight';
import { revealAfterTabChange, yieldsFocusToMap } from '../src/screens/GameScreen';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  // The layout effect runs at once and returns its cleanup through the test's spy.
  return { ...actual, useLayoutEffect: (effect: () => (() => void) | void) => { cleanups.push(effect() ?? (() => {})); } };
});
const cleanups: (() => void)[] = [];

const src = (path: string) => readFileSync(join(__dirname, '../src', path), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
  cleanups.length = 0;
});

describe('sticky tabs', () => {
  it('stick under the game bar on desktop, not in the phone grid, below the game bar and above the map menus', () => {
    const css = src('styles.css');
    expect(css).toMatch(/\.tabs-sticky \{\s*position: sticky;\s*top: var\(--topbar-h, 65px\);\s*z-index: 45;\s*\}/);
    const phone = css.slice(css.indexOf('@media (max-width: 700px)'));
    expect(phone).toMatch(/\.tabs-sticky \{\s*position: static;\s*\}/);
    // Map menus (40) slide under the tabs; the game bar (50) and its pending-decisions panel (70) stay above.
    expect(src('screens/game/city/mapToolbar.css')).toContain('z-index: 40;');
  });

  it('publish their height only while they stick, and forget it when unmounted', () => {
    const style = new Map<string, string>();
    const root = { style: { setProperty: (name: string, value: string) => style.set(name, value), removeProperty: (name: string) => style.delete(name) } };
    let position = 'sticky';
    const listeners: (() => void)[] = [];
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('window', {
      getComputedStyle: () => ({ position }),
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('ResizeObserver', undefined);
    const el = { getBoundingClientRect: () => ({ height: 40.4 }) };
    usePublishedHeight({ current: el as unknown as HTMLElement }, '--tabs-h', true);
    expect(style.get('--tabs-h')).toBe('41px');
    // Under 700 px the tabs become a static grid: nothing hides under them.
    position = 'static';
    for (const listener of listeners) listener();
    expect(style.get('--tabs-h')).toBe('0px');
    cleanups.forEach((cleanup) => cleanup());
    expect(style.has('--tabs-h')).toBe(false);
    // The help's tab bar publishes nothing.
    usePublishedHeight({ current: el as unknown as HTMLElement }, null, true);
    expect(style.size).toBe(0);
  });

  it('every offset that used the game bar height adds the tabs', () => {
    const plus = 'var(--topbar-h, 65px) + var(--tabs-h, 0px) + 12px';
    const workspace = src('screens/game/city/mapWorkspace.css');
    expect(workspace).toContain(`scroll-margin-top: calc(${plus})`);
    expect(workspace).toContain(`top: calc(${plus});`);
    expect(workspace).toContain('max-height: calc(var(--map-viewport-h, 100dvh) - var(--topbar-h, 65px) - var(--tabs-h, 0px) - 24px);');
    const hex = src('screens/game/hexIntegration.css');
    expect(hex).toContain(`.hx-map-side { position: sticky; top: calc(${plus}); }`);
    expect(hex).toContain(`.hx-map-form { scroll-margin-top: calc(${plus});`);
    expect(src('styles.css')).toContain('top: calc(var(--topbar-h, 96px) + var(--tabs-h, 0px) + 8px);');
    expect(src('screens/game/city/MapSheets.tsx')).toContain("scrollMarginTop: 'calc(var(--topbar-h) + var(--tabs-h, 0px) + 8px)'");
    expect(src('screens/game/city/MapWorkspace.tsx')).toContain("getPropertyValue('--tabs-h')");
    for (const file of ['screens/game/city/mapWorkspace.css', 'screens/game/hexIntegration.css']) {
      expect(src(file), file).not.toMatch(/var\(--topbar-h, 65px\) \+ 12px/);
    }
  });

  it('a target reached from the alert chip lands below both bars and takes the focus', () => {
    const frames: FrameRequestCallback[] = [];
    const attributes = new Map<string, string>();
    const target = {
      style: { scrollMarginTop: '' },
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      scrollIntoView: vi.fn(),
      focus: vi.fn(),
    };
    const querySelector = vi.fn(() => target);
    vi.stubGlobal('window', { requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) });
    vi.stubGlobal('document', { querySelector });
    revealAfterTabChange('.close-banner');
    // Nothing before the next frame: the tab change first returns to the top of the page.
    expect(querySelector).not.toHaveBeenCalled();
    frames.forEach((frame) => frame(0));
    expect(querySelector).toHaveBeenCalledWith('.close-banner');
    expect(target.style.scrollMarginTop).toBe('calc(var(--topbar-h, 65px) + var(--tabs-h, 0px) + 12px)');
    expect(attributes.get('tabindex')).toBe('-1');
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('a cell shown from the close recap arrives like a plain map visit (focus on the tab, the map reveals the cell)', () => {
    expect(yieldsFocusToMap('map', { kind: 'cell', hexId: 'B4' })).toBe(false);
    expect(yieldsFocusToMap('map', { kind: 'deposit', companyId: 'c1', slotId: 's1' })).toBe(true);
  });
});
