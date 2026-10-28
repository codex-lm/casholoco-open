/**
 * Signaux publics du cycle crypto (bulle → krach), lus dans la seule vue d'un joueur : unes et brèves du
 * dernier numéro du journal, rumeurs avec leur fiabilité affichée, demande réalisée du secteur et cours
 * des entreprises cotées qui ont un produit crypto — l'envolée retenue est l'accélération du dernier
 * trimestre contre la tendance propre de chaque entreprise (une hausse régulière ne signale rien).
 * Les bots (petits patrons et magnats) décident leurs
 * ventes d'actions et leurs fermetures de produits crypto sur ces signaux seuls — jamais sur l'état caché
 * de la bulle (state.cryptoMarket, state.scheduledNews, state.rumorKeys restent interdits de lecture).
 * Les vraies rumeurs de krach et leurs sosies du pool des fausses sont indiscernables : toutes comptent.
 */
import { getContent } from '../content';
import type { CompanyView, Lang, PlayerView, RumorReliability } from '../types';
import { CRYPTO_CRASH_IDS, CRYPTO_EUPHORIA_IDS } from './cryptoMarket';
import { clamp } from './util';

// ---------------------------------------------------------------------------
// Réglages du détecteur de cycle crypto (poids du score et seuils de vente)
// ---------------------------------------------------------------------------

/** Poids du krach publié dans le numéro (une ou brève : une faillite peut voler la une). */
export const CRYPTO_SIGNAL_CRASH_NOW = 0.75;
/** Poids d'une rumeur de krach selon sa fiabilité affichée. */
export const CRYPTO_SIGNAL_RUMOR_WEIGHT: Record<RumorReliability, number> = { faible: 0.25, moyenne: 0.4, 'élevée': 0.55 };
/** Poids d'une carte d'euphorie dans le numéro : le sommet est proche, on vend dans la force. */
export const CRYPTO_SIGNAL_EUPHORIA_NOW = 0.25;
/** Poids d'une demande réalisée qui se retourne. */
export const CRYPTO_SIGNAL_DEMAND_FADING = 0.25;
/** Malus d'une demande encore en hausse (levé quand le krach est publié : l'historique a un trimestre de retard). */
export const CRYPTO_SIGNAL_DEMAND_RISING = -0.15;
/** Contribution de l'accélération des cours, pleine à +150 %. */
export const CRYPTO_SIGNAL_RUNUP_WEIGHT = 0.3;
export const CRYPTO_SIGNAL_RUNUP_FULL = 1.5;
/** Fenêtre en trimestres de la tendance propre de chaque entreprise (clôtures), contre laquelle le trimestre courant est mesuré. */
export const CRYPTO_SIGNAL_RUNUP_QUARTERS = 4;

/** Score à partir duquel un magnat vend (base ; la personnalité le déplace de ±0,15). */
export const CRYPTO_DUMP_SELL_THRESHOLD = 0.55;
/** Score à partir duquel un magnat liquide son produit crypto le plus faible (base ; ±0,15 de personnalité). */
export const CRYPTO_DUMP_CLOSE_THRESHOLD = 0.8;
/** Amplitude du déplacement des seuils par la personnalité (goût du risque retarde, avidité avance). */
export const CRYPTO_DUMP_THRESHOLD_SWING = 0.15;
/** Fraction vendue par un magnat : base + score + bonus de contrôleur, plafonnée. */
export const CRYPTO_DUMP_SELL_BASE = 0.3;
export const CRYPTO_DUMP_SELL_SCORE = 0.4;
export const CRYPTO_DUMP_SELL_CONTROLLER = 0.15;
export const CRYPTO_DUMP_SELL_MAX = 0.9;
/** Part minimale de la crypto dans le dernier CA pour vendre l'entreprise comme « crypto » (sauf si elle est née crypto). */
export const CRYPTO_DUMP_EXPOSURE_MIN = 0.4;
/** Marge de sécurité au-dessus de 50 % : un contrôleur ne descend jamais sous ce niveau en vendant. */
export const CRYPTO_DUMP_CONTROL_KEEP = 0.52;
/** Trimestres avant qu'une même participation puisse être revendue (verrou levé dès que le krach est publié). */
export const CRYPTO_DUMP_SELL_COOLDOWN = 2;

