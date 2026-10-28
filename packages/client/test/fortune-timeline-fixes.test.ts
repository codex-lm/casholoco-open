/**
 * Correctifs de la revue « Fortunes et infortunes » (Classement) : légende de la zone future
 * conditionnée à sa largeur, « Dernier trimestre » sur la ligne d'aide au dernier tour,
 * « Maintenant » qui bascule à gauche de la règle, badges dépliés au téléphone, zones de clic
 * de la frise, et ligne de faits clés sous l'en-tête du détail au téléphone.
 * Rendu SSR uniquement (renderToStaticMarkup) : les gestionnaires d'événements ne sont pas
 * testables ici, on vérifie les invariants structurels.
 */
import { createElement, Fragment, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_COLORS,
  createGame,
  getPlayerView,
  resolveTurn,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { FortuneTimeline } from '../src/screens/game/timeline/FortuneTimeline';
import { DEFAULT_FAMILIES, pinsFor, type TimelineEntry } from '../src/screens/game/timeline/model';
import { worthAt } from '../src/screens/game/timeline/QuarterDetail';
import { getState, setState, type AppState } from '../src/store';

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => {
  setState(initialState);
  vi.unstubAllGlobals();
});

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

/** Partie à trois joueurs, `resolves` trimestres résolus (turn = resolves + 1, phase « playing »). */
function gameAt(lang: Lang, totalTurns: number, resolves: number): GameState {
  const g = createGame({ seed: 11, totalTurns, turnSeconds: 90, startYear: 2027, lang }, [
    seat('ada', 'Ada', 'Atelier Ada', 'gadgets', 0),
    seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
    seat('cleo', 'Cleo', 'Cleo SA', 'energy_drinks', 2),
  ]);
  for (let k = 0; k < resolves; k++) resolveTurn(g);
  expect(g.turn).toBe(resolves + 1);
  expect(g.phase).toBe('playing');
  return g;
}

function render<P extends object>(view: PlayerView, uiLang: Lang, node: FunctionComponent<P>, props: P): string {
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(node, props) }));
}

/** Sans window ni matchMedia, useMediaQuery renvoie vrai : mise en page « ordinateur » de 600 px. */
function renderTimeline(view: PlayerView, uiLang: Lang): string {
  return render(view, uiLang, FortuneTimeline, { selectedTurn: null, onSelectTurn: () => {} });
}

/** Force la mise en page « téléphone » : la requête « min-width: 701px » ne correspond pas. */
function stubPhone(): void {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
}

describe('légende de la zone future : affichée seulement si elle tient (défauts 2/13)', () => {
  it('zone large : le compte à rebours est rendu', () => {
    // 600 px SSR, 16 colonnes : turn 2 → zone future ≈ 460 px, le texte (≈ 340 px) y tient.
    const view = getPlayerView(gameAt('fr', 16, 1), 'ada');
    const ui = messages('fr');
    const html = renderTimeline(view, 'fr');
    const caption = html.match(/<text class="rc-future"[^>]*>([\s\S]*?)<\/text>/);
    expect(caption).not.toBeNull();
    expect(caption![1]).toBe(escaped(ui.history.future(view.config.totalTurns - view.turn)));
  });

  it('zone étroite : pas de légende, donc ni débordement ni chevauchement', () => {
    // turn 15/16 → une colonne future de ≈ 33 px : le texte ne peut pas y tenir.
    const view = getPlayerView(gameAt('fr', 16, 14), 'ada');
    const html = renderTimeline(view, 'fr');
    expect(html).not.toContain('rc-future');
    expect(html).not.toContain(escaped(messages('fr').history.future(1)));
  });
});

describe('« Dernier trimestre : remplissez vos poches. » (défauts 3/11/16)', () => {
  const lastQuarter = messages('fr').history.lastQuarter;

  it('au dernier tour, la phrase termine la ligne d’aide, en italiques', () => {
    const view = getPlayerView(gameAt('fr', 8, 7), 'ada'); // turn 8 = totalTurns, encore « playing »
    const html = renderTimeline(view, 'fr');
    expect(html).toContain(`<em class="rc-last">${escaped(lastQuarter)}</em>`);
    expect(html).toContain(escaped(messages('fr').ranking.help));
  });

  it('en cours de partie, la phrase n’apparaît nulle part', () => {
    const view = getPlayerView(gameAt('fr', 12, 3), 'ada'); // turn 4/12
    const html = renderTimeline(view, 'fr');
    expect(html).not.toContain(escaped(lastQuarter));
    expect(html).not.toContain('rc-last');
  });

  it('la zone hachurée n’utilise plus la phrase, même à un trimestre de la fin', () => {
    const view = getPlayerView(gameAt('fr', 16, 1), 'ada'); // légende hachurée rendue (zone large)
    const html = renderTimeline(view, 'fr');
    const caption = html.match(/<text class="rc-future"[^>]*>([\s\S]*?)<\/text>/);
    expect(caption).not.toBeNull();
    expect(caption![1]).not.toContain(escaped(lastQuarter));
    expect(html).not.toContain(escaped(lastQuarter));
  });
});

describe('« Maintenant » bascule à gauche de la règle quand la zone est étroite (défauts 4/14)', () => {
  it('zone < 80 px : étiquette à gauche (text-anchor="end")', () => {
    const view = getPlayerView(gameAt('fr', 16, 14), 'ada'); // zone ≈ 33 px
    const html = renderTimeline(view, 'fr');
    expect(html).toMatch(/<text class="rc-now" x="[\d.]+" y="14" text-anchor="end">/);
  });

  it('zone large : étiquette à droite (text-anchor="start")', () => {
    const view = getPlayerView(gameAt('fr', 16, 1), 'ada'); // zone ≈ 460 px
    const html = renderTimeline(view, 'fr');
    expect(html).toMatch(/<text class="rc-now" x="[\d.]+" y="14" text-anchor="start">/);
  });
});

