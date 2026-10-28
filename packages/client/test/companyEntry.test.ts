/**
 * « Mon entreprise » n'embarque plus aucune carte : les décisions géographiques (lancement,
 * déménagement, gisement) partent vers l'onglet « La carte » avec une intention (openMapFor).
 * Le harnais est SSR (ni jsdom ni testing-library dans le dépôt) : les onClick sont capturés en
 * moquant le runtime JSX, puis invoqués à la main.
 */
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMMODITIES,
  PLAYER_COLORS,
  SITE_OPENING_COST_MULT,
  applyAction,
  createGame,
  getPlayerView,
  resolveTurn,
  type Action,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { CompanyTab } from '../src/screens/game/CompanyTab';
import type { MapIntent } from '../src/screens/game/mapIntent';
import type { TabId } from '../src/screens/GameScreen';
import { getState, setState, type AppState } from '../src/store';

/** Boutons capturés pendant le rendu SSR : on invoque leur onClick à la main. */
const clicks = vi.hoisted(() => ({ els: [] as Record<string, unknown>[] }));

vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-dev-runtime')>();
  return {
    ...actual,
    jsxDEV: (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (props && typeof props.onClick === 'function') clicks.els.push(props);
      return (actual.jsxDEV as (...a: unknown[]) => unknown)(type, props, ...rest);
    },
  };
});

vi.mock('react/jsx-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-runtime')>();
  const wrap =
    <F extends (...args: never[]) => unknown>(fn: F) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (props && typeof props.onClick === 'function') clicks.els.push(props);
      return (fn as (...a: unknown[]) => unknown)(type, props, ...rest);
    };
  return { ...actual, jsx: wrap(actual.jsx), jsxs: wrap(actual.jsxs) };
});

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

function ok(g: GameState, who: string, a: Action): void {
  const r = applyAction(g, who, a);
  expect(r.ok, r.message).toBe(true);
}

/**
 * Partie classique : mon entreprise remporte une raffinerie de sucre (en service après deux
 * clôtures) et a une mise en attente sur un puits de pétrole.
 */
function sitesGame(lang: Lang) {
  const g = createGame({ seed: 11, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang }, [
    seat('human', 'Ada', 'Atelier Ada', 'gadgets', 0),
    seat('rival', 'Bob', 'Bob Corp', 'yogurts', 1),
  ]);
  const mine = Object.values(g.companies).find((c) => c.controllerId === 'human')!;
  mine.cash = 1e6;
  ok(g, 'human', { type: 'bidSite', companyId: mine.id, slotId: 'sugar-2', amount: COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT });
  resolveTurn(g);
  resolveTurn(g);
  ok(g, 'human', { type: 'bidSite', companyId: mine.id, slotId: 'oil-1', amount: COMMODITIES.oil.basePrice * SITE_OPENING_COST_MULT });
  return { g, companyId: mine.id };
}

function hexGame(lang: Lang) {
  const g = createGame({ seed: 11, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode: 'hex', terrainAssignment: 'fair' }, [
    seat('human', 'Ada', 'Atelier Ada', 'gadgets', 0),
    seat('rival', 'Bob', 'Bob Corp', 'yogurts', 1),
  ]);
  return { g, companyId: Object.values(g.companies).find((c) => c.controllerId === 'human')!.id };
}

function renderTab(view: PlayerView, lang: Lang, openMapFor: (intent: MapIntent) => void, goTo: (tab: TabId) => void = () => {}): string {
  setState({ lang, view, lobby: null });
  const company = view.companies.find((c) => c.controllerId === view.you && c.status === 'active') ?? null;
  clicks.els.length = 0;
  return renderToStaticMarkup(
    createElement(GameProvider, {
      view,
      children: createElement(CompanyTab, { company, onSelect: () => {}, goTo, openIssue: () => {}, openMapFor }),
    }),
  );
}

/** Invoque le onClick de chaque bouton portant exactement ce libellé ; retourne les intentions reçues. */
function clickAll(label: string, spy: ReturnType<typeof vi.fn>): void {
  const found = clicks.els.filter((p) => p.children === label);
  expect(found.length, `bouton « ${label} »`).toBeGreaterThan(0);
  for (const el of found) (el.onClick as () => void)();
  expect(spy).toHaveBeenCalled();
}

