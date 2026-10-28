import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import type { Article, GameState, Lang } from '../src/types';
import { bots, companyOf, config, human, newGame } from './helpers';

/** Articles d'événement de toute la partie (tous les numéros). */
function events(state: GameState): Article[] {
  return state.journal.flatMap((i) => i.articles).filter((a) => a.event);
}

function setup(): GameState {
  // Deux humains, aucun bot : seuls nos ordres font bouger l'état.
  return newGame(11, [human('a', 'energy_drinks', 'Alice'), human('b', 'gadgets', 'Bob')]);
}

describe('événements structurés du journal (chronologie)', () => {
  it('une prise de contrôle nomme l’acquéreur, le PDG évincé, son parachute et la part acquise', () => {
    const s = setup();
    const target = companyOf(s, 'a');
    s.players.b.cash = 1e9;
    expect(applyAction(s, 'b', { type: 'buyShares', companyId: target.id, shares: 5001 }).ok).toBe(true);
    const a = events(s).find((x) => x.event?.type === 'takeover');
    expect(a).toBeDefined();
    expect(a!.companyIds).toEqual([target.id]);
    expect(a!.event).toMatchObject({ type: 'takeover', actorId: 'b', subjectId: 'a' });
    expect(a!.event!.amount).toBeCloseTo(s.players.a.stats.parachutes);
    expect(a!.event!.pct).toBeGreaterThan(0.5);
    // La montée au capital qui précède la prise de contrôle n'a pas de flash séparé (§6.3).
    expect(events(s).some((x) => x.event?.type === 'stakeBuilding')).toBe(false);
  });

  it('une montée au capital nomme le joueur et la part franchie', () => {
    const s = setup();
    const target = companyOf(s, 'a');
    s.players.b.cash = 1e9;
    expect(applyAction(s, 'b', { type: 'buyShares', companyId: target.id, shares: 2600 }).ok).toBe(true);
    const e = events(s).find((x) => x.event?.type === 'stakeBuilding')!.event!;
    expect(e.actorId).toBe('b');
    expect(e.pct).toBeCloseTo(0.26);
  });

  it('un lancement désigne le produit et son dirigeant', () => {
    const s = setup();
    const c = companyOf(s, 'a');
    expect(applyAction(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'yogurts', name: 'Vache Test' }).ok).toBe(true);
    const e = events(s).find((x) => x.event?.type === 'productLaunch')!.event!;
    expect(e.actorId).toBe('a');
    expect(e.productId).toBe(c.products.at(-1)!.id);
  });

  it('le lanceur d’alerte reste anonyme', () => {
    const s = setup();
    const target = companyOf(s, 'a');
    target.scandal = 20;
    expect(applyAction(s, 'b', { type: 'whistleblow', companyId: target.id }).ok).toBe(true);
    const a = events(s).find((x) => x.event?.type === 'whistleblow')!;
    expect(a.event).toEqual({ type: 'whistleblow' });
    expect(JSON.stringify(getPlayerView(s, 'a').journal)).not.toContain('"actorId":"b"');
  });

  it('une faillite désigne le dirigeant qu’elle a évincé', () => {
    const s = setup();
    const c = companyOf(s, 'a');
    c.debt = 1e6;
    resolveTurn(s);
    expect(s.companies[c.id].status).toBe('bankrupt');
    const e = events(s).find((x) => x.event?.type === 'bankruptcy')!;
    expect(e.companyIds).toEqual([c.id]);
    expect(e.event!.subjectId).toBe('a');
    // Elle tombe en tête de clôture, faute de payer ses obligations (§5.7) : pas de comptes pour ce trimestre.
    expect(s.companies[c.id].reports).toHaveLength(0);
    expect(events(s).some((x) => x.event?.type === 'bigLoss' && x.companyIds?.includes(c.id))).toBe(false);
  });

  it('une start-up de retour en jeu nomme son fondateur, rien de plus', () => {
    const s = setup();
    resolveTurn(s); // pas deux fondations dans le même trimestre (l'entreprise de départ date du T1)
    s.players.b.cash = 1e9;
    expect(applyAction(s, 'b', { type: 'buyShares', companyId: companyOf(s, 'a').id, shares: 5001 }).ok).toBe(true);
    expect(applyAction(s, 'a', { type: 'foundStartup', name: 'Phénix', sectorId: 'yogurts', investment: 2000 }).ok).toBe(true);
    expect(events(s).find((x) => x.event?.type === 'startup')!.event).toEqual({ type: 'startup', actorId: 'a' });
  });

  it('mêmes événements en français et en anglais', () => {
    const run = (lang: Lang) => {
      const s = createGame({ ...config(7), lang }, [human('h', 'yogurts', 'Ada'), ...bots(5)]);
      for (let t = 0; t < 8; t++) resolveTurn(s);
      return events(s).map((a) => ({ kind: a.kind, companyIds: a.companyIds, event: a.event }));
    };
    const fr = run('fr');
    expect(fr.length).toBeGreaterThan(5);
    expect(run('en')).toEqual(fr);
  });
});
