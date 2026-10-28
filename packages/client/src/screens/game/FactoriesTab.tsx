/**
 * Onglet « Mes usines » (bêta) : les produits de l'entreprise en images, à côté de l'onglet classique.
 * Chaque chiffre de la fiche produit a sa traduction visuelle (voir factories/PlotScene.tsx) ; les décisions
 * passent par les mêmes composants que l'onglet entreprise (fiche produit, agrandissement), et les décisions
 * géographiques (lancement, déménagement) envoient sur « La carte » avec l'intention correspondante.
 */
import { useState } from 'react';
import type { CompanyView } from '@muchomoney/core';
import { useGame } from '../../hooks/useGame';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Modal } from '../../components/Modal';
import { Stat } from '../../components/bits';
import { MAX_ACTIVE_PRODUCTS, maxProductsOf, productCount } from '../../rules';
import { cx } from '../../util';
import { useT, useUiLang } from '../../i18n';
import { navigationDetailsMessages } from '../../i18n/navigationDetails';
import { Rich } from '../../i18n/Rich';
import { useFmt } from '../../fmt';
import type { TabId } from '../GameScreen';
import type { MapIntent } from './mapIntent';
import { STILL_KEY, loadFlag, saveFlag } from '../../storageFlags';
import { ProductCard } from './ProductCard';
import { ExpandCapacityModal } from './ExpandCapacityModal';
import { EmptyPlotScene } from './factories/PlotScene';
import { ProductPlot } from './factories/ProductPlot';
import './navigationDetails.css';

/** Légende dépliée (mémorisée dans ce navigateur) ; sans préférence, elle reste repliée. */
const LEGEND_OPEN_KEY = 'casholoco.factories.legendOpen';

interface Props {
  company: CompanyView | null;
  onSelect: (id: string) => void;
  goTo: (tab: TabId) => void;
  /** Le produit devient la référence de « La carte » (le focus d'arrivée est géré par GameScreen). */
  onSelectProduct?: (id: string) => void;
  onMap?: (id: string) => void;
  /** Lancement et déménagement se préparent sur « La carte », avec l'intention correspondante. */
  openMapFor: (intent: MapIntent) => void;
}

