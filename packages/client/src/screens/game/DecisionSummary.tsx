import type { ReactNode } from 'react';
import { useUiLang } from '../../i18n';
import { decisionText } from '../../i18n/decisionReadability';
import './DecisionSummary.css';

/**
 * Existing form estimates gathered beside their action, without a second calculation. `inSheet`: the form sits in
 * a cell sheet that already names the place and its reserve price, so those two rows are left out. `gainLabel`
 * names the quarterly figure when the form has its own wording for it (cell bids).
 */
type EstimateProps = {
  destination: string; total: string; maximum?: boolean; reserve?: string; cost?: string; costLabel?: string; timing: string;
  gain: string; savings?: boolean; gainLabel?: string; payback: string; conditions?: string; inSheet?: boolean; children?: ReactNode;
};

type RowsProps = {
  rows: readonly { label: string; value: ReactNode }[];
  note?: ReactNode;
};

export function DecisionSummary(props: EstimateProps | RowsProps) {
  const text = decisionText(useUiLang());
  if ('rows' in props) return <section className="decision-summary" aria-label={text.summary}>
    <dl>{props.rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
    {props.note && <p className="small muted">{props.note}</p>}
  </section>;
  const { destination, total, maximum = false, reserve, cost, costLabel, timing, gain, savings = false, gainLabel, payback, conditions, inSheet = false, children } = props;
  return <section className="decision-summary" aria-label={text.summary}>
    <dl>
      {!inSheet && <div><dt>{text.destination}</dt><dd>{destination}</dd></div>}
      <div><dt>{maximum ? text.maximum : text.total}</dt><dd>{total}</dd></div>
      {cost && costLabel && <div><dt>{costLabel}</dt><dd>{cost}</dd></div>}
      {reserve && !inSheet && <div><dt>{text.reserve}</dt><dd>{reserve}</dd></div>}
      <div className="decision-timing"><dt>{text.timing}</dt><dd>{timing}</dd></div>
      <div><dt>{gainLabel ?? (savings ? text.savings : text.margin)}</dt><dd>{gain}</dd></div>
      <div><dt>{text.payback}</dt><dd>{payback}</dd></div>
    </dl>
    <p className="small muted">{conditions ?? text.conditions}</p>
    {children}
  </section>;
}
