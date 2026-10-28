import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEXES, createGame, getPlayerView } from '@muchomoney/core';
import {
  CELL_NOTES_KEY, CELL_NOTE_KINDS, LEGACY_BOARD_TOUR_KEY,
  cellNoteKind, getCellNotes, hasSeenCellNote, loadCellNotes, parseCellNotes, parseLegacyCellNotes, rememberCellNote, replaceCellNotes, saveCellNotes,
  type CellNoteKind,
} from '../src/cellNotes';
import { cellNoteMessages } from '../src/i18n/cellNotes';

const initial = getCellNotes();
afterEach(() => {
  vi.unstubAllGlobals();
  replaceCellNotes(initial);
});

describe('one-time cell notes: their own memory, without the former board tour', () => {
  it('remembers each kind independently, once', () => {
    replaceCellNotes({});
    for (const kind of CELL_NOTE_KINDS) {
      expect(hasSeenCellNote(kind)).toBe(false);
      rememberCellNote(kind);
      expect(hasSeenCellNote(kind)).toBe(true);
      const before = getCellNotes();
      rememberCellNote(kind);
      expect(getCellNotes()).toBe(before);
    }
    expect(getCellNotes()).toEqual({ terrain: true, free: true, deposit: true });
  });

  it('ignores unknown kinds and non-boolean values', () => {
    replaceCellNotes({});
    rememberCellNote('invented' as CellNoteKind);
    expect(getCellNotes()).toEqual({});
    expect(parseCellNotes(JSON.stringify({ terrain: true, free: 'true', deposit: 1, invented: true }))).toEqual({ terrain: true });
  });

  it.each([null, '', 'null', '42', '[]', '{invalid'])('treats unreadable saved notes %s as fresh', (raw) => {
    expect(parseCellNotes(raw)).toEqual({});
    expect(parseLegacyCellNotes(raw)).toEqual({});
  });

  it('carries over the notes the former board tour had shown, and nothing else from it', () => {
    const legacy = JSON.stringify({ dismissed: true, completed: false, expanded: true, steps: { factory: true, lens: true }, notes: { terrain: true, deposit: 'yes' } });
    expect(parseLegacyCellNotes(legacy)).toEqual({ terrain: true });
    const storage = new Map([[LEGACY_BOARD_TOUR_KEY, legacy]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null });
    expect(loadCellNotes()).toEqual({ terrain: true });
    // Once the new memory exists, the old key is no longer read.
    storage.set(CELL_NOTES_KEY, JSON.stringify({ free: true }));
    expect(loadCellNotes()).toEqual({ free: true });
  });

  it('saves browser-wide under its own key', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    saveCellNotes({ terrain: true });
    expect(setItem).toHaveBeenCalledWith(CELL_NOTES_KEY, JSON.stringify({ terrain: true }));
  });

  it('unavailable storage never prevents remembering a note for this visit', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
    expect(loadCellNotes()).toEqual({});
    replaceCellNotes({});
    expect(() => rememberCellNote('free')).not.toThrow();
    expect(hasSeenCellNote('free')).toBe(true);
  });

  it('names the kind of a hex cell for a participant only, never on the classic map or for a spectator', () => {
    const players = [
      { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets' as const, connected: true, color: '#123456' },
      { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts' as const, connected: true, color: '#abcdef' },
    ];
    const game = createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr', mapMode: 'hex', terrainAssignment: 'fair' }, players);
    const view = getPlayerView(game, 'human');
    const ordinary = view.hexes!.free.find((id) => !view.terrains?.some((terrain) => terrain.hex === id))!;
    expect(cellNoteKind(view, view.terrains![0].hex)).toBe('terrain');
    expect(cellNoteKind(view, ordinary)).toBe('free');
    expect(cellNoteKind(view, HEXES.find((hex) => hex.deposit)!.id)).toBe('deposit');
    expect(cellNoteKind(view, 'off-board')).toBeNull();
    expect(cellNoteKind(getPlayerView(game, 'spectator'), ordinary)).toBeNull();
    const classic = getPlayerView(createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr' }, players), 'human');
    expect(cellNoteKind(classic, ordinary)).toBeNull();
  });
});

describe('one-time cell notes: bilingual copy', () => {
  it('has the same notes in both languages', () => {
    expect(Object.keys(cellNoteMessages('fr'))).toEqual([...CELL_NOTE_KINDS]);
    expect(Object.keys(cellNoteMessages('en'))).toEqual([...CELL_NOTE_KINDS]);
    expect(cellNoteMessages(undefined)).toBe(cellNoteMessages('fr'));
  });

  it('uses vous in French and describes terrain, free cells and deposits correctly', () => {
    const fr = cellNoteMessages('fr');
    expect(JSON.stringify(fr)).not.toMatch(/\btu\b/i);
    expect(fr.terrain).toContain('usine de départ');
    expect(fr.terrain).toContain('perdus pour de bon');
    expect(fr.free).toContain('aucun privilège');
    expect(fr.deposit).toContain('pas une usine');
    expect(cellNoteMessages('en').terrain).toContain('starting factory');
    expect(cellNoteMessages('en').deposit).toContain('not a factory');
  });

  it('keeps each one-time note about its own cell kind, in 30 words at most', () => {
    // The other kinds are never compared in the note: each sheet says what its own cell is.
    const others = {
      fr: { terrain: /gisement|case ordinaire/i, free: /gisement|terrain de départ/i, deposit: /terrain de départ|case (?:constructible|ordinaire)/i },
      en: { terrain: /deposit|ordinary cell/i, free: /deposit|starting terrain/i, deposit: /starting terrain|ordinary (?:buildable )?cell/i },
    } as const;
    for (const lang of ['fr', 'en'] as const) {
      for (const kind of CELL_NOTE_KINDS) {
        const note = cellNoteMessages(lang)[kind];
        expect(note.split(/\s+/).filter((word) => /\p{L}|\d/u.test(word)).length, `${lang}.${kind}`).toBeLessThanOrEqual(30);
        expect(note, `${lang}.${kind}`).not.toMatch(others[lang][kind]);
      }
    }
  });
});
