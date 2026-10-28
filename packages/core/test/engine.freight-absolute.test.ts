import { describe, expect, it } from 'vitest';
import { COMMODITIES, SECTORS, roadRoute } from '../src/content';
import { createGame, resolveTurn } from '../src/engine';
import { TRANSPORT_COST_PER_KM } from '../src/sim/constants';
import { capitalHexId, deliveryKmByCityHex, route, zoneHexId } from '../src/sim/hexes';
import { deliveryKmByCity, salesMix } from '../src/sim/regions';
import { deliveryPerLot, deliveryPerLotHex, siteSupply, transportBreakdown, transportBreakdownHex, transportPerLot, transportPerLotHex } from '../src/sim/transport';
import { CITY_IDS, SECTOR_IDS, type SectorId } from '../src/types';
import { companyOf, config, human } from './helpers';

const oldPrices: Record<SectorId, number> = { energy_drinks: 85, gadgets: 305, scooters: 435, yogurts: 57, crypto: 260 };

describe('absolute freight: routes, sources, prices and historical close details', () => {
  it('prices add only the rounded capital standard delivery, identical on both maps', () => {
    for (const sectorId of SECTOR_IDS) {
      const hex = deliveryPerLotHex(capitalHexId, sectorId);
      expect(hex).toBe(deliveryPerLot('capital', sectorId));
      const expected = SECTORS[sectorId].intangible ? 0 : CITY_IDS.reduce((sum, city) =>
        sum + salesMix(sectorId, 'capital')[city] * roadRoute('capital', city)!.cost, 0)
        * TRANSPORT_COST_PER_KM * SECTORS[sectorId].freightWeight;
      expect(hex).toBeCloseTo(expected, 12);
      expect(SECTORS[sectorId].refPrice).toBe(Math.round(oldPrices[sectorId] + hex));
    }
  });

  it('absolute city legs are memoized, immutable and use the charged road distance', () => {
    const classic = deliveryKmByCity('capital');
    const hex = deliveryKmByCityHex(capitalHexId);
    expect(deliveryKmByCity('capital')).toBe(classic);
    expect(deliveryKmByCityHex(capitalHexId)).toBe(hex);
    expect(Object.isFrozen(classic)).toBe(true);
    expect(Object.isFrozen(hex)).toBe(true);
    for (const city of CITY_IDS) {
      expect(classic[city]).toBe(roadRoute('capital', city)!.cost);
      expect(hex[city]).toBe(route(capitalHexId, city));
    }
    expect(classic.capital).toBe(0);
    expect(classic.north).toBeGreaterThan(0);
  });

  it.each(['classic', 'hex'] as const)('%s close keeps actual partial source splits after contracts and news', (mapMode) => {
    const state = createGame({ ...config(71), mapMode }, [human('a', 'gadgets'), human('b', 'energy_drinks')]);
    const company = companyOf(state, 'a');
    const buyer = companyOf(state, 'b');
    company.cash = 1e6;
    company.inventory = {};
    state.activeEffects = [{ id: 'diesel', newsId: 'diesel', kind: 'transportCost', value: 1.6, turnsLeft: 2 }];
    const product = company.products[0];
    product.production = 10;
    product.zoneId = 'east';
    product.hexId = zoneHexId('east');
    company.sites = [{ id: 'lithium-1', commodityId: 'lithium', capacity: 3, unitCost: 90, activeFrom: state.turn }];
    state.contracts = [{ id: 'promise', sellerCompanyId: company.id, buyerCompanyId: buyer.id, commodityId: 'lithium', lots: 1, price: 100, turnsLeft: 2 }];
    const supply = siteSupply(state, company);
    expect(supply[0].lots).toBe(2); // 4 needed; one of the site's three lots belongs to the buyer.
    const detail = (mapMode === 'hex' ? transportBreakdownHex : transportBreakdown)(company, [10], supply, undefined, 1.6)[0];
    const total = (mapMode === 'hex' ? transportPerLotHex : transportPerLot)(company, [10], supply, undefined, 1.6)[0];
    expect(detail.total).toBe(total);
    const lithium = detail.materials.filter((leg) => leg.commodityId === 'lithium');
    expect(lithium.map((leg) => [leg.source, leg.lots])).toEqual([['port', 0.2], ['site', 0.2]]);
    for (const leg of detail.materials) {
      expect(Number.isFinite(leg.km)).toBe(true);
      expect(leg.km).toBeGreaterThanOrEqual(0);
      expect(leg.cost).toBeCloseTo(leg.lots * leg.km * COMMODITIES[leg.commodityId].freightWeight * TRANSPORT_COST_PER_KM * 1.6, 12);
    }
    expect(detail.delivery).toHaveLength(CITY_IDS.length);
    for (const leg of detail.delivery) expect(leg.cost).toBeCloseTo(leg.share * leg.km * SECTORS.gadgets.freightWeight * TRANSPORT_COST_PER_KM * 1.6, 12);
    resolveTurn(state);
    const report = company.reports.at(-1)!.products.find((line) => line.productId === product.id)!;
    expect(report.produced).toBe(10);
    expect(report.freight).toEqual(detail);
    expect(report.transport).toBe(detail.total);
    expect(report.transportMaterials).toBe(detail.materialsCost * 10);
    expect(report.transportDelivery).toBe(detail.deliveryCost * 10);
    const saved = JSON.stringify(report.freight);
    product.production = 1;
    product.zoneId = 'capital';
    product.hexId = capitalHexId;
    company.sites = [];
    state.activeEffects = [];
    expect(JSON.stringify(report.freight)).toBe(saved);
  });
});
