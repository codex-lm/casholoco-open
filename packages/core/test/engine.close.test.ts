import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, netWorth, resolveTurn } from '../src/engine';
import { closeObligations, planClose } from '../src/sim/close';
import { siteOpeningCost } from '../src/sim/deals';
import { bookValue, companyLoanLimit } from '../src/sim/finance';
import { resolveTurnWithLog } from '../src/sim/resolve';
import type { Action, CompanyState, GameState } from '../src/types';
import { bots, companyOf, human, newGame, npcCompanies } from './helpers';

const ok = (s: GameState, who: string, a: Action) => {
  const r = applyAction(s, who, a);
  expect(r.ok, r.message).toBe(true);
  return r;
};

/** Alice (boissons énergisantes) et Bob (gadgets), deux humains. */
function duo(): GameState {
  return newGame(31, [human('a', 'energy_drinks', 'Alice'), human('b', 'gadgets', 'Bob')]);
}

/** Plan de clôture tel que le dirigeant le voit. */
function seenPlan(s: GameState, who: string, c: CompanyState) {
  return getPlayerView(s, who).companies.find((x) => x.id === c.id)!.private!.closePlan!;
}

/** Lots prévus d'un produit : production demandée, plafonnée à la capacité. */
const plannedLots = (p: CompanyState['products'][number]) => Math.floor(Math.min(p.production, p.capacity));

