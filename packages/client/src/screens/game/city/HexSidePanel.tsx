/**
 * La colonne de gauche du plateau (dès 1200 px ; en dessous, la barre d'outils d'une ligne reste seule). De haut en bas :
 *   - l'entreprise aux manettes, sa trésorerie et ce que ses mises en réservent déjà (avec l'alerte de couverture) ;
 *   - « Mes usines » : une liste dans l'ordre de l'entreprise, le produit suivi déplié en place (sa miniature fixe, là
 *     où la colonne mesurée a la place, son verdict, sa ligne de décision, le détail du calque de flux allumé, 📍,
 *     Réglages, Mes usines), les autres en une ligne (case, marge, ↗ une case libre qui ferait mieux, ✉ une mise) ;
 *   - les emplacements libres (« choisir où lancer »), la meilleure marge d'une usine neuve, les mises de lancement, la
 *     piste de l'entreprise ;
 *   - des plis fermés par défaut, mémorisés : Flux, Gisements et filiales, Dernières adjudications, Légende ;
 *   - au pied, collés comme une légende de carte : « Chiffrer pour » et les couleurs.
 * Chaque ligne passe par les chemins de la carte (sélection d'une case, mode déménagement, formulaires de la fiche) :
 * rien n'est misé ni envoyé d'ici. Toutes les données viennent de `sidePanelModel` (vue redigée, via ./privacy).
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { SECTORS, hexPlaceLabel, boardCells, type CompanyView, type HexBid, type PlayerView, type SectorId } from '@muchomoney/core';
import { useContent, useRoomLang, useT, useUiLang } from '../../../i18n';
import { mapSideMessages } from '../../../i18n/mapSide';
import { mapWorkspaceMessages } from '../../../i18n/mapWorkspace';
import { useFmt } from '../../../fmt';
import { cx } from '../../../util';
import { MAP_PLANT_SCENE_HIDDEN_KEY, MAP_SIDE_OPEN_KEY, loadFlag, loadList, saveFlag, saveList } from '../../../storageFlags';
import { closeAlert } from '../CloseBanner';
import { STATUS_TONE } from '../factories/ProductPlot';
import { PlantMini } from '../factories/PlantMini';
import { ASPECT } from '../factories/parts';
import {
  HexColorControls, HexLegendFold, MapFlowFold, MapReferencePicker,
  type HexColorControlsProps, type HexLegendProps, type MapFlowMenuProps, type MapReferencePickerProps,
} from './HexMapToolbar';
import { OpeningChip } from './OpeningChip';
import type { HexReference } from './hexModel';
import { sidePanelModel, type SideRow } from './sidePanelModel';
import './hexSide.css';
import { FreightDetails } from '../../../components/FreightDetails';

/** The column's folds, in their order; their open state is remembered in one list (`casholoco.map.sideOpen`). */
export const SIDE_FOLDS = ['flows', 'deposits', 'awards', 'legend'] as const;
export type SideFold = (typeof SIDE_FOLDS)[number];

/** The tracked card's gap above its picture (`.side-card-open`). */
const CARD_GAP = 4;

/**
 * The picture is the column's elastic part: it shows when the column, measured without it, with its folds closed and
 * without the flow layer's figures, still leaves its height (card width × the scene's ASPECT, its 1 px border, the
 * card's gap) under the column's maximum height (`room`, the window under the sticky bars). Measured without the
 * picture, so showing it never hides it again; opening a fold or a flow layer scrolls the column instead of taking the
 * picture away under the pointer. (Its 300 px minimum column width is a container query, hexSide.css.)
 */
export function plantPictureFits({ room, content, picture, extras, width }: {
  /** The column's maximum height. */
  room: number;
  /** The column's content height as laid out now. */
  content: number;
  /** What the picture adds now (its height and the card's gap; 0 when it is not displayed). */
  picture: number;
  /** What the open folds' bodies and the flow layer's figures add now. */
  extras: number;
  /** The card's inner width, the picture's width. */
  width: number;
}): boolean {
  if (!(width > 0)) return false;
  return room - (content - picture - extras) >= Math.ceil(width * ASPECT) + 1 + CARD_GAP;
}

