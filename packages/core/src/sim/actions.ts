import { occupiedHexes } from './hexes';
import { boardBuildable, cellBelongsToBoard, isSpatialMap } from '../content/hexes';
import { addScandal, revokeTerrain, terrainSalvageRate } from './terrains';
import { settlementArticle } from './terrainNews';
/**
 * Validation et application immédiate des actions (§7).
 * `runAction` ne fait aucune mutation tant que l'action n'est pas validée.
 * `actorId = null` désigne le pilote automatique (entreprises sans contrôleur).
 */
import { COMMODITIES, DEFAULT_ZONE, getContent, hexPlaceLabel, hexPlaceName, SECTORS, zoneOf } from '../content';
import {
  COMMODITY_IDS,
  SECTOR_IDS,
  SHADY_KINDS,
  type Action,
  type ActionResult,
  type CommodityId,
  type CartelOffer,
  type CompanyState,
  type ContractOffer,
  type GameState,
  type HexBid,
  type HexLaunchProject,
  type Id,
  type Offer,
  type PlayerState,
  type ProductState,
  type SectorId,
  type SiteBid,
  type ShadyKind,
  type ShareOffer,
  type ZoneId,
  ZONE_IDS,
} from '../types';
import {
  BONUS_SCANDAL_PER_TRANCHE,
  BONUS_SENTIMENT_PER_TRANCHE,
  BONUS_TRANCHE,
  CRISIS_COMMS_COST,
  CRISIS_COMMS_REPUTATION,
  CRISIS_COMMS_REPUTATION_CAP,
  CRISIS_COMMS_SCANDAL,
  DIVIDEND_SENTIMENT_FACTOR,
  ESPIONAGE_GAP_SHARE,
  FLASH_BONUS_MIN,
  FLOAT_MIN,
  INSIDER_FLASH_MIN,
  INSIDER_SCANDAL_PER_PCT,
  LAUNCH_AMORTIZATION_TURNS,
  LOBBYING_MULT,
  LOBBYING_TURNS,
  MAX_CAPACITY_ORDER,
  MAX_PRODUCTS_MERGED,
  MAX_SPEND_PER_PRODUCT,
  MIN_STARTUP_INVESTMENT,
  OFFSHORING_REPUTATION,
  OFFSHORING_TURNS,
  POISON_PILL_COOLDOWN,
  POISON_PILL_DISCOUNT,
  POISON_PILL_ISSUE,
  POISON_PILL_SCANDAL,
  POISON_PILL_SENTIMENT,
  POISON_PILL_TRIGGER,
  PRICE_FLOOR,
  PRICE_MAX_RATIO,
  PRICE_MIN_RATIO,
  PRODUCTION_MAX_RATIO,
  REPUTATION_MAX,
  REPUTATION_MIN,
  SENTIMENT_MAX,
  SENTIMENT_MIN,
  SHADY_COSTS,
  SMEAR_SENTIMENT,
  START_SHARES,
  STARTUP_FOUNDER_STAKE,
  STARTUP_SUBSIDY,
  RUMOR_CHECK_LEAK_SCANDAL,
  BLOCK_PRICE_BAND,
  CONTRACT_MAX_LOTS,
  CONTRACT_MAX_TURNS,
  OFFERS_PER_TURN,
  WHISTLEBLOW_COST,
  WHISTLEBLOW_SCANDAL,
} from './constants';
import { botAcceptsOffer } from './botDeals';
import { factoryMoveCost } from './transport';

import { bareLandReserve, hexReservePrice } from './hexAuctions';
import { addLand, ensureLand, ensureProductProfile, factoryCapacityLimit, factoryOnLand, ownedLand, productCount, productProfile, syncProductProfiles, usesIndustryNetwork } from './industry';
import { industryMessages } from './industryMessages';
import { engineDiagnostics } from './sanitize';
import { afterStakeChange, checkControl, checkStakeThresholds } from './control';
import { cartelMembers, cartelOf, cartelRiskOf, contractBetween, contractPriceRange, offerById, offersSentThisTurn, pruneCartels, siteOpeningCost, siteUpkeep, slotOperators } from './deals';
import { makeTicker, newCompany, newProduct, suggestProductName, uniqueCompanyName } from './factory';
import {
  bonusBase,
  borrowedThisTurn,
  breachesFloatMin,
  companyInterestRate,
  companyLoanLimit,
  floatShares,
  hasModifier,
  marketCap,
  maxBonus,
  maxBuybackShares,
  maxDividend,
  maxProductsOf,
  personalInterestRate,
  personalLoanLimit,
  productSalvageValue,
  rumorCheckLeaks,
  rumorCheckPrice,
} from './finance';
import { langOf, tr } from './i18n';
import { addFlash, body, currentIssue, headlineText } from './journal';
import {
  addHolding,
  addInventory,
  commodityBuyQuote,
  commoditySellQuote,
  executeShareBuy,
  executeShareSell,
  holdingOf,
  recordSharePurchase,
  removeInventory,
  shareBuyQuote,
} from './market';
import { clamp, cleanName, controllerOf, fin, flavor, getOwn, isFiniteNumber, newId, toPositiveInt } from './util';

const EPS = 1e-6;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Textes des actions dans la langue de la partie. */
function M(state: GameState) {
  return tr(state).act;
}

function success(state: GameState, key: string, details: string): ActionResult {
  const { actionQuips: ACTION_QUIPS } = getContent(langOf(state));
  const quip = flavor(state, ACTION_QUIPS[key] ?? (SHADY_KINDS.includes(key as ShadyKind) ? ACTION_QUIPS.shady : undefined), `quip:${key}`);
  return { ok: true, message: quip ? `${quip} ${details}` : details };
}

function refuse(state: GameState, message: string, withQuip = true): ActionResult {
  const quip = withQuip ? flavor(state, getContent(langOf(state)).refusalQuips, `refusal:${message}`) : undefined;
  return { ok: false, message: quip ? `${quip} ${message}` : message };
}

function statusMessage(state: GameState, c: CompanyState): string {
  return c.status === 'bankrupt' ? M(state).statusBankrupt(c.name) : M(state).statusMerged(c.name);
}

function label(c: CompanyState): string {
  return `${c.name} (${c.ticker})`;
}

/** Vrai si le joueur a cédé le contrôle de l'entreprise ce tour en vendant ses actions. */
function soldControlThisTurn(c: CompanyState, playerId: Id): boolean {
  return (c.turnFlags?.exControllers ?? []).includes(playerId);
}

function lockedSharesOf(c: CompanyState, playerId: Id): number {
  const locks = c.turnFlags?.lockedShares;
  return locks ? Math.max(0, getOwn(locks, playerId) ?? 0) : 0;
}

/**
 * Comptes pro forma après fusion : le CA de la cible s'ajoute aux rapports de l'absorbante, tour par tour.
 * Pour les tours antérieurs au premier rapport de la cible, on reprend son premier CA publié :
 * une fusion ne fabrique pas de croissance (§6.1). Les bénéfices s'additionnent sur les tours communs.
 */
function consolidateReports(absorber: CompanyState, target: CompanyState): void {
  if (target.reports.length === 0) return;
  const byTurn = new Map(target.reports.map((r) => [r.turn, r]));
  const first = target.reports[0];
  for (const r of absorber.reports) {
    const t = byTurn.get(r.turn);
    if (t) {
      r.revenue += t.revenue;
      r.netProfit += t.netProfit;
      const disposalLoss = (r.exceptionalLoss ?? 0) + (t.exceptionalLoss ?? 0);
      if (disposalLoss > 0) r.exceptionalLoss = disposalLoss;
      const disposalTaxBenefit = (r.exceptionalLossTaxBenefit ?? 0) + (t.exceptionalLossTaxBenefit ?? 0);
      if (disposalTaxBenefit > 0) r.exceptionalLossTaxBenefit = disposalTaxBenefit;
    } else if (r.turn < first.turn) {
      r.revenue += first.revenue;
    }
  }
}

/**
 * Point de non-retour d'une action validée : appelé juste avant la première mutation de l'état.
 * `applyAction` s'en sert pour ne sauvegarder l'état (filet de sécurité) que pour les actions valides.
 */
let beforeMutation: (() => void) | null = null;
function mutating(): void {
  const hook = beforeMutation;
  beforeMutation = null;
  if (hook) hook();
}

// ---------------------------------------------------------------------------
// Garde-fous communs
// ---------------------------------------------------------------------------

function playerOf(state: GameState, actorId: Id | null): PlayerState | undefined {
  return actorId === null ? undefined : getOwn(state.players, actorId);
}

/** Entreprise active contrôlée par l'acteur, ou message de refus. */
function controlled(state: GameState, actorId: Id | null, companyId: unknown): CompanyState | string {
  const c = getOwn(state.companies, companyId);
  const T = M(state);
  if (!c) return T.companyNotFound;
  if (c.status !== 'active') return statusMessage(state, c);
  if (c.controllerId !== actorId) {
    if (actorId === null) return T.notAutopilot(c.name);
    if (c.founderId === actorId) return T.shownTheDoor(c.name);
    return T.notController(c.name);
  }
  if (!c.turnFlags) c.turnFlags = { bonusTaken: 0, buybackDone: false, shadyDone: [], borrowed: 0 };
  return c;
}

function findProduct(c: CompanyState, productId: unknown): ProductState | undefined {
  return typeof productId === 'string' ? c.products.find((p) => p.id === productId) : undefined;
}

function validSector(x: unknown): x is SectorId {
  return typeof x === 'string' && (SECTOR_IDS as string[]).includes(x);
}

function validZone(x: unknown): x is ZoneId {
  return typeof x === 'string' && (ZONE_IDS as string[]).includes(x);
}

/** Nom d'une zone dans la langue du salon : celle d'une ville porte le nom de sa ville (§5.8). */
function zoneName(state: GameState, id: ZoneId): string {
  const names = getContent(langOf(state)).mapNames;
  return id === 'plain' || id === 'mountain' ? names.zones[id] : names.cities[id];
}

function validCommodity(x: unknown): x is CommodityId {
  return typeof x === 'string' && (COMMODITY_IDS as string[]).includes(x);
}

