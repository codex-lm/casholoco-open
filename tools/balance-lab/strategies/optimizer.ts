/**
 * Stratégies « optimizer-* » : un joueur compétitif qui cherche la meilleure politique possible DANS les règles.
 *
 * Informations : uniquement getPlayerView + règles publiques (GAME_DESIGN.md, SECTORS, COMMODITIES). Actions : api.act.
 * Paramètres trouvés par recherche (optimizer-search.ts) sur les graines d'ENTRAÎNEMENT 10001-10010, validés sur
 * 10011-10030 (opt-validate.ts), puis mesurés sur les graines de TOURNOI 1-20 (optimizer-eval.ts).
 *
 * Trois stratégies exportées (OPTIMIZERS) :
 *   optimizer-ops   : exploitation seule. Modèle logit du §5.2 recalculé depuis la vue (qualité, notoriété, prix et
 *                     réputation de tous les produits, demande du secteur), calibré en ligne sur les parts observées ;
 *                     prix et production optimisés sous incertitude ; marketing et R&D arbitrés contre leur valeur
 *                     future ; capacité ; 3 produits lancés dès le T1. Ni finance perso ni action discutable.
 *   optimizer-clean : ops + finance « légale » : contrôle > 50 % puis rachat de presque tout le flottant de sa propre
 *                     entreprise à crédit (prêt perso) et par rachats d'actions, sélection de titres sous-évalués,
 *                     com' de crise pour la réputation, achats de matières, plancher de bénéfice.
 *   optimizer-full  : clean + toutes les actions discutables utiles à chaque tour (optimisation fiscale, greenwashing,
 *                     espionnage, délocalisation, lobbying), jauge ramenée ≤ 20 (risque nul) par la com' de crise,
 *                     dénigrement du rival aux deux derniers tours.
 *
 * ---------------------------------------------------------------------------------------------------------------
 * CE QUI PAIE, ET POURQUOI
 * ---------------------------------------------------------------------------------------------------------------
 * 0. La clé de lecture : le poids d'un k selon QUAND et OÙ il apparaît. Valeur = bookValue + 40 × profitEma, avec
 *    profitEma ← 0,8 × profitEma + 0,2 × résultat courant, figé à la dernière résolution. Donc 1 k de bénéfice au
 *    tour t vaut w(t) = 1 + 8 × 0,8^(T−1−t) k de capitalisation finale : 1,4 au T1, 4,3 au T11, 9 au T15, 1 au T16.
 *    Tout ce qui est payé HORS compte de résultat (lancement, capacité, com' de crise, actions discutables) ne
 *    coûte que 1 k (0,5 pour la capacité, dont la moitié reste en valeur comptable). Toute la politique en découle.
 *
 * 1. Exploitation (ops ≈ 110 M de médiane contre 12-16 M pour passive ; il bat tous les bots dans 100 % des parties)
 *    - Lancer 3 produits au T1 (4 emplacements) : sans lancements, 28 M ; avec, 104 M (graines d'entraînement).
 *      Un lancement coûte 1,2 à 3 M hors P&L et ajoute un bénéfice capitalisé à ×40.
 *    - Investir tôt, récolter tard : marketing et R&D arbitrés contre leur valeur future pondérée par w(t).
 *      Version myope (gMult = 0) : 43 M au lieu de 107 M. La politique trouvée dépense fort du T3 au T10
 *      (parts de marché de 40-60 %), puis coupe la R&D vers le T12 : le bénéfice des T13-T15 (poids 6-9)
 *      gonfle profitEma au moment où il compte le plus.
 *    - Prix : optimum logit sous capacité (élasticité 4,5), production calée sur la demande prévue.
 *      Capacité : rentable dès que la contrainte mord (retour en 1-2 trimestres).
 *
 * 2. Posséder sa propre entreprise à crédit (clean : 340 M ; full sans ce levier : 463 M au lieu de 1 121 M).
 *    Le cours suit profitEma, qui retarde de ~5 trimestres sur des bénéfices que le PDG sait en hausse : acheter
 *    le flottant au prêt perso (LTV 0,5), puis le racheter avec la trésorerie oisive, amène la part de 40 % à ~100 %
 *    (S = 9 501 actions en fin de partie). L'impact de prix (n/2S) est faible devant un titre ×10-×30.
 *    ANTI-SYNERGIE découverte : levier perso + phase d'investissement = falaise. Si profitEma passe sous 0, le
 *    multiple tombe de 40 à 8 ; le cours chute de 60 % en un trimestre, appel de marge, ventes forcées, perte du
 *    contrôle. Sans plancher de bénéfice, optimizer-clean finit ruiné (−2 à −10 M) dans ~1 partie sur 6 ; avec un
 *    plancher de bénéfice avant impôt (0 à +1 000 k), plus aucune (q10 entraînement : ≈ 0 → +197 M).
 *
 * 3. Actions discutables « gratuites » (full ≈ ×3 sur clean). La com' de crise (400 k, −25 de jauge, aucune limite
 *    par tour) permet de tenir la jauge ≤ 20, où la probabilité d'éclatement est exactement nulle : les scandales
 *    deviennent un simple coût (16 k par point de jauge). Chaque levier retiré à full (médiane, entraînement) :
 *      optimisation fiscale −34 % (impôt 5 % au lieu de 25 %, donc +27 % sur le résultat qui entre dans profitEma) ;
 *      greenwashing −36 % (attractivité ×1,3 chaque tour pour 660 k hors P&L) ;
 *      espionnage −31 % (+0,1 de qualité à CHAQUE produit, même quand on est déjà le meilleur : le minimum de
 *        +0,1 s'applique aussi à un écart négatif ; ordre de grandeur : 1,3 M hors P&L pour 4 produits, contre
 *        ~2,7 M de R&D, elle dans le P&L) ;
 *      lobbying −27 % ; délocalisation −20 % ; com' de crise pour la réputation (1,3) −11 %.
 *
 * 4. Ce qui ne paie pas (ou peu) : bonus du PDG (−25 % : au-delà de 50 % de part, le bonus se reprend surtout
 *    sur soi-même, et chaque tranche coûte du sentiment sur le cours de clôture) ; OPA sur une PNJ (−17 %) et
 *    start-up (−19 %) : le levier sert mieux à racheter sa propre entreprise, et les nouveaux produits
 *    cannibalisent les siens ; sélection de titres (+18 %), achats de matières (+11 %), dénigrement final (0 :
 *    déjà gagné ; utile seulement entre joueurs proches).
 *
 * ---------------------------------------------------------------------------------------------------------------
 * CHIFFRES (graines de tournoi 1-20, sièges tournés, 3 bots, 16 tours ; M = millions)
 * ---------------------------------------------------------------------------------------------------------------
 *  Seul face à passive + 3 bots (40 parties chacun) :
 *    optimizer-full  100 % de victoires, NW médiane 991 M (q10 707)   ─┐
 *    optimizer-clean 100 %,              321 M (q10 168)                │ meilleur bot : brevet 26 M, passive 12 M
 *    optimizer-ops   100 %,              112 M (q10 71)               ─┘
 *  Même table (ops + clean + full + passive + 3 bots, 80 parties) : ordre strict full > clean > ops > passive ;
 *    full devant clean 100 %, clean devant ops 93 %, ops devant passive 93 %.
 *  Miroir full contre full (60 parties) : 57/43 ; le départage vient du secteur de départ (scooters 83 % et
 *    énergie 67 % des duels gagnés ; yaourts et crypto 25 %) ; écart médian ×1,26 entre jumeaux.
 * ---------------------------------------------------------------------------------------------------------------
 *
 * Outils : optimizer-eval.ts (tournoi), optimizer-search.ts (ablation | grid | random), opt-validate.ts,
 * opt-quick.ts (variantes JSON), opt-debug.ts (log d'une partie), opt-decomp.ts (diagnostic de l'état final,
 * hors stratégie : lit l'état caché, ne sert qu'à expliquer).
 */
import { hasKnownSupply, marketDemandMultiplier } from '../../../packages/core/src/sim/marketDemand';
import { brandAfter, outsideAttractiveness, productAttractiveness, qualityAfter } from '../../../packages/core/src/sim/advice';
import { me, myCompanies, activeCompanies, sectorOf, type Strategy, type StrategyApi, type StrategyCtx } from '../harness';
import {
  SECTORS,
  COMMODITIES,
  SECTOR_IDS,
  type PlayerView,
  type CompanyView,
  type ProductView,
  type SectorId,
  type CommodityId,
  type QuarterReport,
} from '../../../packages/core/src/index';
import { FLOAT_MIN as CORE_FLOAT_MIN, CRISIS_COMMS_SCANDAL as CORE_CRISIS_SCANDAL, PRICE_MAX_RATIO, PRICE_MIN_RATIO } from '../../../packages/core/src/sim/constants';

