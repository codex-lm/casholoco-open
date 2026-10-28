/**
 * Musique et ponctuations du jeu (docs/AUDIO_BRIEF.md, sources et traitements dans docs/AUDIO_CREDITS.csv) : les
 * fichiers vivent dans public/audio. Ce module est pur : quelle musique pour quel écran, quelles ponctuations pour
 * quelle nouvelle vue. Le lecteur (director.ts) s'occupe du navigateur.
 */
import type { Article, ArticleEventType, Id, LobbyView, PlayerView } from '@muchomoney/core';

/** Musiques de fond (public/audio/music). */
export const MUSIC_IDS = [
  'menu_theme',
  'lobby_hold',
  'early_lounge',
  'early_lofi',
  'early_bossa',
  'early_stock',
  'early_swing',
  'mid_funk',
  'mid_trading_floor',
  'mid_spy_lounge',
  'mid_electroswing',
  'mid_soul_jazz',
  'mid_exotica',
  'late_noir',
  'late_heist',
  'late_ostinato',
  'late_dark_spy',
  'late_lofi_blues',
  'final_quarter',
  'results_gala',
] as const;
export type MusicId = (typeof MUSIC_IDS)[number];

/** Ponctuations, fanfares de fin et jingle (public/audio/sting) : quelques secondes, par-dessus la musique. */
export const STING_IDS = [
  'jingle_crooner',
  'sting_journal',
  'sting_profit',
  'sting_loss',
  'sting_takeover',
  'sting_bankruptcy',
  'sting_scandal',
  'sting_auction',
  'sting_launch',
  'sting_police',
  'sting_bonus',
  'sting_margin_call',
  'sting_whistleblower',
  'sting_merger',
  'sting_startup',
  'victory_fanfare',
  'defeat_jingle',
] as const;
export type StingId = (typeof STING_IDS)[number];

export const musicUrl = (id: MusicId): string => `${import.meta.env.BASE_URL}audio/music/${id}.mp3`;
export const stingUrl = (id: StingId): string => `${import.meta.env.BASE_URL}audio/sting/${id}.mp3`;

/** Phase de la partie : premier tiers, milieu, dernier tiers, puis le dernier trimestre à part. */
export type GamePhase = 'early' | 'mid' | 'late' | 'final';

export function gamePhase(turn: number, totalTurns: number): GamePhase {
  if (turn >= totalTurns) return 'final';
  const third = Math.ceil((Math.max(1, turn) * 3) / Math.max(1, totalTurns - 1));
  return third <= 1 ? 'early' : third === 2 ? 'mid' : 'late';
}

/** Ce qu'on écoute : un écran hors partie, ou une phase de la partie. */
export type MusicContext = 'home' | 'lobby' | 'end' | GamePhase;

/** Morceaux de chaque contexte : joués dans le désordre, enchaînés en fondu ; un seul morceau tourne en boucle. */
export const PLAYLISTS: Record<MusicContext, readonly MusicId[]> = {
  home: ['menu_theme'],
  lobby: ['lobby_hold'],
  end: ['results_gala'],
  early: ['early_lounge', 'early_lofi', 'early_bossa', 'early_stock', 'early_swing'],
  mid: ['mid_funk', 'mid_trading_floor', 'mid_spy_lounge', 'mid_electroswing', 'mid_soul_jazz', 'mid_exotica'],
  late: ['late_noir', 'late_heist', 'late_ostinato', 'late_dark_spy', 'late_lofi_blues'],
  final: ['final_quarter'],
};

/** Contexte musical de l'écran affiché (même aiguillage qu'App.tsx). */
export function musicContext(view: PlayerView | null, lobby: LobbyView | null): MusicContext {
  if (view) {
    if (view.phase === 'finished') return 'end';
    const takeover = view.players.find((p) => p.id === view.you)?.botTakeover;
    // Reprise d'un bot : on attend le trimestre suivant, en musique d'attente.
    if (takeover && takeover.activeFromTurn > view.turn) return 'lobby';
    return gamePhase(view.turn, view.config.totalTurns);
  }
  return lobby ? 'lobby' : 'home';
}

