import { describe, expect, it } from 'vitest';
import { COMMODITY_IDS, SECTOR_IDS, SHADY_KINDS, TROPHY_IDS, type HeadlineTemplates, type LandSituation } from '../src/types';
import { FAKE_RUMORS, NEWS_CARDS } from '../src/content/fr/news';
import { HEADLINES } from '../src/content/fr/headlines';
import { BOT_PERSONALITIES, NPC_COMPANIES } from '../src/content/fr/bots';
import { TROPHIES } from '../src/content/fr/trophies';
import { ACTION_QUIPS, SHADY_INFO, SITE_NAMES } from '../src/content/fr/flavor';
import { COMMODITIES, SECTORS } from '../src/content/sectors';
import { HEX_NAMES } from '../src/content/fr/hexNames';
import { EN_CONTENT, EN_CONTENT_FULL as EN } from '../src/content/en';
import { getContent } from '../src/content';
import { mapTexts } from './helpers';

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}
function phSet(text: string): string[] {
  return [...new Set(placeholders(text))].sort();
}
function sortedKeys(o: object): string[] {
  return Object.keys(o).sort();
}

/** Allowed (and required) placeholders per HeadlineTemplates key, cf. types.ts. */
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

/** Every English text, for the typography checks. */
function allEnglishTexts(): string[] {
  return [
    ...Object.values(EN.sectors).flatMap((s) => [s.name, s.description]),
    ...Object.values(EN.commodities).flatMap((c) => [c.name, c.unit]),
    ...Object.values(EN.news).flatMap((n) => [n.headline, n.body, ...(n.rumor !== undefined ? [n.rumor] : [])]),
    ...Object.values(EN.fakeRumors),
    ...Object.values(EN.headlines).flat(),
    ...Object.values(EN.bots).flatMap((b) => [
      b.ceoName,
      b.companyName,
      b.ticker,
      b.tagline,
      ...b.quotes,
      ...Object.values(b.farewells).flat(),
      ...Object.values(b.landQuotes ?? {}).flat(),
    ]),
    ...Object.values(EN.npcs).flatMap((n) => [n.name, n.ticker, n.ceoName, n.description, n.productName]),
    ...Object.values(EN.trophies).flatMap((t) => [t.title, t.description]),
    ...Object.values(EN.productNameIdeas).flat(),
    ...EN.companyNameIdeas,
    ...Object.values(EN.shadyInfo).flatMap((s) => [s.label, s.description]),
    ...Object.values(EN.actionQuips).flat(),
    ...EN.refusalQuips,
    ...Object.values(EN.siteNames).flat(),
    ...Object.values(EN.hexNames),
    ...mapTexts(EN.mapNames),
  ];
}

describe('English content: coverage', () => {
  it('covers exactly the ids of the French content', () => {
    expect(sortedKeys(EN.news)).toEqual(NEWS_CARDS.map((c) => c.id).sort());
    expect(sortedKeys(EN.fakeRumors)).toEqual(FAKE_RUMORS.map((r) => r.id).sort());
    expect(sortedKeys(EN.bots)).toEqual(BOT_PERSONALITIES.map((b) => b.id).sort());
    expect(sortedKeys(EN.npcs)).toEqual(NPC_COMPANIES.map((n) => n.id).sort());
    expect(sortedKeys(EN.trophies)).toEqual([...TROPHY_IDS].sort());
    expect(sortedKeys(EN.trophies)).toEqual(sortedKeys(TROPHIES));
    expect(sortedKeys(EN.sectors)).toEqual([...SECTOR_IDS].sort());
    expect(sortedKeys(EN.commodities)).toEqual([...COMMODITY_IDS].sort());
    expect(sortedKeys(EN.shadyInfo)).toEqual([...SHADY_KINDS].sort());
    expect(sortedKeys(EN.shadyInfo)).toEqual(sortedKeys(SHADY_INFO));
    expect(sortedKeys(EN.actionQuips)).toEqual(sortedKeys(ACTION_QUIPS));
    expect(sortedKeys(EN.hexNames)).toEqual(sortedKeys(HEX_NAMES));
    expect(sortedKeys(EN.headlines)).toEqual(sortedKeys(HEADLINES));
    expect(sortedKeys(EN.productNameIdeas)).toEqual([...SECTOR_IDS].sort());
    // Same number of site names as in French, so the same draw picks the same slots in both languages.
    expect(sortedKeys(EN.siteNames)).toEqual([...COMMODITY_IDS].sort());
    for (const cid of COMMODITY_IDS) {
      expect(EN.siteNames[cid].length, cid).toBe(SITE_NAMES[cid].length);
      expect(new Set(EN.siteNames[cid]).size, cid).toBe(EN.siteNames[cid].length);
    }
  });

  it('has no empty text', () => {
    for (const t of allEnglishTexts()) expect(t.length, JSON.stringify(t)).toBeGreaterThan(0);
  });
});

