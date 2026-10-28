import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEXES, SECTORS, createGame, getPlayerView, resolveTurn, type CompanyView, type Lang, type PlayerView } from '@muchomoney/core';
import { readyWhenSaved } from '../src/api';
import { CELL_NOTES_KEY, getCellNotes, loadCellNotes, replaceCellNotes } from '../src/cellNotes';
import { type GameData } from '../src/hooks/useGame';
import { cellNoteMessages } from '../src/i18n/cellNotes';
import { messages } from '../src/i18n';
import { HowToPlay } from '../src/components/HowToPlay';
import { Guide, GuideModal, GuidePanel } from '../src/components/Guide';
import { HelpModal } from '../src/screens/game/HelpModal';
import { HexLaunchForm } from '../src/screens/game/LaunchForms';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { IndustryPanel } from '../src/screens/game/IndustryPanel';
import { TutorialChecklist } from '../src/screens/game/TutorialChecklist';
import type { MapIntent } from '../src/screens/game/mapIntent';
import { HexBoard } from '../src/screens/game/city/HexBoard';
import { CellNote, HexCellSheet } from '../src/screens/game/city/HexCellSheet';
import { HexMapView } from '../src/screens/game/city/HexMapView';
import { MapActivityPalette, type MapActivity } from '../src/screens/game/city/MapActivityPalette';
import { MapGoToMenu, type GoToGroup } from '../src/screens/game/city/HexMapToolbar';
import { CityTab, intentKey } from '../src/screens/game/city/CityTab';
import { MapWorkspace } from '../src/screens/game/city/MapWorkspace';
import { hexMarginValue } from '../src/screens/game/city/hexModel';
import { hexReadabilityMessages } from '../src/i18n/hexReadability';
import { getState, setState } from '../src/store';
import { EMPTY_TUTORIAL, markSeen, nextTutorialStep, tutorialSteps, type TutorialMark, type TutorialState } from '../src/tutorial';
import { markTutorial } from '../src/tutorialStore';
import { tutorialBidIntent, type BoardCell } from '../src/tutorialBoard';

interface EffectSlot { deps?: readonly unknown[]; cleanup?: () => void }
interface HookContext {
  cursor: number;
  values: unknown[];
  effects: Map<number, EffectSlot>;
  scheduled: Map<number, { effect: () => void | (() => void); deps?: readonly unknown[] }>;
}
/** Real render trees and event handlers, with independently mounted hook contexts.
 * Dependency-aware effects distinguish a component arriving from a component merely updating. */
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
    useId: () => `tutorial-test-${hooks.current.cursor++}`,
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  };
});
const data = vi.hoisted(() => ({ current: null as GameData | null }));
vi.mock('../src/hooks/useGame', () => ({ useGame: () => data.current! }));
vi.mock('../src/hooks/useElementWidth', () => ({ useElementWidth: () => [vi.fn(), 680] }));
vi.mock('../src/components/AmountForm', () => ({ AmountForm: () => null }));
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

const initial = getState();
const storage = new Map<string, string>();
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
function flushEffects(name: string) {
  const current = context(name);
  for (const [i, next] of current.scheduled) {
    current.effects.get(i)?.cleanup?.();
    const cleanup = next.effect();
    current.effects.set(i, { deps: next.deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined });
  }
  current.scheduled.clear();
}
function unmount(name: string) {
  for (const slot of hooks.contexts.get(name)?.effects.values() ?? []) slot.cleanup?.();
  hooks.contexts.delete(name);
}
beforeEach(() => {
  vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  storage.clear();
  replaceCellNotes({});
  transport.emit.mockReset();
  transport.emit.mockImplementation((_event: string, _payload: unknown, ack?: (reply: unknown) => void) => ack?.({ ok: true }));
});
afterEach(() => {
  for (const name of hooks.contexts.keys()) unmount(name);
  setState(initial);
  data.current = null;
  replaceCellNotes({});
  vi.unstubAllGlobals();
});

