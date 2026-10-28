import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMMODITIES,
  PLAYER_COLORS,
  SITE_OPENING_COST_MULT,
  SITE_UNIT_COST_RATIO,
  applyAction,
  createGame,
  getContent,
  getPlayerView,
  portHaul,
  resolveTurn,
  roadRoute,
  siteHaul,
  slotCapacity,
  type Action,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { DepositPanel } from '../src/screens/game/DepositPanel';
import { getState, setState, type AppState } from '../src/store';

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

function ok(g: GameState, who: string, a: Action): void {
  const r = applyAction(g, who, a);
  expect(r.ok, r.message).toBe(true);
}

/**
 * Cleo fait des yaourts (sucre + huile) et déménage son usine dans la ville du sud ; elle remporte le gisement
 * sugar-2, Bob remporte oil-2. La fiche du gisement (DepositPanel, montée par la carte) donne le prix
 * « livré à l'usine » de sa filiale sugar-2, face à l'achat au port.
 */
function zoneGame(lang: Lang) {
  const g = createGame({ seed: 7, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang }, [
    seat('cleo', 'Cleo', 'Cleo SA', 'yogurts', 0),
    seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
  ]);
  const of = (id: string) => Object.values(g.companies).find((c) => c.founderId === id)!;
  const [cleo, bob] = [of('cleo'), of('bob')];
  g.players.cleo.cash = 1e6;
  g.players.bob.cash = 1e6;
  ok(g, 'cleo', { type: 'bidSite', companyId: cleo.id, slotId: 'sugar-2', amount: COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT });
  ok(g, 'bob', { type: 'bidSite', companyId: bob.id, slotId: 'oil-2', amount: COMMODITIES.oil.basePrice * SITE_OPENING_COST_MULT });
  ok(g, 'cleo', { type: 'moveFactory', companyId: cleo.id, productId: cleo.products[0].id, zoneId: 'south' });
  resolveTurn(g);
  return { g, cleo, bob };
}

function renderPanel(view: PlayerView, lang: Lang, companyId: string): string {
  setState({ lang, view, lobby: null });
  const company = view.companies.find((c) => c.id === companyId)!;
  const slot = view.siteSlots.find((s) => s.id === 'sugar-2')!;
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(DepositPanel, { company, slot }) }));
}

describe.each(['fr', 'en'] as const)('fiche du gisement, prix livré à l\'usine (%s)', (lang) => {
  const { g, cleo } = zoneGame(lang);
  const t = messages(lang);
  const fmt = fmtFor(lang);
  const content = getContent(lang);
  const zone = 'south' as const;
  const view = getPlayerView(g, 'cleo');
  const mine = view.companies.find((c) => c.id === cleo.id)!;
  const product = mine.products[0];
  const html = renderPanel(view, lang, cleo.id);
  const factor = view.transportFactor ?? 1;
  const sugar = view.commodities.find((c) => c.id === 'sugar')!;
  // Coût du lot sur un gisement libre à la prochaine clôture : tarif de base sous l'effet des news (§5.5 bis).
  const current = COMMODITIES.sugar.basePrice * SITE_UNIT_COST_RATIO * (sugar.siteCostFactor ?? 1);

  it('montre dans la fiche du gisement le lot livré à l\'usine : coût d\'extraction courant + transport', () => {
    expect(product.zoneId).toBe(zone);
    // Sa filiale sugar-2 est la fiche rendue.
    expect(html).toContain(escaped(t.sitesPicker.statusTaken(mine.name, slotCapacity('sugar-2'))));
    expect(html).toContain(escaped(t.sitesPicker.deliveredTitle));
    expect(html).toContain(escaped(product.name));
    expect(html).toContain(escaped(fmt.money(current + siteHaul('sugar-2', zone, 'sugar') * factor)));
    expect(html).toContain(escaped(`${fmt.int(Math.round(roadRoute('sugar-2', zone)!.km))} km`));
  });

  it('compare avec l\'achat au port : prix du marché + trajet jusqu\'à la zone de l\'usine', () => {
    // Une seule ligne de livraison : un produit consommateur, un gisement choisi.
    expect(count(html, escaped(fmt.money(sugar.price + portHaul(zone, 'sugar') * factor)))).toBe(1);
  });

  it('épargne les gisements des rivaux et les matières que ses produits ne consomment pas', () => {
    // oil-2 est à Bob : la fiche de sugar-2 ne le nomme pas.
    expect(html).not.toContain(escaped('Bob Corp'));
    // Ni lithium ni puces dans les yaourts : une seule table de livraison, celle du gisement de la fiche.
    expect(count(html, 'role="table"')).toBe(1);
  });
});