function positiveAmount(x: unknown): number | null {
  return isFiniteNumber(x) && x > 0 ? x : null;
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

export function runAction(state: GameState, actorId: Id | null, action: Action, onMutate?: () => void): ActionResult {
  const previous = beforeMutation;
  beforeMutation = onMutate ?? null;
  try {
    return dispatch(state, actorId, action);
  } finally {
    beforeMutation = previous;
  }
}

function dispatch(state: GameState, actorId: Id | null, action: Action): ActionResult {
  if (!action || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') {
    return refuse(state, M(state).unreadable, false);
  }
  switch (action.type) {
    case 'buyShares':
      return buyShares(state, actorId, action);
    case 'sellShares':
      return sellShares(state, actorId, action);
    case 'takePersonalLoan':
      return takePersonalLoan(state, actorId, action);
    case 'repayPersonalLoan':
      return repayPersonalLoan(state, actorId, action);
    case 'foundStartup':
      return foundStartup(state, actorId, action);
    case 'whistleblow':
      return whistleblow(state, actorId, action);
    case 'checkRumor':
      return checkRumor(state, actorId, action);
    case 'bidSite':
      return bidSite(state, actorId, action);
    case 'cancelSiteBid':
      return cancelSiteBid(state, actorId, action);
    case 'cancelHexBid':
      return cancelHexBid(state, actorId, action);
    case 'setSiteDormant':
      return setSiteDormant(state, actorId, action);
    case 'offerShares':
      return offerShares(state, actorId, action);
    case 'offerContract':
      return offerContract(state, actorId, action);
    case 'proposeCartel':
      return proposeCartel(state, actorId, action);
    case 'answerOffer':
      return answerOffer(state, actorId, action);
    case 'cancelOffer':
      return cancelOffer(state, actorId, action);
    case 'leaveCartel':
      return leaveCartel(state, actorId, action);
    case 'setProductDecisions':
      return setProductDecisions(state, actorId, action);
    case 'launchProduct':
      return launchProduct(state, actorId, action);
    case 'moveFactory':
      return moveFactory(state, actorId, action);
    case 'discontinueProduct':
      return discontinueProduct(state, actorId, action);
    case 'expandCapacity':
      return expandCapacity(state, actorId, action);
    case 'bidLand':
      return bidLand(state, actorId, action);
    case 'sellLand':
      return sellLand(state, actorId, action);
    case 'buildFactory':
      return buildFactory(state, actorId, action);
    case 'buyCommodity':
      return buyCommodity(state, actorId, action);
    case 'sellCommodity':
      return sellCommodity(state, actorId, action);
    case 'takeLoan':
      return takeLoan(state, actorId, action);
    case 'repayLoan':
      return repayLoan(state, actorId, action);
    case 'payDividend':
      return payDividend(state, actorId, action);
    case 'ceoBonus':
      return ceoBonus(state, actorId, action);
    case 'buyback':
      return buyback(state, actorId, action);
    case 'poisonPill':
      return poisonPill(state, actorId, action);
    case 'crisisComms':
      return crisisComms(state, actorId, action);
    case 'shady':
      return shady(state, actorId, action);
    case 'merge':
      return merge(state, actorId, action);
    default:
      return refuse(state, M(state).unknown, false);
  }
}

type A<T extends Action['type']> = Extract<Action, { type: T }>;

// ---------------------------------------------------------------------------
// Perso
// ---------------------------------------------------------------------------

function buyShares(state: GameState, actorId: Id | null, a: A<'buyShares'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.onlyPlayerBuy, false);
  const c = getOwn(state.companies, a.companyId);
  if (!c) return refuse(state, T.companyNotFound, false);
  if (c.status !== 'active') return refuse(state, statusMessage(state, c));
  const n = toPositiveInt(a.shares);
  if (n === null) return refuse(state, T.invalidShares, false);
  const float = floatShares(c);
  if (float < 1) return refuse(state, T.noFloat(c.ticker));
  if (n > float) return refuse(state, T.onlyFloat(float, c.ticker));
  const held0 = holdingOf(c, player.id);
  const S0 = c.sharesOutstanding;
  if (breachesFloatMin(held0 + n, float - n, S0)) {
    // Plus grand achat permis : jusqu'à 50 % + 1 action, ou tant que le flottant reste ≥ FLOAT_MIN (40 %) du capital.
    const max = Math.min(float, Math.max(Math.floor(S0 / 2) + 1 - held0, Math.floor(float - FLOAT_MIN * S0 + 1e-6), 0));
    return refuse(state, T.floatMin(max, c.ticker, FLOAT_MIN));
  }
  const q = shareBuyQuote(c, n);
  if (q.total > player.cash + EPS) {
    return refuse(state, T.cantAffordShares(n, c.ticker, q.total, player.cash));
  }
  mutating();
  const before = holdingOf(c, player.id);
  const beforeS = c.sharesOutstanding;
  // Délit d'initié : le contrôleur, ou celui qui vient de céder le contrôle en vendant ce tour (§6.2).
  const insider = c.controllerId === player.id || soldControlThisTurn(c, player.id);
  executeShareBuy(player, c, n);
  recordSharePurchase(state, player.id, c.id, n);
  const change = afterStakeChange(state, c, player.id, before, beforeS);
  let msg = T.bought(n, c.ticker, q.total, q.avg, c.name, holdingOf(c, player.id) / c.sharesOutstanding);
  if (change && change.hostile && change.newControllerId === player.id) msg += T.boughtControl(c.name);
  if (insider) msg += insiderPurchase(state, player, c, n, beforeS);
  return success(state, 'buyShares', msg);
}

/**
 * Délit d'initié (§6.2) : le contrôleur qui achète ses propres actions fait monter la jauge de scandale de
 * 1 point par 1 % du capital acheté (au prorata). Au-delà de 5 % achetés dans le tour, flash dans le journal.
 * Renvoie la fin du message de l'action.
 */
function insiderPurchase(state: GameState, player: PlayerState, c: CompanyState, n: number, sharesBefore: number): string {
  const S = Math.max(sharesBefore, 1);
  const scandalUp = fin((INSIDER_SCANDAL_PER_PCT * 100 * n) / S);
  const actualScandalUp = addScandal(state, c, scandalUp);
  if (!c.turnFlags) c.turnFlags = { bonusTaken: 0, buybackDone: false, shadyDone: [], borrowed: 0 };
  const bought = (c.turnFlags.insiderBought ??= {});
  const prev = getOwn(bought, player.id) ?? 0;
  bought[player.id] = prev + n;
  const threshold = INSIDER_FLASH_MIN * S;
  if (prev < threshold && prev + n >= threshold) {
    addFlash(state, {
      title: headlineText(state, 'insiderBuying', { ceo: player.name, company: c.name, pct: tr(state).pct((prev + n) / S, 1) }),
      body: body(state, 'insiderBuying', `${c.id}:${player.id}:${state.turn}`),
      tone: 'drama',
      companyIds: [c.id],
      event: { type: 'insiderBuying', actorId: player.id, pct: (prev + n) / S },
    });
  }
  return M(state).insiderBought(isSpatialMap(state.config) ? actualScandalUp : scandalUp);
}

function sellShares(state: GameState, actorId: Id | null, a: A<'sellShares'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.onlyPlayerSell, false);
  const c = getOwn(state.companies, a.companyId);
  if (!c) return refuse(state, T.companyNotFound, false);
  if (c.status !== 'active') return refuse(state, statusMessage(state, c));
  const n = toPositiveInt(a.shares);
  if (n === null) return refuse(state, T.invalidShares, false);
  const held = holdingOf(c, player.id);
  if (held < 1) return refuse(state, T.noneHeld(c.ticker));
  if (n > held) return refuse(state, T.onlyHeld(held, c.ticker));
  if (c.turnFlags?.justFounded && c.founderId === player.id) {
    return refuse(state, T.founderLocked(c.name));
  }
  const locked = lockedSharesOf(c, player.id);
  if (n > held - locked + EPS) {
    return refuse(state, T.pillLocked(locked, c.ticker, Math.max(0, held - locked)));
  }
  mutating();
  const wasController = c.controllerId === player.id;
  const q = executeShareSell(state, player, c, n);
  const change = checkControl(state, c);
  let msg = T.sold(n, c.ticker, q.total, q.avg);
  if (wasController && change && change.oldControllerId === player.id) {
    msg += T.lostControl(c.name);
    // Céder le contrôle puis racheter dans le même tour reste un délit d'initié (§6.2).
    const ex = (c.turnFlags.exControllers ??= []);
    if (!ex.includes(player.id)) ex.push(player.id);
  }
  return success(state, 'sellShares', msg);
}

function takePersonalLoan(state: GameState, actorId: Id | null, a: A<'takePersonalLoan'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.onlyPlayerLoan, false);
  const amount = positiveAmount(a.amount);
  if (amount === null) return refuse(state, T.invalidAmount, false);
  const limit = personalLoanLimit(state, player);
  if (amount > limit + EPS) {
    return refuse(state, T.personalLoanCap(limit));
  }
  mutating();
  player.cash += amount;
  player.debt += amount;
  return success(state, 'takePersonalLoan', T.personalLoan(amount, personalInterestRate(state), player.debt));
}

function repayPersonalLoan(state: GameState, actorId: Id | null, a: A<'repayPersonalLoan'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.onlyPlayerRepay, false);
  const asked = positiveAmount(a.amount);
  if (asked === null) return refuse(state, T.invalidAmount, false);
  if (player.debt <= EPS) return refuse(state, T.noPersonalDebt);
  const amount = Math.min(asked, player.debt);
  if (amount > player.cash + EPS) return refuse(state, T.personalCashShort(Math.max(player.cash, 0)));
  mutating();
  player.cash -= amount;
  player.debt = Math.max(0, player.debt - amount);
  if (player.debt < EPS) player.debt = 0;
  return success(state, 'repayPersonalLoan', T.personalRepaid(amount, player.debt));
}

function foundStartup(state: GameState, actorId: Id | null, a: A<'foundStartup'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.onlyPlayerStartup, false);
  const rawName = cleanName(a.name, 40);
  if (!rawName) return refuse(state, T.startupNeedsName, false);
  if (!validSector(a.sectorId)) return refuse(state, T.unknownSector, false);
  const investment = positiveAmount(a.investment);
  if (investment === null) return refuse(state, T.invalidInvestment, false);
  if (investment < MIN_STARTUP_INVESTMENT) return refuse(state, T.minInvestment(MIN_STARTUP_INVESTMENT));
  if (investment > player.cash + EPS) return refuse(state, T.personalCashShort(Math.max(player.cash, 0)));
  // Retour en jeu (§7) : seul un joueur qui ne contrôle plus aucune entreprise peut fonder une start-up.
  if (Object.values(state.companies).some((c) => c.status === 'active' && c.controllerId === player.id)) {
    return refuse(state, T.startupComebackOnly);
  }
  // … et qui n'a pas cédé le contrôle d'une entreprise en vendant ce tour (sinon : vendre, fonder, racheter).
  const soldOut = Object.values(state.companies).find((c) => c.status === 'active' && soldControlThisTurn(c, player.id));
  if (soldOut) return refuse(state, T.startupAfterSellOut(soldOut.name));
  const already = Object.values(state.companies).some((c) => c.founderId === player.id && c.foundedTurn === state.turn);
  if (already) return refuse(state, T.alreadyFounded);
  const hexMode = isSpatialMap(state.config);
  const subsidy = Math.max(STARTUP_SUBSIDY, fin(player.comebackGrant ?? 0));
  if (hexMode) {
    if (a.fallback !== 'nearest' && a.fallback !== 'abandon') return refuse(state, T.hexFallbackInvalid, false);
    const error = hexBidError(state, actorId, a.hexId, a.bid, 0, investment + subsidy, rawName, a.fallback);
    if (error) return refuse(state, error, false);
  }

  mutating();
  const invest = Math.min(investment, player.cash);
  // Subvention : au moins 1 000 k, et au moins le dernier parachute reçu (consommé ici).
  delete player.comebackGrant;
  const sectorId = a.sectorId;
  const name = uniqueCompanyName(state, rawName);
  const def = SECTORS[sectorId];
  const sectorName = getContent(langOf(state)).sectors[sectorId].name;
  player.cash -= invest;
  player.stats.startupsFounded += 1;
  const product = newProduct(state, sectorId, suggestProductName(state, sectorId, name));
  if (hexMode) product.incubator = true;
  // Cours d'introduction = trésorerie par action : la capitalisation vaut la trésorerie de départ.
  const price = Math.max(PRICE_FLOOR, (invest + subsidy) / START_SHARES);
  const c = newCompany(state, {
    name,
    ticker: makeTicker(state, name),
    emoji: def.emoji,
    color: player.color,
    ceoName: player.name,
    founderId: player.id,
    controllerId: player.id,
    cash: invest + subsidy,
    holdings: { [player.id]: Math.round(STARTUP_FOUNDER_STAKE * START_SHARES) },
    products: [product],
    profitEma: 0,
    revenueEma: 0,
    sharePrice: price,
  });
  c.priceHistory = [price];
  c.turnFlags.justFounded = true;
  if (hexMode) (state.hexBids ??= []).push({
    kind: 'startup', companyId: c.id, playerId: player.id, productId: product.id,
    hexId: a.hexId!, amount: a.bid!, turn: state.turn, fallback: a.fallback!,
  });
  addFlash(state, {
    title: headlineText(state, 'startup', { player: player.name, company: c.name, sector: sectorName, amount: tr(state).money(invest) }),
    body: body(state, 'startup', c.id),
    tone: 'good',
    companyIds: [c.id],
    sectorIds: [sectorId],
    event: { type: 'startup', actorId: player.id },
  });
  return success(state, 'foundStartup', T.startupBorn(label(c), c.cash, subsidy, product.name));
}

/**
 * Lanceur d'alerte (§7) : le joueur paie de sa poche pour dénoncer une entreprise qu'il ne contrôle pas.
 * La jauge de scandale double, dans la limite de +15, et son niveau exact est publié dans le journal
 * (flash, source anonyme).
 */
