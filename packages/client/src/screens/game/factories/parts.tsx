/**
 * Pièces dessinées des scènes 2D (onglet « Mes usines », bêta) : usine, centre de R&D, grue, panneau, passants…
 * Sol à y = 0 : chaque pièce se dessine vers le haut à partir de GROUND. Encre sur papier, sans texte propre
 * (les libellés arrivent tout traduits).
 */
import type { ReactNode } from 'react';
import type { CommodityId, SectorId } from '@muchomoney/core';

/** Largeur minimale de la scène : elle s'élargit (la caméra recule) quand l'usine grandit. */
export const MIN_W = 400;
/** Hauteur = largeur × ASPECT : toutes les scènes ont les mêmes proportions. */
export const ASPECT = 0.38;
/** Sol à y = 0 : les bâtiments se dessinent vers le haut, le trottoir vers le bas. */
export const GROUND = 0;
export const DEPTH = 40;
export const LANE_IN = 14;
export const LANE_OUT = 27;
export const HALL_W = 28;
export const TOWER_W = 22;
export const LAB_W = [34, 34, 42, 50, 58];

export const INK = '#1b1a17';
export const PAPER = '#faf6ec';
export const PAPER2 = '#e9dfc6';
export const HAIR = '#cfc3a8';
export const LIT = '#f2c14e';
export const DARK = '#6c6457';
export const GREEN = '#4f8f45';
export const COATS = ['#2e5c8a', '#8a5a00', '#7a3413', '#1d6b35', '#6c6457', '#9b5de5', '#b0271d', '#3d3a33'];
export const SKINS = ['#f1d3b3', '#d9a877', '#a8744f', '#6f4a2f', '#f5dcc4'];

/** Couleur d'accent de chaque matière première (port de la capitale, gisements de la carte). */
export const COMMODITY_ACCENT: Record<CommodityId, string> = { oil: '#7a3413', lithium: '#2e5c8a', sugar: '#c77d8e', chips: '#1d6b35' };

export interface FactoryShape {
  halls: number;
  chimneys: number;
  tower: 0 | 1 | 2;
  flag: boolean;
}

export const SHAPES: FactoryShape[] = [
  { halls: 0, chimneys: 0, tower: 0, flag: false },
  { halls: 1, chimneys: 1, tower: 0, flag: false },
  { halls: 2, chimneys: 1, tower: 0, flag: false },
  { halls: 3, chimneys: 1, tower: 0, flag: false },
  { halls: 3, chimneys: 2, tower: 1, flag: false },
  { halls: 4, chimneys: 2, tower: 1, flag: false },
  { halls: 4, chimneys: 3, tower: 2, flag: false },
  { halls: 5, chimneys: 3, tower: 2, flag: false },
  { halls: 5, chimneys: 3, tower: 2, flag: true },
];

export function shapeOf(level: number): FactoryShape {
  return SHAPES[Math.max(0, Math.min(SHAPES.length - 1, level))];
}

export function factoryWidth(s: FactoryShape): number {
  return (s.tower ? TOWER_W : 0) + s.halls * HALL_W;
}

/** Glyphes rapportés par les clients : ce qu'ils font du produit en repartant. */
export const GLYPH: Record<SectorId, string> = {
  energy_drinks: '🥤',
  gadgets: '📱',
  scooters: '',
  yogurts: '🥛',
  crypto: '🪙',
};

/** Allure du retour (fraction de la boucle) : caféine et trottinettes pressées, gadgets distraits. */
export const RETURN_END: Record<SectorId, number> = {
  energy_drinks: 0.78,
  gadgets: 1,
  scooters: 0.74,
  yogurts: 0.95,
  crypto: 0.9,
};

// ---------------------------------------------------------------------------
// Pièces détachées
// ---------------------------------------------------------------------------

