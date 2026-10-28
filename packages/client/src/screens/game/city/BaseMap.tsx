/**
 * La carte de base : le décor statique (mer, terre, relief, routes, noms des repères, boussole et
 * échelle) extrait de MapView pour être partagé avec le plateau hexagonal (HexBoard). Le
 * <svg> est rendu ici ; les couches propres à chaque écran arrivent en `children`, après le décor.
 * L'onglet carte (MapView) utilise ce même composant : le dessin ne change pas d'un pixel.
 */
import { memo, useId, type JSX, type ReactNode } from 'react';
import type { LandmarkId, MapPoint } from '@muchomoney/core';
import { COASTLINE, ISLAND, LAKE, LANDMARKS, MOUNTAIN_RANGE, RIVERS, ROADS, roadPoints } from '@muchomoney/core';
import { DARK, INK, LIT, PAPER, PAPER2 } from '../factories/parts';
import { smoothPath, type MapScale } from './mapModel';

// ---------------------------------------------------------------------------
// Constantes de dessin (palette journal, cf. factories/parts.tsx)
// ---------------------------------------------------------------------------

export const INK2 = '#3d3a33';
export const MUTED = DARK;
export const LAND = '#f7f0de';
const WATER = '#cfdcd8';
const WAVE = '#8fa9a4';
export const UP = '#1d6b35';
export const DOWN = '#b0271d';
export const AUTOPILOT = '#8a8273';
export const HIGHWAY = '#7a3413';
export const NATIONAL = '#5b544a';
export const SEA_LINK = '#2e5c8a';
const RIVER = '#a9c3bd';
const MOUNT = '#ece0c2';
const ROCK_EDGE = '#b9a678';
const WATER_TEXT = '#4f6f69';
const HATCH = '#d6c79f';
const ROCK_HATCH = '#c9b98f';
const SHORE = '#e3ebe8';

/** Cadre du dessin (km) : le pays plus une marge pour les noms en bord de côte, comme la maquette. */
export const MAP_VIEW = { x: -40, y: -30, width: 1080, height: 1250 };
/** Sommets de la chaîne de l'est (km, échelle). */
const PEAKS: [number, number, number][] = [
  [835, 330, 0.9], [880, 310, 1.1], [925, 330, 1], [850, 395, 1.2], [905, 375, 1.3], [950, 410, 1],
  [830, 460, 0.9], [935, 470, 1.1], [870, 540, 1], [930, 560, 0.9], [960, 510, 0.8], [900, 600, 0.8],
];
/** Traits de vague (km). */
const WAVES: [number, number][] = [
  [0, 260], [10, 450], [-10, 680], [40, 1040], [130, 1180], [330, 20],
  [600, 15], [880, 0], [1030, 600], [1020, 900], [700, 1210], [300, 1220],
];
/** Repères dont le nom prend la couleur de l'eau. */
const WATER_LABELS = new Set<LandmarkId>(['sea', 'gulf', 'bay', 'lake', 'river']);
/**
 * Retouches de placement des noms de repères (km, avant projection — elles suivent l'échelle) :
 * la baie monte pour ne plus toucher le nom de la ville du nord, le golfe descend sous l'île pour ne
 * plus chevaucher le gisement oil-2 au large.
 */
const LABEL_NUDGE: Partial<Record<LandmarkId, { dx?: number; dy?: number }>> = {
  bay: { dy: -38 },
  gulf: { dx: -35, dy: 130 },
};

/** Point au milieu (en longueur) d'une ligne brisée, en km. */
export function midpoint(points: MapPoint[]): MapPoint {
  const segs = points.slice(1).map((q, i) => Math.hypot(q.x - points[i].x, q.y - points[i].y));
  let half = segs.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < segs.length; i++) {
    if (half <= segs[i]) {
      const t = segs[i] ? half / segs[i] : 0;
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    half -= segs[i];
  }
  return points[points.length - 1];
}

/** Ligne brisée projetée, arrondie au dixième de pixel. */
export function poly(proj: MapScale, points: MapPoint[]): string {
  return points.map((p) => `${proj.px(p.x).toFixed(1)},${proj.py(p.y).toFixed(1)}`).join(' ');
}

// ---------------------------------------------------------------------------
// Le décor : mer, terre, relief, routes, repères, boussole et échelle
// ---------------------------------------------------------------------------

