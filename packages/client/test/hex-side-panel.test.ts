import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEXES, SECTORS, applyAction, capitalHexId, createGame, getContent, getPlayerView, hexPlaceLabel, resolveTurn, routeBetweenHexes,
  type CompanyView, type HexBid, type Lang, type PlayerView,
} from '@muchomoney/core';
import { type GameData } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { mapSideMessages } from '../src/i18n/mapSide';
import { mapWorkspaceMessages } from '../src/i18n/mapWorkspace';
import { mapFlowText } from '../src/i18n/mapFlows';
import { fmtFor } from '../src/fmt';
import { Modal } from '../src/components/Modal';
import { ProductCard } from '../src/screens/game/ProductCard';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { HexLaunchForm } from '../src/screens/game/LaunchForms';
import { hexCellBid, hexMoveCost } from '../src/screens/game/hexPayback';
import { pendingDecisions } from '../src/screens/game/pendingDecisions';
import { moveLeavesTerrain } from '../src/screens/game/startingTerrain';
import { HexBoard } from '../src/screens/game/city/HexBoard';
import { HexCellSheet } from '../src/screens/game/city/HexCellSheet';
import { HexMapView } from '../src/screens/game/city/HexMapView';
import { HexSidePanel, SIDE_FOLDS, plantPictureFits, type HexSidePanelProps } from '../src/screens/game/city/HexSidePanel';
import { MapFlowDetail } from '../src/screens/game/city/MapFlowDetail';
import { MAP_SIDE_PANEL_QUERY, MapWorkspace } from '../src/screens/game/city/MapWorkspace';
import { MapGoToMenu } from '../src/screens/game/city/HexMapToolbar';
import { bestMoveHex, bestPricedHex, hexMarginValue, type HexReference } from '../src/screens/game/city/hexModel';
import { openingSign } from '../src/screens/game/city/model';
import { forcedIncubatorHex, rankedMoves, sidePanelModel, type SideRow } from '../src/screens/game/city/sidePanelModel';
import { PlantMini } from '../src/screens/game/factories/PlantMini';
import { productFlow } from '../src/screens/game/factories/model';
import { MAP_PLANT_SCENE_HIDDEN_KEY, MAP_SIDE_OPEN_KEY } from '../src/storageFlags';
import { getState, setState } from '../src/store';

// Render trees and handlers without a DOM, one hook context per mounted component (as in tutorial-board-ui.test.ts).
interface HookContext { cursor: number; values: unknown[]; effects: (() => void | (() => void))[] }
const hooks = vi.hoisted(() => ({
  current: { cursor: 0, values: [], effects: [] } as HookContext,
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
    useEffect: (effect: () => void | (() => void)) => { hooks.current.effects.push(effect); },
    useLayoutEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useId: () => `side-test-${hooks.current.cursor++}`,
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
    current = { cursor: 0, values: [], effects: [] };
    hooks.contexts.set(name, current);
  }
  return current;
}
function render<T>(name: string, make: () => T): T {
  hooks.current = context(name);
  hooks.current.cursor = 0;
  hooks.current.effects = [];
  return make();
}
beforeEach(() => {
  vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  storage.clear();
  transport.emit.mockReset();
});
afterEach(() => {
  hooks.contexts.clear();
  setState(initial);
  data.current = null;
  vi.unstubAllGlobals();
});

const ROOM = 'SIDE';
/** Two players on the board; mine has a second product, launched and settled at the first close (one award). */
function fixture(lang: Lang) {
  const game = createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode: 'hex', terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Rival', sectorId: 'yogurts', connected: true, color: '#abcdef' },
  ]);
  return { game, view: getPlayerView(game, 'human') };
}
function setup(view: PlayerView, lang: Lang) {
  const playersById = new Map(view.players.map((player) => [player.id, player]));
  const companiesById = new Map(view.companies.map((company) => [company.id, company]));
  const sectorsById = new Map(view.sectors.map((sector) => [sector.id, sector]));
  data.current = {
    view, me: playersById.get(view.you)!, playersById, companiesById, sectorsById,
    myCompanies: view.companies.filter((company) => company.controllerId === view.you && company.status === 'active'),
    playerName: (id) => playersById.get(id ?? '')?.name ?? messages(lang).common.unknown,
    refPrice: (id) => sectorsById.get(id)?.refPrice ?? SECTORS[id].refPrice,
  };
  // The checklist marks of the test are kept from one render to the next.
  setState({ ...initial, view, lobby: null, lang, tutorial: getState().tutorial, session: { roomCode: ROOM, playerId: view.you, token: 'test-token' } });
}
const mine = (view: PlayerView) => view.companies.find((company) => company.controllerId === view.you)!;
function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...elements(node.props.children as ReactNode, predicate),
    ...elements(node.props.toolbar as ReactNode, predicate),
    ...elements(node.props.sheet as ReactNode, predicate),
    ...elements(node.props.boardHeader as ReactNode, predicate),
    ...elements(node.props.actions as ReactNode, predicate),
  ];
}
function child(node: ReactNode, type: unknown) { return elements(node, (element) => element.type === type)[0]; }
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : '';
}
const escaped = (value: string) => renderToStaticMarkup(createElement(Fragment, null, value));
const click = (element: ReactElement<Record<string, unknown>>) => (element.props.onClick as () => void)();
function renderMap(view: PlayerView, lang: Lang, company: CompanyView | null = null, options: Partial<Parameters<typeof HexMapView>[0]> = {}) {
  setup(view, lang);
  return render('map', () => HexMapView({ company, onSelect: () => {}, goTo: () => {}, ...options }));
}
/** The left column's props, as HexMapView hands them to MapWorkspace. */
function sideProps(map: ReactNode): HexSidePanelProps {
  return (child(map, MapWorkspace).props.sidePanel as ReactElement<HexSidePanelProps>).props;
}
/** The left column's own tree (its cards and rows are plain JSX; its sub-components stay elements). */
function side(map: ReactNode) {
  return render('side', () => HexSidePanel(sideProps(map)) as ReactElement);
}
function sideHtml(map: ReactNode) {
  return render('side', () => renderToStaticMarkup(HexSidePanel(sideProps(map)) as ReactElement));
}
const byData = (node: ReactNode, name: string, value?: string) =>
  elements(node, (element) => element.props[name] !== undefined && (value === undefined || element.props[name] === value));
function sheetHtml(map: ReactNode) {
  return render('sheet', () => renderToStaticMarkup(createElement(HexCellSheet, child(map, HexCellSheet).props as unknown as Parameters<typeof HexCellSheet>[0])));
}