export function Smoke({ x, y, puffs, still }: { x: number; y: number; puffs: number; still: boolean }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < puffs; i++) {
    const begin = `${(-i * 3.3) / puffs}s`;
    if (still) {
      out.push(<circle key={i} cx={x + 3 + i * 4} cy={y - 5 - i * 7} r={2.5 + i * 1.5} className="scene-smoke" />);
      continue;
    }
    out.push(
      <circle key={i} cx={x} cy={y} r={2} className="scene-smoke">
        <animate attributeName="cy" values={`${y};${y - 30}`} dur="3.3s" begin={begin} repeatCount="indefinite" />
        <animate attributeName="cx" values={`${x};${x + 10}`} dur="3.3s" begin={begin} repeatCount="indefinite" />
        <animate attributeName="r" values="2;7" dur="3.3s" begin={begin} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.85;0" dur="3.3s" begin={begin} repeatCount="indefinite" />
      </circle>,
    );
  }
  return <>{out}</>;
}

export function Fan({ cx, cy, spinning, still }: { cx: number; cy: number; spinning: boolean; still: boolean }) {
  return (
    <g>
      <rect x={cx - 7} y={cy - 5} width={14} height={10} fill={PAPER2} stroke={INK} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={4} fill={PAPER} stroke={INK} strokeWidth={0.8} />
      <g>
        <path d={`M${cx} ${cy} l0 -3.6 M${cx} ${cy} l3.1 1.8 M${cx} ${cy} l-3.1 1.8`} stroke={INK} strokeWidth={1} />
        {spinning && !still && (
          <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="0.9s" repeatCount="indefinite" />
        )}
      </g>
    </g>
  );
}

