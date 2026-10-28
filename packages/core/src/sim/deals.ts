/**
 * Intégration verticale et tractations entre joueurs (§5.5 bis, §7 bis) : filiales d'approvisionnement, contrats de
 * fourniture, ententes sur les prix. Fonctions pures sur l'état, partagées par les actions, la résolution, la vue
 * et les bots. Aucune ne tire le RNG : la découverte d'une entente se tire à la résolution (resolve.ts).
 */
import { COMMODITIES, DEPOSITS, SECTORS } from '../content';
import type { Cartel, CommodityId, CompanyState, GameState, Id, Offer, SectorId, SiteBid, SiteSlot, SupplySite } from '../types';
import {
  CARTEL_RISK_BASE,
  CARTEL_RISK_MAX,
  CARTEL_RISK_PER_MEMBER,
  CARTEL_RISK_PER_TURN,
  CONTRACT_GROUP_BAND,
  CONTRACT_PRICE_MAX_RATIO,
  CONTRACT_PRICE_MIN_RATIO,
  EMERGENCY_PURCHASE_PREMIUM,
  SITES_PER_COMMODITY,
  SITE_CAPACITY,
  SITE_DORMANT_UPKEEP,
  SITE_OPENING_COST_MULT,
  SITE_UNIT_COST_RATIO,
} from './constants';
import { addInventory, removeInventory } from './market';
import { fin, getOwn, mixedHash } from './util';

// ---------------------------------------------------------------------------
// Filiales d'approvisionnement
// ---------------------------------------------------------------------------

/** Mise à prix d'une filiale (k) : payée comptant, étalée sur 4 trimestres dans le résultat. */
export function siteOpeningCost(cid: CommodityId): number {
  return COMMODITIES[cid].basePrice * SITE_OPENING_COST_MULT;
}

/**
 * Trois emplacements par matière, nommés à la création de la partie : les noms se tirent par hachage de la graine des
 * textes (`GameConfig.textSeed`, publique, jamais celle de la simulation), sans toucher au RNG (même choix dans toutes
 * les langues, les listes ayant la même longueur).
 */
export function buildSiteSlots(seed: number, names: Record<CommodityId, string[]>): SiteSlot[] {
  const slots: SiteSlot[] = [];
  for (const cid of Object.keys(COMMODITIES) as CommodityId[]) {
    const pool = names[cid] ?? [];
    const order = pool
      .map((_, i) => i)
      .sort((a, b) => mixedHash(`${seed}|site|${cid}|${a}`) - mixedHash(`${seed}|site|${cid}|${b}`) || a - b);
    for (let k = 0; k < SITES_PER_COMMODITY; k++) {
      slots.push({ id: `${cid}-${k + 1}`, commodityId: cid, name: pool[order[k]] ?? `${cid} ${k + 1}` });
    }
  }
  return slots;
}

/** Entreprise (id) qui exploite chaque emplacement occupé : seules les entreprises actives comptent. */
export function slotOperators(state: GameState): Map<Id, Id> {
  const taken = new Map<Id, Id>();
  for (const c of Object.values(state.companies)) {
    if (c.status === 'active') for (const s of c.sites ?? []) taken.set(s.id, c.id);
  }
  return taken;
}

/** Emplacements libres d'une matière, dans l'ordre. */
export function freeSlots(state: GameState, cid: CommodityId): SiteSlot[] {
  const taken = slotOperators(state);
  return (state.siteSlots ?? []).filter((s) => s.commodityId === cid && !taken.has(s.id));
}

/** Filiale attribuée à la clôture, pour le numéro suivant du journal. */
export interface SiteAward {
  companyId: Id;
  /** Dirigeant qui a misé (et dirigeait encore à la clôture). */
  playerId: Id;
  slotId: Id;
  price: number;
  bidders: number;
}

/**
 * Hachage secret d'une mise (graine de la simulation, masquée) : départage les mises égales, puis range les gagnants
 * sur les emplacements. Jamais le RNG, jamais la langue.
 */
