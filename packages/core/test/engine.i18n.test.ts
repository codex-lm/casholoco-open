/**
 * Moteur bilingue : la langue ne change que les textes, jamais la simulation.
 */
import { describe, expect, it } from 'vitest';
import { getContent, PLAYER_COLORS } from '../src/content';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { STARTUP_SUFFIX_COUNT, textsFor, type EngineText } from '../src/sim/i18n';
import { fillTemplate } from '../src/sim/util';
import type { Action, ActionResult, GameState, Lang, LobbyPlayer } from '../src/types';

/** Caractères typiquement français (accents, cédille, guillemets). */
const FRENCH_CHARS = /[éèêëàâîïôûùüçœæÉÈÊÀÂÎÔÛÇŒ«»]/;
const PLACEHOLDER = /\{\w+\}/;

/** Tablée de bots nommés dans la langue de la partie, plus un humain qui joue un script fixe. */
function lobby(lang: Lang, seed: number): LobbyPlayer[] {
  const bots = getContent(lang).bots;
  const n = 4 + (seed % 3);
  const players: LobbyPlayer[] = [];
  for (let i = 0; i < n; i++) {
    const pers = bots[(i + seed) % bots.length];
    players.push({
      id: `bot${i + 1}`,
      name: pers.ceoName,
      isBot: true,
      botPersonalityId: pers.id,
      companyName: pers.companyName,
      sectorId: pers.preferredSectors[0] ?? 'gadgets',
      connected: true,
      color: PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length],
    });
  }
  players.push({ id: 'h1', name: 'Player One', isBot: false, companyName: 'Human Holdings', sectorId: 'gadgets', connected: true, color: PLAYER_COLORS[0] });
  return players;
}

/** Script humain : actions valides et refus variés (mêmes ordres quelle que soit la langue). */
function humanScript(state: GameState, results: ActionResult[]): void {
  const mine = Object.values(state.companies).filter((c) => c.controllerId === 'h1' && c.status === 'active');
  const me = mine[0];
  const npc = Object.values(state.companies).find((c) => c.npcDefId && c.status === 'active');
  const rival = Object.values(state.companies).find((c) => c.controllerId && c.controllerId !== 'h1' && c.status === 'active');
  const actions: Action[] = [];
  if (me) {
    const p = me.products[0];
    if (p) {
      actions.push({ type: 'setProductDecisions', companyId: me.id, productId: p.id, price: 1e9, production: 1e9, marketing: 300, rnd: 200 });
      actions.push({ type: 'expandCapacity', companyId: me.id, productId: p.id, lots: 3 });
    }
    actions.push({ type: 'buyCommodity', companyId: me.id, commodityId: 'lithium', lots: 4 });
    actions.push({ type: 'sellCommodity', companyId: me.id, commodityId: 'lithium', lots: 1e6 });
    actions.push({ type: 'ceoBonus', companyId: me.id, amount: 1e9 });
    actions.push({ type: 'ceoBonus', companyId: me.id, amount: 150 });
    actions.push({ type: 'payDividend', companyId: me.id, amount: 100 });
    actions.push({ type: 'takeLoan', companyId: me.id, amount: 50 });
    actions.push({ type: 'repayLoan', companyId: me.id, amount: 20 });
    actions.push({ type: 'crisisComms', companyId: me.id });
    actions.push({ type: 'poisonPill', companyId: me.id });
    actions.push({ type: 'shady', companyId: me.id, kind: 'lobbying', sectorId: 'gadgets' });
    actions.push({ type: 'shady', companyId: me.id, kind: 'lobbying', sectorId: 'gadgets' });
    actions.push({ type: 'shady', companyId: me.id, kind: 'industrial_espionage' });
    if (rival) actions.push({ type: 'shady', companyId: me.id, kind: 'smear_campaign', targetCompanyId: rival.id });
    actions.push({ type: 'launchProduct', companyId: me.id, sectorId: 'scooters', name: 'Zoomer' });
    actions.push({ type: 'buyback', companyId: me.id, shares: 5 });
    if (mine.length >= 2) actions.push({ type: 'merge', absorberId: mine[0].id, targetId: mine[1].id });
  }
  if (npc) {
    actions.push({ type: 'buyShares', companyId: npc.id, shares: 40 });
    actions.push({ type: 'sellShares', companyId: npc.id, shares: 10 });
    actions.push({ type: 'sellShares', companyId: npc.id, shares: 1e7 });
  }
  if (rival) actions.push({ type: 'buyShares', companyId: rival.id, shares: 1e7 });
  if (rival) actions.push({ type: 'whistleblow', companyId: rival.id });
  if (me) actions.push({ type: 'whistleblow', companyId: me.id });
  actions.push({ type: 'takePersonalLoan', amount: 1e9 });
  actions.push({ type: 'repayPersonalLoan', amount: 10 });
  if (state.turn === 2) actions.push({ type: 'foundStartup', name: 'Side Hustle', sectorId: 'yogurts', investment: 1500 });
  actions.push({ type: 'foundStartup', name: '', sectorId: 'yogurts', investment: 1500 });
  actions.push({ type: 'discontinueProduct', companyId: 'nope', productId: 'x' });
  actions.push({ type: 'nonsense' } as unknown as Action);
  for (const a of actions) results.push(applyAction(state, 'h1', a));
}

