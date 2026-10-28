/**
 * L'onglet « La carte » (bêta) : le port franc de la capitale (son titre visible est porté par le parent,
 * t.city.map.portTitle). Quatre entrepôts vus de côté sur un quai, un par matière première :
 *   cadran = prix / prix de base (aiguille de la moitié au double, échelle logarithmique, zones « soldes »
 *   et « flambée » aux mêmes seuils que warehouseModel), plaque = prix, % du prix de base, variation ;
 *   courbe peinte sur le mur = derniers cours (pointillés : prix de base) ; tampon SOLDES / FLAMBÉE ;
 *   affichette = articles du journal sur la matière ; roue dentée = une de mes usines la consomme ;
 *   sur le quai, devant : MES barils, piles, sacs ou caisses (une icône = la même quantité de lots partout).
 * Tableaux : banque centrale (jauge du taux face au taux normal), fisc (part du gâteau), moral des marchés (météo).
 * Impasse des Rumeurs : l'indic et les rumeurs du numéro, jamais rattachées à une entreprise ni à une matière.
 * Chaque entrepôt porte ses chiffres en infobulle (<title>) et ouvre l'onglet Matières au clic ou au clavier.
 */
import { memo, useCallback, useMemo, type ReactNode } from 'react';
import type { CommodityId, PlayerView, RumorReliability } from '@muchomoney/core';
import { BASE_INTEREST_RATE, COMMODITIES, SECTORS } from '@muchomoney/core';
import { useElementWidth } from '../../../hooks/useElementWidth';
import { cx } from '../../../util';
import { useContent, useT } from '../../../i18n';
import { useFmt, type Fmt } from '../../../fmt';
import { pictoUnit } from '../factories/model';
import { COMMODITY_ACCENT, Crate, DARK, HAIR, INK, LIT, PAPER, PAPER2 } from '../factories/parts';
import { PHONE_W, SALE_RATIO, SPIKE_RATIO, companyMatches, warehouseModel, type CityFilter, type CityNews, type CityTarget, type DistrictProps, type WarehouseModel } from './model';
import { pressable, useInView } from './a11y';

type T = ReturnType<typeof useT>;

// ---------------------------------------------------------------------------
// Constantes de dessin
// ---------------------------------------------------------------------------

const BLUE = '#2e5c8a';
const RED = '#b0271d';
const UP = '#1d6b35';
const MUTED = '#6c6457';
const WATER = '#cfdcd8';
const WAVE = '#8fa9a4';
const STONE = '#d9ccae';
const JOINT = '#b9aa88';
/** Icônes de stock au plus devant un entrepôt. */
const MAX_STOCK_ICONS = 8;
/** Zones du cadran (degrés depuis la verticale). */
const SALE_A = Math.log2(SALE_RATIO) * 60;
const SPIKE_A = Math.log2(SPIKE_RATIO) * 60;
/** Nombre de cours peints sur le mur, au plus. */
const CURVE_POINTS = 12;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Mesure approximative du texte (un peu large par prudence) : décide ce qui tient
// ---------------------------------------------------------------------------

function textW(s: string, size: number, bold = false): number {
  let em = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfe0f || code === 0x200d) continue;
    // \s couvre aussi les espaces insécables (fines et normales) des montants.
    if (/\s/.test(ch)) em += 0.32;
    else if (/[.,:;'’|!iljI()\-/]/.test(ch)) em += 0.34;
    else if (/[tfr]/.test(ch)) em += 0.44;
    else if (/[0-9]/.test(ch)) em += 0.64;
    else if (/[mwMW]/.test(ch)) em += 0.94;
    else if (/[A-Z€$%&]/.test(ch)) em += 0.74;
    else if (code >= 0x1f000) em += 1.25;
    else if (code > 0x2000) em += 0.85;
    else em += 0.62;
  }
  return em * size * (bold ? 1.12 : 1);
}

/** Coupe un texte en lignes aux espaces ordinaires (« 110 % » et « 60 lots » restent entiers). */
function wrap(s: string, size: number, maxW: number, bold = false): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && textW(next, size, bold) > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Coupe en deux lignes de largeurs proches (plutôt qu'une longue et une orpheline). */
function wrapBalanced(s: string, size: number, maxW: number, bold = false): string[] {
  const words = s.split(' ');
  let best: string[] | null = null;
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const w = Math.max(...lines.map((l) => textW(l, size, bold)));
    if (w <= maxW && w < bestW) {
      best = lines;
      bestW = w;
    }
  }
  return best ?? wrap(s, size, maxW, bold);
}

/** Range des morceaux de texte en lignes, séparés par « · » ; un morceau trop long se coupe à ses espaces. */
function packLines(items: string[], size: number, maxW: number, bold = false): string[] {
  const lines: string[] = [];
  for (const item of items) {
    const last = lines.at(-1);
    if (last !== undefined && textW(`${last} · ${item}`, size, bold) <= maxW) lines[lines.length - 1] = `${last} · ${item}`;
    else lines.push(...wrap(item, size, maxW, bold));
  }
  return lines;
}

/** Plus grande taille (de `max` à `min`, par demi-pixel) où le texte tient sur une ligne de `maxW` px. */
function fitSize(s: string, max: number, min: number, maxW: number, bold = false): number {
  for (let size = max; size > min; size -= 0.5) if (textW(s, size, bold) <= maxW) return size;
  return min;
}

