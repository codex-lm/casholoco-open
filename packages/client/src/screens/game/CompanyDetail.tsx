import { useState } from 'react';
import { isSpatialMap, type CompanyView } from '@muchomoney/core';
import { sendAction } from '../../api';
import { ConfirmModal } from '../../components/Modal';
import { useGame } from '../../hooks/useGame';
import { AmountForm } from '../../components/AmountForm';
import { LineChart } from '../../components/LineChart';
import { StackedBar, type Segment } from '../../components/StackedBar';
import { Delta, InfoTip, ScandalBadge, Section, Stat } from '../../components/bits';
import {
  CONTROLLED_LOAN_LTV,
  CONTROL_THRESHOLD,
  FLOAT_MIN_PCT,
  INSIDER_FLASH_PCT,
  STAKE_FLASH_THRESHOLDS,
  holdingPct,
  insiderScandal,
  pctDigits,
  sharesToControl,
  maxAffordableShares,
  priceChange,
  shareBuyCost,
  sharePriceAfter,
  shareSellProceeds,
  floatMinBuyMax,
  WHISTLEBLOW_COST,
  WHISTLEBLOW_SCANDAL,
} from '../../rules';
import { turnLabels } from '../../util';
import { useContent, useT } from '../../i18n';
import { Rich } from '../../i18n/Rich';
import { useFmt } from '../../fmt';
import { ReportTable } from './ReportTable';
import { productLocation } from './productLocation';

/**
 * Fiche d'une société (onglet Bourse). `embedded` : la fiche est déjà dans une fenêtre qui porte son titre et
 * sa croix (les panneaux de « La carte ») ; elle n'affiche alors ni son propre titre ni son bouton de fermeture.
 */
