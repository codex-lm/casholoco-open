import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PLAYER_COLORS, createGame, getPlayerView, type Article, type ArticleEvent, type LobbyPlayer, type PlayerView } from '@muchomoney/core';
import { EVENT_STINGS, MUSIC_IDS, PLAYLISTS, STING_IDS, gamePhase, musicContext, musicUrl, stingUrl, stingsFor } from '../src/audio/catalog';
import { DEFAULT_AUDIO, parseAudioSettings } from '../src/audio/settings';
import { SoundButton } from '../src/components/SoundButton';
import { messages } from '../src/i18n';
import type { AppState } from '../src/store';

// Rendu hors navigateur : le store se lit tel quel (pas d'abonnement React).
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

function seat(id: string, name: string, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName: `${name} SA`, sectorId: 'gadgets', connected: true, color: PLAYER_COLORS[i] };
}

/** Deux joueurs, la vue d'Ada. */
function adaView(): PlayerView {
  const g = createGame({ seed: 3, totalTurns: 16, turnSeconds: 90, startYear: 2027 }, [seat('ada', 'Ada', 0), seat('bob', 'Bob', 1)]);
  return getPlayerView(g, 'ada');
}

let articleSeq = 0;

/** La même vue, avec un article de plus dans le numéro du jour. */
function withArticle(v: PlayerView, event: ArticleEvent, companyIds?: string[]): PlayerView {
  const next = structuredClone(v);
  const a: Article = { id: `test-${++articleSeq}`, title: 't', body: 'b', tone: 'drama', kind: 'flash', event, ...(companyIds ? { companyIds } : {}) };
  next.journal.at(-1)!.articles.push(a);
  return next;
}

describe('son : la musique suit l’écran et l’avancée de la partie', () => {
  it('trois tiers puis le dernier trimestre à part, quelle que soit la durée de la partie', () => {
    const phases = (total: number) => Array.from({ length: total }, (_, i) => gamePhase(i + 1, total));
    expect(phases(16)).toEqual([...Array(5).fill('early'), ...Array(5).fill('mid'), ...Array(5).fill('late'), 'final']);
    for (const total of [8, 12, 24]) {
      const p = phases(total);
      expect(p.at(-1)).toBe('final');
      expect(p.filter((x) => x === 'final')).toHaveLength(1);
      const order = ['early', 'mid', 'late', 'final'];
      for (let i = 1; i < p.length; i++) expect(order.indexOf(p[i])).toBeGreaterThanOrEqual(order.indexOf(p[i - 1]));
      for (const phase of ['early', 'mid', 'late']) expect(p).toContain(phase);
    }
  });

  it('accueil, salon, partie, attente de reprise d’un bot, fin', () => {
    const v = adaView();
    expect(musicContext(null, null)).toBe('home');
    expect(musicContext(null, { code: 'X' } as never)).toBe('lobby');
    expect(musicContext(v, null)).toBe('early');
    expect(musicContext({ ...v, turn: 16 }, null)).toBe('final');
    expect(musicContext({ ...v, phase: 'finished' }, null)).toBe('end');
    const waiting = structuredClone(v);
    waiting.players.find((p) => p.id === 'ada')!.botTakeover = { previousName: 'Bot', activeFromTurn: 2 };
    expect(musicContext(waiting, null)).toBe('lobby');
  });

  it('chaque musique a sa place dans une seule playlist, et chaque fichier existe', () => {
    const used = Object.values(PLAYLISTS).flat();
    expect([...used].sort()).toEqual([...MUSIC_IDS].sort());
    for (const id of MUSIC_IDS) expect(existsSync(`${PUBLIC}${musicUrl(id)}`), id).toBe(true);
    for (const id of STING_IDS) expect(existsSync(`${PUBLIC}${stingUrl(id)}`), id).toBe(true);
    // Rien d'inutile dans le dossier servi.
    expect(readdirSync(`${PUBLIC}/audio/music`).sort()).toEqual(MUSIC_IDS.map((id) => `${id}.mp3`).sort());
    expect(readdirSync(`${PUBLIC}/audio/sting`).sort()).toEqual(STING_IDS.map((id) => `${id}.mp3`).sort());
    for (const s of Object.values(EVENT_STINGS)) if (s) expect(STING_IDS).toContain(s);
  });
});

