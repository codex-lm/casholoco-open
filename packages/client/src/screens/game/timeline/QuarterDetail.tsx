/**
 * Détail d'un trimestre dans « Fortunes et infortunes » : à gauche les événements en clair (titre du
 * journal cliquable, dans la langue du salon), à droite le palmarès des fortunes à la clôture du
 * trimestre — ou en direct, au cours actuel, pour le trimestre en cours.
 */
import type { Id, PlayerView, PublicPlayer } from '@muchomoney/core';
import type { ReactNode } from 'react';
import { useGame } from '../../../hooks/useGame';
import { useT } from '../../../i18n';
import { useFmt } from '../../../fmt';
import { cx } from '../../../util';
import { Delta, Swatch } from '../../../components/bits';
import { EntryItem, useDescribe } from './Timeline';
import type { Quarter } from './model';

/** Fortune à la fin du trimestre q : le cours en direct pour le trimestre en cours, l'historique sinon. */
export function worthAt(p: PublicPlayer, quarter: number, view: PlayerView): number | undefined {
  if (view.phase !== 'finished' && quarter === view.turn) return p.netWorth;
  return quarter >= 1 && quarter <= p.netWorthHistory.length ? p.netWorthHistory[quarter - 1] : undefined;
}

interface Props {
  /** Colonne choisie (événements déjà filtrés). */
  quarter: Quarter;
  /** Toutes les colonnes (pour libeller les boutons ◀ ▶). */
  cols: Quarter[];
  /** Événements du trimestre masqués par les filtres. */
  hidden: number;
  /** Message quand la colonne est vide. */
  emptyText: string;
  /** Trimestre en cours (on ne peut pas détailler le futur). */
  current: number;
  playing: boolean;
  /** Ligne de faits clés sous l'en-tête (téléphone seulement, fournie par FortuneTimeline). */
  keyFacts?: ReactNode;
  openIssue?: (turn: number) => void;
  onSelect: (turn: number) => void;
  /** Survol d'un événement : les courbes des joueurs impliqués restent pleines, les autres s'effacent. */
  onHoverEntry?: (players: Id[] | null, quarter: number) => void;
}

export function QuarterDetail({ quarter, cols, hidden, emptyText, current, playing, keyFacts, openIssue, onSelect, onHoverEntry }: Props) {
  const { view } = useGame();
  const t = useT();
  const h = t.history;
  const fmt = useFmt();
  const describe = useDescribe();
  const prev = quarter.turn > 1 ? cols.find((c) => c.turn === quarter.turn - 1) : undefined;
  const next = quarter.turn < current ? cols.find((c) => c.turn === quarter.turn + 1) : undefined;
  const live = playing && quarter.turn === current;

  // Palmarès à la clôture du trimestre, et rangs au trimestre précédent pour les places gagnées/perdues.
  const rows = view.players
    .map((p) => ({ p, v: worthAt(p, quarter.turn, view) }))
    .filter((r): r is { p: PublicPlayer; v: number } => r.v !== undefined)
    .sort((a, b) => b.v - a.v);
  const prevRank = new Map<Id, number>();
  if (quarter.turn >= 2) {
    view.players
      .map((p) => ({ p, v: worthAt(p, quarter.turn - 1, view) }))
      .filter((r): r is { p: PublicPlayer; v: number } => r.v !== undefined)
      .sort((a, b) => b.v - a.v)
      .forEach((r, i) => prevRank.set(r.p.id, i + 1));
  }

  return (
    <div className="rc-detail">
      <div className="rc-detail-head">
        <div className="rc-detail-nav">
          <button
            type="button"
            className="rc-nav-btn"
            disabled={!prev}
            aria-label={prev ? h.quarterAria(prev.label, prev.entries.length, prev.mine) : undefined}
            onClick={() => prev && onSelect(prev.turn)}
          >
            <span aria-hidden>◀</span>
          </button>
          <strong className="rc-detail-title">
            {quarter.label} · {h.events(quarter.entries.length)}
          </strong>
          <button
            type="button"
            className="rc-nav-btn"
            disabled={!next}
            aria-label={next ? h.quarterAria(next.label, next.entries.length, next.mine) : undefined}
            onClick={() => next && onSelect(next.turn)}
          >
            <span aria-hidden>▶</span>
          </button>
        </div>
        {openIssue && quarter.hasIssue && (
          <button type="button" className="btn tiny rc-read" onClick={() => openIssue(quarter.turn)}>
            <span aria-hidden>📰 </span>
            {h.readIssue(quarter.turn)}
          </button>
        )}
      </div>
      {keyFacts}
      <div className="rc-cols">
        <div>
          {quarter.entries.length === 0 ? (
            <p className="small muted tl-empty">{emptyText}</p>
          ) : (
            <ul className="tl-list rc-list">
              {quarter.entries.map((e) => (
                <EntryItem
                  key={e.article.id}
                  entry={e}
                  text={describe(e)}
                  headline
                  onOpenIssue={openIssue}
                  onHover={onHoverEntry ? (players) => onHoverEntry(players, quarter.turn) : undefined}
                />
              ))}
            </ul>
          )}
          {hidden > 0 && <p className="small muted tl-empty">{h.hidden(hidden)}</p>}
        </div>
        <div>
          <div className="rc-stand-label">{live ? h.live : h.atClose(quarter.label)}</div>
          {rows.map(({ p, v }, i) => {
            const prevV = quarter.turn >= 2 ? worthAt(p, quarter.turn - 1, view) : undefined;
            const change = prevV !== undefined && prevV !== 0 ? v / prevV - 1 : undefined;
            const before = prevRank.get(p.id);
            const places = before !== undefined ? before - (i + 1) : 0;
            return (
              <div key={p.id} className={cx('rc-stand-row', p.id === view.you && 'mine')}>
                <span>{i + 1}.</span>
                <span className="rc-stand-name">
                  <Swatch color={p.color} size={9} />
                  {p.id === view.you ? t.common.youSuffix(p.name) : p.name}
                  {places > 0 && <span className="rc-places up">{h.placeUp(places)}</span>}
                  {places < 0 && <span className="rc-places down">{h.placeDown(-places)}</span>}
                </span>
                <span className="rc-stand-worth">{fmt.money(v)}</span>
                <span className="rc-stand-change">{change !== undefined ? <Delta value={change} digits={0} /> : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
