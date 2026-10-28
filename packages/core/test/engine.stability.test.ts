import { describe, expect, it } from 'vitest';
import { getPlayerView, netWorth, resolveTurn } from '../src/engine';
import { engineDiagnostics, findNonFinite } from '../src/sim/sanitize';
import { TROPHY_IDS } from '../src/types';
import { bots, human, newGame } from './helpers';

describe('stabilité numérique sur des parties complètes', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`graine ${seed} : 6 bots + 1 humain passif, 16 tours, aucune NaN/Infinity`, () => {
      const before = engineDiagnostics.nonFiniteFixed;
      const state = newGame(seed, [human('h1', 'yogurts'), ...bots(6)]);
      expect(findNonFinite(state)).toEqual([]);
      let turns = 0;
      while (state.phase === 'playing') {
        resolveTurn(state);
        turns++;
        expect(findNonFinite(state)).toEqual([]);
        expect(turns).toBeLessThanOrEqual(16);
      }
      expect(turns).toBe(16);
      expect(engineDiagnostics.nonFiniteFixed).toBe(before);

      // Fin de partie cohérente
      expect(state.phase).toBe('finished');
      expect(state.journal).toHaveLength(16);
      const results = state.results!;
      expect(results.ranking).toHaveLength(7);
      for (let i = 1; i < results.ranking.length; i++) {
        expect(results.ranking[i - 1].netWorth).toBeGreaterThanOrEqual(results.ranking[i].netWorth);
      }
      const trophyIds = results.trophies.map((t) => t.trophyId);
      expect(new Set(trophyIds).size).toBe(trophyIds.length);
      for (const t of results.trophies) {
        expect(TROPHY_IDS).toContain(t.trophyId);
        expect(state.players[t.playerId]).toBeDefined();
      }
      expect(results.trophies.find((t) => t.trophyId === 'magnat')?.playerId).toBe(results.ranking[0].playerId);
      for (const p of Object.values(state.players)) {
        expect(p.netWorthHistory).toHaveLength(16);
        expect(p.netWorthHistory[15]).toBeCloseTo(netWorth(state, p.id), 6);
        expect(p.ready).toBe(false);
      }
      for (const c of Object.values(state.companies)) {
        expect(c.cash).toBeGreaterThanOrEqual(0);
        expect(c.sharesOutstanding).toBeGreaterThan(0);
        const held = Object.values(c.holdings).reduce((a, b) => a + b, 0);
        expect(held).toBeLessThanOrEqual(c.sharesOutstanding);
        if (c.status === 'active') expect(c.sharePrice).toBeGreaterThanOrEqual(0.01);
        if (c.status === 'bankrupt') expect(c.sharePrice).toBe(0);
        for (const p of c.products) {
          expect(p.stock).toBeGreaterThanOrEqual(0);
          expect(p.quality).toBeGreaterThan(0);
        }
      }
      // La vue de fin de partie reste propre
      expect(findNonFinite(getPlayerView(state, 'h1'))).toEqual([]);
    });
  }

  it('8 joueurs (maximum) sur 24 tours', () => {
    const state = newGame(99, [human('h1'), human('h2', 'crypto'), ...bots(6)], 24);
    while (state.phase === 'playing') resolveTurn(state);
    expect(findNonFinite(state)).toEqual([]);
    expect(state.results!.ranking).toHaveLength(8);
  });

  it('une partie sans aucun joueur ni PNJ exotique ne plante pas (1 humain seul, 1 tour)', () => {
    const state = newGame(5, [human('solo')], 1);
    resolveTurn(state);
    expect(state.phase).toBe('finished');
    expect(findNonFinite(state)).toEqual([]);
  });
});
