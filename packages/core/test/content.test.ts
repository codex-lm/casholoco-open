import { describe, expect, it } from 'vitest';
import {
  COMMODITY_IDS,
  SECTOR_IDS,
  SHADY_KINDS,
  TROPHY_IDS,
  ZONE_IDS,
  type ActionType,
  type CompanyTarget,
  type HeadlineTemplates,
  type NewsCard,
  type NewsCategory,
  type NewsEffect,
} from '../src/types';
import { FAKE_RUMORS, NEWS_CARDS } from '../src/content/fr/news';
import { TERRAIN_CONTENT, TERRAINS } from '../src/content/fr/terrains';
import { HEADLINES } from '../src/content/fr/headlines';
import { BOT_PERSONALITIES, NPC_COMPANIES } from '../src/content/fr/bots';
import { TROPHIES } from '../src/content/fr/trophies';
import {
  ACTION_QUIPS,
  COMPANY_NAME_IDEAS,
  PRODUCT_NAME_IDEAS,
  REFUSAL_QUIPS,
  SHADY_INFO,
  SITE_NAMES,
} from '../src/content/fr/flavor';
import { MAP_NAMES } from '../src/content/fr/map';
import { HEX_NAMES } from '../src/content/fr/hexNames';
import { mapTexts } from './helpers';

// Record exhaustif : TypeScript refuse une clé manquante ou en trop.
const ACTION_TYPE_SET: Record<ActionType, true> = {
  buyShares: true,
  sellShares: true,
  takePersonalLoan: true,
  repayPersonalLoan: true,
  foundStartup: true,
  whistleblow: true,
  checkRumor: true,
  bidSite: true,
  cancelSiteBid: true,
  cancelHexBid: true,
  moveFactory: true,
  setSiteDormant: true,
  offerShares: true,
  offerContract: true,
  proposeCartel: true,
  answerOffer: true,
  cancelOffer: true,
  leaveCartel: true,
  setProductDecisions: true,
  launchProduct: true,
  discontinueProduct: true,
  expandCapacity: true,
  bidLand: true,
  sellLand: true,
  buildFactory: true,
  buyCommodity: true,
  sellCommodity: true,
  takeLoan: true,
  repayLoan: true,
  payDividend: true,
  ceoBonus: true,
  buyback: true,
  poisonPill: true,
  crisisComms: true,
  shady: true,
  merge: true,
};
const ACTION_TYPES = Object.keys(ACTION_TYPE_SET) as ActionType[];

const CATEGORY_SET: Record<NewsCategory, true> = {
  local: true,
  commodities: true,
  sector: true,
  macro: true,
  politics: true,
  scandal: true,
  tech: true,
  absurd: true,
};

const EFFECT_TYPE_SET: Record<NewsEffect['type'], true> = {
  terrain: true,
  heat: true,
  sectorDemand: true,
  commodityPrice: true,
  commoditySupply: true,
  siteCost: true,
  interestRate: true,
  taxRate: true,
  laborCost: true,
  zoneLabor: true,
  transportCost: true,
  marketSentiment: true,
  companySentiment: true,
  companyCash: true,
  scandal: true,
  reputation: true,
};

