import { describe, expect, it } from 'vitest';
import { SECTOR_IDS } from '../src/types';
import { PAPER_FR, type PaperContent, type PaperFigureKind, type PaperLetterTrigger } from '../src/content/fr/paper';
import { EN_CONTENT_FULL as EN } from '../src/content/en';
import { getContent } from '../src/content';
import { fillTemplate } from '../src/sim/util';

const BASE_PLACEHOLDERS = ['city', 'zone', 'landmark', 'sector', 'product', 'commodity'];
const QUARTER_TRIGGERS: PaperLetterTrigger[] = ['bigProfit', 'bigLoss', 'scandal', 'bankruptcy'];
const ALL_TRIGGERS: PaperLetterTrigger[] = ['uneGood', 'uneBad', 'uneNeutral', ...QUARTER_TRIGGERS, 'any'];
const SIGN_IDS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
];
const FIGURE_KINDS: PaperFigureKind[] = ['fines', 'bonuses', 'dividends', 'commodity', 'sector', 'tax', 'gap', 'turns'];

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}
function sorted(o: object): string[] {
  return Object.keys(o).sort();
}

/** Every text of a paper bundle, for the typography checks. */
function paperTexts(p: PaperContent): string[] {
  return [
    ...Object.values(p.sectorProducts).flat(),
    ...p.signs.flatMap((s) => [s.name, ...s.texts.map((t) => t.text)]),
    ...p.oddNews.map((e) => e.text),
    ...p.letters.map((l) => l.text),
    ...p.signatures.map((s) => s.text),
    ...p.ads.flatMap((a) => [a.head, a.text]),
    ...Object.values(p.figureQuips).flat(),
    ...Object.values(p.reclame.templates).flat().map((t) => t.text),
    ...p.reclame.legal.map((l) => l.text),
  ];
}