export function FactoriesTab({ company, onSelect, goTo, onSelectProduct, onMap, openMapFor }: Props) {
  const { myCompanies, view } = useGame();
  const t = useT();
  const labels = navigationDetailsMessages(useUiLang());
  const fmt = useFmt();
  const reduced = useReducedMotion();
  const [frozen, setFrozen] = useState(() => loadFlag(STILL_KEY));
  const [legendOpen] = useState(() => loadFlag(LEGEND_OPEN_KEY));
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [expandId, setExpandId] = useState<string | null>(null);
  const still = reduced || frozen;

  if (!company) {
    return (
      <div className="no-company">
        <h2>{t.factories.noneTitle}</h2>
        <p>{t.factories.noneBody}</p>
        <button type="button" className="btn big" onClick={() => goTo('company')}>
          {t.factories.noneAction}
        </button>
      </div>
    );
  }

  const max = maxProductsOf(company);
  const pendingProducts = company.private?.launchProjects?.length ?? 0;
  const used = productCount(company) + pendingProducts;
  const free = Math.max(0, max - used);
  const network = view.config.industryRules === 'network';
  const sites = company.products.filter((p) => p.comingSoon || (p.private?.pendingCapacity ?? 0) > 0).length;
  const launchCosts = view.sectors.map((s) => s.launchCost);
  const settings = company.products.find((p) => p.id === settingsId);
  const expanding = company.products.find((p) => p.id === expandId);

  return (
    <div className="factories">
      {myCompanies.length > 1 && (
        <nav className="company-switch" aria-label={t.company.switchAria}>
          {myCompanies.map((c) => (
            <button key={c.id} type="button" className={cx('chip', c.id === company.id && 'active')} onClick={() => onSelect(c.id)}>
              {c.emoji} {c.name}
            </button>
          ))}
        </nav>
      )}

      <header className="factories-head">
        <div className="factories-title">
          <h2>
            <span aria-hidden>{company.emoji}</span> {t.factories.title(company.name)} <span className="badge">{t.game.beta}</span>
          </h2>
          <p className="small muted">{network ? labels.networkIntro : t.factories.intro}</p>
        </div>
        <div className="stat-grid small-stats factories-counts">
          <Stat label={t.factories.cash} value={fmt.money(company.cash)} tone={company.cash < 0 ? 'down' : undefined} />
          <Stat label={labels.productCount} value={`${used} / ${max}`} />
          <Stat label={labels.factoryCount} value={String(company.products.length)} />
          <Stat label={t.factories.sites} value={String(sites)} />
        </div>
      </header>
      {pendingProducts > 0 && <p className="small muted factories-capacity-note">{labels.reservedProducts(pendingProducts)}</p>}

      <div className="factories-tools">
        <details className="factories-legend" open={legendOpen} onToggle={(e) => saveFlag(LEGEND_OPEN_KEY, e.currentTarget.open)}>
          <summary>{t.factories.legendTitle}</summary>
          <ul>
            {(['lab', 'factory', 'crane', 'stock', 'shop', 'walkers', 'billboard', 'green'] as const).map((k) => (
              <li key={k}>
                <Rich text={t.factories.legend[k]} />
              </li>
            ))}
          </ul>
        </details>
        {!reduced && (
          // Libellé qui change avec l'état (sans aria-pressed, qui l'annoncerait à l'envers) ; pictogramme muet.
          <button
            type="button"
            className="btn tiny ghost"
            onClick={() => {
              saveFlag(STILL_KEY, !frozen);
              setFrozen(!frozen);
            }}
          >
            <span aria-hidden>{frozen ? '▶ ' : '⏸ '}</span>
            {frozen ? t.city.shell.animate : t.city.shell.freeze}
          </button>
        )}
      </div>

      <div className="plot-grid">
        {company.products.map((p) => (
          <ProductPlot key={p.id} company={company} product={p} still={still}
            onSettings={() => { onSelectProduct?.(p.id); setSettingsId(p.id); }}
            onExpand={() => { onSelectProduct?.(p.id); setExpandId(p.id); }}
            onMap={onMap ? () => onMap(p.id) : undefined} />
        ))}
        {/* Une seule carte pour tous les emplacements libres : même action, inutile de la répéter. */}
        {(free > 0 || network) && (
          <article className="plot plot-free">
            <EmptyPlotScene sign={t.factories.forSale} ariaLabel={t.factories.emptyAria} />
            <div className="plot-body">
              <h3>{network ? labels.networkBuild : labels.freeProducts(free)}</h3>
              {network ? <>
                <p className="small">{free > 0 ? labels.freeProducts(free) : labels.networkFull}</p>
                <p className="small muted">{labels.networkCost(fmt.money(Math.min(...launchCosts)), fmt.money(Math.max(...launchCosts)))}</p>
                <p className="small muted">{labels.networkTiming}</p>
              </> : <p className="small muted">{(view.config.mapMode === 'classic' || !view.config.mapMode ? t.factories.emptyBody : labels.boardTiming)(fmt.money(Math.min(...launchCosts)), fmt.money(Math.max(...launchCosts)))}</p>}
              <button type="button" className="btn primary" onClick={() => openMapFor({ kind: 'launch', companyId: company.id,
                ...(network && free === 0 && company.products[0] ? { existingProductId: company.products[0].id } : {}),
              })}>
                {t.factories.build}
              </button>
            </div>
          </article>
        )}
      </div>
      {free === 0 && !network && <p className="small muted">{labels.productsFull(max <= MAX_ACTIVE_PRODUCTS)}</p>}

      {settings && (
        <Modal title={t.factories.settingsTitle(settings.name)} onClose={() => setSettingsId(null)} wide>
          <ProductCard key={`${company.id}/${settings.id}`} company={company} product={settings} onMove={(pid) => openMapFor({ kind: 'move', productId: pid })} />
        </Modal>
      )}
      {expanding && <ExpandCapacityModal company={company} product={expanding} onClose={() => setExpandId(null)} />}
    </div>
  );
}
