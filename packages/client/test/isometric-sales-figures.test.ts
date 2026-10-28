import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CITY_IDS, createGame, getContent, getPlayerView, resolveTurn, type CityId, type Lang, type SectorId } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { isometricMessages } from '../src/i18n/isometric';
import { mapFlowText } from '../src/i18n/mapFlows';
import { getState, setState, type AppState } from '../src/store';
import { buildMapFlowModel, type FactoryFlow, type FlowModel, type SalesFlow } from '../src/screens/game/city/mapFlows';
import { IslandSalesFigures, islandSalesFigures } from '../src/screens/game/city/isometric/IslandSalesFigures';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
const initial = getState();
afterEach(() => setState(initial));

function game(sectorId: SectorId = 'yogurts') {
  const state = createGame({ seed: 44, totalTurns: 8, turnSeconds: 0, startYear: 2027,
    mapMode: 'square', terrainAssignment: 'fair', industryRules: 'network' }, [
    { id: 'me', name: 'Ada', isBot: false, companyName: 'Manufacture', sectorId, connected: true, color: '#b07b51' },
    { id: 'rival', name: 'Ben', isBot: false, companyName: 'Ateliers', sectorId: 'gadgets', connected: true, color: '#617c85' },
  ]);
  const view = getPlayerView(state, 'me');
  const product = view.companies.find(company => company.controllerId === 'me')!.products[0];
  return { state, view, product };
}
const roomView = game().view;
function factory(id = 'tracked'): FactoryFlow {
  return { id, productId: id, companyId: 'own-company', companyName: 'Manufacture', name: `Product ${id}`,
    sectorId: 'yogurts', color: '#b07b51', mine: true, point: { x: 100, y: 100 }, hexId: 'S-A1', zoneId: 'capital',
    stock: 42, planned: 99, demand: 123, estimatedSales: 123, surplus: 18, lastSold: 8.5, intangible: false };
}
function sale(overrides: Partial<SalesFlow> = {}): SalesFlow {
  return { id: 'tracked:east', productId: 'tracked', companyId: 'own-company', companyName: 'Manufacture', name: 'Product tracked',
    color: '#b07b51', mine: true, point: { x: 100, y: 100 }, cityId: 'east', destination: { x: 600, y: 300 },
    sold: 8.5, national: false, intangible: false, originKnown: true, turn: 2, ...overrides };
}
function model(sales: SalesFlow[] = [sale()]): FlowModel {
  // The first factory may be the one inspected on the map; the followed product is independent of it.
  return { selectedProductId: 'tracked', production: [factory('inspected'), factory()], supply: [], sales };
}
const escape = (value: string) => renderToStaticMarkup(createElement('span', null, value)).slice(6, -7);
function render(flow: FlowModel, lang: Lang, roomLang: Lang = lang) {
  setState({ lang, lobby: null, view: { ...roomView, config: { ...roomView.config, lang: roomLang } } });
  return renderToStaticMarkup(createElement(IslandSalesFigures, { model: flow, startYear: 2027 }));
}

