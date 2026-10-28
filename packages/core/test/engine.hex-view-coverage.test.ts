import { expect, it } from 'vitest';
import { BUILDABLE, HEXES } from '../src/content/hexes';
import { applyAction, createGame, getPlayerView } from '../src/engine';
import { estimateLaunchInHex, estimateSales, marketInputs } from '../src/sim/advice';
import { unitCostByHex } from '../src/sim/finance';
import { candidateHexes, freeBuildableHexes } from '../src/sim/hexes';
import { awardHexes, hexReservePrice } from '../src/sim/hexAuctions';
import { buildPlayerView } from '../src/sim/view';
import { companyOf, config, human } from './helpers';

it.each(['fr', 'en'] as const)('covers every theoretical position without making occupied land available (%s)', (lang) => {
  const state = createGame({ ...config(42), lang, mapMode: 'hex', terrainAssignment: 'host',
    terrains: { a: 'monts-defiscalises', b: 'faubourgs-croissance' } }, [human('a', 'crypto'), human('b', 'gadgets')]);
  const company = companyOf(state, 'a'), product = company.products[0];
  company.cash = 1e6;
  const candidates = candidateHexes(state);
  const target = freeBuildableHexes(state).find((id) => !candidates.includes(id))!;
  expect(target).toBeDefined();
  expect(applyAction(state, 'a', { type: 'moveFactory', companyId: company.id, productId: product.id,
    hexId: target, bid: hexReservePrice(target) }).ok).toBe(true);
  awardHexes(state);
  expect(product.pendingHexId).toBe(target);
  const free = freeBuildableHexes(state);
  expect(free).not.toContain(target);
  const snapshot = JSON.stringify(state);
  const view = getPlayerView(state, 'a');
  const own = view.companies.find((c) => c.id === company.id)!.products[0].private!;
  const cells = HEXES.map((hex) => hex.id);
  expect(new Set(Object.keys(own.hexes!.unitCost))).toEqual(new Set(cells));
  expect(new Set(Object.keys(own.hexes!.demand!))).toEqual(new Set(cells));
  expect(own.hexes!.unitCost).toEqual(unitCostByHex(state, company, product, cells));
  expect(own.hexes!.demand![product.hexId!]).toBe(own.estimate!.demand);
  const moved = { ...product, hexId: target, terrainId: undefined, pendingHexId: undefined };
  expect(own.hexes!.demand![target]).toBe(estimateSales(product.sectorId,
    marketInputs(state, company, moved, 'a', own.hexes!.unitCost[target]), moved).demand);
  for (const sector of view.sectors) {
    expect(Object.keys(sector.launchByHex!)).toEqual(cells);
    expect(sector.launchByHex).toEqual(estimateLaunchInHex(state, sector.id, 'a', cells, true));
  }
  const rival = getPlayerView(state, 'b').companies.find((c) => c.id === company.id)!;
  expect(rival.private).toBeUndefined();
  expect(rival.products[0].private).toBeUndefined();
  expect(JSON.stringify(state)).toBe(snapshot);
  own.hexes!.unitCost[target] = -999;
  own.hexes!.demand![target] = -999;
  expect(JSON.stringify(state)).toBe(snapshot);
});

it.each(['fr', 'en'] as const)('keeps a rival view identical after secret decisions and a competing terrain bid (%s)', (lang) => {
  const state = createGame({ ...config(42), lang, mapMode: 'hex' }, [human('a', 'crypto'), human('b', 'gadgets')]);
  const company = companyOf(state, 'a'), product = company.products[0];
  company.cash = 1e6;
  const reference = getPlayerView(state, 'b');
  product.price *= 1.7;
  product.production = 0;
  product.marketing *= 3;
  product.rnd *= 4;
  const target = freeBuildableHexes(state)[0];
  expect(applyAction(state, 'a', { type: 'moveFactory', companyId: company.id, productId: product.id,
    hexId: target, bid: hexReservePrice(target) + 100 }).ok).toBe(true);
  expect(getPlayerView(state, 'b')).toEqual(reference);
});

it('still supplies the current plant estimate when no buildable cells remain free', () => {
  const state = createGame({ ...config(42), mapMode: 'hex' }, [human('a')]);
  const company = companyOf(state, 'a'), product = company.products[0];
  const npc = Object.values(state.companies).find((c) => c.npcDefId)!;
  for (const [i, hexId] of freeBuildableHexes(state).entries()) {
    npc.products.push({ ...npc.products[0], id: `fill${i}`, hexId });
  }
  expect(freeBuildableHexes(state)).toEqual([]);
  const view = getPlayerView(state, 'a');
  const own = view.companies.find((c) => c.id === company.id)!.products[0].private!;
  expect(Object.keys(own.hexes!.unitCost)).toEqual(HEXES.map((hex) => hex.id));
  expect(Object.keys(own.hexes!.demand!)).toEqual(HEXES.map((hex) => hex.id));
  expect(view.sectors.every((s) => Object.keys(s.launchByHex!).length === HEXES.length)).toBe(true);
  expect(BUILDABLE).toContain(product.hexId);
});

it('preserves the expert bot candidate order while the public view covers the whole board', () => {
  const state = createGame({ ...config(42), mapMode: 'hex' }, [human('a')]);
  const company = companyOf(state, 'a'), product = company.products[0];
  const candidates = candidateHexes(state);
  const botView = buildPlayerView(state, 'a', { journal: 'last', hexEstimates: 'candidates' });
  const publicView = getPlayerView(state, 'a');
  expect(candidates.length).toBeLessThan(freeBuildableHexes(state).length);
  for (const sector of botView.sectors) {
    expect(Object.keys(sector.launchByHex!)).toEqual(candidates);
    expect(sector.launchEstimate).toEqual(publicView.sectors.find((s) => s.id === sector.id)!.launchEstimate);
  }
  const estimates = botView.companies.find((c) => c.id === company.id)!.products[0].private!.hexes!;
  expect(Object.keys(estimates.unitCost)).toEqual([...new Set([...candidates, product.hexId!])]);
  expect(botView.hexes).toEqual(publicView.hexes);
  const { demandByCity, ...ordinary } = publicView.sectors[0].launchByHex![candidates[0]];
  expect(demandByCity).toBeDefined();
  expect(botView.sectors[0].launchByHex![candidates[0]]).toEqual(ordinary);
});