function bidKey(state: GameState, b: SiteBid, salt: string): number {
  return mixedHash(`${state.config.seed}|${state.turn}|${b.companyId}|${b.commodityId}|${salt}`);
}

/**
 * Ce qu'une mise engage vraiment : au plus la trésorerie de l'entreprise en fin de trimestre, ventes encaissées (§5.5 bis,
 * §5.7). Miser avec de l'argent qu'on n'aura plus à la clôture ne fait monter le prix de personne.
 */
function backedAmount(c: CompanyState, amount: number): number {
  return Math.floor(Math.min(amount, Math.max(0, c.cash)) + 1e-6);
}

/** Ce que l'entreprise paiera à la clôture pour ses achats par contrat (livraison complète, vendeur encore actif). */
export function contractPurchases(state: GameState, c: CompanyState): number {
  let total = 0;
  for (const k of state.contracts ?? []) {
    if (k.buyerCompanyId !== c.id || !(k.turnsLeft > 0)) continue;
    if (getOwn(state.companies, k.sellerCompanyId)?.status !== 'active') continue;
    total += Math.max(0, k.lots) * Math.max(0, k.price);
  }
  return fin(total);
}

/** Richesse d'un emplacement : lots extraits par trimestre par sa filiale (§5.8 ; un gisement inconnu compte comme moyen). */
export function slotCapacity(slotId: Id): number {
  return getOwn(DEPOSITS, slotId)?.capacity ?? SITE_CAPACITY;
}

/**
 * Enchères de filiales (résolution, en fin de trimestre, après les ventes, §5.5 bis, §5.7). Matière par matière dans
 * l'ordre du catalogue, puis gisement par gisement : une mise vaut ce qu'elle engage vraiment (`backedAmount`) ; elle
 * est valable si le gisement est libre, l'entreprise active, toujours dirigée par celui qui a misé, sans filiale de
 * cette matière, et si elle engage au moins la mise à prix. Sur chaque gisement, la plus haute mise valable l'emporte
 * et paie la meilleure mise perdante **sur ce gisement**, ou la mise à prix s'il est seul : jamais plus qu'il n'engage.
 * Les égalités se départagent par le hachage secret des mises. Le prix est payé comptant ; la filiale prend la
 * richesse de son gisement et produit à partir de la résolution suivante.
 */
export function awardSites(state: GameState): SiteAward[] {
  const awards: SiteAward[] = [];
  const pending = (state.siteBids ?? []).filter((b) => b.result === undefined);
  if (pending.length === 0) {
    delete state.siteBids; // les issues du trimestre précédent ne servent plus
    return awards;
  }
  const settled: SiteBid[] = [];
  const taken = slotOperators(state);
  const slots = state.siteSlots ?? [];
  for (const cid of Object.keys(COMMODITIES) as CommodityId[]) {
    const reserve = siteOpeningCost(cid);
    for (const slot of slots.filter((s) => s.commodityId === cid)) {
      const bids = pending.filter((b) => b.slotId === slot.id);
      if (bids.length === 0) continue;
      const valid: { bid: SiteBid; c: CompanyState; backed: number }[] = [];
      const invalid: SiteBid[] = [];
      for (const b of bids) {
        const c = getOwn(state.companies, b.companyId);
        const backed = c ? backedAmount(c, b.amount) : 0;
        const ok =
          !!c &&
          !taken.has(slot.id) &&
          b.commodityId === cid &&
          c.status === 'active' &&
          c.controllerId === b.playerId &&
          !(c.sites ?? []).some((x) => x.commodityId === cid) &&
          backed + 1e-6 >= reserve;
        if (ok && c) valid.push({ bid: b, c, backed });
        else invalid.push(b);
      }
      valid.sort((x, y) => y.backed - x.backed || bidKey(state, x.bid, 'tie') - bidKey(state, y.bid, 'tie'));
      const bidders = valid.length;
      const price = valid.length > 1 ? Math.max(reserve, valid[1].backed) : reserve;
      const winner = valid[0];
      if (winner) {
        const { bid, c } = winner;
        // Payée comptant, comme une usine : hors compte de résultat, la moitié du prix reste dans la valeur comptable (§5.7).
        c.cash -= price;
        (c.sites ??= []).push({ id: slot.id, commodityId: cid, capacity: slotCapacity(slot.id), unitCost: siteUnitCost(cid), activeFrom: state.turn + 1, cost: price });
        taken.set(slot.id, c.id);
        awards.push({ companyId: c.id, playerId: bid.playerId, slotId: slot.id, price, bidders });
        settled.push({ ...bid, result: { outcome: 'won', price, bidders } });
      }
      for (const { bid } of valid.slice(1)) settled.push({ ...bid, result: { outcome: 'lost', price, bidders } });
      for (const b of invalid) settled.push({ ...b, result: { outcome: 'failed', price, bidders } });
    }
  }
  // Une mise sur un emplacement qui n'existe pas (état bricolé) tombe, sans rien coûter.
  const known = new Set(slots.map((s) => s.id));
  for (const b of pending) if (!known.has(b.slotId)) settled.push({ ...b, result: { outcome: 'failed', price: siteOpeningCost(b.commodityId), bidders: 0 } });
  if (settled.length > 0) state.siteBids = settled;
  else delete state.siteBids;
  return awards;
}

