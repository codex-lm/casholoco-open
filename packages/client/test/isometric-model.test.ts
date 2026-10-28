import { describe, expect, it } from 'vitest';
import { SECTORS, boardCells, capitalCellId, createGame, getPlayerView, resolveTurn, type PlayerView, type SectorId } from '@muchomoney/core';
import { buildIslandModel, canExpandIslandFactory, islandRoutes, pointAlongRoute, scenerySeed } from '../src/screens/game/city/isometric/isometricModel';
import { buildMapFlowModel } from '../src/screens/game/city/mapFlows';

function fixture(sectorId: SectorId = 'yogurts') {
  const state = createGame({ seed: 44, totalTurns: 8, turnSeconds: 0, startYear: 2027,
    mapMode: 'square', terrainAssignment: 'fair', industryRules: 'network' }, [
    { id: 'me', name: 'Ada', isBot: false, companyName: 'Manufacture', sectorId, connected: true, color: '#b07b51' },
    { id: 'rival', name: 'Ben', isBot: false, companyName: 'Ateliers', sectorId: 'gadgets', connected: true, color: '#617c85' },
  ]);
  const view = getPlayerView(state, 'me');
  const own = view.companies.find(company => company.controllerId === 'me')!;
  const rival = view.companies.find(company => company.controllerId === 'rival')!;
  return { state, view, own, rival, product: own.products[0] };
}

describe('isometric render model', () => {
  it('renders square public parcels without mutating the source or simulation RNG', () => {
    const { view } = fixture(), before = JSON.stringify(view);
    const model = buildIslandModel(view);
    expect(model.cells).toEqual(boardCells(view.config));
    expect(model.factories.every(factory => factory.cellId.startsWith('S-'))).toBe(true);
    expect(model.routes).toEqual([]);
    expect(JSON.stringify(view)).toBe(before);
    expect(buildIslandModel(view)).toEqual(model);
  });

  it('shows installed public extensions but grants pending work and stock only to an own company', () => {
    const { view, own, rival, product } = fixture();
    product.capacity = 150; product.capacityLimit = 200;
    product.private!.pendingCapacity = 25; product.private!.stock = 90;
    const other = rival.products[0]; other.capacity = 180; other.capacityLimit = 200;
    // Even malformed product-level grants must not bypass company-level permission.
    other.private = { ...product.private! };
    const model = buildIslandModel(view);
    expect(model.factories.find(factory => factory.id === product.id)).toMatchObject({ companyId: own.id, extensionRatio: .5, pendingExtension: true, stockPallets: 3 });
    expect(model.factories.find(factory => factory.id === other.id)).toMatchObject({ mine: false, extensionRatio: .8, pendingExtension: false, stockPallets: null });
    other.private!.pendingCapacity = 99_999; other.private!.stock = 99_999;
    expect(buildIslandModel(view)).toEqual(model);
  });

  it('keeps public opening construction distinct from an own pending extension', () => {
    const { view, product } = fixture();
    product.capacity = 0; product.comingSoon = true; product.private!.pendingCapacity = 100;
    expect(buildIslandModel(view).factories.find(factory => factory.id === product.id)).toMatchObject({ constructing: true, pendingExtension: false, extensionRatio: 0 });
    product.capacity = 100; product.comingSoon = false; product.private!.pendingCapacity = 0;
    expect(buildIslandModel(view).factories.find(factory => factory.id === product.id)).toMatchObject({ constructing: false, pendingExtension: false });
  });

  it('keeps spectators public and handles legacy missing parcel and estimate data', () => {
    const { state, product } = fixture();
    const spectator = getPlayerView(state, 'spectator');
    expect(buildIslandModel(spectator).factories.every(factory => !factory.mine && !factory.pendingExtension && factory.stockPallets === null)).toBe(true);
    const legacy = structuredClone(spectator) as PlayerView;
    const missing = legacy.companies.flatMap(company => company.products).find(item => item.id === product.id)!;
    delete missing.hexId;
    expect(buildIslandModel(legacy).factories.find(factory => factory.id === product.id)?.cellId).toBe(capitalCellId(legacy.config));
    missing.hexId = 'missing-parcel';
    expect(buildIslandModel(legacy).factories.some(factory => factory.id === product.id)).toBe(false);
  });

  it('uses exact supply segments from the selected own factory only', () => {
    const { view, product } = fixture();
    product.hexId = boardCells(view.config).find(cell => !cell.zone && !cell.deposit && cell.terrain !== 'island')!.id;
    const flow = buildMapFlowModel(view, product.id);
    const routes = islandRoutes(flow, 'supply');
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.some(route => route.track)).toBe(true);
    const exactSegments = flow.supply.filter(item => item.productId === product.id && !item.intangible).flatMap(item => item.sources.flatMap(source => source.route?.segments ?? []));
    for (const route of routes) {
      expect(exactSegments.some(segment => JSON.stringify(segment.points) === JSON.stringify(route.points)
        && (segment.kind === 'track') === Boolean(route.track))).toBe(true);
      expect(route.indicative).toBe(true);
    }
    expect(islandRoutes({ ...flow, selectedProductId: null }, 'supply')).toEqual([]);
    expect(islandRoutes(flow, 'production')).toEqual([]);
  });

  it('never fabricates historical sales destinations or replaces unknown origins', () => {
    const { state, product } = fixture();
    resolveTurn(state);
    const flow = buildMapFlowModel(getPlayerView(state, 'me'), product.id);
    const routes = islandRoutes(flow, 'sales');
    expect(routes.length).toBeGreaterThan(0);
    const segments = flow.sales.flatMap(sales => sales.route?.segments ?? []);
    for (const route of routes) expect(segments.some(segment => JSON.stringify(segment.points) === JSON.stringify(route.points)
      && (segment.kind === 'track') === Boolean(route.track))).toBe(true);
    for (const sales of flow.sales) sales.originKnown = false;
    expect(islandRoutes(flow, 'sales')).toEqual([]);
    for (const sales of flow.sales) { sales.originKnown = true; sales.national = true; }
    expect(islandRoutes(flow, 'sales')).toEqual([]);
    for (const sales of flow.sales) { sales.national = false; sales.sold = 0; }
    expect(islandRoutes(flow, 'sales')).toEqual([]);
  });

  it('keeps crypto city sales and recipe data without creating a 3D route', () => {
    const { state, product } = fixture('crypto');
    resolveTurn(state);
    const view = getPlayerView(state, 'me');
    const flow = buildMapFlowModel(view, product.id);
    const sales = flow.sales.filter(sale => sale.productId === product.id);
    expect(sales.length).toBeGreaterThan(0);
    expect(sales.every(sale => sale.intangible && sale.sold > 0 && sale.cityId && sale.destination && sale.originKnown && !sale.route)).toBe(true);
    expect(flow.supply.length).toBeGreaterThan(0);
    expect(flow.supply.every(supply => supply.intangible && supply.need > 0 && supply.sources.every(source => !source.route))).toBe(true);
    const before = structuredClone(flow);
    expect(buildIslandModel(view, flow, 'sales').routes).toEqual([]);
    expect(islandRoutes(flow, 'supply')).toEqual([]);
    expect(flow).toEqual(before);
    const spectatorFlow = buildMapFlowModel(getPlayerView(state, 'spectator'), product.id);
    expect(spectatorFlow.selectedProductId).toBeNull();
    expect(spectatorFlow.sales).toEqual([]);
    expect(spectatorFlow.supply).toEqual([]);
  });
});

