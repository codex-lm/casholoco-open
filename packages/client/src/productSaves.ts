/**
 * Réglages d'un produit (prix, production, marketing, R&D) enregistrés sans bouton « Appliquer » : au relâcher du
 * curseur, à la sortie d'un champ ou sur Entrée, et après une courte pause pour les boutons − et + (plusieurs clics,
 * un seul enregistrement). Chaque enregistrement est une action `setProductDecisions` avec les quatre valeurs.
 * « Je suis prêt » attend les enregistrements en cours (`flushProductSaves`), y compris ceux d'une fiche refermée.
 * Rien ne change côté moteur : `setProductDecisions` ne touche pas au statut « prêt », et les rivaux ne voient
 * que les prix du trimestre précédent.
 */
import type { ActionResult, PlayerView, ProductView } from '@muchomoney/core';
import { MAX_SPEND_PER_PRODUCT } from '@muchomoney/core';

export interface ProductSettings {
  price: number;
  production: number;
  marketing: number;
  rnd: number;
}

export type SettingField = keyof ProductSettings;

const FIELDS: readonly SettingField[] = ['price', 'production', 'marketing', 'rnd'];

export function sameSettings(a: ProductSettings, b: ProductSettings): boolean {
  return FIELDS.every((f) => a[f] === b[f]);
}

/** Réglages enregistrés d'un produit qu'on dirige (vue privée). */
export function settingsOf(product: ProductView): ProductSettings {
  const priv = product.private;
  return { price: product.price, production: priv?.production ?? 0, marketing: priv?.marketing ?? 0, rnd: priv?.rnd ?? 0 };
}

/**
 * Bornes du moteur que les champs n'appliquent pas eux-mêmes : marketing et R&D plafonnés par produit et par
 * trimestre (prix et production sont déjà bornés par leurs champs). Appliquées avant l'envoi : sinon le serveur
 * pourrait retenir la valeur qu'il avait déjà, sans nouvel état à renvoyer, et la fiche garderait un chiffre faux.
 */
export function limitSettings(v: ProductSettings): ProductSettings {
  const marketing = Math.min(MAX_SPEND_PER_PRODUCT, v.marketing);
  const rnd = Math.min(MAX_SPEND_PER_PRODUCT, v.rnd);
  return marketing === v.marketing && rnd === v.rnd ? v : { ...v, marketing, rnd };
}

/** Boutons − et +, flèches du clavier sur un curseur : on attend cette pause avant d'enregistrer. */
export const SAVE_DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Réglages du début du trimestre (« Revenir aux réglages du début du trimestre »)
// ---------------------------------------------------------------------------

/**
 * Premières valeurs vues pour chaque produit dirigé, pour un salon et un trimestre. Relevées dans ce navigateur :
 * après un rechargement en cours de trimestre, ce sont les valeurs du chargement.
 */
export interface TurnStartSettings {
  room: string;
  turn: number;
  products: Readonly<Record<string, ProductSettings>>;
}

export function productKey(companyId: string, productId: string): string {
  return `${companyId}/${productId}`;
}

/** Ajoute les produits pas encore relevés pour ce trimestre ; renvoie `prev` tel quel si rien ne change. */
export function captureTurnStart(prev: TurnStartSettings | null, room: string, view: PlayerView): TurnStartSettings {
  const fresh = !prev || prev.room !== room || prev.turn !== view.turn;
  let products: Record<string, ProductSettings> | Readonly<Record<string, ProductSettings>> = fresh ? {} : prev.products;
  let added = false;
  for (const c of view.companies) {
    for (const p of c.products) {
      if (!p.private) continue;
      const key = productKey(c.id, p.id);
      if (key in products) continue;
      if (!added && !fresh) products = { ...products };
      (products as Record<string, ProductSettings>)[key] = settingsOf(p);
      added = true;
    }
  }
  if (!fresh && !added) return prev;
  return { room, turn: view.turn, products };
}

export function turnStartOf(s: TurnStartSettings | null, room: string, turn: number, companyId: string, productId: string): ProductSettings | undefined {
  if (!s || s.room !== room || s.turn !== turn) return undefined;
  return s.products[productKey(companyId, productId)];
}

