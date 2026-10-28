import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@muchomoney/core';
import { estimateClockOffset, remainingMs } from '../src/clock';

const TURN_S = 90;
function view(turn: number, turnEndsAt: number | undefined, extra: Record<string, unknown> = {}): PlayerView {
  return { turn, turnEndsAt, phase: 'playing', config: { turnSeconds: TURN_S }, ...extra } as unknown as PlayerView;
}

describe('estimateClockOffset (chrono robuste au décalage d’horloge)', () => {
  const serverT0 = 1_000_000_000;

  for (const skew of [120_000, -120_000, 5_000, 0]) {
    it(`nouveau trimestre : temps restant exact malgré une horloge décalée de ${skew / 1000} s`, () => {
      const endsAt = serverT0 + TURN_S * 1000; // le serveur arme l'échéance puis diffuse
      const local = serverT0 + skew + 40; // 40 ms de latence
      const prev = view(3, serverT0 - 5);
      const off = estimateClockOffset(null, prev, view(4, endsAt), local);
      const rem = remainingMs(endsAt, local, off)!;
      expect(rem).toBe(TURN_S * 1000);
      // 30 s plus tard (horloge locale), il reste 60 s
      expect(remainingMs(endsAt, local + 30_000, off)).toBe(60_000);
    });
  }

  it('lancement de partie (vue reçue depuis le salon) : estimation exacte', () => {
    const endsAt = serverT0 + TURN_S * 1000;
    const local = serverT0 + 120_000;
    const off = estimateClockOffset(null, null, view(1, endsAt), local, true);
    expect(remainingMs(endsAt, local, off)).toBe(TURN_S * 1000);
  });

  it('vue en cours de tour : l’offset reste dans les bornes (jamais « Bilan… » ni plus que turnSeconds)', () => {
    const endsAt = serverT0 + TURN_S * 1000;
    // reconnexion au milieu du tour, horloge locale en avance de 2 min, sans estimation préalable
    const local = serverT0 + 45_000 + 120_000;
    const off = estimateClockOffset(null, null, view(2, endsAt), local);
    const rem = remainingMs(endsAt, local, off)!;
    expect(rem).toBeGreaterThanOrEqual(0);
    expect(rem).toBeLessThanOrEqual(TURN_S * 1000);
    // horloge en retard de 2 min : borné à turnSeconds au lieu de 210 s
    const local2 = serverT0 + 45_000 - 120_000;
    const off2 = estimateClockOffset(null, null, view(2, endsAt), local2);
    expect(remainingMs(endsAt, local2, off2)).toBe(TURN_S * 1000);
  });

  it('garde l’estimation précédente quand elle est cohérente, et l’ignore hors chrono', () => {
    const endsAt = serverT0 + TURN_S * 1000;
    const local = serverT0 + 10_000 - 3_000; // horloge en retard de 3 s
    expect(estimateClockOffset(3_000, view(2, endsAt), view(2, endsAt), local)).toBe(3_000);
    expect(estimateClockOffset(3_000, view(2, endsAt), view(2, undefined), local)).toBe(3_000);
  });

  it('utilise serverNow si la vue le fournit', () => {
    expect(estimateClockOffset(null, null, view(2, 5, { serverNow: 1_000 }), 400)).toBe(600);
  });
});