/** My product's cost per lot on a free cell, set so that moving there changes its quarterly margin by `gain`. */
function setGain(view: PlayerView, productId: string, hexId: string, gain: number) {
  const product = mine(view).products.find((p) => p.id === productId)!;
  const unitCost = product.private!.hexes!.unitCost;
  const reference: HexReference = { kind: 'product', productId };
  let low = -1e6, high = 1e7;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    unitCost[hexId] = mid;
    if ((hexMarginValue(view, reference, hexId, true) ?? -Infinity) > gain) low = mid; else high = mid;
  }
  unitCost[hexId] = (low + high) / 2;
}
/** Every free cell costs a fortune per lot: none beats the plant. */
function noBetter(view: PlayerView, productId: string) {
  const product = mine(view).products.find((p) => p.id === productId)!;
  for (const id of view.hexes!.free) product.private!.hexes!.unitCost[id] = 1e6;
}
const bid = (view: PlayerView, extra: Partial<HexBid> & Pick<HexBid, 'kind' | 'hexId'>): HexBid => {
  const company = mine(view);
  const made: HexBid = { companyId: company.id, playerId: view.you, amount: view.hexes!.reserve[extra.hexId], turn: view.turn, ...extra };
  view.self = { ...view.self!, hexBids: [...(view.self?.hexBids ?? []), made] };
  return made;
};
/** Free cells by reserve price: 400 k next to a city, 150 k far from any. */
const freeAt = (view: PlayerView, reserve: number) => view.hexes!.free.filter((id) => view.hexes!.reserve[id] === reserve);

describe('side panel model: the decision line of each product', () => {
  it('names the best free cell that pays back in time, the same gain and payback as that cell sheet’s headline', () => {
    const { view } = fixture('fr');
    const product = mine(view).products[0];
    const reference: HexReference = { kind: 'product', productId: product.id };
    product.private!.hexes!.moveCost = 100;
    noBetter(view, product.id);
    // Two quarters left at most for the far cell to pay back; a city cell would make more, but too late.
    const [far] = freeAt(view, 150);
    const [near] = freeAt(view, 400);
    setGain(view, product.id, near, 60);
    setGain(view, product.id, far, 50);
    const row = sidePanelModel(view, mine(view), reference).rows[0];
    expect(row.decision?.kind).toBe('better');
    const better = row.decision as Extract<SideRow['decision'], { kind: 'better' }>;
    expect(better.hexId).toBe(far);
    const headline = hexCellBid(view, far, reference, 'move', hexMoveCost(product));
    expect(headline.verdict.state).toBe('ok');
    expect([better.gain, better.payback, better.reserve]).toEqual([headline.gain, headline.verdict.atReserve, headline.reserve]);
    // The board's best cell (the colours' first rank) is the city cell, which would pay back too late: named apart.
    expect(bestMoveHex(view, reference)).toBe(near);
    expect(hexCellBid(view, near, reference, 'move', hexMoveCost(product)).verdict.state).toBe('late');
    expect(better.lateBest?.hexId).toBe(near);
    expect(better.lateBest?.gain).toBeCloseTo(60, 3);
    // Terrain perks: the first plant sits on its starting terrain.
    expect(better.perks).toBe(Boolean(moveLeavesTerrain(view, mine(view), product)));
  });

  it('says « too late » only when no free cell pays back in time, and « nothing better » when none beats the plant', () => {
    const { view } = fixture('fr');
    const product = mine(view).products[0];
    const reference: HexReference = { kind: 'product', productId: product.id };
    product.private!.hexes!.moveCost = 100;
    noBetter(view, product.id);
    const [near] = freeAt(view, 400);
    setGain(view, product.id, near, 60);
    let row = sidePanelModel(view, mine(view), reference).rows[0];
    expect(row.decision).toEqual({ kind: 'late', hexId: near, gain: expect.closeTo(60, 3) });
    noBetter(view, product.id);
    row = sidePanelModel(view, mine(view), reference).rows[0];
    expect(row.decision).toEqual({ kind: 'none' });
    expect(rankedMoves(view, reference)).toEqual([]);
  });

  it('skips the cells my other live bids already target', () => {
    const { view } = fixture('fr');
    const product = mine(view).products[0];
    const reference: HexReference = { kind: 'product', productId: product.id };
    noBetter(view, product.id);
    const [first, second] = freeAt(view, 150);
    setGain(view, product.id, first, 80);
    setGain(view, product.id, second, 70);
    expect((sidePanelModel(view, mine(view), reference).rows[0].decision as { hexId: string }).hexId).toBe(first);
    bid(view, { kind: 'launch', hexId: first, project: { id: 'p-launch', sectorId: 'yogurts', name: 'Gazelle' } as HexBid['project'] });
    expect((sidePanelModel(view, mine(view), reference).rows[0].decision as { hexId: string }).hexId).toBe(second);
  });

  it('shows a live bid before any better cell, with its fees and the cell that would do better; an awarded destination first', () => {
    const { view } = fixture('fr');
    const product = mine(view).products[0];
    const reference: HexReference = { kind: 'product', productId: product.id };
    product.private!.hexes!.moveCost = 100;
    noBetter(view, product.id);
    const [best, other] = freeAt(view, 150);
    setGain(view, product.id, best, 80);
    setGain(view, product.id, other, 30);
    // A bid on the best cell: ✉, never « Ailleurs », and nothing beats it.
    const onBest = bid(view, { kind: 'move', hexId: best, productId: product.id });
    let row = sidePanelModel(view, mine(view), reference).rows[0];
    expect(row.decision).toEqual({ kind: 'bid', bid: onBest, fees: 100, beaten: null });
    // A bid on a lower cell: the best one is named with how much better it would do.
    view.self!.hexBids = [];
    const onOther = bid(view, { kind: 'move', hexId: other, productId: product.id });
    row = sidePanelModel(view, mine(view), reference).rows[0];
    expect(row.decision).toEqual({ kind: 'bid', bid: onOther, fees: 100, beaten: { hexId: best, gain: expect.closeTo(50, 3) } });
    // A cell won at the last close wins over everything.
    product.private!.pendingHexId = best;
    row = sidePanelModel(view, mine(view), reference).rows[0];
    expect(row.decision).toEqual({ kind: 'destination', hexId: best });
  });

  it('frames a start-up at the incubator as where to settle, with the State’s deadline or its bid’s fallback, never at the last close', () => {
    const { view } = fixture('fr');
    const product = mine(view).products[0];
    const reference: HexReference = { kind: 'product', productId: product.id };
    Object.assign(product, { incubator: true, hexId: undefined, launchedTurn: view.turn });
    product.private!.hexes!.unitCost[capitalHexId] = product.private!.estimatedUnitCost;
    noBetter(view, product.id);
    // (The capital's own cell is free: for a start-up it is « here », no gain.)
    const [best] = freeAt(view, 400).filter((id) => id !== capitalHexId);
    setGain(view, product.id, best, 65);
    let row = sidePanelModel(view, mine(view), reference).rows[0];
    expect(row.hexId).toBeNull();
    expect(row.decision).toEqual({ kind: 'settle', hexId: best, gain: expect.closeTo(65, 3), reserve: 400 });
    // Launched this quarter: boxed in at the next close.
    expect(row.incubatorNote).toEqual({ kind: 'deadline', due: view.turn + 1, forced: null });
    // Due now: the probable cell, nearest to the capital by road (cells I bid on aside), its reserve and margin there.
    product.launchedTurn = view.turn - 1;
    row = sidePanelModel(view, mine(view), reference).rows[0];
    const forced = forcedIncubatorHex(view, new Set());
    expect(forced).not.toBeNull();
    const distance = routeBetweenHexes(capitalHexId, forced!);
    expect(view.hexes!.free.every((id) => routeBetweenHexes(capitalHexId, id) >= distance)).toBe(true);
    expect(row.incubatorNote).toMatchObject({ kind: 'deadline', due: 'now', forced: { hexId: forced, reserve: view.hexes!.reserve[forced!] } });
    // No « too late » and no « nothing better » for a start-up: with no better cell, no decision line at all.
    noBetter(view, product.id);
    expect(sidePanelModel(view, mine(view), reference).rows[0].decision).toBeNull();
    // A live start-up bid: its fallback instead of the deadline (the State still decides at the deadline if it abandons).
    product.launchedTurn = view.turn;
    const startup = bid(view, { kind: 'startup', hexId: best, productId: product.id, fallback: 'nearest' });
    row = sidePanelModel(view, mine(view), reference).rows[0];
    expect(row.decision).toMatchObject({ kind: 'bid', bid: startup, fees: 0 });
    expect(row.incubatorNote).toEqual({ kind: 'fallbackNearest', hexId: best });
    startup.fallback = 'abandon';
    expect(sidePanelModel(view, mine(view), reference).rows[0].incubatorNote).toEqual({ kind: 'fallbackAbandon', due: view.turn + 1 });
    product.launchedTurn = view.turn - 1;
    expect(sidePanelModel(view, mine(view), reference).rows[0].incubatorNote).toMatchObject({ kind: 'deadline', due: 'now' });
    // The last quarter: the engine boxes no one in.
    expect(sidePanelModel({ ...view, turn: view.config.totalTurns }, mine(view), reference).rows[0].incubatorNote).toBeNull();
    // The last close's own result for this start-up.
    const settled: HexBid = { ...startup, result: { outcome: 'lost', price: 0, bidders: 2 } };
    view.self!.hexBids = [settled];
    expect(sidePanelModel(view, mine(view), reference).rows[0].lastResult).toBe(settled);
  });

  it('has nothing to decide under construction or once the game is over, and keeps free slots, launch bids and commitments', () => {
    const { view } = fixture('fr');
    const company = mine(view);
    const product = company.products[0];
    const reference: HexReference = { kind: 'product', productId: product.id };
    const building = { ...view, companies: view.companies.map((c) => c.id === company.id ? { ...c, products: [{ ...product, comingSoon: true }] } : c) };
    const row = sidePanelModel(building, building.companies.find((c) => c.id === company.id)!, reference).rows[0];
    expect([row.building, row.decision, row.margin, row.status]).toEqual([true, null, null, 'building']);
    const over = sidePanelModel({ ...view, phase: 'ended' }, company, reference);
    expect(over.playing).toBe(false);
    expect(over.rows[0].decision).toBeNull();
    // Free slots: the company's maximum, less its products and its launch projects.
    let model = sidePanelModel(view, company, reference);
    expect(model.freeSlots).toBe((company.maxProducts ?? 4) - company.products.length);
    expect(model.commitments).toBeNull();
    const launch = bid(view, { kind: 'launch', hexId: view.hexes!.free[0], project: { id: 'p-launch', sectorId: 'yogurts', name: 'Gazelle' } as HexBid['project'] });
    model = sidePanelModel(view, company, reference);
    expect(model.launchBids).toEqual([{ bid: launch, fees: view.sectors.find((s) => s.id === 'yogurts')!.launchCost }]);
    // The header's commitment is the one of « Décisions en attente » (bids and fees).
    expect(model.commitments?.total).toBe(pendingDecisions(view).groups.find((g) => g.company.id === company.id)!.total);
    expect(model.commitments!.total).toBeGreaterThan(launch.amount);
  });

  it('gives the hot tip for the acting company only, and drops « Meilleure marge pour » when the tip names the same cell', () => {
    const { view } = fixture('fr');
    const company = mine(view);
    const opening = openingSign(view, company);
    expect(opening.kind).toBe('launch');
    const tip = opening as Extract<typeof opening, { kind: 'launch' }>;
    const launchRef: HexReference = { kind: 'launch', sectorId: tip.sectorId };
    const model = sidePanelModel(view, company, launchRef);
    expect(model.launchTarget).toEqual({ sectorId: tip.sectorId, hexId: bestPricedHex(view, launchRef) });
    const best = bestPricedHex(view, launchRef);
    expect(model.bestLaunch).toEqual(best === tip.hexId ? null : { sectorId: tip.sectorId, hexId: best });
    // Same sector and cell as the tip: one line, the tip's.
    const same = sidePanelModel({ ...view, hexes: { ...view.hexes!, free: [tip.hexId!] } }, company, launchRef);
    expect(same.bestLaunch).toBeNull();
    // A full acting company: no launch tip for it (the sheet would launch for it), whatever another company could do.
    const full = { ...company, maxProducts: company.products.length };
    expect(openingSign({ ...view, companies: view.companies.map((c) => c.id === company.id ? full : c) }, full).kind).not.toBe('launch');
  });
});