// ---------------------------------------------------------------------------
// Constantes des règles publiques (GAME_DESIGN.md)
// ---------------------------------------------------------------------------
const HQ = 250;
const EMERG = 1.1;
const PE = 40;
const LOSS_PE = 8;
const EMA_KEEP = 0.8;
const CRISIS_COST = 400;
const CRISIS_DELTA = -CORE_CRISIS_SCANDAL; // −13 depuis la mesure finale, une seule com' de crise par entreprise et par tour
const REP_MAX = 1.3;
const REP_CRISIS_CAP = 1; // lot 2 : la com' de crise ne remonte la réputation que jusqu'à 1
const FLOAT_MIN = CORE_FLOAT_MIN; // lot 2 : flottant minimal au-delà de 50 % + 1 (§6.2), 40 % depuis la mesure finale
const WHISTLE_COST = 500; // lot 2 : lanceur d'alerte (§7)
const MAX_MERGED = 6; // lot 2 : 6 produits après fusion
const LAUNCH_SPREAD = 4; // lot 1 : lancement passé en charge par quarts sur 4 trimestres (§5.6)
const INSIDER_PER_PCT = 1; // lot 1 : +1 de jauge par 1 % du capital racheté par le contrôleur (§6.2)
/** lot 1 : p(éclatement) = clamp((s − 10)/90, 0, 1)^1,5 (§8). */
export const scandalRisk = (s: number) => Math.pow(clamp((s - 10) / 90, 0, 1), 1.5);
void REP_MAX;
/** lot 2 : plus grand achat perso permis par le flottant minimal (50 % + 1, ou flottant ≥ 30 %). */
export function maxBuyAllowed(c: CompanyView, held: number): number {
  const S = c.sharesOutstanding;
  return Math.max(0, Math.min(c.floatShares, Math.max(Math.floor(S / 2) + 1 - held, Math.floor(c.floatShares - FLOAT_MIN * S + 1e-6))));
}
/** lot 2 : plus grand rachat d'actions permis (miroir de maxBuybackShares du moteur, avec les avoirs publics). */
export function maxBuybackAllowed(c: CompanyView, wanted: number): number {
  const top = Math.max(0, ...Object.values(c.holdings));
  const breach = (k: number) => top > Math.floor((c.sharesOutstanding - k) / 2) + 1 && c.floatShares - k < FLOAT_MIN * (c.sharesOutstanding - k) - 1e-6;
  let lo = 0;
  let hi = Math.max(0, Math.min(Math.floor(wanted), c.floatShares));
  if (!breach(hi)) return hi;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (breach(mid)) hi = mid - 1;
    else lo = mid;
  }
  return lo;
}
const LEVEL_RANK: Record<string, number> = { faible: 0, moyen: 1, 'élevé': 2 };

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------
export interface OptParams {
  // exploitation
  gMult: number; // multiplicateur de la valeur future de l'attractivité (marketing, R&D)
  capMult: number; // multiplicateur du gain futur d'une capacité supplémentaire
  capHurdle: number; // gain actualisé exigé / coût de la capacité
  launchHurdle: number; // valeur exigée / coût de lancement
  launchMaxTurnFromEnd: number; // plus de lancement quand il reste moins de N tours
  sigmaExtra: number; // incertitude de demande ajoutée à la volatilité du secteur
  effPersist: number; // persistance supposée des effets de news sur la demande (exposant)
  loanUse: number; // part du plafond d'emprunt d'entreprise mobilisable pour investir
  debtMax: number; // dette d'entreprise maximale / valeur comptable (le taux monte avec ce ratio)
  // leviers hors P&L
  repTarget: number; // réputation visée via la com' de crise (0 = off)
  repMinCash: number; // ... seulement si la trésorerie dépasse ce montant
  buyback: boolean; // rachats d'actions quand le cours est sous la valeur de clôture attendue
  buybackShrink: number;
  taxOpt: boolean;
  greenwash: boolean;
  offshore: boolean;
  espionage: boolean;
  lobbying: boolean;
  scandalMax: number; // jauge maximale visée à la résolution (après l'unique com' de crise du tour)
  scandalMaxEnd: number; // jauge maximale au dernier tour (un scandale à la clôture : amende + cours × 0,75)
  insiderMax: number; // jauge tolérée pour acheter ses propres actions (délit d'initié), après com' de crise
  ownPerTurn: number; // part du capital rachetée au plus par tour quand on est déjà contrôleur
  ctrlFirst: boolean; // monter à 51 % sans regarder la jauge (défense anti-OPA)
  // finance perso
  ownTarget: number; // participation visée dans sa propre entreprise (0 = off)
  ltv: number; // dette perso / portefeuille visée (≤ 0,5)
  pick: boolean; // achats de titres sous-évalués
  pickHurdle: number; // rendement attendu minimal
  pickShrink: number; // fraction de la taille optimale n* = S(E/p − 1)
  bonusFrac: number; // part du bonus maximal prise chaque tour (0 = jamais)
  bonusStop: number; // arrêter les bonus N tours avant la fin
  smearEnd: number; // dénigrer le rival principal pendant les N derniers tours (0 = jamais)
  raid: boolean; // OPA sur une entreprise PNJ
  raidPlayers: boolean; // ... ou sur l'entreprise d'un autre joueur (flottant disponible)
  startups: number; // nombre de start-ups à fonder (4 emplacements de produits de plus chacune)
  startupInvest: number; // mise visée (k), financée par cash perso + prêt perso
  startupFromTurn: number;
  raidFromTurn: number;
  raidToFromEnd: number;
  commodities: boolean; // acheter les matières au marché quand elles sont bon marché
  profitFloor: number; // bénéfice avant impôt minimal visé (k) : sous 0, profitEma bascule du multiple 40 au multiple 8
  marginSafety: number; // dette perso ≤ marginSafety × valeur des actions au cours cible prévu du tour suivant
  // lot 2
  noCrisis: boolean; // ablation : jamais de com' de crise (budget de jauge sans elle)
  whistle: number; // lanceur d'alerte : 0 = jamais ; 1 = rival devant nous dont la jauge publique est ≥ « moyen » ; 2 = rival devant nous, toujours
  whistleRatio: number; // ... seulement si sa valeur nette ≥ whistleRatio × la nôtre
  merge: boolean; // fusionner les entreprises acquises dans la principale (6 produits après fusion)
  comeback: boolean; // start-up de retour en jeu si l'on ne contrôle plus rien
}

export const BASE_PARAMS: OptParams = {
  gMult: 1.5,
  capMult: 1,
  capHurdle: 0.5,
  launchHurdle: 1,
  launchMaxTurnFromEnd: 4,
  sigmaExtra: 0.1,
  effPersist: 0.6,
  loanUse: 0.7,
  debtMax: 0.6,
  repTarget: 0,
  repMinCash: 8000,
  buyback: false,
  buybackShrink: 0.5,
  taxOpt: false,
  greenwash: false,
  offshore: false,
  espionage: false,
  lobbying: false,
  scandalMax: 20,
  scandalMaxEnd: 10,
  insiderMax: 20,
  ownPerTurn: 0.12,
  ctrlFirst: true,
  ownTarget: 0,
  ltv: 0,
  pick: false,
  pickHurdle: 0.25,
  pickShrink: 0.5,
  bonusFrac: 0,
  bonusStop: 4,
  smearEnd: 0,
  raid: false,
  raidPlayers: false,
  startups: 0,
  startupInvest: 4000,
  startupFromTurn: 2,
  raidFromTurn: 4,
  raidToFromEnd: 6,
  commodities: false,
  profitFloor: -Infinity,
  marginSafety: 1,
  noCrisis: false,
  whistle: 0,
  whistleRatio: 1,
  merge: true,
  comeback: true,
};

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const M = (s: SectorId) => SECTORS[s].refPrice * SECTORS[s].refDemand;
const mScale = (s: SectorId) => 0.02 * M(s);
const rScale = (s: SectorId) => 0.05 * M(s);

/** Poids, en capitalisation finale, d'1 k de bénéfice courant réalisé à la résolution du tour t. */
export function profitWeight(t: number, T: number): number {
  if (t > T) return 0;
  if (t === T) return 1; // profitEma figé : seul le cash compte
  return 1 + PE * (1 - EMA_KEEP) * Math.pow(EMA_KEEP, T - 1 - t);
}
/** Σ_{k=k0..T−t} w(t+k) × decay^k */
function futureW(t: number, T: number, decay: number, k0 = 1): number {
  let s = 0;
  for (let k = k0; t + k <= T; k++) s += profitWeight(t + k, T) * Math.pow(decay, k);
  return s;
}

function baseUnitCost(s: SectorId, spot?: Partial<Record<CommodityId, number>>): number {
  const def = SECTORS[s];
  let c = def.laborCost;
  for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) {
    c += per * (spot?.[cid] ?? COMMODITIES[cid].basePrice) * EMERG;
  }
  return c;
}

function attract(q: number, b: number, rep: number, price: number, s: SectorId, green = 1): number {
  return productAttractiveness(s, q, b, rep, price, green);
}

