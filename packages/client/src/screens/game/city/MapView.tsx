/**
 * La carte (§5.8) : le pays entier en SVG, dessiné en vrais pixels (projection de mapScale).
 *   - Calques de flux (MapFlowControls) : « Aucun » par défaut, la carte est alors exactement celle d'avant ; un
 *     calque Production / Approvisionnement / Ventes suit une de mes usines (son propre choix, distinct de la
 *     référence de la lentille) et remplace mes routes d'approvisionnement tant qu'il est allumé.
 *   - Barre d'outils : entreprise et trésorerie, produit suivi et comparaison explicite, lentille
 *     « Qui possède quoi / Ce que vaut chaque zone », jetons « Tout le salon / Mes affaires » en possession,
 *     bouton Figer/Animer (état
 *     partagé tenu par CityTab, STILL_KEY).
 *   - Le dessin, de l'arrière vers l'avant (la maquette validée) : mer et vagues, terre et relief, routes,
 *     noms des repères, halos de la lentille valeur, mes routes d'approvisionnement (sans calque), gisements,
 *     villes et zones, usines en grappe, badges d'écart, calque de flux ; boussole et échelle sur ordinateur.
 *   - Fiche contextuelle repliable de droite (ordinateur, collante) : identité, chiffres et décisions
 *     de l'élément touché, puis explications repliées (sur téléphone : une modale en bas d'écran). Toute décision
 *     géographique se prend dans cette fiche : lancer dans la zone, y déménager une usine, miser sur un
 *     gisement (voir MapSheets) — l'`intent` posé par « Mon entreprise » ouvre la bonne fiche au montage.
 *   - Dessous, pleine largeur : le carnet en trois colonnes (Mon réseau / Zones / Gisements, alternative
 *     accessible de la carte), puis le port et la bourse de la capitale (Port.tsx).
 * Règles de confidentialité : aucune lecture directe des données privées ici — `ownProduct`/`isOwn` de
 * ./privacy, puis DÉSTRUCTURATION (vérifié par test/city.test.ts).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CityId, CommodityId, CompanyView, PlayerView, ProductView, SectorId, ZoneId } from '@muchomoney/core';
import { CITIES, COMMODITY_IDS, DEFAULT_ZONE, SECTORS, roadRoute, zoneOf } from '@muchomoney/core';
import { useGame } from '../../../hooks/useGame';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { useElementWidth } from '../../../hooks/useElementWidth';
import { Modal } from '../../../components/Modal';
import { cx } from '../../../util';
import { useContent, useT, useUiLang } from '../../../i18n';
import { Rich } from '../../../i18n/Rich';
import { useFmt } from '../../../fmt';
import type { TabId } from '../../GameScreen';
import type { MapIntent } from '../mapIntent';
import { launchZoneEstimates, bestLaunchZone } from '../launchPickerModel';
import { zoneRows } from '../zoneChoice';
import { moveQuartersLeft } from '../movePickerModel';
import { biddableDepositSlot } from '../sitesPickerModel';
import { commodityNeed } from '../DepositPanel';
import { COMMODITY_ACCENT, PAPER, INK } from '../factories/parts';
import { PHONE_W, cityNews, type CityFilter, type CityTarget } from './model';
import { pressable, useInView } from './a11y';
import { AUTOPILOT, BaseMap, DOWN, INK2, LAND, MAP_VIEW, MUTED, UP, midpoint, poly } from './BaseMap';
import {
  clusterOffsets,
  defaultValueReference,
  dimmedBy,
  mapCities,
  mapDeposits,
  mapFactories,
  mapScale,
  mapZones,
  mySupplyInputs,
  valueLensModel,
  valueReferenceOptions,
  type CityNode,
  type DepositNode,
  type FactoryMark,
  type MapFilter,
  type MapLens,
  type MapScale,
  type SupplyRoute,
  type ValueLens,
  type ValueReference,
  type ZoneNode,
  type ZoneValue,
} from './mapModel';
import { CommodityGlyph, COMMODITY_GLYPH, DepositSheet, ZoneSheet, kmLabel, richnessTier, zoneLabel } from './MapSheets';
import { deliveredLotPrice, extractionCostNow } from '../../../transport';
import { FreightDetails } from '../../../components/FreightDetails';
import { currentProductFreight } from './freight';
import { isOwn, ownProduct } from './privacy';
import { Port } from './Port';
import { buildMapFlowModel, type FlowMode } from './mapFlows';
import { MapProductControls } from './MapProductControls';
import { MapWorkspace, focusMapSheetTarget } from './MapWorkspace';
import { mapWorkspaceMessages } from '../../../i18n/mapWorkspace';
import { MapFlowControls } from './MapFlowControls';
import { MapFlowLayer, type FlowAnchor, type LabelBox } from './MapFlowLayer';
import { MapFlowDetail } from './MapFlowDetail';
import { ReportTable } from '../ReportTable';
import { quarterCloseMessages } from '../../../i18n/quarterClose';

/** Retouches des noms de villes (px, après projection) : Petit-Rabais descend un peu, loin de la baie. */
const CITY_LABEL_NUDGE: Partial<Record<CityId, { dx?: number; dy?: number }>> = {
  north: { dy: 10 },
};
/** Seuil de teinte des écarts : en dessous (fraction), la zone est « comme la référence ». */
const GAP_EPS = 0.0005;
/** Filtre fixe du port sous la carte : tout le salon. */
const ALL_FILTER: CityFilter = { kind: 'all' };

// ---------------------------------------------------------------------------
// Mes routes d'approvisionnement (pointillés à ma couleur, pastille de prix)
// ---------------------------------------------------------------------------

interface RoutePill {
  route: SupplyRoute;
  text: string;
}

