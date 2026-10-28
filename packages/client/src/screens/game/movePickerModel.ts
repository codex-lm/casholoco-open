/**
 * Dérivations du choix de zone pour le déménagement d'usine (§5.8, maquette A2).
 * Tout se calcule côté client depuis la PlayerView et les fonctions pures du moteur :
 * aucun changement moteur, aucun aléa, aucun identifiant nouveau.
 */
import {
  CITY_IDS, COMMODITIES, EMERGENCY_PURCHASE_PREMIUM, SECTORS, WAGE_PRESSURE_MAX_PLANTS, WAGE_PRESSURE_PER_PLANT,
  cityWeights, salesMix, isSpatialMap, type CityId, type CompanyView, type CommodityId, type PlayerView,
  type ProductView, type SectorId, type ZoneId,
} from '@muchomoney/core';
import type { Fmt } from '../../fmt';
import { plannedLots } from './zoneChoice';
import { launchFreightClassic, productFreightClassic } from './city/freight';

/**
 * Même prix des matières que `withMaterials` du moteur : inventaire au coût moyen, reste à spot × 1,1.
 * Le transport utilise les routes et l'offre des filiales, au prorata des besoins de toutes les usines.
 * La main-d'œuvre est le résidu exact ; elle conserve ainsi nouvelles, délocalisation et pression salariale.
 */
export interface UnitCostSplit {
  labour: number;
  materials: number;
  transport: number;
  total: number;
}

export function unitCostSplit(view: PlayerView, product: ProductView, zoneId: ZoneId): UnitCostSplit | null {
  // Hex estimates include their own routes and heat credit; the classic leaf split does not describe them.
  if (isSpatialMap(view.config)) return null;
  const total = product.private?.zones?.unitCost[zoneId];
  if (total === undefined) return null;
  const company = view.companies.find((c) => c.products.some((p) => p.id === product.id));
  const inputs = SECTORS[product.sectorId].inputs;
  const qty = Math.max(1, Math.min(product.private?.production ?? 0, product.capacity));
  let materials = 0;
  for (const [cid, ratio] of Object.entries(inputs)) {
    if (!ratio) continue;
    const price = view.commodities.find((c) => c.id === cid)?.price ?? COMMODITIES[cid as CommodityId].basePrice;
    const line = company?.private?.inventory[cid as CommodityId];
    const need = ratio * qty;
    const fromInv = line ? Math.min(Math.max(line.lots, 0), need) : 0;
    materials += (fromInv * (line?.avgCost ?? 0) + (need - fromInv) * price * EMERGENCY_PURCHASE_PREMIUM) / qty;
  }
  const transport = transportAtZone(view, company, product, zoneId);
  return { labour: total - materials - transport, materials, transport, total };
}

/** Client equivalent of `estimatedTransport`, using only public routes and the controlled company's view. */
export function transportAtZone(view: PlayerView, company: CompanyView | undefined, product: ProductView, zoneId: ZoneId): number {
  return company ? productFreightClassic(view, company, product, zoneId).total
    : launchFreightClassic(view, product.sectorId, zoneId).total;
}

/** Les déplacements prennent effet dès la clôture du trimestre courant. */
export function moveQuartersLeft(view: Pick<PlayerView, 'turn' | 'config'>): number {
  return Math.max(0, view.config.totalTurns - view.turn + 1);
}

/** Les prix d'un lot gardent une décimale, même sous 100 k (maquette A2) : « 36,0 k€ » / « $36.0k ». */
export function unitMoney(fmt: Fmt, amount: number): string {
  return fmt.lotPrice(amount);
}

/**
 * Usines déjà installées dans la zone, toutes entreprises actives confondues, l'usine qui déménage
 * exceptée (elle ne se fait pas concurrence, cf. `plantsIn` côté moteur).
 */
export function plantsInZone(view: PlayerView, zoneId: ZoneId, exceptProductId: string): number {
  let n = 0;
  for (const c of view.companies) {
    if (c.status !== 'active') continue;
    for (const p of c.products) if (p.id !== exceptProductId && (p.zoneId ?? 'capital') === zoneId) n++;
  }
  return n;
}

/**
 * Pression sur les salaires pour une usine nouvelle dans la zone (miroir de `zoneLaborFactor`,
 * packages/core/src/sim/transport.ts) : +3 % par usine déjà là, au plus +15 % ; la capitale y échappe.
 */
export function wagePressure(zoneId: ZoneId, plants: number): number {
  if (zoneId === 'capital') return 0;
  return WAGE_PRESSURE_PER_PLANT * Math.min(WAGE_PRESSURE_MAX_PLANTS, plants);
}

export interface CityBar {
  city: CityId;
  /** Ventes attendues depuis la zone choisie, plafonnées par les lots disponibles. */
  lots: number;
  /** Même estimation de ventes depuis la zone actuelle (null si sa demande est inconnue). */
  today: number | null;
}

/** Répartition attendue des clients par ville depuis une zone ; null si la demande n'y est pas estimée. */
export function clientBars(view: PlayerView, product: ProductView, zoneId: ZoneId): CityBar[] | null {
  const demand = product.private?.zones?.demand?.[zoneId];
  if (demand === undefined) return null;
  const here = product.zoneId ?? 'capital';
  const todayDemand = product.private?.zones?.demand?.[here];
  const available = plannedLots(product, moveQuartersLeft(view) - 1).lots;
  const lots = Math.min(demand, available);
  const todayLots = todayDemand === undefined ? null : Math.min(todayDemand, available);
  const mix = salesMix(product.sectorId, zoneId);
  const todayMix = salesMix(product.sectorId, here);
  return CITY_IDS.map((city) => ({
    city,
    lots: lots * mix[city],
    today: todayLots === null ? null : todayLots * todayMix[city],
  }));
}

export interface Rival {
  product: string;
  company: string;
}

/** Produit rival du même secteur déjà installé dans la zone (le premier trouvé), sinon null. */
export function rivalInZone(view: PlayerView, companyId: string, product: ProductView, zoneId: ZoneId): Rival | null {
  for (const c of view.companies) {
    if (c.id === companyId || c.status !== 'active') continue;
    for (const p of c.products) {
      if (p.sectorId === product.sectorId && (p.zoneId ?? 'capital') === zoneId) return { product: p.name, company: c.name };
    }
  }
  return null;
}

/** Part des clients du secteur que représente la ville de la zone (null pour la plaine et les monts). */
export function cityClientShare(sectorId: SectorId, zoneId: ZoneId): number | null {
  return (CITY_IDS as string[]).includes(zoneId) ? cityWeights(sectorId)[zoneId as CityId] : null;
}