const brandNext = (b: number, m: number, s: SectorId) => brandAfter(s, b, m);
const qualNext = (q: number, r: number, s: SectorId) => qualityAfter(s, q, r);

// ---------------------------------------------------------------------------
// Modèle de marché (§5.1-5.3), calculé depuis la vue
// ---------------------------------------------------------------------------
interface Market {
  OPrice: number;
  D: number; // demande attendue du secteur
  O: number; // attractivité des autres (produits + concurrence extérieure), hors produit évalué
  sig: number;
}

function sectorDemand(view: PlayerView, s: SectorId, P: OptParams, lobbyMult: number): number {
  const def = SECTORS[s];
  const sv = sectorOf(view, s);
  const t = view.turn;
  const dm = Math.max(sv.demandMultiplier, 1e-3);
  let eff = 1;
  if (t >= 2 && sv.lastTotalDemand > 0) {
    eff = sv.lastTotalDemand / (def.refDemand * dm * Math.pow(1 + def.growth, t - 2) * (sv.lastMarketPriceMultiplier ?? 1));
    if (!Number.isFinite(eff) || eff <= 0) eff = 1;
  }
  return def.refDemand * Math.pow(1 + def.growth, t - 1) * Math.pow(dm, 0.85) * Math.pow(eff, P.effPersist) * lobbyMult;
}

function marketFor(view: PlayerView, s: SectorId, excludeProductId: string | null, P: OptParams, lobbyMult = 1, withComing = false): Market {
  const def = SECTORS[s];
  let O = outsideAttractiveness(s, view.turn);
  let OPrice = O * def.refPrice;
  for (const c of view.companies) {
    if (c.status !== 'active') continue;
    for (const p of c.products) {
      if (p.sectorId !== s || p.id === excludeProductId) continue;
      if (!hasKnownSupply(p, withComing ? 1 : 0)) continue; // Current supply, or installed orders in future projections.
      const a = attract(p.quality, p.brand, c.reputation, p.price, s);
      O += a;
      OPrice += a * p.price;
    }
  }
  return { D: sectorDemand(view, s, P, lobbyMult), O, OPrice, sig: Math.sqrt(def.volatility ** 2 + P.sigmaExtra ** 2) };
}

const SCEN = [
  [-Math.sqrt(3), 1 / 6],
  [0, 2 / 3],
  [Math.sqrt(3), 1 / 6],
];
const PROD_K = [0.8, 0.95, 1.05, 1.2, 1.4];

interface Plan {
  price: number;
  prod: number;
  profit: number; // bénéfice d'exploitation attendu (hors marketing, R&D, fixes)
  sales: number;
  revenue: number;
}

/** Meilleur (prix, production) pour une attractivité a0 (au prix de référence), capacité et stock donnés. */
function bestPlan(s: SectorId, a0: number, cap: number, stock: number, c: number, mk: Market): Plan {
  // Candidate production replaces the target's old plan, including a possible restart from zero.
  const def = SECTORS[s];
  const ref = def.refPrice;
  const per = def.perishability;
  let best: Plan = { price: ref, prod: 0, profit: -Infinity, sales: 0, revenue: 0 };
  const mults = SCEN.map(([z]) => Math.exp(z * mk.sig - 0.5 * mk.sig * mk.sig));
  const evalAt = (m: number) => {
    const p = ref * m;
    const a = a0 * Math.pow(1 / m, def.elasticity);
    const d = (mk.D * a) / (a + mk.O) * marketDemandMultiplier(s, a + mk.O, a * p + mk.OPrice);
    let lastProd = -1;
    for (const k of PROD_K) {
      const prod = Math.floor(clamp(d * k - stock, 0, cap));
      if (prod === lastProd) continue;
      lastProd = prod;
      const avail = stock + prod;
      let e = 0;
      let sold = 0;
      for (let i = 0; i < SCEN.length; i++) {
        const di = d * mults[i];
        const so = Math.min(di, avail);
        e += SCEN[i][1] * ((p - c) * so - c * per * (avail - so));
        sold += SCEN[i][1] * so;
      }
      if (e > best.profit) best = { price: p, prod, profit: e, sales: sold, revenue: sold * p };
    }
  };
  // recherche grossière puis fine autour du meilleur multiple de prix
  for (let m = PRICE_MIN_RATIO; m <= PRICE_MAX_RATIO + 1e-9; m += 0.1) evalAt(m);
  const m0 = best.price / ref;
  for (let m = Math.max(PRICE_MIN_RATIO, m0 - 0.09); m <= Math.min(PRICE_MAX_RATIO, m0 + 0.0901); m += 0.02) evalAt(m);
  return best;
}

// ---------------------------------------------------------------------------
// Valorisation des entreprises cotées depuis leurs comptes publics (§6.1)
// ---------------------------------------------------------------------------
function recurringNet(r: QuarterReport, withCharges = true): number {
  const charges = (r.amortization ?? 0) + (r.specialCharges ?? 0);
  const pretax = r.revenue - r.cogs - r.marketing - r.rnd - r.fixedCosts - r.interest - r.fines - (withCharges ? charges : 0);
  const rec = pretax + r.fines;
  const rate = pretax > 1 ? clamp(r.tax / pretax, 0, 0.9) : 0.25;
  return rec - Math.max(0, rec) * rate;
}

function revenueGrowth(reps: QuarterReport[]): number {
  if (reps.length < 2) return 0;
  let e = reps[0].revenue;
  const series = [e];
  for (let i = 1; i < reps.length; i++) {
    e = 0.6 * e + 0.4 * reps[i].revenue;
    series.push(e);
  }
  const now = series[series.length - 1];
  const past = series[Math.max(0, series.length - 1 - 4)];
  return clamp(now / Math.max(past, 1) - 1, -0.3, 0.5);
}

function publicBook(c: CompanyView): number {
  let v = c.cash - c.debt;
  for (const p of c.products) {
    v += 0.5 * (p.capacity + (p.private?.pendingCapacity ?? 0)) * SECTORS[p.sectorId].capacityCost;
    if (p.private) v += p.private.stock * p.private.lastUnitCost;
  }
  if (c.private) for (const l of Object.values(c.private.inventory)) if (l) v += l.lots * l.avgCost;
  return v;
}

interface Valuation {
  pe: number; // profitEma reconstitué
  rNet: number; // résultat courant récent
  E: number; // cours attendu à la clôture
}

/** À la première observation d'une entreprise, déduit son profitEma initial de son cours (fondamentale). */
function observe(view: PlayerView, mem: any) {
  mem.seen ??= {};
  for (const c of view.companies) {
    if (c.status !== 'active' || mem.seen[c.id]) continue;
    const p0 = c.priceHistory[0] ?? c.sharePrice;
    const bv0 = publicBook(c) + (c.reports.length === 0 ? 0 : 0);
    const pe0 = c.reports.length === 0 ? Math.max(0, (p0 * c.sharesOutstanding - bv0) / PE) : 0;
    mem.seen[c.id] = { pe0, n0: c.reports.length };
  }
}

function valuate(view: PlayerView, c: CompanyView, mem: any, plannedNet?: number): Valuation {
  const T = view.config.totalTurns;
  const t = view.turn;
  const seen = mem.seen?.[c.id] ?? { pe0: 0, n0: 0 };
  let pe = seen.pe0;
  const reps = c.reports;
  for (let i = seen.n0; i < reps.length; i++) pe = EMA_KEEP * pe + (1 - EMA_KEEP) * recurringNet(reps[i]);
  if (c.valuation && Number.isFinite(c.valuation.smoothedProfit)) pe = c.valuation.smoothedProfit; // lot 2 : public
  const last = reps.slice(-2).map((r) => recurringNet(r, false)); // charges étalées/ponctuelles : transitoires
  let rNet = last.length ? last.reduce((a, b) => a + b, 0) / last.length : pe;
  if (plannedNet !== undefined) rNet = Math.max(rNet, plannedNet);
  const updates = Math.max(0, T - t); // résolutions t..T−1 mettent à jour profitEma
  const peT = rNet + (pe - rNet) * Math.pow(EMA_KEEP, updates);
  const bvT = publicBook(c) + Math.max(0, rNet) * (T - t + 1) * 0.6;
  const g = revenueGrowth(reps);
  const netCash = Math.max(0, c.cash - c.debt);
  const floor = netCash + 0.3 * Math.max(0, bvT - netCash) + 500;
  const fund = Math.max(floor, bvT + (peT >= 0 ? PE * peT : LOSS_PE * peT)) * (1 + 0.5 * g);
  return { pe, rNet, E: fund / Math.max(c.sharesOutstanding, 1) };
}

// ---------------------------------------------------------------------------
// Exploitation d'une entreprise contrôlée
// ---------------------------------------------------------------------------
interface ProdCtx {
  p: ProductView;
  s: SectorId;
  mk: Market;
  cost: number;
  stock: number;
  cap: number;
  a0cur: number; // attractivité (au prix de réf.) avec les dépenses actuelles, après mise à jour
  coming: boolean; // lot 2 : lancé ce tour, vend au tour suivant
}

