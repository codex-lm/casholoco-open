/**
 * Stratégies spécialisées « de bon niveau » pour l'audit d'équilibrage.
 *
 * Chacune mise sur un axe : raider, industrialist, speculator, shady, turtle, marketer.
 * Toutes ne lisent que la vue joueur (getPlayerView) et les règles publiques (docs/GAME_DESIGN.md,
 * SECTORS / COMMODITIES). Exception assumée et signalée : le décodage du journal (cf. `decodeIssue`)
 * relie le TEXTE publié d'une news ou d'une rumeur à sa carte (effets). Un humain fait la même chose
 * en lisant le titre ; l'option `memorizeFakes` va plus loin et simule un joueur qui a vu assez de
 * parties pour reconnaître par cœur les fausses rumeurs (leurs textes sont fixes).
 *
 * Briques communes :
 *  - modèle de marché (logit §5.2) reconstruit depuis la vue : qualité, notoriété, réputation et prix
 *    des concurrents sont publics ; la demande du secteur est prévue depuis lastTotalDemand ;
 *  - `pricePlan` : prix et production optimaux pour le trimestre (meilleure réponse aux prix affichés,
 *    les bots ayant déjà joué), joint sur mes produits d'un même secteur ;
 *  - `planSpend` (ops 'full') : marketing/R&D/capacité par simulation multi-tours, en pondérant chaque
 *    bénéfice par sa valeur au classement final (cash + 40 × profitEma au dernier cours) ;
 *  - matières achetées au marché quand c'est moins cher que l'achat d'urgence (×1,1) ;
 *  - trésorerie (emprunt / remboursement) et défense anti-OPA ;
 *  - estimation de la cible de cours de chaque entreprise (§6.1) à partir des rapports publics.
 */
import { hasKnownSupply, marketDemandMultiplier } from '../../../packages/core/src/sim/marketDemand';
import { brandAfter, outsideAttractiveness, productAttractiveness, qualityAfter, sectorNewsMultiplier } from '../../../packages/core/src/sim/advice';
import { PRICE_MAX_RATIO, PRICE_MIN_RATIO } from '../../../packages/core/src/sim/constants';
import {
  SECTORS,
  COMMODITIES,
  SECTOR_IDS,
  COMMODITY_IDS,
  getContent,
  type PlayerView,
  type CompanyView,
  type ProductView,
  type SectorId,
  type CommodityId,
  type NewsEffect,
  type QuarterReport,
} from '../../../packages/core/src/index';
import {
  me,
  myCompanies,
  activeCompanies,
  sectorOf,
  runTournament,
  formatReport,
  passive,
  random,
  type Strategy,
  type StrategyApi,
  type StrategyCtx,
} from '../harness';

// ---------------------------------------------------------------------------
// Constantes des règles publiques (GAME_DESIGN)
// ---------------------------------------------------------------------------
const HQ = 250;
const PE = 40;
const EMA_KEEP = 0.8;
const EMERGENCY = 1.1;
const CRISIS_COST = 400;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mSize = (sid: SectorId) => SECTORS[sid].refPrice * SECTORS[sid].refDemand;
const fixedOf = (c: CompanyView) => HQ + c.products.reduce((s, p) => s + SECTORS[p.sectorId].fixedCost, 0);
const reserveOf = (c: CompanyView) => 1000 + 2 * fixedOf(c);
const lastTurn = (v: PlayerView) => v.config.totalTurns;
const isLastTurn = (v: PlayerView) => v.turn >= lastTurn(v);
const turnsLeft = (v: PlayerView) => lastTurn(v) - v.turn + 1; // résolutions restantes, celle-ci comprise

/** Poids d'un bénéfice avant impôt réalisé à la résolution du tour `tau` dans la valeur finale de l'entreprise. */
function profitWeight(v: PlayerView, tau: number): number {
  const T = lastTurn(v);
  if (tau > T) return 0;
  const cash = 1 - v.taxRate; // reste en trésorerie (valeur comptable)
  if (tau >= T) return cash; // profitEma n'est pas mis à jour à la dernière résolution
  return cash * (1 + PE * (1 - EMA_KEEP) * Math.pow(EMA_KEEP, T - 1 - tau));
}

// ---------------------------------------------------------------------------
// Décodage du journal : news publiées ce tour et rumeurs pour le suivant
// ---------------------------------------------------------------------------
interface Decoded {
  /** Effets des news publiées ce tour (déjà appliqués pour les effets immédiats). */
  news: { effects: NewsEffect[]; companyIds: string[]; sectorIds: SectorId[]; commodityIds: CommodityId[] }[];
  /** Rumeurs : effets annoncés pour le tour prochain, pondérés par la probabilité d'être vraie. */
  rumors: { effects: NewsEffect[]; prob: number }[];
}

const decodeCache = new Map<string, Decoded>();
function decodeIssue(v: PlayerView, memorizeFakes: boolean): Decoded {
  const issue = v.journal.find((j) => j.turn === v.turn) ?? v.journal[v.journal.length - 1];
  const out: Decoded = { news: [], rumors: [] };
  if (!issue) return out;
  const key = `${v.config.lang}|${issue.turn}|${issue.articles.length}|${issue.rumors.map((r) => r.text).join('#')}|${memorizeFakes}`;
  const hit = decodeCache.get(key);
  if (hit) return hit;
  const content = getContent(v.config.lang);
  for (const a of issue.articles) {
    if (a.kind !== 'headline' && a.kind !== 'news') continue;
    const card = content.newsCards.find((c) => c.body === a.body);
    if (!card) continue;
    out.news.push({ effects: card.effects, companyIds: a.companyIds ?? [], sectorIds: a.sectorIds ?? [], commodityIds: a.commodityIds ?? [] });
  }
  // P(vraie | fiabilité affichée) : vraie = élevée 60 % / moyenne 40 % ; fausses (0-2 par numéro) = faible 50 %, moyenne 40 %, élevée 10 %.
  const prior: Record<string, number> = { élevée: 0.86, moyenne: 0.5, faible: 0.0 };
  for (const r of issue.rumors) {
    const card = content.newsCards.find((c) => c.rumor === r.text);
    const fake = content.fakeRumors.find((f) => f.text === r.text);
    if (card) out.rumors.push({ effects: card.effects, prob: memorizeFakes ? 1 : prior[r.reliability] ?? 0.5 });
    else if (fake && !memorizeFakes && fake.commodityId) {
      // le joueur naïf lit une pénurie annoncée (comme les bots)
      out.rumors.push({ effects: [{ type: 'commodityPrice', commodityId: fake.commodityId, multiplier: 1.2 }], prob: prior[r.reliability] ?? 0.5 });
    }
  }
  decodeCache.set(key, out);
  return out;
}

/** Multiplicateur de demande d'un secteur dû aux news publiées ce tour, pour la résolution tau = turn + k. */
function newsDemandMult(d: Decoded, sid: SectorId, k: number): number {
  let m = 1;
  for (const n of d.news)
    for (const e of n.effects) {
      if (e.type !== 'sectorDemand') continue;
      const hits = e.sectorId === 'random' ? n.sectorIds.includes(sid) : e.sectorId === sid;
      if (hits && k < e.duration) m *= sectorNewsMultiplier(sid, e.multiplier);
    }
  return m;
}

/** Tendance attendue du prix d'une matière (news publiées + rumeurs pondérées), > 1 = hausse. */
function commodityOutlook(d: Decoded, cid: CommodityId): { supplyNow: number; jumpNext: number } {
  let supplyNow = 1;
  for (const n of d.news)
    for (const e of n.effects) {
      if (e.type === 'commoditySupply' && (e.commodityId === cid || (e.commodityId === 'random' && n.commodityIds.includes(cid)))) supplyNow *= e.multiplier;
    }
  let jumpNext = 1;
  for (const r of d.rumors)
    for (const e of r.effects) {
      if ((e.type === 'commodityPrice' || e.type === 'commoditySupply') && e.commodityId === cid) {
        const m = e.type === 'commodityPrice' ? e.multiplier : 1 + (e.multiplier - 1) * 0.5;
        jumpNext *= 1 + (m - 1) * r.prob;
      }
    }
  return { supplyNow, jumpNext };
}

// ---------------------------------------------------------------------------
// Modèle de marché (§5.2)
// ---------------------------------------------------------------------------
function att(sid: SectorId, q: number, b: number, rep: number, price: number, green = 1): number {
  return productAttractiveness(sid, q, b, rep, price, green);
}
const brandNext = (sid: SectorId, b: number, m: number) => brandAfter(sid, b, m);
const qualNext = (sid: SectorId, q: number, r: number) => qualityAfter(sid, q, r);
const outsideAtt = (sid: SectorId, tau: number) => outsideAttractiveness(sid, tau);

