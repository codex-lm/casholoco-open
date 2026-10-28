import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { freeBuildableHexes } from '../src/sim/hexes';
import { hexReservePrice } from '../src/sim/hexAuctions';
import type { Action, GameState } from '../src/types';
import { bots, companyOf, config, human } from './helpers';

function ok(state: GameState, who: string, action: Action) {
  const result = applyAction(state, who, action);
  expect(result.ok, result.message).toBe(true);
}

describe('launch project privacy after a controller changes', () => {
  it.each(['fr', 'en'] as const)('keeps the successor view identical after a former controller canceled a project (%s)', (lang) => {
    const plain = createGame({ ...config(3, 10), mapMode: 'hex', lang },
      [human('a', 'gadgets'), human('b', 'yogurts'), ...bots(4)]);
    resolveTurn(plain);
    expect(plain.turn).toBe(2);
    const canceled = structuredClone(plain), company = companyOf(canceled, 'a');
    const target = freeBuildableHexes(canceled)[4], publicCounter = canceled.nextId, rng = canceled.rngState;

    ok(canceled, 'a', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts',
      name: 'Canceled private project', hexId: target, bid: hexReservePrice(target), fallback: 'abandon' });
    const privateProject = canceled.hexBids!.find((bid) => !bid.result && bid.companyId === company.id)!.project!;
    ok(canceled, 'a', { type: 'cancelHexBid', companyId: company.id, projectId: privateProject.id });

    expect(canceled.nextId).toBe(publicCounter);
    expect(canceled.rngState).toBe(rng);
    expect(getPlayerView(canceled, 'b')).toEqual(getPlayerView(plain, 'b'));
    resolveTurn(plain);
    resolveTurn(canceled);
    expect(plain.turn).toBe(3);
    expect(getPlayerView(canceled, 'b')).toEqual(getPlayerView(plain, 'b'));

    // Apply the same transfer of control to both otherwise identical games.
    for (const state of [plain, canceled]) {
      const transferred = state.companies[company.id];
      transferred.holdings = { b: 6000 };
      transferred.controllerId = 'b';
      transferred.ceoName = state.players.b.name;
      const successorTarget = freeBuildableHexes(state)[6];
      ok(state, 'b', { type: 'launchProduct', companyId: transferred.id, sectorId: 'crypto',
        name: 'Successor project', hexId: successorTarget, bid: hexReservePrice(successorTarget), fallback: 'abandon' });
    }

    const plainView = getPlayerView(plain, 'b'), canceledView = getPlayerView(canceled, 'b');
    expect(canceledView.self!.hexBids!.find((bid) => !bid.result && bid.companyId === company.id)?.project)
      .toMatchObject({ name: 'Successor project', sectorId: 'crypto' });
    expect(canceledView.self!.hexBids!.find((bid) => !bid.result && bid.companyId === company.id)?.project)
      .toEqual(plainView.self!.hexBids!.find((bid) => !bid.result && bid.companyId === company.id)?.project);
    expect(canceledView.companies.find((item) => item.id === company.id)!.private!.launchProjects).toHaveLength(1);
    expect(canceledView.companies.find((item) => item.id === company.id)!.private!.launchProjects)
      .toEqual(plainView.companies.find((item) => item.id === company.id)!.private!.launchProjects);
    expect(canceledView).toEqual(plainView);
  });
});
