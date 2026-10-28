import { useFmt } from '../fmt';
import { useT } from '../i18n';

export interface ShareRow {
  id: string;
  label: string;
  sublabel?: string;
  share: number; // 0..1
  color: string;
  highlight?: boolean;
  hatched?: boolean;
}

/** Barres horizontales de parts (0..1), valeur au bout de la barre. */
export function ShareBars({ rows }: { rows: ShareRow[] }) {
  const t = useT();
  const fmt = useFmt();
  if (rows.length === 0) return <div className="muted small">{t.charts.noSales}</div>;
  const max = Math.max(...rows.map((r) => r.share), 0.0001);
  return (
    <ul className="share-bars">
      {rows.map((r) => (
        <li key={r.id} className={r.highlight ? 'highlight' : undefined}>
          <div className="share-label" title={r.sublabel ? `${r.label} · ${r.sublabel}` : r.label}>
            {r.label}
            {r.sublabel && <span className="muted small"> {r.sublabel}</span>}
          </div>
          <div className="share-track">
            <div
              className={`share-fill${r.hatched ? ' hatched' : ''}`}
              style={{ width: `${(r.share / max) * 100}%`, background: r.hatched ? undefined : r.color }}
            />
            <span className="share-value">{fmt.pct(r.share)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
