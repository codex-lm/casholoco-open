import { afterEach, describe, expect, it, vi } from 'vitest';
import { SECTORS } from '../src/content';
import { createGame, getPlayerView } from '../src/engine';
import { runAction } from '../src/sim/actions';
import * as advice from '../src/sim/advice';
import { expectedDemand, expertLaunchProject, expertTurn, launchValue, launchValueAt, optimiseBudgets } from '../src/sim/botExpert';
import * as botHexes from '../src/sim/botHexes';
import { hexReservePrice } from '../src/sim/hexAuctions';
import { NEUTRAL_PERSONALITY, setBotZoneMode } from '../src/sim/bots';
import { LOBBYING_MULT, PRICE_MAX_RATIO, PRICE_MIN_RATIO, START_BRAND } from '../src/sim/constants';
import { applyNewsCard, findCard } from '../src/sim/news';
import { startingDecisions } from '../src/sim/opening';
import { resolveTurnWithLog } from '../src/sim/resolve';
import type { ExpertMemory, SectorId } from '../src/types';
import { companyOf, config, human } from './helpers';

const founderBrand = SECTORS.yogurts.startingBrand;
afterEach(() => {
  SECTORS.yogurts.startingBrand = founderBrand;
  setBotZoneMode('market');
  vi.restoreAllMocks();
});

function fundedFounder(sectorId: SectorId = 'energy_drinks') {
  setBotZoneMode('capital');
  const state = createGame(config(17, 16), [human('a', sectorId)]);
  state.activeEffects = [];
  state.players.a.cash = 0;
  const company = companyOf(state, 'a');
  company.cash = 1_000_000;
  return { state, company };
}

