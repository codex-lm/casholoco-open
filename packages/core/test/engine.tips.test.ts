import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { RUMOR_CHECK_LEAK_SCANDAL, RUMOR_CHECK_MIN_COST, RUMOR_CHECK_RATE_MAX, RUMOR_CHECK_RATE_MIN } from '../src/sim/constants';
import { rumorCheckLeaks, rumorCheckPrice, rumorCheckRate } from '../src/sim/finance';
import type { GameState, Lang } from '../src/types';
import { bots, companyOf, config, human } from './helpers';

/** Deux humains et trois bots, avancés jusqu'à un numéro qui publie au moins deux rumeurs. */
function withRumors(seed = 11, lang: Lang = 'fr'): GameState {
  const s = createGame({ ...config(seed, 16), lang }, [human('a', 'energy_drinks', 'Alice'), human('b', 'gadgets', 'Bob'), ...bots(3)]);
  while (s.journal.at(-1)!.rumors.length < 2 && s.turn < 12) resolveTurn(s);
  expect(s.journal.at(-1)!.rumors.length).toBeGreaterThanOrEqual(2);
  return s;
}

const check = (s: GameState, playerId: string, index: number, turn = s.turn) => applyAction(s, playerId, { type: 'checkRumor', turn, index });

describe('tuyau (§7)', () => {
  it('le tarif monte de 2 % vers 5 % de la valeur nette, avec l’humeur du journaliste', () => {
    for (const n of [0, 1, 3, 10, 100]) {
      for (const greed of [0, 0.5, 0.999]) {
        const r = rumorCheckRate(n, greed);
        expect(r).toBeGreaterThanOrEqual(RUMOR_CHECK_RATE_MIN);
        expect(r).toBeLessThanOrEqual(RUMOR_CHECK_RATE_MAX);
      }
    }
    // À humeur égale, la courbe monte et tend vers 5 % (asymptote).
    const curve = [0, 1, 2, 4, 8].map((n) => rumorCheckRate(n, 0.5));
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThan(curve[i - 1]);
    expect(curve[0]).toBeCloseTo(RUMOR_CHECK_RATE_MIN, 6);
    expect(rumorCheckRate(50, 0.5)).toBeCloseTo(RUMOR_CHECK_RATE_MAX, 4);
    // Un journaliste gourmand demande plus qu'un journaliste pressé.
    expect(rumorCheckRate(2, 0.999)).toBeGreaterThan(rumorCheckRate(2, 0));
  });

  it('répond juste, au seul payeur, une fois par trimestre, contre son tarif', () => {
    const s = withRumors();
    const keys = s.rumorKeys![s.turn];
    const a = s.players.a;
    a.cash = 1e6;
    const price = rumorCheckPrice(s, a);
    expect(price).toBeGreaterThanOrEqual(RUMOR_CHECK_MIN_COST);
    expect(getPlayerView(s, 'a').self!.rumorCheckPrice).toBeCloseTo(price, 6);

    expect(check(s, 'a', 1).ok).toBe(true);
    expect(a.cash).toBeCloseTo(1e6 - price, 6);
    const truthful = keys[1].startsWith('news:');
    expect(getPlayerView(s, 'a').self!.rumorChecks).toEqual([{ turn: s.turn, index: 1, truthful }]);
    // Personne d'autre ne sait qu'Alice a demandé, ni ce qu'on lui a répondu.
    const bob = getPlayerView(s, 'b');
    expect(bob.self!.rumorChecks).toBeUndefined();
    expect(JSON.stringify(bob)).not.toContain('truthful');
    // Un seul tuyau par trimestre ; le suivant, plus tard, coûtera une part plus grande à humeur égale.
    expect(check(s, 'a', 0).ok).toBe(false);
    expect(rumorCheckRate(1, 0.5)).toBeGreaterThan(rumorCheckRate(0, 0.5));
  });

  it('refuse un numéro périmé, une rumeur qui n’existe pas, un joueur sans le sou', () => {
    const s = withRumors();
    s.players.a.cash = 1e6;
    expect(check(s, 'a', 0, s.turn - 1).ok).toBe(false);
    expect(check(s, 'a', 99).ok).toBe(false);
    expect(check(s, 'a', -1).ok).toBe(false);
    expect(check(s, 'a', 0.5).ok).toBe(false);
    s.players.b.cash = 0;
    const cash = s.players.b.cash;
    expect(check(s, 'b', 0).ok).toBe(false);
    expect(s.players.b.cash).toBe(cash);
    expect(s.players.b.rumorChecks).toBeUndefined();
  });

  it('ne touche pas au RNG de la simulation', () => {
    const s1 = withRumors();
    const s2 = withRumors();
    s1.players.a.cash = 1e6;
    s2.players.a.cash = 1e6;
    expect(check(s1, 'a', 0).ok).toBe(true);
    expect(s1.rngState).toBe(s2.rngState);
  });

  it('une fois sur dix environ, la source parle : flash qui nomme le joueur, jauge en hausse', () => {
    let leaks = 0;
    let draws = 0;
    const probe = createGame(config(1, 16), [human('a'), human('b')]);
    for (let seed = 1; seed <= 100; seed++) {
      probe.config.seed = seed;
      for (let turn = 1; turn <= 16; turn++) {
        probe.turn = turn;
        draws++;
        if (rumorCheckLeaks(probe, 'a')) leaks++;
      }
    }
    expect(leaks / draws).toBeGreaterThan(0.07);
    expect(leaks / draws).toBeLessThan(0.13);

    let s: GameState | undefined;
    for (let seed = 1; seed < 300 && !s; seed++) {
      const g = withRumors(seed);
      if (rumorCheckLeaks(g, 'a')) s = g;
    }
    expect(s).toBeDefined();
    const g = s!;
    g.players.a.cash = 1e6;
    const c = companyOf(g, 'a');
    const before = c.scandal;
    const r = check(g, 'a', 0);
    expect(r.ok).toBe(true);
    const flash = g.journal.at(-1)!.articles.find((x) => x.event?.type === 'rumorLeak')!;
    expect(flash.event).toEqual({ type: 'rumorLeak', actorId: 'a' });
    expect(flash.companyIds).toEqual([c.id]);
    expect(flash.title).toContain('Alice');
    expect(c.scandal).toBe(Math.min(100, before + RUMOR_CHECK_LEAK_SCANDAL));
  });

  it('même tarif et même réponse en français et en anglais', () => {
    const run = (lang: Lang) => {
      const s = withRumors(23, lang);
      s.players.a.cash = 1e6;
      const price = rumorCheckPrice(s, s.players.a);
      expect(check(s, 'a', 0).ok).toBe(true);
      return { price, checks: s.players.a.rumorChecks, cash: s.players.a.cash };
    };
    expect(run('en')).toEqual(run('fr'));
  });
});
