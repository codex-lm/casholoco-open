/**
 * Checklist « Vos premiers pas » (logique pure, testée ; l'affichage est dans TutorialChecklist).
 *
 * Chaque étape se coche d'après la vue du joueur, complétée de quelques marques locales
 * (onglet consulté, décisions enregistrées, case sélectionnée, « Je suis prêt » cliqué) : rien n'est envoyé
 * au serveur et la simulation n'en sait rien. L'état est mémorisé dans ce navigateur (localStorage
 * 'muchomoney:tutorial') : fermée une fois, la checklist ne revient que sur demande (bouton « ? »).
 *
 * Trois listes : la classique (cinq étapes), celle du plateau (partie hexadécimale), échelonnée par trimestre,
 * et celle de la première partie guidée (deux trimestres). Hors partie guidée, la liste prend sa retraite à la
 * clôture du deuxième trimestre, quoi qu'il reste à cocher.
 */
import { isSpatialMap, type PlayerView } from '@muchomoney/core';
import { commodityShortfall } from './rules';

export const TUTORIAL_KEY = 'muchomoney:tutorial';

export type TutorialStepId =
  | 'journal' | 'decisions' | 'commodities' | 'stocks' | 'ready'
  | 'ownCell' | 'recap' | 'freeCell' | 'bidForm'
  | 'factories' | 'comparison' | 'review' | 'adjustment' | 'launchIntro';
/** Étapes du plateau, propres à la liste hexadécimale (la partie guidée n'en a pas). */
export type BoardStepId = 'ownCell' | 'freeCell' | 'bidForm';
/** Étapes de la partie guidée (textes dans i18n/learning.ts). */
export type GuidedStepId = Exclude<TutorialStepId, BoardStepId>;
/** Étapes des listes classique et du plateau (textes dans le catalogue, `tutorial.steps`). */
export type ChecklistStepId = 'journal' | 'decisions' | 'commodities' | 'stocks' | 'ready' | BoardStepId | 'recap';
/**
 * Marques locales (ce que la vue ne dit pas). « ready » : « Je suis prêt » cliqué au moins une fois ;
 * « secondQuarter » : la liste du plateau agrandie au deuxième trimestre a déjà été montrée.
 */
export type TutorialMark = TutorialStepId | 'secondStocks' | 'secondQuarter';
/** Onglet ouvert par le bouton de l'étape ; null pour « Prêt » (bouton de la barre du haut) et le bilan. */
export type TutorialTab = 'journal' | 'company' | 'commodities' | 'stocks' | 'factories' | 'map' | null;
/** Liste suivie dans ce salon. */
export type TutorialKind = 'classic' | 'hex' | 'guided';
/** Pourquoi une étape est sans objet (comptée comme faite). */
export type TutorialSkip = 'noCompany' | 'noFactoryCell' | 'noFreeCell';

export interface TutorialForecast {
  companyId: string;
  productId: string;
  name: string;
  sales: number;
  production: number;
}

export interface TutorialState {
  /** Fermée par le joueur : ne revient que via l'aide. */
  dismissed: boolean;
  /** Salon auquel se rapportent les marques (une nouvelle partie repart de zéro). */
  room: string | null;
  seen: Partial<Record<TutorialMark, boolean>>;
  /**
   * Tour où toutes les étapes de la liste classique (ou guidée) ont été cochées : la checklist s'efface au tour
   * suivant, et ne revient plus d'elle-même dans les parties suivantes.
   */
  completed: { room: string; turn: number } | null;
  /** Même chose pour la liste du plateau, tenue à part : finir l'une ne retire pas l'autre. */
  hexCompleted?: { room: string; turn: number };
  /** Salon où le toast « tout est coché » est déjà parti : rouvrir la checklist ne le relance pas. */
  celebrated?: string;
  /** Le raccourci d'accueil active le parcours de deux trimestres uniquement dans ce salon. */
  guidedRoom?: string;
  /** L'aide permet aussi de reprendre la seconde partie du guide après T2. */
  reviewAgain?: boolean;
  /** Salon où l'aide a rouvert la liste (classique ou du plateau) après sa retraite, la clôture du T2 passée. */
  reopenedRoom?: string;
  /** Dernière prévision T1 reçue du serveur, jamais recalculée avec les informations de T2. */
  forecasts?: TutorialForecast[];
}

