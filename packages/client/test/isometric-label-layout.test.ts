import { describe, expect, it } from 'vitest';
import { placeIslandLabel, type LabelRect } from '../src/screens/game/city/isometric/labelLayout';

const anchor = { x: 120, y: 100 };
const size = { width: 80, height: 24 };
const viewport = { width: 300, height: 220 };
const above = { x: 80, y: 68, ...size };
const below = { x: 80, y: 108, ...size };
const left = { x: 32, y: 88, ...size };
const right = { x: 128, y: 88, ...size };
const intersects = (a: LabelRect, b: LabelRect) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
  && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);

describe('island city label placement', () => {
  it('prefers above, then below, then the two sides without moving the anchor', () => {
    expect(placeIslandLabel(anchor, size, viewport, [])).toEqual(above);
    // Thin horizontal obstacles block one vertical position without blocking either side.
    const upper = { x: 0, y: 68, width: 300, height: 5 };
    const lower = { x: 0, y: 127, width: 300, height: 5 };
    expect(placeIslandLabel(anchor, size, viewport, [upper])).toEqual(below);
    expect(placeIslandLabel(anchor, size, viewport, [upper, lower])).toEqual(left);
    expect(placeIslandLabel(anchor, size, viewport, [upper, lower, { x: 32, y: 88, width: 5, height: 24 }])).toEqual(right);
  });

  it('keeps a full 8 px border when a city lies near the viewport edge', () => {
    const placed = placeIslandLabel({ x: 8, y: 20 }, size, viewport, []);
    expect(placed).not.toBeNull();
    expect(placed!.x).toBeGreaterThanOrEqual(8);
    expect(placed!.y).toBeGreaterThanOrEqual(8);
    expect(placed!.x + placed!.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(placed!.y + placed!.height).toBeLessThanOrEqual(viewport.height - 8);
  });

  it('can nudge a label locally on a narrow screen, but never clamp it to a remote free region', () => {
    const narrow = { width: 100, height: 180 };
    const placed = placeIslandLabel({ x: 40, y: 100 }, size, narrow, []);
    expect(placed).toEqual({ x: 9, y: 68, ...size });
    expect(placeIslandLabel({ x: 25, y: 100 }, size, narrow, [])).toBeNull();
    expect(placeIslandLabel(anchor, size, viewport, [{ x: 0, y: 0, width: 220, height: 180 }])).toBeNull();
  });

  it('places a sequence of city labels without covering earlier labels or reserved controls', () => {
    const obstacles: LabelRect[] = [{ x: 8, y: 8, width: 110, height: 45 }, { x: 260, y: 8, width: 32, height: 160 }];
    const before = structuredClone(obstacles);
    const cities = [{ x: 100, y: 100 }, { x: 135, y: 105 }, { x: 185, y: 105 }, { x: 75, y: 155 }, { x: 195, y: 165 }];
    const placed: LabelRect[] = [];
    for (const city of cities) {
      const rect = placeIslandLabel(city, { width: 65, height: 20 }, viewport, [...obstacles, ...placed]);
      if (!rect) continue;
      expect([...obstacles, ...placed].some(other => intersects(rect, other))).toBe(false);
      expect(rect.x >= 8 && rect.y >= 8 && rect.x + rect.width <= 292 && rect.y + rect.height <= 212).toBe(true);
      placed.push(rect);
    }
    expect(placed.length).toBe(5);
    expect(obstacles).toEqual(before);
  });

  it('treats touching edges and zero-area obstacles as non-overlapping', () => {
    expect(placeIslandLabel(anchor, size, viewport, [
      { x: 0, y: 68, width: 80, height: 24 },
      { x: 120, y: 68, width: 0, height: 24 },
    ])).toEqual(above);
  });

  it('hides a label that cannot fit rather than overflowing the viewport', () => {
    expect(placeIslandLabel({ x: 30, y: 30 }, size, { width: 95, height: 60 }, [])).toBeNull();
    expect(placeIslandLabel(anchor, size, viewport, [{ x: 0, y: 0, ...viewport }])).toBeNull();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects non-finite coordinates or dimensions (%s)', (invalid) => {
    expect(placeIslandLabel({ ...anchor, x: invalid }, size, viewport, [])).toBeNull();
    expect(placeIslandLabel(anchor, { ...size, height: invalid }, viewport, [])).toBeNull();
    expect(placeIslandLabel(anchor, size, { ...viewport, width: invalid }, [])).toBeNull();
    expect(placeIslandLabel(anchor, size, viewport, [{ ...above, y: invalid }])).toBeNull();
  });

  it('rejects off-screen anchors and impossible sizes, without mutating its inputs', () => {
    expect(placeIslandLabel({ x: -1, y: 100 }, size, viewport, [])).toBeNull();
    expect(placeIslandLabel({ x: 120, y: 221 }, size, viewport, [])).toBeNull();
    expect(placeIslandLabel(anchor, { width: 0, height: 24 }, viewport, [])).toBeNull();
    expect(placeIslandLabel(anchor, size, { width: -1, height: 220 }, [])).toBeNull();
    expect(placeIslandLabel(anchor, size, viewport, [{ ...above, width: -1 }])).toBeNull();
    expect(placeIslandLabel(Object.freeze(anchor), Object.freeze(size), Object.freeze(viewport), Object.freeze([]))).toEqual(above);
  });
});
