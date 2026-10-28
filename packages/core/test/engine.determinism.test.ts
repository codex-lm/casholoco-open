import { describe, expect, it } from 'vitest';
import { applyAction, resolveTurn } from '../src/engine';
import type { Action, GameState } from '../src/types';
import { bots, human, newGame, npcCompanies, snapshot } from './helpers';

/** Script d'actions humaines, fonction du tour et de l'état (identique d'une partie à l'autre). */
function humanScript(state: GameState): void {
  // The script keeps its deterministic inputs even if its fixed-price firm fails.
  const me = Object.values(state.companies).find((c) => c.founderId === 'h1'
    && c.status === 'active' && c.controllerId === 'h1');
  if (!me) return;
  const npc = npcCompanies(state)[0];
  const product = me.products[0];
  const actions: Action[] = [];
  if (product) {
    actions.push({ type: 'setProductDecisions', companyId: me.id, productId: product.id, price: 105 + state.turn, production: product.capacity, marketing: 400, rnd: 300 });
    if (state.turn % 3 === 0) actions.push({ type: 'expandCapacity', companyId: me.id, productId: product.id, lots: 5 });
  }
  actions.push({ type: 'buyCommodity', companyId: me.id, commodityId: 'sugar', lots: 20 });
  if (npc) actions.push({ type: 'buyShares', companyId: npc.id, shares: 50 });
  if (state.turn === 3) actions.push({ type: 'ceoBonus', companyId: me.id, amount: 200 });
  if (state.turn === 4) actions.push({ type: 'shady', companyId: me.id, kind: 'greenwashing' });
  if (state.turn === 5) actions.push({ type: 'takePersonalLoan', amount: 500 });
  if (state.turn === 6) actions.push({ type: 'payDividend', companyId: me.id, amount: 300 });
  for (const a of actions) applyAction(state, 'h1', a);
}

function playScripted(seed: number, roundTripEveryTurn = false): string {
  let state = newGame(seed, [human('h1'), human('h2', 'gadgets'), ...bots(4)], 10);
  while (state.phase === 'playing') {
    humanScript(state);
    if (roundTripEveryTurn) state = JSON.parse(JSON.stringify(state)) as GameState;
    resolveTurn(state);
  }
  return snapshot(state);
}

describe('déterminisme', () => {
  it('même graine + mêmes actions → même état JSON', () => {
    expect(playScripted(42)).toBe(playScripted(42));
  });

  it('création identique pour une même graine', () => {
    const a = newGame(7, [human('h1'), ...bots(3)]);
    const b = newGame(7, [human('h1'), ...bots(3)]);
    expect(snapshot(a)).toBe(snapshot(b));
  });

  it('des graines différentes donnent des parties différentes', () => {
    expect(playScripted(1)).not.toBe(playScripted(2));
  });

  it("l'état est du JSON pur : un aller-retour JSON à chaque tour ne change rien", () => {
    expect(playScripted(9, true)).toBe(playScripted(9, false));
  });

  it('le moteur ne dépend ni de Math.random ni de Date.now', () => {
    const random = Math.random;
    const now = Date.now;
    Math.random = () => {
      throw new Error('Math.random interdit');
    };
    Date.now = () => {
      throw new Error('Date.now interdit');
    };
    try {
      expect(() => playScripted(3)).not.toThrow();
    } finally {
      Math.random = random;
      Date.now = now;
    }
  });
});