/** After the first close: my first plant and a second one (yogurts), one award on the board. */
function twoPlants(lang: Lang) {
  const { game, view: before } = fixture(lang);
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  const hexId = before.hexes!.free[3];
  expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Second plant', hexId, bid: before.hexes!.reserve[hexId], fallback: 'nearest' }).ok).toBe(true);
  resolveTurn(game);
  return { game, view: getPlayerView(game, 'human') };
}
/** The products whose card is expanded (each `li` of the list holds a card or a row). */
const expanded = (tree: ReactNode) => elements(tree, (element) => element.type === 'li' && element.props['data-side-card'] !== undefined
  && elements(element.props.children as ReactNode, (inner) => inner.props.className === 'side-card side-card-open').length > 0)
  .map((element) => element.props['data-side-card']);
const cards = (tree: ReactNode) => elements(tree, (element) => element.type === 'li' && element.props['data-side-card'] !== undefined)
  .map((element) => element.props['data-side-card']);
const openCard = (tree: ReactNode) => elements(tree, (element) => element.props.className === 'side-card side-card-open')[0];
const nameButton = (tree: ReactNode, name: string) => elements(tree, (element) => element.type === 'button' && element.props.className === 'side-card-name'
  && text(element.props.children as ReactNode).includes(name))[0];
const seen = () => (getState().tutorial.room === ROOM ? getState().tutorial.seen : {});
function flush(name: string) {
  for (const effect of context(name).effects) effect();
}
const statusOf = (product: PlayerView['companies'][number]['products'][number]) => productFlow(product).status;

