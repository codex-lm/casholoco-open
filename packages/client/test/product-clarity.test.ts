import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HQ_COST, applyAction, createGame, estimateSales, getPlayerView, resolveTurn, type Lang, type PlayerView, type ProductView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { ProductCard } from '../src/screens/game/ProductCard';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function fixture(lang: Lang, network = false) {
  const game = createGame(
    { seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, ...(network ? { mapMode: 'hex' as const, industryRules: 'network' as const } : {}) },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' }],
  );
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  return { game, company };
}

function renderProduct(view: PlayerView, productId: string, lang: Lang): string {
  setState({ lang, view, lobby: null });
  const company = view.companies.find((c) => c.products.some((p) => p.id === productId))!;
  const product = company.products.find((p) => p.id === productId)!;
  return renderToStaticMarkup(createElement(GameProvider, {
    view,
    children: createElement(ProductCard, { company, product }),
  }));
}

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
/** Texte d'un fragment HTML : balises (le gras de <Rich>, les montants) et marques `**` retirées. */
const plain = (html: string) => html.replace(/<[^>]+>/g, '').replaceAll('**', '');

describe.each(['fr', 'en'] as const)('fiche produit (%s)', (lang) => {
  it('le détail de marge de chaque usine déduit les budgets communs une seule fois', () => {
    const { game, company } = fixture(lang, true), first = company.products[0], initial = getPlayerView(game, 'human');
    const hexId = initial.hexes!.free[0];
    expect(applyAction(game, 'human', { type: 'buildFactory', companyId: company.id, productId: first.id, hexId, bid: initial.hexes!.reserve[hexId] }).ok).toBe(true);
    resolveTurn(game);
    const second = company.products.at(-1)!;
    expect(applyAction(game, 'human', { type: 'setProductDecisions', companyId: company.id, productId: second.id, marketing: 40, rnd: 20 }).ok).toBe(true);
    const view = getPlayerView(game, 'human'), t = messages(lang), fmt = fmtFor(lang);
    for (const [id, charged] of [[first.id, true], [second.id, false]] as const) {
      const details = renderProduct(view, id, lang).split(`<summary>${escaped(t.product.estimateDetails)}</summary>`)[1].split('</details>')[0];
      for (const [label, amount] of [[t.product.marketing, 40], [t.product.rnd, 20]] as const) {
        const row = details.split('<tr').find(row => row.includes(escaped(label)))!;
        expect(row).toContain(escaped(fmt.money(charged ? amount : 0)));
      }
    }
  });
  it('explique le bilan nul du trimestre d’installation, sans attribuer les zéros suivants à l’installation', () => {
    const { game, company } = fixture(lang);
    const original = company.products[0];
    original.production = 0;
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'crypto', name: 'Token Test' }).ok).toBe(true);
    const launched = company.products.at(-1)!;
    expect(launched.firstSalesTurn).toBe(game.turn + 1);
    expect(original.firstSalesTurn).toBeUndefined();
    const t = messages(lang);
    const fmt = fmtFor(lang);
    let view = getPlayerView(game, 'human');
    let html = renderProduct(view, launched.id, lang);
    expect(html).toContain(escaped(t.product.comingSoonCrypto));
    expect(html).toContain(escaped(t.product.computeCapacity));
    expect(html).toContain(escaped(t.product.expandServers));
    expect(html).not.toContain(escaped(t.product.comingSoonBody));

    resolveTurn(game);
    view = getPlayerView(game, 'human');
    const product = view.companies.find((c) => c.id === company.id)!.products.find((p) => p.id === launched.id)!;
    expect(product.firstSalesTurn).toBe(2);
    expect(product.comingSoon).toBeUndefined();
    expect(product.lastSales).toBe(0);
    const installation = escaped(t.product.installationReport(fmt.date(1, 2027), fmt.date(2, 2027)));
    expect(renderProduct(view, launched.id, lang)).toContain(installation);
    // Le produit d'origine laissé volontairement à zéro n'a pas eu d'installation différée.
    expect(renderProduct(view, original.id, lang)).not.toContain(installation);

    launched.production = 0;
    resolveTurn(game);
    view = getPlayerView(game, 'human');
    expect(launched.lastSales).toBe(0);
    html = renderProduct(view, launched.id, lang);
    expect(html).not.toContain(installation);
    expect(html).not.toContain(escaped(t.product.comingSoonCrypto));
  });

  it('une seule prévision : ventes, demande, CA et marge du trimestre, l’hypothèse dans la bulle, le détail exact', () => {
    const { game, company } = fixture(lang);
    const view = getPlayerView(game, 'human');
    const product = view.companies.find((c) => c.id === company.id)!.products[0];
    Object.assign(product, { price: 30, capacity: 20 });
    Object.assign(product.private!, {
      production: 12, stock: 5, marketing: 40, rnd: 20, estimatedUnitCost: 10,
      market: { demand: 1000, othersAttractiveness: 0, reputation: 1, bonus: 1, unitCost: 10, fixedCost: 100 },
    } satisfies Partial<NonNullable<ProductView['private']>>);
    const html = renderProduct(view, product.id, lang);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const est = estimateSales('gadgets', product.private!.market!, {
      quality: product.quality, brand: product.brand, price: 30, production: 12, capacity: 20, stock: 5, marketing: 40, rnd: 20,
    });
    // Tout se vend : 17 lots (12 produits + 5 en stock), CA 510 ; 510 − 120 − 40 − 20 − 100 = 230.
    expect(est.sales).toBe(17);
    expect(est.margin).toBe(230);
    // Une ligne : ventes, demande, CA, puis la marge du trimestre et la bulle de l'hypothèse.
    const line = html.match(/<div class="estimate-line">([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(plain(line)).toContain(plain(escaped(t.product.forecast(fmt.lots(17), fmt.int(est.demand), fmt.money(510)))));
    expect(line).toContain(`+${escaped(fmt.money(230))}`);
    expect(line).toContain(`aria-label="${escaped(t.product.estimateNote)}"`);
    // Plus de second bénéfice : rien ne resterait invendu, donc pas de « Si tout se vend ».
    expect(html).not.toContain(escaped(t.product.ifAllSells(fmt.lots(17))));
    const details = html.match(/<details>[\s\S]*?<\/details>/)?.[0] ?? '';
    expect(details).toContain(escaped(t.product.estimateDetails));
    // Le détail, puis la quote-part du siège (un seul produit : tout le siège) et le résultat après elle.
    for (const [label, amount] of [
      [t.product.estimatedRevenue, 510],
      [t.product.productionCost(fmt.lots(12)), 120],
      [t.product.marketing, 40],
      [t.product.rnd, 20],
      [t.product.productFixedCosts, 100],
      [t.product.estimatedBalance, 230],
      [t.product.hqShare, HQ_COST],
      [t.product.afterHq, 230 - HQ_COST],
    ] as const) {
      const row = details.split('<tr').find((r) => r.includes(escaped(label)));
      expect(row, label).toContain(escaped(fmt.money(amount)));
    }
    // Jamais présenté comme le bilan : « avant intérêts et impôt ».
    expect(t.product.afterHq).toContain(lang === 'fr' ? 'avant intérêts et impôt' : 'before interest and tax');
    expect(html).toContain(escaped(t.product.estimateAccounting));
    expect(html).toContain(escaped(t.product.estimateExcludes));
    expect(html).toContain(escaped(t.tips.quality));
    // Marge par lot au format par lot, juste après son libellé.
    expect(html).toContain(`${escaped(t.product.marginPerLot)} <strong class="up">${escaped(fmt.lotPrice(20))} (67`);
  });

  it('« Si tout se vend » seulement quand des lots resteraient invendus, sur la même base : l’écart, ce sont ces lots', () => {
    const { game, company } = fixture(lang);
    const view = getPlayerView(game, 'human');
    const product = view.companies.find((c) => c.id === company.id)!.products[0];
    Object.assign(product, { price: 300, capacity: 20 });
    Object.assign(product.private!, {
      production: 12, stock: 5, marketing: 40, rnd: 20, estimatedUnitCost: 10,
      market: { demand: 10, othersAttractiveness: 1, reputation: 1, bonus: 1, unitCost: 10, fixedCost: 100 },
    } satisfies Partial<NonNullable<ProductView['private']>>);
    const est = estimateSales('gadgets', product.private!.market!, {
      quality: product.quality, brand: product.brand, price: 300, production: 12, capacity: 20, stock: 5, marketing: 40, rnd: 20,
    });
    expect(est.sales).toBeLessThan(16.5);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const html = renderProduct(view, product.id, lang);
    const ifAll = est.margin + 300 * (17 - est.sales);
    const signed = (v: number) => `${v > 0.5 ? '+' : ''}${fmt.money(v)}`;
    const line = html.match(/<div class="if-all-sells">([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(plain(line)).toBe(plain(escaped(`${t.product.ifAllSells(fmt.lots(17))} ${signed(ifAll)}`)));
    // Sans quote-part du siège : la prévision et « Si tout se vend » ne diffèrent que du prix des lots invendus.
    expect(line).not.toContain(escaped(fmt.money(ifAll - HQ_COST)));
    expect(html).toContain(escaped(signed(est.margin)));
  });

  it('écrit la ligne du coût d’un lot d’un seul tenant : coût, fret compris, puis marge par lot et sa valeur', () => {
    const { game, company } = fixture(lang);
    const view = getPlayerView(game, 'human');
    const product = view.companies.find((c) => c.id === company.id)!.products[0];
    Object.assign(product, { price: 115 });
    Object.assign(product.private!, { estimatedUnitCost: 73, estimatedTransport: 4 } satisfies Partial<NonNullable<ProductView['private']>>);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const line = (html: string) => (html.match(/<div class="estimates small"><div>([\s\S]*?)<\/div>/)?.[1] ?? '')
      .replace(/<[^>]+>/g, '').replace(/^ⓘ/, '').trim();
    const cost = t.product.unitCost(fmt.lotPrice(73)).replaceAll('**', '');
    const margin = `${t.product.marginPerLot} ${fmt.lotPrice(42)} (${fmt.pct(42 / 115, 0)})`;
    expect(line(renderProduct(view, product.id, lang))).toBe(escaped(`${cost} ${t.product.unitCostFreight(fmt.lotPrice(4), false)} · ${margin}`));
    // Les montants sous 10 k restent en k, jamais en euros.
    expect(line(renderProduct(view, product.id, lang))).toContain(lang === 'fr' ? '(dont fret 4,0 k€)' : '(incl. $4.0k freight)');
    // Un produit intangible n'a aucun transport ; la mention totale disparaît.
    Object.assign(product.private!, { estimatedTransport: 0 });
    expect(line(renderProduct(view, product.id, lang))).toBe(escaped(`${cost} · ${margin}`));
    // 42 sur 115 : 37 %, comme l'exemple de la spec.
    expect(margin).toContain(lang === 'fr' ? '(37 %)' : '(37%)');
    // Le même chiffre porte le même nom dans « Mes usines » et le rapport du trimestre.
    const freight = lang === 'fr' ? 'fret' : 'freight';
    expect(t.product.unitCostFreight('x', false)).toContain(freight);
    expect(t.product.transport('x', false)).toContain(freight);
  });
});
