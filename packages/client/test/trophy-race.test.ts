import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerStats, PlayerView, PublicPlayer } from '@muchomoney/core';
import { getContent } from '@muchomoney/core';
import { trophyLeadChanges, trophyLeaders, type TrophyLead } from '../src/screens/game/trophyRace';
import { notifyViewChanges } from '../src/notifications';
import { formatTrophyValue } from '../src/screens/trophyValue';
import { getState, pushToast, setState } from '../src/store';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';

// Le vrai pushToast appelle window.setTimeout, absent de l'environnement node :
// on ne remplace que lui, tout le reste (getState/setState, dont t() dépend) reste réel.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, pushToast: vi.fn() };
});

const initialState = getState();
afterEach(() => {
  setState(initialState);
  vi.mocked(pushToast).mockClear();
});

const zeroStats = (): PlayerStats => ({
  shadyActions: 0,
  scandals: 0,
  finesPaid: 0,
  takeoversWon: 0,
  takeoversSuffered: 0,
  parachutes: 0,
  rndSpent: 0,
  marketingSpent: 0,
  oilConsumed: 0,
  bonusesTaken: 0,
  dividendsReceived: 0,
  startupsFounded: 0,
  worstTurnLoss: 0,
  bankruptcies: 0,
});

function mkPlayer(id: string, netWorth: number, statsOver: Partial<PlayerStats> = {}): PublicPlayer {
  return { id, name: `Joueur ${id}`, netWorth, stats: { ...zeroStats(), ...statsOver } } as unknown as PublicPlayer;
}

function mkView(you: string, players: PublicPlayer[]): PlayerView {
  return { you, players, companies: [], config: { lang: 'fr' }, phase: 'playing' } as unknown as PlayerView;
}

function lead(view: PlayerView, trophyId: string, all = false): TrophyLead | undefined {
  return trophyLeaders(view, all ? { all: true } : undefined).find((l) => l.trophyId === trophyId);
}

describe('course aux trophées — trophyLeaders', () => {
  it('le plus grand gagne : pétrole 100 contre 99 → meneur et valeur', () => {
    const view = mkView('c', [mkPlayer('a', 100, { oilConsumed: 100 }), mkPlayer('b', 200, { oilConsumed: 99 })]);
    const l = lead(view, 'pollueur')!;
    expect(l).toBeDefined();
    expect(l.leaderId).toBe('a');
    expect(l.value).toBe(100);
  });

  it('à stat égale, le mieux classé (valeur nette) mène ; à valeur nette égale, le plus petit id', () => {
    let view = mkView('c', [mkPlayer('b', 100, { oilConsumed: 50 }), mkPlayer('a', 200, { oilConsumed: 50 })]);
    expect(lead(view, 'pollueur')!.leaderId).toBe('a');
    view = mkView('c', [mkPlayer('z', 100, { oilConsumed: 50 }), mkPlayer('y', 100, { oilConsumed: 50 })]);
    expect(lead(view, 'pollueur')!.leaderId).toBe('y');
  });

  it('magnat et machiavel ne sont jamais listés, même avec { all: true } et des actions discutables', () => {
    const view = mkView('a', [mkPlayer('a', 1000, { shadyActions: 7, oilConsumed: 10 }), mkPlayer('b', 500, { shadyActions: 3 })]);
    const all = trophyLeaders(view, { all: true });
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((l) => (l.trophyId as string) === 'magnat')).toBe(false);
    expect(all.some((l) => (l.trophyId as string) === 'machiavel')).toBe(false);
  });

  it('seuil de contestation inclusif : 80 % du meneur', () => {
    const mk = (runner: number) => mkView('c', [mkPlayer('a', 100, { oilConsumed: 100 }), mkPlayer('b', 50, { oilConsumed: runner })]);
    let l = lead(mk(80), 'pollueur', true)!;
    expect(l.runnerUpId).toBe('b');
    expect(l.runnerValue).toBe(80);
    expect(l.contested).toBe(true);
    l = lead(mk(79), 'pollueur', true)!;
    expect(l.runnerUpId).toBe('b');
    expect(l.contested).toBe(false);
    l = lead(mk(0), 'pollueur', true)!;
    expect(l.runnerUpId).toBeUndefined();
    expect(l.runnerValue).toBeUndefined();
    expect(l.contested).toBe(false);
  });

  it('filtre par défaut : vos têtes même tranquilles ; celles des autres seulement avec { all: true }', () => {
    const view = mkView('moi', [mkPlayer('moi', 100, { bonusesTaken: 10 }), mkPlayer('lui', 200, { oilConsumed: 100 })]);
    const def = trophyLeaders(view).map((l) => l.trophyId);
    expect(def).toContain('bonus'); // mené par vous, sans rival
    expect(def).not.toContain('pollueur'); // mené par un autre, non contesté
    const all = trophyLeaders(view, { all: true }).map((l) => l.trophyId);
    expect(all).toContain('pollueur');
  });

  it('un zéro ne mène jamais : toutes stats à 0 → liste vide même avec { all: true }', () => {
    const view = mkView('a', [mkPlayer('a', 100), mkPlayer('b', 200)]);
    expect(trophyLeaders(view)).toEqual([]);
    expect(trophyLeaders(view, { all: true })).toEqual([]);
  });
});

