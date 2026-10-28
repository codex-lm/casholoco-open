import { useEffect, useState } from 'react';
import { SECTOR_IDS, productCount, productIdentity, type CompanyView, type PlayerView, type SectorId } from '@muchomoney/core';
import { sendAction } from '../../api';
import { AmountForm } from '../../components/AmountForm';
import { ConfirmModal } from '../../components/Modal';
import { useContent, useT, useUiLang } from '../../i18n';
import { industryMessages } from '../../i18n/industry';
import { useFmt } from '../../fmt';
import type { HexReference } from './city/hexModel';
import { liveHexBids } from './city/privacy';

/** Construction is a separate decision from the map's origin / delivery simulation. */
export function IndustryPanel({ view, company, hexId, reference, actionMode, onlySale = false, compact = false, onDone }: { view: PlayerView; company: CompanyView; hexId: string; reference: HexReference | null;
  /** The map palette already picked the commercial profile; this form only prices its action. */
  actionMode?: 'land' | 'existing' | 'fresh'; onlySale?: boolean; compact?: boolean; onDone?: () => void }) {
  const text = industryMessages(useUiLang()), t = useT(), fmt = useFmt(), content = useContent();
  const products = company.products.filter((p, i, all) => all.findIndex(q => productIdentity(q) === productIdentity(p)) === i);
  const parcel = company.land?.find(p => p.hexId === hexId);
  const referenceKey = reference?.kind === 'launch' ? reference.sectorId : reference?.productId;
  const [selectedMode, setMode] = useState<'land' | 'existing' | 'fresh'>(reference?.kind === 'launch' ? 'fresh' : products.length ? 'existing' : 'land');
  const requestedMode = actionMode ?? selectedMode;
  const mode = parcel && requestedMode === 'land' ? products.length ? 'existing' : 'fresh' : requestedMode;
  const [productId, setProductId] = useState(products.find(p => p.id === referenceKey)?.id ?? products[0]?.id ?? '');
  const [sectorId, setSectorId] = useState<SectorId>(reference?.kind === 'launch' ? reference.sectorId : 'gadgets');
  const [name, setName] = useState('');
  const [sell, setSell] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (reference?.kind === 'launch') { setSectorId(reference.sectorId); setMode('fresh'); }
    else if (reference?.kind === 'product') {
      const product = company.products.find(p => p.id === reference.productId);
      if (product) { setProductId(products.find(p => productIdentity(p) === productIdentity(product))?.id ?? product.id); setMode('existing'); }
    }
  }, [referenceKey]);
  const selectedProduct = company.products.find(p => p.id === (actionMode === 'existing' && reference?.kind === 'product' ? reference.productId : productId));
  const sector = view.sectors.find(s => s.id === (mode === 'existing' ? selectedProduct?.sectorId : sectorId));
  const cost = mode === 'land' ? 0 : sector?.launchCost ?? 0;
  const reserve = parcel ? 0 : mode === 'land' ? view.hexes?.landReserve?.[hexId] ?? 0 : view.hexes?.reserve[hexId] ?? 0;
  const pending = liveHexBids(view).find(b => b.companyId === company.id && b.hexId === hexId);
  const reason = view.turn >= view.config.totalTurns ? text.lastTurn : mode === 'existing' && !selectedProduct ? text.noProduct
    : mode === 'fresh' && productCount(company) + (company.private?.launchProjects?.length ?? 0) >= (company.maxProducts ?? 4) ? t.launch.full(company.maxProducts ?? 4)
    : mode === 'fresh' && !name.trim() ? text.needName : company.cash < cost + reserve ? text.cash : null;
  const submit = async (bid?: number) => {
    if (reason || busy) return { ok: false };
    setBusy(true);
    try {
      const result = await sendAction(mode === 'land' ? { type: 'bidLand', companyId: company.id, hexId, bid: bid! }
        : mode === 'existing' ? { type: 'buildFactory', companyId: company.id, productId: selectedProduct!.id, hexId, ...(bid !== undefined ? { bid } : {}) }
        : { type: 'launchProduct', companyId: company.id, sectorId, name: name.trim(), hexId, ...(bid !== undefined ? { bid, fallback: 'abandon' as const } : {}) });
      if (result.ok) onDone?.();
      return result;
    } finally { setBusy(false); }
  };
  return <section className={`industry-panel${compact ? ' industry-panel-compact hx-action-fields' : ''}`} data-industry-panel={hexId}>
    {!compact && <h4>{text.title}</h4>}
    {!onlySale && (pending ? <>
      <p className="small">{t.hex.bidKind[pending.kind]} · {fmt.money(pending.amount)} · {t.hex.bidState.pending}</p>
      <button type="button" className="btn small" onClick={() => void sendAction({ type: 'cancelHexBid', companyId: company.id, hexId })}>{t.hex.bidCancel}</button>
    </> : <>
      {!actionMode && <div className="seg wrap">
        {!parcel && <button type="button" className={`seg-btn ${mode === 'land' ? 'active' : ''}`} onClick={() => setMode('land')}>⚑ {text.land}</button>}
        <button type="button" className={`seg-btn ${mode === 'existing' ? 'active' : ''}`} onClick={() => setMode('existing')}>🏭 {text.existing}</button>
        <button type="button" className={`seg-btn ${mode === 'fresh' ? 'active' : ''}`} onClick={() => setMode('fresh')}>＋ {text.fresh}</button>
      </div>}
      {mode === 'existing' && <>{actionMode ? !compact && <p><strong>{selectedProduct?.name}</strong></p> : <div className="seg wrap">{products.map(p => <button type="button" key={p.id} className={`seg-btn ${p.id === productId ? 'active' : ''}`} onClick={() => setProductId(p.id)}>{content.sectors[p.sectorId].emoji} {p.name}</button>)}</div>}{!compact && <p className="small muted">{text.shared}</p>}</>}
      {mode === 'fresh' && <>
        {actionMode ? !compact && <p><strong>{content.sectors[sectorId].name}</strong></p> : <div className="seg wrap">{SECTOR_IDS.map(id => <button type="button" key={id} className={`seg-btn ${id === sectorId ? 'active' : ''}`} onClick={() => setSectorId(id)} title={content.sectors[id].name}>{content.sectors[id].emoji} {content.sectors[id].name}</button>)}</div>}
        <label className="field">{text.name}<input value={name} maxLength={30} onChange={e => setName(e.target.value)} /></label>
      </>}
      {compact ? <p className="hx-action-costs">{!parcel && <span>{text.reserve} : <strong>{fmt.money(reserve)}</strong></span>}{mode !== 'land' && <span>{text.cost(fmt.money(cost))}</span>}</p>
        : <>{parcel ? <p className="small muted">{text.owned}</p> : <p className="small">{text.reserve} : <strong>{fmt.money(reserve)}</strong></p>}
      {mode === 'land' ? <><p className="small muted">{text.landRule}</p><p className="small muted">{text.upkeep(fmt.money(.05 * reserve))}</p></>
        : <><p className="small">{text.cost(fmt.money(cost))}</p><p className="small muted">{text.building}</p></>}
      </>}
      {parcel ? <button type="button" className="btn small primary" disabled={!!reason || busy} onClick={() => void submit()}>{text.build}</button>
        : <AmountForm key={`${hexId}:${mode}:${sector?.id ?? ''}:${reserve}`} label={t.hex.formBid} min={reserve} initial={reserve} max={Math.max(0, company.cash - cost)} presets={[]} disabledReason={reason} submitLabel={mode === 'land' ? text.bid : text.buildBid} onSubmit={submit}
          info={mode === 'land' ? amount => text.upkeepMax(fmt.money(.05 * Math.max(reserve, amount))) : undefined} />}
      {parcel && reason && <p className="small muted">{reason}</p>}
      {compact && <details className="hx-action-rules"><summary>{text.rules}</summary>
        {mode === 'land' ? <><p>{text.landRule}</p><p>{text.upkeep(fmt.money(.05 * reserve))}</p></> : <><p>{text.building}</p>{mode === 'existing' && <p>{text.shared}</p>}{parcel && <p>{text.owned}</p>}</>}
      </details>}
    </>)}
    {parcel && <>
      {compact ? <p className="hx-action-costs">{text.upkeepShort(fmt.money(parcel.upkeep))}</p> : <p className="small muted">{text.upkeep(fmt.money(parcel.upkeep))}</p>}
      {(onlySale || !compact) && <button type="button" className="btn small ghost danger-text" onClick={() => setSell(true)}>{text.sell} · {fmt.money(parcel.cost * .5)}</button>}
      {sell && <ConfirmModal title={text.sellTitle} message={<p>{text.sellBody(fmt.money(parcel.cost * .5))}</p>} confirmLabel={text.sell} onClose={() => setSell(false)} onConfirm={async () => { const result = await sendAction({ type: 'sellLand', companyId: company.id, hexId }); if (result.ok) onDone?.(); }} />}
    </>}
  </section>;
}