/** Tronque avec « … » si le texte déborde encore à sa taille minimale. */
function ellipsize(s: string, size: number, maxW: number, bold = false): string {
  if (textW(s, size, bold) <= maxW) return s;
  const chars = [...s];
  while (chars.length > 1 && textW(`${chars.join('')}…`, size, bold) > maxW) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

/** Point d'un cadran : angle en degrés depuis la verticale, positif vers la droite. */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`;
}

// ---------------------------------------------------------------------------
// Géométrie (1 unité = 1 px) : colonnes, cadran, quai
// ---------------------------------------------------------------------------

interface Geo {
  phone: boolean;
  W: number;
  cols: number;
  /** Largeur d'une colonne (un entrepôt) et marge intérieure. */
  cw: number;
  padX: number;
  /** Tailles de texte : nom, petits textes, prix (au plus). */
  title: number;
  small: number;
  price: number;
  /** Cadran : rayon, largeur de sa colonne (plaque comprise), écart avec le bâtiment. */
  r: number;
  dcw: number;
  gap: number;
  /** Largeur du bâtiment. */
  bw: number;
  /** Haut de l'illustration (sous la ligne du nom) et centre du cadran. */
  top: number;
  cy: number;
  /** Profondeur du quai (où posent mes stocks) et hauteur de l'eau. */
  quay: number;
  water: number;
}

function geometry(width: number): Geo {
  // Un pixel de marge : aucun défilement horizontal, même avec une largeur arrondie.
  const W = Math.max(280, Math.floor(width) - 1);
  const phone = width < PHONE_W;
  const cols = phone || W < 960 ? 2 : 4;
  const cw = W / cols;
  const padX = phone ? 5 : 10;
  const inner = cw - 2 * padX;
  const dcw = phone ? clamp(inner * 0.5, 74, 96) : clamp(inner * 0.4, 112, 150);
  const gap = phone ? 4 : 10;
  const r = Math.min(phone ? 31 : 44, (dcw - 10) / 2);
  const title = phone ? 12 : 14;
  const top = title + 12;
  return {
    phone,
    W,
    cols,
    cw,
    padX,
    title,
    small: phone ? 10.5 : 11.5,
    price: phone ? 14 : 17,
    r,
    dcw,
    gap,
    bw: inner - dcw - gap,
    top,
    cy: top + r + 4,
    quay: phone ? 20 : 24,
    water: phone ? 14 : 18,
  };
}

// ---------------------------------------------------------------------------
// Plan : textes déjà mesurés, hauteurs communes à une rangée
// ---------------------------------------------------------------------------

interface WhPlan {
  w: WarehouseModel;
  id: CommodityId;
  name: string;
  nameSize: number;
  change: string;
  changeTone: 'up' | 'down' | 'flat';
  price: string;
  priceSize: number;
  vsLines: string[];
  vsSize: number;
  stamp: string | null;
  plaqueH: number;
  /** Textes peints sur le mur du quai (mon stock, « utilisée par vos usines »). */
  wallLines: string[];
  /** Icônes de stock (0 à 8) et stock vide (palette nue) quand j'ai une entreprise. */
  icons: number;
  emptyPallet: boolean;
  /** Cours peints sur le mur (le dernier = cours en direct). */
  curve: number[];
  base: number;
  tip: string;
  aria: string;
  match: boolean;
}

interface RowPlan {
  items: WhPlan[];
  G: number;
  wallH: number;
  H: number;
}

/** Le filtre met en avant les matières que consomment les entreprises concernées (secteurs publics). */
function warehouseMatches(w: WarehouseModel, view: PlayerView, filter: CityFilter): boolean {
  if (filter.kind === 'all') return true;
  if (filter.kind === 'mine' && (w.myLots ?? 0) > 0) return true;
  return view.companies.some(
    (c) => c.status === 'active' && companyMatches(c, filter, view.you) && c.products.some((p) => (SECTORS[p.sectorId]?.inputs[w.commodity.id] ?? 0) > 0),
  );
}

function planPort(view: PlayerView, news: CityNews, filter: CityFilter, geo: Geo, fmt: Fmt, t: T, names: Record<string, string>) {
  const p = t.city.port;
  const models = view.commodities.map((c) => warehouseModel(view, c, news));
  // Une seule unité pour les quatre quais : les piles se comparent d'un entrepôt à l'autre.
  const unit = pictoUnit(Math.max(1, ...models.map((m) => m.myLots ?? 0)), MAX_STOCK_ICONS);
  const inner = geo.cw - 2 * geo.padX;
  /** Largeur utile d'une plaque. */
  const room = geo.dcw - 10;
  // « 110 % du prix de base » : sur une ligne partout si le plus long tient à une taille lisible, sinon en
  // deux lignes équilibrées partout (les quatre plaques gardent la même mise en page).
  const vsTexts = models.map((w) => p.vsBase(fmt.pct(w.ratio, 0)));
  const longest = vsTexts.reduce((a, v) => (textW(v, 1) > textW(a, 1) ? v : a), '');
  const vsOne = fitSize(longest, geo.small, geo.small - 1.5, room);
  const single = textW(longest, vsOne) <= room;
  const plans: WhPlan[] = models.map((w, k) => {
    const c = w.commodity;
    const base = COMMODITIES[c.id]?.basePrice ?? c.price;
    const flat = !Number.isFinite(w.change) || Math.abs(w.change) < 0.0005;
    // La flèche porte le signe (comme sur les tours) : « ▲12,7 % », pas « ▲ +12,7 % ».
    const change = flat ? `= ${fmt.pct(0, 0)}` : `${w.change > 0 ? '▲' : '▼'}${fmt.pct(Math.abs(w.change), 1)}`;
    const rawName = `${c.emoji} ${names[c.id] ?? c.name}`;
    const nameSize = fitSize(rawName, geo.title, geo.title - 2, inner, true);
    const name = ellipsize(rawName, nameSize, inner, true);
    const price = p.perLot(fmt.money(c.price));
    const priceSize = fitSize(price, geo.price, geo.phone ? 10.5 : 12, room, true);
    const pct = fmt.pct(w.ratio, 0);
    const vsLines = single ? [vsTexts[k]] : wrapBalanced(vsTexts[k], geo.small, room);
    // Plaque : prix, % du prix de base, variation depuis la clôture.
    const plaqueH = 8 + priceSize + (vsLines.length + 1) * (geo.small + 3) + 3;

    // Mur du quai : mon stock (et l'unité des icônes), puis la marque « utilisée ».
    const count = w.myLots && w.myLots > 0 ? Math.min(MAX_STOCK_ICONS, Math.max(1, Math.round(w.myLots / unit))) : 0;
    const stockText = w.myLots === null ? null : p.myStock(fmt.lots(w.myLots));
    const unitText = count > 0 && unit > 1 ? p.stockUnit(fmt.lots(unit)) : null;
    const parts = [stockText, unitText, w.usedByMe ? p.used : null].filter((s): s is string => !!s);
    // Lettrage en gras (600) : mesuré large.
    const wallLines = packLines(parts, geo.small, inner, true);

    const history = [...c.priceHistory, c.price].slice(-CURVE_POINTS);
    const lo = Math.min(...history);
    const hi = Math.max(...history);
    const stamp = w.tag === 'sale' ? p.sale : w.tag === 'spike' ? p.spike : null;
    const tip = [
      `${rawName} · ${price} · ${p.vsBase(pct)} (${p.base(fmt.money(base))})`,
      p.since(flat ? fmt.pct(0, 0) : fmt.signedPct(w.change, 1)),
      // Seuils formatés dans la langue du salon, comme les pourcentages voisins.
      w.tag === 'sale' ? `${p.sale} · ${p.saleTip(fmt.pct(SALE_RATIO, 0))}` : w.tag === 'spike' ? `${p.spike} · ${p.spikeTip(fmt.pct(SPIKE_RATIO, 0))}` : '',
      p.curve(history.length, fmt.money(lo), fmt.money(hi)),
      [stockText, unitText].filter(Boolean).join(' · '),
      w.usedByMe ? p.used : '',
      ...w.news.map((a) => `📰 ${a.title}`),
    ]
      .filter(Boolean)
      .join('\n');
    return {
      w,
      id: c.id,
      name,
      nameSize,
      change,
      changeTone: flat ? 'flat' : w.change > 0 ? 'up' : 'down',
      price,
      priceSize,
      vsLines,
      vsSize: single ? vsOne : geo.small,
      stamp,
      plaqueH,
      wallLines,
      icons: count,
      emptyPallet: w.myLots !== null && count === 0,
      curve: history,
      base,
      tip,
      aria: p.warehouseAria(names[c.id] ?? c.name, price, pct),
      match: warehouseMatches(w, view, filter),
    } satisfies WhPlan;
  });

  // Rangées : le sol et le mur du quai sont communs à une rangée (les bâtiments posent sur la même ligne).
  const rows: RowPlan[] = [];
  const lineH = geo.small + 4;
  for (let i = 0; i < plans.length; i += geo.cols) {
    const items = plans.slice(i, i + geo.cols);
    const plaqueTop = geo.cy + 9;
    const G = Math.max(geo.top + (geo.phone ? 90 : 112), ...items.map((it) => plaqueTop + it.plaqueH + 9));
    const lines = Math.max(0, ...items.map((it) => it.wallLines.length));
    const wallH = lines > 0 ? 7 + lines * lineH : 10;
    rows.push({ items, G, wallH, H: G + geo.quay + wallH + geo.water });
  }
  return { rows };
}

// ---------------------------------------------------------------------------
// Bâtiments : chacun rend son dessin et le mur où peindre la courbe
// ---------------------------------------------------------------------------

interface Frame {
  x: number;
  w: number;
  top: number;
  G: number;
}
interface Built {
  body: ReactNode;
  /** Mur libre : la courbe s'y peint en haut. */
  wall: { x: number; y: number; w: number; h: number };
  /** Coin de l'affichette (journal) et place de la roue dentée (« utilisée »). */
  pin: { x: number; y: number };
  gear: { x: number; y: number };
}

/** Pétrole : citerne à dôme, cerclages et échelle. */
function oilTank(f: Frame): Built {
  const L = f.x + 2;
  const R = f.x + f.w - 13;
  const bw = R - L;
  const domeH = Math.min(12, bw * 0.12);
  const bodyTop = f.top + Math.max(domeH + 8, (f.G - f.top) * 0.2);
  const seams: string[] = [];
  for (let y = bodyTop + 16; y < f.G - 6; y += 15) seams.push(`M${L} ${y} H${R}`);
  const rungs: string[] = [];
  for (let y = f.G - 5; y > bodyTop - 2; y -= 6) rungs.push(`M${R + 3} ${y} H${R + 10}`);
  return {
    body: (
      <g>
        <path d={`M${L} ${bodyTop} A${bw / 2} ${domeH} 0 0 1 ${R} ${bodyTop} Z`} fill={PAPER2} stroke={INK} strokeWidth={1.1} />
        <path d={`M${L + bw * 0.5} ${bodyTop - domeH} v-6 M${L + bw * 0.5 - 4} ${bodyTop - domeH - 6} h8`} stroke={INK} strokeWidth={1} />
        <rect x={L} y={bodyTop} width={bw} height={f.G - bodyTop} fill={PAPER} stroke={INK} strokeWidth={1.2} />
        <rect x={L} y={bodyTop} width={bw} height={5} fill={COMMODITY_ACCENT.oil} stroke={INK} strokeWidth={0.8} />
        <path d={seams.join(' ')} stroke={HAIR} strokeWidth={0.8} />
        <path d={`M${R + 3} ${f.G} V${bodyTop - 4} M${R + 10} ${f.G} V${bodyTop - 4} ${rungs.join(' ')}`} stroke={INK} strokeWidth={0.8} fill="none" />
        {/* Vanne au pied de la citerne. */}
        <path d={`M${R - 16} ${f.G - 6} h-8 v6`} stroke={INK} strokeWidth={2} fill="none" />
        <circle cx={R - 16} cy={f.G - 6} r={2.4} fill={RED} stroke={INK} strokeWidth={0.6} />
      </g>
    ),
    wall: { x: L + 7, y: bodyTop + 11, w: bw - 14, h: f.G - bodyTop - 17 },
    pin: { x: R - 8, y: bodyTop + 8 },
    gear: { x: L + 12, y: f.G - 11 },
  };
}

/** Lithium : chevalement de mine, remise au toit bleu, galerie sombre et wagonnet. */
function mineShaft(f: Frame, cart: ReactNode): Built {
  const ah = f.G - f.top;
  const hw = clamp(f.w * 0.27, 20, 40);
  const hx = f.x + 1;
  const apexX = hx + hw / 2;
  const apexY = f.top + 8;
  const wheelR = Math.max(4, hw * 0.2);
  const sx = hx + hw + 4;
  const sw = f.x + f.w - sx - 1;
  const sTop = f.top + ah * 0.36;
  const peak = Math.min(14, sw * 0.18);
  const spokes = [0, 60, 120].map((a) => {
    const [x0, y0] = polar(apexX, apexY, wheelR, a);
    const [x1, y1] = polar(apexX, apexY, wheelR, a + 180);
    return `M${x0} ${y0} L${x1} ${y1}`;
  });
  return {
    body: (
      <g>
        <path
          d={`M${hx} ${f.G} L${apexX - 2} ${apexY} M${hx + hw} ${f.G} L${apexX + 2} ${apexY} M${hx + hw * 0.18} ${f.G - ah * 0.3} H${hx + hw * 0.82} M${hx + hw * 0.32} ${f.G - ah * 0.62} H${hx + hw * 0.68} M${hx + hw * 0.18} ${f.G - ah * 0.3} L${hx + hw * 0.68} ${f.G - ah * 0.62}`}
          stroke={INK}
          strokeWidth={1.1}
          fill="none"
        />
        <line x1={apexX + wheelR} y1={apexY} x2={apexX + wheelR} y2={f.G - 16} stroke={INK} strokeWidth={0.6} />
        <circle cx={apexX} cy={apexY} r={wheelR} fill={PAPER} stroke={INK} strokeWidth={1} />
        <path d={spokes.join(' ')} stroke={INK} strokeWidth={0.6} />
        <path d={`M${sx - 3} ${sTop} L${sx + sw / 2} ${sTop - peak} L${sx + sw + 3} ${sTop} Z`} fill={COMMODITY_ACCENT.lithium} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
        <rect x={sx} y={sTop} width={sw} height={f.G - sTop} fill={PAPER} stroke={INK} strokeWidth={1.2} />
        {/* Galerie : l'entrée sombre de la mine. */}
        <path d={`M${sx + sw - 20} ${f.G} v-9 a7 7 0 0 1 14 0 v9 z`} fill={DARK} stroke={INK} strokeWidth={0.8} />
        <path d={`M${hx - 1} ${f.G - 1} H${sx + sw}`} stroke={INK} strokeWidth={0.8} strokeDasharray="3 2" />
        {cart}
      </g>
    ),
    wall: { x: sx + 5, y: sTop + 6, w: sw - 10, h: f.G - sTop - 10 },
    pin: { x: sx + sw - 8, y: sTop + 4 },
    gear: { x: sx + 10, y: f.G - 10 },
  };
}

/** Wagonnet de minerai (pieds à y = 0). */
function Cart({ w }: { w: number }) {
  return (
    <g>
      <path d={`M${-w / 2} -11 L${w / 2} -11 L${w / 2 - 3} -3 L${-w / 2 + 3} -3 Z`} fill={DARK} stroke={INK} strokeWidth={0.9} />
      <path d={`M${-w / 2 + 2} -11 q${w / 4 - 1} -6 ${w / 2 - 2} -1 q${w / 4 - 1} -5 ${w / 2 - 2} 1 z`} fill="#cfd6dc" stroke={INK} strokeWidth={0.6} />
      <circle cx={-w / 4} cy={-2} r={2} fill={PAPER} stroke={INK} strokeWidth={0.8} />
      <circle cx={w / 4} cy={-2} r={2} fill={PAPER} stroke={INK} strokeWidth={0.8} />
    </g>
  );
}

/** Sucre : silo à toit conique, bagues de cerclage, élévateur à godets. */
function silo(f: Frame): Built {
  const ah = f.G - f.top;
  const sx = f.x + 2;
  const sw = f.w * 0.72;
  const coneTop = f.top + 2;
  const siloTop = f.top + clamp(ah * 0.16, 12, 20);
  const rings: string[] = [];
  for (let y = siloTop + 14; y < f.G - 6; y += 14) rings.push(`M${sx} ${y} H${sx + sw}`);
  const legX = sx + sw + (f.x + f.w - sx - sw) / 2 - 3;
  return {
    body: (
      <g>
        <rect x={legX} y={f.top + 8} width={6} height={f.G - f.top - 8} fill={PAPER2} stroke={INK} strokeWidth={0.9} />
        <rect x={legX - 3} y={f.top + 2} width={12} height={8} fill={COMMODITY_ACCENT.sugar} stroke={INK} strokeWidth={0.9} />
        <path d={`M${legX} ${f.top + 7} L${sx + sw / 2 + 3} ${coneTop + 4}`} stroke={INK} strokeWidth={1.4} />
        <path d={`M${sx - 3} ${siloTop} L${sx + sw / 2} ${coneTop} L${sx + sw + 3} ${siloTop} Z`} fill={COMMODITY_ACCENT.sugar} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
        <rect x={sx} y={siloTop} width={sw} height={f.G - siloTop} fill={PAPER} stroke={INK} strokeWidth={1.2} />
        <path d={rings.join(' ')} stroke={HAIR} strokeWidth={0.8} />
        {/* Trappe de vidange. */}
        <rect x={sx + sw - 16} y={f.G - 9} width={9} height={9} fill={DARK} stroke={INK} strokeWidth={0.7} />
      </g>
    ),
    wall: { x: sx + 6, y: siloTop + 8, w: sw - 12, h: f.G - siloTop - 14 },
    pin: { x: sx + sw - 8, y: siloTop + 6 },
    gear: { x: sx + 11, y: f.G - 11 },
  };
}

/** Puces : dépôt à toit en dents de scie et rideau métallique. */
function depot(f: Frame): Built {
  const ah = f.G - f.top;
  const dTop = f.top + ah * 0.34;
  const teeth = Math.max(2, Math.round(f.w / 34));
  const tw = f.w / teeth;
  let roof = `M${f.x} ${dTop}`;
  for (let i = 0; i < teeth; i++) roof += ` V${dTop - 11} L${f.x + (i + 1) * tw} ${dTop}`;
  const dw = clamp(f.w * 0.3, 18, 38);
  const dh = Math.min(24, (f.G - dTop) * 0.38);
  const doorX = f.x + f.w - dw - 6;
  const slats: string[] = [];
  for (let y = f.G - dh + 4; y < f.G; y += 4) slats.push(`M${doorX} ${y} h${dw}`);
  return {
    body: (
      <g>
        <path d={`${roof} Z`} fill={COMMODITY_ACCENT.chips} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
        <rect x={f.x} y={dTop} width={f.w} height={f.G - dTop} fill={PAPER} stroke={INK} strokeWidth={1.2} />
        <rect x={doorX} y={f.G - dh} width={dw} height={dh} fill={PAPER2} stroke={INK} strokeWidth={0.9} />
        <path d={slats.join(' ')} stroke={DARK} strokeWidth={0.5} />
      </g>
    ),
    wall: { x: f.x + 6, y: dTop + 6, w: f.w - 12, h: f.G - dTop - dh - 10 },
    pin: { x: f.x + f.w - 9, y: dTop + 4 },
    gear: { x: f.x + 12, y: f.G - 11 },
  };
}

// ---------------------------------------------------------------------------
// Pièces : courbe peinte, cadran, icônes de stock, chariot
// ---------------------------------------------------------------------------

/** Courbe des derniers cours peinte sur un mur (pointillés : prix de base ; point : cours en direct). */
function Mural({ x, y, w, h, values, base, tone }: { x: number; y: number; w: number; h: number; values: number[]; base: number; tone: string }) {
  const lo = Math.min(base, ...values);
  const hi = Math.max(base, ...values);
  const span = hi - lo || 1;
  const px = (i: number) => x + 4 + (values.length > 1 ? (i * (w - 8)) / (values.length - 1) : (w - 8) / 2);
  const py = (v: number) => y + h - 4 - ((v - lo) / span) * (h - 8);
  const pts = values.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const last = values.length - 1;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fffaf0" stroke={HAIR} strokeWidth={0.8} />
      <line x1={x + 2} x2={x + w - 2} y1={py(base)} y2={py(base)} stroke={MUTED} strokeWidth={0.7} strokeDasharray="2 2" />
      <polyline points={`${px(0)},${y + h - 2} ${pts} ${px(last)},${y + h - 2}`} fill={tone} opacity={0.12} stroke="none" />
      <polyline points={pts} fill="none" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={px(last)} cy={py(values[last])} r={2.2} fill={tone} stroke={INK} strokeWidth={0.6} />
    </g>
  );
}

/** Cadran demi-cercle : zones soldes / normal / flambée, graduations au prix ×½, ×0,7, ×1, ×1,4, ×2. */
function Dial({ cx, cy, r, angle, tone, labels, wobble }: { cx: number; cy: number; r: number; angle: number; tone: string; labels: boolean; wobble: boolean }) {
  const band = r - 5;
  const ticks = [-60, -30, 0, 30, 60]
    .map((a) => {
      const [x0, y0] = polar(cx, cy, r - 1, a);
      const [x1, y1] = polar(cx, cy, r - (a === 0 ? 12 : 9), a);
      return `M${x0} ${y0} L${x1} ${y1}`;
    })
    .join(' ');
  const [lx, ly] = polar(cx, cy, r - 17, -60);
  const [rx, ry] = polar(cx, cy, r - 17, 60);
  const needle = r - 8;
  return (
    <g>
      <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill={PAPER} stroke={INK} strokeWidth={1.3} />
      <path d={arcPath(cx, cy, band, -60, SALE_A)} stroke="#9dbad6" strokeWidth={6} fill="none" />
      <path d={arcPath(cx, cy, band, SALE_A, SPIKE_A)} stroke="#e3d8bd" strokeWidth={6} fill="none" />
      <path d={arcPath(cx, cy, band, SPIKE_A, 60)} stroke="#e39a86" strokeWidth={6} fill="none" />
      <path d={ticks} stroke={INK} strokeWidth={1} />
      {labels && (
        <>
          <text x={lx} y={ly + 3} fontSize={9.5} textAnchor="middle" className="port-dial-lbl">
            ×½
          </text>
          <text x={rx} y={ry + 3} fontSize={9.5} textAnchor="middle" className="port-dial-lbl">
            ×2
          </text>
        </>
      )}
      {/* Aiguille dessinée autour de l'origine : le frémissement (CSS, ±1°) tourne autour du pivot. */}
      <g transform={`translate(${cx} ${cy})`}>
        <g className={wobble ? 'port-a-wobble' : undefined}>
          <g transform={`rotate(${angle})`}>
            <path d={`M-1.6 0 L0 ${-needle} L1.6 0 Z`} fill={INK} />
            <circle cx={0} cy={-needle + 3} r={2} fill={tone} stroke={INK} strokeWidth={0.5} />
          </g>
        </g>
      </g>
      <circle cx={cx} cy={cy} r={3.6} fill={INK} />
      <rect x={cx - r - 3} y={cy} width={2 * r + 6} height={4} fill={INK} />
    </g>
  );
}

/** Une icône de stock (pieds à y = 0) : baril, pile, sac ou caisse selon la matière. */
function StockIcon({ id }: { id: CommodityId }) {
  switch (id) {
    case 'oil':
      return (
        <g>
          <rect x={0} y={-12} width={9} height={12} rx={1.5} fill={COMMODITY_ACCENT.oil} stroke={INK} strokeWidth={0.8} />
          <path d="M0 -8 h9 M0 -4 h9" stroke={INK} strokeWidth={0.6} />
        </g>
      );
    case 'lithium':
      return (
        <g>
          <rect x={2.5} y={-13} width={4} height={2} fill={INK} />
          <rect x={0} y={-11.5} width={9} height={11.5} rx={1} fill="#b8c9d8" stroke={INK} strokeWidth={0.8} />
          <path d="M5.2 -9.5 l-2.4 3.6 h2.8 l-1.8 3.4" stroke={COMMODITY_ACCENT.lithium} strokeWidth={0.9} fill="none" />
        </g>
      );
    case 'sugar':
      return (
        <g>
          <path d="M1 0 Q-0.5 -7 1.5 -10 L2.5 -12 h4 L7.5 -10 Q9.5 -7 8 0 Z" fill={PAPER} stroke={INK} strokeWidth={0.8} />
          <path d="M2.2 -10.3 h4.6" stroke={COMMODITY_ACCENT.sugar} strokeWidth={1.2} />
        </g>
      );
    default:
      return <Crate x={-0.5} y={-10} fill="#c9a86a" />;
  }
}

/** Petit chariot élévateur qui fait la navette devant mon stock. */
function Forklift({ x, y, animate }: { x: number; y: number; animate: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={animate ? 'port-a-shuttle' : undefined}>
        <rect x={2} y={-9} width={10} height={6} fill={LIT} stroke={INK} strokeWidth={0.8} />
        <path d="M4 -9 V-14 H10 V-9" fill="none" stroke={INK} strokeWidth={0.8} />
        <path d="M0 -16 V-2 M0 -3 h-6" stroke={INK} strokeWidth={1.1} fill="none" />
        <circle cx={4} cy={-2} r={2} fill={INK} />
        <circle cx={10} cy={-2} r={2} fill={INK} />
      </g>
    </g>
  );
}

/** Roue dentée : une de mes usines consomme la matière. */
function Gear({ x, y }: { x: number; y: number }) {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const [x0, y0] = polar(x, y, 4.5, i * 45);
    const [x1, y1] = polar(x, y, 7, i * 45);
    return `M${x0} ${y0} L${x1} ${y1}`;
  }).join(' ');
  return (
    <g>
      <path d={teeth} stroke={INK} strokeWidth={2.6} />
      <circle cx={x} cy={y} r={5} fill={LIT} stroke={INK} strokeWidth={1} />
      <circle cx={x} cy={y} r={1.8} fill={PAPER} stroke={INK} strokeWidth={0.6} />
    </g>
  );
}

/** Affichette du journal punaisée au mur (une par article, en éventail jusqu'à trois). */
function Notice({ x, y, count }: { x: number; y: number; count: number }) {
  const n = Math.min(3, count);
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`rotate(${6 - i * 7} ${x} ${y})`}>
          <rect x={x - 8 - i * 3} y={y - 2 + i * 2} width={15} height={18} fill="#fffdf6" stroke={INK} strokeWidth={0.7} />
          {i === n - 1 && (
            <>
              <text x={x - 0.5 - i * 3} y={y + 7 + i * 2} fontSize={8} textAnchor="middle" dominantBaseline="central">
                📰
              </text>
              <path d={`M${x - 5 - i * 3} ${y + 13 + i * 2} h9`} stroke={DARK} strokeWidth={0.6} />
            </>
          )}
        </g>
      ))}
      <circle cx={x} cy={y} r={1.6} fill={RED} stroke={INK} strokeWidth={0.4} />
    </g>
  );
}

/** Largeur d'un tampon (lettres espacées de 0,08 em, double cadre). */
function stampW(text: string, size: number): number {
  return textW(text, size, true) + [...text].length * 0.08 * size + 10;
}

/** Tampon SOLDES / FLAMBÉE, légèrement de travers sur le mur. */
function Stamp({ x, y, text, color, size }: { x: number; y: number; text: string; color: string; size: number }) {
  const w = stampW(text, size);
  const h = size + 8;
  return (
    <g transform={`rotate(-9 ${x} ${y})`} className="port-stamp">
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2} fill="#fffaf0" fillOpacity={0.82} stroke={color} strokeWidth={1.6} />
      <rect x={x - w / 2 + 2} y={y - h / 2 + 2} width={w - 4} height={h - 4} rx={1} fill="none" stroke={color} strokeWidth={0.6} />
      <text x={x} y={y + 0.5} fontSize={size} textAnchor="middle" dominantBaseline="central" fill={color} className="port-stamp-text">
        {text}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Un entrepôt (une colonne)
// ---------------------------------------------------------------------------

const TONE_FILL = { up: UP, down: RED, flat: MUTED } as const;

const Warehouse = memo(function Warehouse({
  plan,
  geo,
  x0,
  row,
  animate,
  onOpen,
}: {
  plan: WhPlan;
  geo: Geo;
  x0: number;
  row: RowPlan;
  animate: boolean;
  onOpen: (target: CityTarget) => void;
}) {
  const { G, H } = row;
  const { w } = plan;
  const bx = x0 + geo.padX;
  const frame: Frame = { x: bx, w: geo.bw, top: geo.top, G };
  const mine = w.usedByMe || (w.myLots ?? 0) > 0;
  const tone = w.tag === 'sale' ? BLUE : w.tag === 'spike' ? RED : INK;
  const cartW = clamp(geo.bw * 0.2, 16, 26);
  const built =
    plan.id === 'oil'
      ? oilTank(frame)
      : plan.id === 'lithium'
        ? mineShaft(
            frame,
            <g transform={`translate(${bx + cartW / 2 + 3} ${G})`}>
              <g className={animate && w.usedByMe ? 'port-a-cart' : undefined}>
                <Cart w={cartW} />
              </g>
            </g>,
          )
        : plan.id === 'sugar'
          ? silo(frame)
          : depot(frame);
  const wall = built.wall;
  const muralH = clamp(Math.min(wall.h * 0.52, wall.h - 22), 18, 38);
  // Tampon : toujours sur le bâtiment ; sous la courbe s'il y a la place (elle reste lisible), sinon en travers.
  const stampSize = geo.phone ? 9.5 : 11;
  const stampHalf = plan.stamp ? stampW(plan.stamp, stampSize) / 2 + 2 : 0;
  const stampX = clamp(wall.x + wall.w / 2, bx + stampHalf, bx + geo.bw - stampHalf);
  const stampH = stampSize + 8;
  const stampY = wall.h - muralH >= stampH + 6 ? wall.y + muralH + stampH / 2 + 4 : wall.y + muralH / 2;

  // Colonne du cadran : cadran sur son mât, plaque des prix accrochée dessous.
  const dcx = bx + geo.bw + geo.gap + geo.dcw / 2;
  const plaqueTop = geo.cy + 9;
  const plaqueX = dcx - geo.dcw / 2 + 2;
  const plaqueW = geo.dcw - 4;
  const lineH = geo.small + 3;
  let ty = plaqueTop + 5 + plan.priceSize;

  // Quai : mes icônes de stock devant l'entrepôt, puis le chariot (en direct chez moi).
  const iconScale = geo.phone ? 1 : 1.3;
  const pitch = (geo.phone ? 9.5 : 10.5) * iconScale;
  const feet = G + geo.quay - 5;
  const stackEnd = bx + 4 + plan.icons * pitch;
  const forklift = plan.icons > 0 && stackEnd + 22 < bx + geo.bw;

  return (
    <g className={cx('port-wh', !plan.match && 'city-dim')} {...pressable(plan.aria, () => onOpen({ kind: 'commodity', id: plan.id }))}>
      <title>{plan.tip}</title>
      <rect x={x0} y={0} width={geo.cw} height={H} fill="transparent" />

      {/* Nom de la matière. */}
      <text x={bx} y={geo.title + 3} fontSize={plan.nameSize} className="port-name">
        {plan.name}
      </text>

      {/* Bâtiment, courbe peinte, tampon, affichette, roue dentée. */}
      {built.body}
      <Mural x={wall.x} y={wall.y} w={wall.w} h={muralH} values={plan.curve} base={plan.base} tone={tone} />
      {plan.stamp && <Stamp x={stampX} y={stampY} text={plan.stamp} color={tone} size={stampSize} />}
      {w.news.length > 0 && <Notice x={built.pin.x} y={built.pin.y} count={w.news.length} />}
      {w.usedByMe && <Gear x={built.gear.x} y={built.gear.y} />}

      {/* Cadran sur son mât et plaque des prix. */}
      <rect x={dcx - 2} y={geo.cy} width={4} height={G - geo.cy} fill={DARK} />
      <Dial cx={dcx} cy={geo.cy} r={geo.r} angle={w.angle} tone={tone} labels={geo.r >= 36} wobble={animate} />
      <rect x={plaqueX} y={plaqueTop} width={plaqueW} height={plan.plaqueH} rx={3} fill="#fffaf0" stroke={INK} strokeWidth={1.1} />
      <text x={dcx} y={ty} fontSize={plan.priceSize} textAnchor="middle" className="port-price">
        {plan.price}
      </text>
      {plan.vsLines.map((line, i) => {
        ty += lineH;
        return (
          <text key={i} x={dcx} y={ty - 1} fontSize={plan.vsSize} textAnchor="middle" fill={w.tag ? tone : INK}>
            {line}
          </text>
        );
      })}
      <text x={dcx} y={ty + lineH - 1} fontSize={geo.small} textAnchor="middle" fill={TONE_FILL[plan.changeTone]} className="port-strong">
        {plan.change}
      </text>

      {/* Mon stock sur le quai (une icône = la même quantité partout), palette nue si je n'ai rien. */}
      {Array.from({ length: plan.icons }, (_, i) => (
        <g key={i} transform={`translate(${bx + 4 + i * pitch} ${feet}) scale(${iconScale})`}>
          <StockIcon id={plan.id} />
        </g>
      ))}
      {plan.icons > 0 && <rect x={bx + 2} y={feet} width={plan.icons * pitch + 2} height={2.5} fill="#a8875a" stroke={INK} strokeWidth={0.5} />}
      {plan.emptyPallet && <rect x={bx + 4} y={feet - 2.5} width={22} height={2.5} fill="#a8875a" stroke={INK} strokeWidth={0.5} />}
      {forklift && <Forklift x={stackEnd + 8} y={feet} animate={animate && mine} />}

      {/* Lettrage peint sur le mur du quai. */}
      {plan.wallLines.map((line, i) => (
        <text key={i} x={bx} y={G + geo.quay + 5 + (i + 1) * (geo.small + 4) - 3} fontSize={geo.small} className="port-wall-text">
          {line}
        </text>
      ))}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Le quai d'une rangée : surface, mur de pierre, eau
// ---------------------------------------------------------------------------

const Quay = memo(function Quay({ geo, row, animate, seed }: { geo: Geo; row: RowPlan; animate: boolean; seed: number }) {
  const { W, quay, water } = geo;
  const { G, wallH } = row;
  const wallTop = G + quay;
  const waterTop = wallTop + wallH;
  // Joints des pierres : décalés d'une assise à l'autre.
  const joints: string[] = [];
  for (let y = wallTop + 8; y < waterTop - 1; y += 9) joints.push(`M0 ${y} H${W}`);
  for (let y = wallTop, k = 0; y < waterTop - 1; y += 9, k++) {
    for (let x = (k % 2) * 13 + 6; x < W; x += 26) joints.push(`M${x} ${y} V${Math.min(waterTop, y + 9)}`);
  }
  // Vagues : festons réguliers, plus larges que la rangée pour pouvoir glisser d'une période.
  const period = 16;
  const wave = (y: number) => {
    let d = `M${-period} ${y}`;
    for (let x = -period; x < W + period; x += period) d += ` q${period / 4} -2.5 ${period / 2} 0 t${period / 2} 0`;
    return d;
  };
  const buoyX = ((seed * 0.37 + 0.45) % 1) * (W - 40) + 20;
  const bollards = Array.from({ length: geo.cols + 1 }, (_, i) => clamp(i * geo.cw, 5, W - 5));
  return (
    <g aria-hidden>
      <rect x={0} y={G} width={W} height={quay} fill={PAPER2} />
      <line x1={0} y1={G} x2={W} y2={G} stroke={INK} strokeWidth={1.2} />
      <rect x={0} y={wallTop} width={W} height={wallH} fill={STONE} />
      <path d={joints.join(' ')} stroke={JOINT} strokeWidth={0.7} />
      <line x1={0} y1={wallTop} x2={W} y2={wallTop} stroke={INK} strokeWidth={1.1} />
      <rect x={0} y={waterTop} width={W} height={water} fill={WATER} />
      <line x1={0} y1={waterTop} x2={W} y2={waterTop} stroke={INK} strokeWidth={0.8} />
      {/* Deux lignes de vagues qui glissent d'une période (16 px, cf. port-wave-l / port-wave-r) en sens contraires. */}
      <path d={wave(waterTop + water * 0.4)} stroke={WAVE} strokeWidth={0.9} fill="none" className={animate ? 'port-a-wave-l' : undefined} />
      <path d={wave(waterTop + water * 0.78)} stroke={WAVE} strokeWidth={0.7} fill="none" opacity={0.7} className={animate ? 'port-a-wave-r' : undefined} />
      {/* Bouée qui danse sur l'eau. */}
      <g transform={`translate(${buoyX} ${waterTop + water * 0.55})`}>
        <g className={animate ? 'port-a-bob' : undefined}>
          <path d="M-4 0 a4 4 0 0 1 8 0 z" fill={RED} stroke={INK} strokeWidth={0.7} />
          <path d="M-1.4 -3.6 h2.8" stroke={PAPER} strokeWidth={1.4} />
          <line x1={0} y1={-3.8} x2={0} y2={-8} stroke={INK} strokeWidth={0.7} />
        </g>
      </g>
      {/* Bittes d'amarrage entre les entrepôts. */}
      {bollards.map((x, i) => (
        <g key={i}>
          <rect x={x - 2.5} y={G + quay - 11} width={5} height={9} rx={1} fill={DARK} stroke={INK} strokeWidth={0.6} />
          <rect x={x - 4} y={G + quay - 12} width={8} height={2.5} rx={1} fill={INK} />
        </g>
      ))}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Tableaux : banque centrale, fisc, moral des marchés
// ---------------------------------------------------------------------------

function BankIcon() {
  return (
    <svg className="port-board-icon" viewBox="0 0 44 40" width={44} height={40} aria-hidden>
      <path d="M3 13 L22 3 L41 13 Z" fill={PAPER2} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <rect x={4} y={13} width={36} height={3} fill={INK} />
      {[8, 16, 24, 32].map((x) => (
        <rect key={x} x={x} y={17} width={4} height={15} fill={PAPER} stroke={INK} strokeWidth={0.9} />
      ))}
      <rect x={2} y={32} width={40} height={4} fill={INK} />
      <text x={22} y={10.5} fontSize={7} textAnchor="middle" fontWeight={700} fill={INK}>
        %
      </text>
    </svg>
  );
}

/** Le gâteau des bénéfices : la part du fisc est détachée, en rouge. */
function TaxIcon({ rate }: { rate: number }) {
  const r = 16;
  const c = 20;
  const a = clamp(rate, 0.01, 0.99) * 360;
  const [x1, y1] = polar(c, c, r, a);
  const large = a > 180 ? 1 : 0;
  const [dx, dy] = polar(0, 0, 3, a / 2);
  return (
    <svg className="port-board-icon" viewBox="0 0 44 40" width={44} height={40} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="#f1dcae" stroke={INK} strokeWidth={1.1} />
      <path d={`M${c} ${c} L${c} ${c - r} A${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`} transform={`translate(${dx} ${dy})`} fill={RED} stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
    </svg>
  );
}

type MoodLevel = 'storm' | 'rain' | 'mixed' | 'sun' | 'euphoric';

/** Moral des marchés (borné à [0,2 ; 5] par le moteur) : « euphorique » seulement à partir de ×1,2, pas à +3 %. */
function moodLevel(x: number): MoodLevel {
  return x < 0.9 ? 'storm' : x < 0.97 ? 'rain' : x < 1.03 ? 'mixed' : x < 1.2 ? 'sun' : 'euphoric';
}

/** Météo des marchés : orage, pluie, éclaircies, soleil, ou soleil et bulles (l'euphorie). */
function MoodIcon({ level }: { level: MoodLevel }) {
  const sun = level === 'sun' || level === 'mixed' || level === 'euphoric';
  const cloud = level !== 'sun' && level !== 'euphoric';
  const rays = Array.from({ length: 8 }, (_, i) => {
    const [x0, y0] = polar(15, 15, 10, i * 45);
    const [x1, y1] = polar(15, 15, 14, i * 45);
    return `M${x0} ${y0} L${x1} ${y1}`;
  }).join(' ');
  return (
    <svg className="port-board-icon" viewBox="0 0 44 40" width={44} height={40} aria-hidden>
      {sun && (
        <g>
          <path d={rays} stroke="#8a5a00" strokeWidth={1.3} />
          <circle cx={15} cy={15} r={7.5} fill={LIT} stroke={INK} strokeWidth={1} />
        </g>
      )}
      {cloud && (
        <path
          d="M12 30 a6 6 0 0 1 2 -11.6 a8 8 0 0 1 15 -2 a6.5 6.5 0 0 1 7 7 a4.5 4.5 0 0 1 -1 9 Z"
          fill={level === 'mixed' ? PAPER : level === 'rain' ? '#d6d2c8' : '#9a927f'}
          stroke={INK}
          strokeWidth={1}
          strokeLinejoin="round"
        />
      )}
      {level === 'rain' && <path d="M17 34 l-2 4 M23 34 l-2 4 M29 34 l-2 4" stroke={BLUE} strokeWidth={1.1} />}
      {level === 'storm' && <path d="M25 30 l-4 5 h4 l-3 5" stroke="#8a5a00" strokeWidth={1.6} fill="none" strokeLinejoin="round" />}
      {/* Euphorie : des bulles montent (celles qui finissent par éclater). */}
      {level === 'euphoric' && (
        <g stroke={INK} strokeWidth={0.9}>
          {[
            [33, 29, 6],
            [38, 16, 3.6],
            [26, 35, 2.8],
          ].map(([bx, by, br]) => (
            <g key={`${bx}-${by}`}>
              <circle cx={bx} cy={by} r={br} fill="#e4eef2" fillOpacity={0.85} />
              <path d={arcPath(bx, by, br * 0.6, -70, -20)} stroke="#fff" strokeWidth={1.1} fill="none" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

function Boards({ view }: { view: PlayerView }) {
  const t = useT();
  const fmt = useFmt();
  const p = t.city.port;
  const rate = view.interestRate;
  // Jauge du taux : de 0 au double du taux normal, repère au taux normal.
  const scale = 2 * BASE_INTEREST_RATE;
  const x = view.marketSentiment;
  const level = moodLevel(x);
  return (
    <div className="port-boards">
      <div className="port-board" title={p.bank(fmt.pct(rate))}>
        <BankIcon />
        <div className="port-board-text">
          <div className="port-board-title">{p.bankTitle}</div>
          <div className="port-board-value">
            {fmt.pct(rate)} <span className="port-board-unit">{p.perQuarter}</span>
          </div>
          <div className="port-meter" aria-hidden>
            <span className="port-meter-fill" style={{ width: `${clamp(rate / scale, 0, 1) * 100}%` }} />
            <span className="port-meter-mark" style={{ left: '50%' }} />
          </div>
          <div className="port-board-sub">{p.bankNormal(fmt.pct(BASE_INTEREST_RATE))}</div>
        </div>
      </div>
      <div className="port-board" title={p.tax(fmt.pct(view.taxRate, 0))}>
        <TaxIcon rate={view.taxRate} />
        <div className="port-board-text">
          <div className="port-board-title">{p.taxTitle}</div>
          <div className="port-board-value">{fmt.pct(view.taxRate, 0)}</div>
          <div className="port-board-sub">{p.taxSub}</div>
        </div>
      </div>
      <div className="port-board" title={`${p.mood(fmt.fixed(x, 2))} · ${p.moodTip}`}>
        <MoodIcon level={level} />
        <div className="port-board-text">
          <div className="port-board-title">{p.moodTitle}</div>
          <div className="port-board-value">
            ×{fmt.fixed(x, 2)} <span className="port-board-unit">{p.moodLevels[level]}</span>
          </div>
          <div className="port-board-sub">{p.moodTip}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Impasse des Rumeurs
// ---------------------------------------------------------------------------

const RELIABILITY: Record<RumorReliability, number> = { faible: 1, moyenne: 2, élevée: 3 };

/** L'indic : imperméable, chapeau, journal troué devant le nez, sous le réverbère. */
function Informant({ animate, puffs, label }: { animate: boolean; puffs: number; label: string }) {
  const bricks: string[] = [];
  for (let y = 10; y < 96; y += 9) bricks.push(`M0 ${y} H86`);
  for (let y = 1, k = 0; y < 96; y += 9, k++) for (let x = (k % 2) * 8 + 4; x < 86; x += 16) bricks.push(`M${x} ${y} V${y + 9}`);
  return (
    <svg className="port-indic" viewBox="0 0 86 100" width={86} height={100} role="img" aria-label={label}>
      <rect x={0} y={0} width={86} height={96} fill="#e6d9bd" />
      <path d={bricks.join(' ')} stroke="#cdbb97" strokeWidth={0.7} />
      <rect x={0} y={94} width={86} height={6} fill={PAPER2} stroke={INK} strokeWidth={0.8} />
      {/* Réverbère et son halo. */}
      <path d="M70 94 V14 q0 -6 -7 -6 h-5" stroke={INK} strokeWidth={1.6} fill="none" />
      <path d="M52 8 h12 l-2 6 h-8 z" fill={INK} />
      <path d="M53 14 L40 60 H76 L63 14 Z" fill={LIT} opacity={0.22} />
      <circle cx={58} cy={15} r={2.2} fill={LIT} stroke={INK} strokeWidth={0.5} />
      {/* L'imperméable. */}
      <path d="M22 94 L25 52 Q34 44 43 52 L46 94 Z" fill="#8a7a5c" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <path d="M34 54 V94 M28 62 l6 6 M40 62 l-6 6" stroke={INK} strokeWidth={0.7} fill="none" />
      <path d="M27 94 v-3 h5 v3 M36 94 v-3 h5 v3" fill={INK} stroke={INK} strokeWidth={0.8} />
      {/* Le journal troué, tenu à deux mains. */}
      <rect x={20} y={30} width={28} height={22} fill="#fffdf6" stroke={INK} strokeWidth={0.9} />
      <path d="M23 34 h22 M23 45 h9 M36 45 h9 M23 48 h22" stroke={DARK} strokeWidth={0.6} />
      <circle cx={30} cy={39} r={2.1} fill={INK} />
      <circle cx={38} cy={39} r={2.1} fill={INK} />
      <circle cx={30.6} cy={38.6} r={0.6} fill={PAPER} />
      <circle cx={38.6} cy={38.6} r={0.6} fill={PAPER} />
      {/* Chapeau mou. */}
      <path d="M22 30 h24 M26 30 q0 -10 8 -10 q8 0 8 10" fill="#5a4a33" stroke={INK} strokeWidth={1.1} />
      <path d="M26 27 h16" stroke={INK} strokeWidth={1.4} />
      {/* Cigarette et fumée. */}
      <path d="M48 44 h7" stroke={PAPER} strokeWidth={1.6} />
      <circle cx={55.5} cy={44} r={1} fill={RED} />
      {/* En mouvement : bouffées qui montent en CSS (transform, opacité), décalées régulièrement. */}
      {animate
        ? Array.from({ length: puffs }, (_, i) => (
            <circle
              key={i}
              cx={56}
              cy={42}
              r={1.4}
              fill="#d8d2c4"
              stroke="#9c9383"
              strokeWidth={0.4}
              className="port-a-puff"
              style={{ animationDelay: `${(-i * 3.2) / puffs}s` }}
            />
          ))
        : [0, 1].map((i) => <circle key={i} cx={57 + i * 3} cy={38 - i * 7} r={1.8 + i * 1.4} fill="#d8d2c4" stroke="#9c9383" strokeWidth={0.4} opacity={0.8} />)}
    </svg>
  );
}

function Alley({ news, animate, phone }: { news: CityNews; animate: boolean; phone: boolean }) {
  const t = useT();
  const fmt = useFmt();
  const p = t.city.port;
  return (
    <section className="port-alley" aria-label={p.rumors}>
      {/* Téléphone : une seule bouffée de fumée (moins d'éléments animés). */}
      <Informant animate={animate} puffs={phone ? 1 : 2} label={p.informant} />
      <div className="port-alley-body">
        <h4 className="port-street">{p.rumors}</h4>
        <p className="port-alley-hint">{p.rumorsHint}</p>
        {news.rumors.length === 0 ? (
          <p className="port-norumor">{p.noRumors}</p>
        ) : (
          <ul className="port-rumors">
            {news.rumors.map((r, i) => {
              const n = RELIABILITY[r.reliability] ?? 1;
              const label = p.reliability(t.reliability[r.reliability] ?? r.reliability);
              return (
                <li key={i} className="port-rumor">
                  {/* Texte du journal : langue du salon (l'interface peut être dans l'autre), pour les lecteurs d'écran. */}
                  <span className="port-rumor-text" lang={fmt.lang}>
                    {r.text}
                  </span>
                  <span className="port-rel">
                    <span className={cx('port-dots', `r${n}`)} aria-hidden>
                      {[1, 2, 3].map((k) => (
                        <span key={k} className={cx('port-dot', k <= n && 'on')} />
                      ))}
                    </span>
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Le quartier
// ---------------------------------------------------------------------------

export function Port({ view, filter, still, onOpen, news }: DistrictProps & { news: CityNews }) {
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const [widthRef, width] = useElementWidth<HTMLDivElement>(900);
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      widthRef(el);
      viewRef(el);
    },
    [widthRef, viewRef],
  );
  const geo = useMemo(() => geometry(width), [width]);
  const names = useMemo(() => Object.fromEntries(Object.entries(content.commodities).map(([id, c]) => [id, c.name])), [content]);
  const plan = useMemo(() => planPort(view, news, filter, geo, fmt, t, names), [view, news, filter, geo, fmt, t, names]);
  // Hors de l'écran (ou scène figée), plus rien ne bouge : les chiffres restent.
  const animate = !still && inView;
  return (
    <div className={cx('port', geo.phone && 'port-phone')} ref={ref}>
      <div className="port-quays" role="group" aria-label={t.city.port.quaysAria}>
        {plan.rows.map((row, ri) => (
          <svg key={ri} className="port-row" width={geo.W} height={row.H} viewBox={`0 0 ${geo.W} ${row.H}`}>
            <Quay geo={geo} row={row} animate={animate} seed={ri} />
            {row.items.map((it, i) => (
              <Warehouse key={it.id} plan={it} geo={geo} x0={i * geo.cw} row={row} animate={animate} onOpen={onOpen} />
            ))}
          </svg>
        ))}
      </div>
      <div className={cx('port-lower', !geo.phone && geo.W < 900 && 'port-mid')}>
        <Boards view={view} />
        <Alley news={news} animate={animate} phone={geo.phone} />
      </div>
    </div>
  );
}
