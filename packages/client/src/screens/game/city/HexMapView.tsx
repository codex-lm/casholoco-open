import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { COMMODITY_IDS, SECTORS, hexById, hexPlaceLabel, boardCells, capitalCellId, type CompanyView, type SectorId } from '@muchomoney/core';
import { useGame } from '../../../hooks/useGame';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { useContent, useRoomLang, useT, useUiLang } from '../../../i18n';
import { useFmt } from '../../../fmt';
import { cx } from '../../../util';
import { Modal } from '../../../components/Modal';
import type { TabId } from '../../GameScreen';
import { ProductCard } from '../ProductCard';
import { ExpandCapacityModal } from '../ExpandCapacityModal';
import { CompanyDetail } from '../CompanyDetail';
import { HexLaunchForm, initialBidHex } from '../LaunchForms';
import { HexMoveForm } from '../MoveForms';
import { DepositPanel, SiteSheet, commodityNeed } from '../DepositPanel';
import { biddableDepositSlot, defaultSlot } from '../sitesPickerModel';
import type { MapIntent } from '../mapIntent';
import { HEX_MIN_DRAW_WIDTH, HexBoard } from './HexBoard';
import { MAP_VIEW } from './BaseMap';
import { HexCellSheet } from './HexCellSheet';
import { IndustryPanel } from '../IndustryPanel';
import { ownProduct, isOwn, liveHexBids } from './privacy';
import { HEX_PALETTES, bestMoveHex, bestPricedHex, hexFactory, hexMarginValue, hexReferenceIsRelative, hexReferenceOptions, hexReferenceKey, type HexReference, type HexLens, type HexSupplyReference } from './hexModel';
import { buildMapFlowModel, type FlowMode } from './mapFlows';
import { MAP_SIDE_PANEL_QUERY, MapWorkspace, focusMapSheetTarget } from './MapWorkspace';
import { mapWorkspaceMessages } from '../../../i18n/mapWorkspace';
import { mapSideMessages } from '../../../i18n/mapSide';
import { industryMessages } from '../../../i18n/industry';
import {
  HexColorControls, HexLegendMenu, MapFlowMenu, MapGoToMenu,
  type GoToGroup, type HexColorControlsProps, type MapFlowMenuProps, type ReferenceGroup,
} from './HexMapToolbar';
import { HexSidePanel, type SidePanelHandlers } from './HexSidePanel';
import { MapFlowDetail } from './MapFlowDetail';
import { MapActivityPalette, mapActivities, mapActivityKey, type MapActivity, type MapScenario } from './MapActivityPalette';
import { MapHoverReadout } from './MapHoverReadout';
import { OpeningChip } from './OpeningChip';
import { ReportTable } from '../ReportTable';
import { quarterCloseMessages } from '../../../i18n/quarterClose';
import { hexReadabilityMessages } from '../../../i18n/hexReadability';
import { cellNoteKind, hasSeenCellNote, type CellNoteKind } from '../../../cellNotes';
import { recordTutorialCellSelection, recordTutorialFormOpened, type BoardCell, type BoardCellRequest } from '../../../tutorialBoard';
import '../hexIntegration.css';

const IsometricBoard = lazy(() => import('./isometric/IsometricBoard').then(module => ({ default: module.IsometricBoard })));

type MapActionMode = 'land' | 'factory' | 'supply' | 'move' | 'sell';

interface Props {
  company: CompanyView | null;
  onSelect: (id: string) => void;
  goTo: (tab: TabId) => void;
  selectedProductId?: string | null;
  onSelectProduct?: (id: string) => void;
  onOpenFactory?: (companyId: string, productId?: string) => void;
  /** One-shot geographic decision sent to the map; the parent keys the view on it so it re-initialises. */
  intent?: MapIntent | null;
  /**
   * A cell « Vos premiers pas » asks for (my factory, the best free cell). Not part of the parent's key: the view
   * starts on it when it mounts, and a view already on screen selects it in place, like a click on the board.
   */
  cellRequest?: BoardCellRequest | null;
  frozen?: boolean;
  onToggleStill?: () => void;
}