// ---------------------------------------------------------------------------
// Enregistrements en cours (attendus par « Je suis prêt »)
// ---------------------------------------------------------------------------

/** Où vit une fiche : salon, entreprise, produit, et le nom du produit pour le dire au joueur. */
export interface SaverPlace {
  room: string;
  companyId: string;
  productId: string;
  name: string;
}

const placeKey = (p: SaverPlace) => `${p.room}|${productKey(p.companyId, p.productId)}`;
let anonymous = 0;

/** Fiches montées : « Je suis prêt » enregistre ce qui y attend (pause en cours, échec précédent). */
const mounted = new Set<ProductSaver>();
/**
 * Fiches refermées sur un enregistrement raté : « Je suis prêt » les réessaie (et reste bloqué si ça échoue encore),
 * la fiche rouverte reprend leur brouillon. Oubliées quand elles n'ont plus d'objet (`pruneProductSaves`).
 */
const orphans = new Map<string, ProductSaver>();
/** Enregistrements partis, même d'une fiche refermée depuis. */
const running = new Set<Promise<boolean>>();

/** Enregistre tout ce qui attend et patiente jusqu'aux accusés ; faux si un enregistrement a échoué. */
export async function flushProductSaves(): Promise<boolean> {
  const savers = [...mounted, ...orphans.values()];
  const all = [...savers.map((s) => s.flush()), ...running];
  return (await Promise.all(all)).every(Boolean);
}

/** Produits dont le dernier enregistrement a échoué (fiche ouverte ou refermée), pour le dire au joueur. */
export function unsavedProductNames(): string[] {
  const names = [...mounted, ...orphans.values()].filter((s) => s.getSnapshot().status === 'failed').map((s) => s.place?.name ?? '');
  return [...new Set(names.filter(Boolean))];
}

/** Fiche rouverte : le brouillon raté de la fiche refermée, s'il y en a un. */
export function orphanSaver(place: SaverPlace): ProductSaver | undefined {
  return orphans.get(placeKey(place));
}

/**
 * Nouvelle vue : oublie les échecs des fiches refermées devenus sans objet (autre salon, produit arrêté ou plus
 * dirigé, réglage changé ailleurs depuis, ou plus rien à enregistrer).
 */
export function pruneProductSaves(room: string, view: PlayerView): void {
  for (const [key, saver] of orphans) {
    const p = saver.place!;
    const product = p.room === room ? view.companies.find((c) => c.id === p.companyId)?.products.find((x) => x.id === p.productId) : undefined;
    if (!product?.private || saver.supersededBy(settingsOf(product))) orphans.delete(key);
  }
}

/** On quitte le salon : plus rien à réessayer. */
export function forgetProductSaves(): void {
  orphans.clear();
}

// ---------------------------------------------------------------------------
// Une fiche produit
// ---------------------------------------------------------------------------

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface SaverSnapshot {
  /** Valeurs à l'écran (la prévision les suit). */
  draft: ProductSettings;
  status: SaveStatus;
  /** Réglages ramenés dans les bornes du moteur au dernier enregistrement (la fiche dit pourquoi), sinon null. */
  adjusted: readonly SettingField[] | null;
}

export type SendSettings = (values: ProductSettings) => Promise<ActionResult>;

function addFields(a: readonly SettingField[] | null, b: readonly SettingField[]): readonly SettingField[] | null {
  if (b.length === 0) return a;
  return FIELDS.filter((f) => a?.includes(f) || b.includes(f));
}

/**
 * Brouillon et enregistrements d'une fiche produit, hors React (testable sans navigateur). Les envois partent un par
 * un, toujours avec les dernières valeurs à l'écran. Une nouvelle valeur du serveur ne remplace jamais un champ que
 * le joueur est en train de régler ; elle remplace un champ envoyé (valeur éventuellement bornée par le serveur).
 *
 * Ordre des messages : le serveur répond à `game:action` puis publie le nouvel état (au plus toutes les 200 ms) ;
 * la maquette de développement peut publier avant de répondre. Un état reçu pendant un envoi n'est pris pour son
 * résultat que si aucun écho d'un envoi précédent n'était encore attendu (`echoOwed`).
 */
