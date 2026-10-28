import { describe, expect, it, vi } from 'vitest';
import * as core from '@muchomoney/core';
import type { Action, PlayerView } from '@muchomoney/core';
import { createSoloRuntime, SOLO_SAVE_KEY, type SoloStorage } from '../src/solo/runtime';
import { decodeSoloSave, MAX_SOLO_SAVE_LENGTH } from '../src/solo/session';

class MemoryStorage implements SoloStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('solo game runtime', () => {
  it('starts the real game at its first quarter with one human and configurable bots', () => {
    const runtime = createSoloRuntime(new MemoryStorage());
    const emitted: (PlayerView | null)[] = [];
    runtime.setSoloViewListener((view) => emitted.push(view));
    const view = runtime.startSolo({ name: 'Camille', companyName: 'Gaufres & Co', sectorId: 'yogurts', botCount: 4, botLevel: 'normal', lang: 'fr', seed: 42 });
    expect(view.turn).toBe(1);
    expect(view.config).toMatchObject({ turnSeconds: 0, totalTurns: 16, lang: 'fr', allowBotTakeover: false });
    expect(view.players.filter((p) => !p.isBot)).toHaveLength(1);
    expect(view.players.filter((p) => p.isBot)).toHaveLength(4);
    expect(view.players.filter((p) => p.isBot).every((p) => p.botLevel === 'normal')).toBe(true);
    expect(view.players.find((p) => p.id === view.you)?.name).toBe('Camille');
    expect(view.companies.find((c) => c.controllerId === view.you)?.name).toBe('Gaufres & Co');
    expect(view.turnEndsAt).toBeUndefined();
    expect('rngState' in view).toBe(false);
    expect('scheduledNews' in view).toBe(false);
    expect(emitted).toEqual([view]);
    expect(runtime.hasSoloSave()).toBe(true);
  });

  it('restores decisions and RNG exactly without replaying the opening bots', () => {
    const storage = new MemoryStorage();
    const uninterrupted = createSoloRuntime(storage);
    const before = uninterrupted.startSolo({ lang: 'en', botCount: 3, botLevel: 'normal', seed: 711 });
    const company = before.companies.find((c) => c.controllerId === before.you)!;
    const action: Action = { type: 'setProductDecisions', companyId: company.id, productId: company.products[0].id, price: company.products[0].price * 1.1, production: 14, marketing: 100, rnd: 100 };
    expect(uninterrupted.applySoloAction(action, 1).ok).toBe(true);
    expect(uninterrupted.advanceSoloTurn(1).ok).toBe(true);
    const exactSave = uninterrupted.exportSoloSave();
    const restored = createSoloRuntime(storage);
    const view = restored.resumeSolo();
    expect(view?.turn).toBe(2);
    expect(restored.exportSoloSave()).toBe(exactSave);
    expect(restored.getSoloSaveId()).toBe(uninterrupted.getSoloSaveId());
    expect(restored.getSoloSaveInfo()).toMatchObject({ turn: 2, lang: 'en', totalTurns: 16, phase: 'playing' });
    expect(uninterrupted.advanceSoloTurn(2).ok).toBe(true);
    expect(restored.advanceSoloTurn(2).ok).toBe(true);
    expect(restored.exportSoloSave()).toBe(uninterrupted.exportSoloSave());
  });

  it('rejects stale actions and stale ready signals without touching the next quarter', () => {
    const runtime = createSoloRuntime(new MemoryStorage());
    runtime.startSolo({ seed: 14 });
    runtime.advanceSoloTurn(1);
    const saved = runtime.exportSoloSave();
    expect(runtime.applySoloAction({ type: 'takePersonalLoan', amount: 10 }, 1).ok).toBe(false);
    expect(runtime.advanceSoloTurn(1).ok).toBe(false);
    expect(runtime.exportSoloSave()).toBe(saved);
  });

  it.each(['classic', 'hex', 'square'] as const)('completes a game in %s and can restore its final results', (mapMode) => {
    const storage = new MemoryStorage();
    const runtime = createSoloRuntime(storage);
    runtime.startSolo({ seed: 91, totalTurns: 8, mapMode, botCount: 3, botLevel: 'normal' });
    for (let quarter = 1; quarter <= 8; quarter++) expect(runtime.advanceSoloTurn(quarter).ok).toBe(true);
    const view = runtime.getSoloView()!;
    expect(view.phase).toBe('finished');
    expect(view.results?.ranking).toHaveLength(4);
    expect(view.results?.ranking.every((p) => Number.isFinite(p.netWorth))).toBe(true);
    const final = runtime.exportSoloSave();
    expect(runtime.advanceSoloTurn(8).ok).toBe(false);
    expect(runtime.exportSoloSave()).toBe(final);
    runtime.leaveSolo();
    expect(runtime.getSoloView()).toBeNull();
    expect(createSoloRuntime(storage).resumeSolo()).toEqual(view);
  });

  it('creates reproducible expert opponents from the same seed', () => {
    const a = createSoloRuntime(null);
    const b = createSoloRuntime(null);
    const options = { seed: 107, totalTurns: 8, botCount: 2, botLevel: 'expert', mapMode: 'square', lang: 'en' } as const;
    a.startSolo(options);
    b.startSolo(options);
    for (let q = 1; q <= 3; q++) { a.advanceSoloTurn(q); b.advanceSoloTurn(q); }
    expect(JSON.parse(a.exportSoloSave()!).state).toEqual(JSON.parse(b.exportSoloSave()!).state);
    expect(a.getSoloSaveId()).not.toBe(b.getSoloSaveId());
  });

  it('does not commit a partly resolved quarter when the engine throws', () => {
    const runtime = createSoloRuntime(new MemoryStorage());
    runtime.startSolo({ seed: 52 });
    const before = runtime.exportSoloSave();
    const resolve = vi.spyOn(core, 'resolveTurn').mockImplementationOnce((state) => {
      state.turn = 99;
      state.players.human.cash = -999;
      throw new Error('Interrupted quarter');
    });
    try {
      expect(runtime.advanceSoloTurn(1).ok).toBe(false);
      expect(runtime.getSoloView()?.turn).toBe(1);
      expect(runtime.exportSoloSave()).toBe(before);
    } finally { resolve.mockRestore(); }
  });

  it('validates a cold save once and caches repeated home-screen metadata reads', () => {
    const storage = new MemoryStorage();
    createSoloRuntime(storage).startSolo({ seed: 103 });
    const restored = createSoloRuntime(storage);
    const resolve = vi.spyOn(core, 'resolveTurn');
    try {
      expect(restored.hasSoloSave()).toBe(true);
      expect(resolve).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 5; i++) {
        expect(restored.getSoloSaveInfo()?.turn).toBe(1);
        expect(restored.hasSoloSave()).toBe(true);
      }
      expect(resolve).toHaveBeenCalledTimes(1);
    } finally { resolve.mockRestore(); }
  });

  it('retains play and same-page resume when persistent browser storage is denied', () => {
    const storage: SoloStorage = {
      getItem() { throw new Error('Storage blocked'); },
      setItem() { throw new Error('Quota exceeded'); },
      removeItem() { throw new Error('Storage blocked'); },
    };
    const runtime = createSoloRuntime(storage);
    expect(runtime.hasSoloSave()).toBe(false);
    runtime.startSolo({ seed: 16 });
    expect(runtime.soloStorageAvailable()).toBe(false);
    expect(runtime.advanceSoloTurn(1).ok).toBe(true);
    runtime.leaveSolo();
    expect(runtime.hasSoloSave()).toBe(true);
    expect(runtime.resumeSolo()?.turn).toBe(2);
    expect(runtime.exportSoloSave()).toContain('casholoco-solo');
  });

  it('keeps an invalid stored save unchanged and does not launch it', () => {
    const storage = new MemoryStorage();
    storage.setItem(SOLO_SAVE_KEY, '{corrupt');
    const runtime = createSoloRuntime(storage);
    expect(runtime.hasSoloSave()).toBe(false);
    expect(runtime.resumeSolo()).toBeNull();
    expect(storage.getItem(SOLO_SAVE_KEY)).toBe('{corrupt');
  });

  it('imports an exact save and refuses malformed or inconsistent imports without replacing the current game', () => {
    const runtime = createSoloRuntime(new MemoryStorage());
    runtime.startSolo({ seed: 402, lang: 'en' });
    runtime.advanceSoloTurn(1);
    const saved = runtime.exportSoloSave()!;
    const imported = createSoloRuntime(new MemoryStorage());
    expect(imported.importSoloSave(saved).ok).toBe(true);
    expect(imported.exportSoloSave()).toBe(saved);
    const corruptions: unknown[] = [
      {}, { ...JSON.parse(saved), version: 99 },
      { ...JSON.parse(saved), state: { ...JSON.parse(saved).state, turn: 900 } },
      { ...JSON.parse(saved), state: { ...JSON.parse(saved).state, players: {} } },
    ];
    const incomplete = JSON.parse(saved);
    delete incomplete.state.companies[Object.keys(incomplete.state.companies)[0]].products[0].capacity;
    corruptions.push(incomplete);
    const wrongCash = JSON.parse(saved);
    wrongCash.state.players.human.cash = 'a lot';
    corruptions.push(wrongCash);
    const brokenReports = JSON.parse(saved);
    brokenReports.state.companies[Object.keys(brokenReports.state.companies)[0]].reports = ['broken'];
    corruptions.push(brokenReports);
    for (const corrupt of corruptions) {
      expect(imported.importSoloSave(JSON.stringify(corrupt)).ok).toBe(false);
      expect(imported.exportSoloSave()).toBe(saved);
    }
    expect(imported.importSoloSave('nonsense').ok).toBe(false);
    expect(imported.importSoloSave(saved.replace('"cash":4000', '"cash":1e999')).ok).toBe(false);
    expect(imported.importSoloSave(saved.replace('"players":{', '"players":{"__proto__":{},')).ok).toBe(false);
    expect(imported.exportSoloSave()).toBe(saved);
  });

  it('bounds import size and rejects networked saves', () => {
    expect(decodeSoloSave(' '.repeat(MAX_SOLO_SAVE_LENGTH + 1))).toBeNull();
    const runtime = createSoloRuntime(null);
    runtime.startSolo({ seed: 88 });
    const networked = JSON.parse(runtime.exportSoloSave()!);
    networked.state.config.turnSeconds = 90;
    expect(runtime.importSoloSave(JSON.stringify(networked)).ok).toBe(false);
  });
});
