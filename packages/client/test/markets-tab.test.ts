import { Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_COLORS, SECTORS, createGame, getContent, getPlayerView, hexPlaceLabel, type CompanyView, type HexBid, type Lang, type PlayerView, type SectorId } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { MarketsTab, bestCellLaunch, ownSectorIds, priceSensitivity } from '../src/screens/game/MarketsTab';
import { bestLaunchCell, openingSign } from '../src/screens/game/city/model';
import { getState, setState, type AppState } from '../src/store';

/**
 * Sans DOM de test, l'état « lignes dépliées » (le seul useState initialisé à une liste vide dans l'onglet) est forcé
 * par le test ; les autres useState gardent leur comportement.
 */
const hooks = vi.hoisted(() => ({ expanded: null as string[] | null }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      hooks.expanded && Array.isArray(initial) && initial.length === 0 ? [hooks.expanded, vi.fn()] : actual.useState(initial as never),
  };
});
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
afterEach(() => {
  setState(initial);
  hooks.expanded = null;
});
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
const count = (html: string, part: string) => html.split(part).length - 1;

/** Un humain (yaourts sur la carte classique, gadgets sur le plateau) et un rival humain. */
function fixture(lang: Lang, hex = false): PlayerView {
  const g = createGame(
    { seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, ...(hex ? { mapMode: 'hex' as const, terrainAssignment: 'fair' as const } : {}) },
    [
      { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: hex ? 'gadgets' : 'yogurts', connected: true, color: PLAYER_COLORS[0] },
      { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'scooters', connected: true, color: PLAYER_COLORS[1] },
    ],
  );
  const view = getPlayerView(g, 'human');
  // Plateau : toutes les paires (secteur, case) passent à « non rentable » ; chaque test pose les siennes.
  if (hex) for (const s of view.sectors) for (const e of Object.values(s.launchByHex ?? {})) e.paybackQuarters = null;
  return view;
}

function pair(view: PlayerView, sectorId: SectorId, hexId: string, payback: number | null, profit: number) {
  view.sectors.find((s) => s.id === sectorId)!.launchByHex![hexId] = { unitCost: 10, quarterlyProfit: profit, paybackQuarters: payback, demand: 100 };
}

function liveBid(view: PlayerView, hexId: string, kind: HexBid['kind']) {
  const mine = view.companies.find((c) => c.private && c.controllerId === view.you)!;
  (view.self!.hexBids ??= []).push({ kind, companyId: mine.id, playerId: view.you, hexId, amount: 100, turn: view.turn });
}

function render(view: PlayerView, lang: Lang, openMapFor = vi.fn(), company: CompanyView | null = null): string {
  setState({ lang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(MarketsTab, { openMapFor, company }) }));
}

/** Remplit les emplacements de produit d'une de mes entreprises (chantiers fictifs). */
function fillSlots(company: CompanyView) {
  const projects = (company.private!.launchProjects ??= []);
  while (company.products.length + projects.length < (company.maxProducts ?? 4)) projects.push({ id: `p${projects.length}` } as (typeof projects)[number]);
}

/** Une deuxième entreprise à moi, sans produit (donc avec de la place). */
function secondCompany(view: PlayerView): CompanyView {
  const first = view.companies.find((c) => c.controllerId === view.you)!;
  const second: CompanyView = { ...first, id: 'second', ticker: 'SCND', products: [], private: { ...first.private!, launchProjects: [] } };
  view.companies.push(second);
  return second;
}

