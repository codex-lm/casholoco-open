import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, resolveTurn } from '../src/engine';
import { COMMODITIES, DEPOSITS, NEWS_CARDS, SECTORS, ZONES, roadRoute, zoneOf } from '../src/content';
import { FACTORY_MOVE_COST_RATIO, SITE_UNIT_COST_RATIO, TRANSPORT_COST_PER_KM } from '../src/sim/constants';
import { planClose } from '../src/sim/close';
import { estimatedUnitCost, laborMultiplier, laborPerLot, unitCostByZone } from '../src/sim/finance';
import { applyNewsCard } from '../src/sim/news';
import { deliveryKm } from '../src/sim/regions';
import { deliveryPerLot, estimatedTransport, plantsIn, portHaul, portOnlyTransport, siteHaul, transportFactor, transportPerLot, zoneLabor, zoneLaborFactor } from '../src/sim/transport';
import { COMMODITY_IDS, SECTOR_IDS, ZONE_IDS, type Action, type CompanyState, type CommodityId, type GameState, type ZoneId } from '../src/types';
import { bots, companyOf, human, newGame } from './helpers';

const ok = (s: GameState, who: string, a: Action) => {
  const r = applyAction(s, who, a);
  expect(r.ok, r.message).toBe(true);
  return r;
};
const ko = (s: GameState, who: string, a: Action) => {
  const r = applyAction(s, who, a);
  expect(r.ok, r.message).toBe(false);
  return r;
};

/** Alice (gadgets), Bob (boissons) : deux humains, aucun bot ; caisses pleines, stocks vides. */
function duo(): GameState {
  const s = newGame(7, [human('a', 'gadgets', 'Alice'), human('b', 'energy_drinks', 'Bob')]);
  for (const c of Object.values(s.companies)) {
    c.inventory = {};
    if (c.controllerId) c.cash = 1e6;
  }
  s.activeEffects = s.activeEffects.filter((e) => e.kind !== 'laborCost');
  return s;
}
const productOf = (c: CompanyState) => c.products[0];