describe.each(['fr', 'en'] as const)('« Mon entreprise » : entrées vers la carte (%s)', (lang) => {
  it('sans filiale ni mise en attente : pas de section « Filiales », « Miser sur un gisement » reste dans les matières', () => {
    const { g } = hexGame(lang); // partie fraîche, sans enchère de gisement
    const view = getPlayerView(g, 'human');
    const company = view.companies.find((c) => c.controllerId === view.you)!;
    expect(company.sites ?? []).toHaveLength(0);
    expect((view.self?.siteBids ?? []).filter((b) => b.companyId === company.id && !b.result)).toHaveLength(0);
    const t = messages(lang);
    const sitesHeading = `<h3>${escaped(t.sites.title)}</h3>`;
    const html = renderTab(view, lang, vi.fn());
    expect(html).not.toContain(sitesHeading);
    const materials = html.slice(html.indexOf('company-materials'));
    expect(materials).toContain(`>${escaped(t.company.bidOnDeposit)}</button>`);
    // Avec une filiale en service et une mise en attente : la section revient, en liste compacte.
    const { g: played } = sitesGame(lang);
    const later = renderTab(getPlayerView(played, 'human'), lang, vi.fn());
    expect(later).toContain(sitesHeading);
  });

  it('ne rend aucune carte et envoie chaque décision géographique avec la bonne intention', () => {
    const { g, companyId } = sitesGame(lang);
    const view = getPlayerView(g, 'human');
    const company = view.companies.find((c) => c.id === companyId)!;
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const openMapFor = vi.fn();
    const html = renderTab(view, lang, openMapFor);

    // Aucune carte dans l'onglet : ni la carte classique, ni un sélecteur MapPicker, ni le plateau hexagonal.
    expect(html).not.toContain('map-svg');
    expect(html).not.toContain('pk-mapscene');
    expect(html).not.toContain('pk-chips');
    expect(html).not.toContain('hx-board');
    // Plus de formulaire de lancement en ligne non plus.
    expect(html).not.toContain('class="launch"');

    // Filiale en service (deux clôtures après l'adjudication) : nom du gisement, état, bouton carte.
    const site = company.sites!.find((s) => s.id === 'sugar-2')!;
    expect(site.activeFrom).toBeLessThanOrEqual(view.turn);
    expect(html).toContain(escaped(site.name));
    expect(html).toContain(escaped(t.sites.active));
    // Mise en attente : son montant et son gisement.
    const oil = view.siteSlots.find((s) => s.id === 'oil-1')!;
    expect(html).toContain(escaped(t.sites.pending(fmt.money(COMMODITIES.oil.basePrice * SITE_OPENING_COST_MULT), oil.name)));
    // Les règles des enchères sont dans le mode d'emploi, plus dans un encart replié de la section.
    const sites = html.slice(html.indexOf(`<h3>${escaped(t.sites.title)}</h3>`));
    expect(sites.slice(0, sites.indexOf('</section>'))).not.toContain('<details');

    // « + Lancer un produit (choisir l'emplacement sur la carte) », dans le titre des produits : intention de lancement.
    clickAll(t.company.launchOnMap, openMapFor);
    expect(openMapFor).toHaveBeenLastCalledWith({ kind: 'launch', companyId });

    // « Voir sur la carte » : une ligne par filiale et par mise, chacune avec son gisement.
    openMapFor.mockClear();
    clickAll(t.company.showOnMap, openMapFor);
    const intents = openMapFor.mock.calls.map(([intent]) => intent);
    expect(intents).toContainEqual({ kind: 'deposit', companyId, slotId: 'sugar-2' });
    expect(intents).toContainEqual({ kind: 'deposit', companyId, slotId: 'oil-1' });

    // « Miser sur un gisement… » (bloc des matières) : intention de gisement sans emplacement précis.
    openMapFor.mockClear();
    clickAll(t.company.bidOnDeposit, openMapFor);
    expect(openMapFor).toHaveBeenCalledWith({ kind: 'deposit', companyId });
    expect(openMapFor.mock.calls[0][0]).not.toHaveProperty('slotId');

    // « Déménager » d'une fiche produit : intention de déménagement avec le produit.
    openMapFor.mockClear();
    clickAll(t.product.move, openMapFor);
    expect(openMapFor).toHaveBeenCalledWith({ kind: 'move', productId: company.products[0].id });
  });
});

describe.each(['fr', 'en'] as const)('« Mon entreprise » en mode hexagonal (%s)', (lang) => {
  it('ne rend pas le plateau et propose le lancement sur la carte', () => {
    const { g, companyId } = hexGame(lang);
    const view = getPlayerView(g, 'human');
    const t = messages(lang);
    const openMapFor = vi.fn();
    const html = renderTab(view, lang, openMapFor);
    expect(view.config.mapMode).toBe('hex');
    expect(html).not.toContain('hx-board');
    expect(html).not.toContain('map-svg');
    expect(html).not.toContain('pk-mapscene');
    clickAll(t.company.launchOnMap, openMapFor);
    expect(openMapFor).toHaveBeenCalledWith({ kind: 'launch', companyId });
    // « Détail dans Matières » : l'onglet des matières.
    const goTo = vi.fn();
    renderTab(view, lang, vi.fn(), goTo);
    clickAll(t.materials.detail(t.game.tabs.commodities.replace(/^\S+\s/, '')), goTo);
    expect(goTo).toHaveBeenCalledWith('commodities');
  });
});
