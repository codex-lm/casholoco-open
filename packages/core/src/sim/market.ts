/** Primitives de marché : actions (§6.2) et matières premières (§5.5). Sans validation. */
import { COMMODITIES } from '../content';
import type { CommodityId, CompanyState, GameState, Id, PlayerState } from '../types';
import { COMMODITY_CAP_RATIO, COMMODITY_FLOOR_RATIO, COMMODITY_SELL_DISCOUNT, PRICE_FLOOR } from './constants';
import { clamp, fin } from './util';

export interface Quote {
  avg: number; // prix moyen par unité
  total: number;
  newPrice: number;
}

// ---------------------------------------------------------------------------
// Impact de prix (§5.5, §6.2) : courbe exponentielle, indépendante du chemin
// ---------------------------------------------------------------------------
//
// Le prix est une fonction du volume net échangé dans le tour : P(q) = p × e^(q / profondeur).
// Acheter n unités coûte l'intégrale de P sur le trajet, vendre rapporte l'intégrale en sens inverse :
// un aller-retour (vendre puis racheter, ou l'inverse) ne rapporte rien, et fractionner un ordre ne change rien.
// (Avec l'ancien impact linéaire, vendre toute sa ligne puis la racheter dans le même tour rapportait
// n × p × (n / S)² / 2 à chaque trimestre.)

/** Coût d'un achat de n unités au prix p, profondeur `depth`, plafond de prix `cap` (∞ par défaut). */
export function impactBuyTotal(p: number, n: number, depth: number, cap = Number.POSITIVE_INFINITY): number {
  if (!(n > 0) || !(p > 0)) return 0;
  const D = Math.max(depth, 1);
  if (p >= cap) return fin(n * cap);
  // Volume à partir duquel le prix touche le plafond ; au-delà, chaque unité se paie au plafond.
  const qCap = Number.isFinite(cap) ? D * Math.log(cap / p) : Number.POSITIVE_INFINITY;
  const q1 = Math.min(n, qCap);
  return fin(p * D * Math.expm1(q1 / D) + (n - q1) * (Number.isFinite(cap) ? cap : 0));
}

/** Produit brut d'une vente de n unités au prix p, profondeur `depth`, plancher de prix `floor`. */
export function impactSellTotal(p: number, n: number, depth: number, floor = 0): number {
  if (!(n > 0) || !(p > 0)) return 0;
  const D = Math.max(depth, 1);
  if (p <= floor) return fin(n * floor);
  // Sous le plancher, le prix ne baisse plus : les unités restantes se vendent au plancher.
  const qFloor = floor > 0 ? D * Math.log(p / floor) : Number.POSITIVE_INFINITY;
  const q1 = Math.min(n, qFloor);
  return fin(-p * D * Math.expm1(-q1 / D) + (n - q1) * floor);
}

/** Prix après un ordre de n unités (achat ou vente), borné entre `floor` et `cap`. */
export function impactPriceAfter(p: number, n: number, depth: number, side: 'buy' | 'sell', floor = 0, cap = Number.POSITIVE_INFINITY): number {
  const D = Math.max(depth, 1);
  const k = Math.max(0, n) / D;
  const raw = p * Math.exp(side === 'buy' ? k : -k);
  return clamp(fin(raw, p), floor, cap);
}