const Scenery = memo(function Scenery({
  proj,
  small,
  animate,
  names,
  uid,
  scaleBar,
}: {
  proj: MapScale;
  small: boolean;
  animate: boolean;
  names: Record<LandmarkId, string>;
  uid: string;
  scaleBar: string;
}) {
  const u = (km: number) => km * proj.scale;
  const W = proj.width;
  const H = proj.height;
  const smooth = (pts: MapPoint[], closed: boolean) => smoothPath(pts.map((p) => ({ x: proj.px(p.x), y: proj.py(p.y) })), closed);
  const coast = smooth(COASTLINE, true);
  const bx = W - u(34);
  const by = H - u(46);
  const sx = u(14);
  const sy = H - u(16);
  return (
    <g>
      <defs>
        <pattern id={`map-hatch-${uid}`} width={u(6)} height={u(6)} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={u(6)} stroke={HATCH} strokeWidth={u(1.6)} />
        </pattern>
        <pattern id={`map-rock-${uid}`} width={u(5)} height={u(5)} patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <line x1={0} y1={0} x2={0} y2={u(5)} stroke={ROCK_HATCH} strokeWidth={u(1)} />
        </pattern>
        <clipPath id={`map-land-${uid}`}>
          <path d={coast} />
        </clipPath>
      </defs>

      {/* Mer et vagues. */}
      <rect x={0} y={0} width={W} height={H} fill={WATER} />
      {WAVES.map(([wx, wy], i) =>
        wx < MAP_VIEW.x || wx > MAP_VIEW.x + MAP_VIEW.width || wy < MAP_VIEW.y || wy > MAP_VIEW.y + MAP_VIEW.height ? null : (
          <path
            key={i}
            d={`M${proj.px(wx)} ${proj.py(wy)} q${u(5)} ${-u(4)} ${u(10)} 0 t${u(10)} 0`}
            fill="none"
            stroke={WAVE}
            strokeWidth={u(1.2)}
            className={animate ? 'map-a-wave' : undefined}
          />
        ),
      )}

      {/* Terre : liseré clair au large, côte à l'encre, île du golfe. */}
      <path d={coast} fill="none" stroke={SHORE} strokeWidth={u(9)} strokeLinejoin="round" />
      <path d={coast} fill={LAND} stroke={INK} strokeWidth={u(1.3)} strokeLinejoin="round" />
      <path d={smooth(ISLAND, true)} fill={LAND} stroke={INK} strokeWidth={u(1.1)} />

      {/* Relief : plaine hachurée, chaîne de l'est et ses sommets enneigés, fleuves, lac. */}
      <g clipPath={`url(#map-land-${uid})`}>
        <ellipse cx={proj.px(320)} cy={proj.py(1085)} rx={u(180)} ry={u(70)} fill={`url(#map-hatch-${uid})`} />
      </g>
      <path d={smooth(MOUNTAIN_RANGE, true)} fill={MOUNT} stroke={ROCK_EDGE} strokeWidth={u(1)} />
      <path d={smooth(MOUNTAIN_RANGE, true)} fill={`url(#map-rock-${uid})`} />
      {PEAKS.map(([mx, my, ms], i) => {
        const h = u(small ? 7 : 10) * ms;
        const x = proj.px(mx);
        const y = proj.py(my);
        return (
          <g key={i}>
            <path
              d={`M${x - h} ${y + h * 0.55} L${x} ${y - h * 0.75} L${x + h} ${y + h * 0.55} Z`}
              fill={PAPER2}
              stroke={MUTED}
              strokeWidth={u(0.9)}
              strokeLinejoin="round"
            />
            <path d={`M${x - h * 0.28} ${y - h * 0.37} L${x} ${y - h * 0.75} L${x + h * 0.28} ${y - h * 0.37}`} fill={PAPER} stroke="none" />
          </g>
        );
      })}
      {RIVERS.map((r, i) => (
        <path key={i} d={smooth(r, false)} fill="none" stroke={RIVER} strokeWidth={u(small ? 2.2 : 3)} strokeLinecap="round" />
      ))}
      <path d={smooth(LAKE, true)} fill={WATER} stroke={WAVE} strokeWidth={u(1.2)} />

      {/* Routes : pipelines et montagne d'abord, autoroutes (filet jaune) par-dessus. */}
      {(['sea', 'mountain', 'road', 'highway'] as const).map((kind) =>
        ROADS.filter((r) => r.kind === kind).map((r, i) => {
          const pts = poly(proj, roadPoints(r));
          if (kind === 'highway') {
            return (
              <g key={`${kind}-${i}`}>
                <polyline points={pts} fill="none" stroke={HIGHWAY} strokeWidth={u(small ? 3.4 : 4.6)} strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={pts} fill="none" stroke={LIT} strokeWidth={u(small ? 1.2 : 1.8)} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          }
          const style =
            kind === 'road'
              ? { stroke: NATIONAL, strokeWidth: u(small ? 1.1 : 1.5) }
              : kind === 'mountain'
                ? { stroke: HIGHWAY, strokeWidth: u(small ? 1.1 : 1.5), strokeDasharray: `${u(4)} ${u(2.5)}` }
                : { stroke: SEA_LINK, strokeWidth: u(small ? 1 : 1.3), strokeDasharray: `${u(5)} ${u(3.5)}` };
          return <polyline key={`${kind}-${i}`} points={pts} fill="none" strokeLinecap="round" strokeLinejoin="round" {...style} />;
        }),
      )}
      {/* Écussons A1 / A2 au milieu d'un tronçon de chaque autoroute (ordinateur). */}
      {!small &&
        ['A1', 'A2'].map((aid) => {
          const first = ROADS.filter((r) => r.id === aid)[1] ?? ROADS.find((r) => r.id === aid);
          if (!first) return null;
          const mp = midpoint(roadPoints(first));
          const x = proj.px(mp.x);
          const y = proj.py(mp.y);
          return (
            <g key={aid}>
              <rect x={x - 11} y={y - 7} width={22} height={14} rx={3} fill={DOWN} stroke={PAPER} strokeWidth={1.2} />
              <text x={x} y={y + 3.5} fontSize={9} fontWeight={700} fill={PAPER} textAnchor="middle">
                {aid}
              </text>
            </g>
          );
        })}

      {/* Noms des repères : serif italique, l'eau en vert-gris, la mer à la verticale. */}
      {(Object.entries(LANDMARKS) as [LandmarkId, (typeof LANDMARKS)[LandmarkId]][]).map(([lid, l]) => {
        if (small && (lid === 'river' || lid === 'island' || lid === 'cape')) return null;
        const water = WATER_LABELS.has(lid);
        const nudge = LABEL_NUDGE[lid];
        const x = proj.px(l.x + (nudge?.dx ?? 0));
        const y = proj.py(l.y + (nudge?.dy ?? 0));
        const rot = lid === 'sea' ? `rotate(-90 ${x} ${y})` : lid === 'river' ? `rotate(-3 ${x} ${y})` : undefined;
        return (
          <text
            key={lid}
            x={x}
            y={y}
            transform={rot}
            fontSize={small ? 8.5 : lid === 'sea' ? 12 : 10}
            fontStyle="italic"
            fill={water ? WATER_TEXT : MUTED}
            textAnchor="middle"
            className="map-serif"
            letterSpacing={water ? u(0.6) : 0}
          >
            {names[lid]}
          </text>
        );
      })}

      {/* Boussole et échelle (ordinateur). */}
      {!small && (
        <g aria-hidden>
          <g>
            <path d={`M${bx} ${by - u(14)} l${u(5)} ${u(14)} l${-u(5)} ${-u(4)} l${-u(5)} ${u(4)} z`} fill={INK} />
            <text x={bx} y={by - u(17)} fontSize={9} textAnchor="middle" fill={INK} fontWeight={700}>
              N
            </text>
          </g>
          <path
            d={`M${sx} ${sy} h${u(200)} M${sx} ${sy - u(4)} v${u(8)} M${sx + u(100)} ${sy - u(3)} v${u(6)} M${sx + u(200)} ${sy - u(4)} v${u(8)}`}
            stroke={INK}
            strokeWidth={u(1.2)}
            fill="none"
          />
          <text x={sx + u(100)} y={sy - u(7)} fontSize={9} textAnchor="middle" fill={INK}>
            {scaleBar}
          </text>
        </g>
      )}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Le composant : le <svg> de la carte, le décor, puis les couches en children
// ---------------------------------------------------------------------------

export interface BaseMapProps {
  /** Projection km → px (mapScale(largeur, MAP_VIEW)) : le parent possède la projection. */
  proj: MapScale;
  small: boolean;
  animate?: boolean;
  names: Record<LandmarkId, string>;
  scaleBar: string;
  /** Nom accessible de la carte (aria-label du <svg role="group">). */
  mapAria: string;
  /** Couches SVG en surimpression, rendues après le décor. */
  children?: ReactNode;
}

export function BaseMap({ proj, small, animate = false, names, scaleBar, mapAria, children }: BaseMapProps): JSX.Element {
  // Préfixe unique des ids de motifs/clips : deux cartes peuvent cohabiter sur la même page.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg className="map-svg" width={proj.width} height={proj.height} viewBox={`0 0 ${proj.width} ${proj.height}`} role="group" aria-label={mapAria}>
      <Scenery proj={proj} small={small} animate={animate} names={names} uid={uid} scaleBar={scaleBar} />
      {children}
    </svg>
  );
}