describe.each(['fr', 'en'] as const)('hex board left column « Mes usines » (%s)', (lang) => {
  const t = messages(lang);
  const s = mapSideMessages(lang);
  const fmt = fmtFor(lang);

  it('lists products in company order, expands the tracked one and keeps the graphical reference in sync', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    const [first, second] = company.products;
    let map = renderMap(view, lang, company);
    let tree = side(map);
    expect(cards(tree)).toEqual([first.id, second.id]);
    expect(expanded(tree)).toEqual([first.id]);
    const html = sideHtml(map);
    expect(html.match(/side-card-open/g)).toHaveLength(1);
    // The section is named by its heading (read once, not twice).
    const heading = html.match(/<section class="hx-side-plants" aria-labelledby="([^"]+)">/)![1];
    expect(html).toContain(`<h3 id="${heading}" class="hx-side-heading">${escaped(s.heading)}</h3>`);
    expect(html).not.toContain(`aria-label="${escaped(s.heading)}"`);
    // The card's name says what a click does, the row tracks its product.
    expect(nameButton(tree, first.name).props['aria-pressed']).toBe(true);
    expect(nameButton(tree, second.name).props['aria-label']).toBe(s.track(second.name, t.factories.status[statusOf(second)]));
    click(nameButton(tree, second.name));
    map = renderMap(view, lang, company);
    tree = side(map);
    expect(sideProps(map).picker.trackedKey).toBe(`product:${second.id}`);
    // Expanded in place: nothing reorders.
    expect(cards(tree)).toEqual([first.id, second.id]);
    expect(expanded(tree)).toEqual([second.id]);
    sideProps(map).handlers.track(first.id);
    map = renderMap(view, lang, company);
    expect(expanded(side(map))).toEqual([first.id]);
    // A new plant as the reference: no card expanded.
    sideProps(map).handlers.pickLaunch('crypto', null);
    map = renderMap(view, lang, company);
    expect(expanded(side(map))).toEqual([]);
  });

  it('a row selects its plant instead of another plant, keeps a selected free cell (priced for it), and 📍 always selects the plant', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    const [first, second] = company.products;
    let map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(first.hexId);
    click(nameButton(side(map), second.name));
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(second.hexId);
    const free = view.hexes!.free[0];
    (child(map, HexBoard).props.onSelect as (id: string) => void)(free);
    map = renderMap(view, lang, company);
    click(nameButton(side(map), first.name));
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(free);
    expect(child(map, HexCellSheet).props.reference).toEqual({ kind: 'product', productId: first.id });
    const pin = byData(side(map), 'data-side-plant', first.hexId)[0];
    expect(pin.props['aria-label']).toBe(s.showPlant(hexPlaceLabel(first.hexId!, lang, view.siteSlots)));
    expect(text(pin.props.children as ReactNode)).toBe(`📍 ${first.hexId}`);
    click(pin);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(first.hexId);
  });

  it('« Ailleurs » selects the best viable cell as the theoretical origin, keeps the sheet read-only and ticks « Comparer une case libre »', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    const product = company.products[0];
    product.private!.hexes!.moveCost = 100;
    noBetter(view, product.id);
    const [far] = freeAt(view, 150);
    setGain(view, product.id, far, 50);
    let map = renderMap(view, lang, company);
    const line = byData(openCard(side(map)), 'data-side-decision', 'better')[0];
    const decision = sidePanelModel(view, company, { kind: 'product', productId: product.id }).rows[0].decision as Extract<SideRow['decision'], { kind: 'better' }>;
    expect(text(line.props.children as ReactNode)).toBe(`${(decision.perks ? s.betterPerks : s.better)(fmt.signedMoney(decision.gain), far, decision.payback)} ›`);
    expect(line.props.title).toBe(hexPlaceLabel(far, lang, view.siteSlots));
    expect(seen().freeCell).toBeUndefined();
    click(line);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(far);
    expect(child(map, HexBoard).props.reference).toEqual({ kind: 'product', productId: product.id, originHexId: far });
    expect(child(map, HexCellSheet).props).toMatchObject({ hexId: far, readOnly: true });
    expect(child(map, HexMoveForm)).toBeUndefined();
    expect(elements(map, (element) => element.props['data-hx-map-form'] !== undefined)).toHaveLength(0);
    const sheet = sheetHtml(map);
    expect(sheet).toContain(`data-hex-sheet="${far}"`);
    expect(sheet).toContain(escaped(t.hex.demandLabel));
    expect(sheet).not.toContain(escaped(t.hex.headMove(product.name, fmt.signedMoney(decision.gain))));
    expect(sheet).not.toContain('data-hx-move-here');
    expect(sheet).not.toContain('data-hx-launch-here');
    expect(transport.emit).not.toHaveBeenCalled();
    expect(seen().freeCell).toBe(true);
    // The row of the product, once another is tracked, says it in brief, ↗ doing the same.
    click(nameButton(side(map), company.products[1].name));
    map = renderMap(view, lang, company);
    const arrow = byData(side(map), 'data-side-decision', 'better')[0];
    expect(text(arrow.props.children as ReactNode)).toBe(s.elsewhere(fmt.signedMoney(decision.gain)));
    expect(arrow.props.title).toBe(`${s.elsewhereTitle(fmt.signedMoney(decision.gain))} · ${hexPlaceLabel(far, lang, view.siteSlots)}`);
    // The row's own line: its cell and its margin, labelled.
    const row = elements(side(map), (element) => element.props.className === 'side-row-line')[0];
    expect(text(row.props.children as ReactNode)).toContain(`${product.hexId} · ${s.margin(fmt.signedMoney(product.private!.estimate!.margin))}`);
  });

  it('a cell that would pay back too late is still a link: it selects that cell, priced for the product, no form', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    const product = company.products[0];
    product.private!.hexes!.moveCost = 100;
    noBetter(view, product.id);
    // Only a city cell beats the plant, and too late.
    const [near] = freeAt(view, 400);
    setGain(view, product.id, near, 60);
    let map = renderMap(view, lang, company);
    let late = byData(openCard(side(map)), 'data-side-decision', 'late')[0];
    expect(late.type).toBe('button');
    expect(text(late.props.children as ReactNode)).toBe(s.late(fmt.signedMoney(60), near));
    expect(late.props.title).toBe(hexPlaceLabel(near, lang, view.siteSlots));
    click(late);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(near);
    expect(child(map, HexCellSheet).props.reference).toEqual({ kind: 'product', productId: product.id });
    expect(elements(map, (element) => element.props['data-hx-map-form'] !== undefined)).toHaveLength(0);
    // A far cell that pays back in time: « Ailleurs » first, the late city cell in brief after it, a link too.
    const [far] = freeAt(view, 150);
    setGain(view, product.id, far, 50);
    map = renderMap(view, lang, company);
    late = byData(openCard(side(map)), 'data-side-decision', 'late-also')[0];
    expect(text(late.props.children as ReactNode)).toBe(s.lateAlso(near, fmt.signedMoney(60)));
    expect(s.lateAlso(near, fmt.signedMoney(60))).toContain(lang === 'fr' ? '/trim.' : '/qtr');
    click(byData(openCard(side(map)), 'data-side-decision', 'better')[0]);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(far);
    click(byData(openCard(side(map)), 'data-side-decision', 'late-also')[0]);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(near);
  });

  it('keeps an awarded destination in the last quarter, when nothing else is left to decide', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    const [first, second] = company.products;
    const [won] = freeAt(view, 150);
    // Won at the penultimate close, applied at the last one.
    first.private!.pendingHexId = won;
    const last = { ...view, turn: view.config.totalTurns };
    const model = sidePanelModel(last, company, { kind: 'product', productId: first.id });
    expect(model.playing).toBe(false);
    expect(model.rows[0].decision).toEqual({ kind: 'destination', hexId: won });
    expect(model.rows[1].decision).toBeNull();
    const card = byData(openCard(side(renderMap(last, lang, company))), 'data-side-decision', 'destination')[0];
    expect(text(card.props.children as ReactNode)).toBe(`⚒ ${messages(lang).hex.pendingDestination(hexPlaceLabel(won, lang, view.siteSlots))}`);
    // On a row too, once another product is tracked; still nothing else for the other one.
    let map = renderMap(last, lang, company);
    click(nameButton(side(map), second.name));
    map = renderMap(last, lang, company);
    expect(text(byData(side(map), 'data-side-decision', 'destination')[0].props.children as ReactNode)).toBe(`⚒ ${won}`);
    expect(byData(side(map), 'data-side-decision')).toHaveLength(1);
  });

  it('✉ a live bid opens its move form in the header on its cell; the read-only sheet stays separate', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    const product = company.products[0];
    product.private!.hexes!.moveCost = 100;
    noBetter(view, product.id);
    const [far] = freeAt(view, 150);
    setGain(view, product.id, far, 50);
    const live = bid(view, { kind: 'move', hexId: far, productId: product.id, amount: 180 });
    let map = renderMap(view, lang, company);
    expect(byData(openCard(side(map)), 'data-side-decision', 'better')).toHaveLength(0);
    const line = byData(openCard(side(map)), 'data-side-decision', 'bid')[0];
    expect(text(line.props.children as ReactNode)).toBe(`✉ ${s.bidFees(t.hex.bidKind.move, far, fmt.money(180), fmt.money(100))}`);
    click(line);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(live.hexId);
    const workspace = child(map, MapWorkspace);
    expect(child(workspace.props.boardHeader as ReactNode, HexMoveForm).props).toMatchObject({ company, product, hexId: far });
    expect(child(workspace.props.sheet as ReactNode, HexMoveForm)).toBeUndefined();
    expect(child(map, HexCellSheet).props.readOnly).toBe(true);
    expect(child(workspace.props.boardHeader as ReactNode, HexMoveForm).props).toMatchObject({ hexId: live.hexId });
    expect(elements(workspace.props.boardHeader as ReactNode, element => element.props['data-hx-map-form'] !== undefined)).toHaveLength(1);
    expect(elements(workspace.props.sheet as ReactNode, element => element.props['data-hx-map-form'] !== undefined)).toHaveLength(0);
    expect(transport.emit).not.toHaveBeenCalled();
    // The header counts it with its fees, as « Décisions en attente » does.
    expect(sideHtml(map)).toContain(escaped(s.committed(fmt.money(280))));
  });

  it('warns in the header when the close may not cover the bids', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    bid(view, { kind: 'move', hexId: freeAt(view, 150)[0], productId: company.products[0].id, amount: 300 });
    company.private!.closePlan = { ...company.private!.closePlan!, bids: 600, bidsCovered: 200, shortfall: 50, safeShortfall: 80, bankrupt: false };
    const html = sideHtml(renderMap(view, lang, company));
    expect(html).toContain(`<p class="hx-side-warn warn" role="status">${escaped(t.closeBanner.shortTitle(fmt.money(50)))} · ${escaped(t.closeBanner.bidsCapped(fmt.money(200)))}</p>`);
  });

  it('⚙️ Réglages opens the product modal, « Voir dans Mes usines » the factory', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    const product = company.products[0];
    const openFactory = vi.fn();
    let map = renderMap(view, lang, company, { onOpenFactory: openFactory });
    const button = (label: string) => elements(side(map), (element) => element.type === 'button' && text(element.props.children as ReactNode) === label)[0];
    click(button(t.factories.settings));
    map = renderMap(view, lang, company, { onOpenFactory: openFactory });
    expect(child(map, Modal).props.title).toBe(product.name);
    expect(child(map, ProductCard).props.product).toBe(product);
    click(button(t.city.shell.viewInFactories));
    expect(openFactory).toHaveBeenCalledWith(company.id, product.id);
  });

  it('shows one still miniature, of the tracked product, its texts hidden; « Masquer l’image » is remembered', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    let map = renderMap(view, lang, company);
    expect(child(side(map), PlantMini).props.product).toBe(company.products[0]);
    let html = sideHtml(map);
    expect(html.match(/<svg class="plot-scene/g)).toHaveLength(1);
    expect(html).toContain('<div class="side-plant-scene"><svg class="plot-scene plot-scene-mini"');
    expect(html).not.toMatch(/<animate|scene-bob|scene-led d|scene-beam d/);
    // An idle plant shows its « closed » sign in « Mes usines »; the miniature's CSS hides it (class `scene-closed`).
    company.products[0].private!.production = 0;
    company.products[0].private!.stock = 0;
    expect(sideHtml(map)).toContain('<g class="scene-closed">');
    const toggle = byData(side(map), 'data-side-picture')[0];
    expect(text(toggle.props.children as ReactNode)).toBe(s.hidePicture);
    expect(toggle.props['aria-pressed']).toBeUndefined();
    click(toggle);
    expect(storage.get(MAP_PLANT_SCENE_HIDDEN_KEY)).toBe('1');
    html = sideHtml(map);
    expect(html).not.toContain('plot-scene');
    expect(html).toContain(escaped(s.showPicture));
    // A later visit keeps it hidden.
    hooks.contexts.delete('side');
    map = renderMap(view, lang, company);
    expect(sideHtml(map)).not.toContain('plot-scene');
    // Where it shows: from 300 px of column width, and where the measured column has the height for it (no fixed
    // window height); its unreadable texts are hidden. Before any measure (here, a static render), not shown.
    expect(sideHtml(renderMap(view, lang, company))).toMatch(/^<div class="hx-side">/);
    const css = readFileSync(join(__dirname, '../src/screens/game/city/hexSide.css'), 'utf8');
    expect(css).toContain('.hx-side { container: side / inline-size;');
    expect(css).toMatch(/\.side-plant-scene, \.side-plant-toggle \{ display: none; \}\s*@container side \(min-width: 300px\) \{\s*\.hx-side-picture-room \.side-plant-scene \{ display: block; \}\s*\.hx-side-picture-room \.side-plant-toggle \{ display: inline; \}\s*\}/);
    expect(css).not.toContain('min-height: 800px');
    const mini = readFileSync(join(__dirname, '../src/screens/game/factories/plantMini.css'), 'utf8');
    expect(mini).toMatch(/\.plot-scene-mini \.scene-price,\s*\.plot-scene-mini \.scene-ad,\s*\.plot-scene-mini \.scene-sign,\s*\.plot-scene-mini \.scene-closed \{ display: none; \}/);
    // The foot stays pinned like a map key, except on a short window; pinned, the column keeps room above it for a
    // control reached with Tab (or a card brought into view).
    expect(css).toMatch(/\.hx-side-footer \{ position: sticky; bottom: 0;/);
    expect(css).toContain('.map-workspace-side:has(.hx-side-footer) { scroll-padding-bottom: 120px; }');
    expect(css).toMatch(/@media \(max-height: 639px\) \{\s*\.hx-side-footer \{ position: static; \}\s*\.map-workspace-side:has\(\.hx-side-footer\) \{ scroll-padding-bottom: 0; \}/);
  });

  it('shows the picture where the column measured without it still has its height: 1536 × 740 with one product', () => {
    // A 400 px column: the card is 382 px inside, the picture 146 px high, its border and the card's gap: 151 px.
    const need = Math.ceil(382 * 0.38) + 1 + 4;
    expect(need).toBe(151);
    // 1536 × 740: the column may be 580 px high. One product, folds closed: say 425 px without the picture.
    expect(plantPictureFits({ room: 580, content: 425, picture: 0, extras: 0, width: 382 })).toBe(true);
    // Once shown, the same answer (measured without it): it never hides itself again.
    expect(plantPictureFits({ room: 580, content: 425 + need, picture: need, extras: 0, width: 382 })).toBe(true);
    // A second product (about 48 px more): no room left, the column keeps its rows instead.
    expect(plantPictureFits({ room: 580, content: 473, picture: 0, extras: 0, width: 382 })).toBe(false);
    expect(plantPictureFits({ room: 580, content: 473 + need, picture: need, extras: 0, width: 382 })).toBe(false);
    // 1920 × 940 (780 px): two or three products and the picture.
    expect(plantPictureFits({ room: 780, content: 521, picture: 0, extras: 0, width: 382 })).toBe(true);
    // Exactly the room it needs, and one pixel short.
    expect(plantPictureFits({ room: 580, content: 580 - need, picture: 0, extras: 0, width: 382 })).toBe(true);
    expect(plantPictureFits({ room: 580, content: 580 - need + 1, picture: 0, extras: 0, width: 382 })).toBe(false);
    // An open fold or the flow layer's figures scroll the column; they never take the picture away under the pointer.
    expect(plantPictureFits({ room: 580, content: 425 + need + 260, picture: need, extras: 260, width: 382 })).toBe(true);
    // No card laid out (no tracked product, a strip): nothing to show.
    expect(plantPictureFits({ room: 580, content: 300, picture: 0, extras: 0, width: 0 })).toBe(false);
  });

  it('keeps its folds closed by default, remembers which are open, and survives a blocked storage', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    let map = renderMap(view, lang, company);
    let html = sideHtml(map);
    const summaries = [...html.matchAll(/<details([^>]*)><summary>([^<]*)<\/summary>/g)];
    expect(summaries.map((m) => m[2])).toEqual([escaped(mapFlowText(lang).menu(mapFlowText(lang).modeShort.off)), escaped(mapWorkspaceMessages(lang).goToDeposits),
      escaped(`${mapWorkspaceMessages(lang).goToAwards} (${view.hexes!.results.length})`), escaped(mapWorkspaceMessages(lang).legend)]);
    expect(summaries.some((m) => m[1].includes('open'))).toBe(false);
    const fold = (name: string) => elements(side(map), (element) => element.type === 'details' && element.props['data-side-fold'] === name)[0];
    // The neutral entry names what it selects: the deposit of the most needed commodity, not the fold's own title.
    const depositHex = sideProps(map).depositsHex!;
    const slot = view.siteSlots.find((candidate) => candidate.id === HEXES.find((hex) => hex.id === depositHex)!.deposit)!;
    const neutral = elements(fold('deposits'), (element) => element.type === 'button' && element.props['data-goto-hex'] === depositHex)[0];
    expect(text(neutral.props.children as ReactNode)).toBe(`${s.depositEntry(depositHex, getContent(lang).commodities[slot.commodityId].name)} ›`);
    expect(neutral.props.title).toBe(hexPlaceLabel(depositHex, lang, view.siteSlots));
    click(neutral);
    expect(child(renderMap(view, lang, company), HexBoard).props.selectedId).toBe(depositHex);
    map = renderMap(view, lang, company);
    // A subsidiary already listed on that cell: no second entry for it.
    const owned = { ...view, siteSlots: view.siteSlots.map((candidate) => candidate.id === slot.id ? { ...candidate, companyId: company.id } : candidate) };
    const ownedFold = elements(side(renderMap(owned, lang, company)), (element) => element.type === 'details' && element.props['data-side-fold'] === 'deposits')[0];
    const onCell = elements(ownedFold, (element) => element.type === 'button' && element.props['data-goto-hex'] === depositHex);
    expect(onCell.map((button) => text(button.props.children as ReactNode)))
      .toEqual([`${hexPlaceLabel(depositHex, lang, view.siteSlots)} · ${getContent(lang).commodities[slot.commodityId].name} ›`]);
    map = renderMap(view, lang, company);
    (fold('deposits').props.onToggle as (event: unknown) => void)({ currentTarget: { open: true } });
    const flows = elements(side(map), (element) => typeof element.props.onToggle === 'function' && element.props.mode !== undefined)[0];
    (flows.props.onToggle as (open: boolean) => void)(true);
    expect(JSON.parse(storage.get(MAP_SIDE_OPEN_KEY)!)).toEqual(['flows', 'deposits']);
    expect(SIDE_FOLDS).toEqual(['flows', 'deposits', 'awards', 'legend']);
    hooks.contexts.delete('side');
    map = renderMap(view, lang, company);
    html = sideHtml(map);
    expect(html).toContain('<details class="hx-side-fold map-flow-fold" open="">');
    expect(html).toContain('<details class="hx-side-fold" data-side-fold="deposits" open="">');
    expect(html).toContain('<details class="hx-side-fold" data-side-fold="awards">');
    // A blocked storage: all closed, and the folds still open for this visit.
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    hooks.contexts.delete('side');
    map = renderMap(view, lang, company);
    expect(sideHtml(map)).not.toContain('open=""');
    (fold('awards').props.onToggle as (event: unknown) => void)({ currentTarget: { open: true } });
    expect(sideHtml(map)).toContain('data-side-fold="awards" open=""');
  });

  it('puts the flow layer’s figures in the tracked card from 1200 px, below the board under 1200 px, the toolbar row there unchanged', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    let map = renderMap(view, lang, company);
    sideProps(map).flows.onModeChange('sales');
    map = renderMap(view, lang, company);
    expect(child(map, MapFlowDetail)).toBeUndefined();
    expect(child(openCard(side(map)), MapFlowDetail).props.compact).toBe(true);
    const html = sideHtml(map);
    expect(html).toContain(`<summary>${escaped(mapFlowText(lang).menu(mapFlowText(lang).modeShort.sales))}</summary>`);
    expect(html).toContain('map-flow-detail map-flow-detail-compact');
    // The card names the product: no title in the detail, no second « Mes usines » button.
    expect(html).not.toContain(`<h3>${escaped(company.products[0].name)}`);
    expect(html).not.toContain(`>${escaped(mapFlowText(lang).factories)}</button>`);
    // Under 1200 px: the one-row toolbar and its « Aller à » menu, the detail below the board.
    hooks.contexts.clear();
    vi.stubGlobal('window', { setTimeout, clearTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      matchMedia: (query: string) => ({ matches: query !== MAP_SIDE_PANEL_QUERY }) });
    map = renderMap(view, lang, company);
    (child(map, MapGoToMenu).props.onGo as (hexId: string) => void)(view.hexes!.free[0]);
    map = renderMap(view, lang, company);
    expect(child(map, HexBoard).props.selectedId).toBe(view.hexes!.free[0]);
    sideProps(map).flows.onModeChange('sales');
    map = renderMap(view, lang, company);
    expect(child(map, MapFlowDetail).props.compact).toBe(false);
    const page = render('page', () => renderToStaticMarkup(map as ReactElement));
    expect(page).toContain('<div class="map-workspace-toolbar map-workspace-toolbar-row">');
    expect(page).toContain(`${escaped(mapWorkspaceMessages(lang).goTo)}<span aria-hidden="true"> ▾</span>`);
    expect(page).not.toContain('hx-side');
  });

  it('« Emplacements libres » selects a new plant at the hot tip’s best cell as its origin, without opening a construction form', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    let map = renderMap(view, lang, company);
    const model = sidePanelModel(view, company, null);
    const line = byData(side(map), 'data-side-launch')[0];
    expect(text(line.props.children as ReactNode)).toBe(s.launchLine(model.freeSlots));
    click(line);
    map = renderMap(view, lang, company);
    const reference: HexReference = { kind: 'launch', sectorId: model.launchTarget!.sectorId };
    const origin = bestPricedHex(view, reference);
    expect(child(map, HexBoard).props.reference).toEqual({ ...reference, originHexId: origin });
    expect(child(map, HexBoard).props.selectedId).toBe(origin);
    expect(child(map, HexCellSheet).props).toMatchObject({ hexId: origin, readOnly: true });
    expect(child(map, HexLaunchForm)).toBeUndefined();
    expect(elements(map, element => element.props['data-hx-map-form'] !== undefined)).toHaveLength(0);
    expect(transport.emit).not.toHaveBeenCalled();
    // With a launch reference, the best margin for that sector, unless the hot tip already names that cell.
    const best = byData(side(map), 'data-side-best-launch');
    const tip = model.opening as Extract<typeof model.opening, { kind: 'launch' }>;
    if (bestPricedHex(view, reference) === tip.hexId) expect(best).toHaveLength(0);
    else expect(text(best[0].props.children as ReactNode)).toBe(s.bestLaunch(getContent(lang).sectors[reference.sectorId].name, best[0].props['data-side-best-launch'] as string));
  });

  it('says so without a company, for a start-up at the incubator, and for a company with nothing running', () => {
    const { game, view } = twoPlants(lang);
    const goTo = vi.fn();
    const spectator = getPlayerView(game, 'spectator');
    let map = renderMap(spectator, lang, null, { goTo });
    let html = sideHtml(map);
    for (const label of [t.factories.noneTitle, t.factories.noneBody, t.factories.noneAction]) expect(html).toContain(escaped(label));
    expect(html).not.toContain('hx-side-plants');
    expect(html).not.toContain('data-side-fold="deposits"');
    expect(html).toContain('hx-side-footer');
    click(elements(side(map), (element) => element.type === 'button' && element.props.children === t.factories.noneAction)[0]);
    expect(goTo).toHaveBeenCalledWith('company');
    hooks.contexts.clear();
    // A start-up at the incubator, due at this close: no 📍, the State's deadline with its probable cell.
    const company = mine(view);
    const product = company.products[0];
    Object.assign(product, { incubator: true, hexId: undefined, launchedTurn: view.turn - 1 });
    map = renderMap(view, lang, company);
    const row = sidePanelModel(view, company, { kind: 'product', productId: product.id }).rows[0];
    html = sideHtml(map);
    expect(byData(side(map), 'data-side-plant')).toHaveLength(0);
    const forced = (row.incubatorNote as Extract<SideRow['incubatorNote'], { kind: 'deadline' }>).forced!;
    expect(html).toContain(escaped(s.deadlineNowAt(forced.hexId, fmt.money(forced.reserve), forced.margin === null ? null : fmt.signedMoney(forced.margin))));
    expect(html).not.toContain(escaped(s.none));
    // Where to settle: the cell first, then what it adds over selling from the incubator, and its reserve.
    product.private!.hexes!.unitCost[capitalHexId] = product.private!.estimatedUnitCost;
    noBetter(view, product.id);
    const [best] = freeAt(view, 400).filter((id) => id !== capitalHexId);
    setGain(view, product.id, best, 65);
    const settle = byData(openCard(side(renderMap(view, lang, company))), 'data-side-decision', 'settle')[0];
    expect(text(settle.props.children as ReactNode)).toBe(`${s.settle(fmt.signedMoney(65), best, fmt.money(400))} ›`);
    expect(text(settle.props.children as ReactNode).startsWith(lang === 'fr' ? `Où vous installer : ${best}, ` : `Where to settle: ${best}, `)).toBe(true);
    hooks.contexts.clear();
    // Nothing on the shelves (only launch projects, say): one line, then how to launch.
    const empty = { ...view, companies: view.companies.map((c) => c.id === company.id ? { ...c, products: [] } : c) };
    map = renderMap(empty, lang, empty.companies.find((c) => c.id === company.id)!);
    html = sideHtml(map);
    expect(html).toContain(escaped(s.noProduct));
    expect(html).toContain('data-side-launch');
  });

  it('after the game: « Sans estimation », its short verdict, no margin, nothing to decide', () => {
    const { view } = twoPlants(lang);
    const company = mine(view);
    for (const product of company.products) delete product.private!.estimate;
    const over = { ...view, phase: 'ended' as const };
    const html = sideHtml(renderMap(over, lang, company));
    expect(html).toContain(`<span class="plot-status info">${escaped(t.factories.status.unknown)}</span>`);
    expect(html).toContain(escaped(s.verdict.unknown));
    expect(html).not.toContain('side-card-margin');
    expect(html).not.toContain('data-side-decision');
    expect(html).not.toContain('data-side-launch');
  });
});

