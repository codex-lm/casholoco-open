import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SECTORS, applyAction, createGame, getPlayerView, hexPlaceLabel,
  type CompanyView, type Lang, type PlayerView,
} from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { type GameData } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { getState, setState, type AppState } from '../src/store';
import { PendingDecisionItem } from '../src/screens/game/PendingDecisionItem';
import { PendingDecisionsButton, PendingDecisionsPanel } from '../src/screens/game/PendingDecisionsButton';
import { pendingDecisions } from '../src/screens/game/pendingDecisions';

/** SSR for markup, real component handlers and socket payloads for interactions. The hook
 * harness runs effects and their cleanup, so Escape/outside-click tests exercise listeners. */
interface EffectSlot { deps?: readonly unknown[]; cleanup?: () => void }
const hooks = vi.hoisted(() => ({
  cursor: 0, values: [] as unknown[], effects: new Map<number, EffectSlot>(),
  scheduled: new Map<number, { effect: () => void | (() => void); deps?: readonly unknown[] }>(),
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks.values[i], (next: unknown) => {
        hooks.values[i] = typeof next === 'function' ? (next as (value: unknown) => unknown)(hooks.values[i]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const i = hooks.cursor++;
      if (!(i in hooks.values)) hooks.values[i] = { current: initial };
      return hooks.values[i];
    },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const i = hooks.cursor++;
      const previous = hooks.effects.get(i);
      if (!previous || !deps || !previous.deps || deps.some((value, j) => !Object.is(value, previous.deps![j]))) {
        hooks.scheduled.set(i, { effect, deps });
      }
    },
    useId: () => `pending-test-${hooks.cursor++}`,
    useMemo: (make: () => unknown) => make(),
  };
});
const transport = vi.hoisted(() => ({ emit: vi.fn(), connected: true }));
// Preserve the tested action boundary while replacing the former network transport.
vi.mock('../src/solo/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/solo/runtime')>();
  return {
    ...actual,
    applySoloAction: (action: import('@muchomoney/core').Action, turn?: number) =>
      new Promise<import('@muchomoney/core').ActionResult>((resolve) => transport.emit('game:action', turn === undefined ? { action } : { action, turn }, resolve)),
    advanceSoloTurn: (turn?: number) => {
      transport.emit('game:ready', turn === undefined ? { ready: true } : { ready: true, turn });
      return { ok: true, message: 'OK' };
    },
  };
});
const gameData = vi.hoisted(() => ({ current: null as GameData | null }));
vi.mock('../src/hooks/useGame', () => ({ useGame: () => gameData.current! }));
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(select: (state: AppState) => T): T => select(actual.getState()) };
});

const initial = getState();
function resetHooks() {
  for (const slot of hooks.effects.values()) slot.cleanup?.();
  hooks.cursor = 0; hooks.values = []; hooks.effects.clear(); hooks.scheduled.clear();
}
function flushEffects() {
  for (const [i, next] of hooks.scheduled) {
    hooks.effects.get(i)?.cleanup?.();
    const cleanup = next.effect();
    hooks.effects.set(i, { deps: next.deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined });
  }
  hooks.scheduled.clear();
}
beforeEach(() => {
  resetHooks();
  vi.stubGlobal('window', { setTimeout, clearTimeout, innerWidth: 1280 });
  transport.emit.mockReset();
  transport.emit.mockImplementation((_event: string, _payload: unknown, ack?: (reply: unknown) => void) => ack?.({ ok: true, message: '' }));
});
afterEach(() => { resetHooks(); setState(initial); gameData.current = null; vi.unstubAllGlobals(); });

