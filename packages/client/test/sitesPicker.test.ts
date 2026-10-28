import { afterEach, describe, expect, it } from 'vitest';
import {
  COMMODITIES,
  PLAYER_COLORS,
  SECTORS,
  SITE_OPENING_COST_MULT,
  SITE_UNIT_COST_RATIO,
  applyAction,
  capitalHexId,
  createGame,
  getPlayerView,
  hexTransportRoute,
  portHaul,
  portHaulHex,
  resolveTurn,
  roadRoute,
  siteHaul,
  siteHaulHex,
  slotCapacity,
  type Action,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
} from '@muchomoney/core';
import { defaultSlot, depositPayback, depositSavings, depositSavingsNow, freeDepositSlot } from '../src/screens/game/sitesPickerModel';
import { deliveredLotPrice, deliveredLotPriceHex, extractionCostNow } from '../src/transport';
import { getState, setState } from '../src/store';

const initialState = getState();
afterEach(() => setState(initialState));

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

function ok(g: GameState, who: string, a: Action): void {
  const r = applyAction(g, who, a);
  expect(r.ok, r.message).toBe(true);
}

/**
 * Cleo fait des yaourts (sucre + huile) au sud, elle a remporté sugar-2, Bob a remporté oil-2.
 * Le sélecteur de gisements sur la carte a disparu avec la refonte « une seule carte » : ce fichier
 * ne garde que les tests du modèle d'aide à la décision (sitesPickerModel), utilisé par la carte.
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

describe.each(['fr', 'en'] as const)('sitesPickerModel (%s)', (lang) => {
  const { g, cleo } = zoneGame(lang);
  const view = getPlayerView(g, 'cleo');
  const mine = view.companies.find((c) => c.id === cleo.id)!;
  const product = mine.products[0];
  const factor = view.transportFactor ?? 1;

  it('depositSavings : prix livrés, lots et économies recalculés à la main (port vs gisement)', () => {
    const s = depositSavings(view, mine, 'sugar-1');
    const zone = 'south' as const;
    const extraction = COMMODITIES.sugar.basePrice * SITE_UNIT_COST_RATIO; // coût normal, sans les news
    const market = view.commodities.find((c) => c.id === 'sugar')!.price;
    const here = deliveredLotPrice({ kind: 'deposit', slotId: 'sugar-1', extractionCost: extraction }, zone, factor);
    const port = deliveredLotPrice({ kind: 'port', commodityId: 'sugar', marketPrice: market }, zone, factor);
    const wanted = Math.min(product.private!.production, product.capacity) * SECTORS.yogurts.inputs.sugar;
    const lots = Math.min(wanted, slotCapacity('sugar-1'));
    expect(s.deliveries).toHaveLength(1);
    const d = s.deliveries[0];
    expect(d.productId).toBe(product.id);
    expect(d.zoneId).toBe(zone);
    expect(d.herePrice).toBeCloseTo(here, 10);
    expect(d.portPrice).toBeCloseTo(port, 10);
    expect(d.lots).toBeCloseTo(lots, 10);
    expect(d.km).toBeCloseTo(roadRoute('sugar-1', zone)!.km, 10);
    expect(s.coveredLots).toBeCloseTo(lots, 10);
    expect(s.total).toBeCloseTo((port - here) * lots, 10);
    expect(s.perLotAvg).toBeCloseTo(port - here, 10);
    expect(s.total).toBeGreaterThan(0);
  });

  it('depositSavings plafonne les lots couverts à la capacité du gisement', () => {
    const g2 = createGame({ seed: 7, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang }, [
      seat('cleo', 'Cleo', 'Cleo SA', 'yogurts', 0),
      seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
    ]);
    const company = Object.values(g2.companies).find((c) => c.founderId === 'cleo')!;
    // Une usine géante : 500 lots × 0,3 = 150 lots de sucre voulus, le gisement riche n'en donne que 50.
    company.products[0].capacity = 500;
    company.products[0].production = 500;
    const view2 = getPlayerView(g2, 'cleo');
    const mine2 = view2.companies.find((c) => c.id === company.id)!;
    const s = depositSavings(view2, mine2, 'sugar-1');
    expect(s.deliveries).toHaveLength(1);
    expect(s.coveredLots).toBe(slotCapacity('sugar-1'));
    expect(s.deliveries[0].lots).toBe(slotCapacity('sugar-1'));
    expect(s.total).toBeCloseTo((s.deliveries[0].portPrice - s.deliveries[0].herePrice) * slotCapacity('sugar-1'), 10);
  });

  it('depositSavingsNow suit le coût d\'extraction du trimestre (news comprises)', () => {
    const sugar = view.commodities.find((c) => c.id === 'sugar')!;
    const s = depositSavingsNow(view, mine, 'sugar-1');
    const cost = extractionCostNow('sugar', sugar.siteCostFactor);
    expect(s.deliveries[0].herePrice).toBeCloseTo(cost + siteHaul('sugar-1', 'south', 'sugar') * factor, 10);
  });

  it('depositPayback : remboursée, jamais remboursée, pas d\'économies', () => {
    // Onze clôtures productives, du prochain trimestre jusqu'au dernier inclus.
    expect(depositPayback(5000, 1000, 11)).toEqual({ quarters: 5, never: false });
    expect(depositPayback(5000, 500, 11)).toEqual({ quarters: 10, never: false });
    expect(depositPayback(5000, 499, 11)).toEqual({ quarters: 11, never: false }); // final productive close
    expect(depositPayback(5000, 450, 11)).toEqual({ quarters: 12, never: true });
    expect(depositPayback(5000, 5000, 1)).toEqual({ quarters: 1, never: false });
    expect(depositPayback(5000, 5000, 0)).toEqual({ quarters: 1, never: true });
    expect(depositPayback(5000, 0, 11)).toEqual({ quarters: null, never: true }); // reserveOnly dans la fiche
    expect(depositPayback(5000, -50, 11)).toEqual({ quarters: null, never: true });
  });

  it('defaultSlot : sa filiale, puis le plus riche des libres, sinon le plus riche', () => {
    expect(defaultSlot(view, 'sugar', mine)!.id).toBe('sugar-2');
    expect(defaultSlot(view, 'oil')!.id).toBe('oil-1'); // oil-2 est à Bob
    const allTaken: PlayerView = { ...view, siteSlots: view.siteSlots.map((s) => ({ ...s, companyId: 'x' })) };
    expect(defaultSlot(allTaken, 'sugar')!.id).toBe('sugar-1'); // le plus riche quand tout est pris
  });

  it('prorates limited supply across every consuming factory regardless of product order', () => {
    const company = structuredClone(mine);
    company.sites = [];
    company.products = [
      { ...structuredClone(product), id: 'drinks', sectorId: 'energy_drinks', zoneId: 'mountain', capacity: 100, private: { ...product.private!, production: 100 } },
      { ...structuredClone(product), id: 'yogurts', sectorId: 'yogurts', zoneId: 'plain', capacity: 100, private: { ...product.private!, production: 100 } },
    ];
    const savings = depositSavings(view, company, 'sugar-1');
    expect(savings.deliveries).toHaveLength(2);
    expect(savings.deliveries.map((delivery) => delivery.lots)).toEqual([31.25, 18.75]);
    const price = view.commodities.find((commodity) => commodity.id === 'sugar')!.price;
    const expected = 31.25 * (price + portHaul('mountain', 'sugar') * factor - 30 - siteHaul('sugar-1', 'mountain', 'sugar') * factor)
      + 18.75 * (price + portHaul('plain', 'sugar') * factor - 30 - siteHaul('sugar-1', 'plain', 'sugar') * factor);
    expect(savings.total).toBeCloseTo(expected, 10);
    company.products.reverse();
    expect(depositSavings(view, company, 'sugar-1').total).toBeCloseTo(expected, 10);
  });

  it('allocates merged running subsidiaries in order after outbound contract commitments', () => {
    const company = structuredClone(mine);
    company.products[0].capacity = 200;
    company.products[0].private!.production = 200; // 60 sugar lots
    const first = { ...company.sites![0], capacity: 40 };
    const second = { ...first, id: 'sugar-1', capacity: 50 };
    company.sites = [first, second];
    expect(depositSavings(view, company, first.id).coveredLots).toBe(40);
    expect(depositSavings(view, company, second.id).coveredLots).toBe(20);
    const withContract = structuredClone(view);
    withContract.self!.contracts = [{ id: 'supply', sellerCompanyId: company.id, buyerCompanyId: view.companies.find((c) => c.id !== company.id && c.status === 'active')!.id,
      commodityId: 'sugar', lots: 30, price: 50, turnsLeft: 2 }];
    expect(depositSavings(withContract, company, first.id).coveredLots).toBe(10);
    expect(depositSavings(withContract, company, second.id).coveredLots).toBe(50);
    company.sites[0].dormant = true;
    expect(depositSavings(view, company, second.id).coveredLots).toBe(50);
    company.sites[0].dormant = false;
    company.sites[0].activeFrom = view.turn + 1;
    expect(depositSavings(view, company, second.id).coveredLots).toBe(50);
  });

  it('prefers the pending bid over richer free deposits, but own deposits take precedence', () => {
    const pendingView = structuredClone(view);
    const company = structuredClone(mine);
    company.sites = [];
    pendingView.siteSlots = pendingView.siteSlots.map((slot) => ({ ...slot, companyId: undefined }));
    pendingView.self!.siteBids = [{ companyId: company.id, playerId: 'cleo', commodityId: 'sugar', slotId: 'sugar-3', amount: 6000, turn: view.turn }];
    expect(defaultSlot(pendingView, 'sugar', company)?.id).toBe('sugar-3');
    expect(defaultSlot(pendingView, 'sugar', mine)?.id).toBe('sugar-2');
    pendingView.siteSlots.find((slot) => slot.id === 'sugar-3')!.companyId = 'rival';
    expect(defaultSlot(pendingView, 'sugar', company)?.id).toBe('sugar-1');
  });

  it('defaultSlot : l’enchère réglée prime sur le plus riche libre, pas sur la filiale ni la mise en attente', () => {
    const resulted = structuredClone(view);
    const company = structuredClone(mine);
    company.sites = [];
    resulted.siteSlots = resulted.siteSlots.map((slot) => ({ ...slot, companyId: undefined }));
    resulted.siteSlots.find((slot) => slot.id === 'sugar-3')!.companyId = 'rival'; // perdue : un rival l'a emportée
    resulted.self!.siteBids = [{ companyId: company.id, playerId: 'cleo', commodityId: 'sugar', slotId: 'sugar-3', amount: 6000, turn: view.turn,
      result: { outcome: 'lost', price: 7200, bidders: 3 } }];
    // Le gisement perdu s'ouvre pour montrer le prix d'adjudication, pas le plus riche libre (sugar-1).
    expect(defaultSlot(resulted, 'sugar', company)?.id).toBe('sugar-3');
    // La filiale possédée prime toujours.
    expect(defaultSlot(resulted, 'sugar', mine)?.id).toBe('sugar-2');
    // La mise en attente prime sur l'issue réglée.
    resulted.self!.siteBids = [
      { companyId: company.id, playerId: 'cleo', commodityId: 'sugar', slotId: 'sugar-3', amount: 6000, turn: view.turn,
        result: { outcome: 'lost', price: 7200, bidders: 3 } },
      { companyId: company.id, playerId: 'cleo', commodityId: 'sugar', slotId: 'sugar-2', amount: 7000, turn: view.turn },
    ];
    expect(defaultSlot(resulted, 'sugar', company)?.id).toBe('sugar-2');
  });

  it('freeDepositSlot : le plus riche des gisements vraiment enchérissables, undefined sinon', () => {
    // Cleo a déjà une filiale sucre : rien à miser pour cette matière.
    expect(freeDepositSlot(view, 'sugar', mine)).toBeUndefined();
    // Sans filiale sucre : le plus riche des libres (sugar-1), sugar-2 est pris par personne ici mais la filiale compte.
    const company = structuredClone(mine);
    company.sites = [];
    const free = structuredClone(view);
    free.siteSlots = free.siteSlots.map((slot) => (slot.companyId === mine.id ? { ...slot, companyId: undefined } : slot));
    expect(freeDepositSlot(free, 'sugar', company)?.id).toBe('sugar-1');
    // Une mise en attente sur sugar-1 le rend inéligible : le suivant le plus riche.
    free.self!.siteBids = [{ companyId: company.id, playerId: 'cleo', commodityId: 'sugar', slotId: 'sugar-1', amount: 6000, turn: view.turn }];
    const next = freeDepositSlot(free, 'sugar', company)!;
    expect(next.id).not.toBe('sugar-1');
    expect(next.companyId).toBeUndefined();
    expect(slotCapacity(next.id)).toBe(Math.max(...free.siteSlots.filter((s) => s.commodityId === 'sugar' && !s.companyId && s.id !== 'sugar-1').map((s) => slotCapacity(s.id))));
    // Tout est pris ou misé : undefined (la carte retombe alors sur defaultSlot).
    const allTaken = structuredClone(free);
    allTaken.siteSlots = allTaken.siteSlots.map((slot) => (slot.commodityId === 'sugar' ? { ...slot, companyId: slot.id === 'sugar-1' ? undefined : 'rival' } : slot));
    expect(freeDepositSlot(allTaken, 'sugar', company)).toBeUndefined();
  });
});

it('crypto subsidiary prices exclude hauling even far from the port', () => {
  const state = createGame({ seed: 22, totalTurns: 12, turnSeconds: 90, startYear: 2027 }, [seat('a', 'Ada', 'Ada SA', 'crypto', 0)]);
  const company = Object.values(state.companies).find((c) => c.controllerId === 'a')!;
  company.products[0].zoneId = 'mountain';
  company.sites = [{ id: 'oil-1', commodityId: 'oil', capacity: 30, unitCost: 17, activeFrom: state.turn }];
  state.activeEffects = [{ id: 'haul', newsId: 'test', kind: 'transportCost', value: 3, turnsLeft: 2 }];
  const view = getPlayerView(state, 'a');
  const mine = view.companies.find((c) => c.id === company.id)!;
  const savings = depositSavingsNow(view, mine, 'oil-1');
  expect(savings.deliveries).toHaveLength(1);
  expect(savings.deliveries[0].km).toBe(0);
  expect(savings.deliveries[0].herePrice).toBe(17);
  expect(savings.deliveries[0].portPrice).toBe(state.commodities.oil.price);
});

describe('deposit savings on the hex board', () => {
  function hexCompany() {
    const game = createGame({ seed: 71, totalTurns: 12, turnSeconds: 90, startYear: 2027, mapMode: 'hex', terrainAssignment: 'fair' },
      [seat('a', 'Ada', 'Ada SA', 'yogurts', 0)]);
    const company = Object.values(game.companies).find((c) => c.controllerId === 'a')!;
    const initial = getPlayerView(game, 'a');
    const remote = initial.hexes!.free[20];
    const original = company.products[0];
    company.products = [
      { ...structuredClone(original), id: 'capital-yogurts', zoneId: 'capital', hexId: capitalHexId, capacity: 100, production: 100 },
      { ...structuredClone(original), id: 'remote-drinks', sectorId: 'energy_drinks', zoneId: 'capital', hexId: remote, capacity: 100, production: 100 },
    ];
    company.sites = [];
    game.activeEffects = [{ id: 'haul', newsId: 'test', kind: 'transportCost', value: 1.8, turnsLeft: 2 }];
    const view = getPlayerView(game, 'a');
    const mine = view.companies.find((c) => c.id === company.id)!;
    return { game, company, view, mine, remote };
  }

  it('uses each consuming plant hex rather than its stale capital zone, with absolute port and subsidiary hauls', () => {
    const { view, mine, remote } = hexCompany();
    const slotId = 'sugar-1';
    const extraction = COMMODITIES.sugar.basePrice * SITE_UNIT_COST_RATIO;
    const market = view.commodities.find((commodity) => commodity.id === 'sugar')!.price;
    const factor = view.transportFactor!;
    const savings = depositSavings(view, mine, slotId);
    expect(savings.coveredLots).toBe(50);
    expect(savings.deliveries.map((delivery) => delivery.lots)).toEqual([18.75, 31.25]);
    expect(savings.deliveries.map((delivery) => delivery.hexId)).toEqual([capitalHexId, remote]);
    for (const delivery of savings.deliveries) {
      const hexId = delivery.hexId!;
      const here = extraction + siteHaulHex(slotId, hexId, 'sugar') * factor;
      const port = market + portHaulHex(hexId, 'sugar') * factor;
      expect(delivery.herePrice).toBe(here);
      expect(delivery.portPrice).toBe(port);
      expect(delivery.km).toBe(hexTransportRoute(hexId, slotId)!.km);
      expect(deliveredLotPriceHex({ kind: 'deposit', slotId, extractionCost: extraction }, hexId, factor)).toBe(here);
      expect(deliveredLotPriceHex({ kind: 'port', commodityId: 'sugar', marketPrice: market }, hexId, factor)).toBe(port);
    }
    expect(savings.deliveries[0].herePrice).toBeGreaterThan(extraction); // subsidiary haul is paid at the capital too
    expect(savings.deliveries[1].portPrice).toBeGreaterThan(savings.deliveries[0].portPrice);
    expect(savings.total).toBe(savings.deliveries.reduce((total, delivery) => total + delivery.lots * (delivery.portPrice - delivery.herePrice), 0));
  });

  it('hex crypto pays extraction and market prices without material freight', () => {
    const { view, mine, remote } = hexCompany();
    mine.products = [{ ...mine.products[0], sectorId: 'crypto', hexId: remote }];
    const savings = depositSavings(view, mine, 'oil-1');
    expect(savings.deliveries[0].km).toBe(0);
    expect(savings.deliveries[0].herePrice).toBe(COMMODITIES.oil.basePrice * SITE_UNIT_COST_RATIO);
    expect(savings.deliveries[0].portPrice).toBe(view.commodities.find((commodity) => commodity.id === 'oil')!.price);
    expect(deliveredLotPriceHex({ kind: 'deposit', slotId: 'oil-1', extractionCost: 17 }, remote, 3, 'crypto')).toBe(17);
  });
});
