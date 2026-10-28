import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getPlayerView, hexPlaceLabel, resolveTurn, type HexBid, type Lang, type PlayerView } from '@muchomoney/core';
import { sendAction } from '../src/api';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { HexBidsPanel, hexBidKey } from '../src/screens/game/HexBidsPanel';
import { getState, setState, type AppState } from '../src/store';

const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()],
    // These handler tests do not mount: no effect runs.
    useEffect: () => {},
  };
});
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
vi.mock('../src/hooks/useGame', () => ({ useGame: () => ({ view: data.view!, companiesById: new Map(data.view!.companies.map((c) => [c.id, c])) }) }));
vi.mock('../src/api', () => ({ sendAction: vi.fn(async () => ({ ok: true, message: '' })) }));

const initial = getState();
afterEach(() => { setState(initial); data.view = null; vi.mocked(sendAction).mockClear(); });
const escaped = (value: string) => renderToStaticMarkup(createElement('span', null, value)).replace(/^<span>|<\/span>$/g, '');

function fixture(lang: Lang, fallback: 'nearest' | 'abandon' = 'nearest') {
  const g = createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode: 'hex', terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Rival', sectorId: 'gadgets', connected: true, color: '#abcdef' },
  ]);
  const own = Object.values(g.companies).find((c) => c.controllerId === 'human')!;
  const rival = Object.values(g.companies).find((c) => c.controllerId === 'rival')!;
  own.cash = rival.cash = 100_000;
  const v = getPlayerView(g, 'human');
  const [moveCell, launchCell] = v.hexes!.free;
  const moveBid = v.hexes!.reserve[moveCell];
  const launchBid = v.hexes!.reserve[launchCell];
  expect(applyAction(g, 'human', { type: 'moveFactory', companyId: own.id, productId: own.products[0].id, hexId: moveCell, bid: moveBid }).ok).toBe(true);
  expect(applyAction(g, 'human', { type: 'launchProduct', companyId: own.id, sectorId: 'yogurts', name: 'New Product', hexId: launchCell, bid: launchBid, fallback }).ok).toBe(true);
  return { g, own, rival, moveCell, launchCell };
}
function setup(view: PlayerView, lang: Lang) { data.view = view; setState({ lang, view, lobby: null }); }
function rendered(view: PlayerView, lang: Lang) { setup(view, lang); return renderToStaticMarkup(createElement(HexBidsPanel)); }
function buttons(node: ReactNode): ReactElement<{ onClick: () => Promise<void>; children: ReactNode }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === 'button') return [node as ReactElement<{ onClick: () => Promise<void>; children: ReactNode }>];
  if (typeof node.type === 'function') return buttons((node.type as (props: typeof node.props) => ReactNode)(node.props));
  return buttons(node.props.children);
}

