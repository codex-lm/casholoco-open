import { describe, expect, it } from 'vitest';
import { getContent } from '../src/content';
import { applyAction, createGame, resolveTurn } from '../src/engine';
import { hexReservePrice } from '../src/sim/hexAuctions';
import { freeBuildableHexes } from '../src/sim/hexes';
import { textsFor } from '../src/sim/i18n';
import { fillTemplate } from '../src/sim/util';
import type { Lang } from '../src/types';
import { companyOf, config, human } from './helpers';

const POOLS = {
  fr: {
    headlines: [
      '{company} ouvre son usine et met {product} en rayon dans la foulée ({sector})',
      'Marteau tombé, rubans coupés : {product} de {company} est déjà en vente',
      '{sector} : {product} débarque en rayon, {company} n’a même pas attendu la peinture',
      'Adjugé, construit, livré : {company} lance {product} ce trimestre',
      '{company} inaugure son terrain avec {product}, en vente dès maintenant ({sector})',
      'Le Commissariat coupe le ruban, {company} coupe les prix : {product} arrive en rayon',
    ],
    bodies: [
      'L’usine sent encore la peinture fraîche ; les premiers cartons partent quand même ce trimestre.',
      'Le terrain a été payé comptant, le discours inaugural aussi.',
      'Le maire a coupé le ruban, le marketing a coupé la parole au maire.',
      'Les premiers clients découvrent le produit en même temps que les ouvriers.',
      'Le Commissariat salue « un aménagement exemplaire du territoire ». Il dit ça de tous les parkings.',
    ],
    fallback: '{company} lance {product} ({sector})',
  },
  en: {
    headlines: [
      '{company} opens its plant and puts {product} straight on the shelves ({sector})',
      'Gavel down, ribbon cut: {company}’s {product} is already on sale',
      '{sector}: {product} hits the shelves before {company} has even painted the walls',
      'Won, built, shipped: {company} launches {product} this quarter',
      '{company} christens its new plot with {product}, on sale now ({sector})',
      'The Agency cuts the ribbon, {company} cuts prices: {product} reaches the shelves',
    ],
    bodies: [
      'The plant still smells of fresh paint; the first boxes ship this quarter anyway.',
      'The land was paid in cash, and so was the opening speech.',
      'The mayor cut the ribbon; marketing cut the mayor off.',
      'The first customers discover the product at the same time as the workers.',
      'The Agency hails “exemplary regional development”. It says that about every parking lot.',
    ],
    fallback: '{company} launches {product} ({sector})',
  },
} satisfies Record<Lang, { headlines: string[]; bodies: string[]; fallback: string }>;

function fixture(lang: Lang, seed: number, totalTurns: number) {
  const state = createGame({ ...config(seed, totalTurns), mapMode: 'hex', lang,
    terrainAssignment: 'host', terrains: { b: 'monts-defiscalises' } }, [human('b', 'gadgets', 'Taylor')]);
  const company = companyOf(state, 'b');
  delete company.terrainId;
  state.activeEffects = [];
  for (const c of Object.values(state.companies)) {
    c.cash = 1e6;
    for (const p of c.products) { p.production = 0; p.marketing = 0; p.rnd = 0; p.stock = 0; }
  }
  const hexId = freeBuildableHexes(state)[0];
  const result = applyAction(state, 'b', { type: 'launchProduct', companyId: company.id,
    sectorId: 'energy_drinks', name: 'Fizz', hexId, bid: hexReservePrice(hexId), fallback: 'abandon' });
  expect(result.ok, result.message).toBe(true);
  return { state, company };
}

describe('hex launch flashes use on-sale-this-quarter pools', () => {
  for (const lang of ['fr', 'en'] as const) {
    it('provides the exact headline, body and fallback pools (' + lang + ')', () => {
      expect(getContent(lang).headlines.hexProductLaunch).toEqual(POOLS[lang].headlines);
      expect(textsFor(lang).bodies.hexProductLaunch).toEqual(POOLS[lang].bodies);
      expect(textsFor(lang).fallbackHeadlines.hexProductLaunch).toEqual([POOLS[lang].fallback]);
    });

    for (const seed of [9, 15]) for (const totalTurns of [8, 2]) {
      it('publishes from the hex pools in issue 2 (' + lang + ', seed ' + seed + ', ' + totalTurns + ' quarters)', () => {
        const { state, company } = fixture(lang, seed, totalTurns);
        const previous = structuredClone(state.journal.at(-1)!);
        resolveTurn(state);
        expect(state.journal[0]).toEqual(previous);
        const issue = state.journal.at(-1)!;
        expect(issue.turn).toBe(2);
        const product = company.products.find((p) => p.name === 'Fizz')!;
        expect(product).toBeDefined();
        expect(product.capacity).toBeGreaterThan(0);
        const articles = issue.articles.filter((a) => a.event?.type === 'productLaunch'
          && a.event.productId === product.id);
        expect(articles).toHaveLength(1);
        const flash = articles[0];
        expect(flash).toMatchObject({ kind: 'flash', tone: 'good', companyIds: [company.id],
          sectorIds: ['energy_drinks'], event: { type: 'productLaunch', actorId: 'b', productId: product.id } });
        const vars = { company: company.name, product: product.name,
          sector: getContent(lang).sectors[product.sectorId].name };
        expect(POOLS[lang].headlines.map((text) => fillTemplate(text, vars, lang))).toContain(flash.title);
        expect(POOLS[lang].bodies).toContain(flash.body);
        expect(flash.title + ' ' + flash.body).not.toMatch(/prochain trimestre|next quarter/i);

        if (totalTurns === 2) {
          resolveTurn(state);
          expect(state.phase).toBe('finished');
          expect(product.lastSales).toBeGreaterThan(0);
        }
      });
    }
  }
});