describe('English content: news', () => {
  it('has a rumor if and only if the French card has one', () => {
    const problems: string[] = [];
    for (const c of NEWS_CARDS) {
      const en = EN.news[c.id];
      if (!en) continue;
      if ((c.rumor !== undefined) !== (en.rumor !== undefined)) problems.push(c.id);
    }
    expect(problems).toEqual([]);
  });

  it('keeps the same headline placeholders, card by card, and none in bodies or rumors', () => {
    const problems: string[] = [];
    for (const c of NEWS_CARDS) {
      const en = EN.news[c.id];
      if (!en) continue;
      const fr = phSet(c.headline).join(',');
      const got = phSet(en.headline).join(',');
      if (fr !== got) problems.push(`${c.id} : {${fr}} vs {${got}}`);
      if (placeholders(en.body).length) problems.push(`${c.id} : placeholder in body`);
      if (en.rumor && placeholders(en.rumor).length) problems.push(`${c.id} : placeholder in rumor`);
    }
    expect(problems).toEqual([]);
  });

  it('has fake rumors distinct from real ones, with no placeholders', () => {
    const real = new Set(Object.values(EN.news).map((n) => n.rumor).filter(Boolean));
    for (const [id, text] of Object.entries(EN.fakeRumors)) {
      expect(text.length, id).toBeGreaterThan(20);
      expect(placeholders(text), id).toEqual([]);
      expect(real.has(text), id).toBe(false);
    }
  });
});

