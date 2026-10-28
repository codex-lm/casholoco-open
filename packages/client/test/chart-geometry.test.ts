import { describe, expect, it } from 'vitest';
import { chartGeometry, niceScale, PAD } from '../src/components/LineChart';

describe('chartGeometry (échelle en bandes)', () => {
  it('plotW = width − marges, colW = plotW / slots', () => {
    const g = chartGeometry(874, 16);
    expect(g.plotLeft).toBe(PAD.left);
    expect(g.plotRight).toBe(874 - PAD.right);
    expect(g.plotW).toBe(874 - PAD.left - PAD.right);
    expect(g.slots).toBe(16);
    expect(g.colW).toBeCloseTo(g.plotW / 16, 10);
  });

  it('x(q) est le centre de la colonne q (1-based)', () => {
    const g = chartGeometry(874, 16);
    expect(g.x(1)).toBeCloseTo(g.plotLeft + g.colW / 2, 10);
    expect(g.x(4)).toBeCloseTo(g.plotLeft + 3.5 * g.colW, 10);
    expect(g.x(16)).toBeCloseTo(g.plotRight - g.colW / 2, 10);
  });

  it('slots est arrondi et planché à 1', () => {
    const g = chartGeometry(400, 0);
    expect(g.slots).toBe(1);
    expect(g.x(1)).toBeCloseTo((g.plotLeft + g.plotRight) / 2, 10);
    expect(chartGeometry(400, 3.6).slots).toBe(4);
  });
});

describe('colAt (inverse de x)', () => {
  it('retrouve la colonne depuis son centre ou ses bords', () => {
    const g = chartGeometry(874, 16);
    for (let q = 1; q <= 16; q++) expect(g.colAt(g.x(q))).toBe(q);
    expect(g.colAt(g.plotLeft)).toBe(1);
    expect(g.colAt(g.plotLeft + 3 * g.colW + 0.5)).toBe(4);
    expect(g.colAt(g.plotLeft + 16 * g.colW - 0.5)).toBe(16);
  });

  it('borne le résultat à 1..slots', () => {
    const g = chartGeometry(874, 16);
    expect(g.colAt(-50)).toBe(1);
    expect(g.colAt(g.plotLeft - 0.001)).toBe(1);
    expect(g.colAt(g.plotRight)).toBe(16);
    expect(g.colAt(10_000)).toBe(16);
  });
});

describe('niceScale (exportée, comportement inchangé)', () => {
  it('encadre la plage avec des ticks ronds', () => {
    const { lo, hi, ticks } = niceScale(12, 87);
    expect(lo).toBeLessThanOrEqual(12);
    expect(hi).toBeGreaterThanOrEqual(87);
    expect(ticks[0]).toBe(lo);
    expect(ticks[ticks.length - 1]).toBe(hi);
  });

  it('reste finie quand min = max ou valeurs non finies', () => {
    expect(niceScale(5, 5).lo).toBeLessThan(5);
    expect(niceScale(5, 5).hi).toBeGreaterThan(5);
    expect(niceScale(NaN, NaN)).toEqual({ lo: 0, hi: 1, ticks: [0, 1] });
  });
});
