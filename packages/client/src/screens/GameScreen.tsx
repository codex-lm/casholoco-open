import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from '../hooks/useGame';
import { Tabs, type TabDef } from '../components/Tabs';
import { TopBar } from './game/TopBar';
import { QuarterClose } from './game/QuarterClose';
import { useQuarterCloseWindow } from './game/quarterCloseWindow';
import { JournalTab } from './game/JournalTab';
import { CompanyTab } from './game/CompanyTab';
import { closeShort } from './game/CloseBanner';
import { CityTab } from './game/city/CityTab';
import { FactoriesTab } from './game/FactoriesTab';
import { StocksTab } from './game/StocksTab';
import { CommoditiesTab } from './game/CommoditiesTab';
import { MarketsTab } from './game/MarketsTab';
import { RankingTab } from './game/RankingTab';
import { DealsTab } from './game/DealsTab';
import { useT, useUiLang } from '../i18n';
import type { MapIntent } from './game/mapIntent';
import { TutorialChecklist } from './game/TutorialChecklist';
import { HelpModal } from './game/HelpModal';
import { markTabVisit, markTutorial } from '../tutorialStore';
import type { BoardCell, BoardCellRequest } from '../tutorialBoard';
import { useApp } from '../store';
import { gameTabOrder } from '../guide';
import { followAlert, nextStockFocus, type TopBarAlert } from './game/topBarAlerts';
import { gameNavigationMessages } from '../i18n/gameNavigation';
import './game/gameControls.css';

/** Temps passé sur le journal avant de considérer la une comme lue (checklist). */
const JOURNAL_READ_MS = 3000;

export type TabId = 'journal' | 'company' | 'factories' | 'map' | 'stocks' | 'commodities' | 'markets' | 'deals' | 'ranking';

/**
 * Vrai quand l'arrivée sur un onglet laisse défilement et focus à l'écran plutôt qu'à la barre
 * d'onglets : sur « La carte » avec une intention, la fiche ouverte par la carte s'en charge
 * (scrollIntoView + focus du titre, voir MapView/HexMapView). Une case montrée sans formulaire
 * (« Voir sur la carte » du bilan) arrive comme une visite simple.
 */
export function yieldsFocusToMap(tab: TabId, intent: MapIntent | null): boolean {
  return tab === 'map' && intent !== null && intent.kind !== 'cell';
}

/**
 * Amène sous les barres collantes (jeu et onglets) un élément de l'onglet qui vient de s'ouvrir, et lui donne le focus :
 * au cadre suivant, après le retour en haut de page du changement d'onglet.
 */
export function revealAfterTabChange(selector: string): void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.style.scrollMarginTop = 'calc(var(--topbar-h, 65px) + var(--tabs-h, 0px) + 12px)';
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  });
}

export function GameScreen() {
  const { view } = useGame();
  const room = useApp((s) => s.session?.roomCode ?? 'local');
  // A different room or player is a fresh visit, even when React keeps GameScreen mounted.
  return <GameSession key={JSON.stringify([room, view.you])} room={room} />;
}

