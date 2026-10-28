import { ALL_CELLS, capitalCellId, cellBoardConfig, isSpatialMap, hexDistance } from '../content/hexes';
import type { BotPersonality, CompanyState, GameState, ProductState } from '../types';
import { SECTORS } from '../content';
import { hexValues } from './advice';
import { effectiveTaxRate } from './finance';
import { HQ_COST } from './constants';
import { activeSeatTerrain, companySeatTaxRate } from './terrains';

import { hexReservePrice } from './hexAuctions';

/** Gain minimal sur le coût des ventes à la capitale avant de choisir une autre implantation. */
export const BOT_ZONE_MIN_GAIN = 0.01;

const BOARD_ORDER = new Map(ALL_CELLS.filter(h => !h.deposit).map(h => h.id).map((id, i) => [id, i]));

/** Plus proche case disponible de la capitale ; la case du produit reste disponible pour lui. */
export function capitalCandidate(candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  for (const id of candidates) {
    if (!best || hexDistance(id, capitalCellId(cellBoardConfig(id))) < hexDistance(best, capitalCellId(cellBoardConfig(best)))
      || (hexDistance(id, capitalCellId(cellBoardConfig(id))) === hexDistance(best, capitalCellId(cellBoardConfig(best))) && BOARD_ORDER.get(id)! < BOARD_ORDER.get(best)!)) best = id;
  }
  return best;
}

/** Gain mesuré depuis la case actuelle ; la capitale sert de repli aux nouveaux lancements. */
export function bestHexCandidate(candidates: readonly string[], value: Readonly<Record<string, number>>, capital: string, capitalCogs: number, here = capital): string {
  let best = here;
  for (const id of candidates) if (value[id] > value[best] + 1e-9) best = id;
  if (value[best] - value[here] < BOT_ZONE_MIN_GAIN * capitalCogs) best = here;
  return best;
}

/** Économie récurrente du siège, sur la même marge que les positions, sans charges exceptionnelles ni stock initial. */
export function retainedSeatValue(state: GameState, c: CompanyState, p?: ProductState, hereMargin?: number): number {
  const terrain = activeSeatTerrain(state, c);
  if (!terrain || (p && terrain.id !== p.terrainId)) return 0;
  const ordinaryRate = effectiveTaxRate(state);
  const seatRate = companySeatTaxRate(state, c, true);
  const saving = ordinaryRate - seatRate;
  if (!(saving > 0)) return 0;
  let pretax = -HQ_COST;
  for (const product of c.products) {
    if (!product.hexId) continue;
    const margin = product.id === p?.id && hereMargin !== undefined
      ? hereMargin : hexValues(state, c, product, c.controllerId, [product.hexId], product.hexId).value[product.hexId];
    // hexValues déduit déjà l'écart entre coût fixe effectif et coût de base.
    pretax += margin - SECTORS[product.sectorId].fixedCost - product.marketing - product.rnd;
  }
  return Math.max(0, pretax) * saving;
}

/** Enchère prudente près de la réserve ; les offensifs engagent une part de la valeur sur les tours restants. */
export function botHexBid(pers: BotPersonality, reserve: number, value: number, budget: number): number | undefined {
  if (budget < reserve || value < reserve) return undefined;
  const share = 0.015 + 0.12 * pers.aggressiveness;
  const amount = Math.min(budget, reserve + Math.max(0, value - reserve) * share);
  return Math.max(reserve, Math.floor(amount));
}

/** Valeur nette de la position : estimation vivante sur l'horizon restant, moins terrain et frais d'installation. */
export function bestAuctionHex(candidates: readonly string[], value: Readonly<Record<string, number>>, remaining: number,
  budget: number, cost = 0, baseline = 0): string | undefined {
  let best: string | undefined, score = -Infinity;
  for (const id of candidates) {
    const reserve = hexReservePrice(id);
    if (budget < reserve + cost) continue;
    const net = (value[id] - baseline) * remaining - reserve - cost;
    if (net > score + 1e-9) { best = id; score = net; }
  }
  return score >= 0 ? best : undefined;
}

/** Les enchères déjà déposées par ce dirigeant excluent leur case des projets de ses autres usines/entreprises. */
export function unbidHexes(state: GameState, playerId: string, candidates: readonly string[], productId?: string): string[] {
  const used = new Set((state.hexBids ?? []).filter((b) => b.playerId === playerId && b.turn === state.turn && !b.result
    && (productId === undefined || b.productId !== productId)).map((b) => b.hexId));
  return candidates.filter((id) => !used.has(id));
}

/** La fusion supprime les deux privilèges fiscaux ; son économie de siège doit les compenser. */
export function mergePreservesSeatValue(state: GameState, absorber: CompanyState, target: CompanyState): boolean {
  if (!isSpatialMap(state.config)) return true;
  const remaining = Math.max(0, state.config.totalTurns - state.turn + 1);
  const saved = HQ_COST * (1 - effectiveTaxRate(state)) * remaining;
  const lost = (retainedSeatValue(state, absorber) + retainedSeatValue(state, target)) * remaining;
  return lost <= saved;
}
