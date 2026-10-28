import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CITIES,
  CITY_IDS,
  COMMODITY_IDS,
  DEPOSITS,
  JUNCTIONS,
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_COLORS,
  SECTORS,
  ZONES,
  ZONE_IDS,
  applyAction,
  createGame,
  getContent,
  getPlayerView,
  portHaul,
  resolveTurn,
  roadRoute,
  siteHaul,
  slotCapacity,
  zoneOf,
  type Action,
  type CompanyView,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type ProductView,
  type SectorId,
  type SiteSlotView,
  type ZoneId,
} from '@muchomoney/core';
import { GameProvider, type GameData } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { CityTab, intentKey } from '../src/screens/game/city/CityTab';
import { DepositSheet, ZoneSheet } from '../src/screens/game/city/MapSheets';
import { PlayerSheet } from '../src/screens/game/city/PlayerSheet';
import { isOwn } from '../src/screens/game/city/privacy';
import {
  clusterOffsets,
  defaultValueReference,
  dimmedBy,
  mapCities,
  mapDeposits,
  mapFactories,
  mapScale,
  mapZones,
  mySupplyInputs,
  mySupplyRoutes,
  smoothPath,
  valueLensModel,
  valueReferenceOptions,
} from '../src/screens/game/city/mapModel';
import { deliveredLotPrice } from '../src/transport';
import { fmtFor } from '../src/fmt';
import { MAP_VIEW } from '../src/screens/game/city/BaseMap';
import { MapView, cityLabelBoxes, factoryIconBoxes, factoryIconLayout, flowRingAnchors, initialSheet } from '../src/screens/game/city/MapView';
import { MapFlowLayer } from '../src/screens/game/city/MapFlowLayer';
import { buildMapFlowModel } from '../src/screens/game/city/mapFlows';
import { mapFlowText } from '../src/i18n/mapFlows';
import type { MapIntent } from '../src/screens/game/mapIntent';
import { bestLaunchZone, launchZoneEstimates } from '../src/screens/game/launchPickerModel';
import { zoneRows } from '../src/screens/game/zoneChoice';
import { moveQuartersLeft } from '../src/screens/game/movePickerModel';
import { biddableDepositSlot, defaultSlot, freeDepositSlot } from '../src/screens/game/sitesPickerModel';
import { DepositFooter, DepositPanel, SiteBidFooter, SiteSheet, commodityNeed } from '../src/screens/game/DepositPanel';
import { ZoneLaunchForm } from '../src/screens/game/LaunchForms';
import { ZoneMoveForm } from '../src/screens/game/MoveForms';
import { AmountForm } from '../src/components/AmountForm';
import { ConfirmModal } from '../src/components/Modal';
import { getState, setState, type AppState } from '../src/store';

/**
 * Sans DOM de test (approche test/launch-zones.test.ts) : les états React sont figés pour appeler les
 * composants directement et déclencher leurs vrais gestionnaires ; `overrides` force certains états par
 * position (remise à zéro à chaque rendu par `setView`). La maquette socket suit la charge utile des
 * formulaires des fiches jusqu'à 'game:action' (motif de test/guided-game-api.test.ts).
 */
const hooks = vi.hoisted(() => ({ cursor: 0, overrides: {} as Record<number, unknown> }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: vi.fn(),
    useState: (initial: unknown) => {
      const i = hooks.cursor++;
      const value =
        i in hooks.overrides ? hooks.overrides[i] : typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [value, vi.fn()];
    },
  };
});

const transport = vi.hoisted(() => ({ emit: vi.fn(), connected: true }));
// Preserve the tested action boundary while replacing the former network transport.
vi.mock('../src/solo/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/solo/runtime')>();
  return {
    ...actual,
    applySoloAction: (action: import('@muchomoney/core').Action, turn?: number) =>
      new Promise<import('@muchomoney/core').ActionResult>((resolve) => transport.emit('game:action', turn === undefined ? { action } : { action, turn }, resolve)),
    advanceSoloTurn: (turn?: number) => {
      transport.emit('game:ready', turn === undefined ? { ready: true } : { ready: true, turn });
      return { ok: true, message: 'OK' };
    },
  };
});

// Mise en page « ordinateur » partout (comme le repli SSR du hook), y compris en appel direct des composants.
vi.mock('../src/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));

// Les composants appelés directement (hors GameProvider) lisent `useGame` ici ; les rendus statiques aussi.
const gameData = vi.hoisted(() => ({ current: null as GameData | null }));
vi.mock('../src/hooks/useGame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/hooks/useGame')>();
  return { ...actual, useGame: () => gameData.current as GameData };
});

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

/** Même donnée que GameProvider, pour la maquette useGame. */
function dataFor(view: PlayerView, lang: Lang): GameData {
  const playersById = new Map(view.players.map((p) => [p.id, p]));
  const companiesById = new Map(view.companies.map((c) => [c.id, c]));
  const sectorsById = new Map(view.sectors.map((s) => [s.id, s]));
  const t = messages(lang);
  return {
    view,
    me: playersById.get(view.you)!,
    playersById,
    companiesById,
    sectorsById,
    myCompanies: view.companies.filter((c) => c.controllerId === view.you && c.status === 'active'),
    playerName: (id) => (id ? (playersById.get(id)?.name ?? t.common.unknown) : t.common.autopilot),
    refPrice: (sectorId) => sectorsById.get(sectorId)?.refPrice ?? SECTORS[sectorId]?.refPrice ?? 100,
  };
}

/** État de la maquette pour un rendu (statique ou appel direct) : langue, vue, useGame, curseur des états. */
function setView(view: PlayerView, lang: Lang): void {
  hooks.cursor = 0;
  hooks.overrides = {};
  setState({ lang, view, lobby: null });
  gameData.current = dataFor(view, lang);
}

const initialState = getState();
beforeEach(() => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  transport.emit.mockReset();
  transport.emit.mockImplementation((_event: string, _payload: unknown, ack?: (r: unknown) => void) => ack?.({ ok: true }));
});
afterEach(() => {
  setState(initialState);
  hooks.cursor = 0;
  hooks.overrides = {};
  gameData.current = null;
  vi.unstubAllGlobals();
});

/** Partie réelle : un humain (yaourts : sucre + huile) et 7 bots, quelques trimestres joués. */
function game(turns = 2, seed = 5, lang: Lang = 'fr'): GameState {
  const bots = getContent(lang).bots.slice(0, 7);
  const players: LobbyPlayer[] = [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'yogurts', connected: true, color: PLAYER_COLORS[0] },
    ...bots.map((b, i) => ({
      id: `bot${i + 1}`,
      name: b.ceoName,
      isBot: true,
      botPersonalityId: b.id,
      companyName: b.companyName,
      sectorId: b.preferredSectors[0],
      connected: true,
      color: PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length],
    })),
  ];
  const g = createGame({ seed, totalTurns: 16, turnSeconds: 90, startYear: 2027, lang }, players);
  for (let t = 0; t < turns; t++) resolveTurn(g);
  return g;
}

const mineOf = (g: GameState) => Object.values(g.companies).find((c) => c.controllerId === 'human' && c.status === 'active')!;

/** Cherche le premier élément du type voulu dans un arbre React (fragments compris). */
function findElement(node: ReactNode, pred: (el: ReactElement) => boolean): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findElement(n, pred);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  if (pred(node)) return node;
  return findElement((node.props as { children?: ReactNode }).children, pred);
}

/** Tous les boutons d'un arbre React (pour cliquer les vrais gestionnaires sans DOM). */
function buttonsIn(node: ReactNode): { children?: ReactNode; onClick?: () => void }[] {
  const buttons: { children?: ReactNode; onClick?: () => void }[] = [];
  const visit = (n: ReactNode): void => {
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(n)) return;
    if (n.type === 'button') buttons.push(n.props);
    visit(n.props.children);
  };
  visit(node);
  return buttons;
}

it('« Déménager ici » demande le formulaire de déménagement dans la fiche (onMove avec le produit)', () => {
  const g = game(0);
  const view = getPlayerView(g, 'human');
  setView(view, 'en');
  const onMove = vi.fn();
  const tree = ZoneSheet({ zoneId: 'mountain', view, factories: mapFactories(view), goTo: vi.fn(), onOpenFactory: vi.fn(), acting: null, move: null, onMove, onBackToZone: vi.fn() });
  const move = buttonsIn(tree).find((b) => b.children === messages('en').city.map.zoneSheet.moveHere);
  expect(move).toBeDefined();
  move!.onClick!();
  expect(onMove).toHaveBeenCalledWith(mineOf(g).products[0].id);
});

