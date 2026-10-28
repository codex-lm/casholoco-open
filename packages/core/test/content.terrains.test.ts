import { describe, expect, it } from 'vitest';
import { getContent } from '../src/content';
import { TERRAIN_CONTENT } from '../src/content/fr/terrains';
import { EN_TERRAINS } from '../src/content/en/terrains';
import { hexById } from '../src/content/hexes';

function within(text: string, max: number, label: string) {
  expect(text.length, label).toBeGreaterThan(0);
  expect(text.length, label).toBeLessThanOrEqual(max);
}

describe('récits des terrains', () => {
  it('loads exactly the 61 blocks with complete English ids and identical mechanics', () => {
    const fr = getContent('fr').terrains, en = getContent('en').terrains;
    expect(fr.definitions).toHaveLength(8);
    expect(fr.newsCards).toHaveLength(29);
    expect(fr.settlements).toHaveLength(16);
    expect(fr.auctions).toHaveLength(6);
    expect(Object.keys(EN_TERRAINS.commissariat)).toEqual([fr.commissariat.id]);
    expect(Object.keys(EN_TERRAINS.editorial)).toEqual([fr.editorial.id]);
    for (const group of ['definitions', 'newsCards', 'settlements', 'auctions'] as const) {
      expect(Object.keys(EN_TERRAINS[group]).sort()).toEqual(fr[group].map((x) => x.id).sort());
      expect(en[group].map((x) => x.id)).toEqual(fr[group].map((x) => x.id));
    }
    for (let i = 0; i < fr.definitions.length; i++) {
      const terrain = fr.definitions[i];
      expect(hexById(terrain.hex)).toBeDefined();
      expect(en.definitions[i].effects).toEqual(terrain.effects);
      expect(en.definitions[i].hex).toEqual(terrain.hex);
      expect(en.definitions[i].name).not.toBe(terrain.name);
      expect(fr.settlements.filter((a) => a.terrain === terrain.id)).toHaveLength(2);
      expect(fr.newsCards.filter((c) => c.effects.some((e) => e.type === 'terrain' && e.terrain === terrain.id))).toHaveLength(3);
    }
    expect(en.newsCards.map((c) => c.effects)).toEqual(fr.newsCards.map((c) => c.effects));
    expect(en.newsCards.map((c) => c.quarters)).toEqual(fr.newsCards.map((c) => c.quarters));
    expect(fr.newsCards.flatMap((c) => c.effects).filter((e) => e.type === 'terrain' && e.suspend)).toEqual([
      { type: 'terrain', terrain: 'portes-petit-rabais', lever: 'labor', suspend: true, duration: 2 },
      { type: 'terrain', terrain: 'monts-defiscalises', lever: 'tax', suspend: true, duration: 3 },
      { type: 'terrain', terrain: 'ile-aux-niches', lever: 'tax', suspend: true, duration: 3 },
    ]);
  });

  it.each(['fr', 'en'] as const)('%s obeys narrative character limits and allowed placeholders', (lang) => {
    const c = getContent(lang).terrains;
    within(c.commissariat.name, 100, 'agency name');
    within(c.commissariat.acronym, 100, 'acronym');
    within(c.commissariat.motto, 200, 'motto');
    within(c.commissariat.blurb, 200, 'agency blurb');
    within(c.editorial.headline, 100, 'editorial headline');
    within(c.editorial.body, 280, 'editorial body');
    for (const t of c.definitions) {
      within(t.name, 100, t.id);
      within(t.blurb, 200, t.id);
      within(t.allocation.headline, 100, t.id);
      within(t.allocation.body, 280, t.id);
      // Le signe de pourcentage isolé ne compte pas pour un mot (« Impôt à 5 % »).
      for (const label of [t.strengthLabel, t.counterLabel]) if (label) expect(label.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length, label).toBeLessThanOrEqual(3);
    }
    for (const n of c.newsCards) {
      within(n.headline, 110, n.id); within(n.body, 280, n.id);
      if (n.rumor) within(n.rumor, 200, n.id);
    }
    for (const a of c.settlements) { within(a.headline, 100, a.id); within(a.body, 260, a.id); }
    for (const a of c.auctions) { within(a.headline, 100, a.id); within(a.body, 200, a.id); }
    const texts = JSON.stringify(c);
    for (const m of texts.matchAll(/\{(\w+)\}/g)) expect(['company', 'ceo', 'product', 'hex', 'bidders', 'price']).toContain(m[1]);
    if (lang === 'en') expect(texts).toMatch(/^[\x00-\x7f]*$/);
    else expect(texts).not.toMatch(/[\p{L}]'[\p{L}]/u);
  });

  it('conserve les variables par texte bilingue, sauf les trois adaptations explicites', () => {
    const fr = getContent('fr').terrains, en = getContent('en').terrains;
    const differences: Record<string, { fr: string[]; en: string[] }> = {
      'ristourne-le-bourg.allocation.body': { fr: ['company'], en: ['ceo', 'company'] },
      'loc-monts-defiscalises-1.headline': { fr: [], en: ['company'] },
      'settle-ristourne-le-bourg-1.body': { fr: ['company', 'product'], en: ['product'] },
    };
    const seen = new Set<string>();
    const vars = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
    function check(id: string, left: string, right: string, allowed: string[]) {
      const l = vars(left), r = vars(right);
      for (const variable of [...l, ...r]) expect(allowed, id).toContain(variable);
      const adaptation = differences[id];
      if (adaptation) {
        seen.add(id);
        expect({ fr: l, en: r }, id).toEqual(adaptation);
      } else expect(r, id).toEqual(l);
    }
    for (let i = 0; i < fr.definitions.length; i++) {
      const a = fr.definitions[i], b = en.definitions[i];
      for (const field of ['headline', 'body'] as const) {
        check(`${a.id}.allocation.${field}`, a.allocation[field], b.allocation[field], ['company', 'ceo', 'product']);
      }
    }
    for (const group of ['newsCards', 'settlements', 'auctions'] as const) {
      for (let i = 0; i < fr[group].length; i++) {
        const a = fr[group][i], b = en[group][i];
        const allowed = group === 'auctions' ? ['company', 'hex', 'bidders', 'price'] : ['company', 'ceo', 'product'];
        for (const field of ['headline', 'body'] as const) check(`${a.id}.${field}`, a[field], b[field], allowed);
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(differences).sort());
  });

  it('l’île annonce ses quatre atouts (zéro impôt, duty free, revente 80 %, scandale) dans les deux langues', () => {
    const fr = getContent('fr').terrains, en = getContent('en').terrains;
    const frIle = fr.definitions.find((t) => t.id === 'ile-aux-niches')!;
    const enIle = en.definitions.find((t) => t.id === 'ile-aux-niches')!;
    for (const text of [frIle.blurb, frIle.allocation.body]) {
      expect(text).toContain('duty free');
      expect(text).toContain('80 %');
    }
    expect(frIle.allocation.body).toContain('4 %');
    for (const text of [enIle.blurb, enIle.allocation.body]) {
      expect(text).toContain('duty-free');
      expect(text).toContain('80%');
    }
    expect(enIle.allocation.body).toContain('4%');
    const expected: Record<'fr' | 'en', string[]> = {
      fr: ['impôt', '4 %', '80 %', 'x1,5'],
      en: ['tax', '4%', '80%', 'x1.5'],
    };
    for (const lang of ['fr', 'en'] as const) {
      const c = lang === 'fr' ? fr : en;
      for (const id of ['settle-ile-aux-niches-1', 'settle-ile-aux-niches-2']) {
        const body = c.settlements.find((a) => a.id === id)!.body;
        for (const perk of expected[lang]) expect(body, `${id} (${lang})`).toContain(perk);
      }
    }
  });

  it('keeps the classic deck separate from the hex-only local deck', () => {
    for (const lang of ['fr', 'en'] as const) {
      expect(getContent(lang).newsCards.some((c) => c.effects.some((e) => e.type === 'terrain' || e.type === 'heat'))).toBe(false);
      expect(getContent(lang).terrains.newsCards).toHaveLength(TERRAIN_CONTENT.newsCards.length);
    }
  });
});
