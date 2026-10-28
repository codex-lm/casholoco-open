/** The viewer's unresolved decisions, shared by the close summary and the hex bids list. */
import {
  isSpatialMap, type Action, type Cartel, type ClosePlan, type CompanyView, type HexBid, type Offer, type PlayerView,
  type ProductView, type SiteBid,
} from '@muchomoney/core';
import { liveHexBids } from './city/privacy';
import type { MapIntent } from './mapIntent';

export interface PendingDecision {
  key: string;
  /** Absent for personal share offers and offers concerning a company no longer controlled. */
  companyId?: string;
  kind: 'launch' | 'move' | 'startup' | 'land' | 'factory' | 'deposit' | 'offer' | 'received-offer' | 'leaving';
  /** Maximum close payment, or conditional personal share purchase; null means no known upfront payment. */
  amount: number | null;
  bid?: HexBid;
  siteBid?: SiteBid;
  offer?: Offer;
  cartel?: Cartel;
  intent?: MapIntent;
  withdraw?: Action;
}

export interface PaidDecision {
  key: string;
  companyId: string;
  kind: 'launch' | 'capacity';
  product: ProductView;
  /** The view carries construction details, not historical cash payments. */
  amount: null;
  lots?: number;
}

/** One of my bids still pending for a company I no longer control: it fails at the close and cannot be withdrawn. */
export interface LostControlBid {
  key: string;
  companyId: string;
  bid?: HexBid;
  siteBid?: SiteBid;
}

export interface PendingCompanyDecisions {
  company: CompanyView;
  items: PendingDecision[];
  paid: PaidDecision[];
  /** Actual company auction commitments only: conditional offers are excluded. */
  total: number;
  hexTotal: number;
  closePlan?: ClosePlan;
}

export interface PendingDecisions {
  /** Sent/withdrawable decisions plus cartel departures; incoming offers are listed separately. */
  items: PendingDecision[];
  groups: PendingCompanyDecisions[];
  personal: PendingDecision[];
  received: PendingDecision[];
  paid: PaidDecision[];
  /** Shown apart, never counted nor withdrawable (the close recap reports only settled bids). */
  lostControl: LostControlBid[];
  /** Live withdrawable items; departures and incoming offers do not inflate the button count. */
  count: number;
  /** Company bids only. Personal conditional purchases belong to personalTotal. */
  total: number;
  personalTotal: number;
}

/** The quarter overview includes funded construction and incoming offers, not just withdrawable bids. */
export function quarterDecisionCount(model: PendingDecisions): number {
  return model.items.length + model.received.length + model.paid.length + model.lostControl.length;
}

/** Also distinguishes the historical forced placement following an abandoned start-up re-bid. */
export function hexBidKey(bid: HexBid): string {
  const identity = bid.kind === 'factory' ? `${bid.productId}:${bid.hexId}` : bid.productId ?? bid.project?.id ?? bid.hexId;
  return `${bid.companyId}:${identity}:${bid.turn}:${bid.result?.outcome ?? 'pending'}:${bid.result?.hexId ?? ''}`;
}

function nonNegative(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : null;
}

function hexDecision(view: PlayerView, company: CompanyView, bid: HexBid): PendingDecision {
  const product = company.products.find((p) => p.id === bid.productId);
  const extra = bid.kind === 'startup' || bid.kind === 'land' ? 0
    : bid.kind === 'factory' ? view.sectors.find(s => s.id === product?.sectorId)?.launchCost
    : bid.kind === 'launch' ? view.sectors.find((s) => s.id === bid.project?.sectorId)?.launchCost
      : product?.private?.hexes?.moveCost ?? product?.private?.zones.moveCost;
  const land = nonNegative(bid.amount);
  const cost = nonNegative(extra);
  const intent: MapIntent | undefined = bid.kind === 'launch'
    ? { kind: 'launch', companyId: bid.companyId, hexId: bid.hexId }
    : bid.kind === 'move' || bid.kind === 'startup' ? { kind: 'move', productId: bid.productId! }
      : { kind: 'launch', companyId: bid.companyId, hexId: bid.hexId };
  const withdraw: Action | undefined = bid.kind === 'launch'
    ? bid.project ? { type: 'cancelHexBid', companyId: bid.companyId, projectId: bid.project.id } : undefined
    : bid.kind === 'move' || bid.kind === 'startup' ? { type: 'cancelHexBid', companyId: bid.companyId, productId: bid.productId! }
      : { type: 'cancelHexBid', companyId: bid.companyId, hexId: bid.hexId };
  return {
    key: `hex:${hexBidKey(bid)}`, companyId: bid.companyId, kind: bid.kind,
    amount: land !== null && cost !== null ? land + cost : null,
    bid, intent, withdraw,
  };
}

