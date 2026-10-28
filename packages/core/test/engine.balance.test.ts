/**
 * Règles d'équilibrage issues de l'audit de profondeur (lot 1) :
 * com' de crise bridée, risque de scandale dès 10, espionnage sans gain pour le leader,
 * lancements et dépenses « hors compte » passés dans le résultat, délit d'initié.
 */
import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { applyAction, getPlayerView, resolveTurn } from '../src/engine';
import {
  CONTROLLED_COLLATERAL_LTV,
  CRISIS_COMMS_COST,
  CRISIS_COMMS_SCANDAL,
  ESPIONAGE_GAP_SHARE,
  LAUNCH_AMORTIZATION_TURNS,
  PERSONAL_LOAN_LTV,
  PROFIT_EMA_KEEP,
  SHADY_COSTS,
} from '../src/sim/constants';
import { bookValue, collateralPrice, effectiveTaxRate, launchChargesLeft, personalLoanLimit, scandalProbability } from '../src/sim/finance';
import { resolveTurnWithLog } from '../src/sim/resolve';
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

function flashes(s: GameState) {
  return s.journal[s.journal.length - 1].articles.filter((x) => x.kind === 'flash');
}

describe('communication de crise', () => {
  it('une seule par entreprise et par tour, −15 de jauge, de nouveau possible au tour suivant', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    me.scandal = 60;
    ok(s, 'a', { type: 'crisisComms', companyId: me.id });
    expect(me.scandal).toBeCloseTo(60 + CRISIS_COMMS_SCANDAL, 6);
    expect(CRISIS_COMMS_SCANDAL).toBe(-13);
    const msg = refused(s, 'a', { type: 'crisisComms', companyId: me.id });
    expect(msg).toMatch(/Une seule communication de crise/);
    resolveTurn(s);
    ok(s, 'a', { type: 'crisisComms', companyId: me.id });
  });

  it('son coût entre dans le compte de résultat du trimestre', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    ok(s, 'a', { type: 'crisisComms', companyId: me.id });
    resolveTurn(s);
    expect(me.reports[0].specialCharges).toBeCloseTo(CRISIS_COMMS_COST, 6);
  });
});

describe('risque de scandale', () => {
  it('p = clamp((jauge − 10) / 90, 0, 1)^1,5', () => {
    expect(scandalProbability(0)).toBe(0);
    expect(scandalProbability(10)).toBe(0);
    expect(scandalProbability(20)).toBeCloseTo((10 / 90) ** 1.5, 9);
    expect(scandalProbability(55)).toBeCloseTo(0.5 ** 1.5, 9);
    expect(scandalProbability(100)).toBe(1);
    expect(scandalProbability(150)).toBe(1);
  });

  it('une jauge de 10 n’éclate jamais ; une jauge de 30 n’est plus sans risque', () => {
    let blown = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = duo(seed);
      const me = companyOf(s, 'a');
      me.scandal = 10;
      const other = companyOf(s, 'b');
      other.scandal = 30;
      const log = resolveTurnWithLog(s)!;
      expect(log.scandals.some((x) => x.companyId === me.id)).toBe(false);
      if (log.scandals.some((x) => x.companyId === other.id)) blown++;
    }
    expect(blown).toBeGreaterThan(0);
  });
});

describe('espionnage industriel', () => {
  it('le meilleur produit du secteur ne gagne rien : refus clair, état inchangé', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    for (const c of Object.values(s.companies)) for (const p of c.products) if (p.sectorId === 'energy_drinks') p.quality = 1;
    me.products[0].quality = 2;
    const msg = refused(s, 'a', { type: 'shady', companyId: me.id, kind: 'industrial_espionage' });
    expect(msg).toMatch(/rien à copier/);
  });

  it('gain = 30 % de l’écart, seulement pour les produits distancés', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    ok(s, 'a', { type: 'launchProduct', companyId: me.id, sectorId: 'gadgets', name: 'Gadget' });
    for (const c of Object.values(s.companies)) {
      for (const p of c.products) p.quality = p.sectorId === 'energy_drinks' ? 1.2 : 1.5;
    }
    const [drink, gadget] = me.products;
    drink.quality = 2; // leader de son secteur
    gadget.quality = 1; // distancé de 0,5
    ok(s, 'a', { type: 'shady', companyId: me.id, kind: 'industrial_espionage' });
    expect(drink.quality).toBe(2);
    expect(gadget.quality).toBeCloseTo(1 + ESPIONAGE_GAP_SHARE * 0.5, 9);
  });
});

