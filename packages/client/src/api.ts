/** Local solo transport. The original deterministic engine runs in this browser. */
import type { Action, ActionResult, BotLevel, GameConfig, Lang, PlayerView, SectorId, SimpleAck } from '@muchomoney/core';
import { estimateClockOffset } from './clock';
import { getState, pushToast, setState } from './store';
import { notifyViewChanges } from './notifications';
import { stingsFor } from './audio/catalog';
import { director } from './audio/director';
import { setUiLang, t } from './i18n';
import { enableGuidedTutorial, markTutorial, rememberTutorialForecasts } from './tutorialStore';
import { isGuidedTutorial } from './tutorial';
import { captureTurnStart, flushProductSaves, forgetProductSaves, pruneProductSaves, unsavedProductNames } from './productSaves';
import { setSoloViewListener, startSolo, resumeSolo, hasSoloSave, getSoloSaveInfo, applySoloAction,
  advanceSoloTurn, leaveSolo, exportSoloSave, importSoloSave, soloStorageAvailable, getSoloSaveId, type SoloOptions } from './solo/runtime';

export { soloStorageAvailable };
export type { SoloOptions };

// The development fixtures also exercise the same action boundary.
export interface MockBackend {
  action(action: Action, turn?: number): ActionResult;
  ready(ready: boolean): void;
  lobby(kind: 'update' | 'config' | 'addBot' | 'removeBot' | 'botLevel' | 'pickTerrain' | 'start', payload: unknown): SimpleAck;
}
export interface PeerBackend {
  action(action: Action, turn?: number): ActionResult | Promise<ActionResult>;
  ready(ready: boolean, turn?: number): ActionResult | Promise<ActionResult>;
  leave(): void;
}
let peerBackend: PeerBackend | null = null;
export function installPeerBackend(backend: PeerBackend | null): void {
  peerBackend = backend;
  mock = null;
}
export function receivePeerView(view: PlayerView, roomCode: string): void {
  const changed = getState().session?.roomCode !== roomCode;
  if (changed) setState(s => ({ view: null, soloVisit: s.soloVisit + 1, turnStart: null, toasts: [], helpOpen: false,
    tutorial: { dismissed: false, room: null, seen: {}, completed: null } }));
  setState({ session: { roomCode, playerId: view.you, token: 'peer-local' }, lobby: null,
    connection: 'connected', everConnected: true, rejoining: false });
  receiveView(view);
}
let mock: MockBackend | null = null;
export function installMock(backend: MockBackend): void {
  mock = backend;
  setState({ mock: true, connection: 'connected', everConnected: true });
}

let initialized = false;
let pendingStart: StartSoloGameOptions | null = null;
let pendingImport = false;
export function initConnection(): void {
  if (initialized) return;
  initialized = true;
  setSoloViewListener((view) => {
    if (!view) {
      setState({ session: null, view: null, lobby: null, rejoining: false, turnStart: null, helpOpen: false });
      return;
    }
    const roomCode = getSoloSaveId() ?? 'SOLO';
    const changingGame = getState().session?.roomCode !== roomCode;
    if (pendingStart || pendingImport || changingGame) {
      forgetProductSaves();
      setState((s) => ({ view: null, turnStart: null, toasts: [], notice: null, helpOpen: false, clockOffset: null, soloVisit: s.soloVisit + 1 }));
    }
    if (pendingStart) {
      setState({ tutorial: { dismissed: false, room: null, seen: {}, completed: null } });
    }
    setState({ session: { roomCode, playerId: view.you, token: 'local' },
      lobby: null, rejoining: false, connection: 'connected', everConnected: true, notice: null });
    if (pendingStart?.guided) enableGuidedTutorial(roomCode);
    if (pendingStart || pendingImport) setUiLang(view.config.lang ?? 'fr');
    receiveView(view);
  });
  setState({ connection: 'connected', everConnected: true, rejoining: false, resumable: null });
}