describe('géographie des coûts (§5.8)', () => {
  it('une usine à la capitale paie sa livraison et ses filiales, mais pas les matières venues du port', () => {
    const s = duo();
    const c = companyOf(s, 'a');
    expect(transportPerLot(c, [24], [])[0]).toBeCloseTo(deliveryPerLot('capital', 'gadgets'), 12);
    expect(estimatedTransport(s, c, productOf(c))).toBeCloseTo(deliveryPerLot('capital', 'gadgets'), 12);
    for (const sid of Object.keys(SECTORS) as (keyof typeof SECTORS)[]) expect(zoneLabor('capital', sid)).toBe(1);
    for (const cid of COMMODITY_IDS) expect(portHaul('capital', cid)).toBe(0);
    for (const sid of SECTOR_IDS) expect(deliveryPerLot('capital', sid)).toBe(SECTORS[sid].intangible ? 0 : TRANSPORT_COST_PER_KM * SECTORS[sid].freightWeight * deliveryKm(sid, 'capital'));
    for (const id of Object.keys(DEPOSITS)) for (const cid of COMMODITY_IDS) expect(siteHaul(id, 'capital', cid)).toBeCloseTo(TRANSPORT_COST_PER_KM * COMMODITIES[cid].freightWeight * roadRoute(id, 'capital')!.cost, 12);
  });

  it('ailleurs : main-d’œuvre de la zone, matières venues du port, livraison dans toutes les villes ; résolution = estimation', () => {
    const s = duo();
    const c = companyOf(s, 'a');
    const p = productOf(c);
    ok(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'north_east' });
    expect(p.zoneId).toBe('north_east');
    const def = SECTORS.gadgets;
    let transport = deliveryPerLot('north_east', 'gadgets');
    for (const [cid, per] of Object.entries(def.inputs)) transport += (per ?? 0) * portHaul('north_east', cid as CommodityId);
    expect(transport).toBeGreaterThan(0);
    expect(estimatedTransport(s, c, p)).toBeCloseTo(transport, 9);
    const estimate = estimatedUnitCost(s, c, p);
    let materials = 0;
    for (const [cid, per] of Object.entries(def.inputs)) materials += (per ?? 0) * s.commodities[cid as keyof typeof s.commodities].price * 1.1;
    expect(estimate).toBeCloseTo(def.laborCost * laborMultiplier(s, c, 'gadgets') * ZONES.north_east.labor.gadgets + materials + transport, 6);
    // Le plan de clôture compte la même chose : ici, tout en achat d'urgence.
    const plan = planClose(s, c);
    expect(plan.production.plannedCost).toBeCloseTo(plan.production.planned * estimate, 4);
    resolveTurn(s);
    const report = c.reports.at(-1)!.products.find((x) => x.productId === p.id)!;
    expect(report.produced).toBe(plan.production.planned);
    expect(report.transport).toBeCloseTo(transport, 6);
    expect(p.lastUnitCost).toBeCloseTo(estimate, 6);
    const freight = report.freight!;
    expect(freight.total).toBeCloseTo(report.transport!, 12);
    expect(freight.materials.reduce((sum, leg) => sum + leg.cost, 0)).toBe(freight.materialsCost);
    expect(freight.delivery.reduce((sum, leg) => sum + leg.cost, 0)).toBe(freight.deliveryCost);
    expect(report.transportMaterials).toBeCloseTo(freight.materialsCost * report.produced, 12);
    expect(report.transportDelivery).toBeCloseTo(freight.deliveryCost * report.produced, 12);
    const historical = JSON.stringify(freight);
    p.zoneId = 'mountain';
    s.activeEffects.push({ id: 'later', newsId: 'later', kind: 'transportCost', value: 2, turnsLeft: 1 });
    expect(JSON.stringify(report.freight)).toBe(historical);
  });

  it('sa propre filiale : les lots extraits servent d’abord, et un gisement proche fait économiser du transport', () => {
    const s = duo();
    const c = companyOf(s, 'b');
    const p = productOf(c);
    c.sites = [{ id: 'sugar-1', commodityId: 'sugar', capacity: 50, unitCost: 40 * SITE_UNIT_COST_RATIO, activeFrom: s.turn }];
    ok(s, 'b', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'plain' });
    // Tout le sucre vient de la filiale de la plaine (50 lots pour un besoin de 0,5 × la production) :
    // seul le trajet gisement → usine est payé ; le pétrole vient du port.
    const lots = Math.floor(Math.min(p.production, p.capacity));
    expect(0.5 * lots).toBeLessThanOrEqual(50);
    const expected = 0.5 * siteHaul('sugar-1', 'plain', 'sugar') + 0.1 * portHaul('plain', 'oil') + deliveryPerLot('plain', 'energy_drinks');
    expect(siteHaul('sugar-1', 'plain', 'sugar')).toBeGreaterThanOrEqual(0);
    expect(siteHaul('sugar-1', 'plain', 'sugar')).toBeLessThan(portHaul('plain', 'sugar'));
    expect(estimatedTransport(s, c, p)).toBeCloseTo(expected, 9);
    // La capitale paie désormais le gisement → capitale et ses livraisons aux autres villes.
    expect(estimatedTransport(s, c, p, 'capital')).toBeCloseTo(0.5 * siteHaul('sugar-1', 'capital', 'sugar') + deliveryPerLot('capital', 'energy_drinks'), 12);
    // Sans filiale, tout vient du port : plus cher.
    expect(estimatedTransport(s, { ...c, sites: [] }, p)).toBeGreaterThan(expected);
    resolveTurn(s);
    expect(c.reports.at(-1)!.products[0].transport).toBeCloseTo(expected, 6);
  });

  it('l’économie d’un gisement proche dure : estimation et résolution d’accord à chaque trimestre, stock rempli ou non', () => {
    const s = duo();
    const c = companyOf(s, 'b');
    const p = productOf(c);
    c.sites = [{ id: 'sugar-1', commodityId: 'sugar', capacity: 50, unitCost: 40 * SITE_UNIT_COST_RATIO, activeFrom: s.turn }];
    ok(s, 'b', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'plain' });
    for (let q = 0; q < 4; q++) {
      s.activeEffects = s.activeEffects.filter((e) => e.kind !== 'siteCost' && e.kind !== 'laborCost');
      c.cash = 1e6;
      const estimate = estimatedTransport(s, c, p);
      resolveTurn(s);
      // Le surplus de la filiale remplit le stock : la production y puise, et ces lots viennent toujours du gisement.
      expect(c.reports.at(-1)!.products[0].transport, `trimestre ${q + 1}`).toBeCloseTo(estimate, 9);
      expect(estimate).toBeLessThan(portOnlyTransport('energy_drinks', 'plain') * transportFactor(s));
    }
  });

  it('les lots promis par contrat ne comptent pas comme venus du gisement pour le vendeur', () => {
    const s = duo();
    const alice = companyOf(s, 'a');
    const bob = companyOf(s, 'b');
    const p = productOf(alice);
    alice.sites = [{ id: 'lithium-1', commodityId: 'lithium', capacity: 50, unitCost: 120 * SITE_UNIT_COST_RATIO, activeFrom: s.turn }];
    ok(s, 'a', { type: 'moveFactory', companyId: alice.id, productId: p.id, zoneId: 'east' });
    const withSite = estimatedTransport(s, alice, p);
    s.contracts = [{ id: 'k1', sellerCompanyId: alice.id, buyerCompanyId: bob.id, commodityId: 'lithium', lots: 50, price: 100, turnsLeft: 3 }];
    // Tout le lithium du gisement part chez Bob : celui de la production d'Alice vient du port.
    const lots = Math.floor(Math.min(p.production, p.capacity));
    expect(transportPerLot(alice, [lots], [{ siteId: 'lithium-1', commodityId: 'lithium', lots: 0 }])[0]).toBeCloseTo(estimatedTransport(s, alice, p), 9);
    expect(estimatedTransport(s, alice, p)).toBeGreaterThan(withSite);
    resolveTurn(s);
    expect(alice.reports.at(-1)!.products[0].transport).toBeCloseTo(0.4 * portHaul('east', 'lithium') + 1.2 * portHaul('east', 'chips') + deliveryPerLot('east', 'gadgets'), 6);
  });

  it('le transport suit le prix au km et les routes', () => {
    expect(TRANSPORT_COST_PER_KM).toBeGreaterThan(0);
    // De la capitale au nord-est, l'autoroute : moins cher au km qu'une nationale.
    expect(portHaul('north_east', 'oil')).toBeLessThan(portHaul('mountain', 'oil'));
    for (const z of ZONE_IDS) for (const cid of COMMODITY_IDS) expect(portHaul(z, cid)).toBeGreaterThanOrEqual(0);
  });
});

