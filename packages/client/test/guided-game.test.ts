import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, resolveTurn } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { TutorialChecklist } from '../src/screens/game/TutorialChecklist';
import { learningMessages } from '../src/i18n/learning';
import { messages } from '../src/i18n';
import { HelpModal } from '../src/screens/game/HelpModal';
import { getState, setState, type AppState } from '../src/store';
import { markTabVisit, markTutorial, showTutorialAgain } from '../src/tutorialStore';
import {
  EMPTY_TUTORIAL, captureTutorialForecasts, dismissTutorial, isTutorialVisible, markSeen,
  parseTutorial, reopenTutorial, shouldCelebrate, startGuidedTutorial, tabVisitMarks, tutorialComparisons, tutorialSteps, withCompletion,
} from '../src/tutorial';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
const room = 'ABCD';
afterEach(() => { setState(initial); vi.unstubAllGlobals(); });
function fixture() {
  return createGame({ seed: 34, totalTurns: 8, turnSeconds: 0, startYear: 2027, mapMode: 'classic' }, [
    { id: 'me', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'yogurts', connected: true, color: '#112233' },
    { id: 'bot', name: 'Intern', isBot: true, botLevel: 'intern', companyName: 'Beta', sectorId: 'gadgets', connected: true, color: '#332211' },
  ]);
}

describe('parcours guidé de deux trimestres', () => {
  it('continue en T2 sans réutiliser les décisions ou visites de Bourse faites à T1', () => {
    const game = fixture();
    let state = startGuidedTutorial(room);
    for (const mark of ['journal', 'factories', 'comparison', 'decisions', 'commodities', 'stocks'] as const) state = markSeen(state, room, mark);
    const first = getPlayerView(game, 'me');
    first.players.find((p) => p.id === 'me')!.ready = true;
    const steps = tutorialSteps(first, state, room);
    expect(steps.map((s) => s.id)).toEqual(['journal', 'factories', 'comparison', 'decisions', 'commodities', 'ready']);
    expect(steps.every((s) => s.done)).toBe(true);
    expect(withCompletion(state, room, 1, steps)).toBe(state);
    resolveTurn(game);
    const second = getPlayerView(game, 'me');
    expect(tutorialSteps(second, state, room).map((s) => s.id)).toEqual(['recap', 'review', 'adjustment', 'stocks', 'launchIntro', 'ready']);
    expect(tutorialSteps(second, state, room).every((s) => !s.done)).toBe(true);
    expect(isTutorialVisible(state, room, 2)).toBe(true);
    expect(isTutorialVisible(state, room, 3)).toBe(false);
    expect(isTutorialVisible(reopenTutorial(dismissTutorial(state), 3), room, 3)).toBe(true);
    expect(isTutorialVisible(dismissTutorial(state), room, 2)).toBe(false);
  });

  it('mémorise la prévision privée de T1 et compare au rapport de T1 sans prendre les prix de T2', () => {
    const game = fixture();
    const first = getPlayerView(game, 'me');
    const state = captureTutorialForecasts(startGuidedTutorial(room), room, first);
    expect(state.forecasts).toHaveLength(1);
    expect(state.forecasts![0].companyId).toBe(first.companies.find((c) => c.controllerId === 'me')!.id);
    expect(state.forecasts![0].sales).toBe(first.companies.find((c) => c.controllerId === 'me')!.products[0].private!.estimate!.sales);
    resolveTurn(game);
    const second = getPlayerView(game, 'me');
    expect(captureTutorialForecasts(state, room, second)).toBe(state);
    const row = tutorialComparisons(second, parseTutorial(JSON.stringify(state)), room)[0];
    expect(row.sales).toBe(state.forecasts![0].sales);
    expect(row.actualSales).toBe(second.companies.find((c) => c.id === row.companyId)!.reports.find((r) => r.turn === 1)!.products[0].sold);
    expect(tutorialComparisons(second, state, 'ZZZZ')).toEqual([]);
    expect(captureTutorialForecasts(EMPTY_TUTORIAL, room, first)).toBe(EMPTY_TUTORIAL);
  });

  it('rejouer ou rejoindre un autre salon ne transfère pas les coches ni ne force le guide', () => {
    const state = markSeen(startGuidedTutorial(room), room, 'journal');
    const parsed = parseTutorial(JSON.stringify(state));
    expect(parsed).toEqual(state);
    expect(tutorialSteps(getPlayerView(fixture(), 'me'), parsed, room)[0].done).toBe(true);
    expect(tutorialSteps(getPlayerView(fixture(), 'me'), parsed, 'ZZZZ').map((s) => s.id)).toEqual(['journal', 'decisions', 'commodities', 'stocks', 'ready']);
    expect(startGuidedTutorial('ZZZZ').seen).toEqual({});
    expect(parseTutorial(JSON.stringify({ ...state, forecasts: [{ sales: -1 }, null, { sales: '100' }] })).forecasts).toEqual([]);
  });

  it('les actions acceptées à T2 et les visites cochent uniquement la seconde étape correspondante', () => {
    const game = fixture(); resolveTurn(game);
    const view = getPlayerView(game, 'me');
    setState({ ...initial, session: { roomCode: room, playerId: 'me', token: 'test' }, view, tutorial: startGuidedTutorial(room) });
    markTutorial('decisions'); markTutorial('stocks');
    expect(getState().tutorial.seen).toEqual({ adjustment: true, secondStocks: true });
    const steps = tutorialSteps(view, getState().tutorial, room);
    expect(steps.find((s) => s.id === 'adjustment')!.done).toBe(true);
    expect(steps.find((s) => s.id === 'stocks')!.done).toBe(true);
  });

  it('rouvrir à T2 reste limité à T2 ; rouvrir après T2 demande explicitement la reprise du guide', () => {
    const game = fixture(); resolveTurn(game);
    const second = getPlayerView(game, 'me');
    const dismissed = dismissTutorial(markSeen(startGuidedTutorial(room), room, 'recap'));
    setState({ ...initial, session: { roomCode: room, playerId: 'me', token: 'test' }, view: second, tutorial: dismissed, helpOpen: true });
    showTutorialAgain();
    expect(getState().helpOpen).toBe(false);
    expect(isTutorialVisible(getState().tutorial, room, 2)).toBe(true);
    expect(isTutorialVisible(getState().tutorial, room, 3)).toBe(false);
    expect(getState().tutorial.seen.recap).toBe(true);
    setState({ view: { ...second, turn: 3 }, tutorial: dismissed, helpOpen: true });
    showTutorialAgain();
    expect(isTutorialVisible(getState().tutorial, room, 3)).toBe(true);
    // Une reprise tardive ne doit pas rester active si le guide est ensuite rouvert à T2.
    expect(isTutorialVisible(reopenTutorial(getState().tutorial, 2), room, 3)).toBe(false);
  });
});

