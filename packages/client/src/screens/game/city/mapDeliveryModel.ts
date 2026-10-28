/** Local origin → destination readings; the game still sells nationally and sends no action for these scenarios. */
import {
  CITY_IDS, SECTORS, TRANSPORT_COST_PER_KM, estimateDemandByCity, hexById, projectDemandToHexes, route,
  routeBetweenHexes, siteUnitCost, startingDecisions, boardCells, capitalCellId, type CityId, type PlayerView,
  type SectorId,
} from '@muchomoney/core';
import { hexEstimate, hexReferenceHexId, hexSupplyFreight, type HexLens, type HexQuintiles, type HexReference, type HexSupplyReference } from './hexModel';
import { launchFreight, productFreight } from './freight';
import { ownHexProduct } from './privacy';

export interface MapDeliveryEstimate {
  originId: string;
  destinationId: string;
  city: CityId | null;
  transport: number | null;
  /** Per delivered lot, before fixed costs and budgets; a material uses its current spot value. */
  margin: number | null;
  /** Factory: the conserved spatial projection at the destination. Subsidiary: material needs. */
  demand: number | null;
  /** Demand fully served at the destination, before fixed costs and shared budgets. */
  totalMargin: number | null;
  totalDemand?: number;
  recipientSector?: SectorId;
}

function totalDeliveryMargin(demand: number | null, margin: number | null): number | null {
  if (demand === null || margin === null || !Number.isFinite(demand) || !Number.isFinite(margin)) return null;
  const total = demand * margin;
  return Number.isFinite(total) ? total : null;
}

/** Each parcel serves the city cheapest to reach; plains and mountains do not invent new customer markets. */
export function deliveryMarket(hexId: string): CityId | null {
  if (!hexById(hexId)) return null;
  return CITY_IDS.reduce((best, city) => route(hexId, city) < route(hexId, best) ? city : best);
}

export function mapFactoryDelivery(view: PlayerView, ref: HexReference | null | undefined, destinationId: string): MapDeliveryEstimate | null {
  const originId = hexReferenceHexId(view, ref);
  const city = deliveryMarket(destinationId);
  if (!ref || !originId || !city) return null;
  const origin = hexEstimate(view, ref, originId);
  const { unitCost } = origin ?? { unitCost: NaN };
  const owned = ref.kind === 'product' ? ownHexProduct(view, ref.productId) : null;
  if (ref.kind === 'product' && !owned) return null;
  const sector = ref.kind === 'launch' ? ref.sectorId : owned!.product.sectorId;
  const transport = routeBetweenHexes(originId, destinationId) * TRANSPORT_COST_PER_KM * SECTORS[sector].freightWeight * (view.transportFactor ?? 1);
  const freight = owned ? productFreight(view, owned.company, owned.product, originId) : launchFreight(view, sector, originId);
  const price = owned?.product.price ?? startingDecisions(sector, SECTORS[sector].startingCapacity).price;
  let demand: number | null = null;
  const ownMarket = owned?.own.market;
  if (owned && ownMarket) {
    const { product, own } = owned;
    const atRealOrigin = originId === (product.hexId ?? capitalCellId(view.config));
    const market = { ...ownMarket, hexId: originId,
      ...(!atRealOrigin ? { rndMultiplier: 1, marketingMultiplier: 1, demandMultiplier: 1, priceMultiplier: 1 } : {}) };
    const byCity = estimateDemandByCity(sector, market, { ...product, ...own });
    if (origin?.demand !== null && origin?.demand !== undefined) demand = projectDemandToHexes(origin.demand, byCity, view.config)[destinationId];
  } else if (ref.kind === 'launch') {
    const launch = view.sectors.find((s) => s.id === sector)?.launchByHex?.[originId];
    if (launch?.demandByCity) demand = projectDemandToHexes(launch.demand, launch.demandByCity, view.config)[destinationId];
  }
  const margin = origin && Number.isFinite(transport) ? price - (unitCost - freight.deliveryCost + transport) : null;
  return { originId, destinationId, city, transport: Number.isFinite(transport) ? transport : null, demand, totalDemand: origin?.demand ?? undefined,
    margin, totalMargin: totalDeliveryMargin(demand, margin) };
}

