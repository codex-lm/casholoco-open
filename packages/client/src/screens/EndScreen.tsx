import { useEffect, useRef } from 'react';
import { TROPHY_IDS } from '@muchomoney/core';
import { leaveRoom } from '../api';
import { useGame } from '../hooks/useGame';
import { PlayerTag, Section, Swatch } from '../components/bits';
import { NetWorthChart } from './game/RankingTab';
import { cx } from '../util';
import { useContent, useT } from '../i18n';
import { useFmt } from '../fmt';
import { FinalReports } from './FinalReports';
import { Farewells } from './end/FarewellsBox';
import { SoundButton } from '../components/SoundButton';
import { formatTrophyValue } from './trophyValue';

export function EndScreen() {
  const { view, playersById } = useGame();
  const headline = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Enter after GameScreen and its dialogs clean up; later snapshots must leave report reading alone.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    headline.current?.focus({ preventScroll: true });
  }, []);
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const ranking = view.results?.ranking.length
    ? view.results.ranking
    : [...view.players].sort((a, b) => b.netWorth - a.netWorth).map((p) => ({ playerId: p.id, netWorth: p.netWorth }));
  const trophies = [...(view.results?.trophies ?? [])].sort((a, b) => TROPHY_IDS.indexOf(a.trophyId) - TROPHY_IDS.indexOf(b.trophyId));

  const winner = ranking[0] ? playersById.get(ranking[0].playerId) : undefined;
  const myRank = ranking.findIndex((r) => r.playerId === view.you) + 1;
  const podium = [ranking[1], ranking[0], ranking[2]];

  return (
    <main className="end page">
      <div className="end-tools">
        <SoundButton />
      </div>
      <header className="masthead small-masthead">
        <div className="masthead-top">
          <span>{t.end.edition}</span>
          <span>{view.dateLabel}</span>
        </div>
        <h1 className="paper-title">{t.common.paperName}</h1>
      </header>

      <section className="end-headline">
        <div className="kicker">{t.end.kicker}</div>
        <h2 ref={headline} tabIndex={-1}>{winner ? t.end.winner(winner.name, fmt.money(ranking[0].netWorth)) : t.end.over}</h2>
        <p className="italic">{myRank === 1 ? t.end.first : myRank > 0 ? t.end.rank(t.ordinal(myRank)) : t.end.noRank}</p>
      </section>

      <div className="podium" aria-label={t.end.podium}>
        {podium.map((r, i) => {
          if (!r) return <div key={i} className="podium-slot empty" />;
          const p = playersById.get(r.playerId);
          const place = i === 1 ? 1 : i === 0 ? 2 : 3;
          return (
            <div key={r.playerId} className={cx('podium-slot', `place-${place}`, r.playerId === view.you && 'me')}>
              <div className="podium-name">
                {p && <Swatch color={p.color} size={12} />} {p?.name ?? '?'}
              </div>
              <div className="podium-worth">{fmt.money(r.netWorth)}</div>
              <div className="podium-block" style={{ borderTopColor: p?.color }}>
                {place === 1 ? '👑' : place}
              </div>
            </div>
          );
        })}
      </div>

      <div className="two-cols">
        <Section title={t.end.finalRanking}>
          <table className="table">
            <tbody>
              {ranking.map((r, i) => {
                const p = playersById.get(r.playerId);
                return (
                  <tr key={r.playerId} className={cx(r.playerId === view.you && 'mine')}>
                    <td className="rank">{i + 1}</td>
                    <td>{p ? <PlayerTag player={p} you={r.playerId === view.you} compact /> : r.playerId}</td>
                    <td className="num">
                      <strong>{fmt.money(r.netWorth)}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
        <Section title={t.ranking.evolution}>
          <NetWorthChart live={false} />
        </Section>
      </div>

      <Farewells />

      <FinalReports />

      <Section title={t.end.awards}>
        {trophies.length === 0 ? (
          <p className="muted">{t.end.noTrophies}</p>
        ) : (
          <div className="trophy-grid">
            {trophies.map((tr) => {
              const def = content.trophies[tr.trophyId];
              const p = playersById.get(tr.playerId);
              return (
                <article key={tr.trophyId} className={cx('trophy', tr.playerId === view.you && 'me')}>
                  <div className="trophy-emoji" aria-hidden>
                    {def?.emoji ?? '🏅'}
                  </div>
                  <div>
                    <strong>{def?.title ?? tr.trophyId}</strong>
                    <div className="small muted">{def?.description}</div>
                    <div className="trophy-winner">
                      {p ? <PlayerTag player={p} you={tr.playerId === view.you} compact /> : '?'}
                      <span className="small"> · {formatTrophyValue(tr.trophyId, tr.value, t, fmt)}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      <div className="row center end-actions">
        <button type="button" className="btn big primary" onClick={leaveRoom}>
          {t.end.home}
        </button>
      </div>
    </main>
  );
}