const escaped = (value: string) => renderToStaticMarkup(createElement(Fragment, null, value));
function setup(view: PlayerView, lang: Lang) {
  resetHooks();
  const playersById = new Map(view.players.map((player) => [player.id, player]));
  const companiesById = new Map(view.companies.map((company) => [company.id, company]));
  const sectorsById = new Map(view.sectors.map((sector) => [sector.id, sector]));
  gameData.current = {
    view, me: playersById.get(view.you)!, playersById, companiesById, sectorsById,
    myCompanies: view.companies.filter((company) => company.controllerId === view.you && company.status === 'active'),
    playerName: (id) => playersById.get(id ?? '')?.name ?? messages(lang).common.unknown,
    refPrice: (sectorId) => sectorsById.get(sectorId)?.refPrice ?? SECTORS[sectorId].refPrice,
  };
  setState({ ...initial, lang, view, lobby: null, session: { roomCode: 'TEST', playerId: view.you, token: 'test-token' }, toasts: [] });
}
function baseGame(lang: Lang, mapMode: 'hex' | 'classic' = 'hex') {
  const game = createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode, terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Rival', sectorId: 'gadgets', connected: true, color: '#abcdef' },
  ]);
  const own = Object.values(game.companies).find((company) => company.controllerId === 'human')!;
  const rival = Object.values(game.companies).find((company) => company.controllerId === 'rival')!;
  own.cash = rival.cash = 100_000;
  return { game, own, rival };
}
function pendingFixture(lang: Lang) {
  const { game, own, rival } = baseGame(lang);
  const before = getPlayerView(game, 'human');
  const [moveCell, launchCell, startupCell] = before.hexes!.free;
  expect(applyAction(game, 'human', { type: 'moveFactory', companyId: own.id, productId: own.products[0].id,
    hexId: moveCell, bid: before.hexes!.reserve[moveCell] }).ok).toBe(true);
  expect(applyAction(game, 'human', { type: 'launchProduct', companyId: own.id, sectorId: 'yogurts', name: 'New Product',
    hexId: launchCell, bid: before.hexes!.reserve[launchCell], fallback: 'nearest' }).ok).toBe(true);
  const view = getPlayerView(game, 'human');
  const mine = view.companies.find((company) => company.id === own.id)!;
  const second: CompanyView = { ...structuredClone(mine), id: 'second-owned', name: 'Second Holding', cash: 35000,
    products: [{ ...structuredClone(mine.products[0]), id: 'incubator-product', name: 'Incubator Product', hexId: undefined, incubator: true }] };
  second.private!.launchProjects = []; second.private!.pendingHexCommitment = 875;
  Object.assign(second.private!.closePlan!, { cash: second.cash, bids: 875, bidsCovered: 875 });
  view.companies.push(second);
  view.self!.hexBids!.push({ kind: 'startup', companyId: second.id, playerId: 'human', productId: second.products[0].id,
    hexId: startupCell, amount: 875, turn: view.turn, fallback: 'abandon' });
  view.self!.hexBids!.push({ ...view.self!.hexBids![2], hexId: 'old-result-cell', amount: 987654,
    result: { outcome: 'won', hexId: 'old-result-cell', price: 987654, bidders: 1 } });
  view.self!.siteBids = [
    { companyId: mine.id, playerId: 'human', commodityId: 'sugar', slotId: 'sugar-1', amount: 6000, turn: view.turn },
    { companyId: mine.id, playerId: 'human', commodityId: 'oil', slotId: 'oil-1', amount: 987654, turn: view.turn,
      result: { outcome: 'won', price: 987654, bidders: 1 } },
  ];
  mine.private!.closePlan!.bids += 6000;
  mine.private!.closePlan!.bidsCovered += 6000;
  const offer = { turn: view.turn, fromId: 'human', toId: 'rival', status: 'pending' as const };
  view.self!.offers = [
    { ...offer, id: 'buy-shares', kind: 'shares', companyId: rival.id, side: 'buy', shares: 7, price: 23 },
    { ...offer, id: 'sell-shares', kind: 'shares', companyId: mine.id, side: 'sell', shares: 9, price: 17 },
    { ...offer, id: 'supply-contract', kind: 'contract', sellerCompanyId: rival.id, buyerCompanyId: mine.id,
      commodityId: 'sugar', lots: 8, price: 12, turns: 3 },
    { ...offer, id: 'price-cartel', kind: 'cartel', companyId: second.id, targetCompanyId: rival.id, sectorId: 'gadgets' },
    { ...offer, id: 'received-shares', fromId: 'rival', toId: 'human', kind: 'shares', companyId: rival.id, side: 'sell', shares: 2, price: 19 },
    { ...offer, id: 'old-offer', status: 'accepted', kind: 'shares', companyId: rival.id, side: 'buy', shares: 1, price: 987654 },
  ];
  view.self!.cartels = [{ id: 'leaving-cartel', sectorId: 'gadgets', since: 0, risk: 0.2,
    members: [{ companyId: second.id, controllerId: 'human', leaving: true }, { companyId: rival.id, controllerId: 'rival' }] }];
  return { view, mine, second, moveCell, launchCell, startupCell };
}