describe('badges dépliés au téléphone (défauts 5/10, niveau modèle)', () => {
  /** Deux coups de poids 3 au même trimestre, sur deux courbes différentes, sans lien avec le lecteur. */
  const entries: TimelineEntry[] = (
    [
      { type: 'takeover', actorId: 'bob', subjectId: 'erin' },
      { type: 'bankruptcy', subjectId: 'erin' },
    ] as const
  ).map((event, k) => ({
    turn: 2,
    quarter: 2,
    dateLabel: 'T2 2027',
    article: { id: `a${k}`, title: 'titre', body: '', tone: 'neutral', kind: 'flash' },
    event,
    weight: 3,
    role: null,
    players: [event.actorId ?? '', event.subjectId ?? ''].filter(Boolean),
    lead: event.actorId ?? event.subjectId ?? null,
  }));

  it('une colonne de 18 px plafonne à 1 badge, une de 60 px montre les 2', () => {
    const filter = { families: DEFAULT_FAMILIES, mineOnly: false };
    const narrow = pinsFor(entries, filter, 'ada', 18).pins.filter((p) => p.quarter === 2);
    const wide = pinsFor(entries, filter, 'ada', 60).pins.filter((p) => p.quarter === 2);
    expect(narrow.length).toBe(1);
    expect(wide.length).toBe(2);
    expect(new Set(wide.map((p) => p.player))).toEqual(new Set(['bob', 'erin']));
  });
});

describe('frise : chaque colonne passée garde sa zone de clic (défaut 12, invariant SSR)', () => {
  it('un rectangle de capture transparent et cliquable par colonne jouée, aucun dans le futur', () => {
    // Les gestionnaires onClick/onPointer* sont perdus par renderToStaticMarkup : on vérifie la
    // structure (un rectangle par colonne non future, curseur « pointer », aria inchangés).
    const view = getPlayerView(gameAt('fr', 12, 3), 'ada'); // turn 4/12
    const html = renderTimeline(view, 'fr');
    expect(html.match(/fill="transparent" pointer-events="all" style="cursor:pointer"/g)?.length).toBe(view.turn);
    expect(html).toContain(`role="slider" tabindex="0" aria-label="${escaped(messages('fr').history.stripAria)}"`);
    expect(html).toContain(`aria-valuenow="${view.turn}"`);
  });
});

describe('ligne de faits clés au téléphone (nouveauté)', () => {
  /** Reconstitue la ligne attendue depuis la vue, avec les mêmes aides de formatage que l'écran. */
  function expectedFacts(view: PlayerView, uiLang: Lang): string {
    const ui = messages(uiLang);
    const fmt = fmtFor(view.config.lang);
    const me = view.players.find((p) => p.id === view.you)!;
    const mine = worthAt(me, view.turn, view)!;
    const before = worthAt(me, view.turn - 1, view);
    const change = before !== undefined && before !== 0 ? fmt.signedPct(mine / before - 1, 0) : null;
    const board = view.players
      .map((p) => ({ p, v: worthAt(p, view.turn, view) }))
      .filter((r): r is { p: (typeof me); v: number } => r.v !== undefined)
      .sort((a, b) => b.v - a.v);
    const rank = board.findIndex((r) => r.p.id === view.you) + 1;
    const leader = board[0].p;
    return ui.history.keyFacts(
      fmt.money(mine),
      change,
      rank,
      board.length,
      leader.id === view.you ? ui.common.youSuffix(leader.name) : leader.name,
    );
  }

  it('fr : « Vous : … (±x %), ne sur N · En tête : … » sous l’en-tête du détail', () => {
    stubPhone();
    const view = getPlayerView(gameAt('fr', 12, 3), 'ada');
    const html = renderTimeline(view, 'fr');
    const line = html.match(/<p class="small muted rc-facts">([\s\S]*?)<\/p>/);
    expect(line).not.toBeNull();
    expect(line![1]).toBe(escaped(expectedFacts(view, 'fr')));
    expect(line![1]).toContain('Vous : ');
    expect(line![1]).toContain(' · En tête : ');
    // La ligne est juste après l’en-tête du détail (qui porte le titre du trimestre).
    const head = html.indexOf('rc-detail-head');
    expect(head).toBeGreaterThan(-1);
    expect(html.indexOf('rc-facts')).toBeGreaterThan(head);
  });

  it('en : texte adapté, dollars, sans accents ni guillemets français', () => {
    stubPhone();
    const view = getPlayerView(gameAt('en', 12, 3), 'ada');
    const html = renderTimeline(view, 'en');
    const line = html.match(/<p class="small muted rc-facts">([\s\S]*?)<\/p>/);
    expect(line).not.toBeNull();
    expect(line![1]).toBe(escaped(expectedFacts(view, 'en')));
    expect(line![1]).toContain('You: ');
    expect(line![1]).toContain(' · Leader: ');
    expect(line![1]).not.toMatch(/[€«»àâäçéèêëîïôöùûü]/);
  });

  it('ordinateur : pas de ligne de faits clés', () => {
    const view = getPlayerView(gameAt('fr', 12, 3), 'ada');
    const html = renderTimeline(view, 'fr');
    expect(html).not.toContain('rc-facts');
  });
});