function whistleblow(state: GameState, actorId: Id | null, a: A<'whistleblow'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.onlyPlayerWhistle, false);
  const c = getOwn(state.companies, a.companyId);
  if (!c || c.status !== 'active') return refuse(state, T.whistleTargetGone, false);
  if (c.controllerId === player.id) return refuse(state, T.whistleSelf(c.name));
  if (player.lastWhistleblowTurn === state.turn) return refuse(state, T.whistleOncePerTurn);
  if (WHISTLEBLOW_COST > player.cash + EPS) return refuse(state, T.whistleCash(WHISTLEBLOW_COST));
  mutating();
  player.cash -= WHISTLEBLOW_COST;
  if (player.quarterPersonalCosts !== undefined) player.quarterPersonalCosts += WHISTLEBLOW_COST;
  if (player.quarterPersonalCostDetails !== undefined) player.quarterPersonalCostDetails.whistleblowing += WHISTLEBLOW_COST;
  player.lastWhistleblowTurn = state.turn;
  player.stats.whistleblows = (player.stats.whistleblows ?? 0) + 1;
  // On ne révèle que ce qui existe : la jauge double, dans la limite de +15. Une entreprise propre ne craint rien.
  const before = c.scandal;
  addScandal(state, c, Math.min(WHISTLEBLOW_SCANDAL, Math.max(0, c.scandal)));
  const level = Math.round(c.scandal);
  addFlash(state, {
    title: headlineText(state, 'whistleblow', { company: c.name, level: `${level}/100` }),
    body: body(state, 'whistleblow', `${c.id}:${state.turn}`),
    tone: 'drama',
    companyIds: [c.id],
    // La source reste anonyme (§7) : pas d'actorId.
    event: { type: 'whistleblow' },
  });
  return success(state, 'whistleblow', T.whistleDone(c.name, level, WHISTLEBLOW_COST, c.scandal - before));
}

/**
 * Tuyau (§7) : le joueur paie une source du journal pour savoir si une rumeur du numéro du jour est vraie.
 * Réponse certaine, pour lui seul (`PlayerState.rumorChecks`, montré dans sa vue uniquement) ; un par trimestre ;
 * tarif en part de sa valeur nette (voir rumorCheckPrice). Une fois sur dix, la source parle : flash qui le nomme
 * et jauge de scandale en hausse sur les entreprises qu'il dirige. Aucun tirage du RNG de la simulation.
 */
function checkRumor(state: GameState, actorId: Id | null, a: A<'checkRumor'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.onlyPlayerTip, false);
  const issue = currentIssue(state);
  if (a.turn !== state.turn || !issue || issue.turn !== state.turn) return refuse(state, T.tipStale, false);
  if (!Number.isInteger(a.index) || a.index < 0 || a.index >= issue.rumors.length) return refuse(state, T.tipNoRumor, false);
  if ((player.rumorChecks ?? []).some((r) => r.turn === state.turn)) return refuse(state, T.tipOncePerTurn);
  const price = rumorCheckPrice(state, player);
  if (price > player.cash + EPS) return refuse(state, T.tipCash(price));
  mutating();
  player.cash -= price;
  if (player.quarterPersonalCosts !== undefined) player.quarterPersonalCosts += price;
  if (player.quarterPersonalCostDetails !== undefined) player.quarterPersonalCostDetails.tips += price;
  // L'origine de chaque rumeur est connue du seul moteur : 'news:…' pour la news programmée, 'fake:…' sinon.
  const truthful = (state.rumorKeys?.[issue.turn]?.[a.index] ?? '').startsWith('news:');
  (player.rumorChecks ??= []).push({ turn: state.turn, index: a.index, truthful });
  const leaked = rumorCheckLeaks(state, player.id);
  if (leaked) {
    const mine = Object.values(state.companies).filter((c) => c.status === 'active' && c.controllerId === player.id);
    for (const c of mine) addScandal(state, c, RUMOR_CHECK_LEAK_SCANDAL);
    addFlash(state, {
      title: tr(state).rumorLeakTitle(player.name),
      body: tr(state).rumorLeakBody,
      tone: 'drama',
      companyIds: mine.map((c) => c.id),
      event: { type: 'rumorLeak', actorId: player.id },
    });
  }
  return success(state, 'checkRumor', T.tipDone(truthful, price, leaked));
}

// ---------------------------------------------------------------------------
// Intégration verticale et tractations entre joueurs (§5.5 bis, §7 bis)
// ---------------------------------------------------------------------------

/**
 * Enchère sur un gisement précis (§5.5 bis) : une mise par entreprise et par matière, sous pli fermé. Elle se règle à
 * la résolution ; la plus haute mise sur ce gisement l'emporte et paie la meilleure mise perdante, jamais plus que sa
 * mise. Miser sur un autre gisement de la même matière remplace la mise.
 */
function bidSite(state: GameState, actorId: Id | null, a: A<'bidSite'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  const slot = (state.siteSlots ?? []).find((s) => s.id === a.slotId);
  if (!slot) return refuse(state, T.siteSlotUnknown, false);
  const cid = slot.commodityId;
  const site = tr(state).slotLabel(slot.name);
  // Au dernier trimestre, la filiale ne produirait jamais : elle se paierait pour rien.
  if (state.turn >= state.config.totalTurns) return refuse(state, T.siteBidLastTurn);
  if ((c.sites ?? []).some((s) => s.commodityId === cid)) return refuse(state, T.siteExists(tr(state).siteName[cid]));
  if (slotOperators(state).has(slot.id)) return refuse(state, T.siteSlotTaken(site));
  const amount = toPositiveInt(a.amount);
  if (amount === null) return refuse(state, T.invalidAmount, false);
  const reserve = siteOpeningCost(cid);
  if (amount + EPS < reserve) return refuse(state, T.siteBidLow(site, reserve));
  if (amount > c.cash + EPS) return refuse(state, T.siteBidCash(site, amount, c.name, Math.max(0, c.cash)));
  mutating();
  const bid: SiteBid = { companyId: c.id, playerId: actorId as Id, commodityId: cid, slotId: slot.id, amount, turn: state.turn };
  // Remplace sa propre mise sur la matière (en cours, ou l'issue du dernier règlement), jamais celle d'un dirigeant
  // précédent : elle tombera d'elle-même à la clôture, et y toucher trahirait qu'elle existe.
  const bids = (state.siteBids ??= []);
  const i = bids.findIndex((b) => b.companyId === c.id && b.commodityId === cid && b.playerId === actorId);
  if (i >= 0) bids[i] = bid;
  else bids.push(bid);
  return success(state, 'bidSite', T.siteBidPlaced(site, amount, reserve));
}

/** Retire sa mise en cours sur cette matière (pas celle d'un dirigeant précédent de l'entreprise). */
function cancelSiteBid(state: GameState, actorId: Id | null, a: A<'cancelSiteBid'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!validCommodity(a.commodityId)) return refuse(state, T.unknownCommodity, false);
  const i = (state.siteBids ?? []).findIndex(
    (b) => b.companyId === c.id && b.commodityId === a.commodityId && b.playerId === actorId && b.result === undefined,
  );
  if (i < 0) return refuse(state, T.siteNoBid, false);
  mutating();
  (state.siteBids as SiteBid[]).splice(i, 1);
  if ((state.siteBids as SiteBid[]).length === 0) delete state.siteBids;
  return success(state, 'cancelSiteBid', T.siteBidCancelled);
}

/**
 * Mise en sommeil (effet à la clôture : plus d'extraction, l'entretien court à chaque résolution) ou relance (un
 * trimestre de remise en route, comme un chantier : l'extraction reprend à la résolution suivante).
 */
function setSiteDormant(state: GameState, actorId: Id | null, a: A<'setSiteDormant'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!validCommodity(a.commodityId)) return refuse(state, T.unknownCommodity, false);
  // Après une fusion, deux filiales de la même matière n'en font qu'une pour le joueur : elles dorment et repartent ensemble.
  const list = (c.sites ?? []).filter((x) => x.commodityId === a.commodityId);
  if (list.length === 0) return refuse(state, T.siteMissing(tr(state).siteName[a.commodityId]));
  if (a.dormant === true) {
    const awake = list.filter((x) => !x.dormant);
    if (awake.length === 0) return refuse(state, T.siteAlreadyDormant, false);
    mutating();
    for (const x of awake) x.dormant = true;
    return success(state, 'setSiteDormant', T.siteDormantDone(list.reduce((sum, x) => sum + siteUpkeep(x), 0)));
  }
  const asleep = list.filter((x) => x.dormant);
  if (asleep.length === 0) return refuse(state, T.siteNotDormant, false);
  mutating();
  for (const x of asleep) {
    delete x.dormant;
    x.activeFrom = Math.max(x.activeFrom, state.turn + 1);
  }
  return success(state, 'setSiteDormant', T.siteRestarted);
}

/** Les deux joueurs d'une offre existent et sont différents : l'interlocuteur, ou un refus. */
function counterpart(state: GameState, player: PlayerState, id: unknown): PlayerState | string {
  const T = M(state);
  const other = getOwn(state.players, id);
  if (!other) return T.offerUnknownPlayer;
  if (other.id === player.id) return T.offerSelf;
  return other;
}

/** Refus éventuel d'une cession de gré à gré, vérifié à l'envoi et de nouveau à l'acceptation. */
function shareOfferProblem(state: GameState, o: Omit<ShareOffer, 'id'>): string | null {
  const T = M(state);
  const c = getOwn(state.companies, o.companyId);
  if (!c) return T.companyNotFound;
  if (c.status !== 'active') return statusMessage(state, c);
  const seller = getOwn(state.players, o.side === 'sell' ? o.fromId : o.toId);
  const buyer = getOwn(state.players, o.side === 'sell' ? o.toId : o.fromId);
  if (!seller || !buyer) return T.offerUnknownPlayer;
  const min = c.sharePrice * (1 - BLOCK_PRICE_BAND);
  const max = c.sharePrice * (1 + BLOCK_PRICE_BAND);
  if (!(o.price >= min - EPS && o.price <= max + EPS)) return T.blockPriceBand(min, max);
  if (c.turnFlags?.justFounded && c.founderId === seller.id) return T.blockOwnFounder(c.name);
  const sellable = holdingOf(c, seller.id) - lockedSharesOf(c, seller.id);
  if (o.shares > sellable + EPS) return T.blockNotEnough(seller.name, Math.max(0, sellable), c.ticker);
  // Hors marché, le flottant ne bouge pas : la règle des 50 % + 1 action vaut aussi (§6.2).
  if (breachesFloatMin(holdingOf(c, buyer.id) + o.shares, floatShares(c), c.sharesOutstanding)) return T.blockFloat;
  return null;
}

/** Refus éventuel d'un contrat de fourniture : les deux entreprises, dirigées par les deux joueurs de l'offre. */
function contractOfferProblem(state: GameState, o: Omit<ContractOffer, 'id'>): string | null {
  const T = M(state);
  const seller = getOwn(state.companies, o.sellerCompanyId);
  const buyer = getOwn(state.companies, o.buyerCompanyId);
  if (!seller || !buyer) return T.companyNotFound;
  if (seller.status !== 'active') return statusMessage(state, seller);
  if (buyer.status !== 'active') return statusMessage(state, buyer);
  const pair = [seller.controllerId, buyer.controllerId];
  if (!(pair.includes(o.fromId) && pair.includes(o.toId))) return T.contractNotYours;
  // Un seul contrat par paire d'entreprises et par matière, dans un sens ou dans l'autre.
  if (contractBetween(state, seller.id, buyer.id, o.commodityId)) return T.contractExists(getContent(langOf(state)).commodities[o.commodityId].name);
  return null;
}

/**
 * Refus éventuel d'une entente : deux dirigeants différents, un produit chacun dans le secteur. Seul un membre fait
 * entrer quelqu'un dans son entente (l'invité la rejoint et en voit les membres). À l'envoi, on ne vérifie que ce que
 * le proposant sait déjà (sa propre entente) : lui dire que la cible est dans une autre entente trahirait un secret.
 * À l'acceptation (`accept`), la cible apprend seulement ce qui la concerne.
 */