describe.each(['fr', 'en'] as const)('my sealed hex bids (%s)', (lang) => {
  it('shows only self bids, fallback, pending commitment and cancellation controls', () => {
    const { g, own } = fixture(lang);
    const view = getPlayerView(g, 'human');
    const html = rendered(view, lang);
    const t = messages(lang).hex;
    const fmt = fmtFor(lang);
    const company = view.companies.find((c) => c.id === own.id)!;
    expect(html).toContain(escaped(t.bidsTitle));
    expect(html).toContain(escaped(fmt.money(company.private!.pendingHexCommitment!)));
    expect(html.match(/data-bid-state="pending"/g)).toHaveLength(2);
    for (const bid of view.self.hexBids!) {
      expect(html).toContain(escaped(t.bidCell(hexPlaceLabel(bid.hexId, lang, view.siteSlots))));
      expect(html).toContain(escaped(fmt.money(bid.amount)));
    }
    expect(html).toContain(escaped(t.bidFallback.nearest));
    expect(html.match(new RegExp(escaped(t.bidCancel), 'g'))).toHaveLength(2);
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    if (lang === 'en') expect(html).not.toMatch(/[àâçéèêëîïôûùœ«»€]/i);
  });

  it('sends exact move and launch cancellation payloads', async () => {
    const { g, own } = fixture(lang);
    const view = getPlayerView(g, 'human');
    setup(view, lang);
    const controls = buttons(HexBidsPanel());
    expect(controls).toHaveLength(2);
    await controls[0].props.onClick();
    await controls[1].props.onClick();
    const launch = view.self.hexBids!.find((b) => b.kind === 'launch')!;
    expect(vi.mocked(sendAction).mock.calls.map(([action]) => action)).toEqual([
      { type: 'cancelHexBid', companyId: own.id, productId: own.products[0].id },
      { type: 'cancelHexBid', companyId: own.id, projectId: launch.project!.id },
    ]);
  });

  it('also cancels an incubator startup bid by product id', async () => {
    const { g } = fixture(lang);
    const view = getPlayerView(g, 'human');
    const startup = { ...view.self.hexBids![0], kind: 'startup' as const, fallback: 'abandon' as const };
    view.self.hexBids = [startup];
    setup(view, lang);
    await buttons(HexBidsPanel())[0].props.onClick();
    expect(sendAction).toHaveBeenCalledWith({ type: 'cancelHexBid', companyId: startup.companyId, productId: startup.productId });
  });

  it('renders actual won results and removes cancellation controls after closing', () => {
    const { g } = fixture(lang);
    resolveTurn(g);
    const view = getPlayerView(g, 'human');
    expect(view.self.hexBids!.every((b) => b.result?.outcome === 'won')).toBe(true);
    const html = rendered(view, lang);
    expect(html.match(/data-bid-state="won"/g)).toHaveLength(2);
    const t = messages(lang).hex;
    const fmt = fmtFor(lang);
    for (const bid of view.self.hexBids!) {
      expect(html).toContain(escaped(fmt.money(bid.result!.price)));
      expect(html).toContain(escaped(t.bidBidders(bid.result!.bidders)));
      expect(html).toContain(escaped(t.bidObtained(hexPlaceLabel(bid.result!.hexId!, lang, view.siteSlots))));
    }
    expect(html).not.toContain(escaped(t.bidCancel));
  });

  it('shows an abandoned launch result without a cell obtained or cancellation action', () => {
    const { g, rival, launchCell } = fixture(lang, 'abandon');
    const before = getPlayerView(g, 'rival');
    expect(applyAction(g, 'rival', { type: 'launchProduct', companyId: rival.id, sectorId: 'yogurts', name: 'Winner', hexId: launchCell, bid: before.hexes!.reserve[launchCell] + 100, fallback: 'abandon' }).ok).toBe(true);
    resolveTurn(g);
    const view = getPlayerView(g, 'human');
    const abandoned = view.self.hexBids!.find((bid) => bid.kind === 'launch')!;
    expect(abandoned.result!.outcome).toBe('abandoned');
    view.self.hexBids = [abandoned];
    const html = rendered(view, lang);
    expect(html).toContain('data-bid-state="abandoned"');
    expect(html).toContain(escaped(messages(lang).hex.bidState.abandoned));
    expect(html).toContain(escaped(fmtFor(lang).money(abandoned.result!.price)));
    expect(html).not.toContain(escaped(messages(lang).hex.bidCancel));
    expect(html).not.toContain(escaped(messages(lang).hex.bidObtained(hexPlaceLabel(launchCell, lang, view.siteSlots))));
  });

  it('shows failed bids after their author loses control before the close', () => {
    const { g, own } = fixture(lang);
    own.controllerId = 'rival';
    resolveTurn(g);
    const view = getPlayerView(g, 'human');
    expect(view.self.hexBids!.every((bid) => bid.result!.outcome === 'failed')).toBe(true);
    const html = rendered(view, lang);
    expect(html.match(/data-bid-state="failed"/g)).toHaveLength(2);
    expect(html).toContain(escaped(messages(lang).hex.bidState.failed));
    expect(html).not.toContain(escaped(messages(lang).hex.bidCancel));
  });

  it('marks bids as falling at the close and disables withdrawal when all shares are sold', async () => {
    const { g, own } = fixture(lang);
    expect(applyAction(g, 'human', { type: 'sellShares', companyId: own.id, shares: own.holdings.human }).ok).toBe(true);
    expect(own.controllerId).not.toBe('human');
    const view = getPlayerView(g, 'human');
    expect(view.self.hexBids).toHaveLength(2);
    expect(view.self.hexBids!.every((bid) => !bid.result)).toBe(true);
    const html = rendered(view, lang);
    expect(html.match(/data-bid-state="lost-control"/g)).toHaveLength(2);
    expect(html).toContain(escaped(messages(lang).hex.bidLostControl));
    const controls = buttons(HexBidsPanel());
    expect(controls).toHaveLength(2);
    for (const button of controls) {
      expect((button.props as { disabled?: boolean }).disabled).toBe(true);
      await button.props.onClick();
    }
    expect(sendAction).not.toHaveBeenCalled();
    if (lang === 'en') expect(html).not.toMatch(/[àâçéèêëîïôûùœ«»€]/i);
  });

  it('renders actual lost moves and nearest-cell fallback launch results', () => {
    const { g, rival, moveCell, launchCell } = fixture(lang);
    const v = getPlayerView(g, 'rival');
    expect(applyAction(g, 'rival', { type: 'moveFactory', companyId: rival.id, productId: rival.products[0].id, hexId: moveCell, bid: v.hexes!.reserve[moveCell] + 100 }).ok).toBe(true);
    expect(applyAction(g, 'rival', { type: 'launchProduct', companyId: rival.id, sectorId: 'yogurts', name: 'Competitor', hexId: launchCell, bid: v.hexes!.reserve[launchCell] + 100, fallback: 'nearest' }).ok).toBe(true);
    resolveTurn(g);
    const view = getPlayerView(g, 'human');
    const results = view.self.hexBids!.map((b) => b.result!.outcome);
    expect(results).toEqual(['lost', 'fallback']);
    const html = rendered(view, lang);
    expect(html).toContain('data-bid-state="lost"');
    expect(html).toContain('data-bid-state="fallback"');
    const fallback = view.self.hexBids!.find((b) => b.result!.outcome === 'fallback')!;
    expect(html).toContain(escaped(messages(lang).hex.bidObtained(hexPlaceLabel(fallback.result!.hexId!, lang, view.siteSlots))));
    expect(html).toContain(escaped(messages(lang).hex.bidBidders(fallback.result!.bidders)));
  });

  it('shows the incubator-stays badge for an unaffordable forced placement, without a meaningless amount', () => {
    const { g } = fixture(lang);
    const view = getPlayerView(g, 'human');
    const base = view.self.hexBids![0];
    const note = lang === 'fr'
      ? 'Incubation prolongée : Test Holding n’a pas de quoi payer la case libre la plus proche (B2, 400 k). Nouvel essai à la prochaine clôture.'
      : 'Incubation extended: Test Holding can’t afford the nearest free cell (B2, 400 k). It will try again at the next close.';
    const stuck: HexBid = { ...base, kind: 'startup', amount: 0, fallback: 'nearest', result: { outcome: 'abandoned', price: 0, bidders: 0, note } };
    view.self.hexBids = [stuck];
    for (const c of view.companies) if (c.private) c.private.pendingHexCommitment = 111;
    const html = rendered(view, lang);
    const t = messages(lang).hex;
    expect(html).toContain('data-bid-state="abandoned"');
    expect(html).toContain(escaped(t.incubatorStays));
    expect(html).not.toContain(escaped(t.bidState.abandoned));
    // The live commitment header correctly totals zero for resolved-only bids; the
    // historical incubator row itself must not invent a zero bid or payment.
    const historicalRow = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    expect(historicalRow).not.toContain(escaped(fmtFor(lang).money(0)));
    expect(html).toContain(escaped(note));
    if (lang === 'en') expect(html).not.toMatch(/[àâçéèêëîïôûùœ«»€]/i);
  });

  it('keeps the normal fallback badge and obtained cell for a placed incubator row', () => {
    const { g } = fixture(lang);
    const view = getPlayerView(g, 'human');
    const base = view.self.hexBids![0];
    const note = lang === 'fr'
      ? 'Fin de l’incubation : Test Holding s’installe d’office en B2, à la mise à prix (400 k).'
      : 'Incubation’s over: Test Holding gets moved to B2 at the 400 k reserve. The couch has been reassigned.';
    const placed: HexBid = { ...base, kind: 'startup', amount: 0, fallback: 'nearest', result: { outcome: 'fallback', hexId: 'B2', price: 400, bidders: 0, note } };
    view.self.hexBids = [placed];
    const html = rendered(view, lang);
    const t = messages(lang).hex;
    expect(html).toContain('data-bid-state="fallback"');
    expect(html).toContain(escaped(t.bidState.fallback));
    expect(html).toContain(escaped(t.bidObtained(hexPlaceLabel('B2', lang, view.siteSlots))));
    expect(html).not.toContain(escaped(t.incubatorStays));
    expect(html).toContain(escaped(note));
  });
});

