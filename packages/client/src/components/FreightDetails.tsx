import { useId } from 'react';
import { COMMODITIES, SECTORS, TRANSPORT_COST_PER_KM, type CommodityId, type PlayerView } from '@muchomoney/core';
import { useContent, useUiLang } from '../i18n';
import { freightMessages } from '../i18n/freight';
import { useFmt } from '../fmt';
import type { FreightBreakdown } from '../screens/game/city/freight';
import './FreightDetails.css';

/** The same two absolute, per-produced-lot costs in every decision screen. Native disclosures support Enter/Space. */
export function FreightDetails({ view, freight }: { view: PlayerView; freight: FreightBreakdown }) {
  const fmt = useFmt();
  const content = useContent();
  const text = freightMessages(useUiLang());
  const id = useId();
  const def = SECTORS[freight.sectorId];
  const materialRows = (Object.entries(def.inputs) as [CommodityId, number][]).filter(([, per]) => per > 0).map(([cid, per]) => ({
    cid, per, name: content.commodities[cid].name, weight: COMMODITIES[cid].freightWeight,
    legs: freight.materials.filter((leg) => leg.commodityId === cid),
  }));
  const sourceName = (siteId?: string) => siteId ? text.site(view.siteSlots.find((s) => s.id === siteId)?.name ?? siteId) : text.port;
  const lotCost = (cost: number) => text.lotValue(fmt.lotPrice(cost, 2));
  const factor = freight.transportFactor ?? view.transportFactor ?? 1;
  // Ce que coûte un lot de matière amené de cette source à l'usine, avant de le pondérer par sa part et par la recette.
  const materialLot = (weight: number, km: number) => text.cityLot(fmt.lotPrice(TRANSPORT_COST_PER_KM * weight * km * factor, 2), text.km(fmt.fixed(km, 1)));
  const materialLegs = materialRows.flatMap((row) => row.legs.map((leg, i) => ({ row, leg, key: `${row.cid}:${leg.siteId ?? 'port'}:${i}` })));
  const materialsTip = freight.intangible ? text.intangible : materialLegs.map(({ row, leg }) =>
    `${text.materialSource(row.name, sourceName(leg.siteId))}${text.sep}${materialLot(row.weight, leg.km)} × ${fmt.pct(leg.lots / row.per, 0)} × ${fmt.num(row.per)} = ${lotCost(leg.cost)}`).join('\n');
  // Ce que coûte un lot livré dans cette ville, avant de le pondérer par sa part des ventes.
  const cityLot = (km: number) => text.cityLot(fmt.lotPrice(TRANSPORT_COST_PER_KM * def.freightWeight * km * factor, 2), text.km(fmt.fixed(km, 1)));
  const deliveryTip = freight.intangible ? text.intangible : freight.delivery.map((leg) =>
    `${content.mapNames.cities[leg.city]}${text.sep}${cityLot(leg.km)} × ${fmt.pct(leg.share, 1)} = ${lotCost(leg.cost)}`).join('\n');
  const footer = <p className="freight-footer">{text.rate(fmt.fixed(TRANSPORT_COST_PER_KM, 4), fmt.unit)} · {text.productWeight(fmt.num(def.freightWeight))}
    {factor !== 1 && <> · {text.newsFactor(fmt.num(factor))}</>}
    <br />{text.weightedKm}</p>;
  return <div className="freight-details" data-freight-details>
    <details className="freight-line" data-freight-kind="materials">
      <summary aria-describedby={`${id}-materials`}><span>{text.materialsLabel}</span><strong>{text.lotValue(fmt.lotPrice(freight.materialsCost))}</strong>
        <span className="freight-tooltip" role="tooltip" id={`${id}-materials`}>{materialsTip || text.noMaterials}</span>
      </summary>
      <div className="freight-body">
        {freight.intangible ? <p className="small">{text.intangible}</p> : <div className="freight-table-scroll"><table className="freight-detail-table">
          <thead><tr><th scope="col">{text.commodity}</th><th scope="col">{text.materialLotCost}</th><th scope="col">{text.sourceShare}</th><th scope="col">{text.recipe}</th><th scope="col">{text.weightedCost}</th></tr></thead>
          <tbody>{materialLegs.map(({ row, leg, key }) => <tr key={key}>
            <th scope="row">{text.materialSource(row.name, sourceName(leg.siteId))}</th><td>{materialLot(row.weight, leg.km)}</td>
            <td>{fmt.pct(leg.lots / row.per, 1)}</td><td>{fmt.num(row.per)}</td><td>{lotCost(leg.cost)}</td>
          </tr>)}</tbody>
          <tfoot><tr><th scope="row" colSpan={4}>{text.totalMaterials}</th><td>{lotCost(freight.materialsCost)}</td></tr></tfoot>
        </table></div>}
        {footer}
      </div>
    </details>
    <details className="freight-line" data-freight-kind="delivery">
      <summary aria-describedby={`${id}-delivery`}><span>{text.deliveryLabel}</span><strong>{text.lotValue(fmt.lotPrice(freight.deliveryCost))}</strong>
        <span className="freight-tooltip" role="tooltip" id={`${id}-delivery`}>{deliveryTip || text.intangible}</span>
      </summary>
      <div className="freight-body">
        {freight.intangible ? <p className="small">{text.intangible}</p> : <div className="freight-table-scroll"><table className="freight-detail-table">
          <thead><tr><th scope="col">{text.city}</th><th scope="col">{text.cityLotCost}</th><th scope="col">{text.salesShare}</th><th scope="col">{text.weightedCost}</th></tr></thead>
          <tbody>{freight.delivery.map((leg) => <tr key={leg.city}><th scope="row">{content.mapNames.cities[leg.city]}</th><td>{cityLot(leg.km)}</td><td>{fmt.pct(leg.share, 1)}</td><td>{lotCost(leg.cost)}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row" colSpan={3}>{text.totalDelivery}</th><td>{lotCost(freight.deliveryCost)}</td></tr></tfoot>
        </table></div>}
        {footer}
      </div>
    </details>
  </div>;
}