function cartelOfferProblem(state: GameState, o: Omit<CartelOffer, 'id'>, stage: 'send' | 'accept'): string | null {
  const T = M(state);
  const c = getOwn(state.companies, o.companyId);
  const target = getOwn(state.companies, o.targetCompanyId);
  if (!c || !target) return T.companyNotFound;
  if (c.status !== 'active') return statusMessage(state, c);
  if (target.status !== 'active') return statusMessage(state, target);
  if (c.controllerId !== o.fromId || target.controllerId !== o.toId) return T.notController(c.controllerId === o.fromId ? target.name : c.name);
  const sector = getContent(langOf(state)).sectors[o.sectorId].name;
  if (!c.products.some((p) => p.sectorId === o.sectorId) || !target.products.some((p) => p.sectorId === o.sectorId)) {
    return T.cartelNeedsProducts(sector);
  }
  const k1 = cartelOf(state, c.id, o.sectorId);
  if (k1) {
    const members = cartelMembers(state, k1);
    if (members.some((m) => m.id === target.id)) return T.cartelAlready;
    if (members.some((m) => m.controllerId === target.controllerId)) return T.cartelSelf;
  }
  if (stage === 'accept') {
    const k2 = cartelOf(state, target.id, o.sectorId);
    if (k2 && k2 !== k1) return T.cartelOther;
  }
  return null;
}

/** Offre avant son identifiant (union distribuée). */
type OfferDraft = Omit<ShareOffer, 'id'> | Omit<ContractOffer, 'id'> | Omit<CartelOffer, 'id'>;

/** Refus éventuel d'une offre au moment où son destinataire l'accepte (tout se revérifie). */
function acceptProblem(state: GameState, o: OfferDraft): string | null {
  if (o.kind === 'shares') return shareOfferProblem(state, o);
  if (o.kind === 'contract') return contractOfferProblem(state, o);
  return cartelOfferProblem(state, o, 'accept');
}

/** Exécute une offre acceptée (déjà validée) ; renvoie le détail pour les deux joueurs. */
function executeOffer(state: GameState, o: Offer): string {
  const T = M(state);
  if (o.kind === 'shares') {
    const c = state.companies[o.companyId];
    const seller = state.players[o.side === 'sell' ? o.fromId : o.toId];
    const buyer = state.players[o.side === 'sell' ? o.toId : o.fromId];
    const S = c.sharesOutstanding;
    const total = o.shares * o.price;
    const buyerBefore = holdingOf(c, buyer.id);
    const sellerBefore = holdingOf(c, seller.id);
    const sellerRan = c.controllerId === seller.id;
    const buyerRuns = c.controllerId === buyer.id;
    addHolding(c, seller.id, -o.shares);
    addHolding(c, buyer.id, o.shares);
    seller.cash += total;
    buyer.cash -= total;
    // Les cessions de gré à gré comptent aussi pour le délit d'initié crypto.
    (state.shareSales ??= []).push({
      turn: state.turn,
      playerId: seller.id,
      companyId: c.id,
      shares: o.shares,
      holdingBefore: sellerBefore,
      sellerController: sellerRan,
      hadCryptoLine: c.products.some((p) => p.sectorId === 'crypto'),
    });
    recordSharePurchase(state, buyer.id, c.id, o.shares);
    let details = T.blockDone(o.shares, c.ticker, seller.name, buyer.name, o.price, total);
    // Racheter sa propre entreprise (ou celle dont on vient de céder le contrôle) reste un délit d'initié présumé,
    // même hors marché (§6.2).
    if (buyerRuns || soldControlThisTurn(c, buyer.id)) details += insiderPurchase(state, buyer, c, o.shares, S);
    addFlash(state, {
      title: tr(state).blockSaleTitle(buyer.name, tr(state).pct(o.shares / Math.max(S, 1), 1), c.name, seller.name),
      body: tr(state).blockSaleBody(tr(state).money(total)),
      tone: 'drama',
      companyIds: [c.id],
      event: { type: 'blockSale', actorId: buyer.id, subjectId: seller.id, pct: o.shares / Math.max(S, 1), amount: total },
    });
    // Le dirigeant qui cède lui-même le contrôle n'est pas « évincé » : passation, sans parachute (§7 bis).
    const change = checkControl(state, c, sellerRan ? seller.id : undefined);
    if (!change) checkStakeThresholds(state, c, buyer.id, buyerBefore, S);
    if (sellerRan && change && change.oldControllerId === seller.id) {
      details += T.lostControl(c.name);
      const ex = (c.turnFlags.exControllers ??= []);
      if (!ex.includes(seller.id)) ex.push(seller.id);
    }
    return details;
  }
  if (o.kind === 'contract') {
    (state.contracts ??= []).push({
      id: newId(state, 'k'),
      sellerCompanyId: o.sellerCompanyId,
      buyerCompanyId: o.buyerCompanyId,
      commodityId: o.commodityId,
      lots: o.lots,
      price: o.price,
      turnsLeft: o.turns,
    });
    const cname = getContent(langOf(state)).commodities[o.commodityId].name;
    return T.contractSigned(state.companies[o.sellerCompanyId].name, state.companies[o.buyerCompanyId].name, o.lots, cname, o.price, o.turns);
  }
  const c = state.companies[o.companyId];
  const target = state.companies[o.targetCompanyId];
  const member = (x: CompanyState) => ({ companyId: x.id, controllerId: x.controllerId as Id });
  // L'invité rejoint l'entente du proposant, ou les deux en fondent une.
  let k = cartelOf(state, c.id, o.sectorId);
  if (k) k.members.push(member(target));
  else {
    k = { id: newId(state, 'e'), sectorId: o.sectorId, members: [member(c), member(target)], since: state.turn };
    (state.cartels ??= []).push(k);
  }
  pruneCartels(state);
  const n = k ? k.members.length : 2;
  const risk = k ? cartelRiskOf(state, k) : 0;
  return T.cartelSigned(getContent(langOf(state)).sectors[o.sectorId].name, n, tr(state).pct(risk, 0));
}

/**
 * Enregistre une offre valide. Un bot répond sur-le-champ (botDeals.ts) ; un humain a jusqu'à la clôture du
 * trimestre pour accepter ou décliner.
 */
function propose(state: GameState, key: string, draft: OfferDraft): ActionResult {
  const T = M(state);
  mutating();
  const offer = { ...draft, id: newId(state, 'o') } as Offer;
  (state.offers ??= []).push(offer);
  const to = state.players[offer.toId];
  if (!to.isBot) return success(state, key, T.offerSent(to.name));
  // Le bot décline sans dire pourquoi : une offre impossible de son côté (il est dans une autre entente…) ne
  // doit rien révéler au proposant.
  if (acceptProblem(state, offer) !== null || !botAcceptsOffer(state, offer)) {
    offer.status = 'declined';
    return success(state, key, T.offerBotDeclined(to.name));
  }
  offer.status = 'accepted';
  return success(state, key, T.offerBotAccepted(to.name, executeOffer(state, offer)));
}

function offerShares(state: GameState, actorId: Id | null, a: A<'offerShares'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.offerOnlyPlayers, false);
  const other = counterpart(state, player, a.counterpartyId);
  if (typeof other === 'string') return refuse(state, other, false);
  const n = toPositiveInt(a.shares);
  if (n === null) return refuse(state, T.invalidShares, false);
  if (!isFiniteNumber(a.price) || !(a.price > 0) || (a.side !== 'sell' && a.side !== 'buy')) return refuse(state, T.invalidAmount, false);
  if (offersSentThisTurn(state, player.id) >= OFFERS_PER_TURN) return refuse(state, T.offerLimit(OFFERS_PER_TURN));
  const draft: Omit<ShareOffer, 'id'> = {
    kind: 'shares', turn: state.turn, fromId: player.id, toId: other.id, status: 'pending',
    companyId: String(a.companyId), shares: n, price: a.price, side: a.side,
  };
  const problem = shareOfferProblem(state, draft);
  if (problem) return refuse(state, problem);
  // Qui achète doit pouvoir payer : le proposant dès l'envoi, l'interlocuteur au moment d'accepter.
  if (a.side === 'buy' && n * a.price > player.cash + EPS) return refuse(state, T.blockCash(player.name, n * a.price));
  return propose(state, 'offerShares', draft);
}

function offerContract(state: GameState, actorId: Id | null, a: A<'offerContract'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.offerOnlyPlayers, false);
  const seller = getOwn(state.companies, a.sellerCompanyId);
  const buyer = getOwn(state.companies, a.buyerCompanyId);
  if (!seller || !buyer) return refuse(state, T.companyNotFound, false);
  if (seller.status !== 'active') return refuse(state, statusMessage(state, seller));
  if (buyer.status !== 'active') return refuse(state, statusMessage(state, buyer));
  if (seller.id === buyer.id) return refuse(state, T.contractSameCompany, false);
  if (!validCommodity(a.commodityId)) return refuse(state, T.unknownCommodity, false);
  const runsSeller = seller.controllerId === player.id;
  const runsBuyer = buyer.controllerId === player.id;
  if (!runsSeller && !runsBuyer) return refuse(state, T.contractNotYours);
  const lots = toPositiveInt(a.lots);
  const turns = toPositiveInt(a.turns);
  const [minPrice, maxPrice] = contractPriceRange(a.commodityId, state.commodities[a.commodityId], runsSeller && runsBuyer);
  const priceOk = isFiniteNumber(a.price) && a.price >= minPrice - EPS && a.price <= maxPrice + EPS;
  if (runsSeller && runsBuyer && lots !== null && turns !== null && lots <= CONTRACT_MAX_LOTS && turns <= CONTRACT_MAX_TURNS && !priceOk) {
    return refuse(state, T.contractArmsLength(minPrice, maxPrice));
  }
  if (lots === null || turns === null || lots > CONTRACT_MAX_LOTS || turns > CONTRACT_MAX_TURNS || !priceOk) {
    return refuse(state, T.contractBounds(minPrice, maxPrice, CONTRACT_MAX_LOTS, CONTRACT_MAX_TURNS));
  }
  const draft = {
    kind: 'contract' as const, turn: state.turn, fromId: player.id, toId: player.id, status: 'pending' as const,
    sellerCompanyId: seller.id, buyerCompanyId: buyer.id, commodityId: a.commodityId, lots, price: a.price, turns,
  };
  // Deux entreprises du même groupe : le contrat vaut dès maintenant, sans offre.
  if (runsSeller && runsBuyer) {
    const problem = contractOfferProblem(state, draft);
    if (problem) return refuse(state, problem);
    mutating();
    return success(state, 'offerContract', executeOffer(state, { ...draft, id: '', status: 'accepted' }));
  }
  const otherId = runsSeller ? buyer.controllerId : seller.controllerId;
  if (otherId === null) return refuse(state, T.offerAutopilot(runsSeller ? buyer.name : seller.name));
  if (offersSentThisTurn(state, player.id) >= OFFERS_PER_TURN) return refuse(state, T.offerLimit(OFFERS_PER_TURN));
  const offer = { ...draft, toId: otherId };
  const problem = contractOfferProblem(state, offer);
  if (problem) return refuse(state, problem);
  return propose(state, 'offerContract', offer);
}

function proposeCartel(state: GameState, actorId: Id | null, a: A<'proposeCartel'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!validSector(a.sectorId)) return refuse(state, T.unknownSector, false);
  const target = getOwn(state.companies, a.targetCompanyId);
  if (!target) return refuse(state, T.companyNotFound, false);
  if (target.status !== 'active') return refuse(state, statusMessage(state, target));
  if (target.controllerId === null) return refuse(state, T.offerAutopilot(target.name));
  if (target.controllerId === c.controllerId) return refuse(state, T.cartelSelf, false);
  if (offersSentThisTurn(state, c.controllerId as Id) >= OFFERS_PER_TURN) return refuse(state, T.offerLimit(OFFERS_PER_TURN));
  const draft: Omit<CartelOffer, 'id'> = {
    kind: 'cartel', turn: state.turn, fromId: c.controllerId as Id, toId: target.controllerId, status: 'pending',
    companyId: c.id, targetCompanyId: target.id, sectorId: a.sectorId,
  };
  const problem = cartelOfferProblem(state, draft, 'send');
  if (problem) return refuse(state, problem);
  return propose(state, 'proposeCartel', draft);
}

