/**
 * Chronologie de la partie (§12) : les événements marquants, tirés des numéros du journal.
 *
 * Chaque flash « Dernière minute » et chaque article de résultats porte ses données structurées
 * (`Article.event` : qui agit, qui subit, montant, part du capital), identiques dans toutes les langues.
 * La chronologie les remet en phrases claires dans la langue de l'interface ; le titre satirique du
 * journal, dans la langue du salon, reste affiché à côté. Rien ici n'est secret : ce sont les nouvelles
 * publiées, que tous les joueurs reçoivent (le lanceur d'alerte n'y est jamais nommé).
 */
import { dateLabel, type Article, type ArticleEvent, type ArticleEventType, type CommodityId, type Id, type PlayerView, type PublicPlayer, type SectorId } from '@muchomoney/core';
import type { Messages } from '../../../i18n';

export type EventWeight = 1 | 2 | 3;

export const EVENT_ICON: Record<ArticleEventType, string> = {
  takeover: '⚔️',
  controlHandover: '🔑',
  autopilot: '🤖',
  stakeBuilding: '🎯',
  insiderBuying: '🕵️',
  insiderSale: '🕵️',
  startup: '🚀',
  whistleblow: '📣',
  productLaunch: '✨',
  dividend: '💰',
  ceoBonus: '💼',
  buyback: '🔄',
  poisonPill: '💊',
  merger: '🤝',
  bigProfit: '📈',
  bigLoss: '📉',
  bankruptcy: '💥',
  scandal: '🔥',
  marginCall: '📞',
  rumorLeak: '✉️',
  siteOpened: '🏗️',
  blockSale: '📑',
  cartelBusted: '⚖️',
};

/** Importance : 3 = change qui dirige quoi (ou ruine quelqu'un), 2 = coup notable, 1 = routine du trimestre. */
export const EVENT_WEIGHT: Record<ArticleEventType, EventWeight> = {
  takeover: 3,
  controlHandover: 3,
  autopilot: 3,
  bankruptcy: 3,
  merger: 3,
  startup: 3,
  marginCall: 3,
  stakeBuilding: 2,
  insiderBuying: 2,
  insiderSale: 2,
  whistleblow: 2,
  scandal: 2,
  poisonPill: 2,
  productLaunch: 2,
  dividend: 1,
  ceoBonus: 1,
  buyback: 1,
  bigProfit: 1,
  bigLoss: 1,
  rumorLeak: 2,
  siteOpened: 2,
  blockSale: 3,
  cartelBusted: 3,
};

/**
 * Familles à cocher. Par défaut, la chronologie du journal montre ce qui change la partie (rachats,
 * créations, faillites) et les scandales ; les lancements et l'argent, fréquents, sont en option.
 */
export type EventFamily = 'control' | 'scandals' | 'products' | 'money';

export const FAMILIES: readonly EventFamily[] = ['control', 'scandals', 'products', 'money'];
export const DEFAULT_FAMILIES: readonly EventFamily[] = ['control', 'scandals'];

export const FAMILY_ICON: Record<EventFamily, string> = { control: '⚔️', scandals: '🔥', products: '✨', money: '💰' };

export const EVENT_FAMILY: Record<ArticleEventType, EventFamily> = {
  takeover: 'control',
  stakeBuilding: 'control',
  controlHandover: 'control',
  autopilot: 'control',
  poisonPill: 'control',
  merger: 'control',
  startup: 'control',
  bankruptcy: 'control',
  marginCall: 'control',
  scandal: 'scandals',
  whistleblow: 'scandals',
  insiderBuying: 'scandals',
  insiderSale: 'scandals',
  ceoBonus: 'scandals',
  rumorLeak: 'scandals',
  cartelBusted: 'scandals',
  siteOpened: 'products',
  blockSale: 'control',
  productLaunch: 'products',
  dividend: 'money',
  buyback: 'money',
  bigProfit: 'money',
  bigLoss: 'money',
};

/**
 * Résultats d'un trimestre (paraissent au numéro suivant, après une éventuelle faillite ou passation de la
 * résolution) : ils sont datés du trimestre qu'ils closent (`issue.turn − 1`) et désignent eux-mêmes le
 * dirigeant de l'époque (`leaderId`, ou `subjectId`/`actorId` pour une faillite, un appel de marge, une
 * filiale), sans passer par la reconstitution.
 */
export const RESULT_TYPES: readonly ArticleEventType[] = [
  'bigProfit',
  'bigLoss',
  'bankruptcy',
  'scandal',
  'cartelBusted',
  'siteOpened',
  'marginCall',
];