/**
 * Ponctuation de chaque événement du journal, quand il concerne le joueur (null : pas de son, le toast suffit).
 * Record exhaustif : un nouveau type d'événement oblige à trancher ici.
 */
export const EVENT_STINGS: Record<ArticleEventType, StingId | null> = {
  takeover: 'sting_takeover',
  controlHandover: 'sting_takeover',
  autopilot: null,
  stakeBuilding: null,
  insiderBuying: 'sting_scandal',
  insiderSale: 'sting_scandal',
  startup: 'sting_startup',
  whistleblow: 'sting_whistleblower',
  productLaunch: 'sting_launch',
  dividend: 'sting_profit',
  ceoBonus: 'sting_bonus',
  buyback: null,
  poisonPill: null,
  merger: 'sting_merger',
  bigProfit: 'sting_profit',
  bigLoss: 'sting_loss',
  bankruptcy: 'sting_bankruptcy',
  scandal: 'sting_scandal',
  marginCall: 'sting_margin_call',
  rumorLeak: 'sting_whistleblower',
  siteOpened: 'sting_auction',
  blockSale: null,
  cartelBusted: 'sting_police',
};

/** Ordre de priorité quand plusieurs événements tombent ensemble : le plus grave d'abord. */
const PRIORITY: readonly StingId[] = [
  'sting_bankruptcy',
  'sting_takeover',
  'sting_police',
  'sting_margin_call',
  'sting_scandal',
  'sting_whistleblower',
  'sting_merger',
  'sting_auction',
  'sting_launch',
  'sting_startup',
  'sting_bonus',
  'sting_loss',
  'sting_profit',
];

/** L'événement regarde-t-il ce joueur : il agit, il subit, il dirige l'entreprise nommée ? */
function concerns(article: Article, me: Id, myCompanies: ReadonlySet<Id>): boolean {
  const e = article.event;
  if (!e) return false;
  if (e.actorId === me || e.subjectId === me || e.leaderId === me || e.leaderIds?.includes(me)) return true;
  return (article.companyIds ?? []).some((id) => myCompanies.has(id));
}

/**
 * Ponctuations à jouer quand une nouvelle vue arrive, dans l'ordre (au plus deux) :
 * - début de partie (première vue au sortir du salon) : le jingle ;
 * - fin de partie : fanfare si le joueur finit premier, trombone triste sinon ;
 * - nouveau trimestre : la ponctuation du journal ;
 * - puis l'événement le plus grave parmi les nouveaux articles qui le concernent.
 */
export function stingsFor(prev: PlayerView | null, next: PlayerView, fromLobby: boolean): StingId[] {
  if (!prev) return fromLobby && next.phase === 'playing' ? ['jingle_crooner'] : [];
  const me = next.you;
  if (prev.phase === 'playing' && next.phase === 'finished') {
    const first = next.results?.ranking[0]?.playerId;
    return [first === me ? 'victory_fanfare' : 'defeat_jingle'];
  }
  const out: StingId[] = [];
  if (next.turn > prev.turn) out.push('sting_journal');
  // Entreprises dirigées avant ou après la vue : une OPA subie compte encore comme « la mienne ».
  const mine = new Set<Id>();
  for (const v of [prev, next]) for (const c of v.companies) if (c.controllerId === me) mine.add(c.id);
  const seen = new Set<Id>();
  for (const issue of prev.journal) for (const a of issue.articles) seen.add(a.id);
  let best: StingId | null = null;
  for (const issue of next.journal) {
    for (const a of issue.articles) {
      if (seen.has(a.id) || !a.event || !concerns(a, me, mine)) continue;
      const s = EVENT_STINGS[a.event.type];
      if (s && (best === null || PRIORITY.indexOf(s) < PRIORITY.indexOf(best))) best = s;
    }
  }
  if (best) out.push(best);
  return out;
}
