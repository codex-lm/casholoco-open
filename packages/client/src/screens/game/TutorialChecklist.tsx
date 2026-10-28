import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../hooks/useGame';
import { getState, pushToast, useApp } from '../../store';
import { useT } from '../../i18n';
import { useLearning } from '../../i18n/learning';
import { useFmt } from '../../fmt';
import { cx } from '../../util';
import { EMERGENCY_PURCHASE_MARKUP } from '../../rules';
import {
  dismissTutorial, isTutorialVisible, nextTutorialStep, shouldCelebrate, tutorialComparisons, tutorialGrown, tutorialKind,
  tutorialOpenByDefault, tutorialProgress, tutorialSteps, withCompletion,
  type ChecklistStepId, type GuidedStepId, type TutorialSkip, type TutorialMark, type TutorialStep, type TutorialStepId,
} from '../../tutorial';
import { markTutorial, updateTutorial, useTutorialRoom } from '../../tutorialStore';
import { tutorialBidIntent, type BoardCell } from '../../tutorialBoard';
import type { MapIntent } from './mapIntent';
import type { TabId } from '../GameScreen';

/** Place le focus sur le bouton « Je suis prêt » de la barre du haut. */
function focusReady(): void {
  const btn = document.querySelector<HTMLButtonElement>('.topbar-ready button');
  btn?.scrollIntoView({ block: 'nearest' });
  btn?.focus();
}

interface Props {
  goTo: (tab: TabId) => void;
  /** L'étape facultative du plateau ouvre « La carte » sur un formulaire ; sans lui, la carte s'ouvre telle quelle. */
  openMapFor?: (intent: MapIntent) => void;
  /** Les étapes « sa case » et « une case libre » sélectionnent leur case sur la carte (sur place si elle est affichée). */
  showBoardCell?: (cell: BoardCell) => void;
  /** Onglet affiché : la liste est dépliée d'office sur le journal au premier trimestre, une seule ligne ailleurs. */
  tab?: TabId;
  /** Opening the report ticks « Lire le bilan »; its Modal handles focus. */
  openQuarterClose?: () => void;
}

/**
 * Checklist « Vos premiers pas » : discrète, fermable, cochée d'après la vue (voir tutorial.ts). Une seule liste, au-dessus
 * de chaque onglet : dépliée sur le journal au premier trimestre et à la première vue après l'arrivée de nouvelles
 * étapes, une ligne ailleurs (titre, progression, prochaine étape et son bouton). Le pliage choisi par le joueur tient
 * d'un onglet à l'autre (le composant reste monté). La partie guidée garde sa liste dépliée.
 */
