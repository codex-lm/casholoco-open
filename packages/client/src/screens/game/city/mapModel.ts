/**
 * La carte (§5.8) : modèle pur, calculé depuis la PlayerView (aucune règle nouvelle, aucune donnée cachée).
 *   - Le plateau : les villes (part des clients), les zones d'usine, un gisement par emplacement de filiale.
 *   - Les usines de tout le salon : une par produit de chaque entreprise active, à la couleur de son dirigeant.
 *   - Mon réseau : pour chacun de mes produits, la route de chaque matière du secteur, depuis ma filiale en
 *     service qui la fournit ou, à défaut, depuis le port, avec le prix du lot livré à l'usine.
 *   - La lentille « valeur » : pour une référence (un de mes produits, ou une nouvelle usine d'un secteur),
 *     l'écart de coût de chaque zone avec la zone de référence (négatif = moins cher).
 * Toute lecture privée passe par ./privacy (présence de `private`) : pour un spectateur, aucune route,
 * rien n'est « à moi », et la référence de la lentille retombe sur une nouvelle usine (donnée publique).
 */
import type { CityId, CommodityId, CompanyView, MapPoint, PlayerView, SectorId, ZoneId } from '@muchomoney/core';
import {
  CITIES,
  CITY_IDS,
  COMMODITIES,
  DEFAULT_ZONE,
  DEPOSITS,
  MAP_HEIGHT,
  MAP_WIDTH,
  SECTORS,
  ZONE_IDS,
  ZONES,
  roadRoute,
  zoneOf,
} from '@muchomoney/core';
import { deliveredLotPrice, type LotSource } from '../../../transport';
import { isOwn, ownProduct } from './privacy';

// ---------------------------------------------------------------------------
// Filtre et lentille
// ---------------------------------------------------------------------------

/** Filtre des affaires montrées : tout le salon, ou seulement les miennes. */
export type MapFilter = 'all' | 'mine';

/** Lentille : qui possède quoi, ou ce que vaut chaque zone pour une référence. */
export type MapLens = 'own' | 'value';

/** Filtre « mine » : tout ce qui n'est pas à moi s'estompe (usines, gisements, routes). */
export function dimmedBy(mine: boolean, filter: MapFilter): boolean {
  return filter === 'mine' && !mine;
}

// ---------------------------------------------------------------------------
// Le plateau : villes, zones, gisements
// ---------------------------------------------------------------------------

export interface CityNode {
  id: CityId;
  x: number;
  y: number;
  /** Part des clients du pays (0..1). */
  share: number;
}

/** Les cinq villes, dans l'ordre fixe de CITY_IDS. */
export function mapCities(): CityNode[] {
  return CITY_IDS.map((id) => ({ id, x: CITIES[id].x, y: CITIES[id].y, share: CITIES[id].share }));
}

export interface ZoneNode {
  id: ZoneId;
  x: number;
  y: number;
  /** La ville dont la zone porte le nom (null pour la plaine et la montagne). */
  cityId: CityId | null;
}

/** Les sept zones d'usine, dans l'ordre fixe de ZONE_IDS. */
export function mapZones(): ZoneNode[] {
  return ZONE_IDS.map((id) => ({ id, x: ZONES[id].x, y: ZONES[id].y, cityId: Object.hasOwn(CITIES, id) ? (id as CityId) : null }));
}

export interface DepositNode {
  /** Identifiant de l'emplacement de filiale (aussi nœud du réseau routier). */
  slotId: string;
  commodityId: CommodityId;
  name: string;
  x: number;
  y: number;
  /** Richesse : lots extraits par trimestre par la filiale qui l'exploite. */
  capacity: number;
  /** Entreprise exploitante (null : gisement libre, il se dispute aux enchères). */
  operatorId: string | null;
  operatorName: string | null;
  /** Couleur du dirigeant de l'exploitant (null : libre ou pilote automatique). */
  color: string | null;
  /** Exploité par une entreprise que je dirige. */
  mine: boolean;
}

/** Couleur du dirigeant d'une entreprise, d'après les joueurs du salon (null : pilote automatique). */
function controllerColor(view: PlayerView): (c: CompanyView) => string | null {
  const byId = new Map(view.players.map((p) => [p.id, p.color]));
  return (c) => (c.controllerId ? (byId.get(c.controllerId) ?? null) : null);
}