export interface TutorialStep {
  id: TutorialStepId;
  tab: TutorialTab;
  done: boolean;
  /** Sans objet (aucune entreprise, aucune usine sur le plateau, aucune case libre) : comptée comme faite. */
  skipped?: TutorialSkip;
  /** Facultative : ni comptée dans la progression, ni exigée pour finir la liste. */
  optional?: boolean;
}

type StepDef = { id: ChecklistStepId; tab: TutorialTab; optional?: boolean };

/** La liste classique, cinq étapes. */
export const TUTORIAL_STEPS: readonly StepDef[] = [
  { id: 'journal', tab: 'journal' },
  { id: 'decisions', tab: 'company' },
  { id: 'commodities', tab: 'commodities' },
  { id: 'stocks', tab: 'stocks' },
  { id: 'ready', tab: null },
];

/** Plateau, premier trimestre : la une, un produit, les matières, sa case, puis « Je suis prêt ». */
export const HEX_FIRST_STEPS: readonly StepDef[] = [
  { id: 'journal', tab: 'journal' },
  { id: 'decisions', tab: 'company' },
  { id: 'commodities', tab: 'commodities' },
  { id: 'ownCell', tab: 'map' },
  { id: 'ready', tab: null },
];

/** Plateau, ajoutées après la première clôture (les coches du premier trimestre restent). */
export const HEX_SECOND_STEPS: readonly StepDef[] = [
  { id: 'recap', tab: null },
  { id: 'freeCell', tab: 'map' },
  // Ouvrir un formulaire de lancement ou de déménagement, jamais miser : l'étape ne pousse pas à dépenser.
  { id: 'bidForm', tab: 'map', optional: true },
  { id: 'stocks', tab: 'stocks' },
];

/** Hors partie guidée, la liste s'affiche d'elle-même jusqu'à ce trimestre, puis prend sa retraite à sa clôture. */
export const TUTORIAL_LAST_TURN = 2;

/** Tolérance sur les lots manquants (inventaires en flottants). */
const SHORTFALL_EPS = 0.01;

export const EMPTY_TUTORIAL: TutorialState = { dismissed: false, room: null, seen: {}, completed: null };

const MARKS: readonly TutorialMark[] = ['journal', 'decisions', 'commodities', 'stocks', 'ready', 'ownCell', 'freeCell', 'bidForm',
  'factories', 'comparison', 'recap', 'review', 'adjustment', 'launchIntro', 'secondStocks', 'secondQuarter'];

export function startGuidedTutorial(room: string): TutorialState {
  return { ...EMPTY_TUTORIAL, room, guidedRoom: room, seen: {} };
}

export function isGuidedTutorial(s: TutorialState, room: string): boolean {
  return s.guidedRoom === room;
}

function parseCompletion(c: unknown): { room: string; turn: number } | null {
  if (!c || typeof c !== 'object') return null;
  const { room, turn } = c as { room?: unknown; turn?: unknown };
  return typeof room === 'string' && typeof turn === 'number' && Number.isFinite(turn) ? { room, turn } : null;
}

/** Relit l'état mémorisé ; toute valeur illisible donne un état vierge. */
export function parseTutorial(raw: string | null | undefined): TutorialState {
  if (!raw) return EMPTY_TUTORIAL;
  try {
    const v = JSON.parse(raw) as Partial<TutorialState> | null;
    if (!v || typeof v !== 'object') return EMPTY_TUTORIAL;
    const seen: TutorialState['seen'] = {};
    if (v.seen && typeof v.seen === 'object') for (const k of MARKS) if (v.seen[k] === true) seen[k] = true;
    const completed = parseCompletion(v.completed);
    const hexCompleted = parseCompletion(v.hexCompleted);
    const guidedRoom = typeof v.guidedRoom === 'string' ? v.guidedRoom : undefined;
    const forecasts = Array.isArray(v.forecasts) ? v.forecasts.filter((f): f is TutorialForecast => !!f &&
      typeof f.companyId === 'string' && typeof f.productId === 'string' && typeof f.name === 'string' &&
      Number.isFinite(f.sales) && f.sales >= 0 && Number.isFinite(f.production) && f.production >= 0).slice(0, 100) : undefined;
    return { dismissed: v.dismissed === true, room: typeof v.room === 'string' ? v.room : null, seen, completed,
      ...(typeof v.celebrated === 'string' ? { celebrated: v.celebrated } : {}),
      ...(hexCompleted ? { hexCompleted } : {}),
      ...(guidedRoom ? { guidedRoom } : {}), ...(v.reviewAgain === true ? { reviewAgain: true } : {}),
      ...(typeof v.reopenedRoom === 'string' ? { reopenedRoom: v.reopenedRoom } : {}), ...(forecasts ? { forecasts } : {}) };
  } catch {
    return EMPTY_TUTORIAL;
  }
}

