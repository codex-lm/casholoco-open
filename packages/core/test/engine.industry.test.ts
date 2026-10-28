import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { SECTORS } from '../src/content';
import { realizeHexFactory, realizeHexLaunch } from '../src/sim/actions';
import { brandAfter, qualityAfter, estimateSales, marketInputs } from '../src/sim/advice';
import { demandFrom, expectedOutlook, plannedAttractiveness } from '../src/sim/close';
import { bookValue, estimatedUnitCost } from '../src/sim/finance';
import { freeBuildableHexes, occupiedHexes } from '../src/sim/hexes';
import { awardHexes, bareLandReserve, hexReservePrice, vacantLandUpkeep } from '../src/sim/hexAuctions';
import { ownedLand, productCount, factoryCapacityLimit } from '../src/sim/industry';
import { botFactoryNetwork } from '../src/sim/botIndustry';
import { expertTurn } from '../src/sim/botExpert';
import { NEUTRAL_PERSONALITY } from '../src/sim/bots';
import type { Action, ExpertMemory, Lang } from '../src/types';
import { companyOf, config, human } from './helpers';

function game(lang: Lang = 'fr') {
  const s = createGame({ ...config(42, 8), lang, mapMode: 'hex', industryRules: 'network', terrainAssignment: 'host',
    terrains: { a: 'quai-port-dividende', b: 'faubourgs-croissance' } }, [human('a', 'gadgets'), human('b', 'yogurts')]);
  s.activeEffects = [];
  for (const c of Object.values(s.companies)) { c.cash = 1e6; c.inventory = {}; for (const p of c.products) { p.production = p.capacity; p.marketing = 0; p.rnd = 0; } }
  return s;
}
function ok(s: ReturnType<typeof game>, a: Action, actor = 'a') {
  const r = applyAction(s, actor, a); expect(r.ok, r.message).toBe(true); return r;
}
function reject(s: ReturnType<typeof game>, a: Action, actor = 'a') {
  const before = JSON.stringify(s); const r = applyAction(s, actor, a);
  expect(r.ok, r.message).toBe(false); expect(JSON.stringify(s)).toBe(before);
}
const settle = (s: ReturnType<typeof game>) => awardHexes(s, realizeHexLaunch, undefined, realizeHexFactory);
function buy(s: ReturnType<typeof game>, hexId = freeBuildableHexes(s)[0]) {
  const c = companyOf(s, 'a'), bid = bareLandReserve(s, 'a', hexId);
  ok(s, { type: 'bidLand', companyId: c.id, hexId, bid }); settle(s); return { c, hexId, bid };
}