/** Demande prévue du secteur à la résolution tau = turn + k. */
function demandForecast(v: PlayerView, sid: SectorId, k: number, d: Decoded, myLobby: number): number {
  const s = sectorOf(v, sid);
  const def = SECTORS[sid];
  const tau = v.turn + k;
  const dm = Math.pow(Math.max(s.demandMultiplier, 1e-3), Math.pow(0.85, k + 1));
  let D = def.refDemand * dm * Math.pow(1 + def.growth, tau - 1);
  if (k === 0 && s.lastTotalDemand > 0 && v.turn >= 2) {
    // effets encore actifs au tour dernier (news, lobbying des autres) : on les suppose reconduits une fois
    const model = def.refDemand * s.demandMultiplier * Math.pow(1 + def.growth, v.turn - 2) * (s.lastMarketPriceMultiplier ?? 1);
    D *= clamp(s.lastTotalDemand / model, 0.6, 1.6);
  }
  D *= newsDemandMult(d, sid, k);
  if (k < 2) D *= myLobby;
  return D;
}

interface Rivals { a: number; aPrice: number }

interface Own {
  c: CompanyView;
  p: ProductView;
  q: number; // qualité après la mise à jour de ce trimestre
  b: number; // notoriété après la mise à jour
  rep: number;
  green: number;
  cap: number;
  stock: number;
  uc: number; // coût unitaire marginal estimé
  price: number;
  floor: number; // prix plancher (× réf)
}

/** Profit (avant impôt, hors fixes et budgets) de mes produits d'un secteur, pour des prix donnés. */
function sectorOutcome(D: number, outside: number, others: Rivals, own: Own[], prices: number[], safety: number) {
  // All own lines are jointly replanned; installed idle lines may restart under these candidate prices.
  const atts = own.map((o, i) => att(o.p.sectorId, o.q, o.b, o.rep, prices[i], o.green));
  const total = outside + others.a + atts.reduce((a, b) => a + b, 0);
  const sid = own[0].p.sectorId;
  const priceMass = outside * SECTORS[sid].refPrice + others.aPrice + atts.reduce((sum, a, i) => sum + a * prices[i], 0);
  const response = marketDemandMultiplier(sid, total, priceMass);
  let profit = 0;
  const res = own.map((o, i) => {
    const dem = (D * atts[i]) / total * response;
    const sold = Math.min(dem, o.cap + o.stock);
    const prod = clamp(dem * safety - o.stock, 0, o.cap);
    const pr = prices[i] * sold - o.uc * prod;
    profit += pr;
    return { dem, sold, prod, profit: pr };
  });
  return { profit, res };
}

/** Prix/production optimaux, joints sur mes produits d'un même secteur (descente par coordonnées). */
function optimizeSector(D: number, outside: number, others: Rivals, own: Own[], safety: number) {
  const ref = SECTORS[own[0].p.sectorId].refPrice;
  const prices = own.map((o) => Math.max(o.price, o.floor * ref));
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < own.length; i++) {
      let best = -Infinity;
      let bestP = prices[i];
      for (let m = Math.max(PRICE_MIN_RATIO, own[i].floor); m <= PRICE_MAX_RATIO + 1e-9; m += 0.02) {
        const trial = prices.slice();
        trial[i] = ref * m;
        const r = sectorOutcome(D, outside, others, own, trial, safety).profit;
        if (r > best) {
          best = r;
          bestP = ref * m;
        }
      }
      // affinage
      for (let m = bestP / ref - 0.02; m <= bestP / ref + 0.02; m += 0.004) {
        if (m < Math.max(PRICE_MIN_RATIO, own[i].floor) || m > PRICE_MAX_RATIO) continue;
        const trial = prices.slice();
        trial[i] = ref * m;
        const r = sectorOutcome(D, outside, others, own, trial, safety).profit;
        if (r > best) {
          best = r;
          bestP = ref * m;
        }
      }
      prices[i] = bestP;
    }
  }
  return { prices, ...sectorOutcome(D, outside, others, own, prices, safety) };
}

function othersAttIn(v: PlayerView, sid: SectorId, excludeCompanyIds: Set<string>): Rivals {
  let s = 0, aPrice = 0;
  for (const c of activeCompanies(v)) {
    if (excludeCompanyIds.has(c.id)) continue;
    for (const p of c.products) if (p.sectorId === sid && hasKnownSupply(p)) {
      const a = att(sid, p.quality, p.brand, c.reputation, p.price);
      s += a;
      aPrice += a * p.price;
    }
  }
  return { a: s, aPrice };
}

function hasMod(c: CompanyView, kind: string): boolean {
  return !!c.private?.modifiers.some((m) => m.kind === kind && m.turnsLeft > 0);
}
function lobbyMult(v: PlayerView, sid: SectorId): number {
  let m = 1;
  for (const c of myCompanies(v)) for (const md of c.private?.modifiers ?? []) if (md.kind === 'lobbying' && md.sectorId === sid && md.turnsLeft > 0) m *= md.value ?? 1.15;
  return m;
}

/** Coût unitaire marginal estimé d'un produit : main-d'œuvre effective + matières (stock au coût moyen, sinon spot × 1,1). */
function unitCost(v: PlayerView, c: CompanyView, p: ProductView): number {
  if (p.private && p.private.estimatedUnitCost > 0) return p.private.estimatedUnitCost;
  const def = SECTORS[p.sectorId];
  let uc = def.laborCost * (hasMod(c, 'offshoring') ? 0.7 : 1);
  for (const [cid, per] of Object.entries(def.inputs) as [CommodityId, number][]) {
    uc += per * (v.commodities.find((x) => x.id === cid)?.price ?? COMMODITIES[cid].basePrice) * EMERGENCY;
  }
  return uc;
}

// ---------------------------------------------------------------------------
// Opérations : production, budgets, capacité, matières, trésorerie
// ---------------------------------------------------------------------------
export interface OpsCfg {
  level: 'basic' | 'full';
  /** Marketing imposé (part de la taille du marché) ; sinon planifié (full) ou conservé (basic). */
  marketingRange?: [number, number];
  rndRange?: [number, number];
  priceFloor?: number; // × prix de référence
  capacity?: boolean;
  launches?: boolean;
  maxLaunchSectors?: number;
  commodities?: boolean;
  /** Levier maximal de l'entreprise (dette / book) pour financer la capacité. */
  maxDebtToBook?: number;
  memorizeFakes?: boolean;
}

const MK_GRID = [0, 0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.045, 0.06, 0.08, 0.1];
const RD_GRID = [0, 0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.045, 0.06];

/**
 * Simule un produit sur H trimestres avec budgets constants, concurrence figée (qui progresse un peu),
 * prix optimisé à chaque pas. Renvoie la valeur finale pondérée.
 */
function simulateProduct(
  v: PlayerView,
  sid: SectorId,
  start: { q: number; b: number; rep: number; cap: number; uc: number; floor: number },
  others: Rivals,
  d: Decoded,
  lobby: number,
  mk: number,
  rd: number,
  capPath: (k: number) => number,
): number {
  const H = turnsLeft(v);
  const def = SECTORS[sid];
  let q = start.q;
  let b = start.b;
  let val = 0;
  for (let k = 0; k < H; k++) {
    const tau = v.turn + k;
    b = brandNext(sid, b, mk);
    q = qualNext(sid, q, rd);
    const D = demandForecast(v, sid, k, d, lobby);
    const oth = { a: others.a * Math.pow(1.03, k), aPrice: others.aPrice * Math.pow(1.03, k) };
    const own: Own = { c: null as any, p: { sectorId: sid } as any, q, b, rep: start.rep, green: 1, cap: capPath(k), stock: 0, uc: start.uc, price: def.refPrice, floor: start.floor };
    // prix optimal (grille grossière pour la vitesse)
    let best = -Infinity;
    for (let m = Math.max(PRICE_MIN_RATIO, start.floor); m <= PRICE_MAX_RATIO + 1e-9; m += 0.04) {
      const r = sectorOutcome(D, outsideAtt(sid, tau), oth, [own], [def.refPrice * m], 1).profit;
      if (r > best) best = r;
    }
    const pi = best - mk - rd - def.fixedCost;
    val += profitWeight(v, tau) * pi;
  }
  return val;
}

