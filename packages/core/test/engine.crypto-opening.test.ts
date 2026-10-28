import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { getPlayerView } from '../src/engine';
import {
  CRYPTO_CRASH_IDS, CRYPTO_MARKETING_BASELINE, CRYPTO_PRICE_BUBBLE_GAIN, CRYPTO_PRICE_MOMENTUM_GAIN,
  cryptoCrashProbability, scheduleCryptoNews, updateCryptoMarket,
} from '../src/sim/cryptoMarket';
import { marketSize } from '../src/sim/finance';
import { companyOf, human, newGame } from './helpers';

function quietOpening() {
  const state = newGame(21, [human('a', 'crypto'), human('b', 'crypto')]);
  state.activeEffects = [];
  state.sectors.crypto.lastTotalDemand = SECTORS.crypto.refDemand;
  state.sectors.crypto.demandHistory = [];
  state.sectors.crypto.lastMarketPriceMultiplier = 1;
  for (const c of Object.values(state.companies)) for (const p of c.products) p.lastSales = 0;
  state.openingCryptoPrice = 2.5 * SECTORS.crypto.refPrice;
  return state;
}

const ordinaryAdvertising = () => CRYPTO_MARKETING_BASELINE * marketSize('crypto');

describe('first realized crypto price observation', () => {
  it('records a public opening quote without a realized market or an opening crash rumor', () => {
    const state = newGame(21, [human('a', 'crypto'), human('b', 'crypto')]);
    const quotes = Object.values(state.companies).flatMap((c) => c.products)
      .filter((p) => p.sectorId === 'crypto').map((p) => p.lastPrice!);
    expect(state.openingCryptoPrice).toBeGreaterThanOrEqual(Math.min(...quotes));
    expect(state.openingCryptoPrice).toBeLessThanOrEqual(Math.max(...quotes));
    expect(state.cryptoMarket).toBeUndefined();
    expect(state.rumorKeys?.[1]?.some((key) => CRYPTO_CRASH_IDS.some((id) => key === `news:${id}`))).toBe(false);
    const rng = state.rngState;
    expect(scheduleCryptoNews(state, 2)).toBeUndefined();
    expect(state.rngState).toBe(rng);
    expect(JSON.stringify(getPlayerView(state, 'a'))).not.toContain('openingCryptoPrice');
  });

  it('unchanged opening quotes cause no synthetic run-up, while the sold price still carries level risk', () => {
    const state = quietOpening();
    const quote = state.openingCryptoPrice!;
    const p = companyOf(state, 'a').products[0];
    p.lastPrice = quote;
    p.lastSales = 10;
    const rng = state.rngState;
    updateCryptoMarket(state, ordinaryAdvertising());
    expect(state.cryptoMarket!.momentum).toBeCloseTo(0, 12);
    expect(state.cryptoMarket!.bubble).toBeCloseTo(0, 12);
    expect(state.cryptoMarket!.lastAveragePrice).toBeCloseTo(quote, 12);
    expect(state.openingCryptoPrice).toBeUndefined();
    expect(cryptoCrashProbability(state)).toBeCloseTo(0.02 + 0.78 * Math.pow(0.75, 3), 12);
    expect(state.rngState).toBe(rng);
  });

  it('a real first-sale price increase retains its proportional price momentum and bubble gain', () => {
    const state = quietOpening();
    const p = companyOf(state, 'a').products[0];
    p.lastPrice = state.openingCryptoPrice! * 1.2;
    p.lastSales = 10;
    updateCryptoMarket(state, ordinaryAdvertising());
    expect(state.cryptoMarket!.momentum).toBeCloseTo(CRYPTO_PRICE_MOMENTUM_GAIN * 0.2, 12);
    expect(state.cryptoMarket!.bubble).toBeCloseTo(0.35 * CRYPTO_PRICE_BUBBLE_GAIN * 0.2, 12);
    expect(state.openingCryptoPrice).toBeUndefined();
  });

  it('unsold tags cannot create an observation or a crash; the pending quote survives until a sale', () => {
    const state = quietOpening();
    const quote = state.openingCryptoPrice!;
    for (const c of Object.values(state.companies)) for (const p of c.products) {
      if (p.sectorId === 'crypto') p.price = p.lastPrice = 100 * SECTORS.crypto.refPrice;
    }
    const rng = state.rngState;
    updateCryptoMarket(state, ordinaryAdvertising());
    expect(state.cryptoMarket!.lastAveragePrice).toBeUndefined();
    expect(state.cryptoMarket!.momentum).toBeCloseTo(0, 12);
    expect(state.cryptoMarket!.bubble).toBeCloseTo(0, 12);
    expect(state.openingCryptoPrice).toBe(quote);
    expect(cryptoCrashProbability(state)).toBe(0.02);
    expect(scheduleCryptoNews(state, 2)).toBeUndefined();
    expect(state.rngState).toBe(rng);
    const p = companyOf(state, 'a').products[0];
    p.lastPrice = quote;
    p.lastSales = 10;
    updateCryptoMarket(state, ordinaryAdvertising());
    expect(state.cryptoMarket!.momentum).toBeCloseTo(0, 12);
    expect(state.cryptoMarket!.lastAveragePrice).toBe(quote);
    expect(state.openingCryptoPrice).toBeUndefined();
  });

  it('keeps the reference fallback for legacy saves and gives realized history precedence over a pending quote', () => {
    const legacy = quietOpening();
    const quote = legacy.openingCryptoPrice!;
    delete legacy.openingCryptoPrice;
    const legacyProduct = companyOf(legacy, 'a').products[0];
    legacyProduct.lastPrice = quote;
    legacyProduct.lastSales = 10;
    updateCryptoMarket(legacy, ordinaryAdvertising());
    expect(legacy.cryptoMarket!.momentum).toBeCloseTo(CRYPTO_PRICE_MOMENTUM_GAIN, 12);
    expect(legacy.cryptoMarket!.bubble).toBeCloseTo(0.35 * CRYPTO_PRICE_BUBBLE_GAIN, 12);

    const resumed = quietOpening();
    const previousPrice = 2 * SECTORS.crypto.refPrice;
    resumed.cryptoMarket = { momentum: 0, bubble: 0, volatility: 0, lastGrowth: 0, cooldown: 0,
      lastAveragePrice: previousPrice, lastUnderlyingDemand: SECTORS.crypto.refDemand };
    updateCryptoMarket(resumed, ordinaryAdvertising());
    expect(resumed.cryptoMarket.lastAveragePrice).toBe(previousPrice);
    expect(resumed.openingCryptoPrice).toBe(quote);
    const p = companyOf(resumed, 'a').products[0];
    p.lastSales = 10;
    p.lastPrice = quote;
    updateCryptoMarket(resumed, ordinaryAdvertising());
    expect(resumed.cryptoMarket.momentum).toBeCloseTo(CRYPTO_PRICE_MOMENTUM_GAIN * 0.25, 12);
    expect(resumed.cryptoMarket.lastAveragePrice).toBe(quote);
    expect(resumed.openingCryptoPrice).toBeUndefined();
  });
});
