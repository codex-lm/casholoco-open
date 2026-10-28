import { useId, useState } from 'react';
import { isSpatialMap, type CompanyView, type PlayerView } from '@muchomoney/core';
import { useGame } from '../../hooks/useGame';
import { Delta, InfoTip, Section, Stat } from '../../components/bits';
import {
  CRISIS_COMMS_REPUTATION_CAP,
  MAX_ACTIVE_PRODUCTS,
  SCANDAL_LEVEL_THRESHOLDS,
  STARTUP_SUBSIDY,
  holdingPct,
  maxProductsOf,
  productCount,
  pctDigits,
  priceChange,
  scandalRisk,
} from '../../rules';
import { cx } from '../../util';
import { useContent, useT } from '../../i18n';
import { useFmt } from '../../fmt';
import type { TabId } from '../GameScreen';
import type { MapIntent } from './mapIntent';
import { ProductCard } from './ProductCard';
import { ReportTable } from './ReportTable';
import { FinancePanel } from './FinancePanel';
import { CRISIS_COMMS_ANCHOR, SHADY_ANCHOR, ShadyPanel } from './ShadyPanel';
import { StartupModal } from './StartupModal';
import { CloseBanner } from './CloseBanner';
import { HexBidsPanel } from './HexBidsPanel';
import { CompanyMaterials } from './CompanyMaterials';
import { LossSummary, Timeline, useTimeline } from './timeline/Timeline';
import { FAMILIES, lastLosses } from './timeline/model';
import { activeStartingTerrains, startingTerrainTip, type StartingTerrain } from './startingTerrain';

interface Props {
  company: CompanyView | null;
  onSelect: (id: string) => void;
  goTo: (tab: TabId) => void;
  /** Ouvre un numéro du journal (chronologie). */
  openIssue?: (turn: number) => void;
  /** Toute décision géographique (lancement, déménagement, gisement) se prépare sur « La carte ». */
  openMapFor: (intent: MapIntent) => void;
  /** Ouvre « La carte » sur la case de ce produit (puce du terrain de départ). */
  onMap?: (productId: string) => void;
}

/** Une perte reste signalée en tête de l'entreprise restante pendant ce nombre de trimestres. */
const RECENT_LOSS_TURNS = 2;

