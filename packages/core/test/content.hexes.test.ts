import { describe, expect, it } from 'vitest';
import { BUILDABLE, HEX_R, HEXES, hexById, hexDistance, neighbors, pointInPolygon, segmentIntersectsPolygon, segmentWithinPolygon } from '../src/content/hexes';
import { COASTLINE, DEPOSITS, JUNCTIONS, LAKE, MOUNTAIN_RANGE, ROAD_FACTOR, ZONES, distanceKm, roadNode, roadRoute } from '../src/content/map';
import {
  FERRY_KM, HEAT_PRICE, ISLAND_HEX_ID, basin, candidateHexes, capitalHexId, deliveryKmByHex, freeBuildableHexes,
  heatCredit, hexLaborFactor, nearestFreeHex, occupiedHexes, plantsInBasin, proximityByHex, proximityOfHex, ring,
  route, routeAccessNode, salesMixByHex, zoneHexId,
} from '../src/sim/hexes';
import { proximity } from '../src/sim/regions';
import { CITY_IDS, SECTOR_IDS, ZONE_IDS } from '../src/types';
import { companyOf, human, newGame } from './helpers';

describe('hex board geometry', () => {
  it('pins the 158 mainland cells plus the explicitly added island, and ten land deposits', () => {
    expect(HEX_R).toBe(45);
    expect(HEXES).toHaveLength(159);
    expect(HEXES.filter((h) => h.terrain !== 'island')).toHaveLength(158);
    expect(HEXES.filter((h) => h.deposit)).toHaveLength(10);
    expect(BUILDABLE).toHaveLength(149);
    expect(new Set(HEXES.map((h) => h.id)).size).toBe(HEXES.length);
    expect(new Set(HEXES.map((h) => `${h.q},${h.r}`)).size).toBe(HEXES.length);
    expect(HEXES).toEqual([...HEXES].sort((a, b) => a.q - b.q || a.r - b.r));
    for (const h of HEXES) {
      expect(pointInPolygon(h, LAKE), h.id).toBe(false);
      if (h.terrain !== 'island') expect(pointInPolygon(h, COASTLINE), h.id).toBe(true);
      expect(BUILDABLE.includes(h.id), h.id).toBe(!h.deposit);
    }
  });

  it('pins all eight named cells and keeps deposits off cities and zones', () => {
    const named = { capital: 'A10', north_east: 'H5', south: 'E16', north: 'C3', east: 'K11', plain: 'D17', mountain: 'K8' } as const;
    for (const z of ZONE_IDS) {
      expect(zoneHexId(z), z).toBe(named[z]);
      expect(hexById(named[z])!.zone, z).toBe(z);
    }
    for (const city of CITY_IDS) expect(hexById(named[city])!.city).toBe(city);
    expect(hexById('K8')!.terrain).toBe('mountain');
    expect(hexById('A15')).toMatchObject({ q: 1, r: 14, terrain: 'island' });
    expect(BUILDABLE).toContain('A15');
    for (const h of HEXES.filter((h) => h.deposit)) {
      expect(h.city).toBeUndefined();
      expect(h.zone).toBeUndefined();
      expect(DEPOSITS[h.deposit!]).toBeDefined();
    }
    expect(HEXES.filter((h) => h.deposit).map((h) => h.deposit).sort()).toEqual(
      Object.keys(DEPOSITS).filter((id) => id !== 'oil-1' && id !== 'oil-2').sort(),
    );
  });

  it('uses odd-row neighbours and symmetric cube distance, with no water cells', () => {
    expect(hexDistance('A10', 'A15')).toBe(5);
    expect(neighbors('not-a-cell')).toEqual([]);
    expect(hexById('toString')).toBeUndefined();
    expect(hexDistance('not-a-cell', capitalHexId)).toBe(Infinity);
    for (const h of HEXES) {
      expect(hexDistance(h, h)).toBe(0);
      expect(neighbors(h.id).length).toBeLessThanOrEqual(6);
      for (const nb of neighbors(h.id)) {
        expect(hexDistance(h, nb)).toBe(1);
        expect(neighbors(nb.id).map((cell) => cell.id)).toContain(h.id);
      }
      for (const other of HEXES) expect(hexDistance(h, other)).toBe(hexDistance(other, h));
    }
  });

  it('detects polygon crossings, vertex touches, overlapping banks and zero-length segments', () => {
    const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    const cases = [
      [{ x: -1, y: 2 }, { x: 5, y: 2 }, true],
      [{ x: -1, y: 1 }, { x: 1, y: -1 }, true],
      [{ x: -1, y: 0 }, { x: 5, y: 0 }, true],
      [{ x: 1, y: 1 }, { x: 2, y: 2 }, true],
      [{ x: 0, y: 2 }, { x: 0, y: 2 }, true],
      [{ x: 2, y: 2 }, { x: 2, y: 2 }, true],
      [{ x: -1, y: -1 }, { x: -1, y: -1 }, false],
      [{ x: -1, y: -1 }, { x: 5, y: -1 }, false],
    ] as const;
    for (const [a, b, expected] of cases) {
      expect(segmentIntersectsPolygon(a, b, square)).toBe(expected);
      expect(segmentIntersectsPolygon(b, a, square)).toBe(expected);
    }
    expect(segmentWithinPolygon({ x: 0, y: 0 }, { x: 4, y: 0 }, square)).toBe(true);
    expect(segmentWithinPolygon({ x: 2, y: 2 }, { x: 2, y: 2 }, square)).toBe(true);
    expect(segmentWithinPolygon({ x: -1, y: 0 }, { x: 4, y: 0 }, square)).toBe(false);
    const concave = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 6 }, { x: 0, y: 6 }];
    expect(segmentWithinPolygon({ x: 1, y: 5 }, { x: 5, y: 5 }, concave)).toBe(false);
    expect(segmentWithinPolygon({ x: 1, y: 1 }, { x: 5, y: 1 }, concave)).toBe(true);
  });
});

