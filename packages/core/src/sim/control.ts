/** Contrôle des entreprises : OPA, parachute doré, passation, franchissement de seuils (§6.3). */
import { getContent } from '../content';
import type { CompanyState, GameState, Id } from '../types';
import { CONTROL_TRANSFER_MIN, PARACHUTE_MIN, PARACHUTE_PCT, STAKE_THRESHOLDS } from './constants';
import { langOf, tr } from './i18n';
import { addFlash, body, headlineText } from './journal';
import { holdingOf } from './market';
import { getOwn } from './util';

export interface ControlChange {
  companyId: Id;
  oldControllerId: Id | null;
  newControllerId: Id | null;
  hostile: boolean; // vraie prise de contrôle (> 50 %)
  parachute: number;
}

function autopilotCeoName(state: GameState, c: CompanyState): string {
  const def = c.npcDefId ? getContent(langOf(state)).npcCompanies.find((d) => d.id === c.npcDefId) : undefined;
  return def ? def.ceoName : tr(state).autopilotCeo;
}

/**
 * Vérifie et applique les changements de contrôle d'une entreprise active :
 * 1. un joueur détient > 50 % et n'est pas contrôleur → OPA (parachute pour l'évincé), ou simple passation si
 *    c'est le dirigeant lui-même qui vient de lui céder le bloc de gré à gré (`soldBy`, §7 bis) ;
 * 2. le contrôleur ne détient plus aucune action → plus gros actionnaire joueur (≥ 10 %) ou pilote automatique.
 */
export function checkControl(state: GameState, c: CompanyState, soldBy?: Id): ControlChange | null {
  if (c.status !== 'active' || !(c.sharesOutstanding > 0)) return null;
  const S = c.sharesOutstanding;

  for (const [pid, sh] of Object.entries(c.holdings)) {
    if (sh > S / 2 && c.controllerId !== pid && getOwn(state.players, pid)) {
      if (soldBy !== undefined && c.controllerId === soldBy) return soldControl(state, c, pid, soldBy);
      return takeover(state, c, pid);
    }
  }

  const ctrl = c.controllerId;
  if (ctrl !== null && holdingOf(c, ctrl) <= 0) {
    let best: Id | null = null;
    let bestShares = 0;
    for (const [pid, sh] of Object.entries(c.holdings)) {
      if (sh >= CONTROL_TRANSFER_MIN * S && sh > bestShares && getOwn(state.players, pid)) {
        best = pid;
        bestShares = sh;
      }
    }
    c.controllerId = best;
    if (best) {
      const heir = state.players[best];
      c.ceoName = heir.name;
      addFlash(state, {
        title: tr(state).controlHandoverTitle(heir.name, c.name),
        body: body(state, 'controlHandover', c.id),
        tone: 'neutral',
        companyIds: [c.id],
        event: { type: 'controlHandover', actorId: best, subjectId: ctrl },
      });
    } else {
      c.ceoName = autopilotCeoName(state, c);
      addFlash(state, {
        title: tr(state).autopilotTitle(c.name),
        body: body(state, 'autopilot', c.id),
        tone: 'neutral',
        companyIds: [c.id],
        event: { type: 'autopilot', subjectId: ctrl },
      });
    }
    return { companyId: c.id, oldControllerId: ctrl, newControllerId: best, hostile: false, parachute: 0 };
  }
  return null;
}

/**
 * Le dirigeant vend lui-même le contrôle, de gré à gré : une passation, pas une OPA. Pas de parachute (on ne
 * s'éjecte pas d'un avion qu'on vient de vendre), ni de compteur d'OPA.
 */
function soldControl(state: GameState, c: CompanyState, buyerId: Id, sellerId: Id): ControlChange {
  const buyer = state.players[buyerId];
  c.controllerId = buyerId;
  c.ceoName = buyer.name;
  addFlash(state, {
    title: tr(state).controlHandoverTitle(buyer.name, c.name),
    body: body(state, 'controlSold', c.id),
    tone: 'neutral',
    companyIds: [c.id],
    event: { type: 'controlHandover', actorId: buyerId, subjectId: sellerId },
  });
  return { companyId: c.id, oldControllerId: sellerId, newControllerId: buyerId, hostile: false, parachute: 0 };
}

