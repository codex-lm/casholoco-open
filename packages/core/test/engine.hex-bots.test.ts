import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILDABLE, HEXES } from '../src/content/hexes';
import { SECTORS } from '../src/content';
import { createGame, getPlayerView, resolveTurn } from '../src/engine';
import * as actions from '../src/sim/actions';
import * as advice from '../src/sim/advice';
import { expertLaunchProject, expertTurn, launchHex, launchValueAt } from '../src/sim/botExpert';
import { bestHexCandidate, botHexBid, capitalCandidate, mergePreservesSeatValue, retainedSeatValue } from '../src/sim/botHexes';
import { NEUTRAL_PERSONALITY, runBots, setBotZoneMode } from '../src/sim/bots';
import * as hexes from '../src/sim/hexes';
import { hexReservePrice } from '../src/sim/hexAuctions';
import * as rng from '../src/sim/rng';
import { buildPlayerView } from '../src/sim/view';
import { ZONE_IDS, type Action, type ExpertMemory, type GameState } from '../src/types';
import { bots, companyOf, config, human } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
  setBotZoneMode('market');
});

function assertFinite(value: unknown, path = 'state'): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), path).toBe(true);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) assertFinite(child, path + '.' + key);
  }
}

function assertBoard(state: GameState): void {
  const products = Object.values(state.companies).filter((c) => c.status === 'active').flatMap((c) => c.products);
  const positions = products.filter((p) => !p.incubator).map((p) => p.hexId);
  expect(new Set(positions).size).toBe(positions.length);
  const occupiedPositions = products.filter((p) => !p.incubator).flatMap((p) => p.pendingHexId ? [p.hexId, p.pendingHexId] : [p.hexId]);
  expect(new Set(occupiedPositions).size).toBe(occupiedPositions.length);
  for (const id of positions) expect(BUILDABLE.includes(id!)).toBe(true);
  for (const player of Object.values(state.players)) {
    const view = getPlayerView(state, player.id);
    expect(Object.keys(view.hexes!.occupied)).toHaveLength(occupiedPositions.length);
    expect(view.hexes!.free).toHaveLength(BUILDABLE.length - occupiedPositions.length);
    for (const id of view.hexes!.free) expect(view.hexes!.occupied[id]).toBeUndefined();
    for (const c of view.companies) for (const p of c.products) {
      if (!p.private?.hexes) continue;
      const expected = HEXES.map((hex) => hex.id);
      expect(Object.keys(p.private.hexes.unitCost)).toEqual(expected);
      if (p.private.hexes.demand) expect(Object.keys(p.private.hexes.demand)).toEqual(expected);
      if (p.hexId) expect(p.private.hexes.unitCost[p.hexId]).toBeTypeOf('number');
      else expect(p.incubator).toBe(true);
    }
  }
  assertFinite(state);
}

