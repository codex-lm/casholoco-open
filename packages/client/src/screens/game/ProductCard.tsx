import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CompanyView, ProductView } from '@muchomoney/core';
import { CITY_IDS, SECTORS, cityWeights, estimateSales } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useGame } from '../../hooks/useGame';
import { NumberField } from '../../components/NumberField';
import { ConfirmModal } from '../../components/Modal';
import { ExpandCapacityModal } from './ExpandCapacityModal';
import { InfoTip, SignedMoney } from '../../components/bits';
import { EMERGENCY_PURCHASE_MARKUP, HQ_COST, PRICE_MAX_PCT, PRICE_MIN_PCT, PRODUCTION_MAX_FACTOR, marketSize, nextBrand, nextQuality } from '../../rules';
import { cx } from '../../util';
import { useContent, useT, useUiLang } from '../../i18n';
import { industryMessages } from '../../i18n/industry';
import { Rich } from '../../i18n/Rich';
import { useFmt } from '../../fmt';
import { productLocation } from './productLocation';
import { useApp } from '../../store';
import { ProductSaver, orphanSaver, sameSettings, settingsOf, turnStartOf, type ProductSettings, type SaveStatus, type SettingField } from '../../productSaves';
import { productFlow, rankAmong, sectorProducts, type FlowStatus } from './factories/model';
import { Strip, type StripDot } from './factories/Pictograms';
import { STATUS_TONE } from './factories/ProductPlot';
import { FreightDetails } from '../../components/FreightDetails';
import { currentProductFreight } from './city/freight';

/**
 * Fiche d'un produit dirigé : réglages enregistrés au relâcher, une seule prévision (§5.2), verdict de l'offre face à
 * la demande et rangs face aux rivaux. `wide` (une ou deux fiches dans « Mon entreprise ») la met sur toute la largeur,
 * en deux colonnes : nom, chiffres et réglages à gauche ; verdict, prévision, rivaux, alertes et boutons à droite.
 */
