/**
 * Maquette « moteur » (dev, ?mock=engine ou ?mock=hex) : une vraie partie du moteur, jouée dans le navigateur contre 7 bots.
 * Les actions passent par applyAction, « Je suis prêt » résout le trimestre (resolveTurn) : les chiffres sont
 * exactement ceux d'une partie, sans serveur. Sert aux captures de la ville et à la démo autonome.
 */
import {
  PLAYER_COLORS,
  applyAction,
  createGame,
  getContent,
  getPlayerView,
  resolveTurn,
  type Action,
  type GameState,
  type Lang,
  type LobbyPlayer,
} from '@muchomoney/core';
import { installMock, receiveView, type MockBackend } from '../api';
import { setState, getState } from '../store';

const HUMAN = 'human';
let game: GameState | null = null;

function publish(): void {
  if (!game) return;
  const view = getPlayerView(game, HUMAN);
  view.turnEndsAt = game.config.turnSeconds > 0 ? Date.now() + game.config.turnSeconds * 1000 : undefined;
  receiveView(view);
}

function act(action: Action): void {
  if (game) applyAction(game, HUMAN, action);
}

/** Quelques trimestres joués d'avance : un lancement, un agrandissement, une prise de participation. */
function warmUp(g: GameState, turns: number): void {
  const mine = () => Object.values(g.companies).find((c) => c.controllerId === HUMAN && c.status === 'active');
  for (let t = 1; t <= turns; t++) {
    const c = mine();
    if (c) {
      if (t === 1) act({ type: 'launchProduct', companyId: c.id, sectorId: 'yogurts', name: g.config.lang === 'en' ? 'Zen Cow' : 'Vache Zen' });
      if (t === 2) act({ type: 'expandCapacity', companyId: c.id, productId: c.products[0].id, lots: 20 });
      if (t === 3) {
        const target = Object.values(g.companies).find((x) => x.status === 'active' && x.controllerId !== HUMAN && x.controllerId !== null);
        if (target) act({ type: 'buyShares', companyId: target.id, shares: 900 });
      }
    }
    resolveTurn(g);
  }
}

/**
 * Un bot monte au capital de votre entreprise (trimestre précédent) puis vous la prend (trimestre en cours) :
 * de quoi voir la chronologie, « Ce qui s'est passé » et le panneau « Vous » de la ville sans entreprise.
 */
function raid(g: GameState, step: 'stake' | 'takeover'): void {
  const c = Object.values(g.companies).find((x) => x.controllerId === HUMAN && x.status === 'active');
  const raider = g.players.bot1;
  if (!c || !raider) return;
  raider.cash += 1e6;
  const target = step === 'stake' ? Math.round(c.sharesOutstanding * 0.3) : Math.floor(c.sharesOutstanding / 2) + 1;
  const shares = target - (c.holdings.bot1 ?? 0);
  if (shares > 0) applyAction(g, 'bot1', { type: 'buyShares', companyId: c.id, shares });
}

const backend: MockBackend = {
  action(action, turn) {
    if (!game) return { ok: false, message: '—' };
    // Comme le serveur : le trimestre a tourné depuis l'affichage, on refuse sans appliquer.
    if (turn !== undefined && turn !== game.turn) {
      return {
        ok: false,
        message:
          getState().lang === 'en'
            ? 'The quarter closed in the meantime, so that action was not applied. Check your numbers and send it again.'
            : 'Le trimestre a tourné entre-temps : action non appliquée. Vérifiez vos chiffres et renvoyez-la.',
      };
    }
    const r = applyAction(game, HUMAN, action);
    publish();
    return r;
  },
  ready(ready) {
    if (game && ready && game.phase === 'playing') resolveTurn(game);
    publish();
  },
  lobby() {
    return { ok: false, error: '—' };
  },
};

export function startEngineMock(lang: Lang, opts: { seed?: number; warmUpTurns?: number; ousted?: boolean; mapMode?: 'hex' | 'square' } = {}): void {
  const bots = getContent(lang).bots.slice(0, 7);
  const players: LobbyPlayer[] = [
    {
      id: HUMAN,
      name: lang === 'en' ? 'You' : 'Vous',
      isBot: false,
      companyName: 'Synergix',
      sectorId: 'energy_drinks',
      connected: true,
      color: PLAYER_COLORS[0],
    },
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
  game = createGame({
    seed: opts.seed ?? 7, totalTurns: 16, turnSeconds: 120, startYear: 2027, lang,
    ...(opts.mapMode ? { mapMode: opts.mapMode, terrainAssignment: 'fair' as const, industryRules: 'network' as const } : {}),
  }, players);
  // Ces actions de mise en route passent directement par le moteur, sans toast.
  const turns = opts.warmUpTurns ?? (opts.mapMode ? 0 : 5);
  if (opts.ousted) {
    warmUp(game, turns - 1);
    raid(game, 'stake');
    resolveTurn(game);
    raid(game, 'takeover');
  } else {
    warmUp(game, turns);
  }
  installMock(backend);
  setState({ session: { roomCode: 'DEMO', playerId: HUMAN, token: 'mock' } });
  publish();
}
