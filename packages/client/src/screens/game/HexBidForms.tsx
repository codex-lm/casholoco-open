/**
 * Formulaires d'enchère du mode hexagonal : création de start-up (son sélecteur sur le plateau,
 * HexBidPicker). Les formulaires de lancement et de déménagement pour une case déjà choisie vivent
 * dans LaunchForms.tsx (HexLaunchForm, HexBidSummary et les aides partagées) et MoveForms.tsx
 * (HexMoveForm), et se montent dans le panneau latéral de la carte ; les aides déplacées sont
 * réexportées pour les importateurs existants.
 */
import { useState, type ReactNode } from 'react';
import type { PlayerView, SectorId } from '@muchomoney/core';
import { SECTOR_IDS } from '@muchomoney/core';
import { sendAction } from '../../api';
import { AmountForm } from '../../components/AmountForm';
import { Modal } from '../../components/Modal';
import { Stepper, niceStep } from '../../components/Stepper';
import { inputNumber, parseNumber, useFmt } from '../../fmt';
import { useGame } from '../../hooks/useGame';
import { useContent, useRoomContent, useT, useUiLang } from '../../i18n';
import { Rich } from '../../i18n/Rich';
import { COMPANY_NAME_MAX } from '../../session';
import { STARTUP_FOUNDER_PCT, STARTUP_MIN_INVESTMENT, STARTUP_SHARES, STARTUP_SUBSIDY, canFoundStartup, startupInitialPrice } from '../../rules';
import { cx, pick } from '../../util';
import { HexBoard } from './city/HexBoard';
import type { HexReference } from './city/hexModel';
import { HexBidSummary, HexFallbackChoice, cellReason, initialBidHex, type Fallback } from './LaunchForms';
import './HexBidForms.css';

export { HexFallbackChoice, HexPendingProjects, initialBidHex } from './LaunchForms';

/** Sélecteur d'une case sur le plateau : verdict et fiche chiffrée (HexBidSummary) autour du plateau. */
function HexBidPicker({ view, hexId, onSelect, reference, delta = false, landOnly = false, cost = 0, costLabel, bid, perksText = null, children }: {
  view: PlayerView; hexId: string | null; onSelect: (id: string) => void; reference: HexReference; delta?: boolean; landOnly?: boolean; cost?: number; costLabel?: string; bid: number; perksText?: string | null; children: ReactNode;
}) {
  return <div className="hx-bid-picker">
    <HexBidSummary view={view} hexId={hexId} reference={reference} delta={delta} landOnly={landOnly} cost={cost} costLabel={costLabel} bid={bid} perksText={perksText}
      board={<HexBoard view={view} selectedId={hexId} onSelect={onSelect} reference={reference} lens="margin" delta={delta} ranks selectableOnlyFree showToolbar={false} />}>
      {children}
    </HexBidSummary>
  </div>;
}

