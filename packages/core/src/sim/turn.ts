/** Démarrage d'un tour : numéro du Capital Quotidien, news, rumeurs, puis actions des bots (§9, §10). */
import { isSpatialMap } from '../content/hexes';
import { FAKE_RUMORS, getContent, hexPlaceName } from '../content';
import { dateLabel } from '../format';
import { SECTOR_IDS, type Article, type BotPersonality, type CloseRecapFine, type CompanyState, type GameState, type HexAuctionResult, type Id, type JournalIssue, type LandSituation, type Offer, type PlayerState, type Rumor, type RumorReliability, type SectorId, type SupplyContract } from '../types';
import { runBots } from './bots';
import type { SiteAward } from './deals';
import { hexAuctionArticle, hexReservePrice } from './hexAuctions';
import { FAKE_RUMOR_RELIABILITY, TRUE_RUMOR_RELIABILITY } from './constants';
import { langOf, tr } from './i18n';
import { profitWithoutDisposal } from './finance';
import { body, headlineText, makeArticle } from './journal';
import { applyNewsCard, cardHasTarget, drawNews, findCard, localizedCard, rememberNews, rumorText } from './news';
import { cryptoCrashActive, cryptoEuphoriaNews, cryptoInsiderSaleBriefs, ordinaryCryptoDirection, preparedCryptoCard, scheduleCryptoNews } from './cryptoMarket';
import { int, pick, shuffle, weightedPick } from './rng';
import { fillTemplate, flavor, getOwn } from './util';

/** Ce qui s'est passé pendant une résolution, pour la rubrique « Résultats » du numéro suivant. */
export interface TurnLog {
  resolvedTurn: number;
  scandals: { companyId: Id; fine: number }[];
  bankruptcies: Id[];
  /**
   * Dirigeant de chaque entreprise quand ses comptes sont arrêtés (avant une faillite, qui le retire, et avant
   * les appels de marge, qui peuvent le faire passer la main) : les articles de résultats le désignent.
   */
  leaders: Record<Id, Id>;
  marginCalls: { playerId: Id; sold: number }[];
  /** Entreprises dont la production a été réduite faute de trésorerie (§5.7). */
  productionCuts: Id[];
  /** Ententes découvertes à cette résolution (§7 bis). */
  cartels: { sectorId: SectorId; companyIds: Id[]; leaderIds: Id[]; fines: number }[];
  /** Filiales attribuées aux enchères à cette résolution (§5.5 bis). */
  siteAwards: SiteAward[];
  hexAwards?: HexAuctionResult[];
  /** Launch announcements built after hex moves and effect countdown, for the following (or final) issue. */
  hexLaunchArticles?: Article[];
  /** Private observational snapshots, discarded after each player's frozen report is made. */
  closeBefore?: Record<Id, { scandal: number; reputation: number; sharePrice: number }>;
  fineCauses?: Record<Id, CloseRecapFine[]>;
  offers?: Offer[];
  contracts?: { contract: SupplyContract; playerIds: Id[]; delivered: boolean }[];
  forcedShareSales?: { turn: number; playerId: Id; companyId: Id; shares: number }[];
}

export function emptyTurnLog(turn: number): TurnLog {
  return { resolvedTurn: turn, scandals: [], bankruptcies: [], leaders: {}, marginCalls: [], productionCuts: [], cartels: [], siteAwards: [] };
}

