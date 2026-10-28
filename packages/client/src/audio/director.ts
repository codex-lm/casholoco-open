/**
 * Lecteur du navigateur : musique de fond enchaînée en fondu, ponctuations par-dessus (la musique s'efface le temps
 * de la ponctuation), volumes et son coupé (settings.ts). Rien ne joue avant le premier geste du joueur (règle des
 * navigateurs) ; la musique se met en pause quand l'onglet est caché ou le son coupé.
 *
 * Musique : deux lecteurs <audio> (on lance le suivant pendant que l'autre s'éteint), branchés sur le graphe Web Audio
 * pour régler le volume partout (iOS ignore le volume d'un <audio>). Ponctuations : fichiers courts décodés en mémoire.
 * Sans Web Audio, repli sur le volume des éléments, sans fondu.
 */
import { PLAYLISTS, musicUrl, stingUrl, type MusicContext, type MusicId, type StingId } from './catalog';
import { getAudioSettings, subscribeAudioSettings } from './settings';

/** Durée du fondu enchaîné entre deux morceaux, et avance avec laquelle on lance le suivant (s). */
const FADE_S = 2.5;
const LEAD_S = 3;
/** Musique à 30 % sous une ponctuation ; retour en 0,8 s. */
const DUCK = 0.3;
const UNDUCK_S = 0.8;
/** Ponctuations en attente au plus (les suivantes sont oubliées : mieux vaut rater un son que les empiler). */
const MAX_STING_QUEUE = 2;
/** WAV vide : amorce un <audio> dans le premier geste (iOS). */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode | null;
  track: MusicId | null;
  /** Contexte musical du morceau chargé (une reprise après une pause change de playlist si l'écran a changé). */
  context: MusicContext | null;
  /** Le morceau suivant a déjà été lancé pour ce passage (évite un double départ). */
  advanced: boolean;
  /** Le lecteur a déjà joué une fois (iOS ne laisse jouer un <audio> qu'après un premier play() dans un geste). */
  primed: boolean;
}

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Ordre de lecture : mélangé, sans rejouer tout de suite le dernier morceau entendu. */
function shuffled(list: readonly MusicId[], last: MusicId | null): MusicId[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out[0] === last) [out[0], out[1]] = [out[1], out[0]];
  return out;
}

class Director {
  private unlocked = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private decks: Deck[] = [];
  private active = 0;
  private context: MusicContext | null = null;
  private queue: MusicId[] = [];
  private last: MusicId | null = null;
  private stingQueue: StingId[] = [];
  private stingBusy = false;
  private buffers = new Map<StingId, Promise<AudioBuffer | null>>();
  private errors = 0;

  /**
   * Geste du joueur (clic, touche, fin de toucher) : le premier crée le graphe audio et lance la musique du moment ;
   * les suivants relancent ce que le navigateur aurait bloqué (geste qu'il ne compte pas, appel reçu sur iOS…).
   */
  unlock(): void {
    if (typeof document === 'undefined') return;
    if (!this.unlocked) this.setup();
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    this.refreshPlayback();
    // Amorce, sur un son vide, le lecteur libre qui n'a encore jamais joué : au premier geste, l'autre vient de lancer
    // le morceau du moment ; le suivant partira sur celui-ci, hors de tout geste.
    for (const d of this.decks) if (!d.primed && d !== this.decks[this.active]) this.prime(d);
  }

  /** Contexte musical de l'écran (catalog.musicContext) ; change de playlist en fondu s'il a changé. */
  setContext(context: MusicContext): void {
    if (context === this.context) return;
    this.context = context;
    this.queue = [];
    if (this.unlocked && this.audible()) this.next();
  }

  /** Ponctuations à jouer (catalog.stingsFor), dans l'ordre, par-dessus la musique. */
  playStings(ids: readonly StingId[]): void {
    if (!this.unlocked || ids.length === 0 || !this.sfxAudible()) return;
    for (const id of ids) if (this.stingQueue.length < MAX_STING_QUEUE) this.stingQueue.push(id);
    if (!this.stingBusy) void this.nextSting();
  }

  // ---------------------------------------------------------------------------
  // Musique
  // ---------------------------------------------------------------------------

  private setup(): void {
    this.unlocked = true;
    const Ctx = audioContextCtor();
    if (Ctx) {
      try {
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.duck = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(this.duck).connect(this.master);
        this.sfxBus.connect(this.master);
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
      }
    }
    for (let i = 0; i < 2; i++) this.decks.push(this.makeDeck());
    this.applyLevels(true);
    subscribeAudioSettings(() => {
      this.applyLevels(false);
      this.refreshPlayback();
    });
    document.addEventListener('visibilitychange', () => this.refreshPlayback());
  }

  private prime(deck: Deck): void {
    const el = deck.el;
    el.src = SILENT_WAV;
    el.muted = true;
    void el.play().then(
      () => {
        el.pause();
        el.muted = false;
      },
      () => {
        el.muted = false;
      },
    );
  }

