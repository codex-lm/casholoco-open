/**
 * Fret réel d'un lot produit sur les deux cartes (§5.8). Le moteur pur décompose lui-même les trajets : l'affichage
 * partage ainsi exactement la facture de la clôture. Seule l'allocation des filiales est reconstruite depuis la vue
 * privée du joueur, sans accéder aux décisions des rivaux ; les nouvelles du transport s'appliquent à tous les flux.
 */
import {
  COMMODITY_IDS, DEFAULT_ZONE, transportBreakdown, transportBreakdownHex, capitalCellId, isSpatialMap,
  type CompanyView, type Extraction, type FreightBreakdown, type PlayerView, type ProductView, type SectorId,
  type ZoneId,
} from '@muchomoney/core';
import { ownContracts, ownProduct } from './privacy';

export type { FreightBreakdown, FreightMaterialLeg as FreightLeg, FreightDeliveryLeg as FreightCity } from '@muchomoney/core';

/** Une usine neuve sur une case, toutes ses matières venues du port. */
export function launchFreight(view: PlayerView, sectorId: SectorId, hexId: string): FreightBreakdown {
  return transportBreakdownHex({ products: [{ sectorId }] }, [1], [], [hexId], view.transportFactor ?? 1)[0];
}

/** Même estimation de lancement sur une zone de la carte classique. */
export function launchFreightClassic(view: PlayerView, sectorId: SectorId, zoneId: ZoneId): FreightBreakdown {
  return transportBreakdown({ products: [{ sectorId }] }, [1], [], [zoneId], view.transportFactor ?? 1)[0];
}

/** Capacité en service disponible pour mes usines après les contrats sortants, dans l'ordre du moteur. */
function ownSiteSupply(view: PlayerView, company: CompanyView): Extraction[] {
  const owed = Object.fromEntries(COMMODITY_IDS.map((cid) => [cid, 0])) as Record<typeof COMMODITY_IDS[number], number>;
  for (const contract of ownContracts(view)) {
    if (contract.sellerCompanyId !== company.id || !(contract.turnsLeft > 0)) continue;
    if (!view.companies.some((buyer) => buyer.id === contract.buyerCompanyId && buyer.status === 'active')) continue;
    if (Object.hasOwn(owed, contract.commodityId)) owed[contract.commodityId] += Math.max(0, contract.lots);
  }
  const extracted: Extraction[] = [];
  for (const site of company.sites ?? []) {
    if (site.dormant || site.activeFrom > view.turn) continue;
    const capacity = Math.max(0, Math.floor(site.capacity));
    const toBuyers = Math.min(capacity, owed[site.commodityId]);
    owed[site.commodityId] -= toBuyers;
    extracted.push({ siteId: site.id, commodityId: site.commodityId, lots: capacity - toBuyers });
  }
  return extracted;
}

/** Le moteur estime au moins un lot du produit suivi, même avec une production prévue nulle. */
function plannedLots(company: CompanyView, product: ProductView): number[] {
  return company.products.map((p) => {
    const own = ownProduct(p);
    const production = own && Number.isFinite(own.production) ? own.production : 0;
    const n = Math.max(0, Math.floor(Math.min(production, p.capacity)));
    return p.id === product.id ? Math.max(1, n) : n;
  });
}

/** Un de mes produits si son usine était sur la case ; même facture que `estimatedTransportHex`. */
export function productFreight(view: PlayerView, company: CompanyView, product: ProductView, hexId: string): FreightBreakdown {
  const index = company.products.findIndex((p) => p.id === product.id);
  if (index < 0) return launchFreight(view, product.sectorId, hexId);
  const hexes = company.products.map((p) => p.hexId ?? capitalCellId(view.config));
  hexes[index] = hexId;
  return transportBreakdownHex(company, plannedLots(company, product), ownSiteSupply(view, company), hexes, view.transportFactor ?? 1)[index];
}

/** Même détail de fret du produit sur une zone classique (`estimatedTransport`). */
export function productFreightClassic(view: PlayerView, company: CompanyView, product: ProductView, zoneId: ZoneId): FreightBreakdown {
  const index = company.products.findIndex((p) => p.id === product.id);
  if (index < 0) return launchFreightClassic(view, product.sectorId, zoneId);
  const zones = company.products.map((p) => p.zoneId ?? DEFAULT_ZONE);
  zones[index] = zoneId;
  return transportBreakdown(company, plannedLots(company, product), ownSiteSupply(view, company), zones, view.transportFactor ?? 1)[index];
}

/** Fret de l'usine à son emplacement actuel, sur la carte du salon. */
export function currentProductFreight(view: PlayerView, company: CompanyView, product: ProductView): FreightBreakdown {
  return isSpatialMap(view.config)
    ? productFreight(view, company, product, product.hexId ?? capitalCellId(view.config))
    : productFreightClassic(view, company, product, product.zoneId ?? DEFAULT_ZONE);
}