/** Articles de résultats d'une résolution (meilleur bénéfice, pire perte, faillites, scandales, appels de marge). */
export function buildResultArticles(state: GameState, log: TurnLog): { bankruptcyArticles: Article[]; others: Article[] } {
  const T = tr(state);
  const bankruptcyArticles: Article[] = [];
  const others: Article[] = [];
  const reported = Object.values(state.companies)
    .map((c) => ({ c, r: c.reports.find((x) => x.turn === log.resolvedTurn) }))
    .filter((x): x is { c: (typeof x)['c']; r: NonNullable<(typeof x)['r']> } => x.r !== undefined);

  let best: (typeof reported)[number] | undefined;
  let worst: (typeof reported)[number] | undefined;
  for (const x of reported) {
    const profit = profitWithoutDisposal(x.r);
    if (profit > 0 && (!best || profit > profitWithoutDisposal(best.r))) best = x;
    if (profit < 0 && (!worst || profit < profitWithoutDisposal(worst.r))) worst = x;
  }
  if (best) {
    const profit = profitWithoutDisposal(best.r);
    others.push(
      makeArticle(state, {
        title: headlineText(state, 'bigProfit', { company: best.c.name, amount: T.money(profit) }),
        body: `${T.profitBody(best.r.revenue, profit)} ${body(state, 'bigProfit', best.c.id)}`,
        tone: 'good',
        kind: 'results',
        companyIds: [best.c.id],
        event: { type: 'bigProfit', leaderId: getOwn(log.leaders, best.c.id), amount: profit },
      }),
    );
  }
  if (worst) {
    const profit = profitWithoutDisposal(worst.r);
    others.push(
      makeArticle(state, {
        title: headlineText(state, 'bigLoss', { company: worst.c.name, amount: T.money(-profit) }),
        body: `${T.lossBody(worst.r.revenue, -profit)} ${body(state, 'bigLoss', worst.c.id)}`,
        tone: 'bad',
        kind: 'results',
        companyIds: [worst.c.id],
        event: { type: 'bigLoss', leaderId: getOwn(log.leaders, worst.c.id), amount: -profit },
      }),
    );
  }
  for (const id of log.bankruptcies) {
    const c = getOwn(state.companies, id);
    if (!c) continue;
    bankruptcyArticles.push(
      makeArticle(state, {
        title: headlineText(state, 'bankruptcy', { company: c.name }),
        body: body(state, 'bankruptcy', c.id),
        tone: 'drama',
        kind: 'results',
        companyIds: [c.id],
        event: { type: 'bankruptcy', subjectId: getOwn(log.leaders, c.id) },
      }),
    );
  }
  for (const s of log.scandals) {
    const c = getOwn(state.companies, s.companyId);
    if (!c) continue;
    others.push(
      makeArticle(state, {
        title: headlineText(state, 'scandal', { company: c.name, ceo: c.ceoName, amount: T.money(s.fine) }),
        body: body(state, 'scandal', c.id),
        tone: 'drama',
        kind: 'results',
        companyIds: [c.id],
        event: { type: 'scandal', leaderId: getOwn(log.leaders, c.id), amount: s.fine },
      }),
    );
  }
  for (const k of log.cartels) {
    const names = k.companyIds.map((id) => getOwn(state.companies, id)?.name).filter((x): x is string => !!x);
    const sector = getContent(langOf(state)).sectors[k.sectorId].name;
    others.push(
      makeArticle(state, {
        title: T.cartelBustedTitle(sector, names.join(', ')),
        body: T.cartelBustedBody(T.money(k.fines)),
        tone: 'drama',
        kind: 'results',
        companyIds: k.companyIds,
        sectorIds: [k.sectorId],
        event: { type: 'cartelBusted', leaderIds: k.leaderIds, amount: k.fines },
      }),
    );
  }
  for (const a of log.siteAwards) {
    const c = getOwn(state.companies, a.companyId);
    const slot = (state.siteSlots ?? []).find((x) => x.id === a.slotId);
    if (!c || !slot) continue;
    others.push(
      makeArticle(state, {
        title: T.siteAwardTitle(c.name, slot.name),
        body: T.siteAwardBody(T.money(a.price), a.bidders),
        tone: 'neutral',
        kind: 'results',
        companyIds: [c.id],
        commodityIds: [slot.commodityId],
        event: { type: 'siteOpened', actorId: a.playerId, commodityId: slot.commodityId, amount: a.price },
      }),
    );
  }
  for (const a of log.hexAwards ?? []) {
    const article = hexAuctionArticle(state, a);
    if (article) others.push(article);
  }
  others.push(...(log.hexLaunchArticles ?? []));
  for (const m of log.marginCalls) {
    const p = getOwn(state.players, m.playerId);
    if (!p) continue;
    others.push(
      makeArticle(state, {
        title: headlineText(state, 'marginCall', { player: p.name, amount: T.money(m.sold) }),
        body: `${body(state, 'marginCall', p.id)} ${T.marginCallTail(m.sold)}`,
        tone: 'bad',
        kind: 'results',
        event: { type: 'marginCall', subjectId: p.id, amount: m.sold },
      }),
    );
  }
  return { bankruptcyArticles, others };
}

const RELIABILITIES: readonly RumorReliability[] = ['faible', 'moyenne', 'élevée'];

/** Étiquette de fiabilité tirée selon ces poids (un seul tirage du RNG, comme avant). */
function reliabilityLabel(state: GameState, weights: Record<RumorReliability, number>): RumorReliability {
  return weightedPick(state, RELIABILITIES, (r) => weights[r]) ?? 'moyenne';
}

