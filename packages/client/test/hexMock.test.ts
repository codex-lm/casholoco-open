import { afterEach, describe, expect, it, vi } from 'vitest';
import { SECTORS, ZONE_IDS, getContent, zoneLabor, type PlayerView } from '@muchomoney/core';
import type { MockBackend } from '../src/api';
import { getState, setState } from '../src/store';
import { startMock } from '../src/dev/mockView';

const mock = vi.hoisted(() => ({ backend: null as MockBackend | null }));
vi.mock('../src/api', async () => {
  const { setState } = await import('../src/store');
  return {
    installMock: (backend: MockBackend) => { mock.backend = backend; setState({ mock: true }); },
    receiveView: (view: PlayerView) => setState({ view }),
  };
});

const initial = getState();
afterEach(() => {
  mock.backend = null;
  setState(initial);
  vi.unstubAllGlobals();
});

const viewNow = () => getState().view!;

describe.each(['fr', 'en'] as const)('real hex development mock (%s)', (lang) => {
  it('starts a fresh fair hex game with a human and the catalog bots in the requested language', () => {
    setState({ lang: lang === 'fr' ? 'en' : 'fr' });
    startMock('hex', lang);
    const view = viewNow();
    expect(view.config).toMatchObject({ mapMode: 'hex', terrainAssignment: 'fair', lang });
    expect(view.turn).toBe(1);
    expect(getState().lang).toBe(lang);
    const botCount = Math.min(7, getContent(lang).bots.length);
    expect(view.players).toHaveLength(1 + botCount);
    expect(view.players.filter((p) => p.isBot)).toHaveLength(botCount);
    expect(view.terrains).toHaveLength(8);
    expect(view.self.hexBids).toEqual([]);
    expect(mock.backend).not.toBeNull();
  });

  it('places real factory bids, cancels a launch project, and builds a second site when ready', () => {
    startMock('hex', lang);
    const before = viewNow();
    const company = before.companies.find((c) => c.private)!;
    const product = company.products[0];
    const [moveCell, launchCell] = before.hexes!.free;
    const backend = mock.backend!;
    const moveResult = backend.action({
      type: 'buildFactory', companyId: company.id, productId: product.id,
      hexId: moveCell, bid: before.hexes!.reserve[moveCell],
    });
    expect(moveResult.ok, moveResult.message).toBe(true);
    expect(viewNow().hexes!.occupied[moveCell]).toBeUndefined();
    expect(viewNow().companies.find((c) => c.id === company.id)!.cash).toBe(company.cash);
    const launchResult = backend.action({
      type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: 'Project',
      hexId: launchCell, bid: before.hexes!.reserve[launchCell], fallback: 'nearest',
    });
    expect(launchResult.ok, launchResult.message).toBe(true);
    const project = viewNow().companies.find((c) => c.id === company.id)!.private!.launchProjects![0];
    expect(project.name).toBe('Project');
    expect(backend.action({ type: 'cancelHexBid', companyId: company.id, projectId: project.id }).ok).toBe(true);
    expect(viewNow().self.hexBids!.some((b) => b.kind === 'launch')).toBe(false);
    expect(viewNow().companies.find((c) => c.id === company.id)!.private!.launchProjects).toEqual([]);
    backend.ready(false);
    expect(viewNow().turn).toBe(before.turn);
    backend.ready(true);
    const after = viewNow();
    expect(after.turn).toBe(before.turn + 1);
    const bid = after.self.hexBids!.find((b) => b.productId === product.id)!;
    expect(bid.result).toBeDefined();
    expect(bid.result!.outcome).toBe('won');
    expect(bid.result!.price).toBe(before.hexes!.reserve[moveCell]);
    const factories = after.companies.find((c) => c.id === company.id)!.products;
    expect(factories.find(p => p.id === product.id)!.hexId).toBe(product.hexId);
    expect(factories.find(p => p.id !== product.id && p.factoryProductId === product.id)?.hexId).toBe(moveCell);
    expect(after.hexes!.results.some((r) => r.hexId === moveCell && r.companyId === company.id)).toBe(true);
  });
});

it('defaults the hex mock to French and keeps mock=1 classic', () => {
  startMock('hex');
  expect(viewNow().config.lang).toBe('fr');
  expect(viewNow().config.mapMode).toBe('hex');
  vi.stubGlobal('window', { setTimeout: vi.fn() });
  startMock('1');
  expect(viewNow().config.mapMode).toBeUndefined();
  expect(viewNow().hexes).toBeUndefined();
  expect(viewNow().terrains).toBeUndefined();
  expect(viewNow().self?.hexBids).toBeUndefined();
});

it('classic development mock gives launched crypto no transport at any destination', () => {
  startMock('fresh');
  const company = viewNow().companies.find((c) => c.private)!;
  const result = mock.backend!.action({ type: 'launchProduct', companyId: company.id, sectorId: 'crypto', name: 'Digital', zoneId: 'mountain' });
  expect(result.ok, result.message).toBe(true);
  let product = viewNow().companies.find((c) => c.id === company.id)!.products.find((p) => p.name === 'Digital')!;
  expect(product.private!.estimatedTransport).toBe(0);
  const costs = product.private!.zones.unitCost;
  for (const zone of ZONE_IDS) expect(costs[zone] - costs.capital).toBeCloseTo(SECTORS.crypto.laborCost * (zoneLabor(zone, 'crypto') - 1), 1);
  expect(mock.backend!.action({ type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: 'south' }).ok).toBe(true);
  product = viewNow().companies.find((c) => c.id === company.id)!.products.find((p) => p.name === 'Digital')!;
  expect(product.private!.estimatedTransport).toBe(0);
});