export class ProductSaver {
  private draft: ProductSettings;
  /** Dernières valeurs reçues du serveur. */
  private server: ProductSettings;
  /** Valeurs que le serveur aura une fois l'envoi en cours accepté. */
  private target: ProductSettings;
  private inflight: ProductSettings | null = null;
  private lastSent: ProductSettings | null = null;
  /** Un envoi a été accepté et son nouvel état n'est pas encore arrivé. */
  private echoOwed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<boolean> = Promise.resolve(true);
  private failed = false;
  private saved = false;
  private adjusted: readonly SettingField[] | null = null;
  private turn: number | undefined;
  private attached = false;
  private readonly key: string;
  private snap: SaverSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(server: ProductSettings, private readonly send: SendSettings, readonly place?: SaverPlace) {
    this.draft = server;
    this.server = server;
    this.target = server;
    this.key = place ? placeKey(place) : `#${++anonymous}`;
    this.snap = { draft: server, status: 'idle', adjusted: null };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): SaverSnapshot => this.snap;

  private unsaved(): boolean {
    return !sameSettings(this.draft, this.target);
  }

  private emit(): void {
    const unsaved = this.unsaved();
    const status: SaveStatus =
      this.timer !== undefined || this.inflight ? 'saving' : this.failed && unsaved ? 'failed' : this.saved && !unsaved ? 'saved' : 'idle';
    const s = this.snap;
    if (s.draft === this.draft && s.status === status && s.adjusted === this.adjusted) return;
    this.snap = { draft: this.draft, status, adjusted: this.adjusted };
    for (const l of this.listeners) l();
  }

  /** Le joueur bouge un réglage (curseur, frappe) : la prévision suit, rien ne part encore. */
  edit(patch: Partial<ProductSettings>): void {
    this.draft = { ...this.draft, ...patch };
    this.adjusted = null;
    this.emit();
  }

  /** Fin d'un geste : 'now' (relâcher, sortie du champ, Entrée) ou 'soon' (− et +, flèches : après une pause). */
  commit(when: 'now' | 'soon'): void {
    if (when === 'now') {
      void this.flush();
      return;
    }
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
    this.emit();
  }

  /** Remet des réglages (ceux du début du trimestre) et les enregistre. */
  revertTo(values: ProductSettings): Promise<boolean> {
    this.draft = { ...values };
    this.adjusted = null;
    this.emit();
    return this.flush();
  }

  /**
   * Trimestre affiché par la fiche. Au changement, « Enregistré ✓ » et la ligne des bornes s'effacent : rien n'est
   * encore enregistré pour ce trimestre. Un échec dont le brouillon attend toujours reste affiché.
   */
  startTurn(turn: number): void {
    if (this.turn === turn) return;
    const first = this.turn === undefined;
    this.turn = turn;
    if (first) return;
    this.saved = false;
    this.adjusted = null;
    if (!this.unsaved()) this.failed = false;
    this.emit();
  }

  /** Enregistre maintenant ce qui attend (pause en cours, échec précédent) ; vrai si tout est enregistré. */
  readonly flush = (): Promise<boolean> => {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const p = this.chain.then(() => this.run());
    this.chain = p;
    running.add(p);
    void p.then(() => running.delete(p));
    return p;
  };

