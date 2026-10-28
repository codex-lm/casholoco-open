import type { ReactNode } from 'react';
import { hexById, hexPlaceLabel, type PlayerView } from '@muchomoney/core';
import { useContent, useRoomLang, useUiLang } from '../../../i18n';
import { hexReadabilityMessages } from '../../../i18n/hexReadability';
import { useFmt } from '../../../fmt';
import { hexFactory, type HexReference, type HexSupplyReference } from './hexModel';
import { mapDeliveryEstimate } from './mapDeliveryModel';

/** One origin → destination scenario. Real land/factory actions stay in their existing sheet. */
export function MapScenarioSheet({ view, reference, supplyReference, delivery = false, selectedId, originAction, children }: {
  view: PlayerView; reference: HexReference | null; supplyReference: HexSupplyReference | null;
  delivery?: boolean; selectedId: string; originAction?: ReactNode; children: ReactNode;
}) {
  const text = hexReadabilityMessages(useUiLang());
  const roomLang = useRoomLang();
  const content = useContent();
  const fmt = useFmt();
  if (!delivery) return children;
  const estimate = mapDeliveryEstimate(view, reference, supplyReference, selectedId);
  if (!estimate) return children;
  const place = (id: string) => hexPlaceLabel(id, roomLang, view.siteSlots);
  const money = (value: number | null) => value === null ? '—' : fmt.lotPrice(value);
  const city = estimate.city ? content.mapNames.cities[estimate.city] : null;
  const factory = hexFactory(view, selectedId);
  const deposit = hexById(selectedId)?.deposit;
  const operatorId = deposit ? view.siteSlots.find((slot) => slot.id === deposit)?.companyId : null;
  const owner = factory?.company ?? view.companies.find((company) => company.id === operatorId && company.status === 'active');
  const showFactory = Boolean(factory?.mine && factory.product);
  // At the origin the existing cell sheet gives the whole-market factory forecast, not a zero-distance delivery.
  if (!supplyReference && selectedId === estimate.originId) return <>{originAction && <div className="hx-origin-action">{originAction}</div>}{children}</>;
  const scenario = <section className="hx-cell-sheet hx-scenario-sheet" data-hex-sheet={showFactory ? undefined : selectedId}>
    <div aria-live="polite">
      <h3>{text.theoretical}</h3>
      <p>{text.origin} : <strong>{place(estimate.originId)}</strong></p>
      <p>{text.destination} : <strong>{place(selectedId)}</strong></p>
      {owner && <p className="hx-sheet-status"><span className="hx-owner-dot" style={{ backgroundColor: owner.color }} aria-hidden="true" />{text.territoryOwner} : <strong>{owner.name}</strong></p>}
      {city && <p>{text.servedMarket} : <strong>{city}</strong></p>}
      {estimate.recipientSector && <p>{text.recipient} : <strong>{content.sectors[estimate.recipientSector].name}</strong></p>}
      <dl className="hx-sheet-numbers hx-scenario-numbers">
        {view.hexes?.populationShare?.[selectedId] !== undefined && <><dt>{text.population}</dt><dd>{fmt.pct(view.hexes.populationShare[selectedId], 2)}</dd></>}
        <dt>{supplyReference ? text.supplyFreight : text.deliveryTransport}</dt><dd>{money(estimate.transport)}</dd>
        <dt>{supplyReference ? text.supplyDemand : text.marketDemand}</dt><dd>{estimate.demand === null ? '—' : fmt.lots(estimate.demand, 3)}</dd>
        <dt>{supplyReference ? text.supplyMargin : text.deliveryMargin}</dt><dd>{money(estimate.margin)}</dd>
      </dl>
      {estimate.totalDemand !== undefined && <p className="hx-sheet-note">{text.totalDemand} : <strong>{fmt.lots(estimate.totalDemand, 3)}</strong></p>}
      <p className="hx-sheet-note">{supplyReference ? text.supplyOnly : text.theoreticalOnly}</p>
      {!supplyReference && <p className="hx-sheet-note">{text.marketBasis}</p>}
    </div>
    {!showFactory && originAction && <div className="hx-origin-action">{originAction}</div>}
    {!showFactory && <details><summary>{text.actualPlace}</summary>{children}</details>}
  </section>;
  // Clicking a controlled plant shows its real whole-market activity first, independently of the delivery reference.
  return showFactory ? <div className="hx-factory-scenario">{children}{originAction && <div className="hx-origin-action">{originAction}</div>}<details className="hx-target-scenario" key={selectedId}><summary>{text.theoretical}</summary>{scenario}</details></div> : scenario;
}
