import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getContent, getPlayerView, resolveTurn, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { FactoriesTab } from '../src/screens/game/FactoriesTab';
import { getState, setState, type AppState } from '../src/store';
import { freightMessages } from '../src/i18n/freight';
import { currentProductFreight } from '../src/screens/game/city/freight';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function fixture(lang: Lang) {
  const game = createGame(
    { seed: 11, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'yogurts', connected: true, color: '#123456' }],
  );
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  return { game, company };
}

function render(view: PlayerView, lang: Lang): string {
  setState({ lang, view, lobby: null });
  const company = view.companies.find((c) => c.controllerId === view.you && c.status === 'active') ?? null;
  return renderToStaticMarkup(
    createElement(GameProvider, { view, children: createElement(FactoriesTab, { company, onSelect: () => {}, goTo: () => {}, openMapFor: () => {} }) }),
  );
}

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

describe.each(['fr', 'en'] as const)('Mes usines : zones et transport (%s)', (lang) => {
  it('montre la capitale et son fret de livraison réel, avec deux lignes', () => {
    const { game } = fixture(lang);
    const t = messages(lang);
    const capital = getContent(lang).mapNames.cities.capital;
    const html = render(getPlayerView(game, 'human'), lang);
    expect(html).toContain(escaped(t.factories.zoneAria(capital)));
    expect(html).toContain(escaped(capital));
    const freight = freightMessages(lang);
    expect(html).toContain(escaped(freight.materialsLabel));
    expect(html).toContain(escaped(freight.deliveryLabel));
    expect(html).toContain('data-freight-details');
  });

  it('montre la zone d’un déménagement et les deux coûts absolus', () => {
    const { game, company } = fixture(lang);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const plain = getContent(lang).mapNames.zones.plain;
    const product = company.products[0];
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: 'plain' }).ok).toBe(true);

    const view = getPlayerView(game, 'human');
    const mine = view.companies.find((c) => c.id === company.id)!.products[0];
    expect(mine.zoneId).toBe('plain');
    const transport = mine.private!.estimatedTransport;
    expect(transport).not.toBe(0);

    const html = render(view, lang);
    expect(html).toContain(escaped(t.factories.zoneAria(plain)));
    expect(html).toContain(escaped(plain));
    const freight = currentProductFreight(view, view.companies.find((c) => c.id === company.id)!, mine);
    expect(freight.total).toBeCloseTo(transport, 9);
    expect(html).toContain(escaped(freightMessages(lang).lotValue(fmt.lotPrice(freight.materialsCost))));
    expect(html).toContain(escaped(freightMessages(lang).lotValue(fmt.lotPrice(freight.deliveryCost))));
  });

  it('garde la zone d’un lancement après la clôture, avec son transport', () => {
    const { game, company } = fixture(lang);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const northEast = getContent(lang).mapNames.cities.north_east;
    const launched = applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'scooters', name: 'Trott Test', zoneId: 'north_east' });
    expect(launched.ok).toBe(true);
    resolveTurn(game);

    const view = getPlayerView(game, 'human');
    const mine = view.companies.find((c) => c.id === company.id)!.products.find((p) => p.name === 'Trott Test')!;
    expect(mine.zoneId).toBe('north_east');
    const html = render(view, lang);
    expect(html).toContain(escaped(t.factories.zoneAria(northEast)));
    expect(html).toContain(escaped(northEast));
    const freight = currentProductFreight(view, view.companies.find((c) => c.id === company.id)!, mine);
    expect(html).toContain(escaped(freightMessages(lang).lotValue(fmt.lotPrice(freight.materialsCost))));
    expect(html).toContain(escaped(freightMessages(lang).lotValue(fmt.lotPrice(freight.deliveryCost))));
  });
});
