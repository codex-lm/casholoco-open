import { useState } from 'react';
import type { CommodityId, CommodityView, CompanyView, SupplyContract } from '@muchomoney/core';
import { COMMODITIES, COMMODITY_IDS } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useGame } from '../../hooks/useGame';
import { InfoTip, Section } from '../../components/bits';
import { EMERGENCY_PURCHASE_MARKUP, commodityBuyCost, commodityOrderMax, commodityOutlook, maxAffordableLots } from '../../rules';
import { cx } from '../../util';
import { useContent, useT } from '../../i18n';
import { Rich } from '../../i18n/Rich';
import { useFmt } from '../../fmt';
import type { TabId } from '../GameScreen';
import type { MapIntent } from './mapIntent';

const EPS = 1e-6;

/** Lots à une décimale (« 24,5 ») : les besoins viennent de recettes fractionnaires. */
const tenths = (n: number) => Math.round(n * 10) / 10;

/** Une matière qui manquera à la clôture : à la production enregistrée, ou aux acheteurs d'un contrat. */
export interface MaterialGap {
  commodityId: CommodityId;
  /** Manque de la production enregistrée (lots, décimaux) : acheté d'urgence à la clôture. */
  missing: number;
  /** Lots dus par contrat que le stock et l'extraction ne couvrent pas : pénalité à la clôture (§7 bis). */
  undeliverable: number;
  /** Lots entiers qui couvriraient tout (le marché ne vend que des lots entiers). */
  wanted: number;
  /** Lots que le bouton achète : `wanted`, borné par le plafond d'un ordre et par la trésorerie hors réserve de la clôture. */
  lots: number;
  /** Ce qui borne l'achat sous `wanted`. */
  cap: 'order' | 'cash' | null;
  /** Coût de l'achat maintenant, hausse du cours comprise (sur `wanted` si rien n'est achetable). */
  now: number;
  /** Ce que la clôture ferait payer pour les mêmes lots : achat d'urgence au cours × 1,1 (une pénalité de contrat revient au même). */
  atClose: number;
  /** Trésorerie après l'achat : jamais sous la réserve de la clôture (`closeReserve`). */
  cashAfter: number;
  /** Acheter maintenant revient moins cher qu'attendre la clôture. */
  cheaperNow: boolean;
  /** Bouton mis en avant : moins cher maintenant, et une clôture qui ne manque pas déjà d'argent. */
  primary: boolean;
}

/** Ce que la clôture prend d'abord sur la trésorerie : ses obligations (sinon faillite), puis les mises en cours. */
export function closeReserve(company: CompanyView): number {
  const plan = company.private?.closePlan;
  return plan ? Math.max(0, plan.obligations.total) + Math.max(0, plan.bids) : 0;
}

/** La clôture manque déjà d'argent (faillite, ou production et marketing réduits) : aucun achat n'est mis en avant. */
export function closeIsShort(company: CompanyView): boolean {
  const plan = company.private?.closePlan;
  return Boolean(plan && (plan.bankrupt || plan.shortfall > 0));
}

/**
 * Manques de l'entreprise d'ici la clôture, dans l'ordre du marché (`commodityOutlook`, sur les réglages enregistrés).
 * Les contrats sont servis avant la production : un lot acheté va d'abord au contrat non livrable, d'où un seul manque
 * par matière, contrat compris. Le coût à la clôture est l'achat d'urgence (cours × 1,1, sans hausse du cours) ; pour
 * un lot de contrat non livré, la pénalité (cours × 1,1 − prix du contrat) plus la vente perdue revient au même.
 *
 * L'achat ne touche pas à ce que la clôture prélève d'abord (`closeReserve`) : ses obligations, payées en tête sur la
 * trésorerie (faillite sinon), et les mises en cours ; l'achat d'urgence, lui, ne se paie qu'après, avec le reste et les
 * ventes. Un manque qui s'affiche « 0,0 » (moins de 0,05 lot) n'a pas de ligne : la clôture l'achète pour presque rien.
 */
export function materialGaps(
  company: CompanyView,
  commodities: readonly CommodityView[],
  turn: number,
  contracts: readonly SupplyContract[] = [],
): MaterialGap[] {
  const outlook = commodityOutlook(company, turn, contracts);
  const spendable = Math.max(0, company.cash - closeReserve(company));
  const short = closeIsShort(company);
  const out: MaterialGap[] = [];
  for (const cid of COMMODITY_IDS) {
    const o = outlook[cid];
    const undeliverable = Math.max(0, o.owed - o.contractsOut);
    if (tenths(o.missing) <= 0 && tenths(undeliverable) <= 0) continue;
    const gap = o.missing + undeliverable;
    const price = commodities.find((c) => c.id === cid)?.price ?? COMMODITIES[cid]?.basePrice ?? 0;
    const wanted = Math.max(1, Math.ceil(gap - EPS));
    const orderMax = commodityOrderMax(cid);
    const affordable = maxAffordableLots(cid, price, spendable);
    const lots = Math.min(wanted, orderMax, affordable);
    const cap = lots >= wanted ? null : orderMax <= affordable ? 'order' : 'cash';
    const basis = lots > 0 ? lots : wanted;
    const now = commodityBuyCost(cid, price, basis);
    const atClose = Math.min(gap, basis) * price * EMERGENCY_PURCHASE_MARKUP;
    const cheaperNow = lots > 0 && now < atClose - EPS;
    out.push({
      commodityId: cid,
      missing: o.missing,
      undeliverable,
      wanted,
      lots,
      cap,
      now,
      atClose,
      cashAfter: company.cash - (lots > 0 ? now : 0),
      cheaperNow,
      primary: cheaperNow && !short,
    });
  }
  return out;
}