/** Placeholders autorisés (et obligatoires) par clé de HeadlineTemplates, cf. types.ts. */
const HEADLINE_PLACEHOLDERS: Record<keyof HeadlineTemplates, { allowed: string[]; required: string[] }> = {
  takeover: { allowed: ['acquirer', 'target'], required: ['acquirer', 'target'] },
  ousted: { allowed: ['player', 'company', 'amount'], required: ['player', 'company', 'amount'] },
  oustedBroke: { allowed: ['player', 'company'], required: ['player', 'company'] },
  scandal: { allowed: ['company', 'amount'], required: ['company', 'amount'] },
  bankruptcy: { allowed: ['company'], required: ['company'] },
  productLaunch: { allowed: ['company', 'product', 'sector'], required: ['company', 'product'] },
  hexProductLaunch: { allowed: ['company', 'product', 'sector'], required: ['company', 'product'] },
  bigProfit: { allowed: ['company', 'amount'], required: ['company', 'amount'] },
  bigLoss: { allowed: ['company', 'amount'], required: ['company', 'amount'] },
  ceoBonus: { allowed: ['ceo', 'amount', 'company'], required: ['ceo', 'amount', 'company'] },
  startup: { allowed: ['player', 'company'], required: ['player', 'company'] },
  merger: { allowed: ['acquirer', 'target'], required: ['acquirer', 'target'] },
  poisonPill: { allowed: ['company'], required: ['company'] },
  buyback: { allowed: ['company', 'amount'], required: ['company', 'amount'] },
  dividend: { allowed: ['company', 'amount'], required: ['company', 'amount'] },
  marginCall: { allowed: ['player'], required: ['player'] },
  stakeBuilding: { allowed: ['player', 'pct', 'company'], required: ['player', 'pct', 'company'] },
  insiderBuying: { allowed: ['ceo', 'pct', 'company'], required: ['ceo', 'pct', 'company'] },
  whistleblow: { allowed: ['company', 'level'], required: ['company', 'level'] },
  quarterIntro: { allowed: ['sector'], required: [] },
};

const SINGLE_TARGETS = new Set(['random', 'richest', 'smallest', 'mostScandalous', 'topProfit']);
const EPS = 1e-9;
const FORCED_CRYPTO_NEWS = new Set([
  'crypto_bubble_fomo', 'crypto_bubble_grandmas', 'crypto_bubble_metaverse',
  'crypto_crash_founders', 'crypto_crash_exchange', 'crypto_crash_regulator',
]);

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

function inRange(x: number, min: number, max: number): boolean {
  return Number.isFinite(x) && x >= min - EPS && x <= max + EPS;
}

function isIntInRange(x: number, min: number, max: number): boolean {
  return Number.isInteger(x) && x >= min && x <= max;
}

function isValidTarget(t: CompanyTarget): boolean {
  if (typeof t === 'string') {
    return ['all', 'random', 'richest', 'smallest', 'mostScandalous', 'topProfit', 'playerCompanies'].includes(t);
  }
  return SECTOR_IDS.includes(t.sectorId);
}

