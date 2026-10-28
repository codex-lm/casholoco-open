import { describe, expect, it } from 'vitest';
import { createGame, getPlayerView, SECTOR_IDS, portOnlyTransport } from '@muchomoney/core';
import { launchZoneEstimates, selectedLaunchEstimate, type LaunchZone } from '../src/screens/game/launchPickerModel';

describe('launch picker model', () => {
  const view = getPlayerView(createGame({ seed: 7, totalTurns: 12, turnSeconds: 90, startYear: 2027 }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]), 'human');
  const fixture = view.sectors.find((s) => s.id === SECTOR_IDS[0])!.launchByZone!;
  const zones: LaunchZone[] = [
    { id: 'capital', est: { ...fixture.capital, quarterlyProfit: -100, paybackQuarters: null } },
    { id: 'north', est: { ...fixture.north, quarterlyProfit: 150, paybackQuarters: 3 } },
    { id: 'plain', est: { ...fixture.plain, quarterlyProfit: 150, paybackQuarters: 6 } },
  ];

  it('uses the selected estimate and never substitutes the capital for an unknown zone', () => {
    expect(selectedLaunchEstimate(zones, 'plain', fixture.capital)).toEqual(zones[2].est);
    expect(selectedLaunchEstimate(null, 'capital', fixture.capital)).toEqual(fixture.capital);
    expect(selectedLaunchEstimate(null, 'plain', fixture.capital)).toBeUndefined();
  });

  it('includes real capital delivery and transport news in the legacy launch fallback', () => {
    const sector = structuredClone(view.sectors.find((s) => s.id === 'energy_drinks')!);
    delete sector.launchByZone!.capital;
    const factor = 1.7;
    const capital = launchZoneEstimates(sector, view.commodities, factor)!.find((z) => z.id === 'capital')!;
    const materials = Object.entries(sector.inputs).reduce((total, [cid, per]) =>
      total + (per ?? 0) * view.commodities.find((c) => c.id === cid)!.price * 1.1, 0);
    expect(capital.est.unitCost).toBeCloseTo(sector.laborCost + materials + portOnlyTransport(sector.id, 'capital') * factor, 12);
  });
});
