import { useState } from 'react';
import type { CommodityId, CommodityView, CompanyView, SupplyContract } from '@muchomoney/core';
import { COMMODITIES, COMMODITY_IDS, SECTORS, SECTOR_IDS } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useGame } from '../../hooks/useGame';
import { AmountForm } from '../../components/AmountForm';
import { LineChart } from '../../components/LineChart';
import { Delta, InfoTip, Section } from '../../components/bits';
import {
  COMMODITY_SELL_HAIRCUT,
  EMERGENCY_PURCHASE_MARKUP,
  commodityBuyCost,
  commodityPriceAfter,
  commoditySellProceeds,
  commodityOrderMax,
  commodityOutlook,
  type CommodityOutlook,
  maxAffordableLots,
  maxSellableLots,
  priceChange,
} from '../../rules';
import { cx, turnLabels } from '../../util';
import { useContent, useT, useUiLang } from '../../i18n';
import { Rich } from '../../i18n/Rich';
import { useFmt } from '../../fmt';
import { closeIsShort, closeReserve, materialGaps, MaterialGapRow } from './CompanyMaterials';
import { uiDecisionCopy } from './uiDecisionCopy';

interface Props {
  company: CompanyView | null;
  onSelect: (id: string) => void;
}

const EPS = 1e-9;

/**
 * La matière compte pour l'entreprise ce trimestre : un besoin, du stock, quelque chose qui arrive ou part à la clôture,
 * un contrat en cours (reçu ou dû, même non livrable) ou une filiale qui l'extrait (même en sommeil). Les autres se
 * replient : une ligne grise sous le tableau des besoins, leurs cartes dans « Autres matières ».
 */
export function commodityInUse(company: CompanyView, commodityId: CommodityId, o: CommodityOutlook, contracts: readonly SupplyContract[] = []): boolean {
  if (o.need > EPS || o.stock > EPS || o.sites > EPS || o.contractsIn > EPS || o.contractsOut > EPS) return true;
  const party = (k: SupplyContract) => k.buyerCompanyId === company.id || k.sellerCompanyId === company.id;
  if (contracts.some((k) => k.turnsLeft > 0 && k.commodityId === commodityId && party(k))) return true;
  return (company.sites ?? []).some((s) => s.commodityId === commodityId);
}

/**
 * Matières de l'entreprise, la plus demandée d'abord (à égalité, l'ordre du marché), puis les autres.
 * Sans entreprise, tout est « utilisé » : rien à replier.
 */
export function splitCommodities(
  commodities: readonly CommodityView[],
  company: CompanyView | null,
  outlook: Record<CommodityId, CommodityOutlook> | null,
  contracts: readonly SupplyContract[] = [],
): { used: CommodityView[]; unused: CommodityView[] } {
  if (!company || !outlook) return { used: [...commodities], unused: [] };
  const used = commodities.filter((c) => commodityInUse(company, c.id, outlook[c.id], contracts));
  used.sort((a, b) => outlook[b.id].need - outlook[a.id].need);
  return { used, unused: commodities.filter((c) => !used.includes(c)) };
}

/**
 * Place des cartes : la grille principale reçoit les matières `mainIds` (dans cet ordre), le volet « Autres matières »
 * les autres, dans l'ordre du marché.
 */
export function placeCommodityCards(
  commodities: readonly CommodityView[],
  mainIds: readonly CommodityId[],
): { main: CommodityView[]; fold: CommodityView[] } {
  const main = mainIds.flatMap((id) => commodities.find((c) => c.id === id) ?? []);
  return { main, fold: commodities.filter((c) => !mainIds.includes(c.id)) };
}

