/** Les dotations appartiennent à leur usine de départ ; la seule géographie ne donne aucun privilège. */
import { heatCredit, zoneHexId } from './hexes';
import { capitalCellId, isSpatialMap, hexDistance } from '../content/hexes';
import { boardTerrains } from '../content/boardTerrains';

import { SECTORS } from '../content';

import type { CompanyState, GameState, ProductState, TerrainDef, TerrainLever } from '../types';
import { OPTIMISED_TAX_RATE } from './constants';
import { effectiveTaxRate, hasModifier } from './finance';
import { clamp, fin } from './util';

export function activeTerrain(state: GameState, id: string): { terrain: TerrainDef; company: CompanyState; product: ProductState } | undefined {
  if (!isSpatialMap(state.config)) return undefined;
  const terrain = boardTerrains(state.config).find((t) => t.id === id);
  if (!terrain) return undefined;
  for (const company of Object.values(state.companies)) {
    if (company.status !== 'active') continue;
    const product = company.products.find((p) => p.terrainId === id && p.hexId === terrain.hex);
    if (product) return { terrain, company, product };
  }
  return undefined;
}

export function activePlantTerrain(state: GameState, p: Partial<ProductState>, c?: CompanyState): TerrainDef | undefined {
  if (!isSpatialMap(state.config) || !p.terrainId) return undefined;
  const terrain = boardTerrains(state.config).find((t) => t.id === p.terrainId);
  if (!terrain || p.hexId !== terrain.hex) return undefined;
  const owner = c ?? Object.values(state.companies).find((x) => x.products.some((q) => q.id === p.id));
  return owner?.status === 'active' && owner.products.some((q) => q.id === p.id && q.terrainId === terrain.id) ? terrain : undefined;
}

export function activeSeatTerrain(state: GameState, c: CompanyState): TerrainDef | undefined {
  if (!c.terrainId) return undefined;
  const active = activeTerrain(state, c.terrainId);
  return active?.company.id === c.id ? active.terrain : undefined;
}

function heatApplies(state: GameState, p: Partial<ProductState>, e: GameState['activeEffects'][number]): boolean {
  const hex = p.hexId ?? capitalCellId(state.config);
  if (!isSpatialMap(state.config) || !(heatCredit(p.sectorId!, hex) > 0)) return false;
  if (e.productId && e.productId !== p.id) return false;
  if (e.scope === 'mountain') return hexDistance(hex, zoneHexId('mountain', state.config)) <= 1;
  if (e.scope && e.scope !== 'all') return hexDistance(hex, zoneHexId(e.scope, state.config)) <= 1;
  return true;
}

/** Dotation de base multipliée par les nouvelles locales ; une suspension retire le privilège du levier. */
export function terrainMultiplier(state: GameState, c: CompanyState | undefined, p: Partial<ProductState> | undefined, lever: TerrainLever, turn = state.turn): number {
  if (!isSpatialMap(state.config)) return 1;
  const seat = lever === 'tax' || lever === 'scandal';
  const terrain = seat ? (c ? activeSeatTerrain(state, c) : undefined) : (p ? activePlantTerrain(state, p, c) : undefined);
  const news = state.activeEffects.filter((e) => e.kind === 'terrain' && e.terrain === terrain?.id && e.lever === lever && e.turnsLeft > turn - state.turn);
  let mult = 1;
  if (terrain && !news.some((e) => e.suspend)) {
    for (const e of terrain.effects) if (e.lever === lever && (e.turns === undefined || turn <= e.turns)) mult *= e.mult ?? 1;
  }
  for (const e of news) if (!e.suspend) mult *= e.value;
  if (p && (lever === 'heat' || lever === 'demand')) {
    for (const e of state.activeEffects) if (e.kind === 'heat' && e.lever === lever && e.turnsLeft > turn - state.turn && heatApplies(state, p, e)) mult *= e.value;
  }
  return mult;
}

export function terrainPlantMultiplier(state: GameState, p: Partial<ProductState>, lever: TerrainLever, turn = state.turn): number {
  return terrainMultiplier(state, undefined, p, lever, turn);
}

/** Taux du siège sans décision privée ; les projections durables peuvent ignorer les nouvelles locales. */
export function companySeatTaxRate(state: GameState, c: CompanyState, ignoreLocalNews = false): number {
  return seatTaxRate(state, c, effectiveTaxRate(state), ignoreLocalNews);
}

export function companyTaxRate(state: GameState, c: CompanyState): number {
  return seatTaxRate(state, c, hasModifier(c, 'tax_optimisation') ? OPTIMISED_TAX_RATE : effectiveTaxRate(state));
}