export function loadTutorial(): TutorialState {
  try {
    return parseTutorial(window.localStorage.getItem(TUTORIAL_KEY));
  } catch {
    return EMPTY_TUTORIAL;
  }
}

export function saveTutorial(s: TutorialState): void {
  try {
    window.localStorage.setItem(TUTORIAL_KEY, JSON.stringify(s));
  } catch {
    // navigation privée, stockage plein : tant pis, la checklist reviendra
  }
}

/** Marques valables pour ce salon (celles d'une autre partie sont ignorées). */
function seenIn(s: TutorialState, room: string): TutorialState['seen'] {
  return s.room === room ? s.seen : {};
}

/** Cette marque est posée dans ce salon. */
export function hasMark(s: TutorialState, room: string, mark: TutorialMark): boolean {
  return seenIn(s, room)[mark] === true;
}

/** Ajoute une marque ; renvoie le même objet si rien ne change (pas de re-rendu inutile). */
export function markSeen(s: TutorialState, room: string, mark: TutorialMark): TutorialState {
  const seen = seenIn(s, room);
  if (s.room === room && seen[mark]) return s;
  return { ...s, room, seen: { ...seen, [mark]: true } };
}

type TutorialView = Pick<PlayerView, 'you' | 'players' | 'companies' | 'config'> & Partial<Pick<PlayerView, 'turn' | 'self' | 'hexes'>>;

/** La partie guidée garde sa liste, même sur le plateau ; sinon la carte de la partie décide. */
export function tutorialKind(view: Pick<PlayerView, 'config'>, s: TutorialState, room: string): TutorialKind {
  if (isGuidedTutorial(s, room)) return 'guided';
  return isSpatialMap(view.config) ? 'hex' : 'classic';
}

