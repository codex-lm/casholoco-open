/**
 * Parties entre bots pour l'équilibrage : `npm run sim [-- --games 20 --turns 16 --seed 1 --lang fr|en]`.
 * `--lang en` joue les parties en anglais (noms, journal, montants en $) : les statistiques sont identiques.
 * `--interns` joue avec des bots « stagiaires » (GameConfig.botLevel = 'intern'), `--experts` avec des bots « experts »
 * ('expert') ; `--expert-params fichier.json` essaie d'autres réglages des experts (ExpertParams partiel, cf.
 * tools/balance-lab/expert-tune.ts) ; `--idle-human` ajoute un humain passif. En mode hexagonal, les bots évaluent
 * au plus dix cases libres par bassin, plus la case actuelle, et déposent des mises explicites ; les usines
 * existantes peuvent miser chaque trimestre sauf le dernier. `--pin-capital` interdit leurs déménagements ; en
 * classique, les lancements restent à la capitale ; en hexagonal, ils misent sur la candidate libre la plus proche
 * d'A10. Les PNJ gardent leurs positions initiales. `--hex` rapporte les bassins et les résultats par terrain et
 * secteur attribués à l'origine (même après déménagement, OPA, fusion ou faillite). `factoryMoves` compte les
 * déménagements hexagonaux gagnés à l'exécution, départs de l'incubateur exclus ; en classique, les demandes
 * réussies, lancement compris. Le mode hexagonal mesure aussi les adjudications, les replis, les abandons et
 * les lancements effectifs. `--summary-json fichier.json` exporte ces mesures.
 * Drapeaux de mesure (inertes par défaut) : `--players N` fixe le nombre de bots par partie (entier 2..8,
 * au lieu de la rotation 4 + (graine % 3)) ; `--assignment fair|random|host|fair_varied|choice` passe le mode
 * d'attribution des terrains au moteur (un mode qu'il ne connaît pas laisse remonter son erreur) ;
 * `--sectors rotate` attribue au bot i le secteur SECTOR_LIST[(i + graine) % n] au lieu du secteur préféré
 * de son persona, pour couvrir tous les couples terrain × secteur ; `--per-game` ajoute un tableau `games`
 * détaillant chaque partie au JSON (joueurs, terrain d'origine, rang, valeur nette). Le JSON contient
 * toujours `playersPerGame`, `sectorResults` (ratios de victoires et quartiles selon le secteur de départ)
 * et `cryptoNews` (krachs effectivement publiés, par partie ; une partie « pompée » a publié une euphorie).
 * En hexagonal, il garde aussi les mesures par couple terrain × secteur.
 * Affiche des statistiques (valeurs nettes, OPA, faillites, scandales, fusions, cours…)
 * et un extrait du Capital Quotidien d'une partie.
 */
import * as fs from 'node:fs';
import { getContent, PLAYER_COLORS, SECTORS } from '../src/content';
import { createGame, netWorth } from '../src/engine';
import { formatMoney as formatMoneyIn } from '../src/format';
import { setExpertParams } from '../src/sim/botExpert';
import { setBotZoneMode } from '../src/sim/bots';
import { resolveTurnWithLog } from '../src/sim/resolve';
import { engineDiagnostics, findNonFinite } from '../src/sim/sanitize';
import { LANGS, ZONE_IDS, type GameState, type Lang, type LobbyPlayer } from '../src/types';
import { basin } from '../src/sim/hexes';
import { zoneOf } from '../src/content/map';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

