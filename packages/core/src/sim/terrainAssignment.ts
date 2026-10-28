/** Valeur des terrains et attribution max-min exacte (§5.8 ter), sans table de résultats préétablie. */
import { capitalCellId } from '../content/hexes';
import { boardTerrains } from '../content/boardTerrains';

import { getContent, SECTORS } from '../content';
import type { CompanyState, GameState, ProductState, SectorId, TerrainAssessment, TerrainDef } from '../types';
import { brandAfter, qualityAfter, marketInputs, estimateSales, LOCATION_PRICE_RATIOS } from './advice';
import { estimatedUnitCost, scandalProbability } from './finance';
import { companyTaxRate, effectiveFixedCost, terrainMultiplier } from './terrains';
import { next, shuffle } from './rng';
import { COMPANY_START_CASH, SCANDAL_FINE_BASE, SCANDAL_FINE_FLAT } from './constants';
import { tr } from './i18n';

// Hypothèses communes aux terrains : un stock de sécurité de 20 % de la production et une
// jauge de scandale de référence de 20. Le surcroît de scandale multiplie les amendes attendues
// (§6.3 du cahier) ; il ne prédit ni les décisions discutables, ni les futurs tirages de news.
const EXPECTED_STOCK_RATIO = 0.2;
const REFERENCE_SCANDAL = 20;
const EXPECTED_FINE = scandalProbability(REFERENCE_SCANDAL)
  * ((SCANDAL_FINE_BASE + REFERENCE_SCANDAL / 500) * COMPANY_START_CASH + SCANDAL_FINE_FLAT);

/**
 * Calage sur les parties simulées (lot 5, `tools/balance-lab/results/9-calage-lot5.md`) : écart, en k par trimestre,
 * entre ce que le modèle ci-dessous prévoit et ce que 420 parties en attribution au hasard ont mesuré (écart centré par
 * secteur, rétréci par n/(n+40)), gardé seulement là où les bots normaux et les bots experts se trompent dans le même
 * sens d'au moins 25 (moyenne des deux niveaux, arrondie à 5). L'île est bien pire que prévu pour la crypto, les
 * trottinettes et les boissons (scandales doublés, bac vers tout), un peu meilleure pour les yaourts ; les yaourts
 * souffrent des pistes de montagne mais aiment le front de mer ; les boissons ne tirent rien des drones des Faubourgs,
 * la crypto en tire plus que prévu. Le reste de l'écart tient aux secteurs eux-mêmes, pas aux terrains.
 */
export const TERRAIN_CALIBRATION: Readonly<Record<string, Partial<Record<SectorId, number>>>> = {
  'ile-aux-niches': { crypto: -95, scooters: -115, energy_drinks: -55, yogurts: 50 },
  'monts-defiscalises': { yogurts: -90 },
  'faubourgs-croissance': { energy_drinks: -65, crypto: 70 },
  'front-de-mer-saint-benefice': { yogurts: 40 },
};

/**
 * Marché commun isolé : joueurs à la capitale, PNJ sur leurs cases fixes, décisions initiales.
 * On projette chaque trimestre avec la croissance de la demande et les formules de qualité/notoriété,
 * avec et sans terrain. Les ventes sont plafonnées par la production et la capacité ; le stock attendu
 * ne crée pas de ventes supplémentaires. Aucun état partagé ni tirage aléatoire n'est modifié.
 */
