import { describe, expect, it } from 'vitest';
import { createGame, getPlayerView } from '../src/engine';
import { TERRAINS } from '../src/content';
import { runningTerrainEffects } from '../src/sim/terrains';
import { companyOf, config, human } from './helpers';

/** Partie hex d'un seul joueur, dont l'entreprise occupe la dotation demandée. */
function atTerrain(id: string) {
  const state = createGame({ ...config(31), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: id } }, [human('a')]);
  return { state, company: companyOf(state, 'a') };
}

/** Tuile de la vue joueur correspondant à une dotation. */
function cell(state: ReturnType<typeof atTerrain>['state'], id: string) {
  return getPlayerView(state, 'a').terrains!.find((t) => t.id === id)!;
}

describe('runningEffects des terrains', () => {
  it('un effet usine illimité reste en cours, sans effet siège', () => {
    const { state } = atTerrain('plaine-aux-subventions');
    const terrain = TERRAINS.find((t) => t.id === 'plaine-aux-subventions')!;
    expect(runningTerrainEffects(state, terrain, companyOf(state, 'a'))).toEqual({ headquarters: false, factory: true });
    const vue = cell(state, terrain.id);
    expect(vue.active).toBe(true);
    expect(vue.runningEffects).toEqual({ headquarters: false, factory: true });
  });

  it('un terrain mixte (siège + usine) signale les deux effets en cours', () => {
    const { state } = atTerrain('monts-defiscalises'); // impôt 5 % + main-d'œuvre −10 %
    const vue = cell(state, 'monts-defiscalises');
    expect(vue.active).toBe(true);
    expect(vue.runningEffects).toEqual({ headquarters: true, factory: true });
  });

  it('l\'île signale siège et usine : zéro impôt et scandale pour le siège, prix perçus et revente pour l\'usine', () => {
    const { state } = atTerrain('ile-aux-niches');
    const vue = cell(state, 'ile-aux-niches');
    expect(vue.runningEffects).toEqual({ headquarters: true, factory: true });
  });

  it('la dotation des Portes de Petit-Rabais s\'éteint après 8 trimestres sans désactiver le terrain', () => {
    const { state } = atTerrain('portes-petit-rabais');
    // Fenêtre propre à la dotation : main-d'œuvre −20 % tant que state.turn <= 8.
    expect(cell(state, 'portes-petit-rabais').runningEffects).toEqual({ headquarters: false, factory: true });
    state.turn = 8;
    expect(cell(state, 'portes-petit-rabais').runningEffects).toEqual({ headquarters: false, factory: true });
    state.turn = 9;
    // L'usine de départ est toujours sur la case : le terrain reste actif, mais l'exonération a expiré.
    const vue = cell(state, 'portes-petit-rabais');
    expect(vue.active).toBe(true);
    expect(vue.runningEffects).toEqual({ headquarters: false, factory: false });
  });

  it('après une fusion, le siège du terrain absorbé ne compte plus', () => {
    const { state, company } = atTerrain('monts-defiscalises');
    expect(cell(state, 'monts-defiscalises').runningEffects).toEqual({ headquarters: true, factory: true });
    // L'acheteur d'une fusion garde son propre terrain de siège : l'usine absorbée garde ses effets d'usine seulement.
    company.terrainId = 'quai-port-dividende';
    expect(cell(state, 'monts-defiscalises').runningEffects).toEqual({ headquarters: false, factory: true });
  });

  it('un terrain sans usine dessus ne signale aucun effet en cours', () => {
    const { state } = atTerrain('plaine-aux-subventions');
    for (const t of getPlayerView(state, 'a').terrains!.filter((t) => t.id !== 'plaine-aux-subventions')) {
      expect(t.active).toBe(false);
      expect(t.runningEffects).toEqual({ headquarters: false, factory: false });
    }
  });

  it('la vue redigée d\'un joueur tiers expose les drapeaux de tous les terrains', () => {
    const state = createGame({ ...config(7), mapMode: 'hex', terrainAssignment: 'host',
      terrains: { a: 'ile-aux-niches', b: 'quai-port-dividende' } }, [human('a'), human('b')]);
    const view = getPlayerView(state, 'b'); // b ne contrôle pas l'île : données publiques seulement
    const island = view.terrains!.find((t) => t.id === 'ile-aux-niches')!;
    expect(island.companyId).toBe(companyOf(state, 'a').id);
    expect(island.runningEffects).toEqual({ headquarters: true, factory: true });
    const quay = view.terrains!.find((t) => t.id === 'quai-port-dividende')!;
    expect(quay.runningEffects).toEqual({ headquarters: false, factory: true });
    expect(view.terrains!.every((t) => typeof t.runningEffects.headquarters === 'boolean' && typeof t.runningEffects.factory === 'boolean')).toBe(true);
  });
});
