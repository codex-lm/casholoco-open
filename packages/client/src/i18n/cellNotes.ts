import type { Lang } from '@muchomoney/core';
import type { CellNoteKind } from '../cellNotes';
import { useUiLang } from './index';

/** One-time notes on the hex cell sheets: each one speaks of its own kind of cell only (30 words at most). */
export type CellNoteMessages = Record<CellNoteKind, string>;

const fr: CellNoteMessages = {
  terrain: 'Terrain de départ : ses privilèges sont liés à l’usine de départ, pas aux nouveaux occupants. Si elle déménage, ses avantages et ceux du siège sont perdus pour de bon.',
  free: 'Case ordinaire : aucun privilège, même avec une jolie vue. Sa fiche estime vos coûts et vos clients si vous y installez une usine.',
  deposit: 'Gisement : vous y exploitez une filiale qui fournit des matières premières, pas une usine.',
};

const en: CellNoteMessages = {
  terrain: 'Starting terrain: perks belong to the starting factory, not new tenants. Moving it permanently removes its perks and the headquarters perks.',
  free: 'Ordinary cell: no perks, even with a lovely view. Its sheet estimates your costs and customers should you put a factory here.',
  deposit: 'Deposit: it hosts a subsidiary supplying raw materials, not a factory.',
};

export function cellNoteMessages(lang: Lang | undefined): CellNoteMessages {
  return lang === 'en' ? en : fr;
}

export function useCellNoteMessages(): CellNoteMessages {
  return cellNoteMessages(useUiLang());
}