/** Fraction vendue par un petit patron sur rumeur de krach (base ; légèrement déplacée par la personnalité). */
export const CRYPTO_DUMP_BOT_RUMOR_SELL = 0.4;
/** Fraction vendue par un petit patron quand le krach fait la une — délibérément souvent trop tard. */
export const CRYPTO_DUMP_BOT_CRASH_SELL = 0.85;
/** Envolée minimale des cours pour qu'un petit patron ferme son produit crypto sur simple rumeur. */
export const CRYPTO_DUMP_BOT_RUNUP_PANIC = 2;

/** Ce qu'un joueur peut déduire du cycle crypto en ne lisant que son journal et la cote. */
export interface CryptoDumpSignals {
  /** Une carte crypto_bubble_* a été publiée dans le numéro lu (le dernier de la vue). */
  euphoriaNow: boolean;
  /** Une carte crypto_crash_* est publiée dans le numéro lu (en une, ou en brève si une faillite a volé la une). */
  crashNow: boolean;
  /** Rumeur de krach la plus crédible du numéro lu (vraies et fausses confondues). */
  crashRumor: false | { reliability: RumorReliability };
  /** Demande crypto réalisée : les 3 dernières entrées strictement en hausse (précédent du pump, bots.ts). */
  demandRising: boolean;
  /** Demande crypto réalisée : la dernière entrée repasse sous la précédente. */
  demandFading: boolean;
  /** Plus forte accélération de cours parmi les entreprises qui ont un produit crypto : mouvement du trimestre
   * courant contre la tendance propre (moyenne géométrique des clôtures précédentes) ; 1 = historique insuffisant. */
  priceRunUp: number;
  /** Force combinée du signal de sortie, 0..1, déterministe. */
  score: number;
}

/** Vrai pour une entreprise (vue) qui a au moins un produit crypto sur le marché — public, même chez un rival. */
export function companyHasCrypto(c: Pick<CompanyView, 'products'>): boolean {
  return c.products.some((p) => p.sectorId === 'crypto');
}

/**
 * Part de la crypto dans le dernier chiffre d'affaires de l'entreprise (CA négatifs ramenés à 0) ;
 * si le total est nul, 1 quand elle a un produit crypto, 0 sinon.
 */
export function cryptoExposure(c: Pick<CompanyView, 'products'>): number {
  let cryptoRevenue = 0;
  let total = 0;
  for (const p of c.products) {
    const r = Math.max(0, p.lastRevenue);
    total += r;
    if (p.sectorId === 'crypto') cryptoRevenue += r;
  }
  if (total <= 0) return companyHasCrypto(c) ? 1 : 0;
  return cryptoRevenue / total;
}

