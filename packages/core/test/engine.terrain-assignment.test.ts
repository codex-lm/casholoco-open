import { describe, expect, it } from 'vitest';
import { createGame, getPlayerView } from '../src/engine';
import { getContent, SECTORS } from '../src/content';
import { createGameState, terrainLobbyPayload } from '../src/sim/create';
import { assessTerrains, fairTerrainAssignment, terrainValues } from '../src/sim/terrainAssignment';
import { seedToRngState } from '../src/sim/rng';
import { activeTerrain, companyTaxRate } from '../src/sim/terrains';
import { SECTOR_IDS, type GameState } from '../src/types';
import { companyOf, config, human } from './helpers';

const defs = getContent('fr').terrains.definitions;
const ids = defs.map((t) => t.id);
const players = Array.from({ length: 8 }, (_, i) => human(`p${i}`, SECTOR_IDS[i % 5]));
const make = (seed = 11, mode: 'fair' | 'random' = 'fair', lang: 'fr' | 'en' = 'fr') => createGame({ ...config(seed), mapMode: 'hex', terrainAssignment: mode, lang }, players);

/** Oracle indépendant : énumère les permutations et les classe selon les deux objectifs de la règle. */
function objectives(rows: Record<string, number>[], ids: string[]): [number, number] {
  let best: [number, number] = [-Infinity, Infinity];
  const visit = (scores: number[], free: string[]) => {
    if (scores.length === rows.length) {
      const min = Math.min(...scores), spread = Math.max(...scores) - min;
      if (min > best[0] || (min === best[0] && spread < best[1])) best = [min, spread];
      return;
    }
    for (const id of free) visit([...scores, rows[scores.length][id]], free.filter((x) => x !== id));
  };
  visit([], ids);
  return best;
}

describe('exact fair assignment', () => {
  it('maximizes the floor before minimizing spread, including fewer players and negative values', () => {
    const rng = { rngState: seedToRngState(18) } as GameState;
    for (let n = 1; n <= 4; n++) {
      const rows = Array.from({ length: n }, (_, p) => Object.fromEntries(ids.map((id, i) => [id, ((p + 3) * (i + 1) * 7) % 19 - 10])));
      const chosen = fairTerrainAssignment(rng, rows, ids);
      const scores = chosen.map((id, p) => rows[p][id]);
      expect([Math.min(...scores), Math.max(...scores) - Math.min(...scores)]).toEqual(objectives(rows, ids));
      expect(new Set(chosen).size).toBe(n);
    }
  });

  it('uses game RNG for ties, deterministically and with variation across seeds', () => {
    const rows = [Object.fromEntries(ids.map((id) => [id, 1]))];
    const choices = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const a = { rngState: seedToRngState(seed) } as GameState;
      const b = { ...a };
      expect(fairTerrainAssignment(a, rows, ids)).toEqual(fairTerrainAssignment(b, rows, ids));
      expect(a.rngState).toBe(b.rngState);
      choices.add(fairTerrainAssignment(a, rows, ids)[0]);
    }
    expect(choices.size).toBeGreaterThan(1);
  });

  it('createGame uses the live matrix and preserves equal starting wealth across placements', () => {
    const preview = createGameState({ ...config(11), mapMode: 'hex' }, players, { preview: true });
    const rows = players.map((lp) => { const c = companyOf(preview, lp.id); return terrainValues(preview, c, c.products[0]); });
    const s = make();
    const scores = players.map((lp, i) => rows[i][companyOf(s, lp.id).terrainId!]);
    expect([Math.min(...scores), Math.max(...scores) - Math.min(...scores)]).toEqual(objectives(rows, ids));
    const random = make(11, 'random');
    // Les tirages du premier journal peuvent déplacer les cours, jamais les dotations de départ.
    expect(players.map((lp) => companyOf(s, lp.id).priceHistory[0])).toEqual(players.map((lp) => companyOf(random, lp.id).priceHistory[0]));
  });
});

it.each(['fair', 'random'] as const)('%s is deterministic, language independent, and assigns each terrain once', (mode) => {
  const a = make(17, mode), b = make(17, mode), en = make(17, mode, 'en');
  expect(a).toEqual(b);
  expect(a.terrainAssignments).toEqual(en.terrainAssignments);
  expect(a.rngState).toBe(en.rngState);
  expect(Object.keys(a.terrainAssignments!)).toHaveLength(8);
  const cells = Object.values(a.companies).flatMap((c) => c.products.map((p) => p.hexId));
  expect(new Set(cells).size).toBe(cells.length);
});

