import { describe, expect, it } from 'vitest';
import { createGame, getPlayerView, hexReservePrice } from '@muchomoney/core';
import { hexBidPayback, hexBidVerdict, hexPaybackAtPrice } from '../src/screens/game/hexPayback';

describe('hexPaybackAtPrice', () => {
  it('pays back the move cost plus the price at the delta gain', () => {
    expect(hexPaybackAtPrice('move', 200, 19, 100)).toBe(16); // ceil(300 / 19)
    expect(hexPaybackAtPrice('move', 0, 19, 100)).toBe(6); // ceil(100 / 19)
  });

  it('pays back only the land price for a start-up, ignoring any cost', () => {
    expect(hexPaybackAtPrice('startup', 500, 40, 0)).toBe(13); // ceil(500 / 40) = 12.5
    expect(hexPaybackAtPrice('startup', 500, 40, 9999)).toBe(13);
  });

  it('adds the launch waiting quarter on top of the full investment', () => {
    expect(hexPaybackAtPrice('launch', 200, 50, 800)).toBe(21); // 1 + ceil(1000 / 50)
    expect(hexPaybackAtPrice('launch', 10, 50, 0)).toBe(2); // 1 + max(1, ceil(10 / 50))
    expect(hexPaybackAtPrice('launch', 0, 50, 0)).toBe(2); // 1 + max(1, 0)
  });

  it('returns null without a positive gain for every kind', () => {
    for (const kind of ['move', 'startup', 'launch'] as const) {
      expect(hexPaybackAtPrice(kind, 200, null, 100), `${kind} null gain`).toBeNull();
      expect(hexPaybackAtPrice(kind, 200, 0, 100), `${kind} zero gain`).toBeNull();
      expect(hexPaybackAtPrice(kind, 200, -5, 100), `${kind} negative gain`).toBeNull();
    }
  });
});

describe('hexBidPayback', () => {
  it('ignores bids that do not beat the reserve, including NaN', () => {
    expect(hexBidPayback('startup', 500, 400, 40, 0)).toEqual({ atReserve: 13, atBid: null });
    expect(hexBidPayback('startup', 500, 500, 40, 0)).toEqual({ atReserve: 13, atBid: null });
    expect(hexBidPayback('startup', 500, Number.NaN, 40, 0)).toEqual({ atReserve: 13, atBid: null });
    expect(hexBidPayback('startup', 500, Number.POSITIVE_INFINITY, 40, 0)).toEqual({ atReserve: 13, atBid: null });
  });

  it('prices bids above the reserve for each kind', () => {
    expect(hexBidPayback('move', 200, 450, 19, 100)).toEqual({ atReserve: 16, atBid: 29 }); // ceil(550 / 19)
    expect(hexBidPayback('startup', 500, 900, 40, 0)).toEqual({ atReserve: 13, atBid: 23 }); // ceil(900 / 40) = 22.5
    expect(hexBidPayback('launch', 200, 600, 50, 800)).toEqual({ atReserve: 21, atBid: 29 }); // 1 + ceil(1400 / 50)
  });

  it('never pays back faster at a higher bid', () => {
    for (const kind of ['move', 'startup', 'launch'] as const) {
      const payback = hexBidPayback(kind, 200, 600, 40, 100)!;
      expect(payback).not.toBeNull();
      expect(payback.atBid!).toBeGreaterThanOrEqual(payback.atReserve);
    }
  });

  it('returns null without a positive gain', () => {
    for (const kind of ['move', 'startup', 'launch'] as const) {
      expect(hexBidPayback(kind, 200, 600, null, 100), `${kind} null gain`).toBeNull();
      expect(hexBidPayback(kind, 200, 600, 0, 100), `${kind} zero gain`).toBeNull();
    }
  });
});

describe('hexBidVerdict', () => {
  it('is ok when even the full bid pays back in time, including the exact boundary', () => {
    expect(hexBidVerdict({ atReserve: 3, atBid: 5 }, 5)).toEqual({ state: 'ok', atReserve: 3, atBid: 5 });
    expect(hexBidVerdict({ atReserve: 3, atBid: 4 }, 6)).toEqual({ state: 'ok', atReserve: 3, atBid: 4 });
  });

  it('is ok at the reserve when no bid beats it, including the exact boundary', () => {
    expect(hexBidVerdict({ atReserve: 4, atBid: null }, 4)).toEqual({ state: 'ok', atReserve: 4, atBid: null });
    expect(hexBidVerdict({ atReserve: 2, atBid: null }, 5)).toEqual({ state: 'ok', atReserve: 2, atBid: null });
  });

  it('is risky when only the reserve pays back in time', () => {
    expect(hexBidVerdict({ atReserve: 3, atBid: 7 }, 5)).toEqual({ state: 'risky', atReserve: 3, atBid: 7 });
    expect(hexBidVerdict({ atReserve: 5, atBid: 6 }, 5)).toEqual({ state: 'risky', atReserve: 5, atBid: 6 });
  });

  it('is late when even the reserve cannot pay back in time', () => {
    expect(hexBidVerdict({ atReserve: 9, atBid: 12 }, 5)).toEqual({ state: 'late', atReserve: 9, atBid: 12 });
    expect(hexBidVerdict({ atReserve: 6, atBid: null }, 5)).toEqual({ state: 'late', atReserve: 6, atBid: null });
  });

  it('is none without a payback', () => {
    expect(hexBidVerdict(null, 5)).toEqual({ state: 'none', atReserve: null, atBid: null });
  });
});

describe('hexPaybackAtPrice against the engine launch estimates', () => {
  it('reproduces estimate.paybackQuarters for every candidate cell', () => {
    const game = createGame(
      { seed: 71, totalTurns: 8, turnSeconds: 90, startYear: 2027, mapMode: 'hex', terrainAssignment: 'fair', lang: 'fr' },
      [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Holding', sectorId: 'gadgets', connected: true, color: '#123456' }],
    );
    const view = getPlayerView(game, 'human');
    let count = 0, sectors = 0;
    for (const sector of view.sectors) {
      const entries = Object.entries(sector.launchByHex ?? {}).filter(([id]) => view.hexes!.free.includes(id));
      if (entries.length === 0) continue;
      sectors += 1;
      for (const [hexId, estimate] of entries) {
        const reserve = view.hexes!.reserve[hexId];
        expect(reserve, hexId).toBe(hexReservePrice(hexId));
        expect(hexPaybackAtPrice('launch', reserve, estimate.quarterlyProfit, sector.launchCost), `${sector.id} ${hexId}`)
          .toBe(estimate.paybackQuarters);
        count += 1;
      }
    }
    expect(sectors).toBeGreaterThanOrEqual(2);
    expect(count).toBeGreaterThanOrEqual(20);
  });
});
