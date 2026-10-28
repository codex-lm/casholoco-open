import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getPlayerView, type Lang, type PlayerView } from '@muchomoney/core';
import { AmountForm } from '../src/components/AmountForm';
import { HexBoard } from '../src/screens/game/city/HexBoard';
import { HexCellSheet } from '../src/screens/game/city/HexCellSheet';
import { HexMapView } from '../src/screens/game/city/HexMapView';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { HexLaunchForm } from '../src/screens/game/LaunchForms';
import type { MapIntent } from '../src/screens/game/mapIntent';
import { getState, setState, type AppState } from '../src/store';

// The map mounts once per intent. Capture its selected cell and the real header form's props,
// then follow a re-bid through the actual client API to the fake local action transport.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
const transport = vi.hoisted(() => ({ emit: vi.fn(), connected: true }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks.values[index], (next: unknown) => {
        hooks.values[index] = typeof next === 'function' ? (next as (value: unknown) => unknown)(hooks.values[index]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = { current: initial };
      return hooks.values[index];
    },
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
  };
});
vi.mock('../src/hooks/useGame', () => ({ useGame: () => ({ view: data.view!, sectorsById: new Map(data.view!.sectors.map((s) => [s.id, s])) }) }));
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
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T) => selector(actual.getState()) };
});

const originalState = getState();
beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  transport.emit.mockReset();
  transport.emit.mockImplementation((_event: string, _payload: unknown, ack?: (r: unknown) => void) => ack?.({ ok: true }));
  vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => { setState(originalState); vi.unstubAllGlobals(); });

