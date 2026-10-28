import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { freeBuildableHexes } from '../src/sim/hexes';
import { hexReservePrice, pendingHexCommitments } from '../src/sim/hexAuctions';
import type { Action, GameState, HexBid } from '../src/types';
import { companyOf, config, human } from './helpers';

function game(lang: 'fr' | 'en' = 'fr'): GameState {
  const state = createGame({ ...config(42, 8), mapMode: 'hex', terrainAssignment: 'host',
    terrains: { a: 'quai-port-dividende', b: 'faubourgs-croissance',
      c: 'front-de-mer-saint-benefice', d: 'portes-petit-rabais' }, lang },
  [human('a', 'crypto'), human('b', 'gadgets'), human('c', 'yogurts'), human('d', 'scooters')]);
  state.activeEffects = [];
  for (const company of Object.values(state.companies)) {
    company.cash = 1e6;
    company.inventory = {};
    company.sites = [];
    for (const product of company.products) {
      product.production = 0;
      product.marketing = 0;
      product.rnd = 0;
      product.stock = 0;
    }
  }
  return state;
}

function ok(state: GameState, who: string, action: Action) {
  const result = applyAction(state, who, action);
  expect(result.ok, result.message).toBe(true);
}

function project(state: GameState, companyId: string, hexId: string, name = 'Private project') {
  ok(state, 'a', { type: 'launchProduct', companyId, sectorId: 'gadgets', name,
    hexId, bid: hexReservePrice(hexId), fallback: 'abandon' });
  return state.hexBids!.at(-1)!;
}

describe('merged companies drop unresolved hex bids', () => {
  it('drops launch, move and incubator bids without charging or moving the transferred plants', () => {
    const state = game(), absorber = companyOf(state, 'a'), target = companyOf(state, 'b');
    target.controllerId = 'a';
    target.holdings = { a: 6000 };
    const plant = target.products[0], origin = plant.hexId;
    const incubator = { ...plant, id: 'incubator-plant', incubator: true,
      hexId: undefined, terrainId: undefined, landCost: 0 };
    target.products.push(incubator);
    const [moveCell, startupCell, launchCell, retainedCell] = freeBuildableHexes(state);
    ok(state, 'a', { type: 'moveFactory', companyId: target.id, productId: plant.id,
      hexId: moveCell, bid: hexReservePrice(moveCell) });
    ok(state, 'a', { type: 'moveFactory', companyId: target.id, productId: incubator.id,
      hexId: startupCell, bid: hexReservePrice(startupCell), fallback: 'abandon' });
    const launch = project(state, target.id, launchCell, 'Canceled by merger');
    const retained = project(state, absorber.id, retainedCell, 'Absorber project');
    const settled: HexBid = { ...launch, result: { outcome: 'lost', price: 0, bidders: 2 } };
    state.hexBids!.push({ ...launch, playerId: 'former-controller' }, settled);
    const cash = absorber.cash + target.cash;

    ok(state, 'a', { type: 'merge', absorberId: absorber.id, targetId: target.id });

    expect(state.hexBids).toEqual([retained, settled]);
    expect(getPlayerView(state, 'a').self!.hexBids!.filter((bid) => !bid.result)).toEqual([retained]);
    expect(pendingHexCommitments(state, target)).toBe(0);
    expect(absorber.cash).toBe(cash);
    expect(absorber.turnFlags.specialCharges ?? 0).toBe(0);
    expect(absorber.launchCharges).toBeUndefined();
    expect(plant.hexId).toBe(origin);

    resolveTurn(state);

    expect(plant.hexId).toBe(origin);
    expect(plant.pendingHexId).toBeUndefined();
    expect(incubator.incubator).toBe(true);
    expect(incubator.hexId).toBeUndefined();
    expect(absorber.products.some((product) => product.name === 'Canceled by merger')).toBe(false);
    expect(state.hexAuctionResults!.map((award) => award.companyId)).toEqual([absorber.id]);
    expect(state.hexBids!.some((bid) => bid.companyId === target.id)).toBe(false);
  });

  it('deletes the bids property when only the absorbed company had pending bids', () => {
    const state = game(), absorber = companyOf(state, 'a'), target = companyOf(state, 'b');
    target.controllerId = 'a';
    target.holdings = { a: 6000 };
    const plant = target.products[0], origin = plant.hexId;
    const [moveCell, launchCell] = freeBuildableHexes(state);
    ok(state, 'a', { type: 'moveFactory', companyId: target.id, productId: plant.id,
      hexId: moveCell, bid: hexReservePrice(moveCell) });
    project(state, target.id, launchCell);

    ok(state, 'a', { type: 'merge', absorberId: absorber.id, targetId: target.id });

    expect(Object.hasOwn(state, 'hexBids')).toBe(false);
    expect(getPlayerView(state, 'a').self!.hexBids).toEqual([]);
    resolveTurn(state);
    expect(plant.hexId).toBe(origin);
    expect(state.hexAuctionResults).toEqual([]);
  });

  it('leaves bids intact when the merger exceeds the absorber slots', () => {
    const state = game(), absorber = companyOf(state, 'a'), target = companyOf(state, 'b');
    target.controllerId = 'a';
    target.holdings = { a: 6000 };
    absorber.productSlots = 6;
    const cells = freeBuildableHexes(state);
    for (let index = 0; index < 5; index++) project(state, absorber.id, cells[index], `Absorber ${index}`);
    project(state, target.id, cells[5], 'Target project');
    const before = JSON.stringify(state);

    expect(applyAction(state, 'a', { type: 'merge', absorberId: absorber.id, targetId: target.id }).ok).toBe(false);

    expect(JSON.stringify(state)).toBe(before);
  });

  it('fits the six surviving slots when the absorbed company also has a canceled launch project', () => {
    const state = game(), absorber = companyOf(state, 'a'), target = companyOf(state, 'b');
    target.controllerId = 'a';
    target.holdings = { a: 6000 };
    absorber.productSlots = 6;
    const cells = freeBuildableHexes(state);
    for (let index = 0; index < 4; index++) project(state, absorber.id, cells[index], `Surviving ${index}`);
    project(state, target.id, cells[4], 'Canceled seventh slot');

    ok(state, 'a', { type: 'merge', absorberId: absorber.id, targetId: target.id });

    expect(absorber.products).toHaveLength(2);
    expect(state.hexBids).toHaveLength(4);
    expect(state.hexBids!.every((bid) => bid.companyId === absorber.id)).toBe(true);
    resolveTurn(state);
    expect(absorber.products).toHaveLength(6);
    expect(absorber.products.some((product) => product.name === 'Canceled seventh slot')).toBe(false);
  });
});

