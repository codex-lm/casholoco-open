/**
 * Banc d'essai d'équilibrage de muchomoney (audit « easy to learn, hard to master »).
 *
 * - Les stratégies scriptées jouent des humains (isBot: false) et ne voient QUE getPlayerView().
 * - Elles agissent via api.act(action) → applyAction (mêmes validations que le serveur).
 * - Ordre d'un tour : les bots ont déjà agi (dans createGame pour T1, dans resolveTurn pour la suite),
 *   puis chaque stratégie joue une fois (ordre des sièges tourné à chaque tour), puis résolution.
 * - Aucun Math.random : chaque joueur scripté a son RNG mulberry32 dérivé de (graine, siège, nom).
 *
 * Usage rapide : voir README.md du même dossier. Autotest : `tsx harness.ts` (20 parties passive vs random + 3 bots).
 */
import {
  createGame,
  applyAction,
  getPlayerView,
  netWorth,
  getContent,
  PLAYER_COLORS,
  SECTOR_IDS,
  type Action,
  type ActionResult,
  type GameState,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
  type Lang,
  type CompanyView,
  type ShadyKind,
  SHADY_KINDS,
  COMMODITY_IDS,
} from '../../packages/core/src/index';
import { resolveTurnWithLog } from '../../packages/core/src/sim/resolve';

// ---------------------------------------------------------------------------
// RNG des stratégies (indépendant du RNG de la partie)
// ---------------------------------------------------------------------------

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export interface StrategyApi {
  /** Applique une action pour CE joueur (applyAction). Journalisée. */
  act(a: Action): ActionResult;
  /** Vue fraîche après des actions (la vue passée à act() n'est pas mise à jour en place). */
  view(): PlayerView;
}

export interface StrategyCtx {
  /** Uniforme [0,1), reproductible (graine de partie × siège × nom de stratégie). */
  rng(): number;
  /** Mémoire propre au joueur, persistante sur toute la partie (vierge à chaque partie). */
  memory: any;
  seat: number;
  seed: number;
}

export interface Strategy {
  name: string;
  /** Niveau revendiqué : 'baseline' | 'novice' | 'intermediate' | 'expert'… (libre, sert au rapport). */
  tier: string;
  /** Secteur de départ. Sans cette fonction : secteur du siège (tourné selon la graine). */
  pickSector?(info: { seat: number; seed: number; defaultSector: SectorId }): SectorId;
  act(view: PlayerView, api: StrategyApi, ctx: StrategyCtx): void;
}

export interface PlayerResult {
  playerId: string;
  name: string;
  strategy: string; // nom de stratégie, ou 'bot:<personnalité>'
  tier: string;
  isBot: boolean;
  seat: number; // -1 pour les bots
  sector: SectorId;
  rank: number; // 1 = gagnant (bots compris)
  netWorth: number;
  netWorthHistory: number[];
  stats: {
    takeoversWon: number;
    takeoversSuffered: number;
    scandals: number;
    bankruptcies: number;
    marginCalls: number;
    productionCuts: number; // clôtures où une entreprise qu'il contrôlait a produit moins que prévu, faute de trésorerie
    startups: number;
    shadyActions: number;
    finesPaid: number;
    parachutes: number;
    dividendsReceived: number;
    bonusesTaken: number;
    actionsOk: number;
    actionsRefused: number;
    controlledAtEnd: number; // entreprises actives contrôlées en fin de partie
  };
}

export interface GameResult {
  seed: number;
  turns: number;
  ranking: PlayerResult[]; // trié par rang
  log: string[]; // log compact d'actions des joueurs scriptés + événements de résolution
  state?: GameState; // si keepState
}

export interface RunGameOptions {
  seed: number;
  players: { strategy: Strategy; sector?: SectorId }[];
  bots?: number;
  turns?: number;
  lang?: Lang;
  /** Décalage de rotation des personnalités de bots (défaut : seed). */
  botOffset?: number;
  /** Conserver l'état final dans le résultat (mémoire). */
  keepState?: boolean;
  /** Journaliser les actions (défaut true). */
  log?: boolean;
  /** Lève une exception si une stratégie jette (défaut false : l'erreur est journalisée, le joueur passe son tour). */
  strict?: boolean;
}

