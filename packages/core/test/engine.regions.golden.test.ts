import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAction, createGame, resolveTurn } from '../src/engine';
import { setBotZoneMode } from '../src/sim/bots';
import type { Action, BotLevel, GameState } from '../src/types';
import { bots, config, human, npcCompanies, snapshot } from './helpers';

/**
 * Marchés régionaux (§5.2 bis) : référence déterministe des parties épinglées à la capitale. La demande garde
 * l'arithmétique nationale, les coûts et prix suivent les règles économiques courantes. Empreintes initialement
 * relevées sur 3ed68c9 ; chaque changement voulu de simulation est documenté et rebasé ci-dessous.
 * Rebasées intentionnellement pour la bulle crypto, le transport intangible et la récupération à l'arrêt
 * (octobre 2026) : les règles classique et hexagonale changent, les stagiaires gardent leur stratégie.
 * Rebasées à nouveau pour la croissance nette des nouvelles, l'élasticité crypto 1,5, le momentum des prix
 * et la récupération non imposable avec sorties expert en valeur finale (revue crypto d'octobre 2026).
 * Rebasées pour la réponse de marché au prix, le risque de crash au niveau du prix et les prévisions
 * crypto cohérentes entre produits (tâche 28). Les secteurs physiques gardent une élasticité de marché nulle.
 * Rebasées intentionnellement pour les tempéraments sectoriels, les élasticités de marché physiques,
 * les stratégies sectorielles des bots et le calibrage économique classique/hexagonal (tâche 27).
 * La tâche 27b corrige les lignes sans offre, le pilotage normal sous coût et la fréquence des krachs.
 * La tâche 29 rebase les réglages d'ouverture et les IPO sur l'économie de chaque secteur, renforce
 * l'obsolescence relative, et distingue les nouvelles crypto négatives du délai entre deux krachs.
 * Les règles classique et hexagonale ainsi que leurs références de simulation changent volontairement.
 * Rebasées pour le dump crypto des bots (ventes et fermetures sur signaux publics), le registre
 * des ventes d'actions (`shareSales`) et les brèves « délit d'initié » au krach (octobre 2026).
 * Rebasées pour la revue du dump : plancher de contrôle des ventes expert, envolée mesurée contre
 * la tendance propre, registre enrichi (`hadCryptoLine`, `shareBuys`), ventes forcées exclues.
 * Vérifiées au passage au fret au poids et au bonus « fabriqué ici » (octobre 2026) : les quatre
 * empreintes étaient inchangées : la proximité à la capitale vaut 1 partout.
 * Rebasées intentionnellement pour le fret absolu (tâche 39) : les usines à la capitale paient leurs
 * livraisons et les trajets des filiales, les prix de référence physiques incluent la livraison standard.
 * Les réglages d’ouverture comptent cette livraison et les rapports gardent le détail effectivement payé.
 * Après un changement voulu (paquet de nouvelles, réglages, bots), relever les nouvelles empreintes avec
 * GOLDEN_PRINT=1 npx vitest run packages/core/test/engine.regions.golden.test.ts, et le dire dans le message de commit.
 */
const GOLDEN: Record<BotLevel | 'scripted', string> = {
  intern: '8cc55518cd3bf39fb4dd3abf399a2d21edb8eb933e961b4af80c20fa9796eeae',
  normal: '66ed594bb3aa57cb9a83f3289639cb6dbe6d5b71d33061f7c76cf0466729a8b9',
  expert: '6742fbaa3fbcd7fbb419b11c0126ad7069ed2a98644feaf802878624658d98ed',
  scripted: 'b9b27b962f6562d18355e4c8adb756610413b89c9595693ae4773c455deb775b',
};

/** Display-only close snapshots and historical sales positions do not belong to the economic golden. */
function economicSnapshot(state: GameState): string {
  const copy = JSON.parse(snapshot(state)) as GameState;
  for (const player of Object.values(copy.players)) {
    delete player.closeRecap;
    delete player.quarterPersonalCosts;
    delete player.quarterPersonalCostDetails;
    delete player.openingFortuneSnapshot;
  }
  // The only new product metadata excluded here; all prices, decisions, results and positions remain hashed.
  for (const company of Object.values(copy.companies)) for (const product of company.products) delete product.lastSalesOrigin;
  // Freight snapshots and settled splits are derived display metadata; the billed total stays in the golden.
  for (const company of Object.values(copy.companies)) for (const report of company.reports) for (const product of report.products) {
    delete product.freight;
    delete product.transportMaterials;
    delete product.transportDelivery;
    // Frozen close-window figures only duplicate the quarter's economic results above.
    delete product.demand;
    delete product.averagePrice;
    delete product.margin;
    delete product.stockLeft;
    delete product.spoiled;
  }
  return snapshot(copy);
}

function pinned(level: BotLevel): string {
  const h = createHash('sha256');
  for (let seed = 1; seed <= 6; seed++) {
    const s = createGame({ ...config(seed, 16), botLevel: level }, [human('h1', 'yogurts'), ...bots(4 + (seed % 3))]);
    while (s.phase === 'playing') resolveTurn(s);
    h.update(economicSnapshot(s));
  }
  return h.digest('hex');
}

/** La partie scriptée du test de déterminisme (un humain actif, un humain inactif, quatre bots). */
function scripted(): string {
  const s = createGame(config(42, 10), [human('h1'), human('h2', 'gadgets'), ...bots(4)]);
  while (s.phase === 'playing') {
    // A fixed-price scripted firm may fail or lose control under the new market rules.
    // Keep observing the complete deterministic game after it can no longer act.
    const me = Object.values(s.companies).find((c) => c.founderId === 'h1'
      && c.status === 'active' && c.controllerId === 'h1');
    const npc = npcCompanies(s)[0];
    const p = me?.products[0];
    const actions: Action[] = [];
    if (me && p) {
      actions.push({ type: 'setProductDecisions', companyId: me.id, productId: p.id, price: 105 + s.turn, production: p.capacity, marketing: 400, rnd: 300 });
      if (s.turn % 3 === 0) actions.push({ type: 'expandCapacity', companyId: me.id, productId: p.id, lots: 5 });
    }
    if (me) actions.push({ type: 'buyCommodity', companyId: me.id, commodityId: 'sugar', lots: 20 });
    if (npc) actions.push({ type: 'buyShares', companyId: npc.id, shares: 50 });
    for (const a of actions) applyAction(s, 'h1', a);
    resolveTurn(s);
  }
  return createHash('sha256').update(economicSnapshot(s)).digest('hex');
}

beforeAll(() => setBotZoneMode('capital'));
afterAll(() => setBotZoneMode('market'));

describe('marchés régionaux : toutes les usines à la capitale, référence déterministe courante', () => {
  for (const level of ['intern', 'normal', 'expert'] as const) {
    it(`bots ${level}`, () => {
      const got = pinned(level);
      if (process.env.GOLDEN_PRINT) console.log(`GOLDEN ${level} ${got}`);
      expect(got).toBe(GOLDEN[level]);
    }, 60_000);
  }
  it('partie scriptée', () => {
    const got = scripted();
    if (process.env.GOLDEN_PRINT) console.log(`GOLDEN scripted ${got}`);
    expect(got).toBe(GOLDEN.scripted);
  });
});
