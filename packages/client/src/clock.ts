/**
 * Chrono robuste au décalage d'horloge.
 *
 * Le serveur envoie `turnEndsAt` en epoch ms selon SON horloge. Comparer cette date à
 * `Date.now()` du client fausse le chrono dès que l'horloge locale est décalée
 * (2 min d'avance : « Bilan… » pendant tout le tour). On estime donc
 * offset ≈ horloge serveur − horloge locale, et le temps restant vaut
 * turnEndsAt − (Date.now() + offset).
 *
 * Le serveur n'envoie pas son heure : on s'appuie sur deux faits du protocole.
 *  - Il arme l'échéance puis diffuse aussitôt la vue : la première vue d'un NOUVEAU
 *    trimestre a été émise à turnEndsAt − turnSeconds (à la latence près).
 *  - Une échéance n'est jamais à plus de turnSeconds dans le futur (reprise après
 *    pause comprise) et n'est diffusée que tant qu'elle n'est pas passée.
 *    D'où, à chaque vue : turnEndsAt − turnMs − localNow ≤ offset ≤ turnEndsAt − localNow.
 * Si la vue porte un jour `serverNow` (horloge serveur), on l'utilise directement.
 */
import type { PlayerView } from '@muchomoney/core';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Nouvelle estimation de l'offset après réception de `view` à l'instant local `localNow`.
 * `gameJustStarted` : première vue reçue alors qu'on était dans le salon (lancement de partie).
 */
export function estimateClockOffset(
  prevOffset: number | null,
  prevView: PlayerView | null,
  view: PlayerView,
  localNow: number,
  gameJustStarted = false,
): number | null {
  const serverNow = (view as PlayerView & { serverNow?: unknown }).serverNow;
  if (typeof serverNow === 'number' && Number.isFinite(serverNow)) return serverNow - localNow;

  const endsAt = view.turnEndsAt;
  if (typeof endsAt !== 'number' || !Number.isFinite(endsAt)) return prevOffset;
  const turnMs = Math.max(0, (view.config?.turnSeconds ?? 0) * 1000);
  const lo = endsAt - turnMs - localNow;
  const hi = endsAt - localNow;

  const newTurn =
    prevView !== null && view.turn > prevView.turn && view.turnEndsAt !== prevView.turnEndsAt && view.phase !== 'finished';
  const firstTurn = prevView === null && gameJustStarted && view.turn === 1;
  if (newTurn || firstTurn) return lo;

  return clamp(prevOffset ?? 0, lo, hi);
}

/** Temps restant (ms) avant la clôture, selon l'horloge du serveur estimée. null hors chrono. */
export function remainingMs(turnEndsAt: number | undefined, localNow: number, offset: number | null): number | null {
  if (typeof turnEndsAt !== 'number' || !Number.isFinite(turnEndsAt)) return null;
  return turnEndsAt - (localNow + (offset ?? 0));
}
