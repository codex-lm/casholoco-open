import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@muchomoney/core';
import { markTutorial } from '../../tutorialStore';
import { latestCloseRecap } from './closeRecap';

/** The preference applies to this browser; read receipts apply to one close in one room. */
export const RECAP_AUTO_DISABLED_KEY = 'casholoco.closeRecap.autoDisabled';
export const RECAP_SEEN_PREFIX = 'casholoco.closeRecap.seen.';
const seenThisVisit = new Set<string>();
let disabledThisVisit = false;
let disabledWriteFailed = false;

export function loadQuarterCloseAutoDisabled(): boolean {
  // A failed write may leave a readable old value behind: the player's current choice takes precedence.
  if (disabledWriteFailed) return disabledThisVisit;
  try {
    const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(RECAP_AUTO_DISABLED_KEY);
    if (value !== null) disabledThisVisit = value === '1';
  } catch {
    // Keep the choice for this visit when browser storage is blocked.
  }
  return disabledThisVisit;
}

export function saveQuarterCloseAutoDisabled(disabled: boolean): void {
  disabledThisVisit = disabled;
  try {
    localStorage.setItem(RECAP_AUTO_DISABLED_KEY, disabled ? '1' : '0');
    disabledWriteFailed = false;
  } catch {
    disabledWriteFailed = true;
    // The in-memory preference also survives a screen remount.
  }
}

/** Claim the first view of this close, even with storage disabled (including React effect replays). */
export function claimQuarterClose(room: string, turn: number): boolean {
  const key = `${RECAP_SEEN_PREFIX}${encodeURIComponent(room)}.${turn}`;
  if (seenThisVisit.has(key)) return false;
  seenThisVisit.add(key);
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1') return false;
    localStorage.setItem(key, '1');
  } catch {
    // seenThisVisit prevents another automatic opening during this visit.
  }
  return true;
}

/** A first-quarter view and a spectator have no closed quarter to open. Old saves use exact fortune history. */
export function quarterCloseAvailable(view: PlayerView): boolean {
  const recap = latestCloseRecap(view);
  return !!recap && view.turn > 1 && recap.turn < view.turn;
}

export function useQuarterCloseWindow(view: PlayerView, room: string) {
  const recap = latestCloseRecap(view);
  const available = quarterCloseAvailable(view);
  const identity = available ? `${room}:${view.you}:${recap!.turn}` : null;
  const [opened, setOpened] = useState<string | null>(null);
  const [disableAutoOpen, setDisabled] = useState(loadQuarterCloseAutoDisabled);
  const lastIdentity = useRef<string | null>(null);

  useEffect(() => {
    if (lastIdentity.current === identity) return;
    lastIdentity.current = identity;
    setOpened(null);
    if (!identity || !recap) return;
    // Disabled quarters are marked as visited too: unchecking the preference does not reopen the current report.
    if (!claimQuarterClose(room, recap.turn) || disableAutoOpen) return;
    setOpened(identity);
    markTutorial('recap');
  }, [identity, room, recap?.turn, disableAutoOpen]);

  const open = () => {
    if (!identity) return;
    setOpened(identity);
    markTutorial('recap');
  };
  const setDisableAutoOpen = (disabled: boolean) => {
    saveQuarterCloseAutoDisabled(disabled);
    setDisabled(disabled);
  };
  return {
    available,
    isOpen: identity !== null && opened === identity,
    open,
    close: () => setOpened(null),
    disableAutoOpen,
    setDisableAutoOpen,
  };
}