describe.each(['fr', 'en'] as const)('hex board left column and the acting company (%s)', (lang) => {
  it('a product of another company I run makes it the acting one; a new acting company re-tracks its first product', () => {
    const { game } = twoPlants(lang);
    const other = Object.values(game.companies).find((c) => c.controllerId !== 'human' && c.status === 'active')!;
    game.players.human.cash = 1e9;
    expect(applyAction(game, 'human', { type: 'buyShares', companyId: other.id, shares: Math.floor(other.sharesOutstanding / 2) + 1 }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    expect(view.companies.filter((c) => c.private)).toHaveLength(2);
    const first = view.companies.find((c) => c.private && c.id !== other.id)!;
    const second = view.companies.find((c) => c.id === other.id)!;
    const onSelect = vi.fn();
    let map = renderMap(view, lang, first, { onSelect });
    // Explicit navigation to the other company's plant: it becomes the acting one (header, cards and forms follow).
    sideProps(map).handlers.showPlant(second.products[0].hexId!);
    expect(onSelect).toHaveBeenCalledWith(second.id);
    // The chip of the other company, while a product of the first one is tracked: its first product is tracked.
    hooks.contexts.clear();
    onSelect.mockClear();
    map = renderMap(view, lang, first, { onSelect });
    flush('map');
    expect(sideProps(map).picker.trackedKey).toBe(`product:${first.products[0].id}`);
    map = renderMap(view, lang, second, { onSelect });
    flush('map');
    map = renderMap(view, lang, second, { onSelect });
    expect(sideProps(map).picker.trackedKey).toBe(`product:${second.products[0].id}`);
    expect(expanded(side(map))).toEqual([second.products[0].id]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('with several companies, what the bids hold sits in the acting company’s chip, after its cash', () => {
    const { game } = twoPlants(lang);
    const other = Object.values(game.companies).find((c) => c.controllerId !== 'human' && c.status === 'active')!;
    game.players.human.cash = 1e9;
    expect(applyAction(game, 'human', { type: 'buyShares', companyId: other.id, shares: Math.floor(other.sharesOutstanding / 2) + 1 }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const second = view.companies.find((c) => c.id === other.id)!;
    const first = view.companies.find((c) => c.private && c.id !== other.id)!;
    const hexId = view.hexes!.free[0];
    view.self = { ...view.self!, hexBids: [...(view.self?.hexBids ?? []),
      { companyId: second.id, playerId: view.you, productId: second.products[0].id, kind: 'move', hexId, amount: view.hexes!.reserve[hexId], turn: view.turn }] };
    const committed = pendingDecisions(view).groups.find((group) => group.company.id === second.id)!.total;
    const s = mapSideMessages(lang);
    const fmt = fmtFor(lang);
    const chips = (acting: CompanyView) => elements(side(renderMap(view, lang, acting)), (element) => element.type === 'button' && element.props.className !== undefined
      && String(element.props.className).startsWith('chip'));
    const pressed = chips(second).find((chip) => chip.props['aria-pressed'] === true)!;
    expect(renderToStaticMarkup(pressed)).toContain(escaped(s.committed(fmt.money(committed))));
    expect(chips(second).filter((chip) => renderToStaticMarkup(chip).includes('data-side-committed'))).toHaveLength(1);
    // The other company has no bid: nothing in its chip, nothing elsewhere in the header.
    hooks.contexts.clear();
    expect(chips(first).some((chip) => renderToStaticMarkup(chip).includes('data-side-committed'))).toBe(false);
  });
});

describe('hex board left column: its texts', () => {
  const strings = (value: unknown): string[] => typeof value === 'string' ? [value]
    : typeof value === 'function' ? strings((value as (...args: unknown[]) => unknown)(...Array.from({ length: value.length }, (_, i) => i === 0 ? 2 : 'X')))
    : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
  it('exist in both languages, French says « vous », English is adapted', () => {
    const fr = strings(mapSideMessages('fr'));
    const en = strings(mapSideMessages('en'));
    expect(fr.length).toBe(en.length);
    for (const value of [...fr, ...en]) expect(value.trim()).not.toBe('');
    expect(en.filter((value) => /[àâçéèêëîïôûùœ«»]/i.test(value))).toEqual([]);
    expect(fr.filter((value) => /\b(?:tu|ton|ta|tes|toi)\b/i.test(value))).toEqual([]);
    expect(fr.filter((value) => /[a-zàâçéèêëîïôûùœ]'[a-zàâçéèêëîïôûùœ]/i.test(value))).toEqual([]);
    expect(mapSideMessages('fr').launchLine(2)).toBe('Emplacements libres : 2 · choisir où lancer ›');
    expect(mapSideMessages('en').launchLine(1)).toBe('1 free slot · pick where to launch ›');
    expect(mapSideMessages('fr').depositsSummary('Gisements et filiales', 1, 2)).toBe('Gisements et filiales · 1 filiale · 2 mises');
    expect(mapSideMessages('en').depositsSummary('Deposits and subsidiaries', 2, 0)).toBe('Deposits and subsidiaries · 2 subsidiaries');
    // The cell first: C4 is where to settle, not where the incubator is.
    expect(mapSideMessages('fr').settle('+65 k€', 'C4', '150 k€')).toBe('Où vous installer : C4, +65 k€/trim. de mieux qu’à l’incubateur (mise à prix 150 k€)');
    expect(mapSideMessages('en').settle('+$65k', 'C4', '$150k')).toBe('Where to settle: C4, +$65k/qtr over the incubator ($150k reserve)');
    // Per quarter, like the other gains of the card.
    expect(mapSideMessages('fr').lateAlso('C4', '+65 k€')).toBe('(C4 ferait +65 k€/trim. mais trop tard)');
    expect(mapSideMessages('en').lateAlso('C4', '+$65k')).toBe('(C4 would do +$65k/qtr, but too late)');
    // The fold's neutral entry, with the French elision.
    expect(mapSideMessages('fr').depositEntry('B3', 'Pétrole')).toBe('Gisement de pétrole (B3)');
    expect(mapSideMessages('fr').depositEntry('B3', 'Acier')).toBe('Gisement d’acier (B3)');
    expect(mapSideMessages('en').depositEntry('B3', 'Oil')).toBe('Oil deposit (B3)');
    expect(mapWorkspaceMessages('fr').sidePanel).toBe('Vos usines et outils du plateau');
    expect(mapWorkspaceMessages('en').sidePanel).toBe('Your factories and board tools');
  });
});
