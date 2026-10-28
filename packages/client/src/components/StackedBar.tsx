import { useState } from 'react';
import { useFmt } from '../fmt';
import { useT } from '../i18n';

export interface Segment {
  id: string;
  label: string;
  value: number;
  color: string;
  /** Hachuré (ex. flottant), pour ne pas dépendre de la seule couleur. */
  hatched?: boolean;
}

interface Props {
  segments: Segment[];
  total?: number;
  height?: number;
  formatValue?: (v: number) => string;
}

/** Barre empilée horizontale (répartition du capital, parts de marché…). */
export function StackedBar({ segments, total, height = 22, formatValue }: Props) {
  const t = useT();
  const fmt = useFmt();
  const formatPct = fmt.pct;
  const [hover, setHover] = useState<string | null>(null);
  const segs = segments.filter((s) => s.value > 0);
  const sum = total ?? segs.reduce((a, s) => a + s.value, 0);
  if (sum <= 0 || segs.length === 0) return <div className="muted small">{t.charts.nothingToSplit}</div>;
  const hovered = segs.find((s) => s.id === hover);
  return (
    <div className="stacked">
      <div className="stacked-bar" style={{ height }} onPointerLeave={() => setHover(null)}>
        {segs.map((s) => (
          <div
            key={s.id}
            className={`stacked-seg${s.hatched ? ' hatched' : ''}${hover === s.id ? ' hover' : ''}`}
            style={{ flexGrow: s.value, background: s.hatched ? undefined : s.color }}
            onPointerEnter={() => setHover(s.id)}
            tabIndex={0}
            onFocus={() => setHover(s.id)}
            onBlur={() => setHover(null)}
            aria-label={t.charts.segmentAria(s.label, formatPct(s.value / sum))}
          />
        ))}
      </div>
      <div className="stacked-readout small">
        {hovered ? (
          <>
            <strong>{formatPct(hovered.value / sum)}</strong> {hovered.label}
            {formatValue && <span className="muted"> · {formatValue(hovered.value)}</span>}
          </>
        ) : (
          <span className="muted">{t.charts.hoverHint}</span>
        )}
      </div>
      <ul className="legend">
        {segs.map((s) => (
          <li key={s.id}>
            <span className={`swatch${s.hatched ? ' hatched' : ''}`} style={s.hatched ? undefined : { background: s.color }} />
            {s.label} <span className="muted">{formatPct(s.value / sum)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
