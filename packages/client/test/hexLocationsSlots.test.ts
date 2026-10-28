import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, basin, createGame, getContent, getPlayerView, hexPlaceLabel, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { navigationDetailsMessages } from '../src/i18n/navigationDetails';
import { maxProductsOf } from '../src/rules';
import { CompanyDetail } from '../src/screens/game/CompanyDetail';
import { FactoriesTab } from '../src/screens/game/FactoriesTab';
import { ProductCard } from '../src/screens/game/ProductCard';
import { ProductPlot } from '../src/screens/game/factories/ProductPlot';
import { productLocation } from '../src/screens/game/productLocation';
import { hasFreeSlot } from '../src/screens/game/city/model';
import { hexEstimate, hexReferenceOptions } from '../src/screens/game/city/hexModel';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
const initial = getState();
afterEach(() => setState(initial));
const escaped = (value: string) => renderToStaticMarkup(createElement(Fragment, null, value));
function fixture(lang: Lang, hex = true) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, ...(hex ? { mapMode: 'hex' as const, terrainAssignment: 'fair' as const } : {}) }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  return { game, company, view: getPlayerView(game, 'human') };
}
function render(view: PlayerView, lang: Lang, children: ReactNode) {
  setState({ lang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children }));
}

describe.each(['fr', 'en'] as const)('hex product locations and pending slots (%s)', (lang) => {
  it('shows the actual cell and basin on the product card, plot and company detail', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const product = company.products[0];
    const names = getContent(lang).mapNames;
    const zone = basin(product.hexId);
    const basinName = zone === 'plain' || zone === 'mountain' ? names.zones[zone] : names.cities[zone];
    const label = messages(lang).hex.location(hexPlaceLabel(product.hexId!, lang, view.siteSlots), basinName);
    expect(productLocation(view, product, names, messages(lang).hex)).toBe(label);
    for (const element of [
      createElement(ProductCard, { company, product }),
      createElement(ProductPlot, { company, product, still: true, onSettings: () => {}, onExpand: () => {} }),
      createElement(CompanyDetail, { company, embedded: true, onClose: () => {} }),
    ]) expect(render(view, lang, element)).toContain(escaped(label));
  });

  it('identifies an incubator location consistently instead of assigning a board cell', () => {
    const { view } = fixture(lang);
    const company = view.companies.find((c) => c.private)!;
    const product = company.products[0];
    delete product.hexId;
    product.incubator = true;
    const label = messages(lang).hex.incubator;
    expect(productLocation(view, product, getContent(lang).mapNames, messages(lang).hex)).toBe(label);
    expect(render(view, lang, createElement(ProductCard, { company, product }))).toContain(escaped(label));
    expect(render(view, lang, createElement(ProductPlot, { company, product, still: true, onSettings: () => {}, onExpand: () => {} }))).toContain(escaped(label));
    expect(render(view, lang, createElement(CompanyDetail, { company, embedded: true, onClose: () => {} }))).toContain(escaped(label));
  });

  it('counts pending launch projects as occupied slots and cancellation releases a slot', () => {
    const { game, company, view: initialView } = fixture(lang);
    expect(hasFreeSlot(initialView)).toBe(true);
    const cells = initialView.hexes!.free;
    for (let i = 0; i < maxProductsOf(initialView.companies.find((c) => c.id === company.id)!) - company.products.length; i++) {
      const result = applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'yogurts', name: `Project ${i}`, hexId: cells[i], bid: initialView.hexes!.reserve[cells[i]], fallback: 'abandon' });
      expect(result.ok, result.message).toBe(true);
    }
    let view = getPlayerView(game, 'human');
    expect(hasFreeSlot(view)).toBe(false);
    const current = view.companies.find((c) => c.id === company.id)!;
    const html = render(view, lang, createElement(FactoriesTab, { company: current, onSelect: () => {}, goTo: () => {}, openMapFor: () => {} }));
    expect(html).not.toContain('class="plot plot-free"');
    expect(html).toContain(escaped(navigationDetailsMessages(lang).productsFull(true)));
    expect(html).toContain(escaped(navigationDetailsMessages(lang).reservedProducts(current.private!.launchProjects!.length)));
    expect(html).toContain(`>${maxProductsOf(current)} / ${maxProductsOf(current)}<`);
    const project = current.private!.launchProjects![0];
    expect(applyAction(game, 'human', { type: 'cancelHexBid', companyId: company.id, projectId: project.id }).ok).toBe(true);
    view = getPlayerView(game, 'human');
    expect(hasFreeSlot(view)).toBe(true);
    const after = render(view, lang, createElement(FactoriesTab, { company: view.companies.find((c) => c.id === company.id)!, onSelect: () => {}, goTo: () => {}, openMapFor: () => {} }));
    expect(after.match(/class="plot plot-free"/g)).toHaveLength(1);
    expect(after).toContain(escaped(navigationDetailsMessages(lang).freeProducts(1)));
    expect(after).not.toContain(escaped(navigationDetailsMessages(lang).productsFull(true)));
  });

  it('keeps classic product locations and slots unchanged', () => {
    const { game, company } = fixture(lang, false);
    const product = company.products[0];
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: 'plain' }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const current = view.companies.find((c) => c.id === company.id)!;
    const label = getContent(lang).mapNames.zones.plain;
    expect(productLocation(view, current.products[0], getContent(lang).mapNames, messages(lang).hex)).toBe(label);
    expect(hasFreeSlot(view)).toBe(true);
    const html = render(view, lang, createElement(FactoriesTab, { company: current, onSelect: () => {}, goTo: () => {}, openMapFor: () => {} }));
    // Une seule carte pour tous les emplacements libres, qui les compte.
    expect(html.match(/class="plot plot-free"/g)).toHaveLength(1);
    expect(html).toContain(escaped(navigationDetailsMessages(lang).freeProducts(maxProductsOf(current) - current.products.length)));
    expect(html).toContain(escaped(label));
  });

  it('never treats controller identity alone as access to private cell estimates', () => {
    const { game, company } = fixture(lang);
    const view = getPlayerView(game, 'nobody');
    const rival = view.companies.find((c) => c.id === company.id)!;
    rival.controllerId = view.you;
    expect(rival.private).toBeUndefined();
    expect(rival.products[0].private).toBeUndefined();
    expect(hexEstimate(view, { kind: 'product', productId: rival.products[0].id }, view.hexes!.free[0])).toBeNull();
    expect(hexReferenceOptions(view).some((o) => o.ref.kind === 'product')).toBe(false);
    expect(hasFreeSlot(view)).toBe(false);
  });
});