const ROOM = 'TEST';
function fixture(lang: Lang, mapMode: 'hex' | 'classic' = 'hex', network = false) {
  const game = createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode, terrainAssignment: 'fair', ...(network && mapMode === 'hex' ? { industryRules: 'network' as const } : {}) }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Rival', sectorId: 'yogurts', connected: true, color: '#abcdef' },
  ]);
  const own = Object.values(game.companies).find((company) => company.controllerId === 'human')!;
  own.cash = 100_000;
  return { game, own, view: getPlayerView(game, 'human') };
}
/** The game view and the app state; the checklist marks of this test are kept from one render to the next. */
function setup(view: PlayerView, lang: Lang, tutorial: TutorialState = getState().tutorial) {
  const playersById = new Map(view.players.map((player) => [player.id, player]));
  const companiesById = new Map(view.companies.map((company) => [company.id, company]));
  const sectorsById = new Map(view.sectors.map((sector) => [sector.id, sector]));
  data.current = {
    view, me: playersById.get(view.you)!, playersById, companiesById, sectorsById,
    myCompanies: view.companies.filter((company) => company.controllerId === view.you && company.status === 'active'),
    playerName: (id) => playersById.get(id ?? '')?.name ?? messages(lang).common.unknown,
    refPrice: (id) => sectorsById.get(id)?.refPrice ?? SECTORS[id].refPrice,
  };
  setState({ ...initial, view, lobby: null, lang, tutorial, session: { roomCode: ROOM, playerId: view.you, token: 'test-token' } });
}
const seen = () => (getState().tutorial.room === ROOM ? getState().tutorial.seen : {});
const marks = (...list: TutorialMark[]): TutorialState => list.reduce((s, m) => markSeen(s, ROOM, m), EMPTY_TUTORIAL);
function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...elements(node.props.children as ReactNode, predicate),
    ...elements(node.props.toolbar as ReactNode, predicate),
    ...elements(node.props.sheet as ReactNode, predicate),
    ...elements(node.props.actions as ReactNode, predicate),
    ...elements(node.props.boardHeader as ReactNode, predicate),
  ];
}
function child(node: ReactNode, type: unknown) { return elements(node, (element) => element.type === type)[0]; }
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : '';
}
function button(node: ReactNode, label: string) {
  const match = elements(node, (element) => element.type === 'button'
    && (text(element.props.children as ReactNode).trim() === label || element.props['aria-label'] === label))[0];
  expect(match, `button ${label}`).toBeDefined();
  return match;
}
const click = (element: ReactElement<Record<string, unknown>>) => (element.props.onClick as () => void)();
const escaped = (value: string) => renderToStaticMarkup(createElement(Fragment, null, value));
function renderMap(view: PlayerView, lang: Lang, company: CompanyView | null = null, options: Partial<Parameters<typeof HexMapView>[0]> = {}) {
  setup(view, lang);
  return render('map', () => HexMapView({ company, onSelect: () => {}, goTo: () => {}, ...options }));
}
function sheetHtml(map: ReactNode) {
  const sheet = child(map, HexCellSheet);
  return render('sheet', () => renderToStaticMarkup(createElement(HexCellSheet, sheet.props as unknown as Parameters<typeof HexCellSheet>[0])));
}
function select(map: ReactNode, id: string) { (child(map, HexBoard).props.onSelect as (id: string) => void)(id); }
/** The cell of the toolbar's « Aller à › Meilleure case » entry. */
function bestEntry(map: ReactNode): string | undefined {
  const groups = child(map, MapGoToMenu).props.groups as GoToGroup[];
  return groups.find((group) => group.key === 'best')?.entries[0]?.hexId;
}
type ChecklistProps = Parameters<typeof TutorialChecklist>[0];
function checklist(view: PlayerView, lang: Lang, props: Partial<ChecklistProps> = {}) {
  setup(view, lang);
  return render('checklist', () => TutorialChecklist({ goTo: vi.fn(), openMapFor: vi.fn(), tab: 'journal', ...props }));
}
function toggle(node: ReactNode) {
  return elements(node, (element) => element.type === 'button' && element.props.className === 'tutorial-toggle')[0];
}
const expanded = (node: ReactNode) => toggle(node).props['aria-expanded'];

