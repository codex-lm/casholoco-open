import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getContent, type Lang } from '@muchomoney/core';
import { mapFlowText } from '../src/i18n/mapFlows';
import { getState, setState, type AppState } from '../src/store';
import { MapFlowControls } from '../src/screens/game/city/MapFlowControls';
import { MapFlowDetail } from '../src/screens/game/city/MapFlowDetail';
import { MapFlowLayer, flowPath, type FlowAnchor, type LabelBox } from '../src/screens/game/city/MapFlowLayer';
import { mapScale } from '../src/screens/game/city/mapModel';
import type { FactoryFlow, FlowModel, FlowRoute } from '../src/screens/game/city/mapFlows';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
const initial = getState();
afterEach(() => setState(initial));
const route: FlowRoute = { points: [{ x: 20, y: 20 }, { x: 35, y: 30 }, { x: 50, y: 45 }], km: 38, cost: .03,
  segments: [{ kind: 'road', points: [{ x: 20, y: 20 }, { x: 35, y: 30 }, { x: 50, y: 45 }], km: 38, cost: .03 }] };
function model(): FlowModel {
  const own: FactoryFlow = { id: 'product-own', companyId: 'company-own', companyName: 'Alpha', productId: 'product-own',
    name: 'Yaourt Test', sectorId: 'yogurts', color: '#235f91', mine: true, point: { x: 50, y: 45 }, zoneId: 'capital',
    stock: 8, planned: 30, demand: 34, estimatedSales: 34, surplus: 4, lastSold: 18, intangible: false };
  return { selectedProductId: own.id, production: [own, { ...own, id: 'product-rival', productId: 'product-rival', companyId: 'company-rival',
    name: 'Concurrent', companyName: 'Beta', mine: false, stock: null, planned: null, demand: null, estimatedSales: null, surplus: null }],
    supply: [{ id: 'sugar', companyId: own.companyId, companyName: own.companyName, productId: own.id, name: own.name,
      color: own.color, mine: true, point: own.point, commodityId: 'sugar', need: 15, companyNeed: 27, stock: 20, missing: 7,
      stockScope: 'company', intangible: false, sources: [{ id: 'deposit', name: 'Source Test', type: 'deposit', point: route.points[0], route, capacity: 100 }] }],
    sales: [{ id: 'sales', companyId: own.companyId, companyName: own.companyName, productId: own.id, name: own.name,
      color: own.color, mine: true, point: own.point, sold: 18, national: true, intangible: false, originKnown: true }] };
}
function language(lang: Lang) { setState({ ...initial, lang, view: null, lobby: null }); }
const escape = (value: string) => renderToStaticMarkup(createElement('span', null, value)).slice(6, -7);
/** Label boxes drawn by the layer (px). */
const labelBoxes = (html: string): LabelBox[] => [...html.matchAll(/<rect class="map-flow-label-box" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)]
  .map((m) => ({ x: +m[1], y: +m[2], width: +m[3], height: +m[4] }));
