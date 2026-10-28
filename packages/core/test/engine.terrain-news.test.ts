import { describe, expect, it } from 'vitest';
import { NEWS_CARDS, getContent, TERRAINS } from '../src/content';
import { applyAction, createGame, resolveTurn } from '../src/engine';
import type { NewsCard, SectorId } from '../src/types';
import { applyNewsCard, cardHasTarget, drawNews, findCard, localizedCard } from '../src/sim/news';
import { openingTerrainArticles, settlementArticle } from '../src/sim/terrainNews';
import { companyTaxRate, effectiveHeatCredit, terrainPlantMultiplier } from '../src/sim/terrains';
import { effectiveTaxRate } from '../src/sim/finance';
import { startTurn } from '../src/sim/turn';
import { companyOf, config, human, newGame } from './helpers';

function atTerrain(id = 'monts-defiscalises', sector: SectorId = 'gadgets') {
  const state = newGame(813, [human('a', sector), human('b', 'gadgets')]);
  state.config.mapMode = 'hex';
  state.activeEffects = [];
  const company = companyOf(state, 'a'), product = company.products[0];
  company.terrainId = id;
  product.terrainId = id;
  product.hexId = TERRAINS.find((t) => t.id === id)!.hex;
  return { state, company, product };
}
function card(id: string): NewsCard {
  const found = findCard(id);
  if (!found) throw new Error(id);
  return found;
}

function onlyCard(id: string): Set<string> {
  return new Set([...NEWS_CARDS, ...getContent('fr').terrains.newsCards].filter((c) => c.id !== id).map((c) => c.id));
}

