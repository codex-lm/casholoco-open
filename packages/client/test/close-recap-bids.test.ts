/**
 * Fenêtre du bilan : six mises réglées (cinq issues du plateau et un gisement), leurs coûts exacts et les liens
 * qui ferment la fenêtre avant d'ouvrir la carte. Harnais : composant appelé à la main, boutons cliqués directement.
 */
import { Fragment, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getContent, getPlayerView, hexPlaceLabel, resolveTurn, type Lang, type PlayerView } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { quarterCloseMessages } from '../src/i18n/quarterClose';
import { QuarterClose } from '../src/screens/game/QuarterClose';
import { getState, setState, type AppState } from '../src/store';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
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
    useEffect: () => {},
    useId: () => ':qc:',
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
});
afterEach(() => {
  setState(initial);
  vi.unstubAllGlobals();
  data.view = null;
});

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children as ReactNode, predicate)];
}

/** A real hex game after one close; the recap's own facts and change are reset so each test sets what it needs. */
function fixture(lang: Lang) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode: 'hex', terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: '#654321' },
  ]);
  resolveTurn(game);
  const view = getPlayerView(game, 'human');
  const recap = view.self!.closeRecap!;
  recap.facts = [];
  recap.previousNetWorth = recap.netWorth;
  delete recap.breakdown;
  view.self!.hexBids = [];
  view.self!.siteBids = [];
  const own = view.companies.find((c) => c.controllerId === 'human')!;
  const rival = view.companies.find((c) => c.controllerId === 'rival')!;
  return { view, recap, own, rival };
}

/** Five settled board bids (won, lost, fallback, abandoned at the incubator, failed) and one lost deposit auction. */
function withBids(lang: Lang) {
  const f = fixture(lang);
  const { view, recap, own, rival } = f;
  const turn = recap.turn;
  const [a, b, c, d, e, g] = view.hexes!.free;
  const product = own.products[0];
  const base = { companyId: own.id, playerId: 'human', turn, amount: 300 };
  view.self!.hexBids = [
    { ...base, kind: 'launch', hexId: a, project: { id: 'p1', sectorId: 'yogurts', name: 'Yaourt Max' }, fallback: 'nearest', result: { outcome: 'won', hexId: a, price: 150, bidders: 2 } },
    { ...base, kind: 'move', hexId: b, productId: product.id, result: { outcome: 'lost', price: 0, bidders: 3 } },
    { ...base, kind: 'launch', hexId: c, project: { id: 'p2', sectorId: 'crypto', name: 'Okay Coin' }, fallback: 'nearest', result: { outcome: 'fallback', hexId: d, price: 90, bidders: 2 } },
    { ...base, kind: 'startup', hexId: e, productId: product.id, result: { outcome: 'abandoned', price: 0, bidders: 0, note: 'Engine line: still at the incubator until Q3.' } },
    { ...base, kind: 'launch', hexId: g, project: { id: 'p3', sectorId: 'gadgets', name: 'Gizmo' }, result: { outcome: 'failed', price: 0, bidders: 1 } },
    // An older bid, and one still pending: neither belongs to this close.
    { ...base, kind: 'launch', hexId: a, turn: turn - 1, project: { id: 'old', sectorId: 'yogurts', name: 'Old' }, result: { outcome: 'won', hexId: a, price: 1, bidders: 1 } },
    { ...base, kind: 'launch', hexId: b, turn: turn + 1, project: { id: 'live', sectorId: 'yogurts', name: 'Live' } },
  ];
  view.hexes!.results = [
    { hexId: b, companyId: rival.id, playerId: 'rival', kind: 'move', price: 210, reserve: 100, bidders: 3, fallback: false },
    { hexId: c, companyId: rival.id, playerId: 'rival', kind: 'launch', price: 250, reserve: 100, bidders: 2, fallback: false },
  ];
  const slot = view.siteSlots[0];
  view.self!.siteBids = [{ companyId: own.id, playerId: 'human', commodityId: slot.commodityId, slotId: slot.id, amount: 500, turn, result: { outcome: 'lost', price: 420, bidders: 2 } }];
  return { ...f, cells: { a, b, c, d, e, g }, product, slot };
}

function render(view: PlayerView, lang: Lang, openMapFor = vi.fn()) {
  data.view = view;
  setState({ lang, view, lobby: null });
  hooks.cursor = 0;
  const onClose = vi.fn();
  const node = QuarterClose({ open: true, onClose, disableAutoOpen: false, onDisableAutoOpen: vi.fn(), openIssue: vi.fn(), openFactory: vi.fn(), openMapFor });
  return { node, html: node ? renderToStaticMarkup(node) : '', openMapFor, onClose };
}

