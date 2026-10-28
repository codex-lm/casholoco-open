/** Tirage et application des nouvelles du Capital Quotidien (§9). */
import { isSpatialMap } from '../content/hexes';
import { COMMODITIES, getContent, NEWS_CARDS, TERRAIN_CONTENT } from '../content';
import {
  COMMODITY_IDS,
  SECTOR_IDS,
  type Article,
  type CommodityId,
  type CompanyState,
  type CompanyTarget,
  type GameState,
  type Lang,
  type NewsCard,
  type SectorId,
} from '../types';
import {
  COMMODITY_CAP_RATIO,
  COMMODITY_FLOOR_RATIO,
  PRICE_FLOOR,
  RECENT_NEWS_MEMORY,
  REPUTATION_MAX,
  REPUTATION_MIN,
  SENTIMENT_MAX,
  SENTIMENT_MIN,
} from './constants';
import { lastReport, marketCap, profitWithoutDisposal } from './finance';
import { cryptoNewsCompatible, cryptoNewsWeight, cryptoRandomSectorAllowed } from './cryptoMarket';
import { langOf } from './i18n';
import { makeArticle } from './journal';
import { pick, weightedPick } from './rng';
import { heatNewsTargets, terrainNewsTarget } from './terrainNews';
import { addScandal } from './terrains';
import { activeCompanies, clamp, controllerOf, fillTemplate, fin, newId } from './util';

export function findCard(id: string): NewsCard | undefined {
  return NEWS_CARDS.find((c) => c.id === id) ?? TERRAIN_CONTENT.newsCards.find((c) => c.id === id);
}

/** Tire une carte publiable au tour `turn`, pondérée par `weight`, hors des 12 dernières et de `exclude`. */
export function drawNews(state: GameState, turn: number, exclude: Set<string>): NewsCard | undefined {
  const cards = isSpatialMap(state.config) ? [...NEWS_CARDS, ...TERRAIN_CONTENT.newsCards] : NEWS_CARDS;
  const eligible = cards.filter(
    (c) =>
      c.weight > 0 &&
      (c.minTurn ?? 1) <= turn &&
      turn <= (c.maxTurn ?? Number.POSITIVE_INFINITY) &&
      !exclude.has(c.id) &&
      cryptoNewsCompatible(state, c) &&
      cardHasTarget(state, c, turn),
  );
  const fresh = eligible.filter((c) => !state.recentNewsIds.includes(c.id));
  const pool = fresh.length > 0 ? fresh : eligible;
  return weightedPick(state, pool, (c) => cryptoNewsWeight(state, c));
}

export function rememberNews(state: GameState, id: string): void {
  state.recentNewsIds = state.recentNewsIds.filter((x) => x !== id);
  state.recentNewsIds.push(id);
  if (state.recentNewsIds.length > RECENT_NEWS_MEMORY) {
    state.recentNewsIds = state.recentNewsIds.slice(-RECENT_NEWS_MEMORY);
  }
}

interface CardContext {
  randomCompany?: CompanyState | null;
  single: Partial<Record<SingleTarget, CompanyState | null>>;
  missingTarget?: boolean;
  randomSector?: SectorId;
  allowRandomCrypto?: boolean;
  randomCommodity?: CommodityId;
  companies: CompanyState[];
  sectors: SectorId[];
  commodities: CommodityId[];
}

function resolveSector(state: GameState, id: SectorId | 'random', ctx: CardContext): SectorId {
  if (id !== 'random') return id;
  if (!ctx.randomSector) ctx.randomSector = pick(state, ctx.allowRandomCrypto !== false ? SECTOR_IDS : SECTOR_IDS.filter((sid) => sid !== 'crypto')) ?? 'energy_drinks';
  return ctx.randomSector;
}

function resolveCommodity(state: GameState, id: CommodityId | 'random', ctx: CardContext): CommodityId {
  if (id !== 'random') return id;
  if (!ctx.randomCommodity) ctx.randomCommodity = pick(state, COMMODITY_IDS) ?? 'oil';
  return ctx.randomCommodity;
}

type SingleTarget = 'richest' | 'smallest' | 'mostScandalous' | 'topProfit';

/**
 * Entreprise au score extrême parmi celles qui sont éligibles ; à égalité, tirage au sort (RNG à graine).
 * Renvoie undefined si aucune entreprise n'est concernée (personne n'est « la plus sulfureuse » à 0).
 */
