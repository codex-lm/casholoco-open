/** Map overlays from the redacted view: plans, possible supply links, and published sales. No stock provenance. */
import {
  CITY_IDS, DEFAULT_ZONE, ISLAND, SECTORS, ZONES, hexById, hexTransportRoute, roadNode, roadRoute, zoneOf,
  capitalCellId, isSpatialMap, type CityId, type CommodityId, type CompanyView, type HexTransportRoute,
  type MapPoint, type PlayerView, type ProductView, type SectorId, type ZoneId,
} from '@muchomoney/core';
import { isOwn, ownCompany, ownContracts, ownProduct } from './privacy';

/** 'off' (the default) leaves both maps exactly as they are without the layers. */
export type FlowMode = 'off' | 'production' | 'supply' | 'sales';
export const FLOW_MODES: readonly FlowMode[] = ['off', 'production', 'supply', 'sales'];
export type FlowRoute = HexTransportRoute;

export interface FactoryFlow {
  id: string;
  companyId: string;
  companyName: string;
  productId: string;
  name: string;
  sectorId: SectorId;
  color: string;
  mine: boolean;
  point: MapPoint;
  hexId?: string;
  zoneId: ZoneId;
  /** Controller-only figures; null for rivals, spectators, and unavailable old-view estimates. */
  stock: number | null;
  planned: number | null;
  demand: number | null;
  estimatedSales: number | null;
  /** Estimated unsold lots before perishability, not a realized stock figure. */
  surplus: number | null;
  lastSold: number;
  intangible: boolean;
}

export interface FlowSource {
  id: string;
  /** Deposit name from the view; the port is named by the UI, in the interface language. */
  name?: string;
  type: 'deposit' | 'port';
  point: MapPoint;
  /** A possible itinerary, never an assignment of physical stock or delivered volume. */
  route?: FlowRoute;
  capacity?: number;
  /** Capacity remaining after this company's outgoing contracts, not lots assigned to this product. */
  availableCapacity?: number;
  contractedOut?: number;
}

export interface SupplyFlow {
  id: string;
  companyId: string;
  companyName: string;
  productId: string;
  name: string;
  color: string;
  mine: true;
  point: MapPoint;
  commodityId: CommodityId;
  /** Recipe × planned whole lots for this product. */
  need: number;
  /** Shared company stock. It is not reserved separately for each product. */
  stock: number;
  companyNeed: number;
  /** Company-wide expected shortage after its close-plan extraction and own contracts; null without that plan. */
  missing: number | null;
  stockScope: 'company';
  intangible: boolean;
  sources: FlowSource[];
}

export interface SalesFlow {
  id: string;
  companyId: string;
  companyName: string;
  productId: string;
  name: string;
  color: string;
  mine: boolean;
  point: MapPoint;
  cityId?: CityId;
  /** The customer city's position, set for every city line (also without a route, e.g. crypto). */
  destination?: MapPoint;
  sold: number;
  /** True when the view has no published city breakdown. Never invent city destinations. */
  national: boolean;
  intangible: boolean;
  originKnown: boolean;
  /** Quarter of the recorded factory position, absent for old views without that history. */
  turn?: number;
  /** Uses the recorded sales origin, never substitutes a factory that has since moved. */
  route?: FlowRoute;
}

export interface FlowModel {
  selectedProductId: string | null;
  production: FactoryFlow[];
  supply: SupplyFlow[];
  sales: SalesFlow[];
}

const pointCopy = ({ x, y }: MapPoint): MapPoint => ({ x, y });
const nonnegative = (value: number | undefined): number => Number.isFinite(value) ? Math.max(0, value!) : 0;
const optionalNumber = (value: number | undefined): number | null => Number.isFinite(value) ? Math.max(0, value!) : null;
const plannedLots = (product: ProductView): number | null => {
  const own = ownProduct(product);
  if (!own) return null;
  const { production } = own;
  return Math.floor(Math.min(nonnegative(production), nonnegative(product.capacity)));
};

function factoryPoint(view: PlayerView, product: ProductView): { point: MapPoint; hexId?: string; zoneId: ZoneId } | null {
  const zoneId = zoneOf(product).id;
  if (!isSpatialMap(view.config)) return { point: pointCopy(ZONES[zoneId]), zoneId };
  const hexId = product.hexId ?? capitalCellId(view.config);
  const hex = hexById(hexId);
  if (!hex) return null;
  const point = hex.terrain === 'island'
    ? { x: ISLAND.reduce((sum, p) => sum + p.x, 0) / ISLAND.length,
      y: ISLAND.reduce((sum, p) => sum + p.y, 0) / ISLAND.length }
    : pointCopy(hex);
  return { point, hexId, zoneId };
}

