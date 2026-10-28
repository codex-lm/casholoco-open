/**
 * L'onglet « La carte » (bêta) : modèle pur, calculé depuis la PlayerView (aucune règle nouvelle, aucune donnée cachée).
 *   - Les panneaux : vous (rang, verdicts de mes usines), menace (participation ou scandale), occasion
 *     (lancement rentabilisé ou matière en soldes) — de simples constats chiffrés.
 *   - Le port de la capitale : prix des matières rapportés à leur prix de base, articles et rumeurs du numéro.
 * Toute lecture privée passe par ./privacy (présence de `private`).
 */
import type { Article, CommodityId, CommodityView, CompanyView, JournalIssue, PlayerView, PublicPlayer, Rumor, SectorId, SectorView } from '@muchomoney/core';
import { COMMODITIES, SECTORS, isSpatialMap } from '@muchomoney/core';
import { SCANDAL_LEVEL_THRESHOLDS, maxProductsOf, productCount, priceChange, scandalRisk } from '../../../rules';
import { productFlow, type FlowStatus } from '../factories/model';
import { isOwn, liveHexBids, ownCompany, ownProduct } from './privacy';

/** En dessous de cette largeur (px), la carte, les panneaux et le port passent en version téléphone. */
export const PHONE_W = 600;
/** Tampons du port : prix sous (soldes) ou au-dessus (flambée) de ces fractions du prix de base. */
export const SALE_RATIO = 0.9;
export const SPIKE_RATIO = 1.3;

// ---------------------------------------------------------------------------
// Cibles, filtres, props communes aux scènes
// ---------------------------------------------------------------------------

/** Ce qu'ouvre un clic dans l'onglet (panneaux, port). */
export type CityTarget =
  | { kind: 'company'; id: string }
  | { kind: 'launch'; sectorId: SectorId; hexId?: string }
  | { kind: 'player'; id: string }
  | { kind: 'commodity'; id: CommodityId };

/** Mise en avant : tout, mes affaires (dirigées ou détenues), ou celles d'un joueur. */
export type CityFilter = { kind: 'all' } | { kind: 'mine' } | { kind: 'player'; id: string };

/** Props communes aux scènes de l'onglet (port). */
export interface DistrictProps {
  view: PlayerView;
  filter: CityFilter;
  /** Scène figée (mouvement réduit ou bouton « Figer »). */
  still: boolean;
  onOpen: (target: CityTarget) => void;
}