describe('fret au poids (§5.8) : la distance est une facture, rien d’autre', () => {
  it('la livraison facture le tarif au km × le poids du secteur × la distance moyenne absolue des ventes de référence', () => {
    for (const sid of Object.keys(SECTORS) as (keyof typeof SECTORS)[]) {
      for (const z of ZONE_IDS) {
        const expected = SECTORS[sid].intangible ? 0 : TRANSPORT_COST_PER_KM * SECTORS[sid].freightWeight * deliveryKm(sid, z);
        expect(deliveryPerLot(z, sid), `${sid}/${z}`).toBeCloseTo(expected, 12);
      }
    }
  });

  it('l’acheminement d’une matière facture le tarif au km × son poids × la route ; les trajets de gisements sont absolus', () => {
    const km = roadRoute('capital', 'mountain')!.cost;
    for (const cid of COMMODITY_IDS) {
      expect(portHaul('mountain', cid)).toBeCloseTo(TRANSPORT_COST_PER_KM * COMMODITIES[cid].freightWeight * km, 12);
    }
    // Même route : la facture est en proportion exacte des poids (le pétrole pèse 7,5 wafers de puces).
    expect(portHaul('north_east', 'oil') / portHaul('north_east', 'chips')).toBeCloseTo(COMMODITIES.oil.freightWeight / COMMODITIES.chips.freightWeight, 12);
    expect(siteHaul('sugar-1', 'plain', 'sugar')).toBeCloseTo(
      TRANSPORT_COST_PER_KM * COMMODITIES.sugar.freightWeight * roadRoute('sugar-1', 'plain')!.cost, 12);
    expect(siteHaul('sugar-1', 'plain', 'sugar')).toBeGreaterThanOrEqual(0);
    expect(siteHaul('sugar-1', 'plain', 'sugar')).toBeLessThan(portHaul('plain', 'sugar'));
  });

  it('la crypto (immatérielle) ne paie ni livraison ni acheminement, candidat compris', () => {
    for (const z of ZONE_IDS) {
      expect(deliveryPerLot(z, 'crypto')).toBe(0);
      expect(portOnlyTransport('crypto', z)).toBe(0);
    }
  });

  it('les coûts candidats des bots embarquent la facture pondérée : les canettes paient plus que les gadgets', () => {
    const s = duo();
    const a = companyOf(s, 'a'); // gadgets
    const b = companyOf(s, 'b'); // boissons énergisantes
    const z: ZoneId = 'north_east';
    const tGadgets = 0.4 * portHaul(z, 'lithium') + 1.2 * portHaul(z, 'chips') + deliveryPerLot(z, 'gadgets');
    const tDrinks = 0.5 * portHaul(z, 'sugar') + 0.1 * portHaul(z, 'oil') + deliveryPerLot(z, 'energy_drinks');
    // Le coût unitaire candidat de la zone (celui que balayent zoneValues/hexValues) vaut celui de la capitale
    // plus l'écart de main-d'œuvre et la facture de fret au poids.
    expect(unitCostByZone(s, a, a.products[0])[z] - unitCostByZone(s, a, a.products[0]).capital)
      .toBeCloseTo(laborPerLot(s, a, a.products[0], z) - laborPerLot(s, a, a.products[0], 'capital') + tGadgets - deliveryPerLot('capital', 'gadgets'), 9);
    expect(unitCostByZone(s, b, b.products[0])[z] - unitCostByZone(s, b, b.products[0]).capital)
      .toBeCloseTo(laborPerLot(s, b, b.products[0], z) - laborPerLot(s, b, b.products[0], 'capital') + tDrinks - deliveryPerLot('capital', 'energy_drinks'), 9);
    expect(tDrinks).toBeGreaterThan(tGadgets); // 3 chargements le lot contre 0,6 : le poids fait la facture.
  });
});