describe.each(['fr', 'en'] as const)('close recap: my bids settled at this close (%s)', (lang) => {
  it('reports each outcome, the cell obtained, what was paid, the public price and the bidders, from my own view', () => {
    const { view, product, cells, slot } = withBids(lang);
    // A launch that obtains a cell pays its land and, at the same close, its sector's launch cost.
    const launchCost = (sectorId: string) => view.sectors.find((s) => s.id === sectorId)!.launchCost;
    const text = quarterCloseMessages(lang);
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const place = (id: string) => hexPlaceLabel(id, lang, view.siteSlots);
    const { html } = render(view, lang);
    expect(html).toContain(escaped(text.bidsTitle));
    const all = [...html.matchAll(/<li data-recap-bid="(\w+)"><span>(.*?)<\/span>/g)].map((m) => [m[1], m[2]]);
    // Five board bids of this close, then the deposit; the older and the pending bids are left out.
    expect(all.map(([outcome]) => outcome)).toEqual(['won', 'lost', 'fallback', 'abandoned', 'failed', 'lost']);
    const [won, lost, fallback, abandoned, failed, deposit] = all.map(([, line]) => line);
    expect(won).toBe(escaped(`${text.bidLaunch('Yaourt Max')} · ${place(cells.a)}${text.sep}${h.bidState.won} · ${text.paidLand(fmt.money(150))} · ${text.paidLaunch(fmt.money(launchCost('yogurts')))} · ${h.bidBidders(2)}`));
    expect(lost).toBe(escaped(`${text.bidMove(product.name)} · ${place(cells.b)}${text.sep}${h.bidState.lost} · ${text.nothingPaid} · ${text.publicPrice(fmt.money(210))} · ${h.bidBidders(3)}`));
    // The fallback pays the nearest free cell at its reserve: never « nothing paid ».
    expect(fallback).toBe(escaped(`${text.bidLaunch('Okay Coin')} · ${place(cells.c)}${text.sep}${h.bidState.fallback} · ${h.bidObtained(place(cells.d))} · ${text.paidReserve(fmt.money(90))} · ${text.paidLaunch(fmt.money(launchCost('crypto')))} · ${text.publicPrice(fmt.money(250))} · ${h.bidBidders(2)}`));
    expect(fallback).not.toContain(escaped(text.nothingPaid));
    // Only the land is « paid » on a cell: a launch that found none pays no launch cost either.
    for (const line of [lost, abandoned, failed, deposit]) expect(line).not.toContain(escaped(text.paidLaunch('')).trim());
    expect(abandoned).toBe(escaped(`${text.bidStartup(product.name)} · ${place(cells.e)}${text.sep}${h.incubatorStays} · ${text.nothingPaid}`));
    expect(failed).toBe(escaped(`${text.bidLaunch('Gizmo')} · ${place(cells.g)}${text.sep}${h.bidState.failed} (${text.failedHex}) · ${text.nothingPaid} · ${h.bidBidders(1)}`));
    expect(deposit).toBe(escaped(`${text.bidDeposit(slot.name, getContent(lang).commodities[slot.commodityId].name)}${text.sep}${h.bidState.lost} · ${text.nothingPaid} · ${text.publicPrice(fmt.money(420))} · ${h.bidBidders(2)}`));
    // The engine's note comes verbatim, under its bid.
    expect(html).toContain('<small class="quarter-close-bid-note">Engine line: still at the incubator until Q3.</small>');
    expect(html).toContain(escaped(text.frozen));
  });

  it('« Voir sur la carte » shows the cell obtained, else the cell bid on, or the deposit', () => {
    const { view, own, cells, slot } = withBids(lang);
    const { node, openMapFor, onClose } = render(view, lang);
    const text = quarterCloseMessages(lang);
    const buttons = elements(node, (element) => element.type === 'button' && element.props['data-recap-bid-map'] === true);
    expect(buttons).toHaveLength(6);
    expect(buttons.every((button) => button.props.children === text.viewOnMap)).toBe(true);
    for (const button of buttons) (button.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(6);
    for (let i = 0; i < buttons.length; i++) {
      expect(onClose.mock.invocationCallOrder[i]).toBeLessThan(openMapFor.mock.invocationCallOrder[i]);
    }
    expect(openMapFor.mock.calls.map(([intent]) => intent)).toEqual([
      { kind: 'cell', hexId: cells.a },
      { kind: 'cell', hexId: cells.b },
      { kind: 'cell', hexId: cells.d },
      { kind: 'cell', hexId: cells.e },
      { kind: 'cell', hexId: cells.g },
      { kind: 'deposit', companyId: own.id, slotId: slot.id },
    ]);
  });
});
