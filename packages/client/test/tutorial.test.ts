import { describe, expect, it } from 'vitest';
import type { CompanyView, PlayerView, PublicPlayer } from '@muchomoney/core';
import { SECTORS } from '@muchomoney/core';
import {
  EMPTY_TUTORIAL,
  HEX_FIRST_STEPS,
  HEX_SECOND_STEPS,
  TUTORIAL_LAST_TURN,
  TUTORIAL_STEPS,
  allDone,
  dismissTutorial,
  hasMark,
  isTutorialVisible,
  markSeen,
  nextTutorialStep,
  parseTutorial,
  reopenTutorial,
  tutorialGrown,
  tutorialKind,
  tutorialOpenByDefault,
  tutorialProgress,
  tutorialSteps,
  withCompletion,
  type TutorialMark,
  type TutorialState,
} from '../src/tutorial';

const ME = 'p1';
const ROOM = 'KXMP';
const yogurt = SECTORS.yogurts!;
const inputs = Object.entries(yogurt.inputs) as [string, number][];

type ViewOpts = {
  ready?: boolean; controlled?: boolean; stock?: number; production?: number; hex?: boolean; turn?: number;
  /** Plateau : l'usine occupe une case (false : start-up à l'incubateur, hors plateau). */
  onBoard?: boolean;
  /** Plateau : cases libres restantes. */
  free?: string[];
};

function view(opts: ViewOpts = {}): Pick<PlayerView, 'you' | 'players' | 'companies' | 'config' | 'turn' | 'hexes'> {
  const production = opts.production ?? 100;
  const stock = opts.stock ?? 0;
  const company = {
    id: 'c1',
    controllerId: opts.controlled === false ? 'p2' : ME,
    status: 'active',
    products: [{ id: 'x', sectorId: 'yogurts', capacity: 200, hexId: 'A1', private: { production } }],
    private: { inventory: Object.fromEntries(inputs.map(([cid, q]) => [cid, { lots: q * production * stock, avgCost: 1 }])) },
  } as unknown as CompanyView;
  const me = { id: ME, ready: opts.ready ?? false } as PublicPlayer;
  const config = { mapMode: opts.hex ? 'hex' : 'classic' } as PlayerView['config'];
  const hexes = opts.hex
    ? { occupied: (opts.onBoard === false ? {} : { A1: 'c1' }) as Record<string, string>, free: opts.free ?? ['B2', 'C3'], reserve: {}, results: [] }
    : undefined;
  return { you: ME, players: [me], companies: [company], config, turn: opts.turn ?? 1, hexes };
}

const done = (v: ReturnType<typeof view>, s: TutorialState) =>
  Object.fromEntries(tutorialSteps(v, s, ROOM).map((st) => [st.id, st.done]));
const marks = (...list: TutorialMark[]) => list.reduce((s, m) => markSeen(s, ROOM, m), EMPTY_TUTORIAL);

describe('checklist « Vos premiers pas » : cochage (carte classique)', () => {
  it('au départ : rien de coché (sauf matières si le stock suffit), les cinq étapes dans l’ordre', () => {
    const steps = tutorialSteps(view(), EMPTY_TUTORIAL, ROOM);
    expect(steps.map((s) => s.id)).toEqual(TUTORIAL_STEPS.map((s) => s.id));
    expect(steps.map((s) => s.id)).toEqual(['journal', 'decisions', 'commodities', 'stocks', 'ready']);
    expect(steps.map((s) => s.tab)).toEqual(['journal', 'company', 'commodities', 'stocks', null]);
    expect(done(view(), EMPTY_TUTORIAL)).toEqual({ journal: false, decisions: false, commodities: false, stocks: false, ready: false });
    expect(done(view({ stock: 1 }), EMPTY_TUTORIAL).commodities).toBe(true);
    expect(done(view({ stock: 0.5 }), EMPTY_TUTORIAL).commodities).toBe(false);
    expect(done(view({ production: 0 }), EMPTY_TUTORIAL).commodities).toBe(true);
    // Même au deuxième trimestre, la liste classique ne grandit pas.
    expect(tutorialSteps(view({ turn: 2 }), EMPTY_TUTORIAL, ROOM)).toHaveLength(5);
  });

  it('marques locales et vue : journal, décisions, bourse, matières consultées, prêt', () => {
    let s = marks('journal', 'decisions', 'stocks');
    expect(done(view(), s)).toEqual({ journal: true, decisions: true, commodities: false, stocks: true, ready: false });
    // Aller voir les matières suffit : l'achat d'urgence est un choix assumé.
    s = markSeen(s, ROOM, 'commodities');
    expect(done(view(), s).commodities).toBe(true);
    expect(done(view({ ready: true }), s).ready).toBe(true);
    expect(allDone(tutorialSteps(view({ ready: true }), s, ROOM))).toBe(true);
  });

  it('« Je suis prêt » cliqué une fois reste coché au trimestre suivant (le statut, lui, est remis à zéro)', () => {
    const s = marks('ready');
    expect(done(view({ ready: false, turn: 2 }), s).ready).toBe(true);
    expect(done(view({ ready: false, turn: 2 }), EMPTY_TUTORIAL).ready).toBe(false);
    // Sans marque (autre navigateur), le statut du joueur coche encore l'étape pendant le trimestre.
    expect(done(view({ ready: true }), EMPTY_TUTORIAL).ready).toBe(true);
  });

  it('markSeen idempotent (même objet) ; marques d’une autre partie ignorées', () => {
    const a = markSeen(EMPTY_TUTORIAL, ROOM, 'journal');
    expect(markSeen(a, ROOM, 'journal')).toBe(a);
    expect(done(view(), a).journal).toBe(true);
    expect(hasMark(a, ROOM, 'journal')).toBe(true);
    expect(hasMark(a, 'ZZZZ', 'journal')).toBe(false);
    expect(tutorialSteps(view(), a, 'ZZZZ')[0].done).toBe(false);
    const b = markSeen(a, 'ZZZZ', 'stocks');
    expect(b.room).toBe('ZZZZ');
    expect(b.seen).toEqual({ stocks: true });
  });

  it('sans entreprise : décisions et matières sans objet', () => {
    const steps = tutorialSteps(view({ controlled: false }), EMPTY_TUTORIAL, ROOM);
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId.decisions).toMatchObject({ done: true, skipped: 'noCompany' });
    expect(byId.commodities).toMatchObject({ done: true, skipped: 'noCompany' });
    expect(byId.journal.skipped).toBeUndefined();
  });
});

