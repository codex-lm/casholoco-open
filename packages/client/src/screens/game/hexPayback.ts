import { SECTORS, launchPaybackQuarters, type PlayerView, type ProductView, type SectorId } from '@muchomoney/core';
import { hexEstimate, hexMarginValue, type HexReference } from './city/hexModel';
import { ownProduct } from './city/privacy';

export type HexBidKind = 'move' | 'startup' | 'launch';
export interface HexPayback { atReserve: number; atBid: number | null }
export type HexVerdictState = 'ok' | 'risky' | 'late' | 'none';
export interface HexVerdict { state: HexVerdictState; atReserve: number | null; atBid: number | null }

/** Payback in quarters with the land bought at `price`; null without a positive estimated gain. */
export function hexPaybackAtPrice(kind: HexBidKind, price: number, gain: number | null, cost: number): number | null {
  if (gain === null || !(gain > 0)) return null;
  if (kind === 'move') return Math.ceil((cost + price) / gain);
  if (kind === 'startup') return Math.ceil(price / gain);
  return launchPaybackQuarters(cost + price, gain);
}

/** The payback range of a bid: at the reserve, and at the full bid when it beats the reserve. */
export function hexBidPayback(kind: HexBidKind, reserve: number, bid: number, gain: number | null, cost: number): HexPayback | null {
  const atReserve = hexPaybackAtPrice(kind, reserve, gain, cost);
  if (atReserve === null) return null;
  const atBid = Number.isFinite(bid) && bid > reserve ? hexPaybackAtPrice(kind, bid, gain, cost) : null;
  return { atReserve, atBid };
}

/** ok: pays back in time even at the full bid; risky: only at the reserve; late: not even at the reserve. */
export function hexBidVerdict(payback: HexPayback | null, quartersLeft: number): HexVerdict {
  if (!payback) return { state: 'none', atReserve: null, atBid: null };
  const full = payback.atBid ?? payback.atReserve;
  const state: HexVerdictState = payback.atReserve > quartersLeft ? 'late' : full > quartersLeft ? 'risky' : 'ok';
  return { state, atReserve: payback.atReserve, atBid: payback.atBid };
}

/** Relocation fees paid with a move bid: none for a start-up leaving the incubator. */
export function hexMoveCost(product: ProductView): number {
  return product.incubator ? 0 : ownProduct(product)?.hexes?.moveCost ?? 0;
}

/** Launch fees of a new plant of this sector, as the server sends them. */
export function hexLaunchCost(view: PlayerView, sectorId: SectorId): number {
  return view.sectors.find((sector) => sector.id === sectorId)?.launchCost ?? SECTORS[sectorId].launchCost;
}

export interface HexCellBid {
  /** Quarterly figure the bid is judged on: the margin gain for a move, the margin of the new plant otherwise. */
  gain: number | null;
  reserve: number;
  quartersLeft: number;
  payback: HexPayback | null;
  verdict: HexVerdict;
}

/**
 * Everything a bid on a cell is judged on, in one place: the cell sheet's headline (at the reserve) and the bid
 * form's summary (at the typed bid) read the same gain, reserve, payback and verdict, so they never disagree.
 */
export function hexCellBid(view: PlayerView, hexId: string, reference: HexReference, kind: HexBidKind, cost: number, bid?: number): HexCellBid {
  const gain = kind === 'move' ? hexMarginValue(view, reference, hexId, true) : hexEstimate(view, reference, hexId)?.margin ?? null;
  const reserve = view.hexes?.reserve[hexId] ?? 0;
  // Only a launch waits a quarter. Start-ups already sell from the incubator.
  const quartersLeft = Math.max(0, view.config.totalTurns - view.turn + (kind === 'launch' ? 1 : 0));
  const payback = hexBidPayback(kind, reserve, bid ?? reserve, gain, cost);
  return { gain, reserve, quartersLeft, payback, verdict: hexBidVerdict(payback, quartersLeft) };
}
