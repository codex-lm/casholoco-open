import { useRef, useState } from 'react';
import { useGame } from '../../hooks/useGame';
import { useNow } from '../../hooks/useNow';
import { usePublishedHeight } from '../../hooks/usePublishedHeight';
import { readyWhenSaved, setReady } from '../../api';
import { useApp } from '../../store';
import { cx, formatClock } from '../../util';
import { remainingMs } from '../../clock';
import { useT, useUiLang } from '../../i18n';
import { useFmt } from '../../fmt';
import { MARGIN_CALL_RATIO } from '../../rules';
import { LangSwitch } from '../../components/LangSwitch';
import { SoundButton } from '../../components/SoundButton';
import { InfoTip } from '../../components/bits';
import { ConfirmModal, Modal } from '../../components/Modal';
import { openHelp } from '../../tutorialStore';
import { PendingDecisionsButton } from './PendingDecisionsButton';
import type { DecisionNavigation } from './PendingDecisionItem';
import { netWorthRanks } from './city/model';
import { personalLeverage } from './StocksTab';
import { bankruptAtClose, stakeDigits, topBarAlerts, type TopBarAlert } from './topBarAlerts';
import { quarterCloseMessages } from '../../i18n/quarterClose';
import { latestCloseRecap } from './closeRecap';
import { quarterCloseAvailable } from './quarterCloseWindow';
import { navigationDetailsMessages } from '../../i18n/navigationDetails';
import { soloMessages } from '../../solo/messages';
import { peerMessages } from '../../peer/messages';
import { IS_PEER } from '../../edition';
import './navigationDetails.css';

export interface TopBarProps extends DecisionNavigation {
  /** Puce d'alerte (et « Voir » de l'avertissement de faillite) : la partie ouvre l'endroit où l'on agit. */
  openAlert?: (alert: TopBarAlert) => void;
  /** Reopen the most recent closed-quarter report. Absent before the first close and for spectators. */
  onOpenQuarterClose?: () => void;
}