/** Une entreprise est mise en avant si le joueur filtré la dirige ou en détient des actions. */
export function companyMatches(c: CompanyView, filter: CityFilter, you: string): boolean {
  if (filter.kind === 'all') return true;
  const who = filter.kind === 'mine' ? you : filter.id;
  return c.controllerId === who || (c.holdings[who] ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Joueurs : rang par valeur nette
// ---------------------------------------------------------------------------

/** Rang (1 = le plus riche) de chaque joueur, par valeur nette décroissante (à égalité : ordre du salon). */
export function netWorthRanks(players: PublicPlayer[]): Map<string, number> {
  const sorted = players.map((p, i) => ({ p, i })).sort((a, b) => b.p.netWorth - a.p.netWorth || a.i - b.i);
  return new Map(sorted.map(({ p }, i) => [p.id, i + 1]));
}

/** Variation de la valeur nette depuis la dernière clôture (null avant la première). */
export function netWorthChange(p: PublicPlayer): number | null {
  const last = p.netWorthHistory.at(-1);
  if (last === undefined || !(Math.abs(last) > 1e-9)) return null;
  return (p.netWorth - last) / Math.abs(last);
}

/** J'ai un emplacement de produit libre dans au moins une de mes entreprises. */
export function hasFreeSlot(view: PlayerView): boolean {
  return launchCompany(view) !== null;
}

/** The Occasion sign prefers the selected company when products and pending projects leave room. */
export function launchCompany(view: PlayerView, selected?: CompanyView | null): CompanyView | null {
  const free = (c: CompanyView) => isOwn(c) && productCount(c) + (ownCompany(c)?.launchProjects?.length ?? 0) < maxProductsOf(c);
  const current = selected && view.companies.find((c) => c.id === selected.id);
  if (current && free(current)) return current;
  return view.companies.find(free) ?? null;
}

// ---------------------------------------------------------------------------
// Le port
// ---------------------------------------------------------------------------

export interface WarehouseModel {
  commodity: CommodityView;
  /** Prix / prix de base. */
  ratio: number;
  /** Aiguille : −60° (moitié du prix de base) à +60° (double), échelle logarithmique. */
  angle: number;
  tag: 'sale' | 'spike' | null;
  /** Variation depuis la dernière clôture. */
  change: number;
  /** Mes lots en stock (toutes mes entreprises), null sans entreprise. */
  myLots: number | null;
  /** Une de mes usines consomme cette matière. */
  usedByMe: boolean;
  news: Article[];
}

export function warehouseModel(view: PlayerView, c: CommodityView, news: CityNews): WarehouseModel {
  const base = COMMODITIES[c.id]?.basePrice ?? c.price;
  const ratio = c.price / Math.max(1e-9, base);
  const mine = view.companies.filter(isOwn);
  const lots = mine.reduce((a, co) => a + (ownCompany(co)?.inventory[c.id]?.lots ?? 0), 0);
  return {
    commodity: c,
    ratio,
    angle: Math.max(-1, Math.min(1, Math.log2(ratio))) * 60,
    tag: ratio < SALE_RATIO ? 'sale' : ratio > SPIKE_RATIO ? 'spike' : null,
    change: priceChange(c.priceHistory, c.price),
    myLots: mine.length > 0 ? lots : null,
    usedByMe: mine.some((co) => co.products.some((p) => (SECTORS[p.sectorId]?.inputs[c.id] ?? 0) > 0)),
    news: news.byCommodity.get(c.id) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Le journal dans l'onglet
// ---------------------------------------------------------------------------

export interface CityNews {
  issue: JournalIssue | null;
  headline: Article | null;
  byCompany: Map<string, Article[]>;
  bySector: Map<SectorId, Article[]>;
  byCommodity: Map<CommodityId, Article[]>;
  rumors: Rumor[];
}

/** Articles du numéro en cours, rattachés uniquement par leurs identifiants (jamais en lisant le texte). */
export function cityNews(view: PlayerView): CityNews {
  const issue = view.journal.at(-1) ?? null;
  const byCompany = new Map<string, Article[]>();
  const bySector = new Map<SectorId, Article[]>();
  const byCommodity = new Map<CommodityId, Article[]>();
  const push = <K,>(map: Map<K, Article[]>, key: K, a: Article) => map.set(key, [...(map.get(key) ?? []), a]);
  for (const a of issue?.articles ?? []) {
    if (a.kind === 'quote') continue;
    for (const id of a.companyIds ?? []) push(byCompany, id, a);
    for (const id of a.sectorIds ?? []) push(bySector, id, a);
    for (const id of a.commodityIds ?? []) push(byCommodity, id, a);
  }
  return {
    issue,
    headline: issue?.articles.find((a) => a.kind === 'headline') ?? null,
    byCompany,
    bySector,
    byCommodity,
    rumors: issue?.rumors ?? [],
  };
}

// ---------------------------------------------------------------------------
// Les trois panneaux (constats, pas des conseils)
// ---------------------------------------------------------------------------

export interface YouSign {
  player: PublicPlayer;
  rank: number;
  total: number;
  change: number | null;
  hasCompany: boolean;
  /** Verdicts de mes produits (voir factories/model). */
  counts: Record<FlowStatus, number>;
}

export function youSign(view: PlayerView): YouSign | null {
  const player = view.players.find((p) => p.id === view.you);
  if (!player) return null;
  const counts: Record<FlowStatus, number> = { building: 0, idle: 0, shortage: 0, surplus: 0, balanced: 0, unknown: 0 };
  const mine = view.companies.filter(isOwn);
  for (const c of mine) for (const p of c.products) if (ownProduct(p)) counts[productFlow(p).status] += 1;
  return {
    player,
    rank: netWorthRanks(view.players).get(player.id) ?? view.players.length,
    total: view.players.length,
    change: netWorthChange(player),
    hasCompany: mine.length > 0,
    counts,
  };
}

/** Seuil de la menace « participation » : un autre joueur détient au moins 20 % d'une de mes entreprises. */
export const THREAT_STAKE = 0.2;

export type ThreatSign =
  | { kind: 'stake'; holder: PublicPlayer; company: CompanyView; pct: number }
  | { kind: 'scandal'; company: CompanyView; gauge: number; risk: number }
  | { kind: 'none' };

export type Threat = Exclude<ThreatSign, { kind: 'none' }>;

/**
 * Toutes les menaces sur mes entreprises, les participations d'abord (de la plus grosse à la plus petite, à partir de
 * 20 %), puis les jauges de scandale au moins « moyennes » (de la plus haute à la plus basse). Holdings publics et
 * jauge de mes seules entreprises : rien de secret.
 */
export function threatSigns(view: PlayerView): Threat[] {
  const mine = view.companies.filter(isOwn);
  const stakes: Extract<Threat, { kind: 'stake' }>[] = [];
  for (const c of mine) {
    for (const [id, n] of Object.entries(c.holdings)) {
      if (id === view.you) continue;
      const pct = n / Math.max(1, c.sharesOutstanding);
      const holder = view.players.find((p) => p.id === id);
      if (holder && pct >= THREAT_STAKE) stakes.push({ kind: 'stake', holder, company: c, pct });
    }
  }
  const scandals: Extract<Threat, { kind: 'scandal' }>[] = [];
  for (const c of mine) {
    const gauge = ownCompany(c)?.scandal ?? 0;
    if (gauge >= SCANDAL_LEVEL_THRESHOLDS.moyen) scandals.push({ kind: 'scandal', company: c, gauge, risk: scandalRisk(gauge) });
  }
  // Tri stable : à égalité, l'ordre des entreprises (puis des actionnaires) décide, comme avant.
  stakes.sort((a, b) => b.pct - a.pct);
  scandals.sort((a, b) => b.gauge - a.gauge);
  return [...stakes, ...scandals];
}

/** Plus grosse participation d'un autre joueur dans mes entreprises, sinon ma jauge de scandale si elle est au moins « moyenne ». */
export function threatSign(view: PlayerView): ThreatSign {
  return threatSigns(view)[0] ?? { kind: 'none' };
}

export type OpeningSign =
  | { kind: 'launch'; sectorId: SectorId; payback: number; profit: number; hexId?: string }
  | { kind: 'commodity'; commodityId: CommodityId; ratio: number }
  | { kind: 'none' };

/** Une case libre du plateau pour un lancement : trimestres pour rentabiliser (terrain compris) et bénéfice trimestriel. */
export interface LaunchCell {
  hexId: string;
  payback: number;
  profit: number;
}

/** Trimestres restants, celui en cours compris : un lancement doit être rentabilisé dans ce délai. */
const quartersLeftOf = (view: PlayerView): number => Math.max(0, view.config.totalTurns - view.turn + 1);

/** Ordre du panneau Occasion : le plus vite rentabilisé, puis le plus gros bénéfice, puis l'ordre du plateau. */
function beatsLaunchCell(a: LaunchCell, b: LaunchCell, order: Map<string, number>): boolean {
  return a.payback < b.payback
    || (a.payback === b.payback && a.profit > b.profit)
    || (a.payback === b.payback && a.profit === b.profit && (order.get(a.hexId) ?? 0) < (order.get(b.hexId) ?? 0));
}

/**
 * Meilleure case libre pour lancer un produit de ce secteur, règle commune au panneau « Occasion » et à l'onglet
 * Marchés : estimations du moteur case par case (`launchByHex`, terrain compris à sa mise à prix), rentabilisées avant
 * la fin de la partie ; les cases portant déjà une de mes mises en attente sont ignorées. null hors plateau ou si
 * aucune case ne se rembourse à temps.
 */
export function bestLaunchCell(view: PlayerView, sector: SectorView): LaunchCell | null {
  if (!isSpatialMap(view.config) || !view.hexes) return null;
  const quartersLeft = quartersLeftOf(view);
  const order = new Map<string, number>(view.hexes.free.map((id, i) => [id, i]));
  const occupied = new Set(liveHexBids(view).map((b) => b.hexId));
  let best: LaunchCell | null = null;
  for (const hexId of view.hexes.free) {
    if (occupied.has(hexId)) continue;
    const e = sector.launchByHex?.[hexId];
    if (!e || e.paybackQuarters === null || e.paybackQuarters > quartersLeft) continue;
    const cell: LaunchCell = { hexId, payback: e.paybackQuarters, profit: e.quarterlyProfit };
    if (!best || beatsLaunchCell(cell, best, order)) best = cell;
  }
  return best;
}

/**
 * Lancement le plus vite rentabilisé si j'ai un emplacement libre (et le temps de l'amortir),
 * sinon une matière que j'utilise à ≤ 85 % de son prix de base.
 * En mode hexagonal, chaque case libre est examinée (par secteur, dans l'ordre du plateau, voir bestLaunchCell) et le
 * panneau nomme la case ; les cases portant déjà une de mes mises en attente sont ignorées.
 * Avec `company` (la colonne de gauche du plateau, pour l'entreprise aux manettes), le lancement ne compte que si
 * CETTE entreprise a un emplacement libre : la fiche lancerait pour elle.
 */
export function openingSign(view: PlayerView, company?: CompanyView | null): OpeningSign {
  const quartersLeft = quartersLeftOf(view);
  const free = company ? launchCompany(view, company)?.id === company.id : hasFreeSlot(view);
  if (free) {
    if (isSpatialMap(view.config) && view.hexes) {
      const order = new Map<string, number>(view.hexes.free.map((id, i) => [id, i]));
      let best: (LaunchCell & { sectorId: SectorId }) | null = null;
      for (const s of view.sectors) {
        const cell = bestLaunchCell(view, s);
        if (cell && (!best || beatsLaunchCell(cell, best, order))) best = { ...cell, sectorId: s.id };
      }
      if (best) return { kind: 'launch', sectorId: best.sectorId, hexId: best.hexId, payback: best.payback, profit: best.profit };
    } else {
      let best: OpeningSign = { kind: 'none' };
      for (const s of view.sectors) {
        const e = s.launchEstimate;
        if (!e || e.paybackQuarters === null || e.paybackQuarters > quartersLeft) continue;
        if (best.kind !== 'launch' || e.paybackQuarters < best.payback) best = { kind: 'launch', sectorId: s.id, payback: e.paybackQuarters, profit: e.quarterlyProfit };
      }
      if (best.kind === 'launch') return best;
    }
  }
  let cheap: OpeningSign = { kind: 'none' };
  for (const c of view.commodities) {
    const w = warehouseModel(view, c, EMPTY_NEWS);
    if (w.usedByMe && w.ratio <= 0.85 && (cheap.kind !== 'commodity' || w.ratio < cheap.ratio)) cheap = { kind: 'commodity', commodityId: c.id, ratio: w.ratio };
  }
  return cheap;
}

/** Cible du panneau « Occasion » : en mode hexagonal, le lancement vise aussi la case. */
export function openingLaunchTarget(o: Extract<OpeningSign, { kind: 'launch' }>): CityTarget {
  return o.hexId !== undefined ? { kind: 'launch', sectorId: o.sectorId, hexId: o.hexId } : { kind: 'launch', sectorId: o.sectorId };
}

const EMPTY_NEWS: CityNews = { issue: null, headline: null, byCompany: new Map(), bySector: new Map(), byCommodity: new Map(), rumors: [] };