describe('zones vivantes (§5.8) : pression sur les salaires, nouvelles locales', () => {
  it('hors de la capitale, chaque autre usine de la zone renchérit la main-d’œuvre de 3 %, au plus +15 %', () => {
    const s = duo();
    const [a, b] = [companyOf(s, 'a'), companyOf(s, 'b')];
    const [pa, pb] = [productOf(a), productOf(b)];
    const base = (c: CompanyState, z: ZoneId) => SECTORS[productOf(c).sectorId].laborCost * laborMultiplier(s, c, productOf(c).sectorId) * zoneLabor(z, productOf(c).sectorId);
    expect(plantsIn(s, 'north_east')).toBe(0);
    expect(zoneLaborFactor(s, 'gadgets', 'capital', pa.id)).toBe(1);
    ok(s, 'a', { type: 'moveFactory', companyId: a.id, productId: pa.id, zoneId: 'north_east' });
    // Seule dans la zone : pas de pression.
    expect(laborPerLot(s, a, pa)).toBeCloseTo(base(a, 'north_east'), 9);
    ok(s, 'b', { type: 'moveFactory', companyId: b.id, productId: pb.id, zoneId: 'north_east' });
    expect(plantsIn(s, 'north_east')).toBe(2);
    expect(laborPerLot(s, a, pa)).toBeCloseTo(base(a, 'north_east') * 1.03, 9);
    expect(laborPerLot(s, b, pb)).toBeCloseTo(base(b, 'north_east') * 1.03, 9);
    // Une usine nouvelle dans la zone en compterait deux autres.
    expect(zoneLaborFactor(s, 'yogurts', 'north_east')).toBeCloseTo(zoneLabor('north_east', 'yogurts') * 1.06, 9);
    // La capitale n'a pas de pression, quel que soit le nombre d'usines.
    expect(zoneLaborFactor(s, 'yogurts', 'capital')).toBe(1);
    // Plafond : au plus cinq autres usines comptent.
    for (let i = 0; i < 8; i++) a.products.push({ ...pa, id: `clone${i}` });
    expect(zoneLaborFactor(s, 'gadgets', 'north_east', pa.id)).toBeCloseTo(zoneLabor('north_east', 'gadgets') * 1.15, 9);
  });

  it('une grève (ou une subvention) change la main-d’œuvre de sa zone ; le gazole, tout le transport', () => {
    const s = duo();
    const c = companyOf(s, 'a');
    const p = productOf(c);
    ok(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'north_east' });
    s.activeEffects = s.activeEffects.filter((e) => e.kind !== 'zoneLabor' && e.kind !== 'transportCost');
    const labor0 = laborPerLot(s, c, p);
    const transport0 = estimatedTransport(s, c, p);
    const card = (id: string) => NEWS_CARDS.find((x) => x.id === id)!;
    applyNewsCard(s, card('mp_growth_city_telework'), 'news');
    expect(laborPerLot(s, c, p)).toBeCloseTo(labor0 * 1.25, 9);
    // Une autre zone n'est pas touchée.
    expect(zoneLaborFactor(s, 'gadgets', 'south', p.id)).toBeCloseTo(zoneLabor('south', 'gadgets'), 9);
    expect(getPlayerView(s, 'a').transportFactor).toBeUndefined();
    applyNewsCard(s, card('mp_diesel_champagne'), 'news');
    expect(transportFactor(s)).toBeCloseTo(1.6, 9);
    expect(estimatedTransport(s, c, p)).toBeCloseTo(transport0 * 1.6, 9);
    // Le multiplicateur est public, comme le journal : le client s'en sert pour les prix livrés.
    expect(getPlayerView(s, 'b').transportFactor).toBeCloseTo(1.6, 9);
    // La nouvelle multiplie aussi la livraison depuis la capitale.
    expect(estimatedTransport(s, c, p, 'capital')).toBeCloseTo(deliveryPerLot('capital', 'gadgets') * 1.6, 12);
    // La résolution compte la même chose que l'estimation.
    const estimate = estimatedUnitCost(s, c, p);
    resolveTurn(s);
    expect(p.lastUnitCost).toBeCloseTo(estimate, 6);
  });
});