function play(lang: Lang, seed: number, turns = 12): { state: GameState; results: ActionResult[] } {
  const state = createGame({ seed, totalTurns: turns, turnSeconds: 90, startYear: 2027, lang }, lobby(lang, seed));
  const results: ActionResult[] = [];
  while (state.phase === 'playing') {
    humanScript(state, results);
    resolveTurn(state);
  }
  results.push(applyAction(state, 'h1', { type: 'takePersonalLoan', amount: 1 }));
  return { state, results };
}

/** Champs purement textuels (dépendent de la langue) retirés avant comparaison. */
const TEXT_KEYS = new Set(['name', 'companyName', 'companyNames', 'productName', 'ticker', 'ceoName', 'title', 'body', 'text', 'dateLabel', 'lang', 'message', 'description', 'unit']);

function numbersOnly(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(numbersOnly);
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) if (!TEXT_KEYS.has(k)) out[k] = numbersOnly(v);
    return out;
  }
  return x;
}

/** Tous les textes produits : journal (articles et rumeurs) et messages d'action. */
function allTexts(state: GameState, results: ActionResult[]): string[] {
  const out: string[] = [];
  for (const issue of state.journal) {
    out.push(issue.dateLabel);
    for (const a of issue.articles) out.push(a.title, a.body);
    for (const r of issue.rumors) out.push(r.text);
  }
  for (const r of results) out.push(r.message);
  for (const c of Object.values(state.companies)) out.push(c.ceoName, ...c.products.map((p) => p.name));
  return out;
}

