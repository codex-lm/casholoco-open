/**
 * Local authority for a peer-hosted game. The transport binds each channel to one
 * player ID and routes only that player's snapshot. GameState never crosses it.
 */
import {
  BOT_LEVELS, PLAYER_COLORS, SECTOR_IDS, allHumansReady, applyAction as coreApplyAction,
  createGame, getContent, getPlayerView, resolveTurn, setPlayerConnected, setPlayerReady,
  type Action, type ActionResult, type BotLevel, type GameConfig, type GameState,
  type Lang, type LobbyPlayer, type LobbyView, type PlayerView, type SectorId,
} from '@muchomoney/core';
import type { SoloOptions } from '../solo/runtime';

export const PEER_HOST_ID = 'host';
export const PEER_MAX_PLAYERS = 8;
const TURNS = [8, 12, 16, 20, 24] as const;
const HOST_SAVE_LIMIT = 12 * 1024 * 1024;

export type PeerSnapshot = { kind: 'lobby'; lobby: LobbyView } | { kind: 'game'; view: PlayerView };
export type PeerSnapshotListener = (playerId: string, snapshot: PeerSnapshot) => void;
export type PeerAuthorityOptions = SoloOptions & { sessionId?: string; onSnapshot?: PeerSnapshotListener };
export interface PeerJoinOptions { id: string; name?: string; companyName?: string; sectorId?: SectorId }
export interface PeerBotOptions { personalityId?: string; level?: BotLevel }
interface NormalOptions {
  name: string;
  companyName: string;
  sectorId: SectorId;
  botCount: number;
  botLevel: BotLevel;
  mapMode: 'classic' | 'hex' | 'square';
  totalTurns: typeof TURNS[number];
  seed: number;
  lang: Lang;
}
interface HostSave {
  format: 'casholoco-peer-host';
  version: 1;
  sessionId: string;
  options: NormalOptions;
  players: LobbyPlayer[];
  state: GameState | null;
}

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clean = (value: unknown, fallback: string): string => typeof value === 'string'
  ? value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40).trim() || fallback : fallback;
