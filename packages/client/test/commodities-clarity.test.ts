import { Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMODITIES, createGame, getContent, getPlayerView, type Lang, type SupplyContract, type SupplySiteView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { CommoditiesTab, commodityInUse, placeCommodityCards, splitCommodities } from '../src/screens/game/CommoditiesTab';
import { commodityOrderMax, commodityOutlook, commodityShortfall } from '../src/rules';
import { fmtFor } from '../src/fmt';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

/**
 * Sans DOM de test, la répartition des cartes retenue plus tôt dans le trimestre (le useState de l'onglet initialisé à
 * `{ turn, ids }`) est forcée par le test ; les autres useState gardent leur comportement.
 */
const hooks = vi.hoisted(() => ({ placed: null as { turn: number; ids: string[] } | null }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      hooks.placed && initial !== null && typeof initial === 'object' && 'ids' in initial ? [hooks.placed, vi.fn()] : actual.useState(initial as never),
  };
});

const initialState = getState();
afterEach(() => {
  setState(initialState);
  hooks.placed = null;
});
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function render(lots: number, lang: Lang) {
  const game = createGame(
    { seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Acme', sectorId: 'gadgets', connected: true, color: '#123456' }],
  );
  const view = getPlayerView(game, 'human');
  const company = view.companies.find((c) => c.controllerId === 'human')!;
  company.private!.inventory.oil = { lots, avgCost: 10 };
  setState({ lang, view, lobby: null });
  const html = renderToStaticMarkup(createElement(GameProvider, {
    view,
    children: createElement(CommoditiesTab, { company, onSelect: vi.fn() }),
  }));
  const oilCard = html.split('<article class="commodity-card">').find((part) => part.includes(`<strong>${getContent(lang).commodities.oil.name}</strong>`))?.split('</article>')[0];
  expect(oilCard).toBeDefined();
  return { html, oilCard: oilCard!, company };
}

describe.each(['fr', 'en'] as const)('matières — %s', (lang) => {
  it('place les besoins de l’entreprise sélectionnée avant les cartes de marché', () => {
    const { html, company } = render(0.9, lang);
    const title = messages(lang).commodities.needsTitle(company.name);
    const heading = renderToStaticMarkup(createElement('h3', null, title));
    expect(html).toContain(heading);
    expect(html.indexOf(heading)).toBeLessThan(html.indexOf('class="commodity-grid"'));
  });

  it('réserve le message d’entrepôt vide au stock nul', () => {
    const { oilCard } = render(0, lang);
    expect(oilCard).toContain(messages(lang).commodities.empty);
    expect(oilCard).not.toContain(messages(lang).commodities.belowOneLot);
  });

  it('affiche 0,9 sans arrondir à 1 et explique le reliquat non vendable', () => {
    const { oilCard } = render(0.9, lang);
    expect(oilCard).toContain(lang === 'fr' ? '<strong>0,9 lot</strong>' : '<strong>0.9 lots</strong>');
    expect(oilCard).toContain(messages(lang).commodities.belowOneLot);
    expect(oilCard).not.toContain(messages(lang).commodities.empty);
    const sellForm = oilCard.split('<form class="amount-form">')[2];
    expect(sellForm).toContain('disabled=""');
  });

  it('permet la vente dès un lot entier sans message de reliquat', () => {
    const { oilCard } = render(1, lang);
    expect(oilCard).toContain('<strong>1 lot</strong>');
    expect(oilCard).not.toContain(messages(lang).commodities.belowOneLot);
    expect(oilCard).not.toContain(messages(lang).commodities.empty);
    const sellForm = oilCard.split('<form class="amount-form">')[2];
    expect(sellForm).toMatch(/<input[^>]*value=""\/>/);
    expect(sellForm).not.toMatch(/<input[^>]*disabled/);
  });

  it('permet de vendre le lot restant après des consommations décimales', () => {
    const stock = 7 - 19 * 0.3 - 1 * 0.3;
    expect(stock).toBeLessThan(1);
    const { oilCard } = render(stock, lang);
    expect(oilCard).toContain('<strong>1 lot</strong>');
    expect(oilCard).not.toContain(messages(lang).commodities.belowOneLot);
    const sellForm = oilCard.split('<form class="amount-form">')[2];
    expect(sellForm).toContain(messages(lang).common.maxOf('1 lots'));
    expect(sellForm).not.toMatch(/<input[^>]*disabled/);
  });
});

describe('matières d’ici la prochaine production : filiales et contrats comptés', () => {
  /** Une entreprise de boissons (0,5 lot de sucre par lot produit) qui produit 60 lots : 30 lots de sucre. */
  function drinks() {
    const game = createGame(
      { seed: 5, totalTurns: 8, turnSeconds: 90, startYear: 2027 },
      [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Acme', sectorId: 'energy_drinks', connected: true, color: '#123456' }],
    );
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((c) => c.controllerId === 'human')!;
    const p = company.products[0];
    p.capacity = 100;
    p.private!.production = 60;
    p.private!.marketing = 0;
    p.private!.rnd = 0;
    company.cash = 10_000;
    company.private!.inventory = { sugar: { lots: 5, avgCost: 30 } };
    // Vue retouchée à la main : le plan de clôture du moteur ne la suit plus. Sans lui, chaque filiale en service
    // compte à pleine capacité (le plan, lui, est vérifié plus bas sur une vraie partie).
    delete company.private!.closePlan;
    return { view, company };
  }
  const site = (over: Partial<SupplySiteView> = {}): SupplySiteView => ({
    id: 'sugar-1',
    commodityId: 'sugar',
    capacity: 40,
    unitCost: 30,
    activeFrom: 1,
    name: 'Sucrerie',
    currentUnitCost: 30,
    upkeep: 300,
    ...over,
  });

  it('sans filiale : le manque est le besoin moins le stock', () => {
    const { view, company } = drinks();
    const o = commodityOutlook(company, view.turn).sugar;
    expect(o).toMatchObject({ need: 30, stock: 5, sites: 0, missing: 25, surplus: 0 });
  });

  it('la filiale en service extrait avant la production ; le reste demeure en stock', () => {
    const { view, company } = drinks();
    company.sites = [site()];
    expect(commodityOutlook(company, view.turn).sugar).toMatchObject({ sites: 40, missing: 0, surplus: 15 });
    // Il ne manque plus que le pétrole (0,1 lot par lot produit).
    expect(commodityShortfall(company, view.turn)).toBe(6);
    expect(commodityShortfall(company)).toBe(31);
    // En sommeil ou en chantier : rien n'arrive.
    company.sites = [site({ dormant: true })];
    expect(commodityOutlook(company, view.turn).sugar.sites).toBe(0);
    company.sites = [site({ activeFrom: view.turn + 1 })];
    expect(commodityOutlook(company, view.turn).sugar.sites).toBe(0);
  });

  it('suit le plan de clôture du moteur : besoins extraits d’abord, surplus tant que la trésorerie le paie', () => {
    const game = createGame(
      { seed: 5, totalTurns: 8, turnSeconds: 90, startYear: 2027 },
      [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Acme', sectorId: 'energy_drinks', connected: true, color: '#123456' }],
    );
    const c = Object.values(game.companies).find((x) => x.controllerId === 'human')!;
    const p = c.products[0];
    p.capacity = 100;
    p.production = 60; // 30 lots de sucre
    p.price *= 20; // presque rien ne se vend : la trésorerie paie la production
    c.inventory = {};
    c.sites = [{ id: 'sugar-1', commodityId: 'sugar', capacity: 40, unitCost: 30, activeFrom: 1, cost: 5000 }];
    c.cash = 1e6;
    const rich = getPlayerView(game, 'human').companies.find((x) => x.id === c.id)!.private!.closePlan!;
    expect(rich.sites).toEqual([{ siteId: 'sugar-1', commodityId: 'sugar', needed: 30, surplus: 10, capacity: 40 }]);
    // De quoi payer les obligations, puis la production (extraction des besoins comprise) et le marketing, ventes attendues
    // comprises, garder les obligations d'une clôture, plus 5 lots de surplus.
    const ob = rich.obligations.total;
    c.cash = 2 * ob + rich.production.plannedCost + rich.marketing.planned - rich.sales.planned + 5 * 30 + 1;
    expect(c.cash).toBeGreaterThan(ob);
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((x) => x.id === c.id)!;
    expect(company.private!.closePlan!.shortfall).toBe(0);
    expect(commodityOutlook(company, view.turn).sugar).toMatchObject({ need: 30, sites: 35, missing: 0, surplus: 5 });
  });

  it('les contrats livrent à la clôture : reçus en plus, livrés en moins (dans la limite du stock et de l’extraction)', () => {
    const { view, company } = drinks();
    company.sites = [site()];
    const contract = (over: Partial<SupplyContract>): SupplyContract => ({
      id: 'k1',
      sellerCompanyId: 'other',
      buyerCompanyId: company.id,
      commodityId: 'sugar',
      lots: 10,
      price: 40,
      turnsLeft: 3,
      ...over,
    });
    expect(commodityOutlook(company, view.turn, [contract({})]).sugar).toMatchObject({ contractsIn: 10, surplus: 25 });
    const selling = contract({ sellerCompanyId: company.id, buyerCompanyId: 'other', lots: 30 });
    expect(commodityOutlook(company, view.turn, [selling]).sugar).toMatchObject({ contractsOut: 30, missing: 15, surplus: 0 });
    // Un vendeur ne livre que ce qu'il a : 45 lots au plus.
    expect(commodityOutlook(company, view.turn, [{ ...selling, lots: 80 }]).sugar).toMatchObject({ contractsOut: 45, missing: 30 });
    // Contrat terminé : plus de livraison.
    expect(commodityOutlook(company, view.turn, [contract({ turnsLeft: 0 })]).sugar.contractsIn).toBe(0);
  });

  it.each(['fr', 'en'] as const)('le tableau montre l’arrivée de la filiale et ce qui restera en stock (%s)', (lang) => {
    const { view, company } = drinks();
    company.sites = [site()];
    setState({ lang, view, lobby: null });
    const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(CommoditiesTab, { company, onSelect: vi.fn() }) }));
    const t = messages(lang).commodities;
    // L'ordre des opérations de la clôture est dans l'infobulle de la colonne, plus dans la note.
    expect(html).toContain(`>${t.cols.incoming} <span class="info-tip"`);
    expect(html).toContain(`aria-label="${escaped(t.incomingTip)}"`);
    expect(html).toContain(`>${t.cols.surplus}<`);
    const sugarRow = html.split('<tr>').find((r) => r.includes(getContent(lang).commodities.sugar.name))!;
    expect(sugarRow).toContain('>+40<');
    expect(sugarRow).toContain('>15<');
    expect(sugarRow).not.toContain('class="num down"');
  });
});