describe('langues : même partie en français et en anglais', () => {
  for (const seed of [1, 2, 3, 4, 5, 11]) {
    it(`graine ${seed} : mêmes nombres, mêmes décisions, même RNG`, () => {
      const fr = play('fr', seed);
      const en = play('en', seed);
      expect(en.state.config.lang).toBe('en');
      expect(fr.state.config.lang).toBe('fr');
      expect(en.state.rngState).toBe(fr.state.rngState);
      expect(en.state.nextId).toBe(fr.state.nextId);
      expect(en.results.map((r) => r.ok)).toEqual(fr.results.map((r) => r.ok));
      expect(numbersOnly(en.state)).toEqual(numbersOnly(fr.state));
      // Même chose, vu par un joueur (la vue redigée ne dépend pas non plus de la langue, hors textes).
      expect(numbersOnly(getPlayerView(en.state, 'h1'))).toEqual(numbersOnly(getPlayerView(fr.state, 'h1')));
    });
  }

  it('sans langue précisée, la partie est en français', () => {
    const state = createGame({ seed: 3, totalTurns: 4, turnSeconds: 90, startYear: 2027 }, lobby('fr', 3));
    expect(state.config.lang).toBe('fr');
    expect(state.journal[0].dateLabel).toBe('T1 2027');
    const bad = createGame({ seed: 3, totalTurns: 4, turnSeconds: 90, startYear: 2027, lang: 'xx' as Lang }, lobby('fr', 3));
    expect(bad.config.lang).toBe('fr');
  });

  it("l'origine des rumeurs reste cachée : pas de clé dans la vue", () => {
    const { state } = play('en', 2, 4);
    expect(state.rumorKeys).toBeDefined();
    const view = getPlayerView(state, 'h1') as unknown as Record<string, unknown>;
    expect(view.rumorKeys).toBeUndefined();
    expect(JSON.stringify(view)).not.toMatch(/"(?:news|fake):/);
  });

  it('français : aucun placeholder non résolu, dates « T1 2027 », montants en €', () => {
    const { state, results } = play('fr', 4);
    const texts = allTexts(state, results);
    expect(texts.filter((t) => PLACEHOLDER.test(t))).toEqual([]);
    expect(state.journal[0].dateLabel).toBe('T1 2027');
    expect(texts.some((t) => t.includes('€'))).toBe(true);
    expect(texts.some((t) => t.includes('$'))).toBe(false);
  });
});

describe('catalogue du moteur (sim/i18n.ts)', () => {
  const fr = textsFor('fr');
  const en = textsFor('en');

  /** Appelle chaque entrée du catalogue avec des arguments neutres et renvoie tous les textes obtenus. */
  function render(t: EngineText): string[] {
    const out: string[] = [];
    const sample = (fn: (...args: unknown[]) => unknown, arity: number) => {
      const variants: unknown[][] = [
        Array.from({ length: arity }, (_, i) => (i % 2 === 0 ? 'Acme' : 1234.5)),
        Array.from({ length: arity }, () => 1),
        Array.from({ length: arity }, () => 0.25),
        Array.from({ length: arity }, () => null),
        Array.from({ length: arity }, () => [{ product: 'Widget', gain: 0.4 }]),
        Array.from({ length: arity }, () => ['a', 'b']),
        Array.from({ length: arity }, () => true),
      ];
      for (const args of variants) {
        try {
          const r = fn(...args);
          if (typeof r === 'string') out.push(r);
        } catch {
          /* arguments inadaptés à cette entrée */
        }
      }
    };
    const walk = (node: unknown) => {
      if (typeof node === 'string') out.push(node);
      else if (typeof node === 'function') sample(node as (...a: unknown[]) => unknown, (node as { length: number }).length);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(t);
    return out;
  }

  it('mêmes clés en français et en anglais', () => {
    const keys = (o: object): string[] =>
      Object.entries(o)
        .flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v).map((x) => `${k}.${x}`) : [k]))
        .sort();
    expect(keys(en)).toEqual(keys(fr));
    for (const k of Object.keys(fr.fallbackHeadlines) as (keyof typeof fr.fallbackHeadlines)[]) {
      expect(en.fallbackHeadlines[k].length).toBeGreaterThan(0);
    }
    for (const k of Object.keys(fr.bodies) as (keyof typeof fr.bodies)[]) expect(en.bodies[k].length).toBeGreaterThan(0);
  });

  it("les suffixes de start-up ont la même longueur partout (tirage au RNG sur l'indice)", () => {
    expect(fr.startupSuffixes).toHaveLength(STARTUP_SUFFIX_COUNT);
    expect(en.startupSuffixes).toHaveLength(STARTUP_SUFFIX_COUNT);
  });

  it('anglais : aucun caractère français ni placeholder cassé dans les textes du catalogue', () => {
    const texts = render(en);
    expect(texts.length).toBeGreaterThan(150);
    expect(texts.filter((t) => FRENCH_CHARS.test(t))).toEqual([]);
    // Les titres de secours gardent leurs placeholders ; une fois remplis, plus aucun.
    const filled = [...Object.values(en.fallbackHeadlines).flat()].map((t) => fillTemplate(t, {}, 'en'));
    expect(filled.filter((t) => PLACEHOLDER.test(t) || FRENCH_CHARS.test(t))).toEqual([]);
    // Les titres de secours et ceux des brèves « délit d'initié » gardent leurs placeholders, remplis à la parution.
    const templated = [...Object.values(en.fallbackHeadlines).flat(), ...en.insiderSaleBriefs.map((b) => b.title)];
    expect(texts.filter((t) => !templated.includes(t) && PLACEHOLDER.test(t))).toEqual([]);
    expect(texts.some((t) => t.includes('€'))).toBe(false);
  });

  it('français : titres de secours sans placeholder résiduel une fois remplis', () => {
    const filled = Object.values(fr.fallbackHeadlines).flat().map((t) => fillTemplate(t, {}, 'fr'));
    expect(filled.filter((t) => PLACEHOLDER.test(t))).toEqual([]);
  });

  it('anglais : a/an et possessifs', () => {
    expect(fillTemplate('Rumors about a {company} deal', { company: 'Acme' }, 'en')).toBe('Rumors about an Acme deal');
    expect(fillTemplate('A {product} for everyone', { product: 'Unicorn Kit' }, 'en')).toBe('A Unicorn Kit for everyone');
    expect(fillTemplate('a {product} in every home', { product: 'hourglass' }, 'en')).toBe('an hourglass in every home');
    expect(fillTemplate('an {product} launch', { product: 'Widget' }, 'en')).toBe('a Widget launch');
    expect(fillTemplate("{company}'s CEO", { company: 'Acme' }, 'en')).toBe("Acme's CEO");
    expect(fillTemplate('{company}’s CEO', { company: 'Widgets' }, 'en')).toBe('Widgets’ CEO');
    expect(fillTemplate('Shares of a {company} tumble', {}, 'en')).toBe('Shares of a listed company tumble');
    expect(fillTemplate('{player} is back', {}, 'en')).toBe('an investor is back');
    // Pas d'élision à la française en anglais.
    expect(fillTemplate('de {company}', { company: 'Acme' }, 'en')).toBe('de Acme');
  });

  it('partie en anglais : les textes issus du catalogue sont en anglais', () => {
    const { state, results } = play('en', 5);
    expect(state.journal[0].dateLabel).toBe('Q1 2027');
    // Refus sans réplique d'ambiance : texte 100 % catalogue.
    const plain = results.filter((r) => !r.ok).map((r) => r.message);
    const catalogOnly = [en.act.companyNotFound, en.act.unknown, en.act.startupNeedsName, en.gameOver];
    for (const m of catalogOnly) expect(plain.some((p) => p === m || p.endsWith(` ${m}`))).toBe(true);
    const editorial = state.journal.flatMap((j) => j.articles).filter((a) => a.kind === 'quote' && a.body === en.editorialist);
    expect(editorial).toHaveLength(state.journal.length);
    const last = state.journal[state.journal.length - 1].articles.at(-1);
    expect(last?.title.startsWith('Closing bell:')).toBe(true);
    // Montants en dollars dans les messages d'action.
    expect(results.filter((r) => r.ok).every((r) => !r.message.includes('€'))).toBe(true);
    const view = getPlayerView(state, 'h1');
    expect(view.sectors[0].shares.at(-1)?.name).toBe(en.otherCompetitors);
  });
});

/**
 * [INTÉGRATION CONTENU EN] Vérifie TOUT le journal et tous les messages d'une partie en anglais,
 * y compris le contenu (news, titres, citations, répliques, noms des bots et PNJ) écrit dans content/en/*.
 * Tant que le contenu anglais est incomplet, getContent('en') retombe sur le français et ce test échoue :
 * il doit passer une fois le contenu anglais intégré.
 */
describe('[intégration contenu EN] partie complète en anglais', () => {
  for (const seed of [1, 2, 3]) {
    it(`graine ${seed} : ni français ni placeholder dans le journal et les messages`, () => {
      const { state, results } = play('en', seed, 16);
      const texts = allTexts(state, results);
      expect(texts.filter((t) => FRENCH_CHARS.test(t))).toEqual([]);
      expect(texts.filter((t) => PLACEHOLDER.test(t))).toEqual([]);
    });
  }
});