const validSessionId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(id);
const validGuestId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id) && id !== PEER_HOST_ID && !/^bot/i.test(id);
const randomSeed = (): number => typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
  ? crypto.getRandomValues(new Uint32Array(1))[0] : (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
const newSessionId = (): string => `peer-${Date.now().toString(36)}-${randomSeed().toString(36)}`;

function normalize(input: SoloOptions): NormalOptions {
  const lang = input.lang === 'en' ? 'en' : 'fr';
  return {
    name: clean(input.name, lang === 'en' ? 'You' : 'Vous'),
    companyName: clean(input.companyName, 'Synergix'),
    sectorId: SECTOR_IDS.includes(input.sectorId!) ? input.sectorId! : 'energy_drinks',
    botCount: finite(input.botCount) ? Math.min(7, Math.max(0, Math.round(input.botCount))) : 0,
    botLevel: BOT_LEVELS.includes(input.botLevel!) ? input.botLevel! : 'normal',
    mapMode: input.mapMode === 'hex' || input.mapMode === 'square' ? input.mapMode : 'classic',
    totalTurns: TURNS.includes(input.totalTurns!) ? input.totalTurns! : 16,
    seed: finite(input.seed) ? input.seed : randomSeed(), lang,
  };
}

const text = {
  fr: {
    ok: 'D’accord.', unknown: 'Ce joueur n’appartient pas à la partie.', full: 'La partie compte déjà huit joueurs et bots.',
    started: 'La partie a déjà commencé.', name: 'Ce nom de PDG est déjà utilisé.', host: 'L’hôte doit rester dans la partie.',
    needPlayers: 'Ajoutez un invité ou un bot pour commencer.', disconnected: 'Ce joueur est déconnecté.',
    stale: 'Ce trimestre est déjà clôturé. Consultez la nouvelle situation avant de rejouer.',
    noGame: 'La partie n’a pas encore commencé.', finished: 'La partie est terminée.',
    internal: 'Le trimestre n’a pas pu être clôturé. La partie précédente est conservée.',
    invalidSave: 'Cette sauvegarde multijoueur est invalide. La partie actuelle est conservée.', bot: 'Ce bot n’est pas disponible.',
  },
  en: {
    ok: 'Done.', unknown: 'This player is not in the game.', full: 'The game already has eight players and bots.',
    started: 'The game has already started.', name: 'That CEO name is already taken.', host: 'The host must stay in the game.',
    needPlayers: 'Add a guest or a bot to start.', disconnected: 'This player is disconnected.',
    stale: 'That quarter has already closed. Check the new situation before playing again.',
    noGame: 'The game has not started yet.', finished: 'The game has finished.',
    internal: 'The quarter could not close. The previous game state has been kept.',
    invalidSave: 'This multiplayer save is invalid. The current game has been kept.', bot: 'That bot is not available.',
  },
} as const;

/** Basic bounded JSON checks precede engine validation of imported host saves. */
function boundedData(root: unknown): boolean {
  const pending = [{ value: root, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++count > 400_000 || depth > 64) return false;
    if (typeof value === 'number' && !finite(value)) return false;
    if (typeof value === 'string' && value.length > 100_000) return false;
    if (Array.isArray(value)) for (const entry of value) pending.push({ value: entry, depth: depth + 1 });
    else if (isRecord(value)) for (const [key, entry] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
      pending.push({ value: entry, depth: depth + 1 });
    }
  }
  return true;
}

function validSeat(value: unknown): value is LobbyPlayer {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.isBot !== 'boolean' || typeof value.connected !== 'boolean') return false;
  if (!['name', 'companyName', 'color'].every((key) => typeof value[key] === 'string' && (value[key] as string).length > 0 && (value[key] as string).length <= 40)) return false;
  if (!SECTOR_IDS.includes(value.sectorId as SectorId)) return false;
  if (value.isBot) return /^bot[1-7]$/.test(value.id) && typeof value.botPersonalityId === 'string' && BOT_LEVELS.includes(value.botLevel as BotLevel);
  return value.id === PEER_HOST_ID || validGuestId(value.id);
}

function finiteFields(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => finite(value[key]));
}

