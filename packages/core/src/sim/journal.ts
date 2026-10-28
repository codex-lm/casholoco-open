/** Le Capital Quotidien (The Daily Capital en anglais) : articles, titres dynamiques et flashs « Dernière minute » (§9). */
import { getContent } from '../content';
import type { Article, ArticleEvent, GameState, HeadlineTemplates, JournalIssue } from '../types';
import { langOf, tr, type BodyKey } from './i18n';
import { fillTemplate, flavor, newId } from './util';

export type HeadlineKey = keyof HeadlineTemplates;

export function headlineText(state: GameState, key: HeadlineKey, vars: Record<string, string | undefined>): string {
  const lang = langOf(state);
  const fallback = tr(state).fallbackHeadlines[key];
  const list = (getContent(lang).headlines as Partial<HeadlineTemplates>)[key];
  const pool = list && list.length > 0 ? list : fallback;
  const tpl = flavor(state, pool, `headline:${key}:${vars.company ?? ''}${vars.target ?? ''}${vars.player ?? ''}`) ?? fallback[0];
  return fillTemplate(tpl, vars, lang);
}

export function currentIssue(state: GameState): JournalIssue | undefined {
  return state.journal.length > 0 ? state.journal[state.journal.length - 1] : undefined;
}

export type ArticleInput = Omit<Article, 'id'>;

/** Crée un article propre (sans clés `undefined`, pour un JSON stable). */
export function makeArticle(state: GameState, a: ArticleInput): Article {
  const art: Article = { id: newId(state, 'a'), title: a.title, body: a.body, tone: a.tone, kind: a.kind };
  if (a.companyIds && a.companyIds.length > 0) art.companyIds = [...new Set(a.companyIds)];
  if (a.sectorIds && a.sectorIds.length > 0) art.sectorIds = [...new Set(a.sectorIds)];
  if (a.commodityIds && a.commodityIds.length > 0) art.commodityIds = [...new Set(a.commodityIds)];
  if (a.event) art.event = cleanEvent(a.event);
  return art;
}

/** Événement sans clés `undefined` ni montant non fini (JSON stable, rien d'absurde dans la chronologie). */
function cleanEvent(e: ArticleEvent): ArticleEvent {
  const out: ArticleEvent = { type: e.type };
  if (e.actorId !== undefined) out.actorId = e.actorId;
  if (e.subjectId !== undefined) out.subjectId = e.subjectId;
  if (e.leaderId !== undefined) out.leaderId = e.leaderId;
  if (e.leaderIds !== undefined && e.leaderIds.length > 0) out.leaderIds = [...e.leaderIds];
  if (e.commodityId !== undefined) out.commodityId = e.commodityId;
  if (e.productId !== undefined) out.productId = e.productId;
  if (e.amount !== undefined && Number.isFinite(e.amount)) out.amount = e.amount;
  if (e.pct !== undefined && Number.isFinite(e.pct)) out.pct = e.pct;
  return out;
}

/** Publie un flash « Dernière minute » dans le numéro en cours. */
export function addFlash(state: GameState, a: Omit<ArticleInput, 'kind'>): Article | undefined {
  const issue = currentIssue(state);
  if (!issue) return undefined;
  const art = makeArticle(state, { ...a, kind: 'flash' });
  issue.articles.push(art);
  return art;
}

/** Petite phrase d'ambiance (catalogue du moteur, dans la langue de la partie). */
export function body(state: GameState, key: BodyKey, salt = ''): string {
  return flavor(state, tr(state).bodies[key], `body:${key}:${salt}`) ?? '';
}
