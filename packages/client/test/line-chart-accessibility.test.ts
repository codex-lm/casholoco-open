import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LineChart, type Series } from '../src/components/LineChart';
import { lineChartMessages } from '../src/components/lineChartMessages';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
afterEach(() => setState(initial));
const series: Series[] = [
  { id: 'a', label: 'Atelier', color: '#333', values: [10, -3, 20] },
  { id: 'b', label: 'Biscuit', color: '#666', values: [2] },
];
const labels = ['T1', 'T2', 'T3'];
const format = (value: number) => `${value} k`;

describe.each(['fr', 'en'] as const)('valeurs du graphique (%s)', (lang) => {
  it('offre les valeurs exactes, une période nommée et un curseur natif borné aux données existantes', () => {
    setState({ lang });
    const html = renderToStaticMarkup(createElement(LineChart, { series, labels, format, slots: 16 }));
    expect(html).toContain(lineChartMessages[lang].values);
    expect(html).toContain('<input');
    expect(html).toContain('type="range" min="0" max="2" step="1"');
    expect(html).toContain('aria-valuetext="T3 · Atelier : 20 k"');
    expect(html).toContain('<th scope="col" class="num">Biscuit</th>');
    expect(html).toContain('<th scope="row">T2</th><td class="num">-3 k</td><td class="num">—</td>');
    expect(html).toContain('<th scope="row">T1</th><td class="num">10 k</td><td class="num">2 k</td>');
  });

  it('ne double pas les contrôles d’un graphique piloté par la frise de fortune', () => {
    setState({ lang });
    const html = renderToStaticMarkup(createElement(LineChart, { series, labels, format, hover: 1 }));
    expect(html).not.toContain('chart-values');
    expect(html).not.toContain('type="range"');
    expect(html).toContain('class="chart-tip"');
    expect(html).toContain('-3 k');
  });
});

it('conserve une valeur unique lisible sans curseur inutilisable ; un graphique vide reste vide', () => {
  const one = renderToStaticMarkup(createElement(LineChart, { series: [series[1]], format }));
  expect(one).toContain('chart-values-table');
  expect(one).toContain('2 k');
  expect(one).not.toContain('type="range"');
  const empty = renderToStaticMarkup(createElement(LineChart, { series: [] }));
  expect(empty).toContain('chart-empty');
  expect(empty).not.toContain('chart-values');
});
