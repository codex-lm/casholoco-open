import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SECTORS, applyAction, createGame, getPlayerView, type Lang, type PlayerView, type ProductView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { navigationDetailsMessages } from '../src/i18n/navigationDetails';
import { fmtFor } from '../src/fmt';
import { FactoriesTab } from '../src/screens/game/FactoriesTab';
import {
  MAX_FACTORY_LEVEL,
  adSpots,
  allocate,
  billboardTier,
  demandSegments,
  factoryLevel,
  labLevel,
  pictoUnit,
  productFlow,
  researchers,
  sceneWalkers,
  supplySegments,
} from '../src/screens/game/factories/model';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

/** Produit contrôlé minimal : capacité 70, production 56, stock 7, demande estimée `demand`. */
function product(over: Partial<ProductView> = {}, priv: Partial<NonNullable<ProductView['private']>> = {}, demand: number | null = 64): ProductView {
  const stock = priv.stock ?? 7;
  const production = priv.production ?? 56;
  const capacity = over.capacity ?? 70;
  const available = stock + Math.floor(Math.min(production, capacity));
  return {
    id: 'p1',
    name: 'Taurine Fury',
    sectorId: 'energy_drinks',
    quality: 1,
    brand: 0.3,
    capacity,
    price: 100,
    lastSales: 0,
    lastRevenue: 0,
    lastMarketShare: 0,
    launchedTurn: 0,
    ...over,
    private: {
      pendingCapacity: 0,
      stock,
      production,
      marketing: 420,
      rnd: 280,
      lastProduced: 0,
      lastUnitCost: 60,
      estimatedUnitCost: 60,
      ...(demand !== null ? { estimate: { demand, sales: Math.min(demand, available), revenue: 0, margin: 0 } } : {}),
      ...priv,
    },
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('Mes usines : traduction des chiffres', () => {
  it('choisit un pas de pictogramme rond qui tient en 20 icônes', () => {
    expect(pictoUnit(0)).toBe(1);
    expect(pictoUnit(20)).toBe(1);
    expect(pictoUnit(33)).toBe(2);
    expect(pictoUnit(77)).toBe(5);
    expect(pictoUnit(135)).toBe(10);
    for (const lots of [1, 57, 499, 12_345, 1e6]) expect(lots / pictoUnit(lots)).toBeLessThanOrEqual(20);
  });

  it('compare offre (stock + production plafonnée) et demande estimée', () => {
    const balanced = productFlow(product());
    expect(balanced).toMatchObject({ planned: 56, stock: 7, available: 63, demand: 64, status: 'balanced', unit: 5 });

    const shortage = productFlow(product({}, { production: 20 }, 77));
    expect(shortage.status).toBe('shortage');
    expect(shortage.shortage).toBeCloseTo(77 - 27);

    // Production au-delà de la capacité : seule la capacité est produite (§5.3).
    const capped = productFlow(product({}, { production: 140 }, 30));
    expect(capped.planned).toBe(70);
    expect(capped.status).toBe('surplus');
    expect(capped.surplus).toBeCloseTo(77 - 30);
    expect(capped.spoiled).toBeCloseTo((77 - 30) * SECTORS.energy_drinks.perishability);

    expect(productFlow(product({}, { production: 0, stock: 0 })).status).toBe('idle');
    expect(productFlow(product({}, {}, null)).status).toBe('unknown');
    const building = productFlow(product({ capacity: 0, comingSoon: true }, { pendingCapacity: 70 }));
    expect(building.status).toBe('building');
    expect(building.demand).toBeNull();
  });

  it('aligne les pictogrammes sur une même échelle, invendus et clients perdus compris', () => {
    const surplus = productFlow(product({}, { production: 70, pendingCapacity: 10 }, 40));
    const supply = supplySegments(surplus);
    expect(supply.at(-1)!.to).toBeCloseTo((7 + 70 + 10) / surplus.unit);
    const unsold = sum(supply.filter((s) => s.unsold).map((s) => s.to - s.from));
    expect(unsold * surplus.unit).toBeCloseTo(surplus.surplus);

    const shortage = productFlow(product({}, { production: 20 }, 77));
    const demand = demandSegments(shortage);
    expect(demand.map((s) => s.kind)).toEqual(['served', 'unserved']);
    expect(demand.at(-1)!.to * shortage.unit).toBeCloseTo(77);
    expect((demand[1].to - demand[1].from) * shortage.unit).toBeCloseTo(shortage.shortage);
  });

  it('fait grandir l’usine à chaque palier de capacité (+20 % suffisent)', () => {
    const start = SECTORS.gadgets.startingCapacity;
    expect(factoryLevel(0, 'gadgets')).toBe(0);
    expect(factoryLevel(start, 'gadgets')).toBe(2);
    expect(factoryLevel(start * 1.2, 'gadgets')).toBe(3);
    expect(factoryLevel(start * 100, 'gadgets')).toBe(MAX_FACTORY_LEVEL);
    let prev = 0;
    for (let c = 1; c < start * 4; c++) {
      const level = factoryLevel(c, 'gadgets');
      expect(level).toBeGreaterThanOrEqual(prev);
      prev = level;
    }
  });

  it('traduit R&D, marketing, notoriété et qualité en éléments bornés', () => {
    const size = SECTORS.energy_drinks.refPrice * SECTORS.energy_drinks.refDemand;
    // Réglages de départ (§4) : R&D 1 % et marketing 1,5 % de la taille du marché.
    expect(researchers(0.01 * size, 'energy_drinks')).toBe(2);
    expect(researchers(0, 'energy_drinks')).toBe(0);
    expect(researchers(size, 'energy_drinks')).toBe(6);
    expect(adSpots(0, 'energy_drinks')).toBe(0);
    expect(adSpots(0.015 * size, 'energy_drinks')).toBe(2);
    expect(adSpots(size, 'energy_drinks')).toBe(3);
    expect(billboardTier(0.3)).toBe(1);
    expect(billboardTier(0.9)).toBe(3);
    expect(billboardTier(3)).toBe(5);
    expect(labLevel(1)).toBe(1);
    expect(labLevel(2.5)).toBe(4);
  });

  it('répartit une foule par plus forts restes et limite les passants', () => {
    expect(allocate([0.23, 0.18, 0.12, 0.47], 20)).toEqual([5, 4, 2, 9]);
    expect(sum(allocate([1, 1, 1], 20))).toBe(20);
    expect(allocate([0, 0], 20)).toEqual([0, 0]);
    const crowd = sceneWalkers(productFlow(product({}, { production: 20 }, 77)));
    expect(crowd.served + crowd.unserved).toBeLessThanOrEqual(8);
    expect(crowd.unserved).toBeGreaterThanOrEqual(1);
    expect(sceneWalkers(productFlow(product())).unserved).toBe(0);
    // Usine à l'arrêt et cour vide : tout le monde repart les mains vides.
    expect(sceneWalkers(productFlow(product({}, { production: 0, stock: 0 }))).served).toBe(0);
  });
});

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

describe.each(['fr', 'en'] as const)('onglet Mes usines (%s)', (lang) => {
  it('dessine une usine par produit, une seule carte pour les emplacements libres et le chantier d’un lancement', () => {
    const { game, company } = fixture(lang);
    const t = messages(lang);
    const labels = navigationDetailsMessages(lang);
    const fmt = fmtFor(lang);
    let html = render(getPlayerView(game, 'human'), lang);
    expect(html).toContain(escaped(t.factories.title(company.name)));
    expect(html.match(/class="plot plot-(?!free)/g)?.length).toBe(1);
    // Les trois emplacements libres tiennent sur une seule carte, avec un seul bouton de lancement.
    expect(html.match(/class="plot plot-free"/g)?.length).toBe(1);
    expect(html).toContain(escaped(labels.freeProducts(3)));
    expect(html.split(escaped(t.factories.build)).length - 1).toBe(1);
    expect(html).toContain(escaped(t.factories.supplyLabel));
    expect(html).toContain(escaped(t.factories.demandLabel));
    // Products and physical factories have their own counters; the legend stays folded.
    expect(html).toContain(`<details class="factories-legend"><summary>${escaped(t.factories.legendTitle)}</summary>`);
    expect(html).toContain(escaped(t.factories.intro));
    expect(t.factories.intro.trim().split(/[.!?]\s/).length).toBe(1);
    expect(html).toContain(escaped(t.factories.cash));
    expect(html).toContain(escaped(t.factories.sites));
    expect(html.match(/class="stat-label"/g)?.length).toBe(4);
    expect(html).toContain(escaped(labels.productCount));
    expect(html).toContain(escaped(labels.factoryCount));

    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: company.id, sectorId: 'scooters', name: 'Trott Test' }).ok).toBe(true);
    html = render(getPlayerView(game, 'human'), lang);
    expect(html.match(/class="plot plot-(?!free)/g)?.length).toBe(2);
    expect(html.match(/class="plot plot-free"/g)?.length).toBe(1);
    expect(html).toContain(escaped(labels.freeProducts(2)));
    expect(html).toContain('plot-building');
    expect(html).toContain(escaped(t.factories.opening(fmt.date(2, 2027))));
    expect(html).toContain(escaped(t.factories.verdict.building(fmt.date(2, 2027))));
  });

  it('keeps network construction available at the commercial-product limit, with independent factory counts and correct timing', () => {
    const { game } = fixture(lang);
    const view = getPlayerView(game, 'human');
    view.config.industryRules = 'network';
    view.config.mapMode = 'hex';
    const company = view.companies.find(c => c.controllerId === view.you)!;
    const source = company.products[0];
    company.products = [0, 1, 2, 3, 4].map(index => ({ ...source, id: `factory:${index}`, factoryProductId: `brand:${Math.min(index, 3)}` }));
    const labels = navigationDetailsMessages(lang);
    const html = render(view, lang);
    expect(html).toContain('>4 / 4<');
    expect(html).toContain(`>${escaped(labels.factoryCount)}</div><div class="stat-value">5</div>`);
    expect(html).toContain(escaped(labels.networkFull));
    expect(html).toContain(escaped(labels.networkTiming));
    expect(html).not.toContain(escaped(messages(lang).factories.intro));
    expect(html).not.toContain(escaped(messages(lang).factories.full(true)));
    expect(html.match(/class="plot plot-free"/g)).toHaveLength(1);
  });

  it('renvoie vers les options de retour en jeu sans entreprise', () => {
    const { game, company } = fixture(lang);
    const view = getPlayerView(game, 'human');
    for (const c of view.companies) if (c.id === company.id) c.controllerId = null;
    const html = render(view, lang);
    expect(html).toContain(escaped(messages(lang).factories.noneTitle));
  });
});