/**
 * « Matières pour ce trimestre » (« Mon entreprise », sous les produits) : une ligne par matière qui manquera, avec le
 * coût d'un achat maintenant face à l'achat d'urgence de la clôture et un bouton qui n'achète qu'au clic ; sinon
 * « Matières couvertes ». Lit les réglages enregistrés : avec l'enregistrement au relâcher, ceux à l'écran.
 */
export function CompanyMaterials({ company, goTo, openMapFor }: { company: CompanyView; goTo: (tab: TabId) => void; openMapFor: (intent: MapIntent) => void }) {
  const { view } = useGame();
  const t = useT();
  const m = t.materials;
  const fmt = useFmt();
  const gaps = materialGaps(company, view.commodities, view.turn, view.self?.contracts ?? []);
  const reserve = closeReserve(company);
  // Le lien nomme l'onglet comme la barre, sans son emoji.
  const tab = t.game.tabs.commodities.replace(/^\S+\s/, '');
  return (
    <Section
      title={
        <>
          {m.title} <InfoTip text={m.tip(fmt.num(EMERGENCY_PURCHASE_MARKUP))} align="left" />
        </>
      }
      className="company-materials"
      aside={
        <span className="row wrap company-materials-links">
          <button type="button" className="btn small" onClick={() => openMapFor({ kind: 'deposit', companyId: company.id })}>
            {t.company.bidOnDeposit}
          </button>
          <button type="button" className="btn small ghost" onClick={() => goTo('commodities')}>
            {m.detail(tab)}
          </button>
        </span>
      }
    >
      {gaps.length === 0 ? (
        <p className="small up material-covered">{m.covered}</p>
      ) : (
        <>
          {/* Clôture déjà à court : aucun achat mis en avant, et le bandeau du haut dit quoi faire. */}
          {closeIsShort(company) && <p className="small warn material-short">{m.closeShort}</p>}
          <ul className="material-gaps">
            {gaps.map((gap) => (
              <MaterialGapRow key={gap.commodityId} company={company} gap={gap} reserve={reserve} />
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

export function MaterialGapRow({ company, gap, reserve }: { company: CompanyView; gap: MaterialGap; reserve: number }) {
  const t = useT();
  const m = t.materials;
  const fmt = useFmt();
  const content = useContent();
  const [busy, setBusy] = useState(false);
  const label = content.commodities[gap.commodityId];
  const name = `**${label?.emoji ?? COMMODITIES[gap.commodityId]?.emoji ?? ''} ${label?.name ?? gap.commodityId}**`;
  const missing = tenths(gap.missing);
  const owed = tenths(gap.undeliverable);
  const head = missing > 0 ? m.gap(name, m.short(fmt.num(missing), missing)) : name;
  const kept = fmt.money(reserve);
  const capNote =
    gap.lots < 1
      ? reserve > 0 ? m.noCashReserve(kept) : m.noCash
      : gap.cap === 'order'
        ? m.cappedOrder(fmt.lots(commodityOrderMax(gap.commodityId)))
        : gap.cap === 'cash'
          ? reserve > 0 ? m.cappedReserve(fmt.lots(gap.lots), kept) : m.cappedCash(fmt.lots(gap.lots))
          : null;
  const notes = [capNote, gap.lots > 0 ? m.cashAfter(fmt.money(gap.cashAfter)) : null].filter(Boolean).join(' · ');
  // Pourquoi le bouton n'est pas mis en avant, ou achète plus que le manque : une bulle atteignable au clavier.
  const tip = [
    gap.lots > 0 && !gap.cheaperNow && m.notCheaper,
    gap.lots > gap.missing + gap.undeliverable + EPS && m.wholeLots(fmt.lots(gap.lots)),
  ]
    .filter((x): x is string => typeof x === 'string')
    .join(' ');
  const buy = async () => {
    setBusy(true);
    try {
      await sendAction({ type: 'buyCommodity', companyId: company.id, commodityId: gap.commodityId, lots: gap.lots });
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="material-gap" data-commodity={gap.commodityId}>
      <div className="material-gap-text">
        <Rich text={head} /> <span className="muted">— {m.costs(fmt.money(gap.now), fmt.money(gap.atClose), fmt.num(EMERGENCY_PURCHASE_MARKUP))}</span>
        {notes && <div className="small muted">{notes}</div>}
        {owed > 0 && <div className="small warn">{m.contract(fmt.num(owed), owed)}</div>}
      </div>
      <span className="material-gap-buy">
        <button type="button" className={cx('btn small', gap.primary && 'primary')} disabled={busy || gap.lots < 1} onClick={() => void buy()}>
          {m.buy(fmt.lots(gap.lots > 0 ? gap.lots : gap.wanted))}
        </button>
        {tip && <InfoTip text={tip} align="right" />}
      </span>
    </li>
  );
}
