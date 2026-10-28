/**
 * Intention à usage unique vers l'onglet « La carte » : toute décision géographique (lancement,
 * déménagement, gisement) se prend là-bas, dans le panneau latéral de la carte. Celui qui envoie
 * le joueur sur la carte pose l'intention ; la carte l'initialise puis l'oublie (comme journalTurn).
 * `cell` montre seulement une case du plateau (résultat d'une mise, depuis le bilan de clôture), sans formulaire.
 */
import type { SectorId, ZoneId } from '@muchomoney/core';

export type MapIntent =
  | { kind: 'launch'; companyId: string; sectorId?: SectorId; zoneId?: ZoneId; hexId?: string;
      /** Network only: the physical product row whose commercial profile the new factory will share. */
      existingProductId?: string }
  | { kind: 'move'; productId: string }
  | { kind: 'deposit'; companyId: string; slotId?: string }
  | { kind: 'cell'; hexId: string };
