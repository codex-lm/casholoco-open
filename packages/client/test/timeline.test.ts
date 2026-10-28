import { createElement, Fragment, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_COLORS,
  applyAction,
  createGame,
  getContent,
  getPlayerView,
  resolveTurn,
  type ActionResult,
  type Article,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type PublicPlayer,
  type SectorId,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { pctDigits } from '../src/rules';
import { CompanyTab } from '../src/screens/game/CompanyTab';
import { RankingTab } from '../src/screens/game/RankingTab';
import {
  DEFAULT_FAMILIES,
  EVENT_FAMILY,
  EVENT_ICON,
  EVENT_WEIGHT,
  FAMILIES,
  FAMILY_ICON,
  eventText,
  filterEntries,
  lastLosses,
  nameAt,
  quarters,
  stripIcons,
  timelineEntries,
  type TimelineEntry,
} from '../src/screens/game/timeline/model';
import { getState, setState, type AppState } from '../src/store';

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

function ok(r: ActionResult): void {
  expect(r.ok, r.message).toBe(true);
}

/**
 * Ada lance un produit (T2), Bob monte à 26 % de son entreprise (T3) puis la lui prend (T4) et verse
 * aussitôt un dividende ; Cleo regarde.
 */
function takeoverGame(lang: Lang): { g: GameState; targetId: string } {
  const g = createGame({ seed: 23, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang }, [
    seat('ada', 'Ada', 'Atelier Ada', 'gadgets', 0),
    seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
    seat('cleo', 'Cleo', 'Cleo SA', 'energy_drinks', 2),
  ]);
  const target = Object.values(g.companies).find((c) => c.founderId === 'ada')!;
  resolveTurn(g);
  ok(applyAction(g, 'ada', { type: 'launchProduct', companyId: target.id, sectorId: 'yogurts', name: 'Yaourt Ada' }));
  resolveTurn(g);
  g.players.bob.cash = 1e9;
  ok(applyAction(g, 'bob', { type: 'buyShares', companyId: target.id, shares: 2600 }));
  resolveTurn(g);
  ok(applyAction(g, 'bob', { type: 'buyShares', companyId: target.id, shares: 2401 })); // 50 % + 1 action : le flottant minimal l'impose
  expect(g.companies[target.id].controllerId).toBe('bob');
  ok(applyAction(g, 'bob', { type: 'payDividend', companyId: target.id, amount: 5 }));
  return { g, targetId: target.id };
}

function find(entries: TimelineEntry[], type: TimelineEntry['event']['type'], companyId?: string): TimelineEntry {
  const e = entries.find((x) => x.event.type === type && (!companyId || x.article.companyIds?.includes(companyId)));
  expect(e, type).toBeDefined();
  return e!;
}

/** Phrases comme les affiche l'interface : noms, montants au format du salon, textes dans la langue choisie. */
function text(view: PlayerView, entry: TimelineEntry, uiLang: Lang) {
  const fmt = fmtFor(view.config.lang);
  const t = messages(uiLang);
  const products = new Map(view.companies.flatMap((c) => c.products.map((p) => [p.id, p.name] as const)));
  return eventText(entry, {
    h: t.history,
    player: (id) => nameAt(view.players.find((p) => p.id === id), entry.turn) ?? t.history.someone,
    company: (id) => view.companies.find((c) => c.id === id)?.name ?? t.common.unknown,
    product: (id) => (id ? products.get(id) : undefined),
    sector: (id) => (id ? getContent(uiLang).sectors[id].name : t.common.unknown),
    money: fmt.money,
    pct: (r) => fmt.pct(r, pctDigits(r)),
  });
}

function render<P extends object>(view: PlayerView, uiLang: Lang, node: FunctionComponent<P>, props: P): string {
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(node, props) }));
}