export function CompanyDetail({ company: c, onClose, embedded = false }: { company: CompanyView; onClose: () => void; embedded?: boolean }) {
  const { view, playersById, playerName } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const history = [...c.priceHistory, c.sharePrice];
  const labels = turnLabels(history.length, view.turn - 1, view.config.startYear, { start: t.common.start, now: t.common.live }, fmt.lang);

  const segments: Segment[] = Object.entries(c.holdings)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([pid, n]) => {
      const p = playersById.get(pid);
      return { id: pid, label: p ? (pid === view.you ? t.common.youSuffix(p.name) : p.name) : t.common.unknown, value: n, color: p?.color ?? '#999' };
    });
  if (c.floatShares > 0) segments.push({ id: 'float', label: t.detail.float, value: c.floatShares, color: '#bbb', hatched: true });

  const dead = c.status !== 'active';
  const mineCo = c.controllerId === view.you;

  const body = (
    <>
      <div className="stat-grid">
        <Stat
          label={
            c.valuation ? (
              <>
                {t.company.price}{' '}
                <InfoTip
                  text={t.tips.valuation(fmt.money(c.valuation.bookValue), fmt.money(c.valuation.smoothedProfit), fmt.sharePrice(c.valuation.perShare))}
                  align="left"
                />
              </>
            ) : (
              t.company.price
            )
          }
          value={fmt.sharePrice(c.sharePrice)}
          sub={<Delta value={priceChange(c.priceHistory, c.sharePrice)} />}
        />
        <Stat label={t.company.marketCap} value={fmt.money(c.marketCap)} />
        <Stat label={t.company.cash} value={fmt.money(c.cash)} />
        <Stat label={t.company.debt} value={fmt.money(c.debt)} />
        <Stat label={t.detail.ceo} value={<span className="small">{c.ceoName}</span>} sub={playerName(c.controllerId)} />
        <Stat label={t.detail.scandal} value={<ScandalBadge level={c.scandalLevel} />} sub={t.detail.reputation(fmt.num(c.reputation))} />
      </div>

      <div className="two-cols">
        <div className="stack">
          <LineChart
            title={t.detail.priceChart}
            series={[{ id: c.id, label: c.name, color: c.color, values: history }]}
            labels={labels}
            format={fmt.sharePrice}
            height={190}
          />
          <div>
            <div className="chart-title">{t.detail.capital(fmt.int(c.sharesOutstanding))}</div>
            <StackedBar segments={segments} total={c.sharesOutstanding} formatValue={(v) => t.common.shares(fmt.int(v), Math.round(v))} />
          </div>
        </div>
        <div className="stack">
          {dead ? (
            <p className="notice">
              {c.status === 'bankrupt' ? t.detail.bankrupt : t.detail.merged}
            </p>
          ) : (
            <>
              <TradePanel company={c} />
              {!mineCo && <WhistleTile company={c} />}
            </>
          )}
        </div>
      </div>

      <div className="two-cols">
        <div>
          <div className="chart-title">{t.detail.shelf}</div>
          {c.products.length ? (
            <div className="table-scroll">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>{t.detail.cols.product}</th>
                    <th className="num">{mineCo ? t.detail.cols.price : t.detail.priceLast}</th>
                    <th className="num">{t.detail.cols.quality}</th>
                    <th className="num">{t.detail.cols.brand}</th>
                    <th className="num">{t.detail.cols.sales}</th>
                    <th className="num">{t.detail.cols.share}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        {content.sectors[p.sectorId]?.emoji} {p.name}
                        {p.comingSoon && <span className="badge"> {t.detail.comingSoon}</span>}
                        {isSpatialMap(view.config) && <div className="small muted">{productLocation(view, p, content.mapNames, t.hex)}</div>}
                      </td>
                      <td className="num">{fmt.money(p.price)}</td>
                      <td className="num">{fmt.num(p.quality)}</td>
                      <td className="num">{fmt.num(p.brand)}</td>
                      <td className="num">{fmt.int(p.lastSales)}</td>
                      <td className="num">{fmt.pct(p.lastMarketShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="small muted">{t.detail.noProducts}</p>
          )}
          {!mineCo && c.products.length > 0 && <p className="small muted italic">{t.detail.rivalPrices}</p>}
        </div>
        <div>
          <div className="chart-title">{t.detail.lastResults}</div>
          <ReportTable reports={c.reports} showProducts={false} />
        </div>
      </div>
    </>
  );

  if (embedded) return <div className="company-detail-embedded">{body}</div>;
  return (
    <Section
      className="company-detail"
      title={
        <>
          {c.emoji} {c.name} <span className="ticker-chip">{c.ticker}</span>
        </>
      }
      aside={
        <button type="button" className="btn-icon" onClick={onClose} aria-label={t.detail.closeAria}>
          ✕
        </button>
      }
    >
      {body}
    </Section>
  );
}

function TradePanel({ company: c }: { company: CompanyView }) {
  const { me, playerName, view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const S = c.sharesOutstanding;
  const p = c.sharePrice;
  const mine = c.holdings[me.id] ?? 0;
  const myPct = holdingPct(c, me.id);
  const isController = c.controllerId === me.id;
  // Contrôle : strictement plus de 50 % (§6.3). Le dire en toutes lettres, « 50,0 % » ne tranche pas.
  const missing = sharesToControl(c, me.id);
  // A cédé le contrôle en vendant ce trimestre : racheter reste un délit d'initié (§6.2).
  const exController = !isController && (view.self?.soldControlThisTurn ?? []).includes(c.id);
  const affordable = maxAffordableShares(p, S, me.cash, c.floatShares);
  // Flottant minimal (§6.2) : au-delà de 50 % + 1 action, le public garde au moins FLOAT_MIN (40 %) du capital.
  const floatCap = floatMinBuyMax(mine, c.floatShares, S);
  const maxBuy = Math.min(affordable, floatCap);
  // Visibles seulement pour le contrôleur (CompanyView.private) : c'est lui qui fonde et avale la pilule.
  const flags = c.private?.turnFlags;
  const founderLocked = flags?.justFounded === true && c.founderId === me.id;
  const locked = Math.min(mine, Math.max(0, flags?.lockedShares?.[me.id] ?? 0));
  const sellable = founderLocked ? 0 : Math.max(0, mine - locked);
  // Délit d'initié : actions déjà achetées ce trimestre par le contrôleur (flash au-delà de 5 %).
  const insiderBoughtBefore = Math.max(0, flags?.insiderBought?.[me.id] ?? 0);

  return (
    <div className="trade">
      <div className="small">
        <Rich text={t.trade.holding(fmt.int(mine), fmt.pct(myPct, pctDigits(myPct)), fmt.int(c.floatShares), fmt.money(me.cash))} />{' '}
        <InfoTip text={t.tips.float} align="right" />
      </div>
      {c.status === 'active' && isController && (
        <div className="small control-line up">
          <Rich text={t.trade.youControl(c.name)} />
        </div>
      )}
      {c.status === 'active' && !isController && mine > 0 && (
        <div className="small control-line">
          <Rich text={t.trade.toControl(fmt.int(missing), missing, c.name)} />
          {missing > c.floatShares && <> {t.trade.toControlNoFloat(fmt.int(c.floatShares))}</>}
        </div>
      )}
      {locked > 0 && !founderLocked && (
        <div className="small warn">
          <Rich text={t.trade.locked(fmt.int(locked), fmt.int(sellable))} />
        </div>
      )}
      <AmountForm
        label={t.trade.buy}
        unit="shares"
        max={maxBuy}
        submitLabel={t.trade.buy}
        disabledReason={c.floatShares <= 0 ? t.trade.noFloat : me.cash <= 0 ? t.trade.noCash : null}
        info={(n) => {
          const cost = shareBuyCost(p, n, S);
          const after = (mine + n) / S;
          const crossed = STAKE_FLASH_THRESHOLDS.filter((t) => myPct < t && after >= t);
          return (
            <>
              <Rich text={t.trade.buyInfo(fmt.money(cost), fmt.sharePrice(cost / n), fmt.sharePrice(sharePriceAfter(p, n, S, 'buy')), fmt.pct(after, pctDigits(after)))} />
              {floatCap < affordable && n >= floatCap && <div className="warn">{t.trade.floatCapped(fmt.int(floatCap), fmt.pct(FLOAT_MIN_PCT, 0))}</div>}
              {!isController && after > CONTROL_THRESHOLD && (
                <div className="takeover-warning">
                  🚨 {t.trade.takeover} {c.controllerId ? t.trade.ousts(playerName(c.controllerId)) : t.trade.autopilotKeys}
                </div>
              )}
              {!isController && after <= CONTROL_THRESHOLD && crossed.length > 0 && (
                <div className="warn">{t.trade.stakeFlash(fmt.pct(crossed[crossed.length - 1], 0))}</div>
              )}
              {exController && (
                <div className="warn">
                  <Rich text={t.trade.insiderEx(fmt.num(insiderScandal(n, S, c.scandalMultiplier)))} />
                </div>
              )}
              {isController && (
                <div className="warn">
                  <Rich text={t.trade.insider(fmt.num(insiderScandal(n, S, c.scandalMultiplier)), fmt.pct(CONTROLLED_LOAN_LTV, 0))} />
                  {insiderBoughtBefore + n >= INSIDER_FLASH_PCT * S && insiderBoughtBefore < INSIDER_FLASH_PCT * S && (
                    <> {t.trade.insiderFlash(fmt.pct(INSIDER_FLASH_PCT, 0))}</>
                  )}
                </div>
              )}
            </>
          );
        }}
        after={(n) => t.form.personalCashAfter(fmt.money(me.cash - shareBuyCost(p, n, S)))}
        onSubmit={(shares) => sendAction({ type: 'buyShares', companyId: c.id, shares })}
      />
      <AmountForm
        label={t.trade.sell}
        unit="shares"
        max={sellable}
        submitLabel={t.trade.sell}
        danger
        disabledReason={
          mine <= 0 ? t.trade.noShares : founderLocked ? t.trade.founderLocked(c.name) : sellable <= 0 ? t.trade.allLocked : null
        }
        info={(n) => {
          const proceeds = shareSellProceeds(p, n, S);
          const after = (mine - n) / S;
          return (
            <>
              <Rich text={t.trade.sellInfo(fmt.money(proceeds), fmt.sharePrice(sharePriceAfter(p, n, S, 'sell')), fmt.pct(after, pctDigits(after)))} />
              {isController && n >= mine && <div className="warn">{t.trade.sellAll(c.name)}</div>}
              {isController && n < mine && after <= CONTROL_THRESHOLD && myPct > CONTROL_THRESHOLD && (
                <div className="warn">{t.trade.below50}</div>
              )}
            </>
          );
        }}
        after={(n) => t.form.personalCashAfter(fmt.money(me.cash + shareSellProceeds(p, n, S)))}
        onSubmit={(shares) => sendAction({ type: 'sellShares', companyId: c.id, shares })}
      />
    </div>
  );
}

/** Lanceur d'alerte (§7) : cash perso, une fois par trimestre, sur une entreprise que l'on ne dirige pas. */
function WhistleTile({ company: c }: { company: CompanyView }) {
  const { view, me } = useGame();
  const t = useT();
  const fmt = useFmt();
  const [confirm, setConfirm] = useState(false);
  const done = view.self?.whistleblownThisTurn === true;
  const reason = done ? t.whistle.done : me.cash < WHISTLEBLOW_COST ? t.whistle.noCash(fmt.money(WHISTLEBLOW_COST)) : null;
  return (
    <div className="action-tile whistle-tile">
      <div>
        <strong>{t.whistle.title}</strong>
        <p className="small muted">{t.whistle.body(fmt.money(WHISTLEBLOW_COST), WHISTLEBLOW_SCANDAL, fmt.num(c.scandalMultiplier ?? 1), fmt.num(WHISTLEBLOW_SCANDAL * (c.scandalMultiplier ?? 1)))}</p>
        <p className="small">
          {t.whistle.level(t.scandalLevel[c.scandalLevel])} <ScandalBadge level={c.scandalLevel} />
        </p>
        {reason && <p className="small muted italic">{reason}</p>}
      </div>
      <button type="button" className="btn danger" disabled={Boolean(reason)} onClick={() => setConfirm(true)}>
        {t.whistle.act}
      </button>
      {confirm && (
        <ConfirmModal
          title={t.whistle.confirmTitle(c.name)}
          message={<p>{t.whistle.confirmBody(fmt.money(WHISTLEBLOW_COST), c.name)}</p>}
          confirmLabel={t.whistle.confirm}
          onConfirm={() => void sendAction({ type: 'whistleblow', companyId: c.id })}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