type Button = ReactElement<{ children?: ReactNode; onClick?: () => unknown; disabled?: boolean; 'aria-expanded'?: boolean; ref?: { current: unknown } }>;
function buttons(node: ReactNode): Button[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === 'button') return [node as Button];
  if (typeof node.type === 'function') return buttons((node.type as (props: typeof node.props) => ReactNode)(node.props));
  return buttons(node.props.children);
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children);
  return '';
}
const callbacks = () => ({ openMapFor: vi.fn(), goTo: vi.fn() });
const label = { fr: { view: 'Voir', withdraw: 'Retirer', committed: 'Engagé à la clôture', paid: 'Déjà payé ce trimestre' },
  en: { view: 'View', withdraw: 'Withdraw', committed: 'Committed at the close', paid: 'Already paid this quarter' } };

describe.each(['fr', 'en'] as const)('pending decisions interface (%s)', (lang) => {
  it('counts live withdrawable decisions, groups company and personal commitments, and formats every known amount', () => {
    const { view, mine, second } = pendingFixture(lang);
    setup(view, lang);
    const model = pendingDecisions(view);
    expect(model.count).toBe(8);
    const trigger = renderToStaticMarkup(createElement(PendingDecisionsButton, callbacks()));
    // Nine outgoing commitments (including a cartel departure), plus one incoming offer.
    expect(trigger).toContain(escaped(lang === 'fr' ? 'Mon trimestre (10)' : 'My quarter (10)'));
    expect(trigger).toContain('aria-expanded="false"');
    resetHooks();
    const html = renderToStaticMarkup(createElement(PendingDecisionsPanel, callbacks()));
    const fmt = fmtFor(lang);
    expect(html).toContain(escaped(label[lang].committed));
    expect(html).toContain(mine.name); expect(html).toContain(second.name);
    expect(html).toContain('Bob');
    for (const item of model.items) if (item.amount !== null) expect(html).toContain(escaped(fmt.money(item.amount)));
    expect(html).toContain(escaped(fmt.money(model.personalTotal)));
    for (const group of model.groups) expect(html).toContain(escaped(fmt.money(group.total)));
    expect(html.match(/data-pending-kind=/g)).toHaveLength(10);
    expect(html.match(/data-pending-kind="offer"/g)).toHaveLength(4);
    expect(html.match(new RegExp(`>${label[lang].withdraw}</button>`, 'g'))).toHaveLength(8);
    expect(html.match(new RegExp(`>${label[lang].view}</button>`, 'g'))).toHaveLength(10);
    expect(html).toContain(escaped(messages(lang).pendingDecisions.received));
    expect(html).not.toContain(escaped(fmt.money(987654)));
    expect(html).not.toContain('old-result-cell');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    if (lang === 'fr') expect(textFromMarkup(html)).not.toMatch(/\btu\b/i);
    else expect(html).not.toContain('€');
  });

  it('shares the close-plan capped-bid warning and keeps personal share purchases outside company cash', () => {
    const { view, mine } = pendingFixture(lang);
    const plan = mine.private!.closePlan!;
    Object.assign(plan, { cash: mine.cash, bids: 12345, bidsCovered: 500, shortfall: 71, safeShortfall: 72, bankrupt: false });
    setup(view, lang);
    const html = renderToStaticMarkup(createElement(PendingDecisionsPanel, callbacks()));
    const fmt = fmtFor(lang);
    expect(html).toContain(escaped(fmt.money(12345)));
    expect(html).toContain(escaped(fmt.money(mine.cash)));
    expect(html).toContain(escaped(messages(lang).closeBanner.bidsCapped(fmt.money(500))));
    expect(html).toContain(escaped(messages(lang).closeBanner.shortTitle(fmt.money(71))));
    const model = pendingDecisions(view);
    expect(model.personalTotal).toBe(161);
    expect(model.groups.find((group) => group.company.id === mine.id)!.total).toBe(mine.private!.pendingHexCommitment! + 6000);
  });

  it('View opens the exact launch, move, startup and deposit intents and takes offers to Deals', () => {
    const { view, mine, second, moveCell, launchCell } = pendingFixture(lang);
    setup(view, lang);
    const cb = callbacks(); const onNavigate = vi.fn();
    const model = pendingDecisions(view);
    const expected = new Map([
      ['launch', { kind: 'launch', companyId: mine.id, hexId: launchCell }],
      ['move', { kind: 'move', productId: mine.products[0].id }],
      ['startup', { kind: 'move', productId: second.products[0].id }],
      ['deposit', { kind: 'deposit', companyId: mine.id, slotId: 'sugar-1' }],
    ]);
    for (const item of [...model.items, ...model.received]) {
      hooks.cursor = 0; hooks.values = [];
      const control = buttons(PendingDecisionItem({ item, ...cb, onNavigate })).find((button) => text(button.props.children) === label[lang].view);
      expect(control, item.kind).toBeDefined();
      control!.props.onClick!();
      if (expected.has(item.kind)) expect(cb.openMapFor).toHaveBeenLastCalledWith(expected.get(item.kind));
      else expect(cb.goTo).toHaveBeenLastCalledWith('deals');
    }
    expect(view.self!.hexBids!.find((bid) => bid.kind === 'move')!.hexId).toBe(moveCell);
    expect(cb.openMapFor).toHaveBeenCalledTimes(4);
    expect(onNavigate).toHaveBeenCalledTimes(model.items.length + model.received.length);
  });

  it('withdraws every live bid and sent offer through real sendAction with the viewed quarter', async () => {
    const { view, mine, second } = pendingFixture(lang);
    setup(view, lang);
    const model = pendingDecisions(view);
    for (const item of model.items.filter((item) => item.withdraw)) {
      hooks.cursor = 0; hooks.values = [];
      const control = buttons(PendingDecisionItem({ item, ...callbacks() })).find((button) => text(button.props.children) === label[lang].withdraw);
      expect(control, item.kind).toBeDefined();
      await control!.props.onClick!();
    }
    const launch = view.self!.hexBids!.find((bid) => bid.kind === 'launch')!;
    const actions = transport.emit.mock.calls.filter(([event]) => event === 'game:action').map(([, payload]) => payload);
    expect(actions).toHaveLength(8);
    expect(actions).toEqual(expect.arrayContaining([
      { action: { type: 'cancelHexBid', companyId: mine.id, projectId: launch.project!.id }, turn: view.turn },
      { action: { type: 'cancelHexBid', companyId: mine.id, productId: mine.products[0].id }, turn: view.turn },
      { action: { type: 'cancelHexBid', companyId: second.id, productId: second.products[0].id }, turn: view.turn },
      { action: { type: 'cancelSiteBid', companyId: mine.id, commodityId: 'sugar' }, turn: view.turn },
      ...['buy-shares', 'sell-shares', 'supply-contract', 'price-cartel'].map((offerId) => ({ action: { type: 'cancelOffer', offerId }, turn: view.turn })),
    ]));
    for (const item of [...model.received, ...model.items.filter((item) => item.kind === 'leaving')]) {
      hooks.cursor = 0; hooks.values = [];
      expect(buttons(PendingDecisionItem({ item, ...callbacks() })).map((button) => text(button.props.children))).not.toContain(label[lang].withdraw);
    }
  });

  it('reports precise paid launches and construction without inventing amounts or withdrawal', () => {
    const { game, own } = baseGame(lang, 'classic');
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: own.id, sectorId: 'yogurts', name: 'Paid Product' }).ok).toBe(true);
    expect(applyAction(game, 'human', { type: 'expandCapacity', companyId: own.id, productId: own.products[0].id, lots: 9 }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    setup(view, lang);
    expect(pendingDecisions(view).count).toBe(0);
    const trigger = renderToStaticMarkup(createElement(PendingDecisionsButton, callbacks()));
    expect(trigger).toContain(escaped(lang === 'fr' ? 'Mon trimestre (2)' : 'My quarter (2)'));
    resetHooks();
    const html = renderToStaticMarkup(createElement(PendingDecisionsPanel, callbacks()));
    expect(html).toContain(escaped(label[lang].paid));
    expect(html).toContain('Paid Product');
    expect(html).toContain(escaped(own.products[0].name));
    expect(html).not.toContain(`>${label[lang].withdraw}</button>`);
    expect(html).not.toContain(escaped(fmtFor(lang).money(SECTORS.yogurts.launchCost)));
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    expect(html).toContain(escaped(messages(lang).pendingDecisions.saved));
    expect(html).toContain(escaped(fmtFor(lang).lots(own.products[0].production)));
  });

  it('renders a neutral zero-count control and an empty state without live decision controls', () => {
    const { game } = baseGame(lang);
    const view = getPlayerView(game, 'human');
    setup(view, lang);
    const trigger = renderToStaticMarkup(createElement(PendingDecisionsButton, callbacks()));
    expect(trigger).toContain(escaped(lang === 'fr' ? 'Mon trimestre' : 'My quarter'));
    expect(trigger).not.toContain('(0)');
    expect(trigger).toContain('class="btn small ghost"');
    resetHooks();
    const html = renderToStaticMarkup(createElement(PendingDecisionsPanel, callbacks()));
    expect(html).toContain(escaped(messages(lang).pendingDecisions.empty));
    expect(html).not.toContain(`>${label[lang].withdraw}</button>`);
    expect(html).not.toContain(`>${label[lang].view}</button>`);
  });
});

