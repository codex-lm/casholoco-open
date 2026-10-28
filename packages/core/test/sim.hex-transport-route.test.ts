import { describe, expect, it } from 'vitest';
import { hexTransportRoute, type MapPoint } from '../src';
import { HEXES, hexById, segmentIntersectsPolygon, segmentWithinPolygon } from '../src/content/hexes';
import { COASTLINE, DEPOSITS, ISLAND, JUNCTIONS, LAKE, ROAD_FACTOR, ZONES, distanceKm, roadNode, roadRoute } from '../src/content/map';
import { FERRY_KM, ISLAND_HEX_ID, route, routeAccessNode } from '../src/sim/hexes';

const nodeIds = [...Object.keys(ZONES), ...Object.keys(DEPOSITS), ...Object.keys(JUNCTIONS)];
const coordinates = ({ x, y }: MapPoint): MapPoint => ({ x, y });
const polylineKm = (points: MapPoint[]) => points.slice(1).reduce((sum, p, index) => sum + distanceKm(points[index], p), 0);

describe('hexTransportRoute: geometry of the existing transport route', () => {
  it('is available from the public core API and rejects unknown cells and nodes', () => {
    expect(hexTransportRoute('unknown', 'capital')).toBeUndefined();
    expect(hexTransportRoute('E16', 'unknown')).toBeUndefined();
    expect(hexTransportRoute('', '')).toBeUndefined();
    const self = hexTransportRoute('E16', 'south')!;
    expect(self).toEqual({ points: [{ x: 440, y: 980 }], km: 0, cost: 0, segments: [{ kind: 'road', points: [{ x: 440, y: 980 }], km: 0, cost: 0 }] });
  });

  it('matches every engine cost and every physical polyline outside the ferry', () => {
    for (const hex of HEXES) for (const target of nodeIds) {
      const result = hexTransportRoute(hex.id, target)!;
      const label = `${hex.id} → ${target}`;
      expect(result, label).toBeDefined();
      expect(result.cost, label).toBe(route(hex.id, target));
      expect(result.points.at(-1), label).toEqual({ x: roadNode(target)!.x, y: roadNode(target)!.y });
      expect(result.segments.reduce((sum, segment) => sum + segment.cost, 0), label).toBe(result.cost);
      if (hex.terrain !== 'island') expect(polylineKm(result.points), label).toBeCloseTo(result.km, 8);
    }
  });

  it('retains the network polyline and symmetry of anchored zones and deposits', () => {
    const anchored = HEXES.filter((hex) => hex.zone || hex.deposit);
    for (const from of anchored) for (const to of anchored) {
      const sourceNode = (from.zone ?? from.deposit)!;
      const targetNode = (to.zone ?? to.deposit)!;
      const result = hexTransportRoute(from.id, targetNode)!;
      const reverse = hexTransportRoute(to.id, sourceNode)!;
      const native = roadRoute(sourceNode, targetNode)!;
      expect(result.segments.map((segment) => segment.kind)).toEqual(['road']);
      expect(result.points).toEqual(native.points.map(coordinates));
      expect(result.km).toBe(native.km);
      expect(result.cost).toBe(native.cost);
      expect(result.cost).toBeCloseTo(reverse.cost, 9);
      expect(result.km).toBeCloseTo(reverse.km, 9);
      // Physical start remains the actual network node, not the nearest tile centre.
      expect(result.points[0]).toEqual({ x: roadNode(sourceNode)!.x, y: roadNode(sourceNode)!.y });
    }
  });

  it('uses the selected access track and never draws that track through the lake or outside the coast', () => {
    for (const hex of HEXES.filter((h) => !h.zone && !h.deposit && h.terrain !== 'island')) for (const target of nodeIds) {
      const result = hexTransportRoute(hex.id, target)!;
      const [track, road] = result.segments;
      const access = routeAccessNode(hex.id, target)!;
      expect(track.kind).toBe('track');
      expect(road.kind).toBe('road');
      expect(track.points).toEqual([{ x: hex.x, y: hex.y }, { x: roadNode(access)!.x, y: roadNode(access)!.y }]);
      expect(road.points).toEqual(roadRoute(access, target)!.points.map(coordinates));
      expect(track.km).toBe(distanceKm(track.points[0], track.points[1]));
      expect(segmentIntersectsPolygon(track.points[0], track.points[1], LAKE)).toBe(false);
      expect(segmentWithinPolygon(track.points[0], track.points[1], COASTLINE)).toBe(true);
    }
  });

  it('preserves the cost of a mountain access track', () => {
    const result = hexTransportRoute('J8', 'mountain')!;
    const track = result.segments[0];
    expect(track.cost).toBeCloseTo(track.km * 1.5 * ROAD_FACTOR.mountain, 9);
    expect(result.points[0]).toEqual({ x: hexById('J8')!.x, y: hexById('J8')!.y });
  });

  it('marks the ferry as indicative and preserves its fixed modeled distance and capital connection', () => {
    const result = hexTransportRoute(ISLAND_HEX_ID, 'south')!;
    const [ferry, road] = result.segments;
    const centre = { x: ISLAND.reduce((sum, p) => sum + p.x, 0) / ISLAND.length, y: ISLAND.reduce((sum, p) => sum + p.y, 0) / ISLAND.length };
    expect(ferry).toEqual({ kind: 'ferry', points: [centre, { x: ZONES.capital.x, y: ZONES.capital.y }], km: FERRY_KM, cost: FERRY_KM * ROAD_FACTOR.highway, indicative: true });
    expect(road.points).toEqual(roadRoute('capital', 'south')!.points.map(coordinates));
    expect(road.indicative).toBeUndefined();
    expect(result.km).toBe(FERRY_KM + roadRoute('capital', 'south')!.km);
    expect(result.cost).toBe(route(ISLAND_HEX_ID, 'south'));
    expect(polylineKm(ferry.points)).not.toBeCloseTo(ferry.km, 5);
  });

  it('returns independent point objects without exposing or mutating the map catalog', () => {
    const pristine = hexTransportRoute('E16', 'north_east')!;
    const mutable = hexTransportRoute('E16', 'north_east')!;
    mutable.points[0].x = -12345;
    expect(mutable.segments[0].points[0]).toEqual(pristine.segments[0].points[0]);
    mutable.segments[0].points[0].y = -12345;
    expect(hexTransportRoute('E16', 'north_east')).toEqual(pristine);
    expect(roadRoute('south', 'north_east')!.points.map(coordinates)).toEqual(pristine.points);
  });
});
