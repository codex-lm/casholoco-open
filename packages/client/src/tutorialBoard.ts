/**
 * « Vos premiers pas » on the hex board: only explicit player actions tick its board steps (selecting a cell, a launch
 * or move form opening); receiving a view never does, and no step ever sends a bid.
 */
import { isSpatialMap, type PlayerView } from '@muchomoney/core';
import { markTutorial } from './tutorialStore';
import { hexFactory, hexIsBuildable } from './screens/game/city/hexModel';
import { launchCompany } from './screens/game/city/model';
import type { MapIntent } from './screens/game/mapIntent';

/** A cell « Vos premiers pas » asks La carte to select: my factory, or the best free cell for the tracked reference. */
export type BoardCell = 'own' | 'bestFree';

/**
 * One request to select a board cell, numbered so that asking twice selects again. It is not a map intent (no form,
 * no company change): a map already on screen selects the cell in place, keeping its colours, flows and open forms.
 */
export interface BoardCellRequest {
  cell: BoardCell;
  seq: number;
}

/** A participant of a hex game; spectators and the classic map have no board steps. */
export function tutorialBoardEligible(view: PlayerView): boolean {
  return isSpatialMap(view.config) && !!view.self && view.players.some((p) => p.id === view.you);
}

/** Selecting one of my factory cells ticks « Retrouver votre usine », a free buildable cell « Comparer une case libre ». */
export function recordTutorialCellSelection(view: PlayerView, hexId: string): void {
  if (!tutorialBoardEligible(view)) return;
  if (hexFactory(view, hexId)?.mine) markTutorial('ownCell');
  if (hexIsBuildable(hexId) && view.hexes?.free.includes(hexId)) markTutorial('freeCell');
}

/** A launch or move form actually open on the board (whoever asked for it): « Préparer un lancement ou un déménagement ». */
export function recordTutorialFormOpened(view: PlayerView): void {
  if (tutorialBoardEligible(view)) markTutorial('bidForm');
}

/**
 * Where « Préparer un lancement ou un déménagement » leads: a launch form on the best free cell for a company with a
 * free product slot (its first product's sector), otherwise the move form of one of my plants on the board. The form
 * opens without sending anything; null when I run nothing that could do either.
 */
export function tutorialBidIntent(view: PlayerView): MapIntent | null {
  const launcher = launchCompany(view);
  if (launcher && launcher.controllerId === view.you && launcher.status === 'active') {
    const sectorId = launcher.products[0]?.sectorId;
    return { kind: 'launch', companyId: launcher.id, ...(sectorId ? { sectorId } : {}) };
  }
  const product = view.companies
    .filter((c) => c.controllerId === view.you && c.status === 'active')
    .flatMap((c) => c.products.filter((p) => !!p.hexId && view.hexes?.occupied[p.hexId] === c.id))[0];
  return product ? { kind: 'move', productId: product.id } : null;
}
