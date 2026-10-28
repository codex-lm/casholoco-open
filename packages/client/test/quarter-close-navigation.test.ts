/** Real recap views and event handlers, with a stable state slot across the recap/report modal swap. */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, resolveTurn, type Lang, type PlayerView } from '@muchomoney/core';
import { Modal } from '../src/components/Modal';
import { quarterCloseMessages } from '../src/i18n/quarterClose';
import { navigationDetailsMessages } from '../src/i18n/navigationDetails';
import { QuarterClose } from '../src/screens/game/QuarterClose';
import { ReportTable } from '../src/screens/game/ReportTable';
import { getState, setState, type AppState } from '../src/store';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, events: [] as string[] }));
const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks.values[index], (value: unknown) => {
        hooks.events.push('state');
        hooks.values[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(hooks.values[index]) : value;
      }];
    },
    useEffect: () => {},
  };
});
vi.mock('../src/hooks/useGame', () => ({ useGame: () => ({ view: data.view! }) }));
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  hooks.events = [];
});
afterEach(() => {
  setState(initial);
  data.view = null;
});

function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children as ReactNode, predicate)];
}
function button(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean = () => true) {
  const [result] = elements(node, (element) => element.type === 'button' && predicate(element));
  expect(result).toBeDefined();
  return result;
}
function click(element: ReactElement<Record<string, unknown>>) {
  (element.props.onClick as () => void)();
}

function fixture(lang: Lang) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: '#654321' },
  ]);
  resolveTurn(game);
  const view = getPlayerView(game, 'human');
  const own = view.companies.find((company) => company.controllerId === 'human')!;
  const rival = view.companies.find((company) => company.controllerId === 'rival')!;
  const recap = view.self!.closeRecap!;
  const company = recap.companies!.find((company) => company.companyId === own.id)!;
  company.fineCauses = [{ cause: 'scandal', amount: 1200, scandalBefore: 64, scandalAfter: 15, reputationBefore: 1, reputationAfter: .85 }];
  recap.settlements = {
    offers: [{ id: 'offer', kind: 'shares', turn: 1, fromId: 'human', toId: 'rival', companyId: own.id, shares: 10, price: 1, side: 'sell', status: 'accepted' }],
    contracts: [{ id: 'contract', sellerCompanyId: own.id, buyerCompanyId: rival.id, commodityId: 'chips', lots: 10, price: 5, turnsLeft: 0, lastDelivered: 3, lastPenalty: 70, outcome: 'partial' }],
    events: [{ event: { type: 'merger', actorId: 'human' }, companyIds: [own.id, rival.id], companyNames: [own.name, rival.name], journalTurn: 1 }],
  };
  const props: Parameters<typeof QuarterClose>[0] = {
    open: true,
    onClose: vi.fn(() => { hooks.events.push('close'); }),
    disableAutoOpen: false,
    onDisableAutoOpen: vi.fn(),
    openIssue: vi.fn(),
    openFactory: vi.fn(),
    openMapFor: vi.fn(),
    openStock: vi.fn(),
    openCompany: vi.fn(),
    goTo: vi.fn(),
  };
  data.view = view;
  setState({ lang, view, lobby: null });
  const render = (overrides: Partial<typeof props> = {}) => {
    hooks.cursor = 0;
    return QuarterClose({ ...props, ...overrides });
  };
  return { view, own, rival, recap, company, props, render, text: quarterCloseMessages(lang) };
}

/** Every routed action must dismiss the report before the destination callback changes page state. */
function closedBefore(props: Parameters<typeof QuarterClose>[0], action: unknown, index = 0) {
  const close = vi.mocked(props.onClose);
  const callback = vi.mocked(action as (...args: unknown[]) => void);
  expect(close.mock.invocationCallOrder[index]).toBeLessThan(callback.mock.invocationCallOrder[index]);
}