/** Un gisement par emplacement de filiale de la vue ; sa position est fixe (DEPOSITS), son nom vient du tirage. */
export function mapDeposits(view: PlayerView): DepositNode[] {
  const colorOf = controllerColor(view);
  return view.siteSlots.map((slot) => {
    const dep = DEPOSITS[slot.id];
    const operator = slot.companyId ? view.companies.find((c) => c.id === slot.companyId) : undefined;
    return {
      slotId: slot.id,
      commodityId: slot.commodityId,
      name: slot.name,
      x: dep?.x ?? 0,
      y: dep?.y ?? 0,
      capacity: dep?.capacity ?? 0,
      operatorId: slot.companyId ?? null,
      operatorName: operator?.name ?? null,
      color: operator ? colorOf(operator) : null,
      mine: operator !== undefined && isOwn(operator),
    };
  });
}

// ---------------------------------------------------------------------------
// Les usines de tout le salon
// ---------------------------------------------------------------------------

export interface FactoryMark {
  productId: string;
  productName: string;
  companyId: string;
  companyName: string;
  sectorId: SectorId;
  /** Zone de l'usine (la capitale quand le produit n'a pas de zone). */
  zoneId: ZoneId;
  /** Couleur du dirigeant (null : pilote automatique). */
  color: string | null;
  /** Une entreprise que je dirige. */
  mine: boolean;
}

/** Toutes les usines du salon : une par produit de chaque entreprise active, dans sa zone. */
export function mapFactories(view: PlayerView): FactoryMark[] {
  const colorOf = controllerColor(view);
  return view.companies
    .filter((c) => c.status === 'active')
    .flatMap((c) =>
      c.products.map((p) => ({
        productId: p.id,
        productName: p.name,
        companyId: c.id,
        companyName: c.name,
        sectorId: p.sectorId,
        zoneId: zoneOf(p).id,
        color: colorOf(c),
        mine: isOwn(c),
      })),
    );
}

// ---------------------------------------------------------------------------
// Mon réseau : routes de mes matières vers mes usines
// ---------------------------------------------------------------------------

export interface SupplyRoute {
  productId: string;
  productName: string;
  commodityId: CommodityId;
  /** D'où part le lot : le gisement d'une de mes filiales en service, ou 'capital' (le port). */
  fromNodeId: string;
  /** Le lot vient d'une de mes filiales (sinon : achat au port). */
  fromSite: boolean;
  /** Zone de l'usine. */
  zoneId: ZoneId;
  /** Longueur réelle de l'itinéraire le moins cher (km). */
  km: number;
  /** Tracé à dessiner (points en km, du départ à l'arrivée). */
  points: MapPoint[];
  /** Prix du lot livré à l'usine (k), transport compris. */
  pricePerLot: number;
}

/**
 * Chaque matière de chacun de mes produits : pour chaque produit d'une entreprise que je dirige et chaque
 * matière de son secteur, depuis une de mes filiales de la matière en service (pas en sommeil, en production)
 * s'il y en a une, sinon depuis le port ; rien pour un spectateur. Les lignes d'un nœud vers lui-même
 * (usine à la capitale approvisionnée au port : km 0, un seul point, prix = marché + portHaul) sont
 * conservées pour le carnet mais n'ont pas de tracé à dessiner.
 */
export function mySupplyInputs(view: PlayerView): SupplyRoute[] {
  const out: SupplyRoute[] = [];
  for (const c of view.companies) {
    if (!isOwn(c)) continue;
    for (const p of c.products) {
      const zoneId = zoneOf(p).id;
      for (const [cid, per] of Object.entries(SECTORS[p.sectorId].inputs) as [CommodityId, number][]) {
        if (!(per > 0)) continue;
        const site = (c.sites ?? []).find((s) => s.commodityId === cid && !s.dormant && s.activeFrom <= view.turn);
        const source: LotSource = site
          ? { kind: 'deposit', slotId: site.id, extractionCost: site.currentUnitCost }
          : { kind: 'port', commodityId: cid, marketPrice: view.commodities.find((m) => m.id === cid)?.price ?? COMMODITIES[cid].basePrice };
        const fromNodeId = site ? site.id : DEFAULT_ZONE;
        const route = SECTORS[p.sectorId].intangible ? { km: 0, points: [] } : roadRoute(fromNodeId, zoneId);
        if (!route) continue;
        out.push({
          productId: p.id,
          productName: p.name,
          commodityId: cid,
          fromNodeId,
          fromSite: site !== undefined,
          zoneId,
          km: route.km,
          points: route.points,
          pricePerLot: deliveredLotPrice(source, zoneId, view.transportFactor ?? 1, p.sectorId),
        });
      }
    }
  }
  return out;
}

