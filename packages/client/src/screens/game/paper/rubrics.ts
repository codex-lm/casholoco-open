/**
 * Rubriques burlesques du bas de page du journal (courrier des lecteurs, faits divers, horoscope
 * des affaires, petites annonces). Pur et déterministe : chaque choix vient du hachage FNV-1a de
 * `${textSeed}|${issue.turn}|${rubric}|${i}` (textSeed = config.textSeed ?? config.seed), donc un
 * même numéro affiche les mêmes rubriques à tous les joueurs, dans toutes les langues, et les
 * archives ne changent pas. Aucun effet sur le jeu.
 *
 * Règle d'or : jamais de doublon avec la « Dernière minute » — les rubriques ne nomment ni une
 * entreprise ni un joueur qui apparaît dans les flashs du numéro, et ne réagissent jamais à un flash.
 * L'encadré réclame (publicité achetée par l'entreprise la plus dépensière en marketing du trimestre
 * clos) suit la même règle d'or : il ne met jamais en avant une entreprise des flashs du numéro.
 * Archives : l'éligibilité d'un annonceur se juge sur son rapport publié du trimestre clos (ajout seul),
 * jamais sur son statut du moment ; un encadré paru ne change donc pas tant que l'entreprise garde un
 * catalogue. Une faillite (catalogue vidé) fait passer l'encadré archivé à l'annonceur suivant, une
 * fusion peut changer le produit vanté : identique pour tous les joueurs, mais pas gravé dans le marbre.
 */
import { formatMoney, getContent, startsWithVowelSound, takesAn } from '@muchomoney/core';
import type {
  Article,
  ArticleEventType,
  CommodityId,
  CompanyView,
  ContentBundle,
  Id,
  JournalIssue,
  Lang,
  PaperContent,
  PaperEntry,
  PaperLetterTrigger,
  PlayerView,
  SectorId,
} from '@muchomoney/core';
import { fnv1a, hashPick } from './hash';

export interface RubricLetter {
  id: string;
  text: string;
  signature: string;
}
export interface RubricOdd {
  id: string;
  place: string;
  text: string;
}
export interface RubricSign {
  id: string;
  name: string;
  text: string;
}
export interface RubricAd {
  id: string;
  head: string;
  text: string;
  ref: number;
}
export interface PaperRubrics {
  letters: RubricLetter[];
  oddNews: RubricOdd[];
  horoscope: RubricSign[];
  ads: RubricAd[];
}

/** Les résultats auxquels une lettre de lecteur peut réagir. */
const LETTER_RESULT_TRIGGERS = new Set<ArticleEventType>(['bigProfit', 'bigLoss', 'scandal', 'bankruptcy']);

/** {company} et {amount} ne sont remplis que pour les lettres de résultats ; interdits ailleurs. */
const COMPANY_PLACEHOLDER = /\{(company|amount)\}/;

export interface FillCtx {
  paper: PaperContent;
  content: ContentBundle;
  view: PlayerView;
  headline?: Article;
  company?: string;
  amount?: string;
  key: string;
  sectorId?: SectorId;
  /** Valeurs imposées par placeholder (tests exhaustifs) ; court-circuite le piochage par hachage. */
  forceValues?: Readonly<Partial<Record<string, string>>>;
}

function sectorName(ctx: FillCtx, id: SectorId): string {
  return ctx.content.sectors[id]?.name ?? ctx.view.sectors.find((s) => s.id === id)?.name ?? id;
}

function pickSectorId(ctx: FillCtx, key: string): SectorId | undefined {
  const fromHeadline = ctx.headline?.sectorIds?.[0];
  if (fromHeadline !== undefined) return fromHeadline;
  const ids = ctx.view.sectors.map((s) => s.id);
  return hashPick(ids, key);
}