describe('son : les ponctuations', () => {
  it('le jingle au lancement de la partie (pas à une reconnexion)', () => {
    const v = adaView();
    expect(stingsFor(null, v, true)).toEqual(['jingle_crooner']);
    expect(stingsFor(null, v, false)).toEqual([]);
  });

  it('le journal à chaque nouveau trimestre, puis le coup le plus grave qui touche le joueur', () => {
    const v = adaView();
    const next = { ...structuredClone(v), turn: v.turn + 1 };
    expect(stingsFor(v, next, false)).toEqual(['sting_journal']);
    const mine = v.companies.find((c) => c.controllerId === 'ada')!.id;
    const bobs = v.companies.find((c) => c.controllerId === 'bob')!.id;
    // Ada rachète Bob : ça la regarde.
    expect(stingsFor(v, withArticle(v, { type: 'takeover', actorId: 'ada' }, [bobs]), false)).toEqual(['sting_takeover']);
    // Un scandale chez Bob, qui ne la regarde pas : rien.
    expect(stingsFor(v, withArticle(v, { type: 'scandal', leaderId: 'bob' }, [bobs]), false)).toEqual([]);
    // Un lanceur d'alerte vise son entreprise (sans auteur nommé) : ponctuation.
    expect(stingsFor(v, withArticle(v, { type: 'whistleblow' }, [mine]), false)).toEqual(['sting_whistleblower']);
    // Deux coups à la fois : le plus grave l'emporte, après le journal.
    const both = withArticle(withArticle({ ...v, turn: v.turn }, { type: 'bigProfit', leaderId: 'ada' }, [mine]), { type: 'bankruptcy', subjectId: 'ada' }, [mine]);
    expect(stingsFor(v, { ...both, turn: v.turn + 1 }, false)).toEqual(['sting_journal', 'sting_bankruptcy']);
    // Un événement sans son (rachat d'actions) : rien.
    expect(stingsFor(v, withArticle(v, { type: 'buyback', actorId: 'ada' }, [mine]), false)).toEqual([]);
  });

  it('un article déjà vu ne sonne pas deux fois', () => {
    const v = adaView();
    const once = withArticle(v, { type: 'siteOpened', actorId: 'ada', commodityId: 'sugar' });
    expect(stingsFor(v, once, false)).toEqual(['sting_auction']);
    expect(stingsFor(once, structuredClone(once), false)).toEqual([]);
  });

  it('fanfare pour le vainqueur, trombone triste pour les autres', () => {
    const v = adaView();
    const end = (first: string): PlayerView => ({ ...structuredClone(v), phase: 'finished', results: { ranking: [{ playerId: first, netWorth: 1 }], trophies: [] } });
    expect(stingsFor(v, end('ada'), false)).toEqual(['victory_fanfare']);
    expect(stingsFor(v, end('bob'), false)).toEqual(['defeat_jingle']);
  });
});

describe('son : réglages', () => {
  it('lit les réglages mémorisés, bornés, et retombe sur les valeurs par défaut', () => {
    expect(parseAudioSettings(null)).toEqual(DEFAULT_AUDIO);
    expect(parseAudioSettings('pas du json')).toEqual(DEFAULT_AUDIO);
    expect(parseAudioSettings('42')).toEqual(DEFAULT_AUDIO);
    expect(parseAudioSettings(JSON.stringify({ muted: true, music: 2, sfx: -1 }))).toEqual({ muted: true, music: 1, sfx: 0 });
    expect(parseAudioSettings(JSON.stringify({ muted: 'oui', music: 'fort', sfx: 0.25 }))).toEqual({ ...DEFAULT_AUDIO, sfx: 0.25 });
  });

  it('le bouton son dit s’il est coupé, en français comme en anglais', () => {
    for (const lang of ['fr', 'en'] as const) {
      const t = messages(lang);
      expect(t.sound.button(true)).not.toBe(t.sound.button(false));
    }
    const html = renderToStaticMarkup(createElement(SoundButton));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('sound-btn');
  });
});