describe('déménager une usine (§5.8)', () => {
  it('gratuit le trimestre où le produit démarre, payant ensuite (charges spéciales), refusé hors des règles', () => {
    const s = duo();
    const c = companyOf(s, 'a');
    const p = productOf(c);
    ko(s, 'b', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'south' }); // pas son entreprise
    ko(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'atlantis' as ZoneId });
    ko(s, 'a', { type: 'moveFactory', companyId: c.id, productId: 'nope', zoneId: 'south' });
    ko(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'capital' }); // déjà là
    const cash = c.cash;
    ok(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'south' });
    ok(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'north_east' }); // encore gratuit
    expect(c.cash).toBe(cash);
    expect(c.turnFlags.specialCharges ?? 0).toBe(0);
    expect(getPlayerView(s, 'a').companies.find((x) => x.id === c.id)!.products[0].private!.zones.moveCost).toBe(0);
    resolveTurn(s);
    const cost = FACTORY_MOVE_COST_RATIO * (p.capacity + p.pendingCapacity) * SECTORS.gadgets.capacityCost;
    expect(getPlayerView(s, 'a').companies.find((x) => x.id === c.id)!.products[0].private!.zones.moveCost).toBeCloseTo(cost, 6);
    const before = c.cash;
    c.cash = cost - 1;
    ko(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'capital' }); // pas de quoi payer
    c.cash = before;
    ok(s, 'a', { type: 'moveFactory', companyId: c.id, productId: p.id, zoneId: 'capital' });
    expect(c.cash).toBeCloseTo(before - cost, 6);
    expect(c.turnFlags.specialCharges).toBeCloseTo(cost, 6);
    // Retour à la capitale : le produit n'a plus de zone.
    expect(p.zoneId).toBeUndefined();
    resolveTurn(s);
    expect(c.reports.at(-1)!.specialCharges ?? 0).toBeCloseTo(cost, 6);
  });

  it('un lancement peut choisir sa zone ; la vue estime le coût unitaire de chaque zone et le lancement dans chacune', () => {
    const s = duo();
    const c = companyOf(s, 'a');
    ko(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'scooters', name: 'Trotti Nord', zoneId: 'nowhere' as ZoneId });
    const r = ok(s, 'a', { type: 'launchProduct', companyId: c.id, sectorId: 'scooters', name: 'Trotti Sud', zoneId: 'south' });
    const launched = c.products.at(-1)!;
    expect(launched.zoneId).toBe('south');
    expect(r.message).toContain('Saint-Bénéfice');
    // Le trimestre du lancement, la nouvelle usine se déménage gratuitement.
    const cash = c.cash;
    ok(s, 'a', { type: 'moveFactory', companyId: c.id, productId: launched.id, zoneId: 'mountain' });
    expect(c.cash).toBe(cash);
    const view = getPlayerView(s, 'a');
    const pv = view.companies.find((x) => x.id === c.id)!.products[0];
    for (const z of ZONE_IDS) {
      expect(pv.private!.zones.unitCost[z]).toBeCloseTo(estimatedUnitCost(s, c, productOf(c), z), 9);
      // Le calcul mutualisé de la vue donne exactement le même nombre que le calcul zone par zone.
      for (const q of c.products) expect(unitCostByZone(s, c, q)[z]).toBe(estimatedUnitCost(s, c, q, z));
    }
    expect(pv.private!.zones.unitCost.capital).toBeCloseTo(pv.private!.estimatedUnitCost, 9);
    const sector = view.sectors.find((x) => x.id === 'scooters')!;
    expect(Object.keys(sector.launchByZone!).sort()).toEqual([...ZONE_IDS].sort());
    expect(sector.launchByZone!.capital.quarterlyProfit).toBe(sector.launchEstimate!.quarterlyProfit);
    // Les rivaux voient la zone (publique), pas les coûts.
    const seen = getPlayerView(s, 'b').companies.find((x) => x.id === c.id)!;
    expect(seen.products.at(-1)!.zoneId).toBe('mountain');
    expect(seen.products[0].private).toBeUndefined();
  });
});