describe('checklist du plateau : une liste échelonnée par trimestre', () => {
  it('kind : la partie guidée garde sa liste, sinon la carte de la partie décide', () => {
    expect(tutorialKind(view({ hex: true }), EMPTY_TUTORIAL, ROOM)).toBe('hex');
    expect(tutorialKind(view(), EMPTY_TUTORIAL, ROOM)).toBe('classic');
    expect(tutorialKind(view({ hex: true }), { ...EMPTY_TUTORIAL, guidedRoom: ROOM }, ROOM)).toBe('guided');
  });

  it('trimestre 1 : la une, un produit, les matières, sa case, puis « Je suis prêt »', () => {
    const steps = tutorialSteps(view({ hex: true }), EMPTY_TUTORIAL, ROOM);
    expect(steps.map((s) => s.id)).toEqual(['journal', 'decisions', 'commodities', 'ownCell', 'ready']);
    expect(steps.map((s) => s.id)).toEqual(HEX_FIRST_STEPS.map((s) => s.id));
    expect(steps.find((s) => s.id === 'ownCell')).toMatchObject({ tab: 'map', done: false });
    // Plus d'étape « Visiter la carte » ni de couleurs ou de résultat de mise.
    expect(steps.map((s) => s.id)).not.toContain('board');
    expect(done(view({ hex: true }), marks('ownCell')).ownCell).toBe(true);
    expect(tutorialProgress(steps)).toEqual({ done: 0, total: 5 });
  });

  it('trimestre 2 : quatre étapes s’ajoutent, les coches du premier trimestre restent', () => {
    const s = marks('journal', 'decisions', 'commodities', 'ownCell', 'ready');
    const steps = tutorialSteps(view({ hex: true, turn: 2 }), s, ROOM);
    expect(steps.map((st) => st.id)).toEqual([...HEX_FIRST_STEPS, ...HEX_SECOND_STEPS].map((st) => st.id));
    expect(steps.map((st) => st.id).slice(5)).toEqual(['recap', 'freeCell', 'bidForm', 'stocks']);
    expect(steps.slice(0, 5).every((st) => st.done)).toBe(true);
    expect(steps.slice(5).some((st) => st.done)).toBe(false);
    // L'étape de mise est facultative : ni comptée, ni exigée.
    expect(steps.find((st) => st.id === 'bidForm')).toMatchObject({ optional: true, tab: 'map' });
    expect(tutorialProgress(steps)).toEqual({ done: 5, total: 8 });
    // Une case libre déjà comparée au premier trimestre reste cochée.
    expect(done(view({ hex: true, turn: 2 }), marks('freeCell')).freeCell).toBe(true);
  });

  it('tout le requis coché au T2, sans la mise facultative : la liste est finie', () => {
    const s = marks('journal', 'decisions', 'commodities', 'ownCell', 'ready', 'recap', 'freeCell', 'stocks');
    const steps = tutorialSteps(view({ hex: true, turn: 2 }), s, ROOM);
    expect(steps.find((st) => st.id === 'bidForm')?.done).toBe(false);
    expect(allDone(steps)).toBe(true);
    expect(tutorialProgress(steps)).toEqual({ done: 8, total: 8 });
    expect(nextTutorialStep(steps)?.id).toBe('bidForm');
  });

  it('étapes du plateau sans objet : aucune entreprise, aucune usine sur une case, aucune case libre', () => {
    const byId = (v: ReturnType<typeof view>) => Object.fromEntries(tutorialSteps(v, EMPTY_TUTORIAL, ROOM).map((s) => [s.id, s]));
    expect(byId(view({ hex: true, controlled: false, turn: 2 }))).toMatchObject({
      ownCell: { done: true, skipped: 'noCompany' }, bidForm: { done: true, skipped: 'noCompany' }, freeCell: { done: false },
    });
    expect(byId(view({ hex: true, onBoard: false })).ownCell).toMatchObject({ done: true, skipped: 'noFactoryCell' });
    expect(byId(view({ hex: true, free: [], turn: 2 }))).toMatchObject({
      freeCell: { done: true, skipped: 'noFreeCell' }, bidForm: { done: true, skipped: 'noFreeCell' },
    });
  });

  it('prochaine étape : la première exigée dans l’ordre, jamais une étape sans objet', () => {
    expect(nextTutorialStep(tutorialSteps(view({ hex: true }), EMPTY_TUTORIAL, ROOM))?.id).toBe('journal');
    expect(nextTutorialStep(tutorialSteps(view({ hex: true }), marks('journal'), ROOM))?.id).toBe('decisions');
    expect(nextTutorialStep(tutorialSteps(view({ hex: true, onBoard: false }), marks('journal', 'decisions', 'commodities'), ROOM))?.id).toBe('ready');
    const all = marks('journal', 'decisions', 'commodities', 'ownCell', 'ready', 'recap', 'freeCell', 'stocks', 'bidForm');
    expect(nextTutorialStep(tutorialSteps(view({ hex: true, turn: 2 }), all, ROOM))).toBeNull();
  });
});

