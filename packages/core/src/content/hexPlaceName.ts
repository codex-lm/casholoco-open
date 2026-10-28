/**
 * Nom de lieu d'une case du plateau : sa ville, son terrain de départ ou son gisement quand elle en a un,
 * sinon son nom cadastral (hexNames). Texte seulement : la simulation ne lit jamais ces noms.
 */
import { hexById, cellBoardConfig } from './hexes';
import type { Lang } from '../types';
import { getContent } from './index';
import { boardTerrains } from './boardTerrains';

/** Emplacement de filiale tel qu'il suffit au nommage d'un gisement (SiteSlot et SiteSlotView conviennent). */
export interface HexSiteSlotRef {
  id: string;
  name: string;
}

/**
 * Nom affiché d'une case, par ordre de priorité : ville (mapNames), terrain de départ (nom de la définition),
 * gisement (nom de l'emplacement tiré en début de partie, si `siteSlots` est fourni), puis nom cadastral.
 * Toujours non vide : en dernier recours, l'identifiant de la case (ex. G7).
 */
export function hexPlaceName(id: string, lang?: Lang, siteSlots?: readonly HexSiteSlotRef[]): string {
  const content = getContent(lang);
  const hex = hexById(id);
  if (hex?.city) {
    const city = content.mapNames.cities[hex.city];
    if (city) return city;
  }
  const terrain = boardTerrains(cellBoardConfig(id), lang).find((t) => t.hex === id);
  if (terrain) return terrain.name;
  if (hex?.deposit && siteSlots) {
    const slot = siteSlots.find((s) => s.id === hex.deposit);
    if (slot) return slot.name;
  }
  return content.hexNames[id] ?? id;
}

/** Nom suivi de l'identifiant entre parenthèses, pour les listes : « Moulin-Rentier (G7) ». */
export function hexPlaceLabel(id: string, lang?: Lang, siteSlots?: readonly HexSiteSlotRef[]): string {
  const name = hexPlaceName(id, lang, siteSlots);
  if (name === id && id.startsWith('S-')) return `${lang === 'en' ? 'Parcel' : 'Parcelle'} ${id.slice(2)}`;
  return `${name} (${id})`;
}
