/**
 * Tractations entre joueurs (§7 bis) : offres reçues et envoyées, formulaires (cession d'actions de gré à gré, contrat
 * de fourniture, entente sur les prix), contrats et ententes en cours. Rien ici n'est visible des autres joueurs,
 * sauf ce que le journal publie (cession exécutée, entente découverte).
 */
import { useState } from 'react';
import {
  BLOCK_PRICE_BAND,
  COMMODITIES,
  COMMODITY_IDS,
  CONTRACT_MAX_LOTS,
  CONTRACT_MAX_TURNS,
  contractPriceRange,
  type CommodityId,
  type CompanyView,
  type Offer,
  type SectorId,
} from '@muchomoney/core';
import { sendAction } from '../../api';
import { Empty, Section } from '../../components/bits';
import { Stepper, niceStep } from '../../components/Stepper';
import { useGame } from '../../hooks/useGame';
import { companySectors } from '../../rules';
import { cx } from '../../util';
import { useContent, useT, useUiLang } from '../../i18n';
import { Rich } from '../../i18n/Rich';
import { inputNumber, parseNumber, useFmt } from '../../fmt';
import { DecisionSummary } from './DecisionSummary';
import { shareBlockPreview } from './economicDecisionModel';
import { uiDecisionCopy } from './uiDecisionCopy';

type Kind = 'shares' | 'contract' | 'cartel';

