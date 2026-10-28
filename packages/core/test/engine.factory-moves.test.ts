import { expect, it } from 'vitest';
import { applyAction, createGame, resolveTurn } from '../src/engine';
import { engineDiagnostics } from '../src/sim/sanitize';
import { factoryMoveCost } from '../src/sim/transport';
import { hexReservePrice } from '../src/sim/hexAuctions';
import { freeBuildableHexes } from '../src/sim/hexes';
import { tr } from '../src/sim/i18n';
import type { Action, ZoneId } from '../src/types';
import { bots, companyOf, config, human } from './helpers';

it.each(['fr', 'en'] as const)('refuses hex moves in the final quarter without mutation (%s)', (lang) => {
  const s = createGame({ ...config(3, 2), lang, mapMode: 'hex' }, [human('a')]);
  const c = companyOf(s, 'a'), p = c.products[0]; s.turn = s.config.totalTurns; c.cash = 1e6;
  const before = JSON.stringify(s), moves = engineDiagnostics.factoryMoves;
  const result = applyAction(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: freeBuildableHexes(s)[0], bid: 400 });
  expect(result).toMatchObject({ ok: false, message: tr(s).act.hexBidLastTurn });
  expect(JSON.stringify(s)).toBe(before); expect(engineDiagnostics.factoryMoves).toBe(moves);
});

it('preserves immediate classic moves in the final quarter', () => {
  const s = createGame(config(3, 2), [human('a')]);
  const c = companyOf(s, 'a'), p = c.products[0]; s.turn = s.config.totalTurns; c.cash = 1e6;
  expect(applyAction(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'north' }).ok).toBe(true);
  expect(p.zoneId).toBe('north');
});

it('counts only successful free and paid classic moves and preserves RNG', () => {
  const s = createGame(config(42, 4), [human('a', 'crypto')]); const c = companyOf(s, 'a'), p = c.products[0];
  const before = engineDiagnostics.factoryMoves, rng = s.rngState, cash = c.cash;
  const move = (zoneId: ZoneId): Action => ({ type: 'moveFactory', companyId: c.id, productId: p.id, zoneId });
  const reject = (action: Action) => {
    const stateBefore = JSON.stringify(s), movesBefore = engineDiagnostics.factoryMoves;
    expect(applyAction(s, 'a', action).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(stateBefore); expect(engineDiagnostics.factoryMoves).toBe(movesBefore);
  };
  reject(move('capital')); reject(move('unknown' as ZoneId));
  expect(applyAction(s, 'a', move('north')).ok).toBe(true);
  expect(engineDiagnostics.factoryMoves).toBe(before + 1); expect(c.cash).toBe(cash); expect(s.rngState).toBe(rng);
  reject(move('north'));
  s.turn = 2; const cost = factoryMoveCost(s, p); expect(cost).toBeGreaterThan(0);
  c.cash = cost - 1; reject(move('capital')); c.cash = cost + 100;
  expect(applyAction(s, 'a', move('capital')).ok).toBe(true);
  expect(engineDiagnostics.factoryMoves).toBe(before + 2); expect(c.cash).toBe(100);
  expect(c.turnFlags.specialCharges).toBe(cost); expect(s.rngState).toBe(rng); reject(move('capital'));
});

it('counts hex moves only when the winning move executes, charges land and relocation from the starting quarter', () => {
  const s = createGame({ ...config(42, 4), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'quai-port-dividende', b: 'faubourgs-croissance' } }, [human('a', 'crypto'), human('b', 'gadgets')]);
  const a = companyOf(s, 'a'), b = companyOf(s, 'b'); a.cash = b.cash = 1e6;
  const previous = engineDiagnostics.factoryMoves, rng = s.rngState, cash = a.cash;
  const cost = factoryMoveCost(s, a.products[0]); expect(cost).toBeGreaterThan(0);
  const action: Action = { type: 'moveFactory', companyId: a.id, productId: a.products[0].id, hexId: 'C3', bid: 500 };
  expect(applyAction(s, 'a', action).ok).toBe(true);
  expect(engineDiagnostics.factoryMoves).toBe(previous); expect(a.cash).toBe(cash);
  expect(a.products[0].hexId).toBe('A10'); expect(a.products[0].pendingHexId).toBeUndefined(); expect(s.rngState).toBe(rng);
  expect(applyAction(s, 'b', { type: 'moveFactory', companyId: b.id, productId: b.products[0].id, hexId: 'C3', bid: hexReservePrice('C3') }).ok).toBe(true);
  resolveTurn(s);
  expect(a.products[0].hexId).toBe('C3'); expect(b.products[0].hexId).toBe('H5');
  expect(engineDiagnostics.factoryMoves).toBe(previous + 1);
  expect(a.reports.at(-1)!.specialCharges).toBe(cost);
});

it.each(['classic', 'hex'] as const)('keeps diagnostic counters outside game state and RNG in %s mode', (mapMode) => {
  const previous = engineDiagnostics.factoryMoves;
  try {
    engineDiagnostics.factoryMoves = 0;
    const fixture = { ...config(mapMode === 'hex' ? 1 : 42, 4), mapMode,
      ...(mapMode === 'hex' ? { terrainAssignment: 'random' as const } : {}) };
    const first = createGame(fixture, bots(4)); const moves = engineDiagnostics.factoryMoves;
    if (mapMode === 'classic') expect(moves).toBeGreaterThan(0);
    else expect(moves).toBe(0);
    engineDiagnostics.factoryMoves = 1000;
    const second = createGame(fixture, bots(4));
    expect(engineDiagnostics.factoryMoves).toBe(1000 + moves); expect(second).toEqual(first); expect(second.rngState).toBe(first.rngState);
    expect(second).not.toHaveProperty('factoryMoves'); expect(second).not.toHaveProperty('engineDiagnostics');
  } finally { engineDiagnostics.factoryMoves = previous; }
});
