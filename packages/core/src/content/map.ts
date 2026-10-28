/**
 * La carte (§5.8) : un pays imaginaire, toujours le même pour toutes les parties. Nombres communs à toutes les langues
 * (positions en km, x d'ouest en est, y du nord au sud) ; les noms sont dans content/fr et content/en.
 *
 * La capitale tient le port, la bourse des matières et celle des actions. Les gisements portent les emplacements de
 * filiale (`SiteSlot.id`) : leur position est fixe, seul leur nom se tire à la création de la partie.
 */
import type { CityDef, CityId, CommodityId, DepositDef, SectorId, LandmarkDef, LandmarkId, MapPoint, RoadDef, RoadKind, RoadRoute, ZoneDef, ZoneId } from '../types';

/** Étendue du pays (km) : toutes les positions tombent dans ce cadre. */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 1200;

/** Goût d'une ville par secteur : boissons, gadgets, trottinettes, yaourts, crypto (§5.2 bis). */
function taste(energy_drinks: number, gadgets: number, scooters: number, yogurts: number, crypto: number): Record<SectorId, number> {
  return { energy_drinks, gadgets, scooters, yogurts, crypto };
}

/**
 * Les villes : leur part de la population et leur goût pour chaque secteur (§5.2 bis). Chacune a son secteur fétiche :
 * la capitale la crypto (les traders), la grande ville du nord-est les gadgets, celle du sud les trottinettes (soleil,
 * rues plates), la petite ville de l'est les yaourts (« bio », au seau), celle du nord les boissons énergisantes (les
 * nuits sont longues).
 */
export const CITIES: Record<CityId, CityDef> = {
  capital: { id: 'capital', x: 120, y: 600, share: 0.4, taste: taste(0.9, 1.0, 0.9, 0.8, 1.4) },
  north_east: { id: 'north_east', x: 650, y: 260, share: 0.2, taste: taste(0.9, 1.6, 0.9, 0.8, 1.3) },
  south: { id: 'south', x: 440, y: 980, share: 0.2, taste: taste(1.2, 0.7, 1.5, 0.9, 0.6) },
  east: { id: 'east', x: 860, y: 660, share: 0.1, taste: taste(0.8, 1.0, 0.9, 3.0, 0.5) },
  north: { id: 'north', x: 260, y: 140, share: 0.1, taste: taste(2.2, 0.6, 0.6, 1.0, 0.6) },
};

/** Zone d'une usine dont le produit n'en a pas (`ProductState.zoneId` absent) : la capitale, main-d'œuvre × 1. */
export const DEFAULT_ZONE: ZoneId = 'capital';

/** Main-d'œuvre d'une zone par secteur : boissons, gadgets, trottinettes, yaourts, crypto (capitale = 1). */
function labor(energy_drinks: number, gadgets: number, scooters: number, yogurts: number, crypto: number): Record<SectorId, number> {
  return { energy_drinks, gadgets, scooters, yogurts, crypto };
}

/**
 * Les zones d'usine et leurs spécialités (§5.8) : la capitale paie le plein tarif mais a le port et 40 % des clients ;
 * la grande ville du nord-est est bon marché pour la tech, celle du sud pour les trottinettes et les yaourts, la petite
 * ville du nord pour les boissons, celle de l'est pour les gadgets, la plaine pour l'agroalimentaire, la montagne pour
 * les batteries.
 */
export const ZONES: Record<ZoneId, ZoneDef> = {
  capital: { id: 'capital', x: 120, y: 600, labor: labor(1, 1, 1, 1, 1) },
  north_east: { id: 'north_east', x: 650, y: 260, labor: labor(1, 0.91, 0.97, 1, 0.9) },
  south: { id: 'south', x: 440, y: 980, labor: labor(0.92, 0.97, 0.9, 0.9, 1) },
  east: { id: 'east', x: 860, y: 660, labor: labor(0.95, 0.88, 0.9, 0.95, 0.95) },
  north: { id: 'north', x: 260, y: 140, labor: labor(0.86, 0.94, 0.95, 0.92, 0.97) },
  plain: { id: 'plain', x: 300, y: 1080, labor: labor(0.88, 0.97, 0.97, 0.85, 1) },
  mountain: { id: 'mountain', x: 900, y: 480, labor: labor(1, 0.93, 0.84, 1, 0.95) },
};