/** The desktop hex variant consumes the same redacted view as the classic map. */
export function HexMapView({ company, onSelect, goTo, selectedProductId, onSelectProduct, onOpenFactory = (id) => { onSelect(id); goTo('factories'); }, intent = null, cellRequest = null, frozen = false, onToggleStill }: Props) {
  const { view } = useGame();
  const isometric = view.config.mapMode === 'square';
  const network = view.config.industryRules === 'network';
  const depositHexId = (slotId: string | undefined): string | null => slotId ? boardCells(view.config).find((hex) => hex.deposit === slotId)?.id ?? null : null;
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const roomLang = useRoomLang();
  const uiLang = useUiLang();
  const workspaceText = mapWorkspaceMessages(uiLang);
  const sideText = mapSideMessages(uiLang);
  const scenarioText = hexReadabilityMessages(uiLang);
  // The fitted frame (and its zoom) exists from 960 px; narrower, the board keeps the page width, drawn at that width.
  const desktop = useMediaQuery('(min-width: 960px)');
  // From 1200 px the left column (HexSidePanel) replaces the toolbar row: the flow layer's figures go in its card.
  const wide = useMediaQuery(MAP_SIDE_PANEL_QUERY);
  const own = view.companies.filter(isOwn);
  const ownProducts = own.flatMap((c) => c.products).filter((p) => ownProduct(p)?.hexes);
  const firstProduct = ownProducts.find((p) => p.id === selectedProductId) ?? ownProducts[0];
  // The acting company for every inline form (launch, move, deposit): the chosen one when it is ours.
  const acting = company && isOwn(company) ? company : own[0];
  // Workshop links carry a precise existing product. Do not silently construct for another company
  // after a takeover, closure or stale selection, nor reinterpret this network-only intent as a launch.
  const requestedExisting = intent?.kind === 'launch' ? intent.existingProductId : undefined;
  const existingFactoryCompany = requestedExisting && network && intent?.kind === 'launch'
    ? own.find(c => c.id === intent.companyId && c.id === acting?.id && c.products.some(p => p.id === requestedExisting && ownProduct(p)?.hexes)) : undefined;
  const existingFactoryReference: HexReference | null = existingFactoryCompany && requestedExisting
    ? { kind: 'product', productId: requestedExisting } : null;
  // Intent initialisation (the view remounts on each new intent, so these only seed the states below).
  const moveCompany = intent?.kind === 'move' ? own.find((c) => c.products.some((p) => p.id === intent.productId)) : undefined;
  const moveReference: HexReference | null = intent?.kind === 'move' && moveCompany ? { kind: 'product', productId: intent.productId } : null;
  const liveBids = liveHexBids(view);
  // Land and additional-factory bids use the same arrival intent as launches; retain their actual profile.
  const intentBid = intent?.kind === 'launch'
    ? liveBids.find((bid) => bid.companyId === intent.companyId && bid.hexId === intent.hexId) : undefined;
  const pendingLaunch = intentBid?.kind === 'launch' ? intentBid : undefined;
  const pendingFactoryReference: HexReference | null = intentBid?.kind === 'factory' && intentBid.productId
    && ownProducts.some(product => product.id === intentBid.productId)
    ? { kind: 'product', productId: intentBid.productId } : null;
  const intentLaunchSector: SectorId | null = intent?.kind === 'launch' && !requestedExisting ? intent.sectorId ?? pendingLaunch?.project?.sectorId ?? view.sectors[0].id : null;
  const launchReference: HexReference | null = intentLaunchSector ? { kind: 'launch', sectorId: intentLaunchSector } : null;
  const constructionReference = pendingFactoryReference ?? existingFactoryReference ?? launchReference;
  // An existing product can also use vacant land already owned by this exact company.
  const constructionView = existingFactoryCompany && view.hexes ? { ...view, hexes: { ...view.hexes,
    free: [...view.hexes.free, ...(existingFactoryCompany.land ?? []).filter(parcel => parcel.vacant).map(parcel => parcel.hexId)],
  } } : view;
  const intentLaunchHex = constructionReference ? initialBidHex(constructionView, constructionReference, intent?.kind === 'launch' ? intent.hexId : undefined) : null;
  // Reviewing an unresolved move or start-up land bid returns to its actual destination.
  // Resolved bids and bids for companies no longer controlled never seed the form.
  const pendingMove = intent?.kind === 'move' && moveCompany
    ? liveBids.find((bid) => bid.companyId === moveCompany.id && bid.productId === intent.productId)
    : undefined;
  const intentMoveHex = pendingMove?.hexId ?? (moveReference ? bestMoveHex(view, moveReference) : null);
  const firstDepositHex = () => depositHexId(view.siteSlots[0]?.id) ?? depositHexId(boardCells(view.config).find((hex) => hex.deposit)?.deposit);
  /** « Miser sur un gisement… » sans gisement nommé : un gisement où miser est possible (même règle que la carte classique). */
  const biddableDepositHex = (forCompany?: CompanyView): string | null =>
    (forCompany ? depositHexId(biddableDepositSlot(view, forCompany, (c) => commodityNeed(forCompany, c))?.id) : null) ?? firstDepositHex();
  /** « Aller à › Gisements et filiales » : comme l'ancien panneau, la filiale (ou le gisement) de la matière la plus demandée. */
  const depositsHex = (forCompany: CompanyView): string | null => {
    const cid = COMMODITY_IDS.reduce((best, c) => commodityNeed(forCompany, c) > commodityNeed(forCompany, best) ? c : best, COMMODITY_IDS[0]);
    return depositHexId(defaultSlot(view, cid, forCompany)?.id) ?? firstDepositHex();
  };
  const intentDepositHex = intent?.kind === 'deposit' ? depositHexId(intent.slotId) ?? biddableDepositHex(acting) : null;
  // « Voir sur la carte » d'un résultat du bilan : la case seule, chiffrée pour mon produit quand il y est.
  const intentCellHex = intent?.kind === 'cell' && hexById(intent.hexId) ? intent.hexId : null;
  const startProduct = (intentCellHex ? ownProducts.find((p) => p.hexId === intentCellHex) : undefined) ?? firstProduct;
  const initialReference: HexReference = moveReference ?? constructionReference ?? (startProduct ? { kind: 'product', productId: startProduct.id } : { kind: 'launch', sectorId: view.sectors[0].id });
  // My factory on the board: the tracked product's cell, otherwise my first plant that occupies one.
  const ownFactoryHex = firstProduct?.hexId && hexFactory(view, firstProduct.hexId)?.mine ? firstProduct.hexId
    : ownProducts.find((product) => product.hexId && hexFactory(view, product.hexId)?.mine)?.hexId ?? null;
  // The cell asked for by « Vos premiers pas »: the toolbar's best cell for the reference the map prices (any free
  // cell when none can be priced, so that the step can still be done).
  const boardCellHex = (cell: BoardCell, ref: HexReference | null): string | null => cell === 'own' ? ownFactoryHex
    : bestPricedHex(view, ref) ?? (ref ? bestMoveHex(view, ref) : view.hexes?.free[0] ?? null);
  const requestedCellHex = cellRequest && !intent ? boardCellHex(cellRequest.cell, initialReference) : null;
  const initialCell = requestedCellHex ?? intentLaunchHex ?? intentMoveHex ?? intentDepositHex ?? intentCellHex ?? firstProduct?.hexId ?? view.hexes?.free[0] ?? capitalCellId(view.config);
  const [reference, setReference] = useState<HexReference | null>(() => initialReference);
  const [compare, setCompare] = useState(false);
  const [comparedReference, setComparedReference] = useState<HexReference | null>(null);
  const [referenceOrigin, setReferenceOrigin] = useState<string | null>(initialCell);
  const [supplyReference, setSupplyReference] = useState<HexSupplyReference | null>(null);
  const [pendingActivity, setPendingActivity] = useState<MapActivity | null>(null);
  const [selectionToken, setSelectionToken] = useState(0);
  const referenceOptions = useMemo(() => hexReferenceOptions(view), [view]);
  const colorReference = compare && comparedReference && referenceOptions.some((o) => o.key === hexReferenceKey(comparedReference)) ? comparedReference : reference;
  const lensReference = colorReference && referenceOrigin ? { ...colorReference, originHexId: referenceOrigin } : colorReference;
  useEffect(() => {
    const options = hexReferenceOptions(view);
    if (!reference || !options.some((option) => option.key === hexReferenceKey(reference))) setReference(options[0]?.ref ?? null);
  }, [view, reference]);
  const [lens, setLens] = useState<HexLens>(isometric ? 'plain' : 'margin');
  const [selected, setSelected] = useState(initialCell);
  const [hovered, setHovered] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<MapActionMode | null>(
    intent?.kind === 'launch' ? requestedExisting && !existingFactoryReference ? null : intentBid?.kind === 'land' ? 'land' : 'factory' : intent?.kind === 'deposit' ? 'supply' : intent?.kind === 'move' ? 'move' : null);
  const [discoveryNote, setDiscoveryNote] = useState<CellNoteKind | null>(() => {
    const kind = intent || requestedCellHex ? cellNoteKind(view, selected) : null;
    return kind && !hasSeenCellNote(kind) ? kind : null;
  });
  // A cell requested by « Vos premiers pas » is a selection the player asked for: it ticks its step like a click.
  useEffect(() => {
    if (requestedCellHex) recordTutorialCellSelection(view, selected);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Move mode: the board is the destination picker for this product; the next free cell's sheet holds its form.
  const [moveMode, setMoveMode] = useState<{ companyId: string; productId: string } | null>(() => intent?.kind === 'move' && moveCompany ? { companyId: moveCompany.id, productId: intent.productId } : null);
  // Changer d'entreprise aux manettes quitte le mode déménagement : le formulaire dépenserait sinon la trésorerie
  // d'une autre entreprise que celle affichée.
  useEffect(() => {
    if (moveMode && acting && moveMode.companyId !== acting.id) setMoveMode(null);
  }, [acting?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [launch, setLaunch] = useState<{ sectorId: SectorId; hexId: string } | null>(() => acting && intentLaunchSector && intentLaunchHex ? { sectorId: intentLaunchSector, hexId: intentLaunchHex } : null);
  const [depositBidOrigin, setDepositBidOrigin] = useState<string | null>(() => intent?.kind === 'deposit' ? intentDepositHex : null);
  const [open, setOpen] = useState<{ companyId: string; productId?: string } | null>(null);
  const [expandId, setExpandId] = useState<string | null>(null);
  const expansionCompany = own.find(c => c.products.some(p => p.id === expandId));
  const expansionProduct = expansionCompany?.products.find(p => p.id === expandId);
  // A single reference follows the product for both colours and flows, unless comparison is enabled.
  const [flowMode, setFlowMode] = useState<FlowMode>('off');
  const [figures, setFigures] = useState(true);
  const [rivals, setRivals] = useState(true);
  const [reportId, setReportId] = useState<string | null>(null);
  const flowsOn = flowMode !== 'off';
  const flowModel = useMemo(() => {
    if (!flowsOn || reference?.kind !== 'product') return null;
    return buildMapFlowModel(view, reference.productId);
  }, [view, reference, flowsOn]);
  const flowProductId = flowModel?.selectedProductId ?? null;
  const flowCompany = own.find((c) => c.products.some((p) => p.id === flowProductId));
  const reportCompany = own.find((c) => c.id === reportId);
  /** A product of another company I run makes that company the acting one (as a move does): header, cards and forms follow. */
  const followCompany = (productId: string) => {
    const owner = own.find((c) => c.products.some((p) => p.id === productId));
    if (owner && acting && owner.id !== acting.id) onSelect(owner.id);
  };
  const openCell = (hexId: string) => {
    if (hexId !== depositBidOrigin) setDepositBidOrigin(null);
    recordTutorialCellSelection(view, hexId);
    const kind = cellNoteKind(view, hexId);
    setDiscoveryNote(kind && !hasSeenCellNote(kind) ? kind : null);
    setSelected(hexId);
    setSelectionToken((token) => token + 1);
  };
  const selectCell = (hexId: string) => {
    const factory = hexFactory(view, hexId);
    const anotherOwnFactory = factory?.mine && factory.product && factory.product.id !== moveMode?.productId;
    if (moveMode && !anotherOwnFactory) {
      openCell(hexId);
      setReferenceOrigin(hexId);
      setActionMode('move');
      return;
    }
    setActionMode(null);
    openCell(hexId);
    selectReferenceCell(hexId, null);
  };
  const selectReferenceCell = (hexId: string, activity = pendingActivity) => {
    const hex = hexById(hexId);
    if (!hex) return;
    const factory = hexFactory(view, hexId);
    if (!activity && factory?.mine && factory.product) {
      setActionMode(null);
      setDepositBidOrigin(null);
      setMoveMode(null);
      setLaunch(null);
      setSupplyReference(null);
      setReferenceOrigin(hexId);
      // Selecting a real plant follows its operational flows; an explicit colour comparison keeps its profile.
      pickTrackedReference({ kind: 'product', productId: factory.product.id });
      return;
    }
    const slot = hex.deposit ? view.siteSlots.find((s) => s.id === hex.deposit && s.companyId) : null;
    if (!activity && slot && own.some((c) => c.id === slot.companyId)) {
      chooseScenario({ kind: 'supply', reference: { originHexId: hexId, commodityId: slot.commodityId, recipient: colorReference ?? undefined } });
      return;
    }
    if (activity?.kind === 'supply' || !activity && supplyReference) {
      const supply = activity?.kind === 'supply' ? activity : supplyReference!;
      chooseScenario({ kind: 'supply', reference: { originHexId: hexId, commodityId: supply.commodityId,
        recipient: supply.recipient ?? colorReference ?? undefined } });
    } else {
      const ref = activity?.kind === 'factory' ? activity.reference : colorReference;
      if (!ref) return;
      const actual = ref.kind === 'product' && ownProducts.some(p => p.id === ref.productId && p.hexId === hexId);
      chooseScenario({ kind: 'factory', reference: { ...ref, originHexId: actual ? undefined : hexId } });
    }
  };
  const chooseScenario = (scenario: MapScenario) => {
    setActionMode(null);
    setDepositBidOrigin(null);
    setMoveMode(null);
    setLaunch(null);
    if (scenario.kind === 'supply') {
      setSupplyReference(scenario.reference);
      setReferenceOrigin(null);
    } else {
      setSupplyReference(null);
      setReferenceOrigin(scenario.reference.originHexId ?? null);
      const { originHexId: _origin, ...productReference } = scenario.reference;
      if (compare) setComparedReference(productReference);
      else pickTrackedReference(productReference);
    }
    setPendingActivity(null);
  };
  const resetScenario = () => { setReferenceOrigin(null); setSupplyReference(null); setPendingActivity(null); setDepositBidOrigin(null); };
  const selectRecipient = (recipient: HexReference) => {
    if (pendingActivity?.kind === 'supply') setPendingActivity({ ...pendingActivity, recipient });
    else if (supplyReference) setSupplyReference({ ...supplyReference, recipient });
  };
  const dropActivity = (hexId: string, key: string) => {
    const activity = mapActivities(view).find(a => mapActivityKey(a) === key);
    if (!activity) return;
    const configured = pendingActivity && mapActivityKey(pendingActivity) === key ? pendingActivity
      : activity.kind === 'supply' && supplyReference?.commodityId === activity.commodityId
        ? { ...activity, recipient: supplyReference.recipient } : activity;
    setActionMode(null);
    openCell(hexId);
    selectReferenceCell(hexId, configured);
    // On the 3D island a drop prepares the authoritative order. Nothing is spent until its form is submitted.
    if (isometric) {
      const cell = hexById(hexId);
      const slot = cell?.deposit ? view.siteSlots.find(s => s.id === cell.deposit) : null;
      if (configured.kind === 'factory' && cell && !cell.deposit) {
        const vacantOwner = own.find(c => c.land?.some(parcel => parcel.hexId === hexId && parcel.vacant));
        const profileOwner = configured.reference.kind === 'product'
          ? own.find(c => c.products.some(product => configured.reference.kind === 'product' && product.id === configured.reference.productId)) : acting;
        const builder = vacantOwner ?? profileOwner;
        const fits = configured.reference.kind === 'launch'
          || builder?.products.some(product => configured.reference.kind === 'product' && product.id === configured.reference.productId);
        if (fits && ((view.hexes?.free ?? []).includes(hexId) || vacantOwner)
          && view.phase === 'playing' && view.turn < view.config.totalTurns) setActionMode('factory');
      }
      if (configured.kind === 'supply' && slot && !slot.companyId && slot.commodityId === configured.commodityId) setActionMode('supply');
    }
  };
  const prepareActivity = (activity: MapActivity) => {
    const origin = activity.kind === 'supply' ? activity.originHexId ?? selected
      : activity.reference.kind === 'product' ? ownProducts.find(p => activity.reference.kind === 'product' && p.id === activity.reference.productId)?.hexId ?? selected : selected;
    setActionMode(null);
    openCell(origin);
    selectReferenceCell(origin, activity);
  };
  const startMove = (companyId: string, productId: string) => {
    resetScenario();
    setLaunch(null);
    if (acting?.id !== companyId) onSelect(companyId);
    setMoveMode({ companyId, productId });
    setActionMode('move');
    setReference({ kind: 'product', productId });
    onSelectProduct?.(productId);
  };
  const movingCompany = own.find((c) => c.id === moveMode?.companyId);
  const movingProduct = movingCompany?.products.find((p) => p.id === moveMode?.productId);
  const moveNoBetter = Boolean(movingProduct) && !(view.hexes?.free ?? []).some((id) => (hexMarginValue(view, { kind: 'product', productId: movingProduct!.id }, id, true) ?? 0) > 0);
  const openCompany = view.companies.find((c) => c.id === open?.companyId);
  const openProduct = openCompany?.products.find((p) => p.id === open?.productId);
  const selectedHex = hexById(selected);
  const selectedFree = (view.hexes?.free ?? []).includes(selected);
  const landCompany = own.find(c => c.land?.some(parcel => parcel.hexId === selected && parcel.vacant));
  const buildCompany = landCompany ?? acting;
  const showIndustry = network && buildCompany && selectedHex && !selectedHex.deposit && (selectedFree || landCompany)
    && (actionMode === 'factory' || actionMode === 'land' || actionMode === 'sell')
    && view.phase === 'playing' && (view.turn < view.config.totalTurns || landCompany);
  const selectedSlot = selectedHex?.deposit ? view.siteSlots.find((s) => s.id === selectedHex.deposit) ?? null : null;
  const supplyCompany = own.find(c => c.id === selectedSlot?.companyId) ?? acting;
  // Every newly opened form is a focus/scroll destination, including decisions made inside the sheet.
  const showLaunch = !network && actionMode === 'factory' && Boolean(selectedFree && launch && acting && launch.hexId === selected);
  const showMove = actionMode === 'move' && Boolean(selectedFree && moveMode && movingCompany && movingProduct);
  const showDeposit = actionMode === 'supply' && Boolean(supplyCompany && selectedSlot);
  const formKey = showIndustry ? `industry:${buildCompany!.id}:${selected}:${actionMode}` : showLaunch ? `launch:${acting!.id}:${selected}:${launch!.sectorId}`
    : showMove ? `move:${movingProduct!.id}:${selected}`
    : showDeposit ? `deposit:${acting!.id}:${selectedSlot!.id}` : null;
  useEffect(() => {
    if (showLaunch || showMove || showIndustry && actionMode !== 'sell') recordTutorialFormOpened(view);
  }, [formKey]); // A real form opening, including a player-requested map intent.
  useEffect(() => {
    if (!formKey || typeof document === 'undefined') return;
    const form = document.querySelector<HTMLElement>('[data-hx-map-form]');
    if (!form) return;
    focusMapSheetTarget(form, Boolean(intent && selectionToken === 0));
  }, [formKey, depositBidOrigin]);
  const actionGroup = useRef<HTMLDivElement>(null);
  const actionTriggers = useRef<Partial<Record<MapActionMode, HTMLButtonElement | null>>>({});
  const actionRef = (mode: MapActionMode) => (node: HTMLButtonElement | null) => { actionTriggers.current[mode] = node; };
  // A disappearing form returns its lost focus to the matching action, including forms opened by a drop/intent.
  // If that action is no longer available, the named group is the neutral return point. External focus stays put.
  const closingForm = useRef<{ key: string | null; cell: string; mode: MapActionMode | null }>({ key: null, cell: selected, mode: null });
  useEffect(() => {
    const closed = closingForm.current;
    closingForm.current = { key: formKey, cell: selected, mode: actionMode };
    if (formKey || !closed.key || closed.cell !== selected || typeof document === 'undefined') return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const button = closed.mode ? actionTriggers.current[closed.mode] : null;
    const target = button?.isConnected && !button.disabled && button.getClientRects().length ? button : actionGroup.current;
    if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
  }, [formKey, selected, actionMode]);
  const inlineForm = showIndustry ? <IndustryPanel key={`${buildCompany!.id}:${selected}:${actionMode}:${lensReference ? hexReferenceKey(lensReference) : ''}`} view={view} company={buildCompany!} hexId={selected} reference={lensReference}
    actionMode={actionMode === 'land' ? 'land' : lensReference?.kind === 'launch' ? 'fresh' : 'existing'} onlySale={actionMode === 'sell'} compact onDone={() => setActionMode(null)} /> : showLaunch ? (
    <HexLaunchForm key={`launch:${acting!.id}:${launch!.hexId}:${launch!.sectorId}`} company={acting!} hexId={launch!.hexId} initialSector={launch!.sectorId} onLaunched={() => { setLaunch(null); setActionMode(null); }} onCancel={() => { setLaunch(null); setActionMode(null); }}
      trackedSector={reference?.kind === 'launch' ? reference.sectorId : undefined}
      onSectorChange={(sectorId) => setReference({ kind: 'launch', sectorId })} inSheet compact />
  ) : showMove ? (
    <HexMoveForm key={`move:${movingProduct!.id}:${selected}`} company={movingCompany!} product={movingProduct!} hexId={selected} onDone={() => { setMoveMode(null); setActionMode(null); }} inSheet compact />
  ) : showDeposit ? (
    <DepositPanel key={`deposit:${supplyCompany!.id}:${selectedSlot!.id}`} company={supplyCompany!} slot={selectedSlot!} hideTitle hostDetails compact />
  ) : null;
  // A deposit bid keeps only its header and form in view; the rest of the deposit sheet joins the cell's single fold.
  const inlineDetails = selectedSlot && supplyCompany ? <SiteSheet key={`deposit:${supplyCompany.id}:${selectedSlot.id}`} company={supplyCompany} slot={selectedSlot} hideHead hideDecision readOnly /> : null;
  const pickTrackedReference = (ref: HexReference) => {
    setPendingActivity(null);
    setSupplyReference(null);
    setReference(ref);
    if (ref.kind === 'product') {
      onSelectProduct?.(ref.productId);
      followCompany(ref.productId);
    }
    if (moveMode && (ref.kind !== 'product' || ref.productId !== moveMode.productId)) setMoveMode(null);
  };
  /** « Voir » de la piste : la case conseillée, chiffrée pour une usine neuve de ce secteur (aucun formulaire ouvert). */
  const showOpening = (sectorId: SectorId, hexId: string) => {
    resetScenario();
    pickTrackedReference({ kind: 'launch', sectorId });
    openCell(hexId);
    selectReferenceCell(hexId, { kind: 'factory', reference: { kind: 'launch', sectorId } });
  };
  const referenceGroups: ReferenceGroup[] = [
    { label: workspaceText.ownProductsGroup, options: referenceOptions.flatMap((o) => o.ref.kind === 'product' ? [{ key: o.key, label: o.label }] : []) },
    { label: workspaceText.newPlantGroup, options: referenceOptions.flatMap((o) => o.ref.kind === 'launch'
      ? [{ key: o.key, label: t.city.map.refNewPlant(content.sectors[o.ref.sectorId].name) }] : []) },
  ];
  const referenceLabel = (ref: HexReference | null) => ref
    ? referenceGroups.flatMap((group) => group.options).find((option) => option.key === hexReferenceKey(ref))?.label ?? null : null;
  // « Chiffrer pour » only changes what is estimated. A product's own cell replaces another own factory (or nothing
  // on the board) as the selection; a free cell stays selected, so that several products can be compared on it.
  const chooseReference = (key: string) => {
    const ref = referenceOptions.find((o) => o.key === key)?.ref;
    if (!ref) return;
    pickTrackedReference(ref);
    if (moveMode && ref.kind === 'product' && ref.productId === moveMode.productId) return;
    setMoveMode(null);
    setActionMode(null);
    setReferenceOrigin(selected);
    if (ref.kind !== 'product') return;
    const cell = own.flatMap((c) => c.products).find((p) => p.id === ref.productId)?.hexId;
    if (cell && cell !== selected && hexById(cell) && (!hexById(selected) || hexFactory(view, selected)?.mine)) { openCell(cell); setReferenceOrigin(cell); }
  };
  // Another acting company (its chip, or a product of it tracked elsewhere): its first product becomes the reference,
  // unless the tracked one already belongs to it; a selected free cell stays selected (« Chiffrer pour » rule).
  const previousActing = useRef(acting?.id);
  // An explicit bid review brings its company and form together. A normal company switch still closes old forms.
  const bidCompanyTransition = useRef<string | null>(null);
  useEffect(() => {
    if (previousActing.current === acting?.id) return;
    previousActing.current = acting?.id;
    const reviewingCompany = bidCompanyTransition.current;
    bidCompanyTransition.current = null;
    if (reviewingCompany && reviewingCompany === acting?.id) return;
    if (!acting || (reference?.kind === 'product' && acting.products.some((p) => p.id === reference.productId))) return;
    const first = acting.products.find((p) => ownProduct(p));
    if (first) chooseReference(`product:${first.id}`);
  }, [acting?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = (hexId: string) => hexPlaceLabel(hexId, roomLang, view.siteSlots);
  const ownIds = new Set(own.map((c) => c.id));
  const controlledIds = new Set(own.filter((c) => c.controllerId === view.you).map((c) => c.id));
  const pendingSiteBids = (view.self?.siteBids ?? []).filter((bid) => !bid.result && controlledIds.has(bid.companyId));
  const bidName = (bid: (typeof liveBids)[number]) => bid.kind === 'move'
    ? own.flatMap((c) => c.products).find((p) => p.id === bid.productId)?.name
    : bid.project?.name ?? view.companies.find((c) => c.id === bid.companyId)?.name;
  const bestHex = bestPricedHex(view, lensReference);
  // A new request from « Vos premiers pas » while the map is on screen: select its cell in place, like « Aller à »
  // (colours, flows, comparison and move mode are kept; my factory becomes the tracked product, as on a click).
  // The request the view mounted with is already applied.
  const appliedCellRequest = useRef(cellRequest?.seq ?? 0);
  useEffect(() => {
    if (!cellRequest || cellRequest.seq === appliedCellRequest.current) return;
    appliedCellRequest.current = cellRequest.seq;
    const hexId = boardCellHex(cellRequest.cell, lensReference);
    if (hexId) selectCell(hexId);
  }, [cellRequest?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  const depositsCell = acting ? depositsHex(acting) : firstDepositHex();
  // « Aller à » replaces the old notebook under the map: each entry selects its cell like a click on the board.
  const goToGroups: GoToGroup[] = [
    { key: 'factories', label: workspaceText.goToFactories, entries: own.flatMap((c) => c.products.flatMap((p) => p.hexId && hexById(p.hexId)
      ? [{ key: p.id, label: `${p.name} · ${place(p.hexId)}`, hexId: p.hexId }] : [])) },
    { key: 'subsidiaries', label: workspaceText.goToSubsidiaries, entries: view.siteSlots.flatMap((slot) => {
      const hexId = slot.companyId && ownIds.has(slot.companyId) ? depositHexId(slot.id) : null;
      return hexId ? [{ key: slot.id, label: `${place(hexId)} · ${content.commodities[slot.commodityId].name}`, hexId }] : [];
    }) },
    { key: 'bids', label: workspaceText.goToBids, entries: [
      ...liveBids.flatMap((bid, i) => hexById(bid.hexId)
        ? [{ key: `hex:${i}:${bid.hexId}`, label: [t.hex.bidKind[bid.kind], bidName(bid), place(bid.hexId)].filter(Boolean).join(' · '), hexId: bid.hexId }] : []),
      ...pendingSiteBids.flatMap((bid) => {
        const hexId = depositHexId(bid.slotId);
        return hexId ? [{ key: `site:${bid.companyId}:${bid.slotId}`, label: workspaceText.goToSiteBid(place(hexId)), hexId }] : [];
      }),
    ] },
    { key: 'best', label: workspaceText.goToBest, entries: bestHex ? [{ key: bestHex, label: place(bestHex), hexId: bestHex }] : [] },
    { key: 'awards', label: workspaceText.goToAwards, entries: (view.hexes?.results ?? []).map((result) => ({ key: `${result.hexId}:${result.companyId}`,
      label: [`⚒ ${place(result.hexId)}`, fmt.money(result.price), view.companies.find((c) => c.id === result.companyId)?.name].filter(Boolean).join(' · '),
      hexId: result.hexId })) },
    { key: 'deposits', entries: depositsCell ? [{ key: 'deposits', label: workspaceText.goToDeposits, hexId: depositsCell }] : [] },
  ];
  const comparedLabel = compare && lensReference !== reference ? referenceLabel(lensReference) : null;
  // « Blé & Oseille · 12,0 M€ »: read aloud as « Trésorerie : 12,0 M€ ».
  const actingCash = acting ? <>
    <span aria-hidden="true"> · </span><strong aria-hidden="true">{fmt.money(acting.cash)}</strong>
    <span className="sr-only"> {workspaceText.companyCash(fmt.money(acting.cash))}</span>
  </> : null;
  // The one-row toolbar (below 1200 px) ends with the acting company in brief; the left column has its own header.
  const companyHeader = acting && <div className="map-company-header hx-toolbar-company" role="group" aria-label={t.city.map.actingCompany(acting.name)}
    title={workspaceText.companyCash(fmt.money(acting.cash))}>
    {/* The cash sits right after the acting company's name: with several chips, inside the pressed one. */}
    {own.length > 1
      ? own.map((c) => <button key={c.id} type="button" className={cx('chip', c.id === acting.id && 'active')}
        aria-pressed={c.id === acting.id} onClick={() => onSelect(c.id)}>{c.emoji} {c.name}{c.id === acting.id && actingCash}</button>)
      : <span>{acting.name}{actingCash}</span>}
  </div>;
  // The toolbar row and the left column share these tools and the map's state; only one of the two is mounted.
  const pickerProps = { groups: supplyReference ? [...referenceGroups, { label: scenarioText.theoretical,
    options: [{ key: `supply:${supplyReference.commodityId}`, label: scenarioText.supplyLabel(content.commodities[supplyReference.commodityId].name) }] }] : referenceGroups,
    trackedKey: supplyReference ? `supply:${supplyReference.commodityId}` : reference ? hexReferenceKey(reference) : '', onTrackedChange: chooseReference };
  const delivery = Boolean(supplyReference || referenceOrigin || colorReference?.kind === 'product');
  const mapDelta = !delivery && hexReferenceIsRelative(lensReference);
  const colorProps: HexColorControlsProps = { view, reference: lensReference, supplyReference, delivery, lens, delta: mapDelta, onLensChange: setLens, comparedLabel };
  const openingChip = <OpeningChip view={view} onShowLaunch={showOpening} onCommodities={() => goTo('commodities')} />;
  const flowProps: MapFlowMenuProps = {
    mode: flowMode, onModeChange: (mode) => { setFlowMode(mode); if (mode === 'off') setCompare(false); },
    figures, onFiguresChange: setFigures, showFiguresToggle: !isometric || flowMode === 'sales', rivals, onRivalsChange: setRivals, unavailable: reference?.kind !== 'product',
    compare, onCompareChange: (enabled) => { if (enabled) setComparedReference(reference); setCompare(enabled); },
    groups: referenceGroups, trackedKey: reference ? hexReferenceKey(reference) : '',
    comparedKey: lensReference ? hexReferenceKey(lensReference) : '', onComparedChange: (key) => {
      const ref = referenceOptions.find((o) => o.key === key)?.ref;
      if (ref) setComparedReference(ref);
    },
  };
  const legendProps = { view, reference: lensReference, supplyReference, delivery, lens, delta: mapDelta, inspection: true };
  // The flow layer's figures for the tracked product: in its card in the left column, below the workspace otherwise.
  const flowDetail = (compact: boolean) => flowModel && <MapFlowDetail model={flowModel} mode={flowMode} compact={compact} onOpenFactory={onOpenFactory}
    onOpenMaterials={(companyId, productId) => { onSelect(companyId); onSelectProduct?.(productId); goTo('commodities'); }}
    onOpenReport={flowCompany?.reports.length ? (companyId) => setReportId(companyId) : undefined} />;
  // The left column's lines take the map's own paths: nothing is bid or sent from there.
  const sideHandlers: SidePanelHandlers = {
    track: (productId) => chooseReference(`product:${productId}`),
    showPlant: selectCell,
    // « Ailleurs » / ↗: that free cell, priced for this product (its sheet's headline says the same), no form.
    showBetter: (productId, hexId) => {
      resetScenario();
      setCompare(false);
      setMoveMode(null);
      pickTrackedReference({ kind: 'product', productId });
      openCell(hexId);
      selectReferenceCell(hexId, { kind: 'factory', reference: { kind: 'product', productId } });
    },
    openBid: (companyId, productId, hexId) => { startMove(companyId, productId); openCell(hexId); setReferenceOrigin(hexId); },
    showCell: selectCell,
    openLaunchBid: (sectorId, hexId) => {
      resetScenario();
      setMoveMode(null);
      pickTrackedReference({ kind: 'launch', sectorId });
      setLaunch({ sectorId, hexId });
      openCell(hexId);
      setReferenceOrigin(hexId);
      setActionMode('factory');
    },
    pickLaunch: (sectorId, hexId) => {
      const origin = hexId ?? selected;
      openCell(origin);
      selectReferenceCell(origin, { kind: 'factory', reference: { kind: 'launch', sectorId } });
    },
    settings: (companyId, productId) => { onSelectProduct?.(productId); setOpen({ companyId, productId }); },
    openFactory: (companyId, productId) => onOpenFactory(companyId, productId),
    showOpening,
    openCommodities: () => goTo('commodities'),
    openCompanyTab: () => goTo('company'),
    selectCompany: onSelect,
  };
  // The folded column keeps a minimal key of the colours: the reference's emoji, the lens and its five bands.
  const lensSectorId = lensReference?.kind === 'launch' ? lensReference.sectorId
    : own.flatMap((c) => c.products).find((p) => lensReference?.kind === 'product' && p.id === lensReference.productId)?.sectorId;
  const stripTitle = sideText.stripKey(t.hex.lens[lens], referenceLabel(lensReference) ?? '');
  const sideStrip = <p className="map-side-strip" title={stripTitle}>
    {lensSectorId && <span aria-hidden="true">{SECTORS[lensSectorId].emoji}</span>}
    <span className="map-side-strip-lens" aria-hidden="true">{t.hex.lens[lens]}</span>
    {lens !== 'plain' && <span className="map-side-strip-bands" aria-hidden="true">{HEX_PALETTES[lens].map((color) => <i key={color} style={{ backgroundColor: color }} />)}</span>}
    <span className="sr-only">{stripTitle}</span>
  </p>;
  const scenarioSector = lensReference?.kind === 'launch' ? lensReference.sectorId
    : ownProducts.find(p => lensReference?.kind === 'product' && p.id === lensReference.productId)?.sectorId;
  const canAct = Boolean(acting && view.phase === 'playing' && view.turn < view.config.totalTurns);
  const canBuild = canAct && Boolean(selectedFree || landCompany) && !selectedSlot && Boolean(scenarioSector);
  const profileFits = lensReference?.kind !== 'product' || Boolean(buildCompany?.products.some(p => p.id === lensReference.productId));
  const canSupply = canAct && Boolean(selectedSlot && !selectedSlot.companyId
    && (!supplyReference || selectedSlot.commodityId === supplyReference.commodityId));
  const relocatable = lensReference?.kind === 'product' ? ownProducts.find(p => p.id === lensReference.productId) : null;
  const pendingBid = liveBids.find(b => b.hexId === selected && ownIds.has(b.companyId));
  const reviewPendingBid = () => {
    if (!pendingBid) return;
    const owner = own.find(c => c.id === pendingBid.companyId);
    if (!owner) return;
    if ((pendingBid.kind === 'move' || pendingBid.kind === 'startup') && pendingBid.productId) {
      startMove(owner.id, pendingBid.productId);
      setReferenceOrigin(selected);
      return;
    }
    const product = pendingBid.kind === 'factory' ? owner.products.find(p => p.id === pendingBid.productId) : undefined;
    const profile: HexReference = pendingBid.project ? { kind: 'launch', sectorId: pendingBid.project.sectorId }
      : product ? { kind: 'product', productId: product.id }
        : owner.products[0] ? { kind: 'product', productId: owner.products[0].id }
          : { kind: 'launch', sectorId: view.sectors[0].id };
    resetScenario();
    setCompare(false);
    setMoveMode(null);
    setReference(profile);
    setReferenceOrigin(selected);
    setLaunch(profile.kind === 'launch' ? { sectorId: profile.sectorId, hexId: selected } : null);
    if (profile.kind === 'product') onSelectProduct?.(profile.productId);
    bidCompanyTransition.current = acting?.id !== owner.id ? owner.id : null;
    if (acting?.id !== owner.id) onSelect(owner.id);
    setActionMode(pendingBid.kind === 'land' ? 'land' : 'factory');
  };
  const paletteActions = acting && <div ref={actionGroup} role="group" tabIndex={-1} aria-label={scenarioText.actionsAt(place(selected))}>
    <span className="hx-action-place">{place(selected)}</span>
    <div className="hx-action-buttons">
      {network && !selectedSlot && <button ref={actionRef('land')} type="button" className="btn small" disabled={!canAct || !selectedFree} aria-expanded={actionMode === 'land'}
        onClick={() => setActionMode(actionMode === 'land' ? null : 'land')}>{scenarioText.buyLand}</button>}
      {supplyReference || selectedSlot ? <button ref={actionRef('supply')} type="button" className="btn small" disabled={selectedSlot?.companyId && ownIds.has(selectedSlot.companyId) ? !canAct : !canSupply} aria-expanded={actionMode === 'supply'}
        onClick={() => setActionMode(actionMode === 'supply' ? null : 'supply')}>{selectedSlot?.companyId && ownIds.has(selectedSlot.companyId) ? scenarioText.manageSubsidiary : scenarioText.buildSubsidiary}</button>
        : <button ref={actionRef('factory')} type="button" className="btn small" disabled={!canBuild || !profileFits} aria-expanded={actionMode === 'factory'}
          title={!profileFits ? scenarioText.profileCompanyMismatch : undefined} onClick={() => {
            if (scenarioSector) setLaunch({ sectorId: scenarioSector, hexId: selected });
            setActionMode(actionMode === 'factory' ? null : 'factory');
          }}>{scenarioText.buildFactory}</button>}
      {canAct && selectedFree && relocatable && (!network || relocatable.incubator) && <button ref={actionRef('move')} type="button" className="btn small ghost"
        onClick={() => { const owner = own.find(c => c.products.some(p => p.id === relocatable.id)); if (owner) startMove(owner.id, relocatable.id); }}>{t.hex.moveHere(relocatable.name)}</button>}
      {landCompany && <button ref={actionRef('sell')} type="button" className="btn small ghost" onClick={() => setActionMode(actionMode === 'sell' ? null : 'sell')}>{industryMessages(uiLang).sell}</button>}
      {pendingBid && <button type="button" className="btn small ghost" onClick={reviewPendingBid}>{workspaceText.goToBids}</button>}
    </div>
    {inlineForm && <div className="hx-map-form hx-inline-form" data-hx-map-form role="group" tabIndex={-1} aria-label={scenarioText.actionsAt(place(selected))}
      onKeyDown={event => {
        // Portalled confirmations handle their own Escape; composing text and consumed events stay untouched.
        if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229
          || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
        setActionMode(null);
      }}>
      <button type="button" className="btn tiny ghost hx-action-close" onClick={() => setActionMode(null)}>{t.common.close}</button>
      {inlineForm}
    </div>}
  </div>;
  return <div className="hx-map-view">
    <MapWorkspace selectedKey={selected} selectionToken={selectionToken}
      className={isometric ? 'map-workspace-isometric' : undefined} nativeZoom={isometric}
      preserveFormScroll={Boolean(intent && selectionToken === 0)}
      foldLabel={workspaceText.foldSheet} reopenLabel={workspaceText.reopenSheet}
      zoom={isometric ? undefined : { aspect: MAP_VIEW.width / MAP_VIEW.height, labels: { group: workspaceText.zoomGroup, zoomIn: workspaceText.zoomIn,
        zoomOut: workspaceText.zoomOut, fit: workspaceText.zoomFit, fitAria: workspaceText.zoomFitAria } }}
      inlineToolbar
      boardHeader={<div className="hx-map-header"><MapActivityPalette view={view} reference={lensReference} supplyReference={supplyReference} pending={null} singleClick actions={paletteActions}
        flowProductId={flowProductId} onPrepare={prepareActivity} onCancel={() => setPendingActivity(null)} onRecipient={selectRecipient}
        onShowReference={selectCell} onResetOrigin={resetScenario} onPlace={dropActivity} />
        {moveMode && movingProduct && <p className="hx-sheet-note row between" role="status"><span>{t.hex.moveHint}</span><button type="button" className="btn tiny ghost" onClick={() => { setMoveMode(null); setActionMode(null); }}>{t.common.cancel}</button></p>}
        {moveMode && movingProduct && moveNoBetter && <p className="hx-sheet-note warn" role="status" data-hx-move-no-better>{t.hex.lensNoBetter}</p>}
      </div>}
      toolbar={<>
        <HexColorControls {...colorProps} />
        <MapFlowMenu {...flowProps} />
        <MapGoToMenu groups={goToGroups} onGo={selectCell} />
        <HexLegendMenu {...legendProps} />
        {openingChip}
        {companyHeader}
      </>}
      sidePanelLabel={workspaceText.sidePanel}
      sidePanel={<HexSidePanel view={view} acting={acting ?? null} companies={own} reference={reference} picker={pickerProps} showReferencePicker={false} colors={colorProps}
        flows={flowProps} legend={legendProps} flowDetail={flowDetail} depositsHex={depositsCell} handlers={sideHandlers} />}
      sideFold={{ foldLabel: sideText.foldSide, reopenText: sideText.reopenSide, reopenLabel: sideText.reopenSideAria, strip: sideStrip }}
      sheet={<>
        <p className="hx-origin-heading">{scenarioText.selectedOrigin}</p>
        <HexCellSheet view={view} hexId={selected} reference={colorReference} discoveryNote={discoveryNote} details={inlineDetails} readOnly
          onOpenCompany={(companyId, productId) => { if (productId) onSelectProduct?.(productId); setOpen({ companyId, productId }); }}
          onOpenDeposit={acting ? undefined : () => goTo('commodities')}>
        </HexCellSheet>
        <MapHoverReadout view={view} reference={lensReference} supplyReference={supplyReference} hoveredId={hovered} />
      </>}
    >
      {isometric ? <Suspense fallback={<div className="island-loading" role="status">{uiLang === 'en' ? 'Preparing the island…' : 'Préparation de l’île…'}</div>}>
        <IsometricBoard view={view} selectedId={selected} onSelect={selectCell} onInspect={setHovered} onDropActivity={dropActivity} reference={lensReference} supplyReference={supplyReference} lens={lens}
          delivery={delivery} delta={mapDelta} ranks={!delivery} showToolbar={false} showLegend={false}
          flowModel={flowModel} flowMode={flowMode} showFlowFigures={figures} showRivals={rivals} frozen={frozen} onToggleStill={onToggleStill}
          onOpenFactory={(companyId, productId) => setOpen({ companyId, productId })} onRequestExpansion={setExpandId} />
      </Suspense> : <HexBoard view={view} selectedId={selected} onSelect={selectCell} onInspect={setHovered} onDropActivity={dropActivity} reference={lensReference} supplyReference={supplyReference} lens={lens}
        delivery={delivery} delta={mapDelta} ranks={!delivery} showToolbar={false} showLegend={false} onReferenceChange={pickTrackedReference} onLensChange={setLens}
        flowModel={flowModel} flowMode={flowMode} showFlowFigures={figures} showRivals={rivals} minDrawWidth={desktop ? HEX_MIN_DRAW_WIDTH : 0} />}
    </MapWorkspace>
    {!wide && flowDetail(false)}
    {expansionCompany && expansionProduct && <ExpandCapacityModal company={expansionCompany} product={expansionProduct} onClose={() => setExpandId(null)} />}
    {openCompany && <Modal title={openProduct?.name ?? openCompany.name} onClose={() => setOpen(null)} wide>{openProduct && isOwn(openCompany) ? <><button type="button" className="btn small ghost" onClick={() => onOpenFactory(openCompany.id, openProduct.id)}>{t.city.shell.viewInFactories}</button><ProductCard key={`${openCompany.id}/${openProduct.id}`} company={openCompany} product={openProduct} onMove={(productId) => { setOpen(null); startMove(openCompany.id, productId); }} /></> : <CompanyDetail company={openCompany} embedded onClose={() => setOpen(null)} />}</Modal>}
    {reportCompany && reportCompany.reports.length > 0 && <Modal title={quarterCloseMessages(uiLang).reportTitle(reportCompany.name, fmt.date(reportCompany.reports[reportCompany.reports.length - 1].turn, view.config.startYear))} onClose={() => setReportId(null)} wide>
      <ReportTable reports={reportCompany.reports} />
    </Modal>}
  </div>;
}