export function ProductCard({ company, product, onMove, wide = false }: { company: CompanyView; product: ProductView; onMove?: (productId: string) => void; wide?: boolean }) {
  const { refPrice, view } = useGame();
  const t = useT();
  const industry = industryMessages(useUiLang());
  const fmt = useFmt();
  const sectorLabel = useContent().sectors[product.sectorId];
  const mapNames = useContent().mapNames;
  const ref = refPrice(product.sectorId);
  const sector = SECTORS[product.sectorId];
  const isCrypto = product.sectorId === 'crypto';
  const priv = product.private;

  const server = settingsOf(product);
  const serverKey = `${server.price}|${server.production}|${server.marketing}|${server.rnd}`;
  const [modal, setModal] = useState<'expand' | 'stop' | null>(null);
  const room = useApp((s) => s.session?.roomCode ?? 'local');
  // Pas de bouton « Appliquer » : chaque réglage s'enregistre au relâcher (voir productSaves.ts), sans toast de succès.
  // Une fiche refermée sur un échec est reprise telle quelle (brouillon et « Réessayer »).
  const [saver] = useState(() => {
    const place = { room, companyId: company.id, productId: product.id, name: product.name };
    return orphanSaver(place) ?? new ProductSaver(server, (v) =>
      sendAction(
        { type: 'setProductDecisions', companyId: company.id, productId: product.id, price: v.price, production: Math.round(v.production), marketing: v.marketing, rnd: v.rnd },
        { quiet: true },
      ), place);
  });
  const { draft, status, adjusted } = useSyncExternalStore(saver.subscribe, saver.getSnapshot, saver.getSnapshot);
  // Nouveau trimestre : « Enregistré ✓ » et la ligne des bornes ne valent plus.
  useEffect(() => saver.startTurn(view.turn), [view.turn]);
  // Nouvelle valeur serveur : adoptée, sauf sur un champ que le joueur est en train de régler.
  useEffect(() => saver.receiveServer(server), [serverKey]);
  // « Je suis prêt » attend les enregistrements de la fiche ; la refermer (onglet, fenêtre) enregistre ce qui attend.
  useEffect(() => saver.attach(), [saver]);
  const turnStart = useApp((s) => turnStartOf(s.turnStart, room, view.turn, company.id, product.id));
  const set = (patch: Partial<typeof draft>) => saver.edit(patch);
  const commit = (when: 'now' | 'soon') => saver.commit(when);

  const unitCost = priv?.estimatedUnitCost ?? priv?.lastUnitCost ?? 0;
  const producible = Math.min(Math.round(draft.production), product.capacity);
  const sellable = producible + (priv?.stock ?? 0);
  const margin = draft.price - unitCost;
  const size = marketSize(product.sectorId);
  const budgetMax = Math.max(size * 0.1, draft.marketing * 1.5, draft.rnd * 1.5, 100);
  const qNext = nextQuality(product.sectorId, product.quality, draft.rnd, product.private?.market?.rndMultiplier);
  const bNext = nextBrand(product.sectorId, product.brand, draft.marketing, product.private?.market?.marketingMultiplier);
  // Produit lancé ce trimestre : capacité livrée à la clôture ; le moteur accepte déjà la production du trimestre suivant.
  const comingSoon = product.comingSoon === true;
  const lastReport = company.reports.at(-1);
  const lastProductReport = lastReport?.products.find((p) => p.productId === product.id);
  const installationReport = product.firstSalesTurn !== undefined &&
    lastReport?.turn === product.firstSalesTurn - 1 && lastProductReport?.produced === 0 && lastProductReport.sold === 0;
  const prodCapacity = comingSoon ? product.capacity + (priv?.pendingCapacity ?? 0) : product.capacity;
  // Aide débutant (§5.2) : ventes et marge estimées aux réglages en cours d'édition.
  const decisions = (production: number) => ({
    quality: product.quality,
    brand: product.brand,
    price: draft.price,
    production,
    capacity: product.capacity,
    stock: priv?.stock ?? 0,
    marketing: draft.marketing,
    rnd: draft.rnd,
  });
  const estimate = priv?.market && !comingSoon ? estimateSales(product.sectorId, priv.market, decisions(Math.round(draft.production))) : null;
  // Décomposition de la formule existante d'estimateSales, sans frais de siège ni charges d'entreprise.
  const estimateProduced = Math.max(0, Math.floor(Math.min(Math.max(0, Math.round(draft.production)), Math.max(0, product.capacity))));
  const productionCost = estimateProduced * (priv?.market?.unitCost ?? unitCost);
  // « Si tout se vend » : même base que la prévision (sans le siège), les deux ne diffèrent que des lots invendus.
  const unsold = estimate ? Math.max(0, sellable - estimate.sales) : 0;
  const ifAllSells = estimate ? estimate.margin + draft.price * unsold : 0;
  // Quote-part du siège : convention d'affichage (siège ÷ nombre de produits), seulement dans le détail.
  const hqShare = HQ_COST / Math.max(1, company.products.length);
  const budgetShare = priv?.market?.budgetShare ?? 1;
  const budgetPayer = product.factoryProductId ? company.products.find(p => p.factoryProductId === product.factoryProductId && p.private?.market?.budgetShare === 1) : undefined;
  // Verdict de l'offre face à la demande, comme « Mes usines », mais sur les réglages à l'écran (ceux de la prévision).
  const flow = productFlow(priv ? { ...product, private: { ...priv, production: Math.round(draft.production), estimate: estimate ?? undefined } } : product);
  const lots = (n: number) => fmt.lots(Math.round(n));
  const verdict = flowVerdict(flow.status, t.factories.verdict, lots(flow.shortage), lots(flow.surplus), lots(flow.spoiled), lots(flow.sales ?? 0));
  // « Caler sur la demande » : demande estimée au prix à l'écran, une offre supposée (sans elle, le moteur n'en prête
  // aucune au produit), moins le stock, dans la limite de la capacité. Un réglage comme un autre : enregistré au clic.
  const capacityLots = Math.max(0, Math.floor(product.capacity));
  const demand = priv?.market && !comingSoon && capacityLots >= 1
    ? estimateSales(product.sectorId, priv.market, decisions(Math.max(1, Math.round(draft.production)))).demand
    : null;
  const fitTarget = demand === null ? null : Math.min(capacityLots, Math.max(0, Math.round(demand - (priv?.stock ?? 0))));
  // Ventes du dernier trimestre par ville (secteurs régionaux, §5.2 bis) : part de chaque ville,
  // ▲/▼ quand elle s'écarte de plus de 5 points de la part de la ville dans les clients du secteur.
  let salesByCityLine: string | null = null;
  if (product.lastSalesByCity) {
    const byCity = product.lastSalesByCity;
    const total = CITY_IDS.reduce((sum, c) => sum + (byCity[c] ?? 0), 0);
    if (total > 0) {
      const weights = cityWeights(product.sectorId);
      const items = CITY_IDS.map((c) => ({ city: c, share: (byCity[c] ?? 0) / total }))
        .filter((e) => e.share > 0)
        .sort((a, b) => b.share - a.share)
        .map(({ city, share }) => {
          const arrow = share > weights[city] + 0.05 ? ' ▲' : share < weights[city] - 0.05 ? ' ▼' : '';
          return `${mapNames.cities[city]} ${fmt.pct(share, 0)}${arrow}`;
        })
        .join(' · ');
      salesByCityLine = t.product.salesByCity(items);
    }
  }

  return (
    <article className={cx('product-card', wide && 'wide', status === 'failed' && 'save-failed')}>
      <div className="product-main">
        <header className="product-head">
          <div>
            <span className="product-emoji" aria-hidden>
              {sector?.emoji ?? '📦'}
            </span>
            <strong className="product-name">{product.name}</strong>
            <div className="small muted">
              {sectorLabel?.name ?? product.sectorId} · {productLocation(view, product, mapNames, t.hex)} ·{' '}
              {product.launchedTurn > 0 ? t.product.launched(fmt.date(product.launchedTurn, view.config.startYear)) : t.product.original}
            </div>
          </div>
        </header>
        {product.factoryProductId && <p className="small muted">{industry.common(company.products.filter(p => p.factoryProductId === product.factoryProductId).length)}</p>}
        {comingSoon && (
          <div className="notice small coming-soon">
            <strong>{t.product.comingSoon}</strong> {isCrypto ? t.product.comingSoonCrypto : t.product.comingSoonBody}
          </div>
        )}
        {installationReport && (
          <p className="notice small">
            {t.product.installationReport(fmt.date(lastReport.turn, view.config.startYear), fmt.date(product.firstSalesTurn!, view.config.startYear))}
          </p>
        )}

        <dl className="product-stats">
          <div>
            <dt>{t.product.quality} <InfoTip text={t.tips.quality} /></dt>
            <dd>
              {fmt.num(product.quality)} <span className="muted small">→ {fmt.num(qNext)}</span>
            </dd>
          </div>
          <div>
            <dt>{t.product.brand}</dt>
            <dd>
              {fmt.num(product.brand)} <span className="muted small">→ {fmt.num(bNext)}</span>
            </dd>
          </div>
          <div>
            <dt>{t.product.stock}</dt>
            <dd>{priv ? fmt.lots(priv.stock) : '—'}</dd>
          </div>
          <div>
            <dt>{isCrypto ? t.product.computeCapacity : t.product.capacity}</dt>
            <dd>
              {fmt.lots(product.capacity)}
              {priv && priv.pendingCapacity > 0 && <span className="up small">{(isCrypto ? t.product.serversBuilding : t.product.building)(fmt.num(priv.pendingCapacity))}</span>}
            </dd>
          </div>
          <div>
            <dt>{t.product.sales}</dt>
            <dd>
              {fmt.lots(product.lastSales)}
              {priv && <span className="muted small">{(isCrypto ? t.product.generated : t.product.produced)(fmt.num(priv.lastProduced))}</span>}
            </dd>
          </div>
          <div>
            <dt>{t.product.share}</dt>
            <dd>{fmt.pct(product.lastMarketShare)}</dd>
          </div>
        </dl>

        {salesByCityLine && (
          <div className="small muted" title={t.product.salesByCityTip}>
            {salesByCityLine}
          </div>
        )}

        <div className="decisions">
          <NumberField
            label={t.product.price}
            hint={t.product.priceHint(fmt.pct(draft.price / ref, 0), fmt.money(ref))}
            value={draft.price}
            min={ref * PRICE_MIN_PCT}
            max={ref * PRICE_MAX_PCT}
            step={Math.max(0.5, Math.round(ref) / 100)}
            slider
            suffix={`${fmt.unit}/lot`}
            onChange={(v) => set({ price: v })}
            onCommit={commit}
          />
          <div className="production-field">
            <NumberField
              label={isCrypto ? t.product.computeOutput : t.product.production}
              hint={t.product.capacityHint(fmt.num(prodCapacity))}
              value={draft.production}
              min={0}
              max={prodCapacity * PRODUCTION_MAX_FACTOR}
              step={1}
              slider
              suffix="lots"
              onChange={(v) => set({ production: Math.round(v) })}
              onCommit={commit}
            />
            {demand !== null && fitTarget !== null && (
              // Le calcul et sa réserve (rivaux à prix inchangés) dans une bulle collée au bouton, atteignable au clavier.
              <span className="fit-demand">
                <button
                  type="button"
                  className="btn tiny ghost"
                  disabled={Math.round(draft.production) === fitTarget}
                  onClick={() => {
                    set({ production: fitTarget });
                    commit('now');
                  }}
                >
                  {t.product.fitDemand(lots(demand))}
                </button>{' '}
                <InfoTip text={t.product.fitDemandTip(lots(demand), fmt.lots(priv?.stock ?? 0), fmt.lots(fitTarget))} align="left" />
              </span>
            )}
          </div>
          <NumberField
            label={t.product.marketing}
            hint={t.product.marketingHint}
            value={draft.marketing}
            min={0}
            sliderMax={budgetMax}
            step={10}
            slider
            suffix={fmt.unit}
            onChange={(v) => set({ marketing: v })}
            onCommit={commit}
          />
          <NumberField
            label={t.product.rnd}
            hint={t.product.rndHint}
            value={draft.rnd}
            min={0}
            sliderMax={budgetMax}
            step={10}
            slider
            suffix={fmt.unit}
            onChange={(v) => set({ rnd: v })}
            onCommit={commit}
          />
        </div>
      </div>

      <div className="product-side">
        {verdict && <p className={cx('plot-verdict product-verdict', STATUS_TONE[flow.status])}>{verdict}</p>}

        <div className="estimates small">
          <div>
            <InfoTip text={t.tips.unitCost(fmt.pct(EMERGENCY_PURCHASE_MARKUP - 1, 0))} align="left" />{' '}
            <Rich text={t.product.unitCost(fmt.lotPrice(unitCost))} />
            {/* Le fret fait partie du coût : il le suit, avant la marge (§5.8). */}
            {priv && priv.estimatedTransport !== 0 && (
              <> <span className="muted">{t.product.unitCostFreight(fmt.lotPrice(priv.estimatedTransport), priv.estimatedTransport < 0)}</span></>
            )}
            {' · '}{t.product.marginPerLot}{' '}
            <strong className={margin >= 0 ? 'up' : 'down'}>
              {fmt.lotPrice(margin)} ({draft.price > 0 ? fmt.pct(margin / draft.price, 0) : '—'})
            </strong>
          </div>
          {priv && <FreightDetails view={view} freight={currentProductFreight(view, company, product)} />}
          {estimate && (
            <>
              <div className="estimate-line">
                <Rich text={t.product.forecast(fmt.lots(estimate.sales), fmt.int(estimate.demand), fmt.money(estimate.revenue))} />{' '}
                <strong><SignedMoney value={estimate.margin} /></strong> <InfoTip text={t.product.estimateNote} align="left" />
              </div>
              {unsold >= 0.5 && (
                <div className="if-all-sells">
                  {t.product.ifAllSells(fmt.lots(sellable))} <SignedMoney value={ifAllSells} />
                </div>
              )}
              <details>
                <summary>{t.product.estimateDetails}</summary>
                <table className="table">
                  <tbody>
                    <tr><th scope="row">{t.product.estimatedRevenue}</th><td className="num">{fmt.money(estimate.revenue)}</td></tr>
                    <tr><th scope="row">{(isCrypto ? t.product.computeCost : t.product.productionCost)(fmt.lots(estimateProduced))}</th><td className="num">−{fmt.money(productionCost)}</td></tr>
                    <tr><th scope="row">{t.product.marketing}</th><td className="num">−{fmt.money(Math.max(0, draft.marketing) * budgetShare)}</td></tr>
                    <tr><th scope="row">{t.product.rnd}</th><td className="num">−{fmt.money(Math.max(0, draft.rnd) * budgetShare)}</td></tr>
                    <tr><th scope="row">{t.product.productFixedCosts}</th><td className="num">−{fmt.money(priv?.market?.fixedCost ?? 0)}</td></tr>
                    <tr className="total"><th scope="row">{t.product.estimatedBalance}</th><td className="num"><SignedMoney value={estimate.margin} /></td></tr>
                    <tr><th scope="row">{t.product.hqShare}</th><td className="num">−{fmt.money(hqShare)}</td></tr>
                    <tr className="total"><th scope="row">{t.product.afterHq}</th><td className="num"><SignedMoney value={estimate.margin - hqShare} /></td></tr>
                  </tbody>
                </table>
                {budgetShare === 0 && budgetPayer && <p className="muted">{industry.budgetPayer(productLocation(view, budgetPayer, mapNames, t.hex))}</p>}
                <p className="muted">{t.product.estimateAccounting}</p>
                <p className="muted">{t.product.estimateExcludes}</p>
              </details>
            </>
          )}
        </div>

        <RivalsLine company={company} product={product} price={draft.price} qualityNext={qNext} brandNext={bNext} />

        {/* Alertes : toujours visibles, juste avant l'état de l'enregistrement. */}
        {(draft.production > prodCapacity || margin < 0) && (
          <div className="product-warnings small">
            {draft.production > prodCapacity && <div className="warn">{t.product.overCapacity}</div>}
            {margin < 0 && <div className="warn">{t.product.atLoss}</div>}
          </div>
        )}

        {adjusted && <AdjustedNote fields={adjusted} values={draft} refPrice={ref} />}

        <footer className="product-actions">
          {/* Enregistrement automatique : état et retour au début du trimestre à gauche, actions du produit à droite. */}
          <SaveState status={status} onRetry={() => void saver.flush()} />
          {turnStart && (
            <button
              type="button"
              className="btn tiny ghost"
              disabled={sameSettings(draft, turnStart)}
              title={t.product.revertTip}
              aria-label={t.product.revertLabel}
              onClick={() => void saver.revertTo(turnStart)}
            >
              {t.product.revert}
            </button>
          )}
          <span className="grow" />
          {priv && onMove && (view.config.industryRules !== 'network' || product.incubator) && (
            <button type="button" className="btn tiny ghost" onClick={() => onMove(product.id)}>
              {t.product.move}
            </button>
          )}
          <button type="button" className="btn tiny ghost" onClick={() => setModal('expand')}>
            {isCrypto ? t.product.expandServers : t.product.expand}
          </button>
          <button type="button" className="btn tiny ghost danger-text" onClick={() => setModal('stop')}>
            {view.config.industryRules === 'network' ? industry.close : t.product.stop}
          </button>
        </footer>

        {modal === 'expand' && <ExpandCapacityModal company={company} product={product} onClose={() => setModal(null)} />}
        {modal === 'stop' && (
          <ConfirmModal
            title={view.config.industryRules === 'network' ? industry.closeTitle(product.name) : t.product.stopTitle(product.name)}
            message={<p>{view.config.industryRules === 'network' ? industry.closeBody : t.product.stopBody(priv ? fmt.lots(priv.stock) : '?', fmt.lots(product.capacity + (priv?.pendingCapacity ?? 0)))}</p>}
            confirmLabel={view.config.industryRules === 'network' ? industry.close : t.product.stopConfirm}
            onConfirm={() => void sendAction({ type: 'discontinueProduct', companyId: company.id, productId: product.id })}
            onClose={() => setModal(null)}
          />
        )}
      </div>
    </article>
  );
}