/** Événements qui retirent une entreprise à son dirigeant. */
export const LOSS_TYPES: readonly ArticleEventType[] = ['takeover', 'bankruptcy', 'controlHandover', 'autopilot'];

/**
 * Ce qui relie le joueur à l'événement : il agit, il le subit, ou l'événement touche une entreprise
 * qu'il dirigeait à ce moment-là.
 */
export type EventRole = 'actor' | 'subject' | 'company';

export interface TimelineEntry {
  /** Trimestre du numéro qui rapporte l'événement (les résultats d'un trimestre paraissent au suivant). */
  turn: number;
  /** Trimestre où l'événement s'est produit : le précédent pour les résultats, celui du numéro sinon. */
  quarter: number;
  dateLabel: string;
  article: Article;
  event: ArticleEvent;
  weight: EventWeight;
  /** Lien avec le joueur qui regarde (null : aucun). */
  role: EventRole | null;
  /**
   * Joueurs impliqués : qui agit, qui subit, et qui dirigeait les entreprises citées au moment des faits
   * (jamais le lanceur d'alerte, qui n'est pas nommé). Vide pour un événement purement PNJ.
   */
  players: Id[];
  /** Le principal : qui agit, sinon qui subit, sinon le dirigeant de l'époque (null : que des PNJ). */
  lead: Id | null;
}

export interface TimelineFilter {
  families: readonly EventFamily[];
  /** Seulement ce qui concerne le joueur qui regarde. */
  mineOnly: boolean;
}

/**
 * Qui dirigeait l'entreprise juste avant l'événement, à partir de qui la dirige juste après.
 * Tous les changements de contrôle du moteur publient un article (§6.3, §7) : on les défait un à un,
 * du plus récent au plus ancien, en partant de l'état actuel (connu avec certitude).
 */
function undoControl(controller: Map<Id, Id | null>, e: ArticleEvent, ids: Id[]): void {
  const [id, second] = ids;
  if (!id) return;
  switch (e.type) {
    case 'takeover':
    case 'controlHandover':
    case 'autopilot':
    case 'bankruptcy':
      controller.set(id, e.subjectId ?? null);
      break;
    case 'startup':
      controller.set(id, null); // n'existait pas encore
      break;
    case 'merger':
      // On ne fusionne que deux entreprises que l'on dirige : l'absorbée avait le même dirigeant.
      if (second) controller.set(second, e.actorId ?? null);
      break;
    default:
      break;
  }
}

/** Trimestre où l'événement s'est produit (les résultats sont datés du trimestre qu'ils closent). */
export function quarterOf(entry: TimelineEntry): number {
  return eventQuarter(entry.event, entry.turn);
}

/** Le champ `quarter` n'existe pas encore dans le moteur ; le jour où il est publié, il fait foi. */
function eventQuarter(event: ArticleEvent, issueTurn: number): number {
  const declared = (event as { quarter?: number }).quarter;
  if (typeof declared === 'number') return declared;
  return RESULT_TYPES.includes(event.type) ? Math.max(1, issueTurn - 1) : issueTurn;
}

/** Tous les événements de la partie, dans l'ordre de parution, avec leur lien au joueur qui regarde. */
export function timelineEntries(view: PlayerView): TimelineEntry[] {
  const you = view.you;
  const found: { issue: PlayerView['journal'][number]; article: Article; event: ArticleEvent }[] = [];
  for (const issue of view.journal) {
    for (const article of issue.articles) if (article.event) found.push({ issue, article, event: article.event });
  }
  const controller = new Map<Id, Id | null>(view.companies.map((c) => [c.id, c.status === 'active' ? c.controllerId : null]));
  const out: TimelineEntry[] = new Array(found.length);
  for (let i = found.length - 1; i >= 0; i--) {
    const { issue, article, event } = found[i];
    const ids = article.companyIds ?? [];
    // `controller` décrit ici l'état juste après l'événement : les cas où il change sont couverts par actor/subject.
    const leaders = event.leaderIds ?? (event.leaderId !== undefined ? [event.leaderId] : []);
    const result = RESULT_TYPES.includes(event.type);
    const ran = result ? leaders.includes(you) : ids.some((id) => controller.get(id) === you);
    const role: EventRole | null = event.actorId === you ? 'actor' : event.subjectId === you ? 'subject' : ran ? 'company' : null;
    // Le lanceur d'alerte n'est jamais nommé : il ne va ni dans `players` ni dans `lead`.
    const named = event.type === 'whistleblow' ? undefined : event.actorId;
    const players = new Set<Id>();
    if (named) players.add(named);
    if (event.subjectId) players.add(event.subjectId);
    if (result) {
      for (const id of leaders) players.add(id);
    } else {
      for (const id of ids) {
        const boss = controller.get(id);
        if (boss) players.add(boss);
      }
    }
    const bossOf = (id: Id | undefined): Id | null => (id === undefined ? null : controller.get(id) ?? null);
    const lead = named ?? event.subjectId ?? leaders[0] ?? bossOf(ids[0]);
    out[i] = {
      turn: issue.turn,
      quarter: eventQuarter(event, issue.turn),
      dateLabel: issue.dateLabel,
      article,
      event,
      weight: EVENT_WEIGHT[event.type] ?? 1,
      role,
      players: [...players],
      lead,
    };
    undoControl(controller, event, ids);
  }
  return out;
}