describe('hex route, basin and regional profiles', () => {
  it('anchors every named node to the symmetric classic network, without cheaper off-road shortcuts', () => {
    const nodes = HEXES.filter((h) => h.zone || h.deposit);
    for (const a of nodes) {
      const from = a.zone ?? a.deposit!;
      for (const b of nodes) {
        const to = b.zone ?? b.deposit!;
        expect(route(a.id, to), `${a.id} → ${to}`).toBe(roadRoute(from, to)!.cost);
        expect(route(a.id, to)).toBeCloseTo(route(b.id, from), 9);
      }
      for (const deposit of Object.keys(DEPOSITS)) expect(route(a.id, deposit)).toBe(roadRoute(from, deposit)!.cost);
    }
    expect(route('invalid', 'capital')).toBe(Infinity);
    expect(route(capitalHexId, 'invalid')).toBe(Infinity);
    expect(routeAccessNode('invalid', 'capital')).toBeUndefined();
    expect(routeAccessNode(capitalHexId, 'invalid')).toBeUndefined();
  });


  it('chooses road access when cheaper and a direct piste when the target is closer', () => {
    expect(route('A4', 'capital')).toBeCloseTo(512.4861866198287, 9);
    expect(route('A4', 'capital')).toBeLessThan(distanceKm(hexById('A4')!, ZONES.capital) * 1.5);
    expect(routeAccessNode('A4', 'capital')).toBe('sugar-3');
    expect(route('J6', 'capital')).toBeCloseTo(725.5012705824881, 9);
    expect(route('C5', 'mountain')).toBeCloseTo(1071.0635483233457, 9);
    expect(routeAccessNode('C5', 'mountain')).toBe('j-north-coast');
    expect(route('J8', 'mountain')).toBeCloseTo(distanceKm(hexById('J8')!, ZONES.mountain) * 1.5 * 1.6, 9);
    expect(routeAccessNode('J8', 'mountain')).toBe('mountain');
  });

  it('charges only the sampled mountain portion of a piste, including lowland starts K5 and J7', () => {
    for (const [id, expected] of [['K5', 372.39165556267517], ['J7', 326.137832127416]] as const) {
      const cell = hexById(id)!;
      expect(pointInPolygon(cell, MOUNTAIN_RANGE)).toBe(false);
      expect(routeAccessNode(id, 'lithium-1')).toBe('lithium-1');
      expect(route(id, 'lithium-1')).toBeCloseTo(expected, 9);
      const lowlandCost = distanceKm(cell, DEPOSITS['lithium-1']) * 1.5;
      expect(route(id, 'lithium-1')).toBeGreaterThan(lowlandCost);
      expect(route(id, 'lithium-1')).toBeLessThan(lowlandCost * ROAD_FACTOR.mountain);
    }
  });

  it('every chosen piste stays on the mainland and clear of the lake; sea deposits use their pipelines', () => {
    const targets = [...ZONE_IDS, ...Object.keys(DEPOSITS), ...Object.keys(JUNCTIONS)];
    for (const h of HEXES) {
      for (const target of targets) {
        const access = routeAccessNode(h.id, target);
        const label = `${h.id} → ${target} via ${access}`;
        if (h.zone || h.deposit || h.terrain === 'island') {
          expect(access, label).toBeUndefined();
          continue;
        }
        expect(access, label).toBeDefined();
        const node = roadNode(access!)!;
        expect(segmentIntersectsPolygon(h, node, LAKE), label).toBe(false);
        expect(segmentWithinPolygon(h, node, COASTLINE), label).toBe(true);
        expect(access, label).not.toBe('oil-1');
        expect(access, label).not.toBe('oil-2');
      }
      for (const [deposit, port] of [['oil-1', 'north'], ['oil-2', 'capital']] as const) {
        expect(route(h.id, deposit), `${h.id} → ${deposit}`).toBeCloseTo(route(h.id, port) + roadRoute(port, deposit)!.cost, 9);
      }
    }
    expect(segmentIntersectsPolygon(hexById('D8')!, ZONES.east, LAKE)).toBe(true);
    expect(route('D8', 'east')).toBeCloseTo(1001.292328507215, 9);
    expect(segmentWithinPolygon(hexById('H3')!, ZONES.north, COASTLINE)).toBe(false);
    expect(routeAccessNode('H3', 'north')).toBe('j-north-coast');
  });

  it('all cells reach every node, while the island must use its highway-rate ferry via the capital', () => {
    const targets = [...ZONE_IDS, ...Object.keys(DEPOSITS)];
    for (const h of HEXES) {
      for (const target of targets) {
        expect(Number.isFinite(route(h.id, target)), `${h.id} → ${target}`).toBe(true);
        expect(route(h.id, target)).toBeGreaterThanOrEqual(0);
      }
    }
    for (const target of targets) {
      expect(route(ISLAND_HEX_ID, target)).toBeCloseTo(FERRY_KM * ROAD_FACTOR.highway + route(capitalHexId, target), 9);
    }
    expect(basin(ISLAND_HEX_ID)).toBe('capital');
    expect(ring(ISLAND_HEX_ID)).toBe(5);
    for (const zone of ZONE_IDS) {
      expect(basin(zoneHexId(zone))).toBe(zone);
      expect(ring(zoneHexId(zone))).toBe(0);
    }
  });

  it('city-cell proximity equals the classic zone for every sector to 1e-9', () => {
    for (const sector of SECTOR_IDS) {
      for (const city of CITY_IDS) {
        const classic = proximity(sector, city);
        const hex = proximityByHex(sector, zoneHexId(city));
        for (const target of CITY_IDS) expect(hex[target], `${sector}/${city}/${target}`).toBeCloseTo(classic[target], 9);
      }
      expect(proximityOfHex(sector, capitalHexId, true)).toEqual([1, 1, 1, 1, 1]);
      expect(proximityOfHex(sector, capitalHexId, false)).toEqual([1]);
      expect(deliveryKmByHex(sector, capitalHexId)).toBeCloseTo(CITY_IDS.reduce((sum, city) => sum + salesMixByHex(sector, capitalHexId)[city] * route(capitalHexId, city), 0), 12);
      for (const h of HEXES) {
        expect(Object.values(salesMixByHex(sector, h.id)).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        expect(Number.isFinite(deliveryKmByHex(sector, h.id))).toBe(true);
      }
    }
  });

  it('the home bonus extends exactly to the province city cell and its neighbors, nowhere else', () => {
    const nearNorth = [zoneHexId('north'), ...neighbors(zoneHexId('north')).map((h) => (typeof h === 'string' ? h : h.id))];
    for (const id of nearNorth) {
      expect(proximityByHex('energy_drinks', id).north).toBe(1 + 0.2);
      for (const city of CITY_IDS) if (city !== 'north') expect(proximityByHex('energy_drinks', id)[city]).toBe(1);
    }
    const distant = HEXES.find((h) => hexDistance(h.id, zoneHexId('north')) === 2)!;
    for (const city of CITY_IDS) expect(proximityByHex('energy_drinks', distant.id)[city]).toBe(1);
    // No capital bonus: the capital cell keeps factor 1 everywhere, and no cell ever gets a bonus in the capital city.
    for (const city of CITY_IDS) expect(proximityByHex('energy_drinks', capitalHexId)[city]).toBe(1);
    for (const h of HEXES) expect(proximityByHex('energy_drinks', h.id).capital).toBe(1);
  });

  it('labour applies commuting, other active plants, the pressure cap and basin news', () => {
    const state = newGame(7, [human('a')]);
    state.activeEffects = [];
    for (const c of Object.values(state.companies)) for (const p of c.products) p.hexId = capitalHexId;
    const company = companyOf(state, 'a');
    const product = company.products[0];
    product.hexId = zoneHexId('north');
    expect(hexLaborFactor(state, 'energy_drinks', product.hexId, product.id)).toBe(ZONES.north.labor.energy_drinks);
    expect(hexLaborFactor(state, 'energy_drinks', product.hexId)).toBeCloseTo(0.86 * 1.03, 12);
    const northCells = BUILDABLE.filter((id) => basin(id) === 'north' && id !== product.hexId);
    expect(northCells.length).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < 8; i++) company.products.push({ ...product, id: `north-${i}`, hexId: northCells[i] });
    expect(plantsInBasin(state, 'north', product.id)).toBe(8);
    expect(hexLaborFactor(state, 'energy_drinks', product.hexId, product.id)).toBeCloseTo(0.86 * 1.15, 12);
    expect(hexLaborFactor(state, 'energy_drinks', capitalHexId)).toBe(1);
    expect(hexLaborFactor(state, 'energy_drinks', ISLAND_HEX_ID)).toBe(1.08);
    state.activeEffects.push({ id: 'strike', newsId: 'test', kind: 'zoneLabor', zoneId: 'north', value: 1.2, turnsLeft: 2 });
    expect(hexLaborFactor(state, 'energy_drinks', product.hexId, product.id)).toBeCloseTo(0.86 * 1.2 * 1.15, 12);
    const remote = northCells.find((id) => ring(id) > 1)!;
    expect(hexLaborFactor(state, 'energy_drinks', remote, product.id)).toBeCloseTo(0.86 * (1 + 0.02 * (ring(remote) - 1)) * 1.2 * 1.15, 12);
    company.status = 'bankrupt';
    expect(plantsInBasin(state, 'north')).toBe(0);
  });
});