export function mapSupplyDelivery(view: PlayerView, ref: HexSupplyReference, destinationId: string): MapDeliveryEstimate | null {
  if (!hexById(ref.originHexId) || !hexById(destinationId)) return null;
  const transport = hexSupplyFreight(view, ref, destinationId);
  const material = view.commodities.find((c) => c.id === ref.commodityId);
  const slotId = hexById(ref.originHexId)?.deposit;
  const site = view.companies.flatMap((c) => c.sites ?? []).find((s) => s.id === slotId && s.commodityId === ref.commodityId);
  const extraction = site?.currentUnitCost ?? siteUnitCost(ref.commodityId) * (material?.siteCostFactor ?? 1);
  // Only the viewer's own destination plans are known. A rival's production remains private.
  const destinationProduct = view.companies.flatMap((c) => c.products).find((p) => p.hexId === destinationId && ownHexProduct(view, p.id));
  const recipient = destinationProduct ? { kind: 'product' as const, productId: destinationProduct.id } : ref.recipient;
  const owned = recipient?.kind === 'product' ? ownHexProduct(view, recipient.productId) : null;
  const sector = recipient?.kind === 'launch' ? recipient.sectorId : owned?.product.sectorId;
  // A chosen recipient describes the product, not a factory occupying every inspected parcel.
  // Unknown rival plans stay unknown; a theoretical recipient must explicitly be placed here.
  const recipientOrigin = recipient ? hexReferenceHexId(view, recipient) : null;
  const locatedHere = Boolean(destinationProduct || recipientOrigin === destinationId);
  const planned = locatedHere && owned ? Math.max(0, Math.floor(Math.min(owned.own.production, owned.product.capacity)))
    : locatedHere && sector ? startingDecisions(sector, SECTORS[sector].startingCapacity).production : null;
  const demand = sector && planned !== null ? planned * (SECTORS[sector].inputs[ref.commodityId] ?? 0) : null;
  const margin = material && transport !== null ? material.price - extraction - transport : null;
  return { originId: ref.originHexId, destinationId, city: null, transport,
    demand, margin, totalMargin: totalDeliveryMargin(demand, margin), recipientSector: sector };
}

export function mapDeliveryEstimate(view: PlayerView, ref: HexReference | null | undefined, supply: HexSupplyReference | null | undefined, id: string) {
  return supply ? mapSupplyDelivery(view, supply, id) : mapFactoryDelivery(view, ref, id);
}

export function mapDeliveryLensValue(view: PlayerView, ref: HexReference | null | undefined, supply: HexSupplyReference | null | undefined, id: string, lens: HexLens): number | null {
  if (lens === 'plain') return null;
  const estimate = mapDeliveryEstimate(view, ref, supply, id);
  const value = estimate?.[lens === 'margin' ? 'totalMargin' : lens] ?? null;
  return value !== null && Number.isFinite(value) ? value : null;
}

export function mapDeliveryRange(view: PlayerView, ref: HexReference | null | undefined, supply: HexSupplyReference | null | undefined, lens: HexLens): [number, number] | HexQuintiles | null {
  const values = boardCells(view.config).flatMap((hex) => mapDeliveryLensValue(view, ref, supply, hex.id, lens) ?? []).sort((a, b) => a - b);
  if (!values.length) return null;
  if (lens !== 'margin') return [values[0], values.at(-1)!];
  return [0, .2, .4, .6, .8, 1].map((fraction) => {
    const index = (values.length - 1) * fraction, lower = Math.floor(index), upper = Math.ceil(index);
    return values[lower] + (values[upper] - values[lower]) * (index - lower);
  }) as HexQuintiles;
}
