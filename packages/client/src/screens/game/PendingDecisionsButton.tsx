import { useEffect, useId, useRef, useState } from 'react';
import { hexPlaceLabel } from '@muchomoney/core';
import { useGame } from '../../hooks/useGame';
import { useContent, useRoomLang, useT } from '../../i18n';
import { useFmt } from '../../fmt';
import { cx } from '../../util';
import { closeAlert } from './CloseBanner';
import { pendingDecisions, quarterDecisionCount } from './pendingDecisions';
import { PendingDecisionItem, type DecisionNavigation } from './PendingDecisionItem';
import './pendingDecisions.css';

export function PendingDecisionsPanel({ openMapFor, goTo, onNavigate }: DecisionNavigation) {
  const { view, me } = useGame();
  const t = useT();
  const d = t.pendingDecisions;
  const fmt = useFmt();
  const roomLang = useRoomLang();
  const content = useContent();
  const model = pendingDecisions(view);
  const operating = view.companies.filter((company) => company.controllerId === view.you && company.status === 'active')
    .map((company) => ({ company, products: company.products.filter((product) => product.private && !product.comingSoon) }))
    .filter((group) => group.products.length > 0);
  const navigation = { openMapFor, goTo, onNavigate };
  const lostLabel = ({ bid, siteBid, companyId }: (typeof model.lostControl)[number]): string => {
    const company = view.companies.find((c) => c.id === companyId);
    if (siteBid) return d.deposit(view.siteSlots.find((s) => s.id === siteBid.slotId)?.name ?? siteBid.slotId, content.commodities[siteBid.commodityId].name);
    const place = hexPlaceLabel(bid!.hexId, roomLang, view.siteSlots);
    const name = bid!.project?.name ?? company?.products.find((p) => p.id === bid!.productId)?.name ?? company?.name ?? t.common.unknown;
    return bid!.kind === 'land' || bid!.kind === 'factory' ? `${t.hex.bidKind[bid!.kind]} · ${name} · ${place}`
      : bid!.kind === 'launch' ? d.launch(name, place) : bid!.kind === 'move' ? d.move(name, place) : d.startup(name, place);
  };
  return <div className="pending-decisions-content">
    <h3>{d.committed}</h3>
    {model.items.length === 0 && model.received.length === 0 && model.lostControl.length === 0 && <p className="small muted">{d.empty}</p>}
    {model.groups.filter((g) => g.items.length > 0).map((group) => {
      const plan = group.closePlan;
      const alert = plan && plan.bids > 0 ? closeAlert(plan) : null;
      const warning = !plan || !alert ? null : alert === 'bankrupt' ? t.closeBanner.bankruptTitle
        : alert === 'short' ? t.closeBanner.shortTitle(fmt.money(plan.shortfall)) : t.closeBanner.tightTitle(fmt.money(plan.safeShortfall));
      return <section key={group.company.id} className="pending-company" aria-label={group.company.name}>
        <h4>{group.company.name}</h4>
        <p className="small pending-total"><strong>{d.total}{d.sep}{fmt.money(group.total)}</strong> · {d.cash}{d.sep}{fmt.money(group.company.cash)}</p>
        {plan && plan.bids > 0 && <p className="small muted">{d.coverage(fmt.money(plan.bids), fmt.money(plan.bidsCovered))}</p>}
        {warning && <p className="small warn">{warning}{plan && plan.bidsCovered < plan.bids - 0.5 && <> · {t.closeBanner.bidsCapped(fmt.money(plan.bidsCovered))}</>}</p>}
        {group.items.map((item) => <PendingDecisionItem key={item.key} item={item} {...navigation} />)}
      </section>;
    })}
    {model.personal.length > 0 && <section className="pending-company">
      <h4>{d.personal}</h4>
      <p className="small pending-total"><strong>{d.total}{d.sep}{fmt.money(model.personalTotal)}</strong> · {t.topbar.cash}{d.sep}{fmt.money(me.cash)}</p>
      {model.personal.map((item) => <PendingDecisionItem key={item.key} item={item} {...navigation} />)}
    </section>}
    {model.received.length > 0 && <section className="pending-company">
      <h4>{d.received}</h4>
      {model.received.map((item) => <PendingDecisionItem key={item.key} item={item} {...navigation} />)}
    </section>}
    {/* Contrôle perdu : la mise tombera à la clôture ; pas de retrait possible, elle n'appartient plus à vos décisions. */}
    {model.lostControl.length > 0 && <section className="pending-company pending-lost-control">
      <h4>{d.lostControl}</h4>
      <ul className="small">{model.lostControl.map((item) => <li key={item.key} data-bid-state="lost-control">{lostLabel(item)}</li>)}</ul>
    </section>}
    {model.paid.length > 0 && <section className="pending-paid">
      <h3>{d.paid}</h3>
      <p className="small muted">{d.paidNote}</p>
      {model.groups.filter((g) => g.paid.length > 0).map((group) => <div key={group.company.id}>
        <h4>{group.company.name}</h4>
        <ul className="small">{group.paid.map((item) => <li key={item.key}>{item.kind === 'launch' ? d.paidLaunch(item.product.name) : d.paidCapacity(item.product.name, fmt.lots(item.lots ?? 0))}</li>)}</ul>
      </div>)}
    </section>}
    <details className="pending-saved">
      <summary>{d.saved}</summary>
      <p className="small muted">{d.savedNote}</p>
      {operating.length === 0 && <p className="small muted">{d.savedNone}</p>}
      {operating.map(({ company, products }) => <section key={company.id} className="pending-company">
        <h4><span className="swatch" style={{ background: company.color }} /> {company.name}</h4>
        {products.map((product) => <div key={product.id} className="pending-saved-product">
          <strong>{product.name}</strong>
          <dl>
            <div><dt>{d.savedPrice}</dt><dd>{fmt.money(product.price)}/lot</dd></div>
            <div><dt>{d.savedProduction}</dt><dd>{fmt.lots(product.private!.production)}</dd></div>
            <div><dt>{d.savedMarketing}</dt><dd>{fmt.money(product.private!.marketing)}</dd></div>
            <div><dt>{d.savedResearch}</dt><dd>{fmt.money(product.private!.rnd)}</dd></div>
          </dl>
        </div>)}
      </section>)}
    </details>
  </div>;
}

/** Non-modal popover: normal Tab order, focus on open, Escape returns to the trigger. */
export function PendingDecisionsButton({ openMapFor, goTo }: DecisionNavigation) {
  const { view } = useGame();
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const count = quarterDecisionCount(pendingDecisions(view));
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (event: Event) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  // A new quarter is a new set of decisions; do not leave the old review open.
  useEffect(() => { setOpen(false); }, [view.turn]);
  return <div className="pending-decisions" ref={box}>
    <button type="button" ref={trigger} className={cx('btn small', count === 0 && 'ghost')} aria-expanded={open} aria-controls={id} title={t.pendingDecisions.countHint} onClick={() => setOpen(!open)}>
      {t.pendingDecisions.button(count)}
    </button>
    {open && <div id={id} className="pending-decisions-panel" ref={panel} role="region" aria-label={t.pendingDecisions.button(count)} tabIndex={-1}>
      <PendingDecisionsPanel openMapFor={openMapFor} goTo={goTo} onNavigate={() => setOpen(false)} />
    </div>}
  </div>;
}