/**
 * Rumeurs du numéro : la vraie rumeur de la news programmée pour le tour suivant, plus 0 à 2 fausses.
 * L'origine de chaque rumeur (clé 'news:…' / 'fake:…') est gardée à part dans `state.rumorKeys` :
 * anti-répétition et lecture par les bots se font par identifiant, jamais par le texte (qui dépend de la langue).
 */
function publishRumors(state: GameState, issue: JournalIssue, used: Set<string>): void {
  const lang = langOf(state);
  const content = getContent(lang);
  const entries: { rumor: Rumor; key: string }[] = [];
  if (state.turn < state.config.totalTurns) {
    const forced = scheduleCryptoNews(state, state.turn + 1);
    const next = forced ? findCard(forced.cardId) : drawNews(state, state.turn + 1, used);
    if (next) {
      state.scheduledNews.push(forced ?? { turn: state.turn + 1, cardId: next.id });
      rememberNews(state, next.id);
      if (next.rumor) {
        const text = localizedCard(next, lang).rumor ?? next.rumor;
        entries.push({
          rumor: { text: rumorText(text, lang), reliability: reliabilityLabel(state, TRUE_RUMOR_RELIABILITY) },
          key: `news:${next.id}`,
        });
      }
    }
    // Les trois numéros précédents (le numéro en cours, encore sans rumeurs, est exclu).
    const previousIssues = state.journal.filter((j) => j !== issue).slice(-3);
    const previousKeys = new Set(previousIssues.flatMap((j) => state.rumorKeys?.[j.turn] ?? []));
    // Parties antérieures aux clés : repli sur le texte.
    const previousTexts = new Set(previousIssues.filter((j) => !state.rumorKeys?.[j.turn]).flatMap((j) => j.rumors.map((r) => r.text)));
    const fakeText = (id: string, fallback: string) => content.fakeRumors.find((f) => f.id === id)?.text ?? fallback;
    const pool = FAKE_RUMORS.filter((f) => !previousKeys.has(`fake:${f.id}`) && !previousTexts.has(rumorText(fakeText(f.id, f.text), lang)));
    const candidates = pool.length > 0 ? pool : [...FAKE_RUMORS];
    const nFake = Math.min(int(state, 0, 2), candidates.length);
    for (let i = 0; i < nFake; i++) {
      const f = pick(state, candidates);
      if (!f) break;
      candidates.splice(candidates.indexOf(f), 1);
      const rel = reliabilityLabel(state, FAKE_RUMOR_RELIABILITY);
      entries.push({ rumor: { text: rumorText(fakeText(f.id, f.text), lang), reliability: rel }, key: `fake:${f.id}` });
    }
  }
  shuffle(state, entries);
  issue.rumors = entries.map((e) => e.rumor);
  state.rumorKeys ??= {};
  state.rumorKeys[issue.turn] = entries.map((e) => e.key);
}

const LAND_QUOTE_PRIORITY: Record<LandSituation, number> = { lostToHuman: 5, overpaid: 4, fallback: 3, won: 2, lostToBot: 1 };

