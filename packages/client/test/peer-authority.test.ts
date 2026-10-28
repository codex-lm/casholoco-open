import { describe, expect, it, vi } from 'vitest';
import * as core from '@muchomoney/core';
import { createPeerAuthority, type PeerSnapshot } from '../src/peer/authority';

const options = { name: 'Host', companyName: 'Alpha', seed: 481, totalTurns: 8, botCount: 1, botLevel: 'intern', lang: 'en' } as const;
function joined() {
  const authority = createPeerAuthority(options);
  expect(authority.joinPlayer({ id: 'guest', name: 'Guest', companyName: 'Beta', sectorId: 'yogurts' }).ok).toBe(true);
  expect(authority.startGame().ok).toBe(true);
  return authority;
}

describe('peer host authority', () => {
  it('shares a seed-free lobby and delivers individual views to the correct recipients', () => {
    const received: { id: string; snapshot: PeerSnapshot }[] = [];
    const authority = createPeerAuthority({ ...options, onSnapshot: (id, snapshot) => received.push({ id, snapshot }) });
    authority.joinPlayer({ id: 'guest', name: 'Guest' });
    expect(authority.getLobby('guest').you).toBe('guest');
    expect(authority.getLobby().hostId).toBe('host');
    expect('seed' in authority.getLobby().config).toBe(false);
    const lobby = authority.getLobby();
    lobby.players.length = 0;
    expect(authority.getLobby().players).toHaveLength(3);
    authority.startGame();
    const views = received.filter((event) => event.snapshot.kind === 'game');
    expect(views).toHaveLength(2);
    for (const { id, snapshot } of views) {
      if (snapshot.kind !== 'game') throw new Error('wrong snapshot');
      expect(snapshot.view.you).toBe(id);
      expect('state' in snapshot).toBe(false);
      expect('rngState' in snapshot.view).toBe(false);
      expect('scheduledNews' in snapshot.view).toBe(false);
      expect(snapshot.view.companies.filter((c) => c.private).every((c) => c.controllerId === id)).toBe(true);
    }
    expect(authority.getView('missing')).toBeNull();
    expect(authority.getView('bot1')).toBeNull();
  });

  it('applies actions only for a connected human and enforces ownership and the displayed quarter', () => {
    const authority = joined();
    const host = authority.getView('host')!;
    const company = host.companies.find((c) => c.controllerId === 'host')!;
    const before = authority.exportHostSave();
    expect(authority.applyAction('guest', { type: 'setProductDecisions', companyId: company.id, productId: company.products[0].id, production: 5 }, 1).ok).toBe(false);
    expect(authority.applyAction('bot1', { type: 'takePersonalLoan', amount: 1 }, 1).ok).toBe(false);
    expect(authority.applyAction('constructor', { type: 'takePersonalLoan', amount: 1 }, 1).ok).toBe(false);
    expect(authority.applyAction('guest', { type: 'takePersonalLoan', amount: 1 }, 0).ok).toBe(false);
    expect(authority.exportHostSave()).toBe(before);
    expect(authority.applyAction('guest', { type: 'takePersonalLoan', amount: 1 }, 1).ok).toBe(true);
    authority.setConnected('guest', false);
    expect(authority.applyAction('guest', { type: 'takePersonalLoan', amount: 1 }, 1).ok).toBe(false);
  });

  it('closes once when all connected humans are ready, never on a stale message', () => {
    const authority = joined();
    expect(authority.ready('host', true, 1).ok).toBe(true);
    expect(authority.getView('host')?.turn).toBe(1);
    expect(authority.ready('guest', true, 1).ok).toBe(true);
    expect(authority.getView('host')?.turn).toBe(2);
    const after = authority.exportHostSave();
    expect(authority.ready('guest', true, 1).ok).toBe(false);
    expect(authority.exportHostSave()).toBe(after);
    expect(authority.getView('guest')?.players.every((p) => !p.ready)).toBe(true);
  });

  it('stops waiting for a disconnected guest but pauses when nobody is connected', () => {
    const authority = joined();
    authority.ready('host', true, 1);
    authority.setConnected('guest', false);
    expect(authority.getView('host')?.turn).toBe(2);
    authority.setConnected('host', false);
    expect(authority.getView('host')?.turn).toBe(2);
    expect(authority.ready('host', true, 2).ok).toBe(false);
    authority.setConnected('host', true);
    authority.setConnected('guest', true);
    expect(authority.getView('host')?.turn).toBe(2);
    expect(authority.getView('guest')?.players.find((p) => p.id === 'guest')?.ready).toBe(false);
  });

  it('lets a guest revoke readiness while another human is still deciding', () => {
    const authority = joined();
    authority.ready('guest', true, 1);
    authority.ready('guest', false, 1);
    authority.ready('host', true, 1);
    expect(authority.getView('host')?.turn).toBe(1);
  });

  it('keeps an interrupted final ready signal and its preceding game state atomic', () => {
    const authority = joined();
    authority.ready('host', true, 1);
    const before = authority.exportHostSave();
    const resolve = vi.spyOn(core, 'resolveTurn').mockImplementationOnce((state) => {
      state.turn = 99;
      state.players.host.cash = -1000;
      throw new Error('interruption');
    });
    try {
      expect(authority.ready('guest', true, 1).ok).toBe(false);
      expect(authority.exportHostSave()).toBe(before);
      expect(authority.getView('guest')?.players.find((p) => p.id === 'guest')?.ready).toBe(false);
    } finally { resolve.mockRestore(); }
  });

  it('bounds seats to eight, preserves the host and freezes lobby changes after start', () => {
    const authority = createPeerAuthority({ ...options, botCount: 6 });
    expect(authority.joinPlayer({ id: 'guest', name: 'Guest' }).ok).toBe(true);
    expect(authority.getLobby().players).toHaveLength(8);
    expect(authority.joinPlayer({ id: 'guest2', name: 'Guest 2' }).ok).toBe(false);
    expect(authority.removePlayer('host').ok).toBe(false);
    expect(authority.removePlayer('bot6').ok).toBe(true);
    expect(authority.joinPlayer({ id: 'guest2', name: 'Guest 2' }).ok).toBe(true);
    authority.startGame();
    expect(authority.configure({ totalTurns: 24 }).ok).toBe(false);
    expect(authority.addBot().ok).toBe(false);
    expect(authority.updatePlayer('guest', { name: 'Changed' }).ok).toBe(false);
    expect(authority.joinPlayer({ id: 'extra', name: 'Extra' }).ok).toBe(false);
  });

  it('completes a shared game and rejects further moves after the final results', () => {
    const authority = joined();
    for (let turn = 1; turn <= 8; turn++) {
      expect(authority.ready('host', true, turn).ok).toBe(true);
      expect(authority.ready('guest', true, turn).ok).toBe(true);
    }
    expect(authority.getPhase()).toBe('finished');
    expect(authority.getView('host')?.results?.ranking).toHaveLength(3);
    expect(authority.getView('guest')?.results).toEqual(authority.getView('host')?.results);
    expect(authority.ready('host', true, 8).ok).toBe(false);
    expect(authority.applyAction('guest', { type: 'takePersonalLoan', amount: 1 }, 8).ok).toBe(false);
  });

  it('restores a host save without rerunning bots and waits for new guest channels', () => {
    const authority = joined();
    authority.ready('host', true, 1);
    authority.ready('guest', true, 1);
    const save = authority.exportHostSave();
    const restored = createPeerAuthority({ name: 'Other' });
    expect(restored.importHostSave(save).ok).toBe(true);
    expect(restored.getSessionId()).toBe(authority.getSessionId());
    expect(restored.getView('host')?.turn).toBe(2);
    expect(restored.getView('guest')?.players.find((p) => p.id === 'guest')?.connected).toBe(false);
    expect(restored.joinPlayer({ id: 'guest' }).ok).toBe(true);
    expect(restored.getView('guest')?.players.find((p) => p.id === 'guest')?.connected).toBe(true);
    const originalState = JSON.parse(save).state;
    const restoredState = JSON.parse(restored.exportHostSave()).state;
    for (const p of Object.values(restoredState.players) as { ready: boolean; connected: boolean }[]) {
      p.ready = false;
      p.connected = true;
    }
    expect(restoredState).toEqual(originalState);
  });

  it('refuses malformed host saves without touching the current game', () => {
    const authority = joined();
    const save = authority.exportHostSave();
    const bad = JSON.parse(save);
    bad.state.players.host.cash = null;
    expect(authority.importHostSave(JSON.stringify(bad)).ok).toBe(false);
    expect(authority.importHostSave(save.replace('"players":[', '"__proto__":{},"players":[')).ok).toBe(false);
    expect(authority.importHostSave('{}').ok).toBe(false);
    expect(authority.exportHostSave()).toBe(save);
  });

  it('normalizes lobby names consistently with the engine and retains host edits across settings changes', () => {
    const authority = createPeerAuthority({ ...options, name: 'A   Host' });
    authority.updatePlayer('host', { name: 'The   Host', companyName: 'Friendly  Inc', sectorId: 'crypto' });
    authority.configure({ totalTurns: 12 });
    expect(authority.getLobby().players[0]).toMatchObject({ name: 'The Host', companyName: 'Friendly Inc', sectorId: 'crypto' });
    authority.joinPlayer({ id: 'guest', name: 'A   Guest' });
    authority.startGame();
    const restored = createPeerAuthority();
    expect(restored.importHostSave(authority.exportHostSave()).ok).toBe(true);
  });
});