const GAMES = arg('games', 20);
const TURNS = arg('turns', 16);
const FIRST_SEED = arg('seed', 1);
const VERBOSE = process.argv.includes('--verbose');
const HEX = process.argv.includes('--hex');
const NETWORK = process.argv.includes('--network');
const SUMMARY_PATH = (() => {
  const i = process.argv.indexOf('--summary-json');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const LANG: Lang = (() => {
  const i = process.argv.indexOf('--lang');
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) return 'fr';
  if (!LANGS.includes(v as Lang)) {
    console.error(`--lang : valeur inconnue « ${v} » (attendu : ${LANGS.join(' | ')})`);
    process.exit(2);
  }
  return v as Lang;
})();
const BOT_PERSONALITIES = getContent(LANG).bots;
const formatMoney = (k: number) => formatMoneyIn(k, LANG);
/** Ajoute un humain passif (ne joue jamais) par secteur tournant, pour mesurer la « gestion par défaut ». */
const IDLE_HUMAN = process.argv.includes('--idle-human');
/** Bots « stagiaires » (GameConfig.botLevel = 'intern') ou « experts » ('expert'). */
const INTERNS = process.argv.includes('--interns');
const EXPERTS = process.argv.includes('--experts');
const EXPERT_PARAMS = (() => {
  const i = process.argv.indexOf('--expert-params');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
if (EXPERT_PARAMS) setExpertParams(JSON.parse(fs.readFileSync(EXPERT_PARAMS, 'utf8')));
/** Sans déménagement ; sur le plateau, les lancements misent sur la candidate libre la plus proche d'A10. */
if (process.argv.includes('--pin-capital')) setBotZoneMode('capital');
/** Nombre fixe de bots par partie ; absent, la rotation 4 + (graine % 3) est conservée. */
const PLAYERS = (() => {
  const i = process.argv.indexOf('--players');
  if (i < 0) return undefined;
  const raw = process.argv[i + 1];
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 2 || v > 8) {
    console.error(`--players : valeur inconnue « ${raw} » (attendu : entier entre 2 et 8)`);
    process.exit(2);
  }
  return v;
})();
/** Mode d'attribution des terrains ; un mode inconnu du moteur (fair_varied, choice) laisse remonter son erreur. */
const ASSIGNMENT = (() => {
  const i = process.argv.indexOf('--assignment');
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) return undefined;
  const modes = ['fair', 'random', 'host', 'fair_varied', 'choice'];
  if (!modes.includes(v)) {
    console.error(`--assignment : valeur inconnue « ${v} » (attendu : ${modes.join(' | ')})`);
    process.exit(2);
  }
  return v;
})();
/** Secteurs de départ tournants au lieu du secteur préféré du persona (couverture terrain × secteur). */
const ROTATE_SECTORS = (() => {
  const i = process.argv.indexOf('--sectors');
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined) return false;
  if (v !== 'rotate') {
    console.error(`--sectors : valeur inconnue « ${v} » (attendu : rotate)`);
    process.exit(2);
  }
  return true;
})();
/** Ajoute le détail de chaque partie (joueurs, terrain d'origine, rang, valeur nette) au JSON de synthèse. */
const PER_GAME = process.argv.includes('--per-game');
const SECTOR_LIST = Object.keys(SECTORS) as (keyof typeof SECTORS)[];
// Compter les articles publiés, jamais la programmation future ni les variables cachées du marché.
const CRYPTO_CRASH_TITLES = new Set(getContent(LANG).newsCards.filter((c) => c.id.startsWith('crypto_crash_')).map((c) => c.headline));
const CRYPTO_EUPHORIA_TITLES = new Set(getContent(LANG).newsCards.filter((c) => c.id.startsWith('crypto_bubble_')).map((c) => c.headline));

function lobbyFor(seed: number): LobbyPlayer[] {
  const nBots = PLAYERS ?? (4 + (seed % 3)); // 4 à 6 bots sans --players
  const order = [...BOT_PERSONALITIES];
  // rotation déterministe pour varier les tablées
  for (let i = 0; i < seed % order.length; i++) order.push(order.shift()!);
  const players: LobbyPlayer[] = [];
  for (let i = 0; i < nBots; i++) {
    const pers = order[i % order.length];
    const dup = i >= order.length ? ` ${Math.floor(i / order.length) + 1}` : '';
    players.push({
      id: `bot${i + 1}`,
      name: `${pers.ceoName}${dup}`,
      isBot: true,
      botPersonalityId: pers.id,
      companyName: `${pers.companyName}${dup}`,
      sectorId: ROTATE_SECTORS ? SECTOR_LIST[(i + seed) % SECTOR_LIST.length] : (pers.preferredSectors[0] ?? 'energy_drinks'),
      connected: true,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    });
  }
  if (IDLE_HUMAN) {
    players.push({
      id: 'human',
      name: LANG === 'en' ? 'Idle Human' : 'Humain passif',
      isBot: false,
      companyName: LANG === 'en' ? 'Inertia Inc.' : 'Inertie SA',
      sectorId: SECTOR_LIST[seed % SECTOR_LIST.length],
      connected: false,
      color: '#ffffff',
    });
  }
  return players;
}