describe('terrain local news', () => {
  it('cesse de cibler les Portes après T8, y compris pour une rumeur du trimestre suivant', () => {
    const { state, company, product } = atTerrain('portes-petit-rabais');
    const suspension = card('loc-portes-petit-rabais-1');
    state.turn = 8;
    expect(cardHasTarget(state, suspension, 8)).toBe(true);
    expect(cardHasTarget(state, suspension, 9)).toBe(false);
    applyNewsCard(state, suspension, 'news');
    expect(terrainPlantMultiplier(state, product, 'labor')).toBe(1);
    state.turn = 9;
    expect(terrainPlantMultiplier(state, product, 'labor')).toBe(1);
    for (const local of getContent('fr').terrains.newsCards.filter((c) => c.id.startsWith('loc-portes-petit-rabais-'))) {
      expect(cardHasTarget(state, local)).toBe(false);
    }
    expect(settlementArticle(state, company, product)).toBeUndefined();
    state.scheduledNews = [{ turn: 9, cardId: suspension.id }];
    state.activeEffects = [];
    startTurn(state, null);
    expect(state.activeEffects.some((e) => e.newsId === suspension.id)).toBe(false);
  });

  it('conserve le récit si une nouvelle de demande ou de coûts fixes ne modifie aucun privilège cité', () => {
    const { state, company, product } = atTerrain('quai-port-dividende');
    for (const lever of ['demand', 'fixedCost'] as const) {
      state.activeEffects = [{ id: lever, newsId: lever, kind: 'terrain', terrain: company.terrainId, lever, value: 1.1, turnsLeft: 2 }];
      expect(settlementArticle(state, company, product)).toBeDefined();
    }
    state.activeEffects = [{ id: 'marketing', newsId: 'marketing', kind: 'terrain', terrain: company.terrainId, lever: 'marketing', value: 0.8, turnsLeft: 2 }];
    expect(settlementArticle(state, company, product)).toBeUndefined();
  });

  it('publie le flash ordinaire de lancement après expiration de la dotation des Portes', () => {
    const { state, company } = atTerrain('portes-petit-rabais');
    state.turn = 9; company.cash = 1e6;
    const result = applyAction(state, 'a', { type: 'launchProduct', companyId: company.id, sectorId: 'energy_drinks', name: 'Après la dotation', hexId: 'H5', bid: 400, fallback: 'nearest' });
    expect(result.ok).toBe(true);
    resolveTurn(state);
    const article = state.journal.at(-1)!.articles.find((a) => a.event?.type === 'productLaunch')!;
    expect(article.event?.type).toBe('productLaunch');
    expect(article.body).not.toContain('20 %');
  });
  it('draws only assigned active targets; a zero-production pause preserves eligibility', () => {
    const { state, company, product } = atTerrain();
    const local = card('loc-monts-defiscalises-2');
    product.production = 0;
    expect(drawNews(state, 1, onlyCard(local.id))?.id).toBe(local.id);
    product.hexId = 'A10';
    expect(drawNews(state, 1, onlyCard(local.id))).toBeUndefined();
    product.hexId = 'K8';
    delete product.terrainId;
    expect(cardHasTarget(state, local)).toBe(false);
    product.terrainId = 'monts-defiscalises';
    company.status = 'bankrupt';
    expect(cardHasTarget(state, local)).toBe(false);
  });

  it('does not target lost seat grants after merger while plant news remains eligible', () => {
    const { state, company } = atTerrain();
    expect(cardHasTarget(state, card('loc-monts-defiscalises-1'))).toBe(true);
    delete company.terrainId;
    expect(cardHasTarget(state, card('loc-monts-defiscalises-1'))).toBe(false);
    expect(cardHasTarget(state, card('loc-monts-defiscalises-2'))).toBe(true);
  });

  it('a merged starting plant keeps local targeting under its surviving company', () => {
    const { state, company, product } = atTerrain();
    const absorber = companyOf(state, 'b');
    absorber.products.push(product);
    company.products = [];
    company.status = 'merged';
    delete company.terrainId;
    const local = card('loc-monts-defiscalises-2');
    expect(cardHasTarget(state, local)).toBe(true);
    const article = applyNewsCard(state, local, 'news');
    expect(article.companyIds).toEqual([absorber.id]);
    expect(terrainPlantMultiplier(state, product, 'labor')).toBeCloseTo(0.9 * 1.15);
    expect(cardHasTarget(state, card('loc-monts-defiscalises-1'))).toBe(false);
    absorber.products = absorber.products.filter((p) => p.id !== product.id);
    expect(cardHasTarget(state, local)).toBe(false);
  });

  it('stores a true tax suspension and the company pays its computed ordinary rate', () => {
    const { state, company } = atTerrain();
    expect(companyTaxRate(state, company)).toBe(0.05);
    const article = applyNewsCard(state, card('loc-monts-defiscalises-1'), 'news');
    expect(state.activeEffects).toHaveLength(1);
    expect(state.activeEffects[0]).toMatchObject({ kind: 'terrain', terrain: 'monts-defiscalises', lever: 'tax', suspend: true, turnsLeft: 3 });
    expect(companyTaxRate(state, company)).toBe(effectiveTaxRate(state));
    expect(article.companyIds).toEqual([company.id]);
    expect(article.body).toContain(company.name);
    state.activeEffects[0].turnsLeft = 0;
    expect(companyTaxRate(state, company)).toBe(0.05);
  });

  it('scandal news uses the island multiplier for rises, and does not amplify reductions', () => {
    const { state, company } = atTerrain('ile-aux-niches');
    company.scandal = 10;
    const scandal: NewsCard = { id: 'test-scandal', category: 'scandal', headline: '{company}', body: '{company}', tone: 'bad', weight: 1, effects: [{ type: 'scandal', target: 'all', delta: 10 }] };
    applyNewsCard(state, scandal, 'news');
    expect(company.scandal).toBe(25);
    applyNewsCard(state, { ...scandal, effects: [{ type: 'scandal', target: 'all', delta: -5 }] }, 'news');
    expect(company.scandal).toBe(20);
  });

  it('rechecks a scheduled local card if the target moved after its rumor', () => {
    const { state, product } = atTerrain();
    const local = card('loc-monts-defiscalises-1');
    state.scheduledNews = [{ turn: 2, cardId: local.id }];
    product.hexId = 'A10';
    state.turn = 2;
    startTurn(state, null);
    expect(state.activeEffects.some((e) => e.newsId === local.id)).toBe(false);
    expect(state.journal.at(-1)!.articles.some((a) => a.title === local.headline)).toBe(false);
  });

  it('generates issue-one allocation/editorial and opening notices without RNG consumption', () => {
    const { state, company, product } = atTerrain();
    const rng = state.rngState;
    const articles = openingTerrainArticles(state);
    expect(state.rngState).toBe(rng);
    expect(articles).toHaveLength(3);
    expect(articles[0].title).toBe(getContent('fr').terrains.editorial.headline);
    expect(articles[1].companyIds).toEqual([company.id]);
    expect(articles[2].title).toContain(product.name);
    expect(articles.every((a) => !/\{\w+\}/.test(a.title + a.body))).toBe(true);
    state.turn = 2;
    expect(openingTerrainArticles(state)).toEqual([]);
  });

  it('createGame publishes the opening agency narrative in hex mode', () => {
    const state = createGame({ ...config(552), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'monts-defiscalises' } }, [human('a')]);
    const company = companyOf(state, 'a');
    expect(state.journal[0].articles.some((a) => a.title === getContent('fr').terrains.editorial.headline)).toBe(true);
    expect(state.journal[0].articles.some((a) => a.title === `${company.name} grimpe dans les Monts-Défiscalisés`)).toBe(true);
  });

  it('suppresses settlement during altered local terms, then restores it at expiration', () => {
    const { state, company, product } = atTerrain();
    const launch = { ...product, id: 'new-product', name: 'Nouveau', terrainId: undefined, hexId: 'H5' };
    const announcement = settlementArticle(state, company, launch);
    expect(announcement?.body).toContain('5 %');
    expect(announcement?.event).toMatchObject({ type: 'productLaunch', productId: launch.id });
    applyNewsCard(state, card('loc-monts-defiscalises-1'), 'news');
    expect(settlementArticle(state, company, launch)).toBeUndefined();
    state.activeEffects[0].turnsLeft = 0;
    expect(settlementArticle(state, company, launch)).toBeDefined();
    delete company.terrainId;
    expect(settlementArticle(state, company, launch)).toBeUndefined();
  });

  it('launch actions publish the local settlement, and use the ordinary story while suspended', () => {
    for (const suspended of [false, true]) {
      const { state, company } = atTerrain();
      company.cash = 1e6;
      if (suspended) applyNewsCard(state, card('loc-monts-defiscalises-1'), 'news');
      const before = state.journal.at(-1)!.articles.length;
      const result = applyAction(state, 'a', { type: 'launchProduct', companyId: company.id, sectorId: 'energy_drinks', name: 'Nouvelle Boisson', hexId: 'H5', bid: 400, fallback: 'nearest' });
      expect(result.ok, result.message).toBe(true);
      expect(state.journal.at(-1)!.articles.length).toBe(before);
      resolveTurn(state);
      expect(state.journal[0].articles).toHaveLength(before);
      const additions = state.journal.at(-1)!.articles.filter((a) => a.event?.type === 'productLaunch');
      const launch = company.products.at(-1)!;
      expect(additions).toHaveLength(1);
      expect(additions[0].event).toMatchObject({ type: 'productLaunch', productId: launch.id });
      expect(additions[0].body.includes('5 %')).toBe(!suspended);
      expect(launch.terrainId).toBeUndefined();
    }
  });

  it('draw/application mechanics and target ids stay identical in French and English', () => {
    for (const local of getContent('fr').terrains.newsCards.filter((c) => c.effects[0].type === 'terrain')) {
      const effect = local.effects[0];
      if (effect.type !== 'terrain') continue;
      const { state } = atTerrain(effect.terrain);
      const english = structuredClone(state);
      english.config.lang = 'en';
      const a = applyNewsCard(state, local, 'news');
      const b = applyNewsCard(english, localizedCard(local, 'en'), 'news');
      expect(english.activeEffects, local.id).toEqual(state.activeEffects);
      expect(english.rngState, local.id).toBe(state.rngState);
      expect(b.companyIds, local.id).toEqual(a.companyIds);
      expect(b.body, local.id).not.toBe(a.body);
    }
  });
});