describe('English content: headlines', () => {
  it('has at least 4 distinct variants per key with the right placeholders', () => {
    const problems: string[] = [];
    for (const key of Object.keys(HEADLINE_PLACEHOLDERS) as (keyof HeadlineTemplates)[]) {
      const variants = EN.headlines[key];
      if (!variants || variants.length < 4) problems.push(`${key} : ${variants?.length ?? 0} variants`);
      const { allowed, required } = HEADLINE_PLACEHOLDERS[key];
      for (const v of variants ?? []) {
        const ph = placeholders(v);
        for (const p of ph) if (!allowed.includes(p)) problems.push(`${key} : {${p}} not allowed in “${v}”`);
        for (const r of required) if (!ph.includes(r)) problems.push(`${key} : {${r}} missing in “${v}”`);
      }
      if (new Set(variants).size !== variants.length) problems.push(`${key} : duplicates`);
      // Same set of placeholders used across the key as in French.
      const fr = [...new Set(HEADLINES[key].flatMap(placeholders))].sort().join(',');
      const en = [...new Set((variants ?? []).flatMap(placeholders))].sort().join(',');
      if (fr !== en) problems.push(`${key} : {${fr}} vs {${en}}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('English content: bots and NPCs', () => {
  it('keeps the French land situations and line counts with only public placeholders', () => {
    const allowed = ['hex', 'price', 'winner', 'company', 'bidders'];
    for (const fr of BOT_PERSONALITIES) {
      const en = EN.bots[fr.id];
      expect(en.landQuotes, fr.id).toBeDefined();
      expect(sortedKeys(en.landQuotes ?? {}), fr.id).toEqual(sortedKeys(fr.landQuotes ?? {}));
      for (const situation of Object.keys(fr.landQuotes ?? {}) as LandSituation[]) {
        const lines = en.landQuotes?.[situation] ?? [];
        const label = `${fr.id}.${situation}`;
        expect(lines.length, label).toBe(fr.landQuotes?.[situation].length);
        expect(lines.length, label).toBe(3);
        expect(new Set(lines).size, label).toBe(lines.length);
        for (const line of lines) {
          expect(line.startsWith('“'), label).toBe(true);
          expect(line.endsWith('”'), label).toBe(true);
          for (const ph of placeholders(line)) expect(allowed, `${label}: {${ph}}`).toContain(ph);
        }
      }
    }
  });

  it('has unique 3-4 letter tickers across bots and NPCs, and distinct names', () => {
    const tickers = [...Object.values(EN.bots).map((b) => b.ticker), ...Object.values(EN.npcs).map((n) => n.ticker)];
    for (const t of tickers) expect(t).toMatch(/^[A-Z]{3,4}$/);
    expect(new Set(tickers).size).toBe(tickers.length);
    const names = [...Object.values(EN.bots).map((b) => b.companyName), ...Object.values(EN.npcs).map((n) => n.name)];
    expect(new Set(names).size).toBe(names.length);
    for (const idea of EN.companyNameIdeas) expect(names, idea).not.toContain(idea);
  });

  it('gives each bot at least 4 quotes in English curly quotes', () => {
    for (const [id, b] of Object.entries(EN.bots)) {
      expect(b.quotes.length, id).toBeGreaterThanOrEqual(4);
      for (const q of b.quotes) {
        expect(q.startsWith('“'), q).toBe(true);
        expect(q.endsWith('”'), q).toBe(true);
      }
      expect(b.tagline.length, id).toBeGreaterThan(0);
    }
  });

  it('gives every bot 3 farewells per outcome, same counts in English', () => {
    const outcomes = ['won', 'podium', 'pack', 'ruined'] as const;
    for (const b of BOT_PERSONALITIES) {
      expect(Object.keys(b.farewells).sort(), b.id).toEqual([...outcomes].sort());
      for (const o of outcomes) {
        const lines = b.farewells[o];
        expect(lines.length, `${b.id}.${o}`).toBe(3);
        for (const line of lines) {
          expect(line.length, line).toBeGreaterThan(0);
          expect(line.startsWith('«'), line).toBe(true);
          expect(line.endsWith('»'), line).toBe(true);
          expect(/\{\w+\}/.test(line), line).toBe(false);
        }
      }
      const en = EN.bots[b.id];
      expect(Object.keys(en.farewells).sort(), b.id).toEqual([...outcomes].sort());
      for (const o of outcomes) {
        const lines = en.farewells[o];
        expect(lines.length, `${b.id}.${o}`).toBe(b.farewells[o].length);
        for (const line of lines) {
          expect(line.startsWith('“'), line).toBe(true);
          expect(line.endsWith('”'), line).toBe(true);
          expect(line.includes("'"), line).toBe(false);
          expect(/\{\w+\}/.test(line), line).toBe(false);
          expect(line.includes('€'), line).toBe(false);
        }
      }
    }
  });
});

describe('English content: flavor', () => {
  it('suggests at least 8 product names per sector and 20 company names', () => {
    for (const s of SECTOR_IDS) {
      const names = EN.productNameIdeas[s];
      expect(names.length, s).toBeGreaterThanOrEqual(8);
      expect(new Set(names).size).toBe(names.length);
    }
    expect(EN.companyNameIdeas.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EN.companyNameIdeas).size).toBe(EN.companyNameIdeas.length);
  });

  it('has at least 2 placeholder-free quips per action key and 8 refusal quips', () => {
    for (const [key, quips] of Object.entries(EN.actionQuips)) {
      expect(quips.length, key).toBeGreaterThanOrEqual(2);
      for (const q of quips) expect(placeholders(q), key).toEqual([]);
    }
    expect(EN.refusalQuips.length).toBeGreaterThanOrEqual(8);
    expect(new Set(EN.refusalQuips).size).toBe(EN.refusalQuips.length);
  });
});

describe('English content: typography', () => {
  it('has no leftover French characters', () => {
    const offenders = allEnglishTexts().filter((t) => /[éèàçùâêîôûœÉÈÀÇ«»]/.test(t));
    expect(offenders).toEqual([]);
  });

  it('talks dollars, not euros', () => {
    const offenders = allEnglishTexts().filter((t) => /€|\beuros?\b/i.test(t));
    expect(offenders).toEqual([]);
  });

  it('uses typographic apostrophes and has no stray spaces', () => {
    for (const t of allEnglishTexts()) {
      expect(t.includes("'"), t).toBe(false);
      expect(t, t).toBe(t.trim());
      expect(t.includes('  '), t).toBe(false);
    }
  });
});

describe('getContent("en")', () => {
  const en = getContent('en');
  const fr = getContent('fr');

  it('exposes the complete English content', () => {
    expect(EN_CONTENT).toBe(EN);
    expect(en.lang).toBe('en');
    expect(en.headlines).toBe(EN.headlines);
    expect(en.productNameIdeas).toBe(EN.productNameIdeas);
    expect(en.companyNameIdeas).toBe(EN.companyNameIdeas);
    expect(en.refusalQuips).toBe(EN.refusalQuips);
    expect(en.hexNames).toBe(EN.hexNames);
    for (const k of Object.keys(ACTION_QUIPS)) expect(en.actionQuips[k], k).toEqual(EN.actionQuips[k]);
  });

  it('replaces texts but keeps every number and id of the French data', () => {
    expect(en.newsCards.length).toBe(NEWS_CARDS.length);
    en.newsCards.forEach((c, i) => {
      const src = NEWS_CARDS[i];
      expect(c.id).toBe(src.id);
      expect(c.headline).toBe(EN.news[c.id].headline);
      expect(c.body).toBe(EN.news[c.id].body);
      expect(c.rumor).toBe(EN.news[c.id].rumor);
      expect(c.effects).toEqual(src.effects);
      expect(c.weight).toBe(src.weight);
      expect(c.tone).toBe(src.tone);
      expect(c.category).toBe(src.category);
      expect(c.minTurn).toBe(src.minTurn);
      expect(c.maxTurn).toBe(src.maxTurn);
    });
    en.fakeRumors.forEach((r, i) => {
      expect(r.id).toBe(FAKE_RUMORS[i].id);
      expect(r.text).toBe(EN.fakeRumors[r.id]);
      expect(r.commodityId).toBe(FAKE_RUMORS[i].commodityId);
    });
    en.bots.forEach((b, i) => {
      const src = BOT_PERSONALITIES[i];
      const t = EN.bots[b.id];
      expect({
        ceoName: b.ceoName,
        companyName: b.companyName,
        ticker: b.ticker,
        tagline: b.tagline,
        quotes: b.quotes,
        farewells: b.farewells,
        landQuotes: b.landQuotes,
      }).toEqual(t);
      expect(b.preferredSectors).toEqual(src.preferredSectors);
      expect(b.aggressiveness).toBe(src.aggressiveness);
      expect(b.pricePremium).toBe(src.pricePremium);
      expect(b.emoji).toBe(src.emoji);
    });
    en.npcCompanies.forEach((n, i) => {
      const src = NPC_COMPANIES[i];
      expect(n.name).toBe(EN.npcs[n.id].name);
      expect(n.ticker).toBe(EN.npcs[n.id].ticker);
      expect(n.productName).toBe(EN.npcs[n.id].productName);
      expect(n.sectorId).toBe(src.sectorId);
      expect(n.sizeFactor).toBe(src.sizeFactor);
    });
    for (const s of SECTOR_IDS) {
      expect(en.sectors[s].name).toBe(EN.sectors[s].name);
      expect({ ...en.sectors[s], name: '', description: '' }).toEqual({ ...SECTORS[s], name: '', description: '' });
    }
    for (const m of COMMODITY_IDS) {
      expect(en.commodities[m].name).toBe(EN.commodities[m].name);
      expect(en.commodities[m].basePrice).toBe(COMMODITIES[m].basePrice);
    }
    for (const t of TROPHY_IDS) {
      expect(en.trophies[t].title).toBe(EN.trophies[t].title);
      expect(en.trophies[t].emoji).toBe(TROPHIES[t].emoji);
    }
    for (const k of SHADY_KINDS) {
      expect(en.shadyInfo[k].label).toBe(EN.shadyInfo[k].label);
      expect(en.shadyInfo[k].emoji).toBe(SHADY_INFO[k].emoji);
    }
  });

  it('leaves the French content untouched', () => {
    expect(fr.lang).toBe('fr');
    expect(fr.newsCards).toBe(NEWS_CARDS);
    expect(fr.headlines).toBe(HEADLINES);
    expect(fr.bots).toBe(BOT_PERSONALITIES);
    expect(getContent()).toBe(fr);
  });
});
