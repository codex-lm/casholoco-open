import { describe, expect, it } from 'vitest';
import { CITY_IDS, HEXES, SECTOR_IDS, capitalHexId, createGame, estimateDemandByCity, estimateLaunchInHex, estimateSales, getPlayerView, parcelPopulationShares, projectDemandToHexes, zoneHexId, type CityId } from '../src';
import { companyOf, config, human } from './helpers';

const sum = (values: Record<string, number>) => Object.values(values).reduce((a, b) => a + b, 0);

describe('read-only parcel population and demand', () => {
  it('conserves exactly every requested total, with stable nonnegative values and no input mutation', () => {
    for (const city of CITY_IDS) {
      const byCity = Object.fromEntries(CITY_IDS.map((c) => [c, c === city ? 1 : .07])) as Record<CityId, number>;
      const before = JSON.stringify(byCity);
      for (const total of [0, .000001, .1, 1, 53.247889123, 10000, 1e12]) {
        const cells = projectDemandToHexes(total, byCity);
        expect(Object.keys(cells)).toEqual(HEXES.map((h) => h.id));
        expect(sum(cells)).toBe(total);
        expect(Object.values(cells).every((n) => Number.isFinite(n) && n >= 0)).toBe(true);
        expect(projectDemandToHexes(total, byCity)).toEqual(cells);
      }
      expect(JSON.stringify(byCity)).toBe(before);
    }
  });

  it('has exactly 100% population, concentrated around cities, and returns independent copies', () => {
    const population = parcelPopulationShares();
    expect(sum(population)).toBe(1);
    expect(population[capitalHexId]).toBeGreaterThan(population.A15);
    const old = population[capitalHexId];
    population[capitalHexId] = -1;
    expect(parcelPopulationShares()[capitalHexId]).toBe(old);
  });

  it('decomposes the same product forecasts in every sector, preserving global economics and RNG', () => {
    for (const sector of SECTOR_IDS) {
      const state = createGame({ ...config(71), mapMode: 'hex' }, [human('a', sector), human('b', sector)]);
      const company = companyOf(state, 'a');
      for (const origin of [capitalHexId, zoneHexId('north'), zoneHexId('east')]) {
        const p = company.products[0];
        p.hexId = origin;
        p.marketing = 271;
        p.rnd = 113;
        const before = JSON.stringify(state);
        const view = getPlayerView(state, 'a');
        const own = view.companies.find((c) => c.id === company.id)!.products[0];
        const plan = { ...own, ...own.private! };
        const market = own.private!.market!;
        const byCity = estimateDemandByCity(sector, market, plan);
        const total = own.private!.estimate!.demand;
        expect(sum(byCity)).toBeCloseTo(total, 10);
        expect(sum(projectDemandToHexes(total, byCity))).toBe(total);
        expect(estimateSales(sector, market, plan)).toEqual(own.private!.estimate);
        expect(JSON.stringify(state)).toBe(before);
      }
    }
  });

  it('exposes launch city components only in the human map view and preserves ordinary launch advice', () => {
    const state = createGame({ ...config(37), mapMode: 'hex' }, [human('a', 'gadgets')]);
    const before = JSON.stringify(state);
    const view = getPlayerView(state, 'a');
    for (const sector of SECTOR_IDS) {
      const launch = view.sectors.find((s) => s.id === sector)!.launchByHex!;
      for (const id of [capitalHexId, zoneHexId('north')]) {
        expect(sum(launch[id].demandByCity!)).toBeCloseTo(launch[id].demand, 10);
        expect(sum(projectDemandToHexes(launch[id].demand, launch[id].demandByCity!))).toBe(launch[id].demand);
        const { demandByCity: _map, ...ordinary } = launch[id];
        expect(estimateLaunchInHex(state, sector, 'a', [id])[id]).toEqual(ordinary);
      }
    }
    expect(JSON.stringify(state)).toBe(before);
  });
});