/**
 * Verdict de l'offre face à la demande (textes de « Mes usines »). Rien pour un produit en chantier (la fiche le dit
 * déjà) ni sans estimation.
 */
function flowVerdict(
  status: FlowStatus,
  v: ReturnType<typeof useT>['factories']['verdict'],
  shortage: string,
  surplus: string,
  spoiled: string,
  sales: string,
): string | null {
  switch (status) {
    case 'idle':
      return v.idle;
    case 'shortage':
      return v.shortage(shortage);
    case 'surplus':
      return v.surplus(surplus, spoiled);
    case 'balanced':
      return v.balanced(sales);
    default:
      return null;
  }
}

/**
 * « Face aux rivaux » en une ligne : place du produit parmi les produits en rayon du secteur pour le prix (1re = le moins
 * cher), la qualité et la notoriété, dépliée sur les réglettes de « Mes usines ». Les prix des rivaux sont ceux du
 * trimestre précédent (vue redigée) ; celui du produit est celui à l'écran.
 */
function RivalsLine({ company, product, price, qualityNext, brandNext }: { company: CompanyView; product: ProductView; price: number; qualityNext: number; brandNext: number }) {
  const { view, refPrice } = useGame();
  const t = useT();
  const fmt = useFmt();
  const field = sectorProducts(view.companies, product.sectorId).filter((r) => r.product.id !== product.id);
  const total = field.length + 1;
  if (total === 1) return <p className="small muted product-rivals">{t.product.rivals(t.product.rivalsAlone)}</p>;
  const mine = { ...product, price };
  const place = (get: (p: ProductView) => number) => t.product.rank(rankAmong(get(mine), field.map((r) => get(r.product))), total);
  const dots = (get: (p: ProductView) => number, show: (v: number) => string): StripDot[] => [
    ...field.map((r) => ({
      key: r.product.id,
      value: get(r.product),
      color: r.company.color,
      title: t.factories.dotTitle(r.product.name, r.company.ticker, show(get(r.product))),
      focus: false,
    })),
    { key: product.id, value: get(mine), color: company.color, title: t.factories.dotTitle(product.name, company.ticker, show(get(mine))), focus: true },
  ];
  return (
    <details className="product-rivals small">
      <summary>{t.product.rivals(t.product.rivalRanks(place((p) => -p.price), place((p) => p.quality), place((p) => p.brand)))}</summary>
      <p className="muted">
        {t.product.rivalsTip(total)} {t.product.rivalsPrices}
      </p>
      <div className="strips">
        <div className="strip-row">
          <span className="strip-label">{t.factories.price}</span>
          <Strip dots={dots((p) => p.price, fmt.money)} label={t.factories.price} />
          <span className="strip-value small">{t.factories.priceRef(fmt.money(price), fmt.money(refPrice(product.sectorId)))}</span>
        </div>
        <div className="strip-row">
          <span className="strip-label">{t.factories.quality}</span>
          <Strip dots={dots((p) => p.quality, fmt.num)} next={qualityNext} label={t.factories.quality} />
          <span className="strip-value small">{t.factories.move(fmt.num(product.quality), fmt.num(qualityNext))}</span>
        </div>
        <div className="strip-row">
          <span className="strip-label">{t.factories.brand}</span>
          <Strip dots={dots((p) => p.brand, fmt.num)} next={brandNext} label={t.factories.brand} />
          <span className="strip-value small">{t.factories.move(fmt.num(product.brand), fmt.num(brandNext))}</span>
        </div>
      </div>
    </details>
  );
}