function fixture(lang: Lang) {
  const game = createGame({ seed: 71, totalTurns: 8, turnSeconds: 90, startYear: 2027, mapMode: 'hex', terrainAssignment: 'fair', lang }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  return { game, company, view: getPlayerView(game, 'human') };
}

type Element = ReactElement<Record<string, unknown>>;
function find(node: ReactNode, type: unknown): Element | undefined {
  if (Array.isArray(node)) return node.map((child) => find(child, type)).find(Boolean);
  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  return node.type === type ? node : find([node.props.children, node.props.sheet, node.props.toolbar, node.props.boardHeader, node.props.actions] as ReactNode, type);
}
function renderMap(view: PlayerView, lang: Lang, companyId: string, productId: string, remount = true) {
  if (remount) hooks.values = [];
  hooks.cursor = 0;
  data.view = view;
  setState({ view, lang, lobby: null });
  return HexMapView({ company: view.companies.find((c) => c.id === companyId) ?? null, onSelect: vi.fn(), goTo: vi.fn(), intent: { kind: 'move', productId } });
}
function selectedCell(map: ReactNode): string { return find(map, HexBoard)!.props.selectedId as string; }
function moveProps(map: ReactNode): ComponentProps<typeof HexMoveForm> { return find(map, HexMoveForm)!.props as ComponentProps<typeof HexMoveForm>; }
function withoutBids(view: PlayerView): PlayerView {
  const clean = structuredClone(view);
  clean.self!.hexBids = [];
  return clean;
}

async function rebid(map: ReactNode, amount: number) {
  const props = moveProps(map);
  hooks.values = [];
  hooks.cursor = 0;
  const form = find(HexMoveForm(props), AmountForm)!.props as ComponentProps<typeof AmountForm>;
  expect(form.disabledReason).toBeNull();
  await form.onSubmit(amount);
  return props;
}

describe.each(['fr', 'en'] as const)('pending move navigation (%s)', (lang) => {
  it('opens a live move bid on its destination instead of the best-margin cell, and re-bids there', async () => {
    const { game, company, view } = fixture(lang);
    const productId = company.products[0].id;
    const best = selectedCell(renderMap(view, lang, company.id, productId));
    const target = view.hexes!.free.find((id) => id !== best)!;
    const reserve = view.hexes!.reserve[target];
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId, hexId: target, bid: reserve + 25 }).ok).toBe(true);
    const live = getPlayerView(game, 'human');
    const map = renderMap(live, lang, company.id, productId);
    expect(selectedCell(map)).toBe(target);
    expect(find(map, HexCellSheet)!.props.hexId).toBe(target);
    expect(moveProps(map)).toMatchObject({ company: { id: company.id }, product: { id: productId }, hexId: target });
    await rebid(map, reserve + 50);
    expect(transport.emit).toHaveBeenCalledExactlyOnceWith('game:action', {
      action: { type: 'moveFactory', companyId: company.id, productId, hexId: target, bid: reserve + 50 }, turn: live.turn,
    }, expect.any(Function));
  });

  it('uses the same move intent for live start-up land bids and preserves the start-up fallback on re-bid', async () => {
    const { game, company } = fixture(lang);
    company.status = 'bankrupt';
    company.controllerId = null;
    company.products = [];
    game.players.human.cash = 1_000_000;
    game.turn = 2;
    const before = getPlayerView(game, 'human');
    const first = before.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'foundStartup', name: 'Comeback', sectorId: 'crypto', investment: 30_000,
      hexId: first, bid: before.hexes!.reserve[first], fallback: 'abandon' }).ok).toBe(true);
    let live = getPlayerView(game, 'human');
    const startup = live.companies.find((c) => c.controllerId === 'human')!;
    const productId = startup.products[0].id;
    const best = selectedCell(renderMap(withoutBids(live), lang, startup.id, productId));
    const target = live.hexes!.free.find((id) => id !== best)!;
    const reserve = live.hexes!.reserve[target];
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: startup.id, productId, hexId: target,
      bid: reserve + 25, fallback: 'abandon' }).ok).toBe(true);
    live = getPlayerView(game, 'human');
    expect(live.self!.hexBids!.find((bid) => bid.productId === productId)).toMatchObject({ kind: 'startup', hexId: target });
    const map = renderMap(live, lang, startup.id, productId);
    expect(selectedCell(map)).toBe(target);
    expect(moveProps(map).product.incubator).toBe(true);
    await rebid(map, reserve + 50);
    expect(transport.emit).toHaveBeenCalledExactlyOnceWith('game:action', {
      action: { type: 'moveFactory', companyId: startup.id, productId, hexId: target, bid: reserve + 50, fallback: 'abandon' }, turn: live.turn,
    }, expect.any(Function));
  });

  it('ignores a retained resolved bid and preserves the normal move destination', () => {
    const { game, company, view } = fixture(lang);
    const productId = company.products[0].id;
    const expected = selectedCell(renderMap(view, lang, company.id, productId));
    const target = view.hexes!.free.find((id) => id !== expected)!;
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId, hexId: target, bid: view.hexes!.reserve[target] }).ok).toBe(true);
    const resolved = getPlayerView(game, 'human');
    resolved.self!.hexBids![0].result = { outcome: 'lost', price: 0, bidders: 2 };
    const map = renderMap(resolved, lang, company.id, productId);
    expect(selectedCell(map)).toBe(expected);
    expect(moveProps(map).hexId).toBe(expected);
  });

  it('ignores bids after loss of control and removes an already-open move form', () => {
    const { game, company, view } = fixture(lang);
    const productId = company.products[0].id;
    const best = selectedCell(renderMap(view, lang, company.id, productId));
    const target = view.hexes!.free.find((id) => id !== best && id !== view.hexes!.free[0])!;
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId, hexId: target, bid: view.hexes!.reserve[target] }).ok).toBe(true);
    const live = getPlayerView(game, 'human');
    expect(find(renderMap(live, lang, company.id, productId), HexMoveForm)).toBeDefined();
    company.controllerId = null;
    const lost = getPlayerView(game, 'human');
    expect(lost.companies.find((c) => c.id === company.id)!.private).toBeUndefined();
    // A live view update hides the form immediately, even before queued effects run.
    expect(find(renderMap(lost, lang, company.id, productId, false), HexMoveForm)).toBeUndefined();
    const map = renderMap(lost, lang, company.id, productId);
    expect(find(map, HexMoveForm)).toBeUndefined();
    expect(selectedCell(map)).not.toBe(target);
  });
});

