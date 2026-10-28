/**
 * Pictogrammes de l'onglet « Mes usines » (façon infographie de journal) : une icône = un nombre fixe de lots,
 * la même échelle pour l'offre et la demande, pour que les deux lignes se comparent à l'œil.
 */
import type { ReactNode } from 'react';
import { cx } from '../../../util';
import type { PictoSegment, ShareGroup } from './model';

const CELL = 14;
const ICON = 12;
const ROW_H = 16;
/** Taille d'affichage des pictogrammes (le dessin reste sur une grille de 12). */
const SCALE = 1.3;

function CrateIcon() {
  return (
    <g>
      <rect x={1} y={3} width={10} height={10} rx={0.5} />
      <path d="M1 6.2 H11 M4.3 6.2 V13 M7.7 6.2 V13" className="picto-lines" />
    </g>
  );
}

function PersonIcon() {
  return (
    <g>
      <circle cx={6} cy={3.6} r={2.4} />
      <path d="M1.6 14 Q1.6 7.4 6 7.4 Q10.4 7.4 10.4 14 Z" />
    </g>
  );
}

export function PictoIcon({ kind, shape }: { kind: PictoSegment['kind'] | 'rival'; shape: 'crate' | 'person' }) {
  return (
    <svg className={cx('picto-inline', `pk-${kind}`)} viewBox={`0 0 ${ICON} ${ROW_H}`} width={ICON} height={ROW_H} aria-hidden>
      {shape === 'crate' ? <CrateIcon /> : <PersonIcon />}
    </svg>
  );
}

/** Épingle de carte : la zone où se trouve l'usine (§5.8), annoncée par son `label`. */
export function PinIcon({ label }: { label: string }) {
  return (
    <svg className="picto-inline" viewBox={`0 0 ${ICON} ${ROW_H}`} width={ICON} height={ROW_H} role="img" aria-label={label}>
      {/* Silhouette pleine à la couleur du texte, le trou se découpe en evenodd sur le fond. */}
      <path
        d="M6 1.8 C3.3 1.8 1.6 3.7 1.6 6.2 C1.6 9.7 6 14.6 6 14.6 C6 14.6 10.4 9.7 10.4 6.2 C10.4 3.7 8.7 1.8 6 1.8 Z M6 4.5 A1.7 1.7 0 1 0 6 7.9 A1.7 1.7 0 1 0 6 4.5 Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

/**
 * Ligne de pictogrammes : une case par icône, remplie segment par segment (les icônes coupées au milieu
 * montrent une fraction).
 */
export function PictoRow({ segments, shape, color, slots, marker, label }: { segments: PictoSegment[]; shape: 'crate' | 'person'; color: string; slots: number; marker?: number; label: string }) {
  const n = Math.max(1, Math.ceil(slots - 1e-9));
  const width = n * CELL;
  // Silhouette vide sous les icônes entamées seulement (la fraction se lit), pas au-delà de la ligne.
  const drawn = Math.ceil((segments.at(-1)?.to ?? 0) - 1e-9);
  const cells: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const covering = segments.filter((s) => s.to > i + 1e-9 && s.from < i + 1 - 1e-9);
    if (i < drawn) {
      cells.push(
        <g key={`b${i}`} transform={`translate(${i * CELL} 0)`} className="picto-empty">
          {shape === 'crate' ? <CrateIcon /> : <PersonIcon />}
        </g>,
      );
    }
    for (const s of covering) {
      const a = Math.max(s.from, i) - i;
      const b = Math.min(s.to, i + 1) - i;
      if (b - a < 0.04) continue;
      cells.push(
        <svg key={`${i}-${s.kind}-${s.from}`} x={i * CELL + a * ICON} y={0} width={(b - a) * ICON + 0.01} height={ROW_H} overflow="hidden">
          <g transform={`translate(${-a * ICON} 0)`} className={cx(`pk-${s.kind}`, s.unsold && 'pk-unsold')} style={s.kind === 'made' ? { fill: color } : undefined}>
            {shape === 'crate' ? <CrateIcon /> : <PersonIcon />}
          </g>
        </svg>,
      );
    }
  }
  return (
    <svg className="picto-row" viewBox={`0 -2 ${width} ${ROW_H + 4}`} width={width * SCALE} height={(ROW_H + 4) * SCALE} role="img" aria-label={label}>
      {cells}
      {marker !== undefined && marker > 0 && (
        <line x1={marker * CELL - 1} x2={marker * CELL - 1} y1={-2} y2={ROW_H + 2} className="picto-marker" />
      )}
    </svg>
  );
}

/** Foule de clients du secteur (une icône par part égale), colorée par produit. */
export function Crowd({ groups, label }: { groups: ShareGroup[]; label: string }) {
  const icons: ReactNode[] = [];
  let x = 0;
  for (const g of groups) {
    for (let i = 0; i < g.icons; i++) {
      icons.push(
        <g key={`${g.key}-${i}`} transform={`translate(${x} 0)`} className={cx('crowd-icon', `crowd-${g.role}`)} style={{ fill: g.role === 'others' ? undefined : g.color }}>
          <title>{`${g.name} · ${Math.round(g.share * 100)} %`}</title>
          <PersonIcon />
        </g>,
      );
      x += 13;
    }
  }
  return (
    <svg className="crowd" viewBox={`0 -2 ${Math.max(13, x)} ${ROW_H + 4}`} width={Math.max(13, x) * SCALE} height={(ROW_H + 4) * SCALE} role="img" aria-label={label}>
      {icons}
    </svg>
  );
}

export interface StripDot {
  key: string;
  value: number;
  color: string;
  title: string;
  focus: boolean;
}

/** Réglette : où se place ce produit face aux autres produits du secteur (et où il ira après ce trimestre). */
export function Strip({ dots, next, label }: { dots: StripDot[]; next?: number; label: string }) {
  const values = dots.map((d) => d.value).concat(next !== undefined ? [next] : []);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.08 : 1;
  const x = (v: number) => (span > 0 ? 8 + ((v - lo + pad) / (span + 2 * pad)) * 184 : 100);
  const focus = dots.find((d) => d.focus);
  const ordered = [...dots].sort((a, b) => Number(a.focus) - Number(b.focus));
  return (
    <svg className="strip" viewBox="0 0 200 18" role="img" aria-label={label}>
      <line x1={4} x2={196} y1={9} y2={9} className="strip-axis" />
      {focus && next !== undefined && Math.abs(next - focus.value) > 1e-6 && (
        <g>
          <line x1={x(focus.value)} x2={x(next)} y1={9} y2={9} className="strip-move" />
          <circle cx={x(next)} cy={9} r={4.2} className="strip-next" style={{ stroke: focus.color }} />
        </g>
      )}
      {ordered.map((d) => (
        <circle key={d.key} cx={x(d.value)} cy={9} r={d.focus ? 5 : 3.4} className={d.focus ? 'strip-focus' : 'strip-dot'} style={{ fill: d.color }}>
          <title>{d.title}</title>
        </circle>
      ))}
    </svg>
  );
}
