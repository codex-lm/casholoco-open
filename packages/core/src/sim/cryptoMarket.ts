/** The bubble only affects demand through published news, never through a private demand shortcut. */
import { SECTORS } from '../content';
import type { Article, GameState, Id, NewsCard, ScheduledNews } from '../types';
import { sectorNewsMultiplier } from './advice';
import { marketSize } from './finance';
import { langOf, tr } from './i18n';
import { makeArticle } from './journal';
import { next, pick } from './rng';
import { addScandal } from './terrains';
import { clamp, fillTemplate, flavor, fin } from './util';

export const CRYPTO_EUPHORIA_IDS = ['crypto_bubble_fomo', 'crypto_bubble_grandmas', 'crypto_bubble_metaverse'] as const;
export const CRYPTO_CRASH_IDS = ['crypto_crash_founders', 'crypto_crash_exchange', 'crypto_crash_regulator'] as const;
export const CRYPTO_MOMENTUM_MIN = -0.6;
export const CRYPTO_MOMENTUM_MAX = 1.5;
export const CRYPTO_EUPHORIA_THRESHOLD = 0.27;
export const CRYPTO_EUPHORIA_SATURATION = 0.8;
export const CRYPTO_EUPHORIA_GAIN = 0.4;
/** Ordinary advertising maintains awareness; only spending above this sector budget pumps the bubble. */
export const CRYPTO_MARKETING_BASELINE = 0.03;
export const CRYPTO_MARKETING_GAIN = 6;
export const CRYPTO_MARKETING_SURPLUS_MAX = 0.02;
export const CRYPTO_PRICE_MOMENTUM_GAIN = 0.7;
export const CRYPTO_PRICE_BUBBLE_GAIN = 3.5;
export const CRYPTO_CRASH_BUBBLE_RISK = 0.22;
/** At three times reference, even a flat sold price adds 78 percentage points of crash risk. */
export const CRYPTO_CRASH_PRICE_LEVEL_RISK = 0.78;
export const CRYPTO_CRASH_PRICE_LEVEL_POWER = 3;
export const CRYPTO_CRASH_MAX_RISK = 0.85;
/** Rebuilding speculative confidence takes three years, beyond the two-quarter demand shock. */
export const CRYPTO_CRASH_COOLDOWN_TURNS = 12;
/** Ordinary bad-news weights recover after three quarters, independently of crash eligibility. */
export const CRYPTO_NEGATIVE_NEWS_BOOST_TURNS = 3;
/** Part de sa ligne vendue au trimestre précédent qui déclenche une brève « délit d'initié » au krach. */
export const CRYPTO_INSIDER_SALE_FRACTION = 0.25;
/** Scandale infligé à l'entreprise dont le dirigeant a vendu la veille du krach. */
export const CRYPTO_INSIDER_SCANDAL = 15;

function hasCryptoCompany(state: GameState): boolean {
  return Object.values(state.companies).some((c) => c.status === 'active' && c.products.some((p) => p.sectorId === 'crypto'));
}

export function cryptoCrashActive(state: GameState): boolean {
  return state.activeEffects.some((e) => e.turnsLeft > 0 && (CRYPTO_CRASH_IDS as readonly string[]).includes(e.newsId));
}

export function cryptoEuphoriaEligible(state: GameState): boolean {
  const m = state.cryptoMarket;
  return !!m && m.momentum >= CRYPTO_EUPHORIA_THRESHOLD && m.cooldown === 0 && !cryptoCrashActive(state) &&
    !state.activeEffects.some((e) => e.kind === 'sectorDemand' && e.sectorId === 'crypto' && e.turnsLeft > 0 && e.value < 1) &&
    hasCryptoCompany(state);
}

/** The same headline memory used for ordinary news also applies to forced cards. */
function freshCryptoHeadline(state: GameState, ids: readonly string[]): string {
  const fresh = ids.filter((id) => !state.recentNewsIds.includes(id));
  const last = [...state.recentNewsIds].reverse().find((id) => ids.includes(id));
  return pick(state, fresh.length > 0 ? fresh : ids.filter((id) => id !== last))!;
}

/** Only shipped units establish a market observation; unsold quotes cannot pump it. */
function cryptoAveragePrice(state: GameState): number | undefined {
  let sales = 0;
  let revenue = 0;
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    for (const p of c.products) {
      if (p.sectorId !== 'crypto' || p.lastSales <= 0) continue;
      sales += p.lastSales;
      revenue += p.lastSales * (p.lastPrice ?? SECTORS.crypto.refPrice);
    }
  }
  return sales > 0 ? revenue / sales : undefined;
}