export function filterEntries(entries: TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
  return entries.filter((e) => filter.families.includes(EVENT_FAMILY[e.event.type]) && (!filter.mineOnly || e.role !== null));
}

export interface Quarter {
  turn: number;
  /** « T3 2027 » (langue du salon, comme le journal). */
  label: string;
  /** Un numéro du journal existe pour ce trimestre. */
  hasIssue: boolean;
  future: boolean;
  current: boolean;
  entries: TimelineEntry[];
  mine: boolean;
}

/** Une colonne par trimestre de la partie (y compris ceux à venir), avec ses événements filtrés. */
export function quarters(view: PlayerView, entries: TimelineEntry[]): Quarter[] {
  const byQuarter = new Map<number, TimelineEntry[]>();
  for (const e of entries) {
    const list = byQuarter.get(e.quarter);
    if (list) list.push(e);
    else byQuarter.set(e.quarter, [e]);
  }
  const issues = new Map(view.journal.map((i) => [i.turn, i]));
  const last = Math.max(view.config.totalTurns, view.turn, ...view.journal.map((i) => i.turn));
  const out: Quarter[] = [];
  for (let turn = 1; turn <= last; turn++) {
    const list = byQuarter.get(turn) ?? [];
    out.push({
      turn,
      label: issues.get(turn)?.dateLabel ?? dateLabel(turn, view.config.startYear, view.config.lang ?? 'fr'),
      hasIssue: issues.has(turn),
      future: turn > view.turn,
      current: turn === view.turn,
      entries: list,
      mine: list.some((e) => e.role !== null),
    });
  }
  return out;
}

/**
 * Pictogrammes d'une colonne : les vôtres d'abord, puis les plus importants, au plus `max`, remis dans
 * l'ordre de parution. `more` compte les autres.
 */
export function stripIcons(entries: TimelineEntry[], max: number): { shown: TimelineEntry[]; more: number } {
  const ranked = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => Number(b.e.role !== null) - Number(a.e.role !== null) || b.e.weight - a.e.weight || a.i - b.i)
    .map(({ e }) => e);
  const shown = ranked.slice(0, max).sort((a, b) => entries.indexOf(a) - entries.indexOf(b));
  return { shown, more: Math.max(0, ranked.length - shown.length) };
}

/** Pertes subies (prise de contrôle, faillite, passation après avoir tout vendu), les plus récentes en dernier. */
export function losses(entries: TimelineEntry[]): TimelineEntry[] {
  return entries.filter((e) => e.role === 'subject' && LOSS_TYPES.includes(e.event.type));
}

/** Pertes du dernier trimestre où vous en avez subi (souvent une seule). */
export function lastLosses(entries: TimelineEntry[]): TimelineEntry[] {
  const all = losses(entries);
  const last = all.at(-1);
  return last ? all.filter((e) => e.quarter === last.quarter) : [];
}

/** Un badge sur une courbe : l'événement mis en avant, la courbe qui le porte, et ceux regroupés sous lui. */
export interface Pin {
  entry: TimelineEntry;
  /** Courbe qui porte le badge. */
  player: Id;
  quarter: number;
  /** Autres événements de la même courbe au même trimestre, regroupés sous ce badge (affichés « +n »). */
  overflow: TimelineEntry[];
}

export interface PinsResult {
  /** Sous 26 px de largeur de colonne, les badges deviennent de simples points. */
  mode: 'badges' | 'dots';
  /** Triés par trimestre ; dans une colonne, le plus prioritaire d'abord. */
  pins: Pin[];
}

/** Badges d'une colonne selon sa largeur : 3 dès 60 px, 2 dès 38 px, 1 en dessous. */
export function pinCap(colW: number): number {
  return colW >= 60 ? 3 : colW >= 38 ? 2 : 1;
}

