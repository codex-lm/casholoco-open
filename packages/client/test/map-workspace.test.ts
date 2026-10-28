import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_SIDE_PANEL_QUERY, MapWorkspace, focusMapSheetTarget, mapSelectionScrollDelta, mapWorkspaceChromeHeight } from '../src/screens/game/city/MapWorkspace';
import { MapZoomFrame, type MapZoomLabels } from '../src/screens/game/city/MapZoomFrame';
import { mapWorkspaceMessages } from '../src/i18n/mapWorkspace';
import { mapSideMessages } from '../src/i18n/mapSide';
import { frameWidth } from '../src/screens/game/city/mapZoom';
import { MAP_SIDE_FOLDED_KEY, MAP_WHOLE_KEY, MAP_ZOOM_KEY, saveFlag } from '../src/storageFlags';

// Like the existing map tests, capture state and handlers without installing a browser renderer: hooks keep their
// value by call order across renders (each render starts the cursor again), effects and layout effects are collected.
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], effects: [] as (() => void | (() => void))[], layout: [] as (() => void | (() => void))[] }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks.values[i], (value: unknown) => { hooks.values[i] = value; }];
    },
    useRef: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.values)) hooks.values[i] = { current: initial };
      return hooks.values[i];
    },
    useId: () => ':workspace:',
    useLayoutEffect: (effect: () => void | (() => void)) => { hooks.layout.push(effect); },
    useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
  };
});
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } });
  // Each case starts a fresh visit; remounts within a case must retain an unsaved preference.
  for (const key of [MAP_SIDE_FOLDED_KEY, MAP_WHOLE_KEY]) saveFlag(key, false);
});
afterEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  hooks.effects = [];
  hooks.layout = [];
  vi.unstubAllGlobals();
});
/** One render of the workspace (the hooks' cursor starts again, their values stay). */
function workspace(props: Parameters<typeof MapWorkspace>[0]) {
  hooks.cursor = 0;
  return MapWorkspace(props);
}

function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children as ReactNode, predicate)];
}
function foldButton(node: ReactNode) {
  return elements(node, (element) => element.type === 'button')[0];
}
const labels = {
  fr: { foldLabel: 'Replier la fiche', reopenLabel: 'Rouvrir la fiche' },
  en: { foldLabel: 'Fold the sheet', reopenLabel: 'Reopen the sheet' },
};
function render(lang: keyof typeof labels, selectedKey: string | null = 'north', selectionToken = 1, preserveFormScroll = false) {
  return workspace({
    ...labels[lang], selectedKey, selectionToken, preserveFormScroll,
    toolbar: createElement('div', { className: 'acting-company' }, 'Test Holding · 100'),
    sheet: createElement('input', { defaultValue: 'draft amount' }),
    children: createElement('svg', { className: 'map-svg', viewBox: '0 0 1080 1250' }),
  });
}

describe.each(['fr', 'en'] as const)('map workspace (%s)', (lang) => {
  it('renders the full-width toolbar, map column and selected sheet', () => {
    const html = renderToStaticMarkup(render(lang));
    expect(html).toContain('class="map-workspace map-workspace-selected"');
    expect(html).toContain('class="map-workspace-toolbar"');
    expect(html).toContain('Test Holding · 100');
    expect(html).toContain('class="map-workspace-column"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(labels[lang].foldLabel);
    expect(html).not.toContain(' hidden=""');
  });

  it('leaves no empty side column when nothing is selected', () => {
    const html = renderToStaticMarkup(render(lang, null));
    expect(html).not.toContain('<aside');
    expect(html).not.toContain('map-workspace-selected');
  });

  it('folds and reopens the sheet while retaining its form and its draft', () => {
    const initial = render(lang);
    (foldButton(initial).props.onClick as () => void)();
    const folded = render(lang);
    const html = renderToStaticMarkup(folded);
    expect(html).toContain('map-workspace-folded');
    expect(html).toContain(' hidden=""');
    expect(html).toContain('value="draft amount"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(labels[lang].reopenLabel);
    (foldButton(folded).props.onClick as () => void)();
    expect(renderToStaticMarkup(render(lang))).not.toContain(' hidden=""');
  });

  it('reopens on the next selection, including a second click on the same geographic key', () => {
    (foldButton(render(lang)).props.onClick as () => void)();
    expect(renderToStaticMarkup(render(lang, 'north', 2))).not.toContain('map-workspace-folded');
    expect(renderToStaticMarkup(render(lang, 'plain', 2))).not.toContain('map-workspace-folded');
  });

  it('folds on Escape inside the sheet but ignores portal modal events', () => {
    const node = render(lang);
    const onKey = elements(node, (element) => element.type === 'aside')[0].props.onKeyDown as (event: KeyboardEvent<HTMLElement>) => void;
    const preventDefault = vi.fn(), stopPropagation = vi.fn();
    const event = (contained: boolean, key = 'Escape') => ({ key, currentTarget: { contains: () => contained }, target: {}, preventDefault, stopPropagation }) as unknown as KeyboardEvent<HTMLElement>;
    onKey(event(false));
    onKey(event(true, 'Enter'));
    expect(preventDefault).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(render(lang))).not.toContain('map-workspace-folded');
    onKey(event(true));
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(renderToStaticMarkup(render(lang))).toContain('map-workspace-folded');
  });
});

describe('desktop viewport sizing and selection visibility', () => {
  it('counts the toolbar, borders and hex legend, independently of the sheet height', () => {
    // 1440 × 900 window: 96px top bar, 150px toolbar/gap, 66px legend/border, 24px clearance.
    const chrome = mapWorkspaceChromeHeight(180, 330, 700, 634);
    expect(chrome).toBe(216);
    expect(900 - 96 - chrome - 24).toBe(564);
    expect(mapWorkspaceChromeHeight(180.2, 330.4, 700.6, 634.3)).toBe(217);
  });

  it('scrolls vertically only when the selected mark falls outside the usable viewport', () => {
    expect(mapSelectionScrollDelta({ top: 220, bottom: 280 }, 96, 900)).toBe(0);
    expect(mapSelectionScrollDelta({ top: 80, bottom: 140 }, 96, 900)).toBe(-28);
    expect(mapSelectionScrollDelta({ top: 860, bottom: 920 }, 96, 900)).toBe(32);
  });

  it('scopes the desktop width and height rules to the common map frame, with aspect preserved', () => {
    const css = readFileSync(join(__dirname, '../src/screens/game/city/mapWorkspace.css'), 'utf8');
    expect(css).toContain('@media (min-width: 960px)');
    expect(css).toContain('.page.tab-page:has(.map-workspace) { max-width: none; }');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 330px');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 38px');
    expect(css).toContain('var(--topbar-h, 65px) - var(--tabs-h, 0px) - var(--map-chrome-h) - 24px');
    expect(css).toContain('object-fit: contain');
  });
});