const intersects = (a: LabelBox, b: LabelBox) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe.each(['fr', 'en'] as const)('calques carte (%s)', (lang) => {
  it('commence par « Aucun » et ne montre les options qu’avec un calque allumé', () => {
    language(lang);
    const text = mapFlowText(lang);
    const common = { onModeChange: () => {}, figures: true, onFiguresChange: () => {}, rivals: false, onRivalsChange: () => {} };
    const off = renderToStaticMarkup(createElement(MapFlowControls, { ...common, mode: 'off' }));
    const buttons = [...off.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/g)];
    expect(buttons.map((b) => b[2])).toEqual([text.mode.off, text.mode.production, text.mode.supply, text.mode.sales].map(escape));
    expect(buttons[0][1]).toBe('true');
    expect(off).not.toContain('type="checkbox"');
    expect(off).not.toContain('<select');
    expect(off).not.toContain('map-flow-hint');
    const on = renderToStaticMarkup(createElement(MapFlowControls, { ...common, mode: 'production' }));
    expect(on).toContain(escape(text.figures));
    expect(on).toContain(escape(text.rivals));
    expect(on).toContain(escape(text.hint.production));
    expect(on).not.toContain('<select');
    // Product selection lives in the shared toolbar, for every flow mode.
    const single = renderToStaticMarkup(createElement(MapFlowControls, { ...common, mode: 'sales' }));
    expect(single).not.toContain('<select');
    expect(text.hint).not.toHaveProperty('off');
  });

  it('nomme le port dans la langue de l’interface et ne le trace qu’une fois pour plusieurs matières', () => {
    language(lang);
    const text = mapFlowText(lang);
    const capital = getContent(lang).mapNames.cities.capital;
    const flows = model();
    const port = { id: 'capital', type: 'port' as const, point: route.points[0], route };
    flows.supply = [
      { ...flows.supply[0], id: 'sugar', commodityId: 'sugar', sources: [port] },
      { ...flows.supply[0], id: 'oil', commodityId: 'oil', sources: [{ ...port, route: { ...route, points: route.points.map((p) => ({ ...p })) } }] },
    ];
    const detail = renderToStaticMarkup(createElement(MapFlowDetail, { mode: 'supply', model: flows }));
    expect(detail).toContain(`${escape(capital)} · ${escape(text.port)}`);
    const html = renderToStaticMarkup(createElement(MapFlowLayer, { proj: mapScale(680), model: flows, mode: 'supply', figures: true }));
    // One road (a white casing and a coloured line), one arrowhead, one label naming both materials.
    expect(html.match(/class="map-flow-path"/g)).toHaveLength(2);
    expect(html.match(/marker-end=/g)).toHaveLength(1);
    expect(html.match(/map-flow-label-box/g)).toHaveLength(1);
    const names = [getContent(lang).commodities.sugar.name, getContent(lang).commodities.oil.name].join(' · ');
    expect(html).toContain(`>${escape(names)}</text>`);
    expect(html).toContain(escape(text.portShort));
    expect(html).toContain(escape(capital));
  });

  it('crypto : les ventes d’une ville s’affichent sur cette ville, sans aucune flèche', () => {
    language(lang);
    const proj = mapScale(680);
    const flows = model();
    flows.production[0].intangible = true;
    const city = { x: 860, y: 660 };
    flows.sales = [{ ...flows.sales[0], id: 'sales:east', national: false, cityId: 'east', destination: city, intangible: true, sold: 5 }];
    const html = renderToStaticMarkup(createElement(MapFlowLayer, { proj, model: flows, mode: 'sales', figures: true }));
    expect(html).not.toContain('class="map-flow-path"');
    expect(html).not.toContain('marker-end=');
    expect(html).toContain(escape(getContent(lang).mapNames.cities.east));
    const [box] = labelBoxes(html);
    // Next to the city, nowhere near the farm.
    expect(Math.hypot(box.x + box.width / 2 - proj.px(city.x), box.y + box.height / 2 - proj.py(city.y))).toBeLessThan(60);
    expect(Math.hypot(box.x + box.width / 2 - proj.px(flows.production[0].point.x), box.y - proj.py(flows.production[0].point.y))).toBeGreaterThan(200);
  });

  it('libelle stock/manque au niveau entreprise et les sources comme possibilités', () => {
    language(lang);
    const text = mapFlowText(lang);
    const flows = model(); flows.supply[0].sources[0].availableCapacity = 80;
    const html = renderToStaticMarkup(createElement(MapFlowDetail, { mode: 'supply', model: flows }));
    expect(html).toContain(text.companyStock);
    expect(html).toContain(text.companyMissing);
    expect(html).toContain(text.possibleSources);
    expect(html).toContain(text.sourceNote);
    expect(html).toContain('Source Test');
    expect(html).toContain(text.availableCapacity.toLowerCase());
  });

  it('les rivaux ne rendent aucune valeur privée dans leur détail de production', () => {
    language(lang);
    const text = mapFlowText(lang);
    const html = renderToStaticMarkup(createElement(MapFlowDetail, { mode: 'production', model: model(), productId: 'product-rival' }));
    expect(html).toContain(text.rivalPrivate);
    expect(html).not.toContain(text.planned);
    expect(html).not.toContain(text.stock);
    expect(html).not.toContain('30 lots');
  });

  it('garde les ventes nationales chiffrées dans le détail sans inventer une route ou une origine ancienne', () => {
    language(lang);
    const text = mapFlowText(lang);
    const flows = model();
    let detail = renderToStaticMarkup(createElement(MapFlowDetail, { mode: 'sales', model: flows }));
    expect(detail).toContain(text.national);
    expect(detail).toContain(text.actualSales);
    const proj = mapScale(680);
    let layer = renderToStaticMarkup(createElement(MapFlowLayer, { mode: 'sales', model: flows, proj, figures: true }));
    expect(layer).not.toContain('class="map-flow-path"');
    expect(layer).toContain(text.national);
    flows.sales[0].originKnown = false;
    detail = renderToStaticMarkup(createElement(MapFlowDetail, { mode: 'sales', model: flows }));
    layer = renderToStaticMarkup(createElement(MapFlowLayer, { mode: 'sales', model: flows, proj, figures: true }));
    expect(detail).toContain(text.salesOriginMissing);
    expect(layer).not.toContain('map-flow-label-box');
  });

  it('sans produit le détail explique comment poursuivre l’exploration', () => {
    language(lang);
    const html = renderToStaticMarkup(createElement(MapFlowDetail, { mode: 'production', model: { ...model(), selectedProductId: null } }));
    expect(html).toContain(mapFlowText(lang).noProduct);
  });

  it('conserve les lots fractionnaires du stock et des besoins au lieu de les arrondir à zéro ou à l’entier', () => {
    language(lang);
    const flows = model();
    flows.production[0].stock = .23;
    flows.supply[0].need = 10.2;
    const production = renderToStaticMarkup(createElement(MapFlowDetail, { mode: 'production', model: flows }));
    const supply = renderToStaticMarkup(createElement(MapFlowDetail, { mode: 'supply', model: flows }));
    const layer = renderToStaticMarkup(createElement(MapFlowLayer, { mode: 'production', model: flows, proj: mapScale(680), figures: true }));
    // Sans salon, useFmt suit la langue par défaut du salon (fr), même avec l'interface anglaise.
    // Accord : en français singulier sous 2 (« 0,23 lot »), en anglais singulier pour 1 seulement (« 0,23 lots »).
    if (lang === 'fr') {
      expect(production).toContain('0,23 lot');
      expect(production).not.toContain('0,23 lots');
    } else expect(production).toContain('0,23 lots');
    expect(layer).toContain(lang === 'fr' ? '0,23 lot' : '0,23 lots');
    expect(supply).toContain('10,2 lots');
    expect(production).not.toContain('>0 lots<');
    expect(supply).not.toContain('>10 lots<');
  });
});