/** État de chaque étape, d'après la vue et les marques locales. */
export function tutorialSteps(view: TutorialView, s: TutorialState, room: string): TutorialStep[] {
  const seen = seenIn(s, room);
  const mine = view.companies.filter((c) => c.controllerId === view.you && c.status === 'active');
  const noCompany = mine.length === 0;
  // Ce que la production prévue devra acheter d'urgence, filiales et contrats compris.
  const shortfall = mine.reduce((sum, c) => sum + commodityShortfall(c, view.turn, view.self?.contracts), 0);
  const ready = view.players.find((p) => p.id === view.you)?.ready === true;
  const turn = view.turn ?? 1;
  if (isGuidedTutorial(s, room)) {
    const defs: { id: TutorialStepId; tab: TutorialTab; mark?: TutorialMark; needsCompany?: boolean }[] = turn <= 1 ? [
      { id: 'journal', tab: 'journal', mark: 'journal' },
      { id: 'factories', tab: 'factories', mark: 'factories', needsCompany: true },
      { id: 'comparison', tab: 'factories', mark: 'comparison', needsCompany: true },
      { id: 'decisions', tab: 'factories', mark: 'decisions', needsCompany: true },
      { id: 'commodities', tab: 'commodities', mark: 'commodities', needsCompany: true },
      { id: 'ready', tab: null },
    ] : [
      { id: 'recap', tab: null, mark: 'recap' },
      { id: 'review', tab: 'factories', mark: 'review' },
      { id: 'adjustment', tab: 'factories', mark: 'adjustment', needsCompany: true },
      { id: 'stocks', tab: 'stocks', mark: 'secondStocks' },
      { id: 'launchIntro', tab: 'map', mark: 'launchIntro', needsCompany: true },
      { id: 'ready', tab: null },
    ];
    // Le guide garde « Je suis prêt » à chaque trimestre : l'étape suit le statut du joueur.
    return defs.map(({ id, tab, mark, needsCompany }) => ({ id, tab,
      done: needsCompany && noCompany ? true : id === 'ready' ? ready : seen[mark!] === true,
      ...(needsCompany && noCompany ? { skipped: 'noCompany' as const } : {}),
    }));
  }
  const hex = isSpatialMap(view.config);
  // Plateau : une de ses usines occupe une case (pas une start-up encore à l'incubateur) ; une case libre existe.
  const onBoard = mine.some((c) => c.products.some((p) => !!p.hexId && view.hexes?.occupied[p.hexId] === c.id));
  const freeCell = (view.hexes?.free.length ?? 0) > 0;
  const defs = !hex ? TUTORIAL_STEPS : turn >= 2 ? [...HEX_FIRST_STEPS, ...HEX_SECOND_STEPS] : HEX_FIRST_STEPS;
  return defs.map(({ id, tab, optional }): TutorialStep => {
    const step = { id, tab, ...(optional ? { optional } : {}) };
    switch (id) {
      case 'decisions':
        return noCompany ? { ...step, done: true, skipped: 'noCompany' } : { ...step, done: seen.decisions === true };
      case 'commodities':
        // Rien ne manque (stock suffisant), ou le joueur est allé voir et assume l'achat d'urgence.
        return noCompany ? { ...step, done: true, skipped: 'noCompany' } : { ...step, done: shortfall <= SHORTFALL_EPS || seen.commodities === true };
      case 'ready':
        // Une marque posée au clic : l'étape ne se décoche plus au trimestre suivant.
        return { ...step, done: seen.ready === true || ready };
      case 'ownCell':
        if (noCompany) return { ...step, done: true, skipped: 'noCompany' };
        return onBoard ? { ...step, done: seen.ownCell === true } : { ...step, done: true, skipped: 'noFactoryCell' };
      case 'freeCell':
        return freeCell ? { ...step, done: seen.freeCell === true } : { ...step, done: true, skipped: 'noFreeCell' };
      case 'bidForm':
        if (noCompany) return { ...step, done: true, skipped: 'noCompany' };
        return freeCell ? { ...step, done: seen.bidForm === true } : { ...step, done: true, skipped: 'noFreeCell' };
      default:
        // La une, la Bourse et le bilan : de simples marques de visite ou de lecture.
        return { ...step, done: seen[id] === true };
    }
  });
}

/** Toutes les étapes exigées sont cochées (une étape facultative ne retient pas la liste). */
export function allDone(steps: readonly TutorialStep[]): boolean {
  return steps.every((st) => st.done || st.optional === true);
}

/** Progression affichée : les étapes exigées seulement. */
export function tutorialProgress(steps: readonly TutorialStep[]): { done: number; total: number } {
  const required = steps.filter((st) => !st.optional);
  return { done: required.filter((st) => st.done).length, total: required.length };
}

/** La prochaine étape à faire, dans l'ordre de la liste : d'abord les exigées, puis une facultative ; null sinon. */
export function nextTutorialStep(steps: readonly TutorialStep[]): TutorialStep | null {
  const open = steps.filter((st) => !st.done && !st.skipped);
  return open.find((st) => !st.optional) ?? open[0] ?? null;
}

/**
 * Liste dépliée d'office (tant que le joueur ne l'a pas lui-même pliée ou dépliée) : sur le journal au premier
 * trimestre, et à la première vue après l'arrivée de nouvelles étapes ; ailleurs, une seule ligne.
 */
export function tutorialOpenByDefault(tab: string | undefined, turn: number, grown: boolean): boolean {
  return grown || (tab === 'journal' && turn <= 1);
}

/** La liste du plateau a gagné les étapes du deuxième trimestre et ne les a pas encore montrées. */
export function tutorialGrown(kind: TutorialKind, s: TutorialState, room: string, turn: number): boolean {
  return kind === 'hex' && turn >= 2 && !hasMark(s, room, 'secondQuarter');
}

/**
 * Visible tant que le joueur ne l'a pas fermée. Une fois tout coché, elle reste affichée (félicitations) jusqu'à la
 * fin du trimestre, puis s'efface ; hors partie guidée, elle prend aussi sa retraite à la clôture du deuxième
 * trimestre, sauf si l'aide l'a rouverte dans ce salon.
 */