/** Mes routes à dessiner sur la carte : seulement les approvisionnements avec un vrai tracé (plus d'un point). */
export function mySupplyRoutes(view: PlayerView): SupplyRoute[] {
  return mySupplyInputs(view).filter((r) => r.points.length > 1);
}

// ---------------------------------------------------------------------------
// La lentille « valeur » : ce que vaut chaque zone pour une référence
// ---------------------------------------------------------------------------

/** Référence de la lentille « valeur » : un de mes produits, ou une nouvelle usine d'un secteur. */
export type ValueReference = { kind: 'product'; productId: string } | { kind: 'launch'; sectorId: SectorId };

/** Choix du sélecteur de référence (le libellé vient des données de la vue, pas du catalogue i18n). */
export interface ValueReferenceOption {
  /** Clé stable : 'product:<id>' ou 'launch:<secteur>'. */
  key: string;
  ref: ValueReference;
  /** Nom du produit ; pour une nouvelle usine, nom du secteur dans la langue du salon (repli — le client préfère `content.sectors`). */
  label: string;
}

/** Références possibles : chacun de mes produits, puis une nouvelle usine de chaque secteur chiffré. */
export function valueReferenceOptions(view: PlayerView): ValueReferenceOption[] {
  const products = view.companies
    .filter(isOwn)
    .flatMap((c) =>
      c.products
        .filter((p) => ownProduct(p) !== null)
        .map((p) => ({ key: `product:${p.id}`, ref: { kind: 'product', productId: p.id } as ValueReference, label: p.name })),
    );
  const launches = view.sectors
    .filter((s) => s.launchByZone !== undefined)
    .map((s) => ({ key: `launch:${s.id}`, ref: { kind: 'launch', sectorId: s.id } as ValueReference, label: s.name }));
  return [...products, ...launches];
}

/**
 * Référence par défaut : mon premier produit ; sinon une nouvelle usine du secteur de ma première entreprise ;
 * sinon (rien à moi, spectateur) du premier secteur chiffré de la vue, une donnée publique. null s'il n'y en a pas.
 */
export function defaultValueReference(view: PlayerView): ValueReference | null {
  const mine = view.companies.filter(isOwn);
  for (const c of mine) {
    const p = c.products.find((q) => ownProduct(q) !== null);
    if (p) return { kind: 'product', productId: p.id };
  }
  const sectorId = mine[0]?.products[0]?.sectorId ?? view.sectors.find((s) => s.launchByZone !== undefined)?.id;
  return sectorId ? { kind: 'launch', sectorId } : null;
}

export interface ZoneValue {
  zoneId: ZoneId;
  /** Écart de coût avec la zone de référence, en fraction (négatif = moins cher ; 0 dans la zone de référence). */
  gap: number;
  /** Vrai dans la zone de référence (badge « réf. »). */
  isReference: boolean;
}

export interface ValueLens {
  ref: ValueReference;
  /** Zone de référence : celle de l'usine (produit) ou la capitale (nouvelle usine). */
  referenceZoneId: ZoneId;
  /** Coût de référence (k par lot), base des écarts. */
  referenceCost: number;
  /** Une entrée par zone, dans l'ordre de ZONE_IDS. */
  zones: ZoneValue[];
}

/**
 * Ce que vaut chaque zone pour la référence, en écart de coût unitaire avec la zone de référence (fraction,
 * négatif = moins cher). Pour un de mes produits : ses coûts estimés par zone, rapportés à sa zone actuelle.
 * Pour une nouvelle usine : l'estimation de lancement par zone, rapportée à la capitale. null si la référence
 * n'est pas calculable depuis la vue (produit pas à moi, secteur sans estimation).
 */
