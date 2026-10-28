import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { SECTORS } from '../src/content';
import { TERRAINS } from '../src/content/fr/terrains';
import { estimateSales, marketInputs } from '../src/sim/advice';
import { estimatedUnitCost, productSalvageValue } from '../src/sim/finance';
import { applyNewsCard } from '../src/sim/news';
import { terrainValues } from '../src/sim/terrainAssignment';
import { terrainMultiplier, terrainSalvageRate } from '../src/sim/terrains';
import type { NewsCard, SectorId } from '../src/types';
import { companyOf, config, human } from './helpers';

// Les taux sont lus dans le contenu : le calibrage du multiplicateur de prix perçus ne doit pas casser ce test.
const island = TERRAINS.find((t) => t.id === 'ile-aux-niches')!;
const perceivedMult = island.effects.find((e) => e.lever === 'perceivedPrice')!.mult!;
const islandSalvageRate = island.effects.find((e) => e.lever === 'salvage')!.rate!;

function setup(sector: SectorId = 'gadgets') {
  const s = createGame({ ...config(207), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'ile-aux-niches', b: 'monts-defiscalises' } }, [human('a', sector), human('b', 'yogurts')]);
  s.activeEffects = [];
  for (const c of Object.values(s.companies)) { c.cash = 1e7; c.inventory = {}; c.sites = []; }
  return { s, c: companyOf(s, 'a'), other: companyOf(s, 'b'), p: companyOf(s, 'a').products[0] };
}

function localCard(id: string, effects: NewsCard['effects']): NewsCard {
  return { id, category: 'local', headline: '{company}', body: '{company}', tone: 'bad', weight: 1, effects };
}

