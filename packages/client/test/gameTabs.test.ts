/**
 * Huit rubriques principales : l'Atelier se trouve sous Mon entreprise, et les accès directs
 * à la carte, aux matières et à la Bourse restent disponibles dans les deux modes.
 */
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { learningMessages } from '../src/i18n/learning';
import { mapFlowText } from '../src/i18n/mapFlows';
import { GameScreen, yieldsFocusToMap } from '../src/screens/GameScreen';
import { getState, setState, type AppState } from '../src/store';

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function fixture(lang: Lang, mapMode: 'classic' | 'hex' = 'classic'): PlayerView {
  const g = createGame({ seed: 7, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode, terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  return getPlayerView(g, 'human');
}

/** Libellés de la barre d'onglets, dans l'ordre affiché (texte de chaque bouton, étiquette bêta comprise). */
function tabLabels(view: PlayerView, lang: Lang): string[] {
  setState({ lang, view, lobby: null });
  const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(GameScreen) }));
  const bar = html.slice(html.indexOf('role="tablist"'), html.indexOf('</nav>', html.indexOf('role="tablist"')));
  return [...bar.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
}

describe.each(['fr', 'en'] as const)('barre d’onglets (%s)', (lang) => {
  it('garde la carte et l’entreprise au premier niveau, sans onglet Atelier séparé ni badge bêta', () => {
    const view = fixture(lang);
    setState({ lang, view, lobby: null });
    const t = messages(lang);
    const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(GameScreen) }));
    const tabs = html.slice(html.indexOf('role="tablist"'), html.indexOf('</div>', html.indexOf('role="tablist"')));
    expect(tabs).not.toContain('tab-beta');
    expect(tabs).not.toContain(escaped(t.game.tabs.factories));
    expect(tabs).toContain(escaped(t.game.tabs.company));
    expect(tabs).toContain(escaped(t.game.tabs.map));
  });

  it('libellés courts : « Journal » et « Matières » (en anglais « The paper », « Stocks »)', () => {
    const t = messages(lang);
    expect(t.game.tabs.journal).toBe(lang === 'fr' ? '📰 Journal' : '📰 The paper');
    expect(t.game.tabs.commodities).toBe(lang === 'fr' ? '🛢️ Matières' : '🛢️ Commodities');
    expect(t.game.tabs.stocks).toBe(lang === 'fr' ? '📈 Bourse' : '📈 Stocks');
    // Les boutons qui mènent à l'onglet le nomment de la même façon (checklist, flux de la carte).
    const label = t.game.tabs.commodities.replace(/^\S+\s/, '');
    expect(t.tutorial.steps.commodities.go).toBe(label);
    expect(learningMessages(lang).steps.commodities.go).toBe(label);
    expect(mapFlowText(lang).materials).toBe(label);
    // Le bouton de la fiche d'un gisement (spectateur) et le lien du bloc des matières de « Mon entreprise » nomment
    // l'onglet comme la barre (la règle des filiales, qui le nommait aussi, est désormais dans le mode d'emploi).
    expect(t.hex.openDeposits.toLowerCase()).toContain(label.toLowerCase());
    expect(t.materials.detail(label)).toBe(lang === 'fr' ? 'Détail dans Matières' : 'Details in Commodities');
    expect(t.materials.detail(label)).not.toContain('Matières premières');
  });

  it('la barre du haut ne montre la dette perso que s’il y en a une, en k, et sa distance à l’appel de marge en infobulle', () => {
    const view = fixture(lang);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const me = view.players.find((p) => p.id === view.you)!;
    expect(me.debt).toBe(0);
    setState({ lang, view, lobby: null });
    const render = () => renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(GameScreen) }));
    expect(render()).not.toContain(escaped(t.topbar.debt));
    Object.assign(me, { debt: 400, portfolioValue: 800, cash: 200 });
    const html = render();
    const debt = html.slice(html.indexOf('<div class="topbar-debt">'), html.indexOf('<div class="networth">'));
    expect(debt).toContain(escaped(t.topbar.debt));
    expect(debt).toContain(`<dd class="down">−${escaped(fmt.money(400))}</dd>`);
    // Dette / (actions au cours + cash positif) face au seuil de l'appel de marge (§6.4).
    expect(debt).toContain(`data-tip="${escaped(t.stocks.debtLine(fmt.money(400), fmt.pct(0.4, 0), fmt.pct(0.8, 0)))}"`);
    expect(html).not.toMatch(/>0 €</);
  });

  it('affiche huit rubriques dans chaque mode, avec la carte juste après l’entreprise', () => {
    const t = messages(lang);
    const label = (id: keyof typeof t.game.tabs) => escaped(t.game.tabs[id] as string);
    expect(tabLabels(fixture(lang, 'classic'), lang)).toEqual(
      (['journal', 'company', 'map', 'stocks', 'commodities', 'markets', 'deals', 'ranking'] as const).map(label));
    expect(tabLabels(fixture(lang, 'hex'), lang)).toEqual(
      (['journal', 'company', 'map', 'commodities', 'stocks', 'markets', 'deals', 'ranking'] as const).map(label));
  });
});

describe('onglets collants', () => {
  it('la barre d’onglets de la partie colle sous la barre du jeu ; le bilan de clôture reste au-dessus et défile', () => {
    const view = fixture('fr', 'hex');
    setState({ lang: 'fr', view, lobby: null });
    const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(GameScreen) }));
    expect(html).toContain('<nav class="tabs tabs-sticky" role="tablist" aria-label=');
    expect(html).toContain('aria-controls="game-panel"');
    expect(html).toContain('id="game-panel"');
    expect(html.indexOf('class="topbar"')).toBeLessThan(html.indexOf('tabs-sticky'));
  });
});

describe('arrivée sur « La carte » avec une intention', () => {
  it('laisse focus et défilement à la fiche ouverte par la carte, pas à la barre d’onglets', () => {
    expect(yieldsFocusToMap('map', { kind: 'launch', companyId: 'c1' })).toBe(true);
    expect(yieldsFocusToMap('map', { kind: 'move', productId: 'p1' })).toBe(true);
    expect(yieldsFocusToMap('map', { kind: 'deposit', companyId: 'c1' })).toBe(true);
    // Sans intention (visite simple) ou sur un autre onglet : comportement habituel (onglet focalisé, haut de page).
    expect(yieldsFocusToMap('map', null)).toBe(false);
    expect(yieldsFocusToMap('journal', { kind: 'launch', companyId: 'c1' })).toBe(false);
  });
});
