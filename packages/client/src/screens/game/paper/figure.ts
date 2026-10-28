/**
 * « Le chiffre du trimestre » : un chiffre marquant du trimestre clos q = issue.turn − 1, calculé
 * uniquement depuis la vue publique (bilans, flashs de dividendes et de bonus, historiques des cours,
 * de la demande et des fortunes). Pur et déterministe : mêmes genre et nombres en français et en
 * anglais ; `lang` ne sert qu'à choisir la chute (figureQuips) et le nom de la matière/du secteur.
 * Le formatage (monnaie, %, trimestre) est laissé à PaperFill (useFmt).
 *
 * Score d'un candidat = retentissement : sa taille rapportée à un seuil de « gros titre » propre à
 * chaque rubrique (en k pour les montants), pondérée — l'amende et le bonus font vendre, l'impôt est
 * banal. Le genre affiché au numéro précédent (recalculé en chaîne depuis le N° 2) est pénalisé
 * ×0,6, pour varier.
 */
import { getContent } from '@muchomoney/core';
import type { JournalIssue, Lang, PaperFigureKind, PlayerView } from '@muchomoney/core';
import { hashPick } from './hash';

export interface PaperFigure {
  kind: PaperFigureKind;
  /** Trimestre clos concerné (0 pour le N° 1). */
  quarter: number;
  /** Montant en k (fines, bonuses, dividends, tax, gap) ; 0 sinon. */
  amount: number;
  /** Variation (ratio) pour commodity/sector ; 0 sinon. */
  pct: number;
  /** Nombre concerné (scandales, dirigeants, entreprises…) ; 0 si sans objet. */
  count: number;
  /** Nom de la matière ou du secteur dans `lang` ; '' sinon. */
  name: string;
  /** Nombre de trimestres de la partie (kind 'turns'). */
  turns: number;
  tone: 'up' | 'down' | 'neutral';
  quip: string;
}

interface Candidate {
  kind: PaperFigureKind;
  amount: number;
  pct: number;
  count: number;
  /** Id de la matière ou du secteur (pour retrouver son nom). */
  refId: string;
  score: number;
}

/** Seuils de « gros titre » (k) et poids des rubriques, pour le score des montants. */
const MONEY_SCORE: Partial<Record<PaperFigureKind, { threshold: number; weight: number }>> = {
  fines: { threshold: 2000, weight: 1.6 },
  bonuses: { threshold: 1500, weight: 1.4 },
  dividends: { threshold: 2500, weight: 1.1 },
  tax: { threshold: 5000, weight: 1.0 },
  gap: { threshold: 15000, weight: 1.2 },
};

function moneyCandidate(kind: PaperFigureKind, amount: number, count: number): Candidate | null {
  const cfg = MONEY_SCORE[kind];
  if (!cfg || amount <= 0) return null;
  return { kind, amount, pct: 0, count, refId: '', score: cfg.weight * (amount / cfg.threshold) };
}