/** Route in the product → node direction, with the same route choice and cost as the engine. */
function routeTo(view: PlayerView, product: ProductView, nodeId: string): FlowRoute | undefined {
  if (SECTORS[product.sectorId].intangible) return undefined;
  if (isSpatialMap(view.config)) return hexTransportRoute(product.hexId ?? capitalCellId(view.config), nodeId);
  const road = roadRoute(zoneOf(product).id, nodeId);
  if (!road) return undefined;
  return { points: road.points.map(pointCopy), km: road.km, cost: road.cost,
    segments: [{ kind: 'road', points: road.points.map(pointCopy), km: road.km, cost: road.cost }] };
}

function reverseRoute(route: FlowRoute | undefined): FlowRoute | undefined {
  if (!route) return undefined;
  return { ...route, points: [...route.points].reverse().map(pointCopy),
    segments: [...route.segments].reverse().map((segment) => ({ ...segment,
      points: [...segment.points].reverse().map(pointCopy) })) };
}

function factoryFlow(view: PlayerView, company: CompanyView, product: ProductView): FactoryFlow | null {
  const location = factoryPoint(view, product);
  if (!location) return null;
  const own = isOwn(company) && company.controllerId === view.you ? ownProduct(product) : null;
  const { stock, estimate } = own ?? {};
  const planned = own ? plannedLots(product) : null;
  const demand = own && !product.comingSoon ? optionalNumber(estimate?.demand) : null;
  const available = own ? nonnegative(stock) + (planned ?? 0) : 0;
  return {
    id: product.id, companyId: company.id, companyName: company.name, productId: product.id,
    name: product.name, sectorId: product.sectorId,
    color: company.color,
    mine: own !== null, ...location,
    stock: own ? nonnegative(stock) : null, planned, demand,
    estimatedSales: own && !product.comingSoon && estimate ? Math.min(available, nonnegative(estimate.sales)) : null,
    surplus: demand === null ? null : Math.max(0, available - demand),
    lastSold: nonnegative(product.lastSales), intangible: SECTORS[product.sectorId].intangible === true,
  };
}

function companyInputs(view: PlayerView, company: CompanyView) {
  const own = ownCompany(company);
  if (!own) return null;
  const { inventory, closePlan } = own;
  const companyNeeds = new Map<CommodityId, number>();
  for (const product of company.products) {
    const planned = plannedLots(product);
    if (planned === null) continue;
    for (const [cid, per] of Object.entries(SECTORS[product.sectorId].inputs) as [CommodityId, number][]) {
      companyNeeds.set(cid, (companyNeeds.get(cid) ?? 0) + planned * per);
    }
  }
  const activeContracts = ownContracts(view).filter((contract) => contract.turnsLeft > 0
    && view.companies.some((c) => c.id === contract.sellerCompanyId && c.status === 'active')
    && view.companies.some((c) => c.id === contract.buyerCompanyId && c.status === 'active'));
  return { inventory, closePlan, companyNeeds, activeContracts };
}

function supplyFlows(view: PlayerView, company: CompanyView, product: ProductView, factory: FactoryFlow): SupplyFlow[] {
  if (!factory.mine || !(factory.planned! > 0)) return [];
  const data = companyInputs(view, company);
  if (!data) return [];
  const { inventory, closePlan, companyNeeds, activeContracts } = data;
  return (Object.entries(SECTORS[product.sectorId].inputs) as [CommodityId, number][]).flatMap(([cid, per]) => {
    const need = factory.planned! * nonnegative(per);
    if (!(need > 0)) return [];
    const stock = nonnegative(inventory[cid]?.lots);
    const outgoing = activeContracts.filter((c) => c.sellerCompanyId === company.id && c.commodityId === cid)
      .reduce((sum, c) => sum + nonnegative(c.lots), 0);
    const incoming = activeContracts.filter((c) => c.buyerCompanyId === company.id && c.commodityId === cid)
      .reduce((sum, c) => sum + nonnegative(c.lots), 0);
    const companyNeed = companyNeeds.get(cid) ?? 0;
    // The engine's carriage rule (siteSupply, then transportPerLot): each site, in company order, first reserves the
    // lots owed on outgoing contracts, then serves the company's planned need; only what is left comes from the port.
    // A site the earlier ones already cover, or a port with nothing left to ship, is not a source this quarter.
    let owed = outgoing;
    let fromPort = companyNeed;
    const sources: FlowSource[] = [];
    for (const site of company.sites ?? []) {
      if (site.commodityId !== cid || site.dormant || site.activeFrom > view.turn) continue;
      const capacity = Math.floor(nonnegative(site.capacity));
      const contractedOut = Math.min(capacity, owed);
      owed -= contractedOut;
      const used = Math.min(fromPort, capacity - contractedOut);
      fromPort -= used;
      const point = roadNode(site.id);
      if (!(used > 0) || !point) continue;
      sources.push({ id: site.id, name: site.name, type: 'deposit', point: pointCopy(point),
        capacity, contractedOut, availableCapacity: capacity - contractedOut,
        ...(factory.intangible ? {} : { route: reverseRoute(routeTo(view, product, site.id)) }) });
    }
    if (fromPort > 1e-9) {
      sources.push({ id: DEFAULT_ZONE, type: 'port', point: pointCopy(ZONES[DEFAULT_ZONE]),
        ...(factory.intangible ? {} : { route: reverseRoute(routeTo(view, product, DEFAULT_ZONE)) }) });
    }
    const extraction = closePlan?.sites.filter((s) => s.commodityId === cid)
      .reduce((sum, s) => sum + nonnegative(s.needed) + nonnegative(s.surplus), 0);
    // Contracts are a forecast of complete deliveries, as in the commodities panel; they can fail at resolution.
    const missing = extraction === undefined ? null : Math.max(0,
      companyNeed - (stock + extraction - Math.min(outgoing, stock + extraction) + incoming));
    return [{ id: `${product.id}:${cid}`, companyId: company.id, companyName: company.name,
      productId: product.id, name: product.name, color: factory.color, mine: true as const, point: pointCopy(factory.point),
      commodityId: cid, need, stock, companyNeed, missing, stockScope: 'company' as const,
      intangible: factory.intangible, sources }];
  });
}

