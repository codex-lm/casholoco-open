import { CITIES } from '@muchomoney/core';
import { useContent, useUiLang } from '../../../../i18n';
import { useFmt } from '../../../../fmt';
import { isometricMessages } from '../../../../i18n/isometric';
import { mapFlowText } from '../../../../i18n/mapFlows';
import type { FlowModel } from '../mapFlows';

/** Published sales of the tracked own product. Never spread a national total over invented cities. */
export function islandSalesFigures(model: FlowModel | null | undefined) {
  return model?.sales.filter(sale => sale.productId === model.selectedProductId && sale.mine
    && Number.isFinite(sale.sold) && sale.sold > 0 && (sale.national || (sale.cityId && CITIES[sale.cityId]))) ?? [];
}

/** The projected labels have this ordinary HTML equivalent, including when they cannot fit on the map. */
export function IslandSalesFigures({ model, startYear }: { model: FlowModel; startYear: number }) {
  const ui = isometricMessages(useUiLang()), text = mapFlowText(useUiLang()), content = useContent(), fmt = useFmt();
  const factory = model.production.find(item => item.productId === model.selectedProductId && item.mine);
  if (!factory) return null;
  const sales = islandSalesFigures(model);
  const turn = sales[0]?.turn;
  const dated = turn !== undefined && sales.every(sale => sale.turn === turn);
  return <section className="iso-sales-readout" aria-label={ui.sales}>
    <p><strong>{factory.name}</strong><span>{ui.sales}{dated && ` · ${fmt.date(turn, startYear)}`}</span></p>
    {sales.length ? <ul>{sales.map(sale => <li key={sale.id}>
      <span>{sale.national ? text.national : content.mapNames.cities[sale.cityId!]}</span>
      <strong>{text.lots(fmt.num(sale.sold), Math.round(sale.sold * 100) / 100)}</strong>
    </li>)}</ul> : <p>{text.noSales}</p>}
    {factory.intangible && <p className="iso-sales-note">{text.intangible}</p>}
  </section>;
}
