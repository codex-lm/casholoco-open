import { useState } from 'react';
import { hexPlaceLabel } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useGame } from '../../hooks/useGame';
import { useContent, useRoomLang, useT } from '../../i18n';
import { useFmt } from '../../fmt';
import type { TabId } from '../GameScreen';
import type { MapIntent } from './mapIntent';
import type { PendingDecision } from './pendingDecisions';

export interface DecisionNavigation {
  openMapFor?: (intent: MapIntent) => void;
  goTo?: (tab: TabId) => void;
  onNavigate?: () => void;
}

/** Shared live row: the ready summary and My bids read the same commitment and withdrawal. */
export function PendingDecisionItem({ item, openMapFor, goTo, onNavigate, withdrawLabel }: DecisionNavigation & { item: PendingDecision; withdrawLabel?: string }) {
  const { view } = useGame();
  const t = useT();
  const d = t.pendingDecisions;
  const fmt = useFmt();
  const lang = useRoomLang();
  const content = useContent();
  const [busy, setBusy] = useState(false);
  const company = (id: string) => view.companies.find((c) => c.id === id)?.name ?? t.common.unknown;
  const player = (id: string) => view.players.find((p) => p.id === id)?.name ?? t.common.unknown;
  let label = '';
  let detail: string | null = null;
  let note: string | null = null;
  const bid = item.bid;
  if (bid) {
    const place = hexPlaceLabel(bid.hexId, lang, view.siteSlots);
    const name = bid.project?.name ?? view.companies.find((c) => c.id === bid.companyId)?.products.find((p) => p.id === bid.productId)?.name ?? t.common.unknown;
    label = bid.kind === 'land' || bid.kind === 'factory' ? `${t.hex.bidKind[bid.kind]}${bid.kind === 'factory' ? ` · ${name}` : ''} · ${place}`
      : bid.kind === 'launch' ? d.launch(name, place) : bid.kind === 'move' ? d.move(name, place) : d.startup(name, place);
  } else if (item.siteBid) {
    const site = item.siteBid;
    label = d.deposit(view.siteSlots.find((s) => s.id === site.slotId)?.name ?? site.slotId, content.commodities[site.commodityId].name);
  } else if (item.offer) {
    const o = item.offer;
    label = `${item.kind === 'received-offer' ? t.deals.from(player(o.fromId)) : t.deals.to(player(o.toId))} · ${t.deals.kinds[o.kind]}`;
    if (o.kind === 'shares') {
      detail = t.deals.sharesDeal(fmt.int(o.shares), company(o.companyId), fmt.sharePrice(o.price), fmt.money(o.shares * o.price));
      if (item.amount !== null) note = d.onAcceptance;
    } else if (o.kind === 'contract') {
      detail = t.deals.contract(company(o.sellerCompanyId), company(o.buyerCompanyId), fmt.int(o.lots), content.commodities[o.commodityId].name, fmt.money(o.price), o.turns);
      note = d.contractConditional;
    } else detail = t.deals.cartel(company(o.companyId), company(o.targetCompanyId), content.sectors[o.sectorId].name);
  } else if (item.cartel) label = d.leaving(content.sectors[item.cartel.sectorId].name);
  const canView = item.intent ? !!openMapFor : !!goTo;
  const withdraw = async () => {
    if (!item.withdraw || busy) return;
    setBusy(true);
    try { await sendAction(item.withdraw); }
    finally { setBusy(false); }
  };
  return <article className="pending-decision hx-bid" data-pending-kind={item.kind} data-bid-state={bid ? 'pending' : undefined}>
    <div className="row between wrap"><strong>{label}</strong>{bid && <span className="badge">{t.hex.bidState.pending}</span>}</div>
    {detail && <p className="small">{detail}</p>}
    <dl className="hx-bid-facts">
      {(bid || item.siteBid) && <div><dt>{t.hex.bidAmount}</dt><dd>{fmt.money(bid?.amount ?? item.siteBid!.amount)}</dd></div>}
      {item.amount !== null && <div><dt>{d.total}</dt><dd>{fmt.money(item.amount)}</dd></div>}
      {bid?.fallback && <div><dt>{t.hex.bidFallbackLabel}</dt><dd>{t.hex.bidFallback[bid.fallback]}</dd></div>}
    </dl>
    {bid && item.amount !== null && item.amount > bid.amount && <p className="small muted">{d.fees(bid.kind === 'launch' || bid.kind === 'factory' ? 'launch' : 'move', fmt.money(item.amount - bid.amount))}</p>}
    {!bid && !item.siteBid && item.amount === null && item.kind !== 'received-offer' && <p className="small muted">{d.noCash}</p>}
    {note && <p className="small muted">{note}</p>}
    <div className="row wrap">
      {canView && <button type="button" className="btn small" onClick={() => {
        onNavigate?.();
        if (item.intent) openMapFor?.(item.intent);
        else goTo?.('deals');
      }}>{d.view}</button>}
      {item.withdraw && <button type="button" className="btn small" disabled={busy} onClick={withdraw}>{withdrawLabel ?? d.withdraw}</button>}
    </div>
  </article>;
}
