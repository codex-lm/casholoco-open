/**
 * Formulaires de lancement autonomes : pour un emplacement déjà choisi, le secteur, le nom et ses
 * idées, les estimations et la validation. Mode classique : ZoneLaunchForm pour une zone, avec les
 * textes de coût/financement/estimation et la fiche de la zone (le panneau latéral de « La carte »
 * la monte directement). Mode hexagonal : HexLaunchForm pour une case, avec les projets en attente,
 * le choix de repli et l'enchère. Le résumé d'enchère HexBidSummary et les aides partagées des
 * formulaires hexagonaux (initialBidHex, cellReason, HexFallbackChoice, HexBidRules, HexPendingProjects) vivent
 * aussi ici ; HexBidForms.tsx les réexporte pour la création de start-up.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { CompanyView, PlayerView, SectorId, ZoneId } from '@muchomoney/core';
import { SECTORS, SECTOR_IDS, DEFAULT_ZONE, hexPlaceLabel, hexPlaceName } from '@muchomoney/core';
import { sendAction } from '../../api';
import { AmountForm } from '../../components/AmountForm';
import { FreightDetails } from '../../components/FreightDetails';
import { launchFreightClassic, launchFreight, productFreight } from './city/freight';
import { useGame } from '../../hooks/useGame';
import { LAUNCH_AMORTIZATION_TURNS, MAX_ACTIVE_PRODUCTS, MAX_ACTIVE_PRODUCTS_MERGED, maxProductsOf, productCount } from '../../rules';
import { cx } from '../../util';
import { useContent, useRoomContent, useRoomLang, useT, useUiLang } from '../../i18n';
import { parseNumber, useFmt } from '../../fmt';
import { bestLaunchZone, launchZoneEstimates, selectedLaunchEstimate } from './launchPickerModel';
import { hexEstimate, type HexReference } from './city/hexModel';
import { liveHexBids, ownCompany, ownHexProduct } from './city/privacy';
import { hexBidVerdict, hexCellBid, hexLaunchCost, type HexBidKind } from './hexPayback';
import type { hexFormsFr } from '../../i18n/hexForms-fr';
import { decisionText } from '../../i18n/decisionReadability';
import { DecisionSummary } from './DecisionSummary';
import './HexBidForms.css';

function shuffled<T>(list: readonly T[], n: number): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/** La zone d'une ville porte le nom de sa ville ; la plaine et la montagne ont les leurs. */
function zoneName(mapNames: ReturnType<typeof useContent>['mapNames'], z: ZoneId): string {
  return z === 'plain' || z === 'mountain' ? mapNames.zones[z] : mapNames.cities[z];
}

/**
 * Fiche de la zone d'un lancement, rendue dans ZoneLaunchForm pour la zone choisie
 * (coût, bénéfice, demande, rentabilité, déménagement gratuit ce trimestre).
 * Null quand les estimations par zone sont absentes (vue d'un ancien serveur).
 */