/** Renvoie la liste des problèmes de calibrage d'un effet (vide si tout va bien). */
function effectProblems(e: NewsEffect, forcedCryptoCrash = false): string[] {
  const p: string[] = [];
  switch (e.type) {
    case 'terrain':
      if (!TERRAINS.some((t) => t.id === e.terrain)) p.push(`terrain ${e.terrain}`);
      if (e.suspend ? e.lever !== 'tax' || e.multiplier !== undefined : !inRange(e.multiplier ?? NaN, 0.6, 1.4)) p.push('local multiplier or suspension');
      if (!isIntInRange(e.duration, 2, 4)) p.push(`duration ${e.duration}`);
      break;
    case 'heat':
      if (!inRange(e.multiplier, 0, 2)) p.push(`multiplier ${e.multiplier}`);
      if (!isIntInRange(e.duration, 2, 3)) p.push(`duration ${e.duration}`);
      break;
    case 'sectorDemand':
      if (e.sectorId !== 'random' && !SECTOR_IDS.includes(e.sectorId)) p.push(`sectorId ${e.sectorId}`);
      // La crise réservée à la bulle est volontairement plus sévère que les news ordinaires.
      if (!inRange(e.multiplier, forcedCryptoCrash && e.sectorId === 'crypto' ? 0.35 : 0.75, 1.35)) p.push(`multiplier ${e.multiplier}`);
      if (!isIntInRange(e.duration, 1, 3)) p.push(`duration ${e.duration}`);
      break;
    case 'commodityPrice':
      if (e.commodityId !== 'random' && !COMMODITY_IDS.includes(e.commodityId)) p.push(`commodityId ${e.commodityId}`);
      if (!inRange(e.multiplier, 0.6, 1.6)) p.push(`multiplier ${e.multiplier}`);
      break;
    case 'commoditySupply':
      if (e.commodityId !== 'random' && !COMMODITY_IDS.includes(e.commodityId)) p.push(`commodityId ${e.commodityId}`);
      if (!inRange(e.multiplier, 0.7, 1.4)) p.push(`multiplier ${e.multiplier}`);
      if (!isIntInRange(e.duration, 2, 4)) p.push(`duration ${e.duration}`);
      break;
    case 'siteCost':
      if (e.commodityId !== 'random' && !COMMODITY_IDS.includes(e.commodityId)) p.push(`commodityId ${e.commodityId}`);
      if (!inRange(e.multiplier, 0.6, 2.5) || e.multiplier === 1) p.push(`multiplier ${e.multiplier}`);
      if (!isIntInRange(e.duration, 1, 4)) p.push(`duration ${e.duration}`);
      break;
    case 'interestRate':
      if (!inRange(Math.abs(e.delta), 0.002, 0.008)) p.push(`delta ${e.delta}`);
      if (!isIntInRange(e.duration, 1, 4)) p.push(`duration ${e.duration}`);
      break;
    case 'taxRate':
      if (!inRange(Math.abs(e.delta), 0.03, 0.08)) p.push(`delta ${e.delta}`);
      if (!isIntInRange(e.duration, 1, 4)) p.push(`duration ${e.duration}`);
      break;
    case 'laborCost':
      if (e.sectorId !== 'all' && !SECTOR_IDS.includes(e.sectorId)) p.push(`sectorId ${e.sectorId}`);
      if (!inRange(e.multiplier, 0.85, 1.2)) p.push(`multiplier ${e.multiplier}`);
      if (!isIntInRange(e.duration, 1, 4)) p.push(`duration ${e.duration}`);
      break;
    case 'zoneLabor':
      // Grève (jusqu'à +40 %) ou subvention (jusqu'à −20 %) dans une zone de la carte (§5.8).
      if (!ZONE_IDS.includes(e.zoneId)) p.push(`zoneId ${e.zoneId}`);
      if (!inRange(e.multiplier, 0.8, 1.4) || e.multiplier === 1) p.push(`multiplier ${e.multiplier}`);
      if (!isIntInRange(e.duration, 1, 4)) p.push(`duration ${e.duration}`);
      break;
    case 'transportCost':
      // Gazole, péages, routes coupées : tout le transport, pas plus de ×2 (§5.8).
      if (!inRange(e.multiplier, 0.6, 2) || e.multiplier === 1) p.push(`multiplier ${e.multiplier}`);
      if (!isIntInRange(e.duration, 1, 4)) p.push(`duration ${e.duration}`);
      break;
    case 'marketSentiment':
      if (!inRange(e.multiplier, 0.85, 1.15)) p.push(`multiplier ${e.multiplier}`);
      break;
    case 'companySentiment':
      if (!isValidTarget(e.target)) p.push(`target ${JSON.stringify(e.target)}`);
      if (!inRange(e.multiplier, 0.7, 1.25)) p.push(`multiplier ${e.multiplier}`);
      break;
    case 'companyCash':
      if (!isValidTarget(e.target)) p.push(`target ${JSON.stringify(e.target)}`);
      if (!inRange(e.pctOfCash, -0.15, 0.1)) p.push(`pctOfCash ${e.pctOfCash}`);
      if (e.flat !== undefined && !inRange(e.flat, -1000, 1000)) p.push(`flat ${e.flat}`);
      if (e.pctOfCash === 0 && !e.flat) p.push('effet nul');
      break;
    case 'scandal':
      if (!isValidTarget(e.target)) p.push(`target ${JSON.stringify(e.target)}`);
      if (!inRange(Math.abs(e.delta), 10, 30)) p.push(`delta ${e.delta}`);
      break;
    case 'reputation':
      if (!isValidTarget(e.target)) p.push(`target ${JSON.stringify(e.target)}`);
      if (!inRange(Math.abs(e.delta), 0.05, 0.15)) p.push(`delta ${e.delta}`);
      break;
    default: {
      const never: never = e;
      p.push(`type inconnu ${JSON.stringify(never)}`);
    }
  }
  return p;
}