function GameSession({ room }: { room: string }) {
  const { view, myCompanies } = useGame();
  const t = useT();
  const navigationText = gameNavigationMessages(useUiLang());
  const quarterClose = useQuarterCloseWindow(view, room);
  const [tab, setTab] = useState<TabId>('journal');
  const [navigationSeq, setNavigationSeq] = useState(0);
  const [companyView, setCompanyView] = useState<'company' | 'factories'>('company');
  const tabScroll = useRef<Partial<Record<TabId, number>>>({});
  const [companyId, setCompanyId] = useState<string | null>(null);
  // Le produit reste sélectionné entre sa fiche illustrée et sa position sur la carte.
  const [productId, setProductId] = useState<string | null>(null);
  // Reading context belongs to this room/player visit. null follows the latest issue/current quarter.
  const [journalTurn, setJournalTurn] = useState<number | null>(null);
  const [rankingTurn, setRankingTurn] = useState<number | null>(null);
  const [stockCompanyId, setStockCompanyId] = useState<string | null>(null);
  // Focus requests are separate from the remembered selection: an ordinary revisit must keep its scroll.
  const [stockFocus, setStockFocus] = useState<{ companyId: string; seq: number } | null>(null);
  // Décision géographique demandée à « La carte » (lancement, déménagement, gisement) ; oubliée
  // dès qu'on quitte l'onglet. Le compteur distingue deux envois de la
  // même intention : la clé de la vue carte change et le formulaire se rouvre (voir CityTab).
  const [mapIntent, setMapIntent] = useState<MapIntent | null>(null);
  const [mapIntentSeq, setMapIntentSeq] = useState(0);
  // Case du plateau demandée par « Vos premiers pas » (sa propre usine, la meilleure case libre) : ce n'est pas une
  // intention (ni formulaire ni clé de la vue carte), la carte déjà affichée la sélectionne sur place. Même durée de vie.
  const [boardCell, setBoardCell] = useState<BoardCellRequest | null>(null);
  const boardCellSeq = useRef(0);
  const pendingTabFocus = useRef<TabId | null>(null);
  // Produit à mettre en avant à l'arrivée dans « Mes usines » : seulement quand on vient le chercher
  // (« Voir dans Mes usines » depuis la carte, « Voir le produit » du bilan), jamais à chaque visite.
  const pendingProductFocus = useRef<string | null>(null);
  const [productFocusSeq, setProductFocusSeq] = useState(0);

  // En arrivant du lobby (défilé jusqu'au bouton « Lancer »), on repart du haut :
  // sinon les onglets et la checklist sont hors de l'écran.
  useEffect(() => {
    tabScroll.current = {};
    window.scrollTo(0, 0);
  }, [room, view.you]);

  // Ordinary tab visits restore that page's own position; links to a decision start at the top,
  // then let the existing focus logic reveal their precise target.
  useLayoutEffect(() => {
    if (yieldsFocusToMap(tab, mapIntent)) return;
    window.scrollTo({ top: pendingTabFocus.current === tab ? 0 : tabScroll.current[tab] ?? 0, behavior: 'instant' });
  }, [tab, navigationSeq]);

  // Un lien dans le contenu démonte son bouton en changeant d'onglet : rendre
  // le focus à l'onglet sélectionné une fois le nouvel écran monté.
  useEffect(() => {
    if (pendingTabFocus.current !== tab) return;
    pendingTabFocus.current = null;
    const product = pendingProductFocus.current;
    pendingProductFocus.current = null;
    // Avec une intention carte, la fiche ouverte par la carte gère elle-même défilement et focus.
    if (yieldsFocusToMap(tab, mapIntent)) return;
    // La carte peut ouvrir une fiche modale sur téléphone ; elle garde son propre focus.
    if (document.querySelector('[role="dialog"]')) return;
    if (tab === 'factories' && product) {
      const plot = document.getElementById(`factory-${product}`);
      if (plot) {
        plot.scrollIntoView({ block: 'nearest' });
        plot.focus({ preventScroll: true });
        return;
      }
    }
    document.querySelector<HTMLButtonElement>('.tabs [role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [tab, productFocusSeq, mapIntent, navigationSeq]);

  // Pastille « nouveau » sur le journal : nouveaux articles depuis la dernière lecture.
  const current = view.journal[view.journal.length - 1];
  const articleCount = current ? current.articles.length + current.rumors.length : 0;
  const journalKey = `${current?.turn ?? view.turn}:${articleCount}`;
  const readingCurrentIssue = journalTurn === null || journalTurn === current?.turn;
  const [seenKey, setSeenKey] = useState(journalKey);
  useEffect(() => {
    if (tab === 'journal' && readingCurrentIssue) setSeenKey(journalKey);
  }, [tab, journalKey, readingCurrentIssue]);

  // Removed targets must not reopen if an id later reappears. Inactive companies still have a valid quote/history.
  useEffect(() => {
    if (journalTurn !== null && !view.journal.some((issue) => issue.turn === journalTurn)) setJournalTurn(null);
    if (rankingTurn !== null && (!Number.isInteger(rankingTurn) || rankingTurn < 1 || rankingTurn > view.turn)) setRankingTurn(null);
    if (stockCompanyId !== null && !view.companies.some((company) => company.id === stockCompanyId)) setStockCompanyId(null);
  }, [journalTurn, rankingTurn, stockCompanyId, view.journal, view.turn, view.companies]);

  // Action/focus requests last only for their destination visit; reading selections survive tab changes.
  useEffect(() => {
    if (tab !== 'stocks') setStockFocus(null);
    if (tab !== 'map') {
      setMapIntent(null);
      setBoardCell(null);
    }
  }, [tab]);

  // Checklist « Vos premiers pas » : la une, lue quelques secondes. Les autres onglets se cochent
  // quand le joueur les ouvre (changeTab, goTo), pas quand la clôture arrive sous un onglet ouvert.
  useEffect(() => {
    if (tab !== 'journal' || !readingCurrentIssue) return;
    const timer = window.setTimeout(() => markTutorial('journal'), JOURNAL_READ_MS);
    return () => window.clearTimeout(timer);
  }, [tab, readingCurrentIssue, journalKey]);

  const selected = myCompanies.find((c) => c.id === companyId) ?? myCompanies[0] ?? null;
  /** Clic sur la barre d'onglets. */
  const changeTab = (next: TabId) => {
    if (next !== tab) tabScroll.current[tab] = window.scrollY;
    if (next === 'company' || next === 'factories') setCompanyView(next);
    markTabVisit(next);
    setTab(next);
  };
  /** Bouton ou lien dans le contenu : même chose, puis le focus suit (voir l'effet plus haut). */
  const goTo = (next: TabId) => {
    pendingTabFocus.current = next;
    pendingProductFocus.current = null;
    changeTab(next);
    setNavigationSeq((value) => value + 1);
  };
  const selectCompany = (id: string) => {
    setCompanyId(id);
    const company = myCompanies.find((c) => c.id === id);
    setProductId((previous) => company?.products.some((p) => p.id === previous) ? previous : company?.products[0]?.id ?? null);
  };
  const selectProduct = (id: string) => {
    const owner = myCompanies.find((c) => c.products.some((p) => p.id === id));
    if (!owner) return;
    setCompanyId(owner.id);
    setProductId(id);
  };
  const openFactory = (id: string, product?: string) => {
    selectCompany(id);
    if (product) setProductId(product);
    goTo('factories');
    if (product) {
      pendingProductFocus.current = product;
      setProductFocusSeq((n) => n + 1);
    }
  };
  const openMap = (id: string) => {
    selectProduct(id);
    goTo('map');
  };
  /** Toute décision géographique se prend sur « La carte » : on y envoie le joueur avec l'intention. */
  const openMapFor = (intent: MapIntent) => {
    if (intent.kind === 'move') selectProduct(intent.productId);
    else if (intent.kind !== 'cell') selectCompany(intent.companyId);
    setMapIntent(intent);
    setMapIntentSeq((n) => n + 1);
    // La vue carte remonte sur l'intention : une case demandée plus tôt ne doit pas lui voler la sélection.
    setBoardCell(null);
    goTo('map');
  };
  /** « Vos premiers pas » : une case du plateau, sélectionnée sur la carte (ouverte si besoin, sinon sur place). */
  const showBoardCell = (cell: BoardCell) => {
    boardCellSeq.current += 1;
    setBoardCell({ cell, seq: boardCellSeq.current });
    if (tab !== 'map') goTo('map');
  };
  const selectJournalTurn = (turn: number | null) => {
    setJournalTurn(turn === current?.turn ? null : turn);
  };
  const openIssue = (turn: number) => {
    selectJournalTurn(turn);
    goTo('journal');
  };
  const selectRankingTurn = (turn: number | null) => {
    // Selecting the live quarter (including End or a journal link) resumes following future closes.
    setRankingTurn(turn === view.turn ? null : turn);
  };
  const openTimeline = (turn: number) => {
    selectRankingTurn(turn);
    goTo('ranking');
  };
  const focusStock = (id: string) => {
    setStockCompanyId(id);
    setStockFocus((previous) => nextStockFocus(previous, id));
  };
  /** A holding in the close report opens its detail, with the same focus as the top-bar alerts. */
  const openStock = (id: string) => {
    focusStock(id);
    goTo('stocks');
  };
  /**
   * La puce d'alerte de la barre du jeu mène là où l'on agit : faillite ou manque d'argent prévus, le bandeau de la
   * clôture de cette entreprise ; participation d'un rival, sa ligne dans la Bourse ; scandale, ses actions discutables.
   */
  const openAlert = (alert: TopBarAlert) => followAlert(alert, {
    selectCompany,
    focusStock,
    goTo,
    reveal: revealAfterTabChange,
  });
  // Les onglets sont remontés (key) à chaque changement d'entreprise : aucune saisie en cours
  // (montant, secteur, cible…) ne doit partir vers l'entreprise nouvellement sélectionnée.

  const tabDefs: Record<TabId, TabDef<TabId>> = {
    journal: { id: 'journal', label: t.game.tabs.journal, badge: seenKey !== journalKey },
    // Pastille : une de mes entreprises ne paiera pas toute sa clôture (bandeau dans l'onglet).
    company: {
      id: 'company',
      label: myCompanies.length > 1 ? t.game.tabs.companies(myCompanies.length) : t.game.tabs.company,
      badge: closeShort(myCompanies) ? t.closeBanner.tabBadge : false,
    },
    // Deux accès directs, qui réutilisent les mêmes fiches de produits et cartes.
    factories: {
      id: 'factories',
      label: (
        <>
          {t.game.tabs.factories} <span className="tab-beta">{t.game.beta}</span>
        </>
      ),
    },
    // Toute décision géographique se prend ici : plus une bêta, l'outil central.
    map: { id: 'map', label: t.game.tabs.map },
    stocks: { id: 'stocks', label: t.game.tabs.stocks },
    commodities: { id: 'commodities', label: t.game.tabs.commodities },
    markets: { id: 'markets', label: t.game.tabs.markets },
    // Pastille : des offres attendent une réponse.
    deals: { id: 'deals', label: t.game.tabs.deals, badge: (view.self?.offers ?? []).some((o) => o.toId === view.you && o.status === 'pending') },
    ranking: { id: 'ranking', label: t.game.tabs.ranking },
  };
  // Sur le plateau, la carte suit l'entreprise et « Mes usines » passe en dernier ; la carte classique garde son ordre.
  const tabs = gameTabOrder(view.config.mapMode).filter((id) => id !== 'factories').map((id) => tabDefs[id]);
  const activePrimary = tab === 'factories' ? 'company' : tab;
  const inCompany = tab === 'company' || tab === 'factories';

  return (
    <div className="game">
      <TopBar openMapFor={openMapFor} goTo={goTo} openAlert={openAlert} onOpenQuarterClose={quarterClose.available ? quarterClose.open : undefined} />
      <QuarterClose
        open={quarterClose.isOpen}
        onClose={quarterClose.close}
        disableAutoOpen={quarterClose.disableAutoOpen}
        onDisableAutoOpen={quarterClose.setDisableAutoOpen}
        openIssue={openIssue}
        openFactory={openFactory}
        openMapFor={openMapFor}
        openCompany={(id) => { selectCompany(id); goTo('company'); }}
        openStock={openStock}
        goTo={goTo}
      />
      <Tabs tabs={tabs} active={activePrimary} onChange={(next) => changeTab(next === 'company' ? companyView : next)} sticky
        ariaLabel={navigationText.primary} idPrefix="game-tab" panelId="game-panel" />
      <main className="page tab-page" id="game-panel" role="tabpanel" aria-labelledby={`game-tab-${activePrimary}`}>
        <TutorialChecklist goTo={goTo} openMapFor={openMapFor} showBoardCell={showBoardCell} tab={tab} openQuarterClose={quarterClose.open} />
        {inCompany && <div className="company-view-nav">
          <Tabs tabs={[{ id: 'company', label: navigationText.management }, { id: 'factories', label: navigationText.workshop }]}
            active={tab} onChange={changeTab} ariaLabel={navigationText.companyViews} idPrefix="company-view-tab" panelId="company-view-panel" />
          <span className="company-view-hint">{tab === 'company' ? navigationText.managementHint : navigationText.workshopHint}</span>
        </div>}
        {tab === 'journal' && <JournalTab selectedTurn={journalTurn} onSelectTurn={selectJournalTurn} onTimeline={openTimeline}
          openCompany={(id) => { selectCompany(id); goTo('company'); }} openStock={openStock} />}
        {inCompany && <section id="company-view-panel" role="tabpanel" aria-labelledby={`company-view-tab-${tab}`}>
        {tab === 'company' && (
          <CompanyTab key={selected?.id ?? 'none'} company={selected} onSelect={selectCompany} goTo={goTo} openIssue={openIssue} openMapFor={openMapFor} onMap={openMap} />
        )}
        {tab === 'factories' && <FactoriesTab key={selected?.id ?? 'none'} company={selected} onSelect={selectCompany} goTo={goTo} onSelectProduct={selectProduct} onMap={openMap} openMapFor={openMapFor} />}
        </section>}
        {tab === 'map' && <CityTab company={selected} onSelect={selectCompany} goTo={goTo} selectedProductId={productId} onSelectProduct={selectProduct} onOpenFactory={openFactory} intent={mapIntent} intentSeq={mapIntentSeq} openMapFor={openMapFor} cellRequest={boardCell} />}
        {tab === 'stocks' && <StocksTab key={stockFocus ? `focus:${stockFocus.seq}` : 'all'}
          selectedCompanyId={stockCompanyId} onSelectCompany={setStockCompanyId}
          focusCompanyId={stockFocus?.companyId ?? null} focusSeq={stockFocus?.seq ?? 0} />}
        {tab === 'commodities' && <CommoditiesTab key={selected?.id ?? 'none'} company={selected} onSelect={selectCompany} />}
        {tab === 'markets' && <MarketsTab openMapFor={openMapFor} company={selected} />}
        {tab === 'deals' && <DealsTab />}
        {tab === 'ranking' && <RankingTab selectedTurn={rankingTurn} onSelectTurn={selectRankingTurn} openIssue={openIssue} />}
      </main>
      <HelpModal />
    </div>
  );
}
