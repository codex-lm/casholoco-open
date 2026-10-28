/**
 * QA « exploits » sur les règles d'équilibrage (lots 1 et 2) : séquences d'actions légales qui rapportaient
 * sans rien risquer, et fuites d'information de la vue.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, resolveTurn } from '../src/engine';
import { COMMODITIES } from '../src/content';
import { expectedSectorDemand } from '../src/sim/advice';
import { computeNetWorth } from '../src/sim/finance';
import { holdingOf, shareBuyQuote } from '../src/sim/market';
import type { Action, GameState } from '../src/types';
import { companyOf, human, newGame, npcCompanies, snapshot } from './helpers';

function duo(seed = 11, turns = 16, lang: 'fr' | 'en' = 'fr'): GameState {
  const s = newGame(seed, [human('a', 'energy_drinks', 'Alice'), human('b', 'gadgets', 'Bob')], turns);
  s.config.lang = lang;
  return s;
}

function ok(s: GameState, pid: string, action: Action) {
  const r = applyAction(s, pid, action);
  expect(r.ok, r.message).toBe(true);
  return r;
}

function refused(s: GameState, pid: string, action: Action) {
  const before = snapshot(s);
  const r = applyAction(s, pid, action);
  expect(r.ok).toBe(false);
  expect(snapshot(s)).toBe(before);
  return r.message;
}

describe('impact de prix indépendant du chemin', () => {
  it('vendre toute sa ligne puis la racheter dans le tour ne rapporte rien', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const h = holdingOf(me, 'a');
    const cash0 = s.players.a.cash;
    const p0 = me.sharePrice;
    ok(s, 'a', { type: 'sellShares', companyId: me.id, shares: h });
    ok(s, 'a', { type: 'buyShares', companyId: me.id, shares: h });
    expect(s.players.a.cash).toBeCloseTo(cash0, 6);
    expect(me.sharePrice).toBeCloseTo(p0, 9);
  });

  it('fractionner un achat coûte exactement autant qu’un seul ordre', () => {
    const one = duo();
    const many = duo();
    const c1 = npcCompanies(one)[0];
    const c2 = npcCompanies(many)[0];
    ok(one, 'a', { type: 'buyShares', companyId: c1.id, shares: 600 });
    for (let i = 0; i < 6; i++) ok(many, 'a', { type: 'buyShares', companyId: c2.id, shares: 100 });
    expect(many.players.a.cash).toBeCloseTo(one.players.a.cash, 6);
    expect(c2.sharePrice).toBeCloseTo(c1.sharePrice, 9);
  });

  it('un aller-retour répété à chaque tour n’enrichit plus (il rapportait +60 % de valeur nette)', () => {
    const run = (every: boolean) => {
      const s = duo(3);
      const c = companyOf(s, 'a');
      for (let t = 1; t <= 16; t++) {
        if (t === 1 || every) {
          const h = holdingOf(c, 'a');
          applyAction(s, 'a', { type: 'sellShares', companyId: c.id, shares: h });
          applyAction(s, 'a', { type: 'buyShares', companyId: c.id, shares: h });
        }
        resolveTurn(s);
      }
      return computeNetWorth(s, 'a');
    };
    expect(run(true) / run(false)).toBeLessThan(1.01);
  });

  it('matières : vendre tout son stock au plancher puis le racheter coûte de l’argent', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const L = COMMODITIES.sugar.liquidity;
    me.inventory.sugar = { lots: L, avgCost: s.commodities.sugar.price };
    me.cash += 100_000;
    const cash0 = me.cash;
    ok(s, 'a', { type: 'sellCommodity', companyId: me.id, commodityId: 'sugar', lots: L });
    ok(s, 'a', { type: 'buyCommodity', companyId: me.id, commodityId: 'sugar', lots: L });
    expect(me.cash).toBeLessThan(cash0);
  });
});

describe('délit d’initié et retour en jeu : céder le contrôle puis racheter', () => {
  it('le rachat par l’ancien contrôleur dans le même tour compte comme délit d’initié', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const h = holdingOf(me, 'a');
    me.scandal = 0;
    s.players.a.cash += 50_000;
    const r = ok(s, 'a', { type: 'sellShares', companyId: me.id, shares: h });
    expect(me.controllerId).not.toBe('a');
    expect(r.message).toMatch(/délit d’initié/);
    expect(getPlayerView(s, 'a').self?.soldControlThisTurn).toEqual([me.id]);
    expect(getPlayerView(s, 'b').self?.soldControlThisTurn).toBeUndefined();
    const n = Math.floor(me.sharesOutstanding / 2) + 1;
    expect(shareBuyQuote(me, n).total).toBeLessThan(s.players.a.cash);
    ok(s, 'a', { type: 'buyShares', companyId: me.id, shares: n });
    expect(me.controllerId).toBe('a');
    expect(me.scandal).toBeCloseTo((100 * n) / me.sharesOutstanding, 6);
    // Au trimestre suivant, l'ardoise est effacée.
    resolveTurn(s);
    expect(getPlayerView(s, 'a').self?.soldControlThisTurn).toBeUndefined();
  });

  it('vendre, fonder la start-up, racheter : la start-up attend le trimestre suivant (FR et EN)', () => {
    for (const lang of ['fr', 'en'] as const) {
      const s = duo(11, 16, lang);
      const me = companyOf(s, 'a');
      ok(s, 'a', { type: 'sellShares', companyId: me.id, shares: holdingOf(me, 'a') });
      const startup: Action = { type: 'foundStartup', name: 'Rebond', sectorId: 'gadgets', investment: 1_500 };
      const msg = refused(s, 'a', startup);
      expect(msg).toMatch(lang === 'fr' ? /trimestre prochain/ : /next quarter/);
      resolveTurn(s);
      if (me.controllerId !== 'a') ok(s, 'a', startup);
    }
  });

  it('un joueur évincé par une OPA peut toujours racheter sans délit d’initié', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    s.players.b.cash = 1e6;
    me.scandal = 0;
    const need = Math.floor(me.sharesOutstanding / 2) + 1;
    ok(s, 'b', { type: 'buyShares', companyId: me.id, shares: need });
    expect(me.controllerId).toBe('b');
    ok(s, 'a', { type: 'buyShares', companyId: me.id, shares: 100 });
    expect(me.scandal).toBe(0);
  });
});

describe('fuites d’information de la vue', () => {
  it('le compteur d’alertes d’un rival est masqué pendant la partie (la source reste anonyme)', () => {
    const s = duo();
    const bob = companyOf(s, 'b');
    bob.scandal = 20;
    ok(s, 'a', { type: 'whistleblow', companyId: bob.id });
    const seenByB = getPlayerView(s, 'b').players.find((p) => p.id === 'a')!;
    const seenByA = getPlayerView(s, 'a').players.find((p) => p.id === 'a')!;
    expect(seenByB.stats.whistleblows).toBeUndefined();
    expect(seenByA.stats.whistleblows).toBe(1);
  });

  it('le compteur d’actions discutables d’un rival est masqué pendant la partie', () => {
    const s = duo();
    const bob = companyOf(s, 'b');
    bob.cash += 10_000;
    ok(s, 'b', { type: 'shady', companyId: bob.id, kind: 'greenwashing' });
    expect(getPlayerView(s, 'a').players.find((p) => p.id === 'b')!.stats.shadyActions).toBe(0);
    expect(getPlayerView(s, 'b').players.find((p) => p.id === 'b')!.stats.shadyActions).toBe(1);
  });

  it('le lobbying décidé ce tour par un rival ne change pas les estimations des autres', () => {
    const s = duo();
    const bob = companyOf(s, 'b');
    const mine = companyOf(s, 'a').products[0];
    const sector = mine.sectorId;
    const demandSeenByA = () => getPlayerView(s, 'a').companies.flatMap((c) => c.products).find((p) => p.id === mine.id)!.private!.estimate!.demand;
    const before = demandSeenByA();
    bob.cash += 10_000;
    ok(s, 'b', { type: 'shady', companyId: bob.id, kind: 'lobbying', sectorId: sector });
    expect(demandSeenByA()).toBeCloseTo(before, 9);
    // Bob, lui, connaît son lobbying.
    expect(expectedSectorDemand(s, sector, s.turn, 'b')).toBeGreaterThan(expectedSectorDemand(s, sector, s.turn, 'a'));
    // Après la résolution, le lobbying en cours compte pour tout le monde.
    resolveTurn(s);
    expect(expectedSectorDemand(s, sector, s.turn, 'a')).toBeCloseTo(expectedSectorDemand(s, sector, s.turn, 'b'), 9);
  });

});
