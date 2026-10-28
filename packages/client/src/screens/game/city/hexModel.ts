/** The public engine grid and controller-only estimates, projected without a new simulation. */
import {
  COMMODITIES, HEXES, HEX_R, SECTORS, TRANSPORT_COST_PER_KM, routeBetweenHexes, heatCredit, hexById, neighbors,
  boardCells, SQUARE_SIZE, capitalCellId, type CommodityId, type CompanyView, type HexDef, type PlayerView,
  type ProductView, type SectorId,
} from '@muchomoney/core';
import { isOwn, ownProduct, ownHexProduct } from './privacy';
import { launchFreight, productFreight } from './freight';
import type { MapScale } from './mapModel';
import { fnv1a } from '../paper/hash';

export type HexLens = 'margin' | 'transport' | 'demand' | 'plain';
export type HexReference = ({ kind: 'product'; productId: string } | { kind: 'launch'; sectorId: SectorId }) & {
  /** Theoretical origin, independent of the real factory and of the product choice. */
  originHexId?: string;
};
export interface HexReferenceOption { key: string; ref: HexReference; label: string }
export interface HexSupplyReference { originHexId: string; commodityId: CommodityId; recipient?: HexReference }
/** A theoretical subsidiary's outbound freight uses the engine's exact route and material weight. */
export function hexSupplyFreight(view: PlayerView, ref: HexSupplyReference, hexId: string): number | null {
  if (!hexById(ref.originHexId) || !hexById(hexId)) return null;
  const cost = routeBetweenHexes(ref.originHexId, hexId) * TRANSPORT_COST_PER_KM
    * COMMODITIES[ref.commodityId].freightWeight * (view.transportFactor ?? 1);
  return Number.isFinite(cost) ? cost : null;
}
export interface HexEstimate {
  unitCost: number;
  demand: number | null;
  margin: number | null;
  transport: number | null;
  heatCredit: number | null;
  moveCost: number;
  paybackQuarters: number | null;
}
export const HEX_PALETTES = {
  margin: ['#c7702e', '#efc9a3', '#efe6d2', '#9fc3dd', '#3f7fb0'],
  transport: ['#f4ead6', '#e3d3ae', '#c9b07a', '#a3824a', '#6f5427'],
  demand: ['#eef1ea', '#cfdde2', '#9fbfcf', '#5f93b0', '#2f6286'],
} as const;
export const HEX_NEUTRAL = '#faf6ec';
/** Endpoints and the four empirical quintile boundaries for absolute quarterly margins. */
export type HexQuintiles = [number, number, number, number, number, number];
export const hexIsBuildable = (id: string): boolean => { const cell = hexById(id); return Boolean(cell && !cell.deposit); };

export function hexReferenceKey(ref: HexReference): string {
  return ref.kind === 'product' ? `product:${ref.productId}` : `launch:${ref.sectorId}`;
}

export function hexReferenceOptions(view: PlayerView): HexReferenceOption[] {
  const products = view.companies.filter(isOwn).flatMap((c) => c.products.filter((p) => ownProduct(p)).map((p) => ({
    key: `product:${p.id}`, ref: { kind: 'product' as const, productId: p.id }, label: p.name,
  })));
  const launches = view.sectors.filter((s) => s.launchByHex !== undefined).map((s) => ({
    key: `launch:${s.id}`, ref: { kind: 'launch' as const, sectorId: s.id }, label: s.name,
  }));
  return [...products, ...launches];
}

export function defaultHexReference(view: PlayerView): HexReference | null {
  return hexReferenceOptions(view)[0]?.ref ?? null;
}

/** The estimate's current factory location, independent of the inspected destination. A launch has no origin yet. */
export function hexReferenceHexId(view: PlayerView, ref: HexReference | null | undefined): string | null {
  if (ref?.originHexId && hexById(ref.originHexId)) return ref.originHexId;
  const product = ref?.kind === 'product' ? ownHexProduct(view, ref.productId)?.product : null;
  const id = product ? product.hexId ?? capitalCellId(view.config) : null;
  return id && hexById(id) ? id : null;
}

export const hexReferenceIsRelative = (ref: HexReference | null | undefined): boolean =>
  Boolean(ref && (ref.kind === 'product' || ref.originHexId));

export function hexFactory(view: PlayerView, hexId: string): { company: CompanyView; product: ProductView | null; mine: boolean; color: string } | null {
  const companyId = view.hexes?.occupied[hexId];
  const company = view.companies.find((c) => c.id === companyId && c.status === 'active');
  if (!company) return null;
  return {
    company, product: company.products.find((p) => p.hexId === hexId) ?? null, mine: isOwn(company),
    color: company.color,
  };
}

