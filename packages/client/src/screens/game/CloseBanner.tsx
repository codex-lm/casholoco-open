/**
 * Bandeau « trésorerie de la clôture » (§5.7) : rien n'est emprunté d'office. En tête de clôture, la trésorerie paie
 * les obligations ; le reste se paie avec ce qui reste et les ventes du trimestre. Quand il manquera de l'argent en fin
 * de trimestre (ventes attendues comprises), ou qu'une mise dépend de ventes qui peuvent décevoir, le bandeau dit ce
 * qui manque, ce que la clôture paie et dans quel ordre, ce qui se passera si rien ne change (faillite, mises
 * plafonnées, production réduite, marketing raboté) et propose d'emprunter ce qu'il faut, intérêts en plus compris :
 * juste ce qui manque, ou avec une marge d'un écart type de la demande, dans la limite de ce que prêtent les banques.
 * Le plan vient du moteur (`private.closePlan`) : le calcul de la résolution, sur les ventes attendues.
 */
import { useId, useState } from 'react';
import type { ClosePlan, CompanyView } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useT } from '../../i18n';
import { Rich } from '../../i18n/Rich';
import { useFmt } from '../../fmt';
import { cx } from '../../util';

/** Ce que le plan de clôture annonce : faillite, manque, ou mise suspendue à des ventes qui peuvent décevoir. */
export function closeAlert(plan: ClosePlan | undefined): 'bankrupt' | 'short' | 'tight' | null {
  if (!plan) return null;
  if (plan.bankrupt) return 'bankrupt';
  if (plan.shortfall > 0) return 'short';
  if (plan.bids > 0 && plan.safeShortfall > 0) return 'tight';
  return null;
}

/** Une de ces entreprises a une clôture à surveiller (pastille de l'onglet). */
export function closeShort(companies: readonly CompanyView[]): boolean {
  return companies.some((c) => closeAlert(c.private?.closePlan) !== null);
}

export function CloseBanner({ company }: { company: CompanyView }) {
  const t = useT();
  const fmt = useFmt();
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const plan = company.private?.closePlan;
  const alert = closeAlert(plan);
  if (!plan || !alert) return null;
  const b = t.closeBanner;
  const ob = plan.obligations;
  const limit = Math.max(0, Math.floor(company.private?.loanLimit ?? 0));
  // Juste ce qui manque, puis avec la marge (seule proposée quand rien ne manque aux ventes attendues).
  const loan = alert === 'tight' ? 0 : Math.min(plan.loan, limit);
  const safe = Math.min(plan.safeLoan, limit);
  const offerSafe = safe >= 1 && safe > loan + 0.5;
  // La marge entière, pas seulement ce que les banques en prêtent.
  const marginCovered = offerSafe && plan.safeLoan <= limit;
  const bids = plan.bids > 0;

  const detail = [
    ob.fixed > 0 && b.fixed(fmt.money(ob.fixed)),
    ob.interest > 0 && b.interest(fmt.money(ob.interest)),
    ob.taxDue > 0 && b.taxDue(fmt.money(ob.taxDue)),
    ob.finesDue > 0 && b.finesDue(fmt.money(ob.finesDue)),
    ob.contracts > 0 && b.contracts(fmt.money(ob.contracts)),
  ].filter((x): x is string => typeof x === 'string');
  const after = [
    bids && b.bids(fmt.money(plan.bids)),
    plan.production.planned > 0 && b.production(fmt.money(plan.production.plannedCost), plan.production.planned),
    plan.marketing.planned > 0 && b.marketing(fmt.money(plan.marketing.planned)),
  ].filter((x): x is string => typeof x === 'string');
  // Ce qui arrivera si rien ne change : la faillite efface le reste.
  const outcomes = plan.bankrupt
    ? [b.bankrupt]
    : [
        plan.bidsCovered < plan.bids - 0.5 && b.bidsCapped(fmt.money(plan.bidsCovered)),
        plan.production.funded < plan.production.planned && b.productionCut(plan.production.funded, plan.production.planned),
        plan.marketing.funded < plan.marketing.planned - 0.5 && b.marketingCut(fmt.money(plan.marketing.funded), fmt.money(plan.marketing.planned)),
      ].filter((x): x is string => typeof x === 'string');

  const borrow = (amount: number) => async () => {
    setBusy(true);
    try {
      await sendAction({ type: 'takeLoan', companyId: company.id, amount });
    } finally {
      setBusy(false);
    }
  };
  const title =
    alert === 'bankrupt' ? b.bankruptTitle : alert === 'short' ? b.shortTitle(fmt.money(plan.shortfall)) : b.tightTitle(fmt.money(plan.safeShortfall));
  const wanted = alert === 'tight' ? plan.safeLoan : plan.loan;

  return (
    <section className={cx('close-banner', alert === 'bankrupt' && 'danger', alert === 'tight' && 'soft')} aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      <p className="small">{b.order(fmt.money(plan.cash))}</p>
      <ol className="small">
        <li>
          <Rich text={b.obligations(fmt.money(ob.total), detail.join(', '))} />
        </li>
      </ol>
      {after.length > 0 && (
        <>
          <p className="small">{b.thenWithSales(fmt.money(plan.sales.planned))}</p>
          <ol className="small" start={2}>
            {after.map((line) => (
              <li key={line}>
                <Rich text={line} />
              </li>
            ))}
          </ol>
        </>
      )}
      {outcomes.length > 0 && (
        <>
          <p className="small">
            <strong>{b.ifNothing}</strong>
          </p>
          <ul className="small">
            {outcomes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {plan.margin > 0 && <p className="small muted">{b.estimate(fmt.money(plan.margin))}</p>}
      {loan >= 1 || offerSafe ? (
        <div className="close-banner-act">
          {loan >= 1 && (
            <button type="button" className="btn primary" disabled={busy} onClick={borrow(loan)}>
              {b.borrow(fmt.money(loan))}
            </button>
          )}
          {offerSafe && (
            <button type="button" className={cx('btn', loan < 1 && 'primary')} disabled={busy} onClick={borrow(safe)}>
              {b.borrowSafe(fmt.money(safe))}
            </button>
          )}
          <span className="small muted">
            {wanted <= limit ? b.borrowCovers(marginCovered) : b.borrowPartial(fmt.money(limit), fmt.money(wanted - limit))}
          </span>
        </div>
      ) : (
        <p className="small warn">{plan.bankrupt ? b.banksDoneBankrupt : b.banksDone(bids)}</p>
      )}
      {(loan >= 1 || offerSafe) && !plan.bankrupt && <p className="small muted">{b.orCut(bids)}</p>}
    </section>
  );
}