const quantile = (xs: number[], q: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const f1 = (x: number) => x.toFixed(2);

interface PlayerResult {
  playerId: string;
  personality: string;
  terrainId: string | null;
  sectorId: string;
  netWorth: number;
  rank: number | null;
}

interface GameStats {
  factoryMoves: number;
  launches: number;
  hexAuctions: { bids: number; cells: number; contested: number; priceRatios: number[]; fallbacks: number; abandons: number; moves: number };
  finalNW: number[];
  terrainResults: { terrainId: string; sectorId: string; netWorth: number; won: boolean; gamePlayers: number; rank: number | null }[];
  lobbyPlayers: number; // joueurs du salon (humain passif compris)
  playerResults: PlayerResult[];
  cryptoCrashes: number;
  cryptoEuphoria: number;
  cryptoIssues: number;
  discontinuedProducts: number;
  discontinuedBySector: Record<string, number>;
  perGame?: { seed: number; players: number; cryptoCrashes: number; cryptoEuphoria: number; cryptoIssues: number; cryptoEuphoriaTurns: number[]; cryptoCrashTurns: number[]; cryptoPumped: boolean; discontinuedProducts: number; discontinuedBySector: Record<string, number>; results: PlayerResult[] };
  nwByPersonality: Record<string, number[]>;
  indexByPersonality: Record<string, number[]>;
  indexBySector: Record<string, number[]>;
  winner: string;
  takeovers: number;
  takeoverTurns: number[];
  takenCompanies: Set<string>;
  hostile: number; // OPA sur une entreprise qui avait un PDG joueur
  bankruptcies: number;
  scandals: number;
  mergers: number;
  startups: number;
  marginCalls: number;
  productionCuts: number;
  priceIndex: number[][]; // [tour][entreprise initiale] cours / cours initial
  profitable: number;
  reports: number;
  playerProfit: number[];
  npcProfit: number[];
  commodityRatio: Record<string, number>;
  sectorDemand: Record<string, number>;
  nonFinite: number;
  shady: number;
  whistleblows: number;
  bonuses: number;
  dividends: number;
  flashes: number;
  sites: number; // filiales d'approvisionnement ouvertes (§5.5 bis)
  state: GameState;
}

function playGame(seed: number): GameStats {
  // createGame joue déjà les bots du trimestre de lancement, déménagements compris.
  engineDiagnostics.factoryMoves = 0;
  const lobby = lobbyFor(seed);
  const state = createGame({ totalTurns: TURNS, turnSeconds: 90, startYear: 2027, seed, lang: LANG, ...(HEX ? { mapMode: 'hex' as const, ...(NETWORK ? { industryRules: 'network' as const } : {}) } : {}), ...(ASSIGNMENT ? { terrainAssignment: ASSIGNMENT as 'fair' | 'random' | 'host' } : {}), ...(INTERNS ? { botLevel: 'intern' as const } : EXPERTS ? { botLevel: 'expert' as const } : {}) }, lobby);
  const initialIds = Object.keys(state.companies);
  const initialPrices = initialIds.map((id) => state.companies[id].priceHistory[0]);
  // Merger pro forma reports may reorder their products. Keep the actual initial
  // sector here so acquired crypto lines cannot change a ticker's reporting group.
  const initialSectorByCompany = new Map(initialIds.map((id) => [id, state.companies[id].products[0]?.sectorId]));
  const stats: GameStats = {
    factoryMoves: 0,
    launches: 0,
    hexAuctions: { bids: 0, cells: 0, contested: 0, priceRatios: [], fallbacks: 0, abandons: 0, moves: 0 },
    finalNW: [],
    terrainResults: [],
    lobbyPlayers: lobby.length,
    playerResults: [],
    cryptoCrashes: 0,
    cryptoEuphoria: 0,
    cryptoIssues: 0,
    discontinuedProducts: 0,
    discontinuedBySector: {},
    nwByPersonality: {},
    indexByPersonality: {},
    indexBySector: {},
    winner: '',
    takeovers: 0,
    takeoverTurns: [],
    takenCompanies: new Set(),
    hostile: 0,
    bankruptcies: 0,
    scandals: 0,
    mergers: 0,
    startups: 0,
    marginCalls: 0,
    productionCuts: 0,
    priceIndex: [],
    profitable: 0,
    reports: 0,
    playerProfit: [],
    npcProfit: [],
    commodityRatio: {},
    sectorDemand: {},
    nonFinite: 0,
    shady: 0,
    sites: 0,
    whistleblows: 0,
    bonuses: 0,
    dividends: 0,
    flashes: 0,
    state,
  };
  const controllers = () => Object.fromEntries(Object.values(state.companies).map((c) => [c.id, c.controllerId]));
  let prevTakeovers = 0;
  const countTakeovers = () => Object.values(state.players).reduce((s, p) => s + p.stats.takeoversWon, 0);
  let before = controllers();
  // les bots du tour 1 ont déjà joué dans createGame
  const noteTakeovers = (turn: number) => {
    const now = countTakeovers();
    for (let k = prevTakeovers; k < now; k++) stats.takeoverTurns.push(turn);
    prevTakeovers = now;
    const after = controllers();
    for (const [id, ctrl] of Object.entries(after)) {
      if (ctrl && before[id] !== ctrl && state.companies[id].status === 'active') {
        stats.takenCompanies.add(id);
        if (before[id]) stats.hostile++;
      }
    }
    before = after;
  };
  noteTakeovers(1);
  while (state.phase === 'playing') {
    const turn = state.turn;
    const beforeProducts = Object.values(state.companies).flatMap((company) => company.products.map((product) => ({
      id: product.id, companyId: company.id, sectorId: product.sectorId,
    })));
    if (HEX) stats.hexAuctions.bids += (state.hexBids ?? []).filter((bid) => !bid.result && bid.turn === turn).length;
    const log = resolveTurnWithLog(state);
    if (!log) break;
    // A merger transfers product IDs unchanged; bankruptcy is the only other removal path.
    // Observe actual disappearance after the next turn's bot actions, without private action counters.
    const afterProductIds = new Set(Object.values(state.companies).flatMap((company) => company.products.map((product) => product.id)));
    for (const product of beforeProducts) {
      if (afterProductIds.has(product.id) || state.companies[product.companyId]?.status === 'bankrupt') continue;
      stats.discontinuedProducts++;
      stats.discontinuedBySector[product.sectorId] = (stats.discontinuedBySector[product.sectorId] ?? 0) + 1;
    }
    if (HEX) {
      for (const award of state.hexAuctionResults ?? []) {
        if (!award.fallback) {
          stats.hexAuctions.cells++;
          stats.hexAuctions.contested += Number(award.bidders > 1);
        }
        stats.hexAuctions.priceRatios.push(award.price / award.reserve);
        stats.hexAuctions.fallbacks += Number(award.fallback);
        stats.hexAuctions.moves += Number(award.kind === 'move');
      }
      stats.hexAuctions.abandons += (state.hexBids ?? []).filter((bid) => bid.turn === turn && bid.result?.outcome === 'abandoned').length;
    }
    stats.scandals += log.scandals.length;
    stats.marginCalls += log.marginCalls.length;
    stats.productionCuts += log.productionCuts.length;
    stats.priceIndex.push(initialIds.map((id, i) => state.companies[id].sharePrice / initialPrices[i]));
    if (state.phase === 'playing') noteTakeovers(turn + 1);
  }
  stats.factoryMoves = engineDiagnostics.factoryMoves;
  stats.takeovers = countTakeovers();
  for (const p of Object.values(state.players)) {
    const nw = netWorth(state, p.id);
    stats.finalNW.push(nw);
    const key = p.botPersonalityId ?? 'humain';
    (stats.nwByPersonality[key] ??= []).push(nw);
    stats.startups += p.stats.startupsFounded;
    stats.shady += p.stats.shadyActions;
    stats.whistleblows += p.stats.whistleblows ?? 0;
    stats.bonuses += p.stats.bonusesTaken;
    stats.dividends += p.stats.dividendsReceived;
  }
  for (const c of Object.values(state.companies)) {
    if (!initialIds.includes(c.id) || c.status === 'merged') continue;
    const idx = c.priceHistory[c.priceHistory.length - 1] / c.priceHistory[0];
    const sector = initialSectorByCompany.get(c.id) ?? '?';
    (stats.indexBySector[sector] ??= []).push(idx);
    const founder = c.founderId ? state.players[c.founderId] : undefined;
    if (founder) (stats.indexByPersonality[founder.botPersonalityId ?? 'humain'] ??= []).push(idx);
  }
  stats.winner = state.results ? (state.players[state.results.ranking[0].playerId].botPersonalityId ?? '?') : '?';
  // Rang final (1 = vainqueur) ; null si le classement est absent ou ne contient pas le joueur.
  const rankByPlayer = new Map((state.results?.ranking ?? []).map((r, i) => [r.playerId, i + 1]));
  // Conserver l'attribution du joueur initial : dirigeants, produits et effets actifs peuvent avoir changé.
  if (HEX) {
    const winnerId = state.results?.ranking[0]?.playerId;
    for (const [terrainId, assignment] of Object.entries(state.terrainAssignments ?? {})) {
      const founder = lobby.find((player) => player.id === assignment.playerId);
      if (!founder) continue;
      stats.terrainResults.push({ terrainId, sectorId: founder.sectorId, netWorth: netWorth(state, founder.id), won: founder.id === winnerId, gamePlayers: lobby.length, rank: rankByPlayer.get(founder.id) ?? null });
    }
  }
  const terrainByPlayer = new Map(Object.entries(state.terrainAssignments ?? {}).map(([terrainId, assignment]) => [assignment.playerId, terrainId]));
  stats.playerResults = lobby.map((p) => ({
    playerId: p.id,
    personality: p.botPersonalityId ?? 'humain',
    terrainId: terrainByPlayer.get(p.id) ?? null,
    sectorId: p.sectorId,
    netWorth: netWorth(state, p.id),
    rank: rankByPlayer.get(p.id) ?? null,
  }));
  const publishedNews = state.journal.flatMap((issue) => issue.articles).filter((a) => a.kind === 'headline' || a.kind === 'news');
  stats.cryptoCrashes = publishedNews.filter((a) => CRYPTO_CRASH_TITLES.has(a.title)).length;
  stats.cryptoEuphoria = publishedNews.filter((a) => CRYPTO_EUPHORIA_TITLES.has(a.title)).length;
  stats.cryptoIssues = state.journal.length;
  const cryptoTurns = (titles: Set<string>) => state.journal.filter((issue) => issue.articles.some((a) =>
    (a.kind === 'headline' || a.kind === 'news') && titles.has(a.title))).map((issue) => issue.turn);
  if (PER_GAME) {
    stats.perGame = {
      seed,
      players: lobby.length,
      cryptoCrashes: stats.cryptoCrashes,
      cryptoEuphoria: stats.cryptoEuphoria,
      cryptoIssues: stats.cryptoIssues,
      cryptoEuphoriaTurns: cryptoTurns(CRYPTO_EUPHORIA_TITLES),
      cryptoCrashTurns: cryptoTurns(CRYPTO_CRASH_TITLES),
      cryptoPumped: stats.cryptoEuphoria > 0,
      discontinuedProducts: stats.discontinuedProducts,
      discontinuedBySector: stats.discontinuedBySector,
      results: stats.playerResults,
    };
  }
  for (const c of Object.values(state.companies)) {
    if (c.status === 'bankrupt') stats.bankruptcies++;
    if (c.status === 'merged') stats.mergers++;
    for (const r of c.reports) {
      stats.reports++;
      if (r.netProfit > 0) stats.profitable++;
      (c.npcDefId ? stats.npcProfit : stats.playerProfit).push(r.netProfit);
    }
  }
  for (const [id, cs] of Object.entries(state.commodities)) stats.commodityRatio[id] = cs.price / cs.priceHistory[0];
  for (const [id, s] of Object.entries(state.sectors)) stats.sectorDemand[id] = s.lastTotalDemand / SECTORS[id as keyof typeof SECTORS].refDemand;
  stats.nonFinite = findNonFinite(state).length;
  stats.flashes = state.journal.reduce((s, j) => s + j.articles.filter((a) => a.kind === 'flash').length, 0);
  stats.sites = state.journal.reduce((s, j) => s + j.articles.filter((a) => a.event?.type === 'siteOpened').length, 0);
  stats.launches = state.journal.reduce((s, j) => s + j.articles.filter((a) => a.event?.type === 'productLaunch').length, 0);
  return stats;
}

// ---------------------------------------------------------------------------

const t0 = performance.now();
const all: GameStats[] = [];
for (let g = 0; g < GAMES; g++) all.push(playGame(FIRST_SEED + g));
const elapsed = performance.now() - t0;

const allNW = all.flatMap((s) => s.finalNW);
console.log(`\n=== muchomoney : ${GAMES} parties × ${TURNS} tours entre bots (graines ${FIRST_SEED}..${FIRST_SEED + GAMES - 1}, langue ${LANG}) en ${(elapsed / 1000).toFixed(1)} s ===\n`);
console.log('Valeur nette finale des joueurs (départ ≈ 21 M€) :');
console.log(
  `  min ${formatMoney(Math.min(...allNW))} | q25 ${formatMoney(quantile(allNW, 0.25))} | médiane ${formatMoney(quantile(allNW, 0.5))} | q75 ${formatMoney(quantile(allNW, 0.75))} | max ${formatMoney(Math.max(...allNW))}`,
);
const spreads = all.map((s) => Math.max(...s.finalNW) / Math.max(1, Math.min(...s.finalNW)));
console.log(`  écart gagnant/perdant par partie : médiane ×${f1(quantile(spreads, 0.5))}, max ×${f1(Math.max(...spreads))}`);
const byPers: Record<string, number[]> = {};
for (const s of all) for (const [k, v] of Object.entries(s.nwByPersonality)) (byPers[k] ??= []).push(...v);
const idxPers: Record<string, number[]> = {};
for (const s of all) for (const [k, v] of Object.entries(s.indexByPersonality)) (idxPers[k] ??= []).push(...v);
const idxSector: Record<string, number[]> = {};
for (const s of all) for (const [k, v] of Object.entries(s.indexBySector)) (idxSector[k] ??= []).push(...v);
const wins: Record<string, number> = {};
for (const s of all) wins[s.winner] = (wins[s.winner] ?? 0) + 1;
console.log('  par personnalité (médiane, victoires) :');
for (const [k, v] of Object.entries(byPers).sort((a, b) => quantile(b[1], 0.5) - quantile(a[1], 0.5))) {
  console.log(`    ${k.padEnd(12)} ${formatMoney(quantile(v, 0.5)).padStart(10)}  ${String(wins[k] ?? 0).padStart(2)} victoire(s), cours final de son entreprise ×${f1(quantile(idxPers[k] ?? [], 0.5))}`);
}
console.log(`  cours final / initial par secteur de départ (médiane, faillites comprises) : ${Object.entries(idxSector).map(([k, v]) => `${k} ×${f1(quantile(v, 0.5))}`).join(' | ')}`);

const takeoverTurns = all.flatMap((s) => s.takeoverTurns);
console.log('\nPrises de contrôle (OPA) :');
console.log(
  `  total ${takeoverTurns.length} (${f1(takeoverTurns.length / GAMES)} par partie ; parties sans OPA : ${all.filter((s) => s.takeovers === 0).length}/${GAMES}) ; tour moyen ${f1(mean(takeoverTurns))} ; entreprises distinctes prises par partie : ${f1(mean(all.map((s) => s.takenCompanies.size)))} / ${f1(mean(all.map((s) => Object.keys(s.state.companies).length)))}`,
);
const hist: Record<number, number> = {};
for (const t of takeoverTurns) hist[t] = (hist[t] ?? 0) + 1;
console.log(`  dont entreprises qui avaient un PDG joueur (évincé) : ${all.reduce((a, s) => a + s.hostile, 0)}`);
console.log(`  répartition par tour : ${Object.entries(hist).map(([t, n]) => `T${t}:${n}`).join(' ')}`);

console.log('\nÉvénements par partie (moyenne) :');
console.log(
  `  faillites ${f1(mean(all.map((s) => s.bankruptcies)))} | scandales ${f1(mean(all.map((s) => s.scandals)))} | fusions ${f1(mean(all.map((s) => s.mergers)))} | start-ups ${f1(mean(all.map((s) => s.startups)))} | appels de marge ${f1(mean(all.map((s) => s.marginCalls)))} | productions réduites ${f1(mean(all.map((s) => s.productionCuts)))}`,
);
console.log(
  `  actions discutables ${f1(mean(all.map((s) => s.shady)))} | alertes ${f1(mean(all.map((s) => s.whistleblows)))} | bonus PDG ${formatMoney(mean(all.map((s) => s.bonuses)))} | dividendes reçus ${formatMoney(mean(all.map((s) => s.dividends)))} | flashs ${f1(mean(all.map((s) => s.flashes)))} | filiales ouvertes ${f1(mean(all.map((s) => s.sites)))}`,
);

const profitable = all.reduce((s, x) => s + x.profitable, 0) / Math.max(1, all.reduce((s, x) => s + x.reports, 0));
console.log('\nRentabilité :');
console.log(`  trimestres bénéficiaires ${pct(profitable)}`);
const pp = all.flatMap((s) => s.playerProfit);
const np = all.flatMap((s) => s.npcProfit);
console.log(`  bénéfice net trimestriel (joueurs) : q25 ${formatMoney(quantile(pp, 0.25))} | médiane ${formatMoney(quantile(pp, 0.5))} | q75 ${formatMoney(quantile(pp, 0.75))}`);
console.log(`  bénéfice net trimestriel (PNJ)     : q25 ${formatMoney(quantile(np, 0.25))} | médiane ${formatMoney(quantile(np, 0.5))} | q75 ${formatMoney(quantile(np, 0.75))}`);

console.log('\nCours des entreprises initiales (cours / cours initial, médiane [q10-q90]) :');
const line: string[] = [];
for (const t of [1, 2, 4, 8, 12, TURNS]) {
  if (t > TURNS) continue;
  const xs = all.flatMap((s) => s.priceIndex[t - 1] ?? []).filter((x) => x > 0);
  line.push(`T${t} ${f1(quantile(xs, 0.5))} [${f1(quantile(xs, 0.1))}-${f1(quantile(xs, 0.9))}]`);
}
console.log(`  ${line.join(' | ')}`);
const moves = all.flatMap((s) =>
  Object.values(s.state.companies).flatMap((c) => c.priceHistory.slice(1).map((p, i) => (c.priceHistory[i] > 0 && p > 0 ? Math.abs(Math.log(p / c.priceHistory[i])) : NaN))),
).filter(Number.isFinite);
console.log(`  variation absolue par tour : médiane ${pct(quantile(moves, 0.5))}, q90 ${pct(quantile(moves, 0.9))}`);
console.log(
  `  matières (prix final / initial) : ${Object.keys(all[0].commodityRatio)
    .map((k) => `${k} ${f1(mean(all.map((s) => s.commodityRatio[k])))}`)
    .join(' | ')}`,
);
console.log(
  `  demande finale / référence : ${Object.keys(all[0].sectorDemand)
    .map((k) => `${k} ${f1(mean(all.map((s) => s.sectorDemand[k])))}`)
    .join(' | ')}`,
);

const plantsByBasin = Object.fromEntries(ZONE_IDS.map((z) => [z, all.reduce((sum, g) => sum + Object.values(g.state.companies)
  .filter((c) => c.status === 'active').flatMap((c) => c.products)
  .filter((p) => (HEX ? basin(p.hexId) : zoneOf(p).id) === z).length, 0)]));
const relocations = all.reduce((sum, g) => sum + g.factoryMoves, 0);
const launches = all.reduce((sum, g) => sum + g.launches, 0);
const auctions = {
  bids: all.reduce((sum, g) => sum + g.hexAuctions.bids, 0),
  cells: all.reduce((sum, g) => sum + g.hexAuctions.cells, 0),
  contested: all.reduce((sum, g) => sum + g.hexAuctions.contested, 0),
  meanPriceReserve: mean(all.flatMap((g) => g.hexAuctions.priceRatios)) || 1,
  fallbacks: all.reduce((sum, g) => sum + g.hexAuctions.fallbacks, 0),
  abandons: all.reduce((sum, g) => sum + g.hexAuctions.abandons, 0),
  moves: all.reduce((sum, g) => sum + g.hexAuctions.moves, 0),
};
console.log((LANG === 'en' ? '  Factory moves per game: ' : '  Déménagements par partie : ') + f1(relocations / GAMES) + ' (' + relocations + (LANG === 'en' ? ' total)' : ' au total)'));
if (HEX) {
  console.log((LANG === 'en' ? '  Product launches per game: ' : '  Lancements de produits par partie : ') + f1(launches / GAMES) + ' (' + launches + (LANG === 'en' ? ' total)' : ' au total)'));
  console.log(LANG === 'en' ? '\nCell auctions:' : '\nEnchères sur les cases :');
  console.log((LANG === 'en' ? '  Bids per game: ' : '  Mises par partie : ') + f1(auctions.bids / GAMES)
    + (LANG === 'en' ? ' | contested cells: ' : ' | cases disputées : ') + pct(auctions.contested / Math.max(1, auctions.cells))
    + (LANG === 'en' ? ' | mean price / reserve: ×' : ' | prix / réserve moyen : ×') + f1(auctions.meanPriceReserve));
  console.log((LANG === 'en' ? '  Fallbacks per game: ' : '  Replis par partie : ') + f1(auctions.fallbacks / GAMES)
    + (LANG === 'en' ? ' | abandons: ' : ' | abandons : ') + f1(auctions.abandons / GAMES)
    + (LANG === 'en' ? ' | moves executed: ' : ' | déménagements exécutés : ') + f1(auctions.moves / GAMES));
  console.log(LANG === 'en' ? '\nHex board — active plants by basin at game end (total; mean/game):' : '\nPlateau hexagonal — usines actives par bassin en fin de partie (total ; moyenne/partie) :');
  for (const z of ZONE_IDS) {
    const count = plantsByBasin[z];
    console.log('  ' + z.padEnd(12) + ' ' + count + ' ; ' + f1(count / GAMES));
  }
  console.log((LANG === 'en' ? '  Players below 5 M: ' : '  Joueurs sous 5 M : ') + allNW.filter((nw) => nw < 5000).length + ' / ' + allNW.length);
}

const terrainGroups = new Map<string, { terrainId: string; sectorId: string; values: number[]; wins: number; expectedWins: number; ranks: number[] }>();
for (const result of all.flatMap((game) => game.terrainResults)) {
  const key = `${result.terrainId}|${result.sectorId}`;
  const group = terrainGroups.get(key) ?? { terrainId: result.terrainId, sectorId: result.sectorId, values: [], wins: 0, expectedWins: 0, ranks: [] };
  group.values.push(result.netWorth);
  group.wins += Number(result.won);
  group.expectedWins += 1 / result.gamePlayers;
  if (result.rank !== null) group.ranks.push(result.rank);
  terrainGroups.set(key, group);
}
const terrainSectorResults = [...terrainGroups.values()]
  .sort((a, b) => a.terrainId.localeCompare(b.terrainId) || a.sectorId.localeCompare(b.sectorId))
  .map(({ terrainId, sectorId, values, wins, expectedWins, ranks }) => ({
    terrainId, sectorId, players: values.length, medianNetWorth: quantile(values, 0.5), wins, winRate: wins / values.length,
    expectedWins, winRatio: wins / expectedWins, meanRank: mean(ranks),
    q25NetWorth: quantile(values, 0.25), q75NetWorth: quantile(values, 0.75),
  }));
const sectorResults = SECTOR_LIST.map((sectorId) => {
  const games = all.flatMap((game) => game.playerResults.filter((p) => p.sectorId === sectorId).map((p) => ({ ...p, gamePlayers: game.lobbyPlayers })));
  const values = games.map((p) => p.netWorth);
  const wins = games.filter((p) => p.rank === 1).length;
  const expectedWins = games.reduce((sum, p) => sum + 1 / p.gamePlayers, 0);
  const q25NetWorth = quantile(values, 0.25);
  const q75NetWorth = quantile(values, 0.75);
  return {
    sectorId, players: values.length, wins, expectedWins, winRatio: expectedWins > 0 ? wins / expectedWins : null,
    q25NetWorth, medianNetWorth: quantile(values, 0.5), q75NetWorth,
    iqrNetWorth: q75NetWorth - q25NetWorth, q10NetWorth: quantile(values, 0.1), q90NetWorth: quantile(values, 0.9),
  };
}).filter((s) => s.players > 0);
const pumpedGames = all.filter((game) => game.cryptoEuphoria > 0);
const cryptoNews = {
  totalCrashes: all.reduce((sum, game) => sum + game.cryptoCrashes, 0),
  crashesPerGame: mean(all.map((game) => game.cryptoCrashes)),
  crashCountsPerGame: all.map((game) => game.cryptoCrashes),
  gamesWithoutCrash: all.filter((game) => game.cryptoCrashes === 0).length,
  pumpedGames: pumpedGames.length,
  crashesPerPumpedGame: pumpedGames.length ? mean(pumpedGames.map((game) => game.cryptoCrashes)) : null,
  pumpedGamesWithoutCrash: pumpedGames.filter((game) => game.cryptoCrashes === 0).length,
  totalEuphoria: all.reduce((sum, game) => sum + game.cryptoEuphoria, 0),
  totalIssues: all.reduce((sum, game) => sum + game.cryptoIssues, 0),
  euphoriaIssueShare: all.reduce((sum, game) => sum + game.cryptoEuphoria, 0) / all.reduce((sum, game) => sum + game.cryptoIssues, 0),
};
const discontinuedProducts = all.reduce((sum, game) => sum + game.discontinuedProducts, 0);
const discontinuedBySector = Object.fromEntries(SECTOR_LIST.map((sectorId) => [sectorId,
  all.reduce((sum, game) => sum + (game.discontinuedBySector[sectorId] ?? 0), 0),
]));
console.log(LANG === 'en' ? '\nStarting sectors (win ratio; net-worth quartiles):' : '\nSecteurs de départ (ratio de victoires ; quartiles de valeur nette) :');
for (const row of sectorResults) {
  console.log(`  ${row.sectorId.padEnd(16)} ×${f1(row.winRatio ?? 0)} ; ${formatMoney(row.q25NetWorth)} | ${formatMoney(row.medianNetWorth)} | ${formatMoney(row.q75NetWorth)}`);
}
console.log((LANG === 'en' ? '  Crypto crashes per game: ' : '  Krachs crypto par partie : ') + f1(cryptoNews.crashesPerGame)
  + ` (${cryptoNews.totalCrashes} total ; ${cryptoNews.gamesWithoutCrash}/${GAMES} sans krach ; ${cryptoNews.pumpedGames} avec euphorie)`);
console.log((LANG === 'en' ? '  Products discontinued: ' : '  Produits retirés du marché : ') + discontinuedProducts
  + ` (${f1(discontinuedProducts / GAMES)}${LANG === 'en' ? '/game' : '/partie'} ; ${Object.entries(discontinuedBySector).map(([id, count]) => `${id} ${count}`).join(', ')})`);
if (HEX) {
  console.log(LANG === 'en' ? '\nOriginal terrain × starting sector (players; median net worth; wins):' : '\nTerrain attribué × secteur de départ (joueurs ; valeur nette médiane ; victoires) :');
  for (const row of terrainSectorResults) {
    console.log(`  ${row.terrainId.padEnd(20)} ${row.sectorId.padEnd(16)} ${String(row.players).padStart(3)} ; ${formatMoney(row.medianNetWorth).padStart(10)} ; ${row.wins} (${pct(row.winRate)})`);
  }
}

if (SUMMARY_PATH) fs.writeFileSync(SUMMARY_PATH, JSON.stringify({
  games: GAMES, turns: TURNS, firstSeed: FIRST_SEED, mode: HEX ? 'hex' : 'classic', botLevel: EXPERTS ? 'expert' : INTERNS ? 'intern' : 'normal',
  players: allNW.length, playersPerGame: all.map((s) => s.lobbyPlayers), netWorth: { min: Math.min(...allNW), q10: quantile(allNW, 0.1), q25: quantile(allNW, 0.25), median: quantile(allNW, 0.5), q75: quantile(allNW, 0.75), q90: quantile(allNW, 0.9), max: Math.max(...allNW) },
  bankruptcies: all.reduce((sum, g) => sum + g.bankruptcies, 0), marginCalls: all.reduce((sum, g) => sum + g.marginCalls, 0),
  nonFinite: all.reduce((sum, g) => sum + g.nonFinite, 0), safetyNetCorrections: engineDiagnostics.nonFiniteFixed,
  sectorResults, cryptoNews,
  discontinuedProducts, discontinuedProductsPerGame: discontinuedProducts / GAMES, discontinuedBySector,
  playersBelow5M: allNW.filter((nw) => nw < 5000).length, plantsByBasin, factoryMoves: relocations, factoryMovesPerGame: relocations / GAMES,
  ...(HEX ? { launches, launchesPerGame: launches / GAMES, hexAuctions: { ...auctions, bidsPerGame: auctions.bids / GAMES,
    contestedShare: auctions.contested / Math.max(1, auctions.cells), fallbacksPerGame: auctions.fallbacks / GAMES,
    abandonsPerGame: auctions.abandons / GAMES, movesPerGame: auctions.moves / GAMES }, terrainSectorResults } : {}),
  // Avec --per-game, la clé « games » devient le détail de chaque partie (elle remplace le compte numérique).
  ...(PER_GAME ? { games: all.map((s) => s.perGame) } : {}),
}, null, 2) + '\n');

const nonFinite = all.reduce((s, x) => s + x.nonFinite, 0);
console.log(`\nNaN / Infinity dans l'état final : ${nonFinite} ; corrections du filet de sécurité : ${engineDiagnostics.nonFiniteFixed}`);

// Extrait du journal de la première partie
const sample = all[0].state;
console.log(`\n--- Extrait du Capital Quotidien (graine ${FIRST_SEED}) ---`);
for (const issue of sample.journal.slice(0, VERBOSE ? sample.journal.length : 4)) {
  const une = issue.articles.find((a) => a.kind === 'headline');
  console.log(`\n[${issue.dateLabel}] À LA UNE : ${une?.title ?? '—'}`);
  for (const a of issue.articles.filter((x) => x.kind === 'results').slice(0, 3)) console.log(`   Résultats : ${a.title}`);
  for (const a of issue.articles.filter((x) => x.kind === 'news').slice(0, 2)) console.log(`   Brève : ${a.title}`);
  for (const q of issue.articles.filter((x) => x.kind === 'quote')) console.log(`   Citation : ${q.title} — ${q.body}`);
  for (const a of issue.articles.filter((x) => x.kind === 'flash').slice(0, VERBOSE ? 50 : 4)) console.log(`   Flash : ${a.title}`);
  for (const r of issue.rumors) console.log(`   Rumeur (${r.reliability}) : ${r.text}`);
}
if (sample.results) {
  console.log('\nClassement final :');
  for (const r of sample.results.ranking) console.log(`  ${sample.players[r.playerId].name.padEnd(28)} ${formatMoney(r.netWorth)}`);
}
if (nonFinite > 0 || engineDiagnostics.nonFiniteFixed > 0) process.exitCode = 1;
