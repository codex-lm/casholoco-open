import { useId, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useElementWidth } from '../hooks/useElementWidth';
import { useFmt } from '../fmt';
import { useT, useUiLang } from '../i18n';
import { lineChartMessages } from './lineChartMessages';
import './lineChart.css';

export interface Series {
  id: string;
  label: string;
  color: string;
  values: number[];
}

interface Props {
  series: Series[];
  /** Libellé de chaque abscisse (aligné sur la série la plus longue). */
  labels?: string[];
  height?: number;
  format?: (v: number) => string;
  /** Inclure 0 dans l'axe vertical. */
  zeroBased?: boolean;
  title?: string;
  emptyText?: string;
  /** Échelle en bandes sur `slots` colonnes : le point i est au centre de la colonne i+1. Défaut : échelle en points. */
  slots?: number;
  /** Masquer les étiquettes d'abscisse. */
  hideXLabels?: boolean;
  /** Dernier segment en pointillés et dernier point creux (valeur en direct). */
  liveLast?: boolean;
  /** Survol contrôlé (index 0-based, null = aucun) ; sans cette prop, état interne. */
  hover?: number | null;
  onHoverChange?: (i: number | null) => void;
  /** Clic : index 0-based de la colonne (bandes) ou du point sous le pointeur. */
  onSelect?: (i: number) => void;
  /** Colonne sélectionnée (index 0-based, mode bandes) : bande surlignée sous les courbes. */
  selected?: number | null;
  /** Calque SVG dessiné au-dessus des courbes (badges), en coordonnées du graphe. */
  overlay?: (ctx: ChartOverlay) => ReactNode;
}

export const PAD = { top: 12, right: 14, bottom: 24, left: 60 };

export interface ChartGeometry {
  /** Nombre de colonnes (>= 1). */
  slots: number;
  plotLeft: number;
  plotRight: number;
  plotW: number;
  /** Largeur d'une colonne : plotW / slots. */
  colW: number;
  /** Abscisse du centre de la colonne du trimestre q (1-based). */
  x: (q: number) => number;
  /** Inverse de x : colonne sous le pixel px, bornée à 1..slots. */
  colAt: (px: number) => number;
}

/** Contexte passé à la prop `overlay` : géométrie en bandes + échelle verticale. */
export interface ChartOverlay extends ChartGeometry {
  width: number;
  height: number;
  plotTop: number;
  plotH: number;
  y: (v: number) => number;
}

/** Échelle en bandes pure : `slots` colonnes sur la largeur du plot, x(q) au centre de la colonne q. */
export function chartGeometry(width: number, slots: number): ChartGeometry {
  const n = Math.max(1, Math.round(slots));
  const plotLeft = PAD.left;
  const plotRight = width - PAD.right;
  const plotW = plotRight - plotLeft;
  const colW = plotW / n;
  return {
    slots: n,
    plotLeft,
    plotRight,
    plotW,
    colW,
    x: (q) => plotLeft + (q - 0.5) * colW,
    colAt: (px) => Math.min(n, Math.max(1, Math.floor((px - plotLeft) / colW) + 1)),
  };
}

export function niceScale(min: number, max: number, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return { lo, hi, ticks };
}

/**
 * Courbes SVG faites main : axes discrets, réticule au survol, infobulle
 * listant toutes les séries, légende dès deux séries.
 */