function validHostGame(state: Record<string, unknown>, seats: LobbyPlayer[], options: Record<string, unknown>): boolean {
  if (!isRecord(state.config) || state.config.turnSeconds !== 0 || state.config.allowBotTakeover === true) return false;
  if (state.config.totalTurns !== options.totalTurns || state.config.seed !== options.seed || state.config.lang !== options.lang || (state.config.mapMode ?? 'classic') !== options.mapMode) return false;
  if (!Number.isInteger(state.turn) || (state.turn as number) < 1 || (state.turn as number) > (state.config.totalTurns as number) || !['playing', 'finished'].includes(state.phase as string)) return false;
  if (!Number.isInteger(state.rngState) || (state.rngState as number) < 0 || (state.rngState as number) > 0xffffffff || !Number.isInteger(state.nextId) || (state.nextId as number) < 1) return false;
  if (!isRecord(state.players) || !isRecord(state.companies) || !isRecord(state.sectors) || !isRecord(state.commodities) || !isRecord(state.macro)) return false;
  if (!finiteFields(state.macro, ['baseInterestRate', 'baseTaxRate', 'marketSentiment'])) return false;
  if (!['journal', 'activeEffects', 'scheduledNews', 'recentNewsIds', 'shareSales'].every((key) => Array.isArray(state[key]))) return false;
  if (Object.keys(state.players).length !== seats.length || seats.length < 2) return false;
  const playerRecords = state.players;
  for (const seat of seats) {
    const actual = playerRecords[seat.id];
    if (!isRecord(actual) || actual.id !== seat.id || actual.isBot !== seat.isBot || actual.name !== seat.name || actual.botTakeover !== undefined) return false;
    if (!finiteFields(actual, ['cash', 'debt']) || !isRecord(actual.stats) || !Array.isArray(actual.netWorthHistory)) return false;
    if (!finiteFields(actual.stats, ['shadyActions', 'scandals', 'finesPaid', 'takeoversWon', 'takeoversSuffered', 'parachutes', 'rndSpent', 'marketingSpent', 'oilConsumed', 'bonusesTaken', 'dividendsReceived', 'startupsFounded', 'worstTurnLoss', 'bankruptcies'])) return false;
    if (typeof actual.connected !== 'boolean' || typeof actual.ready !== 'boolean') return false;
  }
  for (const [id, company] of Object.entries(state.companies)) {
    if (!isRecord(company) || company.id !== id || !['active', 'bankrupt', 'merged'].includes(company.status as string)) return false;
    if (!['name', 'ticker', 'emoji', 'color', 'ceoName'].every((key) => typeof company[key] === 'string')) return false;
    if (!finiteFields(company, ['foundedTurn', 'cash', 'debt', 'sharesOutstanding', 'sharePrice', 'sentiment', 'reputation', 'scandal', 'profitEma', 'revenueEma'])) return false;
    if (!isRecord(company.holdings) || !isRecord(company.inventory) || !isRecord(company.turnFlags)) return false;
    if (company.controllerId !== null && !Object.hasOwn(playerRecords, company.controllerId as string)) return false;
    if (!Array.isArray(company.products) || !Array.isArray(company.priceHistory) || !Array.isArray(company.reports) || !Array.isArray(company.modifiers)) return false;
    for (const product of company.products) {
      if (!isRecord(product) || typeof product.id !== 'string' || typeof product.name !== 'string' || !SECTOR_IDS.includes(product.sectorId as SectorId)) return false;
      if (!finiteFields(product, ['quality', 'brand', 'capacity', 'pendingCapacity', 'stock', 'price', 'production', 'marketing', 'rnd', 'lastSales', 'lastProduced', 'lastRevenue', 'lastMarketShare', 'lastUnitCost', 'launchedTurn'])) return false;
    }
    for (const report of company.reports) {
      if (!isRecord(report) || !finiteFields(report, ['turn', 'revenue', 'cogs', 'marketing', 'rnd', 'fixedCosts', 'interest', 'fines', 'tax', 'netProfit', 'cashEnd', 'debtEnd']) || !Array.isArray(report.products)) return false;
      if (!report.products.every((p) => isRecord(p) && typeof p.productId === 'string' && typeof p.name === 'string' && finiteFields(p, ['produced', 'sold', 'revenue', 'marketShare', 'unitCost']))) return false;
    }
  }
  if (state.phase === 'finished') {
    if (state.turn !== options.totalTurns || !isRecord(state.results) || !Array.isArray(state.results.ranking) || !Array.isArray(state.results.trophies)) return false;
    if (!state.results.ranking.every((r) => isRecord(r) && typeof r.playerId === 'string' && Object.hasOwn(playerRecords, r.playerId) && finite(r.netWorth))) return false;
    if (!state.results.trophies.every((t) => isRecord(t) && typeof t.playerId === 'string' && typeof t.trophyId === 'string' && finite(t.value))) return false;
  }
  return true;
}