function companyTargets(card: NewsCard): CompanyTarget[] {
  return card.effects.flatMap((e) => ('target' in e ? [e.target] : []));
}
function sectorRefs(card: NewsCard): string[] {
  return card.effects.flatMap((e) =>
    e.type === 'sectorDemand' || e.type === 'laborCost' ? [e.sectorId as string] : [],
  );
}
function commodityRefs(card: NewsCard): string[] {
  return card.effects.flatMap((e) =>
    e.type === 'commodityPrice' || e.type === 'commoditySupply' || e.type === 'siteCost' ? [e.commodityId as string] : [],
  );
}

/** Tous les textes affichés, pour les vérifications typographiques. */
function allTexts(): string[] {
  return [
    ...NEWS_CARDS.flatMap((c) => [c.headline, c.body, c.rumor ?? '']),
    ...FAKE_RUMORS.map((r) => r.text),
    ...Object.values(HEADLINES).flat(),
    ...BOT_PERSONALITIES.flatMap((b) => [b.ceoName, b.companyName, b.tagline, ...b.quotes, ...Object.values(b.farewells).flat(), ...Object.values(b.landQuotes ?? {}).flat()]),
    ...NPC_COMPANIES.flatMap((n) => [n.name, n.ceoName, n.description, n.productName]),
    ...Object.values(TROPHIES).flatMap((t) => [t.title, t.description]),
    ...Object.values(PRODUCT_NAME_IDEAS).flat(),
    ...COMPANY_NAME_IDEAS,
    ...Object.values(SHADY_INFO).flatMap((s) => [s.label, s.description]),
    ...Object.values(ACTION_QUIPS).flat(),
    ...REFUSAL_QUIPS,
    ...Object.values(SITE_NAMES).flat(),
    ...Object.values(HEX_NAMES),
    ...mapTexts(MAP_NAMES),
  ];
}

