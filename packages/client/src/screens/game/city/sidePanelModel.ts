/**
 * La colonne de gauche du plateau (dès 1200 px), en modèle pur : les produits de l'entreprise aux manettes, chacun
 * avec la ligne de décision de sa carte, puis les emplacements libres, les mises de lancement, filiales et mises sur
 * gisements, les dernières adjudications et la piste de cette entreprise.
 *
 * La ligne de décision, le premier cas qui s'applique : la destination déjà attribuée, la mise en attente (et la case
 * qui ferait mieux, s'il y en a une), la meilleure case libre remboursable à temps (`hexCellBid` à la mise à prix, la
 * même fonction que le titre de la fiche de cette case : les deux affichent le même gain et le même délai), trop tard
 * si aucune ne l'est, rien de mieux sinon. Une start-up à l'incubateur ne peut pas y rester : sa carte dit où
 * s'installer, ce qui arrive si sa mise échoue et quand l'État la case d'office (même règle que la clôture,
 * `hexAuctions.ts`). Les cases portant une autre de mes mises sont écartées (le formulaire les refuserait).
 *
 * Rien que la vue redigée, lue par ./privacy ; aucune donnée d'un rival.
 */
import {
  hexReservePrice, routeBetweenHexes, boardCells, boardBuildable, capitalCellId, type CompanyView,
  type HexAuctionResult, type HexBid, type PlayerView, type ProductView, type SectorId, type SiteBid,
  type SiteSlotView,
} from '@muchomoney/core';
import { MAX_ACTIVE_PRODUCTS, maxProductsOf, productCount } from '../../../rules';
import { productFlow, type FlowStatus, type ProductFlow } from '../factories/model';
import { hexCellBid, hexLaunchCost, hexMoveCost } from '../hexPayback';
import { pendingDecisions, type PendingCompanyDecisions } from '../pendingDecisions';
import { moveLeavesTerrain } from '../startingTerrain';
import { bestPricedHex, hexEstimate, hexMarginValue, hexReferenceOptions, type HexReference } from './hexModel';
import { openingSign, type OpeningSign } from './model';
import { isOwn, liveHexBids, ownCompany, ownProduct } from './privacy';
import { currentProductFreight, type FreightBreakdown } from './freight';

/** A free cell and what moving there would add to the quarterly margin. */
export interface CellGain { hexId: string; gain: number }

export type SideDecision =
  /** A cell already won at a close: the plant moves there. */
  | { kind: 'destination'; hexId: string }
  /** A live move or start-up bid; `beaten`: another free cell that would do better than the bid's cell. */
  | { kind: 'bid'; bid: HexBid; fees: number; beaten: CellGain | null }
  /** The best free cell that pays back in time at its reserve; `lateBest`: a bigger gain that would not. */
  | { kind: 'better'; hexId: string; gain: number; payback: number; reserve: number; perks: boolean; lateBest: CellGain | null }
  /** Some free cell beats the plant, none pays back before the end. */
  | { kind: 'late'; hexId: string; gain: number }
  | { kind: 'none' }
  /** Start-up at the incubator: the best free cell, compared with selling from the incubator. */
  | { kind: 'settle'; hexId: string; gain: number; reserve: number };

/** What happens to a start-up that wins no cell: the State boxes it in, or its bid's fallback. */
export type IncubatorNote =
  /** Forced placement: at this close (`due` 'now', with the probable cell) or at a later one. */
  | { kind: 'deadline'; due: 'now' | number; forced: { hexId: string; reserve: number; margin: number | null } | null }
  | { kind: 'fallbackNearest'; hexId: string }
  | { kind: 'fallbackAbandon'; due: number };

export interface SideRow {
  company: CompanyView;
  product: ProductView;
  flow: ProductFlow;
  /** Absolute freight, with the same sources as the next close. */
  freight: FreightBreakdown;
  status: FlowStatus;
  /** Estimated quarterly margin (null under construction or without an estimate, e.g. after the game). */
  margin: number | null;
  /** The plant's cell; null at the incubator. */
  hexId: string | null;
  incubator: boolean;
  building: boolean;
  bid: HexBid | null;
  destination: string | null;
  /** Null under construction, and when nothing can be decided any more (last quarter, game over) unless a cell was won. */
  decision: SideDecision | null;
  incubatorNote: IncubatorNote | null;
  /** The last close's own settled bid for this start-up (won, lost, forced placement…). */
  lastResult: HexBid | null;
}

export interface SideSite { key: string; hexId: string; slot?: SiteSlotView; bid?: SiteBid }

