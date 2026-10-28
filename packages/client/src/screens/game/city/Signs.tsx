/**
 * L'onglet « La carte », carte classique : les trois panneaux routiers repris de l'ancienne entrée de la ville
 * (vous, menace, occasion). Des constats chiffrés, jamais des conseils ; chaque nombre dessiné reste
 * écrit sur le panneau (ou dans l'infobulle de son dessin). Le plateau hexagonal n'en a pas : rang et menaces
 * sont dans la barre du jeu, l'occasion dans la barre de la carte (OpeningChip).
 *   Vous : une usine par produit (couleur du toit et signe = verdict du trimestre), puis les maisons des
 *     fortunes du salon (hauteur = valeur nette, la vôtre en couleur, rang au-dessus) ; chaque maison ouvre
 *     la fiche de son joueur, le reste du panneau (plaque du rang comprise) la vôtre.
 *   Menace : bras de fer du capital (votre part à gauche, la sienne à droite, 50 % au milieu) ou thermomètre
 *     du scandale (jauge sur 100, seuils moyen et élevé) ; sinon un chien de garde qui dort. Le panneau
 *     ouvre la fiche de l'entreprise concernée.
 *   Occasion : les trimestres restants (hachurés jusqu'au remboursement, des pièces ensuite) ou le cadran
 *     du prix d'une matière (de la moitié au double du prix de base) ; sinon un virevoltant. Le panneau
 *     envoie lancer le produit sur la carte (secteur conseillé en intention) ou ouvre l'onglet Matières.
 * Mise en page en pixels réels : colonnes et dessins calculés d'après la largeur mesurée.
 */
import { useCallback, useId, useState, type CSSProperties, type ReactNode } from 'react';
import type { CommodityId, CompanyView, PlayerView, PublicPlayer, SectorId } from '@muchomoney/core';
import { COMMODITIES, SECTORS } from '@muchomoney/core';
import { useGame } from '../../../hooks/useGame';
import { useElementWidth } from '../../../hooks/useElementWidth';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { Modal } from '../../../components/Modal';
import { Delta, InfoTip } from '../../../components/bits';
import { SCANDAL_LEVEL_THRESHOLDS } from '../../../rules';
import { cx, frenchSpacing, nbsp } from '../../../util';
import { useContent, useT, useUiLang } from '../../../i18n';
import { signsReadability } from '../../../i18n/signsReadability';
import { SIGNS_EXPANDED_KEY, loadFlag, saveFlag } from '../../../storageFlags';
import { useFmt } from '../../../fmt';
import type { TabId } from '../../GameScreen';
import type { MapIntent } from '../mapIntent';
import { CompanyDetail } from '../CompanyDetail';
import { DARK, HAIR, INK, LIT, PAPER, PAPER2, Person, SKINS } from '../factories/parts';
import type { FlowStatus } from '../factories/model';
import { pressable, useInView } from './a11y';
import { isOwn } from './privacy';
import { EVENT_ICON, lastLosses } from '../timeline/model';
import { useDescribe, useTimeline } from '../timeline/Timeline';
import { PHONE_W, companyMatches, launchCompany, netWorthRanks, openingLaunchTarget, openingSign, threatSign, youSign, type CityFilter, type CityTarget } from './model';
import { PlayerSheet } from './PlayerSheet';

// ---------------------------------------------------------------------------
// Géométrie (px réels) et couleurs
// ---------------------------------------------------------------------------

/** Bordure et marge intérieure d'un panneau (voir styles.css) : la largeur des dessins s'en déduit. */
const BORDER = 3;
const PAD = 12;
const GAP_DESK = 14;
const GAP_PHONE = 12;
/** Au-delà de cette largeur, les trois panneaux tiennent sur une ligne ; entre PHONE_W et elle, deux par ligne. */
const ONE_LINE_W = 980;

const RED = '#b0271d';
const BLUE = '#2e5c8a';
const WARN = '#8a5a00';
const UP = '#1d6b35';
const WHITE = '#fffdf7';
/** Jaune des petits textes sur le bleu : LIT n'y fait que 4,2:1, celui-ci passe les 4,5:1 exigés (5,1:1). */
const LIT_TEXT = '#ffd97a';

/** Pas de mise en avant sur les panneaux : les filtres sont ceux de la carte, en dessous. */
const FILTER_ALL: CityFilter = { kind: 'all' };

/** Ordre des usines sur le panneau « Vous » : les soucis d'abord. */
const STATUS_ORDER: FlowStatus[] = ['shortage', 'surplus', 'idle', 'building', 'unknown', 'balanced'];
const STATUS_COLOR: Record<FlowStatus, string> = { shortage: RED, surplus: WARN, idle: DARK, building: HAIR, unknown: HAIR, balanced: UP };

/** Largeur approximative d'un texte en 10 px (sans empattement), pour tronquer sans mesurer. */
const textW = (s: string, size = 10) => s.length * size * 0.58;

