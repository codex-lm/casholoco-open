import { describe, expect, it } from 'vitest';
import { ZONE_IDS, type ProductView, type ZoneId } from '@muchomoney/core';
import { saleableLots, zoneRows, type ZoneRow } from '../src/screens/game/zoneChoice';

// Produit minimal en forme de ProductView : seuls les champs lus par zoneRows comptent.
function product(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: 'p1',
    name: 'Produit Test',
    sectorId: 'yogurts',
    quality: 1,
    brand: 1,
    capacity: 100,
    price: 10,
    lastSales: 0,
    lastRevenue: 0,
    lastMarketShare: 0,
    launchedTurn: 1,
    ...overrides,
  } as ProductView;
}

type Zones = NonNullable<NonNullable<ProductView['private']>['zones']>;

function zones(overrides: Partial<Zones> = {}): Zones {
  const unitCost = Object.fromEntries(ZONE_IDS.map((z, i) => [z, 4 + i])) as Record<ZoneId, number>;
  return { unitCost, moveCost: 0, ...overrides };
}

function priv(z: Zones | undefined, stock = 0): ProductView['private'] {
  return {
    pendingCapacity: 0,
    stock,
    production: 0,
    marketing: 0,
    rnd: 0,
    lastProduced: 0,
    lastUnitCost: 4,
    estimatedUnitCost: 4,
    estimatedTransport: 0,
    zones: z!,
  } as ProductView['private'];
}

const byZone = (rows: ZoneRow[]) => Object.fromEntries(rows.map((r) => [r.zoneId, r])) as Record<ZoneId, ZoneRow>;

