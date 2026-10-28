import type { CloseRecap, CloseRecapFact, CommodityId, HexBid, HexBidOutcome, PlayerView } from '@muchomoney/core';
import type { MapIntent } from './mapIntent';

/** Whole-k balances plus an explicit rounding residue keep cash + portfolio − loan equal to net worth. */
export function displayedFortuneBalances(fortune: NonNullable<CloseRecap['fortune']>, netWorth: number) {
  const wholeK = (n: number) => Math.round(n) || 0;
  const side = (cash: number, portfolio: number, debt: number, worth: number) => {
    const values = { cash: wholeK(cash), portfolio: wholeK(portfolio), debt: wholeK(debt), netWorth: wholeK(worth) };
    return { ...values, rounding: values.netWorth - (values.cash + values.portfolio - values.debt) };
  };
  return {
    after: side(fortune.cashAfter, fortune.portfolioAfter, fortune.debtAfter, netWorth),
    before: fortune.cashBefore === undefined || fortune.portfolioBefore === undefined || fortune.debtBefore === undefined || fortune.netWorthBefore === undefined
      ? undefined : side(fortune.cashBefore, fortune.portfolioBefore, fortune.debtBefore, fortune.netWorthBefore),
  };
}

/** All amounts are whole k (rounded like the display), so the displayed lines add up to the displayed change. */
export function displayedFortuneBreakdown(change: number, breakdown: NonNullable<CloseRecap['breakdown']>) {
  const cents = (amount: number) => Math.round(amount) || 0;
  const total = cents(change);
  const sharePrices = cents(breakdown.sharePrices);
  const dividendsAndBonuses = cents(breakdown.dividendsAndBonuses);
  const personalCosts = cents(breakdown.personalCosts);
  return {
    total,
    sharePrices,
    dividendsAndBonuses,
    personalCosts,
    otherMovements: total - sharePrices - dividendsAndBonuses - personalCosts,
  };
}

/** Old saves have exact fortune history, but no frozen company facts. */
export function latestCloseRecap(view: PlayerView): CloseRecap | undefined {
  // Pending bot claims and spectators have no personal access yet; do not rebuild a personal recap for them.
  if (!view.self) return undefined;
  if (view.self?.closeRecap) return view.self.closeRecap;
  const history = view.players.find((player) => player.id === view.you)?.netWorthHistory;
  if (!history?.length) return undefined;
  const turn = history.length;
  return {
    turn,
    netWorth: history[turn - 1],
    ...(turn > 1 ? { previousNetWorth: history[turn - 2] } : {}),
    facts: [],
  };
}

/**
 * One of the viewer's own bids settled at the recap's close (board cell or deposit), read from their private view
 * only: their own amounts, plus the public price and bidder count. Bids still pending (lost control included) stay in
 * the pending-decisions panel.
 */
export interface RecapBid {
  key: string;
  kind: HexBid['kind'] | 'deposit';
  outcome: HexBidOutcome;
  companyId: string;
  /** Product or launch project; absent for a deposit. */
  name?: string;
  /** Cell bid on (board), or the deposit's cell-less slot. */
  hexId?: string;
  /** A different cell obtained (fallback, forced incubator placement). */
  obtainedHexId?: string;
  slotId?: string;
  commodityId?: CommodityId;
  /** What the viewer paid for the land or deposit (0 when nothing was paid). */
  paid: number;
  /**
   * A launch that obtained a cell also paid its sector's launch cost at that close (public sector table). A move's
   * factory move cost is not shown: it depended on the capacity at the close and is not kept in the view.
   */
  launchCost?: number;
  /** Public winning price on the cell or deposit bid on, when somebody else won it (a fallback names both prices). */
  publicPrice?: number;
  bidders: number;
  /** Engine line, verbatim (incubator deadline). */
  note?: string;
  /** A start-up's land bid lost or abandoned: it stays at the incubator. */
  incubatorStays: boolean;
  /** « Voir sur la carte »: the cell (obtained, else bid on) or the deposit. */
  intent: MapIntent;
}

