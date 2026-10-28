/**
 * Règles du lot 2 de l'audit de profondeur : flottant minimal, com' de crise qui répare sans embellir,
 * décisions cachées jusqu'à la résolution (prix des rivaux, lancement livré au trimestre suivant),
 * lanceur d'alerte, fusions à 6 produits, start-up de retour en jeu, bots « stagiaires » et aides aux débutants.
 */
import { describe, expect, it } from 'vitest';
import { SECTORS } from '../src/content';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import {
  estimateSales,
  launchPaybackQuarters,
  productAttractiveness,
  valuationPerShare,
} from '../src/sim/advice';
import {
  CRISIS_COMMS_REPUTATION,
  FLOAT_MIN,
  START_BRAND,
  STARTUP_SUBSIDY,
  WHISTLEBLOW_COST,
  WHISTLEBLOW_SCANDAL,
} from '../src/sim/constants';
import { bookValue, floatShares, targetSharePrice } from '../src/sim/finance';
import { SECTOR_IDS, type Action, type GameState } from '../src/types';
import { bots, companyOf, config, human, newGame, npcCompanies, snapshot } from './helpers';

function duo(seed = 11, turns = 16, lang: 'fr' | 'en' = 'fr'): GameState {
  const s = newGame(seed, [human('a', 'energy_drinks', 'Alice'), human('b', 'gadgets', 'Bob')], turns);
  s.config.lang = lang;
  return s;
}

function ok(s: GameState, pid: string, action: Action) {
  const r = applyAction(s, pid, action);
  expect(r.ok, r.message).toBe(true);
  return r;
}

function refused(s: GameState, pid: string, action: Action) {
  const before = snapshot(s);
  const r = applyAction(s, pid, action);
  expect(r.ok).toBe(false);
  expect(snapshot(s)).toBe(before);
  return r.message;
}

function flashes(s: GameState) {
  return s.journal[s.journal.length - 1].articles.filter((x) => x.kind === 'flash');
}

describe('flottant minimal (§6.2)', () => {
  it('on monte à 50 % + 1 action, au-delà seulement si le flottant reste ≥ 40 %', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    s.players.a.cash = 1e6;
    const S = me.sharesOutstanding;
    const half = Math.floor(S / 2) + 1;
    // 40 % détenus, flottant 60 % : jusqu'à 60 % (flottant 40 %) c'est permis.
    const maxStake = S - Math.ceil(FLOAT_MIN * S);
    const msg = refused(s, 'a', { type: 'buyShares', companyId: me.id, shares: maxStake - me.holdings.a + 1 });
    expect(msg).toMatch(/Flottant minimal/);
    expect(msg).toMatch(/2[\s\u202f]000 actions/u); // plus grand achat permis
    ok(s, 'a', { type: 'buyShares', companyId: me.id, shares: maxStake - me.holdings.a });
    expect(floatShares(me)).toBe(Math.ceil(FLOAT_MIN * S));
    // Plus rien au-delà.
    refused(s, 'a', { type: 'buyShares', companyId: me.id, shares: 1 });
    expect(me.holdings.a).toBeGreaterThan(half);
  });

  it('défendre son contrôle jusqu’à 50 % + 1 reste toujours possible', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    s.players.a.cash = 1e6;
    s.players.b.cash = 1e6;
    ok(s, 'b', { type: 'buyShares', companyId: me.id, shares: 4_500 }); // flottant 15 %
    const need = Math.floor(me.sharesOutstanding / 2) + 1 - me.holdings.a;
    refused(s, 'a', { type: 'buyShares', companyId: me.id, shares: need + 1 });
    ok(s, 'a', { type: 'buyShares', companyId: me.id, shares: need });
    expect(me.controllerId).toBe('a');
  });

  it('le rachat d’actions par l’entreprise est borné de la même façon', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    me.cash = 1e6;
    s.players.a.cash = 1e6;
    ok(s, 'a', { type: 'buyShares', companyId: me.id, shares: 1_500 }); // 55 %, flottant 45 %
    const msg = refused(s, 'a', { type: 'buyback', companyId: me.id, shares: 1_000 }); // flottant 3 500 / 9 000 < 40 %
    expect(msg).toMatch(/Flottant minimal/);
    ok(s, 'a', { type: 'buyback', companyId: me.id, shares: 800 }); // 5 500 / 9 200, flottant 3 700 / 9 200 ≥ 40 %
    expect(floatShares(me) / me.sharesOutstanding).toBeGreaterThanOrEqual(FLOAT_MIN - 1e-9);
  });
});

