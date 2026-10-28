/**
 * Ce que la scène d'un de mes produits dessine (modèle, bulles d'aide, nom accessible), partagé par la fiche illustrée
 * de « Mes usines » et la miniature fixe de la colonne de gauche du plateau : la même lecture des mêmes chiffres.
 */
import { SECTORS, type CompanyView, type PlayerView, type ProductView, type SectorId } from '@muchomoney/core';
import { useGame } from '../../../hooks/useGame';
import { useT } from '../../../i18n';
import { useFmt } from '../../../fmt';
import { adSpots, billboardTier, labLevel, productFlow, researchers } from './model';
import type { SceneModel, SceneTexts } from './PlotScene';

export interface SceneProps {
  model: SceneModel;
  texts: SceneTexts;
  ariaLabel: string;
}

/** Prix de référence du secteur, comme `useGame().refPrice` (lu ici dans la vue : la miniature ne dépend que d'elle). */
export function refPrice(view: Pick<PlayerView, 'sectors'>, sectorId: SectorId): number {
  return view.sectors.find((s) => s.id === sectorId)?.refPrice ?? SECTORS[sectorId]?.refPrice ?? 100;
}

export function useSceneProps(company: CompanyView, product: ProductView): SceneProps {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const priv = product.private;
  const sectorId = product.sectorId;
  const flow = productFlow(product);
  const marketing = priv?.marketing ?? 0;
  const rnd = priv?.rnd ?? 0;
  const team = researchers(rnd, sectorId);
  const status = t.factories.status[flow.status];
  const openDate = fmt.date(product.firstSalesTurn ?? view.turn + 1, view.config.startYear);
  const model: SceneModel = {
    sectorId,
    color: company.color,
    flow,
    lab: labLevel(product.quality),
    researchers: team,
    billboard: billboardTier(product.brand),
    spots: adSpots(marketing, sectorId),
    productName: product.name,
    priceLabel: fmt.money(product.price),
    greenwashing: company.private?.modifiers.some((m) => m.kind === 'greenwashing' && m.turnsLeft > 0) ?? false,
  };
  const lots = (n: number) => fmt.lots(Math.round(n));
  const tips = {
    lab: t.factories.tips.lab(fmt.num(product.quality), fmt.money(rnd), team),
    factory: t.factories.tips.factory(lots(flow.capacity || flow.pending), lots(flow.planned)),
    crane: flow.pending > 0 ? t.factories.tips.crane(lots(flow.pending)) : undefined,
    stock: t.factories.tips.stock(lots(flow.stock), fmt.pct(flow.perishability, 0)),
    shop: t.factories.tips.shop(fmt.money(product.price), fmt.money(refPrice(view, sectorId))),
    billboard: t.factories.tips.billboard(fmt.num(product.brand), fmt.money(marketing)),
    walkers: flow.demand !== null ? t.factories.tips.walkers(lots(flow.demand), lots(flow.sales ?? 0)) : undefined,
  };
  return {
    model,
    texts: { closed: t.factories.closed, opening: t.factories.opening(openDate), tips },
    ariaLabel: t.factories.sceneAria(product.name, status),
  };
}
