/**
 * API publique du moteur. Le serveur n'utilise QUE ces fonctions.
 * Toutes les fonctions qui modifient l'état mutent `state` en place.
 * Le moteur est déterministe : même seed + mêmes actions = même partie.
 * L'implémentation vit dans src/sim/*.
 */
import { runAction } from './sim/actions';
import { createGameState } from './sim/create';
import { computeNetWorth } from './sim/finance';
import { resolveTurnWithLog } from './sim/resolve';
import { tr } from './sim/i18n';
import { cleanName, getOwn } from './sim/util';
import { buildPlayerView } from './sim/view';
import type { Action, ActionResult, GameConfig, GameState, Id, LobbyPlayer, PlayerState, PlayerView } from './types';

/**
 * Crée une partie : entreprises des joueurs (humains et bots), entreprises PNJ,
 * marchés initiaux, puis démarre le tour 1 (journal n°1, rumeurs, actions des bots).
 */
export function createGame(config: GameConfig, lobbyPlayers: LobbyPlayer[]): GameState {
  const state = createGameState(config, lobbyPlayers);
  state.config.allowBotTakeover = config?.allowBotTakeover === true;
  return state;
}

function pendingBotClaim(state: GameState, player: PlayerState): boolean {
  return player.botTakeover !== undefined && state.turn < player.botTakeover.activeFromTurn;
}

/**
 * Attribue un bot existant à un humain, sans créer de joueur, rejouer d'action ni
 * toucher à son patrimoine. Le trimestre entamé conserve les décisions du bot.
 */
export function claimBotPlayer(state: GameState, playerId: Id, name: string): ActionResult {
  const T = tr(state);
  if (!state || state.phase !== 'playing') return { ok: false, message: T.gameOver };
  if (state.config.allowBotTakeover !== true) return { ok: false, message: T.botTakeoverDisabled };
  if (state.turn >= state.config.totalTurns) return { ok: false, message: T.botTakeoverLastTurn };
  const player = getOwn(state.players, playerId);
  if (!player) return { ok: false, message: T.unknownPlayer };
  if (!player.isBot) return { ok: false, message: T.botTakeoverUnavailable };
  const cleaned = cleanName(name, 40)?.normalize('NFC');
  if (!cleaned) return { ok: false, message: T.botTakeoverNameInvalid };
  const nameKey = cleaned.toLocaleLowerCase('fr');
  if (Object.values(state.players).some((p) => p.id !== playerId && (
    p.name.normalize('NFC').toLocaleLowerCase('fr') === nameKey
    || (pendingBotClaim(state, p) && p.botTakeover!.previousName.normalize('NFC').toLocaleLowerCase('fr') === nameKey)
  ))) {
    return { ok: false, message: T.botTakeoverNameTaken };
  }

  const activeFromTurn = state.turn + 1;
  player.botTakeover = { previousName: player.name, activeFromTurn };
  player.name = cleaned;
  player.isBot = false;
  player.connected = true;
  player.ready = false;
  for (const company of Object.values(state.companies)) {
    if (company.controllerId === player.id) company.ceoName = cleaned;
  }
  return { ok: true, message: T.botTakeoverClaimed(activeFromTurn) };
}

/** Annule uniquement une reprise encore en attente, sans rejouer le bot du trimestre en cours. */
export function cancelPendingBotClaim(state: GameState, playerId: Id): boolean {
  if (!state || state.phase !== 'playing') return false;
  const player = getOwn(state.players, playerId);
  if (!player || player.isBot || !pendingBotClaim(state, player)) return false;
  const previousName = player.botTakeover!.previousName;
  player.name = previousName;
  player.isBot = true;
  player.connected = true;
  player.ready = false;
  delete player.botTakeover;
  for (const company of Object.values(state.companies)) {
    if (company.controllerId === player.id) company.ceoName = previousName;
  }
  return true;
}

/**
 * Valide et applique immédiatement une action d'un joueur. Ne jette jamais : renvoie { ok:false } si invalide.
 * Refusée (sans effet) si la partie est terminée ou si le joueur est inconnu.
 */
export function applyAction(state: GameState, playerId: Id, action: Action): ActionResult {
  let backup: string | null = null;
  try {
    if (!state || state.phase !== 'playing') return { ok: false, message: tr(state).gameOver };
    const player = getOwn(state.players, playerId);
    if (!player) return { ok: false, message: tr(state).unknownPlayer };
    if (pendingBotClaim(state, player)) return { ok: false, message: tr(state).botTakeoverPending(player.botTakeover!.activeFromTurn) };
    // Sauvegarde paresseuse : prise seulement quand l'action, validée, s'apprête à muter l'état
    // (une action invalide ne coûte donc pas une sérialisation complète).
    return runAction(state, playerId, action, () => {
      backup = JSON.stringify(state);
    });
  } catch {
    // Filet de sécurité : une action interrompue par un bogue ne laisse aucune trace.
    if (backup !== null) restoreInPlace(state, backup);
    return { ok: false, message: tr(state).internalError };
  }
}

function restoreInPlace(state: GameState, backup: string): void {
  const restored = JSON.parse(backup) as Record<string, unknown>;
  const target = state as unknown as Record<string, unknown>;
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, restored);
}

/**
 * Résout le tour en cours (production, ventes, finances, bourse, scandales…),
 * puis soit démarre le tour suivant (news, rumeurs, bots), soit termine la partie
 * (state.phase = 'finished', state.results rempli). Sans effet si la partie est finie.
 * Ne jette qu'en cas de bogue interne, et laisse alors l'état inchangé.
 */
export function resolveTurn(state: GameState): void {
  // Transaction : en cas d'exception (bogue), l'état est restauré tel qu'avant l'appel, puis l'erreur remonte.
  const backup = JSON.stringify(state);
  try {
    resolveTurnWithLog(state);
  } catch (e) {
    restoreInPlace(state, backup);
    throw e;
  }
}

/** Vue redigée pour un joueur (sans jauges cachées, décisions privées des autres, news futures). */
export function getPlayerView(state: GameState, playerId: Id): PlayerView {
  return buildPlayerView(state, playerId);
}

/** Valeur nette d'un joueur : cash + Σ actions × prix - dette. */
export function netWorth(state: GameState, playerId: Id): number {
  return computeNetWorth(state, playerId);
}

export function setPlayerConnected(state: GameState, playerId: Id, connected: boolean): void {
  const p = getOwn(state.players, playerId);
  if (p) p.connected = !!connected;
}

export function setPlayerReady(state: GameState, playerId: Id, ready: boolean): void {
  const p = getOwn(state.players, playerId);
  if (p && state.phase === 'playing' && !pendingBotClaim(state, p)) p.ready = !!ready;
}

/** Vrai si tous les humains connectés sont prêts (et qu'il y en a au moins un). */
export function allHumansReady(state: GameState): boolean {
  const humans = Object.values(state.players).filter((p) => !p.isBot && p.connected && !pendingBotClaim(state, p));
  return humans.length > 0 && humans.every((p) => p.ready);
}
