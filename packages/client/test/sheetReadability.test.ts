import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ZONE, DEPOSITS, HEXES, createGame, formatLots, formatMoney, formatSignedPct, getContent, getPlayerView, type Lang, type PlayerView, type SectorId } from '@muchomoney/core';
import { messages } from '../src/i18n';
import { freightMessages } from '../src/i18n/freight';
import { hexReadabilityMessages } from '../src/i18n/hexReadability';
import { fmtFor } from '../src/fmt';
import { hexMarginValue } from '../src/screens/game/city/hexModel';
import { moveLeavesTerrain } from '../src/screens/game/startingTerrain';
import { sheetReadabilityMessages } from '../src/i18n/sheetReadability';
import { HexCellSheet } from '../src/screens/game/city/HexCellSheet';
import { HexLaunchForm, ZoneLaunchForm } from '../src/screens/game/LaunchForms';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { DepositPanel } from '../src/screens/game/DepositPanel';
import { AmountForm } from '../src/components/AmountForm';
import { HexMapView } from '../src/screens/game/city/HexMapView';
import { HexBoard } from '../src/screens/game/city/HexBoard';
import { MapActivityPalette } from '../src/screens/game/city/MapActivityPalette';
import { MapWorkspace } from '../src/screens/game/city/MapWorkspace';
import { DepositSheet, ZoneSheet } from '../src/screens/game/city/MapSheets';
import { mapDeposits, mapFactories } from '../src/screens/game/city/mapModel';
import { MapView } from '../src/screens/game/city/MapView';
import { getState, setState, type AppState } from '../src/store';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[], deps: [] as (unknown[] | undefined)[], effectCursor: 0 }));
const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(hooks.values[index]) : value; }];
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = { current: initial };
      return hooks.values[index];
    },
    useEffect: (effect: () => void, deps?: unknown[]) => {
      const index = hooks.effectCursor++;
      const previous = hooks.deps[index];
      if (!deps || !previous || deps.some((value, i) => !Object.is(value, previous[i]))) hooks.effects.push(effect);
      hooks.deps[index] = deps;
    },
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
  };
});
vi.mock('../src/hooks/useGame', () => ({ useGame: () => ({ view: data.view!, me: data.view!.players.find((p) => p.id === data.view!.you)!, sectorsById: new Map(data.view!.sectors.map((s) => [s.id, s])) }) }));
vi.mock('../src/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../src/hooks/useElementWidth', () => ({ useElementWidth: () => [vi.fn(), 680] }));
vi.mock('../src/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
// Sheet tests assert the placement and focus of hosted decisions, independently of their economic internals.
vi.mock('../src/screens/game/LaunchForms', () => ({
  ZoneLaunchForm: () => createElement('form', { 'data-test-decision': 'launch' }),
  HexLaunchForm: () => createElement('form', { 'data-test-decision': 'launch' }),
  initialBidHex: (view: PlayerView, _reference: unknown, preferred?: string) => preferred ?? view.hexes?.free[0] ?? null,
}));
vi.mock('../src/screens/game/MoveForms', () => ({
  ZoneMoveForm: () => createElement('form', { 'data-test-decision': 'move' }),
  HexMoveForm: () => createElement('form', { 'data-test-decision': 'move' }),
}));
vi.mock('../src/screens/game/DepositPanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/screens/game/DepositPanel')>();
  return { ...actual, DepositPanel: () => createElement('form', { 'data-test-decision': 'deposit' }) };
});

const initialState = getState();
afterEach(() => {
  setState(initialState);
  data.view = null;
  hooks.values = [];
  hooks.cursor = 0;
  hooks.effects = [];
  hooks.deps = [];
  hooks.effectCursor = 0;
  vi.unstubAllGlobals();
});