function planSpend(v: PlayerView, c: CompanyView, p: ProductView, cfg: OpsCfg, d: Decoded, others: Rivals) {
  const sid = p.sectorId;
  const M = mSize(sid);
  const start = { q: p.quality, b: p.brand, rep: c.reputation, cap: p.capacity + (p.private?.pendingCapacity ?? 0), uc: unitCost(v, c, p), floor: cfg.priceFloor ?? 0 };
  const lobby = lobbyMult(v, sid);
  const mkGrid = MK_GRID.filter((x) => !cfg.marketingRange || (x >= cfg.marketingRange[0] && x <= cfg.marketingRange[1]));
  const rdGrid = RD_GRID.filter((x) => !cfg.rndRange || (x >= cfg.rndRange[0] && x <= cfg.rndRange[1]));
  const cap0 = p.capacity;
  const capNow = (k: number) => (k === 0 ? cap0 : start.cap);
  let best = { val: -Infinity, mk: 0, rd: 0 };
  for (const mk of mkGrid)
    for (const rd of rdGrid) {
      const val = simulateProduct(v, sid, start, others, d, lobby, mk * M, rd * M, capNow);
      if (val > best.val) best = { val, mk: mk * M, rd: rd * M };
    }
  // capacité (livrée au tour suivant) : coût payé tout de suite, la moitié reste au bilan
  let capAdd = 0;
  if (cfg.capacity && !isLastTurn(v) && turnsLeft(v) >= 3) {
    const def = SECTORS[sid];
    let bestGain = 0;
    for (const f of [0.1, 0.2, 0.35, 0.5, 0.75, 1]) {
      const add = Math.round(start.cap * f);
      if (add < 1) continue;
      const val = simulateProduct(v, sid, start, others, d, lobby, best.mk, best.rd, (k) => (k === 0 ? cap0 : start.cap + add));
      const gain = val - best.val - 0.5 * add * def.capacityCost;
      if (gain > bestGain * 1.05 + 0.02 * add * def.capacityCost) {
        bestGain = gain;
        capAdd = add;
      }
    }
  }
  return { mk: best.mk, rd: best.rd, capAdd, val: best.val };
}

/** Gère une entreprise contrôlée. Renvoie les dépenses prévues à la résolution (pour la trésorerie). */
export function runOps(v0: PlayerView, api: StrategyApi, cid: string, cfg: OpsCfg): void {
  let v = api.view();
  let c = v.companies.find((x) => x.id === cid);
  if (!c || c.status !== 'active' || c.controllerId !== v.you) return;
  const d = decodeIssue(v, !!cfg.memorizeFakes);
  const last = isLastTurn(v);

  // 1. budgets marketing / R&D (+ capacité)
  const spend = new Map<string, { mk: number; rd: number }>();
  const capOrders: { pid: string; lots: number; cost: number; gain: number }[] = [];
  for (const p of c.products) {
    const M = mSize(p.sectorId);
    let mk = p.private?.marketing ?? 0.015 * M;
    let rd = p.private?.rnd ?? 0.01 * M;
    if (cfg.level === 'full') {
      const others = othersAttIn(v, p.sectorId, new Set([c.id]));
      const plan = planSpend(v, c, p, cfg, d, others);
      mk = plan.mk;
      rd = plan.rd;
      if (plan.capAdd > 0) capOrders.push({ pid: p.id, lots: plan.capAdd, cost: plan.capAdd * SECTORS[p.sectorId].capacityCost, gain: plan.val });
    } else {
      if (cfg.marketingRange) mk = clamp(mk, cfg.marketingRange[0] * M, cfg.marketingRange[1] * M);
      if (cfg.rndRange) rd = clamp(rd, cfg.rndRange[0] * M, cfg.rndRange[1] * M);
      if (last) {
        // dernier trimestre : la R&D n'a plus d'effet que sur les ventes du trimestre (très faible)
        rd = 0;
        mk = Math.min(mk, 0.005 * M);
      }
    }
    spend.set(p.id, { mk, rd });
  }

  // 2. prix / production : optimisation jointe par secteur sur tous MES produits (toutes entreprises)
  const mine = myCompanies(v);
  const mineIds = new Set(mine.map((x) => x.id));
  const bySector = new Map<SectorId, Own[]>();
  for (const mc of mine) {
    for (const p of mc.products) {
      const sp = mc.id === c.id ? spend.get(p.id)! : { mk: p.private?.marketing ?? 0, rd: p.private?.rnd ?? 0 };
      const green = hasMod(mc, 'greenwashing') ? 1.3 : 1;
      const o: Own = {
        c: mc,
        p,
        q: qualNext(p.sectorId, p.quality, sp.rd),
        b: brandNext(p.sectorId, p.brand, sp.mk),
        rep: mc.reputation,
        green,
        cap: p.capacity,
        stock: (p.private?.stock ?? 0),
        uc: unitCost(v, mc, p),
        price: p.price,
        floor: mc.id === c.id ? cfg.priceFloor ?? 0 : 0,
      };
      if (!bySector.has(p.sectorId)) bySector.set(p.sectorId, []);
      bySector.get(p.sectorId)!.push(o);
    }
  }
  for (const [sid, own] of bySector) {
    if (!own.some((o) => o.c.id === c!.id)) continue;
    const D = demandForecast(v, sid, 0, d, lobbyMult(v, sid));
    const others = othersAttIn(v, sid, mineIds);
    const vol = SECTORS[sid].volatility;
    const opt = optimizeSector(D, outsideAtt(sid, v.turn), others, own, 1 + vol * 0.5);
    own.forEach((o, i) => {
      if (o.c.id !== c!.id) return;
      const sp = spend.get(o.p.id)!;
      let production = Math.round(opt.res[i].prod);
      // produire à perte ne sert à rien
      if (opt.prices[i] < o.uc * 1.0) production = Math.round(production * 0.5);
      api.act({
        type: 'setProductDecisions',
        companyId: c!.id,
        productId: o.p.id,
        price: Math.round(opt.prices[i] * 100) / 100,
        production,
        marketing: Math.round(sp.mk),
        rnd: Math.round(sp.rd),
      });
    });
  }

  v = api.view();
  c = v.companies.find((x) => x.id === cid)!;

  // 3. capacité (le plus rentable d'abord), financée par emprunt si besoin
  if (cfg.capacity && capOrders.length) {
    capOrders.sort((a, b) => b.gain / b.cost - a.gain / a.cost);
    for (const o of capOrders) {
      v = api.view();
      c = v.companies.find((x) => x.id === cid)!;
      const need = o.cost + reserveOf(c) + plannedOutflow(v, c) - c.cash;
      if (need > 0) {
        const book = Math.max(bookEstimate(c), 1000);
        const room = Math.min(c.private!.loanLimit, (cfg.maxDebtToBook ?? 0.6) * book - c.debt);
        if (room >= need) api.act({ type: 'takeLoan', companyId: cid, amount: Math.ceil(need) });
        else continue;
      }
      api.act({ type: 'expandCapacity', companyId: cid, productId: o.pid, lots: o.lots });
    }
  }

  // 4. lancements de produits (full) : simulation d'un produit neuf dans chaque secteur absent
  if (cfg.launches && !last && turnsLeft(v) >= 4) {
    v = api.view();
    c = v.companies.find((x) => x.id === cid)!;
    const present = new Set(mine.flatMap((x) => x.products.map((p) => p.sectorId)));
    const launched = c.products.filter((p) => p.launchedTurn > 0).length;
    if (c.products.length < (c.maxProducts ?? 4) && launched < (cfg.maxLaunchSectors ?? 3)) {
      let best: { sid: SectorId; val: number } | null = null;
      for (const sid of SECTOR_IDS) {
        if (present.has(sid)) continue;
        const def = SECTORS[sid];
        const M = mSize(sid);
        const uc = def.laborCost + Object.entries(def.inputs).reduce((s, [cm, per]) => s + (per as number) * (v.commodities.find((x) => x.id === cm)?.price ?? 0) * EMERGENCY, 0);
        const others = othersAttIn(v, sid, new Set());
        const start = { q: 1, b: 0.3, rep: c.reputation, cap: def.startingCapacity, uc, floor: 0 };
        let bestV = -Infinity;
        for (const mk of [0.005, 0.015, 0.03]) for (const rd of [0.005, 0.01, 0.02]) {
          const val = simulateProduct(v, sid, start, others, d, 1, mk * M, rd * M, () => def.startingCapacity);
          if (val > bestV) bestV = val;
        }
        const net = bestV - def.launchCost;
        if (net > 0.25 * def.launchCost && (!best || net > best.val)) best = { sid, val: net };
      }
      if (best) {
        const def = SECTORS[best.sid];
        if (c.cash - def.launchCost - plannedOutflow(v, c) > reserveOf(c)) {
          api.act({ type: 'launchProduct', companyId: cid, sectorId: best.sid, name: `${def.name.split(' ')[0]} ${v.turn}` });
        }
      }
    }
  }

  // 5. matières premières
  if (cfg.commodities !== false) buyInputs(api, cid, d);

  // 6. trésorerie
  treasury(api, cid);
}