const RoutesLayer = memo(function RoutesLayer({
  proj,
  small,
  animate,
  pills,
  color,
}: {
  proj: MapScale;
  small: boolean;
  animate: boolean;
  pills: RoutePill[];
  color: string;
}) {
  const u = (km: number) => km * proj.scale;
  return (
    <g>
      {pills.map(({ route, text }, i) => {
        const pts = poly(proj, route.points);
        let pill = null;
        if (!small) {
          const mp = midpoint(route.points);
          const x = proj.px(mp.x);
          const y = proj.py(mp.y);
          // Deux routes sur le même corridor : les pastilles se décalent d'un côté puis de l'autre.
          const off = u(14) * (i % 2 === 0 ? 1 : -1);
          const w = text.length * 5.6 + 10;
          pill = (
            <g aria-hidden>
              <rect x={x + off - w / 2} y={y - 8} width={w} height={16} rx={8} fill={PAPER} stroke={color} strokeWidth={1.2} />
              <text x={x + off} y={y + 3.6} fontSize={9.5} textAnchor="middle" fill={INK} fontWeight={600}>
                {text}
              </text>
            </g>
          );
        }
        return (
          <g key={`${route.productId}-${route.commodityId}`}>
            <polyline
              points={pts}
              fill="none"
              stroke={color}
              strokeOpacity={0.85}
              strokeWidth={small ? 3 : 4.2}
              strokeDasharray={`${u(8)} ${u(4)}`}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={animate ? 'map-a-route' : undefined}
            />
            {pill}
          </g>
        );
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Lentille « valeur » : halos sous les villes, badges d'écart par-dessus tout
// ---------------------------------------------------------------------------

interface Halo extends ZoneValue {
  text: string;
}

function haloColor(gap: number): string {
  return gap < -GAP_EPS ? UP : gap > GAP_EPS ? DOWN : MUTED;
}

const ValueHalos = memo(function ValueHalos({ proj, small, zones, halos }: { proj: MapScale; small: boolean; zones: ZoneNode[]; halos: Halo[] }) {
  const u = (km: number) => km * proj.scale;
  return (
    <g>
      {halos.map((h) => {
        const z = zones.find((q) => q.id === h.zoneId);
        if (!z) return null;
        const col = haloColor(h.gap);
        return (
          <circle
            key={h.zoneId}
            cx={proj.px(z.x)}
            cy={proj.py(z.y)}
            r={u(small ? 26 : 44)}
            fill={col}
            fillOpacity={Math.min(0.42, 0.1 + Math.abs(h.gap * 100) * 0.11)}
            stroke={col}
            strokeWidth={u(1)}
            strokeDasharray="3 2"
          />
        );
      })}
    </g>
  );
});

const ValueBadges = memo(function ValueBadges({ proj, small, zones, halos }: { proj: MapScale; small: boolean; zones: ZoneNode[]; halos: Halo[] }) {
  return (
    <g>
      {halos.map((h) => {
        const z = zones.find((q) => q.id === h.zoneId);
        if (!z) return null;
        const col = h.isReference ? INK : haloColor(h.gap);
        const w = h.text.length * 6.2 + 10;
        const x = proj.px(z.x) + (small ? 10 : 16);
        const y = proj.py(z.y) - (small ? 26 : 36);
        return (
          <g key={h.zoneId} aria-hidden>
            <rect x={x} y={y} width={w} height={15} rx={3} fill={col} />
            <text x={x + w / 2} y={y + 11} fontSize={small ? 9 : 10} fontWeight={700} fill={PAPER} textAnchor="middle">
              {h.text}
            </text>
          </g>
        );
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Gisements : anneau de la matière, pictogramme, crans de richesse, exploitant
// ---------------------------------------------------------------------------

export interface DepositMark {
  d: DepositNode;
  aria: string;
  tip: string;
}

const DepositsLayer = memo(function DepositsLayer({
  proj,
  small,
  marks,
  filter,
  selectedSlotId,
  onOpen,
}: {
  proj: MapScale;
  small: boolean;
  marks: DepositMark[];
  filter: MapFilter;
  selectedSlotId: string | null;
  onOpen: (slotId: string) => void;
}) {
  const u = (km: number) => km * proj.scale;
  return (
    <g>
      {marks.map(({ d, aria, tip }) => {
        const x = proj.px(d.x);
        const y = proj.py(d.y);
        const r = small ? 9 : 12;
        const ring = COMMODITY_ACCENT[d.commodityId];
        const k = (2 * r * 0.72) / 16;
        const notches = d.capacity >= 50 ? 3 : d.capacity >= 40 ? 2 : 1;
        const sel = selectedSlotId === d.slotId;
        return (
          <g key={d.slotId} data-map-selection={sel || undefined} className={cx(dimmedBy(d.mine, filter) && 'city-dim')} {...pressable(aria, () => onOpen(d.slotId))}>
            <title>{tip}</title>
            <rect x={x - r - 8} y={y - r - 8} width={2 * (r + 8)} height={2 * (r + 8)} fill="transparent" />
            {sel && <circle cx={x} cy={y} r={r + 6} fill="none" stroke={INK} strokeWidth={2} />}
            <circle cx={x} cy={y} r={r} fill={PAPER} stroke={ring} strokeWidth={small ? 2 : 2.6} strokeDasharray={d.operatorId ? undefined : '3.5 2.5'} />
            <g transform={`translate(${x - 8 * k} ${y - 8 * k}) scale(${k})`} fill="none" stroke={ring} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              {COMMODITY_GLYPH[d.commodityId]}
            </g>
            {Array.from({ length: notches }, (_, i) => (
              <rect key={i} x={x - r + i * u(5)} y={y + r + u(2)} width={u(3.5)} height={u(3.5)} fill={ring} />
            ))}
            {d.operatorId && <circle cx={x + r * 0.78} cy={y - r * 0.78} r={small ? 3.5 : 4.5} fill={d.color ?? AUTOPILOT} stroke={PAPER} strokeWidth={1} />}
          </g>
        );
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Villes et zones : disques ∝ √part des clients, carrés en pointillés, médaillons
// ---------------------------------------------------------------------------

/** Glyphes des médaillons de la capitale (ancre = port, colonnes = bourse), cadre 16 × 16. */
const ANCHOR_GLYPH = (
  <>
    <circle cx="8" cy="3.5" r="1.5" />
    <path d="M8 5v9 M4.5 7.5h7 M2.5 10.5c0 2 2.5 3.5 5.5 3.5s5.5-1.5 5.5-3.5" />
  </>
);
const STOCKS_GLYPH = <path d="M2 14h12 M3 12h10 M4 12V7 M7 12V7 M9 12V7 M12 12V7 M2.5 6L8 2.5 13.5 6z" />;

type MapNames = ReturnType<typeof useContent>['mapNames'];

const CitiesLayer = memo(function CitiesLayer({
  proj,
  small,
  cities,
  zones,
  mapNames,
  selectedZoneId,
  shareText,
  cityTip,
  zoneAria,
  onOpenZone,
  onPort,
  onStocks,
  portAria,
  stocksAria,
}: {
  proj: MapScale;
  small: boolean;
  cities: CityNode[];
  zones: ZoneNode[];
  mapNames: MapNames;
  selectedZoneId: ZoneId | null;
  shareText: (share: number) => string;
  cityTip: (name: string, share: string) => string;
  zoneAria: (name: string) => string;
  onOpenZone: (zoneId: ZoneId) => void;
  onPort: () => void;
  onStocks: () => void;
  portAria: string;
  stocksAria: string;
}) {
  const cityR = (share: number) => (small ? 13 : 21) * Math.sqrt(share / 0.4);
  const capitalR = cityR(CITIES.capital.share);
  const rr = small ? 10 : 13;
  const ik = (small ? 13 : 17) / 16;
  const port = { x: proj.px(62), y: proj.py(588) };
  const stocks = { x: proj.px(120), y: proj.py(600) - capitalR - (small ? 12 : 16) };
  return (
    <g>
      {/* Zones industrielles hors des villes : carré en pointillés et nom. */}
      {zones
        .filter((z) => z.cityId === null)
        .map((z) => {
          const r = small ? 12 : 16;
          const x = proj.px(z.x);
          const y = proj.py(z.y);
          const sel = selectedZoneId === z.id;
          const name = zoneLabel(mapNames, z.id);
          return (
            <g key={z.id} data-map-selection={sel || undefined} {...pressable(zoneAria(name), () => onOpenZone(z.id))}>
              <title>{name}</title>
              <rect x={x - r - 8} y={y - r - 16} width={2 * r + 16} height={2 * r + 34} fill="transparent" />
              <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={sel ? '#fff7e0' : 'none'} stroke={INK} strokeWidth={sel ? 2.4 : 1.2} strokeDasharray="3 2.5" />
              <text x={x} y={z.id === 'plain' ? y - r - 4 : y + r + 11} fontSize={small ? 8.5 : 10} textAnchor="middle" fill={INK2} fontWeight={600}>
                {name}
              </text>
            </g>
          );
        })}

      {/* Villes : disque ∝ √part, nom serif gras et part des clients, halo papier sous le texte. */}
      {cities.map((c) => {
        const r = cityR(c.share);
        const x = proj.px(c.x);
        const y = proj.py(c.y);
        const sel = selectedZoneId === c.id;
        const name = mapNames.cities[c.id];
        const share = shareText(c.share);
        const side = c.id === 'east' ? 'l' : 'r';
        const nudge = CITY_LABEL_NUDGE[c.id];
        const tx = (side === 'r' ? x + r + 5 : x - r - 5) + (nudge?.dx ?? 0);
        const ty = y + (nudge?.dy ?? 0);
        const anchor = side === 'r' ? 'start' : 'end';
        return (
          <g key={c.id} data-map-selection={sel || undefined} {...pressable(zoneAria(name), () => onOpenZone(c.id as ZoneId))}>
            <title>{cityTip(name, share)}</title>
            <rect x={side === 'r' ? x - r - 6 : tx - 96} y={y - r - 8} width={r + 6 + 102} height={2 * r + 26} fill="transparent" />
            <circle cx={x} cy={y} r={r} fill={sel ? INK : INK2} stroke={sel ? DOWN : INK} strokeWidth={sel ? 3 : 1} />
            <circle cx={x} cy={y} r={r * 0.62} fill="none" stroke={PAPER} strokeWidth={0.8} strokeDasharray="2 2" />
            <text x={tx} y={ty - 1} fontSize={small ? 9.5 : 12} fontWeight={700} fill={INK} textAnchor={anchor} className="map-serif" paintOrder="stroke" stroke={LAND} strokeWidth={3}>
              {name}
            </text>
            <text x={tx} y={ty + (small ? 10 : 12)} fontSize={small ? 8.5 : 9.5} fill={INK2} textAnchor={anchor} paintOrder="stroke" stroke={LAND} strokeWidth={3}>
              {share}
            </text>
          </g>
        );
      })}

      {/* Médaillons de la capitale : le port (matières) et la bourse des actions. */}
      <g {...pressable(portAria, onPort)}>
        <title>{portAria}</title>
        <rect x={port.x - rr - 3} y={port.y - rr - 3} width={2 * rr + 6} height={2 * rr + 6} fill="transparent" />
        <circle cx={port.x} cy={port.y} r={rr} fill={PAPER} stroke={INK} strokeWidth={1.2} />
        <g transform={`translate(${port.x - 8 * ik} ${port.y - 8 * ik}) scale(${ik})`} fill="none" stroke={INK} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
          {ANCHOR_GLYPH}
        </g>
      </g>
      <g {...pressable(stocksAria, onStocks)}>
        <title>{stocksAria}</title>
        <rect x={stocks.x - rr - 3} y={stocks.y - rr - 3} width={2 * rr + 6} height={2 * rr + 6} fill="transparent" />
        <circle cx={stocks.x} cy={stocks.y} r={rr} fill={PAPER} stroke={INK} strokeWidth={1.2} />
        <g transform={`translate(${stocks.x - 8 * ik} ${stocks.y - 8 * ik}) scale(${ik})`} fill="none" stroke={INK} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
          {STOCKS_GLYPH}
        </g>
      </g>
    </g>
  );
});

// ---------------------------------------------------------------------------
// Usines : dents de scie en grappe sous leur zone, ouvrent la fiche et suivent le produit propre
// ---------------------------------------------------------------------------

/** Une icône d'usine posée sur la carte (px) : coin haut-gauche et côté du carré. */
export interface FactoryIcon {
  mark: FactoryMark;
  x0: number;
  y0: number;
  size: number;
}

/**
 * Où se pose chaque icône d'usine : en grappe sous sa zone (clusterOffsets), dans l'ordre de `factories`. Une seule
 * source pour le dessin des usines et pour les anneaux des calques de flux, qui entourent ainsi la bonne icône.
 */
export function factoryIconLayout(proj: MapScale, small: boolean, factories: FactoryMark[], cities: CityNode[], zones: ZoneNode[]): FactoryIcon[] {
  const byZone = new Map<ZoneId, FactoryMark[]>();
  for (const f of factories) byZone.set(f.zoneId, [...(byZone.get(f.zoneId) ?? []), f]);
  const sq = small ? 9 : 12;
  return [...byZone.entries()].flatMap(([zoneId, list]) => {
    const z = zones.find((q) => q.id === zoneId);
    if (!z) return [];
    const city = cities.find((c) => c.id === zoneId);
    const cityR = city ? (small ? 13 : 21) * Math.sqrt(city.share / 0.4) : small ? 12 : 16;
    // La montagne a son nom SOUS le carré : la grappe descend d'autant.
    const top = proj.py(z.y) + cityR + (zoneId === 'mountain' ? (small ? 12 : 16) : 4);
    const offsets = clusterOffsets(list.length, sq + 3);
    return list.map((mark, i) => ({ mark, x0: proj.px(z.x) + offsets[i].dx - sq / 2, y0: top + offsets[i].dy, size: sq }));
  });
}

/** Les anneaux des calques entourent chaque icône (centre du carré), un peu plus larges qu'elle. */
export function flowRingAnchors(icons: FactoryIcon[]): Map<string, FlowAnchor> {
  return new Map(icons.map(({ mark, x0, y0, size }) => [mark.productId, { x: x0 + size / 2, y: y0 + size / 2, r: size * 0.75 }]));
}

/** Les icônes que les labels des calques ne recouvrent jamais (les miennes comme celles des rivaux). */
export function factoryIconBoxes(icons: FactoryIcon[]): LabelBox[] {
  return icons.map(({ x0, y0, size }) => ({ x: x0, y: y0, width: size, height: size }));
}

/**
 * Le disque, le nom et la part des clients de chaque ville, tels que les dessine la carte : les labels des calques
 * ne les recouvrent pas non plus. Largeur des textes estimée (serif gras 12 px, part 9,5 px), un peu large.
 */
export function cityLabelBoxes(proj: MapScale, small: boolean, cities: CityNode[], names: Record<string, string>,
  shareText: (share: number) => string): LabelBox[] {
  return cities.flatMap((c) => {
    const r = (small ? 13 : 21) * Math.sqrt(c.share / 0.4);
    const x = proj.px(c.x);
    const y = proj.py(c.y);
    const side = c.id === 'east' ? 'l' : 'r';
    const nudge = CITY_LABEL_NUDGE[c.id];
    const tx = (side === 'r' ? x + r + 5 : x - r - 5) + (nudge?.dx ?? 0);
    const ty = y + (nudge?.dy ?? 0);
    const width = Math.max((names[c.id] ?? '').length * (small ? 6 : 7.4), shareText(c.share).length * (small ? 4.8 : 5.4));
    const height = small ? 22 : 26;
    return [
      { x: x - r, y: y - r, width: 2 * r, height: 2 * r },
      { x: side === 'r' ? tx : tx - width, y: ty - (small ? 11 : 13), width, height },
    ];
  });
}

const FactoriesLayer = memo(function FactoriesLayer({
  icons,
  filter,
  lensOn,
  onSelect,
}: {
  icons: FactoryIcon[];
  filter: MapFilter;
  lensOn: boolean;
  onSelect: (mark: FactoryMark) => void;
}) {
  return (
    <g>
      {icons.map(({ mark: f, x0, y0, size: sq }) => {
        const faded = dimmedBy(f.mine, filter) || (lensOn && !f.mine);
        return (
          <g key={f.productId} opacity={faded ? 0.3 : 1} {...pressable(`${f.productName} (${f.companyName})`, () => onSelect(f))}>
            <title>{`${f.productName} (${f.companyName})`}</title>
            <rect x={x0 - 4} y={y0 - 4} width={sq + 8} height={sq + 8} fill="transparent" />
            <path
              d={`M${x0} ${y0 + sq} V${y0 + sq * 0.38} l${sq / 3} ${-sq * 0.3} v${sq * 0.3} l${sq / 3} ${-sq * 0.3} v${sq * 0.3} l${sq / 3} ${-sq * 0.3} V${y0 + sq} z`}
              fill={f.color ?? AUTOPILOT}
              stroke={INK}
              strokeWidth={f.mine ? 2.2 : 0.8}
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </g>
  );
});

// ---------------------------------------------------------------------------
// La vue
// ---------------------------------------------------------------------------

type SheetTarget = { kind: 'zone'; zoneId: ZoneId } | { kind: 'deposit'; slotId: string };

/** La fiche ouverte et ce qu'elle montre : le formulaire de déménagement d'un produit, le secteur du lancement. */
interface SheetState {
  target: SheetTarget;
  /** ZoneMoveForm visible dans la fiche pour ce produit (« Déménager ici » ou intention « déménager »). */
  moveProductId?: string;
  /** Secteur présélectionné du « Lancer ici » (intention « lancer » à l'ouverture de la fiche). */
  launchSector?: SectorId;
  /** Intention « lancer » : la section « Lancer ici » est rendue juste sous le titre de la zone. */
  launchFirst?: boolean;
}

/**
 * La fiche ouverte à l'arrivée sur la carte : celle de l'intention à usage unique (lancement : la zone de
 * l'intention ou la plus rentable du secteur ; déménagement : la meilleure autre zone du produit, sa zone
 * actuelle sinon ; gisement : l'emplacement de l'intention, sinon un gisement où l'entreprise qui agit peut
 * vraiment miser pour son plus gros besoin — libre et sans mise en attente —, sinon le gisement par défaut,
 * sinon le premier gisement libre) ; à défaut celle du produit sélectionné, sinon rien.
 */
export function initialSheet(view: PlayerView, intent: MapIntent | null | undefined, acting: CompanyView | null, selectedProduct: ProductView | undefined): SheetState | null {
  // Une case du plateau (bilan de clôture) n'a pas d'équivalent ici : comme une arrivée simple.
  if (!intent || intent.kind === 'cell') return selectedProduct ? { target: { kind: 'zone', zoneId: zoneOf(selectedProduct).id } } : null;
  if (intent.kind === 'launch') {
    const sectorId = intent.sectorId ?? view.sectors.find((s) => s.launchByZone)?.id;
    const estimates = launchZoneEstimates(sectorId ? view.sectors.find((s) => s.id === sectorId) : undefined, view.commodities, view.transportFactor);
    const zoneId = intent.zoneId ?? (estimates ? bestLaunchZone(estimates) : DEFAULT_ZONE);
    return { target: { kind: 'zone', zoneId }, launchSector: sectorId, launchFirst: true };
  }
  if (intent.kind === 'move') {
    const product = view.companies.flatMap((c) => c.products).find((p) => p.id === intent.productId);
    if (!product) return null;
    const rows = zoneRows(product, moveQuartersLeft(view) - 1);
    const current = rows?.find((r) => r.isCurrent);
    const best = rows?.find((r) => !r.isCurrent && r.isBest);
    let zoneId = zoneOf(product).id;
    if (best && current) {
      if (best.marginDiff !== null) {
        if (best.marginDiff > 0) zoneId = best.zoneId;
      } else {
        // Demande inconnue : la « meilleure » zone est celle au coût le plus bas (zoneRows).
        const { unitCost: bestCost } = best;
        const { unitCost: currentCost } = current;
        if (bestCost < currentCost) zoneId = best.zoneId;
      }
    }
    return { target: { kind: 'zone', zoneId }, moveProductId: product.id };
  }
  // Sans emplacement demandé : un gisement où l'enchère est vraiment possible, choisi comme sur le plateau.
  const biddable = acting ? biddableDepositSlot(view, acting, (c) => commodityNeed(acting, c))?.id : undefined;
  const slotId = intent.slotId ?? biddable ?? view.siteSlots.find((s) => !s.companyId)?.id;
  return slotId ? { target: { kind: 'deposit', slotId } } : null;
}

/** Clé du sélecteur de référence : 'product:<id>' ou 'launch:<secteur>' (comme valueReferenceOptions). */
const keyOfRef = (r: ValueReference | null): string => (r === null ? '' : r.kind === 'product' ? `product:${r.productId}` : `launch:${r.sectorId}`);

interface Props {
  /** Entreprise sélectionnée dans le jeu : c'est elle qui agit sur la carte si le joueur la dirige. */
  company: CompanyView | null;
  onSelect: (id: string) => void;
  goTo: (tab: TabId) => void;
  /** Ouvre le produit précis dans « Mes usines ». */
  onOpenFactory: (companyId: string, productId?: string) => void;
  selectedProductId?: string | null;
  onSelectProduct?: (id: string) => void;
  /** Intention à usage unique (lancer, déménager, gisement) : initialise lentille, référence et fiche au montage. */
  intent?: MapIntent | null;
  /** Scène figée (état partagé avec les panneaux, tenu par CityTab sous STILL_KEY). */
  frozen: boolean;
  onToggleStill: () => void;
}

export function MapView({ company, goTo, onSelect, onOpenFactory, selectedProductId, onSelectProduct, intent, frozen, onToggleStill }: Props) {
  const { view, me } = useGame();
  const t = useT();
  const uiLang = useUiLang();
  const workspaceText = mapWorkspaceMessages(uiLang);
  const m = t.city.map;
  const car = m.carnet;
  const s = t.city.shell;
  const fmt = useFmt();
  const content = useContent();
  const mapNames = content.mapNames;
  const reduced = useReducedMotion();
  const still = reduced || frozen;
  // L'entreprise qui agit sur la carte : celle sélectionnée si le joueur la dirige, sinon la première
  // qu'il dirige (null pour un spectateur : aucune décision n'est alors proposée dans les fiches).
  const own = view.companies.filter(isOwn);
  const acting = company && isOwn(company) ? company : own[0] ?? null;
  const [lens, setLens] = useState<MapLens>(() => (intent && intent.kind !== 'deposit' && intent.kind !== 'cell' ? 'value' : 'own'));
  const [filter, setFilter] = useState<MapFilter>('all');
  const selectedProduct = view.companies.filter(isOwn).flatMap((c) => c.products).find((p) => p.id === selectedProductId);
  const [pickedRef, setPickedRef] = useState<string | null>(() => {
    if (intent?.kind === 'launch') {
      const sectorId = intent.sectorId ?? view.sectors.find((s) => s.launchByZone)?.id;
      return sectorId ? `launch:${sectorId}` : null;
    }
    if (intent?.kind === 'move') return `product:${intent.productId}`;
    return selectedProduct ? `product:${selectedProduct.id}` : null;
  });
  const [sheet, setSheet] = useState<SheetState | null>(() => initialSheet(view, intent, acting, selectedProduct));
  // A tracked reference drives both lens and flows unless comparison is explicitly enabled.
  const [flowMode, setFlowMode] = useState<FlowMode>('off');
  const flowsOn = flowMode !== 'off';
  const [figures, setFigures] = useState(true);
  const [compare, setCompare] = useState(false);
  const [comparedKey, setComparedKey] = useState<string | null>(null);
  const [selectionToken, setSelectionToken] = useState(0);
  const [reportId, setReportId] = useState<string | null>(null);
  // Le filtre « Mes affaires » ne s'applique que tant que ses jetons sont visibles (lentille possession), ou que
  // la case « Concurrents » d'un calque allumé le pilote.
  const shownFilter: MapFilter = lens === 'value' && !flowsOn ? 'all' : filter;

  // Mesures : la colonne carte (largeur du SVG) ; deux colonnes dès 960 px de fenêtre (la requête de styles.css).
  const wide = useMediaQuery('(min-width: 960px)');
  const [mapRef, mapW] = useElementWidth<HTMLDivElement>(880);
  const [viewRef, inView] = useInView<HTMLDivElement>();
  const proj = useMemo(() => mapScale(Math.max(280, mapW), MAP_VIEW), [mapW]);
  const small = mapW < PHONE_W;
  const animate = !still && inView;

  // Le modèle de la carte (pur, voir mapModel).
  const cities = useMemo(() => mapCities(), []);
  const zones = useMemo(() => mapZones(), []);
  const deposits = useMemo(() => mapDeposits(view), [view]);
  const factories = useMemo(() => mapFactories(view), [view]);
  const inputs = useMemo(() => mySupplyInputs(view), [view]);
  // Seules les routes avec un vrai tracé se dessinent (jamais de route vide : midpoint([]) planterait).
  const routes = useMemo(() => inputs.filter((r) => r.points.length > 1), [inputs]);
  const news = useMemo(() => cityNews(view), [view]);
  const icons = useMemo(() => factoryIconLayout(proj, small, factories, cities, zones), [proj, small, factories, cities, zones]);

  // La lentille « valeur » : référence choisie (un de mes produits, ou une nouvelle usine d'un secteur).
  const refOptions = useMemo(() => valueReferenceOptions(view), [view]);
  const refKey = pickedRef && refOptions.some((o) => o.key === pickedRef) ? pickedRef : keyOfRef(defaultValueReference(view));
  const trackedRef = refOptions.find((o) => o.key === refKey)?.ref ?? null;
  const lensKey = compare && comparedKey && refOptions.some((o) => o.key === comparedKey) ? comparedKey : refKey;
  const valueRef = refOptions.find((o) => o.key === lensKey)?.ref ?? null;
  const flowModel = useMemo(() => {
    if (!flowsOn || trackedRef?.kind !== 'product') return null;
    return buildMapFlowModel(view, trackedRef.productId);
  }, [view, refKey, flowsOn]);
  const flowProductId = flowModel?.selectedProductId ?? null;
  // Les anneaux entourent la vraie icône de chaque usine ; aucun label ne recouvre une icône (la mienne ni celle d'un rival).
  const flowAnchors = useMemo(() => flowRingAnchors(icons), [icons]);
  const cityShare = useCallback((share: number) => m.clientShare(fmt.pct(share, 0)), [m, fmt]);
  const flowObstacles = useMemo(() => [...factoryIconBoxes(icons), ...cityLabelBoxes(proj, small, cities, mapNames.cities, cityShare)],
    [icons, proj, small, cities, mapNames, cityShare]);
  const flowCompany = own.find((c) => c.products.some((p) => p.id === flowProductId));
  const reportCompany = own.find((c) => c.id === reportId);
  const pickFlowProduct = useCallback((productId: string) => {
    setPickedRef(`product:${productId}`);
    setSheet((current) => current?.moveProductId && current.moveProductId !== productId
      ? { ...current, moveProductId: undefined } : current);
    onSelectProduct?.(productId);
  }, [onSelectProduct]);
  const lensModel: ValueLens | null = useMemo(() => (lens === 'value' ? valueLensModel(view, valueRef) : null), [lens, view, valueRef]);
  const halos: Halo[] | null = useMemo(
    () => (lensModel ? lensModel.zones.map((zv) => ({ ...zv, text: zv.isReference ? m.refBadge : fmt.signedPct(zv.gap, 1).replace('-', '−') })) : null),
    [lensModel, m, fmt],
  );

  const commodityName = useCallback((cid: CommodityId) => content.commodities[cid]?.name ?? cid, [content]);
  const pills = useMemo(() => routes.map((route) => ({ route, text: m.routePill(commodityName(route.commodityId), fmt.money(route.pricePerLot)) })), [routes, m, fmt, commodityName]);
  const depositMarks = useMemo<DepositMark[]>(
    () =>
      deposits.map((d) => ({
        d,
        aria: m.openDepositAria(d.name),
        tip: m.depositTip(d.name, commodityName(d.commodityId), richnessTier(t, d.capacity), d.operatorId ? m.depositSheet.operatedBy(d.operatorName ?? '') : m.depositSheet.free),
      })),
    [deposits, m, t, commodityName],
  );

  // Ouverture/fermeture des fiches : l'invocateur (élément actif au moment du clic) retrouve le focus à la
  // fermeture ; sur ordinateur, le focus va au titre de la fiche (Échap ou ✕ pour vider), sur téléphone la
  // modale gère elle-même le focus.
  const invoker = useRef<Element | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const openSheet = useCallback((target: SheetTarget) => {
    invoker.current = typeof document === 'undefined' ? null : document.activeElement;
    setSheet({ target });
    setSelectionToken((token) => token + 1);
  }, []);
  const closeSheet = useCallback(() => {
    setSheet(null);
    const el = invoker.current;
    if ((el instanceof HTMLElement || (typeof SVGElement !== 'undefined' && el instanceof SVGElement)) && el.isConnected) el.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!sheet || !wide) return;
    const focusTarget = formRef.current ?? headingRef.current;
    if (focusTarget) focusMapSheetTarget(focusTarget, Boolean(intent && selectionToken === 0));
  }, [sheet, wide, acting?.id]);
  const openZone = useCallback((zoneId: ZoneId) => openSheet({ kind: 'zone', zoneId }), [openSheet]);
  const openDeposit = useCallback((slotId: string) => openSheet({ kind: 'deposit', slotId }), [openSheet]);
  const goPort = useCallback(() => goTo('commodities'), [goTo]);
  const goStocks = useCallback(() => goTo('stocks'), [goTo]);
  const openFactory = onOpenFactory;
  const selectFactory = (mark: FactoryMark) => {
    if (mark.mine) pickFlowProduct(mark.productId);
    openZone(mark.zoneId);
  };
  const shareText = cityShare;
  const zoneAria = useCallback((name: string) => m.openZoneAria(name), [m]);
  const onPortOpen = useCallback(
    (target: CityTarget) => {
      if (target.kind === 'commodity') goTo('commodities');
    },
    [goTo],
  );

  // La fiche demandée (zone ou gisement) ; un gisement disparu de la vue ferme la fiche. « Déménager ici »
  // montre ZoneMoveForm dans la fiche (moveProductId) ; l'intention « déménager » l'y ouvre directement.
  const target = sheet?.target ?? null;
  const deposit = target?.kind === 'deposit' ? deposits.find((d) => d.slotId === target.slotId) : undefined;
  const moveProductId = target?.kind === 'zone' ? sheet?.moveProductId : undefined;
  const moveCompany = moveProductId ? view.companies.find((c) => c.products.some((p) => p.id === moveProductId)) : undefined;
  const moveProduct = moveCompany?.products.find((p) => p.id === moveProductId);
  const sheetBody = sheet && target ? (
    target.kind === 'zone' ? (
      <ZoneSheet
        zoneId={target.zoneId}
        view={view}
        factories={factories}
        goTo={goTo}
        onOpenFactory={openFactory}
        acting={acting}
        reference={valueRef}
        launchSector={trackedRef?.kind === 'launch' ? trackedRef.sectorId : sheet.launchSector}
        onLaunchSectorChange={(sectorId) => setPickedRef(`launch:${sectorId}`)}
        launchFirst={sheet.launchFirst}
        move={moveCompany && moveProduct ? { company: moveCompany, product: moveProduct } : null}
        onMove={(productId) => {
          const owner = own.find((c) => c.products.some((p) => p.id === productId));
          if (owner && owner.id !== acting?.id) onSelect(owner.id);
          pickFlowProduct(productId);
          setSheet((s) => (s ? { ...s, moveProductId: productId } : s));
        }}
        onBackToZone={() => setSheet((s) => (s ? { ...s, moveProductId: undefined } : s))}
        headingRef={headingRef}
        formRef={formRef}
      />
    ) : deposit ? (
      <DepositSheet deposit={deposit} view={view} acting={acting} headingRef={headingRef} formRef={formRef} />
    ) : null
  ) : null;
  const sheetTitle = target ? (target.kind === 'zone' ? zoneLabel(mapNames, target.zoneId) : (deposit?.name ?? '')) : '';
  const selectedZoneId = target?.kind === 'zone' ? target.zoneId : null;
  const selectedSlotId = target?.kind === 'deposit' ? target.slotId : null;

  // Une fiche ouverte met la carte en pause (les animations CSS, via la classe city-paused).
  const paused = sheetBody !== null;

  // Le carnet : mon réseau (un carton par produit, une ligne par matière), zones, gisements.
  const network = useMemo(
    () =>
      view.companies.filter(isOwn).flatMap((company) =>
        company.products.flatMap((product) => {
          const own = ownProduct(product);
          if (!own) return [];
          const { zones: ownZones } = own;
          const { unitCost } = ownZones;
          const { estimatedTransport } = own;
          const zoneId = zoneOf(product).id;
          return [{ company, product, zoneId, cost: unitCost[zoneId], transport: estimatedTransport, inputs: inputs.filter((r) => r.productId === product.id) }];
        }),
      ),
    [view, inputs],
  );
  const depositName = useCallback((nodeId: string) => deposits.find((d) => d.slotId === nodeId)?.name ?? nodeId, [deposits]);
  // Gisements libres que l'une de mes entreprises peut encore disputer : une filiale par matière et par
  // entreprise (§5.5 bis, refus du moteur sinon), du lot livré le moins cher au plus cher.
  const freeNear = useMemo(() => {
    const out: { d: DepositNode; price: number; product: ProductView; km: number }[] = [];
    for (const d of deposits) {
      if (d.operatorId !== null) continue;
      const extraction = extractionCostNow(d.commodityId, view.commodities.find((cd) => cd.id === d.commodityId)?.siteCostFactor);
      let best: { price: number; product: ProductView; km: number } | null = null;
      for (const { company, product } of network) {
        if ((SECTORS[product.sectorId].inputs[d.commodityId] ?? 0) <= 0) continue;
        if ((company.sites ?? []).some((s) => s.commodityId === d.commodityId)) continue;
        const zoneId = zoneOf(product).id;
        const price = deliveredLotPrice({ kind: 'deposit', slotId: d.slotId, extractionCost: extraction }, zoneId, view.transportFactor ?? 1, product.sectorId);
        const km = SECTORS[product.sectorId].intangible ? 0 : roadRoute(d.slotId, zoneId)?.km ?? 0;
        if (!best || price < best.price) best = { price, product, km };
      }
      if (best) out.push({ d, ...best });
    }
    return out.sort((a, b) => a.price - b.price);
  }, [network, deposits, view]);
  // Au dernier trimestre le moteur refuse les enchères : la section ne s'affiche plus.
  const lastTurn = view.turn >= view.config.totalTurns;

  return (
    <>
      <div ref={viewRef} className={cx('city', 'map', still && 'city-still', paused && 'city-paused')}>
        <MapWorkspace selectedKey={sheet ? sheetTitle : null} selectionToken={selectionToken}
          preserveFormScroll={Boolean(intent && selectionToken === 0)}
          foldLabel={workspaceText.foldSheet} reopenLabel={workspaceText.reopenSheet}
          wholeLabel={workspaceText.wholeCountry} enlargeLabel={workspaceText.enlargeMap}
          sheet={wide && sheetBody ? <div className="map-sheet-card">{sheetBody}</div> : null}
          toolbar={<>
            {acting && <div className="map-company-header">
              <span>{m.actingCompany(acting.name)}</span><strong>{workspaceText.companyCash(fmt.money(acting.cash))}</strong>
              {own.length > 1 && <div className="row wrap" role="group" aria-label={m.actingCompany(acting.name)}>
                {own.map((c) => <button key={c.id} type="button" className={cx('chip', c.id === acting.id && 'active')}
                  aria-pressed={c.id === acting.id} onClick={() => {
                    setSheet((current) => current?.moveProductId && c.id !== moveCompany?.id ? { ...current, moveProductId: undefined } : current);
                    onSelect(c.id);
                  }}>{c.emoji} {c.name}</button>)}
              </div>}
            </div>}
            <MapProductControls options={refOptions.map((o) => ({ key: o.key,
              label: o.ref.kind === 'launch' ? m.refNewPlant(content.sectors[o.ref.sectorId]?.name ?? o.label) : o.label }))}
              trackedKey={refKey} onTrackedChange={(key) => {
                const ref = refOptions.find((o) => o.key === key)?.ref;
                if (ref?.kind === 'product') pickFlowProduct(ref.productId);
                else { setPickedRef(key); setSheet((current) => current ? { ...current, moveProductId: undefined } : current); }
              }}
              compare={compare} onCompareChange={(enabled) => { if (enabled) setComparedKey(refKey); setCompare(enabled); }}
              comparedKey={lensKey} onComparedChange={setComparedKey} />
            <MapFlowControls mode={flowMode} onModeChange={setFlowMode} figures={figures} onFiguresChange={setFigures}
              rivals={filter === 'all'} onRivalsChange={(shown) => setFilter(shown ? 'all' : 'mine')}
              unavailable={trackedRef?.kind !== 'product'} />
            <div className="city-toolbar">
              <div className="map-toolbar-main">
                <div className="seg" role="group" aria-label={m.lensAria}>
                  <button type="button" className={cx('seg-btn', lens === 'own' && 'active')} aria-pressed={lens === 'own'} onClick={() => setLens('own')}>
                    {m.lensOwn}
                  </button>
                  <button type="button" className={cx('seg-btn', lens === 'value' && 'active')} aria-pressed={lens === 'value'} onClick={() => setLens('value')}>
                    {m.lensValue}
                  </button>
                </div>
                {lens !== 'value' && (
                  <div className="city-filters" role="group" aria-label={s.filtersAria}>
                    <button type="button" className={cx('chip', filter === 'all' && 'active')} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                      {s.filterAll}
                    </button>
                    <button type="button" className={cx('chip', filter === 'mine' && 'active')} aria-pressed={filter === 'mine'} onClick={() => setFilter('mine')}>
                      {s.filterMine}
                    </button>
                  </div>
                )}
              </div>
              {!reduced && (
                // Libellé qui change avec l'état (sans aria-pressed) ; pictogramme muet.
                <button
                  type="button"
                  className="btn tiny ghost"
                  onClick={onToggleStill}
                >
                  <span aria-hidden>{frozen ? '▶ ' : '⏸ '}</span>
                  {frozen ? s.animate : s.freeze}
                </button>
              )}
            </div>
            <div className="map-head">
              <h2 className="map-title">{mapNames.country}</h2>
              <span className="map-scale-note">{m.scaleNote}</span>
            </div>
            <details className="map-legend">
              <summary>{s.legendTitle}</summary>
              {lens === 'value' && <p className="map-value-note small">{m.lensValueHint}</p>}
              <p className="small">{m.roadsTitle} : {Object.values(m.roads).join(' · ')}</p>
              <ul>{Object.values(s.legend).map((text, i) => <li key={i}><Rich text={text} /></li>)}</ul>
            </details>
          </>}
        >
            <div className="map-frame" ref={mapRef}>
              <BaseMap proj={proj} small={small} animate={animate} names={mapNames.landmarks} scaleBar={m.scaleBar} mapAria={m.aria}>
                {halos && <ValueHalos proj={proj} small={small} zones={zones} halos={halos} />}
                {!flowsOn && <RoutesLayer proj={proj} small={small} animate={animate} pills={pills} color={me.color} />}
                <DepositsLayer proj={proj} small={small} marks={depositMarks} filter={shownFilter} selectedSlotId={selectedSlotId} onOpen={openDeposit} />
                <CitiesLayer
                  proj={proj}
                  small={small}
                  cities={cities}
                  zones={zones}
                  mapNames={mapNames}
                  selectedZoneId={selectedZoneId}
                  shareText={shareText}
                  cityTip={m.cityTip}
                  zoneAria={zoneAria}
                  onOpenZone={openZone}
                  onPort={goPort}
                  onStocks={goStocks}
                  portAria={m.capitalPortAria}
                  stocksAria={m.capitalStocksAria}
                />
                <FactoriesLayer icons={icons} filter={shownFilter} lensOn={lens === 'value'} onSelect={selectFactory} />
                {halos && <ValueBadges proj={proj} small={small} zones={zones} halos={halos} />}
                {flowModel && (
                  <MapFlowLayer proj={proj} model={flowModel} mode={flowMode} figures={figures} rivals={filter === 'all'}
                    anchors={flowAnchors} obstacles={flowObstacles} onSelectProduct={(_companyId, productId) => {
                      pickFlowProduct(productId); const factory = factories.find((f) => f.productId === productId);
                      if (factory) openZone(factory.zoneId);
                    }} />
                )}
              </BaseMap>
            </div>
        </MapWorkspace>
        {flowModel && (
          <MapFlowDetail model={flowModel} mode={flowMode} onOpenFactory={onOpenFactory}
            onOpenMaterials={(companyId, productId) => { onSelect(companyId); onSelectProduct?.(productId); goTo('commodities'); }}
            onOpenReport={flowCompany?.reports.length ? (companyId) => setReportId(companyId) : undefined} />
        )}

        {/* Le carnet : alternative accessible de la carte, chaque ligne ouvre la même fiche. */}
        <section className="map-carnet">
          <div className="map-carnet-col">
            <h3 className="map-carnet-head">{car.networkTitle}</h3>
            {network.length === 0 ? (
              <p className="small muted">{car.noNetwork}</p>
            ) : (
              <>
                {network.map(({ company, product, zoneId, cost, inputs }) => (
                  <article key={product.id} className="map-net-card">
                    <button type="button" className="map-row-btn map-net-head" aria-label={m.openZoneAria(zoneLabel(mapNames, zoneId))} onClick={() => { pickFlowProduct(product.id); openZone(zoneId); }}>
                      <b>{product.name}</b> · {company.name}
                    </button>
                    <p className="small map-net-cost">{car.networkCost(zoneLabel(mapNames, zoneId), fmt.money(cost))}</p>
                    <FreightDetails view={view} freight={currentProductFreight(view, company, product)} />
                    {inputs.length > 0 && (
                      <ul className="map-net-inputs">
                        {inputs.map((r) => (
                          <li key={`${r.productId}-${r.commodityId}`} className="small">
                            {r.fromSite ? (
                              <button type="button" className="map-row-btn" aria-label={m.openDepositAria(depositName(r.fromNodeId))} onClick={() => openDeposit(r.fromNodeId)}>
                                {car.inputLine(commodityName(r.commodityId), depositName(r.fromNodeId), kmLabel(fmt, r.km), fmt.money(r.pricePerLot))}
                              </button>
                            ) : (
                              car.inputLine(commodityName(r.commodityId), car.portSource, kmLabel(fmt, r.km), fmt.money(r.pricePerLot))
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
                {!lastTurn && (
                  <>
                    <h4 className="map-carnet-subhead">{car.freeNearTitle}</h4>
                    {freeNear.length === 0 ? (
                      <p className="small muted">{car.noFreeNear}</p>
                    ) : (
                      freeNear.map(({ d, price, product, km }) => (
                        <button key={d.slotId} type="button" className="map-carnet-row" aria-label={m.openDepositAria(d.name)} onClick={() => openDeposit(d.slotId)}>
                          <span className="map-row-main">
                            <b>{d.name}</b>
                          </span>
                          <span className="map-carnet-sub">
                            {richnessTier(t, d.capacity)} · {m.depositSheet.delivered(product.name, zoneLabel(mapNames, zoneOf(product).id), kmLabel(fmt, km), fmt.money(price))}
                          </span>
                        </button>
                      ))
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div className="map-carnet-col">
            <h3 className="map-carnet-head">{car.zonesTitle}</h3>
            {zones.map((z) => {
              const name = zoneLabel(mapNames, z.id);
              const list = factories.filter((f) => f.zoneId === z.id);
              const mine = list.filter((f) => f.mine).length;
              const share = z.cityId ? CITIES[z.cityId].share : null;
              return (
                <button key={z.id} type="button" className="map-carnet-row" aria-label={m.openZoneAria(name)} onClick={() => openZone(z.id)}>
                  <span className="map-row-main">
                    <b>{name}</b>
                    {share !== null && <span className="muted"> · {m.clientShare(fmt.pct(share, 0))}</span>}
                  </span>
                  <span className="map-carnet-sub">{car.zoneRow(list.length, mine)}</span>
                </button>
              );
            })}
          </div>

          <div className="map-carnet-col">
            <h3 className="map-carnet-head">{car.depositsTitle}</h3>
            {COMMODITY_IDS.map((cid) => (
              <div key={cid} className="map-carnet-group">
                <div className="map-carnet-group-head">
                  <CommodityGlyph id={cid} size={13} color={COMMODITY_ACCENT[cid]} />
                  <b>{commodityName(cid)}</b>
                </div>
                {deposits
                  .filter((d) => d.commodityId === cid)
                  .sort((a, b) => b.capacity - a.capacity)
                  .map((d) => (
                    <button key={d.slotId} type="button" className="map-carnet-row" aria-label={m.openDepositAria(d.name)} onClick={() => openDeposit(d.slotId)}>
                      <span className="map-row-main">
                        <b>{d.name}</b>
                      </span>
                      <span className="map-carnet-sub">
                        {richnessTier(t, d.capacity)} ·{' '}
                        {d.operatorId ? (
                          <>
                            <span className="map-swatch" style={{ background: d.color ?? AUTOPILOT }} aria-hidden /> {d.operatorName}
                          </>
                        ) : (
                          <span className="up">{t.sites.slotFree}</span>
                        )}
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </section>

        {/* Le port et la bourse de la capitale (composant de l'ancienne ville). */}
        <section className="map-port" aria-label={m.portTitle(mapNames.cities.capital)}>
          <h3 className="map-port-head">{m.portTitle(mapNames.cities.capital)}</h3>
          <Port view={view} filter={ALL_FILTER} still={still} onOpen={onPortOpen} news={news} />
        </section>
      </div>

      {/* Téléphone : la fiche remonte en bas d'écran (la modale gère le focus et Échap). */}
      {!wide && sheetBody && (
        <Modal title={sheetTitle} onClose={closeSheet}>
          {sheetBody}
        </Modal>
      )}
      {reportCompany && reportCompany.reports.length > 0 && <Modal title={quarterCloseMessages(uiLang).reportTitle(reportCompany.name, fmt.date(reportCompany.reports[reportCompany.reports.length - 1].turn, view.config.startYear))} onClose={() => setReportId(null)} wide>
        <ReportTable reports={reportCompany.reports} />
      </Modal>}
    </>
  );
}
