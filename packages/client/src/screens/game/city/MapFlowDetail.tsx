import { useContent, useUiLang } from '../../../i18n';
import { mapFlowText } from '../../../i18n/mapFlows';
import { useFmt } from '../../../fmt';
import type { FlowMode, FlowModel } from './mapFlows';
import './mapFlows.css';

export interface MapFlowDetailProps {
  model: FlowModel;
  mode: FlowMode;
  /** null = exploration sans produit ; absent = sélection du modèle. */
  productId?: string | null;
  onOpenFactory?: (companyId: string, productId: string) => void;
  onOpenMaterials?: (companyId: string, productId: string) => void;
  onOpenReport?: (companyId: string, productId: string) => void;
  /**
   * Inside the tracked product's card (hex board's left column): the card already names the product and its sector,
   * says its verdict and opens « Mes usines », so the detail keeps only the layer's own lists (none in production mode).
   */
  compact?: boolean;
}

/** Les chiffres privés viennent du modèle redigé ; aucun volume n'est attribué à une route de matière. */
export function MapFlowDetail({ model, mode, productId, onOpenFactory, onOpenMaterials, onOpenReport, compact = false }: MapFlowDetailProps) {
  const text = mapFlowText(useUiLang());
  const content = useContent();
  const fmt = useFmt();
  if (mode === 'off' || (compact && mode === 'production')) return null;
  // L'accord suit la quantité arrondie comme l'affichage (deux décimales au plus).
  const lots = (value: number) => text.lots(fmt.num(value), Math.round(value * 100) / 100);
  const selectedProductId = productId === undefined ? model.selectedProductId : productId;
  const factory = selectedProductId === null ? undefined : model.production.find((flow) => flow.productId === selectedProductId);
  if (!factory) return <aside className="map-flow-detail" aria-label={text.detail}><p className="map-flow-caption">{text.noProduct}</p></aside>;
  const inputs = model.supply.filter((flow) => flow.productId === factory.productId);
  const sales = model.sales.filter((flow) => flow.productId === factory.productId);
  const hasFerry = mode === 'supply' ? inputs.some((input) => input.sources.some((source) => source.route?.segments.some((segment) => segment.kind === 'ferry')))
    : mode === 'sales' && sales.some((sale) => sale.route?.segments.some((segment) => segment.kind === 'ferry'));
  const quantity = (value: number | null) => value === null ? '—' : lots(value);
  return <aside className={compact ? 'map-flow-detail map-flow-detail-compact' : 'map-flow-detail'} aria-label={text.detail}>
    {!compact && <>
      <h3>{factory.name}</h3>
      <p className="map-flow-caption">{factory.companyName} · {content.sectors[factory.sectorId].name}</p>
    </>}
    {mode !== 'sales' && !factory.mine ? <p className="map-flow-caption">{text.rivalPrivate}</p> : <>
      {mode === 'production' && <>
        <dl className="map-flow-numbers">
          <dt>{text.planned}</dt><dd>{quantity(factory.planned)}</dd>
          <dt>{text.stock}</dt><dd>{quantity(factory.stock)}</dd>
          <dt>{text.demand}</dt><dd>{quantity(factory.demand)}</dd>
          <dt>{text.forecast}</dt><dd>{quantity(factory.estimatedSales)}</dd>
          <dt>{text.surplus}</dt><dd>{quantity(factory.surplus)}</dd>
        </dl>
        <p className="map-flow-caption">{text.estimateNote}</p>
      </>}
      {mode === 'supply' && <>
        {inputs.length === 0 && <p className="map-flow-caption">{text.noInputs}</p>}
        {inputs.map((input) => <section className="map-flow-material" key={input.id}>
          <h4>{content.commodities[input.commodityId].emoji} {content.commodities[input.commodityId].name}</h4>
          <dl className="map-flow-numbers">
            <dt>{text.needs}</dt><dd>{lots(input.need)}</dd>
            <dt>{text.companyNeeds}</dt><dd>{lots(input.companyNeed)}</dd>
            <dt>{text.companyStock}</dt><dd>{lots(input.stock)}</dd>
            <dt>{text.companyMissing}</dt><dd>{quantity(input.missing)}</dd>
          </dl>
          <details className="map-flow-source-list">
            <summary>{text.possibleSources} ({input.sources.length})</summary>
            {input.sources.length > 0 ? <ul className="map-flow-sources">{input.sources.map((source) => <li key={source.id}>
              {source.type === 'port' ? content.mapNames.cities.capital : source.name ?? source.id} · {source.type === 'port' ? text.port : text.deposit}
              {source.route && <> · {text.distance(fmt.num(source.route.km))}</>}
              {source.capacity !== undefined && <> · {text.capacity.toLowerCase()} {lots(source.capacity)}</>}
              {source.availableCapacity !== undefined && source.availableCapacity !== source.capacity && <> · {text.availableCapacity.toLowerCase()} {lots(source.availableCapacity)}</>}
            </li>)}</ul> : <p className="map-flow-caption">{text.noSources}</p>}
            <p className="map-flow-caption">{text.sourceNote}</p>
          </details>
        </section>)}
        {inputs.length > 0 && <p className="map-flow-caption">{text.sharedStock}</p>}
      </>}
      {mode === 'sales' && <>
        <dl className="map-flow-numbers"><dt>{text.actualSales}</dt><dd>{lots(factory.lastSold)}</dd></dl>
        {sales.some((sale) => sale.sold > 0) ? <ul className="map-flow-sources">{sales.filter((sale) => sale.sold > 0).map((sale) => <li key={sale.id}>
          {sale.national ? text.national : sale.cityId ? content.mapNames.cities[sale.cityId] : sale.name} · {lots(sale.sold)}
        </li>)}</ul> : <p className="map-flow-caption">{text.noSales}</p>}
        <p className="map-flow-caption">{text.salesNote}</p>
        {sales.some((sale) => !sale.originKnown && sale.sold > 0) && <p className="map-flow-caption">{text.salesOriginMissing}</p>}
      </>}
    </>}
    {factory.intangible && mode !== 'production' && <p className="map-flow-caption">{text.intangible}</p>}
    {hasFerry && <p className="map-flow-caption">{text.ferryNote}</p>}
    <div className="map-flow-actions">
      {factory.mine && onOpenFactory && !compact && <button type="button" className="btn tiny" onClick={() => onOpenFactory(factory.companyId, factory.productId)}>{text.factories}</button>}
      {factory.mine && onOpenMaterials && <button type="button" className="btn tiny ghost" onClick={() => onOpenMaterials(factory.companyId, factory.productId)}>{text.materials}</button>}
      {onOpenReport && <button type="button" className="btn tiny ghost" onClick={() => onOpenReport(factory.companyId, factory.productId)}>{text.report}</button>}
    </div>
  </aside>;
}
