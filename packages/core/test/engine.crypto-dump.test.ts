/**
 * Dump crypto des bots et brèves « délit d'initié » (revue crypto d'octobre 2026) : les signaux de sortie
 * se lisent dans la seule vue du joueur (journal, rumeurs avec fiabilité affichée, demande réalisée, cote),
 * jamais dans l'état caché de la bulle ; les ventes massives du trimestre précédent font les brèves au krach.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { getContent } from '../src/content';
import { applyAction, createGame, getPlayerView } from '../src/engine';
import { expertTurn, type BotIO } from '../src/sim/botExpert';
import { NEUTRAL_PERSONALITY, runBots, setBotZoneMode } from '../src/sim/bots';
import { CRYPTO_INSIDER_SCANDAL, cryptoInsiderSaleBriefs } from '../src/sim/cryptoMarket';
import { cryptoDumpSignals } from '../src/sim/cryptoSignals';
import { textsFor } from '../src/sim/i18n';
import { executeShareSell } from '../src/sim/market';
import { marginCall } from '../src/sim/resolve';
import { startTurn } from '../src/sim/turn';
import type { Action, ActionResult, Article, CompanyState, GameState, JournalIssue, ProductState } from '../src/types';
import { bots, companyOf, config, human, snapshot } from './helpers';

afterEach(() => setBotZoneMode('market'));

const FR = getContent('fr');
const crashCard = FR.newsCards.find((c) => c.id === 'crypto_crash_founders')!;
const euphoriaCard = FR.newsCards.find((c) => c.id === 'crypto_bubble_fomo')!;
const fakeCrashRumor = FR.fakeRumors.find((f) => f.id.startsWith('fake_crypto_crash'))!;

function article(title: string, tone: Article['tone'] = 'bad'): Article {
  return { id: `test:${title.slice(0, 12)}`, title, body: ' Corps de test. ', tone, kind: 'headline' };
}

function issue(partial: Partial<JournalIssue>, turn = 1): JournalIssue {
  return { turn, dateLabel: `T${turn} 2027`, articles: [], rumors: [], ...partial };
}

/** Refus standard des décisions hors du champ du banc d'essai (vue relue à chaque appel). */
const refuse = (): ActionResult => ({ ok: false, message: 'Décision isolée du banc d’essai.' });

// ---------------------------------------------------------------------------
// Signaux lus sur la vue seule
// ---------------------------------------------------------------------------

/** Euphorie publiée + fausse rumeur de krach « élevée » + demande en hausse + cours triplés : score 0,95. */
function signalFixture(): GameState {
  const state = createGame(config(9, 8), [human('a', 'crypto'), human('b', 'crypto')]);
  const c = companyOf(state, 'a');
  // 6 000 / 10 000 : au-dessus du plancher de contrôle (5 200), la vente du magnat reste possible.
  c.holdings = { a: 6000 };
  c.priceHistory = [1, 1, 1, 1, 1];
  c.sharePrice = 3;
  state.sectors.crypto.demandHistory = [100, 110, 120];
  state.journal.push(issue({
    articles: [article(euphoriaCard.headline, 'good')],
    rumors: [{ text: fakeCrashRumor.text, reliability: 'élevée' }],
  }));
  return state;
}

/** Modifie l'état caché de la bulle : bulle, krach programmé au prochain tour, origine des rumeurs. */
function mutateHidden(state: GameState): void {
  state.cryptoMarket = { momentum: 0.9, bubble: 2.5, volatility: 0.7, lastGrowth: 0.4, cooldown: 0 };
  state.scheduledNews = [{ turn: state.turn + 1, cardId: 'crypto_crash_founders' }];
  state.rumorKeys = { [state.turn]: ['news:crypto_crash_founders'] };
}

/** Décisions d'un magnat enregistrées sans être appliquées : la vue reste la même du début à la fin. */
function expertDecisions(state: GameState, playerId: string): Action[] {
  const actions: Action[] = [];
  const io: BotIO = {
    view: () => getPlayerView(state, playerId),
    act: (action) => { actions.push(action); return refuse(); },
    memory: () => ({ calib: {} }),
    productName: () => 'Produit test',
    startupName: () => 'Startup test',
  };
  expertTurn(io, NEUTRAL_PERSONALITY);
  return actions;
}