describe('Marchés : modèles purs', () => {
  it('la sensibilité au prix en trois mots, sur l’élasticité du secteur', () => {
    expect(priceSensitivity(SECTORS.gadgets.elasticity)).toBe('high');
    expect(priceSensitivity(SECTORS.scooters.elasticity)).toBe('medium');
    expect(priceSensitivity(SECTORS.energy_drinks.elasticity)).toBe('medium');
    expect(priceSensitivity(SECTORS.yogurts.elasticity)).toBe('low');
    expect(priceSensitivity(SECTORS.crypto.elasticity)).toBe('low');
  });

  it('mes secteurs : ceux où une de mes entreprises a un produit', () => {
    const view = fixture('fr');
    const mine = view.companies.filter((c) => c.controllerId === view.you);
    expect([...ownSectorIds(mine)]).toEqual(['yogurts']);
    expect(ownSectorIds([])).toEqual(new Set());
  });

  it('meilleure case libre : la règle du panneau Occasion, secteur par secteur', () => {
    const view = fixture('fr', true);
    const [a, b] = view.sectors.filter((s) => s.id !== 'gadgets');
    const [h0, h1, h2] = view.hexes!.free;
    const left = Math.max(0, view.config.totalTurns - view.turn + 1);
    pair(view, a.id, h0, 3, 100);
    pair(view, a.id, h1, 3, 200); // même délai, plus gros bénéfice
    pair(view, a.id, h2, left + 1, 1e9); // remboursé trop tard
    expect(bestLaunchCell(view, a)).toEqual({ hexId: h1, payback: 3, profit: 200 });
    // Aucune case rentable à temps pour b.
    pair(view, b.id, h2, left + 1, 1e9);
    expect(bestLaunchCell(view, b)).toBeNull();
    // Le panneau Occasion désigne la meilleure de ces cases.
    expect(openingSign(view)).toEqual({ kind: 'launch', sectorId: a.id, hexId: h1, payback: 3, profit: 200 });
    // Une mise en attente sur la case écarte celle-ci, ici comme sur la carte.
    liveBid(view, h1, 'launch');
    expect(bestLaunchCell(view, a)).toEqual({ hexId: h0, payback: 3, profit: 100 });
    expect(openingSign(view)).toEqual({ kind: 'launch', sectorId: a.id, hexId: h0, payback: 3, profit: 100 });
  });

  it('« Voir sur la carte » : l’intention de lancement vise la case, pour l’entreprise qui a de la place', () => {
    const view = fixture('fr', true);
    const sector = view.sectors.find((s) => s.id === 'yogurts')!;
    const hex = view.hexes!.free[3];
    pair(view, sector.id, hex, 2, 300);
    const mine = view.companies.find((c) => c.controllerId === view.you)!;
    expect(bestCellLaunch(view, sector)).toEqual({
      cell: { hexId: hex, payback: 2, profit: 300 },
      intent: { kind: 'launch', companyId: mine.id, sectorId: 'yogurts', hexId: hex },
    });
    // Plus d'emplacement libre : la case reste nommée, sans intention.
    fillSlots(mine);
    expect(bestCellLaunch(view, sector)).toEqual({ cell: { hexId: hex, payback: 2, profit: 300 }, intent: null });
    // Carte classique : pas de case.
    expect(bestLaunchCell(fixture('fr'), sector)).toBeNull();
  });

  it('« Voir sur la carte » lance avec l’entreprise sélectionnée si elle a de la place, comme depuis la carte', () => {
    const view = fixture('fr', true);
    const sector = view.sectors.find((s) => s.id === 'yogurts')!;
    const hex = view.hexes!.free[3];
    pair(view, sector.id, hex, 2, 300);
    const first = view.companies.find((c) => c.controllerId === view.you)!;
    const second = secondCompany(view);
    // Sans sélection : la première qui a de la place ; la deuxième sélectionnée : elle lance.
    expect(bestCellLaunch(view, sector)?.intent).toMatchObject({ companyId: first.id });
    expect(bestCellLaunch(view, sector, second)?.intent).toEqual({ kind: 'launch', companyId: second.id, sectorId: 'yogurts', hexId: hex });
    // La sélectionnée est pleine : retour à la première qui a de la place.
    fillSlots(second);
    expect(bestCellLaunch(view, sector, second)?.intent).toMatchObject({ companyId: first.id });
  });
});