function fixture(lang: Lang, mapMode: 'classic' | 'hex') {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode, terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  const view = getPlayerView(game, 'human');
  data.view = view;
  setState({ view, lang, lobby: null });
  return { view, company: view.companies.find((c) => c.private)! };
}
function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const content = [node.props.children, node.props.sheet, node.props.toolbar, node.props.boardHeader, node.props.actions] as ReactNode[];
  return [...(predicate(node) ? [node] : []), ...content.flatMap((slot) => elements(slot, predicate))];
}
function child(node: ReactNode, type: unknown) { return elements(node, (element) => element.type === type)[0]; }
function paletteAction(node: ReactNode, label: string) {
  const action = elements(child(node, MapActivityPalette).props.actions as ReactNode,
    element => element.type === 'button' && element.props.children === label)[0];
  expect(action, `palette action ${label}`).toBeDefined();
  return action;
}
function renderMap(render: () => ReactNode) {
  hooks.cursor = 0;
  hooks.effectCursor = 0;
  hooks.effects = [];
  return render();
}
function effects() { for (const effect of hooks.effects) effect(); }
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
// Freight summaries are the visible costs; their per-route tables alone start folded.
const firstDescriptionAt = (html: string) => html.match(/<details\b(?![^>]*class="freight-line")/)?.index ?? -1;
function expectVisibleBeforeDetails(html: string, label: string) {
  const labelAt = html.indexOf(label);
  expect(labelAt).toBeGreaterThanOrEqual(0);
  expect(labelAt).toBeLessThan(firstDescriptionAt(html));
}

