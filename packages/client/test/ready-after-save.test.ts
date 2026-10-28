/**
 * « Je suis prêt » attend l'enregistrement des réglages de produit (vrai `api.ts`, transport solo simulé) : le signal ne part
 * qu'après l'accusé ; si l'enregistrement échoue, le joueur reste non prêt et un toast le dit. Un enregistrement
 * réussi ne fait pas de toast ; un échec, si.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, type Lang } from '@muchomoney/core';
import { readyWhenSaved, receiveView, sendAction } from '../src/api';
import { messages } from '../src/i18n';
import { ProductSaver, flushProductSaves, forgetProductSaves, orphanSaver, productKey, settingsOf, type ProductSettings } from '../src/productSaves';
import { getState, setState } from '../src/store';

const transport = vi.hoisted(() => ({ emit: vi.fn(), connected: true }));
// Preserve the tested action boundary while replacing the former network transport.
vi.mock('../src/solo/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/solo/runtime')>();
  return {
    ...actual,
    applySoloAction: (action: import('@muchomoney/core').Action, turn?: number) =>
      new Promise<import('@muchomoney/core').ActionResult>((resolve) => transport.emit('game:action', turn === undefined ? { action } : { action, turn }, resolve)),
    advanceSoloTurn: (turn?: number) => {
      transport.emit('game:ready', turn === undefined ? { ready: true } : { ready: true, turn });
      return { ok: true, message: 'OK' };
    },
  };
});

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const initial = getState();
/** Accusés de `game:action` en attente, dans l'ordre d'envoi. */
let acks: ((r: unknown) => void)[];
const detach: (() => void)[] = [];

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage(), setTimeout, clearTimeout });
  acks = [];
  transport.emit.mockReset();
  transport.emit.mockImplementation((event: string, _payload: unknown, ack?: (r: unknown) => void) => {
    if (event === 'game:action' && ack) acks.push(ack);
  });
});
afterEach(async () => {
  for (const off of detach.splice(0)) off();
  forgetProductSaves();
  await flushProductSaves();
  setState(initial);
  vi.unstubAllGlobals();
});