/** Call after recording realized sector demand, using advertising actually paid this quarter. */
export function updateCryptoMarket(state: GameState, marketingSpent: number): void {
  const m = state.cryptoMarket ??= { momentum: 0, bubble: 0, volatility: 0, lastGrowth: 0, cooldown: 0 };
  const history = state.sectors.crypto.demandHistory;
  const demand = state.sectors.crypto.lastTotalDemand;
  // News entering or expiring must not masquerade as organic growth, especially the end of a crash.
  const newsMultiplier = state.activeEffects.reduce((mult, e) => e.kind === 'sectorDemand' &&
    (e.sectorId === 'crypto' || e.sectorId === 'all') && e.turnsLeft > 0 ? mult * sectorNewsMultiplier('crypto', e.value) : mult, 1);
  // The explicit price response is already counted by sold-price momentum. Do not count it again as organic noise.
  const priceMultiplier = Math.max(1e-6, fin(state.sectors.crypto.lastMarketPriceMultiplier ?? 1, 1));
  const underlyingDemand = demand / (newsMultiplier * priceMultiplier);
  // A legacy save may resume halfway through a crash without the new normalized observation.
  const previousNewsMultiplier = newsMultiplier * (m.cooldown > 0 && !cryptoCrashActive(state) ? sectorNewsMultiplier('crypto', 0.35) : 1);
  const previous = m.lastUnderlyingDemand ?? (history.length > 1 ? history[history.length - 2] / previousNewsMultiplier : SECTORS.crypto.refDemand);
  const growth = clamp(underlyingDemand / Math.max(1, previous) - 1, -0.8, 1);
  const trend = SECTORS.crypto.refDemand * Math.pow(1 + SECTORS.crypto.growth, state.turn - 1);
  const excess = clamp(demand / trend - 1, 0, 2);
  const intensity = Math.max(0, marketingSpent) / marketSize('crypto');
  const previousPrice = m.lastAveragePrice ?? SECTORS.crypto.refPrice;
  const observedPrice = cryptoAveragePrice(state);
  // Opening quotes predate the first issue and automatic decisions. They are a
  // comparison baseline, never an observed sale or a reason to schedule a crash.
  const comparisonPrice = m.lastAveragePrice ?? state.openingCryptoPrice ?? previousPrice;
  const averagePrice = observedPrice ?? previousPrice;
  const priceGrowth = observedPrice === undefined ? 0 : clamp(averagePrice / comparisonPrice - 1, -0.8, 1);
  const advertising = Math.min(CRYPTO_MARKETING_SURPLUS_MAX, CRYPTO_MARKETING_GAIN * (intensity - CRYPTO_MARKETING_BASELINE));
  const recovering = cryptoCrashActive(state);
  m.momentum = clamp(0.62 * m.momentum + 0.9 * growth + (recovering ? Math.min(0, advertising) : advertising) +
    CRYPTO_PRICE_MOMENTUM_GAIN * (recovering ? Math.min(0, priceGrowth) : priceGrowth), CRYPTO_MOMENTUM_MIN, CRYPTO_MOMENTUM_MAX);
  m.bubble = clamp(0.65 * m.bubble + 0.35 * (excess + (recovering ? 0 : CRYPTO_PRICE_BUBBLE_GAIN * Math.max(0, priceGrowth))), 0, 2);
  m.volatility = clamp(0.6 * m.volatility + 0.4 * Math.abs(growth - m.lastGrowth), 0, 1.5);
  m.lastGrowth = growth;
  m.lastUnderlyingDemand = underlyingDemand;
  if (observedPrice !== undefined) {
    m.lastAveragePrice = observedPrice;
    delete state.openingCryptoPrice;
  }
  m.cooldown = Math.max(0, m.cooldown - 1);
}

export function cryptoCrashProbability(state: GameState): number {
  const m = state.cryptoMarket;
  if (!m) return 0;
  const priceLevel = Math.max(0, fin(m.lastAveragePrice ?? SECTORS.crypto.refPrice, SECTORS.crypto.refPrice) / SECTORS.crypto.refPrice - 1);
  const pricePressure = Math.pow(clamp(priceLevel / 2, 0, 1), CRYPTO_CRASH_PRICE_LEVEL_POWER);
  return clamp(0.02 + CRYPTO_CRASH_BUBBLE_RISK * Math.max(0, fin(m.bubble)) + 0.10 * Math.max(0, fin(m.volatility)) +
    CRYPTO_CRASH_PRICE_LEVEL_RISK * pricePressure, 0.02, CRYPTO_CRASH_MAX_RISK);
}

