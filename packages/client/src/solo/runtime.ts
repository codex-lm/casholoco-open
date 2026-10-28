import {
  BOT_LEVELS, PLAYER_COLORS, SECTOR_IDS, applyAction, createGame, getContent, getPlayerView, resolveTurn,
  type Action, type ActionResult, type BotLevel, type GameState, type Lang, type LobbyPlayer, type PlayerView, type SectorId,
} from '@muchomoney/core';
import { decodeSoloSave, encodeSoloSave, saveInfo, SOLO_PLAYER_ID, SOLO_SAVE_KEY, SOLO_SAVE_VERSION, SOLO_TURNS, type SoloSave, type SoloSaveInfo, type SoloStorage } from './session';

export type { SoloSaveInfo, SoloStorage } from './session';
export { SOLO_PLAYER_ID, SOLO_SAVE_KEY, SOLO_TURNS } from './session';

export interface SoloOptions {
  name?: string;
  companyName?: string;
  sectorId?: SectorId;
  botCount?: number;
  botLevel?: BotLevel;
  mapMode?: 'classic' | 'hex' | 'square';
  totalTurns?: typeof SOLO_TURNS[number];
  seed?: number;
  lang?: Lang;
}

type ViewListener = (view: PlayerView | null) => void;
export interface SoloImportResult { ok: boolean; message: string; view?: PlayerView }

function browserStorage(): SoloStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

function randomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') return crypto.getRandomValues(new Uint32Array(1))[0];
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}

function newSaveId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `solo-${Date.now().toString(36)}-${randomSeed().toString(36)}`;
}

function cleanName(value: string | undefined, fallback: string): string {
  return (typeof value === 'string' ? value.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) : '') || fallback;
}

const messages = {
  fr: {
    noGame: 'Aucune partie solo en cours.',
    stale: 'Ce trimestre est déjà clôturé. Vérifiez les nouvelles valeurs avant de recommencer.',
    finished: 'La partie est terminée. Vous pouvez consulter les résultats ou en lancer une nouvelle.',
    closed: 'Le trimestre est clôturé.',
    invalid: 'Cette sauvegarde est invalide ou appartient à une autre version. Votre partie actuelle est conservée.',
    restored: 'Partie restaurée.',
    error: 'Le trimestre n’a pas pu être clôturé. La partie a été conservée ; vous pouvez réessayer.',
  },
  en: {
    noGame: 'No solo game is running.',
    stale: 'That quarter has already closed. Check the latest values before trying again.',
    finished: 'The game has finished. You can read the results or start a new game.',
    closed: 'Quarter closed.',
    invalid: 'This save is invalid or belongs to another version. Your current game has been kept.',
    restored: 'Game restored.',
    error: 'The quarter could not close. Your game has been kept; you can try again.',
  },
} as const;