describe('zoneRows', () => {
  it('renvoie null sans données privées ou sans zones', () => {
    expect(zoneRows(product())).toBeNull();
    expect(zoneRows(product({ private: priv(undefined) }))).toBeNull();
  });

  it('liste les zones dans l’ordre de ZONE_IDS, avec la capitale courante par défaut', () => {
    const rows = zoneRows(product({ private: priv(zones()) }))!;
    expect(rows.map((r) => r.zoneId)).toEqual(ZONE_IDS);
    expect(rows.filter((r) => r.isCurrent).map((r) => r.zoneId)).toEqual(['capital']);
  });

  it('marque la zone courante quand zoneId est explicite', () => {
    const rows = zoneRows(product({ zoneId: 'plain', private: priv(zones()) }))!;
    expect(rows.filter((r) => r.isCurrent).map((r) => r.zoneId)).toEqual(['plain']);
    expect(rows.filter((r) => r.isCurrent)).toHaveLength(1);
  });

  it('calcule la marge (prix − coût) × min(demande, capacité + stock), demande limitante', () => {
    const z = zones({ demand: Object.fromEntries(ZONE_IDS.map((x) => [x, 50])) as Record<ZoneId, number> });
    const rows = byZone(zoneRows(product({ private: priv(z, 30) }))!);
    // (10 − 4) × min(50, 100 + 30) = 6 × 50
    expect(rows.capital.margin).toBe(300);
    expect(rows.capital.demand).toBe(50);
  });

  it('calcule la marge avec capacité + stock limitante', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((x) => [x, 500])) as Record<ZoneId, number>;
    const z = zones({ demand });
    const rows = byZone(zoneRows(product({ capacity: 10, private: priv(z, 5) }))!);
    // (10 − 4) × min(500, 10 + 5) = 6 × 15
    expect(rows.capital.margin).toBe(90);
  });

  it('compte la capacité en chantier « en régime » au trimestre du lancement (0 lot vendable)', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((z) => [z, 40])) as Record<ZoneId, number>;
    const unitCost = { capital: 5, north: 4, north_east: 5, east: 6, south: 3, plain: 5, mountain: 5 };
    const pending = priv(zones({ demand, unitCost }))!;
    pending.pendingCapacity = 21;
    const p = product({ capacity: 0, private: pending });
    // Ce trimestre, rien n'est vendable : la capacité en chantier n'est livrée qu'après la production.
    expect(saleableLots(p)).toBe(0);
    const rows = byZone(zoneRows(p, 11)!);
    expect(rows.capital.margin).toBe(105);
    expect(rows.south.margin).toBe(147);
    expect(rows.south.marginDiff).toBe(42);
    expect(rows.south.isBest).toBe(true);
    expect(rows.south.steadyState).toBe(true);
    expect(Object.values(rows).every((r) => r.steadyState)).toBe(true);
  });

  it('sans trimestre après cette clôture : pas de repli « en régime », aucune marge ni retour sur investissement', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((z) => [z, 40])) as Record<ZoneId, number>;
    const unitCost = { capital: 5, north: 4, north_east: 5, east: 6, south: 3, plain: 5, mountain: 5 };
    const pending = priv(zones({ demand, unitCost, moveCost: 100 }))!;
    pending.pendingCapacity = 21;
    const p = product({ capacity: 0, private: pending });
    const rows = byZone(zoneRows(p, 0)!);
    // Dernier trimestre : le chantier ne produira jamais, la fiche ne doit pas le compter.
    expect(Object.values(rows).every((r) => r.margin === 0)).toBe(true);
    expect(Object.values(rows).every((r) => r.marginDiff === 0)).toBe(true);
    expect(Object.values(rows).every((r) => r.paybackQuarters === null)).toBe(true);
    expect(Object.values(rows).every((r) => !r.steadyState)).toBe(true);
    // Meilleure zone : coût le plus bas, faute de lots.
    expect(rows.south.isBest).toBe(true);
  });

  it('ne compte dans le retour sur investissement que les trimestres où les lots existent', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((z) => [z, 40])) as Record<ZoneId, number>;
    const unitCost = { capital: 5, north: 4, north_east: 5, east: 6, south: 3, plain: 5, mountain: 5 };
    const pending = priv(zones({ demand, unitCost, moveCost: 100 }))!;
    pending.pendingCapacity = 21;
    const rows = byZone(zoneRows(product({ capacity: 0, private: pending }), 11)!);
    // Écart de marge « en régime » : 42/trim., soit 3 trimestres, plus ce trimestre sans lots.
    expect(rows.south.paybackQuarters).toBe(1 + Math.ceil(100 / 42));
  });

  it('uses the lowest cost as the best zone when no lots are saleable', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((z) => [z, 40])) as Record<ZoneId, number>;
    const unitCost = { capital: 5, north: 4, north_east: 5, east: 6, south: 3, plain: 5, mountain: 5 };
    const rows = zoneRows(product({ capacity: 0, private: priv(zones({ demand, unitCost })) }))!;
    expect(rows.find((row) => row.isBest)!.zoneId).toBe('south');
    expect(rows.every((row) => row.margin === 0)).toBe(true);
  });

  it('désigne la meilleure zone comme celle à la plus forte marge', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((x) => [x, 50])) as Record<ZoneId, number>;
    demand.mountain = 80;
    const unitCost = Object.fromEntries(ZONE_IDS.map((x) => [x, 4])) as Record<ZoneId, number>;
    const rows = zoneRows(product({ private: priv(zones({ unitCost, demand })) }))!;
    expect(rows.filter((r) => r.isBest)).toHaveLength(1);
    expect(rows.find((r) => r.isBest)!.zoneId).toBe('mountain');
  });

  it('départage les égalités de marge par l’ordre de ZONE_IDS', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((x) => [x, 50])) as Record<ZoneId, number>;
    // Même coût partout : même marge partout, la première zone gagne.
    const unitCost = Object.fromEntries(ZONE_IDS.map((x) => [x, 4])) as Record<ZoneId, number>;
    const rows = zoneRows(product({ private: priv(zones({ unitCost, demand })) }))!;
    expect(rows.find((r) => r.isBest)!.zoneId).toBe(ZONE_IDS[0]);
  });

  it('sans demande : demande, marges et écarts à null, meilleure zone = coût le plus bas', () => {
    const rows = zoneRows(product({ private: priv(zones()) }))!;
    for (const r of rows) {
      expect(r.demand).toBeNull();
      expect(r.margin).toBeNull();
      expect(r.demandDiff).toBeNull();
      expect(r.marginDiff).toBeNull();
      expect(r.paybackQuarters).toBeNull();
    }
    // Coûts croissants dans l’ordre de ZONE_IDS : la première zone est la moins chère.
    expect(rows.filter((r) => r.isBest)).toHaveLength(1);
    expect(rows.find((r) => r.isBest)!.zoneId).toBe(ZONE_IDS[0]);
  });

  it('sans demande : départage du coût le plus bas par l’ordre de ZONE_IDS', () => {
    const unitCost = Object.fromEntries(ZONE_IDS.map((x) => [x, 4])) as Record<ZoneId, number>;
    const rows = zoneRows(product({ private: priv(zones({ unitCost })) }))!;
    expect(rows.find((r) => r.isBest)!.zoneId).toBe(ZONE_IDS[0]);
  });

  it('calcule les écarts de demande et de marge par rapport à la zone courante', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((x) => [x, 50])) as Record<ZoneId, number>;
    demand.plain = 70;
    demand.mountain = 40;
    const unitCost = Object.fromEntries(ZONE_IDS.map((x) => [x, 4])) as Record<ZoneId, number>;
    const rows = byZone(zoneRows(product({ zoneId: 'plain', private: priv(zones({ unitCost, demand })) }))!);
    // Zone courante : plain (demande 70, marge 6 × 70 = 420).
    expect(rows.plain.demandDiff).toBe(0);
    expect(rows.plain.marginDiff).toBe(0);
    expect(rows.capital.demandDiff).toBe(-20);
    expect(rows.capital.marginDiff).toBe(6 * 50 - 6 * 70);
    expect(rows.mountain.demandDiff).toBe(-30);
    expect(rows.mountain.marginDiff).toBe(6 * 40 - 6 * 70);
  });

  it('estime le retour sur investissement : ceil(moveCost / écart de marge)', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((x) => [x, 50])) as Record<ZoneId, number>;
    demand.mountain = 80;
    const unitCost = Object.fromEntries(ZONE_IDS.map((x) => [x, 4])) as Record<ZoneId, number>;
    const z = zones({ unitCost, demand, moveCost: 100 });
    const rows = byZone(zoneRows(product({ private: priv(z) }))!);
    // Écart de marge mountain − capital : 6 × (80 − 50) = 180 → ceil(100 / 180) = 1.
    expect(rows.mountain.paybackQuarters).toBe(1);
    // Avec un coût de déménagement plus élevé : ceil(1000 / 180) = 6.
    const z2 = zones({ unitCost, demand, moveCost: 1000 });
    expect(byZone(zoneRows(product({ private: priv(z2) }))!).mountain.paybackQuarters).toBe(6);
    // Zone courante ou moins rentable : écart <= 0 → null.
    expect(rows.capital.paybackQuarters).toBeNull();
    expect(rows.plain.paybackQuarters).toBeNull();
  });

  it('n’estime aucun retour quand le déménagement est gratuit', () => {
    const demand = Object.fromEntries(ZONE_IDS.map((x) => [x, 50])) as Record<ZoneId, number>;
    demand.mountain = 80;
    const z = zones({ demand, moveCost: 0 });
    const rows = zoneRows(product({ private: priv(z) }))!;
    for (const r of rows) expect(r.paybackQuarters).toBeNull();
  });
});
