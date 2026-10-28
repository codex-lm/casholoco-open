import { useId, type ReactNode } from 'react';
import type { CommodityId, MapPoint } from '@muchomoney/core';
import { useContent, useUiLang } from '../../../i18n';
import { mapFlowText } from '../../../i18n/mapFlows';
import { useFmt } from '../../../fmt';
import { COMMODITY_ACCENT } from '../factories/parts';
import type { FactoryFlow, FlowMode, FlowModel, FlowRoute, FlowSource } from './mapFlows';
import type { MapScale } from './mapModel';
import './mapFlows.css';

/** A factory's ring on screen (px): the classic map anchors it on the factory's own icon in its zone's cluster. */
export interface FlowAnchor { x: number; y: number; r: number }
/** A screen rectangle (px). */
export interface LabelBox { x: number; y: number; width: number; height: number }

export interface MapFlowLayerProps {
  proj: MapScale;
  model: FlowModel;
  mode: FlowMode;
  figures: boolean;
  rivals?: boolean;
  /** null = pas de produit ; absent = sélection du modèle. */
  productId?: string | null;
  /** Rings become buttons only when given (the classic map; on the board, the cell itself selects). */
  onSelectProduct?: (companyId: string, productId: string) => void;
  /** Ring position by product id; without one, the ring sits on the factory's map point. */
  anchors?: ReadonlyMap<string, FlowAnchor>;
  /** Areas labels must never cover: the factory icons, own and rivals'. */
  obstacles?: readonly LabelBox[];
}

/** Port route colour when it carries several materials at once (one line, one combined label). */
const MIXED = '#3d3a33';
const RING_R = 12;

