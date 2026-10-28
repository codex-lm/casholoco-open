import { useEffect, useId, useRef, useState } from 'react';
import type { BotTakeoverOffer } from '@muchomoney/core';
import { useContent, useT } from '../i18n';
import { fmtFor } from '../fmt';
import { cx } from '../util';
import { Swatch } from './bits';

interface Props {
  offer: BotTakeoverOffer;
  playerName: string;
  busy: boolean;
  error: string | null;
  onChoose(playerId: string): void;
  onRefresh(): void;
  onBack(): void;
}

/** Un choix explicite parmi les seuls sièges que le serveur propose actuellement. */
export function BotTakeoverPicker({ offer, playerName, busy, error, onChoose, onRefresh, onBack }: Props) {
  const t = useT();
  const content = useContent();
  const fmt = fmtFor(offer.lang);
  const [selected, setSelected] = useState<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const selection = offer.options.find((p) => p.playerId === selected);

  useEffect(() => { title.current?.focus(); }, [offer.roomCode]);
  useEffect(() => {
    setSelected((current) => offer.options.some((p) => p.playerId === current) ? current : null);
  }, [offer.options]);

  return (
    <section className="home-card takeover-picker" aria-labelledby={`${id}-title`} aria-busy={busy}>
      <div className="kicker">{t.takeover.edition(offer.roomCode)}</div>
      <h2 ref={title} tabIndex={-1} id={`${id}-title`}>{t.takeover.title}</h2>
      <p>{t.takeover.intro(playerName, fmt.date(offer.turn, offer.startYear))}</p>
      <p className="notice small" id={`${id}-inheritance`}>{t.takeover.inheritance}</p>
      <p className="small muted">{t.takeover.startAt(fmt.date(offer.turn + 1, offer.startYear))}</p>
      {error && <p className="notice warn" role="alert">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (selection && !busy) onChoose(selection.playerId); }}>
        <fieldset className="takeover-choices" disabled={busy} aria-describedby={`${id}-inheritance`}>
          <legend>{t.takeover.choose}</legend>
          <div className="takeover-grid">
            {offer.options.map((option, index) => (
              <label key={option.playerId} className={cx('takeover-card', selected === option.playerId && 'selected')}>
                <span className="takeover-card-head">
                  <input
                    type="radio"
                    name={`${id}-seat`}
                    value={option.playerId}
                    checked={selected === option.playerId}
                    onChange={() => setSelected(option.playerId)}
                    aria-label={t.takeover.chooseBot(option.name)}
                    aria-describedby={`${id}-option-${index}`}
                  />
                  <Swatch color={option.color} size={14} />
                  <strong>{option.name}</strong>
                </span>
                <span id={`${id}-option-${index}`} className="takeover-card-body">
                  <span className="takeover-company-list">
                    {option.companies.length ? option.companies.map((company) => (
                      <span key={company.id} className="takeover-company">
                        <strong>{company.emoji} {company.name}</strong>
                        <span className="small muted">{company.sectorIds.map((sector) => content.sectors[sector]?.name ?? sector).join(' · ')}</span>
                      </span>
                    )) : <span className="small muted">{t.takeover.noCompany}</span>}
                  </span>
                  <span className="takeover-metrics">
                    <span><span className="small muted">{t.takeover.netWorth}</span><strong>{fmt.money(option.netWorth)}</strong></span>
                    <span><span className="small muted">{t.takeover.cash}</span><strong>{fmt.money(option.cash)}</strong></span>
                    <span><span className="small muted">{t.takeover.debt}</span><strong>{fmt.money(option.debt)}</strong></span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {offer.options.length === 0 && <p className="notice" role="status">{t.takeover.noOptions}</p>}
        <div className="row wrap takeover-actions">
          <button type="submit" className="btn primary" disabled={busy || !selection}>
            {busy ? t.common.ellipsis : selection ? t.takeover.confirm(selection.name) : t.takeover.selectFirst}
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={onRefresh}>{t.takeover.refresh}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={onBack}>{t.takeover.back}</button>
        </div>
      </form>
      <p className="small muted takeover-footnote">{t.takeover.snapshotNote}</p>
    </section>
  );
}