/** Fret d'un lot : le détail vit dans ./freight (mêmes règles que le moteur), ici seulement le total. */
function portTransport(view: PlayerView, sectorId: SectorId, hexId: string): number {
  return launchFreight(view, sectorId, hexId).total;
}

function productTransport(view: PlayerView, company: CompanyView, product: ProductView, hexId: string): number {
  return productFreight(view, company, product, hexId).total;
}

/** Missing candidate keys deliberately return null: a free cell is not a fabricated estimate. */
export function hexEstimate(view: PlayerView, ref: HexReference | null | undefined, hexId: string): HexEstimate | null {
  if (!ref || !hexById(hexId)) return null;
  if (ref.kind === 'launch') {
    const estimate = view.sectors.find((s) => s.id === ref.sectorId)?.launchByHex?.[hexId];
    if (!estimate) return null;
    const { unitCost, demand, quarterlyProfit, paybackQuarters } = estimate;
    return { unitCost, demand, margin: quarterlyProfit, moveCost: 0, paybackQuarters,
      transport: portTransport(view, ref.sectorId, hexId), heatCredit: heatCredit(ref.sectorId, hexId) };
  }
  const ownRef = ownHexProduct(view, ref.productId);
  if (!ownRef) return null;
  const { company, product, own } = ownRef;
  const { hexes, estimatedUnitCost, estimate, market, production, marketing, rnd, stock, heatCredit: currentHeat } = own;
  const current = product.hexId ?? capitalCellId(view.config);
  const { unitCost: byHex, demand: byDemand, moveCost } = hexes ?? { unitCost: {}, moveCost: 0 };
  const unitCost = byHex[hexId] ?? (hexId === current ? estimatedUnitCost : undefined);
  if (unitCost === undefined) return null;
  const demand = byDemand?.[hexId] ?? (hexId === current ? estimate?.demand : undefined) ?? null;
  const planned = Math.max(0, Math.floor(Math.min(production, product.capacity)));
  const fixedCost = hexId === current && market ? market.fixedCost : SECTORS[product.sectorId].fixedCost;
  const margin = hexId === current && estimate ? estimate.margin : demand !== null && market
    ? Math.min(demand, Math.max(0, stock) + planned) * product.price - planned * unitCost - marketing - rnd - fixedCost : null;
  return { unitCost, demand, margin, moveCost, paybackQuarters: null,
    transport: hexId === current ? own.estimatedTransport : productTransport(view, company, product, hexId),
    heatCredit: hexId === current ? currentHeat ?? 0 : heatCredit(product.sectorId, hexId),
  };
}

export function hexMarginValue(view: PlayerView, ref: HexReference | null | undefined, hexId: string, delta = false): number | null {
  const estimate = hexEstimate(view, ref, hexId);
  if (!estimate || estimate.margin === null) return null;
  if (!delta || !hexReferenceIsRelative(ref)) return estimate.margin;
  const origin = hexReferenceHexId(view, ref);
  const current = origin ? hexEstimate(view, ref, origin)?.margin : null;
  return current === null || current === undefined ? null : estimate.margin - current;
}

/** Best move destination: the free cell with the highest margin delta for the product. */
export function bestMoveHex(view: PlayerView, reference: HexReference): string | null {
  return (view.hexes?.free ?? []).reduce<string | null>((best, id) => {
    const gain = hexMarginValue(view, reference, id, true);
    const bestGain = best ? hexMarginValue(view, reference, best, true) : null;
    return best === null || (gain !== null && gain > (bestGain ?? -Infinity)) ? id : best;
  }, null);
}

/** « Aller à › Meilleure case » (and « Vos premiers pas »): that best free cell, only when its margin can be estimated. */
export function bestPricedHex(view: PlayerView, reference: HexReference | null): string | null {
  const best = reference ? bestMoveHex(view, reference) : null;
  return best && hexMarginValue(view, reference, best, reference?.kind === 'product') !== null ? best : null;
}

export function hexRanks(view: PlayerView, ref: HexReference | null | undefined, delta = false): Map<string, number> {
  const ranked = (view.hexes?.free ?? []).flatMap((id) => {
    const value = hexMarginValue(view, ref, id, delta);
    return value === null || !Number.isFinite(value) ? [] : [{ id, value }];
  }).sort((a, b) => b.value - a.value);
  return new Map(ranked.slice(0, 3).map((v, i) => [v.id, i + 1]));
}

/**
 * Écart de fret par lot si l'usine de mon produit était sur la case plutôt que sur la sienne (0 chez elle) : la
 * différence des factures réelles, ce que le déménagement ferait gagner ou perdre en transport.
 */
