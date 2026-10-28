/** Création d'une partie (§4). */
import { freeBuildableHexes, zoneHexId } from './hexes';
import { capitalCellId, isSpatialMap, hexDistance } from '../content/hexes';
import { boardTerrains } from '../content/boardTerrains';

import { COMMODITIES, getContent, SECTORS } from '../content';
import {
  BOT_LEVELS,
  COMMODITY_IDS,
  DEFAULT_CONFIG,
  LANGS,
  SECTOR_IDS,
  type BotLevel,
  type CommodityId,
  type CommodityState,
  type GameConfig,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerState,
  type PlayerStats,
  type SectorId,
  type SectorState,
} from '../types';
import {
  BASE_INTEREST_RATE,
  BASE_TAX_RATE,
  COMPANY_START_CASH,
  FOUNDER_STAKE,
  PLAYER_START_CASH,
  PRICE_FLOOR,
  START_BRAND,
  START_SHARES,
} from './constants';
import { buildSiteSlots } from './deals';
import { makeTicker, newCompany, newProduct, suggestProductName, uniqueCompanyName } from './factory';
import { estimatedUnitCost, expectedStartProfits, targetSharePrice } from './finance';
import { brandAfter, estimateSales, marketInputs, qualityAfter } from './advice';
import { terrainMultiplier } from './terrains';
import { seedToRngState } from './rng';
import { textsFor } from './i18n';
import { startTurn } from './turn';
import { cleanName, fin, isFiniteNumber } from './util';
import { assessTerrains, assignStartingTerrains } from './terrainAssignment';
import { openingTerrainArticles } from './terrainNews';
import { fortuneSnapshot } from './closeRecap';

const NPC_COLORS = ['#7d8597', '#a47148', '#6b9080', '#b56576', '#8d99ae', '#997b66', '#5e6472', '#84a59d'];

export function emptyStats(): PlayerStats {
  return {
    shadyActions: 0,
    scandals: 0,
    finesPaid: 0,
    takeoversWon: 0,
    takeoversSuffered: 0,
    parachutes: 0,
    rndSpent: 0,
    marketingSpent: 0,
    oilConsumed: 0,
    bonusesTaken: 0,
    dividendsReceived: 0,
    startupsFounded: 0,
    worstTurnLoss: 0,
    bankruptcies: 0,
  };
}

function intIn(x: unknown, lo: number, hi: number, fallback: number): number {
  if (!isFiniteNumber(x)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(x)));
}

