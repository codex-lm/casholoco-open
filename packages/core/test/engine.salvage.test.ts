import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { bookValue, productSalvageValue, profitWithoutDisposal } from '../src/sim/finance';
import { tr } from '../src/sim/i18n';
import { resolveTargets } from '../src/sim/news';
import { terrainSalvageRate } from '../src/sim/terrains';
import { buildResultArticles, emptyTurnLog } from '../src/sim/turn';
import { SECTOR_IDS, type GameState, type SectorId } from '../src/types';
import { companyOf, config, human } from './helpers';

function setup(hex: boolean, sectorId: SectorId = 'gadgets', lang: 'fr' | 'en' = 'fr'): GameState {
  const state = createGame({ ...config(71, 8), mapMode: hex ? 'hex' : 'classic', lang },
    [human('a', sectorId), human('b', 'energy_drinks')]);
  state.activeEffects = [];
  const company = companyOf(state, 'a');
  company.cash = 100_000;
  company.debt = 0;
  company.scandal = 0;
  company.inventory = {};
  company.sites = [];
  delete company.taxDue;
  delete company.finesDue;
  const product = company.products[0];
  product.capacity = 43;
  product.pendingCapacity = 13;
  product.stock = 7;
  product.lastUnitCost = 123.45;
  if (hex) product.landCost = 3210.25;
  else delete product.landCost;
  return state;
}

function keepProfitableProduct(state: GameState): void {
  const company = companyOf(state, 'a');
  const product = { ...company.products[0], id: 'kept-plant', stock: 0, pendingCapacity: 0,
    marketing: 0, rnd: 0, production: 43, brand: 3, quality: 2 };
  delete product.terrainId;
  delete product.landCost;
  company.products.push(product);
  for (const commodity of Object.values(state.commodities)) commodity.price = 1;
}