function bookEstimate(c: CompanyView): number {
  let b = c.cash - c.debt;
  for (const p of c.products) {
    b += 0.5 * (p.capacity + (p.private?.pendingCapacity ?? 0)) * SECTORS[p.sectorId].capacityCost;
    b += (p.private?.stock ?? 0) * (p.private?.lastUnitCost ?? 0);
  }
  for (const line of Object.values(c.private?.inventory ?? {})) if (line) b += line.lots * line.avgCost;
  return b;
}

/** Sorties de trésorerie prévues à la résolution : budgets + production (matières hors stock) + fixes + intérêts. */
function plannedOutflow(v: PlayerView, c: CompanyView): number {
  let out = fixedOf(c) + c.debt * v.interestRate * 1.5;
  for (const p of c.products) {
    const pr = p.private;
    if (!pr) continue;
    out += pr.marketing + pr.rnd + Math.min(pr.production, p.capacity) * unitCost(v, c, p);
  }
  return out;
}

function buyInputs(api: StrategyApi, cid: string, d: Decoded): void {
  const v = api.view();
  const c = v.companies.find((x) => x.id === cid);
  if (!c?.private) return;
  const need = new Map<CommodityId, number>();
  for (const p of c.products) {
    const prod = Math.min(p.private?.production ?? 0, p.capacity);
    for (const [cm, per] of Object.entries(SECTORS[p.sectorId].inputs) as [CommodityId, number][]) need.set(cm, (need.get(cm) ?? 0) + prod * per);
  }
  for (const [cm, n0] of need) {
    const def = COMMODITIES[cm];
    const spot = v.commodities.find((x) => x.id === cm)!.price;
    const { supplyNow, jumpNext } = commodityOutlook(d, cm);
    const eq = def.basePrice * supplyNow;
    // prix attendu à la résolution (retour à l'équilibre) ; achat d'urgence = × 1,1
    const expSpot = spot * Math.pow(eq / spot, def.meanReversion);
    const have = c.private.inventory[cm]?.lots ?? 0;
    // besoin de ce tour, plus une avance pour le tour prochain si une hausse est attendue
    const ahead = jumpNext > 1.05 && !isLastTurn(v) ? n0 : 0;
    const want = Math.floor(n0 + ahead - have);
    if (want < 1) continue;
    // on achète tant que le prix moyen reste sous l'achat d'urgence (coût moyen = spot × (1 + n/2L))
    const breakEven = EMERGENCY * Math.max(expSpot, ahead ? spot * jumpNext : 0) / spot - 1;
    const nMax = Math.floor(2 * def.liquidity * breakEven * 0.6);
    const n = Math.min(want, nMax, def.liquidity);
    if (n < 1) continue;
    const cost = spot * (1 + n / (2 * def.liquidity)) * n;
    if (c.cash - cost < reserveOf(c) * 0.5) continue;
    api.act({ type: 'buyCommodity', companyId: cid, commodityId: cm, lots: n });
  }
}

function treasury(api: StrategyApi, cid: string): void {
  const v = api.view();
  const c = v.companies.find((x) => x.id === cid);
  if (!c?.private) return;
  const need = plannedOutflow(v, c) + reserveOf(c) * 0.5;
  // recettes du trimestre : on compte grossièrement 80 % du CA du trimestre dernier
  const inflow = 0.8 * (c.reports[c.reports.length - 1]?.revenue ?? 0);
  const gap = need - inflow - c.cash;
  if (gap > 50 && c.private.loanLimit > 50) api.act({ type: 'takeLoan', companyId: cid, amount: Math.ceil(Math.min(gap, c.private.loanLimit)) });
  else if (c.debt > 0) {
    const spare = c.cash + inflow - need - reserveOf(c);
    if (spare > 100) api.act({ type: 'repayLoan', companyId: cid, amount: Math.floor(Math.min(spare, c.debt)) });
  }
}

// ---------------------------------------------------------------------------
// Finance perso : devis, cible de cours, défense
// ---------------------------------------------------------------------------
const buyCost = (c: CompanyView, n: number) => n * c.sharePrice * (1 + n / (2 * c.sharesOutstanding));
const sellGain = (c: CompanyView, n: number) => n * c.sharePrice * Math.max(0, 1 - n / (2 * c.sharesOutstanding));
function sharesFor(c: CompanyView, budget: number): number {
  // n × p × (1 + n/2S) = budget
  const p = c.sharePrice;
  const S = c.sharesOutstanding;
  if (!(p > 0) || budget <= 0) return 0;
  const a = p / (2 * S);
  return Math.floor((-p + Math.sqrt(p * p + 4 * a * budget)) / (2 * a));
}
const held = (v: PlayerView, c: CompanyView) => c.holdings[v.you] ?? 0;

function currentPi(r: QuarterReport, fallbackTax: number): number {
  const pretax = r.netProfit + r.tax;
  const courant = pretax + r.fines;
  const rate = pretax > 1 ? r.tax / pretax : fallbackTax;
  return courant - Math.max(0, courant) * rate;
}

/**
 * Estimation publique de la cible de cours (§6.1) : maintenant et à la prochaine résolution.
 * profitEma reconstruit par récurrence depuis les rapports, point de départ calé sur le cours initial.
 */
export function valuation(v: PlayerView, c: CompanyView, memory: any): { now: number; next: number; nextPrice: number } {
  const S = Math.max(c.sharesOutstanding, 1);
  let capBook = 0;
  for (const p of c.products) capBook += 0.5 * (p.capacity + (p.private?.pendingCapacity ?? 0)) * SECTORS[p.sectorId].capacityCost;
  const book = c.private ? bookEstimate(c) : c.cash - c.debt + capBook;
  const reps = c.reports;
  // profitEma initial : cours d'introduction = (book0 + 40 ema0) / S (start-up : ema0 = 0)
  let ema = 0;
  const startup = c.founderId !== null && (memory.startIds ? !memory.startIds.has(c.id) : false);
  if (!startup && c.priceHistory.length) {
    const cash0 = reps.length ? reps[0].cashEnd - reps[0].netProfit : c.cash;
    ema = Math.max(0, (c.priceHistory[0] * 10000 - (cash0 + capBook)) / PE);
  }
  for (let i = 0; i < reps.length; i++) ema = EMA_KEEP * ema + (1 - EMA_KEEP) * currentPi(reps[i], v.taxRate);
  const growthOf = (revs: number[]) => {
    if (revs.length < 2) return 0;
    let e = revs[0];
    const series = [e];
    for (let i = 1; i < revs.length; i++) {
      e = 0.6 * e + 0.4 * revs[i];
      series.push(e);
    }
    return clamp(series[series.length - 1] / Math.max(series[Math.max(0, series.length - 5)], 1) - 1, -0.3, 0.5);
  };
  const revs = reps.map((r) => r.revenue);
  const fund = (bk: number, em: number, g: number) => {
    const netCash = Math.max(0, c.cash - c.debt);
    const floor = netCash + 0.3 * Math.max(0, bk - netCash) + 500;
    return Math.max(floor, bk + (em >= 0 ? PE * em : 8 * em)) * (1 + 0.5 * g);
  };
  const base = (fund(book, ema, growthOf(revs)) / S) * v.marketSentiment;
  // sentiment propre implicite : cible déduite du dernier cours de résolution et du cours d'avant résolution
  let sent = 1;
  const pre = memory.prePrice?.[v.turn - 1]?.[c.id];
  const ph = c.priceHistory;
  if (pre && ph.length >= 2 && base > 0) {
    const implied = 2 * ph[ph.length - 1] - pre;
    sent = clamp(1 + 0.5 * (implied / base - 1), 0.6, 1.5); // rétréci (bruit 3 %)
  }
  // news de ce tour visant cette entreprise (sentiment déjà appliqué au cours)
  const d = decodeIssue(v, false);
  for (const n of d.news)
    for (const e of n.effects) if (e.type === 'companySentiment' && n.companyIds.length === 1 && n.companyIds[0] === c.id) sent *= e.multiplier;
  const now = base * sent;
  // prochaine résolution
  const lastPi = reps.length ? currentPi(reps[reps.length - 1], v.taxRate) : ema;
  const piNext = reps.length >= 2 ? 0.6 * lastPi + 0.4 * currentPi(reps[reps.length - 2], v.taxRate) : lastPi;
  const emaNext = isLastTurn(v) ? ema : EMA_KEEP * ema + (1 - EMA_KEEP) * piNext;
  const lastRev = revs.length ? revs[revs.length - 1] : 0;
  const bookNext = book + piNext;
  const mS = 1 + (v.marketSentiment - 1) * 0.7;
  const sentNext = 1 + (sent - 1) * 0.7;
  const next = (fund(bookNext, emaNext, growthOf([...revs, lastRev])) / S) * mS * sentNext;
  const nextPrice = isLastTurn(v) ? next : 0.5 * c.sharePrice + 0.5 * next;
  return { now, next, nextPrice };
}