function parseHostSave(raw: string): HostSave | null {
  if (typeof raw !== 'string' || raw.length > HOST_SAVE_LIMIT) return null;
  try {
    const save: unknown = JSON.parse(raw);
    if (!boundedData(save) || !isRecord(save) || save.format !== 'casholoco-peer-host' || save.version !== 1 || !validSessionId(save.sessionId) || !isRecord(save.options)) return null;
    if (!Array.isArray(save.players) || save.players.length < 1 || save.players.length > PEER_MAX_PLAYERS || !save.players.every(validSeat)) return null;
    const players = save.players;
    if (new Set(players.map((p) => p.id)).size !== players.length || !players.some((p) => p.id === PEER_HOST_ID && !p.isBot)) return null;
    const cfg = save.options;
    if (!['fr', 'en'].includes(cfg.lang as string) || !TURNS.includes(cfg.totalTurns as typeof TURNS[number]) || !finite(cfg.seed)) return null;
    if (!['classic', 'hex', 'square'].includes(cfg.mapMode as string) || !BOT_LEVELS.includes(cfg.botLevel as BotLevel) || !SECTOR_IDS.includes(cfg.sectorId as SectorId)) return null;
    if (!finite(cfg.botCount) || cfg.botCount < 0 || cfg.botCount > 7 || typeof cfg.name !== 'string' || typeof cfg.companyName !== 'string') return null;
    if (save.state !== null) {
      const state = save.state;
      if (!isRecord(state) || !validHostGame(state, players, cfg)) return null;
      // Both view building and a trial next quarter must work without changing the imported state.
      for (const p of players.filter((p) => !p.isBot)) getPlayerView(state as unknown as GameState, p.id);
      const probe = copy(state) as unknown as GameState;
      if (probe.phase === 'playing') resolveTurn(probe);
      if (!boundedData(probe)) return null;
    }
    return save as unknown as HostSave;
  } catch { return null; }
}

