import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

function simulate(mode: 'classic' | 'hex', pinned = false, seed = 1, games = 2) {
  const directory = mkdtempSync(join(tmpdir(), 'muchomoney-sim-diagnostics-'));
  const summaryPath = join(directory, 'summary.json');
  try {
    const stdout = execFileSync(process.execPath, [
      '--import', 'tsx', join(root, 'packages/core/scripts/simulate.ts'),
      '--games', String(games), '--turns', '1', '--seed', String(seed), '--summary-json', summaryPath,
      ...(mode === 'hex' ? ['--hex'] : []), ...(pinned ? ['--pin-capital'] : []),
    ], { cwd: root, encoding: 'utf8', timeout: 15_000 });
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
      games: number; turns: number; mode: string; factoryMoves: number; factoryMovesPerGame: number;
      terrainSectorResults?: { terrainId: string; sectorId: string; players: number; medianNetWorth: number; wins: number; winRate: number }[];
    };
    return { stdout, summary };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('simulation relocation diagnostics', () => {
  // Une partie hexagonale d'un seul trimestre n'autorise aucun déménagement : il n'y aurait plus
  // de production après son exécution. Comparer le lot aux deux graines exécutées séparément
  // détecte un oubli de remise à zéro du compteur, sans figer une politique de prix ou de secteur.
  for (const mode of ['classic', 'hex'] as const) {
    it(mode + ': counts launch-quarter moves once per game in stdout and JSON', () => {
      const { stdout, summary } = simulate(mode);
      const expectedMoves = simulate(mode, false, 1, 1).summary.factoryMoves + simulate(mode, false, 2, 1).summary.factoryMoves;
      if (mode === 'classic') expect(expectedMoves).toBeGreaterThan(0);
      else expect(expectedMoves).toBe(0);
      expect(summary).toMatchObject({
        games: 2, turns: 1, mode, factoryMoves: expectedMoves, factoryMovesPerGame: expectedMoves / 2,
      });
      expect(stdout).toContain('Déménagements par partie : ' + (expectedMoves / 2).toFixed(2) + ' (' + expectedMoves + ' au total)');
      if (mode === 'hex') {
        const rows = summary.terrainSectorResults!;
        // Les graines 1/2 ont cinq/six joueurs initiaux ; l'attribution des résultats doit tous les conserver.
        expect(rows.reduce((sum, row) => sum + row.players, 0)).toBe(11);
        expect(rows.reduce((sum, row) => sum + row.wins, 0)).toBe(2);
        expect(new Set(rows.map((row) => `${row.terrainId}|${row.sectorId}`)).size).toBe(rows.length);
        for (const row of rows) {
          expect(Number.isFinite(row.medianNetWorth)).toBe(true);
          expect(row.winRate).toBe(row.wins / row.players);
          expect(stdout).toContain(row.terrainId);
        }
        expect(stdout).toContain('Terrain attribué × secteur de départ');
      } else {
        expect(summary.terrainSectorResults).toBeUndefined();
        expect(stdout).not.toContain('Terrain attribué × secteur de départ');
      }
    }, 30_000);

    it(mode + ': pinned factories report zero successful relocations', () => {
      const { stdout, summary } = simulate(mode, true);
      expect(summary).toMatchObject({ factoryMoves: 0, factoryMovesPerGame: 0 });
      expect(stdout).toContain('Déménagements par partie : 0.00 (0 au total)');
    }, 30_000);
  }
});
