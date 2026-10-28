import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { HEXES, hexDistance } from '../src/content/hexes';
import { capitalHexId, candidateHexes, freeBuildableHexes, heatCredit, nearestFreeHex, occupiedHexes, zoneHexId } from '../src/sim/hexes';
import { hexReservePrice } from '../src/sim/hexAuctions';
import { engineDiagnostics } from '../src/sim/sanitize';
import { ZONE_IDS, type Action, type GameState, type ZoneId } from '../src/types';
import { companyOf, config, human } from './helpers';

const terrainHosts = { a: 'quai-port-dividende', b: 'faubourgs-croissance' };
const game = (seed = 42, lang: 'fr' | 'en' = 'fr') => createGame({ ...config(seed, 4), mapMode: 'hex', terrainAssignment: 'host', terrains: terrainHosts, lang }, [human('a', 'crypto'), human('b', 'gadgets')]);
const act = (s: GameState, action: Action) => applyAction(s, 'a', action);
const rejectUnchanged = (s: GameState, action: Action) => {
  const before = JSON.stringify(s), moves = engineDiagnostics.factoryMoves;
  const result = act(s, action);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(s)).toBe(before);
  expect(engineDiagnostics.factoryMoves).toBe(moves);
  return result;
};
const plants = (s: GameState) => Object.values(s.companies).filter((c) => c.status === 'active').flatMap((c) => c.products);

it('keeps NPC positions fixed outside the capital ring and all starting terrains, independent of lobby order', () => {
  const s = game();
  const npcs = Object.values(s.companies).filter((c) => c.npcDefId);
  expect(npcs.slice(0, 2).map((c) => c.products[0].hexId)).toEqual(['A8', 'B8']);
  expect(npcs.slice(0, 2).every((c) => hexDistance(c.products[0].hexId!, capitalHexId) === 2)).toBe(true);
  expect(npcs.every((c) => c.products.every((p) => hexDistance(p.hexId!, capitalHexId) > 1))).toBe(true);
  const startingCells = ['A10', 'H5', 'E16', 'C3', 'K11', 'D17', 'K8', 'A15'];
  expect(npcs.every((c) => !startingCells.includes(c.products[0].hexId!))).toBe(true);
  expect(npcs.slice(2).map((c, i) => hexDistance(c.products[0].hexId!, zoneHexId(['north_east', 'south', 'east'][i] as ZoneId)))).toEqual([1, 1, 1]);
  expect(companyOf(s, 'a').products[0].hexId).toBe('A10');
  expect(companyOf(s, 'b').products[0].hexId).toBe('H5');
  const reversed = createGame({ ...config(42, 4), mapMode: 'hex', terrainAssignment: 'host', terrains: terrainHosts }, [human('b', 'gadgets'), human('a', 'crypto')]);
  expect(companyOf(reversed, 'b').products[0].hexId).toBe('H5');
  expect(companyOf(reversed, 'a').products[0].hexId).toBe('A10');
  expect(Object.values(reversed.companies).filter((c) => c.npcDefId).map((c) => c.products[0].hexId)).toEqual(npcs.map((c) => c.products[0].hexId));
  expect(new Set(plants(s).map((p) => p.hexId)).size).toBe(plants(s).length);
  expect(plants(s).map((p) => p.hexId)).toEqual(plants(game(91, 'en')).map((p) => p.hexId));
  expect(game(42, 'en').rngState).toBe(s.rngState);
});

it('keeps absent and explicit classic modes identical, with no hex fields in their views', () => {
  const players = [human('a')];
  const implicit = createGame(config(7, 4), players);
  const explicit = createGame({ ...config(7, 4), mapMode: 'classic' }, players);
  expect(explicit).toEqual(implicit);
  expect(getPlayerView(implicit, 'a').hexes).toBeUndefined();
  expect(plants(implicit).every((p) => p.hexId === undefined)).toBe(true);
  const c = companyOf(implicit, 'a');
  rejectUnchanged(implicit, { type: 'moveFactory', companyId: c.id, productId: c.products[0].id, hexId: 'H5' });
});