export function terrainValues(state: GameState, company: CompanyState, product: ProductState, calibrated = true): Record<string, number> {
  const duration = Math.max(1, state.config.totalTurns);
  const project = (terrain?: TerrainDef): number => {
    const scenario: GameState = { ...state, turn: 1, activeEffects: [], companies: {} };
    for (const c of Object.values(state.companies)) scenario.companies[c.id] = {
      ...c, terrainId: undefined, modifiers: [],
      products: c.products.map((p) => ({ ...p, terrainId: undefined, pendingHexId: undefined,
        hexId: c.npcDefId ? p.hexId : capitalCellId(state.config) })),
    };
    const c = scenario.companies[company.id];
    const p = c.products.find((x) => x.id === product.id)!;
    // Le salon peut demander un secteur que ce joueur n'a pas encore choisi.
    Object.assign(p, product, { terrainId: terrain?.id, pendingHexId: undefined,
      hexId: terrain?.hex ?? capitalCellId(state.config), stock: 0 });
    c.terrainId = terrain?.id;
    const def = SECTORS[p.sectorId];
    const produced = Math.max(0, Math.floor(Math.min(p.production, p.capacity)));
    let total = 0;
    for (let turn = 1; turn <= duration; turn++) {
      scenario.turn = turn;
      const uc = estimatedUnitCost(scenario, c, p);
      const market = marketInputs(scenario, c, p, c.controllerId ?? '', uc);
      let margin = -Infinity;
      // Même fourchette de prix que hexValues, avec le plafond des ventes réellement possibles.
      for (const ratio of LOCATION_PRICE_RATIOS) {
        const price = def.refPrice * ratio;
        const sales = estimateSales(p.sectorId, market, { ...p, price }).sales;
        margin = Math.max(margin, sales * (price - uc));
      }
      const stockLoss = produced * EXPECTED_STOCK_RATIO * Math.max(0, uc) * def.perishability
        * terrainMultiplier(scenario, c, p, 'perishability');
      const fines = EXPECTED_FINE * terrainMultiplier(scenario, c, undefined, 'scandal');
      const profit = margin - effectiveFixedCost(scenario, p) - p.marketing - p.rnd - stockLoss - fines;
      total += profit - Math.max(0, profit) * companyTaxRate(scenario, c);
      // Les rivaux progressent aussi, sous leurs budgets ordinaires, dans les deux scénarios.
      for (const rival of Object.values(scenario.companies)) for (const q of rival.products) {
        q.quality = qualityAfter(q.sectorId, q.quality, q.rnd, terrainMultiplier(scenario, rival, q, 'rnd'));
        q.brand = brandAfter(q.sectorId, q.brand, q.marketing, terrainMultiplier(scenario, rival, q, 'marketing'));
      }
    }
    return total / duration;
  };
  const capitalNet = project();
  // These residuals were measured on the old hex geography, not on the square board.
  const useCalibration = calibrated && state.config.mapMode !== 'square';
  return Object.fromEntries(boardTerrains(state.config).map((terrain) => [
    terrain.id, project(terrain) - capitalNet + (useCalibration ? TERRAIN_CALIBRATION[terrain.id]?.[product.sectorId] ?? 0 : 0),
  ]));
}

export function assessTerrains(state: GameState, company: CompanyState, product: ProductState): Record<string, TerrainAssessment> {
  return Object.fromEntries(Object.entries(terrainValues(state, company, product)).map(([id, value]) => {
    const appreciation = value >= 100 ? 'very_good' : value >= 0 ? 'good' : value >= -100 ? 'average' : 'poor';
    return [id, { value, appreciation, label: tr(state).terrainAppreciation[appreciation] }];
  }));
}

/** Explore toutes les attributions injectives (au plus 8!) ; tire uniformément les égalités exactes. */
export function fairTerrainAssignment(state: GameState, rows: readonly Record<string, number>[], ids: readonly string[]): string[] {
  if (rows.length > ids.length) throw new Error('More players than starting terrains');
  if (rows.length === 0) return [];
  let bestMin = -Infinity, bestSpread = Infinity;
  let choices: string[][] = [];
  const current: string[] = [];
  const search = (index: number, used: number, min: number, max: number) => {
    if (index === rows.length) {
      const spread = max - min;
      if (min > bestMin || (min === bestMin && spread < bestSpread)) {
        bestMin = min; bestSpread = spread; choices = [current.slice()];
      } else if (min === bestMin && spread === bestSpread) choices.push(current.slice());
      return;
    }
    for (let j = 0; j < ids.length; j++) {
      if (used & (1 << j)) continue;
      const value = rows[index][ids[j]];
      if (!Number.isFinite(value)) throw new Error('Non-finite terrain valuation');
      const floor = Math.min(min, value);
      if (floor < bestMin) continue;
      current.push(ids[j]); search(index + 1, used | (1 << j), floor, Math.max(max, value)); current.pop();
    }
  };
  search(0, 0, Infinity, -Infinity);
  return choices.length === 1 ? choices[0] : choices[Math.floor(next(state) * choices.length)];
}