describe('tracés SVG des flux', () => {
  it('projette les points fournis sans les lisser, avec des pointes uniquement aux destinations', () => {
    language('fr');
    const proj = mapScale(680);
    expect(flowPath(proj, route.points)).toBe(route.points.map((p, i) => `${i ? 'L' : 'M'}${proj.px(p.x).toFixed(2)} ${proj.py(p.y).toFixed(2)}`).join(' '));
    const html = renderToStaticMarkup(createElement(MapFlowLayer, { proj, model: model(), mode: 'supply', figures: true }));
    expect(html).toContain('marker-end=');
    expect(html).not.toContain('marker-start=');
    expect(html).toContain(mapFlowText('fr').sourceShort);
    // Un besoin produit est affiché dans le détail, jamais comme volume de cette source.
    expect(html).not.toContain('15 lots');
  });

  it('le commutateur chiffres enlève les étiquettes sans changer les chemins', () => {
    language('fr');
    const proj = mapScale(680);
    const visible = renderToStaticMarkup(createElement(MapFlowLayer, { proj, model: model(), mode: 'supply', figures: true }));
    const hidden = renderToStaticMarkup(createElement(MapFlowLayer, { proj, model: model(), mode: 'supply', figures: false }));
    expect(visible).toContain('map-flow-label-box');
    expect(hidden).not.toContain('map-flow-label-box');
    expect(hidden).toContain(flowPath(proj, route.points));
  });

  it('rien n’est dessiné quand les calques sont éteints', () => {
    language('fr');
    expect(renderToStaticMarkup(createElement(MapFlowLayer, { proj: mapScale(680), model: model(), mode: 'off', figures: true, onSelectProduct: () => {} }))).toBe('');
    expect(renderToStaticMarkup(createElement(MapFlowDetail, { model: model(), mode: 'off' }))).toBe('');
  });

  it('pose les anneaux sur les icônes fournies, cliquables par leur seul trait, et les labels hors des icônes', () => {
    language('fr');
    const proj = mapScale(880);
    const flows = model();
    const second: FactoryFlow = { ...flows.production[0], id: 'product-two', productId: 'product-two', name: 'Second' };
    flows.production.splice(1, 0, second);
    // Two factories of the same zone: two distinct icons side by side, a rival's icon right below them.
    const anchors = new Map<string, FlowAnchor>([
      ['product-own', { x: 400, y: 300, r: 9 }], ['product-two', { x: 415, y: 300, r: 9 }], ['product-rival', { x: 407.5, y: 315, r: 9 }],
    ]);
    const obstacles: LabelBox[] = [...anchors.values()].map(({ x, y }) => ({ x: x - 6, y: y - 6, width: 12, height: 12 }));
    const html = renderToStaticMarkup(createElement(MapFlowLayer, { proj, model: flows, mode: 'production', figures: true, rivals: true,
      anchors, obstacles, onSelectProduct: () => {} }));
    const rings = [...html.matchAll(/<circle class="map-flow-ring" cx="([^"]+)" cy="([^"]+)"/g)].map((m) => [+m[1], +m[2]]);
    expect(rings).toEqual([[400, 300], [415, 300], [407.5, 315]]);
    expect(html.match(/role="button"/g)).toHaveLength(2);
    expect(html).toContain('aria-pressed="true"');
    expect(html.match(/pointer-events="stroke"/g)).toHaveLength(2);
    const boxes = labelBoxes(html);
    expect(boxes).toHaveLength(1);
    for (const icon of obstacles) expect(intersects(boxes[0], icon)).toBe(false);
  });

  it('les anneaux rivaux restent publics et laissent le clic à la cellule native', () => {
    language('fr');
    const html = renderToStaticMarkup(createElement(MapFlowLayer, { proj: mapScale(680), model: model(), mode: 'production', figures: true,
      rivals: true, onSelectProduct: () => {} }));
    expect(html).toContain('Concurrent');
    expect(html.match(/role="button"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-label="Concurrent');
  });

  it('un ferry reste indicatif et n’ajoute une pointe qu’à la destination finale', () => {
    language('fr');
    const flows = model();
    const ferry = { kind: 'ferry' as const, points: route.points.slice(0, 2), km: 12, cost: .1, indicative: true };
    const road = { kind: 'road' as const, points: route.points.slice(1), km: 26, cost: .03 };
    flows.supply[0].sources[0].route = { ...route, segments: [ferry, road] };
    const html = renderToStaticMarkup(createElement(MapFlowLayer, { proj: mapScale(680), model: flows, mode: 'supply', figures: false }));
    expect(html).toContain('data-flow-segment="ferry"');
    expect(html).toContain(mapFlowText('fr').ferryNote);
    expect(html.match(/marker-end=/g)).toHaveLength(1);
    expect(html).not.toContain('marker-start=');
  });
});