function ok(g: GameState, who: string, a: Action): void {
  const r = applyAction(g, who, a);
  expect(r.ok, r.message).toBe(true);
}

/**
 * Je remporte le gisement sugar-2 (enchère écrasante, payée au second prix) et je déménage mon usine
 * de yaourts dans la plaine : après la clôture, ma filiale est en service et mon réseau a deux routes,
 * le sucre depuis mon gisement et l'huile depuis le port.
 */
function siteGame(lang: Lang = 'fr'): { g: GameState; mine: GameState['companies'][string] } {
  const g = game(0, 5, lang);
  const mine = mineOf(g);
  mine.cash = 10_000_000;
  ok(g, 'human', { type: 'bidSite', companyId: mine.id, slotId: 'sugar-2', amount: 100_000 });
  ok(g, 'human', { type: 'moveFactory', companyId: mine.id, productId: mine.products[0].id, zoneId: 'plain' });
  resolveTurn(g);
  return { g, mine };
}

describe('La carte : le plateau', () => {
  it('place une ville par CITY_IDS et une zone par ZONE_IDS, aux coordonnées du catalogue', () => {
    expect(mapCities().map((c) => c.id)).toEqual(CITY_IDS);
    for (const c of mapCities()) expect(c).toMatchObject({ x: CITIES[c.id].x, y: CITIES[c.id].y, share: CITIES[c.id].share });
    expect(mapZones().map((z) => z.id)).toEqual(ZONE_IDS);
    for (const z of mapZones()) {
      expect(z).toMatchObject({ x: ZONES[z.id].x, y: ZONES[z.id].y });
      expect(z.cityId).toBe(Object.hasOwn(CITIES, z.id) ? z.id : null);
    }
  });

  it('place un gisement par emplacement de filiale, à sa position fixe (DEPOSITS)', () => {
    const view = getPlayerView(game(), 'human');
    const deposits = mapDeposits(view);
    expect(deposits).toHaveLength(view.siteSlots.length);
    for (const d of deposits) {
      const slot = view.siteSlots.find((s) => s.id === d.slotId)!;
      const fixed = DEPOSITS[d.slotId];
      expect(d).toMatchObject({ commodityId: slot.commodityId, name: slot.name, x: fixed.x, y: fixed.y, capacity: fixed.capacity });
      expect(d.operatorId).toBe(slot.companyId ?? null);
      const operator = slot.companyId ? view.companies.find((c) => c.id === slot.companyId) : undefined;
      expect(d.operatorName).toBe(operator?.name ?? null);
    }
  });
});

describe('La carte : les usines du salon', () => {
  it('montre chaque produit de chaque entreprise active une seule fois, dans sa zone', () => {
    const view = getPlayerView(game(), 'human');
    const expected = view.companies.filter((c) => c.status === 'active').flatMap((c) => c.products.map((p) => p.id));
    const marks = mapFactories(view);
    expect(marks.map((m) => m.productId).sort()).toEqual([...expected].sort());
    for (const m of marks) {
      const c = view.companies.find((x) => x.id === m.companyId)!;
      expect(m.zoneId).toBe(zoneOf(c.products.find((p) => p.id === m.productId)!).id);
    }
  });

  it('range à la capitale une usine sans zone, et suit la zone posée sur l’état du moteur', () => {
    const g = game(0);
    const view = getPlayerView(g, 'human');
    const marks = mapFactories(view);
    // Sans zone sur l'état du produit (la mienne, au départ) : la capitale. Certains bots démarrent déjà zonés.
    const mine = mineOf(g);
    expect(mine.products[0].zoneId).toBeUndefined();
    expect(marks.find((f) => f.productId === mine.products[0].id)!.zoneId).toBe('capital');
    for (const c of view.companies) for (const p of c.products) expect(marks.find((f) => f.productId === p.id)!.zoneId).toBe(zoneOf(p).id);
    // Une zone posée sur l'état du moteur est suivie.
    mine.products[0].zoneId = 'plain';
    const moved = mapFactories(getPlayerView(g, 'human')).find((f) => f.productId === mine.products[0].id)!;
    expect(moved.zoneId).toBe('plain');
  });

  it('colore chaque usine à la couleur de son dirigeant, sans couleur pour le pilote automatique', () => {
    const view = getPlayerView(game(), 'human');
    for (const f of mapFactories(view)) {
      const c = view.companies.find((x) => x.id === f.companyId)!;
      const expected = c.controllerId ? (view.players.find((p) => p.id === c.controllerId)?.color ?? null) : null;
      expect(f.color).toBe(expected);
      expect(f.mine).toBe(c.controllerId === 'human');
    }
    // Une entreprise qui repasse en pilote automatique perd sa couleur (maquette : gris neutre).
    const npc = view.companies.find((c) => c.status === 'active' && c.controllerId !== 'human')!;
    npc.controllerId = null;
    for (const f of mapFactories(view).filter((x) => x.companyId === npc.id)) expect(f.color).toBeNull();
  });

  it('estompe tout ce qui n’est pas à moi avec le filtre « mine »', () => {
    expect(dimmedBy(false, 'mine')).toBe(true);
    expect(dimmedBy(true, 'mine')).toBe(false);
    expect(dimmedBy(false, 'all')).toBe(false);
    expect(dimmedBy(true, 'all')).toBe(false);
  });
});

describe('La carte : les exploitants des gisements', () => {
  it('nomme l’exploitant et sa couleur, grise un gisement libre', () => {
    const { g, mine } = siteGame();
    const view = getPlayerView(g, 'human');
    const deposits = mapDeposits(view);
    // Mon gisement : mon entreprise, ma couleur de joueur, « à moi ».
    const own = deposits.find((d) => d.slotId === 'sugar-2')!;
    expect(own).toMatchObject({ operatorId: mine.id, operatorName: mine.name, color: PLAYER_COLORS[0], mine: true });
    // Un gisement resté libre : personne, pas de couleur.
    const free = deposits.find((d) => d.operatorId === null)!;
    expect(free).toMatchObject({ operatorName: null, color: null, mine: false });
    // Un gisement d'un bot (s'il y en a un) : la couleur du bot, pas « à moi ».
    const taken = deposits.find((d) => d.operatorId !== null && d.slotId !== 'sugar-2');
    if (taken) {
      const operator = view.companies.find((c) => c.id === taken.operatorId)!;
      expect(taken.color).toBe(view.players.find((p) => p.id === operator.controllerId)?.color ?? null);
      expect(taken.mine).toBe(false);
    }
  });
});

describe('La carte : mon réseau', () => {
  it('ne trace des routes que pour mes entreprises, aucune pour un spectateur', () => {
    const { g } = siteGame();
    const view = getPlayerView(g, 'human');
    const routes = mySupplyRoutes(view);
    expect(routes.length).toBeGreaterThan(0);
    const myProducts = new Set(view.companies.filter((c) => c.controllerId === 'human').flatMap((c) => c.products.map((p) => p.id)));
    for (const r of routes) expect(myProducts.has(r.productId)).toBe(true);
    // Spectateur : aucune route, et rien n'est « à moi » (ni usine ni gisement).
    const spectator = getPlayerView(g, 'nobody');
    expect(mySupplyRoutes(spectator)).toEqual([]);
    expect(mapFactories(spectator).every((f) => !f.mine)).toBe(true);
    expect(mapDeposits(spectator).every((d) => !d.mine)).toBe(true);
  });

  it('fait suivre à la matière de ma filiale l’itinéraire le moins cher (roadRoute)', () => {
    const { g } = siteGame();
    const view = getPlayerView(g, 'human');
    const sugar = mySupplyRoutes(view).find((r) => r.commodityId === 'sugar')!;
    expect(sugar).toMatchObject({ fromNodeId: 'sugar-2', fromSite: true, zoneId: 'plain' });
    const best = roadRoute('sugar-2', 'plain')!;
    expect(sugar.points).toEqual(best.points);
    expect(sugar.km).toBeCloseTo(best.km);
  });

  it('prix du lot livré : extraction + trajet depuis le gisement, marché + trajet depuis le port', () => {
    const { g } = siteGame();
    const view = getPlayerView(g, 'human');
    const routes = mySupplyRoutes(view);
    // Deux matières dans les yaourts : le sucre (ma filiale) et l'huile (le port).
    expect(routes.map((r) => r.commodityId).sort()).toEqual(['oil', 'sugar']);
    const site = view.companies.find((c) => c.controllerId === 'human')!.sites!.find((s) => s.id === 'sugar-2')!;
    const sugar = routes.find((r) => r.commodityId === 'sugar')!;
    expect(sugar.pricePerLot).toBeCloseTo(site.currentUnitCost + siteHaul('sugar-2', 'plain', 'sugar') * (view.transportFactor ?? 1));
    expect(sugar.pricePerLot).toBeCloseTo(deliveredLotPrice({ kind: 'deposit', slotId: 'sugar-2', extractionCost: site.currentUnitCost }, 'plain', view.transportFactor ?? 1));
    const oil = view.commodities.find((c) => c.id === 'oil')!;
    const port = routes.find((r) => r.commodityId === 'oil')!;
    expect(port).toMatchObject({ fromNodeId: 'capital', fromSite: false, zoneId: 'plain' });
    expect(port.pricePerLot).toBeCloseTo(oil.price + portHaul('plain', 'oil') * (view.transportFactor ?? 1));
    expect(port.pricePerLot).toBeCloseTo(deliveredLotPrice({ kind: 'port', commodityId: 'oil', marketPrice: oil.price }, 'plain', view.transportFactor ?? 1));
  });

  it('usine à la capitale : chaque intrant vient du port (km 0, même nœud), et rien ne se dessine', () => {
    const view = getPlayerView(game(), 'human');
    const inputs = mySupplyInputs(view);
    // Les deux matières des yaourts, achetées au port : l'usine est à la capitale, comme le port.
    expect(inputs.map((r) => r.commodityId).sort()).toEqual(['oil', 'sugar']);
    for (const r of inputs) {
      expect(r).toMatchObject({ fromNodeId: 'capital', fromSite: false, zoneId: 'capital', km: 0 });
      expect(r.points).toHaveLength(1);
      const market = view.commodities.find((c) => c.id === r.commodityId)!.price;
      expect(r.pricePerLot).toBeCloseTo(market + portHaul('capital', r.commodityId));
    }
    // Un nœud vers lui-même n'a pas de tracé : aucune route à dessiner.
    expect(mySupplyRoutes(view)).toEqual([]);
  });
});

