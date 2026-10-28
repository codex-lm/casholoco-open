import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_COLORS, applyAction, createGame, getPlayerView, type GameState, type Lang, type SectorId } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { pctDigits, sharesToControl } from '../src/rules';
import { CompanyDetail } from '../src/screens/game/CompanyDetail';
import { getState, setState, type AppState } from '../src/store';

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
/** Texte rendu par <Rich> : le gras `**…**` devient <strong>. */
const rich = (text: string) => escaped(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

function game(lang: Lang): { g: GameState; target: string } {
  const seat = (id: string, name: string, sectorId: SectorId, i: number) => ({
    id, name, isBot: false, companyName: `${name} SA`, sectorId, connected: true, color: PLAYER_COLORS[i],
  });
  const g = createGame({ seed: 3, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [seat('ada', 'Ada', 'gadgets', 0), seat('bob', 'Bob', 'yogurts', 1)]);
  g.players.bob.cash = 1e9;
  const target = Object.values(g.companies).find((c) => c.founderId === 'ada')!.id;
  return { g, target };
}

function detail(g: GameState, playerId: string, companyId: string, uiLang: Lang): string {
  const view = getPlayerView(g, playerId);
  setState({ lang: uiLang, view, lobby: null });
  const company = view.companies.find((c) => c.id === companyId)!;
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(CompanyDetail, { company, onClose: () => {} }) }));
}

describe('contrôle : plus de 50 %, dit en toutes lettres', () => {
  it('assez de décimales autour de 50 % pour trancher', () => {
    const fr = fmtFor('fr');
    const show = (r: number) => fr.pct(r, pctDigits(r));
    expect(show(0.5001)).toBe(fr.pct(0.5001, 2)); // 50,01 % : contrôle
    expect(show(0.4999)).toBe(fr.pct(0.4999, 2)); // 49,99 % : pas de contrôle
    expect(show(0.5)).toBe(fr.pct(0.5, 1)); // 50,0 % tout rond : pas de contrôle
    expect(show(0.50001)).toBe(fr.pct(0.50001, 3));
    expect(show(0.26)).toBe(fr.pct(0.26, 1));
    expect(show(0.5001)).not.toBe(show(0.5));
  });

  it.each(['fr', 'en'] as const)('50 %% tout rond : il manque une action (%s)', (lang) => {
    const { g, target } = game(lang);
    expect(applyAction(g, 'bob', { type: 'buyShares', companyId: target, shares: 5000 }).ok).toBe(true);
    expect(g.companies[target].controllerId).toBe('ada');
    const company = getPlayerView(g, 'bob').companies.find((c) => c.id === target)!;
    expect(sharesToControl(company, 'bob')).toBe(1);
    const t = messages(lang);
    const html = detail(g, 'bob', target, lang);
    expect(html).toContain(rich(t.trade.toControl(fmtFor(lang).int(1), 1, company.name)));
    expect(html).not.toContain(escaped(t.trade.youControl(company.name)).split('**')[0]);
  });

  it.each(['fr', 'en'] as const)('50 %% + 1 action : « Vous contrôlez » (%s)', (lang) => {
    const { g, target } = game(lang);
    expect(applyAction(g, 'bob', { type: 'buyShares', companyId: target, shares: 5001 }).ok).toBe(true);
    expect(g.companies[target].controllerId).toBe('bob');
    const t = messages(lang);
    const company = getPlayerView(g, 'bob').companies.find((c) => c.id === target)!;
    const html = detail(g, 'bob', target, lang);
    expect(html).toContain(rich(t.trade.youControl(company.name)));
    expect(html).toContain(escaped(fmtFor(lang).pct(0.5001, 2)));
    // Ada, évincée, garde ses actions : il lui en manque 1 001 pour revenir.
    const adaHtml = detail(g, 'ada', target, lang);
    expect(adaHtml).toContain(rich(t.trade.toControl(fmtFor(lang).int(1001), 1001, company.name)));
    expect(adaHtml).toContain(escaped(t.trade.toControlNoFloat(fmtFor(lang).int(company.floatShares))));
  });
});
