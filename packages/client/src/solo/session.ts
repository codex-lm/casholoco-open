import { BOT_LEVELS, COMMODITY_IDS, SECTOR_IDS, type GameState, type Lang } from '@muchomoney/core';

/** A save is local game data, never a server session or an authentication token. */
export const SOLO_SAVE_KEY = 'casholoco:solo:v1';
export const SOLO_PLAYER_ID = 'human';
export const SOLO_SAVE_VERSION = 1;
export const MAX_SOLO_SAVE_LENGTH = 12 * 1024 * 1024;
export const SOLO_TURNS = [8, 12, 16, 20, 24] as const;

export interface SoloStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SoloSave {
  format: 'casholoco-solo';
  version: typeof SOLO_SAVE_VERSION;
  playerId: typeof SOLO_PLAYER_ID;
  saveId: string;
  state: GameState;
}

export interface SoloSaveInfo {
  saveId: string;
  turn: number;
  totalTurns: number;
  lang: Lang;
  phase: GameState['phase'];
  playerName: string;
  mapMode: 'classic' | 'hex' | 'square';
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteFields(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((key) => finite(value[key]));
}

function strings(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((key) => typeof value[key] === 'string');
}

function records(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(record);
}

function reportShape(value: unknown): boolean {
  if (!record(value) || !finiteFields(value, ['turn', 'revenue', 'cogs', 'marketing', 'rnd', 'fixedCosts', 'interest', 'fines', 'tax', 'netProfit', 'cashEnd', 'debtEnd']) || !records(value.products)) return false;
  return value.products.every((p) => strings(p, ['productId', 'name', 'sectorId']) && SECTOR_IDS.includes(p.sectorId as typeof SECTOR_IDS[number]) && finiteFields(p, ['produced', 'sold', 'revenue', 'marketShare', 'unitCost']));
}

/** Bound both recursion and work before touching any engine or UI code. */
function safeJson(root: unknown): boolean {
  const pending: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++count > 400_000 || depth > 64) return false;
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    if (typeof value === 'string' && value.length > 100_000) return false;
    if (Array.isArray(value)) {
      for (const entry of value) pending.push({ value: entry, depth: depth + 1 });
    } else if (record(value)) {
      for (const [key, entry] of Object.entries(value)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
        pending.push({ value: entry, depth: depth + 1 });
      }
    }
  }
  return true;
}