function productCtx(view: PlayerView, c: CompanyView, p: ProductView, P: OptParams, green: number, lobby: Set<SectorId>, mem?: any): ProdCtx {
  const s = p.sectorId;
  const mk = marketFor(view, s, p.id, P, lobby.has(s) ? 1.15 : 1);
  // Calibration apprise : écart observé entre part prédite et part réelle (odds), absorbé dans O.
  const k = Math.exp(mem?.cal?.[p.id]?.logk ?? 0);
  mk.O /= k;
  mk.OPrice /= k;
  const pr = p.private!;
  const a0cur = attract(qualNext(p.quality, pr.rnd, s), brandNext(p.brand, pr.marketing, s), c.reputation, SECTORS[s].refPrice, s, green);
  const coming = !!p.comingSoon;
  return { p, s, mk, cost: pr.estimatedUnitCost, stock: pr.stock, cap: coming ? pr.pendingCapacity : p.capacity, a0cur, coming };
}

const M_GRID = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
const R_GRID = [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2];

interface Decision {
  m: number;
  r: number;
  plan: Plan;
  a0: number;
  G: number;
}

function decideSpend(view: PlayerView, c: CompanyView, pc: ProdCtx, P: OptParams, green: number): Decision {
  const t = view.turn;
  const T = view.config.totalTurns;
  const s = pc.s;
  const wt = profitWeight(t, T);
  const f = (a0: number) => bestPlan(s, a0, pc.cap, pc.stock, pc.cost, pc.mk).profit;
  // Valeur future : le gain de bénéfice du tour (courbe concave f) répété sur les tours restants,
  // avec la persistance de la notoriété et de la qualité propres au secteur.
  const Wb = futureW(t, T, SECTORS[s].brandPersistence ?? 0.75) * P.gMult;
  const Wq = futureW(t, T, SECTORS[s].qualityDecay ?? 0.99) * P.gMult;
  const rep = c.reputation;
  const ref = SECTORS[s].refPrice;
  const q0 = qualNext(pc.p.quality, 0, s);
  const b0 = brandNext(pc.p.brand, 0, s);
  const fBase = f(attract(q0, b0, rep, ref, s, green));
  const fvB = M_GRID.map((mr) => Wb * (f(attract(q0, brandNext(pc.p.brand, mr * mScale(s), s), rep, ref, s, green)) - fBase));
  const fvQ = R_GRID.map((rr) => Wq * (f(attract(qualNext(pc.p.quality, rr * rScale(s), s), b0, rep, ref, s, green)) - fBase));
  // Montée de coordonnées (marketing, puis R&D, deux passes) : ~4× moins d'évaluations que la grille complète.
  const cache = new Map<number, { v: number; d: Decision }>();
  const evalIJ = (i: number, j: number) => {
    const key = i * 100 + j;
    const hit = cache.get(key);
    if (hit) return hit;
    const m = M_GRID[i] * mScale(s);
    const r = R_GRID[j] * rScale(s);
    const a0 = attract(qualNext(pc.p.quality, r, s), brandNext(pc.p.brand, m, s), rep, ref, s, green);
    const plan = bestPlan(s, a0, pc.cap, pc.stock, pc.cost, pc.mk);
    const out = { v: wt * ((pc.coming ? 0 : plan.profit) - m - r) + fvB[i] + fvQ[j], d: { m, r, plan, a0, G: 0 } };
    cache.set(key, out);
    return out;
  };
  let bi = fvB.indexOf(Math.max(...fvB.map((v, i) => v - wt * M_GRID[i] * mScale(s))));
  bi = Math.max(0, M_GRID.findIndex((_, i) => fvB[i] - wt * M_GRID[i] * mScale(s) === Math.max(...fvB.map((v, k) => v - wt * M_GRID[k] * mScale(s)))));
  let bj = Math.max(0, R_GRID.findIndex((_, j) => fvQ[j] - wt * R_GRID[j] * rScale(s) === Math.max(...fvQ.map((v, k) => v - wt * R_GRID[k] * rScale(s)))));
  for (let pass = 0; pass < 2; pass++) {
    let bv = -Infinity;
    for (let i = 0; i < M_GRID.length; i++) {
      const e = evalIJ(i, bj);
      if (e.v > bv) {
        bv = e.v;
        bi = i;
      }
    }
    bv = -Infinity;
    for (let j = 0; j < R_GRID.length; j++) {
      const e = evalIJ(bi, j);
      if (e.v > bv) {
        bv = e.v;
        bj = j;
      }
    }
  }
  const best = evalIJ(bi, bj).d;
  return best;
}

interface CompanyPlan {
  spend: number; // marketing + R&D prévus
  prodCost: number;
  revenue: number;
  opProfit: number; // Σ plan.profit − m − r
  fixed: number;
}