describe.each(['fr', 'en'] as const)('onglet Marchés (%s)', (lang) => {
  const t = messages(lang);
  const fmt = fmtFor(lang);
  const names = getContent(lang).sectors;

  it('mes secteurs d’abord en fiche complète ; les autres sur une ligne qui se déplie', () => {
    const view = fixture(lang);
    const html = render(view, lang);
    expect(count(html, '<article class="sector-panel">')).toBe(1);
    expect(html.indexOf(escaped(names.yogurts.name))).toBeLessThan(html.indexOf(`<h3>${escaped(t.markets.othersTitle)}</h3>`));
    expect(count(html, 'class="market-row-toggle"')).toBe(4);
    expect(count(html, 'aria-expanded="false"')).toBe(4);
    // Une ligne : prix de référence, demande, conjoncture et, sur la carte classique, l'estimation du moteur.
    const gadgets = view.sectors.find((s) => s.id === 'gadgets')!;
    const row = html.slice(html.indexOf(escaped(names.gadgets.name)), html.indexOf('</tr>', html.indexOf(escaped(names.gadgets.name))));
    expect(row).toContain(escaped(t.common.perLot(fmt.money(gadgets.refPrice))));
    expect(row).toContain(`×${escaped(fmt.num(gadgets.demandMultiplier))}`);
    const e = gadgets.launchEstimate!;
    expect(row).toContain(escaped(e.paybackQuarters !== null ? t.markets.payback(e.paybackQuarters) : t.markets.noPayback));
    expect(html).toContain(`<th>${escaped(t.markets.launchLabel)}</th>`);
    // « Marché de référence » : seulement dans les fiches.
    expect(count(html, escaped(t.markets.refMarket))).toBe(1);
  });

  it('une ligne dépliée montre la fiche complète du secteur sous elle (bouton au clavier, aria-expanded)', () => {
    hooks.expanded = ['gadgets'];
    const html = render(fixture(lang), lang);
    expect(count(html, '<article class="sector-panel">')).toBe(2);
    expect(html).toContain('aria-expanded="true" aria-controls="sector-detail-gadgets"');
    expect(html).toContain('<tr id="sector-detail-gadgets" class="market-row-detail"><td colSpan="5"><article class="sector-panel">');
    expect(count(html, escaped(t.markets.refMarket))).toBe(2);
  });

  it('l’intro passe en infobulle ; les prix des rivaux gardent une étiquette visible ; sensibilité au prix en mot', () => {
    const html = render(fixture(lang), lang);
    expect(html).not.toContain('class="small muted intro"');
    expect(html).toContain(`aria-label="${escaped(t.markets.intro)}"`);
    expect(html).toContain(`>${escaped(t.markets.pricesTag)}</span>`);
    expect(html).toContain(escaped(t.markets.sensitivity(t.markets.sensitivityLevels.low)));
    expect(html).toContain(`aria-label="${escaped(t.markets.elasticityTip(fmt.num(SECTORS.yogurts.elasticity)))}"`);
  });

  it('la courbe de demande attend deux trimestres', () => {
    const view = fixture(lang);
    const own = view.sectors.find((s) => s.id === 'yogurts')!;
    own.demandHistory = [];
    let html = render(view, lang);
    expect(html).toContain(escaped(t.markets.noSalesYet));
    expect(html).not.toContain(escaped(t.markets.demandChart));
    own.demandHistory = [200];
    html = render(view, lang);
    expect(html).not.toContain(escaped(t.markets.noSalesYet));
    expect(html).not.toContain(escaped(t.markets.demandChart));
    own.demandHistory = [200, 230];
    html = render(view, lang);
    expect(html).toContain(escaped(t.markets.demandChart));
  });

  it('plateau : la meilleure case libre remplace « Si vous lanciez ici », même quand la case par défaut n’est pas rentable', () => {
    const view = fixture(lang, true);
    const yogurts = view.sectors.find((s) => s.id === 'yogurts')!;
    const crypto = view.sectors.find((s) => s.id === 'crypto')!;
    const hex = view.hexes!.free[2];
    // L'estimation du moteur à sa case par défaut dirait « pas rentable »…
    yogurts.launchEstimate = { quarterlyProfit: -10, paybackQuarters: null };
    // …mais une case libre se rembourse en 3 trimestres.
    pair(view, yogurts.id, hex, 3, 500);
    const place = hexPlaceLabel(hex, lang, view.siteSlots);
    const html = render(view, lang);
    expect(html).not.toContain(escaped(t.markets.launchLabel));
    expect(html).not.toContain(escaped(t.markets.noPayback));
    expect(html).toContain(`${escaped(t.markets.bestCellLabel)} <span class="info-tip`);
    expect(html).toContain(escaped(`${place} · ${t.markets.payback(3)}`));
    expect(html).toContain(`aria-label="${escaped(t.markets.onMapAria(names.yogurts.name, place))}"`);
    // Aucune case rentable à temps pour la crypto : on le dit.
    expect(bestLaunchCell(view, crypto)).toBeNull();
    const cryptoRow = html.slice(html.indexOf(escaped(names.crypto.name)), html.indexOf('</tr>', html.indexOf(escaped(names.crypto.name))));
    expect(cryptoRow).toContain(escaped(t.markets.noCell));
  });

  it('plateau, fiche dépliée : la case, le délai, le bénéfice et le bouton vers la carte, une seule fois', () => {
    const view = fixture(lang, true);
    const hex = view.hexes!.free[1];
    pair(view, 'yogurts', hex, 2, 640);
    hooks.expanded = ['yogurts'];
    const place = hexPlaceLabel(hex, lang, view.siteSlots);
    const html = render(view, lang);
    const card = html.slice(html.indexOf('<tr id="sector-detail-yogurts"'));
    expect(card).toContain(escaped(t.markets.bestCell(place, 2, fmt.money(640))));
    expect(card).toContain(`>${escaped(t.markets.onMap)}</button>`);
    // La ligne dépliée laisse le bouton à sa fiche : un seul « Voir sur la carte » pour ce secteur.
    const aria = `aria-label="${escaped(t.markets.onMapAria(names.yogurts.name, place))}"`;
    expect(count(html, aria)).toBe(1);
    expect(html.indexOf(aria)).toBeGreaterThan(html.indexOf('<tr id="sector-detail-yogurts"'));
    // Mon propre secteur (gadgets), sans case rentable posée : la fiche le dit en toutes lettres.
    expect(html).toContain(escaped(t.markets.bestCellNone));
  });

  it('plateau : le nom accessible du bouton commence par son texte visible ; la règle est dite sans nommer de panneau', () => {
    const visible = t.markets.onMap.replace('📍', '').trim();
    expect(t.markets.onMapAria('X', 'Y').startsWith(visible)).toBe(true);
    expect(t.markets.bestCellTip).not.toMatch(/Occasion|Opportunity/);
  });

  it('plateau : l’entreprise sélectionnée lance ; sans emplacement libre, la case est suivie de « aucun emplacement libre »', () => {
    const view = fixture(lang, true);
    const hex = view.hexes!.free[1];
    pair(view, 'yogurts', hex, 2, 640);
    const second = secondCompany(view);
    let html = render(view, lang, vi.fn(), second);
    expect(html).toContain(`>${escaped(t.markets.onMap)}</button>`);
    expect(html).not.toContain(escaped(t.markets.noSlot));
    // Toutes mes entreprises sont pleines : plus de bouton, la mention le dit.
    for (const c of view.companies.filter((x) => x.controllerId === view.you)) fillSlots(c);
    html = render(view, lang, vi.fn(), second);
    expect(html).not.toContain(`>${escaped(t.markets.onMap)}</button>`);
    const row = html.slice(html.indexOf(escaped(names.yogurts.name)), html.indexOf('</tr>', html.indexOf(escaped(names.yogurts.name))));
    expect(row).toContain(escaped(t.markets.noSlot));
  });

  it('entente dans le secteur : l’étiquette des prix et la barre du partenaire disent « ce trimestre »', () => {
    const view = fixture(lang);
    const scooters = view.sectors.find((s) => s.id === 'scooters')!;
    const beta = view.companies.find((c) => c.controllerId === 'rival')!;
    const mine = view.companies.find((c) => c.controllerId === view.you)!;
    scooters.shares = [
      { productId: beta.products[0].id, companyId: beta.id, name: beta.products[0].name, share: 0.4 },
      { productId: 'others', companyId: null, name: 'others', share: 0.6 },
    ];
    hooks.expanded = ['scooters'];
    let html = render(view, lang);
    let card = html.slice(html.indexOf('<tr id="sector-detail-scooters"'));
    expect(card).toContain(`>${escaped(t.markets.pricesTag)}</span>`);
    expect(card).not.toContain(escaped(t.markets.partnerPrice));
    view.self = {
      ...view.self!,
      cartels: [{ id: 'k1', sectorId: 'scooters', since: 1, risk: 0.1, members: [{ companyId: mine.id, controllerId: view.you }, { companyId: beta.id, controllerId: 'rival' }] }],
    };
    html = render(view, lang);
    card = html.slice(html.indexOf('<tr id="sector-detail-scooters"'));
    expect(card).toContain(`>${escaped(t.markets.pricesTag)}${escaped(t.markets.pricesTagPartners)}</span>`);
    expect(card).toContain(escaped(t.markets.partnerPrice));
    // Une entente dans un autre secteur ne change rien ici.
    view.self = { ...view.self!, cartels: [{ ...view.self!.cartels![0], sectorId: 'gadgets' }] };
    html = render(view, lang);
    card = html.slice(html.indexOf('<tr id="sector-detail-scooters"'));
    expect(card).not.toContain(escaped(t.markets.partnerPrice));
  });
});