describe.each(['fr', 'en'] as const)('guide bilingue (%s)', (lang) => {
  it('affiche la comparaison et les explications sans demander un ordre de Bourse ni un lancement', () => {
    const game = fixture();
    const state = captureTutorialForecasts(startGuidedTutorial(room), room, getPlayerView(game, 'me'));
    resolveTurn(game);
    const view = getPlayerView(game, 'me');
    setState({ ...initial, lang, tutorial: state, session: { roomCode: room, playerId: 'me', token: 'test' }, view });
    const html = renderToStaticMarkup(createElement(GameProvider, { view }, createElement(TutorialChecklist, { goTo: () => {} })));
    const messages = learningMessages(lang);
    expect(html).toContain(messages.forecast);
    expect(html).toContain(messages.actual);
    expect(html).toContain(messages.steps.stocks.label);
    expect(html).toContain(messages.steps.launchIntro.label);
    expect(html).toContain('table');
  });
});

/** Tous les textes d'un catalogue, fonctions comprises (appelées avec des valeurs d'exemple). */
function allTexts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    return [1, 2].flatMap((turn) => allTexts(fn.length === 2 ? fn(['rules', 'sector', 'bots'], turn) : fn(turn === 1 ? 1 : '50 %')));
  }
  if (value && typeof value === 'object') return Object.values(value).flatMap(allTexts);
  return [];
}

