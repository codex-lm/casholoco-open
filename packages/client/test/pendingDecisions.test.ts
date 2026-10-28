import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn, type Action, type GameState, type Offer, type PlayerView } from '@muchomoney/core';
import { pendingDecisions } from '../src/screens/game/pendingDecisions';

function fixture(mapMode: 'hex' | 'classic' = 'hex') {
  const game = createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr', ...(mapMode === 'hex' ? { mapMode: 'hex' } : {}) }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Other Holding', sectorId: 'gadgets', connected: true, color: '#abcdef' },
  ]);
  const own = Object.values(game.companies).find((company) => company.controllerId === 'human')!;
  const rival = Object.values(game.companies).find((company) => company.controllerId === 'rival')!;
  own.cash = rival.cash = game.players.human.cash = 100_000;
  return { game, own, rival };
}

function ok(game: GameState, action: Action) {
  const result = applyAction(game, 'human', action);
  expect(result.ok, result.message).toBe(true);
}

function placeBids() {
  const { game, own, rival } = fixture();
  const view = getPlayerView(game, 'human');
  const [moveHex, launchHex] = view.hexes!.free;
  ok(game, { type: 'moveFactory', companyId: own.id, productId: own.products[0].id, hexId: moveHex, bid: view.hexes!.reserve[moveHex] });
  ok(game, { type: 'launchProduct', companyId: own.id, sectorId: 'yogurts', name: 'New Line', hexId: launchHex, bid: view.hexes!.reserve[launchHex], fallback: 'nearest' });
  ok(game, { type: 'bidSite', companyId: own.id, slotId: 'sugar-2', amount: 5_000 });
  return { game, own, rival, moveHex, launchHex };
}

function offers(view: PlayerView): Offer[] {
  const companyId = view.companies.find((company) => company.controllerId === 'human')!.id;
  const otherId = view.companies.find((company) => company.controllerId === 'rival')!.id;
  const common = { turn: view.turn, fromId: 'human', toId: 'rival', status: 'pending' as const };
  return [
    { ...common, id: 'buy', kind: 'shares', companyId, shares: 7, price: 12.5, side: 'buy' },
    { ...common, id: 'sell', kind: 'shares', companyId, shares: 3, price: 12.5, side: 'sell' },
    { ...common, id: 'contract-seller', kind: 'contract', sellerCompanyId: companyId, buyerCompanyId: otherId, commodityId: 'sugar', lots: 8, price: 2, turns: 3 },
    { ...common, id: 'contract-buyer', kind: 'contract', sellerCompanyId: otherId, buyerCompanyId: companyId, commodityId: 'oil', lots: 6, price: 3, turns: 2 },
    { ...common, id: 'cartel', kind: 'cartel', companyId, targetCompanyId: otherId, sectorId: 'gadgets' },
    { ...common, id: 'incoming', kind: 'shares', fromId: 'rival', toId: 'human', companyId, shares: 2, price: 12.5, side: 'sell' },
  ];
}