// ---------------------------------------------------------------------------
// runGame
// ---------------------------------------------------------------------------

function short(a: Action): string {
  const o = { ...(a as any) };
  const t = o.type;
  delete o.type;
  const parts = Object.entries(o).map(([k, v]) => `${k}=${typeof v === 'number' ? +(+v).toFixed(1) : v}`);
  return `${t}(${parts.join(',')})`;
}

export function runGame(opts: RunGameOptions): GameResult {
  const { seed, players, bots = 3, turns = 16, lang = 'fr', keepState = false } = opts;
  const doLog = opts.log !== false;
  const content = getContent(lang);
  const personalities = content.bots;
  const botOffset = opts.botOffset ?? seed;

  const lobby: LobbyPlayer[] = [];
  const seatInfo: { id: string; strategy: Strategy; seat: number; sector: SectorId }[] = [];
  players.forEach((p, seat) => {
    const defaultSector = p.sector ?? SECTOR_IDS[(seed + seat) % SECTOR_IDS.length];
    const sector = p.strategy.pickSector ? p.strategy.pickSector({ seat, seed, defaultSector }) : defaultSector;
    const id = `h${seat}`;
    seatInfo.push({ id, strategy: p.strategy, seat, sector });
    lobby.push({
      id,
      name: `${p.strategy.name}#${seat}`,
      isBot: false,
      companyName: `${p.strategy.name} Corp ${seat}`,
      sectorId: sector,
      connected: true,
      color: PLAYER_COLORS[seat % PLAYER_COLORS.length],
    });
  });
  for (let i = 0; i < bots; i++) {
    const pers = personalities[(botOffset + i) % personalities.length];
    const dup = i >= personalities.length ? ` ${Math.floor(i / personalities.length) + 1}` : '';
    lobby.push({
      id: `bot${i}`,
      name: `${pers.ceoName}${dup}`,
      isBot: true,
      botPersonalityId: pers.id,
      companyName: `${pers.companyName}${dup}`,
      sectorId: pers.preferredSectors[0] ?? 'energy_drinks',
      connected: true,
      color: PLAYER_COLORS[(players.length + i) % PLAYER_COLORS.length],
    });
  }

  const state = createGame({ totalTurns: turns, turnSeconds: 90, startYear: 2027, seed, lang, ...(process.env.BOT_LEVEL === 'intern' || process.env.BOT_LEVEL === 'expert' ? { botLevel: process.env.BOT_LEVEL } : {}) }, lobby);

  const log: string[] = [];
  const ok: Record<string, number> = {};
  const refused: Record<string, number> = {};
  const marginCalls: Record<string, number> = {};
  const cuts: Record<string, number> = {};
  const ctxs = new Map<string, StrategyCtx>();
  for (const s of seatInfo) {
    ctxs.set(s.id, {
      rng: makeRng(hashString(`${seed}|${s.seat}|${s.strategy.name}`)),
      memory: {},
      seat: s.seat,
      seed,
    });
    ok[s.id] = 0;
    refused[s.id] = 0;
  }

  while (state.phase === 'playing') {
    const t = state.turn;
    // ordre des sièges tourné à chaque tour (personne n'agit toujours en premier)
    const order = seatInfo.map((_, i) => seatInfo[(i + t) % seatInfo.length]);
    for (const s of order) {
      if (state.phase !== 'playing') break;
      const api: StrategyApi = {
        act(a: Action): ActionResult {
          const r = applyAction(state, s.id, a);
          if (r.ok) ok[s.id]++;
          else refused[s.id]++;
          if (doLog) log.push(`T${t} ${s.id}/${s.strategy.name} ${short(a)} ${r.ok ? 'ok' : 'KO: ' + r.message}`);
          return r;
        },
        view: () => getPlayerView(state, s.id),
      };
      try {
        s.strategy.act(getPlayerView(state, s.id), api, ctxs.get(s.id)!);
      } catch (e) {
        if (opts.strict) throw e;
        log.push(`T${t} ${s.id}/${s.strategy.name} EXCEPTION ${(e as Error)?.message}`);
      }
    }
    const res = resolveTurnWithLog(state);
    if (!res) break;
    for (const m of res.marginCalls) {
      marginCalls[m.playerId] = (marginCalls[m.playerId] ?? 0) + 1;
      if (doLog) log.push(`T${t} RESOLVE marginCall ${m.playerId} sold=${m.sold.toFixed(0)}`);
    }
    for (const cid of res.productionCuts) {
      const ctrl = state.companies[cid]?.controllerId;
      if (ctrl) cuts[ctrl] = (cuts[ctrl] ?? 0) + 1;
    }
    if (doLog) {
      for (const s of res.scandals) log.push(`T${t} RESOLVE scandal ${s.companyId} fine=${s.fine.toFixed(0)}`);
      for (const b of res.bankruptcies) log.push(`T${t} RESOLVE bankruptcy ${b}`);
    }
  }

  const ranking = state.results?.ranking ?? Object.keys(state.players).map((id) => ({ playerId: id, netWorth: netWorth(state, id) })).sort((a, b) => b.netWorth - a.netWorth);
  const out: PlayerResult[] = ranking.map((r, i) => {
    const p = state.players[r.playerId];
    const s = seatInfo.find((x) => x.id === p.id);
    const lp = lobby.find((x) => x.id === p.id)!;
    return {
      playerId: p.id,
      name: p.name,
      strategy: s ? s.strategy.name : `bot:${p.botPersonalityId}`,
      tier: s ? s.strategy.tier : 'bot',
      isBot: p.isBot,
      seat: s ? s.seat : -1,
      sector: lp.sectorId,
      rank: i + 1,
      netWorth: r.netWorth,
      netWorthHistory: [...p.netWorthHistory],
      stats: {
        takeoversWon: p.stats.takeoversWon,
        takeoversSuffered: p.stats.takeoversSuffered,
        scandals: p.stats.scandals,
        bankruptcies: p.stats.bankruptcies,
        marginCalls: marginCalls[p.id] ?? 0,
        productionCuts: cuts[p.id] ?? 0,
        startups: p.stats.startupsFounded,
        shadyActions: p.stats.shadyActions,
        finesPaid: p.stats.finesPaid,
        parachutes: p.stats.parachutes,
        dividendsReceived: p.stats.dividendsReceived,
        bonusesTaken: p.stats.bonusesTaken,
        actionsOk: ok[p.id] ?? 0,
        actionsRefused: refused[p.id] ?? 0,
        controlledAtEnd: Object.values(state.companies).filter((c) => c.status === 'active' && c.controllerId === p.id).length,
      },
    };
  });
  return { seed, turns, ranking: out, log, state: keepState ? state : undefined };
}