describe('expert entry uses fresh brands and the real launch timetable', () => {
  it('sizes a real launch bid from cash returns rather than capitalised terminal earnings', () => {
    setBotZoneMode('market');
    const state = createGame({ ...config(17, 16), mapMode: 'hex', terrainAssignment: 'host',
      terrains: { a: 'ristourne-le-bourg' } }, [human('a', 'yogurts')]);
    const company = companyOf(state, 'a');
    company.cash = 100_000;
    state.players.a.cash = 0;
    state.activeEffects = [];
    const memory: ExpertMemory = { calib: {} };
    const sizing = vi.spyOn(botHexes, 'botHexBid');
    let checked = false;
    expertTurn({ view: () => getPlayerView(state, 'a'),
      act: (action) => {
        if (action.type === 'launchProduct' && action.hexId) {
          const view = getPlayerView(state, 'a');
          const visible = view.companies.find((c) => c.id === company.id)!;
          const logs = visible.products.map((p) => memory.calib[p.id]?.logk).filter((x): x is number => x !== undefined);
          const boost = Math.exp(logs.length ? logs.reduce((sum, x) => sum + x, 0) / logs.length : 0);
          const reserve = hexReservePrice(action.hexId);
          const bookValue = 0.5 * SECTORS[action.sectorId].startingCapacity * SECTORS[action.sectorId].capacityCost;
          // With weight 1, this public forecast contains cash plus the surviving
          // factory asset. Neither that asset nor capitalised earnings can fund land.
          const cashGain = launchValueAt(view, visible, action.sectorId, () => 1, boost, action.hexId) - bookValue;
          const [, bidReserve, bidValue, budget] = sizing.mock.calls.at(-1)!;
          expect(bidReserve).toBe(reserve);
          expect(bidValue).toBeCloseTo(Math.max(reserve, cashGain + reserve), 8);
          const share = 0.015 + 0.12 * NEUTRAL_PERSONALITY.aggressiveness;
          expect(action.bid).toBe(Math.max(reserve, Math.floor(Math.min(budget, reserve + Math.max(0, cashGain) * share))));
          checked = true;
        }
        return runAction(state, 'a', action);
      }, memory: () => memory, productName: () => 'Cash-funded plant', startupName: () => 'Cash startup' }, NEUTRAL_PERSONALITY);
    expect(checked).toBe(true);
    const bid = state.hexBids!.find((bid) => bid.companyId === company.id && bid.kind === 'launch')!;
    expect(bid.amount).toBeGreaterThanOrEqual(hexReservePrice(bid.hexId));
    resolveTurnWithLog(state);
    expect(company.products.some((p) => p.name === 'Cash-funded plant')).toBe(true);
  });

  it('keeps cash returns independent of terminal earnings weights at the same legal site', () => {
    setBotZoneMode('market');
    const state = createGame({ ...config(17, 16), mapMode: 'hex' }, [human('a', 'energy_drinks')]);
    const company = companyOf(state, 'a');
    company.cash = 100_000;
    // Obtain real public hex estimates without changing any price, cost or demand.
    const view = getPlayerView(state, 'a');
    const visible = view.companies.find((c) => c.id === company.id)!;
    view.hexes!.free = view.hexes!.free.slice(0, 1);
    const unweighted = expertLaunchProject(view, visible, 'crypto', () => 1, 1)!;
    const capitalised = expertLaunchProject(view, visible, 'crypto', () => 40, 1)!;
    expect(unweighted).toBeDefined();
    expect(capitalised.hexId).toBe(unweighted.hexId);
    expect(capitalised.cashGain).toBe(unweighted.cashGain);
    expect(capitalised.value).toBeGreaterThan(unweighted.value);
    const bookValue = 0.5 * SECTORS.crypto.startingCapacity * SECTORS.crypto.capacityCost;
    expect(unweighted.cashGain).toBeCloseTo(unweighted.value - bookValue, 8);
  });

  it('a temporary first-sales loss cannot veto a funded positive-horizon hex launch or its bid', () => {
    setBotZoneMode('market');
    const state = createGame({ ...config(17, 16), mapMode: 'hex', terrainAssignment: 'host',
      terrains: { a: 'ristourne-le-bourg' } }, [human('a', 'yogurts')]);
    const company = companyOf(state, 'a');
    company.cash = 100_000;
    state.players.a.cash = 0;
    // Known temporary demand shocks affect potential new lines, while the
    // existing factory can pay the launch and the unchanged profit floor.
    state.activeEffects = (['energy_drinks', 'gadgets', 'scooters', 'crypto'] as const).map((sectorId) => ({
      id: `temporary-${sectorId}`, newsId: `temporary-${sectorId}`, kind: 'sectorDemand' as const,
      sectorId, value: 0.01, turnsLeft: 2,
    }));
    const view = getPlayerView(state, 'a');
    const visible = view.companies.find((c) => c.id === company.id)!;
    const memory: ExpertMemory = { calib: {} };
    const io = { view: () => getPlayerView(state, 'a'), act: (action: Parameters<typeof runAction>[2]) => runAction(state, 'a', action),
      memory: () => memory, productName: () => 'Recovery project', startupName: () => 'Recovery startup' };
    expertTurn(io, NEUTRAL_PERSONALITY);
    const bid = state.hexBids?.find((bid) => bid.companyId === company.id && bid.kind === 'launch')!;
    expect(bid).toBeDefined();
    const sid = bid.project!.sectorId;
    expect(view.sectors.find((s) => s.id === sid)!.launchByHex![bid.hexId]!.quarterlyProfit).toBeLessThan(0);
    expect(launchValueAt(view, visible, sid, () => 1, 1, bid.hexId)).toBeGreaterThan(SECTORS[sid].launchCost * 0.3);
    const before = new Set(company.products.map((p) => p.id));
    resolveTurnWithLog(state);
    const launched = company.products.find((p) => !before.has(p.id))!;
    expect(launched).toBeDefined();
    expect(launched.sectorId).toBe(sid);
    expect(launched.brand).toBe(START_BRAND);
    // The first quarter after the known shock ends uses real expert decisions
    // and real shipments; the new plant must cover its operating investment.
    expertTurn(io, NEUTRAL_PERSONALITY);
    resolveTurnWithLog(state);
    expertTurn(io, NEUTRAL_PERSONALITY);
    const marketing = launched.marketing, rnd = launched.rnd;
    resolveTurnWithLog(state);
    const report = company.reports.find((r) => r.turn === 3)!.products.find((p) => p.productId === launched.id)!;
    expect(report.sold).toBeGreaterThan(0);
    expect(report.revenue - report.produced * report.unitCost - marketing - rnd - SECTORS[sid].fixedCost).toBeGreaterThan(0);
  });

  it('a founder loyalty change cannot grant the same customer base to an entrant forecast', () => {
    const { state, company } = fundedFounder();
    const view = getPlayerView(state, 'a');
    const visible = view.companies.find((c) => c.id === company.id)!;
    const before = structuredClone(view);
    SECTORS.yogurts.startingBrand = START_BRAND;
    const fresh = launchValue(view, visible, 'yogurts', () => 1, 1);
    SECTORS.yogurts.startingBrand = 5;
    const loyalFounder = launchValue(view, visible, 'yogurts', () => 1, 1);
    expect(Number.isFinite(fresh)).toBe(true);
    expect(loyalFounder).toBe(fresh);
    expect(view).toEqual(before);
  });

  it('the forecast launch-quarter update matches the zero budgets and aging of a real expert launch', () => {
    const { state, company } = fundedFounder();
    const openingView = getPlayerView(state, 'a');
    const openingCompany = openingView.companies.find((c) => c.id === company.id)!;
    const existing = new Set(company.products.map((p) => p.id));
    const memory: ExpertMemory = { calib: {} };
    expertTurn({ view: () => getPlayerView(state, 'a'), act: (action) => runAction(state, 'a', action),
      memory: () => memory, productName: () => 'Fresh product', startupName: () => 'Fresh startup' }, NEUTRAL_PERSONALITY);
    const entrant = company.products.find((p) => !existing.has(p.id))!;
    expect(entrant).toBeDefined();
    expect(entrant.capacity).toBe(0);
    expect(entrant.brand).toBe(START_BRAND);
    expect(entrant.marketing).toBe(0);
    expect(entrant.rnd).toBe(0);

    // Warm the pure default-decision cache before observing the forecast's own
    // quality update. The spy preserves the real calculation and its outputs.
    startingDecisions(entrant.sectorId, SECTORS[entrant.sectorId].startingCapacity);
    const update = vi.spyOn(advice, 'qualityAfter');
    launchValue(openingView, openingCompany, entrant.sectorId, () => 1, 1);
    const first = update.mock.calls.find(([sid]) => sid === entrant.sectorId)!;
    expect(first).toEqual([entrant.sectorId, 1, 0]);
    const predicted = update.mock.results[update.mock.calls.indexOf(first)].value as number;
    update.mockRestore();
    resolveTurnWithLog(state);
    expect(entrant.quality).toBeCloseTo(predicted, 12);
    expect(entrant.brand).toBeCloseTo(START_BRAND, 12);
  });
  it('values only the paid capacity actually delivered before its first sales quarter', () => {
    const { state, company } = fundedFounder();
    state.turn = state.config.totalTurns - 1;
    for (const rival of Object.values(state.companies)) if (rival.id !== company.id) rival.status = 'bankrupt';
    state.sectors.yogurts.demandMultiplier = 5;
    state.sectors.yogurts.lastTotalDemand = 0;
    const view = getPlayerView(state, 'a');
    const visible = view.companies.find((c) => c.id === company.id)!;
    const predicted = launchValue(view, visible, 'yogurts', () => 1, 1);
    expect(runAction(state, 'a', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Paid plant' }).ok).toBe(true);
    const entrant = company.products.find((p) => p.sectorId === 'yogurts')!;
    runAction(state, 'a', { type: 'setProductDecisions', companyId: company.id, productId: entrant.id, marketing: 0, rnd: 0 });
    const ordered = entrant.pendingCapacity;
    resolveTurnWithLog(state);
    expect(entrant.capacity).toBe(ordered);
    expect(entrant.pendingCapacity).toBe(0);

    // Independently price the real delivered plant through the shared sales API.
    // The forecast has one sales quarter left and cannot assume a free extension.
    const def = SECTORS.yogurts;
    const defaults = startingDecisions('yogurts', ordered);
    const outside = advice.outsideAttractiveness('yogurts', state.config.totalTurns);
    const market = { demand: expectedDemand(view, 'yogurts', 1), othersAttractiveness: outside,
      othersPriceAttractiveness: outside * def.refPrice, reputation: company.reputation, bonus: 1,
      unitCost: view.sectors.find((sector) => sector.id === 'yogurts')!.launchByZone!.capital.unitCost,
      fixedCost: def.fixedCost };
    let best = -Infinity;
    for (let ratio = PRICE_MIN_RATIO; ratio <= PRICE_MAX_RATIO + 1e-9; ratio += 0.01) {
      const decisions = { ...defaults, quality: entrant.quality, brand: entrant.brand, capacity: ordered, stock: 0,
        price: def.refPrice * ratio, production: ordered };
      const demand = advice.estimateSales('yogurts', market, decisions).demand;
      decisions.production = Math.min(ordered, Math.ceil(demand * 1.04));
      const estimate = advice.estimateSales('yogurts', market, decisions);
      const spoiledCost = Math.max(0, decisions.production - estimate.sales) * market.unitCost * def.perishability;
      best = Math.max(best, estimate.margin - spoiledCost);
    }
    const expected = best * (1 - (visible.private?.taxRate ?? visible.taxRate ?? 0.25))
      - def.launchCost + 0.5 * ordered * def.capacityCost;
    expect(predicted).toBeCloseTo(expected, 6);
  });

  it.each(['classic', 'hex'] as const)('uses public news sensitivity and exact expiry in %s forecasts', (mapMode) => {
    const state = createGame({ ...config(23, 16), mapMode }, [human('a', 'scooters')]);
    state.activeEffects = [];
    const plain = getPlayerView(state, 'a');
    applyNewsCard(state, { ...findCard('sector_viral_trend')!, effects: [
      { type: 'sectorDemand', sectorId: 'scooters', multiplier: 2, duration: 2 },
      { type: 'sectorDemand', sectorId: 'energy_drinks', multiplier: 2, duration: 2 },
    ] }, 'news');
    const boosted = getPlayerView(state, 'a');
    for (const offset of [0, 1]) {
      expect(expectedDemand(boosted, 'scooters', offset) / expectedDemand(plain, 'scooters', offset))
        .toBeCloseTo(2 ** (SECTORS.scooters.newsSensitivity ?? 1), 12);
      expect(expectedDemand(boosted, 'energy_drinks', offset) / expectedDemand(plain, 'energy_drinks', offset))
        .toBeCloseTo(2, 12);
    }
    expect(expectedDemand(boosted, 'scooters', 2)).toBe(expectedDemand(plain, 'scooters', 2));
    expect(expectedDemand(boosted, 'energy_drinks', 2)).toBe(expectedDemand(plain, 'energy_drinks', 2));
    expect(expectedDemand(boosted, 'scooters', 0)).toBe(boosted.sectors.find((sector) => sector.id === 'scooters')!.expectedDemandHorizon![0]);
  });

  it.each(['classic', 'hex'] as const)('hides fresh rival lobbying and exposes it after the close in %s', (mapMode) => {
    const state = createGame({ ...config(29, 16), mapMode }, [human('a', 'scooters'), human('b', 'energy_drinks')]);
    state.activeEffects = [];
    const rival = companyOf(state, 'b');
    rival.cash = 100_000;
    const before = getPlayerView(state, 'a');
    expect(runAction(state, 'b', { type: 'shady', companyId: rival.id, kind: 'lobbying', sectorId: 'scooters' }).ok).toBe(true);
    const hidden = getPlayerView(state, 'a');
    const owner = getPlayerView(state, 'b');
    for (const offset of [0, 1, 2]) expect(expectedDemand(hidden, 'scooters', offset)).toBe(expectedDemand(before, 'scooters', offset));
    expect(expectedDemand(owner, 'scooters', 0) / expectedDemand(hidden, 'scooters', 0)).toBeCloseTo(LOBBYING_MULT, 12);
    resolveTurnWithLog(state);
    const publicView = getPlayerView(state, 'a');
    const withoutLobby = structuredClone(state);
    withoutLobby.companies[rival.id].modifiers = withoutLobby.companies[rival.id].modifiers.filter((modifier) => modifier.kind !== 'lobbying');
    const unboosted = getPlayerView(withoutLobby, 'a');
    expect(expectedDemand(publicView, 'scooters', 0) / expectedDemand(unboosted, 'scooters', 0)).toBeCloseTo(LOBBYING_MULT, 12);
    expect(expectedDemand(publicView, 'scooters', 1)).toBe(expectedDemand(unboosted, 'scooters', 1));
  });

  it('R&D returns use installed capacity and only add an expansion that has actually been paid', () => {
    const { state, company } = fundedFounder('gadgets');
    state.turn = state.config.totalTurns - 1;
    for (const rival of Object.values(state.companies)) if (rival.id !== company.id) rival.status = 'bankrupt';
    const plant = company.products[0];
    plant.capacity = 3;
    plant.production = 3;
    plant.quality = 20;
    plant.brand = 10;
    plant.stock = 0;
    const forecast = () => {
      const view = getPlayerView(state, 'a');
      const visible = view.companies.find((c) => c.id === company.id)!;
      const product = visible.products.find((p) => p.id === plant.id)!;
      const plan = optimiseBudgets(view, visible, product, { weight: () => 1, revenueCredit: 0, green: 1,
        extraMaterials: new Map(), boost: () => 1, mem: { calib: {} } });
      // This excellent but tiny plant sells out at the legal maximum. No budget
      // can improve sales through its installed or ordered physical capacity.
      expect(plan.mkt).toBe(0);
      expect(plan.rnd).toBe(0);
      const margin = SECTORS[plant.sectorId].refPrice * PRICE_MAX_RATIO - product.private!.estimatedUnitCost;
      const afterTax = 1 - (visible.private?.taxRate ?? visible.taxRate ?? 0.25);
      return { plan, margin, afterTax };
    };
    const installed = forecast();
    expect(installed.plan.v).toBeCloseTo(installed.margin * 3 * 2 * installed.afterTax, 8);
    const cashBefore = company.cash;
    expect(runAction(state, 'a', { type: 'expandCapacity', companyId: company.id, productId: plant.id, lots: 6 }).ok).toBe(true);
    expect(company.cash).toBe(cashBefore - 6 * SECTORS[plant.sectorId].capacityCost);
    expect(plant.capacity).toBe(3);
    expect(plant.pendingCapacity).toBe(6);
    const ordered = forecast();
    expect(ordered.plan.v).toBeCloseTo(ordered.margin * (3 + 9) * ordered.afterTax, 8);
    resolveTurnWithLog(state);
    expect(plant.capacity).toBe(9);
    expect(plant.pendingCapacity).toBe(0);
  });

  it('counts the paid capacity of a preparing launch once, after its actual delivery', () => {
    const { state, company } = fundedFounder();
    state.turn = state.config.totalTurns - 1;
    for (const rival of Object.values(state.companies)) if (rival.id !== company.id) rival.status = 'bankrupt';
    expect(runAction(state, 'a', { type: 'launchProduct', companyId: company.id, sectorId: 'gadgets', name: 'Preparing plant' }).ok).toBe(true);
    const plant = company.products.find((p) => p.sectorId === 'gadgets')!;
    plant.quality = 20;
    plant.brand = 10;
    const view = getPlayerView(state, 'a');
    const visible = view.companies.find((c) => c.id === company.id)!;
    const product = visible.products.find((p) => p.id === plant.id)!;
    const ordered = plant.pendingCapacity;
    expect(plant.capacity).toBe(0);
    const plan = optimiseBudgets(view, visible, product, { weight: () => 1, revenueCredit: 0, green: 1,
      extraMaterials: new Map(), boost: () => 1, mem: { calib: {} } });
    expect(plan.mkt).toBe(0);
    expect(plan.rnd).toBe(0);
    const margin = SECTORS.gadgets.refPrice * PRICE_MAX_RATIO - product.private!.estimatedUnitCost;
    const afterTax = 1 - (visible.private?.taxRate ?? visible.taxRate ?? 0.25);
    expect(plan.v).toBeCloseTo(margin * ordered * afterTax, 8);
    resolveTurnWithLog(state);
    expect(plant.capacity).toBe(ordered);
    expect(plant.pendingCapacity).toBe(0);
  });

});