/** Courbe(s) qui porte(nt) le badge d'un événement (§12, règles des repères). Vide : frise seule. */
function pinCurves(e: TimelineEntry, you: Id): Id[] {
  if (e.role !== null) return [you];
  const { event } = e;
  switch (event.type) {
    case 'takeover':
    case 'controlHandover':
    case 'blockSale':
      return event.actorId ? [event.actorId] : [];
    case 'autopilot':
    case 'bankruptcy':
    case 'marginCall':
      return event.subjectId ? [event.subjectId] : [];
    case 'bigProfit':
    case 'bigLoss':
    case 'scandal':
      return event.leaderId ? [event.leaderId] : [];
    case 'cartelBusted':
      return [...new Set(event.leaderIds ?? (event.leaderId !== undefined ? [event.leaderId] : []))];
    default:
      // `whistleblow` compris : le dirigeant de l'époque (`lead` exclut le lanceur d'alerte).
      return e.lead ? [e.lead] : [];
  }
}

/**
 * Repères sur les courbes (§12) : poids 3 dans les familles cochées, plus ce qui me concerne avec un poids ≥ 2
 * (tout ce qui me concerne avec « Seulement ce qui me concerne »). Au plus un badge par courbe et par trimestre
 * — priorité : mien, puis poids, puis plus récent, les autres comptés dans `overflow` — puis au plus
 * `pinCap(colW)` par colonne ; l'excédent reste dans la frise, qui liste tout.
 */
export function pinsFor(entries: TimelineEntry[], filter: TimelineFilter, you: Id, colW: number): PinsResult {
  const candidates: { entry: TimelineEntry; i: number; player: Id }[] = [];
  entries.forEach((entry, i) => {
    const mine = entry.role !== null;
    const eligible = filter.mineOnly
      ? mine
      : (entry.weight === 3 && filter.families.includes(EVENT_FAMILY[entry.event.type])) || (mine && entry.weight >= 2);
    if (!eligible) return;
    for (const player of pinCurves(entry, you)) candidates.push({ entry, i, player });
  });
  const byPriority = (a: (typeof candidates)[number], b: (typeof candidates)[number]) =>
    Number(b.entry.role !== null) - Number(a.entry.role !== null) || b.entry.weight - a.entry.weight || b.i - a.i;
  // Un badge par courbe et par trimestre.
  const byCurve = new Map<string, (typeof candidates)[number][]>();
  for (const c of candidates) {
    const key = `${c.entry.quarter}:${c.player}`;
    const list = byCurve.get(key);
    if (list) list.push(c);
    else byCurve.set(key, [c]);
  }
  // Puis K par colonne selon sa largeur ; l'excédent reste dans la frise.
  const pins: Pin[] = [];
  const byQuarter = new Map<number, { c: (typeof candidates)[number]; overflow: TimelineEntry[] }[]>();
  for (const list of byCurve.values()) {
    list.sort(byPriority);
    const [first, ...rest] = list;
    const group = { c: first, overflow: rest.map((c) => c.entry) };
    const column = byQuarter.get(first.entry.quarter);
    if (column) column.push(group);
    else byQuarter.set(first.entry.quarter, [group]);
  }
  for (const [quarter, column] of byQuarter) {
    column.sort((a, b) => byPriority(a.c, b.c));
    for (const { c, overflow } of column.slice(0, pinCap(colW))) pins.push({ entry: c.entry, player: c.player, quarter, overflow });
  }
  pins.sort((a, b) => a.quarter - b.quarter);
  return { mode: colW >= 26 ? 'badges' : 'dots', pins };
}

/**
 * Décalages horizontaux (px) quand des badges d'une même colonne se chevauchent : à moins de 18 px d'écart
 * vertical, on les écarte — ±11 pour deux, −20/0/+20 pour trois (au-delà, pas de 20 centré). Renvoie un
 * décalage par ordonnée fournie, dans le même ordre.
 */
export function fanOut(ys: readonly number[]): number[] {
  const offsets = new Array<number>(ys.length).fill(0);
  const sorted = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  let cluster: number[] = [];
  let prev = -Infinity;
  const flush = () => {
    const n = cluster.length;
    if (n > 1) cluster.forEach((i, k) => (offsets[i] = n === 2 ? (k === 0 ? -11 : 11) : (k - (n - 1) / 2) * 20));
    cluster = [];
  };
  for (const { y, i } of sorted) {
    if (y - prev >= 18) flush();
    cluster.push(i);
    prev = y;
  }
  flush();
  return offsets;
}

/** Nom d'un joueur tel qu'il était au moment de l'événement (un bot repris par un humain gardait son ancien nom). */
export function nameAt(player: PublicPlayer | undefined, turn: number): string | undefined {
  if (!player) return undefined;
  if (player.botTakeover && turn < player.botTakeover.activeFromTurn) return player.botTakeover.previousName;
  return player.name;
}