/** Measures the column (`.map-workspace-side`, its scroll box) and says whether the picture fits; true outside one. */
function usePictureRoom(side: RefObject<HTMLDivElement | null>): boolean {
  const [room, setRoom] = useState(false);
  useLayoutEffect(() => {
    const root = side.current;
    if (!root || typeof window === 'undefined' || typeof root.closest !== 'function') return;
    const panel = root.closest<HTMLElement>('.map-workspace-side');
    if (!panel) {
      setRoom(true);
      return;
    }
    const measure = () => {
      const max = Number.parseFloat(window.getComputedStyle(panel).maxHeight);
      const scene = root.querySelector<HTMLElement>('.side-card-open .side-plant-scene')?.offsetHeight ?? 0;
      const detail = root.querySelector<HTMLElement>('.side-card-open .map-flow-detail')?.offsetHeight ?? 0;
      const folds = [...root.querySelectorAll<HTMLElement>('.hx-side-folds details[open]')]
        .reduce((sum, fold) => sum + fold.offsetHeight - (fold.querySelector<HTMLElement>('summary')?.offsetHeight ?? 0), 0);
      setRoom(plantPictureFits({
        room: Number.isFinite(max) ? max : Infinity,
        content: root.offsetHeight,
        picture: scene > 0 ? scene + CARD_GAP : 0,
        extras: folds + (detail > 0 ? detail + CARD_GAP : 0),
        width: root.querySelector<HTMLElement>('.side-card-open .side-card-head')?.offsetWidth ?? 0,
      }));
    };
    measure();
    // The column's maximum height follows the window (its variable is set on resize): measure on the next frame.
    let frame = 0;
    const later = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener('resize', later);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    observer?.observe(root);
    observer?.observe(panel);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', later);
      observer?.disconnect();
    };
  }, [side]);
  return room;
}

/** The map's own paths, wired by HexMapView: a selection, move mode, a sheet form, a modal, a tab. */
export interface SidePanelHandlers {
  /** A card's name or a row: « Chiffrer pour » this product (its plant selected, unless a free cell is). */
  track: (productId: string) => void;
  /** 📍: always the plant's cell. */
  showPlant: (hexId: string) => void;
  /** « Ailleurs » and ↗: that free cell, priced for this product, no form opened. */
  showBetter: (productId: string, hexId: string) => void;
  /** ✉ a live move or start-up bid: move mode, the bid's cell and its form (with « Retirer »). */
  openBid: (companyId: string, productId: string, hexId: string) => void;
  /** A destination, a fold entry, the best cell for a new plant: the cell, like a click on the board. */
  showCell: (hexId: string) => void;
  /** ✉ a live launch bid: its cell with the launch form and its pending project. */
  openLaunchBid: (sectorId: SectorId, hexId: string) => void;
  /** « Emplacements libres · choisir où lancer »: a new plant of that sector becomes the reference, its best cell selected. */
  pickLaunch: (sectorId: SectorId, hexId: string | null) => void;
  settings: (companyId: string, productId: string) => void;
  openFactory: (companyId: string, productId: string) => void;
  showOpening: (sectorId: SectorId, hexId: string) => void;
  openCommodities: () => void;
  /** No company: « Voir les options » opens the company tab. */
  openCompanyTab: () => void;
  selectCompany: (companyId: string) => void;
}