// ---------------------------------------------------------------------------
// runTournament
// ---------------------------------------------------------------------------

export interface StrategySummary {
  name: string;
  tier: string;
  games: number;
  wins: number; // 1er au classement général (bots compris)
  winRate: number;
  meanRank: number;
  medianNW: number;
  meanNW: number;
  sdNW: number;
  q10NW: number;
  q90NW: number;
  /** Moyenne des stats de PlayerResult.stats. */
  meanStats: Record<string, number>;
  /** Par secteur de départ : médiane de valeur nette. */
  medianNWBySector: Record<string, number>;
}

export interface TournamentResult {
  games: GameResult[];
  summary: StrategySummary[];
  /** headToHead[A][B] = part des confrontations (même partie) où A finit devant B. Égalité = 0,5. */
  headToHead: Record<string, Record<string, { rate: number; n: number }>>;
}

export interface TournamentOptions {
  seeds: number[];
  /** Chaque lineup = liste de stratégies scriptées d'une même tablée. */
  lineups: Strategy[][];
  bots?: number;
  turns?: number;
  lang?: Lang;
  /** Tourner les sièges (secteurs) : chaque stratégie occupe chaque siège une fois par graine (défaut true). */
  rotate?: boolean;
  keepLogs?: boolean;
  onGame?(g: GameResult, i: number): void;
}