/** État de l'enregistrement automatique, dans le pied de la fiche. */
export function SaveState({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const t = useT();
  return (
    <span className="product-save-state small" role="status">
      {status === 'saving' ? (
        <span className="muted">{t.product.saving}</span>
      ) : status === 'saved' ? (
        <span className="muted">{t.product.saved}</span>
      ) : status === 'failed' ? (
        <>
          <span className="down">{t.product.notSaved}</span>{' '}
          <button type="button" className="btn tiny" onClick={onRetry}>
            {t.product.retry}
          </button>
        </>
      ) : (
        <>
          <span className="muted">{t.product.autosave}</span> <InfoTip text={t.product.autosaveTip} align="left" />
        </>
      )}
    </span>
  );
}

/** Réglages ramenés dans les bornes du moteur au dernier enregistrement : la valeur retenue et la raison, sur une ligne. */
export function AdjustedNote({ fields, values, refPrice }: { fields: readonly SettingField[]; values: ProductSettings; refPrice: number }) {
  const t = useT();
  const fmt = useFmt();
  const c = t.product.capped;
  const parts = fields.map((f) =>
    f === 'price'
      ? c.price(fmt.lotPrice(values.price), fmt.lotPrice(refPrice * PRICE_MIN_PCT), fmt.lotPrice(refPrice * PRICE_MAX_PCT))
      : f === 'production'
        ? c.production(fmt.lots(values.production), fmt.num(PRODUCTION_MAX_FACTOR))
        : f === 'marketing'
          ? c.marketing(fmt.money(values.marketing))
          : c.rnd(fmt.money(values.rnd)),
  );
  return <p className="small warn product-save-note">{t.product.saveAdjusted(parts.join(', '))}</p>;
}
