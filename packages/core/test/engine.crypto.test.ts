import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { getPlayerView, resolveTurn } from '../src/engine';
import { CRYPTO_CRASH_COOLDOWN_TURNS, CRYPTO_NEGATIVE_NEWS_BOOST_TURNS, CRYPTO_CRASH_IDS, CRYPTO_EUPHORIA_IDS, CRYPTO_EUPHORIA_SATURATION, CRYPTO_EUPHORIA_THRESHOLD, CRYPTO_MARKETING_BASELINE, CRYPTO_MARKETING_GAIN, CRYPTO_MARKETING_SURPLUS_MAX, CRYPTO_PRICE_BUBBLE_GAIN, CRYPTO_PRICE_MOMENTUM_GAIN, cryptoCrashProbability, cryptoEuphoriaMultiplier, cryptoEuphoriaNews, cryptoNewsCompatible, cryptoNewsWeight, preparedCryptoCard, scheduleCryptoNews, updateCryptoMarket } from '../src/sim/cryptoMarket';
import { marketSize } from '../src/sim/finance';
import { applyNewsCard, drawNews, findCard } from '../src/sim/news';
import { startTurn } from '../src/sim/turn';
import { companyOf, human, newGame, snapshot } from './helpers';

const market = (momentum = 1.5) => ({ momentum, bubble: 1, volatility: 0.3, lastGrowth: 0.1, cooldown: 0 });
const game = (seed = 1, turns = 8) => newGame(seed, [human('a', 'crypto'), human('b', 'crypto')], turns);