export interface HexSidePanelProps {
  view: PlayerView;
  /** The company acting in the sheet's forms; null without one (spectator, no company left). */
  acting: CompanyView | null;
  /** Every company I run: one chip each from two on. */
  companies: readonly CompanyView[];
  /** The tracked reference (« Chiffrer pour »): a product of the acting company expands its card. */
  reference: HexReference | null;
  picker: MapReferencePickerProps;
  /** The map's graphical palette replaces the tracked-product dropdown. */
  showReferencePicker?: boolean;
  colors: HexColorControlsProps;
  flows: MapFlowMenuProps;
  legend: HexLegendProps;
  /** The flow layer's figures for the tracked product: compact inside its card, whole when no card shows it. */
  flowDetail: (compact: boolean) => ReactNode;
  /** Lot 10's neutral « Gisements et filiales » entry: the deposit of the most needed commodity. */
  depositsHex: string | null;
  handlers: SidePanelHandlers;
}

export function HexSidePanel({ view, acting, companies, reference, picker, showReferencePicker = true, colors, flows, legend, flowDetail, depositsHex, handlers }: HexSidePanelProps) {
  const t = useT();
  const h = t.hex;
  const fmt = useFmt();
  const content = useContent();
  const roomLang = useRoomLang();
  const uiLang = useUiLang();
  const s = mapSideMessages(uiLang);
  const workspace = mapWorkspaceMessages(uiLang);
  const model = useMemo(() => sidePanelModel(view, acting, reference), [view, acting, reference]);
  const [openFolds, setOpenFolds] = useState<SideFold[]>(() => loadList(MAP_SIDE_OPEN_KEY, SIDE_FOLDS, []));
  const [pictureHidden, setPictureHidden] = useState(() => loadFlag(MAP_PLANT_SCENE_HIDDEN_KEY));
  const root = useRef<HTMLDivElement>(null);
  const pictureRoom = usePictureRoom(root);
  const headingId = `side-plants-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const list = useRef<HTMLUListElement>(null);
  const trackedId = reference?.kind === 'product' ? reference.productId : null;
  const tracked = model.rows.find((row) => row.product.id === trackedId) ?? null;
  // The tracked product expands in place (nothing reorders): bring its card into the column's view when it changes.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const card = trackedId && typeof list.current?.querySelector === 'function' ? list.current.querySelector<HTMLElement>(`[data-side-card="${trackedId}"]`) : null;
    card?.scrollIntoView?.({ block: 'nearest' });
  }, [trackedId]);
  const fold = (key: SideFold) => ({
    open: openFolds.includes(key),
    onToggle: (open: boolean) => {
      if (open === openFolds.includes(key)) return;
      const next = open ? SIDE_FOLDS.filter((k) => k === key || openFolds.includes(k)) : openFolds.filter((k) => k !== key);
      saveList(MAP_SIDE_OPEN_KEY, next);
      setOpenFolds(next);
    },
  });
  const togglePicture = () => {
    saveFlag(MAP_PLANT_SCENE_HIDDEN_KEY, !pictureHidden);
    setPictureHidden(!pictureHidden);
  };
  const money = (k: number) => fmt.money(k);
  const gain = (k: number) => fmt.signedMoney(k);
  const lots = (n: number) => fmt.lots(Math.round(n));
  const date = (turn: number) => fmt.date(turn, view.config.startYear);
  const place = (hexId: string) => hexPlaceLabel(hexId, roomLang, view.siteSlots);
  const emoji = (row: SideRow) => SECTORS[row.product.sectorId]?.emoji ?? '📦';
  const statusLabel = (row: SideRow) => t.factories.status[row.status];

  const verdict = (row: SideRow): { short: string; full: string } => {
    const { flow } = row;
    const madeStock = s.madeStock(lots(flow.planned), lots(flow.stock));
    switch (row.status) {
      case 'building': {
        const opens = date(row.product.firstSalesTurn ?? view.turn + 1);
        return { short: s.verdict.building(opens), full: t.factories.verdict.building(opens) };
      }
      case 'idle': return { short: s.verdict.idle, full: t.factories.verdict.idle };
      case 'shortage': return { short: s.verdict.shortage(lots(flow.shortage)), full: `${t.factories.verdict.shortage(lots(flow.shortage))}\n${madeStock}` };
      case 'surplus': return { short: s.verdict.surplus(lots(flow.surplus), lots(flow.spoiled)), full: `${t.factories.verdict.surplus(lots(flow.surplus), lots(flow.spoiled))}\n${madeStock}` };
      case 'balanced': return { short: s.verdict.balanced(lots(flow.sales ?? 0)), full: `${t.factories.verdict.balanced(lots(flow.sales ?? 0))}\n${madeStock}` };
      default: return { short: s.verdict.unknown, full: t.factories.verdict.unknown };
    }
  };
  const bidText = (bid: HexBid, fees: number) => fees > 0
    ? s.bidFees(h.bidKind[bid.kind], bid.hexId, money(bid.amount), money(fees)) : s.bid(h.bidKind[bid.kind], bid.hexId, money(bid.amount));

  /** The card's decision line, the first case that applies (see sidePanelModel). */
  const decisionLine = (row: SideRow): ReactNode => {
    const d = row.decision;
    if (!d) return null;
    const { company, product } = row;
    switch (d.kind) {
      case 'destination':
        return <p className="side-decision-line"><button type="button" className="side-link" data-side-decision="destination" onClick={() => handlers.showCell(d.hexId)}>
          ⚒ {h.pendingDestination(place(d.hexId))}</button></p>;
      case 'bid':
        return <p className="side-decision-line">
          <button type="button" className="side-link" data-side-decision="bid" title={place(d.bid.hexId)} onClick={() => handlers.openBid(company.id, product.id, d.bid.hexId)}>
            ✉ {bidText(d.bid, d.fees)}</button>
          {d.beaten && <span className="muted"> {s.bidBeaten(d.beaten.hexId, gain(d.beaten.gain))}</span>}
        </p>;
      case 'better': {
        const lateBest = d.lateBest;
        return <p className="side-decision-line">
          <button type="button" className="side-link up" data-side-decision="better" title={place(d.hexId)} onClick={() => handlers.showBetter(product.id, d.hexId)}>
            {(d.perks ? s.betterPerks : s.better)(gain(d.gain), d.hexId, d.payback)} ›</button>
          {/* The bigger gain that would pay back too late: still a cell to look at (a bid above its reserve, say). */}
          {lateBest && <> <button type="button" className="side-link muted" data-side-decision="late-also" title={place(lateBest.hexId)}
            onClick={() => handlers.showBetter(product.id, lateBest.hexId)}>{s.lateAlso(lateBest.hexId, gain(lateBest.gain))}</button></>}
        </p>;
      }
      case 'settle':
        return <p className="side-decision-line">
          <button type="button" className="side-link up" data-side-decision="settle" title={place(d.hexId)} onClick={() => handlers.showBetter(product.id, d.hexId)}>
            {s.settle(gain(d.gain), d.hexId, money(d.reserve))} ›</button>
        </p>;
      case 'late':
        return <p className="side-decision-line">
          <button type="button" className="side-link muted" data-side-decision="late" title={place(d.hexId)} onClick={() => handlers.showBetter(product.id, d.hexId)}>
            {s.late(gain(d.gain), d.hexId)}</button>
        </p>;
      default:
        return <p className="side-decision-line muted" data-side-decision="none">{s.none}</p>;
    }
  };
  const incubatorLine = (row: SideRow): ReactNode => {
    const note = row.incubatorNote;
    if (!note) return null;
    const text = note.kind === 'fallbackNearest' ? s.fallbackNearest(note.hexId)
      : note.kind === 'fallbackAbandon' ? s.fallbackAbandon(date(note.due))
      : note.due !== 'now' ? s.deadlineLater(date(note.due))
      : note.forced ? s.deadlineNowAt(note.forced.hexId, money(note.forced.reserve), note.forced.margin === null ? null : gain(note.forced.margin))
      : s.deadlineNow;
    return <p className="side-note muted" data-side-incubator={note.kind}>{text}</p>;
  };
  const lastResultLine = (row: SideRow): ReactNode => {
    const bid = row.lastResult;
    if (!bid?.result) return null;
    const { outcome, hexId, price, note } = bid.result;
    const what = note ?? [h.bidState[outcome], hexId ?? bid.hexId, price > 0 ? money(price) : null].filter(Boolean).join(' · ');
    return <p className="side-note muted" data-side-last-close={outcome}>{s.lastClose(what)}</p>;
  };
  const nameButton = (row: SideRow, open: boolean) => <button type="button" className="side-card-name" aria-pressed={open}
    aria-label={s.track(row.product.name, statusLabel(row))} onClick={() => handlers.track(row.product.id)}>
    <span aria-hidden="true">{emoji(row)}</span> {row.product.name}
  </button>;
  const pill = (row: SideRow) => <span className={cx('plot-status', STATUS_TONE[row.status])}>{statusLabel(row)}</span>;

  /** The tracked product, expanded in place. */
  const card = (row: SideRow) => {
    const { company, product } = row;
    const { short, full } = verdict(row);
    const plant = product.hexId && !row.incubator ? product.hexId : null;
    return <article className="side-card side-card-open">
      <div className="side-card-head">
        {nameButton(row, true)}
        {row.margin !== null && <span className="side-card-margin" title={t.factories.estimateNote}>{s.margin(gain(row.margin))}</span>}
        {pill(row)}
      </div>
      {!pictureHidden && <PlantMini company={company} product={product} />}
      <p className={cx('side-verdict', `tone-${STATUS_TONE[row.status]}`)} title={full}>{short}</p>
      {decisionLine(row)}
      {incubatorLine(row)}
      {lastResultLine(row)}
      <FreightDetails view={view} freight={row.freight} />
      {flowDetail(true)}
      <div className="side-card-actions">
        {plant && <button type="button" className="btn tiny ghost" data-side-plant={plant} aria-label={s.showPlant(place(plant))} title={s.showPlant(place(plant))}
          onClick={() => handlers.showPlant(plant)}><span aria-hidden="true">📍 {plant}</span></button>}
        <button type="button" className="btn tiny ghost" onClick={() => handlers.settings(company.id, product.id)}>{t.factories.settings}</button>
        <button type="button" className="btn tiny ghost" onClick={() => handlers.openFactory(company.id, product.id)}>{t.city.shell.viewInFactories}</button>
      </div>
    </article>;
  };

  /** Any other product: « D12 · marge +88 k€ · ↗ +40 k€ ailleurs » (✉ a live bid always replaces ↗). */
  const line = (row: SideRow) => {
    const { company, product, decision: d } = row;
    const where = row.incubator ? h.incubator : product.hexId ?? '';
    const what = row.building ? s.verdict.building(date(product.firstSalesTurn ?? view.turn + 1))
      : row.margin !== null ? s.margin(gain(row.margin)) : null;
    const action = !d ? null
      : d.kind === 'bid' ? <button type="button" className="side-link" data-side-decision="bid" title={bidText(d.bid, d.fees)}
        onClick={() => handlers.openBid(company.id, product.id, d.bid.hexId)}>✉ {d.bid.hexId}</button>
      : d.kind === 'destination' ? <button type="button" className="side-link" data-side-decision="destination" title={h.pendingDestination(place(d.hexId))}
        onClick={() => handlers.showCell(d.hexId)}>⚒ {d.hexId}</button>
      : d.kind === 'better' || d.kind === 'settle' ? <button type="button" className="side-link up" data-side-decision={d.kind} title={`${s.elsewhereTitle(gain(d.gain))} · ${place(d.hexId)}`}
        onClick={() => handlers.showBetter(product.id, d.hexId)}>{s.elsewhere(gain(d.gain))}</button>
      : null;
    return <div className="side-row">
      <div className="side-card-head">{nameButton(row, false)}{pill(row)}</div>
      <p className="side-row-line">
        {[where, what].filter(Boolean).join(' · ')}
        {action && <> · {action}</>}
      </p>
    </div>;
  };

  // Header: the acting company, its cash, what its bids already hold; the close's coverage warning when they may fail.
  const committed = model.commitments?.total ?? 0;
  const plan = model.commitments?.closePlan;
  const alert = plan && plan.bids > 0 ? closeAlert(plan) : null;
  const warning = !plan || !alert ? null : alert === 'bankrupt' ? t.closeBanner.bankruptTitle
    : alert === 'short' ? t.closeBanner.shortTitle(money(plan.shortfall)) : t.closeBanner.tightTitle(money(plan.safeShortfall));
  // What the bids hold follows the cash it is part of: in the acting company's own chip when there are several.
  const cash = acting ? <>
    <span aria-hidden="true"> · </span><strong aria-hidden="true">{money(acting.cash)}</strong>
    <span className="sr-only"> {workspace.companyCash(money(acting.cash))}</span>
    {committed > 0 && <span className="hx-side-committed" data-side-committed><span aria-hidden="true"> · </span>{s.committed(money(committed))}</span>}
  </> : null;
  const header = acting && <>
    <div className="map-company-header hx-toolbar-company hx-side-company" role="group" aria-label={t.city.map.actingCompany(acting.name)}
      title={workspace.companyCash(money(acting.cash))}>
      {companies.length > 1
        ? companies.map((c) => <button key={c.id} type="button" className={cx('chip', c.id === acting.id && 'active')}
          aria-pressed={c.id === acting.id} onClick={() => handlers.selectCompany(c.id)}>{c.emoji} {c.name}{c.id === acting.id && cash}</button>)
        : <span>{acting.name}{cash}</span>}
    </div>
    {warning && <p className="hx-side-warn warn" role="status">{warning}{plan && plan.bidsCovered < plan.bids - 0.5 && <> · {t.closeBanner.bidsCapped(money(plan.bidsCovered))}</>}</p>}
  </>;

  const sectorName = (sectorId: SectorId) => content.sectors[sectorId]?.name ?? sectorId;
  const launch = acting && <div className="hx-side-launch">
    {model.playing && model.freeSlots > 0 && model.launchTarget && <button type="button" className="side-link" data-side-launch
      onClick={() => handlers.pickLaunch(model.launchTarget!.sectorId, model.launchTarget!.hexId)}>{s.launchLine(model.freeSlots)}</button>}
    {model.playing && model.freeSlots === 0 && <p className="side-note muted">{t.factories.full(model.canMerge)}</p>}
    {model.playing && model.bestLaunch && <button type="button" className="side-link" data-side-best-launch={model.bestLaunch.hexId} title={place(model.bestLaunch.hexId)}
      onClick={() => handlers.showCell(model.bestLaunch!.hexId)}>{s.bestLaunch(sectorName(model.bestLaunch.sectorId), model.bestLaunch.hexId)}</button>}
    {model.playing && model.launchBids.map(({ bid, fees }) => bid.project && <button key={`${bid.project.id}:${bid.hexId}`} type="button" className="side-link" data-side-launch-bid={bid.hexId}
      title={place(bid.hexId)} onClick={() => handlers.openLaunchBid(bid.project!.sectorId, bid.hexId)}>
      ✉ {s.bidFees(`${h.bidKind.launch} · ${bid.project.name}`, bid.hexId, money(bid.amount), money(fees))} ›</button>)}
    <OpeningChip view={view} sign={model.opening} onShowLaunch={handlers.showOpening} onCommodities={handlers.openCommodities} />
  </div>;

  const entry = (key: string, hexId: string, label: string, title?: string) => <li key={key}>
    <button type="button" className="map-menu-item" data-goto-hex={hexId} title={title} onClick={() => handlers.showCell(hexId)}>{label} ›</button>
  </li>;
  // Lot 10's neutral entry, named after what it selects (the deposit of the most needed commodity), unless a
  // subsidiary or a deposit bid above already leads to the same cell.
  const depositSlot = depositsHex ? view.siteSlots.find((slot) => slot.id === boardCells(view.config).find((hex) => hex.id === depositsHex)?.deposit) : undefined;
  const depositEntry = depositsHex && ![...model.subsidiaries, ...model.siteBids].some((site) => site.hexId === depositsHex)
    ? entry('deposits', depositsHex, depositSlot ? s.depositEntry(depositsHex, content.commodities[depositSlot.commodityId].name) : workspace.goToDeposits, place(depositsHex))
    : null;
  const hideNoBetter = Boolean(tracked && tracked.decision?.kind === 'none' && colors.reference?.kind === 'product' && colors.reference.productId === tracked.product.id);

  return <div ref={root} className={cx('hx-side', pictureRoom && 'hx-side-picture-room')}>
    {acting ? <>
      {header}
      <section className="hx-side-plants" aria-labelledby={headingId}>
        <div className="hx-side-plants-head">
          <h3 id={headingId} className="hx-side-heading">{s.heading}</h3>
          {/* The label says what a click does (no aria-pressed, which would read it backwards); shown only where the picture fits (hexSide.css). */}
          {tracked && <button type="button" className="side-link side-plant-toggle" data-side-picture onClick={togglePicture}>
            {pictureHidden ? s.showPicture : s.hidePicture}</button>}
        </div>
        {model.rows.length === 0 ? <p className="side-note muted">{s.noProduct}</p>
          : <ul ref={list} className="hx-side-cards">{model.rows.map((row) => <li key={row.product.id} data-side-card={row.product.id}>
            {row === tracked ? card(row) : line(row)}
          </li>)}</ul>}
        {/* A tracked product the cards do not show (another company's, before the acting one follows it). */}
        {trackedId && !tracked && flowDetail(false)}
      </section>
      {launch}
    </> : <div className="hx-side-none">
      <p><strong>{t.factories.noneTitle}</strong></p>
      <p className="side-note">{t.factories.noneBody}</p>
      <button type="button" className="btn tiny" onClick={handlers.openCompanyTab}>{t.factories.noneAction}</button>
      <OpeningChip view={view} sign={model.opening} onShowLaunch={handlers.showOpening} onCommodities={handlers.openCommodities} />
    </div>}
    <div className="hx-side-folds">
      <MapFlowFold {...flows} {...fold('flows')} />
      {acting && <details className="hx-side-fold" data-side-fold="deposits" open={fold('deposits').open} onToggle={(event) => fold('deposits').onToggle(event.currentTarget.open)}>
        <summary>{s.depositsSummary(workspace.goToDeposits, model.subsidiaries.length, model.siteBids.length)}</summary>
        <ul className="hx-side-fold-body hx-side-entries">
          {model.subsidiaries.map(({ key, hexId, slot }) => entry(key, hexId, `${place(hexId)} · ${content.commodities[slot!.commodityId].name}`))}
          {model.siteBids.map(({ key, hexId }) => entry(key, hexId, workspace.goToSiteBid(place(hexId))))}
          {depositEntry}
        </ul>
      </details>}
      {model.awards.length > 0 && <details className="hx-side-fold" data-side-fold="awards" open={fold('awards').open} onToggle={(event) => fold('awards').onToggle(event.currentTarget.open)}>
        <summary>{workspace.goToAwards} ({model.awards.length})</summary>
        <ul className="hx-side-fold-body hx-side-entries">
          {model.awards.map((result) => entry(`${result.hexId}:${result.companyId}`, result.hexId,
            [`⚒ ${place(result.hexId)}`, money(result.price), view.companies.find((c) => c.id === result.companyId)?.name].filter(Boolean).join(' · ')))}
        </ul>
      </details>}
      <HexLegendFold {...legend} {...fold('legend')} />
    </div>
    <div className="hx-side-footer">
      {showReferencePicker && <MapReferencePicker {...picker} />}
      <HexColorControls {...colors} hideNoBetter={hideNoBetter} />
    </div>
  </div>;
}
