import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { createGame, getPlayerView, resolveTurn } from '../src/engine';
import type { BotLevel, GameState, LobbyPlayer } from '../src/types';
import { bots, config, human } from './helpers';

/** Des bots réglés un par un au salon. */
function botsAt(levels: BotLevel[]): LobbyPlayer[] {
  return bots(levels.length).map((b, i) => ({ ...b, botLevel: levels[i] }));
}

/** L'état sans les niveaux : ce qui reste doit être identique, nombre pour nombre. */
function withoutLevels(s: GameState): string {
  const players = Object.fromEntries(Object.entries(s.players).map(([id, p]) => [id, { ...p, botLevel: undefined }]));
  return JSON.stringify({ ...s, config: { ...s.config, botLevel: undefined }, players });
}

describe('niveau propre à chaque bot (§10)', () => {
  it('des bots tous réglés au même niveau jouent exactement comme le niveau du salon', () => {
    for (const level of ['intern', 'expert'] as const) {
      const room = createGame({ ...config(5), botLevel: level }, [human('h'), ...bots(3)]);
      const each = createGame(config(5), [human('h'), ...botsAt([level, level, level])]);
      expect(Object.values(each.players).filter((p) => p.isBot).map((p) => p.botLevel)).toEqual([level, level, level]);
      for (let t = 0; t < 4; t++) {
        resolveTurn(room);
        resolveTurn(each);
      }
      expect(withoutLevels(each)).toBe(withoutLevels(room));
    }
  }, 30_000);

  it('niveaux panachés : chacun joue le sien, et la vue le montre pour les bots seulement', () => {
    const s = createGame(config(3), [human('h'), ...botsAt(['intern', 'normal', 'expert'])]);
    const view = getPlayerView(s, 'h');
    expect(view.players.map((p) => [p.id, p.botLevel])).toEqual([
      ['h', undefined],
      ['bot1', 'intern'],
      ['bot2', 'normal'],
      ['bot3', 'expert'],
    ]);
    while (s.phase === 'playing') resolveTurn(s);
    // Le stagiaire garde son unique produit au prix de référence et ne triche pas.
    const intern = s.players.bot1;
    expect(intern.stats.shadyActions).toBe(0);
    expect(intern.stats.takeoversWon).toBe(0);
    const own = Object.values(s.companies).find((c) => c.founderId === 'bot1')!;
    if (own.controllerId === 'bot1') {
      expect(own.products).toHaveLength(1);
      expect(own.products[0].price).toBeCloseTo(SECTORS[own.products[0].sectorId].refPrice, 9);
    }
    // Les autres ne restent pas tous au prix de référence.
    const others = Object.values(s.companies).filter((c) => c.status === 'active' && (c.controllerId === 'bot2' || c.controllerId === 'bot3'));
    expect(others.some((c) => c.products.some((p) => Math.abs(p.price - SECTORS[p.sectorId].refPrice) > 1e-6))).toBe(true);
  }, 30_000);

  it('un niveau inconnu est ignoré : le bot suit le niveau du salon', () => {
    const s = createGame({ ...config(1), botLevel: 'intern' }, [human('h'), { ...bots(1)[0], botLevel: 'boss' as BotLevel }]);
    expect(s.players.bot1.botLevel).toBeUndefined();
    expect(getPlayerView(s, 'h').players.find((p) => p.id === 'bot1')!.botLevel).toBe('intern');
    // Un humain n'a jamais de niveau, même si le salon en envoie un.
    const t = createGame(config(1), [{ ...human('h'), botLevel: 'expert' }, ...bots(1)]);
    expect(t.players.h.botLevel).toBeUndefined();
  });
});