function answerOffer(state: GameState, actorId: Id | null, a: A<'answerOffer'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.offerOnlyPlayers, false);
  const o = offerById(state, a.offerId);
  if (!o || o.status !== 'pending' || o.turn !== state.turn) return refuse(state, T.offerNotFound, false);
  if (o.toId !== player.id) return refuse(state, T.offerNotForYou, false);
  if (a.accept !== true) {
    mutating();
    o.status = 'declined';
    return success(state, 'answerOffer', T.offerDeclined);
  }
  // Tout se revérifie : les cours, les stocks, les dirigeants ont pu changer depuis l'envoi.
  const problem = acceptProblem(state, o);
  if (problem) return refuse(state, problem);
  if (o.kind === 'shares') {
    const buyer = state.players[o.side === 'sell' ? o.toId : o.fromId];
    if (o.shares * o.price > buyer.cash + EPS) return refuse(state, T.blockCash(buyer.name, o.shares * o.price));
  }
  mutating();
  o.status = 'accepted';
  return success(state, 'answerOffer', executeOffer(state, o));
}

function cancelOffer(state: GameState, actorId: Id | null, a: A<'cancelOffer'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.offerOnlyPlayers, false);
  const o = offerById(state, a.offerId);
  if (!o || o.status !== 'pending' || o.turn !== state.turn) return refuse(state, T.offerNotFound, false);
  if (o.fromId !== player.id) return refuse(state, T.offerNotYours, false);
  mutating();
  o.status = 'cancelled';
  return success(state, 'cancelOffer', T.offerCancelled);
}

function leaveCartel(state: GameState, actorId: Id | null, a: A<'leaveCartel'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!validSector(a.sectorId)) return refuse(state, T.unknownSector, false);
  const sector = getContent(langOf(state)).sectors[a.sectorId].name;
  const k = cartelOf(state, c.id, a.sectorId);
  const m = k?.members.find((x) => x.companyId === c.id);
  if (!k || !m) return refuse(state, T.cartelNone(sector), false);
  // La sortie prend effet à la clôture : le risque du trimestre court encore (sinon on entrerait, lirait les prix
  // des partenaires et sortirait avant le tirage, sans jamais rien risquer).
  if (m.leaving) return refuse(state, T.cartelLeaving(sector), false);
  mutating();
  m.leaving = true;
  return success(state, 'leaveCartel', T.cartelLeft(sector));
}

// ---------------------------------------------------------------------------
// Entreprise : production
// ---------------------------------------------------------------------------

function setProductDecisions(state: GameState, actorId: Id | null, a: A<'setProductDecisions'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  const p = findProduct(c, a.productId);
  if (!p) return refuse(state, T.productNotFound, false);
  const def = SECTORS[p.sectorId];
  const has = (x: unknown) => x !== undefined && x !== null;
  if (!has(a.price) && !has(a.production) && !has(a.marketing) && !has(a.rnd)) {
    return refuse(state, T.noDecision, false);
  }
  if (has(a.price) && !(isFiniteNumber(a.price) && a.price > 0)) return refuse(state, T.invalidPrice, false);
  if (has(a.production) && !(isFiniteNumber(a.production) && a.production >= 0)) {
    return refuse(state, T.invalidProduction, false);
  }
  if (has(a.marketing) && !(isFiniteNumber(a.marketing) && a.marketing >= 0)) {
    return refuse(state, T.invalidMarketing, false);
  }
  if (has(a.rnd) && !(isFiniteNumber(a.rnd) && a.rnd >= 0)) return refuse(state, T.invalidRnd, false);

  mutating();
  const notes: string[] = [];
  if (isFiniteNumber(a.price)) {
    const lo = PRICE_MIN_RATIO * def.refPrice;
    const hi = PRICE_MAX_RATIO * def.refPrice;
    p.price = clamp(a.price, lo, hi);
    notes.push(T.notePrice(p.price, a.price < lo - EPS || a.price > hi + EPS));
  }
  if (isFiniteNumber(a.production)) {
    const maxProd = PRODUCTION_MAX_RATIO * (p.capacity + p.pendingCapacity);
    p.production = clamp(Math.round(a.production), 0, maxProd);
    notes.push(T.noteProduction(p.production, p.production > p.capacity ? p.capacity : null));
  }
  if (isFiniteNumber(a.marketing)) {
    p.marketing = clamp(a.marketing, 0, MAX_SPEND_PER_PRODUCT);
    notes.push(T.noteMarketing(p.marketing));
  }
  if (isFiniteNumber(a.rnd)) {
    p.rnd = clamp(a.rnd, 0, MAX_SPEND_PER_PRODUCT);
    notes.push(T.noteRnd(p.rnd));
  }
  const profile = productProfile(c, p);
  if (profile) {
    if (isFiniteNumber(a.price)) profile.price = p.price;
    if (isFiniteNumber(a.marketing)) profile.marketing = p.marketing;
    if (isFiniteNumber(a.rnd)) profile.rnd = p.rnd;
    syncProductProfiles(c);
  }
  return success(state, 'setProductDecisions', T.decisions(p.name, notes));
}

function bidLand(state: GameState, actorId: Id | null, a: A<'bidLand'>): ActionResult {
  const text = industryMessages(langOf(state));
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!usesIndustryNetwork(state) || !actorId) return refuse(state, text.unavailable, false);
  const error = hexBidError(state, actorId, a.hexId, a.bid, 0, c.cash, c.name, undefined, undefined, true);
  if (error) return refuse(state, error, false);
  const reserve = bareLandReserve(state, actorId, a.hexId);
  if (a.bid < reserve) return refuse(state, text.reserve(tr(state).money(reserve)), false);
  mutating();
  state.hexBids = (state.hexBids ?? []).filter(b => b.result || b.playerId !== actorId || b.kind !== 'land');
  state.hexBids.push({ kind: 'land', companyId: c.id, playerId: actorId, hexId: a.hexId, amount: a.bid, reserve, turn: state.turn });
  return success(state, 'bidLand', text.landBid(hexPlaceName(a.hexId, langOf(state), state.siteSlots)));
}

function sellLand(state: GameState, actorId: Id | null, a: A<'sellLand'>): ActionResult {
  const text = industryMessages(langOf(state));
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!usesIndustryNetwork(state)) return refuse(state, text.unavailable, false);
  if (typeof a.hexId !== 'string' || !cellBelongsToBoard(a.hexId, state.config)) return refuse(state, M(state).unknownHex, false);
  const parcel = ownedLand(c).find(land => land.hexId === a.hexId);
  if (!parcel) return refuse(state, text.landNotOwned, false);
  if (factoryOnLand(c, a.hexId)) return refuse(state, text.occupied, false);
  mutating();
  ensureLand(c);
  c.land = c.land!.filter(land => land.hexId !== a.hexId);
  const cash = parcel.cost * .5;
  c.cash += cash;
  return success(state, 'sellLand', text.sold(hexPlaceName(a.hexId, langOf(state), state.siteSlots), tr(state).money(cash)));
}

/** A physical factory shares a commercial profile, but owns its own capacity, stock and production plan. */
export function realizeHexFactory(state: GameState, c: CompanyState, source: ProductState, hexId: Id): ProductState {
  const profile = ensureProductProfile(c, source);
  const def = SECTORS[source.sectorId];
  c.cash -= def.launchCost;
  (c.launchCharges ??= []).push({ perTurn: def.launchCost / LAUNCH_AMORTIZATION_TURNS, turnsLeft: LAUNCH_AMORTIZATION_TURNS });
  const factory = newProduct(state, source.sectorId, profile.name, { pending: true });
  factory.factoryProductId = profile.id;
  factory.hexId = hexId;
  factory.production = def.startingCapacity;
  factory.lastPrice = source.lastPrice ?? source.price;
  c.products.push(factory);
  syncProductProfiles(c);
  return factory;
}

function buildFactory(state: GameState, actorId: Id | null, a: A<'buildFactory'>): ActionResult {
  const text = industryMessages(langOf(state));
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!usesIndustryNetwork(state) || !actorId) return refuse(state, text.unavailable, false);
  if (typeof a.hexId !== 'string' || !cellBelongsToBoard(a.hexId, state.config)) return refuse(state, M(state).unknownHex, false);
  const source = findProduct(c, a.productId);
  if (state.turn >= state.config.totalTurns) return refuse(state, M(state).hexBidLastTurn, false);
  if (!source) return refuse(state, M(state).productNotFound, false);
  const owned = ownedLand(c).some(parcel => parcel.hexId === a.hexId);
  const cost = SECTORS[source.sectorId].launchCost;
  if (owned) {
    if (factoryOnLand(c, a.hexId)) return refuse(state, M(state).hexOccupied, false);
    if (c.cash < cost) return refuse(state, M(state).launchCash(source.name, cost, c.name, Math.max(0, c.cash)), false);
    mutating();
    ensureLand(c);
    realizeHexFactory(state, c, source, a.hexId);
    return success(state, 'buildFactory', text.factory(source.name, hexPlaceName(a.hexId, langOf(state), state.siteSlots)));
  }
  const error = hexBidError(state, actorId, a.hexId, a.bid, cost, c.cash, c.name);
  if (error) return refuse(state, error, false);
  mutating();
  (state.hexBids ??= []).push({ kind: 'factory', companyId: c.id, playerId: actorId, productId: source.id,
    hexId: a.hexId, amount: a.bid!, turn: state.turn });
  return success(state, 'buildFactory', text.factoryBid(source.name, hexPlaceName(a.hexId, langOf(state), state.siteSlots)));
}

/** Validation commune, avant toute mutation de trésorerie ou de produit. */
function hexPlacementError(state: GameState, hexId: unknown): string | undefined {
  const T = M(state);
  if (typeof hexId !== 'string' || !cellBelongsToBoard(hexId, state.config)) return T.unknownHex;
  if (!boardBuildable(state.config).includes(hexId)) return T.hexNotBuildable;
  if (Object.prototype.hasOwnProperty.call(occupiedHexes(state), hexId)) return T.hexOccupied;
  return undefined;
}

/** Une mise ne réserve aucune case et ne dépense rien avant l'adjudication. */
function hexBidError(
  state: GameState, actorId: Id | null, hexId: unknown, amount: unknown,
  cost: number, cash: number, companyName: string, fallback?: unknown,
  replacingProductId?: Id,
  replacingLand = false,
): string | undefined {
  const T = M(state);
  if (state.turn >= state.config.totalTurns) return T.hexBidLastTurn;
  const error = hexPlacementError(state, hexId);
  if (error) return error;
  const bid = positiveAmount(amount);
  if (bid === null) return T.invalidAmount;
  const reserve = hexReservePrice(hexId as string);
  if (bid < reserve) return T.hexBidLow(hexPlaceName(hexId as string, langOf(state), state.siteSlots), reserve);
  if (bid + cost > cash) return T.hexBidCash(bid, cost, companyName, Math.max(0, cash));
  if (fallback !== undefined && fallback !== 'nearest' && fallback !== 'abandon') return T.hexFallbackInvalid;
  if ((state.hexBids ?? []).some((b) => !b.result && b.playerId === actorId && b.hexId === hexId
    && state.companies[b.companyId]?.controllerId === actorId
    && (b.kind === 'land' || b.kind === 'launch' || state.companies[b.companyId]?.products.some((p) => p.id === b.productId))
    && !(replacingLand && b.kind === 'land')
    && !(replacingProductId !== undefined && b.productId === replacingProductId))) return T.hexBidDuplicate;
  return undefined;
}

function cancelHexBid(state: GameState, actorId: Id | null, a: A<'cancelHexBid'>): ActionResult {
  const T = M(state);
  if (!isSpatialMap(state.config)) return refuse(state, T.hexBidOnly, false);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if ([a.productId, a.projectId, a.hexId].filter(id => typeof id === 'string').length !== 1) return refuse(state, T.hexNoBid, false);
  const i = (state.hexBids ?? []).findIndex((b) => !b.result && b.companyId === c.id && b.playerId === actorId
    && (a.hexId !== undefined ? b.hexId === a.hexId : a.productId !== undefined ? b.productId === a.productId : b.project?.id === a.projectId));
  if (i < 0) return refuse(state, T.hexNoBid, false);
  mutating();
  state.hexBids!.splice(i, 1);
  if (state.hexBids!.length === 0) delete state.hexBids;
  return success(state, 'cancelHexBid', T.hexBidCancelled);
}