describe('chronologie : qui a fait quoi, et à qui', () => {
  const { g, targetId } = takeoverGame('fr');
  const ada = timelineEntries(getPlayerView(g, 'ada'));
  const bob = timelineEntries(getPlayerView(g, 'bob'));
  const cleo = timelineEntries(getPlayerView(g, 'cleo'));

  it('relie chaque événement au joueur qui regarde : il agit, il subit, ou c’était son entreprise', () => {
    expect(find(ada, 'takeover').role).toBe('subject');
    expect(find(bob, 'takeover').role).toBe('actor');
    expect(find(cleo, 'takeover').role).toBeNull();
    // La montée au capital de Bob visait l'entreprise que dirigeait Ada à ce moment-là.
    expect(find(ada, 'stakeBuilding').role).toBe('company');
    expect(find(bob, 'stakeBuilding').role).toBe('actor');
    expect(find(cleo, 'stakeBuilding').role).toBeNull();
    expect(find(ada, 'productLaunch', targetId).role).toBe('actor');
    // Après la prise de contrôle, l'entreprise n'est plus celle d'Ada.
    expect(find(ada, 'dividend', targetId).role).toBeNull();
    expect(find(bob, 'dividend', targetId).role).toBe('actor');
  });

  it('retrouve la perte d’Ada, trimestre et parachute compris', () => {
    const losses = lastLosses(ada);
    expect(losses.map((e) => e.event.type)).toEqual(['takeover']);
    expect(losses[0].turn).toBe(g.turn);
    expect(losses[0].event.amount).toBeCloseTo(g.players.ada.stats.parachutes);
    expect(lastLosses(bob)).toEqual([]);
    expect(lastLosses(cleo)).toEqual([]);
  });

  it('le dit en clair, dans la langue de l’interface, avec les montants du salon', () => {
    const view = getPlayerView(g, 'ada');
    const takeover = find(ada, 'takeover');
    const fmt = fmtFor('fr');
    // 50 % + 1 action : deux décimales, sinon on lirait « 50,0 % ».
    const pct = fmt.pct(takeover.event.pct!, 2);
    expect(pct).toBe(fmt.pct(0.5001, 2));
    const parachute = fmt.money(takeover.event.amount!);
    expect(text(view, takeover, 'fr')).toEqual({ line: `Bob vous prend Atelier Ada (${pct}).`, extra: `Votre parachute doré : ${parachute}.` });
    expect(text(view, takeover, 'en')).toEqual({ line: `Bob takes Atelier Ada from you (${pct}).`, extra: `Your golden parachute: ${parachute}.` });
    // Vu par l'acquéreur, puis par un tiers (élision : « d’Atelier Ada »).
    expect(text(getPlayerView(g, 'bob'), find(bob, 'takeover'), 'fr').line).toBe(`Vous prenez le contrôle d’Atelier Ada (${pct}).`);
    const third = text(getPlayerView(g, 'cleo'), find(cleo, 'takeover'), 'fr');
    expect(third.line).toBe(`Bob prend le contrôle d’Atelier Ada (${pct}).`);
    expect(third.extra).toBe(`Ada quitte la direction avec un parachute doré de ${parachute}.`);
    expect(text(view, find(ada, 'stakeBuilding'), 'fr').line).toBe(`Bob détient désormais ${fmt.pct(0.26, 1)} d’Atelier Ada.`);
    expect(text(view, find(ada, 'productLaunch', targetId), 'fr').line).toBe('Atelier Ada lance Yaourt Ada.');
  });

  it('fait une colonne par trimestre, marque les vôtres et résume les pictogrammes', () => {
    const view = getPlayerView(g, 'ada');
    const cols = quarters(view, ada);
    expect(cols.map((c) => c.turn)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(cols.filter((c) => c.hasIssue).map((c) => c.turn)).toEqual(view.journal.map((i) => i.turn));
    expect(cols.filter((c) => c.future).every((c) => c.turn > view.turn && c.entries.length === 0)).toBe(true);
    expect(cols[11].label).toBe('T4 2029');
    const now = cols.find((c) => c.current)!;
    expect(now.turn).toBe(view.turn);
    expect(now.mine).toBe(true);
    const { shown, more } = stripIcons(now.entries, 1);
    // La prise de contrôle subie passe devant tout le reste.
    expect(shown.map((e) => e.event.type)).toEqual(['takeover']);
    expect(more).toBe(now.entries.length - 1);
  });

  it('filtre par familles cochées, et au besoin sur ce qui vous concerne', () => {
    // Par défaut : rachats, créations, faillites et scandales ; ni lancements ni argent.
    const byDefault = filterEntries(ada, { families: DEFAULT_FAMILIES, mineOnly: false });
    expect(byDefault.some((e) => e.event.type === 'takeover')).toBe(true);
    expect(byDefault.some((e) => e.event.type === 'stakeBuilding')).toBe(true);
    expect(byDefault.some((e) => ['productLaunch', 'dividend', 'bigProfit', 'bigLoss'].includes(e.event.type))).toBe(false);
    const everything = filterEntries(ada, { families: FAMILIES, mineOnly: false });
    expect(everything).toEqual(ada);
    const mine = filterEntries(ada, { families: FAMILIES, mineOnly: true });
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.role !== null)).toBe(true);
    expect(mine.some((e) => e.event.type === 'productLaunch')).toBe(true);
    expect(filterEntries(ada, { families: [], mineOnly: false })).toEqual([]);
    // Chaque type d'événement appartient à une famille qui a sa case.
    for (const family of Object.values(EVENT_FAMILY)) expect(FAMILIES).toContain(family);
  });
});

