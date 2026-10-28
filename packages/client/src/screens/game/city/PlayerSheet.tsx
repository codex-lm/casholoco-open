/**
 * Fiche d'un joueur, ouverte depuis une maison du panneau « Vous » : fortune (cash et portefeuille face à
 * la dette, en barres), courbe de la valeur nette, sociétés dirigées et participations (barre de détention,
 * 50 % en pointillé). Données publiques seulement : jamais de combines ni d'alertes d'un autre joueur.
 */
import type { CSSProperties } from 'react';
import type { CompanyView, PublicPlayer } from '@muchomoney/core';
import { useGame } from '../../../hooks/useGame';
import { useElementWidth } from '../../../hooks/useElementWidth';
import { Delta, PlayerTag, Stat } from '../../../components/bits';
import { Sparkline } from '../../../components/Sparkline';
import { nbsp, turnLabels } from '../../../util';
import { useT } from '../../../i18n';
import { useFmt } from '../../../fmt';
import { netWorthChange, netWorthRanks, type CityTarget } from './model';

const byCap = (a: CompanyView, b: CompanyView) => b.marketCap - a.marketCap || a.id.localeCompare(b.id);

export function PlayerSheet({ player, onOpen }: { player: PublicPlayer; onOpen: (t: CityTarget) => void }) {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const sh = t.city.sheets;
  const [ref, width] = useElementWidth<HTMLDivElement>(480);
  const rank = netWorthRanks(view.players).get(player.id) ?? view.players.length;
  const change = netWorthChange(player);
  const active = view.companies.filter((c) => c.status === 'active');
  const led = active.filter((c) => c.controllerId === player.id).sort(byCap);
  const held = active
    .filter((c) => (c.holdings[player.id] ?? 0) > 0)
    .map((c) => {
      const n = c.holdings[player.id] ?? 0;
      return { c, pct: n / Math.max(1, c.sharesOutstanding), value: n * c.sharePrice };
    })
    .sort((a, b) => b.value - a.value || a.c.id.localeCompare(b.c.id));

  // Barres de fortune : actifs (cash, puis actions) au-dessus, dette en dessous, sur la même échelle.
  const cash = Math.max(0, player.cash);
  const shares = Math.max(0, player.portfolioValue);
  const debt = Math.max(0, player.debt);
  const scale = Math.max(1e-9, cash + shares, debt);
  const pc = (v: number) => `${(100 * v) / scale}%`;
  // Un point par clôture (le premier est la fin du 1er trimestre, pas la mise de départ), puis la valeur en direct.
  const history = [...player.netWorthHistory, player.netWorth];
  const lastClosed = view.phase === 'finished' ? view.config.totalTurns : view.turn - 1;
  const labels = turnLabels(history.length, lastClosed, view.config.startYear, { start: t.common.start, now: t.common.now }, fmt.lang);

  return (
    <div className="sheet" ref={ref}>
      <div className="sheet-player-head">
        <PlayerTag player={player} you={player.id === view.you} />
        <span className="small muted">{sh.playerRank(rank, view.players.length)}</span>
      </div>

      <div className="stat-grid small-stats sheet-stats sheet-stats-2">
        <Stat
          label={sh.playerWorth}
          value={fmt.money(player.netWorth)}
          tone={player.netWorth < 0 ? 'down' : undefined}
          sub={
            change !== null ? (
              <>
                <Delta value={change} /> <span className="muted">{t.city.signs.closeLabel}</span>
              </>
            ) : undefined
          }
        />
        <div className="sheet-k-cash">
          <Stat label={sh.playerCash} value={fmt.money(player.cash)} />
        </div>
        <div className="sheet-k-shares" style={{ '--k-color': player.color } as CSSProperties}>
          <Stat label={sh.playerPortfolio} value={fmt.money(player.portfolioValue)} />
        </div>
        <div className="sheet-k-debt">
          <Stat label={sh.playerDebt} value={fmt.money(player.debt)} tone={debt > 0 ? 'down' : undefined} />
        </div>
      </div>

      <div className="sheet-balance" role="img" aria-label={sh.balanceAria(fmt.money(cash + shares), fmt.money(debt))}>
        <div className="sheet-bar">
          {cash > 0 && <span className="sheet-bar-cash" style={{ width: pc(cash) }} />}
          {shares > 0 && <span style={{ width: pc(shares), background: player.color }} />}
        </div>
        <div className="sheet-bar">{debt > 0 && <span className="sheet-bar-debt" style={{ width: pc(debt) }} />}</div>
      </div>

      {history.length > 1 && (
        <div className="sheet-history">
          <div className="sheet-section-title">{sh.playerHistory}</div>
          <Sparkline values={history} width={Math.max(120, Math.min(width, 520))} height={44} label={sh.playerHistory} />
          <div className="sheet-history-ends">
            <span>{sh.historyPoint(labels[0], nbsp(fmt.money(history[0])))}</span>
            <span>{sh.historyPoint(labels[labels.length - 1], nbsp(fmt.money(player.netWorth)))}</span>
          </div>
        </div>
      )}

      <div>
        <div className="sheet-section-title">{sh.playerControls}</div>
        {led.length > 0 ? (
          <ul className="sheet-list">
            {led.map((c) => (
              <li key={c.id}>
                <button type="button" className="sheet-item" onClick={() => onOpen({ kind: 'company', id: c.id })}>
                  <span className="sheet-item-name">
                    <span aria-hidden>{c.emoji}</span> {c.name} <span className="muted">({c.ticker})</span>
                  </span>
                  <span className="sheet-item-sub">{sh.cap(nbsp(fmt.money(c.marketCap)))}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted sheet-note">{sh.playerNone}</p>
        )}
      </div>

      <div>
        <div className="sheet-section-title">{sh.playerHoldings}</div>
        {held.length > 0 ? (
          <ul className="sheet-list">
            {held.map(({ c, pct, value }) => (
              <li key={c.id}>
                <button type="button" className="sheet-item" onClick={() => onOpen({ kind: 'company', id: c.id })}>
                  <span className="sheet-item-name">
                    <span aria-hidden>{c.emoji}</span> {c.name} <span className="muted">({c.ticker})</span>
                  </span>
                  <span className="sheet-item-sub">{sh.holding(nbsp(fmt.pct(pct, 0)), nbsp(fmt.money(value)))}</span>
                  <span className="sheet-own" aria-hidden>
                    <span style={{ width: `${Math.min(100, pct * 100)}%`, background: player.color }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted sheet-note">{sh.playerNone}</p>
        )}
      </div>

      <p className="small muted sheet-note">{sh.playerStats(player.stats.takeoversWon, player.stats.takeoversSuffered, player.stats.scandals)}</p>
    </div>
  );
}