export function createGameState(config: GameConfig, lobbyPlayers: LobbyPlayer[], options: { preview?: boolean } = {}): GameState {
  const cfg: GameConfig = {
    totalTurns: intIn(config?.totalTurns, 1, 100, DEFAULT_CONFIG.totalTurns),
    // 0 = sans chrono : seul le serveur s'en sert, la simulation l'ignore.
    turnSeconds: config?.turnSeconds === 0 ? 0 : intIn(config?.turnSeconds, 5, 3600, DEFAULT_CONFIG.turnSeconds),
    startYear: intIn(config?.startYear, 1900, 9999, DEFAULT_CONFIG.startYear),
    seed: isFiniteNumber(config?.seed) ? config.seed : 0,
    lang: LANGS.includes(config?.lang as Lang) ? (config.lang as Lang) : (DEFAULT_CONFIG.lang ?? 'fr'),
  };
  if (isSpatialMap(config)) {
    cfg.mapMode = config.mapMode;
    if (config.industryRules === 'network') cfg.industryRules = 'network';
    if (config.terrainAssignment !== undefined && !['fair', 'fair_varied', 'random', 'choice', 'host'].includes(config.terrainAssignment)) throw new Error('Unknown terrain assignment mode');
    cfg.terrainAssignment = config.terrainAssignment ?? 'fair';
    if ((cfg.terrainAssignment === 'host' || cfg.terrainAssignment === 'choice') && config.terrains !== undefined) cfg.terrains = { ...config.terrains };
  }
  if (isFiniteNumber(config?.textSeed)) cfg.textSeed = config.textSeed;
  // Bots « stagiaires » ou « experts » (§10) : seulement si demandé explicitement ; absent = 'normal'.
  if (config?.botLevel === 'intern' || config?.botLevel === 'expert') cfg.botLevel = config.botLevel;
  // Textes (noms des bots et des PNJ, produits) dans la langue de la partie ; les nombres sont communs.
  const content = getContent(cfg.lang);
  const T = textsFor(cfg.lang);

  const sectors = {} as Record<SectorId, SectorState>;
  for (const id of SECTOR_IDS) {
    sectors[id] = { id, demandMultiplier: 1, outsideQuality: 1, demandHistory: [], lastTotalDemand: SECTORS[id].refDemand };
  }
  const commodities = {} as Record<CommodityId, CommodityState>;
  for (const id of COMMODITY_IDS) {
    commodities[id] = { id, price: COMMODITIES[id].basePrice, priceHistory: [COMMODITIES[id].basePrice] };
  }

  const state: GameState = {
    config: cfg,
    turn: 1,
    phase: 'playing',
    rngState: seedToRngState(cfg.seed),
    nextId: 1,
    players: {},
    companies: {},
    sectors,
    commodities,
    macro: { baseInterestRate: BASE_INTEREST_RATE, baseTaxRate: BASE_TAX_RATE, marketSentiment: 1 },
    activeEffects: [],
    siteSlots: buildSiteSlots(isFiniteNumber(cfg.textSeed) ? cfg.textSeed : cfg.seed, content.siteNames),
    journal: [],
    scheduledNews: [],
    recentNewsIds: [],
    shareSales: [],
  };

  // Joueurs (humains et bots) et leurs entreprises
  for (const lp of Array.isArray(lobbyPlayers) ? lobbyPlayers : []) {
    if (!lp || typeof lp.id !== 'string' || lp.id.length === 0 || Object.prototype.hasOwnProperty.call(state.players, lp.id)) continue;
    const pers = lp.isBot ? content.bots.find((b) => b.id === lp.botPersonalityId) : undefined;
    const name = cleanName(lp.name, 40) ?? (pers ? pers.ceoName : T.anonymous);
    const player: PlayerState = {
      id: lp.id,
      name,
      isBot: !!lp.isBot,
      color: typeof lp.color === 'string' && lp.color ? lp.color : '#888888',
      cash: PLAYER_START_CASH,
      debt: 0,
      connected: lp.isBot ? true : !!lp.connected,
      ready: false,
      stats: emptyStats(),
      netWorthHistory: [],
    };
    if (lp.isBot && typeof lp.botPersonalityId === 'string') player.botPersonalityId = lp.botPersonalityId;
    // Niveau propre à ce bot (§10), réglé au salon ; sinon celui de la partie.
    if (lp.isBot && BOT_LEVELS.includes(lp.botLevel as BotLevel)) player.botLevel = lp.botLevel;
    state.players[player.id] = player;

    const sectorId: SectorId = SECTOR_IDS.includes(lp.sectorId) ? lp.sectorId : (pers?.preferredSectors[0] ?? 'energy_drinks');
    const companyName = uniqueCompanyName(state, cleanName(lp.companyName, 40) ?? pers?.companyName ?? T.defaultCompanyName(name));
    const product = newProduct(state, sectorId, suggestProductName(state, sectorId, companyName), {
      brand: SECTORS[sectorId].startingBrand ?? START_BRAND,
    });
    newCompany(state, {
      name: companyName,
      ticker: makeTicker(state, companyName, pers?.ticker),
      emoji: pers?.emoji ?? SECTORS[sectorId].emoji,
      color: player.color,
      ceoName: player.name,
      founderId: player.id,
      controllerId: player.id,
      cash: COMPANY_START_CASH,
      holdings: { [player.id]: Math.round(FOUNDER_STAKE * START_SHARES) },
      products: [product],
      profitEma: 0, // cf. « Bénéfice attendu » plus bas
      revenueEma: product.production * product.price,
      sharePrice: 1,
    });
  }

  // Entreprises PNJ : 100 % flottant, pilote automatique
  content.npcCompanies.forEach((def, i) => {
    if (!SECTOR_IDS.includes(def.sectorId)) return;
    const size = Number.isFinite(def.sizeFactor) && def.sizeFactor > 0 ? def.sizeFactor : 1;
    const sector = SECTORS[def.sectorId];
    const capacity = Math.max(1, Math.round(sector.startingCapacity * size));
    const product = newProduct(state, def.sectorId, def.productName, {
      capacity, spendFactor: size, brand: sector.startingBrand ?? START_BRAND,
    });
    newCompany(state, {
      name: uniqueCompanyName(state, def.name),
      ticker: makeTicker(state, def.name, def.ticker),
      emoji: def.emoji,
      color: NPC_COLORS[i % NPC_COLORS.length],
      ceoName: def.ceoName,
      founderId: null,
      controllerId: null,
      npcDefId: def.id,
      cash: COMPANY_START_CASH * size,
      holdings: {},
      products: [product],
      profitEma: 0,
      revenueEma: product.production * product.price,
      sharePrice: 1,
    });
  });

  // Les cases fixes des PNJ excluent tous les terrains de départ, même ceux sans attribution.
  // Garder l'ordre de création historique pour les ids, les noms et les tirages du mode classique.
  if (isSpatialMap(cfg)) {
    const companies = Object.values(state.companies);
    if (cfg.mapMode === 'square') for (const c of companies) for (const p of c.products) p.hexId = capitalCellId(cfg);
    for (const c of companies) for (const p of c.products) p.landCost = 0;
    const startingCells = new Set(boardTerrains(state.config, content.lang).map((t) => t.hex));
    const provinces = ['north_east', 'south', 'east', 'north'] as const;
    companies.filter((c) => c.npcDefId).forEach((c, i) => {
      const target = i < 2 ? capitalCellId(state.config) : zoneHexId(provinces[(i - 2) % provinces.length], state.config);
      for (const p of c.products) {
        let best: string | undefined, distance = Infinity;
        for (const id of freeBuildableHexes(state)) {
          if (startingCells.has(id)) continue;
          const capitalRing = hexDistance(id, capitalCellId(state.config));
          // Les deux premiers PNJ occupent l'anneau 2 ; tous laissent libre le premier anneau.
          if (i < 2 ? capitalRing !== 2 : capitalRing <= 1) continue;
          const d = hexDistance(id, target);
          if (d < distance) { best = id; distance = d; }
        }
        if (!best) throw new Error('Hex board is full');
        p.hexId = best;
      }
    });
    initializeOpeningProduction(state);
    if (options.preview) return state;
    assignStartingTerrains(state);
  }

  if (!isSpatialMap(cfg)) initializeOpeningProduction(state);

  // Earnings use the actual opening decisions, sector economics and competitors.
  const profits = expectedStartProfits(state);
  for (const c of Object.values(state.companies)) {
    c.profitEma = profits[c.id];
  }

  // Cours initial = valeur fondamentale
  for (const c of Object.values(state.companies)) {
    c.sharePrice = Math.max(PRICE_FLOOR, fin(targetSharePrice(state, c), PRICE_FLOOR));
    c.priceHistory = [c.sharePrice];
  }

  // Capture the listed market before automatic opening actions. Keep it separate
  // from realized price history and attach it after the first issue so initial
  // rumors retain their historical RNG and lazy crypto-market initialization.
  const openingCryptoPrice = projectedOpeningCryptoPrice(state);
  for (const player of Object.values(state.players)) {
    player.openingFortuneSnapshot = fortuneSnapshot(state, player);
    player.quarterPersonalCosts = 0;
    player.quarterPersonalCostDetails = { interest: 0, tips: 0, whistleblowing: 0 };
  }
  startTurn(state, null);
  if (openingCryptoPrice !== undefined) state.openingCryptoPrice = openingCryptoPrice;
  if (isSpatialMap(cfg)) state.journal[0].articles.unshift(...openingTerrainArticles(state));
  return state;
}