describe('one plant per buildable cell with secret competing bids', () => {
  it.each(['fr', 'en'] as const)('rejects unknown, blocked and occupied destinations before mutation (%s)', (lang) => {
    const s = game(42, lang); const c = companyOf(s, 'a'), p = c.products[0];
    const deposit = HEXES.find((h) => h.deposit)!.id;
    for (const hexId of ['missing', '', '__proto__', null, 17, {}, deposit, p.hexId!, companyOf(s, 'b').products[0].hexId!]) {
      rejectUnchanged(s, { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: hexId as string, bid: 400 });
      rejectUnchanged(s, { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Duplicate', hexId: hexId as string, bid: 400, fallback: 'nearest' });
    }
  });

  it.each(ZONE_IDS)('requires an explicit cell and bid for hex launches and moves, including zone-only %s payloads', (zoneId) => {
    const s = game(); const c = companyOf(s, 'a'); c.cash = 1e6;
    rejectUnchanged(s, { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Regional', zoneId });
    rejectUnchanged(s, { type: 'moveFactory', companyId: c.id, productId: c.products[0].id, zoneId });
  });

  it('allows bids on the same free cell, reserves neither target, and grants exactly one plant after close', () => {
    const s = game(); const a = companyOf(s, 'a'), b = companyOf(s, 'b'); a.cash = b.cash = 1e6;
    const target = freeBuildableHexes(s)[0], origin = a.products[0].hexId!;
    const reserve = hexReservePrice(target);
    expect(act(s, { type: 'moveFactory', companyId: a.id, productId: a.products[0].id, hexId: target, bid: reserve + 100 }).ok).toBe(true);
    expect(applyAction(s, 'b', { type: 'moveFactory', companyId: b.id, productId: b.products[0].id, hexId: target, bid: reserve }).ok).toBe(true);
    expect(occupiedHexes(s)[target]).toBeUndefined(); expect(freeBuildableHexes(s)).toContain(target);
    resolveTurn(s);
    expect(a.products[0].hexId).toBe(target); expect(b.products[0].hexId).toBe('H5');
    expect(freeBuildableHexes(s)).toContain(origin);
    expect(new Set(plants(s).map((p) => p.hexId)).size).toBe(plants(s).length);
  });

  it.each(['fr', 'en'] as const)('refuses explicit launches and moves on a full board without mutation (%s)', (lang) => {
    const s = game(42, lang); const c = companyOf(s, 'a'); c.cash = 1e6;
    const npc = Object.values(s.companies).find((x) => x.npcDefId)!;
    for (const [i, hexId] of freeBuildableHexes(s).entries()) npc.products.push({ ...npc.products[0], id: 'fill' + i, hexId });
    expect(nearestFreeHex(s)).toBeUndefined();
    expect(candidateHexes(s, c.products[0].hexId)).toEqual([c.products[0].hexId]);
    rejectUnchanged(s, { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'No room', hexId: 'C3', bid: 400, fallback: 'nearest' });
    rejectUnchanged(s, { type: 'moveFactory', companyId: c.id, productId: c.products[0].id, hexId: 'C3', bid: 400 });
  });
});

it('exposes public occupancy and positions, while heat and cell estimates remain private', () => {
  const s = game(); const c = companyOf(s, 'a'); const p = c.products[0]; c.cash = 1e6;
  const hexId = freeBuildableHexes(s).find((id) => heatCredit('crypto', id) === 6)!;
  expect(act(s, { type: 'moveFactory', companyId: c.id, productId: p.id, hexId, bid: hexReservePrice(hexId) }).ok).toBe(true);
  resolveTurn(s);
  const mine = getPlayerView(s, 'a'), other = getPlayerView(s, 'b');
  expect(mine.hexes).toMatchObject({ occupied: occupiedHexes(s), free: freeBuildableHexes(s) });
  expect(other.hexes).toEqual(mine.hexes);
  const own = mine.companies.find((x) => x.id === c.id)!.products[0];
  expect(own.hexId).toBe(hexId); expect(own.private!.heatCredit).toBe(6);
  expect(own.private!.hexes!.unitCost[hexId]).toBe(own.private!.estimatedUnitCost);
  expect(own.private!.hexes!.demand![hexId]).toBe(own.private!.estimate!.demand);
  expect(other.companies.find((x) => x.id === c.id)!.products[0].private).toBeUndefined();
  // Theoretical estimates cover occupied parcels too; the independent free list still governs actual placement.
  expect(mine.sectors.every((sector) => Object.hasOwn(sector.launchByHex!, hexId))).toBe(true);
  expect(mine.hexes!.free).not.toContain(hexId);
});