/** Coût d'extraction d'un lot (k), hors effets de news. */
export function siteUnitCost(cid: CommodityId): number {
  return COMMODITIES[cid].basePrice * SITE_UNIT_COST_RATIO;
}

/** Multiplicateur du coût d'extraction d'une matière : produit des effets « siteCost » en cours (news, §5.5 bis). */
export function siteCostFactor(state: GameState, cid: CommodityId): number {
  let f = 1;
  for (const e of state.activeEffects) if (e.kind === 'siteCost' && e.commodityId === cid) f *= e.value;
  return f;
}

/** Coût du lot extrait à la prochaine résolution (k), effets de news compris. */
export function siteCurrentUnitCost(state: GameState, s: SupplySite): number {
  return fin(s.unitCost * siteCostFactor(state, s.commodityId), s.unitCost);
}

/** Entretien d'un trimestre en sommeil (k) : une part de la facture d'extraction habituelle. */
export function siteUpkeep(s: SupplySite): number {
  return fin(Math.max(0, s.capacity) * Math.max(0, s.unitCost) * SITE_DORMANT_UPKEEP);
}

/** Entretien de toutes les filiales en sommeil d'une entreprise, pour ce trimestre (k). */
export function dormantUpkeep(c: CompanyState): number {
  let total = 0;
  for (const s of c.sites ?? []) if (s.dormant) total += siteUpkeep(s);
  return total;
}

/** Lots d'une matière que l'entreprise consomme par trimestre à sa production prévue. */
export function commodityNeed(c: CompanyState, cid: CommodityId): number {
  let need = 0;
  for (const p of c.products) {
    const per = SECTORS[p.sectorId].inputs[cid] ?? 0;
    if (per > 0) need += Math.max(0, Math.min(fin(p.production), p.capacity)) * per;
  }
  return need;
}

/** Lots de cette matière qu'il faudrait par trimestre à pleine capacité : un majorant public des besoins. */
export function capacityNeed(c: CompanyState, cid: CommodityId): number {
  let need = 0;
  for (const p of c.products) need += Math.max(0, p.capacity) * (SECTORS[p.sectorId].inputs[cid] ?? 0);
  return need;
}

/**
 * Extraction (résolution, avant la production) : les lots entrent en stock au coût d'extraction du trimestre (effets
 * de news compris), si la caisse suit. Une filiale en sommeil ou en chantier (ouverture, relance) n'extrait rien ;
 * l'entretien des filiales en sommeil compte dans les coûts fixes (resolve.ts).
 */