describe.each(['fr', 'en'] as const)('paper content (%s)', (lang) => {
  const paper = getContent(lang).paper;

  it('has the 12 signs with at least 6 texts each, at most 140 characters', () => {
    expect(paper.signs.map((s) => s.id)).toEqual(SIGN_IDS);
    for (const sign of paper.signs) {
      expect(sign.texts.length, sign.id).toBeGreaterThanOrEqual(6);
      expect(sign.name.length, sign.id).toBeGreaterThan(0);
      const ids = sign.texts.map((t) => t.id);
      expect(new Set(ids).size, sign.id).toBe(ids.length);
      for (const t of sign.texts) {
        expect(t.id.startsWith(`${sign.id}-`), t.id).toBe(true);
        expect(t.text.length, t.id).toBeLessThanOrEqual(140);
      }
    }
  });

  it('has at least 60 odd news items, each at most 200 characters starting with a place', () => {
    expect(paper.oddNews.length).toBeGreaterThanOrEqual(60);
    for (const e of paper.oddNews) {
      expect(e.text.length, e.id).toBeLessThanOrEqual(200);
      expect(e.text, e.id).toMatch(/^\{(city|zone|landmark)\}\./);
    }
  });

  it('has at least 48 letters, 6 per trigger, each at most 220 characters', () => {
    expect(paper.letters.length).toBeGreaterThanOrEqual(48);
    for (const trigger of ALL_TRIGGERS) {
      const letters = paper.letters.filter((l) => l.trigger === trigger);
      expect(letters.length, trigger).toBeGreaterThanOrEqual(6);
    }
    for (const l of paper.letters) {
      expect(ALL_TRIGGERS, l.id).toContain(l.trigger);
      expect(l.text.length, l.id).toBeLessThanOrEqual(220);
    }
  });

  it('has at least 24 signatures and 60 ads (text at most 160 characters)', () => {
    expect(paper.signatures.length).toBeGreaterThanOrEqual(24);
    expect(paper.ads.length).toBeGreaterThanOrEqual(60);
    for (const s of paper.signatures) expect(s.text.length, s.id).toBeGreaterThan(0);
    for (const a of paper.ads) {
      expect(a.head.length, a.id).toBeGreaterThan(0);
      expect(a.text.length, a.id).toBeLessThanOrEqual(160);
    }
  });

  it('has at least 5 quips per figure kind and product words per sector', () => {
    for (const kind of FIGURE_KINDS) expect(paper.figureQuips[kind].length, kind).toBeGreaterThanOrEqual(5);
    for (const s of SECTOR_IDS) {
      expect(paper.sectorProducts[s].length, s).toBeGreaterThanOrEqual(1);
      for (const p of paper.sectorProducts[s]) expect(p.length, s).toBeGreaterThan(0);
    }
  });

  it('uses only allowed placeholders, with {company}/{amount} restricted to quarterly letters', () => {
    const problems: string[] = [];
    const check = (id: string, text: string, allowCompany: boolean) => {
      for (const p of placeholders(text)) {
        const ok = BASE_PLACEHOLDERS.includes(p) || (allowCompany && (p === 'company' || p === 'amount'));
        if (!ok) problems.push(`${id} : {${p}} not allowed in “${text}”`);
      }
    };
    for (const sign of paper.signs) for (const t of sign.texts) check(t.id, t.text, false);
    for (const e of paper.oddNews) check(e.id, e.text, false);
    for (const s of paper.signatures) check(s.id, s.text, false);
    for (const a of paper.ads) {
      check(a.id, a.head, false);
      check(a.id, a.text, false);
    }
    for (const l of paper.letters) {
      const quarterly = QUARTER_TRIGGERS.includes(l.trigger);
      check(l.id, l.text, quarterly);
      const ph = placeholders(l.text);
      if (quarterly) {
        // Une faillite sans perte publiée n'a pas de montant : ses lettres peuvent s'en passer.
        const amountOptional = l.trigger === 'bankruptcy';
        if (!ph.includes('company') || (!amountOptional && !ph.includes('amount'))) problems.push(`${l.id} : {company} and {amount} required`);
      } else if (ph.includes('company') || ph.includes('amount')) {
        problems.push(`${l.id} : {company}/{amount} forbidden for trigger ${l.trigger}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('fills {product} in odd news and ads without a broken article', () => {
    const broken = lang === 'fr' ? /\b(de|en) une?\b/ : /\b(?:unsold|of) an?\b/;
    const products = Object.values(paper.sectorProducts).flat();
    const problems: string[] = [];
    const entries: [string, string][] = [
      ...paper.oddNews.map((e): [string, string] => [e.id, e.text]),
      ...paper.ads.map((a): [string, string] => [a.id, a.text]),
    ];
    for (const [id, text] of entries) {
      if (!text.includes('{product}')) continue;
      for (const product of products) {
        const filled = text.replaceAll('{product}', product);
        if (broken.test(filled)) problems.push(`${id} : “${filled}”`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('has at least 6 reclame templates per sector, {product} required, {product}/{company} only, and placeholder-free legal lines', () => {
    const problems: string[] = [];
    for (const sector of SECTOR_IDS) {
      const templates = paper.reclame.templates[sector];
      expect(templates.length, sector).toBeGreaterThanOrEqual(6);
      const ids = templates.map((t) => t.id);
      expect(new Set(ids).size, sector).toBe(ids.length);
      for (const t of templates) {
        const ph = placeholders(t.text);
        if (!ph.includes('product')) problems.push(`${t.id} : {product} required`);
        for (const p of ph) {
          if (p !== 'product' && p !== 'company') problems.push(`${t.id} : {${p}} not allowed`);
        }
      }
    }
    expect(paper.reclame.legal.length).toBeGreaterThanOrEqual(8);
    for (const l of paper.reclame.legal) {
      if (placeholders(l.text).length > 0) problems.push(`${l.id} : no placeholder allowed in legal lines`);
    }
    expect(problems).toEqual([]);
  });

  it('fills {product} in reclame templates without a broken article or elision', () => {
    const broken =
      lang === 'fr' ? /(?<![A-Za-zÀ-ÿ])(?:de|que) [aeiouàâäéèêëîïôöùûüh]/i : /(?<![A-Za-zÀ-ÿ])[Aa] [aeiou]/i;
    const problems: string[] = [];
    for (const sector of SECTOR_IDS) {
      for (const t of paper.reclame.templates[sector]) {
        for (const product of ['Ultra-Trott', 'Épice', 'Yaourtix']) {
          const filled = fillTemplate(t.text, { product, company: 'TestCo' }, lang);
          if (!filled.includes(product)) problems.push(`${t.id} : product name missing in “${filled}”`);
          if (filled.includes('{')) problems.push(`${t.id} : placeholder left in “${filled}”`);
          if (broken.test(filled)) problems.push(`${t.id} : “${filled}”`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps the turns quips free of hard-coded game length', () => {
    for (const quip of paper.figureQuips.turns) expect(quip).not.toMatch(/\b16\b|quatre ans|four years/i);
  });
});

describe('English paper content', () => {
  const en = getContent('en').paper;

  it('covers exactly the French ids in every pool', () => {
    expect(sorted(EN.paper.signs)).toEqual([...SIGN_IDS].sort());
    for (const sign of PAPER_FR.signs) {
      expect(sorted(EN.paper.signs[sign.id].texts), sign.id).toEqual(sign.texts.map((t) => t.id).sort());
    }
    expect(sorted(EN.paper.oddNews)).toEqual(PAPER_FR.oddNews.map((e) => e.id).sort());
    expect(sorted(EN.paper.letters)).toEqual(PAPER_FR.letters.map((l) => l.id).sort());
    expect(sorted(EN.paper.signatures)).toEqual(PAPER_FR.signatures.map((s) => s.id).sort());
    expect(sorted(EN.paper.ads)).toEqual(PAPER_FR.ads.map((a) => a.id).sort());
    expect(sorted(EN.paper.figureQuips)).toEqual([...FIGURE_KINDS].sort());
    expect(sorted(EN.paper.sectorProducts)).toEqual([...SECTOR_IDS].sort());
    expect(sorted(EN.paper.reclame.templates)).toEqual([...SECTOR_IDS].sort());
    for (const sector of SECTOR_IDS) {
      expect(sorted(EN.paper.reclame.templates[sector]), sector).toEqual(
        PAPER_FR.reclame.templates[sector].map((t) => t.id).sort(),
      );
    }
    expect(sorted(EN.paper.reclame.legal)).toEqual(PAPER_FR.reclame.legal.map((l) => l.id).sort());
  });

  it('is the source of the merged bundle, with French ids kept', () => {
    expect(en.signs.map((s) => s.id)).toEqual(PAPER_FR.signs.map((s) => s.id));
    for (const sign of en.signs) {
      expect(sign.name).toBe(EN.paper.signs[sign.id].name);
      for (const t of sign.texts) expect(t.text, t.id).toBe(EN.paper.signs[sign.id].texts[t.id]);
    }
    for (const e of en.oddNews) expect(e.text, e.id).toBe(EN.paper.oddNews[e.id]);
    for (const l of en.letters) expect(l.text, l.id).toBe(EN.paper.letters[l.id]);
    for (const s of en.signatures) expect(s.text, s.id).toBe(EN.paper.signatures[s.id]);
    for (const a of en.ads) {
      expect(a.head, a.id).toBe(EN.paper.ads[a.id].head);
      expect(a.text, a.id).toBe(EN.paper.ads[a.id].text);
    }
    expect(en.figureQuips).toEqual(EN.paper.figureQuips);
    expect(en.sectorProducts).toBe(EN.paper.sectorProducts);
    for (const sector of SECTOR_IDS) {
      expect(en.reclame.templates[sector].map((t) => t.id), sector).toEqual(PAPER_FR.reclame.templates[sector].map((t) => t.id));
      for (const t of en.reclame.templates[sector]) expect(t.text, t.id).toBe(EN.paper.reclame.templates[sector][t.id]);
    }
    expect(en.reclame.legal.map((l) => l.id)).toEqual(PAPER_FR.reclame.legal.map((l) => l.id));
    for (const l of en.reclame.legal) expect(l.text, l.id).toBe(EN.paper.reclame.legal[l.id]);
    expect(getContent('fr').paper).toBe(PAPER_FR);
  });

  it('keeps the same placeholders as the French text, entry by entry', () => {
    const problems: string[] = [];
    const phSet = (t: string) => [...new Set(placeholders(t))].sort().join(',');
    for (const e of PAPER_FR.oddNews) {
      if (phSet(e.text) !== phSet(EN.paper.oddNews[e.id])) problems.push(`${e.id} : {${phSet(e.text)}} vs {${phSet(EN.paper.oddNews[e.id])}}`);
    }
    for (const l of PAPER_FR.letters) {
      if (phSet(l.text) !== phSet(EN.paper.letters[l.id])) problems.push(`${l.id} : {${phSet(l.text)}} vs {${phSet(EN.paper.letters[l.id])}}`);
    }
    for (const s of PAPER_FR.signatures) {
      if (phSet(s.text) !== phSet(EN.paper.signatures[s.id])) problems.push(`${s.id} : {${phSet(s.text)}} vs {${phSet(EN.paper.signatures[s.id])}}`);
    }
    for (const a of PAPER_FR.ads) {
      if (phSet(a.text) !== phSet(EN.paper.ads[a.id].text)) problems.push(`${a.id} : {${phSet(a.text)}} vs {${phSet(EN.paper.ads[a.id].text)}}`);
    }
    for (const sector of SECTOR_IDS) {
      for (const t of PAPER_FR.reclame.templates[sector]) {
        const enText = EN.paper.reclame.templates[sector][t.id];
        if (phSet(t.text) !== phSet(enText)) problems.push(`${t.id} : {${phSet(t.text)}} vs {${phSet(enText)}}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('has no French characters, no guillemets and no euros', () => {
    const offenders = paperTexts(en).filter((t) => /[àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ]/.test(t) || /[«»€]/.test(t));
    expect(offenders).toEqual([]);
  });

  it('uses curly quotes only, never straight double quotes', () => {
    const offenders = paperTexts(en).filter((t) => t.includes('"'));
    expect(offenders).toEqual([]);
  });

  it('never puts a or an directly before a placeholder', () => {
    const offenders = paperTexts(en).filter((t) => /\b[Aa]n? \{(sector|commodity|city|zone|landmark)\}/.test(t));
    expect(offenders).toEqual([]);
  });
});
