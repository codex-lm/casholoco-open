/**
 * One-time explanations on the hex cell sheets (starting terrain, ordinary free cell, deposit): each kind is shown on
 * its first explicit selection, then never again in this browser. Local UI memory only, never game or engine state.
 */
import { hexById, isSpatialMap, type PlayerView } from '@muchomoney/core';
import { hexIsBuildable } from './screens/game/city/hexModel';

export const CELL_NOTES_KEY = 'muchomoney:cellNotes';
/** The former board tour kept these notes with its own progress; only the notes are carried over. */
export const LEGACY_BOARD_TOUR_KEY = 'muchomoney:boardTour';

export const CELL_NOTE_KINDS = ['terrain', 'free', 'deposit'] as const;
export type CellNoteKind = typeof CELL_NOTE_KINDS[number];
export type CellNotesSeen = Partial<Record<CellNoteKind, true>>;

/** Unknown kinds and non-boolean values never consume a note; unreadable values give a fresh memory. */
export function parseCellNotes(raw: string | null | undefined): CellNotesSeen {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const stored = value as Partial<Record<string, unknown>>;
    const seen: CellNotesSeen = {};
    for (const kind of CELL_NOTE_KINDS) if (stored[kind] === true) seen[kind] = true;
    return seen;
  } catch {
    return {};
  }
}

/** The notes the former board tour had already shown (`{ notes: { terrain: true, … } }`); its steps are ignored. */
export function parseLegacyCellNotes(raw: string | null | undefined): CellNotesSeen {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    const notes = value && typeof value === 'object' && !Array.isArray(value) ? (value as { notes?: unknown }).notes : undefined;
    return notes && typeof notes === 'object' ? parseCellNotes(JSON.stringify(notes)) : {};
  } catch {
    return {};
  }
}

export function loadCellNotes(): CellNotesSeen {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CELL_NOTES_KEY);
    return raw !== null ? parseCellNotes(raw) : parseLegacyCellNotes(localStorage.getItem(LEGACY_BOARD_TOUR_KEY));
  } catch {
    return {};
  }
}

export function saveCellNotes(seen: CellNotesSeen): void {
  try {
    localStorage.setItem(CELL_NOTES_KEY, JSON.stringify(seen));
  } catch {
    // Private browsing or unavailable storage: the notes stay remembered for the current visit.
  }
}

let seen = loadCellNotes();

export function getCellNotes(): CellNotesSeen {
  return seen;
}

/** Replaces the remembered notes (and saves them), e.g. to start a test from a known memory. */
export function replaceCellNotes(next: CellNotesSeen): void {
  seen = next;
  saveCellNotes(next);
}

export function hasSeenCellNote(kind: CellNoteKind): boolean {
  return seen[kind] === true;
}

/** Call only when the note is actually displayed. */
export function rememberCellNote(kind: CellNoteKind): void {
  if (!CELL_NOTE_KINDS.includes(kind) || seen[kind]) return;
  replaceCellNotes({ ...seen, [kind]: true });
}

/** The notes are for a participant of a hex game, never for a spectator or on the classic map. */
export function cellNotesEligible(view: PlayerView): boolean {
  return isSpatialMap(view.config) && !!view.self && view.players.some((p) => p.id === view.you);
}

/** The kind of note a cell would explain, if any: deposit, starting terrain or ordinary free buildable cell. */
export function cellNoteKind(view: PlayerView, hexId: string): CellNoteKind | null {
  if (!cellNotesEligible(view)) return null;
  const hex = hexById(hexId);
  if (!hex) return null;
  if (hex.deposit) return 'deposit';
  if (view.terrains?.some((terrain) => terrain.hex === hexId)) return 'terrain';
  return hexIsBuildable(hexId) && view.hexes?.free.includes(hexId) ? 'free' : null;
}
