import { describe, expect, it } from 'vitest';
import { applyAction, createGame, resolveTurn } from '../src/engine';
import { getContent } from '../src/content';
import { freeBuildableHexes } from '../src/sim/hexes';
import { hexReservePrice } from '../src/sim/hexAuctions';
import { terrainPlantMultiplier } from '../src/sim/terrains';
import { fillTemplate } from '../src/sim/util';
import type { GameState, Lang } from '../src/types';
import { companyOf, config, human } from './helpers';

function game(lang: Lang = 'fr'): GameState {
  const state = createGame({ ...config(42, 12), mapMode: 'hex', terrainAssignment: 'host',
    terrains: { a: 'quai-port-dividende', b: 'faubourgs-croissance',
      c: 'front-de-mer-saint-benefice', d: 'portes-petit-rabais' }, lang },
  [human('a', 'crypto'), human('b', 'gadgets'), human('c', 'yogurts'), human('d', 'scooters')]);
  state.activeEffects = [];
  for (const company of Object.values(state.companies)) {
    company.cash = 1e6;
    company.inventory = {};
    company.sites = [];
    for (const product of company.products) {
      product.production = 0;
      product.marketing = 0;
      product.rnd = 0;
      product.stock = 0;
    }
  }
  return state;
}

function launch(state: GameState, who: string, hexId: string, amount = hexReservePrice(hexId), fallback: 'nearest' | 'abandon' = 'abandon') {
  const result = applyAction(state, who, { type: 'launchProduct', companyId: companyOf(state, who).id,
    sectorId: 'energy_drinks', name: 'Late Launch', hexId, bid: amount, fallback });
  expect(result.ok, result.message).toBe(true);
}

describe('bankruptcy cells wait for the next quarter auctions', () => {
  it('keeps A10 out of the B9 loser fallback, then opens it to bids next quarter', () => {
    const state = game(), failed = companyOf(state, 'a'), winner = companyOf(state, 'b'), loser = companyOf(state, 'c');
    expect(failed.products[0].hexId).toBe('A10');
    expect(freeBuildableHexes(state)).toContain('B9');
    launch(state, 'b', 'B9', 2000);
    launch(state, 'c', 'B9', 1000, 'nearest');
    const beforeRefusal = JSON.stringify(state);
    expect(applyAction(state, 'd', { type: 'launchProduct', companyId: companyOf(state, 'd').id,
      sectorId: 'energy_drinks', name: 'Capital launch', hexId: 'A10', bid: 5000, fallback: 'abandon' }).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(beforeRefusal);
    failed.cash = 0;

    resolveTurn(state);

    expect(failed.status).toBe('bankrupt');
    expect(state.hexAuctionResults).toContainEqual(expect.objectContaining({
      hexId: 'B9', companyId: winner.id, price: 1000, bidders: 2, fallback: false,
    }));
    const fallback = state.hexAuctionResults!.find((award) => award.companyId === loser.id)!;
    expect(fallback).toMatchObject({ fallback: true, bidders: 0 });
    expect(fallback.hexId).not.toBe('A10');
    expect(loser.products.at(-1)!.hexId).toBe(fallback.hexId);
    expect(state.hexAuctionResults!.some((award) => award.hexId === 'A10')).toBe(false);
    expect(freeBuildableHexes(state)).toContain('A10');

    const nextWinner = companyOf(state, 'd');
    launch(state, 'd', 'A10', 5000);
    resolveTurn(state);
    expect(state.hexAuctionResults).toContainEqual(expect.objectContaining({
      hexId: 'A10', companyId: nextWinner.id, price: hexReservePrice('A10'), bidders: 1, fallback: false,
    }));
    expect(nextWinner.products.at(-1)!.hexId).toBe('A10');
    expect(nextWinner.products.at(-1)!.terrainId).toBeUndefined();
  });
});

describe('domicile announcements use the publication quarter', () => {
  for (const lang of ['fr', 'en'] as const) {
    it.each([7, 8])(`announces Petit-Rabais only while its grant lasts in the new issue (${lang}, close %i)`, (turn) => {
      const state = game(lang), company = companyOf(state, 'd'), startingPlant = company.products[0];
      state.turn = turn;
      expect(terrainPlantMultiplier(state, startingPlant, 'labor')).toBe(0.8);
      launch(state, 'd', freeBuildableHexes(state)[0]);

      resolveTurn(state);

      expect(state.journal.at(-1)!.turn).toBe(turn + 1);
      const articles = state.journal.at(-1)!.articles.filter((article) => article.event?.type === 'productLaunch');
      expect(articles).toHaveLength(1);
      const local = getContent(lang).terrains.settlements.find((article) => article.id === 'settle-portes-petit-rabais-2')!;
      const localBody = fillTemplate(local.body, { company: company.name, ceo: company.ceoName, product: 'Late Launch' }, lang);
      if (turn === 7) expect(articles[0].body).toBe(localBody);
      else {
        expect(articles[0].body).not.toBe(localBody);
        expect(terrainPlantMultiplier(state, startingPlant, 'labor')).toBe(1);
      }
    });

    it.each([1, 2])(`counts down a Petit-Rabais suspension before choosing the new issue story (${lang}, %i left)`, (turnsLeft) => {
      const state = game(lang), company = companyOf(state, 'd'), startingPlant = company.products[0];
      state.turn = 2;
      state.activeEffects = [{ id: 'expiring-suspension', newsId: 'test-suspension', kind: 'terrain',
        terrain: 'portes-petit-rabais', lever: 'labor', value: 1, suspend: true, turnsLeft }];
      expect(terrainPlantMultiplier(state, startingPlant, 'labor')).toBe(1);
      launch(state, 'd', freeBuildableHexes(state)[0]);

      resolveTurn(state);

      expect(state.journal.at(-1)!.turn).toBe(3);
      const articles = state.journal.at(-1)!.articles.filter((article) => article.event?.type === 'productLaunch');
      expect(articles).toHaveLength(1);
      const local = getContent(lang).terrains.settlements.find((article) => article.id === 'settle-portes-petit-rabais-2')!;
      const localBody = fillTemplate(local.body, { company: company.name, ceo: company.ceoName, product: 'Late Launch' }, lang);
      if (turnsLeft === 1) {
        expect(state.activeEffects.some((effect) => effect.id === 'expiring-suspension')).toBe(false);
        expect(articles[0].body).toBe(localBody);
      } else {
        expect(state.activeEffects.find((effect) => effect.id === 'expiring-suspension')!.turnsLeft).toBe(1);
        expect(articles[0].body).not.toBe(localBody);
      }
    });
  }
});
