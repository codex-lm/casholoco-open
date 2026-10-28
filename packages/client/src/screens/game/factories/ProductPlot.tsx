/**
 * Fiche illustrée d'un de mes produits (onglet « La carte » : vue « Mes usines », et fiches du produit) :
 * scène 2D, pictogrammes offre / demande, verdict, réglettes face aux concurrents, foule des parts de marché.
 */
import type { CompanyView, ProductView } from '@muchomoney/core';
import { SECTORS } from '@muchomoney/core';
import { useGame } from '../../../hooks/useGame';
import { SignedMoney } from '../../../components/bits';
import { nextBrand, nextQuality } from '../../../rules';
import { cx } from '../../../util';
import { useContent, useT } from '../../../i18n';
import { Rich } from '../../../i18n/Rich';
import { useFmt } from '../../../fmt';
import {
  demandSegments,
  productFlow,
  rankAmong,
  sectorProducts,
  shareCrowd,
  supplySegments,
  type FlowStatus,
} from './model';
import { PlotScene } from './PlotScene';
import { Crowd, PictoIcon, PictoRow, PinIcon, Strip, type StripDot } from './Pictograms';
import { useSceneProps } from './useSceneProps';
import { productLocation } from '../productLocation';
import { FreightDetails } from '../../../components/FreightDetails';
import { currentProductFreight } from '../city/freight';

export const STATUS_TONE: Record<FlowStatus, string> = {
  building: 'info',
  idle: 'down',
  shortage: 'warn',
  surplus: 'warn',
  balanced: 'up',
  unknown: 'info',
};