/** Même normalisation que les rumeurs de pénurie des magnats (botExpert.ts) : textes comparés sans casse ni accent d'apostrophe. */
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/[’']/g, "'").trim().toLowerCase();

interface CryptoTextSets {
  euphoriaTitles: Set<string>;
  crashTitles: Set<string>;
  crashRumors: Set<string>;
}

/**
 * Titres des cartes du cycle et textes des rumeurs de krach (vraies et sosies du pool des fausses),
 * reconstruits depuis le contenu dans la langue de la partie — jamais de chaîne recopiée à la main.
 * Les cartes du cycle n'ont pas de placeholder : le titre publié est exactement celui de la carte.
 */
const textSetsCache: Partial<Record<Lang, CryptoTextSets>> = {};
function cryptoTextSets(lang: Lang): CryptoTextSets {
  const hit = textSetsCache[lang];
  if (hit) return hit;
  const content = getContent(lang);
  const titles = (ids: readonly string[]) => new Set(
    ids.map((id) => content.newsCards.find((c) => c.id === id)?.headline)
      .filter((t): t is string => !!t)
      .map(norm),
  );
  const crashRumors = new Set<string>();
  for (const id of CRYPTO_CRASH_IDS) {
    const rumor = content.newsCards.find((c) => c.id === id)?.rumor;
    if (rumor) crashRumors.add(norm(rumor));
  }
  for (const f of content.fakeRumors) {
    if (f.id.startsWith('fake_crypto_crash')) crashRumors.add(norm(f.text));
  }
  const sets: CryptoTextSets = { euphoriaTitles: titles(CRYPTO_EUPHORIA_IDS), crashTitles: titles(CRYPTO_CRASH_IDS), crashRumors };
  textSetsCache[lang] = sets;
  return sets;
}

/**
 * Alarme à coût nul pour les petits patrons : vrai si le numéro contient un titre du cycle krach ou une
 * rumeur de krach (vraies et sosies confondues). Ne lit que le journal publié — pas de vue complète.
 */
export function cryptoCrashAlarm(
  issue: { articles: readonly { title: string }[]; rumors: readonly { text: string }[] },
  lang: Lang,
): boolean {
  const sets = cryptoTextSets(lang);
  for (const a of issue.articles) if (sets.crashTitles.has(norm(a.title))) return true;
  for (const r of issue.rumors) if (sets.crashRumors.has(norm(r.text))) return true;
  return false;
}

/**
 * Signaux de sortie crypto calculés sur la vue seule (dernier numéro du journal, demande réalisée, cote) :
 * deux vues identiques donnent des signaux identiques, quel que soit l'état caché de la bulle.
 */
export function cryptoDumpSignals(view: PlayerView, lang: Lang): CryptoDumpSignals {
  const sets = cryptoTextSets(lang);
  const issue = view.journal[view.journal.length - 1];
  let euphoriaNow = false;
  let crashNow = false;
  let crashRumor: CryptoDumpSignals['crashRumor'] = false;
  if (issue) {
    for (const a of issue.articles) {
      const title = norm(a.title);
      if (sets.crashTitles.has(title)) crashNow = true;
      else if (sets.euphoriaTitles.has(title)) euphoriaNow = true;
    }
    const rank: RumorReliability[] = ['faible', 'moyenne', 'élevée'];
    for (const r of issue.rumors) {
      if (!sets.crashRumors.has(norm(r.text))) continue;
      if (!crashRumor || rank.indexOf(r.reliability) > rank.indexOf(crashRumor.reliability)) {
        crashRumor = { reliability: r.reliability };
      }
    }
  }
  const history = view.sectors.find((s) => s.id === 'crypto')?.demandHistory ?? [];
  const n = history.length;
  const demandRising = n >= 3 && history[n - 1] > history[n - 2] && history[n - 2] > history[n - 3];
  const demandFading = n >= 2 && history[n - 1] < history[n - 2];
  let priceRunUp = 1;
  for (const c of view.companies) {
    if (c.status !== 'active' || !companyHasCrypto(c)) continue;
    const h = c.priceHistory;
    if (h.length <= CRYPTO_SIGNAL_RUNUP_QUARTERS) continue;
    const window = h.slice(-(CRYPTO_SIGNAL_RUNUP_QUARTERS + 1));
    if (window.some((x) => x <= 0)) continue;
    // Tendance propre : moyenne géométrique des progressions trimestrielles de la fenêtre.
    let logSum = 0;
    for (let i = 1; i < window.length; i++) logSum += Math.log(window[i] / window[i - 1]);
    const trend = Math.exp(logSum / (window.length - 1));
    const move = c.sharePrice / window[window.length - 1];
    priceRunUp = Math.max(priceRunUp, move / trend);
  }
  const score = clamp(
    (crashNow ? CRYPTO_SIGNAL_CRASH_NOW : 0)
    + (crashRumor ? CRYPTO_SIGNAL_RUMOR_WEIGHT[crashRumor.reliability] : 0)
    + (euphoriaNow ? CRYPTO_SIGNAL_EUPHORIA_NOW : 0)
    + (demandFading ? CRYPTO_SIGNAL_DEMAND_FADING : 0)
    + CRYPTO_SIGNAL_RUNUP_WEIGHT * clamp((priceRunUp - 1) / CRYPTO_SIGNAL_RUNUP_FULL, 0, 1)
    + (demandRising && !crashNow ? CRYPTO_SIGNAL_DEMAND_RISING : 0),
    0, 1);
  return { euphoriaNow, crashNow, crashRumor, demandRising, demandFading, priceRunUp, score };
}
