import { describe, expect, it } from 'vitest';
import type { CompanyView } from '@muchomoney/core';
import { COMMODITIES, COMMODITY_CAP_RATIO } from '@muchomoney/core';
import {
  canFoundStartup,
  espionageGains,
  floatMinBuyMax,
  floatMinBuybackMax,
  maxProductsOf,
  startupInitialPrice,
  STARTUP_SUBSIDY,
  buybackRivalTakeover,
  commodityPriceAfter,
  insiderScandal,
  maxAffordableLots,
  maxSellableLots,
  mergeRivalTakeover,
  safeBuybackMax,
  scandalRisk,
} from '../src/rules';
import { breachesFloatMin, maxBuybackShares, scandalProbability } from '../../core/src/sim/finance';

function company(p: Partial<CompanyView>): CompanyView {
  return { sharesOutstanding: 10_000, holdings: {}, floatShares: 0, sharePrice: 10, ...p } as CompanyView;
}

describe('rachat d’actions : contrôle offert à un rival', () => {
  // H contrôle avec 40 %, R détient 48 %, flottant 1 200 (cas reproduit sur le moteur).
  const c = company({ holdings: { h: 4_000, r: 4_800 }, floatShares: 1_200, controllerId: 'h' });

  it('signale le rival qui passerait au-dessus de 50 %', () => {
    const risk = buybackRivalTakeover(c, 'h', 1_000);
    expect(risk?.id).toBe('r');
    expect(risk?.pct).toBeCloseTo(4_800 / 9_000);
    expect(buybackRivalTakeover(c, 'h', 300)).toBeNull();
  });

  it('plafonne le rachat « sûr » à S − 2 × plus gros rival', () => {
    expect(safeBuybackMax(c, 'h')).toBe(400);
    expect(buybackRivalTakeover(c, 'h', 400)).toBeNull(); // 4 800 / 9 600 = 50 % pile : pas de prise de contrôle
    expect(buybackRivalTakeover(c, 'h', 401)?.id).toBe('r');
  });
});

describe('fusion : projection des avoirs', () => {
  it('avertit si un tiers dépasse 50 % de l’ensemble fusionné', () => {
    const absorber = company({ holdings: { me: 5_100, r: 1_000 }, floatShares: 3_900, sharePrice: 10 });
    const target = company({ holdings: { me: 5_100, r: 4_800 }, floatShares: 100, sharePrice: 40 });
    // parité 4 : r = 1 000 + 19 200 = 20 200 sur 10 000 + 20 400 + 19 200 + 400 = 50 000 → 40,4 %
    expect(mergeRivalTakeover(absorber, target, 'me')).toBeNull();
    const t2 = company({ holdings: { me: 1_000, r: 8_900 }, floatShares: 100, sharePrice: 40 });
    const risk = mergeRivalTakeover(absorber, t2, 'me');
    expect(risk?.id).toBe('r');
    expect(risk!.pct).toBeGreaterThan(0.5);
  });
});

describe('matières : plafonds de liquidité et de prix', () => {
  const id = Object.keys(COMMODITIES)[0] as keyof typeof COMMODITIES;
  const def = COMMODITIES[id];

  it('le max d’achat ne dépasse jamais la liquidité (le moteur refuserait)', () => {
    expect(maxAffordableLots(id, def.basePrice, 1e9)).toBe(def.liquidity);
    expect(maxAffordableLots(id, def.basePrice, 1)).toBeLessThan(def.liquidity);
  });

  it('le max de vente est borné par la liquidité', () => {
    expect(maxSellableLots(id, def.liquidity * 3 + 0.7)).toBe(def.liquidity);
    expect(maxSellableLots(id, 12.9)).toBe(12);
  });

  it('la vente suit la tolérance du moteur sans arrondir un vrai reliquat', () => {
    expect(maxSellableLots(id, 7 - 19 * 0.3 - 1 * 0.3)).toBe(1);
    expect(maxSellableLots(id, 1 - 0.5e-6)).toBe(1);
    expect(maxSellableLots(id, 1 - 2e-6)).toBe(0);
    expect(maxSellableLots(id, 0.9)).toBe(0);
    expect(maxSellableLots(id, 0)).toBe(0);
  });

  it('le prix après achat est plafonné comme dans le moteur', () => {
    const cap = def.basePrice * COMMODITY_CAP_RATIO;
    expect(commodityPriceAfter(id, cap * 0.95, def.liquidity, 'buy')).toBe(cap);
  });
});

describe('estimations des règles d’équilibrage (lot 1)', () => {
  it('le risque de scandale affiché suit exactement la formule du moteur', () => {
    for (const x of [0, 5, 10, 15, 20, 30, 42, 55, 60, 80, 100, 120]) expect(scandalRisk(x)).toBeCloseTo(scandalProbability(x), 12);
    expect(scandalRisk(10)).toBe(0);
    expect(scandalRisk(20)).toBeGreaterThan(0);
  });

  it('délit d’initié : +1 de jauge par 1 % du capital acheté', () => {
    expect(insiderScandal(500, 10_000)).toBeCloseTo(5, 12);
    expect(insiderScandal(0, 10_000)).toBe(0);
    expect(insiderScandal(10, 0)).toBe(0);
  });
});

