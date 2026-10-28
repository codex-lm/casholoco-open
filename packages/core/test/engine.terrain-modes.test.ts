import { describe, expect, it } from 'vitest';
import { getContent } from '../src/content';
import { createGame, getPlayerView } from '../src/engine';
import { createGameState } from '../src/sim/create';
import { capitalHexId } from '../src/sim/hexes';
import { next, seedToRngState } from '../src/sim/rng';
import { assignStartingTerrains, terrainValues, variedTerrainAssignment } from '../src/sim/terrainAssignment';
import { SECTOR_IDS, type GameState } from '../src/types';
import { companyOf, config, human } from './helpers';

const defs = getContent('fr').terrains.definitions;
const ids = defs.map((terrain) => terrain.id);

/** Enumerates independently, without branch pruning or spread filtering. */
function candidates(rows: Record<string, number>[], free: string[]): { ids: string[]; floor: number; spread: number }[] {
  if (rows.length === 0) return [];
  const assignments: { ids: string[]; floor: number; spread: number }[] = [];
  const visit = (chosen: string[], remaining: string[]) => {
    if (chosen.length === rows.length) {
      const values = chosen.map((id, index) => rows[index][id]);
      assignments.push({ ids: chosen, floor: Math.min(...values), spread: Math.max(...values) - Math.min(...values) });
      return;
    }
    for (const id of remaining) visit([...chosen, id], remaining.filter((other) => other !== id));
  };
  visit([], free);
  return assignments;
}

describe('fair varied terrain assignment', () => {
  it('draws uniformly from every assignment within 20 k of the exact floor, including the boundary', () => {
    const terrainIds = ['a', 'b', 'c', 'd'];
    for (let count = 1; count <= 4; count++) {
      const rows = Array.from({ length: count }, (_, player) => Object.fromEntries(terrainIds.map((id, index) =>
        [id, ((player + 3) * (index + 1) * 17) % 61 - 30])));
      const all = candidates(rows, terrainIds);
      const bestMin = Math.max(...all.map((candidate) => candidate.floor));
      const eligible = all.filter((candidate) => candidate.floor >= bestMin - 20);
      for (let seed = 1; seed <= 30; seed++) {
        const state = { rngState: seedToRngState(seed) } as GameState;
        const oracle = { ...state };
        const expected = eligible.length === 1 ? eligible[0].ids : eligible[Math.floor(next(oracle) * eligible.length)].ids;
        expect(variedTerrainAssignment(state, rows, terrainIds)).toEqual(expected);
        expect(state.rngState).toBe(oracle.rngState);
      }
    }
    const boundaryRows = [{ a: 0, b: 30, c: 49, d: 50 }];
    const selected = new Set(Array.from({ length: 60 }, (_, index) => variedTerrainAssignment(
      { rngState: seedToRngState(index + 1) } as GameState, boundaryRows, terrainIds)[0]));
    expect(selected).toEqual(new Set(['b', 'c', 'd']));
  });

  it('keeps every live package within 20 k of fair and varies deterministically across seeds and languages', () => {
    const players = Array.from({ length: 8 }, (_, index) => human(`p${index}`, SECTOR_IDS[index % SECTOR_IDS.length]));
    const preview = createGameState({ ...config(1), mapMode: 'hex' }, players, { preview: true });
    const rows = players.map((player) => {
      const company = companyOf(preview, player.id);
      return terrainValues(preview, company, company.products[0]);
    });
    const make = (seed: number, mode: 'fair' | 'fair_varied', lang: 'fr' | 'en' = 'fr') =>
      createGame({ ...config(seed), mapMode: 'hex', terrainAssignment: mode, lang }, players);
    const floor = (state: GameState) => Math.min(...players.map((player, index) => rows[index][companyOf(state, player.id).terrainId!]));
    const fair = make(1, 'fair');
    let differs = false;
    for (let seed = 1; seed <= 4; seed++) {
      const varied = make(seed, 'fair_varied');
      expect(floor(varied)).toBeGreaterThanOrEqual(floor(fair) - 20);
      expect(new Set(Object.keys(varied.terrainAssignments!)).size).toBe(players.length);
      differs ||= JSON.stringify(varied.terrainAssignments) !== JSON.stringify(make(seed, 'fair').terrainAssignments);
      if (seed === 1) {
        expect(varied).toEqual(make(seed, 'fair_varied'));
        const en = make(seed, 'fair_varied', 'en');
        expect(varied.terrainAssignments).toEqual(en.terrainAssignments);
        expect(varied.rngState).toBe(en.rngState);
      }
    }
    expect(differs).toBe(true);
  });

  it('handles no players, a unique candidate, and invalid assignment inputs', () => {
    const state = { rngState: seedToRngState(7) } as GameState;
    const initial = state.rngState;
    expect(variedTerrainAssignment(state, [], ids)).toEqual([]);
    expect(variedTerrainAssignment(state, [{ only: -10 }], ['only'])).toEqual(['only']);
    expect(state.rngState).toBe(initial);
    expect(() => variedTerrainAssignment(state, [{ a: 1 }, { a: 1 }], ['a'])).toThrow();
    expect(() => variedTerrainAssignment(state, [{ a: NaN }], ['a'])).toThrow();
  });
});

