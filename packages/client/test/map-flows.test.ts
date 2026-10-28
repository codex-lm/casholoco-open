import { describe, expect, it } from 'vitest';
import {
  CITY_IDS, SECTORS, ZONES, applyAction, capitalHexId, createGame, getPlayerView,
  hexById, hexTransportRoute, resolveTurn, roadNode, roadRoute,
  type MapMode, type ProductView, type SectorId,
} from '@muchomoney/core';
import { buildMapFlowModel } from '../src/screens/game/city/mapFlows';

function fixture(mapMode: MapMode = 'hex', sectorId: SectorId = 'yogurts') {
  const state = createGame({ seed: 42, totalTurns: 8, turnSeconds: 0, startYear: 2027,
    mapMode, terrainAssignment: 'fair' }, [
    { id: 'me', name: 'Ada', isBot: false, companyName: 'Own Factory', sectorId, connected: true, color: '#123456' },
    { id: 'rival', name: 'Ben', isBot: false, companyName: 'Rival Factory', sectorId: 'gadgets', connected: true, color: '#654321' },
  ]);
  const view = getPlayerView(state, 'me');
  const company = view.companies.find((c) => c.controllerId === 'me')!;
  return { state, view, company, product: company.products[0] };
}

describe('map flow overlays from redacted views', () => {
  it('exposes private production only for granted own factories, never for a spectator or rival', () => {
    const { state, view, product } = fixture();
    const model = buildMapFlowModel(view);
    expect(model.selectedProductId).toBe(product.id);
    expect(model.production.find((p) => p.productId === product.id)?.planned).not.toBeNull();
    for (const factory of model.production.filter((p) => !p.mine)) {
      expect(factory).toMatchObject({ planned: null, stock: null, demand: null, estimatedSales: null, surplus: null });
    }
    const spectator = buildMapFlowModel(getPlayerView(state, 'spectator'));
    expect(spectator.selectedProductId).toBeNull();
    expect(spectator.supply).toEqual([]);
    expect(spectator.sales).toEqual([]);
    expect(spectator.production.every((p) => !p.mine && p.stock === null && p.planned === null)).toBe(true);
  });

  it('focuses only an own product and leaves launch references without another factory’s flows', () => {
    const { view, product } = fixture();
    const rival = view.companies.find((c) => c.controllerId === 'rival')!.products[0];
    for (const selected of [null, rival.id, 'unknown']) {
      const model = buildMapFlowModel(view, selected);
      expect(model.selectedProductId).toBeNull();
      expect(model.supply).toEqual([]);
      expect(model.sales).toEqual([]);
      expect(model.production.some((p) => p.productId === product.id)).toBe(true);
    }
    expect(buildMapFlowModel(view, product.id).supply.every((p) => p.productId === product.id)).toBe(true);
  });

  it('preserves fractional finished stock and does not invent inbound production when production is zero', () => {
    const { view, product } = fixture();
    product.private!.stock = 1.75;
    product.private!.production = 0;
    product.private!.estimate = { demand: 1.25, sales: 1.25, revenue: 0, margin: 0 };
    const model = buildMapFlowModel(view);
    expect(model.production.find((p) => p.productId === product.id)).toMatchObject({
      planned: 0, stock: 1.75, demand: 1.25, estimatedSales: 1.25, surplus: 0.5,
    });
    expect(model.supply).toEqual([]);
  });

  it('uses whole capacity-bounded production for material recipes and has no invented old-view forecast', () => {
    const { view, company, product } = fixture();
    product.private!.production = 2.9;
    product.capacity = 2.2;
    delete product.private!.estimate;
    delete company.private!.closePlan;
    const model = buildMapFlowModel(view);
    expect(model.production.find((p) => p.productId === product.id)).toMatchObject({ planned: 2, demand: null, surplus: null });
    const sugar = model.supply.find((p) => p.commodityId === 'sugar')!;
    expect(sugar.need).toBe(2 * SECTORS.yogurts.inputs.sugar!);
    expect(sugar.missing).toBeNull();
    expect(sugar.sources.some((s) => s.type === 'port')).toBe(true);
  });

  it('keeps stock and shortage at company level across products and multiple potential sources', () => {
    const { view, company, product } = fixture();
    product.private!.production = 10;
    const second: ProductView = JSON.parse(JSON.stringify(product));
    second.id = 'second-product';
    company.products.push(second);
    company.private!.inventory.sugar = { lots: 0.25, avgCost: 40 };
    company.sites = [
      { id: 'sugar-1', commodityId: 'sugar', capacity: 4, unitCost: 20, currentUnitCost: 20, upkeep: 0, activeFrom: 1, name: 'First deposit' },
      { id: 'sugar-2', commodityId: 'sugar', capacity: 8, unitCost: 20, currentUnitCost: 20, upkeep: 0, activeFrom: 1, name: 'Second deposit' },
    ];
    company.private!.closePlan!.sites = [
      { siteId: 'sugar-1', commodityId: 'sugar', capacity: 4, needed: 2, surplus: 0 },
      { siteId: 'sugar-2', commodityId: 'sugar', capacity: 8, needed: 4, surplus: 0 },
    ];
    const buyer = view.companies.find((c) => c.controllerId === 'rival')!;
    view.self!.contracts = [
      { id: 'outgoing', sellerCompanyId: company.id, buyerCompanyId: buyer.id, commodityId: 'sugar', lots: 6, price: 40, turnsLeft: 2 },
      { id: 'incoming', sellerCompanyId: buyer.id, buyerCompanyId: company.id, commodityId: 'sugar', lots: 1, price: 40, turnsLeft: 2 },
    ];
    const flow = buildMapFlowModel(view).supply.find((p) => p.commodityId === 'sugar')!;
    expect(flow).toMatchObject({ need: 3, stock: 0.25, companyNeed: 6, missing: 4.75, stockScope: 'company' });
    const deposits = flow.sources.filter((s) => s.type === 'deposit');
    expect(deposits.map((s) => s.availableCapacity)).toEqual([6]);
    expect(deposits.map((s) => s.contractedOut)).toEqual([2]);
    // The 6 lots the second site has left cover the company's 6-lot need: the engine ships nothing from the port.
    expect(flow.sources.map((s) => s.type)).toEqual(['deposit']);
    expect(flow.sources.every((s) => !Object.hasOwn(s, 'lots') && !Object.hasOwn(s, 'volume') && !Object.hasOwn(s, 'plannedExtraction'))).toBe(true);
    const other = buildMapFlowModel(view, second.id).supply.find((p) => p.commodityId === 'sugar')!;
    expect(other.stock).toBe(flow.stock); // It is one shared balance, not twice the available inventory.
    expect(other.missing).toBe(flow.missing);
  });

  it('keeps the port fallback but excludes a site fully reserved for outgoing contracts', () => {
    const { view, company } = fixture();
    company.sites = [{ id: 'sugar-1', commodityId: 'sugar', capacity: 4, unitCost: 20,
      currentUnitCost: 20, upkeep: 0, activeFrom: 1, name: 'Reserved deposit' }];
    const buyer = view.companies.find((c) => c.controllerId === 'rival')!;
    view.self!.contracts = [{ id: 'all-output', sellerCompanyId: company.id, buyerCompanyId: buyer.id,
      commodityId: 'sugar', lots: 4, price: 40, turnsLeft: 2 }];
    const sugar = buildMapFlowModel(view).supply.find((p) => p.commodityId === 'sugar')!;
    expect(sugar.sources).toHaveLength(1);
    expect(sugar.sources[0].type).toBe('port');
    expect(sugar.sources[0].route).toBeDefined();
    expect(sugar.sources.some((s) => s.id === 'sugar-1')).toBe(false);
  });

  it('mirrors the engine’s carriage: sites in order, then the port only for what they leave uncovered', () => {
    const { view, company, product } = fixture();
    product.private!.production = 10;
    product.capacity = 10;
    const companyNeed = 10 * SECTORS.yogurts.inputs.sugar!;
    const site = (id: string, capacity: number) => ({ id, commodityId: 'sugar' as const, capacity, unitCost: 20, currentUnitCost: 20,
      upkeep: 0, activeFrom: 1, name: id });
    // One site covering everything: no port, and a second site has nothing left to carry.
    company.sites = [site('sugar-1', companyNeed), site('sugar-2', 40)];
    let sugar = buildMapFlowModel(view).supply.find((p) => p.commodityId === 'sugar')!;
    expect(sugar.sources.map((s) => s.id)).toEqual(['sugar-1']);
    // A site short of the need: it serves first, the port covers the rest.
    company.sites = [site('sugar-1', companyNeed - 1)];
    sugar = buildMapFlowModel(view).supply.find((p) => p.commodityId === 'sugar')!;
    expect(sugar.sources.map((s) => s.type)).toEqual(['deposit', 'port']);
    // No site at all: the port alone; it is named by the interface, not by the room's language.
    company.sites = [];
    sugar = buildMapFlowModel(view).supply.find((p) => p.commodityId === 'sugar')!;
    expect(sugar.sources.map((s) => s.type)).toEqual(['port']);
    expect(sugar.sources[0].name).toBeUndefined();
  });

  it('excludes sleeping and unfinished sites from possible supply routes', () => {
    const { view, company } = fixture();
    company.sites = [
      { id: 'sugar-1', commodityId: 'sugar', capacity: 4, unitCost: 20, currentUnitCost: 20, upkeep: 0, activeFrom: 1, dormant: true, name: 'Sleeping' },
      { id: 'sugar-2', commodityId: 'sugar', capacity: 8, unitCost: 20, currentUnitCost: 20, upkeep: 0, activeFrom: view.turn + 1, name: 'Building' },
    ];
    const sugar = buildMapFlowModel(view).supply.find((p) => p.commodityId === 'sugar')!;
    expect(sugar.sources.map((s) => s.type)).toEqual(['port']);
  });

  it('draws possible supply from source to exact hex factory, preserving the engine’s route cost and segments', () => {
    const { view, company, product } = fixture();
    company.sites = [{ id: 'sugar-1', commodityId: 'sugar', capacity: 4, unitCost: 20,
      currentUnitCost: 20, upkeep: 0, activeFrom: 1, name: 'Deposit' }];
    const source = buildMapFlowModel(view).supply.find((p) => p.commodityId === 'sugar')!.sources.find((s) => s.type === 'deposit')!;
    const engine = hexTransportRoute(product.hexId!, source.id)!;
    expect(source.route!.points).toEqual([...engine.points].reverse());
    expect(source.route!.points[0]).toEqual({ x: roadNode(source.id)!.x, y: roadNode(source.id)!.y });
    expect(source.route!.cost).toBe(engine.cost);
    expect(source.route!.km).toBe(engine.km);
    expect(source.route!.segments.map((s) => s.kind)).toEqual(engine.segments.map((s) => s.kind).reverse());
    expect(source.route!.segments[0].points).toEqual([...engine.segments.at(-1)!.points].reverse());
  });

  it('uses recorded last-quarter sales origin after a factory has moved', () => {
    const { state } = fixture();
    const company = Object.values(state.companies).find((c) => c.controllerId === 'me')!;
    resolveTurn(state);
    const view = getPlayerView(state, 'me');
    const product = view.companies.find((c) => c.id === company.id)!.products[0];
    expect(product.lastSalesOrigin).toBeDefined();
    const oldHex = product.lastSalesOrigin!.hexId!;
    expect(product.lastSalesByCity).toBeDefined();
    product.hexId = oldHex === capitalHexId ? view.hexes!.free[0] : capitalHexId;
    const model = buildMapFlowModel(view);
    const sales = model.sales.find((s) => s.cityId)!;
    expect(sales).toMatchObject({ originKnown: true, turn: 1 });
    expect(sales.route!.points).toEqual(hexTransportRoute(oldHex, sales.cityId!)!.points);
    expect(model.production.find((p) => p.productId === product.id)!.point).not.toEqual(sales.point);
    expect(model.sales.reduce((sum, s) => sum + s.sold, 0)).toBeCloseTo(product.lastSales, 10);
  });

  it('preserves city sales from old views but draws no invented historical origin', () => {
    const { view, product } = fixture();
    product.lastSales = 3.75;
    product.lastSalesByCity = Object.fromEntries(CITY_IDS.map((id) => [id, id === 'north' ? 3.75 : 0])) as typeof product.lastSalesByCity;
    delete product.lastSalesOrigin;
    const sales = buildMapFlowModel(view).sales;
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ cityId: 'north', sold: 3.75, originKnown: false, national: false });
    expect(sales[0].route).toBeUndefined();
    expect(sales[0].turn).toBeUndefined();
  });

  it('does not invent customer cities for a national market with no city breakdown', () => {
    const { state } = fixture('classic');
    resolveTurn(state);
    const view = getPlayerView(state, 'me');
    const product = view.companies.find((c) => c.controllerId === 'me')!.products[0];
    expect(product.lastSalesByCity).toBeUndefined();
    const sales = buildMapFlowModel(view).sales;
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ sold: product.lastSales, national: true, originKnown: true });
    expect(sales[0].cityId).toBeUndefined();
    expect(sales[0].route).toBeUndefined();
  });

  it('keeps crypto recipes and actual customer totals without physical trucking routes', () => {
    const { state } = fixture('hex', 'crypto');
    resolveTurn(state);
    const view = getPlayerView(state, 'me');
    const model = buildMapFlowModel(view);
    expect(model.production.find((p) => p.mine)?.intangible).toBe(true);
    expect(model.supply.length).toBeGreaterThan(0);
    expect(model.supply.every((p) => p.intangible && p.sources.every((s) => !s.route))).toBe(true);
    expect(model.sales.every((s) => s.intangible && !s.route)).toBe(true);
    // Each city's line knows where that city is, so its label can sit there rather than at the farm.
    const cities = model.sales.filter((s) => s.cityId);
    expect(cities.length).toBeGreaterThan(0);
    for (const sale of cities) expect(sale.destination).toEqual({ x: roadNode(sale.cityId!)!.x, y: roadNode(sale.cityId!)!.y });
  });

  it('supports classic real sales routes from their prior zone and source links on the existing road network', () => {
    const { state } = fixture('classic');
    const company = Object.values(state.companies).find((c) => c.controllerId === 'me')!;
    const product = company.products[0];
    expect(applyAction(state, 'me', { type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: 'south' }).ok).toBe(true);
    resolveTurn(state);
    const view = getPlayerView(state, 'me');
    const current = view.companies.find((c) => c.id === company.id)!.products[0];
    current.zoneId = 'plain';
    const model = buildMapFlowModel(view);
    const sale = model.sales.find((s) => s.cityId)!;
    expect(sale.route!.points).toEqual(roadRoute('south', sale.cityId!)!.points.map(({ x, y }) => ({ x, y })));
    expect(sale.point).toEqual({ x: ZONES.south.x, y: ZONES.south.y });
    const source = model.supply[0].sources.find((s) => s.type === 'port')!;
    expect(source.route!.points).toEqual([...roadRoute('plain', 'capital')!.points].reverse().map(({ x, y }) => ({ x, y })));
  });

  it('does not mutate the view or expose catalogue/shared route references', () => {
    const { view, product } = fixture();
    const before = JSON.stringify(view);
    const model = buildMapFlowModel(view);
    const source = model.supply[0].sources[0];
    source.point.x = -999;
    source.route!.points[0].x = -999;
    source.route!.segments[0].points[0].y = -999;
    model.production.find((p) => p.productId === product.id)!.point.y = -999;
    expect(JSON.stringify(view)).toBe(before);
    const next = buildMapFlowModel(view);
    expect(next.supply[0].sources[0].route!.points[0].x).not.toBe(-999);
    expect(hexById(product.hexId!)!.y).not.toBe(-999);
  });
});
