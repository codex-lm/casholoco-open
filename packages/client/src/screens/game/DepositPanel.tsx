/**
 * Fiche complète d'un gisement (§5.5 bis) pour un emplacement déjà choisi : statut, économies face au
 * port, lot livré à chaque usine concernée (table, absente sur téléphone), extraction et news, besoins
 * couverts, puis mise de prix et enchère pour un gisement libre, ou état de la filiale (chantier,
 * sommeil, entretien) et ses boutons si elle est à soi. Le panneau latéral de « La carte » la monte ;
 * les calculs d'aide à la décision vivent dans ./sitesPickerModel (le serveur reste seul juge).
 */
import { useState, type ReactNode } from 'react';
import {
  COMMODITIES,
  SECTORS,
  SITE_OPENING_COST_MULT,
  SITE_UNIT_COST_RATIO,
  slotCapacity,
  type CommodityId,
  type CompanyView,
  type SiteSlotView,
} from '@muchomoney/core';
import { sendAction } from '../../api';
import { extractionCostNow } from '../../transport';
import { AmountForm } from '../../components/AmountForm';
import { ConfirmModal } from '../../components/Modal';
import { useGame } from '../../hooks/useGame';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cx } from '../../util';
import { useT, useUiLang } from '../../i18n';
import { parseNumber, useFmt } from '../../fmt';
import { decisionText } from '../../i18n/decisionReadability';
import { sheetReadabilityMessages } from '../../i18n/sheetReadability';
import { DecisionSummary } from './DecisionSummary';
import { kmLabel } from './city/MapSheets';
import { depositPayback, depositSavings, depositSavingsNow } from './sitesPickerModel';

/** Lots de cette matière consommés par trimestre à la production prévue des produits de l'entreprise. */
export function commodityNeed(company: CompanyView, cid: CommodityId): number {
  let need = 0;
  for (const p of company.products) {
    const per = SECTORS[p.sectorId].inputs[cid] ?? 0;
    if (per > 0) need += Math.max(0, Math.floor(Math.min(p.private?.production ?? 0, p.capacity))) * per;
  }
  return need;
}

/** Richesse d'un gisement d'après sa capacité : 50 lots par trimestre = riche, 40 = moyen, sinon pauvre. */
export function richness(t: ReturnType<typeof useT>, slotId: string): string {
  const cap = slotCapacity(slotId);
  return cap >= 50 ? t.sites.richness.rich : cap >= 40 ? t.sites.richness.medium : t.sites.richness.poor;
}

/**
 * Fiche complète du gisement pour un emplacement déjà choisi : le corps (SiteSheet) puis le pied de
 * décision (enchère ou rappel « pris »), montée dans le panneau latéral de la carte. `hideTitle` :
 * l'en-tête de la case au-dessus nomme déjà le gisement (plateau hexagonal) — le titre est omis.
 * `hostDetails` (plateau) : la fiche de la case a déjà son pli « Détails du lieu ». Pendant une enchère, seuls
 * l'en-tête du gisement (matière, richesse, statut, capacité) et l'enchère restent ici ; le reste de la fiche
 * rejoint ce pli unique par DepositDetails.
 */
export function DepositPanel({ company, slot, hideTitle = false, hostDetails = false, compact = false }: { company: CompanyView; slot: SiteSlotView; hideTitle?: boolean; hostDetails?: boolean; compact?: boolean }) {
  const desktop = useMediaQuery('(min-width: 720px)');
  const details = sheetReadabilityMessages(useUiLang());
  const bidding = depositBidding(company, slot);
  if (compact) return bidding ? <DepositFooter company={company} slot={slot} desktop={false} compact />
    : <SiteSheet company={company} slot={slot} hideHead hideDecision compact />;
  return (
    <>
      {bidding ? <>
        {hostDetails && <SiteHead slot={slot} hideTitle={hideTitle} />}
        <DepositFooter company={company} slot={slot} desktop={desktop} />
        {!hostDetails && <details className="pk-details"><summary>{details.locationDetails}</summary>
          <SiteSheet company={company} slot={slot} hideTitle hideDecision />
        </details>}
      </> : <>
        <SiteSheet company={company} slot={slot} hideTitle={hideTitle} />
        {depositHasFooter(company, slot) && <DepositFooter company={company} slot={slot} desktop={desktop} />}
      </>}
    </>
  );
}