describe.each(['fr', 'en'] as const)('first steps on the hex board (%s)', (lang) => {
  const t = messages(lang);

  it('leaves the map toolbar to the map: no tour card, and the arrival selects my factory without ticking anything', () => {
    const { view } = fixture(lang);
    const map = renderMap(view, lang);
    flushEffects('map');
    const tourLike = elements(map, (element) => typeof element.props.className === 'string' && /board-tour|tutorial/.test(element.props.className));
    expect(tourLike).toEqual([]);
    expect(child(map, MapWorkspace).props.inlineToolbar).toBe(true);
    expect(child(map, MapWorkspace).props).not.toHaveProperty('keepToolbarOnArrival');
    const ownHex = view.companies.find((company) => company.controllerId === view.you)!.products[0].hexId;
    expect(child(map, MapWorkspace).props.selectedKey).toBe(ownHex);
    // A plain arrival is not the player's selection: no tick, no note consumed.
    expect(seen()).toEqual({});
    expect(child(map, HexCellSheet).props.discoveryNote).toBeFalsy();
    expect(getCellNotes()).toEqual({});
  });

  it('ticks « find your factory » and « compare a free cell » only on an explicit selection of such a cell', () => {
    const { view, own } = fixture(lang);
    const mine = view.companies.find((company) => company.id === own.id)!;
    let map = renderMap(view, lang, mine);
    const rival = view.companies.find((company) => company.controllerId === 'rival')!.products[0];
    // Only the actual occupancy and buildability rule counts, not a city label.
    for (const id of [rival.hexId!, HEXES.find((hex) => hex.deposit)!.id, 'off-board']) {
      select(map, id);
      map = renderMap(view, lang, mine);
      expect(seen()).toEqual({});
    }
    select(map, mine.products[0].hexId!);
    map = renderMap(view, lang, mine);
    expect(seen()).toEqual({ ownCell: true });
    select(map, view.hexes!.free.find((id) => !view.terrains?.some((terrain) => terrain.hex === id))!);
    map = renderMap(view, lang, mine);
    expect(seen()).toEqual({ ownCell: true, freeCell: true });
    expect(sheetHtml(map)).toContain(escaped(t.hex.marginLabel));
    // The colours explain themselves in the toolbar: changing them is no longer a step.
    (child(map, HexBoard).props.onLensChange as (lens: string) => void)('transport');
    map = renderMap(view, lang, mine);
    expect(child(map, HexBoard).props.lens).toBe('transport');
    expect(seen()).toEqual({ ownCell: true, freeCell: true });
  });

  it('ticks the optional bid step when the top band opens a legacy launch or move form, and never sends a bid', () => {
    const { view, own } = fixture(lang);
    const mine = view.companies.find((company) => company.id === own.id)!;
    let map = renderMap(view, lang, mine);
    select(map, view.hexes!.free[0]);
    map = renderMap(view, lang, mine);
    expect(seen().bidForm).toBeUndefined();
    expect(child(map, HexCellSheet).props.readOnly).toBe(true);
    expect(child(map, HexCellSheet).props.onLaunch).toBeUndefined();
    click(button(map, hexReadabilityMessages(lang).buildFactory));
    map = renderMap(view, lang, mine);
    flushEffects('map');
    expect(child(map, HexLaunchForm)).toBeDefined();
    expect(seen().bidForm).toBe(true);
    setup(view, lang, EMPTY_TUTORIAL);
    unmount('map'); unmount('sheet');
    map = renderMap(view, lang, mine);
    select(map, view.hexes!.free[0]);
    map = renderMap(view, lang, mine);
    click(button(map, t.hex.moveHere(mine.products[0].name)));
    map = renderMap(view, lang, mine);
    flushEffects('map');
    expect(child(map, HexMoveForm)).toBeDefined();
    expect(seen().bidForm).toBe(true);
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('ticks the optional network bid step only when a land or factory form opens, never for activity selection alone', () => {
    const { view, own } = fixture(lang, 'hex', true);
    const mine = view.companies.find(company => company.id === own.id)!, source = view.hexes!.free[0];
    const text = hexReadabilityMessages(lang);
    for (const mode of ['land', 'factory'] as const) {
      unmount('map');
      setup(view, lang, EMPTY_TUTORIAL);
      let map = renderMap(view, lang, mine);
      select(map, source);
      map = renderMap(view, lang, mine);
      (child(map, MapActivityPalette).props.onPrepare as (activity: MapActivity) => void)({ kind: 'factory', reference: { kind: 'launch', sectorId: 'crypto' } });
      map = renderMap(view, lang, mine);
      flushEffects('map');
      expect(seen().bidForm).toBeUndefined();
      expect(child(map, IndustryPanel)).toBeUndefined();
      click(button(map, mode === 'land' ? text.buyLand : text.buildFactory));
      map = renderMap(view, lang, mine);
      const form = child(map, IndustryPanel);
      expect(form.props).toMatchObject({ hexId: source, actionMode: mode === 'land' ? 'land' : 'fresh' });
      expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, element => element.type === IndustryPanel)).toHaveLength(0);
      flushEffects('map');
      expect(seen().bidForm).toBe(true);
      expect(transport.emit).not.toHaveBeenCalled();
    }
  });

  it('opens La carte from the checklist on my factory or on the best free cell, which counts as selecting it', () => {
    const { view } = fixture(lang);
    const ownHex = view.companies.find((company) => company.controllerId === view.you)!.products[0].hexId!;
    let map = renderMap(view, lang, null, { cellRequest: { cell: 'own', seq: 1 } });
    expect(child(map, HexBoard).props.selectedId).toBe(ownHex);
    expect(seen().ownCell).toBeUndefined();
    flushEffects('map');
    expect(seen()).toEqual({ ownCell: true });
    // My factory sits on its starting terrain: its one-time note explains it.
    expect(child(map, HexCellSheet).props.discoveryNote).toBe('terrain');
    expect(child(map, HexLaunchForm)).toBeUndefined();
    // Not an intent: no form, and the sheet does not take over the page scroll.
    expect(child(map, MapWorkspace).props.preserveFormScroll).toBe(false);
    unmount('map');
    map = renderMap(view, lang, null, { cellRequest: { cell: 'bestFree', seq: 2 } });
    const selected = child(map, HexBoard).props.selectedId as string;
    expect(view.hexes!.free).toContain(selected);
    const reference = child(map, HexBoard).props.reference as Parameters<typeof hexMarginValue>[1];
    const highest = Math.max(...view.hexes!.free.map((id) => hexMarginValue(view, reference, id, true) ?? -Infinity));
    expect(hexMarginValue(view, reference, selected, true)).toBe(highest);
    // The same cell as the toolbar's « Aller à › Meilleure case ».
    expect(bestEntry(map)).toBe(selected);
    flushEffects('map');
    expect(seen()).toEqual({ ownCell: true, freeCell: true });
    expect(child(map, HexLaunchForm)).toBeUndefined();
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('selects a requested cell in place on a map already on screen, keeping its colours, and lets an intent win', () => {
    const { view, own } = fixture(lang);
    const ownHex = view.companies.find((company) => company.id === own.id)!.products[0].hexId!;
    let map = renderMap(view, lang);
    flushEffects('map');
    (child(map, HexBoard).props.onLensChange as (lens: string) => void)('transport');
    const free = view.hexes!.free.find((id) => id !== bestEntry(map))!;
    select(map, free);
    map = renderMap(view, lang);
    expect(child(map, HexBoard).props.selectedId).toBe(free);
    // « Voir mon usine » while the map is shown: the same view selects my factory, nothing is reset.
    map = renderMap(view, lang, null, { cellRequest: { cell: 'own', seq: 1 } });
    flushEffects('map');
    map = renderMap(view, lang, null, { cellRequest: { cell: 'own', seq: 1 } });
    expect(child(map, HexBoard).props.selectedId).toBe(ownHex);
    expect(child(map, HexBoard).props.lens).toBe('transport');
    expect(seen().ownCell).toBe(true);
    // « Voir la meilleure case libre »: the toolbar's best cell for the reference the map prices.
    map = renderMap(view, lang, null, { cellRequest: { cell: 'bestFree', seq: 2 } });
    flushEffects('map');
    map = renderMap(view, lang, null, { cellRequest: { cell: 'bestFree', seq: 2 } });
    expect(child(map, HexBoard).props.selectedId).toBe(bestEntry(map));
    expect(child(map, HexBoard).props.lens).toBe('transport');
    // A request already served is not replayed by a later render.
    select(map, free);
    renderMap(view, lang, null, { cellRequest: { cell: 'bestFree', seq: 2 } });
    flushEffects('map');
    map = renderMap(view, lang, null, { cellRequest: { cell: 'bestFree', seq: 2 } });
    expect(child(map, HexBoard).props.selectedId).toBe(free);
    unmount('map');
    // A view mounted on a decision intent opens its form, whatever cell was asked for before.
    const intent = { kind: 'launch', companyId: own.id, hexId: view.hexes!.free[0], sectorId: 'yogurts' } as const;
    map = renderMap(view, lang, null, { intent, cellRequest: { cell: 'own', seq: 3 } });
    expect(child(map, HexBoard).props.selectedId).toBe(view.hexes!.free[0]);
    expect(child(map, HexLaunchForm)).toBeDefined();
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('passes the requested cell to the board without remounting it', () => {
    const { view } = fixture(lang);
    setup(view, lang);
    const city = render('city', () => CityTab({ company: null, onSelect: vi.fn(), goTo: vi.fn(), openMapFor: vi.fn(), cellRequest: { cell: 'own', seq: 4 } }));
    const board = child(city, HexMapView);
    expect(board.key).toBe(intentKey(null, 0));
    expect(board.props.cellRequest).toEqual({ cell: 'own', seq: 4 });
  });

  it('prepares a launch (or, without a free slot, a move) as the optional step, without sending anything', () => {
    const { view, own } = fixture(lang);
    const intent = tutorialBidIntent(view);
    expect(intent).toEqual({ kind: 'launch', companyId: own.id, sectorId: own.products[0].sectorId });
    let map = renderMap(view, lang, null, { intent });
    flushEffects('map');
    expect(child(map, HexLaunchForm)).toBeDefined();
    expect(seen().bidForm).toBe(true);
    unmount('map');
    const full = structuredClone(view);
    full.companies.find((company) => company.id === own.id)!.maxProducts = 1;
    const move = tutorialBidIntent(full);
    expect(move).toEqual({ kind: 'move', productId: own.products[0].id });
    map = renderMap(full, lang, null, { intent: move });
    expect(child(map, HexMoveForm)).toBeDefined();
    expect(transport.emit).not.toHaveBeenCalled();
    expect(tutorialBidIntent(getPlayerView(fixture(lang).game, 'spectator'))).toBeNull();
  });

  it('shows and remembers each cell-kind explanation once, with no repeat on another cell or in a later game', () => {
    const { view } = fixture(lang);
    const ordinary = view.hexes!.free.filter((id) => !view.terrains?.some((terrain) => terrain.hex === id));
    const kinds = [
      ['terrain', view.terrains![0].hex, view.terrains![1].hex],
      ['free', ordinary[0], ordinary[1]],
      ['deposit', HEXES.filter((hex) => hex.deposit)[0].id, HEXES.filter((hex) => hex.deposit)[1].id],
    ] as const;
    let map = renderMap(view, lang);
    for (const [kind, first, next] of kinds) {
      select(map, first);
      map = renderMap(view, lang);
      expect(child(map, HexCellSheet).props.discoveryNote).toBe(kind);
      expect(sheetHtml(map)).toContain(escaped(cellNoteMessages(lang)[kind]));
      flushEffects('sheet');
      expect(getCellNotes()[kind]).toBe(true);
      // Remembering the note must not erase it while its current sheet is being read.
      map = renderMap(view, lang);
      expect(sheetHtml(map)).toContain(escaped(cellNoteMessages(lang)[kind]));
      select(map, next);
      map = renderMap(view, lang);
      expect(sheetHtml(map)).not.toContain(escaped(cellNoteMessages(lang)[kind]));
      select(map, first);
      map = renderMap(view, lang);
      expect(sheetHtml(map)).not.toContain(escaped(cellNoteMessages(lang)[kind]));
    }
    expect(loadCellNotes()).toEqual({ terrain: true, free: true, deposit: true });
    expect(storage.has(CELL_NOTES_KEY)).toBe(true);
    unmount('map'); unmount('sheet');
    const later = fixture(lang).view;
    map = renderMap(later, lang);
    select(map, later.terrains![0].hex);
    map = renderMap(later, lang);
    expect(sheetHtml(map)).not.toContain(escaped(cellNoteMessages(lang).terrain));
  });

  it('consumes a one-time note only when the observer reports it actually visible', () => {
    const { view } = fixture(lang);
    setup(view, lang);
    for (const kind of ['terrain', 'free', 'deposit'] as const) {
      let signal: ((entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void) | undefined;
      const observe = vi.fn(); const disconnect = vi.fn();
      vi.stubGlobal('IntersectionObserver', class {
        constructor(callback: typeof signal) { signal = callback; }
        observe = observe;
        disconnect = disconnect;
      });
      const note = render('note', () => CellNote({ kind }));
      const element = {};
      (note.props.ref as { current: unknown }).current = element;
      expect(renderToStaticMarkup(note)).toContain(escaped(cellNoteMessages(lang)[kind]));
      expect(renderToStaticMarkup(note)).toContain(`data-cell-note="${kind}"`);
      flushEffects('note');
      expect(observe).toHaveBeenCalledWith(element);
      expect(getCellNotes()[kind]).toBeUndefined();
      signal!([{ isIntersecting: false, intersectionRatio: 0 }]);
      signal!([{ isIntersecting: true, intersectionRatio: 0.25 }]);
      expect(getCellNotes()[kind]).toBeUndefined();
      signal!([{ isIntersecting: true, intersectionRatio: 1 }]);
      expect(getCellNotes()[kind]).toBe(true);
      unmount('note');
      expect(disconnect).toHaveBeenCalled();
    }
  });

  it('leaves the scroll to an explicit bid intent rather than hiding its requested form', () => {
    const { view, own } = fixture(lang);
    const map = renderMap(view, lang, null, { intent: { kind: 'launch', companyId: own.id, hexId: view.hexes!.free[0], sectorId: 'yogurts' } });
    expect(child(map, HexLaunchForm)).toBeDefined();
    expect(child(map, MapWorkspace).props.preserveFormScroll).toBe(true);
  });
});

describe.each(['fr', 'en'] as const)('the « Vos premiers pas » box (%s)', (lang) => {
  const t = messages(lang);

  it('is one line away from the journal, unfolds on demand and stays so across tabs; « keep these settings » ticks without sending', () => {
    const { view } = fixture(lang);
    setup(view, lang, EMPTY_TUTORIAL);
    let box = checklist(view, lang, { tab: 'company' });
    expect(expanded(box)).toBe(false);
    expect(elements(box, (element) => element.props['data-tutorial-next'] === 'journal')).toHaveLength(1);
    expect(elements(box, (element) => element.type === 'li')).toHaveLength(0);
    click(toggle(box));
    box = checklist(view, lang, { tab: 'company' });
    expect(expanded(box)).toBe(true);
    box = checklist(view, lang, { tab: 'stocks' });
    flushEffects('checklist');
    box = checklist(view, lang, { tab: 'stocks' });
    expect(expanded(box)).toBe(true);
    expect(elements(box, (element) => element.type === 'li').map((li) => li.props['data-tutorial-step'])).toEqual(['journal', 'decisions', 'commodities', 'ownCell', 'ready']);
    click(button(box, t.tutorial.keep));
    expect(seen().decisions).toBe(true);
    expect(transport.emit).not.toHaveBeenCalled();
    box = checklist(view, lang, { tab: 'stocks' });
    expect(elements(box, (element) => element.props['data-tutorial-keep'] !== undefined)).toHaveLength(0);
    // Folding it again is remembered too, the journal included.
    click(toggle(box));
    box = checklist(view, lang, { tab: 'journal' });
    flushEffects('checklist');
    expect(expanded(checklist(view, lang, { tab: 'journal' }))).toBe(false);
  });

  it('opens the map on my factory, on the best free cell, or on a launch form, from the board steps', () => {
    const { game, own } = fixture(lang);
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    setup(view, lang, EMPTY_TUTORIAL);
    const openMapFor = vi.fn<(intent: MapIntent) => void>();
    const showBoardCell = vi.fn<(cell: BoardCell) => void>();
    const goTo = vi.fn();
    // Second quarter, first view: the grown list is unfolded whatever the tab.
    const box = checklist(view, lang, { tab: 'markets', openMapFor, showBoardCell, goTo });
    expect(expanded(box)).toBe(true);
    click(button(box, t.tutorial.steps.ownCell.go));
    click(button(box, t.tutorial.steps.freeCell.go));
    expect(showBoardCell.mock.calls).toEqual([['own'], ['bestFree']]);
    // The cells are selections, not intents: only the optional step sends one, a launch form that sends nothing.
    click(button(box, t.tutorial.steps.bidForm.go));
    expect(openMapFor.mock.calls.map(([intent]) => intent)).toEqual([
      { kind: 'launch', companyId: own.id, sectorId: own.products[0].sectorId },
    ]);
    click(button(box, t.tutorial.steps.stocks.go));
    expect(goTo).toHaveBeenCalledWith('stocks');
    expect(goTo).not.toHaveBeenCalledWith('map');
    expect(transport.emit).not.toHaveBeenCalled();
  });

  it('hands the focus to the next step when « keep these settings » or a board cell ticks its own button away', () => {
    const { view } = fixture(lang);
    setup(view, lang, marks('journal'));
    const body = { tag: 'body' };
    const page = { activeElement: body as unknown, body };
    vi.stubGlobal('document', page);
    const targets = new Map<string, { focus: ReturnType<typeof vi.fn> }>();
    const target = (selector: string) => {
      if (!targets.has(selector)) targets.set(selector, { focus: vi.fn() });
      return targets.get(selector)!;
    };
    const root = { querySelector: vi.fn((selector: string) => target(selector)), scrollIntoView: vi.fn(), focus: vi.fn() };
    let box = checklist(view, lang, { tab: 'journal' });
    expect(expanded(box)).toBe(true);
    (box as ReactElement<{ ref: { current: unknown } }>).props.ref.current = root;
    flushEffects('checklist');
    click(button(box, t.tutorial.keep));
    expect(seen().decisions).toBe(true);
    expect(transport.emit).not.toHaveBeenCalled();
    // The button is gone and the browser put the focus back on the page: it moves to the next step's button.
    box = checklist(view, lang, { tab: 'journal' });
    flushEffects('checklist');
    const selectorFor = (id: string) => `[data-tutorial-step="${id}"] button, [data-tutorial-next="${id}"]`;
    const next = nextTutorialStep(tutorialSteps(view, getState().tutorial, ROOM))!;
    expect(root.querySelector).toHaveBeenCalledWith(selectorFor(next.id));
    expect(target(selectorFor(next.id)).focus).toHaveBeenCalledWith({ preventScroll: true });
    // Once only: a later render leaves the focus where it is.
    checklist(view, lang, { tab: 'journal' });
    flushEffects('checklist');
    expect(target(selectorFor(next.id)).focus).toHaveBeenCalledOnce();

    // « Show my factory » from the unfolded list on a map already on screen: the cell ticks, the step's button goes.
    targets.clear();
    const showBoardCell = vi.fn((_cell: BoardCell) => markTutorial('ownCell'));
    box = checklist(view, lang, { tab: 'map', showBoardCell });
    flushEffects('checklist');
    if (!expanded(box)) click(toggle(box));
    box = checklist(view, lang, { tab: 'map', showBoardCell });
    expect(expanded(box)).toBe(true);
    click(button(box, t.tutorial.steps.ownCell.go));
    expect(showBoardCell).toHaveBeenCalledWith('own');
    checklist(view, lang, { tab: 'map', showBoardCell });
    flushEffects('checklist');
    const after = nextTutorialStep(tutorialSteps(view, getState().tutorial, ROOM))!;
    expect(after.id).not.toBe('ownCell');
    expect(target(selectorFor(after.id)).focus).toHaveBeenCalledWith({ preventScroll: true });

    // Focus already elsewhere (the map tab, an opened form): nothing is stolen.
    unmount('checklist');
    setup(view, lang, marks('journal'));
    targets.clear();
    page.activeElement = { tag: 'button' };
    box = checklist(view, lang, { tab: 'journal' });
    (box as ReactElement<{ ref: { current: unknown } }>).props.ref.current = root;
    flushEffects('checklist');
    click(button(box, t.tutorial.keep));
    checklist(view, lang, { tab: 'journal' });
    flushEffects('checklist');
    expect(seen().decisions).toBe(true);
    expect(targets.size).toBe(0);
  });

  it('unfolds on the first view after the close adds steps, then folds to one line on the next tab', () => {
    const { game } = fixture(lang);
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    setup(view, lang, marks('journal', 'decisions', 'commodities', 'ownCell', 'ready'));
    let box = checklist(view, lang, { tab: 'markets' });
    expect(expanded(box)).toBe(true);
    flushEffects('checklist');
    expect(seen().secondQuarter).toBe(true);
    box = checklist(view, lang, { tab: 'markets' });
    expect(expanded(box)).toBe(true);
    checklist(view, lang, { tab: 'company' });
    flushEffects('checklist');
    box = checklist(view, lang, { tab: 'company' });
    expect(expanded(box)).toBe(false);
    expect(elements(box, (element) => element.props['data-tutorial-next'] === 'recap')).toHaveLength(1);
    // Back on the markets tab: still one line, the growth was shown once.
    expect(expanded(checklist(view, lang, { tab: 'markets' }))).toBe(false);
  });

  it('keeps « I’m ready » ticked once clicked, in the following quarter too', async () => {
    const { game, view } = fixture(lang);
    setup(view, lang, EMPTY_TUTORIAL);
    expect(await readyWhenSaved(view.turn)).toBe(true);
    expect(transport.emit).toHaveBeenCalledWith('game:ready', { ready: true, turn: view.turn });
    expect(seen().ready).toBe(true);
    resolveTurn(game);
    const next = getPlayerView(game, 'human');
    expect(next.players.find((p) => p.id === 'human')!.ready).toBe(false);
    expect(tutorialSteps(next, getState().tutorial, ROOM).find((step) => step.id === 'ready')?.done).toBe(true);
  });

  it('retires after the second close whatever is left, and celebrates a finished board list once', () => {
    const { game } = fixture(lang);
    resolveTurn(game);
    const second = getPlayerView(game, 'human');
    setup(second, lang, marks('journal', 'decisions', 'commodities', 'ownCell', 'ready', 'secondQuarter', 'recap', 'freeCell', 'stocks'));
    checklist(second, lang);
    flushEffects('checklist');
    expect(getState().tutorial.hexCompleted).toEqual({ room: ROOM, turn: 2 });
    expect(getState().toasts.filter((toast) => toast.message === t.tutorial.hexAllDone)).toHaveLength(1);
    resolveTurn(game);
    expect(checklist(getPlayerView(game, 'human'), lang)).toBeNull();
    unmount('checklist');
    setup(getPlayerView(game, 'human'), lang, EMPTY_TUTORIAL);
    expect(checklist(getPlayerView(game, 'human'), lang)).toBeNull();
  });

  it('help offers a single « review the first steps » button, which brings the list back unfolded and in view', () => {
    const { view, game } = fixture(lang);
    for (const candidate of [view, fixture(lang, 'classic').view, getPlayerView(game, 'spectator')]) {
      setup(candidate, lang);
      setState({ helpOpen: true });
      const help = render('help', () => HelpModal());
      expect(child(help, GuideModal)).toBeDefined();
      const controls = elements(help, (element) => element.type === 'button');
      expect(controls.map((element) => text(element.props.children as ReactNode))).toEqual([t.help.showChecklist]);
      unmount('help');
    }
    expect(t.help.showChecklist).toBe(lang === 'fr' ? 'Revoir les premiers pas' : 'Revisit the first steps');
    setup(view, lang, { ...EMPTY_TUTORIAL, dismissed: true });
    expect(checklist(view, lang, { tab: 'company' })).toBeNull();
    flushEffects('checklist');
    setState({ helpOpen: true });
    click(button(render('help', () => HelpModal()), t.help.showChecklist));
    expect(getState().helpOpen).toBe(false);
    expect(getState().tutorial.dismissed).toBe(false);
    const box = render('checklist', () => TutorialChecklist({ goTo: vi.fn(), tab: 'company' }));
    const element = { scrollIntoView: vi.fn(), focus: vi.fn() };
    (box as ReactElement<{ ref: { current: unknown } }>).props.ref.current = element;
    flushEffects('checklist');
    expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(expanded(render('checklist', () => TutorialChecklist({ goTo: vi.fn(), tab: 'company' })))).toBe(true);
  });

  it('help also unfolds and brings into view a list that is still on screen but folded to one line', () => {
    const { game } = fixture(lang);
    for (const turn of [1, 2]) {
      if (turn === 2) resolveTurn(game);
      const view = getPlayerView(game, 'human');
      // T1 away from the journal, or T2 once its new steps were shown: one line, the default on most tabs.
      setup(view, lang, turn === 1 ? marks('journal') : marks('journal', 'secondQuarter'));
      let box = checklist(view, lang, { tab: 'company' });
      flushEffects('checklist');
      box = checklist(view, lang, { tab: 'company' });
      expect(box).not.toBeNull();
      expect(expanded(box)).toBe(false);
      const element = { scrollIntoView: vi.fn(), focus: vi.fn() };
      (box as ReactElement<{ ref: { current: unknown } }>).props.ref.current = element;
      setState({ helpOpen: true });
      click(button(render('help', () => HelpModal()), t.help.showChecklist));
      expect(getState().helpOpen).toBe(false);
      expect(getState().tutorialReopen).toBe(1);
      // Rendered as is (the helper's setup would reset the store, help request included).
      const again = () => render('checklist', () => TutorialChecklist({ goTo: vi.fn(), tab: 'company' }));
      box = again();
      flushEffects('checklist');
      expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
      box = again();
      expect(expanded(box)).toBe(true);
      // Served once: the next render does not scroll it back.
      flushEffects('checklist');
      expect(element.scrollIntoView).toHaveBeenCalledOnce();
      unmount('checklist'); unmount('help');
    }
  });

  it('ends « L’essentiel » with the board and a link that opens « Going further › The board », focused', () => {
    const { view } = fixture(lang);
    setup(view, lang);
    let guide = render('guide', () => Guide());
    let panel = child(guide, GuidePanel);
    expect(panel.props.section).toBe('basics');
    const basics = render('panel', () => GuidePanel(panel.props as unknown as Parameters<typeof GuidePanel>[0]));
    const howTo = child(basics, HowToPlay);
    expect(howTo.props.mapMode).toBe('hex');
    const list = HowToPlay(howTo.props as unknown as Parameters<typeof HowToPlay>[0]);
    const last = elements(list, (element) => element.type === 'li').at(-1)!;
    expect(last.props.className).toBe('how-to-play-board');
    click(button(last, t.guide.basicsBoardLink));
    guide = render('guide', () => Guide());
    panel = child(guide, GuidePanel);
    expect(panel.props).toMatchObject({ section: 'more', focusBoard: true });
    const more = render('panel', () => GuidePanel(panel.props as unknown as Parameters<typeof GuidePanel>[0]));
    const board = elements(more, (element) => element.type === 'details')[0];
    expect(board.props['data-guide-topic']).toBe('board');
    expect(board.props.open).toBe(true);
    const summary = elements(board, (element) => element.type === 'summary')[0] as ReactElement<{ ref: { current: unknown } }>;
    const focus = vi.fn();
    summary.props.ref.current = { focus };
    flushEffects('panel');
    expect(focus).toHaveBeenCalledOnce();
    // The classic map keeps its ten lines.
    expect(elements(HowToPlay({ mapMode: 'classic' }), (element) => element.props.className === 'how-to-play-board')).toEqual([]);
  });
});