describe('les bots et les zones (§5.8)', () => {
  it('s’installent au démarrage d’un produit, gratuitement, et ne déménagent plus ensuite', () => {
    let moved = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = newGame(seed, [...bots(5), human('h', 'yogurts')]);
      const zoneAt = new Map<string, ZoneId>();
      while (s.phase === 'playing') {
        for (const c of Object.values(s.companies)) {
          if (c.status !== 'active') continue;
          for (const p of c.products) {
            const z = zoneOf(p).id;
            const before = zoneAt.get(p.id);
            // Une usine ne change de zone que le trimestre où son produit démarre.
            if (before !== undefined && before !== z) expect(p.launchedTurn, `${p.id} ${before} → ${z}`).toBe(s.turn);
            zoneAt.set(p.id, z);
          }
        }
        resolveTurn(s);
      }
      // Les PNJ et l'humain passif restent à la capitale.
      for (const c of Object.values(s.companies)) {
        const bot = c.controllerId !== null && s.players[c.controllerId]?.isBot;
        if (!bot && c.founderId !== null) continue;
        for (const p of c.products) if (zoneOf(p).id !== 'capital') moved++;
      }
      for (const c of Object.values(s.companies)) if (c.npcDefId !== undefined && c.controllerId === null) for (const p of c.products) expect(p.zoneId).toBeUndefined();
    }
    expect(moved).toBeGreaterThan(0);
  });
});
