import { afterEach, describe, expect, it } from 'vitest';
import { competent } from '../../../tools/balance-lab/strategies/tiers';
import { operator } from '../../../tools/balance-lab/strategies/archetypes';
import { makeOptimizer } from '../../../tools/balance-lab/strategies/optimizer';
import type { Strategy } from '../../../tools/balance-lab/harness';
import { SECTORS } from '../src/content';
import { applyAction, createGame, getPlayerView } from '../src/engine';
import type { Action, SectorDef } from '../src/types';
import { companyOf, config, human } from './helpers';

const original = { ...SECTORS.gadgets };
afterEach(() => {
  for (const key of Object.keys(SECTORS.gadgets) as (keyof SectorDef)[]) if (!(key in original)) delete SECTORS.gadgets[key];
  Object.assign(SECTORS.gadgets, original);
});

const strategies = [competent, operator, makeOptimizer('sector-regression', { launchHurdle: 1e9, capHurdle: 1e9 })];

function decisions(strategy: Strategy) {
  const s = createGame(config(91, 8), [human('a', 'gadgets')]);
  const c = companyOf(s, 'a');
  s.companies = { [c.id]: c };
  s.activeEffects = [];
  s.turn = 4;
  c.cash = 20_000;
  c.modifiers = [];
  c.reputation = 1;
  const p = c.products[0];
  Object.assign(p, { quality: 2, brand: 2, price: SECTORS.gadgets.refPrice,
    marketing: 450, rnd: 300, capacity: 1000, production: 0, stock: 0, pendingCapacity: 0 });
  const actions: Action[] = [];
  const api = { view: () => getPlayerView(s, 'a'), act: (action: Action) => { actions.push(action); return applyAction(s, 'a', action); } };
  strategy.act(api.view(), api, { rng: () => 0.5, memory: {}, seat: 0, seed: 91 });
  const decision = actions.find((a) => a.type === 'setProductDecisions' && a.productId === p.id);
  expect(decision).toBeDefined();
  return decision!;
}

describe('balance-lab strategies follow sector rules', () => {
  it.each(strategies)('$name can restart an installed idle target when planning its own supply', (strategy) => {
    const decision = decisions(strategy);
    if (decision.type !== 'setProductDecisions') throw new Error('Missing product decisions');
    expect(decision.production).toBeGreaterThan(0);
  });

  it.each(strategies)('$name searches a lower price when its own product elasticity increases', (strategy) => {
    Object.assign(SECTORS.gadgets, { elasticity: 2, marketElasticity: 0.8, brandPersistence: 0.75,
      marketingMultiplier: 1, rndMultiplier: 1, qualityDecay: 0.99 });
    const loyal = decisions(strategy);
    SECTORS.gadgets.elasticity = 6.5;
    const sensitive = decisions(strategy);
    expect(sensitive.type).toBe('setProductDecisions');
    if (loyal.type !== 'setProductDecisions' || sensitive.type !== 'setProductDecisions') throw new Error('Missing product decisions');
    expect(sensitive.price!).toBeLessThan(loyal.price!);
    expect(sensitive.price!).toBeGreaterThanOrEqual(0.3 * SECTORS.gadgets.refPrice);
    expect(loyal.price!).toBeLessThanOrEqual(3 * SECTORS.gadgets.refPrice + 1e-6);
  });

  it.each(strategies)('$name reacts to sector-specific brand persistence and quality obsolescence', (strategy) => {
    Object.assign(SECTORS.gadgets, { elasticity: 4.5, marketElasticity: 0.8, brandPersistence: 0.75,
      marketingMultiplier: 1, rndMultiplier: 1, qualityDecay: 0.99 });
    const steady = decisions(strategy);
    Object.assign(SECTORS.gadgets, { brandPersistence: 0.4, marketingMultiplier: 2,
      rndMultiplier: 2, qualityDecay: 0.5 });
    expect(decisions(strategy)).not.toEqual(steady);
  });
});