/** À appeler en fin de act : mémorise les cours d'avant résolution (pour la cible implicite). */
function snapshot(api: StrategyApi, memory: any): void {
  const v = api.view();
  memory.prePrice ??= {};
  memory.prePrice[v.turn] = Object.fromEntries(v.companies.map((c) => [c.id, c.sharePrice]));
  if (!memory.startIds) memory.startIds = new Set(v.companies.filter((c) => c.priceHistory.length > 0 && v.turn === 1).map((c) => c.id));
}

function initMemory(v: PlayerView, memory: any): void {
  if (!memory.startIds) memory.startIds = new Set(v.companies.map((c) => c.id));
}

/** Défense anti-OPA : rachat, achat perso (avec levier), pilule empoisonnée. */
function defend(api: StrategyApi, cid: string, opts: { trigger: number; leverage: number }): void {
  let v = api.view();
  let c = v.companies.find((x) => x.id === cid);
  if (!c?.private || c.controllerId !== v.you) return;
  let threat = 0;
  for (const [pid, h] of Object.entries(c.holdings)) if (pid !== v.you && h > threat) threat = h;
  const S = c.sharesOutstanding;
  if (threat < opts.trigger * S) return;
  const mine = held(v, c);
  if (mine > S / 2 + 1 && mine > threat) return;
  // 1. achat perso pour passer au-dessus de 50 %
  const need = Math.floor(S / 2) + 1 - mine;
  if (need > 0) {
    const pl = v.personalLoanLimit * opts.leverage;
    if (buyCost(c, need) > me(v).cash - 50 && pl > 50) api.act({ type: 'takePersonalLoan', amount: Math.floor(Math.min(pl, buyCost(c, need) - me(v).cash + 100)) });
    v = api.view();
    c = v.companies.find((x) => x.id === cid)!;
    const n = Math.min(need, c.floatShares, sharesFor(c, me(v).cash - 20));
    if (n >= 1) api.act({ type: 'buyShares', companyId: cid, shares: n });
  }
  v = api.view();
  c = v.companies.find((x) => x.id === cid)!;
  if (held(v, c) > c.sharesOutstanding / 2) return;
  // 2. rachat d'actions par l'entreprise (sans jamais pousser le raider au-dessus de 50 %)
  if (!c.private!.turnFlags.buybackDone) {
    const budget = Math.max(0, c.cash - reserveOf(c) - plannedOutflow(v, c)) * 0.8;
    const n = Math.min(c.floatShares, sharesFor(c, budget), Math.floor(c.sharesOutstanding - 2 * threat - 1));
    if (n >= 1) api.act({ type: 'buyback', companyId: cid, shares: n });
  }
  v = api.view();
  c = v.companies.find((x) => x.id === cid)!;
  // 3. pilule empoisonnée
  if (held(v, c) <= c.sharesOutstanding / 2 && !hasMod(c, 'poison_pill_cooldown')) {
    const cost = Math.round(0.4 * c.sharesOutstanding) * 0.5 * c.sharePrice;
    if (cost <= me(v).cash) api.act({ type: 'poisonPill', companyId: cid });
  }
}

/** Garde la jauge de scandale sous `target` (probabilité d'éclatement nulle sous 20). */
function manageScandal(api: StrategyApi, cid: string, target: number): void {
  for (let i = 0; i < 6; i++) {
    const v = api.view();
    const c = v.companies.find((x) => x.id === cid);
    if (!c?.private) return;
    if (c.private.scandal <= target || c.cash < CRISIS_COST + 200 || c.private.turnFlags.crisisDone) return;
    if (!api.act({ type: 'crisisComms', companyId: cid }).ok) return; // lot 1 : une seule par tour
  }
}

/** Rembourse le prêt perso si le ratio d'endettement dépasse `maxLtv`. */
function deleverage(api: StrategyApi, maxLtv: number): void {
  const v = api.view();
  const p = me(v);
  if (p.debt <= 0) return;
  if (p.debt > maxLtv * Math.max(p.portfolioValue, 1) || isLastTurn(v)) {
    const amt = Math.min(p.debt, p.cash - 10);
    if (amt > 10) api.act({ type: 'repayPersonalLoan', amount: Math.floor(amt) });
  }
}

/** Refonde une entreprise si l'on n'en contrôle plus aucune (après une OPA subie). */
function restartIfOrphan(api: StrategyApi, sector: SectorId): void {
  const v = api.view();
  if (myCompanies(v).length > 0 || v.turn < 2 || turnsLeft(v) < 4) return;
  const cash = me(v).cash;
  if (cash < 1500) return;
  api.act({ type: 'foundStartup', name: `Phoenix ${v.turn}`, sectorId: sector, investment: Math.floor(Math.min(cash * 0.7, 8000)) });
}

function mainSector(v: PlayerView): SectorId {
  const c = myCompanies(v)[0];
  return c?.products[0]?.sectorId ?? 'energy_drinks';
}

// ---------------------------------------------------------------------------
// 1. INDUSTRIALIST : production, capacité, R&D, parts de marché ; aucune spéculation
// ---------------------------------------------------------------------------
export const industrialist: Strategy = {
  name: 'industrialist',
  tier: 'specialist',
  act(view, api, ctx) {
    initMemory(view, ctx.memory);
    ctx.memory.sector ??= mainSector(view);
    for (const c of myCompanies(api.view())) {
      runOps(view, api, c.id, { level: 'full', capacity: true, launches: true, maxLaunchSectors: 3, maxDebtToBook: 0.6 });
      defend(api, c.id, { trigger: 0.3, leverage: 0.5 });
    }
    restartIfOrphan(api, ctx.memory.sector);
    snapshot(api, ctx.memory);
  },
};

// ---------------------------------------------------------------------------
// 2. MARKETER : marketing massif, prix premium
// ---------------------------------------------------------------------------
export const marketer: Strategy = {
  name: 'marketer',
  tier: 'specialist',
  act(view, api, ctx) {
    initMemory(view, ctx.memory);
    ctx.memory.sector ??= mainSector(view);
    for (const c of myCompanies(api.view())) {
      runOps(view, api, c.id, {
        level: 'full',
        marketingRange: [0.03, 0.1],
        rndRange: [0.005, 0.015],
        priceFloor: 1.1,
        capacity: true,
        launches: true,
        maxLaunchSectors: 2,
        maxDebtToBook: 0.5,
      });
      defend(api, c.id, { trigger: 0.3, leverage: 0.5 });
    }
    restartIfOrphan(api, ctx.memory.sector);
    snapshot(api, ctx.memory);
  },
};

// ---------------------------------------------------------------------------
// 3. TURTLE : contrôle verrouillé (> 50 %), trésorerie, dividendes, jamais d'attaque
// ---------------------------------------------------------------------------
export const turtle: Strategy = {
  name: 'turtle',
  tier: 'specialist',
  act(view, api, ctx) {
    initMemory(view, ctx.memory);
    ctx.memory.sector ??= mainSector(view);
    let v = api.view();
    for (const c0 of myCompanies(v)) {
      runOps(view, api, c0.id, { level: 'basic', capacity: false, launches: false });
      v = api.view();
      const c = v.companies.find((x) => x.id === c0.id)!;
      // verrouiller le contrôle : passer à 50 % + 1 dès que possible, sans levier
      const need = Math.floor(c.sharesOutstanding / 2) + 1 - held(v, c);
      if (need > 0) {
        const n = Math.min(need, c.floatShares, sharesFor(c, me(v).cash - 50));
        if (n >= 1) api.act({ type: 'buyShares', companyId: c.id, shares: n });
      }
      defend(api, c.id, { trigger: 0.2, leverage: 0.3 });
      // dividende : l'excédent de trésorerie au-delà de 3 × la réserve + dépenses prévues
      v = api.view();
      const cc = v.companies.find((x) => x.id === c0.id)!;
      if (cc.private && v.turn >= 2 && cc.debt <= 0) {
        const excess = cc.cash - 3 * reserveOf(cc) - plannedOutflow(v, cc) - (cc.private.turnFlags.borrowed ?? 0);
        const lastProfit = cc.reports[cc.reports.length - 1]?.netProfit ?? 0;
        const amount = Math.min(excess, Math.max(lastProfit, 0) * 1.0);
        if (amount > 200) api.act({ type: 'payDividend', companyId: cc.id, amount: Math.floor(amount) });
      }
    }
    // cash perso : racheter ses propres actions si elles sont sous-évaluées, sinon rembourser
    v = api.view();
    for (const c of myCompanies(v)) {
      const val = valuation(v, c, ctx.memory);
      if (val.nextPrice > c.sharePrice * 1.04 && me(v).cash > 300) {
        const n = Math.min(c.floatShares, sharesFor(c, me(v).cash - 100), Math.floor(c.sharesOutstanding * (val.nextPrice / c.sharePrice - 1)));
        if (n >= 1) api.act({ type: 'buyShares', companyId: c.id, shares: n });
      }
    }
    deleverage(api, 0);
    restartIfOrphan(api, ctx.memory.sector);
    snapshot(api, ctx.memory);
  },
};