function clip(s: string, maxW: number, size = 10): string {
  const max = Math.max(3, Math.floor(maxW / (size * 0.58)));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Une participation proche du seuil (45 à 55 %) garde une décimale : 49,6 % ne s'affiche pas « 50 % ». */
const stakeDigits = (r: number) => (r >= 0.45 && r <= 0.55 ? 1 : 0);

// ---------------------------------------------------------------------------
// Les trois panneaux
// ---------------------------------------------------------------------------

interface Props {
  /** Entreprise sélectionnée dans le jeu (celle qui lance un produit depuis le panneau Occasion). */
  company: CompanyView | null;
  /** Sélectionne une de mes entreprises dans le jeu : celle que montrent ensuite l'onglet Entreprise et « Mes usines ». */
  onSelect: (id: string) => void;
  goTo: (tab: TabId) => void;
  /** Bascule vers la vue « Mes usines » (bouton de la fiche d'entreprise). */
  onFactories: () => void;
  /** « Figer la scène » : l'état vit dans CityTab, commun à la carte et aux panneaux. */
  frozen: boolean;
  /** Le lancement du panneau Occasion se prépare sur la carte, avec l'entreprise qui a de la place. */
  openMapFor: (intent: MapIntent) => void;
}

export function Signs({ company, onSelect, goTo, onFactories, frozen, openMapFor }: Props) {
  const { view, companiesById } = useGame();
  const t = useT();
  const reduced = useReducedMotion();
  const still = reduced || frozen;
  const [sectionRef, inView] = useInView<HTMLElement>();
  const [rowRef, W] = useElementWidth<HTMLDivElement>(1000);
  const [collapsed, setCollapsed] = useState(() => !loadFlag(SIGNS_EXPANDED_KEY));
  const toggle = () => {
    const next = !collapsed;
    saveFlag(SIGNS_EXPANDED_KEY, !next);
    setCollapsed(next);
  };
  const disclosure = { collapsed, onToggle: toggle };
  const phone = W < PHONE_W;
  const cols = phone ? 1 : W < ONE_LINE_W ? 2 : 3;
  const gap = phone ? GAP_PHONE : GAP_DESK;
  const colW = (W - gap * (cols - 1)) / cols;
  const artW = Math.max(140, Math.floor(colW - 2 * (BORDER + PAD)));
  const live = !still && inView;
  // Le sol se prolonge sous l'espace entre deux colonnes d'une même ligne.
  const join = (i: number) => i % cols !== cols - 1;
  const style = { '--ent-gap': `${gap}px` } as CSSProperties;

  // Ce qu'ouvre un clic : une matière mène au port, un lancement se prépare sur la carte,
  // une fortune la fiche de son joueur, le reste une fiche locale.
  const [target, setTarget] = useState<CityTarget | null>(null);
  // Entreprise qui lance depuis le panneau Occasion : la sélectionnée si elle a de la place, sinon la première qui en a.
  const launcher = (): CompanyView | null => launchCompany(view, company);
  const open = useCallback(
    (next: CityTarget) => {
      if (next.kind === 'commodity') goTo('commodities');
      else if (next.kind === 'launch') {
        const c = launcher();
        if (c) openMapFor({ kind: 'launch', companyId: c.id, sectorId: next.sectorId, ...(next.hexId !== undefined ? { hexId: next.hexId } : {}) });
      } else setTarget(next);
    },
    // view et company entrent dans launcher() : pas de mémoïsation trompeuse.
    [goTo, openMapFor, company, view],
  );
  const close = useCallback(() => setTarget(null), []);
  // Mes commandes (onglet Entreprise, « Mes usines ») montrent l'entreprise sélectionnée : on sélectionne d'abord celle de la fiche.
  const manage = (id: string) => {
    onSelect(id);
    goTo('company');
  };
  const factoriesOf = (id: string) => {
    onSelect(id);
    onFactories();
  };

  const sheet = (() => {
    if (!target) return null;
    if (target.kind === 'company') {
      const c = companiesById.get(target.id);
      if (!c) return null;
      return (
        <Modal key={`company:${c.id}`} title={`${c.emoji} ${c.name} · ${c.ticker}`} onClose={close} wide>
          {isOwn(c) && (
            <div className="row wrap city-sheet-actions">
              <button type="button" className="btn small" onClick={() => manage(c.id)}>
                {t.city.shell.manage}
              </button>
              <button type="button" className="btn small ghost" onClick={() => factoriesOf(c.id)}>
                {t.city.shell.viewInFactories}
              </button>
            </div>
          )}
          <CompanyDetail company={c} onClose={close} embedded />
        </Modal>
      );
    }
    if (target.kind === 'player') {
      const p = view.players.find((x) => x.id === target.id);
      if (!p) return null;
      return (
        <Modal key={`player:${p.id}`} title={p.name} onClose={close}>
          <PlayerSheet player={p} onOpen={open} />
        </Modal>
      );
    }
    return null;
  })();

  return (
    <>
      {/* `.city` : curseur et anneau de focus des zones cliquables ; `.city-paused` fige tout sous une fiche. */}
      <div className={cx('city', sheet && 'city-paused')}>
        <section ref={sectionRef} className={cx('ent', collapsed && 'ent-compact', live && 'ent-live', phone && 'ent-phone')} aria-label={t.city.signs.entranceAria} style={style}>
          <div ref={rowRef} className="ent-row" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: `${phone ? 8 : gap + 4}px ${gap}px` }}>
            <YouSign view={view} filter={FILTER_ALL} width={artW} join={join(0)} onOpen={open} {...disclosure} />
            <ThreatSign view={view} filter={FILTER_ALL} width={artW} join={join(1)} live={live} onOpen={open} {...disclosure} />
            <OpeningSign view={view} width={artW} join={join(2)} live={live} onOpen={open} {...disclosure} />
          </div>
        </section>
      </div>
      {/* Fiches hors de `.city` : la pause des animations des panneaux ne fige pas une fiche ouverte. */}
      {sheet}
    </>
  );
}