export interface SidePanelModel {
  playing: boolean;
  rows: SideRow[];
  freeSlots: number;
  canMerge: boolean;
  /** Where « Emplacements libres · choisir où lancer » goes: the hot tip's sector, else the first launch reference. */
  launchTarget: { sectorId: SectorId; hexId: string | null } | null;
  /** « Meilleure marge pour <secteur> » with a launch reference, unless the hot tip names the same sector and cell. */
  bestLaunch: { sectorId: SectorId; hexId: string } | null;
  launchBids: { bid: HexBid; fees: number }[];
  subsidiaries: SideSite[];
  siteBids: SideSite[];
  awards: HexAuctionResult[];
  opening: OpeningSign;
  /** The acting company's pending commitments (bids and fees, as in « Décisions en attente »); null without any. */
  commitments: PendingCompanyDecisions | null;
}

const depositHexId = (view: PlayerView, slotId: string): string | null => boardCells(view.config).find((hex) => hex.deposit === slotId)?.id ?? null;

/** Free cells with a positive gain for this product, highest first (ties keep the board order, like `bestMoveHex`). */
export function rankedMoves(view: PlayerView, reference: HexReference, skip: ReadonlySet<string> = new Set()): CellGain[] {
  return (view.hexes?.free ?? []).flatMap((hexId) => {
    if (skip.has(hexId)) return [];
    const gain = hexMarginValue(view, reference, hexId, true);
    return gain !== null && gain > 0 ? [{ hexId, gain }] : [];
  }).sort((a, b) => b.gain - a.gain);
}

/** The first ranked cell whose bid, priced like the cell sheet's headline, pays back in time at its reserve. */
function firstInTime(view: PlayerView, reference: HexReference, cost: number, ranked: readonly CellGain[]) {
  for (const cell of ranked) {
    const bid = hexCellBid(view, cell.hexId, reference, 'move', cost);
    if (bid.verdict.state === 'ok' && bid.gain !== null && bid.verdict.atReserve !== null) return { cell, bid, payback: bid.verdict.atReserve };
  }
  return null;
}

/** The free cell nearest to the capital by road, as the close boxes a start-up in (cells bid on by me excluded). */
export function forcedIncubatorHex(view: PlayerView, skip: ReadonlySet<string>): string | null {
  const free = new Set(view.hexes?.free ?? []);
  let best: string | null = null, distance = Infinity;
  for (const id of boardBuildable(view.config)) {
    if (!free.has(id) || skip.has(id)) continue;
    const d = routeBetweenHexes(capitalCellId(view.config), id);
    if (d < distance) { best = id; distance = d; }
  }
  return best;
}

function decide(view: PlayerView, row: Omit<SideRow, 'decision' | 'incubatorNote' | 'lastResult'>, otherBids: ReadonlySet<string>, playing: boolean): SideDecision | null {
  if (row.building) return null;
  if (view.config.industryRules === 'network' && !row.incubator) return null;
  // A cell won at the penultimate close is applied at the last one: the move is still news in the last quarter.
  if (row.destination) return { kind: 'destination', hexId: row.destination };
  if (!playing) return null;
  const { product } = row;
  const reference: HexReference = { kind: 'product', productId: product.id };
  const cost = hexMoveCost(product);
  if (row.bid) {
    const bidGain = hexMarginValue(view, reference, row.bid.hexId, true);
    const ranked = rankedMoves(view, reference, new Set([...otherBids, row.bid.hexId]));
    const rival = row.incubator ? ranked[0] ?? null : firstInTime(view, reference, cost, ranked)?.cell ?? null;
    // Rounded figures: a cell 0.4 k better is not worth a line.
    const beaten = rival && bidGain !== null && rival.gain - bidGain >= 0.5 ? { hexId: rival.hexId, gain: rival.gain - bidGain } : null;
    return { kind: 'bid', bid: row.bid, fees: row.bid.kind === 'startup' ? 0 : cost, beaten };
  }
  const ranked = rankedMoves(view, reference, otherBids);
  if (row.incubator) {
    // Staying is not an option: the best cell, whatever its payback (the forced placement costs a reserve too).
    const best = ranked[0];
    if (!best) return null;
    const bid = hexCellBid(view, best.hexId, reference, 'move', cost);
    return { kind: 'settle', hexId: best.hexId, gain: bid.gain ?? best.gain, reserve: bid.reserve };
  }
  if (!ranked.length) return { kind: 'none' };
  const inTime = firstInTime(view, reference, cost, ranked);
  if (!inTime) return { kind: 'late', hexId: ranked[0].hexId, gain: ranked[0].gain };
  const top = ranked[0];
  return {
    kind: 'better', hexId: inTime.cell.hexId, gain: inTime.bid.gain!, payback: inTime.payback, reserve: inTime.bid.reserve,
    perks: Boolean(moveLeavesTerrain(view, row.company, product)),
    lateBest: top.hexId !== inTime.cell.hexId ? top : null,
  };
}

