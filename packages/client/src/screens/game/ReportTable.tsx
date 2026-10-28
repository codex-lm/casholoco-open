import { CITY_IDS, type QuarterReport } from '@muchomoney/core';
import { useContent, useT } from '../../i18n';
import { useFmt } from '../../fmt';
import { useGame } from '../../hooks/useGame';
import { LineChart } from '../../components/LineChart';
import { Empty, SignedMoney } from '../../components/bits';
import { FreightDetails } from '../../components/FreightDetails';

/** Compte de résultat du dernier trimestre (et évolution si plusieurs rapports). */
export function ReportTable({ reports, showProducts = true }: { reports: QuarterReport[]; showProducts?: boolean }) {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const last = reports[reports.length - 1];
  if (!last) return <Empty>{t.report.empty}</Empty>;
  const prev = reports[reports.length - 2];

  // [clé, libellé, montant, masquée si nulle]
  const rows: [string, string, number, boolean][] = [
    ['revenue', t.report.revenue, last.revenue, false],
    ['cogs', t.report.cogs, -last.cogs, false],
    ['marketing', t.report.marketing, -last.marketing, false],
    ['rnd', t.report.rnd, -last.rnd, false],
    ['fixed', t.report.fixed, -last.fixedCosts, false],
    ['amortization', t.report.amortization, -(last.amortization ?? 0), true],
    ['special', t.report.specialCharges, -(last.specialCharges ?? 0), true],
    ['exceptionalLoss', t.report.exceptionalLoss, -(last.exceptionalLoss ?? 0), true],
    ['interest', t.report.interest, -last.interest, true],
    ['fines', t.report.fines, -last.fines, true],
    ['tax', t.report.tax, -last.tax, false],
  ];

  const labels = reports.map((r) => fmt.date(r.turn, view.config.startYear));

  return (
    <div className="report">
      <table className="table report-table">
        <caption>{t.report.caption(fmt.date(last.turn, view.config.startYear))}</caption>
        <tbody>
          {rows.map(([key, label, v, hideIfZero]) =>
            v === 0 && hideIfZero ? null : (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td className="num">{v === 0 ? '—' : fmt.money(v)}</td>
              </tr>
            ),
          )}
          <tr className="total">
            <th scope="row">{t.report.netProfit}</th>
            <td className="num">
              <SignedMoney value={last.netProfit} />
            </td>
          </tr>
          {prev && (
            <tr>
              <th scope="row" className="muted">
                {t.report.prevQuarter}
              </th>
              <td className="num muted">{fmt.money(prev.netProfit)}</td>
            </tr>
          )}
          <tr>
            <th scope="row">{t.report.cashEnd}</th>
            <td className="num">{fmt.money(last.cashEnd)}</td>
          </tr>
          <tr>
            <th scope="row">{t.report.debtEnd}</th>
            <td className="num">{fmt.money(last.debtEnd)}</td>
          </tr>
        </tbody>
      </table>

      {showProducts && last.products.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t.report.cols.product}</th>
                <th className="num">{t.report.cols.produced}</th>
                <th className="num">{t.report.cols.sold}</th>
                <th className="num">{t.report.cols.revenue}</th>
                <th className="num">{t.report.cols.share}</th>
                <th className="num">{t.report.cols.unitCost}</th>
              </tr>
            </thead>
            <tbody>
              {last.products.map((p) => (
                <tr key={p.productId}>
                  <td>
                    {content.sectors[p.sectorId]?.emoji} {p.name}{p.hexId && ` · ${p.hexId}`}
                  </td>
                  <td className="num">{fmt.lots(p.produced)}</td>
                  <td className="num">{fmt.lots(p.sold)}</td>
                  <td className="num">{fmt.money(p.revenue)}</td>
                  <td className="num">{fmt.pct(p.marketShare)}</td>
                  <td className="num">
                    {fmt.money(p.unitCost)}
                    {p.freight ? <FreightDetails view={view} freight={p.freight} /> : p.transport ? (
                      // Historical reports may predate saved source/route detail. Keep their settled total.
                      <div className="small muted">{t.product.transport(fmt.money(p.transport), false)}</div>
                    ) : null}
                    {p.byCity ? (
                      // Ventes du trimestre par ville (secteurs régionaux uniquement).
                      <div className="small muted">
                        {t.report.byCity(
                          CITY_IDS.filter((c) => (p.byCity?.[c] ?? 0) > 0)
                            .map((c) => `${content.mapNames.cities[c]} ${fmt.lots(p.byCity?.[c] ?? 0)}`)
                            .join(' · '),
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reports.length >= 2 && (
        <LineChart
          title={t.report.chart}
          height={170}
          labels={labels}
          zeroBased
          series={[
            { id: 'rev', label: t.report.revenue, color: '#2e5c8a', values: reports.map((r) => r.revenue) },
            { id: 'np', label: t.report.netProfit, color: '#b8860b', values: reports.map((r) => r.netProfit) },
          ]}
        />
      )}
    </div>
  );
}
