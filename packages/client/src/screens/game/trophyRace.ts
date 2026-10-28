import type { PlayerView, TrophyId } from '@muchomoney/core';
import { TROPHY_IDS, TROPHY_STAT } from '@muchomoney/core';

export interface TrophyLead {
  trophyId: Exclude<TrophyId, 'magnat' | 'machiavel'>;
  leaderId: string;
  value: number;
  runnerUpId?: string;
  runnerValue?: number;
  contested: boolean;
}

/**
 * Course aux trophées en direct : copie client du décompte de computeResults (sim/trophies).
 * « machiavel » est exclu : sa stat (shadyActions) est masquée côté client.
 */
export function trophyLeaders(view: PlayerView, opts?: { all?: boolean }): TrophyLead[] {
  const ranking = [...view.players].sort((a, b) => b.netWorth - a.netWorth || (a.id < b.id ? -1 : 1));
  const leads: TrophyLead[] = [];
  for (const id of TROPHY_IDS) {
    if (id === 'magnat' || id === 'machiavel') continue;
    const stat = TROPHY_STAT[id];
    // Parcours dans l'ordre du classement : à égalité, le mieux classé l'emporte.
    let leaderId: string | undefined;
    let best = 0;
    for (const p of ranking) {
      const v = p.stats[stat] ?? 0;
      if (Number.isFinite(v) && v > best + 1e-9) {
        leaderId = p.id;
        best = v;
      }
    }
    if (leaderId === undefined) continue;
    const value = best;
    let runnerUpId: string | undefined;
    let second = 0;
    for (const p of ranking) {
      if (p.id === leaderId) continue;
      const v = p.stats[stat] ?? 0;
      if (Number.isFinite(v) && v > second + 1e-9) {
        runnerUpId = p.id;
        second = v;
      }
    }
    const contested = runnerUpId !== undefined && second >= 0.8 * value;
    if (!opts?.all && !contested && leaderId !== view.you) continue;
    const lead: TrophyLead = { trophyId: id, leaderId, value, contested };
    if (runnerUpId !== undefined) {
      lead.runnerUpId = runnerUpId;
      lead.runnerValue = second;
    }
    leads.push(lead);
  }
  return leads;
}

export interface TrophyLeadChange {
  trophyId: Exclude<TrophyId, 'magnat' | 'machiavel'>;
  from?: string;
  to?: string;
  value: number;
}

/** Changements de tête entre deux vues, limités aux trophées où « you » gagne ou perd la tête. */
export function trophyLeadChanges(prev: PlayerView, next: PlayerView, you: string): TrophyLeadChange[] {
  const prevLeads = new Map(trophyLeaders(prev, { all: true }).map((l) => [l.trophyId, l]));
  const nextLeads = new Map(trophyLeaders(next, { all: true }).map((l) => [l.trophyId, l]));
  const changes: TrophyLeadChange[] = [];
  for (const id of TROPHY_IDS) {
    if (id === 'magnat' || id === 'machiavel') continue;
    const prevLead = prevLeads.get(id);
    const nextLead = nextLeads.get(id);
    const from = prevLead?.leaderId;
    const to = nextLead?.leaderId;
    if (from === to || (from !== you && to !== you)) continue;
    changes.push({ trophyId: id, from, to, value: nextLead?.value ?? prevLead?.value ?? 0 });
  }
  return changes;
}
