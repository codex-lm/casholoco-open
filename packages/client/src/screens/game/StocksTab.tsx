/**
 * Onglet « Bourse » : la cote par capitalisation (mes lignes repérées à leur rang), puis le détail de l'entreprise choisie. Les chiffres personnels (cash, portefeuille, dette, score) restent dans la
 * barre du jeu ; ici, seul le prêt perso, dans un volet replié tant qu'il n'y a pas de dette.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CompanyView } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useGame } from '../../hooks/useGame';
import { AmountForm } from '../../components/AmountForm';
import { Sparkline } from '../../components/Sparkline';
import { Delta, InfoTip, ScandalBadge, Section, Swatch } from '../../components/bits';
import { CONTROLLED_LOAN_LTV, MARGIN_CALL_RATIO, PERSONAL_LOAN_LTV, PERSONAL_LOAN_SPREAD, STARTUP_SUBSIDY, canFoundStartup, companySectors, holdingPct, pctDigits, priceChange } from '../../rules';
import { cx } from '../../util';
import { useContent, useT, useUiLang } from '../../i18n';
import { useFmt } from '../../fmt';
import { CompanyDetail } from './CompanyDetail';
import { StartupModal } from './StartupModal';
import { stocksMessages } from './stocksMessages';
import './stocks.css';

/** Valeur au cours de mes actions d'une entreprise. */
const holdingValue = (c: CompanyView, playerId: string): number => (c.holdings[playerId] ?? 0) * c.sharePrice;

/**
 * Ordre de « La cote » : les entreprises actives par capitalisation, les plus grosses en tête ; les disparues
 * (faillite, absorption) à la fin. Mes lignes (dirigées ou détenues) restent à leur rang, simplement mises en évidence.
 */
export function quoteOrder(companies: readonly CompanyView[]): CompanyView[] {
  const byCap = (a: CompanyView, b: CompanyView) => b.marketCap - a.marketCap;
  return [...companies.filter((c) => c.status === 'active').sort(byCap), ...companies.filter((c) => c.status !== 'active').sort(byCap)];
}

/**
 * Au cadre suivant (le changement d'onglet remet d'abord la page en haut) : la ligne de l'entreprise au milieu de
 * l'écran, sous les barres collantes, et le focus sur son bouton d'ouverture. Rend de quoi
 * annuler le cadre.
 */