describe('La carte : la lentille « valeur »', () => {
  it('référence produit : l’écart de chaque zone avec la zone actuelle de l’usine', () => {
    const g = game(0);
    const mine = mineOf(g);
    mine.products[0].zoneId = 'north_east';
    const view = getPlayerView(g, 'human');
    const p = view.companies.find((c) => c.controllerId === 'human')!.products[0];
    const lens = valueLensModel(view, { kind: 'product', productId: p.id })!;
    const { unitCost } = p.private!.zones;
    expect(lens.referenceZoneId).toBe('north_east');
    expect(lens.referenceCost).toBeCloseTo(unitCost.north_east);
    expect(lens.zones.map((z) => z.zoneId)).toEqual(ZONE_IDS);
    for (const z of lens.zones) {
      expect(z.gap).toBeCloseTo((unitCost[z.zoneId] - unitCost.north_east) / unitCost.north_east);
      expect(z.isReference).toBe(z.zoneId === 'north_east');
    }
  });

  it('référence « nouvelle usine » : l’écart de chaque zone avec la capitale (launchByZone)', () => {
    const view = getPlayerView(game(0), 'human');
    const sector = view.sectors.find((s) => s.launchByZone)!;
    const byZone = sector.launchByZone!;
    const lens = valueLensModel(view, { kind: 'launch', sectorId: sector.id })!;
    expect(lens.referenceZoneId).toBe('capital');
    expect(lens.referenceCost).toBeCloseTo(byZone.capital.unitCost);
    for (const z of lens.zones) {
      expect(z.gap).toBeCloseTo((byZone[z.zoneId].unitCost - byZone.capital.unitCost) / byZone.capital.unitCost);
      expect(z.isReference).toBe(z.zoneId === 'capital');
    }
  });

  it('propose mes produits puis les nouvelles usine, mon premier produit par défaut', () => {
    const g = game(0);
    const view = getPlayerView(g, 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    expect(defaultValueReference(view)).toEqual({ kind: 'product', productId: mine.products[0].id });
    const options = valueReferenceOptions(view);
    expect(options.find((o) => o.key === `product:${mine.products[0].id}`)).toMatchObject({ label: mine.products[0].name });
    expect(options.some((o) => o.ref.kind === 'launch')).toBe(true);
    // Spectateur : pas de produit à soi, la référence retombe sur une nouvelle usine (donnée publique).
    const fallback = defaultValueReference(getPlayerView(g, 'nobody'));
    expect(fallback === null || fallback.kind === 'launch').toBe(true);
  });

  it('ignore le filtre « Mes affaires » en lentille valeur sans calque (shownFilter force « all » sur les deux couches)', () => {
    // Le harnais de ce fichier est SSR seul (ni jsdom ni testing-library dans le dépôt) : impossible de
    // cliquer sur les jetons. Le comportement « filtre mine + lentille valeur ⇒ rien ne s'estompe » se
    // épingle donc à la source, comme le fait déjà test/city.test.ts pour les règles de confidentialité ;
    // le prédicat d'estompe lui-même (dimmedBy) est couvert plus haut.
    const src = readFileSync(join(__dirname, '../src/screens/game/city/MapView.tsx'), 'utf8');
    // Sans calque, comme avant les calques ; un calque allumé laisse sa case « Concurrents » piloter le filtre.
    expect(src).toContain("lens === 'value' && !flowsOn ? 'all' : filter");
    expect(src).toMatch(/<DepositsLayer[\s\S]*?filter=\{shownFilter\}/);
    expect(src).toMatch(/<FactoriesLayer[\s\S]*?filter=\{shownFilter\}/);
    expect(src).not.toMatch(/<DepositsLayer[\s\S]*?filter=\{filter\}/);
  });
});

describe('La carte : le dessin', () => {
  it.each([358, 880])('garde tous les nœuds dans le dessin à %d px de large', (width) => {
    const proj = mapScale(width);
    expect(proj.width).toBe(width);
    expect(proj.height).toBeCloseTo((MAP_HEIGHT / MAP_WIDTH) * width);
    const nodes = [...Object.values(CITIES), ...Object.values(ZONES), ...Object.values(DEPOSITS), ...Object.values(JUNCTIONS)];
    for (const n of nodes) {
      expect(proj.px(n.x)).toBeGreaterThanOrEqual(0);
      expect(proj.px(n.x)).toBeLessThanOrEqual(proj.width);
      expect(proj.py(n.y)).toBeGreaterThanOrEqual(0);
      expect(proj.py(n.y)).toBeLessThanOrEqual(proj.height);
    }
  });

  it('éventaille n marqueurs d’usine sur n positions distinctes', () => {
    for (const n of [1, 2, 3, 5, 8, 13]) {
      const offsets = clusterOffsets(n, 15);
      expect(offsets).toHaveLength(n);
      expect(new Set(offsets.map((o) => `${o.dx},${o.dy}`)).size).toBe(n);
    }
  });

  it('lisse un chemin qui commence par M et ne se ferme que sur demande', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
      { x: 30, y: 12 },
    ];
    const open = smoothPath(pts, false);
    expect(open.startsWith('M')).toBe(true);
    expect(open.endsWith('Z')).toBe(false);
    const closed = smoothPath(pts, true);
    expect(closed.startsWith('M')).toBe(true);
    expect(closed.endsWith('Z')).toBe(true);
    expect(smoothPath([], true)).toBe('');
    expect(smoothPath([{ x: 1, y: 2 }, { x: 3, y: 4 }], true)).toBe('M1,2L3,4Z');
  });
});

// ---------------------------------------------------------------------------
// Rendu serveur de l'onglet (panneaux, carte, carnet, port), FR et EN
// ---------------------------------------------------------------------------

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function renderTab(view: PlayerView, lang: Lang): string {
  setView(view, lang);
  const company = view.companies.find((c) => c.controllerId === view.you && c.status === 'active') ?? null;
  return renderToStaticMarkup(
    createElement(GameProvider, {
      view,
      // Le libellé d'onglet précède l'onglet, comme dans la barre d'onglets de GameScreen.
      children: createElement(Fragment, null, messages(lang).game.tabs.map, createElement(CityTab, { company, onSelect: () => {}, goTo: () => {} })),
    }),
  );
}