function extreme(
  state: GameState,
  list: CompanyState[],
  score: (c: CompanyState) => number,
  max: boolean,
  eligible: (c: CompanyState) => boolean = () => true,
): CompanyState | undefined {
  let ties: CompanyState[] = [];
  let bestScore = 0;
  for (const c of list) {
    const s = score(c);
    if (!Number.isFinite(s) || !eligible(c)) continue;
    if (ties.length === 0 || (max ? s > bestScore + 1e-9 : s < bestScore - 1e-9)) {
      ties = [c];
      bestScore = s;
    } else if (Math.abs(s - bestScore) <= 1e-9) ties.push(c);
  }
  if (ties.length <= 1) return ties[0];
  return pick(state, ties);
}

function profitOf(c: CompanyState): number {
  const report = lastReport(c);
  return report ? profitWithoutDisposal(report) : 0;
}

/** Résout une cible « unique » (hors 'random') : entreprise concernée, ou undefined si personne. */
function resolveSingle(state: GameState, active: CompanyState[], target: SingleTarget): CompanyState | undefined {
  switch (target) {
    case 'richest':
      return extreme(state, active, marketCap, true);
    case 'smallest':
      return extreme(state, active, marketCap, false);
    case 'mostScandalous':
      return extreme(state, active, (c) => c.scandal, true, (c) => c.scandal > 0);
    case 'topProfit':
      return extreme(state, active, profitOf, true, (c) => profitOf(c) > 0);
  }
}

/** Résout une cible d'effet en entreprises actives (au moment de l'application). */
export function resolveTargets(state: GameState, target: CompanyTarget, ctx: CardContext): CompanyState[] {
  const active = activeCompanies(state);
  if (active.length === 0) return [];
  if (typeof target === 'object') {
    if (target && SECTOR_IDS.includes(target.sectorId)) {
      if (!ctx.sectors.includes(target.sectorId)) ctx.sectors.push(target.sectorId);
      return active.filter((c) => c.products.some((p) => p.sectorId === target.sectorId));
    }
    return [];
  }
  let one: CompanyState | undefined;
  switch (target) {
    case 'all':
      return active;
    case 'playerCompanies':
      return active.filter((c) => c.controllerId !== null);
    case 'random':
      if (ctx.randomCompany === undefined) ctx.randomCompany = pick(state, active) ?? null;
      one = ctx.randomCompany ?? undefined;
      break;
    case 'richest':
    case 'smallest':
    case 'mostScandalous':
    case 'topProfit': {
      // Résolue une seule fois par carte : tous les effets frappent la même entreprise.
      if (!(target in ctx.single)) ctx.single[target] = resolveSingle(state, active, target) ?? null;
      one = ctx.single[target] ?? undefined;
      if (!one) ctx.missingTarget = true;
      break;
    }
    default:
      return [];
  }
  return one ? [one] : [];
}

const SINGLE_TARGETS: readonly string[] = ['richest', 'smallest', 'mostScandalous', 'topProfit'];

/** Faux si la carte vise une entreprise unique (« la plus rentable »…) et que personne n'est concerné. */
export function cardHasTarget(state: GameState, card: NewsCard, turn = state.turn): boolean {
  if (card.quarters && !card.quarters.includes((turn - 1) % 4 + 1)) return false;
  const active = activeCompanies(state);
  for (const e of card.effects) {
    if (e.type === 'terrain' && !terrainNewsTarget(state, e, turn)) return false;
    if (e.type === 'heat' && heatNewsTargets(state, e).length === 0) return false;
    if (!('target' in e) || typeof e.target !== 'string' || !SINGLE_TARGETS.includes(e.target)) continue;
    if (active.length === 0) return false;
    const t = e.target as SingleTarget;
    const ok =
      t === 'mostScandalous' ? active.some((c) => c.scandal > 0) : t === 'topProfit' ? active.some((c) => profitOf(c) > 0) : true;
    if (!ok) return false;
  }
  return true;
}

function noteCompanies(ctx: CardContext, list: CompanyState[]): void {
  for (const c of list) if (!ctx.companies.includes(c)) ctx.companies.push(c);
}

function scaleCompanyPrice(c: CompanyState, m: number): void {
  c.sharePrice = Math.max(PRICE_FLOOR, fin(c.sharePrice * m, PRICE_FLOOR));
}

/**
 * Applique les effets d'une carte et renvoie l'article correspondant.
 * Les effets de sentiment font aussi bouger le cours immédiatement (le marché lit le journal).
 */