export function ProductPlot({ company, product, still, onSettings, onExpand, onMap }: { company: CompanyView; product: ProductView; still: boolean; onSettings: () => void; onExpand: () => void; onMap?: () => void }) {
  const { view, sectorsById, refPrice } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const sectorLabel = content.sectors[product.sectorId];
  const mapNames = content.mapNames;
  // Zone de l'usine (§5.8) : absente de la vue = la capitale ; celle d'une ville porte le nom de sa ville.
  const zoneName = productLocation(view, product, mapNames, t.hex);
  const priv = product.private;
  const sectorId = product.sectorId;
  const sector = sectorsById.get(sectorId);
  const def = SECTORS[sectorId];
  const isCrypto = sectorId === 'crypto';
  const flow = productFlow(product);
  const ref = refPrice(sectorId);
  const marketing = priv?.marketing ?? 0;
  const rnd = priv?.rnd ?? 0;
  const status = t.factories.status[flow.status];
  const openDate = fmt.date(product.firstSalesTurn ?? view.turn + 1, view.config.startYear);
  // La scène (modèle, bulles d'aide, nom) : la même que la miniature de la colonne de gauche du plateau.
  const scene = useSceneProps(company, product);

  const lots = (n: number) => fmt.lots(Math.round(n));

  // Offre et demande sur la même échelle.
  const supply = supplySegments(flow);
  const demand = demandSegments(flow);
  const slots = Math.max(supply.at(-1)?.to ?? 0, demand.at(-1)?.to ?? 0, 1);
  const marker = flow.demand !== null && flow.status !== 'building' ? flow.available / flow.unit : undefined;

  const verdict =
    flow.status === 'building'
      ? t.factories.verdict.building(openDate)
      : flow.status === 'idle'
        ? t.factories.verdict.idle
        : flow.status === 'shortage'
          ? t.factories.verdict.shortage(lots(flow.shortage))
          : flow.status === 'surplus'
            ? t.factories.verdict.surplus(lots(flow.surplus), lots(flow.spoiled))
            : flow.status === 'balanced'
              ? t.factories.verdict.balanced(lots(flow.sales ?? 0))
              : t.factories.verdict.unknown;

  // Face aux concurrents : produits en rayon du secteur (ce produit compris, même s'il ouvre au prochain trimestre).
  const field = sectorProducts(view.companies, sectorId).filter((r) => r.product.id !== product.id);
  const dots = (value: (p: ProductView) => number, show: (v: number) => string): StripDot[] => [
    ...field.map((r) => ({
      key: r.product.id,
      value: value(r.product),
      color: r.company.color,
      title: t.factories.dotTitle(r.product.name, r.company.ticker, show(value(r.product))),
      focus: false,
    })),
    { key: product.id, value: value(product), color: company.color, title: t.factories.dotTitle(product.name, company.ticker, show(value(product))), focus: true },
  ];
  const brandNext = nextBrand(sectorId, product.brand, marketing, product.private?.market?.marketingMultiplier);
  const qualityNext = nextQuality(sectorId, product.quality, rnd, product.private?.market?.rndMultiplier);
  const total = field.length + 1;
  const rank = (mine: number, get: (p: ProductView) => number) =>
    total > 1 ? ` · ${t.factories.rank(rankAmong(mine, field.map((r) => get(r.product))), total)}` : '';

  const crowd = shareCrowd(sector, view.companies, product.id, view.you);
  const estimate = priv?.estimate;

  return (
    <article id={`factory-${product.id}`} tabIndex={-1} className={cx('plot', `plot-${flow.status}`)}>
      <header className="plot-head">
        <div>
          <strong className="plot-name">
            <span aria-hidden>{def?.emoji ?? '📦'}</span> {product.name}
          </strong>
          <div className="small muted">{sectorLabel?.name ?? sectorId}</div>
          <div className="small muted">
            <PinIcon label={t.factories.zoneAria(zoneName)} /> {zoneName}
          </div>
        </div>
        <span className={cx('plot-status', STATUS_TONE[flow.status])}>{status}</span>
      </header>

      <PlotScene {...scene} still={still} />

      <div className="plot-body">
        <div className="picto-block">
          <div className="picto-head">
            <span className="picto-label">{t.factories.supplyLabel}</span>
            <span className="small">
              {flow.status === 'building' ? (
                t.factories.supplyBuilding(lots(flow.pending), lots(flow.requested))
              ) : (
                <>
                  <Rich text={t.factories.supply(lots(flow.stock), lots(flow.planned), lots(flow.available), lots(flow.capacity))} />
                  {flow.pending > 0 && flow.capacity > 0 && t.factories.pending(lots(flow.pending))}
                </>
              )}
            </span>
          </div>
          <PictoRow segments={supply} shape="crate" color={company.color} slots={slots} marker={marker} label={t.factories.supplyLabel} />
          {flow.demand !== null && (
            <>
              <div className="picto-head">
                <span className="picto-label">{t.factories.demandLabel}</span>
                <span className="small">
                  <Rich text={t.factories.demand(lots(flow.demand), fmt.money(product.price))} />
                </span>
              </div>
              <PictoRow segments={demand} shape="person" color={company.color} slots={slots} marker={marker} label={t.factories.demandLabel} />
            </>
          )}
          <div className="picto-legend small muted">
            <span>{t.factories.unit(lots(flow.unit))}</span>
            <span><PictoIcon kind="stock" shape="crate" /> {t.product.stock}</span>
            <span style={{ ['--made' as string]: company.color }}><PictoIcon kind="made" shape="crate" /> {isCrypto ? t.product.computeOutput : t.product.production}</span>
            <span><PictoIcon kind="spare" shape="crate" /> {isCrypto ? t.product.computeCapacity : t.product.capacity}</span>
            {flow.pending > 0 && <span><PictoIcon kind="pending" shape="crate" /> {t.factories.status.building}</span>}
            {flow.demand !== null && <span><PictoIcon kind="served" shape="person" /> {t.factories.demandLabel}</span>}
            {flow.shortage > 0 && <span><PictoIcon kind="unserved" shape="person" /> {t.factories.status.shortage}</span>}
            {flow.surplus > 0 && <span className="pk-unsold-legend" style={{ ['--made' as string]: company.color }}><PictoIcon kind="made" shape="crate" /> {t.factories.status.surplus}</span>}
          </div>
        </div>

        <p className={cx('plot-verdict', STATUS_TONE[flow.status])}>{verdict}</p>
        {estimate && flow.status !== 'building' && (
          <>
            <p className="small">
              {t.factories.balance} <SignedMoney value={estimate.margin} />
            </p>
            <p className="small muted">{t.factories.estimateNote}</p>
          </>
        )}
        {priv && <FreightDetails view={view} freight={currentProductFreight(view, company, product)} />}
        {product.lastSales > 0 && priv && <p className="small muted">{t.factories.lastQuarter(lots(product.lastSales), lots(priv.lastProduced))}</p>}

        <div className="strips">
          <div className="strips-title small muted">
            {t.factories.strips} <span className="strips-hint">· {t.factories.stripsHint}</span>
          </div>
          <div className="strip-row">
            <span className="strip-label">{t.factories.brand}</span>
            <Strip dots={dots((p) => p.brand, fmt.num)} next={brandNext} label={t.factories.brand} />
            <span className="strip-value small">
              {t.factories.move(fmt.num(product.brand), fmt.num(brandNext))}
              {rank(product.brand, (p) => p.brand)}
            </span>
          </div>
          <div className="strip-row">
            <span className="strip-label">{t.factories.quality}</span>
            <Strip dots={dots((p) => p.quality, fmt.num)} next={qualityNext} label={t.factories.quality} />
            <span className="strip-value small">
              {t.factories.move(fmt.num(product.quality), fmt.num(qualityNext))}
              {rank(product.quality, (p) => p.quality)}
            </span>
          </div>
          <div className="strip-row">
            <span className="strip-label">{t.factories.price}</span>
            <Strip dots={dots((p) => p.price, fmt.money)} label={t.factories.price} />
            <span className="strip-value small">{t.factories.priceRef(fmt.money(product.price), fmt.money(ref))}</span>
          </div>
        </div>

        <div className="crowd-block">
          {crowd.length > 0 ? (
            <>
              <div className="small">
                {product.comingSoon ? t.factories.shareSoon : t.factories.share(fmt.pct(product.lastMarketShare, 0))}{' '}
                <span className="muted">· {t.factories.shareUnit}</span>
              </div>
              <Crowd groups={crowd} label={t.factories.share(fmt.pct(product.lastMarketShare, 0))} />
            </>
          ) : (
            <p className="small muted">{t.factories.noShareYet}</p>
          )}
        </div>
      </div>

      <footer className="plot-actions">
        <button type="button" className="btn primary" onClick={onSettings}>
          {t.factories.settings}
        </button>
        <button type="button" className="btn ghost" onClick={onExpand}>
          {isCrypto ? t.product.expandServers : t.product.expand}
        </button>
        {onMap && <button type="button" className="btn ghost" onClick={onMap}>{t.factories.onMap}</button>}
      </footer>
    </article>
  );
}