export const quantile = (xs: number[], q: number): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const sd = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

export function runTournament(opts: TournamentOptions): TournamentResult {
  const { seeds, lineups, bots = 3, turns = 16, lang = 'fr', rotate = true } = opts;
  const games: GameResult[] = [];
  let gi = 0;
  for (const seed of seeds) {
    for (const lineup of lineups) {
      const rotations = rotate ? lineup.length : 1;
      for (let r = 0; r < rotations; r++) {
        const seated = lineup.map((_, j) => ({ strategy: lineup[(j + r) % lineup.length] }));
        // botOffset = seed : mêmes bots pour toutes les rotations d'une graine
        const g = runGame({ seed, players: seated, bots, turns, lang, botOffset: seed, log: !!opts.keepLogs });
        if (!opts.keepLogs) g.log = [];
        games.push(g);
        opts.onGame?.(g, gi++);
      }
    }
  }
  return { games, ...summarize(games) };
}

export function summarize(games: GameResult[]): Omit<TournamentResult, 'games'> {
  const by = new Map<string, PlayerResult[]>();
  for (const g of games) for (const p of g.ranking) {
    if (!by.has(p.strategy)) by.set(p.strategy, []);
    by.get(p.strategy)!.push(p);
  }
  const summary: StrategySummary[] = [];
  for (const [name, rs] of by) {
    const nws = rs.map((r) => r.netWorth);
    const meanStats: Record<string, number> = {};
    for (const k of Object.keys(rs[0].stats)) meanStats[k] = mean(rs.map((r) => (r.stats as any)[k]));
    const bySector: Record<string, number[]> = {};
    for (const r of rs) (bySector[r.sector] ??= []).push(r.netWorth);
    summary.push({
      name,
      tier: rs[0].tier,
      games: rs.length,
      wins: rs.filter((r) => r.rank === 1).length,
      winRate: rs.filter((r) => r.rank === 1).length / rs.length,
      meanRank: mean(rs.map((r) => r.rank)),
      medianNW: quantile(nws, 0.5),
      meanNW: mean(nws),
      sdNW: sd(nws),
      q10NW: quantile(nws, 0.1),
      q90NW: quantile(nws, 0.9),
      meanStats,
      medianNWBySector: Object.fromEntries(Object.entries(bySector).map(([k, v]) => [k, quantile(v, 0.5)])),
    });
  }
  summary.sort((a, b) => b.medianNW - a.medianNW);

  const h2h: Record<string, Record<string, { w: number; n: number }>> = {};
  for (const g of games) {
    const ps = g.ranking;
    for (const a of ps) for (const b of ps) {
      if (a === b || a.strategy === b.strategy) continue;
      const cell = ((h2h[a.strategy] ??= {})[b.strategy] ??= { w: 0, n: 0 });
      cell.n++;
      cell.w += a.netWorth > b.netWorth ? 1 : a.netWorth === b.netWorth ? 0.5 : 0;
    }
  }
  const headToHead: TournamentResult['headToHead'] = {};
  for (const [a, row] of Object.entries(h2h)) {
    headToHead[a] = {};
    for (const [b, c] of Object.entries(row)) headToHead[a][b] = { rate: c.w / c.n, n: c.n };
  }
  return { summary, headToHead };
}

