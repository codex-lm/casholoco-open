import { afterEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

type SessionModule = typeof import('../src/session');

/** Deux onglets : localStorage partagé, sessionStorage et identifiant d'onglet propres. */
async function twoTabs(search = '') {
  const local = new MemoryStorage();
  const tabs: { mod: SessionModule; win: unknown }[] = [];
  for (let i = 0; i < 2; i++) {
    const win = { sessionStorage: new MemoryStorage(), localStorage: local, location: { search, href: `http://x/${search}` } };
    vi.resetModules();
    vi.stubGlobal('window', win);
    tabs.push({ mod: await import('../src/session'), win });
  }
  const as = <T>(i: number, fn: (m: SessionModule) => T): T => {
    vi.stubGlobal('window', tabs[i].win);
    return fn(tabs[i].mod);
  };
  return { as, local };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const S = { roomCode: 'ABCD', playerId: 'p1', token: 'tok1' };

describe('session : un nouvel onglet ne vole pas le siège', () => {
  it('loadSession ne lit que le sessionStorage de l’onglet', async () => {
    const { as } = await twoTabs();
    as(0, (m) => m.saveSession(S));
    expect(as(1, (m) => m.loadSession())).toBeNull();
    expect(as(1, (m) => m.loadFallbackSession())).toEqual(S);
  });

  it('la copie de repli est signalée comme tenue par l’onglet vivant', async () => {
    const { as } = await twoTabs();
    as(0, (m) => m.saveSession(S));
    expect(as(1, (m) => m.isHeldByAnotherTab(S))).toBe(true);
    expect(as(0, (m) => m.isHeldByAnotherTab(S))).toBe(false);
  });

  it('verrou libéré (onglet fermé) ou périmé : reprise automatique permise', async () => {
    const { as } = await twoTabs();
    as(0, (m) => m.saveSession(S));
    as(0, (m) => m.releaseSession(S));
    expect(as(1, (m) => m.isHeldByAnotherTab(S))).toBe(false);
    as(0, (m) => m.claimSession(S, Date.now() - 60_000));
    expect(as(1, (m) => m.isHeldByAnotherTab(S))).toBe(false);
  });

  it('l’onglet éjecté n’efface pas la copie de repli reprise par l’autre onglet', async () => {
    const { as, local } = await twoTabs();
    as(0, (m) => m.saveSession(S));
    as(1, (m) => m.saveSession(S)); // « Reprendre ma partie ici »
    as(0, (m) => m.clearSession()); // room:closed TAKEN_OVER dans le premier onglet
    expect(local.getItem('muchomoney:sessions')).toContain('tok1');
    expect(as(0, (m) => m.isHeldByAnotherTab(S))).toBe(true);
  });

  it('onglet rouvert : reprend la session libre, pas celle d’un autre onglet vivant', async () => {
    const { as } = await twoTabs();
    const BOB = { roomCode: 'ABCD', playerId: 'p2', token: 'tok2' };
    as(1, (m) => m.saveSession(BOB));
    as(0, (m) => m.saveSession(S)); // Alice, plus récente, onglet toujours ouvert
    as(1, (m) => m.releaseSession(BOB)); // Bob ferme son onglet
    expect(as(1, (m) => m.loadFallbackSession())).toEqual(BOB);
  });

  it('lien d’invitation : pas de repli', async () => {
    const { as } = await twoTabs('?code=WXYZ');
    as(0, (m) => m.saveSession(S));
    expect(as(1, (m) => m.loadFallbackSession())).toBeNull();
  });
});

describe('codes de salon', () => {
  it('ne garde que l’alphabet du serveur (sans chiffres, I ni O)', async () => {
    const { normalizeCode, hasInvalidCodeChars } = await import('../src/session');
    expect(normalizeCode('kx7p')).toBe('KXP');
    expect(normalizeCode('O1IABCDE')).toBe('ABCD');
    expect(normalizeCode('kxmp')).toBe('KXMP');
    expect(hasInvalidCodeChars('KX7P')).toBe(true);
    expect(hasInvalidCodeChars('kx mp')).toBe(false);
  });
});
