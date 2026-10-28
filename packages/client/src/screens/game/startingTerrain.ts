/**
 * Terrain de départ (§5.8 ter) : puces d'effets du salon, et en partie le terrain qu'une de MES usines occupe
 * encore, avec ses effets en une ligne et ce qu'un déménagement en perdrait. Les effets reçus viennent de la vue
 * privée du produit, lue par `city/privacy.ts` ; la durée des effets temporaires vient des définitions publiques
 * (`TERRAINS`), le moteur ne la transmettant pas.
 */
import { TERRAINS, heatCredit, type CompanyView, type PlayerView, type ProductView, type TerrainEffect, type TerrainView } from '@muchomoney/core';
import type { Messages } from '../../i18n';
import type { Fmt } from '../../fmt';
import { ownProduct } from './city/privacy';

/** Texte d'une puce d'effet, dans la langue de `t` ; null pour les leviers sans puce. */
export function terrainFxLabel(t: Messages, fmt: Fmt, fx: TerrainEffect): string | null {
  const fxt = t.lobby.terrainFx;
  const signed = (mult: number) => fmt.signedPct(mult - 1, 0).replace('-', '−');
  switch (fx.lever) {
    case 'marketing':
      return fx.mult == null ? null : fxt.marketing(fmt.num(fx.mult));
    case 'rnd':
      return fx.mult == null ? null : fxt.rnd(fmt.num(fx.mult));
    case 'scandal':
      return fx.mult == null ? null : fxt.scandal(fmt.num(fx.mult));
    case 'perishability':
      return fx.mult == null ? null : fxt.perishability(fmt.num(1 / fx.mult));
    case 'labor':
      if (fx.mult == null) return null;
      return fx.turns == null ? fxt.labor(signed(fx.mult)) : fxt.laborTurns(signed(fx.mult), String(fx.turns));
    case 'tax':
      return fx.rate == null ? null : fxt.tax(fmt.pct(fx.rate, 0));
    case 'perceivedPrice':
      return fx.mult == null ? null : fxt.perceivedPrice(signed(fx.mult));
    case 'salvage':
      return fx.rate == null ? null : fxt.salvage(fmt.pct(fx.rate, 0));
    case 'fixedCost':
      return fx.mult == null ? null : fxt.fixedCost(signed(fx.mult));
    case 'demand':
      return fx.mult == null ? null : fxt.demand(signed(fx.mult));
    default:
      return null;
  }
}

export interface StartingTerrainEffect {
  fx: TerrainEffect;
  /** Trimestres restants, celui-ci compris, d'un effet temporaire de la dotation ; null sinon. */
  left: number | null;
}

export interface StartingTerrain {
  terrain: TerrainView;
  /** Le produit dont l'usine occupe encore la case du terrain. */
  productId: string;
  /** Effets en vigueur ce trimestre (nouvelles locales comprises) ; vide pendant une suspension. */
  effects: StartingTerrainEffect[];
}

/**
 * Terrain de départ encore actif sous l'usine de ce produit, pour une entreprise que je dirige ; null sinon, ou
 * quand la dotation a fini de produire ses effets. La chaleur n'est jamais une dotation ; un impôt qui ne bat plus
 * le taux national (privilège suspendu) n'en est plus un. Le moteur fond aussi dans le levier « demande » les
 * nouvelles de chaleur, qui suivent un produit crypto sur toute case chauffée : faute de pouvoir les séparer d'une
 * nouvelle locale du terrain, la demande n'est pas listée quand elle peut en venir (aucune dotation n'en porte).
 */
