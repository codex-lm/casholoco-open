/**
 * Onglet « Marchés » : les secteurs où le joueur vend d'abord, en fiche complète ; les autres tiennent sur une ligne
 * (prix de référence, demande, conjoncture, lancement estimé) qui se déplie en fiche. Sur le plateau, l'estimation de
 * lancement est la meilleure case libre, calculée avec la règle de l'occasion de lancement de la carte (city/model.ts,
 * bestLaunchCell).
 */
import { Fragment, useState } from 'react';
import type { CompanyView, PlayerView, SectorId, SectorView } from '@muchomoney/core';
import { COMMODITIES, SECTORS, hexPlaceLabel, isSpatialMap } from '@muchomoney/core';
import { useGame } from '../../hooks/useGame';
import { LineChart } from '../../components/LineChart';
import { ShareBars, type ShareRow } from '../../components/ShareBars';
import { InfoTip, Section, Stat } from '../../components/bits';
import { marketSize } from '../../rules';
import { cx, turnLabels } from '../../util';
import { useContent, useRoomLang, useT } from '../../i18n';
import { useFmt } from '../../fmt';
import type { MapIntent } from './mapIntent';
import { bestLaunchCell, launchCompany, type LaunchCell } from './city/model';

/** Lien vers la carte de la meilleure case libre (plateau). */
interface MapLink {
  /** « Voir sur la carte » : ouvre la carte, formulaire de lancement prêt. */
  openMapFor?: (intent: MapIntent) => void;
  /** Entreprise sélectionnée : elle lance si elle a un emplacement libre, comme depuis la carte (launchCompany). */
  company?: CompanyView | null;
}

/** Sensibilité au prix d'un secteur, en mot : l'élasticité-prix (2 pour les yaourts, 6,5 pour les gadgets) en trois paliers. */
export type PriceSensitivity = 'high' | 'medium' | 'low';
export function priceSensitivity(elasticity: number): PriceSensitivity {
  return elasticity >= 5 ? 'high' : elasticity >= 3 ? 'medium' : 'low';
}

/** Secteurs où l'une de mes entreprises a un produit (en vente ou en chantier). */
export function ownSectorIds(myCompanies: readonly { products: readonly { sectorId: SectorId }[] }[]): Set<SectorId> {
  return new Set(myCompanies.flatMap((c) => c.products.map((p) => p.sectorId)));
}

