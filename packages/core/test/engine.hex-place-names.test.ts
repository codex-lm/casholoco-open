import { describe, expect, it } from 'vitest';
import { getContent, hexPlaceName } from '../src/content';
import { applyAction, createGame, resolveTurn } from '../src/engine';
import { freeBuildableHexes } from '../src/sim/hexes';
import type { Action, Article, GameState, Lang } from '../src/types';
import { bots, companyOf, config, human } from './helpers';

function game(lang: Lang): GameState {
  const s = createGame({ ...config(42, 8), lang, mapMode: 'hex', terrainAssignment: 'host',
    terrains: { a: 'quai-port-dividende', bot1: 'faubourgs-croissance' } },
  [human('a', 'crypto'), ...bots(1)]);
  delete s.hexBids;
  delete s.siteBids;
  s.activeEffects = [];
  for (const c of Object.values(s.companies)) {
    c.cash = 1e6; c.inventory = {}; c.sites = [];
    for (const p of c.products) { p.production = 0; p.marketing = 0; p.rnd = 0; p.stock = 0; }
  }
  return s;
}

function ok(s: GameState, playerId: string, action: Action): void {
  const result = applyAction(s, playerId, action);
  expect(result.ok, result.message).toBe(true);
}

function move(s: GameState, playerId: string, hexId: string, bid: number): void {
  const c = companyOf(s, playerId);
  ok(s, playerId, { type: 'moveFactory', companyId: c.id, productId: c.products[0].id, hexId, bid });
}

function lastIssueArticles(s: GameState): Article[] {
  return s.journal.at(-1)!.articles;
}

describe('hex place names in engine texts', () => {
  it.each(['fr', 'en'] as const)('land quote and auction article name the awarded cell, never « Case X » (%s)', (lang) => {
    const personalityId = 'tweetard';
    const pool = getContent(lang).bots.find((b) => b.id === personalityId)!.landQuotes!;
    const original = pool.lostToHuman;
    pool.lostToHuman = ['{hex}'];
    try {
      const s = game(lang);
      const target = freeBuildableHexes(s)[0];
      const place = hexPlaceName(target, lang, s.siteSlots);
      expect(place).not.toBe(target);

      move(s, 'bot1', target, 777);
      move(s, 'a', target, 2345);
      resolveTurn(s);

      const articles = lastIssueArticles(s);
      const quote = articles.find((a) => a.kind === 'quote');
      expect(quote).toBeDefined();
      expect(quote!.title).toBe(place);

      const award = s.hexAuctionResults!.find((a) => a.hexId === target && !a.fallback);
      expect(award).toBeDefined();
      const results = articles.filter((a) => a.kind === 'results');
      const auction = results.find((a) => (a.title + a.body).includes(place));
      expect(auction).toBeDefined();

      for (const text of [quote!.title + quote!.body, auction!.title + auction!.body]) {
        expect(text).not.toContain(target);
        expect(text).not.toMatch(lang === 'fr' ? /[Cc]ase [A-Z]\d/ : /[Cc]ell [A-Z]\d/);
      }
    } finally {
      pool.lostToHuman = original;
    }
  });
});