describe('dépenses au compte de résultat', () => {
  it('un lancement est étalé sur 4 trimestres, sans toucher deux fois à la trésorerie', () => {
    // Graine sans news qui touche la trésorerie d'Alice après le rapport (sinon cashEnd et la caisse divergent).
    const s = duo(7);
    const me = companyOf(s, 'a');
    const cost = SECTORS.crypto.launchCost;
    const cash0 = me.cash;
    const r = ok(s, 'a', { type: 'launchProduct', companyId: me.id, sectorId: 'crypto', name: 'CoinCoin' });
    expect(r.message).toMatch(/4 trimestres/);
    expect(me.cash).toBeCloseTo(cash0 - cost, 6);
    expect(launchChargesLeft(me)).toBeCloseTo(cost, 6);
    expect(getPlayerView(s, 'a').companies.find((c) => c.id === me.id)!.private!.launchChargesLeft).toBeCloseTo(cost, 6);
    expect(getPlayerView(s, 'b').companies.find((c) => c.id === me.id)!.private).toBeUndefined();
    for (let t = 1; t <= LAUNCH_AMORTIZATION_TURNS; t++) {
      resolveTurn(s);
      const rep = me.reports[me.reports.length - 1];
      expect(rep.amortization).toBeCloseTo(cost / LAUNCH_AMORTIZATION_TURNS, 6);
      expect(rep.netProfit).toBeCloseTo(
        rep.revenue - rep.cogs - rep.marketing - rep.rnd - rep.fixedCosts - (rep.amortization ?? 0) - (rep.specialCharges ?? 0) - rep.interest - rep.fines - rep.tax,
        6,
      );
      // La charge étalée ne sort pas une seconde fois de la trésorerie.
      expect(rep.cashEnd).toBeCloseTo(me.cash, 6);
    }
    expect(me.launchCharges).toBeUndefined();
    resolveTurn(s);
    expect(me.reports[me.reports.length - 1].amortization).toBeUndefined();
  });

  it('les actions discutables pèsent sur profitEma (donc sur le cours), pas seulement sur la trésorerie', () => {
    const definition = SECTORS.energy_drinks;
    try {
      // Une usine rentable dans les deux branches isole la charge et son économie d'impôt.
      // Les marges de la campagne d'équilibrage ne doivent pas décider de ce contrat comptable.
      SECTORS.energy_drinks = {
        ...definition, refPrice: 100, refDemand: 500, startingCapacity: 30,
        laborCost: 20, inputs: {}, fixedCost: 100,
      };
      const base = duo();
      const lob = duo();
      const meB = companyOf(base, 'a');
      const meL = companyOf(lob, 'a');
      for (const c of [meB, meL]) {
        c.products[0].marketing = 0;
        c.products[0].rnd = 0;
      }
      // Lobbying sur un secteur où l'entreprise n'est pas : aucun effet sur ses ventes.
      ok(lob, 'a', { type: 'shady', companyId: meL.id, kind: 'lobbying', sectorId: 'crypto' });
      const rate = effectiveTaxRate(base);
      resolveTurn(base);
      resolveTurn(lob);
      expect(meL.reports[0].specialCharges).toBeCloseTo(SHADY_COSTS.lobbying.cost, 6);
      expect(meL.reports[0].netProfit).toBeGreaterThan(0); // impôt au même taux dans les deux parties
      expect(meB.reports[0].revenue).toBe(meL.reports[0].revenue);
      const expected = (1 - PROFIT_EMA_KEEP) * SHADY_COSTS.lobbying.cost * (1 - rate);
      expect(meB.profitEma - meL.profitEma).toBeCloseTo(expected, 6);
    } finally {
      SECTORS.energy_drinks = definition;
    }
  });

  it('une fusion reprend les lancements restant à étaler et les charges du tour', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const npc = npcCompanies(s)[0];
    s.players.a.cash = 1e7;
    ok(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 6_000 });
    ok(s, 'a', { type: 'launchProduct', companyId: npc.id, sectorId: 'yogurts', name: 'Yop' });
    ok(s, 'a', { type: 'crisisComms', companyId: npc.id });
    ok(s, 'a', { type: 'merge', absorberId: me.id, targetId: npc.id });
    expect(launchChargesLeft(me)).toBeCloseTo(SECTORS.yogurts.launchCost, 6);
    expect(me.turnFlags.specialCharges).toBeCloseTo(CRISIS_COMMS_COST, 6);
    // Le PDG n'a pas fait de com' de crise pour l'absorbante : elle reste possible.
    ok(s, 'a', { type: 'crisisComms', companyId: me.id });
  });

  it('la valeur comptable ne compte pas les lancements restant à étaler (pas de lancement gratuit au dernier tour)', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const bv0 = bookValue(me);
    ok(s, 'a', { type: 'launchProduct', companyId: me.id, sectorId: 'crypto', name: 'CoinCoin' });
    const def = SECTORS.crypto;
    // Seule l'usine neuve compte (à 50 % de son coût), comme toute capacité.
    expect(bookValue(me)).toBeCloseTo(bv0 - def.launchCost + 0.5 * def.startingCapacity * def.capacityCost, 6);
  });
});