export interface StartSoloGameOptions {
  playerName: string;
  companyName: string;
  sectorId: SectorId;
  botCount: number;
  botLevel: BotLevel;
  mapMode: 'classic' | 'hex' | 'square';
  totalTurns: 8 | 12 | 16 | 20 | 24;
  lang: Lang;
  guided?: boolean;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : t().api.refused;
}
export async function startSoloGame(options: StartSoloGameOptions): Promise<SimpleAck> {
  initConnection();
  mock = null;
  pendingStart = options;
  try {
    startSolo({ ...options, name: options.playerName });
    return { ok: true };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
  finally { pendingStart = null; }
}
export function hasSavedSoloGame(): boolean { return hasSoloSave(); }
export function getSavedSoloGameInfo() { return getSoloSaveInfo(); }
export async function resumeSoloGame(): Promise<SimpleAck> {
  initConnection();
  const info = getSoloSaveInfo();
  if (!info) return { ok: false, error: getState().lang === 'fr' ? 'Aucune sauvegarde valide à reprendre.' : 'No valid saved game to resume.' };
  mock = null;
  setUiLang(info.lang);
  try { return resumeSolo() ? { ok: true } : { ok: false, error: t().api.refused }; }
  catch (error) { return { ok: false, error: errorMessage(error) }; }
}
export function exportSoloGame(): string | null { return exportSoloSave(); }
export async function importSoloGame(text: string): Promise<SimpleAck> {
  initConnection();
  pendingImport = true;
  try {
    const result = importSoloSave(text, getState().lang);
    if (!result.ok) return { ok: false, error: result.message };
    if (result.view) setUiLang(result.view.config.lang ?? 'fr');
    return { ok: true };
  } catch (error) { return { ok: false, error: errorMessage(error) }; }
  finally { pendingImport = false; }
}
export function changeLang(lang: Lang): void { setUiLang(lang); }
export function leaveRoom(): void {
  if (peerBackend) { peerBackend.leave(); return; }
  forgetProductSaves();
  mock = null;
  leaveSolo();
  setState({ session: null, view: null, lobby: null, rejoining: false, helpOpen: false, turnStart: null, toasts: [] });
}

export function receiveView(view: PlayerView): void {
  const st = getState();
  const prev = st.view;
  const fromLobby = prev === null && st.lobby !== null;
  const clockOffset = estimateClockOffset(st.clockOffset, prev, view, Date.now(), fromLobby);
  // Réglages du début du trimestre : relevés à la première vue du trimestre (ou au chargement de la page).
  const room = st.session?.roomCode ?? 'local';
  const turnStart = captureTurnStart(st.turnStart, room, view);
  // Échecs d'enregistrement des fiches refermées devenus sans objet (produit perdu, réglage changé ailleurs…).
  pruneProductSaves(room, view);
  setState({ view, clockOffset, turnStart });
  rememberTutorialForecasts(view);
  if (prev) notifyViewChanges(prev, view);
  // Jingle au lancement, journal à chaque trimestre, ponctuation des coups qui touchent le joueur, fanfare de fin.
  director.playStings(stingsFor(prev, view, fromLobby));
}

export async function sendAction(action: Action, opts?: { quiet?: boolean }): Promise<ActionResult> {
  // Hors vue de partie (appelant sans trimestre courant), on n'invente rien : pas de `turn`.
  const state = getState();
  const turn = state.view?.turn;
  const room = state.session?.roomCode ?? 'local';
  const guidedAdjustment = isGuidedTutorial(state.tutorial, room) && (turn ?? 0) >= 2;
  const previousProduction = action.type === 'setProductDecisions'
    ? state.view?.companies.find((c) => c.id === action.companyId)?.products.find((p) => p.id === action.productId)?.private?.production
    : undefined;
  const r = peerBackend ? await peerBackend.action(action, turn) : mock ? mock.action(action, turn) : await applySoloAction(action, turn);
  if (!r.ok || !opts?.quiet) pushToast(r.ok ? 'good' : 'bad', r.message);
  // L'accusé d'un ancien trimestre/salon ne coche pas les étapes de la nouvelle vue.
  if (r.ok && action.type === 'setProductDecisions' && getState().view?.turn === turn &&
    (getState().session?.roomCode ?? 'local') === room &&
    (!guidedAdjustment || (action.production !== undefined && previousProduction !== undefined && action.production !== previousProduction))) {
    markTutorial('decisions');
  }
  return r;
}


async function closeSoloTurn(ready: boolean, turn?: number): Promise<boolean> {
  if (peerBackend) {
    const result = await peerBackend.ready(ready, turn);
    if (!result.ok) pushToast('bad', result.message);
    return result.ok;
  }
  if (!ready) return true;
  if (mock) { mock.ready(ready); return true; }
  const result = advanceSoloTurn(turn);
  if (!result.ok) pushToast('bad', result.message);
  return result.ok;
}
export function setReady(ready: boolean, turn?: number): void { void closeSoloTurn(ready, turn); }
export async function readyWhenSaved(turn?: number): Promise<boolean> {
  if (!(await flushProductSaves())) {
    pushToast('bad', t().topbar.readyNotSaved(unsavedProductNames().join(', ')));
    return false;
  }
  if (!(await closeSoloTurn(true, turn))) return false;
  markTutorial('ready');
  return true;
}