  private async run(): Promise<boolean> {
    // Plafonds du moteur appliqués avant l'envoi : la fiche montre la valeur retenue et dit pourquoi.
    const limited = limitSettings(this.draft);
    if (limited !== this.draft) {
      const draft = this.draft;
      this.adjusted = addFields(this.adjusted, FIELDS.filter((f) => limited[f] !== draft[f]));
      this.draft = limited;
    }
    const values = this.draft;
    if (sameSettings(values, this.target)) {
      this.failed = false;
      this.finish();
      return true;
    }
    const before = this.target;
    const sentBefore = this.lastSent;
    const serverAtSend = this.server;
    const owedAtSend = this.echoOwed;
    this.inflight = values;
    this.lastSent = values;
    this.target = values;
    this.emit();
    let r: ActionResult;
    try {
      r = await this.send(values);
    } catch {
      r = { ok: false, message: '' };
    }
    this.inflight = null;
    if (r.ok) {
      this.failed = false;
      this.saved = true;
      if (this.server !== serverAtSend && !owedAtSend) {
        // Nouvel état reçu avant l'accusé (maquette), sans écho d'un envoi précédent en attente : c'est le résultat.
        this.settle();
      } else {
        // Le serveur répond avant de publier : l'écho de cet envoi viendra (receiveServer). Un état reçu pendant
        // l'envoi était celui d'un envoi précédent ; le prendre pour celui-ci ferait revenir la fiche en arrière.
        this.echoOwed = true;
      }
    } else {
      this.target = before;
      this.lastSent = sentBefore;
      this.failed = true;
    }
    this.finish();
    return r.ok;
  }

  /** Après un enregistrement : affichage, et suivi d'une fiche refermée sur un échec. */
  private finish(): void {
    this.emit();
    if (this.attached || !this.place) return;
    if (this.snap.status === 'failed') {
      if (![...mounted].some((s) => s.key === this.key)) orphans.set(this.key, this);
    } else if (orphans.get(this.key) === this) {
      orphans.delete(this.key);
    }
  }

  /** Les champs envoyés prennent la valeur retenue par le serveur, en notant ceux qu'il a bornés. */
  private settle(): void {
    const sent = this.lastSent;
    const next = this.server;
    const d = { ...this.draft };
    const bounded: SettingField[] = [];
    if (sent) {
      for (const f of FIELDS) {
        if (d[f] !== sent[f]) continue;
        if (next[f] !== sent[f]) bounded.push(f);
        d[f] = next[f];
      }
    }
    this.draft = sameSettings(d, this.draft) ? this.draft : d;
    this.target = next;
    this.lastSent = null;
    this.echoOwed = false;
    this.adjusted = addFields(this.adjusted, bounded);
  }

  /** Nouvelles valeurs du serveur (écho d'un enregistrement, ou autre changement). */
  receiveServer(next: ProductSettings): void {
    if (sameSettings(next, this.server)) return;
    const prev = this.server;
    this.server = next;
    this.echoOwed = false;
    if (this.inflight) {
      // Un envoi est en route : seuls les champs que le joueur n'a pas touchés et qui ne partent pas suivent le serveur.
      const sending = this.inflight;
      const d = { ...this.draft };
      for (const f of FIELDS) if (d[f] === prev[f] && d[f] !== sending[f]) d[f] = next[f];
      this.draft = sameSettings(d, this.draft) ? this.draft : d;
    } else {
      const d = { ...this.draft };
      const bounded: SettingField[] = [];
      for (const f of FIELDS) {
        if (d[f] === prev[f]) d[f] = next[f];
        else if (this.lastSent && d[f] === this.lastSent[f]) {
          if (next[f] !== this.lastSent[f]) bounded.push(f);
          d[f] = next[f];
        }
      }
      this.draft = sameSettings(d, this.draft) ? this.draft : d;
      this.target = next;
      this.lastSent = null;
      this.adjusted = addFields(this.adjusted, bounded);
    }
    this.emit();
  }

  /** Fiche refermée sur un échec : le serveur a changé depuis (enregistré ailleurs), ou il n'y a plus rien à enregistrer. */
  supersededBy(next: ProductSettings): boolean {
    const known = sameSettings(next, this.server) || sameSettings(next, this.target);
    return !known || sameSettings(next, this.draft);
  }

  /** Fiche montée : « Je suis prêt » attend ses enregistrements. Au démontage, ce qui attend part tout de suite. */
  attach(): () => void {
    this.attached = true;
    mounted.add(this);
    // Fiche rouverte : elle reprend (ou remplace) l'échec de la fiche refermée.
    orphans.delete(this.key);
    return () => {
      this.attached = false;
      mounted.delete(this);
      void this.flush();
    };
  }
}
