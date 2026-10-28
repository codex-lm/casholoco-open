import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CompanyView, PlayerView, PublicPlayer, SectorId, SectorView } from '@muchomoney/core';
import { SECTORS } from '@muchomoney/core';
import { useT } from '../i18n';

export interface GameData {
  view: PlayerView;
  me: PublicPlayer;
  playersById: Map<string, PublicPlayer>;
  companiesById: Map<string, CompanyView>;
  sectorsById: Map<SectorId, SectorView>;
  /** Entreprises actives que je contrôle. */
  myCompanies: CompanyView[];
  /** Nom d'un joueur (ou « Pilote automatique » pour null, dans la langue de l'interface). */
  playerName(id: string | null | undefined): string;
  refPrice(sectorId: SectorId): number;
}

const GameContext = createContext<GameData | null>(null);

function placeholderMe(view: PlayerView, name: string): PublicPlayer {
  return {
    id: view.you,
    name,
    isBot: false,
    color: '#888',
    cash: 0,
    debt: 0,
    portfolioValue: 0,
    netWorth: 0,
    connected: true,
    ready: false,
    controlledCompanyIds: [],
    netWorthHistory: [],
    stats: {
      shadyActions: 0,
      scandals: 0,
      finesPaid: 0,
      takeoversWon: 0,
      takeoversSuffered: 0,
      parachutes: 0,
      rndSpent: 0,
      marketingSpent: 0,
      oilConsumed: 0,
      bonusesTaken: 0,
      dividendsReceived: 0,
      startupsFounded: 0,
      worstTurnLoss: 0,
      bankruptcies: 0,
    },
  };
}

export function GameProvider({ view, children }: { view: PlayerView; children: ReactNode }) {
  const t = useT();
  const data = useMemo<GameData>(() => {
    const playersById = new Map(view.players.map((p) => [p.id, p]));
    const companiesById = new Map(view.companies.map((c) => [c.id, c]));
    const sectorsById = new Map(view.sectors.map((s) => [s.id, s]));
    const me = playersById.get(view.you) ?? placeholderMe(view, t.common.You);
    const myCompanies = view.companies.filter((c) => c.controllerId === view.you && c.status === 'active');
    return {
      view,
      me,
      playersById,
      companiesById,
      sectorsById,
      myCompanies,
      playerName: (id) => (id ? (playersById.get(id)?.name ?? t.common.unknown) : t.common.autopilot),
      refPrice: (sectorId) => sectorsById.get(sectorId)?.refPrice ?? SECTORS[sectorId]?.refPrice ?? 100,
    };
  }, [view, t]);
  return <GameContext.Provider value={data}>{children}</GameContext.Provider>;
}

export function useGame(): GameData {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame hors de GameProvider');
  return ctx;
}
