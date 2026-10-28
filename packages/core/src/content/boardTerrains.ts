import { boardCells, hexById } from './hexes';
import type { BoardConfig } from './hexes';
import { distanceKm } from './map';
import type { Lang, TerrainDef } from '../types';
import { getContent } from './index';

/** Same grants, linked to the square board's matching zone or island; legacy definitions stay untouched. */
export function boardTerrains(config: BoardConfig, lang?: Lang): TerrainDef[] {
  const definitions = getContent(lang).terrains.definitions;
  if (config.mapMode !== 'square') return definitions;
  const cells = boardCells(config);
  return definitions.map(terrain => {
    const original = hexById(terrain.hex)!;
    const candidates = cells.filter(cell => !cell.deposit && (original.terrain === 'island' ? cell.terrain === 'island'
      : original.zone ? cell.zone === original.zone : cell.terrain !== 'island'));
    const cell = candidates.reduce((best, candidate) => distanceKm(candidate, original) < distanceKm(best, original) ? candidate : best);
    return { ...terrain, hex: cell.id };
  });
}
