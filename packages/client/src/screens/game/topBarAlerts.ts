/**
 * La puce d'alerte de la barre du jeu : ce qui menace une entreprise que je dirige, visible depuis tous les onglets.
 * Par ordre de gravité : le plan de clôture prévoit une faillite ou un manque d'argent (vue privée de mes seules
 * entreprises), un autre joueur détient au moins 20 % d'une d'elles (registre public), sa jauge de scandale atteint
 * « moyen » (la mienne). Rien sur les entreprises des autres.
 */
import type { CompanyView, PlayerView, PublicPlayer } from '@muchomoney/core';
import { closeAlert } from './CloseBanner';
import { threatSigns } from './city/model';

export type TopBarAlert =
  | { kind: 'bankrupt'; company: CompanyView }
  | { kind: 'short'; company: CompanyView; shortfall: number }
  | { kind: 'stake'; company: CompanyView; holder: PublicPlayer; pct: number }
  | { kind: 'scandal'; company: CompanyView; gauge: number; risk: number };

/** Entreprises que je dirige dont le plan de clôture prévoit la faillite (avertissement de « Je suis prêt »). */
export function bankruptAtClose(myCompanies: readonly CompanyView[]): CompanyView[] {
  return myCompanies.filter((c) => closeAlert(c.private?.closePlan) === 'bankrupt');
}

/** Toutes les alertes, la plus grave d'abord (la puce montre la première, l'infobulle toutes). */
export function topBarAlerts(view: PlayerView, myCompanies: readonly CompanyView[]): TopBarAlert[] {
  const close: TopBarAlert[] = [];
  const short: TopBarAlert[] = [];
  for (const company of myCompanies) {
    const plan = company.private?.closePlan;
    const alert = closeAlert(plan);
    if (alert === 'bankrupt') close.push({ kind: 'bankrupt', company });
    else if (alert === 'short' && plan) short.push({ kind: 'short', company, shortfall: plan.shortfall });
  }
  const threats = threatSigns(view).map((threat): TopBarAlert => threat.kind === 'stake'
    ? { kind: 'stake', company: threat.company, holder: threat.holder, pct: threat.pct }
    : { kind: 'scandal', company: threat.company, gauge: threat.gauge, risk: threat.risk });
  return [...close, ...short, ...threats];
}

/** Une participation proche du seuil du contrôle (45 à 55 %) garde une décimale : 49,6 % ne s'affiche pas « 50 % ». */
export const stakeDigits = (ratio: number): number => (ratio >= 0.45 && ratio <= 0.55 ? 1 : 0);

/**
 * Où mène la puce : la faillite ou le manque d'argent prévus, au bandeau de clôture de l'entreprise (« Mon entreprise ») ;
 * le scandale, à ses actions discutables ; la participation d'un rival, à la ligne de l'entreprise dans la Bourse.
 */
export type AlertDestination =
  | { tab: 'company'; companyId: string; reveal: string }
  | { tab: 'stocks'; companyId: string };

export function alertDestination(alert: TopBarAlert): AlertDestination {
  if (alert.kind === 'stake') return { tab: 'stocks', companyId: alert.company.id };
  return { tab: 'company', companyId: alert.company.id, reveal: alert.kind === 'scandal' ? '.section-shady' : '.close-banner' };
}

/** Ce que la partie fait pour suivre la puce (voir `GameScreen`). */
export interface AlertNavigation {
  selectCompany: (companyId: string) => void;
  /** Bourse : la ligne de l'entreprise choisie, centrée et focalisée à l'arrivée. */
  focusStock: (companyId: string) => void;
  goTo: (tab: 'company' | 'stocks') => void;
  /** Mon entreprise : amène l'élément sous les barres collantes et lui donne le focus. */
  reveal: (selector: string) => void;
}

/** Suit la puce : la Bourse sur la ligne de l'entreprise, ou « Mon entreprise » de cette entreprise, sur sa cible. */
export function followAlert(alert: TopBarAlert, nav: AlertNavigation): void {
  const target = alertDestination(alert);
  if (target.tab === 'stocks') {
    nav.focusStock(target.companyId);
    nav.goTo('stocks');
    return;
  }
  nav.selectCompany(target.companyId);
  nav.goTo('company');
  nav.reveal(target.reveal);
}

/** Chaque demande remonte l'onglet Bourse (nouvelle clé), même pour la même entreprise. */
export function nextStockFocus(previous: { companyId: string; seq: number } | null, companyId: string): { companyId: string; seq: number } {
  return { companyId, seq: (previous?.seq ?? 0) + 1 };
}