export function startingTerrainAt(view: PlayerView, company: CompanyView, product: ProductView): StartingTerrain | null {
  const terrain = view.terrains?.find((ter) => ter.active && ter.companyId === company.id && ter.hex === product.hexId);
  const own = ownProduct(product);
  if (!terrain || !own) return null;
  const grant = TERRAINS.find((def) => def.id === terrain.id)?.effects ?? [];
  const taxPerk = company.taxRate !== undefined && company.taxRate < view.taxRate;
  const heatDemand = !grant.some((g) => g.lever === 'demand') && heatCredit(product.sectorId, terrain.hex) > 0;
  // Dans l'ordre de la dotation (celui des puces du salon), les leviers des seules nouvelles locales ensuite.
  const rank = (fx: TerrainEffect) => {
    const i = grant.findIndex((g) => g.lever === fx.lever);
    return i < 0 ? grant.length : i;
  };
  const effects = (own.terrainEffects ?? [])
    .filter((fx) => fx.lever !== 'heat' && (fx.lever !== 'tax' || taxPerk) && (fx.lever !== 'demand' || !heatDemand))
    .sort((a, b) => rank(a) - rank(b))
    .map((fx) => {
      // `turns` : dernier trimestre où l'effet de la dotation s'applique (moteur : turn <= turns).
      const turns = grant.find((g) => g.lever === fx.lever)?.turns;
      return { fx, left: turns !== undefined && turns >= view.turn ? turns - view.turn + 1 : null };
    });
  const running = terrain.runningEffects.headquarters || terrain.runningEffects.factory;
  return running || effects.length > 0 ? { terrain, productId: product.id, effects } : null;
}

/** Les terrains de départ actifs de l'entreprise (deux après une fusion, chacun sous son usine). */
export function activeStartingTerrains(view: PlayerView, company: CompanyView): StartingTerrain[] {
  return company.products.flatMap((product) => {
    const found = startingTerrainAt(view, company, product);
    return found ? [found] : [];
  });
}

/**
 * Terrain de départ dont un déménagement de ce produit couperait des effets encore en cours (siège ou usine) ; null
 * sinon, et jamais pour un produit d'incubateur. Même règle pour l'avertissement du formulaire et la fiche de case.
 */
export function moveLeavesTerrain(view: PlayerView, company: CompanyView, product: ProductView): TerrainView | null {
  if (product.incubator) return null;
  const terrain = view.terrains?.find((candidate) => candidate.active && candidate.companyId === company.id && candidate.hex === product.hexId);
  return terrain && (terrain.runningEffects.headquarters || terrain.runningEffects.factory) ? terrain : null;
}

/** Ce qu'un déménagement quitterait, pour la fiche d'une case libre : le terrain, son premier effet en vigueur, s'il en a d'autres. */
export function moveTerrainLoss(t: Messages, fmt: Fmt, view: PlayerView, company: CompanyView, product: ProductView): { name: string; first: string | null; more: boolean } | null {
  const terrain = moveLeavesTerrain(view, company, product);
  if (!terrain) return null;
  const found = startingTerrainAt(view, company, product);
  const labels = found ? effectLabels(t, fmt, found) : [];
  return { name: terrain.name, first: labels[0] ?? null, more: labels.length > 1 };
}

/** Libellés des effets en vigueur : « main-d'œuvre −20 % (encore 3 trim.) » pour un effet temporaire. */
function effectLabels(t: Messages, fmt: Fmt, found: StartingTerrain): string[] {
  return found.effects.flatMap(({ fx, left }) => {
    // Sans `turns` : la durée restante remplace « pendant 8 trim. », qui ne vaut qu'au salon.
    const label = terrainFxLabel(t, fmt, { lever: fx.lever, mult: fx.mult, rate: fx.rate });
    if (!label) return [];
    return [left === null ? label : t.hex.terrainEffectLeft(label, left)];
  });
}

/** « impôt 0 % · scandales ×1,5 · main-d'œuvre −20 % (encore 3 trim.) », ou la suspension. */
export function startingTerrainEffectsText(t: Messages, fmt: Fmt, found: StartingTerrain): string {
  const labels = effectLabels(t, fmt, found);
  return labels.length > 0 ? labels.join(' · ') : t.hex.terrainSuspended;
}

/** Bulle de la puce de « Mon entreprise » : effets en vigueur (ou leur suspension), perte au déménagement, lien vers la carte. */
export function startingTerrainTip(t: Messages, fmt: Fmt, found: StartingTerrain, clickable: boolean): string {
  const labels = effectLabels(t, fmt, found);
  const parts = [labels.length > 0 ? t.hex.terrainInForce(labels.join(' · ')) : t.hex.terrainSuspendedTip, t.hex.terrainLostOnMove];
  if (clickable) parts.push(t.hex.terrainChipGo);
  return parts.join(' ');
}