describe('course aux trophées — trophyLeadChanges', () => {
  const prev = () => mkView('b', [mkPlayer('a', 100, { oilConsumed: 100 }), mkPlayer('b', 200, { oilConsumed: 50 })]);
  const next = () => mkView('b', [mkPlayer('a', 100, { oilConsumed: 100 }), mkPlayer('b', 200, { oilConsumed: 150 })]);

  it('une tête qui passe de a à vous : un seul changement, from/to/valeur', () => {
    const changes = trophyLeadChanges(prev(), next(), 'b');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ trophyId: 'pollueur', from: 'a', to: 'b', value: 150 });
  });

  it('le même changement vu par un troisième joueur : rien', () => {
    expect(trophyLeadChanges(prev(), next(), 'c')).toEqual([]);
  });

  it('une tête nouvelle (personne ne menait) : from undefined', () => {
    const avant = mkView('b', [mkPlayer('a', 100), mkPlayer('b', 200)]);
    const apres = mkView('b', [mkPlayer('a', 100), mkPlayer('b', 200, { oilConsumed: 150 })]);
    const changes = trophyLeadChanges(avant, apres, 'b');
    expect(changes).toHaveLength(1);
    expect(changes[0].trophyId).toBe('pollueur');
    expect(changes[0].from).toBeUndefined();
    expect(changes[0].to).toBe('b');
    expect(changes[0].value).toBe(150);
  });

  it('un changement par trophée même si plusieurs basculent', () => {
    const avant = mkView('b', [mkPlayer('a', 100, { oilConsumed: 100, bonusesTaken: 100 }), mkPlayer('b', 200, { oilConsumed: 50, bonusesTaken: 50 })]);
    const apres = mkView('b', [mkPlayer('a', 100, { oilConsumed: 100, bonusesTaken: 100 }), mkPlayer('b', 200, { oilConsumed: 150, bonusesTaken: 150 })]);
    const changes = trophyLeadChanges(avant, apres, 'b');
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.trophyId).sort()).toEqual(['bonus', 'pollueur']);
    for (const c of changes) {
      expect(c.from).toBe('a');
      expect(c.to).toBe('b');
      expect(c.value).toBe(150);
    }
  });
});