export function DealsTab() {
  const { view } = useGame();
  const t = useT();
  const self = view.self;
  if (!self) return <Empty>{t.deals.noCompany}</Empty>;
  const offers = self.offers ?? [];
  const incoming = offers.filter((o) => o.toId === view.you);
  const outgoing = offers.filter((o) => o.fromId === view.you);
  const waiting = incoming.filter((o) => o.status === 'pending').length;
  const contracts = self.contracts ?? [];
  const cartels = self.cartels ?? [];
  // Sans offre ni dans un sens ni dans l'autre : une seule ligne au lieu de deux sections vides.
  const offersBlock =
    incoming.length === 0 && outgoing.length === 0 ? (
      <p key="offers" className="small muted deals-none">{t.deals.noOffers}</p>
    ) : (
      <div key="offers" className="two-cols">
        <Section title={t.deals.incoming} aside={waiting > 0 ? <span className="badge ink">{t.deals.badge(waiting)}</span> : undefined}>
          {incoming.length > 0 ? (
            <ul className="offer-list">
              {incoming.map((o) => (
                <OfferItem key={o.id} offer={o} />
              ))}
            </ul>
          ) : (
            <p className="small muted">{t.deals.noIncoming}</p>
          )}
        </Section>
        <Section title={t.deals.outgoing}>
          {outgoing.length > 0 ? (
            <ul className="offer-list">
              {outgoing.map((o) => (
                <OfferItem key={o.id} offer={o} />
              ))}
            </ul>
          ) : (
            <p className="small muted">{t.deals.noOutgoing}</p>
          )}
        </Section>
      </div>
    );
  const propose = (
    <Section key="propose" title={t.deals.propose}>
      <ProposeForms />
    </Section>
  );
  return (
    <div className="deals">
      <header className="deals-head">
        <h2>
          <span aria-hidden>🤝</span> {t.deals.title}
        </h2>
        <p className="small muted">{t.deals.intro}</p>
      </header>
      {/* Le formulaire d'abord, sauf quand une offre reçue attend une réponse (la pastille de l'onglet y mène). */}
      {waiting > 0 ? (
        <>
          {offersBlock}
          {propose}
        </>
      ) : (
        <>
          {propose}
          {offersBlock}
        </>
      )}
      {(contracts.length > 0 || cartels.length > 0) && (
        <div className="two-cols">
          {contracts.length > 0 && (
            <Section title={t.deals.contracts}>
              <ContractsList />
            </Section>
          )}
          {cartels.length > 0 && (
            <Section title={t.deals.cartels}>
              <CartelsList />
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

/** Une offre, lue du côté du joueur qui regarde : l'autre partie, l'affaire en clair, l'issue ou les boutons. */
function OfferItem({ offer: o }: { offer: Offer }) {
  const { view, companiesById, playerName } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const incoming = o.toId === view.you;
  const other = incoming ? o.fromId : o.toId;
  const who = (id: string) => (id === view.you ? t.common.you : playerName(id));
  const company = (id: string) => companiesById.get(id)?.name ?? t.common.unknown;
  let line: string;
  let sub: string | null = null;
  if (o.kind === 'shares') {
    line = t.deals.sharesDeal(fmt.int(o.shares), company(o.companyId), fmt.sharePrice(o.price), fmt.money(o.shares * o.price));
    const seller = o.side === 'sell' ? o.fromId : o.toId;
    const buyer = o.side === 'sell' ? o.toId : o.fromId;
    sub = t.deals.sellerBuyer(who(seller), who(buyer));
  } else if (o.kind === 'contract') {
    const cname = content.commodities[o.commodityId]?.name ?? o.commodityId;
    line = t.deals.contract(company(o.sellerCompanyId), company(o.buyerCompanyId), fmt.int(o.lots), cname, fmt.money(o.price), o.turns);
  } else {
    line = t.deals.cartel(company(o.companyId), company(o.targetCompanyId), content.sectors[o.sectorId]?.name ?? o.sectorId);
    sub = t.deals.cartelWarning;
  }
  const act = async (a: Parameters<typeof sendAction>[0]) => {
    setBusy(true);
    setFailure(null);
    try {
      const result = await sendAction(a);
      if (!result.ok) setFailure(result.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={cx('offer', `offer-${o.status}`, o.kind === 'cartel' && 'offer-cartel')}>
      <div className="offer-head small">
        <strong>{incoming ? t.deals.from(playerName(other)) : t.deals.to(playerName(other))}</strong>
        <span className="muted"> · {t.deals.kinds[o.kind]}</span>
        {o.status !== 'pending' && <span className={cx('badge', o.status === 'accepted' && 'ink')}>{t.deals.status[o.status]}</span>}
      </div>
      <p className="offer-line">{line}</p>
      {sub && <p className="small muted">{sub}</p>}
      {o.status === 'pending' && failure && <p id={`offer-${o.id}-error`} className="small warn" role="status">{failure}</p>}
      {o.status === 'pending' && (
        <div className="row wrap">
          {incoming ? (
            <>
              <button type="button" className="btn small primary" disabled={busy} aria-describedby={failure ? `offer-${o.id}-error` : undefined} onClick={() => void act({ type: 'answerOffer', offerId: o.id, accept: true })}>
                {t.deals.accept}
              </button>
              <button type="button" className="btn small ghost" disabled={busy} onClick={() => void act({ type: 'answerOffer', offerId: o.id, accept: false })}>
                {t.deals.decline}
              </button>
            </>
          ) : (
            <button type="button" className="btn small ghost" disabled={busy} onClick={() => void act({ type: 'cancelOffer', offerId: o.id })}>
              {t.deals.cancel}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function ProposeForms() {
  const t = useT();
  const [kind, setKind] = useState<Kind>('shares');
  return (
    <div className="deal-forms">
      <div className="seg" role="group" aria-label={t.deals.propose}>
        {(['shares', 'contract', 'cartel'] as const).map((k) => (
          <button key={k} type="button" className={cx('seg-btn', kind === k && 'active')} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t.deals.kinds[k]}
          </button>
        ))}
      </div>
      {kind === 'shares' && <SharesForm />}
      {kind === 'contract' && <ContractForm />}
      {kind === 'cartel' && <CartelForm />}
    </div>
  );
}

/** Pas et bornes des boutons − et + d'un champ. */
interface Steps {
  step: number;
  min: number;
  max: number;
}

/**
 * Champ saisi en texte libre (« 1 500,5 » comme « 1,500.5 »), validé par le formulaire qui le porte ; avec `steps`,
 * encadré de − et +.
 */
function DealField({
  id,
  label,
  value,
  onChange,
  hint,
  suffix,
  steps,
  invalid,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  suffix?: string;
  steps?: Steps;
  invalid?: boolean;
  describedBy?: string;
}) {
  const uiLang = useUiLang();
  const input = (
    <span className="num-input grow">
      <input id={id} type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} aria-describedby={describedBy} />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {hint && <span className="field-hint">{hint}</span>}
      </label>
      {steps ? (
        <Stepper
          value={value.trim() === '' ? Number.NaN : parseNumber(value, uiLang)}
          step={steps.step}
          min={steps.min}
          max={steps.max}
          onChange={(v) => onChange(inputNumber(v, uiLang))}
        >
          {input}
        </Stepper>
      ) : (
        input
      )}
    </div>
  );
}

function SharesForm() {
  const { view, me, playersById } = useGame();
  const t = useT();
  const fmt = useFmt();
  const uiLang = useUiLang();
  const copy = uiDecisionCopy(uiLang);
  const [side, setSide] = useState<'sell' | 'buy'>('sell');
  const [companyId, setCompanyId] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ draft: string; message: string } | null>(null);
  const active = view.companies.filter((c) => c.status === 'active');
  // Vendre : ce que je détiens ; acheter : ce que d'autres joueurs détiennent.
  const companies =
    side === 'sell'
      ? active.filter((c) => (c.holdings[me.id] ?? 0) > 0)
      : active.filter((c) => Object.entries(c.holdings).some(([id, n]) => id !== me.id && n > 0 && playersById.has(id)));
  const company = companies.find((c) => c.id === companyId) ?? companies[0];
  const others = view.players.filter((p) => p.id !== me.id);
  const counterparts = side === 'sell' || !company ? others : others.filter((p) => (company.holdings[p.id] ?? 0) > 0);
  const counterparty = counterparts.find((p) => p.id === counterpartyId) ?? counterparts[0];
  if (!company) return <p className="small muted">{t.deals.noCounterparty}</p>;
  const n = parseNumber(shares, uiLang);
  const px = price === '' ? company.sharePrice : parseNumber(price, uiLang);
  const min = company.sharePrice * (1 - BLOCK_PRICE_BAND);
  const max = company.sharePrice * (1 + BLOCK_PRICE_BAND);
  const preview = shareBlockPreview(company, me.id, counterparty?.id, side, n, px, me.cash);
  const valid = preview.issue === null;
  const draft = JSON.stringify([side, company.id, counterparty?.id, shares, price]);
  const localReason = preview.issue === 'price' ? copy.price(fmt.sharePrice(min), fmt.sharePrice(max))
    : preview.issue === 'holdings' ? copy.holdings(fmt.int(preview.available))
    : preview.issue === 'cash' ? copy.cash(fmt.money(preview.total), fmt.money(me.cash))
    : preview.issue ? copy[preview.issue] : null;
  const reason = localReason ?? (failure?.draft === draft ? failure.message : null);
  // Actions en jeu : les miennes si je vends, celles de l'autre joueur si j'achète.
  const heldMax = preview.available;
  const holdingHint =
    side === 'sell'
      ? t.deals.held(fmt.int(company.holdings[me.id] ?? 0))
      : counterparty
        ? t.deals.theirs(counterparty.name, fmt.int(company.holdings[counterparty.id] ?? 0))
        : undefined;
  const submit = async () => {
    if (!valid || !counterparty) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await sendAction({ type: 'offerShares', companyId: company.id, counterpartyId: counterparty.id, shares: n, price: px, side });
      if (!result.ok) setFailure({ draft, message: result.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="deal-form">
      <div className="seg" role="group" aria-label={t.deals.kinds.shares}>
        {(['sell', 'buy'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={cx('seg-btn', side === s && 'active')}
            aria-pressed={side === s}
            onClick={() => {
              setSide(s);
              setPrice('');
            }}
          >
            {s === 'sell' ? t.deals.sell : t.deals.buy}
          </button>
        ))}
      </div>
      <div className="deal-fields">
        <div className="field">
          <label htmlFor="deal-share-company">{t.deals.company}</label>
          <select
            id="deal-share-company"
            value={company.id}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setPrice('');
            }}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name} ({c.ticker})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="deal-share-who">{t.deals.counterparty}</label>
          <select id="deal-share-who" value={counterparty?.id ?? ''} onChange={(e) => setCounterpartyId(e.target.value)}>
            {counterparts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <DealField
          id="deal-share-n"
          label={t.deals.shares}
          value={shares}
          onChange={setShares}
          hint={holdingHint}
          steps={{ step: niceStep(heldMax / 20), min: 1, max: heldMax }}
          invalid={['quantity', 'holdings', 'founder'].includes(preview.issue ?? '') && shares.trim() !== ''}
          describedBy={reason ? 'deal-share-reason' : undefined}
        />
        <DealField
          id="deal-share-price"
          label={t.deals.price}
          value={price === '' ? inputNumber(company.sharePrice, uiLang) : price}
          onChange={setPrice}
          hint={t.deals.priceRange(fmt.sharePrice(min), fmt.sharePrice(max))}
          suffix={fmt.unit}
          steps={{ step: niceStep((max - min) / 20, 0.01), min: Math.ceil(min * 100) / 100, max: Math.floor(max * 100) / 100 }}
          invalid={preview.issue === 'price'}
          describedBy={reason ? 'deal-share-reason' : undefined}
        />
      </div>
      {reason && <p id="deal-share-reason" className={cx('small', shares.trim() === '' ? 'muted' : 'warn')} role="status">{reason}</p>}
      {valid && <>
        <p className="small">{t.deals.total(fmt.money(preview.total))}</p>
        <DecisionSummary rows={[{ label: copy.personalAfter, value: fmt.money(preview.personalAfter) }]} note={copy.shareTiming} />
      </>}
      <button type="button" className="btn primary" disabled={!valid || busy} onClick={() => void submit()}>
        {t.deals.send}
      </button>
    </div>
  );
}

function ContractForm() {
  const { view, me, myCompanies } = useGame();
  const t = useT();
  const fmt = useFmt();
  const uiLang = useUiLang();
  const copy = uiDecisionCopy(uiLang);
  const content = useContent();
  const [mineId, setMineId] = useState('');
  const [role, setRole] = useState<'sell' | 'buy'>('sell');
  const [partnerId, setPartnerId] = useState('');
  const [commodityId, setCommodityId] = useState<CommodityId>('oil');
  const [lots, setLots] = useState('20');
  const [price, setPrice] = useState('');
  const [turns, setTurns] = useState('4');
  const [busy, setBusy] = useState(false);
  const mine = myCompanies.find((c) => c.id === mineId) ?? myCompanies[0];
  if (!mine) return <p className="small muted">{t.deals.noCompany}</p>;
  // Partenaires : entreprises d'autres joueurs, et mes autres entreprises (contrat de groupe, sans offre).
  const partners = view.companies.filter((c) => c.status === 'active' && c.id !== mine.id && c.controllerId !== null);
  const partner = partners.find((c) => c.id === partnerId) ?? partners[0];
  if (!partner) return <p className="small muted">{t.deals.noCounterparty}</p>;
  const base = COMMODITIES[commodityId].basePrice;
  const cview = view.commodities.find((c) => c.id === commodityId);
  const market = cview?.price ?? base;
  // Entre deux de mes entreprises : prix de pleine concurrence (± 10 % de la dernière clôture).
  const sameGroup = partner.controllerId === me.id;
  const [min, max] = contractPriceRange(commodityId, cview ?? { price: base, priceHistory: [] }, sameGroup);
  const suggested = Math.min(max, Math.max(min, Math.round(market)));
  const nLots = parseNumber(lots, uiLang);
  const nTurns = parseNumber(turns, uiLang);
  const px = price === '' ? suggested : parseNumber(price, uiLang);
  const valid =
    Number.isInteger(nLots) && nLots > 0 && nLots <= CONTRACT_MAX_LOTS && Number.isInteger(nTurns) && nTurns > 0 && nTurns <= CONTRACT_MAX_TURNS && px >= min - 1e-9 && px <= max + 1e-9;
  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await sendAction({
        type: 'offerContract',
        sellerCompanyId: role === 'sell' ? mine.id : partner.id,
        buyerCompanyId: role === 'sell' ? partner.id : mine.id,
        commodityId,
        lots: nLots,
        price: px,
        turns: nTurns,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="deal-form">
      <div className="deal-fields">
        {/* « Mon entreprise [vend | achète] » : se lit comme une phrase. */}
        <div className="field wide">
          <label htmlFor="deal-k-mine">{t.deals.myCompany}</label>
          <div className="field-row wrap">
            <select id="deal-k-mine" value={mine.id} onChange={(e) => setMineId(e.target.value)}>
              {myCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
            <div className="seg" role="group" aria-label={t.deals.myCompany}>
              {(['sell', 'buy'] as const).map((r) => (
                <button key={r} type="button" className={cx('seg-btn', role === r && 'active')} aria-pressed={role === r} onClick={() => setRole(r)}>
                  {r === 'sell' ? t.deals.roleSell : t.deals.roleBuy}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="deal-k-partner">{t.deals.partner}</label>
          <select
            id="deal-k-partner"
            value={partner.id}
            onChange={(e) => {
              setPartnerId(e.target.value);
              setPrice('');
            }}
          >
            {partners.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
                {c.controllerId === me.id ? ` (${t.common.you})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="deal-k-commodity">{t.deals.commodity}</label>
          <select
            id="deal-k-commodity"
            value={commodityId}
            onChange={(e) => {
              setCommodityId(e.target.value as CommodityId);
              setPrice('');
            }}
          >
            {COMMODITY_IDS.map((cid) => (
              <option key={cid} value={cid}>
                {content.commodities[cid]?.emoji} {content.commodities[cid]?.name ?? cid}
              </option>
            ))}
          </select>
        </div>
        <DealField id="deal-k-lots" label={t.deals.lots} value={lots} onChange={setLots} suffix="lots" steps={{ step: 1, min: 1, max: CONTRACT_MAX_LOTS }} />
        <DealField
          id="deal-k-price"
          label={t.deals.lotPrice}
          value={price === '' ? inputNumber(suggested, uiLang) : price}
          onChange={setPrice}
          hint={t.deals.lotRange(fmt.money(min), fmt.money(max), fmt.money(market))}
          suffix={`${fmt.unit}/lot`}
          steps={{ step: niceStep((max - min) / 20, 0.01), min: Math.ceil(min * 100) / 100, max: Math.floor(max * 100) / 100 }}
        />
        <DealField id="deal-k-turns" label={t.deals.turns} value={turns} onChange={setTurns} steps={{ step: 1, min: 1, max: CONTRACT_MAX_TURNS }} />
      </div>
      {valid && <DecisionSummary rows={[
        { label: copy.payer, value: role === 'sell' ? partner.name : mine.name },
        { label: copy.recipient, value: role === 'sell' ? mine.name : partner.name },
        { label: copy.perQuarter, value: fmt.money(nLots * px) },
        { label: copy.contractTotal(nTurns), value: fmt.money(nLots * px * nTurns) },
        { label: copy.firstDelivery, value: copy.closeAt(fmt.date(view.turn, view.config.startYear)) },
      ]} note={sameGroup ? copy.contractImmediate : copy.contractPending} />}
      <p className="small muted">{t.deals.contractHint}</p>
      {sameGroup && <p className="small muted">{t.deals.sameGroup}</p>}
      <button type="button" className="btn primary" disabled={!valid || busy} onClick={() => void submit()}>
        {sameGroup ? copy.createContract : t.deals.send}
      </button>
    </div>
  );
}

function CartelForm() {
  const { view, me, myCompanies } = useGame();
  const t = useT();
  const content = useContent();
  const [mineId, setMineId] = useState('');
  const [sectorId, setSectorId] = useState<SectorId | ''>('');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = myCompanies.find((c) => c.id === mineId) ?? myCompanies[0];
  if (!mine) return <p className="small muted">{t.deals.noCompany}</p>;
  const sectors = companySectors(mine);
  const sector = sectors.find((s) => s === sectorId) ?? sectors[0];
  // Déjà dans une entente sur ce secteur : l'invité la rejoindra (ses membres ne sont pas des cibles).
  const myCartel = (view.self?.cartels ?? []).find((k) => k.sectorId === sector && k.members.some((m) => m.companyId === mine.id));
  const taken = new Set(myCartel?.members.map((m) => m.controllerId) ?? []);
  const targets: CompanyView[] = sector
    ? view.companies.filter(
        (c) => c.status === 'active' && c.controllerId !== null && c.controllerId !== me.id && !taken.has(c.controllerId) && c.products.some((p) => p.sectorId === sector),
      )
    : [];
  const target = targets.find((c) => c.id === targetId) ?? targets[0];
  const submit = async () => {
    if (!sector || !target) return;
    setBusy(true);
    try {
      await sendAction({ type: 'proposeCartel', companyId: mine.id, targetCompanyId: target.id, sectorId: sector });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="deal-form">
      <p className="small warn">{t.deals.cartelWarning}</p>
      {myCartel && <p className="small muted">{t.deals.inviteHint}</p>}
      <div className="deal-fields">
        <div className="field">
          <label htmlFor="deal-e-mine">{t.deals.myCompany}</label>
          <select id="deal-e-mine" value={mine.id} onChange={(e) => setMineId(e.target.value)}>
            {myCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="deal-e-sector">{t.deals.sector}</label>
          <select id="deal-e-sector" value={sector ?? ''} onChange={(e) => setSectorId(e.target.value as SectorId)}>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {content.sectors[s]?.emoji} {content.sectors[s]?.name ?? s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="deal-e-target">{t.deals.target}</label>
          <select id="deal-e-target" value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)} disabled={targets.length === 0}>
            {targets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {targets.length === 0 && <p className="small muted">{t.deals.noTarget}</p>}
      <button type="button" className="btn danger" disabled={!target || busy} onClick={() => void submit()}>
        {t.deals.sendCartel}
      </button>
    </div>
  );
}

function ContractsList() {
  const { view, companiesById } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const contracts = view.self?.contracts ?? [];
  if (contracts.length === 0) return null;
  const company = (id: string) => companiesById.get(id)?.name ?? t.common.unknown;
  return (
    <ul className="offer-list">
      {contracts.map((k) => (
        <li key={k.id} className="offer">
          <p className="offer-line">
            {t.deals.contractLine(company(k.sellerCompanyId), company(k.buyerCompanyId), fmt.int(k.lots), content.commodities[k.commodityId]?.name ?? k.commodityId, fmt.money(k.price))}
          </p>
          <p className="small muted">
            {t.deals.turnsLeft(k.turnsLeft)}
            {k.lastDelivered !== undefined && <> · {t.deals.delivered(fmt.int(k.lastDelivered))}</>}
            {k.lastPenalty !== undefined && <> · {t.deals.penalty(fmt.money(k.lastPenalty))}</>}
          </p>
        </li>
      ))}
    </ul>
  );
}

function CartelsList() {
  const { view, companiesById } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const [busy, setBusy] = useState(false);
  const cartels = view.self?.cartels ?? [];
  if (cartels.length === 0) return null;
  return (
    <ul className="offer-list">
      {cartels.map((k) => {
        const names = k.members.map((m) => companiesById.get(m.companyId)?.name ?? t.common.unknown).join(', ');
        const mine = k.members.find((m) => m.controllerId === view.you);
        return (
          <li key={k.id} className="offer offer-cartel">
            <p className="offer-line">{t.deals.cartelMembers(content.sectors[k.sectorId]?.name ?? k.sectorId, names)}</p>
            <p className="small warn">
              <Rich text={t.deals.cartelRisk(`**${fmt.pct(k.risk, 0)}**`)} />
            </p>
            <p className="small muted">{t.deals.cartelPrices}</p>
            {mine?.leaving && <p className="small muted">{t.deals.leaving}</p>}
            {mine && !mine.leaving && (
              <button
                type="button"
                className="btn small ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await sendAction({ type: 'leaveCartel', companyId: mine.companyId, sectorId: k.sectorId });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t.deals.leave}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