/** Rendu texte compact (k = milliers ; affiché en M). */
export function formatReport(t: Omit<TournamentResult, 'games'>, opts: { only?: string[] } = {}): string {
  const M = (k: number) => (k / 1000).toFixed(1).padStart(6);
  const lines: string[] = [];
  lines.push('strategie              tier          n   win%  rang   medNW   moyNW   sdNW   q10    q90   OPA+  OPA-  scand fail marge refus%');
  for (const s of t.summary) {
    if (opts.only && !opts.only.includes(s.name)) continue;
    const ms = s.meanStats;
    const refusal = ms.actionsOk + ms.actionsRefused > 0 ? ms.actionsRefused / (ms.actionsOk + ms.actionsRefused) : 0;
    lines.push(
      `${s.name.padEnd(22)} ${s.tier.padEnd(12)} ${String(s.games).padStart(3)} ${(s.winRate * 100).toFixed(0).padStart(5)} ${s.meanRank.toFixed(2).padStart(5)} ${M(s.medianNW)}  ${M(s.meanNW)} ${M(s.sdNW)} ${M(s.q10NW)} ${M(s.q90NW)} ${ms.takeoversWon.toFixed(2).padStart(5)} ${ms.takeoversSuffered.toFixed(2).padStart(5)} ${ms.scandals.toFixed(2).padStart(5)} ${ms.bankruptcies.toFixed(2).padStart(4)} ${ms.marginCalls.toFixed(2).padStart(5)} ${(refusal * 100).toFixed(0).padStart(5)}`,
    );
  }
  lines.push('');
  lines.push('duels (A devant B, même partie) :');
  const names = t.summary.map((s) => s.name).filter((n) => !n.startsWith('bot:'));
  for (const a of names) for (const b of names) {
    if (a >= b) continue;
    const c = t.headToHead[a]?.[b];
    if (c) lines.push(`  ${a} vs ${b} : ${(c.rate * 100).toFixed(0)} % (n=${c.n})`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Aides pour écrire des stratégies (vue seulement)
// ---------------------------------------------------------------------------

export function me(view: PlayerView) {
  return view.players.find((p) => p.id === view.you)!;
}
/** Entreprises actives que je contrôle (avec leurs champs private). */
export function myCompanies(view: PlayerView): CompanyView[] {
  return view.companies.filter((c) => c.controllerId === view.you && c.status === 'active');
}
export function activeCompanies(view: PlayerView): CompanyView[] {
  return view.companies.filter((c) => c.status === 'active');
}
export function sectorOf(view: PlayerView, id: SectorId) {
  return view.sectors.find((s) => s.id === id)!;
}
export function pickOne<T>(rng: () => number, xs: readonly T[]): T | undefined {
  return xs.length ? xs[Math.floor(rng() * xs.length)] : undefined;
}

// ---------------------------------------------------------------------------
// Stratégies de référence
// ---------------------------------------------------------------------------

/** Ne fait rien : l'entreprise garde ses réglages de départ (prix = référence, prod 80 %). */
export const passive: Strategy = {
  name: 'passive',
  tier: 'baseline',
  act() {},
};

/** Actions valides au hasard, montants modestes (0 à 4 actions par tour). Simule un clic-partout. */
export const random: Strategy = {
  name: 'random',
  tier: 'baseline',
  act(view, api, { rng }) {
    const n = Math.floor(rng() * 5);
    for (let k = 0; k < n; k++) {
      const v = api.view();
      const mePub = me(v);
      const mine = myCompanies(v);
      const c = pickOne(rng, mine);
      const others = activeCompanies(v).filter((x) => x.controllerId !== v.you && x.floatShares > 0);
      const choice = Math.floor(rng() * 14);
      const r = () => 0.5 + rng(); // 0,5..1,5
      switch (choice) {
        case 0:
        case 1: {
          if (!c) break;
          const p = pickOne(rng, c.products);
          if (!p) break;
          const ref = sectorOf(v, p.sectorId).refPrice;
          api.act({
            type: 'setProductDecisions',
            companyId: c.id,
            productId: p.id,
            price: ref * (0.8 + 0.5 * rng()),
            production: p.capacity * (0.5 + 0.7 * rng()),
            marketing: (p.private?.marketing ?? 0) * r(),
            rnd: (p.private?.rnd ?? 0) * r(),
          });
          break;
        }
        case 2: {
          const t = pickOne(rng, others);
          if (!t || mePub.cash <= 0) break;
          const shares = Math.floor(Math.min(t.floatShares, (mePub.cash * 0.15 * rng()) / t.sharePrice));
          if (shares >= 1) api.act({ type: 'buyShares', companyId: t.id, shares });
          break;
        }
        case 3: {
          const held = v.companies.filter((x) => (x.holdings[v.you] ?? 0) > 0 && x.status === 'active' && x.controllerId !== v.you);
          const t = pickOne(rng, held);
          if (!t) break;
          const shares = Math.floor((t.holdings[v.you] ?? 0) * (0.2 + 0.6 * rng()));
          if (shares >= 1) api.act({ type: 'sellShares', companyId: t.id, shares });
          break;
        }
        case 4: {
          if (!c) break;
          const com = pickOne(rng, COMMODITY_IDS)!;
          api.act({ type: 'buyCommodity', companyId: c.id, commodityId: com, lots: 1 + Math.floor(rng() * 15) });
          break;
        }
        case 5: {
          if (!c || !c.private) break;
          const amt = Math.min(c.private.loanLimit, 500 + rng() * 1500);
          if (amt > 1) api.act({ type: 'takeLoan', companyId: c.id, amount: amt });
          break;
        }
        case 6: {
          if (!c || c.debt <= 0) break;
          api.act({ type: 'repayLoan', companyId: c.id, amount: Math.min(c.debt, c.cash * 0.3) });
          break;
        }
        case 7: {
          if (!c || c.cash <= 0) break;
          api.act({ type: 'payDividend', companyId: c.id, amount: c.cash * 0.05 * rng() + 1 });
          break;
        }
        case 8: {
          if (!c || !c.private || c.private.maxBonus <= 1) break;
          api.act({ type: 'ceoBonus', companyId: c.id, amount: c.private.maxBonus * 0.3 * rng() + 1 });
          break;
        }
        case 9: {
          if (!c) break;
          const p = pickOne(rng, c.products);
          if (p) api.act({ type: 'expandCapacity', companyId: c.id, productId: p.id, lots: 1 + Math.floor(p.capacity * 0.15 * rng()) });
          break;
        }
        case 10: {
          if (!c || rng() > 0.3) break;
          const sec = pickOne(rng, SECTOR_IDS)!;
          api.act({ type: 'launchProduct', companyId: c.id, sectorId: sec, name: `Rnd ${v.turn}` });
          break;
        }
        case 11: {
          if (!c || rng() > 0.4) break;
          const kind = pickOne(rng, SHADY_KINDS)! as ShadyKind;
          const tgt = pickOne(rng, others);
          api.act({ type: 'shady', companyId: c.id, kind, targetCompanyId: tgt?.id });
          break;
        }
        case 12: {
          if (v.personalLoanLimit > 1 && rng() < 0.5) api.act({ type: 'takePersonalLoan', amount: v.personalLoanLimit * 0.3 * rng() + 1 });
          else if (mePub.debt > 0 && mePub.cash > 0) api.act({ type: 'repayPersonalLoan', amount: Math.min(mePub.debt, mePub.cash) });
          break;
        }
        case 13: {
          if (!c || rng() > 0.3) break;
          api.act({ type: 'crisisComms', companyId: c.id });
          break;
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Autotest : 20 graines, passive vs random + 3 bots (sièges tournés → 40 parties)
// ---------------------------------------------------------------------------

const isMain = (() => {
  try {
    return process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
  } catch {
    return false;
  }
})();

if (isMain) {
  const t0 = Date.now();
  const res = runTournament({
    seeds: Array.from({ length: 20 }, (_, i) => i + 1),
    lineups: [[passive, random]],
    bots: 3,
    keepLogs: true,
  });
  console.log(`${res.games.length} parties en ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  console.log(formatReport(res));
  const g = res.games[0];
  console.log(`\nextrait du log (graine ${g.seed}) :`);
  console.log(g.log.filter((l) => l.includes('random')).slice(0, 12).join('\n'));
  // Déterminisme : rejouer la même partie doit donner les mêmes nombres.
  const again = runGame({ seed: 1, players: [{ strategy: passive }, { strategy: random }], bots: 3, botOffset: 1 });
  const same = again.ranking.map((p) => p.netWorth.toFixed(6)).join() === res.games[0].ranking.map((p) => p.netWorth.toFixed(6)).join();
  console.log(`\ndéterminisme (rejeu graine 1) : ${same ? 'OK' : 'ÉCHEC'}`);
}