export function valueLensModel(view: PlayerView, ref: ValueReference | null): ValueLens | null {
  if (ref === null) return null;
  if (ref.kind === 'product') {
    const p = view.companies
      .filter(isOwn)
      .flatMap((c) => c.products)
      .find((q) => q.id === ref.productId);
    const own = p ? ownProduct(p) : null;
    if (!p || !own) return null;
    const { zones } = own;
    const { unitCost } = zones;
    const referenceZoneId = zoneOf(p).id;
    const referenceCost = unitCost[referenceZoneId];
    if (!(referenceCost > 0)) return null;
    return {
      ref,
      referenceZoneId,
      referenceCost,
      zones: ZONE_IDS.map((zoneId) => ({
        zoneId,
        gap: (unitCost[zoneId] - referenceCost) / referenceCost,
        isReference: zoneId === referenceZoneId,
      })),
    };
  }
  const sector = view.sectors.find((s) => s.id === ref.sectorId);
  const byZone = sector?.launchByZone;
  if (!byZone) return null;
  const referenceZoneId = DEFAULT_ZONE;
  const { unitCost: referenceCost } = byZone[referenceZoneId];
  if (!(referenceCost > 0)) return null;
  return {
    ref,
    referenceZoneId,
    referenceCost,
    zones: ZONE_IDS.map((zoneId) => {
      const { unitCost } = byZone[zoneId];
      return { zoneId, gap: (unitCost - referenceCost) / referenceCost, isReference: zoneId === referenceZoneId };
    }),
  };
}

// ---------------------------------------------------------------------------
// Dessin : projection, éventail de marqueurs, chemins lisses
// ---------------------------------------------------------------------------

export interface MapScale {
  /** Taille du dessin (px) : la largeur demandée, la hauteur au ratio du cadre. */
  width: number;
  height: number;
  /** Échelle uniforme (px par km). */
  scale: number;
  /** Projection km → px, dans le viewBox. */
  px: (xKm: number) => number;
  py: (yKm: number) => number;
}

/**
 * Projection du cadre de la carte (MAP_WIDTH × MAP_HEIGHT km) dans une largeur d'écran (px) : échelle
 * uniforme, la hauteur suit les proportions du viewBox (le cadre entier par défaut).
 */
export function mapScale(
  widthPx: number,
  viewBox: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT },
): MapScale {
  const scale = widthPx / viewBox.width;
  return {
    width: widthPx,
    height: viewBox.height * scale,
    scale,
    px: (x) => (x - viewBox.x) * scale,
    py: (y) => (y - viewBox.y) * scale,
  };
}

/**
 * n décalages (dx, dy en px) distincts pour poser n marqueurs d'usine en éventail sous leur zone, sans
 * chevauchement : une première rangée d'un marqueur centré, puis une de plus par rangée. `sizePx` est
 * l'encombrement d'un marqueur (case carrée).
 */
export function clusterOffsets(n: number, sizePx: number): { dx: number; dy: number }[] {
  const out: { dx: number; dy: number }[] = [];
  let row = 0;
  while (out.length < n) {
    const count = row + 1;
    for (let i = 0; i < count && out.length < n; i++) out.push({ dx: (i - (count - 1) / 2) * sizePx, dy: row * sizePx });
    row += 1;
  }
  return out;
}

/** Coordonnées de chemin, arrondies au centième pour des chaînes SVG courtes. */
const coord = (v: number) => Math.round(v * 100) / 100;

/**
 * Chemin SVG lisse passant par tous les points (spline de Catmull-Rom convertie en courbes de Bézier
 * cubiques ; aux bords, le point manquant est dupliqué) : commence par 'M', finit par 'Z' si `closed`.
 */
export function smoothPath(points: MapPoint[], closed: boolean): string {
  if (points.length === 0) return '';
  if (points.length < 3) {
    const d = `M${coord(points[0].x)},${coord(points[0].y)}` + (points[1] ? `L${coord(points[1].x)},${coord(points[1].y)}` : '');
    return closed ? `${d}Z` : d;
  }
  const n = points.length;
  const at = (i: number) => points[closed ? (i + n) % n : Math.min(Math.max(i, 0), n - 1)];
  let d = `M${coord(points[0].x)},${coord(points[0].y)}`;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${coord(c1x)},${coord(c1y)} ${coord(c2x)},${coord(c2y)} ${coord(p2.x)},${coord(p2.y)}`;
  }
  return closed ? `${d}Z` : d;
}
