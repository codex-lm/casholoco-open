import { describe, expect, it } from 'vitest';
import {
  boardBuildable, boardCells, boardTerrains, capitalCellId, cellBelongsToBoard,
  hexById, hexDistance, hexPlaceLabel, neighbors, SQUARE_SIZE,
} from '../src/content';
import { COASTLINE, DEPOSITS, LAKE, roadRoute } from '../src/content/map';
import { pointInPolygon } from '../src/content/hexes';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { projectDemandToHexes, parcelPopulationShares } from '../src/sim/demandMap';
import { freeBuildableHexes, hexTransportRoute, route, zoneHexId } from '../src/sim/hexes';
import { hexReservePrice, routeBetweenHexes } from '../src/sim/hexAuctions';
import { deliveryPerLotHex, portHaulHex } from '../src/sim/transport';
import { terrainValues } from '../src/sim/terrainAssignment';
import { CITY_IDS, SECTOR_IDS, ZONE_IDS, type Action, type GameState } from '../src/types';
import { bots, companyOf, config, human } from './helpers';

const square = { mapMode: 'square' as const };
const cells = boardCells(square);
function game() {
  return createGame({ ...config(47, 8), ...square, industryRules: 'network', terrainAssignment: 'host',
    terrains: { a: 'quai-port-dividende', b: 'faubourgs-croissance' } }, [human('a', 'gadgets'), human('b', 'yogurts')]);
}
function accepted(state: GameState, action: Action) {
  const result = applyAction(state, 'a', action);
  expect(result.ok, result.message).toBe(true);
}