/**
 * Trois gisements par matière, un par emplacement de filiale (`${matière}-${n}`, cf. `buildSiteSlots`) : un riche
 * (50 lots par trimestre), un moyen (40), un pauvre (30), soit 40 en moyenne. Les riches sont loin.
 */
export const DEPOSITS: Record<string, DepositDef> = Object.fromEntries(
  (
    [
      ['oil-1', 'oil', 230, 40, 50], // au large du nord
      ['oil-2', 'oil', 60, 820, 40], // côte sud
      ['oil-3', 'oil', 760, 120, 30], // nord-est
      ['lithium-1', 'lithium', 920, 420, 50], // montagne
      ['lithium-2', 'lithium', 820, 760, 40], // est
      ['lithium-3', 'lithium', 560, 160, 30], // nord-est
      ['sugar-1', 'sugar', 330, 1120, 50], // plaine
      ['sugar-2', 'sugar', 520, 1050, 40], // sud
      ['sugar-3', 'sugar', 150, 420, 30], // près de la capitale
      ['chips-1', 'chips', 700, 300, 50], // vallée du nord-est
      ['chips-2', 'chips', 200, 640, 40], // banlieue de la capitale
      ['chips-3', 'chips', 880, 700, 30], // est
    ] as [string, CommodityId, number, number, number][]
  ).map(([id, commodityId, x, y, capacity]) => [id, { id, commodityId, x, y, capacity }]),
);

/** Où poser le nom de chaque repère du décor. */
export const LANDMARKS: Record<LandmarkId, LandmarkDef> = {
  sea: { id: 'sea', x: 20, y: 760 },
  gulf: { id: 'gulf', x: 150, y: 860 },
  bay: { id: 'bay', x: 420, y: 130 },
  cape: { id: 'cape', x: 950, y: 1030 },
  island: { id: 'island', x: 90, y: 965 },
  lake: { id: 'lake', x: 505, y: 600 },
  river: { id: 'river', x: 250, y: 600 },
  valley: { id: 'valley', x: 700, y: 360 },
};

// ---------------------------------------------------------------------------
// Le relief (décor) : côte, île, lac, montagnes, fleuves
// ---------------------------------------------------------------------------

/** Côte du pays, dans le sens des aiguilles d'une montre depuis la presqu'île du nord-ouest (polygone fermé). */
export const COASTLINE: MapPoint[] = pts([
  // presqu'île du nord-ouest, puis la côte nord et sa baie
  [70, 330], [55, 250], [85, 175], [120, 110], [165, 78], [215, 96], [275, 88], [325, 105], [360, 140], [395, 182], [440, 196], [478, 160],
  [505, 112], [560, 80], [630, 60], [700, 78], [760, 62], [820, 70], [880, 40], [945, 30], [960, 75], [920, 120], [955, 175],
  // côte est, découpée
  [975, 250], [960, 320], [990, 390], [985, 470], [1000, 540], [975, 600], [990, 680], [965, 740], [985, 820], [960, 900],
  // long cap du sud-est
  [990, 990], [1010, 1080], [985, 1110], [930, 1060], [880, 1040], [840, 1080], [790, 1110],
  // côte sud
  [720, 1135], [660, 1170], [590, 1160], [530, 1190], [460, 1175], [395, 1195], [330, 1180], [270, 1160], [215, 1125],
  // golfe du sud-ouest
  [180, 1070], [150, 1010], [185, 960], [225, 905], [230, 850], [205, 795], [160, 760], [125, 720], [105, 680],
  // estuaire de la capitale, puis la côte ouest
  [100, 640], [92, 612], [86, 588], [100, 556], [82, 510], [96, 460], [72, 410],
]);

/** L'île du golfe (décor, sans route). */
export const ISLAND: MapPoint[] = pts([[60, 900], [95, 880], [120, 905], [105, 940], [70, 945]]);

/** Le grand lac du centre : les routes en font le tour. */
export const LAKE: MapPoint[] = pts([
  [375, 545], [410, 500], [470, 485], [540, 500], [600, 540], [640, 600], [625, 665], [570, 700], [505, 715], [440, 690], [395, 650], [372, 600],
]);