  private makeDeck(): Deck {
    const el = new Audio();
    el.preload = 'auto';
    const deck: Deck = { el, gain: null, track: null, context: null, advanced: false, primed: false };
    if (this.ctx && this.musicBus) {
      try {
        const src = this.ctx.createMediaElementSource(el);
        deck.gain = this.ctx.createGain();
        deck.gain.gain.value = 0;
        src.connect(deck.gain).connect(this.musicBus);
      } catch {
        deck.gain = null;
      }
    }
    el.addEventListener('timeupdate', () => {
      const d = this.decks[this.active];
      if (d !== deck || deck.advanced || !Number.isFinite(el.duration)) return;
      if (el.duration - el.currentTime <= LEAD_S) {
        deck.advanced = true;
        this.next();
      }
    });
    el.addEventListener('ended', () => {
      if (this.decks[this.active] === deck && !deck.advanced) {
        deck.advanced = true;
        this.next();
      }
    });
    el.addEventListener('error', () => {
      // Fichier introuvable ou illisible : on passe au suivant, sans boucler à l'infini.
      if (this.decks[this.active] !== deck || this.errors++ > 6) return;
      window.setTimeout(() => this.next(), 500);
    });
    el.addEventListener('playing', () => {
      deck.primed = true;
      if (this.decks[this.active] === deck) this.errors = 0;
    });
    return deck;
  }

  private audible(): boolean {
    const s = getAudioSettings();
    return !s.muted && s.music > 0 && !(typeof document !== 'undefined' && document.hidden);
  }

  private sfxAudible(): boolean {
    const s = getAudioSettings();
    return !s.muted && s.sfx > 0 && !(typeof document !== 'undefined' && document.hidden);
  }

  /** Morceau suivant du contexte, en fondu enchaîné sur le lecteur libre. */
  private next(): void {
    if (!this.context || this.decks.length < 2) return;
    if (this.queue.length === 0) this.queue = shuffled(PLAYLISTS[this.context], this.last);
    const track = this.queue.shift() as MusicId;
    this.last = track;
    const from = this.decks[this.active];
    const toIndex = 1 - this.active;
    const to = this.decks[toIndex];
    this.active = toIndex;
    to.track = track;
    to.context = this.context;
    to.advanced = false;
    to.el.src = musicUrl(track);
    to.el.currentTime = 0;
    this.fadeDeck(to, 1);
    void to.el.play().catch(() => {});
    this.fadeDeck(from, 0, () => from.el.pause());
  }

  private fadeDeck(deck: Deck, target: number, done?: () => void): void {
    if (deck.gain && this.ctx) {
      const g = deck.gain.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(target, now + FADE_S);
    } else {
      deck.el.volume = target * this.musicLevel();
    }
    if (done) window.setTimeout(() => {
      if (this.decks[this.active] !== deck) done();
    }, FADE_S * 1000 + 50);
  }

  /** Volume perçu : le carré du curseur, plus naturel qu'une échelle linéaire. */
  private musicLevel(): number {
    const s = getAudioSettings();
    return s.muted ? 0 : s.music * s.music;
  }

  private sfxLevel(): number {
    const s = getAudioSettings();
    return s.muted ? 0 : s.sfx * s.sfx;
  }

  private applyLevels(immediate: boolean): void {
    if (this.master && this.musicBus && this.sfxBus && this.ctx) {
      const now = this.ctx.currentTime;
      const set = (p: AudioParam, v: number) => (immediate ? p.setValueAtTime(v, now) : p.setTargetAtTime(v, now, 0.05));
      set(this.master.gain, getAudioSettings().muted ? 0 : 1);
      set(this.musicBus.gain, this.musicLevel() || 0);
      set(this.sfxBus.gain, this.sfxLevel() || 0);
    } else {
      const active = this.decks[this.active];
      if (active) active.el.volume = this.musicLevel();
    }
  }

  /** Met la musique en pause quand elle ne s'entend pas (son coupé, onglet caché), la reprend sinon. */
  private refreshPlayback(): void {
    if (!this.unlocked) return;
    const deck = this.decks[this.active];
    if (!deck) return;
    if (!this.audible()) {
      for (const d of this.decks) d.el.pause();
      return;
    }
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
    if (!deck.track || deck.context !== this.context) {
      this.queue = [];
      this.next();
    } else if (deck.el.paused) void deck.el.play().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Ponctuations
  // ---------------------------------------------------------------------------

  private buffer(id: StingId): Promise<AudioBuffer | null> {
    let p = this.buffers.get(id);
    if (!p) {
      const ctx = this.ctx;
      p = ctx
        ? fetch(stingUrl(id))
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
            .then((data) => ctx.decodeAudioData(data))
            .catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(id, p);
    }
    return p;
  }

  private async nextSting(): Promise<void> {
    const id = this.stingQueue.shift();
    if (!id) {
      this.stingBusy = false;
      return;
    }
    this.stingBusy = true;
    const done = () => {
      this.setDuck(false);
      window.setTimeout(() => void this.nextSting(), 250);
    };
    if (!this.ctx || !this.sfxBus) {
      // Sans Web Audio : un <audio> jetable, au volume des effets.
      const el = new Audio(stingUrl(id));
      el.volume = this.sfxLevel();
      el.addEventListener('ended', done, { once: true });
      el.addEventListener('error', done, { once: true });
      void el.play().catch(done);
      return;
    }
    const buf = await this.buffer(id);
    if (!buf || !this.sfxAudible()) return done();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxBus);
    src.onended = done;
    this.setDuck(true);
    src.start();
  }

  private setDuck(on: boolean): void {
    if (!this.duck || !this.ctx) return;
    const g = this.duck.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? DUCK : 1, now + (on ? 0.15 : UNDUCK_S));
  }
}

/** Le lecteur unique de la page. */
export const director = new Director();