export function cryptoEuphoriaMultiplier(momentum: number): number {
  return 1.1 + CRYPTO_EUPHORIA_GAIN * clamp((momentum - CRYPTO_EUPHORIA_THRESHOLD) / (CRYPTO_EUPHORIA_SATURATION - CRYPTO_EUPHORIA_THRESHOLD), 0, 1);
}

/** A crash is scheduled alongside its true rumor, one issue before publication. */
export function scheduleCryptoNews(state: GameState, turn: number): ScheduledNews | undefined {
  const m = state.cryptoMarket;
  if (!m || m.cooldown > 0 || !hasCryptoCompany(state)) return undefined;
  // A quiet, unpumped market cannot crash just because time passed.
  if (m.momentum < CRYPTO_EUPHORIA_THRESHOLD && m.bubble < 0.10 &&
    fin(m.lastAveragePrice ?? SECTORS.crypto.refPrice, SECTORS.crypto.refPrice) < 1.5 * SECTORS.crypto.refPrice) return undefined;
  if (next(state) < cryptoCrashProbability(state)) {
    return { turn, cardId: freshCryptoHeadline(state, CRYPTO_CRASH_IDS) };
  }
  return undefined;
}

/** Euphoria reacts in the issue immediately after the close, without postponing a promised headline. */
export function cryptoEuphoriaNews(state: GameState): ScheduledNews | undefined {
  const m = state.cryptoMarket;
  if (!cryptoEuphoriaEligible(state)) return undefined;
  return { turn: state.turn, cardId: freshCryptoHeadline(state, CRYPTO_EUPHORIA_IDS), cryptoMultiplier: cryptoEuphoriaMultiplier(m!.momentum) };
}

/** Apply the frozen multiplier and reset the sector only when a crash is actually published. */
export function preparedCryptoCard(state: GameState, card: NewsCard, scheduled?: ScheduledNews): NewsCard {
  if ((CRYPTO_CRASH_IDS as readonly string[]).includes(card.id)) {
    // The crash ends lingering speculative boosts rather than stacking a boom onto the sector shock.
    state.activeEffects = state.activeEffects.filter((e) => !(e.kind === 'sectorDemand' && e.sectorId === 'crypto' && e.value > 1));
    if (state.cryptoMarket) {
      state.cryptoMarket.momentum = -0.6;
      state.cryptoMarket.bubble = 0;
      state.cryptoMarket.volatility = 0;
      state.cryptoMarket.lastGrowth = 0;
      state.cryptoMarket.cooldown = CRYPTO_CRASH_COOLDOWN_TURNS;
    }
  }
  if (!(CRYPTO_EUPHORIA_IDS as readonly string[]).includes(card.id)) return card;
  const multiplier = scheduled?.cryptoMultiplier ?? cryptoEuphoriaMultiplier(state.cryptoMarket?.momentum ?? 0);
  return { ...card, effects: card.effects.map((e) => e.type === 'sectorDemand'
    ? { ...e, multiplier }
    : e.type === 'companySentiment' ? { ...e, multiplier: 1 + 0.35 * (multiplier - 1) } : e) };
}

/** Sign of an ordinary explicit crypto card; global news keeps its ordinary publication rules. */
export function ordinaryCryptoDirection(card: NewsCard): number {
  if ((CRYPTO_CRASH_IDS as readonly string[]).includes(card.id) || (CRYPTO_EUPHORIA_IDS as readonly string[]).includes(card.id)) return 0;
  for (const e of card.effects) {
    if (e.type === 'sectorDemand' && e.sectorId === 'crypto') return Math.sign(e.multiplier - 1);
    if ('target' in e && typeof e.target === 'object' && e.target.sectorId === 'crypto') {
      if (e.type === 'companySentiment') return Math.sign(e.multiplier - 1);
      if (e.type === 'scandal') return -Math.sign(e.delta);
      if (e.type === 'reputation') return Math.sign(e.delta);
      if (e.type === 'companyCash') return Math.sign(e.pctOfCash || e.flat || 0);
    }
  }
  return 0;
}

/** Random-sector cards can still publish: their sector draw omits crypto when its cycle conflicts. */
export function cryptoRandomSectorAllowed(state: GameState, card: NewsCard): boolean {
  return card.effects.every((e) => e.type !== 'sectorDemand' || e.sectorId !== 'random' ||
    !(e.multiplier > 1 && cryptoCrashActive(state)) && !(e.multiplier < 1 && cryptoEuphoriaEligible(state)));
}

