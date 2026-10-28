import { describe, expect, it } from 'vitest';
import {
  allHumansReady,
  applyAction,
  cancelPendingBotClaim,
  claimBotPlayer,
  createGame,
  DEFAULT_CONFIG,
  getPlayerView,
  resolveTurn,
  SECTORS,
  setPlayerConnected,
  setPlayerReady,
  type GameState,
  type Lang,
} from '../src/index';
import { bots, companyOf, config, human, npcCompanies, snapshot } from './helpers';

function setup(lang: Lang = 'fr', botCount = 2): GameState {
  return createGame({ ...config(71), lang, allowBotTakeover: true }, [human('host', 'gadgets', 'Hôte'), ...bots(botCount)]);
}

function clone(state: GameState): GameState {
  return JSON.parse(snapshot(state)) as GameState;
}

function refuse(state: GameState, playerId: string, name: unknown): string {
  const before = snapshot(state);
  const result = claimBotPlayer(state, playerId, name as string);
  expect(result.ok).toBe(false);
  expect(result.message.length).toBeGreaterThan(0);
  expect(snapshot(state)).toBe(before);
  return result.message;
}

describe('reprise d’un bot au trimestre suivant', () => {
  it('est désactivée par défaut, et seule la valeur true active l’option', () => {
    expect(DEFAULT_CONFIG.allowBotTakeover).toBe(false);
    for (const option of [undefined, false, 'true', 1]) {
      const state = createGame({ ...config(71), allowBotTakeover: option as boolean }, [human('host'), ...bots(1)]);
      expect(state.config.allowBotTakeover).toBe(false);
      refuse(state, 'bot1', 'Alice');
    }
    const state = setup();
    expect(state.config.allowBotTakeover).toBe(true);
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
  });

  it('conserve tout le patrimoine, les références, les compteurs consommés, l’historique et le RNG', () => {
    const state = setup();
    const bot = state.players.bot1;
    const company = companyOf(state, bot.id);
    const acquired = npcCompanies(state)[0];
    acquired.controllerId = bot.id;
    acquired.ceoName = bot.name;
    acquired.holdings[bot.id] = 5_001;
    bot.cash = 1_234.56;
    bot.debt = 234.5;
    bot.lastWhistleblowTurn = state.turn;
    bot.lastOustedTurn = state.turn - 1;
    bot.comebackGrant = 789.12;
    bot.stats.whistleblows = 3;
    bot.stats.takeoversWon = 2;
    bot.stats.bonusesTaken = 103.4;
    bot.netWorthHistory.push(5_000, 6_000);
    company.turnFlags = {
      bonusTaken: 103.4, buybackDone: true, shadyDone: ['greenwashing'], borrowed: 100,
      lockedShares: { [bot.id]: 500 }, insiderBought: { [bot.id]: 100 },
      exControllers: ['host'], crisisDone: true, specialCharges: 42,
    };
    company.inventory.oil = { lots: 23.4, avgCost: 1.23 };
    company.modifiers.push({ kind: 'offshoring', turnsLeft: 3 });
    const before = clone(state);
    const expected = clone(state);
    const originalName = bot.name;
    Object.assign(expected.players.bot1, {
      name: 'Alice Smith', isBot: false, connected: true, ready: false,
      botTakeover: { previousName: originalName, activeFromTurn: state.turn + 1 },
    });
    for (const c of Object.values(expected.companies)) if (c.controllerId === bot.id) c.ceoName = 'Alice Smith';
    const refs = {
      players: state.players, companies: state.companies, player: bot, stats: bot.stats,
      history: bot.netWorthHistory, company, holdings: company.holdings, flags: company.turnFlags,
      products: company.products, product: company.products[0], journal: state.journal,
    };

    expect(claimBotPlayer(state, bot.id, '  Alice\t Smith  ').ok).toBe(true);

    expect(state).toEqual(expected);
    expect(state.rngState).toBe(before.rngState);
    expect(Object.keys(state.players)).toEqual(Object.keys(before.players));
    expect(state.players).toBe(refs.players);
    expect(state.companies).toBe(refs.companies);
    expect(state.players.bot1).toBe(refs.player);
    expect(bot.stats).toBe(refs.stats);
    expect(bot.netWorthHistory).toBe(refs.history);
    expect(state.companies[company.id]).toBe(refs.company);
    expect(company.holdings).toBe(refs.holdings);
    expect(company.turnFlags).toBe(refs.flags);
    expect(company.products).toBe(refs.products);
    expect(company.products[0]).toBe(refs.product);
    expect(state.journal).toBe(refs.journal);
    expect(bot.botPersonalityId).toBe(before.players.bot1.botPersonalityId);
  });

  it('bloque actions personnelles, décisions, achats et validation pendant l’attente, sans aucun effet', () => {
    const state = setup();
    const company = companyOf(state, 'bot1');
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
    const before = snapshot(state);
    const actions = [
      { type: 'takePersonalLoan' as const, amount: 1 },
      { type: 'setProductDecisions' as const, companyId: company.id, productId: company.products[0].id, price: 12 },
      { type: 'buyCommodity' as const, companyId: company.id, commodityId: 'oil' as const, lots: 1 },
    ];
    for (const action of actions) {
      expect(applyAction(state, 'bot1', action)).toMatchObject({ ok: false, message: expect.stringContaining('trimestre 2') });
      expect(snapshot(state)).toBe(before);
    }
    setPlayerReady(state, 'bot1', true);
    expect(state.players.bot1.ready).toBe(false);
    expect(snapshot(state)).toBe(before);
    refuse(state, 'bot1', 'Autre personne');
  });

  it('ne fait pas attendre les humains actifs et ne déclenche pas seul une résolution', () => {
    const state = setup();
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
    expect(allHumansReady(state)).toBe(false);
    setPlayerReady(state, 'host', true);
    expect(allHumansReady(state)).toBe(true);
    setPlayerConnected(state, 'host', false);
    expect(allHumansReady(state)).toBe(false);
  });

  it('active le joueur au tour suivant, sans décision automatique ni tirage RNG supplémentaire', () => {
    const state = setup('fr', 1);
    const ordinaryHuman = clone(state);
    const player = ordinaryHuman.players.bot1;
    Object.assign(player, { name: 'Alice', isBot: false, connected: true, ready: false });
    for (const c of Object.values(ordinaryHuman.companies)) if (c.controllerId === player.id) c.ceoName = player.name;
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
    const takeover = { ...state.players.bot1.botTakeover! };
    resolveTurn(state);
    resolveTurn(ordinaryHuman);
    expect(state.turn).toBe(takeover.activeFromTurn);
    ordinaryHuman.players.bot1.botTakeover = takeover;
    expect(state).toEqual(ordinaryHuman);
    expect(state.rngState).toBe(ordinaryHuman.rngState);
    setPlayerReady(state, 'host', true);
    expect(allHumansReady(state)).toBe(false);
    setPlayerReady(state, 'bot1', true);
    expect(allHumansReady(state)).toBe(true);
    const company = companyOf(state, 'bot1');
    const price = SECTORS[company.products[0].sectorId].refPrice;
    expect(applyAction(state, 'bot1', {
      type: 'setProductDecisions', companyId: company.id, productId: company.products[0].id, price,
    }).ok).toBe(true);
    expect(company.products[0].price).toBe(price);
    const beforeCancel = snapshot(state);
    expect(cancelPendingBotClaim(state, 'bot1')).toBe(false);
    expect(snapshot(state)).toBe(beforeCancel);
  });

  it('refuse humains, identifiants inconnus, partie terminée et dernier trimestre sans mutation', () => {
    const state = setup();
    for (const id of ['host', 'absent', '__proto__', 'constructor']) refuse(state, id, 'Alice');
    state.turn = state.config.totalTurns;
    refuse(state, 'bot1', 'Alice');
    state.phase = 'finished';
    refuse(state, 'bot1', 'Alice');
  });

  it('refuse les noms vides, non textuels et déjà utilisés, avec comparaison Unicode et de casse', () => {
    const state = setup();
    for (const name of ['', ' \n\t ', '\u0000\u0001', null, undefined, 7, {}, 'hÔte', 'Ho\u0302te']) {
      refuse(state, 'bot1', name);
    }
    // Le nom du bot ciblé reste utilisable, puisqu’aucun autre joueur ne le porte.
    const ownName = state.players.bot1.name;
    expect(claimBotPlayer(state, 'bot1', ownName).ok).toBe(true);
    expect(state.players.bot1.name).toBe(ownName);
  });

  it('réserve le nom précédent pendant l’attente pour permettre une annulation sans doublon', () => {
    const state = setup();
    const previousName = state.players.bot1.name;
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
    refuse(state, 'bot2', previousName.toLocaleUpperCase('fr'));
    expect(cancelPendingBotClaim(state, 'bot1')).toBe(true);
    refuse(state, 'bot2', previousName);
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
    resolveTurn(state);
    expect(claimBotPlayer(state, 'bot2', previousName).ok).toBe(true);
  });

  it.each(['fr', 'en'] as const)('localise les confirmations et refus en %s', (lang) => {
    const state = setup(lang);
    const term = lang === 'fr' ? 'trimestre' : 'quarter';
    expect(claimBotPlayer(state, 'bot1', 'Alice').message).toContain(`${term} 2`);
    expect(applyAction(state, 'bot1', { type: 'takePersonalLoan', amount: 1 }).message).toContain(`${term} 2`);
    state.turn = state.config.totalTurns;
    expect(refuse(state, 'bot2', 'Bob')).toContain(term);
  });
});

