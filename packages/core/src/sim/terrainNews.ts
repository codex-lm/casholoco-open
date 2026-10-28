/** Les cibles des récits locaux suivent les dotations conservées, jamais la seule géographie. */
import { heatCredit, zoneHexId } from './hexes';
import { isSpatialMap, hexDistance } from '../content/hexes';
import { boardTerrains } from '../content/boardTerrains';

import { getContent } from '../content';
import type { Article, CompanyState, GameState, NewsEffect, ProductState } from '../types';
import { langOf } from './i18n';
import { makeArticle } from './journal';
import { activeSeatTerrain, activeTerrain } from './terrains';
import { activeCompanies, fillTemplate } from './util';

export function terrainNewsTarget(state: GameState, effect: Extract<NewsEffect, { type: 'terrain' }>, turn = state.turn) {
  const target = activeTerrain(state, effect.terrain);
  if (!target) return undefined;
  const grants = target.terrain.effects.filter((e) => e.turns === undefined || turn <= e.turns);
  if (grants.length === 0) return undefined;
  // Une modification d'un privilège expiré ne doit pas devenir une pénalité autonome.
  if ((effect.suspend || target.terrain.effects.some((e) => e.lever === effect.lever)) && !grants.some((e) => e.lever === effect.lever)) return undefined;
  if ((effect.lever === 'tax' || effect.lever === 'scandal') && activeSeatTerrain(state, target.company)?.id !== effect.terrain) return undefined;
  return target;
}

/** La chaleur est une règle du plateau : usines ultérieures, déplacées et PNJ peuvent en bénéficier. */
export function heatNewsTargets(state: GameState, effect: Extract<NewsEffect, { type: 'heat' }>): { company: CompanyState; product: ProductState }[] {
  if (!isSpatialMap(state.config)) return [];
  const targets: { company: CompanyState; product: ProductState }[] = [];
  for (const company of activeCompanies(state)) {
    for (const product of company.products) {
      if (!product.hexId || heatCredit(product.sectorId, product.hexId) <= 0) continue;
      if (effect.scope !== 'all' && hexDistance(product.hexId, zoneHexId(effect.scope, state.config)) > 1) continue;
      targets.push({ company, product });
    }
  }
  return targets;
}

/** Ne pas annoncer des privilèges expirés ou temporairement modifiés par une nouvelle locale. */
export function settlementArticle(state: GameState, company: CompanyState, product: ProductState, opening = false, turn = state.turn): Article | undefined {
  const terrain = activeSeatTerrain(state, company);
  if (!terrain || (opening && product.terrainId !== terrain.id)) return undefined;
  if (!terrain.effects.some((e) => e.turns === undefined || turn <= e.turns)) return undefined;
  if (state.activeEffects.some((e) => e.kind === 'terrain' && e.terrain === terrain.id && e.turnsLeft > 0
    && (e.suspend || terrain.effects.some((base) => base.lever === e.lever)))) return undefined;
  const content = getContent(langOf(state));
  const text = content.terrains.settlements.find((a) => a.id === `settle-${terrain.id}-${opening ? 1 : 2}`);
  if (!text) return undefined;
  const vars = { company: company.name, ceo: company.ceoName, product: product.name };
  return makeArticle(state, {
    title: fillTemplate(text.headline, vars, content.lang),
    body: fillTemplate(text.body, vars, content.lang),
    tone: 'neutral', kind: opening ? 'news' : 'flash',
    companyIds: [company.id], sectorIds: [product.sectorId],
    ...(opening ? {} : { event: { type: 'productLaunch' as const, actorId: company.controllerId ?? undefined, productId: product.id } }),
  });
}

/** Premier numéro : éditorial du commissariat, attributions et ouvertures des usines de départ. */
export function openingTerrainArticles(state: GameState): Article[] {
  if (!isSpatialMap(state.config) || state.turn !== 1) return [];
  const content = getContent(langOf(state));
  const result: Article[] = [makeArticle(state, {
    title: content.terrains.editorial.headline, body: content.terrains.editorial.body, tone: 'neutral', kind: 'news',
  })];
  for (const terrain of boardTerrains(state.config, content.lang)) {
    const target = activeTerrain(state, terrain.id);
    if (!target) continue;
    const { company, product } = target;
    const vars = { company: company.name, ceo: company.ceoName, product: product.name };
    result.push(makeArticle(state, {
      title: fillTemplate(terrain.allocation.headline, vars, content.lang),
      body: fillTemplate(terrain.allocation.body, vars, content.lang),
      tone: 'neutral', kind: 'news', companyIds: [company.id], sectorIds: [product.sectorId],
    }));
    const opening = settlementArticle(state, company, product, true);
    if (opening) result.push(opening);
  }
  return result;
}