export function hexTransportDelta(view: PlayerView, productId: string, hexId: string, originHexId?: string): number | null {
  const ownRef = ownHexProduct(view, productId);
  if (!ownRef || !hexById(hexId)) return null;
  const { company, product } = ownRef;
  const current = originHexId && hexById(originHexId) ? originHexId : product.hexId ?? capitalCellId(view.config);
  return productFreight(view, company, product, hexId).total - productFreight(view, company, product, current).total;
}

export function hexLensValue(view: PlayerView, ref: HexReference | null | undefined, id: string, lens: HexLens, delta = false): number | null {
  if (lens === 'plain') return null;
  const estimate = lens === 'margin' ? null : hexEstimate(view, ref, id);
  const demand = estimate?.demand ?? null;
  const value = lens === 'margin' ? hexMarginValue(view, ref, id, delta)
    : lens === 'demand' ? demand
    : delta && ref?.kind === 'product' ? hexTransportDelta(view, ref.productId, id, ref.originHexId)
    : estimate?.transport ?? null;
  return value === null || !Number.isFinite(value) ? null : value;
}

function freeLensValues(view: PlayerView, ref: HexReference | null | undefined, lens: HexLens, delta = false): number[] {
  return (ref?.originHexId ? boardCells(view.config).map((hex) => hex.id) : view.hexes?.free ?? []).flatMap((id) => {
    const v = hexLensValue(view, ref, id, lens, delta);
    return v === null || !Number.isFinite(v) ? [] : [v];
  });
}

export function hexLensRange(view: PlayerView, ref: HexReference | null | undefined, lens: HexLens, delta = false): [number, number] | null {
  const values = freeLensValues(view, ref, lens, delta);
  return values.length ? [Math.min(...values), Math.max(...values)] : null;
}

/**
 * False only when the margin colours compare the reference product with its own cell and no free cell beats it:
 * the toolbar then says so next to the scale.
 */
export function hexAnyBetter(view: PlayerView, ref: HexReference | null | undefined, lens: HexLens, delta = false): boolean {
  const marginDelta = delta && hexReferenceIsRelative(ref);
  return !marginDelta || lens !== 'margin'
    || (view.hexes?.free ?? []).some((id) => { const v = hexLensValue(view, ref, id, 'margin', marginDelta); return v !== null && v > 0; });
}

/** Interpolation keeps tied estimates together; identical margins use the middle colour. */
export function hexMarginQuintiles(view: PlayerView, ref: HexReference | null | undefined, delta = false): HexQuintiles | null {
  const values = freeLensValues(view, ref, 'margin', delta).sort((a, b) => a - b);
  if (!values.length) return null;
  return [0, .2, .4, .6, .8, 1].map((fraction) => {
    const index = (values.length - 1) * fraction;
    const lower = Math.floor(index), upper = Math.ceil(index);
    return values[lower] + (values[upper] - values[lower]) * (index - lower);
  }) as HexQuintiles;
}

export function hexLensColor(value: number | null, lens: HexLens, range: [number, number] | HexQuintiles | null): string {
  if (value === null || !Number.isFinite(value) || lens === 'plain') return HEX_NEUTRAL;
  const min = range?.[0] ?? 0, max = range?.[range.length - 1] ?? 0;
  const step = !range || min === max ? 2
    : range.length === 6 ? Math.min(4, range.slice(1, 5).filter((boundary) => value >= boundary).length)
    : Math.max(0, Math.min(4, Math.floor(5 * (value - min) / (max - min))));
  return HEX_PALETTES[lens][step];
}

