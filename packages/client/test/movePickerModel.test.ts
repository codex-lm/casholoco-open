import { describe, expect, it } from 'vitest';
import { ZONE_IDS, createGame, getPlayerView, type ZoneId } from '@muchomoney/core';
import { estimatedTransport } from '../../core/src/sim/transport';
import { laborPerLot } from '../../core/src/sim/finance';
import { cityClientShare, clientBars, moveQuartersLeft, plantsInZone, rivalInZone, unitCostSplit, wagePressure } from '../src/screens/game/movePickerModel';

function fixture() {
  const game = createGame({ seed: 7, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang: 'fr' }, [
    { id: 'me', name: 'Ada', companyName: 'Ada SA', sectorId: 'yogurts', isBot: false, connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', companyName: 'Bob SA', sectorId: 'yogurts', isBot: false, connected: true, color: '#654321' },
  ]);
  game.activeEffects = [];
  const company = Object.values(game.companies).find((c) => c.controllerId === 'me')!;
  const rival = Object.values(game.companies).find((c) => c.controllerId === 'rival')!;
  const product = company.products[0];
  product.capacity = 50;
  product.production = 50;
  company.inventory = {};
  game.commodities.sugar.price = 40;
  game.commodities.oil.price = 80;
  const snapshot = () => {
    const view = getPlayerView(game, 'me');
    const mine = view.companies.find((c) => c.id === company.id)!;
    return { view, mine, product: mine.products[0] };
  };
  return { game, company, rival, product, snapshot };
}

describe('move picker numeric model', () => {
  it('keeps crypto transport zero in every zone with shared site supply and higher haul prices', () => {
    const { game, company, product, snapshot } = fixture();
    product.sectorId = 'crypto';
    product.zoneId = 'mountain';
    company.products.push({ ...product, id: 'physical-gadgets', sectorId: 'gadgets' });
    company.sites = [{ id: 'oil-1', commodityId: 'oil', capacity: 10, unitCost: 20, activeFrom: game.turn }];
    game.activeEffects.push({ id: 'haul', newsId: 'test', kind: 'transportCost', value: 3, turnsLeft: 2 });
    const { view, product: pv } = snapshot();
    for (const zone of ZONE_IDS) {
      const split = unitCostSplit(view, pv, zone)!;
      expect(split.transport, zone).toBe(0);
      expect(split.labour, zone).toBeCloseTo(laborPerLot(game, company, product, zone), 9);
      expect(split.labour + split.materials, zone).toBeCloseTo(split.total, 9);
    }
  });

  it('prices emergency materials and charges absolute delivery at the capital', () => {
    const { snapshot, game, company, product: stateProduct } = fixture();
    const { view, product } = snapshot();
    const split = unitCostSplit(view, product, 'capital')!;
    expect(split.materials).toBeCloseTo(0.3 * 40 * 1.1 + 0.1 * 80 * 1.1, 10);
    const freight = estimatedTransport(game, company, stateProduct, 'capital');
    expect(split.transport).toBeCloseTo(freight, 10);
    expect(split.transport).toBeGreaterThan(0);
    expect(split.labour).toBeCloseTo(14, 10);
    expect(split.total).toBeCloseTo(36 + freight, 10);
  });

  it('prices inventory at average cost and preserves labour news, offshoring and wage pressure', () => {
    const { game, company, product, rival, snapshot } = fixture();
    company.inventory = { sugar: { lots: 3, avgCost: 7 }, oil: { lots: 2, avgCost: 9 } };
    company.modifiers.push({ kind: 'offshoring', turnsLeft: 3 });
    product.zoneId = 'south';
    rival.products[0].zoneId = 'south';
    game.activeEffects.push(
      { id: 'wage', newsId: 'test', kind: 'laborCost', sectorId: 'yogurts', value: 1.2, turnsLeft: 2 },
      { id: 'zone', newsId: 'test', kind: 'zoneLabor', zoneId: 'south', value: 0.8, turnsLeft: 2 },
      { id: 'haul', newsId: 'test', kind: 'transportCost', value: 1.4, turnsLeft: 2 },
    );
    const { view, product: pv } = snapshot();
    for (const zone of ZONE_IDS) {
      const split = unitCostSplit(view, pv, zone)!;
      expect(split.materials, zone).toBeCloseTo((3 * 7 + 12 * 44 + 2 * 9 + 3 * 88) / 50, 10);
      expect(split.transport, zone).toBeCloseTo(estimatedTransport(game, company, product, zone), 10);
      expect(split.labour, zone).toBeCloseTo(laborPerLot(game, company, product, zone), 10);
      expect(split.labour + split.materials + split.transport, zone).toBeCloseTo(split.total, 10);
    }
    expect(unitCostSplit(view, pv, 'south')!.transport).toBeCloseTo(pv.private!.estimatedTransport, 10);
  });

  it('matches transport with shared subsidiary supply, merger order, contracts and inactive sites', () => {
    const { game, company, product, rival, snapshot } = fixture();
    product.zoneId = 'plain';
    company.products.push({ ...product, id: 'second-plant', zoneId: 'south' });
    company.sites = [
      { id: 'sugar-1', commodityId: 'sugar', capacity: 10, unitCost: 20, activeFrom: game.turn },
      { id: 'sugar-2', commodityId: 'sugar', capacity: 15, unitCost: 20, activeFrom: game.turn },
      { id: 'sugar-3', commodityId: 'sugar', capacity: 100, unitCost: 20, activeFrom: game.turn, dormant: true },
      { id: 'oil-1', commodityId: 'oil', capacity: 100, unitCost: 20, activeFrom: game.turn + 1 },
    ];
    (game.contracts ??= []).push({ id: 'contract', sellerCompanyId: company.id, buyerCompanyId: rival.id, commodityId: 'sugar', lots: 8, price: 30, turnsLeft: 2 });
    const { view, product: pv } = snapshot();
    for (const zone of ZONE_IDS) {
      expect(unitCostSplit(view, pv, zone)!.transport, zone).toBeCloseTo(estimatedTransport(game, company, product, zone), 10);
    }
    expect(unitCostSplit(view, pv, 'capital')!.transport).toBeCloseTo(estimatedTransport(game, company, product, 'capital'), 10);
    expect(unitCostSplit(view, pv, 'plain')!.transport).toBeCloseTo(pv.private!.estimatedTransport, 10);
    expect(unitCostSplit(view, pv, 'plain')!.transport).not.toBe(0);
  });

  it('uses subsidiary haulage savings instead of port-only routes', () => {
    const { game, company, product, snapshot } = fixture();
    product.sectorId = 'energy_drinks';
    product.zoneId = 'plain';
    company.sites = [{ id: 'sugar-1', commodityId: 'sugar', capacity: 50, unitCost: 20, activeFrom: game.turn }];
    const { view, product: pv } = snapshot();
    const supplied = unitCostSplit(view, pv, 'plain')!.transport;
    company.sites = [];
    expect(supplied).toBeLessThan(estimatedTransport(game, company, product, 'plain'));
    expect(unitCostSplit(view, pv, 'plain')!.transport).toBeCloseTo(pv.private!.estimatedTransport, 10);
  });

  it('uses one planned lot when output is zero, as the engine estimate does', () => {
    const { company, product, game, snapshot } = fixture();
    product.capacity = 0;
    product.pendingCapacity = 21;
    product.production = 0;
    const { view, product: pv } = snapshot();
    for (const zone of ZONE_IDS) expect(unitCostSplit(view, pv, zone)!.transport).toBeCloseTo(estimatedTransport(game, company, product, zone), 10);
  });

  it('applies 3 percent per other plant, capped at 15 percent, except at the capital', () => {
    expect(wagePressure('south', 0)).toBe(0);
    expect(wagePressure('south', 3)).toBeCloseTo(0.09);
    expect(wagePressure('south', 5)).toBeCloseTo(0.15);
    expect(wagePressure('south', 8)).toBeCloseTo(0.15);
    expect(wagePressure('capital', 8)).toBe(0);
  });

  it('counts active plants, excludes itself and spots a rival in the zone', () => {
    const { company, product, rival, snapshot } = fixture();
    company.products.push({ ...product, id: 'own-other', zoneId: 'south' });
    rival.products[0].zoneId = 'south';
    rival.products.push({ ...rival.products[0], id: 'rival-other' });
    product.zoneId = 'south';
    const { view, product: pv } = snapshot();
    expect(plantsInZone(view, 'south', pv.id)).toBe(3);
    expect(rivalInZone(view, company.id, pv, 'south')).toEqual({ product: rival.products[0].name, company: rival.name });
    expect(rivalInZone(view, company.id, pv, 'mountain')).toBeNull();
    view.companies.find((c) => c.id === rival.id)!.status = 'bankrupt';
    expect(plantsInZone(view, 'south', pv.id)).toBe(1);
    expect(rivalInZone(view, company.id, pv, 'south')).toBeNull();
  });

  it('uses capped expected sales for bars and the same current-zone baseline', () => {
    const { snapshot } = fixture();
    const { view, product } = snapshot();
    product.capacity = 10;
    product.private!.pendingCapacity = 5;
    product.private!.stock = 2;
    product.private!.zones.demand = Object.fromEntries(ZONE_IDS.map((z) => [z, 100])) as Record<ZoneId, number>;
    product.lastSalesByCity = { capital: 1, north: 1, north_east: 1, east: 1, south: 1 };
    const here = clientBars(view, product, 'capital')!;
    expect(here.reduce((n, bar) => n + bar.lots, 0)).toBeCloseTo(12);
    for (const bar of here) expect(bar.lots).toBe(bar.today);
    const away = clientBars(view, product, 'south')!;
    expect(away.reduce((n, bar) => n + bar.lots, 0)).toBeCloseTo(12);
    expect(away.map((bar) => bar.today)).toEqual(here.map((bar) => bar.lots));
    expect(away.some((bar) => bar.lots !== bar.today)).toBe(true);
    product.private!.zones.demand.south = 8;
    expect(clientBars(view, product, 'south')!.reduce((n, bar) => n + bar.lots, 0)).toBeCloseTo(8);
    delete product.private!.zones.demand;
    expect(clientBars(view, product, 'south')).toBeNull();
    expect(cityClientShare('yogurts', 'capital')).toBeGreaterThan(0);
    expect(cityClientShare('yogurts', 'mountain')).toBeNull();
  });

  it('counts the current quarter in the move payback horizon, including the last turn', () => {
    const { view } = fixture().snapshot();
    view.turn = 11;
    expect(moveQuartersLeft(view)).toBe(2);
    view.turn = 12;
    expect(moveQuartersLeft(view)).toBe(1);
    view.turn = 13;
    expect(moveQuartersLeft(view)).toBe(0);
  });
});