describe('discontinued products recover half their purchase value, untaxed', () => {
  for (const hex of [false, true]) {
    describe(hex ? 'hex' : 'classic', () => {
      it.each(SECTOR_IDS)('pays installed and pending capacity, stock and applicable land exactly once (%s)', (sectorId) => {
        const state = setup(hex, sectorId), company = companyOf(state, 'a'), product = company.products[0];
        // Le taux de l'éventuel terrain de départ (revente majorée de l'île) remplace la moitié ordinaire.
        const rate = terrainSalvageRate(state, product, company);
        const expected = rate * (56 * SECTORS[sectorId].capacityCost + 7 * 123.45 + (hex ? 3210.25 : 0));
        const cash = company.cash, rng = state.rngState, value = bookValue(company);
        company.turnFlags.exceptionalLoss = 19;

        const result = applyAction(state, 'a', { type: 'discontinueProduct', companyId: company.id, productId: product.id });

        expect(result.ok, result.message).toBe(true);
        expect(productSalvageValue(product, hex, rate)).toBe(expected);
        expect(company.cash).toBe(cash + expected);
        // Valeur comptable : usine et terrain sortent à la moitié de leur prix, l'encaisse au taux de revente ;
        // seule la fraction non récupérée du stock se perd.
        const plant = 56 * SECTORS[sectorId].capacityCost, land = hex ? 3210.25 : 0;
        expect(bookValue(company)).toBeCloseTo(value + (rate - 0.5) * (plant + land) - (1 - rate) * 7 * 123.45, 8);
        expect(company.turnFlags.exceptionalLoss).toBe(19 + (1 - rate) * 7 * 123.45);
        expect(company.turnFlags).not.toHaveProperty('specialIncome');
        expect(company.turnFlags.specialCharges).toBeUndefined();
        expect(company.products).toEqual([]);
        expect(state.rngState).toBe(rng);
        const before = JSON.stringify(state);
        expect(applyAction(state, 'a', { type: 'discontinueProduct', companyId: company.id, productId: product.id }).ok).toBe(false);
        expect(JSON.stringify(state)).toBe(before);
      });

      it.each([7, 500])('deducts only the stock loss, without taxing salvage or changing operating profit (%s stock)', (stock) => {
        const state = setup(hex), company = companyOf(state, 'a'), product = company.products[0];
        product.stock = stock;
        const loss = (1 - terrainSalvageRate(state, product, company)) * stock * product.lastUnitCost;
        keepProfitableProduct(state);
        expect(applyAction(state, 'a', { type: 'discontinueProduct', companyId: company.id, productId: product.id }).ok).toBe(true);
        // Same post-disposal cash and operations, without the loss entry, isolates its accounting effect.
        const baseline = structuredClone(state), control = companyOf(baseline, 'a');
        delete control.turnFlags.exceptionalLoss;

        resolveTurn(state);
        resolveTurn(baseline);

        const report = company.reports[0], ordinary = control.reports[0];
        expect(report.exceptionalLoss).toBe(loss);
        expect(report).not.toHaveProperty('specialIncome');
        expect(report.revenue).toBe(ordinary.revenue);
        expect(report.cogs).toBe(ordinary.cogs);
        expect(report.products).toEqual(ordinary.products);
        expect(report.netProfit + report.tax - ordinary.netProfit - ordinary.tax).toBeCloseTo(-loss, 8);
        expect(ordinary.tax).toBeGreaterThan(0);
        expect(report.tax).toBeLessThan(ordinary.tax);
        expect(report.exceptionalLossTaxBenefit).toBeCloseTo(ordinary.tax - report.tax, 8);
        if (stock === 500) expect(report.tax).toBe(0);
        expect(report.netProfit).toBeCloseTo(report.revenue - report.cogs - report.marketing - report.rnd
          - report.fixedCosts - (report.amortization ?? 0) - (report.specialCharges ?? 0)
          - loss - report.interest - report.fines - report.tax, 8);
        expect(company.cash).toBe(control.cash);
        expect(company.profitEma).toBeCloseTo(control.profitEma, 8);
        expect(profitWithoutDisposal(report)).toBeCloseTo(ordinary.netProfit, 8);
        expect(company.turnFlags.exceptionalLoss).toBeUndefined();
        expect(getPlayerView(state, 'b').companies.find((c) => c.id === company.id)!.reports[0].exceptionalLoss).toBe(loss);

        // The loss does not change the most-profitable target or the article's selected company/amount.
        for (const c of Object.values(state.companies)) c.reports = [];
        company.reports = [report];
        const rival = companyOf(state, 'b');
        rival.reports = [{ ...ordinary, netProfit: (report.netProfit + ordinary.netProfit) / 2,
          exceptionalLoss: undefined, exceptionalLossTaxBenefit: undefined }];
        expect(resolveTargets(state, 'topProfit', { companies: [], sectors: [], commodities: [], single: {} })).toEqual([company]);
        const articles = buildResultArticles(state, emptyTurnLog(report.turn)).others;
        const bigProfit = articles.find((a) => a.event?.type === 'bigProfit')!;
        expect(bigProfit.companyIds).toEqual([company.id]);
        expect(bigProfit.event?.amount).toBeCloseTo(ordinary.netProfit, 8);
        expect(articles.some((a) => a.event?.type === 'bigLoss' && a.companyIds?.includes(company.id))).toBe(false);

        resolveTurn(state);
        expect(company.reports[1].exceptionalLoss).toBeUndefined();
      });

      it('creates no exceptional entry when stock is empty', () => {
        const state = setup(hex), company = companyOf(state, 'a'), product = company.products[0];
        product.stock = 0;
        const value = bookValue(company);
        const rate = terrainSalvageRate(state, product, company);
        expect(applyAction(state, 'a', { type: 'discontinueProduct', companyId: company.id, productId: product.id }).ok).toBe(true);
        // Sans stock, seul l'écart entre le taux de revente et la moitié comptable fait bouger la valeur.
        const plant = (product.capacity + product.pendingCapacity) * SECTORS[product.sectorId].capacityCost;
        expect(bookValue(company)).toBeCloseTo(value + (rate - 0.5) * (plant + (hex ? product.landCost ?? 0 : 0)), 10);
        expect(company.turnFlags.exceptionalLoss).toBeUndefined();
        resolveTurn(state);
        expect(company.reports[0].exceptionalLoss).toBeUndefined();
        expect(company.reports[0]).not.toHaveProperty('specialIncome');
      });
    });
  }

  it.each(['fr', 'en'] as const)('describes the exact net cash receipt with the bilingual engine catalogue (%s)', (lang) => {
    const state = setup(true, 'crypto', lang), company = companyOf(state, 'a'), product = company.products[0];
    const cash = productSalvageValue(product, true, terrainSalvageRate(state, product, company));
    const result = applyAction(state, 'a', { type: 'discontinueProduct', companyId: company.id, productId: product.id });
    expect(result.ok).toBe(true);
    expect(result.message).toContain(tr(state).act.discontinued(product.name, 7, 56, cash));
    expect(result.message).toContain(lang === 'fr' ? 'nets, sans impôt' : 'net, tax-free');
    expect(result.message).toContain(lang === 'fr' ? 'terrain éventuel' : 'any land');
  });

  it('retains both companies’ unreported stock losses through a merger', () => {
    const state = setup(false), absorber = companyOf(state, 'a'), target = companyOf(state, 'b');
    target.controllerId = 'a';
    target.holdings = { a: 6000 };
    target.products[0].stock = 13;
    target.products[0].lastUnitCost = 80;
    delete absorber.turnFlags.justFounded;
    delete target.turnFlags.justFounded;
    const loss = 0.5 * (7 * 123.45 + 13 * 80);
    for (const company of [absorber, target]) {
      expect(applyAction(state, 'a', { type: 'discontinueProduct', companyId: company.id,
        productId: company.products[0].id }).ok).toBe(true);
    }

    const merged = applyAction(state, 'a', { type: 'merge', absorberId: absorber.id, targetId: target.id });

    expect(merged.ok, merged.message).toBe(true);
    expect(absorber.turnFlags.exceptionalLoss).toBeCloseTo(loss, 8);
    resolveTurn(state);
    expect(absorber.reports[0].exceptionalLoss).toBeCloseTo(loss, 8);
    expect(absorber.reports[0]).not.toHaveProperty('specialIncome');
  });

  it('carries historical disposal loss and tax benefit into merged pro-forma reports', () => {
    const state = setup(false), absorber = companyOf(state, 'a'), target = companyOf(state, 'b');
    resolveTurn(state);
    target.controllerId = 'a';
    target.holdings = { a: 6000 };
    absorber.reports[0].exceptionalLoss = 100;
    absorber.reports[0].exceptionalLossTaxBenefit = 25;
    target.reports[0].exceptionalLoss = 200;
    target.reports[0].exceptionalLossTaxBenefit = 40;
    const profit = profitWithoutDisposal(absorber.reports[0]) + profitWithoutDisposal(target.reports[0]);

    expect(applyAction(state, 'a', { type: 'merge', absorberId: absorber.id, targetId: target.id }).ok).toBe(true);

    expect(absorber.reports[0].exceptionalLoss).toBe(300);
    expect(absorber.reports[0].exceptionalLossTaxBenefit).toBe(65);
    expect(profitWithoutDisposal(absorber.reports[0])).toBeCloseTo(profit, 8);
  });
});
