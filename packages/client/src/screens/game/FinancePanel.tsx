import { useState } from 'react';
import type { CompanyView } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useGame } from '../../hooks/useGame';
import { AmountForm } from '../../components/AmountForm';
import { ConfirmModal } from '../../components/Modal';
import { InfoTip } from '../../components/bits';
import {
  CEO_BONUS_SCANDAL_PER_TRANCHE,
  CEO_BONUS_TRANCHE_PCT,
  FLOAT_MIN_PCT,
  MAX_ACTIVE_PRODUCTS_MERGED,
  floatMinBuybackMax,
  POISON_PILL,
  biggestOtherHolder,
  buybackRivalTakeover,
  mergeRivalTakeover,
  safeBuybackMax,
  holdingPct,
  maxAffordableShares,
  shareBuyCost,
  sharePriceAfter,
} from '../../rules';
import { useT, useUiLang } from '../../i18n';
import { Rich } from '../../i18n/Rich';
import { useFmt } from '../../fmt';
import { THREAT_STAKE } from './city/model';
import { DecisionSummary } from './DecisionSummary';
import { companyLoanPreview } from './economicDecisionModel';
import { uiDecisionCopy } from './uiDecisionCopy';

/**
 * Finances : prêt, dividende et bonus visibles, le remboursement seulement avec une dette ; rachat d'actions, fusion et
 * pilule empoisonnée dans le volet « Autres opérations ». La pilule en sort dès qu'un rival détient 20 % (la menace de
 * la barre du jeu) ou pendant sa recharge ; elle n'est utilisable qu'à partir de 25 % (le moteur refuse en dessous).
 * Sous cette menace, le volet s'ouvre aussi de lui-même : le rachat d'actions est l'autre défense (le joueur peut le
 * refermer). La communication de crise est dans les actions discutables, avec la jauge (ShadyPanel).
 */
