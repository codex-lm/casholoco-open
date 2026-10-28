import { describe, expect, it } from 'vitest';
import { COMMODITIES, HEXES, SECTORS, SECTOR_IDS, SITE_UNIT_COST_RATIO, TRANSPORT_COST_PER_KM, createGame, getPlayerView, routeBetweenHexes, type CommodityId, type SectorId } from '@muchomoney/core';
import { mapDeliveryLensValue, mapDeliveryRange, mapFactoryDelivery, mapSupplyDelivery } from '../src/screens/game/city/mapDeliveryModel';
import { companyOf, config, human } from '../../core/test/helpers';
import { deliveryPerLotHex, estimatedTransportHex, portHaulHex, portOnlyTransportHex } from '../../core/src/sim/transport';
import { effectiveFixedCost } from '../../core/src/sim/terrains';
import { hexEstimate, hexLensRange, hexLensValue, hexMarginValue, hexSupplyFreight } from '../src/screens/game/city/hexModel';
import { siteHaulHex } from '../../core/src/sim/transport';

function setup(sector: SectorId = 'energy_drinks') {
  const state = createGame({ ...config(143), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'quai-port-dividende', b: 'faubourgs-croissance' } }, [human('a', sector), human('b', 'yogurts')]);
  state.activeEffects = [];
  const company = companyOf(state, 'a');
  return { state, company, product: company.products[0] };
}

