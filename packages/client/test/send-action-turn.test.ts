import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, ActionResult, PlayerView } from '@muchomoney/core';
import { installMock, sendAction, type MockBackend } from '../src/api';
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

const action: Action = { type: 'takePersonalLoan', amount: 100 };
const initial = getState();

beforeEach(() => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  setState({ ...initial, view: null, toasts: [] });
  transport.emit.mockReset();
  transport.emit.mockImplementation((event: string, _payload: unknown, ack?: (r: ActionResult) => void) => {
    if (event === 'game:action') ack?.({ ok: true, message: 'OK' });
  });
});

afterEach(() => {
  setState(initial);
  vi.unstubAllGlobals();
});

describe('sendAction : trimestre de la vue joint à l’action', () => {
  it('envoie le trimestre de la vue affichée quand elle existe', async () => {
    setState({ view: { turn: 5 } as PlayerView });
    await sendAction(action);
    expect(transport.emit).toHaveBeenCalledWith('game:action', { action, turn: 5 }, expect.any(Function));
  });

  it('envoie sans trimestre quand il n’y a pas de vue de partie', async () => {
    setState({ view: null });
    await sendAction(action);
    expect(transport.emit).toHaveBeenCalledWith('game:action', { action }, expect.any(Function));
  });

  it('transmet aussi le trimestre au backend maquette', async () => {
    const received: (number | undefined)[] = [];
    const backend: MockBackend = {
      action(_a, turn) {
        received.push(turn);
        return { ok: true, message: 'OK' };
      },
      ready() {},
      lobby() {
        return { ok: false, error: '—' };
      },
    };
    installMock(backend);
    setState({ view: { turn: 7 } as PlayerView });
    await sendAction(action);
    setState({ view: null });
    await sendAction(action);
    expect(received).toEqual([7, undefined]);
  });
});