it('host placement preserves valid reservations and refuses duplicates, unknown terrain/player and oversized lobbies', () => {
  const ps = players.slice(0, 2);
  const cfg = { ...config(7), mapMode: 'hex' as const, terrainAssignment: 'host' as const };
  const invalid: Record<string, string>[] = [ { p0: ids[0], p1: ids[0] }, { p0: ids[0], p1: 'bad' }, { p0: ids[0], p1: ids[1], stranger: ids[2] }];
  for (const terrains of invalid) {
    expect(() => createGame({ ...cfg, terrains }, ps)).toThrow();
  }
  const s = createGame({ ...cfg, terrains: { p0: ids[1], p1: ids[7] } }, ps);
  expect(companyOf(s, 'p0').products[0].hexId).toBe(defs[1].hex);
  expect(companyOf(s, 'p1').terrainId).toBe(ids[7]);
  for (const id of ids.filter((id) => id !== ids[1] && id !== ids[7])) expect(activeTerrain(s, id)).toBeUndefined();
  expect(() => createGame({ ...config(1), mapMode: 'hex' }, [...players, human('extra')])).toThrow();
});

it('host placement fairly fills missing players using only unreserved terrains', () => {
  const ps = players.slice(0, 4);
  const cfg = { ...config(7), mapMode: 'hex' as const, terrainAssignment: 'host' as const };
  const preview = createGameState(cfg, ps, { preview: true });
  const terrains = { p0: ids[1], p1: ids[7] };
  const s = createGame({ ...cfg, terrains }, ps);
  expect(companyOf(s, 'p0').terrainId).toBe(ids[1]);
  expect(companyOf(s, 'p1').terrainId).toBe(ids[7]);
  const rows = ps.slice(2).map((lp) => { const c = companyOf(preview, lp.id); return terrainValues(preview, c, c.products[0]); });
  const scores = ps.slice(2).map((lp, i) => rows[i][companyOf(s, lp.id).terrainId!]);
  expect([Math.min(...scores), Math.max(...scores) - Math.min(...scores)])
    .toEqual(objectives(rows, ids.filter((id) => !Object.values(terrains).includes(id))));
  const empty = createGame(cfg, ps);
  const fair = createGame({ ...cfg, terrainAssignment: 'fair' }, ps);
  expect(empty.terrainAssignments).toEqual(fair.terrainAssignments);
  expect(empty.rngState).toBe(fair.rngState);
  expect(createGame({ ...cfg, terrains }, ps).terrainAssignments).toEqual(s.terrainAssignments);
});

it.each(['fair', 'random'] as const)('%s discards stale host mappings in the engine config and player view', (terrainAssignment) => {
  const s = createGame({ ...config(1), mapMode: 'hex', terrainAssignment, terrains: { stale: 'unknown' } }, [human('a')]);
  expect(s.config.terrains).toBeUndefined();
  expect(getPlayerView(s, 'a').config.terrains).toBeUndefined();
});

it('temporary labor expires after quarter eight while the rest of the horizon keeps evolving; estimates are pure', () => {
  const s = createGameState({ ...config(7), mapMode: 'hex' }, [human('a')], { preview: true });
  const c = companyOf(s, 'a'), p = c.products[0];
  const terrain = defs.find((t) => t.id === 'portes-petit-rabais')!;
  const withGrant = [8, 16, 24].map((totalTurns) => terrainValues({ ...s, config: { ...s.config, totalTurns } }, c, p)[terrain.id]);
  const saved = terrain.effects;
  let without: number[];
  try {
    terrain.effects = [];
    without = [8, 16, 24].map((totalTurns) => terrainValues({ ...s, config: { ...s.config, totalTurns } }, c, p)[terrain.id]);
  } finally { terrain.effects = saved; }
  const grant = withGrant.map((value, i) => value - without[i]);
  expect(grant[0]).toBeGreaterThan(0);
  expect(grant[0]).toBeCloseTo(grant[1] * 2, 8);
  expect(grant[0]).toBeCloseTo(grant[2] * 3, 8);
  const before = JSON.stringify(s);
  assessTerrains(s, c, p);
  expect(JSON.stringify(s)).toBe(before);
});

it.each(SECTOR_IDS)('values every starting lever for %s, including stored goods and scandal risk', (sid) => {
  const s = createGameState({ ...config(7), mapMode: 'hex' }, players, { preview: true });
  const c = companyOf(s, players.find((lp) => lp.sectorId === sid)!.id), p = c.products[0];
  // Isolate the value of each lever with a batch large enough to benefit from
  // extra demand. Sensible tiny opening batches can already sell out at every
  // legal price, in which case additional marketing correctly earns nothing.
  p.production = p.capacity;
  const withGrants = terrainValues(s, c, p);
  for (const terrain of defs) for (const effect of terrain.effects.slice()) {
    const saved = terrain.effects;
    let without: number;
    try {
      terrain.effects = saved.filter((e) => e !== effect);
      without = terrainValues(s, c, p)[terrain.id];
    } finally { terrain.effects = saved; }
    const delta = withGrants[terrain.id] - without;
    // La revente majorée ne vaut qu'à la fermeture de l'usine : la projection trimestrielle ne la modélise pas.
    if (effect.lever === 'salvage') expect(delta, `${sid}: ${terrain.id}, ${effect.lever}`).toBe(0);
    else if (effect.lever === 'scandal') expect(delta, `${sid}: ${terrain.id}, ${effect.lever}`).toBeLessThan(0);
    else expect(delta, `${sid}: ${terrain.id}, ${effect.lever}`).toBeGreaterThan(0);
  }
});