/** Appelé seulement par l'adjudication : le prix du terrain est réglé séparément. */
export function realizeHexLaunch(state: GameState, c: CompanyState, project: HexLaunchProject, hexId: Id): ProductState {
  const def = SECTORS[project.sectorId];
  c.cash -= def.launchCost;
  (c.launchCharges ??= []).push({ perTurn: def.launchCost / LAUNCH_AMORTIZATION_TURNS, turnsLeft: LAUNCH_AMORTIZATION_TURNS });
  const p = newProduct(state, project.sectorId, project.name, { pending: true });
  p.hexId = hexId;
  c.products.push(p);
  return p;
}

function launchProduct(state: GameState, actorId: Id | null, a: A<'launchProduct'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!validSector(a.sectorId)) return refuse(state, T.unknownSector, false);
  const hexMode = isSpatialMap(state.config);
  if (!hexMode && a.zoneId !== undefined && !validZone(a.zoneId)) return refuse(state, T.unknownZone, false);
  const name = cleanName(a.name, 40);
  if (!name) return refuse(state, T.productNeedsName, false);
  const maxProducts = maxProductsOf(c);
  const projects = hexMode ? (state.hexBids ?? []).filter((b) => !b.result && b.kind === 'launch'
    && b.companyId === c.id && b.playerId === actorId).length : 0;
  if ((usesIndustryNetwork(state) ? productCount(c) : c.products.length) + projects >= maxProducts) return refuse(state, T.maxProducts(maxProducts));
  const def = SECTORS[a.sectorId];
  const sectorName = getContent(langOf(state)).sectors[a.sectorId].name;
  if (hexMode) {
    if (typeof a.hexId !== 'string' || !cellBelongsToBoard(a.hexId, state.config)) return refuse(state, T.unknownHex, false);
    if (usesIndustryNetwork(state) && a.hexId && ownedLand(c).some(parcel => parcel.hexId === a.hexId)) {
      if (state.turn >= state.config.totalTurns) return refuse(state, T.hexBidLastTurn, false);
      if (factoryOnLand(c, a.hexId)) return refuse(state, T.hexOccupied, false);
      if (c.cash < def.launchCost) return refuse(state, T.launchCash(sectorName, def.launchCost, c.name, Math.max(c.cash, 0)), false);
      mutating(); ensureLand(c);
      const p = realizeHexLaunch(state, c, { id: '', sectorId: a.sectorId, name }, a.hexId);
      return success(state, 'launchProduct', industryMessages(langOf(state)).newProductFactory(p.name, hexPlaceName(a.hexId, langOf(state), state.siteSlots)));
    }
    const player = playerOf(state, actorId);
    if (!player) return refuse(state, tr(state).unknownPlayer, false);
    if (a.fallback !== 'nearest' && a.fallback !== 'abandon') return refuse(state, T.hexFallbackInvalid, false);
    const error = hexBidError(state, actorId, a.hexId, a.bid, def.launchCost, c.cash, c.name, a.fallback);
    if (error) return refuse(state, error, false);
    mutating();
    // A successor must not inherit canceled-project history through its own IDs.
    const counter = (player.hexLaunchProjectCounter ?? 0) + 1;
    player.hexLaunchProjectCounter = counter;
    const project: HexLaunchProject = { id: `hp-${state.turn}-${c.id}-${player.id}-${counter}`, sectorId: a.sectorId, name };
    (state.hexBids ??= []).push({ kind: 'launch', companyId: c.id, playerId: player.id,
      hexId: a.hexId!, amount: a.bid!, turn: state.turn, project, fallback: a.fallback });
    return success(state, 'hexLaunchBid', T.hexLaunchPlanned(name, hexPlaceName(a.hexId!, langOf(state), state.siteSlots), a.bid!));
  }
  if (def.launchCost > c.cash + EPS) {
    return refuse(state, T.launchCash(sectorName, def.launchCost, c.name, Math.max(c.cash, 0)));
  }
  mutating();
  c.cash -= def.launchCost;
  // Le coût du lancement est étalé dans le compte de résultat : un quart par trimestre, dès ce trimestre (§5.6).
  (c.launchCharges ??= []).push({ perTurn: def.launchCost / LAUNCH_AMORTIZATION_TURNS, turnsLeft: LAUNCH_AMORTIZATION_TURNS });
  // Décisions cachées (§7, §12) : la capacité n'est livrée qu'au trimestre suivant, le produit vend à partir de là.
  const p = newProduct(state, a.sectorId, name, { pending: true });
  // L'usine s'installe dans la zone choisie (§5.8) ; à la capitale, le produit n'a pas de zone.
  if (a.zoneId !== undefined && a.zoneId !== DEFAULT_ZONE) p.zoneId = a.zoneId;
  c.products.push(p);
  const localArticle = settlementArticle(state, c, p);
  if (localArticle) currentIssue(state)?.articles.push(localArticle);
  else addFlash(state, {
    title: headlineText(state, 'productLaunch', { company: c.name, product: p.name, sector: sectorName }),
    body: body(state, 'productLaunch', p.id),
    tone: 'good',
    companyIds: [c.id],
    sectorIds: [a.sectorId],
    event: { type: 'productLaunch', actorId: c.controllerId ?? undefined, productId: p.id },
  });
  return success(
    state,
    'launchProduct',
    T.launched(p.name, sectorName, def.launchCost, p.pendingCapacity, p.price) +
      (p.zoneId !== undefined ? T.launchZone(zoneName(state, p.zoneId)) : '') +
      T.launchNextQuarter +
      T.launchAmortized(def.launchCost / LAUNCH_AMORTIZATION_TURNS, LAUNCH_AMORTIZATION_TURNS),
  );
}

/**
 * Déménage l'usine d'un produit dans une autre zone (§5.8) : gratuit le trimestre où le produit démarre, sinon une part
 * de la valeur de sa capacité, payée comptant et passée en charges spéciales. En classique, effet immédiat.
 * En hexagonal, l'enchère est réglée après les ventes et le déplacement exécuté après la clôture.
 */
function moveFactory(state: GameState, actorId: Id | null, a: A<'moveFactory'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  const p = findProduct(c, a.productId);
  if (!p) return refuse(state, T.productNotFound, false);
  if (usesIndustryNetwork(state) && !p.incubator) return refuse(state, industryMessages(langOf(state)).fixedFactory, false);
  const hexMode = isSpatialMap(state.config);
  let zone: string;
  if (hexMode) {
    if (a.hexId === p.hexId && p.hexId !== undefined) return refuse(state, T.factoryAlreadyThere(p.name, hexPlaceLabel(p.hexId, langOf(state), state.siteSlots)), false);
    const startup = p.incubator === true;
    if (startup && a.fallback !== 'nearest' && a.fallback !== 'abandon') return refuse(state, T.hexFallbackInvalid, false);
    const cost = startup ? 0 : factoryMoveCost(state, p);
    const error = hexBidError(state, actorId, a.hexId, a.bid, cost, c.cash, c.name,
      startup ? a.fallback : undefined, p.id);
    if (error) return refuse(state, error, false);
    mutating();
    const bid: HexBid = { kind: startup ? 'startup' : 'move', companyId: c.id, playerId: actorId as Id,
      productId: p.id, hexId: a.hexId!, amount: a.bid!, turn: state.turn,
      fallback: startup ? a.fallback! : 'abandon' };
    const bids = (state.hexBids ??= []);
    const i = bids.findIndex((b) => b.companyId === c.id && b.productId === p.id && b.playerId === actorId && !b.result);
    if (i >= 0) bids[i] = bid;
    else bids.push(bid);
    return startup
      ? success(state, 'hexStartupBid', T.hexStartupPlanned(p.name, hexPlaceName(a.hexId!, langOf(state), state.siteSlots), a.bid!, a.fallback!))
      : success(state, 'hexMoveBid', T.hexMovePlanned(p.name, hexPlaceName(a.hexId!, langOf(state), state.siteSlots), a.bid!));
  } else {
    if (!validZone(a.zoneId)) return refuse(state, T.unknownZone, false);
    zone = zoneName(state, a.zoneId);
    if (zoneOf(p).id === a.zoneId) return refuse(state, T.factoryAlreadyThere(p.name, zone), false);
  }
  const cost = factoryMoveCost(state, p);
  if (cost > c.cash + EPS) return refuse(state, T.factoryMoveCash(p.name, cost, c.name, Math.max(0, c.cash)));
  mutating();
  if (cost > 0) {
    c.cash -= cost;
    c.turnFlags.specialCharges = Math.max(0, c.turnFlags.specialCharges ?? 0) + cost;
  }
  if (a.zoneId === DEFAULT_ZONE) delete p.zoneId;
  else p.zoneId = a.zoneId;
  const result = success(state, 'moveFactory', cost > 0 ? T.factoryMoved(p.name, zone, cost) : T.factoryMovedFree(p.name, zone));
  engineDiagnostics.factoryMoves++;
  return result;
}

function discontinueProduct(state: GameState, actorId: Id | null, a: A<'discontinueProduct'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  const p = findProduct(c, a.productId);
  if (!p) return refuse(state, T.productNotFound, false);
  // La dotation de revente compte avant la révocation du terrain (ci-dessous).
  const salvageRate = terrainSalvageRate(state, p, c);
  const cash = productSalvageValue(p, isSpatialMap(state.config) && !usesIndustryNetwork(state), salvageRate);
  mutating();
  if (usesIndustryNetwork(state)) ensureLand(c);
  c.cash += cash;
  // Plant and land already carry half their purchase cost: the disposal produces no gain.
  // Only the unrecovered fraction of finished stock is an exceptional, deductible loss.
  const stockLoss = (1 - salvageRate) * p.stock * p.lastUnitCost;
  if (stockLoss > 0) c.turnFlags.exceptionalLoss = Math.max(0, c.turnFlags.exceptionalLoss ?? 0) + stockLoss;
  revokeTerrain(state, c, p);
  c.products = c.products.filter((x) => x.id !== p.id);
  syncProductProfiles(c);
  if (isSpatialMap(state.config) && state.hexBids) {
    state.hexBids = state.hexBids.filter((b) => b.result !== undefined || b.productId !== p.id);
    if (state.hexBids.length === 0) delete state.hexBids;
  }
  return success(state, 'discontinueProduct', T.discontinued(p.name, p.stock, p.capacity + p.pendingCapacity, cash));
}

function expandCapacity(state: GameState, actorId: Id | null, a: A<'expandCapacity'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  const p = findProduct(c, a.productId);
  if (!p) return refuse(state, T.productNotFound, false);
  const n = toPositiveInt(a.lots);
  if (n === null) return refuse(state, T.invalidLots, false);
  if (n > MAX_CAPACITY_ORDER) return refuse(state, T.orderTooBig(MAX_CAPACITY_ORDER), false);
  if (usesIndustryNetwork(state) && p.capacity + p.pendingCapacity + n > factoryCapacityLimit(p)) return refuse(state, industryMessages(langOf(state)).capacity(factoryCapacityLimit(p)), false);
  const def = SECTORS[p.sectorId];
  const cost = n * def.capacityCost;
  if (cost > c.cash + EPS) return refuse(state, T.expandCash(n, cost, c.name, Math.max(c.cash, 0)));
  mutating();
  c.cash -= cost;
  p.pendingCapacity += n;
  return success(state, 'expandCapacity', T.expanded(n, p.name, cost));
}

function buyCommodity(state: GameState, actorId: Id | null, a: A<'buyCommodity'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!validCommodity(a.commodityId)) return refuse(state, T.unknownCommodity, false);
  const n = toPositiveInt(a.lots);
  if (n === null) return refuse(state, T.invalidLots, false);
  const def = COMMODITIES[a.commodityId];
  const cname = getContent(langOf(state)).commodities[a.commodityId].name;
  if (n > def.liquidity) return refuse(state, T.marketDepth(cname, def.liquidity));
  const q = commodityBuyQuote(state, a.commodityId, n);
  if (q.total > c.cash + EPS) return refuse(state, T.commodityCash(n, cname, q.total));
  mutating();
  c.cash -= q.total;
  addInventory(c, a.commodityId, n, q.avg);
  state.commodities[a.commodityId].price = q.newPrice;
  return success(state, 'buyCommodity', T.commodityBought(n, cname, q.total, q.avg, q.newPrice));
}