/** DOM harness for the arrival and selection effects (classic workspace, or the hex board's frame with `frame`). */
class FocusTarget {
  constructor(private form = false) {}
  closest() { return this.form ? {} : null; }
  focus = vi.fn();
}
function browser({ form = false, preserveFormScroll = false, desktop = true, workspaceTop = 313, mark, svg, selectionToken = 1, tabs, frame, lang = 'en' }: {
  form?: boolean; preserveFormScroll?: boolean; desktop?: boolean; workspaceTop?: number;
  mark?: { top: number; bottom: number; left?: number; right?: number }; svg?: { top: number; bottom: number; height: number }; selectionToken?: number;
  /** Height of the tabs stuck under the game bar (`--tabs-h`); absent before they publish it. */
  tabs?: number;
  /** The hex board's zoom frame (its visible part); the workspace is then zoomable. */
  frame?: FrameStub;
  lang?: keyof typeof labels;
} = {}) {
  const frames: FrameRequestCallback[] = [];
  const scrollTo = vi.fn();
  const active = new FocusTarget(form);
  vi.stubGlobal('Element', FocusTarget);
  vi.stubGlobal('document', { activeElement: active, documentElement: {} });
  vi.stubGlobal('window', {
    innerHeight: 900, scrollY: 0, scrollX: 7, scrollTo,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; },
    cancelAnimationFrame: vi.fn(),
    matchMedia: () => ({ matches: desktop }),
    getComputedStyle: () => ({ getPropertyValue: (name: string) => name === '--topbar-h' ? '93px' : name === '--tabs-h' && tabs !== undefined ? `${tabs}px` : '' }),
  });
  const node = frame ? zoomable(lang, { selectionToken, preserveFormScroll }) : render(lang, 'north', selectionToken, preserveFormScroll);
  (node.props.ref as { current: unknown }).current = { getBoundingClientRect: () => ({ top: workspaceTop }) };
  const column = elements(node, (element) => element.props.className === 'map-workspace-column')[0];
  (column.props.ref as { current: unknown }).current = { querySelector: (selector: string) => {
    if (selector === '.map-zoom-frame') return frame ?? null;
    const box = selector === '.map-svg' ? svg : mark;
    return box ? { getBoundingClientRect: () => box } : null;
  } };
  const runEffects = () => {
    for (const effect of hooks.effects) effect();
    for (const callback of frames) callback(0);
  };
  return { node, scrollTo, active, runEffects, frames };
}