export function Hall({ x, color, crypto, lit, ghost, green, still }: { x: number; color: string; crypto: boolean; lit: boolean; ghost?: boolean; green?: boolean; still?: boolean }) {
  const top = GROUND - 32;
  const stroke = ghost ? DARK : INK;
  const dash = ghost ? '3 2' : undefined;
  const roof = green ? GREEN : color;
  if (crypto) {
    return (
      <g>
        <rect x={x} y={top - 4} width={HALL_W} height={36} fill={ghost ? 'none' : PAPER} stroke={stroke} strokeDasharray={dash} strokeWidth={1.1} />
        {!ghost && <rect x={x} y={top - 4} width={HALL_W} height={4} fill={roof} stroke={INK} strokeWidth={1} />}
        {!ghost &&
          [0, 1, 2].map((col) =>
            [0, 1, 2].map((row) => (
              <circle
                key={`${col}-${row}`}
                cx={x + 7 + col * 7}
                cy={top + 7 + row * 8}
                r={1.3}
                fill={lit ? (row + col) % 2 ? '#3fbf6f' : LIT : DARK}
                className={lit && !still ? `scene-led d${(row * 3 + col) % 4}` : undefined}
              />
            )),
          )}
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={top} width={HALL_W} height={32} fill={ghost ? 'none' : PAPER} stroke={stroke} strokeDasharray={dash} strokeWidth={1.1} />
      <path
        d={`M${x} ${top} L${x} ${top - 12} L${x + 14} ${top} L${x + 14} ${top - 12} L${x + 28} ${top}`}
        fill={ghost ? 'none' : roof}
        stroke={stroke}
        strokeDasharray={dash}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      {!ghost && (
        <>
          <rect x={x + 5} y={top + 7} width={7} height={8} fill={lit ? LIT : DARK} stroke={INK} strokeWidth={0.7} />
          <rect x={x + 16} y={top + 7} width={7} height={8} fill={lit ? LIT : DARK} stroke={INK} strokeWidth={0.7} />
        </>
      )}
      {ghost && (
        <path
          d={`M${x + 7} ${top} V${GROUND} M${x + 21} ${top} V${GROUND} M${x} ${top + 11} H${x + 28} M${x} ${top + 22} H${x + 28}`}
          stroke={DARK}
          strokeWidth={0.6}
        />
      )}
    </g>
  );
}

export function Tower({ x, height, color, lit, flag }: { x: number; height: number; color: string; lit: boolean; flag: boolean }) {
  const top = GROUND - height;
  const rows = Math.floor((height - 14) / 9);
  return (
    <g>
      <rect x={x} y={top} width={TOWER_W} height={height} fill={PAPER} stroke={INK} strokeWidth={1.1} />
      <rect x={x} y={top} width={TOWER_W} height={3} fill={color} stroke={INK} strokeWidth={0.8} />
      {Array.from({ length: rows }, (_, r) => (
        <g key={r}>
          <rect x={x + 4} y={top + 7 + r * 9} width={5} height={5} fill={lit ? LIT : DARK} />
          <rect x={x + 13} y={top + 7 + r * 9} width={5} height={5} fill={lit && r % 3 !== 1 ? LIT : DARK} />
        </g>
      ))}
      <line x1={x + 11} y1={top} x2={x + 11} y2={top - (flag ? 18 : 9)} stroke={INK} strokeWidth={1} />
      {flag && <path d={`M${x + 11} ${top - 18} l12 3.5 l-12 3.5 z`} fill={color} stroke={INK} strokeWidth={0.8} />}
    </g>
  );
}

export function Crane({ mx, hookX, still }: { mx: number; hookX: number; still: boolean }) {
  const top = GROUND - 90;
  const braces: string[] = [];
  for (let y = GROUND; y > top + 4; y -= 8) braces.push(`M${mx} ${y} L${mx + 6} ${y - 8}`);
  return (
    <g className="scene-crane">
      <path d={`M${mx} ${GROUND} V${top} M${mx + 6} ${GROUND} V${top} ${braces.join(' ')}`} stroke={INK} strokeWidth={0.9} fill="none" />
      <path d={`M${mx - 62} ${top} H${mx + 20} M${mx - 62} ${top} L${mx + 3} ${top - 10} L${mx + 20} ${top}`} stroke={INK} strokeWidth={1} fill="none" />
      <rect x={mx + 12} y={top} width={8} height={7} fill={DARK} />
      <rect x={mx - 3} y={top + 1} width={10} height={7} fill={LIT} stroke={INK} strokeWidth={0.8} />
      <g>
        <line x1={hookX} y1={top} x2={hookX} y2={GROUND - 62} stroke={INK} strokeWidth={0.6} />
        <rect x={hookX - 8} y={GROUND - 62} width={16} height={3} fill="#b0271d" stroke={INK} strokeWidth={0.5} />
        {!still && <animateTransform attributeName="transform" type="translate" values="0 0;0 14;0 0" dur="6s" repeatCount="indefinite" />}
      </g>
    </g>
  );
}

export function Crate({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <g>
      <rect x={x} y={y} width={10} height={10} fill={fill} stroke={INK} strokeWidth={0.8} />
      <path d={`M${x} ${y} L${x + 10} ${y + 10} M${x + 10} ${y} L${x} ${y + 10}`} stroke={INK} strokeWidth={0.4} opacity={0.6} />
    </g>
  );
}

export function Lab({ x, level, researchers, still }: { x: number; level: number; researchers: number; still: boolean }) {
  const w = LAB_W[level] ?? LAB_W[1];
  const h = [30, 30, 36, 42, 46][level] ?? 30;
  const top = GROUND - h;
  const windows = level + 1;
  const gap = (w - windows * 7) / (windows + 1);
  const people = Array.from({ length: windows }, (_, i) => (researchers > i ? 1 : 0) + (researchers > windows + i ? 1 : 0));
  return (
    <g>
      {level >= 4 && <path d={`M${x + w / 2 - 12} ${top} A12 12 0 0 1 ${x + w / 2 + 12} ${top} Z`} fill={PAPER2} stroke={INK} strokeWidth={1} />}
      {level >= 2 && <line x1={x + 5} y1={top} x2={x + 5} y2={top - 10} stroke={INK} strokeWidth={0.8} />}
      <rect x={x} y={top} width={w} height={h} fill="#eef2ee" stroke={INK} strokeWidth={1.1} />
      <rect x={x} y={top} width={w} height={3} fill="#2e5c8a" />
      {people.map((n, i) => {
        const wx = x + gap + i * (7 + gap);
        return (
          <g key={i}>
            <rect x={wx} y={top + 7} width={7} height={11} fill={n > 0 ? LIT : DARK} stroke={INK} strokeWidth={0.6} />
            {Array.from({ length: n }, (_, k) => {
              const px = wx + (n > 1 ? 1.9 + k * 3.2 : 3.5);
              return (
                <g key={k} className={still ? undefined : `scene-bob d${(i + k) % 4}`}>
                  <circle cx={px} cy={top + 11} r={1.5} fill={SKINS[(i + k) % SKINS.length]} stroke={INK} strokeWidth={0.3} />
                  <path d={`M${px - 1.5} ${top + 18} v-3.4 q1.5 -1.4 3 0 v3.4 z`} fill="#ffffff" stroke={INK} strokeWidth={0.3} />
                </g>
              );
            })}
          </g>
        );
      })}
      {/* Enseigne : un erlenmeyer qui bouillonne quand la R&D a du budget. */}
      <path d={`M${x + w / 2 - 2} ${GROUND - 13} v4 l-4 7 h12 l-4 -7 v-4 z`} fill={researchers > 0 ? '#9ad0c2' : PAPER} stroke={INK} strokeWidth={0.8} />
      {researchers > 0 && !still &&
        [0, 1].map((i) => (
          <circle key={i} cx={x + w / 2} cy={GROUND - 14} r={1} fill="#9ad0c2" stroke={INK} strokeWidth={0.3}>
            <animate attributeName="cy" values={`${GROUND - 14};${GROUND - 24}`} dur="1.6s" begin={`${-i * 0.8}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0" dur="1.6s" begin={`${-i * 0.8}s`} repeatCount="indefinite" />
          </circle>
        ))}
    </g>
  );
}

export function Billboard({ x, y, w, h, name, emoji, spots, bulbs, still }: { x: number; y: number; w: number; h: number; name: string; emoji: string; spots: number; bulbs: boolean; still: boolean }) {
  // Le nom rétrécit d'abord (jusqu'à 5,5), puis se tronque.
  const font = Math.max(5.5, Math.min(11, h * 0.34, (w - 12) / (name.length * 0.58 + 1.4)));
  const maxChars = Math.max(3, Math.floor((w - 12 - font * 1.4) / (font * 0.58)));
  const label = name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
  const beams: ReactNode[] = [];
  for (let i = 0; i < spots; i++) {
    const lx = x + ((i + 1) * w) / (spots + 1);
    beams.push(
      <g key={i}>
        <path d={`M${lx} ${y + h + 4} L${lx - 7} ${y} L${lx + 7} ${y} Z`} className={still ? 'scene-beam still' : `scene-beam d${i % 4}`} />
        <rect x={lx - 2.5} y={y + h + 3} width={5} height={3} fill={INK} />
      </g>,
    );
  }
  return (
    <g>
      <line x1={x + w * 0.25} y1={y + h} x2={x + w * 0.25} y2={GROUND} stroke={INK} strokeWidth={1.2} />
      <line x1={x + w * 0.75} y1={y + h} x2={x + w * 0.75} y2={GROUND} stroke={INK} strokeWidth={1.2} />
      <rect x={x} y={y} width={w} height={h} fill={PAPER} stroke={INK} strokeWidth={1.2} />
      <text x={x + 5} y={y + h / 2} fontSize={font * 1.1} dominantBaseline="central">
        {emoji}
      </text>
      <text x={x + 7 + font * 1.3} y={y + h / 2} fontSize={font} dominantBaseline="central" className="scene-ad">
        {label}
      </text>
      {bulbs &&
        Array.from({ length: Math.floor(w / 9) }, (_, i) => (
          <circle key={i} cx={x + 5 + i * 9} cy={y - 2} r={1.3} fill={LIT} stroke={INK} strokeWidth={0.4} className={still ? undefined : `scene-led d${i % 4}`} />
        ))}
      {beams}
    </g>
  );
}

/** Passant (pieds à l'origine). */
export function Person({ coat, skin }: { coat: string; skin: string }) {
  return (
    <g>
      <line x1={-1.6} y1={-4} x2={-2.2} y2={0} stroke={INK} strokeWidth={1.1} />
      <line x1={1.6} y1={-4} x2={2.2} y2={0} stroke={INK} strokeWidth={1.1} />
      <path d="M-3.6 -3.5 Q-4 -11 0 -11.5 Q4 -11 3.6 -3.5 Z" fill={coat} stroke={INK} strokeWidth={0.7} />
      <circle cx={0} cy={-14.3} r={2.8} fill={skin} stroke={INK} strokeWidth={0.7} />
    </g>
  );
}

export function Scooter() {
  return (
    <g>
      <line x1={-6} y1={-1} x2={6} y2={-1} stroke={INK} strokeWidth={1.2} />
      <line x1={5.5} y1={-1} x2={4} y2={-12} stroke={INK} strokeWidth={1} />
      <circle cx={-5} cy={0} r={1.6} fill={PAPER} stroke={INK} strokeWidth={0.8} />
      <circle cx={5} cy={0} r={1.6} fill={PAPER} stroke={INK} strokeWidth={0.8} />
    </g>
  );
}

export function Walkers({ sectorId, served, unserved, doorX, width, still }: { sectorId: SectorId; served: number; unserved: number; doorX: number; width: number; still: boolean }) {
  const total = served + unserved;
  if (total === 0) return null;
  const glyph = GLYPH[sectorId];
  const out: ReactNode[] = [];
  const startX = width + 20;
  const inLen = startX - doorX;
  const down = LANE_OUT - LANE_IN;
  const len = inLen * 2 + down;
  const atDoor = inLen / len;
  const leave = (inLen + down) / len;
  const dur = 15;
  for (let i = 0; i < total; i++) {
    const happy = i < served;
    const coat = COATS[(i * 3 + 1) % COATS.length];
    const skin = SKINS[(i * 2 + 3) % SKINS.length];
    const carried = (
      <g>
        {happy ? (
          sectorId === 'scooters' ? (
            <Scooter />
          ) : (
            <text x={sectorId === 'gadgets' ? 2.5 : 4.5} y={sectorId === 'gadgets' ? -14 : -6} fontSize={sectorId === 'gadgets' ? 6 : 7} textAnchor="middle" dominantBaseline="central">
              {glyph}
            </text>
          )
        ) : (
          <g>
            <circle cx={0} cy={-23} r={4.2} fill={PAPER} stroke="#b0271d" strokeWidth={0.9} />
            <text x={0} y={-22.6} fontSize={6.5} textAnchor="middle" dominantBaseline="central" fill="#b0271d" fontWeight={700}>
              !
            </text>
          </g>
        )}
        {happy && (sectorId === 'energy_drinks' || sectorId === 'scooters') && (
          <path d="M-9 -9 h-5 M-8 -6 h-6 M-9 -3 h-4" stroke={INK} strokeWidth={0.5} opacity={0.7} />
        )}
      </g>
    );
    if (still) {
      // Image fixe : les clients servis repartent avec le produit, les autres attendent devant la porte.
      const x = happy ? doorX + 30 + i * 18 : doorX + 14 + (i - served) * 13;
      out.push(
        <g key={i} transform={`translate(${x} ${happy ? LANE_OUT : LANE_IN}) scale(1.35)`}>
          <Person coat={coat} skin={skin} />
          {carried}
        </g>,
      );
      continue;
    }
    const end = happy ? RETURN_END[sectorId] : 1;
    const keyPoints = end < 1 ? `0;${atDoor};${leave};1;1` : `0;${atDoor};${leave};1`;
    const keyTimes = end < 1 ? `0;0.42;0.5;${end};1` : '0;0.42;0.5;1';
    const begin = `${(-i * dur) / total}s`;
    out.push(
      <g key={i}>
        <animateMotion
          dur={`${dur}s`}
          begin={begin}
          repeatCount="indefinite"
          calcMode="linear"
          keyPoints={keyPoints}
          keyTimes={keyTimes}
          path={`M${startX} ${LANE_IN} H${doorX} V${LANE_OUT} H${startX}`}
        />
        <g transform="scale(1.35)">
          <g className={`scene-bob d${i % 4}`}>
            <Person coat={coat} skin={skin} />
          </g>
          <g opacity={0}>
            <animate attributeName="opacity" values="0;1" keyTimes="0;0.5" calcMode="discrete" dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
            {carried}
          </g>
        </g>
      </g>,
    );
  }
  return <>{out}</>;
}

// ---------------------------------------------------------------------------
// Scènes
// ---------------------------------------------------------------------------

export function Ground({ width }: { width: number }) {
  return (
    <g>
      <rect x={0} y={GROUND} width={width} height={DEPTH} fill={PAPER2} />
      <line x1={0} y1={GROUND} x2={width} y2={GROUND} stroke={INK} strokeWidth={1.2} />
      <line x1={0} y1={GROUND + 7} x2={width} y2={GROUND + 7} stroke={HAIR} strokeWidth={1} />
      <line x1={0} y1={GROUND + DEPTH - 6} x2={width} y2={GROUND + DEPTH - 6} stroke={INK} strokeWidth={1} />
    </g>
  );
}