describe('hidden crypto sector bubble', () => {
  it('normalizes news with the same optional sector sensitivity as realized demand', () => {
    const sensitivity = SECTORS.crypto.newsSensitivity;
    try {
      SECTORS.crypto.newsSensitivity = 0.5;
      const s = game();
      s.activeEffects = [{ id: 'test-effect', kind: 'sectorDemand', sectorId: 'crypto', value: 2, turnsLeft: 1, newsId: 'test' }];
      s.sectors.crypto.lastTotalDemand = 100 * Math.sqrt(2);
      s.sectors.crypto.demandHistory = [100, s.sectors.crypto.lastTotalDemand];
      s.sectors.crypto.lastMarketPriceMultiplier = 1;
      s.cryptoMarket = { ...market(), lastUnderlyingDemand: 100 };
      updateCryptoMarket(s, 0);
      expect(s.cryptoMarket.lastUnderlyingDemand).toBeCloseTo(100, 12);
      expect(s.cryptoMarket.lastGrowth).toBeCloseTo(0, 12);
    } finally {
      if (sensitivity === undefined) delete SECTORS.crypto.newsSensitivity;
      else SECTORS.crypto.newsSensitivity = sensitivity;
    }
  });

  it('initializes old saves lazily and resolves them without non-finite values', () => {
    const s = game();
    expect(s.cryptoMarket).toBeUndefined();
    resolveTurn(s);
    expect(s.cryptoMarket).toBeDefined();
    delete s.cryptoMarket;
    resolveTurn(s);
    expect(Object.values(s.cryptoMarket!).every(Number.isFinite)).toBe(true);
  });

  it('uses underlying growth, decaying momentum, market-size marketing intensity and clamps', () => {
    const s = game();
    s.sectors.crypto.demandHistory = [100, 120];
    s.sectors.crypto.lastTotalDemand = 120;
    s.cryptoMarket = market(0.4);
    updateCryptoMarket(s, 240);
    expect(s.cryptoMarket.momentum).toBeCloseTo(0.62 * 0.4 + 0.9 * 0.2 + CRYPTO_MARKETING_GAIN * (240 / marketSize('crypto') - CRYPTO_MARKETING_BASELINE));
    s.sectors.crypto.demandHistory = [120, 120];
    const momentum = s.cryptoMarket.momentum;
    updateCryptoMarket(s, 0);
    expect(s.cryptoMarket.momentum).toBeCloseTo(momentum * 0.62 - CRYPTO_MARKETING_GAIN * CRYPTO_MARKETING_BASELINE);
    s.cryptoMarket.momentum = 1.5;
    s.sectors.crypto.lastTotalDemand = 240;
    updateCryptoMarket(s, 1e9);
    expect(s.cryptoMarket.momentum).toBe(1.5);
    s.cryptoMarket.momentum = -1e9;
    updateCryptoMarket(s, 0);
    expect(s.cryptoMarket.momentum).toBe(-0.6);
  });

  it('counts paid marketing rather than an unaffordable requested budget', () => {
    const s = game();
    for (const c of Object.values(s.companies)) for (const p of c.products) { p.marketing = 0; p.rnd = 0; }
    const a = companyOf(s, 'a');
    a.products[0].marketing = 1e8;
    // Sold-price momentum is tested separately; hold the whole sector here.
    for (const c of Object.values(s.companies)) for (const p of c.products) {
      if (p.sectorId === 'crypto') p.price = SECTORS.crypto.refPrice;
    }
    // This fixture holds the known previous sold price as well as current quotes.
    s.openingCryptoPrice = SECTORS.crypto.refPrice;
    resolveTurn(s);
    const paid = a.reports[0].marketing;
    const demand = s.sectors.crypto.lastTotalDemand;
    const expected = Math.max(-0.6, Math.min(1.5, 0.9 * Math.max(-0.8, Math.min(1, demand / SECTORS.crypto.refDemand - 1)) + Math.min(CRYPTO_MARKETING_SURPLUS_MAX, CRYPTO_MARKETING_GAIN * (paid / marketSize('crypto') - CRYPTO_MARKETING_BASELINE))));
    expect(paid).toBeLessThan(1e8);
    expect(s.cryptoMarket!.momentum).toBeCloseTo(expected);
  });

  it('does not amplify advertising or count the mechanical crash expiry as growth', () => {
    const s = game();
    s.activeEffects = [];
    s.cryptoMarket = { ...market(), lastUnderlyingDemand: SECTORS.crypto.refDemand };
    const crash = preparedCryptoCard(s, findCard(CRYPTO_CRASH_IDS[0])!);
    expect(s.cryptoMarket).toMatchObject({ momentum: -0.6, bubble: 0, volatility: 0, lastGrowth: 0 });
    applyNewsCard(s, crash, 'headline');
    const ordinaryBudget = CRYPTO_MARKETING_BASELINE * marketSize('crypto');
    for (let i = 0; i < 2; i++) {
      s.sectors.crypto.lastTotalDemand = SECTORS.crypto.refDemand * 0.35;
      updateCryptoMarket(s, ordinaryBudget);
      expect(s.cryptoMarket.lastGrowth).toBeCloseTo(0);
      expect(s.cryptoMarket.volatility).toBeCloseTo(0);
      expect(s.cryptoMarket.momentum).toBeLessThan(0);
      expect(cryptoEuphoriaNews(s)).toBeUndefined();
    }
    s.activeEffects = [];
    s.sectors.crypto.lastTotalDemand = SECTORS.crypto.refDemand;
    updateCryptoMarket(s, ordinaryBudget);
    expect(s.cryptoMarket.cooldown).toBe(CRYPTO_CRASH_COOLDOWN_TURNS - 3);
    expect(s.cryptoMarket.lastGrowth).toBeCloseTo(0);
    expect(s.cryptoMarket.momentum).toBeLessThan(0);
    expect(cryptoEuphoriaNews(s)).toBeUndefined();
    for (let i = 3; i < CRYPTO_CRASH_COOLDOWN_TURNS; i++) {
      updateCryptoMarket(s, ordinaryBudget);
      expect(s.cryptoMarket.lastGrowth).toBeCloseTo(0);
      expect(s.cryptoMarket.momentum).toBeLessThan(0);
    }
    expect(s.cryptoMarket.cooldown).toBe(0);
    expect(cryptoEuphoriaNews(s)).toBeUndefined();
  });

  it('blocks another forced cycle throughout convalescence after the two-quarter shock expires', () => {
    const s = game();
    s.cryptoMarket = { ...market(), lastUnderlyingDemand: SECTORS.crypto.refDemand };
    preparedCryptoCard(s, findCard(CRYPTO_CRASH_IDS[0])!);
    s.activeEffects = [];
    s.sectors.crypto.lastTotalDemand = SECTORS.crypto.refDemand;
    for (let remaining = CRYPTO_CRASH_COOLDOWN_TURNS; remaining > 0; remaining--) {
      Object.assign(s.cryptoMarket, { momentum: 1.5, bubble: 2, volatility: 1.5 });
      const rng = s.rngState;
      expect(s.cryptoMarket.cooldown).toBe(remaining);
      expect(scheduleCryptoNews(s, 4)).toBeUndefined();
      expect(cryptoEuphoriaNews(s)).toBeUndefined();
      expect(s.rngState).toBe(rng);
      updateCryptoMarket(s, CRYPTO_MARKETING_BASELINE * marketSize('crypto'));
    }
    s.cryptoMarket.momentum = 1.5;
    expect(s.cryptoMarket.cooldown).toBe(0);
    expect(cryptoEuphoriaNews(s)).toBeDefined();
    // The cooldown changes timing; the high-price crash guard still applies after recovery.
    Object.assign(s.cryptoMarket, { bubble: 0, volatility: 0, lastAveragePrice: 3 * SECTORS.crypto.refPrice });
    expect(cryptoCrashProbability(s)).toBeCloseTo(0.8);
  });

  it('normalizes the prior observation when a legacy save resumes during or just after its crash', () => {
    for (const active of [true, false]) {
      const s = game();
      s.activeEffects = active ? [{ id: 'old-crash', newsId: CRYPTO_CRASH_IDS[0], kind: 'sectorDemand', sectorId: 'crypto', value: 0.35, turnsLeft: 1 }] : [];
      s.cryptoMarket = { ...market(-0.6), bubble: 0, volatility: 0, lastGrowth: 0, cooldown: active ? 2 : 1 };
      s.sectors.crypto.demandHistory = [38.5, active ? 38.5 : 110];
      s.sectors.crypto.lastTotalDemand = active ? 38.5 : 110;
      updateCryptoMarket(s, CRYPTO_MARKETING_BASELINE * marketSize('crypto'));
      expect(s.cryptoMarket.lastGrowth).toBeCloseTo(0);
      expect(s.cryptoMarket.momentum).toBeLessThan(0);
      expect(s.cryptoMarket.volatility).toBeCloseTo(0);
    }
  });

  it('counts neither the arrival nor expiry of stacked sector and global news as organic growth', () => {
    const s = game();
    s.activeEffects = [];
    s.cryptoMarket = { ...market(0), lastUnderlyingDemand: 120 };
    s.activeEffects.push(
      { id: 'boost', newsId: 'ordinary', kind: 'sectorDemand', sectorId: 'crypto', value: 1.5, turnsLeft: 1 },
      { id: 'macro', newsId: 'global', kind: 'sectorDemand', sectorId: 'all', value: 1.2, turnsLeft: 1 },
    );
    s.sectors.crypto.lastTotalDemand = 120 * 1.5 * 1.2;
    updateCryptoMarket(s, CRYPTO_MARKETING_BASELINE * marketSize('crypto'));
    expect(s.cryptoMarket.lastGrowth).toBeCloseTo(0);
    s.activeEffects = [];
    s.sectors.crypto.lastTotalDemand = 120;
    updateCryptoMarket(s, CRYPTO_MARKETING_BASELINE * marketSize('crypto'));
    expect(s.cryptoMarket.lastGrowth).toBeCloseTo(0);
  });

  it('uses sold volumes to weight price momentum and carries the observed price across no-sales quarters', () => {
    const s = game();
    s.activeEffects = [];
    s.cryptoMarket = { ...market(0), bubble: 0, lastGrowth: 0, lastUnderlyingDemand: SECTORS.crypto.refDemand,
      lastAveragePrice: SECTORS.crypto.refPrice };
    for (const c of Object.values(s.companies)) for (const p of c.products) p.lastSales = 0;
    const expensive = companyOf(s, 'a').products[0];
    const cheap = companyOf(s, 'b').products[0];
    const refPrice = SECTORS.crypto.refPrice;
    expensive.lastPrice = 2 * refPrice; expensive.price = 3 * refPrice; expensive.lastSales = 10;
    cheap.lastPrice = refPrice; cheap.lastSales = 90;
    const observedPrice = (expensive.lastPrice * expensive.lastSales + cheap.lastPrice * cheap.lastSales)
      / (expensive.lastSales + cheap.lastSales);
    s.sectors.crypto.lastTotalDemand = SECTORS.crypto.refDemand;
    updateCryptoMarket(s, CRYPTO_MARKETING_BASELINE * marketSize('crypto'));
    expect(s.cryptoMarket.lastAveragePrice).toBeCloseTo(observedPrice);
    expect(s.cryptoMarket.momentum).toBeCloseTo(CRYPTO_PRICE_MOMENTUM_GAIN * 0.1);
    expect(s.cryptoMarket.bubble).toBeCloseTo(0.35 * CRYPTO_PRICE_BUBBLE_GAIN * 0.1);
    expect(cryptoCrashProbability(s)).toBeGreaterThan(0.02);
    expensive.lastSales = 0; cheap.lastSales = 0; cheap.price = 3 * refPrice;
    const momentum = s.cryptoMarket.momentum;
    updateCryptoMarket(s, CRYPTO_MARKETING_BASELINE * marketSize('crypto'));
    expect(s.cryptoMarket.lastAveragePrice).toBeCloseTo(observedPrice);
    expect(s.cryptoMarket.momentum).toBeCloseTo(0.62 * momentum);
    expect(s.cryptoMarket.bubble).toBeCloseTo(0.65 * 0.35 * CRYPTO_PRICE_BUBBLE_GAIN * 0.1);
  });

  it('ordinary baseline advertising cannot create euphoria without a run-up', () => {
    const s = game();
    s.activeEffects = [];
    s.cryptoMarket = { ...market(0), lastUnderlyingDemand: SECTORS.crypto.refDemand };
    s.sectors.crypto.lastTotalDemand = SECTORS.crypto.refDemand;
    for (let i = 0; i < 12; i++) {
      updateCryptoMarket(s, CRYPTO_MARKETING_BASELINE * marketSize('crypto'));
      expect(s.cryptoMarket.momentum).toBeCloseTo(0);
      expect(cryptoEuphoriaNews(s)).toBeUndefined();
    }
    updateCryptoMarket(s, marketSize('crypto') * (CRYPTO_MARKETING_BASELINE + 0.1));
    expect(s.cryptoMarket.momentum).toBeCloseTo(CRYPTO_MARKETING_SURPLUS_MAX);
    s.sectors.crypto.lastTotalDemand *= 1.4;
    updateCryptoMarket(s, marketSize('crypto') * (CRYPTO_MARKETING_BASELINE + 0.1));
    expect(cryptoEuphoriaNews(s)).toBeDefined();
  });

  it('removes the market price response from organic growth while preserving sold-price momentum', () => {
    const s = game();
    s.activeEffects = [];
    s.cryptoMarket = { ...market(0), bubble: 0, volatility: 0, lastGrowth: 0,
      lastUnderlyingDemand: SECTORS.crypto.refDemand, lastAveragePrice: SECTORS.crypto.refPrice };
    s.sectors.crypto.lastMarketPriceMultiplier = 0.4;
    s.sectors.crypto.lastTotalDemand = SECTORS.crypto.refDemand * 0.4;
    for (const c of Object.values(s.companies)) for (const p of c.products) {
      p.lastSales = 10;
      p.lastPrice = SECTORS.crypto.refPrice * 2;
    }
    updateCryptoMarket(s, CRYPTO_MARKETING_BASELINE * marketSize('crypto'));
    expect(s.cryptoMarket.lastGrowth).toBeCloseTo(0);
    expect(s.cryptoMarket.lastUnderlyingDemand).toBeCloseTo(SECTORS.crypto.refDemand);
    expect(s.cryptoMarket.momentum).toBeCloseTo(CRYPTO_PRICE_MOMENTUM_GAIN);
    // Changing only the explicit market multiplier cannot fabricate growth in the next close either.
    s.sectors.crypto.lastMarketPriceMultiplier = 0.8;
    s.sectors.crypto.lastTotalDemand = SECTORS.crypto.refDemand * 0.8;
    updateCryptoMarket(s, CRYPTO_MARKETING_BASELINE * marketSize('crypto'));
    expect(s.cryptoMarket.lastGrowth).toBeCloseTo(0);
    expect(s.cryptoMarket.momentum).toBeCloseTo(0.62 * CRYPTO_PRICE_MOMENTUM_GAIN);
  });

  it('forces euphoria with a frozen multiplier derived from momentum', () => {
    const s = game();
    s.cryptoMarket = market(0.8);
    s.cryptoMarket.bubble = 0;
    s.cryptoMarket.volatility = 0;
    const scheduled = cryptoEuphoriaNews(s);
    expect(CRYPTO_EUPHORIA_IDS).toContain(scheduled!.cardId);
    expect(scheduled!.cryptoMultiplier).toBeCloseTo(cryptoEuphoriaMultiplier(0.8));
    s.cryptoMarket.momentum = 0;
    const card = preparedCryptoCard(s, findCard(scheduled!.cardId)!, scheduled);
    expect(card.effects.find((e) => e.type === 'sectorDemand')).toMatchObject({ sectorId: 'crypto', multiplier: scheduled!.cryptoMultiplier, duration: 1 });
    expect(cryptoEuphoriaMultiplier(1.5)).toBe(1.5);
    expect(cryptoEuphoriaMultiplier(CRYPTO_EUPHORIA_SATURATION)).toBe(1.5);
    expect(cryptoEuphoriaMultiplier(CRYPTO_EUPHORIA_THRESHOLD)).toBe(1.1);
    expect(cryptoEuphoriaMultiplier((CRYPTO_EUPHORIA_THRESHOLD + CRYPTO_EUPHORIA_SATURATION) / 2)).toBeCloseTo(1.3);
  });

  it('feeds a close directly into the following issue and quarter, without a one-quarter delay', () => {
    const s = game(5);
    s.sectors.crypto.demandMultiplier = 1.8;
    for (const c of Object.values(s.companies)) for (const p of c.products) if (p.sectorId === 'crypto') p.marketing = 2000;
    resolveTurn(s);
    expect(s.turn).toBe(2);
    expect(s.cryptoMarket!.momentum).toBeGreaterThan(CRYPTO_EUPHORIA_THRESHOLD);
    const effect = s.activeEffects.find((e) => (CRYPTO_EUPHORIA_IDS as readonly string[]).includes(e.newsId));
    expect(effect).toMatchObject({ kind: 'sectorDemand', sectorId: 'crypto', turnsLeft: 1 });
    expect(effect!.value).toBeCloseTo(cryptoEuphoriaMultiplier(s.cryptoMarket!.momentum));
    expect(s.journal.at(-1)!.articles.some((a) => CRYPTO_EUPHORIA_IDS.some((id) => a.title === findCard(id)!.headline))).toBe(true);
    const baseline = structuredClone(s);
    baseline.activeEffects = baseline.activeEffects.filter((e) => e.id !== effect!.id);
    resolveTurn(s); resolveTurn(baseline);
    expect(s.sectors.crypto.lastTotalDemand).toBeCloseTo(baseline.sectors.crypto.lastTotalDemand * effect!.value);
  });

  it('draws deterministically from the seeded RNG and risk grows with bubble and volatility', () => {
    const s = game();
    s.cryptoMarket = market();
    const clone = structuredClone(s);
    expect(scheduleCryptoNews(s, 3)).toEqual(scheduleCryptoNews(clone, 3));
    expect(snapshot(s)).toBe(snapshot(clone));
    s.cryptoMarket.bubble = 0; s.cryptoMarket.volatility = 0;
    expect(cryptoCrashProbability(s)).toBe(0.02);
    s.cryptoMarket.bubble = 2; s.cryptoMarket.volatility = 1.5;
    expect(cryptoCrashProbability(s)).toBeCloseTo(0.61);
  });

  it('a sustained high sold price keeps crash risk high even after momentum and bubble decay', () => {
    const s = game();
    s.cryptoMarket = { ...market(0), bubble: 0, volatility: 0, lastAveragePrice: SECTORS.crypto.refPrice };
    const risks = [1, 1.5, 2, 2.5, 3].map((ratio) => {
      s.cryptoMarket!.lastAveragePrice = ratio * SECTORS.crypto.refPrice;
      return cryptoCrashProbability(s);
    });
    expect(risks[0]).toBe(0.02);
    expect(risks.every((risk, i) => i === 0 || risk > risks[i - 1])).toBe(true);
    expect(risks.at(-1)).toBeCloseTo(0.8);
    // A flat cap price is eligible even with no fresh run-up or residual bubble.
    let scheduled = false;
    for (let seed = 1; seed <= 20 && !scheduled; seed++) {
      const capped = game(seed);
      capped.cryptoMarket = { ...s.cryptoMarket! };
      scheduled = !!scheduleCryptoNews(capped, 3);
    }
    expect(scheduled).toBe(true);
    s.cryptoMarket!.lastAveragePrice = Number.NaN;
    s.cryptoMarket!.bubble = Number.NaN;
    s.cryptoMarket!.volatility = Number.POSITIVE_INFINITY;
    expect(cryptoCrashProbability(s)).toBe(0.02);
  });

  it('uses recent headline memory for forced euphoria and crashes', () => {
    const s = game();
    s.cryptoMarket = market();
    s.recentNewsIds = [...CRYPTO_EUPHORIA_IDS.slice(0, 2)];
    expect(cryptoEuphoriaNews(s)?.cardId).toBe(CRYPTO_EUPHORIA_IDS[2]);
    s.recentNewsIds = [...CRYPTO_EUPHORIA_IDS];
    expect(cryptoEuphoriaNews(s)?.cardId).not.toBe(CRYPTO_EUPHORIA_IDS[2]);
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const crashState = game(seed);
      crashState.cryptoMarket = { ...market(), bubble: 2, volatility: 1.5 };
      crashState.recentNewsIds = [...CRYPTO_CRASH_IDS.slice(0, 2)];
      const scheduled = scheduleCryptoNews(crashState, 3);
      if (scheduled) {
        found = true;
        expect(scheduled.cardId).toBe(CRYPTO_CRASH_IDS[2]);
      }
    }
    expect(found).toBe(true);
  });

  it('ordinary crypto draws respect euphoria and active crash headlines', () => {
    const s = game();
    s.cryptoMarket = market();
    const moon = findCard('crypto_to_the_moon')!;
    const winter = findCard('crypto_winter')!;
    expect(cryptoNewsCompatible(s, winter)).toBe(false);
    for (let i = 0; i < 100; i++) expect(drawNews(s, 4, new Set())?.id).not.toBe(winter.id);
    applyNewsCard(s, findCard(CRYPTO_CRASH_IDS[0])!, 'headline');
    expect(cryptoNewsCompatible(s, moon)).toBe(false);
    for (let i = 0; i < 100; i++) expect(drawNews(s, 4, new Set())?.id).not.toBe(moon.id);
  });

  it('keeps a promised negative ordinary headline and postpones euphoria to avoid a contradictory issue', () => {
    const s = game();
    s.turn = 4;
    s.cryptoMarket = market();
    s.scheduledNews = [{ turn: 4, cardId: 'crypto_winter' }];
    startTurn(s, null);
    const titles = s.journal.at(-1)!.articles.map((a) => a.title);
    expect(titles).toContain(findCard('crypto_winter')!.headline);
    for (const id of CRYPTO_EUPHORIA_IDS) expect(titles).not.toContain(findCard(id)!.headline);
  });

  it('also postpones euphoria when the negative crypto card only has sentiment and scandal effects', () => {
    const s = game(71);
    s.turn = 4; s.activeEffects = []; s.cryptoMarket = market(0.8);
    s.scheduledNews = [{ turn: 4, cardId: 'crypto_rug_pull' }];
    expect(cryptoNewsCompatible(s, findCard('crypto_rug_pull')!)).toBe(false);
    startTurn(s, null);
    const titles = s.journal.at(-1)!.articles.map((a) => a.title);
    expect(titles).toContain(findCard('crypto_rug_pull')!.headline);
    for (const id of CRYPTO_EUPHORIA_IDS) expect(titles).not.toContain(findCard(id)!.headline);
  });

  it('random-sector ordinary demand cards omit crypto when its current news cycle conflicts', () => {
    const s = game();
    s.cryptoMarket = market();
    for (let i = 0; i < 30; i++) {
      applyNewsCard(s, findCard('sector_parents_boycott')!, 'news');
      expect(s.activeEffects.some((e) => e.kind === 'sectorDemand' && e.sectorId === 'crypto' && e.value < 1)).toBe(false);
    }
    applyNewsCard(s, preparedCryptoCard(s, findCard(CRYPTO_CRASH_IDS[0])!), 'headline');
    for (let i = 0; i < 30; i++) {
      applyNewsCard(s, findCard('sector_viral_trend')!, 'news');
      expect(s.activeEffects.some((e) => e.kind === 'sectorDemand' && e.sectorId === 'crypto' && e.value > 1)).toBe(false);
    }
  });

  it('advertising and price rises cannot pump momentum or bubble during an active crash', () => {
    const s = game();
    s.activeEffects = [];
    s.cryptoMarket = { ...market(), lastUnderlyingDemand: SECTORS.crypto.refDemand, lastAveragePrice: SECTORS.crypto.refPrice };
    applyNewsCard(s, preparedCryptoCard(s, findCard(CRYPTO_CRASH_IDS[0])!), 'headline');
    for (const c of Object.values(s.companies)) for (const p of c.products) if (p.sectorId === 'crypto') { p.lastSales = 10; p.lastPrice = 600; }
    s.sectors.crypto.lastTotalDemand = SECTORS.crypto.refDemand * 0.35;
    updateCryptoMarket(s, 1e9);
    expect(s.cryptoMarket.momentum).toBeCloseTo(-0.6 * 0.62);
    expect(s.cryptoMarket.bubble).toBeCloseTo(0);
  });

  it('does not publish forced euphoria while an older ordinary crypto downturn remains active', () => {
    const s = game();
    s.cryptoMarket = market();
    applyNewsCard(s, findCard('crypto_winter')!, 'headline');
    expect(cryptoEuphoriaNews(s)).toBeUndefined();
  });

  it('a published crash ends previous positive crypto demand effects', () => {
    const s = game();
    s.cryptoMarket = market();
    applyNewsCard(s, findCard('crypto_to_the_moon')!, 'headline');
    expect(s.activeEffects.some((e) => e.newsId === 'crypto_to_the_moon')).toBe(true);
    applyNewsCard(s, preparedCryptoCard(s, findCard(CRYPTO_CRASH_IDS[0])!), 'headline');
    expect(s.activeEffects.some((e) => e.kind === 'sectorDemand' && e.sectorId === 'crypto' && e.value > 1)).toBe(false);
  });

  it('publishes the true crash rumor before the forced crash, then resets momentum and keeps two quarters of sector demand shock', () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const s = game(seed);
      s.turn = 2; s.scheduledNews = []; s.cryptoMarket = market();
      s.cryptoMarket.bubble = 2; s.cryptoMarket.volatility = 1.5;
      startTurn(s, null);
      const scheduled = s.scheduledNews.find((n) => n.turn === 3)!;
      if (!(CRYPTO_CRASH_IDS as readonly string[]).includes(scheduled.cardId)) continue;
      found = true;
      const issue = s.journal.at(-1)!;
      const index = s.rumorKeys![2].indexOf(`news:${scheduled.cardId}`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(issue.rumors[index].text).toBe(findCard(scheduled.cardId)!.rumor);
      expect(['faible', 'moyenne', 'élevée']).toContain(issue.rumors[index].reliability);
      resolveTurn(s);
      expect(s.journal.at(-1)!.articles.some((a) => a.title === findCard(scheduled.cardId)!.headline)).toBe(true);
      expect(s.cryptoMarket!.momentum).toBe(-0.6);
      expect(s.cryptoMarket!.cooldown).toBe(CRYPTO_CRASH_COOLDOWN_TURNS);
      expect(s.activeEffects.find((e) => e.newsId === scheduled.cardId)).toMatchObject({ kind: 'sectorDemand', sectorId: 'crypto', value: 0.35, turnsLeft: 2 });
      resolveTurn(s);
      expect(s.activeEffects.find((e) => e.newsId === scheduled.cardId)?.turnsLeft).toBe(1);
      resolveTurn(s);
      expect(s.activeEffects.some((e) => e.newsId === scheduled.cardId)).toBe(false);
    }
    expect(found).toBe(true);
  });

  it('affects the entire sector, including both crypto companies', () => {
    const s = game(22, 1);
    const base = structuredClone(s);
    const card = findCard(CRYPTO_CRASH_IDS[0])!;
    const sentiments = ['a', 'b'].map((id) => companyOf(s, id).sentiment);
    applyNewsCard(s, card, 'headline');
    ['a', 'b'].forEach((id, i) => expect(companyOf(s, id).sentiment).toBeLessThan(sentiments[i]));
    resolveTurn(s); resolveTurn(base);
    expect(s.sectors.crypto.lastTotalDemand).toBeCloseTo(base.sectors.crypto.lastTotalDemand * 0.35);
  });

  it('ordinary draws exclude all six forced cards and legacy weights follow the cycle', () => {
    const s = game(); s.cryptoMarket = market();
    for (let i = 0; i < 400; i++) {
      const id = drawNews(s, 4, new Set())?.id;
      expect([...CRYPTO_CRASH_IDS, ...CRYPTO_EUPHORIA_IDS]).not.toContain(id);
    }
    const moon = findCard('crypto_to_the_moon')!;
    const winter = findCard('crypto_winter')!;
    expect(cryptoNewsWeight(s, moon)).toBeGreaterThan(moon.weight);
    preparedCryptoCard(s, findCard(CRYPTO_CRASH_IDS[0])!);
    for (let elapsed = 0; elapsed <= CRYPTO_CRASH_COOLDOWN_TURNS; elapsed++) {
      s.cryptoMarket.cooldown = CRYPTO_CRASH_COOLDOWN_TURNS - elapsed;
      expect(cryptoNewsWeight(s, winter)).toBe(winter.weight * (elapsed < CRYPTO_NEGATIVE_NEWS_BOOST_TURNS ? 2 : 1));
      if (elapsed < CRYPTO_CRASH_COOLDOWN_TURNS) expect(scheduleCryptoNews(s, 4)).toBeUndefined();
    }
  });

  it('publishes both true and false crash warnings through the existing rumor reliability rules', () => {
    let trueWarnings = 0;
    let falseWarnings = 0;
    const trueReliabilities = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = game(seed, 16);
      while (s.phase === 'playing') {
        const issue = s.journal.at(-1)!;
        (s.rumorKeys?.[issue.turn] ?? []).forEach((key, i) => {
          if (CRYPTO_CRASH_IDS.some((id) => key === `news:${id}`)) {
            trueWarnings++;
            trueReliabilities.add(issue.rumors[i].reliability);
          }
          if (key.startsWith('fake:fake_crypto_crash_')) {
            falseWarnings++;
            expect(['faible', 'moyenne', 'élevée']).toContain(issue.rumors[i].reliability);
          }
        });
        resolveTurn(s);
      }
    }
    expect(trueWarnings).toBeGreaterThan(0);
    expect(falseWarnings).toBeGreaterThan(0);
    expect(trueReliabilities).toEqual(new Set(['faible', 'moyenne', 'élevée']));
  }, 30_000);

  it('redacts hidden state and frozen future effects from every player and spectator view, including finished games', () => {
    const s = game(); s.cryptoMarket = market();
    s.scheduledNews = [{ turn: 2, cardId: CRYPTO_CRASH_IDS[0], cryptoMultiplier: 1.23456789 }];
    for (const phase of ['playing', 'finished'] as const) {
      s.phase = phase;
      for (const id of ['a', 'b', 'spectator']) {
        const json = JSON.stringify(getPlayerView(s, id));
        expect(json).not.toMatch(/cryptoMarket|momentum|cooldown|cryptoMultiplier|scheduledNews/);
        expect(json).not.toContain('1.23456789');
      }
    }
  });
});