describe('island animation geometry', () => {
  it('travels by distance through corners and repeated vertices without cutting the route', () => {
    const route = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 30 }];
    expect(pointAlongRoute(route, .5)?.point).toEqual({ x: 10, y: 10 });
    expect(pointAlongRoute(route, 1)?.point).toEqual({ x: 10, y: 30 });
    expect(pointAlongRoute(route, -1)?.point).toEqual({ x: 0, y: 0 });
    expect(pointAlongRoute([], .5)).toBeNull();
    expect(pointAlongRoute([{ x: 1, y: 2 }, { x: 1, y: 2 }], .3)).toEqual({ point: { x: 1, y: 2 }, angle: 0 });
  });
  it('gives stable cosmetic positions from public keys', () => {
    expect(scenerySeed('S-A1')).toBe(scenerySeed('S-A1'));
    expect(scenerySeed('S-A1')).not.toBe(scenerySeed('S-A2'));
    expect(scenerySeed('S-A1')).toBeGreaterThanOrEqual(0);
    expect(scenerySeed('S-A1')).toBeLessThan(1);
  });
});

describe('island expansion action availability', () => {
  it('requires playing phase, an active actual controller, and a granted own product', () => {
    const { view, own, rival, product } = fixture();
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(true);
    expect(canExpandIslandFactory(view, rival.id, rival.products[0].id)).toBe(false);
    view.phase = 'finished';
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(false);
    view.phase = 'playing'; own.status = 'bankrupt';
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(false);
    own.status = 'active'; own.controllerId = 'rival';
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(false);
    own.controllerId = view.you; delete product.private;
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(false);
  });

  it('counts committed pending capacity against the limit without blocking further valid orders', () => {
    const { view, own, product } = fixture();
    product.capacity = 100; product.capacityLimit = 200; product.private!.pendingCapacity = 99;
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(true);
    product.private!.pendingCapacity = 100;
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(false);
    product.private!.pendingCapacity = 0; product.capacity = 200;
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(false);
    delete product.capacityLimit;
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(true);
  });

  it('requires enough current company cash for at least one whole capacity lot', () => {
    const { view, own, product } = fixture();
    const cost = SECTORS[product.sectorId].capacityCost;
    own.cash = cost - .01;
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(false);
    own.cash = cost;
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(true);
    own.cash = -100;
    expect(canExpandIslandFactory(view, own.id, product.id)).toBe(false);
  });
});
