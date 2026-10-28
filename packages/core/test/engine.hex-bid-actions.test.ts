import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { getContent, hexPlaceName } from '../src/content';
import { realizeHexLaunch } from '../src/sim/actions';
import { freeBuildableHexes } from '../src/sim/hexes';
import { awardHexes, hexReservePrice } from '../src/sim/hexAuctions';
import { tr } from '../src/sim/i18n';
import type { Action, GameState, HexBid } from '../src/types';
import { companyOf, config, human } from './helpers';

function game(lang: 'fr' | 'en' = 'fr'): GameState {
  const state = createGame({ ...config(42, 8), mapMode: 'hex', terrainAssignment: 'host',
    terrains: { a: 'quai-port-dividende', b: 'faubourgs-croissance' }, lang },
  [human('a', 'crypto'), human('b', 'gadgets')]);
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

function ok(state: GameState, who: string, action: Action) {
  const result = applyAction(state, who, action);
  expect(result.ok, result.message).toBe(true);
  return result;
}

function extraProduct(state: GameState, incubator = false) {
  const company = companyOf(state, 'a');
  const product = { ...company.products[0], id: 'extra-plant', terrainId: undefined,
    hexId: incubator ? undefined : freeBuildableHexes(state)[0], incubator };
  company.products.push(product);
  return product;
}

describe('discontinued products release pending hex bids', () => {
  it.each(['move', 'startup'] as const)('removes every unresolved %s bid, preserving other projects and settled results', (kind) => {
    const state = game(), company = companyOf(state, 'a');
    const product = extraProduct(state, kind === 'startup');
    const [target, other] = freeBuildableHexes(state);
    ok(state, 'a', { type: 'moveFactory', companyId: company.id, productId: product.id,
      hexId: target, bid: 5000, fallback: 'abandon' });
    const bid = state.hexBids![0];
    const settled: HexBid = { ...bid, result: { outcome: 'lost', price: 0, bidders: 2 } };
    const project: HexBid = { kind: 'launch', companyId: company.id, playerId: 'a',
      hexId: other, amount: 5000, turn: state.turn, fallback: 'abandon',
      project: { id: 'remaining-project', name: 'Still planned', sectorId: 'gadgets' } };
    state.hexBids!.push({ ...bid, playerId: 'previous-controller', turn: state.turn - 1 }, settled, project);

    ok(state, 'a', { type: 'discontinueProduct', companyId: company.id, productId: product.id });

    expect(company.products.some((p) => p.id === product.id)).toBe(false);
    expect(state.hexBids).toEqual([settled, project]);
    expect(getPlayerView(state, 'a').self!.hexBids!.some((b) => b.productId === product.id && !b.result)).toBe(false);
    ok(state, 'a', { type: 'moveFactory', companyId: company.id,
      productId: company.products[0].id, hexId: target, bid: 5000 });
  });

  it('deletes the empty bids field, permits a new project on that cell and publishes a clean lone rival award', () => {
    const state = game(), company = companyOf(state, 'a'), rival = companyOf(state, 'b');
    const product = extraProduct(state), target = freeBuildableHexes(state)[0];
    ok(state, 'a', { type: 'moveFactory', companyId: company.id, productId: product.id, hexId: target, bid: 5000 });
    ok(state, 'a', { type: 'discontinueProduct', companyId: company.id, productId: product.id });
    expect(Object.hasOwn(state, 'hexBids')).toBe(false);
    expect(getPlayerView(state, 'a').self!.hexBids ?? []).toEqual([]);

    ok(state, 'a', { type: 'launchProduct', companyId: company.id, sectorId: 'gadgets',
      name: 'Released target', hexId: target, bid: 5000, fallback: 'abandon' });
    ok(state, 'a', { type: 'cancelHexBid', companyId: company.id, projectId: state.hexBids![0].project!.id });
    ok(state, 'b', { type: 'moveFactory', companyId: rival.id, productId: rival.products[0].id,
      hexId: target, bid: hexReservePrice(target) });

    const awards = awardHexes(state, realizeHexLaunch);
    expect(awards).toEqual([expect.objectContaining({ companyId: rival.id, hexId: target, bidders: 1 })]);
    expect(awards[0].failedContenders).toBeUndefined();
    expect(getPlayerView(state, 'a').hexes!.results[0].failedContenders).toBeUndefined();
  });

  it.each(['move', 'startup'] as const)('ignores a stale %s bid whose product no longer exists in the duplicate check', (kind) => {
    const state = game(), company = companyOf(state, 'a'), target = freeBuildableHexes(state)[0];
    state.hexBids = [{ kind, companyId: company.id, playerId: 'a', productId: 'deleted-product',
      hexId: target, amount: 5000, turn: state.turn, fallback: 'abandon' }];

    ok(state, 'a', { type: 'moveFactory', companyId: company.id, productId: company.products[0].id,
      hexId: target, bid: 5000 });
    ok(state, 'a', { type: 'cancelHexBid', companyId: company.id, productId: company.products[0].id });
    ok(state, 'a', { type: 'launchProduct', companyId: company.id, sectorId: 'gadgets',
      name: 'Backstop project', hexId: target, bid: 5000, fallback: 'abandon' });
  });

  it('still rejects a duplicate from a real launch project before any mutation', () => {
    const state = game(), company = companyOf(state, 'a'), target = freeBuildableHexes(state)[0];
    ok(state, 'a', { type: 'launchProduct', companyId: company.id, sectorId: 'gadgets',
      name: 'Real project', hexId: target, bid: 5000, fallback: 'abandon' });
    const before = JSON.stringify(state);
    const result = applyAction(state, 'a', { type: 'moveFactory', companyId: company.id,
      productId: company.products[0].id, hexId: target, bid: 5000 });
    expect(result).toEqual({ ok: false, message: tr(state).act.hexBidDuplicate });
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('sealed hex bid confirmations', () => {
  it.each(['fr', 'en'] as const)('uses the dedicated launch and move quips without paying or launching (%s)', (lang) => {
    const state = game(lang), company = companyOf(state, 'a'), product = company.products[0];
    const [launchCell, moveCell] = freeBuildableHexes(state);
    const cash = company.cash, origin = product.hexId, rng = state.rngState;
    const result = ok(state, 'a', { type: 'launchProduct', companyId: company.id, sectorId: 'gadgets',
      name: 'Future product', hexId: launchCell, bid: 5000, fallback: 'abandon' });
    expect(getContent(lang).actionQuips.hexLaunchBid.some((quip) => result.message.startsWith(`${quip} `))).toBe(true);
    expect(result.message).toContain(tr(state).act.hexLaunchPlanned('Future product', hexPlaceName(launchCell, lang, state.siteSlots), 5000));
    const moved = ok(state, 'a', { type: 'moveFactory', companyId: company.id, productId: product.id,
      hexId: moveCell, bid: 5000 });
    expect(getContent(lang).actionQuips.hexMoveBid.some((quip) => moved.message.startsWith(`${quip} `))).toBe(true);
    expect(moved.message).toContain(tr(state).act.hexMovePlanned(product.name, hexPlaceName(moveCell, lang, state.siteSlots), 5000));
    expect(company.products).toHaveLength(1);
    expect(company.cash).toBe(cash);
    expect(product.hexId).toBe(origin);
    expect(product.pendingHexId).toBeUndefined();
    expect(state.rngState).toBe(rng);
  });

  it.each(['fr', 'en'] as const)('describes both startup re-bid fallback choices and the incubator (%s)', (lang) => {
    const state = game(lang), previous = companyOf(state, 'a'), rival = companyOf(state, 'b');
    previous.status = 'bankrupt';
    previous.controllerId = null;
    previous.products = [];
    state.players.a.cash = 1e6;
    state.turn = 2;
    const target = freeBuildableHexes(state)[0];
    ok(state, 'a', { type: 'foundStartup', sectorId: 'crypto', name: 'Comeback', investment: 30_000,
      hexId: target, bid: hexReservePrice(target), fallback: 'abandon' });
    ok(state, 'b', { type: 'moveFactory', companyId: rival.id, productId: rival.products[0].id,
      hexId: target, bid: 5000 });
    resolveTurn(state);
    const startup = companyOf(state, 'a'), product = startup.products[0];
    expect(product.incubator).toBe(true);
    expect(product.hexId).toBeUndefined();
    const cell = freeBuildableHexes(state)[0], cash = startup.cash, rng = state.rngState;
    const base = lang === 'fr'
      ? `Start-up ${product.name} : jusqu’à ${tr(state).money(5000)} pour ${hexPlaceName(cell, lang, state.siteSlots)}, sous pli fermé. Elle vend depuis l’incubateur de la capitale ce trimestre ; le terrain ne se paie qu’à l’adjudication. `
      : `Startup ${product.name}: up to ${tr(state).money(5000)} for ${hexPlaceName(cell, lang, state.siteSlots)}, sealed. It sells from the capital’s incubator this quarter; the land is paid only at the award. `;
    const endings = lang === 'fr'
      ? { nearest: 'Si la case lui échappe : la case libre la plus proche.', abandon: 'Si la case lui échappe, elle reste à l’incubateur et pourra miser de nouveau ; au bout de deux trimestres, elle prend d’office la case libre la plus proche.' }
      : { nearest: 'If it loses the cell: the nearest free cell.', abandon: 'If it loses the cell, it stays in the incubator and can bid again; after two quarters it gets moved to the nearest free cell, like it or not.' };
    for (const fallback of ['nearest', 'abandon'] as const) {
      const result = ok(state, 'a', { type: 'moveFactory', companyId: startup.id, productId: product.id,
        hexId: cell, bid: 5000, fallback });
      expect(getContent(lang).actionQuips.hexStartupBid.some((quip) => result.message.startsWith(`${quip} `))).toBe(true);
      expect(result.message).toContain(base + endings[fallback]);
      expect(state.hexBids!.filter((b) => !b.result && b.productId === product.id)).toEqual([
        expect.objectContaining({ kind: 'startup', fallback }),
      ]);
    }
    expect(startup.cash).toBe(cash);
    expect(product.incubator).toBe(true);
    expect(product.hexId).toBeUndefined();
    expect(state.rngState).toBe(rng);
  });
});
