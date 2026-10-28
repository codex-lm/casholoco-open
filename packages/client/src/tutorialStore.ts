/** Branchement de la checklist (tutorial.ts) sur le store et le localStorage. */
import type { PlayerView } from '@muchomoney/core';
import { getState, setState, useApp } from './store';
import { captureTutorialForecasts, isGuidedTutorial, markSeen, reopenTutorial, saveTutorial, startGuidedTutorial, tabVisitMarks, tutorialKind, type TutorialMark, type TutorialState } from './tutorial';

/** Salon courant (les marques d'une autre partie sont ignorées). */
export function tutorialRoom(): string {
  return getState().session?.roomCode ?? 'local';
}

export function useTutorialRoom(): string {
  return useApp((s) => s.session?.roomCode ?? 'local');
}

export function updateTutorial(fn: (s: TutorialState) => TutorialState): void {
  const cur = getState().tutorial;
  const next = fn(cur);
  if (next === cur) return;
  saveTutorial(next);
  setState({ tutorial: next });
}

export function markTutorial(mark: TutorialMark): void {
  const room = tutorialRoom();
  const turn = getState().view?.turn ?? 1;
  updateTutorial((s) => markSeen(s, room, isGuidedTutorial(s, room) && turn >= 2
    ? mark === 'decisions' ? 'adjustment' : mark === 'stocks' ? 'secondStocks' : mark
    : mark));
}

/** Le joueur vient d'ouvrir cet onglet (clic, bouton de la checklist ou lien) : coche les étapes correspondantes. */
export function markTabVisit(tab: string): void {
  for (const mark of tabVisitMarks(tab, getState().view?.turn ?? 1)) markTutorial(mark);
}

export function enableGuidedTutorial(room: string): void {
  updateTutorial(() => startGuidedTutorial(room));
}

export function rememberTutorialForecasts(view: PlayerView): void {
  updateTutorial((s) => captureTutorialForecasts(s, tutorialRoom(), view));
}

export function openHelp(): void {
  setState({ helpOpen: true });
}

export function closeHelp(): void {
  setState({ helpOpen: false });
}

/**
 * Depuis l'aide : réaffiche la checklist de ce salon et ferme la fenêtre. La demande est comptée à part : même une
 * liste déjà visible (repliée sur une ligne) se déplie et vient à l'écran (voir TutorialChecklist).
 */
export function showTutorialAgain(): void {
  const view = getState().view;
  const room = tutorialRoom();
  updateTutorial((s) => reopenTutorial(s, view?.turn, room, !!view && tutorialKind(view, s, room) === 'hex'));
  setState((s) => ({ helpOpen: false, tutorialReopen: s.tutorialReopen + 1 }));
}