function runCompany(view0: PlayerView, api: StrategyApi, cid: string, P: OptParams, mem: any, isMain: boolean): CompanyPlan {
  const T = view0.config.totalTurns;
  const t = view0.turn;
  const R = T - t;
  let view = view0;
  let c = view.companies.find((x) => x.id === cid)!;
  const cm = ((mem.co ??= {})[cid] ??= {});
  const loanRoom = () => Math.max(0, Math.min((c.private?.loanLimit ?? 0) * P.loanUse, P.debtMax * Math.max(publicBook(c), 0) - c.debt));
  const ensureCash = (need: number): boolean => {
    if (c.cash >= need) return true;
    const short = need - c.cash + 1;
    if (short <= loanRoom()) {
      const r = api.act({ type: 'takeLoan', companyId: cid, amount: short });
      view = api.view();
      c = view.companies.find((x) => x.id === cid)!;
      return r.ok;
    }
    return false;
  };
  const refresh = () => {
    view = api.view();
    c = view.companies.find((x) => x.id === cid)!;
  };

  // 0) Calibration du modèle de demande sur le trimestre écoulé.
  const cal = (mem.cal ??= {});
  for (const p of c.products) {
    const e = cal[p.id];
    if (!e || e.turn !== t - 1 || !p.private) continue;
    const sh = clamp(p.lastMarketShare, 1e-4, 0.98);
    const oddsAct = sh / (1 - sh);
    const censored = p.private.stock < 0.02 * Math.max(p.capacity, 1);
    if (censored && oddsAct < e.odds) continue;
    e.logk = clamp(e.logk + 0.5 * Math.log(oddsAct / e.odds), -2.5, 2.5);
  }

  // Lot 1 : lancements, actions discutables et com' de crise passent dans le compte de résultat (donc × poids du
  // tour dans la valorisation), la com' de crise est limitée à une par tour (−15), et le risque d'éclatement
  // n'est nul que sous 10. On raisonne avec un budget de jauge par tour.
  const wt = profitWeight(t, T);
  const taxR = clamp(view.taxRate, 0, 0.9);
  /** Coût au score d'une charge ponctuelle de x k passée dans le résultat du tour. */
  const plCost = (x: number) => x * (1 + Math.max(0, wt - 1) * (1 - taxR));
  const scandalCost = (pts: number) => (pts / CRISIS_DELTA) * plCost(CRISIS_COST);
  const crisisAvail = () => !P.noCrisis && !c.private?.turnFlags?.crisisDone && c.cash > CRISIS_COST + 300;
  const capGauge = R === 0 ? Math.min(P.scandalMax, P.scandalMaxEnd) : P.scandalMax;
  const room = () => capGauge + (crisisAvail() ? CRISIS_DELTA : 0) - (c.private?.scandal ?? 0);

  // 2) Lancements : un produit par secteur libre, si la valeur actualisée le justifie.
  if (R >= P.launchMaxTurnFromEnd) {
    let guard = 0;
    while (c.products.length < (c.maxProducts ?? 4) && guard++ < 6) {
      const have = new Set(c.products.map((p) => p.sectorId));
      const ours = new Set(myCompanies(view).flatMap((x) => x.products.map((p) => p.sectorId)));
      const spot = Object.fromEntries(view.commodities.map((x) => [x.id, x.price])) as Record<CommodityId, number>;
      let bestS: SectorId | null = null;
      let bestV = 0;
      for (const s of SECTOR_IDS) {
        if (have.has(s)) continue;
        const def = SECTORS[s];
        const mk = marketFor(view, s, null, P, 1, true);
        const md = 0.015 * M(s);
        const rd = 0.01 * M(s);
        const a0 = attract(qualNext(1, rd, s), brandNext(0.3, md, s), c.reputation, def.refPrice, s);
        const plan = bestPlan(s, a0, def.startingCapacity, 0, baseUnitCost(s, spot), mk);
        const perTurn = plan.profit - md - rd - def.fixedCost;
        // coût étalé : un quart par trimestre, dont l'effet sur profitEma pèse (w − 1) × (1 − impôt)
        let amort = 0;
        for (let k = 0; k < LAUNCH_SPREAD && t + k <= T; k++) amort += (def.launchCost / LAUNCH_SPREAD) * (profitWeight(t + k, T) - 1) * (1 - taxR);
        let v = perTurn * futureW(t, T, 1, 1) - def.launchCost - amort; // lot 2 : vend à partir du tour suivant
        if (ours.has(s)) v *= 0.5; // cannibalisation d'un autre produit du groupe
        if (v > bestV && v > P.launchHurdle * def.launchCost) {
          bestV = v;
          bestS = s;
        }
      }
      if (!bestS) break;
      if (!ensureCash(SECTORS[bestS].launchCost + 1500)) break;
      const r = api.act({ type: 'launchProduct', companyId: cid, sectorId: bestS, name: `Opti ${bestS.slice(0, 4)} ${t}` });
      if (!r.ok) break;
      refresh();
    }
  }

  // 3) Leviers discutables : on évalue chacun (gain pondéré − coût au score), puis on les joue par ordre de
  //    rendement par point de jauge, tant que le budget de jauge du tour le permet.
  const lobby = new Set<SectorId>();
  for (const m of c.private?.modifiers ?? []) if (m.kind === 'lobbying' && m.sectorId && m.turnsLeft > 0) lobby.add(m.sectorId);
  let green = 1;
  if ((c.private?.modifiers ?? []).some((m) => m.kind === 'greenwashing')) green = 1.3;
  type Cand = { kind: 'industrial_espionage' | 'offshoring' | 'lobbying' | 'greenwashing' | 'tax_optimisation'; net: number; pts: number; sectorId?: SectorId };
  const cands: Cand[] = [];
  const done = new Set(c.private?.turnFlags?.shadyDone ?? []);

  if (P.espionage && R >= 3 && c.cash > 3000 && !done.has('industrial_espionage')) {
    let val = 0;
    for (const p of c.products) {
      let best = 0;
      for (const o of view.companies) {
        if (o.status !== 'active' || o.id === cid) continue;
        for (const op of o.products) if (op.sectorId === p.sectorId) best = Math.max(best, op.quality);
      }
      if (best <= p.quality + 1e-6) continue; // lot 1 : rien à copier sur un meilleur que soi
      const dq = 0.3 * (best - p.quality);
      const pc = productCtx(view, c, p, P, 1, lobby, mem);
      const f = (a0: number) => bestPlan(p.sectorId, a0, pc.cap, pc.stock, pc.cost, pc.mk).profit;
      const G = (f(pc.a0cur * 1.1) - f(pc.a0cur)) / Math.log(1.1);
      val += G * futureW(t, T, SECTORS[p.sectorId].qualityDecay ?? 0.99, 0) * (SECTORS[p.sectorId].qualityExponent ?? 1.3) * Math.log((p.quality + dq) / p.quality);
    }
    const net = val - plCost(1000) - scandalCost(20);
    if (val > 0 && net > 0) cands.push({ kind: 'industrial_espionage', net, pts: 20 });
  }

  if (P.offshore && R >= 1 && c.cash > 3000 && !(c.private?.modifiers ?? []).some((m) => m.kind === 'offshoring')) {
    let save = 0;
    for (const p of c.products) save += 0.3 * SECTORS[p.sectorId].laborCost * Math.min(p.capacity, p.private?.production ?? p.capacity);
    let v = 0;
    for (let k = 0; k < 3 && t + k <= T; k++) v += save * profitWeight(t + k, T);
    const repLoss = P.repTarget > 0 ? 2 * plCost(CRISIS_COST) : 0;
    const net = v - plCost(800) - scandalCost(15) - repLoss;
    if (net > 0) cands.push({ kind: 'offshoring', net, pts: 15 });
  }

  if (P.lobbying && c.cash > 3000) {
    let bestS: SectorId | null = null;
    let bestV = 0;
    for (const p of c.products) {
      if (lobby.has(p.sectorId)) continue;
      const pc = productCtx(view, c, p, P, 1, lobby, mem);
      const base = bestPlan(p.sectorId, pc.a0cur, pc.cap, pc.stock, pc.cost, pc.mk).profit;
      const mk2 = { ...pc.mk, D: pc.mk.D * 1.15 };
      const up = bestPlan(p.sectorId, pc.a0cur, pc.cap, pc.stock, pc.cost, mk2).profit;
      const v = (up - base) * (wt + (t < T ? profitWeight(t + 1, T) : 0));
      if (v > bestV) {
        bestV = v;
        bestS = p.sectorId;
      }
    }
    const net = bestV - plCost(1000) - scandalCost(10);
    if (bestS && net > 0) cands.push({ kind: 'lobbying', net, pts: 10, sectorId: bestS });
  }

  if (P.greenwash && c.cash > 2000 && green === 1 && !done.has('greenwashing')) {
    let v = 0;
    for (const p of c.products) {
      const pc = productCtx(view, c, p, P, 1, lobby, mem);
      const f = (a0: number) => bestPlan(p.sectorId, a0, pc.cap, pc.stock, pc.cost, pc.mk).profit;
      v += (f(pc.a0cur * 1.3) - f(pc.a0cur)) * wt;
    }
    const net = v - plCost(500) - scandalCost(10);
    if (net > 0) cands.push({ kind: 'greenwashing', net, pts: 10 });
  }

  if (P.taxOpt && c.cash > 1500 && !done.has('tax_optimisation')) {
    // bénéfice avant impôt estimé : plan du tour précédent, sinon dernier rapport
    const lp = cm.lastPlan as CompanyPlan | undefined;
    const lr = c.reports[c.reports.length - 1];
    const pretaxEst = lp ? lp.opProfit - lp.fixed - c.debt * view.interestRate * 1.3 : lr ? lr.netProfit + lr.tax : 0;
    if (pretaxEst > 0) {
      const v = wt * Math.max(0, view.taxRate - 0.05) * pretaxEst;
      const net = v - plCost(300) - scandalCost(15);
      if (net > 0) cands.push({ kind: 'tax_optimisation', net, pts: 15 });
    }
  }

  cands.sort((a, b) => b.net / b.pts - a.net / a.pts);
  for (const k of cands) {
    if (k.pts > room()) continue;
    const a = k.kind === 'lobbying' ? { type: 'shady' as const, companyId: cid, kind: k.kind, sectorId: k.sectorId } : { type: 'shady' as const, companyId: cid, kind: k.kind };
    if (api.act(a as any).ok) {
      if (k.kind === 'lobbying' && k.sectorId) lobby.add(k.sectorId);
      if (k.kind === 'greenwashing') green = 1.3;
      refresh();
    }
  }

  // 4) Décisions de production, marketing, R&D par produit ; capacité.
  const out: CompanyPlan = { spend: 0, prodCost: 0, revenue: 0, opProfit: 0, fixed: HQ };
  const decisions: { p: ProductView; d: Decision; pc: ProdCtx }[] = [];
  for (const p of c.products) {
    const pc = productCtx(view, c, p, P, green, lobby, mem);
    const d = decideSpend(view, c, pc, P, green);
    decisions.push({ p, d, pc });
  }
  // Budget : marketing et R&D sont plafonnés au cash au début de la résolution ; la production peut
  // creuser le cash tant que les ventes le renflouent. On emprunte au besoin, sinon on réduit les dépenses.
  {
    let spend = 0;
    let prodCost = 0;
    let rev = 0;
    let fixed = HQ;
    for (const { p, d, pc } of decisions) {
      spend += d.m + d.r;
      if (pc.coming) continue;
      prodCost += d.plan.prod * pc.cost;
      rev += d.plan.revenue;
      fixed += SECTORS[p.sectorId].fixedCost;
    }
    // Plancher de bénéfice : un profitEma négatif fait passer la valorisation du multiple 40 au multiple 8,
    // et avec du levier perso cette falaise déclenche des appels de marge. On rabote marketing et R&D.
    if (Number.isFinite(P.profitFloor) && spend > 0) {
      let op = 0;
      for (const { d, pc } of decisions) if (!pc.coming) op += d.plan.profit;
      const pretax = op - spend - fixed - c.debt * view.interestRate * 1.3;
      if (pretax < P.profitFloor) {
        const f = clamp(1 - (P.profitFloor - pretax) / spend, 0, 1);
        for (const x of decisions) {
          x.d.m *= f;
          x.d.r *= f;
        }
        spend *= f;
      }
    }
    const other = Math.max(0, prodCost + fixed + c.debt * view.interestRate * 2 - 0.6 * rev) + 300;
    const need = spend + other;
    if (c.cash < need) ensureCash(need);
    if (c.cash < need && spend > 0) {
      const f = clamp((c.cash - other) / spend, 0, 1);
      for (const x of decisions) {
        x.d.m *= f;
        x.d.r *= f;
      }
    }
  }
  for (const { p, d, pc } of decisions) {
    if (pc.coming) {
      api.act({ type: 'setProductDecisions', companyId: cid, productId: p.id, price: d.plan.price, production: d.plan.prod, marketing: d.m, rnd: d.r });
      out.spend += d.m + d.r;
      out.opProfit -= d.m + d.r;
      out.fixed += SECTORS[p.sectorId].fixedCost;
      continue;
    }
    const a = d.a0 * Math.pow(SECTORS[p.sectorId].refPrice / d.plan.price, SECTORS[p.sectorId].elasticity);
    cal[p.id] = { logk: cal[p.id]?.logk ?? 0, odds: a / pc.mk.O, turn: t };
    api.act({ type: 'setProductDecisions', companyId: cid, productId: p.id, price: d.plan.price, production: d.plan.prod, marketing: d.m, rnd: d.r });
    out.spend += d.m + d.r;
    out.prodCost += d.plan.prod * pc.cost;
    out.revenue += d.plan.revenue;
    out.opProfit += d.plan.profit - d.m - d.r;
    out.fixed += SECTORS[p.sectorId].fixedCost;
  }
  refresh();

  // Capacité : livrée au tour suivant ; 50 % du coût reste en valeur comptable.
  if (R >= 1) {
    const reserve = out.spend + Math.max(0, out.prodCost + out.fixed - 0.7 * out.revenue) + 800;
    for (const { p, d, pc } of decisions) {
      if (pc.coming) continue;
      const def = SECTORS[p.sectorId];
      const W = futureW(t, T, 1);
      const base = bestPlan(p.sectorId, d.a0, pc.cap, 0, pc.cost, pc.mk).profit;
      let bestL = 0;
      let bestV = 0;
      for (const x of [0.1, 0.2, 0.35, 0.5, 0.75, 1]) {
        const L = Math.max(1, Math.round(pc.cap * x));
        const gain = bestPlan(p.sectorId, d.a0, pc.cap + L, 0, pc.cost, pc.mk).profit - base;
        const cost = L * def.capacityCost;
        const v = P.capMult * gain * W - 0.5 * cost;
        if (v > P.capHurdle * cost && v > bestV) {
          bestV = v;
          bestL = L;
        }
      }
      if (bestL > 0) {
        const cost = bestL * def.capacityCost;
        if (ensureCash(cost + reserve)) {
          api.act({ type: 'expandCapacity', companyId: cid, productId: p.id, lots: bestL });
          refresh();
        }
      }
    }
  }

  // 5) Matières : acheter au marché quand le cours est bas (≤ 0,92 × base), pour ~1 tour de besoins.
  if (P.commodities && R >= 1) {
    const need: Partial<Record<CommodityId, number>> = {};
    for (const p of c.products) {
      for (const [cidm, per] of Object.entries(SECTORS[p.sectorId].inputs) as [CommodityId, number][]) {
        need[cidm] = (need[cidm] ?? 0) + per * Math.min(p.capacity, p.private?.production ?? 0);
      }
    }
    for (const [cm2, n] of Object.entries(need) as [CommodityId, number][]) {
      const cv = view.commodities.find((x) => x.id === cm2)!;
      const def = COMMODITIES[cm2];
      const have = c.private?.inventory[cm2]?.lots ?? 0;
      if (cv.price > 0.92 * def.basePrice) continue;
      const lots = Math.floor(Math.min(n * 1.5 - have, 0.08 * def.liquidity));
      if (lots >= 1 && c.cash > lots * cv.price * 1.2 + 2000) api.act({ type: 'buyCommodity', companyId: cid, commodityId: cm2, lots });
    }
    refresh();
  }

  // 7) Bonus du PDG (transfère (1 − part) du montant aux dépens du flottant).
  if (P.bonusFrac > 0 && t <= T - P.bonusStop && c.private && c.private.maxBonus > 50) {
    const amt = c.private.maxBonus * P.bonusFrac;
    if (api.act({ type: 'ceoBonus', companyId: cid, amount: amt }).ok) refresh();
  }

  // 7 bis) Rachat d'actions : la trésorerie oisive compte 1 pour 1 dans la valeur, mais racheter sous la valeur de
  // clôture attendue (cours = profitEma en retard sur les bénéfices réels) relue les actionnaires restants.
  if (P.buyback && c.floatShares > 0) {
    const v = valuate(view, c, mem, (out.opProfit - out.fixed) * 0.8);
    const S = c.sharesOutstanding;
    const reserve = out.spend + Math.max(0, out.prodCost + out.fixed - 0.6 * out.revenue) + 3000;
    const budget = c.cash - reserve - (c.private?.turnFlags?.borrowed ?? 0);
    const edge = v.E / c.sharePrice - 1;
    if (edge > 0.1 && budget > c.sharePrice * 10 && !c.private?.turnFlags?.buybackDone) {
      let n = Math.floor(Math.min(c.floatShares, S * edge * P.buybackShrink));
      // personne d'autre ne doit dépasser 50 % après annulation des actions
      const maxOther = Math.max(0, ...Object.entries(c.holdings).filter(([k]) => k !== view.you).map(([, h]) => h));
      n = Math.min(n, Math.floor(S - 2 * maxOther - 2));
      n = maxBuybackAllowed(c, n); // lot 2 : flottant minimal
      while (n >= 1 && c.sharePrice * n * (1 + n / (2 * S)) > budget) n = Math.floor(n * 0.8);
      if (n >= 1 && api.act({ type: 'buyback', companyId: cid, shares: n }).ok) refresh();
    }
  }

  // 8) Dénigrement du rival en fin de partie (cours de clôture × sentiment).
  if (P.smearEnd > 0 && R < P.smearEnd && c.cash > 1500 && isMain && room() >= 20) {
    const tgt = rivalCompany(view);
    if (tgt) {
      if (api.act({ type: 'shady', companyId: cid, kind: 'smear_campaign', targetCompanyId: tgt }).ok) refresh();
    }
  }

  // 9) Com' de crise : une seule par tour, jouée en fin de tour (crisisPass), après la finance perso.

  // 10) Trésorerie : rembourser la dette oisive (les intérêts pèsent sur profitEma).
  {
    const reserve = out.spend + Math.max(0, out.prodCost + out.fixed - 0.6 * out.revenue) + 1500;
    const excess = c.cash - reserve;
    if (c.debt > 1 && excess > 100 && (c.private?.turnFlags?.borrowed ?? 0) <= 0) {
      api.act({ type: 'repayLoan', companyId: cid, amount: Math.min(c.debt, excess) });
      refresh();
    } else if (c.cash < out.spend + 200) {
      ensureCash(out.spend + 400);
    }
  }
  cm.lastPlan = out;
  return out;
}