function salesFlows(view: PlayerView, company: CompanyView, product: ProductView, factory: FactoryFlow): SalesFlow[] {
  const origin = product.lastSalesOrigin;
  const originKnown = !!origin && (!isSpatialMap(view.config) || !!origin.hexId && !!hexById(origin.hexId));
  const soldProduct = originKnown ? { ...product, zoneId: origin.zoneId, hexId: origin.hexId } : product;
  const location = originKnown ? factoryPoint(view, soldProduct) : null;
  const base = { companyId: company.id, companyName: company.name, productId: product.id, name: product.name,
    color: factory.color, mine: factory.mine, point: pointCopy(location?.point ?? factory.point), intangible: factory.intangible,
    originKnown, ...(originKnown ? { turn: origin.turn } : {}) };
  const breakdown = product.lastSalesByCity;
  if (!breakdown) return [{ ...base, id: `${product.id}:national`, sold: factory.lastSold, national: true }];
  const cities = CITY_IDS.flatMap((cityId) => {
    const sold = nonnegative(breakdown[cityId]);
    const city = roadNode(cityId);
    return sold > 0 ? [{ ...base, id: `${product.id}:${cityId}`, cityId, sold, national: false,
      ...(city ? { destination: pointCopy(city) } : {}),
      ...(factory.intangible || !originKnown ? {} : { route: routeTo(view, soldProduct, cityId) }) }] : [];
  });
  // A known regional quarter with zero sales has no customer destinations and no moving arrows.
  return cities.length ? cities : [{ ...base, id: `${product.id}:none`, sold: 0, national: false }];
}

/** undefined selects the first own factory; null means no factory (e.g. a launch reference). */
export function buildMapFlowModel(view: PlayerView, productId?: string | null): FlowModel {
  const production: FactoryFlow[] = [];
  const supply: SupplyFlow[] = [];
  const sales: SalesFlow[] = [];
  const factories: { company: CompanyView; product: ProductView; factory: FactoryFlow }[] = [];
  for (const company of view.companies) {
    if (company.status !== 'active') continue;
    for (const product of company.products) {
      const factory = factoryFlow(view, company, product);
      if (!factory) continue;
      production.push(factory);
      factories.push({ company, product, factory });
    }
  }
  const selected = productId === undefined ? factories.find((f) => f.factory.mine)
    : productId === null ? undefined : factories.find((f) => f.factory.mine && f.product.id === productId);
  if (selected) {
    const { company, product, factory } = selected;
    supply.push(...supplyFlows(view, company, product, factory));
    sales.push(...salesFlows(view, company, product, factory));
  }
  return { selectedProductId: selected?.product.id ?? null, production, supply, sales };
}

/** Factories the layers can follow: the viewer's own, with the company name when several companies are involved. */
export function flowProductOptions(model: FlowModel): { id: string; label: string }[] {
  const own = model.production.filter((factory) => factory.mine);
  const several = new Set(own.map((factory) => factory.companyId)).size > 1;
  return own.map((factory) => ({ id: factory.productId, label: several ? `${factory.name} · ${factory.companyName}` : factory.name }));
}