export function MarketsTab({ openMapFor, company = null }: MapLink) {
  const { view, myCompanies } = useGame();
  const t = useT();
  const mine = ownSectorIds(myCompanies);
  const own = view.sectors.filter((s) => mine.has(s.id));
  const others = view.sectors.filter((s) => !mine.has(s.id));
  return (
    <div className="markets">
      {own.length > 0 && (
        <div className="market-grid">
          {own.map((s) => (
            <SectorCard key={s.id} sector={s} openMapFor={openMapFor} company={company} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <Section title={own.length > 0 ? t.markets.othersTitle : t.markets.allTitle}>
          <SectorRows sectors={others} openMapFor={openMapFor} company={company} />
        </Section>
      )}
    </div>
  );
}

/**
 * Les autres secteurs : une ligne chacun ; le bouton du nom déplie la fiche complète sous la ligne. Sur ordinateur, les
 * colonnes ont des largeurs fixes (styles.css, .market-rows) : une fiche dépliée ne les fait pas bouger.
 */
function SectorRows({ sectors, openMapFor, company }: MapLink & { sectors: SectorView[] }) {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const [expanded, setExpanded] = useState<SectorId[]>([]);
  const hex = isSpatialMap(view.config);
  const toggle = (id: SectorId) => setExpanded((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  return (
    <div className="table-scroll">
      <table className="table market-rows">
        <thead>
          <tr>
            <th>{t.markets.sector}</th>
            <th className="num">{t.markets.refPrice}</th>
            <th className="num">{t.markets.demand}</th>
            <th className="num">{t.markets.mood}</th>
            <th>
              {hex ? (
                <>
                  {t.markets.bestCellLabel} <InfoTip text={t.markets.bestCellTip} align="right" />
                </>
              ) : (
                t.markets.launchLabel
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((s) => {
            const open = expanded.includes(s.id);
            const name = content.sectors[s.id]?.name ?? s.name;
            const detailId = `sector-detail-${s.id}`;
            return (
              <Fragment key={s.id}>
                <tr className={cx('market-row', open && 'open')}>
                  <td>
                    <button
                      type="button"
                      className="market-row-toggle"
                      aria-expanded={open}
                      aria-controls={open ? detailId : undefined}
                      onClick={() => toggle(s.id)}
                    >
                      <span className="market-row-chevron" aria-hidden>
                        {open ? '▾' : '▸'}
                      </span>{' '}
                      <span aria-hidden>{s.emoji}</span> {name}
                    </button>
                  </td>
                  <td className="num">{t.common.perLot(fmt.money(s.refPrice))}</td>
                  <td className="num">{s.lastTotalDemand > 0 ? fmt.lots(s.lastTotalDemand) : '—'}</td>
                  <td className={cx('num', moodTone(s.demandMultiplier))}>×{fmt.num(s.demandMultiplier)}</td>
                  <td>
                    {/* Ligne dépliée : le bouton vers la carte n'est que dans la fiche, en dessous. */}
                    {hex ? <BestCell sector={s} openMapFor={openMapFor} company={company} compact actions={!open} /> : <ClassicLaunch sector={s} />}
                  </td>
                </tr>
                {open && (
                  <tr id={detailId} className="market-row-detail">
                    <td colSpan={5}>
                      <SectorCard sector={s} openMapFor={openMapFor} company={company} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const moodTone = (m: number): 'up' | 'down' | undefined => (m > 1.02 ? 'up' : m < 0.98 ? 'down' : undefined);

/** Carte classique : l'estimation du moteur à la capitale, en une ligne. */
function ClassicLaunch({ sector: s }: { sector: SectorView }) {
  const t = useT();
  const e = s.launchEstimate;
  if (!e) return <span className="muted">—</span>;
  return e.paybackQuarters !== null ? <span className="up">{t.markets.payback(e.paybackQuarters)}</span> : <span className="down">{t.markets.noPayback}</span>;
}

/**
 * Plateau : la meilleure case libre du secteur (règle de l'occasion de lancement de la carte) et, quand une de mes
 * entreprises a un emplacement libre, l'intention qui ouvre la carte sur cette case, formulaire de lancement prêt.
 * L'entreprise qui lance est choisie comme sur la carte : la sélectionnée si elle a de la place, sinon la première qui
 * en a. null sans case qui se rembourse à temps.
 */
export function bestCellLaunch(
  view: PlayerView,
  sector: SectorView,
  selected: CompanyView | null = null,
): { cell: LaunchCell; intent: MapIntent | null } | null {
  const cell = bestLaunchCell(view, sector);
  if (!cell) return null;
  const launcher = launchCompany(view, selected);
  return { cell, intent: launcher ? { kind: 'launch', companyId: launcher.id, sectorId: sector.id, hexId: cell.hexId } : null };
}

/** `actions` : le bouton vers la carte (ou, sans emplacement libre, la mention qui le remplace). */
function BestCell({
  sector: s,
  openMapFor,
  company = null,
  compact = false,
  actions = true,
}: MapLink & { sector: SectorView; compact?: boolean; actions?: boolean }) {
  const { view, myCompanies } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const roomLang = useRoomLang();
  // Hors partie en cours, le moteur ne chiffre aucune case : rien à dire.
  if (!s.launchByHex) return compact ? <span className="muted">—</span> : null;
  const best = bestCellLaunch(view, s, company);
  if (!best) return <span className="muted">{compact ? t.markets.noCell : t.markets.bestCellNone}</span>;
  const { cell, intent } = best;
  const place = hexPlaceLabel(cell.hexId, roomLang, view.siteSlots);
  const name = content.sectors[s.id]?.name ?? s.name;
  return (
    <span className="market-best">
      <span className="up">{compact ? `${place} · ${t.markets.payback(cell.payback)}` : t.markets.bestCell(place, cell.payback, fmt.money(cell.profit))}</span>
      {actions && intent && openMapFor && (
        <button type="button" className="btn tiny ghost" aria-label={t.markets.onMapAria(name, place)} onClick={() => openMapFor(intent)}>
          {t.markets.onMap}
        </button>
      )}
      {/* Aucune de mes entreprises ne peut lancer : la case reste une information, pas une action. */}
      {actions && !intent && myCompanies.length > 0 && <span className="small muted">{t.markets.noSlot}</span>}
    </span>
  );
}

/** Fiche d'un secteur (onglet Marchés). */
export function SectorCard({ sector: s, openMapFor, company = null }: MapLink & { sector: SectorView }) {
  const { view, companiesById } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const label = content.sectors[s.id];
  const name = label?.name ?? s.name;
  const def = SECTORS[s.id];
  const hex = isSpatialMap(view.config);
  const labels = turnLabels(s.demandHistory.length, view.turn - 1, view.config.startYear, { start: t.common.start }, fmt.lang);

  // Partenaires d'une de mes ententes dans ce secteur : je vois leur prix du trimestre en cours (seesCurrentPrice).
  const partners = new Set(
    (view.self?.cartels ?? [])
      .filter((k) => k.sectorId === s.id)
      .flatMap((k) => k.members)
      .filter((m) => m.controllerId !== view.you && companiesById.get(m.companyId)?.controllerId === m.controllerId)
      .map((m) => m.companyId),
  );

  const productIndex = new Map<string, { price: number; ticker: string }>();
  for (const c of view.companies) for (const p of c.products) productIndex.set(p.id, { price: p.price, ticker: c.ticker });

  const rows: ShareRow[] = [...s.shares]
    .sort((a, b) => {
      if (a.productId === 'others') return 1;
      if (b.productId === 'others') return -1;
      return b.share - a.share;
    })
    .map((sh) => {
      if (sh.productId === 'others') {
        return { id: 'others', label: t.markets.others, sublabel: t.markets.offGame, share: sh.share, color: '#bbb', hatched: true };
      }
      const owner = sh.companyId ? companiesById.get(sh.companyId) : undefined;
      const info = productIndex.get(sh.productId);
      return {
        id: sh.productId,
        label: sh.name,
        sublabel: [
          info?.ticker ?? owner?.ticker,
          info ? t.common.perLot(fmt.money(info.price)) : null,
          info && sh.companyId && partners.has(sh.companyId) ? t.markets.partnerPrice : null,
        ]
          .filter(Boolean)
          .join(' · '),
        share: sh.share,
        color: owner?.color ?? '#888',
        highlight: owner?.controllerId === view.you,
      };
    });

  const inputs = Object.entries(s.inputs)
    .map(([cid, q]) => `${COMMODITIES[cid as keyof typeof COMMODITIES]?.emoji ?? ''} ${fmt.num(q ?? 0)}`)
    .join(' · ');

  return (
    <article className="sector-panel">
      <header>
        <h3>
          <span aria-hidden>{s.emoji}</span> {name}
        </h3>
        <p className="small muted italic">{label?.description ?? s.description}</p>
      </header>
      <div className="stat-grid small-stats">
        <Stat label={t.markets.refPrice} value={t.common.perLot(fmt.money(s.refPrice))} />
        <Stat label={t.markets.demand} value={s.lastTotalDemand > 0 ? fmt.lots(s.lastTotalDemand) : '—'} />
        <Stat label={t.markets.mood} value={`×${fmt.num(s.demandMultiplier)}`} tone={moodTone(s.demandMultiplier)} />
        <Stat label={t.markets.refMarket} value={fmt.money(marketSize(s.id))} sub={t.markets.perQuarter} />
        {/* Carte classique : l'estimation du moteur ; sur le plateau, elle vaut pour une case arbitraire (voir plus bas). */}
        {!hex && s.launchEstimate && (
          <Stat
            label={t.markets.launchLabel}
            value={s.launchEstimate.paybackQuarters !== null ? t.markets.payback(s.launchEstimate.paybackQuarters) : t.markets.noPayback}
            sub={s.launchEstimate.paybackQuarters !== null ? t.markets.perQuarterProfit(fmt.money(s.launchEstimate.quarterlyProfit)) : undefined}
            tone={s.launchEstimate.paybackQuarters !== null ? 'up' : 'down'}
          />
        )}
      </div>
      {hex && s.launchByHex && (
        <p className="small sector-best">
          <BestCell sector={s} openMapFor={openMapFor} company={company} />
        </p>
      )}
      {/* Une courbe à un seul point répète la stat « Demande » : on attend le deuxième trimestre. */}
      {s.demandHistory.length >= 2 ? (
        <LineChart
          title={t.markets.demandChart}
          series={[{ id: s.id, label: name, color: '#2e5c8a', values: s.demandHistory }]}
          labels={labels}
          format={(v) => fmt.int(v)}
          height={140}
        />
      ) : (
        s.demandHistory.length === 0 && <p className="small muted">{t.markets.noSalesYet}</p>
      )}
      <div className="chart-title row between wrap">
        <span>
          {t.markets.shares} <InfoTip text={t.markets.intro} />
        </span>
        <span className="market-prices-tag" title={t.markets.rivalPrices}>
          {t.markets.pricesTag}
          {partners.size > 0 && t.markets.pricesTagPartners}
        </span>
      </div>
      <ShareBars rows={rows} />
      <div className="small muted sector-costs">
        {t.markets.costs(fmt.money(s.launchCost), fmt.money(s.capacityCost), fmt.money(s.laborCost))}
        {inputs && t.markets.inputs(inputs)}
        {def && (
          <>
            {t.markets.sensitivity(t.markets.sensitivityLevels[priceSensitivity(def.elasticity)])}{' '}
            <InfoTip text={t.markets.elasticityTip(fmt.num(def.elasticity))} align="right" />
          </>
        )}
      </div>
    </article>
  );
}
