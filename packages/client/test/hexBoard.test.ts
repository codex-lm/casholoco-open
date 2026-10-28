import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILDABLE, CITIES, DEPOSITS, HEXES, HEX_R, applyAction, basin, createGame, getContent, getPlayerView, heatCredit, hexById, hexPlaceLabel, hexPlaceName, neighbors, resolveTurn, ring, SECTOR_IDS, type Lang, type PlayerView, type SectorId } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { CityTab } from '../src/screens/game/city/CityTab';
import { HEX_MIN_DRAW_WIDTH, HexBoard } from '../src/screens/game/city/HexBoard';
import { hexLegendSteps } from '../src/screens/game/city/hexLegend';
import { hexReadabilityMessages } from '../src/i18n/hexReadability';
import { HexCellSheet } from '../src/screens/game/city/HexCellSheet';
import { MAP_ACTIVITY_MIME, MapActivityPalette } from '../src/screens/game/city/MapActivityPalette';
import { MapScenarioSheet } from '../src/screens/game/city/MapScenarioSheet';
import { productFreight } from '../src/screens/game/city/freight';
import { MAP_VIEW } from '../src/screens/game/city/BaseMap';
import { HEX_NEUTRAL, HEX_PALETTES, hexArrowTarget, hexEstimate, hexLensColor, hexMarginQuintiles, hexMarginValue, hexPolygon, hexRanks, type HexReference } from '../src/screens/game/city/hexModel';
import { mapScale } from '../src/screens/game/city/mapModel';
import { zoneLabel } from '../src/screens/game/city/MapSheets';
import { getState, setState, type AppState } from '../src/store';
import { HexLaunchForm } from '../src/screens/game/LaunchForms';
import { hexCellBid, hexLaunchCost } from '../src/screens/game/hexPayback';
import { decisionText } from '../src/i18n/decisionReadability';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()],
    useRef: (initial: unknown) => ({ current: initial }),
    useMemo: (factory: () => unknown) => factory(),
    useId: () => ':hx:',
  };
});
vi.mock('../src/hooks/useElementWidth', () => ({ useElementWidth: () => [vi.fn(), 680] }));
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
const initial = getState();
afterEach(() => setState(initial));
const escaped = (value: string) => renderToStaticMarkup(createElement(Fragment, null, value));
const count = (html: string, marker: string) => html.split(marker).length - 1;
const legendLabels = (html: string) => [...html.matchAll(/<span class="hx-legend-step"><i[^>]*><\/i><span>(.*?)<\/span><\/span>/g)].map((match) => match[1]);
function fixture(lang: Lang, hex = true) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, ...(hex ? { mapMode: 'hex' as const, terrainAssignment: 'fair' as const } : {}) }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Rival', sectorId: 'yogurts', connected: true, color: '#abcdef' },
  ]);
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  return { game, company, view: getPlayerView(game, 'human') };
}
function setup(view: PlayerView, lang: Lang) { setState({ lang, view, lobby: null }); }
function render(view: PlayerView, lang: Lang, children: ReactNode) {
  setup(view, lang);
  return renderToStaticMarkup(createElement(GameProvider, { view, children }));
}
function board(view: PlayerView, lang: Lang, reference?: HexReference, selectedId = view.hexes!.free[0]) {
  return render(view, lang, createElement(HexBoard, { view, selectedId, onSelect: () => {}, reference, ranks: true }));
}
function cellGroup(html: string, id: string) {
  return html.match(new RegExp('<g[^>]*role="button"[^>]*>[\\s\\S]*?<polygon data-hex-id="' + id + '"[^>]*>'))?.[0].split(/(?=<g[^>]*role="button")/).at(-1) ?? '';
}
function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children as ReactNode, predicate)];
}

