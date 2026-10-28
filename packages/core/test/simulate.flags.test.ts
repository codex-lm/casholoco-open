import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getContent } from '../src/content';

const root = fileURLToPath(new URL('../../../', import.meta.url));

interface PerGameResult {
  playerId: string; personality: string; terrainId: string | null; sectorId: string;
  netWorth: number; rank: number | null;
}
interface Summary {
  playersPerGame: number[];
  games?: { seed: number; players: number; results: PerGameResult[] }[];
  terrainSectorResults?: {
    terrainId: string; sectorId: string; players: number; medianNetWorth: number; wins: number; winRate: number;
    expectedWins: number; winRatio: number; meanRank: number; q25NetWorth: number; q75NetWorth: number;
  }[];
}

function simulate(args: string[]): Summary {
  const directory = mkdtempSync(join(tmpdir(), 'muchomoney-sim-flags-'));
  const summaryPath = join(directory, 'summary.json');
  try {
    execFileSync(process.execPath, [
      '--import', 'tsx', join(root, 'packages/core/scripts/simulate.ts'),
      '--summary-json', summaryPath, ...args,
    ], { cwd: root, encoding: 'utf8', timeout: 60_000 });
    return JSON.parse(readFileSync(summaryPath, 'utf8')) as Summary;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('simulate.ts : drapeaux de mesure', () => {
  it('--players 8 : chaque partie a exactement 8 joueurs classés de 1 à 8', () => {
    const summary = simulate(['--games', '2', '--turns', '1', '--hex', '--players', '8', '--per-game']);
    expect(summary.playersPerGame).toEqual([8, 8]);
    expect(summary.games).toHaveLength(2);
    for (const game of summary.games!) {
      expect(game.players).toBe(8);
      expect(game.results).toHaveLength(8);
      expect(game.results.map((r) => r.rank).sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  }, 90_000);

  it('--sectors rotate : les cinq secteurs sont distincts dans chaque partie et tous couverts', () => {
    const summary = simulate(['--games', '5', '--turns', '1', '--hex', '--players', '5', '--sectors', 'rotate', '--per-game']);
    const covered = new Set<string>();
    for (const game of summary.games!) {
      const sectors = game.results.map((r) => r.sectorId);
      expect(new Set(sectors).size).toBe(5);
      for (const sector of sectors) covered.add(sector);
    }
    expect([...covered].sort()).toEqual(['crypto', 'energy_drinks', 'gadgets', 'scooters', 'yogurts']);
  }, 90_000);

  it('sans drapeau : rotation 4 + (graine % 3) et secteur préféré du persona', () => {
    const firstSeed = 3;
    const summary = simulate(['--games', '3', '--turns', '1', '--seed', String(firstSeed), '--hex', '--per-game']);
    expect(summary.playersPerGame).toEqual([0, 1, 2].map((g) => 4 + ((firstSeed + g) % 3)));
    const personaById = new Map(getContent('fr').bots.map((bot) => [bot.id, bot]));
    for (const game of summary.games!) {
      for (const result of game.results) {
        const persona = personaById.get(result.personality)!;
        expect(result.sectorId).toBe(persona.preferredSectors[0] ?? 'energy_drinks');
      }
    }
  }, 90_000);

  it('terrainSectorResults : expectedWins, winRatio, meanRank et quartiles cohérents', () => {
    const summary = simulate(['--games', '2', '--turns', '2', '--hex']);
    const rows = summary.terrainSectorResults!;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Number.isFinite(row.expectedWins)).toBe(true);
      expect(row.expectedWins).toBeGreaterThan(0);
      expect(row.winRatio).toBe(row.wins / row.expectedWins);
      expect(Number.isFinite(row.meanRank)).toBe(true);
      expect(row.q25NetWorth).toBeLessThanOrEqual(row.medianNetWorth);
      expect(row.medianNetWorth).toBeLessThanOrEqual(row.q75NetWorth);
    }
  }, 90_000);

  it('--players 9 : erreur française et sortie non nulle', () => {
    const result = spawnSync(process.execPath, [
      '--import', 'tsx', join(root, 'packages/core/scripts/simulate.ts'), '--players', '9',
    ], { cwd: root, encoding: 'utf8', timeout: 30_000 });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--players');
  }, 60_000);
});