describe('communication de crise : répare, n’embellit pas (§7)', () => {
  it('réputation +0,05 seulement sous 1, sans dépasser 1', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    me.cash = 1e5;
    me.reputation = 1;
    const r = ok(s, 'a', { type: 'crisisComms', companyId: me.id });
    expect(me.reputation).toBe(1);
    expect(r.message).toMatch(/réputation inchangée/);
    resolveTurn(s);
    me.reputation = 0.8;
    ok(s, 'a', { type: 'crisisComms', companyId: me.id });
    expect(me.reputation).toBeCloseTo(0.8 + CRISIS_COMMS_REPUTATION, 9);
    resolveTurn(s);
    me.reputation = 0.98;
    ok(s, 'a', { type: 'crisisComms', companyId: me.id });
    expect(me.reputation).toBeCloseTo(1, 9);
  });
});

describe('décisions cachées jusqu’à la résolution (§12)', () => {
  it('les rivaux voient le prix du trimestre précédent, le contrôleur son prix courant', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const p = me.products[0];
    const old = p.price;
    ok(s, 'a', { type: 'setProductDecisions', companyId: me.id, productId: p.id, price: old * 0.8 });
    const seen = (pid: string) => getPlayerView(s, pid).companies.find((c) => c.id === me.id)!.products[0].price;
    expect(seen('a')).toBeCloseTo(old * 0.8, 9);
    expect(seen('b')).toBeCloseTo(old, 9);
    resolveTurn(s);
    expect(seen('b')).toBeCloseTo(old * 0.8, 9);
  });

  it('un produit lancé est annoncé, mais ne produit et ne vend qu’à partir du trimestre suivant', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    me.cash = 1e5;
    const r = ok(s, 'a', { type: 'launchProduct', companyId: me.id, sectorId: 'yogurts', name: 'Yop' });
    expect(r.message).toMatch(/prochain trimestre/);
    expect(flashes(s).some((f) => f.title.includes('Yop'))).toBe(true);
    const p = me.products[1];
    expect(p.capacity).toBe(0);
    expect(p.pendingCapacity).toBe(SECTORS.yogurts.startingCapacity);
    expect(p.production).toBeGreaterThan(0); // production du trimestre suivant déjà prévue
    const bobSees = getPlayerView(s, 'b').companies.find((c) => c.id === me.id)!.products[1];
    expect(bobSees.comingSoon).toBe(true);
    expect(bobSees.capacity).toBe(0);
    const yogurtRivals = Object.values(s.companies).flatMap((c) => c.products.filter((x) => x.sectorId === 'yogurts' && x.id !== p.id));
    resolveTurn(s);
    expect(p.lastProduced).toBe(0);
    expect(p.lastSales).toBe(0);
    expect(p.lastMarketShare).toBe(0);
    expect(p.capacity).toBe(SECTORS.yogurts.startingCapacity);
    expect(yogurtRivals.some((x) => x.lastSales > 0)).toBe(true);
    resolveTurn(s);
    expect(p.lastProduced).toBeGreaterThan(0);
    expect(p.lastSales).toBeGreaterThan(0);
  });

  it('un bot qui lance un produit le fait produire au trimestre suivant', () => {
    let checked = 0;
    for (let seed = 1; seed <= 12 && checked < 3; seed++) {
      const s = newGame(seed, [human('h'), ...bots(4)], 16);
      const seen = new Map<string, number>();
      while (s.phase === 'playing') {
        for (const c of Object.values(s.companies)) {
          if (c.status !== 'active' || !c.controllerId || !s.players[c.controllerId].isBot) continue;
          for (const p of c.products) if (p.launchedTurn === s.turn && s.turn > 1 && !seen.has(p.id)) seen.set(p.id, s.turn);
        }
        resolveTurn(s);
        for (const [pid, t] of seen) {
          if (s.turn !== t + 2) continue;
          const p = Object.values(s.companies).flatMap((c) => c.products).find((x) => x.id === pid);
          if (!p) continue;
          expect(p.lastProduced, `${seed}:${p.name}`).toBeGreaterThan(0);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('lanceur d’alerte (§7)', () => {
  it('500 k de cash perso, jauge doublée (+15 au plus), niveau publié ; une fois par tour ; jamais sur sa propre entreprise', () => {
    const s = duo();
    const bob = companyOf(s, 'b');
    bob.scandal = 42;
    const cash0 = s.players.a.cash;
    expect(getPlayerView(s, 'a').self).toMatchObject({ startupSubsidy: STARTUP_SUBSIDY, whistleblownThisTurn: false });
    const r = ok(s, 'a', { type: 'whistleblow', companyId: bob.id });
    expect(getPlayerView(s, 'a').self?.whistleblownThisTurn).toBe(true);
    expect(getPlayerView(s, 'b').self?.whistleblownThisTurn).toBe(false);
    expect(bob.scandal).toBe(42 + WHISTLEBLOW_SCANDAL);
    expect(s.players.a.cash).toBeCloseTo(cash0 - WHISTLEBLOW_COST, 9);
    expect(s.players.a.stats.whistleblows).toBe(1);
    expect(r.message).toContain('57/100');
    const flash = flashes(s).at(-1)!;
    expect(flash.title).toContain('57/100');
    expect(flash.title).toContain(bob.name);
    expect(flash.companyIds).toEqual([bob.id]);
    // Le journal ne dit pas qui a parlé.
    expect(flash.title + flash.body).not.toContain('Alice');
    expect(refused(s, 'a', { type: 'whistleblow', companyId: npcCompanies(s)[0].id })).toMatch(/Une seule alerte/);
    // On ne révèle que ce qui existe : la jauge double, dans la limite de +15.
    const npc = npcCompanies(s)[0];
    npc.scandal = 0;
    ok(s, 'b', { type: 'whistleblow', companyId: npc.id });
    expect(npc.scandal).toBe(0);
    resolveTurn(s);
    npc.scandal = 6;
    ok(s, 'b', { type: 'whistleblow', companyId: npc.id });
    expect(npc.scandal).toBe(12);
    expect(refused(s, 'b', { type: 'whistleblow', companyId: bob.id })).toMatch(/Dénoncer/);
    resolveTurn(s);
    ok(s, 'a', { type: 'whistleblow', companyId: npcCompanies(s)[1].id });
  });

  it('refusée sans cash perso ou sur une entreprise disparue, en anglais aussi', () => {
    const s = duo(11, 16, 'en');
    const bob = companyOf(s, 'b');
    s.players.a.cash = WHISTLEBLOW_COST - 1;
    expect(refused(s, 'a', { type: 'whistleblow', companyId: bob.id })).toMatch(/personal cash/);
    s.players.a.cash = 1e4;
    refused(s, 'a', { type: 'whistleblow', companyId: 'nope' });
    bob.status = 'bankrupt';
    refused(s, 'a', { type: 'whistleblow', companyId: bob.id });
    bob.status = 'active';
    ok(s, 'a', { type: 'whistleblow', companyId: bob.id });
    expect(flashes(s).at(-1)!.title).toMatch(/\/100/);
  });

  it('les bots s’en servent contre les leaders sulfureux', () => {
    let used = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = newGame(seed, bots(5), 16);
      while (s.phase === 'playing') resolveTurn(s);
      for (const p of Object.values(s.players)) used += p.stats.whistleblows ?? 0;
    }
    expect(used).toBeGreaterThan(0);
  });
});

describe('start-up de retour en jeu (§7)', () => {
  it('réservée au joueur sans entreprise ; subvention = max(1 000 k, parachute), consommée à la fondation', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    me.cash = 40_000; // parachute = 5 % du cash = 2 000 k
    refused(s, 'a', { type: 'foundStartup', name: 'Filiale', sectorId: 'yogurts', investment: 1_500 });
    s.players.b.cash = 1e6;
    ok(s, 'b', { type: 'buyShares', companyId: me.id, shares: 5_001 });
    expect(me.controllerId).toBe('b');
    expect(s.players.a.comebackGrant).toBeCloseTo(2_000, 6);
    expect(getPlayerView(s, 'a').self?.startupSubsidy).toBeCloseTo(2_000, 6);
    resolveTurn(s);
    s.players.a.cash = Math.max(s.players.a.cash, 2_000);
    ok(s, 'a', { type: 'foundStartup', name: 'Revanche', sectorId: 'yogurts', investment: 1_500 });
    const st = Object.values(s.companies).find((c) => c.name === 'Revanche')!;
    expect(st.cash).toBeCloseTo(1_500 + 2_000, 6);
    expect(s.players.a.comebackGrant).toBeUndefined();
    // La start-up vend dès sa création (ce n'est pas un lancement).
    expect(st.products[0].capacity).toBeGreaterThan(0);
  });

  it('sans parachute (faillite), la subvention vaut 1 000 k', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    me.status = 'bankrupt';
    me.controllerId = null;
    resolveTurn(s);
    ok(s, 'a', { type: 'foundStartup', name: 'Phénix', sectorId: 'crypto', investment: 1_500 });
    const st = Object.values(s.companies).find((c) => c.name === 'Phénix')!;
    expect(st.cash).toBeCloseTo(1_500 + STARTUP_SUBSIDY, 6);
  });
});

describe('bots « stagiaires » (GameConfig.botLevel)', () => {
  it('les yaourts de départ ont une clientèle établie ; les nouveaux produits doivent la construire', () => {
    const s = createGame(config(11), [human('h', 'yogurts')]);
    const c = companyOf(s, 'h');
    expect(c.products[0].brand).toBe(SECTORS.yogurts.startingBrand);
    expect(c.products[0].brand).toBeGreaterThan(START_BRAND);
    const productIds = new Set(c.products.map((p) => p.id));
    c.cash = 100_000;
    ok(s, 'h', { type: 'launchProduct', companyId: c.id, sectorId: 'yogurts', name: 'Nouvelle clientèle' });
    const entrant = c.products.find((p) => !productIds.has(p.id))!;
    expect(entrant.brand).toBe(START_BRAND);
    expect(entrant.capacity).toBe(0);
    expect(entrant.pendingCapacity).toBe(SECTORS.yogurts.startingCapacity);
  });

  it('prix de référence, aucun lancement, ni OPA, ni action discutable, ni alerte', () => {
    for (const seed of [1, 2, 3]) {
      const s = createGame({ ...config(seed), botLevel: 'intern' }, [human('h'), ...bots(4)]);
      while (s.phase === 'playing') resolveTurn(s);
      for (const p of Object.values(s.players).filter((x) => x.isBot)) {
        expect(p.stats.shadyActions).toBe(0);
        expect(p.stats.takeoversWon).toBe(0);
        expect(p.stats.whistleblows ?? 0).toBe(0);
        expect(p.stats.startupsFounded).toBe(0);
      }
      for (const c of Object.values(s.companies)) {
        if (!c.founderId || !s.players[c.founderId].isBot || c.controllerId !== c.founderId) continue;
        expect(c.products).toHaveLength(1);
        expect(c.products[0].price).toBeCloseTo(SECTORS[c.products[0].sectorId].refPrice, 9);
      }
    }
  });

  it.each(SECTOR_IDS)('un débutant passif en %s bat les stagiaires du salon par défaut plus souvent que les bots normaux', (sectorId) => {
    let internWins = 0;
    let normalWins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (const level of ['intern', 'normal'] as const) {
        // The first sector is the lobby default (energy drinks), preserved by
        // this matrix. All sectors face the same ordinary three-bot line-up.
        const s = createGame({ ...config(seed), botLevel: level }, [human('h', sectorId), ...bots(3)]);
        // Le « débutant » cale seulement sa production sur ses ventes ; le prix
        // et les budgets restent aux réglages de départ de son secteur.
        while (s.phase === 'playing') {
          // Racheté par un bot, le débutant n'a plus rien à régler : la partie continue sans lui.
          const c = Object.values(s.companies).find((x) => x.controllerId === 'h' && x.status === 'active');
          for (const p of c?.products ?? []) {
            const prod = p.lastSales > 0 ? Math.min(p.capacity, Math.round(p.lastSales * 1.1)) : p.production;
            applyAction(s, 'h', { type: 'setProductDecisions', companyId: c!.id, productId: p.id, production: prod });
          }
          resolveTurn(s);
        }
        const first = s.results!.ranking[0].playerId === 'h';
        if (level === 'intern' && first) internWins++;
        if (level === 'normal' && first) normalWins++;
      }
    }
    expect(internWins).toBeGreaterThan(normalWins);
    expect(internWins).toBeGreaterThanOrEqual(5);
  });

  it.each(SECTOR_IDS)('les réglages de départ de %s permettent aussi de battre les stagiaires sans aucune action', (sectorId) => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = createGame({ ...config(seed), botLevel: 'intern' }, [human('h', sectorId), ...bots(3)]);
      // Fully passive: even production stays at its initial value. This guards
      // against defaults that need an unadvertised intervention to remain viable.
      while (s.phase === 'playing') resolveTurn(s);
      if (s.results!.ranking[0].playerId === 'h') wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(5);
  });
});

