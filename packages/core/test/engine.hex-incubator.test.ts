import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { hexPlaceLabel } from '../src/content';
import { BUILDABLE } from '../src/content/hexes';
import { realizeHexLaunch } from '../src/sim/actions';
import { capitalHexId, freeBuildableHexes } from '../src/sim/hexes';
import { awardHexes, hexReservePrice, routeBetweenHexes } from '../src/sim/hexAuctions';
import { tr } from '../src/sim/i18n';
import { mixedHash } from '../src/sim/util';
import type { Action, CompanyState, GameState } from '../src/types';
import { companyOf, config, human } from './helpers';

function game(seed = 42, lang: 'fr' | 'en' = 'fr'): GameState {
  const s = createGame({ ...config(seed, 8), mapMode: 'hex', terrainAssignment: 'host',
    terrains: { a: 'quai-port-dividende', b: 'faubourgs-croissance', c: 'front-de-mer-saint-benefice', d: 'portes-petit-rabais' }, lang },
  [human('a', 'crypto'), human('b', 'gadgets'), human('c', 'yogurts'), human('d', 'scooters')]);
  s.activeEffects = [];
  for (const c of Object.values(s.companies)) {
    c.cash = 1e6; c.inventory = {}; c.sites = [];
    for (const p of c.products) { p.production = 0; p.marketing = 0; p.rnd = 0; p.stock = 0; }
  }
  return s;
}
function ok(s: GameState, who: string, action: Action) {
  const result = applyAction(s, who, action);
  expect(result.ok, result.message).toBe(true);
  return result;
}
function move(s: GameState, who: string, hexId: string, amount = hexReservePrice(hexId)) {
  const c = companyOf(s, who);
  return ok(s, who, { type: 'moveFactory', companyId: c.id, productId: c.products[0].id, hexId, bid: amount });
}
const settle = (s: GameState) => awardHexes(s, realizeHexLaunch);
const clone = (s: GameState) => structuredClone(s);
function comeback(s: GameState, who: string) {
  const previous = companyOf(s, who);
  previous.status = 'bankrupt'; previous.controllerId = null; previous.products = [];
  s.players[who].cash = 1e6;
  s.turn = 2;
}
function foundation(s: GameState, who: string, hexId: string, fallback: 'nearest' | 'abandon' = 'abandon', amount = hexReservePrice(hexId)): CompanyState {
  ok(s, who, { type: 'foundStartup', sectorId: 'crypto', name: `Incubator comeback ${who}`, investment: 30_000, hexId, bid: amount, fallback });
  return companyOf(s, who);
}
/** Free cells nearest the capital by road, BUILDABLE order on ties, like the incubator rule. */
function byCapitalRoute(s: GameState): string[] {
  return [...freeBuildableHexes(s)].sort((a, b) =>
    routeBetweenHexes(capitalHexId, a) - routeBetweenHexes(capitalHexId, b) || BUILDABLE.indexOf(a) - BUILDABLE.indexOf(b));
}
function nearestByRoute(cells: string[], target: string): string {
  return [...cells].sort((a, b) => routeBetweenHexes(a, target) - routeBetweenHexes(b, target) || BUILDABLE.indexOf(a) - BUILDABLE.indexOf(b))[0];
}
/** Founds a start-up that loses its founding bid and stays in the incubator after the close of F. */
function stuckStartup(s: GameState, who = 'a', rival = 'b') {
  comeback(s, who);
  const target = freeBuildableHexes(s)[0];
  const c = foundation(s, who, target);
  move(s, rival, target, 900);
  const foundingTurn = s.turn;
  resolveTurn(s);
  expect(c.products[0].incubator).toBe(true);
  expect(c.products[0].pendingHexId).toBeUndefined();
  expect(s.turn).toBe(foundingTurn + 1);
  return { c, p: c.products[0], foundingTurn };
}