/** La chaîne de l'est (la zone de montagne et son lithium) : on n'y passe que par des routes de montagne. */
export const MOUNTAIN_RANGE: MapPoint[] = pts([[790, 330], [850, 285], [930, 295], [972, 360], [978, 520], [952, 600], [885, 622], [830, 565], [800, 470]]);

/** Le fleuve, du lac à l'estuaire de la capitale, et son affluent descendu des montagnes. */
export const RIVERS: MapPoint[][] = [
  pts([[372, 600], [330, 625], [260, 612], [190, 618], [92, 600]]),
  pts([[805, 470], [720, 515], [660, 560], [640, 600]]),
];

// ---------------------------------------------------------------------------
// Les routes (§5.8) : le transport suit la route la moins chère
// ---------------------------------------------------------------------------

/** Facteur de prix au km de chaque sorte de route : l'autoroute est la moins chère, la montagne la plus chère. */
export const ROAD_FACTOR: Record<RoadKind, number> = { highway: 0.7, road: 1, mountain: 1.6, sea: 1.2 };

/** Carrefours du réseau, entre les zones et les gisements. */
export const JUNCTIONS: Record<string, MapPoint> = {
  'j-nw': { x: 215, y: 330 },
  'j-north-coast': { x: 440, y: 255 },
  'j-cn': { x: 290, y: 480 },
  'j-lake-n': { x: 470, y: 425 },
  'j-cs': { x: 290, y: 770 },
  'j-lake-s': { x: 520, y: 790 },
  'j-east': { x: 700, y: 730 },
  'j-se': { x: 690, y: 900 },
  'j-pass': { x: 800, y: 340 },
};

/**
 * Le réseau : deux autoroutes depuis la capitale (A1 vers le nord-est par la rive nord du lac, A2 vers le sud), des
 * nationales, un col vers la montagne, et les dessertes des gisements (pipelines pour le pétrole en mer).
 */
export const ROADS: RoadDef[] = (
  [
    ['A1', 'capital', 'j-cn', 'highway', []],
    ['A1', 'j-cn', 'j-lake-n', 'highway', []],
    ['A1', 'j-lake-n', 'north_east', 'highway', [[560, 340]]],
    ['A2', 'capital', 'j-cs', 'highway', [[200, 690]]],
    ['A2', 'j-cs', 'south', 'highway', [[370, 880]]],
    ['N1', 'capital', 'sugar-3', 'road', [[135, 510]]],
    ['N1', 'sugar-3', 'j-nw', 'road', []],
    ['N1', 'j-nw', 'north', 'road', []],
    ['N2', 'north', 'j-north-coast', 'road', [[330, 215]]],
    ['N2', 'j-north-coast', 'north_east', 'road', [[540, 255]]],
    ['N3', 'j-cs', 'j-lake-s', 'road', []],
    ['N3', 'j-lake-s', 'j-east', 'road', []],
    ['N3', 'j-east', 'east', 'road', []],
    ['N4', 'south', 'j-se', 'road', []],
    ['N4', 'j-se', 'east', 'road', [[790, 800]]],
    ['N5', 'south', 'plain', 'road', [[370, 1040]]],
    ['N6', 'plain', 'j-cs', 'road', [[250, 930]]],
    ['N7', 'j-cn', 'j-nw', 'road', []],
    ['N8', 'mountain', 'east', 'road', [[890, 580]]],
    ['M1', 'north_east', 'j-pass', 'mountain', []],
    ['M1', 'j-pass', 'mountain', 'mountain', [[860, 400]]],
    ['oil-1', 'oil-1', 'north', 'sea', []],
    ['oil-2', 'oil-2', 'capital', 'sea', [[75, 700]]],
    ['oil-3', 'oil-3', 'north_east', 'road', []],
    ['lithium-1', 'lithium-1', 'mountain', 'mountain', []],
    ['lithium-2', 'lithium-2', 'east', 'road', []],
    ['lithium-3', 'lithium-3', 'north_east', 'road', []],
    ['sugar-1', 'sugar-1', 'plain', 'road', []],
    ['sugar-2', 'sugar-2', 'south', 'road', []],
    ['chips-1', 'chips-1', 'north_east', 'road', []],
    ['chips-2', 'chips-2', 'capital', 'road', []],
    ['chips-3', 'chips-3', 'east', 'road', []],
  ] as [string, string, string, RoadKind, [number, number][]][]
).map(([id, from, to, kind, via]) => ({ id, from, to, kind, via: pts(via) }));