describe('choice terrain assignment', () => {
  it('preserves explicit choices, greedily places missing bots in player order, then fairly fills missing humans', () => {
    const players = [human('first', 'yogurts'), { ...human('bot1', 'gadgets'), isBot: true }, human('second', 'energy_drinks'),
      { ...human('bot2', 'gadgets'), isBot: true }, { ...human('pickedBot', 'crypto'), isBot: true }, human('pickedHuman', 'scooters')];
    const terrains: Record<string, string> = { pickedHuman: ids[0], pickedBot: ids[1] };
    const cfg = { ...config(7), mapMode: 'hex' as const, terrainAssignment: 'choice' as const, terrains };
    const preview = createGameState(cfg, players, { preview: true });
    const expected = { ...terrains };
    let free = ids.filter((id) => !Object.values(expected).includes(id));
    for (const player of players.filter((player) => player.isBot && expected[player.id] === undefined)) {
      const company = companyOf(preview, player.id);
      const values = terrainValues(preview, company, company.products[0]);
      const best = Math.max(...free.map((id) => values[id]));
      expected[player.id] = free.find((id) => values[id] === best)!;
      free = free.filter((id) => id !== expected[player.id]);
    }
    const state = createGame(cfg, players);
    for (const [player, terrain] of Object.entries(expected)) expect(companyOf(state, player).terrainId).toBe(terrain);
    const missing = players.filter((player) => expected[player.id] === undefined);
    const rows = missing.map((player) => {
      const company = companyOf(preview, player.id);
      return terrainValues(preview, company, company.products[0]);
    });
    const all = candidates(rows, free);
    const bestFloor = Math.max(...all.map((candidate) => candidate.floor));
    const bestSpread = Math.min(...all.filter((candidate) => candidate.floor === bestFloor).map((candidate) => candidate.spread));
    const scores = missing.map((player, index) => rows[index][companyOf(state, player.id).terrainId!]);
    expect([Math.min(...scores), Math.max(...scores) - Math.min(...scores)]).toEqual([bestFloor, bestSpread]);
    expect(createGame(cfg, players)).toEqual(state);
    expect(createGame({ ...cfg, lang: 'en' }, players).terrainAssignments).toEqual(state.terrainAssignments);
    expect(state.config.terrains).toEqual(terrains);
    const view = getPlayerView(state, 'first');
    view.config.terrains!.pickedHuman = ids[7];
    expect(state.config.terrains).toEqual(terrains);
  });

  // Le secteur gadgets n'a aucune entrée dans TERRAIN_CALIBRATION : les valeurs restent égales ici.
  it('uses terrain definition order when bots have equal valuations', () => {
    const saved = defs.map((terrain) => ({ hex: terrain.hex, effects: terrain.effects }));
    try {
      for (const terrain of defs) { terrain.hex = capitalHexId; terrain.effects = []; }
      const players = [{ ...human('bot1', 'gadgets'), isBot: true }, { ...human('bot2', 'gadgets'), isBot: true }];
      const state = createGameState({ ...config(7), mapMode: 'hex', terrainAssignment: 'choice' }, players, { preview: true });
      assignStartingTerrains(state);
      expect(companyOf(state, 'bot1').terrainId).toBe(ids[0]);
      expect(companyOf(state, 'bot2').terrainId).toBe(ids[1]);
    } finally { defs.forEach((terrain, index) => Object.assign(terrain, saved[index])); }
  });

  it('keeps the host fair fill for bots and retains the same fair fill for a human-only choice lobby', () => {
    const players = [human('first', 'energy_drinks'), human('second', 'gadgets'), human('third', 'scooters')];
    const cfg = { ...config(8), mapMode: 'hex' as const, terrains: { first: ids[7] } };
    const host = createGame({ ...cfg, terrainAssignment: 'host' }, players);
    const choice = createGame({ ...cfg, terrainAssignment: 'choice' }, players);
    expect(choice.terrainAssignments).toEqual(host.terrainAssignments);
    expect(choice.rngState).toBe(host.rngState);
    const withBots = players.map((player) => player.id === 'first' ? player : { ...player, isBot: true });
    const hostBots = createGame({ ...cfg, terrainAssignment: 'host' }, withBots);
    expect(hostBots.terrainAssignments).toEqual(host.terrainAssignments);
    const previewHumans = createGameState({ ...cfg, terrainAssignment: 'host' }, players, { preview: true });
    const previewBots = createGameState({ ...cfg, terrainAssignment: 'host' }, withBots, { preview: true });
    assignStartingTerrains(previewHumans); assignStartingTerrains(previewBots);
    expect(previewBots.rngState).toBe(previewHumans.rngState);
  });

  it('rejects invalid or duplicate choices and discards stale choices in fair varied mode', () => {
    const players = [human('a'), human('b')];
    const cfg = { ...config(7), mapMode: 'hex' as const, terrainAssignment: 'choice' as const };
    const invalid: Record<string, string>[] = [{ a: ids[0], b: ids[0] }, { a: 'unknown' }, { absent: ids[0] }];
    for (const terrains of invalid)
      expect(() => createGame({ ...cfg, terrains }, players)).toThrow();
    const varied = createGame({ ...cfg, terrainAssignment: 'fair_varied', terrains: { absent: 'unknown' } }, players);
    expect(varied.config.terrains).toBeUndefined();
    expect(getPlayerView(varied, 'a').config.terrains).toBeUndefined();
    const classic = createGame({ ...config(7), terrainAssignment: 'choice', terrains: { absent: 'unknown' } }, players);
    expect(classic).toEqual(createGame(config(7), players));
  });
});