describe.each(['fr', 'en'] as const)('onglet La carte (%s)', (lang) => {
  const g = game(2, 5, lang);
  const view = getPlayerView(g, 'human');
  const t = messages(lang);
  const mapNames = getContent(lang).mapNames;
  const html = renderTab(view, lang);
  // La carte SVG seule : les pressables des panneaux et du carnet vivent hors de ce bloc.
  const svgStart = html.indexOf('<svg class="map-svg"');
  const svg = html.slice(svgStart, html.indexOf('</svg>', svgStart));

  it('porte le libellé « 🗺️ La carte » et nomme chaque ville du pays', () => {
    expect(t.game.tabs.map).toContain('🗺️');
    expect(html).toContain(escaped(t.game.tabs.map));
    for (const name of Object.values(mapNames.cities)) expect(html).toContain(escaped(name));
  });

  it('met un pressable par zone et par gisement sur la carte', () => {
    // Chaque zone et chaque gisement, plus les deux médaillons de la capitale (port, bourse) : les calques,
    // éteints par défaut, n'ajoutent ni anneau ni arrêt de tabulation.
    expect(svg).not.toContain('map-flow-layer');
    expect(svg.match(/role="button"/g)?.length).toBe(ZONE_IDS.length + view.siteSlots.length + mapFactories(view).length + 2);
    for (const z of mapZones()) {
      const name = z.cityId ? mapNames.cities[z.cityId] : mapNames.zones[z.id as 'plain' | 'mountain'];
      expect(svg).toContain(`aria-label="${escaped(t.city.map.openZoneAria(name))}"`);
    }
    for (const slot of view.siteSlots) expect(svg).toContain(`aria-label="${escaped(t.city.map.openDepositAria(slot.name))}"`);
  });

  it('montre les trois panneaux, le port de la capitale, et aucune donnée manquante', () => {
    expect(html).toContain(escaped(t.city.signs.you));
    expect(html).toContain(escaped(t.city.signs.threat));
    expect(html).toContain(escaped(t.city.signs.opening));
    expect(html).toContain(escaped(t.city.map.portTitle(mapNames.cities.capital)));
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('usine à la capitale : une ligne de carnet par intrant du port, mais aucune route tracée', () => {
    // Mes yaourts sont à la capitale, sans filiale : sucre et huile viennent du port, km 0.
    expect(html).toContain('map-net-inputs');
    const ulStart = html.indexOf('map-net-inputs');
    const ul = html.slice(ulStart, html.indexOf('</ul>', ulStart));
    expect(ul.match(/<li/g)?.length).toBe(2);
    // La fin de ligne (« … le lot livré » / « … a lot delivered ») est dérivée du catalogue i18n.
    const probe = t.city.map.carnet.inputLine('\u0001c', '\u0001s', '\u0001k', '\u0001p');
    const tail = probe.slice(probe.indexOf('\u0001p') + 2);
    expect(ul.split(tail).length - 1).toBe(2);
    // Port → capitale est un nœud vers lui-même : rien à dessiner (le pointillé de route est le seul
    // élément du SVG avec stroke-opacity="0.85", voir RoutesLayer).
    expect(svg).not.toContain('stroke-opacity="0.85"');
  });
});

describe.each(['fr', 'en'] as const)('onglet La carte, calques éteints : la carte d’avant les calques (%s)', (lang) => {
  const t = messages(lang);
  const text = mapFlowText(lang);
  // Mon usine dans la plaine : sucre depuis ma filiale, huile depuis le port, deux routes à tracer.
  const { g } = siteGame(lang);
  const view = getPlayerView(g, 'human');
  const html = renderTab(view, lang);
  const svgStart = html.indexOf('<svg class="map-svg"');
  const svg = html.slice(svgStart, html.indexOf('</svg>', svgStart));

  it('propose « Aucun » en premier, enfoncé, sans options ni détail de flux', () => {
    const modes = html.slice(html.indexOf('map-flow-modes'), html.indexOf('</div>', html.indexOf('map-flow-modes')));
    const first = modes.match(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/)!;
    expect(first[2]).toBe(escaped(text.mode.off));
    expect(first[1]).toBe('true');
    expect(html).not.toContain('map-flow-detail');
    expect(html).not.toContain('map-flow-hint');
    expect(html).not.toContain(escaped(text.figures));
    expect(svg).not.toContain('map-flow-layer');
  });

  it('garde mes routes d’approvisionnement et leurs pastilles de prix livré', () => {
    const routes = mySupplyRoutes(view);
    expect(routes.length).toBe(2);
    expect(svg.match(/stroke-opacity="0.85"/g)).toHaveLength(routes.length);
    const commodities = getContent(lang).commodities;
    const fmt = fmtFor(lang);
    for (const r of routes) expect(svg).toContain(`>${escaped(t.city.map.routePill(commodities[r.commodityId].name, fmt.money(r.pricePerLot)))}</text>`);
  });

  it('montre les jetons « Tout le salon / Mes affaires » en lentille possession, sans le sélecteur de référence', () => {
    expect(html).toContain(escaped(t.city.shell.filterAll));
    expect(html).toContain(escaped(t.city.shell.filterMine));
    expect(html).not.toContain('class="map-ref"');
    expect(html).not.toContain(escaped(t.city.map.refFor));
  });
});

describe('La carte : les anneaux des calques sur les icônes d’usine', () => {
  it('donne à deux usines de la capitale deux anneaux distincts, chacun sur sa propre icône', () => {
    setState({ lang: 'fr', view: null, lobby: null });
    const view = getPlayerView(game(0), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const second = JSON.parse(JSON.stringify(mine.products[0])) as typeof mine.products[number];
    second.id = 'second-yogurt';
    second.name = 'Yaourt bis';
    mine.products.push(second);
    const proj = mapScale(880, MAP_VIEW);
    const icons = factoryIconLayout(proj, false, mapFactories(view), mapCities(), mapZones());
    const capital = icons.filter((i) => i.mark.zoneId === 'capital' && i.mark.mine);
    expect(capital.map((i) => i.mark.productId)).toEqual([mine.products[0].id, second.id]);
    // L'onglet dessine ses icônes exactement à ces places (même calcul que les anneaux).
    const html = renderTab(view, 'fr');
    for (const icon of icons) expect(html).toContain(`d="M${icon.x0} ${icon.y0 + icon.size} V`);
    const anchors = flowRingAnchors(icons);
    const rings = (layer: string) => new Map([...layer.matchAll(/<circle class="map-flow-ring" cx="([^"]+)" cy="([^"]+)"[^>]*>(?:<title>([^<]+)<\/title>)?/g)]
      .map((m) => [m[1] + ',' + m[2], m[3]]));
    const layer = renderToStaticMarkup(createElement(MapFlowLayer, { proj, model: buildMapFlowModel(view), mode: 'production', figures: true,
      rivals: true, anchors, obstacles: factoryIconBoxes(icons), onSelectProduct: () => {} }));
    const drawn = rings(layer);
    const centres = capital.map((i) => `${i.x0 + i.size / 2},${i.y0 + i.size / 2}`);
    expect(new Set(centres).size).toBe(2);
    for (const centre of centres) expect(drawn.has(centre)).toBe(true);
    // Une icône par anneau : pas d'anneau resté au centre de la ville.
    expect(drawn.has(`${proj.px(ZONES.capital.x)},${proj.py(ZONES.capital.y)}`)).toBe(false);
    expect(drawn.size).toBe(icons.length);
    // Aucun label ne recouvre une icône d'usine, la mienne ou celle d'un rival.
    const boxes = [...layer.matchAll(/<rect class="map-flow-label-box" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)]
      .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) for (const i of icons) {
      expect(b.x < i.x0 + i.size && b.x + b.w > i.x0 && b.y < i.y0 + i.size && b.y + b.h > i.y0).toBe(false);
    }
    // MapView branche bien ces ancres et ces obstacles sur son calque.
    const src = readFileSync(join(__dirname, '../src/screens/game/city/MapView.tsx'), 'utf8');
    expect(src).toMatch(/<MapFlowLayer[\s\S]*?anchors=\{flowAnchors\}[\s\S]*?obstacles=\{flowObstacles\}/);
    expect(src).toContain('flowRingAnchors(icons)');
    expect(src).toContain('<FactoriesLayer icons={icons}');
  });

  it('ne pose aucun label de calque sur le disque ou le nom d’une ville', () => {
    setState({ lang: 'fr', view: null, lobby: null });
    const view = getPlayerView(game(0), 'human');
    const proj = mapScale(880, MAP_VIEW);
    const icons = factoryIconLayout(proj, false, mapFactories(view), mapCities(), mapZones());
    const names = getContent('fr').mapNames.cities;
    const cities = cityLabelBoxes(proj, false, mapCities(), names, () => '40 % des habitants');
    // Sept villes : un disque et un nom chacune ; le nom de la capitale est à droite de son disque.
    expect(cities).toHaveLength(2 * mapCities().length);
    const layer = renderToStaticMarkup(createElement(MapFlowLayer, { proj, model: buildMapFlowModel(view), mode: 'production', figures: true,
      rivals: true, anchors: flowRingAnchors(icons), obstacles: [...factoryIconBoxes(icons), ...cities], onSelectProduct: () => {} }));
    const boxes = [...layer.matchAll(/<rect class="map-flow-label-box" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)]
      .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) for (const c of cities) {
      expect(b.x < c.x + c.width && b.x + b.w > c.x && b.y < c.y + c.height && b.y + b.h > c.y).toBe(false);
    }
    const src = readFileSync(join(__dirname, '../src/screens/game/city/MapView.tsx'), 'utf8');
    expect(src).toContain('cityLabelBoxes(proj, small, cities, mapNames.cities, cityShare)');
  });
});

// ---------------------------------------------------------------------------
// Rendu serveur des fiches (gisement, zone, joueur), FR et EN
// ---------------------------------------------------------------------------

function renderSheet<P extends object>(view: PlayerView, lang: Lang, component: (props: P) => ReactNode, props: P): string {
  setView(view, lang);
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(component, props) }));
}

