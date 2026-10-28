import { useState } from 'react';
import { hexPlaceLabel, isSpatialMap } from '@muchomoney/core';
import { useGame } from '../../hooks/useGame';
import { useRoomLang, useT } from '../../i18n';
import { useFmt } from '../../fmt';
import { sendAction } from '../../api';
import { Section } from '../../components/bits';
import { liveHexBids } from './city/privacy';
import { hexBidKey, pendingDecisions } from './pendingDecisions';
import { PendingDecisionItem, type DecisionNavigation } from './PendingDecisionItem';
import './hexIntegration.css';

export { hexBidKey } from './pendingDecisions';

export function HexBidsPanel({ openMapFor, goTo }: DecisionNavigation = {}) {
  const { view, companiesById } = useGame();
  const t = useT();
  const fmt = useFmt();
  const roomLang = useRoomLang();
  const [busy, setBusy] = useState<string | null>(null);
  if (!isSpatialMap(view.config)) return null;
  const bids = view.self?.hexBids ?? [];
  const live = new Set(liveHexBids(view));
  const decisions = pendingDecisions(view);
  const commitment = decisions.groups.reduce((sum, group) => sum + group.hexTotal, 0);
  return <Section title={t.hex.bidsTitle} className="hx-bids">
    <p className="small muted">{t.hex.bidSecret}</p>
    <p className="hx-commitment"><span>{t.hex.bidCommitment}</span> <strong>{fmt.money(commitment)}</strong></p>
    {bids.length === 0 ? <p className="muted">{t.hex.bidsEmpty}</p> : <div className="hx-bid-list">
      {bids.map((bid) => {
        const key = hexBidKey(bid);
        const pending = decisions.items.find((item) => item.bid === bid);
        if (pending) return <PendingDecisionItem key={key} item={pending} openMapFor={openMapFor} goTo={goTo} withdrawLabel={t.hex.bidCancel} />;
        const company = companiesById.get(bid.companyId);
        const name = bid.project?.name ?? company?.products.find((p) => p.id === bid.productId)?.name;
        const result = bid.result;
        const lostControl = !result && !live.has(bid);
        const incubatorStays = result?.outcome === 'abandoned' && !!result.note;
        return <article key={key} className="hx-bid" data-bid-state={result?.outcome ?? (lostControl ? 'lost-control' : 'pending')}>
          <div className="row between wrap"><strong>{t.hex.bidKind[bid.kind]} · {t.hex.bidCell(hexPlaceLabel(bid.hexId, roomLang, view.siteSlots))}</strong><span className="badge">{lostControl ? t.hex.bidLostControl : incubatorStays ? t.hex.incubatorStays : t.hex.bidState[result?.outcome ?? 'pending']}</span></div>
          <p className="small">{company?.name ?? bid.companyId}{name && <> · {name}</>}</p>
          <dl className="hx-bid-facts">{!incubatorStays && <div><dt>{t.hex.bidAmount}</dt><dd>{fmt.money(bid.amount)}</dd></div>}
            {bid.fallback && <div><dt>{t.hex.bidFallbackLabel}</dt><dd>{t.hex.bidFallback[bid.fallback]}</dd></div>}
            {result && !incubatorStays && <div><dt>{t.hex.bidPrice}</dt><dd>{fmt.money(result.price)} · {t.hex.bidBidders(result.bidders)}</dd></div>}
          </dl>
          {result?.hexId && <p className="small">{t.hex.bidObtained(hexPlaceLabel(result.hexId, roomLang, view.siteSlots))}</p>}
          {result?.note && <p className="small">{result.note}</p>}
          {!result && (bid.productId || bid.project) && <button type="button" className="btn small" disabled={busy !== null || lostControl} onClick={async () => {
            if (lostControl) return;
            setBusy(key);
            try { await sendAction({ type: 'cancelHexBid', companyId: bid.companyId, ...(bid.productId ? { productId: bid.productId } : { projectId: bid.project!.id }) }); }
            finally { setBusy(null); }
          }}>{t.hex.bidCancel}</button>}
        </article>;
      })}
    </div>}
  </Section>;
}
