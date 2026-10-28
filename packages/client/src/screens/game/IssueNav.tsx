/**
 * Navigation entre les numéros du journal (§12) : la frise a déménagé sous le graphique des
 * fortunes (onglet Classement) ; ici, une barre dans la langue de l'interface — numéro précédent /
 * liste des numéros (le plus récent d'abord, « · vous concerne » si un de ses événements me lie) /
 * numéro suivant, retour à l'édition du jour depuis une archive, et lien vers la chronologie.
 */
import { useMemo } from 'react';
import type { JournalIssue } from '@muchomoney/core';
import { useGame } from '../../hooks/useGame';
import { useT, useUiLang } from '../../i18n';
import { timelineEntries } from './timeline/model';

interface Props {
  /** Numéro affiché (peut être une archive). */
  issue: JournalIssue;
  /** Vrai si c'est l'édition du jour. */
  isCurrent: boolean;
  /** Choisir un numéro ; null = revenir à l'édition du jour (qui suit les parutions). */
  onSelect: (turn: number | null) => void;
  /** Ouvrir la chronologie (onglet Classement) sur le trimestre du numéro affiché. */
  onTimeline?: (turn: number) => void;
}

export function IssueNav({ issue, isCurrent, onSelect, onTimeline }: Props) {
  const { view } = useGame();
  const ui = useT();
  const uiLang = useUiLang();
  const issues = view.journal;
  const latest = issues[issues.length - 1];
  const index = issues.findIndex((i) => i.turn === issue.turn);
  const prev = index > 0 ? issues[index - 1] : undefined;
  const next = index >= 0 ? issues[index + 1] : undefined;

  // « Vous concerne » : le numéro rapporte au moins un événement qui me lie (acteur, sujet, ou
  // entreprise que je dirigeais à l'époque) — la même notion que la frise de la chronologie.
  const mine = useMemo(() => {
    const turns = new Set<number>();
    for (const entry of timelineEntries(view)) if (entry.role !== null) turns.add(entry.turn);
    return turns;
  }, [view]);

  const pick = (value: string) => {
    const turn = Number(value);
    // Le dernier numéro se demande par null : il suit alors les numéros à paraître.
    onSelect(latest && turn === latest.turn ? null : turn);
  };

  const prevTurn = prev?.turn ?? issue.turn - 1;
  const nextTurn = next?.turn ?? issue.turn + 1;

  return (
    <div className="issue-nav" lang={uiLang}>
      <button
        type="button"
        className="btn tiny"
        aria-label={ui.journal.nav.prev}
        disabled={!prev}
        onClick={() => prev && onSelect(prev.turn)}
      >
        ◀{prevTurn >= 1 ? ` ${ui.journal.issueNo(prevTurn)}` : ''}
      </button>
      <select
        className="issue-nav-select"
        aria-label={ui.journal.archives}
        value={issue.turn}
        onChange={(e) => pick(e.target.value)}
      >
        {[...issues].reverse().map((i) => (
          <option key={i.turn} value={i.turn}>
            {ui.journal.nav.issue(i.turn, i.dateLabel)}
            {i === latest ? ` (${ui.journal.today})` : ''}
            {mine.has(i.turn) ? ui.journal.nav.concernsYou : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn tiny"
        aria-label={ui.journal.nav.next}
        disabled={!next}
        onClick={() => next && onSelect(next.turn)}
      >
        {ui.journal.issueNo(nextTurn)} ▶
      </button>
      {!isCurrent && (
        <button type="button" className="btn tiny ghost" onClick={() => onSelect(null)}>
          {ui.journal.nav.today}
        </button>
      )}
      {onTimeline && (
        <button type="button" className="issue-nav-link" onClick={() => onTimeline(issue.turn)}>
          {ui.journal.nav.toTimeline} →
        </button>
      )}
    </div>
  );
}
