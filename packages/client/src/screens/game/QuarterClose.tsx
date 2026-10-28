import { useEffect, useState } from 'react';
import { hexPlaceLabel, type CloseRecap, type CloseRecapFact, type PlayerView } from '@muchomoney/core';
import { Modal } from '../../components/Modal';
import { useFmt } from '../../fmt';
import { useGame } from '../../hooks/useGame';
import { useContent, useRoomLang, useT, useUiLang } from '../../i18n';
import { quarterCloseMessages } from '../../i18n/quarterClose';
import { navigationDetailsMessages } from '../../i18n/navigationDetails';
import { displayedFortuneBalances, displayedFortuneBreakdown, latestCloseRecap, recapBids, type RecapBid } from './closeRecap';
import type { TabId } from '../GameScreen';
import type { MapIntent } from './mapIntent';
import { ReportTable } from './ReportTable';
import './quarterClose.css';
import './navigationDetails.css';

interface Props {
  open: boolean;
  onClose: () => void;
  disableAutoOpen: boolean;
  onDisableAutoOpen: (disabled: boolean) => void;
  openIssue: (turn: number) => void;
  openFactory: (companyId: string, productId?: string) => void;
  openMapFor?: (intent: MapIntent) => void;
  openStock?: (companyId: string) => void;
  openCompany?: (companyId: string) => void;
  goTo?: (tab: TabId) => void;
}
export type FactLink = { kind: 'issue'; turn: number } | { kind: 'product'; companyId: string; productId: string } | { kind: 'report'; companyId: string };
/** Legacy recaps retain their factual links without inventing missing snapshots. */
export function factLink(view: PlayerView, recap: CloseRecap, fact: CloseRecapFact): FactLink {
  if (fact.type === 'takeover') return { kind: 'issue', turn: fact.journalTurn };
  if ((fact.type === 'firstSales' || fact.type === 'stock') && view.companies.some((c) => c.id === fact.companyId &&
    c.controllerId === view.you && c.status === 'active' && c.products.some((p) => p.id === fact.productId)))
    return { kind: 'product', companyId: fact.companyId, productId: fact.productId };
  return view.companies.some((c) => c.id === fact.companyId && c.reports.some((r) => r.turn === recap.turn))
    ? { kind: 'report', companyId: fact.companyId } : { kind: 'issue', turn: recap.turn + 1 };
}

