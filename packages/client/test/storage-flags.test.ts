import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('préférences booléennes sans stockage fiable', () => {
  it('conserve Figer entre les écrans lorsque l’écriture échoue même si une ancienne valeur reste lisible', async () => {
    vi.stubGlobal('localStorage', { getItem: () => '0', setItem: () => { throw new Error('quota'); } });
    const { loadFlag, saveFlag, STILL_KEY } = await import('../src/storageFlags');
    expect(loadFlag(STILL_KEY)).toBe(false);
    saveFlag(STILL_KEY, true);
    expect(loadFlag(STILL_KEY)).toBe(true);
    saveFlag(STILL_KEY, false);
    expect(loadFlag(STILL_KEY)).toBe(false);
  });

  it('partage le choix de la visite quand localStorage est absent, sans modifier les autres préférences', async () => {
    vi.stubGlobal('localStorage', undefined);
    const { loadFlag, saveFlag, STILL_KEY, MAP_WHOLE_KEY } = await import('../src/storageFlags');
    saveFlag(STILL_KEY, true);
    expect(loadFlag(STILL_KEY)).toBe(true);
    expect(loadFlag(MAP_WHOLE_KEY)).toBe(false);
    saveFlag(MAP_WHOLE_KEY, true);
    saveFlag(STILL_KEY, false);
    expect(loadFlag(STILL_KEY)).toBe(false);
    expect(loadFlag(MAP_WHOLE_KEY)).toBe(true);
  });

  it('garde la dernière valeur connue si la lecture devient indisponible', async () => {
    const getItem = vi.fn(() => '1');
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
    const { loadFlag, STILL_KEY } = await import('../src/storageFlags');
    expect(loadFlag(STILL_KEY)).toBe(true);
    getItem.mockImplementation(() => { throw new Error('access denied'); });
    expect(loadFlag(STILL_KEY)).toBe(true);
  });

  it('reprend le stockage normal après une écriture réussie, y compris les changements venus d’un autre onglet', async () => {
    const values = new Map<string, string>();
    let blocked = true;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { if (blocked) throw new Error('quota'); values.set(key, value); },
    });
    const { loadFlag, saveFlag, STILL_KEY } = await import('../src/storageFlags');
    saveFlag(STILL_KEY, true);
    expect(loadFlag(STILL_KEY)).toBe(true);
    blocked = false;
    saveFlag(STILL_KEY, true);
    expect(values.get(STILL_KEY)).toBe('1');
    values.set(STILL_KEY, '0');
    expect(loadFlag(STILL_KEY)).toBe(false);
    values.delete(STILL_KEY);
    expect(loadFlag(STILL_KEY)).toBe(false);
  });
});