function setup(lang: Lang) {
  const game = createGame(
    { seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [{ id: 'me', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#112233' }],
  );
  const view = getPlayerView(game, 'me');
  setState({ ...initial, lang, view, lobby: null, session: { roomCode: 'ROOM', playerId: 'me', token: 't' }, toasts: [] });
  const company = view.companies.find((c) => c.controllerId === 'me')!;
  const product = company.products[0];
  // Comme la fiche : une action par enregistrement, quatre valeurs, sans toast de succès.
  const place = { room: 'ROOM', companyId: company.id, productId: product.id, name: product.name };
  const saver = new ProductSaver(settingsOf(product), (v: ProductSettings) =>
    sendAction({ type: 'setProductDecisions', companyId: company.id, productId: product.id, ...v }, { quiet: true }), place);
  detach.push(saver.attach());
  return { view, company, product, saver, place };
}

const events = () => transport.emit.mock.calls.map(([event, payload]) => [event, payload] as const);
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe.each(['fr', 'en'] as const)('« Je suis prêt » après les enregistrements (%s)', (lang) => {
  const t = messages(lang);

  it('rien n’attend : le signal part aussitôt, avec le trimestre affiché', async () => {
    const { view } = setup(lang);
    expect(await readyWhenSaved(view.turn)).toBe(true);
    expect(events()).toEqual([['game:ready', { ready: true, turn: view.turn }]]);
  });

  it('un réglage en pause (− et +) part tout de suite, et le signal attend son accusé ; pas de toast de succès', async () => {
    const { view, saver, product } = setup(lang);
    saver.edit({ marketing: settingsOf(product).marketing + 10 });
    saver.commit('soon');
    const ready = readyWhenSaved(view.turn);
    await settle();
    expect(events().map(([e]) => e)).toEqual(['game:action']);
    expect(events()[0][1]).toMatchObject({ action: { type: 'setProductDecisions', marketing: settingsOf(product).marketing + 10 }, turn: view.turn });
    acks[0]({ ok: true, message: 'Gadget : marketing 30 k€.' });
    expect(await ready).toBe(true);
    expect(events().map(([e]) => e)).toEqual(['game:action', 'game:ready']);
    expect(getState().toasts).toEqual([]);
    expect(saver.getSnapshot().status).toBe('saved');
  });

  it('enregistrement refusé : le joueur reste non prêt, la fiche dit « Non enregistré » et deux toasts expliquent', async () => {
    const { view, saver, product } = setup(lang);
    saver.edit({ production: 3 });
    const ready = readyWhenSaved(view.turn);
    await settle();
    acks[0]({ ok: false, message: 'Refused by the board' });
    expect(await ready).toBe(false);
    expect(events().map(([e]) => e)).toEqual(['game:action']);
    expect(getState().toasts.map((toast) => [toast.kind, toast.message])).toEqual([
      ['bad', 'Refused by the board'],
      ['bad', t.topbar.readyNotSaved(product.name)],
    ]);
    expect(t.topbar.readyNotSaved(product.name)).toContain(product.name);
    expect(saver.getSnapshot().status).toBe('failed');
    // « Réessayer » puis prêt : cette fois, ça passe.
    const retry = readyWhenSaved(view.turn);
    await settle();
    acks[1]({ ok: true, message: 'ok' });
    expect(await retry).toBe(true);
    expect(events().map(([e]) => e)).toEqual(['game:action', 'game:action', 'game:ready']);
  });
});

describe.each(['fr', 'en'] as const)('« Je suis prêt » et les fiches refermées sur un échec (%s)', (lang) => {
  const t = messages(lang);

  /** Fiche refermée : l'enregistrement parti à la fermeture est refusé. */
  async function closedOnFailure() {
    const ctx = setup(lang);
    ctx.saver.edit({ production: 3 });
    detach.pop()!();
    await settle();
    acks[0]({ ok: false, message: 'Refused by the board' });
    await settle();
    expect(orphanSaver(ctx.place)).toBe(ctx.saver);
    return ctx;
  }

  it('le signal attend un nouvel essai ; s’il échoue encore, le joueur reste non prêt et le toast nomme le produit', async () => {
    const { view, product } = await closedOnFailure();
    const ready = readyWhenSaved(view.turn);
    await settle();
    expect(events().map(([e]) => e)).toEqual(['game:action', 'game:action']);
    acks[1]({ ok: false, message: 'Refused by the board' });
    expect(await ready).toBe(false);
    expect(getState().toasts.at(-1)).toMatchObject({ kind: 'bad', message: t.topbar.readyNotSaved(product.name) });
    // Nouvel essai réussi : le signal part.
    const again = readyWhenSaved(view.turn);
    await settle();
    acks[2]({ ok: true, message: 'ok' });
    expect(await again).toBe(true);
    expect(events().map(([e]) => e)).toEqual(['game:action', 'game:action', 'game:action', 'game:ready']);
  });

  it('produit arrêté depuis : l’échec n’a plus d’objet et ne bloque plus « Je suis prêt »', async () => {
    const { view, company, place } = await closedOnFailure();
    const without = structuredClone(view);
    without.companies.find((c) => c.id === company.id)!.products = [];
    receiveView(without);
    expect(orphanSaver(place)).toBeUndefined();
    expect(await readyWhenSaved(view.turn)).toBe(true);
    expect(events().map(([e]) => e)).toEqual(['game:action', 'game:ready']);
  });
});

describe('relevé du début du trimestre à la réception des vues', () => {
  it('la première vue du trimestre est relevée ; les suivantes du même trimestre ne l’écrasent pas', () => {
    vi.stubGlobal('window', { localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage(), setTimeout, clearTimeout });
    const { view, company, product } = setup('fr');
    setState({ view: null, turnStart: null });
    receiveView(view);
    const key = productKey(company.id, product.id);
    expect(getState().turnStart).toMatchObject({ room: 'ROOM', turn: view.turn });
    expect(getState().turnStart!.products[key]).toEqual(settingsOf(product));
    const later = structuredClone(view);
    later.companies.find((c) => c.id === company.id)!.products[0].price += 9;
    receiveView(later);
    expect(getState().turnStart!.products[key].price).toBe(product.price);
  });
});