export function FinancePanel({ company }: { company: CompanyView }) {
  const { view, me, myCompanies, playerName } = useGame();
  const t = useT();
  const fmt = useFmt();
  const copy = uiDecisionCopy(useUiLang());
  const f = t.finance;
  const priv = company.private;
  const [confirm, setConfirm] = useState<'pill' | 'merge' | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string>('');

  const cash = Math.max(0, company.cash);
  const myPct = holdingPct(company, me.id);
  const S = company.sharesOutstanding;
  const p = company.sharePrice;

  // Pilule empoisonnée : hors du volet dès 20 % (THREAT_STAKE) ou pendant la recharge ; utilisable dès 25 %.
  const predator = biggestOtherHolder(company, me.id);
  const pillCooldown = priv?.modifiers.find((m) => m.kind === 'poison_pill_cooldown');
  const pillShares = Math.round(S * POISON_PILL.newSharesPct);
  const pillCost = pillShares * p * POISON_PILL.pricePct;
  const threatened = predator !== null && predator.pct >= THREAT_STAKE;
  const pillOutside = threatened || pillCooldown !== undefined;
  // Entre 20 et 25 % : la tuile attend, avec le seuil et la part du rival (tronquée : 24,96 % ne s'affiche pas « 25,0 % »).
  // La recharge passe avant : la raison « utilisable dès 25 % » (qui nomme le rival) ne s'affiche qu'en dehors d'elle.
  const pillWaiting = !pillCooldown && threatened && predator.pct < POISON_PILL.triggerPct;
  const pillReason = pillCooldown
    ? f.pillCooldown(pillCooldown.turnsLeft)
    : pillWaiting
      ? f.pillFrom(fmt.pct(POISON_PILL.triggerPct, 0), playerName(predator.id), fmt.pct(Math.floor(predator.pct * 1000) / 1000))
      : !predator || predator.pct < POISON_PILL.triggerPct
        ? f.pillReserved
        : me.cash < pillCost
          ? f.pillNeedCash(fmt.money(pillCost))
          : null;

  const affordableBuyback = Math.min(company.floatShares, maxAffordableShares(p, S, cash, company.floatShares));
  // Racheter réduit S : un rival proche de 50 % pourrait passer au-dessus et prendre le contrôle.
  // Le max proposé s'arrête juste avant ; au-delà, l'estimation affiche l'alerte.
  const buybackSafe = safeBuybackMax(company, me.id);
  // Flottant minimal (§6.2) : le rachat ne peut pas porter le plus gros actionnaire au-delà de 50 % + 1 action
  // si le flottant tombe sous FLOAT_MIN (40 %) du capital.
  const buybackFloatCap = floatMinBuybackMax(company);
  const buybackMax = Math.min(affordableBuyback, buybackSafe, buybackFloatCap);
  const buybackBlocker = buybackRivalTakeover(company, me.id, affordableBuyback);
  const mergeCandidates = myCompanies.filter((c) => c.id !== company.id);
  const target = mergeCandidates.find((c) => c.id === mergeTarget) ?? mergeCandidates[0];
  const mergeRival = target ? mergeRivalTakeover(company, target, me.id) : null;
  // Start-up créée ce tour : ni dividende, ni bonus, ni fusion avant la clôture (le moteur refuse).
  const justFounded = priv?.turnFlags.justFounded === true;
  const mergeBlocked = justFounded || target?.private?.turnFlags.justFounded === true;
  const canMerge = mergeCandidates.length > 0 && target !== undefined;
  // Titre du volet : ce qu'il contient, dans l'ordre d'affichage.
  const moreItems = [f.otherOpsItems.buyback, ...(canMerge ? [f.otherOpsItems.merge] : []), ...(pillOutside ? [] : [f.otherOpsItems.pill])];

  const pillTile = (
    <div className="action-tile">
      <div>
        <strong>{f.pillTitle}</strong>
        <p className="small muted">
          {f.pillBody(fmt.int(pillShares), fmt.money(pillCost), POISON_PILL.scandal * (company.scandalMultiplier ?? 1))}
          {predator && predator.pct > 0 && !pillWaiting && f.biggestRival(playerName(predator.id), fmt.pct(predator.pct))}
        </p>
        {pillReason && <p className="small muted italic">{pillReason}</p>}
      </div>
      <button type="button" className="btn danger" disabled={Boolean(pillReason)} onClick={() => setConfirm('pill')}>
        {f.unleash}
      </button>
    </div>
  );

  return (
    <div className="finance">
      <div className="finance-grid">
        <AmountForm
          label={
            <>
              {f.loanLabel} <InfoTip text={t.tips.loanCap} align="left" />
            </>
          }
          max={priv?.loanLimit ?? 0}
          submitLabel={f.borrow}
          disabledReason={priv && priv.loanLimit <= 0 ? f.banksDone : null}
          info={(amount) => {
            const preview = companyLoanPreview(company, view.interestRate, amount);
            return <>
              <p>{f.loanInfo(fmt.pct(view.interestRate, 2))}</p>
              {preview && <DecisionSummary rows={[
                { label: copy.effectiveRate, value: fmt.pct(preview.rate, 2) },
                { label: copy.nextInterest, value: fmt.money(preview.interest) },
                { label: copy.extraInterest, value: fmt.signedMoney(preview.extraInterest) },
              ]} note={copy.loanEstimate} />}
            </>;
          }}
          after={(a) => t.form.cashDebtAfter(fmt.money(company.cash + a), fmt.money(company.debt + a))}
          onSubmit={(amount) => sendAction({ type: 'takeLoan', companyId: company.id, amount })}
        />
        {company.debt > 0 && (
          <AmountForm
            label={f.repayLabel}
            max={Math.min(company.debt, cash)}
            submitLabel={f.repay}
            after={(a) => t.form.cashDebtAfter(fmt.money(company.cash - a), fmt.money(company.debt - a))}
            onSubmit={(amount) => sendAction({ type: 'repayLoan', companyId: company.id, amount })}
          />
        )}
        <AmountForm
          label={f.dividendLabel}
          max={cash}
          submitLabel={f.distribute}
          disabledReason={justFounded ? f.dividendJustFounded : null}
          info={(amount) => <Rich text={f.dividendInfo(fmt.money(amount * myPct), fmt.pct(myPct))} />}
          after={(a) => t.form.cashAfter(fmt.money(company.cash - a))}
          onSubmit={(amount) => sendAction({ type: 'payDividend', companyId: company.id, amount })}
        />
        <AmountForm
          label={f.bonusLabel}
          max={priv?.maxBonus ?? 0}
          submitLabel={f.deserve}
          danger
          disabledReason={justFounded ? f.bonusJustFounded : priv && priv.maxBonus <= 0 ? f.bonusCap : null}
          info={(amount) => {
            const tranches = cash > 0 ? amount / (cash * CEO_BONUS_TRANCHE_PCT) : 0;
            return <>{f.bonusInfo(Math.round(tranches * CEO_BONUS_SCANDAL_PER_TRANCHE * (company.scandalMultiplier ?? 1)))}</>;
          }}
          after={(a) => t.form.cashAfter(fmt.money(company.cash - a))}
          onSubmit={(amount) => sendAction({ type: 'ceoBonus', companyId: company.id, amount })}
        />
      </div>

      {pillOutside && <div className="finance-buttons">{pillTile}</div>}

      {/* Sous la menace (20 %), ouvert d'office : React ne repose l'attribut que si la menace change, le joueur peut le refermer. */}
      <details className="tab-fold finance-more" open={threatened}>
        <summary>
          {f.otherOps} <span className="muted fold-meta">{`· ${moreItems.join(' · ')}`}</span>
        </summary>
        <AmountForm
          label={f.buybackLabel}
          unit="shares"
          max={buybackMax}
          submitLabel={f.buyback}
          disabledReason={
            priv?.turnFlags.buybackDone
              ? f.buybackDone
              : company.floatShares <= 0
                ? f.noFloat
                : buybackSafe <= 0 && buybackBlocker
                  ? f.buybackBlocked(company.name, playerName(buybackBlocker.id))
                  : null
          }
          info={(n) => {
            const rival = buybackRivalTakeover(company, me.id, n);
            return (
              <>
                <Rich
                  text={f.buybackInfo(
                    fmt.money(shareBuyCost(p, n, S)),
                    fmt.sharePrice(sharePriceAfter(p, n, S, 'buy')),
                    fmt.pct((company.holdings[me.id] ?? 0) / Math.max(1, S - n)),
                  )}
                />
                {buybackFloatCap < Math.min(affordableBuyback, buybackSafe) && n >= buybackFloatCap && (
                  <div className="warn">{f.buybackFloat(fmt.int(buybackFloatCap), fmt.pct(FLOAT_MIN_PCT, 0))}</div>
                )}
                {rival ? (
                  <div className="takeover-warning">{f.buybackTakeover(playerName(rival.id), fmt.pct(rival.pct), company.name)}</div>
                ) : (
                  buybackMax < affordableBuyback &&
                  n >= buybackMax &&
                  buybackBlocker && <div className="warn">{f.buybackCapped(fmt.int(buybackMax), playerName(buybackBlocker.id))}</div>
                )}
              </>
            );
          }}
          after={(n) => t.form.cashAfter(fmt.money(company.cash - shareBuyCost(p, n, S)))}
          onSubmit={(shares) => sendAction({ type: 'buyback', companyId: company.id, shares })}
        />
        <div className="finance-buttons">
          {canMerge && (
            <div className="action-tile">
              <div className="grow">
                <strong>{f.mergeTitle}</strong>
                <p className="small muted">
                  <Rich
                    text={f.mergeBody(
                      company.name,
                      fmt.sharePrice(target.sharePrice),
                      fmt.sharePrice(p),
                      fmt.fixed(target.sharePrice / (p || 1), 3),
                      company.ticker,
                      target.ticker,
                    )}
                  />{' '}
                  {f.mergeSlots(MAX_ACTIVE_PRODUCTS_MERGED)}
                </p>
                <select value={target.id} onChange={(e) => setMergeTarget(e.target.value)} aria-label={f.mergeAria}>
                  {mergeCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name} ({c.ticker})
                    </option>
                  ))}
                </select>
                {mergeBlocked && <p className="small muted italic">{f.mergeJustFounded}</p>}
              </div>
              <button type="button" className="btn" disabled={mergeBlocked} onClick={() => setConfirm('merge')}>
                {f.merge}
              </button>
            </div>
          )}
          {!pillOutside && pillTile}
        </div>
      </details>

      {confirm === 'pill' && (
        <ConfirmModal
          title={f.pillConfirmTitle}
          message={<p>{f.pillConfirmBody(fmt.money(pillCost), fmt.int(pillShares), fmt.num(POISON_PILL.sentiment))}</p>}
          confirmLabel={f.swallow}
          onConfirm={() => void sendAction({ type: 'poisonPill', companyId: company.id })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'merge' && target && !mergeBlocked && (
        <ConfirmModal
          title={f.mergeConfirmTitle(target.name)}
          message={
            <>
              <p>{f.mergeConfirmBody(target.name, company.name, company.ticker)}</p>
              {mergeRival && <div className="takeover-warning">{f.mergeRival(playerName(mergeRival.id), fmt.pct(mergeRival.pct), company.name)}</div>}
            </>
          }
          confirmLabel={f.merge}
          onConfirm={() => void sendAction({ type: 'merge', absorberId: company.id, targetId: target.id })}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
