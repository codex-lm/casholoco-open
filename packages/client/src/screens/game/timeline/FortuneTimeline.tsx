/**
 * « Fortunes et infortunes » (§12), sous le classement : les courbes de valeur nette sur toute la
 * partie (une colonne par trimestre, le futur hachuré), la frise des événements collée au graphe sur
 * la même échelle, les repères (badges) sur les courbes, les filtres, puis le détail du trimestre choisi.
 * Le détail suit le trimestre en cours tant que le joueur n'en a pas choisi un autre.
 */
import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { Id, PublicPlayer } from '@muchomoney/core';
import { useGame } from '../../../hooks/useGame';
import { useElementWidth } from '../../../hooks/useElementWidth';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { cx } from '../../../util';
import { useT } from '../../../i18n';
import { useFmt } from '../../../fmt';
import { loadFlag, loadList, saveFlag, saveList } from '../../../storageFlags';
import { LineChart, chartGeometry, type ChartGeometry, type ChartOverlay } from '../../../components/LineChart';
import {
  DEFAULT_FAMILIES,
  EVENT_ICON,
  FAMILIES,
  fanOut,
  filterEntries,
  pinsFor,
  quarters,
  stripIcons,
  type EventFamily,
  type Pin,
  type Quarter,
  type TimelineFilter,
} from './model';
import { TimelineFilters, splitLabel, useTimeline } from './Timeline';
import { QuarterDetail, worthAt } from './QuarterDetail';

/** Mêmes clés que la chronologie du journal : les réglages survivent au déménagement. */
const STORAGE = 'casholoco.timeline';
/** Pictogrammes au plus par colonne de la frise (les autres se résument en « +n »). */
const MAX_ICONS = 3;

/** « Repères sur les courbes » est coché par défaut : seul un « 0 » mémorisé le décoche. */
function loadPins(): boolean {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`${STORAGE}.pins`) : null;
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

/** Couleur estompée vers le papier (20 %), pour effacer les courbes non concernées par un survol. */
function fadeColor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number, p: number) => Math.round(c * 0.2 + p * 0.8);
  const r = mix(n >> 16, 0xf3);
  const g = mix((n >> 8) & 0xff, 0xec);
  const b = mix(n & 0xff, 0xdb);
  return `#${(((r << 16) | (g << 8) | b) >>> 0).toString(16).padStart(6, '0')}`;
}

interface Props {
  /** Trimestre conservé par la partie ; null suit le trimestre courant. */
  selectedTurn: number | null;
  onSelectTurn: (turn: number | null) => void;
  /** Ouvre un numéro du journal (onglet Journal). */
  openIssue?: (turn: number) => void;
}

