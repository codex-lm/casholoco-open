import { describe, expect, it } from 'vitest';
import { applyAction, createGame, resolveTurn } from '../src/engine';
import { getContent } from '../src/content';
import { realizeHexLaunch } from '../src/sim/actions';
import { awardHexes, hexReservePrice } from '../src/sim/hexAuctions';
import { freeBuildableHexes } from '../src/sim/hexes';
import { resolveTurnWithLog } from '../src/sim/resolve';
import { fillTemplate } from '../src/sim/util';
import type { GameState, Lang } from '../src/types';
import { companyOf, config, human } from './helpers';

function fixture(lang: Lang, domicile: boolean) {
  const state = createGame({ ...config(813, 8), mapMode: 'hex', lang,
    terrainAssignment: 'host', terrains: { a: 'monts-defiscalises' } }, [human('a', 'gadgets')]);
  const company = companyOf(state, 'a');
  if (!domicile) delete company.terrainId;
  state.activeEffects = [];
  for (const c of Object.values(state.companies)) {
    c.cash = 1e6;
    for (const p of c.products) { p.production = 0; p.marketing = 0; p.rnd = 0; p.stock = 0; }
  }
  return { state, company };
}

function bid(state: GameState) {
  const company = companyOf(state, 'a'), hexId = freeBuildableHexes(state)[0];
  const result = applyAction(state, 'a', { type: 'launchProduct', companyId: company.id,
    sectorId: 'energy_drinks', name: 'Awarded launch', hexId, bid: hexReservePrice(hexId), fallback: 'abandon' });
  expect(result.ok, result.message).toBe(true);
}

describe('hex launch announcements at resolution', () => {
  it('settlement creates the product without changing a journal issue', () => {
    const { state, company } = fixture('fr', true);
    bid(state);
    const before = structuredClone(state.journal), rng = state.rngState;
    awardHexes(state, realizeHexLaunch);
    expect(company.products.at(-1)!.name).toBe('Awarded launch');
    expect(state.journal).toEqual(before);
    expect(state.rngState).toBe(rng);
  });

  for (const lang of ['fr', 'en'] as const) for (const domicile of [false, true]) {
    it(`publishes the ${domicile ? 'domicile story' : 'launch flash'} in the new issue (${lang})`, () => {
      const { state, company } = fixture(lang, domicile);
      bid(state);
      const previous = structuredClone(state.journal.at(-1)!);
      resolveTurn(state);
      expect(state.journal[0]).toEqual(previous);
      expect(state.journal.at(-1)!.turn).toBe(2);
      const launched = company.products.at(-1)!;
      const articles = state.journal.at(-1)!.articles.filter((a) => a.event?.type === 'productLaunch');
      expect(articles).toHaveLength(1);
      expect(articles[0]).toMatchObject({ kind: 'flash', companyIds: [company.id],
        event: { type: 'productLaunch', actorId: 'a', productId: launched.id } });
      expect(articles[0].title + articles[0].body).toContain(launched.name);
      const local = getContent(lang).terrains.settlements.find((a) => a.id === 'settle-monts-defiscalises-2')!;
      expect(/5\s?%/.test(articles[0].body)).toBe(domicile);
      if (domicile) expect(articles[0].body).toBe(fillTemplate(local.body,
        { company: company.name, product: launched.name, ceo: company.ceoName }, lang));
    });

    it(`publishes the ${domicile ? 'domicile story' : 'launch flash'} in the final issue (${lang})`, () => {
      const { state, company } = fixture(lang, domicile);
      bid(state);
      // Close a shortened game with an already queued, valid project; new final-turn bids are prohibited.
      state.config.totalTurns = state.turn;
      const before = state.journal.at(-1)!.articles.map((a) => a.id);
      resolveTurn(state);
      expect(state.phase).toBe('finished');
      expect(state.journal).toHaveLength(1);
      const additions = state.journal.at(-1)!.articles.filter((a) => !before.includes(a.id));
      const articles = additions.filter((a) => a.event?.type === 'productLaunch');
      expect(articles).toHaveLength(1);
      expect(articles[0].event?.productId).toBe(company.products.at(-1)!.id);
      expect(/5\s?%/.test(articles[0].body)).toBe(domicile);
    });
  }

  for (const lang of ['fr', 'en'] as const) {
    it(`uses the plain launch flash when the terrain plant moves at the same close (${lang})`, () => {
      const { state, company } = fixture(lang, true);
      const plant = company.products[0];
      const moveHexId = freeBuildableHexes(state)[1];
      const move = applyAction(state, 'a', { type: 'moveFactory', companyId: company.id,
        productId: plant.id, hexId: moveHexId, bid: hexReservePrice(moveHexId) });
      expect(move.ok, move.message).toBe(true);
      bid(state);
      const log = resolveTurnWithLog(state)!;
      expect(log.hexAwards).toHaveLength(2);
      expect(plant.hexId).toBe(moveHexId);
      expect(plant.terrainId).toBeUndefined();
      expect(company.terrainId).toBeUndefined();
      const launched = company.products.at(-1)!;
      expect(launched.name).toBe('Awarded launch');
      const articles = state.journal.at(-1)!.articles.filter((a) => a.event?.type === 'productLaunch');
      expect(articles).toHaveLength(1);
      expect(articles[0]).toMatchObject({ kind: 'flash', tone: 'good', companyIds: [company.id],
        event: { type: 'productLaunch', actorId: 'a', productId: launched.id } });
      expect(/5\s?%/.test(articles[0].body)).toBe(false);
      expect(log.hexLaunchArticles).toEqual(articles);
    });
  }

  it('carries the captured announcement in the TurnLog', () => {
    const { state } = fixture('en', true);
    bid(state);
    const log = resolveTurnWithLog(state)!;
    expect(log.hexLaunchArticles).toHaveLength(1);
    expect(state.journal.at(-1)!.articles).toContainEqual(log.hexLaunchArticles![0]);
  });
});