/**
 * Lot 1 : une seule com' de crise par entreprise et par tour (−15 de jauge, +0,05 de réputation, 400 k en frais
 * spéciaux). Jouée en fin de tour, quand toutes les hausses de jauge du tour sont connues.
 */
function crisisPass(view: PlayerView, api: StrategyApi, cid: string, P: OptParams) {
  const c = view.companies.find((x) => x.id === cid);
  if (!c?.private || c.private.turnFlags?.crisisDone || P.noCrisis) return;
  const T = view.config.totalTurns;
  const R = T - view.turn;
  const sc = c.private.scandal;
  const cap = R === 0 ? Math.min(P.scandalMax, P.scandalMaxEnd) : P.scandalMax;
  const forScandal = sc > cap && c.cash > CRISIS_COST + 100;
  const forRep = P.repTarget > 0 && R >= 2 && c.reputation < Math.min(P.repTarget, REP_CRISIS_CAP) - 0.01 && c.cash > Math.max(CRISIS_COST * 3, P.repMinCash);
  if (forScandal || forRep) api.act({ type: 'crisisComms', companyId: cid });
}

/** Entreprise où le joueur le mieux classé devant nous (hors nous) a le plus de valeur en actions. */
function rivalCompany(view: PlayerView): string | null {
  const meNW = me(view).netWorth;
  const rivals = view.players.filter((p) => p.id !== view.you).sort((a, b) => b.netWorth - a.netWorth);
  const top = rivals[0];
  if (!top) return null;
  let best: string | null = null;
  let bestV = 0;
  for (const c of view.companies) {
    if (c.status !== 'active' || c.controllerId === view.you) continue;
    const mine = (c.holdings[view.you] ?? 0) / c.sharesOutstanding;
    const theirs = (c.holdings[top.id] ?? 0) / c.sharesOutstanding;
    const v = (theirs - mine) * c.marketCap; // ce que perd le rival moins ce que nous perdons
    if (v > bestV) {
      bestV = v;
      best = c.id;
    }
  }
  void meNW;
  return best;
}