export interface LineDeps {
  h: Messages['history'];
  player: (id: Id | undefined) => string;
  company: (id: Id | undefined) => string;
  product: (id: Id | undefined) => string | undefined;
  /** Nom du secteur dans la langue de l'interface (produit retiré depuis : on n'a plus son nom). */
  sector: (id: SectorId | undefined) => string;
  money: (k: number) => string;
  pct: (ratio: number) => string;
}

/** Phrase claire d'un événement (langue de l'interface), et au besoin une précision (parachute). */
export function eventText(entry: TimelineEntry, d: LineDeps): { line: string; extra?: string } {
  const { event: e, article, role } = entry;
  const L = d.h.lines;
  const byMe = role === 'actor';
  const toMe = role === 'subject';
  const actor = d.player(e.actorId);
  const subject = d.player(e.subjectId);
  const company = d.company(article.companyIds?.[0]);
  const amount = d.money(e.amount ?? 0);
  const pct = d.pct(e.pct ?? 0);
  switch (e.type) {
    case 'takeover': {
      const paid = (e.amount ?? 0) > 0;
      if (toMe) return { line: L.takeoverOfMe(actor, company, pct), extra: paid ? L.myParachute(amount) : L.myNoParachute };
      const extra = e.subjectId ? (paid ? L.leaves(subject, amount) : L.leavesBroke(subject)) : undefined;
      return { line: byMe ? L.takeoverByMe(company, pct) : L.takeover(actor, company, pct), extra };
    }
    case 'controlHandover':
      if (toMe) return { line: L.controlHandoverMe(actor, company) };
      return { line: byMe ? L.controlHandoverToMe(subject, company) : L.controlHandover(actor, subject, company) };
    case 'autopilot':
      return { line: toMe ? L.autopilotMe(company) : L.autopilot(subject, company) };
    case 'stakeBuilding':
      return { line: byMe ? L.stakeBuildingMe(pct, company) : L.stakeBuilding(actor, pct, company) };
    case 'insiderBuying':
      return { line: byMe ? L.insiderBuyingMe(pct, company) : L.insiderBuying(actor, pct, company) };
    case 'startup':
      return { line: byMe ? L.startupMe(company) : L.startup(actor, company) };
    case 'whistleblow':
      return { line: L.whistleblow(company) };
    case 'productLaunch': {
      const product = d.product(e.productId);
      return { line: product ? L.productLaunch(company, product) : L.productLaunchUnnamed(company, d.sector(article.sectorIds?.[0])) };
    }
    case 'dividend':
      return { line: L.dividend(company, amount) };
    case 'ceoBonus':
      return { line: byMe ? L.ceoBonusMe(amount, company) : L.ceoBonus(actor, amount, company) };
    case 'buyback':
      return { line: L.buyback(company, amount) };
    case 'poisonPill':
      return { line: L.poisonPill(company) };
    case 'merger':
      return { line: L.merger(company, d.company(article.companyIds?.[1])) };
    case 'bigProfit':
      return { line: L.bigProfit(company, amount) };
    case 'bigLoss':
      return { line: L.bigLoss(company, amount) };
    case 'bankruptcy':
      return { line: toMe ? L.bankruptcyMe(company) : L.bankruptcy(company) };
    case 'scandal':
      return { line: L.scandal(company, amount) };
    case 'marginCall':
      // Le cash a pu suffire à rembourser : aucune action vendue.
      if (!((e.amount ?? 0) > 0)) return { line: toMe ? L.marginCallCashMe : L.marginCallCash(subject) };
      return { line: toMe ? L.marginCallMe(amount) : L.marginCall(subject, amount) };
    case 'rumorLeak':
      return { line: byMe ? L.rumorLeakMe : L.rumorLeak(actor) };
    case 'siteOpened':
      return { line: L.siteOpened(company, d.h.siteNames[e.commodityId as CommodityId] ?? '?') };
    case 'blockSale':
      if (byMe) return { line: L.blockSaleByMe(pct, company, subject, amount) };
      if (toMe) return { line: L.blockSaleOfMe(actor, pct, company, amount) };
      return { line: L.blockSale(actor, pct, company, subject, amount) };
    case 'cartelBusted': {
      const names = (article.companyIds ?? []).map((id) => d.company(id)).join(', ');
      return { line: role ? L.cartelBustedMe(names, amount) : L.cartelBusted(names, amount) };
    }
    default:
      return { line: article.title };
  }
}