/** Chemin tel que fourni par la géométrie du moteur : aucune courbe ou destination inventée. */
export function flowPath(proj: MapScale, points: readonly MapPoint[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'}${proj.px(point.x).toFixed(2)} ${proj.py(point.y).toFixed(2)}`).join(' ');
}

const overlaps = (a: LabelBox, b: LabelBox, gap = 4) =>
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

/** SVG superposé à la carte ; le détail HTML reste lisible quand les labels doivent s'effacer. */
export function MapFlowLayer({ proj, model, mode, figures, rivals = false, productId, onSelectProduct, anchors, obstacles = [] }: MapFlowLayerProps) {
  const text = mapFlowText(useUiLang());
  const content = useContent();
  const fmt = useFmt();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (mode === 'off') return null;
  // L'accord suit la quantité arrondie comme l'affichage (deux décimales au plus).
  const lots = (value: number) => text.lots(fmt.num(value), Math.round(value * 100) / 100);
  const mobile = proj.width < 480;
  const placed: LabelBox[] = [];
  const labelLimit = mobile ? 1 : 5;
  const selectedProductId = productId === undefined ? model.selectedProductId : productId;
  const commodity = (id: CommodityId) => content.commodities[id]?.name ?? id;
  const sourceName = (source: FlowSource) => source.type === 'port' ? content.mapNames.cities.capital : source.name ?? source.id;
  const at = (point: MapPoint, r: number): FlowAnchor => ({ x: proj.px(point.x), y: proj.py(point.y), r });
  const ringOf = (factory: FactoryFlow): FlowAnchor => anchors?.get(factory.productId) ?? at(factory.point, RING_R);

  /** First free spot around the anchor (below, above, right, left, then further out); none = the detail panel only. */
  const label = (key: string, anchor: FlowAnchor, lines: string[]) => {
    if (!figures || placed.length >= labelLimit || lines.length === 0) return null;
    const width = Math.min(mobile ? 138 : 210, Math.max(78, Math.max(...lines.map((line) => line.length)) * (mobile ? 5.4 : 6.1) + 12));
    const height = lines.length * 13 + 8;
    for (let step = 0; step < 6; step++) {
      const d = anchor.r + 6 + step * 14;
      const spots: [number, number][] = [
        [anchor.x - width / 2, anchor.y + d], [anchor.x - width / 2, anchor.y - d - height],
        [anchor.x + d, anchor.y - height / 2], [anchor.x - d - width, anchor.y - height / 2],
      ];
      for (const [left, top] of spots) {
        const box = { x: Math.max(4, Math.min(proj.width - width - 4, left)), y: Math.max(4, Math.min(proj.height - height - 4, top)), width, height };
        if (obstacles.some((other) => overlaps(box, other, 2)) || placed.some((other) => overlaps(box, other))) continue;
        placed.push(box);
        return <g key={key} aria-hidden="true" pointerEvents="none">
          <rect className="map-flow-label-box" x={box.x} y={box.y} width={width} height={height} rx="2" />
          {lines.map((line, index) => <text key={index} className="map-flow-label" x={box.x + width / 2} y={box.y + 13 + index * 13} textAnchor="middle">{line}</text>)}
        </g>;
      }
    }
    return null;
  };

  // One arrowhead per colour actually drawn.
  const colors: string[] = [];
  const markerOf = (color: string) => {
    if (!colors.includes(color)) colors.push(color);
    return `url(#flow-arrow-${uid}-${colors.indexOf(color)})`;
  };
  const routeLines = (route: FlowRoute, color: string, title: string): ReactNode => {
    const segments = route.segments.filter((segment) => segment.points.length >= 2);
    return segments.map((segment, index) => <g key={index} data-flow-segment={segment.kind}>
      <path className="map-flow-path" d={flowPath(proj, segment.points)} stroke="#faf6ec" strokeWidth="5" opacity=".9" />
      <path className="map-flow-path" d={flowPath(proj, segment.points)} stroke={color} strokeWidth={mode === 'sales' ? 2.5 : 2.1}
        strokeDasharray={segment.kind === 'ferry' ? '2 5' : mode === 'supply' ? '5 3' : undefined}
        markerEnd={index === segments.length - 1 ? markerOf(color) : undefined}>
        <title>{segment.indicative ? `${title} · ${text.ferryNote}` : title}</title>
      </path>
    </g>);
  };
  const drawable = (route: FlowRoute | undefined): route is FlowRoute => !!route && route.points.length >= 2;

  let body: ReactNode = null;
  if (mode === 'production') {
    body = model.production.filter((factory) => factory.mine || rivals).map((factory) => {
      const ring = ringOf(factory);
      const visible = factory.mine && factory.productId === selectedProductId;
      const interactive = factory.mine && !!onSelectProduct;
      const r = visible ? ring.r + 3 : ring.r;
      const name = `${factory.name} · ${factory.companyName}`;
      const lines = visible ? [
        ...(factory.planned !== null ? [text.productionShort(lots(factory.planned))] : []),
        ...(factory.stock !== null ? [text.stockShort(lots(factory.stock))] : []),
        ...(!mobile && factory.demand !== null ? [text.demandShort(lots(factory.demand))] : []),
      ] : [];
      const select = () => onSelectProduct!(factory.companyId, factory.productId);
      return <g key={factory.id} opacity={factory.mine ? 1 : .3}>
        {interactive ? (
          // Only the ring's stroke takes the pointer: the icon, the city disc and the zone underneath keep theirs.
          <g className="map-flow-hit" role="button" tabIndex={0} aria-label={name} aria-pressed={visible}
            onClick={select} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }}>
            <circle className="map-flow-ring" cx={ring.x} cy={ring.y} r={r} fill="none" stroke={factory.color} strokeWidth={visible ? 3 : 1.5} pointerEvents="none" />
            <circle cx={ring.x} cy={ring.y} r={r} fill="none" stroke="transparent" strokeWidth="4" pointerEvents="stroke" />
            <title>{name}</title>
          </g>
        ) : (
          <circle className="map-flow-ring" cx={ring.x} cy={ring.y} r={r} fill="none" stroke={factory.color} strokeWidth={visible ? 3 : 1.5}>
            <title>{name}</title>
          </circle>
        )}
        {label(factory.id, { ...ring, r }, lines)}
      </g>;
    });
  } else if (mode === 'supply') {
    const flows = model.supply.filter((flow) => flow.productId === selectedProductId && !flow.intangible);
    const deposits = flows.flatMap((flow) => flow.sources.filter((source) => source.type === 'deposit' && drawable(source.route))
      .map((source) => ({ flow, source })));
    // The port → factory road is the same for every material bought there: one line, one combined label.
    const viaPort = flows.filter((flow) => flow.sources.some((source) => source.type === 'port' && drawable(source.route)));
    const port = viaPort[0]?.sources.find((source) => source.type === 'port');
    const portColor = viaPort.length === 1 ? COMMODITY_ACCENT[viaPort[0].commodityId] : MIXED;
    const portNames = viaPort.map((flow) => commodity(flow.commodityId)).join(' · ');
    body = <>
      {deposits.map(({ flow, source }) => <g key={`${flow.id}-${source.id}`}>
        {routeLines(source.route!, COMMODITY_ACCENT[flow.commodityId], `${commodity(flow.commodityId)} · ${sourceName(source)} · ${text.sourceShort}`)}
        {label(`${flow.id}-${source.id}`, at(source.point, 12), [commodity(flow.commodityId), text.sourceShort])}
      </g>)}
      {port && <g key="port">
        {routeLines(port.route!, portColor, `${portNames} · ${sourceName(port)} · ${text.portShort}`)}
        {label('port', at(port.point, 14), [portNames, text.portShort])}
      </g>}
    </>;
  } else {
    body = model.sales.filter((flow) => flow.productId === selectedProductId && (flow.mine || rivals) && flow.sold > 0).map((flow) => {
      const route = flow.intangible ? undefined : flow.route;
      // A city's sales are labelled at that city (crypto included, without any arrow); the national total stays at
      // the recorded factory, and only when that origin is known.
      const where = flow.cityId ? route?.points.at(-1) ?? flow.destination : flow.originKnown ? flow.point : undefined;
      return <g key={flow.id} opacity={flow.mine ? 1 : .3}>
        {drawable(route) && routeLines(route, flow.color, `${flow.name} · ${lots(flow.sold)}`)}
        {flow.mine && where && label(flow.id, at(where, flow.cityId ? 8 : RING_R), [
          flow.national ? text.national : flow.cityId ? content.mapNames.cities[flow.cityId] : flow.name,
          text.soldShort(lots(flow.sold), Math.round(flow.sold * 100) / 100),
        ])}
      </g>;
    });
  }

  return <g className={`map-flow-layer map-flow-${mode}`} pointerEvents="none" data-flow-mode={mode}>
    {body}
    <defs>
      {colors.map((color, index) => <marker key={color} id={`flow-arrow-${uid}-${index}`} markerWidth="7" markerHeight="7"
        refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 .5L6 3.5L0 6.5z" fill={color} /></marker>)}
    </defs>
  </g>;
}