// ---------------------------------------------------------------------------
// Finance personnelle
// ---------------------------------------------------------------------------
function personalFinance(view0: PlayerView, api: StrategyApi, P: OptParams, mem: any, mainId: string | null) {
  let view = view0;
  const T = view.config.totalTurns;
  const t = view.turn;
  const R = T - t;
  const refresh = () => (view = api.view());
  // Valeur des actions au cours cible PRÉVU du tour suivant (profitEma mis à jour avec le bénéfice planifié) :
  // si nos propres résultats vont plonger (investissement), le collatéral plongera aussi.
  const stressedPortfolio = () => {
    let v = 0;
    for (const c of view.companies) {
      const h = c.holdings[view.you] ?? 0;
      if (h <= 0 || c.status !== 'active') continue;
      let px = c.sharePrice;
      if (c.controllerId === view.you) {
        const plan = mem.co?.[c.id]?.lastPlan as CompanyPlan | undefined;
        if (plan) {
          const val = valuate(view, c, mem);
          const net = (plan.opProfit - plan.fixed) * 0.75;
          const peNext = EMA_KEEP * val.pe + (1 - EMA_KEEP) * net;
          const bv = publicBook(c) + net;
          const fund = Math.max(Math.max(0, c.cash - c.debt) + 500, bv + (peNext >= 0 ? PE * peNext : LOSS_PE * peNext));
          px = Math.min(px, 0.5 * px + 0.5 * (fund / c.sharesOutstanding) * view.marketSentiment);
        }
      }
      v += h * px;
    }
    return v;
  };
  const debtRoom = () => {
    const mep = me(view);
    const port = mep.portfolioValue;
    let allowed = Math.min(view.personalLoanLimit, Math.max(0, P.ltv * port - mep.debt));
    if (P.marginSafety < 1) allowed = Math.min(allowed, Math.max(0, P.marginSafety * 0.8 * stressedPortfolio() - mep.debt));
    return Math.max(0, allowed);
  };
  const buy = (companyId: string, n: number, ignoreScandal = false): boolean => {
    const c = view.companies.find((x) => x.id === companyId)!;
    n = Math.floor(Math.min(n, c.floatShares, maxBuyAllowed(c, c.holdings[view.you] ?? 0)));
    if (c.controllerId === view.you && c.private && !ignoreScandal) {
      // lot 1, délit d'initié : +1 de jauge par 1 % du capital ; budget = insiderMax (+15 si la com' de crise reste)
      const crisis = !P.noCrisis && !c.private.turnFlags?.crisisDone && c.cash > CRISIS_COST + 300 ? CRISIS_DELTA : 0;
      const cap = (R === 0 ? Math.min(P.insiderMax, P.scandalMaxEnd) : P.insiderMax) + crisis;
      const pts = Math.max(0, cap - c.private.scandal);
      n = Math.min(n, Math.floor((pts / (100 * INSIDER_PER_PCT)) * c.sharesOutstanding));
    }
    if (n < 1) return false;
    const cost = c.sharePrice * n * (1 + n / (2 * c.sharesOutstanding));
    const mep = me(view);
    if (cost > mep.cash) {
      const need = cost - mep.cash + 1;
      if (need > debtRoom()) {
        // réduire à ce qui est finançable
        const budget = mep.cash + debtRoom() - 1;
        if (budget <= c.sharePrice) return false;
        let lo = 0;
        let hi = n;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (c.sharePrice * mid * (1 + mid / (2 * c.sharesOutstanding)) <= budget) lo = mid;
          else hi = mid - 1;
        }
        n = lo;
        if (n < 1) return false;
      }
      const cost2 = c.sharePrice * n * (1 + n / (2 * c.sharesOutstanding));
      if (cost2 > mep.cash) {
        const r = api.act({ type: 'takePersonalLoan', amount: cost2 - mep.cash + 1 });
        if (!r.ok) return false;
      }
    }
    const r = api.act({ type: 'buyShares', companyId, shares: n });
    refresh();
    return r.ok;
  };

  // A) Contrôle : dépasser 50 % (défense anti-OPA), puis viser ownTarget quand le titre est sous-évalué
  //    (le marché valorise profitEma, en retard sur les bénéfices que nous savons en train de monter).
  if (P.ownTarget > 0) {
    const ids = myCompanies(view).map((c) => c.id);
    const scored = ids.map((id) => {
      const c = view.companies.find((x) => x.id === id)!;
      const plan = mem.co?.[id]?.lastPlan as CompanyPlan | undefined;
      const planned = plan ? (plan.opProfit - plan.fixed) * 0.75 : undefined;
      return { id, edge: valuate(view, c, mem, planned).E / c.sharePrice };
    });
    scored.sort((a, b) => (a.id === mainId ? -1 : b.id === mainId ? 1 : b.edge - a.edge));
    for (const { id, edge } of scored) {
      const c = view.companies.find((x) => x.id === id)!;
      const held = c.holdings[view.you] ?? 0;
      const S = c.sharesOutstanding;
      const cheap = edge > 1.1;
      const ctrl = held / S < 0.51;
      const target = ctrl ? 0.51 : cheap && R >= 3 ? P.ownTarget : 0;
      const want = Math.ceil(target * S) + 1 - held;
      if (want > 0) buy(id, Math.min(want, Math.max(P.ownPerTurn * S, ctrl ? 0.2 * S : 0)), ctrl && P.ctrlFirst);
    }
  }

  // A bis) Start-ups : 4 emplacements de produits de plus, capitalisation initiale = trésorerie (aucune prime).
  // lot 2 : la start-up est réservée au joueur qui ne contrôle plus rien (retour en jeu).
  if ((P.comeback || P.startups > 0) && myCompanies(view).length === 0 && R >= 3) {
    {
      const mep = me(view);
      const budget = Math.min(P.startupInvest, mep.cash + debtRoom() - 1);
      if (budget >= 1500) {
        if (budget > mep.cash) api.act({ type: 'takePersonalLoan', amount: budget - mep.cash + 1 });
        // secteur où le groupe est le moins présent
        const count: Record<string, number> = {};
        for (const c of myCompanies(view)) for (const p of c.products) count[p.sectorId] = (count[p.sectorId] ?? 0) + 1;
        const sec = [...SECTOR_IDS].sort((a, b) => (count[a] ?? 0) - (count[b] ?? 0) || SECTORS[b].refPrice * SECTORS[b].refDemand - SECTORS[a].refPrice * SECTORS[a].refDemand)[0];
        api.act({ type: 'foundStartup', name: `Opti Start ${t}`, sectorId: sec, investment: Math.min(budget, me(api.view()).cash) });
        refresh();
      }
    }
  }

  // B) OPA sur une PNJ (raider).
  if (P.raid && t >= P.raidFromTurn && R >= P.raidToFromEnd) {
    const mine = myCompanies(view).length;
    if (mine < 2) {
      let best: CompanyView | null = null;
      let bestScore = 0;
      for (const c of activeCompanies(view)) {
        if (c.controllerId === view.you) continue;
        if (!P.raidPlayers && (c.founderId !== null || c.controllerId !== null)) continue; // PNJ au pilote automatique
        const held = c.holdings[view.you] ?? 0;
        const need = Math.floor(0.5 * c.sharesOutstanding) + 1 - held;
        if (need > c.floatShares) continue;
        const cost = c.sharePrice * need * (1 + need / (2 * c.sharesOutstanding));
        const mep = me(view);
        if (cost > mep.cash + debtRoom() * 0.95) continue;
        const v = valuate(view, c, mem);
        // lot 2 : une cible fusionnable ajoute ses produits aux nôtres (6 emplacements après fusion)
        const main = mainId ? view.companies.find((x) => x.id === mainId) : undefined;
        const fits = !main || main.products.length + c.products.length <= MAX_MERGED;
        if (P.merge && !fits) continue;
        const score = (v.E / c.sharePrice) * (1 / (1 + cost / 50000));
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best) {
        const need = Math.floor(0.5 * best.sharesOutstanding) + 1 - (best.holdings[view.you] ?? 0);
        buy(best.id, need);
      }
    }
  }

  // C) Titres sous-évalués (d'après les comptes publics) et ventes des surévalués.
  if (P.pick) {
    const cands: { c: CompanyView; E: number; ret: number }[] = [];
    for (const c of activeCompanies(view)) {
      if (c.controllerId === view.you) continue;
      const v = valuate(view, c, mem);
      const held = c.holdings[view.you] ?? 0;
      const E = v.E * (1 - 0.02 * R); // décote de prudence croissante avec l'horizon
      if (held > 0 && E < c.sharePrice * (1 - held / (2 * c.sharesOutstanding)) * 0.97) {
        api.act({ type: 'sellShares', companyId: c.id, shares: held });
        refresh();
        continue;
      }
      if (R < 1) continue;
      const rate = view.interestRate + 0.005;
      const ret = E / c.sharePrice - 1 - rate * R;
      if (ret > P.pickHurdle) cands.push({ c, E, ret });
    }
    cands.sort((a, b) => b.ret - a.ret);
    for (const { c, ret } of cands.slice(0, 3)) {
      const cur = view.companies.find((x) => x.id === c.id)!;
      const n = Math.floor(cur.sharesOutstanding * ret * P.pickShrink);
      const held = cur.holdings[view.you] ?? 0;
      // ne pas franchir 50 % par accident (une OPA engage à gérer) sauf raider
      const cap = P.raid ? n : Math.min(n, Math.floor(0.45 * cur.sharesOutstanding) - held);
      if (cap >= 1) buy(c.id, cap);
    }
  }

  // D) Désendettement : rembourser avec le cash oisif ; alléger si l'appel de marge approche.
  {
    const mep = me(view);
    if (mep.debt > 0 && mep.cash > 1) {
      api.act({ type: 'repayPersonalLoan', amount: Math.min(mep.debt, mep.cash) });
      refresh();
    }
  }
}