/** Validate the format and required engine data; optional mechanics are checked by a dry-run on import. */
function gameShape(value: unknown): value is GameState {
  if (!record(value) || !record(value.config)) return false;
  const cfg = value.config;
  if (!SOLO_TURNS.includes(cfg.totalTurns as typeof SOLO_TURNS[number]) || cfg.turnSeconds !== 0) return false;
  if (cfg.lang !== 'fr' && cfg.lang !== 'en') return false;
  if (!finite(cfg.seed) || !Number.isInteger(cfg.startYear) || (cfg.startYear as number) < 1900 || (cfg.startYear as number) > 9999) return false;
  if (cfg.mapMode !== undefined && !['classic', 'hex', 'square'].includes(cfg.mapMode as string)) return false;
  if (cfg.botLevel !== undefined && !BOT_LEVELS.includes(cfg.botLevel as typeof BOT_LEVELS[number])) return false;
  if (cfg.allowBotTakeover === true) return false;
  if (value.phase !== 'playing' && value.phase !== 'finished') return false;
  if (!Number.isInteger(value.turn) || (value.turn as number) < 1 || (value.turn as number) > (cfg.totalTurns as number)) return false;
  if (!Number.isInteger(value.rngState) || (value.rngState as number) < 0 || (value.rngState as number) > 0xffffffff) return false;
  if (!Number.isInteger(value.nextId) || (value.nextId as number) < 1) return false;
  if (!record(value.players) || !record(value.companies) || !record(value.sectors) || !record(value.commodities) || !record(value.macro)) return false;
  const playerRecords = value.players;
  const players = Object.entries(playerRecords);
  if (players.length < 2 || players.length > 8 || !record(value.players[SOLO_PLAYER_ID])) return false;
  if (players.filter(([, p]) => record(p) && p.isBot === false).length !== 1) return false;
  for (const [id, p] of players) {
    if (!record(p) || p.id !== id || !strings(p, ['name', 'color']) || typeof p.isBot !== 'boolean' || typeof p.connected !== 'boolean' || typeof p.ready !== 'boolean') return false;
    if ((id === SOLO_PLAYER_ID) === p.isBot || p.botTakeover !== undefined) return false;
    if (!finiteFields(p, ['cash', 'debt']) || !record(p.stats) || !Array.isArray(p.netWorthHistory) || !p.netWorthHistory.every(finite)) return false;
    if (!finiteFields(p.stats, ['shadyActions', 'scandals', 'finesPaid', 'takeoversWon', 'takeoversSuffered', 'parachutes', 'rndSpent', 'marketingSpent', 'oilConsumed', 'bonusesTaken', 'dividendsReceived', 'startupsFounded', 'worstTurnLoss', 'bankruptcies'])) return false;
    if (p.isBot && (typeof p.botPersonalityId !== 'string' || (p.botLevel !== undefined && !BOT_LEVELS.includes(p.botLevel as typeof BOT_LEVELS[number])))) return false;
  }
  const companies = Object.entries(value.companies);
  if (!companies.length || companies.length > 1000) return false;
  for (const [id, c] of companies) {
    if (!record(c) || c.id !== id || !strings(c, ['name', 'ticker', 'emoji', 'color', 'ceoName'])) return false;
    if (!['active', 'bankrupt', 'merged'].includes(c.status as string) || !record(c.holdings) || !record(c.inventory) || !record(c.turnFlags)) return false;
    if (c.controllerId !== null && !Object.hasOwn(value.players, c.controllerId as string)) return false;
    if (c.founderId !== null && !Object.hasOwn(value.players, c.founderId as string)) return false;
    if (!finiteFields(c, ['foundedTurn', 'cash', 'debt', 'sharesOutstanding', 'sharePrice', 'sentiment', 'reputation', 'scandal', 'profitEma', 'revenueEma']) || (c.sharesOutstanding as number) <= 0) return false;
    if (!Array.isArray(c.priceHistory) || !c.priceHistory.every(finite) || !Array.isArray(c.products) || !records(c.modifiers) || !Array.isArray(c.reports) || !c.reports.every(reportShape)) return false;
    if (!finite(c.turnFlags.bonusTaken) || typeof c.turnFlags.buybackDone !== 'boolean' || !Array.isArray(c.turnFlags.shadyDone)) return false;
    if (!Object.entries(c.holdings).every(([player, shares]) => Object.hasOwn(playerRecords, player) && finite(shares) && shares >= 0)) return false;
    if (!['land', 'sites', 'productProfiles', 'launchCharges'].every((key) => c[key] === undefined || records(c[key]))) return false;
    for (const product of c.products) {
      if (!record(product) || !strings(product, ['id', 'name']) || !SECTOR_IDS.includes(product.sectorId as typeof SECTOR_IDS[number])) return false;
      if (!finiteFields(product, ['quality', 'brand', 'capacity', 'pendingCapacity', 'stock', 'price', 'production', 'marketing', 'rnd', 'lastSales', 'lastProduced', 'lastRevenue', 'lastMarketShare', 'lastUnitCost', 'launchedTurn'])) return false;
    }
  }
  for (const id of SECTOR_IDS) {
    const sector = value.sectors[id];
    if (!record(sector) || sector.id !== id || !finiteFields(sector, ['demandMultiplier', 'outsideQuality', 'lastTotalDemand']) || !Array.isArray(sector.demandHistory)) return false;
  }
  for (const id of COMMODITY_IDS) {
    const commodity = value.commodities[id];
    if (!record(commodity) || commodity.id !== id || !finite(commodity.price) || !Array.isArray(commodity.priceHistory)) return false;
  }
  if (!finiteFields(value.macro, ['baseInterestRate', 'baseTaxRate', 'marketSentiment'])) return false;
  if (!['activeEffects', 'journal', 'scheduledNews', 'shareSales'].every((key) => records(value[key]))) return false;
  if (!['offers', 'contracts', 'cartels', 'siteSlots', 'siteBids', 'hexBids', 'hexAuctionResults', 'shareBuys'].every((key) => value[key] === undefined || records(value[key]))) return false;
  if (!Array.isArray(value.recentNewsIds) || !value.recentNewsIds.every((id) => typeof id === 'string')) return false;
  for (const issue of value.journal as Record<string, unknown>[]) {
    if (!finite(issue.turn) || typeof issue.dateLabel !== 'string' || !records(issue.articles) || !records(issue.rumors)) return false;
    if (!issue.articles.every((article) => strings(article, ['id', 'title', 'body', 'tone', 'kind']))) return false;
    if (!issue.rumors.every((rumor) => strings(rumor, ['text', 'reliability']))) return false;
  }
  if (value.phase === 'finished') {
    if (value.turn !== cfg.totalTurns || !record(value.results) || !records(value.results.ranking) || !records(value.results.trophies)) return false;
    if (!value.results.ranking.every((r) => typeof r.playerId === 'string' && Object.hasOwn(playerRecords, r.playerId) && finite(r.netWorth))) return false;
    if (!value.results.trophies.every((t) => strings(t, ['trophyId', 'playerId']) && finite(t.value))) return false;
  }
  return safeJson(value);
}

export function encodeSoloSave(state: GameState, saveId: string): string {
  return JSON.stringify({ format: 'casholoco-solo', version: SOLO_SAVE_VERSION, playerId: SOLO_PLAYER_ID, saveId, state } satisfies SoloSave);
}

export function decodeSoloSave(text: string): SoloSave | null {
  if (typeof text !== 'string' || text.length > MAX_SOLO_SAVE_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!record(value) || value.format !== 'casholoco-solo' || value.version !== SOLO_SAVE_VERSION || value.playerId !== SOLO_PLAYER_ID || typeof value.saveId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(value.saveId) || !gameShape(value.state)) return null;
    return value as unknown as SoloSave;
  } catch {
    return null;
  }
}

export function saveInfo(state: GameState, saveId: string): SoloSaveInfo {
  return {
    saveId,
    turn: state.turn,
    totalTurns: state.config.totalTurns,
    lang: state.config.lang ?? 'fr',
    phase: state.phase,
    playerName: state.players[SOLO_PLAYER_ID].name,
    mapMode: state.config.mapMode ?? 'classic',
  };
}