describe('hex board bots', () => {
  for (const botLevel of ['normal', 'expert'] as const) {
    it(botLevel + ': three complete short games preserve finite numbers and exclusive occupancy', () => {
      const launches: { provided?: string; knownFree: boolean; affordable: boolean; bid?: number; fallback?: string; created: number; project: boolean; ok: boolean }[] = [];
      const realAction = actions.runAction;
      vi.spyOn(actions, 'runAction').mockImplementation((state, who, action) => {
        if (action.type !== 'launchProduct') return realAction(state, who, action);
        const company = state.companies[action.companyId];
        const before = new Set(company.products.map((p) => p.id));
        const view = botLevel === 'expert' ? buildPlayerView(state, who!, { hexEstimates: 'candidates' }) : undefined;
        const used = new Set(view?.self?.hexBids?.filter((bid) => bid.turn === state.turn && !bid.result).map((bid) => bid.hexId));
        const knownFree = !view || !!action.hexId && view.hexes!.free.includes(action.hexId)
          && !!view.sectors.find((s) => s.id === action.sectorId)!.launchByHex?.[action.hexId] && !used.has(action.hexId);
        const affordable = company.cash >= SECTORS[action.sectorId].launchCost + (action.bid ?? 0);
        const result = realAction(state, who, action);
        launches.push({ provided: action.hexId, knownFree, affordable, bid: action.bid, fallback: action.fallback,
          created: company.products.filter((p) => !before.has(p.id)).length,
          project: !!state.hexBids?.some((b) => b.companyId === company.id && b.kind === 'launch' && b.project?.name === action.name && !b.result), ok: result.ok });
        return result;
      });
      for (const seed of [1, 2, 3]) {
        const state = createGame({ ...config(seed, 8), mapMode: 'hex', botLevel }, bots(4 + seed % 3));
        assertBoard(state);
        while (state.phase === 'playing') {
          resolveTurn(state);
          assertBoard(state);
        }
        expect(state.phase).toBe('finished');
      }
      if (botLevel === 'normal') {
        // A crowded short game need not justify another launch. This funded
        // single-bot opportunity leaves genuine demand and time for payback,
        // while preserving the live sector definitions and ordinary NPCs. The
        // witness stays off the island: its perks (scandal, perceived price)
        // would otherwise steer the launch gate as their calibration evolves.
        const state = createGame({ ...config(1, 16), mapMode: 'hex', botLevel, terrainAssignment: 'host', terrains: { bot1: 'quai-port-dividende' } }, bots(1));
        companyOf(state, 'bot1').cash = 20_000;
        state.activeEffects = [{ id: 'launch-demand', newsId: 'test', kind: 'sectorDemand', sectorId: 'all', value: 2, turnsLeft: 4 }];
        while (state.phase === 'playing') {
          resolveTurn(state);
          assertBoard(state);
        }
        expect(state.phase).toBe('finished');
      }
      expect(launches.some((launch) => launch.ok)).toBe(true);
      for (const launch of launches) {
        expect(launch.provided).toBeTypeOf('string');
        if (botLevel === 'expert') expect(launch.knownFree).toBe(true);
        expect(launch.affordable).toBe(true);
        expect(launch.bid).toBeGreaterThanOrEqual(hexReservePrice(launch.provided!));
        expect(['nearest', 'abandon']).toContain(launch.fallback);
        if (launch.ok) { expect(launch.created).toBe(0); expect(launch.project).toBe(true); }
      }
    }, 60_000);
  }

  it('the capital candidate respects board-order ties and can keep its own occupied cell', () => {
    expect(capitalCandidate(['B11', 'B9', 'C3'])).toBe('B9');
    expect(capitalCandidate(['B11', 'B9', 'A10'])).toBe('A10');
    expect(capitalCandidate([])).toBeUndefined();
    const candidates = ['C3', 'A10', 'K8'];
    expect(bestHexCandidate(candidates, { C3: 100.999, A10: 100, K8: 100.5 }, 'A10', 100)).toBe('A10');
    expect(bestHexCandidate(candidates, { C3: 101, A10: 100, K8: 100.5 }, 'A10', 100)).toBe('C3');
    expect(bestHexCandidate(candidates, { C3: 101, A10: 100, K8: 102 }, 'A10', 100)).toBe('K8');
    expect(bestHexCandidate(candidates, { C3: 100, A10: 100, K8: 100.5 }, 'A10', 100, 'K8')).toBe('K8');
    expect(bestHexCandidate(candidates, { C3: 101.499, A10: 100, K8: 100.5 }, 'A10', 100, 'K8')).toBe('K8');
    expect(bestHexCandidate(candidates, { C3: 101.5, A10: 100, K8: 100.5 }, 'A10', 100, 'K8')).toBe('C3');
  });

  it('operating expert launches choose the exact best public horizon among free, unbid sites', () => {
    const state = createGame({ ...config(17), mapMode: 'hex' }, [human('a')]);
    const company = companyOf(state, 'a');
    company.cash = 100_000;
    const available = getPlayerView(state, 'a').hexes!.free.slice(0, 3);
    expect(available).toHaveLength(3);
    expect(actions.runAction(state, 'a', { type: 'moveFactory', companyId: company.id,
      productId: company.products[0].id, hexId: available[0], bid: hexReservePrice(available[0]) }).ok).toBe(true);
    const view = getPlayerView(state, 'a');
    view.hexes!.free = available;
    const visible = view.companies.find((c) => c.id === company.id)!;
    const values = available.slice(1).map((hexId) => ({ hexId,
      value: launchValueAt(view, visible, 'crypto', () => 1, 1, hexId) }));
    const expected = values.reduce((best, next) => next.value > best.value + 1e-9 ? next : best);
    const before = JSON.stringify(view);
    expect(expertLaunchProject(view, visible, 'crypto', () => 1, 1)).toMatchObject(expected);
    expect(JSON.stringify(view)).toBe(before);
  });

  it('bid sizing stays within cash and value, with cautious personalities close to the reserve', () => {
    const cautious = { ...NEUTRAL_PERSONALITY, aggressiveness: 0 };
    const aggressive = { ...NEUTRAL_PERSONALITY, aggressiveness: 1 };
    expect(botHexBid(cautious, 400, 10_000, 20_000)).toBe(544);
    expect(botHexBid(aggressive, 400, 10_000, 20_000)).toBe(1696);
    expect(botHexBid(aggressive, 400, 10_000, 450)).toBe(450);
    expect(botHexBid(aggressive, 400, 399, 20_000)).toBeUndefined();
    expect(botHexBid(aggressive, 400, 10_000, 399)).toBeUndefined();
  });

  it('expert startup placements value the first-quarter forecast minus land and ignore unavailable or already bid cells', () => {
    const state = createGame({ ...config(1), mapMode: 'hex' }, [human('a')]);
    const view = getPlayerView(state, 'a');
    const sector = view.sectors.find((s) => s.id === 'gadgets')!;
    view.hexes!.free = ['C3', 'B9', 'K8'];
    sector.launchByHex = {
      C3: { unitCost: 100, demand: 200, quarterlyProfit: 1000, paybackQuarters: 2 },
      B9: { unitCost: 10, demand: 300, quarterlyProfit: 1000, paybackQuarters: 2 },
      K8: { unitCost: 1, demand: 1, quarterlyProfit: 1000, paybackQuarters: 2 },
      A10: { unitCost: 0, demand: 1000, quarterlyProfit: 10000, paybackQuarters: 1 },
    };
    expect(launchHex(view, 'gadgets')).toBe('K8');
    sector.launchByHex.C3.quarterlyProfit = 1020;
    expect(launchHex(view, 'gadgets')).toBe('C3');
    sector.launchByHex.K8.quarterlyProfit = 1021;
    expect(launchHex(view, 'gadgets')).toBe('K8');
    view.self!.hexBids = [{ kind: 'move', companyId: 'other-controlled-company', playerId: 'a', productId: 'other', hexId: 'K8', amount: 400, turn: view.turn }];
    expect(launchHex(view, 'gadgets')).toBe('C3');
    setBotZoneMode('capital');
    expect(launchHex(view, 'gadgets')).toBe('B9');
    view.hexes!.free = [];
    expect(launchHex(view, 'gadgets')).toBeUndefined();
  });

  for (const scenario of [
    { name: 'a sub-threshold gain keeps the current province', current: 100.5, other: 100.999, expected: 'K8' },
    { name: 'a small quarterly gain cannot repay land and moving costs', current: 100.5, other: 101.9, expected: 'K8' },
    { name: 'an after-tax gain pays for land and moving costs over the remaining quarters', current: 1000, other: 1200, expected: 'C3' },
    { name: 'the current province remains when it has the best qualifying value', current: 102, other: 101, expected: 'K8' },
  ]) {
    it('normal relocation: ' + scenario.name, () => {
      const state = createGame({ ...config(1), mapMode: 'hex', botLevel: 'normal' }, [human('a')]);
      const company = companyOf(state, 'a');
      const product = company.products[0];
      // Évaluer le seuil de position sur une usine ordinaire, sans avantage de terrain de départ.
      delete product.terrainId;
      delete company.terrainId;
      product.hexId = 'K8';
      state.players.a.isBot = true;
      const values = vi.spyOn(advice, 'hexValues').mockImplementation((_state, _company, _product, _viewer, candidates) => ({
        value: Object.fromEntries(candidates.map((id) => [id, id === 'A10' ? 100 : id === 'K8' ? scenario.current : id === 'C3' ? scenario.other : 0])),
        capitalCogs: 100,
      }));
      const realAction = actions.runAction;
      const actionSpy = vi.spyOn(actions, 'runAction').mockImplementation((s, who, action) => action.type === 'moveFactory'
        ? realAction(s, who, action) : { ok: false, message: 'Test: seule la position est évaluée.' });
      runBots(state);
      expect(values).toHaveBeenCalled();
      expect(product.hexId).toBe('K8');
      expect(product.pendingHexId).toBeUndefined();
      expect(state.hexBids?.find((b) => b.productId === product.id)?.hexId).toBe(scenario.expected === 'K8' ? undefined : scenario.expected);
      const moves = actionSpy.mock.calls.filter(([, , action]) => action.type === 'moveFactory');
      expect(moves).toHaveLength(scenario.expected === 'K8' ? 0 : 1);
      expect(values.mock.calls[0][5]).toBe('A10');
      state.players.a.isBot = false;
      resolveTurn(state);
      expect(product.hexId).toBe(scenario.expected);
      expect(product.pendingHexId).toBeUndefined();
    });
  }

  it('valorise le siège sur une marge récurrente, sans frais exceptionnels ni constitution de stock', () => {
    const state = createGame({ ...config(4), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'monts-defiscalises' } }, [human('a', 'scooters')]);
    const company = companyOf(state, 'a');
    const product = company.products[0];
    const value = retainedSeatValue(state, company, product, 5000);
    expect(value).toBeGreaterThan(400);
    company.turnFlags.specialCharges = 100_000;
    product.production = 0;
    product.stock = 1000;
    company.modifiers.push({ kind: 'tax_optimisation', turnsLeft: 1 });
    expect(retainedSeatValue(state, company, product, 5000)).toBe(value);
  });

  it('refuse la fusion lorsque les privilèges fiscaux perdus valent plus que le siège économisé', () => {
    const state = createGame({ ...config(4), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'monts-defiscalises', b: 'quai-port-dividende' } }, [human('a', 'scooters'), human('b')]);
    const absorber = companyOf(state, 'a');
    const target = companyOf(state, 'b');
    vi.spyOn(advice, 'hexValues').mockImplementation((_state, _company, _product, _viewer, candidates) => ({
      value: Object.fromEntries(candidates.map((id) => [id, 10_000])), capitalCogs: 100,
    }));
    expect(mergePreservesSeatValue(state, absorber, target)).toBe(false);
    delete absorber.terrainId;
    expect(mergePreservesSeatValue(state, absorber, target)).toBe(true);
  });

  for (const botLevel of ['normal', 'expert'] as const) {
    it(botLevel + ': conserve une entreprise au siège fiscal précieux après une conquête', () => {
      const state = createGame({ ...config(4), botLevel, mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'monts-defiscalises', b: 'quai-port-dividende' } }, [human('a', 'scooters'), human('b')]);
      const absorber = companyOf(state, 'a');
      const target = companyOf(state, 'b');
      state.players.a.isBot = true;
      target.controllerId = 'a';
      for (const company of [absorber, target]) {
        company.holdings = { a: company.sharesOutstanding };
        company.profitEma = 10_000;
      }
      vi.spyOn(advice, 'hexValues').mockImplementation((_state, _company, _product, _viewer, candidates) => ({
        value: Object.fromEntries(candidates.map((id) => [id, 10_000])), capitalCogs: 100,
      }));
      const actionsSeen: string[] = [];
      vi.spyOn(rng, 'chance').mockReturnValue(true);
      vi.spyOn(actions, 'runAction').mockImplementation((_state, _who, action) => {
        actionsSeen.push(action.type);
        return { ok: false, message: 'Test : observer les décisions sans les exécuter.' };
      });
      runBots(state);
      expect(actionsSeen).not.toContain('merge');
      expect(absorber.terrainId).toBe('monts-defiscalises');
    });
  }

  it('l’expert adapte budgets et capacité à la fin des avantages temporaires', () => {
    const state = createGame({ ...config(1), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'portes-petit-rabais' } }, [human('a', 'gadgets')]);
    const company = companyOf(state, 'a');
    state.turn = 7;
    // Keep the plant near the expansion threshold and use an explicit R&D
    // handicap: fast gadget obsolescence makes its known expiry consequential.
    company.cash = 100_000;
    Object.assign(company.products[0], { capacity: 30, production: 30, quality: 1, brand: 1 });
    state.activeEffects = [{ id: 'local', newsId: 'local', kind: 'terrain', terrain: company.terrainId, lever: 'rnd', value: 0.1, turnsLeft: 2 }];
    const original = getPlayerView(state, 'a');
    const collect = (freeze: boolean): Action[] => {
      const view = structuredClone(original);
      const product = view.companies.find((c) => c.id === company.id)!.products[0];
      // Contrefactuel : conserver indéfiniment les coûts et le frein R&D du T7.
      if (freeze) product.private!.terrainProjection = product.private!.terrainProjection!.map(() => product.private!.terrainProjection![0]);
      const decisions: Action[] = [];
      const memory: ExpertMemory = { calib: {} };
      expertTurn({ view: () => view, memory: () => memory, productName: () => 'Test', startupName: () => 'Test',
        act: (action) => { decisions.push(action); return { ok: false, message: 'Test : observer les décisions.' }; } }, NEUTRAL_PERSONALITY);
      return decisions;
    };
    const expiring = collect(false);
    const frozen = collect(true);
    const budget = (list: Action[]) => list.find((a): a is Extract<Action, { type: 'setProductDecisions' }> => a.type === 'setProductDecisions')!;
    const capacity = (list: Action[]) => list.find((a): a is Extract<Action, { type: 'expandCapacity' }> => a.type === 'expandCapacity');
    expect(budget(expiring).rnd).toBeGreaterThan(budget(frozen).rnd!);
    expect(capacity(expiring)!.lots).toBeGreaterThan(capacity(frozen)?.lots ?? 0);
  });

  it('l’expert projette les clients de la destination d’un déménagement réservé', () => {
    const state = createGame({ ...config(1), mapMode: 'hex', terrainAssignment: 'host', terrains: { a: 'portes-petit-rabais' } }, [human('a', 'yogurts')]);
    const company = companyOf(state, 'a');
    state.turn = 7;
    state.activeEffects = [{ id: 'local', newsId: 'local', kind: 'terrain', terrain: company.terrainId, lever: 'marketing', value: 0.75, turnsLeft: 2 }];
    company.cash = 100_000;
    // D'une case sans bonus « fabriqué ici » (A8) vers la ville de l'est (K11) : les yaourts y gagnent leur bonus local.
    // Le fret réel réduit la marge ; 32 lots gardent un besoin d'extension discriminant (12 contre 9).
    Object.assign(company.products[0], { capacity: 32, production: 32, quality: 1, brand: 1, hexId: 'A8', pendingHexId: 'K11' });
    const original = getPlayerView(state, 'a');
    const collect = (freezePosition: boolean): Action[] => {
      const view = structuredClone(original);
      const product = view.companies.find((c) => c.id === company.id)!.products[0];
      expect(product.private!.terrainProjection!.slice(0, 2).map((p) => p.hexId)).toEqual(['A8', 'K11']);
      // Isoler le bonus local : conserver les coûts et expirations projetés, figer seulement la position.
      if (freezePosition) product.private!.terrainProjection = product.private!.terrainProjection!.map((p) => ({ ...p, hexId: product.hexId }));
      const decisions: Action[] = [];
      const memory: ExpertMemory = { calib: {} };
      expertTurn({ view: () => view, memory: () => memory, productName: () => 'Test', startupName: () => 'Test',
        act: (action) => { decisions.push(action); return { ok: false, message: 'Test : observer les décisions.' }; } }, NEUTRAL_PERSONALITY);
      return decisions;
    };
    const moving = collect(false);
    const frozen = collect(true);
    const expansion = moving.find((a): a is Extract<Action, { type: 'expandCapacity' }> => a.type === 'expandCapacity')!;
    expect(expansion.lots).toBeGreaterThan(0);
    const frozenExpansion = frozen.find((a): a is Extract<Action, { type: 'expandCapacity' }> => a.type === 'expandCapacity');
    expect(expansion.lots).toBeGreaterThan(frozenExpansion?.lots ?? 0);
    expect(company.products[0].hexId).toBe('A8');
  });

  it('one expert view shares its free candidates across sectors and adds each product current cell', () => {
    const state = createGame({ ...config(1), mapMode: 'hex' }, [human('a')]);
    const company = companyOf(state, 'a');
    company.products.push({ ...company.products[0], id: 'second-product', hexId: hexes.nearestFreeHex(state)! });
    const expected = hexes.candidateHexes(state);
    for (const zone of ZONE_IDS) {
      const available = hexes.freeBuildableHexes(state).filter((id) => hexes.basin(id) === zone);
      expect(expected.filter((id) => hexes.basin(id) === zone)).toHaveLength(Math.min(10, available.length));
    }
    const candidates = vi.spyOn(hexes, 'candidateHexes');
    const view = buildPlayerView(state, 'a', { hexEstimates: 'candidates' });
    expect(candidates).toHaveBeenCalledTimes(1);
    for (const sector of view.sectors) expect(Object.keys(sector.launchByHex!)).toEqual(expected);
    for (const product of view.companies.find((c) => c.id === company.id)!.products) {
      expect(Object.keys(product.private!.hexes!.unitCost)).toEqual([...new Set([...expected, product.hexId!])]);
    }
  });

  for (const botLevel of ['normal', 'expert'] as const) {
    it(botLevel + ': pinned games never relocate and bid launches on the nearest available capital cell', () => {
      setBotZoneMode('capital');
      const launches: { kind: string; hexId?: string; bid?: number; zoneId?: string; expected?: string; actual: (string | undefined)[]; ok: boolean }[] = [];
      let moves = 0;
      const realAction = actions.runAction;
      vi.spyOn(actions, 'runAction').mockImplementation((state, who, action) => {
        if (action.type === 'moveFactory') moves++;
        if (action.type !== 'launchProduct' && action.type !== 'foundStartup') return realAction(state, who, action);
        const used = new Set((state.hexBids ?? []).filter((b) => b.playerId === who && !b.result).map((b) => b.hexId));
        const expected = capitalCandidate(hexes.candidateHexes(state).filter((id) => !used.has(id)));
        const before = new Set(Object.values(state.companies).flatMap((c) => c.products.map((p) => p.id)));
        const result = realAction(state, who, action);
        launches.push({
          kind: action.type, expected, ok: result.ok,
          hexId: action.hexId, bid: action.bid,
          zoneId: action.type === 'launchProduct' ? action.zoneId : undefined,
          actual: Object.values(state.companies).flatMap((c) => c.products).filter((p) => !before.has(p.id)).map((p) => p.hexId),
        });
        return result;
      });
      for (const seed of [1, 2, 3, ...(botLevel === 'normal' ? [4] : [])]) {
        // Retain the ordinary crowded games and add a real funded opportunity
        // so nearest-capital launch assertions cannot pass without a launch.
        const launchWitness = seed === 4;
        const state = createGame({ ...config(launchWitness ? 1 : seed, launchWitness ? 16 : 12), mapMode: 'hex', botLevel }, bots(launchWitness ? 1 : 5));
        if (launchWitness) {
          companyOf(state, 'bot1').cash = 20_000;
          state.activeEffects = [{ id: 'launch-demand', newsId: 'test', kind: 'sectorDemand', sectorId: 'all', value: 2, turnsLeft: 4 }];
        }
        const initial = new Map(Object.values(state.companies).flatMap((c) => c.products).map((p) => [p.id, p.hexId]));
        while (state.phase === 'playing') {
          resolveTurn(state);
          for (const company of Object.values(state.companies)) for (const product of company.products) {
            if (initial.has(product.id)) expect(product.hexId, product.id).toBe(initial.get(product.id));
          }
        }
      }
      expect(moves).toBe(0);
      expect(launches.some((launch) => launch.kind === 'launchProduct' && launch.ok)).toBe(true);
      for (const launch of launches) {
        expect(launch.hexId).toBe(launch.expected);
        expect(launch.bid).toBeGreaterThanOrEqual(hexReservePrice(launch.hexId!));
        expect(launch.zoneId).toBeUndefined();
        if (launch.ok) expect(launch.actual).toEqual(launch.kind === 'launchProduct' ? [] : [undefined]);
      }
    }, 60_000);
  }
});
