import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getContent, getPlayerView, resolveTurn, type Lang } from '@muchomoney/core';
import { sendAction } from '../src/api';
import { AmountForm } from '../src/components/AmountForm';
import { ConfirmModal } from '../src/components/Modal';
import { IndustryPanel } from '../src/screens/game/IndustryPanel';
import type { HexReference } from '../src/screens/game/city/hexModel';
import { getState, setState, type AppState } from '../src/store';
import { industryMessages } from '../src/i18n/industry';
import { fmtFor } from '../src/fmt';
import { hexBidKey } from '../src/screens/game/pendingDecisions';

const hooks = vi.hoisted(() => ({ index: 0, values: {} as Record<number, unknown> }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useEffect: () => {},
  useState: (initial: unknown) => { const index = hooks.index++; return [index in hooks.values ? hooks.values[index] : initial, vi.fn()]; } }));
vi.mock('../src/store', async original => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (s: AppState) => T) => selector(actual.getState()) };
});
vi.mock('../src/api', () => ({ sendAction: vi.fn(async () => ({ ok: true, message: '' })) }));
const saved = getState();
afterEach(() => { setState(saved); vi.mocked(sendAction).mockReset(); });
type Element = ReactElement<Record<string, unknown>>;
function find(node: ReactNode, predicate: (e: Element) => boolean): Element | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (predicate(child)) return child;
    const nested = find(child.props.children as ReactNode, predicate); if (nested) return nested;
  }
}
function fixture(lang: Lang) {
  const game = createGame({ seed: 71, totalTurns: 8, turnSeconds: 0, startYear: 2027, mapMode: 'hex', industryRules: 'network', lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Holding', sectorId: 'gadgets', connected: true, color: '#123456' }]);
  const c = Object.values(game.companies).find(c => c.controllerId === 'human')!; c.cash = 100_000;
  return { game, c };
}
function panel(game: ReturnType<typeof createGame>, companyId: string, hexId: string, mode: 'land' | 'existing') {
  const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.id === companyId)!;
  setState({ lang: game.config.lang, view, lobby: null }); hooks.index = 0; hooks.values = { 0: mode };
  return { view, company, node: IndustryPanel({ view, company, hexId, reference: null }) };
}
function controlledPanel(game: ReturnType<typeof createGame>, companyId: string, hexId: string,
  options: { actionMode: 'land' | 'existing' | 'fresh'; reference?: HexReference; onlySale?: boolean; compact?: boolean; onDone?: () => void;
    state?: Record<number, unknown> }) {
  const view = getPlayerView(game, 'human'), company = view.companies.find(c => c.id === companyId)!;
  const { state = {}, ...props } = options;
  setState({ lang: game.config.lang, view, lobby: null }); hooks.index = 0; hooks.values = state;
  return { view, company, node: IndustryPanel({ view, company, hexId, reference: null, ...props }) };
}
function buyVacant(game: ReturnType<typeof createGame>, companyId: string) {
  const view = getPlayerView(game, 'human'), hexId = view.hexes!.free[0];
  expect(applyAction(game, 'human', { type: 'bidLand', companyId, hexId, bid: view.hexes!.landReserve![hexId] }).ok).toBe(true);
  resolveTurn(game);
  return hexId;
}
describe.each(['fr', 'en'] as const)('land and construction panel (%s)', lang => {
  it('keeps the full standalone form by default', () => {
    const { game, c } = fixture(lang), hexId = getPlayerView(game, 'human').hexes!.free[0];
    const { node } = controlledPanel(game, c.id, hexId, { actionMode: 'existing', reference: { kind: 'product', productId: c.products[0].id } });
    const text = industryMessages(lang), html = renderToStaticMarkup(node);
    expect(find(node, e => e.type === 'h4')!.props.children).toBe(text.title);
    expect(find(node, e => e.type === 'strong' && e.props.children === c.products[0].name)).toBeDefined();
    expect(find(node, e => e.type === 'p' && e.props.children === text.shared)).toBeDefined();
    expect(html).toContain(text.building);
    expect(html).not.toContain('industry-panel-compact');
  });
  it.each(['land', 'existing', 'fresh'] as const)('keeps the %s bid bounds and exact action in the compact palette form', async actionMode => {
    const { game, c } = fixture(lang), hexId = getPlayerView(game, 'human').hexes!.free[0], onDone = vi.fn();
    const reference: HexReference = actionMode === 'fresh' ? { kind: 'launch', sectorId: 'scooters' } : { kind: 'product', productId: c.products[0].id };
    const { node, view } = controlledPanel(game, c.id, hexId, { actionMode, reference, compact: true, onDone, state: { 3: '  Roadrunner  ' } });
    const text = industryMessages(lang), html = renderToStaticMarkup(node), form = find(node, e => e.type === AmountForm)!;
    const cost = actionMode === 'land' ? 0 : view.sectors.find(s => s.id === (actionMode === 'fresh' ? 'scooters' : c.products[0].sectorId))!.launchCost;
    const reserve = actionMode === 'land' ? view.hexes!.landReserve![hexId] : view.hexes!.reserve[hexId];
    expect(html).toContain('industry-panel-compact');
    expect(find(node, e => e.type === 'h4')).toBeUndefined();
    expect(find(node, e => e.type === 'div' && e.props.className === 'seg wrap')).toBeUndefined();
    expect(find(node, e => e.type === 'strong' && e.props.children === (actionMode === 'fresh' ? getContent(lang).sectors.scooters.name : c.products[0].name))).toBeUndefined();
    const costs = find(node, e => typeof e.props.className === 'string' && e.props.className.split(' ').includes('hx-action-costs'))!;
    expect(costs).toBeDefined();
    expect(renderToStaticMarkup(costs)).toContain(fmtFor(lang).money(reserve));
    if (cost) expect(renderToStaticMarkup(costs)).toContain(fmtFor(lang).money(cost));
    const rules = find(node, e => e.type === 'details' && typeof e.props.className === 'string' && e.props.className.split(' ').includes('hx-action-rules'))!;
    expect(rules).toBeDefined();
    expect(rules.props.open).not.toBe(true);
    expect(find(rules, e => e.type === 'summary')).toBeDefined();
    expect(renderToStaticMarkup(rules)).toContain(actionMode === 'land' ? text.landRule : text.building);
    expect(!!find(node, e => e.type === 'input')).toBe(actionMode === 'fresh');
    expect(form.props).toMatchObject({ min: reserve, initial: reserve, max: c.cash - cost, disabledReason: null });
    expect((form.props.info as ((amount: number) => string) | undefined)?.(reserve + 100)).toBe(actionMode === 'land' ? text.upkeepMax(fmtFor(lang).money(.05 * (reserve + 100))) : undefined);
    const bid = reserve + 25;
    await (form.props.onSubmit as (bid: number) => Promise<unknown>)(bid);
    expect(sendAction).toHaveBeenCalledExactlyOnceWith(actionMode === 'land' ? { type: 'bidLand', companyId: c.id, hexId, bid }
      : actionMode === 'existing' ? { type: 'buildFactory', companyId: c.id, productId: c.products[0].id, hexId, bid }
      : { type: 'launchProduct', companyId: c.id, sectorId: 'scooters', name: 'Roadrunner', hexId, bid, fallback: 'abandon' });
    expect(onDone).toHaveBeenCalledOnce();
  });
  it('keeps name validation in the compact new-product form', async () => {
    const { game, c } = fixture(lang), hexId = getPlayerView(game, 'human').hexes!.free[0], onDone = vi.fn();
    const { node } = controlledPanel(game, c.id, hexId, { actionMode: 'fresh', reference: { kind: 'launch', sectorId: 'scooters' }, compact: true, onDone });
    expect(find(node, e => e.type === 'input')).toBeDefined();
    const form = find(node, e => e.type === AmountForm)!;
    expect(form.props.disabledReason).toBe(industryMessages(lang).needName);
    expect(await (form.props.onSubmit as (bid: number) => Promise<unknown>)(500)).toEqual({ ok: false });
    expect(sendAction).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
  it('builds on owned land from the compact form without repeating ownership or bidding again', async () => {
    const { game, c } = fixture(lang), hexId = buyVacant(game, c.id), onDone = vi.fn();
    const { node } = controlledPanel(game, c.id, hexId, { actionMode: 'existing', reference: { kind: 'product', productId: c.products[0].id }, compact: true, onDone });
    const text = industryMessages(lang);
    expect(find(node, e => e.type === 'h4')).toBeUndefined();
    const rules = find(node, e => e.type === 'details')!;
    expect(renderToStaticMarkup(rules)).toContain(text.owned);
    expect(renderToStaticMarkup(node).replace(renderToStaticMarkup(rules), '')).not.toContain(text.owned);
    expect(find(node, e => e.type === AmountForm)).toBeUndefined();
    const button = find(node, e => e.type === 'button' && e.props.children === text.build)!;
    expect(button.props.disabled).toBe(false);
    (button.props.onClick as () => void)();
    await Promise.resolve();
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'buildFactory', companyId: c.id, productId: c.products[0].id, hexId });
    expect(onDone).toHaveBeenCalledOnce();
  });
  it('keeps two site bids for the same product distinct in pending decisions', () => {
    const { game, c } = fixture(lang), view = getPlayerView(game, 'human');
    for (const hexId of view.hexes!.free.slice(0, 2)) expect(applyAction(game, 'human', { type: 'buildFactory', companyId: c.id, productId: c.products[0].id, hexId, bid: view.hexes!.reserve[hexId] }).ok).toBe(true);
    const bids = getPlayerView(game, 'human').self!.hexBids!;
    expect(bids).toHaveLength(2); expect(new Set(bids.map(hexBidKey)).size).toBe(2);
  });
  it('quotes the personal land minimum and upkeep, and sends a bare-land bid', async () => {
    const { game, c } = fixture(lang), hexId = getPlayerView(game, 'human').hexes!.free[0];
    const { node, view } = panel(game, c.id, hexId, 'land');
    const form = find(node, e => e.type === AmountForm)!;
    expect(form.props.min).toBe(view.hexes!.landReserve![hexId]); expect(form.props.max).toBe(c.cash);
    await (form.props.onSubmit as (bid: number) => Promise<unknown>)(view.hexes!.landReserve![hexId]);
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'bidLand', companyId: c.id, hexId, bid: view.hexes!.landReserve![hexId] });
    expect(renderToStaticMarkup(node)).toContain(industryMessages(lang).landRule);
  });
  it('reserves construction money separately when bidding for a second factory', async () => {
    const { game, c } = fixture(lang), hexId = getPlayerView(game, 'human').hexes!.free[0];
    const { node, view } = panel(game, c.id, hexId, 'existing');
    const form = find(node, e => e.type === AmountForm)!;
    expect(form.props.max).toBe(c.cash - view.sectors.find(s => s.id === c.products[0].sectorId)!.launchCost);
    await (form.props.onSubmit as (bid: number) => Promise<unknown>)(300);
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'buildFactory', companyId: c.id, productId: c.products[0].id, hexId, bid: 300 });
  });
  it('builds on an owned vacant parcel without a new land bid', async () => {
    const { game, c } = fixture(lang), initial = getPlayerView(game, 'human'), hexId = initial.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'bidLand', companyId: c.id, hexId, bid: initial.hexes!.landReserve![hexId] }).ok).toBe(true);
    resolveTurn(game);
    // Ownership changes while the sheet stays mounted after a successful land bid.
    const { node } = panel(game, c.id, hexId, 'land');
    expect(find(node, e => e.type === AmountForm)).toBeUndefined();
    const button = find(node, e => e.type === 'button' && e.props.children === industryMessages(lang).build)!;
    await (button.props.onClick as () => Promise<unknown>)();
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'buildFactory', companyId: c.id, productId: c.products[0].id, hexId });
  });
  it('withdraws a pending bare-land order by parcel', async () => {
    const { game, c } = fixture(lang), view = getPlayerView(game, 'human'), hexId = view.hexes!.free[0];
    applyAction(game, 'human', { type: 'bidLand', companyId: c.id, hexId, bid: view.hexes!.landReserve![hexId] });
    const { node } = panel(game, c.id, hexId, 'land');
    const cancel = find(node, e => e.type === 'button')!;
    await (cancel.props.onClick as () => Promise<unknown>)();
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'cancelHexBid', companyId: c.id, hexId });
  });
  it('builds the existing product selected by the palette even when local selection still points to another product', async () => {
    const { game, c } = fixture(lang), hexId = getPlayerView(game, 'human').hexes!.free[0];
    const second = { ...c.products[0], id: 'second-profile', name: 'Second profile', factoryProductId: undefined };
    c.products.push(second);
    const { node } = controlledPanel(game, c.id, hexId, { actionMode: 'existing', reference: { kind: 'product', productId: second.id },
      state: { 0: 'land', 1: c.products[0].id } });
    const html = renderToStaticMarkup(node);
    expect(html).toContain(second.name);
    expect(find(node, e => e.type === 'div' && e.props.className === 'seg wrap')).toBeUndefined();
    await (find(node, e => e.type === AmountForm)!.props.onSubmit as (bid: number) => Promise<unknown>)(300);
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'buildFactory', companyId: c.id, productId: second.id, hexId, bid: 300 });
  });
  it('does not fall back to another product when the selected profile is unavailable to the acting company', async () => {
    const { game, c } = fixture(lang), hexId = getPlayerView(game, 'human').hexes!.free[0], onDone = vi.fn();
    const { node } = controlledPanel(game, c.id, hexId, { actionMode: 'existing', reference: { kind: 'product', productId: 'foreign-profile' }, onDone });
    const form = find(node, e => e.type === AmountForm)!;
    expect(form.props.disabledReason).toBe(industryMessages(lang).noProduct);
    expect(await (form.props.onSubmit as (bid: number) => Promise<unknown>)(300)).toEqual({ ok: false });
    expect(sendAction).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
  it('uses the palette sector and only asks for the new product name', async () => {
    const { game, c } = fixture(lang), hexId = getPlayerView(game, 'human').hexes!.free[0];
    const { node, view } = controlledPanel(game, c.id, hexId, { actionMode: 'fresh', reference: { kind: 'launch', sectorId: 'scooters' },
      state: { 3: '  Roadrunner  ' } });
    const form = find(node, e => e.type === AmountForm)!;
    expect(form.props.max).toBe(c.cash - view.sectors.find(s => s.id === 'scooters')!.launchCost);
    expect(find(node, e => e.type === 'div' && e.props.className === 'seg wrap')).toBeUndefined();
    expect(renderToStaticMarkup(node)).toContain(industryMessages(lang).name);
    await (form.props.onSubmit as (bid: number) => Promise<unknown>)(500);
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'launchProduct', companyId: c.id, sectorId: 'scooters', name: 'Roadrunner', hexId, bid: 500, fallback: 'abandon' });
  });
  it.each([true, false])('closes the selected-cell form only after a successful action (success=%s)', async success => {
    const { game, c } = fixture(lang), hexId = getPlayerView(game, 'human').hexes!.free[0], onDone = vi.fn();
    vi.mocked(sendAction).mockResolvedValueOnce({ ok: success, message: success ? '' : 'Denied' });
    const { node, view } = controlledPanel(game, c.id, hexId, { actionMode: 'land', onDone });
    const result = await (find(node, e => e.type === AmountForm)!.props.onSubmit as (bid: number) => Promise<unknown>)(view.hexes!.landReserve![hexId]);
    expect(result).toEqual({ ok: success, message: success ? '' : 'Denied' });
    expect(onDone).toHaveBeenCalledTimes(success ? 1 : 0);
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'bidLand', companyId: c.id, hexId, bid: view.hexes!.landReserve![hexId] });
  });
  it('closes construction on an owned parcel after its action succeeds', async () => {
    const { game, c } = fixture(lang), hexId = buyVacant(game, c.id), onDone = vi.fn();
    const { node } = controlledPanel(game, c.id, hexId, { actionMode: 'existing', reference: { kind: 'product', productId: c.products[0].id }, onDone });
    const button = find(node, e => e.type === 'button' && e.props.children === industryMessages(lang).build)!;
    await (button.props.onClick as () => Promise<unknown>)();
    // The button deliberately discards the request's promise, so wait for the asynchronous success callback.
    await Promise.resolve();
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'buildFactory', companyId: c.id, productId: c.products[0].id, hexId });
    expect(onDone).toHaveBeenCalledOnce();
  });
  it('shows only the vacant-land sale and upkeep when sale is requested', () => {
    const { game, c } = fixture(lang), hexId = buyVacant(game, c.id);
    const { node, company } = controlledPanel(game, c.id, hexId, { actionMode: 'fresh', onlySale: true });
    const text = industryMessages(lang), html = renderToStaticMarkup(node);
    expect(find(node, e => e.type === AmountForm)).toBeUndefined();
    expect(find(node, e => e.type === 'input')).toBeUndefined();
    expect(find(node, e => e.type === 'button' && e.props.children === text.build)).toBeUndefined();
    expect(find(node, e => e.type === 'button')).toBeDefined();
    expect(html).toContain(text.sell);
    expect(html).not.toContain(text.needName);
    expect(company.land!.find(p => p.hexId === hexId)?.vacant).toBe(true);
  });
  it.each([true, false])('closes the sale form only after successful confirmation (success=%s)', async success => {
    const { game, c } = fixture(lang), hexId = buyVacant(game, c.id), onDone = vi.fn();
    vi.mocked(sendAction).mockResolvedValueOnce({ ok: success, message: success ? '' : 'Denied' });
    const { node } = controlledPanel(game, c.id, hexId, { actionMode: 'existing', onlySale: true, onDone, state: { 4: true } });
    const confirm = find(node, e => e.type === ConfirmModal)!;
    await (confirm.props.onConfirm as () => Promise<unknown>)();
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'sellLand', companyId: c.id, hexId });
    expect(onDone).toHaveBeenCalledTimes(success ? 1 : 0);
  });
});
