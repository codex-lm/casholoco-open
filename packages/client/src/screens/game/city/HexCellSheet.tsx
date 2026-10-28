import { useEffect, useRef, type ReactNode } from 'react';
import {
  CITIES, DEPOSITS, SECTOR_IDS, basin, cityWeights, hexById, hexPlaceLabel, hexPlaceName, hexReservePrice, neighbors,
  ring, capitalCellId, type PlayerView, type SectorId,
} from '@muchomoney/core';
import { useContent, useRoomLang, useT, useUiLang } from '../../../i18n';
import { sheetReadabilityMessages } from '../../../i18n/sheetReadability';
import { hexReadabilityMessages } from '../../../i18n/hexReadability';
import { useFmt } from '../../../fmt';
import { cx } from '../../../util';
import { zoneLabel } from './MapSheets';
import { isOwn, liveHexBids, ownHexProduct, ownProduct } from './privacy';
import { defaultHexReference, hexEstimate, hexFactory, hexIsBuildable, type HexReference } from './hexModel';
import { FreightRow, LaunchChoices, productFreightFacts } from './CellFreight';
import { FreightDetails } from '../../../components/FreightDetails';
import { launchFreight } from './freight';
import { cellNotesEligible, rememberCellNote, type CellNoteKind } from '../../../cellNotes';
import { useCellNoteMessages } from '../../../i18n/cellNotes';
import { moveLeavesTerrain, moveTerrainLoss, startingTerrainAt, startingTerrainEffectsText } from '../startingTerrain';
import { hexCellBid, hexLaunchCost, hexMoveCost, type HexBidKind } from '../hexPayback';
import { industryMessages } from '../../../i18n/industry';

/** One-time note about the selected kind of cell, kept for this selection; the next selection consults the remembered flag. */
export function CellNote({ kind }: { kind: CellNoteKind }) {
  const text = useCellNoteMessages();
  const note = useRef<HTMLElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      rememberCellNote(kind);
      return;
    }
    // A folded sheet or a form-focused scroll can mount this note outside the reading area.
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.75)) return;
      rememberCellNote(kind);
      observer.disconnect();
    }, { threshold: 0.75 });
    if (note.current) observer.observe(note.current);
    return () => observer.disconnect();
  }, [kind]);
  return <aside ref={note} className="hx-sheet-note cell-note" role="note" data-cell-note={kind}>{text[kind]}</aside>;
}

export interface HexCellSheetProps {
  view: PlayerView;
  hexId: string | null;
  reference?: HexReference | null;
  onMove?: (companyId: string, productId: string, hexId: string) => void;
  onLaunch?: (sectorId: SectorId, hexId: string) => void;
  onOpenCompany?: (companyId: string, productId?: string) => void;
  onOpenDeposit?: (depositId: string) => void;
  /** « Chercher où déménager » on one of my plants: move mode for this product, its best free cell selected. */
  onSeekMove?: (companyId: string, productId: string) => void;
  /**
   * The open decision form (launch, move, deposit panel). It has its own submit and cancel, so the sheet's action
   * buttons step aside; on a deposit it also states the deposit (commodity, status, capacity), so the sheet does not
   * show them again (its status line stays in the live header for screen readers only). A launch or move form leaves
   * the place and its reserve price to the sheet, which keeps them above it.
   */
  children?: ReactNode;
  /** What the open form folds away, placed first in the sheet's single « Détails du lieu » fold (deposit details). */
  details?: ReactNode;
  /** Resets expanded explanations whenever a new location or decision form opens. */
  formKey?: string | null;
  /** « Que lancer ici ? » : suivre une nouvelle usine de ce secteur (référence de lancement partagée). */
  onPickSector?: (sectorId: SectorId) => void;
  /** The one-time note for this kind of cell, on its first explicit selection (see cellNotes.ts). */
  discoveryNote?: CellNoteKind | null;
  /** Selected origin on the map tab: construction and profile choices live in the upper palette. */
  readOnly?: boolean;
}

/**
 * Fiche d'une case du plateau, le chiffre qui décide d'abord. Case libre : un titre chiffré (« Déménager X ici :
 * +65 k€/trim. · remboursé en ~3 trim. à la mise à prix (150 k€) », ou l'usine neuve du secteur suivi), puis au plus
 * trois lignes (mise à prix, demande, « dont fret ») et l'action ; le détail des estimations, du fret et du lieu reste
 * dans des plis fermés. Ma case : ce que fait l'usine (marge, production, demande, fret) et « Chercher où déménager ».
 * Case d'un concurrent : une ligne et « Voir l'entreprise ».
 */
