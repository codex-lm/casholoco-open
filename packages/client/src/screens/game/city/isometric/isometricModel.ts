/** Render-only data from the redacted view. Vehicle motion never becomes economic state. */
import {
  boardCells, capitalCellId, DEPOSITS, hexById, SECTORS, SQUARE_SIZE,
  type CommodityId, type HexDef, type MapPoint, type PlayerView, type SectorId,
} from '@muchomoney/core';
import { isOwn, ownProduct } from '../privacy';
import type { FlowMode, FlowModel } from '../mapFlows';

export const ISOMETRIC_KM_PER_UNIT = SQUARE_SIZE;
export interface IslandFactory {
  id: string;
  companyId: string;
  cellId: string;
  name: string;
  companyName: string;
  sectorId: SectorId;
  color: string;
  mine: boolean;
  point: MapPoint;
  capacity: number;
  /** Public capacity alone determines delivered modules. */
  extensionRatio: number;
  /** Only a granted own product can expose a pending capacity extension. */
  pendingExtension: boolean;
  constructing: boolean;
  incubator: boolean;
  /** Quantitative cargo marks only exist for one's own granted stock. */
  stockPallets: number | null;
}
export interface IslandSite {
  id: string;
  cellId: string | null;
  name: string;
  commodityId: CommodityId;
  point: MapPoint;
  companyId: string | null;
  color: string;
  dormant: boolean;
  constructing: boolean;
}
export interface IslandRoute {
  id: string;
  color: string;
  points: MapPoint[];
  kind: 'truck' | 'boat' | 'digital';
  /** The engine's off-road connector gets a cosmetic gravel surface, with identical route points. */
  track?: boolean;
  /** A constant number of actors illustrates a route; it never encodes a private rival volume. */
  indicative: boolean;
}
export interface IslandModel {
  cells: readonly HexDef[];
  factories: IslandFactory[];
  sites: IslandSite[];
  ownedLand: { cellId: string; color: string; companyId: string; companyName: string; vacant: boolean }[];
  routes: IslandRoute[];
  viewTurn: number;
}

const finiteNonnegative = (n: number | undefined): number => Number.isFinite(n) ? Math.max(0, n!) : 0;
const copyPoints = (points: readonly MapPoint[]) => points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).map(({ x, y }) => ({ x, y }));

/** Same one-lot minimum as ExpandCapacityModal, using only an active controller's granted product. */
export function canExpandIslandFactory(view: PlayerView, companyId: string, productId: string): boolean {
  if (view.phase !== 'playing') return false;
  const company = view.companies.find(item => item.id === companyId);
  if (!company || company.status !== 'active' || company.controllerId !== view.you || !isOwn(company)) return false;
  const product = company.products.find(item => item.id === productId);
  const own = product && ownProduct(product);
  if (!product || !own) return false;
  const cost = SECTORS[product.sectorId].capacityCost;
  const affordable = cost > 0 ? Math.floor(Math.max(0, company.cash) / cost) : 0;
  const room = product.capacityLimit === undefined ? Infinity
    : Math.max(0, product.capacityLimit - product.capacity - (own.pendingCapacity ?? 0));
  return Math.min(affordable, room) >= 1;
}