function renderDepositSheet(view: PlayerView, lang: Lang, slotId: string, acting?: CompanyView | null): string {
  const deposit = mapDeposits(view).find((d) => d.slotId === slotId)!;
  const who = acting !== undefined ? acting : (view.companies.find((c) => isOwn(c)) ?? null);
  return renderSheet(view, lang, DepositSheet, { deposit, view, acting: who });
}

function renderZoneSheet(view: PlayerView, lang: Lang, zoneId: ZoneId): string {
  const acting = view.companies.find((c) => isOwn(c)) ?? null;
  return renderSheet(view, lang, ZoneSheet, { zoneId, view, factories: mapFactories(view), goTo: () => {}, onOpenFactory: () => {}, acting, move: null, onMove: () => {}, onBackToZone: () => {} });
}

/** Préfixe du texte « au port / at the port » (avant le prix), dérivé du catalogue i18n. */
function atPortMark(lang: Lang): string {
  const probe = messages(lang).sites.atPort('\u0001');
  return probe.slice(0, probe.indexOf('\u0001'));
}

describe.each(['fr', 'en'] as const)('La carte : la fiche d’un gisement (%s)', (lang) => {
  const t = messages(lang);

  it('avec DepositPanel (entreprise qui agit) : pas de nom, richesse, exploitant ni prix livrés répétés', () => {
    // Le panneau affiche déjà tout cela (kicker, titre, statut, table des lots livrés) : la fiche ne
    // garde que son titre. Gisement libre : la table des prix livrés vient du panneau (ordinateur).
    const view = getPlayerView(game(0, 5, lang), 'human');
    expect(view.siteSlots.find((s) => s.id === 'oil-2')!.companyId ?? null).toBeNull();
    const slot = view.siteSlots.find((s) => s.id === 'oil-2')!;
    const html = renderDepositSheet(view, lang, 'oil-2');
    expect(html).not.toContain('map-sheet-lines');
    expect(html).not.toContain(escaped(atPortMark(lang)));
    expect(html).not.toContain(escaped(t.city.map.depositSheet.free));
    expect(html).toMatch(sheetTitleRe(slot.name));
    // Le titre n'apparaît qu'une fois : celui de la fiche (le panneau masque le sien).
    expect(html).not.toContain(`<h4 class="pk-title">${escaped(slot.name)}</h4>`);
    expect(html).toContain(escaped(t.sitesPicker.deliveredTitle));
  });

  it('gisement exploité par un rival : aucun prix livré à mes usines, la note « pris » du panneau', () => {
    // Un bot remporte oil-1 (enchère écrasante, payée au second prix) : sa filiale ne sert que lui.
    const g = game(0, 5, lang);
    const botCo = Object.values(g.companies).find((c) => c.controllerId === 'bot1')!;
    botCo.cash = 10_000_000;
    ok(g, 'bot1', { type: 'bidSite', companyId: botCo.id, slotId: 'oil-1', amount: 500_000 });
    resolveTurn(g);
    const view = getPlayerView(g, 'human');
    expect(view.siteSlots.find((s) => s.id === 'oil-1')!.companyId).toBe(botCo.id);
    const html = renderDepositSheet(view, lang, 'oil-1');
    expect(html).not.toContain('map-sheet-lines');
    expect(html).not.toContain(escaped(atPortMark(lang)));
    expect(html).toContain(escaped(t.sitesPicker.takenNote));
  });

  it('gisement exploité par une autre de mes entreprises : aucun prix livré non plus', () => {
    // Une filiale ne sert que sa propre entreprise (§5.8) : si « Ma Seconde » exploite oil-1, mon
    // usine de yaourts (autre entreprise à moi) ne verrait aucun lot de ce gisement.
    const view = getPlayerView(game(0, 5, lang), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    view.companies.push({ ...mine, id: 'mine2', name: 'Ma Seconde', products: [], sites: [] });
    view.siteSlots.find((s) => s.id === 'oil-1')!.companyId = 'mine2';
    const html = renderDepositSheet(view, lang, 'oil-1');
    expect(html).not.toContain('map-sheet-lines');
    expect(html).not.toContain(escaped(atPortMark(lang)));
    expect(html).toContain(escaped(t.sitesPicker.takenNote));
  });

  it('mon propre gisement : la table des prix livrés du panneau, pas la liste de la fiche', () => {
    const { g } = siteGame(lang);
    const view = getPlayerView(g, 'human');
    const html = renderDepositSheet(view, lang, 'sugar-2');
    expect(html).not.toContain('map-sheet-lines');
    expect(html).toContain(escaped(t.sitesPicker.deliveredTitle));
  });

  it('spectateur (pas d’entreprise qui agit) : la fiche montre elle-même richesse, exploitant et prix livrés', () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const slot = view.siteSlots.find((s) => s.id === 'oil-2')!;
    const html = renderDepositSheet(view, lang, 'oil-2', null);
    expect(html).toContain('map-sheet-lines');
    expect(html).toContain(escaped(atPortMark(lang)));
    expect(html).toContain(escaped(t.city.map.depositSheet.free));
    expect(html).toMatch(sheetTitleRe(slot.name));
    expect(html).not.toContain('pk-title');
  });
});

describe.each(['fr', 'en'] as const)('La carte : les gisements libres près de mes usines (%s)', (lang) => {
  const t = messages(lang);

  /** La section du carnet entre son titre et la colonne des zones. */
  function freeNearSection(html: string): string {
    const start = html.indexOf(escaped(t.city.map.carnet.freeNearTitle));
    expect(start).toBeGreaterThan(-1);
    const end = html.indexOf(escaped(t.city.map.carnet.zonesTitle), start);
    expect(end).toBeGreaterThan(start);
    return html.slice(start, end);
  }

  it('exclut les gisements d’une matière que je sors déjà de ma filiale', () => {
    // J'exploite sugar-2 : plus aucun gisement de sucre ne peut m'être disputé utilement (une filiale
    // par matière et par entreprise), mais les gisements d'huile libres restent listés.
    const { g } = siteGame(lang);
    const view = getPlayerView(g, 'human');
    const section = freeNearSection(renderTab(view, lang));
    const freeSugar = view.siteSlots.filter((s) => s.commodityId === 'sugar' && !s.companyId);
    const freeOil = view.siteSlots.filter((s) => s.commodityId === 'oil' && !s.companyId);
    expect(freeSugar.length).toBeGreaterThan(0);
    expect(freeOil.length).toBeGreaterThan(0);
    for (const s of freeSugar) expect(section).not.toContain(escaped(s.name));
    for (const s of freeOil) expect(section).toContain(escaped(s.name));
  });

  it('cache toute la section au dernier trimestre (le moteur refuse les enchères)', () => {
    const { g } = siteGame(lang);
    const view = { ...getPlayerView(g, 'human'), turn: g.config.totalTurns };
    expect(renderTab(view, lang)).not.toContain(escaped(t.city.map.carnet.freeNearTitle));
  });
});

describe.each(['fr', 'en'] as const)('La carte : la fiche d’une zone (%s)', (lang) => {
  it('la capitale n’a pas le bloc « usine ici plutôt qu’à la capitale », les autres zones si', () => {
    const t = messages(lang);
    const view = getPlayerView(game(0, 5, lang), 'human');
    const capital = renderZoneSheet(view, lang, 'capital');
    expect(capital).not.toContain(escaped(t.city.map.zoneSheet.vsCapitalTitle));
    expect(capital).not.toContain('map-gap-cells');
    const south = renderZoneSheet(view, lang, 'south');
    expect(south).toContain(escaped(t.city.map.zoneSheet.vsCapitalTitle));
    expect(south).toContain('map-gap-cells');
  });
});