// ---------------------------------------------------------------------------
// Panneau routier : tête (titre, infobulle, plaque), corps cliquable, deux poteaux plantés dans le trottoir
// ---------------------------------------------------------------------------

interface Disclosure {
  collapsed: boolean;
  onToggle: () => void;
}

function Sign({
  kind,
  title,
  icon,
  tip,
  plate,
  press,
  dim,
  join,
  after,
  summary,
  collapsed,
  onToggle,
  directAction,
  children,
}: Disclosure & {
  kind: 'you' | 'threat' | 'opening';
  title: string;
  icon?: ReactNode;
  tip?: string;
  plate?: string;
  press?: ReturnType<typeof pressable>;
  dim?: boolean;
  join: boolean;
  /** Bas du panneau, hors du bouton : dessin aux cibles cliquables propres (les maisons des fortunes). */
  after?: ReactNode;
  summary: { fact?: string; figure?: string };
  directAction?: { label: string; aria: string; onClick: () => void };
  children: ReactNode;
}) {
  const text = signsReadability(useUiLang());
  const bodyId = useId();
  const label = [collapsed ? text.expand(title) : text.collapse(title), summary.fact, summary.figure, plate].filter(Boolean).join(' · ');
  return (
    <div className={cx('ent-col', join && 'ent-join')}>
      {/* Mise en avant : le panneau et ses poteaux s'effacent, le trottoir reste continu. */}
      <div className={cx('ent-sign', `ent-${kind}`, dim && 'city-dim')}>
        <div className="ent-sign-head ent-summary-row">
          <button type="button" className="ent-sign-toggle" aria-expanded={!collapsed} aria-controls={bodyId} aria-label={label} title={label} onClick={onToggle}>
            {icon}
            <span className="ent-title">{title}</span>
            {summary.fact && <span className="ent-summary-fact">{summary.fact}</span>}
            {summary.figure && <strong className="ent-summary-figure">{summary.figure}</strong>}
            {plate && <span className="ent-plate">{plate}</span>}
            <span className="ent-summary-chevron" aria-hidden>{collapsed ? '▸' : '▾'}</span>
          </button>
          {tip && <InfoTip text={tip} align="right" />}
          {directAction && <button type="button" className="ent-summary-action" aria-label={directAction.aria} onClick={directAction.onClick}>{directAction.label}</button>}
        </div>
        <div id={bodyId} hidden={collapsed}>
          {!collapsed && <>
            <div className={cx('ent-sign-body', press && 'ent-press')} {...(press ?? {})}>{children}</div>
            {after && <div className="ent-sign-after">{after}</div>}
          </>}
        </div>
      </div>
      <div className={cx('ent-posts', dim && 'city-dim')} aria-hidden>
        <i />
        <i />
      </div>
      <div className="ent-ground" aria-hidden />
    </div>
  );
}

// ---------------------------------------------------------------------------
// « Vous » : panneau d'entrée d'agglomération (blanc à bord rouge), votre nom en guise de ville
// ---------------------------------------------------------------------------

function YouSign({ view, filter, width, join, onOpen, ...disclosure }: Disclosure & { view: PlayerView; filter: CityFilter; width: number; join: boolean; onOpen: (t: CityTarget) => void }) {
  const t = useT();
  const fmt = useFmt();
  const s = t.city.signs;
  const sign = youSign(view);
  const describe = useDescribe();
  // Sans entreprise : dire comment on l'a perdue (la chronologie du journal a le détail).
  const loss = lastLosses(useTimeline()).at(-1);
  const lossText = loss ? `${loss.dateLabel} · ${describe(loss).line}` : null;
  const fortunes = <Fortunes view={view} filter={filter} width={width} onOpen={onOpen} />;
  if (!sign) {
    return (
      <Sign kind="you" title={s.you} join={join} summary={{ fact: s.spectator }} {...disclosure}>
        {fortunes}
        <p className="ent-text">{s.spectator}</p>
      </Sign>
    );
  }
  const { player, rank, total, change, hasCompany, counts } = sign;
  const rankLabel = s.rank(t.ordinal(rank), total);
  const worth = nbsp(fmt.money(player.netWorth));
  const countsText = s.counts(counts);
  const aria = s.aria(
    s.you,
    [player.name, rankLabel, worth, change !== null ? s.sinceClose(fmt.signedPct(change)) : '', hasCompany ? countsText : (lossText ?? ''), hasCompany ? '' : s.noCompany]
      .filter(Boolean)
      .join(' · '),
  );
  return (
    <Sign kind="you" title={s.you} plate={rankLabel} join={join} summary={{ figure: worth }} {...disclosure} press={pressable(aria, () => onOpen({ kind: 'player', id: player.id }))} after={fortunes}>
      {player.name.trim().toLowerCase() !== s.you.toLowerCase() && <div className="ent-name">{player.name}</div>}
      <div className="ent-worth">
        <strong>{worth}</strong>
        {change !== null && (
          <span className="ent-since">
            <Delta value={change} /> <span className="muted">{s.closeLabel}</span>
          </span>
        )}
      </div>
      {hasCompany ? (
        <>
          <Factories counts={counts} width={width} />
          <p className="ent-text">{countsText}</p>
        </>
      ) : (
        <>
          {loss && lossText && (
            <p className="ent-text ent-loss">
              <span aria-hidden>{EVENT_ICON[loss.event.type]} </span>
              {lossText}
            </p>
          )}
          <p className="ent-text">{s.noCompany}</p>
        </>
      )}
    </Sign>
  );
}