export function createPeerAuthority(input: PeerAuthorityOptions = {}) {
  let options = normalize(input);
  let sessionId = validSessionId(input.sessionId) ? input.sessionId : newSessionId();
  let state: GameState | null = null;
  let players: LobbyPlayer[] = [{
    id: PEER_HOST_ID, name: options.name, companyName: options.companyName, sectorId: options.sectorId,
    isBot: false, connected: true, color: PLAYER_COLORS[0],
  }];
  const listeners = new Set<PeerSnapshotListener>(input.onSnapshot ? [input.onSnapshot] : []);
  const message = () => text[options.lang];
  const ok = (): ActionResult => ({ ok: true, message: message().ok });
  const fail = (key: keyof typeof text.fr): ActionResult => ({ ok: false, message: message()[key] });
  const gameConfig = (): GameConfig => ({
    totalTurns: options.totalTurns, turnSeconds: 0, startYear: 2027, seed: options.seed, lang: options.lang,
    botLevel: options.botLevel, allowBotTakeover: false,
    ...(options.mapMode === 'classic' ? {} : { mapMode: options.mapMode, terrainAssignment: 'fair', industryRules: 'network' }),
  });
  const lobby = (playerId = PEER_HOST_ID): LobbyView => {
    const { seed: _seed, ...config } = gameConfig();
    const used = new Set(players.filter((p) => p.isBot).map((p) => p.botPersonalityId));
    return {
      roomCode: sessionId, hostId: PEER_HOST_ID, you: playerId, players: copy(players), config, maxPlayers: PEER_MAX_PLAYERS,
      availableBots: getContent(options.lang).bots.filter((b) => !used.has(b.id)).map(({ id, ceoName, companyName, emoji, tagline }) => ({ id, ceoName, companyName, emoji, tagline })),
    };
  };
  const view = (playerId: string): PlayerView | null => {
    if (!state || !Object.hasOwn(state.players, playerId) || state.players[playerId].isBot) return null;
    return getPlayerView(state, playerId);
  };
  const publish = () => {
    for (const player of players.filter((p) => !p.isBot)) {
      const snapshot: PeerSnapshot = state ? { kind: 'game', view: view(player.id)! } : { kind: 'lobby', lobby: lobby(player.id) };
      for (const listener of listeners) {
        // One dropped channel cannot prevent a committed turn reaching the others.
        try { listener(player.id, snapshot); } catch { /* transport/UI handles its own error reporting */ }
      }
    }
  };
  const ensureGamePlayer = (playerId: string, turn: number): ActionResult | null => {
    if (!state) return fail('noGame');
    const player = state.players[playerId];
    if (!Object.hasOwn(state.players, playerId) || !player || player.isBot) return fail('unknown');
    if (!player.connected) return fail('disconnected');
    if (state.phase === 'finished') return fail('finished');
    if (!Number.isInteger(turn) || turn !== state.turn) return fail('stale');
    return null;
  };
  const addBotInternal = (request: PeerBotOptions = {}): ActionResult => {
    if (state) return fail('started');
    if (players.length >= PEER_MAX_PLAYERS) return fail('full');
    const bots = getContent(options.lang).bots;
    const used = new Set(players.map((p) => p.botPersonalityId));
    const bot = request.personalityId ? bots.find((b) => b.id === request.personalityId && !used.has(b.id)) : bots.find((b) => !used.has(b.id));
    if (!bot) return fail('bot');
    const botIndex = Array.from({ length: 7 }, (_, n) => n + 1).find((n) => !players.some((p) => p.id === `bot${n}`))!;
    const color = PLAYER_COLORS.find((c) => !players.some((p) => p.color === c)) ?? PLAYER_COLORS[players.length];
    players.push({ id: `bot${botIndex}`, name: bot.ceoName, companyName: bot.companyName, sectorId: bot.preferredSectors[0],
      isBot: true, connected: true, botPersonalityId: bot.id,
      botLevel: BOT_LEVELS.includes(request.level!) ? request.level : options.botLevel, color });
    options.botCount = players.filter((p) => p.isBot).length;
    return ok();
  };
  const initialBots = options.botCount;
  for (let i = 0; i < initialBots; i++) addBotInternal();

  return {
    getSessionId(): string { return sessionId; },
    getPhase(): 'lobby' | GameState['phase'] { return state?.phase ?? 'lobby'; },
    getLobby: lobby,
    getView: view,
    subscribe(listener: PeerSnapshotListener): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish,
    joinPlayer(request: PeerJoinOptions): ActionResult {
      if (!validGuestId(request.id)) return fail('unknown');
      const existing = players.find((p) => p.id === request.id);
      if (existing) {
        if (existing.isBot || existing.connected) return fail('unknown');
        return this.setConnected(request.id, true);
      }
      if (state) return fail('started');
      if (players.length >= PEER_MAX_PLAYERS) return fail('full');
      const name = clean(request.name, options.lang === 'en' ? `Guest ${players.length}` : `Invité ${players.length}`);
      if (players.some((p) => p.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) return fail('name');
      players.push({ id: request.id, name, companyName: clean(request.companyName, options.lang === 'en' ? `${name} & Co` : `${name} & Cie`),
        sectorId: SECTOR_IDS.includes(request.sectorId!) ? request.sectorId! : 'energy_drinks', isBot: false, connected: true,
        color: PLAYER_COLORS.find((c) => !players.some((p) => p.color === c)) ?? PLAYER_COLORS[players.length] });
      publish();
      return ok();
    },
    updatePlayer(playerId: string, patch: { name?: string; companyName?: string; sectorId?: SectorId }): ActionResult {
      if (state) return fail('started');
      const player = players.find((p) => p.id === playerId && !p.isBot);
      if (!player) return fail('unknown');
      const name = clean(patch.name, player.name);
      if (players.some((p) => p.id !== playerId && p.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) return fail('name');
      player.name = name;
      player.companyName = clean(patch.companyName, player.companyName);
      if (SECTOR_IDS.includes(patch.sectorId!)) player.sectorId = patch.sectorId!;
      if (playerId === PEER_HOST_ID) {
        options.name = player.name;
        options.companyName = player.companyName;
        options.sectorId = player.sectorId;
      }
      publish();
      return ok();
    },
    addBot(request: PeerBotOptions = {}): ActionResult { const result = addBotInternal(request); if (result.ok) publish(); return result; },
    removePlayer(playerId: string): ActionResult {
      if (playerId === PEER_HOST_ID) return fail('host');
      const player = players.find((p) => p.id === playerId);
      if (!player) return fail('unknown');
      if (state) return player.isBot ? fail('started') : this.setConnected(playerId, false);
      players = players.filter((p) => p.id !== playerId);
      options.botCount = players.filter((p) => p.isBot).length;
      publish();
      return ok();
    },
    setConnected(playerId: string, connected: boolean): ActionResult {
      if (typeof connected !== 'boolean') return fail('unknown');
      const seat = players.find((p) => p.id === playerId && !p.isBot);
      if (!seat) return fail('unknown');
      if (!state) { seat.connected = connected; publish(); return ok(); }
      let next: GameState;
      try {
        next = copy(state);
        setPlayerConnected(next, playerId, connected);
        setPlayerReady(next, playerId, false);
        if (next.phase === 'playing' && allHumansReady(next)) resolveTurn(next);
      } catch { return fail('internal'); }
      seat.connected = connected;
      state = next;
      publish();
      return ok();
    },
    configure(patch: Partial<SoloOptions>): ActionResult {
      if (state) return fail('started');
      const next = normalize({ ...options, ...patch });
      const host = players.find((p) => p.id === PEER_HOST_ID)!;
      if (players.some((p) => p.id !== PEER_HOST_ID && p.name.toLocaleLowerCase('fr') === next.name.toLocaleLowerCase('fr'))) return fail('name');
      options = next;
      host.name = next.name; host.companyName = next.companyName; host.sectorId = next.sectorId;
      const wanted = Math.min(next.botCount, 8 - players.filter((p) => !p.isBot).length);
      while (players.filter((p) => p.isBot).length > wanted) players.splice(players.map((p) => p.isBot).lastIndexOf(true), 1);
      while (players.filter((p) => p.isBot).length < wanted) if (!addBotInternal().ok) break;
      const bots = getContent(options.lang).bots;
      for (const p of players.filter((p) => p.isBot)) {
        const bot = bots.find((b) => b.id === p.botPersonalityId);
        if (bot) { p.name = bot.ceoName; p.companyName = bot.companyName; }
        p.botLevel = options.botLevel;
      }
      options.botCount = players.filter((p) => p.isBot).length;
      publish();
      return ok();
    },
    startGame(): ActionResult {
      if (state) return fail('started');
      if (players.length < 2) return fail('needPlayers');
      try { state = createGame(gameConfig(), copy(players)); }
      catch { return fail('internal'); }
      publish();
      return ok();
    },
    applyAction(playerId: string, action: Action, turn: number): ActionResult {
      const denied = ensureGamePlayer(playerId, turn);
      if (denied) return denied;
      const result = coreApplyAction(state!, playerId, action);
      if (result.ok) publish();
      return result;
    },
    ready(playerId: string, ready: boolean, turn: number): ActionResult {
      if (typeof ready !== 'boolean') return fail('unknown');
      const denied = ensureGamePlayer(playerId, turn);
      if (denied) return denied;
      let next: GameState;
      try {
        next = copy(state!);
        setPlayerReady(next, playerId, ready);
        if (allHumansReady(next)) resolveTurn(next);
      } catch { return fail('internal'); }
      state = next;
      publish();
      return ok();
    },
    exportHostSave(): string {
      return JSON.stringify({ format: 'casholoco-peer-host', version: 1, sessionId, options, players, state } satisfies HostSave);
    },
    importHostSave(raw: string): ActionResult {
      const save = parseHostSave(raw);
      if (!save) return fail('invalidSave');
      options = save.options;
      sessionId = save.sessionId;
      players = save.players;
      state = save.state;
      // Only the host is present after a reload; guests reconnect through new channels.
      for (const player of players.filter((p) => !p.isBot)) {
        player.connected = player.id === PEER_HOST_ID;
        if (state) { setPlayerConnected(state, player.id, player.connected); setPlayerReady(state, player.id, false); }
      }
      publish();
      return ok();
    },
  };
}

export type PeerAuthority = ReturnType<typeof createPeerAuthority>;