function seatTaxRate(state: GameState, c: CompanyState, computed: number, ignoreLocalNews = false): number {
  const terrain = activeSeatTerrain(state, c);
  if (!terrain) return computed;
  const news = ignoreLocalNews ? [] : state.activeEffects.filter((e) => e.kind === 'terrain' && e.terrain === terrain.id && e.lever === 'tax' && e.turnsLeft > 0);
  if (news.some((e) => e.suspend)) return computed;
  let rate = computed;
  const multiplier = news.reduce((m, e) => m * e.value, 1);
  for (const e of terrain.effects) if (e.lever === 'tax' && e.rate !== undefined && (e.turns === undefined || state.turn <= e.turns)) rate = Math.min(rate, e.rate * multiplier);
  return rate;
}

/**
 * Part du prix d'achat récupérée à la fermeture d'une usine : la moitié, sauf dotation « revente » de son
 * terrain de départ encore active (durée propre et nouvelles locales, comme les autres leviers d'usine).
 */
export function terrainSalvageRate(state: GameState, p: Partial<ProductState>, c?: CompanyState, turn = state.turn): number {
  const terrain = activePlantTerrain(state, p, c);
  if (!terrain) return 0.5;
  const news = state.activeEffects.filter((e) => e.kind === 'terrain' && e.terrain === terrain.id && e.lever === 'salvage' && e.turnsLeft > 0);
  if (news.some((e) => e.suspend)) return 0.5;
  const grant = terrain.effects.find((e) => e.lever === 'salvage' && e.rate !== undefined && (e.turns === undefined || turn <= e.turns));
  if (!grant) return 0.5;
  const multiplier = news.reduce((m, e) => m * e.value, 1);
  return clamp(fin(grant.rate! * multiplier), 0, 1);
}

/** Économie supplémentaire d'une optimisation fiscale au taux effectif actuel de l'entreprise. */
export function taxOptimisationGain(state: GameState, c: CompanyState, pretax: number): number {
  return Math.max(0, pretax) * Math.max(0, companyTaxRate(state, c) - OPTIMISED_TAX_RATE);
}

/** Hausse effective pour les reçus d'action ; les baisses ignorent le multiplicateur de scandale. */
export function addScandal(state: GameState, c: CompanyState, delta: number): number {
  const before = c.scandal;
  c.scandal = clamp(c.scandal + delta * (delta > 0 ? terrainMultiplier(state, c, undefined, 'scandal') : 1), 0, 100);
  return c.scandal - before;
}

export function effectiveFixedCost(state: GameState, p: Pick<ProductState, 'sectorId'> & Partial<ProductState>, c?: CompanyState): number {
  return SECTORS[p.sectorId].fixedCost * terrainMultiplier(state, c, p, 'fixedCost');
}

export function effectiveHeatCredit(state: GameState, p: Pick<ProductState, 'sectorId'> & Partial<ProductState>): number {
  return isSpatialMap(state.config) ? heatCredit(p.sectorId, p.hexId ?? capitalCellId(state.config)) * terrainPlantMultiplier(state, p, 'heat') : 0;
}

export function effectivePerishability(state: GameState, p: ProductState): number {
  return clamp(SECTORS[p.sectorId].perishability * terrainPlantMultiplier(state, p, 'perishability'), 0, 1);
}

/**
 * Effets de la dotation encore en cours ce trimestre, selon leur durée propre (les suspensions passagères des nouvelles
 * locales ne comptent pas : le privilège reprend après). Les effets de siège ne valent que pour l'entreprise dont c'est
 * le terrain (`activeSeatTerrain`) : après une fusion, l'acheteur garde l'usine mais pas le siège du terrain absorbé.
 */
export function runningTerrainEffects(state: GameState, terrain: TerrainDef, company?: CompanyState): { headquarters: boolean; factory: boolean } {
  const running = terrain.effects.filter((e) => e.turns === undefined || state.turn <= e.turns);
  const seat = !!company && activeSeatTerrain(state, company)?.id === terrain.id;
  return {
    headquarters: seat && running.some((e) => e.lever === 'tax' || e.lever === 'scandal'),
    factory: running.some((e) => e.lever !== 'tax' && e.lever !== 'scandal'),
  };
}

/** L'effacement explicite empêche de récupérer une dotation en revenant sur une case abandonnée. */
export function revokeTerrain(_state: GameState, c: CompanyState, p?: ProductState): void {
  const id = p?.terrainId;
  if (!p || c.terrainId === id) delete c.terrainId;
  if (p) delete p.terrainId;
  else for (const q of c.products) delete q.terrainId;
}
