import { useSyncExternalStore } from 'react';
import type { Lang, LobbyView, PlayerView } from '@muchomoney/core';
import type { Session } from './session';
import { detectLang } from './i18n/detect';
import { stackToast } from './toastQueue';
import { loadTutorial, type TutorialState } from './tutorial';
import type { TurnStartSettings } from './productSaves';

export type ToastKind = 'good' | 'bad' | 'info' | 'drama';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  title?: string;
  /** Étiquette : un nouveau toast de même étiquette remplace celui-ci (voir toastQueue.ts). */
  tag?: string;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface AppState {
  /** Fresh UI context for each opened solo session, including importing the same saved game. */
  soloVisit: number;
  connection: ConnectionStatus;
  /** Vrai dès la première connexion réussie (pour n'afficher « reconnexion… » qu'ensuite). */
  everConnected: boolean;
  session: Session | null;
  /** Tentative de room:rejoin en cours. */
  rejoining: boolean;
  /**
   * Session trouvée dans ce navigateur mais tenue par un autre onglet ouvert :
   * on ne la reprend que sur demande explicite (« Reprendre ma partie »).
   */
  resumable: Session | null;
  /** Estimation de (horloge serveur − horloge locale), en ms, pour le chrono (voir clock.ts) ; null tant qu’inconnue. */
  clockOffset: number | null;
  lobby: LobbyView | null;
  view: PlayerView | null;
  /** Message affiché sur l'accueil (salon fermé, reconnexion impossible…). */
  notice: string | null;
  toasts: Toast[];
  /** Mode maquette (?mock=1, dev uniquement). */
  mock: boolean;
  /** Langue de l'interface de ce joueur (libellés). Montants et contenu suivent la langue du salon. */
  lang: Lang;
  /** Connexion refusée par le serveur (trop d'onglets…) : raison localisée, pas de reconnexion automatique. */
  refused: string | null;
  /** Checklist « Vos premiers pas » (mémorisée dans ce navigateur, voir tutorial.ts). */
  tutorial: TutorialState;
  /**
   * Nombre de demandes « Revoir les premiers pas » (aide « ? ») : chaque demande déplie la checklist et l'amène à
   * l'écran, qu'elle ait été fermée, repliée ou déjà visible (voir TutorialChecklist).
   */
  tutorialReopen: number;
  /** Fenêtre d'aide « Comment jouer » ouverte (bouton « ? »). */
  helpOpen: boolean;
  /**
   * Salon que le raccourci « Première partie guidée » est en train de régler (null sinon) : son lobby
   * verrouille lancement, règles, bots et secteur jusqu'au dernier accusé. Un autre salon n'est jamais concerné.
   */
  guidedPreparing: string | null;
  /**
   * Réglages des produits dirigés tels qu'au début du trimestre (premières valeurs vues dans ce navigateur pour ce
   * salon et ce trimestre), pour « Revenir aux réglages du début du trimestre ». Jamais envoyé au serveur.
   */
  turnStart: TurnStartSettings | null;
}

let state: AppState = {
  soloVisit: 0,
  connection: 'idle',
  everConnected: false,
  session: null,
  rejoining: false,
  resumable: null,
  clockOffset: null,
  lobby: null,
  view: null,
  notice: null,
  toasts: [],
  mock: false,
  lang: detectLang(),
  refused: null,
  tutorial: loadTutorial(),
  tutorialReopen: 0,
  helpOpen: false,
  guidedPreparing: null,
  turnStart: null,
};

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Lit l'état global. Le sélecteur doit renvoyer une valeur stable (primitive ou référence existante). */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

let toastSeq = 0;

export function pushToast(kind: ToastKind, message: string, title?: string, ttlMs?: number, tag?: string): void {
  if (!message) return;
  const id = ++toastSeq;
  const toast: Toast = tag ? { id, kind, message, title, tag } : { id, kind, message, title };
  setState((s) => ({ toasts: stackToast(s.toasts, toast) }));
  const ttl = ttlMs ?? (kind === 'bad' || kind === 'drama' ? 7000 : 4500);
  window.setTimeout(() => dismissToast(id), ttl);
}

export function dismissToast(id: number): void {
  setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}
