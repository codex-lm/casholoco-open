/** Fabrication des entreprises et des produits (§4, §7). */
import { isSpatialMap } from '../content/hexes';
import { getContent, SECTORS } from '../content';
import type { CompanyState, GameState, Id, ProductState, SectorId } from '../types';
import {
  START_BRAND,
  START_QUALITY,
  START_SHARES,
} from './constants';
import { startingDecisions } from './opening';
import { langOf } from './i18n';
import { hashString, newId, stripAccents, textSeedOf } from './util';

export function newProduct(
  state: GameState,
  sectorId: SectorId,
  name: string,
  /** `pending` : produit lancé en cours de partie, dont la capacité n'est livrée qu'au trimestre suivant (§7). */
  opts: { capacity?: number; spendFactor?: number; brand?: number; pending?: boolean } = {},
): ProductState {
  const def = SECTORS[sectorId];
  const capacity = Math.max(1, Math.round(opts.capacity ?? def.startingCapacity));
  const spend = opts.spendFactor ?? 1;
  const brand = opts.brand ?? START_BRAND;
  const decisions = startingDecisions(sectorId, capacity, spend, brand);
  return {
    id: newId(state, 'pr'),
    ...(state.config.industryRules === 'network' && isSpatialMap(state.config) ? { initialCapacity: capacity } : {}),
    name,
    sectorId,
    quality: START_QUALITY,
    brand,
    capacity: opts.pending ? 0 : capacity,
    pendingCapacity: opts.pending ? capacity : 0,
    stock: 0,
    ...decisions,
    lastPrice: decisions.price,
    lastSales: 0,
    lastProduced: 0,
    lastRevenue: 0,
    lastMarketShare: 0,
    lastUnitCost: 0,
    launchedTurn: state.turn,
    ...(opts.pending ? { firstSalesTurn: state.turn + 1 } : {}),
  };
}

function usedProductNames(state: GameState): Set<string> {
  const names = new Set<string>();
  for (const c of Object.values(state.companies)) for (const p of c.products) names.add(p.name.toLowerCase());
  return names;
}

/** Nom de produit libre, tiré des idées du contenu dans la langue de la partie (sans consommer le RNG). */
export function suggestProductName(state: GameState, sectorId: SectorId, companyName: string): string {
  const content = getContent(langOf(state));
  const used = usedProductNames(state);
  const ideas = (content.productNameIdeas[sectorId] ?? []).filter((n) => !used.has(n.toLowerCase()));
  if (ideas.length > 0) return ideas[hashString(`${textSeedOf(state)}|${state.nextId}|${companyName}`) % ideas.length];
  const base = `${companyName.split(' ')[0]} ${content.sectors[sectorId].name.split(' ')[0]}`;
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) name = `${base} ${i++}`;
  return name;
}

/** Ticker de 3 lettres (ou 4 si besoin), unique dans la partie. */
export function makeTicker(state: GameState, name: string, preferred?: string): string {
  const taken = new Set(Object.values(state.companies).map((c) => c.ticker));
  const clean = (s: string) => stripAccents(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim();
  if (preferred) {
    const p = clean(preferred).replace(/ /g, '').slice(0, 5);
    if (p.length >= 2 && !taken.has(p)) return p;
  }
  const words = clean(name).split(/\s+/).filter(Boolean);
  let base = words.length >= 3 ? words.map((w) => w[0]).join('').slice(0, 3) : (words.join('') || 'XXX').slice(0, 3);
  base = base.padEnd(3, 'X');
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const t = `${base.slice(0, 3)}${i}`;
    if (!taken.has(t)) return t;
  }
  return `${base}${state.nextId}`;
}

export function uniqueCompanyName(state: GameState, name: string): string {
  const taken = new Set(Object.values(state.companies).map((c) => c.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; i < 100; i++) {
    const n = `${name} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
  return `${name} ${state.nextId}`;
}

export interface CompanyInit {
  name: string;
  ticker: string;
  emoji: string;
  color: string;
  ceoName: string;
  founderId: Id | null;
  controllerId: Id | null;
  npcDefId?: string;
  cash: number;
  holdings: Record<Id, number>;
  products: ProductState[];
  profitEma: number;
  revenueEma: number;
  sharePrice: number;
}

export function newCompany(state: GameState, init: CompanyInit): CompanyState {
  const c: CompanyState = {
    id: newId(state, 'c'),
    name: init.name,
    ticker: init.ticker,
    emoji: init.emoji,
    color: init.color,
    ceoName: init.ceoName,
    founderId: init.founderId,
    controllerId: init.controllerId,
    status: 'active',
    foundedTurn: state.turn,
    foundedSectorId: init.products[0]?.sectorId,
    cash: init.cash,
    debt: 0,
    sharesOutstanding: START_SHARES,
    holdings: { ...init.holdings },
    sharePrice: init.sharePrice,
    priceHistory: [],
    sentiment: 1,
    reputation: 1,
    scandal: 0,
    profitEma: init.profitEma,
    revenueEma: init.revenueEma,
    products: init.products,
    inventory: {},
    modifiers: [],
    reports: [],
    turnFlags: { bonusTaken: 0, buybackDone: false, shadyDone: [], borrowed: 0 },
  };
  if (init.npcDefId) c.npcDefId = init.npcDefId;
  state.companies[c.id] = c;
  return c;
}
