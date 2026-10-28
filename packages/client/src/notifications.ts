import type { CompanyView, PlayerView } from '@muchomoney/core';
import { getContent } from '@muchomoney/core';
import { getState, pushToast } from './store';
import { t } from './i18n';
import { fmtFor } from './fmt';
import { trophyLeadChanges } from './screens/game/trophyRace';
import { formatTrophyValue } from './screens/trophyValue';

function pct(c: CompanyView, playerId: string): number {
  if (!c.sharesOutstanding) return 0;
  return (c.holdings[playerId] ?? 0) / c.sharesOutstanding;
}

/**
 * Compare deux vues successives et signale ce qui me concerne personnellement :
 * contrôle gagné ou perdu, majorité franchie, trophée pris ou repris.
 * Le reste (nouveau trimestre, flashs « Dernière minute », montées au capital)
 * arrive déjà du serveur en game:event : on ne le double pas ici.
 * Textes et titres de trophées dans la langue de l'interface ; seuls les
 * chiffres et montants restent dans celle du salon.
 */
export function notifyViewChanges(prev: PlayerView, next: PlayerView): void {
  const me = next.you;
  const m = t().notif;
  const fmt = fmtFor(next.config.lang);
  const prevById = new Map(prev.companies.map((c) => [c.id, c]));

  for (const c of next.companies) {
    const p = prevById.get(c.id);
    if (!p) continue;
    const wasMine = p.controllerId === me;
    const isMine = c.controllerId === me;

    if (!wasMine && isMine) {
      pushToast('drama', m.takeover(c.name), m.takeoverTitle);
    } else if (wasMine && !isMine) {
      const reason = c.status === 'bankrupt' ? m.bankrupt(c.name) : c.status === 'merged' ? m.merged(c.name) : m.lost(c.name);
      pushToast('bad', reason, m.lostTitle);
    }

    // Majorité franchie sans (encore) être aux commandes.
    const before = pct(p, me);
    const after = pct(c, me);
    if (!isMine && before <= 0.5 && after > 0.5) {
      pushToast('good', m.majority(fmt.pct(after), c.name), m.majorityTitle);
    }
  }

  // Course aux trophées : je le prends ou on me le reprend.
  if (next.phase === 'playing') {
    const content = getContent(getState().lang); // titres de trophées dans la langue de l'interface
    for (const ch of trophyLeadChanges(prev, next, me)) {
      if (ch.from !== me && ch.to !== me) continue;
      const def = content.trophies[ch.trophyId];
      const title = m.trophyTitle(def?.emoji ?? '🏅', def?.title ?? ch.trophyId);
      const value = formatTrophyValue(ch.trophyId, ch.value, t(), fmt);
      const nameOf = (id: string) => next.players.find((p) => p.id === id)?.name ?? '?';
      if (ch.to === me) {
        pushToast('info', ch.from ? m.trophyTaken(nameOf(ch.from), value) : m.trophyTakenFirst(value), title, undefined, `trophyLead:${ch.trophyId}`);
      } else if (ch.from === me && ch.to) {
        pushToast('info', m.trophyLost(nameOf(ch.to), value), title, undefined, `trophyLead:${ch.trophyId}`);
      }
    }
  }
}