export function CompanyTab({ company, onSelect, goTo, openIssue, openMapFor, onMap }: Props) {
  const { myCompanies, me, view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const [startup, setStartup] = useState(false);
  const losses = lastLosses(useTimeline());
  const lossTurn = losses[0]?.turn; // numéro : recentLoss et « Lire le N° » s'en servent toujours
  const [historyTurn, setHistoryTurn] = useState(() => losses[0]?.quarter ?? view.turn);

  if (!company) {
    const ousted = me.stats.takeoversSuffered > 0;
    const soldOut = (view.self?.soldControlThisTurn?.length ?? 0) > 0;
    return (
      <>
        <div className="no-company">
          <h2>{t.company.noneTitle}</h2>
          <LossSummary entries={losses} onReadIssue={openIssue} />
          <p>
            {ousted ? t.company.ousted : t.company.consultant} {t.company.twoOptions}
          </p>
          <div className="row wrap center">
            <button
              type="button"
              className="btn big primary"
              onClick={() => setStartup(true)}
              disabled={soldOut}
              title={soldOut ? t.company.comebackNextQuarter : undefined}
            >
              {t.company.foundComeback}
            </button>
            <button type="button" className="btn big" onClick={() => goTo('stocks')}>
              {t.company.buyOne}
            </button>
          </div>
          <p className="small muted">{t.company.comebackHint(fmt.money(view.self?.startupSubsidy ?? STARTUP_SUBSIDY))}</p>
          {soldOut && <p className="small warn">{t.company.comebackNextQuarter}</p>}
          <p className="small muted">{t.company.stillInvested}</p>
          {startup && <StartupModal onClose={() => setStartup(false)} />}
        </div>
        {hasHexBids(view) && <HexBidsPanel openMapFor={openMapFor} goTo={goTo} />}
        {view.journal.length > 0 && (
          <Timeline
            title={t.history.titleMine}
            defaultFamilies={FAMILIES}
            defaultMineOnly
            selected={historyTurn}
            onSelect={setHistoryTurn}
            onReadIssue={openIssue}
          />
        )}
      </>
    );
  }

  const priv = company.private;
  const myPct = holdingPct(company, me.id);
  // Une autre de vos entreprises vient de vous être prise : le dire ici, où l'on vient le vérifier.
  const recentLoss = lossTurn !== undefined && lossTurn > view.turn - RECENT_LOSS_TURNS;
  const slots = maxProductsOf(company);
  // Une ou deux fiches : chacune sur toute la largeur, en deux colonnes (réglages à gauche, prévision à droite).
  const wideCards = company.products.length <= 2;

  return (
    <div className="company">
      {recentLoss && <LossSummary entries={losses} onReadIssue={openIssue} level={2} />}
      {myCompanies.length > 1 && (
        <nav className="company-switch" aria-label={t.company.switchAria}>
          {myCompanies.map((c) => (
            <button key={c.id} type="button" className={cx('chip', c.id === company.id && 'active')} onClick={() => onSelect(c.id)}>
              {c.emoji} {c.name}
            </button>
          ))}
        </nav>
      )}

      <header className="company-head">
        <div className="company-title">
          <span className="company-emoji" aria-hidden>
            {company.emoji}
          </span>
          <div>
            <h2>
              {company.name} <span className="ticker-chip">{company.ticker}</span>
            </h2>
            <div className="company-ceo-line">
              <span className="small muted">{t.company.ceoLine(company.ceoName, fmt.pct(myPct, pctDigits(myPct)))}</span>
              {isSpatialMap(view.config) && activeStartingTerrains(view, company).map((found) => (
                <StartingTerrainChip key={found.terrain.id} found={found} onMap={onMap} />
              ))}
            </div>
          </div>
        </div>
        {/* Trésorerie et marge d'emprunt, cours, réputation, scandale : la capitalisation est dans « Bourse ». */}
        <div className="stat-grid company-stats">
          <Stat label={t.company.cash} value={fmt.money(company.cash)} tone={company.cash < 0 ? 'down' : undefined} />
          <Stat
            label={t.company.debt}
            value={fmt.money(company.debt)}
            sub={
              priv && (
                <span className="muted">
                  {t.company.loanRoom(fmt.money(priv.loanLimit))} <InfoTip text={t.tips.loanCap} />
                </span>
              )
            }
          />
          <Stat
            label={
              <>
                {t.company.price}{' '}
                {company.valuation && (
                  <InfoTip
                    text={t.tips.valuation(
                      fmt.money(company.valuation.bookValue),
                      fmt.money(company.valuation.smoothedProfit),
                      fmt.sharePrice(company.valuation.perShare),
                    )}
                  />
                )}
              </>
            }
            value={fmt.sharePrice(company.sharePrice)}
            sub={<Delta value={priceChange(company.priceHistory, company.sharePrice)} />}
          />
          <Stat
            label={t.company.reputation}
            value={fmt.num(company.reputation)}
            sub={
              company.reputation < CRISIS_COMMS_REPUTATION_CAP ? (
                <TipButton className="link-button" align="left" tip={t.company.apologyTip(fmt.num(CRISIS_COMMS_REPUTATION_CAP))} onClick={() => scrollToId(CRISIS_COMMS_ANCHOR)}>
                  {t.company.apology}
                </TipButton>
              ) : (
                <span className="muted">{t.company.reputationRange(fmt.num(0.5), fmt.num(1.3))}</span>
              )
            }
          />
          {priv && <ScandalChip value={priv.scandal} />}
        </div>
      </header>

      <CloseBanner company={company} />

      <Section
        title={t.company.products(productCount(company) + (priv?.launchProjects?.length ?? 0), slots)}
        aside={
          <span className="row wrap company-products-aside">
            <span className="small muted">
              {t.company.productsAside}
              {slots > MAX_ACTIVE_PRODUCTS && <> {t.company.mergedSlots}</>}
            </span>
            <button type="button" className="btn small" onClick={() => openMapFor({ kind: 'launch', companyId: company.id })}>
              {t.company.launchOnMap}
            </button>
          </span>
        }
      >
        {company.products.length === 0 ? (
          <p className="muted">{t.company.noProducts}</p>
        ) : (
          <div className={cx('product-grid', wideCards && 'wide')}>
            {company.products.map((p) => (
              <ProductCard key={p.id} company={company} product={p} wide={wideCards} onMove={(pid) => openMapFor({ kind: 'move', productId: pid })} />
            ))}
          </div>
        )}
      </Section>

      {/* Toujours là, même sans produit : lots dus par contrat et « Miser sur un gisement… » n'ont pas d'autre entrée ici. */}
      <CompanyMaterials company={company} goTo={goTo} openMapFor={openMapFor} />

      {companyHasSites(view, company) && (
        <Section title={t.sites.title}>
          <CompanySites company={company} openMapFor={openMapFor} />
        </Section>
      )}

      {hasHexBids(view) && <HexBidsPanel openMapFor={openMapFor} goTo={goTo} />}

      <Section
        title={
          <>
            {t.company.finances} <InfoTip text={t.company.cashPockets} align="left" />
          </>
        }
      >
        <FinancePanel key={company.id} company={company} />
      </Section>

      {/* Jauge, effets en cours et communication de crise visibles ; les six combines dans un volet (ShadyPanel). */}
      <Section title={t.company.shady} className="section-shady">
        <ShadyPanel key={company.id} company={company} />
      </Section>

      {/* Absent avant le premier bilan, replié ensuite : le bilan de clôture résume déjà le trimestre. */}
      {company.reports.length > 0 && (
        <details className="tab-fold company-report">
          <summary>{t.company.lastReport}</summary>
          <ReportTable reports={company.reports} />
        </details>
      )}
    </div>
  );
}

function scrollToId(id: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.focus({ preventScroll: true });
}

/** « Mes mises » : seulement quand une mise attend ou qu'un résultat de la dernière clôture est à lire. */
export function hasHexBids(view: PlayerView): boolean {
  return isSpatialMap(view.config) && (view.self?.hexBids ?? []).length > 0;
}

/** « Filiales d'approvisionnement » : seulement avec une filiale (même en sommeil ou en chantier) ou une mise en attente. */
export function companyHasSites(view: PlayerView, company: CompanyView): boolean {
  return (company.sites ?? []).length > 0 || (view.self?.siteBids ?? []).some((b) => b.companyId === company.id && !b.result);
}

/**
 * Puce de l'en-tête : la jauge de scandale et le risque d'éclatement à la clôture, mêmes seuils et même risque que la
 * jauge (neutre sous « moyen », ambre dès « moyen », rouge dès « élevé ») ; un clic mène au bloc des actions discutables.
 */
export function ScandalChip({ value }: { value: number }) {
  const t = useT();
  const fmt = useFmt();
  const v = Math.min(100, Math.max(0, value));
  const { moyen, eleve } = SCANDAL_LEVEL_THRESHOLDS;
  const tone = v >= eleve ? 'high' : v >= moyen ? 'mid' : 'low';
  return (
    <div className="company-scandal-chip">
      <TipButton className={cx('scandal-chip', tone)} tip={t.company.scandalChipTip} onClick={() => scrollToId(SHADY_ANCHOR)}>
        {t.company.scandalChip(Math.round(v), fmt.pct(scandalRisk(v), 0))}
      </TipButton>
    </div>
  );
}

/**
 * Bouton à bulle, comme la puce du terrain : la bulle s'ouvre au survol et au focus clavier, et les lecteurs d'écran la
 * lisent comme description (un `title` ne s'atteint ni au clavier ni au doigt).
 */
function TipButton({ className, tip, align, onClick, children }: { className: string; tip: string; align?: 'left'; onClick: () => void; children: string }) {
  const tipId = useId();
  return (
    <>
      <button type="button" className={cx(className, 'has-tip', align && `tip-${align}`)} data-tip={tip} aria-describedby={tipId} onClick={onClick}>
        {children}
      </button>
      <span id={tipId} className="sr-only">
        {tip}
      </span>
    </>
  );
}

/**
 * Terrain de départ encore actif sous une usine de l'entreprise : nom et point fort, effets en vigueur dans la
 * bulle ; un clic ouvre « La carte » sur sa case. Disparaît avec le terrain (déménagement, arrêt, fin des effets).
 */
function StartingTerrainChip({ found, onMap }: { found: StartingTerrain; onMap?: (productId: string) => void }) {
  const t = useT();
  const fmt = useFmt();
  const tipId = useId();
  const tip = startingTerrainTip(t, fmt, found, Boolean(onMap));
  const label = t.hex.terrainChip(found.terrain.name, found.terrain.strengthLabel);
  return (
    <>
      {onMap ? (
        <button type="button" className="terrain-chip has-tip tip-left" data-tip={tip} aria-describedby={tipId} onClick={() => onMap(found.productId)}>
          {label}
        </button>
      ) : (
        <span className="terrain-chip has-tip tip-left" data-tip={tip} aria-describedby={tipId}>
          {label}
        </span>
      )}
      <span id={tipId} className="sr-only">
        {tip}
      </span>
    </>
  );
}

/**
 * Filiales d'approvisionnement de l'entreprise (§5.5 bis) en liste compacte : état et extraction
 * prévue de chaque filiale, mises en attente, chaque ligne menant au gisement sur « La carte ».
 * Rendue seulement s'il y a une ligne (`companyHasSites`) ; « Miser sur un gisement » est dans le bloc des
 * matières, les règles des enchères dans le mode d'emploi.
 */
function CompanySites({ company, openMapFor }: { company: CompanyView; openMapFor: (intent: MapIntent) => void }) {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const sites = company.sites ?? [];
  const slotName = (id: string) => view.siteSlots.find((s) => s.id === id)?.name ?? id;
  const bids = (view.self?.siteBids ?? []).filter((b) => b.companyId === company.id && !b.result);
  return (
    <ul className="company-sites">
      {sites.map((site) => {
        const running = !site.dormant && site.activeFrom <= view.turn;
        // Extraction prévue à la clôture (plan du moteur), comme sur la fiche du gisement.
        const planned = company.private?.closePlan?.sites.filter((s) => s.siteId === site.id) ?? [];
        const plannedLots = planned.reduce((n, s) => n + s.needed + s.surplus, 0);
        const plannedCap = planned.reduce((n, s) => n + s.capacity, 0);
        return (
          <li key={site.id} className="row between wrap">
            <div>
              <strong>{site.name}</strong> <span className="muted">· {content.commodities[site.commodityId]?.name ?? site.commodityId}</span>
              <div className="small muted">
                {site.dormant ? t.sites.dormant(fmt.money(site.upkeep)) : running ? t.sites.active : t.sites.building(fmt.date(site.activeFrom, view.config.startYear))}
                {running && planned.length > 0 && <> · {t.sites.planned(plannedLots, plannedCap)}</>}
              </div>
            </div>
            <button type="button" className="btn small ghost" onClick={() => openMapFor({ kind: 'deposit', companyId: company.id, slotId: site.id })}>
              {t.company.showOnMap}
            </button>
          </li>
        );
      })}
      {bids.map((bid) => (
        <li key={`bid-${bid.slotId}`} className="row between wrap">
          <p className="small">{t.sites.pending(fmt.money(bid.amount), slotName(bid.slotId))}</p>
          <button type="button" className="btn small ghost" onClick={() => openMapFor({ kind: 'deposit', companyId: company.id, slotId: bid.slotId })}>
            {t.company.showOnMap}
          </button>
        </li>
      ))}
    </ul>
  );
}