export function TopBar({ openMapFor, goTo, openAlert, onOpenQuarterClose }: TopBarProps) {
  const { view, me, myCompanies } = useGame();
  const t = useT();
  const fmt = useFmt();
  const uiLang = useUiLang();
  const recapText = quarterCloseMessages(uiLang);
  const labels = navigationDetailsMessages(uiLang);
  const solo = soloMessages(uiLang);
  const peer = peerMessages(uiLang);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const recap = latestCloseRecap(view);
  const formatMoney = fmt.money;
  const clockOffset = useApp((s) => s.clockOffset);
  const now = useNow(250);
  // Horloge serveur estimée (clock.ts) : insensible au décalage de l'horloge locale.
  const remaining = remainingMs(view.turnEndsAt, now, clockOffset);
  const noClock = view.config.turnSeconds === 0;
  const urgent = !noClock && remaining !== null && remaining <= 10_000;

  const humans = view.players.filter((p) => !p.isBot);
  const connectedHumans = humans.filter((p) => p.connected);
  const readyCount = connectedHumans.filter((p) => p.ready).length;
  // Être prêt attend l'enregistrement des réglages de produit en cours ; en cas d'échec, on reste non prêt.
  // Pendant l'attente, le bouton reste focalisable (aria-disabled) et un second clic ne fait rien.
  const [savingBeforeReady, setSavingBeforeReady] = useState(false);
  // Une de mes entreprises fera faillite à la clôture si rien ne change : « Je suis prêt » le dit d'abord.
  const [confirmBankrupt, setConfirmBankrupt] = useState(false);
  const doomed = bankruptAtClose(myCompanies);
  const busy = useRef(false);
  const markReady = async () => {
    if (busy.current) return;
    busy.current = true;
    setSavingBeforeReady(true);
    try {
      await readyWhenSaved(view.turn);
    } finally {
      busy.current = false;
      setSavingBeforeReady(false);
    }
  };
  const toggleReady = async () => {
    if (busy.current) return;
    if (me.ready) {
      setReady(false, view.turn);
      return;
    }
    if (doomed.length > 0) {
      setConfirmBankrupt(true);
      return;
    }
    await markReady();
  };

  // La colonne carte, collante, se cale sous la barre : sa hauteur réelle est publiée en variable CSS.
  const barRef = useRef<HTMLElement>(null);
  usePublishedHeight(barRef, '--topbar-h');

  // Score : la valeur nette et le rang du salon (le classement d'un clic) ; pas de rang pour un spectateur.
  const rank = netWorthRanks(view.players).get(view.you);
  const total = view.players.length;
  const worth = formatMoney(me.netWorth);
  const leverage = personalLeverage(me.debt, me.portfolioValue, me.cash);
  const alerts = topBarAlerts(view, myCompanies);
  const alertText = (alert: TopBarAlert, line = false): string => {
    switch (alert.kind) {
      case 'bankrupt': return t.topbar.alertBankrupt(alert.company.name);
      case 'short': return t.topbar.alertShort(alert.company.name, formatMoney(alert.shortfall));
      case 'stake': return (line ? t.topbar.alertStakeLine : t.topbar.alertStake)(alert.holder.name, fmt.pct(alert.pct, stakeDigits(alert.pct)), alert.company.name);
      case 'scandal': return line
        ? t.topbar.alertScandalLine(alert.company.name, Math.round(alert.gauge), fmt.pct(alert.risk, 0))
        : t.topbar.alertScandal(Math.round(alert.gauge), fmt.pct(alert.risk, 0));
    }
  };
  const alert = alerts[0];

  return (
    <header ref={barRef} className="topbar">
      <div className="topbar-date">
        <div className="topbar-quarter">{view.dateLabel}</div>
        <div className="small muted">
          {t.topbar.quarter(view.turn, view.config.totalTurns)}
          {' · '}{IS_PEER ? peer.playingPeer : solo.playingSolo}
        </div>
        {view.turn === view.config.totalTurns && <div className="badge ink">{t.topbar.finalQuarter}</div>}
        <div className="row topbar-tools">
          <LangSwitch />
          <SoundButton />
          {onOpenQuarterClose && quarterCloseAvailable(view) && recap && (
            <button type="button" className="btn tiny ghost" data-reopen-quarter-close onClick={onOpenQuarterClose}>
              {recapText.button((recap.turn - 1) % 4 + 1)}
            </button>
          )}
          <button type="button" className="btn-icon help-btn" onClick={openHelp} aria-label={t.guide.title} title={t.guide.title}>
            ?
          </button>
        </div>
      </div>

      {noClock ? (
        <div className="topbar-clock" aria-live="off" title={t.topbar.noClockTitle}>
          <span className="small muted">{t.topbar.noClock}</span>
          <strong>∞</strong>
        </div>
      ) : (
        <div className={cx('topbar-clock', urgent && 'urgent')} aria-live="off" title={t.topbar.clockTitle}>
          <span className="small muted">{t.topbar.closesIn}</span>
          <strong>{remaining === null ? '—' : remaining <= 0 ? t.topbar.closing : formatClock(remaining)}</strong>
        </div>
      )}

      <dl className="topbar-fortune">
        <div>
          <dt>{t.topbar.cash}</dt>
          <dd className={cx(me.cash < 0 && 'down')}>{formatMoney(me.cash)}</dd>
        </div>
        <div>
          <dt>{t.topbar.portfolio}</dt>
          <dd>{formatMoney(me.portfolioValue)}</dd>
        </div>
        {/* La dette seulement quand il y en a une ; son infobulle dit la distance à l'appel de marge (§6.4). */}
        {me.debt > 0 && (
          <div className="topbar-debt">
            <dt>
              {t.topbar.debt}{' '}
              <InfoTip
                text={t.stocks.debtLine(formatMoney(me.debt), Number.isFinite(leverage) ? fmt.pct(leverage, 0) : '∞', fmt.pct(MARGIN_CALL_RATIO, 0))}
                align="right"
              />
            </dt>
            <dd className="down">−{formatMoney(me.debt)}</dd>
          </div>
        )}
        <div className="networth">
          <dt>
            {t.topbar.netWorth} <InfoTip text={t.tips.netWorth} align="right" />
          </dt>
          <dd>
            {rank !== undefined && goTo ? (
              <button type="button" className="topbar-score" aria-label={t.topbar.scoreAria(worth, t.ordinal(rank), total)} onClick={() => goTo('ranking')}>
                {worth}
                <span className="topbar-rank"> · {t.topbar.rank(t.ordinal(rank), total)}</span>
              </button>
            ) : (
              worth
            )}
          </dd>
        </div>
      </dl>

      <div className="topbar-decision-controls">
        {/* The urgent issue stays one click away; the count opens every actionable alert. */}
        {alert && (
          <div className="topbar-alert-group">
          <button
            type="button"
            className={cx('topbar-alert', (alert.kind === 'bankrupt' || alert.kind === 'short') && 'danger')}
            data-topbar-alert={alert.kind}
            title={alertText(alert, true)}
            aria-label={alertText(alert, true)}
            onClick={() => openAlert?.(alert)}
          >
            <span className="topbar-alert-text">{alertText(alert)}</span>
          </button>
          {alerts.length > 1 && <button type="button" className="topbar-alert-count" data-open-company-alerts
            aria-label={labels.allAlerts(alerts.length)} title={labels.allAlerts(alerts.length)} aria-haspopup="dialog"
            onClick={() => setAlertsOpen(true)}>{t.topbar.alertMore(alerts.length - 1)}</button>}
          </div>
        )}
        <PendingDecisionsButton openMapFor={openMapFor} goTo={goTo} />
        <div className="topbar-ready">
          <button
            type="button"
            className={cx('btn', me.ready ? 'ready' : 'primary')}
            onClick={() => void toggleReady()}
            aria-disabled={savingBeforeReady || undefined}
            aria-pressed={me.ready}
          >
            {savingBeforeReady ? t.topbar.readySaving : me.ready ? t.topbar.readyCancel : t.topbar.ready}
          </button>
          {IS_PEER ? <div className="ready-dots" title={t.topbar.readyTitle}>
            {humans.map((player) => <span key={player.id}
              className={cx('ready-dot', player.ready && 'on', !player.connected && 'away')}
              style={{ borderColor: player.color, background: player.ready ? player.color : undefined }}
              title={t.topbar.playerState(player.name, !player.connected ? t.topbar.away : player.ready ? t.topbar.isReady : t.topbar.thinking)} />)}
            <span className="small muted">{t.topbar.readyCount(readyCount, connectedHumans.length)}</span>
          </div> : <span className="small muted solo-ready-hint">{solo.readyHint}</span>}
        </div>
      </div>
      {alertsOpen && <Modal title={labels.alertsTitle} onClose={() => setAlertsOpen(false)}>
        {alerts.length === 0 ? <p>{labels.noAlerts}</p> : <ul className="company-alert-list">
          {alerts.map((item) => <li key={`${item.company.id}:${item.kind}:${item.kind === 'stake' ? item.holder.id : ''}`}>
            <button type="button" className={cx('company-alert-action', (item.kind === 'bankrupt' || item.kind === 'short') && 'danger')}
              data-company-alert={item.kind} onClick={() => { setAlertsOpen(false); openAlert?.(item); }}>
              <strong>{alertText(item, true)}</strong>
              <small>{item.kind === 'stake' ? labels.alertStock : item.kind === 'scandal' ? labels.alertScandal : labels.alertCompany} <span aria-hidden>→</span></small>
            </button>
          </li>)}
        </ul>}
      </Modal>}
      {confirmBankrupt && doomed.length > 0 && (
        <ConfirmModal
          title={t.topbar.readyBankruptTitle}
          message={<p>{t.topbar.readyBankrupt(doomed.map((c) => c.name))}</p>}
          confirmLabel={t.topbar.readyAnyway}
          onConfirm={() => void markReady()}
          onClose={() => setConfirmBankrupt(false)}
          secondary={openAlert ? { label: t.topbar.readyBankruptView, onClick: () => openAlert({ kind: 'bankrupt', company: doomed[0] }) } : undefined}
        />
      )}
    </header>
  );
}