/** Remplit les placeholders ; chaque occurrence pioche par hachage dans les noms de la carte. */
export function fill(text: string, ctx: FillCtx): string {
  let n = 0;
  const value = (raw: string, name: string): string => {
    const key = `${ctx.key}|${name}|${n++}`;
    const forced = ctx.forceValues?.[name];
    if (forced !== undefined) return forced;
    switch (name) {
      case 'city':
        return hashPick(Object.values(ctx.content.mapNames.cities), key) ?? raw;
      case 'zone':
        return hashPick(Object.values(ctx.content.mapNames.zones), key) ?? raw;
      case 'landmark':
        return hashPick(Object.values(ctx.content.mapNames.landmarks), key) ?? raw;
      case 'commodity': {
        const fromHeadline = ctx.headline?.commodityIds?.[0];
        if (fromHeadline !== undefined) return ctx.content.commodities[fromHeadline]?.name ?? fromHeadline;
        const c = hashPick(ctx.view.commodities, key);
        return c ? (ctx.content.commodities[c.id]?.name ?? c.name) : raw;
      }
      case 'sector': {
        const id = pickSectorId(ctx, key);
        if (id === undefined) return raw;
        ctx.sectorId = id;
        return sectorName(ctx, id);
      }
      case 'product': {
        const id = ctx.sectorId ?? pickSectorId(ctx, key);
        if (id === undefined) return raw;
        ctx.sectorId = id;
        return hashPick(ctx.paper.sectorProducts[id] ?? [], key) ?? sectorName(ctx, id);
      }
      case 'company':
        return ctx.company ?? raw;
      case 'amount':
        return ctx.amount ?? raw;
      default:
        return raw;
    }
  };
  // Élision française (« de {x} »/« que {x} » → « d’… »/« qu’… ») et article anglais (« a {x} » → « an … »).
  const en = ctx.content.lang === 'en';
  const re = en
    ? /(?<!\p{L})(?:([Aa]n?) )?\{(city|zone|landmark|commodity|sector|product|company|amount)\}/gu
    : /(?<!\p{L})(?:([Dd]e|[Qq]ue) )?\{(city|zone|landmark|commodity|sector|product|company|amount)\}/gu;
  return text.replace(re, (m, art: string | undefined, name: string) => {
    const v = value(`{${name}}`, name);
    if (!art || v.startsWith('{')) return `${art ? `${art} ` : ''}${v}`;
    if (en) {
      const an = takesAn(v.replace(/^[“"‘'$]+/, ''));
      return `${art[0] === 'A' ? (an ? 'An' : 'A') : an ? 'an' : 'a'} ${v}`;
    }
    return startsWithVowelSound(v) ? `${art.slice(0, -1)}’${v}` : `${art} ${v}`;
  });
}

/** Noms (entreprises et joueurs) qu'un flash du numéro met en Une : interdits dans les rubriques. */
function flashNames(issue: JournalIssue, view: PlayerView): string[] {
  const names = new Set<string>();
  const companies = new Map(view.companies.map((c) => [c.id, c]));
  const players = new Map(view.players.map((p) => [p.id, p]));
  for (const a of issue.articles) {
    if (a.kind !== 'flash') continue;
    for (const id of a.companyIds ?? []) {
      const c = companies.get(id);
      if (c) {
        names.add(c.name);
        names.add(c.ticker);
      }
    }
    const ev = a.event;
    if (!ev) continue;
    for (const pid of [ev.actorId, ev.subjectId, ev.leaderId, ...(ev.leaderIds ?? [])]) {
      const p = pid === undefined ? undefined : players.get(pid);
      if (p) names.add(p.name);
    }
  }
  return [...names].filter((n) => n.length >= 3);
}

/**
 * Choisit un élément de `pool` (sonde linéaire depuis l'indice haché) dont le texte rendu est
 * complet (aucun '{' restant) et ne nomme personne des flashs. `exclude` écarte des ids déjà pris.
 */
function pickFilled<T extends PaperEntry>(
  pool: readonly T[],
  key: string,
  forbidden: readonly string[],
  ctx: FillCtx,
  render: (item: T, key: string) => string = (item, k) => fill(item.text, { ...ctx, key: k }),
  exclude?: ReadonlySet<string>,
): { item: T; text: string } | null {
  for (let attempt = 0; attempt < pool.length; attempt++) {
    const item = pool[(fnv1a(key) + attempt) % pool.length];
    if (exclude?.has(item.id)) continue;
    const k = attempt ? `${key}|try${attempt}` : key;
    const text = render(item, k);
    if (text.includes('{')) continue;
    if (forbidden.some((n) => text.includes(n))) continue;
    return { item, text };
  }
  return null;
}

interface ResultSource {
  trigger: PaperLetterTrigger;
  company: string;
  /** Absent pour une faillite sans perte publiée : seules les lettres sans {amount} conviennent. */
  amount?: number;
  banned: boolean;
}

/** Articles de résultats du numéro, plus la faillite en une ; ceux d'une entreprise d'un flash sont marqués `banned`. */
function resultSources(issue: JournalIssue, view: PlayerView, forbidden: readonly string[]): ResultSource[] {
  const companies = new Map(view.companies.map((c) => [c.id, c]));
  const out: ResultSource[] = [];
  for (const a of issue.articles) {
    const ev = a.event;
    if (!ev || !LETTER_RESULT_TRIGGERS.has(ev.type)) continue;
    const isBankruptcy = ev.type === 'bankruptcy';
    if (a.kind !== 'results' && !(isBankruptcy && a.kind === 'headline')) continue;
    const company = (a.companyIds ?? []).map((id) => companies.get(id)).find((c) => c !== undefined);
    if (!company) continue;
    let amount = ev.amount;
    // Le moteur ne met pas de montant sur une faillite (et l'entreprise en faillite n'a pas de
    // comptes pour le trimestre clos) : on reprend sa dernière perte publiée, sinon pas de montant
    // (les lettres de faillite sans {amount} conviennent alors).
    if (amount === undefined && isBankruptcy) {
      const last = company.reports.filter((r) => r.turn < issue.turn).pop();
      if (last && last.netProfit < 0) amount = -last.netProfit;
    }
    if (amount === undefined && !isBankruptcy) continue;
    out.push({
      trigger: ev.type as PaperLetterTrigger,
      company: company.name,
      amount,
      banned: forbidden.includes(company.name) || forbidden.includes(company.ticker),
    });
  }
  return out;
}

function pickSignature(paper: PaperContent, ctx: FillCtx, key: string, forbidden: readonly string[], taken: Set<string>): string {
  const sig = pickFilled(paper.signatures, `${key}|sig`, forbidden, ctx, undefined, taken);
  if (sig) taken.add(sig.item.id);
  return sig?.text ?? '';
}

/**
 * Les rubriques d'un numéro, déjà remplies et prêtes à rendre. `money` formate {amount} des lettres
 * de résultats (par défaut le format du salon). Renvoie null tant que le contenu `paper` n'existe pas.
 */
export function pickRubrics(
  issue: JournalIssue,
  view: PlayerView,
  lang: Lang,
  money: (k: number) => string = (k) => formatMoney(k, lang),
): PaperRubrics | null {
  const content = getContent(lang);
  const paper = content.paper;
  if (!paper) return null;
  const textSeed = view.config.textSeed ?? view.config.seed;
  const base = `${textSeed}|${issue.turn}`;
  const headline = issue.articles.find((a) => a.kind === 'headline');
  const forbidden = flashNames(issue, view);
  const ctx: FillCtx = { paper, content, view, headline, key: base };

  // --- Courrier des lecteurs : une lettre sur la une, une sur un résultat (ou une lettre libre).
  const letters: RubricLetter[] = [];
  const sigTaken = new Set<string>();
  const uneTrigger: PaperLetterTrigger = headline
    ? headline.tone === 'good'
      ? 'uneGood'
      : headline.tone === 'bad' || headline.tone === 'drama'
        ? 'uneBad'
        : 'uneNeutral'
    : 'any';
  // La lettre de une ne nomme qu'une matière ou un secteur que la une porte vraiment.
  const hasCommodity = !!headline?.commodityIds?.length;
  const hasSector = !!headline?.sectorIds?.length;
  const unePool = paper.letters.filter(
    (l) =>
      l.trigger === uneTrigger &&
      !COMPANY_PLACEHOLDER.test(l.text) &&
      (hasCommodity || !l.text.includes('{commodity}')) &&
      (hasSector || !/\{(sector|product)\}/.test(l.text)),
  );
  const une = pickFilled(unePool, `${base}|letters|0`, forbidden, ctx);
  if (une) {
    letters.push({ id: une.item.id, text: une.text, signature: pickSignature(paper, ctx, `${base}|letters|0`, forbidden, sigTaken) });
  }

  const taken = new Set(letters.map((l) => l.id));
  const anyPool = paper.letters.filter((l) => l.trigger === 'any' && !COMPANY_PLACEHOLDER.test(l.text));
  let second: { item: PaperContent['letters'][number]; text: string } | null = null;
  const sources = resultSources(issue, view, forbidden);
  // Une faillite passe avant les résultats ordinaires : c'est l'événement du trimestre.
  const bankrupt = sources.filter((s) => s.trigger === 'bankruptcy' && !s.banned);
  for (const list of bankrupt.length > 0 ? [bankrupt, sources] : [sources]) {
    for (let attempt = 0; attempt < list.length && !second; attempt++) {
      const source = list[(fnv1a(`${base}|letters|1|src`) + attempt) % list.length];
      if (source.banned) continue;
      const pool = paper.letters.filter((l) => l.trigger === source.trigger);
      const amount = source.amount === undefined ? undefined : money(source.amount);
      second = pickFilled(pool, `${base}|letters|1`, forbidden, { ...ctx, company: source.company, amount }, undefined, taken);
    }
    if (second) break;
  }
  second ??= pickFilled(anyPool, `${base}|letters|1`, forbidden, ctx, undefined, taken);
  if (second) {
    letters.push({ id: second.item.id, text: second.text, signature: pickSignature(paper, ctx, `${base}|letters|1`, forbidden, sigTaken) });
  }

  // --- Faits divers : 3, chacun commence par un lieu suivi d'un point.
  const oddPool = paper.oddNews.filter((o) => !COMPANY_PLACEHOLDER.test(o.text));
  const oddNews: RubricOdd[] = [];
  for (let i = 0; i < 3; i++) {
    const picked = pickFilled(oddPool, `${base}|odd|${i}`, forbidden, ctx, undefined, new Set(oddNews.map((o) => o.id)));
    if (!picked) break;
    const dot = picked.text.indexOf('.');
    if (dot <= 0) {
      oddNews.push({ id: picked.item.id, place: '', text: picked.text });
    } else {
      oddNews.push({ id: picked.item.id, place: picked.text.slice(0, dot), text: picked.text.slice(dot + 1).trim() });
    }
  }

  // --- Horoscope des affaires : 4 signes distincts (sonde linéaire depuis l'indice haché), un texte chacun.
  const horoscope: RubricSign[] = [];
  for (let i = 0, attempt = 0; i < 4 && attempt < paper.signs.length; attempt++) {
    const sign = paper.signs[(fnv1a(`${base}|horo|${i}`) + attempt) % paper.signs.length];
    if (horoscope.some((h) => h.id === sign.id)) continue;
    const text = pickFilled(sign.texts, `${base}|horo|${i}`, forbidden, ctx);
    if (!text) continue;
    horoscope.push({ id: sign.id, name: sign.name, text: text.text });
    i++;
  }

  // --- Petites annonces : 3, numéro de référence séquentiel et déterministe.
  const adPool = paper.ads.filter((a) => !COMPANY_PLACEHOLDER.test(a.head + a.text));
  const ads: RubricAd[] = [];
  const refBase = 1000 + (fnv1a(`${base}|ads|ref`) % 9000);
  for (let i = 0; i < 3; i++) {
    const key = `${base}|ads|${i}`;
    let chosen: RubricAd | null = null;
    for (let attempt = 0; attempt < adPool.length && !chosen; attempt++) {
      const ad = adPool[(fnv1a(key) + attempt) % adPool.length];
      if (ads.some((a) => a.id === ad.id)) continue;
      const k = attempt ? `${key}|try${attempt}` : key;
      const head = fill(ad.head, { ...ctx, key: `${k}|head` });
      const text = fill(ad.text, { ...ctx, key: k });
      const joined = `${head} ${text}`;
      if (joined.includes('{') || forbidden.some((n) => joined.includes(n))) continue;
      chosen = { id: ad.id, head, text, ref: refBase + ads.length };
    }
    if (!chosen) break;
    ads.push(chosen);
  }

  return { letters, oddNews, horoscope, ads };
}

// ---------------------------------------------------------------------------
// Réclame : l'entreprise (hors flashs) qui a le plus dépensé en marketing au
// trimestre clos « achète » un encadré publicitaire pour un de ses produits.
// L'éligibilité se juge à l'historique — un rapport publié pour le trimestre q
// avec un marketing > 0 suffit, même si l'entreprise a depuis fait faillite ou
// fusionné — et l'exclusion des flashs se fait par sous-chaîne (nom ou ticker),
// comme pickFilled. Le vivier de produits privilégie les lignes produits du
// rapport du trimestre q ; si le gabarit ne se remplit pas pour le meilleur
// annonceur, on retombe sur les suivants dans l'ordre du score.
// ---------------------------------------------------------------------------

export interface PaperReclame {
  companyId: Id;
  /** Nom de l'entreprise annonceuse. */
  company: string;
  /** Nom du produit vanté. */
  product: string;
  sectorId: SectorId;
  /** Gabarit publicitaire rempli. */
  text: string;
  /** Deux lignes légales remplies (moins si le lot est petit). */
  legal: string[];
  /** Marketing dépensé au trimestre clos (k). */
  amount: number;
  /** Trimestre clos q = issue.turn − 1. */
  quarter: number;
  templateId: string;
}

interface Advertiser {
  companyId: Id;
  /** Marketing dépensé au trimestre q, base du score. */
  marketing: number;
}

/** Produit vantable dans l'encadré : le strict nécessaire pour piocher et remplir le gabarit. */
interface ReclameProduct {
  id: Id;
  name: string;
  sectorId: SectorId;
}

const byId = <T extends { id: Id }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Vivier de produits vantables d'une entreprise pour le trimestre q, trié par id. La vivacité se
 * juge à l'historique (le catalogue actuel peut avoir disparu avec une faillite ou changé avec une
 * fusion), donc le vivier part du catalogue actuel — produits en rayon à q (`launchedTurn <= q`,
 * pas « bientôt ») dont le nom ne contient aucun nom interdit (sous-chaîne, comme pickFilled).
 * Le catalogue public est le seul vivier : les lignes produits des rapports ne sont servies qu'au
 * dirigeant pendant la partie, et un vivier qui en dépendrait ferait lire des encadrés différents
 * selon le joueur. Conséquence assumée : une entreprise depuis en faillite (catalogue vidé) sort du
 * vivier et son encadré archivé passe à l'annonceur suivant ; après une fusion, le produit vanté peut
 * changer. Tant que le catalogue existe, l'encadré est le même pour tous et ne dépend que des comptes
 * publiés (ajout seul).
 */
function reclameProducts(company: CompanyView, q: number, forbidden: readonly string[]): ReclameProduct[] {
  const banned = (name: string) => forbidden.some((n) => name.includes(n));
  return company.products
    .filter((p) => !p.comingSoon && p.launchedTurn <= q && !banned(p.name))
    .map((p) => ({ id: p.id, name: p.name, sectorId: p.sectorId }))
    .sort(byId);
}

/**
 * Annonceurs possibles du trimestre q : entreprises jamais nommées par un flash du numéro (exclusion
 * par sous-chaîne sur le nom ou le ticker, comme pickFilled), avec un marketing > 0 publié pour q
 * (vivacité historique : une entreprise depuis en faillite ou fusionnée compte encore) et un vivier
 * de produits vantables non vide (voir reclameProducts, qui préfère les lignes du rapport de q).
 */
function advertiserCandidates(issue: JournalIssue, view: PlayerView, q: number): Advertiser[] {
  const forbidden = flashNames(issue, view);
  const out: Advertiser[] = [];
  for (const c of view.companies) {
    if (forbidden.some((n) => c.name.includes(n) || c.ticker.includes(n))) continue;
    const r = c.reports.find((rep) => rep.turn === q);
    if (!r || r.marketing <= 0) continue;
    if (reclameProducts(c, q, forbidden).length === 0) continue;
    out.push({ companyId: c.id, marketing: r.marketing });
  }
  return out;
}

/**
 * Annonceurs du trimestre q classés par score décroissant (marketing ; l'annonceur `penalizedId` est
 * déclassé ×0,6 ; égalité → plus petit id). L'ordre sert de repli : si le meilleur annonceur ne remplit
 * aucun gabarit, pickReclame essaie les suivants dans cet ordre.
 */
function rankedAdvertisers(issue: JournalIssue, view: PlayerView, q: number, penalizedId?: Id): Advertiser[] {
  return advertiserCandidates(issue, view, q)
    .map((cand) => ({ cand, score: cand.marketing * (cand.companyId === penalizedId ? 0.6 : 1) }))
    .sort((a, b) => b.score - a.score || (a.cand.companyId < b.cand.companyId ? -1 : a.cand.companyId > b.cand.companyId ? 1 : 0))
    .map(({ cand }) => cand);
}

/** Meilleur annonceur du trimestre q : tête du classement de rankedAdvertisers (null si personne). */
function bestAdvertiser(issue: JournalIssue, view: PlayerView, q: number, penalizedId?: Id): Advertiser | null {
  return rankedAdvertisers(issue, view, q, penalizedId)[0] ?? null;
}

/** Annonceur du numéro précédent, recalculé en chaîne depuis le N° 2 (comme previousKind dans figure.ts). */
function previousAdvertiser(view: PlayerView, q: number): Id | undefined {
  let prevId: Id | undefined;
  for (let qq = 1; qq < q; qq++) {
    const past = view.journal.find((i) => i.turn === qq + 1);
    prevId = past ? bestAdvertiser(past, view, qq, prevId)?.companyId : undefined;
  }
  return prevId;
}

/**
 * L'encadré réclame d'un numéro, déjà rempli ; null au N° 1, sans annonceur éligible ou tant que le
 * contenu `paper.reclame` n'existe pas. Les candidats sont essayés dans l'ordre du score : le premier
 * dont le produit pioché remplit un gabarit gagne (repli si le meilleur annonceur échoue) ; null
 * seulement si AUCUN candidat ne remplit. Mêmes entreprise, produit et gabarit en fr et en (clés de
 * hachage indépendantes de la langue et du rang du candidat) ; `lang` ne sert qu'à choisir les textes.
 */
export function pickReclame(issue: JournalIssue, view: PlayerView, lang: Lang): PaperReclame | null {
  const q = issue.turn - 1;
  if (q < 1) return null;
  const ranked = rankedAdvertisers(issue, view, q, previousAdvertiser(view, q));
  if (ranked.length === 0) return null;

  const content = getContent(lang);
  const paper = content.paper;
  if (!paper?.reclame) return null;
  const forbidden = flashNames(issue, view);
  const textSeed = view.config.textSeed ?? view.config.seed;
  const base = `${textSeed}|${issue.turn}`;
  const headline = issue.articles.find((a) => a.kind === 'headline');
  const ctx: FillCtx = { paper, content, view, headline, key: base };

  for (const cand of ranked) {
    const company = view.companies.find((c) => c.id === cand.companyId);
    if (!company) continue;
    const product = hashPick(reclameProducts(company, q, forbidden), `${base}|reclame|product`);
    if (!product) continue;
    const tpl = pickFilled(paper.reclame.templates[product.sectorId] ?? [], `${base}|reclame|tpl`, forbidden, {
      ...ctx,
      forceValues: { product: product.name, company: company.name },
    });
    if (!tpl) continue;

    const legal: string[] = [];
    const first = pickFilled(paper.reclame.legal, `${base}|reclame|legal|0`, forbidden, ctx);
    if (first) {
      legal.push(first.text);
      const second = pickFilled(paper.reclame.legal, `${base}|reclame|legal|1`, forbidden, ctx, undefined, new Set([first.item.id]));
      if (second) legal.push(second.text);
    }

    return {
      companyId: company.id,
      company: company.name,
      product: product.name,
      sectorId: product.sectorId,
      text: tpl.text,
      legal,
      amount: cand.marketing,
      quarter: q,
      templateId: tpl.item.id,
    };
  }
  return null;
}