/** lot 2 : lanceur d'alerte contre le rival le plus riche devant nous (niveau de jauge public). */
function whistlePass(api: StrategyApi, P: OptParams) {
  const view = api.view();
  if (view.turn < 2 || view.self?.whistleblownThisTurn) return;
  const my = me(view);
  const rivals = view.players.filter((p) => p.id !== view.you && p.netWorth >= P.whistleRatio * my.netWorth).sort((a, b) => b.netWorth - a.netWorth);
  for (const r of rivals) {
    const cs = view.companies.filter((c) => c.status === 'active' && c.controllerId === r.id).sort((a, b) => b.marketCap - a.marketCap);
    const tgt = cs.find((c) => P.whistle >= 2 || (LEVEL_RANK[c.scandalLevel] ?? 0) >= 1);
    if (!tgt) continue;
    if (my.cash < WHISTLE_COST + 5) {
      if (view.personalLoanLimit < WHISTLE_COST + 50) return;
      if (!api.act({ type: 'takePersonalLoan', amount: WHISTLE_COST + 20 - Math.max(0, my.cash) }).ok) return;
    }
    api.act({ type: 'whistleblow', companyId: tgt.id });
    return;
  }
}

/** lot 2 : fusion des entreprises acquises dans la principale quand le contrôle de l'ensemble est sûr. */
function mergePass(api: StrategyApi, mem: any) {
  const v = api.view();
  const mine = myCompanies(v);
  if (mine.length < 2) return;
  const main = mine.find((c) => c.id === mem.mainId) ?? mine.sort((a, b) => b.marketCap - a.marketCap)[0];
  for (const t of mine) {
    if (t.id === main.id || t.private?.turnFlags?.justFounded) continue;
    const m = api.view().companies.find((x) => x.id === main.id)!;
    if (m.products.length + t.products.length > MAX_MERGED) continue;
    const ratio = t.sharePrice / Math.max(m.sharePrice, 0.01);
    const mine2 = (m.holdings[v.you] ?? 0) + (t.holdings[v.you] ?? 0) * ratio;
    const S2 = m.sharesOutstanding + t.sharesOutstanding * ratio;
    let maxOther = 0;
    for (const [pid, h] of Object.entries(m.holdings)) if (pid !== v.you) maxOther = Math.max(maxOther, h + (t.holdings[pid] ?? 0) * ratio);
    if (maxOther > 0.45 * S2 || mine2 < 0.5 * S2 + 2) continue;
    api.act({ type: 'merge', absorberId: main.id, targetId: t.id });
  }
}

// ---------------------------------------------------------------------------
// Fabrique de stratégie
// ---------------------------------------------------------------------------
export function makeOptimizer(name: string, params: Partial<OptParams> = {}, tier = 'expert'): Strategy {
  const P: OptParams = { ...BASE_PARAMS, ...params };
  return {
    name,
    tier,
    act(view: PlayerView, api: StrategyApi, ctx: StrategyCtx) {
      const mem = ctx.memory;
      observe(view, mem);
      if (view.phase !== 'playing') return;
      const mine = myCompanies(view);
      mem.mainId ??= mine[0]?.id ?? null;
      if (mem.mainId && !mine.some((c) => c.id === mem.mainId)) mem.mainId = mine[0]?.id ?? null;
      const done = new Set<string>();
      for (const c of mine) {
        runCompany(api.view(), api, c.id, P, mem, c.id === mem.mainId);
        done.add(c.id);
      }
      if (P.whistle > 0) whistlePass(api, P);
      personalFinance(api.view(), api, P, mem, mem.mainId);
      if (P.merge) mergePass(api, mem);
      // entreprises acquises ou fondées pendant ce tour : les gérer tout de suite
      for (const c of myCompanies(api.view())) if (!done.has(c.id)) runCompany(api.view(), api, c.id, P, mem, false);
      for (const c of myCompanies(api.view())) crisisPass(api.view(), api, c.id, P);
    },
  };
}

// Préréglages. optimizer-full = résultat de la recherche aléatoire locale (optimizer-search.ts random, graines
// 10001-10010, 40 essais), validé sur les graines 10011-10030. optimizer-clean = mêmes réglages sans aucune action
// discutable (seulement exploitation, com' de crise, finance, rachats). optimizer-ops = exploitation seule.
/** Réglages d'avant le lot 1 (règles d'origine), gardés pour mémoire. */
export const SEARCHED_V0: Partial<OptParams> = {
  gMult: 0.714, capHurdle: 0.155, sigmaExtra: 0.017, debtMax: 0.798, repTarget: 1.3, repMinCash: 21611, buyback: true,
  buybackShrink: 0.642, taxOpt: true, greenwash: true, offshore: true, espionage: true, lobbying: true, ownTarget: 0.95,
  ltv: 0.5, pick: true, pickShrink: 0.709, smearEnd: 2, commodities: true, profitFloor: -2000,
};
/**
 * Lot 1 : ré-optimisé (optimizer-search.ts random, 2 tours × 4 chaînes × 40 essais sur les graines 10001-10012,
 * puis validation sur 10013-10042 : lnNW 13,10 contre 12,99 pour SEARCHED_V0 adapté aux nouvelles règles).
 * Le greenwashing et le dénigrement final ne paient plus ; espionnage (rattrapage seulement), lobbying,
 * délocalisation et optimisation fiscale restent, dans un budget de jauge de 20 (une com' de crise par tour).
 */
const SEARCHED: Partial<OptParams> = {"gMult":0.714,"capHurdle":0,"launchHurdle":0.309,"sigmaExtra":0.017,"effPersist":0.395,"loanUse":0.927,"debtMax":0.983,"repTarget":1.3,"repMinCash":20527.884,"buyback":true,"buybackShrink":0.967,"taxOpt":true,"offshore":true,"espionage":true,"lobbying":true,"scandalMaxEnd":9.652,"ownTarget":0.95,"ltv":0.5,"pick":true,"pickShrink":0.96,"commodities":true,"profitFloor":1248.645};
/** Réglages du lot 1, gardés pour mémoire. */
export const SEARCHED_LOT1 = SEARCHED;
/**
 * Lot 2 (mesure finale) : ré-optimisé pour les règles du lot 2 (optimizer-search.ts random, 2 tours × 4 chaînes ×
 * 40 essais sur les graines 10001-10012, validation sur 10013-10042 : lnNW 12,58 contre 12,55 pour SEARCHED_LOT1).
 * L'espionnage (rattrapage seulement) et la sélection de titres ne paient plus ; la réputation visée est plafonnée
 * à 1 (com' de crise bridée).
 */
const SEARCHED2: Partial<OptParams> = {"gMult": 0.714, "capHurdle": 0, "launchHurdle": 0.309, "sigmaExtra": 0.09, "effPersist": 0.416, "loanUse": 0.927, "debtMax": 1.152, "repTarget": 1.0, "repMinCash": 20527.884, "buybackShrink": 0.967, "taxOpt": true, "offshore": true, "lobbying": true, "scandalMaxEnd": 9.652, "ownTarget": 0.95, "ltv": 0.5, "pickHurdle": 0.35, "pickShrink": 1, "commodities": true, "profitFloor": 1248.645, "whistleRatio": 0.746};
export const PRESETS: Record<string, Partial<OptParams>> = {
  'optimizer-ops': {},
  // sans les dopants hors P&L, le bénéfice plonge pendant la phase d'investissement : le plancher de bénéfice
  // évite la falaise du multiple 8 et les appels de marge sur le levier perso (sinon 1 partie sur 5 finit ruinée).
  'optimizer-clean': { ...SEARCHED2, taxOpt: false, greenwash: false, offshore: false, espionage: false, lobbying: false, smearEnd: 0, profitFloor: 1000 },
  'optimizer-full': SEARCHED2,
  // variantes testées (non retenues) : OPA sur une PNJ, start-ups
  'optimizer-raider': { ...SEARCHED2, raid: true },
  'optimizer-raider-joueurs': { ...SEARCHED2, raid: true, raidPlayers: true, merge: true },
};

export const optimizerOps = makeOptimizer('optimizer-ops', PRESETS['optimizer-ops']);
export const optimizerClean = makeOptimizer('optimizer-clean', PRESETS['optimizer-clean']);
export const optimizerFull = makeOptimizer('optimizer-full', PRESETS['optimizer-full']);
export const OPTIMIZERS = [optimizerOps, optimizerClean, optimizerFull];
