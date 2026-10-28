import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { BUILDABLE, HEXES, hexDistance } from '../src/content/hexes';
import { getContent, hexPlaceName, SECTORS } from '../src/content';
import { ROAD_FACTOR, roadRoute } from '../src/content/map';
import { realizeHexLaunch } from '../src/sim/actions';
import { closeObligations, pendingBids, planClose } from '../src/sim/close';
import { LAUNCH_AMORTIZATION_TURNS, SITE_BOOK_VALUE_RATIO } from '../src/sim/constants';
import { awardSites, siteOpeningCost } from '../src/sim/deals';
import { bookValue } from '../src/sim/finance';
import { capitalHexId, FERRY_KM, freeBuildableHexes, occupiedHexes, zoneHexId } from '../src/sim/hexes';
import { awardHexes, hexAuctionArticle, hexReservePrice, pendingHexCommitments, routeBetweenHexes, HEX_RESERVE_CITY, HEX_RESERVE_NEAR, HEX_RESERVE_REMOTE } from '../src/sim/hexAuctions';
import { factoryMoveCost } from '../src/sim/transport';
import { tr } from '../src/sim/i18n';
import type { Action, CompanyState, GameState, HexAuctionResult, HexBid, ProductState } from '../src/types';
import { CITY_IDS, ZONE_IDS } from '../src/types';
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
function rejected(s: GameState, who: string, action: Action) {
  const before = JSON.stringify(s);
  const result = applyAction(s, who, action);
  expect(result.ok, result.message).toBe(false);
  expect(result.message).toBeTruthy();
  expect(JSON.stringify(s), result.message).toBe(before);
  return result;
}
function move(s: GameState, who: string, hexId: string, amount = hexReservePrice(hexId), p = companyOf(s, who).products[0], c = companyOf(s, who)) {
  return ok(s, who, { type: 'moveFactory', companyId: c.id, productId: p.id, hexId, bid: amount });
}
function launch(s: GameState, who: string, hexId: string, amount = hexReservePrice(hexId), fallback: 'nearest' | 'abandon' = 'abandon', name = 'Secret launch') {
  return ok(s, who, { type: 'launchProduct', companyId: companyOf(s, who).id, sectorId: 'gadgets', name, hexId, bid: amount, fallback });
}
const settle = (s: GameState) => awardHexes(s, realizeHexLaunch);
const resultOf = (s: GameState, who: string, kind?: HexBid['kind']) => s.hexBids!.find((b) => b.playerId === who && (!kind || b.kind === kind))!.result!;
const clone = (s: GameState) => structuredClone(s);
function extraPlant(c: CompanyState, hexId: string): ProductState {
  const p = { ...c.products[0], id: `${c.id}-extra`, hexId, terrainId: undefined, landCost: 0 };
  c.products.push(p);
  return p;
}
function comeback(s: GameState, who = 'a') {
  const previous = companyOf(s, who);
  previous.status = 'bankrupt'; previous.controllerId = null; previous.products = [];
  s.players[who].cash = 1e6;
  s.turn = 2;
}
function foundation(s: GameState, hexId: string, fallback: 'nearest' | 'abandon' = 'abandon', amount = hexReservePrice(hexId)) {
  ok(s, 'a', { type: 'foundStartup', sectorId: 'crypto', name: 'Incubator comeback', investment: 30_000, hexId, bid: amount, fallback });
  return companyOf(s, 'a');
}
function nearestByRoute(cells: string[], target: string): string {
  return [...cells].sort((a, b) => routeBetweenHexes(a, target) - routeBetweenHexes(b, target) || BUILDABLE.indexOf(a) - BUILDABLE.indexOf(b))[0];
}

