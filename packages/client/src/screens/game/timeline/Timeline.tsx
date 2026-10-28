/**
 * Chronologie de la partie : une frise (une colonne par trimestre, les pictogrammes des événements
 * marquants, les vôtres cerclés de votre couleur) et le détail en clair du trimestre choisi.
 * En haut du journal, choisir un trimestre ouvre aussi le numéro correspondant.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { dateLabel, type Id } from '@muchomoney/core';
import { useGame } from '../../../hooks/useGame';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { cx } from '../../../util';
import { messages, useContent, useT } from '../../../i18n';
import { useFmt } from '../../../fmt';
import { loadFlag, loadList, saveFlag, saveList } from '../../../storageFlags';
import { pctDigits } from '../../../rules';
import {
  DEFAULT_FAMILIES,
  EVENT_ICON,
  FAMILIES,
  FAMILY_ICON,
  eventText,
  filterEntries,
  nameAt,
  quarters,
  stripIcons,
  timelineEntries,
  type EventFamily,
  type TimelineEntry,
} from './model';

/** Pictogrammes au plus par colonne (les autres se résument en « +n »). */
const MAX_ICONS = 3;

/** Événements de toute la partie, recalculés à chaque nouvelle vue. */
export function useTimeline(): TimelineEntry[] {
  const { view } = useGame();
  return useMemo(() => timelineEntries(view), [view]);
}

/** Phrase claire d'une entrée : noms du moment, montants au format du salon, textes dans la langue de l'interface. */
export function useDescribe(): (entry: TimelineEntry) => { line: string; extra?: string } {
  const { view, playersById, companiesById } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const products = useMemo(() => {
    const names = new Map<Id, string>();
    for (const c of view.companies) for (const p of c.products) names.set(p.id, p.name);
    return names;
  }, [view]);
  return (entry) =>
    eventText(entry, {
      h: t.history,
      player: (id) => nameAt(id ? playersById.get(id) : undefined, entry.turn) ?? t.history.someone,
      company: (id) => (id ? companiesById.get(id)?.name : undefined) ?? t.common.unknown,
      product: (id) => (id ? products.get(id) : undefined),
      sector: (id) => (id ? content.sectors[id]?.name : undefined) ?? t.common.unknown,
      money: fmt.money,
      pct: (r) => fmt.pct(r, pctDigits(r)),
    });
}

interface Props {
  title: string;
  /** Trimestre dont le détail est affiché. */
  selected: number;
  onSelect: (turn: number) => void;
  /** Familles cochées au départ, et « seulement ce qui me concerne ». */
  defaultFamilies?: readonly EventFamily[];
  defaultMineOnly?: boolean;
  /** Mémoriser les cases dans ce navigateur, sous cette clé. */
  storageKey?: string;
  /** Hors du journal : bouton pour ouvrir le numéro du trimestre choisi. */
  onReadIssue?: (turn: number) => void;
  /** Rappeler le titre du journal sous chaque événement (inutile au-dessus du journal lui-même). */
  headlines?: boolean;
}