function sumAmounts(items: readonly PendingDecision[]): number {
  return items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
}

/** Pure extraction: only viewer-private, currently controlled company decisions are attributed to company cash. */
export function pendingDecisions(view: PlayerView): PendingDecisions {
  const controlled = new Map(view.companies
    .filter((company) => company.private !== undefined && company.controllerId === view.you && company.status === 'active')
    .map((company) => [company.id, company]));
  const items: PendingDecision[] = [];
  const received: PendingDecision[] = [];
  const paid: PaidDecision[] = [];

  for (const bid of liveHexBids(view)) {
    const company = controlled.get(bid.companyId);
    if (company && bid.playerId === view.you) items.push(hexDecision(view, company, bid));
  }
  for (const bid of view.self?.siteBids ?? []) {
    if (bid.result || bid.playerId !== view.you || !controlled.has(bid.companyId)) continue;
    items.push({
      key: `site:${bid.companyId}:${bid.commodityId}:${bid.turn}:${bid.slotId}`,
      companyId: bid.companyId, kind: 'deposit', amount: nonNegative(bid.amount), siteBid: bid,
      intent: { kind: 'deposit', companyId: bid.companyId, slotId: bid.slotId },
      withdraw: { type: 'cancelSiteBid', companyId: bid.companyId, commodityId: bid.commodityId },
    });
  }
  for (const offer of view.self?.offers ?? []) {
    if (offer.status !== 'pending' || offer.turn !== view.turn) continue;
    if (offer.fromId === view.you) {
      const source = offer.kind === 'shares' ? undefined
        : offer.kind === 'contract'
          ? controlled.has(offer.sellerCompanyId) ? offer.sellerCompanyId : offer.buyerCompanyId
          : offer.companyId;
      items.push({
        key: `offer:${offer.id}`, kind: 'offer', companyId: source && controlled.has(source) ? source : undefined,
        amount: offer.kind === 'shares' && offer.side === 'buy' ? nonNegative(offer.shares * offer.price) : null,
        offer, withdraw: { type: 'cancelOffer', offerId: offer.id },
      });
    } else if (offer.toId === view.you) {
      received.push({ key: `received:${offer.id}`, kind: 'received-offer', amount: null, offer });
    }
  }
  for (const cartel of view.self?.cartels ?? []) {
    for (const member of cartel.members) {
      if (!member.leaving || member.controllerId !== view.you || !controlled.has(member.companyId)) continue;
      items.push({ key: `leaving:${cartel.id}:${member.companyId}`, companyId: member.companyId, kind: 'leaving', amount: null, cartel });
    }
  }
  for (const company of controlled.values()) {
    for (const product of company.products) {
      if (!product.private) continue;
      // A hex launch shown as comingSoon was paid at the previous close, not during this quarter.
      if (!isSpatialMap(view.config) && product.comingSoon && product.launchedTurn === view.turn) {
        paid.push({ key: `paid:launch:${product.id}`, companyId: company.id, kind: 'launch', product, amount: null });
      } else if (!product.comingSoon && product.private.pendingCapacity > 0) {
        paid.push({ key: `paid:capacity:${product.id}`, companyId: company.id, kind: 'capacity', product, amount: null, lots: product.private.pendingCapacity });
      }
    }
  }

  const lostControl: LostControlBid[] = [];
  for (const bid of view.self?.hexBids ?? []) {
    if (!bid.result && bid.playerId === view.you && !controlled.has(bid.companyId)) lostControl.push({ key: `lost:hex:${hexBidKey(bid)}`, companyId: bid.companyId, bid });
  }
  for (const bid of view.self?.siteBids ?? []) {
    if (!bid.result && bid.playerId === view.you && !controlled.has(bid.companyId)) {
      lostControl.push({ key: `lost:site:${bid.companyId}:${bid.commodityId}:${bid.turn}:${bid.slotId}`, companyId: bid.companyId, siteBid: bid });
    }
  }

  const groups = [...controlled.values()].map((company): PendingCompanyDecisions => {
    const companyItems = items.filter((item) => item.companyId === company.id);
    const bids = companyItems.filter((item) => item.bid || item.siteBid);
    return {
      company, items: companyItems, paid: paid.filter((item) => item.companyId === company.id),
      total: sumAmounts(bids), hexTotal: sumAmounts(bids.filter((item) => item.bid)),
      closePlan: company.private?.closePlan,
    };
  }).filter((group) => group.items.length > 0 || group.paid.length > 0);
  const personal = items.filter((item) => item.companyId === undefined);
  return {
    items, groups, personal, received, paid, lostControl,
    count: items.filter((item) => item.withdraw !== undefined).length,
    total: groups.reduce((sum, group) => sum + group.total, 0),
    personalTotal: sumAmounts(personal),
  };
}
