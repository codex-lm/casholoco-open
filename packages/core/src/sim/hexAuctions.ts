/** Sealed cell auctions (§5.8 quater): secret-seed hashes, no RNG consumption. */
import { occupiedHexes, route } from './hexes';
import { isSpatialMap, ALL_CELLS, boardBuildable, capitalCellId, hexById, hexDistance } from '../content/hexes';
import { getContent, hexPlaceLabel, hexPlaceName, SECTORS } from '../content';
import { DEPOSITS, JUNCTIONS } from '../content/map';
import { ZONE_IDS, type Article, type CompanyState, type GameState, type HexAuctionResult, type HexBid, type HexLaunchProject, type ProductState } from '../types';
import { maxProductsOf } from './finance';
import { langOf, tr } from './i18n';
import { makeArticle } from './journal';
import { factoryMoveCost } from './transport';
import { fillTemplate, fin, getOwn, mixedHash } from './util';
import { addLand, emptyLandCount, factoryOnLand, ownedLand, productCount, usesIndustryNetwork, VACANT_LAND_UPKEEP_RATIO } from './industry';

export const HEX_RESERVE_CITY = 400;
export const HEX_RESERVE_NEAR = 250;
export const HEX_RESERVE_REMOTE = 150;

const CITY_CELLS = ALL_CELLS.filter((h) => h.city);
const RESERVES = new Map(ALL_CELLS.map((h) => {
  // Geometric adjacency only: the island ferry never counts as touching the capital.
  const distance = Math.min(...CITY_CELLS.map((city) => hexDistance(h, city)));
  return [h.id, distance <= 1 ? HEX_RESERVE_CITY : distance === 2 ? HEX_RESERVE_NEAR : HEX_RESERVE_REMOTE] as const;
}));

/** Public land reserve (k); unknown/non-buildable cells have no reserve. */
export function hexReservePrice(hexId: string): number {
  const cell = hexById(hexId);
  return cell && !cell.deposit ? RESERVES.get(hexId)! : 0;
}

export function bareLandReserve(state: GameState, controllerId: string | null, hexId: string): number {
  return hexReservePrice(hexId) * 2 ** emptyLandCount(state, controllerId);
}
export function vacantLandUpkeep(c: CompanyState): number {
  return ownedLand(c).filter(parcel => !factoryOnLand(c, parcel.hexId))
    .reduce((sum, parcel) => sum + VACANT_LAND_UPKEEP_RATIO * Math.max(parcel.cost, hexReservePrice(parcel.hexId)), 0);
}

const ROAD_NODES = [...ZONE_IDS, ...Object.keys(DEPOSITS), ...Object.keys(JUNCTIONS)];
const CELL_ROUTES = new Map(ALL_CELLS.map((from) => [from.id, new Map(ALL_CELLS.filter(to => to.id.startsWith('S-') === from.id.startsWith('S-')).map((to) => [to.id,
  from.id === to.id ? 0 : Math.min(...ROAD_NODES.map((node) => route(from.id, node) + route(to.id, node))),
]))]));

/** Weighted network route between cells, including each access track or the island ferry. */
export function routeBetweenHexes(from: string, to: string): number {
  return CELL_ROUTES.get(from)?.get(to) ?? Infinity;
}

/** Cost reserved alongside the bid; incubator departures do not pay a factory move. */
export function hexBidCost(state: GameState, c: CompanyState, bid: HexBid): number {
  if (bid.kind === 'land') return 0;
  if (bid.kind === 'factory') {
    const source = c.products.find(p => p.id === bid.productId);
    return source ? SECTORS[source.sectorId].launchCost : Infinity;
  }
  if (bid.kind === 'startup') return 0;
  if (bid.kind === 'launch') return bid.project ? getOwn(SECTORS, bid.project.sectorId)?.launchCost ?? Infinity : Infinity;
  const product = c.products.find((p) => p.id === bid.productId);
  return product ? factoryMoveCost(state, product) : Infinity;
}