describe.each(['fr', 'en'] as const)('quarter-close destinations (%s)', (lang) => {
  it('keeps the recap mounted beneath the report, returns explicitly, and prefers frozen accounts', () => {
    const { own, company, props, render, text } = fixture(lang);
    const frozen = company.report!;
    const original = own.reports.find((report) => report.turn === frozen.turn)!;
    own.reports = [{ ...original, netProfit: 987654 }, { ...original, turn: frozen.turn + 1, netProfit: 456789 }];
    const node = render();
    click(button(node, (element) => element.props['aria-label'] === text.reportAria(company.companyName)));
    expect(hooks.events).toEqual(['state']);
    expect(props.onClose).not.toHaveBeenCalled();
    // The original dialog remains mounted, retaining its scroll and the report button's focus return.
    const reportNode = render();
    expect(elements(reportNode, (element) => 'data-quarter-close' in element.props)).toHaveLength(1);
    const [, modal] = elements(reportNode, (element) => element.type === Modal);
    const [table] = elements(reportNode, (element) => element.type === ReportTable);
    expect(elements(reportNode, (element) => element.type === Modal)).toHaveLength(2);
    expect(modal.props.title).toContain(company.companyName);
    expect(table.props.reports).toEqual([frozen]);
    expect((table.props.reports as unknown[])[0]).toBe(frozen);
    expect(own.reports[0].netProfit).toBe(987654);
    const back = button(reportNode, element => element.props.className === 'btn ghost quarter-close-report-back');
    expect(back.props.children).toContain(navigationDetailsMessages(lang).backToRecap);
    click(back);
    expect(elements(render(), element => element.type === ReportTable)).toHaveLength(0);
    expect(elements(render(), element => element.type === Modal)).toHaveLength(1);
    expect(props.onClose).not.toHaveBeenCalled();
    click(button(render(), element => element.props['aria-label'] === text.reportAria(company.companyName)));
    const [, reopened] = elements(render(), element => element.type === Modal);
    (reopened.props.onClose as () => void)();
    expect(elements(render(), element => element.type === Modal)).toHaveLength(1);
    expect(elements(render({ open: false }), (element) => element.type === Modal)).toHaveLength(0);
  });

  it('closes before opening the exact product card', () => {
    const { own, company, props, render, text } = fixture(lang);
    const product = company.report!.products[0];
    click(button(render(), (element) => element.props['aria-label'] === text.productAria(product.name)));
    expect(props.openFactory).toHaveBeenCalledExactlyOnceWith(own.id, product.productId);
    closedBefore(props, props.openFactory);
  });

  it('routes both the holding and the company share-price line to that exact market row, after closing', () => {
    const { own, props, render, text } = fixture(lang);
    const node = render();
    const [holdings] = elements(node, (element) => 'data-recap-holdings' in element.props);
    const [company] = elements(node, (element) => element.type === 'article' && element.props.className === 'quarter-close-company');
    const market = (element: ReactElement<Record<string, unknown>>) => element.props['aria-label'] === text.stockMarketAria(own.name);
    click(button(holdings, market));
    click(button(company, market));
    expect(props.openStock).toHaveBeenCalledTimes(2);
    expect(vi.mocked(props.openStock!).mock.calls).toEqual([[own.id], [own.id]]);
    closedBefore(props, props.openStock, 0);
    closedBefore(props, props.openStock, 1);
  });

  it('routes a fine to management of its exact company after closing', () => {
    const { own, props, render, text } = fixture(lang);
    const [fine] = elements(render(), (element) => element.props['data-recap-fine'] === 'scandal');
    const manage = button(fine, (element) => element.props.children === text.companyAction);
    click(manage);
    expect(props.openCompany).toHaveBeenCalledExactlyOnceWith(own.id);
    closedBefore(props, props.openCompany);
  });

  it('routes offers/contracts to deals and settlement events to their saved newspaper turn, after closing', () => {
    const { recap, props, render, text } = fixture(lang);
    const node = render();
    const [offer] = elements(node, (element) => element.props['data-recap-offer'] === 'accepted');
    const [contract] = elements(node, (element) => element.props['data-recap-contract'] === 'partial');
    const [event] = elements(node, (element) => element.props['data-recap-event'] === 'merger');
    click(button(offer, (element) => element.props.children === text.deals));
    click(button(contract, (element) => element.props.children === text.deals));
    expect(vi.mocked(props.goTo!).mock.calls).toEqual([['deals'], ['deals']]);
    closedBefore(props, props.goTo, 0);
    closedBefore(props, props.goTo, 1);
    click(button(event, (element) => element.props.children === text.issue));
    expect(props.openIssue).toHaveBeenCalledExactlyOnceWith(recap.settlements!.events[0].journalTurn);
    expect(vi.mocked(props.onClose).mock.invocationCallOrder[2]).toBeLessThan(vi.mocked(props.openIssue).mock.invocationCallOrder[0]);
  });

  it('forwards both checkbox boolean states without dismissing the report', () => {
    const { props, render } = fixture(lang);
    let [input] = elements(render(), (element) => element.type === 'input' && element.props.type === 'checkbox');
    expect(input.props.checked).toBe(false);
    (input.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    [input] = elements(render({ disableAutoOpen: true }), (element) => element.type === 'input' && element.props.type === 'checkbox');
    expect(input.props.checked).toBe(true);
    (input.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    expect(vi.mocked(props.onDisableAutoOpen).mock.calls).toEqual([[true], [false]]);
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
