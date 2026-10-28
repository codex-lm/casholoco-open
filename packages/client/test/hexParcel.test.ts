import { describe, expect, it } from 'vitest';
import { HEXES, HEX_R, neighbors } from '@muchomoney/core';
import { hexParcel, hexParcelKm } from '../src/screens/game/city/hexModel';
import { mapScale } from '../src/screens/game/city/mapModel';
import { MAP_VIEW } from '../src/screens/game/city/BaseMap';

const key = (p: { x: number; y: number }) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`;

describe('hex parcels (drawn outlines)', () => {
  it('give every cell a 24-point outline that never changes between renders', () => {
    for (const hex of HEXES) {
      const points = hexParcelKm(hex);
      expect(points).toHaveLength(24);
      expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      expect(hexParcelKm(hex)).toEqual(points);
    }
    const projection = mapScale(680, MAP_VIEW);
    expect(hexParcel(HEXES[0], projection).split(' ')).toHaveLength(24);
  });

  it('make neighbours share exactly the same border, so the map has no gap and no overlap', () => {
    for (const hex of HEXES) {
      const mine = new Set(hexParcelKm(hex).map(key));
      for (const other of neighbors(hex.id)) {
        const shared = hexParcelKm(other).filter((p) => mine.has(key(p)));
        // Two corners and the three samples in between.
        expect(shared.length, `${hex.id}/${other.id}`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('keep inner corners close to the engine hex and push only the edge of the grid out towards the coast', () => {
    for (const hex of HEXES) {
      const outside = hexParcelKm(hex).filter((p) => Math.hypot(p.x - hex.x, p.y - hex.y) > HEX_R * 1.4);
      if (neighbors(hex.id).length === 6) expect(outside, hex.id).toHaveLength(0);
    }
  });
});