describe.each(['fr', 'en'] as const)('La carte : la fiche « Vous » (%s)', (lang) => {
  it('se rend sans donnée manquante', () => {
    const view = getPlayerView(game(2, 5, lang), 'human');
    const me = view.players.find((p) => p.id === view.you)!;
    const html = renderSheet(view, lang, PlayerSheet, { player: me, onOpen: () => {} });
    expect(html).toContain(escaped(me.name));
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });
});

describe('prix livré : les news du transport', () => {
  it('shows no road routes or inbound surcharge for crypto, retaining source input prices', () => {
    const g = game(0);
    const mine = mineOf(g);
    const product = mine.products[0];
    product.sectorId = 'crypto';
    product.zoneId = 'mountain';
    mine.sites = [{ id: 'oil-1', commodityId: 'oil', capacity: 30, unitCost: 25, activeFrom: g.turn }];
    g.activeEffects = [{ id: 'haul', newsId: 'test', kind: 'transportCost', value: 3, turnsLeft: 2 }];
    const view = getPlayerView(g, 'human');
    const inputs = mySupplyInputs(view).filter((r) => r.productId === product.id);
    expect(inputs.map((r) => r.commodityId).sort()).toEqual(['chips', 'oil']);
    expect(inputs.every((r) => r.km === 0 && r.points.length === 0)).toBe(true);
    expect(mySupplyRoutes(view).some((r) => r.productId === product.id)).toBe(false);
    expect(inputs.find((r) => r.commodityId === 'oil')!.pricePerLot).toBe(25);
    expect(inputs.find((r) => r.commodityId === 'chips')!.pricePerLot).toBe(view.commodities.find((c) => c.id === 'chips')!.price);
    expect(deliveredLotPrice({ kind: 'port', commodityId: 'oil', marketPrice: 80 }, 'mountain', 3, 'crypto')).toBe(80);
    expect(deliveredLotPrice({ kind: 'deposit', slotId: 'oil-1', extractionCost: 25 }, 'mountain', 3, 'crypto')).toBe(25);
  });

  it('le multiplicateur du trimestre (PlayerView.transportFactor) ne touche que le trajet', () => {
    const port = { kind: 'port', commodityId: 'sugar', marketPrice: 40 } as const;
    const deposit = { kind: 'deposit', slotId: 'sugar-1', extractionCost: 30 } as const;
    expect(deliveredLotPrice(port, 'north', 1.5)).toBeCloseTo(40 + 1.5 * portHaul('north', 'sugar'), 9);
    expect(deliveredLotPrice(deposit, 'north', 1.5)).toBeCloseTo(30 + 1.5 * siteHaul('sugar-1', 'north', 'sugar'), 9);
    expect(deliveredLotPrice(port, 'north')).toBe(deliveredLotPrice(port, 'north', 1));
    // À la capitale, aucun trajet : le prix ne bouge pas.
    expect(deliveredLotPrice(port, 'capital', 2)).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Une seule carte : les décisions géographiques se prennent dans les fiches
// ---------------------------------------------------------------------------

/** Nom d'une zone dans la langue de l'interface : celui de sa ville, ou le sien (plaine, montagne). */
const zoneNameOf = (lang: Lang, z: ZoneId): string => {
  const names = getContent(lang).mapNames;
  return z === 'plain' || z === 'mountain' ? names.zones[z] : names.cities[z];
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Le titre de la fiche ouverte dans la colonne de droite (ou la modale, sur téléphone). */
const sheetTitleRe = (name: string) => new RegExp(`<h3 class="map-sheet-title"[^>]*>${escapeRe(escaped(name))}</h3>`);

/** La carte classique rendue en statique (mise en page « ordinateur » : la fiche est dans la colonne). */
function renderMap(view: PlayerView, lang: Lang, intent?: MapIntent | null, company?: CompanyView | null): string {
  setView(view, lang);
  const selected = company !== undefined ? company : (view.companies.find((c) => c.controllerId === view.you && c.status === 'active') ?? null);
  return renderToStaticMarkup(
    createElement(GameProvider, {
      view,
      children: createElement(MapView, { company: selected, onSelect: () => {}, goTo: () => {}, onOpenFactory: () => {}, frozen: true, onToggleStill: () => {}, intent: intent ?? null }),
    }),
  );
}

/** L'option sélectionnée du sélecteur de référence de la lentille « valeur ». */
function selectedOption(html: string): string {
  const selected = html.match(/<option[^>]*selected[^>]*>/g) ?? [];
  expect(selected).toHaveLength(1);
  return selected[0];
}

describe.each(['fr', 'en'] as const)('La carte : les intentions ouvrent la bonne fiche et le bon formulaire (%s)', (lang) => {
  const t = messages(lang);

  it('« lancer » : lentille valeur sur la nouvelle usine du secteur, fiche de sa meilleure zone, formulaire visible', () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const sector = view.sectors.find((s) => s.id === 'scooters')!;
    const estimates = launchZoneEstimates(sector, view.commodities)!;
    const best = bestLaunchZone(estimates);
    const html = renderMap(view, lang, { kind: 'launch', companyId: mine.id, sectorId: 'scooters' });
    // Lentille valeur : le sélecteur de référence est là, calé sur la nouvelle usine du secteur.
    expect(html).toContain('class="map-product-picker"');
    expect(selectedOption(html)).toContain('value="launch:scooters"');
    // La fiche de la meilleure zone du secteur, la section « Lancer ici » et le formulaire du secteur.
    expect(html).toMatch(sheetTitleRe(zoneNameOf(lang, best)));
    expect(html).toContain(escaped(t.city.map.zoneSheet.launchHere));
    expect(html).toContain(`aria-label="${escaped(t.launch.namePlaceholder)}"`);
    const content = getContent(lang);
    expect(html).toContain(`class="seg-btn active">${escaped(`${content.sectors.scooters?.emoji} ${content.sectors.scooters?.name ?? 'scooters'}`)}`);
  });

  it('« lancer » avec une zone : la fiche de cette zone ; sans secteur : le premier secteur chiffré', () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const html = renderMap(view, lang, { kind: 'launch', companyId: mine.id, sectorId: 'scooters', zoneId: 'mountain' });
    expect(html).toMatch(sheetTitleRe(zoneNameOf(lang, 'mountain')));
    expect(selectedOption(html)).toContain('value="launch:scooters"');
    const first = view.sectors.find((s) => s.launchByZone)!;
    const noSector = renderMap(view, lang, { kind: 'launch', companyId: mine.id });
    expect(selectedOption(noSector)).toContain(`value="launch:${first.id}"`);
  });

  it('intention « lancer » : « Lancer ici » juste sous le titre de la zone, marge de défilement sous la barre collante', () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const html = renderMap(view, lang, { kind: 'launch', companyId: mine.id, sectorId: 'scooters' });
    const launchAt = html.indexOf(escaped(t.city.map.zoneSheet.launchHere));
    const factoriesAt = html.indexOf(escaped(t.city.map.zoneSheet.factoriesTitle));
    expect(launchAt).toBeGreaterThan(-1);
    expect(factoriesAt).toBeGreaterThan(launchAt);
    // Le titre de la fiche (cible du scrollIntoView de l'intention) laisse la place de la barre du haut.
    expect(html).toContain('scroll-margin-top:calc(var(--topbar-h)');
    // Un lancement ouvert depuis une fiche ordinaire a désormais le même ordre : décision puis descriptions repliées.
    const plain = renderZoneSheet(view, lang, 'south');
    expect(plain.indexOf(escaped(t.city.map.zoneSheet.launchHere))).toBeLessThan(plain.indexOf(escaped(t.city.map.zoneSheet.factoriesTitle)));
    expect(plain).toContain('<details class="map-sheet-description">');
    // Focus et défilement à chaque ouverture : le groupe du formulaire est prioritaire sur le titre.
    const src = readFileSync(join(__dirname, '../src/screens/game/city/MapView.tsx'), 'utf8');
    expect(src).toContain('formRef.current ?? headingRef.current');
    expect(src).toContain('focusMapSheetTarget(focusTarget, Boolean(intent && selectionToken === 0))');
  });

  it('rejouer la même intention change la clé de la vue carte : le formulaire se rouvre', () => {
    // La clé porte le numéro d'envoi (mapIntentSeq de GameScreen) : deux clics sur le même panneau
    // « Occasion » remontent la vue, qui se réinitialise sur l'intention.
    const intent: MapIntent = { kind: 'launch', companyId: 'c1', sectorId: 'scooters' };
    expect(intentKey(intent, 2)).not.toBe(intentKey(intent, 1));
    expect(intentKey(intent, 1)).toBe(intentKey(intent, 1));
    expect(intentKey(null, 3)).toBe('plain');
    const src = readFileSync(join(__dirname, '../src/screens/GameScreen.tsx'), 'utf8');
    expect(src).toContain('setMapIntentSeq((n) => n + 1)');
    expect(src).toContain('intentSeq={mapIntentSeq}');
  });

  it('« déménager » : lentille valeur sur le produit, fiche de la meilleure autre zone, formulaire de déménagement visible', () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const product = mine.products[0];
    const rows = zoneRows(product, moveQuartersLeft(view) - 1)!;
    const current = rows.find((r) => r.isCurrent)!;
    const bestRow = rows.find((r) => !r.isCurrent && r.isBest);
    const better = bestRow ? (bestRow.marginDiff !== null ? bestRow.marginDiff > 0 : bestRow.unitCost < current.unitCost) : false;
    const expected = better && bestRow ? bestRow.zoneId : (product.zoneId ?? 'capital');
    const here: ZoneId = product.zoneId ?? 'capital';
    const html = renderMap(view, lang, { kind: 'move', productId: product.id });
    expect(html).toContain('class="map-product-picker"');
    expect(selectedOption(html)).toContain(`value="product:${product.id}"`);
    // ZoneMoveForm dans la fiche (fiche chiffrée de la zone), avec le retour à la fiche de la zone.
    expect(html).toContain(escaped(t.city.map.zoneSheet.backToZone));
    expect(html).toContain(escaped(t.movePicker.sheetKicker));
    expect(html).toContain(`<dd>${escaped(zoneNameOf(lang, expected))}</dd>`);
    expect(html).toContain(`>${escaped(t.movePicker.ctaStay(zoneNameOf(lang, here)))}<`);
  });

  it('« gisement » avec un emplacement : sa fiche, DepositPanel pour l’entreprise qui agit, lentille possession', () => {
    const { g } = siteGame(lang);
    const view = getPlayerView(g, 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const slot = view.siteSlots.find((s) => s.id === 'sugar-2')!;
    const html = renderMap(view, lang, { kind: 'deposit', companyId: mine.id, slotId: 'sugar-2' });
    expect(html).toMatch(sheetTitleRe(slot.name));
    // DepositPanel : ma filiale en service et son bouton « sommeil » ; la lentille possession reste.
    expect(html).toContain(escaped(t.sites.active));
    expect(html).toContain(`aria-label="${escaped(t.sites.sleepAria(t.sites.names.sugar))}"`);
    expect(html).not.toContain('class="map-ref"');
  });

  it('« gisement » sans emplacement : un gisement libre de la matière la plus demandée qu’on n’exploite pas encore', () => {
    const { g } = siteGame(lang);
    const view = getPlayerView(g, 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    // L'entreprise exploite déjà le sucre, son plus gros besoin : sa filiale n'est pas proposée (plus d'enchère possible).
    const owned = new Set((mine.sites ?? []).map((s) => s.commodityId));
    expect(owned.size).toBeGreaterThan(0);
    const expected = biddableDepositSlot(view, mine, (c) => commodityNeed(mine, c))!;
    expect(owned.has(expected.commodityId)).toBe(false);
    expect(expected.companyId ?? null).toBeNull();
    const html = renderMap(view, lang, { kind: 'deposit', companyId: mine.id });
    expect(html).toMatch(sheetTitleRe(expected.name));
  });

  it('« gisement » sans emplacement : un gisement libre où miser plutôt que celui déjà misé (initialSheet)', () => {
    const view = structuredClone(getPlayerView(game(0, 5, lang), 'human'));
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const cid = COMMODITY_IDS.reduce((b, c) => (commodityNeed(mine, c) > commodityNeed(mine, b) ? c : b), COMMODITY_IDS[0]);
    // Mise en attente sur le gisement le plus riche de la matière du plus gros besoin : defaultSlot le
    // rendrait en premier (l'ancien comportement), mais on ne peut plus miser dessus.
    const free = view.siteSlots.filter((s) => s.commodityId === cid && !s.companyId);
    expect(free.length).toBeGreaterThan(1);
    const richest = [...free].sort((a, b) => slotCapacity(b.id) - slotCapacity(a.id))[0];
    view.self!.siteBids = [{ companyId: mine.id, playerId: 'human', commodityId: cid, slotId: richest.id, amount: 6000, turn: view.turn }];
    expect(defaultSlot(view, cid, mine)!.id).toBe(richest.id);
    const wanted = freeDepositSlot(view, cid, mine)!;
    expect(wanted).toBeDefined();
    expect(wanted.id).not.toBe(richest.id);
    const sheet = initialSheet(view, { kind: 'deposit', companyId: mine.id }, mine, undefined);
    expect(sheet).toEqual({ target: { kind: 'deposit', slotId: wanted.id } });
    // Le gisement choisi est libre et sans mise de l'entreprise : l'enchère y est vraiment possible.
    expect(view.siteSlots.find((s) => s.id === wanted.id)!.companyId ?? null).toBeNull();
  });

  it('aucune modale rendue depuis la carte classique ne contient une autre carte', () => {
    // La modale de déménagement à carte imbriquée a disparu du source (plus de MoveFactoryModal).
    const src = readFileSync(join(__dirname, '../src/screens/game/city/MapView.tsx'), 'utf8');
    expect(src).not.toContain('MoveFactoryModal');
    const srcSheets = readFileSync(join(__dirname, '../src/screens/game/city/MapSheets.tsx'), 'utf8');
    expect(srcSheets).not.toContain('MoveFactoryModal');
    // En rendu statique, aucune intention n'ouvre de boîte de dialogue (encore moins avec un .map-svg).
    const view = getPlayerView(game(0, 5, lang), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const intents: MapIntent[] = [
      { kind: 'launch', companyId: mine.id, sectorId: 'scooters' },
      { kind: 'move', productId: mine.products[0].id },
      { kind: 'deposit', companyId: mine.id, slotId: 'oil-1' },
    ];
    for (const intent of intents) {
      const html = renderMap(view, lang, intent);
      expect(html).not.toContain('role="dialog"');
    }
  });
});

describe.each(['fr', 'en'] as const)('La carte : l’entreprise qui agit (%s)', (lang) => {
  const t = messages(lang);
  const fmt = fmtFor(lang);

  it('la sélectionnée si elle est à moi, sinon la première à moi ; commutable quand il y en a plusieurs', () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const second: CompanyView = { ...mine, id: 'mine2', name: 'Ma Seconde', products: [], sites: [] };
    view.companies.push(second);
    // La sélectionnée (« Ma Seconde ») agit : étiquette, deux jetons, formulaire de lancement à son nom.
    const html = renderMap(view, lang, { kind: 'launch', companyId: second.id, sectorId: 'scooters' }, second);
    expect(html).toContain(escaped(t.city.map.actingCompany(second.name)));
    expect(html).toContain(escaped(t.launch.companyPays(second.name, fmt.money(second.cash))));
    const block = html.slice(html.indexOf('map-company-header'), html.indexOf('map-product-controls'));
    expect(block.match(/class="chip[ "]/g)).toHaveLength(2);
    expect(block).toContain('aria-pressed="true"');
    // La sélection n'est pas à moi (null) : la première entreprise dirigée agit.
    const fallback = renderMap(view, lang, { kind: 'launch', companyId: mine.id, sectorId: 'scooters' }, null);
    expect(fallback).toContain(escaped(t.city.map.actingCompany(mine.name)));
    expect(fallback).toContain(escaped(t.launch.companyPays(mine.name, fmt.money(mine.cash))));
    // Les jetons changent l'entreprise via onSelect (le parent ré-affiche avec la nouvelle).
    const src = readFileSync(join(__dirname, '../src/screens/game/city/MapView.tsx'), 'utf8');
    expect(src).toContain('onSelect(c.id)');
  });

  it('une seule entreprise à moi : pas d’étiquette ni de jetons', () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    const html = renderMap(view, lang, { kind: 'launch', companyId: mine.id, sectorId: 'scooters' });
    expect(html).toContain(escaped(t.city.map.actingCompany(mine.name)));
    expect(html).toContain(escaped(fmt.money(mine.cash)));
    expect(html).not.toContain('map-acting');
  });
});

describe.each(['fr', 'en'] as const)('La carte : la fiche de zone lance et déménage (%s)', (lang) => {
  const t = messages(lang);

  it('la section « Lancer ici » monte ZoneLaunchForm pour la zone, et le formulaire envoie launchProduct', async () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const acting = view.companies.find((c) => c.controllerId === 'human')!;
    setView(view, lang);
    const tree = ZoneSheet({ zoneId: 'mountain', view, factories: mapFactories(view), goTo: vi.fn(), onOpenFactory: vi.fn(), acting, launchSector: 'scooters' as SectorId, move: null, onMove: vi.fn(), onBackToZone: vi.fn() });
    const form = findElement(tree, (el) => el.type === ZoneLaunchForm);
    expect(form).toBeDefined();
    const formProps = form!.props as { company: CompanyView; zoneId: ZoneId; initialSector?: SectorId };
    expect(formProps.company.id).toBe(acting.id);
    expect(formProps).toMatchObject({ zoneId: 'mountain', initialSector: 'scooters' });
    // Soumission réelle du formulaire (l'état « nom » est forcé, motif launch-zones) : la zone part avec l'action.
    hooks.cursor = 0;
    hooks.overrides = { 1: 'Zing' };
    const rendered = ZoneLaunchForm(formProps) as ReactElement;
    rendered.props.onSubmit({ preventDefault: vi.fn() });
    await vi.waitFor(() =>
      expect(transport.emit).toHaveBeenCalledWith(
        'game:action',
        { action: { type: 'launchProduct', companyId: acting.id, sectorId: 'scooters', name: 'Zing', zoneId: 'mountain' }, turn: view.turn },
        expect.any(Function),
      ),
    );
  });

  it('« Déménager ici » montre ZoneMoveForm dans la fiche ; « Déménager » envoie moveFactory', async () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const company = view.companies.find((c) => c.controllerId === 'human')!;
    const product = company.products[0];
    setView(view, lang);
    const onBackToZone = vi.fn();
    const target: ZoneId = 'mountain'; // l'usine est à la capitale
    const tree = ZoneSheet({ zoneId: target, view, factories: mapFactories(view), goTo: vi.fn(), onOpenFactory: vi.fn(), acting: company, move: { company, product }, onMove: vi.fn(), onBackToZone });
    // Le lien de retour à la fiche de la zone.
    const back = buttonsIn(tree).find((b) => b.children === t.city.map.zoneSheet.backToZone);
    expect(back).toBeDefined();
    back!.onClick!();
    expect(onBackToZone).toHaveBeenCalledTimes(1);
    // ZoneMoveForm pour ce produit et cette zone ; onDone ramène aussi à la fiche.
    const moveEl = findElement(tree, (el) => el.type === ZoneMoveForm);
    expect(moveEl).toBeDefined();
    const moveProps = moveEl!.props as { company: CompanyView; product: ProductView; zoneId: ZoneId; onDone?: () => void };
    expect(moveProps.company.id).toBe(company.id);
    expect(moveProps.product.id).toBe(product.id);
    expect(moveProps.zoneId).toBe(target);
    expect(moveProps.onDone).toBe(onBackToZone);
    // Le pied « Rester » / « Déménager » : rester revient à la fiche, déménager envoie l'action puis revient.
    hooks.cursor = 0;
    const footer = buttonsIn(ZoneMoveForm(moveProps));
    // Le coût figure dans le résumé ; le bouton de soumission conserve seulement le nom de l'action.
    const stayPrefix = t.movePicker.ctaStay('');
    const stay = footer.find((b) => typeof b.children === 'string' && b.children.startsWith(stayPrefix));
    const move = footer.find((b) => b.children === t.product.move);
    expect(stay).toBeDefined();
    expect(move).toBeDefined();
    stay!.onClick!();
    expect(onBackToZone).toHaveBeenCalledTimes(2);
    move!.onClick!();
    await vi.waitFor(() =>
      expect(transport.emit).toHaveBeenCalledWith(
        'game:action',
        { action: { type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: target }, turn: view.turn },
        expect.any(Function),
      ),
    );
    await vi.waitFor(() => expect(onBackToZone).toHaveBeenCalledTimes(3));
  });
});

