import { expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView } from '../src/engine';
import { estimatedUnitCost } from '../src/sim/finance';
import { freeBuildableHexes } from '../src/sim/hexes';
import { awardHexes, hexReservePrice } from '../src/sim/hexAuctions';
import { companyOf, config, human } from './helpers';

it.each(['fr', 'en'] as const)('ne révèle pas une optimisation fiscale à un rival (%s)', (lang) => {
  const s = createGame({ ...config(3), lang, mapMode: 'hex', terrainAssignment: 'host',
    terrains: { a: 'quai-port-dividende', b: 'plaine-aux-subventions' } }, [human('a'), human('b')]);
  const c = companyOf(s, 'a');
  s.activeEffects = []; c.scandal = 0;
  const reference = structuredClone(s);
  const before = getPlayerView(s, 'b');
  const result = applyAction(s, 'a', { type: 'shady', companyId: c.id, kind: 'tax_optimisation' });
  expect(result.ok, result.message).toBe(true);
  expect(getPlayerView(s, 'b').companies.find((v) => v.id === c.id)!.taxRate)
    .toBe(before.companies.find((v) => v.id === c.id)!.taxRate);
  // La trésorerie des sociétés cotées est publique (§12) : isoler la décision à dépense publique identique.
  reference.companies[c.id].cash = c.cash;
  expect(getPlayerView(s, 'b')).toEqual(getPlayerView(reference, 'b'));
  const mine = getPlayerView(s, 'a').companies.find((v) => v.id === c.id)!;
  expect(mine.taxRate).toBe(0.25);
  expect(mine.private!.taxRate).toBe(0.05);
  expect(mine.private!.taxRateHorizon!.slice(0, 2)).toEqual([0.05, 0.25]);
});

it('publie le taux du siège avec les nouvelles et projette leur expiration sans décision privée', () => {
  const s = createGame({ ...config(3), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'monts-defiscalises' } }, [human('a')]);
  const c = companyOf(s, 'a');
  s.activeEffects = [{ id: 'suspension', newsId: 'suspension', kind: 'terrain', terrain: c.terrainId, lever: 'tax', suspend: true, value: 1, turnsLeft: 3 }];
  const before = JSON.stringify(s);
  const mine = getPlayerView(s, 'a').companies.find((v) => v.id === c.id)!;
  const rival = getPlayerView(s, 'spectateur').companies.find((v) => v.id === c.id)!;
  expect(rival.taxRate).toBe(0.25);
  expect(rival.horizonSeatTaxRate).toBe(0.05);
  expect(rival.private).toBeUndefined();
  expect(mine.private!.taxRateHorizon!.slice(0, 4)).toEqual([0.25, 0.25, 0.25, 0.05]);
  expect(JSON.stringify(s)).toBe(before);
});

it('expire les leviers locaux et la subvention des Portes dans les projections privées', () => {
  const s = createGame({ ...config(3), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'portes-petit-rabais' } }, [human('a')]);
  const c = companyOf(s, 'a'), p = c.products[0];
  s.turn = 7;
  s.activeEffects = [{ id: 'local', newsId: 'local', kind: 'terrain', terrain: c.terrainId, lever: 'marketing', value: 0.75, turnsLeft: 2 }];
  const before = JSON.stringify(s);
  const pv = getPlayerView(s, 'a').companies.find((v) => v.id === c.id)!.products[0];
  const projection = pv.private!.terrainProjection!;
  expect(projection.slice(0, 3).map((x) => x.marketingMultiplier)).toEqual([0.75, 0.75, 1]);
  expect(projection[0].unitCost).toBe(pv.private!.estimatedUnitCost);
  expect(projection[2].unitCost).toBeGreaterThan(projection[1].unitCost);
  const future = { ...s, turn: 9, activeEffects: [] };
  expect(projection[2].unitCost).toBeCloseTo(estimatedUnitCost(future, c, p), 10);
  expect(JSON.stringify(s)).toBe(before);
  projection[0].rndMultiplier = 999;
  expect(JSON.stringify(s)).toBe(before);
  expect(getPlayerView(s, 'spectateur').companies.find((v) => v.id === c.id)!.products[0].private).toBeUndefined();
});

it('garde le siège dans les projections tant que la mise est secrète, puis projette le départ adjugé', () => {
  const s = createGame({ ...config(3), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'monts-defiscalises' } }, [human('a', 'crypto')]);
  const c = companyOf(s, 'a'), p = c.products[0];
  s.activeEffects = [];
  const destination = freeBuildableHexes(s).find((hex) => hex === 'A10')!;
  expect(destination).toBeDefined();
  expect(applyAction(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, hexId: destination, bid: hexReservePrice(destination) }).ok).toBe(true);
  const pending = getPlayerView(s, 'a').companies.find((v) => v.id === c.id)!;
  expect(pending.private!.taxRateHorizon!.slice(0, 2)).toEqual([0.05, 0.05]);
  expect(pending.products[0].private!.terrainProjection!.slice(0, 2).map((x) => x.hexId)).toEqual([p.hexId, p.hexId]);
  awardHexes(s);
  const before = JSON.stringify(s);
  const view = getPlayerView(s, 'a').companies.find((v) => v.id === c.id)!;
  expect(view.taxRate).toBe(0.05);
  expect(view.private!.taxRateHorizon!.slice(0, 2)).toEqual([0.05, 0.25]);
  const projection = view.products[0].private!.terrainProjection!;
  expect(projection[0].hexId).toBe(p.hexId);
  expect(projection[1].hexId).toBe(destination);
  const moved = { ...p, hexId: destination, pendingHexId: undefined, terrainId: undefined };
  const futureCompany = { ...c, terrainId: undefined, products: [moved] };
  const future = { ...s, turn: s.turn + 1, companies: { ...s.companies, [c.id]: futureCompany } };
  expect(projection[1].unitCost).toBeCloseTo(estimatedUnitCost(future, futureCompany, moved), 10);
  expect(JSON.stringify(s)).toBe(before);
});
