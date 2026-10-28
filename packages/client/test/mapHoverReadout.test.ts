import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capitalHexId, createGame, getPlayerView, type Lang } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { hexReadabilityMessages } from '../src/i18n/hexReadability';
import { MapHoverReadout } from '../src/screens/game/city/MapHoverReadout';
import { mapDeliveryEstimate } from '../src/screens/game/city/mapDeliveryModel';
import type { HexReference } from '../src/screens/game/city/hexModel';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async original => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T) => selector(actual.getState()) };
});
const initial = getState();
afterEach(() => setState(initial));

function fixture(lang: Lang) {
  const game = createGame({ seed: 71, totalTurns: 8, turnSeconds: 0, startYear: 2027,
    mapMode: 'hex', industryRules: 'network', lang }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  const view = getPlayerView(game, 'human');
  const product = view.companies.find(company => company.controllerId === 'human')!.products[0];
  setState({ lang, view, lobby: null });
  return { view, reference: { kind: 'product', productId: product.id } as HexReference };
}

describe.each(['fr', 'en'] as const)('compact map hover readings (%s)', lang => {
  it('updates destination figures without changing the reference, and shows total demand-weighted margin', () => {
    const { view, reference } = fixture(lang);
    const before = JSON.stringify(reference), fmt = fmtFor(lang), text = hexReadabilityMessages(lang);
    const first = view.hexes!.free[0], second = view.hexes!.free.at(-1)!;
    const render = (hoveredId: string) => renderToStaticMarkup(createElement(MapHoverReadout, { view, reference, supplyReference: null, hoveredId }));
    const firstHtml = render(first), secondHtml = render(second);
    expect(firstHtml).toContain(`data-hex-hover="${first}"`);
    expect(secondHtml).toContain(`data-hex-hover="${second}"`);
    expect(secondHtml).not.toContain(`data-hex-hover="${first}"`);
    expect(firstHtml).not.toBe(secondHtml);
    for (const [id, html] of [[first, firstHtml], [second, secondHtml]] as const) {
      const estimate = mapDeliveryEstimate(view, reference, null, id)!;
      expect(estimate.demand).not.toBeNull(); expect(estimate.margin).not.toBeNull();
      expect(html).toContain(fmt.lots(estimate.demand!, 3));
      expect(html).toContain(fmt.lotPrice(estimate.transport!, 3));
      expect(html).toContain(fmt.signedMoney(estimate.demand! * estimate.margin!, 3));
      expect(html).toContain(text.totalMargin);
      expect(html).not.toContain(text.deliveryMargin);
      expect(html).not.toContain('aria-live'); expect(html).not.toContain('<button');
    }
    expect(JSON.stringify(reference)).toBe(before);
  });

  it('asks for a hover when no destination is under the pointer', () => {
    const { view, reference } = fixture(lang);
    const html = renderToStaticMarkup(createElement(MapHoverReadout, { view, reference, supplyReference: null, hoveredId: null }));
    expect(html).toContain(hexReadabilityMessages(lang).hoverHint);
    expect(html).not.toContain('<dl'); expect(html).not.toContain('data-hex-hover');
  });

  it('keeps missing population and unavailable estimates unknown rather than inventing zero', () => {
    const { view } = fixture(lang);
    delete view.hexes!.populationShare;
    const html = renderToStaticMarkup(createElement(MapHoverReadout, { view, reference: null, supplyReference: null, hoveredId: capitalHexId }));
    expect(html.match(/<dd>—<\/dd>/g)).toHaveLength(4);
    expect(html).not.toContain('0,000'); expect(html).not.toContain('0.000');
    expect(html).not.toContain('NaN'); expect(html).not.toContain('Infinity');
  });
});