export function CommoditiesTab({ company, onSelect }: Props) {
  const { view, myCompanies } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const copy = uiDecisionCopy(useUiLang());
  const contracts = view.self?.contracts ?? [];
  const outlook = company ? commodityOutlook(company, view.turn, contracts) : null;
  const gaps = company ? materialGaps(company, view.commodities, view.turn, contracts) : [];
  const { used, unused } = splitCommodities(view.commodities, company, outlook, contracts);
  // Les cartes restent où le joueur les a trouvées jusqu'au trimestre suivant : un achat spéculatif dans le volet ou la
  // vente du dernier lot ne déplace pas la carte sous le curseur. Le tableau des besoins, lui, suit le stock en direct.
  // (L'onglet est remonté à chaque visite et à chaque changement d'entreprise : la répartition y est recalculée.)
  const liveIds = used.map((c) => c.id);
  const [placed, setPlaced] = useState({ turn: view.turn, ids: liveIds });
  if (placed.turn !== view.turn) setPlaced({ turn: view.turn, ids: liveIds });
  const cards = placeCommodityCards(view.commodities, placed.turn === view.turn ? placed.ids : liveIds);
  const nameOf = (c: CommodityView) => content.commodities[c.id]?.name ?? c.name;
  const card = (c: CommodityView) => <CommodityCard key={`${company?.id ?? 'none'}:${c.id}`} commodity={c} company={company} />;

  return (
    <div className="commodities">
      {myCompanies.length > 1 && (
        <nav className="company-switch" aria-label={t.commodities.warehouseAria}>
          <span className="small muted">{t.commodities.warehouse}</span>
          {myCompanies.map((c) => (
            <button key={c.id} type="button" className={cx('chip', company?.id === c.id && 'active')} onClick={() => onSelect(c.id)}>
              {c.emoji} {c.name}
            </button>
          ))}
        </nav>
      )}
      {!company && (
        <p className="notice">{t.commodities.noCompany}</p>
      )}

      {company && outlook && (
        <Section title={t.commodities.needsTitle(company.name)}>
          {used.length > 0 && (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.commodities.cols.commodity}</th>
                    <th className="num">{t.commodities.cols.need}</th>
                    <th className="num">{t.commodities.cols.stock}</th>
                    <th className="num">
                      {t.commodities.cols.incoming} <InfoTip text={t.commodities.incomingTip} />
                    </th>
                    <th className="num">{t.commodities.cols.missing}</th>
                    <th className="num">{t.commodities.cols.surplus}</th>
                    <th className="num">
                      {t.commodities.cols.surcharge} <InfoTip text={t.tips.emergency(fmt.pct(EMERGENCY_PURCHASE_MARKUP - 1, 0))} align="right" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {used.map((c) => {
                    const o = outlook[c.id];
                    const incoming = o.sites + o.contractsIn - o.contractsOut;
                    return (
                      <tr key={c.id}>
                        <td>
                          {c.emoji} {nameOf(c)}
                        </td>
                        <td className="num">{fmt.num(o.need)}</td>
                        <td className="num">{fmt.num(o.stock)}</td>
                        <td
                          className={cx('num', incoming > 0 && 'up')}
                          title={t.commodities.incomingTitle(fmt.num(o.sites), fmt.num(o.contractsIn), fmt.num(o.contractsOut))}
                        >
                          {signedLots(incoming, fmt.num)}
                        </td>
                        <td className={cx('num', o.missing > 0 && 'down')}>{o.missing > 0 ? fmt.num(o.missing) : '—'}</td>
                        <td className="num">{o.surplus > 0 ? fmt.num(o.surplus) : '—'}</td>
                        <td className="num">{o.missing > 0 ? fmt.money(o.missing * c.price * (EMERGENCY_PURCHASE_MARKUP - 1)) : '—'}</td>
                      </tr>
                    );
                  })}
                  {unused.length > 0 && (
                    <tr className="commodities-unused">
                      <td colSpan={7} className="small muted">
                        {t.commodities.unused(unused.map(nameOf).join(', '))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {used.length === 0 && <p className="small muted">{t.commodities.unused(unused.map(nameOf).join(', '))}</p>}
          <p className="small muted">{t.commodities.needsNote(fmt.num(EMERGENCY_PURCHASE_MARKUP))}</p>
          {gaps.length > 0 && <div className="company-materials">
            <h4>{copy.coverNeeds}</h4>
            <p className="small muted">{copy.coverNote}</p>
            {closeIsShort(company) && <p className="small warn material-short">{t.materials.closeShort}</p>}
            <ul className="material-gaps">
              {gaps.map((gap) => <MaterialGapRow key={`${company.id}:${gap.commodityId}`} company={company} gap={gap} reserve={closeReserve(company)} />)}
            </ul>
          </div>}
        </Section>
      )}

      {cards.main.length > 0 && <div className="commodity-grid">{cards.main.map(card)}</div>}
      {/* Achat spéculatif d'une matière inutilisée : toujours à un clic. */}
      {cards.fold.length > 0 && (
        <details className="tab-fold">
          <summary>{t.commodities.otherCards(cards.fold.length)}</summary>
          <div className="commodity-grid">{cards.fold.map(card)}</div>
        </details>
      )}

      <details className="tab-fold">
        <summary>{t.commodities.recipes}</summary>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t.commodities.sector}</th>
                {COMMODITY_IDS.map((id) => (
                  <th key={id} className="num">
                    {content.commodities[id]?.emoji} {content.commodities[id]?.name ?? id}
                  </th>
                ))}
                <th className="num">{t.commodities.labor}</th>
                <th className="num">{t.commodities.matCost}</th>
              </tr>
            </thead>
            <tbody>
              {SECTOR_IDS.map((sid) => {
                const s = SECTORS[sid];
                const label = content.sectors[sid];
                if (!s) return null;
                const matCost = COMMODITY_IDS.reduce((sum, cid) => {
                  const spot = view.commodities.find((c) => c.id === cid)?.price ?? COMMODITIES[cid]?.basePrice ?? 0;
                  return sum + (s.inputs[cid] ?? 0) * spot;
                }, 0);
                return (
                  <tr key={sid}>
                    <td>
                      {s.emoji} {label?.name ?? s.name}
                    </td>
                    {COMMODITY_IDS.map((cid) => (
                      <td key={cid} className="num">
                        {s.inputs[cid] ? fmt.num(s.inputs[cid] ?? 0) : '—'}
                      </td>
                    ))}
                    <td className="num">{fmt.money(s.laborCost)}</td>
                    <td className="num">{fmt.money(matCost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** « +40 », « −10 » ou « — » : lots qui arrivent (ou partent) à la clôture. */
function signedLots(n: number, num: (x: number) => string): string {
  if (Math.abs(n) < EPS) return '—';
  return n > 0 ? `+${num(n)}` : `−${num(-n)}`;
}

/**
 * Carte d'une matière : cours, courbe, puis l'entrepôt et les ordres. Besoin et arrivées de la clôture ne sont que
 * dans le tableau ; le plafond par ordre reste juste au-dessus des formulaires.
 */
function CommodityCard({ commodity: c, company }: { commodity: CommodityView; company: CompanyView | null }) {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const label = useContent().commodities[c.id];
  const name = label?.name ?? c.name;
  const def = COMMODITIES[c.id];
  const history = [...c.priceHistory, c.price];
  const labels = turnLabels(history.length, view.turn - 1, view.config.startYear, { start: t.common.start, now: t.common.live }, fmt.lang);
  const inv = company?.private?.inventory[c.id];
  const stock = inv?.lots ?? 0;
  const sellableLots = maxSellableLots(c.id, stock);
  const cash = Math.max(0, company?.cash ?? 0);
  const baseInfo = def && <div className="small muted">{t.commodities.baseInfo(fmt.sharePrice(def.basePrice), fmt.lots(commodityOrderMax(c.id)))}</div>;

  return (
    <article className="commodity-card">
      <header className="row between">
        <div>
          <span className="commodity-emoji" aria-hidden>
            {c.emoji}
          </span>{' '}
          <strong>{name}</strong> <span className="small muted">({label?.unit ?? c.unit})</span>
        </div>
        <div className="num">
          <strong>{fmt.sharePrice(c.price)}</strong>/lot <Delta value={priceChange(c.priceHistory, c.price)} />
        </div>
      </header>
      <LineChart series={[{ id: c.id, label: name, color: '#6b4f2a', values: history }]} labels={labels} format={fmt.sharePrice} height={140} />
      {!company && baseInfo}
      {company && (
        <>
          <div className="inventory small">
            <Rich text={t.commodities.stockOf(company.name, fmt.num(stock), Math.round(stock * 100) / 100)} />
            {inv && inv.lots > 0 && <>{t.commodities.avgCost(fmt.sharePrice(inv.avgCost))}</>}
          </div>
          {baseInfo}
          <div className="two-cols tight">
            <AmountForm
              label={t.trade.buy}
              unit="lots"
              max={maxAffordableLots(c.id, c.price, cash)}
              submitLabel={t.trade.buy}
              presets={[0.25, 1]}
              info={(n) => {
                const cost = commodityBuyCost(c.id, c.price, n);
                return (
                  <Rich text={t.commodities.buyInfo(fmt.money(cost), fmt.sharePrice(cost / n), fmt.sharePrice(commodityPriceAfter(c.id, c.price, n, 'buy')))} />
                );
              }}
              after={(n) => t.form.cashAfter(fmt.money(company.cash - commodityBuyCost(c.id, c.price, n)))}
              onSubmit={(lots) => sendAction({ type: 'buyCommodity', companyId: company.id, commodityId: c.id, lots })}
            />
            <AmountForm
              label={t.trade.sell}
              unit="lots"
              max={sellableLots}
              submitLabel={t.trade.sell}
              presets={[0.5, 1]}
              disabledReason={stock <= 0 ? t.commodities.empty : sellableLots < 1 ? t.commodities.belowOneLot : null}
              info={(n) => {
                const proceeds = commoditySellProceeds(c.id, c.price, n);
                return (
                  <Rich
                    text={t.commodities.sellInfo(
                      fmt.money(proceeds),
                      fmt.pct(1 - COMMODITY_SELL_HAIRCUT, 0),
                      fmt.sharePrice(commodityPriceAfter(c.id, c.price, n, 'sell')),
                    )}
                  />
                );
              }}
              after={(n) => t.form.cashStockAfter(fmt.money(company.cash + commoditySellProceeds(c.id, c.price, n)), fmt.lots(stock - n))}
              onSubmit={(lots) => sendAction({ type: 'sellCommodity', companyId: company.id, commodityId: c.id, lots })}
            />
          </div>
        </>
      )}
    </article>
  );
}