/** Last-close land quips: private outcomes select the situation, only public awards fill the text. */
function hexLandQuote(state: GameState): Article | undefined {
  const lang = langOf(state);
  const ref = getContent('fr').bots;
  const candidates = new Map<Id, {
    p: PlayerState;
    company: CompanyState;
    personality: BotPersonality;
    situation: LandSituation;
    award: HexAuctionResult;
  }>();
  for (const bid of state.hexBids ?? []) {
    if (!bid.result || bid.turn !== state.turn - 1) continue;
    const p = getOwn(state.players, bid.playerId);
    const company = getOwn(state.companies, bid.companyId);
    const personality = p?.isBot ? ref.find((b) => b.id === p.botPersonalityId) : undefined;
    if (!p || !company || !personality?.landQuotes) continue;

    let situation: LandSituation;
    let award: HexAuctionResult | undefined;
    switch (bid.result.outcome) {
      case 'won': {
        const hexId = bid.result.hexId ?? bid.hexId;
        award = state.hexAuctionResults?.find((a) => a.hexId === hexId && a.companyId === company.id
          && a.playerId === p.id && !a.fallback);
        if (!award) continue;
        situation = award.price >= 1.5 * hexReservePrice(hexId) ? 'overpaid' : 'won';
        break;
      }
      case 'fallback': {
        // The lost target is public only when a direct award was actually paid there.
        award = state.hexAuctionResults?.find((a) => a.hexId === bid.hexId && !a.fallback);
        if (!award) continue;
        situation = 'fallback';
        break;
      }
      case 'lost':
      case 'abandoned': {
        award = state.hexAuctionResults?.find((a) => a.hexId === bid.hexId && !a.fallback);
        const winner = award ? getOwn(state.players, award.playerId) : undefined;
        if (!award || !winner) continue;
        situation = winner.isBot ? 'lostToBot' : 'lostToHuman';
        break;
      }
      default:
        // Failed bids are private, and never supply a public quote.
        continue;
    }
    if (!personality.landQuotes[situation].length) continue;
    const previous = candidates.get(p.id);
    if (!previous || LAND_QUOTE_PRIORITY[situation] > LAND_QUOTE_PRIORITY[previous.situation]) {
      candidates.set(p.id, { p, company, personality, situation, award });
    }
  }
  const picked = flavor(state, [...candidates.values()].sort((a, b) => a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0), 'quote:hex:who');
  if (!picked) return undefined;
  const { p, company, personality, situation, award } = picked;
  const local = getContent(lang).bots.find((b) => b.id === personality.id);
  const localLines = local?.landQuotes?.[situation];
  const lines = localLines && localLines.length > 0 ? localLines : personality.landQuotes![situation];
  const text = flavor(state, lines, `quote:hex:${p.id}`);
  if (!text) return undefined;
  const winner = getOwn(state.companies, award.companyId);
  if (!winner) return undefined;
  const T = tr(state);
  const vars = { hex: hexPlaceName(award.hexId, lang, state.siteSlots), price: T.money(award.price), winner: winner.name, company: company.name, bidders: String(award.bidders) };
  return makeArticle(state, { title: fillTemplate(text, vars, lang), body: T.quoteByline(p.name, company.name), tone: 'neutral', kind: 'quote' });
}

/**
 * Citation d'un bot. Le choix (qui parle, y a-t-il une citation) se fait sur le contenu de référence :
 * le nombre d'articles, donc les identifiants, ne dépend pas de la langue. Seul le texte est traduit.
 */
function quoteArticle(state: GameState): Article | undefined {
  if (isSpatialMap(state.config)) {
    const landQuote = hexLandQuote(state);
    if (landQuote) return landQuote;
  }
  const T = tr(state);
  const ref = getContent('fr').bots;
  const local = getContent(langOf(state)).bots;
  const say = (id: string) => {
    const r = ref.find((b) => b.id === id);
    const l = local.find((b) => b.id === id) ?? r;
    return l && l.quotes.length > 0 ? l : r;
  };
  const inGame = Object.values(state.players)
    .filter((p) => p.isBot)
    .map((p) => ({ p, pers: ref.find((b) => b.id === p.botPersonalityId) }))
    .filter((x) => x.pers && x.pers.quotes.length > 0);
  if (inGame.length > 0) {
    const pickOne = flavor(state, inGame, 'quote:who');
    if (!pickOne || !pickOne.pers) return undefined;
    const pers = say(pickOne.pers.id) ?? pickOne.pers;
    const text = flavor(state, pers.quotes, `quote:${pickOne.p.id}`);
    if (!text) return undefined;
    return makeArticle(state, { title: text, body: T.quoteByline(pickOne.p.name, pers.companyName), tone: 'neutral', kind: 'quote' });
  }
  const refPers = flavor(state, ref.filter((b) => b.quotes.length > 0), 'quote:any');
  const pers = refPers ? (say(refPers.id) ?? refPers) : undefined;
  const text = pers ? flavor(state, pers.quotes, `quote:${pers.id}`) : undefined;
  return pers && text ? makeArticle(state, { title: text, body: T.quoteByline(pers.ceoName, pers.companyName), tone: 'neutral', kind: 'quote' }) : undefined;
}

/**
 * Démarre le tour `state.turn` : remise à zéro des compteurs, numéro du journal (une, résultats, brèves,
 * édito, citation, rumeurs), application des news, puis actions des bots et du pilote automatique.
 */