export function applyNewsCard(state: GameState, card: NewsCard, kind: Article['kind']): Article {
  const ctx: CardContext = { companies: [], sectors: [], commodities: [], single: {}, allowRandomCrypto: cryptoRandomSectorAllowed(state, card) };
  for (const eff of card.effects) {
    switch (eff.type) {
      case 'terrain': {
        const target = terrainNewsTarget(state, eff);
        if (!target) { ctx.missingTarget = true; break; }
        noteCompanies(ctx, [target.company]);
        if (eff.duration > 0 && (eff.suspend === true || Number.isFinite(eff.multiplier))) {
          state.activeEffects.push({
            id: newId(state, 'e'), newsId: card.id, kind: 'terrain', terrain: eff.terrain,
            lever: eff.lever, value: eff.suspend ? 1 : clamp(eff.multiplier!, 0, 5),
            ...(eff.suspend ? { suspend: true } : {}), turnsLeft: Math.floor(eff.duration),
          });
        }
        break;
      }
      case 'heat': {
        const target = pick(state, heatNewsTargets(state, eff));
        if (!target) { ctx.missingTarget = true; break; }
        noteCompanies(ctx, [target.company]);
        if (eff.duration > 0 && Number.isFinite(eff.multiplier)) {
          state.activeEffects.push({
            id: newId(state, 'e'), newsId: card.id, kind: 'heat', scope: eff.scope,
            productId: target.product.id, lever: eff.lever, value: clamp(eff.multiplier, 0, 5),
            turnsLeft: Math.floor(eff.duration),
          });
        }
        break;
      }
      case 'sectorDemand': {
        const sid = resolveSector(state, eff.sectorId, ctx);
        if (!ctx.sectors.includes(sid)) ctx.sectors.push(sid);
        if (eff.duration > 0 && Number.isFinite(eff.multiplier)) {
          state.activeEffects.push({
            id: newId(state, 'e'),
            newsId: card.id,
            kind: 'sectorDemand',
            sectorId: sid,
            value: clamp(eff.multiplier, 0.05, 20),
            turnsLeft: Math.floor(eff.duration),
          });
        }
        break;
      }
      case 'commodityPrice': {
        const cid = resolveCommodity(state, eff.commodityId, ctx);
        if (!ctx.commodities.includes(cid)) ctx.commodities.push(cid);
        const cs = state.commodities[cid];
        const base = COMMODITIES[cid].basePrice;
        cs.price = clamp(fin(cs.price * eff.multiplier, base), base * COMMODITY_FLOOR_RATIO, base * COMMODITY_CAP_RATIO);
        break;
      }
      case 'commoditySupply': {
        const cid = resolveCommodity(state, eff.commodityId, ctx);
        if (!ctx.commodities.includes(cid)) ctx.commodities.push(cid);
        if (eff.duration > 0 && Number.isFinite(eff.multiplier)) {
          state.activeEffects.push({
            id: newId(state, 'e'),
            newsId: card.id,
            kind: 'commoditySupply',
            commodityId: cid,
            value: clamp(eff.multiplier, 0.05, 20),
            turnsLeft: Math.floor(eff.duration),
          });
        }
        break;
      }
      case 'siteCost': {
        const cid = resolveCommodity(state, eff.commodityId, ctx);
        if (!ctx.commodities.includes(cid)) ctx.commodities.push(cid);
        if (eff.duration > 0 && Number.isFinite(eff.multiplier)) {
          state.activeEffects.push({
            id: newId(state, 'e'),
            newsId: card.id,
            kind: 'siteCost',
            commodityId: cid,
            value: clamp(eff.multiplier, 0.2, 5),
            turnsLeft: Math.floor(eff.duration),
          });
        }
        break;
      }
      case 'interestRate':
      case 'taxRate': {
        if (eff.duration > 0 && Number.isFinite(eff.delta)) {
          state.activeEffects.push({
            id: newId(state, 'e'),
            newsId: card.id,
            kind: eff.type,
            value: clamp(eff.delta, -0.5, 0.5),
            turnsLeft: Math.floor(eff.duration),
          });
        }
        break;
      }
      case 'zoneLabor': {
        if (eff.duration > 0 && Number.isFinite(eff.multiplier)) {
          state.activeEffects.push({
            id: newId(state, 'e'),
            newsId: card.id,
            kind: 'zoneLabor',
            zoneId: eff.zoneId,
            value: clamp(eff.multiplier, 0.2, 5),
            turnsLeft: Math.floor(eff.duration),
          });
        }
        break;
      }
      case 'transportCost': {
        if (eff.duration > 0 && Number.isFinite(eff.multiplier)) {
          state.activeEffects.push({
            id: newId(state, 'e'),
            newsId: card.id,
            kind: 'transportCost',
            value: clamp(eff.multiplier, 0.2, 5),
            turnsLeft: Math.floor(eff.duration),
          });
        }
        break;
      }
      case 'laborCost': {
        const sid = eff.sectorId;
        if (sid !== 'all' && !ctx.sectors.includes(sid)) ctx.sectors.push(sid);
        if (eff.duration > 0 && Number.isFinite(eff.multiplier)) {
          state.activeEffects.push({
            id: newId(state, 'e'),
            newsId: card.id,
            kind: 'laborCost',
            sectorId: sid,
            value: clamp(eff.multiplier, 0.05, 20),
            turnsLeft: Math.floor(eff.duration),
          });
        }
        break;
      }
      case 'marketSentiment': {
        const m = clamp(fin(eff.multiplier, 1), 0.2, 5);
        state.macro.marketSentiment = clamp(state.macro.marketSentiment * m, SENTIMENT_MIN, SENTIMENT_MAX);
        for (const c of activeCompanies(state)) scaleCompanyPrice(c, m);
        break;
      }
      case 'companySentiment': {
        const m = clamp(fin(eff.multiplier, 1), 0.2, 5);
        const targets = resolveTargets(state, eff.target, ctx);
        noteCompanies(ctx, targets);
        for (const c of targets) {
          c.sentiment = clamp(c.sentiment * m, SENTIMENT_MIN, SENTIMENT_MAX);
          scaleCompanyPrice(c, m);
        }
        break;
      }
      case 'companyCash': {
        const targets = resolveTargets(state, eff.target, ctx);
        noteCompanies(ctx, targets);
        for (const c of targets) {
          const delta = fin(Math.max(c.cash, 0) * eff.pctOfCash + (eff.flat ?? 0));
          c.cash += delta;
          if (delta < 0) {
            const ctrl = controllerOf(state, c);
            if (ctrl) ctrl.stats.finesPaid += -delta;
          }
        }
        break;
      }
      case 'scandal': {
        const targets = resolveTargets(state, eff.target, ctx);
        noteCompanies(ctx, targets);
        for (const c of targets) addScandal(state, c, fin(eff.delta));
        break;
      }
      case 'reputation': {
        const targets = resolveTargets(state, eff.target, ctx);
        noteCompanies(ctx, targets);
        for (const c of targets) c.reputation = clamp(c.reputation + fin(eff.delta), REPUTATION_MIN, REPUTATION_MAX);
        break;
      }
      default:
        break;
    }
  }

  // Placeholders : première cible résolue, sinon tirage pour le texte seulement.
  // Le besoin de tirage se lit sur la carte de référence (française), jamais sur sa traduction :
  // la consommation du RNG est ainsi identique quelle que soit la langue de la partie.
  const ref = findCard(card.id) ?? card;
  const needs = (key: string) => ref.headline.includes(`{${key}}`) || ref.body.includes(`{${key}}`);
  let company: CompanyState | undefined = ctx.randomCompany ?? ctx.companies[0];
  // Une cible unique introuvable (personne n'est « la plus rentable ») garde la formule vague du titre.
  if (!company && !ctx.missingTarget && (needs('company') || needs('ceo'))) {
    company = pick(state, activeCompanies(state));
    if (company) ctx.companies.push(company);
  }
  let sector: SectorId | undefined = ctx.randomSector ?? ctx.sectors[0];
  if (!sector && needs('sector')) {
    sector = pick(state, SECTOR_IDS);
    if (sector) ctx.sectors.push(sector);
  }
  let commodity: CommodityId | undefined = ctx.randomCommodity ?? ctx.commodities[0];
  if (!commodity && needs('commodity')) {
    commodity = pick(state, COMMODITY_IDS);
    if (commodity) ctx.commodities.push(commodity);
  }
  const lang = langOf(state);
  const content = getContent(lang);
  const text = localizedCard(card, lang);
  const vars = {
    company: company?.name,
    ceo: company?.ceoName,
    sector: sector ? content.sectors[sector].name : undefined,
    commodity: commodity ? content.commodities[commodity].name : undefined,
  };
  // Les articles ne listent que les entreprises nommées ou peu nombreuses (pas « toutes »).
  const companyIds = ctx.companies.length <= 3 ? ctx.companies.map((c) => c.id) : company ? [company.id] : [];
  return makeArticle(state, {
    title: fillTemplate(text.headline, vars, lang),
    body: fillTemplate(text.body, vars, lang),
    tone: card.tone,
    kind,
    companyIds,
    sectorIds: ctx.sectors,
    commodityIds: ctx.commodities,
  });
}

/** Version d'une carte dans la langue demandée (mêmes effets ; retombe sur la carte d'origine). */
export function localizedCard(card: NewsCard, lang: Lang): NewsCard {
  if (lang === 'fr') return card;
  const content = getContent(lang);
  return content.newsCards.find((c) => c.id === card.id) ?? content.terrains.newsCards.find((c) => c.id === card.id) ?? card;
}

/** Rumeur sans placeholders (les cibles ne sont pas encore résolues). */
export function rumorText(text: string, lang: Lang = 'fr'): string {
  return fillTemplate(text, {}, lang);
}