/**
 * Plateau : ce que le pli « Détails du lieu » de la case reçoit du gisement. Pendant une enchère, la fiche du gisement
 * sans son en-tête (resté au-dessus de l'enchère, voir DepositPanel `hostDetails`) ; sinon rien, la fiche est visible.
 */
export function DepositDetails({ company, slot }: { company: CompanyView; slot: SiteSlotView }) {
  if (!depositBidding(company, slot)) return null;
  return <SiteSheet company={company} slot={slot} hideTitle hideHead hideDecision />;
}

/** Vrai quand la fiche se résume à l'enchère (gisement libre où l'entreprise peut miser) : le reste se replie. */
export function depositBidding(company: CompanyView, slot: SiteSlotView): boolean {
  return !slot.companyId && depositHasFooter(company, slot);
}

/** Vrai quand la fiche a un pied : enchère possible sur un gisement libre, rappel « pris » sinon. */
export function depositHasFooter(company: CompanyView, slot: SiteSlotView): boolean {
  return slot.companyId !== company.id && (!!slot.companyId || !company.sites?.some((s) => s.commodityId === slot.commodityId));
}

/** Pied de fiche : pas d'enchère sur un gisement pris ; la règle de l'enchère en rappel sur ordinateur. */
export function DepositFooter({ company, slot, desktop, compact = false }: { company: CompanyView; slot: SiteSlotView; desktop: boolean; compact?: boolean }): ReactNode {
  if (slot.companyId === company.id) return null;
  if (slot.companyId) return <DepositTakenFoot />;
  if (company.sites?.some((s) => s.commodityId === slot.commodityId)) return null;
  return <SiteBidFooter key={`${company.id}:${slot.id}`} company={company} slot={slot} desktop={desktop} compact={compact} />;
}

/** Rappel sous la fiche d'un gisement exploité par un rival. */
function DepositTakenFoot() {
  const p = useT().sitesPicker;
  return <p className="pk-note">{p.takenFoot}</p>;
}

/** En-tête de la fiche d'un gisement : matière et richesse, nom (sauf `hideTitle`), exploitant ou « libre » et capacité. */
export function SiteHead({ slot, hideTitle = false }: { slot: SiteSlotView; hideTitle?: boolean }) {
  const { view } = useGame();
  const t = useT();
  const p = t.sitesPicker;
  const cap = slotCapacity(slot.id);
  const owner = slot.companyId ? view.companies.find((c) => c.id === slot.companyId) : undefined;
  return (
    <>
      <p className="pk-kicker">{p.kindRich(t.sites.names[slot.commodityId], richness(t, slot.id))}</p>
      {!hideTitle && <h4 className="pk-title">{slot.name}</h4>}
      <p className="pk-sub">{owner ? p.statusTaken(owner.name, cap) : p.statusFree(cap)}</p>
    </>
  );
}

/**
 * Fiche du gisement choisi : statut, économies face au port, lot livré à chaque usine concernée (table,
 * absente sur téléphone), extraction et news, besoins couverts, puis mise de prix et enchère pour un
 * gisement libre, ou état de la filiale (chantier, sommeil, entretien) et ses boutons si elle est à soi.
 * `hideTitle` : l'en-tête au-dessus nomme déjà le gisement — le titre n'est pas répété ; `hideHead` : tout l'en-tête
 * (SiteHead) est déjà affiché au-dessus.
 */
