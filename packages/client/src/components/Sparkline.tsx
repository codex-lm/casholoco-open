import { useT } from '../i18n';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
}

/** Mini-courbe sans axes : verte si la série monte, rouge si elle baisse. */
export function Sparkline({ values, width = 84, height = 24, label }: Props) {
  const t = useT();
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length === 0) return <svg className="sparkline" width={width} height={height} aria-hidden />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || Math.abs(max) || 1;
  const pad = 3;
  const x = (i: number) => (pts.length === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (pts.length - 1));
  const y = (v: number) => (max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - 2 * pad));
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const trend = pts[pts.length - 1] - pts[0];
  const cls = trend > 0 ? 'up' : trend < 0 ? 'down' : 'flat';
  const last = pts.length - 1;
  return (
    <svg
      className={`sparkline ${cls}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? t.charts.sparkline}
    >
      {pts.length > 1 && <path d={d} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(last)} cy={y(pts[last])} r={2.5} />
    </svg>
  );
}