// ---------------------------------------------------------------------------
// 4. SHADY : actions discutables au maximum, jauge tenue par la communication de crise
// ---------------------------------------------------------------------------

/**
 * Bénéfice opérationnel du trimestre (avant fixes/budgets) de l'entreprise `cid`, prix réoptimisés,
 * sous des hypothèses modifiées : attractivité (greenwashing), demande (lobbying), main-d'œuvre
 * (délocalisation), réputation.
 */
function quarterProfit(v: PlayerView, cid: string, mods: { green?: number; demand?: number; demandSector?: SectorId; labor?: number; rep?: number }): number {
  const c = v.companies.find((x) => x.id === cid);
  if (!c) return 0;
  const d = decodeIssue(v, false);
  const mine = myCompanies(v);
  const mineIds = new Set(mine.map((x) => x.id));
  let total = 0;
  const sectors = new Set(c.products.map((p) => p.sectorId));
  for (const sid of sectors) {
    const own: Own[] = [];
    for (const mc of mine)
      for (const p of mc.products) {
        if (p.sectorId !== sid) continue;
        const isC = mc.id === cid;
        const labor = SECTORS[sid].laborCost * (hasMod(mc, 'offshoring') ? 0.7 : 1);
        const uc = unitCost(v, mc, p) - (isC && mods.labor !== undefined ? labor * (1 - mods.labor) : 0);
        own.push({
          c: mc,
          p,
          q: qualNext(sid, p.quality, p.private?.rnd ?? 0),
          b: brandNext(sid, p.brand, p.private?.marketing ?? 0),
          rep: clamp(mc.reputation + (isC ? mods.rep ?? 0 : 0), 0.5, 1.3),
          green: (hasMod(mc, 'greenwashing') ? 1.3 : 1) * (isC ? mods.green ?? 1 : 1),
          cap: p.capacity,
          stock: p.private?.stock ?? 0,
          uc,
          price: p.price,
          floor: 0,
        });
      }
    let D = demandForecast(v, sid, 0, d, lobbyMult(v, sid));
    if (mods.demand && mods.demandSector === sid) D *= mods.demand;
    const opt = optimizeSector(D, outsideAtt(sid, v.turn), othersAttIn(v, sid, mineIds), own, 1);
    total += opt.res.reduce((s, r, i) => s + (own[i].c.id === cid ? r.profit : 0), 0);
  }
  return total;
}

/** Valeur (en k de trésorerie d'entreprise) d'un surcroît de bénéfice avant impôt `dpi` pendant `n` résolutions. */
function streamValue(v: PlayerView, dpi: number, n: number): number {
  let s = 0;
  for (let k = 0; k < n; k++) s += profitWeight(v, v.turn + k) * dpi;
  return s;
}

export function makeShady(opts: { name: string; bonusShare: number; gauge: number; stopBonusBefore: number; smearLastTurns: number }): Strategy {
  const COST: Record<string, number> = { lobbying: 1000, tax_optimisation: 300, greenwashing: 500, industrial_espionage: 1000, offshoring: 800, smear_campaign: 500 };
  const PTS: Record<string, number> = { lobbying: 10, tax_optimisation: 15, greenwashing: 10, industrial_espionage: 20, offshoring: 15, smear_campaign: 20 };
  const PT_COST = CRISIS_COST / 15; // lot 1 : un point de jauge effacé coûte ~27 k (−15 par com' de crise)
  return {
    name: opts.name,
    tier: 'specialist',
    act(view, api, ctx) {
      initMemory(view, ctx.memory);
      ctx.memory.sector ??= mainSector(view);
      ctx.memory.log ??= {};
      let v = api.view();
      for (const c0 of myCompanies(v)) {
        runOps(view, api, c0.id, { level: 'basic', capacity: false, launches: false });
        v = api.view();
        let c = v.companies.find((x) => x.id === c0.id)!;
        if (!c.private) continue;
        const own = held(v, c) / c.sharesOutstanding;
        const lastRep = c.reports[c.reports.length - 1];
        const base = quarterProfit(v, c.id, {});
        const flowIn = base - fixedOf(c) - c.products.reduce((s, p) => s + (p.private?.marketing ?? 0) + (p.private?.rnd ?? 0), 0);
        const spendable = () => {
          const cc = api.view().companies.find((x) => x.id === c0.id)!;
          return cc.cash + Math.min(flowIn, 0) - reserveOf(cc) - CRISIS_COST;
        };
        const options: { kind: string; gain: number; extra?: any }[] = [];
        const R = turnsLeft(v);
        // optimisation fiscale : impôt 5 % au lieu du taux courant sur le résultat du trimestre
        const pretaxEst = Math.max(0, flowIn - c.debt * v.interestRate);
        if (pretaxEst > 0) {
          const dnet = (v.taxRate - 0.05) * pretaxEst;
          const w = isLastTurn(v) ? 1 : 1 + PE * (1 - EMA_KEEP) * Math.pow(EMA_KEEP, lastTurn(v) - 1 - v.turn);
          options.push({ kind: 'tax_optimisation', gain: dnet * w });
        }
        // délocalisation : 3 tours de main-d'œuvre × 0,7, réputation −0,1 (réparée en partie par la comm' de crise)
        if (!hasMod(c, 'offshoring')) {
          const g = quarterProfit(v, c.id, { labor: 0.7 }) - base;
          const repLoss = base - quarterProfit(v, c.id, { labor: 0.7, rep: -0.1 }) - (base - quarterProfit(v, c.id, { labor: 0.7 }));
          options.push({ kind: 'offshoring', gain: streamValue(v, g, Math.min(3, R)) - streamValue(v, Math.max(0, -repLoss), Math.min(2, R)) });
        }
        // greenwashing : attractivité × 1,3 ce trimestre
        if (!hasMod(c, 'greenwashing')) options.push({ kind: 'greenwashing', gain: streamValue(v, quarterProfit(v, c.id, { green: 1.3 }) - base, 1) });
        // lobbying : demande × 1,15 pendant 2 tours dans mon plus gros secteur
        const main = [...c.products].sort((a, b) => b.lastRevenue - a.lastRevenue)[0];
        if (main) {
          const g = quarterProfit(v, c.id, { demand: 1.15, demandSector: main.sectorId }) - base;
          options.push({ kind: 'lobbying', gain: streamValue(v, g, Math.min(2, R)), extra: { sectorId: main.sectorId } });
        }
        // dénigrement : en fin de partie, sur la plus grosse ligne du rival le mieux classé (effet sur SON score)
        if (R <= opts.smearLastTurns) {
          const rivals = v.players.filter((p) => p.id !== v.you).sort((a, b) => b.netWorth - a.netWorth);
          const rival = rivals[0];
          if (rival && rival.netWorth > me(v).netWorth * 0.7) {
            const target = v.companies
              .filter((x) => x.status === 'active' && (x.holdings[rival.id] ?? 0) > 0 && x.id !== c.id)
              .sort((a, b) => (b.holdings[rival.id] ?? 0) * b.sharePrice - (a.holdings[rival.id] ?? 0) * a.sharePrice)[0];
            // valeur « de classement » : perte du rival, comptée comme un gain pour moi
            if (target) options.push({ kind: 'smear_campaign', gain: 0.15 * (target.holdings[rival.id] ?? 0) * target.sharePrice * (R === 1 ? 1 : 0.5) / Math.max(own, 0.2), extra: { targetCompanyId: target.id } });
          }
        }
        // coût total en trésorerie : prix + points de jauge à effacer
        options.sort((a, b) => b.gain - (COST[b.kind] + PTS[b.kind] * PT_COST) - (a.gain - (COST[a.kind] + PTS[a.kind] * PT_COST)));
        // lot 1 : actions discutables et com' de crise au compte de résultat (× poids du tour), budget de jauge
        const wPL = 1 + Math.max(0, profitWeight(v, v.turn) - 1) * 0.75;
        for (const o of options) {
          const cost = (COST[o.kind] + PTS[o.kind] * PT_COST) * wPL;
          const cc = api.view().companies.find((x) => x.id === c0.id)!;
          const crisis = cc.private && !cc.private.turnFlags.crisisDone ? 15 : 0;
          if ((cc.private?.scandal ?? 0) + PTS[o.kind] > opts.gauge + crisis) continue;
          if (o.gain <= cost * 1.1) continue;
          if (c.private.turnFlags.shadyDone.includes(o.kind as any)) continue;
          if (spendable() < cost) continue;
          const r = api.act({ type: 'shady', companyId: c.id, kind: o.kind as any, ...(o.extra ?? {}) });
          if (r.ok) ctx.memory.log[o.kind] = (ctx.memory.log[o.kind] ?? 0) + 1;
        }
        // re-tarifer avec les modificateurs posés (greenwashing, lobbying, délocalisation)
        runOps(view, api, c0.id, { level: 'basic', capacity: false, launches: false, commodities: false });
        // bonus du PDG : ponction sur le flottant (le sentiment ×0,97 par tranche compte au cours final)
        v = api.view();
        c = v.companies.find((x) => x.id === c0.id)!;
        if (c.private && !c.private.turnFlags.justFounded && R > opts.stopBonusBefore) {
          const amount = Math.floor(Math.min(c.private.maxBonus * opts.bonusShare, spendable()));
          if (amount > 50) api.act({ type: 'ceoBonus', companyId: c.id, amount });
        }
        manageScandal(api, c.id, opts.gauge);
        defend(api, c.id, { trigger: 0.3, leverage: 0.5 });
      }
      deleverage(api, 0);
      restartIfOrphan(api, ctx.memory.sector);
      snapshot(api, ctx.memory);
    },
  };
}
export const shady = makeShady({ name: 'shady', bonusShare: 1, gauge: 20, stopBonusBefore: 3, smearLastTurns: 1 });

