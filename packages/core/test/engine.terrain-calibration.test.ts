import { describe, expect, it } from 'vitest';
import { getContent, terrainLobbyPayload } from '../src';
import { createGame } from '../src/engine';
import { assessTerrains, TERRAIN_CALIBRATION, terrainValues } from '../src/sim/terrainAssignment';
import type { GameConfig, LobbyPlayer, SectorId } from '../src/types';

const SECTORS: SectorId[] = ['energy_drinks', 'gadgets', 'scooters', 'yogurts', 'crypto'];

function hexGame(sector: SectorId) {
  const config: GameConfig = { totalTurns: 16, turnSeconds: 120, startYear: 2027, seed: 7, lang: 'fr', mapMode: 'hex', terrainAssignment: 'fair' };
  const players: LobbyPlayer[] = [
    { id: 'a', name: 'A', isBot: false, companyName: 'A SA', sectorId: sector, connected: true, color: '#000' },
    { id: 'b', name: 'B', isBot: false, companyName: 'B SA', sectorId: 'gadgets', connected: true, color: '#111' },
  ];
  const state = createGame(config, players);
  const company = Object.values(state.companies).find((c) => c.founderId === 'a')!;
  return { state, company, product: company.products[0] };
}

/** Le salon de référence du calage : 8 bots, secteurs tournants. */
function referenceLobby(): LobbyPlayer[] {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, isBot: true, companyName: `C${i}`, sectorId: SECTORS[i % 5], connected: true, color: '#000',
  }));
}

describe('terrain calibration (lot 5)', () => {
  it('adds exactly the measured offsets, and nothing elsewhere', () => {
    for (const sector of SECTORS) {
      const { state, company, product } = hexGame(sector);
      const raw = terrainValues(state, company, product, false);
      const calibrated = terrainValues(state, company, product);
      for (const terrainId of Object.keys(raw)) {
        const offset = TERRAIN_CALIBRATION[terrainId]?.[sector] ?? 0;
        expect(calibrated[terrainId], `${terrainId} × ${sector}`).toBeCloseTo(raw[terrainId] + offset, 6);
      }
    }
  });

  it('only names real terrains and sectors: eight entries, multiples of 5, at most 150', () => {
    const terrainIds = new Set(getContent('fr').terrains.definitions.map((t) => t.id));
    let entries = 0;
    for (const [terrainId, bySector] of Object.entries(TERRAIN_CALIBRATION)) {
      expect(terrainIds.has(terrainId), terrainId).toBe(true);
      for (const [sector, value] of Object.entries(bySector)) {
        expect(SECTORS.includes(sector as SectorId), sector).toBe(true);
        expect(Math.abs(value as number)).toBeLessThanOrEqual(150);
        expect(Math.abs((value as number) % 5)).toBe(0);
        entries++;
      }
    }
    expect(entries).toBe(8);
  });

  it('rates the island very good for crypto in the reference lobby (tax-free seat, intangible crypto) and keeps its calibration', () => {
    const config = { totalTurns: 16, turnSeconds: 120, startYear: 2027, lang: 'fr', mapMode: 'hex', terrainAssignment: 'fair' } as Omit<GameConfig, 'seed'>;
    const payload = terrainLobbyPayload(config, referenceLobby())!;
    const island = payload.find((t) => t.id === 'ile-aux-niches')!;
    expect(TERRAIN_CALIBRATION['ile-aux-niches'].crypto).toBe(-95);
    expect(island.sectors.crypto.appreciation).toBe('very_good');
    expect(island.sectors.crypto.value).toBeGreaterThanOrEqual(100);
  });

  it('is applied in assessTerrains for an in-game company too', () => {
    const { state, company, product } = hexGame('crypto');
    const assessed = assessTerrains(state, company, product);
    const raw = terrainValues(state, company, product, false)['ile-aux-niches'];
    expect(assessed['ile-aux-niches'].value).toBeCloseTo(raw - 95, 6);
  });
});