describe.each(['fr', 'en'] as const)('matières utilisées d’abord, les autres repliées (%s)', (lang) => {
  const t = messages(lang).commodities;
  const names = getContent(lang).commodities;
  /** Un fabricant de boissons : sucre (0,5 lot par lot produit) et pétrole (0,1) ; ni lithium ni puces. */
  function drinks() {
    const game = createGame(
      { seed: 5, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
      [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Acme', sectorId: 'energy_drinks', connected: true, color: '#123456' }],
    );
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((c) => c.controllerId === 'human')!;
    company.products[0].capacity = 100;
    company.products[0].private!.production = 60;
    company.private!.inventory = {};
    company.sites = [];
    delete company.private!.closePlan;
    view.self = { ...view.self!, contracts: [] };
    return { view, company };
  }
  function renderTab(view: ReturnType<typeof drinks>['view'], company: ReturnType<typeof drinks>['company']) {
    setState({ lang, view, lobby: null });
    return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(CommoditiesTab, { company, onSelect: vi.fn() }) }));
  }
  const cardOf = (html: string, name: string) =>
    html.split('<article class="commodity-card">').find((part) => part.includes(`<strong>${escaped(name)}</strong>`))!.split('</article>')[0];

  it('le tableau des besoins ne garde que sucre et pétrole, le plus demandé d’abord ; lithium et puces sur une ligne grise', () => {
    const { view, company } = drinks();
    const html = renderTab(view, company);
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    const rows = table.split('<tr>').slice(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain(escaped(names.sugar.name));
    expect(rows[1]).toContain(escaped(names.oil.name));
    expect(table).toContain('<tr class="commodities-unused">');
    expect(table).toContain(escaped(t.unused(`${names.lithium.name}, ${names.chips.name}`)));
    // La note tient en une phrase sur les réglages enregistrés ; l'ordre des opérations est dans l'infobulle.
    expect(html).toContain(escaped(t.needsNote(fmtFor(lang).num(1.1))));
    expect(t.needsNote('1,1').length).toBeLessThan(140);
  });

  it('les cartes suivent le besoin ; lithium et puces dans le volet fermé « Autres matières (2) », achat compris', () => {
    const { view, company } = drinks();
    const html = renderTab(view, company);
    const fold = html.indexOf(`<details class="tab-fold"><summary>${escaped(t.otherCards(2))}</summary>`);
    expect(fold).toBeGreaterThan(0);
    const at = (id: 'sugar' | 'oil' | 'lithium' | 'chips') => html.indexOf(`<strong>${escaped(names[id].name)}</strong>`);
    expect(at('sugar')).toBeLessThan(at('oil'));
    expect(at('oil')).toBeLessThan(fold);
    expect(at('lithium')).toBeGreaterThan(fold);
    expect(at('chips')).toBeGreaterThan(fold);
    // Spéculer sur une matière inutilisée reste possible : la carte repliée garde ses formulaires.
    expect(cardOf(html, names.lithium.name)).toContain('<form class="amount-form">');
    // Les recettes, données fixes, dans un volet fermé.
    expect(html).toContain(`<details class="tab-fold"><summary>${escaped(t.recipes)}</summary>`);
  });

  it('une carte ne répète plus le tableau, mais garde le plafond par ordre juste avant les formulaires', () => {
    const { view, company } = drinks();
    company.private!.inventory = { sugar: { lots: 4, avgCost: 30 } };
    const html = renderTab(view, company);
    const sugar = cardOf(html, names.sugar.name);
    const fmt = fmtFor(lang);
    const cap = escaped(t.baseInfo(fmt.sharePrice(COMMODITIES.sugar.basePrice), fmt.lots(commodityOrderMax('sugar'))));
    expect(sugar).toContain(cap);
    // Un ordre plein (la liquidité) multiplie le prix par e ≈ 2,7 : la ligne ne promet plus de « doubler » le prix.
    expect(cap).not.toMatch(/doubl/);
    expect(sugar.indexOf(cap)).toBeGreaterThan(sugar.indexOf('class="inventory small"'));
    expect(sugar.indexOf(cap)).toBeLessThan(sugar.indexOf('<form class="amount-form">'));
    // Besoin et arrivées de la clôture ne sont plus que dans le tableau.
    expect(sugar).not.toMatch(lang === 'fr' ? /à cette clôture|à la clôture/ : /at this close|at the close/);
  });

  it('une matière reste « utilisée » pour un stock, un contrat même non livrable ou une filiale en sommeil', () => {
    const { view, company } = drinks();
    const outlook = () => commodityOutlook(company, view.turn, view.self!.contracts);
    expect(commodityInUse(company, 'lithium', outlook().lithium)).toBe(false);
    // Contrat de vente de lithium sans stock : rien n'est livrable (contractsOut = 0), mais le dédit menace.
    const owed: SupplyContract = { id: 'k1', sellerCompanyId: company.id, buyerCompanyId: 'other', commodityId: 'lithium', lots: 10, price: 40, turnsLeft: 2 };
    expect(commodityOutlook(company, view.turn, [owed]).lithium.contractsOut).toBe(0);
    expect(commodityInUse(company, 'lithium', commodityOutlook(company, view.turn, [owed]).lithium, [owed])).toBe(true);
    // Une filiale de puces en sommeil n'extrait rien, mais elle est à l'entreprise.
    company.sites = [{ id: 'chips-1', commodityId: 'chips', capacity: 40, unitCost: 30, activeFrom: 1, name: 'Fonderie', currentUnitCost: 30, upkeep: 300, dormant: true }];
    expect(outlook().chips.sites).toBe(0);
    expect(commodityInUse(company, 'chips', outlook().chips)).toBe(true);
    // Du stock hérité d'une fusion.
    company.private!.inventory = { lithium: { lots: 3, avgCost: 50 } };
    const { used, unused } = splitCommodities(view.commodities, company, outlook(), view.self!.contracts);
    expect(used.map((c) => c.id)).toEqual(['sugar', 'oil', 'lithium', 'chips']);
    expect(unused).toEqual([]);
    const html = renderTab(view, company);
    expect(html).not.toContain('commodities-unused');
    expect(html).not.toContain(escaped(t.otherCards(0)));
  });

  it('une carte reste où le joueur l’a trouvée jusqu’au trimestre suivant (achat dans le volet, vente du dernier lot)', () => {
    // Pur : la grille reçoit les matières retenues, dans leur ordre ; le volet, les autres dans l'ordre du marché.
    const { view, company } = drinks();
    const placed = placeCommodityCards(view.commodities, ['oil', 'sugar']);
    expect(placed.main.map((c) => c.id)).toEqual(['oil', 'sugar']);
    expect(placed.fold.map((c) => c.id)).toEqual(view.commodities.filter((c) => c.id !== 'oil' && c.id !== 'sugar').map((c) => c.id));
    const at = (html: string, id: 'sugar' | 'oil' | 'lithium' | 'chips') => html.indexOf(`<strong>${escaped(names[id].name)}</strong>`);
    const foldAt = (html: string, n: number) => html.indexOf(`<summary>${escaped(t.otherCards(n))}</summary>`);
    // En début de trimestre : sucre et pétrole dans la grille, lithium et puces dans le volet.
    hooks.placed = { turn: view.turn, ids: ['sugar', 'oil'] };
    // Achat spéculatif de lithium depuis le volet : le tableau montre son stock, mais la carte reste dans le volet.
    company.private!.inventory = { lithium: { lots: 50, avgCost: 40 } };
    let html = renderTab(view, company);
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(table).toContain(escaped(names.lithium.name));
    expect(table).toContain(escaped(t.unused(names.chips.name)));
    expect(foldAt(html, 2)).toBeGreaterThan(0);
    expect(at(html, 'lithium')).toBeGreaterThan(foldAt(html, 2));
    // Vente du dernier lot d'une matière sans besoin trouvée dans la grille : la carte y reste.
    hooks.placed = { turn: view.turn, ids: ['sugar', 'oil', 'lithium'] };
    company.private!.inventory = {};
    html = renderTab(view, company);
    expect(foldAt(html, 1)).toBeGreaterThan(0);
    expect(at(html, 'lithium')).toBeLessThan(foldAt(html, 1));
    expect(html).toContain(escaped(t.unused(`${names.lithium.name}, ${names.chips.name}`)));
    // Au trimestre suivant, la répartition suit de nouveau l'usage : lithium sans stock retourne au volet.
    hooks.placed = { turn: view.turn - 1, ids: ['sugar', 'oil', 'lithium'] };
    html = renderTab(view, company);
    expect(at(html, 'lithium')).toBeGreaterThan(foldAt(html, 2));
  });

  it('sans entreprise : toutes les cartes, rien de replié', () => {
    const { view } = drinks();
    const { used, unused } = splitCommodities(view.commodities, null, null);
    expect(used).toHaveLength(view.commodities.length);
    expect(unused).toEqual([]);
  });
});
