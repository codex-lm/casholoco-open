import { describe, expect, it } from 'vitest';
import { applyAction, createGame, resolveTurn } from '../src/engine';
import { SECTORS } from '../src/content';
import { realizeHexLaunch } from '../src/sim/actions';
import { awardHexes, hexReservePrice } from '../src/sim/hexAuctions';
import { TERRAINS } from '../src/content/fr/terrains';
import { brandAfter, estimateSales, hexDemand, marketInputs, qualityAfter } from '../src/sim/advice';
import { CRISIS_COMMS_SCANDAL } from '../src/sim/constants';
import { closeObligations, demandFrom, expectedOutlook } from '../src/sim/close';
import { effectiveTaxRate, estimatedUnitCost, laborPerLot, unitCostByHex } from '../src/sim/finance';
import { freeBuildableHexes, heatCredit, occupiedHexes } from '../src/sim/hexes';
import { applyNewsCard, findCard } from '../src/sim/news';
import { activeTerrain, activeSeatTerrain, addScandal, companyTaxRate, effectiveFixedCost, effectiveHeatCredit, effectivePerishability, taxOptimisationGain, terrainMultiplier } from '../src/sim/terrains';
import type { ActiveEffect, GameState, SectorId } from '../src/types';
import { companyOf, config, human } from './helpers';

function setup(first = 'monts-defiscalises', second = 'ile-aux-niches', sector: SectorId = 'gadgets') {
  const s = createGame({ ...config(103), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: first, b: second } }, [human('a', sector), human('b', 'yogurts')]);
  s.activeEffects = [];
  for (const c of Object.values(s.companies)) { c.cash = 1e7; c.inventory = {}; c.sites = []; }
  return { s, c: companyOf(s, 'a'), other: companyOf(s, 'b'), p: companyOf(s, 'a').products[0] };
}
function effect(s: GameState, terrain: string, lever: ActiveEffect['lever'], value: number, suspend = false) {
  s.activeEffects.push({ id: 'test-local', newsId: 'test', kind: 'terrain', terrain, lever, value, suspend, turnsLeft: 3 });
}