describe('signaux du cycle crypto : la vue seule décide', () => {
  it('reconnaît euphorie, fausse rumeur de krach, demande en hausse et envolée des cours', () => {
    const sig = cryptoDumpSignals(getPlayerView(signalFixture(), 'a'), 'fr');
    expect(sig.euphoriaNow).toBe(true);
    expect(sig.crashNow).toBe(false);
    expect(sig.crashRumor).toEqual({ reliability: 'élevée' });
    expect(sig.demandRising).toBe(true);
    expect(sig.demandFading).toBe(false);
    expect(sig.priceRunUp).toBe(3);
    expect(sig.score).toBeCloseTo(0.95, 10);
  });

  it('une vraie rumeur de krach et son sosie du pool des fausses sont indiscernables', () => {
    const state = signalFixture();
    state.journal[state.journal.length - 1].rumors = [{ text: crashCard.rumor!, reliability: 'moyenne' }];
    const real = cryptoDumpSignals(getPlayerView(state, 'a'), 'fr');
    state.journal[state.journal.length - 1].rumors = [{ text: fakeCrashRumor.text, reliability: 'moyenne' }];
    expect(cryptoDumpSignals(getPlayerView(state, 'a'), 'fr')).toEqual(real);
    expect(real.crashRumor).toEqual({ reliability: 'moyenne' });
  });

  it('l’état caché de la bulle ne change ni la vue, ni les signaux, ni les décisions du magnat', () => {
    const state = signalFixture();
    const view = getPlayerView(state, 'a');
    const signals = cryptoDumpSignals(view, 'fr');
    const decisions = expertDecisions(state, 'a');
    expect(decisions.some((a) => a.type === 'sellShares')).toBe(true);
    const mutated = structuredClone(state);
    mutateHidden(mutated);
    expect(getPlayerView(mutated, 'a')).toEqual(view);
    expect(cryptoDumpSignals(getPlayerView(mutated, 'a'), 'fr')).toEqual(signals);
    expect(expertDecisions(mutated, 'a')).toEqual(decisions);
  });
});

// ---------------------------------------------------------------------------
// Panique des petits patrons
// ---------------------------------------------------------------------------

/** Un bot normal contrôle une entreprise crypto (600/1000) dont le krach fait la une du jour. */
function crashDumpScenario(): GameState {
  setBotZoneMode('capital');
  const bot = { ...bots(1)[0], sectorId: 'crypto' as const };
  const state = createGame(config(13, 8), [human('h', 'yogurts'), bot]);
  const c = companyOf(state, 'bot1');
  c.sharesOutstanding = 1000;
  c.holdings = { bot1: 600 };
  c.controllerId = 'bot1';
  c.cash = 100;
  delete c.turnFlags.justFounded;
  c.products[0].lastRevenue = 10;
  const twin: ProductState = { ...structuredClone(c.products[0]), id: 'crypto-bis', name: 'Crypto Bis', lastRevenue: 500 };
  c.products.push(twin);
  state.journal.push(issue({ articles: [article(crashCard.headline)] }, state.turn));
  runBots(state);
  return state;
}

describe('petits patrons : vente en panique au krach publié', () => {
  it('liquide 85 % en gardant le contrôle, et arrête un produit crypto — actions acceptées par le moteur', () => {
    const state = crashDumpScenario();
    const c = companyOf(state, 'bot1');
    // Plafond « garder le contrôle » : 501 actions sur 1000, la défense rachèterait sinon dans le même tour.
    expect(c.holdings.bot1).toBe(501);
    expect(c.controllerId).toBe('bot1');
    // Le produit au plus petit CA est arrêté impulsivement ; l'autre survit (jamais le dernier produit).
    expect(c.products.map((p) => p.id)).toEqual(['crypto-bis']);
    expect(state.players.bot1.cryptoPanicCloseUsed).toBe(true);
  });

  it('le même scénario rejoué deux fois donne le même état, au bit près', () => {
    expect(snapshot(crashDumpScenario())).toBe(snapshot(crashDumpScenario()));
  });
});

// ---------------------------------------------------------------------------
// Une seule fermeture impulsive par partie
// ---------------------------------------------------------------------------