/**
 * Colonnes des fortunes : une maison par joueur, du plus riche au plus pauvre, hauteur = valeur nette.
 * Chaque maison est un bouton vers la fiche de son joueur (zone de clic : toute sa colonne).
 */
function Fortunes({ view, filter, width, onOpen }: { view: PlayerView; filter: CityFilter; width: number; onOpen: (t: CityTarget) => void }) {
  const t = useT();
  const fmt = useFmt();
  const ranks = netWorthRanks(view.players);
  const players = [...view.players].sort((a, b) => (ranks.get(a.id) ?? 99) - (ranks.get(b.id) ?? 99));
  const n = Math.max(1, players.length);
  const H = 50;
  const base = H - 4;
  const top = 15;
  const gap = n > 6 ? 3 : 5;
  const bw = Math.min(34, (width - gap * (n - 1)) / n);
  const roof = bw >= 10 ? 5 : 0;
  const max = Math.max(1e-9, ...players.map((p) => p.netWorth));
  const height = (v: number) => Math.max(2, (Math.max(0, v) / max) * (base - top - roof));
  // Mise en avant : le joueur filtré (et vous) restent nets, les autres s'effacent.
  const lit = (p: PublicPlayer) => (filter.kind === 'all' ? true : filter.kind === 'mine' ? p.id === view.you : p.id === filter.id || p.id === view.you);
  return (
    <svg className="ent-art ent-fortunes" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="group" aria-label={t.city.signs.fortunes}>
      <line x1={0} x2={width} y1={base} y2={base} stroke={INK} strokeWidth={1.2} />
      {players.map((p, i) => {
        const x = i * (bw + gap);
        const h = height(p.netWorth);
        const me = p.id === view.you;
        const label = t.city.signs.fortuneOf(p.name, fmt.money(p.netWorth));
        const hitX = Math.max(0, x - gap / 2);
        const hitW = Math.min(width, x + bw + gap / 2) - hitX;
        return (
          <g key={p.id} className={cx(!lit(p) && 'city-dim')} {...pressable(label, () => onOpen({ kind: 'player', id: p.id }))}>
            <rect x={hitX} y={0} width={hitW} height={H} fill="transparent" />
            <title>{label}</title>
            <rect x={x} y={base - h} width={bw} height={h} fill={p.color} fillOpacity={me ? 1 : 0.42} stroke={INK} strokeWidth={me ? 1.3 : 0.6} />
            {roof > 0 && <path d={`M${x - 1} ${base - h} L${x + bw / 2} ${base - h - roof} L${x + bw + 1} ${base - h} Z`} fill={me ? INK : PAPER2} stroke={INK} strokeWidth={0.7} />}
            {me && h >= 9 && bw >= 10 && <rect x={x + bw / 2 - 2.5} y={base - h + 3} width={5} height={5} fill={LIT} stroke={INK} strokeWidth={0.6} />}
            {p.netWorth < 0 && <rect x={x} y={base + 1} width={bw} height={2.5} fill={RED} />}
            {me && (
              <text x={Math.min(width - 12, Math.max(12, x + bw / 2))} y={base - h - roof - 3} textAnchor="middle" className="ent-svg-label ent-strong">
                {t.ordinal(ranks.get(p.id) ?? n)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Une usine par produit : toit à la couleur du verdict, et son signe (« ! » rupture, caisses invendues…). */
function Factories({ counts, width }: { counts: Record<FlowStatus, number>; width: number }) {
  const t = useT();
  const items = STATUS_ORDER.flatMap((s) => Array.from({ length: counts[s] }, () => s));
  if (items.length === 0) return null;
  const step = 25;
  const H = 30;
  const room = Math.max(1, Math.floor((width - 22) / step));
  const shown = items.length > room ? items.slice(0, room) : items;
  const rest = items.length - shown.length;
  const w = Math.min(width, shown.length * step + (rest > 0 ? 22 : 0));
  return (
    <svg className="ent-art ent-factories" width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={t.city.signs.products}>
      {shown.map((s, i) => (
        <FactoryIcon key={i} x={i * step + 1} ground={H - 2} status={s} title={t.factories.status[s]} />
      ))}
      {rest > 0 && (
        <text x={shown.length * step + 2} y={H - 6} className="ent-svg-label ent-strong">
          +{rest}
        </text>
      )}
    </svg>
  );
}

function FactoryIcon({ x, ground, status, title }: { x: number; ground: number; status: FlowStatus; title: string }) {
  const top = ground - 10;
  const color = STATUS_COLOR[status];
  const building = status === 'building';
  const dark = status === 'idle';
  return (
    <g>
      <title>{title}</title>
      <path
        d={`M${x} ${ground} V${top} L${x + 4} ${top - 5} V${top} L${x + 8} ${top - 5} V${top} L${x + 12} ${top - 5} V${top} H${x + 16} V${ground} Z`}
        fill={building ? 'none' : PAPER}
        stroke={building ? DARK : INK}
        strokeDasharray={building ? '2 1.5' : undefined}
        strokeWidth={1}
      />
      {!building && <path d={`M${x} ${top} L${x + 4} ${top - 5} V${top} L${x + 8} ${top - 5} V${top} L${x + 12} ${top - 5} V${top} Z`} fill={color} stroke={INK} strokeWidth={0.8} />}
      <rect x={x + 12.5} y={top - 9} width={3} height={9} fill={building ? 'none' : color} stroke={INK} strokeWidth={0.7} strokeDasharray={building ? '2 1.5' : undefined} />
      {!building && (
        <>
          <rect x={x + 3} y={top + 3} width={4} height={4} fill={dark ? DARK : LIT} stroke={INK} strokeWidth={0.4} />
          <rect x={x + 9} y={top + 3} width={4} height={4} fill={dark ? DARK : LIT} stroke={INK} strokeWidth={0.4} />
        </>
      )}
      {status === 'balanced' && <circle cx={x + 16} cy={top - 12} r={2.6} fill="#cfc9bd" stroke={INK} strokeWidth={0.4} />}
      {status === 'shortage' && (
        <g>
          <circle cx={x + 5} cy={top - 11} r={4.5} fill={WHITE} stroke={RED} strokeWidth={1.1} />
          <text x={x + 5} y={top - 10.6} textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight={700} fill={RED}>
            !
          </text>
        </g>
      )}
      {status === 'surplus' && (
        <g>
          <rect x={x + 17} y={ground - 5} width={5} height={5} fill={WARN} stroke={INK} strokeWidth={0.5} />
          <rect x={x + 17} y={ground - 10} width={5} height={5} fill={WARN} stroke={INK} strokeWidth={0.5} />
        </g>
      )}
      {building && <path d={`M${x + 20} ${ground} V${top - 10} H${x + 8} M${x + 11} ${top - 10} V${top - 5}`} stroke={INK} strokeWidth={0.8} fill="none" />}
      {status === 'unknown' && (
        <text x={x + 5} y={top - 9} textAnchor="middle" fontSize={8} fontWeight={700} fill={DARK}>
          ?
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// « Menace » : panneau de danger (triangle rouge sur fond jaune pâle)
// ---------------------------------------------------------------------------

function ThreatSign({ view, filter, width, join, live, onOpen, ...disclosure }: Disclosure & { view: PlayerView; filter: CityFilter; width: number; join: boolean; live: boolean; onOpen: (t: CityTarget) => void }) {
  const t = useT();
  const fmt = useFmt();
  const s = t.city.signs;
  const compact = signsReadability(useUiLang());
  const threat = threatSign(view);
  const icon = <Triangle alarm={threat.kind !== 'none'} />;
  if (threat.kind === 'none') {
    return (
      <Sign kind="threat" title={s.threat} icon={icon} tip={s.observation} join={join} summary={{ fact: s.calm }} {...disclosure}>
        <Kennel live={live} />
        <p className="ent-text">{s.calm}</p>
      </Sign>
    );
  }
  const company = threat.company;
  // Seuil du contrôle et pourcentages dans la langue du salon, comme les autres nombres du panneau.
  const text =
    threat.kind === 'stake'
      ? s.stake(threat.holder.name, nbsp(fmt.pct(threat.pct, stakeDigits(threat.pct))), nbsp(fmt.pct(0.5, 0)))
      : s.scandal(Math.round(threat.gauge), nbsp(fmt.pct(threat.risk, 0)));
  return (
    <Sign
      kind="threat"
      title={s.threat}
      icon={icon}
      tip={s.observation}
      join={join}
      summary={{ fact: company.name, figure: threat.kind === 'stake' ? compact.stake(nbsp(fmt.pct(threat.pct, stakeDigits(threat.pct)))) : compact.scandal(Math.round(threat.gauge)) }}
      {...disclosure}
      dim={!companyMatches(company, filter, view.you)}
      press={pressable(s.aria(s.titled(s.threat, company.name), text), () => onOpen({ kind: 'company', id: company.id }))}
    >
      <div className="ent-company">
        <span aria-hidden>{company.emoji}</span> {company.name} <span className="muted">({company.ticker})</span>
      </div>
      {threat.kind === 'stake' ? (
        <TugOfWar view={view} company={company} holder={threat.holder} pct={threat.pct} width={width} />
      ) : (
        <Thermometer gauge={threat.gauge} width={width} />
      )}
      <p className="ent-text">{text}</p>
    </Sign>
  );
}

function Triangle({ alarm }: { alarm: boolean }) {
  return (
    <svg className="ent-icon" width={20} height={18} viewBox="0 0 20 18" aria-hidden>
      <path d="M10 1.5 L19 16.5 H1 Z" fill={WHITE} stroke={alarm ? RED : DARK} strokeWidth={2.4} strokeLinejoin="round" />
      <text x={10} y={12} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={800} fill={INK}>
        {alarm ? '!' : '·'}
      </text>
    </svg>
  );
}

/**
 * Bras de fer du capital : votre part tire depuis la gauche, la sienne depuis la droite ; celui qui dépasse
 * la ligne des 50 % prend le contrôle. Parts publiques (registre des actionnaires).
 */
function TugOfWar({ view, company, holder, pct, width }: { view: PlayerView; company: CompanyView; holder: PublicPlayer; pct: number; width: number }) {
  const t = useT();
  const fmt = useFmt();
  const me = view.players.find((p) => p.id === view.you);
  const mine = (company.holdings[view.you] ?? 0) / Math.max(1, company.sharesOutstanding);
  const H = 54;
  const ground = 40;
  const barY = 27;
  const barH = 8;
  const x0 = 20;
  const x1 = width - 20;
  const L = Math.max(10, x1 - x0);
  const mid = x0 + L / 2;
  const left = `${t.common.You} ${fmt.pct(mine, stakeDigits(mine))}`;
  const rightPct = ` ${fmt.pct(pct, stakeDigits(pct))}`;
  const right = `${clip(holder.name, L - textW(left) - textW(rightPct) - 24)}${rightPct}`;
  return (
    <svg className="ent-art" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden>
      {/* Les deux camps tirent sur la corde, penchés en arrière. */}
      <line x1={6} x2={x0} y1={barY + barH / 2} y2={barY + barH / 2} stroke={INK} strokeWidth={1.2} />
      <line x1={x1} x2={width - 6} y1={barY + barH / 2} y2={barY + barH / 2} stroke={INK} strokeWidth={1.2} />
      <g transform={`translate(9 ${ground}) rotate(-14)`}>
        <Person coat={me?.color ?? DARK} skin={SKINS[0]} />
      </g>
      <g transform={`translate(${width - 9} ${ground}) rotate(14)`}>
        <Person coat={holder.color} skin={SKINS[2]} />
      </g>
      <rect x={x0} y={barY} width={L} height={barH} fill={PAPER2} stroke={INK} strokeWidth={1} />
      {mine > 0 && <rect x={x0} y={barY} width={Math.min(1, mine) * L} height={barH} fill={me?.color ?? DARK} stroke={INK} strokeWidth={0.8} />}
      <rect x={x1 - Math.min(1, pct) * L} y={barY} width={Math.min(1, pct) * L} height={barH} fill={holder.color} stroke={INK} strokeWidth={0.8} />
      <line x1={mid} x2={mid} y1={barY - 8} y2={barY + barH + 5} stroke={RED} strokeWidth={1.4} strokeDasharray="3 2" />
      <text x={mid} y={barY - 11} textAnchor="middle" className="ent-svg-label" style={{ fill: RED }}>
        {t.city.signs.control(fmt.pct(0.5, 0))}
      </text>
      <text x={x0} y={H - 2} className="ent-svg-label ent-strong">
        {left}
      </text>
      <text x={x1} y={H - 2} textAnchor="end" className="ent-svg-label ent-strong">
        {right}
      </text>
    </svg>
  );
}

/** Thermomètre du scandale : jauge exacte sur 100 (la vôtre), seuils des niveaux publics moyen et élevé. */
function Thermometer({ gauge, width }: { gauge: number; width: number }) {
  const t = useT();
  const v = Math.max(0, Math.min(100, gauge));
  const { moyen, eleve } = SCANDAL_LEVEL_THRESHOLDS;
  const color = v >= eleve ? RED : v >= moyen ? WARN : DARK;
  const H = 46;
  const cy = 24;
  const x0 = 18;
  const x1 = width - 4;
  const L = x1 - x0;
  const at = (g: number) => x0 + (g / 100) * L;
  const label = `${Math.round(v)}/100`;
  const lx = Math.max(x0 + textW(label) / 2, Math.min(x1 - textW(label) / 2, at(v)));
  return (
    <svg className="ent-art" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden>
      <rect x={x0 - 4} y={cy - 5} width={L + 4} height={10} rx={5} fill={WHITE} stroke={INK} strokeWidth={1.1} />
      <rect x={x0 - 2} y={cy - 3} width={Math.max(0, at(v) - x0 + 2)} height={6} rx={3} fill={color} />
      <circle cx={10} cy={cy} r={8} fill={color} stroke={INK} strokeWidth={1.1} />
      {[moyen, eleve].map((g) => (
        <line key={g} x1={at(g)} x2={at(g)} y1={cy - 9} y2={cy + 9} stroke={INK} strokeWidth={0.9} strokeDasharray="2 1.5" />
      ))}
      <text x={at(moyen) + 3} y={H - 3} className="ent-svg-label ent-small">
        {t.scandalLevel.moyen}
      </text>
      <text x={at(eleve) + 3} y={H - 3} className="ent-svg-label ent-small">
        {t.scandalLevel['élevé']}
      </text>
      <text x={lx} y={cy - 10} textAnchor="middle" className="ent-svg-label ent-strong" style={{ fill: color }}>
        {label}
      </text>
    </svg>
  );
}

/** Rien à signaler : le chien de garde dort dans sa niche. */
function Kennel({ live }: { live: boolean }) {
  const g = 34;
  return (
    <svg className="ent-art" width={120} height={40} viewBox="0 0 120 40" aria-hidden>
      <line x1={0} x2={120} y1={g} y2={g} stroke={INK} strokeWidth={1} />
      <path d={`M8 ${g} V18 L24 7 L40 18 V${g} Z`} fill="#b98a55" stroke={INK} strokeWidth={1} />
      <path d={`M17 ${g} V25 Q24 17 31 25 V${g} Z`} fill={INK} />
      <ellipse cx={52} cy={g - 4} rx={11} ry={4.5} fill={PAPER} stroke={INK} strokeWidth={0.9} />
      <circle cx={42} cy={g - 6} r={4.5} fill={PAPER} stroke={INK} strokeWidth={0.9} />
      <path d={`M39 ${g - 9} q-3 3 -1 6`} stroke={INK} strokeWidth={1} fill="#8a6a45" />
      <path d={`M40 ${g - 6} h3`} stroke={INK} strokeWidth={0.7} />
      <g className={cx(live && 'ent-zzz')}>
        <text x={56} y={18} className="ent-svg-label ent-strong">
          z
        </text>
        <text x={64} y={11} className="ent-svg-label ent-strong" fontSize={12}>
          Z
        </text>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// « Occasion » : panneau d'indication (bleu, lettres blanches)
// ---------------------------------------------------------------------------

function OpeningSign({ view, width, join, live, onOpen, ...disclosure }: Disclosure & { view: PlayerView; width: number; join: boolean; live: boolean; onOpen: (t: CityTarget) => void }) {
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const s = t.city.signs;
  const compact = signsReadability(useUiLang());
  const opening = openingSign(view);
  const icon = <Arrow />;
  if (opening.kind === 'launch') {
    const id: SectorId = opening.sectorId;
    const name = content.sectors[id]?.name ?? id;
    // La phrase ne répète pas le secteur (nommé juste au-dessus) ; le lecteur d'écran l'entend dans l'intitulé.
    const text = s.launch(opening.payback, nbsp(fmt.money(opening.profit)));
    const left = Math.max(1, view.config.totalTurns - view.turn + 1);
    const launchPress = pressable(s.aria(s.titled(s.opening, name), text), () => onOpen(openingLaunchTarget(opening)));
    return (
      <Sign
        kind="opening"
        title={s.opening}
        icon={icon}
        tip={s.observation}
        join={join}
        summary={{ fact: frenchSpacing(name), figure: compact.payback(opening.payback) }}
        {...disclosure}
        directAction={{ label: compact.launch, aria: `${compact.launch} · ${launchPress['aria-label']}`, onClick: launchPress.onClick }}
        press={launchPress}
      >
        <div className="ent-company">
          <span aria-hidden>{SECTORS[id]?.emoji}</span> {frenchSpacing(name)}
        </div>
        <Timeline payback={opening.payback} left={left} width={width} />
        <p className="ent-text">{text}</p>
      </Sign>
    );
  }
  if (opening.kind === 'commodity') {
    const id: CommodityId = opening.commodityId;
    const c = view.commodities.find((x) => x.id === id);
    const name = content.commodities[id]?.name ?? id;
    const text = s.commodity(name, nbsp(fmt.pct(opening.ratio, 0)));
    return (
      <Sign
        kind="opening"
        title={s.opening}
        icon={icon}
        tip={s.observation}
        join={join}
        summary={{ fact: frenchSpacing(name), figure: compact.priceRatio(nbsp(fmt.pct(opening.ratio, 0))) }}
        {...disclosure}
        press={pressable(s.aria(s.opening, text), () => onOpen({ kind: 'commodity', id }))}
      >
        <div className="ent-company">
          <span aria-hidden>{COMMODITIES[id]?.emoji}</span> {frenchSpacing(name)}
        </div>
        <Dial ratio={opening.ratio} price={fmt.money(c?.price ?? 0)} base={fmt.money(COMMODITIES[id]?.basePrice ?? c?.price ?? 0)} pct={fmt.pct(opening.ratio, 0)} width={width} />
        <p className="ent-text">{text}</p>
      </Sign>
    );
  }
  return (
    <Sign kind="opening" title={s.opening} icon={icon} tip={s.observation} join={join} summary={{ fact: s.nothing }} {...disclosure}>
      <Tumbleweed live={live} width={width} />
      <p className="ent-text">{s.nothing}</p>
    </Sign>
  );
}

function Arrow() {
  return (
    <svg className="ent-icon" width={18} height={18} viewBox="0 0 18 18" aria-hidden>
      <rect x={1} y={1} width={16} height={16} rx={3} fill={BLUE} stroke={WHITE} strokeWidth={1.5} />
      <path d="M5 13 L12 6 M7.5 5.5 H12.5 V10.5" stroke={WHITE} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Les trimestres qui restent, une case chacun : hachurés tant que le lancement se rembourse
 * (attente comprise), une pièce d'or par trimestre de bénéfice ensuite.
 */
function Timeline({ payback, left, width }: { payback: number; left: number; width: number }) {
  const t = useT();
  const s = t.city.signs;
  const n = Math.min(left, Math.max(0, Math.ceil(payback)));
  const cell = Math.min(20, width / left);
  const size = Math.max(3, Math.min(cell - 3, 14));
  const y = 8;
  const repay = s.repay(n);
  const profit = left - n > 0 ? s.profitTime(left - n) : '';
  // Les deux légendes côte à côte si elles tiennent, sinon l'une sous l'autre.
  const inline = !profit || textW(repay) + textW(profit) + 14 <= width;
  const H = y + size + (inline ? 18 : 31);
  const flagX = n * cell - 1.5;
  return (
    <svg className="ent-art" width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={s.timeline(n, left)}>
      {Array.from({ length: left }, (_, i) => {
        const cx = i * cell + cell / 2;
        return i < n ? (
          <g key={i}>
            <rect x={cx - size / 2} y={y} width={size} height={size} fill="rgba(255,255,255,0.18)" stroke={WHITE} strokeWidth={1} />
            <path d={`M${cx - size / 2} ${y + size} L${cx + size / 2} ${y}`} stroke={WHITE} strokeWidth={0.9} />
          </g>
        ) : (
          <circle key={i} cx={cx} cy={y + size / 2} r={size / 2} fill={LIT} stroke={INK} strokeWidth={0.8} />
        );
      })}
      {n > 0 && n < left && (
        <g>
          <line x1={flagX} x2={flagX} y1={1} y2={y + size + 2} stroke={WHITE} strokeWidth={1.2} />
          <path d={`M${flagX} 1 l7 2.5 l-7 2.5 z`} fill={LIT} stroke={INK} strokeWidth={0.5} />
        </g>
      )}
      <text x={0} y={y + size + 14} className="ent-svg-label ent-on-blue">
        {repay}
      </text>
      {profit && (
        <text x={inline ? width : 0} y={y + size + (inline ? 14 : 27)} textAnchor={inline ? 'end' : 'start'} className="ent-svg-label ent-strong" style={{ fill: LIT_TEXT }}>
          {profit}
        </text>
      )}
    </svg>
  );
}

/** Cadran du prix d'une matière : l'aiguille va de la moitié (−60°) au double (+60°) du prix de base. */
function Dial({ ratio, price, base, pct, width }: { ratio: number; price: string; base: string; pct: string; width: number }) {
  const t = useT();
  const R = 24;
  const cx = R + 8;
  const cy = R + 12;
  const H = cy + 10;
  const p = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
  };
  const a0 = p(-60, R);
  const a1 = p(60, R);
  const needle = p(Math.max(-1, Math.min(1, Math.log2(Math.max(1e-9, ratio)))) * 60, R - 5);
  const tx = cx + R + 30;
  return (
    <svg className="ent-art" width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden>
      <path d={`M${a0.x} ${a0.y} A${R} ${R} 0 0 1 ${a1.x} ${a1.y}`} stroke={WHITE} strokeWidth={3} fill="none" />
      {[-60, 0, 60].map((d) => {
        const i = p(d, R - 4);
        const o = p(d, R + 3);
        return <line key={d} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke={WHITE} strokeWidth={1.4} />;
      })}
      <text x={p(-60, R + 8).x - 2} y={p(-60, R + 8).y + 8} textAnchor="middle" className="ent-svg-label ent-on-blue ent-small">
        ½
      </text>
      <text x={p(60, R + 8).x + 2} y={p(60, R + 8).y + 8} textAnchor="middle" className="ent-svg-label ent-on-blue ent-small">
        ×2
      </text>
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={LIT} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={3} fill={LIT} stroke={INK} strokeWidth={0.8} />
      <text x={tx} y={17} className="ent-svg-label ent-on-blue ent-big">
        {price}
      </text>
      <text x={tx} y={31} className="ent-svg-label ent-on-blue">
        {t.city.signs.base(base)}
      </text>
      <text x={tx} y={45} className="ent-svg-label ent-strong" style={{ fill: LIT_TEXT }}>
        {pct}
      </text>
    </svg>
  );
}

/** Pas d'aubaine : un virevoltant traverse la route déserte. */
function Tumbleweed({ live, width }: { live: boolean; width: number }) {
  const w = Math.min(width, 160);
  return (
    <svg className="ent-art" width={w} height={36} viewBox={`0 0 ${w} 36`} aria-hidden>
      <line x1={0} x2={w} y1={32} y2={32} stroke={WHITE} strokeWidth={1.2} />
      {/* Un cactus, pour le décor de western. */}
      <path d={`M${w - 26} 32 v-15 m0 6 h-5 v-5 m5 3 h5 v-6`} stroke={INK} strokeWidth={4.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${w - 26} 32 v-15 m0 6 h-5 v-5 m5 3 h5 v-6`} stroke="#6fae5f" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <g className={cx(live && 'ent-roll')}>
        <g transform="translate(24 23)">
          <g className={cx(live && 'ent-spin')}>
            <circle r={8.5} fill="none" stroke="#d8c08a" strokeWidth={1.4} />
            <path d="M-7 -3 Q0 6 7 -2 M-5 5 Q-1 -7 6 4 M-2 -8 Q3 0 -1 8" stroke="#d8c08a" strokeWidth={1.1} fill="none" />
          </g>
        </g>
      </g>
    </svg>
  );
}