// ---------------------------------------------------------------------------
// 5. SPECULATOR : bourse (cible de cours), matières sur rumeurs ; industrie minimale
// ---------------------------------------------------------------------------
export function makeSpeculator(opts: { name: string; memorizeFakes: boolean; leverage: number; threshold: number }): Strategy {
  return {
    name: opts.name,
    tier: 'specialist',
    act(view, api, ctx) {
      initMemory(view, ctx.memory);
      ctx.memory.sector ??= mainSector(view);
      let v = api.view();
      const d = decodeIssue(v, opts.memorizeFakes);
      for (const c0 of myCompanies(v)) {
        runOps(view, api, c0.id, { level: 'basic', capacity: false, launches: false, memorizeFakes: opts.memorizeFakes });
        // Matières : pari sur les rumeurs de hausse (achat maintenant, revente après le saut)
        v = api.view();
        const c = v.companies.find((x) => x.id === c0.id)!;
        if (c.private) {
          ctx.memory.bets ??= {};
          for (const cm of COMMODITY_IDS) {
            const def = COMMODITIES[cm];
            const spot = v.commodities.find((x) => x.id === cm)!.price;
            const inv = c.private.inventory[cm]?.lots ?? 0;
            const bet = ctx.memory.bets[cm] as { turn: number; lots: number } | undefined;
            // revente du pari au tour suivant (après publication de la news)
            if (bet && bet.turn < v.turn) {
              const { supplyNow } = commodityOutlook(d, cm);
              const keep = supplyNow > 1.05 && turnsLeft(v) > 1; // la pénurie continue : on garde un tour de plus
              if (!keep) {
                const need = c.products.reduce((s, p) => s + Math.min(p.private?.production ?? 0, p.capacity) * ((SECTORS[p.sectorId].inputs as any)[cm] ?? 0), 0);
                const n = Math.floor(Math.min(inv - need, bet.lots, def.liquidity));
                if (n >= 1) api.act({ type: 'sellCommodity', companyId: c.id, commodityId: cm, lots: n });
                delete ctx.memory.bets[cm];
              }
            }
            const { jumpNext } = commodityOutlook(d, cm);
            if (!ctx.memory.bets[cm] && jumpNext > 1.12 && turnsLeft(v) > 1) {
              // gain attendu ≈ (jump × 0,95 × (1 − n/2L)) − (1 + n/2L) ; n choisi pour garder ~60 % de l'avantage
              const edge = jumpNext * 0.95 - 1;
              const n = Math.floor(def.liquidity * edge * 0.5);
              const cost = spot * (1 + n / (2 * def.liquidity)) * n;
              if (n >= 5 && c.cash - cost > reserveOf(c) + plannedOutflow(v, c)) {
                const r = api.act({ type: 'buyCommodity', companyId: c.id, commodityId: cm, lots: n });
                if (r.ok) ctx.memory.bets[cm] = { turn: v.turn, lots: n };
              }
            }
          }
        }
        defend(api, c0.id, { trigger: 0.3, leverage: 0.5 });
      }

      // Bourse : vendre ce qui va baisser, acheter ce qui va monter (hors pertes de contrôle)
      v = api.view();
      const scored = activeCompanies(v)
        .filter((c) => c.sharePrice > 0.05)
        .map((c) => {
          const val = valuation(v, c, ctx.memory);
          let exp = val.nextPrice / c.sharePrice - 1;
          // scandale probable chez les autres : amende + sentiment × 0,75
          if (c.controllerId !== v.you && c.scandalLevel === 'élevé') exp -= 0.08;
          else if (c.controllerId !== v.you && c.scandalLevel === 'moyen') exp -= 0.02;
          return { c, exp };
        });
      // ventes
      for (const { c, exp } of scored) {
        const h = held(v, c);
        if (h <= 0) continue;
        const own = c.controllerId === v.you;
        const floor = own ? Math.floor(c.sharesOutstanding * 0.4) : 0; // ne jamais brader son propre contrôle
        const sellable = Math.max(0, h - floor - (c.private?.turnFlags.lockedShares?.[v.you] ?? 0));
        if (sellable < 1) continue;
        if (exp < -0.01 || (isLastTurn(v) && exp < 0)) {
          // vendre jusqu'à ce que l'impact mange l'écart
          const n = Math.min(sellable, Math.max(1, Math.floor(c.sharesOutstanding * Math.min(0.2, -exp * 2))));
          api.act({ type: 'sellShares', companyId: c.id, shares: n });
        }
      }
      // achats : meilleur rendement attendu d'abord
      v = api.view();
      const buys = scored.filter((s) => s.exp > opts.threshold).sort((a, b) => b.exp - a.exp);
      for (const { c: c1, exp } of buys) {
        v = api.view();
        const c = v.companies.find((x) => x.id === c1.id)!;
        const p = me(v);
        const pf = Math.max(p.portfolioValue, 1);
        const loanRoom = Math.max(0, Math.min(v.personalLoanLimit, opts.leverage * pf - p.debt));
        // taille optimale d'un achat avec impact : n* = S × (écart) (on en prend la moitié)
        // l'inertie (cours ← ½ ancien + ½ cible) fait qu'on récupère la moitié de l'impact au tour suivant
        let n = Math.floor(c.sharesOutstanding * exp * 0.5);
        n = Math.min(n, c.floatShares, Math.floor(c.sharesOutstanding * 0.15));
        // ne pas déclencher de flash de seuil ni de défense : rester sous 25 %
        if (c.controllerId !== v.you) n = Math.min(n, Math.floor(c.sharesOutstanding * 0.24) - held(v, c));
        const budget = p.cash - 20 + loanRoom;
        n = Math.min(n, sharesFor(c, budget));
        if (n < 1) continue;
        const cost = buyCost(c, n);
        if (cost > p.cash - 20) {
          const loan = Math.ceil(cost - p.cash + 50);
          if (loan <= loanRoom) api.act({ type: 'takePersonalLoan', amount: loan });
        }
        v = api.view();
        const n2 = Math.min(n, sharesFor(v.companies.find((x) => x.id === c.id)!, me(v).cash - 10));
        if (n2 >= 1) api.act({ type: 'buyShares', companyId: c.id, shares: n2 });
      }
      deleverage(api, opts.leverage);
      restartIfOrphan(api, ctx.memory.sector);
      snapshot(api, ctx.memory);
    },
  };
}
export const speculator = makeSpeculator({ name: 'speculator', memorizeFakes: true, leverage: 0.4, threshold: 0.04 });
export const speculatorNaive = makeSpeculator({ name: 'speculator-naive', memorizeFakes: false, leverage: 0.4, threshold: 0.04 });