function renderLaunchMap(view: PlayerView, lang: Lang, companyId: string, hexId: string, sectorId?: Extract<MapIntent, { kind: 'launch' }>['sectorId']) {
  hooks.values = [];
  hooks.cursor = 0;
  data.view = view;
  setState({ view, lang, lobby: null });
  return HexMapView({ company: view.companies.find((c) => c.id === companyId) ?? null, onSelect: vi.fn(), goTo: vi.fn(),
    intent: { kind: 'launch', companyId, hexId, ...(sectorId ? { sectorId } : {}) } });
}
function pendingLaunch(lang: Lang) {
  const { game, company, view } = fixture(lang);
  const target = view.hexes!.free[0];
  expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Pending yogurt',
    hexId: target, bid: view.hexes!.reserve[target], fallback: 'nearest' }).ok).toBe(true);
  return { game, company, target, live: getPlayerView(game, 'human') };
}

describe.each(['fr', 'en'] as const)('pending launch navigation (%s)', (lang) => {
  it('restores a live project sector in the map estimate and form with the exact sector-free summary intent', () => {
    const { company, target, live } = pendingLaunch(lang);
    const map = renderLaunchMap(live, lang, company.id, target);
    expect(selectedCell(map)).toBe(target);
    expect(find(map, HexBoard)!.props.reference).toEqual({ kind: 'launch', sectorId: 'yogurts', originHexId: target });
    expect(find(map, HexLaunchForm)!.props).toMatchObject({ company: { id: company.id }, hexId: target, initialSector: 'yogurts' });
    // Neither another cell nor another company inherits this project's sector.
    const otherHex = live.hexes!.free.find((id) => id !== target)!;
    expect(find(renderLaunchMap(live, lang, company.id, otherHex), HexLaunchForm)!.props.initialSector).toBe(live.sectors[0].id);
    expect(find(renderLaunchMap(live, lang, 'other-company', target), HexLaunchForm)!.props.initialSector).toBe(live.sectors[0].id);
  });

  it('keeps an explicitly requested sector ahead of the pending project sector', () => {
    const { company, target, live } = pendingLaunch(lang);
    const map = renderLaunchMap(live, lang, company.id, target, 'scooters');
    expect(selectedCell(map)).toBe(target);
    expect(find(map, HexBoard)!.props.reference).toEqual({ kind: 'launch', sectorId: 'scooters', originHexId: target });
    expect(find(map, HexLaunchForm)!.props.initialSector).toBe('scooters');
  });

  it('ignores resolved launch projects when restoring the form sector', () => {
    const { company, target, live } = pendingLaunch(lang);
    live.self!.hexBids!.find((bid) => bid.kind === 'launch')!.result = { outcome: 'abandoned', price: 0, bidders: 2 };
    const map = renderLaunchMap(live, lang, company.id, target);
    expect(find(map, HexBoard)!.props.reference).toEqual({ kind: 'launch', sectorId: live.sectors[0].id, originHexId: target });
    expect(find(map, HexLaunchForm)!.props.initialSector).toBe(live.sectors[0].id);
  });

  it('ignores pending projects for companies no longer controlled', () => {
    const { game, company, target } = pendingLaunch(lang);
    company.controllerId = null;
    const lost = getPlayerView(game, 'human');
    const map = renderLaunchMap(lost, lang, company.id, target);
    expect(find(map, HexBoard)!.props.reference).toEqual({ kind: 'launch', sectorId: lost.sectors[0].id, originHexId: target });
    expect(find(map, HexLaunchForm)).toBeUndefined();
  });
});