describe('contenu : news', () => {
  it('a au moins 45 cartes aux ids uniques en snake_case', () => {
    expect(NEWS_CARDS.length).toBeGreaterThanOrEqual(45);
    const ids = NEWS_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
  });

  it('couvre les 8 catégories, tous les types d’effets, tous les secteurs et toutes les matières', () => {
    const categories = new Set([...NEWS_CARDS, ...TERRAIN_CONTENT.newsCards].map((c) => c.category));
    for (const cat of Object.keys(CATEGORY_SET)) expect(categories, cat).toContain(cat);

    const effectTypes = new Set([...NEWS_CARDS, ...TERRAIN_CONTENT.newsCards].flatMap((c) => c.effects.map((e) => e.type)));
    for (const t of Object.keys(EFFECT_TYPE_SET)) expect(effectTypes, t).toContain(t);

    const sectors = new Set<string>();
    const commodities = new Set<string>();
    for (const c of NEWS_CARDS) {
      sectorRefs(c).forEach((s) => sectors.add(s));
      commodityRefs(c).forEach((m) => commodities.add(m));
      for (const t of companyTargets(c)) if (typeof t === 'object') sectors.add(t.sectorId);
    }
    for (const s of SECTOR_IDS) expect(sectors, s).toContain(s);
    for (const m of COMMODITY_IDS) expect(commodities, m).toContain(m);
  });

  it('utilise toutes les cibles d’entreprise', () => {
    const kinds = new Set(
      NEWS_CARDS.flatMap((c) => companyTargets(c).map((t) => (typeof t === 'string' ? t : 'sector'))),
    );
    for (const k of ['all', 'random', 'richest', 'smallest', 'mostScandalous', 'topProfit', 'playerCompanies', 'sector']) {
      expect(kinds, k).toContain(k);
    }
  });

  it('a des effets valides et des multiplicateurs dans les bornes', () => {
    const problems: string[] = [];
    for (const c of NEWS_CARDS) {
      if (c.effects.length === 0) problems.push(`${c.id} : aucun effet`);
      for (const e of c.effects) for (const p of effectProblems(e, FORCED_CRYPTO_NEWS.has(c.id) && c.id.startsWith('crypto_crash_'))) problems.push(`${c.id} (${e.type}) : ${p}`);
    }
    expect(problems).toEqual([]);
  });

  it('a des poids et des bornes de tours cohérents', () => {
    for (const c of NEWS_CARDS) {
      if (FORCED_CRYPTO_NEWS.has(c.id)) expect(c.weight, `${c.id} forced`).toBe(0);
      else expect(inRange(c.weight, 0.5, 2), `${c.id} weight`).toBe(true);
      if (c.minTurn !== undefined) expect(c.minTurn, c.id).toBeGreaterThanOrEqual(1);
      if (c.minTurn !== undefined && c.maxTurn !== undefined) expect(c.minTurn, c.id).toBeLessThanOrEqual(c.maxTurn);
    }
    expect(NEWS_CARDS.some((c) => (c.minTurn ?? 1) >= 5), 'au moins une grosse crise tardive').toBe(true);
    // Le premier tour doit toujours avoir de quoi tirer.
    expect(NEWS_CARDS.filter((c) => (c.minTurn ?? 1) <= 1).length).toBeGreaterThanOrEqual(30);
  });

  it('mélange bonnes et mauvaises nouvelles, et environ la moitié ont une rumeur', () => {
    const good = NEWS_CARDS.filter((c) => c.tone === 'good').length;
    const bad = NEWS_CARDS.filter((c) => c.tone === 'bad').length;
    expect(good).toBeGreaterThanOrEqual(12);
    expect(bad).toBeGreaterThanOrEqual(12);
    const withRumor = NEWS_CARDS.filter((c) => c.rumor).length / NEWS_CARDS.length;
    expect(withRumor).toBeGreaterThanOrEqual(0.35);
    expect(withRumor).toBeLessThanOrEqual(0.65);
  });

  it('respecte les règles de placeholders', () => {
    const problems: string[] = [];
    for (const c of NEWS_CARDS) {
      const ph = placeholders(c.headline);
      for (const p of ph) if (!['company', 'ceo', 'sector', 'commodity'].includes(p)) problems.push(`${c.id} : {${p}} inconnu`);
      if (placeholders(c.body).length) problems.push(`${c.id} : placeholder dans le corps`);
      if (c.rumor && placeholders(c.rumor).length) problems.push(`${c.id} : placeholder dans la rumeur`);

      // Entreprise
      const targets = companyTargets(c);
      const singles = new Set(targets.filter((t) => typeof t === 'string' && SINGLE_TARGETS.has(t)));
      const namesCompany = ph.includes('company') || ph.includes('ceo');
      if (namesCompany) {
        const first = targets[0];
        if (typeof first !== 'string' || !SINGLE_TARGETS.has(first)) problems.push(`${c.id} : {company}/{ceo} sans cible unique en premier`);
      }
      if (singles.size > 1) problems.push(`${c.id} : plusieurs cibles uniques différentes`);
      if (singles.size === 1 && !namesCompany) problems.push(`${c.id} : cible unique non nommée dans le titre`);

      // Secteur
      const sectors = sectorRefs(c);
      const randomSectors = sectors.filter((s) => s === 'random').length;
      if (randomSectors > 1) problems.push(`${c.id} : plusieurs secteurs 'random'`);
      if (ph.includes('sector') && sectors[0] !== 'random') problems.push(`${c.id} : {sector} sans secteur 'random' en premier`);
      if (randomSectors === 1 && !ph.includes('sector')) problems.push(`${c.id} : secteur 'random' non nommé`);

      // Matière
      const commodities = commodityRefs(c);
      const randomCommodities = commodities.filter((m) => m === 'random').length;
      if (randomCommodities > 1) problems.push(`${c.id} : plusieurs matières 'random'`);
      if (ph.includes('commodity') && commodities[0] !== 'random') problems.push(`${c.id} : {commodity} sans matière 'random' en premier`);
      if (randomCommodities === 1 && !ph.includes('commodity')) problems.push(`${c.id} : matière 'random' non nommée`);
    }
    expect(problems).toEqual([]);
  });

  it('a au moins 15 fausses rumeurs aux ids uniques, distinctes des vraies', () => {
    expect(FAKE_RUMORS.length).toBeGreaterThanOrEqual(15);
    const ids = FAKE_RUMORS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const realRumors = new Set(NEWS_CARDS.map((c) => c.rumor).filter(Boolean));
    for (const r of FAKE_RUMORS) {
      expect(r.text.length).toBeGreaterThan(20);
      expect(placeholders(r.text)).toEqual([]);
      expect(realRumors.has(r.text), r.id).toBe(false);
    }
  });
});