describe('terrain ownership follows the original grant', () => {
  it('survives a pause and takeover, and never passes to later products or an unassigned cell', () => {
    const { s, c, p } = setup();
    p.production = 0;
    expect(companyTaxRate(s, c)).toBe(0.05);
    s.players.b.cash = 1e9;
    const buy = applyAction(s, 'b', { type: 'buyShares', companyId: c.id, shares: 5001 });
    expect(buy.ok, buy.message).toBe(true);
    expect(c.controllerId).toBe('b');
    expect(companyTaxRate(s, c)).toBe(0.05);
    const launch = applyAction(s, 'b', { type: 'launchProduct', companyId: c.id, sectorId: 'gadgets', name: 'Second', hexId: freeBuildableHexes(s)[0], bid: 400, fallback: 'nearest' });
    expect(launch.ok, launch.message).toBe(true);
    awardHexes(s, realizeHexLaunch);
    expect(c.products[1].terrainId).toBeUndefined();
    expect(terrainMultiplier(s, c, c.products[1], 'labor')).toBe(1);
    expect(companyTaxRate(s, c)).toBe(0.05);
    const ordinary = { ...p, id: 'new-plant', terrainId: undefined, hexId: TERRAINS[0].hex };
    expect(terrainMultiplier(s, c, ordinary, 'marketing')).toBe(1);
  });

  it('relocates after winning at closure, reserves neither target, and cannot recover the abandoned grant', () => {
    const { s, c, p } = setup();
    const origin = p.hexId!;
    const target = freeBuildableHexes(s)[0];
    const move = applyAction(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: target, bid: hexReservePrice(target) });
    expect(move.ok, move.message).toBe(true);
    expect(p.hexId).toBe(origin);
    expect(companyTaxRate(s, c)).toBe(0.05);
    expect(occupiedHexes(s)[origin]).toBe(c.id);
    expect(occupiedHexes(s)[target]).toBeUndefined();
    resolveTurn(s);
    expect(p.hexId).toBe(target);
    expect(p.pendingHexId).toBeUndefined();
    expect(p.terrainId).toBeUndefined();
    expect(c.terrainId).toBeUndefined();
    expect(activeTerrain(s, 'monts-defiscalises')).toBeUndefined();
    expect(companyTaxRate(s, c)).toBe(effectiveTaxRate(s));
    const back = applyAction(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: origin, bid: hexReservePrice(origin) });
    expect(back.ok, back.message).toBe(true);
    resolveTurn(s);
    expect(p.hexId).toBe(origin);
    expect(companyTaxRate(s, c)).toBe(effectiveTaxRate(s));
  });

  it('revokes grants on discontinuation and bankruptcy, and gives start-ups none', () => {
    const { s, c, p, other } = setup();
    expect(applyAction(s, 'a', { type: 'discontinueProduct', companyId: c.id, productId: p.id }).ok).toBe(true);
    expect(c.terrainId).toBeUndefined();
    other.cash = 0;
    resolveTurn(s);
    expect(other.status).toBe('bankrupt');
    expect(other.terrainId).toBeUndefined();
    expect(activeTerrain(s, 'ile-aux-niches')).toBeUndefined();
    s.players.b.cash = 1e5;
    const startup = applyAction(s, 'b', { type: 'foundStartup', name: 'Again', sectorId: 'crypto', investment: 1500, hexId: freeBuildableHexes(s)[0], bid: 400, fallback: 'nearest' });
    expect(startup.ok, startup.message).toBe(true);
    const fresh = Object.values(s.companies).find((x) => x.name === 'Again')!;
    expect(fresh.terrainId).toBeUndefined();
    expect(fresh.products[0].terrainId).toBeUndefined();
  });

  it('merging cancels both seats while preserving each original plant grant', () => {
    const { s, c, p, other } = setup('monts-defiscalises', 'ristourne-le-bourg');
    other.controllerId = 'a'; other.holdings = { a: 6000 };
    const q = other.products[0];
    const merge = applyAction(s, 'a', { type: 'merge', absorberId: c.id, targetId: other.id });
    expect(merge.ok, merge.message).toBe(true);
    expect(activeSeatTerrain(s, c)).toBeUndefined();
    expect(other.terrainId).toBeUndefined();
    expect(companyTaxRate(s, c)).toBe(effectiveTaxRate(s));
    expect(terrainMultiplier(s, c, p, 'labor')).toBe(0.9);
    expect(terrainMultiplier(s, c, q, 'labor')).toBe(0.9);
    expect(terrainMultiplier(s, c, q, 'perishability')).toBe(0.5);
    expect(activeTerrain(s, 'ristourne-le-bourg')?.company.id).toBe(c.id);
  });
});