describe('launch projects leave no public identifier trace', () => {
  it.each(['fr', 'en'] as const)('keeps a rival post-close view identical after filing and canceling a project (%s)', (lang) => {
    const plain = game(lang), canceled = structuredClone(plain);
    const company = companyOf(canceled, 'a'), target = freeBuildableHexes(canceled)[0];
    const bid = project(canceled, company.id, target);
    ok(canceled, 'a', { type: 'cancelHexBid', companyId: company.id, projectId: bid.project!.id });
    expect(Object.hasOwn(canceled, 'hexBids')).toBe(false);
    expect(getPlayerView(canceled, 'b')).toEqual(getPlayerView(plain, 'b'));
    // Public result articles and their wording must remain identical even at a bankruptcy close.
    company.cash = companyOf(plain, 'a').cash = 0;

    resolveTurn(plain);
    resolveTurn(canceled);

    expect(plain.companies[company.id].status).toBe('bankrupt');
    expect(company.status).toBe('bankrupt');
    expect(getPlayerView(canceled, 'b')).toEqual(getPlayerView(plain, 'b'));
  });

  it('does not reuse canceled project ids or consume the public counter', () => {
    const state = game(), company = companyOf(state, 'a'), target = freeBuildableHexes(state)[0];
    const publicCounter = state.nextId, rivalBefore = getPlayerView(state, 'b');
    const first = project(state, company.id, target);
    ok(state, 'a', { type: 'cancelHexBid', companyId: company.id, projectId: first.project!.id });
    const second = project(state, company.id, target);

    expect(second.project!.id).not.toBe(first.project!.id);
    expect(state.nextId).toBe(publicCounter);
    expect(getPlayerView(state, 'b')).toEqual(rivalBefore);
    const before = JSON.stringify(state);
    expect(applyAction(state, 'a', { type: 'cancelHexBid', companyId: company.id,
      projectId: first.project!.id }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
});