describe.each(['fr', 'en'] as const)('desktop real hex board and cell sheets (%s)', (lang) => {
  it('keeps company territories distinct from controller colours and destination lenses, with visible city symbols', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const product = company.products[0];
    const rival = view.companies.find((c) => !c.private && c.products.length)!;
    company.color = '#c13528';
    rival.color = '#28673c';
    const deposit = HEXES.find((hex) => hex.deposit)!;
    view.siteSlots.find((slot) => slot.id === deposit.deposit)!.companyId = rival.id;
    for (const lens of ['margin', 'transport', 'demand', 'plain'] as const) {
      const html = render(view, lang, createElement(HexBoard, { view, selectedId: view.hexes!.free[0], onSelect: () => {}, reference: { kind: 'product', productId: product.id }, delivery: true, lens }));
      for (const [id, owner] of [[product.hexId!, company], [rival.products[0].hexId!, rival], [deposit.id, rival]] as const) {
        const parcel = cellGroup(html, id);
        expect(parcel).toContain(`data-owner-company="${owner.id}"`);
        expect(parcel).toContain(`fill="${owner.color}"`);
        expect(parcel).toContain('fill-opacity="0.48"');
        expect(parcel).not.toContain('mix-blend-mode');
        expect(parcel).toContain(escaped(owner.name));
      }
      expect(count(html, 'class="hx-city-mark"')).toBe(5);
      expect(html).not.toContain('hx-urban');
      expect(html).toContain(escaped(hexReadabilityMessages(lang).territoryHint));
    }
  });

  it('puts the clicked own factory whole-market forecast before a separate delivery scenario, without rival forecasts', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const product = company.products[0];
    const reference = { kind: 'launch' as const, sectorId: 'energy_drinks' as const, originHexId: view.hexes!.free[0] };
    const text = hexReadabilityMessages(lang);
    const fmt = fmtFor(lang);
    const html = render(view, lang, createElement(MapScenarioSheet, { view, reference, supplyReference: null, delivery: true, selectedId: product.hexId!, children: createElement(HexCellSheet, { view, reference, hexId: product.hexId! }) }));
    expect(html.indexOf('data-hx-factory-summary')).toBeLessThan(html.indexOf('class="hx-target-scenario"'));
    expect(html).toContain(`<dt>${escaped(text.factoryDemand)}</dt><dd>${escaped(fmt.lots(product.private!.estimate!.demand, 3))}</dd>`);
    expect(html).toContain(`<dt>${escaped(text.factoryFreight)}</dt><dd>${escaped(fmt.lotPrice(productFreight(view, company, product, product.hexId!).total))}</dd>`);
    expect(html).toContain(`<dt>${escaped(text.factoryMargin)}</dt><dd>${escaped(fmt.signedMoney(product.private!.estimate!.margin))}</dd>`);
    expect(html).toContain(escaped(text.factoryBasis));
    expect(html).toContain(escaped(company.name));
    const rival = view.companies.find((c) => !c.private && c.products.length)!;
    const hidden = render(view, lang, createElement(HexCellSheet, { view, hexId: rival.products[0].hexId! }));
    expect(hidden).not.toContain('data-hx-factory-summary');
  });

  it('keeps the reference factory marked when a different destination is inspected, including when both are the same cell', () => {
    const { view } = fixture(lang);
    const product = view.companies.find((c) => c.private)!.products[0];
    const reference = { kind: 'product' as const, productId: product.id };
    const destination = view.hexes!.free[0];
    const html = board(view, lang, reference, destination);
    expect(cellGroup(html, product.hexId!)).toContain('data-map-reference="true"');
    expect(cellGroup(html, product.hexId!)).not.toContain('data-map-selection="true"');
    expect(cellGroup(html, destination)).toContain('data-map-selection="true"');
    expect(cellGroup(html, destination)).not.toContain('data-map-reference="true"');
    expect(html).not.toContain('hx-reference-badge');
    expect(html).not.toMatch(/>Réf\.|>Ref\./);
    expect(html).toContain(`data-hx-reference-outline="${product.hexId}"`);
    expect(html).toMatch(/class="hx-selection-ring"[^>]*stroke-dasharray="7 4"/);
    const same = board(view, lang, reference, product.hexId!);
    expect(cellGroup(same, product.hexId!)).toContain('data-map-reference="true"');
    expect(cellGroup(same, product.hexId!)).toContain('data-map-selection="true"');
    expect(same).toContain('hx-reference-outline');
    expect(same).toContain('hx-selection-outline');
    // The company's identity colour applies to owned parcels, including supply subsidiaries.
    const companyColor = view.companies.find((c) => c.private)!.color;
    expect(cellGroup(html, product.hexId!)).toContain(`stroke="${companyColor}"`);
    const deposit = HEXES.find((hex) => hex.deposit)!;
    view.siteSlots.find((slot) => slot.id === deposit.deposit)!.companyId = view.companies.find((c) => c.private)!.id;
    expect(cellGroup(board(view, lang, reference, destination), deposit.id)).toContain(`stroke="${companyColor}"`);
  });

  it('names the active activity and real flow product in the palette, while an unplaced launch has no origin', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const product = company.products[0];
    const text = hexReadabilityMessages(lang);
    const props = { view, supplyReference: null, pending: null, flowProductId: product.id, onShowReference: vi.fn(), onResetOrigin: vi.fn(), onPrepare: vi.fn(), onCancel: vi.fn(), onRecipient: vi.fn(), onPlace: vi.fn() };
    const html = render(view, lang, createElement(MapActivityPalette, { ...props, reference: { kind: 'product', productId: product.id } }));
    expect(html).toContain(escaped(product.name));
    expect(html).toContain(escaped(text.paletteTitle));
    expect(html).not.toContain('<select');
    const launch = { kind: 'launch' as const, sectorId: 'gadgets' as const };
    const launching = render(view, lang, createElement(MapActivityPalette, { ...props, reference: launch }));
    expect(launching).not.toContain(escaped(text.paletteShowOrigin));
    // Comparison may retain the tracked product's flows while colouring for a new factory.
    expect(launching).toContain(escaped(text.paletteRealFlows(product.name)));
    expect(board(view, lang, launch)).not.toContain('data-map-reference="true"');
    const rival = view.companies.find((c) => !c.private && c.products.length)!.products[0];
    expect(board(view, lang, { kind: 'product', productId: rival.id })).not.toContain('data-map-reference="true"');
  });

  it('renders the 159 engine cells with every buildable cell focusable and its exact reserve in the accessible label', () => {
    const { view } = fixture(lang);
    const product = view.companies.find((c) => c.private)!.products[0];
    const html = board(view, lang, { kind: 'product', productId: product.id });
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    expect(count(html, 'data-hex-id=')).toBe(159);
    expect(count(html, 'data-buildable="true"')).toBe(149);
    for (const id of BUILDABLE) {
      const cell = cellGroup(html, id);
      expect(cell, id).toContain('tabindex="0"');
      expect(cell, id).toContain(escaped(h.reserveAria(fmt.money(view.hexes!.reserve[id]))));
    }
    for (const [id, rank] of hexRanks(view, { kind: 'product', productId: product.id })) expect(cellGroup(html, id)).toContain(escaped(h.rankAria(rank)));
    for (const terrain of view.terrains!) expect(html).toContain(escaped(h.terrainAria(terrain.name)));
    expect(html).toContain('hx-cell-mine');
    for (const company of view.companies.filter((company) => Object.values(view.hexes!.occupied).includes(company.id))) {
      expect(html).toContain(`fill="${company.color}"`);
    }
    expect(html).toContain('hx-coordinates');
    expect(html).toContain('hx-cell-selected');
    for (const color of HEX_PALETTES.margin) expect(html).toContain(color);
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    if (lang === 'en') expect(html).not.toMatch(/[àâçéèêëîïôûùœ«»€]/i);
  });

  it('colours absolute launch margins by free-cell quintiles and labels the same five value bands', () => {
    const { view } = fixture(lang);
    const sector = view.sectors.find((s) => s.id === 'gadgets')!;
    const originalFree = view.hexes!.free;
    const ids = originalFree.filter((id) => !hexById(id)!.city).slice(0, 12);
    view.hexes!.free = ids;
    ids.slice(0, 10).forEach((id, i) => { sector.launchByHex![id].quarterlyProfit = i === 9 ? 10_000 : 1000 + i * 100; });
    sector.launchByHex![ids[10]].quarterlyProfit = Infinity;
    delete sector.launchByHex![ids[11]];
    sector.launchByHex![originalFree.find((id) => !ids.includes(id))!].quarterlyProfit = -1_000_000;
    const reference = { kind: 'launch' as const, sectorId: sector.id };
    const quintiles = hexMarginQuintiles(view, reference)!;
    expect(quintiles).toEqual([1000, 1180, 1360, 1540, 1720, 10_000]);
    // Launch references stay absolute even if a caller leaves delta enabled.
    const html = render(view, lang, createElement(HexBoard, { view, selectedId: ids[0], onSelect: () => {}, reference, delta: true, ranks: true }));
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const bands = Array.from({ length: 5 }, () => 0);
    ids.slice(0, 10).forEach((id, i) => {
      const value = sector.launchByHex![id].quarterlyProfit;
      const fill = hexLensColor(value, 'margin', quintiles);
      bands[HEX_PALETTES.margin.indexOf(fill as typeof HEX_PALETTES.margin[number])] += 1;
      expect(cellGroup(html, id)).toContain(`fill="${HEX_PALETTES.margin[Math.floor(i / 2)]}"`);
      expect(cellGroup(html, id)).toContain(escaped(h.marginAria(fmt.signedMoney(value))));
      expect(cellGroup(html, id)).not.toContain(escaped(h.deltaAria(fmt.signedMoney(value))));
    });
    expect(bands).toEqual([2, 2, 2, 2, 2]);
    const legend = html.match(/<div class="hx-legend-scale">[\s\S]*?<\/div>/)![0];
    quintiles.slice(0, 5).forEach((low, i) => expect(legend).toContain(escaped(h.legendBetween(fmt.signedMoney(low), fmt.signedMoney(quintiles[i + 1])))));
    expect(html).toContain(escaped(h.legendMargin));
    expect(html).not.toContain(escaped(h.legendDelta));
    expect(html).not.toContain(escaped(h.legendSame));
    for (const id of ids.slice(10)) expect(cellGroup(html, id)).toContain(`fill="${HEX_NEUTRAL}"`);
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('colours product deltas by free-cell quintiles, flags better cells and notes when nothing beats the current position', () => {
    const { view } = fixture(lang);
    const product = view.companies.find((c) => c.private)!.products[0];
    const reference = { kind: 'product' as const, productId: product.id };
    const own = product.private!;
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const deltaGains = () => view.hexes!.free
      .filter((id) => !hexById(id)!.city)
      .map((id) => ({ id, gain: hexMarginValue(view, reference, id, true) }))
      .filter((entry): entry is { id: string; gain: number } => entry.gain !== null && Number.isFinite(entry.gain));
    const stepOf = (value: number, quintiles: number[]) => Math.min(4, quintiles.slice(1, 5).filter((boundary) => value >= boundary).length);
    const deltaBoard = () => render(view, lang, createElement(HexBoard, { view, selectedId: view.hexes!.free[0], onSelect: () => {}, reference, lens: 'margin' as const, delta: true }));
    own.estimate!.margin = 1e9;
    const losses = deltaGains();
    expect(losses.length).toBeGreaterThan(0);
    for (const { gain } of losses) expect(gain).toBeLessThan(0);
    const best = losses.reduce((a, b) => (b.gain > a.gain ? b : a));
    const worst = losses.reduce((a, b) => (b.gain < a.gain ? b : a));
    const lossQuintiles = hexMarginQuintiles(view, reference, true)!;
    expect(stepOf(best.gain, lossQuintiles)).toBe(4);
    expect(stepOf(worst.gain, lossQuintiles)).toBe(0);
    const html = deltaBoard();
    expect(cellGroup(html, best.id)).toContain(`fill="${HEX_PALETTES.margin[4]}"`);
    expect(cellGroup(html, worst.id)).toContain(`fill="${HEX_PALETTES.margin[0]}"`);
    expect(count(html, 'hx-better')).toBe(0);
    expect(html).toContain('hx-lens-note');
    expect(html).toContain(escaped(h.lensNoBetter));
    const lossLegend = html.match(/<div class="hx-legend-scale">[\s\S]*?<\/div>/)![0];
    expect(legendLabels(lossLegend)).toHaveLength(5);
    expect(new Set(legendLabels(lossLegend)).size).toBe(5);
    expect(legendLabels(lossLegend).every((label) => label.startsWith('-'))).toBe(true);
    for (const color of HEX_PALETTES.margin) expect(lossLegend).toContain(color);
    own.estimate!.margin = -1e9;
    const wins = deltaGains();
    for (const { gain } of wins) expect(gain).toBeGreaterThan(0);
    const quintiles = hexMarginQuintiles(view, reference, true)!;
    const improved = deltaBoard();
    expect(count(improved, 'hx-better')).toBeGreaterThan(0);
    expect(improved).not.toContain('hx-lens-note');
    expect(improved).not.toContain(escaped(h.lensNoBetter));
    const legend = improved.match(/<div class="hx-legend-scale">[\s\S]*?<\/div>/)![0];
    expect(legendLabels(legend)).toHaveLength(5);
    expect(new Set(legendLabels(legend)).size).toBe(5);
    expect(legendLabels(legend).every((label) => label.startsWith('+'))).toBe(true);
    for (const color of HEX_PALETTES.margin) expect(legend).toContain(color);
  });

  it.each(['margin', 'transport', 'demand'] as const)('renders distinct adaptive legend steps for close %s values', (lens) => {
    const { view } = fixture(lang);
    const sector = view.sectors.find((entry) => entry.id === 'gadgets')!;
    const ids = view.hexes!.free.filter((id) => sector.launchByHex?.[id]).slice(0, 6);
    view.hexes!.free = ids;
    ids.forEach((id, index) => {
      sector.launchByHex![id].quarterlyProfit = 1000.001 + index * .002;
      sector.launchByHex![id].demand = 6 + index * .02;
    });
    view.transportFactor = 1e-7;
    const html = render(view, lang, createElement(HexBoard, { view, selectedId: ids[0], onSelect: () => {}, reference: { kind: 'launch', sectorId: sector.id }, lens }));
    const labels = legendLabels(html);
    expect(labels).toHaveLength(5);
    expect(new Set(labels).size).toBe(5);
    if (lens === 'demand') {
      expect(labels[0]).toBe('6' + (lang === 'fr' ? ',00' : '.00') + ' lots');
      expect(labels.at(-1)).toBe('6' + (lang === 'fr' ? ',10' : '.10') + ' lots');
    } else expect(labels.every((label) => label.includes(lang === 'fr' ? '€' : '$'))).toBe(true);
    expect(labels.some((label) => /[,.]\d/.test(label))).toBe(true);
  });

  it('keeps selection, ownership, rank medallions and backed pending envelopes distinct and matches their legend', () => {
    const { game, company, view: before } = fixture(lang);
    const product = company.products[0];
    const ref = { kind: 'product' as const, productId: product.id };
    const target = [...hexRanks(before, ref).keys()][0];
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId: product.id, hexId: target, bid: before.hexes!.reserve[target] }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const deposit = HEXES.find((hex) => hex.deposit)!;
    view.siteSlots.find((slot) => slot.id === deposit.deposit)!.companyId = company.id;
    setup(view, lang);
    const node = HexBoard({ view, selectedId: target, onSelect: () => {}, reference: ref, ranks: true });
    const own = elements(node, (element) => element.props.role === 'button' && elements(element.props.children as ReactNode, (child) => child.props['data-hex-id'] === product.hexId).length > 0)[0];
    const selected = elements(node, (element) => element.props.role === 'button' && elements(element.props.children as ReactNode, (child) => child.props['data-hex-id'] === target).length > 0)[0];
    expect(own.props.className).toContain('hx-cell-mine');
    expect(elements(own, (element) => element.props.className === 'hx-own-badge')).toHaveLength(1);
    expect(selected.props.className).toContain('hx-cell-selected');
    expect(selected.props.className).toContain('hx-cell-pending');
    expect(selected.props.className).toContain('hx-cell-ranked');
    const selection = elements(node, (element) => element.props.className === 'hx-selection-ring')[0];
    expect(selection.props.stroke).toBe('#8b2f4a');
    expect(selection.props.strokeWidth).toBe('4');
    const rank = elements(selected, (element) => element.props.className === 'hx-rank-badge')[0];
    expect(elements(rank, (element) => element.type === 'circle')[0].props.fill).toBe('#e4bb5d');
    const envelope = elements(selected, (element) => element.props.className === 'hx-pending-badge')[0];
    expect(elements(envelope, (element) => element.type === 'rect')[0].props.stroke).toBe('#a66012');
    const html = board(view, lang, ref, target);
    expect(cellGroup(html, deposit.id)).toContain('hx-cell-mine');
    expect(cellGroup(html, deposit.id)).toContain(escaped(hexReadabilityMessages(lang).ownDepositAria));
    expect(html).toContain('class="hx-selected-mark"');
    expect(html).toContain(escaped(hexReadabilityMessages(lang).selected));
    expect(html).toContain(escaped(hexReadabilityMessages(lang).mine));
    expect(html).toContain('class="hx-pending-mark"');
    expect(html).toContain('class="hx-rank-mark"');
  });

  it('marks only unresolved subsidiary bids from still-controlled companies', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((entry) => entry.private)!;
    const deposit = HEXES.find((hex) => hex.deposit)!;
    const slot = view.siteSlots.find((entry) => entry.id === deposit.deposit)!;
    const bid = { companyId: company.id, playerId: view.you!, commodityId: slot.commodityId, slotId: slot.id, amount: 100, turn: view.turn };
    view.self!.siteBids = [bid];
    expect(cellGroup(board(view, lang), deposit.id)).toContain('hx-cell-pending');
    view.self!.siteBids = [{ ...bid, result: { outcome: 'won', price: 100, bidders: 1 } }];
    expect(cellGroup(board(view, lang), deposit.id)).not.toContain('hx-cell-pending');
    view.self!.siteBids = [{ ...bid, companyId: view.companies.find((entry) => !entry.private)!.id }];
    expect(cellGroup(board(view, lang), deposit.id)).not.toContain('hx-cell-pending');
  });

  it('outlines only the cells whose delta gain is positive when wins and losses are mixed', () => {
    const { view } = fixture(lang);
    const product = view.companies.find((c) => c.private)!.products[0];
    const reference = { kind: 'product' as const, productId: product.id };
    const own = product.private!;
    const margins = view.hexes!.free
      .filter((id) => !hexById(id)!.city)
      .map((id) => hexEstimate(view, reference, id)?.margin)
      .filter((margin): margin is number => margin !== null && margin !== undefined && Number.isFinite(margin))
      .sort((a, b) => a - b);
    expect(margins.length).toBeGreaterThan(10);
    own.estimate!.margin = (margins[Math.floor(margins.length / 3)] + margins[Math.floor(margins.length * 2 / 3)]) / 2;
    const gains = view.hexes!.free
      .map((id) => ({ id, gain: hexMarginValue(view, reference, id, true) }))
      .filter((entry): entry is { id: string; gain: number } => entry.gain !== null && Number.isFinite(entry.gain));
    const better = gains.filter(({ gain }) => gain > 0);
    const notBetter = gains.filter(({ gain }) => gain <= 0);
    expect(better.length).toBeGreaterThan(0);
    expect(notBetter.length).toBeGreaterThan(0);
    const html = render(view, lang, createElement(HexBoard, { view, selectedId: view.hexes!.free[0], onSelect: () => {}, reference, lens: 'margin' as const, delta: true }));
    const outlined = (id: string) => {
      const rest = html.slice(html.indexOf(`data-hex-id="${id}"`));
      const next = rest.indexOf('data-hex-id=', 1);
      return rest.slice(0, next === -1 ? undefined : next).includes('hx-better');
    };
    expect(count(html, 'hx-better')).toBe(better.length);
    for (const { id } of better) expect(outlined(id), id).toBe(true);
    for (const { id } of notBetter) expect(outlined(id), id).toBe(false);
  });

  it('keeps a ranked free-city badge inside its cell between the raised city name and the cell id', () => {
    const { view } = fixture(lang);
    const city = HEXES.find((hex) => hex.city)!;
    const sector = view.sectors.find((s) => s.id === 'gadgets')!;
    sector.launchByHex![city.id] = { ...sector.launchByHex![view.hexes!.free[0]], quarterlyProfit: 10_000 };
    delete view.hexes!.occupied[city.id];
    view.hexes!.free = [city.id];
    setup(view, lang);
    const node = HexBoard({ view, selectedId: city.id, onSelect: () => {}, reference: { kind: 'launch', sectorId: sector.id }, ranks: true });
    const group = elements(node, (element) => element.props.role === 'button' && elements(element.props.children as ReactNode, (child) => child.props['data-hex-id'] === city.id).length > 0)[0];
    const cityLabels = elements(group.props.children as ReactNode, (element) => element.props.className === 'hx-city-name');
    const badge = elements(group.props.children as ReactNode, (element) => element.props.className === 'hx-rank-badge')[0];
    const circle = elements(badge.props.children as ReactNode, (element) => element.type === 'circle')[0];
    const idLabel = elements(group.props.children as ReactNode, (element) => element.type === 'text' && element.props.children === city.id)[0];
    const projection = mapScale(680, MAP_VIEW);
    const centerY = projection.py(city.y), radius = HEX_R * projection.scale;
    expect(cityLabels.length).toBeGreaterThan(0);
    expect((circle.props.cx as number) - (circle.props.r as number)).toBeGreaterThan(projection.px(city.x) + 8);
    expect((circle.props.cx as number) + (circle.props.r as number)).toBeLessThan(projection.px(city.x) + Math.sqrt(3) * radius / 2);
    expect((circle.props.cy as number) - (circle.props.r as number)).toBeGreaterThan(Math.max(...cityLabels.map((label) => (label.props.y as number) + 2)));
    expect((circle.props.cy as number) + (circle.props.r as number)).toBeLessThan((idLabel.props.y as number) - 8);
    expect((circle.props.cy as number) + (circle.props.r as number)).toBeLessThan(centerY + radius);
  });

  it('shows product unit cost and demand exactly from the controller view, plus basin, ring and reserve', () => {
    const { view } = fixture(lang);
    const product = view.companies.find((c) => c.private)!.products[0];
    const id = view.hexes!.free.find((id) => product.private!.hexes!.unitCost[id] !== undefined)!;
    const reference = { kind: 'product' as const, productId: product.id };
    const estimate = hexEstimate(view, reference, id)!;
    expect(estimate.unitCost).toBe(product.private!.hexes!.unitCost[id]);
    expect(estimate.demand).toBe(product.private!.hexes!.demand![id]);
    const html = render(view, lang, createElement(HexCellSheet, { view, hexId: id, reference, onMove: () => {}, onLaunch: () => {} }));
    const fmt = fmtFor(lang);
    const h = messages(lang).hex;
    expect(html).toContain(`data-hex-sheet="${id}"`);
    // Reserve and demand among the visible figures; the cost per lot waits in « Pourquoi ce chiffre ? ».
    const visible = html.slice(0, html.indexOf('<details'));
    expect(visible).toContain(escaped(fmt.money(view.hexes!.reserve[id])));
    expect(visible).toContain(escaped(fmt.lots(product.private!.hexes!.demand![id])));
    expect(visible).not.toContain(escaped(fmt.lotPrice(product.private!.hexes!.unitCost[id])));
    expect(html).toContain(`<summary>${escaped(h.whyTitle)}</summary>`);
    expect(html).toContain(escaped(fmt.lotPrice(product.private!.hexes!.unitCost[id])));
    const basinName = zoneLabel(getContent(lang).mapNames, basin(id));
    if (!hexById(id)!.city) expect(html).toContain(escaped(h.basinRing(basinName, ring(id))));
    expect(html).toContain(escaped(h.moveHere(product.name)));
    expect(html).toContain(escaped(h.launchHere));
    expect(html).toContain('hx-headline');
    // « Pourquoi ce chiffre ? », closed, compares the margin here with the current plant's.
    const why = html.slice(html.indexOf(`<details class="hx-sheet-fold"><summary>${escaped(h.whyTitle)}</summary>`));
    expect(why.length).toBeLessThan(html.length);
    expect(why).toContain(`<dt>${escaped(h.marginLabel)}</dt><dd>${escaped(fmt.signedMoney(estimate.margin!))}</dd>`);
    const currentMargin = hexEstimate(view, reference, product.hexId!)?.margin ?? null;
    expect(currentMargin).not.toBeNull();
    expect(why).toContain(`<dt>${escaped(h.marginNowLabel)}</dt><dd>${escaped(fmt.signedMoney(currentMargin!))}</dd>`);
    // Nothing left to bid on after the last quarter: the figures stay, the payback headline and the actions go.
    const ended = { ...view, turn: view.config.totalTurns };
    const after = render(ended, lang, createElement(HexCellSheet, { view: ended, hexId: id, reference, onMove: () => {}, onLaunch: () => {} }));
    expect(after).not.toContain('hx-headline');
    expect(after).not.toContain(escaped(h.launchHere));
    expect(after).toContain(escaped(fmt.money(view.hexes!.reserve[id])));
    delete product.private!.hexes!.unitCost[id];
    expect(hexEstimate(view, reference, id)).toBeNull();
    expect(render(view, lang, createElement(HexCellSheet, { view, hexId: id, reference }))).not.toContain('hx-headline');
  });

  it('uses launchByHex profit, cost and demand without replacing missing candidate estimates', () => {
    const { view } = fixture(lang);
    const sector = view.sectors.find((s) => s.id === 'crypto')!;
    const id = view.hexes!.free.find((id) => sector.launchByHex?.[id] && heatCredit('crypto', id) > 0)!;
    expect(id).toBeDefined();
    const reference = { kind: 'launch' as const, sectorId: sector.id };
    const source = sector.launchByHex![id];
    const estimate = hexEstimate(view, reference, id)!;
    expect(estimate).toMatchObject({ unitCost: source.unitCost, demand: source.demand, margin: source.quarterlyProfit, paybackQuarters: source.paybackQuarters });
    const html = render(view, lang, createElement(HexCellSheet, { view, hexId: id, reference }));
    const fmt = fmtFor(lang);
    expect(html).toContain(escaped(fmt.signedMoney(source.quarterlyProfit)));
    expect(html).toContain(escaped(fmt.lotPrice(source.unitCost)));
    expect(html).toContain(escaped(fmt.lots(source.demand)));
    expect(html).toContain(escaped(fmt.lotPrice(heatCredit('crypto', id))));
    delete sector.launchByHex![id];
    expect(hexEstimate(view, reference, id)).toBeNull();
    const missing = render(view, lang, createElement(HexCellSheet, { view, hexId: id, reference }));
    expect(missing).not.toContain('hx-headline');
    expect(missing).not.toContain(escaped(messages(lang).hex.whyTitle));
    const cell = cellGroup(board(view, lang, reference, id), id);
    expect(cell).toContain(`fill="${HEX_NEUTRAL}"`);
    expect(cell).not.toContain(escaped(messages(lang).hex.marginAria(fmt.signedMoney(source.quarterlyProfit))));
  });

  it('shows what my plant does, a rival plant in one public line, and a pending move bid, without any reserve price', () => {
    const { game, company } = fixture(lang);
    const before = getPlayerView(game, 'human');
    const target = before.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId: company.products[0].id, hexId: target, bid: before.hexes!.reserve[target] }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const own = view.companies.find((c) => c.id === company.id)!;
    const ownProduct = own.products[0];
    const html = render(view, lang, createElement(HexCellSheet, { view, hexId: ownProduct.hexId!, onOpenCompany: () => {} }));
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const content = getContent(lang);
    expect(html).toContain(escaped(h.ownFactoryLine(ownProduct.name, content.sectors[ownProduct.sectorId].name)));
    expect(html).toContain(escaped(h.openProduct));
    expect(html).toContain(escaped(h.pendingMove(hexPlaceName(target, lang, view.siteSlots), fmt.money(before.hexes!.reserve[target]))));
    expect(html).not.toContain(escaped(h.reserveLabel));
    const rival = view.companies.find((c) => c.controllerId === 'rival')!;
    const occupied = render(view, lang, createElement(HexCellSheet, { view, hexId: rival.products[0].hexId!, onOpenCompany: () => {} }));
    expect(occupied).toContain(escaped(h.factoryProductLine(rival.name, rival.ceoName, rival.products[0].name, content.sectors[rival.products[0].sectorId].name)));
    expect(occupied).toContain(escaped(h.openCompany));
    expect(occupied).toContain(escaped(h.oneFactory));
    expect(occupied).not.toContain(escaped(h.reserveLabel));
    expect(occupied).not.toContain('hx-headline');
    expect(occupied).not.toContain('hx-sheet-numbers"><dt');
    expect(occupied).not.toContain(escaped(h.productionLabel));
  });

  it('heads a free cell with the new plant of the tracked sector, its payback the same as the launch form’s', () => {
    const { view, company } = fixture(lang);
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const content = getContent(lang);
    const own = view.companies.find((c) => c.id === company.id)!;
    let pick: { sectorId: SectorId; id: string } | null = null;
    for (const sectorId of SECTOR_IDS) {
      const id = view.hexes!.free.find((cell) => hexCellBid(view, cell, { kind: 'launch', sectorId }, 'launch', hexLaunchCost(view, sectorId)).verdict.state === 'ok');
      if (id) { pick = { sectorId, id }; break; }
    }
    expect(pick).not.toBeNull();
    const { sectorId, id } = pick!;
    const reference = { kind: 'launch' as const, sectorId };
    const bid = hexCellBid(view, id, reference, 'launch', hexLaunchCost(view, sectorId));
    const html = render(view, lang, createElement(HexCellSheet, { view, hexId: id, reference, onMove: () => {}, onLaunch: () => {} }));
    const headline = html.split('<p class="hx-headline hx-headline-ok" data-hx-headline="launch">')[1].split('</p>')[0];
    expect(headline).toContain(escaped(h.headLaunch(content.sectors[sectorId].name, fmt.signedMoney(bid.gain!))));
    expect(headline).toContain(escaped(h.paybackLaunch(bid.verdict.atReserve!, fmt.money(bid.reserve))));
    // A new plant is tracked: launching comes first, before moving one of mine.
    expect(html.indexOf('data-hx-launch-here')).toBeLessThan(html.indexOf('data-hx-move-here'));
    // The launch form opened on that cell prices the same payback at the reserve.
    const form = render(view, lang, createElement(HexLaunchForm, { company: own, hexId: id, initialSector: sectorId, inSheet: true }));
    expect(form).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackQuarters(bid.verdict.atReserve!))}</dd>`);
    // A plant that would lose money: the headline says there is nothing to gain, in red.
    view.sectors.find((s) => s.id === sectorId)!.launchByHex![id].quarterlyProfit = -12;
    const losing = render(view, lang, createElement(HexCellSheet, { view, hexId: id, reference }));
    const none = losing.split('<p class="hx-headline hx-headline-none" data-hx-headline="launch">')[1].split('</p>')[0];
    expect(none).toContain(escaped(h.headLaunch(content.sectors[sectorId].name, fmt.signedMoney(-12))));
    expect(none).toContain(`<span class="hx-headline-payback">${escaped(h.paybackNone)}</span>`);
  });

  it('heads a free cell with a start-up’s payback for a player who runs no company, the land alone', () => {
    const { view } = fixture(lang);
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const content = getContent(lang);
    // The player controls no company any more: the sheet prices a start-up (no launch fees, it sells at once).
    const orphan = { ...view, companies: view.companies.map((c) => c.private ? { ...c, private: undefined, controllerId: 'someone-else' } : c) };
    let pick: { sectorId: SectorId; id: string } | null = null;
    for (const sectorId of SECTOR_IDS) {
      const id = orphan.hexes!.free.find((cell) => hexCellBid(orphan, cell, { kind: 'launch', sectorId }, 'startup', 0).verdict.state === 'ok');
      if (id) { pick = { sectorId, id }; break; }
    }
    expect(pick).not.toBeNull();
    const { sectorId, id } = pick!;
    const reference = { kind: 'launch' as const, sectorId };
    const bid = hexCellBid(orphan, id, reference, 'startup', 0);
    const html = render(orphan, lang, createElement(HexCellSheet, { view: orphan, hexId: id, reference }));
    const headline = html.split('<p class="hx-headline hx-headline-ok" data-hx-headline="startup">')[1].split('</p>')[0];
    expect(headline).toContain(escaped(h.headLaunch(content.sectors[sectorId].name, fmt.signedMoney(bid.gain!))));
    expect(headline).toContain(escaped(h.paybackStartup(bid.verdict.atReserve!, fmt.money(bid.reserve))));
    expect(headline).not.toContain(escaped(h.paybackLaunch(bid.verdict.atReserve!, fmt.money(bid.reserve))));
  });

  it('always names the owning company on my plant, and elides « de » before a vowel in French', () => {
    const { game, company } = fixture(lang);
    const view = getPlayerView(game, 'human');
    const h = messages(lang).hex;
    const content = getContent(lang);
    const own = view.companies.find((c) => c.id === company.id)!;
    const product = own.products[0];
    const sector = content.sectors[product.sectorId].name;
    const single = render(view, lang, createElement(HexCellSheet, { view, hexId: product.hexId! }));
    expect(single).toContain(escaped(h.ownFactoryLine(product.name, sector)));
    expect(single).toContain(escaped(h.ownFactoryLine(product.name, sector, own.name)));
    // A second company under my control (takeover, merger): the line says which one owns this plant.
    const both = { ...view, companies: [...view.companies, { ...own, id: 'second-company', name: 'Oseille SA', products: [] }] };
    const many = render(both, lang, createElement(HexCellSheet, { view: both, hexId: product.hexId! }));
    expect(many).toContain(escaped(h.ownFactoryLine(product.name, sector, own.name)));
    expect(h.ownFactoryLine('P', 'S', 'Blé & Oseille')).toBe(lang === 'fr' ? 'Votre usine · P (S) · Blé & Oseille' : 'Your plant · P (S) · Blé & Oseille');
    // Players name their companies freely: « Usine d’Oseille SA », « Usine de Blé & Oseille ».
    expect(h.factoryProductLine('Oseille SA', 'Bob', 'P', 'S')).toBe(lang === 'fr' ? 'Usine d’Oseille SA (dirigée par Bob) · P (S)' : 'Oseille SA plant (run by Bob) · P (S)');
    expect(h.factoryLine('Oseille SA', 'Bob')).toBe(lang === 'fr' ? 'Usine d’Oseille SA (dirigée par Bob)' : 'Oseille SA plant (run by Bob)');
    expect(h.factoryLine('Blé & Oseille', 'Bob')).toBe(lang === 'fr' ? 'Usine de Blé & Oseille (dirigée par Bob)' : 'Blé & Oseille plant (run by Bob)');
    const rival = view.companies.find((c) => c.controllerId === 'rival')!;
    const renamed = { ...view, companies: view.companies.map((c) => c.id === rival.id ? { ...c, name: 'Oseille SA' } : c) };
    const occupied = render(renamed, lang, createElement(HexCellSheet, { view: renamed, hexId: rival.products[0].hexId! }));
    expect(occupied).toContain(escaped(h.factoryProductLine('Oseille SA', rival.ceoName, rival.products[0].name, content.sectors[rival.products[0].sectorId].name)));
    if (lang === 'fr') expect(occupied).toContain('Usine d’Oseille SA');
  });

  it('marks pending bids and latest awards and shows exact paid price and bidder count in the awarded cell sheet', () => {
    const { game, company, view: before } = fixture(lang);
    const target = before.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId: company.products[0].id, hexId: target, bid: before.hexes!.reserve[target] }).ok).toBe(true);
    let view = getPlayerView(game, 'human');
    expect(cellGroup(board(view, lang, undefined, target), target)).toContain(escaped(messages(lang).hex.pendingAria));
    resolveTurn(game);
    view = getPlayerView(game, 'human');
    const result = view.hexes!.results.find((r) => r.hexId === target)!;
    expect(result).toBeDefined();
    expect(cellGroup(board(view, lang, undefined, target), target)).toContain(escaped(messages(lang).hex.awardedAria));
    const html = render(view, lang, createElement(HexCellSheet, { view, hexId: target }));
    expect(html).toContain(escaped(messages(lang).hex.auctionLine(view.companies.find((c) => c.id === result.companyId)!.name, fmtFor(lang).money(result.price), result.bidders)));
  });

  it('titles the cell sheet with the place name, leaves the id to the board and starts board aria labels with the name', () => {
    const { view } = fixture(lang);
    const id = view.hexes!.free.find((id) => !hexById(id)!.city && !hexById(id)!.deposit)!;
    expect(id).toBeDefined();
    const name = hexPlaceName(id, lang, view.siteSlots);
    const html = render(view, lang, createElement(HexCellSheet, { view, hexId: id }));
    expect(html).toContain(`<h3>${escaped(name)}</h3>`);
    const subtitle = html.match(/<p class="hx-sheet-basin">([\s\S]*?)<\/p>/)![1];
    expect(subtitle).not.toContain(id);
    expect(subtitle).toBe(escaped(messages(lang).hex.basinRing(zoneLabel(getContent(lang).mapNames, basin(id)), ring(id))));
    const cell = cellGroup(board(view, lang), id);
    const label = hexPlaceLabel(id, lang, view.siteSlots);
    expect(label).toBe(`${name} (${id})`);
    expect(cell).toContain(`aria-label="${escaped(label)}`);
    // A deposit cell is named after its site slot, drawn from the view.
    const deposit = HEXES.find((h) => h.deposit)!;
    const slot = view.siteSlots.find((s) => s.id === deposit.deposit)!;
    const sheet = render(view, lang, createElement(HexCellSheet, { view, hexId: deposit.id }));
    expect(sheet).toContain(`<h3>${escaped(slot.name)}</h3>`);
    expect(cellGroup(board(view, lang), deposit.id)).toContain(`aria-label="${escaped(hexPlaceLabel(deposit.id, lang, view.siteSlots))}`);
  });

  it('keeps city clients, terrain effects and deposit links readable, the city share as a status line', () => {
    const { view } = fixture(lang);
    const city = HEXES.find((h) => h.city)!;
    const h = messages(lang).hex;
    const html = render(view, lang, createElement(HexCellSheet, { view, hexId: city.id }));
    const terrain = view.terrains!.find((t) => t.hex === city.id)!;
    expect(html).toContain(escaped(h.cityClientsTitle));
    expect(html).toContain(escaped(terrain.name));
    expect(html).toContain(escaped(terrain.strengthLabel));
    // A city cell has no basin line: its title is the city, its status says what share of customers it holds.
    expect(html).not.toContain('hx-sheet-basin');
    const status = html.match(/<p class="hx-sheet-status">([\s\S]*?)<\/p>/)![1];
    if (!view.hexes!.occupied[city.id]) expect(status).toContain(escaped(h.statusCity(fmtFor(lang).pct(CITIES[city.city!].share, 0))));
    expect(html.indexOf(escaped(h.cityClientsTitle))).toBeGreaterThan(html.indexOf('<details class="hx-sheet-description">'));
    const deposit = HEXES.find((h) => h.deposit)!;
    const slot = view.siteSlots.find((s) => s.id === deposit.deposit)!;
    const rival = view.companies.find((c) => c.controllerId === 'rival')!;
    slot.companyId = rival.id;
    const sheet = render(view, lang, createElement(HexCellSheet, { view, hexId: deposit.id, onOpenDeposit: () => {} }));
    expect(sheet).toContain(escaped(slot.name));
    expect(sheet).toContain(escaped(messages(lang).hex.openDeposits));
    expect(sheet).toContain(escaped(getContent(lang).commodities[DEPOSITS[deposit.deposit!].commodityId].name));
    expect(sheet).toContain(escaped(messages(lang).hex.depositOperatedBy(rival.name)));
  });

  it('says « city » and « vacant starting terrain » on free cells in one status line, the terrain blurb folded', () => {
    const { view } = fixture(lang);
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const vacant = view.terrains!.find((t) => view.hexes!.free.includes(t.hex))!;
    expect(vacant).toBeDefined();
    const html = render(view, lang, createElement(HexCellSheet, { view, hexId: vacant.hex }));
    const status = html.match(/<p class="hx-sheet-status">([\s\S]*?)<\/p>/)![1];
    expect(status).toContain(escaped(h.statusTerrainFree));
    const cityOf = hexById(vacant.hex)!.city;
    if (cityOf) expect(status).toContain(escaped(h.statusCity(fmt.pct(CITIES[cityOf].share, 0))));
    expect(html.indexOf(escaped(vacant.blurb))).toBeGreaterThan(html.indexOf('<details class="hx-sheet-description">'));
    // The status already says « ordinary »: the fold does not repeat it.
    expect(html).not.toContain(escaped(h.terrainInactive));
    const ordinary = view.hexes!.free.find((id) => !hexById(id)!.city && !view.terrains!.some((t) => t.hex === id))!;
    expect(render(view, lang, createElement(HexCellSheet, { view, hexId: ordinary }))).toContain(`<p class="hx-sheet-status">${escaped(h.freeCell)}</p>`);
  });
  it('uses the hex board in the map tab and retains the classic map when mapMode is absent', () => {
    const { view } = fixture(lang);
    const own = view.companies.find((c) => c.private)!;
    const html = render(view, lang, createElement(CityTab, { company: own, onSelect: () => {}, goTo: () => {} }));
    expect(count(html, 'data-hex-id=')).toBe(159);
    // On a desktop the tools stand in the left column (the toolbar row is for windows under 1200 px), the board in
    // its zoom frame; no notebook under it, and the marks wait in the closed « Légende » fold at the column's end.
    expect(html).toContain('<aside class="map-workspace-side"');
    expect(html).not.toContain('map-workspace-toolbar');
    expect(html).toContain('<div class="map-zoom-frame"><div class="map-zoom-board"><div class="hx-board">');
    expect(html).not.toContain('hx-notebook');
    expect(html).not.toContain('map-carnet');
    // The legend is the last of the column's folds (after « Flux »), closed.
    const fold = html.indexOf('<details class="hx-side-section hx-side-fold hx-legend-fold"><summary>');
    expect(fold).toBeGreaterThan(html.indexOf('map-flow-fold'));
    expect(html.indexOf('map-flow-fold')).toBeGreaterThan(-1);
    expect(html.indexOf('hx-legend-marks')).toBeGreaterThan(fold);
    expect(html.indexOf('hx-keyboard-hint')).toBeGreaterThan(fold);
    expect(html.indexOf('hx-legend-marks')).toBeLessThan(html.indexOf('</details>', fold));
    expect(html).not.toMatch(/<details[^>]*open/);
    // No Vous / Menace / Occasion signs on the board: rank and threats are in the game bar, the hot tip in the toolbar.
    expect(html).not.toContain('ent-sign');
    const { view: classic } = fixture(lang, false);
    const normal = render(classic, lang, createElement(CityTab, { company: classic.companies.find((c) => c.private)!, onSelect: () => {}, goTo: () => {} }));
    expect(normal).not.toContain('data-hex-id=');
    expect(normal).toContain('map-svg');
    expect(normal).not.toContain('hx-notebook');
    // The classic map keeps its three signs.
    for (const kind of ['you', 'threat', 'opening']) expect(normal).toContain(`ent-sign ent-${kind}`);
  });

  it('draws the map tab\'s board at least 760 px wide, to be scaled down in a short frame, and other boards at their width', () => {
    const { view } = fixture(lang);
    const svg = (html: string) => html.match(/<svg class="map-svg" width="([\d.]+)" height="([\d.]+)"/)!.slice(1).map(Number);
    // useElementWidth measures 680 px in these tests.
    expect(svg(board(view, lang))).toEqual([680, 680 * 1250 / 1080]);
    const fitted = render(view, lang, createElement(HexBoard, { view, selectedId: null, onSelect: () => {}, minDrawWidth: HEX_MIN_DRAW_WIDTH }));
    expect(HEX_MIN_DRAW_WIDTH).toBe(760);
    expect(svg(fitted)).toEqual([760, 760 * 1250 / 1080]);
    // Same proportions either way: the frame's aspect ratio.
    expect(svg(fitted)[0] / svg(fitted)[1]).toBeCloseTo(MAP_VIEW.width / MAP_VIEW.height, 10);
  });

  it('chooses the origin on any parcel by double click or Shift+Enter, but never in a bid picker', () => {
    const { view } = fixture(lang);
    setup(view, lang);
    const select = vi.fn(), reference = vi.fn();
    const product = view.companies.find((c) => c.private)!.products[0];
    const make = (onlyFree = false) => HexBoard({ view, selectedId: null, onSelect: select, onSelectReference: reference, showToolbar: false, selectableOnlyFree: onlyFree });
    const cell = (node: ReactNode, id: string) => elements(node, (element) => element.props.role === 'button'
      && elements(element.props.children as ReactNode, (child) => child.props['data-hex-id'] === id).length > 0)[0];
    const own = cell(make(), product.hexId!);
    (own.props.onClick as (event: { detail: number }) => void)({ detail: 1 });
    expect(select).toHaveBeenCalledWith(product.hexId);
    expect(reference).not.toHaveBeenCalled();
    (own.props.onDoubleClick as () => void)();
    expect(reference).toHaveBeenCalledWith(product.hexId);
    expect(own.props['aria-keyshortcuts']).toBe('Shift+Enter');
    reference.mockClear();
    const preventDefault = vi.fn();
    (own.props.onKeyDown as (event: unknown) => void)({ key: 'Enter', shiftKey: true, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(reference).toHaveBeenCalledWith(product.hexId);
    reference.mockClear();
    const rival = view.companies.find((c) => !c.private && c.products.some((p) => p.hexId))!.products.find((p) => p.hexId)!;
    const subsidiary = HEXES.find((hex) => hex.deposit)!;
    view.siteSlots.find((slot) => slot.id === subsidiary.deposit)!.companyId = view.companies.find((c) => c.private)!.id;
    for (const id of [rival.hexId!, subsidiary.id, view.hexes!.free[0]]) {
      const target = cell(make(), id);
      (target.props.onDoubleClick as () => void)();
      expect(reference).toHaveBeenCalledWith(id);
      expect(target.props['aria-keyshortcuts']).toBe('Shift+Enter');
    }
    reference.mockClear();
    (cell(make(true), product.hexId!).props.onDoubleClick as () => void)();
    expect(reference).not.toHaveBeenCalled();
  });

  it('accepts only palette drags, keeps target selection untouched and disables drops in bid pickers', () => {
    const { view } = fixture(lang);
    setup(view, lang);
    const select = vi.fn(), drop = vi.fn();
    const make = (selectableOnlyFree = false) => HexBoard({ view, selectedId: view.hexes!.free[1], onSelect: select, onDropActivity: drop, selectableOnlyFree });
    const cell = (node: ReactNode) => elements(node, e => e.props.role === 'button' && elements(e.props.children as ReactNode, c => c.props['data-hex-id'] === view.hexes!.free[0]).length > 0)[0];
    const group = cell(make()), preventDefault = vi.fn(), stopPropagation = vi.fn();
    const dragOver = group.props.onDragOver as (event: unknown) => void;
    dragOver({ dataTransfer: { types: ['text/plain'] }, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    dragOver({ dataTransfer: { types: [MAP_ACTIVITY_MIME] }, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    (group.props.onDrop as (event: unknown) => void)({ dataTransfer: { getData: (type: string) => type === MAP_ACTIVITY_MIME ? 'launch:scooters' : '' }, preventDefault, stopPropagation });
    expect(drop).toHaveBeenCalledExactlyOnceWith(view.hexes!.free[0], 'launch:scooters');
    expect(select).not.toHaveBeenCalled();
    expect(cell(make(true)).props.onDrop).toBeUndefined();
  });

  it('draws a theoretical ghost and an origin-to-target arrow with only the two selected parcel labels', () => {
    const { view } = fixture(lang);
    const source = view.hexes!.free[0], target = view.hexes!.free[1];
    const reference = { kind: 'launch' as const, sectorId: 'scooters' as const, originHexId: source };
    const props = { view, reference, selectedId: target, onSelect: vi.fn(), onSelectReference: vi.fn(), delivery: true };
    const html = render(view, lang, createElement(HexBoard, props));
    expect(html).toContain(`data-hx-simulated-origin="${source}"`);
    expect(html).toContain('class="hx-scenario-route"');
    expect(html).toContain(escaped(hexReadabilityMessages(lang).scenarioRoute(source, target)));
    expect(count(html, 'data-hx-map-label=')).toBe(2);
    const same = render(view, lang, createElement(HexBoard, { ...props, selectedId: source }));
    expect(same).not.toContain('class="hx-scenario-route"');
    expect(count(same, 'data-hx-map-label=')).toBe(1);
  });

  it('restores the pre-click destination when the native click/click/double-click sequence chooses an origin', () => {
    const { view } = fixture(lang);
    setup(view, lang);
    const destination = view.hexes!.free[0];
    const origin = view.companies.find((c) => c.private)!.products[0].hexId!;
    const select = vi.fn(), reference = vi.fn();
    const node = HexBoard({ view, selectedId: destination, onSelect: select, onSelectReference: reference });
    const group = elements(node, (element) => element.props.role === 'button' && elements(element.props.children as ReactNode, (child) => child.props['data-hex-id'] === origin).length > 0)[0];
    const click = group.props.onClick as (event: { detail: number }) => void;
    click({ detail: 1 });
    expect(select).toHaveBeenLastCalledWith(origin);
    expect(reference).not.toHaveBeenCalled();
    click({ detail: 2 });
    (group.props.onDoubleClick as () => void)();
    expect(select.mock.calls).toEqual([[origin], [destination]]);
    expect(reference).toHaveBeenCalledExactlyOnceWith(origin);
    // A subsequent ordinary click still chooses a destination immediately.
    click({ detail: 1 });
    expect(select).toHaveBeenLastCalledWith(origin);
    // If the sheet reflows the board, the second click may land on a neighboring parcel.
    select.mockClear();
    reference.mockClear();
    const shifted = elements(node, (element) => element.props.role === 'button' && elements(element.props.children as ReactNode, (child) => child.props['data-hex-id'] === view.hexes!.free[1]).length > 0)[0];
    (shifted.props.onClick as (event: { detail: number }) => void)({ detail: 2 });
    (shifted.props.onDoubleClick as () => void)();
    expect(select).toHaveBeenCalledExactlyOnceWith(destination);
    expect(reference).toHaveBeenCalledExactlyOnceWith(origin);
    // Bubbling to the map does not select the origin twice.
    (elements(node, (element) => element.props.className === 'hx-map')[0].props.onDoubleClick as () => void)();
    expect(reference).toHaveBeenCalledTimes(1);
  });

  it('moves selected cells with arrow keys and activates cells with Enter', () => {
    const { view } = fixture(lang);
    setup(view, lang);
    const select = vi.fn();
    const selected = 'B4';
    const node = HexBoard({ view, selectedId: selected, onSelect: select, showToolbar: false });
    const group = elements(node, (element) => element.props.role === 'button' && elements(element.props.children as ReactNode, (child) => child.props['data-hex-id'] === selected).length > 0)[0];
    expect(group).toBeDefined();
    const keyDown = group.props.onKeyDown as (event: { key: string; preventDefault: () => void }) => void;
    const preventDefault = vi.fn();
    keyDown({ key: 'ArrowRight', preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    const target = select.mock.calls[0][0] as string;
    expect(neighbors(selected).some((h) => h.id === target)).toBe(true);
    expect(hexById(target)!.x).toBeGreaterThan(hexById(selected)!.x);
    select.mockClear();
    keyDown({ key: 'Enter', preventDefault });
    expect(select).toHaveBeenCalledWith(selected);
  });

  it('inspects on hover and focus, clears on map exit, and confirms an origin once without a double-click shortcut', () => {
    const { view } = fixture(lang);
    setup(view, lang);
    const select = vi.fn(), inspect = vi.fn(), reference = vi.fn();
    const selected = 'B4';
    const node = HexBoard({ view, selectedId: selected, onSelect: select, onInspect: inspect, onSelectReference: reference });
    const group = elements(node, element => element.props.role === 'button'
      && elements(element.props.children as ReactNode, child => child.props['data-hex-id'] === selected).length > 0)[0];
    const map = elements(node, element => element.props.className === 'hx-map')[0];
    (group.props.onMouseEnter as () => void)();
    expect(inspect).toHaveBeenLastCalledWith(selected);
    (group.props.onFocus as () => void)();
    expect(inspect).toHaveBeenLastCalledWith(selected);
    expect(select).not.toHaveBeenCalled();
    expect(group.props.onDoubleClick).toBeUndefined();
    expect(map.props.onDoubleClick).toBeUndefined();
    expect(group.props['aria-keyshortcuts']).toBeUndefined();
    const click = group.props.onClick as (event: { detail: number }) => void;
    click({ detail: 1 });
    click({ detail: 2 });
    expect(select).toHaveBeenCalledExactlyOnceWith(selected);
    select.mockClear();
    const preventDefault = vi.fn();
    const keyDown = group.props.onKeyDown as (event: unknown) => void;
    keyDown({ key: 'ArrowRight', preventDefault });
    expect(inspect).toHaveBeenLastCalledWith(hexArrowTarget(selected, 'ArrowRight'));
    expect(select).not.toHaveBeenCalled();
    keyDown({ key: 'Enter', shiftKey: true, preventDefault });
    expect(select).toHaveBeenCalledExactlyOnceWith(selected);
    expect(reference).not.toHaveBeenCalled();
    const blur = map.props.onBlur as (event: unknown) => void;
    inspect.mockClear();
    blur({ relatedTarget: {}, currentTarget: { contains: () => true } });
    expect(inspect).not.toHaveBeenCalled();
    blur({ relatedTarget: {}, currentTarget: { contains: () => false } });
    expect(inspect).toHaveBeenCalledExactlyOnceWith(null);
    (map.props.onMouseLeave as () => void)();
    expect(inspect).toHaveBeenLastCalledWith(null);
  });
});

describe.each(['fr', 'en'] as const)('hex legend precision and marker translations (%s)', (lang) => {
  it.each(['margin', 'transport', 'demand'] as const)('keeps extremely close %s values distinct, including values below ordinary decimal precision', (lens) => {
    const fmt = fmtFor(lang), h = messages(lang).hex;
    for (const [min, max] of [[1e-25, 6e-25], [6, 6 + Number.EPSILON * 4], [1e9, 1e9 + .00001]]) {
      const range = lens === 'margin' ? Array.from({ length: 6 }, (_, index) => index === 5 ? max : min + (max - min) * index / 5) as [number, number, number, number, number, number]
        : [min, max] as [number, number];
      const steps = hexLegendSteps(range, lens, fmt, h.legendBetween);
      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(new Set(steps.map((step) => step.label)).size).toBe(steps.length);
      expect(steps.map((step) => step.index)[0]).toBe(lens === 'margin' && min === 6 ? 2 : 0);
      expect(steps.at(-1)?.index).toBe(4);
      expect(steps.every((step) => !/NaN|Infinity/.test(step.label))).toBe(true);
    }
  });

  it('uses one honest middle-color label for constant values and omits empty tied quintile bands', () => {
    const fmt = fmtFor(lang), h = messages(lang).hex;
    for (const lens of ['margin', 'transport', 'demand'] as const) {
      const steps = hexLegendSteps(lens === 'margin' ? [6, 6, 6, 6, 6, 6] : [6, 6], lens, fmt, h.legendBetween);
      expect(steps).toHaveLength(1);
      expect(steps[0].index).toBe(2);
    }
    const tied = hexLegendSteps([6, 6, 6, 7, 7, 7], 'margin', fmt, h.legendBetween);
    expect(tied.map((step) => step.index)).toEqual([2, 4]);
    expect(new Set(tied.map((step) => step.label)).size).toBe(2);
  });

  it('has nonempty bilingual marker text, with French vous and adapted English', () => {
    const fr = hexReadabilityMessages('fr'), en = hexReadabilityMessages('en');
    expect(Object.keys(fr)).toEqual(Object.keys(en));
    const texts = (messages: typeof fr) => Object.values(messages).map((value) => typeof value === 'function' ? value('D2') : value);
    for (const value of texts(hexReadabilityMessages(lang))) expect(value.trim()).not.toBe('');
    expect(texts(fr).some((value) => /\b(?:tu|ton|ta|tes)\b/i.test(value))).toBe(false);
    expect(texts(en).some((value) => /[àâçéèêëîïôûùœ«»]/i.test(value))).toBe(false);
  });
});

it('projects the engine pointy hex radius into BaseMap coordinates and keeps isolated island navigation finite', () => {
  const projection = mapScale(680, MAP_VIEW);
  const hex = hexById('B4')!;
  const points = hexPolygon(hex, projection).split(' ');
  expect(points).toHaveLength(6);
  expect(points[0]).toBe(`${projection.px(hex.x).toFixed(2)},${projection.py(hex.y - HEX_R).toFixed(2)}`);
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) expect(hexArrowTarget('A15', key)).toBeNull();
});
