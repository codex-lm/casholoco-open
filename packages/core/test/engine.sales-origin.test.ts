import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { hexReservePrice } from '../src/sim/hexAuctions';
import { basin, freeBuildableHexes } from '../src/sim/hexes';
import { zoneOf } from '../src/content';
import type { GameState, ProductState } from '../src/types';
import { companyOf, config, human } from './helpers';

function viewedProduct(state: GameState, playerId: string, product: ProductState) {
  return getPlayerView(state, playerId).companies.flatMap((company) => company.products).find((p) => p.id === product.id)!;
}

describe('lastSalesOrigin: actual factory position at the sales close', () => {
  it('keeps the previous classic sales origin during an immediate move and updates it only at the next close', () => {
    const state = createGame(config(31, 4), [human('a', 'yogurts')]);
    const company = companyOf(state, 'a'), product = company.products[0];
    company.cash = 1e6;
    expect(product.lastSalesOrigin).toBeUndefined();
    expect(viewedProduct(state, 'a', product)).not.toHaveProperty('lastSalesOrigin');
    resolveTurn(state);
    expect(product.lastSales).toBeGreaterThan(0);
    expect(product.lastSalesOrigin).toEqual({ turn: 1, zoneId: 'capital' });
    const sales = product.lastSales, byCity = product.lastSalesByCity ? { ...product.lastSalesByCity } : undefined;
    expect(applyAction(state, 'a', { type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: 'north' }).ok).toBe(true);
    expect(product.zoneId).toBe('north');
    expect(product.lastSalesOrigin).toEqual({ turn: 1, zoneId: 'capital' });
    expect(product.lastSales).toBe(sales);
    expect(product.lastSalesByCity).toEqual(byCity);
    expect(viewedProduct(state, 'spectator', product)).toMatchObject({ zoneId: 'north', lastSalesOrigin: { turn: 1, zoneId: 'capital' } });
    resolveTurn(state);
    expect(product.lastSalesOrigin).toEqual({ turn: 2, zoneId: 'north' });
    expect(product.lastSalesOrigin).not.toHaveProperty('hexId');
  });

  it('captures the old hex before the winning pending move is applied after that quarter’s sales', () => {
    const state = createGame({ ...config(42, 4), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'quai-port-dividende' } }, [human('a', 'yogurts')]);
    const company = companyOf(state, 'a'), product = company.products[0];
    company.cash = 1e6;
    // On the board the zone is the basin of the cell, not the classic zoneId the product never sets.
    const origin = product.hexId!, zoneId = basin(origin), target = freeBuildableHexes(state)[0];
    expect(applyAction(state, 'a', { type: 'moveFactory', companyId: company.id, productId: product.id, hexId: target, bid: hexReservePrice(target) }).ok).toBe(true);
    expect(product.hexId).toBe(origin);
    resolveTurn(state);
    expect(product.lastSales).toBeGreaterThan(0);
    expect(product.hexId).toBe(target);
    expect(product.pendingHexId).toBeUndefined();
    expect(product.lastSalesOrigin).toEqual({ turn: 1, zoneId, hexId: origin });
    expect(viewedProduct(state, 'spectator', product)).toMatchObject({ hexId: target, lastSalesOrigin: { turn: 1, zoneId, hexId: origin } });
    resolveTurn(state);
    expect(product.lastSalesOrigin).toEqual({ turn: 2, zoneId: basin(target), hexId: target });
  });

  it('publishes independent copies to owner, rival and spectator without changing RNG or state', () => {
    const state = createGame(config(18, 4), [human('a', 'yogurts'), human('b', 'gadgets')]);
    const product = companyOf(state, 'a').products[0];
    resolveTurn(state);
    const before = JSON.stringify(state), rng = state.rngState;
    const owner = viewedProduct(state, 'a', product);
    const rival = viewedProduct(state, 'b', product);
    const spectator = viewedProduct(state, 'spectator', product);
    expect(owner.lastSalesOrigin).toEqual(product.lastSalesOrigin);
    expect(rival.lastSalesOrigin).toEqual(product.lastSalesOrigin);
    expect(spectator.lastSalesOrigin).toEqual(product.lastSalesOrigin);
    expect(rival.private).toBeUndefined();
    expect(owner.lastSalesOrigin).not.toBe(product.lastSalesOrigin);
    expect(rival.lastSalesOrigin).not.toBe(owner.lastSalesOrigin);
    owner.lastSalesOrigin!.zoneId = 'mountain';
    expect(rival.lastSalesOrigin!.zoneId).toBe('capital');
    expect(viewedProduct(state, 'a', product).lastSalesOrigin!.zoneId).toBe('capital');
    expect(state.rngState).toBe(rng);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('preserves missing origins in legacy JSON snapshots instead of inferring a past location', () => {
    const state = createGame(config(7, 4), [human('a', 'yogurts')]);
    resolveTurn(state);
    const legacy = JSON.parse(JSON.stringify(state)) as GameState;
    const product = companyOf(legacy, 'a').products[0];
    for (const company of Object.values(legacy.companies)) for (const p of company.products) delete p.lastSalesOrigin;
    const before = JSON.stringify(legacy);
    expect(product.lastSales).toBeGreaterThan(0);
    expect(viewedProduct(legacy, 'spectator', product)).not.toHaveProperty('lastSalesOrigin');
    expect(JSON.stringify(legacy)).toBe(before);
    resolveTurn(legacy);
    expect(product.lastSalesOrigin).toEqual({ turn: 2, zoneId: 'capital' });
  });
});
