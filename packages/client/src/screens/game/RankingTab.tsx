import { useGame } from '../../hooks/useGame';
import { LineChart } from '../../components/LineChart';
import { Delta, PlayerTag, Section } from '../../components/bits';
import { cx, turnLabels } from '../../util';
import { useT } from '../../i18n';
import { useFmt } from '../../fmt';
import { FortuneTimeline } from './timeline/FortuneTimeline';
import { TrophyRace } from './TrophyRaceStrip';

interface Props {
  /** Trimestre conservé par la partie ; null suit le trimestre courant. */
  selectedTurn: number | null;
  onSelectTurn: (turn: number | null) => void;
  /** Ouvre un numéro du journal (onglet Journal). */
  openIssue?: (turn: number) => void;
}

export function RankingTab({ selectedTurn, onSelectTurn, openIssue }: Props) {
  const { view } = useGame();
  const t = useT();
  return (
    <div className="ranking">
      <Section title={t.ranking.title} aside={<span className="small muted">{t.ranking.formula}</span>}>
        <RankingTable />
        {view.phase === 'playing' && <TrophyRace />}
      </Section>
      <Section title={t.ranking.evolution} aside={<span className="small muted">{t.ranking.note(view.turn, view.config.totalTurns)}</span>}>
        <FortuneTimeline selectedTurn={selectedTurn} onSelectTurn={onSelectTurn} openIssue={openIssue} />
      </Section>
    </div>
  );
}

export function NetWorthChart({ live = true }: { live?: boolean }) {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const series = view.players.map((p) => ({
    id: p.id,
    label: p.id === view.you ? t.common.youSuffix(p.name) : p.name,
    color: p.color,
    values: live ? [...p.netWorthHistory, p.netWorth] : p.netWorthHistory.length ? p.netWorthHistory : [p.netWorth],
  }));
  const len = Math.max(0, ...series.map((s) => s.values.length));
  const labels = live
    ? turnLabels(len, view.turn - 1, view.config.startYear, { start: t.common.start, now: t.common.now }, fmt.lang)
    : turnLabels(len, view.phase === 'finished' ? view.config.totalTurns : view.turn - 1, view.config.startYear, { start: t.common.start }, fmt.lang);
  return <LineChart series={series} labels={labels} height={260} />;
}

function RankingTable() {
  const { view, companiesById } = useGame();
  const t = useT();
  const fmt = useFmt();
  const players = [...view.players].sort((a, b) => b.netWorth - a.netWorth);
  return (
    <div className="table-scroll">
      <table className="table ranking-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t.ranking.cols.player}</th>
            <th className="num">{t.ranking.cols.netWorth}</th>
            <th className="num">{t.ranking.cols.sinceClose}</th>
            <th className="num">{t.ranking.cols.cash}</th>
            <th className="num">{t.ranking.cols.portfolio}</th>
            <th className="num">{t.ranking.cols.debt}</th>
            <th>{t.ranking.cols.controlled}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => {
            const last = p.netWorthHistory[p.netWorthHistory.length - 1];
            const change = last ? p.netWorth / last - 1 : 0;
            return (
              <tr key={p.id} className={cx(p.id === view.you && 'mine')}>
                <td className="rank">{i + 1}</td>
                <td>
                  <PlayerTag player={p} you={p.id === view.you} compact />
                  {!p.isBot && !p.connected && <span className="small muted">{t.ranking.absent}</span>}
                </td>
                <td className="num">
                  <strong>{fmt.money(p.netWorth)}</strong>
                </td>
                <td className="num">{last ? <Delta value={change} /> : '—'}</td>
                <td className="num">{fmt.money(p.cash)}</td>
                <td className="num">{fmt.money(p.portfolioValue)}</td>
                <td className="num">{p.debt > 0 ? fmt.money(p.debt) : '—'}</td>
                <td>
                  {p.controlledCompanyIds.length ? (
                    p.controlledCompanyIds.map((id) => {
                      const c = companiesById.get(id);
                      return c ? (
                        <span key={id} className="ticker-chip" title={c.name}>
                          {c.emoji} {c.ticker}
                        </span>
                      ) : null;
                    })
                  ) : (
                    <span className="small muted">{t.common.none}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