describe('délit d’initié', () => {
  it('le contrôleur qui achète ses actions : +1 de jauge par 1 % du capital, flash à partir de 5 % dans le tour', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    s.players.a.cash = 1e6;
    me.scandal = 0;
    const S = me.sharesOutstanding;
    const f0 = flashes(s).length;
    const r = ok(s, 'a', { type: 'buyShares', companyId: me.id, shares: 0.01 * S });
    expect(me.scandal).toBeCloseTo(1, 6);
    expect(r.message).toMatch(/délit d’initié/);
    expect(flashes(s).length).toBe(f0);
    ok(s, 'a', { type: 'buyShares', companyId: me.id, shares: 0.04 * S });
    expect(me.scandal).toBeCloseTo(5, 6);
    const news = flashes(s).slice(f0);
    expect(news).toHaveLength(1);
    expect(news[0].companyIds).toEqual([me.id]);
    expect(news[0].title).toMatch(/Alice/);
    // Un seul flash par tour, même si le PDG continue.
    ok(s, 'a', { type: 'buyShares', companyId: me.id, shares: 0.05 * S });
    expect(flashes(s).length).toBe(f0 + 1);
    expect(me.scandal).toBeCloseTo(10, 6);
  });

  it('acheter une entreprise qu’on ne contrôle pas (même jusqu’à l’OPA) ne compte pas', () => {
    const s = duo();
    const npc = npcCompanies(s)[0];
    const bob = companyOf(s, 'b');
    s.players.a.cash = 1e7;
    const sc0 = npc.scandal;
    const scB = bob.scandal;
    ok(s, 'a', { type: 'buyShares', companyId: npc.id, shares: 6_000 });
    ok(s, 'a', { type: 'buyShares', companyId: bob.id, shares: 1_000 });
    expect(npc.scandal).toBe(sc0);
    expect(bob.scandal).toBe(scB);
  });

  it('prêt perso : les actions des entreprises contrôlées ne comptent qu’à 25 %', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const bob = companyOf(s, 'b');
    s.players.a.cash = 1e6;
    ok(s, 'a', { type: 'buyShares', companyId: bob.id, shares: 1_000 });
    const expected =
      CONTROLLED_COLLATERAL_LTV * me.holdings.a * collateralPrice(me) + PERSONAL_LOAN_LTV * bob.holdings.a * collateralPrice(bob);
    expect(personalLoanLimit(s, s.players.a)).toBeCloseTo(expected, 6);
  });

  it('message en anglais dans un salon anglais, mêmes nombres', () => {
    const fr = duo(11, 16, 'fr');
    const en = duo(11, 16, 'en');
    for (const s of [fr, en]) s.players.a.cash = 1e6;
    const r = ok(en, 'a', { type: 'buyShares', companyId: companyOf(en, 'a').id, shares: 600 });
    ok(fr, 'a', { type: 'buyShares', companyId: companyOf(fr, 'a').id, shares: 600 });
    expect(r.message).toMatch(/insider trading/);
    expect(companyOf(en, 'a').scandal).toBe(companyOf(fr, 'a').scandal);
    expect(flashes(en).at(-1)!.title).toMatch(/Alice/);
  });
});