/** Browser-independent local authority, reusable in tests and future editions. */
export function createSoloRuntime(storage: SoloStorage | null = browserStorage()) {
  let state: GameState | null = null;
  let saveId: string | null = null;
  let listener: ViewListener | null = null;
  let memorySave: string | null = null;
  let storageAvailable = storage !== null;
  let uiLang: Lang = 'fr';
  let validatedRaw: string | null | undefined;
  let validatedSave: SoloSave | null = null;

  const text = () => messages[state?.config.lang ?? uiLang];
  const currentView = () => state ? getPlayerView(state, SOLO_PLAYER_ID) : null;
  const publish = () => {
    const view = currentView();
    listener?.(view);
    return view;
  };
  const persist = () => {
    if (!state || !saveId) return;
    memorySave = encodeSoloSave(state, saveId);
    // Runtime-owned state has already passed the engine. Do not simulate an extra
    // expert turn each time the home screen reads the save description.
    validatedRaw = memorySave;
    validatedSave = { format: 'casholoco-solo', version: SOLO_SAVE_VERSION, playerId: SOLO_PLAYER_ID, saveId, state };
    if (storage) {
      try { storage.setItem(SOLO_SAVE_KEY, memorySave); storageAvailable = true; }
      catch { storageAvailable = false; }
    }
  };
  const read = () => {
    if (memorySave !== null) return memorySave;
    if (!storage) return null;
    try { return storage.getItem(SOLO_SAVE_KEY); }
    catch { storageAvailable = false; return null; }
  };
  const validated = (raw: string | null) => {
    if (raw === validatedRaw) return validatedSave;
    validatedRaw = raw;
    validatedSave = null;
    if (raw === null) return null;
    const save = decodeSoloSave(raw);
    if (!save) return null;
    // A structurally valid but inconsistent save must never replace a playable session.
    try {
      getPlayerView(save.state, SOLO_PLAYER_ID);
      const probe = JSON.parse(JSON.stringify(save.state)) as GameState;
      if (probe.phase === 'playing') resolveTurn(probe);
      if (!decodeSoloSave(encodeSoloSave(probe, save.saveId))) return null;
      validatedSave = save;
      return save;
    } catch { return null; }
  };

  return {
    setSoloViewListener(next: ViewListener | null): void { listener = next; },
    getSoloView(): PlayerView | null { return currentView(); },
    getSoloSaveId(): string | null { return saveId ?? validated(read())?.saveId ?? null; },
    startSolo(options: SoloOptions = {}): PlayerView {
      uiLang = options.lang === 'en' ? 'en' : 'fr';
      const bots = getContent(uiLang).bots;
      const botCount = Math.min(bots.length, 7, Math.max(1, Math.round(Number.isFinite(options.botCount) ? options.botCount! : 3)));
      const botLevel = BOT_LEVELS.includes(options.botLevel!) ? options.botLevel! : 'intern';
      const mapMode = options.mapMode === 'hex' || options.mapMode === 'square' ? options.mapMode : 'classic';
      const totalTurns = SOLO_TURNS.includes(options.totalTurns!) ? options.totalTurns! : 16;
      const players: LobbyPlayer[] = [{
        id: SOLO_PLAYER_ID,
        name: cleanName(options.name, uiLang === 'en' ? 'You' : 'Vous'),
        companyName: cleanName(options.companyName, 'Synergix'),
        sectorId: SECTOR_IDS.includes(options.sectorId!) ? options.sectorId! : 'energy_drinks',
        isBot: false, connected: true, color: PLAYER_COLORS[0],
      }, ...bots.slice(0, botCount).map((bot, i) => ({
        id: `bot${i + 1}`, name: bot.ceoName, companyName: bot.companyName, sectorId: bot.preferredSectors[0],
        botPersonalityId: bot.id, botLevel, isBot: true, connected: true, color: PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length],
      }))];
      // Create first so a failed setup cannot discard the running game or its save.
      const next = createGame({
        seed: Number.isFinite(options.seed) ? options.seed! : randomSeed(),
        totalTurns, turnSeconds: 0, startYear: 2027, lang: uiLang, botLevel, allowBotTakeover: false,
        ...(mapMode !== 'classic' ? { mapMode, terrainAssignment: 'fair', industryRules: 'network' } : {}),
      }, players);
      state = next;
      saveId = newSaveId();
      persist();
      return publish()!;
    },
    hasSoloSave(): boolean { return validated(read()) !== null; },
    getSoloSaveInfo(): SoloSaveInfo | null { const saved = validated(read()); return saved ? saveInfo(saved.state, saved.saveId) : null; },
    resumeSolo(): PlayerView | null {
      const saved = validated(read());
      if (!saved) return null;
      state = JSON.parse(JSON.stringify(saved.state)) as GameState;
      saveId = saved.saveId;
      state.players[SOLO_PLAYER_ID].connected = true;
      state.players[SOLO_PLAYER_ID].ready = false;
      persist();
      return publish();
    },
    applySoloAction(action: Action, turn?: number): ActionResult {
      if (!state) return { ok: false, message: text().noGame };
      if (turn !== undefined && turn !== state.turn) return { ok: false, message: text().stale };
      const result = applyAction(state, SOLO_PLAYER_ID, action);
      if (result.ok) { persist(); publish(); }
      return result;
    },
    advanceSoloTurn(turn?: number): ActionResult {
      if (!state) return { ok: false, message: text().noGame };
      if (turn !== undefined && turn !== state.turn) return { ok: false, message: text().stale };
      if (state.phase === 'finished') return { ok: false, message: text().finished };
      let next: GameState;
      try {
        next = JSON.parse(JSON.stringify(state)) as GameState;
        resolveTurn(next);
      } catch { return { ok: false, message: text().error }; }
      state = next;
      persist();
      publish();
      return { ok: true, message: text().closed };
    },
    leaveSolo(): void { persist(); state = null; saveId = null; publish(); },
    exportSoloSave(): string | null { if (state) persist(); return read(); },
    importSoloSave(raw: string, lang: Lang = uiLang): SoloImportResult {
      const save = validated(raw);
      if (!save) return { ok: false, message: messages[lang].invalid };
      state = JSON.parse(JSON.stringify(save.state)) as GameState;
      saveId = save.saveId;
      uiLang = state.config.lang ?? lang;
      state.players[SOLO_PLAYER_ID].connected = true;
      state.players[SOLO_PLAYER_ID].ready = false;
      persist();
      return { ok: true, message: text().restored, view: publish()! };
    },
    deleteSoloSave(): void {
      memorySave = null;
      validatedRaw = undefined;
      validatedSave = null;
      if (storage) {
        try { storage.removeItem(SOLO_SAVE_KEY); storageAvailable = true; }
        catch { storageAvailable = false; }
      }
    },
    soloStorageAvailable(): boolean { return storageAvailable; },
  };
}

const runtime = createSoloRuntime();
export const {
  setSoloViewListener, getSoloView, getSoloSaveId, startSolo, resumeSolo, hasSoloSave, getSoloSaveInfo, applySoloAction,
  advanceSoloTurn, leaveSolo, exportSoloSave, importSoloSave, deleteSoloSave, soloStorageAvailable,
} = runtime;