function sellCommodity(state: GameState, actorId: Id | null, a: A<'sellCommodity'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (!validCommodity(a.commodityId)) return refuse(state, T.unknownCommodity, false);
  const n = toPositiveInt(a.lots);
  if (n === null) return refuse(state, T.invalidLots, false);
  const def = COMMODITIES[a.commodityId];
  const cname = getContent(langOf(state)).commodities[a.commodityId].name;
  const have = c.inventory[a.commodityId]?.lots ?? 0;
  if (n > have + EPS) return refuse(state, T.onlyInStock(have, cname));
  if (n > def.liquidity) return refuse(state, T.marketDepth(cname, def.liquidity));
  const q = commoditySellQuote(state, a.commodityId, n);
  mutating();
  removeInventory(c, a.commodityId, n);
  c.cash += q.total;
  state.commodities[a.commodityId].price = q.newPrice;
  return success(state, 'sellCommodity', T.commoditySold(n, cname, q.total, q.avg, q.newPrice));
}

// ---------------------------------------------------------------------------
// Entreprise : finance
// ---------------------------------------------------------------------------

function takeLoan(state: GameState, actorId: Id | null, a: A<'takeLoan'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  const amount = positiveAmount(a.amount);
  if (amount === null) return refuse(state, T.invalidAmount, false);
  const limit = companyLoanLimit(c);
  if (amount > limit + EPS) return refuse(state, T.companyLoanCap(c.name, limit));
  mutating();
  c.cash += amount;
  c.debt += amount;
  c.turnFlags.borrowed = borrowedThisTurn(c) + amount;
  return success(state, 'takeLoan', T.companyLoan(amount, c.name, c.debt, companyInterestRate(state, c)));
}

function repayLoan(state: GameState, actorId: Id | null, a: A<'repayLoan'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  const asked = positiveAmount(a.amount);
  if (asked === null) return refuse(state, T.invalidAmount, false);
  if (c.debt <= EPS) return refuse(state, T.noCompanyDebt(c.name));
  const amount = Math.min(asked, c.debt);
  if (amount > c.cash + EPS) return refuse(state, T.companyCashShort(c.name, Math.max(c.cash, 0)));
  mutating();
  c.cash -= amount;
  c.debt = Math.max(0, c.debt - amount);
  if (c.debt < EPS) c.debt = 0;
  return success(state, 'repayLoan', T.companyRepaid(amount, c.name, c.debt));
}

function payDividend(state: GameState, actorId: Id | null, a: A<'payDividend'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  const asked = positiveAmount(a.amount);
  if (asked === null) return refuse(state, T.invalidAmount, false);
  if (c.turnFlags.justFounded) return refuse(state, T.dividendJustFounded(c.name));
  if (asked > c.cash + EPS) return refuse(state, T.companyCashShort(c.name, Math.max(c.cash, 0)));
  const max = maxDividend(c);
  if (asked > max + EPS) {
    return refuse(state, T.dividendCap(max, borrowedThisTurn(c)));
  }
  mutating();
  const amount = Math.min(asked, max);
  const S = Math.max(c.sharesOutstanding, 1);
  const cap = marketCap(c);
  let mine = 0;
  for (const [pid, h] of Object.entries(c.holdings)) {
    const pl = getOwn(state.players, pid);
    if (!pl || !(h > 0)) continue;
    const part = (amount * h) / S;
    pl.cash += part;
    pl.stats.dividendsReceived += part;
    if (pid === actorId) mine = part;
  }
  c.cash -= amount;
  // Détachement du coupon : le cours baisse immédiatement du dividende par action.
  c.sharePrice = Math.max(PRICE_FLOOR, fin(c.sharePrice - amount / S, PRICE_FLOOR));
  c.sentiment = clamp(c.sentiment * (1 + DIVIDEND_SENTIMENT_FACTOR * Math.min(1, amount / Math.max(cap, 1))), SENTIMENT_MIN, SENTIMENT_MAX);
  addFlash(state, {
    title: headlineText(state, 'dividend', { company: c.name, amount: tr(state).money(amount) }),
    body: body(state, 'dividend', c.id),
    tone: 'good',
    companyIds: [c.id],
    event: { type: 'dividend', actorId: c.controllerId ?? undefined, amount },
  });
  return success(state, 'payDividend', T.dividendPaid(amount, amount / S, c.sharePrice, actorId !== null ? mine : null));
}

function ceoBonus(state: GameState, actorId: Id | null, a: A<'ceoBonus'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.autopilotNoBonus, false);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  const asked = positiveAmount(a.amount);
  if (asked === null) return refuse(state, T.invalidAmount, false);
  if (c.turnFlags.justFounded) return refuse(state, T.bonusJustFounded(c.name));
  const max = maxBonus(c);
  if (asked > max + EPS) {
    return refuse(state, T.bonusCap(max));
  }
  mutating();
  const amount = Math.min(asked, max);
  const base = Math.max(1, bonusBase(c));
  const tranches = amount / (BONUS_TRANCHE * base);
  const S = Math.max(c.sharesOutstanding, 1);
  c.cash -= amount;
  // Le cash qui sort de l'entreprise sort aussi du cours.
  c.sharePrice = Math.max(PRICE_FLOOR, fin(c.sharePrice - amount / S, PRICE_FLOOR));
  c.turnFlags.bonusTaken += amount;
  player.cash += amount;
  player.stats.bonusesTaken += amount;
  const scandalUp = BONUS_SCANDAL_PER_TRANCHE * tranches;
  const actualScandalUp = addScandal(state, c, scandalUp);
  c.sentiment = clamp(c.sentiment * Math.pow(BONUS_SENTIMENT_PER_TRANCHE, tranches), SENTIMENT_MIN, SENTIMENT_MAX);
  if (amount > FLASH_BONUS_MIN) {
    addFlash(state, {
      title: headlineText(state, 'ceoBonus', { ceo: player.name, company: c.name, amount: tr(state).money(amount) }),
      body: body(state, 'ceoBonus', c.id),
      tone: 'drama',
      companyIds: [c.id],
      event: { type: 'ceoBonus', actorId: player.id, amount },
    });
  }
  return success(state, 'ceoBonus', T.bonusPaid(amount, c.name, isSpatialMap(state.config) ? actualScandalUp : scandalUp));
}

function buyback(state: GameState, actorId: Id | null, a: A<'buyback'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (c.turnFlags.buybackDone) return refuse(state, T.oneBuyback);
  const n = toPositiveInt(a.shares);
  if (n === null) return refuse(state, T.invalidShares, false);
  const float = floatShares(c);
  if (n > float) return refuse(state, T.onlyFloat(float, c.ticker));
  // Flottant minimal (§6.2) : le rachat annule des actions du flottant et fait monter tous les actionnaires.
  const allowed = maxBuybackShares(c, n);
  if (allowed < n) return refuse(state, T.floatMin(allowed, c.ticker, FLOAT_MIN));
  const q = shareBuyQuote(c, n);
  if (q.total > c.cash + EPS) return refuse(state, T.buybackCash(q.total, c.name, Math.max(c.cash, 0)));
  mutating();
  const beforeS = c.sharesOutstanding;
  const before = { ...c.holdings };
  c.cash -= q.total;
  c.sharesOutstanding -= n;
  c.sharePrice = q.newPrice;
  c.turnFlags.buybackDone = true;
  addFlash(state, {
    title: headlineText(state, 'buyback', { company: c.name, amount: tr(state).money(q.total) }),
    body: body(state, 'buyback', c.id),
    tone: 'neutral',
    companyIds: [c.id],
    event: { type: 'buyback', actorId: c.controllerId ?? undefined, amount: q.total },
  });
  const change = checkControl(state, c);
  if (!change) for (const pid of Object.keys(before)) checkStakeThresholds(state, c, pid, before[pid], beforeS);
  let msg = T.buybackDone(n, c.ticker, q.total, c.sharesOutstanding);
  if (change && change.hostile) msg += T.buybackTakeover(state.players[change.newControllerId as string].name);
  return success(state, 'buyback', msg);
}

function poisonPill(state: GameState, actorId: Id | null, a: A<'poisonPill'>): ActionResult {
  const T = M(state);
  const player = playerOf(state, actorId);
  if (!player) return refuse(state, T.pillHumansOnly, false);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (hasModifier(c, 'poison_pill_cooldown')) return refuse(state, T.pillCooldown);
  const S = c.sharesOutstanding;
  let raider: PlayerState | undefined;
  let raiderShares = 0;
  for (const [pid, h] of Object.entries(c.holdings)) {
    if (pid !== player.id && h >= POISON_PILL_TRIGGER * S && h > raiderShares) {
      raider = getOwn(state.players, pid);
      raiderShares = h;
    }
  }
  if (!raider) return refuse(state, T.pillNoRaider);
  const n = Math.round(POISON_PILL_ISSUE * S);
  const unit = POISON_PILL_DISCOUNT * c.sharePrice;
  const cost = n * unit;
  if (cost > player.cash + EPS) return refuse(state, T.pillCash(cost, n, unit));
  mutating();
  const p = c.sharePrice;
  player.cash -= cost;
  c.cash += cost;
  c.sharesOutstanding += n;
  addHolding(c, player.id, n);
  // Dilution : le cours devient la moyenne pondérée des anciennes actions et des actions émises à prix cassé.
  c.sharePrice = Math.max(PRICE_FLOOR, fin((p * S + cost) / (S + n), p));
  // Lock-up : les actions émises ne peuvent pas être revendues avant la fin du trimestre.
  const locks = (c.turnFlags.lockedShares ??= {});
  locks[player.id] = (getOwn(locks, player.id) ?? 0) + n;
  addScandal(state, c, POISON_PILL_SCANDAL);
  c.sentiment = clamp(c.sentiment * POISON_PILL_SENTIMENT, SENTIMENT_MIN, SENTIMENT_MAX);
  c.modifiers.push({ kind: 'poison_pill_cooldown', turnsLeft: POISON_PILL_COOLDOWN });
  addFlash(state, {
    title: headlineText(state, 'poisonPill', { company: c.name, player: player.name, ceo: player.name }),
    body: body(state, 'poisonPill', c.id),
    tone: 'drama',
    companyIds: [c.id],
    event: { type: 'poisonPill', actorId: player.id },
  });
  checkControl(state, c);
  return success(
    state,
    'poisonPill',
    T.pillDone(n, unit, cost, raider.name, raiderShares / c.sharesOutstanding, holdingOf(c, player.id) / c.sharesOutstanding, c.sharePrice),
  );
}

function crisisComms(state: GameState, actorId: Id | null, a: A<'crisisComms'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (c.turnFlags.crisisDone) return refuse(state, T.crisisOncePerTurn);
  if (CRISIS_COMMS_COST > c.cash + EPS) return refuse(state, T.crisisCash(CRISIS_COMMS_COST));
  mutating();
  c.cash -= CRISIS_COMMS_COST;
  c.turnFlags.crisisDone = true;
  c.turnFlags.specialCharges = Math.max(0, c.turnFlags.specialCharges ?? 0) + CRISIS_COMMS_COST;
  c.scandal = clamp(c.scandal + CRISIS_COMMS_SCANDAL, 0, 100);
  // La com' de crise répare la réputation, elle ne l'embellit pas : rien au-delà de 1 (§7).
  const rep0 = c.reputation;
  if (rep0 < CRISIS_COMMS_REPUTATION_CAP) {
    c.reputation = clamp(Math.min(CRISIS_COMMS_REPUTATION_CAP, rep0 + CRISIS_COMMS_REPUTATION), REPUTATION_MIN, REPUTATION_MAX);
  }
  return success(state, 'crisisComms', T.crisisDone(CRISIS_COMMS_COST, CRISIS_COMMS_SCANDAL, Math.max(0, c.reputation - rep0)));
}