export function runSites(state: GameState, companies: CompanyState[], planned: (c: CompanyState, siteId: Id) => number): void {
  for (const c of companies) {
    for (const s of c.sites ?? []) {
      if (s.dormant || s.activeFrom > state.turn) continue;
      // Les lots du plan de clôture (§5.7) : jamais plus que la capacité, ni que ce que la trésorerie paie.
      const unit = siteCurrentUnitCost(state, s);
      const affordable = unit > 0 ? Math.floor((Math.max(0, c.cash) + 1e-6) / unit) : s.capacity;
      const lots = Math.max(0, Math.min(s.capacity, affordable, Math.floor(planned(c, s.id))));
      if (lots <= 0) continue;
      c.cash -= lots * unit;
      addInventory(c, s.commodityId, lots, unit);
    }
  }
}

// ---------------------------------------------------------------------------
// Contrats de fourniture
// ---------------------------------------------------------------------------

/**
 * Fourchette de prix d'un contrat (k par lot) : 50 % à 150 % du prix de base entre deux dirigeants ; entre deux
 * entreprises du même dirigeant, ± 10 % du cours de la dernière clôture (prix de pleine concurrence). Prend l'état
 * de la matière ou sa vue.
 */
export function contractPriceRange(cid: CommodityId, commodity: { price: number; priceHistory: number[] }, sameGroup: boolean): [number, number] {
  if (sameGroup) {
    const close = commodity.priceHistory.at(-1) ?? commodity.price;
    return [close * (1 - CONTRACT_GROUP_BAND), close * (1 + CONTRACT_GROUP_BAND)];
  }
  const base = COMMODITIES[cid].basePrice;
  return [base * CONTRACT_PRICE_MIN_RATIO, base * CONTRACT_PRICE_MAX_RATIO];
}

/**
 * Livraisons (résolution, après l'extraction, avant la production), dans l'ordre de signature. Le vendeur livre ce
 * qu'il avait en stock au début des livraisons (extraction du trimestre comprise) : ce qu'il reçoit lui-même par
 * contrat ne repart qu'au trimestre suivant, sinon deux contrats croisés feraient tourner les mêmes lots. Le lot entre
 * chez l'acheteur au prix du contrat, payé sur la somme mise de côté parmi ses obligations (§5.7). Pour chaque lot
 * manquant, le vendeur doit un dédit : ce qu'il en coûtera en plus à l'acheteur de l'acheter en urgence (cours × 1,1
 * moins le prix du contrat). L'acheteur le reçoit tout de suite ; le vendeur le paie à la clôture suivante, avec ses
 * amendes.
 */
export function deliverContracts(state: GameState): void {
  const list = state.contracts ?? [];
  const stockKey = (companyId: Id, cid: CommodityId) => `${companyId}|${cid}`;
  const deliverable = new Map<string, number>();
  for (const k of list) {
    const key = stockKey(k.sellerCompanyId, k.commodityId);
    const seller = getOwn(state.companies, k.sellerCompanyId);
    if (seller && !deliverable.has(key)) deliverable.set(key, seller.inventory[k.commodityId]?.lots ?? 0);
  }
  for (const k of list) {
    const seller = getOwn(state.companies, k.sellerCompanyId);
    const buyer = getOwn(state.companies, k.buyerCompanyId);
    if (!seller || !buyer || seller.status !== 'active' || buyer.status !== 'active') {
      k.turnsLeft = 0;
      continue;
    }
    const key = stockKey(seller.id, k.commodityId);
    const have = Math.min(deliverable.get(key) ?? 0, seller.inventory[k.commodityId]?.lots ?? 0);
    const lots = Math.max(0, Math.floor(Math.min(k.lots, have)));
    if (lots > 0) {
      removeInventory(seller, k.commodityId, lots);
      deliverable.set(key, (deliverable.get(key) ?? 0) - lots);
      seller.cash += lots * k.price;
      buyer.cash -= lots * k.price;
      addInventory(buyer, k.commodityId, lots, k.price);
    }
    const penalty = fin((k.lots - lots) * Math.max(0, state.commodities[k.commodityId].price * EMERGENCY_PURCHASE_PREMIUM - k.price));
    if (penalty > 0) {
      seller.finesDue = fin((seller.finesDue ?? 0) + penalty);
      buyer.cash += penalty;
      k.lastPenalty = penalty;
    } else delete k.lastPenalty;
    k.lastDelivered = lots;
    k.turnsLeft -= 1;
  }
  state.contracts = list.filter((k) => k.turnsLeft > 0);
}