export function revealStockRow(companyId: string): () => void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return () => {};
  const frame = window.requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>(`[data-stock-row="${companyId}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    row.querySelector<HTMLButtonElement>('[data-stock-trigger]')?.focus({ preventScroll: true });
  });
  return () => window.cancelAnimationFrame?.(frame);
}

/** Une alerte ou un lien du bilan mène directement à la fiche ouverte, après le focus de changement d'onglet. */
export function revealStockDetail(companyId: string): () => void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return () => {};
  const frame = window.requestAnimationFrame(() => {
    const detail = document.querySelector<HTMLElement>(`[data-stock-detail="${companyId}"]`);
    if (!detail) return;
    detail.scrollIntoView({ block: 'start' });
    detail.focus({ preventScroll: true });
  });
  return () => window.cancelAnimationFrame?.(frame);
}

/**
 * `focusCompanyId` : l'entreprise à montrer en arrivant (puce d'alerte de la barre du jeu, « ⚠ X 32 % · … ») —
 * sa ligne choisie et sa fiche ouverte, amenée sous les barres et focalisée pour accéder directement aux actions.
 */
export function StocksTab({ selectedCompanyId, onSelectCompany, focusCompanyId = null, focusSeq = 0 }: {
  selectedCompanyId: string | null;
  onSelectCompany: (companyId: string | null) => void;
  focusCompanyId?: string | null;
  focusSeq?: number;
}) {
  const { view, me } = useGame();
  const t = useT();
  const text = stocksMessages[useUiLang()];
  const fmt = useFmt();
  const selectedId = selectedCompanyId;
  const [startup, setStartup] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const detailId = useId();
  const pendingDetailFocus = useRef(false);

  const companies = useMemo(() => quoteOrder(view.companies), [view.companies]);
  const selected = companies.find((c) => c.id === selectedId) ?? null;
  // Start-up : retour en jeu réservé au joueur qui ne dirige plus aucune entreprise (§7) ; en tête de l'onglet.
  const comeback = view.phase === 'playing' && canFoundStartup(view.companies, me.id, view.self?.soldControlThisTurn);

  useEffect(() => (focusCompanyId ? revealStockDetail(focusCompanyId) : undefined), [focusCompanyId, focusSeq]);
  useEffect(() => {
    if (selectedId && pendingDetailFocus.current && detailRef.current) {
      pendingDetailFocus.current = false;
      detailRef.current.focus({ preventScroll: true });
      detailRef.current.scrollIntoView({ block: 'start' });
    }
  }, [selectedId]);

  const selectCompany = (companyId: string) => {
    pendingDetailFocus.current = companyId !== selectedId;
    onSelectCompany(companyId === selectedId ? null : companyId);
  };
  const closeDetail = () => {
    if (selectedId) revealStockRow(selectedId);
    onSelectCompany(null);
  };

  return (
    <div className="stocks">
      {comeback && (
        <div className="row wrap stocks-comeback">
          <button type="button" className="btn primary" onClick={() => setStartup(true)} title={t.company.comebackHint(fmt.money(view.self?.startupSubsidy ?? STARTUP_SUBSIDY))}>
            {t.company.foundComeback}
          </button>
        </div>
      )}

      <PersonalLoan />

      <Section title={t.stocks.title} aside={<span className="small muted">{t.stocks.aside}</span>}>
        <div className="table-scroll stock-table-scroll">
          <table className="table stock-table">
            <caption className="sr-only">{text.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.stocks.cols.company}</th>
                <th scope="col" className="stock-col-extra">{t.stocks.cols.ceo}</th>
                <th scope="col" className="stock-col-extra">{t.stocks.cols.sectors}</th>
                <th scope="col" className="num">{t.stocks.cols.price}</th>
                <th scope="col" className="num">{t.stocks.cols.change}</th>
                <th scope="col" className="stock-col-extra">{t.stocks.cols.trend}</th>
                <th scope="col" className="num stock-col-extra">{t.stocks.cols.marketCap}</th>
                <th scope="col" className="num stock-col-extra">
                  {t.stocks.cols.float} <InfoTip text={t.tips.float} align="right" />
                </th>
                <th scope="col" className="num"><span className="stock-desktop-label">{t.stocks.cols.mine}</span><span className="stock-mobile-label">{text.myStake}</span></th>
                <th scope="col" className="stock-col-extra">{t.stocks.cols.control}</th>
                <th scope="col" className="stock-col-extra">{t.stocks.cols.scandal}</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <StockRow
                  key={c.id}
                  company={c}
                  active={c.id === selectedId}
                  detailId={detailId}
                  onClick={() => selectCompany(c.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {companies.length === 0 && <p className="muted">{t.stocks.empty}</p>}
        <p className="small muted">{t.stocks.footer(fmt.fixed(view.marketSentiment, 2), fmt.money(me.cash))}</p>
      </Section>

      <div ref={detailRef} id={detailId} data-stock-detail={selected?.id} className="stock-detail-target" tabIndex={-1} role={selected ? 'region' : undefined} aria-label={selected ? text.companyDetail(selected.name) : undefined}>
        {selected && <CompanyDetail key={selected.id} company={selected} onClose={closeDetail} />}
      </div>

      {startup && <StartupModal onClose={() => setStartup(false)} />}
    </div>
  );
}

function StockRow({ company: c, active, detailId, onClick }: { company: CompanyView; active: boolean; detailId: string; onClick: () => void }) {
  const { me, playersById } = useGame();
  const t = useT();
  const text = stocksMessages[useUiLang()];
  const fmt = useFmt();
  const content = useContent();
  const mine = c.holdings[me.id] ?? 0;
  const myPct = holdingPct(c, me.id);
  const controller = c.controllerId ? playersById.get(c.controllerId) : undefined;
  const dead = c.status !== 'active';
  return (
    <tr className={cx('clickable', active && 'selected', dead && 'dead', c.controllerId === me.id && 'mine', c.controllerId !== me.id && mine > 0 && 'held')} data-stock-row={c.id} onClick={onClick}>
      <td>
        <button type="button" className="stock-company-button" data-stock-trigger={c.id} aria-expanded={active} aria-controls={detailId}
          aria-label={`${c.name} (${c.ticker}) · ${active ? text.close : text.open}`}
          onClick={(event) => { event.stopPropagation(); onClick(); }}>
          <span className="stock-company-identity"><Swatch color={c.color} /> <span aria-hidden="true">{c.emoji}</span> <strong>{c.ticker}</strong><span className="stock-company-arrow" aria-hidden="true">{active ? '−' : '›'}</span></span>
          <span className="small muted stock-company-name">{c.name}</span>
          <span className="stock-mobile-label stock-company-action">{active ? text.close : text.open}</span>
        </button>
        {dead && <span className="badge dead-badge">{c.status === 'bankrupt' ? t.stocks.status.bankrupt : t.stocks.status.merged}</span>}
      </td>
      <td className="small stock-col-extra">{c.ceoName}</td>
      <td className="nowrap stock-col-extra" title={companySectors(c).map((s) => content.sectors[s]?.name ?? s).join(', ')}>
        {companySectors(c).map((s) => content.sectors[s]?.emoji ?? '?').join(' ') || '—'}
      </td>
      <td className="num">{fmt.sharePrice(c.sharePrice)}</td>
      <td className="num">{dead ? '—' : <Delta value={priceChange(c.priceHistory, c.sharePrice)} />}</td>
      <td className="stock-col-extra">
        <Sparkline values={[...c.priceHistory, c.sharePrice]} label={t.stocks.priceOf(c.name)} />
      </td>
      <td className="num stock-col-extra">{fmt.money(c.marketCap)}</td>
      <td className="num stock-col-extra">{c.sharesOutstanding ? fmt.pct(c.floatShares / c.sharesOutstanding, 0) : '—'}</td>
      <td className="num stock-holding">
        {mine > 0 ? (
          <>
            <span className="stock-holding-quantity">{fmt.int(mine)}</span>
            {/* Ce qu'affichait « Mes positions » : part du capital et valeur au cours. */}
            <div className="small">
              <span className={myPct > 0.5 ? 'up' : 'muted'}>{fmt.pct(myPct, pctDigits(myPct))}</span>
              {!dead && <span className="muted stock-holding-value"> · {fmt.money(holdingValue(c, me.id))}</span>}
            </div>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="small nowrap stock-col-extra">
        {controller ? (
          <>
            <Swatch color={controller.color} /> {controller.id === me.id ? t.common.You : controller.name}
          </>
        ) : (
          <span className="muted">{t.common.autopilotShort}</span>
        )}
      </td>
      <td className="stock-col-extra">
        <ScandalBadge level={c.scandalLevel} />
      </td>
    </tr>
  );
}

/** Part de la dette perso dans les actifs que regarde l'appel de marge (actions au cours + cash positif). */
export function personalLeverage(debt: number, portfolio: number, cash: number): number {
  const assets = portfolio + Math.max(0, cash);
  return assets > 0 ? debt / assets : Number.POSITIVE_INFINITY;
}

/**
 * Prêt perso : un volet dont le titre dit ce qu'on peut encore emprunter. Ouvert d'office quand il y a une dette, et
 * alors le titre rappelle aussi la dette, sa part des actifs et le seuil de l'appel de marge (visible même replié).
 */
function PersonalLoan() {
  const { view, me } = useGame();
  const t = useT();
  const fmt = useFmt();
  const [open, setOpen] = useState(() => me.debt > 0);
  const leverage = personalLeverage(me.debt, me.portfolioValue, me.cash);
  return (
    <details className="tab-fold stocks-loan" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {t.stocks.loanFold(fmt.money(view.personalLoanLimit))}
        {me.debt > 0 && (
          <span className={cx('stocks-debt', leverage >= MARGIN_CALL_RATIO ? 'down' : 'warn')}>
            {t.stocks.debtLine(fmt.money(me.debt), Number.isFinite(leverage) ? fmt.pct(leverage, 0) : '∞', fmt.pct(MARGIN_CALL_RATIO, 0))}
          </span>
        )}
      </summary>
      <div className="two-cols tight">
        <AmountForm
          label={t.stocks.borrowLabel}
          max={view.personalLoanLimit}
          submitLabel={t.stocks.borrow}
          disabledReason={view.personalLoanLimit <= 0 ? t.stocks.capReached(fmt.pct(PERSONAL_LOAN_LTV, 0), fmt.pct(CONTROLLED_LOAN_LTV, 0)) : null}
          info={() => <>{t.stocks.loanInfo(fmt.pct(view.interestRate + PERSONAL_LOAN_SPREAD, 2), fmt.pct(MARGIN_CALL_RATIO, 0))}</>}
          after={(a) => t.form.personalCashDebtAfter(fmt.money(me.cash + a), fmt.money(me.debt + a))}
          onSubmit={(amount) => sendAction({ type: 'takePersonalLoan', amount })}
        />
        {me.debt > 0 && (
          <AmountForm
            label={t.stocks.repayLabel}
            max={Math.max(0, Math.min(me.debt, me.cash))}
            submitLabel={t.stocks.repay}
            after={(a) => t.form.personalCashDebtAfter(fmt.money(me.cash - a), fmt.money(me.debt - a))}
            onSubmit={(amount) => sendAction({ type: 'repayPersonalLoan', amount })}
          />
        )}
      </div>
    </details>
  );
}
