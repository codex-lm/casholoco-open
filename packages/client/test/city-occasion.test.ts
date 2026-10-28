import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMMODITIES,
  PLAYER_COLORS,
  SECTORS,
  createGame,
  getContent,
  getPlayerView,
  hexPlaceLabel,
  resolveTurn,
  type CommodityId,
  type GameState,
  type HexBid,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { mapWorkspaceMessages } from '../src/i18n/mapWorkspace';
import { mapFlowText } from '../src/i18n/mapFlows';
import { frenchSpacing } from '../src/util';
import { hasFreeSlot, openingLaunchTarget, openingSign } from '../src/screens/game/city/model';
import { OpeningChip } from '../src/screens/game/city/OpeningChip';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
afterEach(() => setState(initial));
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

/** Partie hexagonale réelle ; toutes les paires (secteur, case) passent à « non rentable » pour ne garder que celles du scénario. */
function hexView(): PlayerView {
  const g = createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr', mapMode: 'hex', terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: PLAYER_COLORS[0] },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: PLAYER_COLORS[1] },
  ]);
  const view = getPlayerView(g, 'human');
  for (const s of view.sectors) for (const e of Object.values(s.launchByHex ?? {})) e.paybackQuarters = null;
  return view;
}

/** Pose une paire (secteur, case) sur la vue. */
function pair(view: PlayerView, sectorId: SectorId, hexId: string, payback: number | null, profit: number) {
  const s = view.sectors.find((x) => x.id === sectorId)!;
  s.launchByHex![hexId] = { unitCost: 10, quarterlyProfit: profit, paybackQuarters: payback, demand: 100 };
}

/** Mise en attente (sans résultat) de mon entreprise sur une case : la paire qui la vise doit être ignorée. */
function liveBid(view: PlayerView, hexId: string, kind: HexBid['kind']): void {
  const mine = view.companies.find((c) => c.private && c.controllerId === view.you)!;
  (view.self!.hexBids ??= []).push({ kind, companyId: mine.id, playerId: view.you, hexId, amount: 100, turn: view.turn });
}

/** Partie classique : un humain et 7 bots, quelques trimestres joués (comme city.test.ts). */
function classicGame(turns = 4, seed = 5): GameState {
  const bots = getContent('fr').bots.slice(0, 7);
  const players: LobbyPlayer[] = [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: PLAYER_COLORS[0] },
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
  const g = createGame({ seed, totalTurns: 16, turnSeconds: 90, startYear: 2027, lang: 'fr' }, players);
  for (let t = 0; t < turns; t++) resolveTurn(g);
  return g;
}

describe('La piste du plateau (règle partagée avec le panneau « Occasion » de la carte classique)', () => {
  it('la paire (secteur, case) la plus rapide l’emporte sur l’estimation par défaut d’un autre secteur', () => {
    const view = hexView();
    const [a, b] = view.sectors;
    const hex = view.hexes!.free[0];
    // L'ancienne règle (min sur launchEstimate) choisirait le secteur A…
    a.launchEstimate = { quarterlyProfit: 1e9, paybackQuarters: 1 };
    // …mais toutes ses cases sont lentes (non rentables ici) et la paire la plus rapide est (B, hex).
    pair(view, b.id, hex, 2, 500);
    expect(openingSign(view)).toEqual({ kind: 'launch', sectorId: b.id, hexId: hex, payback: 2, profit: 500 });
  });

  it('à rentabilisation égale, le bénéfice trimestriel le plus haut gagne', () => {
    const view = hexView();
    const [a, b] = view.sectors;
    const [h0, h1] = view.hexes!.free;
    pair(view, a.id, h0, 3, 100);
    pair(view, b.id, h1, 3, 200);
    expect(openingSign(view)).toEqual({ kind: 'launch', sectorId: b.id, hexId: h1, payback: 3, profit: 200 });
  });

  it('à rentabilisation et bénéfice égaux, la case la plus tôt sur le plateau gagne, même dans un secteur plus tardif', () => {
    const view = hexView();
    const [a, b] = view.sectors; // a : secteur le plus tôt
    const [h0, h1] = view.hexes!.free; // h0 : case la plus tôt
    pair(view, a.id, h1, 3, 100);
    pair(view, b.id, h0, 3, 100);
    expect(openingSign(view)).toEqual({ kind: 'launch', sectorId: b.id, hexId: h0, payback: 3, profit: 100 });
  });

  it('à tout égal sur la même case, le secteur le plus tôt gagne', () => {
    const view = hexView();
    const [a, b] = view.sectors;
    const h0 = view.hexes!.free[0];
    pair(view, b.id, h0, 3, 100);
    pair(view, a.id, h0, 3, 100);
    expect(openingSign(view)).toEqual({ kind: 'launch', sectorId: a.id, hexId: h0, payback: 3, profit: 100 });
  });

  it('ignore les paires au-delà des trimestres restants (et celles non rentables)', () => {
    const view = hexView();
    const left = Math.max(0, view.config.totalTurns - view.turn + 1);
    const [a, b] = view.sectors;
    const [h0, h1, h2] = view.hexes!.free;
    pair(view, a.id, h0, left + 1, 1e9); // trop tard pour être remboursé
    pair(view, a.id, h1, null, 1e9); // jamais rentable
    pair(view, b.id, h2, 4, 500);
    expect(openingSign(view)).toEqual({ kind: 'launch', sectorId: b.id, hexId: h2, payback: 4, profit: 500 });
  });

  it.each([
    ['lancement', 'launch'],
    ['déménagement', 'move'],
  ] as const)('une mise de %s en attente sur la meilleure case fait passer à la paire suivante', (_, kind) => {
    const view = hexView();
    const [a, b] = view.sectors;
    const [h0, h1] = view.hexes!.free;
    pair(view, a.id, h0, 2, 500); // la meilleure paire, mais…
    pair(view, b.id, h1, 3, 100);
    liveBid(view, h0, kind); // …j'ai déjà une mise en attente sur sa case
    expect(openingSign(view)).toEqual({ kind: 'launch', sectorId: b.id, hexId: h1, payback: 3, profit: 100 });
  });

  it('mode classique : pas de case, même gagnant que l’ancienne règle', () => {
    const view = getPlayerView(classicGame(), 'human');
    expect(view.config.mapMode).not.toBe('hex');
    expect(hasFreeSlot(view)).toBe(true);
    // Un seul secteur rentable, posé explicitement : l'éligibilité ne dépend pas du hasard de la partie.
    for (const s of view.sectors) if (s.launchEstimate) s.launchEstimate.paybackQuarters = null;
    const sector = view.sectors[0];
    sector.launchEstimate = { quarterlyProfit: 500, paybackQuarters: 2 };
    const opening = openingSign(view);
    expect(opening).toEqual({ kind: 'launch', sectorId: sector.id, payback: 2, profit: 500 });
    expect(opening.kind === 'launch' && opening.hexId).toBeUndefined();
  });
});

