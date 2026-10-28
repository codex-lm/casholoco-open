/**
 * Prix du lot de matière livré à l'usine (§5.8), partagé par le panneau des filiales et la carte :
 * depuis un gisement, son coût d'extraction courant + le trajet jusqu'à l'usine (`siteHaul`) ; depuis le port de la
 * capitale, le prix du marché + le trajet (`portHaul`). Les deux trajets sont comptés depuis zéro.
 * Chaque trajet se paie au kilomètre et au poids de la matière (`freightWeight`). Fonctions pures, mêmes
 * nombres que le moteur (le serveur reste seul juge). Le trajet suit le multiplicateur des
 * news « transportCost » du trimestre (`PlayerView.transportFactor`, absent = 1).
 */
import { COMMODITIES, DEPOSITS, SECTORS, SITE_UNIT_COST_RATIO, portHaul, portHaulHex, siteHaul, siteHaulHex, type CommodityId, type SectorId, type ZoneId } from '@muchomoney/core';

/** D'où vient un lot de matière : un gisement (coût d'extraction courant) ou le port (prix du marché). */
export type LotSource =
  | { kind: 'deposit'; slotId: string; extractionCost: number }
  | { kind: 'port'; commodityId: CommodityId; marketPrice: number };

/** Prix du lot livré à une usine de la zone (k), transport compris (§5.8) ; `factor` : `PlayerView.transportFactor`. */
export function deliveredLotPrice(source: LotSource, zoneId: ZoneId, factor = 1, sectorId?: SectorId): number {
  if (sectorId && SECTORS[sectorId].intangible) return source.kind === 'deposit' ? source.extractionCost : source.marketPrice;
  return source.kind === 'deposit'
    ? source.extractionCost + siteHaul(source.slotId, zoneId, DEPOSITS[source.slotId].commodityId) * factor
    : source.marketPrice + portHaul(zoneId, source.commodityId) * factor;
}

/** Même prix livré à une usine placée sur une case hexagonale ; le port reste le nœud de la capitale. */
export function deliveredLotPriceHex(source: LotSource, hexId: string, factor = 1, sectorId?: SectorId): number {
  if (sectorId && SECTORS[sectorId].intangible) return source.kind === 'deposit' ? source.extractionCost : source.marketPrice;
  return source.kind === 'deposit'
    ? source.extractionCost + siteHaulHex(source.slotId, hexId, DEPOSITS[source.slotId].commodityId) * factor
    : source.marketPrice + portHaulHex(hexId, source.commodityId) * factor;
}

/**
 * Coût d'extraction courant d'un gisement que l'on n'exploite pas (encore) : le tarif de base de la matière
 * (§5.5 bis), sous l'effet des news en cours (`siteCostFactor`, absent = 1).
 */
export function extractionCostNow(commodityId: CommodityId, siteCostFactor: number | undefined): number {
  return COMMODITIES[commodityId].basePrice * SITE_UNIT_COST_RATIO * (siteCostFactor ?? 1);
}
