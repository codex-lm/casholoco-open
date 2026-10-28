import { PLAYER_START_CASH, type ContentBundle, type FarewellOutcome, type Id, type PlayerView } from '@muchomoney/core';
import { hashPick } from '../game/paper/hash';

/** Issue d'un bot en fin de partie : vainqueur, ruiné (sans entreprise et sous un quart de sa mise), podium, peloton. */
export function farewellOutcome(rank: number, netWorth: number, controlsNothing: boolean): FarewellOutcome {
  if (rank === 1) return 'won';
  if (controlsNothing && netWorth < 0.25 * PLAYER_START_CASH) return 'ruined';
  if (rank <= 3) return 'podium';
  return 'pack';
}

/** Une ligne d'adieu par bot, dans l'ordre du classement ; ligne neutre (neutral: true, text vide) pour un bot repris. */
export function pickFarewells(view: PlayerView, content: ContentBundle): { playerId: Id; text: string; neutral: boolean }[] {
  const ranking = view.results?.ranking.length
    ? view.results.ranking
    : [...view.players].sort((a, b) => b.netWorth - a.netWorth).map((p) => ({ playerId: p.id, netWorth: p.netWorth }));
  const textSeed = view.config.textSeed ?? view.config.seed;
  const lines: { playerId: Id; text: string; neutral: boolean }[] = [];
  for (const [i, r] of ranking.entries()) {
    const p = view.players.find((pl) => pl.id === r.playerId);
    if (!p?.botPersonalityId) continue;
    if (p.botTakeover) {
      lines.push({ playerId: p.id, text: '', neutral: true });
      continue;
    }
    const pers = content.bots.find((b) => b.id === p.botPersonalityId);
    if (!pers) continue;
    const outcome = farewellOutcome(i + 1, r.netWorth, p.controlledCompanyIds.length === 0);
    const text = hashPick(pers.farewells[outcome], `${textSeed}|farewell|${p.id}`) ?? '';
    lines.push({ playerId: p.id, text, neutral: false });
  }
  return lines;
}
