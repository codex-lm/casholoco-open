import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CITY_IDS,
  applyAction,
  cityWeights,
  createGame,
  getContent,
  getPlayerView,
  resolveTurn,
  type Lang,
  type PlayerView,
  type ZoneId,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { ProductCard } from '../src/screens/game/ProductCard';
import { getState, setState, type AppState } from '../src/store';
import { freightMessages } from '../src/i18n/freight';

/** Boutons capturés pendant le rendu SSR (pas de jsdom dans le dépôt) : on invoque leur onClick à la main. */
const clicks = vi.hoisted(() => ({ els: [] as Record<string, unknown>[] }));

vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-dev-runtime')>();
  return {
    ...actual,
    jsxDEV: (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (props && typeof props.onClick === 'function') clicks.els.push(props);
      return (actual.jsxDEV as (...a: unknown[]) => unknown)(type, props, ...rest);
    },
  };
});

vi.mock('react/jsx-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-runtime')>();
  const wrap =
    <F extends (...args: never[]) => unknown>(fn: F) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (props && typeof props.onClick === 'function') clicks.els.push(props);
      return (fn as (...a: unknown[]) => unknown)(type, props, ...rest);
    };
  return { ...actual, jsx: wrap(actual.jsx), jsxs: wrap(actual.jsxs) };
});

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function fixture(lang: Lang) {
  const game = createGame(
    { seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' }],
  );
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  return { game, company };
}

/** Nom d'une zone dans la langue de l'interface, comme le fait la fiche produit. */
function zoneName(lang: Lang, id: ZoneId): string {
  const names = getContent(lang).mapNames;
  return id === 'plain' || id === 'mountain' ? names.zones[id] : names.cities[id];
}

function partsOf(view: PlayerView, productId: string) {
  const company = view.companies.find((c) => c.products.some((p) => p.id === productId))!;
  const product = company.products.find((p) => p.id === productId)!;
  return { company, product };
}

function renderProduct(view: PlayerView, productId: string, lang: Lang): string {
  setState({ lang, view, lobby: null });
  const { company, product } = partsOf(view, productId);
  return renderToStaticMarkup(createElement(GameProvider, {
    view,
    children: createElement(ProductCard, { company, product }),
  }));
}

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

describe.each(['fr', 'en'] as const)('zones des usines (%s)', (lang) => {
  it('affiche la zone d’une usine hors de la capitale', () => {
    const { game, company } = fixture(lang);
    const product = company.products[0];
    const r = applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: 'south' });
    expect(r.ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const { product: pv } = partsOf(view, product.id);
    expect(pv.zoneId).toBe('south');
    expect(renderProduct(view, product.id, lang)).toContain(escaped(zoneName(lang, 'south')));
  });

  it('affiche le fret compris dans le coût et ses deux lignes absolues, même à la capitale', () => {
    const { game, company } = fixture(lang);
    const product = company.products[0];
    const t = messages(lang);
    const fmt = fmtFor(lang);
    // À la capitale, les matières du port ne voyagent pas, mais les clients des autres villes sont livrés.
    const capital = getPlayerView(game, 'human');
    const { product: atPort } = partsOf(capital, product.id);
    expect(atPort.private!.estimatedTransport).toBeGreaterThan(0);
    const freightMarker = escaped(t.product.unitCostFreight('@', false).split('@')[0]);
    expect(renderProduct(capital, product.id, lang)).toContain(freightMarker);
    expect(renderProduct(capital, product.id, lang)).toContain(escaped(freightMessages(lang).materialsLabel));
    expect(renderProduct(capital, product.id, lang)).toContain(escaped(freightMessages(lang).deliveryLabel));

    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: 'east' }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const { product: pv } = partsOf(view, product.id);
    const transport = pv.private!.estimatedTransport;
    expect(transport).not.toBe(0);
    const html = renderProduct(view, product.id, lang);
    // Le fret suit le coût par lot, avant « marge par lot » : il fait partie du coût, pas de la marge.
    const freight = escaped(t.product.unitCostFreight(fmt.lotPrice(transport), transport < 0));
    expect(html).toContain(freight);
    const costLabel = escaped(t.product.unitCost('@').split('@')[0].replaceAll('*', ''));
    expect(html.indexOf(costLabel)).toBeGreaterThan(-1);
    expect(html.indexOf(freight)).toBeGreaterThan(html.indexOf(costLabel));
    expect(html.indexOf(freight)).toBeLessThan(html.indexOf(`${escaped(t.product.marginPerLot)} <strong`));
    // Le bouton « Déménager » n'apparaît que si la fiche reçoit onMove (le déménagement part sur la carte).
    expect(html).not.toContain(escaped(t.product.move));
    setState({ lang, view, lobby: null });
    const { company: cv, product: mv } = partsOf(view, product.id);
    const withMove = renderToStaticMarkup(createElement(GameProvider, {
      view,
      children: createElement(ProductCard, { company: cv, product: mv, onMove: () => {} }),
    }));
    expect(withMove).toContain(escaped(t.product.move));

    expect(transport).toBeGreaterThan(0);
  });

  it('affiche la répartition des ventes par ville, triée, avec ▲/▼ selon la clientèle de chaque ville', () => {
    const { game, company } = fixture(lang);
    const product = company.products[0];
    const t = messages(lang);
    const fmt = fmtFor(lang);
    // Le secteur ne devient régional que si une usine est hors de la capitale (§5.2 bis).
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: 'south' }).ok).toBe(true);
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const { product: pv } = partsOf(view, product.id);
    const byCity = pv.lastSalesByCity!;
    expect(byCity).toBeDefined();
    const total = CITY_IDS.reduce((sum, c) => sum + (byCity[c] ?? 0), 0);
    expect(total).toBeGreaterThan(0);
    const weights = cityWeights(pv.sectorId);
    const names = getContent(lang).mapNames;
    const items = CITY_IDS.map((c) => ({ city: c, share: (byCity[c] ?? 0) / total }))
      .filter((e) => e.share > 0)
      .sort((a, b) => b.share - a.share)
      .map(({ city, share }) => {
        const arrow = share > weights[city] + 0.05 ? ' ▲' : share < weights[city] - 0.05 ? ' ▼' : '';
        return `${names.cities[city]} ${fmt.pct(share, 0)}${arrow}`;
      })
      .join(' · ');
    const html = renderProduct(view, product.id, lang);
    expect(html).toContain(escaped(t.product.salesByCity(items)));
    expect(html).toContain(escaped(t.product.salesByCityTip));
  });

  it('« Déménager » appelle onMove avec le produit, sans ouvrir de fenêtre', () => {
    const { game, company } = fixture(lang);
    const product = company.products[0];
    const view = getPlayerView(game, 'human');
    setState({ lang, view, lobby: null });
    const { company: cv, product: pv } = partsOf(view, product.id);
    const onMove = vi.fn();
    clicks.els.length = 0;
    const html = renderToStaticMarkup(createElement(GameProvider, {
      view,
      children: createElement(ProductCard, { company: cv, product: pv, onMove }),
    }));
    // Pas de fenêtre modale au rendu, et le bouton ne fait qu'appeler onMove (le déménagement se prépare sur la carte).
    expect(html).not.toContain('role="dialog"');
    const label = messages(lang).product.move;
    const found = clicks.els.filter((p) => p.children === label);
    expect(found).toHaveLength(1);
    (found[0].onClick as () => void)();
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(product.id);
  });

});
