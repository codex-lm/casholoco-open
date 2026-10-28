/** Classement final et trophées (§11). */
import { TROPHY_IDS, type FinalResults, type GameState, type PlayerStats, type TrophyAward, type TrophyId } from '../types';
import { computeNetWorth } from './finance';

/** Statistique qui départage chaque trophée (« magnat » = premier du classement). */
export const TROPHY_STAT: Record<Exclude<TrophyId, 'magnat'>, keyof PlayerStats> = {
  pollueur: 'oilConsumed',
  machiavel: 'shadyActions',
  parachute: 'parachutes',
  visionnaire: 'rndSpent',
  marketeux: 'marketingSpent',
  predateur: 'takeoversWon',
  proie: 'takeoversSuffered',
  casserole: 'scandals',
  fisc: 'finesPaid',
  naufrage: 'worstTurnLoss',
  rentier: 'dividendsReceived',
  serial: 'startupsFounded',
  bonus: 'bonusesTaken',
};

export function computeResults(state: GameState): FinalResults {
  const ranking = Object.values(state.players)
    .map((p) => ({ playerId: p.id, netWorth: computeNetWorth(state, p.id) }))
    .sort((a, b) => b.netWorth - a.netWorth || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  const trophies: TrophyAward[] = [];
  for (const id of TROPHY_IDS) {
    if (id === 'magnat') {
      if (ranking.length > 0) trophies.push({ trophyId: 'magnat', playerId: ranking[0].playerId, value: ranking[0].netWorth });
      continue;
    }
    const stat = TROPHY_STAT[id];
    let bestId: string | undefined;
    let bestValue = 0;
    // Parcours dans l'ordre du classement : à égalité, le mieux classé l'emporte.
    for (const r of ranking) {
      const v = state.players[r.playerId].stats[stat] ?? 0;
      if (Number.isFinite(v) && v > bestValue + 1e-9) {
        bestId = r.playerId;
        bestValue = v;
      }
    }
    if (bestId) trophies.push({ trophyId: id, playerId: bestId, value: bestValue });
  }
  return { ranking, trophies };
}
