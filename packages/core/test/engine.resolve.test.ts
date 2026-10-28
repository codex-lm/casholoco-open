import { describe, expect, it } from 'vitest';
import { allHumansReady, applyAction, netWorth, resolveTurn, setPlayerConnected, setPlayerReady } from '../src/engine';
import { bookValue, portfolioValue } from '../src/sim/finance';
import { resolveTurnWithLog } from '../src/sim/resolve';
import type { GameState } from '../src/types';
import { bots, companyOf, human, newGame, npcCompanies } from './helpers';

function setup(): GameState {
  return newGame(31, [human('a', 'energy_drinks', 'Alice'), human('b', 'gadgets', 'Bob')]);
}

describe('résolution', () => {
  it('produit un rapport trimestriel cohérent et fait avancer le tour', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    resolveTurn(s);
    expect(s.turn).toBe(2);
    expect(s.journal).toHaveLength(2);
    expect(me.reports).toHaveLength(1);
    const r = me.reports[0];
    expect(r.turn).toBe(1);
    expect(r.revenue).toBeGreaterThan(0);
    expect(r.netProfit).toBeCloseTo(r.revenue - r.cogs - r.marketing - r.rnd - r.fixedCosts - (r.amortization ?? 0) - (r.specialCharges ?? 0) - r.interest - r.fines - r.tax, 6);
    expect(r.products[0].sold).toBeGreaterThan(0);
    expect(me.priceHistory).toHaveLength(2);
    expect(s.sectors.energy_drinks.demandHistory).toHaveLength(1);
    expect(s.commodities.oil.priceHistory).toHaveLength(2);
    expect(s.players.a.netWorthHistory).toHaveLength(1);
  });

  it('appel de marge : ventes forcées puis remboursement', () => {
    const s = setup();
    const a = s.players.a;
    a.cash = 0;
    const debt0 = 0.85 * portfolioValue(s, 'a');
    a.debt = debt0;
    const log = resolveTurnWithLog(s)!;
    const call = log.marginCalls.find((m) => m.playerId === 'a');
    expect(call).toBeDefined();
    expect(call!.sold).toBeGreaterThan(0);
    expect(a.debt).toBeLessThan(debt0);
    expect(companyOf(s, 'a').holdings.a ?? 0).toBeLessThan(4_000);
    expect(a.closeRecap!.fortune!.holdings.find((h) => h.companyId === companyOf(s, 'a').id)!.sold)
      .toBe(4_000 - (companyOf(s, 'a').holdings.a ?? 0));
    const issue = s.journal[s.journal.length - 1];
    expect(issue.articles.some((x) => x.kind === 'results' && x.title.includes('Alice'))).toBe(true);
  });

  it('scandal : une jauge à 100 éclate à coup sûr (amende, stats, remise à 15)', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    me.scandal = 100;
    me.cash = 10_000;
    const sentiment = me.sentiment;
    const log = resolveTurnWithLog(s)!;
    const hit = log.scandals.find((x) => x.companyId === me.id);
    expect(hit).toBeDefined();
    expect(hit!.fine).toBeGreaterThan(500);
    expect(me.reports[0].fines).toBeCloseTo(hit!.fine, 6);
    expect(s.players.a.stats.scandals).toBe(1);
    expect(s.players.a.stats.finesPaid).toBeGreaterThanOrEqual(hit!.fine);
    expect(me.sentiment).toBeLessThan(sentiment);
  });

  it('décompte des modificateurs : optimisation fiscale appliquée puis retirée', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    expect(applyAction(s, 'a', { type: 'shady', companyId: me.id, kind: 'tax_optimisation' }).ok).toBe(true);
    expect(applyAction(s, 'a', { type: 'shady', companyId: me.id, kind: 'offshoring' }).ok).toBe(true);
    resolveTurn(s);
    const r = me.reports[0];
    if (r.netProfit + r.tax > 0) expect(r.tax / (r.netProfit + r.tax)).toBeCloseTo(0.05, 6);
    expect(me.modifiers.some((m) => m.kind === 'tax_optimisation')).toBe(false);
    expect(me.modifiers.find((m) => m.kind === 'offshoring')?.turnsLeft).toBe(2);
  });

  it('capacité commandée livrée au tour suivant', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    const p = me.products[0];
    const cap = p.capacity;
    expect(applyAction(s, 'a', { type: 'expandCapacity', companyId: me.id, productId: p.id, lots: 10 }).ok).toBe(true);
    expect(p.pendingCapacity).toBe(10);
    resolveTurn(s);
    expect(p.capacity).toBe(cap + 10);
    expect(p.pendingCapacity).toBe(0);
  });

  it('worstTurnLoss mesure la baisse de valeur nette entre deux fins de tour', () => {
    const s = setup();
    resolveTurn(s);
    const a = s.players.a;
    a.cash -= 3_000; // perte sèche pendant le tour 2
    resolveTurn(s);
    const [nw1, nw2] = a.netWorthHistory;
    expect(a.stats.worstTurnLoss).toBeCloseTo(Math.max(0, nw1 - nw2), 6);
    expect(a.stats.worstTurnLoss).toBeGreaterThan(0);
  });

  it('« prêt » remis à false à chaque tour ; allHumansReady ignore bots et déconnectés', () => {
    const s = newGame(4, [human('a'), human('b', 'gadgets'), ...bots(2)]);
    expect(allHumansReady(s)).toBe(false);
    setPlayerReady(s, 'a', true);
    expect(allHumansReady(s)).toBe(false);
    setPlayerConnected(s, 'b', false);
    expect(allHumansReady(s)).toBe(true);
    setPlayerConnected(s, 'a', false);
    expect(allHumansReady(s)).toBe(false); // plus aucun humain connecté
    setPlayerConnected(s, 'a', true);
    setPlayerConnected(s, 'b', true);
    setPlayerReady(s, 'b', true);
    expect(allHumansReady(s)).toBe(true);
    resolveTurn(s);
    expect(s.players.a.ready).toBe(false);
    expect(s.players.b.ready).toBe(false);
    expect(allHumansReady(s)).toBe(false);
  });

  it('journal : une une, des rumeurs, des flashs pendant le tour, et pas de news programmée publique', () => {
    const s = newGame(8, [human('a'), ...bots(4)]);
    const issue = s.journal[0];
    expect(issue.turn).toBe(1);
    expect(issue.dateLabel).toBe('T1 2027');
    expect(issue.articles[0].kind).toBe('headline');
    expect(issue.articles.some((x) => x.kind === 'quote')).toBe(true);
    expect(s.scheduledNews.every((n) => n.turn === 2)).toBe(true);
    const npc = npcCompanies(s)[0];
    s.players.a.cash = 1e6;
    const n = issue.articles.length;
    applyAction(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 3_000 });
    expect(issue.articles.length).toBe(n + 1);
    expect(issue.articles[n].kind).toBe('flash');
  });

  it('fin de partie : classement, trophées, phase finished, résolution idempotente', () => {
    const s = newGame(12, [human('a'), ...bots(3)], 3);
    resolveTurn(s);
    resolveTurn(s);
    resolveTurn(s);
    expect(s.phase).toBe('finished');
    expect(s.turn).toBe(3);
    expect(s.results!.ranking).toHaveLength(4);
    const frozen = JSON.stringify(s);
    resolveTurn(s);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('sûreté de la résolution', () => {
  it('une exception interne laisse l’état inchangé et remonte au serveur', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    (me.products[0] as unknown as { sectorId: string }).sectorId = 'armes'; // secteur inexistant
    const before = JSON.stringify(s);
    expect(() => resolveTurn(s)).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
});