/** Nombre d'unités achetables avec un budget (inverse de impactBuyTotal, sans plafond). */
export function impactUnitsForBudget(p: number, budget: number, depth: number): number {
  if (!(budget > 0) || !(p > 0)) return 0;
  const D = Math.max(depth, 1);
  return Math.max(0, fin(D * Math.log1p(budget / (p * D))));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Acheter n actions sur S : coût p × S × (e^(n/S) − 1), puis p ← p × e^(n/S). */
export function shareBuyQuote(c: CompanyState, n: number): Quote {
  const S = Math.max(c.sharesOutstanding, 1);
  const p = Math.max(c.sharePrice, PRICE_FLOOR);
  const total = impactBuyTotal(p, n, S);
  return { avg: n > 0 ? total / n : p, total, newPrice: impactPriceAfter(p, n, S, 'buy', PRICE_FLOOR) };
}

/** Vendre n actions sur S : produit p × S × (1 − e^(−n/S)), puis p ← p × e^(−n/S), plancher 0,01. */
export function shareSellQuote(c: CompanyState, n: number): Quote {
  const S = Math.max(c.sharesOutstanding, 1);
  const p = Math.max(c.sharePrice, 0);
  const total = impactSellTotal(p, n, S);
  return { avg: n > 0 ? total / n : p, total, newPrice: impactPriceAfter(p, n, S, 'sell', PRICE_FLOOR) };
}

/** Nombre d'actions achetables avec un budget donné (inverse de shareBuyQuote). */
export function sharesForBudget(c: CompanyState, budget: number): number {
  const S = Math.max(c.sharesOutstanding, 1);
  const p = Math.max(c.sharePrice, PRICE_FLOOR);
  return Math.max(0, Math.floor(impactUnitsForBudget(p, budget, S) * 0.999));
}

export function addHolding(c: CompanyState, playerId: string, delta: number): void {
  const v = (Object.prototype.hasOwnProperty.call(c.holdings, playerId) ? c.holdings[playerId] : 0) + delta;
  if (v > 0.5) c.holdings[playerId] = Math.round(v);
  else delete c.holdings[playerId];
}

export function holdingOf(c: CompanyState, playerId: string | null): number {
  if (playerId === null) return 0;
  return Object.prototype.hasOwnProperty.call(c.holdings, playerId) ? c.holdings[playerId] : 0;
}

export function executeShareBuy(player: PlayerState, c: CompanyState, n: number): Quote {
  const q = shareBuyQuote(c, n);
  player.cash -= q.total;
  addHolding(c, player.id, n);
  c.sharePrice = q.newPrice;
  return q;
}

export function executeShareSell(state: GameState, player: PlayerState, c: CompanyState, n: number, opts?: { record?: boolean }): Quote {
  // Contrôle et ligne relevés avant la vente : céder le contrôle en vendant n'efface pas le délit d'initié.
  const holdingBefore = holdingOf(c, player.id);
  const sellerController = c.controllerId === player.id;
  const q = shareSellQuote(c, n);
  player.cash += q.total;
  addHolding(c, player.id, -n);
  c.sharePrice = q.newPrice;
  // Registre des ventes (??= : vieilles sauvegardes sans le champ) pour les brèves « délit d'initié » crypto ;
  // les ventes forcées (appels de marge) passent record: false et n'y figurent pas.
  if (opts?.record !== false) {
    (state.shareSales ??= []).push({
      turn: state.turn,
      playerId: player.id,
      companyId: c.id,
      shares: n,
      holdingBefore,
      sellerController,
      hadCryptoLine: c.products.some((p) => p.sectorId === 'crypto'),
    });
  }
  return q;
}

// Nettoie les allers-retours du calcul de délit d'initié : un rachat dans le trimestre vient en déduction des ventes.
export function recordSharePurchase(state: GameState, playerId: Id, companyId: Id, shares: number): void {
  (state.shareBuys ??= []).push({ turn: state.turn, playerId, companyId, shares });
}

// ---------------------------------------------------------------------------
// Matières premières
// ---------------------------------------------------------------------------

export function commodityBuyQuote(state: GameState, cid: CommodityId, n: number): Quote {
  const def = COMMODITIES[cid];
  const L = Math.max(def.liquidity, 1);
  const p = state.commodities[cid].price;
  const floor = def.basePrice * COMMODITY_FLOOR_RATIO;
  const cap = def.basePrice * COMMODITY_CAP_RATIO;
  const total = impactBuyTotal(p, n, L, cap);
  return { avg: n > 0 ? total / n : p, total, newPrice: impactPriceAfter(p, n, L, 'buy', floor, cap) };
}

/** Vendre n lots : 95 % de l'intégrale du prix sur le trajet (plancher 20 % du prix de base). */
export function commoditySellQuote(state: GameState, cid: CommodityId, n: number): Quote {
  const def = COMMODITIES[cid];
  const L = Math.max(def.liquidity, 1);
  const p = state.commodities[cid].price;
  const floor = def.basePrice * COMMODITY_FLOOR_RATIO;
  const cap = def.basePrice * COMMODITY_CAP_RATIO;
  const total = fin(COMMODITY_SELL_DISCOUNT * impactSellTotal(p, n, L, floor));
  return { avg: n > 0 ? total / n : p, total, newPrice: impactPriceAfter(p, n, L, 'sell', floor, cap) };
}

/** Ajoute des lots à l'inventaire au coût moyen pondéré. */
export function addInventory(c: CompanyState, cid: CommodityId, lots: number, unitCost: number): void {
  if (!(lots > 0)) return;
  const line = c.inventory[cid];
  if (!line || line.lots <= 0) {
    c.inventory[cid] = { lots, avgCost: fin(unitCost) };
    return;
  }
  const total = line.lots + lots;
  line.avgCost = fin((line.lots * line.avgCost + lots * unitCost) / total, unitCost);
  line.lots = total;
}

/** Retire des lots de l'inventaire ; renvoie leur valeur comptable. */
export function removeInventory(c: CompanyState, cid: CommodityId, lots: number): number {
  const line = c.inventory[cid];
  if (!line || !(lots > 0)) return 0;
  const taken = Math.min(lots, line.lots);
  line.lots -= taken;
  const value = taken * line.avgCost;
  if (line.lots <= 1e-6) delete c.inventory[cid];
  return fin(value);
}