/**
 * Faillite d'Ada (§5.7) : lancement d'un produit, un trimestre ruineux (pire perte du T1), puis plus de
 * quoi payer ses obligations — la faillite clos le T2 mais paraît au N° 3.
 */
function bankruptcyGame(lang: Lang): { g: GameState; companyId: string } {
  const g = createGame({ seed: 5, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [
    seat('ada', 'Ada', 'Atelier Ada', 'gadgets', 0),
    seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
  ]);
  const c = Object.values(g.companies).find((x) => x.founderId === 'ada')!;
  ok(applyAction(g, 'ada', { type: 'launchProduct', companyId: c.id, sectorId: 'yogurts', name: 'Yaourt Ada' }));
  // Un trimestre ruineux : ses derniers comptes affichent la pire perte du trimestre.
  ok(applyAction(g, 'ada', { type: 'setProductDecisions', companyId: c.id, productId: c.products[0].id, marketing: 5000 }));
  resolveTurn(g);
  // Puis plus de quoi payer ses obligations : faillite en tête de la clôture suivante (§5.7).
  c.debt = 1e6;
  resolveTurn(g);
  expect(g.companies[c.id].status).toBe('bankrupt');
  return { g, companyId: c.id };
}

/** Vue réduite à ce que lit la reconstitution (qui regarde, entreprises, numéros), pour des cas précis. */
function fakeView(you: string, companies: { id: string; controllerId: string | null }[], issues: { turn: number; articles: Partial<Article>[] }[]): PlayerView {
  return {
    you,
    turn: issues.at(-1)!.turn,
    config: { totalTurns: 8, startYear: 2027, lang: 'fr' },
    players: [],
    companies: companies.map((c) => ({ status: 'active', products: [], ...c })),
    journal: issues.map((i) => ({
      turn: i.turn,
      dateLabel: `T${i.turn}`,
      rumors: [],
      articles: i.articles.map((a, k) => ({ id: `a${i.turn}-${k}`, title: 'titre', body: '', tone: 'neutral', kind: 'flash', ...a })),
    })),
  } as unknown as PlayerView;
}

describe('chronologie : qui dirigeait quoi, au moment des faits', () => {
  it('les comptes du trimestre restent au dirigeant de l’époque, même publiés après une passation', () => {
    // Un appel de marge a vidé la ligne d'Ada pendant la résolution du T2 : passation à Bob (flash du T2).
    // Les résultats du T2 paraissent au T3, après la passation.
    const issues = [
      { turn: 2, articles: [{ companyIds: ['x'], event: { type: 'controlHandover' as const, actorId: 'bob', subjectId: 'ada' } }] },
      {
        turn: 3,
        articles: [
          { kind: 'results' as const, companyIds: ['x'], event: { type: 'bigLoss' as const, leaderId: 'ada', amount: 100 } },
          { kind: 'results' as const, companyIds: ['x'], event: { type: 'scandal' as const, leaderId: 'ada', amount: 10 } },
          { companyIds: ['x'], event: { type: 'dividend' as const, actorId: 'bob', amount: 5 } },
          { companyIds: ['x'], event: { type: 'whistleblow' as const } },
        ],
      },
    ];
    const companies = [{ id: 'x', controllerId: 'bob' }];
    expect(timelineEntries(fakeView('ada', companies, issues)).map((e) => e.role)).toEqual(['subject', 'company', 'company', null, null]);
    expect(timelineEntries(fakeView('bob', companies, issues)).map((e) => e.role)).toEqual(['actor', null, null, 'actor', 'company']);
  });

  it('faillite : la perte est à Ada, ses derniers comptes aussi, et son produit disparu garde son secteur', () => {
    const { g, companyId } = bankruptcyGame('fr');
    const view = getPlayerView(g, 'ada');
    const ada = timelineEntries(view);
    expect(find(ada, 'bankruptcy').role).toBe('subject');
    expect(find(ada, 'bigLoss', companyId).role).toBe('company');
    expect(lastLosses(ada).map((e) => e.event.type)).toEqual(['bankruptcy']);
    expect(text(view, find(ada, 'bankruptcy'), 'fr').line).toBe('Votre entreprise Atelier Ada fait faillite.');
    const sector = getContent('fr').sectors.yogurts.name;
    expect(text(view, find(ada, 'productLaunch', companyId), 'fr').line).toBe(`Atelier Ada lance un nouveau produit (${sector}).`);
    expect(find(timelineEntries(getPlayerView(g, 'bob')), 'bigLoss', companyId).role).toBeNull();
  });

  it('passation : Ada vend tout, Bob reprend ; ce qui visait l’entreprise avant restait à Ada', () => {
    const g = createGame({ seed: 5, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr' }, [
      seat('ada', 'Ada', 'Atelier Ada', 'gadgets', 0),
      seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
      seat('cleo', 'Cleo', 'Cleo SA', 'energy_drinks', 2),
    ]);
    const x = Object.values(g.companies).find((c) => c.founderId === 'ada')!;
    resolveTurn(g);
    g.players.bob.cash = 1e9;
    g.players.cleo.cash = 1e9;
    ok(applyAction(g, 'cleo', { type: 'buyShares', companyId: x.id, shares: 1200 }));
    ok(applyAction(g, 'bob', { type: 'buyShares', companyId: x.id, shares: 2600 })); // 26 % : flash
    resolveTurn(g);
    ok(applyAction(g, 'ada', { type: 'sellShares', companyId: x.id, shares: g.companies[x.id].holdings.ada }));
    expect(g.companies[x.id].controllerId).toBe('bob');
    const view = getPlayerView(g, 'ada');
    const ada = timelineEntries(view);
    expect(find(ada, 'stakeBuilding', x.id).role).toBe('company');
    expect(find(timelineEntries(getPlayerView(g, 'cleo')), 'stakeBuilding', x.id).role).toBeNull();
    expect(lastLosses(ada).map((e) => e.event.type)).toEqual(['controlHandover']);
    expect(text(view, find(ada, 'controlHandover'), 'fr').line).toBe('Vous avez vendu toutes vos actions d’Atelier Ada : Bob prend les commandes.');
    const bob = getPlayerView(g, 'bob');
    expect(text(bob, find(timelineEntries(bob), 'controlHandover'), 'fr').line).toBe('Ada a vendu toutes ses actions d’Atelier Ada : vous prenez les commandes.');
  });

  it('fusion : ce qui visait l’entreprise absorbée restait à celui qui l’a absorbée', () => {
    const g = createGame({ seed: 5, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr' }, [
      seat('ada', 'Ada', 'Atelier Ada', 'gadgets', 0),
      seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
    ]);
    resolveTurn(g);
    const mine = Object.values(g.companies).find((c) => c.founderId === 'ada')!;
    const npc = Object.values(g.companies).find((c) => c.npcDefId && c.status === 'active')!;
    g.players.ada.cash = 1e9;
    g.players.bob.cash = 1e9;
    ok(applyAction(g, 'ada', { type: 'buyShares', companyId: npc.id, shares: 5001 }));
    ok(applyAction(g, 'bob', { type: 'buyShares', companyId: npc.id, shares: 2600 }));
    ok(applyAction(g, 'ada', { type: 'merge', absorberId: mine.id, targetId: npc.id }));
    expect(g.companies[npc.id].status).toBe('merged');
    const ada = timelineEntries(getPlayerView(g, 'ada'));
    expect(find(ada, 'takeover', npc.id).role).toBe('actor');
    expect(find(ada, 'stakeBuilding', npc.id).role).toBe('company');
    expect(find(ada, 'merger', npc.id).role).toBe('actor');
    expect(find(timelineEntries(getPlayerView(g, 'bob')), 'stakeBuilding', npc.id).role).toBe('actor');
  });
});

describe('chronologie : phrases', () => {
  const L = messages('fr').history.lines;

  it('élide « de » comme le journal (voyelle, h, y suivi d’une consonne)', () => {
    expect(L.stakeBuilding('Bob', '26 %', 'Atelier Ada')).toBe('Bob détient désormais 26 % d’Atelier Ada.');
    expect(L.stakeBuilding('Bob', '26 %', 'Hôtel Lux')).toBe('Bob détient désormais 26 % d’Hôtel Lux.');
    expect(L.stakeBuilding('Bob', '26 %', 'Ypsilon')).toBe('Bob détient désormais 26 % d’Ypsilon.');
    expect(L.stakeBuilding('Bob', '26 %', 'Yaourtière')).toBe('Bob détient désormais 26 % de Yaourtière.');
    expect(L.stakeBuilding('Bob', '26 %', 'Bob Corp')).toBe('Bob détient désormais 26 % de Bob Corp.');
  });

  it('un appel de marge couvert par le cash ne parle pas de ventes forcées', () => {
    const view = fakeView('ada', [], [{ turn: 2, articles: [{ kind: 'results', event: { type: 'marginCall', subjectId: 'ada', amount: 0 } }] }]);
    const [entry] = timelineEntries(view);
    expect(text(view, entry, 'fr').line).toBe(L.marginCallCashMe);
    expect(text(view, entry, 'en').line).toBe(messages('en').history.lines.marginCallCashMe);
  });

  it('accorde l’annonce vocale d’une colonne au nombre d’événements', () => {
    const h = messages('fr').history;
    expect(h.quarterAria('T2 2027', 1, true)).toBe('T2 2027 : 1 événement, qui vous concerne');
    expect(h.quarterAria('T2 2027', 3, true)).toBe('T2 2027 : 3 événements, dont au moins un vous concerne');
    expect(messages('en').history.quarterAria('Q2 2027', 1, true)).toBe('Q2 2027: 1 event, involving you');
  });
});

describe('chronologie : robustesse', () => {
  it('le nom d’un bot repris reste l’ancien pour ce qu’il a fait avant la reprise', () => {
    const p = { id: 'b', name: 'Alice', botTakeover: { previousName: 'Gordon', activeFromTurn: 5 } } as PublicPlayer;
    expect(nameAt(p, 4)).toBe('Gordon');
    expect(nameAt(p, 5)).toBe('Alice');
    expect(nameAt({ ...p, botTakeover: undefined }, 1)).toBe('Alice');
  });

  it.each(['fr', 'en'] as const)('une partie de bots (%s) : toutes les phrases sont complètes, dans les deux langues', (lang) => {
    const bots = getContent(lang).bots.slice(0, 7);
    const g = createGame({ seed: 9, totalTurns: 16, turnSeconds: 90, startYear: 2027, lang }, [
      seat('human', 'Ada', 'Atelier Ada', 'gadgets', 0),
      ...bots.map((b, i) => ({ ...seat(`bot${i}`, b.ceoName, b.companyName, b.preferredSectors[0], (i + 1) % PLAYER_COLORS.length), isBot: true, botPersonalityId: b.id })),
    ]);
    for (let t = 0; t < 12; t++) resolveTurn(g);
    const view = getPlayerView(g, 'human');
    const entries = timelineEntries(view);
    expect(entries.length).toBeGreaterThan(20);
    expect(new Set(entries.map((e) => e.event.type)).size).toBeGreaterThan(4);
    for (const e of entries) {
      expect(EVENT_ICON[e.event.type]).toBeTruthy();
      expect(EVENT_WEIGHT[e.event.type]).toBeGreaterThan(0);
      for (const ui of ['fr', 'en'] as const) {
        const { line, extra } = text(view, e, ui);
        expect(`${line} ${extra ?? ''}`, e.event.type).not.toMatch(/undefined|NaN|\[object|Inconnu|Unknown|Quelqu|Someone/);
      }
    }
  });
});

describe.each([
  { uiLang: 'fr' as const, roomLang: 'fr' as const },
  { uiLang: 'en' as const, roomLang: 'fr' as const },
  { uiLang: 'fr' as const, roomLang: 'en' as const },
])('écrans : interface $uiLang, partie $roomLang', ({ uiLang, roomLang }) => {
  const { g } = takeoverGame(roomLang);
  const ui = messages(uiLang);

  it('« Mon entreprise » explique la perte et ouvre l’historique sur ce trimestre', () => {
    const view = getPlayerView(g, 'ada');
    const takeover = find(timelineEntries(view), 'takeover');
    const html = render(view, uiLang, CompanyTab, { company: null, onSelect: () => {}, goTo: () => {}, openIssue: () => {}, openMapFor: () => {} });
    const { line, extra } = text(view, takeover, uiLang);
    const summary = html.match(/<section class="tl-summary"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(summary).toContain(escaped(ui.history.whatHappened));
    expect(summary).toContain(escaped(takeover.dateLabel));
    expect(summary).toContain(escaped(line));
    expect(summary).toContain(escaped(extra!));
    // Le titre du journal reste dans la langue du salon.
    expect(summary).toContain(`<span lang="${roomLang}">${escaped(messages(roomLang).quote(takeover.article.title))}</span>`);
    expect(summary).toContain(escaped(ui.history.readIssue(takeover.turn)));
    // Puis « Mon historique », filtré sur vous, le trimestre de la perte sélectionné.
    const history = html.slice(html.indexOf('class="timeline"'));
    expect(history).toContain(escaped(ui.history.titleMine));
    // Tout ce qui vous concerne : toutes les familles cochées, et la case « seulement moi ».
    for (const f of FAMILIES) expect(history).toContain(`<input type="checkbox" checked=""/><span aria-hidden="true">${FAMILY_ICON[f]}</span> ${escaped(ui.history.families[f])}`);
    expect(history).toContain(`<input type="checkbox" checked=""/><span class="tl-me-dot" aria-hidden="true"></span> ${escaped(ui.history.mineOnly)}</label>`);
    expect(history).toMatch(new RegExp(`data-turn="${takeover.turn}" class="[^"]*selected`));
    expect(history).toContain(escaped(line));
  });

  it('le classement ouvre sur « Fortunes et infortunes » : graphe, frise, filtres et détail du trimestre en cours', () => {
    const view = getPlayerView(g, 'cleo');
    const html = render(view, uiLang, RankingTab, { selectedTurn: null, onSelectTurn: () => {}, openIssue: () => {} });
    const all = timelineEntries(view);
    const takeover = find(all, 'takeover');
    // La section : titre, note du dernier point, aide et légende (une puce par joueur).
    expect(html).toContain('class="rc"');
    expect(html).toContain(escaped(ui.ranking.evolution));
    expect(html).toContain(escaped(ui.ranking.note(view.turn, view.config.totalTurns)));
    expect(html).toContain(`<p class="small muted rc-help">${escaped(ui.ranking.help)}</p>`);
    const legend = html.match(/<ul class="rc-legend">[\s\S]*?<\/ul>/)?.[0] ?? '';
    expect(legend.match(/<li/g)?.length).toBe(view.players.length);
    for (const p of view.players) expect(legend).toContain(p.name);
    // Le graphe et la frise (un curseur unique) partagent la même scène.
    expect(html).toContain('class="chart"');
    expect(html).toContain(`<div class="rc-frieze-wrap" role="slider" tabindex="0" aria-label="${escaped(ui.history.stripAria)}"`);
    // La frise est un SVG : une colonne datée par trimestre de la partie, cliquable jusqu'au trimestre en cours.
    const frieze = html.slice(html.indexOf('rc-frieze-wrap'));
    expect(frieze.match(/class="rc-date[ "]/g)?.length).toBe(view.config.totalTurns);
    expect(frieze.match(/fill="transparent"/g)?.length).toBe(view.turn);
    // Cases par défaut : rachats et scandales cochés, lancements et argent non ; repères sur les courbes cochés.
    const filters = html.match(/<div class="tl-filters"[\s\S]*?<\/div>/)?.[0] ?? '';
    for (const f of FAMILIES) {
      const checked = DEFAULT_FAMILIES.includes(f) ? ' checked=""' : '';
      expect(filters).toContain(`<input type="checkbox"${checked}/><span aria-hidden="true">${FAMILY_ICON[f]}</span> ${escaped(ui.history.families[f])}`);
    }
    expect(filters).toContain(`<input type="checkbox"/><span class="tl-me-dot" aria-hidden="true"></span> ${escaped(ui.history.mineOnly)}</label>`);
    expect(filters).toContain(`<input type="checkbox" checked=""/>${escaped(ui.history.pinsToggle)}`);
    // Le détail suit le trimestre en cours, avec le bouton vers le numéro correspondant.
    const detail = html.slice(html.indexOf('class="rc-detail"'));
    const col = quarters(view, filterEntries(all, { families: DEFAULT_FAMILIES, mineOnly: false })).find((c) => c.turn === view.turn)!;
    expect(detail).toContain(escaped(`${col.label} · ${ui.history.events(col.entries.length)}`));
    expect(detail).toContain(escaped(ui.history.readIssue(view.turn)));
    expect(detail).toContain(escaped(text(view, takeover, uiLang).line));
    // Le titre du numéro est désormais affiché sous chaque événement, dans la langue du salon, et cliquable.
    expect(detail).toContain('class="tl-issue-link"');
    expect(detail).toContain(`<span lang="${roomLang}">${escaped(messages(roomLang).quote(takeover.article.title))}</span>`);
    // Le dividende de Bob (famille « argent ») est masqué, mais signalé.
    const dividend = find(all, 'dividend');
    expect(detail).not.toContain(escaped(text(view, dividend, uiLang).line));
    const quarter = all.filter((e) => e.quarter === view.turn);
    const hidden = quarter.length - filterEntries(quarter, { families: DEFAULT_FAMILIES, mineOnly: false }).length;
    expect(hidden).toBeGreaterThan(0);
    expect(detail).toContain(escaped(ui.history.hidden(hidden)));
  });
});


describe.each(['fr', 'en'] as const)('écran « Mon entreprise » après faillite (%s)', (uiLang) => {
  it('ouvre l’historique sur le trimestre clos, pas sur le numéro qui l’a parue', () => {
    const { g } = bankruptcyGame('fr');
    const view = getPlayerView(g, 'ada');
    const ui = messages(uiLang);
    const entries = timelineEntries(view);
    const loss = lastLosses(entries)[0];
    expect(loss.event.type).toBe('bankruptcy');
    // La faillite clos le T2 mais paraît au N° 3 : les deux repères doivent rester distincts.
    expect(loss.quarter).toBe(2);
    expect(loss.turn).toBe(3);
    const html = render(view, uiLang, CompanyTab, { company: null, onSelect: () => {}, goTo: () => {}, openIssue: () => {}, openMapFor: () => {} });

    // « Ce qui s'est passé » : daté du trimestre de la perte (T2 2027, langue du salon) ; « Lire le N° »
    // vise toujours le numéro de parution.
    const summary = html.match(/<section class="tl-summary"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(summary).toContain(escaped(ui.history.whatHappened));
    expect(summary).toContain(escaped('T2 2027'));
    expect(summary).toContain(escaped(ui.history.readIssue(loss.turn)));

    // « Mon historique » sélectionne la colonne du trimestre clos (2), pas celle du numéro (3).
    const history = html.slice(html.indexOf('class="timeline"'));
    expect(history).toMatch(/data-turn="2" class="[^"]*selected/);
    expect(history).not.toMatch(/data-turn="3" class="[^"]*selected/);
    const detail = history.slice(history.indexOf('class="tl-detail"'));
    expect(detail).toContain(escaped(text(view, loss, uiLang).line));
    // Un résultat daté du trimestre qu'il clos rappelle son numéro de parution, et le titre du journal
    // devient un lien vers ce numéro.
    expect(detail).toContain(escaped(ui.history.publishedIn(loss.turn)));
    expect(detail).toContain('class="tl-issue-link"');
  });
});