function initializeOpeningProduction(state: GameState): void {
  // Size the first batch against the actual opening competition. Volatile markets
  // keep a little spare capacity rather than paying for perishable excess stock.
  const advanced: GameState = { ...state, companies: {} };
  for (const c of Object.values(state.companies)) advanced.companies[c.id] = {
    ...c, products: c.products.map((p) => ({ ...p,
      quality: qualityAfter(p.sectorId, p.quality, p.rnd, terrainMultiplier(state, c, p, 'rnd')),
      brand: brandAfter(p.sectorId, p.brand, p.marketing, terrainMultiplier(state, c, p, 'marketing')),
    })),
  };
  const batches = new Map<string, number>();
  const budgets = new Map<string, number>();
  for (const c of Object.values(state.companies)) for (const p of c.products) {
    const unit = estimatedUnitCost(state, c, p);
    const market = marketInputs(advanced, advanced.companies[c.id], p, c.controllerId ?? '', unit);
    const demand = estimateSales(p.sectorId, market, p).demand;
    batches.set(p.id, Math.max(1, Math.min(p.capacity, Math.floor(demand * (1 - 0.5 * SECTORS[p.sectorId].volatility)))));
    const grossMargin = batches.get(p.id)! * Math.max(0, p.price - unit);
    budgets.set(p.id, Math.min(1, 0.35 * grossMargin / Math.max(1, p.marketing + p.rnd)));
  }
  for (const c of Object.values(state.companies)) for (const p of c.products) {
    p.production = batches.get(p.id)!;
    p.marketing = Math.round(p.marketing * budgets.get(p.id)!);
    p.rnd = Math.round(p.rnd * budgets.get(p.id)!);
  }
  for (const c of Object.values(state.companies)) c.revenueEma = c.products.reduce((total, p) => total + p.production * p.price, 0);

}