export function ZoneLaunchSheet({ sectorId, zoneId }: { sectorId: SectorId; zoneId: ZoneId }) {
  const { sectorsById, view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const mapNames = useContent().mapNames;
  const decision = decisionText(useUiLang());
  const zones = launchZoneEstimates(sectorsById.get(sectorId), view.commodities, view.transportFactor);
  const selected = zones?.find((z) => z.id === zoneId);
  if (!selected) return null;
  // Trimestres restants, celui-ci compris (le produit ne vend qu'à partir du suivant).
  const quartersLeft = Math.max(0, view.config.totalTurns - view.turn + 1);
  const payback = selected.est.paybackQuarters ?? null;
  return (
    <>
      {/* La fiche de la zone, juste au-dessus, porte déjà son nom : pas de second titre. */}
      <p className="pk-kicker">{t.launchPicker.sheetKicker}</p>
      <p className="small">
        {t.launch.zoneOption(zoneName(mapNames, selected.id), fmt.money(selected.est.unitCost), fmt.money(selected.est.quarterlyProfit))}
      </p>
      {selected.est.demand !== undefined && <p className="small muted">{t.launch.zoneDemand(fmt.lots(selected.est.demand))}</p>}
      <FreightDetails view={view} freight={launchFreightClassic(view, sectorId, zoneId)} />
      <p className={cx('small', payback !== null && payback > quartersLeft ? 'warn' : 'muted')}>
        {payback === null ? t.launch.noPayback : payback > quartersLeft ? t.launch.late(quartersLeft) : t.launchPicker.payback(payback)}
      </p>
      <p className="small muted">{decision.conditions}</p>
      <p className="small muted">{t.launch.zoneFreeMove}</p>
    </>
  );
}

/**
 * Lancement classique dans une zone déjà choisie : secteur, nom, estimations, validation et envoi
 * (`launchProduct`, avec `zoneId` quand la zone n'est pas la capitale). L'indice du prêt entreprise
 * et la fiche de la zone (ZoneLaunchSheet) précèdent le nom ; la liste des 7 zones en repli
 * (aide clavier et lecteur d'écran, badge « la plus rentable ») la suit.
 */
export function ZoneLaunchForm({
  company,
  zoneId,
  initialSector,
  trackedSector,
  onLaunched,
  onSectorChange,
}: {
  company: CompanyView;
  zoneId: ZoneId;
  initialSector?: SectorId;
  trackedSector?: SectorId;
  onLaunched?: () => void;
  onSectorChange?: (sectorId: SectorId) => void;
}) {
  const { sectorsById, view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const decision = decisionText(useUiLang());
  // Les produits font partie de la partie : idées de noms dans la langue du salon.
  const nameIdeas = useRoomContent().productNameIdeas;
  const [sectorId, setSectorId] = useState<SectorId>(trackedSector ?? initialSector ?? SECTOR_IDS[0]);
  const [name, setName] = useState('');
  const [ideas, setIdeas] = useState(() => shuffled(nameIdeas[trackedSector ?? initialSector ?? SECTOR_IDS[0]] ?? [], 4));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (trackedSector === undefined || trackedSector === sectorId) return;
    setSectorId(trackedSector);
    setIdeas(shuffled(nameIdeas[trackedSector] ?? [], 4));
  }, [trackedSector, nameIdeas]);

  const def = SECTORS[sectorId];
  const isCrypto = sectorId === 'crypto';
  const cost = sectorsById.get(sectorId)?.launchCost ?? def?.launchCost ?? 0;
  const maxProducts = maxProductsOf(company);
  const full = productCount(company) + (company.private?.launchProjects?.length ?? 0) >= maxProducts;
  const reason = full
    ? t.launch.full(maxProducts) + (maxProducts <= MAX_ACTIVE_PRODUCTS ? t.launch.fullMergeHint(MAX_ACTIVE_PRODUCTS_MERGED) : '')
    : company.cash < cost
      ? t.launch.noCash
      : null;
  // Aide débutant (§10) : rentabilité estimée d'un lancement dans ce secteur (null = pas rentable).
  const estimate = sectorsById.get(sectorId)?.launchEstimate;
  // Trimestres restants, celui-ci compris (le produit ne vend qu'à partir du suivant).
  const quartersLeft = Math.max(0, view.config.totalTurns - view.turn + 1);
  const zones = launchZoneEstimates(sectorsById.get(sectorId), view.commodities, view.transportFactor);
  const selectedEstimate = selectedLaunchEstimate(zones, zoneId, estimate);
  const payback = selectedEstimate?.paybackQuarters ?? null;

  const chooseSector = (id: SectorId) => {
    setSectorId(id);
    setIdeas(shuffled(nameIdeas[id] ?? [], 4));
    onSectorChange?.(id);
  };

  const launch = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      // La capitale est la zone par défaut du moteur : inutile de l'envoyer.
      const r = await sendAction({
        type: 'launchProduct',
        companyId: company.id,
        sectorId,
        name: n,
        ...(zoneId !== DEFAULT_ZONE ? { zoneId } : {}),
      });
      if (r.ok) {
        setName('');
        onLaunched?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="launch"
      onSubmit={(e) => {
        e.preventDefault();
        void launch();
      }}
    >
      {/* Le secteur d'abord : c'est lui qui fixe tous les chiffres du résumé. */}
      <div className="seg wrap">
        {SECTOR_IDS.map((id) => (
          <button key={id} type="button" className={cx('seg-btn', id === sectorId && 'active')} onClick={() => chooseSector(id)}>
            {content.sectors[id]?.emoji} {content.sectors[id]?.name ?? id}
          </button>
        ))}
      </div>
      <DecisionSummary destination={zoneName(content.mapNames, zoneId)} total={fmt.money(cost)}
        timing={decision.launchTiming}
        gain={selectedEstimate ? fmt.money(selectedEstimate.quarterlyProfit) : '—'}
        payback={payback === null ? t.launch.noPayback : decision.quarters(payback)}>
        <p className="small muted">{decision.launchNow}</p>
        <p className="small muted">{decision.launchOperating}</p>
        {payback !== null && payback > quartersLeft && <p className="small warn">{t.launch.late(quartersLeft)}</p>}
        <div className="row wrap">
          <input type="text" className="grow" placeholder={t.launch.namePlaceholder} maxLength={30} value={name}
            onChange={(e) => setName(e.target.value)} aria-label={t.launch.namePlaceholder} />
          <button type="submit" className="btn primary" disabled={Boolean(reason) || busy || !name.trim()}>
            {busy ? t.common.ellipsis : t.company.launch}
          </button>
        </div>
        {reason && <p className="small muted italic">{reason}</p>}
      </DecisionSummary>
      <FreightDetails view={view} freight={launchFreightClassic(view, sectorId, zoneId)} />
      <p className="small muted">{decision.launchAccounting(fmt.money(cost / LAUNCH_AMORTIZATION_TURNS), LAUNCH_AMORTIZATION_TURNS)}</p>
      <p className="small muted">{isCrypto ? t.launch.nextQuarterCrypto : t.launch.nextQuarter}</p>
      {def && (
        <p className="small muted">
          {content.sectors[sectorId]?.description ?? def.description}{' '}
          {t.product.capacity}: {fmt.lots(def.startingCapacity)} · {decision.referencePrice}: {fmt.money(def.refPrice)}
        </p>
      )}
      <p className="small muted">{t.launch.companyPays(company.name, fmt.money(company.cash))}</p>
      <p className="small muted">{t.company.launchFunding}</p>
      {(company.private?.launchChargesLeft ?? 0) > 0 && (
        <p className="small muted">{t.launch.chargesLeft(fmt.money(company.private?.launchChargesLeft ?? 0))}</p>
      )}
      {zones?.find((zone) => zone.id === zoneId)?.est.demand !== undefined && <p className="small muted">{t.launch.zoneDemand(fmt.lots(zones.find((zone) => zone.id === zoneId)!.est.demand!))}</p>}
      <p className="small muted">{t.launch.zoneFreeMove}</p>
      {zones && (
        <details className="pk-details">
          <summary>{decision.otherZones}</summary>
          {zones.filter(({ id }) => id !== zoneId).map(({ id, est }) => (
            <p key={id} className="small">
              <span>{t.launch.zoneOption(zoneName(content.mapNames, id), fmt.money(est.unitCost), fmt.money(est.quarterlyProfit))}</span>
              {est.demand !== undefined && <span className="small muted"> {t.launch.zoneDemand(fmt.lots(est.demand))}</span>}
              {id === bestLaunchZone(zones) && <span className="badge up">{t.launch.zoneBest}</span>}
            </p>
          ))}
        </details>
      )}
      {ideas.length > 0 && (
        <div className="row wrap small">
          <span className="muted">{t.launch.ideas}</span>
          {ideas.map((idea) => (
            <button key={idea} type="button" className="chip" onClick={() => setName(idea)}>
              {idea}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setIdeas(shuffled(nameIdeas[sectorId] ?? [], 4))} aria-label={t.launch.moreIdeas}>
            🎲
          </button>
        </div>
      )}
    </form>
  );
}

/* -----------------------------------------------------------------------------------------------
 * Mode hexagonal : aides partagées des formulaires d'enchère, résumé chiffré d'une case et
 * formulaire de lancement pour une case déjà choisie. `HexBidForms.tsx` réexporte les aides que
 * ses tests importent.
 * --------------------------------------------------------------------------------------------- */

/** Repli quand la case mise est perdue à la clôture : case libre la plus proche, ou abandon. */
export type Fallback = 'nearest' | 'abandon';

/** Prefer the best estimated free cell; a missing estimate never makes a real free cell unselectable. */
export function initialBidHex(view: PlayerView, reference: HexReference, requested?: string): string | null {
  const free = view.hexes?.free ?? [];
  if (requested && free.includes(requested)) return requested;
  return free.reduce<string | null>((best, id) => {
    const margin = hexEstimate(view, reference, id)?.margin;
    const bestMargin = best ? hexEstimate(view, reference, best)?.margin : null;
    return best === null || (margin !== null && margin !== undefined && margin > (bestMargin ?? -Infinity)) ? id : best;
  }, null);
}

function duplicateBid(view: PlayerView, hexId: string | null, productId?: string): boolean {
  return liveHexBids(view).some((bid) => bid.hexId === hexId && (!productId || bid.productId !== productId));
}

/** Raison qui bloque le dépôt d'une mise sur une case (null : la mise est possible). */
export function cellReason(view: PlayerView, hexId: string | null, max: number, reserve: number, h: typeof hexFormsFr, productId?: string): string | null {
  if (view.phase !== 'playing' || view.turn >= view.config.totalTurns) return h.formLastTurn;
  if (!hexId) return h.formNoCell;
  if (!view.hexes?.free.includes(hexId)) return h.formChooseCell;
  if (duplicateBid(view, hexId, productId)) return h.formDuplicate;
  if (!Number.isFinite(max) || max < reserve) return h.formNoCash;
  return null;
}

/**
 * Choix du repli en cas de mise perdue (case la plus proche, ou abandon) : chaque libellé dit ce qu'il coûte ; le
 * détail de la règle (`formFallbackHelp`) est placé par le formulaire. À l'incubateur, l'échéance du placement
 * d'office reste visible.
 */
export function HexFallbackChoice({ value, onChange, id, incubator = false, compact = false }: { value: Fallback; onChange: (value: Fallback) => void; id: string; incubator?: boolean; compact?: boolean }) {
  const h = useT().hex;
  if (compact) return <div className="hx-action-fallback">
    <label className="field" htmlFor={`hex-fallback-${id}`}><span>{h.formFallback}</span>
      <select id={`hex-fallback-${id}`} value={value} onChange={event => onChange(event.target.value as Fallback)}>
        <option value="nearest">{h.formNearest}</option><option value="abandon">{h.formAbandon}</option>
      </select>
    </label>
    {incubator && <p className="small muted">{h.formIncubatorHelp}</p>}
  </div>;
  return <fieldset className="hx-fallback">
    <legend>{h.formFallback}</legend>
    <label><input type="radio" name={`hex-fallback-${id}`} value="nearest" checked={value === 'nearest'} onChange={() => onChange('nearest')} /> {h.formNearest}</label>
    <label><input type="radio" name={`hex-fallback-${id}`} value="abandon" checked={value === 'abandon'} onChange={() => onChange('abandon')} /> {h.formAbandon}</label>
    {incubator && <p className="small muted">{h.formIncubatorHelp}</p>}
  </fieldset>;
}

/** Le pli fermé « Comment se règle l'enchère ? » des formulaires de la fiche ; une seule ligne de la règle reste près du champ de mise. */
export function HexBidRules({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const h = useT().hex;
  return <details className={compact ? 'hx-bid-rules hx-action-rules' : 'hx-bid-rules'}>
    <summary>{h.formRulesTitle}</summary>
    {children}
  </details>;
}

/** Projets de lancement de l'entreprise en attente d'une case (mises en cours comprises), avec retrait. */
export function HexPendingProjects({ company, compact = false }: { company: CompanyView; compact?: boolean }) {
  const { view } = useGame();
  const h = useT().hex;
  const fmt = useFmt();
  const roomLang = useRoomLang();
  const currentCompany = view.companies.find((candidate) => candidate.id === company.id);
  const projects = currentCompany?.controllerId === view.you ? ownCompany(currentCompany)?.launchProjects ?? [] : [];
  const pending = liveHexBids(view).filter((bid) => bid.companyId === company.id && bid.kind === 'launch');
  const ids = [...new Set([...projects.map((project) => project.id), ...pending.flatMap((bid) => bid.project ? [bid.project.id] : [])])];
  if (ids.length === 0) return null;
  return <section className="hx-projects" aria-label={h.formProjects}>
    {!compact && <h4>{h.formProjects}</h4>}
    {ids.map((id) => {
      const bid = pending.find((bid) => bid.project?.id === id);
      const project = projects.find((project) => project.id === id) ?? bid?.project;
      return <div className="row between" key={id}>
        <span className="small">{h.formProject(project?.name ?? id, bid ? hexPlaceLabel(bid.hexId, roomLang, view.siteSlots) : '—', bid ? fmt.money(bid.amount) : '—')}</span>
        <button type="button" className="btn tiny ghost" onClick={() => void sendAction({ type: 'cancelHexBid', companyId: company.id, projectId: id })}>{h.formWithdrawProject}</button>
      </div>;
    })}
  </section>;
}

/**
 * Résumé chiffré d'une enchère sur une case : verdict financier (rentabilité avant la fin de la
 * partie), puis la fiche (nom de la case, mise à prix, marge, coût, demande, remboursement) et le
 * corps du formulaire (`children`). `board` : le plateau inséré entre le verdict et la fiche par le
 * sélecteur (HexBidPicker) ; absent quand le formulaire est monté seul pour une case déjà choisie.
 * `hideCellNumbers` : résumé compact autonome placé avant la description repliée de la case,
 * avec budget total, calendrier, gain et remboursement à côté de l'action. `inSheet` : ce résumé
 * compact est dans la fiche de la case, qui donne déjà son nom et sa mise à prix.
 * Gain, mise à prix, remboursement et verdict viennent de `hexCellBid`, comme le titre chiffré de la fiche.
 */
export function HexBidSummary({ view, hexId, reference, delta = false, landOnly = false, cost = 0, costLabel, bid, bidMax, perksText = null, board = null, hideCellNumbers = false, inSheet = false, children = null }: {
  view: PlayerView; hexId: string | null; reference: HexReference; delta?: boolean; landOnly?: boolean; cost?: number; costLabel?: string; bid: number; bidMax?: number; perksText?: string | null; board?: ReactNode; hideCellNumbers?: boolean; inSheet?: boolean; children?: ReactNode;
}) {
  const t = useT();
  const h = t.hex;
  const decision = decisionText(useUiLang());
  const fmt = useFmt();
  const roomLang = useRoomLang();
  const estimate = hexId ? hexEstimate(view, reference, hexId) : null;
  const tracked = reference.kind === 'product' ? ownHexProduct(view, reference.productId) : null;
  const freight = hexId ? reference.kind === 'launch' ? launchFreight(view, reference.sectorId, hexId)
    : tracked ? productFreight(view, tracked.company, tracked.product, hexId) : null : null;
  const kind: HexBidKind = delta ? 'move' : landOnly ? 'startup' : 'launch';
  const cell = hexId ? hexCellBid(view, hexId, reference, kind, cost, bid) : null;
  const gain = cell?.gain ?? null;
  const reserve = cell?.reserve ?? 0;
  const validBid = Number.isFinite(bid) && bid >= reserve && (bidMax === undefined || bid <= bidMax + 1e-6);
  const quartersLeft = cell?.quartersLeft ?? 0;
  const payback = cell?.payback ?? null;
  const verdict = cell?.verdict ?? hexBidVerdict(null, quartersLeft);
  const gainText = gain !== null && gain !== undefined ? (delta ? fmt.signedMoney(gain) : fmt.money(gain)) : '';
  const verdictText = verdict.state === 'ok' ? h.verdictOk(gainText, verdict.atBid ?? verdict.atReserve ?? 0, quartersLeft)
    : verdict.state === 'risky' ? h.verdictRisky(verdict.atReserve ?? 0, verdict.atBid ?? 0, quartersLeft)
    : verdict.state === 'late' ? h.verdictLate(gainText, fmt.money(cost + reserve), verdict.atReserve ?? 0, quartersLeft)
    : h.verdictNone;
  if (hideCellNumbers) return <DecisionSummary
    destination={hexId ? hexPlaceName(hexId, roomLang, view.siteSlots) : h.formNoCell}
    total={validBid ? fmt.money(cost + bid) : '—'} maximum
    cost={cost > 0 ? fmt.money(cost) : undefined} costLabel={costLabel}
    reserve={cost > 0 || bid !== reserve ? fmt.money(reserve) : undefined}
    timing={delta || landOnly ? decision.moveClose : decision.launchBoardTiming}
    gain={gain !== null ? fmt.signedMoney(gain) : '—'} gainLabel={delta ? h.deltaLabel : h.marginLabel} inSheet={inSheet}
    payback={!validBid ? '—' : payback === null ? h.verdictNone : payback.atBid !== null ? h.formPaybackRange(payback.atReserve, payback.atBid) : h.formPaybackQuarters(payback.atReserve)}>
    {validBid && (verdict.state === 'late' || verdict.state === 'risky') && <p className="small warn">{verdict.state === 'late' ? decision.latePayback : decision.riskyPayback}</p>}
    {perksText && <p className="small warn">{perksText}</p>}
    {!inSheet && freight && <FreightDetails view={view} freight={freight} />}
    {children}
  </DecisionSummary>;
  return <>
    {hexId && <p className={`hx-verdict hx-verdict-${verdict.state}`} role="status">
      {verdictText}
      {perksText && <> {perksText}</>}
    </p>}
    {board}
    <aside className="hx-bid-sheet" aria-label={h.formSheetAria}>
      <h4>{hexId ? <>{hexPlaceName(hexId, roomLang, view.siteSlots)} <small>{hexId}</small></> : h.formNoCell}</h4>
      <dl className="hx-bid-numbers">
        {!hideCellNumbers && <>
          <div><dt>{h.formReserve}</dt><dd>{fmt.money(reserve)}</dd></div>
          <div><dt>{h.marginLabel}</dt><dd>{estimate?.margin === null || estimate?.margin === undefined ? '—' : fmt.money(estimate.margin)}</dd></div>
          {delta && <div><dt>{h.deltaLabel}</dt><dd>{gain === null ? '—' : fmt.signedMoney(gain)}</dd></div>}
          <div><dt>{h.unitCostLabel}</dt><dd>{estimate ? fmt.lotPrice(estimate.unitCost) : '—'}</dd></div>
          <div><dt>{h.demandLabel}</dt><dd>{estimate?.demand === null || estimate?.demand === undefined ? '—' : fmt.lots(estimate.demand)}</dd></div>
        </>}
        {costLabel && <div><dt>{costLabel}</dt><dd>{fmt.money(cost)}</dd></div>}
        <div><dt>{h.formPayback}</dt><dd>{payback === null ? '—' : payback.atBid !== null ? h.formPaybackRange(payback.atReserve, payback.atBid) : h.formPaybackQuarters(payback.atReserve)}</dd></div>
      </dl>
      {freight && <FreightDetails view={view} freight={freight} />}
      <p className="small muted">{decision.conditions}</p>
      {children}
    </aside>
  </>;
}

/**
 * Lancement sur une case choisie : les secteurs d'abord, chacun avec sa marge et son remboursement
 * sur cette case, puis résumé et enchère, idées de nom, repli et projets en attente ; la règle de
 * l'enchère et les explications attendent dans le pli fermé « Comment se règle l'enchère ? ».
 * `onSectorChange` synchronise la référence de la carte. Changer de secteur garde la mise saisie
 * tant que la case, donc sa mise à prix, ne change pas. `inSheet` : monté dans la fiche de la case.
 */
export function HexLaunchForm({ company, hexId, initialSector, trackedSector, onLaunched, onCancel, onSectorChange, inSheet = false, compact = false }: {
  company: CompanyView;
  hexId?: string | null;
  initialSector?: SectorId;
  trackedSector?: SectorId;
  onLaunched?: () => void;
  /** Closes the form without bidding (the cell sheet then offers its own actions again). */
  onCancel?: () => void;
  onSectorChange?: (sectorId: SectorId) => void;
  inSheet?: boolean;
  /** The map palette already selects the sector and shows location figures. Keep only action controls here. */
  compact?: boolean;
}) {
  const { view } = useGame();
  const t = useT();
  const h = t.hex;
  const fmt = useFmt();
  const uiLang = useUiLang();
  const decision = decisionText(uiLang);
  const content = useContent();
  const nameIdeas = useRoomContent().productNameIdeas;
  const [sectorId, setSectorId] = useState<SectorId>(trackedSector ?? initialSector ?? SECTOR_IDS[0]);
  const [name, setName] = useState('');
  const [fallback, setFallback] = useState<Fallback>('nearest');
  const [generation, setGeneration] = useState(0);
  const [bidLive, setBidLive] = useState<{ key: string; raw: string } | null>(null);
  const reference: HexReference = { kind: 'launch', sectorId };
  const selected = initialBidHex(view, reference, hexId ?? undefined);
  const cost = hexLaunchCost(view, sectorId);
  const reserve = selected ? view.hexes?.reserve[selected] ?? 0 : 0;
  const amountKey = `${selected}-${sectorId}-${generation}`;
  // Another sector on the same cell (same reserve) keeps the name, fallback and typed bid; another cell starts again
  // from its own reserve.
  const switchSector = (next: SectorId) => {
    const nextSelected = initialBidHex(view, { kind: 'launch', sectorId: next }, hexId ?? undefined);
    const nextReserve = nextSelected ? view.hexes?.reserve[nextSelected] ?? 0 : 0;
    if (nextSelected === selected && nextReserve === reserve) {
      setBidLive((draft) => draft?.key === amountKey ? { key: `${nextSelected}-${next}-${generation}`, raw: draft.raw } : null);
    } else {
      setBidLive(null);
      setGeneration((previous) => previous + 1);
    }
    setSectorId(next);
  };
  // The map's tracked sector changed elsewhere (« Que lancer ici ? », the toolbar): follow it the same way.
  useEffect(() => {
    if (trackedSector === undefined || trackedSector === sectorId) return;
    switchSector(trackedSector);
  }, [trackedSector]);
  const bid = bidLive && bidLive.key === amountKey ? parseNumber(bidLive.raw, uiLang) : reserve;
  const max = Math.max(0, company.cash - cost);
  const maxProducts = maxProductsOf(company);
  const used = productCount(company) + (ownCompany(company)?.launchProjects?.length ?? 0);
  const reason = used >= maxProducts
    ? t.launch.full(maxProducts) + (maxProducts <= MAX_ACTIVE_PRODUCTS ? t.launch.fullMergeHint(MAX_ACTIVE_PRODUCTS_MERGED) : '')
    : cellReason(view, selected, max, reserve, h) ?? (!name.trim() ? h.formNeedName : null);
  const nameField = <div className="field">
    <label htmlFor={`hex-launch-name-${company.id}`}>{t.launch.namePlaceholder}</label>
    <input id={`hex-launch-name-${company.id}`} type="text" maxLength={30} value={name} placeholder={t.launch.namePlaceholder} aria-label={t.launch.namePlaceholder} onChange={(event) => setName(event.target.value)} />
  </div>;
  const amountForm = <AmountForm key={`${selected}-${generation}`} label={h.formBid} min={reserve} max={max} initial={reserve} presets={[]} disabledReason={reason} submitLabel={h.formPlaceBid} after={(bid) => h.formCashAfter(fmt.money(company.cash - cost - bid))} onRawChange={(raw) => setBidLive({ key: amountKey, raw })} onSubmit={async (bid) => {
    if (reason || !selected) return { ok: false };
    const result = await sendAction({ type: 'launchProduct', companyId: company.id, sectorId, name: name.trim(), hexId: selected, bid, fallback });
    if (result.ok) { setName(''); setGeneration((previous) => previous + 1); onLaunched?.(); }
    return result;
  }} />;
  if (compact) return <section className="hx-action-fields hx-launch-compact">
    {nameField}
    {amountForm}
    <p className="hx-action-costs" title={decision.launchClose}>{h.formLaunchCost} : <strong>{fmt.money(cost)}</strong> · {h.formReserve} : <strong>{fmt.money(reserve)}</strong></p>
    <HexFallbackChoice value={fallback} onChange={setFallback} id={`launch-${company.id}`} compact />
    <HexBidRules compact>
      <p className="small muted">{h.formAuctionHelp}</p><p className="small muted">{h.formFallbackHelp}</p>
      <p className="small muted">{decision.launchClose}</p><p className="small muted">{decision.launchBoardOperating}</p>
    </HexBidRules>
    <HexPendingProjects company={company} compact />
  </section>;
  // Each sector's margin and payback on this cell, from the same function as the summary (at the reserve).
  const choices = SECTOR_IDS.map((id) => {
    const cell = selected ? hexCellBid(view, selected, { kind: 'launch', sectorId: id }, 'launch', hexLaunchCost(view, id)) : null;
    return { id, margin: cell?.gain ?? null, payback: cell?.payback?.atReserve ?? null, late: cell?.verdict.state === 'late' };
  });
  return <section className="launch hx-launch">
    {/* Le secteur d'abord : c'est lui qui fixe tous les chiffres du résumé. */}
    <div className="seg wrap">{choices.map(({ id, margin, payback, late }) => <button key={id} type="button" className={cx('seg-btn', id === sectorId && 'active')} onClick={() => { switchSector(id); onSectorChange?.(id); }}>
      {content.sectors[id].emoji} {content.sectors[id].name}
      {margin !== null && <> · {fmt.signedMoney(margin)}</>}
      {payback !== null && <> · {late ? <span className="down hx-sector-late">{h.formSectorPaybackLate(payback)}</span> : h.formSectorPayback(payback)}</>}
    </button>)}</div>
    <fieldset className="hx-bid-fieldset">
      <legend>{h.formLaunchLegend}</legend>
      <HexBidSummary view={view} hexId={selected} reference={reference} cost={cost} costLabel={h.formLaunchCost} bid={bid} bidMax={max} hideCellNumbers inSheet={inSheet}>
        {nameField}
        {amountForm}
        <p className="small muted">{h.formBidRule}</p>
        {onCancel && <button type="button" className="btn ghost small" onClick={onCancel}>{t.common.cancel}</button>}
      </HexBidSummary>
    </fieldset>
    <div className="row wrap small"><span className="muted">{t.launch.ideas}</span>{(nameIdeas[sectorId] ?? []).slice(0, 4).map((idea) => <button key={idea} type="button" className="chip" onClick={() => setName(idea)}>{idea}</button>)}</div>
    <HexFallbackChoice value={fallback} onChange={setFallback} id={`launch-${company.id}`} />
    <HexBidRules>
      <p className="small muted">{h.formAuctionHelp}</p>
      <p className="small muted">{h.formFallbackHelp}</p>
      <p className="small muted">{decision.launchClose}</p>
      <p className="small muted">{decision.launchBoardOperating}</p>
      <p className="small muted">{content.sectors[sectorId].description} {t.launch.companyPays(company.name, fmt.money(company.cash))}</p>
      <p className="small muted">{t.company.launchFunding}</p>
      <p className="small muted">{h.formSlots(used, maxProducts)}</p>
    </HexBidRules>
    <HexPendingProjects company={company} />
  </section>;
}
