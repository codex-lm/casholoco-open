import { useState } from 'react';
import type { SectorId } from '@muchomoney/core';
import { SECTOR_IDS, isSpatialMap } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useGame } from '../../hooks/useGame';
import { Modal } from '../../components/Modal';
import { COMPANY_NAME_MAX } from '../../session';
import { STARTUP_FOUNDER_PCT, STARTUP_MIN_INVESTMENT, STARTUP_SHARES, STARTUP_SUBSIDY, canFoundStartup, startupInitialPrice } from '../../rules';
import { cx, pick } from '../../util';
import { useContent, useRoomContent, useT, useUiLang } from '../../i18n';
import { Rich } from '../../i18n/Rich';
import { inputNumber, parseNumber, useFmt } from '../../fmt';
import { Stepper, niceStep } from '../../components/Stepper';
import { HexStartupModal } from './HexBidForms';

export function StartupModal({ onClose }: { onClose: () => void }) {
  const { me, view } = useGame();
  const subsidy = view.self?.startupSubsidy ?? STARTUP_SUBSIDY;
  const allowed = canFoundStartup(view.companies, me.id, view.self?.soldControlThisTurn);
  const t = useT();
  const fmt = useFmt();
  const uiLang = useUiLang();
  const content = useContent();
  const nameIdeas = useRoomContent().companyNameIdeas;
  const [name, setName] = useState(() => pick(nameIdeas) ?? '');
  const [sectorId, setSectorId] = useState<SectorId>(SECTOR_IDS[0]);
  const [raw, setRaw] = useState(() => inputNumber(Math.max(STARTUP_MIN_INVESTMENT, Math.min(3000, Math.floor(me.cash))), uiLang));
  const [busy, setBusy] = useState(false);

  if (isSpatialMap(view.config)) return <HexStartupModal onClose={onClose} />;

  const investment = parseNumber(raw, uiLang);
  const valid = allowed && Number.isFinite(investment) && investment >= STARTUP_MIN_INVESTMENT && investment <= me.cash && name.trim().length > 0;
  const tooPoor = me.cash < STARTUP_MIN_INVESTMENT;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const r = await sendAction({ type: 'foundStartup', name: name.trim(), sectorId, investment });
      if (r.ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t.startup.title} onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="small muted">{t.startup.intro(fmt.money(STARTUP_MIN_INVESTMENT), fmt.money(subsidy))}</p>
        {!allowed && <p className="warn small">{t.startup.notAllowed}</p>}
        <div className="field">
          <label htmlFor="startup-name">{t.startup.name}</label>
          <div className="row">
            <input id="startup-name" className="grow" type="text" maxLength={COMPANY_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} />
            <button
              type="button"
              className="btn ghost"
              onClick={() => setName(pick(nameIdeas, name) ?? name)}
              aria-label={t.startup.otherName}
              title={t.startup.otherName}
            >
              🎲
            </button>
          </div>
        </div>
        <div className="field">
          <label>{t.startup.sector}</label>
          <div className="seg wrap">
            {SECTOR_IDS.map((id) => (
              <button key={id} type="button" className={cx('seg-btn', id === sectorId && 'active')} onClick={() => setSectorId(id)}>
                {content.sectors[id]?.emoji} {content.sectors[id]?.name ?? id}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="startup-inv">
            {t.startup.investment} <span className="field-hint">{t.startup.available(fmt.money(me.cash))}</span>
          </label>
          <Stepper
            value={raw.trim() === '' ? Number.NaN : investment}
            step={niceStep((me.cash - STARTUP_MIN_INVESTMENT) / 20)}
            min={STARTUP_MIN_INVESTMENT}
            max={Math.floor(me.cash)}
            stepLabel={fmt.money(niceStep((me.cash - STARTUP_MIN_INVESTMENT) / 20))}
            onChange={(v) => setRaw(inputNumber(v, uiLang))}
          >
            <span className="num-input">
              <input id="startup-inv" type="text" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} />
              <span className="suffix">{fmt.unit}</span>
            </span>
          </Stepper>
        </div>
        {Number.isFinite(investment) && investment > 0 && (
          <ul className="small facts">
            <li>
              <Rich text={t.startup.startCash(fmt.money(investment + subsidy))} />
            </li>
            <li>{t.startup.founderStake(fmt.pct(STARTUP_FOUNDER_PCT, 0), fmt.int(STARTUP_SHARES))}</li>
            <li>{t.startup.ipoPrice(fmt.sharePrice(startupInitialPrice(investment, subsidy)))}</li>
          </ul>
        )}
        {tooPoor && <p className="warn small">{t.startup.tooPoor}</p>}
        {!tooPoor && Number.isFinite(investment) && investment < STARTUP_MIN_INVESTMENT && (
          <p className="warn small">{t.startup.belowMin(fmt.money(STARTUP_MIN_INVESTMENT))}</p>
        )}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>
            {t.startup.later}
          </button>
          <button type="submit" className="btn primary" disabled={!valid || busy}>
            {busy ? t.common.ellipsis : t.startup.submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