/** Position d'un nœud du réseau : une zone (et sa ville), un gisement ou un carrefour. */
export function roadNode(id: string): MapPoint | undefined {
  if (Object.hasOwn(ZONES, id)) return ZONES[id as ZoneId];
  if (Object.hasOwn(DEPOSITS, id)) return DEPOSITS[id];
  if (Object.hasOwn(JUNCTIONS, id)) return JUNCTIONS[id];
  return undefined;
}

/** Tracé d'un tronçon, de `from` à `to`. */
export function roadPoints(r: RoadDef): MapPoint[] {
  return [roadNode(r.from) as MapPoint, ...r.via, roadNode(r.to) as MapPoint];
}

/** Longueur réelle d'une ligne brisée (km). */
function polylineKm(points: MapPoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += distanceKm(points[i - 1], points[i]);
  return km;
}

/**
 * Itinéraires les moins chers entre tous les nœuds (Floyd-Warshall, une fois au chargement) : déterministe, l'ordre
 * des nœuds et des tronçons étant fixe ; à coût égal, le premier trouvé reste.
 */
const NETWORK = (() => {
  const ids = [...Object.keys(ZONES), ...Object.keys(DEPOSITS), ...Object.keys(JUNCTIONS)];
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const cost = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  const km = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const next = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? j : -1)));
  const edge = new Map<string, RoadDef>();
  for (const r of ROADS) {
    const a = index.get(r.from);
    const b = index.get(r.to);
    if (a === undefined || b === undefined) throw new Error(`route ${r.id} : nœud inconnu`);
    const len = polylineKm(roadPoints(r));
    const c = len * ROAD_FACTOR[r.kind];
    if (c < cost[a][b]) {
      cost[a][b] = cost[b][a] = c;
      km[a][b] = km[b][a] = len;
      next[a][b] = b;
      next[b][a] = a;
      edge.set(`${a}|${b}`, r);
      edge.set(`${b}|${a}`, r);
    }
  }
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (cost[i][k] + cost[k][j] < cost[i][j] - 1e-9) {
          cost[i][j] = cost[i][k] + cost[k][j];
          km[i][j] = km[i][k] + km[k][j];
          next[i][j] = next[i][k];
        }
      }
    }
  }
  return { ids, index, cost, km, next, edge };
})();

/** Itinéraire le moins cher entre deux nœuds du réseau (zones, gisements, carrefours) ; `undefined` si l'un est inconnu. */
export function roadRoute(from: string, to: string): RoadRoute | undefined {
  const { ids, index, cost, km, next, edge } = NETWORK;
  const a = index.get(from);
  const b = index.get(to);
  if (a === undefined || b === undefined || !Number.isFinite(cost[a][b])) return undefined;
  const nodes = [from];
  const points: MapPoint[] = [roadNode(from) as MapPoint];
  for (let i = a; i !== b; ) {
    const j = next[i][b];
    const r = edge.get(`${i}|${j}`) as RoadDef;
    const leg = roadPoints(r);
    points.push(...(r.from === ids[i] ? leg : [...leg].reverse()).slice(1));
    nodes.push(ids[j]);
    i = j;
  }
  return { km: km[a][b], cost: cost[a][b], nodes, points };
}

/** Distance à vol d'oiseau entre deux points de la carte (km). */
export function distanceKm(a: MapPoint, b: MapPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Points de la carte depuis des couples [x, y]. */
function pts(list: [number, number][]): MapPoint[] {
  return list.map(([x, y]) => ({ x, y }));
}

/** Zone d'une usine : celle du produit, ou la capitale. Une zone inconnue (ancienne partie) compte comme la capitale. */
export function zoneOf(product: { zoneId?: ZoneId }): ZoneDef {
  const id = product.zoneId;
  return id !== undefined && Object.hasOwn(ZONES, id) ? ZONES[id] : ZONES[DEFAULT_ZONE];
}