/** Contrat en cours entre ces deux entreprises pour cette matière, dans un sens ou dans l'autre. */
export function contractBetween(state: GameState, a: Id, b: Id, cid: CommodityId): boolean {
  return (state.contracts ?? []).some(
    (k) => k.commodityId === cid && ((k.sellerCompanyId === a && k.buyerCompanyId === b) || (k.sellerCompanyId === b && k.buyerCompanyId === a)),
  );
}

// ---------------------------------------------------------------------------
// Ententes sur les prix
// ---------------------------------------------------------------------------

/** Membres encore valables : entreprise active, même dirigeant qu'à la signature, un produit dans le secteur. */
export function cartelMembers(state: GameState, k: Cartel): CompanyState[] {
  const out: CompanyState[] = [];
  for (const m of k.members) {
    const c = getOwn(state.companies, m.companyId);
    if (c && c.status === 'active' && c.controllerId === m.controllerId && c.products.some((p) => p.sectorId === k.sectorId)) out.push(c);
  }
  return out;
}

/**
 * Risque d'être découverte à la prochaine résolution (§7 bis) : il croît avec le nombre de membres et avec les
 * trimestres que ses membres ont déjà passés en entente (le plus aguerri compte).
 */
export function cartelRisk(members: number, quarters: number): number {
  const extra = Math.max(0, members - 2);
  return Math.min(CARTEL_RISK_MAX, CARTEL_RISK_BASE + CARTEL_RISK_PER_MEMBER * extra + CARTEL_RISK_PER_TURN * Math.max(0, quarters));
}

/** Trimestres clos en entente du membre le plus aguerri : quitter une entente puis la reformer n'efface rien. */
export function cartelQuarters(members: CompanyState[]): number {
  return members.reduce((m, c) => Math.max(m, c.cartelQuarters ?? 0), 0);
}

/** Risque actuel d'une entente, pour ses membres valables. */
export function cartelRiskOf(state: GameState, k: Cartel): number {
  const members = cartelMembers(state, k);
  return cartelRisk(members.length, cartelQuarters(members));
}

/** Ne garde que les membres valables ; une entente à moins de deux membres est dissoute. */
export function pruneCartels(state: GameState): void {
  if (!state.cartels) return;
  for (const k of state.cartels) {
    const valid = new Set(cartelMembers(state, k).map((c) => c.id));
    k.members = k.members.filter((m) => valid.has(m.companyId));
  }
  state.cartels = state.cartels.filter((k) => k.members.length >= 2);
}

/** Entente d'un secteur dont cette entreprise est membre valable. */
export function cartelOf(state: GameState, companyId: Id, sectorId: SectorId): Cartel | undefined {
  return (state.cartels ?? []).find((k) => k.sectorId === sectorId && cartelMembers(state, k).some((c) => c.id === companyId));
}

/**
 * Le joueur voit-il le prix du trimestre en cours de ce produit ? Oui pour ses entreprises, et pour celles de ses
 * partenaires d'entente dans ce secteur (c'est tout l'intérêt de s'entendre) ; sinon, le prix du trimestre précédent.
 */
export function seesCurrentPrice(state: GameState, viewerId: Id | null, c: CompanyState, sectorId: SectorId): boolean {
  if (viewerId === null) return false;
  if (c.controllerId === viewerId) return true;
  const k = cartelOf(state, c.id, sectorId);
  return !!k && cartelMembers(state, k).some((m) => m.controllerId === viewerId);
}

// ---------------------------------------------------------------------------
// Offres
// ---------------------------------------------------------------------------

export function offerById(state: GameState, id: unknown): Offer | undefined {
  return typeof id === 'string' ? (state.offers ?? []).find((o) => o.id === id) : undefined;
}

/** Offres envoyées par ce joueur ce trimestre (toutes issues confondues). */
export function offersSentThisTurn(state: GameState, playerId: Id): number {
  return (state.offers ?? []).filter((o) => o.fromId === playerId && o.turn === state.turn).length;
}