export function FortuneTimeline({ selectedTurn, onSelectTurn, openIssue }: Props) {
  const { view, me, playersById } = useGame();
  const t = useT();
  const h = t.history;
  const fmt = useFmt();
  // matchMedia est absent sous jsdom (tests) : « min-width » y renvoie vrai → mise en page ordinateur.
  const phone = !useMediaQuery('(min-width: 701px)');
  const hatchId = `rc-hatch-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const all = useTimeline();

  const [families, setFamilies] = useState<EventFamily[]>(() => loadList(`${STORAGE}.families`, FAMILIES, DEFAULT_FAMILIES));
  const [mineOnly, setMineOnly] = useState(() => loadFlag(`${STORAGE}.mineOnly`));
  const [pinsOn, setPinsOn] = useState(loadPins);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null); // colonne survolée (index 0-based)
  const [focus, setFocus] = useState<{ players: Id[]; quarter: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const playing = view.phase !== 'finished';
  const lastTurn = playing && view.turn >= view.config.totalTurns;
  const slots = Math.max(view.config.totalTurns, view.turn);
  // Suit le trimestre en cours tant que rien n'est choisi ; jamais dans le futur.
  const selected = Math.min(Math.max(selectedTurn ?? view.turn, 1), view.turn);
  const select = (turn: number) => onSelectTurn(Math.min(Math.max(Math.round(turn), 1), view.turn));

  const filter: TimelineFilter = { families, mineOnly };
  const entries = filterEntries(all, filter);
  const cols = quarters(view, entries);
  const col = cols.find((c) => c.turn === selected) ?? cols[cols.length - 1];

  const [stageRef, width] = useElementWidth<HTMLDivElement>();
  const w = Math.max(200, width);
  const geo = chartGeometry(w, slots);
  const nowX = Math.min(geo.plotLeft + view.turn * geo.colW, geo.plotRight);
  const futureCols = slots - view.turn;

  const toggleFamily = (f: EventFamily) => {
    const next = FAMILIES.filter((x) => (x === f ? !families.includes(f) : families.includes(x)));
    setFamilies(next);
    saveList(`${STORAGE}.families`, next);
  };
  const toggleMine = () => {
    setMineOnly(!mineOnly);
    saveFlag(`${STORAGE}.mineOnly`, !mineOnly);
  };
  const togglePins = () => {
    setPinsOn(!pinsOn);
    saveFlag(`${STORAGE}.pins`, !pinsOn);
  };

  // Les courbes des joueurs impliqués dans l'élément survolé restent pleines, les autres passent à 20 %.
  const focusSet = focus && focus.players.length > 0 ? new Set(focus.players) : null;
  const series = view.players.map((p) => ({
    id: p.id,
    label: p.id === view.you ? t.common.youSuffix(p.name) : p.name,
    color: focusSet && !focusSet.has(p.id) ? fadeColor(p.color) : p.color,
    values: playing ? [...p.netWorthHistory.slice(0, Math.max(0, view.turn - 1)), p.netWorth] : p.netWorthHistory.slice(0, slots),
  }));
  // L'infobulle du graphe titre la colonne ; on y joint le nombre d'événements du trimestre.
  const labels = Array.from({ length: slots }, (_, i) => {
    const c = cols[i];
    if (!c) return '';
    return c.entries.length ? `${c.label} · ${h.events(c.entries.length)}` : c.label;
  });

  // Repères sur les courbes : regroupés par colonne pour l'éventail (fanOut).
  const pinsRes = pinsOn ? pinsFor(entries, filter, view.you, geo.colW) : null;
  const pinsMode = pinsRes?.mode ?? 'badges';
  // Sur téléphone, la colonne choisie déplie ses vrais badges (jusqu'à 3), en éventail sur ses voisines.
  const unfolded = pinsOn && phone ? pinsFor(entries, filter, view.you, 60).pins.filter((p) => p.quarter === selected) : null;
  const shownPins = unfolded ? [...(pinsRes?.pins ?? []).filter((p) => p.quarter !== selected), ...unfolded] : (pinsRes?.pins ?? []);
  const pinsByQuarter = new Map<number, Pin[]>();
  for (const pin of shownPins) {
    const list = pinsByQuarter.get(pin.quarter);
    if (list) list.push(pin);
    else pinsByQuarter.set(pin.quarter, [pin]);
  }

  const overlay = (ctx: ChartOverlay): ReactNode => {
    const sx = ctx.plotLeft + (selected - 1) * ctx.colW;
    const yearXs: number[] = [];
    for (let q = 4; q < ctx.slots; q += 4) yearXs.push(ctx.plotLeft + q * ctx.colW);
    const zoneW = ctx.plotRight - nowX;
    // « Maintenant » fait environ 68 px : sous 80 px de zone future, l'étiquette passe à gauche de la règle.
    const nowLeft = zoneW < 80;
    // La légende hachurée ne s'affiche que si son texte tient dans la zone (≈ 7,2 px par signe, marge comprise).
    const caption = h.future(futureCols);
    const captionFits = zoneW >= caption.length * 7.2 + 16;
    return (
      <g aria-hidden>
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line className="rc-hatch" x1="0" y1="0" x2="0" y2="6" />
          </pattern>
        </defs>
        {/* La bande du trimestre choisi : le plot est peint par LineChart (.chart-selected) ; on prolonge
            jusqu'aux bords du SVG et l'on trace les filets, pour une colonne continue jusqu'à la frise. */}
        <rect className="chart-selected" x={sx} y={0} width={ctx.colW} height={ctx.plotTop} />
        <rect className="chart-selected" x={sx} y={ctx.plotTop + ctx.plotH} width={ctx.colW} height={ctx.height - ctx.plotTop - ctx.plotH} />
        <line className="rc-sel-rule" x1={sx} y1={0} x2={sx} y2={ctx.height} />
        <line className="rc-sel-rule" x1={sx + ctx.colW} y1={0} x2={sx + ctx.colW} y2={ctx.height} />
        {/* Séparateurs d'année, très légers (entre T4 et T1). */}
        {yearXs.map((x) => (
          <line key={x} className="rc-year" x1={x} y1={ctx.plotTop} x2={x} y2={ctx.height} />
        ))}
        {futureCols > 0 && (
          <>
            <rect x={nowX} y={ctx.plotTop} width={zoneW} height={ctx.plotH} fill={`url(#${hatchId})`} />
            <line className="rc-now-rule" x1={nowX} y1={4} x2={nowX} y2={ctx.height} />
            <text className="rc-now" x={nowLeft ? nowX - 5 : nowX + 5} y={14} textAnchor={nowLeft ? 'end' : 'start'}>
              {h.now}
            </text>
            {captionFits && !phone && (
              <text className="rc-future" x={(nowX + ctx.plotRight) / 2} y={ctx.plotTop + ctx.plotH / 2} textAnchor="middle">
                {caption}
              </text>
            )}
          </>
        )}
        {/* Les points des joueurs impliqués dans l'élément survolé sont cerclés. */}
        {focus &&
          focus.players.length > 0 &&
          focus.players.map((id) => {
            const p = playersById.get(id);
            const v = p ? worthAt(p, focus.quarter, view) : undefined;
            return !p || v === undefined ? null : (
              <circle key={id} cx={ctx.x(focus.quarter)} cy={ctx.y(v)} r={6} fill="none" stroke={p.color} strokeWidth={2} />
            );
          })}
        {[...pinsByQuarter].map(([q, pins]) => {
          const pts = pins
            .map((pin) => ({ pin, p: playersById.get(pin.player) }))
            .filter((x): x is { pin: Pin; p: PublicPlayer } => x.p !== undefined)
            .map((x) => ({ ...x, v: worthAt(x.p, q, view) }))
            .filter((x): x is { pin: Pin; p: PublicPlayer; v: number } => x.v !== undefined);
          const offsets = fanOut(pts.map((x) => ctx.y(x.v)));
          // Sur téléphone, la colonne choisie déplie ses vrais badges, en éventail sur ses voisines.
          const dots = pinsMode === 'dots' && q !== selected;
          return pts.map(({ pin, p, v }, i) => {
            const dx = offsets[i];
            const bx = ctx.x(q) + dx;
            const by = ctx.y(v);
            const mine = pin.entry.role !== null;
            const involved = [...new Set<Id>([pin.player, ...pin.entry.players])];
            const tip = `${p.name} · ${fmt.money(v)}`;
            const handlers = {
              onPointerEnter: () => setFocus({ players: involved, quarter: q }),
              onPointerLeave: () => setFocus(null),
              onClick: () => select(q),
            };
            if (dots || pin.entry.weight === 1) {
              return (
                <g key={`${pin.entry.article.id}:${pin.player}`} className="rc-pin" {...handlers}>
                  <circle className="rc-pin-dot" cx={bx} cy={by} r={pin.entry.weight === 3 ? 4 : 3} fill={p.color} />
                  <title>{tip}</title>
                </g>
              );
            }
            const r = pin.entry.weight === 3 ? 10 : 8;
            return (
              <g key={`${pin.entry.article.id}:${pin.player}`} className="rc-pin" transform={`translate(${bx} ${by})`} {...handlers}>
                {dx !== 0 && (
                  <>
                    <line className="rc-lead" x1={0} y1={0} x2={-dx} y2={0} />
                    <circle className="rc-lead-dot" cx={-dx} cy={0} r={2} />
                  </>
                )}
                <circle className="rc-pin-halo" r={r + 2} />
                <circle className="rc-pin-disc" r={r} style={{ stroke: p.color }} />
                {mine && <circle className="rc-pin-mine" r={r + 3.5} />}
                <text className="rc-pin-ico" textAnchor="middle" dy="0.35em">
                  {EVENT_ICON[pin.entry.event.type]}
                </text>
                {pin.overflow.length > 0 && (
                  <g transform={`translate(${(r + 2) * 0.8} ${-(r + 2) * 0.8})`}>
                    <circle className="rc-pin-count" r={6.5} />
                    <text className="rc-pin-count-t" textAnchor="middle" dy="0.32em">
                      {pin.overflow.length + 1}
                    </text>
                  </g>
                )}
                <title>{tip}</title>
              </g>
            );
          });
        })}
      </g>
    );
  };

  const emptyText = families.length === 0 ? h.noFamily : entries.length === 0 ? (mineOnly ? h.emptyMine : h.empty) : h.emptyQuarter;
  const hidden = col && families.length > 0 ? all.filter((e) => e.quarter === col.turn).length - col.entries.length : 0;

  // Sur téléphone, l'essentiel du trimestre choisi tient en une ligne sous l'en-tête du détail :
  // ma fortune (en direct au trimestre en cours), sa variation sur le trimestre, mon rang, le meneur.
  let keyFacts: string | null = null;
  if (phone) {
    const mine = worthAt(me, selected, view);
    const board = view.players
      .map((p) => ({ p, v: worthAt(p, selected, view) }))
      .filter((r): r is { p: PublicPlayer; v: number } => r.v !== undefined)
      .sort((a, b) => b.v - a.v);
    const rank = board.findIndex((r) => r.p.id === view.you) + 1;
    const leader = board[0]?.p;
    if (mine !== undefined && rank > 0 && leader) {
      const before = selected >= 2 ? worthAt(me, selected - 1, view) : undefined;
      const change = before !== undefined && before !== 0 ? fmt.signedPct(mine / before - 1, 0) : null;
      keyFacts = h.keyFacts(fmt.money(mine), change, rank, board.length, leader.id === view.you ? t.common.youSuffix(leader.name) : leader.name);
    }
  }

  const filterRow = (
    <TimelineFilters families={families} mineOnly={mineOnly} onToggleFamily={toggleFamily} onToggleMine={toggleMine}>
      <label className={cx('tl-check', pinsOn && 'on')}>
        <input type="checkbox" checked={pinsOn} onChange={togglePins} />
        {h.pinsToggle}
      </label>
    </TimelineFilters>
  );

  return (
    <div className="rc" style={{ '--me': me.color } as CSSProperties}>
      <p className="small muted rc-help">
        {t.ranking.help}
        {lastTurn && (
          <>
            {' '}
            <em className="rc-last">{h.lastQuarter}</em>
          </>
        )}
      </p>
      <ul className="rc-legend">
        {view.players.map((p) => (
          <li key={p.id} className={cx(p.id === view.you && 'mine')}>
            <span className="line-key" style={{ background: p.color }} />
            {p.id === view.you ? t.common.youSuffix(p.name) : p.name}
          </li>
        ))}
      </ul>
      <div
        className="rc-stage"
        ref={stageRef}
        onPointerDown={phone ? () => setScrubbing(true) : undefined}
        onPointerUp={phone ? () => setScrubbing(false) : undefined}
        onPointerCancel={phone ? () => setScrubbing(false) : undefined}
      >
        <LineChart
          series={series}
          labels={labels}
          height={phone ? 220 : 264}
          slots={slots}
          hideXLabels
          liveLast={playing}
          hover={hover}
          onHoverChange={(i) => {
            const clamped = i !== null && i >= view.turn ? null : i;
            setHover(clamped);
            if (phone && scrubbing && clamped !== null) select(clamped + 1);
          }}
          onSelect={(i) => {
            if (i + 1 <= view.turn) select(i + 1);
          }}
          selected={selected - 1}
          overlay={overlay}
        />
        <Frieze
          cols={cols}
          geo={geo}
          width={w}
          slots={slots}
          selected={selected}
          hover={hover}
          current={view.turn}
          nowX={nowX}
          phone={phone}
          onSelect={select}
          onHover={setHover}
          onFocus={setFocus}
        />
      </div>
      {phone ? (
        <>
          <div className="rc-filters-bar">
            <button type="button" className="btn rc-filters-btn" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
              {h.filtersButton(families.length, FAMILIES.length)}
            </button>
            <span className="small muted">{h.scrubHint}</span>
          </div>
          {filtersOpen && filterRow}
        </>
      ) : (
        filterRow
      )}
      {col && (
        <QuarterDetail
          quarter={col}
          cols={cols}
          hidden={Math.max(0, hidden)}
          emptyText={emptyText}
          current={view.turn}
          playing={playing}
          openIssue={openIssue}
          onSelect={select}
          keyFacts={keyFacts !== null ? <p className="small muted rc-facts">{keyFacts}</p> : undefined}
          onHoverEntry={(players, quarter) => setFocus(players && players.length > 0 ? { players, quarter } : null)}
        />
      )}
    </div>
  );
}

