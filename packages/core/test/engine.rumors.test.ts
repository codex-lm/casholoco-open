import { describe, expect, it } from 'vitest';
import { createGame, resolveTurn } from '../src/engine';
import type { RumorReliability } from '../src/types';
import { bots, config } from './helpers';

describe('rumeurs : la fiabilité affichée est un indice, jamais une certitude (§9)', () => {
  it('élevée > moyenne > faible, et une rumeur « faible » peut être vraie', () => {
    const tally: Record<RumorReliability, { vraies: number; total: number }> = {
      faible: { vraies: 0, total: 0 },
      moyenne: { vraies: 0, total: 0 },
      élevée: { vraies: 0, total: 0 },
    };
    // A larger fixed cohort keeps the calibration meaningful after news mechanics change the RNG stream.
    for (let seed = 1; seed <= 200; seed++) {
      const g = createGame(config(seed, 16), bots(6));
      for (let turn = 1; turn < 16; turn++) {
        const issue = g.journal.at(-1)!;
        // Origine de chaque rumeur, dans le même ordre : 'news:…' (la news programmée) ou 'fake:…'.
        const keys = g.rumorKeys?.[issue.turn] ?? [];
        issue.rumors.forEach((r, i) => {
          tally[r.reliability].total += 1;
          if (keys[i]?.startsWith('news:')) tally[r.reliability].vraies += 1;
        });
        resolveTurn(g);
      }
    }
    const p = (k: RumorReliability) => tally[k].vraies / tally[k].total;
    // Cibles : 80 / 40 / 10 % ; les fourchettes restent celles du calage initial.
    expect(p('faible')).toBeGreaterThan(0.05);
    expect(p('faible')).toBeLessThan(0.16);
    expect(p('moyenne')).toBeGreaterThan(0.32);
    expect(p('moyenne')).toBeLessThan(0.48);
    expect(p('élevée')).toBeGreaterThan(0.72);
    expect(p('élevée')).toBeLessThan(0.88);
    // 200 parties de 15 tours : le moteur des personnalités est plus lourd, et la suite complète tourne en parallèle.
  }, 120_000);
});