/** Boutons d'un arbre rendu par appel direct du composant (hooks de langue sans état). */
function buttons(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(node.type === 'button' ? [node] : []), ...buttons(node.props.children as ReactNode)];
}

function chip(view: PlayerView, lang: Lang, onShowLaunch = vi.fn(), onCommodities = vi.fn()) {
  setState({ lang, view, lobby: null });
  const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(OpeningChip, { view, onShowLaunch, onCommodities }) }));
  return { html, node: OpeningChip({ view, onShowLaunch, onCommodities }), onShowLaunch, onCommodities };
}

describe.each(['fr', 'en'] as const)('Plateau : la piste de la barre d’outils remplace le panneau « Occasion » (%s)', (lang: Lang) => {
  it('nomme le secteur, la case conseillée et le remboursement ; « Voir » sélectionne cette case pour ce secteur', () => {
    const view = hexView();
    const sector = view.sectors[1];
    const hex = view.hexes!.free[0];
    pair(view, sector.id, hex, 2, 500);
    const opening = openingSign(view);
    expect(opening).toEqual({ kind: 'launch', sectorId: sector.id, hexId: hex, payback: 2, profit: 500 });
    if (opening.kind === 'launch') expect(openingLaunchTarget(opening)).toEqual({ kind: 'launch', sectorId: sector.id, hexId: hex });
    const { html, node, onShowLaunch, onCommodities } = chip(view, lang);
    // Le lieu dans la langue du salon, le secteur dans celle de l'interface.
    const place = hexPlaceLabel(hex, view.config.lang, view.siteSlots);
    const text = mapWorkspaceMessages(lang);
    const lead = text.openingLaunch(frenchSpacing(getContent(lang).sectors[sector.id].name), place);
    const payback = text.openingPayback(2);
    // The payback is its own text, outside the part an ellipsis may cut.
    expect(html).toContain(`<span class="map-opening-text">${escaped(lead)}</span><span class="map-opening-payback">· ${escaped(payback)}</span>`);
    // Cut or not, the whole sentence stays in the tooltip, before the « observation, not advice » disclaimer.
    expect(html).toContain(`title="${escaped(`${lead} · ${payback}\n${messages(lang).city.signs.observation}`)}"`);
    expect(html).toContain('data-opening="launch"');
    expect(html).not.toContain(escaped('undefined'));
    const [show] = buttons(node);
    expect(show.props.children).toBe(text.openingShow);
    expect(show.props['aria-label']).toBe(text.openingShowAria(place));
    (show.props.onClick as () => void)();
    expect(onShowLaunch).toHaveBeenCalledExactlyOnceWith(sector.id, hex);
    expect(onCommodities).not.toHaveBeenCalled();
  });

  it('sans lancement rentable : une matière utilisée à 85 % ou moins de son prix de base, et le bouton des Matières', () => {
    const view = hexView();
    const input = Object.keys(SECTORS.gadgets.inputs)[0] as CommodityId;
    const commodity = view.commodities.find((c) => c.id === input)!;
    commodity.price = COMMODITIES[input].basePrice * 0.5;
    expect(openingSign(view)).toEqual({ kind: 'commodity', commodityId: input, ratio: 0.5 });
    const { html, node, onShowLaunch, onCommodities } = chip(view, lang);
    const sentence = mapWorkspaceMessages(lang).openingCommodity(getContent(lang).commodities[input].name, fmtFor(view.config.lang).pct(0.5, 0));
    expect(html).toContain(`<span class="map-opening-text">${escaped(sentence)}</span>`);
    expect(html).toContain(`title="${escaped(`${sentence}\n${messages(lang).city.signs.observation}`)}"`);
    expect(html).toContain('data-opening="commodity"');
    const [materials] = buttons(node);
    expect(materials.props.children).toBe(mapFlowText(lang).materials);
    (materials.props.onClick as () => void)();
    expect(onCommodities).toHaveBeenCalledOnce();
    expect(onShowLaunch).not.toHaveBeenCalled();
  });

  it('rien du tout quand il n’y a ni lancement rentable ni matière en soldes', () => {
    const view = hexView();
    expect(openingSign(view)).toEqual({ kind: 'none' });
    expect(chip(view, lang).html).toBe('');
  });
});
