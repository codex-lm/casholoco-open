import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getPlayerView, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { FactoriesTab } from '../src/screens/game/FactoriesTab';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
afterEach(() => setState(initial));
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function render(view: PlayerView, lang: Lang): string {
  setState({ lang, view, lobby: null });
  const company = view.companies.find((c) => c.controllerId === view.you && c.status === 'active') ?? null;
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(FactoriesTab, { company, onSelect: () => {}, goTo: () => {}, openMapFor: () => {} }) }));
}

function count(html: string, text: string): number {
  return html.split(escaped(text)).length - 1;
}

describe.each(['fr', 'en'] as const)('note d’estimation de « Mes usines » (%s)', (lang) => {
  it('n’accompagne que les produits qui ont une estimation (pas un chantier)', () => {
    const t = messages(lang);
    const game = createGame({ seed: 11, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang },
      [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'yogurts', connected: true, color: '#123456' }]);
    const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
    company.cash = 100_000;
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'scooters', name: 'Trott Test' }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    let html = render(view, lang);
    expect(html).toContain('plot-building');
    // Deux fiches, une seule estimation : la note ne suit que la marge estimée.
    expect(count(html, t.factories.balance)).toBe(1);
    expect(count(html, t.factories.estimateNote)).toBe(1);

    for (const p of view.companies.find((c) => c.id === company.id)!.products) delete p.private!.estimate;
    html = render(view, lang);
    expect(count(html, t.factories.estimateNote)).toBe(0);
  });
});