describe('textes du guide', () => {
  it('vouvoie en français, comme le reste du jeu', () => {
    const texts = allTexts(learningMessages('fr'));
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) expect(text).not.toMatch(/(^|[^\p{L}])(tu|ton|ta|tes|toi|te|t’|t')(?=[^\p{L}]|$)/iu);
    expect(texts.some((text) => /\bvous\b|\bvotre\b|\bvos\b/.test(text))).toBe(true);
  });

  it('les boutons des étapes disent où ils mènent', () => {
    for (const lang of ['fr', 'en'] as const) {
      const m = learningMessages(lang);
      const factories = messages(lang).game.tabs.factories.replace(/^\S+\s/, '');
      for (const id of ['factories', 'comparison', 'decisions', 'review', 'adjustment'] as const) expect(m.steps[id].go).toBe(factories);
      // Le lancement se découvre sur « La carte » : le bouton de l'étape y mène.
      expect(m.steps.launchIntro.go).toBe(messages(lang).game.tabs.map.replace(/^\S+\s/, ''));
      // « Prêt » sur un bouton de la checklist laisserait croire qu'il déclare le joueur prêt : il montre seulement où cliquer.
      expect(m.steps.ready.go).toBe(messages(lang).tutorial.steps.ready.go);
    }
  });

  it.each(['fr', 'en'] as const)('l’aide propose de rouvrir le guide, pas de « reprendre la partie » (%s)', (lang) => {
    setState({ ...initial, lang, helpOpen: true, session: { roomCode: room, playerId: 'me', token: 'test' }, tutorial: startGuidedTutorial(room) });
    const html = renderToStaticMarkup(createElement(HelpModal));
    expect(html).toContain(learningMessages(lang).show);
    expect(learningMessages(lang).show).toBe(lang === 'fr' ? 'Rouvrir le guide' : 'Reopen the guide');
  });
});

describe('félicitations une seule fois', () => {
  it('rouvrir le guide après l’avoir fini ne relance pas le toast « Repères acquis »', () => {
    const game = fixture(); resolveTurn(game);
    const view = getPlayerView(game, 'me');
    view.players.find((p) => p.id === 'me')!.ready = true;
    let state = startGuidedTutorial(room);
    for (const mark of ['recap', 'review', 'adjustment', 'secondStocks', 'launchIntro'] as const) state = markSeen(state, room, mark);
    const steps = tutorialSteps(view, state, room);
    expect(steps.every((s) => s.done)).toBe(true);
    expect(shouldCelebrate(state, room)).toBe(true);
    const done = withCompletion(state, room, 2, steps);
    expect(done.celebrated).toBe(room);
    const reopened = reopenTutorial(dismissTutorial(done), 3);
    expect(reopened.completed).toBe(null);
    expect(shouldCelebrate(reopened, room)).toBe(false);
    // L'achèvement est noté de nouveau (la checklist s'effacera), mais sans nouveau toast.
    expect(withCompletion(reopened, room, 3, steps).completed).toEqual({ room, turn: 3 });
    expect(parseTutorial(JSON.stringify(reopened)).celebrated).toBe(room);
    // Une nouvelle partie guidée repart avec ses propres félicitations.
    expect(shouldCelebrate(startGuidedTutorial('ZZZZ'), 'ZZZZ')).toBe(true);
    expect(shouldCelebrate(dismissTutorial(state), room)).toBe(false);
  });
});

describe('étapes cochées par une visite du joueur', () => {
  it('ouvrir un onglet coche son étape ; un changement de trimestre seul ne coche rien', () => {
    expect(tabVisitMarks('stocks', 2)).toEqual(['stocks']);
    expect(tabVisitMarks('commodities', 1)).toEqual(['commodities']);
    expect(tabVisitMarks('factories', 1)).toEqual(['factories']);
    expect(tabVisitMarks('company', 2)).toEqual([]);
    expect(tabVisitMarks('map', 1)).toEqual([]);
    expect(tabVisitMarks('map', 2)).toEqual(['launchIntro']);
    expect(tabVisitMarks('journal', 2)).toEqual([]);

    const game = fixture(); resolveTurn(game);
    const view = getPlayerView(game, 'me');
    setState({ ...initial, session: { roomCode: room, playerId: 'me', token: 'test' }, view, tutorial: startGuidedTutorial(room) });
    markTabVisit('stocks');
    markTabVisit('map');
    expect(getState().tutorial.seen).toEqual({ secondStocks: true, launchIntro: true });

    // Les onglets ne sont plus cochés par un effet qui dépend du trimestre (clôture sous l'onglet Bourse).
    const src = readFileSync(join(__dirname, '../src/screens/GameScreen.tsx'), 'utf8');
    expect(src).not.toMatch(/\[tab, view\.turn\]/);
    expect(src).toContain('onChange={changeTab}');
    expect(src).toMatch(/const goTo = [\s\S]*?changeTab\(next\)/);
  });

  it('« Mes usines » ne vole plus le focus de la barre d’onglets à chaque affichage', () => {
    const tab = readFileSync(join(__dirname, '../src/screens/game/FactoriesTab.tsx'), 'utf8');
    expect(tab).not.toContain('.focus(');
    const screen = readFileSync(join(__dirname, '../src/screens/GameScreen.tsx'), 'utf8');
    // Seule une demande explicite d'un produit (carte, bilan) met le focus sur sa fiche.
    expect(screen).toMatch(/const openFactory = [\s\S]*?pendingProductFocus\.current = product/);
  });
});