describe('map arrival and keyboard focus with DOM measurements', () => {

  it('reveals the toolbar below the actual sticky topbar on plain desktop arrival without changing focus', () => {
    const { runEffects, scrollTo, active, frames } = browser();
    expect(scrollTo).not.toHaveBeenCalled();
    runEffects();
    expect(frames).toHaveLength(2);
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 208, left: 7, behavior: 'auto' });
    expect(active.focus).not.toHaveBeenCalled();
  });

  it('lands the toolbar below the game bar and the tabs stuck under it, and keeps the mark clear of both', () => {
    const { runEffects, scrollTo } = browser({ tabs: 41, selectionToken: 0, mark: { top: 1500, bottom: 1530 } });
    runEffects();
    // 313 − (93 + 41) − 12: the tabs push the toolbar 41 px lower than with the game bar alone (208).
    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 167, left: 7, behavior: 'auto' });
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 642, left: 7, behavior: 'auto' });
  });

  it.each([[undefined, 0], [41, 2]] as const)('a mark at 120 px is clear of the game bar alone, not of the tabs under it (tabs %s px)', (tabs, calls) => {
    // 93 + 12 = 105 ≤ 120 without stuck tabs; 93 + 41 + 12 = 146 > 120 with them: the toolbar and the mark come down.
    const { runEffects, scrollTo } = browser({ tabs, workspaceTop: 105, mark: { top: 120, bottom: 140 } });
    runEffects();
    expect(scrollTo).toHaveBeenCalledTimes(calls);
  });

  it('preserves an intent form destination after its focus effect has run', () => {
    const { runEffects, scrollTo, active } = browser({ form: true, preserveFormScroll: true, mark: { top: 950, bottom: 980 } });
    runEffects();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(active.focus).not.toHaveBeenCalled();
  });

  it('reveals the complete country on plain arrival with a selected product and auto-focused sheet form', () => {
    const { runEffects, scrollTo, active } = browser({ form: true });
    runEffects();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 208, left: 7, behavior: 'auto' });
    expect(active.focus).not.toHaveBeenCalled();
  });

  it('reveals an ordinarily selected mark even when the sheet focuses its form, while retaining that focus', () => {
    const { runEffects, scrollTo, active } = browser({ form: true, workspaceTop: 105, mark: { top: 920, bottom: 960 } });
    runEffects();
    // The toolbar is already aligned; selection visibility is corrected without moving the focus.
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 72, left: 7, behavior: 'auto' });
    expect(active.focus).not.toHaveBeenCalled();
  });

  it('reveals the default-selected mark on arrival too, after the toolbar (a southern factory stays in view)', () => {
    // First selection (token 0), mark far below the fold: the toolbar is aligned first, then the mark is revealed.
    const { runEffects, scrollTo, active, frames } = browser({ selectionToken: 0, mark: { top: 1500, bottom: 1530 } });
    runEffects();
    expect(frames).toHaveLength(2);
    expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 208, left: 7, behavior: 'auto' });
    expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 642, left: 7, behavior: 'auto' });
    expect(active.focus).not.toHaveBeenCalled();
  });

  it('keeps existing small-screen arrival behavior', () => {
    const { runEffects, scrollTo } = browser({ desktop: false });
    runEffects();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('only scrolls the selected mark when the toolbar is already visible', () => {
    const { runEffects, scrollTo, active } = browser({ workspaceTop: 105, mark: { top: 920, bottom: 960 } });
    runEffects();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 72, left: 7, behavior: 'auto' });
    expect(active.focus).not.toHaveBeenCalled();
  });

  it('corrects sheet scroll anchoring to keep the entire fitted country visible even when its selected mark is visible', () => {
    const { runEffects, scrollTo, active } = browser({ workspaceTop: 105,
      mark: { top: 500, bottom: 520 }, svg: { top: 376, bottom: 904, height: 528 } });
    runEffects();
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 16, left: 7, behavior: 'auto' });
    expect(active.focus).not.toHaveBeenCalled();
  });

  it('falls back to the mark when the SVG cannot fit within the usable viewport', () => {
    const { runEffects, scrollTo } = browser({ workspaceTop: 105,
      mark: { top: 500, bottom: 520 }, svg: { top: 0, bottom: 1200, height: 1200 } });
    runEffects();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('moves Escape focus out of content being hidden and onto the reopening button without scrolling', () => {
    const { node } = browser({ form: true });
    const button = foldButton(node);
    const focus = vi.fn();
    (button.props.ref as { current: unknown }).current = { focus };
    const content = elements(node, (element) => element.props.className === 'map-workspace-sheet-content')[0];
    (content.props.ref as { current: unknown }).current = { contains: () => true };
    const onKey = elements(node, (element) => element.type === 'aside')[0].props.onKeyDown as (event: KeyboardEvent<HTMLElement>) => void;
    onKey({ key: 'Escape', currentTarget: { contains: () => true }, target: {}, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as KeyboardEvent<HTMLElement>);
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(renderToStaticMarkup(render('en'))).toContain('map-workspace-folded');
  });
});

describe('sheet form focus without page displacement', () => {
  function targetInSheet(desktop = true) {
    const scrollTo = vi.fn();
    vi.stubGlobal('window', { matchMedia: () => ({ matches: desktop }), scrollTo });
    const sheet = { scrollTop: 32, getBoundingClientRect: () => ({ top: 105 }) };
    const target = {
      closest: vi.fn(() => sheet),
      getBoundingClientRect: () => ({ top: 289 }),
      scrollIntoView: vi.fn(), focus: vi.fn(),
    };
    return { target, sheet, scrollTo };
  }

  it('scrolls only the desktop sheet to its selected form and focuses without changing page scroll', () => {
    const { target, sheet, scrollTo } = targetInSheet();
    focusMapSheetTarget(target as unknown as HTMLElement);
    expect(target.closest).toHaveBeenCalledWith('.map-workspace-sheet');
    expect(sheet.scrollTop).toBe(208);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(target.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it('keeps the existing page destination for an explicit intent', () => {
    const { target, sheet } = targetInSheet();
    focusMapSheetTarget(target as unknown as HTMLElement, true);
    expect(sheet.scrollTop).toBe(32);
    expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' });
    expect(target.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it('keeps the existing small-screen page scroll', () => {
    const { target, sheet } = targetInSheet(false);
    focusMapSheetTarget(target as unknown as HTMLElement);
    expect(sheet.scrollTop).toBe(32);
    expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' });
    expect(target.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it('falls back to legacy page scrolling for targets outside the common workspace and legacy stubs', () => {
    const { target, sheet } = targetInSheet();
    target.closest.mockReturnValue(null as unknown as typeof sheet);
    focusMapSheetTarget(target as unknown as HTMLElement);
    expect(target.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' });
    const legacy = { scrollIntoView: vi.fn(), focus: vi.fn() };
    focusMapSheetTarget(legacy as unknown as HTMLElement);
    expect(legacy.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: 'start' });
    expect(legacy.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });
});

describe('map size: full width by default, whole country on demand', () => {
  it('offers « Voir tout le pays » and keeps the map at full width until asked', () => {
    const tree = workspace({ selectedKey: null, foldLabel: 'Replier la fiche', reopenLabel: 'Rouvrir la fiche',
      wholeLabel: 'Voir tout le pays', enlargeLabel: 'Agrandir la carte', children: createElement('svg', { className: 'map-svg' }) });
    const toggle = elements(tree, (element) => element.type === 'button')[0];
    expect(toggle.props.children).toBe('Voir tout le pays');
    expect(toggle.props['aria-pressed']).toBeFalsy();
    expect(String((tree as ReactElement<{ className: string }>).props.className)).not.toContain('map-workspace-whole');
  });

  it('keeps the size toggle on its own row, after a stacked toolbar or a one-row one', () => {
    const props = { selectedKey: null, foldLabel: 'Replier la fiche', reopenLabel: 'Rouvrir la fiche', wholeLabel: 'Voir tout le pays',
      enlargeLabel: 'Agrandir la carte', toolbar: createElement('span', { className: 'tool' }, 'Chiffrer pour'), children: createElement('svg', { className: 'map-svg' }) };
    const row = renderToStaticMarkup(workspace({ ...props, inlineToolbar: true }));
    expect(row).toContain('<div class="map-workspace-toolbar map-workspace-toolbar-row"><span class="tool">Chiffrer pour</span></div>'
      + '<div class="map-workspace-view"><button type="button" class="btn tiny ghost map-workspace-view-toggle" aria-pressed="false">Voir tout le pays</button></div>');
    const stacked = renderToStaticMarkup(workspace(props));
    expect(stacked).toContain('<div class="map-workspace-toolbar"><span class="tool">Chiffrer pour</span></div><div class="map-workspace-view"><button');
    // The toolbar, row or not, stays the measured chrome above the map (« Voir tout le pays », the board's frame) and the arrival anchor.
    const css = readFileSync(join(__dirname, '../src/screens/game/city/mapWorkspace.css'), 'utf8');
    expect(css).toContain('.map-workspace-toolbar-row { display: flex; flex-wrap: wrap;');
    // No discovery card heads the row any more: « Vos premiers pas » sits above the tab, not in the map toolbar.
    expect(css).not.toContain('board-tour');
    const source = readFileSync(join(__dirname, '../src/screens/game/city/MapWorkspace.tsx'), 'utf8');
    expect(source).toContain("root.querySelector<HTMLElement>('.map-workspace-toolbar')");
  });

  it('only constrains the map to the window height in the whole-country mode', () => {
    const css = readFileSync(join(__dirname, '../src/screens/game/city/mapWorkspace.css'), 'utf8');
    expect(css).toMatch(/\.map-workspace \.map-workspace-column \.map-svg \{[^}]*height: auto;/);
    expect(css).toMatch(/\.map-workspace\.map-workspace-whole \.map-workspace-column \.map-svg \{[^}]*height: max\(/);
    const source = readFileSync(join(__dirname, '../src/screens/game/city/MapWorkspace.tsx'), 'utf8');
    expect(source).toContain('loadFlag(MAP_WHOLE_KEY)');
    expect(source).toContain('saveFlag(MAP_WHOLE_KEY, !whole)');
  });
});

interface FrameStub {
  getBoundingClientRect: () => { left: number; top: number; right: number; bottom: number; height: number };
  clientLeft: number; clientTop: number; clientWidth: number; clientHeight: number; scrollLeft: number; scrollTop: number;
}
const zoomLabels = (lang: keyof typeof labels): MapZoomLabels => {
  const text = mapWorkspaceMessages(lang);
  return { group: text.zoomGroup, zoomIn: text.zoomIn, zoomOut: text.zoomOut, fit: text.zoomFit, fitAria: text.zoomFitAria };
};
/** The hex board's variant: one-row toolbar and left column, zoom frame, a selected cell and its sheet. */
function zoomable(lang: keyof typeof labels, extra: Partial<Parameters<typeof MapWorkspace>[0]> = {}) {
  return workspace({
    ...labels[lang], selectedKey: 'C5', selectionToken: 1, inlineToolbar: true,
    toolbar: createElement('span', { className: 'tool' }, 'row tools'),
    sidePanelLabel: mapWorkspaceMessages(lang).sidePanel,
    sidePanel: createElement('div', { className: 'hx-side' }, 'side tools'),
    zoom: { aspect: 0.864, labels: zoomLabels(lang) },
    sheet: createElement('p', null, 'sheet'),
    children: createElement('svg', { className: 'map-svg' }),
    ...extra,
  });
}
const media = (wide: boolean) => vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === MAP_SIDE_PANEL_QUERY ? wide : true }) });

describe.each(['fr', 'en'] as const)('hex board in three columns with a zoom frame (%s)', (lang) => {
  const text = mapWorkspaceMessages(lang);

  it('puts the tools in a sticky left column from 1200 px, without the toolbar row', () => {
    media(true);
    const html = renderToStaticMarkup(zoomable(lang));
    expect(MAP_SIDE_PANEL_QUERY).toBe('(min-width: 1200px)');
    // It holds « Mes usines » first, then the board tools.
    expect(text.sidePanel).toBe(lang === 'fr' ? 'Vos usines et outils du plateau' : 'Your factories and board tools');
    expect(html).toContain('<div class="map-workspace map-workspace-zoomable map-workspace-with-side map-workspace-selected" style="--map-aspect:0.864;--map-zoom:1">');
    // At zoom 1 the column cannot fold (the board could not use the width): no « ‹ ».
    expect(html).toContain(`<div class="map-workspace-grid"><aside class="map-workspace-side" aria-label="${text.sidePanel}">`
      + '<div id="map-sheet-workspace-side" class="map-workspace-side-content"><div class="hx-side">side tools</div></div></aside>'
      + '<div class="map-workspace-column"><div class="map-zoom"');
    expect(html).not.toContain('map-workspace-toolbar');
    expect(html).not.toContain('row tools');
    // The sheet stays on the right, after the board.
    expect(html.indexOf('map-workspace-sheet')).toBeGreaterThan(html.indexOf('map-zoom-board'));
    // Without a window (static render), the desktop layout.
    vi.unstubAllGlobals();
    hooks.values = [];
    expect(renderToStaticMarkup(zoomable(lang))).toContain('map-workspace-with-side');
  });

  it('keeps the one-row toolbar above the framed board below 1200 px', () => {
    media(false);
    const html = renderToStaticMarkup(zoomable(lang));
    expect(html).toContain('<div class="map-workspace map-workspace-zoomable map-workspace-selected" style="--map-aspect:0.864;--map-zoom:1">'
      + '<div class="map-workspace-toolbar map-workspace-toolbar-row"><span class="tool">row tools</span></div>');
    expect(html).not.toContain('map-workspace-side');
    expect(html).not.toContain('side tools');
    expect(html).toContain('<div class="map-zoom"');
  });

  it('frames the board with the zoom labels and drops the size toggle, even when « tout le pays » was remembered', () => {
    media(true);
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === MAP_WHOLE_KEY ? '1' : null, setItem: vi.fn() });
    const tree = zoomable(lang, { wholeLabel: 'Voir tout le pays', enlargeLabel: 'Agrandir la carte' });
    const frame = elements(tree, (element) => element.type === MapZoomFrame)[0];
    expect(frame.props.aspect).toBe(0.864);
    expect(frame.props.labels).toEqual(zoomLabels(lang));
    const html = renderToStaticMarkup(tree);
    expect(html).not.toContain('map-workspace-view');
    expect(html).not.toContain('map-workspace-whole');
    // The classic map keeps its remembered toggle.
    hooks.values = [];
    const classic = renderToStaticMarkup(workspace({ ...labels[lang], selectedKey: null, wholeLabel: 'Voir tout le pays', enlargeLabel: 'Agrandir la carte',
      children: createElement('svg', { className: 'map-svg' }) }));
    expect(classic).toContain('map-workspace-whole');
    expect(classic).toContain('aria-pressed="true"');
    expect(classic).not.toContain('map-zoom');
  });

  it('measures only what sits above the frame as chrome: the toolbar row, nothing in three columns', () => {
    const properties = new Map<string, string>();
    vi.stubGlobal('window', { innerHeight: 864, addEventListener: vi.fn(), removeEventListener: vi.fn(), matchMedia: () => ({ matches: true }) });
    const measure = (frameTop: number) => {
      hooks.layout = [];
      const tree = zoomable(lang);
      (tree.props.ref as { current: unknown }).current = {
        getBoundingClientRect: () => ({ top: 120 }), querySelector: () => null,
        style: { setProperty: (name: string, value: string) => properties.set(name, value) },
      };
      const column = elements(tree, (element) => element.props.className === 'map-workspace-column')[0];
      (column.props.ref as { current: unknown }).current = {
        getBoundingClientRect: () => ({ top: frameTop, height: 700 }),
        querySelector: (selector: string) => selector === '.map-zoom' ? {
          getBoundingClientRect: () => ({ top: frameTop, height: 690 }),
          querySelector: (inner: string) => inner === '.map-zoom-frame' ? { offsetWidth: 600, clientWidth: frameTop === 120 ? 600 : 583 } : null,
        } : selector === '.map-svg' ? { getBoundingClientRect: () => ({ height: 1200 }) } : null,
      };
      for (const effect of hooks.layout) effect();
    };
    measure(120);
    expect(properties.get('--map-viewport-h')).toBe('864px');
    expect(properties.get('--map-chrome-h')).toBe('0px');
    // At zoom 1 the frame has no scrollbar.
    expect(properties.get('--map-zoom-scrollbar')).toBe('0px');
    measure(198.4);
    expect(properties.get('--map-chrome-h')).toBe('79px');
    // Zoomed in, its vertical scrollbar: the folded column's board track leaves room for it.
    expect(properties.get('--map-zoom-scrollbar')).toBe('17px');
  });
});

describe('hex board frame: selection reveal and page scroll', () => {
  const frameAt = (): FrameStub => ({
    getBoundingClientRect: () => ({ left: 300, top: 105, right: 900, bottom: 799, height: 694 }),
    clientLeft: 0, clientTop: 0, clientWidth: 600, clientHeight: 694, scrollLeft: 40, scrollTop: 60,
  });

  it.each(['fr', 'en'] as const)('scrolls the zoomed frame to a cell selected from outside, never the page (%s)', (lang) => {
    const frame = frameAt();
    const { runEffects, scrollTo, active } = browser({ frame, lang, workspaceTop: 105, mark: { left: 1200, top: 1500, right: 1240, bottom: 1546 } });
    runEffects();
    // Out of view: its centre comes to the frame's centre; the fitted frame already fits under the bars.
    expect([frame.scrollLeft, frame.scrollTop]).toEqual([40 + 620, 60 + 1071]);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(active.focus).not.toHaveBeenCalled();
  });

  it('leaves the frame alone for a visible cell, and still reveals the cell of a requested form', () => {
    const visible = frameAt();
    browser({ frame: visible, workspaceTop: 105, mark: { left: 500, top: 300, right: 540, bottom: 346 } }).runEffects();
    expect([visible.scrollLeft, visible.scrollTop]).toEqual([40, 60]);
    hooks.effects = [];
    const intent = frameAt();
    const { runEffects, scrollTo } = browser({ frame: intent, form: true, preserveFormScroll: true, workspaceTop: 105,
      mark: { left: -300, top: 400, right: -260, bottom: 446 } });
    runEffects();
    expect(intent.scrollLeft).toBe(40 - 880);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('brings the fitted frame back under the bars when the page moved, instead of chasing the cell', () => {
    const frame = { ...frameAt(), getBoundingClientRect: () => ({ left: 300, top: 40, right: 900, bottom: 734, height: 694 }) };
    const { runEffects, scrollTo } = browser({ frame, workspaceTop: 105, mark: { left: 500, top: 300, right: 540, bottom: 346 } });
    runEffects();
    // 40 − (93 + 12) = −65: the whole frame, not just the cell, comes back into view.
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 7, behavior: 'auto' });
  });

  it('lays out three columns: the sheet served first (360 to 520 px), the left column the rest (280 to 400 px), centred', () => {
    const css = readFileSync(join(__dirname, '../src/screens/game/city/mapWorkspace.css'), 'utf8');
    const wide = css.slice(css.indexOf('@media (min-width: 1200px)'));
    // What the board leaves (two 20 px gaps) goes to the sheet first, then to the left column; the three tracks are
    // always laid out and centred, so nothing moves when the sheet opens or folds.
    expect(wide).toContain('--map-rest: calc(100% - var(--map-fit-w, 0px) - 40px);');
    expect(wide).toContain('--map-sheet-w: clamp(360px, calc(var(--map-rest) - 280px), 520px);');
    expect(wide).toContain('--map-side-w: clamp(280px, calc(var(--map-rest) - var(--map-sheet-w)), 400px);');
    // The board's track is the fitted width at every zoom: a zoom step moves no column and no zoom button.
    expect(wide).toMatch(/\.map-workspace-with-side \.map-workspace-grid \{\s*grid-template-columns: var\(--map-side-w\) minmax\(0, var\(--map-fit-w, 1fr\)\) var\(--map-sheet-w\);\s*justify-content: center;/);
    expect(wide).toContain('.map-workspace-with-side .map-workspace-sheet-folded { justify-self: start; }');
    expect(wide).toMatch(/\.map-workspace-side \{[^}]*position: sticky;[^}]*top: calc\(var\(--topbar-h, 65px\) \+ var\(--tabs-h, 0px\) \+ 12px\);[^}]*overflow-y: auto;/);
    expect(css).not.toContain('.map-workspace-zoomable { --map-board-w');
    // The classic map keeps its two columns and its size toggle rules.
    expect(css).toContain('.map-workspace-selected .map-workspace-grid { grid-template-columns: minmax(0, 1fr) 330px; }');
    expect(css).not.toContain('map-workspace-toolbar-row > .map-workspace-view-toggle');
  });
});

describe.each(['fr', 'en'] as const)('hex board left column: folding while zoomed in (%s)', (lang) => {
  const text = mapSideMessages(lang);
  const sideFold = { foldLabel: text.foldSide, reopenText: text.reopenSide, reopenLabel: text.reopenSideAria,
    strip: createElement('p', { className: 'map-side-strip' }, 'colour key') };
  function store(initial: Record<string, string>) {
    const values = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    return values;
  }
  const button = (tree: ReactNode, className: string) => elements(tree, (element) => element.type === 'button' && element.props.className === className)[0];
  const asideOf = (tree: ReactNode) => elements(tree, (element) => element.type === 'aside' && String(element.props.className).includes('map-workspace-side'))[0];
  const frameOf = (tree: ReactNode) => elements(tree, (element) => element.type === MapZoomFrame)[0];

  it('offers « ‹ » only above zoom 1, folds to a strip with a minimal key, remembers it, and reopens by itself at zoom 1', () => {
    media(true);
    const values = store({ [MAP_ZOOM_KEY]: '1' });
    let tree = zoomable(lang, { sideFold });
    expect(button(tree, 'btn tiny ghost map-workspace-side-fold')).toBeUndefined();
    expect(renderToStaticMarkup(tree)).toContain('side tools');
    // The workspace holds the zoom (its grid widens the board with it) and hands it to the frame.
    expect(frameOf(tree).props.zoom).toBe(1);
    expect((tree.props.style as Record<string, unknown>)['--map-zoom']).toBe(1);
    // Zoomed in: « ‹ » at the top of the column.
    hooks.values = [];
    values.set(MAP_ZOOM_KEY, '1.5');
    tree = zoomable(lang, { sideFold });
    expect((tree.props.style as Record<string, unknown>)['--map-zoom']).toBe(1.5);
    const fold = button(tree, 'btn tiny ghost map-workspace-side-fold');
    expect(fold.props['aria-label']).toBe(text.foldSide);
    expect(fold.props['aria-expanded']).toBe(true);
    const content = elements(tree, (element) => element.props.className === 'map-workspace-side-content')[0];
    expect(fold.props['aria-controls']).toBe(content.props.id);
    expect(String(asideOf(tree).props.className)).toContain('map-workspace-side-foldable');
    (fold.props.onClick as () => void)();
    expect(values.get(MAP_SIDE_FOLDED_KEY)).toBe('1');
    tree = zoomable(lang, { sideFold });
    expect(String(tree.props.className)).toContain('map-workspace-side-folded');
    expect(String(asideOf(tree).props.className)).toContain('map-workspace-side-strip');
    const reopen = button(tree, 'btn tiny ghost map-workspace-side-reopen');
    expect([reopen.props['aria-label'], reopen.props['aria-expanded'], reopen.props.children]).toEqual([text.reopenSideAria, false, text.reopenSide]);
    let html = renderToStaticMarkup(tree);
    expect(html).toContain('<p class="map-side-strip">colour key</p>');
    // Folded, the column's content is unmounted (its picture with it).
    expect(html).not.toContain('side tools');
    // Back to zoom 1 (« Ajuster »): the column reopens by itself; the choice waits for the next zoom.
    (frameOf(tree).props.onZoomChange as (zoom: number) => void)(1);
    tree = zoomable(lang, { sideFold });
    expect(String(tree.props.className)).not.toContain('map-workspace-side-folded');
    expect(button(tree, 'btn tiny ghost map-workspace-side-fold')).toBeUndefined();
    expect(renderToStaticMarkup(tree)).toContain('side tools');
    expect(values.get(MAP_SIDE_FOLDED_KEY)).toBe('1');
    (frameOf(tree).props.onZoomChange as (zoom: number) => void)(2);
    tree = zoomable(lang, { sideFold });
    expect(String(tree.props.className)).toContain('map-workspace-side-folded');
    (button(tree, 'btn tiny ghost map-workspace-side-reopen').props.onClick as () => void)();
    expect(values.get(MAP_SIDE_FOLDED_KEY)).toBe('0');
    tree = zoomable(lang, { sideFold });
    html = renderToStaticMarkup(tree);
    expect(html).toContain('side tools');
    expect(button(tree, 'btn tiny ghost map-workspace-side-fold')).toBeDefined();
  });

  it('starts folded when remembered and zoomed in', () => {
    media(true);
    store({ [MAP_ZOOM_KEY]: '2', [MAP_SIDE_FOLDED_KEY]: '1' });
    expect(String(zoomable(lang, { sideFold }).props.className)).toContain('map-workspace-side-folded');
  });

  it('retains folding and reopening across remounts for the visit when storage is blocked', () => {
    media(true);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    let tree = zoomable(lang, { sideFold });
    expect(button(tree, 'btn tiny ghost map-workspace-side-fold')).toBeUndefined();
    (frameOf(tree).props.onZoomChange as (zoom: number) => void)(1.5);
    tree = zoomable(lang, { sideFold });
    (button(tree, 'btn tiny ghost map-workspace-side-fold').props.onClick as () => void)();
    expect(String(zoomable(lang, { sideFold }).props.className)).toContain('map-workspace-side-folded');
    hooks.values = [];
    tree = zoomable(lang, { sideFold });
    // The unsaved zoom returns to 1, but the folded preference remains for the next zoom.
    (frameOf(tree).props.onZoomChange as (zoom: number) => void)(1.5);
    tree = zoomable(lang, { sideFold });
    expect(String(tree.props.className)).toContain('map-workspace-side-folded');
    (button(tree, 'btn tiny ghost map-workspace-side-reopen').props.onClick as () => void)();
    hooks.values = [];
    tree = zoomable(lang, { sideFold });
    (frameOf(tree).props.onZoomChange as (zoom: number) => void)(1.5);
    tree = zoomable(lang, { sideFold });
    expect(String(tree.props.className)).not.toContain('map-workspace-side-folded');
    expect(button(tree, 'btn tiny ghost map-workspace-side-fold')).toBeDefined();
  });

  it('never folds below 1200 px even with a remembered folded preference', () => {
    // Below 1200 px: the toolbar row, no column to fold.
    media(false);
    store({ [MAP_ZOOM_KEY]: '2', [MAP_SIDE_FOLDED_KEY]: '1' });
    const tree = zoomable(lang, { sideFold });
    expect(asideOf(tree)).toBeUndefined();
    expect(String(tree.props.className)).not.toContain('map-workspace-side-folded');
  });

  it('gives the board the freed width once folded: no horizontal panning when the zoomed board fits, no move on a zoom step', () => {
    // 1536 × 740: the fitted board is 503 px; the left column 400 px, the sheet 520 px, two 20 px gaps, 1487 px in all.
    const fitW = 503;
    const folded = 1487 - 40 - 520 - 40;
    // The column open: the frame keeps the fitted width at any zoom (the drawing pans inside it).
    expect(frameWidth(fitW, 1, 1487 - 400 - 520 - 40)).toBe(fitW);
    expect(frameWidth(fitW, 1.5, 1487 - 400 - 520 - 40)).toBe(fitW);
    // Folded at 1.5 the drawing is 751.5 px wide, with a 17 px scrollbar 770.5: it fits, the frame only scrolls down.
    const wide = frameWidth(fitW, 1.5, folded, { folded: true, scrollbar: 17 });
    expect(wide).toBe((fitW - 2) * 1.5 + 2 + 17);
    expect(wide - 2 - 17).toBeGreaterThanOrEqual((fitW - 2) * 1.5);
    expect(frameWidth(fitW, 2.5, folded, { folded: true, scrollbar: 17 })).toBe(folded);
    // The CSS grid follows the same rule, packed to the right while folded so that the sheet and the zoom buttons (at
    // the frame's top right) stay put from one zoom step to the next.
    const css = readFileSync(join(__dirname, '../src/screens/game/city/mapWorkspace.css'), 'utf8');
    expect(css).toMatch(/\.map-workspace-with-side\.map-workspace-side-folded \{\s*--map-side-w: 40px;\s*--map-board-w: calc\(\(var\(--map-fit-w\) - 2px\) \* var\(--map-zoom, 1\) \+ 2px \+ var\(--map-zoom-scrollbar, 0px\)\);\s*\}/);
    expect(css).toMatch(/\.map-workspace-with-side\.map-workspace-side-folded \.map-workspace-grid \{\s*grid-template-columns: var\(--map-side-w\) minmax\(0, var\(--map-board-w\)\) var\(--map-sheet-w\);\s*justify-content: end;\s*\}/);
    expect(css).toContain('.map-workspace-zoomable.map-workspace-side-folded .map-zoom { max-width: var(--map-board-w); }');
  });
});