export function HexCellSheet({ view, hexId, reference, onMove, onLaunch, onOpenCompany, onOpenDeposit, onSeekMove, children, details, formKey, onPickSector, discoveryNote, readOnly = false }: HexCellSheetProps) {
  const t = useT();
  const h = t.hex;
  const fmt = useFmt();
  const content = useContent();
  const roomLang = useRoomLang();
  const readability = sheetReadabilityMessages(useUiLang());
  const geography = hexReadabilityMessages(useUiLang());
  const network = view.config.industryRules === 'network';
  const industry = industryMessages(useUiLang());
  const hex = hexId ? hexById(hexId) : null;
  if (!hex) return <section className="hx-cell-sheet" aria-label={h.sheetAria}><p className="hx-sheet-note">{h.sheetHint}</p>{children}</section>;
  const ref = reference === undefined ? defaultHexReference(view) : reference;
  const factory = hexFactory(view, hex.id);
  const free = (view.hexes?.free ?? []).includes(hex.id);
  const buildable = hexIsBuildable(hex.id);
  const estimate = factory || hex.deposit || network && ref?.kind === 'product' ? null : hexEstimate(view, ref, hex.id);
  const terrain = view.terrains?.find((ter) => ter.hex === hex.id);
  const neighboring = neighbors(hex.id).flatMap((cell) => {
    const plant = hexFactory(view, cell.id);
    return plant ? [{ cell: cell.id, ...plant }] : [];
  });
  const result = view.hexes?.results.find((r) => r.hexId === hex.id);
  const winner = result ? view.companies.find((c) => c.id === result.companyId) : null;
  const pending = factory?.product ? liveHexBids(view).find((bid) => bid.productId === factory.product?.id) : null;
  const own = factory?.product ? ownProduct(factory.product) : null;
  const { pendingHexId, terrainEffects } = own ?? {};
  // Mon usine sur son terrain de départ encore actif : ses effets en une ligne visible, le détail reste replié.
  const ownTerrain = factory?.mine && factory.product ? startingTerrainAt(view, factory.company, factory.product) : null;
  const ownsCompany = view.companies.some(isOwn);
  const ownProducts = view.companies.filter(isOwn).flatMap((company) => company.products.filter((product) => ownProduct(product)).map((product) => ({ company, product })));
  const moveProducts = ref?.kind === 'product' ? ownProducts.filter(({ product }) => product.id === ref.productId) : ownProducts;
  const launchSector = ref?.kind === 'launch' ? ref.sectorId : ref?.kind === 'product' ? ownProducts.find(({ product }) => product.id === ref.productId)?.product.sectorId : view.sectors[0]?.id;
  const slot = hex.deposit ? view.siteSlots.find((s) => s.id === hex.deposit) : null;
  const operator = slot?.companyId ? view.companies.find((c) => c.id === slot.companyId) : null;
  const playing = view.phase === 'playing' && view.turn < view.config.totalTurns;
  const awardBody = result && <>
    <h4>{h.auctionTitle}</h4>
    <p className="small">{h.auctionLine(winner?.name ?? result.companyId, fmt.money(result.price), result.bidders)}</p>
  </>;
  // A deposit panel in the sheet states commodity, status and capacity itself: the sheet's own lines would repeat them.
  const depositInForm = Boolean(hex.deposit && children);
  const foldKey = `${hex.id}:${formKey ?? Boolean(children)}`;

  // Free cell: the bid it would take, priced by the same function as the bid form (`hexCellBid`), at the reserve.
  const tracked = !network && !factory && !hex.deposit && ref?.kind === 'product' ? ownHexProduct(view, ref.productId) : null;
  const kind: HexBidKind | null = network || factory || hex.deposit || !ref ? null
    : ref.kind === 'product' ? (tracked ? 'move' : null) : ownsCompany ? 'launch' : 'startup';
  const cost = kind === 'move' && tracked ? hexMoveCost(tracked.product) : kind === 'launch' && ref?.kind === 'launch' ? hexLaunchCost(view, ref.sectorId) : 0;
  const bid = kind && ref && free && buildable ? hexCellBid(view, hex.id, ref, kind, cost) : null;
  const leaving = kind === 'move' && tracked ? moveTerrainLoss(t, fmt, view, tracked.company, tracked.product) : null;
  const currentMargin = tracked ? hexEstimate(view, ref, tracked.product.hexId ?? capitalCellId(view.config))?.margin ?? null : null;
  const launchRefSector = ref?.kind === 'launch' ? ref.sectorId : null;
  // Nothing to bid on any more (last quarter closed, game over): no payback to announce either.
  const headline = !readOnly && bid && bid.gain !== null && !children && playing ? (() => {
    const gainText = fmt.signedMoney(bid.gain!);
    const title = kind === 'move' && tracked ? h.headMove(tracked.product.name, gainText) : h.headLaunch(launchRefSector ? content.sectors[launchRefSector].name : '', gainText);
    const reserveText = fmt.money(bid.reserve);
    const n = bid.verdict.atReserve ?? 0;
    const payback = bid.verdict.state === 'none' ? h.paybackNone
      : bid.verdict.state === 'late' ? h.paybackLate(n, bid.quartersLeft)
      : kind === 'move' ? (leaving ? h.paybackMovePerks(n, reserveText) : h.paybackMove(n, reserveText))
      : kind === 'launch' ? h.paybackLaunch(n, reserveText) : h.paybackStartup(n, reserveText);
    const lost = !leaving ? null : leaving.first === null ? h.leavesTerrainAll(leaving.name)
      : leaving.more ? h.leavesTerrainMore(leaving.name, leaving.first) : h.leavesTerrain(leaving.name, leaving.first);
    return <p className={cx('hx-headline', `hx-headline-${bid.verdict.state}`)} data-hx-headline={kind}>
      <strong>{title}</strong> · <span className="hx-headline-payback">{payback}</span>
      {lost && <> · <span className="hx-headline-warn">{lost}</span></>}
    </p>;
  })() : null;
  // Absolute freight here, plus the signed freight part of a relocation gain.
  const freightFacts = tracked ? productFreightFacts(view, tracked.product.id, hex.id)
    : factory?.mine && factory.product ? productFreightFacts(view, factory.product.id, hex.id) : null;
  const { unitCost, demand, margin } = estimate ?? {};
  const heat = estimate?.heatCredit ?? 0;
  const sectorName = factory?.product ? content.sectors[factory.product.sectorId].name : '';
  // With several companies under my control (takeover, merger), my plant's line names the one that owns it: its cash
  // pays a move.
  const factoryLine = !factory ? '' : factory.mine && factory.product ? h.ownFactoryLine(factory.product.name, sectorName, factory.company.name)
    : factory.product ? h.factoryProductLine(factory.company.name, factory.company.ceoName, factory.product.name, sectorName)
    : network ? industry.vacantOwner(factory.company.name) : h.factoryLine(factory.company.name, factory.company.ceoName);
  const freeStatus = [hex.city ? h.statusCity(fmt.pct(CITIES[hex.city].share, 0)) : null, terrain ? h.statusTerrainFree : null].filter(Boolean).join(' · ') || h.freeCell;
  const planned = own && factory?.product ? Math.max(0, Math.floor(Math.min(own.production, factory.product.capacity))) : 0;
  // A plant on its starting terrain: the best margin elsewhere ignores the perks a move would end.
  const seekPerks = Boolean(factory?.mine && factory.product && moveLeavesTerrain(view, factory.company, factory.product));
  const canSeek = Boolean(factory?.mine && factory.product && onSeekMove && playing && (view.hexes?.free ?? []).length > 0);
  const moveButtons = onMove ? moveProducts.filter(({ product }) => !network || product.incubator).map(({ company, product }) => <button key={product.id} type="button" className={cx('btn small', ref?.kind === 'launch' && 'ghost')} data-hx-move-here={product.id} onClick={() => onMove(company.id, product.id, hex.id)}>{h.moveHere(product.name)}</button>) : [];
  // The one-time discovery note: below the action on a free cell or my plant; above an open form or a deposit panel,
  // where it would otherwise sit under the whole decision.
  const note = discoveryNote && cellNotesEligible(view) ? <CellNote kind={discoveryNote} /> : null;
  const noteFirst = Boolean(hex.deposit || children);
  const launchButton = onLaunch && launchSector ? <button type="button" className={cx('btn small', ref?.kind !== 'launch' && 'ghost')} data-hx-launch-here onClick={() => onLaunch(launchSector, hex.id)}>{h.launchHere}</button> : null;

  return (
    <section className="hx-cell-sheet" aria-label={h.sheetAria} data-hex-sheet={hex.id}>
      {/* Header/status and figures stay live, but the form stays outside both live regions. */}
      <div aria-live="polite">
        <h3>{hexPlaceName(hex.id, roomLang, view.siteSlots)}</h3>
        {!hex.city && <p className="hx-sheet-basin">{h.basinRing(zoneLabel(content.mapNames, basin(hex.id)), ring(hex.id))}</p>}
        {factory ? <p className="hx-sheet-status"><span className="hx-owner-dot" style={{ backgroundColor: factory.color }} aria-hidden="true" />{factoryLine}</p>
          // With the deposit panel open, the panel shows the status; this line stays for screen readers, so that
          // selecting the cell still announces it from this live header.
          : hex.deposit ? <p className={depositInForm ? 'hx-sheet-status sr-only' : 'hx-sheet-status'}>{operator && !depositInForm && <span className="hx-owner-dot" style={{ backgroundColor: operator.color }} aria-hidden="true" />}{operator ? h.depositOperatedBy(operator.name) : h.depositFree}</p>
          : <p className="hx-sheet-status">{freeStatus}</p>}
        {ownTerrain && <p className="hx-sheet-terrain-line"><span aria-hidden="true">☆ </span>{(network ? industry.terrain : h.terrainActiveLine)(startingTerrainEffectsText(t, fmt, ownTerrain))}</p>}
        {view.hexes?.populationShare?.[hex.id] !== undefined && <p className="hx-sheet-note">{geography.population} : <strong>{fmt.pct(view.hexes.populationShare[hex.id], 2)}</strong></p>}
      </div>
      <div aria-live="polite">
        {factory ? <>
          {factory.mine && factory.product && own && <section className="hx-factory-summary" aria-label={geography.factorySummary} data-hx-factory-summary={factory.product.id}>
            <h4>{geography.factorySummary}</h4>
            <dl className="hx-sheet-numbers">
              {own.estimate && <><dt>{geography.factoryDemand}</dt><dd>{fmt.lots(own.estimate.demand, 3)}</dd></>}
              {freightFacts && <><dt>{geography.factoryFreight}</dt><dd>{fmt.lotPrice(freightFacts.here.total)}</dd></>}
              {own.estimate && <><dt>{geography.factoryMargin}</dt><dd>{fmt.signedMoney(own.estimate.margin)}</dd></>}
              <dt>{h.productionLabel}</dt><dd>{h.productionValue(fmt.int(planned), fmt.lots(factory.product.capacity))}</dd>
            </dl>
            {!readOnly && <><p className="hx-sheet-note">{geography.factoryBasis}</p>
            <p className="hx-sheet-note">{geography.factoryFreightBasis}</p></>}
          </section>}
          {pending && <p className="small">{h.pendingMove(hexPlaceName(pending.hexId, roomLang, view.siteSlots), fmt.money(pending.amount))}</p>}
          {!pending && pendingHexId && <p className="small">{h.pendingDestination(hexPlaceName(pendingHexId, roomLang, view.siteSlots))}</p>}
        </> : hex.deposit ? !depositInForm && <>
          <h4>{h.depositTitle}</h4>
          {slot && <>
            <p><b>{slot.name}</b> · {content.commodities[slot.commodityId].name}</p>
            <p className="small">{h.depositCapacity(fmt.lots(DEPOSITS[slot.id]?.capacity ?? 0))}</p>
          </>}
        </> : <>
          {headline}
          {buildable && <dl className="hx-sheet-numbers">
            <dt>{h.reserveLabel}</dt><dd>{fmt.money(view.hexes?.reserve[hex.id] ?? hexReservePrice(hex.id))}</dd>
            {demand !== undefined && demand !== null && <><dt>{h.demandLabel}</dt><dd>{fmt.lots(demand)}</dd></>}
            {freightFacts && <FreightRow facts={freightFacts} />}
          </dl>}
        </>}
        {!readOnly && freightFacts && <FreightDetails view={view} freight={freightFacts.here} />}
        {!readOnly && !freightFacts && !factory && !hex.deposit && buildable && launchRefSector && <FreightDetails view={view} freight={launchFreight(view, launchRefSector, hex.id)} />}
        {awardBody}
      </div>
      {noteFirst && note}
      {children}
      {factory ? (
        (onOpenCompany || canSeek) && <div className="hx-sheet-actions">
          {onOpenCompany && <button className="btn small" type="button" onClick={() => onOpenCompany(factory.company.id, factory.product?.id)}>{factory.mine && factory.product ? h.openProduct : h.openCompany}</button>}
          {canSeek && <button className="btn small ghost" type="button" data-hx-seek-move onClick={() => onSeekMove!(factory.company.id, factory.product!.id)}>{seekPerks ? h.seekMovePerks : h.seekMove}</button>}
        </div>
      ) : hex.deposit ? (
        onOpenDeposit && <button className="btn small" type="button" onClick={() => onOpenDeposit(hex.deposit!)}>{h.openDeposits}</button>
      ) : free && !children && playing && <div className="hx-sheet-actions">
        {ref?.kind === 'launch' ? <>{launchButton}{moveButtons}</> : <>{moveButtons}{launchButton}</>}
      </div>}
      {!noteFirst && note}
      {estimate && <details key={`why:${foldKey}`} className="hx-sheet-fold">
        <summary>{h.whyTitle}</summary>
        <dl className="hx-sheet-numbers">
          {(kind === 'move' || !headline) && margin !== undefined && margin !== null && <><dt>{h.marginLabel}</dt><dd>{fmt.signedMoney(margin)}</dd></>}
          {kind === 'move' && currentMargin !== null && <><dt>{h.marginNowLabel}</dt><dd>{fmt.signedMoney(currentMargin)}</dd></>}
          {unitCost !== undefined && <><dt>{h.unitCostLabel}</dt><dd>{fmt.lotPrice(unitCost)}</dd></>}
          {heat > 0 && <><dt>{h.heatLabel}</dt><dd>{fmt.lotPrice(heat)}</dd></>}
        </dl>
        <p className="hx-sheet-note">{ref?.kind === 'product' ? h.productEstimateNote : h.launchEstimateNote}</p>
        {heat > 0 && <p className="hx-sheet-note">{h.heatBaseNote}</p>}
      </details>}
      {!readOnly && !factory && !hex.deposit && !children && <LaunchChoices key={`launch:${foldKey}`} view={view} hexId={hex.id} reference={ref} onPickSector={onPickSector} />}
      <details key={foldKey} className="hx-sheet-description">
        <summary>{readability.locationDetails}</summary>
        {details}
        {readOnly && factory?.mine && factory.product && <><p className="hx-sheet-note">{geography.factoryBasis}</p><p className="hx-sheet-note">{geography.factoryFreightBasis}</p></>}
        {readOnly && freightFacts && <FreightDetails view={view} freight={freightFacts.here} />}
        {readOnly && !freightFacts && !factory && !hex.deposit && buildable && launchRefSector && <FreightDetails view={view} freight={launchFreight(view, launchRefSector, hex.id)} />}
        <div aria-live="polite">
          {factory && <p className="hx-sheet-note">{h.oneFactory}</p>}
          {terrain && <div className="hx-sheet-terrain">
            <h4>{h.terrainTitle} · {terrain.name}</h4>
            <p className="small"><b>{terrain.strengthLabel}</b>{terrain.counterLabel ? ` · ${terrain.counterLabel}` : ''}</p>
            <p className="small">{terrain.blurb}</p>
            {/* A vacant terrain already says « case ordinaire » in its status line. */}
            {(terrain.active || factory) && <p className="hx-sheet-note">{terrain.active ? h.terrainActive : h.terrainInactive}</p>}
            {own && <>
              <h4>{h.currentEffectsTitle}</h4>
              {(terrainEffects ?? []).length > 0 ? <ul className="hx-sheet-lines">{terrainEffects!.map((effect, i) => <li key={`${effect.lever}-${i}`}>{h.effectLine(h.effectLever[effect.lever], effect.rate !== undefined ? fmt.pct(effect.rate) : `×${fmt.num(effect.mult ?? 1)}`)}</li>)}</ul> : <p className="hx-sheet-note">{h.noCurrentEffects}</p>}
            </>}
          </div>}
          {hex.city && <>
            <h4>{h.cityClientsTitle} · {content.mapNames.cities[hex.city]}</h4>
            {/* A free city says its share in its status line; an occupied one says it here. */}
            {factory && <p className="small">{h.statusCity(fmt.pct(CITIES[hex.city].share, 0))}</p>}
            <dl className="hx-sheet-numbers">{SECTOR_IDS.map((sectorId) => <div key={sectorId} style={{ display: 'contents' }}><dt>{content.sectors[sectorId].name}</dt><dd>{fmt.pct(cityWeights(sectorId)[hex.city!], 0)}</dd></div>)}</dl>
          </>}
          <h4>{h.neighborsTitle}</h4>
          {neighboring.length === 0 ? <p className="hx-sheet-note">{h.noNeighbors}</p> : <ul className="hx-sheet-lines">{neighboring.map((plant) => <li key={plant.cell}>{h.neighborLine(hexPlaceLabel(plant.cell, roomLang, view.siteSlots), plant.product?.name ?? plant.company.name, plant.company.name)}</li>)}</ul>}
          {hex.terrain === 'mountain' && <p className="hx-sheet-note">{h.mountainNote}</p>}
          {hex.terrain === 'island' && <p className="hx-sheet-note">{h.islandNote}</p>}
          {result?.fallback && <p className="hx-sheet-note">{h.auctionFallback}</p>}
          {result?.failedContenders && <p className="hx-sheet-note">{h.auctionFailed}</p>}
        </div>
      </details>
    </section>
  );
}