describe('annulation d’une reprise en attente', () => {
  it('restaure exactement l’état précédent sans rejouer de bot, y compris après une sérialisation JSON', () => {
    const state = setup();
    const untouched = clone(state);
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
    const restored = clone(state);
    setPlayerConnected(restored, 'bot1', false);
    expect(cancelPendingBotClaim(restored, 'bot1')).toBe(true);
    expect(restored).toEqual(untouched);
    expect(cancelPendingBotClaim(restored, 'bot1')).toBe(false);
    resolveTurn(restored);
    resolveTurn(untouched);
    expect(restored).toEqual(untouched);
  });

  it('ne rembobine pas le patrimoine, les compteurs ni les changements de contrôle survenus pendant l’attente', () => {
    const state = setup();
    const previousName = state.players.bot1.name;
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
    const sold = companyOf(state, 'bot1');
    sold.controllerId = 'host';
    sold.ceoName = state.players.host.name;
    sold.holdings.host = 5_001;
    const acquired = npcCompanies(state)[0];
    acquired.controllerId = 'bot1';
    acquired.ceoName = 'Alice';
    state.players.bot1.cash += 45.5;
    state.players.bot1.stats.dividendsReceived += 45.5;
    state.players.bot1.lastWhistleblowTurn = state.turn;
    acquired.turnFlags.bonusTaken += 100;
    const expected = clone(state);
    Object.assign(expected.players.bot1, { name: previousName, isBot: true, connected: true, ready: false });
    delete expected.players.bot1.botTakeover;
    expected.companies[acquired.id].ceoName = previousName;
    expect(cancelPendingBotClaim(state, 'bot1')).toBe(true);
    expect(state).toEqual(expected);
    expect(sold.ceoName).toBe(state.players.host.name);
  });

  it('refuse les joueurs sans reprise et les reprises déjà activées ou terminées sans effet', () => {
    const state = setup();
    const before = snapshot(state);
    for (const id of ['host', 'bot1', 'absent', '__proto__', 'constructor']) {
      expect(cancelPendingBotClaim(state, id)).toBe(false);
      expect(snapshot(state)).toBe(before);
    }
    claimBotPlayer(state, 'bot1', 'Alice');
    state.phase = 'finished';
    const finished = snapshot(state);
    expect(cancelPendingBotClaim(state, 'bot1')).toBe(false);
    expect(snapshot(state)).toBe(finished);
  });
});

