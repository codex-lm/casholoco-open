import { afterEach, describe, expect, it } from 'vitest';
import { createGame, getPlayerView, applyAction, resolveTurn } from '../src/engine';
import { COMMODITIES, SECTORS } from '../src/content';
import { BUILDABLE } from '../src/content/hexes';
import { brandAfter, estimateLaunchIn, estimateLaunchInHex } from '../src/sim/advice';
import { expertTurn, type BotIO } from '../src/sim/botExpert';
import { NEUTRAL_PERSONALITY, runBots, setBotZoneMode } from '../src/sim/bots';
import { planClose } from '../src/sim/close';
import { estimatedUnitCost, laborPerLotHex, productSalvageValue, unitCostByHex, unitCostByZone } from '../src/sim/finance';
import { capitalHexId, hexLaborFactor } from '../src/sim/hexes';
import { effectiveHeatCredit } from '../src/sim/terrains';
import { deliveryPerLot, deliveryPerLotHex, estimatedTransport, estimatedTransportHex, portOnlyTransport, portOnlyTransportHex, transportPerLot, transportPerLotHex, zoneLaborFactor } from '../src/sim/transport';
import { ZONE_IDS, type Action, type CommodityId, type ExpertMemory, type GameState } from '../src/types';
import { bots, companyOf, config, human } from './helpers';

afterEach(() => setBotZoneMode('market'));

function inputUnit(state: GameState): number {
  return Object.entries(SECTORS.crypto.inputs).reduce((sum, [id, per]) => sum + (per ?? 0) * state.commodities[id as CommodityId].price * 1.1, 0);
}

describe('crypto marketing and intangible production', () => {
  it('doubles effective marketing without changing decay or other sectors', () => {
    const scale = 0.02 * SECTORS.crypto.refDemand * SECTORS.crypto.refPrice;
    const marketing = 440;
    const expected = 0.75 * 0.8 + 0.25 * (0.3 + Math.log(1 + 2 * marketing / scale));
    expect(SECTORS.crypto.marketingMultiplier).toBe(2);
    expect(SECTORS.crypto.intangible).toBe(true);
    expect(brandAfter('crypto', 0.8, marketing)).toBeCloseTo(expected, 9);
    expect(brandAfter('crypto', 0.8, marketing, 1.4)).toBeCloseTo(0.75 * 0.8 + 0.25 * (0.3 + Math.log(1 + 2 * 1.4 * marketing / scale)), 9);
    expect(brandAfter('crypto', 0.8, 0)).toBe(brandAfter('gadgets', 0.8, 0));
    const otherScale = 0.02 * SECTORS.gadgets.refDemand * SECTORS.gadgets.refPrice;
    expect(brandAfter('gadgets', 0.8, marketing)).toBeCloseTo(0.75 * 0.8 + 0.25 * (0.3 + Math.log(1 + marketing / otherScale)), 9);
  });

  for (const hexMode of [false, true]) {
    it(`has no delivery, inbound haul or transport estimates in ${hexMode ? 'hex' : 'classic'} mode`, () => {
      const state = createGame({ ...config(22), ...(hexMode ? { mapMode: 'hex' as const } : {}) }, [human('a', 'crypto')]);
      const company = companyOf(state, 'a');
      const product = company.products[0];
      company.cash = 1e6;
      company.inventory = {};
      company.sites = [];
      state.activeEffects = [{ id: 'expensive-carriage', newsId: 'test', kind: 'transportCost', value: 3, turnsLeft: 2 }];
      product.zoneId = 'mountain';
      if (hexMode) product.hexId = BUILDABLE.find((id) => id !== capitalHexId && !Object.values(state.companies).some((c) => c.products.some((p) => p.hexId === id)))!;
      const extracted = [{ siteId: 'chips-1', commodityId: 'chips' as const, lots: 100 }, { siteId: 'oil-1', commodityId: 'oil' as const, lots: 100 }];
      for (const zone of ZONE_IDS) {
        expect(deliveryPerLot(zone, 'crypto')).toBe(0);
        expect(portOnlyTransport('crypto', zone)).toBe(0);
        expect(transportPerLot(company, [20], extracted, [zone], 3)).toEqual([0]);
        expect(estimatedTransport(state, company, product, zone)).toBe(0);
      }
      for (const hex of BUILDABLE) {
        expect(deliveryPerLotHex(hex, 'crypto')).toBe(0);
        expect(portOnlyTransportHex('crypto', hex)).toBe(0);
        expect(transportPerLotHex(company, [20], extracted, [hex], 3)).toEqual([0]);
        expect(estimatedTransportHex(state, company, product, hex)).toBe(0);
      }
      expect(estimatedTransport(state, { ...company, products: [] }, product)).toBe(0);
      expect(estimatedTransportHex(state, { ...company, products: [] }, product)).toBe(0);
      const estimates = hexMode ? unitCostByHex(state, company, product, BUILDABLE) : unitCostByZone(state, company, product);
      for (const [position, cost] of Object.entries(estimates)) {
        const labor = hexMode ? laborPerLotHex(state, company, product, position)
          : SECTORS.crypto.laborCost * zoneLaborFactor(state, 'crypto', position as typeof ZONE_IDS[number], product.id);
        expect(cost).toBeCloseTo(labor + inputUnit(state), 6);
      }
      const launches = hexMode ? estimateLaunchInHex(state, 'crypto', 'a', BUILDABLE) : estimateLaunchIn(state, 'crypto', 'a', ZONE_IDS);
      for (const [position, launch] of Object.entries(launches)) {
        const labor = hexMode ? SECTORS.crypto.laborCost * hexLaborFactor(state, 'crypto', position) - effectiveHeatCredit(state, { sectorId: 'crypto', hexId: position })
          : SECTORS.crypto.laborCost * zoneLaborFactor(state, 'crypto', position as typeof ZONE_IDS[number]);
        expect(launch!.unitCost).toBeCloseTo(labor + inputUnit(state), 6);
      }
      const visible = getPlayerView(state, 'a').companies.find((c) => c.id === company.id)!.products[0];
      expect(visible.private!.estimatedTransport).toBe(0);
      const unitCost = estimatedUnitCost(state, company, product);
      const planned = planClose(state, company);
      expect(planned.production.plannedCost).toBeCloseTo(planned.production.planned * unitCost, 4);
      resolveTurn(state);
      expect(company.reports.at(-1)!.products.find((p) => p.productId === product.id)!.transport ?? 0).toBe(0);
      expect(product.lastUnitCost).toBeCloseTo(unitCost, 6);
    });
  }
});