describe('pending decision extraction', () => {
  it('reserves land plus exact launch/move costs and produces executable intents and withdrawals', () => {
    const { game, own, moveHex, launchHex } = placeBids();
    const view = getPlayerView(game, 'human');
    const before = structuredClone(view);
    const model = pendingDecisions(view);
    const company = view.companies.find((item) => item.id === own.id)!;
    const launch = model.items.find((item) => item.kind === 'launch')!;
    const move = model.items.find((item) => item.kind === 'move')!;
    const deposit = model.items.find((item) => item.kind === 'deposit')!;
    expect(model.count).toBe(3);
    expect(launch.amount).toBe(launch.bid!.amount + view.sectors.find((sector) => sector.id === 'yogurts')!.launchCost);
    expect(move.amount).toBe(move.bid!.amount + company.products[0].private!.hexes!.moveCost);
    expect(deposit.amount).toBe(5_000);
    expect(model.total).toBe(company.private!.pendingHexCommitment! + 5_000);
    expect(model.groups[0].hexTotal).toBe(company.private!.pendingHexCommitment);
    expect(model.groups[0].closePlan).toBe(company.private!.closePlan);
    expect(launch.intent).toEqual({ kind: 'launch', companyId: own.id, hexId: launchHex });
    expect(move.intent).toEqual({ kind: 'move', productId: own.products[0].id });
    expect(deposit.intent).toEqual({ kind: 'deposit', companyId: own.id, slotId: 'sugar-2' });
    expect(view).toEqual(before);
    for (const item of model.items) ok(game, item.withdraw!);
    expect(pendingDecisions(getPlayerView(game, 'human')).count).toBe(0);
  });

  it('counts start-up land alone because founding investment has already been paid', () => {
    const { game, own } = fixture();
    own.controllerId = 'rival';
    game.turn = 2;
    const before = getPlayerView(game, 'human');
    const hexId = before.hexes!.free[0];
    const amount = before.hexes!.reserve[hexId];
    ok(game, { type: 'foundStartup', name: 'Comeback', sectorId: 'crypto', investment: 30_000, hexId, bid: amount, fallback: 'nearest' });
    const model = pendingDecisions(getPlayerView(game, 'human'));
    expect(model.count).toBe(1);
    expect(model.items[0]).toMatchObject({ kind: 'startup', amount, intent: { kind: 'move' } });
    expect(model.total).toBe(amount);
    expect(model.paid).toEqual([]);
    const bid = model.items[0].bid!;
    expect(model.items[0].withdraw).toEqual({ type: 'cancelHexBid', companyId: bid.companyId, productId: bid.productId });
    ok(game, model.items[0].withdraw!);
  });

  it('ignores resolved bids kept for the last-close history', () => {
    const { game } = placeBids();
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    expect(view.self?.hexBids?.length).toBe(2);
    expect(view.self?.siteBids?.length).toBe(1);
    expect(view.self?.hexBids?.every((bid) => bid.result)).toBe(true);
    expect(view.self?.siteBids?.every((bid) => bid.result)).toBe(true);
    expect(pendingDecisions(view)).toMatchObject({ count: 0, items: [], total: 0, paid: [] });
  });

  it('attributes each company auction to its own total when two companies are controlled', () => {
    const { game, own, rival } = placeBids();
    rival.controllerId = 'human';
    const view = getPlayerView(game, 'human');
    const target = view.hexes!.free[2];
    ok(game, { type: 'moveFactory', companyId: rival.id, productId: rival.products[0].id, hexId: target, bid: view.hexes!.reserve[target] });
    ok(game, { type: 'bidSite', companyId: rival.id, slotId: 'oil-2', amount: 15_000 });
    const current = getPlayerView(game, 'human');
    const model = pendingDecisions(current);
    expect(model.count).toBe(5);
    expect(model.groups).toHaveLength(2);
    for (const id of [own.id, rival.id]) {
      const company = current.companies.find((item) => item.id === id)!;
      const group = model.groups.find((item) => item.company.id === id)!;
      expect(group.items.every((item) => item.companyId === id)).toBe(true);
      expect(group.total).toBe(company.private!.pendingHexCommitment! + (id === own.id ? 5_000 : 15_000));
    }
    expect(model.total).toBe(model.groups.reduce((sum, group) => sum + group.total, 0));
  });

  it.each(['private', 'controller', 'status'] as const)('drops bids after losing company control (%s boundary)', (boundary) => {
    const { game, own } = placeBids();
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((item) => item.id === own.id)!;
    if (boundary === 'private') delete company.private;
    else if (boundary === 'controller') company.controllerId = 'rival';
    else company.status = 'bankrupt';
    const model = pendingDecisions(view);
    expect(model).toMatchObject({ count: 0, items: [], groups: [], total: 0 });
    // They stay listed apart, uncounted and never withdrawable: they fall at the close.
    expect(model.lostControl.map((item) => item.bid?.kind ?? 'deposit').sort()).toEqual(['deposit', 'launch', 'move']);
    expect(model.lostControl.every((item) => item.companyId === own.id)).toBe(true);
  });

  it('excludes another controller bids even if a malformed self list includes them', () => {
    const { game } = placeBids();
    const view = getPlayerView(game, 'human');
    for (const bid of [...view.self!.hexBids!, ...view.self!.siteBids!]) bid.playerId = 'rival';
    expect(pendingDecisions(view).count).toBe(0);
    // Another player's bids are not mine to report, even as lost-control ones.
    expect(pendingDecisions(view).lostControl).toEqual([]);
  });

  it('keeps all sent offer kinds conditional and personal shares outside company cash totals', () => {
    const { game, own } = placeBids();
    const view = getPlayerView(game, 'human');
    view.self!.offers = offers(view);
    const model = pendingDecisions(view);
    expect(model.count).toBe(8);
    expect(model.personal.map((item) => item.offer!.id)).toEqual(['buy', 'sell']);
    expect(model.personal.map((item) => item.amount)).toEqual([87.5, null]);
    expect(model.personalTotal).toBe(87.5);
    expect(model.total).toBe(view.companies.find((company) => company.id === own.id)!.private!.pendingHexCommitment! + 5_000);
    const proposals = model.groups[0].items.filter((item) => item.offer);
    expect(proposals.map((item) => item.offer!.id)).toEqual(['contract-seller', 'contract-buyer', 'cartel']);
    expect(proposals.every((item) => item.amount === null && item.companyId === own.id)).toBe(true);
    for (const item of model.items.filter((item) => item.offer)) {
      expect(item.withdraw).toEqual({ type: 'cancelOffer', offerId: item.offer!.id });
    }
    expect(model.received).toHaveLength(1);
    expect(model.received[0]).toMatchObject({ kind: 'received-offer', amount: null, offer: { id: 'incoming' } });
    expect(model.received[0].withdraw).toBeUndefined();
    expect(model.items.some((item) => item.offer?.id === 'incoming')).toBe(false);
  });

  it('excludes resolved, stale and unrelated offers and keeps received kinds read-only', () => {
    const { game } = fixture();
    const view = getPlayerView(game, 'human');
    const all = offers(view);
    view.self!.offers = [
      ...all.slice(2, 5).map((offer) => ({ ...offer, fromId: 'rival', toId: 'human' })),
      ...(['accepted', 'declined', 'cancelled', 'failed'] as const).map((status, i) => ({ ...all[0], id: `resolved-${i}`, status })),
      { ...all[0], id: 'stale', turn: view.turn - 1 },
      { ...all[0], id: 'unrelated', fromId: 'elsewhere', toId: 'rival' },
    ];
    const model = pendingDecisions(view);
    expect(model.count).toBe(0);
    expect(model.items).toEqual([]);
    expect(model.received.map((item) => item.offer!.kind)).toEqual(['contract', 'contract', 'cartel']);
    expect(model.received.every((item) => !item.withdraw && item.amount === null)).toBe(true);
  });

  it('allows sent offers to be withdrawn after losing their company without claiming company cash', () => {
    const { game, own } = fixture();
    const view = getPlayerView(game, 'human');
    view.self!.offers = offers(view).slice(2, 5);
    const company = view.companies.find((item) => item.id === own.id)!;
    delete company.private;
    company.controllerId = 'rival';
    const model = pendingDecisions(view);
    expect(model.count).toBe(3);
    expect(model.groups).toEqual([]);
    expect(model.personal).toHaveLength(3);
    expect(model.total).toBe(0);
    expect(model.personalTotal).toBe(0);
  });

  it('shows only own live cartel departures without a cancellation or extra counted commitment', () => {
    const { game, own, rival } = fixture();
    const view = getPlayerView(game, 'human');
    view.self!.cartels = [{ id: 'cartel', sectorId: 'gadgets', since: 1, risk: 0.2, members: [
      { companyId: own.id, controllerId: 'human', leaving: true },
      { companyId: rival.id, controllerId: 'rival', leaving: true },
    ] }];
    const model = pendingDecisions(view);
    expect(model.count).toBe(0);
    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({ kind: 'leaving', companyId: own.id, amount: null, cartel: { id: 'cartel' } });
    expect(model.items[0].withdraw).toBeUndefined();
    expect(model.total).toBe(0);
    delete view.companies.find((company) => company.id === own.id)!.private;
    expect(pendingDecisions(view).items).toEqual([]);
  });

  it('reports precisely identifiable classic launch/construction without invented historical payments', () => {
    const { game, own } = fixture('classic');
    ok(game, { type: 'launchProduct', companyId: own.id, sectorId: 'yogurts', name: 'New Line' });
    ok(game, { type: 'expandCapacity', companyId: own.id, productId: own.products[0].id, lots: 5 });
    const view = getPlayerView(game, 'human');
    const model = pendingDecisions(view);
    expect(model.paid).toHaveLength(2);
    expect(model.paid.map((item) => item.kind)).toEqual(['capacity', 'launch']);
    expect(model.paid.find((item) => item.kind === 'capacity')?.lots).toBe(5);
    expect(model.paid.every((item) => item.amount === null)).toBe(true);
    expect(model.groups[0].paid).toEqual(model.paid);
    expect(model.count).toBe(0);
    expect(model.total).toBe(0);
    const launched = view.companies.find((company) => company.id === own.id)!.products.find((product) => product.comingSoon)!;
    launched.launchedTurn = view.turn - 1;
    expect(pendingDecisions(view).paid.map((item) => item.kind)).toEqual(['capacity']);
  });

  it('never labels old hex launch construction as a payment this quarter', () => {
    const { game } = placeBids();
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const launched = view.companies.flatMap((company) => company.private ? company.products : []).find((product) => product.name === 'New Line')!;
    expect(launched.launchedTurn).toBeLessThan(view.turn);
    // A retained construction view must still not imply a cash payment during the new quarter.
    launched.comingSoon = true;
    launched.private!.pendingCapacity = 12;
    expect(pendingDecisions(view).paid).toEqual([]);
  });

  it('returns an empty spectator/empty state and handles unavailable costs without fabricated amounts', () => {
    const { game } = fixture();
    expect(pendingDecisions(getPlayerView(game, 'spectator'))).toMatchObject({ count: 0, groups: [], personal: [], received: [], paid: [], total: 0, personalTotal: 0 });
    const { game: withBids } = placeBids();
    const view = getPlayerView(withBids, 'human');
    const bid = view.self!.hexBids!.find((item) => item.kind === 'launch')!;
    view.self!.hexBids = [bid];
    view.self!.siteBids = [];
    view.sectors = [];
    const model = pendingDecisions(view);
    expect(model.items[0].amount).toBeNull();
    expect(model.total).toBe(0);
    expect(Number.isFinite(model.total)).toBe(true);
  });
});