describe('incubator departure after two quarters (hex board)', () => {
  it.each(['fr', 'en'] as const)('places a silent start-up on the nearest free cell at its reserve at the close of F+1 (%s)', (lang) => {
    const s = game(42, lang);
    const { c, p } = stuckStartup(s);
    expect(s.hexBids!.find((b) => b.productId === p.id)!.result!.outcome).toBe('abandoned');
    const cash = c.cash, rng = s.rngState;
    const expected = byCapitalRoute(s)[0];
    const reserve = hexReservePrice(expected);
    settle(s);
    expect(s.rngState).toBe(rng);
    expect(p.pendingHexId).toBe(expected);
    expect(p.incubator).toBe(true);
    expect(p.landCost).toBe(reserve);
    expect(c.cash).toBeCloseTo(cash - reserve, 8);
    const award = s.hexAuctionResults!.find((a) => a.companyId === c.id)!;
    expect(award).toMatchObject({ hexId: expected, kind: 'startup', price: reserve, bidders: 0, fallback: true });
    const note = tr(s).act.incubatorOver(p.name, hexPlaceLabel(expected, lang, s.siteSlots), reserve);
    expect(note).toContain(p.name);
    expect(note).toContain(expected);
    const bid = getPlayerView(s, 'a').self!.hexBids!.find((b) => b.productId === p.id)!;
    expect(bid).toMatchObject({ kind: 'startup', hexId: expected, amount: reserve, fallback: 'nearest' });
    expect(bid.result).toEqual({ outcome: 'fallback', hexId: expected, price: reserve, bidders: 0, note });
    resolveTurn(s);
    expect(p.hexId).toBe(expected);
    expect(p.incubator).toBeUndefined();
    expect(p.pendingHexId).toBeUndefined();
  });

  it('a start-up that wins its own bid at F+1 is not placed twice', () => {
    const s = game();
    const { c, p } = stuckStartup(s);
    const destination = freeBuildableHexes(s)[0];
    ok(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: destination, bid: 500, fallback: 'abandon' });
    settle(s);
    expect(p.pendingHexId).toBe(destination);
    const bids = s.hexBids!.filter((b) => b.productId === p.id);
    expect(bids).toHaveLength(1);
    expect(bids[0].result!.outcome).toBe('won');
    expect(bids[0].result!.note).toBeUndefined();
    expect(s.hexAuctionResults!.filter((a) => a.companyId === c.id)).toHaveLength(1);
  });

  it('never takes a cell with a valid bid nor a cell taken at this close, and falls to the next nearest', () => {
    const s = game();
    const { p } = stuckStartup(s);
    const ordered = byCapitalRoute(s);
    const n1 = ordered[0];
    const far = ordered.at(-1)!;
    move(s, 'b', n1);
    ok(s, 'c', { type: 'launchProduct', companyId: companyOf(s, 'c').id, sectorId: 'gadgets', name: 'Fallback launch', hexId: far, bid: 500, fallback: 'nearest' });
    move(s, 'd', far, 900);
    const fb = nearestByRoute(freeBuildableHexes(s).filter((id) => id !== n1 && id !== far), far);
    const expected = ordered.find((id) => id !== n1 && id !== far && id !== fb)!;
    settle(s);
    expect(companyOf(s, 'b').products[0].pendingHexId).toBe(n1);
    const launchBid = s.hexBids!.find((b) => b.kind === 'launch' && b.companyId === companyOf(s, 'c').id)!;
    expect(launchBid.result).toMatchObject({ outcome: 'fallback', hexId: fb });
    expect(p.pendingHexId).toBe(expected);
    expect(expected).not.toBe(n1);
    expect(expected).not.toBe(fb);
    const bid = s.hexBids!.find((b) => b.productId === p.id)!;
    expect(bid.result).toMatchObject({ outcome: 'fallback', hexId: expected, price: hexReservePrice(expected), bidders: 0 });
  });

  it('stays in the incubator with the extended note when the reserve is unaffordable, then is placed once affordable', () => {
    const s = game();
    const { c, p } = stuckStartup(s);
    const best = byCapitalRoute(s)[0];
    const reserve = hexReservePrice(best);
    c.cash = reserve - 1;
    settle(s);
    expect(p.incubator).toBe(true);
    expect(p.pendingHexId).toBeUndefined();
    expect(c.cash).toBe(reserve - 1);
    expect(s.hexAuctionResults!.every((a) => a.companyId !== c.id)).toBe(true);
    const bid = s.hexBids!.find((b) => b.productId === p.id)!;
    expect(bid).toMatchObject({ kind: 'startup', companyId: c.id, playerId: 'a', hexId: best, amount: 0, fallback: 'nearest' });
    expect(bid.result).toEqual({ outcome: 'abandoned', price: 0, bidders: 0, note: tr(s).act.incubatorExtended(p.name, hexPlaceLabel(best, s.config.lang, s.siteSlots), reserve) });
    expect(getPlayerView(s, 'a').self!.hexBids!.find((b) => b.productId === p.id)!.result!.note).toContain(p.name);
    c.cash = 1e6;
    s.turn += 1;
    settle(s);
    expect(p.pendingHexId).toBe(best);
    expect(p.landCost).toBe(reserve);
    expect(c.cash).toBeCloseTo(1e6 - reserve, 8);
    expect(s.hexBids!.find((b) => b.productId === p.id)!.result!.note).toBe(tr(s).act.incubatorOver(p.name, hexPlaceLabel(best, s.config.lang, s.siteSlots), reserve));
  });

  it('places two start-ups at the same close on distinct cells in hash order, independently of iteration order', () => {
    const s = game();
    comeback(s, 'a');
    const ta = freeBuildableHexes(s)[0];
    const ca = foundation(s, 'a', ta);
    comeback(s, 'b');
    const tb = freeBuildableHexes(s)[1];
    const cb = foundation(s, 'b', tb);
    move(s, 'c', ta, 900);
    move(s, 'd', tb, 900);
    resolveTurn(s);
    expect(ca.products[0].incubator).toBe(true);
    expect(cb.products[0].incubator).toBe(true);
    const [n1, n2] = byCapitalRoute(s);
    const key = (c: CompanyState) => mixedHash(`${s.config.seed}|${s.turn}|${c.id}|${c.products[0].id}|incubator`);
    const [first, second] = [ca, cb].sort((x, y) => key(x) - key(y) || x.id.localeCompare(y.id));
    const before = clone(s);
    settle(s);
    expect(first.products[0].pendingHexId).toBe(n1);
    expect(second.products[0].pendingHexId).toBe(n2);
    expect(new Set([ca.products[0].pendingHexId, cb.products[0].pendingHexId])).toEqual(new Set([n1, n2]));
    const reordered = clone(before);
    reordered.companies = Object.fromEntries(Object.entries(reordered.companies).reverse());
    settle(reordered);
    expect(reordered.hexAuctionResults).toEqual(s.hexAuctionResults);
    expect(reordered.hexBids).toEqual(s.hexBids);
  });

  it('is deterministic and never consumes the RNG', () => {
    const s = game();
    const { p } = stuckStartup(s);
    const twin = clone(s);
    resolveTurn(s);
    resolveTurn(twin);
    expect(twin).toEqual(s);
    expect(p.incubator).toBeUndefined();
    expect(p.hexId).toBeDefined();
    // An equivalent close where the start-up is not due leaves the exact same RNG state.
    const due = game();
    const { c, p: dueProduct } = stuckStartup(due);
    const notDue = clone(due);
    notDue.companies[c.id].products.find((q) => q.id === dueProduct.id)!.launchedTurn = notDue.turn;
    const rng = due.rngState;
    expect(notDue.rngState).toBe(rng);
    settle(due);
    settle(notDue);
    expect(due.rngState).toBe(rng);
    expect(notDue.rngState).toBe(rng);
    expect(dueProduct.pendingHexId).toBeDefined();
    expect(notDue.companies[c.id].products.find((q) => q.id === dueProduct.id)!.pendingHexId).toBeUndefined();
  });

  it('never forces a departure at the final close: the start-up stays, unbilled, like any refused land bid', () => {
    const s = game();
    comeback(s, 'a');
    s.turn = 7;
    const target = freeBuildableHexes(s)[0];
    const c = foundation(s, 'a', target);
    move(s, 'b', target, 900);
    resolveTurn(s);
    const p = c.products[0];
    expect(s.turn).toBe(s.config.totalTurns);
    expect(p.incubator).toBe(true);
    expect(p.pendingHexId).toBeUndefined();
    const cash = c.cash, rng = s.rngState;
    settle(s);
    expect(s.rngState).toBe(rng);
    expect(p.incubator).toBe(true);
    expect(p.pendingHexId).toBeUndefined();
    expect(c.cash).toBe(cash);
    expect((s.hexBids ?? []).filter((b) => b.productId === p.id && b.result?.note)).toHaveLength(0);
    expect(s.hexAuctionResults!.every((a) => a.companyId !== c.id)).toBe(true);
  });

  it('addresses the private departure line to the current controller, not the founder', () => {
    const s = game();
    const { c, p } = stuckStartup(s);
    c.controllerId = 'b'; // takeover: the new boss decides and pays
    const expected = byCapitalRoute(s)[0];
    const reserve = hexReservePrice(expected);
    const cash = c.cash;
    settle(s);
    expect(p.pendingHexId).toBe(expected);
    expect(c.cash).toBeCloseTo(cash - reserve, 8);
    const note = tr(s).act.incubatorOver(p.name, hexPlaceLabel(expected, s.config.lang, s.siteSlots), reserve);
    const bid = s.hexBids!.find((x) => x.productId === p.id && x.result?.note)!;
    expect(bid.playerId).toBe('b');
    expect(bid.result).toEqual({ outcome: 'fallback', hexId: expected, price: reserve, bidders: 0, note });
    const viewB = getPlayerView(s, 'b').self!.hexBids!;
    expect(viewB.some((x) => x.productId === p.id && x.result?.note === note)).toBe(true);
    const viewA = getPlayerView(s, 'a').self!.hexBids ?? [];
    expect(viewA.some((x) => x.productId === p.id)).toBe(false);
  });

  it('leaves a start-up in the incubator, unbilled, when the company has no controller', () => {
    const s = game();
    const { c, p } = stuckStartup(s);
    c.controllerId = null; // autopilot: nobody to bill for the decision
    const cash = c.cash, rng = s.rngState;
    settle(s);
    expect(s.rngState).toBe(rng);
    expect(p.incubator).toBe(true);
    expect(p.pendingHexId).toBeUndefined();
    expect(c.cash).toBe(cash);
    expect((s.hexBids ?? []).some((x) => x.productId === p.id)).toBe(false);
    expect(s.hexAuctionResults!.every((a) => a.companyId !== c.id)).toBe(true);
  });

  it('never takes a cell that received a valid bid which nobody won at this close', () => {
    const s = game();
    const { p } = stuckStartup(s);
    const [n1, n2] = byCapitalRoute(s);
    const b = companyOf(s, 'b');
    const product = b.products[0];
    move(s, 'b', n1, 1000);
    // The engagement check and the settlement of one cell read the move cost at two distinct instants of the
    // close; a capacity delivered in between (simulated here) keeps the bid valid but makes it unpayable, so
    // the cell stays unwon while remaining off-limits to fallbacks and forced departures.
    const capacity = product.capacity;
    let reads = 0;
    Object.defineProperty(product, 'capacity', { configurable: true, get: () => (reads++ === 0 ? capacity : 1e6) });
    const cash = b.cash;
    settle(s);
    Object.defineProperty(product, 'capacity', { configurable: true, writable: true, enumerable: true, value: capacity });
    const bid = s.hexBids!.find((x) => x.companyId === b.id && x.kind === 'move')!;
    expect(bid.result).toMatchObject({ outcome: 'failed', price: 0 });
    expect(product.pendingHexId).toBeUndefined();
    expect(b.cash).toBe(cash);
    expect(freeBuildableHexes(s)).toContain(n1);
    expect(p.pendingHexId).toBe(n2);
    const startupBid = s.hexBids!.find((x) => x.productId === p.id)!;
    expect(startupBid.result).toMatchObject({ outcome: 'fallback', hexId: n2, price: hexReservePrice(n2), bidders: 0 });
  });

  it('never takes a cell freed by a bankruptcy at this very close', () => {
    const s = game();
    const { p } = stuckStartup(s);
    const [n1, n2] = byCapitalRoute(s);
    awardHexes(s, realizeHexLaunch, new Set([n1]));
    expect(p.pendingHexId).toBe(n2);
    expect(p.landCost).toBe(hexReservePrice(n2));
    const bid = s.hexBids!.find((x) => x.productId === p.id)!;
    expect(bid.result).toMatchObject({ outcome: 'fallback', hexId: n2, price: hexReservePrice(n2), bidders: 0 });
  });
});