// ---------------------------------------------------------------------------
// 6. RAIDER : OPA agressives financées par levier, ponction des filiales, fusions
// ---------------------------------------------------------------------------
export function makeRaider(opts: { name: string; maxLtv: number; bonusShare: number; minTurn: number; playersToo: boolean }): Strategy {
  return {
    name: opts.name,
    tier: 'specialist',
    act(view, api, ctx) {
      initMemory(view, ctx.memory);
      ctx.memory.sector ??= mainSector(view);
      let v = api.view();
      for (const c of myCompanies(v)) {
        runOps(view, api, c.id, { level: 'basic', capacity: false, launches: false });
        defend(api, c.id, { trigger: 0.3, leverage: 0.6 });
      }

      // 1. Fusion des filiales (économie des frais de siège, rapport plus gros pour la ponction)
      v = api.view();
      const ctrl = myCompanies(v).sort((a, b) => b.marketCap - a.marketCap);
      if (ctrl.length >= 2) {
        const absorber = ctrl[0];
        for (const t of ctrl.slice(1)) {
          const a = api.view().companies.find((x) => x.id === absorber.id)!;
          if (a.products.length + t.products.length > 6 || t.private?.turnFlags.justFounded || a.private?.turnFlags.justFounded) continue;
          api.act({ type: 'merge', absorberId: a.id, targetId: t.id });
        }
      }

      // 2. Ponction : bonus sur chaque entreprise contrôlée (le flottant paie), jauge tenue sous 20
      v = api.view();
      for (const c of myCompanies(v)) {
        if (!c.private || c.private.turnFlags.justFounded) continue;
        const own = held(v, c) / c.sharesOutstanding;
        if (own > 0.9) continue;
        const amount = Math.floor(Math.min(c.private.maxBonus * opts.bonusShare, c.cash - plannedOutflow(v, c) - reserveOf(c) - CRISIS_COST));
        if (amount > 50) api.act({ type: 'ceoBonus', companyId: c.id, amount });
        manageScandal(api, c.id, 20);
      }

      // 3. Chasse : la cible la plus rentable à contrôler, en un seul assaut (les bots se défendent à 30 %)
      v = api.view();
      if (v.turn >= opts.minTurn && turnsLeft(v) >= 3) {
        const p = me(v);
        const pf = Math.max(p.portfolioValue, 1);
        const loanRoom = Math.max(0, Math.min(v.personalLoanLimit, opts.maxLtv * pf - p.debt));
        const budget = Math.max(0, p.cash - 50) + loanRoom;
        const R = turnsLeft(v);
        const myMain = myCompanies(v).sort((a, b) => b.marketCap - a.marketCap)[0];
        const cands = activeCompanies(v)
          .filter((c) => c.controllerId !== v.you && c.sharePrice > 0.05 && (opts.playersToo || c.controllerId === null))
          .map((c) => {
            const h = held(v, c);
            const need = Math.floor(c.sharesOutstanding / 2) + 1 - h;
            if (need <= 0 || need > c.floatShares) return null;
            const cost = buyCost(c, need);
            const val = valuation(v, c, ctx.memory);
            const fair = Math.min(val.next, c.sharePrice * 1.3);
            const own = (h + need) / c.sharesOutstanding;
            // valeur de la ponction : bonus à 5 % du cash par tour, dont (1 − part) payé par les autres
            const extraction = (1 - own) * 0.05 * opts.bonusShare * 2 * Math.max(c.cash, 0) * Math.min(R, 10) * 0.8 - 70 * R;
            // synergie de fusion : frais de siège économisés (valorisés via profitEma)
            const canMerge = myMain && myMain.products.length + c.products.length <= 6; // lot 2
            let synergy = 0;
            if (canMerge) {
              for (let k = 0; k < R; k++) synergy += profitWeight(v, v.turn + 1 + k) * HQ;
              synergy *= 0.45;
            }
            const paperLoss = cost - need * fair;
            const score = extraction + synergy - paperLoss;
            return { c, need, cost, score };
          })
          .filter((x): x is NonNullable<typeof x> => !!x && x.score > 0 && x.cost <= budget)
          .sort((a, b) => b.score - a.score);
        const t = cands[0];
        if (t) {
          if (t.cost > p.cash - 50) {
            const loan = Math.ceil(t.cost - p.cash + 100);
            api.act({ type: 'takePersonalLoan', amount: Math.min(loan, Math.floor(v.personalLoanLimit)) });
          }
          v = api.view();
          const c = v.companies.find((x) => x.id === t.c.id)!;
          const n = Math.min(t.need, c.floatShares, sharesFor(c, me(v).cash - 10));
          if (n >= t.need) api.act({ type: 'buyShares', companyId: c.id, shares: n });
          ctx.memory.raids = (ctx.memory.raids ?? 0) + 1;
        }
      }

      deleverage(api, opts.maxLtv);
      restartIfOrphan(api, ctx.memory.sector);
      snapshot(api, ctx.memory);
    },
  };
}
export const raider = makeRaider({ name: 'raider', maxLtv: 0.55, bonusShare: 0.5, minTurn: 1, playersToo: true });

/** Référence : seulement les opérations de base (prix/production optimisés, matières, trésorerie). */
export const operator: Strategy = {
  name: 'operator',
  tier: 'reference',
  act(view, api, ctx) {
    initMemory(view, ctx.memory);
    for (const c of myCompanies(api.view())) runOps(view, api, c.id, { level: 'basic', capacity: false, launches: false });
    snapshot(api, ctx.memory);
  },
};

export const ARCHETYPES: Strategy[] = [raider, industrialist, speculator, shady, turtle, marketer];

// ---------------------------------------------------------------------------
// Test rapide : `tsx strategies/archetypes.ts [graines] [mode]`
// ---------------------------------------------------------------------------
const isMain = (() => {
  try {
    return !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
  } catch {
    return false;
  }
})();

if (isMain) {
  const nSeeds = Number(process.argv[2] ?? 20);
  const mode = process.argv[3] ?? 'duel';
  const seeds = Array.from({ length: nSeeds }, (_, i) => i + 1);
  const t0 = Date.now();
  if (mode === 'duel') {
    for (const s of [...ARCHETYPES, speculatorNaive]) {
      const res = runTournament({ seeds, lineups: [[s, passive]], bots: 3 });
      const sum = res.summary.find((x) => x.name === s.name)!;
      const pas = res.summary.find((x) => x.name === 'passive')!;
      const h = res.headToHead[s.name]?.passive;
      const best = res.summary.filter((x) => x.name.startsWith('bot:')).sort((a, b) => b.medianNW - a.medianNW)[0];
      console.log(
        `${s.name.padEnd(17)} n=${sum.games} win ${(sum.winRate * 100).toFixed(0).padStart(3)}%  rang ${sum.meanRank.toFixed(2)}  medNW ${(sum.medianNW / 1000).toFixed(1).padStart(6)}M  q10-q90 ${(sum.q10NW / 1000).toFixed(1)}-${(sum.q90NW / 1000).toFixed(1)}  vs passive ${((h?.rate ?? 0) * 100).toFixed(0)}%  (passive ${(pas.medianNW / 1000).toFixed(1)}M)  vs bots ${(
          (['bot:brevet', 'bot:tweetard', 'bot:basdelaine', 'bot:viralier', 'bot:delarente', 'bot:magouillac']
            .map((b) => res.headToHead[s.name]?.[b])
            .filter(Boolean)
            .reduce((a, x) => a + x!.rate * x!.n, 0) /
            Math.max(1, ['bot:brevet', 'bot:tweetard', 'bot:basdelaine', 'bot:viralier', 'bot:delarente', 'bot:magouillac'].map((b) => res.headToHead[s.name]?.[b]?.n ?? 0).reduce((a, x) => a + x, 0))) *
          100
        ).toFixed(0)}%  OPA+ ${sum.meanStats.takeoversWon.toFixed(2)} OPA- ${sum.meanStats.takeoversSuffered.toFixed(2)} scand ${sum.meanStats.scandals.toFixed(2)} marge ${sum.meanStats.marginCalls.toFixed(2)} refus ${(
          (sum.meanStats.actionsRefused / Math.max(1, sum.meanStats.actionsOk + sum.meanStats.actionsRefused)) *
          100
        ).toFixed(0)}%  ${JSON.stringify(Object.fromEntries(Object.entries(sum.medianNWBySector).map(([k, x]) => [k.slice(0, 4), +(x / 1000).toFixed(1)])))}`,
      );
    }
  } else if (mode === 'all') {
    const res = runTournament({ seeds, lineups: [ARCHETYPES], bots: 2 });
    console.log(formatReport(res));
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