describe.each(['fr', 'en'] as const)('decision sheets readable immediately (%s)', (lang) => {
  it('places the hex decision after the header/status and keeps descriptions folded with or without a form', () => {
    const { view } = fixture(lang, 'hex');
    const hexId = view.hexes!.free[0];
    const html = renderToStaticMarkup(createElement(HexCellSheet, { view, hexId, children: createElement('div', { 'data-test-decision': true }) }));
    const decisionAt = html.indexOf('data-test-decision');
    expect(decisionAt).toBeGreaterThan(html.indexOf('hx-sheet-status'));
    expect(decisionAt).toBeLessThan(html.indexOf('hx-sheet-description'));
    expect(html).toContain('<details class="hx-sheet-description">');
    expect(html).toContain(sheetReadabilityMessages(lang).locationDetails);
    expect(renderToStaticMarkup(createElement(HexCellSheet, { view, hexId }))).toContain('<details class="hx-sheet-description">');
  });

  it.each(['launch', 'move'] as const)('puts the classic %s form first and retains folded location descriptions', (mode) => {
    const { view, company } = fixture(lang, 'classic');
    const props = { zoneId: 'south' as const, view, factories: mapFactories(view), acting: company, goTo: vi.fn(), onOpenFactory: vi.fn(), onMove: vi.fn(), onBackToZone: vi.fn(), move: mode === 'move' ? { company, product: company.products[0] } : null };
    const html = renderToStaticMarkup(createElement(ZoneSheet, props));
    expect(html.indexOf(`data-test-decision="${mode}"`)).toBeGreaterThan(html.indexOf('map-sheet-title'));
    expect(html.indexOf(`data-test-decision="${mode}"`)).toBeLessThan(html.indexOf('map-sheet-description'));
    expect(html).toContain('<details class="map-sheet-description">');
    expect(html).toContain('data-map-form="true" role="group" tabindex="-1"');
    expect(html).toContain(messages(lang).city.map.zoneSheet.factoriesTitle);
    expect(renderToStaticMarkup(createElement(ZoneSheet, { ...props, acting: null, move: null }))).toContain('<details class="map-sheet-description">');
  });

  it('places the classic deposit decision immediately after the title in an accessible focus group', () => {
    const { view, company } = fixture(lang, 'classic');
    const deposit = mapDeposits(view)[0];
    const html = renderToStaticMarkup(createElement(DepositSheet, { deposit, view, acting: company }));
    expect(html).toMatch(/<\/h3><div class="map-sheet-form" data-map-form="true" role="group" tabindex="-1"/);
    expect(html).toContain('data-test-decision="deposit"');
  });

  it('leads a free cell with the deciding figure, then reserve, demand and freight, then the action, the rest folded', () => {
    const { view, company } = fixture(lang, 'hex');
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const onMove = vi.fn();
    const onLaunch = vi.fn();
    const hexId = view.hexes!.free[0];
    const props = { view, hexId, onMove, onLaunch };
    const html = renderToStaticMarkup(createElement(HexCellSheet, props));
    const detailsAt = firstDescriptionAt(html);
    const product = company.products[0];
    const gain = hexMarginValue(view, { kind: 'product', productId: product.id }, hexId, true)!;
    expectVisibleBeforeDetails(html, escaped(h.headMove(product.name, fmt.signedMoney(gain))));
    expect(html.indexOf('hx-headline')).toBeLessThan(html.indexOf(escaped(h.reserveLabel)));
    expectVisibleBeforeDetails(html, escaped(h.reserveLabel));
    expectVisibleBeforeDetails(html, escaped(h.demandLabel));
    expectVisibleBeforeDetails(html, escaped(freightMessages(lang).partLabel));
    expectVisibleBeforeDetails(html, h.moveHere(company.products[0].name));
    expectVisibleBeforeDetails(html, h.launchHere);
    // The absolute margin and the cost per lot are behind « Pourquoi ce chiffre ? », closed, after the action.
    expect(html.indexOf(`<details class="hx-sheet-fold"><summary>${escaped(h.whyTitle)}</summary>`)).toBe(detailsAt);
    expect(html.indexOf(`<dt>${escaped(h.marginLabel)}</dt>`)).toBeGreaterThan(detailsAt);
    expect(html.indexOf(`<dt>${escaped(h.unitCostLabel)}</dt>`)).toBeGreaterThan(detailsAt);
    expect(html.indexOf(h.productEstimateNote)).toBeGreaterThan(detailsAt);
    expect(html).not.toMatch(/<details[^>]*open/);
    const sheet = HexCellSheet(props);
    const buttons = elements(sheet, (element) => element.type === 'button');
    (buttons[0].props.onClick as () => void)();
    (buttons[1].props.onClick as () => void)();
    expect(onMove).toHaveBeenCalledWith(company.id, company.products[0].id, hexId);
    expect(onLaunch).toHaveBeenCalledWith(company.products[0].sectorId, hexId);
  });

  it('puts the one-time discovery note below the action', () => {
    const { view } = fixture(lang, 'hex');
    const h = messages(lang).hex;
    const html = renderToStaticMarkup(createElement(HexCellSheet, { view, hexId: view.hexes!.free[0], onMove: vi.fn(), onLaunch: vi.fn(), discoveryNote: 'free' }));
    expect(html.indexOf('data-cell-note="free"')).toBeGreaterThan(html.indexOf(escaped(h.launchHere)));
    expect(html.indexOf('data-cell-note="free"')).toBeLessThan(firstDescriptionAt(html));
    expect(html.indexOf('data-cell-note="free"')).toBeGreaterThan(html.indexOf('hx-headline'));
    // With a form open in the sheet, the note comes before it rather than under the whole decision.
    const withForm = renderToStaticMarkup(createElement(HexCellSheet, { view, hexId: view.hexes!.free[0], discoveryNote: 'free', children: createElement('form', { 'data-test-decision': 'launch' }) }));
    expect(withForm.indexOf('data-cell-note="free"')).toBeGreaterThan(-1);
    expect(withForm.indexOf('data-cell-note="free"')).toBeLessThan(withForm.indexOf('data-test-decision'));
    // On a deposit cell, above the deposit panel as well as above the plain sheet's button.
    const deposit = HEXES.find((hex) => hex.deposit)!;
    const panel = renderToStaticMarkup(createElement(HexCellSheet, { view, hexId: deposit.id, discoveryNote: 'deposit', children: createElement('form', { 'data-test-decision': 'deposit' }) }));
    expect(panel.indexOf('data-cell-note="deposit"')).toBeGreaterThan(-1);
    expect(panel.indexOf('data-cell-note="deposit"')).toBeLessThan(panel.indexOf('data-test-decision'));
    const plain = renderToStaticMarkup(createElement(HexCellSheet, { view, hexId: deposit.id, discoveryNote: 'deposit', onOpenDeposit: vi.fn() }));
    expect(plain.indexOf('data-cell-note="deposit"')).toBeGreaterThan(-1);
    expect(plain.indexOf('data-cell-note="deposit"')).toBeLessThan(plain.indexOf(escaped(h.openDeposits)));
  });

  it('steps its launch and move buttons aside while a form is open in the sheet, the form keeping its own controls', () => {
    const { view, company } = fixture(lang, 'hex');
    const h = messages(lang).hex;
    const props = { view, hexId: view.hexes!.free[0], onMove: vi.fn(), onLaunch: vi.fn(), reference: { kind: 'launch' as const, sectorId: 'gadgets' as const } };
    const html = renderToStaticMarkup(createElement(HexCellSheet, { ...props, children: createElement('form', { 'data-test-decision': 'launch' }) }));
    expect(html).toContain('data-test-decision="launch"');
    expect(html).not.toContain('hx-sheet-actions');
    expect(html).not.toContain(h.launchHere);
    expect(html).not.toContain(h.moveHere(company.products[0].name));
    // The reserve stays above the form (the form leaves it out); the headline and « Que lancer ici ? » step aside,
    // the form's sector buttons and summary carrying them.
    expectVisibleBeforeDetails(html, escaped(h.reserveLabel));
    expect(html.indexOf(escaped(h.reserveLabel))).toBeLessThan(html.indexOf('data-test-decision'));
    expect(html).not.toContain('hx-headline');
    expect(html).not.toContain(escaped(freightMessages(lang).launchTitle));
    const closed = renderToStaticMarkup(createElement(HexCellSheet, props));
    expect(closed).toContain('hx-sheet-actions');
    expect(closed).toContain('hx-headline');
    expect(closed).toContain(escaped(freightMessages(lang).launchTitle));
    // Each action is marked so that a closing form can hand the keyboard focus back to the one that opened it.
    expect(closed).toContain('data-hx-launch-here');
    expect(closed).toContain(`data-hx-move-here="${company.products[0].id}"`);
    // With a new plant tracked, launching is the main action.
    expect(closed.indexOf('data-hx-launch-here')).toBeLessThan(closed.indexOf('data-hx-move-here'));
  });

  it('closes a hex launch form from the top band, restoring focus there, and opens deposit decisions explicitly', () => {
    const { view, company } = fixture(lang, 'hex');
    const body = {};
    const page = { body, activeElement: body as unknown, querySelector: () => null };
    const buildButton = { disabled: false, isConnected: true, getClientRects: () => [{}],
      focus: vi.fn((_options?: FocusOptions) => { page.activeElement = buildButton; }) };
    const render = () => {
      const node = HexMapView({ company, onSelect: vi.fn(), goTo: vi.fn() });
      // Bind the real action ref as React does at commit. The deposit action later replaces this button.
      const action = elements(child(node, MapActivityPalette).props.actions as ReactNode,
        element => element.type === 'button' && element.props.children === hexReadabilityMessages(lang).buildFactory)[0];
      buildButton.isConnected = Boolean(action);
      if (action) {
        buildButton.disabled = Boolean(action.props.disabled);
        (action.props.ref as (node: unknown) => void)(buildButton);
      }
      return node;
    };
    let map = renderMap(render);
    const free = view.hexes!.free[0];
    (child(map, HexBoard).props.onSelect as (id: string) => void)(free);
    map = renderMap(render);
    const openLaunch = () => {
      (paletteAction(map, hexReadabilityMessages(lang).buildFactory).props.onClick as () => void)();
      map = renderMap(render);
      effects(); // The opening effects run (no document here: nothing to focus yet).
      const form = child(map, HexLaunchForm);
      expect(form).toBeDefined();
      expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, element => element.type === HexLaunchForm)).toHaveLength(0);
      return form;
    };
    // Cancel unmounts the focused form, so focus returns to its top-band action.
    let form = openLaunch();
    vi.stubGlobal('document', page);
    (form.props.onCancel as () => void)();
    map = renderMap(render);
    effects();
    expect(child(map, HexCellSheet).props.children).toBeFalsy();
    expect(child(map, HexCellSheet).props.details).toBeNull();
    expect(buildButton.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(page.activeElement).toBe(buildButton);
    // Focus already somewhere else (a pointer user, another control): it is left alone.
    vi.unstubAllGlobals();
    form = openLaunch();
    const externalPage = { ...page, activeElement: { elsewhere: true } };
    vi.stubGlobal('document', externalPage);
    (form.props.onCancel as () => void)();
    map = renderMap(render);
    effects();
    expect(buildButton.focus).toHaveBeenCalledOnce();
    expect(externalPage.activeElement).toEqual({ elsewhere: true });
    vi.unstubAllGlobals();
    // Navigating to a deposit shows facts only. Its bidding controls open from the top band.
    const depositHex = HEXES.find((hex) => hex.deposit && view.siteSlots.some((slot) => slot.id === hex.deposit))!;
    (child(map, HexBoard).props.onSelect as (id: string) => void)(depositHex.id);
    map = renderMap(render);
    expect(child(map, DepositPanel)).toBeUndefined();
    expect(child(map, HexCellSheet).props.readOnly).toBe(true);
    (paletteAction(map, hexReadabilityMessages(lang).buildSubsidiary).props.onClick as () => void)();
    map = renderMap(render);
    const sheet = child(map, HexCellSheet);
    const panel = child(map, DepositPanel);
    expect(panel.props.slot).toMatchObject({ id: depositHex.deposit });
    expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, element => element.type === DepositPanel)).toHaveLength(0);
    const details = sheet.props.details as ReactElement<Record<string, unknown>>;
    expect(details.props.slot).toMatchObject({ id: depositHex.deposit });
    expect(details.props.company).toBe(company);
    expect(details.props.readOnly).toBe(true);
  });

  it('shows what my plant does and offers the product card and a search for a better cell, outside folded descriptions', () => {
    const { view, company } = fixture(lang, 'hex');
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const product = company.products[0];
    const own = product.private!;
    const hexId = product.hexId!;
    const onOpenCompany = vi.fn();
    const onSeekMove = vi.fn();
    const props = { view, hexId, onOpenCompany, onSeekMove };
    const html = renderToStaticMarkup(createElement(HexCellSheet, props));
    const detailsAt = firstDescriptionAt(html);
    const status = html.match(/<p class="hx-sheet-status">([\s\S]*?)<\/p>/)![1];
    expect(status).toContain(escaped(h.ownFactoryLine(product.name, getContent(lang).sectors[product.sectorId].name)));
    expectVisibleBeforeDetails(html, `<dt>${escaped(hexReadabilityMessages(lang).factoryMargin)}</dt><dd>${escaped(fmt.signedMoney(own.estimate!.margin))}</dd>`);
    expectVisibleBeforeDetails(html, `<dt>${escaped(h.productionLabel)}</dt><dd>${escaped(h.productionValue(fmt.int(Math.floor(Math.min(own.production, product.capacity))), fmt.lots(product.capacity)))}</dd>`);
    expectVisibleBeforeDetails(html, `<dt>${escaped(hexReadabilityMessages(lang).factoryDemand)}</dt><dd>${escaped(fmt.lots(own.estimate!.demand, 3))}</dd>`);
    expectVisibleBeforeDetails(html, escaped(freightMessages(lang).materialsLabel));
    expectVisibleBeforeDetails(html, escaped(freightMessages(lang).deliveryLabel));
    expectVisibleBeforeDetails(html, escaped(h.openProduct));
    // On its active starting terrain, the search says it ignores the perks a move would end.
    expectVisibleBeforeDetails(html, escaped(moveLeavesTerrain(view, company, product) ? h.seekMovePerks : h.seekMove));
    // Who owns it and a reserve nobody can bid on: gone.
    expect(html).not.toContain(escaped(h.reserveLabel));
    expect(html).not.toContain(`<dd>${escaped(company.name)}</dd>`);
    expect(html.indexOf(h.oneFactory)).toBeGreaterThan(detailsAt);
    const buttons = elements(HexCellSheet(props), (element) => element.type === 'button');
    (buttons[0].props.onClick as () => void)();
    expect(onOpenCompany).toHaveBeenCalledWith(company.id, product.id);
    (buttons[1].props.onClick as () => void)();
    expect(onSeekMove).toHaveBeenCalledWith(company.id, product.id);
    // Last quarter: no bid can be placed, so no search either.
    view.turn = view.config.totalTurns;
    expect(renderToStaticMarkup(createElement(HexCellSheet, props))).not.toContain('data-hx-seek-move');
  });

  it('keeps a legacy move intent on its best free cell and hosts its form in the band above the map', () => {
    const { view, company } = fixture(lang, 'hex');
    const product = company.products[0];
    const map = renderMap(() => HexMapView({ company, onSelect: vi.fn(), goTo: vi.fn(), intent: { kind: 'move', productId: product.id } }));
    const reference = { kind: 'product' as const, productId: product.id };
    const best = view.hexes!.free.reduce((top, id) => (hexMarginValue(view, reference, id, true) ?? -Infinity) > (hexMarginValue(view, reference, top, true) ?? -Infinity) ? id : top);
    expect(child(map, HexCellSheet).props.hexId).toBe(best);
    expect(child(map, HexMoveForm).props.product).toMatchObject({ id: product.id });
    expect(elements(child(map, MapWorkspace).props.boardHeader as ReactNode, element => element.type === HexMoveForm)).toHaveLength(1);
    expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, element => element.type === HexMoveForm)).toHaveLength(0);
    expect(child(map, HexCellSheet).props.readOnly).toBe(true);
    expect(elements(map, (element) => element.props.children === messages(lang).hex.moveHint)).toHaveLength(1);
  });

  it('shows deposit capacity and its action before folded descriptions', () => {
    const { view } = fixture(lang, 'hex');
    const h = messages(lang).hex;
    const hex = HEXES.find((cell) => cell.deposit && view.siteSlots.some((slot) => slot.id === cell.deposit))!;
    const onOpenDeposit = vi.fn();
    const props = { view, hexId: hex.id, onOpenDeposit };
    const html = renderToStaticMarkup(createElement(HexCellSheet, props));
    expect(html.indexOf(h.depositTitle)).toBeGreaterThan(html.indexOf('hx-sheet-status'));
    expectVisibleBeforeDetails(html, h.depositCapacity(formatLots(DEPOSITS[hex.deposit!]?.capacity ?? 0, lang)));
    expect(html.indexOf(h.depositTitle)).toBeLessThan(html.indexOf(h.openDeposits));
    expectVisibleBeforeDetails(html, h.openDeposits);
    const button = child(HexCellSheet(props), 'button');
    (button.props.onClick as () => void)();
    expect(onOpenDeposit).toHaveBeenCalledWith(hex.deposit);
  });

  it('keeps classic factory costs and move actions visible while customer breakdowns start folded', () => {
    const { view } = fixture(lang, 'classic');
    const zs = messages(lang).city.map.zoneSheet;
    const props = { zoneId: 'south' as const, view, factories: mapFactories(view), acting: null, goTo: vi.fn(), onOpenFactory: vi.fn(), onMove: vi.fn(), onBackToZone: vi.fn() };
    const html = renderToStaticMarkup(createElement(ZoneSheet, props));
    const detailsAt = firstDescriptionAt(html);
    expectVisibleBeforeDetails(html, zs.factoriesTitle);
    expectVisibleBeforeDetails(html, 'map-sheet-own');
    expectVisibleBeforeDetails(html, zs.moveHere);
    expect(html.indexOf(zs.customersTitle)).toBeGreaterThan(detailsAt);
    expect(html).not.toContain('<details class="map-sheet-description" open');
    const button = child(ZoneSheet(props), 'button');
    (button.props.onClick as () => void)();
    expect(props.onMove).toHaveBeenCalledWith(view.companies.find((company) => company.private)!.products[0].id);
  });

  it('shows only the explicit product reference in classic cost estimates and move actions', () => {
    const { view, company } = fixture(lang, 'classic');
    const product = company.products[0];
    const other = { ...product, id: 'other-product', name: 'Other product' };
    company.products.push(other);
    const props = { zoneId: 'south' as const, view, factories: mapFactories(view), acting: null, goTo: vi.fn(), onOpenFactory: vi.fn(), onMove: vi.fn(), onBackToZone: vi.fn() };
    const html = renderToStaticMarkup(createElement(ZoneSheet, { ...props, reference: { kind: 'product', productId: other.id } }));
    const main = html.slice(0, firstDescriptionAt(html));
    expect(main).toContain(other.name);
    expect(main).not.toContain(product.name);
    const button = child(ZoneSheet({ ...props, reference: { kind: 'product', productId: other.id } }), 'button');
    (button.props.onClick as () => void)();
    expect(props.onMove).toHaveBeenCalledWith(other.id);
    const withoutReference = renderToStaticMarkup(createElement(ZoneSheet, { ...props, reference: null }));
    expect(withoutReference).not.toContain('map-sheet-own');
  });

  it('shows the referenced launch cost and capital gap first and opens that sector by default', () => {
    const { view, company } = fixture(lang, 'classic');
    const sector = view.sectors.find((candidate) => candidate.id !== company.products[0].sectorId && candidate.launchByZone)!;
    const zs = messages(lang).city.map.zoneSheet;
    const sectorName = getContent(lang).sectors[sector.id].name;
    const cost = sector.launchByZone!.south.unitCost;
    const baseline = sector.launchByZone![DEFAULT_ZONE].unitCost;
    const gap = formatSignedPct((cost - baseline) / baseline, 1, lang).replace('-', String.fromCharCode(8722));
    const props = { zoneId: 'south' as const, view, factories: mapFactories(view), acting: company, reference: { kind: 'launch' as const, sectorId: sector.id }, goTo: vi.fn(), onOpenFactory: vi.fn(), onMove: vi.fn(), onBackToZone: vi.fn() };
    const html = renderToStaticMarkup(createElement(ZoneSheet, props));
    expectVisibleBeforeDetails(html, messages(lang).city.map.refNewPlant(sectorName));
    expectVisibleBeforeDetails(html, zs.unitCostHere(formatMoney(cost, lang)));
    expectVisibleBeforeDetails(html, zs.sectorGap(sectorName, gap));
    expect(child(ZoneSheet(props), ZoneLaunchForm).props.initialSector).toBe(sector.id);
    const onLaunchSectorChange = vi.fn();
    const form = child(ZoneSheet({ ...props, launchSector: company.products[0].sectorId, onLaunchSectorChange }), ZoneLaunchForm);
    expect(form.props.initialSector).toBe(company.products[0].sectorId);
    expect(form.props.trackedSector).toBe(company.products[0].sectorId);
    (form.props.onSectorChange as (sector: SectorId) => void)('crypto');
    expect(onLaunchSectorChange).toHaveBeenCalledWith('crypto');
  });

  it.each(['classic', 'hex'] as const)('syncs the actual %s launch sector both ways without erasing drafts, the typed bid included', async (mode) => {
    const { view, company } = fixture(lang, mode);
    const actual = await vi.importActual<typeof import('../src/screens/game/LaunchForms')>('../src/screens/game/LaunchForms');
    let trackedSector: SectorId = 'crypto';
    const onSectorChange = vi.fn((sector: SectorId) => { trackedSector = sector; });
    const render = () => renderMap(() => mode === 'classic'
      ? actual.ZoneLaunchForm({ company, zoneId: 'south', initialSector: 'yogurts', trackedSector, onSectorChange })
      : actual.HexLaunchForm({ company, hexId: view.hexes!.free[0], initialSector: 'yogurts', trackedSector, onSectorChange }));
    const active = (tree: ReactNode) => elements(tree, (element) => element.type === 'button' && String(element.props.className).includes('seg-btn active'))[0];
    let tree = render();
    expect(active(tree).key).toBe('crypto');
    effects();
    (child(tree, 'input').props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Saved draft' } });
    const initialBidKey = mode === 'hex' ? child(tree, AmountForm).key : null;
    if (mode === 'hex') {
      (child(tree, AmountForm).props.onRawChange as (raw: string) => void)('315.5');
      (child(tree, actual.HexFallbackChoice).props.onChange as (value: string) => void)('abandon');
    }
    trackedSector = 'gadgets';
    tree = render();
    effects();
    tree = render();
    expect(active(tree).key).toBe('gadgets');
    expect(child(tree, 'input').props.value).toBe('Saved draft');
    const ideas = elements(tree, (element) => element.type === 'button' && element.props.className === 'chip' && !element.props['aria-label'] && typeof element.props.children === 'string');
    expect(ideas.length).toBeGreaterThan(0);
    for (const idea of ideas) expect(getContent(lang).productNameIdeas.gadgets).toContain(idea.props.children);
    if (mode === 'hex') {
      expect(child(tree, AmountForm).key).toBe(initialBidKey);
      expect(child(tree, actual.HexBidSummary).props.bid).toBe(315.5);
      expect(child(tree, actual.HexFallbackChoice).props.value).toBe('abandon');
    }
    const choose = elements(tree, (element) => element.type === 'button' && element.key === 'yogurts')[0];
    (choose.props.onClick as () => void)();
    expect(onSectorChange).toHaveBeenCalledWith('yogurts');
    tree = render();
    effects();
    tree = render();
    expect(active(tree).key).toBe('yogurts');
    expect(child(tree, 'input').props.value).toBe('Saved draft');
    if (mode === 'hex') {
      // Another sector on the same cell keeps the same reserve, so the typed bid survives the player's own choice too.
      expect(child(tree, AmountForm).key).toBe(initialBidKey);
      expect(child(tree, actual.HexBidSummary).props.bid).toBe(315.5);
      expect(child(tree, actual.HexFallbackChoice).props.value).toBe('abandon');
    }
  });

  it('shows spectator deposit identity and status immediately without an expanded description', () => {
    const { view } = fixture(lang, 'classic');
    const deposit = mapDeposits(view)[0];
    const html = renderToStaticMarkup(createElement(DepositSheet, { deposit, view, acting: null }));
    expect(html).toContain(deposit.name);
    expect(html).toContain(getContent(lang).commodities[deposit.commodityId].name);
    expect(html).toContain(messages(lang).city.map.depositSheet.free);
    expect(html).not.toContain('<details');
  });

  it('focuses top-band decisions when opened, preserves focus on rerender, and requires a deposit construction click', () => {
    const { view, company } = fixture(lang, 'hex');
    const render = () => HexMapView({ company, onSelect: vi.fn(), goTo: vi.fn() });
    let map = renderMap(render);
    const target = { scrollIntoView: vi.fn(), focus: vi.fn() };
    vi.stubGlobal('document', { querySelector: (selector: string) => selector === '[data-hx-map-form]' ? target : null });
    effects();
    expect(target.focus).not.toHaveBeenCalled();
    const free = view.hexes!.free[0];
    (child(map, HexBoard).props.onSelect as (id: string) => void)(free);
    map = renderMap(render);
    (paletteAction(map, hexReadabilityMessages(lang).buildFactory).props.onClick as () => void)();
    map = renderMap(render);
    effects();
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(target.focus).toHaveBeenCalledTimes(1);
    const headerForm = elements(child(map, MapWorkspace).props.boardHeader as ReactNode, element => element.props['data-hx-map-form'] !== undefined)[0];
    expect(headerForm).toBeDefined();
    expect(elements(child(map, MapWorkspace).props.sheet as ReactNode, element => element.props['data-hx-map-form'] !== undefined)).toHaveLength(0);
    // Ordinary rerenders and reference calculations do not steal focus from form inputs.
    map = renderMap(render);
    effects();
    expect(target.focus).toHaveBeenCalledTimes(1);
    (paletteAction(map, messages(lang).hex.moveHere(company.products[0].name)).props.onClick as () => void)();
    map = renderMap(render);
    effects();
    expect(target.focus).toHaveBeenCalledTimes(2);
    (child(map, HexBoard).props.onSelect as (id: string) => void)(view.hexes!.free[1]);
    map = renderMap(render);
    effects();
    expect(target.focus).toHaveBeenCalledTimes(3);
    const depositHex = HEXES.find((hex) => hex.deposit && view.siteSlots.some((slot) => slot.id === hex.deposit))!;
    (child(map, HexBoard).props.onSelect as (id: string) => void)(depositHex.id);
    map = renderMap(render);
    effects();
    expect(target.focus).toHaveBeenCalledTimes(3);
    expect(child(map, DepositPanel)).toBeUndefined();
    (paletteAction(map, hexReadabilityMessages(lang).buildSubsidiary).props.onClick as () => void)();
    map = renderMap(render);
    effects();
    expect(target.focus).toHaveBeenCalledTimes(4);
    expect(child(map, DepositPanel)).toBeDefined();
  });

  it('scrolls and focuses classic decisions after an ordinary zone click and an in-sheet move click', () => {
    const { view, company } = fixture(lang, 'classic');
    const render = () => MapView({ company, onSelect: vi.fn(), goTo: vi.fn(), onOpenFactory: vi.fn(), frozen: true, onToggleStill: vi.fn() });
    let map = renderMap(render);
    const zoneAria = messages(lang).city.map.openZoneAria(getContent(lang).mapNames.cities.south);
    const open = elements(map, (element) => element.type === 'button' && element.props['aria-label'] === zoneAria)[0];
    (open.props.onClick as () => void)();
    map = renderMap(render);
    let sheet = child(map, ZoneSheet);
    const target = { scrollIntoView: vi.fn(), focus: vi.fn() };
    (sheet.props.formRef as { current: unknown }).current = target;
    effects();
    expect(target.focus).toHaveBeenCalledTimes(1);
    (sheet.props.onMove as (productId: string) => void)(company.products[0].id);
    map = renderMap(render);
    sheet = child(map, ZoneSheet);
    expect(sheet.props.move).toMatchObject({ product: { id: company.products[0].id } });
    effects();
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(target.focus).toHaveBeenCalledTimes(2);
    (sheet.props.onBackToZone as () => void)();
    renderMap(render);
    effects();
    expect(target.focus).toHaveBeenCalledTimes(3);
  });
});

it('keeps new sheet text bilingual and addresses French players without tu', () => {
  const fr = sheetReadabilityMessages('fr');
  const en = sheetReadabilityMessages('en');
  expect(Object.keys(en)).toEqual(Object.keys(fr));
  expect(Object.values(fr).join(' ')).not.toMatch(/\btu\b/i);
});