describe('course aux trophées — notifyViewChanges', () => {
  it('vous prenez une tête : un toast info tagué trophyLead:bonus qui nomme l’autre joueur', () => {
    setState({ lang: 'fr' });
    const prev = mkView('p1', [mkPlayer('p1', 100, { bonusesTaken: 50 }), mkPlayer('p2', 200, { bonusesTaken: 100 })]);
    const next = mkView('p1', [mkPlayer('p1', 100, { bonusesTaken: 200 }), mkPlayer('p2', 200, { bonusesTaken: 100 })]);
    notifyViewChanges(prev, next);
    const mock = vi.mocked(pushToast);
    expect(mock).toHaveBeenCalledTimes(1);
    const [kind, message, title, ttl, tag] = mock.mock.calls[0];
    expect(kind).toBe('info');
    expect(tag).toBe('trophyLead:bonus');
    expect(ttl).toBeUndefined();
    const def = getContent('fr').trophies.bonus;
    expect(title).toContain(def.emoji);
    expect(title).toContain(def.title);
    expect(message).toContain('Vous le prenez à Joueur p2');
  });

  it('vous perdez une tête : un toast aussi', () => {
    setState({ lang: 'fr' });
    const prev = mkView('p1', [mkPlayer('p1', 100, { bonusesTaken: 200 }), mkPlayer('p2', 200, { bonusesTaken: 100 })]);
    const next = mkView('p1', [mkPlayer('p1', 100, { bonusesTaken: 200 }), mkPlayer('p2', 200, { bonusesTaken: 300 })]);
    notifyViewChanges(prev, next);
    const mock = vi.mocked(pushToast);
    expect(mock).toHaveBeenCalledTimes(1);
    const [kind, message, , , tag] = mock.mock.calls[0];
    expect(kind).toBe('info');
    expect(tag).toBe('trophyLead:bonus');
    expect(message).toContain('Joueur p2');
    expect(message).toContain('vous le reprend');
  });

  it('le titre du trophée suit la langue de l’interface, pas celle du salon', () => {
    setState({ lang: 'en' });
    const prev = mkView('p1', [mkPlayer('p1', 100, { bonusesTaken: 50 }), mkPlayer('p2', 200, { bonusesTaken: 100 })]);
    const next = mkView('p1', [mkPlayer('p1', 100, { bonusesTaken: 200 }), mkPlayer('p2', 200, { bonusesTaken: 100 })]);
    notifyViewChanges(prev, next);
    const mock = vi.mocked(pushToast);
    expect(mock).toHaveBeenCalledTimes(1);
    const [, , title] = mock.mock.calls[0];
    expect(title).toContain(getContent('en').trophies.bonus.title);
  });

  it('deux têtes qui basculent en même temps : deux toasts aux tags distincts', () => {
    setState({ lang: 'fr' });
    const prev = mkView('p1', [mkPlayer('p1', 100, { oilConsumed: 50, bonusesTaken: 50 }), mkPlayer('p2', 200, { oilConsumed: 100, bonusesTaken: 100 })]);
    const next = mkView('p1', [mkPlayer('p1', 100, { oilConsumed: 200, bonusesTaken: 200 }), mkPlayer('p2', 200, { oilConsumed: 100, bonusesTaken: 100 })]);
    notifyViewChanges(prev, next);
    const mock = vi.mocked(pushToast);
    expect(mock).toHaveBeenCalledTimes(2);
    const tags = mock.mock.calls.map((c) => c[4]).sort();
    expect(tags).toEqual(['trophyLead:bonus', 'trophyLead:pollueur']);
  });

  it('vue terminée : pas de toast trophée', () => {
    setState({ lang: 'fr' });
    const prev = mkView('p1', [mkPlayer('p1', 100, { bonusesTaken: 50 }), mkPlayer('p2', 200, { bonusesTaken: 100 })]);
    const next = { ...mkView('p1', [mkPlayer('p1', 100, { bonusesTaken: 200 }), mkPlayer('p2', 200, { bonusesTaken: 100 })]), phase: 'finished' } as PlayerView;
    notifyViewChanges(prev, next);
    expect(vi.mocked(pushToast)).not.toHaveBeenCalled();
  });

  it('une tête qui passe d’un autre joueur à un autre : pas de toast', () => {
    setState({ lang: 'fr' });
    const prev = mkView('p3', [mkPlayer('p1', 100, { bonusesTaken: 100 }), mkPlayer('p2', 200, { bonusesTaken: 50 }), mkPlayer('p3', 300)]);
    const next = mkView('p3', [mkPlayer('p1', 100, { bonusesTaken: 100 }), mkPlayer('p2', 200, { bonusesTaken: 150 }), mkPlayer('p3', 300)]);
    notifyViewChanges(prev, next);
    expect(vi.mocked(pushToast)).not.toHaveBeenCalled();
  });
});

describe('formatTrophyValue (déplacé dans screens/trophyValue, inchangé)', () => {
  it('est une fonction et formate en français : montant brut, valeur absolue pour le naufrage', () => {
    const fr = messages('fr');
    const fmt = fmtFor('fr');
    const bonus = formatTrophyValue('bonus', 2400, fr, fmt);
    expect(typeof bonus).toBe('string');
    expect(bonus.length).toBeGreaterThan(0);
    expect(bonus).toBe(fmt.money(2400)); // pas d’unité ni de cas particulier pour « bonus »
    expect(formatTrophyValue('naufrage', -500, fr, fmt)).toContain(fmt.money(500));
  });
});
