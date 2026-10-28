import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { createGame, getPlayerView } from '../src/engine';
import { runAction } from '../src/sim/actions';
import { expertTurn } from '../src/sim/botExpert';
import { NEUTRAL_PERSONALITY, runBots, setBotZoneMode } from '../src/sim/bots';
import { PRICE_MAX_RATIO } from '../src/sim/constants';
import { SECTOR_IDS, type Action, type ExpertMemory, type SectorDef, type SectorId } from '../src/types';
import { companyOf, config, human } from './helpers';

const original = Object.fromEntries(SECTOR_IDS.map((id) => [id, { ...SECTORS[id] }])) as Record<SectorId, SectorDef>;

/** Same costs, reference market and ample capacity: only sector traits differ. */
function scenario(sectors: SectorId[], normal = false) {
  const state = createGame(config(17, 4), sectors.map((id, i) => ({
    ...human(`p${i}`, id), isBot: normal, botPersonalityId: 'sector-test',
  })));
  state.activeEffects = [];
  state.companies = Object.fromEntries(Object.entries(state.companies).filter(([, c]) => c.founderId?.startsWith('p')));
  for (const player of Object.values(state.players)) player.cash = 0;
  for (const company of Object.values(state.companies)) {
    company.cash = 100_000;
    company.reputation = 1;
    for (const product of company.products) Object.assign(product, {
      price: normal ? product.price : 100, quality: 1, brand: 0.3, capacity: 500, production: 100,
      stock: 0, pendingCapacity: 0, marketing: 0, rnd: 0,
      zoneId: 'capital', lastProduced: 0, lastSales: 0, lastPrice: 100,
    });
  }
  return state;
}

function expertDecision(sectorId: SectorId, turn = 1) {
  const state = scenario([sectorId]);
  state.turn = turn;
  const memory: ExpertMemory = { calib: {} };
  expertTurn({
    view: () => getPlayerView(state, 'p0'),
    act: (action) => runAction(state, 'p0', action),
    memory: () => memory,
    productName: () => 'Test',
    startupName: () => 'Test',
  }, NEUTRAL_PERSONALITY);
  return companyOf(state, 'p0').products[0];
}

beforeEach(() => {
  setBotZoneMode('capital');
  for (const id of SECTOR_IDS) Object.assign(SECTORS[id], {
    refPrice: 100, refDemand: 240, laborCost: 45, inputs: {}, fixedCost: 150,
    volatility: 0, growth: 0, outsideAttractiveness: 1.5, startingCapacity: 500,
  });
});

afterEach(() => {
  for (const id of SECTOR_IDS) SECTORS[id] = { ...original[id] };
  setBotZoneMode('market');
});

describe('sector-aware bot decisions', () => {
  it('normal bots start with a higher yogurt markup and put gadget investment into R&D', () => {
    const state = scenario(['yogurts', 'gadgets', 'energy_drinks'], true);
    for (const company of Object.values(state.companies)) company.products[0].production = 500;
    runBots(state);
    const yogurt = companyOf(state, 'p0').products[0];
    const gadget = companyOf(state, 'p1').products[0];
    const energy = companyOf(state, 'p2').products[0];
    expect(yogurt.price).toBeGreaterThan(gadget.price);
    expect(energy.marketing).toBeGreaterThan(yogurt.marketing);
    expect(gadget.rnd).toBeGreaterThan(gadget.marketing);
    const mature = scenario(['gadgets'], true);
    Object.assign(companyOf(mature, 'p0').products[0], { production: 500, quality: 20 });
    runBots(mature);
    // A saturated high-quality product has no return from extra R&D: the
    // investment above comes from the forecast rather than a fixed gadget boost.
    expect(companyOf(mature, 'p0').products[0].rnd).toBe(0);
  });

  it('normal price learning reacts to the sector market elasticity', () => {
    const decide = (marketElasticity: number) => {
      SECTORS.yogurts.marketElasticity = marketElasticity;
      const state = scenario(['yogurts'], true);
      const p = companyOf(state, 'p0').products[0];
      Object.assign(p, { lastProduced: 100, lastSales: 100, price: 110, stock: 0 });
      runBots(state);
      return p.price;
    };
    expect(decide(2)).toBeLessThan(decide(0.4));
  });

  it.each(SECTOR_IDS)('expert classic re-entry follows the shared public launch forecast for %s', (bestSector) => {
    const state = scenario(['gadgets']);
    state.config.totalTurns = 8;
    companyOf(state, 'p0').controllerId = null;
    state.players.p0.cash = 10_000;
    const view = getPlayerView(state, 'p0');
    for (const sector of view.sectors) {
      for (const launch of Object.values(sector.launchByZone!)) {
        launch.quarterlyProfit = sector.id === bestSector ? 1000 : 0;
      }
    }
    const actions: Action[] = [];
    const memory: ExpertMemory = { calib: {} };
    expertTurn({ view: () => view, memory: () => memory, productName: () => 'Test', startupName: () => 'Test',
      act: (action) => { actions.push(action); return { ok: false, message: 'Observe decisions.' }; } }, NEUTRAL_PERSONALITY);
    expect(actions.find((a) => a.type === 'foundStartup')).toMatchObject({ sectorId: bestSector });
  });

  it('expert forecasts price gadgets below yogurts on otherwise identical markets', () => {
    const yogurt = expertDecision('yogurts');
    const gadget = expertDecision('gadgets');
    expect(gadget.price / SECTORS.gadgets.refPrice).toBeLessThan(yogurt.price / SECTORS.yogurts.refPrice);
    expect(yogurt.price).toBeLessThan(PRICE_MAX_RATIO * SECTORS.yogurts.refPrice);
  });

  it('expert searches account for market elasticity instead of pricing at the legal cap', () => {
    SECTORS.yogurts.marketElasticity = 0;
    const insensitive = expertDecision('yogurts').price;
    SECTORS.yogurts.marketElasticity = 2;
    const sensitive = expertDecision('yogurts').price;
    expect(sensitive).toBeLessThan(insensitive);
    expect(sensitive).toBeLessThan(PRICE_MAX_RATIO * SECTORS.yogurts.refPrice);
  });

  it.each([3, 4])('experts can maintain fast-obsolescing quality in closing quarter %i', (turn) => {
    SECTORS.gadgets.qualityDecay = 0.94;
    expect(expertDecision('gadgets', turn).rnd).toBeGreaterThan(0);
    SECTORS.gadgets.qualityDecay = 0.99;
    expect(expertDecision('gadgets', turn).rnd).toBe(0);
    expect(expertDecision('crypto', turn).rnd).toBe(0);
  });
});