describe.each(['fr', 'en'] as const)('La carte : la fiche de gisement décide (%s)', (lang) => {
  const t = messages(lang);

  /** La chaîne réelle DepositSheet → DepositPanel → DepositFooter → SiteBidFooter pour un gisement libre. */
  function bidFooterOf(view: PlayerView, acting: CompanyView, slotId: string): ReactElement {
    const deposit = mapDeposits(view).find((d) => d.slotId === slotId)!;
    const tree = DepositSheet({ deposit, view, acting });
    const panel = findElement(tree, (el) => el.type === DepositPanel);
    expect(panel).toBeDefined();
    hooks.cursor = 0;
    const panelTree = DepositPanel(panel!.props as { company: CompanyView; slot: SiteSlotView });
    const footerEl = findElement(panelTree, (el) => el.type === DepositFooter);
    expect(footerEl).toBeDefined();
    const footerTree = DepositFooter(footerEl!.props as Parameters<typeof DepositFooter>[0]);
    const bidEl = findElement(footerTree, (el) => el.type === SiteBidFooter);
    expect(bidEl).toBeDefined();
    hooks.cursor = 0;
    return SiteBidFooter(bidEl!.props as Parameters<typeof SiteBidFooter>[0]) as ReactElement;
  }

  it('la fiche monte DepositPanel pour l’entreprise qui agit, et l’enchère envoie bidSite', async () => {
    const view = getPlayerView(game(0, 5, lang), 'human');
    const acting = view.companies.find((c) => c.controllerId === 'human')!;
    setView(view, lang);
    expect(view.siteSlots.find((s) => s.id === 'oil-1')!.companyId ?? null).toBeNull();
    const bidTree = bidFooterOf(view, acting, 'oil-1');
    const amount = findElement(bidTree, (el) => el.type === AmountForm);
    expect(amount).toBeDefined();
    await (amount!.props as { onSubmit: (n: number) => Promise<{ ok: boolean }> }).onSubmit(6000);
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'bidSite', companyId: acting.id, slotId: 'oil-1', amount: 6000 }, turn: view.turn },
      expect.any(Function),
    );
  });

  it('le retrait d’une mise en attente envoie cancelSiteBid', async () => {
    const view = structuredClone(getPlayerView(game(0, 5, lang), 'human'));
    const acting = view.companies.find((c) => c.controllerId === 'human')!;
    view.self!.siteBids = [{ companyId: acting.id, playerId: 'human', commodityId: 'oil', slotId: 'oil-1', amount: 6000, turn: view.turn }];
    setView(view, lang);
    const bidTree = bidFooterOf(view, acting, 'oil-1');
    const withdraw = buttonsIn(bidTree).find((b) => b.children === t.sites.withdraw);
    expect(withdraw).toBeDefined();
    withdraw!.onClick!();
    await vi.waitFor(() =>
      expect(transport.emit).toHaveBeenCalledWith(
        'game:action',
        { action: { type: 'cancelSiteBid', companyId: acting.id, commodityId: 'oil' }, turn: view.turn },
        expect.any(Function),
      ),
    );
  });

  it('la mise en sommeil d’une filiale envoie setSiteDormant', async () => {
    const { g } = siteGame(lang);
    const view = getPlayerView(g, 'human');
    const acting = view.companies.find((c) => c.controllerId === 'human')!;
    setView(view, lang);
    const deposit = mapDeposits(view).find((d) => d.slotId === 'sugar-2')!;
    const tree = DepositSheet({ deposit, view, acting });
    const panel = findElement(tree, (el) => el.type === DepositPanel);
    expect(panel).toBeDefined();
    hooks.cursor = 0;
    const panelTree = DepositPanel(panel!.props as { company: CompanyView; slot: SiteSlotView });
    const sheetEl = findElement(panelTree, (el) => el.type === SiteSheet);
    expect(sheetEl).toBeDefined();
    // État « confirmation de sommeil » forcé (0 = le useState du confirm de SiteSheet).
    hooks.cursor = 0;
    hooks.overrides = { 0: 'sleep' };
    const sheetTree = SiteSheet(sheetEl!.props as Parameters<typeof SiteSheet>[0]);
    const confirm = findElement(sheetTree, (el) => el.type === ConfirmModal);
    expect(confirm).toBeDefined();
    (confirm!.props as { onConfirm: () => void }).onConfirm();
    await vi.waitFor(() =>
      expect(transport.emit).toHaveBeenCalledWith(
        'game:action',
        { action: { type: 'setSiteDormant', companyId: acting.id, commodityId: 'sugar', dormant: true }, turn: view.turn },
        expect.any(Function),
      ),
    );
  });
});