/** Public opening quotes weighted by expected shipped units, without a random draw. */
function projectedOpeningCryptoPrice(state: GameState): number | undefined {
  const advanced: GameState = { ...state, companies: {} };
  for (const c of Object.values(state.companies)) advanced.companies[c.id] = {
    ...c, products: c.products.map((p) => ({ ...p,
      quality: qualityAfter(p.sectorId, p.quality, p.rnd, terrainMultiplier(state, c, p, 'rnd')),
      brand: brandAfter(p.sectorId, p.brand, p.marketing, terrainMultiplier(state, c, p, 'marketing')),
    })),
  };
  let sales = 0;
  let revenue = 0;
  for (const c of Object.values(state.companies)) for (const p of c.products) {
    if (p.sectorId !== 'crypto') continue;
    const market = marketInputs(advanced, advanced.companies[c.id], p, c.controllerId ?? '', estimatedUnitCost(state, c, p));
    const shipped = estimateSales('crypto', market, p).sales;
    sales += shipped;
    revenue += shipped * p.price;
  }
  return sales > 0 ? revenue / sales : undefined;
}

/** Estimations pures du salon, avec le même marché initial et les mêmes durées que l’attribution réelle. */
export function terrainLobbyPayload(config: Omit<GameConfig, 'seed'>, players: LobbyPlayer[]) {
  const state = createGameState({ ...config, mapMode: config.mapMode === 'square' ? 'square' : 'hex', seed: 0 }, players, { preview: true });
  let company = Object.values(state.companies).find((c) => !c.npcDefId);
  if (!company) company = Object.values(state.companies)[0];
  const bySector = Object.fromEntries(SECTOR_IDS.map((sectorId) => {
    const selected = Object.values(state.companies).find((c) => !c.npcDefId && c.products[0]?.sectorId === sectorId) ?? company;
    const actual = selected.products.find((p) => p.sectorId === sectorId);
    const hypothetical = actual ? { ...actual } : newProduct({ ...state }, sectorId, 'preview', {
      brand: SECTORS[sectorId].startingBrand ?? START_BRAND,
    });
    hypothetical.id = selected.products[0].id;
    return [sectorId, assessTerrains(state, selected, hypothetical)];
  })) as Record<SectorId, Record<string, import('../types').TerrainAssessment>>;
  return boardTerrains(state.config, config.lang).map((t) => ({
    id: t.id, hex: t.hex, name: t.name, strengthLabel: t.strengthLabel, counterLabel: t.counterLabel, blurb: t.blurb,
    sectors: Object.fromEntries(SECTOR_IDS.map((sid) => [sid, bySector[sid][t.id]])) as Record<SectorId, import('../types').TerrainAssessment>,
  }));
}