export function islandRoutes(model: FlowModel | null | undefined, mode: FlowMode): IslandRoute[] {
  if (!model?.selectedProductId || mode === 'off' || mode === 'production') return [];
  const result: IslandRoute[] = [];
  if (mode === 'supply') {
    const seen = new Set<string>();
    for (const flow of model.supply) {
      if (flow.productId !== model.selectedProductId || flow.intangible || !flow.mine) continue;
      for (const source of flow.sources) {
        if (!source.route) continue;
        // Port deliveries for several materials share one path and one illustrative vehicle.
        const key = `${flow.productId}:${source.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const [index, segment] of source.route.segments.entries()) {
          const points = copyPoints(segment.points);
          if (points.length < 2) continue;
          result.push({ id: `${key}:${index}`, color: flow.color, points,
            kind: segment.kind === 'ferry' ? 'boat' : 'truck', indicative: true,
            ...(segment.kind === 'track' ? { track: true } : {}) });
        }
      }
    }
  } else {
    for (const flow of model.sales) {
      // Intangible sales keep their city figures in FlowModel, but have no journey to illustrate.
      if (flow.productId !== model.selectedProductId || flow.intangible || flow.national || !(flow.sold > 0) || !flow.originKnown) continue;
      if (flow.route) {
        for (const [index, segment] of flow.route.segments.entries()) {
          const points = copyPoints(segment.points);
          if (points.length < 2) continue;
          result.push({ id: `${flow.id}:${index}`, color: flow.color, points,
            kind: segment.kind === 'ferry' ? 'boat' : 'truck', indicative: Boolean(segment.indicative),
            ...(segment.kind === 'track' ? { track: true } : {}) });
        }
      }
    }
  }
  return result;
}

export function buildIslandModel(view: PlayerView, flowModel?: FlowModel | null, mode: FlowMode = 'off'): IslandModel {
  const cells = boardCells(view.config);
  const ids = new Set(cells.map(cell => cell.id));
  const factories: IslandFactory[] = [];
  const ownedLand: IslandModel['ownedLand'] = [];
  for (const company of view.companies) {
    if (company.status !== 'active') continue;
    const mine = isOwn(company);
    for (const land of company.land ?? []) if (ids.has(land.hexId)) {
      ownedLand.push({ cellId: land.hexId, color: company.color, companyId: company.id, companyName: company.name, vacant: land.vacant });
    }
    for (const product of company.products) {
      const cellId = product.hexId ?? capitalCellId(view.config);
      if (!ids.has(cellId)) continue;
      const cell = hexById(cellId);
      if (!cell) continue;
      const own = mine ? ownProduct(product) : null;
      const { pendingCapacity, stock } = own ?? { pendingCapacity: 0, stock: undefined };
      const capacity = finiteNonnegative(product.capacity);
      const baseCapacity = product.capacityLimit && product.capacityLimit > 0 ? product.capacityLimit / 2 : SECTORS[product.sectorId].startingCapacity;
      factories.push({ id: product.id, companyId: company.id, cellId, name: product.name, companyName: company.name,
        sectorId: product.sectorId, color: company.color, mine, point: { x: cell.x, y: cell.y }, capacity,
        extensionRatio: Math.min(1, Math.max(0, (capacity - baseCapacity) / Math.max(1, baseCapacity))),
        pendingExtension: finiteNonnegative(pendingCapacity) > 0 && !product.comingSoon,
        constructing: Boolean(product.comingSoon), incubator: Boolean(product.incubator),
        stockPallets: stock === undefined ? null : Math.min(5, Math.ceil(finiteNonnegative(stock) / Math.max(1, capacity / 5))),
      });
    }
  }
  const sites = view.siteSlots.flatMap<IslandSite>(slot => {
    const cell = cells.find(candidate => candidate.deposit === slot.id);
    const point = cell ?? DEPOSITS[slot.id];
    if (!point) return [];
    const owner = view.companies.find(company => company.status === 'active' && company.id === slot.companyId);
    const site = owner?.sites?.find(candidate => candidate.id === slot.id);
    return [{ id: slot.id, cellId: cell?.id ?? null, name: slot.name, commodityId: slot.commodityId,
      point: { x: point.x, y: point.y }, companyId: owner?.id ?? null, color: owner?.color ?? '#9d927c',
      dormant: Boolean(site?.dormant), constructing: Boolean(site && site.activeFrom > view.turn) }];
  });
  return { cells, factories, sites, ownedLand, routes: islandRoutes(flowModel, mode), viewTurn: view.turn };
}

/** Cosmetic stable hash, separate from the simulation RNG and never derived from hidden state. */
export function scenerySeed(key: string): number {
  let n = 2166136261;
  for (let i = 0; i < key.length; i++) n = Math.imul(n ^ key.charCodeAt(i), 16777619);
  return (n >>> 0) / 4294967296;
}

/** Safe points along a polyline; repeated vertices and zero-length routes remain finite. */
export function pointAlongRoute(points: readonly MapPoint[], progress: number): { point: MapPoint; angle: number } | null {
  if (!points.length) return null;
  const segments = points.slice(1).map((b, i) => ({ a: points[i], b, length: Math.hypot(b.x - points[i].x, b.y - points[i].y) }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (!(total > 0)) return { point: { ...points[0] }, angle: 0 };
  let distance = Math.max(0, Math.min(1, progress)) * total;
  for (const segment of segments) {
    if (segment.length > 0 && distance <= segment.length) {
      const t = distance / segment.length;
      return { point: { x: segment.a.x + (segment.b.x - segment.a.x) * t, y: segment.a.y + (segment.b.y - segment.a.y) * t },
        angle: Math.atan2(segment.b.x - segment.a.x, segment.b.y - segment.a.y) };
    }
    distance -= segment.length;
  }
  const last = segments.filter(segment => segment.length > 0).at(-1)!;
  return { point: { ...last.b }, angle: Math.atan2(last.b.x - last.a.x, last.b.y - last.a.y) };
}