describe('contenu : titres dynamiques', () => {
  it('chaque clé a au moins 4 variantes avec les bons placeholders', () => {
    const problems: string[] = [];
    for (const key of Object.keys(HEADLINE_PLACEHOLDERS) as (keyof HeadlineTemplates)[]) {
      const variants = HEADLINES[key];
      if (!variants || variants.length < 4) problems.push(`${key} : ${variants?.length ?? 0} variantes`);
      const { allowed, required } = HEADLINE_PLACEHOLDERS[key];
      for (const v of variants ?? []) {
        const ph = placeholders(v);
        for (const p of ph) if (!allowed.includes(p)) problems.push(`${key} : {${p}} interdit dans « ${v} »`);
        for (const r of required) if (!ph.includes(r)) problems.push(`${key} : {${r}} manquant dans « ${v} »`);
      }
      if (new Set(variants).size !== variants.length) problems.push(`${key} : doublons`);
    }
    expect(Object.keys(HEADLINES).sort()).toEqual(Object.keys(HEADLINE_PLACEHOLDERS).sort());
    expect(problems).toEqual([]);
  });
});

describe('contenu : bots et PNJ', () => {
  it('a cinq situations foncières de trois citations par bot, aux seuls placeholders publics', () => {
    const situations = ['won', 'overpaid', 'lostToHuman', 'lostToBot', 'fallback'];
    const allowed = ['hex', 'price', 'winner', 'company', 'bidders'];
    for (const b of BOT_PERSONALITIES) {
      expect(b.landQuotes, b.id).toBeDefined();
      expect(Object.keys(b.landQuotes ?? {}).sort(), b.id).toEqual([...situations].sort());
      for (const [situation, lines] of Object.entries(b.landQuotes ?? {})) {
        const label = `${b.id}.${situation}`;
        expect(lines.length, label).toBe(3);
        expect(new Set(lines).size, label).toBe(lines.length);
        for (const line of lines) {
          expect(line.startsWith('« '), label).toBe(true);
          expect(line.endsWith(' »'), label).toBe(true);
          for (const ph of placeholders(line)) expect(allowed, `${label}: {${ph}}`).toContain(ph);
        }
      }
    }
  });

  it('a 6 bots contrastés aux paramètres dans les bornes', () => {
    expect(BOT_PERSONALITIES.length).toBe(6);
    const ids = BOT_PERSONALITIES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const covered = new Set<string>();
    for (const b of BOT_PERSONALITIES) {
      for (const k of ['aggressiveness', 'riskTolerance', 'marketingBias', 'rndBias', 'shadyPropensity', 'greed'] as const) {
        expect(inRange(b[k], 0, 1), `${b.id}.${k}`).toBe(true);
      }
      expect(inRange(b.pricePremium, 0.85, 1.3), `${b.id}.pricePremium`).toBe(true);
      expect(b.preferredSectors.length).toBeGreaterThan(0);
      for (const s of b.preferredSectors) {
        expect(SECTOR_IDS).toContain(s);
        covered.add(s);
      }
      expect(b.quotes.length, b.id).toBeGreaterThanOrEqual(4);
      for (const q of b.quotes) {
        expect(q.startsWith('« '), q).toBe(true);
        expect(q.endsWith(' »'), q).toBe(true);
      }
      expect(b.emoji.length).toBeGreaterThan(0);
      expect(b.tagline.length).toBeGreaterThan(0);
    }
    expect([...covered].sort()).toEqual([...SECTOR_IDS].sort());
    // Contraste : au moins un bot très agressif, un très prudent, un très louche.
    expect(Math.max(...BOT_PERSONALITIES.map((b) => b.aggressiveness))).toBeGreaterThanOrEqual(0.8);
    expect(Math.min(...BOT_PERSONALITIES.map((b) => b.aggressiveness))).toBeLessThanOrEqual(0.2);
    expect(Math.max(...BOT_PERSONALITIES.map((b) => b.shadyPropensity))).toBeGreaterThanOrEqual(0.8);
  });

  it('a exactement une entreprise PNJ par secteur', () => {
    expect(NPC_COMPANIES.length).toBe(SECTOR_IDS.length);
    expect(NPC_COMPANIES.map((n) => n.sectorId).sort()).toEqual([...SECTOR_IDS].sort());
    const ids = NPC_COMPANIES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of NPC_COMPANIES) expect(inRange(n.sizeFactor, 0.6, 1.2), `${n.id}.sizeFactor`).toBe(true);
  });

  it('a des tickers de 3-4 lettres uniques entre bots et PNJ, et des noms distincts', () => {
    const tickers = [...BOT_PERSONALITIES.map((b) => b.ticker), ...NPC_COMPANIES.map((n) => n.ticker)];
    for (const t of tickers) expect(t).toMatch(/^[A-Z]{3,4}$/);
    expect(new Set(tickers).size).toBe(tickers.length);
    const names = [...BOT_PERSONALITIES.map((b) => b.companyName), ...NPC_COMPANIES.map((n) => n.name)];
    expect(new Set(names).size).toBe(names.length);
    for (const idea of COMPANY_NAME_IDEAS) expect(names, idea).not.toContain(idea);
  });
});

