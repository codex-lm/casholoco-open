import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { applyAction, resolveTurn } from '../src/engine';
import { MIN_STARTUP_INVESTMENT, SHADY_COSTS } from '../src/sim/constants';
import { floatShares, maxBonus, personalLoanLimit } from '../src/sim/finance';
import type { Action, GameState } from '../src/types';
import { companyOf, human, newGame, npcCompanies, snapshot } from './helpers';

function setup(): GameState {
  // Deux humains, aucun bot : l'état ne bouge que par nos actions.
  return newGame(11, [human('a', 'energy_drinks', 'Alice'), human('b', 'gadgets', 'Bob')]);
}

function expectRefused(state: GameState, playerId: string, action: unknown): string {
  const before = snapshot(state);
  const r = applyAction(state, playerId, action as Action);
  expect(r.ok).toBe(false);
  expect(typeof r.message).toBe('string');
  expect(r.message.length).toBeGreaterThan(0);
  expect(snapshot(state)).toBe(before); // un refus ne modifie rien
  return r.message;
}

describe('validation des actions (refus)', () => {
  it('nombres invalides : NaN, Infinity, négatifs, zéro, chaînes, fractions < 1', () => {
    const s = setup();
    const npc = npcCompanies(s)[0];
    const me = companyOf(s, 'a');
    // Montants (k€) : tout nombre fini > 0 est valable ; nombres d'actions/lots : entier ≥ 1 après arrondi.
    const badAmounts = [NaN, Infinity, -Infinity, -5, 0, '10', null, undefined, {}];
    for (const x of [...badAmounts, 0.4]) {
      expectRefused(s, 'a', { type: 'buyShares', companyId: npc.id, shares: x });
      expectRefused(s, 'a', { type: 'sellShares', companyId: me.id, shares: x });
      expectRefused(s, 'a', { type: 'expandCapacity', companyId: me.id, productId: me.products[0].id, lots: x });
      expectRefused(s, 'a', { type: 'buyCommodity', companyId: me.id, commodityId: 'oil', lots: x });
      expectRefused(s, 'a', { type: 'buyback', companyId: me.id, shares: x });
    }
    const bad = badAmounts;
    for (const x of bad) {
      expectRefused(s, 'a', { type: 'buyShares', companyId: npc.id, shares: x });
      expectRefused(s, 'a', { type: 'sellShares', companyId: me.id, shares: x });
      expectRefused(s, 'a', { type: 'takePersonalLoan', amount: x });
      expectRefused(s, 'a', { type: 'takeLoan', companyId: me.id, amount: x });
      expectRefused(s, 'a', { type: 'expandCapacity', companyId: me.id, productId: me.products[0].id, lots: x });
      expectRefused(s, 'a', { type: 'buyCommodity', companyId: me.id, commodityId: 'oil', lots: x });
      expectRefused(s, 'a', { type: 'payDividend', companyId: me.id, amount: x });
      expectRefused(s, 'a', { type: 'ceoBonus', companyId: me.id, amount: x });
      expectRefused(s, 'a', { type: 'buyback', companyId: me.id, shares: x });
      expectRefused(s, 'a', { type: 'foundStartup', name: 'X', sectorId: 'crypto', investment: x });
    }
    expectRefused(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: me.products[0].id, price: NaN });
    expectRefused(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: me.products[0].id, production: -1 });
    expectRefused(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: me.products[0].id, marketing: Infinity });
    expectRefused(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: me.products[0].id });
  });

  it('entrées absurdes : action nulle, type inconnu, identifiants piégés', () => {
    const s = setup();
    expectRefused(s, 'a', null);
    expectRefused(s, 'a', 42);
    expectRefused(s, 'a', { type: 'printMoney', amount: 1e9 });
    expectRefused(s, 'a', { type: 'buyShares', companyId: '__proto__', shares: 10 });
    expectRefused(s, 'a', { type: 'buyShares', companyId: 'constructor', shares: 10 });
    expectRefused(s, 'a', { type: 'launchProduct', companyId: companyOf(s, 'a').id, sectorId: 'weapons', name: 'Boum' });
    expectRefused(s, 'a', { type: 'buyCommodity', companyId: companyOf(s, 'a').id, commodityId: 'gold', lots: 1 });
    expectRefused(s, 'intrus', { type: 'takePersonalLoan', amount: 10 });
  });

  it("actions d'entreprise réservées au contrôleur", () => {
    const s = setup();
    const bob = companyOf(s, 'b');
    const msg = expectRefused(s, 'a', { type: 'takeLoan', companyId: bob.id, amount: 100 });
    expect(msg).toContain('ne contrôlez pas');
    expectRefused(s, 'a', { type: 'ceoBonus', companyId: bob.id, amount: 10 });
    expectRefused(s, 'a', { type: 'setProductDecisions', companyId: bob.id, productId: bob.products[0].id, price: 200 });
    expectRefused(s, 'a', { type: 'merge', absorberId: companyOf(s, 'a').id, targetId: bob.id });
    expectRefused(s, 'a', { type: 'shady', companyId: npcCompanies(s)[0].id, kind: 'greenwashing' });
  });

  it('cash insuffisant, flottant dépassé, plafonds', () => {
    const s = setup();
    const alice = s.players.a;
    const me = companyOf(s, 'a');
    const npc = npcCompanies(s)[0];
    expect(expectRefused(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 5_000 })).toContain('Fonds insuffisants');
    // Flottant minimal : au-delà de 50 % + 1 action, le flottant doit rester ≥ 30 % du capital.
    expect(expectRefused(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 9_000 })).toContain('Flottant minimal');
    expectRefused(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 20_000 }); // > flottant
    expectRefused(s, 'a', { type: 'buyShares', companyId: me.id, shares: floatShares(me) + 1 });
    expectRefused(s, 'a', { type: 'sellShares', companyId: me.id, shares: 4_001 });
    expectRefused(s, 'a', { type: 'takePersonalLoan', amount: personalLoanLimit(s, alice) + 1 });
    expectRefused(s, 'a', { type: 'repayPersonalLoan', amount: 10 }); // aucune dette
    expectRefused(s, 'a', { type: 'takeLoan', companyId: me.id, amount: 1e9 });
    expectRefused(s, 'a', { type: 'repayLoan', companyId: me.id, amount: 10 }); // aucune dette
    expectRefused(s, 'a', { type: 'payDividend', companyId: me.id, amount: me.cash + 1 });
    expectRefused(s, 'a', { type: 'ceoBonus', companyId: me.id, amount: maxBonus(me) + 1 });
    expectRefused(s, 'a', { type: 'expandCapacity', companyId: me.id, productId: me.products[0].id, lots: 1_000_000 });
    expectRefused(s, 'a', { type: 'buyCommodity', companyId: me.id, commodityId: 'oil', lots: 100_000 });
    expectRefused(s, 'a', { type: 'sellCommodity', companyId: me.id, commodityId: 'oil', lots: 1 }); // pas de stock
    expectRefused(s, 'a', { type: 'poisonPill', companyId: me.id }); // personne à 25 %
    expectRefused(s, 'a', { type: 'merge', absorberId: me.id, targetId: me.id });
    me.cash = 100;
    expectRefused(s, 'a', { type: 'crisisComms', companyId: me.id });
    expectRefused(s, 'a', { type: 'launchProduct', companyId: me.id, sectorId: 'crypto', name: 'Coin' });
    expectRefused(s, 'a', { type: 'shady', companyId: me.id, kind: 'lobbying', sectorId: 'crypto' });
  });

  it('start-up : retour en jeu seulement, investissement minimum, cash perso, une par tour', () => {
    const s = setup();
    // Tant que le joueur contrôle une entreprise, la start-up est refusée (retour en jeu, §7).
    expect(expectRefused(s, 'a', { type: 'foundStartup', name: 'Filiale', sectorId: 'crypto', investment: 2_000 })).toContain('réservée');
    const mine = companyOf(s, 'a');
    mine.controllerId = null; // évincé (sans parachute)
    expectRefused(s, 'a', { type: 'foundStartup', name: 'Mini', sectorId: 'crypto', investment: MIN_STARTUP_INVESTMENT - 1 });
    expectRefused(s, 'a', { type: 'foundStartup', name: 'Trop', sectorId: 'crypto', investment: 1e6 });
    expectRefused(s, 'a', { type: 'foundStartup', name: '   ', sectorId: 'crypto', investment: 2_000 });
    // Au tour 1, le joueur vient de fonder son entreprise : une par tour.
    expectRefused(s, 'a', { type: 'foundStartup', name: 'Trop tôt', sectorId: 'crypto', investment: 2_000 });
    resolveTurn(s);
    if (mine.controllerId === 'a') mine.controllerId = null;
    const ok = applyAction(s, 'a', { type: 'foundStartup', name: 'CoinCoin', sectorId: 'crypto', investment: 2_000 });
    expect(ok.ok).toBe(true);
    const startup = Object.values(s.companies).find((c) => c.name === 'CoinCoin')!;
    expect(startup.cash).toBe(3_000);
    expect(startup.holdings.a).toBe(5_000);
    expect(startup.sharesOutstanding).toBe(10_000);
    expect(startup.sharePrice).toBeCloseTo(0.3, 10); // (investissement + subvention) / 10 000
    expect(startup.turnFlags.justFounded).toBe(true);
    expect(startup.controllerId).toBe('a');
    expect(s.players.a.stats.startupsFounded).toBe(1);
    expectRefused(s, 'a', { type: 'foundStartup', name: 'Encore', sectorId: 'gadgets', investment: 1_500 });
  });

  it('actions discutables et rachat : une fois par tour', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    const scandal0 = me.scandal;
    const r = applyAction(s, 'a', { type: 'shady', companyId: me.id, kind: 'tax_optimisation' });
    expect(r.ok).toBe(true);
    expect(me.scandal).toBe(Math.min(100, scandal0 + SHADY_COSTS.tax_optimisation.scandal));
    expect(me.modifiers.some((m) => m.kind === 'tax_optimisation')).toBe(true);
    expect(s.players.a.stats.shadyActions).toBe(1);
    expectRefused(s, 'a', { type: 'shady', companyId: me.id, kind: 'tax_optimisation' });
    expectRefused(s, 'a', { type: 'shady', companyId: me.id, kind: 'smear_campaign' }); // cible manquante
    expectRefused(s, 'a', { type: 'shady', companyId: me.id, kind: 'smear_campaign', targetCompanyId: me.id });
    expect(applyAction(s, 'a', { type: 'buyback', companyId: me.id, shares: 10 }).ok).toBe(true);
    expectRefused(s, 'a', { type: 'buyback', companyId: me.id, shares: 10 });
    resolveTurn(s);
    expect(applyAction(s, 'a', { type: 'buyback', companyId: me.id, shares: 10 }).ok).toBe(true);
  });

  it('partie terminée : toute action est refusée', () => {
    const s = newGame(3, [human('a')], 1);
    resolveTurn(s);
    expect(s.phase).toBe('finished');
    const r = applyAction(s, 'a', { type: 'takePersonalLoan', amount: 1 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/terminée/);
  });
});

