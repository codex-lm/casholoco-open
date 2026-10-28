import { afterEach, describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { CITIES, SECTORS, roadRoute } from '../src/content';
import { estimateSales, zoneValues } from '../src/sim/advice';
import { setBotZoneMode } from '../src/sim/bots';
import { away, cityTotals, cityWeights, deliveryKm, deliveryKmByCity, demandIn, proximity, salesMix, setRegionParams } from '../src/sim/regions';
import { deliveryPerLot } from '../src/sim/transport';
import { fin } from '../src/sim/util';
import { CITY_IDS, SECTOR_IDS, ZONE_IDS, type Action, type GameState, type SectorId } from '../src/types';
import { bots, companyOf, config, human, newGame } from './helpers';

const ok = (s: GameState, who: string, a: Action) => {
  const r = applyAction(s, who, a);
  expect(r.ok, r.message).toBe(true);
};
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** Alice et Bob, deux humains dans les yaourts (le secteur au plus fort bonus « fabriqué ici »). */
function yogurtDuo(): GameState {
  const s = newGame(11, [human('a', 'yogurts', 'Alice'), human('b', 'yogurts', 'Bob')]);
  for (const c of Object.values(s.companies)) if (c.controllerId) c.cash = 1e6;
  return s;
}
const moveTo = (s: GameState, who: string, zoneId: (typeof ZONE_IDS)[number]) => {
  const c = companyOf(s, who);
  ok(s, who, { type: 'moveFactory', companyId: c.id, productId: c.products[0].id, zoneId });
};

/** Suite pseudo-aléatoire fixe (les tests n'ont pas besoin du RNG du moteur). */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

afterEach(() => {
  setRegionParams(null);
  setBotZoneMode('market');
});

describe('marchés régionaux : les tables (§5.2 bis)', () => {
  it('chaque ville a son secteur fétiche, les poids des villes font 1, la capitale est neutre', () => {
    const tops = new Set<string>();
    for (const s of SECTOR_IDS) {
      const w = cityWeights(s);
      expect(sum(w)).toBeCloseTo(1, 12);
      for (const k of CITY_IDS) {
        expect(CITIES[k].taste[s]).toBeGreaterThan(0);
        // Proximité 1 partout pour une usine à la capitale, comme les importateurs : exactement.
        expect(Object.is(proximity(s, 'capital')[k], 1)).toBe(true);
      }
      // Le goût le plus fort de chaque secteur est dans une seule ville.
      const best = Math.max(...CITY_IDS.map((k) => CITIES[k].taste[s]));
      const at = CITY_IDS.filter((k) => CITIES[k].taste[s] === best);
      expect(at.length, s).toBe(1);
      tops.add(at[0]);
      expect(deliveryKm(s, 'capital')).toBeCloseTo(CITY_IDS.reduce((total, city) => total + salesMix(s, 'capital')[city] * roadRoute('capital', city)!.cost, 0), 12);
      expect(deliveryPerLot('capital', s)).toBe(SECTORS[s].intangible ? 0 : 0.0045 * SECTORS[s].freightWeight * deliveryKm(s, 'capital'));
      expect(deliveryKmByCity('capital').capital).toBe(0);
    }
    expect([...tops].sort()).toEqual([...CITY_IDS].sort());
  });

  it('facteur 1 partout, sauf le bonus « fabriqué ici » dans la ville de l’usine ; mélange de livraison de somme 1', () => {
    for (const s of SECTOR_IDS) {
      const bonus = 1 + SECTORS[s].localBonus;
      for (const z of ZONE_IDS) {
        const pi = proximity(s, z);
        for (const k of CITY_IDS) {
          expect(pi[k], `${s}/${z}/${k}`).toBe(z !== 'capital' && k === z ? bonus : 1);
        }
        expect(sum(salesMix(s, z))).toBeCloseTo(1, 12);
      }
    }
  });

  it('la distance ne retire rien : la montagne vend comme la capitale, la crypto n’a aucun bonus local', () => {
    // Plaine et montagne (zones sans ville) : facteur 1 partout, comme la capitale.
    for (const s of SECTOR_IDS) {
      for (const z of ['plain', 'mountain', 'capital'] as const) {
        for (const k of CITY_IDS) expect(Object.is(proximity(s, z)[k], 1)).toBe(true);
      }
    }
    // La crypto (numérique) n'a pas de « fabriqué ici » ; les yaourts ont le plus fort.
    expect(SECTORS.crypto.localBonus).toBe(0);
    expect(SECTORS.yogurts.localBonus).toBeGreaterThan(SECTORS.gadgets.localBonus);
    // Sans bonus local, un secteur vend pareil depuis n'importe quelle zone : même mélange de livraison partout.
    for (const z of ZONE_IDS) expect(salesMix('crypto', z)).toEqual(salesMix('crypto', 'capital'));
  });
});

describe('marchés régionaux : la formule', () => {
  it('à la capitale, la demande est celle d’avant au bit près (marché national)', () => {
    const r = lcg(3);
    for (let i = 0; i < 500; i++) {
      const s = SECTOR_IDS[i % SECTOR_IDS.length];
      const D = r() < 0.05 ? 0 : 50 + 900 * r();
      const a = r() < 0.05 ? 0 : 3 * r();
      const others = r() < 0.05 ? 0 : 10 * r();
      const total = a + Math.max(0, others);
      const before = total > 0 ? fin((Math.max(0, D) * a) / total) : 0;
      expect(demandIn(s, D, a, undefined, others)).toBe(before);
      expect(demandIn(s, D, a, 'capital', others)).toBe(before);
      // Σ attractivité, dans l'ordre des entrées, comme avant.
      const entries = [{ a }, { a: others }, { a: 0.5 * a }];
      let t = 1.5;
      for (const e of entries) t += e.a;
      expect(cityTotals(s, 1.5, entries, false)).toEqual([t]);
    }
  });

  it('continuité : depuis une zone sans ville (facteurs tous à 1), l’évaluation ville par ville redonne la nationale', () => {
    const r = lcg(5);
    for (let i = 0; i < 200; i++) {
      const s = SECTOR_IDS[i % SECTOR_IDS.length];
      const D = 50 + 900 * r();
      const a = 0.1 + 3 * r();
      const others = 0.1 + 10 * r();
      const national = demandIn(s, D, a, undefined, others);
      expect(demandIn(s, D, a, 'mountain', others)).toBeCloseTo(national, 9);
      expect(demandIn(s, D, a, 'capital', others, CITY_IDS.map(() => others))).toBeCloseTo(national, 9);
    }
  });

  it('la demande se partage : produits et importateurs se répartissent toute la demande de chaque ville', () => {
    const s: SectorId = 'yogurts';
    const products = [
      { a: 1, zoneId: 'east' as const },
      { a: 1.3, zoneId: undefined },
      { a: 0.7, zoneId: 'south' as const },
    ];
    const importers = 1.5;
    const D = 450;
    const totals = cityTotals(s, importers, products, true);
    let taken = 0;
    for (const p of products) {
      const others = totals.map((t, k) => t - p.a * proximity(s, p.zoneId ?? 'capital')[CITY_IDS[k]]);
      taken += demandIn(s, D, p.a, p.zoneId, 0, others);
    }
    const w = cityWeights(s);
    const imported = CITY_IDS.reduce((acc, k, i) => acc + (D * w[k] * importers) / totals[i], 0);
    expect(taken + imported).toBeCloseTo(D, 9);
  });
});

describe('marchés régionaux : en partie', () => {
  it('une usine de yaourts à l’est vend surtout à l’est ; ses rivaux de la capitale, moins là-bas', () => {
    const s = yogurtDuo();
    moveTo(s, 'a', 'east');
    resolveTurn(s);
    const pa = companyOf(s, 'a').products[0];
    const pb = companyOf(s, 'b').products[0];
    const w = cityWeights('yogurts');
    for (const p of [pa, pb]) {
      expect(p.lastSalesByCity, p.name).toBeDefined();
      expect(sum(p.lastSalesByCity!)).toBeCloseTo(p.lastSales, 6);
      const line = companyOf(s, p === pa ? 'a' : 'b').reports.at(-1)!.products[0];
      expect(line.byCity).toEqual(p.lastSalesByCity);
    }
    // Part de l'est dans ses ventes : au-dessus du poids de l'est pour l'usine de l'est, en dessous pour la capitale.
    expect(pa.lastSalesByCity!.east / pa.lastSales).toBeGreaterThan(w.east);
    expect(pb.lastSalesByCity!.east / pb.lastSales).toBeLessThan(w.east);
    // Les autres secteurs restent nationaux : pas de ventes par ville.
    for (const c of Object.values(s.companies)) for (const p of c.products) if (p.sectorId !== 'yogurts') expect(p.lastSalesByCity).toBeUndefined();
    // Le secteur redevient national quand l'usine revient à la capitale : les ventes par ville disparaissent.
    moveTo(s, 'a', 'capital');
    resolveTurn(s);
    expect(companyOf(s, 'a').products[0].lastSalesByCity).toBeUndefined();
    expect(companyOf(s, 'b').products[0].lastSalesByCity).toBeUndefined();
    expect(companyOf(s, 'b').reports.at(-1)!.products[0].byCity).toBeUndefined();
  });

  it('la vue : la demande par zone, celle de la zone actuelle étant l’estimation du produit', () => {
    const s = yogurtDuo();
    moveTo(s, 'b', 'east');
    for (const who of ['a', 'b']) {
      const v = getPlayerView(s, who);
      const p = v.companies.find((c) => c.controllerId === who)!.products[0];
      const priv = p.private!;
      const here = p.zoneId ?? 'capital';
      expect(priv.zones.demand![here]).toBe(priv.estimate!.demand);
      // La montagne (pas de ville, loin de tout) vend moins de yaourts que le sud (une ville, son marché).
      expect(priv.zones.demand!.mountain).toBeLessThan(priv.zones.demand!.south);
      // Recalculer l'estimation à la zone de l'usine (comme le client) redonne la même chose.
      expect(estimateSales('yogurts', priv.market!, { ...priv, quality: p.quality, brand: p.brand, price: p.price, capacity: p.capacity }).demand).toBe(priv.estimate!.demand);
    }
    // Alice voit Bob à l'est : ses rivaux ville par ville ; Bob ne voit que des rivaux à la capitale.
    const va = getPlayerView(s, 'a').companies.find((c) => c.controllerId === 'a')!.products[0].private!;
    const vb = getPlayerView(s, 'b').companies.find((c) => c.controllerId === 'b')!.products[0].private!;
    expect(va.market!.othersByCity).toBeDefined();
    expect(va.market!.zoneId).toBeUndefined();
    expect(vb.market!.othersByCity).toBeUndefined();
    expect(vb.market!.zoneId).toBe('east');
    // Le lancement : estimation de la demande par zone, la montagne en dessous du sud pour les yaourts.
    const launch = getPlayerView(s, 'a').sectors.find((x) => x.id === 'yogurts')!.launchByZone!;
    expect(launch.mountain.demand).toBeLessThan(launch.south.demand);
  });

  it('confidentialité : le prix du trimestre d’un rival ne change pas ce que l’on voit de lui, ville par ville', () => {
    const s = yogurtDuo();
    moveTo(s, 'b', 'east');
    const before = getPlayerView(s, 'a').companies.find((c) => c.controllerId === 'a')!.products[0].private!.market!.othersByCity;
    const cb = companyOf(s, 'b');
    const pb = cb.products[0];
    ok(s, 'b', { type: 'setProductDecisions', companyId: cb.id, productId: pb.id, price: pb.price * 0.7, production: pb.production, marketing: pb.marketing, rnd: pb.rnd });
    const after = getPlayerView(s, 'a').companies.find((c) => c.controllerId === 'a')!.products[0].private!.market!.othersByCity;
    expect(after).toEqual(before);
    // Les demandes par zone d'un produit restent privées.
    const bobSeenByAlice = getPlayerView(s, 'a').companies.find((c) => c.id === cb.id)!.products[0];
    expect(bobSeenByAlice.private).toBeUndefined();
  });

  it('bots : la valeur d’une zone tient compte de la demande, et le mode « capitale » ne déménage rien', () => {
    const s = yogurtDuo();
    const c = companyOf(s, 'a');
    const { value, capitalCogs } = zoneValues(s, c, c.products[0], 'a');
    expect(capitalCogs).toBeGreaterThan(0);
    for (const z of ZONE_IDS) expect(Number.isFinite(value[z])).toBe(true);
    // Les yaourts se vendent mal depuis la montagne : la zone y vaut moins qu'au sud.
    expect(value.mountain).toBeLessThan(value.south);

    setBotZoneMode('capital');
    const pinned = createGame(config(4, 6), bots(5));
    while (pinned.phase === 'playing') resolveTurn(pinned);
    for (const co of Object.values(pinned.companies)) for (const p of co.products) expect(away(p.zoneId), p.name).toBe(false);
  });
});