function takeover(state: GameState, c: CompanyState, acquirerId: Id): ControlChange {
  const acquirer = state.players[acquirerId];
  const oldId = c.controllerId;
  const old = oldId !== null ? getOwn(state.players, oldId) : undefined;
  let parachute = 0;
  if (old) {
    parachute = Math.max(0, Math.min(Math.max(PARACHUTE_PCT * c.cash, PARACHUTE_MIN), c.cash));
    if (parachute < 0.5) parachute = 0; // moins de 500 € : la caisse est vide, pas de parachute
    c.cash -= parachute;
    old.cash += parachute;
    old.stats.takeoversSuffered += 1;
    old.stats.parachutes += parachute;
    old.lastOustedTurn = state.turn;
    // Le parachute finance la start-up de retour en jeu (§7) : subvention = max(1 000 k, parachute).
    if (parachute > 0) old.comebackGrant = parachute;
  }
  acquirer.stats.takeoversWon += 1;
  c.controllerId = acquirerId;
  c.ceoName = acquirer.name;
  const T = tr(state);
  const pct = T.pct(holdingOf(c, acquirerId) / c.sharesOutstanding, 1);
  addFlash(state, {
    title: headlineText(state, 'takeover', { acquirer: acquirer.name, target: c.name, company: c.name, pct }),
    body: old
      ? parachute > 0
        ? headlineText(state, 'ousted', { player: old.name, company: c.name, amount: T.money(parachute) })
        : headlineText(state, 'oustedBroke', { player: old.name, company: c.name })
      : body(state, 'takeoverNoCeo', c.id),
    tone: 'drama',
    companyIds: [c.id],
    event: {
      type: 'takeover',
      actorId: acquirerId,
      subjectId: old ? old.id : undefined,
      amount: old ? parachute : undefined,
      pct: holdingOf(c, acquirerId) / c.sharesOutstanding,
    },
  });
  return { companyId: c.id, oldControllerId: oldId, newControllerId: acquirerId, hostile: true, parachute };
}

/**
 * Flash « stakeBuilding » quand un joueur franchit 25 % ou 40 % d'une entreprise qu'il ne contrôle pas
 * (entreprises PNJ comprises : tout le monde est prévenu).
 */
export function checkStakeThresholds(state: GameState, c: CompanyState, playerId: Id, beforeShares: number, beforeOutstanding: number): void {
  if (c.status !== 'active' || c.controllerId === playerId) return;
  const player = getOwn(state.players, playerId);
  if (!player) return;
  const after = holdingOf(c, playerId);
  const S = c.sharesOutstanding;
  if (!(S > 0) || after > S / 2) return;
  const beforeRatio = beforeOutstanding > 0 ? beforeShares / beforeOutstanding : 0;
  const afterRatio = after / S;
  for (const th of STAKE_THRESHOLDS) {
    if (beforeRatio < th && afterRatio >= th) {
      const pct = tr(state).pct(afterRatio, 1);
      addFlash(state, {
        title: headlineText(state, 'stakeBuilding', { player: player.name, pct, company: c.name }),
        body: body(state, 'stakeBuilding', `${c.id}:${playerId}`),
        tone: 'drama',
        companyIds: [c.id],
        event: { type: 'stakeBuilding', actorId: playerId, pct: afterRatio },
      });
      return;
    }
  }
}

/** Vérifie le contrôle puis, s'il n'a pas changé, les seuils de participation. */
export function afterStakeChange(state: GameState, c: CompanyState, playerId: Id, beforeShares: number, beforeOutstanding: number): ControlChange | null {
  const change = checkControl(state, c);
  if (!change || change.newControllerId !== playerId) checkStakeThresholds(state, c, playerId, beforeShares, beforeOutstanding);
  return change;
}