describe('checklist : pliage d’office', () => {
  it('dépliée sur le journal au premier trimestre et quand la liste vient de grandir ; une ligne ailleurs', () => {
    expect(tutorialOpenByDefault('journal', 1, false)).toBe(true);
    expect(tutorialOpenByDefault('company', 1, false)).toBe(false);
    expect(tutorialOpenByDefault('map', 1, false)).toBe(false);
    expect(tutorialOpenByDefault('journal', 2, false)).toBe(false);
    expect(tutorialOpenByDefault('stocks', 2, true)).toBe(true);
  });

  it('la liste du plateau grandit une fois, au deuxième trimestre', () => {
    expect(tutorialGrown('hex', EMPTY_TUTORIAL, ROOM, 1)).toBe(false);
    expect(tutorialGrown('hex', EMPTY_TUTORIAL, ROOM, 2)).toBe(true);
    expect(tutorialGrown('hex', marks('secondQuarter'), ROOM, 2)).toBe(false);
    expect(tutorialGrown('classic', EMPTY_TUTORIAL, ROOM, 2)).toBe(false);
    expect(tutorialGrown('guided', EMPTY_TUTORIAL, ROOM, 2)).toBe(false);
  });
});

describe('checklist : visibilité, retraite et mémorisation', () => {
  it('classique : achevée, elle reste le trimestre en cours puis s’efface, et ne revient pas dans les parties suivantes', () => {
    expect(isTutorialVisible(EMPTY_TUTORIAL, ROOM, 1)).toBe(true);
    expect(isTutorialVisible(dismissTutorial(EMPTY_TUTORIAL), ROOM, 1)).toBe(false);
    const s = marks('journal', 'decisions', 'commodities', 'stocks');
    expect(withCompletion(s, ROOM, 1, tutorialSteps(view(), s, ROOM))).toBe(s);
    const all = tutorialSteps(view({ ready: true }), s, ROOM);
    const c = withCompletion(s, ROOM, 1, all);
    expect(c.completed).toEqual({ room: ROOM, turn: 1 });
    expect(withCompletion(c, ROOM, 2, all)).toBe(c);
    expect(isTutorialVisible(c, ROOM, 1)).toBe(true);
    expect(isTutorialVisible(c, ROOM, 2)).toBe(false);
    expect(isTutorialVisible(c, 'ZZZZ', 1)).toBe(false);
    // L'aide « ? » la fait revenir, étapes conservées.
    const back = reopenTutorial(dismissTutorial(c), 2, ROOM);
    expect(isTutorialVisible(back, ROOM, 2)).toBe(true);
    expect(back.seen).toEqual(c.seen);
  });

  it('prend sa retraite à la clôture du deuxième trimestre, quoi qu’il reste à cocher (classique et plateau)', () => {
    expect(TUTORIAL_LAST_TURN).toBe(2);
    for (const hex of [false, true]) {
      expect(isTutorialVisible(EMPTY_TUTORIAL, ROOM, 2, hex)).toBe(true);
      expect(isTutorialVisible(EMPTY_TUTORIAL, ROOM, 3, hex)).toBe(false);
      expect(isTutorialVisible(EMPTY_TUTORIAL, ROOM, 9, hex)).toBe(false);
      // Rouverte depuis l'aide après sa retraite : affichée dans ce salon seulement.
      const back = reopenTutorial(dismissTutorial(EMPTY_TUTORIAL), 5, ROOM, hex);
      expect(back.reopenedRoom).toBe(ROOM);
      expect(isTutorialVisible(back, ROOM, 5, hex)).toBe(true);
      expect(isTutorialVisible(back, 'ZZZZ', 5, hex)).toBe(false);
      expect(isTutorialVisible(back, 'ZZZZ', 1, hex)).toBe(true);
      // Rouverte avant sa retraite, elle repart à la clôture du T2 comme d'habitude.
      const early = reopenTutorial(back, 2, ROOM, hex);
      expect(early.reopenedRoom).toBeUndefined();
      expect(isTutorialVisible(early, ROOM, 3, hex)).toBe(false);
    }
  });

  it('plateau : l’achèvement attend le deuxième trimestre, puis la liste s’efface à sa clôture', () => {
    const first = marks('journal', 'decisions', 'commodities', 'ownCell', 'ready');
    const t1 = tutorialSteps(view({ hex: true }), first, ROOM);
    expect(allDone(t1)).toBe(true);
    // Au premier trimestre, la suite reste à venir : pas d'achèvement, pas de félicitations.
    expect(withCompletion(first, ROOM, 1, t1, true)).toBe(first);
    const second = marks('journal', 'decisions', 'commodities', 'ownCell', 'ready', 'recap', 'freeCell', 'stocks');
    const t2 = tutorialSteps(view({ hex: true, turn: 2 }), second, ROOM);
    const finished = withCompletion(second, ROOM, 2, t2, true);
    expect(finished.hexCompleted).toEqual({ room: ROOM, turn: 2 });
    expect(finished.completed).toBeNull();
    expect(finished.celebrated).toBe(ROOM);
    expect(isTutorialVisible(finished, ROOM, 2, true)).toBe(true);
    expect(isTutorialVisible(finished, ROOM, 3, true)).toBe(false);
    // Les deux listes sont tenues à part : finir le plateau ne retire pas la liste classique, ni l'inverse.
    expect(isTutorialVisible(finished, 'ZZZZ', 1, true)).toBe(false);
    expect(isTutorialVisible(finished, 'ZZZZ', 1, false)).toBe(true);
    const classicDone = { ...EMPTY_TUTORIAL, completed: { room: 'OLD', turn: 1 } };
    expect(isTutorialVisible(classicDone, ROOM, 1, true)).toBe(true);
    expect(reopenTutorial(classicDone, 1, ROOM, true).completed).toEqual({ room: 'OLD', turn: 1 });
    expect(reopenTutorial(finished, 1, ROOM, false).hexCompleted).toEqual({ room: ROOM, turn: 2 });
    expect(reopenTutorial(finished, 1, ROOM, true).hexCompleted).toBeUndefined();
  });

  it('parseTutorial : aller-retour JSON, valeurs illisibles → état vierge', () => {
    const s: TutorialState = { dismissed: true, room: ROOM, seen: { journal: true, ready: true, ownCell: true, secondQuarter: true },
      completed: { room: ROOM, turn: 3 }, hexCompleted: { room: ROOM, turn: 2 }, reopenedRoom: ROOM };
    expect(parseTutorial(JSON.stringify(s))).toEqual(s);
    // L'ancienne marque « board » (visite de la carte) ne coche plus rien.
    expect(parseTutorial(JSON.stringify({ room: ROOM, seen: { board: true, freeCell: true } }))).toEqual({ ...EMPTY_TUTORIAL, room: ROOM, seen: { freeCell: true } });
    expect(parseTutorial(null)).toEqual(EMPTY_TUTORIAL);
    expect(parseTutorial('{oops')).toEqual(EMPTY_TUTORIAL);
    expect(parseTutorial('42')).toEqual(EMPTY_TUTORIAL);
    expect(parseTutorial(JSON.stringify({ dismissed: 'yes', seen: { journal: 1, stocks: true, hack: true }, completed: { room: 1 }, hexCompleted: { room: ROOM, turn: 'x' }, reopenedRoom: 3 }))).toEqual({
      ...EMPTY_TUTORIAL,
      seen: { stocks: true },
    });
  });
});