/** Candidats du trimestre clos q (≥ 1). */
function candidates(view: PlayerView, q: number): Candidate[] {
  const out: Candidate[] = [];
  const reports = view.companies.flatMap((c) => c.reports.filter((r) => r.turn === q));

  const fines = moneyCandidate('fines', reports.reduce((a, r) => a + r.fines, 0), reports.filter((r) => r.fines > 0).length);
  if (fines) out.push(fines);
  const tax = moneyCandidate('tax', reports.reduce((a, r) => a + r.tax, 0), reports.filter((r) => r.tax > 0).length);
  if (tax) out.push(tax);

  // Dividendes et bonus de PDG : événements parus en flashs dans le numéro de leur trimestre (q).
  const articles = view.journal.find((i) => i.turn === q)?.articles ?? [];
  const eventSum = (type: 'dividend' | 'ceoBonus') => {
    const events = articles.filter((a) => a.event?.type === type);
    // Une par entreprise pour les dividendes, une par PDG pour les bonus (versements et tranches répétés comptent une fois).
    const who = (a: (typeof events)[number]) => (type === 'dividend' ? a.companyIds?.[0] : a.event?.actorId);
    return { total: events.reduce((a, e) => a + (e.event?.amount ?? 0), 0), count: new Set(events.map(who)).size };
  };
  const dividends = eventSum('dividend');
  const dividendsC = moneyCandidate('dividends', dividends.total, dividends.count);
  if (dividendsC) out.push(dividendsC);
  const bonuses = eventSum('ceoBonus');
  const bonusesC = moneyCandidate('bonuses', bonuses.total, bonuses.count);
  if (bonusesC) out.push(bonusesC);

  // Matière première : plus forte variation du trimestre (indice t = cours après la clôture du tour t).
  let commodity: Candidate | null = null;
  for (const c of view.commodities) {
    const h = c.priceHistory;
    if (h.length <= q || !(h[q - 1] > 0)) continue;
    const m = h[q] / h[q - 1] - 1;
    if (Math.abs(m) >= 0.15 && (!commodity || Math.abs(m) > Math.abs(commodity.pct))) {
      commodity = { kind: 'commodity', amount: 0, pct: m, count: 0, refId: c.id, score: 1.5 * (Math.abs(m) / 0.15) };
    }
  }
  if (commodity) out.push(commodity);

  // Secteur : demande du tour t à l'indice t−1 ; variation du trimestre q = indice q−1 vs q−2.
  let sector: Candidate | null = null;
  for (const s of view.sectors) {
    const h = s.demandHistory;
    if (q < 2 || h.length < q || !(h[q - 2] > 0)) continue;
    const m = h[q - 1] / h[q - 2] - 1;
    if (Math.abs(m) >= 0.2 && (!sector || Math.abs(m) > Math.abs(sector.pct))) {
      sector = { kind: 'sector', amount: 0, pct: m, count: 0, refId: s.id, score: 1.3 * (Math.abs(m) / 0.2) };
    }
  }
  if (sector) out.push(sector);

  // Écart entre la première et la dernière fortune en fin de trimestre q (indice q−1).
  const worths = view.players.map((p) => p.netWorthHistory[q - 1]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (worths.length >= 2) {
    const gap = moneyCandidate('gap', Math.max(...worths) - Math.min(...worths), 0);
    if (gap) out.push(gap);
  }

  return out;
}

function best(view: PlayerView, q: number, penalized?: PaperFigureKind): Candidate | null {
  const cands = candidates(view, q);
  let winner: Candidate | null = null;
  for (const c of cands) {
    const score = c.kind === penalized ? c.score * 0.6 : c.score;
    if (!winner || score > winner.score) winner = { ...c, score };
  }
  return winner;
}

/** Genre affiché au numéro précédent, recalculé en chaîne (N° 1 = 'turns', jamais candidat : départ à undefined). */
function previousKind(view: PlayerView, q: number): PaperFigureKind | undefined {
  let prevKind: PaperFigureKind | undefined;
  for (let qq = 1; qq < q; qq++) prevKind = view.journal.some((i) => i.turn === qq + 1) ? best(view, qq, prevKind)?.kind : undefined;
  return prevKind;
}

/** Meilleur candidat du trimestre q, le genre `penalized` étant déclassé ×0,6. Exporté pour les tests. */
export function bestFigure(view: PlayerView, q: number, penalized?: PaperFigureKind): PaperFigureKind | null {
  return best(view, q, penalized)?.kind ?? null;
}

/** Le chiffre du trimestre d'un numéro ; null seulement s'il n'y a vraiment rien à montrer. */
export function pickFigure(issue: JournalIssue, view: PlayerView, lang: Lang): PaperFigure | null {
  const content = getContent(lang);
  const paper = content.paper;
  if (!paper) return null;
  const textSeed = view.config.textSeed ?? view.config.seed;
  const quipOf = (kind: PaperFigureKind): string => hashPick(paper.figureQuips[kind] ?? [], `${textSeed}|${issue.turn}|figure|quip`) ?? '';

  const q = issue.turn - 1;
  if (q <= 0) {
    // N° 1 : pas de trimestre clos, on annonce la durée de la partie.
    return { kind: 'turns', quarter: 0, amount: 0, pct: 0, count: 0, name: '', turns: view.config.totalTurns, tone: 'neutral', quip: quipOf('turns') };
  }

  const win = best(view, q, previousKind(view, q));
  if (!win) return null;

  const name =
    win.kind === 'commodity'
      ? (content.commodities[win.refId as keyof typeof content.commodities]?.name ?? '')
      : win.kind === 'sector'
        ? (content.sectors[win.refId as keyof typeof content.sectors]?.name ?? '')
        : '';
  const tone: PaperFigure['tone'] =
    win.kind === 'commodity' || win.kind === 'sector' ? (win.pct > 0 ? 'up' : 'down') : win.kind === 'dividends' || win.kind === 'gap' ? 'up' : 'down';
  return { kind: win.kind, quarter: q, amount: win.amount, pct: win.pct, count: win.count, name, turns: 0, tone, quip: quipOf(win.kind) };
}