/**
 * Frise collée sous le graphe, mêmes colonnes (mêmes marges, même largeur de colonne) : pictogrammes
 * des événements (pastille de la couleur du principal joueur impliqué, les vôtres cerclés), axe des
 * trimestres, dates, drapeau d'arrivée. Un seul arrêt de tabulation : ← → déplacent la sélection.
 */
function Frieze({
  cols,
  geo,
  width,
  slots,
  selected,
  hover,
  current,
  nowX,
  phone,
  onSelect,
  onHover,
  onFocus,
}: {
  cols: Quarter[];
  geo: ChartGeometry;
  width: number;
  slots: number;
  selected: number;
  hover: number | null;
  current: number;
  nowX: number;
  phone: boolean;
  onSelect: (turn: number) => void;
  onHover: (i: number | null) => void;
  onFocus: (focus: { players: Id[]; quarter: number } | null) => void;
}) {
  const { view, me, playersById } = useGame();
  const h = useT().history;
  const height = phone ? 64 : 118;
  const axisY = phone ? 42 : 86;
  const iconYs = phone ? [32, 23, 14] : [66, 41, 16];
  const col = cols.find((c) => c.turn === selected);
  const selX = geo.plotLeft + (selected - 1) * geo.colW;
  const yearXs: number[] = [];
  for (let q = 4; q < slots; q += 4) yearXs.push(geo.plotLeft + q * geo.colW);
  // « Chronologie » dans la gouttière, sur deux lignes (ordonnateur seulement).
  const word = h.title.toUpperCase();
  const half = Math.ceil(word.length / 2);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      onSelect(selected - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      onSelect(selected + 1);
      e.preventDefault();
    } else if (e.key === 'Home') {
      onSelect(1);
      e.preventDefault();
    } else if (e.key === 'End') {
      onSelect(current);
      e.preventDefault();
    }
  };

  return (
    <div
      className="rc-frieze-wrap"
      role="slider"
      tabIndex={0}
      aria-label={h.stripAria}
      aria-valuemin={1}
      aria-valuemax={current}
      aria-valuenow={selected}
      aria-valuetext={col ? h.quarterAria(col.label, col.entries.length, col.mine) : undefined}
      onKeyDown={onKey}
    >
      <svg className="rc-frieze rc-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
        <rect className="chart-selected" x={selX} y={0} width={geo.colW} height={height} />
        <line className="rc-sel-rule" x1={selX} y1={0} x2={selX} y2={height} />
        <line className="rc-sel-rule" x1={selX + geo.colW} y1={0} x2={selX + geo.colW} y2={height} />
        {hover !== null && hover < slots && hover !== selected - 1 && (
          <rect className="rc-hover-band" x={geo.plotLeft + hover * geo.colW} y={0} width={geo.colW} height={height} />
        )}
        {yearXs.map((x) => (
          <line key={x} className="rc-year" x1={x} y1={0} x2={x} y2={height} />
        ))}
        {!phone && (
          <text className="rc-gutter" x={4} y={40}>
            <tspan x={4} dy={0}>
              {word.slice(0, half)}
            </tspan>
            <tspan x={4} dy={13}>
              {word.slice(half)}
            </tspan>
          </text>
        )}
        <line className="rc-axis-past" x1={geo.plotLeft} y1={axisY} x2={nowX} y2={axisY} />
        {nowX < geo.plotRight && <line className="rc-axis-future" x1={nowX} y1={axisY} x2={geo.plotRight} y2={axisY} />}
        {cols.slice(0, slots).map((c) => {
          const x = geo.x(c.turn);
          const [qt, yr] = splitLabel(c.label);
          const { shown, more } = stripIcons(c.entries, MAX_ICONS);
          return (
            <g
              key={c.turn}
              onClick={c.future ? undefined : () => onSelect(c.turn)}
              onPointerEnter={c.future ? undefined : () => onHover(c.turn - 1)}
              onPointerLeave={c.future ? undefined : () => onHover(null)}
            >
              {!c.future && (
                <rect
                  x={geo.plotLeft + (c.turn - 1) * geo.colW}
                  y={0}
                  width={geo.colW}
                  height={height}
                  fill="transparent"
                  pointerEvents="all"
                  style={{ cursor: 'pointer' }}
                />
              )}
              {!c.future &&
                shown.map((e, i) => {
                  const y = iconYs[i];
                  const lead = e.lead ? playersById.get(e.lead) : undefined;
                  const enter = () => {
                    onHover(c.turn - 1);
                    if (e.players.length > 0) onFocus({ players: e.players, quarter: c.turn });
                  };
                  return phone ? (
                    <circle
                      key={e.article.id}
                      className={cx('rc-frieze-dot', e.role && 'mine')}
                      cx={x}
                      cy={y}
                      r={e.weight === 3 ? 3.5 : 2.6}
                      fill={lead?.color ?? 'var(--muted)'}
                      onPointerEnter={enter}
                      onPointerLeave={() => onFocus(null)}
                    />
                  ) : (
                    <g key={e.article.id} className={cx('rc-ico', e.role && 'mine')} onPointerEnter={enter} onPointerLeave={() => onFocus(null)}>
                      <circle className="rc-ico-halo" cx={x} cy={y} r={12} />
                      <circle className="rc-ico-disc" cx={x} cy={y} r={10} />
                      {e.role && <circle className="rc-ico-mine" cx={x} cy={y} r={11.5} />}
                      <text className="rc-ico-txt" x={x} y={y} textAnchor="middle" dy="0.35em">
                        {EVENT_ICON[e.event.type]}
                      </text>
                      {lead && <circle className="rc-who" cx={x + 8} cy={y + 8} r={3.5} fill={lead.color} />}
                    </g>
                  );
                })}
              {!c.future && !phone && more > 0 && (
                <text className="rc-more" x={x + 14} y={iconYs[Math.min(shown.length, MAX_ICONS) - 1] + 4}>
                  {h.more(more)}
                </text>
              )}
              {c.future ? (
                <circle className="rc-axis-dot-fut" cx={x} cy={axisY} r={4} />
              ) : c.current ? (
                <circle className="rc-axis-dot-cur" cx={x} cy={axisY} r={5} style={{ stroke: me.color }} />
              ) : (
                <circle className="rc-axis-dot-past" cx={x} cy={axisY} r={4} />
              )}
              {!phone && (
                <>
                  <text className={cx('rc-date', c.future && 'fut', c.current && 'cur')} x={x} y={axisY + 18} textAnchor="middle">
                    {qt}
                  </text>
                  <text className={cx('rc-date-year', c.future && 'fut')} x={x} y={axisY + 30} textAnchor="middle">
                    {yr}
                  </text>
                </>
              )}
            </g>
          );
        })}
        {phone &&
          (() => {
            const labels: ReactNode[] = [];
            for (let ys = 1; ys <= slots; ys += 4) {
              const last = Math.min(ys + 3, slots);
              labels.push(
                <text key={ys} className="rc-year-label" x={(geo.x(ys) + geo.x(last)) / 2} y={58} textAnchor="middle">
                  {view.config.startYear + Math.floor((ys - 1) / 4)}
                </text>,
              );
            }
            return labels;
          })()}
        <path className="rc-flag" d={`M${geo.plotRight - 2} ${axisY - 2} V${axisY - 22} h10 v6 h-10`} />
      </svg>
    </div>
  );
}