describe('island sales figures from the followed product', () => {
  it('keeps only positive finite sales of the followed own product, without mutating the model', () => {
    const kept = sale();
    const flow = model([kept, sale({ id: 'inspected:east', productId: 'inspected', sold: 200 }),
      sale({ id: 'rival:east', mine: false, sold: 300 }),
      ...[0, -2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map((sold, index) => sale({ id: `invalid:${index}`, sold })),
      sale({ id: 'unknown-city', cityId: 'unknown' as CityId }), sale({ id: 'no-city', cityId: undefined })]);
    const before = structuredClone(flow);
    expect(islandSalesFigures(flow)).toEqual([kept]);
    expect(flow).toEqual(before);
  });

  it('leaves missing models, launch references and rival selections without numbers', () => {
    expect(islandSalesFigures(undefined)).toEqual([]);
    expect(islandSalesFigures(null)).toEqual([]);
    expect(islandSalesFigures({ ...model(), selectedProductId: null })).toEqual([]);
    expect(islandSalesFigures({ ...model([sale({ productId: 'rival', mine: false })]), selectedProductId: 'rival' })).toEqual([]);
  });

  it('keeps crypto city quantities when the historical origin is missing, with no route required', () => {
    const crypto = sale({ intangible: true, originKnown: false, turn: undefined, route: undefined });
    expect(islandSalesFigures(model([crypto]))).toEqual([crypto]);
  });

  it('retains a national total as one national line instead of inventing customer cities', () => {
    const national = sale({ cityId: undefined, destination: undefined, national: true, originKnown: false, turn: undefined });
    const result = islandSalesFigures(model([national]));
    expect(result).toEqual([national]);
    expect(result.every(item => item.cityId === undefined)).toBe(true);
  });

  it('has no completed sales before the first close, then at most the five published cities', () => {
    const { state, view, product } = game('crypto');
    expect(view.turn).toBe(1);
    expect(islandSalesFigures(buildMapFlowModel(view, product.id))).toEqual([]);
    resolveTurn(state);
    const figures = islandSalesFigures(buildMapFlowModel(getPlayerView(state, 'me'), product.id));
    expect(figures.length).toBeGreaterThan(0);
    expect(figures.length).toBeLessThanOrEqual(CITY_IDS.length);
    expect(new Set(figures.map(item => item.cityId)).size).toBe(figures.length);
    expect(figures.every(item => item.turn === 1 && item.sold > 0 && item.cityId && CITY_IDS.includes(item.cityId))).toBe(true);
    expect(figures.every(item => item.intangible && !item.route)).toBe(true);
  });
});

describe.each(['fr', 'en'] as const)('ordinary HTML sales readout (%s)', (lang) => {
  it('names the followed product and recorded quarter, with all five city quantities readable without canvas or hover', () => {
    const values = [.5, 2, 3.25, 4, 5];
    const flow = model(CITY_IDS.map((cityId, index) => sale({ id: `tracked:${cityId}`, cityId, sold: values[index] })));
    const html = render(flow, lang), text = mapFlowText(lang), fmt = fmtFor(lang);
    expect(html).toContain(`aria-label="${escape(isometricMessages(lang).sales)}"`);
    expect(html).toContain('Product tracked');
    expect(html).not.toContain('Product inspected');
    expect(html).toContain(escape(fmt.date(2, 2027)));
    expect(html.match(/<li>/g)).toHaveLength(5);
    CITY_IDS.forEach((cityId, index) => {
      expect(html).toContain(escape(getContent(lang).mapNames.cities[cityId]));
      expect(html).toContain(escape(text.lots(fmt.num(values[index]), values[index])));
    });
    expect(html).not.toContain('aria-hidden');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain(text.planned);
    expect(html).not.toContain(text.forecast);
    expect(html).not.toContain(text.companyStock);
  });

  it('keeps crypto figures without an old origin and labels their intangible nature without inventing a date', () => {
    const flow = model([sale({ intangible: true, originKnown: false, turn: undefined, sold: .25 })]);
    flow.production[1].intangible = true;
    const html = render(flow, lang), text = mapFlowText(lang);
    expect(html).toContain(escape(getContent(lang).mapNames.cities.east));
    expect(html).toContain(escape(text.lots(fmtFor(lang).num(.25), .25)));
    expect(html).toContain(escape(text.intangible));
    expect(html).not.toContain('2027');
    expect(html).not.toContain('NaN');
  });

  it('renders a single national total without city names when no breakdown was published', () => {
    const html = render(model([sale({ national: true, cityId: undefined, destination: undefined, originKnown: false, turn: undefined })]), lang);
    expect(html.match(/<li>/g)).toHaveLength(1);
    expect(html).toContain(escape(mapFlowText(lang).national));
    for (const cityId of CITY_IDS) expect(html).not.toContain(escape(getContent(lang).mapNames.cities[cityId]));
  });

  it('explains no sales before the first close and never prints corrupt quantities', () => {
    const { view, product } = game();
    const beforeClose = render(buildMapFlowModel(view, product.id), lang);
    expect(beforeClose).toContain(escape(mapFlowText(lang).noSales));
    expect(beforeClose).not.toContain('<li>');
    expect(beforeClose).not.toContain('2027');
    const invalid = render(model([sale({ sold: Number.NaN }), sale({ id: 'infinite', sold: Number.POSITIVE_INFINITY })]), lang);
    expect(invalid).toContain(escape(mapFlowText(lang).noSales));
    expect(invalid).not.toMatch(/NaN|Infinity|∞/);
  });

  it('renders nothing for a launch reference or a rival factory', () => {
    expect(render({ ...model(), selectedProductId: null }, lang)).toBe('');
    const rival = model();
    rival.production[1].mine = false;
    expect(render(rival, lang)).toBe('');
  });

  it('does not label mixed or partially missing historical quarters with a single false date', () => {
    for (const turn of [undefined, 3]) {
      const html = render(model([sale(), sale({ id: 'tracked:north', cityId: 'north', turn })]), lang);
      expect(html.match(/<li>/g)).toHaveLength(2);
      expect(html).not.toContain('2027');
    }
  });
});

it.each([['fr', 'en'], ['en', 'fr']] as const)('keeps interface labels in %s and room dates/numbers in %s', (uiLang, roomLang) => {
  const html = render(model([sale({ sold: 1234.5 })]), uiLang, roomLang);
  expect(html).toContain(escape(isometricMessages(uiLang).sales));
  expect(html).toContain(escape(getContent(uiLang).mapNames.cities.east));
  expect(html).toContain(escape(fmtFor(roomLang).date(2, 2027)));
  expect(html).toContain(escape(mapFlowText(uiLang).lots(fmtFor(roomLang).num(1234.5), 1234.5)));
});