/** Tire uniformément parmi les injections à 20 k au plus du meilleur minimum, sans objectif d'écart. */
export function variedTerrainAssignment(state: GameState, rows: readonly Record<string, number>[], ids: readonly string[]): string[] {
  if (rows.length > ids.length) throw new Error('More players than starting terrains');
  if (rows.length === 0) return [];
  let bestMin = -Infinity;
  const candidates: { ids: string[]; floor: number }[] = [];
  const current: string[] = [];
  const search = (index: number, used: number, min: number) => {
    if (index === rows.length) {
      bestMin = Math.max(bestMin, min);
      candidates.push({ ids: current.slice(), floor: min });
      return;
    }
    for (let j = 0; j < ids.length; j++) {
      if (used & (1 << j)) continue;
      const value = rows[index][ids[j]];
      if (!Number.isFinite(value)) throw new Error('Non-finite terrain valuation');
      const floor = Math.min(min, value);
      if (floor < bestMin - 20) continue;
      current.push(ids[j]); search(index + 1, used | (1 << j), floor); current.pop();
    }
  };
  search(0, 0, Infinity);
  // Le meilleur minimum a pu monter après l'enregistrement des premières candidates.
  const choices = candidates.filter((candidate) => candidate.floor >= bestMin - 20);
  return choices.length === 1 ? choices[0].ids : choices[Math.floor(next(state) * choices.length)].ids;
}

export function assignStartingTerrains(state: GameState): void {
  const defs = boardTerrains(state.config);
  const companies = Object.values(state.companies).filter((c) => !c.npcDefId && c.founderId !== null);
  if (companies.length > defs.length) throw new Error('More players than starting terrains');
  const mode = state.config.terrainAssignment ?? 'fair';
  let chosen: string[];
  if (mode === 'host' || mode === 'choice') {
    const entries = Object.entries(state.config.terrains ?? {});
    if (entries.some(([id]) => !companies.some((c) => c.founderId === id))) {
      throw new Error('Host terrain assignment contains an unknown player');
    }
    if (new Set(entries.map(([, id]) => id)).size !== entries.length
      || entries.some(([, id]) => !defs.some((t) => t.id === id))) {
      throw new Error('Host terrain assignments must use distinct valid terrains');
    }
    const placements = { ...state.config.terrains };
    const reserved = new Set(entries.map(([, id]) => id));
    if (mode === 'choice') {
      for (const c of companies) {
        if (!state.players[c.founderId!].isBot || placements[c.founderId!] !== undefined) continue;
        const values = terrainValues(state, c, c.products[0]);
        let best: string | undefined;
        for (const terrain of defs) {
          if (!reserved.has(terrain.id) && (best === undefined || values[terrain.id] > values[best])) best = terrain.id;
        }
        placements[c.founderId!] = best!;
        reserved.add(best!);
      }
    }
    const missing = companies.filter((c) => placements[c.founderId!] === undefined);
    const automatic = fairTerrainAssignment(state, missing.map((c) => terrainValues(state, c, c.products[0])),
      defs.map((t) => t.id).filter((id) => !reserved.has(id)));
    let nextAutomatic = 0;
    chosen = companies.map((c) => placements[c.founderId!] ?? automatic[nextAutomatic++]);
  } else if (mode === 'random') chosen = shuffle(state, defs.map((t) => t.id)).slice(0, companies.length);
  else {
    const rows = companies.map((c) => terrainValues(state, c, c.products[0]));
    chosen = mode === 'fair_varied' ? variedTerrainAssignment(state, rows, defs.map((t) => t.id))
      : fairTerrainAssignment(state, rows, defs.map((t) => t.id));
  }
  state.terrainAssignments = {};
  companies.forEach((c, i) => {
    const terrain = defs.find((t) => t.id === chosen[i]) as TerrainDef;
    const p = c.products[0];
    p.hexId = terrain.hex; p.terrainId = terrain.id; c.terrainId = terrain.id;
    state.terrainAssignments![terrain.id] = { companyId: c.id, playerId: c.founderId!, productId: p.id };
  });
}
