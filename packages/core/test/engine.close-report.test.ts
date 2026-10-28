import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, resolveTurn } from '../src/engine';
import { WHISTLEBLOW_COST } from '../src/sim/constants';
import { personalInterestRate, rumorCheckPrice } from '../src/sim/finance';
import type { Action, GameState } from '../src/types';
import { companyOf, human, newGame } from './helpers';

function ok(state: GameState, who: string, action: Action) {
  const result = applyAction(state, who, action);
  expect(result.ok, result.message).toBe(true);
}

function quiet(state: GameState) {
  for (const company of Object.values(state.companies)) {
    company.cash = 50_000;
    for (const product of company.products) {
      product.production = 0; product.marketing = 0; product.rnd = 0;
    }
  }
}

describe('complete frozen quarter report', () => {
  it('records exact opening and closing fortune at the first close, before following news', () => {
    const state = newGame(44, [human('a'), human('b', 'gadgets')]);
    const opening = structuredClone(state.players.a.openingFortuneSnapshot!);
    expect(getPlayerView(state, 'a').self?.closeRecap).toBeUndefined();
    state.scheduledNews = [{ turn: 2, cardId: 'central_bank_cut' }];
    resolveTurn(state);
    const recap = state.players.a.closeRecap!, fortune = recap.fortune!;
    expect(recap.previousNetWorth).toBeUndefined();
    expect(fortune.cashBefore).toBe(opening.cash);
    expect(fortune.debtBefore).toBe(opening.debt);
    expect(fortune.netWorthBefore).toBe(opening.netWorth);
    expect(fortune.cashAfter + fortune.portfolioAfter - fortune.debtAfter).toBe(recap.netWorth);
    expect(fortune.holdings.reduce((sum, h) => sum + h.sharesAfter * h.priceAfter, 0)).toBe(fortune.portfolioAfter);
    expect(fortune.holdings.reduce((sum, h) => sum + h.sharesBefore! * h.priceBefore!, 0)).toBe(fortune.portfolioBefore);
    const b = fortune.breakdown!;
    expect(b.sharePrices + b.dividendsAndBonuses + b.personalCosts + b.otherMovements)
      .toBeCloseTo(recap.netWorth - fortune.netWorthBefore!, 9);
    expect(state.players.a.openingFortuneSnapshot).toBeUndefined();
  });

  it('records bought/sold holdings, separate personal income and all fees once', () => {
    const state = newGame(17, [human('a'), human('b', 'gadgets')]);
    quiet(state);
    resolveTurn(state);
    quiet(state);
    const previous = structuredClone(state.players.a.closeRecap!);
    const mine = companyOf(state, 'a'), rival = companyOf(state, 'b');
    ok(state, 'a', { type: 'payDividend', companyId: mine.id, amount: 100 });
    ok(state, 'a', { type: 'ceoBonus', companyId: mine.id, amount: 50 });
    ok(state, 'a', { type: 'buyShares', companyId: rival.id, shares: 10 });
    ok(state, 'a', { type: 'sellShares', companyId: rival.id, shares: 5 });
    ok(state, 'a', { type: 'takePersonalLoan', amount: 500 });
    state.journal.at(-1)!.rumors.push({ text: 'Test', reliability: 'faible' });
    const tips = rumorCheckPrice(state, state.players.a);
    ok(state, 'a', { type: 'checkRumor', turn: state.turn, index: 0 });
    ok(state, 'a', { type: 'whistleblow', companyId: rival.id });
    const interest = state.players.a.debt * personalInterestRate(state);
    resolveTurn(state);
    const recap = state.players.a.closeRecap!, fortune = recap.fortune!;
    expect(fortune.cashBefore).toBe(previous.fortune!.cashAfter);
    expect(fortune.debtBefore).toBe(previous.fortune!.debtAfter);
    expect(fortune.debtAfter).toBe(500);
    expect(fortune.holdings.find((h) => h.companyId === rival.id)).toMatchObject({
      sharesBefore: 0, sharesAfter: 5, bought: 10, sold: 5,
    });
    expect(fortune.dividends! + fortune.bonuses!).toBe(recap.breakdown!.dividendsAndBonuses);
    expect(fortune.bonuses).toBe(50);
    expect(fortune.interest).toBe(interest);
    expect(fortune.tips).toBe(tips);
    expect(fortune.whistleblowing).toBe(WHISTLEBLOW_COST);
    expect(recap.breakdown!.personalCosts).toBe(-(interest + tips + WHISTLEBLOW_COST));
    expect(fortune.cashAfter + fortune.portfolioAfter - fortune.debtAfter).toBe(recap.netWorth);
    expect(state.players.a.quarterPersonalCostDetails).toEqual({ interest: 0, tips: 0, whistleblowing: 0 });
  });

  it('freezes product sales, spoilage, profit and exact scandal fine effects for its controller', () => {
    const state = newGame(19, [human('a', 'yogurts'), human('b', 'gadgets')]);
    quiet(state);
    const company = companyOf(state, 'a'), product = company.products[0];
    product.stock = 20; product.price = 100_000;
    company.scandal = 100;
    company.turnFlags.shadyDone = ['tax_optimisation'];
    const reputation = company.reputation;
    resolveTurn(state);
    const recap = state.players.a.closeRecap!, details = recap.companies!.find((c) => c.companyId === company.id)!;
    const fine = details.fineCauses[0], row = details.report!.products[0];
    expect(fine).toMatchObject({ cause: 'scandal', amount: details.report!.fines, scandalBefore: 100,
      scandalAfter: 15, reputationBefore: reputation, reputationAfter: reputation - 0.15,
      shadyActions: ['tax_optimisation'] });
    expect(row).toMatchObject({ productId: product.id, averagePrice: 100_000, stockLeft: product.stock });
    expect(row.demand).toBeGreaterThanOrEqual(row.sold);
    expect(row.sold + row.stockLeft! + row.spoiled!).toBeCloseTo(20, 9);
    expect(row.spoiled).toBeGreaterThan(0);
    expect(row.margin).toBeCloseTo(details.report!.revenue - details.report!.cogs, 9);
    expect(details.scandalAfter).toBe(15);
    const frozen = JSON.stringify(recap);
    ok(state, 'a', { type: 'setProductDecisions', companyId: company.id, productId: product.id, price: 5 });
    expect(JSON.stringify(state.players.a.closeRecap)).toBe(frozen);
    expect(getPlayerView(state, 'b').self!.closeRecap!.companies!.some((c) => c.companyId === company.id)).toBe(false);
    expect(getPlayerView(state, 'b').companies.find((c) => c.id === company.id)!.reports[0].products).toEqual([]);
  });

  it('retains accepted, declined, cancelled, failed and expired offers and final contract penalties', () => {
    const state = newGame(5, [human('a'), human('b', 'gadgets'), human('c', 'yogurts')]);
    quiet(state);
    const mine = companyOf(state, 'a'), rival = companyOf(state, 'b');
    for (const outcome of ['accepted', 'declined', 'cancelled', 'failed', 'pending'] as const) {
      ok(state, 'a', { type: 'offerShares', companyId: mine.id, counterpartyId: 'b', shares: 10,
        price: mine.sharePrice, side: 'sell' });
      const offer = state.offers!.at(-1)!;
      if (outcome === 'accepted') ok(state, 'b', { type: 'answerOffer', offerId: offer.id, accept: true });
      if (outcome === 'declined') ok(state, 'b', { type: 'answerOffer', offerId: offer.id, accept: false });
      if (outcome === 'cancelled') ok(state, 'a', { type: 'cancelOffer', offerId: offer.id });
      if (outcome === 'failed') {
        const cash = state.players.b.cash;
        state.players.b.cash = 0;
        const answer = applyAction(state, 'b', { type: 'answerOffer', offerId: offer.id, accept: true });
        expect(answer.ok).toBe(false);
        // Human rejection leaves the offer pending; a persisted terminal status must still be preserved.
        expect(offer.status).toBe('pending');
        offer.status = 'failed';
        state.players.b.cash = cash;
      }
    }
    const contractPrice = state.commodities.sugar.price;
    mine.inventory.sugar = { lots: 2, avgCost: contractPrice };
    ok(state, 'a', { type: 'offerContract', sellerCompanyId: mine.id, buyerCompanyId: rival.id,
      commodityId: 'sugar', lots: 5, price: contractPrice, turns: 1 });
    ok(state, 'b', { type: 'answerOffer', offerId: state.offers!.at(-1)!.id, accept: true });
    const expectedPenalty = 3 * (contractPrice * 1.1 - contractPrice);
    resolveTurn(state);
    expect(state.offers).toEqual([]);
    expect(state.contracts).toEqual([]);
    const settled = state.players.a.closeRecap!.settlements!;
    expect(settled.offers.map((o) => o.status)).toEqual(['accepted', 'declined', 'cancelled', 'failed', 'expired', 'accepted']);
    expect(settled.contracts[0]).toMatchObject({ outcome: 'partial', lastDelivered: 2, lastPenalty: expectedPenalty,
      turnsLeft: 0, lots: 5 });
    expect(state.players.b.closeRecap!.settlements!.contracts).toEqual(settled.contracts);
    expect(state.players.c.closeRecap!.settlements!.offers).toEqual([]);
    expect(state.players.c.closeRecap!.settlements!.contracts).toEqual([]);
  });

  it('re-redacts company secrets after a later control transfer and detaches the snapshot', () => {
    const state = newGame(19, [human('a', 'yogurts'), human('b', 'gadgets')]);
    quiet(state);
    const company = companyOf(state, 'a');
    company.scandal = 100; company.products[0].stock = 20; company.products[0].price = 100_000;
    company.turnFlags.shadyDone = ['tax_optimisation'];
    resolveTurn(state);
    company.controllerId = 'b';
    const view = getPlayerView(state, 'a'), details = view.self!.closeRecap!.companies![0];
    expect(details.report!.products).toEqual([]);
    expect(details).not.toHaveProperty('scandalBefore');
    expect(details).not.toHaveProperty('scandalAfter');
    expect(details.fineCauses[0]).toMatchObject({ cause: 'scandal', amount: company.reports[0].fines });
    expect(details.fineCauses[0]).not.toHaveProperty('shadyActions');
    expect(details.fineCauses[0]).not.toHaveProperty('scandalBefore');
    expect(view.self!.closeRecap!.facts.some((f) => f.type === 'stock')).toBe(false);
    details.fineCauses[0].amount = -1;
    expect(state.players.a.closeRecap!.companies![0].fineCauses[0].amount).toBeGreaterThan(0);
    expect(getPlayerView(state, 'spectator').self).toBeUndefined();
  });

  it.each([
    { stock: 5, bankrupt: false, outcome: 'delivered', delivered: 5 },
    { stock: 0, bankrupt: false, outcome: 'failed', delivered: 0 },
    { stock: 5, bankrupt: true, outcome: 'ended', delivered: undefined },
  ] as const)('keeps the final $outcome contract without replaying an old delivery', ({ stock, bankrupt, outcome, delivered }) => {
    const state = newGame(5, [human('a'), human('b', 'gadgets')]);
    quiet(state);
    const seller = companyOf(state, 'a'), buyer = companyOf(state, 'b');
    const price = state.commodities.sugar.price;
    seller.inventory.sugar = { lots: stock, avgCost: price };
    state.contracts = [{ id: 'last-contract', sellerCompanyId: seller.id, buyerCompanyId: buyer.id,
      commodityId: 'sugar', lots: 5, price, turnsLeft: 1, lastDelivered: 4, lastPenalty: 60 }];
    if (bankrupt) seller.cash = 0;
    resolveTurn(state);
    const settled = state.players.a.closeRecap!.settlements!.contracts[0];
    expect(state.contracts).toEqual([]);
    expect(settled.outcome).toBe(outcome);
    expect(settled.lastDelivered).toBe(delivered);
    if (outcome === 'ended' || outcome === 'delivered') expect(settled.lastPenalty).toBeUndefined();
    else expect(settled.lastPenalty).toBeGreaterThan(0);
  });

  it('loads older saves without inventing unavailable beginning balances or partial fee categories', () => {
    let state = newGame(38, [human('a'), human('b', 'gadgets')]);
    for (const player of Object.values(state.players)) {
      delete player.openingFortuneSnapshot;
      delete player.quarterPersonalCosts;
      delete player.quarterPersonalCostDetails;
    }
    delete (state as Partial<GameState>).shareSales;
    state = JSON.parse(JSON.stringify(state)) as GameState;
    resolveTurn(state);
    const first = state.players.a.closeRecap!.fortune!;
    expect(first.cashBefore).toBeUndefined();
    expect(first.portfolioBefore).toBeUndefined();
    expect(first.interest).toBeUndefined();
    expect(first.breakdown).toBeUndefined();
    resolveTurn(state);
    expect(state.players.a.closeRecap!.fortune!.cashBefore).toBe(first.cashAfter);
    expect(state.players.a.closeRecap!.fortune!.interest).toBe(0);
    expect(state.players.a.closeRecap!.fortune!.breakdown).toBeDefined();
  });

  it('keeps the added private product details redacted from other viewers after the final close', () => {
    const state = newGame(19, [human('a', 'yogurts'), human('b', 'gadgets')], 1);
    resolveTurn(state);
    const id = companyOf(state, 'a').id;
    const mine = getPlayerView(state, 'a').companies.find((c) => c.id === id)!.reports[0].products[0];
    expect(mine).toHaveProperty('demand');
    for (const viewer of ['b', 'spectator']) {
      const product = getPlayerView(state, viewer).companies.find((c) => c.id === id)!.reports[0].products[0];
      expect(product).not.toHaveProperty('demand');
      expect(product).not.toHaveProperty('margin');
      expect(product).not.toHaveProperty('stockLeft');
      expect(product).not.toHaveProperty('spoiled');
    }
  });
});