describe('règles du lot 2 (prévisualisations alignées sur le moteur)', () => {
  it('flottant minimal : achat perso max = plus gros achat que le moteur accepte', () => {
    for (const S of [10_000, 12_345]) {
      for (const held of [0, 1_000, 4_000, 5_001, 6_500]) {
        for (const float of [0, 500, 2_000, 3_000, 4_500, S - held]) {
          if (held + float > S) continue;
          const max = floatMinBuyMax(held, float, S);
          let brute = 0;
          for (let n = 0; n <= float; n++) if (!breachesFloatMin(held + n, float - n, S)) brute = n;
          expect(max, `S=${S} held=${held} float=${float}`).toBe(brute);
        }
      }
    }
  });

  it('flottant minimal : rachat max identique au moteur', () => {
    const cases = [
      { holdings: { h: 5_500 }, floatShares: 4_500 },
      { holdings: { h: 4_000, r: 2_000 }, floatShares: 4_000 },
      { holdings: { h: 6_900 }, floatShares: 3_100 },
    ];
    for (const cs of cases) {
      const c = company({ ...cs, sharesOutstanding: 10_000 });
      const engine = maxBuybackShares({ holdings: cs.holdings, sharesOutstanding: 10_000 } as never, 1e9);
      expect(floatMinBuybackMax(c)).toBe(engine);
    }
  });

  it('espionnage : rien à copier si l’on est déjà devant la cible', () => {
    const mine = company({ id: 'a', status: 'active', products: [{ id: 'p', name: 'P', sectorId: 'yogurts', quality: 1.2 }] } as never);
    const weak = company({ id: 'b', status: 'active', products: [{ id: 'q', sectorId: 'yogurts', quality: 1.0 }] } as never);
    const strong = company({ id: 'c', status: 'active', products: [{ id: 'r', sectorId: 'yogurts', quality: 2.2 }] } as never);
    const all = [mine, weak, strong];
    expect(espionageGains(mine, all, 'b')).toEqual([]);
    const g = espionageGains(mine, all, 'c');
    expect(g).toHaveLength(1);
    expect(g[0].gain).toBeCloseTo(0.3, 9);
    expect(espionageGains(mine, all).length).toBe(1);
  });

  it('start-up réservée au joueur sans entreprise ; subvention = parachute ; 6 produits après fusion', () => {
    const cos = [company({ controllerId: 'a', status: 'active' }), company({ controllerId: 'b', status: 'bankrupt' })];
    expect(canFoundStartup(cos, 'a')).toBe(false);
    expect(canFoundStartup(cos, 'b')).toBe(true);
    expect(startupInitialPrice(1_500)).toBeCloseTo((1_500 + STARTUP_SUBSIDY) / 10_000, 9);
    expect(startupInitialPrice(1_500, 2_000)).toBeCloseTo(0.35, 9);
    expect(maxProductsOf(company({}))).toBe(4);
    expect(maxProductsOf(company({ maxProducts: 6 }))).toBe(6);
  });
});

describe('impact de prix exponentiel : le client suit le moteur (§5.5, §6.2)', () => {
  it('actions : coût, produit et cours après identiques au moteur ; le max achetable est payable', async () => {
    const { shareBuyQuote, shareSellQuote } = await import('../../core/src/sim/market');
    const { maxAffordableShares, shareBuyCost, sharePriceAfter, shareSellProceeds } = await import('../src/rules');
    const c = { sharesOutstanding: 10_000, sharePrice: 3.7 } as Parameters<typeof shareBuyQuote>[0];
    for (const n of [1, 250, 3_000, 9_000]) {
      expect(shareBuyCost(3.7, n, 10_000)).toBeCloseTo(shareBuyQuote(c, n).total, 9);
      expect(shareSellProceeds(3.7, n, 10_000)).toBeCloseTo(shareSellQuote(c, n).total, 9);
      expect(sharePriceAfter(3.7, n, 10_000, 'buy')).toBeCloseTo(shareBuyQuote(c, n).newPrice, 9);
      expect(sharePriceAfter(3.7, n, 10_000, 'sell')).toBeCloseTo(shareSellQuote(c, n).newPrice, 9);
    }
    const n = maxAffordableShares(3.7, 10_000, 5_000, 10_000);
    expect(shareBuyQuote(c, n).total).toBeLessThanOrEqual(5_000);
    expect(shareBuyQuote(c, n + 20).total).toBeGreaterThan(5_000);
  });

  it('matières : coût, produit et cours après identiques au moteur, plancher et plafond compris', async () => {
    const { commodityBuyQuote, commoditySellQuote } = await import('../../core/src/sim/market');
    const { commodityBuyCost, commoditySellProceeds } = await import('../src/rules');
    for (const id of ['oil', 'sugar'] as const) {
      const def = COMMODITIES[id];
      for (const price of [def.basePrice * 0.25, def.basePrice, def.basePrice * 9]) {
        const state = { commodities: { [id]: { price } } } as unknown as Parameters<typeof commodityBuyQuote>[0];
        for (const n of [1, Math.round(def.liquidity / 3), def.liquidity]) {
          expect(commodityBuyCost(id, price, n)).toBeCloseTo(commodityBuyQuote(state, id, n).total, 6);
          expect(commoditySellProceeds(id, price, n)).toBeCloseTo(commoditySellQuote(state, id, n).total, 6);
          expect(commodityPriceAfter(id, price, n, 'buy')).toBeCloseTo(commodityBuyQuote(state, id, n).newPrice, 9);
          expect(commodityPriceAfter(id, price, n, 'sell')).toBeCloseTo(commoditySellQuote(state, id, n).newPrice, 9);
        }
      }
      const lots = maxAffordableLots(id, def.basePrice, 5_000);
      const state = { commodities: { [id]: { price: def.basePrice } } } as unknown as Parameters<typeof commodityBuyQuote>[0];
      expect(commodityBuyQuote(state, id, lots).total).toBeLessThanOrEqual(5_000);
    }
  });

  it('start-up refusée le trimestre où l’on a cédé le contrôle en vendant', () => {
    const cos = [company({ controllerId: null, status: 'active' })];
    expect(canFoundStartup(cos, 'a')).toBe(true);
    expect(canFoundStartup(cos, 'a', ['c1'])).toBe(false);
  });
});