describe('terrain effects share resolution and estimate readers', () => {
  it('uses quarter 1 through 8 inclusively for temporary labor and drops it at a candidate elsewhere', () => {
    const { s, c, p } = setup('portes-petit-rabais');
    const without = { ...p, terrainId: undefined };
    for (const t of [1, 8]) { s.turn = t; expect(laborPerLot(s, c, p)).toBeCloseTo(laborPerLot(s, c, without) * 0.8, 12); }
    const target = freeBuildableHexes(s)[0];
    expect(unitCostByHex(s, c, p, [target])[target]).toBeCloseTo(unitCostByHex(s, c, without, [target])[target], 12);
    s.turn = 9;
    expect(laborPerLot(s, c, p)).toBe(laborPerLot(s, c, without));
  });

  it.each([['faubourgs-croissance', 'rnd', 2], ['quai-port-dividende', 'marketing', 1.5]] as const)('shares %s budget effects through preview, plan and resolution', (id, lever, mult) => {
    const { s, c, p } = setup(id);
    const market = marketInputs(s, c, p, 'a', estimatedUnitCost(s, c, p));
    expect(lever === 'rnd' ? market.rndMultiplier : market.marketingMultiplier).toBe(mult);
    const q = qualityAfter(p.sectorId, p.quality, p.rnd, market.rndMultiplier);
    const b = brandAfter(p.sectorId, p.brand, p.marketing, market.marketingMultiplier);
    const demand = demandFrom(c, expectedOutlook(s, c), s)(p, 1);
    expect(demand).toBeCloseTo(estimateSales(p.sectorId, market, p).demand, 8);
    resolveTurn(s);
    expect(p.quality).toBeCloseTo(q, 12);
    expect(p.brand).toBeCloseTo(b, 12);
  });

  it('multiplies demand after the logit in the preview, close plan and actual sales', () => {
    const { s, c, p } = setup('quai-port-dividende');
    p.production = 0; p.stock = 1e6;
    const baseline = structuredClone(s);
    const baselineProduct = baseline.companies[c.id].products[0];
    const before = marketInputs(s, c, p, 'a', estimatedUnitCost(s, c, p));
    effect(s, c.terrainId!, 'demand', 0.8);
    const after = marketInputs(s, c, p, 'a', estimatedUnitCost(s, c, p));
    expect(estimateSales(p.sectorId, after, p).demand).toBeCloseTo(estimateSales(p.sectorId, before, p).demand * 0.8, 10);
    expect(demandFrom(c, expectedOutlook(s, c), s)(p, 1)).toBeCloseTo(estimateSales(p.sectorId, after, p).demand, 8);
    resolveTurn(baseline); resolveTurn(s);
    expect(p.lastSales).toBeCloseTo(baselineProduct.lastSales * 0.8, 9);
  });

  it('reads local fixed costs in obligations and estimates, and cold-chain loss in the actual stock', () => {
    const { s, c, p } = setup('ristourne-le-bourg', 'ile-aux-niches', 'yogurts');
    const oldFixed = closeObligations(s, c).fixed;
    effect(s, c.terrainId!, 'fixedCost', 1.2);
    expect(closeObligations(s, c).fixed - oldFixed).toBeCloseTo(SECTORS.yogurts.fixedCost * 0.2, 10);
    expect(marketInputs(s, c, p, 'a', 0).fixedCost).toBe(effectiveFixedCost(s, p, c));
    p.stock = 10000; p.production = 0;
    const perish = effectivePerishability(s, p);
    expect(perish).toBe(SECTORS.yogurts.perishability / 2);
    resolveTurn(s);
    expect(p.stock).toBeCloseTo((10000 - p.lastSales) * (1 - perish), 8);
  });

  it('tax is the minimum of seat and ordinary rate, and suspension restores ordinary optimization rules', () => {
    const { s, c } = setup();
    expect(companyTaxRate(s, c)).toBe(0.05);
    s.macro.baseTaxRate = 0.02;
    expect(companyTaxRate(s, c)).toBe(0.02);
    s.macro.baseTaxRate = 0.25;
    effect(s, c.terrainId!, 'tax', 1, true);
    expect(companyTaxRate(s, c)).toBe(0.25);
    c.modifiers.push({ kind: 'tax_optimisation', turnsLeft: 1 });
    expect(companyTaxRate(s, c)).toBe(0.05);
  });

  it('values tax optimization at zero on the 5% seat and only its real saving during suspension', () => {
    const { s, c } = setup();
    expect(taxOptimisationGain(s, c, 2000)).toBe(0);
    effect(s, c.terrainId!, 'tax', 1, true);
    s.macro.baseTaxRate = 0.06;
    expect(taxOptimisationGain(s, c, 2000)).toBeCloseTo(20, 10);
    s.macro.baseTaxRate = 0.25;
    expect(taxOptimisationGain(s, c, 2000)).toBe(400);
  });

  it('island seat is tax-free until the local audit suspension, and scandal rises grow by half', () => {
    const { s, c, p } = setup('ile-aux-niches', 'monts-defiscalises');
    // L'usine de départ est toujours sur sa case : le siège ne paie aucun impôt.
    expect(p.hexId).toBe(TERRAINS.find((t) => t.id === 'ile-aux-niches')!.hex);
    expect(companyTaxRate(s, c)).toBe(0);
    // La nouvelle locale suspend le paradis fiscal : l'entreprise paie le taux ordinaire.
    applyNewsCard(s, findCard('loc-ile-aux-niches-1')!, 'news');
    expect(companyTaxRate(s, c)).toBe(effectiveTaxRate(s));
    s.activeEffects[0].turnsLeft = 0;
    expect(companyTaxRate(s, c)).toBe(0);
    // Les hausses de scandale sont multipliées par 1,5 ; les baisses ne le sont pas.
    c.scandal = 10; addScandal(s, c, 4); expect(c.scandal).toBe(16);
    addScandal(s, c, -4); expect(c.scandal).toBe(12);
  });

  it('multiplies only scandal rises including the whistleblower capped base; crisis retains its ordinary reduction', () => {
    const { s, c } = setup('ile-aux-niches', 'monts-defiscalises');
    c.scandal = 10; addScandal(s, c, 4); expect(c.scandal).toBe(16);
    addScandal(s, c, -4); expect(c.scandal).toBe(12);
    s.players.b.cash = 1e6;
    const whistle = applyAction(s, 'b', { type: 'whistleblow', companyId: c.id });
    expect(whistle.ok, whistle.message).toBe(true);
    expect(c.scandal).toBe(30);
    expect(applyAction(s, 'a', { type: 'crisisComms', companyId: c.id }).ok).toBe(true);
    expect(c.scandal).toBe(30 + CRISIS_COMMS_SCANDAL);
  });

  it('candidate demand drops the plant grant but preserves applicable product heat news', () => {
    const { s, c, p } = setup('faubourgs-croissance', 'ile-aux-niches', 'crypto');
    const otherHot = 'C3';
    const cold = 'A10';
    s.activeEffects.push({ id: 'heat-label', newsId: 'heat-label', kind: 'heat', lever: 'demand', scope: 'all', productId: p.id, value: 1.1, turnsLeft: 2 });
    const market = marketInputs(s, c, p, 'a', estimatedUnitCost(s, c, p));
    const candidates = hexDemand(p.sectorId, market, p, [p.hexId!, otherHot, cold], { state: s, c, p });
    expect(candidates[p.hexId!]).toBeCloseTo(estimateSales(p.sectorId, market, p).demand, 10);
    expect(candidates[otherHot]).toBeCloseTo(estimateSales(p.sectorId, { ...market, hexId: otherHot, rndMultiplier: 1 }, p).demand, 10);
    expect(candidates[cold]).toBeCloseTo(estimateSales(p.sectorId, { ...market, hexId: cold, rndMultiplier: 1, demandMultiplier: 1 }, p).demand, 10);
  });

  it('heat news affects only its target product and follows the same unit-cost path', () => {
    const { s, c, p } = setup('monts-defiscalises', 'ile-aux-niches', 'crypto');
    const old = laborPerLot(s, c, p);
    const heat = heatCredit(p.sectorId, p.hexId!);
    s.activeEffects.push({ id: 'winter', newsId: 'winter', kind: 'heat', lever: 'heat', scope: 'all', productId: p.id, value: 2, turnsLeft: 2 });
    expect(effectiveHeatCredit(s, p)).toBe(2 * heat);
    expect(laborPerLot(s, c, p)).toBe(old - heat);
    expect(effectiveHeatCredit(s, { ...p, id: 'another' })).toBe(heat);
  });
});
