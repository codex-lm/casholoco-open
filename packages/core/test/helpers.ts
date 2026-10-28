import { BOT_PERSONALITIES, PLAYER_COLORS } from '../src/content';
import { createGame } from '../src/engine';
import type { CompanyState, GameConfig, GameState, LobbyPlayer, MapNames, SectorId } from '../src/types';

export function human(id: string, sectorId: SectorId = 'energy_drinks', name = `Joueur ${id}`): LobbyPlayer {
  return {
    id,
    name,
    isBot: false,
    companyName: `${name} Industries`,
    sectorId,
    connected: true,
    color: PLAYER_COLORS[0],
  };
}

export function bots(n: number): LobbyPlayer[] {
  const out: LobbyPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const pers = BOT_PERSONALITIES[i % BOT_PERSONALITIES.length];
    out.push({
      id: `bot${i + 1}`,
      name: i < BOT_PERSONALITIES.length ? pers.ceoName : `${pers.ceoName} ${i + 1}`,
      isBot: true,
      botPersonalityId: pers.id,
      companyName: i < BOT_PERSONALITIES.length ? pers.companyName : `${pers.companyName} ${i + 1}`,
      sectorId: pers.preferredSectors[0] ?? 'gadgets',
      connected: true,
      color: PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length],
    });
  }
  return out;
}

export function config(seed: number, totalTurns = 16): GameConfig {
  return { seed, totalTurns, turnSeconds: 90, startYear: 2027 };
}

export function newGame(seed: number, players: LobbyPlayer[], totalTurns = 16): GameState {
  return createGame(config(seed, totalTurns), players);
}

/** Entreprise (active) contrôlée par ce joueur, créée au lancement. */
export function companyOf(state: GameState, playerId: string): CompanyState {
  const c = Object.values(state.companies).find((x) => x.founderId === playerId && x.status === 'active');
  if (!c) throw new Error(`pas d'entreprise pour ${playerId}`);
  return c;
}

export function npcCompanies(state: GameState): CompanyState[] {
  return Object.values(state.companies).filter((c) => c.npcDefId !== undefined && c.status === 'active');
}

export function snapshot(state: GameState): string {
  return JSON.stringify(state);
}

/** Tous les noms de la carte d'une langue (§5.8), pour les vérifications typographiques. */
export function mapTexts(names: MapNames): string[] {
  return [names.country, ...Object.values(names.cities), ...Object.values(names.zones), ...Object.values(names.landmarks)];
}