describe('hexBidKey', () => {
  const base: HexBid = { kind: 'startup', companyId: 'c1', playerId: 'p1', hexId: 'A1', amount: 400, turn: 3, productId: 'prod-1', fallback: 'nearest' };

  it('distinguishes an abandoned re-bid from the forced placement row of the same product and turn', () => {
    const abandoned: HexBid = { ...base, result: { outcome: 'abandoned', price: 0, bidders: 0 } };
    const forced: HexBid = { ...base, result: { outcome: 'fallback', hexId: 'B2', price: 400, bidders: 0, note: 'x' } };
    expect(hexBidKey(abandoned)).not.toBe(hexBidKey(forced));
  });

  it('distinguishes two pending bids on different cells and stays stable', () => {
    const a: HexBid = { kind: 'move', companyId: 'c1', playerId: 'p1', hexId: 'A1', amount: 400, turn: 3 };
    const b: HexBid = { ...a, hexId: 'C3' };
    expect(hexBidKey(a)).not.toBe(hexBidKey(b));
    expect(hexBidKey(a)).toBe(hexBidKey({ ...a }));
  });
});

it('does not add a bids panel to classic games', () => {
  const g = createGame({ seed: 4, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr' }, []);
  expect(rendered(getPlayerView(g, 'nobody'), 'fr')).toBe('');
});