describe('hex auction requests and secrecy (terrains §5)', () => {
  it('between-cell fallback routes retain the existing road network and the island ferry', () => {
    for (const from of ZONE_IDS) for (const to of ZONE_IDS) {
      if (from === to) continue;
      expect(routeBetweenHexes(zoneHexId(from), zoneHexId(to))).toBeCloseTo(roadRoute(from, to)!.cost, 8);
    }
    expect(routeBetweenHexes('A15', capitalHexId)).toBe(FERRY_KM * ROAD_FACTOR.highway);
    expect(routeBetweenHexes(capitalHexId, 'A15')).toBe(FERRY_KM * ROAD_FACTOR.highway);
  });

  it.each(['fr', 'en'] as const)('validates foundation cell, bid, fallback and company cash before any startup mutation (%s)', (lang) => {
    const s = game(42, lang); comeback(s); const target = freeBuildableHexes(s)[0];
    const base = { type: 'foundStartup' as const, sectorId: 'crypto' as const, name: 'Atomic foundation', investment: 30_000, hexId: target, bid: 400, fallback: 'nearest' as const };
    rejected(s, 'a', { ...base, fallback: undefined });
    rejected(s, 'a', { ...base, fallback: 'unknown' as 'nearest' });
    rejected(s, 'a', { ...base, bid: undefined });
    rejected(s, 'a', { ...base, hexId: undefined });
    rejected(s, 'a', { ...base, hexId: companyOf(s, 'b').products[0].hexId });
    rejected(s, 'a', { ...base, bid: hexReservePrice(target) - 0.0000005 });
    rejected(s, 'a', { ...base, bid: 31_000.0000005 });
  });

  it('counts pending launch projects when checking merged product slots before mutation', () => {
    const s = game(); const a = companyOf(s, 'a'), b = companyOf(s, 'b');
    a.productSlots = 6; const cells = freeBuildableHexes(s);
    for (let i = 0; i < 5; i++) launch(s, 'a', cells[i], 400, 'nearest', `Pending ${i}`);
    b.controllerId = 'a'; b.holdings = { a: 6000 }; extraPlant(b, cells[5]);
    rejected(s, 'a', { type: 'merge', absorberId: a.id, targetId: b.id });
    expect(a.products).toHaveLength(1); expect(b.status).toBe('active'); expect(s.hexBids).toHaveLength(5);
  });

  it('requires the exact reserve and full bid-plus-cost cash, even for a fractional shortfall', () => {
    const s = game(); const c = companyOf(s, 'a'), p = c.products[0]; const target = freeBuildableHexes(s)[0];
    const reserve = hexReservePrice(target);
    rejected(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: target, bid: reserve - 0.0000005 });
    c.cash = factoryMoveCost(s, p) + reserve - 0.0000005;
    rejected(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: target, bid: reserve });
    c.cash = 1e6; move(s, 'a', target, reserve);
    c.cash = factoryMoveCost(s, p) + reserve - 0.0000005;
    settle(s);
    expect(resultOf(s, 'a')).toMatchObject({ outcome: 'failed', price: 0 });
    expect(p.pendingHexId).toBeUndefined();
  });
  it('publishes the three city-distance reserves on every buildable cell, without treating the ferry as city adjacency', () => {
    const s = game();
    expect([HEX_RESERVE_CITY, HEX_RESERVE_NEAR, HEX_RESERVE_REMOTE]).toEqual([400, 250, 150]);
    expect(Object.values(s.companies).flatMap((c) => c.products).every((p) => p.landCost === 0)).toBe(true);
    const reserves = getPlayerView(s, 'a').hexes!.reserve;
    expect(Object.keys(reserves)).toEqual(BUILDABLE);
    for (const id of BUILDABLE) {
      const ring = Math.min(...CITY_IDS.map((city) => hexDistance(id, zoneHexId(city))));
      const expected = ring <= 1 ? 400 : ring === 2 ? 250 : 150;
      expect(hexReservePrice(id), id).toBe(expected);
      expect(reserves[id], id).toBe(expected);
    }
    expect(hexReservePrice('A15')).toBe(150);
    expect(getPlayerView(s, 'b').hexes!.reserve).toEqual(reserves);
  });

  it('records, replaces and cancels a secret move, keeping cash, cells and RNG unchanged until settlement', () => {
    const s = game(); const c = companyOf(s, 'a'), p = c.products[0];
    const [first, second] = freeBuildableHexes(s); const origin = p.hexId;
    const cash = c.cash, rng = s.rngState;
    const cost = factoryMoveCost(s, p);
    expect(cost, 'hex quarter-one moves are paid').toBeGreaterThan(0);
    move(s, 'a', first, 1000);
    expect(s.hexBids).toEqual([expect.objectContaining({ kind: 'move', companyId: c.id, playerId: 'a', productId: p.id, hexId: first, amount: 1000, turn: s.turn })]);
    expect(p.hexId).toBe(origin); expect(p.pendingHexId).toBeUndefined();
    expect(c.cash).toBe(cash); expect(s.rngState).toBe(rng);
    expect(occupiedHexes(s)[first]).toBeUndefined();
    expect(occupiedHexes(s)[origin!]).toBe(c.id);
    move(s, 'a', second, 1100);
    expect(s.hexBids).toHaveLength(1);
    expect(s.hexBids![0]).toMatchObject({ hexId: second, amount: 1100 });
    expect(pendingHexCommitments(s, c)).toBeCloseTo(1100 + cost, 8);
    ok(s, 'a', { type: 'cancelHexBid', companyId: c.id, productId: p.id });
    expect(s.hexBids ?? []).toHaveLength(0);
    expect(c.cash).toBe(cash); expect(p.hexId).toBe(origin); expect(s.rngState).toBe(rng);
  });

  it.each(['fr', 'en'] as const)('rejects malformed, blocked, occupied, below-reserve and unaffordable requests before mutation (%s)', (lang) => {
    const s = game(42, lang); const c = companyOf(s, 'a'), p = c.products[0];
    const target = freeBuildableHexes(s)[0];
    const deposit = HEXES.find((h) => h.deposit)!.id;
    for (const hexId of ['missing', '', '__proto__', null, 17, {}, deposit, p.hexId!, companyOf(s, 'b').products[0].hexId!]) {
      rejected(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: hexId as string, bid: 5000 });
      rejected(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Invalid', hexId: hexId as string, bid: 5000, fallback: 'nearest' });
    }
    for (const bid of [0, -1, Number.NaN, Infinity, hexReservePrice(target) - 1]) {
      rejected(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: target, bid });
      rejected(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Invalid', hexId: target, bid, fallback: 'nearest' });
    }
    rejected(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: target });
    rejected(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Invalid', hexId: target, bid: 500 });
    c.cash = hexReservePrice(target) + factoryMoveCost(s, p) - 1;
    rejected(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: target, bid: hexReservePrice(target) });
    c.cash = hexReservePrice(target) + SECTORS.gadgets.launchCost - 1;
    rejected(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Invalid', hexId: target, bid: hexReservePrice(target), fallback: 'abandon' });
    rejected(s, 'b', { type: 'cancelHexBid', companyId: c.id, productId: p.id });
  });

  it.each(['fr', 'en'] as const)('rejects all three bid kinds in the last quarter before mutation (%s)', (lang) => {
    const s = game(42, lang); const c = companyOf(s, 'a'); const target = freeBuildableHexes(s)[0];
    s.turn = s.config.totalTurns;
    rejected(s, 'a', { type: 'moveFactory', companyId: c.id, productId: c.products[0].id, hexId: target, bid: 400 });
    rejected(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Too late', hexId: target, bid: 400, fallback: 'nearest' });
    comeback(s); s.turn = s.config.totalTurns;
    rejected(s, 'a', { type: 'foundStartup', sectorId: 'crypto', name: 'Too late', investment: 30_000, hexId: target, bid: 400, fallback: 'nearest' });
  });

  it('allows rival bids but forbids one player bidding twice on a cell across all controlled companies and products', () => {
    const s = game(); const a = companyOf(s, 'a'), b = companyOf(s, 'b');
    const target = freeBuildableHexes(s)[0];
    b.controllerId = 'a'; b.holdings = { a: 6000 };
    move(s, 'a', target, 1000);
    rejected(s, 'a', { type: 'moveFactory', companyId: b.id, productId: b.products[0].id, hexId: target, bid: 900 });
    rejected(s, 'a', { type: 'launchProduct', companyId: a.id, sectorId: 'gadgets', name: 'Duplicate', hexId: target, bid: 900, fallback: 'nearest' });
    move(s, 'c', target, 800);
    expect(s.hexBids).toHaveLength(2);
  });

  it('reserves product slots with launch projects and frees the slot when a project is cancelled', () => {
    const s = game(); const c = companyOf(s, 'a'); const cells = freeBuildableHexes(s);
    const cash = c.cash, rng = s.rngState, journal = JSON.stringify(s.journal);
    for (let i = 0; i < 3; i++) launch(s, 'a', cells[i], 400, 'nearest', `Hidden ${i}`);
    expect(c.products).toHaveLength(1);
    expect(c.cash).toBe(cash); expect(s.rngState).toBe(rng); expect(JSON.stringify(s.journal)).toBe(journal);
    rejected(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Fifth slot', hexId: cells[3], bid: 400, fallback: 'nearest' });
    const projectId = s.hexBids![1].project!.id;
    ok(s, 'a', { type: 'cancelHexBid', companyId: c.id, projectId });
    launch(s, 'a', cells[3]);
    expect(s.hexBids!.filter((b) => b.kind === 'launch')).toHaveLength(3);
    c.productSlots = 6;
    launch(s, 'a', cells[4]); launch(s, 'a', cells[5]);
    rejected(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Seventh slot', hexId: cells[6], bid: 400, fallback: 'nearest' });
  });

  it('redacts every rival bid, fallback and launch project; only adjudications become public', () => {
    const s = game(); const a = companyOf(s, 'a'); const [target, other] = freeBuildableHexes(s);
    launch(s, 'a', target, 12_345, 'nearest', 'UNIQUE SECRET PROJECT');
    move(s, 'a', other, 2345);
    const own = getPlayerView(s, 'a'); const rival = getPlayerView(s, 'b');
    expect(own.self!.hexBids).toHaveLength(2);
    expect(own.companies.find((c) => c.id === a.id)!.private!.launchProjects).toEqual([expect.objectContaining({ name: 'UNIQUE SECRET PROJECT' })]);
    expect(rival.self!.hexBids ?? []).toHaveLength(0);
    expect(rival.companies.find((c) => c.id === a.id)!.products).toHaveLength(1);
    expect(rival.companies.find((c) => c.id === a.id)!.private).toBeUndefined();
    expect(JSON.stringify(rival)).not.toContain('UNIQUE SECRET PROJECT');
    expect(own.self!.hexBids).toContainEqual(expect.objectContaining({ amount: 12_345 }));
    // Hidden amounts must leave the entire rival view unchanged. A raw digit
    // substring can also occur inside an unrelated public floating-point value.
    const differentSecret = clone(s);
    differentSecret.hexBids![0].amount = 23_456;
    expect(getPlayerView(differentSecret, 'b')).toEqual(rival);
    expect(JSON.stringify(rival)).not.toContain('fallback');
    settle(s);
    const publicView = getPlayerView(s, 'b');
    expect(publicView.hexes!.results).toEqual(s.hexAuctionResults);
    expect(publicView.hexes!.results).toContainEqual(expect.objectContaining({ hexId: target, companyId: a.id, price: hexReservePrice(target), bidders: 1 }));
    expect(getPlayerView(s, 'a').self!.hexBids!.every((b) => !!b.result)).toBe(true);
    expect(JSON.stringify(publicView.hexes!.results)).not.toContain('12345');
  });
});

describe('direct settlement and cash backing', () => {
  it('a sole bidder pays the reserve plus moving cost, a losing move stays put and pays nothing, land counts half in book value', () => {
    const s = game(); const a = companyOf(s, 'a'), b = companyOf(s, 'b');
    const pa = a.products[0], pb = b.products[0]; const target = freeBuildableHexes(s)[0];
    const reserve = hexReservePrice(target), cost = factoryMoveCost(s, pa), cash = a.cash;
    const origin = pa.hexId;
    move(s, 'a', target, 10_000);
    settle(s);
    expect(resultOf(s, 'a')).toEqual({ outcome: 'won', hexId: target, price: reserve, bidders: 1 });
    expect(a.cash).toBeCloseTo(cash - reserve - cost, 8);
    expect(pa.pendingHexId).toBe(target); expect(pa.hexId).toBe(origin); expect(pa.landCost).toBe(reserve);
    expect(freeBuildableHexes(s)).not.toContain(origin);
    const withoutLand = { ...a, products: a.products.map((p) => ({ ...p, landCost: 0 })) };
    expect(bookValue(a) - bookValue(withoutLand)).toBeCloseTo(reserve * SITE_BOOK_VALUE_RATIO, 8);
    const next = freeBuildableHexes(s)[0]; const previous = pb.hexId, before = b.cash;
    move(s, 'a', next, 700); move(s, 'b', next, 500);
    settle(s);
    expect(resultOf(s, 'b').outcome).toBe('lost'); expect(resultOf(s, 'b').price).toBe(0);
    expect(pb.hexId).toBe(previous); expect(b.cash).toBe(before);
  });

  it('charges the best losing engaged amount, capped by the winner bid, independently for each cell', () => {
    const s = game(); const [target, other] = freeBuildableHexes(s);
    move(s, 'a', target, 1200); move(s, 'b', target, 900); move(s, 'c', target, 600); move(s, 'd', other, 9000);
    settle(s);
    expect(resultOf(s, 'a')).toMatchObject({ outcome: 'won', price: 900, bidders: 3 });
    expect(resultOf(s, 'd')).toMatchObject({ outcome: 'won', price: hexReservePrice(other), bidders: 1 });
    expect(s.hexAuctionResults!.map((r) => r.hexId)).toEqual([target, other]);
    for (const b of s.hexBids!) if (b.result!.outcome === 'won') expect(b.result!.price).toBeLessThanOrEqual(b.amount);
  });

  it('uses cash minus moving cost at settlement, ignores unaffordable rivals, and never pays more than the engaged amount', () => {
    const s = game(); const target = freeBuildableHexes(s)[0];
    const a = companyOf(s, 'a'), b = companyOf(s, 'b'), c = companyOf(s, 'c');
    move(s, 'a', target, 3000); move(s, 'b', target, 2000); move(s, 'c', target, 1900);
    a.cash = factoryMoveCost(s, a.products[0]) + 800;
    b.cash = factoryMoveCost(s, b.products[0]) + 700;
    c.cash = factoryMoveCost(s, c.products[0]) + hexReservePrice(target) - 1;
    settle(s);
    expect(resultOf(s, 'a')).toMatchObject({ outcome: 'won', price: 700, bidders: 2 });
    expect(a.cash).toBeCloseTo(100, 8);
    expect(resultOf(s, 'c')).toMatchObject({ outcome: 'failed', price: 0 });
  });

  it('settles a company multiple bids in board order against its remaining cash', () => {
    const s = game(); const c = companyOf(s, 'a'); const cells = freeBuildableHexes(s);
    const first = cells[0], second = cells[1]; const q = extraPlant(c, cells[2]);
    const costA = factoryMoveCost(s, c.products[0]), costB = factoryMoveCost(s, q);
    move(s, 'a', second, 1000, q); move(s, 'a', first, 1000);
    c.cash = costA + hexReservePrice(first) + costB + hexReservePrice(second) - 1;
    settle(s);
    const results = s.hexBids!;
    expect(results.find((b) => b.hexId === first)!.result!.outcome).toBe('won');
    expect(results.find((b) => b.hexId === second)!.result!.outcome).toBe('failed');
    expect(q.hexId).toBe(cells[2]); expect(c.cash).toBeGreaterThanOrEqual(0);
  });

  it('reserves the sum of land, move, launch and site bids in estimates; changed-control commitments disappear', () => {
    const s = game(); const c = companyOf(s, 'a'); const [first, second] = freeBuildableHexes(s);
    move(s, 'a', first, 1000); launch(s, 'a', second, 2000);
    ok(s, 'a', { type: 'bidSite', companyId: c.id, slotId: 'sugar-1', amount: siteOpeningCost('sugar') });
    const hex = 3000 + factoryMoveCost(s, c.products[0]) + SECTORS.gadgets.launchCost;
    const total = hex + siteOpeningCost('sugar');
    expect(pendingHexCommitments(s, c)).toBe(hex);
    expect(pendingBids(s, c)).toBe(total);
    expect(planClose(s, c).bids).toBe(total);
    expect(getPlayerView(s, 'a').companies.find((v) => v.id === c.id)!.private!.pendingHexCommitment).toBe(hex);
    expect(getPlayerView(s, 'a').companies.find((v) => v.id === c.id)!.private!.closePlan!.bids).toBe(total);
    c.controllerId = 'b';
    expect(pendingBids(s, c)).toBe(0);
    expect(getPlayerView(s, 'b').self!.hexBids ?? []).toHaveLength(0);
    rejected(s, 'b', { type: 'cancelHexBid', companyId: c.id, productId: c.products[0].id });
  });

  it('settles land after sites and uses sales collected in that close', () => {
    const s = game(); const c = companyOf(s, 'a'); const p = c.products[0], target = freeBuildableHexes(s)[0];
    move(s, 'a', target, 1000);
    ok(s, 'a', { type: 'bidSite', companyId: c.id, slotId: 'sugar-1', amount: siteOpeningCost('sugar') });
    c.cash = siteOpeningCost('sugar') + factoryMoveCost(s, p) + hexReservePrice(target) - 1;
    awardSites(s); settle(s);
    expect(c.sites).toHaveLength(1); expect(resultOf(s, 'a').outcome).toBe('failed');
    const salesGame = game(); const seller = companyOf(salesGame, 'a'); const plant = seller.products[0];
    const destination = freeBuildableHexes(salesGame)[0];
    move(salesGame, 'a', destination, 1000);
    plant.stock = 100; plant.lastUnitCost = 1;
    seller.cash = closeObligations(salesGame, seller).total + factoryMoveCost(salesGame, plant) + hexReservePrice(destination) - 1;
    resolveTurn(salesGame);
    expect(seller.reports.at(-1)!.revenue).toBeGreaterThan(0);
    expect(resultOf(salesGame, 'a').outcome).toBe('won');
  });

  it('drops bids when control changes, the company is inactive, or it goes bankrupt at this close', () => {
    for (const failure of ['takeover', 'inactive', 'bankrupt'] as const) {
      const s = game(); const c = companyOf(s, 'a'); const target = freeBuildableHexes(s)[0]; const origin = c.products[0].hexId;
      move(s, 'a', target);
      if (failure === 'takeover') c.controllerId = 'b';
      else if (failure === 'inactive') c.status = 'merged';
      else { c.cash = 0; c.taxDue = 1e9; }
      if (failure === 'bankrupt') resolveTurn(s); else settle(s);
      expect(resultOf(s, 'a')).toMatchObject({ outcome: 'failed', price: 0 });
      expect(occupiedHexes(s)[target]).toBeUndefined();
      if (failure === 'takeover') expect(c.products[0].hexId).toBe(origin);
    }
  });

  it('keeps cells occupied at settlement start unavailable even when a move frees them in board order', () => {
    const s = game(); const a = companyOf(s, 'a'), b = companyOf(s, 'b');
    const origin = a.products[0].hexId!; const target = freeBuildableHexes(s)[0];
    move(s, 'a', target);
    s.hexBids!.push({ kind: 'move', companyId: b.id, playerId: 'b', productId: b.products[0].id, hexId: origin, amount: 1000, turn: s.turn });
    settle(s);
    expect(resultOf(s, 'a').outcome).toBe('won'); expect(resultOf(s, 'b').outcome).toBe('failed');
    expect(freeBuildableHexes(s)).not.toContain(origin);
    resolveTurn(s);
    expect(freeBuildableHexes(s)).toContain(origin);
    move(s, 'b', origin); settle(s);
    expect(resultOf(s, 'b').outcome).toBe('won');
  });

  it('ties use the secret seed, never RNG, submission order, language or the text seed', () => {
    const winners = new Set<string>();
    for (let seed = 1; seed <= 16; seed++) {
      const s = game(seed); const target = freeBuildableHexes(s)[0];
      move(s, 'a', target, 900); move(s, 'b', target, 900);
      const reordered = clone(s); reordered.hexBids!.reverse(); reordered.rngState ^= 0x12345; reordered.config.textSeed = 987654;
      reordered.config.lang = 'en';
      const rng = s.rngState, otherRng = reordered.rngState;
      settle(s); settle(reordered);
      const winner = s.hexAuctionResults![0].companyId;
      expect(reordered.hexAuctionResults![0].companyId).toBe(winner);
      expect(s.rngState).toBe(rng); expect(reordered.rngState).toBe(otherRng);
      expect(s.hexAuctionResults![0].price).toBe(900); winners.add(winner);
    }
    expect(winners.size).toBe(2);
  });
});

describe('launch, fallback and incubator lifecycle', () => {
  it('launches and charges only at close, emits the launch then, and first sells next quarter', () => {
    const s = game(); const c = companyOf(s, 'a'); const target = freeBuildableHexes(s)[0];
    const beforeCash = c.cash, turn = s.turn; const baseReports = c.reports.length;
    launch(s, 'a', target, 1000, 'abandon', 'Deferred product');
    expect(c.cash).toBe(beforeCash); expect(c.products).toHaveLength(1); expect(c.launchCharges ?? []).toHaveLength(0);
    expect(s.journal.flatMap((j) => j.articles).some((a) => a.event?.type === 'productLaunch' && a.companyIds?.includes(c.id))).toBe(false);
    resolveTurn(s);
    const p = c.products.find((p) => p.name === 'Deferred product')!;
    expect(p.hexId).toBe(target); expect(p.landCost).toBe(hexReservePrice(target));
    expect(p.lastSales ?? 0).toBe(0); expect(p.lastProduced ?? 0).toBe(0);
    expect(c.reports).toHaveLength(baseReports + 1);
    expect(c.reports.at(-1)!.amortization).toBeCloseTo(SECTORS.gadgets.launchCost / LAUNCH_AMORTIZATION_TURNS, 8);
    expect(c.launchCharges).toEqual([{ perTurn: SECTORS.gadgets.launchCost / LAUNCH_AMORTIZATION_TURNS, turnsLeft: LAUNCH_AMORTIZATION_TURNS - 1 }]);
    expect(c.cash).toBeCloseTo(beforeCash - closeObligations(game(), companyOf(game(), 'a')).total - SECTORS.gadgets.launchCost - hexReservePrice(target), 8);
    const articles = s.journal.at(-1)!.articles;
    expect(s.journal.at(-1)!.turn).toBe(turn + 1);
    expect(articles.some((a) => a.event?.type === 'productLaunch' && a.event.productId === p.id)).toBe(true);
    expect(s.turn).toBe(turn + 1);
    c.cash = 1e6; p.production = SECTORS.gadgets.startingCapacity * 0.8;
    resolveTurn(s);
    expect(p.lastProduced).toBeGreaterThan(0); expect(p.lastSales).toBeGreaterThan(0);
  });

  it('losing with abandon creates no product, launch charges or costs, and expires at the next settlement', () => {
    const s = game(); const target = freeBuildableHexes(s)[0]; const c = companyOf(s, 'a'), cash = c.cash;
    launch(s, 'a', target, 500, 'abandon'); move(s, 'b', target, 700);
    settle(s);
    expect(resultOf(s, 'a')).toMatchObject({ outcome: 'abandoned', price: 0 });
    expect(c.products).toHaveLength(1); expect(c.cash).toBe(cash); expect(c.launchCharges ?? []).toHaveLength(0);
    expect(getPlayerView(s, 'a').self!.hexBids![0].result!.outcome).toBe('abandoned');
    expect(getPlayerView(s, 'a').companies.find((v) => v.id === c.id)!.private!.launchProjects ?? []).toHaveLength(0);
    settle(s);
    expect(s.hexBids).toBeUndefined(); expect(s.hexAuctionResults ?? []).toHaveLength(0);
  });

  it('fallback takes the nearest free cell by road at its reserve and never takes any cell with a valid direct bid', () => {
    const s = game(); const [target, protectedCell] = freeBuildableHexes(s);
    launch(s, 'a', target, 500, 'nearest'); move(s, 'b', target, 900); move(s, 'c', protectedCell, 700);
    const candidates = freeBuildableHexes(s).filter((id) => id !== target && id !== protectedCell);
    const expected = nearestByRoute(candidates, target);
    settle(s);
    expect(resultOf(s, 'a')).toEqual({ outcome: 'fallback', hexId: expected, price: hexReservePrice(expected), bidders: 2 });
    expect(companyOf(s, 'a').products.at(-1)!.hexId).toBe(expected);
    expect(resultOf(s, 'c').hexId).toBe(protectedCell);
    expect(s.hexAuctionResults!.find((r) => r.companyId === companyOf(s, 'a').id)).toMatchObject({ fallback: true, hexId: expected });
  });

  it('withdrawn and invalid bids leave their cells eligible for fallback, including a cell with only an unaffordable direct bid', () => {
    for (const invalid of ['withdrawn', 'cash'] as const) {
      const s = game(); const cells = freeBuildableHexes(s); const target = cells[0];
      const fallbackCell = nearestByRoute(cells.filter((id) => id !== target), target);
      launch(s, 'a', target, 500, 'nearest'); move(s, 'b', target, 900); move(s, 'c', fallbackCell, 1000);
      const c = companyOf(s, 'c');
      if (invalid === 'withdrawn') ok(s, 'c', { type: 'cancelHexBid', companyId: c.id, productId: c.products[0].id });
      else c.cash = factoryMoveCost(s, c.products[0]) + hexReservePrice(fallbackCell) - 1;
      settle(s);
      expect(resultOf(s, 'a').hexId).toBe(fallbackCell);
      expect(companyOf(s, 'a').products.at(-1)!.landCost).toBe(hexReservePrice(fallbackCell));
    }
  });

  it('orders fallbacks by secret seed and gives each its own nearest remaining cell independently of insertion order and RNG', () => {
    const firstRecipients = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = game(seed); const target = freeBuildableHexes(s)[0];
      launch(s, 'a', target, 500, 'nearest'); launch(s, 'b', target, 600, 'nearest'); move(s, 'c', target, 900);
      const nearest = nearestByRoute(freeBuildableHexes(s).filter((id) => id !== target), target);
      const reordered = clone(s); reordered.hexBids!.reverse(); reordered.rngState ^= 0x45678;
      const rng = s.rngState, otherRng = reordered.rngState;
      settle(s); settle(reordered);
      expect(reordered.hexAuctionResults).toEqual(s.hexAuctionResults);
      expect(s.rngState).toBe(rng); expect(reordered.rngState).toBe(otherRng);
      const fallbacks = s.hexAuctionResults!.filter((r) => r.fallback);
      expect(fallbacks).toHaveLength(2); expect(fallbacks[0].hexId).toBe(nearest);
      expect(fallbacks[1].hexId).toBe(nearestByRoute(freeBuildableHexes(game(seed)).filter((id) => id !== target && id !== nearest), target));
      firstRecipients.add(fallbacks[0].companyId);
    }
    expect(firstRecipients.size).toBe(2);
  });

  it('abandons an unfunded fallback or full-board fallback without charging launch or land', () => {
    for (const exhausted of ['cash', 'board'] as const) {
      const s = game(); const target = freeBuildableHexes(s).find((id) => hexReservePrice(id) === 150)!;
      const c = companyOf(s, 'a'), owner = companyOf(s, 'd');
      launch(s, 'a', target, 500, 'nearest'); move(s, 'b', target, 900);
      if (exhausted === 'cash') c.cash = SECTORS.gadgets.launchCost + hexReservePrice(target);
      const fill = freeBuildableHexes(s).filter((id) => id !== target && (exhausted === 'board' || hexReservePrice(id) < 400));
      for (const [i, id] of fill.entries()) owner.products.push({ ...owner.products[0], id: `fill-${i}`, hexId: id });
      const cash = c.cash;
      settle(s);
      expect(resultOf(s, 'a')).toMatchObject({ outcome: 'abandoned', price: 0 });
      expect(c.cash).toBe(cash); expect(c.products).toHaveLength(1); expect(c.launchCharges ?? []).toHaveLength(0);
    }
  });

  it('a startup sells in the capital incubator at foundation, never displaces bidders, and can bid again after abandonment', () => {
    const s = game(); comeback(s); const target = freeBuildableHexes(s)[0]; const startup = foundation(s, target);
    const p = startup.products[0];
    expect(p.hexId).toBeUndefined(); expect(p.incubator).toBe(true); expect(p.landCost ?? 0).toBe(0);
    expect(startup.terrainId).toBeUndefined(); expect(p.terrainId).toBeUndefined();
    expect(occupiedHexes(s)[target]).toBeUndefined();
    const publicPlant = getPlayerView(s, 'b').companies.find((c) => c.id === startup.id)!.products[0];
    expect(publicPlant.incubator).toBe(true); expect(publicPlant.hexId).toBeUndefined();
    const privatePlant = getPlayerView(s, 'a').companies.find((c) => c.id === startup.id)!.products[0].private!;
    expect(privatePlant.heatCredit).toBe(0);
    expect(privatePlant.zones.moveCost).toBe(0); expect(privatePlant.hexes!.moveCost).toBe(0);
    move(s, 'b', target, 700);
    resolveTurn(s);
    expect(p.lastSales).toBeGreaterThan(0);
    expect(p.hexId).toBeUndefined(); expect(p.incubator).toBe(true);
    expect(resultOf(s, 'a', 'startup').outcome).toBe('abandoned');
    expect(companyOf(s, 'b').products[0].hexId).toBe(target);
    const destination = freeBuildableHexes(s)[0];
    ok(s, 'a', { type: 'moveFactory', companyId: startup.id, productId: p.id, hexId: destination, bid: 500, fallback: 'nearest' });
    expect(s.hexBids!.find((b) => !b.result && b.companyId === startup.id)!.kind).toBe('startup');
    settle(s);
    expect(p.pendingHexId).toBe(destination); expect(p.incubator).toBe(true);
    expect(p.landCost).toBe(hexReservePrice(destination));
    resolveTurn(s);
    expect(p.hexId).toBe(destination); expect(p.incubator).toBeUndefined();
  });


  it('a startup sells from the incubator and obtains its own cell at the founding close without relocation or launch charges', () => {
    const s = game(); comeback(s); const target = freeBuildableHexes(s)[0]; const c = foundation(s, target, 'nearest');
    const p = c.products[0];
    expect(p.hexId).toBeUndefined(); expect(p.incubator).toBe(true);
    resolveTurn(s);
    expect(p.lastSales).toBeGreaterThan(0); expect(p.hexId).toBe(target); expect(p.incubator).toBeUndefined();
    expect(resultOf(s, 'a', 'startup')).toMatchObject({ outcome: 'won', hexId: target, price: hexReservePrice(target), bidders: 1 });
    expect(c.reports.at(-1)!.specialCharges ?? 0).toBe(0); expect(c.reports.at(-1)!.amortization ?? 0).toBe(0);
    expect(c.launchCharges ?? []).toHaveLength(0); expect(p.landCost).toBe(hexReservePrice(target));
  });
  it('startup fallback cannot take a cell from its direct bidders', () => {
    const s = game(); comeback(s); const [target, protectedCell] = freeBuildableHexes(s);
    const startup = foundation(s, target, 'nearest', 500);
    move(s, 'b', target, 900); move(s, 'c', protectedCell, 600);
    const expected = nearestByRoute(freeBuildableHexes(s).filter((id) => id !== target && id !== protectedCell), target);
    resolveTurn(s);
    expect(resultOf(s, 'a', 'startup').outcome).toBe('fallback');
    expect(startup.products[0].hexId).toBe(expected);
    expect(startup.products[0].hexId).not.toBe(target); expect(startup.products[0].hexId).not.toBe(protectedCell);
    expect(startup.products[0].pendingHexId).toBeUndefined();
    expect(startup.products[0].incubator).toBeUndefined();
    expect(companyOf(s, 'b').products[0].hexId).toBe(target); expect(companyOf(s, 'c').products[0].hexId).toBe(protectedCell);
  });

  it('frees paid land on move, discontinuation and bankruptcy, and transfers it unchanged in a merger', () => {
    const s = game(); const a = companyOf(s, 'a'), b = companyOf(s, 'b');
    const old = a.products[0].hexId!; a.products[0].landCost = 999;
    const target = freeBuildableHexes(s)[0]; const cash = a.cash, cost = factoryMoveCost(s, a.products[0]);
    move(s, 'a', target, 1000); settle(s);
    expect(a.products[0].landCost).toBe(hexReservePrice(target)); expect(freeBuildableHexes(s)).not.toContain(old);
    expect(a.cash).toBeCloseTo(cash - cost - hexReservePrice(target), 8);
    resolveTurn(s);
    expect(freeBuildableHexes(s)).toContain(old);
    const q = b.products[0], acquired = q.hexId!; q.landCost = 987;
    b.controllerId = 'a'; b.holdings = { a: 6000 };
    ok(s, 'a', { type: 'merge', absorberId: a.id, targetId: b.id });
    expect(a.products.find((p) => p.id === q.id)!.landCost).toBe(987); expect(occupiedHexes(s)[acquired]).toBe(a.id);
    ok(s, 'a', { type: 'discontinueProduct', companyId: a.id, productId: q.id });
    expect(freeBuildableHexes(s)).toContain(acquired);
    a.cash = 0; a.taxDue = 1e9; resolveTurn(s);
    expect(a.status).toBe('bankrupt'); expect(a.products).toHaveLength(0); expect(freeBuildableHexes(s)).toContain(target);
  });

  it.each(['fr', 'en'] as const)('announces adjudications using localized content, public cells, prices and bidder counts (%s)', (lang) => {
    const s = game(42, lang); const target = freeBuildableHexes(s)[0];
    move(s, 'a', target, 700); move(s, 'b', target, 500);
    resolveTurn(s);
    const place = hexPlaceName(target, lang, s.siteSlots);
    expect(place).not.toBe(target);
    const article = s.journal.flatMap((j) => j.articles).find((a) => a.kind === 'results' && a.companyIds?.includes(companyOf(s, 'a').id) && (a.title + a.body).includes(place))!;
    expect(article).toBeDefined(); expect(article.title + article.body).toContain(place);
    expect(article.title + article.body).not.toContain(target);
    expect(article.title + article.body).not.toMatch(/\{(?:hex|company|price|bidders)\}/);
    expect(s.hexAuctionResults).toContainEqual(expect.objectContaining({ hexId: target, price: 500, bidders: 2 }));
    expect(article.title + article.body).toContain(lang === 'fr' ? '€' : '$');
  });


  it.each(['fr', 'en'] as const)('selects all six imported auction stories by the public situation and announces startup departures (%s)', (lang) => {
    const s = game(42, lang), c = companyOf(s, 'a');
    const scenarios: { id: string; result: Partial<HexAuctionResult> }[] = [
      { id: 'auction-hex-1', result: { bidders: 2, price: 500 } },
      { id: 'auction-hex-2', result: { bidders: 1, price: 400 } },
      { id: 'auction-hex-3', result: { bidders: 1, price: 150, reserve: 150 } },
      { id: 'auction-hex-4', result: { bidders: 2, price: 400 } },
      { id: 'auction-hex-5', result: { bidders: 0, fallback: true } },
      { id: 'auction-hex-6', result: { bidders: 1, failedContenders: true } },
    ];
    const rng = s.rngState;
    for (const scenario of scenarios) {
      const result: HexAuctionResult = { hexId: 'C3', companyId: c.id, playerId: 'a', kind: 'move', price: 400, reserve: 400, bidders: 1, fallback: false, ...scenario.result };
      const story = getContent(lang).terrains.auctions.find((a) => a.id === scenario.id)!;
      const article = hexAuctionArticle(s, result)!;
      const render = (template: string) => template.replace(/\{(hex|company|price|bidders)\}/g, (_, key: string) =>
        ({ hex: hexPlaceName(result.hexId, lang, s.siteSlots), company: c.name, price: tr(s).money(result.price), bidders: String(result.bidders) })[key as 'hex']);
      expect(article.title).toBe(render(story.headline));
      expect(article.body).toContain(render(story.body));
      expect(article.body).not.toMatch(/\{\w+\}/);
      expect(article.companyIds).toEqual([c.id]);
      if (scenario.id === 'auction-hex-2') {
        expect(story.body).not.toContain('{bidders}');
        expect(article.body).not.toMatch(/\b1 (?:prétendants|hopefuls)\b/);
        expect(article.body).toContain(lang === 'fr' ? 'Personne d’autre ne s’est présenté au guichet' : 'Nobody else turned up at the counter');
      }
    }
    const startup = hexAuctionArticle(s, { hexId: 'C3', companyId: c.id, playerId: 'a', kind: 'startup', price: 400, reserve: 400, bidders: 1, fallback: false })!;
    expect(startup.body).toContain(tr(s).act.hexStartupBody);
    expect(s.rngState).toBe(rng);
  });
  it('same seed and same actions produce identical close states, and classic actions do not create auction state', () => {
    const s = game(); const [one, two] = freeBuildableHexes(s);
    move(s, 'a', one, 700); move(s, 'b', one, 700); launch(s, 'c', two, 600, 'nearest');
    const repeated = clone(s); resolveTurn(s); resolveTurn(repeated);
    expect(repeated).toEqual(s);
    const classic = createGame(config(42, 8), [human('a')]); const c = companyOf(classic, 'a');
    c.cash = 1e6;
    ok(classic, 'a', { type: 'moveFactory', companyId: c.id, productId: c.products[0].id, zoneId: 'north' });
    ok(classic, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Classic' });
    expect(classic.hexBids).toBeUndefined(); expect(classic.hexAuctionResults).toBeUndefined();
    expect(getPlayerView(classic, 'a').hexes).toBeUndefined();
    expect(c.products.every((p) => p.landCost === undefined)).toBe(true);
  });
});
