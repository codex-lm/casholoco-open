import { describe, expect, it } from 'vitest';
import {
  SQUARE_SIZE, boardCells, boardBuildable, capitalCellId, createGame, getPlayerView, hexById, resolveTurn,
  type Lang,
} from '@muchomoney/core';
import { mapActivities } from '../src/screens/game/city/MapActivityPalette';
import { hexArrowTarget, hexIsBuildable, hexParcelKm, hexReferenceHexId } from '../src/screens/game/city/hexModel';
import { mapFactoryDelivery } from '../src/screens/game/city/mapDeliveryModel';
import { buildMapFlowModel } from '../src/screens/game/city/mapFlows';
import { forcedIncubatorHex, sidePanelModel } from '../src/screens/game/city/sidePanelModel';
import { gameTabOrder } from '../src/guide';

function fixture(lang: Lang = 'fr') {
  const state = createGame({ seed: 42, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang,
    mapMode: 'square', terrainAssignment: 'fair', industryRules: 'network' }, [
    { id: 'me', name: 'Ada', isBot: false, companyName: 'Manufacture', sectorId: 'yogurts', connected: true, color: '#b07b51' },
    { id: 'rival', name: 'Ben', isBot: false, companyName: 'Ateliers', sectorId: 'gadgets', connected: true, color: '#617c85' },
  ]);
  const view = getPlayerView(state, 'me');
  const company = view.companies.find(c => c.controllerId === 'me')!;
  return { state, view, company, product: company.products[0] };
}

describe('square island shared map interactions', () => {
  it.each(['fr', 'en'] as const)('uses square parcels for profiles, delivery readings and local decisions in %s', lang => {
    const { view, company, product } = fixture(lang);
    const ref = { kind: 'product' as const, productId: product.id };
    expect(product.hexId).toMatch(/^S-/);
    expect(hexReferenceHexId(view, ref)).toBe(product.hexId);
    expect(hexReferenceHexId(view, { ...ref, originHexId: undefined })).toBe(product.hexId);
    expect(mapActivities(view).filter(a => a.kind === 'factory' && a.reference.kind === 'product')).toHaveLength(company.products.length);
    const values = boardCells(view.config).map(cell => mapFactoryDelivery(view, ref, cell.id));
    expect(values.every(value => value && Number.isFinite(value.transport) && Number.isFinite(value.demand))).toBe(true);
    expect(values.reduce((sum, value) => sum + (value?.demand ?? 0), 0)).toBeCloseTo(product.private!.estimate!.demand, 7);
    const destination = forcedIncubatorHex(view, new Set());
    expect(destination).toMatch(/^S-/);
    expect(boardBuildable(view.config)).toContain(destination);
    expect(sidePanelModel(view, company, ref).rows.every(row => row.hexId?.startsWith('S-'))).toBe(true);
    expect(gameTabOrder('square')).toEqual(gameTabOrder('hex'));
  });

  it('draws squares and navigates only along their four edges', () => {
    const { view } = fixture();
    const id = capitalCellId(view.config), cell = hexById(id)!;
    const outline = hexParcelKm(cell);
    expect(outline).toHaveLength(4);
    expect(Math.max(...outline.map(p => p.x)) - Math.min(...outline.map(p => p.x))).toBe(SQUARE_SIZE);
    expect(Math.max(...outline.map(p => p.y)) - Math.min(...outline.map(p => p.y))).toBe(SQUARE_SIZE);
    for (const key of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
      const target = hexArrowTarget(id, key);
      if (target) {
        const next = hexById(target)!;
        expect(Math.abs(next.q - cell.q) + Math.abs(next.r - cell.r)).toBe(1);
      }
    }
    expect(boardBuildable(view.config).every(hexIsBuildable)).toBe(true);
  });

  it('keeps square flow origins and historical deliveries, and conceals rival plans', () => {
    const { state, view, product } = fixture();
    const before = buildMapFlowModel(view, product.id);
    expect(before.production.find(p => p.productId === product.id)?.hexId).toBe(product.hexId);
    expect(before.production.filter(p => !p.mine).every(p => p.planned === null && p.stock === null && p.demand === null)).toBe(true);
    resolveTurn(state);
    const next = getPlayerView(state, 'me');
    const flows = buildMapFlowModel(next, product.id);
    expect(flows.sales.length).toBeGreaterThan(0);
    expect(flows.sales.every(flow => flow.originKnown && flow.turn === 1)).toBe(true);
    for (const flow of flows.sales) {
      expect(flow.route?.points.length).toBeGreaterThan(1);
      expect(Number.isFinite(flow.route?.cost)).toBe(true);
    }
    const spectator = buildMapFlowModel(getPlayerView(state, 'spectator'));
    expect(spectator.supply).toEqual([]);
    expect(spectator.production.every(flow => flow.planned === null && flow.stock === null)).toBe(true);
  });
});