function normalMarketing(history: number[], level: 'normal' | 'intern' = 'normal', sectorId = 'crypto' as const): { marketing: number; rnd: number } {
  setBotZoneMode('capital');
  const bot = { ...bots(1)[0], sectorId, botLevel: level };
  const state = createGame(config(11), [human('h'), bot]);
  const company = companyOf(state, bot.id);
  const product = company.products[0];
  company.cash = 1e6;
  state.sectors.crypto.demandHistory = history;
  runBots(state);
  return { marketing: product.marketing, rnd: product.rnd };
}

describe('bots use visible crypto evidence', () => {
  it('normal bots spend modestly more only after two consecutive public demand rises', () => {
    const flat = normalMarketing([100, 100, 100]);
    const rising = normalMarketing([100, 110, 120]);
    expect(rising.marketing).toBeGreaterThan(flat.marketing);
    expect(rising.marketing).toBeCloseTo(flat.marketing * 1.15, -1);
    expect(rising.rnd).toBe(flat.rnd);
    for (const history of [[], [100, 110], [100, 90, 120], [100, 120, 110], [100, 110, 110]]) expect(normalMarketing(history)).toEqual(flat);
  });

  it('leaves interns decisions unchanged when demand rises', () => {
    expect(normalMarketing([100, 110, 120], 'intern')).toEqual(normalMarketing([100, 100, 100], 'intern'));
  });

  for (const hexMode of [false, true]) {
    it(`experts exit a clearly unprofitable product using visible salvage in ${hexMode ? 'hex' : 'classic'} mode, keeping the last product`, () => {
      const state = createGame({ ...config(3, 8), ...(hexMode ? { mapMode: 'hex' as const } : {}) }, [human('a', 'energy_drinks')]);
      state.turn = 7;
      const company = companyOf(state, 'a');
      const good = company.products[0];
      company.cash = 1e5;
      state.commodities.chips.price = COMMODITIES.chips.basePrice * 100;
      const poor = { ...good, id: 'poor-crypto', name: 'Poor crypto', sectorId: 'crypto' as const, capacity: 34, pendingCapacity: 0,
        stock: 0, price: 200, launchedTurn: 1, ...(hexMode ? { hexId: BUILDABLE.find((id) => !Object.values(state.companies).some((c) => c.products.some((p) => p.hexId === id)))!, landCost: 300 } : {}) };
      company.products.push(poor);
      const unitCost = estimatedUnitCost(state, company, poor);
      const fixedCosts = 250 + SECTORS[good.sectorId].fixedCost + SECTORS.crypto.fixedCost;
      // Two realized quarters already fail to cover this line's fixed cost, even with no discretionary spending.
      company.reports = [5, 6].map((turn) => ({ turn, revenue: 200, cogs: unitCost, marketing: 0, rnd: 0,
        fixedCosts, interest: 0, fines: 0, tax: 0, netProfit: 200 - unitCost - fixedCosts,
        cashEnd: company.cash, debtEnd: 0, products: [{ productId: poor.id, name: poor.name,
          sectorId: poor.sectorId, produced: 1, sold: 1, revenue: 200, marketShare: 1 / SECTORS.crypto.refDemand, unitCost }] }));
      expect(company.reports.every((r) => r.products[0].revenue - r.products[0].sold * unitCost - SECTORS.crypto.fixedCost < -50)).toBe(true);
      const actions: Action[] = [];
      const memory: ExpertMemory = { calib: {} };
      let salvageRecovered = 0;
      const io: BotIO = { view: () => getPlayerView(state, 'a'), act: (action) => {
        actions.push(action);
        const cashBefore = company.cash;
        const result = applyAction(state, 'a', action);
        if (action.type === 'discontinueProduct' && result.ok) salvageRecovered += company.cash - cashBefore;
        return result;
      },
        memory: () => memory, productName: () => 'Bot product', startupName: () => 'Bot startup' };
      const salvage = productSalvageValue(poor, hexMode);
      expertTurn(io, NEUTRAL_PERSONALITY);
      expect(actions.filter((a) => a.type === 'discontinueProduct')).toEqual([{ type: 'discontinueProduct', companyId: company.id, productId: poor.id }]);
      expect(company.products.some((p) => p.id === poor.id)).toBe(false);
      expect(company.products.some((p) => p.id === good.id)).toBe(true);
      expect(salvageRecovered).toBe(salvage);
      expect(company.turnFlags.exceptionalLoss).toBeUndefined();
      company.products = [{ ...poor, id: 'last-product' }];
      actions.length = 0;
      expertTurn(io, NEUTRAL_PERSONALITY);
      expect(actions.some((a) => a.type === 'discontinueProduct')).toBe(false);
      expect(company.products).toHaveLength(1);
    });
  }
});
