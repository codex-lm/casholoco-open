import { Section } from '../components/bits';
import { useFmt } from '../fmt';
import { useGame } from '../hooks/useGame';
import { useT } from '../i18n';
import { ReportTable } from './game/ReportTable';

/** Published accounts only: no management controls or new access to rival decisions. */
export function FinalReports() {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  if (view.phase !== 'finished') return null;

  // A bankrupt/absorbed company has no controller. Its founder can still read its
  // published accounts, even though it no longer belongs to myCompanies.
  const companies = view.companies.filter((c) => c.controllerId === view.you || c.founderId === view.you);

  return (
    <details className="section">
      <summary className="btn">{t.end.viewReports}</summary>
      <p className="small muted">{t.end.reportsIntro}</p>
      {companies.length === 0 && <p className="muted">{t.end.noReports}</p>}
      {companies.map((company) => {
        const last = company.reports.at(-1);
        const controls = company.controllerId === view.you && company.private !== undefined;
        const result = last
          ? last.netProfit > 0
            ? t.end.reportProfit(fmt.money(last.netProfit))
            : last.netProfit < 0
              ? t.end.reportLoss(fmt.money(-last.netProfit))
              : t.end.reportBreakEven
          : null;
        return (
          <Section key={company.id} title={`${company.emoji} ${company.name}`}>
            {company.status !== 'active' && <p className="small muted">{t.stocks.status[company.status]}</p>}
            {last && (
              <p>
                {t.end.lastReportDate(fmt.date(last.turn, view.config.startYear))}{' '}
                <strong className={last.netProfit > 0 ? 'up' : last.netProfit < 0 ? 'down' : undefined}>{result}</strong>
              </p>
            )}
            <ReportTable reports={company.reports} showProducts={controls} />
          </Section>
        );
      })}
    </details>
  );
}