export function startTurn(state: GameState, log: TurnLog | null): void {
  const T = tr(state);
  const lang = langOf(state);
  for (const c of Object.values(state.companies)) c.turnFlags = { bonusTaken: 0, buybackDone: false, shadyDone: [], borrowed: 0 };
  for (const p of Object.values(state.players)) p.ready = false;
  // Registre des ventes d'actions : seuls le trimestre écoulé et le courant servent au délit d'initié crypto.
  if (state.shareSales) state.shareSales = state.shareSales.filter((s) => s.turn >= state.turn - 1);
  // Même fenêtre pour les rachats qui viennent en déduction des ventes.
  if (state.shareBuys) state.shareBuys = state.shareBuys.filter((s) => s.turn >= state.turn - 1);

  const issue: JournalIssue = {
    turn: state.turn,
    dateLabel: dateLabel(state.turn, state.config.startYear, lang),
    articles: [],
    rumors: [],
  };
  state.journal.push(issue);

  // News principale (programmée au tour précédent, sinon tirée maintenant)
  const scheduled = state.scheduledNews.find((s) => s.turn === state.turn);
  state.scheduledNews = state.scheduledNews.filter((s) => s.turn > state.turn);
  const used = new Set<string>();
  let mainCard = scheduled ? findCard(scheduled.cardId) : undefined;
  if (mainCard && ordinaryCryptoDirection(mainCard) > 0 && cryptoCrashActive(state)) mainCard = undefined;
  // Une cible locale peut disparaître entre rumeur et publication ; la programmation classique reste inchangée.
  if (mainCard?.effects.some((e) => e.type === 'terrain' || e.type === 'heat') && !cardHasTarget(state, mainCard)) mainCard = undefined;
  if (!mainCard) mainCard = drawNews(state, state.turn, used);
  let main: Article | undefined;
  let insiderBriefs: Article[] = [];
  if (mainCard) {
    used.add(mainCard.id);
    rememberNews(state, mainCard.id);
    main = applyNewsCard(state, preparedCryptoCard(state, mainCard, scheduled), 'headline');
    // Krach crypto : les dirigeants qui ont liquidé leur ligne le trimestre précédent font les brèves.
    insiderBriefs = cryptoInsiderSaleBriefs(state, mainCard.id);
  }

  // Brèves : 1 à 2 news secondaires
  const breves: Article[] = [];
  // A promised negative headline retains its true rumor; the forced signal waits for a compatible issue.
  const euphoria = mainCard && ordinaryCryptoDirection(mainCard) < 0 ? undefined : cryptoEuphoriaNews(state);
  const euphoriaCard = euphoria ? findCard(euphoria.cardId) : undefined;
  if (euphoriaCard) {
    used.add(euphoriaCard.id);
    rememberNews(state, euphoriaCard.id);
    breves.push(applyNewsCard(state, preparedCryptoCard(state, euphoriaCard, euphoria), 'news'));
  }
  const nBreves = int(state, 1, 2);
  for (let i = 0; i < nBreves; i++) {
    const card = drawNews(state, state.turn, used);
    if (!card) break;
    used.add(card.id);
    rememberNews(state, card.id);
    breves.push(applyNewsCard(state, card, 'news'));
  }

  // Résultats de la résolution précédente ; une faillite vole la une.
  const results = log ? buildResultArticles(state, log) : { bankruptcyArticles: [], others: [] };
  const [firstBankruptcy, ...otherBankruptcies] = results.bankruptcyArticles;
  if (firstBankruptcy) {
    firstBankruptcy.kind = 'headline';
    issue.articles.push(firstBankruptcy);
    if (main) {
      main.kind = 'news';
      issue.articles.push(main);
    }
  } else if (main) {
    issue.articles.push(main);
  } else {
    const promoted = results.others.shift();
    if (promoted) {
      promoted.kind = 'headline';
      issue.articles.push(promoted);
    } else {
      issue.articles.push(
        makeArticle(state, { title: T.calmTitle, body: body(state, 'noNews'), tone: 'neutral', kind: 'headline' }),
      );
    }
  }
  issue.articles.push(...otherBankruptcies, ...results.others, ...breves, ...insiderBriefs);

  // Citation d'un bot, puis l'édito (phrase d'ouverture) présenté comme une citation de la rédaction.
  // Convention des articles 'quote' : title = texte cité, body = auteur.
  const quote = quoteArticle(state);
  if (quote) issue.articles.push(quote);
  const focus: SectorId =
    (main?.sectorIds?.[0] as SectorId | undefined) ??
    (breves.find((b) => b.sectorIds && b.sectorIds.length > 0)?.sectorIds?.[0] as SectorId | undefined) ??
    SECTOR_IDS[(state.turn - 1) % SECTOR_IDS.length];
  issue.articles.push(
    makeArticle(state, {
      title: headlineText(state, 'quarterIntro', { sector: getContent(lang).sectors[focus].name }),
      body: T.editorialist,
      tone: 'neutral',
      kind: 'quote',
      sectorIds: [focus],
    }),
  );

  publishRumors(state, issue, used);

  runBots(state);
}
