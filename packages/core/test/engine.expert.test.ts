import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { DEFAULT_EXPERT_PARAMS, expertTurn } from '../src/sim/botExpert';
import { NEUTRAL_PERSONALITY } from '../src/sim/bots';
import { runAction } from '../src/sim/actions';
import { resolveTurnWithLog } from '../src/sim/resolve';
import { findNonFinite } from '../src/sim/sanitize';
import type { ExpertMemory, GameState } from '../src/types';
import { bots, companyOf, config, human } from './helpers';

/** Une partie complète : un humain passif (qui ne fait rien) et quatre bots du niveau demandé. */
function play(seed: number, level: 'normal' | 'expert'): GameState {
  const s = createGame({ ...config(seed), ...(level === 'expert' ? { botLevel: 'expert' as const } : {}) }, [human('h', 'energy_drinks'), ...bots(4)]);
  while (s.phase === 'playing') resolveTurn(s);
  return s;
}

describe('bots « experts » (GameConfig.botLevel = expert, §10)', () => {
  it('le niveau est retenu à la création ; une partie se joue sans valeur aberrante et se rejoue à l’identique', () => {
    const a = play(4, 'expert');
    expect(a.config.botLevel).toBe('expert');
    expect(findNonFinite(a)).toEqual([]);
    const b = play(4, 'expert');
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 30_000);

  it('lancent des produits tôt, tiennent leur jauge de scandale et gardent le contrôle de leur entreprise', () => {
    const s = createGame({ ...config(6), botLevel: 'expert' }, [human('h', 'energy_drinks'), ...bots(4)]);
    for (let t = 0; t < 4; t++) resolveTurn(s);
    const own = Object.values(s.companies).filter((c) => c.founderId && s.players[c.founderId]?.isBot && c.controllerId === c.founderId);
    // Au T5, au moins un expert a élargi sa gamme.
    expect(own.some((c) => c.products.length >= 2)).toBe(true);
    while (s.phase === 'playing') resolveTurn(s);
    for (const c of Object.values(s.companies)) {
      if (c.status !== 'active' || !c.controllerId || !s.players[c.controllerId]?.isBot) continue;
      expect(c.scandal).toBeLessThan(60);
    }
    // Le dirigeant conserve le plus grand bloc joueur ; le financement peut
    // limiter le passage au-dessus de 50 % (teste separement ci-dessous).
    const kept = Object.values(s.companies).filter((c) => c.status === 'active' && c.founderId && s.players[c.founderId]?.isBot && c.controllerId === c.founderId);
    expect(kept.length).toBeGreaterThan(0);
    for (const c of kept) {
      const founder = c.holdings[c.founderId!] ?? 0;
      for (const [playerId, holding] of Object.entries(c.holdings)) if (playerId !== c.founderId) expect(founder).toBeGreaterThanOrEqual(holding);
    }
  });

  it('se calibrent sur les parts de marché observées, sans que cette mémoire sorte dans une vue', () => {
    const s = createGame({ ...config(2), botLevel: 'expert' }, [human('h'), ...bots(3)]);
    for (let t = 0; t < 3; t++) resolveTurn(s);
    const memory = Object.values(s.players).find((p) => p.isBot)!.expertMemory!;
    expect(Object.keys(memory.calib).length).toBeGreaterThan(0);
    for (const e of Object.values(memory.calib)) expect(Math.abs(e.logk)).toBeLessThanOrEqual(DEFAULT_EXPERT_PARAMS.calibBound);
    for (const who of ['h', 'bot1']) {
      const json = JSON.stringify(getPlayerView(s, who));
      expect(json).not.toContain('expertMemory');
      expect(json).not.toContain('logk');
    }
  });

  it('sont nettement plus forts que les bots normaux face au même humain', () => {
    let expertBots = 0;
    let normalBots = 0;
    let humanVsExperts = 0;
    let humanVsNormal = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const e = play(seed, 'expert');
      const n = play(seed, 'normal');
      const botsWorth = (s: GameState) => s.results!.ranking.filter((r) => r.playerId !== 'h').reduce((sum, r) => sum + r.netWorth, 0);
      expertBots += botsWorth(e);
      normalBots += botsWorth(n);
      humanVsExperts += e.results!.ranking.find((r) => r.playerId === 'h')!.netWorth;
      humanVsNormal += n.results!.ranking.find((r) => r.playerId === 'h')!.netWorth;
    }
    expect(expertBots).toBeGreaterThan(normalBots);
    // Plus coriaces, ils laissent aussi moins de place à l'humain passif.
    expect(humanVsExperts).toBeLessThan(humanVsNormal);
  }, 60_000);

  it('un humain peut toujours reprendre la place d’un bot expert : le bot ne joue plus', () => {
    const s = createGame({ ...config(3), botLevel: 'expert', allowBotTakeover: true }, [human('h'), ...bots(3)]);
    resolveTurn(s);
    const bot = s.players.bot1;
    const c = companyOf(s, 'bot1');
    const before = JSON.stringify(c.products.map((p) => [p.price, p.production, p.marketing, p.rnd]));
    expect(bot.isBot).toBe(true);
    s.players.bot1.isBot = false; // reprise (claimBotPlayer) : le bot cesse d'agir dès maintenant
    resolveTurn(s);
    expect(JSON.stringify(companyOf(s, 'bot1').products.slice(0, c.products.length).map((p) => [p.price, p.production, p.marketing, p.rnd]))).toBe(before);
    expect(applyAction(s, 'bot1', { type: 'setProductDecisions', companyId: c.id, productId: c.products[0].id, price: c.products[0].price }).ok).toBe(true);
  });
  it('obtains majority control through real purchases when personal financing is available', () => {
    const state = createGame(config(6), [human('h', 'yogurts')]);
    const company = companyOf(state, 'h');
    const initialHolding = company.holdings.h;
    expect(initialHolding).toBeLessThan(company.sharesOutstanding / 2);
    state.players.h.cash = 50_000;
    // A profitable company trades below its public earnings value: financing
    // and the expert's fair-price condition both permit genuine share purchases.
    company.profitEma = 1000;
    company.sharePrice = 0.25;
    expect(getPlayerView(state, 'h').companies.find((c) => c.id === company.id)!.valuation!.smoothedProfit).toBe(1000);
    const memory: ExpertMemory = { calib: {} };
    const personality = { ...NEUTRAL_PERSONALITY, aggressiveness: 0, shadyPropensity: 0 };
    for (let quarter = 0; quarter < 3; quarter++) {
      expertTurn({ view: () => getPlayerView(state, 'h'), act: (action) => runAction(state, 'h', action),
        memory: () => memory, productName: () => `Financed product ${state.turn}`, startupName: () => 'Financed startup' }, personality);
      resolveTurnWithLog(state);
    }
    expect(company.status).toBe('active');
    expect(company.controllerId).toBe('h');
    expect(company.holdings.h).toBeGreaterThan(company.sharesOutstanding / 2);
    expect(state.players.h.cash).toBeLessThan(50_000);
    expect(state.players.h.debt).toBe(0);
  });

});