export function QuarterClose({ open, onClose, disableAutoOpen, onDisableAutoOpen, openIssue, openFactory, openMapFor, openStock, openCompany, goTo }: Props) {
  const { view } = useGame();
  const fmt = useFmt();
  const t = useT();
  const content = useContent();
  const roomLang = useRoomLang();
  const uiLang = useUiLang();
  const text = quarterCloseMessages(uiLang);
  const labels = navigationDetailsMessages(uiLang);
  const recap = latestCloseRecap(view);
  const [reportId, setReportId] = useState<string | null>(null);
  useEffect(() => setReportId(null), [recap?.turn]);
  useEffect(() => { if (!open) setReportId(null); }, [open]);
  if (!recap) return null;
  const date = fmt.date(recap.turn, view.config.startYear);
  const fortune = recap.fortune;
  const beforeWorth = recap.previousNetWorth ?? fortune?.netWorthBefore;
  const worth = Math.round(recap.netWorth) || 0;
  const change = beforeWorth === undefined ? undefined : worth - (Math.round(beforeWorth) || 0);
  const balances = fortune ? displayedFortuneBalances(fortune, recap.netWorth) : undefined;
  const wholeMoney = (n: number) => fmt.money(Math.round(n) || 0, 'exact');
  // Des lots entiers, comme partout ailleurs dans le jeu.
  const lotsText = (n: number) => fmt.int(Math.round(n));
  const rawBreakdown = recap.breakdown ?? fortune?.breakdown;
  const breakdown = change === undefined || !rawBreakdown ? undefined : displayedFortuneBreakdown(change, rawBreakdown);
  const bids = recapBids(view, recap);
  const settlements = recap.settlements;
  const companyName = (id: string) => view.companies.find((c) => c.id === id)?.name ?? t.common.unknown;
  const playerName = (id?: string) => view.players.find((p) => p.id === id)?.name ?? '';
  const transition = (before: number | undefined, after: number, format: (n: number) => string) => before === undefined ? format(after) : format(before) + ' → ' + format(after);
  const navigate = (action: () => void) => { onClose(); action(); };
  // Keep the recap mounted beneath the report: its scroll and opener survive the round trip.
  const showReport = (id: string) => setReportId(id);
  const hasProduct = (companyId: string, productId: string) => view.companies.some((c) => c.id === companyId &&
    c.controllerId === view.you && c.status === 'active' && c.products.some((p) => p.id === productId));
  const companyAction = (id: string) => openCompany && view.companies.some((c) => c.id === id && c.controllerId === view.you && c.status === 'active')
    ? <button type="button" className="btn tiny ghost" onClick={() => navigate(() => openCompany(id))}>{text.companyAction}</button> : null;
  const stockAction = (id: string, name: string) => openStock && view.companies.some((c) => c.id === id)
    ? <button type="button" className="btn tiny ghost" aria-label={text.stockMarketAria(name)} onClick={() => navigate(() => openStock(id))}>{text.stockMarket}</button> : null;
  const factLabel = (fact: CloseRecapFact): string => {
    switch (fact.type) {
      case 'netProfit': return text.profit(fact.companyName, fmt.signedMoney(fact.amount));
      case 'fines': return text.fines(fact.companyName, fmt.money(fact.amount));
      case 'firstSales': return text.firstSales(fact.productName, Math.round(fact.lots * 100) / 100, fmt.num(fact.lots));
      case 'stock': return text.stock(fact.productName, Math.round(fact.lots * 100) / 100, fmt.num(fact.lots));
      case 'bankruptcy': return text.bankruptcy(fact.companyName);
      case 'takeover': return text.takeover(fact.companyName, fact.direction === 'won');
    }
  };
  const place = (id: string) => hexPlaceLabel(id, roomLang, view.siteSlots);
  const bidHead = (bid: RecapBid): string => {
    if (bid.kind === 'deposit') return text.bidDeposit(view.siteSlots.find((s) => s.id === bid.slotId)?.name ?? bid.slotId ?? '',
      bid.commodityId ? content.commodities[bid.commodityId]?.name ?? bid.commodityId : '');
    const name = bid.name ?? companyName(bid.companyId);
    const head = bid.kind === 'land' || bid.kind === 'factory' ? `${t.hex.bidKind[bid.kind]}${bid.kind === 'factory' ? ` · ${name}` : ''}`
      : bid.kind === 'launch' ? text.bidLaunch(name) : bid.kind === 'move' ? text.bidMove(name) : text.bidStartup(name);
    return bid.hexId ? head + ' · ' + place(bid.hexId) : head;
  };
  const bidLine = (bid: RecapBid): string => {
    const state = bid.incubatorStays ? t.hex.incubatorStays : t.hex.bidState[bid.outcome];
    const paid = !(bid.paid > 0) ? text.nothingPaid : bid.kind === 'deposit' ? text.paid(fmt.money(bid.paid))
      : bid.outcome === 'fallback' ? text.paidReserve(fmt.money(bid.paid)) : text.paidLand(fmt.money(bid.paid));
    return bidHead(bid) + text.sep + [
      bid.outcome === 'failed' ? state + ' (' + (bid.kind === 'deposit' ? text.failedSite : text.failedHex) + ')' : state,
      bid.obtainedHexId && t.hex.bidObtained(place(bid.obtainedHexId)), paid,
      bid.launchCost !== undefined && text.paidLaunch(fmt.money(bid.launchCost)),
      bid.publicPrice !== undefined && text.publicPrice(fmt.money(bid.publicPrice)),
      bid.bidders > 0 && t.hex.bidBidders(bid.bidders),
    ].filter(Boolean).join(' · ');
  };
  const eventLine = (entry: NonNullable<CloseRecap['settlements']>['events'][number]) => {
    const kind = text.eventKinds[entry.event.type as keyof typeof text.eventKinds];
    return kind ? text.event(kind, entry.companyNames.join(' / '), playerName(entry.event.actorId)) : null;
  };
  const reportCompany = recap.companies?.find((c) => c.companyId === reportId);
  const currentCompany = view.companies.find((c) => c.id === reportId);
  const reports = currentCompany?.reports.filter((r) => r.turn <= recap.turn) ?? [];
  const report = reportCompany?.report;
  // Later mergers may rewrite public historical accounts. Prefer the immutable close's own report.
  if (report) {
    const index = reports.findIndex((r) => r.turn === report.turn);
    if (index < 0) reports.push(report);
    else reports[index] = report;
  }
  const eventEntries = (settlements?.events ?? []).filter((entry) => eventLine(entry));
  const hasSettlements = bids.length > 0 || (settlements?.offers.length ?? 0) > 0 || (settlements?.contracts.length ?? 0) > 0 || eventEntries.length > 0;
  return <>
    {open && <Modal title={text.title(date)} onClose={onClose} wide>
      <div className="quarter-close" data-quarter-close>
        <section aria-label={text.fortuneTitle} data-recap-block="fortune">
          <h2>{text.fortuneTitle}</h2>
          <dl className="quarter-close-numbers">
            <div><dt>{text.fortune}</dt><dd>{fmt.money(worth)}</dd></div>
            {change !== undefined && <div><dt>{recap.previousNetWorth === undefined ? text.openingChange : text.change}</dt><dd className={change < 0 ? 'down' : 'up'}>{fmt.signedMoney(change, 'exact')}</dd></div>}
          </dl>
          {fortune ? <>
            <dl className="quarter-close-balances">
              <div><dt>{text.cash}</dt><dd>{transition(fortune.cashBefore, fortune.cashAfter, fmt.money)}</dd></div>
              <div><dt>{text.portfolio}</dt><dd>{transition(fortune.portfolioBefore, fortune.portfolioAfter, fmt.money)}</dd></div>
              <div><dt>{text.debt}</dt><dd>{transition(fortune.debtBefore, fortune.debtAfter, fmt.money)}</dd></div>
              <div className="quarter-close-total"><dt>{text.totalWorth}</dt><dd>{transition(beforeWorth, recap.netWorth, fmt.money)}</dd></div>
            </dl>
            {!balances?.before && <p className="small muted">{text.beforeUnavailable}</p>}
            <ul className="quarter-close-lines" data-recap-holdings>
              {fortune.holdings.map((holding) => <li key={holding.companyId}><span>
                {text.holding(holding.companyName, holding.sharesBefore === undefined ? undefined : fmt.int(holding.sharesBefore), fmt.int(holding.sharesAfter),
                  transition(holding.priceBefore, holding.priceAfter, fmt.sharePrice), holding.sharesBefore === undefined || holding.priceBefore === undefined ? '—'
                    : fmt.signedMoney(holding.sharesAfter * holding.priceAfter - holding.sharesBefore * holding.priceBefore))}
                {holding.bought > 0 && <small>{text.bought(fmt.int(holding.bought))}</small>}
                {holding.sold > 0 && <small>{text.sold(fmt.int(holding.sold))}</small>}
              </span>{stockAction(holding.companyId, holding.companyName)}</li>)}
            </ul>
            {!fortune.holdings.length && <p className="small muted">{text.noHoldings}</p>}
            <dl className="quarter-close-balances quarter-close-flows">
              {([[text.dividends, fortune.dividends], [text.bonuses, fortune.bonuses], [text.interest, fortune.interest], [text.tips, fortune.tips], [text.whistleblowing, fortune.whistleblowing]] as const)
                .filter(([, amount]) => amount !== undefined && amount !== 0).map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{fmt.money(amount!)}</dd></div>)}
            </dl>
            {beforeWorth === recap.netWorth && <p className="small muted">{text.quietFortune}</p>}
          </> : <p className="small muted">{text.oldDetails}</p>}
          {breakdown && <dl className="quarter-close-breakdown">
            <div><dt>{text.sharePrices}</dt><dd>{fmt.signedMoney(breakdown.sharePrices, 'exact')}</dd></div>
            <div><dt>{text.dividendsAndBonuses}</dt><dd>{fmt.signedMoney(breakdown.dividendsAndBonuses, 'exact')}</dd></div>
            <div><dt>{text.personalCosts}</dt><dd>{fmt.signedMoney(breakdown.personalCosts, 'exact')}</dd></div>
            <div><dt>{text.otherMovements}<small>{text.otherMovementsHint}</small></dt><dd>{fmt.signedMoney(breakdown.otherMovements, 'exact')}</dd></div>
          </dl>}
        </section>
        <section data-recap-block="companies" aria-label={text.companiesTitle}>
          <h2>{text.companiesTitle}</h2>
          {recap.companies?.map((company) => <article key={company.companyId} className="quarter-close-company">
            <div className="quarter-close-company-head"><h3>{company.companyName}</h3>
              {(company.report || view.companies.some((c) => c.id === company.companyId && c.reports.some((r) => r.turn === recap.turn))) &&
                <button type="button" className="btn tiny ghost" aria-label={text.reportAria(company.companyName)} onClick={() => showReport(company.companyId)}>{text.report}</button>}
            </div>
            {company.report && <>
              <div className="quarter-close-table-wrap"><table className="quarter-close-products">
                <thead><tr>{[text.productColumn, text.soldDemand, text.averagePrice, text.revenue, text.margin, text.stockLeft, text.spoiled].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
                <tbody>{company.report.products.map((product) => <tr key={product.productId}>
                  <th scope="row">{hasProduct(company.companyId, product.productId) ? <button type="button" className="quarter-close-product-link" aria-label={text.productAria(product.name) + (product.hexId ? ` · ${product.hexId}` : '')} onClick={() => navigate(() => openFactory(company.companyId, product.productId))}>{product.name}{product.hexId && ` · ${product.hexId}`}</button> : product.name + (product.hexId ? ` · ${product.hexId}` : '')}</th>
                  <td>{lotsText(product.sold)} / {product.demand === undefined ? '—' : lotsText(product.demand)}</td>
                  <td>{product.averagePrice === undefined ? '—' : fmt.lotPrice(product.averagePrice)}</td><td>{fmt.money(product.revenue)}</td>
                  <td>{product.margin === undefined ? '—' : fmt.signedMoney(product.margin)}</td><td>{product.stockLeft === undefined ? '—' : lotsText(product.stockLeft)}</td><td>{product.spoiled === undefined ? '—' : lotsText(product.spoiled)}</td>
                </tr>)}</tbody>
              </table></div>
              <p className="quarter-close-profit">{text.netProfit}{text.sep}<strong className={company.report.netProfit < 0 ? 'down' : 'up'}>{fmt.signedMoney(company.report.netProfit)}</strong></p>
            </>}
            {!company.report && <p className="small muted">{text.quietCompany}</p>}
            <ul className="quarter-close-lines">
              {company.fineCauses.map((fine, index) => <li key={index} className="quarter-close-fine" data-recap-fine={fine.cause}><span>
                <strong>{text.fine(fine.cause === 'cartel' ? text.cartelDiscovered(fine.sectorId ? content.sectors[fine.sectorId]?.name ?? fine.sectorId : company.companyName) : text.scandalDiscovered, fmt.money(fine.amount))}</strong>
                {fine.scandalBefore !== undefined && fine.scandalAfter !== undefined && ' · ' + text.scandal + ' ' + fmt.num(fine.scandalBefore) + ' → ' + fmt.num(fine.scandalAfter) + '/100'}
                {fine.reputationBefore !== undefined && fine.reputationAfter !== undefined && ' · ' + text.reputation + ' ' + (fine.reputationAfter > fine.reputationBefore ? '+' : '') + fmt.fixed(fine.reputationAfter - fine.reputationBefore, 2)}
                {fine.shadyActions?.length ? <small>{text.shadyContext(fine.shadyActions.map((kind) => content.shadyInfo[kind].label).join(', '))}</small> : null}
                <small>{text.fineDue}</small>
              </span>{companyAction(company.companyId)}</li>)}
              {company.scandalAfter !== undefined && <li><span>{text.scandal}{text.sep}{transition(company.scandalBefore, company.scandalAfter, fmt.num)}/100 · {text.reputation}{text.sep}{transition(company.reputationBefore, company.reputationAfter, (n) => fmt.fixed(n, 2))}</span>{companyAction(company.companyId)}</li>}
              <li><span>{text.companyPrice}{text.sep}{transition(company.priceBefore, company.priceAfter, fmt.sharePrice)}</span>{stockAction(company.companyId, company.companyName)}</li>
              {eventEntries.filter((entry) => entry.companyIds.includes(company.companyId) && entry.event.type !== 'merger').map((entry, index) => <li key={'event:' + index}><span>{eventLine(entry)}</span>{stockAction(company.companyId, company.companyName)}</li>)}
            </ul>
          </article>)}
          {recap.companies?.length === 0 && <p className="small muted">{text.noCompanies}</p>}
          {!recap.companies && <p className="small muted">{text.oldDetails}</p>}
          {recap.facts.length > 0 && <ul className="quarter-close-facts quarter-close-lines">
            {recap.facts.filter((fact) => !recap.companies?.some((c) => c.companyId === fact.companyId) || fact.type === 'bankruptcy' || fact.type === 'takeover').map((fact, index) => {
              const link = factLink(view, recap, fact);
              return <li key={index}><span>{factLabel(fact)}</span><button type="button" className="btn tiny ghost" onClick={() => {
                if (link.kind === 'report') showReport(link.companyId);
                else navigate(() => { if (link.kind === 'issue') openIssue(link.turn); else openFactory(link.companyId, link.productId); });
              }}>{link.kind === 'issue' ? text.issue : link.kind === 'product' ? text.product : text.report}</button></li>;
            })}
          </ul>}
        </section>
        <section data-recap-block="settlements" aria-label={text.settlementsTitle}>
          <h2>{text.settlementsTitle}</h2>
          {bids.length > 0 && <div className="quarter-close-bids"><h3>{text.bidsTitle}</h3><ul className="quarter-close-lines">
            {bids.map((bid) => <li key={bid.key} data-recap-bid={bid.outcome}><span>{bidLine(bid)}</span>
              {openMapFor && <button type="button" className="btn tiny ghost" data-recap-bid-map aria-label={text.viewOnMapAria(bidHead(bid))} onClick={() => navigate(() => openMapFor(bid.intent))}>{text.viewOnMap}</button>}
              {bid.note && <small className="quarter-close-bid-note">{bid.note}</small>}
            </li>)}
          </ul></div>}
          <ul className="quarter-close-lines">
            {settlements?.offers.map((offer) => <li key={offer.id} data-recap-offer={offer.status}><span>{text.offer(text.offerKinds[offer.kind], text.offerStates[offer.status], playerName(offer.fromId === view.you ? offer.toId : offer.fromId))}</span>{goTo && <button type="button" className="btn tiny ghost" onClick={() => navigate(() => goTo('deals'))}>{text.deals}</button>}</li>)}
            {settlements?.contracts.map((contract) => <li key={contract.id} data-recap-contract={contract.outcome}><span>{text.contract(content.commodities[contract.commodityId]?.name ?? contract.commodityId, companyName(contract.sellerCompanyId), companyName(contract.buyerCompanyId), fmt.num(contract.lastDelivered ?? 0), fmt.num(contract.lots), text.contractStates[contract.outcome], contract.lastPenalty ? fmt.money(contract.lastPenalty) : '')}</span>{goTo && <button type="button" className="btn tiny ghost" onClick={() => navigate(() => goTo('deals'))}>{text.deals}</button>}</li>)}
            {eventEntries.map((entry, index) => <li key={'event:' + index} data-recap-event={entry.event.type}><span>{eventLine(entry)}</span><button type="button" className="btn tiny ghost" onClick={() => navigate(() => openIssue(entry.journalTurn))}>{text.issue}</button></li>)}
          </ul>
          {!hasSettlements && <p className="small muted">{text.quietSettlements}</p>}
        </section>
        <footer className="quarter-close-footer"><span className="small muted">{text.frozen}</span><label><input type="checkbox" checked={disableAutoOpen} onChange={(event) => onDisableAutoOpen(event.target.checked)} /> {text.disableAutoOpen}</label></footer>
      </div>
    </Modal>}
    {open && reportId && reports.length > 0 && <Modal title={text.reportTitle(reportCompany?.companyName ?? currentCompany?.name ?? '', date)} onClose={() => setReportId(null)} wide>
      <button type="button" className="btn ghost quarter-close-report-back" onClick={() => setReportId(null)}><span aria-hidden>← </span>{labels.backToRecap}</button>
      <ReportTable reports={reports} />
    </Modal>}
  </>;
}
