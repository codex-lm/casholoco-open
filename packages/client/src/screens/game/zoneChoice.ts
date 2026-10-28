import type { ProductView, ZoneId } from '@muchomoney/core';
import { ZONE_IDS } from '@muchomoney/core';

export interface ZoneRow {
  zoneId: ZoneId;
  unitCost: number;
  demand: number | null;
  margin: number | null;
  demandDiff: number | null;
  marginDiff: number | null;
  isCurrent: boolean;
  isBest: boolean;
  paybackQuarters: number | null;
  /** Vrai quand les lots retenus sont ceux du chantier (rien à vendre à cette clôture) : chiffres « en régime ». */
  steadyState: boolean;
}

/**
 * Lots vendables à cette clôture : capacité installée et stock. La capacité en chantier est livrée
 * après la production (étape 14 de la résolution) : elle ne vend rien ce trimestre.
 */
export function saleableLots(product: ProductView): number {
  return product.capacity + (product.private?.stock ?? 0);
}

/**
 * Lots retenus pour chiffrer les zones : ceux vendables à cette clôture. Quand il n'y en a aucun
 * (produit frais lancé, usine vide) mais qu'un chantier livre et qu'il reste au moins un trimestre
 * pour l'exploiter, la capacité en chantier tient lieu de régime de croisière (`steadyState`).
 */
export function plannedLots(product: ProductView, quartersAfterClose: number): { lots: number; steadyState: boolean } {
  const saleable = saleableLots(product);
  if (saleable > 0) return { lots: saleable, steadyState: false };
  const pending = product.private?.pendingCapacity ?? 0;
  if (pending > 0 && quartersAfterClose >= 1) return { lots: pending, steadyState: true };
  return { lots: 0, steadyState: false };
}

/**
 * Tableau comparatif des zones pour choisir où déménager une usine (§5.8).
 * `quartersAfterClose` : trimestres restant après cette clôture (sert au repli « en régime »).
 * Null si le joueur ne contrôle pas l'entreprise (pas de données privées).
 */
export function zoneRows(product: ProductView, quartersAfterClose = 0): ZoneRow[] | null {
  const zones = product.private?.zones;
  if (!zones) return null;

  const current: ZoneId = product.zoneId ?? 'capital';
  const { lots, steadyState } = plannedLots(product, quartersAfterClose);

  const demandOf = (z: ZoneId): number | null => zones.demand?.[z] ?? null;
  const marginOf = (z: ZoneId): number | null => {
    const demand = demandOf(z);
    if (demand === null) return null;
    return (product.price - zones.unitCost[z]) * Math.min(demand, lots);
  };

  const currentDemand = demandOf(current);
  const currentMargin = marginOf(current);

  // Meilleure zone : plus forte marge si la demande est connue, sinon coût unitaire le plus bas ;
  // en cas d'égalité, la première zone dans l'ordre de ZONE_IDS.
  let best: ZoneId = ZONE_IDS[0];
  for (const z of ZONE_IDS) {
    if (zones.demand && lots > 0) {
      if ((marginOf(z) ?? -Infinity) > (marginOf(best) ?? -Infinity)) best = z;
    } else if (zones.unitCost[z] < zones.unitCost[best]) {
      best = z;
    }
  }

  return ZONE_IDS.map((zoneId) => {
    const demand = demandOf(zoneId);
    const margin = marginOf(zoneId);
    const demandDiff = demand === null || currentDemand === null ? null : demand - currentDemand;
    const marginDiff = margin === null || currentMargin === null ? null : margin - currentMargin;
    // En régime, les lots n'existent qu'à partir du trimestre prochain : ce trimestre ne rembourse rien.
    const paybackQuarters =
      zones.moveCost > 0 && marginDiff !== null && marginDiff > 0
        ? (steadyState ? 1 : 0) + Math.ceil(zones.moveCost / marginDiff)
        : null;
    return {
      zoneId,
      unitCost: zones.unitCost[zoneId],
      demand,
      margin,
      demandDiff,
      marginDiff,
      isCurrent: zoneId === current,
      isBest: zoneId === best,
      paybackQuarters,
      steadyState,
    };
  });
}