describe('aides aux débutants (vue et fonctions exportées)', () => {
  it('estimation des ventes : même attractivité que la résolution, décroissante avec le prix', () => {
    const s = duo();
    const me = companyOf(s, 'a');
    const pv = getPlayerView(s, 'a').companies.find((c) => c.id === me.id)!.products[0];
    expect(pv.private!.estimate).toBeDefined();
    expect(pv.private!.market).toBeDefined();
    const market = pv.private!.market!;
    const base = { quality: pv.quality, brand: pv.brand, production: pv.private!.production, capacity: pv.capacity, stock: pv.private!.stock, marketing: pv.private!.marketing, rnd: pv.private!.rnd };
    const at = (price: number) => estimateSales(pv.sectorId, market, { ...base, price });
    expect(at(pv.price)).toEqual(pv.private!.estimate);
    expect(at(pv.price * 1.2).demand).toBeLessThan(at(pv.price).demand);
    expect(at(pv.price * 0.8).demand).toBeGreaterThan(at(pv.price).demand);
    // Les autres ne voient pas l'estimation.
    expect(getPlayerView(s, 'b').companies.find((c) => c.id === me.id)!.products[0].private).toBeUndefined();
    expect(productAttractiveness('energy_drinks', 1, 0.3, 1, SECTORS.energy_drinks.refPrice)).toBeCloseTo(0.8, 9);
  });

  it('l’estimation colle en moyenne aux ventes réalisées', () => {
    const ratios: number[] = [];
    for (let seed = 1; seed <= 15; seed++) {
      const s = duo(seed);
      for (let t = 0; t < 3; t++) {
        const me = companyOf(s, 'a');
        const est = getPlayerView(s, 'a').companies.find((c) => c.id === me.id)!.products[0].private!.estimate!;
        resolveTurn(s);
        const wanted = me.products[0].lastSales;
        if (est.sales > 0 && wanted > 0) ratios.push(wanted / est.sales);
      }
    }
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(ratios.length).toBeGreaterThan(20);
    expect(mean).toBeGreaterThan(0.8);
    expect(mean).toBeLessThan(1.2);
  });

  it('rentabilité d’un lancement et relation cours / bénéfice', () => {
    expect(launchPaybackQuarters(4_000, 1_000)).toBe(5); // 1 trimestre d'attente + 4
    expect(launchPaybackQuarters(4_000, 3_000)).toBe(3);
    expect(launchPaybackQuarters(4_000, 0)).toBeNull();
    expect(launchPaybackQuarters(4_000, -10)).toBeNull();
    const s = duo();
    const v = getPlayerView(s, 'b');
    for (const sec of v.sectors) {
      expect(sec.launchEstimate).toBeDefined();
      const e = sec.launchEstimate!;
      if (e.quarterlyProfit > 0) expect(e.paybackQuarters).toBe(launchPaybackQuarters(sec.launchCost, e.quarterlyProfit));
      else expect(e.paybackQuarters).toBeNull();
    }
    expect(v.sectors.some((x) => x.launchEstimate!.paybackQuarters !== null)).toBe(true);
    expect(valuationPerShare(1_000, 100, 10)).toBeCloseTo(500, 9);
    expect(valuationPerShare(1_000, -100, 10)).toBeCloseTo(20, 9);
    // Sans croissance ni sentiment, la relation exportée donne la cible du cours.
    const me = companyOf(s, 'a');
    const cv = v.companies.find((c) => c.id === me.id)!;
    expect(cv.valuation!.bookValue).toBeCloseTo(bookValue(me), 6);
    expect(cv.valuation!.perShare).toBeCloseTo(targetSharePrice(s, me) / (me.sentiment * s.macro.marketSentiment), 6);
    expect(cv.maxProducts).toBe(4);
  });
});