const textFromMarkup = (html: string) => html.replace(/<[^>]+>/g, ' ');

it('uses vous in all new French pending-decision texts, including interpolated labels', () => {
  function samples(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (typeof value === 'function') return [String(value(2, 'Example', 'Amount'))];
    return value && typeof value === 'object' ? Object.values(value).flatMap(samples) : [];
  }
  expect(samples(messages('fr').pendingDecisions).join(' ')).not.toMatch(/\b(?:tu|toi|ton|ta|tes)\b/i);
});

it('opens by its keyboard-accessible button, closes on Escape and outside pointerdown, and cleans listeners', () => {
  const { view } = pendingFixture('fr');
  setup(view, 'fr');
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  let activeDialog: object | null = null;
  const documentHarness = {
    querySelector: vi.fn(() => activeDialog),
    addEventListener: vi.fn((name: string, listener: (event: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    }),
    removeEventListener: vi.fn((name: string, listener: (event: unknown) => void) => listeners.get(name)?.delete(listener)),
  };
  vi.stubGlobal('document', documentHarness);
  const cb = callbacks();
  const inside = {};
  const focusPanel = vi.fn(); const focusTrigger = vi.fn();
  const render = () => {
    hooks.cursor = 0;
    const tree = PendingDecisionsButton(cb) as ReactElement<{ children?: ReactNode; ref?: { current: unknown } }>;
    tree.props.ref!.current = { contains: (target: unknown) => target === inside };
    buttons(tree)[0].props.ref!.current = { focus: focusTrigger };
    const region = (tree.props.children as ReactNode[]).find((child) => isValidElement<{ role?: string }>(child) && child.props.role === 'region');
    if (isValidElement<{ ref: { current: unknown } }>(region)) region.props.ref.current = { focus: focusPanel };
    flushEffects();
    return tree;
  };
  const fire = (name: string, event: unknown) => { for (const listener of [...(listeners.get(name) ?? [])]) listener(event); };
  let tree = render();
  let trigger = buttons(tree)[0];
  expect(trigger.type).toBe('button'); expect(trigger.props['aria-expanded']).toBe(false);
  trigger.props.onClick!(); tree = render();
  expect(buttons(tree)[0].props['aria-expanded']).toBe(true);
  expect(focusPanel).toHaveBeenCalledTimes(1);
  expect(listeners.get('keydown')?.size).toBe(1);
  expect(listeners.get('pointerdown')?.size).toBe(1);
  fire('keydown', { key: 'Enter' }); tree = render();
  expect(buttons(tree)[0].props['aria-expanded']).toBe(true);
  // Escape belongs to a dialog opened above the quarterly review.
  activeDialog = {};
  fire('keydown', { key: 'Escape' }); tree = render();
  expect(buttons(tree)[0].props['aria-expanded']).toBe(true);
  expect(focusTrigger).not.toHaveBeenCalled();
  activeDialog = null;
  fire('keydown', { key: 'Escape' }); tree = render();
  expect(buttons(tree)[0].props['aria-expanded']).toBe(false);
  expect(focusTrigger).toHaveBeenCalledTimes(1);
  expect(listeners.get('keydown')?.size).toBe(0);
  expect(listeners.get('pointerdown')?.size).toBe(0);
  buttons(tree)[0].props.onClick!(); tree = render();
  expect(tree.props.ref).toBeDefined();
  fire('pointerdown', { target: inside }); tree = render();
  expect(buttons(tree)[0].props['aria-expanded']).toBe(true);
  fire('pointerdown', { target: {} }); tree = render();
  expect(buttons(tree)[0].props['aria-expanded']).toBe(false);
  expect(listeners.get('keydown')?.size).toBe(0);
  expect(listeners.get('pointerdown')?.size).toBe(0);
  expect(documentHarness.removeEventListener).toHaveBeenCalledTimes(4);
  // A navigation link closes the same popover while preserving its one-shot intent.
  buttons(tree)[0].props.onClick!(); tree = render();
  buttons(tree).find((button) => text(button.props.children) === 'Voir')!.props.onClick!(); tree = render();
  expect(buttons(tree)[0].props['aria-expanded']).toBe(false);
  expect(cb.openMapFor).toHaveBeenLastCalledWith({ kind: 'move', productId: view.companies.find((company) => company.controllerId === 'human')!.products[0].id });
  // Turn updates close the stale review and release both document listeners.
  buttons(tree)[0].props.onClick!(); tree = render();
  const nextView = { ...view, turn: view.turn + 1 };
  gameData.current = { ...gameData.current!, view: nextView };
  setState({ view: nextView });
  tree = render(); tree = render();
  expect(buttons(tree)[0].props['aria-expanded']).toBe(false);
  expect(listeners.get('keydown')?.size).toBe(0);
  expect(listeners.get('pointerdown')?.size).toBe(0);
  expect(documentHarness.removeEventListener).toHaveBeenCalledTimes(8);
});

describe.each(['fr', 'en'] as const)('pending decisions after a loss of control (%s)', (lang) => {
  it('lists my bids that will fail at the close apart, uncounted and without a withdraw button', () => {
    const { view, second, startupCell } = pendingFixture(lang);
    const before = pendingDecisions(view).count;
    // The second company changes hands: its start-up land bid can no longer settle or be withdrawn.
    second.controllerId = 'rival';
    delete second.private;
    setup(view, lang);
    const model = pendingDecisions(view);
    expect(model.count).toBe(before - 1);
    expect(model.lostControl.map((item) => item.bid?.kind)).toEqual(['startup']);
    const html = renderToStaticMarkup(createElement(PendingDecisionsPanel, callbacks()));
    const d = messages(lang).pendingDecisions;
    const section = html.slice(html.indexOf('pending-lost-control'));
    expect(section).toContain(escaped(d.lostControl));
    expect(section).toContain(`<li data-bid-state="lost-control">${escaped(d.startup('Incubator Product', hexPlaceLabel(startupCell, lang, view.siteSlots)))}</li>`);
    expect(section.slice(0, section.indexOf('</section>'))).not.toContain('<button');
  });
});