/** Full worst-case commitments of the current controller, for close planning and advice. */
export function pendingHexCommitments(state: GameState, c: CompanyState): number {
  if (!isSpatialMap(state.config)) return 0;
  let total = 0;
  for (const bid of state.hexBids ?? []) {
    if (bid.result || bid.companyId !== c.id || bid.playerId !== c.controllerId) continue;
    const cost = hexBidCost(state, c, bid);
    if (Number.isFinite(cost)) total += Math.max(0, fin(bid.amount)) + Math.max(0, cost);
  }
  return total;
}

export type RealizeHexLaunch = (state: GameState, company: CompanyState, project: HexLaunchProject, hexId: string) => ProductState;
export type RealizeHexFactory = (state: GameState, company: CompanyState, source: ProductState, hexId: string) => ProductState;

/** Order is independent of submitted amounts, action order, text seed, and RNG state. */
function bidKey(state: GameState, bid: HexBid, salt: string): number {
  return mixedHash(`${state.config.seed}|${state.turn}|${bid.companyId}|${salt === 'fallback' ? '' : bid.hexId}|${salt}`);
}

function eligible(state: GameState, bid: HexBid, c: CompanyState | undefined): c is CompanyState {
  if (!c || c.status !== 'active' || c.controllerId !== bid.playerId) return false;
  if (bid.kind === 'land') return usesIndustryNetwork(state);
  if (bid.kind === 'launch') return !!bid.project && !!getOwn(SECTORS, bid.project.sectorId)
    && (usesIndustryNetwork(state) ? productCount(c) : c.products.length) < maxProductsOf(c);
  const product = c.products.find((p) => p.id === bid.productId);
  return !!product && (bid.kind !== 'startup' || product.incubator === true);
}

/**
 * Settle after the subsidiaries and sales. The free-cell snapshot lasts through both passes: a cell vacated by a
 * winning move or a bankruptcy at this close cannot enter any auction or fallback until next quarter.
 * Invalid bids never block a fallback.
 */