describe('independent square topology and the same spatial economic contracts', () => {
  it('has distinct stable IDs, four reciprocal neighbours and Manhattan distance', () => {
    expect(SQUARE_SIZE).toBe(75);
    expect(cells.length).toBeGreaterThan(120);
    expect(new Set(cells.map(c => c.id)).size).toBe(cells.length);
    expect(cells.filter(c => c.deposit)).toHaveLength(10);
    expect(cells.filter(c => c.terrain === 'island')).toHaveLength(1);
    expect(boardCells()).toBe(boardCells({ mapMode: 'hex' }));
    for (const cell of cells) {
      expect(cell.id.startsWith('S-')).toBe(true);
      expect(cellBelongsToBoard(cell.id, square)).toBe(true);
      expect(cellBelongsToBoard(cell.id, { mapMode: 'hex' })).toBe(false);
      expect(neighbors(cell.id).length).toBeLessThanOrEqual(4);
      expect(pointInPolygon(cell, LAKE)).toBe(false);
      if (cell.terrain !== 'island') expect(pointInPolygon(cell, COASTLINE)).toBe(true);
      for (const other of neighbors(cell.id)) {
        expect(Math.abs(cell.q - other.q) + Math.abs(cell.r - other.r)).toBe(1);
        expect(hexDistance(cell, other)).toBe(1);
        expect(neighbors(other.id).map(c => c.id)).toContain(cell.id);
      }
    }
    expect(hexDistance(cells[0], capitalCellId())).toBe(Infinity);
    expect(routeBetweenHexes(cells[0].id, capitalCellId())).toBe(Infinity);
    for (const zone of ZONE_IDS) expect(hexById(zoneHexId(zone, square))?.zone).toBe(zone);
  });

  it('keeps the eight grants on distinct valid parcels and both languages name them', () => {
    const terrains = boardTerrains(square);
    expect(terrains).toHaveLength(8);
    expect(new Set(terrains.map(t => t.hex)).size).toBe(8);
    for (const terrain of terrains) {
      expect(boardBuildable(square)).toContain(terrain.hex);
      expect(hexPlaceLabel(terrain.hex, 'fr')).toContain(terrain.hex);
      expect(hexPlaceLabel(terrain.hex, 'en')).toContain(terrain.hex);
    }
    expect(boardTerrains(square).find(t => t.id === 'ile-aux-niches')?.hex)
      .toBe(cells.find(c => c.terrain === 'island')?.id);
    const state = game(), company = companyOf(state, 'a');
    expect(terrainValues(state, company, company.products[0], true))
      .toEqual(terrainValues(state, company, company.products[0], false));
  });

  it('uses finite physical routes, preserving anchored cities and zero intangible freight', () => {
    for (const cell of cells) {
      for (const node of [...CITY_IDS, ...Object.keys(DEPOSITS)]) {
        const path = hexTransportRoute(cell.id, node);
        expect(path, `${cell.id} → ${node}`).toBeDefined();
        expect(path!.cost).toBeCloseTo(route(cell.id, node), 9);
        expect(Number.isFinite(path!.km)).toBe(true);
      }
      for (const sector of SECTOR_IDS) expect(Number.isFinite(deliveryPerLotHex(cell.id, sector))).toBe(true);
      expect(deliveryPerLotHex(cell.id, 'crypto')).toBe(0);
    }
    for (const zone of ZONE_IDS) for (const target of CITY_IDS) {
      expect(route(zoneHexId(zone, square), target)).toBe(roadRoute(zone, target)!.cost);
    }
    expect(portHaulHex(capitalCellId(square), 'oil')).toBe(0);
    expect(hexTransportRoute(cells.find(c => c.terrain === 'island')!.id, 'capital')!.segments[0].kind).toBe('ferry');
  });

  it('projects the unchanged national demand exactly, without changing the simulation', () => {
    const byCity = { capital: 46, north_east: 23, south: 17, east: 9, north: 5 };
    const projection = projectDemandToHexes(137.5, byCity, square);
    expect(Object.keys(projection)).toEqual(cells.map(c => c.id));
    expect(Object.values(projection).reduce((sum, n) => sum + n, 0)).toBe(137.5);
    expect(Object.values(parcelPopulationShares(square)).reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  it('rejects foreign-board placement before mutation, then builds and extends on awarded square land', () => {
    const state = game(), company = companyOf(state, 'a'); company.cash = 1e6;
    const foreign = boardBuildable({ mapMode: 'hex' })[0];
    const invalid: Action[] = [
      { type: 'bidLand', companyId: company.id, hexId: foreign, bid: 1e4 },
      { type: 'buildFactory', companyId: company.id, productId: company.products[0].id, hexId: foreign, bid: 1e4 },
      { type: 'launchProduct', companyId: company.id, sectorId: 'gadgets', name: 'Wrong board', hexId: foreign, bid: 1e4, fallback: 'abandon' },
    ];
    for (const action of invalid) {
      const before = JSON.stringify(state);
      expect(applyAction(state, 'a', action).ok).toBe(false);
      expect(JSON.stringify(state)).toBe(before);
    }
    const hexId = freeBuildableHexes(state)[0];
    accepted(state, { type: 'bidLand', companyId: company.id, hexId, bid: hexReservePrice(hexId) });
    resolveTurn(state);
    expect(company.land?.some(parcel => parcel.hexId === hexId)).toBe(true);
    const original = company.products[0];
    accepted(state, { type: 'buildFactory', companyId: company.id, productId: original.id, hexId });
    const factory = company.products.at(-1)!;
    expect(factory.hexId).toBe(hexId);
    expect(factory.capacity).toBe(0);
    expect(factory.pendingCapacity).toBeGreaterThan(0);
    resolveTurn(state);
    expect(factory.capacity).toBeGreaterThan(0);
    accepted(state, { type: 'expandCapacity', companyId: company.id, productId: factory.id, lots: 1 });
    expect(factory.pendingCapacity).toBe(1);
    expect(getPlayerView(state, 'a').companies.find(c => c.id === company.id)!.products.find(p => p.id === factory.id)!.private?.pendingCapacity).toBe(1);
    expect(getPlayerView(state, 'b').companies.find(c => c.id === company.id)!.products.find(p => p.id === factory.id)!.private).toBeUndefined();
  });

  it('gives the square board to all public and private spatial views, without revealing rival plans', () => {
    const state = game(), view = getPlayerView(state, 'a');
    expect(view.config.mapMode).toBe('square');
    expect(view.hexes!.free.every(id => id.startsWith('S-'))).toBe(true);
    expect(Object.keys(view.hexes!.reserve)).toEqual([...boardBuildable(square)]);
    expect(view.terrains!.map(t => t.hex)).toEqual(boardTerrains(square).map(t => t.hex));
    for (const company of view.companies) for (const product of company.products) {
      expect(product.hexId?.startsWith('S-')).toBe(true);
      if (company.controllerId !== 'a') expect(product.private).toBeUndefined();
      if (product.private) {
        expect(Object.keys(product.private.hexes!.unitCost).every(id => id.startsWith('S-'))).toBe(true);
        expect(Object.values(product.private.hexes!.unitCost).every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('records incubator freight and completed sales from the square capital before an allocation', () => {
    const state = game(), company = companyOf(state, 'a'), product = company.products[0];
    // The incubator has no parcel yet; every forecast and realized route must nevertheless use this board.
    delete product.hexId; delete product.terrainId; delete company.terrainId;
    product.incubator = true; product.launchedTurn = state.turn;
    company.cash = 1e6;
    resolveTurn(state);
    const report = company.reports.at(-1)!.products.find(p => p.productId === product.id)!;
    expect(report.freight!.hexId).toBe(capitalCellId(square));
    expect(product.lastSalesOrigin?.hexId).toBe(capitalCellId(square));
    expect(product.hexId).toBeUndefined();
    expect(product.incubator).toBe(true);
  });

  it('keeps bots and JSON reload deterministic on a square board over multiple closes', () => {
    const players = [human('a'), ...bots(2)];
    const state = createGame({ ...config(83, 4), ...square, industryRules: 'network', terrainAssignment: 'random' }, players);
    const reloaded: GameState = JSON.parse(JSON.stringify(state));
    for (let i = 0; i < 4; i++) {
      resolveTurn(state); resolveTurn(reloaded);
      expect(reloaded).toEqual(state);
      for (const company of Object.values(state.companies)) {
        expect(Number.isFinite(company.cash)).toBe(true);
        for (const product of company.products) if (product.hexId) expect(cellBelongsToBoard(product.hexId, square)).toBe(true);
      }
    }
  });
});
