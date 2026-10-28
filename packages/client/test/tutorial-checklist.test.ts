import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_COLORS, createGame, getPlayerView, resolveTurn, type GameState, type Lang, type LobbyPlayer } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { TutorialChecklist } from '../src/screens/game/TutorialChecklist';
import type { TabId } from '../src/screens/GameScreen';
import { getState, setState, type AppState } from '../src/store';
import { EMPTY_TUTORIAL, HEX_FIRST_STEPS, HEX_SECOND_STEPS, TUTORIAL_STEPS, markSeen, type TutorialMark, type TutorialState } from '../src/tutorial';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const ROOM = 'STEP';
const initial = getState();
afterEach(() => {
  setState(initial);
  vi.unstubAllGlobals();
});
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

/** Petite partie réelle : deux joueurs, huit trimestres, plateau ou carte classique, au trimestre demandé. */
function game(hex: boolean, turn = 1): GameState {
  const players: LobbyPlayer[] = [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: PLAYER_COLORS[0] },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: PLAYER_COLORS[1] },
  ];
  const config = hex
    ? ({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr', mapMode: 'hex', terrainAssignment: 'fair' } as const)
    : ({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr' } as const);
  const g = createGame(config, players);
  while (g.turn < turn) resolveTurn(g);
  return g;
}

const marks = (...list: TutorialMark[]): TutorialState => list.reduce((s, m) => markSeen(s, ROOM, m), EMPTY_TUTORIAL);
const FIRST_QUARTER: TutorialMark[] = ['journal', 'decisions', 'commodities', 'ownCell', 'ready'];

function checklist(g: GameState, lang: Lang, tab: TabId, tutorial: TutorialState = EMPTY_TUTORIAL): string {
  setState({ ...initial, lang, tutorial, session: { roomCode: ROOM, playerId: 'human', token: 'test' } });
  return renderToStaticMarkup(createElement(GameProvider, { view: getPlayerView(g, 'human') }, createElement(TutorialChecklist, { goTo: () => {}, tab })));
}
const stepIds = (html: string) => [...html.matchAll(/data-tutorial-step="([^"]+)"/g)].map((m) => m[1]);

describe.each(['fr', 'en'] as const)('« Vos premiers pas » sur le plateau (%s)', (lang) => {
  const t = messages(lang);

  it('trimestre 1, sur le journal : la liste dépliée, cinq étapes dont sa case, sans visite de la carte', () => {
    const html = checklist(game(true), lang, 'journal');
    expect(html).toContain('aria-expanded="true"');
    expect(stepIds(html)).toEqual(HEX_FIRST_STEPS.map((s) => s.id));
    expect(html).toContain(escaped(t.tutorial.steps.ownCell.label));
    expect(html).toContain(escaped(t.tutorial.steps.ownCell.go));
    expect(html).toContain('0/5');
    // Les réglages proposés peuvent se garder tels quels.
    expect(html).toContain(escaped(t.tutorial.keep));
    // Plus de seconde liste ni de couleurs à essayer : un seul compteur.
    expect(html.match(/class="tutorial[ "]/g)).toHaveLength(1);
    expect(html).not.toContain(escaped(t.tutorial.steps.freeCell.label));
  });

  it('trimestre 1, ailleurs : une ligne avec la prochaine étape et son bouton', () => {
    const html = checklist(game(true), lang, 'company', marks('journal'));
    expect(html).toContain('aria-expanded="false"');
    expect(stepIds(html)).toEqual([]);
    expect(html).toContain(escaped(t.tutorial.nextStep(t.tutorial.steps.decisions.label)));
    expect(html).toContain('data-tutorial-next="decisions"');
    expect(html).toContain('1/5');
    expect(html).not.toContain(escaped(t.tutorial.moneyGuide));
  });

  it('trimestre 1 tout coché : « la suite après la clôture », sans félicitations finales', () => {
    const html = checklist(game(true), lang, 'journal', marks(...FIRST_QUARTER));
    expect(html).toContain('5/5');
    expect(html).toContain(escaped(t.tutorial.firstQuarterDone));
    expect(html).not.toContain(escaped(t.tutorial.hexAllDone));
  });

  it('trimestre 2 : quatre étapes de plus, dépliées à la première vue, quel que soit l’onglet ; les coches du T1 restent, réduites à leur libellé', () => {
    const html = checklist(game(true, 2), lang, 'stocks', marks(...FIRST_QUARTER));
    expect(html).toContain('aria-expanded="true"');
    expect(stepIds(html)).toEqual([...HEX_FIRST_STEPS, ...HEX_SECOND_STEPS].map((s) => s.id));
    expect(html).toContain('5/8');
    for (const id of ['recap', 'freeCell', 'bidForm', 'stocks'] as const) expect(html).toContain(escaped(t.tutorial.steps[id].label));
    expect(t.tutorial.steps.bidForm.label).toMatch(lang === 'fr' ? /\(facultatif\)$/ : /\(optional\)$/);
    // Une étape faite ne répète ni son conseil ni son bouton.
    expect(html).not.toContain(escaped(t.tutorial.steps.journal.hint('')));
    expect(html).not.toContain(escaped(t.tutorial.steps.ownCell.go));
    expect(html).toContain(escaped(t.tutorial.steps.freeCell.hint('')));
  });

  it('trimestre 2, liste déjà montrée : une ligne ailleurs que sur la première vue', () => {
    const html = checklist(game(true, 2), lang, 'company', marks(...FIRST_QUARTER, 'secondQuarter'));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-tutorial-next="recap"');
    expect(html).toContain(escaped(t.tutorial.nextStep(t.tutorial.steps.recap.label)));
  });

  it('trimestre 2 fini sans la mise facultative : félicitations du plateau ; repliée, la ligne propose encore la mise facultative', () => {
    const required: TutorialMark[] = [...FIRST_QUARTER, 'recap', 'freeCell', 'stocks'];
    const open = checklist(game(true, 2), lang, 'journal', marks(...required));
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('8/8');
    expect(open).toContain(escaped(t.tutorial.hexAllDone));
    const folded = checklist(game(true, 2), lang, 'journal', marks(...required, 'secondQuarter'));
    expect(folded).toContain('aria-expanded="false"');
    expect(folded).toContain('data-tutorial-next="bidForm"');
    expect(checklist(game(true, 2), lang, 'journal', marks(...required, 'secondQuarter', 'bidForm'))).toContain(escaped(t.tutorial.hexAllDone));
  });

  it('dit aux lecteurs d’écran si chaque étape est faite (✓ et ○ restent décoratifs)', () => {
    const html = checklist(game(true), lang, 'journal', marks('journal'));
    const li = (id: string) => html.match(new RegExp(`data-tutorial-step="${id}".*?</li>`))?.[0] ?? '';
    expect(li('journal')).toContain(`<span class="sr-only"> ${escaped(t.tutorial.stepDone)}</span>`);
    expect(li('decisions')).toContain(`<span class="sr-only"> ${escaped(t.tutorial.stepTodo)}</span>`);
    expect(li('journal')).toContain('<span class="tutorial-check" aria-hidden="true">✓</span>');
    expect(t.tutorial.stepDone).toBe(lang === 'fr' ? '· fait' : '· done');
    expect(t.tutorial.stepTodo).toBe(lang === 'fr' ? '· à faire' : '· to do');
  });

  it('retraite à la clôture du T2, quoi qu’il reste ; l’aide peut la rouvrir dans ce salon', () => {
    expect(checklist(game(true, 3), lang, 'journal')).toBe('');
    expect(checklist(game(true, 3), lang, 'journal', { ...EMPTY_TUTORIAL, reopenedRoom: ROOM })).toContain('aria-expanded');
  });
});

describe.each(['fr', 'en'] as const)('« Vos premiers pas » sur la carte classique (%s)', (lang) => {
  const t = messages(lang);

  it('garde ses cinq étapes, sans étape du plateau, ni au premier ni au deuxième trimestre', () => {
    for (const turn of [1, 2]) {
      const html = checklist(game(false, turn), lang, 'journal', turn === 2 ? marks('secondQuarter') : EMPTY_TUTORIAL);
      if (turn === 1) expect(stepIds(html)).toEqual(TUTORIAL_STEPS.map((s) => s.id));
      for (const id of ['ownCell', 'freeCell', 'bidForm'] as const) expect(html).not.toContain(escaped(t.tutorial.steps[id].label));
    }
    expect(checklist(game(false), lang, 'journal')).toContain(escaped(t.tutorial.keep));
    expect(checklist(game(false), lang, 'markets')).toContain('data-tutorial-next="journal"');
    expect(checklist(game(false, 3), lang, 'journal')).toBe('');
  });
});

/** Les mots d'un texte (lettres ou chiffres), comme pour les notes des cases. */
const words = (text: string) => text.split(/\s+/).filter((word) => /\p{L}|\d/u.test(word)).length;

describe('textes des premiers pas', () => {
  it('des conseils de douze mots au plus, dans les deux langues', () => {
    for (const lang of ['fr', 'en'] as const) {
      const steps = messages(lang).tutorial.steps;
      for (const [id, step] of Object.entries(steps)) {
        expect(words(step.hint('10 %')), `${lang}.${id}`).toBeLessThanOrEqual(12);
        expect(step.label.length, `${lang}.${id}`).toBeGreaterThan(0);
      }
    }
  });

  it('vouvoie en français ; espaces insécables dans les nouveaux textes', () => {
    const tutorial = messages('fr').tutorial;
    const texts = [tutorial.keep, tutorial.nextStep('x'), tutorial.skippedNoFactory, tutorial.skippedNoFree, tutorial.hexAllDone, tutorial.firstQuarterDone,
      ...Object.values(tutorial.steps).flatMap((step) => [step.label, step.hint('10 %'), step.go])];
    for (const text of texts) expect(text).not.toMatch(/(^|[^\p{L}])(tu|ton|ta|tes|toi|te|t’|t')(?=[^\p{L}]|$)/iu);
    expect(tutorial.steps.ownCell.label).toContain('votre');
    for (const text of [tutorial.nextStep('x'), tutorial.skippedNoFactory, tutorial.skippedNoFree, tutorial.hexAllDone, tutorial.steps.ownCell.hint(''), tutorial.steps.bidForm.hint(''),
      tutorial.steps.decisions.hint(''), tutorial.steps.stocks.hint('')]) {
      expect(text).not.toMatch(/ [:;?!]|« | »/);
    }
  });

  it('raccourcis, les conseils gardent ce qui sert à décider : réglages reconduits, où acheter des actions', () => {
    const fr = messages('fr').tutorial.steps;
    const en = messages('en').tutorial.steps;
    // Sans ce fait, « Garder ces réglages » ne voudrait rien dire.
    expect(fr.decisions.hint('')).toContain('sans retouche, ces réglages restent');
    expect(en.decisions.hint('')).toContain('untouched settings carry over');
    expect(fr.stocks.hint('')).toContain('cliquez une ligne pour acheter');
    expect(en.stocks.hint('')).toContain('click a row to trade');
  });

  it('repliée, sa ligne prend toute la largeur ; rouverte, elle s’arrête sous la barre du jeu et les onglets collants', () => {
    const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');
    expect(css).toMatch(/\.tutorial\.collapsed \{\s*max-width: none;\s*\}/);
    expect(css).toMatch(/\n\.tutorial \{[^}]*scroll-margin-top: calc\(var\(--topbar-h, 65px\) \+ var\(--tabs-h, 0px\) \+ 12px\);/);
  });
});
