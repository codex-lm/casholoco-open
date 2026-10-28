import { describe, expect, it } from 'vitest';
import { getContent, hexPlaceName } from '../src/content';
import { applyAction, createGame, resolveTurn } from '../src/engine';
import { freeBuildableHexes } from '../src/sim/hexes';
import { hexReservePrice } from '../src/sim/hexAuctions';
import { tr } from '../src/sim/i18n';
import { startTurn } from '../src/sim/turn';
import { fillTemplate } from '../src/sim/util';
import type { Action, Article, GameState, HexAuctionResult, HexBid, LandSituation, Lang } from '../src/types';
import { bots, companyOf, config, human } from './helpers';

function game(seed = 42, lang: Lang = 'fr', nBots = 1, mapMode: 'hex' | 'classic' = 'hex', secondHuman = false): GameState {
  const s = createGame({ ...config(seed, 8), lang,
    ...(mapMode === 'hex' ? { mapMode: 'hex' as const, terrainAssignment: 'host' as const,
      terrains: { a: 'quai-port-dividende', bot1: 'faubourgs-croissance',
        ...(secondHuman ? { b: 'portes-petit-rabais' } : {}),
        ...(nBots > 1 ? { bot2: 'front-de-mer-saint-benefice' } : {}) } } : {}) },
  [human('a', 'crypto'), ...(secondHuman ? [human('b', 'yogurts')] : []), ...bots(nBots)]);
  // Isolate the requested envelopes from automatic turn-one bot decisions.
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

function launch(s: GameState, playerId: string, hexId: string, bid: number, fallback: 'nearest' | 'abandon'): void {
  ok(s, playerId, { type: 'launchProduct', companyId: companyOf(s, playerId).id,
    sectorId: 'gadgets', name: 'PRIVATE LAND PROJECT', hexId, bid, fallback });
}

function quote(s: GameState): Article {
  const article = s.journal.at(-1)!.articles.find((a) => a.kind === 'quote');
  expect(article).toBeDefined();
  return article!;
}

function landPool(s: GameState, playerId: string, situation: LandSituation): string[] {
  const personality = getContent(s.config.lang).bots.find((b) => b.id === s.players[playerId].botPersonalityId)!;
  return personality.landQuotes![situation];
}

function expectLandQuote(s: GameState, playerId: string, situation: LandSituation, award: HexAuctionResult): void {
  const c = companyOf(s, playerId);
  const vars = { hex: hexPlaceName(award.hexId, s.config.lang, s.siteSlots), price: tr(s).money(award.price),
    winner: s.companies[award.companyId].name, company: c.name, bidders: String(award.bidders) };
  expect(landPool(s, playerId, situation).map((line) => fillTemplate(line, vars, s.config.lang))).toContain(quote(s).title);
  expect(quote(s)).toMatchObject({ body: tr(s).quoteByline(s.players[playerId].name, c.name), kind: 'quote', tone: 'neutral' });
  expect(quote(s).title).not.toMatch(/\{\w+\}/);
}

function expectGenericQuote(s: GameState, playerId = 'bot1'): void {
  const pers = getContent(s.config.lang).bots.find((b) => b.id === s.players[playerId].botPersonalityId)!;
  expect(pers.quotes).toContain(quote(s).title);
  expect(quote(s).body).toBe(tr(s).quoteByline(s.players[playerId].name, pers.companyName));
}

function withPool(lang: Lang, botId: string, situation: LandSituation, lines: string[], run: () => void): void {
  const pools = getContent(lang).bots.find((b) => b.id === botId)!.landQuotes!;
  const original = pools[situation];
  pools[situation] = lines;
  try { run(); } finally { pools[situation] = original; }
}

function fixtureBid(s: GameState, hexId: string, outcome: NonNullable<HexBid['result']>['outcome'], price = 0): HexBid {
  const c = companyOf(s, 'bot1');
  return { kind: 'launch', playerId: 'bot1', companyId: c.id, hexId, amount: 987_654,
    turn: s.turn - 1, fallback: outcome === 'fallback' ? 'nearest' : 'abandon',
    project: { id: `project-${hexId}`, sectorId: 'gadgets', name: 'PRIVATE LAND PROJECT' },
    result: { outcome, hexId: outcome === 'won' || outcome === 'fallback' ? hexId : undefined, price, bidders: 2 } };
}

function fixtureAward(s: GameState, playerId: string, hexId: string, price = hexReservePrice(hexId), fallback = false): HexAuctionResult {
  return { playerId, companyId: companyOf(s, playerId).id, hexId, kind: 'launch', price,
    reserve: hexReservePrice(hexId), fallback, bidders: fallback ? 0 : 2 };
}

describe('hex auction bot quotes', () => {
  it.each(['fr', 'en'] as const)('quotes tweetard after losing a real sealed bid to a human, without private amounts (%s)', (lang) => {
    withPool(lang, 'tweetard', 'lostToHuman', ['{hex}|{price}|{winner}|{company}|{bidders}'], () => {
      const s = game(42, lang, 1, 'hex', true), target = freeBuildableHexes(s)[0];
      move(s, 'bot1', target, 777);
      move(s, 'b', target, 1500);
      move(s, 'a', target, 2345);
      resolveTurn(s);
      const award = s.hexAuctionResults!.find((a) => a.hexId === target && !a.fallback)!;
      expect(award).toMatchObject({ playerId: 'a', price: 1500, bidders: 3 });
      expect(s.hexBids!.find((b) => b.playerId === 'bot1')!.result!.outcome).toBe('lost');
      expectLandQuote(s, 'bot1', 'lostToHuman', award);
      expect(quote(s).title).toBe(`${hexPlaceName(target, lang, s.siteSlots)}|${tr(s).money(1500)}|${companyOf(s, 'a').name}|${companyOf(s, 'bot1').name}|3`);
      const text = quote(s).title + quote(s).body;
      for (const amount of [777, 2345]) {
        expect(text).not.toContain(String(amount));
        expect(text).not.toContain(tr(s).money(amount));
      }
    });
  });

  it('preserves article counts, the speaking bot and the simulation across languages', () => {
    const states = (['fr', 'en'] as const).map((lang) => {
      const s = game(42, lang), target = freeBuildableHexes(s)[0];
      move(s, 'bot1', target, 777); move(s, 'a', target, 2345);
      resolveTurn(s);
      expectLandQuote(s, 'bot1', 'lostToHuman', s.hexAuctionResults!.find((a) => a.hexId === target)!);
      return s;
    });
    expect(states[1].journal.map((j) => j.articles.length)).toEqual(states[0].journal.map((j) => j.articles.length));
    expect(states[1].nextId).toBe(states[0].nextId);
    expect(states[1].rngState).toBe(states[0].rngState);
    expect(states[1].hexAuctionResults).toEqual(states[0].hexAuctionResults);
    expect(states[1].hexBids).toEqual(states[0].hexBids);
  });

  it.each(['fr', 'en'] as const)('uses the won pool for an uncontested win at the public reserve (%s)', (lang) => {
    const s = game(42, lang), target = freeBuildableHexes(s)[0];
    move(s, 'bot1', target, 10_000);
    resolveTurn(s);
    const award = s.hexAuctionResults!.find((a) => a.hexId === target)!;
    expect(award).toMatchObject({ playerId: 'bot1', price: hexReservePrice(target), bidders: 1 });
    expectLandQuote(s, 'bot1', 'won', award);
    expect(quote(s).title).not.toContain('10000');
  });

  it.each([false, true])('classifies overpayment at exactly 1.5 times reserve (at threshold: %s)', (atThreshold) => {
    const s = game(), target = freeBuildableHexes(s)[0];
    const publicPrice = 1.5 * hexReservePrice(target) - (atThreshold ? 0 : 1);
    move(s, 'bot1', target, 5000); move(s, 'a', target, publicPrice);
    resolveTurn(s);
    const award = s.hexAuctionResults!.find((a) => a.hexId === target)!;
    expect(award.price).toBe(publicPrice);
    expectLandQuote(s, 'bot1', atThreshold ? 'overpaid' : 'won', award);
  });

  it.each(['fr', 'en'] as const)('renders the contested target and its public direct award after fallback (%s)', (lang) => {
    withPool(lang, 'tweetard', 'fallback', ['{hex}|{price}|{winner}|{company}|{bidders}'], () => {
      const s = game(42, lang, 1, 'hex', true), target = freeBuildableHexes(s)[0];
      launch(s, 'bot1', target, 777, 'nearest');
      move(s, 'b', target, 1500); move(s, 'a', target, 2345);
      resolveTurn(s);
      const bid = s.hexBids!.find((b) => b.playerId === 'bot1')!;
      const obtained = s.hexAuctionResults!.find((a) => a.fallback && a.playerId === 'bot1')!;
      const award = s.hexAuctionResults!.find((a) => a.hexId === target && !a.fallback)!;
      expect(bid.result).toMatchObject({ outcome: 'fallback', hexId: obtained.hexId, bidders: 3 });
      expect(obtained).toMatchObject({ price: hexReservePrice(obtained.hexId), bidders: 0 });
      expect(obtained.hexId).not.toBe(target);
      expect(award).toMatchObject({ playerId: 'a', price: 1500, bidders: 3 });
      expectLandQuote(s, 'bot1', 'fallback', award);
      expect(quote(s).title).toBe(`${hexPlaceName(target, lang, s.siteSlots)}|${tr(s).money(1500)}|${companyOf(s, 'a').name}|${companyOf(s, 'bot1').name}|3`);
      const text = quote(s).title + quote(s).body;
      expect(text).not.toContain(obtained.hexId);
      expect(text).not.toContain('PRIVATE LAND PROJECT');
      for (const amount of [777, 2345]) {
        expect(text).not.toContain(String(amount));
        expect(text).not.toContain(tr(s).money(amount));
      }
    });
  });

  it.each(['fr', 'en'] as const)('skips a fallback land quote when the contested target has no public direct award (%s)', (lang) => {
    withPool(lang, 'tweetard', 'fallback', ['{hex}|{price}|{winner}|{company}|{bidders}'], () => {
      const s = game(42, lang); s.turn = 2;
      const [target, obtained] = freeBuildableHexes(s);
      const bid = fixtureBid(s, target, 'fallback', hexReservePrice(obtained));
      bid.result!.hexId = obtained;
      s.hexBids = [bid];
      // Obtaining a public fallback cell does not disclose the privately contested target.
      s.hexAuctionResults = [fixtureAward(s, 'bot1', obtained, hexReservePrice(obtained), true)];
      startTurn(s, null);
      expectGenericQuote(s);
      const text = quote(s).title + quote(s).body;
      expect(text).not.toContain(target);
      expect(text).not.toContain('PRIVATE LAND PROJECT');
      expect(text).not.toContain(String(bid.amount));
      expect(text).not.toContain(tr(s).money(bid.amount));
    });
  });

  it('uses the loss pool for an abandoned launch with a public human winner', () => {
    const s = game(), target = freeBuildableHexes(s)[0];
    launch(s, 'bot1', target, 777, 'abandon'); move(s, 'a', target, 2345);
    resolveTurn(s);
    expect(s.hexBids!.find((b) => b.playerId === 'bot1')!.result!.outcome).toBe('abandoned');
    expectLandQuote(s, 'bot1', 'lostToHuman', s.hexAuctionResults!.find((a) => a.hexId === target)!);
  });

  it('keeps the generic draw with no settled bot bid, including a human-only auction', () => {
    for (const humanAuction of [false, true]) {
      const s = game();
      if (humanAuction) move(s, 'a', freeBuildableHexes(s)[0], 2345);
      resolveTurn(s);
      expectGenericQuote(s);
    }
  });

  it('never reads land results in classic mode', () => {
    const s = game(42, 'fr', 1, 'classic'); s.turn = 2;
    s.hexBids = [fixtureBid(s, 'C3', 'won', 400)];
    s.hexAuctionResults = [fixtureAward(s, 'bot1', 'C3', 400)];
    startTurn(s, null);
    expectGenericQuote(s);
  });

  it.each(['failed', 'stale', 'pending', 'no-public-winner'] as const)('does not turn a private or outdated outcome into a land quote (%s)', (condition) => {
    const s = game(); s.turn = 3;
    const target = freeBuildableHexes(s)[0];
    const bid = fixtureBid(s, target, condition === 'failed' ? 'failed' : 'lost');
    s.hexBids = [bid];
    s.hexAuctionResults = [fixtureAward(s, 'a', target)];
    if (condition === 'stale') bid.turn = s.turn - 2;
    if (condition === 'pending') delete bid.result;
    if (condition === 'no-public-winner') s.hexAuctionResults = [];
    startTurn(s, null);
    expectGenericQuote(s);
  });

  it('selects one situation per bot using the full priority order, including a loss to another bot', () => {
    const priority: LandSituation[] = ['lostToHuman', 'overpaid', 'fallback', 'won', 'lostToBot'];
    const pools = getContent('fr').bots.find((b) => b.id === 'tweetard')!.landQuotes!;
    const original = { ...pools };
    for (const situation of priority) pools[situation] = [`LAND:${situation}`];
    try {
      for (let first = 0; first < priority.length; first++) {
        const s = game(42, 'fr', 2); s.turn = 2;
        const cells = freeBuildableHexes(s);
        s.hexBids = []; s.hexAuctionResults = [];
        for (const [i, situation] of priority.slice(first).reverse().entries()) {
          const target = cells[i], fallback = situation === 'fallback';
          const winner = situation === 'lostToHuman' ? 'a' : situation === 'lostToBot' ? 'bot2' : 'bot1';
          const outcome = situation === 'won' || situation === 'overpaid' ? 'won' : fallback ? 'fallback' : 'lost';
          const price = hexReservePrice(target) * (situation === 'overpaid' ? 1.5 : 1);
          const bid = fixtureBid(s, target, outcome, winner === 'bot1' ? price : 0);
          s.hexBids.push(bid);
          if (fallback) {
            const obtained = cells[priority.length + i];
            bid.result!.hexId = obtained;
            bid.result!.price = hexReservePrice(obtained);
            s.hexAuctionResults.push(fixtureAward(s, 'a', target, price),
              fixtureAward(s, 'bot1', obtained, hexReservePrice(obtained), true));
          } else s.hexAuctionResults.push(fixtureAward(s, winner, target, price));
        }
        startTurn(s, null);
        expect(quote(s).title).toBe(`LAND:${priority[first]}`);
        expect(quote(s).body).toBe(tr(s).quoteByline(s.players.bot1.name, companyOf(s, 'bot1').name));
      }
    } finally { Object.assign(pools, original); }
  });

  it('sorts candidate players independently of bid and player insertion order, without consuming RNG', () => {
    const s = game(42, 'fr', 2); s.turn = 2;
    const [first, second] = freeBuildableHexes(s);
    const secondBid = { ...fixtureBid(s, second, 'won', hexReservePrice(second)),
      companyId: companyOf(s, 'bot2').id, playerId: 'bot2' };
    s.hexBids = [secondBid, fixtureBid(s, first, 'won', hexReservePrice(first))];
    s.hexAuctionResults = [fixtureAward(s, 'bot2', second), fixtureAward(s, 'bot1', first)];
    const reordered = structuredClone(s), generic = structuredClone(s);
    reordered.hexBids!.reverse(); reordered.hexAuctionResults!.reverse();
    reordered.players = Object.fromEntries(Object.entries(reordered.players).reverse());
    delete generic.hexBids; delete generic.hexAuctionResults;
    startTurn(s, null); startTurn(reordered, null); startTurn(generic, null);
    expect(quote(reordered)).toEqual(quote(s));
    expect(reordered.rngState).toBe(s.rngState);
    expect(s.rngState).toBe(generic.rngState);
    expect(s.nextId).toBe(generic.nextId);
  });

  it('falls back to the French situation pool when the English one is empty', () => {
    withPool('en', 'tweetard', 'lostToHuman', [], () => {
      const s = game(42, 'en'), target = freeBuildableHexes(s)[0];
      move(s, 'bot1', target, 777); move(s, 'a', target, 2345);
      resolveTurn(s);
      const award = s.hexAuctionResults!.find((a) => a.hexId === target)!;
      const vars = { hex: hexPlaceName(target, 'en', s.siteSlots), price: tr(s).money(award.price), winner: companyOf(s, 'a').name,
        company: companyOf(s, 'bot1').name, bidders: String(award.bidders) };
      const french = getContent('fr').bots.find((b) => b.id === 'tweetard')!.landQuotes!.lostToHuman;
      expect(french.map((line) => fillTemplate(line, vars, 'en'))).toContain(quote(s).title);
      expect(quote(s).body).toBe(tr(s).quoteByline(s.players.bot1.name, companyOf(s, 'bot1').name));
    });
  });
});
