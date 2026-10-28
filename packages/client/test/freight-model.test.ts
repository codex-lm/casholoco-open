import { describe, expect, it } from 'vitest';
import {
  CITY_IDS,
  DEFAULT_ZONE,
  SECTORS,
  SECTOR_IDS,
  ZONE_IDS,
  capitalHexId,
  createGame,
  deliveryKmByCity,
  deliveryKmByCityHex,
  getPlayerView,
  resolveTurn,
  type CommodityId,
  type FreightBreakdown,
  type GameState,
} from '@muchomoney/core';
import {
  estimatedTransport,
  estimatedTransportHex,
  plannedLots,
  portOnlyTransport,
  portOnlyTransportHex,
  siteSupply,
  transportBreakdown,
  transportBreakdownHex,
  transportFactor,
} from '../../core/src/sim/transport';
import { currentProductFreight, launchFreight, launchFreightClassic, productFreight, productFreightClassic } from '../src/screens/game/city/freight';

function fixture(mapMode: 'classic' | 'hex', factor = 1.7) {
  const game = createGame({ seed: 173, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr', mapMode, terrainAssignment: 'fair' }, [
    { id: 'a', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'energy_drinks', connected: true, color: '#123456' },
    { id: 'b', name: 'Bob', isBot: false, companyName: 'Buyer', sectorId: 'gadgets', connected: true, color: '#654321' },
  ]);
  const company = Object.values(game.companies).find((c) => c.controllerId === 'a')!;
  const buyer = Object.values(game.companies).find((c) => c.controllerId === 'b')!;
  const initial = getPlayerView(game, 'a');
  const template = company.products[0];
  company.products = SECTOR_IDS.map((sectorId, i) => ({ ...structuredClone(template), id: `test-${sectorId}`, sectorId,
    capacity: 60 + i * 5, production: i === 2 ? 0 : 45 + i * 7,
    hexId: i === 0 ? capitalHexId : initial.hexes?.free[i * 3] ?? capitalHexId,
    zoneId: ZONE_IDS[i], stock: 0, pendingCapacity: 0 }));
  company.cash = 1e9;
  company.sites = [
    { id: 'sugar-1', commodityId: 'sugar', capacity: 18, unitCost: 30, activeFrom: 0 },
    { id: 'sugar-2', commodityId: 'sugar', capacity: 7.6, unitCost: 30, activeFrom: 0 },
    { id: 'sugar-3', commodityId: 'sugar', capacity: 50, unitCost: 30, activeFrom: 0, dormant: true },
    { id: 'oil-1', commodityId: 'oil', capacity: 7, unitCost: 32, activeFrom: 0 },
    { id: 'chips-1', commodityId: 'chips', capacity: 12, unitCost: 40, activeFrom: 0 },
    { id: 'chips-2', commodityId: 'chips', capacity: 50, unitCost: 40, activeFrom: game.turn + 1 },
    { id: 'lithium-1', commodityId: 'lithium', capacity: 10, unitCost: 40, activeFrom: 0 },
  ];
  game.contracts = [
    { id: 'sugar-live', sellerCompanyId: company.id, buyerCompanyId: buyer.id, commodityId: 'sugar', lots: 9, price: 35, turnsLeft: 2 },
    { id: 'oil-live', sellerCompanyId: company.id, buyerCompanyId: buyer.id, commodityId: 'oil', lots: 3, price: 35, turnsLeft: 2 },
    { id: 'expired', sellerCompanyId: company.id, buyerCompanyId: buyer.id, commodityId: 'sugar', lots: 100, price: 35, turnsLeft: 0 },
    { id: 'buyer-gone', sellerCompanyId: company.id, buyerCompanyId: 'missing', commodityId: 'sugar', lots: 100, price: 35, turnsLeft: 2 },
  ];
  game.activeEffects = [{ id: 'freight-news', newsId: 'test', kind: 'transportCost', value: factor, turnsLeft: 3 }];
  const view = getPlayerView(game, 'a');
  const companyView = view.companies.find((c) => c.id === company.id)!;
  return { game, company, view, companyView };
}

function exactTotals(detail: FreightBreakdown) {
  expect(detail.materialsCost).toBe(detail.materials.reduce((total, leg) => total + leg.cost, 0));
  expect(detail.deliveryCost).toBe(detail.delivery.reduce((total, leg) => total + leg.cost, 0));
  expect(detail.total).toBe(detail.materialsCost + detail.deliveryCost);
  expect(detail.materials.every((leg) => leg.cost >= 0 && Number.isFinite(leg.km))).toBe(true);
  expect(detail.delivery.every((leg) => leg.cost >= 0 && Number.isFinite(leg.km))).toBe(true);
}

function snapshot(game: GameState, company: ReturnType<typeof fixture>['company']) {
  const lots = plannedLots(company);
  return game.config.mapMode === 'hex'
    ? transportBreakdownHex(company, lots, siteSupply(game, company), undefined, transportFactor(game))
    : transportBreakdown(company, lots, siteSupply(game, company), undefined, transportFactor(game));
}