export function LineChart({
  series,
  labels,
  height = 200,
  format: formatProp,
  zeroBased,
  title,
  emptyText,
  slots,
  hideXLabels,
  liveLast,
  hover: hoverProp,
  onHoverChange,
  onSelect,
  selected,
  overlay,
}: Props) {
  const t = useT();
  const text = lineChartMessages[useUiLang()];
  const fmt = useFmt();
  const format = formatProp ?? fmt.money;
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [innerHover, setInnerHover] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const navigationId = useId();
  const hover = hoverProp !== undefined ? hoverProp : innerHover;
  const setHover = (i: number | null) => {
    if (hoverProp === undefined) setInnerHover(i);
    onHoverChange?.(i);
  };

  const clean = series.map((s) => ({ ...s, values: s.values.map((v) => (Number.isFinite(v) ? v : 0)) }));
  const n = Math.max(0, ...clean.map((s) => s.values.length));
  const all = clean.flatMap((s) => s.values);

  if (n === 0 || all.length === 0) {
    return (
      <div className="chart chart-empty" ref={ref}>
        {emptyText ?? t.charts.empty}
      </div>
    );
  }

  let min = Math.min(...all);
  let max = Math.max(...all);
  if (zeroBased) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  const { lo, hi, ticks } = niceScale(min, max);
  const w = Math.max(200, width);
  const plotW = w - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const band = slots !== undefined;
  const geo = chartGeometry(w, Math.max(n, slots ?? n));
  const x = (i: number) => (band ? geo.x(i + 1) : PAD.left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1)));
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * plotH;

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 90))));

  const indexAt = (px: number) =>
    band
      ? geo.colAt(px) - 1
      : Math.min(n - 1, Math.max(0, n === 1 ? 0 : Math.round(((px - PAD.left) / plotW) * (n - 1))));

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover(indexAt(e.clientX - rect.left));
  };

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onSelect) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSelect(indexAt(e.clientX - rect.left));
  };

  const hoverRows =
    hover === null
      ? []
      : clean
          .filter((s) => hover < s.values.length)
          .map((s) => ({ s, v: s.values[hover] }))
          .sort((a, b) => b.v - a.v);
  const tipLeft = hover === null ? 0 : x(hover);
  const tipOnLeft = tipLeft > w * 0.6;
  // La frise de fortune contrôle déjà le survol et propose sa navigation clavier : pas de second contrôle.
  const standalone = hoverProp === undefined;
  const cursorIndex = Math.min(n - 1, Math.max(0, hover ?? cursor ?? n - 1));
  const periodLabel = (i: number) => labels?.[i] ?? text.point(i + 1);
  const cursorDescription = [periodLabel(cursorIndex), ...clean.filter((s) => cursorIndex < s.values.length).map((s) => `${s.label} : ${format(s.values[cursorIndex])}`)].join(' · ');

  return (
    <div className="chart" ref={ref}>
      {title && <div className="chart-title">{title}</div>}
      <div className="chart-plot">
        <svg
          width={w}
          height={height}
          viewBox={`0 0 ${w} ${height}`}
          role="img"
          aria-label={title ?? t.charts.aria}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onClick={onClick}
        >
          {band && selected != null && selected >= 0 && selected < geo.slots && (
            <rect
              className="chart-selected"
              x={geo.plotLeft + selected * geo.colW}
              y={PAD.top}
              width={geo.colW}
              height={plotH}
            />
          )}
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {lo < 0 && hi > 0 && <line className="zero" x1={PAD.left} x2={w - PAD.right} y1={y(0)} y2={y(0)} />}
          {labels &&
            !hideXLabels &&
            labels.slice(0, n).map((l, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                <text
                  key={i}
                  className="axis"
                  x={x(i)}
                  y={height - 6}
                  textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                >
                  {l}
                </text>
              ) : null,
            )}
          {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} />}
          {clean.map((s) => {
            if (!s.values.length) return null;
            const li = s.values.length - 1;
            const cut = liveLast ? Math.max(0, li - 1) : li;
            const d = s.values
              .slice(0, cut + 1)
              .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
              .join(' ');
            return (
              <g key={s.id}>
                {cut > 0 && (
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                )}
                {liveLast && li > 0 && (
                  <path
                    d={`M${x(li - 1).toFixed(1)},${y(s.values[li - 1]).toFixed(1)} L${x(li).toFixed(1)},${y(s.values[li]).toFixed(1)}`}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray="5 4"
                  />
                )}
                <circle
                  className={liveLast ? 'dot dot-live' : 'dot'}
                  cx={x(li)}
                  cy={y(s.values[li])}
                  r={4}
                  fill={liveLast ? 'var(--card)' : s.color}
                  style={liveLast ? { stroke: s.color } : undefined}
                />
                {hover !== null && hover < s.values.length && (
                  <circle className="dot" cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} />
                )}
              </g>
            );
          })}
          {overlay?.({ ...geo, width: w, height, plotTop: PAD.top, plotH, y })}
        </svg>
        {hover !== null && hoverRows.length > 0 && (
          <div
            className="chart-tip"
            style={tipOnLeft ? { right: w - tipLeft + 10 } : { left: tipLeft + 10 }}
            role="status"
          >
            {labels?.[hover] && <div className="chart-tip-title">{labels[hover]}</div>}
            {hoverRows.map(({ s, v }) => (
              <div key={s.id} className="chart-tip-row">
                <span className="line-key" style={{ background: s.color }} />
                <strong>{format(v)}</strong>
                {clean.length > 1 && <span className="muted">{s.label}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {clean.length > 1 && (
        <ul className="legend">
          {clean.map((s) => (
            <li key={s.id}>
              <span className="line-key" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {standalone && (
        <details className="chart-values" onToggle={(event) => { if (!event.currentTarget.open) setHover(null); }}>
          <summary>{text.values}</summary>
          {n > 1 && (
            <div className="chart-navigation">
              <label htmlFor={navigationId}>{text.period} <strong>{periodLabel(cursorIndex)}</strong></label>
              <input id={navigationId} type="range" min={0} max={n - 1} step={1} value={cursorIndex}
                aria-label={text.explore(title ?? clean.map((s) => s.label).join(', '))}
                aria-valuetext={cursorDescription} aria-describedby={`${navigationId}-hint`}
                onFocus={() => setHover(cursorIndex)} onBlur={() => setHover(null)}
                onChange={(event) => { const index = Number(event.currentTarget.value); setCursor(index); setHover(index); }} />
              <p id={`${navigationId}-hint`} className="small muted">{text.keyboardHint}</p>
            </div>
          )}
          <div className="table-scroll chart-values-scroll">
            <table className="table compact chart-values-table">
              <caption className="sr-only">{text.explore(title ?? clean.map((s) => s.label).join(', '))}</caption>
              <thead><tr><th scope="col">{text.period}</th>{clean.map((s) => <th key={s.id} scope="col" className="num">{s.label}</th>)}</tr></thead>
              <tbody>{Array.from({ length: n }, (_, i) => (
                <tr key={i} className={i === cursorIndex ? 'chart-value-current' : undefined}>
                  <th scope="row">{periodLabel(i)}</th>
                  {clean.map((s) => <td key={s.id} className="num">{i < s.values.length ? format(s.values[i]) : '—'}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
