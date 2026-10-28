import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyAction,
  createGame,
  getPlayerView,
  resolveTurn,
  type GameState,
  type Lang,
  type PlayerView,
  type QuarterReport,
  type SectorId,
} from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { ReportTable } from '../src/screens/game/ReportTable';
import { getState, setState, type AppState } from '../src/store';
import { freightMessages } from '../src/i18n/freight';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function fixture(lang: Lang, sectorId: SectorId = 'gadgets'): { game: GameState; companyId: string } {
  const game = createGame(
    { seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId, connected: true, color: '#123456' }],
  );
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  return { game, companyId: company.id };
}

function renderReport(view: PlayerView, reports: QuarterReport[], lang: Lang): string {
  setState({ lang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(ReportTable, { reports }) }));
}

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

describe.each(['fr', 'en'] as const)('rapport trimestriel, part du transport (%s)', (lang) => {
  it('affiche les deux coûts de fret réglés à la clôture, avec leurs détails', () => {
    const { game, companyId } = fixture(lang);
    const company = game.companies[companyId];
    const product = company.products[0];
    // Déménagement gratuit le trimestre où le produit démarre (§5.8) : la clôture part de la nouvelle zone.
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId, productId: product.id, zoneId: 'east' }).ok).toBe(true);
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const last = view.companies.find((c) => c.id === companyId)!.reports.at(-1)!;
    const line = last.products.find((p) => p.productId === product.id)!;
    expect(line.transport).toBeDefined();
    expect(line.transport).not.toBe(0);

    const fmt = fmtFor(lang);
    const transport = line.transport as number;
    const freight = line.freight!;
    expect(freight).toBeDefined();
    expect(freight.total).toBeCloseTo(transport, 9);
    expect(freight.materialsCost + freight.deliveryCost).toBeCloseTo(transport, 9);
    const html = renderReport(view, [last], lang);
    expect(html).toContain(escaped(fmt.money(line.unitCost)));
    const text = freightMessages(lang);
    expect(html).toContain(escaped(text.materialsLabel));
    expect(html).toContain(escaped(text.deliveryLabel));
    expect(html).toContain(escaped(text.lotValue(fmt.lotPrice(freight.materialsCost))));
    expect(html).toContain(escaped(text.lotValue(fmt.lotPrice(freight.deliveryCost))));
    expect(html.match(/<summary /g)).toHaveLength(2);
  });

  it('affiche la livraison réelle à la capitale et conserve les anciens rapports sans inventer de détail', () => {
    const { game, companyId } = fixture(lang);
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const last = view.companies.find((c) => c.id === companyId)!.reports.at(-1)!;
    expect(last.products.length).toBeGreaterThan(0);
    for (const p of last.products) {
      expect(p.transport).toBeGreaterThan(0);
      expect(p.freight!.materialsCost).toBe(0);
      expect(p.freight!.deliveryCost).toBeGreaterThan(0);
    }

    const t = messages(lang);
    const fmt = fmtFor(lang);
    const marker = escaped(t.product.transport(fmt.signedMoney(1), false));
    expect(renderReport(view, [last], lang)).toContain(escaped(freightMessages(lang).deliveryLabel));

    // Legacy reports have only the original settled scalar; they get no reconstructed source or city table.
    const old: QuarterReport = { ...last, products: last.products.map((p) => ({ ...p, freight: undefined, transport: 1 })) };
    expect(renderReport(view, [old], lang)).toContain(escaped(t.product.transport(fmt.money(1), false)));
    expect(renderReport(view, [old], lang)).not.toContain('data-freight-details');
    const zero: QuarterReport = { ...old, products: old.products.map((p) => ({ ...p, transport: 0 })) };
    expect(renderReport(view, [zero], lang)).not.toContain(marker);
  });

  it('uses the frozen close routes and factor after the current plant and news change', () => {
    const { game, companyId } = fixture(lang);
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const last = view.companies.find((c) => c.id === companyId)!.reports.at(-1)!;
    const before = renderReport(view, [last], lang);
    view.transportFactor = 3;
    view.companies.find((c) => c.id === companyId)!.products[0].zoneId = 'mountain';
    expect(renderReport(view, [last], lang)).toBe(before);
  });

  it('shows both zero-cost lines for settled crypto lots even when the legacy scalar is absent', () => {
    const { game, companyId } = fixture(lang, 'crypto');
    resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const last = view.companies.find((c) => c.id === companyId)!.reports.at(-1)!;
    expect(last.products[0].freight?.total).toBe(0);
    expect(last.products[0].transport).toBeUndefined();
    const html = renderReport(view, [last], lang);
    const text = freightMessages(lang);
    expect(html).toContain(escaped(text.materialsLabel));
    expect(html).toContain(escaped(text.deliveryLabel));
    expect(html).toContain(escaped(text.intangible));
    expect(html.match(/<summary /g)).toHaveLength(2);
  });
});