export function Timeline({
  title,
  selected,
  onSelect,
  defaultFamilies = DEFAULT_FAMILIES,
  defaultMineOnly = false,
  storageKey,
  onReadIssue,
  headlines = true,
}: Props) {
  const { view, me } = useGame();
  const t = useT();
  const h = t.history;
  const reduced = useReducedMotion();
  const titleId = useId();
  const all = useTimeline();
  const text = useDescribe();
  const [families, setFamilies] = useState<EventFamily[]>(() =>
    storageKey ? loadList(`${storageKey}.families`, FAMILIES, defaultFamilies) : [...defaultFamilies],
  );
  const [mineOnly, setMineOnly] = useState(() => (storageKey ? loadFlag(`${storageKey}.mineOnly`) : defaultMineOnly));
  const entries = filterEntries(all, { families, mineOnly });
  const cols = quarters(view, entries);
  const stripRef = useRef<HTMLOListElement>(null);
  const scrolled = useRef(false);

  // Garder le trimestre choisi visible dans la frise (défilement horizontal seulement : la page ne bouge pas).
  useEffect(() => {
    const strip = stripRef.current;
    const col = strip?.querySelector<HTMLElement>(`[data-turn="${selected}"]`);
    if (!strip || !col || typeof strip.scrollTo !== 'function') return;
    const left = Math.max(0, col.offsetLeft - (strip.clientWidth - col.offsetWidth) / 2);
    strip.scrollTo({ left, behavior: reduced || !scrolled.current ? 'auto' : 'smooth' });
    scrolled.current = true;
  }, [selected, reduced]);

  const toggleFamily = (f: EventFamily) => {
    const next = FAMILIES.filter((x) => (x === f ? !families.includes(f) : families.includes(x)));
    setFamilies(next);
    if (storageKey) saveList(`${storageKey}.families`, next);
  };
  const toggleMine = () => {
    setMineOnly(!mineOnly);
    if (storageKey) saveFlag(`${storageKey}.mineOnly`, !mineOnly);
  };

  const q = cols.find((c) => c.turn === selected);
  const list = q?.entries ?? [];
  const hidden = q ? all.filter((e) => e.quarter === q.turn).length - list.length : 0;
  const empty = families.length === 0 ? h.noFamily : entries.length === 0 ? (mineOnly ? h.emptyMine : h.empty) : h.emptyQuarter;
  const style = { '--me': me.color } as CSSProperties;

  return (
    <section className="timeline" aria-labelledby={titleId} style={style}>
      <h2 id={titleId} className="tl-title">
        <span aria-hidden>🗓️</span> {title}
      </h2>
      <p className="small muted tl-hint">{h.hint}</p>
      <TimelineFilters families={families} mineOnly={mineOnly} onToggleFamily={toggleFamily} onToggleMine={toggleMine} />

      <nav aria-label={h.stripAria}>
        <ol className="tl-strip" ref={stripRef}>
          {cols.map((c) => {
            const { shown, more } = stripIcons(c.entries, MAX_ICONS);
            const [quarter, year] = splitLabel(c.label);
            const isSel = c.turn === selected;
            return (
              <li
                key={c.turn}
                data-turn={c.turn}
                className={cx('tl-q', c.mine && 'mine', isSel && 'selected', c.future && 'future', c.current && 'current', !c.future && !c.current && 'past')}
              >
                <button
                  type="button"
                  disabled={!c.hasIssue}
                  aria-current={isSel ? 'true' : undefined}
                  aria-label={c.future ? h.futureAria(c.label) : h.quarterAria(c.label, c.entries.length, c.mine)}
                  onClick={() => onSelect(c.turn)}
                >
                  <span className="tl-icons" aria-hidden>
                    {shown.map((e) => (
                      <span key={e.article.id} className={cx('tl-ico', e.role && 'mine', `w${e.weight}`)}>
                        {EVENT_ICON[e.event.type]}
                      </span>
                    ))}
                    {more > 0 && <span className="tl-more">{h.more(more)}</span>}
                  </span>
                  <span className="tl-axis" aria-hidden>
                    <i />
                  </span>
                  <span className="tl-date" aria-hidden>
                    <span>{quarter}</span>
                    {year && <small>{year}</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {q && (
        <div className="tl-detail">
          <div className="tl-detail-head">
            <strong>{q.label}</strong>
            {onReadIssue && q.hasIssue && (
              <button type="button" className="btn tiny" onClick={() => onReadIssue(q.turn)}>
                <span aria-hidden>📰 </span>
                {h.readIssue(q.turn)}
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="small muted tl-empty">{empty}</p>
          ) : (
            <ul className="tl-list">
              {list.map((e) => (
                <EntryItem key={e.article.id} entry={e} text={text(e)} headline={headlines} onOpenIssue={onReadIssue} />
              ))}
            </ul>
          )}
          {hidden > 0 && families.length > 0 && <p className="small muted tl-empty">{h.hidden(hidden)}</p>}
        </div>
      )}
    </section>
  );
}

/** « T3 2027 » → ["T3", "2027"]. */
export function splitLabel(label: string): [string, string] {
  const i = label.lastIndexOf(' ');
  return i > 0 ? [label.slice(0, i), label.slice(i + 1)] : [label, ''];
}

/**
 * Cases à cocher de la chronologie : les 4 familles et « Seulement ce qui me concerne », plus des cases
 * supplémentaires éventuelles (ex. « Repères sur les courbes » dans « Fortunes et infortunes »).
 * Le choix et sa mémorisation restent chez l'appelant.
 */
export function TimelineFilters({
  families,
  mineOnly,
  onToggleFamily,
  onToggleMine,
  children,
}: {
  families: readonly EventFamily[];
  mineOnly: boolean;
  onToggleFamily: (f: EventFamily) => void;
  onToggleMine: () => void;
  children?: ReactNode;
}) {
  const h = useT().history;
  return (
    <div className="tl-filters" role="group" aria-label={h.filtersAria}>
      <span className="small muted" aria-hidden>
        {h.show}
      </span>
      {FAMILIES.map((f) => (
        <label key={f} className={cx('tl-check', families.includes(f) && 'on')}>
          <input type="checkbox" checked={families.includes(f)} onChange={() => onToggleFamily(f)} />
          <span aria-hidden>{FAMILY_ICON[f]}</span> {h.families[f]}
        </label>
      ))}
      <label className={cx('tl-check', mineOnly && 'on')}>
        <input type="checkbox" checked={mineOnly} onChange={onToggleMine} />
        <span className="tl-me-dot" aria-hidden /> {h.mineOnly}
      </label>
      {children}
    </div>
  );
}

/**
 * Un événement en clair : pictogramme, type, phrase, précision, et le titre du journal (langue du salon).
 * Avec `onOpenIssue`, le titre devient un lien vers le numéro qui l'a publié, et les résultats (datés du
 * trimestre qu'ils closent) rappellent leur numéro de parution.
 */
export function EntryItem({
  entry,
  text,
  headline,
  onOpenIssue,
  onHover,
}: {
  entry: TimelineEntry;
  text: { line: string; extra?: string };
  headline: boolean;
  onOpenIssue?: (turn: number) => void;
  /** Survol de la ligne (mise en avant des courbes des joueurs impliqués). */
  onHover?: (players: Id[] | null) => void;
}) {
  const { view } = useGame();
  const t = useT();
  const room = messages(view.config.lang);
  return (
    <li
      className={cx('tl-item', `w${entry.weight}`, entry.role && 'mine')}
      onPointerEnter={onHover ? () => onHover(entry.players) : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
    >
      <span className="tl-item-ico" aria-hidden>
        {EVENT_ICON[entry.event.type]}
      </span>
      <div>
        <div className="tl-kicker">
          {t.history.types[entry.event.type]}
          {entry.role && <span className="badge ink">{t.common.you}</span>}
        </div>
        <p className="tl-line">{text.line}</p>
        {text.extra && <p className="tl-extra">{text.extra}</p>}
        {headline && (
          <p className="tl-headline small muted">
            {onOpenIssue ? (
              <button type="button" className="tl-issue-link" onClick={() => onOpenIssue(entry.turn)}>
                <span aria-hidden>📰 </span>
                <span lang={view.config.lang}>{room.quote(entry.article.title)}</span>
              </button>
            ) : (
              <>
                <span aria-hidden>📰 </span>
                <span lang={view.config.lang}>{room.quote(entry.article.title)}</span>
              </>
            )}
            {onOpenIssue && entry.quarter !== entry.turn && <> · {t.history.publishedIn(entry.turn)}</>}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * « Ce qui s'est passé » : vos dernières pertes (prise de contrôle, faillite, passation), en clair,
 * avec le parachute touché et le titre du journal ce jour-là.
 */
export function LossSummary({
  entries,
  onReadIssue,
  level = 3,
}: {
  entries: TimelineEntry[];
  onReadIssue?: (turn: number) => void;
  /** 2 en tête de page (avant le titre de l'entreprise), 3 sous le titre de l'écran sans entreprise. */
  level?: 2 | 3;
}) {
  const { view } = useGame();
  const t = useT();
  const text = useDescribe();
  const titleId = useId();
  const room = messages(view.config.lang);
  const first = entries[0];
  if (!first) return null;
  const Heading = level === 2 ? 'h2' : 'h3';
  // Daté du trimestre où la perte s'est produite (une faillite paraît au numéro suivant) : le titre
  // correspond alors à la colonne sélectionnée de l'historique. Une prise de contrôle donne la même date qu'avant.
  const when = dateLabel(first.quarter, view.config.startYear, view.config.lang ?? 'fr');
  return (
    <section className="tl-summary" aria-labelledby={titleId}>
      <Heading id={titleId}>
        {t.history.whatHappened} · {when}
      </Heading>
      {entries.map((e) => {
        const { line, extra } = text(e);
        return (
          <div key={e.article.id} className="tl-summary-item">
            <span className="tl-item-ico" aria-hidden>
              {EVENT_ICON[e.event.type]}
            </span>
            <div>
              <p className="tl-line">{line}</p>
              {extra && <p className="tl-extra">{extra}</p>}
              <p className="small muted tl-headline">
                {t.history.source} <span lang={view.config.lang}>{room.quote(e.article.title)}</span>
              </p>
            </div>
          </div>
        );
      })}
      {onReadIssue && (
        <button type="button" className="btn small" onClick={() => onReadIssue(first.turn)}>
          <span aria-hidden>📰 </span>
          {t.history.readIssue(first.turn)}
        </button>
      )}
    </section>
  );
}
