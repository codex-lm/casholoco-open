import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, resolveTurn } from '../src/engine';
import { floatShares } from '../src/sim/finance';
import type { GameState } from '../src/types';
import { companyOf, human, newGame, npcCompanies } from './helpers';

function setup(): GameState {
  const s = newGame(21, [human('a', 'energy_drinks', 'Alice'), human('b', 'gadgets', 'Bob'), human('c', 'crypto', 'Chloé')]);
  // Des poches profondes pour les besoins des tests.
  for (const p of Object.values(s.players)) p.cash = 1e6;
  return s;
}

const flashes = (s: GameState) => s.journal[s.journal.length - 1].articles.filter((a) => a.kind === 'flash');

describe('contrôle et OPA', () => {
  it('prise de contrôle > 50 % avec parachute doré pour le PDG évincé', () => {
    const s = setup();
    const target = companyOf(s, 'b');
    target.cash = 20_000;
    const bobCash = s.players.b.cash;
    // Palier 25 % puis 40 % : flashs « stakeBuilding »
    expect(applyAction(s, 'a', { type: 'buyShares', companyId: target.id, shares: 2_600 }).ok).toBe(true);
    expect(flashes(s).filter((f) => f.companyIds?.includes(target.id))).toHaveLength(1);
    expect(applyAction(s, 'a', { type: 'buyShares', companyId: target.id, shares: 1_500 }).ok).toBe(true);
    expect(flashes(s).filter((f) => f.companyIds?.includes(target.id))).toHaveLength(2);
    expect(target.controllerId).toBe('b');
    // 5 000 actions = exactement 50 % : pas encore le contrôle
    expect(applyAction(s, 'a', { type: 'buyShares', companyId: target.id, shares: 900 }).ok).toBe(true);
    expect(target.holdings.a).toBe(5_000);
    expect(target.controllerId).toBe('b');
    // 5 001 : OPA
    const r = applyAction(s, 'a', { type: 'buyShares', companyId: target.id, shares: 1 });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/contrôle/);
    expect(target.controllerId).toBe('a');
    expect(target.ceoName).toBe('Alice');
    // Parachute : 5 % du cash, au moins 500 k€ (plafonné au cash)
    expect(s.players.b.cash - bobCash).toBeCloseTo(1_000, 6);
    expect(target.cash).toBeCloseTo(19_000, 6);
    expect(s.players.b.stats.parachutes).toBeCloseTo(1_000, 6);
    expect(s.players.b.stats.takeoversSuffered).toBe(1);
    expect(s.players.b.lastOustedTurn).toBe(s.turn);
    expect(s.players.a.stats.takeoversWon).toBe(1);
    expect(flashes(s).some((f) => f.tone === 'drama' && f.companyIds?.includes(target.id) && f.body.includes('Bob'))).toBe(true);
    // Bob garde ses actions mais plus les commandes
    expect(target.holdings.b).toBe(4_000);
    expect(applyAction(s, 'b', { type: 'takeLoan', companyId: target.id, amount: 10 }).ok).toBe(false);
    expect(getPlayerView(s, 'a').companies.find((c) => c.id === target.id)!.private).toBeDefined();
    expect(getPlayerView(s, 'b').companies.find((c) => c.id === target.id)!.private).toBeUndefined();
  });

  it('parachute minimum 500 k€, plafonné au cash', () => {
    const s = setup();
    const target = companyOf(s, 'b');
    target.cash = 300;
    const bobCash = s.players.b.cash;
    expect(applyAction(s, 'a', { type: 'buyShares', companyId: target.id, shares: 5_001 }).ok).toBe(true);
    expect(target.controllerId).toBe('a');
    expect(s.players.b.cash - bobCash).toBeCloseTo(300, 6);
    expect(target.cash).toBeCloseTo(0, 6);
  });

  it('OPA sur une entreprise PNJ : pas de parachute, filiale du joueur', () => {
    const s = setup();
    const npc = npcCompanies(s)[0];
    expect(npc.controllerId).toBeNull();
    const cash = npc.cash;
    expect(applyAction(s, 'c', { type: 'buyShares', companyId: npc.id, shares: 5_001 }).ok).toBe(true);
    expect(npc.controllerId).toBe('c');
    expect(npc.cash).toBe(cash);
    // Chloé pilote désormais la filiale
    expect(applyAction(s, 'c', { type: 'setProductDecisions', companyId: npc.id, productId: npc.products[0].id, price: npc.products[0].price * 1.1 }).ok).toBe(true);
  });

  it('un contrôleur sans action passe la main au plus gros actionnaire (≥ 10 %) ou au pilote automatique', () => {
    const s = setup();
    const alice = companyOf(s, 'a');
    expect(applyAction(s, 'c', { type: 'buyShares', companyId: alice.id, shares: 1_500 }).ok).toBe(true);
    expect(applyAction(s, 'a', { type: 'sellShares', companyId: alice.id, shares: 4_000 }).ok).toBe(true);
    expect(alice.controllerId).toBe('c');
    expect(applyAction(s, 'c', { type: 'sellShares', companyId: alice.id, shares: 1_500 }).ok).toBe(true);
    expect(alice.controllerId).toBeNull();
    expect(alice.status).toBe('active');
  });

  it('rachat d’actions qui fait passer un autre actionnaire au-dessus de 50 %', () => {
    const s = setup();
    const alice = companyOf(s, 'a');
    alice.cash = 1e6;
    // Alice ne garde que 5 % : le flottant reste au-dessus de 40 % après le rachat (§6.2).
    expect(applyAction(s, 'a', { type: 'sellShares', companyId: alice.id, shares: 3_500 }).ok).toBe(true);
    expect(applyAction(s, 'b', { type: 'buyShares', companyId: alice.id, shares: 4_700 }).ok).toBe(true);
    expect(alice.controllerId).toBe('a');
    const r = applyAction(s, 'a', { type: 'buyback', companyId: alice.id, shares: 1_000 });
    expect(r.ok).toBe(true);
    expect(alice.sharesOutstanding).toBe(9_000);
    expect(alice.controllerId).toBe('b');
  });

  it('pilule empoisonnée : 40 % d’actions neuves à mi-prix, recharge de 3 tours', () => {
    const s = setup();
    const alice = companyOf(s, 'a');
    expect(applyAction(s, 'b', { type: 'buyShares', companyId: alice.id, shares: 3_000 }).ok).toBe(true);
    const price = alice.sharePrice;
    const aliceCash = s.players.a.cash;
    const companyCash = alice.cash;
    const scandal0 = alice.scandal;
    const r = applyAction(s, 'a', { type: 'poisonPill', companyId: alice.id });
    expect(r.ok).toBe(true);
    expect(alice.sharesOutstanding).toBe(14_000);
    expect(alice.holdings.a).toBe(8_000);
    expect(s.players.a.cash).toBeCloseTo(aliceCash - 4_000 * 0.5 * price, 6);
    expect(alice.cash).toBeCloseTo(companyCash + 4_000 * 0.5 * price, 6);
    expect(alice.scandal).toBeCloseTo(Math.min(100, scandal0 + 15), 6);
    expect(applyAction(s, 'a', { type: 'poisonPill', companyId: alice.id }).ok).toBe(false);
    resolveTurn(s);
    resolveTurn(s);
    expect(applyAction(s, 'a', { type: 'poisonPill', companyId: alice.id }).ok).toBe(false);
    resolveTurn(s);
    // 3 résolutions plus tard, la recharge est terminée (Bob détient encore ≥ 25 % ? sinon refus pour autre motif)
    const bobShare = (alice.holdings.b ?? 0) / alice.sharesOutstanding;
    expect(applyAction(s, 'a', { type: 'poisonPill', companyId: alice.id }).ok).toBe(bobShare >= 0.25);
  });

  it('fusion : transfert du cash, de la dette, des produits ; actionnaires convertis au ratio des cours', () => {
    const s = setup();
    const alice = companyOf(s, 'a');
    const npc = npcCompanies(s).find((c) => c.products[0].sectorId !== alice.products[0].sectorId)!;
    expect(applyAction(s, 'b', { type: 'buyShares', companyId: npc.id, shares: 1_000 }).ok).toBe(true);
    // 50 % + 1 action : au-delà, le flottant tomberait sous 40 % (§6.2).
    expect(applyAction(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 5_001 }).ok).toBe(true);
    expect(npc.controllerId).toBe('a');
    const ratio = npc.sharePrice / alice.sharePrice;
    const S0 = alice.sharesOutstanding;
    const aliceShares0 = alice.holdings.a;
    const cashSum = alice.cash + npc.cash;
    const debtSum = alice.debt + npc.debt;
    const npcFloat = floatShares(npc);
    const nProducts = alice.products.length + npc.products.length;
    const r = applyAction(s, 'a', { type: 'merge', absorberId: alice.id, targetId: npc.id });
    expect(r.ok).toBe(true);
    expect(npc.status).toBe('merged');
    expect(npc.holdings).toEqual({});
    expect(npc.products).toHaveLength(0);
    expect(alice.products).toHaveLength(nProducts);
    expect(alice.cash).toBeCloseTo(cashSum, 6);
    expect(alice.debt).toBeCloseTo(debtSum, 6);
    expect(alice.holdings.b).toBe(Math.floor(1_000 * ratio));
    expect(alice.holdings.a).toBe(aliceShares0 + Math.floor(5_001 * ratio));
    expect(alice.sharesOutstanding).toBe(S0 + Math.floor(1_000 * ratio) + Math.floor(5_001 * ratio) + Math.round(npcFloat * ratio));
    // l'entreprise absorbée n'est plus négociable
    expect(applyAction(s, 'b', { type: 'buyShares', companyId: npc.id, shares: 1 }).ok).toBe(false);
    expect(flashes(s).some((f) => f.companyIds?.includes(npc.id))).toBe(true);
    // la partie continue proprement
    resolveTurn(s);
    expect(npc.priceHistory.length).toBe(1);
  });
});