describe.each(['classic', 'hex'] as const)('absolute freight breakdown model (%s)', (mode) => {
  it.each([0.6, 1, 1.7])('matches engine exactly across products, positions and pro rata sites at factor %s', (factor) => {
    const { game, company, view, companyView } = fixture(mode, factor);
    const positions = mode === 'hex' ? [capitalHexId, ...view.hexes!.free.slice(0, 30)] : ZONE_IDS;
    for (const [index, product] of company.products.entries()) {
      const productView = companyView.products[index];
      for (const position of positions) {
        const detail = mode === 'hex'
          ? productFreight(view, companyView, productView, position)
          : productFreightClassic(view, companyView, productView, position as typeof ZONE_IDS[number]);
        const expected = mode === 'hex'
          ? estimatedTransportHex(game, company, product, position)
          : estimatedTransport(game, company, product, position as typeof ZONE_IDS[number]);
        expect(detail.total).toBe(expected);
        expect(detail.transportFactor).toBe(factor);
        exactTotals(detail);
        if (SECTORS[product.sectorId].intangible) {
          expect(detail.total).toBe(0);
          expect(detail.materials).toEqual([]);
          expect(detail.delivery).toEqual([]);
          continue;
        }
        expect(detail.delivery.map((leg) => leg.city)).toEqual(CITY_IDS);
        for (const [commodityId, per] of Object.entries(SECTORS[product.sectorId].inputs) as [CommodityId, number][]) {
          expect(detail.materials.filter((leg) => leg.commodityId === commodityId).reduce((lots, leg) => lots + leg.lots, 0)).toBeCloseTo(per, 12);
        }
        expect(detail.materials.some((leg) => leg.siteId === 'sugar-3' || leg.siteId === 'chips-2')).toBe(false);
      }
      const current = currentProductFreight(view, companyView, productView);
      expect(current.total).toBe(mode === 'hex' ? estimatedTransportHex(game, company, product) : estimatedTransport(game, company, product));
      if (index === 0) {
        expect(current.materialsCost).toBeGreaterThan(0); // capital subsidiaries have real haul now
        expect(current.deliveryCost).toBeGreaterThan(0); // capital serves provincial cities too
        expect(current.delivery.find((leg) => leg.city === DEFAULT_ZONE)!.km).toBe(0);
      }
    }
    const drinks = currentProductFreight(view, companyView, companyView.products[0]);
    expect(drinks.materials.filter((leg) => leg.commodityId === 'sugar').map((leg) => leg.source)).toEqual(['port', 'site', 'site']);
    // The first site has 9 of its 18 lots left, the second 7 whole lots; dormant / future capacity supplies none.
    const sugar = drinks.materials.filter((leg) => leg.commodityId === 'sugar' && leg.source === 'site');
    expect(sugar[0].lots / sugar[1].lots).toBeCloseTo(9 / 7, 12);
  });

  it('a launch agrees with the engine port-only estimate, including provincial delivery from the capital', () => {
    const { view } = fixture(mode);
    const positions = mode === 'hex' ? [capitalHexId, ...view.hexes!.free.slice(0, 20)] : ZONE_IDS;
    for (const sectorId of SECTOR_IDS) {
      for (const position of positions) {
        const detail = mode === 'hex' ? launchFreight(view, sectorId, position) : launchFreightClassic(view, sectorId, position as typeof ZONE_IDS[number]);
        const expected = mode === 'hex' ? portOnlyTransportHex(sectorId, position) : portOnlyTransport(sectorId, position as typeof ZONE_IDS[number]);
        expect(detail.total).toBeCloseTo(expected * view.transportFactor!, 12);
        exactTotals(detail);
        const distances = mode === 'hex' ? deliveryKmByCityHex(position) : deliveryKmByCity(position as typeof ZONE_IDS[number]);
        for (const leg of detail.delivery) expect(leg.km).toBe(distances[leg.city]);
      }
    }
    const capital = mode === 'hex' ? launchFreight(view, 'energy_drinks', capitalHexId) : launchFreightClassic(view, 'energy_drinks', DEFAULT_ZONE);
    expect(capital.materialsCost).toBe(0);
    expect(capital.materials.every((leg) => leg.km === 0)).toBe(true);
    expect(capital.deliveryCost).toBeGreaterThan(0);
  });

  it('stores the exact actual production freight for the report, independent of next-turn news and decisions', () => {
    const { game, company } = fixture(mode);
    const expected = snapshot(game, company);
    const lots = plannedLots(company);
    resolveTurn(game);
    const report = company.reports.at(-1)!;
    for (const [index, product] of company.products.entries()) {
      const line = report.products.find((line) => line.productId === product.id)!;
      expect(line.produced).toBe(lots[index]);
      if (line.produced > 0) {
        expect(line.freight).toEqual(expected[index]);
        expect(line.transport ?? 0).toBe(expected[index].total);
      }
    }
    const frozen = structuredClone(report.products.map((line) => line.freight));
    game.activeEffects = [{ id: 'other', newsId: 'test', kind: 'transportCost', value: 5, turnsLeft: 3 }];
    company.sites = [];
    company.products.forEach((product) => { product.zoneId = 'mountain'; product.hexId = 'A15'; });
    getPlayerView(game, 'a');
    expect(company.reports.at(-1)!.products.map((line) => line.freight)).toEqual(frozen);
  });
});
