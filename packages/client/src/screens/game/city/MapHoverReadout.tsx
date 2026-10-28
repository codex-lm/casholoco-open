import { hexById, hexPlaceLabel, type PlayerView } from '@muchomoney/core';
import { useRoomLang, useUiLang } from '../../../i18n';
import { hexReadabilityMessages } from '../../../i18n/hexReadability';
import { useFmt } from '../../../fmt';
import type { HexReference, HexSupplyReference } from './hexModel';
import { mapDeliveryEstimate } from './mapDeliveryModel';
import './MapHoverReadout.css';

/** A compact, read-only destination preview. Hovering never changes the selected origin. */
export function MapHoverReadout({ view, reference, supplyReference, hoveredId }: {
  view: PlayerView;
  reference: HexReference | null;
  supplyReference: HexSupplyReference | null;
  hoveredId: string | null;
}) {
  const text = hexReadabilityMessages(useUiLang());
  const roomLang = useRoomLang();
  const fmt = useFmt();
  const hovered = hoveredId && hexById(hoveredId);
  if (!hovered) return <section className="hx-hover-readout hx-hover-readout-empty" aria-label={text.hoveredCell}>
    <p>{text.hoverHint}</p>
  </section>;

  const estimate = mapDeliveryEstimate(view, reference, supplyReference, hovered.id);
  const population = view.hexes?.populationShare?.[hovered.id];
  const display = (value: number | null | undefined, format: (n: number) => string) =>
    typeof value === 'number' && Number.isFinite(value) ? format(value) : '—';
  return <section className="hx-hover-readout" aria-label={text.hoveredCell} data-hex-hover={hovered.id}>
    <div className="hx-hover-place"><span>{text.hoveredCell}</span><strong>{hexPlaceLabel(hovered.id, roomLang, view.siteSlots)}</strong></div>
    <dl className="hx-hover-numbers">
      <dt>{text.population}</dt><dd>{display(population, (n) => fmt.pct(n, 2))}</dd>
      <dt>{supplyReference ? text.supplyFreight : text.deliveryTransport}</dt><dd>{display(estimate?.transport, (n) => fmt.lotPrice(n, 3))}</dd>
      <dt>{supplyReference ? text.supplyDemand : text.marketDemand}</dt><dd>{display(estimate?.demand, (n) => fmt.lots(n, 3))}</dd>
      <dt>{text.totalMargin}</dt><dd>{display(estimate?.totalMargin, (n) => fmt.signedMoney(n, 3))}</dd>
    </dl>
    {estimate && <p className="hx-hover-basis">{supplyReference ? text.supplyDemandBasis : text.fullDemandBasis}</p>}
  </section>;
}