describe('hex waste heat and free cells', () => {
  it('pins the crypto credit table and applies it throughout each home neighbourhood', () => {
    expect(HEAT_PRICE).toBe(5);
    const table = { capital: 0, north: 7.5, north_east: 6, east: 5, south: 2.5, mountain: 10, plain: 0 } as const;
    for (const z of ZONE_IDS) {
      expect(heatCredit('crypto', zoneHexId(z)), z).toBe(table[z]);
      if (table[z] > 0) for (const n of neighbors(zoneHexId(z))) expect(heatCredit('crypto', n.id), n.id).toBe(table[z]);
    }
    expect(heatCredit('crypto', ISLAND_HEX_ID)).toBe(0);
    for (const h of HEXES) for (const sector of SECTOR_IDS.filter((s) => s !== 'crypto')) expect(heatCredit(sector, h.id)).toBe(0);
    const remote = HEXES.find((h) => h.id !== ISLAND_HEX_ID && ZONE_IDS.every((z) => hexDistance(h.id, zoneHexId(z)) > 1))!;
    expect(heatCredit('crypto', remote.id)).toBe(0);
  });

  it('allocates by hex distance then board order and releases inactive company cells', () => {
    const state = newGame(7, [human('a')]);
    for (const c of Object.values(state.companies)) c.products = [];
    expect(nearestFreeHex(state)).toBe(capitalHexId);
    const company = companyOf(state, 'a');
    const template = companyOf(newGame(8, [human('a')]), 'a').products[0];
    company.products = [{ ...template, hexId: capitalHexId }];
    const nearest = BUILDABLE.filter((id) => id !== capitalHexId).sort((a, b) => hexDistance(a, capitalHexId) - hexDistance(b, capitalHexId))[0];
    expect(nearestFreeHex(state)).toBe(nearest);
    expect(occupiedHexes(state)).toEqual({ [capitalHexId]: company.id });
    expect(freeBuildableHexes(state)).not.toContain(capitalHexId);
    const candidates = candidateHexes(state, capitalHexId);
    expect(candidates.length).toBeLessThanOrEqual(ZONE_IDS.length * 10 + 1);
    for (const zone of ZONE_IDS) {
      const available = freeBuildableHexes(state).filter((id) => basin(id) === zone);
      expect(candidates.filter((id) => id !== capitalHexId && basin(id) === zone)).toHaveLength(Math.min(10, available.length));
    }
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates).toContain(capitalHexId);
    for (const id of candidates.filter((id) => id !== capitalHexId)) expect(freeBuildableHexes(state)).toContain(id);
    company.status = 'merged';
    expect(nearestFreeHex(state)).toBe(capitalHexId);
    company.status = 'active';
    company.products = BUILDABLE.map((hexId, i) => ({ ...template, id: `full-${i}`, hexId }));
    expect(nearestFreeHex(state)).toBeUndefined();
    expect(candidateHexes(state)).toEqual([]);
    expect(candidateHexes(state, capitalHexId)).toEqual([capitalHexId]);
  });
});