export function recapBids(view: PlayerView, recap: CloseRecap): RecapBid[] {
  const awards = view.hexes?.results ?? [];
  const company = (id: string) => view.companies.find((c) => c.id === id);
  const hex = (view.self?.hexBids ?? []).filter((bid) => bid.result && bid.turn === recap.turn && bid.playerId === view.you)
    .map((bid, index): RecapBid => {
      const result = bid.result!;
      const obtained = result.hexId && result.hexId !== bid.hexId ? result.hexId : undefined;
      const award = awards.find((a) => a.hexId === bid.hexId && a.companyId !== bid.companyId);
      const obtainedCell = result.outcome === 'won' || result.outcome === 'fallback';
      const paid = obtainedCell ? result.price : 0;
      const launchCost = obtainedCell && (bid.kind === 'launch' || bid.kind === 'factory')
        ? view.sectors.find((s) => s.id === (bid.project?.sectorId ?? company(bid.companyId)?.products.find(p => p.id === bid.productId)?.sectorId))?.launchCost : undefined;
      return {
        key: `hex:${index}:${bid.companyId}:${bid.hexId}`,
        kind: bid.kind,
        outcome: result.outcome,
        companyId: bid.companyId,
        name: bid.project?.name ?? company(bid.companyId)?.products.find((p) => p.id === bid.productId)?.name,
        hexId: bid.hexId,
        ...(obtained ? { obtainedHexId: obtained } : {}),
        paid,
        ...(launchCost !== undefined ? { launchCost } : {}),
        ...(award ? { publicPrice: award.price } : {}),
        bidders: result.bidders,
        ...(result.note ? { note: result.note } : {}),
        incubatorStays: result.outcome === 'abandoned' && !!result.note,
        intent: { kind: 'cell', hexId: result.hexId ?? bid.hexId },
      };
    });
  const sites = (view.self?.siteBids ?? []).filter((bid) => bid.result && bid.turn === recap.turn && bid.playerId === view.you)
    .map((bid, index): RecapBid => {
      const result = bid.result!;
      return {
        key: `site:${index}:${bid.companyId}:${bid.slotId}`,
        kind: 'deposit',
        outcome: result.outcome,
        companyId: bid.companyId,
        slotId: bid.slotId,
        commodityId: bid.commodityId,
        paid: result.outcome === 'won' ? result.price : 0,
        // A lost deposit auction still has its public adjudication price.
        ...(result.outcome === 'lost' ? { publicPrice: result.price } : {}),
        bidders: result.bidders,
        incubatorStays: false,
        intent: { kind: 'deposit', companyId: bid.companyId, slotId: bid.slotId },
      };
    });
  return [...hex, ...sites];
}

/** Something in this recap calls for a decision: it opens after its close even when the player keeps recaps folded. */
export function recapNeedsAttention(recap: CloseRecap, bids: readonly RecapBid[]): boolean {
  if (bids.length > 0) return true;
  if (recap.facts.some((fact) => fact.type === 'bankruptcy' || fact.type === 'takeover' || fact.type === 'fines' || fact.type === 'stock')) return true;
  if (recap.previousNetWorth === undefined) return false;
  const base = Math.abs(recap.previousNetWorth);
  return base > 1e-9 && Math.abs(recap.netWorth - recap.previousNetWorth) / base >= RECAP_FORTUNE_ATTENTION;
}

/** A fortune move of this share since the previous close opens the recap. */
export const RECAP_FORTUNE_ATTENTION = 0.05;

export type RecapItem = { fact: CloseRecapFact } | { bid: RecapBid };

/** Severity of a recap line, lowest first: the folded recap shows the worst one, then « +n » naming the others. */
function severity(item: RecapItem): number {
  if ('bid' in item) return item.bid.outcome === 'won' ? 6 : 3;
  switch (item.fact.type) {
    case 'bankruptcy': return 0;
    case 'takeover': return 1;
    case 'fines': return 2;
    case 'stock': return 4;
    case 'netProfit': return 5;
    case 'firstSales': return 7;
  }
}

/**
 * The folded recap line: its most severe fact (bankruptcy > takeover > fines > bid not won > stock > profit), and the
 * others, worst first (« +n », named in its tooltip). Equal severities keep the recap's order.
 */
export function recapHeadline(recap: CloseRecap, bids: readonly RecapBid[]): { item: RecapItem; rest: RecapItem[] } | null {
  const items: RecapItem[] = [...recap.facts.map((fact) => ({ fact })), ...bids.map((bid) => ({ bid }))];
  if (items.length === 0) return null;
  const [item, ...rest] = items.map((entry, index) => ({ entry, index }))
    .sort((x, y) => severity(x.entry) - severity(y.entry) || x.index - y.index)
    .map(({ entry }) => entry);
  return { item, rest };
}