/** Six vertices use the engine radius and the same km-to-pixel projection as BaseMap. */
export function hexPolygon(hex: HexDef, proj: MapScale): string {
  if (hex.id.startsWith('S-')) return hexParcel(hex, proj);
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (60 * i - 90) * Math.PI / 180;
    return `${proj.px(hex.x + HEX_R * Math.cos(angle)).toFixed(2)},${proj.py(hex.y + HEX_R * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

/**
 * Drawn outline of a cell: the engine's hex, made to look like a parcel on a real map. Each corner moves by a
 * deterministic hash of its position and each edge bulges a little, so neighbours share exactly the same border
 * (no gap, no overlap) and the drawing never changes between renders. Purely visual: ids, adjacency, distances and
 * the cell centre stay the engine's.
 */
const PARCEL_JITTER = 0.26;
const PARCEL_BULGE = 0.12;
const PARCEL_STEPS = 4;
type Km = { x: number; y: number };
const unitHash = (key: string): number => fnv1a(key) / 4294967296;
const cornerKm = (hex: HexDef, i: number): Km => {
  const angle = (60 * i - 90) * Math.PI / 180;
  return { x: hex.x + HEX_R * Math.cos(angle), y: hex.y + HEX_R * Math.sin(angle) };
};
const cornerKey = (p: Km): string => `${Math.round(p.x * 4)},${Math.round(p.y * 4)}`;
/** How far a corner on the edge of the grid is pushed out, so border parcels reach the coast (the land clip trims them). */
const PARCEL_REACH = 1.7;
/** Centres of the cells around each corner: fewer than three means the corner is on the edge of the grid. */
const CORNER_CELLS = (() => {
  const map = new Map<string, Km[]>();
  for (const hex of HEXES) for (let i = 0; i < 6; i++) {
    const key = cornerKey(cornerKm(hex, i));
    const list = map.get(key);
    if (list) list.push({ x: hex.x, y: hex.y }); else map.set(key, [{ x: hex.x, y: hex.y }]);
  }
  return map;
})();
function jitteredCorner(p: Km): Km {
  const key = cornerKey(p);
  const around = CORNER_CELLS.get(key) ?? [];
  if (around.length > 0 && around.length < 3) {
    // Edge of the grid: push away from the cells that share the corner, the same way for each of them.
    const cx = around.reduce((s, c) => s + c.x, 0) / around.length, cy = around.reduce((s, c) => s + c.y, 0) / around.length;
    const length = Math.hypot(p.x - cx, p.y - cy) || 1;
    return { x: p.x + ((p.x - cx) / length) * PARCEL_REACH * HEX_R, y: p.y + ((p.y - cy) / length) * PARCEL_REACH * HEX_R };
  }
  const angle = unitHash(`a${key}`) * 2 * Math.PI;
  const r = Math.sqrt(unitHash(`r${key}`)) * PARCEL_JITTER * HEX_R;
  return { x: p.x + r * Math.cos(angle), y: p.y + r * Math.sin(angle) };
}

/** Parcel outline in km, PARCEL_STEPS points per edge, starting at the top corner. */
export function hexParcelKm(hex: HexDef): Km[] {
  if (hex.id.startsWith('S-')) {
    const half = SQUARE_SIZE / 2;
    return [{ x: hex.x - half, y: hex.y - half }, { x: hex.x + half, y: hex.y - half },
      { x: hex.x + half, y: hex.y + half }, { x: hex.x - half, y: hex.y + half }];
  }
  const corners = Array.from({ length: 6 }, (_, i) => cornerKm(hex, i));
  const points: Km[] = [];
  for (let i = 0; i < 6; i++) {
    const a = corners[i], b = corners[(i + 1) % 6];
    const ka = cornerKey(a), kb = cornerKey(b);
    const start = jitteredCorner(a), end = jitteredCorner(b);
    // The bulge is computed in a canonical edge order so both neighbours bend the border the same way.
    const [p, q] = ka < kb ? [start, end] : [end, start];
    const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const bulge = (unitHash(`e${ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`}`) * 2 - 1) * PARCEL_BULGE * HEX_R;
    const control = { x: (p.x + q.x) / 2 - ((q.y - p.y) / length) * bulge * 2, y: (p.y + q.y) / 2 + ((q.x - p.x) / length) * bulge * 2 };
    for (let s = 0; s < PARCEL_STEPS; s++) {
      const t = s / PARCEL_STEPS;
      points.push({
        x: (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * end.x,
        y: (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * end.y,
      });
    }
  }
  return points;
}

/** Parcel outline projected like hexPolygon, for the SVG `points` attribute. */
export function hexParcel(hex: HexDef, proj: MapScale): string {
  return hexParcelKm(hex).map((p) => `${proj.px(p.x).toFixed(2)},${proj.py(p.y).toFixed(2)}`).join(' ');
}

/** Arrow movement chooses a real adjacent cell in the requested direction, preserving the island. */
export function hexArrowTarget(id: string, key: string, allowed: (id: string) => boolean = () => true): string | null {
  const from = hexById(id);
  if (!from) return null;
  const direction = key === 'ArrowRight' ? [1, 0] : key === 'ArrowLeft' ? [-1, 0] : key === 'ArrowUp' ? [0, -1] : key === 'ArrowDown' ? [0, 1] : null;
  if (!direction) return null;
  const candidates = neighbors(id).filter((h) => allowed(h.id)).map((h) => {
    const dx = h.x - from.x, dy = h.y - from.y;
    return { h, alignment: (dx * direction[0] + dy * direction[1]) / Math.hypot(dx, dy) };
  }).filter((c) => c.alignment > 0.1).sort((a, b) => b.alignment - a.alignment || a.h.q - b.h.q);
  return candidates[0]?.h.id ?? null;
}