export function cryptoNewsCompatible(state: GameState, card: NewsCard): boolean {
  const direction = ordinaryCryptoDirection(card);
  return !(direction > 0 && cryptoCrashActive(state)) && !(direction < 0 && cryptoEuphoriaEligible(state));
}

/** Keep legacy random crypto cards, shifting their weights with the sector cycle. */
export function cryptoNewsWeight(state: GameState, card: NewsCard): number {
  const m = state.cryptoMarket;
  if (!m) return card.weight;
  const cryptoDemand = card.effects.find((e) => e.type === 'sectorDemand' && e.sectorId === 'crypto');
  if (!cryptoDemand || cryptoDemand.type !== 'sectorDemand') return card.weight;
  const boom = clamp(m.momentum / CRYPTO_MOMENTUM_MAX, 0, 1);
  if (cryptoDemand.multiplier > 1) return card.weight * (1 + 1.5 * boom);
  if (cryptoDemand.multiplier < 1) return card.weight * (m.cooldown > CRYPTO_CRASH_COOLDOWN_TURNS - CRYPTO_NEGATIVE_NEWS_BOOST_TURNS ? 2 : 1 - 0.4 * boom);
  return card.weight;
}

/**
 * Délit d'initié présumé : au krach, tout dirigeant qui a vendu au moins CRYPTO_INSIDER_SALE_FRACTION
 * de sa ligne d'une entreprise crypto au trimestre précédent écope d'une brève et d'un scandale.
 * Le calcul porte sur les ventes nettes des rachats du trimestre, rapportées à la ligne de début de
 * trimestre (celle de la première vente qualifiante). La ligne crypto est appréciée au moment de la
 * vente : fermer la gamme avant le krach ne lave pas la vente. La brève paraît au nom du vendeur.
 * Renvoie les brèves du numéro en cours ; sans vente qualifiante, rien n'est créé (ni id, ni RNG consommé).
 */
export function cryptoInsiderSaleBriefs(state: GameState, crashCardId: string): Article[] {
  if (!(CRYPTO_CRASH_IDS as readonly string[]).includes(crashCardId)) return [];
  const sales = state.shareSales;
  if (!sales || sales.length === 0) return [];
  const fractions = new Map<string, { playerId: Id; companyId: Id; holdingStart: number; sold: number }>();
  for (const s of sales) {
    if (s.turn !== state.turn - 1 || !s.sellerController || !s.hadCryptoLine || !(s.holdingBefore > 0)) continue;
    const key = `${s.playerId}|${s.companyId}`;
    // La première vente du groupe fixe la ligne de début de trimestre.
    const entry = fractions.get(key) ?? { playerId: s.playerId, companyId: s.companyId, holdingStart: s.holdingBefore, sold: 0 };
    entry.sold += s.shares;
    fractions.set(key, entry);
  }
  if (fractions.size === 0) return [];
  for (const b of state.shareBuys ?? []) {
    if (b.turn !== state.turn - 1) continue;
    const entry = fractions.get(`${b.playerId}|${b.companyId}`);
    if (entry) entry.sold -= b.shares;
  }
  const T = tr(state);
  const lang = langOf(state);
  const briefs: Article[] = [];
  for (const { playerId, companyId, holdingStart, sold } of fractions.values()) {
    const fraction = Math.max(0, sold) / holdingStart;
    if (fraction < CRYPTO_INSIDER_SALE_FRACTION - 1e-9) continue;
    const c = state.companies[companyId];
    if (!c || c.status !== 'active') continue;
    const tpl = flavor(state, T.insiderSaleBriefs, `insiderSale:${playerId}:${companyId}`);
    if (!tpl) continue;
    // Le vendeur n'a pas besoin de contrôler encore l'entreprise : le scandale la frappe quand même.
    addScandal(state, c, CRYPTO_INSIDER_SCANDAL);
    const vars = { ceo: state.players[playerId]?.name ?? c.ceoName, company: c.name };
    briefs.push(makeArticle(state, {
      title: fillTemplate(tpl.title, vars, lang),
      body: fillTemplate(tpl.body, vars, lang),
      tone: 'drama',
      kind: 'news',
      companyIds: [c.id],
      sectorIds: ['crypto'],
      event: { type: 'insiderSale', actorId: playerId, subjectId: c.id },
    }));
  }
  return briefs;
}