describe('clôture : qui est payé, dans quel ordre (§5.7)', () => {
  it('faute de couvrir ses obligations, l’entreprise fait faillite en tête de clôture ; son dirigeant était prévenu', () => {
    const s = duo();
    const me = companyOf(s, 'b');
    me.cash = closeObligations(s, me).total - 1;
    const plan = seenPlan(s, 'b', me);
    expect(plan.bankrupt).toBe(true);
    expect(plan.shortfall).toBeGreaterThan(0);
    // Les autres ne voient rien de sa trésorerie à venir.
    expect(getPlayerView(s, 'a').companies.find((x) => x.id === me.id)!.private).toBeUndefined();
    const log = resolveTurnWithLog(s)!;
    expect(log.bankruptcies).toContain(me.id);
    expect(me.status).toBe('bankrupt');
    expect(me.sharePrice).toBe(0);
    expect(me.products).toHaveLength(0);
    expect(me.controllerId).toBeNull();
    expect(s.players.b.stats.bankruptcies).toBe(1);
    expect(me.priceHistory[me.priceHistory.length - 1]).toBe(0);
    // la faillite fait la une du numéro suivant
    const issue = s.journal[s.journal.length - 1];
    expect(issue.articles[0].kind).toBe('headline');
    expect(issue.articles[0].companyIds).toContain(me.id);
    // plus aucune action possible
    expect(applyAction(s, 'a', { type: 'buyShares', companyId: me.id, shares: 1 }).ok).toBe(false);
    expect(applyAction(s, 'b', { type: 'sellShares', companyId: me.id, shares: 1 }).ok).toBe(false);
    expect(netWorth(s, 'b')).toBeCloseTo(s.players.b.cash - s.players.b.debt, 6);
  });

  it('juste de quoi payer ses obligations : pas de faillite, et la production se paie avec ses ventes', () => {
    const s = duo();
    const me = companyOf(s, 'b');
    // Established buyers can fund the whole batch without an up-front ad or
    // R&D budget; fresh defaults may need those investments before any sales.
    Object.assign(me.products[0], { quality: 2, brand: 2, marketing: 0, rnd: 0 });
    me.cash = closeObligations(s, me).total;
    const plan = planClose(s, me);
    expect(plan.bankrupt).toBe(false);
    expect(plan.sales.planned).toBeGreaterThan(plan.production.plannedCost);
    expect(plan.production.funded).toBe(plan.production.planned);
    // The following issue may transfer control and change the next batch.
    // The close must fund the batch that was planned before those actions.
    const plannedProduction = plannedLots(me.products[0]);
    const log = resolveTurnWithLog(s)!;
    expect(me.status).toBe('active');
    expect(log.bankruptcies).not.toContain(me.id);
    expect(me.products[0].lastProduced).toBe(plannedProduction);
    expect(me.reports.at(-1)!.revenue).toBeGreaterThan(0);
    expect(me.cash).toBeGreaterThanOrEqual(-1e-6);
  });

  it('le marketing et la R&D prennent ce que laissent la production et les ventes, réduits ensemble', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const p = me.products[0];
    ok(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: p.id, marketing: 15_000, rnd: 5_000 });
    me.cash = closeObligations(s, me).total;
    const plan = planClose(s, me);
    expect(plan.production.funded).toBe(plan.production.planned);
    expect(plan.marketing.planned).toBe(20_000);
    expect(plan.marketing.funded).toBeGreaterThan(0);
    expect(plan.marketing.funded).toBeLessThan(20_000);
    expect(plan.shortfall).toBeGreaterThan(0);
    resolveTurn(s);
    const r = me.reports.at(-1)!;
    expect(p.lastProduced).toBe(plannedLots(p));
    expect(r.marketing + r.rnd).toBeGreaterThan(0);
    expect(r.marketing + r.rnd).toBeLessThan(20_000);
    expect(r.marketing / r.rnd).toBeCloseTo(3, 6); // marketing et R&D réduits dans la même proportion
    expect(me.cash).toBeGreaterThanOrEqual(-1e-6);
  });

  it('une production qui ne se vend pas se paie avec la trésorerie : faute d’argent, tous les produits sont réduits ensemble', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const npc = npcCompanies(s).find((c) => c.products[0].sectorId === 'gadgets')!;
    s.players.a.cash = 1e7;
    ok(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 6_000 });
    ok(s, 'a', { type: 'merge', absorberId: me.id, targetId: npc.id });
    expect(me.products).toHaveLength(2);
    // Prix au plafond et effondrement temporaire de la demande : presque rien ne se vendra,
    // quelle que soit l'élasticité propre des deux secteurs.
    for (const p of me.products) ok(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: p.id, price: p.price * 20 });
    s.activeEffects = [{ id: 'empty-market', newsId: 'test', kind: 'sectorDemand', sectorId: 'all', value: 0.01, turnsLeft: 1 }];
    const full = planClose(s, me);
    expect(full.sales.planned).toBeLessThan(full.production.plannedCost / 10);
    me.cash = full.obligations.total + full.production.plannedCost / 2;
    const plan = planClose(s, me);
    expect(plan.production.funded).toBeLessThan(plan.production.planned);
    const share = plan.production.funded / plan.production.planned;
    for (const p of me.products) expect(Math.abs(plan.lots[p.id] - plannedLots(p) * share)).toBeLessThan(2);
    expect(plan.marketing.funded).toBeLessThan(plan.marketing.planned);
    const log = resolveTurnWithLog(s)!;
    expect(log.productionCuts).toContain(me.id);
    const made = me.products.reduce((n, p) => n + p.lastProduced, 0);
    const shareMade = made / plan.production.planned;
    for (const p of me.products) expect(Math.abs(p.lastProduced - plannedLots(p) * shareMade)).toBeLessThan(2);
    expect(Math.abs(made - plan.production.funded)).toBeLessThan(5);
    expect(me.cash).toBeGreaterThanOrEqual(-1e-6);
  });

  it('une mise se règle en fin de trimestre, ventes encaissées : on n’emprunte que ce qu’elles ne couvrent pas', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const reserve = siteOpeningCost('oil');
    me.cash = reserve + 1;
    ok(s, 'a', { type: 'bidSite', companyId: me.id, slotId: 'oil-2', amount: reserve });
    let plan = planClose(s, me);
    expect(plan.bids).toBe(reserve);
    // Il manque 1 M€ sur le trimestre, ventes attendues comprises : c'est ce que le plan demande, pas le prix du puits.
    me.cash = plan.obligations.total + reserve + plan.production.plannedCost + plan.marketing.planned - plan.sales.planned - 1000;
    plan = planClose(s, me);
    expect(plan.shortfall).toBeCloseTo(1000, 6);
    expect(plan.loan).toBeLessThan(1100);
    expect(plan.safeLoan).toBeGreaterThan(plan.loan);
    expect(plan.bidsCovered).toBeLessThan(reserve);
    const debt0 = me.debt;
    ok(s, 'a', { type: 'takeLoan', companyId: me.id, amount: plan.safeLoan });
    resolveTurn(s);
    expect(me.sites?.map((x) => x.commodityId)).toEqual(['oil']);
    expect(me.debt - debt0).toBe(plan.safeLoan);
    // En fin de trimestre, il reste à peu près la marge, pas le prix du puits.
    expect(me.cash).toBeGreaterThanOrEqual(-1e-6);
    expect(me.cash).toBeLessThan(plan.safeLoan + plan.margin);
  });

  it('impôt et amendes : dans les comptes du trimestre, payés en tête de la clôture suivante, des dettes d’ici là', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    resolveTurn(s);
    const r1 = me.reports.at(-1)!;
    expect(r1.tax).toBeGreaterThan(0);
    expect(me.taxDue).toBeCloseTo(r1.tax, 6);
    expect(r1.cashEnd).toBeCloseTo(me.cash, 6);
    // L'impôt pèse déjà dans la valeur comptable.
    expect(bookValue({ ...me, taxDue: 0 }) - bookValue(me)).toBeCloseTo(r1.tax, 6);
    // À la clôture suivante, c'est une obligation : sans de quoi le payer, faillite.
    const ob = closeObligations(s, me);
    expect(ob.taxDue).toBeCloseTo(r1.tax, 6);
    const tight = structuredClone(s);
    companyOf(tight, 'a').cash = ob.total - 1;
    resolveTurn(tight);
    expect(tight.companies[me.id].status).toBe('bankrupt');
    // Une amende tombe ce trimestre : elle aussi attendra la clôture suivante ; l'impôt d'avant, lui, est payé.
    me.scandal = 100;
    resolveTurn(s);
    const r2 = me.reports.at(-1)!;
    expect(r2.fines).toBeGreaterThan(0);
    expect(me.finesDue).toBeCloseTo(r2.fines, 6);
    expect(me.taxDue ?? 0).toBeCloseTo(r2.tax, 6);
    expect(closeObligations(s, me).finesDue).toBeCloseTo(r2.fines, 6);
    expect(bookValue({ ...me, taxDue: 0, finesDue: 0 }) - bookValue(me)).toBeCloseTo(r2.tax + r2.fines, 6);
    resolveTurn(s);
    expect(me.status).toBe('active');
    expect(me.finesDue ?? 0).toBeCloseTo(me.reports.at(-1)!.fines, 6);
  });

  it('les faillites se décident d’un bloc : les livraisons d’un vendeur qui tombe ne comptent pas chez son acheteur', () => {
    const s = newGame(5, [human('a', 'gadgets', 'Alice'), human('b', 'gadgets', 'Bob'), human('c', 'yogurts', 'Cleo')]);
    const [alice, cleo] = [companyOf(s, 'a'), companyOf(s, 'c')];
    const close = s.commodities.sugar.priceHistory.at(-1)!;
    ok(s, 'c', { type: 'offerContract', sellerCompanyId: cleo.id, buyerCompanyId: alice.id, commodityId: 'sugar', lots: 30, price: close, turns: 2 });
    ok(s, 'a', { type: 'answerOffer', offerId: s.offers!.at(-1)!.id, accept: true });
    const ob = closeObligations(s, alice);
    expect(ob.contracts).toBeCloseTo(30 * close, 6);
    // De quoi payer ses obligations, pas les livraisons de Cleo ; Cleo, elle, est perdue quoi qu'il arrive. Alice passe
    // avant Cleo dans l'ordre des entreprises : sa survie ne doit pas en dépendre.
    alice.cash = ob.total - ob.contracts + 1;
    cleo.debt = 1e9;
    const log = resolveTurnWithLog(s)!;
    expect(log.bankruptcies).toEqual([cleo.id]);
    expect(alice.status).toBe('active');
  });

  it('le plan d’un nouveau dirigeant ne compte pas la mise secrète de son prédécesseur, qui tombera', () => {
    const s = newGame(5, [human('a', 'gadgets', 'Alice'), human('b', 'gadgets', 'Bob'), human('c', 'yogurts', 'Cleo')]);
    const alice = companyOf(s, 'a');
    alice.cash = 1e6;
    ok(s, 'a', { type: 'bidSite', companyId: alice.id, slotId: 'sugar-2', amount: 9000 });
    expect(seenPlan(s, 'a', alice).bids).toBe(9000);
    s.players.b.cash = 1e9;
    ok(s, 'b', { type: 'buyShares', companyId: alice.id, shares: 5001 });
    expect(alice.controllerId).toBe('b');
    expect(seenPlan(s, 'b', alice).bids).toBe(0);
    // La mise (9 000) n'apparaît nulle part comme nombre (des flottants de la vue peuvent contenir ces chiffres).
    expect(JSON.stringify(getPlayerView(s, 'b'))).not.toMatch(/(?<![0-9.])9000(?![0-9])/);
  });

  it('l’emprunt proposé comble le manque, intérêts en plus compris (le taux monte avec la dette)', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    // Un marketing que les ventes ne paient pas, une entreprise endettée.
    ok(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: me.products[0].id, marketing: 6000 });
    me.debt = 6000;
    me.cash = 2500;
    const plan = planClose(s, me);
    expect(plan.shortfall).toBeGreaterThan(0);
    expect(plan.loan).toBeGreaterThan(plan.shortfall);
    expect(plan.loan).toBeLessThanOrEqual(companyLoanLimit(me));
    // N'emprunter que le manque ne suffit pas : la dette plus lourde coûte plus d'intérêts.
    const short = structuredClone(s);
    ok(short, 'a', { type: 'takeLoan', companyId: me.id, amount: Math.ceil(plan.shortfall) });
    expect(planClose(short, companyOf(short, 'a')).shortfall).toBeGreaterThan(0);
    ok(s, 'a', { type: 'takeLoan', companyId: me.id, amount: plan.loan });
    expect(planClose(s, me).shortfall).toBe(0);
    expect(planClose(s, me).loan).toBe(0);
  });

  it('une fusion reprend l’impôt et les amendes dus par l’absorbée', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const npc = npcCompanies(s).find((c) => c.products[0].sectorId === 'gadgets')!;
    s.players.a.cash = 1e7;
    ok(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 6_000 });
    me.taxDue = 100;
    npc.taxDue = 50;
    npc.finesDue = 30;
    ok(s, 'a', { type: 'merge', absorberId: me.id, targetId: npc.id });
    expect(me.taxDue).toBeCloseTo(150, 6);
    expect(me.finesDue).toBeCloseTo(30, 6);
  });

  it('entre bots : chacun couvre sa clôture (dans la limite des banques), et aucune trésorerie ne passe sous zéro', () => {
    for (const seed of [3, 8]) {
      const s = newGame(seed, bots(5));
      while (s.phase === 'playing') {
        for (const c of Object.values(s.companies)) {
          if (c.status !== 'active') continue;
          const plan = planClose(s, c);
          expect(plan.shortfall <= 1e-6 || companyLoanLimit(c) < plan.loan, `${c.name} T${s.turn}`).toBe(true);
        }
        resolveTurn(s);
        for (const c of Object.values(s.companies)) if (c.status === 'active') expect(c.cash).toBeGreaterThanOrEqual(-1e-6);
      }
    }
  });
});