describe('effets des actions', () => {
  it("achat d'actions : coût p × S × (e^(n/S) − 1), puis p ← p × e^(n/S) ; vente symétrique", () => {
    const s = setup();
    const npc = npcCompanies(s)[0];
    const p0 = npc.sharePrice;
    const S = npc.sharesOutstanding;
    const cash0 = s.players.a.cash;
    const r = applyAction(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 500 });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/500 actions/);
    expect(s.players.a.cash).toBeCloseTo(cash0 - p0 * S * Math.expm1(500 / S), 6);
    expect(npc.sharePrice).toBeCloseTo(p0 * Math.exp(500 / S), 9);
    expect(npc.holdings.a).toBe(500);
    // vente symétrique
    const p1 = npc.sharePrice;
    const cash1 = s.players.a.cash;
    expect(applyAction(s, 'a', { type: 'sellShares', companyId: npc.id, shares: 200 }).ok).toBe(true);
    expect(s.players.a.cash).toBeCloseTo(cash1 + p1 * S * -Math.expm1(-200 / S), 6);
    expect(npc.sharePrice).toBeCloseTo(p1 * Math.exp(-200 / S), 9);
    expect(npc.holdings.a).toBe(300);
  });

  it('les nombres non entiers sont arrondis vers le bas', () => {
    const s = setup();
    const npc = npcCompanies(s)[0];
    expect(applyAction(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 10.9 }).ok).toBe(true);
    expect(npc.holdings.a).toBe(10);
  });

  it('matières premières : coût moyen pondéré et impact de prix', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    const p0 = s.commodities.sugar.price;
    expect(applyAction(s, 'a', { type: 'buyCommodity', companyId: me.id, commodityId: 'sugar', lots: 90 }).ok).toBe(true);
    const line = me.inventory.sugar!;
    expect(line.lots).toBe(90);
    expect(line.avgCost).toBeCloseTo((p0 * 900 * Math.expm1(90 / 900)) / 90, 9);
    expect(s.commodities.sugar.price).toBeCloseTo(p0 * Math.exp(90 / 900), 9);
    expect(applyAction(s, 'a', { type: 'sellCommodity', companyId: me.id, commodityId: 'sugar', lots: 40 }).ok).toBe(true);
    expect(me.inventory.sugar!.lots).toBe(50);
  });

  it('décisions de production bornées (prix 30-300 %, production ≤ 2 × capacité)', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    const p = me.products[0];
    const ref = SECTORS[p.sectorId].refPrice;
    expect(applyAction(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: p.id, price: 1e9, production: 1e9, marketing: 0, rnd: 0 }).ok).toBe(true);
    expect(p.price).toBe(3 * ref);
    expect(p.production).toBe(2 * p.capacity);
    expect(p.marketing).toBe(0);
    expect(applyAction(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: p.id, price: 0.001 }).ok).toBe(true);
    expect(p.price).toBeCloseTo(0.3 * ref, 9);
  });

  it('bonus : plafond de 10 % du cash par tour, scandale +8 par tranche de 5 %', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    me.cash = 20_000;
    me.scandal = 0;
    const cash0 = me.cash;
    const r = applyAction(s, 'a', { type: 'ceoBonus', companyId: me.id, amount: 0.05 * cash0 });
    expect(r.ok).toBe(true);
    expect(me.scandal).toBeCloseTo(8, 6);
    expect(s.players.a.cash).toBeCloseTo(4_000 + 1_000, 6);
    expect(s.players.a.stats.bonusesTaken).toBeCloseTo(0.05 * cash0, 6);
    expect(maxBonus(me)).toBeCloseTo(0.05 * cash0, 6);
    expectRefused(s, 'a', { type: 'ceoBonus', companyId: me.id, amount: 0.05 * cash0 + 1 });
    expect(applyAction(s, 'a', { type: 'ceoBonus', companyId: me.id, amount: 0.05 * cash0 }).ok).toBe(true);
    expect(maxBonus(me)).toBeCloseTo(0, 6);
    expect(me.scandal).toBeCloseTo(16, 6);
    // bonus > 500 k€ : flash dans le journal
    expect(s.journal[s.journal.length - 1].articles.some((x) => x.kind === 'flash' && x.companyIds?.includes(me.id))).toBe(true);
  });

  it('dividende : réparti au prorata, stats dividendsReceived', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    const bob = s.players.b;
    bob.cash = 1e6;
    expect(applyAction(s, 'b', { type: 'buyShares', companyId: me.id, shares: 1_000 }).ok).toBe(true);
    const aliceCash = s.players.a.cash;
    const bobCash = bob.cash;
    expect(applyAction(s, 'a', { type: 'payDividend', companyId: me.id, amount: 1_000 }).ok).toBe(true);
    expect(s.players.a.cash - aliceCash).toBeCloseTo(400, 6);
    expect(bob.cash - bobCash).toBeCloseTo(100, 6);
    expect(bob.stats.dividendsReceived).toBeCloseTo(100, 6);
  });

  it('prêt personnel : plafond 50 % du portefeuille, remboursement partiel', () => {
    const s = setup();
    const a = s.players.a;
    const limit = personalLoanLimit(s, a);
    expect(limit).toBeGreaterThan(0);
    expect(applyAction(s, 'a', { type: 'takePersonalLoan', amount: limit }).ok).toBe(true);
    expect(a.debt).toBeCloseTo(limit, 6);
    expect(personalLoanLimit(s, a)).toBeCloseTo(0, 6);
    expect(applyAction(s, 'a', { type: 'repayPersonalLoan', amount: 1e12 }).ok).toBe(true); // plafonné à la dette
    expect(a.debt).toBe(0);
  });

  it('les messages de succès sont en français et chiffrés', () => {
    const s = setup();
    const me = companyOf(s, 'a');
    const r = applyAction(s, 'a', { type: 'launchProduct', companyId: me.id, sectorId: 'crypto', name: 'CoinCoin' });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/CoinCoin/);
    expect(r.message).toMatch(/M€|k€/);
  });
});

describe('sûreté', () => {
  it('applyAction ne jette jamais et annule une action interrompue par une erreur interne', () => {
    const s = setup();
    const npc = npcCompanies(s)[0];
    s.players.a.cash = 1e6;
    // Journal corrompu : l'OPA plante au moment de publier le flash, après avoir déjà payé les actions.
    (s as unknown as { journal: unknown }).journal = null;
    const before = snapshot(s);
    const r = applyAction(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 5_001 });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Erreur interne/);
    expect(snapshot(s)).toBe(before);
  });
});