// ---------------------------------------------------------------------------
// Actions discutables
// ---------------------------------------------------------------------------

function shady(state: GameState, actorId: Id | null, a: A<'shady'>): ActionResult {
  const T = M(state);
  const c = controlled(state, actorId, a.companyId);
  if (typeof c === 'string') return refuse(state, c);
  if (typeof a.kind !== 'string' || !SHADY_KINDS.includes(a.kind)) return refuse(state, T.shadyUnknownEvenForYou, false);
  const kind = a.kind;
  if (c.turnFlags.shadyDone.includes(kind)) return refuse(state, T.shadyOncePerTurn);
  const { cost, scandal } = SHADY_COSTS[kind];
  if (cost > c.cash + EPS) return refuse(state, T.shadyCash(cost));

  let details = '';
  let apply: () => void;
  switch (kind) {
    case 'lobbying': {
      const sectorId = a.sectorId !== undefined ? a.sectorId : c.products[0]?.sectorId;
      if (!validSector(sectorId)) return refuse(state, T.lobbyingNeedsSector, false);
      apply = () => c.modifiers.push({ kind: 'lobbying', turnsLeft: LOBBYING_TURNS, sectorId, value: LOBBYING_MULT });
      details = T.lobbyingDetails(getContent(langOf(state)).sectors[sectorId].name);
      break;
    }
    case 'tax_optimisation':
      apply = () => c.modifiers.push({ kind: 'tax_optimisation', turnsLeft: 1 });
      details = T.taxDetails;
      break;
    case 'greenwashing':
      apply = () => c.modifiers.push({ kind: 'greenwashing', turnsLeft: 1 });
      details = T.greenwashingDetails;
      break;
    case 'offshoring':
      apply = () => {
        c.modifiers = c.modifiers.filter((m) => m.kind !== 'offshoring');
        c.modifiers.push({ kind: 'offshoring', turnsLeft: OFFSHORING_TURNS });
        c.reputation = clamp(c.reputation + OFFSHORING_REPUTATION, REPUTATION_MIN, REPUTATION_MAX);
      };
      details = T.offshoringDetails;
      break;
    case 'industrial_espionage': {
      let target: CompanyState | undefined;
      if (a.targetCompanyId !== undefined) {
        target = getOwn(state.companies, a.targetCompanyId);
        if (!target || target.status !== 'active') return refuse(state, T.spyTargetGone, false);
        if (target.id === c.id) return refuse(state, T.spySelf, false);
      }
      const gains: { p: ProductState; gain: number }[] = [];
      let ahead = false;
      for (const p of c.products) {
        let best = 0;
        for (const other of Object.values(state.companies)) {
          if (other.status !== 'active' || other.id === c.id || (target && other.id !== target.id)) continue;
          for (const op of other.products) if (op.sectorId === p.sectorId) best = Math.max(best, op.quality);
        }
        // On ne copie que ce qu'un concurrent fait mieux : aucun gain pour le meilleur produit du secteur.
        if (best > 0 && best > p.quality + EPS) gains.push({ p, gain: ESPIONAGE_GAP_SHARE * (best - p.quality) });
        else if (best > 0) ahead = true;
      }
      if (gains.length === 0) return refuse(state, ahead ? T.spyNothingToSteal : T.spyNobody);
      apply = () => {
        for (const g of gains) g.p.quality = clamp(g.p.quality + g.gain, 0.1, 20);
        for (const profile of c.productProfiles ?? []) profile.quality = c.products.find(p => p.factoryProductId === profile.id)!.quality;
        syncProductProfiles(c);
      };
      details = T.spyDetails(gains.map((g) => ({ product: g.p.name, gain: g.gain })));
      break;
    }
    case 'smear_campaign': {
      const target = getOwn(state.companies, a.targetCompanyId);
      if (!target || target.status !== 'active') return refuse(state, T.smearNeedsTarget, false);
      if (target.id === c.id) return refuse(state, T.smearSelf, false);
      apply = () => {
        target.sentiment = clamp(target.sentiment * SMEAR_SENTIMENT, SENTIMENT_MIN, SENTIMENT_MAX);
        target.sharePrice = Math.max(PRICE_FLOOR, fin(target.sharePrice * SMEAR_SENTIMENT, PRICE_FLOOR));
      };
      details = T.smearDetails(target.ticker);
      break;
    }
    default:
      return refuse(state, T.shadyUnknown, false);
  }
  mutating();
  c.cash -= cost;
  c.turnFlags.specialCharges = Math.max(0, c.turnFlags.specialCharges ?? 0) + cost;
  apply();
  const actualScandal = addScandal(state, c, scandal);
  c.turnFlags.shadyDone.push(kind);
  const ctrl = controllerOf(state, c);
  if (ctrl) ctrl.stats.shadyActions += 1;
  return success(state, kind, T.shadyDone(details, cost, isSpatialMap(state.config) ? actualScandal : scandal));
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

function merge(state: GameState, actorId: Id | null, a: A<'merge'>): ActionResult {
  const T = M(state);
  if (actorId === null) return refuse(state, T.autopilotNoMerge, false);
  const absorber = controlled(state, actorId, a.absorberId);
  if (typeof absorber === 'string') return refuse(state, absorber);
  const target = controlled(state, actorId, a.targetId);
  if (typeof target === 'string') return refuse(state, target);
  if (absorber.id === target.id) return refuse(state, T.mergeSelf, false);
  // The target's unresolved bids fall (§5.8): exclude them before checking the surviving product slots.
  // Commit the removal only once the merger is valid, keeping refusals mutation-free.
  const survivingHexBids = isSpatialMap(state.config) && state.hexBids
    ? state.hexBids.filter((b) => b.result !== undefined || b.companyId !== target.id) : undefined;
  const pendingLaunches = isSpatialMap(state.config) ? (survivingHexBids ?? []).filter((b) => !b.result
    && b.companyId === absorber.id && b.playerId === actorId && b.kind === 'launch').length : 0;
  const absorberCount = usesIndustryNetwork(state) ? productCount(absorber) : absorber.products.length;
  const targetCount = usesIndustryNetwork(state) ? productCount(target) : target.products.length;
  if (absorberCount + pendingLaunches + targetCount > MAX_PRODUCTS_MERGED) {
    return refuse(state, T.mergeTooMany(absorber.name, MAX_PRODUCTS_MERGED, absorberCount + pendingLaunches, targetCount));
  }
  if (absorber.turnFlags.justFounded || target.turnFlags.justFounded) {
    return refuse(state, T.mergeJustFounded);
  }

  mutating();
  if (survivingHexBids) {
    if (survivingHexBids.length > 0) state.hexBids = survivingHexBids;
    else delete state.hexBids;
  }
  const ratio = fin(target.sharePrice / Math.max(absorber.sharePrice, PRICE_FLOOR));
  const beforeS = absorber.sharesOutstanding;
  const beforeHoldings = { ...absorber.holdings };
  const targetFloat = floatShares(target);
  let issued = 0;
  for (const [pid, h] of Object.entries(target.holdings)) {
    const n = Math.floor(h * ratio);
    if (n > 0 && getOwn(state.players, pid)) {
      addHolding(absorber, pid, n);
      issued += n;
    }
  }
  issued += Math.round(targetFloat * ratio);
  absorber.sharesOutstanding += issued;
  absorber.cash += target.cash;
  absorber.debt += target.debt;
  // Compteurs du tour : le bonus déjà pris et les emprunts de la cible restent comptés.
  absorber.turnFlags.bonusTaken += Math.max(0, target.turnFlags.bonusTaken);
  absorber.turnFlags.borrowed = borrowedThisTurn(absorber) + borrowedThisTurn(target);
  const special = Math.max(0, absorber.turnFlags.specialCharges ?? 0) + Math.max(0, target.turnFlags.specialCharges ?? 0);
  if (special > 0) absorber.turnFlags.specialCharges = special;
  const exceptionalLoss = Math.max(0, absorber.turnFlags.exceptionalLoss ?? 0) + Math.max(0, target.turnFlags.exceptionalLoss ?? 0);
  if (exceptionalLoss > 0) absorber.turnFlags.exceptionalLoss = exceptionalLoss;
  // Les lancements de la cible restant à étaler passent dans les comptes de l'absorbante.
  if (target.launchCharges && target.launchCharges.length > 0) {
    absorber.launchCharges = [...(absorber.launchCharges ?? []), ...target.launchCharges];
  }
  for (const [pid, locked] of Object.entries(target.turnFlags.lockedShares ?? {})) {
    const n = Math.floor(locked * ratio);
    if (n > 0) {
      const locks = (absorber.turnFlags.lockedShares ??= {});
      locks[pid] = (getOwn(locks, pid) ?? 0) + n;
    }
  }
  consolidateReports(absorber, target);
  for (const [cid, line] of Object.entries(target.inventory) as [CommodityId, { lots: number; avgCost: number } | undefined][]) {
    if (line) addInventory(absorber, cid, line.lots, line.avgCost);
  }
  delete absorber.terrainId;
  delete target.terrainId;
  if (usesIndustryNetwork(state)) {
    ensureLand(absorber);
    for (const parcel of ownedLand(target)) addLand(absorber, parcel.hexId, parcel.cost);
    absorber.productProfiles = [...(absorber.productProfiles ?? []), ...(target.productProfiles ?? [])];
  }
  absorber.products.push(...target.products);
  // Filiales et contrats de fourniture passent à l'absorbante (§5.5 bis, §7 bis).
  if (target.sites && target.sites.length > 0) absorber.sites = [...(absorber.sites ?? []), ...target.sites];
  delete target.sites;
  // L'impôt et les amendes dus à la prochaine clôture suivent (§5.7).
  if (target.taxDue) absorber.taxDue = fin((absorber.taxDue ?? 0) + target.taxDue);
  if (target.finesDue) absorber.finesDue = fin((absorber.finesDue ?? 0) + target.finesDue);
  delete target.taxDue;
  delete target.finesDue;
  for (const k of state.contracts ?? []) {
    if (k.sellerCompanyId === target.id) k.sellerCompanyId = absorber.id;
    if (k.buyerCompanyId === target.id) k.buyerCompanyId = absorber.id;
  }
  if (state.contracts) state.contracts = state.contracts.filter((k) => k.sellerCompanyId !== k.buyerCompanyId);
  // Une entreprise issue d'une fusion peut porter jusqu'à 6 produits (§7).
  absorber.productSlots = MAX_PRODUCTS_MERGED;
  absorber.profitEma += target.profitEma;
  absorber.revenueEma += target.revenueEma;
  absorber.scandal = Math.max(absorber.scandal, target.scandal);
  // Le passé d'entente suit, comme la jauge : on garde le plus chargé des deux.
  if (target.cartelQuarters) absorber.cartelQuarters = Math.max(absorber.cartelQuarters ?? 0, target.cartelQuarters);

  target.status = 'merged';
  target.holdings = {};
  target.products = [];
  delete target.land;
  delete target.productProfiles;
  target.inventory = {};
  target.modifiers = [];
  delete target.launchCharges;
  target.cash = 0;
  target.debt = 0;
  target.controllerId = null;
  target.turnFlags = { bonusTaken: 0, buybackDone: false, shadyDone: [], borrowed: 0 };

  addFlash(state, {
    title: headlineText(state, 'merger', { acquirer: absorber.name, target: target.name, company: absorber.name }),
    body: body(state, 'merger', absorber.id),
    tone: 'drama',
    companyIds: [absorber.id, target.id],
    event: { type: 'merger', actorId: absorber.controllerId ?? undefined },
  });
  const change = checkControl(state, absorber);
  if (!change) {
    for (const pid of Object.keys(absorber.holdings)) {
      checkStakeThresholds(state, absorber, pid, beforeHoldings[pid] ?? 0, beforeS);
    }
  }
  let msg = T.merged(target.name, absorber.name, issued, absorber.ticker, target.ticker, ratio);
  if (change && change.hostile && change.newControllerId !== actorId) {
    msg += T.mergeTakeover(state.players[change.newControllerId as string].name);
  }
  return success(state, 'merge', msg);
}