describe('heat news scope', () => {
  function heatPlants(): ReturnType<typeof atTerrain> {
    const fixture = atTerrain('monts-defiscalises', 'crypto');
    delete fixture.product.terrainId;
    delete fixture.company.terrainId;
    fixture.company.products.push({ ...structuredClone(fixture.product), id: 'later-heat-plant', hexId: 'C3' });
    return fixture;
  }

  it('targets one heat-selling plant, including an ordinary later plant without a terrain grant', () => {
    const { state, company } = heatPlants();
    const before = company.products.map((p) => effectiveHeatCredit(state, p));
    const article = applyNewsCard(state, card('loc-chaleur-1'), 'news');
    expect(state.activeEffects).toHaveLength(1);
    const affected = company.products.findIndex((p) => p.id === state.activeEffects[0].productId);
    expect(affected).toBeGreaterThanOrEqual(0);
    expect(company.products.map((p) => effectiveHeatCredit(state, p))).toEqual(before.map((v, i) => v * (i === affected ? 2 : 1)));
    expect(article.companyIds).toEqual([company.id]);
    expect(cardHasTarget(state, card('loc-chaleur-5'))).toBe(true);
    company.products[0].hexId = 'A10';
    expect(cardHasTarget(state, card('loc-chaleur-5'))).toBe(false);
    expect(cardHasTarget(state, card('loc-chaleur-3'))).toBe(true);
  });

  it('applies the demand label only to the selected product', () => {
    const { state, company } = heatPlants();
    applyNewsCard(state, card('loc-chaleur-4'), 'news');
    for (const p of company.products) expect(terrainPlantMultiplier(state, p, 'demand')).toBe(p.id === state.activeEffects[0].productId ? 1.1 : 1);
  });

  it('uses the requested publication quarter, including next-turn rumors', () => {
    const { state } = heatPlants();
    const winter = card('loc-chaleur-1'), heatwave = card('loc-chaleur-2');
    expect(cardHasTarget(state, winter, 1)).toBe(true);
    expect(cardHasTarget(state, winter, 4)).toBe(true);
    expect(cardHasTarget(state, winter, 2)).toBe(false);
    expect(cardHasTarget(state, heatwave, 2)).toBe(false);
    expect(drawNews(state, 3, onlyCard(heatwave.id))?.id).toBe(heatwave.id);
    expect(drawNews(state, 4, onlyCard(heatwave.id))).toBeUndefined();
  });

  it('does not qualify classic mode or crypto on cells without a network', () => {
    const { state, product, company } = heatPlants();
    company.products = [product];
    product.hexId = 'A10';
    expect(cardHasTarget(state, card('loc-chaleur-1'))).toBe(false);
    product.hexId = 'K8';
    state.config.mapMode = 'classic';
    expect(cardHasTarget(state, card('loc-chaleur-1'))).toBe(false);
  });
});