it('values accumulated R&D and caps per-lot gains at the producible sales volume', () => {
  const s = createGameState({ ...config(7), mapMode: 'hex' }, players, { preview: true });
  const c = companyOf(s, 'p1'), p = c.products[0];
  const terrain = defs.find((t) => t.id === 'faubourgs-croissance')!;
  const values = [1, 16].map((totalTurns) => terrainValues({ ...s, config: { ...s.config, totalTurns } }, c, p)[terrain.id]);
  const saved = terrain.effects;
  let without: number[];
  try {
    terrain.effects = [];
    without = [1, 16].map((totalTurns) => terrainValues({ ...s, config: { ...s.config, totalTurns } }, c, p)[terrain.id]);
  } finally { terrain.effects = saved; }
  expect(values[1] - without[1]).toBeGreaterThan(values[0] - without[0]);
  // Isolate a per-lot labor grant at the capital on the live gadget economy.
  // Saturated demand makes the saving exactly 20% of labor plus the avoided
  // safety-stock spoilage, after tax, for each producible lot.
  const quay = defs.find((t) => t.id === 'quai-port-dividende')!;
  const savedQuay = quay.effects;
  try {
    quay.effects = [{ lever: 'labor', mult: 0.8 }];
    Object.assign(p, { capacity: 1, production: 1, quality: 20, brand: 10, marketing: 0, rnd: 0 });
    const quarter = { ...s, config: { ...s.config, totalTurns: 1 } };
    const limited = terrainValues(quarter, c, p, false);
    const expectedSaving = 0.2 * SECTORS[p.sectorId].laborCost
      * (1 + 0.2 * SECTORS[p.sectorId].perishability)
      * (1 - companyTaxRate(quarter, { ...c, terrainId: quay.id }));
    expect(limited[quay.id]).toBeCloseTo(expectedSaving, 8);
    p.production = 10_000;
    expect(terrainValues(quarter, c, p, false)[quay.id]).toBeCloseTo(expectedSaving, 8);
    p.capacity = 2;
    expect(terrainValues(quarter, c, p, false)[quay.id]).toBeCloseTo(2 * expectedSaving, 8);
  } finally { quay.effects = savedQuay; }
});

it('lobby exposes all five sector appreciations from the same live engine without seeding a game', () => {
  const ps = players.slice(0, 5);
  const payload = terrainLobbyPayload(config(0), ps);
  const preview = createGameState({ ...config(0), mapMode: 'hex' }, ps, { preview: true });
  expect(payload).toHaveLength(8);
  for (const lp of ps) {
    const c = companyOf(preview, lp.id);
    const expected = assessTerrains(preview, c, c.products[0]);
    for (const t of payload) expect(t.sectors[lp.sectorId]).toEqual(expected[t.id]);
  }
  const en = terrainLobbyPayload({ ...config(0), lang: 'en' }, ps);
  for (let i = 0; i < 8; i++) for (const sid of SECTOR_IDS) expect(en[i].sectors[sid].value).toBe(payload[i].sectors[sid].value);
});

it('views expose public ownership and only the controller sees effect summaries', () => {
  const s = createGame({ ...config(1), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: ids[0], b: ids[6] } }, [human('a'), human('b')]);
  const view = getPlayerView(s, 'a');
  expect(view.terrains).toHaveLength(8);
  expect(view.terrains!.filter((t) => t.active)).toHaveLength(2);
  const mine = view.companies.find((c) => c.controllerId === 'a')!;
  const rival = view.companies.find((c) => c.controllerId === 'b')!;
  expect(mine.terrainId).toBe(ids[0]);
  expect(mine.products[0].private!.terrainEffects).toContainEqual({ lever: 'marketing', mult: 1.5 });
  expect(rival.products[0].private).toBeUndefined();
  expect(rival.taxRate).toBe(0.05);
  view.config.terrains!.a = 'changed-by-client';
  expect(s.config.terrains!.a).toBe(ids[0]);
  const classic = createGame(config(1), [human('a')]);
  expect(getPlayerView(classic, 'a').terrains).toBeUndefined();
});