export function isTutorialVisible(s: TutorialState, room: string, turn: number, hex = false): boolean {
  if (s.dismissed) return false;
  if (isGuidedTutorial(s, room)) return turn <= 2 || s.reviewAgain === true;
  const c = hex ? s.hexCompleted : s.completed;
  if (c && (c.room !== room || c.turn !== turn)) return false;
  return turn <= TUTORIAL_LAST_TURN || s.reopenedRoom === room;
}

/**
 * Note l'achèvement (une seule fois) quand toutes les étapes exigées sont cochées. La liste du plateau attend le
 * deuxième trimestre : au premier, ses étapes suivantes restent à venir.
 */
export function withCompletion(s: TutorialState, room: string, turn: number, steps: readonly TutorialStep[], hex = false): TutorialState {
  if (isGuidedTutorial(s, room)) {
    if (turn <= 1 || s.completed || !allDone(steps)) return s;
    return { ...s, completed: { room, turn }, celebrated: room };
  }
  if (hex) {
    if (turn < 2 || s.hexCompleted || !allDone(steps)) return s;
    return { ...s, hexCompleted: { room, turn }, celebrated: room };
  }
  if (s.completed || !allDone(steps)) return s;
  return { ...s, completed: { room, turn }, celebrated: room };
}

/** Félicitations (toast) : une seule fois par partie, et jamais pour une checklist fermée. */
export function shouldCelebrate(before: TutorialState, room: string): boolean {
  return !before.dismissed && before.celebrated !== room;
}

/**
 * Marques posées quand le joueur ouvre lui-même un onglet (barre d'onglets, bouton de la checklist, lien) :
 * jamais quand la clôture change de trimestre sous un onglet déjà ouvert. Le journal, lui, se coche après
 * quelques secondes de lecture (GameScreen).
 */
export function tabVisitMarks(tab: string, turn: number): TutorialMark[] {
  switch (tab) {
    case 'stocks':
    case 'commodities':
    case 'factories':
      return [tab];
    case 'map':
      return turn >= 2 ? ['launchIntro'] : [];
    default:
      return [];
  }
}

export function dismissTutorial(s: TutorialState): TutorialState {
  return s.dismissed ? s : { ...s, dismissed: true };
}

/**
 * Rouvre la checklist (aide « ? ») sans effacer les étapes déjà faites dans cette partie. Seule la liste de ce salon
 * (classique ou du plateau) oublie son achèvement ; rouverte après sa retraite, elle reste affichée dans ce salon.
 */
export function reopenTutorial(s: TutorialState, turn = 1, room?: string, hex = false): TutorialState {
  const { reviewAgain: _previousReview, reopenedRoom: _previousRoom, hexCompleted, ...rest } = s;
  const late = turn > TUTORIAL_LAST_TURN && room !== undefined && s.guidedRoom !== room;
  return {
    ...rest,
    dismissed: false,
    completed: hex ? s.completed : null,
    ...(!hex && hexCompleted ? { hexCompleted } : {}),
    ...(s.guidedRoom && turn > 2 ? { reviewAgain: true } : {}),
    ...(late ? { reopenedRoom: room } : {}),
  };
}

/** Capture seulement les prévisions des produits dirigés à T1, à partir de la vue redigée. */
export function captureTutorialForecasts(s: TutorialState, room: string, view: PlayerView): TutorialState {
  if (!isGuidedTutorial(s, room) || view.turn !== 1) return s;
  const forecasts = view.companies.filter((c) => c.controllerId === view.you && c.status === 'active').flatMap((c) =>
    c.products.flatMap((p) => p.private?.estimate ? [{ companyId: c.id, productId: p.id, name: p.name,
      sales: p.private.estimate.sales, production: p.private.production }] : []));
  if (JSON.stringify(forecasts) === JSON.stringify(s.forecasts)) return s;
  return { ...s, forecasts };
}

export function tutorialComparisons(view: PlayerView, s: TutorialState, room: string) {
  if (!isGuidedTutorial(s, room)) return [];
  return (s.forecasts ?? []).map((f) => {
    const report = view.companies.find((c) => c.id === f.companyId)?.reports.find((r) => r.turn === 1);
    const product = report?.products.find((p) => p.productId === f.productId);
    return { ...f, actualSales: product?.sold ?? null };
  });
}