export function SiteSheet({ company, slot, hideTitle = false, hideHead = false, hideDecision = false, readOnly = false, compact = false }: { company: CompanyView; slot: SiteSlotView; hideTitle?: boolean; hideHead?: boolean; hideDecision?: boolean; readOnly?: boolean; compact?: boolean }) {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const decision = decisionText(useUiLang());
  const desktop = useMediaQuery('(min-width: 720px)');
  const [confirm, setConfirm] = useState<'sleep' | 'wake' | null>(null);
  const p = t.sitesPicker;
  const cid = slot.commodityId;
  const name = t.sites.names[cid];
  const owner = slot.companyId ? view.companies.find((c) => c.id === slot.companyId) : undefined;
  const mine = slot.companyId === company.id;
  const ownsCommodity = company.sites?.some((s) => s.commodityId === cid) ?? false;
  const commodity = view.commodities.find((c) => c.id === cid);
  const market = commodity?.price ?? COMMODITIES[cid].basePrice;
  const base = COMMODITIES[cid].basePrice;
  const reserve = base * SITE_OPENING_COST_MULT;
  const site = mine ? company.sites?.find((s) => s.id === slot.id) : undefined;
  // Coût du lot à la prochaine clôture : les news (grèves, inspections, subventions…) le font varier (§5.5 bis).
  const usual = site?.unitCost ?? base * SITE_UNIT_COST_RATIO;
  const current = site?.currentUnitCost ?? extractionCostNow(cid, commodity?.siteCostFactor);
  const factor = usual > 0 ? current / usual : 1;
  const need = commodityNeed(company, cid);
  // Économies au coût normal (étiquettes, remboursement) et au coût du trimestre courant (table).
  const sav = depositSavings(view, company, slot.id);
  const now = depositSavingsNow(view, company, slot.id);
  const payback = depositPayback(reserve, sav.total, view.config.totalTurns - view.turn);
  // Sa mise (secrète) : en attente de la clôture, ou son issue au dernier règlement.
  const bid = view.self?.siteBids?.find((b) => b.companyId === company.id && b.commodityId === cid);
  const result = bid?.slotId === slot.id ? bid.result : undefined;
  // Ses filiales de cette matière (deux après une fusion) : sommeil, chantier et entretien.
  const own = mine ? (company.sites?.filter((s) => s.commodityId === cid) ?? []) : [];
  // L'autre filiale de la matière, quand une fusion en a laissé deux : sa ligne dit son état inverse.
  const sibling = own.find((s) => s.id !== slot.id);
  const running = !!site && !site.dormant && site.activeFrom <= view.turn;
  const upkeep = own.reduce((n, s) => n + s.upkeep, 0);
  // Extraction prévue à la clôture (plan du moteur) : les besoins d'abord, puis le surplus (§5.7).
  const planned = mine ? (company.private?.closePlan?.sites.filter((s) => s.siteId === slot.id) ?? []) : [];
  const plannedLots = planned.reduce((n, s) => n + s.needed + s.surplus, 0);
  const plannedCap = planned.reduce((n, s) => n + s.capacity, 0);
  const restartDate = fmt.date(view.turn + 1, view.config.startYear);
  const showDelivered = (!owner || mine) && now.deliveries.length > 0;
  const managementControls = !readOnly && site && (site.dormant ? (
    <button type="button" className="btn small" aria-label={t.sites.wakeAria(name)} onClick={() => setConfirm('wake')}>{t.sites.wake}</button>
  ) : (
    <button type="button" className="btn small ghost" aria-label={t.sites.sleepAria(name)} onClick={() => setConfirm('sleep')}>{t.sites.sleep}</button>
  ));
  const managementConfirmation = !readOnly && confirm && <ConfirmModal
    title={confirm === 'sleep' ? t.sites.sleepTitle(name) : t.sites.wakeTitle(name)}
    message={<p>{confirm === 'sleep' ? t.sites.sleepConfirm(fmt.money(upkeep)) : t.sites.wakeConfirm(restartDate)}</p>}
    confirmLabel={confirm === 'sleep' ? t.sites.sleep : t.sites.wake}
    onConfirm={() => void sendAction({ type: 'setSiteDormant', companyId: company.id, commodityId: cid, dormant: confirm === 'sleep' })}
    onClose={() => setConfirm(null)} />;
  if (compact) return <div className="hx-action-fields hx-subsidiary-compact">
    <p className="hx-action-costs">{owner && !mine ? p.takenNote : !site && ownsCommodity ? p.siteExists
      : site?.dormant ? t.sites.dormant(fmt.money(site.upkeep))
        : site && !running ? t.sites.building(fmt.date(site.activeFrom, view.config.startYear)) : t.sites.active}</p>
    {managementControls}
    {managementConfirmation}
  </div>;

  return (
    <>
      {!hideHead && <SiteHead slot={slot} hideTitle={hideTitle} />}
      {owner && result?.outcome === 'lost' && <p className="small warn">{t.sites.lost(fmt.money(result.price), result.bidders)}</p>}
      {owner && result?.outcome === 'failed' && <p className="small warn">{t.sites.failed}</p>}
      {!hideDecision && (mine || !owner && !ownsCommodity) && sav.total > 0 && sav.coveredLots > 0 && (
        <div className="pk-save">
          <div className="pk-save-num">≈ {fmt.money(sav.total)}</div>
          <div className="pk-save-note">
            {mine && !running ? p.savingsPotential : p.savingsNote}
            {running && factor < 1 - 0.005 && now.total > 0 && <> {p.savingsNews(fmt.money(now.total))}</>}
          </div>
        </div>
      )}
      {desktop && showDelivered && (
        <div>
          <p className="pk-kicker">{p.deliveredTitle}</p>
          {/* Pas de classe de tableau hors .pk-details : styles en ligne (écart CSS noté). */}
          <table role="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', borderTop: 'none', padding: '4px 6px 4px 0' }}>
                  {p.colPlant}
                </th>
                <th scope="col" style={{ textAlign: 'left', borderTop: 'none', padding: '4px 6px' }}>
                  {p.colHere}
                </th>
                <th scope="col" style={{ textAlign: 'left', borderTop: 'none', padding: '4px 6px' }}>
                  {p.colPort}
                </th>
                <th scope="col" style={{ textAlign: 'left', borderTop: 'none', padding: '4px 0 4px 6px' }}>
                  {p.colKm}
                </th>
              </tr>
            </thead>
            <tbody>
              {now.deliveries.map((d) => (
                <tr key={d.productId}>
                  <td style={{ padding: '4px 6px 4px 0', borderTop: '1px solid var(--hair)' }}>{d.productName}</td>
                  <td style={{ padding: '4px 6px', borderTop: '1px solid var(--hair)' }}>{fmt.money(d.herePrice)}</td>
                  <td className="muted" style={{ padding: '4px 6px', borderTop: '1px solid var(--hair)' }}>
                    {fmt.money(d.portPrice)}
                  </td>
                  <td className="muted" style={{ padding: '4px 0 4px 6px', borderTop: '1px solid var(--hair)' }}>
                    {kmLabel(fmt, d.km)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="pk-note">{p.extraction(fmt.money(current))}</p>
      {Math.abs(factor - 1) > 0.005 && (
        <p className={cx('pk-note', factor > 1 ? 'pk-down' : 'pk-up')}>
          {p.news(fmt.num(Math.round(factor * 100) / 100), fmt.money(usual))}
        </p>
      )}
      <p className="pk-note">
        {need > 0
          ? p.needLine(fmt.int(need), fmt.int(sav.coveredLots))
          : owner && !mine
            ? p.needNone
            : p.needNoneMarket(fmt.money(market))}
      </p>
      {owner && !mine ? (
        <p className="pk-note">{p.takenNote}</p>
      ) : mine ? (
        <>
          {/* Après une fusion, une filiale peut dormir quand l'autre tourne : chaque état a sa ligne et son bouton. */}
          {site && !site.dormant &&
            (running ? (
              <>
                <p className="small up">
                  <span aria-hidden>✅ </span>
                  {t.sites.active}
                </p>
                {planned.length > 0 && (
                  <p className={cx('small', plannedLots < plannedCap ? 'warn' : 'muted')}>
                    {t.sites.planned(plannedLots, plannedCap)}
                    {plannedLots < plannedCap && <> : {t.sites.plannedShort}</>}
                  </p>
                )}
              </>
            ) : (
              <p className="small warn">{t.sites.building(fmt.date(site.activeFrom, view.config.startYear))}</p>
            ))}
          {site?.dormant && (
            <p className="small warn">
              <span aria-hidden>💤 </span>
              {t.sites.dormant(fmt.money(site.upkeep))}
            </p>
          )}
          {result?.outcome === 'won' && <p className="small muted">{t.sites.wonAt(fmt.money(result.price), result.bidders)}</p>}
          {sibling && !!sibling.dormant !== !!site?.dormant && (
            <p className="small muted">
              {sibling.dormant ? t.sites.siblingDormant(sibling.name, fmt.money(sibling.upkeep)) : t.sites.siblingActive(sibling.name)}
            </p>
          )}
          {/* Le bouton suit l'état du gisement montré (sommeil et relance restent communs aux deux filiales fusionnées). */}
          {managementControls}
        </>
      ) : ownsCommodity ? (
        <p className="pk-note">{p.siteExists}</p>
      ) : !hideDecision ? (
        <>
          <p className="pk-note">
            {payback.quarters === null
              ? p.reserveOnly(fmt.money(reserve))
              : payback.never
                ? p.paybackNever(fmt.money(reserve))
                : p.payback(fmt.money(reserve), payback.quarters)}
          </p>
          <p className="small muted">{decision.depositConditions}</p>
        </>
      ) : null}
      {managementConfirmation}
    </>
  );
}

/** Bid controls live outside the scrolling sheet body, and remount for each company/deposit. */
export function SiteBidFooter({ company, slot, desktop, compact = false }: { company: CompanyView; slot: SiteSlotView; desktop: boolean; compact?: boolean }) {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const uiLang = useUiLang();
  const decision = decisionText(uiLang);
  const p = t.sitesPicker;
  const cid = slot.commodityId;
  const name = t.sites.names[cid];
  const reserve = COMMODITIES[cid].basePrice * SITE_OPENING_COST_MULT;
  const bid = view.self?.siteBids?.find((b) => b.companyId === company.id && b.commodityId === cid);
  const pending = bid && !bid.result ? bid : undefined;
  const result = bid?.slotId === slot.id ? bid.result : undefined;
  const amountKey = `${company.id}:${slot.id}:${pending?.amount ?? ''}`;
  const [live, setLive] = useState<{ key: string; raw: string } | null>(null);
  const initial = pending?.slotId === slot.id ? pending.amount : reserve;
  const amount = live?.key === amountKey ? parseNumber(live.raw, uiLang) : initial;
  const validAmount = Number.isFinite(amount) && amount >= reserve && amount <= company.cash + 1e-6;
  const savings = depositSavings(view, company, slot.id);
  const payback = validAmount ? depositPayback(amount, savings.total, view.config.totalTurns - view.turn) : null;
  const pendingControls = pending && <p className="small up">
    {t.sites.pending(fmt.money(pending.amount), view.siteSlots.find((s) => s.id === pending.slotId)?.name ?? name)}{' '}
    <button type="button" className="btn tiny ghost" aria-label={t.sites.withdrawAria(name)} onClick={() => void sendAction({ type: 'cancelSiteBid', companyId: company.id, commodityId: cid })}>{t.sites.withdraw}</button>
  </p>;
  const resultNotice = <>
    {result?.outcome === 'lost' && <p className="small warn">{t.sites.lost(fmt.money(result.price), result.bidders)}</p>}
    {result?.outcome === 'failed' && <p className="small warn">{t.sites.failed}</p>}
  </>;
  const amountForm = <AmountForm
    key={amountKey} label={p.bidField(fmt.unit)} min={reserve} max={company.cash} presets={[]} initial={initial}
    submitLabel={pending ? pending.slotId === slot.id ? t.sites.bidChange : p.bidMove : p.bidCta}
    disabledReason={view.turn >= view.config.totalTurns ? t.sites.lastTurn : company.cash < reserve ? t.sites.noCash : null}
    onRawChange={(raw) => setLive({ key: amountKey, raw })}
    after={(amount) => t.form.cashAfterWorst(fmt.money(company.cash - amount))}
    onSubmit={(amount) => sendAction({ type: 'bidSite', companyId: company.id, slotId: slot.id, amount })} />;
  if (compact) return <div className="hx-action-fields hx-subsidiary-bid-compact">
    {pendingControls}{resultNotice}{amountForm}
    <p className="hx-action-costs" title={p.auctionFoot}>{decision.reserve} : <strong>{fmt.money(reserve)}</strong></p>
    <details className="hx-action-rules"><summary>{t.hex.formRulesTitle}</summary>
      <p className="small muted">{p.auctionFoot}</p><p className="small muted">{decision.depositClose}</p><p className="small muted">{decision.depositConditions}</p>
    </details>
  </div>;
  return (
    <>
      <DecisionSummary destination={slot.name} total={validAmount ? fmt.money(amount) : '—'} maximum
        reserve={!validAmount || amount !== reserve ? fmt.money(reserve) : undefined} timing={decision.depositClose}
        gain={fmt.money(savings.total)} savings
        payback={!validAmount ? '—' : payback?.quarters === null || !payback ? decision.noPayback : decision.quarters(payback.quarters)}
        conditions={decision.depositConditions}>
      {payback?.never && payback.quarters !== null && <p className="small warn">{decision.latePayback}</p>}
      {pendingControls}{resultNotice}{amountForm}
      </DecisionSummary>
      {desktop && <p className="pk-note">{p.auctionFoot}</p>}
    </>
  );
}