export function awardHexes(state: GameState, realizeLaunch?: RealizeHexLaunch, freedByBankruptcy?: ReadonlySet<string>, realizeFactory?: RealizeHexFactory): HexAuctionResult[] {
  if (!isSpatialMap(state.config)) return [];
  const BUILDABLE = boardBuildable(state.config);
  const pending = (state.hexBids ?? []).filter((bid) => bid.result === undefined);
  const settled: HexBid[] = [];
  const awards: HexAuctionResult[] = [];
  const occupied = occupiedHexes(state);
  const freeAtStart = new Set(BUILDABLE.filter((id) => !Object.hasOwn(occupied, id) && !freedByBankruptcy?.has(id)));
  const taken = new Set<string>();
  const receivedValid = new Set<string>();
  const fallbacks: HexBid[] = [];

  const obtain = (bid: HexBid, c: CompanyState, hexId: string, price: number, bidders: number, fallback: boolean): boolean => {
    if (bid.kind === 'launch' && (!bid.project || !realizeLaunch)) return false;
    const product = bid.kind === 'launch' ? undefined : c.products.find((p) => p.id === bid.productId);
    if (bid.kind !== 'launch' && bid.kind !== 'land' && !product) return false;
    if (bid.kind === 'factory' && !realizeFactory) return false;
    const cost = hexBidCost(state, c, bid);
    if (!(c.cash >= price + cost)) return false;
    c.cash -= price;
    if (usesIndustryNetwork(state)) addLand(c, hexId, price);
    if (bid.kind === 'land') {
      // Independent ownership: no factory, production or product is created.
    } else if (bid.kind === 'factory') {
      realizeFactory!(state, c, product!, hexId).landCost = price;
    } else if (bid.kind === 'launch') {
      const launched = realizeLaunch!(state, c, bid.project!, hexId);
      launched.landCost = price;
    } else {
      c.cash -= cost;
      if (cost > 0) c.turnFlags.specialCharges = Math.max(0, c.turnFlags.specialCharges ?? 0) + cost;
      product!.pendingHexId = hexId;
      product!.landCost = price;
    }
    taken.add(hexId);
    bid.result = { outcome: fallback ? 'fallback' : 'won', hexId, price, bidders };
    awards.push({ hexId, companyId: c.id, playerId: bid.playerId, kind: bid.kind, price, reserve: bid.kind === 'land' ? bid.reserve ?? hexReservePrice(hexId) : hexReservePrice(hexId), bidders: fallback ? 0 : bidders, fallback });
    return true;
  };

  for (const hexId of BUILDABLE) {
    const bids = pending.filter((bid) => bid.hexId === hexId);
    if (!bids.length) continue;
    const reserve = hexReservePrice(hexId);
    const valid: { bid: HexBid; company: CompanyState; engaged: number }[] = [];
    const invalid: HexBid[] = [];
    for (const original of bids) {
      const bid = { ...original };
      const company = getOwn(state.companies, bid.companyId);
      const cost = company ? hexBidCost(state, company, bid) : Infinity;
      const engaged = company ? Math.min(Math.max(0, fin(bid.amount)), Math.max(0, company.cash - cost)) : 0;
      const minimum = bid.kind === 'land' ? bid.reserve ?? bareLandReserve(state, bid.playerId, hexId) : reserve;
      if (eligible(state, bid, company) && freeAtStart.has(hexId) && engaged >= minimum
          && (bid.kind !== 'launch' || !!realizeLaunch) && (bid.kind !== 'factory' || !!realizeFactory)) valid.push({ bid, company, engaged });
      else invalid.push(bid);
    }
    if (valid.length) receivedValid.add(hexId);
    valid.sort((a, b) => b.engaged - a.engaged || bidKey(state, a.bid, 'tie') - bidKey(state, b.bid, 'tie') || a.bid.companyId.localeCompare(b.bid.companyId));
    const bidders = valid.length;
    const winner = valid[0];
    const minimum = winner?.bid.kind === 'land' ? winner.bid.reserve ?? reserve : reserve;
    const price = winner ? Math.min(winner.engaged, Math.max(minimum, valid[1]?.engaged ?? minimum)) : 0;
    if (winner) {
      if (!obtain(winner.bid, winner.company, hexId, price, bidders, false)) winner.bid.result = { outcome: 'failed', price: 0, bidders };
      else if (invalid.length) awards[awards.length - 1].failedContenders = true;
      settled.push(winner.bid);
    }
    for (const { bid } of valid.slice(1)) {
      bid.result = { outcome: 'lost', price: 0, bidders };
      if (bid.kind === 'launch' || bid.kind === 'startup') {
        if (bid.fallback === 'nearest') fallbacks.push(bid);
        else bid.result.outcome = 'abandoned';
      }
      settled.push(bid);
    }
    for (const bid of invalid) settled.push({ ...bid, result: { outcome: 'failed', price: 0, bidders } });
  }

  fallbacks.sort((a, b) => bidKey(state, a, 'fallback') - bidKey(state, b, 'fallback')
    || a.companyId.localeCompare(b.companyId) || BUILDABLE.indexOf(a.hexId) - BUILDABLE.indexOf(b.hexId)
    || (a.project?.id ?? a.productId ?? '').localeCompare(b.project?.id ?? b.productId ?? ''));
  for (const bid of fallbacks) {
    const c = getOwn(state.companies, bid.companyId);
    if (!eligible(state, bid, c)) { bid.result = { outcome: 'failed', price: 0, bidders: bid.result!.bidders }; continue; }
    let best: string | undefined, distance = Infinity;
    for (const id of BUILDABLE) {
      if (!freeAtStart.has(id) || taken.has(id) || receivedValid.has(id)) continue;
      const d = routeBetweenHexes(bid.hexId, id);
      if (d < distance) { best = id; distance = d; }
    }
    if (!best || !obtain(bid, c, best, hexReservePrice(best), bid.result!.bidders, true)) {
      bid.result = { outcome: 'abandoned', price: 0, bidders: bid.result!.bidders };
    }
  }

  // Fin d'incubation (§5.8 quater) : après deux trimestres sans case, la start-up prend d'office la case libre
  // la plus proche de la capitale par la route, à sa mise à prix. Ordre par empreinte secrète, jamais le RNG.
  // Pas de départ forcé à la dernière clôture (les enchères de cases y sont closes : l'usine n'y vendrait jamais),
  // ni sans contrôleur (personne à facturer de la décision) : la start-up reste alors en incubation.
  if (state.turn < state.config.totalTurns) {
    const leaving: { c: CompanyState; product: ProductState; key: number }[] = [];
    for (const c of Object.values(state.companies)) {
      if (c.status !== 'active' || !c.controllerId) continue;
      for (const product of c.products) {
        if (product.incubator !== true || product.pendingHexId !== undefined) continue;
        if (state.turn < product.launchedTurn + 1) continue;
        leaving.push({ c, product, key: mixedHash(`${state.config.seed}|${state.turn}|${c.id}|${product.id}|incubator`) });
      }
    }
    leaving.sort((a, b) => a.key - b.key || a.c.id.localeCompare(b.c.id));
    for (const { c, product } of leaving) {
      let best: string | undefined, distance = Infinity;
      for (const id of BUILDABLE) {
        if (!freeAtStart.has(id) || taken.has(id) || receivedValid.has(id)) continue;
        const d = routeBetweenHexes(capitalCellId(state.config), id);
        if (d < distance) { best = id; distance = d; }
      }
      if (!best) continue;
      const reserve = hexReservePrice(best);
      const bid: HexBid = { kind: 'startup', companyId: c.id, playerId: c.controllerId!,
        productId: product.id, hexId: best, amount: reserve, turn: state.turn, fallback: 'nearest' };
      if (obtain(bid, c, best, reserve, 0, true)) {
        bid.result!.note = tr(state).act.incubatorOver(product.name, hexPlaceLabel(best, langOf(state), state.siteSlots), reserve);
      } else {
        bid.amount = 0;
        bid.result = { outcome: 'abandoned', price: 0, bidders: 0, note: tr(state).act.incubatorExtended(product.name, hexPlaceLabel(best, langOf(state), state.siteSlots), reserve) };
      }
      settled.push(bid);
    }
  }

  // Invalid/unknown targets from a hand-edited state have no effect on cells or cash.
  for (const bid of pending) if (!hexById(bid.hexId) || !BUILDABLE.includes(bid.hexId)) {
    settled.push({ ...bid, result: { outcome: 'failed', price: 0, bidders: 0 } });
  }
  if (settled.length) state.hexBids = settled;
  else delete state.hexBids;
  state.hexAuctionResults = awards;
  return awards;
}

/** Pick the six imported auction stories from the public adjudication situation. */
export function hexAuctionArticle(state: GameState, award: HexAuctionResult): Article | undefined {
  const company = getOwn(state.companies, award.companyId);
  if (!company) return undefined;
  const content = getContent(langOf(state));
  const articleId = award.fallback ? 5 : award.failedContenders ? 6 : award.bidders > 1
    ? (award.price === award.reserve ? 4 : 1) : award.price === HEX_RESERVE_REMOTE ? 3 : 2;
  const text = content.terrains.auctions.find((a) => a.id === `auction-hex-${articleId}`);
  if (!text) return undefined;
  const lang = langOf(state);
  const place = hexPlaceName(award.hexId, lang, state.siteSlots);
  const vars = { company: company.name, hex: place, price: tr(state).money(award.price), bidders: String(award.bidders) };
  const tail = `${award.fallback ? tr(state).act.hexFallbackBody(place) : ''}${award.kind === 'startup' ? tr(state).act.hexStartupBody : ''}`;
  return makeArticle(state, { title: fillTemplate(text.headline, vars, content.lang), body: fillTemplate(text.body, vars, content.lang) + tail,
    tone: 'neutral', kind: 'results', companyIds: [company.id] });
}