/** Rumeur de krach « élevée », demande qui se retourne et cours triplés : les conditions de panique. */
function panicFixture(singleProduct: boolean): GameState {
  setBotZoneMode('capital');
  const bot = { ...bots(1)[0], sectorId: 'crypto' as const };
  const state = createGame(config(17, 8), [human('h', 'yogurts'), bot]);
  const c = companyOf(state, 'bot1');
  delete c.turnFlags.justFounded;
  c.priceHistory = [1, 1, 1, 1, 1];
  c.sharePrice = 3;
  if (!singleProduct) {
    c.products[0].lastRevenue = 500;
    c.products.push({ ...structuredClone(c.products[0]), id: 'crypto-faible', name: 'Crypto Faible', lastRevenue: 10 });
  }
  state.sectors.crypto.demandHistory = [100, 110, 90];
  state.journal.push(issue({ rumors: [{ text: crashCard.rumor!, reliability: 'élevée' }] }, state.turn));
  return state;
}

describe('petits patrons : une seule fermeture impulsive par partie', () => {
  it('un deuxième tour de panique ne ferme pas un second produit', () => {
    const state = panicFixture(false);
    const c = companyOf(state, 'bot1');
    runBots(state);
    expect(state.players.bot1.cryptoPanicCloseUsed).toBe(true);
    expect(c.products.map((p) => p.id)).not.toContain('crypto-faible');
    expect(c.products).toHaveLength(1);
    runBots(state); // la panique persiste (même numéro lu), le drapeau empêche une seconde fermeture
    expect(c.products).toHaveLength(1);
    expect(state.players.bot1.cryptoPanicCloseUsed).toBe(true);
  });

  it('le dernier produit d’une entreprise n’est jamais arrêté, même en pleine panique', () => {
    const state = panicFixture(true);
    runBots(state);
    expect(companyOf(state, 'bot1').products).toHaveLength(1);
    expect(state.players.bot1.cryptoPanicCloseUsed).toBeUndefined();
  });

  it('deux entreprises contrôlées avec deux produits crypto chacune : une seule fermeture au total', () => {
    setBotZoneMode('capital');
    const bot = { ...bots(1)[0], sectorId: 'crypto' as const };
    const state = createGame(config(19, 8), [human('h', 'yogurts'), bot]);
    const first = companyOf(state, 'bot1');
    first.sharesOutstanding = 1000;
    first.holdings = { bot1: 600 };
    first.controllerId = 'bot1';
    first.cash = 100;
    delete first.turnFlags.justFounded;
    first.products[0].lastRevenue = 10;
    first.products.push({ ...structuredClone(first.products[0]), id: 'c1-bis', name: 'Crypto Bis', lastRevenue: 500 });
    // Une seconde entreprise crypto contrôlée, elle aussi avec deux produits crypto.
    const second: CompanyState = structuredClone(first);
    second.id = 'c-bis';
    second.name = 'Crypto Bis SA';
    second.ticker = 'BIS';
    second.products[0].id = 'c2-principal';
    second.products[1].id = 'c2-bis';
    state.companies[second.id] = second;
    state.journal.push(issue({ articles: [article(crashCard.headline)] }, state.turn));
    const productIds = () => [first.id, second.id].flatMap((id) => state.companies[id].products.map((p) => p.id));
    const before = productIds();
    runBots(state);
    expect(state.players.bot1.cryptoPanicCloseUsed).toBe(true);
    // Un seul produit arrêté sur les deux entreprises, bien que chacune ait un produit crypto à liquider.
    expect(productIds()).toHaveLength(before.length - 1);
    const afterFirst = productIds();
    runBots(state); // la panique persiste (même numéro lu) : pas de seconde fermeture, où qu'elle soit
    expect(productIds()).toEqual(afterFirst);
    expect(state.players.bot1.cryptoPanicCloseUsed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sortie crypto des magnats
// ---------------------------------------------------------------------------

describe('magnats : vente et liquidation sur signaux forts', () => {
  it('liquide le produit crypto le plus faible et vend jusqu’au plancher de contrôle', () => {
    const state = createGame(config(23, 16), [human('a', 'crypto'), human('b', 'yogurts')]);
    state.turn = 10;
    const c = companyOf(state, 'a');
    // 6 000 / 10 000 : la fraction visée (0,83) céderait 4 980 actions, le plancher de contrôle borne à 800.
    c.holdings = { a: 6000 };
    c.cash = 100_000;
    c.priceHistory = [1, 1, 1, 1, 1];
    c.sharePrice = 3;
    c.products[0].lastRevenue = 5_000;
    const weakest: ProductState = { ...structuredClone(c.products[0]), id: 'crypto-plateau', name: 'Crypto Plateau', lastRevenue: 10 };
    c.products.push(weakest);
    state.sectors.crypto.demandHistory = [100, 110, 120];
    state.journal.push(issue({
      articles: [article(euphoriaCard.headline, 'good')],
      rumors: [{ text: crashCard.rumor!, reliability: 'élevée' }],
    }, state.turn));
    const sig = cryptoDumpSignals(getPlayerView(state, 'a'), 'fr');
    expect(sig.score).toBeCloseTo(0.95, 10);
    const heldBefore = c.holdings.a;
    const actions: Action[] = [];
    const io: BotIO = {
      view: () => getPlayerView(state, 'a'),
      act: (action) => {
        actions.push(action);
        return action.type === 'sellShares' || action.type === 'discontinueProduct'
          ? applyAction(state, 'a', action)
          : refuse();
      },
      memory: () => ({ calib: {} }),
      productName: () => 'Produit test',
      startupName: () => 'Startup test',
    };
    expertTurn(io, NEUTRAL_PERSONALITY);
    // Liquidation du plus petit CA crypto, sans le filtre habituel d'âge et de perte persistante.
    expect(actions.filter((a) => a.type === 'discontinueProduct'))
      .toEqual([{ type: 'discontinueProduct', companyId: c.id, productId: weakest.id }]);
    expect(c.products.some((p) => p.id === weakest.id)).toBe(false);
    expect(c.products).toHaveLength(1);
    // Vente : base 0,3 + 0,4 × score + bonus contrôleur 0,15, plafonnée à 0,9 (cryptoSignals.ts), soit 0,83
    // × 6 000 = 4 980 actions visées — mais un contrôleur garde sa marge au-dessus de 50 % :
    // keep = max(5 001, 52 % de 10 000) = 5 200, la cession est bornée à 6 000 − 5 200 = 800.
    const sells = actions.filter((a) => a.type === 'sellShares' && a.companyId === c.id);
    expect(sells).toHaveLength(1);
    const sold = sells[0].type === 'sellShares' ? sells[0].shares : 0;
    const keep = Math.max(Math.floor(c.sharesOutstanding / 2) + 1, Math.ceil(c.sharesOutstanding * 0.52));
    expect(keep).toBe(5200);
    // La fraction seule vendrait bien plus : c'est le plancher de contrôle qui borne la cession.
    expect(Math.floor(heldBefore * Math.min(0.9, 0.3 + 0.4 * sig.score + 0.15))).toBeGreaterThan(heldBefore - keep);
    expect(sold).toBe(heldBefore - keep);
    expect(sold).toBe(800);
    expect(c.holdings.a).toBe(keep);
  });

  it('la vue relue après la liquidation ne fait plus vendre l’entreprise restée sans ligne crypto', () => {
    const state = createGame(config(29, 16), [human('a', 'yogurts'), human('b', 'yogurts')]);
    state.turn = 10;
    const c = companyOf(state, 'a');
    c.holdings = { a: 6000 };
    c.cash = 100_000;
    c.priceHistory = [1, 1, 1, 1, 1];
    c.sharePrice = 3;
    // Une ligne crypto faible greffée sur l'entreprise yaourts : la moitié du CA, donc « crypto » au sens du filtre.
    c.products[0].lastRevenue = 10;
    const cryptoLine: ProductState = { ...structuredClone(c.products[0]), id: 'crypto-greffe', name: 'Crypto Greffe', sectorId: 'crypto', lastRevenue: 10 };
    c.products.push(cryptoLine);
    state.sectors.crypto.demandHistory = [100, 110, 120];
    state.journal.push(issue({
      articles: [article(euphoriaCard.headline, 'good')],
      rumors: [{ text: crashCard.rumor!, reliability: 'élevée' }],
    }, state.turn));
    const sig = cryptoDumpSignals(getPlayerView(state, 'a'), 'fr');
    expect(sig.score).toBeCloseTo(0.95, 10); // ≥ seuil de liquidation (0,8) et de vente (0,55)
    const actions: Action[] = [];
    const io: BotIO = {
      view: () => getPlayerView(state, 'a'),
      act: (action) => {
        actions.push(action);
        return action.type === 'sellShares' || action.type === 'discontinueProduct'
          ? applyAction(state, 'a', action)
          : refuse();
      },
      memory: () => ({ calib: {} }),
      productName: () => 'Produit test',
      startupName: () => 'Startup test',
    };
    expertTurn(io, NEUTRAL_PERSONALITY);
    // La ligne crypto est liquidée…
    expect(actions.filter((a) => a.type === 'discontinueProduct'))
      .toEqual([{ type: 'discontinueProduct', companyId: c.id, productId: cryptoLine.id }]);
    expect(c.products.some((p) => p.id === cryptoLine.id)).toBe(false);
    // … et la vue relue ne montre plus de produit crypto : aucune vente ne vise l'entreprise.
    // (Sans la relecture, la vue périmée — crypto à 50 % du CA — la ferait vendre.)
    expect(actions.some((a) => a.type === 'sellShares' && a.companyId === c.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Brèves « délit d'initié » au krach
// ---------------------------------------------------------------------------

describe('délit d’initié : brève et scandale au krach', () => {
  it('un humain contrôleur qui a vendu 25 % de sa ligne le trimestre précédent fait les brèves', () => {
    const state = createGame(config(31, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const c = companyOf(state, 'a');
    state.turn = 3;
    executeShareSell(state, state.players.a, c, 1500); // 37,5 % de la ligne fondatrice de 4000
    state.turn = 4;
    state.scheduledNews = [{ turn: 4, cardId: 'crypto_crash_founders' }];
    startTurn(state, null);
    const issueNow = state.journal.at(-1)!;
    expect(issueNow.articles.some((a) => a.kind === 'headline' && a.title === crashCard.headline)).toBe(true);
    const brief = issueNow.articles.find((a) => a.event?.type === 'insiderSale');
    expect(brief).toBeDefined();
    expect(brief!.kind).toBe('news');
    expect(brief!.event).toEqual({ type: 'insiderSale', actorId: 'a', subjectId: c.id });
    expect(brief!.title).toContain(c.ceoName);
    expect(brief!.title).toContain(c.name);
  });

  it('le scandale exact est de +15 (appel direct, sans les brèves aléatoires du numéro)', () => {
    const state = createGame(config(31, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const c = companyOf(state, 'a');
    state.turn = 3;
    executeShareSell(state, state.players.a, c, 1500);
    state.turn = 4;
    const before = c.scandal;
    const briefs = cryptoInsiderSaleBriefs(state, 'crypto_crash_founders');
    expect(briefs).toHaveLength(1);
    expect(briefs[0].event).toEqual({ type: 'insiderSale', actorId: 'a', subjectId: c.id });
    expect(c.scandal - before).toBe(CRYPTO_INSIDER_SCANDAL);
    expect(CRYPTO_INSIDER_SCANDAL).toBe(15);
  });

  it('un bot contrôleur vendeur fait aussi les brèves', () => {
    const bot = { ...bots(1)[0], sectorId: 'crypto' as const };
    const state = createGame(config(33, 8), [human('h', 'yogurts'), bot]);
    const c = companyOf(state, 'bot1');
    state.turn = 3;
    executeShareSell(state, state.players.bot1, c, 1500);
    state.turn = 4;
    const briefs = cryptoInsiderSaleBriefs(state, 'crypto_crash_founders');
    expect(briefs).toHaveLength(1);
    expect(briefs[0].event).toEqual({ type: 'insiderSale', actorId: 'bot1', subjectId: c.id });
    expect(briefs[0].title).toContain(c.ceoName);
    expect(briefs[0].title).toContain(c.name);
  });

  it('un contrôleur qui n’a rien vendu : ni brève, ni scandale', () => {
    const state = createGame(config(31, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const c = companyOf(state, 'a');
    state.turn = 4;
    const before = c.scandal;
    expect(cryptoInsiderSaleBriefs(state, 'crypto_crash_founders')).toEqual([]);
    expect(c.scandal).toBe(before);
  });

  it('un simple actionnaire (non contrôleur) qui a vendu 25 % ne fait pas les brèves', () => {
    const state = createGame(config(31, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const c = companyOf(state, 'a');
    c.holdings = { a: 4000, b: 2000 };
    state.turn = 3;
    executeShareSell(state, state.players.b, c, 600); // 30 % de sa ligne, mais b ne contrôle pas
    state.turn = 4;
    expect(state.shareSales).toHaveLength(1);
    expect(state.shareSales[0].sellerController).toBe(false);
    const before = c.scandal;
    expect(cryptoInsiderSaleBriefs(state, 'crypto_crash_founders')).toEqual([]);
    expect(c.scandal).toBe(before);
  });

  it('une vente d’il y a deux trimestres est élaguée : pas de brève au krach', () => {
    const state = createGame(config(31, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const c = companyOf(state, 'a');
    state.turn = 2;
    executeShareSell(state, state.players.a, c, 1500);
    state.turn = 4;
    state.scheduledNews = [{ turn: 4, cardId: 'crypto_crash_founders' }];
    startTurn(state, null);
    expect(state.shareSales).toEqual([]); // seuls le trimestre écoulé et le courant sont conservés
    expect(cryptoInsiderSaleBriefs(state, 'crypto_crash_founders')).toEqual([]);
    expect(state.journal.at(-1)!.articles.some((a) => a.event?.type === 'insiderSale')).toBe(false);
  });

  it('le seuil est exactement 25 % de la ligne de début de trimestre', () => {
    // 1 000 / 4 000 = 25,0 % : la brève paraît.
    const at = createGame(config(37, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const cAt = companyOf(at, 'a');
    at.turn = 3;
    executeShareSell(at, at.players.a, cAt, 1000);
    at.turn = 4;
    expect(cryptoInsiderSaleBriefs(at, 'crypto_crash_founders')).toHaveLength(1);
    // 996 / 4 000 = 24,9 % : rien.
    const under = createGame(config(37, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const cUnder = companyOf(under, 'a');
    under.turn = 3;
    executeShareSell(under, under.players.a, cUnder, 996);
    under.turn = 4;
    expect(cryptoInsiderSaleBriefs(under, 'crypto_crash_founders')).toEqual([]);
  });

  it('la brève nomme le vendeur, pas le dirigeant en place au krach', () => {
    const state = createGame(config(41, 8), [human('a', 'crypto', 'Alice Vendeur'), human('b', 'crypto', 'Bob Patron')]);
    const c = companyOf(state, 'a');
    state.turn = 3;
    executeShareSell(state, state.players.a, c, 1500);
    // Alice cède la direction à Bob avant le krach : la brève reste à son nom.
    c.controllerId = 'b';
    c.ceoName = state.players.b.name;
    state.turn = 4;
    const briefs = cryptoInsiderSaleBriefs(state, 'crypto_crash_founders');
    expect(briefs).toHaveLength(1);
    expect(briefs[0].title).toContain(state.players.a.name);
    expect(briefs[0].title).not.toContain(state.players.b.name);
  });

  it('les ventes du trimestre s’additionnent sur la ligne de début, et les rachats se déduisent', () => {
    // 800 puis 400 : 1 200 / 4 000 = 30 % — la première vente fixe la ligne de début de trimestre.
    const agg = createGame(config(43, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const cAgg = companyOf(agg, 'a');
    agg.turn = 3;
    executeShareSell(agg, agg.players.a, cAgg, 800);
    executeShareSell(agg, agg.players.a, cAgg, 400);
    agg.turn = 4;
    expect(cryptoInsiderSaleBriefs(agg, 'crypto_crash_founders')).toHaveLength(1);
    // 1 500 vendus puis 600 rachetés dans le trimestre : 900 / 4 000 = 22,5 % net — pas de brève.
    const net = createGame(config(43, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const cNet = companyOf(net, 'a');
    net.turn = 3;
    executeShareSell(net, net.players.a, cNet, 1500);
    const buy = applyAction(net, 'a', { type: 'buyShares', companyId: cNet.id, shares: 600 });
    expect(buy.ok).toBe(true); // le produit de la vente paie le rachat
    net.turn = 4;
    expect(cryptoInsiderSaleBriefs(net, 'crypto_crash_founders')).toEqual([]);
  });

  it('les ventes forcées sur appel de marge ne vont pas au registre des délits d’initié', () => {
    const state = createGame(config(47, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const c = companyOf(state, 'a');
    c.sharePrice = 1;
    state.players.a.cash = 0;
    state.players.a.debt = 5000; // 5 000 > 80 % × 4 000 (portefeuille : 4 000 actions à 1)
    const heldBefore = c.holdings.a;
    const sold = marginCall(state, state.players.a);
    expect(sold).not.toBeNull();
    expect(sold!).toBeGreaterThan(0);
    expect(c.holdings.a).toBeLessThan(heldBefore);
    expect(state.shareSales.filter((s) => s.playerId === 'a')).toEqual([]);
  });

  it('une cession de gré à gré est enregistrée comme une vente de marché', () => {
    const state = createGame(config(53, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const c = companyOf(state, 'a');
    state.turn = 3;
    state.players.b.cash = 1e6;
    const offer = applyAction(state, 'a', { type: 'offerShares', companyId: c.id, counterpartyId: 'b', shares: 1500, price: c.sharePrice, side: 'sell' });
    expect(offer.ok).toBe(true);
    const accept = applyAction(state, 'b', { type: 'answerOffer', offerId: state.offers![0].id, accept: true });
    expect(accept.ok).toBe(true);
    expect(c.holdings.a).toBe(2500);
    expect(state.shareSales).toHaveLength(1);
    expect(state.shareSales[0]).toMatchObject({
      turn: 3, playerId: 'a', companyId: c.id, shares: 1500,
      holdingBefore: 4000, sellerController: true, hadCryptoLine: true,
    });
    state.turn = 4;
    expect(cryptoInsiderSaleBriefs(state, 'crypto_crash_founders')).toHaveLength(1);
  });

  it('fermer la ligne crypto avant le krach ne lave pas la vente', () => {
    const state = createGame(config(59, 8), [human('a', 'crypto'), human('b', 'crypto')]);
    const c = companyOf(state, 'a');
    // Un second produit, hors crypto, pour pouvoir arrêter la ligne crypto.
    const yog: ProductState = { ...structuredClone(c.products[0]), id: 'yog-bis', name: 'Yaourt Bis', sectorId: 'yogurts' };
    c.products.push(yog);
    state.turn = 3;
    executeShareSell(state, state.players.a, c, 1500);
    const cryptoId = c.products.find((p) => p.sectorId === 'crypto')!.id;
    const close = applyAction(state, 'a', { type: 'discontinueProduct', companyId: c.id, productId: cryptoId });
    expect(close.ok).toBe(true);
    expect(c.products.some((p) => p.sectorId === 'crypto')).toBe(false);
    // La ligne crypto est appréciée au moment de la vente : la brève et le scandale tombent quand même.
    state.turn = 4;
    const before = c.scandal;
    const briefs = cryptoInsiderSaleBriefs(state, 'crypto_crash_founders');
    expect(briefs).toHaveLength(1);
    expect(c.scandal - before).toBe(CRYPTO_INSIDER_SCANDAL);
  });
});

// ---------------------------------------------------------------------------
// Textes des brèves
// ---------------------------------------------------------------------------

describe('délit d’initié : textes FR/EN', () => {
  const fr = textsFor('fr').insiderSaleBriefs;
  const en = textsFor('en').insiderSaleBriefs;

  it('deux variantes par langue, le même nombre partout', () => {
    expect(fr).toHaveLength(2);
    expect(en).toHaveLength(2);
    expect(en).toHaveLength(fr.length);
  });

  it('les placeholders {ceo}/{company} sont dans les titres, jamais dans les corps', () => {
    for (const v of [...fr, ...en]) {
      expect(v.title).toContain('{ceo}');
      expect(v.title).toContain('{company}');
      expect(v.body).not.toMatch(/\{\w+\}/);
    }
  });

  it('français : apostrophes typographiques dans les corps (les titres peuvent avoir « »)', () => {
    for (const v of fr) expect(v.body).not.toContain("'");
  });

  it('anglais : ni guillemets français, ni €, ni accents', () => {
    for (const text of en.flatMap((v) => [v.title, v.body])) {
      expect(text).not.toMatch(/[«»€]/);
      expect(text).not.toMatch(/[éèêëàâîïôûùüçœæÉÈÊÀÂÎÔÛÇŒ]/);
    }
  });
});