describe('hex client estimates share engine geography and budgets', () => {
  it('keeps the factory at the chosen origin, prices the delivery leg and conserves its total demand across destinations', () => {
    const { state, product } = setup();
    const view = getPlayerView(state, 'a');
    const source = view.hexes!.free[0], target = view.hexes!.free.at(-1)!;
    const ref = { kind: 'product' as const, productId: product.id, originHexId: source };
    const here = mapFactoryDelivery(view, ref, source)!, there = mapFactoryDelivery(view, ref, target)!;
    expect(here.transport).toBe(0);
    expect(here.demand).toBeGreaterThan(0);
    expect(there.transport).toBeCloseTo(routeBetweenHexes(source, target) * TRANSPORT_COST_PER_KM * SECTORS[product.sectorId].freightWeight, 10);
    expect(there.margin).toBeCloseTo(here.margin! - there.transport!, 10);
    expect(here.totalMargin).toBe(here.demand! * here.margin!);
    expect(there.totalMargin).toBe(there.demand! * there.margin!);
    expect(mapDeliveryLensValue(view, ref, null, target, 'margin')).toBe(there.totalMargin);
    expect(HEXES.reduce((sum, hex) => sum + mapFactoryDelivery(view, ref, hex.id)!.demand!, 0)).toBe(hexEstimate(view, ref, source)!.demand);
    expect(view.companies.find((c) => c.private)!.products[0].hexId).toBe(product.hexId);
  });

  it('matches a real deposit freight leg, including material weight and current transport effects', () => {
    const { state } = setup();
    const view = getPlayerView(state, 'a');
    view.transportFactor = 1.7;
    const source = HEXES.find((hex) => hex.deposit)!;
    for (const cid of ['oil', 'sugar', 'lithium', 'chips'] as const) {
      const reference = { originHexId: source.id, commodityId: cid };
      for (const id of view.hexes!.free) expect(hexSupplyFreight(view, reference, id)).toBeCloseTo(siteHaulHex(source.deposit!, id, cid) * 1.7, 8);
      expect(hexSupplyFreight(view, reference, source.id)).toBe(0);
      expect(hexSupplyFreight(view, reference, 'unknown')).toBeNull();
    }
  });
  it('shows material needs of the destination product and the delivery margin at spot value', () => {
    const { state, product } = setup();
    const view = getPlayerView(state, 'a');
    const source = HEXES.find((hex) => hex.deposit === 'sugar-1')!.id;
    const ref = { originHexId: source, commodityId: 'sugar' as const, recipient: { kind: 'product' as const, productId: product.id } };
    const result = mapSupplyDelivery(view, ref, product.hexId!)!;
    const own = view.companies.find((c) => c.private)!.products[0].private!;
    expect(result.demand).toBe(Math.floor(Math.min(own.production, product.capacity)) * SECTORS[product.sectorId].inputs.sugar!);
    expect(result.margin).toBeGreaterThan(0);
    expect(result.margin! + result.transport!).toBeCloseTo(view.commodities.find((c) => c.id === 'sugar')!.price - COMMODITIES.sugar.basePrice * SITE_UNIT_COST_RATIO, 10);
    expect(result.totalMargin).toBe(result.demand! * result.margin!);
    const empty = mapSupplyDelivery(view, ref, view.hexes!.free[0])!;
    expect(empty.transport).not.toBeNull();
    expect(empty.margin).not.toBeNull();
    expect(empty.demand).toBeNull();
    expect(empty.totalMargin).toBeNull();
    const rival = view.companies.find((c) => !c.private)!.products[0];
    expect(mapSupplyDelivery(view, ref, rival.hexId!)!.demand).toBeNull();
    expect(mapFactoryDelivery(view, { kind: 'product', productId: view.companies.find((c) => !c.private)!.products[0].id }, source)).toBeNull();
  });
  it('keeps theoretical losses, missing costs and zero destination needs honest in the total-margin scale', () => {
    const { state, product } = setup();
    const view = getPlayerView(state, 'a');
    const source = HEXES.find((hex) => hex.deposit === 'sugar-1')!.id;
    const supply = { originHexId: source, commodityId: 'sugar' as const };
    const material = view.commodities.find((c) => c.id === 'sugar')!;
    material.price = 0;
    const loss = mapSupplyDelivery(view, supply, product.hexId!)!;
    expect(loss.totalMargin).toBeLessThan(0);
    expect(mapDeliveryLensValue(view, null, supply, product.hexId!, 'margin')).toBe(loss.totalMargin);
    const range = mapDeliveryRange(view, null, supply, 'margin')!;
    expect(range[0]).toBe(loss.totalMargin);
    expect(range.at(-1)).toBe(loss.totalMargin);
    expect(mapDeliveryLensValue(view, null, supply, view.hexes!.free[0], 'margin')).toBeNull();

    material.price = Infinity;
    expect(mapSupplyDelivery(view, supply, product.hexId!)!.totalMargin).toBeNull();
    material.price = Number.MAX_VALUE;
    expect(mapSupplyDelivery(view, supply, product.hexId!)!.totalMargin).toBeNull();
    view.commodities = view.commodities.filter((c) => c.id !== 'sugar');
    expect(mapSupplyDelivery(view, supply, product.hexId!)!.totalMargin).toBeNull();

    const reset = getPlayerView(state, 'a');
    reset.companies.find((c) => c.private)!.products[0].private!.production = 0;
    expect(mapSupplyDelivery(reset, supply, product.hexId!)!.totalMargin).toBe(0);
  });
  it('prices supply needs at an explicitly placed theoretical receiving factory only', () => {
    const { state } = setup();
    const view = getPlayerView(state, 'a');
    const source = HEXES.find((hex) => hex.deposit === 'sugar-1')!.id;
    const target = view.hexes!.free[0];
    const supply = { originHexId: source, commodityId: 'sugar' as const,
      recipient: { kind: 'launch' as const, sectorId: 'energy_drinks' as const, originHexId: target } };
    expect(mapSupplyDelivery(view, supply, target)!.demand).toBeGreaterThan(0);
    expect(mapSupplyDelivery(view, supply, view.hexes!.free[1])!.demand).toBeNull();
    expect(mapSupplyDelivery(view, { ...supply, recipient: { kind: 'launch', sectorId: 'energy_drinks' } }, target)!.demand).toBeNull();
  });
  it('keeps crypto launch and existing-product transport exactly zero on every estimated cell', () => {
    const { state, company, product } = setup('crypto');
    company.sites = [{ id: 'oil-1', commodityId: 'oil', capacity: 20, unitCost: 10, activeFrom: state.turn }];
    state.activeEffects.push({ id: 'transport', newsId: 'test', kind: 'transportCost', value: 3, turnsLeft: 2 });
    const view = getPlayerView(state, 'a');
    const cells = [product.hexId!, ...view.hexes!.free];
    for (const id of cells) {
      const current = hexEstimate(view, { kind: 'product', productId: product.id }, id);
      expect(current, id).not.toBeNull();
      expect(current!.transport, id).toBe(0);
      const launch = hexEstimate(view, { kind: 'launch', sectorId: 'crypto' }, id);
      if (launch) expect(launch.transport, id).toBe(0);
    }
  });

  it('matches the engine transport reference for every available launch sector and cell', () => {
    const { state } = setup();
    state.activeEffects.push({ id: 'transport', newsId: 'test', kind: 'transportCost', value: 1.4, turnsLeft: 2 });
    const view = getPlayerView(state, 'a');
    for (const sectorId of SECTOR_IDS) {
      const candidates = Object.keys(view.sectors.find((s) => s.id === sectorId)?.launchByHex ?? {});
      expect(candidates.length).toBeGreaterThan(0);
      for (const id of candidates) expect(hexEstimate(view, { kind: 'launch', sectorId }, id)?.transport).toBeCloseTo(portOnlyTransportHex(sectorId, id) * 1.4, 8);
    }
  });

  it('gives the Transport lens a real spread, amplified by freight weight', () => {
    const { state } = setup();
    const view = getPlayerView(state, 'a');
    const cells = view.hexes!.free;
    expect(cells.length).toBeGreaterThan(0);
    // Référence du moteur, au poids : livraison au poids du secteur + chaque intrant au poids de sa matière.
    const expected = (sectorId: SectorId, id: string) =>
      deliveryPerLotHex(id, sectorId) +
      (Object.entries(SECTORS[sectorId].inputs) as [CommodityId, number | undefined][])
        .reduce((sum, [cid, per]) => sum + (per ?? 0) * portHaulHex(id, cid), 0);
    const lensSpread = (sectorId: SectorId) => {
      for (const id of cells) expect(hexLensValue(view, { kind: 'launch', sectorId }, id, 'transport'), id).toBeCloseTo(expected(sectorId, id), 8);
      const range = hexLensRange(view, { kind: 'launch', sectorId }, 'transport')!;
      expect(range[1], sectorId).toBeGreaterThan(range[0]);
      return range[1] - range[0];
    };
    const heavy = lensSpread('energy_drinks');
    const light = lensSpread('gadgets');
    // Canettes lourdes (×3) contre gadgets partis par la poste (×0,6) : l'écart suit les poids, à la louche.
    expect(heavy / light).toBeGreaterThan(SECTORS.energy_drinks.freightWeight / SECTORS.gadgets.freightWeight / 2);
  });

  it('matches proportional site supply after contracts, including paused production and multiple products', () => {
    const { state, company, product } = setup();
    product.production = 0;
    company.products.push({ ...product, id: 'second-plant', name: 'Second', terrainId: undefined, sectorId: 'gadgets', hexId: 'B4', production: 34, capacity: 50 });
    company.sites = [
      { id: 'oil-1', commodityId: 'oil', capacity: 11, unitCost: 10, activeFrom: state.turn },
      { id: 'oil-2', commodityId: 'oil', capacity: 6, unitCost: 10, activeFrom: state.turn },
      { id: 'sugar-3', commodityId: 'sugar', capacity: 7, unitCost: 2, activeFrom: state.turn },
      { id: 'sugar-1', commodityId: 'sugar', capacity: 20, unitCost: 2, activeFrom: state.turn, dormant: true },
    ];
    state.contracts = [{ id: 'supply', sellerCompanyId: company.id, buyerCompanyId: companyOf(state, 'b').id, commodityId: 'oil', lots: 4, price: 20, turnsLeft: 2 }];
    state.activeEffects.push({ id: 'transport', newsId: 'test', kind: 'transportCost', value: .8, turnsLeft: 2 });
    const view = getPlayerView(state, 'a');
    const ref = { kind: 'product' as const, productId: product.id };
    for (const id of view.hexes!.free) {
      const estimate = hexEstimate(view, ref, id);
      if (estimate) expect(estimate.transport, id).toBeCloseTo(estimatedTransportHex(state, company, product, id), 7);
    }
  });

  it('keeps exact current margin and removes plant fixed-cost privileges when comparing a destination', () => {
    const { state, company, product } = setup();
    state.activeEffects.push({ id: 'local-cost', newsId: 'test', kind: 'terrain', terrain: product.terrainId, lever: 'fixedCost', value: .4, turnsLeft: 2 });
    const view = getPlayerView(state, 'a');
    const own = view.companies.find((c) => c.id === company.id)!.products[0].private!;
    const ref = { kind: 'product' as const, productId: product.id };
    expect(hexEstimate(view, ref, product.hexId!)!.margin).toBe(own.estimate!.margin);
    expect(hexMarginValue(view, ref, product.hexId!, true)).toBe(0);
    const id = Object.keys(own.hexes!.unitCost).find((id) => view.hexes!.free.includes(id))!;
    const estimate = hexEstimate(view, ref, id)!;
    const planned = Math.max(0, Math.floor(Math.min(product.production, product.capacity)));
    const expected = Math.min(own.hexes!.demand![id], product.stock + planned) * product.price
      - planned * own.hexes!.unitCost[id] - product.marketing - product.rnd - effectiveFixedCost(state, { ...product, hexId: id }, company);
    expect(estimate.margin).toBeCloseTo(expected, 7);
    expect(hexMarginValue(view, ref, id, true)).toBeCloseTo(expected - own.estimate!.margin, 7);
  });
});