export function TutorialChecklist({ goTo, openMapFor, showBoardCell, tab, openQuarterClose }: Props) {
  const { view } = useGame();
  const t = useT();
  const learning = useLearning();
  const fmt = useFmt();
  const state = useApp((s) => s.tutorial);
  const room = useTutorialRoom();
  const kind = tutorialKind(view, state, room);
  const guided = kind === 'guided';
  const hex = kind === 'hex';
  const steps = useMemo(() => tutorialSteps(view, state, room), [view, state, room]);
  const comparisons = tutorialComparisons(view, state, room);
  const visible = isTutorialVisible(state, room, view.turn, hex);
  const title = guided ? learning.title(view.turn) : t.tutorial.title;
  const card = useRef<HTMLElement>(null);
  // Pliage choisi par le joueur (▸ / ▾) ; null : celui d'office.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  // La liste vient de gagner des étapes : dépliée jusqu'au prochain changement d'onglet.
  const grown = visible && tutorialGrown(kind, state, room, view.turn);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!grown) return;
    setFresh(true);
    setManualOpen(null);
    markTutorial('secondQuarter');
  }, [grown]);
  const lastTab = useRef(tab);
  useEffect(() => {
    if (lastTab.current === tab) return;
    lastTab.current = tab;
    setFresh(false);
  }, [tab]);
  // « Revoir les premiers pas » (aide « ? ») : dépliée et amenée sous les yeux, qu'elle ait été fermée ou seulement
  // repliée sur sa ligne. Chaque demande est comptée (store) ; celles d'avant le montage sont déjà servies.
  const reopenSeq = useApp((s) => s.tutorialReopen);
  const servedReopen = useRef(reopenSeq);
  useEffect(() => {
    if (servedReopen.current === reopenSeq || !visible) return;
    servedReopen.current = reopenSeq;
    setManualOpen(true);
    card.current?.scrollIntoView?.({ block: 'nearest' });
    card.current?.focus?.({ preventScroll: true });
  }, [reopenSeq, visible]);
  // Une étape cochée par son propre bouton (« Garder ces réglages », une case du plateau) peut le faire disparaître :
  // si le focus retombe alors sur la page, il passe au bouton de l'étape suivante, à défaut au bouton de pliage.
  const focusAfterTick = useRef<TutorialStepId | null>(null);
  useEffect(() => {
    const id = focusAfterTick.current;
    if (!id || !steps.find((step) => step.id === id)?.done) return;
    focusAfterTick.current = null;
    const root = card.current;
    if (!root || typeof document === 'undefined') return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const following = nextTutorialStep(steps);
    const target = (following
      ? root.querySelector<HTMLElement>(`[data-tutorial-step="${following.id}"] button, [data-tutorial-next="${following.id}"]`)
      : null) ?? root.querySelector<HTMLElement>('.tutorial-toggle');
    target?.focus({ preventScroll: true });
  });

  // Tout coché : on le note, la checklist s'effacera au trimestre suivant.
  // Un toast le dit aussi : seul humain du salon, « Je suis prêt » clôt aussitôt le trimestre
  // et la checklist disparaît avant qu'on ait pu lire ses félicitations. Une seule fois par partie :
  // rouvrir la checklist depuis l'aide ne relance pas les félicitations.
  useEffect(() => {
    const cur = getState().tutorial;
    const next = withCompletion(cur, room, view.turn, steps, hex);
    if (next === cur) return;
    updateTutorial(() => next);
    if (shouldCelebrate(cur, room)) pushToast('good', guided ? learning.allDone : hex ? t.tutorial.hexAllDone : t.tutorial.allDone);
  }, [steps, room, view.turn, t, guided, hex, learning]);

  if (!visible) return null;

  const expanded = guided ? manualOpen ?? true : manualOpen ?? tutorialOpenByDefault(tab, view.turn, grown || fresh);
  const progress = tutorialProgress(steps);
  const premium = fmt.pct(EMERGENCY_PURCHASE_MARKUP - 1, 0);
  const finished = progress.done === progress.total;
  const doneText = guided ? learning.allDone : hex && view.turn < 2 ? t.tutorial.firstQuarterDone : hex ? t.tutorial.hexAllDone : t.tutorial.allDone;
  const skipText = (skip: TutorialSkip) => skip === 'noFactoryCell' ? t.tutorial.skippedNoFactory : skip === 'noFreeCell' ? t.tutorial.skippedNoFree : t.tutorial.skipped;
  const text = (step: TutorialStep) => guided ? learning.steps[step.id as GuidedStepId] : t.tutorial.steps[step.id as ChecklistStepId];
  const map = (intent: MapIntent | null) => {
    if (intent && openMapFor) openMapFor(intent);
    else goTo('map');
  };
  const cell = (which: BoardCell) => {
    if (showBoardCell) showBoardCell(which);
    else goTo('map');
  };
  /** Coche une étape depuis son propre bouton, qui disparaît avec elle : le focus suit (voir focusAfterTick). */
  const tick = (id: TutorialStepId, mark: TutorialMark) => {
    focusAfterTick.current = id;
    markTutorial(mark);
  };
  const open = (step: TutorialStep) => {
    focusAfterTick.current = step.id === 'ownCell' || step.id === 'freeCell' ? step.id : null;
    switch (step.id) {
      case 'recap': {
        if (openQuarterClose) openQuarterClose();
        else document.querySelector<HTMLButtonElement>('[data-reopen-quarter-close]')?.click();
        return;
      }
      // Le plateau : la carte sélectionne sa propre usine ou la meilleure case libre (sur place si elle est déjà
      // affichée), ou s'ouvre sur un formulaire de lancement (de déménagement sans emplacement libre) qui n'envoie rien.
      case 'ownCell':
        return cell('own');
      case 'freeCell':
        return cell('bestFree');
      case 'bidForm':
        return map(tutorialBidIntent(view));
      default:
        if (step.tab) goTo(step.tab);
        else focusReady();
    }
  };
  const next = guided ? null : nextTutorialStep(steps);

  return (
    <aside ref={card} tabIndex={-1} className={cx('tutorial', !expanded && 'collapsed')} aria-label={title}>
      <header className="tutorial-head">
        <button type="button" className="tutorial-toggle" aria-expanded={expanded} onClick={() => setManualOpen(!expanded)}>
          <strong>{title}</strong> <span className="muted small">{t.tutorial.progress(progress.done, progress.total)}</span>
          <span className="muted small" aria-hidden>
            {expanded ? ' ▾' : ' ▸'}
          </span>
          <span className="sr-only">{expanded ? t.tutorial.collapse : t.tutorial.expand}</span>
        </button>
        {!expanded && !guided && (
          <p className="tutorial-next small">
            {next ? (
              <>
                <span>· {t.tutorial.nextStep(text(next).label)}</span>
                <button type="button" className="btn tiny ghost" data-tutorial-next={next.id} onClick={() => open(next)}>
                  {text(next).go}
                </button>
              </>
            ) : finished && <span className="tutorial-done">· {doneText}</span>}
          </p>
        )}
        <button type="button" className="btn-icon" onClick={() => updateTutorial(dismissTutorial)} aria-label={t.tutorial.close} title={t.tutorial.close}>
          ✕
        </button>
      </header>
      {expanded && (
        <>
          <p className="small tutorial-guide">{guided ? learning.intro(view.turn) : t.tutorial.moneyGuide}</p>
          <ol className="tutorial-steps">
            {steps.map((step) => {
              const txt = text(step);
              const hint = typeof txt.hint === 'function' ? txt.hint(premium) : txt.hint;
              // Sur le plateau, une étape faite se réduit à son libellé : au deuxième trimestre, la liste a grandi.
              const brief = hex && step.done && !step.skipped;
              return (
                <li key={step.id} className={cx(step.done && 'done')} data-tutorial-step={step.id}>
                  <span className="tutorial-check" aria-hidden>
                    {step.done ? '✓' : '○'}
                  </span>
                  <div className="grow">
                    <div className="tutorial-label">
                      {txt.label}
                      <span className="sr-only"> {step.done ? t.tutorial.stepDone : t.tutorial.stepTodo}</span>
                    </div>
                    {!brief && <div className="small muted">{step.skipped ? skipText(step.skipped) : hint}</div>}
                    {guided && step.id === 'review' && (
                      <>
                        {comparisons.length > 0 ? (
                          <table className="table small" aria-label={txt.label}>
                            <thead><tr><th>{learning.product}</th><th className="num">{learning.forecast}</th><th className="num">{learning.actual}</th></tr></thead>
                            <tbody>{comparisons.map((row) => (
                              <tr key={row.productId}><th scope="row">{row.name}</th><td className="num">{fmt.num(row.sales)}</td><td className="num">{row.actualSales === null ? '—' : fmt.num(row.actualSales)}</td></tr>
                            ))}</tbody>
                          </table>
                        ) : <p className="small muted">{learning.noForecast}</p>}
                        <p className="small muted">{learning.forecastNote}</p>
                      </>
                    )}
                    {guided && !step.done && !step.skipped && (step.id === 'review' || (step.id === 'comparison' && state.seen.factories)) && (
                      <button type="button" className="btn tiny ghost" onClick={() => tick(step.id, step.id === 'review' ? 'review' : 'comparison')}>
                        {learning.compared}
                      </button>
                    )}
                    {/* Les réglages proposés peuvent être les bons : les garder coche l'étape, sans rien envoyer. */}
                    {!guided && step.id === 'decisions' && !step.done && !step.skipped && (
                      <button type="button" className="btn tiny ghost" data-tutorial-keep onClick={() => tick('decisions', 'decisions')}>
                        {t.tutorial.keep}
                      </button>
                    )}
                  </div>
                  {!step.skipped && !brief && (
                    <button type="button" className="btn tiny ghost" onClick={() => open(step)}>
                      {txt.go}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {finished && <p className="small tutorial-done">{doneText}</p>}
        </>
      )}
    </aside>
  );
}
