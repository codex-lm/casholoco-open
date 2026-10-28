import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMODITIES, SITE_OPENING_COST_MULT, applyAction, createGame, getPlayerView, resolveTurn, type Lang, type PlayerView } from '@muchomoney/core';
import { sendAction } from '../src/api';
import { AmountForm } from '../src/components/AmountForm';
import { ConfirmModal } from '../src/components/Modal';
import { messages } from '../src/i18n';
import { HexBidSummary, HexFallbackChoice, HexLaunchForm } from '../src/screens/game/LaunchForms';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { DepositPanel, DepositFooter, SiteBidFooter, SiteSheet } from '../src/screens/game/DepositPanel';
import { getState, setState, type AppState } from '../src/store';

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(), useEffect: () => {},
  useState: (initial: unknown) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [hooks.values[i], (next: unknown) => { hooks.values[i] = typeof next === 'function' ? (next as (value: unknown) => unknown)(hooks.values[i]) : next; }];
  } }));
vi.mock('../src/hooks/useGame', () => ({ useGame: () => ({ view: data.view! }) }));
vi.mock('../src/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../src/store', async original => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (s: AppState) => T) => selector(actual.getState()) };
});
vi.mock('../src/api', () => ({ sendAction: vi.fn(async () => ({ ok: true, message: '' })) }));
const saved = getState();
afterEach(() => { setState(saved); hooks.values = []; hooks.cursor = 0; data.view = null; vi.mocked(sendAction).mockReset(); });
type Element = ReactElement<Record<string, unknown>>;
function find(node: ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (predicate(child)) return child;
    const match = find(child.props.children as ReactNode, predicate); if (match) return match;
  }
}
const element = (node: ReactNode, type: unknown) => find(node, e => e.type === type);
const render = <T,>(component: () => T): T => { hooks.cursor = 0; return component(); };
function fixture(lang: Lang) {
  const game = createGame({ seed: 77, totalTurns: 8, turnSeconds: 0, startYear: 2027, mapMode: 'hex', lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Holding', sectorId: 'gadgets', connected: true, color: '#123456' }]);
  const company = Object.values(game.companies).find(c => c.controllerId === 'human')!; company.cash = 100_000;
  return { game, company };
}
function useView(game: ReturnType<typeof createGame>) {
  const view = getPlayerView(game, 'human'); data.view = view; setState({ lang: game.config.lang, view, lobby: null });
  return { view, company: view.companies.find(c => c.private)! };
}
type Form = { min: number; max: number; initial: number; disabledReason: string | null; onSubmit: (bid: number) => Promise<{ ok: boolean }> };
const amount = (node: ReactNode) => element(node, AmountForm)!.props as unknown as Form;

describe.each(['fr', 'en'] as const)('compact map action controls (%s)', lang => {
  it.each([false, true])('preserves launch costs, minimum bid, fallback and accepted-action callback (compact=%s)', async compact => {
    const { game } = fixture(lang), { view, company } = useView(game), hexId = view.hexes!.free[0], onLaunched = vi.fn();
    const draw = () => render(() => HexLaunchForm({ company, hexId, trackedSector: 'scooters', compact, onLaunched }));
    let node = draw();
    expect(element(node, HexBidSummary) !== undefined).toBe(!compact);
    expect(amount(node).disabledReason).toBe(messages(lang).hex.formNeedName);
    expect(await amount(node).onSubmit(300)).toEqual({ ok: false });
    expect(sendAction).not.toHaveBeenCalled();
    (element(node, 'input')!.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: '  New wheels  ' } });
    (element(node, HexFallbackChoice)!.props.onChange as (fallback: string) => void)('abandon');
    node = draw();
    const form = amount(node);
    expect(form.min).toBe(view.hexes!.reserve[hexId]); expect(form.initial).toBe(form.min);
    expect(form.max).toBe(company.cash - view.sectors.find(s => s.id === 'scooters')!.launchCost);
    expect(form.disabledReason).toBeNull();
    await form.onSubmit(300);
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'launchProduct', companyId: company.id, sectorId: 'scooters', name: 'New wheels', hexId, bid: 300, fallback: 'abandon' });
    expect(onLaunched).toHaveBeenCalledOnce();
  });

  it.each([false, true])('preserves ordinary move costs and blocks the last quarter (compact=%s)', async compact => {
    const { game } = fixture(lang), { view, company } = useView(game), product = company.products[0], hexId = view.hexes!.free[0], onDone = vi.fn();
    const draw = () => render(() => HexMoveForm({ company, product, hexId, compact, onDone }));
    let node = draw();
    expect(element(node, HexBidSummary) !== undefined).toBe(!compact);
    expect(amount(node).min).toBe(view.hexes!.reserve[hexId]);
    expect(amount(node).max).toBe(company.cash - product.private!.hexes!.moveCost);
    await amount(node).onSubmit(300);
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'moveFactory', companyId: company.id, productId: product.id, hexId, bid: 300 });
    expect(onDone).toHaveBeenCalledOnce();
    vi.mocked(sendAction).mockClear(); onDone.mockClear();
    view.turn = view.config.totalTurns;
    node = draw();
    expect(amount(node).disabledReason).toBe(messages(lang).hex.formLastTurn);
    expect(await amount(node).onSubmit(300)).toEqual({ ok: false });
    expect(sendAction).not.toHaveBeenCalled(); expect(onDone).not.toHaveBeenCalled();
  });

  it.each([false, true])('retains startup fallback and pending-bid withdrawal (compact=%s)', async compact => {
    const { game, company: previous } = fixture(lang);
    previous.status = 'bankrupt'; previous.controllerId = null; previous.products = [];
    game.players.human.cash = 1e6; game.turn = 2;
    const before = getPlayerView(game, 'human'), hexId = before.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'foundStartup', name: 'Comeback', sectorId: 'crypto', investment: 30_000, hexId, bid: before.hexes!.reserve[hexId], fallback: 'abandon' }).ok).toBe(true);
    const { company } = useView(game), product = company.products[0];
    const node = render(() => HexMoveForm({ company, product, hexId, compact }));
    expect(element(node, HexFallbackChoice)!.props).toMatchObject({ value: 'abandon', incubator: true });
    await amount(node).onSubmit(400);
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'moveFactory', companyId: company.id, productId: product.id, hexId, bid: 400, fallback: 'abandon' });
    const withdraw = find(node, e => e.type === 'button' && e.props.children === messages(lang).hex.formWithdraw)!;
    (withdraw.props.onClick as () => void)();
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'cancelHexBid', companyId: company.id, productId: product.id });
  });

  it.each([false, true])('keeps subsidiary minimums, cash limits, submission and withdrawal (compact=%s)', async compact => {
    const { game, company: engineCompany } = fixture(lang), before = getPlayerView(game, 'human');
    const slot = before.siteSlots.find(s => s.id === 'sugar-3')!, reserve = COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT;
    expect(applyAction(game, 'human', { type: 'bidSite', companyId: engineCompany.id, slotId: slot.id, amount: reserve + 20 }).ok).toBe(true);
    const { view, company } = useView(game), target = view.siteSlots.find(s => s.id === slot.id)!;
    const node = render(() => SiteBidFooter({ company, slot: target, desktop: true, compact }));
    expect(amount(node)).toMatchObject({ min: reserve, max: company.cash, initial: reserve + 20, disabledReason: null });
    await amount(node).onSubmit(reserve + 30);
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'bidSite', companyId: company.id, slotId: target.id, amount: reserve + 30 });
    const withdraw = find(node, e => e.type === 'button' && e.props['aria-label'] === messages(lang).sites.withdrawAria(messages(lang).sites.names.sugar))!;
    (withdraw.props.onClick as () => void)();
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'cancelSiteBid', companyId: company.id, commodityId: 'sugar' });
    company.cash = reserve - 1;
    const blocked = render(() => SiteBidFooter({ company, slot: target, desktop: true, compact }));
    expect(amount(blocked).disabledReason).toBe(messages(lang).sites.noCash);
  });

  it('routes compact deposits to action-only controls and keeps managed-site confirmations', () => {
    const { game, company: engineCompany } = fixture(lang), before = getPlayerView(game, 'human');
    const slot = before.siteSlots.find(s => s.id === 'sugar-3')!;
    let { view, company } = useView(game);
    const free = render(() => DepositPanel({ company, slot, compact: true }));
    expect(element(free, DepositFooter)!.props.compact).toBe(true); expect(element(free, SiteSheet)).toBeUndefined();
    expect(applyAction(game, 'human', { type: 'bidSite', companyId: engineCompany.id, slotId: slot.id, amount: 10_000 }).ok).toBe(true);
    resolveTurn(game);
    ({ view, company } = useView(game));
    const owned = view.siteSlots.find(s => s.id === slot.id)!;
    const panel = render(() => DepositPanel({ company, slot: owned, compact: true }));
    expect(element(panel, SiteSheet)!.props).toMatchObject({ compact: true, hideHead: true, hideDecision: true });
    hooks.values = [];
    const draw = () => render(() => SiteSheet({ company, slot: owned, compact: true }));
    let node = draw();
    expect(element(node, 'table')).toBeUndefined();
    const sleep = find(node, e => e.type === 'button' && e.props['aria-label'] === messages(lang).sites.sleepAria(messages(lang).sites.names.sugar))!;
    (sleep.props.onClick as () => void)(); node = draw();
    (element(node, ConfirmModal)!.props.onConfirm as () => void)();
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'setSiteDormant', companyId: company.id, commodityId: 'sugar', dormant: true });
    const readOnly = render(() => SiteSheet({ company, slot: owned, compact: true, readOnly: true }));
    expect(element(readOnly, 'button')).toBeUndefined(); expect(element(readOnly, ConfirmModal)).toBeUndefined();
  });
});
