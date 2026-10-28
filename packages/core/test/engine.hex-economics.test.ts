import { describe, expect, it } from 'vitest';
import { createGame, getPlayerView, resolveTurn } from '../src/engine';
import { SECTORS, ZONES } from '../src/content';
import { estimateSales, hexDemand, hexValues, marketInputs } from '../src/sim/advice';
import { planClose } from '../src/sim/close';
import { estimatedUnitCost, laborMultiplier, laborPerLot, unitCostByHex } from '../src/sim/finance';
import { capitalHexId, heatCredit, hexLaborFactor, proximityOfHex, zoneHexId } from '../src/sim/hexes';
import { demandIn, demandInHex, marketEntry, cityTotals } from '../src/sim/regions';
import { deliveryPerLot, deliveryPerLotHex, estimatedTransport, portHaul, portHaulHex, portOnlyTransportHex, siteHaul, siteHaulHex } from '../src/sim/transport';
import { SECTOR_IDS, ZONE_IDS } from '../src/types';
import { companyOf, config, human } from './helpers';

function cryptoGame() {
  const state = createGame({ ...config(17), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'quai-port-dividende', b: 'faubourgs-croissance' } }, [human('a', 'crypto'), human('b', 'yogurts')]);
  state.activeEffects = [];
  for (const c of Object.values(state.companies)) {
    c.inventory = {};
    c.sites = [];
    // Ces tests isolent l'économie de base du plateau ; les leviers des terrains ont leurs propres tests.
    delete c.terrainId;
    for (const p of c.products) delete p.terrainId;
    if (c.controllerId) c.cash = 1e6;
  }
  return state;
}

describe('hex economics use the same cell in estimates, planning and resolution', () => {
  it.each(ZONE_IDS)('matches classic transport, demand and unpressured labor at the %s zone cell', (zoneId) => {
    const state = cryptoGame();
    state.companies = {};
    const hexId = zoneHexId(zoneId);
    for (const cid of ['oil', 'sugar', 'lithium', 'chips'] as const) {
      expect(portHaulHex(hexId, cid)).toBe(portHaul(zoneId, cid));
    }
    for (const slotId of ['oil-1', 'sugar-3', 'chips-2', 'lithium-1'] as const) {
      const cid = slotId.split('-')[0] as 'oil' | 'sugar' | 'chips' | 'lithium';
      expect(siteHaulHex(slotId, hexId, cid)).toBe(siteHaul(slotId, zoneId, cid));
    }
    for (const sectorId of SECTOR_IDS) {
      expect(deliveryPerLotHex(hexId, sectorId)).toBeCloseTo(deliveryPerLot(zoneId, sectorId), 9);
      expect(demandInHex(sectorId, 537.123, 1.321, hexId, 6.21)).toBeCloseTo(demandIn(sectorId, 537.123, 1.321, zoneId, 6.21), 9);
      const othersByCity = [2.1, 3.2, 4.3, 5.4, 6.5];
      expect(demandInHex(sectorId, 537.123, 1.321, hexId, 6.21, othersByCity)).toBeCloseTo(demandIn(sectorId, 537.123, 1.321, zoneId, 6.21, othersByCity), 9);
      expect(hexLaborFactor(state, sectorId, hexId)).toBe(ZONES[zoneId].labor[sectorId]);
    }
  });

  it.each([['north', 7.5, 1], ['mountain', 10, 0.05]] as const)('pays crypto heat at %s as a signed production credit in every costing path', (zoneId, heat, laborFactor) => {
    const s = cryptoGame();
    const c = companyOf(s, 'a');
    const p = c.products[0];
    const hexId = zoneHexId(zoneId);
    if (laborFactor !== 1) s.activeEffects.push({ kind: 'laborCost', sectorId: 'crypto', value: laborFactor, turnsLeft: 2, id: 'test-labor', newsId: 'test' });
    p.hexId = hexId;
    const grossLabor = SECTORS.crypto.laborCost * laborMultiplier(s, c, 'crypto') * hexLaborFactor(s, 'crypto', hexId, p.id);
    expect(heatCredit('crypto', hexId)).toBe(heat);
    expect(laborPerLot(s, c, p)).toBeCloseTo(grossLabor - heat, 10);
    if (laborFactor < 1) expect(laborPerLot(s, c, p)).toBeLessThan(0);
    const estimate = estimatedUnitCost(s, c, p);
    const transport = estimatedTransport(s, c, p);
    expect(transport).toBe(0); // Heat credits remain labor; intangible crypto has no inbound haul or delivery.
    expect(transport).toBeCloseTo(portOnlyTransportHex('crypto', hexId), 10);
    expect(unitCostByHex(s, c, p, [hexId])[hexId]).toBe(estimate);
    const plan = planClose(s, c);
    expect(plan.production.plannedCost).toBeCloseTo(plan.production.planned * estimate, 4);
    expect(getPlayerView(s, 'a').companies.find((x) => x.id === c.id)!.products[0].private!.heatCredit).toBe(heat);
    resolveTurn(s);
    const report = c.reports.at(-1)!.products.find((x) => x.productId === p.id)!;
    expect(report.produced).toBe(plan.production.planned);
    expect(report.transport).toBeUndefined(); // Zero transport is omitted from every product report.
    expect(report.transport ?? 0).toBeCloseTo(transport, 6);
    expect(p.lastUnitCost).toBeCloseTo(estimate, 6);
  });

  it('costs and demands candidate cells without mutating the product', () => {
    const s = cryptoGame();
    const c = companyOf(s, 'a');
    const p = c.products[0];
    const candidates = [capitalHexId, zoneHexId('north'), zoneHexId('mountain')];
    const before = JSON.stringify(s);
    const costs = unitCostByHex(s, c, p, candidates);
    const market = marketInputs(s, c, p, 'a', estimatedUnitCost(s, c, p));
    const demand = hexDemand(p.sectorId, market, p, candidates);
    const values = hexValues(s, c, p, 'a', candidates);
    expect(Object.keys(costs)).toEqual(candidates);
    expect(Object.keys(demand)).toEqual(candidates);
    expect(Object.keys(values.value)).toEqual(candidates);
    expect(values.capitalCogs).toBeGreaterThan(0);
    for (const id of candidates) {
      expect(Number.isFinite(costs[id])).toBe(true);
      expect(demand[id]).toBeGreaterThan(0);
      expect(Number.isFinite(values.value[id])).toBe(true);
    }
    expect(estimateSales(p.sectorId, market, p).demand).toBe(hexDemand(p.sectorId, market, p, [p.hexId!])[p.hexId!]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('preserves the national arithmetic exactly at the capital and uses cell proximity elsewhere', () => {
    for (const sectorId of SECTOR_IDS) {
      expect(demandInHex(sectorId, 537.123, 1.321, capitalHexId, 6.21)).toBe(demandIn(sectorId, 537.123, 1.321, 'capital', 6.21));
    }
    const s = cryptoGame();
    const p = companyOf(s, 'b').products[0];
    p.hexId = zoneHexId('south');
    const entry = marketEntry(s, p, 2);
    const totals = cityTotals(p.sectorId, 3, [entry], true);
    expect(totals).toEqual(proximityOfHex(p.sectorId, p.hexId).map((pi) => 3 + 2 * pi));
  });
});
