import { useGame } from '../../hooks/useGame';
import { PlayerTag } from '../../components/bits';
import { cx } from '../../util';
import { useContent, useT } from '../../i18n';
import { useFmt } from '../../fmt';
import { formatTrophyValue } from '../trophyValue';
import { trophyLeaders } from './trophyRace';

/** Bandeau « course aux trophées » : les trophées que vous menez ou qui se disputent. */
export function TrophyRace() {
  const { view, playersById } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const leads = trophyLeaders(view);
  if (leads.length === 0) return null;
  return (
    <div className="trophy-race">
      <span className="trophy-race-label">{t.ranking.trophyRace}</span>
      {leads.map((lead) => {
        const def = content.trophies[lead.trophyId];
        const leader = playersById.get(lead.leaderId);
        const runner = lead.runnerUpId ? playersById.get(lead.runnerUpId) : undefined;
        const value = formatTrophyValue(lead.trophyId, lead.value, t, fmt);
        const runnerValue = lead.runnerValue !== undefined ? formatTrophyValue(lead.trophyId, lead.runnerValue, t, fmt) : '';
        return (
          <span key={lead.trophyId} className={cx('trophy-chip', lead.leaderId === view.you && 'mine')} title={def?.description}>
            {def?.emoji} {def?.title} —{' '}
            {lead.leaderId === view.you ? (
              t.ranking.youLead(value)
            ) : (
              <>
                {leader ? <PlayerTag player={leader} compact /> : lead.leaderId} {value}
              </>
            )}
            {lead.contested && (
              <>
                {' · '}
                {lead.runnerUpId === view.you ? t.ranking.youChase(runnerValue) : t.ranking.chasedBy(runner?.name ?? '?', runnerValue)}
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
