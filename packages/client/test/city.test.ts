import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMODITIES,
  PLAYER_COLORS,
  applyAction,
  createGame,
  getContent,
  getPlayerView,
  resolveTurn,
  type GameState,
  type LobbyPlayer,
  type PlayerView,
} from '@muchomoney/core';
import {
  SALE_RATIO,
  SPIKE_RATIO,
  cityNews,
  companyMatches,
  hasFreeSlot,
  launchCompany,
  openingSign,
  threatSign,
  warehouseModel,
  youSign,
} from '../src/screens/game/city/model';

/** Partie réelle : un humain et 7 bots, quelques trimestres joués. */
function game(turns = 4, seed = 5): GameState {
  const bots = getContent('fr').bots.slice(0, 7);
  const players: LobbyPlayer[] = [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: PLAYER_COLORS[0] },
    ...bots.map((b, i) => ({
      id: `bot${i + 1}`,
      name: b.ceoName,
      isBot: true,
      botPersonalityId: b.id,
      companyName: b.companyName,
      sectorId: b.preferredSectors[0],
      connected: true,
      color: PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length],
    })),
  ];
  const g = createGame({ seed, totalTurns: 16, turnSeconds: 90, startYear: 2027, lang: 'fr' }, players);
  for (let t = 0; t < turns; t++) resolveTurn(g);
  return g;
}

const mineOf = (g: GameState) => Object.values(g.companies).find((c) => c.controllerId === 'human' && c.status === 'active')!;

describe('La carte : confidentialité', () => {
  it('seul city/privacy.ts lit `.private`', () => {
    const dir = join(__dirname, '../src/screens/game/city');
    const offenders = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && f !== 'privacy.ts')
      .filter((f) => /\.private\b|\bprivate\?\./.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('ne lit jamais les lignes produit des rapports (production des rivaux)', () => {
    const dir = join(__dirname, '../src/screens/game/city');
    const offenders = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /reports[^;\n]*\.products|\.produced\b|\.unitCost\b/.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('sans vue privée (spectateur), rien n’est « à moi »', () => {
    const g = game();
    const view: PlayerView = getPlayerView(g, 'nobody');
    expect(view.companies.some((c) => c.private)).toBe(false);
    const news = cityNews(view);
    for (const c of view.commodities) expect(warehouseModel(view, c, news).myLots).toBeNull();
    expect(youSign(view)).toBeNull();
    expect(threatSign(view).kind).toBe('none');
  });
});

describe('La carte : le port de la capitale', () => {
  it('cote chaque matière contre son prix de base et compte mes lots en stock', () => {
    const view = getPlayerView(game(), 'human');
    const news = cityNews(view);
    for (const c of view.commodities) {
      const w = warehouseModel(view, c, news);
      expect(w.ratio).toBeCloseTo(c.price / COMMODITIES[c.id].basePrice);
      expect(w.angle).toBeGreaterThanOrEqual(-60);
      expect(w.angle).toBeLessThanOrEqual(60);
      expect(w.tag).toBe(w.ratio < SALE_RATIO ? 'sale' : w.ratio > SPIKE_RATIO ? 'spike' : null);
      expect(w.myLots).not.toBeNull();
    }
  });
});

describe('La carte : panneaux d’entrée', () => {
  it('chooses another controlled company when pending hex launches fill the selected company', () => {
    const g = createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr', mapMode: 'hex', terrainAssignment: 'fair' }, [
      { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: PLAYER_COLORS[0] },
      { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: PLAYER_COLORS[1] },
    ]);
    const selected = mineOf(g);
    const other = Object.values(g.companies).find((c) => c.controllerId === 'rival')!;
    g.players.human.cash = 1e9;
    selected.cash = 1e6;
    expect(applyAction(g, 'human', { type: 'buyShares', companyId: other.id, shares: Math.floor(other.sharesOutstanding / 2) + 1 }).ok).toBe(true);
    expect(other.controllerId).toBe('human');
    const before = getPlayerView(g, 'human');
    expect(launchCompany(before, before.companies.find((c) => c.id === selected.id))?.id).toBe(selected.id);
    for (const [i, sectorId] of (['yogurts', 'crypto', 'scooters'] as const).entries()) {
      const hexId = before.hexes!.free[i];
      expect(applyAction(g, 'human', { type: 'launchProduct', companyId: selected.id, sectorId, name: `Project ${i}`, hexId, bid: before.hexes!.reserve[hexId], fallback: 'nearest' }).ok).toBe(true);
    }
    const after = getPlayerView(g, 'human');
    const chosen = after.companies.find((c) => c.id === selected.id)!;
    expect(chosen.products.length + chosen.private!.launchProjects!.length).toBe(4);
    expect(hasFreeSlot(after)).toBe(true);
    expect(launchCompany(after, chosen)?.id).toBe(other.id);
    expect(launchCompany(getPlayerView(g, 'nobody'))).toBeNull();
  });

  it('signale la plus grosse participation d’un autre joueur dans mon entreprise', () => {
    const g = game(2);
    const mine = mineOf(g);
    const rival = Object.values(g.players).find((p) => p.id !== 'human')!;
    rival.cash = 1e9;
    expect(applyAction(g, rival.id, { type: 'buyShares', companyId: mine.id, shares: 2500 }).ok).toBe(true);
    const threat = threatSign(getPlayerView(g, 'human'));
    expect(threat.kind).toBe('stake');
    if (threat.kind === 'stake') {
      expect(threat.holder.id).toBe(rival.id);
      expect(threat.pct).toBeCloseTo(0.25);
    }
  });

  it('compte mes verdicts et propose un lancement seulement avec un emplacement libre', () => {
    const g = game(1);
    const view = getPlayerView(g, 'human');
    const you = youSign(view)!;
    expect(you.hasCompany).toBe(true);
    expect(Object.values(you.counts).reduce((a, b) => a + b, 0)).toBe(mineOf(g).products.length);
    const opening = openingSign(view);
    if (opening.kind === 'launch') expect(view.sectors.find((s) => s.id === opening.sectorId)?.launchEstimate?.paybackQuarters).toBe(opening.payback);
    const mine = mineOf(g);
    for (const sectorId of ['yogurts', 'crypto', 'scooters'] as const) applyAction(g, 'human', { type: 'launchProduct', companyId: mine.id, sectorId, name: `P ${sectorId}` });
    expect(openingSign(getPlayerView(g, 'human')).kind).not.toBe('launch');
  });

  it('met en avant les entreprises dirigées ou détenues par le joueur filtré', () => {
    const view = getPlayerView(game(), 'human');
    const mine = view.companies.find((c) => c.controllerId === 'human')!;
    expect(companyMatches(mine, { kind: 'mine' }, 'human')).toBe(true);
    expect(companyMatches(mine, { kind: 'all' }, 'human')).toBe(true);
    const npc = view.companies.find((c) => c.controllerId === null && (c.holdings.human ?? 0) === 0);
    if (npc) expect(companyMatches(npc, { kind: 'mine' }, 'human')).toBe(false);
  });
});
