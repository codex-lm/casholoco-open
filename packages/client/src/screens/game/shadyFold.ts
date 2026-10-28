/**
 * « Actions discutables » : la jauge, les effets en cours et la communication de crise restent visibles ; les six
 * combines sont dans un volet. Fermé d'habitude, il s'ouvre de lui-même quand la jauge atteint « moyen », quand la
 * réputation passe sous 1 ou quand un scandale de l'entreprise a éclaté à la dernière clôture. Le joueur peut toujours
 * l'ouvrir ou le fermer : son choix vaut pour cette entreprise jusqu'à la fin du trimestre (mémoire de la visite).
 * Rien de secret : la jauge et la réputation de ses propres entreprises, et le journal public.
 */
import type { CompanyView, PlayerView } from '@muchomoney/core';
import { CRISIS_COMMS_REPUTATION_CAP, SCANDAL_LEVEL_THRESHOLDS } from '../../rules';

/** Un scandale de cette entreprise a éclaté à la dernière clôture : son article « scandal » est dans le numéro du trimestre. */
export function scandalBurstAtLastClose(view: PlayerView, companyId: string): boolean {
  const issue = view.journal.find((i) => i.turn === view.turn);
  return (issue?.articles ?? []).some((a) => a.event?.type === 'scandal' && (a.companyIds ?? []).includes(companyId));
}

/** Le volet des combines s'ouvre de lui-même : jauge au moins « moyenne », réputation sous 1, ou scandale à la dernière clôture. */
export function shadyFoldOpensItself(view: PlayerView, company: CompanyView): boolean {
  return (
    (company.private?.scandal ?? 0) >= SCANDAL_LEVEL_THRESHOLDS.moyen ||
    company.reputation < CRISIS_COMMS_REPUTATION_CAP ||
    scandalBurstAtLastClose(view, company.id)
  );
}

/**
 * Tuile de communication de crise : utile tant qu'il y a du scandale à baisser ou une réputation sous 1 à réparer
 * (le moteur la remonte jusqu'à 1). Déjà publiée ce trimestre, elle reste pour dire qu'il faudra attendre.
 */
export function showsCrisisComms(company: CompanyView): boolean {
  return (company.private?.scandal ?? 0) > 0 || company.reputation < CRISIS_COMMS_REPUTATION_CAP || company.private?.turnFlags.crisisDone === true;
}

/** Choix du volet par salon, entreprise et trimestre : ouvert (true), fermé (false). */
const choices = new Map<string, boolean>();
const keyOf = (room: string, companyId: string, turn: number) => `${room}|${companyId}|${turn}`;

/** Ce que le joueur a choisi ce trimestre (ou ce que le volet a fait de lui-même), sinon `undefined`. */
export function shadyFoldChoice(room: string, companyId: string, turn: number): boolean | undefined {
  return choices.get(keyOf(room, companyId, turn));
}

export function rememberShadyFold(room: string, companyId: string, turn: number, open: boolean): void {
  // Un trimestre passé ne revient pas : on n'en garde que le choix du trimestre courant.
  for (const key of choices.keys()) if (key.startsWith(`${room}|${companyId}|`)) choices.delete(key);
  choices.set(keyOf(room, companyId, turn), open);
}

/**
 * État du volet à ce rendu : le choix retenu pour le trimestre, sinon la règle. Ouvert par la règle, il est retenu
 * ouvert : il ne se referme pas sous les yeux du joueur quand la jauge redescend ou que la réputation revient à 1
 * (communication de crise) ; il revient à la règle au trimestre suivant. Idempotent, donc appelable au rendu.
 */
export function shadyFoldOpenNow(room: string, companyId: string, turn: number, opensItself: boolean): boolean {
  const chosen = shadyFoldChoice(room, companyId, turn);
  if (chosen !== undefined) return chosen;
  if (opensItself) rememberShadyFold(room, companyId, turn, true);
  return opensItself;
}

/** Tests : oublie tous les choix. */
export function forgetShadyFolds(): void {
  choices.clear();
}