describe('Île-aux-Niches : prix perçus et revente', () => {
  it('perceived price lifts attractiveness and demand while revenue cashes the full price', () => {
    const { s, c, p } = setup();
    expect(terrainMultiplier(s, c, p, 'perceivedPrice')).toBe(perceivedMult);
    const market = marketInputs(s, c, p, 'a', estimatedUnitCost(s, c, p));
    expect(market.priceMultiplier).toBe(perceivedMult);
    const withPerk = estimateSales(p.sectorId, market, p);
    const withoutPerk = estimateSales(p.sectorId, { ...market, priceMultiplier: 1 }, p);
    expect(withPerk.demand).toBeGreaterThan(withoutPerk.demand);
    // Le prix affiché ne change pas : le chiffre d'affaires se calcule au prix complet, jamais au prix perçu.
    expect(withPerk.revenue).toBeCloseTo(withPerk.sales * p.price, 8);

    // Résolution réelle : l'île vend plus qu'une usine identique sans dotation, au même prix complet.
    p.stock = 1e5; p.production = 0;
    const baseline = structuredClone(s);
    const bc = companyOf(baseline, 'a'); const bp = bc.products[0];
    delete bc.terrainId; delete bp.terrainId;
    resolveTurn(s); resolveTurn(baseline);
    expect(p.lastSales).toBeGreaterThan(bp.lastSales);
    expect(p.price).toBe(bp.price);
    expect(p.lastRevenue).toBeCloseTo(p.lastSales * p.price, 6);
  });

  it('a suspending local news removes both perks while active, and they return at expiry', () => {
    const { s, c, p } = setup();
    applyNewsCard(s, localCard('test-dutyfree-suspend', [
      { type: 'terrain', terrain: 'ile-aux-niches', lever: 'perceivedPrice', suspend: true, duration: 2 },
      { type: 'terrain', terrain: 'ile-aux-niches', lever: 'salvage', suspend: true, duration: 2 },
    ]), 'news');
    expect(terrainMultiplier(s, c, p, 'perceivedPrice')).toBe(1);
    expect(terrainSalvageRate(s, p, c)).toBe(0.5);
    expect(marketInputs(s, c, p, 'a', 0).priceMultiplier).toBe(1);
    for (const e of s.activeEffects) e.turnsLeft = 0;
    expect(terrainMultiplier(s, c, p, 'perceivedPrice')).toBe(perceivedMult);
    expect(terrainSalvageRate(s, p, c)).toBe(islandSalvageRate);

    // Une nouvelle multiplicatrice module les deux leviers comme les autres (bornée à [0, 1] pour la revente).
    s.activeEffects = [];
    applyNewsCard(s, localCard('test-dutyfree-mult', [
      { type: 'terrain', terrain: 'ile-aux-niches', lever: 'perceivedPrice', multiplier: 0.5, duration: 1 },
      { type: 'terrain', terrain: 'ile-aux-niches', lever: 'salvage', multiplier: 1.1, duration: 1 },
    ]), 'news');
    expect(terrainMultiplier(s, c, p, 'perceivedPrice')).toBeCloseTo(perceivedMult * 0.5, 12);
    expect(terrainSalvageRate(s, p, c)).toBeCloseTo(Math.min(1, islandSalvageRate * 1.1), 12);
  });

  it('resells the island starting plant at its terrain rate, others and revoked grants at half', () => {
    const { s, c, other, p } = setup();
    expect(terrainSalvageRate(s, p, c)).toBe(islandSalvageRate);
    expect(terrainSalvageRate(s, other.products[0], other)).toBe(0.5);
    // Une usine lancée ensuite sur une case ordinaire ne touche rien.
    expect(terrainSalvageRate(s, { ...p, id: 'later-plant', terrainId: undefined, hexId: 'H5' }, c)).toBe(0.5);

    // La fermeture encaisse le taux du terrain et ne passe en charge que la fraction non récupérée du stock.
    p.stock = 10; p.lastUnitCost = 80; p.pendingCapacity = 4; p.landCost = 2000;
    const expected = productSalvageValue(p, true, islandSalvageRate);
    expect(expected).toBeCloseTo(islandSalvageRate * ((p.capacity + 4) * SECTORS[p.sectorId].capacityCost + 10 * 80 + 2000), 8);
    const cash = c.cash;
    const result = applyAction(s, 'a', { type: 'discontinueProduct', companyId: c.id, productId: p.id });
    expect(result.ok, result.message).toBe(true);
    expect(c.cash).toBeCloseTo(cash + expected, 8);
    expect(c.turnFlags.exceptionalLoss).toBeCloseTo((1 - islandSalvageRate) * 10 * 80, 8);
    // Dotation révoquée par la fermeture : une revente retombe à la moitié.
    expect(terrainSalvageRate(s, p, c)).toBe(0.5);
  });

  it('publishes both levers in the terrain summary, the estimate inputs and the projection', () => {
    const { s, c, p } = setup();
    const pv = getPlayerView(s, 'a').companies.find((x) => x.id === c.id)!.products.find((x) => x.id === p.id)!;
    const effects = pv.private!.terrainEffects!;
    expect(effects).toContainEqual({ lever: 'perceivedPrice', mult: perceivedMult });
    expect(effects).toContainEqual({ lever: 'salvage', rate: islandSalvageRate });
    expect(pv.private!.market!.priceMultiplier).toBe(perceivedMult);
    expect(pv.private!.terrainProjection![0].priceMultiplier).toBe(perceivedMult);
    // L'estimation publiée reflète le prix perçu, le prix en rayon reste le prix complet.
    expect(pv.price).toBe(p.price);
    expect(pv.private!.estimate!.demand).toBeCloseTo(
      estimateSales(p.sectorId, marketInputs(s, c, p, 'a', estimatedUnitCost(s, c, p)), p).demand, 8);
  });

  it('values the island higher with its perceived-price perk than without it', () => {
    const { s, c, p } = setup();
    const withPerks = terrainValues(s, c, p, false)['ile-aux-niches'];
    const saved = island.effects;
    island.effects = saved.filter((e) => e.lever !== 'perceivedPrice');
    try {
      expect(withPerks).toBeGreaterThan(terrainValues(s, c, p, false)['ile-aux-niches']);
    } finally {
      island.effects = saved;
    }
  });

  it('leaves classic mode at the ordinary half rate and full-price attractiveness', () => {
    const s = createGame({ ...config(207), mapMode: 'classic' }, [human('a', 'gadgets'), human('b', 'yogurts')]);
    const c = companyOf(s, 'a'); const p = c.products[0];
    expect(terrainMultiplier(s, c, p, 'perceivedPrice')).toBe(1);
    expect(terrainSalvageRate(s, p, c)).toBe(0.5);
    expect(marketInputs(s, c, p, 'a', 0).priceMultiplier).toBeUndefined();
  });

  it('resolves identically from the same seed with the new levers active', () => {
    const play = () => {
      const s = createGame({ ...config(99, 6), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'ile-aux-niches', b: 'monts-defiscalises' } }, [human('a', 'gadgets'), human('b', 'yogurts')]);
      while (s.phase === 'playing') resolveTurn(s);
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });
});