describe('contenu : trophées', () => {
  it('a un texte pour chaque TrophyId', () => {
    for (const id of TROPHY_IDS) {
      const t = TROPHIES[id];
      expect(t, id).toBeDefined();
      expect(t.id).toBe(id);
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.emoji.length).toBeGreaterThan(0);
    }
  });
});

describe('contenu : saveur', () => {
  it('propose au moins 8 noms de produits par secteur et 20 noms d’entreprise', () => {
    for (const s of SECTOR_IDS) {
      const names = PRODUCT_NAME_IDEAS[s];
      expect(names.length, s).toBeGreaterThanOrEqual(8);
      expect(new Set(names).size).toBe(names.length);
    }
    expect(COMPANY_NAME_IDEAS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(COMPANY_NAME_IDEAS).size).toBe(COMPANY_NAME_IDEAS.length);
  });

  it('décrit chaque action discutable', () => {
    for (const k of SHADY_KINDS) {
      expect(SHADY_INFO[k], k).toBeDefined();
      expect(SHADY_INFO[k].label.length).toBeGreaterThan(0);
      expect(SHADY_INFO[k].description.length).toBeGreaterThan(0);
    }
  });

  it('ACTION_QUIPS couvre tous les types d’action et toutes les actions discutables', () => {
    for (const key of [...ACTION_TYPES, ...SHADY_KINDS]) {
      const quips = ACTION_QUIPS[key];
      expect(quips, key).toBeDefined();
      expect(quips.length, key).toBeGreaterThanOrEqual(2);
      for (const q of quips) expect(placeholders(q), key).toEqual([]);
    }
  });

  it('SITE_NAMES : au moins huit noms de filiale distincts par matière (trois sont tirés par partie)', () => {
    expect(Object.keys(SITE_NAMES).sort()).toEqual([...COMMODITY_IDS].sort());
    for (const cid of COMMODITY_IDS) {
      expect(SITE_NAMES[cid].length, cid).toBeGreaterThanOrEqual(8);
      expect(new Set(SITE_NAMES[cid]).size, cid).toBe(SITE_NAMES[cid].length);
    }
  });

  it('a au moins 8 petites phrases de refus', () => {
    expect(REFUSAL_QUIPS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(REFUSAL_QUIPS).size).toBe(REFUSAL_QUIPS.length);
  });
});

describe('contenu : typographie', () => {
  it('utilise l’apostrophe typographique partout', () => {
    const offenders = allTexts().filter((t) => t.includes("'"));
    expect(offenders).toEqual([]);
  });

  it('n’a pas de texte vide ni d’espaces parasites', () => {
    for (const t of allTexts().filter((x) => x !== '')) {
      expect(t, t).toBe(t.trim());
      expect(t.includes('  '), t).toBe(false);
    }
  });
});