export function HexStartupModal({ onClose }: { onClose: () => void }) {
  const { view, me } = useGame();
  const t = useT();
  const h = t.hex;
  const fmt = useFmt();
  const uiLang = useUiLang();
  const content = useContent();
  const nameIdeas = useRoomContent().companyNameIdeas;
  const subsidy = view.self?.startupSubsidy ?? STARTUP_SUBSIDY;
  const allowed = canFoundStartup(view.companies, me.id, view.self?.soldControlThisTurn);
  const [name, setName] = useState(() => pick(nameIdeas) ?? '');
  const [sectorId, setSectorId] = useState<SectorId>(SECTOR_IDS[0]);
  const [raw, setRaw] = useState(() => inputNumber(Math.max(STARTUP_MIN_INVESTMENT, Math.min(3000, Math.floor(me.cash))), uiLang));
  const [picked, setPicked] = useState<string | null>(null);
  const [fallback, setFallback] = useState<Fallback>('nearest');
  const [bidLive, setBidLive] = useState<{ key: string; raw: string } | null>(null);
  const investment = parseNumber(raw, uiLang);
  const valid = allowed && Number.isFinite(investment) && investment >= STARTUP_MIN_INVESTMENT && investment <= me.cash && name.trim().length > 0;
  const max = Number.isFinite(investment) ? Math.max(0, investment + subsidy) : 0;
  const reference: HexReference = { kind: 'launch', sectorId };
  const hexId = picked ?? initialBidHex(view, reference);
  const reserve = hexId ? view.hexes?.reserve[hexId] ?? 0 : 0;
  const amountKey = hexId ?? '';
  const bid = bidLive && bidLive.key === amountKey ? parseNumber(bidLive.raw, uiLang) : reserve;
  const reason = !allowed ? t.startup.notAllowed : !valid ? h.formInvestmentInvalid : cellReason(view, hexId, max, reserve, h);
  return <Modal title={t.startup.title} onClose={onClose} size="map">
    <div className="stack hx-startup">
      <p className="small muted">{t.startup.intro(fmt.money(STARTUP_MIN_INVESTMENT), fmt.money(subsidy))}</p>
      <div className="field"><label htmlFor="hex-startup-name">{t.startup.name}</label><div className="row"><input id="hex-startup-name" className="grow" type="text" maxLength={COMPANY_NAME_MAX} value={name} onChange={(event) => setName(event.target.value)} /><button type="button" className="btn ghost" onClick={() => setName(pick(nameIdeas, name) ?? name)} aria-label={t.startup.otherName}>🎲</button></div></div>
      <div className="field"><label>{t.startup.sector}</label><div className="seg wrap">{SECTOR_IDS.map((id) => <button key={id} type="button" className={cx('seg-btn', id === sectorId && 'active')} onClick={() => { setBidLive(null); setSectorId(id); }}>{content.sectors[id].emoji} {content.sectors[id].name}</button>)}</div></div>
      <div className="field"><label htmlFor="hex-startup-inv">{t.startup.investment} <span className="field-hint">{t.startup.available(fmt.money(me.cash))}</span></label><Stepper value={raw.trim() === '' ? Number.NaN : investment} step={niceStep((me.cash - STARTUP_MIN_INVESTMENT) / 20)} min={STARTUP_MIN_INVESTMENT} max={Math.floor(me.cash)} stepLabel={fmt.money(niceStep((me.cash - STARTUP_MIN_INVESTMENT) / 20))} onChange={(value) => setRaw(inputNumber(value, uiLang))}><span className="num-input"><input id="hex-startup-inv" type="text" inputMode="decimal" value={raw} onChange={(event) => setRaw(event.target.value)} /><span className="suffix">{fmt.unit}</span></span></Stepper></div>
      {Number.isFinite(investment) && investment > 0 && <ul className="small facts"><li><Rich text={t.startup.startCash(fmt.money(investment + subsidy))} /></li><li>{t.startup.founderStake(fmt.pct(STARTUP_FOUNDER_PCT, 0), fmt.int(STARTUP_SHARES))}</li><li>{t.startup.ipoPrice(fmt.sharePrice(startupInitialPrice(investment, subsidy)))}</li></ul>}
      {me.cash < STARTUP_MIN_INVESTMENT && <p className="warn small">{t.startup.tooPoor}</p>}
      <HexBidPicker view={view} hexId={hexId} onSelect={(id) => { setBidLive(null); setPicked(id); }} reference={reference} landOnly bid={bid}>
        <HexFallbackChoice value={fallback} onChange={setFallback} id="startup" incubator />
        <p className="small muted">{h.formFallbackHelp}</p>
        <p className="small muted">{h.formAuctionHelp}</p>
        <AmountForm key={hexId} label={h.formBid} min={reserve} max={max} initial={reserve} presets={[]} disabledReason={reason} submitLabel={h.formStartupBid} after={(bid) => h.formCashAfter(fmt.money(max - bid))} onRawChange={(raw) => setBidLive({ key: amountKey, raw })} onSubmit={async (bid) => {
          if (reason || !hexId) return { ok: false };
          const result = await sendAction({ type: 'foundStartup', name: name.trim(), sectorId, investment, hexId, bid, fallback });
          if (result.ok) onClose();
          return result;
        }} />
        <button type="button" className="btn ghost small" onClick={onClose}>{t.startup.later}</button>
      </HexBidPicker>
    </div>
  </Modal>;
}