describe('confidentialité d’une place réservée', () => {
  it('garde uniquement l’identité publique pendant l’attente, comme la vue d’un spectateur', () => {
    const state = setup();
    const bot = state.players.bot1;
    const company = companyOf(state, bot.id);
    const product = company.products[0];
    company.scandal = 43;
    company.modifiers.push({ kind: 'lobbying', turnsLeft: 2, sectorId: product.sectorId, value: 1.5 });
    company.modifiers.push({ kind: 'greenwashing', turnsLeft: 1 });
    product.lastPrice = 10;
    product.price = 20;
    bot.stats.whistleblows = 3;
    bot.stats.shadyActions = 8;
    bot.lastWhistleblowTurn = state.turn;
    bot.comebackGrant = 987.6;
    const previousName = bot.name;
    expect(claimBotPlayer(state, bot.id, 'Alice').ok).toBe(true);
    const view = getPlayerView(state, bot.id);
    const spectator = getPlayerView(state, 'spectator');
    expect(view).toEqual({ ...spectator, you: bot.id });
    const publicBot = view.players.find((p) => p.id === bot.id)!;
    expect(publicBot.name).toBe('Alice');
    expect(publicBot.botTakeover).toEqual({ previousName, activeFromTurn: 2 });
    expect(publicBot.stats.whistleblows).toBeUndefined();
    expect(publicBot.stats.shadyActions).toBe(0);
    // La personnalité reste publique (elle l'est déjà au salon, §11) : ce ne sont pas des données internes du bot.
    expect(publicBot.botPersonalityId).toBe(bot.botPersonalityId);
    expect(view.personalLoanLimit).toBe(0);
    expect(view.self).toBeUndefined();
    expect(view.companies.every((c) => !c.private && c.products.every((p) => !p.private))).toBe(true);
    expect(view.companies.find((c) => c.id === company.id)!.products[0].price).toBe(10);
    expect(view.config.seed).toBe(0);
    expect(view).not.toHaveProperty('rngState');
    // Variations de secrets sans conséquence publique : la vue doit rester strictement identique.
    product.price = 50;
    product.production += 1;
    product.marketing += 10;
    product.rnd += 20;
    company.scandal = 44;
    company.modifiers[company.modifiers.length - 2].value = 2;
    bot.stats.whistleblows += 1;
    bot.stats.shadyActions += 1;
    bot.lastWhistleblowTurn = 0;
    bot.comebackGrant += 100;
    expect(getPlayerView(state, bot.id)).toEqual(view);
  });

  it('annuler puis réserver un autre bot ne révèle aucune de leurs données privées', () => {
    const state = setup();
    const before = snapshot(state);
    for (const id of ['bot1', 'bot2', 'bot1']) {
      expect(claimBotPlayer(state, id, 'Alice').ok).toBe(true);
      expect(getPlayerView(state, id)).toEqual({ ...getPlayerView(state, 'spectator'), you: id });
      expect(cancelPendingBotClaim(state, id)).toBe(true);
      expect(snapshot(state)).toBe(before);
    }
  });

  it('donne les accès privés normaux dès l’activation et conserve la métadonnée publique', () => {
    const state = setup('fr', 1);
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
    resolveTurn(state);
    const company = companyOf(state, 'bot1');
    state.players.bot1.stats.whistleblows = 4;
    company.products[0].price = 20;
    company.products[0].lastPrice = 10;
    const view = getPlayerView(state, 'bot1');
    const own = view.companies.find((c) => c.id === company.id)!;
    expect(own.private).toBeDefined();
    expect(own.products[0].private).toBeDefined();
    expect(own.products[0].price).toBe(20);
    expect(view.self).toBeDefined();
    expect(view.personalLoanLimit).toBeGreaterThan(0);
    expect(view.players.find((p) => p.id === 'bot1')!.stats.whistleblows).toBe(4);
    expect(view.players.find((p) => p.id === 'bot1')!.botTakeover?.activeFromTurn).toBe(2);
    const hostView = getPlayerView(state, 'host');
    expect(hostView.companies.find((c) => c.id === company.id)!.private).toBeUndefined();
    expect(hostView.players.find((p) => p.id === 'bot1')!.stats.whistleblows).toBeUndefined();
  });

  it('copie seulement les champs publics de la reprise et isole le marqueur de l’état moteur', () => {
    const state = setup();
    expect(claimBotPlayer(state, 'bot1', 'Alice').ok).toBe(true);
    const metadata = state.players.bot1.botTakeover!;
    Object.assign(metadata, { hidden: 'do not leak' });
    const view = getPlayerView(state, 'host');
    const marker = view.players.find((p) => p.id === 'bot1')!.botTakeover!;
    expect(Object.keys(marker).sort()).toEqual(['activeFromTurn', 'previousName']);
    marker.previousName = 'Edited';
    marker.activeFromTurn = 99;
    expect(metadata.previousName).not.toBe('Edited');
    expect(metadata.activeFromTurn).toBe(2);
  });
});