describe('independent land and a shared product across fixed factories', () => {
  it('awards bare land without a product, reserves it, and doubles the next minimum', () => {
    const s = game(), count = companyOf(s, 'a').products.length;
    const { c, hexId, bid } = buy(s);
    expect(c.products).toHaveLength(count); expect(c.land).toContainEqual({ hexId, cost: bid });
    expect(occupiedHexes(s)[hexId]).toBe(c.id); expect(freeBuildableHexes(s)).not.toContain(hexId);
    const next = freeBuildableHexes(s)[0]; expect(bareLandReserve(s, 'a', next)).toBe(2 * hexReservePrice(next));
    expect(vacantLandUpkeep(c)).toBe(.05 * bid);
    expect(getPlayerView(s, 'a').companies.find(x => x.id === c.id)?.land).toContainEqual({ hexId, cost: bid, vacant: true, upkeep: .05 * bid });
  });
  it('replaces a player’s land bid across controlled companies and permits withdrawal by cell', () => {
    const s = game(), c = companyOf(s, 'a'), other = companyOf(s, 'b'); other.controllerId = 'a';
    const [h1, h2] = freeBuildableHexes(s);
    ok(s, { type: 'bidLand', companyId: c.id, hexId: h1, bid: bareLandReserve(s, 'a', h1) });
    ok(s, { type: 'bidLand', companyId: c.id, hexId: h1, bid: bareLandReserve(s, 'a', h1) + 10 });
    expect(s.hexBids?.filter(b => !b.result)).toHaveLength(1);
    expect(s.hexBids?.[0].amount).toBe(bareLandReserve(s, 'a', h1) + 10);
    ok(s, { type: 'bidLand', companyId: other.id, hexId: h2, bid: bareLandReserve(s, 'a', h2) });
    expect(s.hexBids?.filter(b => !b.result && b.kind === 'land')).toHaveLength(1);
    ok(s, { type: 'cancelHexBid', companyId: other.id, hexId: h2 }); expect(s.hexBids).toBeUndefined();
  });
  it('counts vacant parcels across companies and uses the winner’s personal minimum at second price', () => {
    const s = game(), c = companyOf(s, 'a'), other = companyOf(s, 'b');
    buy(s); const target = freeBuildableHexes(s)[0], base = hexReservePrice(target);
    ok(s, { type: 'bidLand', companyId: c.id, hexId: target, bid: base * 3 });
    ok(s, { type: 'bidLand', companyId: other.id, hexId: target, bid: base }, 'b');
    settle(s); expect(s.hexAuctionResults?.find(a => a.hexId === target)?.price).toBe(2 * base);
    other.controllerId = 'a'; expect(bareLandReserve(s, 'a', freeBuildableHexes(s)[0])).toBe(4 * hexReservePrice(freeBuildableHexes(s)[0]));
  });
  it('building on owned land pays only construction and adds a factory of the existing product', () => {
    const s = game(), { c, hexId } = buy(s), source = c.products[0], cash = c.cash;
    ok(s, { type: 'buildFactory', companyId: c.id, productId: source.id, hexId });
    expect(c.cash).toBe(cash - SECTORS[source.sectorId].launchCost);
    const second = c.products.at(-1)!;
    expect(second.factoryProductId).toBe(source.id); expect(source.factoryProductId).toBe(source.id);
    expect(productCount(c)).toBe(1); expect(second.capacity).toBe(0); expect(second.pendingCapacity).toBe(SECTORS[source.sectorId].startingCapacity);
    expect(second.hexId).toBe(hexId); expect(vacantLandUpkeep(c)).toBe(0);
    resolveTurn(s); expect(second.capacity).toBe(SECTORS[source.sectorId].startingCapacity);
  });
  it('a new-product launch on owned land pays no auction and uses a commercial product slot', () => {
    const s = game(), { c, hexId } = buy(s), cash = c.cash;
    ok(s, { type: 'launchProduct', companyId: c.id, hexId, sectorId: 'scooters', name: 'Second brand' });
    expect(c.cash).toBe(cash - SECTORS.scooters.launchCost); expect(productCount(c)).toBe(2);
    expect(c.products.at(-1)?.hexId).toBe(hexId); expect(s.hexBids?.some(b => !b.result)).toBe(false);
  });
  it('an additional factory bids for free land, charging land and construction once', () => {
    const s = game(), c = companyOf(s, 'a'), source = c.products[0], hexId = freeBuildableHexes(s)[0], base = hexReservePrice(hexId), cash = c.cash;
    ok(s, { type: 'buildFactory', companyId: c.id, productId: source.id, hexId, bid: base });
    expect(c.products).toHaveLength(1); resolveTurn(s);
    expect(c.products).toHaveLength(2); expect(c.land?.find(l => l.hexId === hexId)?.cost).toBe(base);
    expect(c.cash).toBeLessThan(cash - base - SECTORS[source.sectorId].launchCost);
    expect(c.products.at(-1)?.hexId).toBe(hexId);
  });
  it('price and budgets edit the common product from either factory, production stays local, budgets are charged once', () => {
    const s = game(), { c, hexId } = buy(s), first = c.products[0];
    ok(s, { type: 'buildFactory', companyId: c.id, productId: first.id, hexId });
    const second = c.products.at(-1)!;
    ok(s, { type: 'setProductDecisions', companyId: c.id, productId: second.id, price: first.price * 1.1, marketing: 20, rnd: 10, production: 7 });
    expect(first.price).toBe(second.price); expect(first.production).not.toBe(second.production);
    expect(c.products.reduce((n, p) => n + p.marketing, 0)).toBe(20);
    const view = getPlayerView(s, 'a').companies.find(x => x.id === c.id)!;
    expect(view.products.every(p => p.private?.marketing === 20 && p.private?.rnd === 10)).toBe(true);
    const q = qualityAfter(first.sectorId, first.quality, 10), b = brandAfter(first.sectorId, first.brand, 20);
    delete c.products[0].terrainId; delete c.terrainId;
    resolveTurn(s); expect(first.quality).toBeCloseTo(q, 10); expect(second.quality).toBe(first.quality);
    expect(first.brand).toBeCloseTo(b, 10); expect(second.brand).toBe(first.brand);
    expect(c.reports.at(-1)?.marketing).toBe(20); expect(c.reports.at(-1)?.rnd).toBe(10);
  });
  it('a second factory does not duplicate attraction or demand, and margin assigns shared costs once', () => {
    const s = game(), { c, hexId } = buy(s), first = c.products[0];
    delete first.terrainId; delete c.terrainId;
    const initial = plannedAttractiveness(c, first, 1, s);
    ok(s, { type: 'buildFactory', companyId: c.id, productId: first.id, hexId }); const second = c.products.at(-1)!;
    second.capacity = first.capacity; second.pendingCapacity = 0; second.production = first.production; second.hexId = first.hexId;
    expect(c.products.reduce((n, p) => n + plannedAttractiveness(c, p, 1, s), 0)).toBeCloseTo(initial, 10);
    ok(s, { type: 'setProductDecisions', companyId: c.id, productId: first.id, marketing: 12, rnd: 6 });
    const estimates = c.products.map(p => estimateSales(p.sectorId, marketInputs(s, c, p, 'a', estimatedUnitCost(s, c, p)), { ...p, marketing: 12, rnd: 6 }));
    expect(estimates[0].demand).toBeCloseTo(estimates[1].demand, 10);
    const charged = estimates.reduce((sum, e, i) => sum + e.revenue - c.products[i].production * estimatedUnitCost(s, c, c.products[i]) - SECTORS[first.sectorId].fixedCost - e.margin, 0);
    expect(charged).toBeCloseTo(18, 8);
  });
  it('extensions cannot bypass the immutable twofold cap, including split pending orders', () => {
    const s = game(), c = companyOf(s, 'a'), p = c.products[0], initial = p.initialCapacity!;
    ok(s, { type: 'expandCapacity', companyId: c.id, productId: p.id, lots: Math.floor(initial / 2) });
    ok(s, { type: 'expandCapacity', companyId: c.id, productId: p.id, lots: initial - Math.floor(initial / 2) });
    reject(s, { type: 'expandCapacity', companyId: c.id, productId: p.id, lots: 1 });
    resolveTurn(s); expect(p.capacity).toBe(2 * initial); expect(factoryCapacityLimit(p)).toBe(2 * initial);
    reject(s, { type: 'expandCapacity', companyId: c.id, productId: p.id, lots: 1 });
    reject(s, { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: freeBuildableHexes(s)[0], bid: 1000 });
  });
  it('factory estimates and the close planner agree, and actual demand is conserved at identical positions', () => {
    const s = game(), { c, hexId } = buy(s), first = c.products[0];
    delete first.terrainId; delete c.terrainId; first.stock = 0;
    const single = structuredClone(s);
    ok(s, { type: 'buildFactory', companyId: c.id, productId: first.id, hexId }); const second = c.products.at(-1)!;
    second.capacity = first.capacity; second.pendingCapacity = 0; second.production = first.production; second.hexId = first.hexId;
    const view = getPlayerView(s, 'a').companies.find(x => x.id === c.id)!;
    const demand = demandFrom(c, expectedOutlook(s, c), s);
    for (const p of c.products) expect(view.products.find(q => q.id === p.id)?.private?.estimate?.demand).toBeCloseTo(demand(p, 1), 10);
    resolveTurn(single); resolveTurn(s);
    const report = (state: typeof s) => state.companies[c.id].reports.at(-1)!;
    expect(report(s).products.every(p => p.demand !== undefined)).toBe(true);
    expect(report(s).products.reduce((sum, p) => sum + p.demand!, 0)).toBeCloseTo(report(single).products[0].demand!, 10);
    expect(s.sectors[first.sectorId].lastTotalDemand).toBe(single.sectors[first.sectorId].lastTotalDemand);
  });
  it('bots consider another site after the capacity cap without treating it as a new brand', () => {
    const s = game(), c = companyOf(s, 'a'), p = c.products[0];
    p.sectorId = 'crypto'; p.initialCapacity = SECTORS.crypto.startingCapacity; p.capacity = 2 * p.initialCapacity;
    p.price = SECTORS.crypto.refPrice * .8; p.production = p.capacity; p.stock = 0; delete p.terrainId; delete c.terrainId;
    botFactoryNetwork(s, s.players.a, () => 0);
    expect(s.hexBids).toBeUndefined(); // A capacity cap alone is no reason to pay for an unprofitable site.
    s.sectors.crypto.demandMultiplier = 8; // A strong market boom leaves profitable demand unserved.
    botFactoryNetwork(s, s.players.a, () => 0);
    expect(s.hexBids?.some(b => b.companyId === c.id && b.kind === 'factory' && b.productId === p.id)).toBe(true);
    expect(productCount(c)).toBe(1);
  });
  it('merging companies transfers all land and shared product identities', () => {
    const s = game(), { c, hexId } = buy(s), first = c.products[0], target = companyOf(s, 'b');
    ok(s, { type: 'buildFactory', companyId: c.id, productId: first.id, hexId });
    target.controllerId = 'a'; const targetLand = ownedLand(target);
    ok(s, { type: 'merge', absorberId: c.id, targetId: target.id });
    expect(target.land).toBeUndefined(); expect(target.productProfiles).toBeUndefined();
    expect(c.land).toEqual(expect.arrayContaining(targetLand)); expect(productCount(c)).toBe(2);
    expect(c.productProfiles?.[0].id).toBe(first.id); expect(occupiedHexes(s)[targetLand[0].hexId]).toBe(c.id);
  });
  it('expert plans charge common budgets once and do not learn physical factory shares as calibration', () => {
    const s = game(), { c, hexId } = buy(s), first = c.products[0];
    ok(s, { type: 'buildFactory', companyId: c.id, productId: first.id, hexId }); resolveTurn(s);
    const second = c.products.at(-1)!, memory: ExpertMemory = { calib: {} }, actions: Action[] = [];
    s.players.a.cash = 0;
    expertTurn({ view: () => getPlayerView(s, 'a'), memory: () => memory,
      act: action => { actions.push(action); return applyAction(s, 'a', action); },
      productName: () => 'New brand', startupName: () => 'New company',
    }, NEUTRAL_PERSONALITY);
    const decisions = actions.filter(a => a.type === 'setProductDecisions' && a.companyId === c.id && [first.id, second.id].includes(a.productId));
    expect(decisions).toHaveLength(2);
    expect(decisions.filter(a => a.type === 'setProductDecisions' && a.marketing !== undefined)).toHaveLength(1);
    expect(memory.calib[first.id]?.logk).toBe(0); expect(memory.calib[second.id]?.logk).toBe(0);
    expect(first.price).toBe(second.price);
    expect(c.products.every(p => p.capacity + p.pendingCapacity <= factoryCapacityLimit(p))).toBe(true);
  });
  it('closing one factory keeps its land and transfers common budgets to the remaining factory', () => {
    const s = game(), { c, hexId, bid } = buy(s), first = c.products[0];
    ok(s, { type: 'buildFactory', companyId: c.id, productId: first.id, hexId }); const second = c.products.at(-1)!;
    ok(s, { type: 'setProductDecisions', companyId: c.id, productId: first.id, marketing: 12, rnd: 6 });
    const original = first.hexId!; ok(s, { type: 'discontinueProduct', companyId: c.id, productId: first.id });
    expect(occupiedHexes(s)[original]).toBe(c.id); expect(second.marketing).toBe(12); expect(second.rnd).toBe(6);
    reject(s, { type: 'sellLand', companyId: c.id, hexId });
    ok(s, { type: 'discontinueProduct', companyId: c.id, productId: second.id });
    const cash = c.cash, value = bookValue(c); ok(s, { type: 'sellLand', companyId: c.id, hexId });
    expect(c.cash).toBe(cash + bid / 2); expect(bookValue(c)).toBeCloseTo(value, 10);
    expect(occupiedHexes(s)[hexId]).toBeUndefined(); expect(c.productProfiles).toEqual([]);
  });
  it('views and JSON saves retain ownership without mutation, hide decisions, and bankrupt land is freed', () => {
    const s = game(), { c, hexId } = buy(s), first = c.products[0];
    ok(s, { type: 'buildFactory', companyId: c.id, productId: first.id, hexId });
    const before = JSON.stringify(s), copy = JSON.parse(before);
    expect(getPlayerView(copy, 'a')).toEqual(getPlayerView(s, 'a')); expect(JSON.stringify(s)).toBe(before);
    expect(getPlayerView(s, 'b').companies.find(x => x.id === c.id)?.products.every(p => p.private === undefined)).toBe(true);
    c.cash = 0; resolveTurn(s); expect(c.status).toBe('bankrupt'); expect(occupiedHexes(s)[hexId]).toBeUndefined(); expect(ownedLand(c)).toEqual([]);
  });
  it('legacy rooms keep unlimited capacity and relocation; new rules require the explicit save flag', () => {
    const s = game(); delete s.config.industryRules; const c = companyOf(s, 'a'), p = c.products[0];
    ok(s, { type: 'expandCapacity', companyId: c.id, productId: p.id, lots: 2 * p.capacity });
    ok(s, { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: freeBuildableHexes(s)[0], bid: 1000 });
    reject(s, { type: 'bidLand', companyId: c.id, hexId: freeBuildableHexes(s)[1], bid: 1000 });
  });
  it('land fees and factory simulation are identical in French and English', () => {
    const states = [game('fr'), game('en')];
    for (const s of states) { const { c, hexId } = buy(s); ok(s, { type: 'buildFactory', companyId: c.id, productId: c.products[0].id, hexId }); resolveTurn(s); }
    const metrics = (s: ReturnType<typeof game>) => Object.values(s.companies).map(c => ({ cash: c.cash, land: c.land, products: c.products.map(p => [p.capacity, p.quality, p.brand, p.lastSales]) }));
    expect(metrics(states[0])).toEqual(metrics(states[1])); expect(states[0].rngState).toBe(states[1].rngState);
  });
});