function incubatorNote(view: PlayerView, row: Omit<SideRow, 'decision' | 'incubatorNote' | 'lastResult'>, otherBids: ReadonlySet<string>): IncubatorNote | null {
  const { product } = row;
  const total = view.config.totalTurns;
  // The engine never boxes a start-up in at the last close (the cell auctions are over), nor once a cell is won.
  if (!row.incubator || row.destination || view.phase !== 'playing' || view.turn >= total) return null;
  const due = product.launchedTurn + 1;
  const now = view.turn >= due;
  if (row.bid?.fallback === 'nearest') return { kind: 'fallbackNearest', hexId: row.bid.hexId };
  if (row.bid && !now) return due < total ? { kind: 'fallbackAbandon', due } : null;
  if (!now) return due < total ? { kind: 'deadline', due, forced: null } : null;
  // At this close: the probable cell (rivals' sealed bids may still take it), its reserve and the margin there.
  const forcedHex = forcedIncubatorHex(view, new Set([...otherBids, ...(row.bid ? [row.bid.hexId] : [])]));
  const forced = forcedHex ? {
    hexId: forcedHex, reserve: view.hexes?.reserve[forcedHex] ?? hexReservePrice(forcedHex),
    margin: hexEstimate(view, { kind: 'product', productId: product.id }, forcedHex)?.margin ?? null,
  } : null;
  return { kind: 'deadline', due: 'now', forced };
}

export function sidePanelModel(view: PlayerView, acting: CompanyView | null, reference: HexReference | null): SidePanelModel {
  const playing = view.phase === 'playing' && view.turn < view.config.totalTurns;
  const own = view.companies.filter(isOwn);
  const ownIds = new Set(own.map((c) => c.id));
  const controlledIds = new Set(own.filter((c) => c.controllerId === view.you).map((c) => c.id));
  const live = liveHexBids(view);
  const settled = (view.self?.hexBids ?? []).filter((bid) => bid.result && ownIds.has(bid.companyId));
  const rows: SideRow[] = !acting ? [] : acting.products.filter((p) => ownProduct(p)).map((product) => {
    const mine = ownProduct(product)!;
    const flow = productFlow(product);
    const bid = live.find((b) => b.companyId === acting.id && b.productId === product.id) ?? null;
    const base = {
      company: acting, product, flow, status: flow.status, freight: currentProductFreight(view, acting, product),
      margin: product.comingSoon ? null : mine.estimate?.margin ?? null,
      hexId: product.incubator ? null : product.hexId ?? null,
      incubator: product.incubator === true, building: product.comingSoon === true,
      bid, destination: mine.pendingHexId ?? null,
    };
    // My other live bids (other products, launches): their cells are not offered again.
    const otherBids = new Set(live.filter((b) => b !== bid).map((b) => b.hexId));
    return {
      ...base,
      decision: decide(view, base, otherBids, playing),
      incubatorNote: incubatorNote(view, base, otherBids),
      lastResult: base.incubator ? settled.filter((b) => b.productId === product.id).at(-1) ?? null : null,
    };
  });
  const max = acting ? maxProductsOf(acting) : 0;
  const used = acting ? productCount(acting) + (ownCompany(acting)?.launchProjects?.length ?? 0) : 0;
  const opening = acting ? openingSign(view, acting) : openingSign(view);
  const launchSector = opening.kind === 'launch' ? opening.sectorId
    : hexReferenceOptions(view).flatMap((o) => o.ref.kind === 'launch' ? [o.ref.sectorId] : [])[0] ?? null;
  const bestLaunchHex = reference?.kind === 'launch' ? bestPricedHex(view, reference) : null;
  const sameAsTip = opening.kind === 'launch' && reference?.kind === 'launch' && opening.sectorId === reference.sectorId && opening.hexId === bestLaunchHex;
  const commitments = acting ? pendingDecisions(view).groups.find((group) => group.company.id === acting.id && group.total > 0) ?? null : null;
  return {
    playing,
    rows,
    freeSlots: Math.max(0, max - used),
    canMerge: acting ? max <= MAX_ACTIVE_PRODUCTS : false,
    launchTarget: launchSector ? { sectorId: launchSector, hexId: bestPricedHex(view, { kind: 'launch', sectorId: launchSector }) } : null,
    bestLaunch: bestLaunchHex && reference?.kind === 'launch' && !sameAsTip ? { sectorId: reference.sectorId, hexId: bestLaunchHex } : null,
    launchBids: !acting ? [] : live.filter((b) => b.kind === 'launch' && b.companyId === acting.id)
      .map((bid) => ({ bid, fees: bid.project ? hexLaunchCost(view, bid.project.sectorId) : 0 })),
    subsidiaries: view.siteSlots.flatMap((slot) => {
      const hexId = slot.companyId && ownIds.has(slot.companyId) ? depositHexId(view, slot.id) : null;
      return hexId ? [{ key: slot.id, hexId, slot }] : [];
    }),
    siteBids: (view.self?.siteBids ?? []).flatMap((bid) => {
      const hexId = !bid.result && controlledIds.has(bid.companyId) ? depositHexId(view, bid.slotId) : null;
      return hexId ? [{ key: `site:${bid.companyId}:${bid.slotId}`, hexId, bid }] : [];
    }),
    awards: view.hexes?.results ?? [],
    opening,
    commitments,
  };
}
