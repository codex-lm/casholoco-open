/**
 * Protocole Socket.IO entre le client et le serveur.
 * Le serveur fait autorité : le client n'envoie que des intentions (Action),
 * le serveur valide, applique et renvoie une PlayerView redigée par joueur.
 */
import type { Action, ActionResult, BotLevel, GameConfig, Id, Lang, LobbyPlayer, PlayerView, SectorId, TerrainAssessment } from './types';

export interface BotOption {
  id: string;
  ceoName: string;
  companyName: string;
  emoji: string;
  tagline: string;
}

export interface LobbyView {
  terrains?: Array<{ id: string; hex: string; name: string; strengthLabel: string; counterLabel: string | null; blurb: string; sectors: Record<SectorId, TerrainAssessment> }>;
  /** Ordre public des humains en mode hex + choice (les bots choisissent au démarrage). */
  terrainPickOrder?: Id[];
  /** Premier humain sans terrain ; null lorsque chacun a choisi. */
  terrainPickTurn?: Id | null;
  roomCode: string;
  hostId: Id;
  you: Id;
  players: LobbyPlayer[];
  config: Omit<GameConfig, 'seed'>;
  availableBots: BotOption[];
  maxPlayers: number;
}

export interface JoinAck {
  ok: boolean;
  error?: string;
  /** Temporary failure: keep the session and retry instead of returning home. */
  retry?: boolean;
  roomCode?: string;
  playerId?: Id;
  /** Secret à conserver (localStorage) pour se reconnecter. */
  token?: string;
  /** Choix publics proposés avant de réserver une place dans une partie en cours. */
  botTakeover?: BotTakeoverOffer;
}

export interface BotTakeoverOption {
  playerId: Id;
  name: string;
  color: string;
  cash: number;
  debt: number;
  netWorth: number;
  companies: Array<{ id: Id; name: string; emoji: string; sectorIds: SectorId[] }>;
}

export interface BotTakeoverOffer {
  roomCode: string;
  turn: number;
  totalTurns: number;
  startYear: number;
  lang: Lang;
  options: BotTakeoverOption[];
}

export interface SimpleAck {
  ok: boolean;
  error?: string;
}

export interface GameEvent {
  kind: 'info' | 'good' | 'bad' | 'drama';
  message: string;
  /** Si défini, l'événement ne concerne que ce joueur. */
  playerId?: Id;
  /**
   * Étiquette facultative : le client remplace le toast précédent de même étiquette au lieu
   * d'empiler (ex. « Nouveau trimestre » successifs).
   */
  tag?: GameEventTag;
}

export type GameEventTag = 'newQuarter';

/** Motif (facultatif) d'une fermeture de salon propre à ce joueur, pour un message dédié côté client. */
export type RoomClosedCode = 'kicked' | 'takenOver';

export interface ClientToServerEvents {
  /**
   * `lang` = langue de l'interface du joueur : langue des messages d'erreur du serveur,
   * et langue initiale du salon quand c'est l'hôte qui le crée.
   */
  'room:create': (p: { playerName: string; lang?: Lang }, ack: (r: JoinAck) => void) => void;
  'room:join': (p: { roomCode: string; playerName: string; lang?: Lang; botPlayerId?: Id }, ack: (r: JoinAck) => void) => void;
  'room:rejoin': (p: { roomCode: string; playerId: Id; token: string; lang?: Lang }, ack: (r: JoinAck) => void) => void;
  /** Change la langue des messages du serveur pour cette connexion (interface du joueur). */
  'player:lang': (p: { lang: Lang }) => void;
  'room:leave': () => void;
  'lobby:update': (p: { companyName?: string; sectorId?: SectorId }, ack: (r: SimpleAck) => void) => void;
  /** Choix à son tour ; null libère son propre terrain à tout moment dans le lobby. */
  'lobby:pickTerrain': (p: { terrainId: string | null }, ack: (r: SimpleAck) => void) => void;
  'lobby:config': (
    p: Partial<Pick<GameConfig, 'totalTurns' | 'turnSeconds' | 'lang' | 'botLevel' | 'allowBotTakeover' | 'mapMode' | 'terrainAssignment' | 'terrains'>>,
    ack: (r: SimpleAck) => void,
  ) => void;
  'lobby:addBot': (p: { personalityId?: string }, ack: (r: SimpleAck) => void) => void;
  'lobby:removeBot': (p: { playerId: Id }, ack: (r: SimpleAck) => void) => void;
  /** Niveau d'un bot du salon (hôte seulement). `lobby:config` avec `botLevel` règle tous les bots d'un coup. */
  'lobby:botLevel': (p: { playerId: Id; level: BotLevel }, ack: (r: SimpleAck) => void) => void;
  'lobby:start': (ack: (r: SimpleAck) => void) => void;
  /**
   * `turn` (facultatif) : tour pour lequel l'action a été préparée. S'il est présent et ne
   * correspond plus au tour courant, le serveur refuse l'action au lieu de l'appliquer au
   * mauvais trimestre. Un vieux client peut l'omettre.
   */
  'game:action': (p: { action: Action; turn?: number }, ack: (r: ActionResult) => void) => void;
  /** `turn` : tour visé ; le serveur ignore un « prêt » arrivé après un changement de tour. */
  'game:ready': (p: { ready: boolean; turn?: number }) => void;
}

export interface ServerToClientEvents {
  'lobby:state': (v: LobbyView) => void;
  'game:state': (v: PlayerView) => void;
  'game:event': (e: GameEvent) => void;
  'room:closed': (p: { reason: string; code?: RoomClosedCode }) => void;
  /** Connexion refusée par le serveur (trop de connexions depuis cette adresse), juste avant la coupure. */
  'server:refused': (p: { reason: string }) => void;
}

export const MAX_PLAYERS = 8;
export const ROOM_CODE_LENGTH = 4;
