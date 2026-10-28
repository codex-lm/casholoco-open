/**
 * « Mon entreprise » sur un écran : ordre de l'onglet, en-tête (dette et marge d'emprunt, cours, réputation, puce du
 * scandale), sections vides absentes, fiche produit en deux colonnes avec son verdict, ses rangs face aux rivaux et
 * « Caler sur la demande », puis le bloc « Matières pour ce trimestre ». Harnais SSR (ni jsdom ni testing-library) :
 * les onClick sont capturés en moquant le runtime JSX, puis invoqués à la main.
 */
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMMODITIES,
  PLAYER_COLORS,
  SITE_OPENING_COST_MULT,
  applyAction,
  createGame,
  estimateSales,
  getContent,
  getPlayerView,
  resolveTurn,
  type ActionResult,
  type ClosePlan,
  type CompanyView,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type ProductView,
  type SectorId,
  type SupplyContract,
} from '@muchomoney/core';
import { sendAction } from '../src/api';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { EMERGENCY_PURCHASE_MARKUP, commodityBuyCost, commodityOrderMax, maxAffordableLots, maxProductsOf, scandalRisk } from '../src/rules';
import { flushProductSaves, forgetProductSaves } from '../src/productSaves';
import { CompanyTab, companyHasSites, hasHexBids } from '../src/screens/game/CompanyTab';
import { CompanyMaterials, closeReserve, materialGaps } from '../src/screens/game/CompanyMaterials';
import { CRISIS_COMMS_ANCHOR, SHADY_ANCHOR } from '../src/screens/game/ShadyPanel';
import { ProductCard } from '../src/screens/game/ProductCard';
import { productFlow, sectorProducts } from '../src/screens/game/factories/model';
import type { MapIntent } from '../src/screens/game/mapIntent';
import type { TabId } from '../src/screens/GameScreen';
import { getState, setState, type AppState } from '../src/store';

/** Boutons capturés pendant le rendu SSR : on invoque leur onClick à la main. */
const clicks = vi.hoisted(() => ({ els: [] as Record<string, unknown>[] }));

vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-dev-runtime')>();
  return {
    ...actual,
    jsxDEV: (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (props && typeof props.onClick === 'function') clicks.els.push(props);
      return (actual.jsxDEV as (...a: unknown[]) => unknown)(type, props, ...rest);
    },
  };
});

vi.mock('react/jsx-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-runtime')>();
  const wrap =
    <F extends (...args: never[]) => unknown>(fn: F) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (props && typeof props.onClick === 'function') clicks.els.push(props);
      return (fn as (...a: unknown[]) => unknown)(type, props, ...rest);
    };
  return { ...actual, jsx: wrap(actual.jsx), jsxs: wrap(actual.jsxs) };
});

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  sendAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true, message: '' })),
}));

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(async () => {
  forgetProductSaves();
  await flushProductSaves();
  setState(initialState);
  vi.mocked(sendAction).mockClear();
  vi.unstubAllGlobals();
});

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
/** Texte d'un fragment HTML : balises et marques `**` de <Rich> retirées. */
const plain = (html: string) => html.replace(/<[^>]+>/g, '').replaceAll('**', '');

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

function ok(g: GameState, who: string, a: Parameters<typeof applyAction>[2]): void {
  const r = applyAction(g, who, a);
  expect(r.ok, r.message).toBe(true);
}

/** Partie classique : Ada et Bob fabriquent tous deux des gadgets. */
function classicGame(lang: Lang, sectorId: SectorId = 'gadgets') {
  const g = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [
    seat('human', 'Ada', 'Atelier Ada', sectorId, 0),
    seat('rival', 'Bob', 'Bob Corp', 'gadgets', 1),
  ]);
  const mine = Object.values(g.companies).find((c) => c.controllerId === 'human')!;
  mine.cash = 1e6;
  return { g, companyId: mine.id };
}

function hexGame(lang: Lang) {
  const g = createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode: 'hex', terrainAssignment: 'fair' }, [
    seat('human', 'Ada', 'Atelier Ada', 'gadgets', 0),
    seat('rival', 'Bob', 'Bob Corp', 'yogurts', 1),
  ]);
  const mine = Object.values(g.companies).find((c) => c.controllerId === 'human')!;
  mine.cash = 100_000;
  return { g, companyId: mine.id };
}

const mineOf = (view: PlayerView): CompanyView => view.companies.find((c) => c.controllerId === view.you && c.status === 'active')!;

function renderTab(
  view: PlayerView,
  lang: Lang,
  nav: { openMapFor?: (intent: MapIntent) => void; goTo?: (tab: TabId) => void } = {},
  company: CompanyView | null = mineOf(view),
): string {
  setState({ lang, view, lobby: null });
  clicks.els.length = 0;
  return renderToStaticMarkup(
    createElement(GameProvider, {
      view,
      children: createElement(CompanyTab, { company, onSelect: () => {}, goTo: nav.goTo ?? (() => {}), openIssue: () => {}, openMapFor: nav.openMapFor ?? (() => {}) }),
    }),
  );
}

function renderCard(view: PlayerView, lang: Lang, product: ProductView, wide = false): string {
  setState({ lang, view, lobby: null });
  clicks.els.length = 0;
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(ProductCard, { company: mineOf(view), product, wide }) }));
}

function renderMaterials(view: PlayerView, lang: Lang): string {
  setState({ lang, view, lobby: null });
  clicks.els.length = 0;
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(CompanyMaterials, { company: mineOf(view), goTo: () => {}, openMapFor: () => {} }) }));
}

/** Props du bouton rendu avec exactement ce libellé. */
const button = (label: string) => clicks.els.find((p) => p.children === label);

/** Position d'un fragment dans la page, en échouant s'il manque. */
function at(html: string, fragment: string): number {
  const i = html.indexOf(fragment);
  expect(i, fragment).toBeGreaterThan(-1);
  return i;
}

/** Bulle d'InfoTip telle que rendue (atteignable au clavier : tabindex 0, lue via aria-label). */
const infoTip = (text: string, align?: 'left' | 'right') =>
  `<span class="info-tip${align ? ` tip-${align}` : ''}" tabindex="0" role="img" aria-label="${escaped(text)}" data-tip="${escaped(text)}">ⓘ</span>`;

/** Bouton à bulle de l'en-tête : bulle au survol et au focus, description pour les lecteurs d'écran. */
function tipButton(html: string, className: string, tip: string, label: string): void {
  const re = new RegExp(`<button type="button" class="${className}" data-tip="([^"]*)" aria-describedby="([^"]+)">([^<]*)</button><span id="([^"]+)" class="sr-only">([^<]*)</span>`);
  const found = html.match(re);
  expect(found, `${className} : ${label}`).not.toBeNull();
  const [, dataTip, describedBy, text, id, sr] = found!;
  expect(dataTip).toBe(escaped(tip));
  expect(text).toBe(escaped(label));
  expect(describedBy).toBe(id);
  expect(sr).toBe(escaped(tip));
  expect(html).not.toContain(`title="${escaped(tip)}"`);
}

/** Éléments que `scrollToId` touche : `document.getElementById` remplacé par un espion. */
function stubDocument() {
  const el = { scrollIntoView: vi.fn(), focus: vi.fn() };
  const getElementById = vi.fn(() => el);
  vi.stubGlobal('document', { getElementById });
  return { el, getElementById };
}

describe.each(['fr', 'en'] as const)('« Mon entreprise » : ordre et sections (%s)', (lang) => {
  const t = messages(lang);
  const h3 = (title: string) => `<h3>${escaped(title)}`;

  it('au premier trimestre : en-tête, produits, matières, finances, actions discutables, et rien de vide', () => {
    const { g } = hexGame(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    const html = renderTab(view, lang);
    const head = at(html, '<header class="company-head">');
    const products = at(html, h3(t.company.products(company.products.length, maxProductsOf(company))));
    const materials = at(html, h3(t.materials.title));
    const finances = at(html, h3(t.company.finances));
    const shady = at(html, h3(t.company.shady));
    expect(head).toBeLessThan(products);
    expect(products).toBeLessThan(materials);
    expect(materials).toBeLessThan(finances);
    expect(finances).toBeLessThan(shady);
    // Le lancement est un bouton du titre des produits, avant les fiches.
    expect(at(html, `>${escaped(t.company.launchOnMap)}</button>`)).toBeLessThan(at(html, 'product-grid'));
    // Ni « Mes mises » vide, ni filiales, ni rapport, ni « Effets en cours : aucun », ni section de lancement.
    expect(hasHexBids(view)).toBe(false);
    expect(html).not.toContain(escaped(t.hex.bidsTitle));
    expect(html).not.toContain(h3(t.sites.title));
    expect(html).not.toContain(escaped(t.company.lastReport));
    expect(html).not.toContain(escaped(t.company.effects));
    expect(html).not.toContain(h3(t.company.launch));
    expect(html).not.toContain(escaped(t.company.launchFunding));
    expect(html).not.toContain('company-report');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('« Mes mises », le rapport replié et les effets en cours reviennent quand ils ont quelque chose à dire', () => {
    const { g, companyId } = hexGame(lang);
    const before = getPlayerView(g, 'human');
    const cell = before.hexes!.free[0];
    ok(g, 'human', { type: 'launchProduct', companyId, sectorId: 'yogurts', name: 'Yaourt Test', hexId: cell, bid: before.hexes!.reserve[cell], fallback: 'abandon' });
    let view = getPlayerView(g, 'human');
    expect(hasHexBids(view)).toBe(true);
    let html = renderTab(view, lang);
    // « Mes mises » sous les matières (et les filiales), avant les finances.
    const bids = at(html, escaped(t.hex.bidsTitle));
    expect(at(html, h3(t.materials.title))).toBeLessThan(bids);
    expect(bids).toBeLessThan(at(html, h3(t.company.finances)));

    resolveTurn(g);
    view = getPlayerView(g, 'human');
    const company = mineOf(view);
    expect(company.reports.length).toBeGreaterThan(0);
    company.private!.modifiers = [{ kind: 'lobbying', turnsLeft: 2 }];
    html = renderTab(view, lang);
    // Rapport : un volet fermé en bas de l'onglet.
    const report = at(html, `<details class="tab-fold company-report"><summary>${escaped(t.company.lastReport)}</summary>`);
    expect(report).toBeGreaterThan(at(html, h3(t.company.shady)));
    // Effets en cours : dans le bloc du scandale, en tête des actions discutables, avant les six cartes.
    const effects = at(html, escaped(t.company.effects));
    expect(effects).toBeGreaterThan(at(html, h3(t.company.shady)));
    expect(effects).toBeLessThan(at(html, 'shady-warning'));
    expect(html).toContain(escaped(t.modifiers.lobbying));
  });

  it('« Filiales » pour une seule mise en attente, sans filiale ; plus rien une fois la mise réglée', () => {
    const { g, companyId } = classicGame(lang);
    const amount = COMMODITIES.oil.basePrice * SITE_OPENING_COST_MULT;
    ok(g, 'human', { type: 'bidSite', companyId, slotId: 'oil-1', amount });
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    expect(company.sites ?? []).toHaveLength(0);
    expect(companyHasSites(view, company)).toBe(true);
    const html = renderTab(view, lang);
    const sites = at(html, h3(t.sites.title));
    expect(sites).toBeGreaterThan(at(html, h3(t.materials.title)));
    expect(sites).toBeLessThan(at(html, h3(t.company.finances)));
    const slot = view.siteSlots.find((s) => s.id === 'oil-1')!;
    expect(html.slice(sites)).toContain(escaped(t.sites.pending(fmtFor(lang).money(amount), slot.name)));
    view.self!.siteBids = view.self!.siteBids!.map((b) => ({ ...b, result: { outcome: 'lost' as const, price: amount, bidders: 2 } }));
    expect(companyHasSites(view, company)).toBe(false);
    expect(renderTab(view, lang)).not.toContain(h3(t.sites.title));
  });

  it('sans produit : le bloc des matières reste, avec « Miser sur un gisement… » et les lots dus par contrat', () => {
    const { g } = classicGame(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    company.products = [];
    company.private!.inventory = {};
    let html = renderTab(view, lang);
    expect(html).toContain(escaped(t.company.noProducts));
    let materials = html.slice(at(html, h3(t.materials.title)));
    expect(materials).toContain(`>${escaped(t.company.bidOnDeposit)}</button>`);
    expect(materials).toContain(escaped(t.materials.covered));
    // Une entreprise gardée comme fournisseur d'une autre doit encore des lots : le bloc le dit.
    view.self!.contracts = [{ id: 'k1', sellerCompanyId: company.id, buyerCompanyId: 'other', commodityId: 'sugar', lots: 12, price: 40, turnsLeft: 2 }];
    html = renderTab(view, lang);
    materials = html.slice(at(html, h3(t.materials.title)));
    expect(materials).toContain(escaped(t.materials.contract(fmtFor(lang).num(12), 12)));
    expect(materials).not.toContain(escaped(t.materials.covered));
  });

  it('sans entreprise : « Mes mises » seulement quand une mise sur le plateau attend', () => {
    const { g, companyId } = hexGame(lang);
    let view = getPlayerView(g, 'human');
    let html = renderTab(view, lang, {}, null);
    expect(html).toContain(escaped(t.company.noneTitle));
    expect(html).not.toContain(escaped(t.hex.bidsTitle));
    const cell = view.hexes!.free[0];
    ok(g, 'human', { type: 'launchProduct', companyId, sectorId: 'yogurts', name: 'Yaourt Test', hexId: cell, bid: view.hexes!.reserve[cell], fallback: 'abandon' });
    view = getPlayerView(g, 'human');
    html = renderTab(view, lang, {}, null);
    expect(html).toContain(escaped(t.company.noneTitle));
    expect(at(html, escaped(t.hex.bidsTitle))).toBeGreaterThan(at(html, escaped(t.company.noneTitle)));
  });
});

describe.each(['fr', 'en'] as const)('« Mon entreprise » : en-tête (%s)', (lang) => {
  const t = messages(lang);
  const fmt = fmtFor(lang);

  it('dette avec ce que les banques prêtent encore, cours, réputation ; plus de capitalisation', () => {
    const { g } = classicGame(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    const html = renderTab(view, lang);
    const header = html.slice(at(html, '<header class="company-head">'), at(html, '</header>'));
    const debt = header.slice(at(header, `<div class="stat-label">${escaped(t.company.debt)}</div>`));
    expect(debt.slice(0, debt.indexOf('</div></div>') + 12)).toContain(escaped(t.company.loanRoom(fmt.money(company.private!.loanLimit))));
    expect(header).toContain(`<div class="stat-label">${escaped(t.company.cash)}</div>`);
    expect(header).toContain(escaped(t.company.price));
    expect(header).toContain(`<div class="stat-label">${escaped(t.company.reputation)}</div>`);
    expect(header).not.toContain(escaped(t.company.marketCap));
    // Réputation intacte : la fourchette, pas de lien vers les excuses.
    expect(company.reputation).toBe(1);
    expect(header).toContain(escaped(t.company.reputationRange(fmt.num(0.5), fmt.num(1.3))));
    expect(header).not.toContain(escaped(t.company.apology));
  });

  it('réputation sous 1 : « Excuses publiques » mène à la tuile de communication de crise', () => {
    const { g } = classicGame(lang);
    const view = getPlayerView(g, 'human');
    mineOf(view).reputation = 0.85;
    const html = renderTab(view, lang);
    const header = html.slice(0, at(html, '</header>'));
    // La bulle s'atteint au clavier (focus) et se lit au lecteur d'écran, pas seulement au survol.
    tipButton(header, 'link-button has-tip tip-left', t.company.apologyTip(fmt.num(1)), t.company.apology);
    // La tuile porte l'ancre, dans le bloc du scandale des actions discutables (hors du volet des combines), et peut
    // recevoir le focus ; la bulle du lien nomme ce bloc.
    const tile = at(html, `id="${CRISIS_COMMS_ANCHOR}" tabindex="-1"`);
    expect(tile).toBeGreaterThan(at(html, `<h3>${escaped(t.company.shady)}`));
    expect(tile).toBeGreaterThan(at(html, `id="${SHADY_ANCHOR}"`));
    expect(tile).toBeLessThan(at(html, '<details class="tab-fold shady-fold"'));
    expect(t.company.apologyTip('1')).toContain(t.company.shady);
    expect(t.company.apologyTip('1')).not.toContain(t.company.finances);
    const { el, getElementById } = stubDocument();
    (button(t.company.apology)!.onClick as () => void)();
    expect(getElementById).toHaveBeenCalledWith(CRISIS_COMMS_ANCHOR);
    expect(el.scrollIntoView).toHaveBeenCalled();
    expect(el.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('puce du scandale : jauge et risque de la jauge, neutre, ambre dès « moyen », rouge dès « élevé » ; un clic mène au bloc', () => {
    const { g } = classicGame(lang);
    const view = getPlayerView(g, 'human');
    const priv = mineOf(view).private!;
    for (const [value, tone] of [[0, 'low'], [25, 'low'], [29, 'low'], [30, 'mid'], [59, 'mid'], [60, 'high'], [100, 'high']] as const) {
      priv.scandal = value;
      const html = renderTab(view, lang);
      const risk = fmt.pct(scandalRisk(value), 0);
      const label = t.company.scandalChip(value, risk);
      tipButton(html, `scandal-chip ${tone} has-tip`, t.company.scandalChipTip, label);
      // Même risque que la jauge des actions discutables.
      expect(html.slice(at(html, 'class="gauge"'))).toContain(`<strong>${escaped(risk)}</strong>`);
    }
    // L'exemple de la spec : 25/100, risque de 7 %.
    expect(fmt.pct(scandalRisk(25), 0)).toBe(fmt.pct(0.07, 0));
    expect(t.company.scandalChip(25, fmt.pct(0.07, 0))).toBe(lang === 'fr' ? `Scandale 25/100 · risque ${fmt.pct(0.07, 0)}` : 'Scandal 25/100 · 7% risk');
    // Le bloc du scandale (jauge, effets) ouvre les actions discutables ; la puce y mène.
    const html = renderTab(view, lang);
    expect(at(html, `id="${SHADY_ANCHOR}"`)).toBeGreaterThan(at(html, `<h3>${escaped(t.company.shady)}`));
    const { getElementById } = stubDocument();
    (clicks.els.find((p) => p.className === 'scandal-chip high has-tip')!.onClick as () => void)();
    expect(getElementById).toHaveBeenCalledWith(SHADY_ANCHOR);
    expect(html).toContain(`id="${SHADY_ANCHOR}" tabindex="-1"`);
  });
});

describe.each(['fr', 'en'] as const)('fiche produit sur un écran (%s)', (lang) => {
  const t = messages(lang);
  const fmt = fmtFor(lang);

  it('une ou deux fiches : pleine largeur en deux colonnes ; trois et plus : la grille', () => {
    const { g, companyId } = classicGame(lang);
    let html = renderTab(getPlayerView(g, 'human'), lang);
    expect(html).toContain('<div class="product-grid wide">');
    const card = html.slice(at(html, '<article class="product-card wide">'));
    const side = at(card, '<div class="product-side">');
    // À gauche : le nom, les chiffres et les quatre réglages ; à droite : prévision, rivaux, alertes, boutons.
    expect(at(card, '<div class="product-main">')).toBeLessThan(side);
    expect(card.slice(0, side).match(/type="range"/g)).toHaveLength(4);
    expect(at(card, 'class="estimates small"')).toBeGreaterThan(side);
    expect(at(card, 'class="product-rivals')).toBeGreaterThan(side);
    expect(at(card, '<footer class="product-actions">')).toBeGreaterThan(side);
    ok(g, 'human', { type: 'launchProduct', companyId, sectorId: 'yogurts', name: 'Yaourt Test' });
    expect(renderTab(getPlayerView(g, 'human'), lang)).toContain('<div class="product-grid wide">');
    ok(g, 'human', { type: 'launchProduct', companyId, sectorId: 'energy_drinks', name: 'Boisson Test' });
    html = renderTab(getPlayerView(g, 'human'), lang);
    expect(html).toContain('<div class="product-grid">');
    expect(html).not.toContain('product-card wide');
    // Ailleurs (fenêtres de la carte et de « Mes usines ») : la fiche reste en une colonne.
    const view = getPlayerView(g, 'human');
    expect(renderCard(view, lang, mineOf(view).products[0])).toContain('<article class="product-card">');
  });

  it('verdict et prévision en tête de la colonne de droite, sur les réglages à l’écran (brouillon non enregistré compris)', async () => {
    const { g } = classicGame(lang);
    const view = getPlayerView(g, 'human');
    const product = mineOf(view).products[0];
    const priv = product.private!;
    Object.assign(priv, { production: 1, stock: 0 });
    const est = estimateSales(product.sectorId, priv.market!, {
      quality: product.quality, brand: product.brand, price: product.price, production: 1, capacity: product.capacity, stock: 0, marketing: priv.marketing, rnd: priv.rnd,
    });
    expect(est.demand).toBeGreaterThan(3);
    const shortage = `<div class="product-side"><p class="plot-verdict product-verdict warn">${escaped(t.factories.verdict.shortage(fmt.lots(Math.round(est.demand - 1))))}</p>`;
    let html = renderCard(view, lang, product, true);
    expect(html).toContain(shortage);

    // Réglage à l'écran différent du réglage enregistré : « Caler sur la demande » dont l'enregistrement échoue laisse le
    // brouillon (repris par la fiche rouverte). Verdict et prévision suivent ce brouillon, pas la production enregistrée.
    const target = Math.min(Math.floor(product.capacity), Math.max(0, Math.round(est.demand)));
    expect(target).toBeGreaterThan(1);
    vi.mocked(sendAction).mockResolvedValueOnce({ ok: false, message: 'refusé' });
    (button(t.product.fitDemand(fmt.lots(Math.round(est.demand))))!.onClick as () => void)();
    await vi.waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    html = renderCard(view, lang, product, true);
    expect(priv.production).toBe(1); // toujours enregistrée à 1 lot
    expect(html).toContain('product-card wide save-failed');
    const draft = estimateSales(product.sectorId, priv.market!, {
      quality: product.quality, brand: product.brand, price: product.price, production: target, capacity: product.capacity, stock: 0, marketing: priv.marketing, rnd: priv.rnd,
    });
    const flow = productFlow({ ...product, private: { ...priv, production: target, estimate: draft } });
    expect(flow.status).toBe('balanced');
    expect(html).not.toContain(shortage);
    expect(html).toContain(`<p class="plot-verdict product-verdict up">${escaped(t.factories.verdict.balanced(fmt.lots(Math.round(flow.sales!))))}</p>`);
    expect(plain(html)).toContain(plain(escaped(t.product.forecast(fmt.lots(draft.sales), fmt.int(draft.demand), fmt.money(draft.revenue)))));
    forgetProductSaves();

    // Rien à vendre : le verdict le dit.
    priv.production = 0;
    expect(renderCard(view, lang, product, true)).toContain(escaped(t.factories.verdict.idle));
  });

  it('« Face aux rivaux » en une ligne (prix : 1re = le moins cher), dépliée sur les réglettes et l’âge des prix', () => {
    const { g } = classicGame(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    const product = company.products[0];
    const field = sectorProducts(view.companies, product.sectorId).filter((r) => r.product.id !== product.id);
    expect(field.length).toBeGreaterThan(0);
    for (const r of field) Object.assign(r.product, { price: product.price * 1.2, quality: 1.5, brand: 0.2 });
    Object.assign(product, { quality: 1, brand: 0.9 });
    const total = field.length + 1;
    const html = renderCard(view, lang, product, true);
    const ranks = t.product.rivalRanks(t.product.rank(1, total), t.product.rank(total, total), t.product.rank(1, total));
    expect(html).toContain(`<summary>${escaped(t.product.rivals(ranks))}</summary>`);
    expect(ranks).toContain(lang === 'fr' ? `Prix 1re/${total}` : `Price 1st/${total}`);
    const details = html.slice(at(html, '<details class="product-rivals small">'));
    expect(details).toContain(escaped(t.product.rivalsPrices));
    expect(details).toContain(escaped(t.product.rivalsTip(total)));
    expect(details.slice(0, details.indexOf('</details>')).match(/class="strip-row"/g)).toHaveLength(3);
    expect(t.product.rivalsPrices).toMatch(lang === 'fr' ? /trimestre précédent/ : /last quarter/);
    // Seul en rayon : une ligne, sans volet.
    for (const r of field) r.product.comingSoon = true;
    const alone = renderCard(view, lang, product, true);
    expect(alone).toContain(escaped(t.product.rivals(t.product.rivalsAlone)));
    expect(alone).not.toContain('<details class="product-rivals');
  });

  it('« Caler sur la demande » : demande estimée moins le stock, dans la capacité, enregistré au clic', async () => {
    const { g } = classicGame(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    const product = company.products[0];
    const priv = product.private!;
    Object.assign(priv, { production: 0, stock: 3 });
    const demand = estimateSales(product.sectorId, priv.market!, {
      quality: product.quality, brand: product.brand, price: product.price, production: 1, capacity: product.capacity, stock: 3, marketing: priv.marketing, rnd: priv.rnd,
    }).demand;
    const target = Math.min(Math.floor(product.capacity), Math.max(0, Math.round(demand - 3)));
    expect(target).toBeGreaterThan(0);
    const html = renderCard(view, lang, product, true);
    const label = t.product.fitDemand(fmt.lots(Math.round(demand)));
    // Le calcul et sa réserve dans une bulle collée au bouton, atteignable au clavier (pas un simple `title`).
    const tip = t.product.fitDemandTip(fmt.lots(Math.round(demand)), fmt.lots(3), fmt.lots(target));
    expect(html).toContain(`<span class="fit-demand"><button type="button" class="btn tiny ghost">${escaped(label)}</button> ${infoTip(tip, 'left')}</span>`);
    expect(html).not.toContain(`title="${escaped(tip)}"`);
    // L'estimation suppose que les rivaux gardent leurs prix : la bulle le dit.
    expect(t.product.fitDemandTip('a', 'b', 'c')).toMatch(lang === 'fr' ? /rivaux gardent leurs prix/ : /rivals keep last quarter/);
    expect(sendAction).not.toHaveBeenCalled();
    (button(label)!.onClick as () => void)();
    await flushProductSaves();
    expect(vi.mocked(sendAction).mock.calls.map(([a]) => a)).toEqual([
      { type: 'setProductDecisions', companyId: company.id, productId: product.id, price: product.price, production: target, marketing: priv.marketing, rnd: priv.rnd },
    ]);
    // Déjà calé : le bouton est grisé.
    priv.production = target;
    renderCard(view, lang, product, true);
    expect(button(label)!.disabled).toBe(true);
    // Produit en chantier : pas d'estimation, pas de bouton.
    product.comingSoon = true;
    expect(renderCard(view, lang, product, true)).not.toContain('fit-demand');
  });
});

describe.each(['fr', 'en'] as const)('« Matières pour ce trimestre » (%s)', (lang) => {
  const t = messages(lang);
  const m = t.materials;
  const fmt = fmtFor(lang);

  /** Boissons énergisantes (0,5 lot de sucre et 0,1 de pétrole par lot produit) : 60 lots, 5 lots de sucre en stock. */
  function drinks(production = 60) {
    const { g } = classicGame(lang, 'energy_drinks');
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    const p = company.products[0];
    p.capacity = 10_000;
    p.private!.production = production;
    company.cash = 10_000;
    company.private!.inventory = { sugar: { lots: 5, avgCost: 30 } };
    // Vue retouchée à la main : le plan de clôture du moteur ne la suit plus.
    delete company.private!.closePlan;
    const price = (id: string) => view.commodities.find((c) => c.id === id)!.price;
    return { view, company, price };
  }
  const gapOf = (view: PlayerView, company: CompanyView, id: string) =>
    materialGaps(company, view.commodities, view.turn, view.self?.contracts ?? []).find((x) => x.commodityId === id);

  it('un manque : maintenant face à la clôture, le bouton achète le manque entier, et seulement au clic', async () => {
    const { view, company, price } = drinks();
    const sugar = gapOf(view, company, 'sugar')!;
    const now = commodityBuyCost('sugar', price('sugar'), 25);
    const atClose = 25 * price('sugar') * EMERGENCY_PURCHASE_MARKUP;
    expect(sugar).toEqual({
      commodityId: 'sugar', missing: 25, undeliverable: 0, wanted: 25, lots: 25, cap: null, now, atClose, cashAfter: company.cash - now, cheaperNow: true, primary: true,
    });
    expect(now).toBeLessThan(atClose);
    // Le pétrole aussi : 6 lots.
    expect(gapOf(view, company, 'oil')).toMatchObject({ missing: 6, lots: 6 });
    const html = renderMaterials(view, lang);
    const row = html.slice(at(html, 'data-commodity="sugar"'));
    const text = plain(row.slice(0, row.indexOf('</li>')));
    const sugarLabel = getContent(lang).commodities.sugar;
    expect(text).toContain(plain(escaped(m.gap(`${sugarLabel.emoji} ${sugarLabel.name}`, m.short(fmt.num(25), 25)))));
    expect(text).toContain(plain(escaped(m.costs(fmt.money(now), fmt.money(atClose), fmt.num(EMERGENCY_PURCHASE_MARKUP)))));
    // La trésorerie après l'achat, sur la ligne.
    expect(text).toContain(plain(escaped(m.cashAfter(fmt.money(company.cash - now)))));
    expect(row).toContain(`<button type="button" class="btn small primary">${escaped(m.buy(fmt.lots(25)))}</button></span>`);
    expect(html).not.toContain(escaped(m.covered));
    // Rien n'est acheté sans clic ; le clic achète les 25 lots, par l'action d'achat ordinaire.
    expect(sendAction).not.toHaveBeenCalled();
    await (button(m.buy(fmt.lots(25)))!.onClick as () => Promise<void>)();
    expect(vi.mocked(sendAction).mock.calls.map(([a]) => a)).toEqual([{ type: 'buyCommodity', companyId: company.id, commodityId: 'sugar', lots: 25 }]);
  });

  it('lots entiers : 24,5 lots manquants, 25 achetés, le surplus reste en stock', () => {
    const { view, company } = drinks(59);
    const sugar = gapOf(view, company, 'sugar')!;
    expect(sugar).toMatchObject({ missing: 24.5, wanted: 25, lots: 25, cap: null });
    const html = renderMaterials(view, lang);
    expect(plain(html)).toContain(plain(escaped(m.short(fmt.num(24.5), 24.5))));
    expect(m.short(fmt.num(24.5), 24.5)).toBe(lang === 'fr' ? 'manque 24,5 lots' : 'short 24.5 lots');
    // La raison est dans une bulle atteignable au clavier, à côté du bouton.
    expect(html).toContain(`>${escaped(m.buy(fmt.lots(25)))}</button>${infoTip(m.wholeLots(fmt.lots(25)), 'right')}</span>`);
    expect(html).not.toContain('title=');
  });

  it('plafonds : un ordre ne dépasse pas la liquidité, la trésorerie borne l’achat, sans trésorerie le bouton est grisé', () => {
    const { view, company, price } = drinks(4000); // 2 000 lots de sucre
    company.cash = 1e9;
    const max = commodityOrderMax('sugar');
    const big = gapOf(view, company, 'sugar')!;
    expect(big).toMatchObject({ missing: 1995, wanted: 1995, lots: max, cap: 'order' });
    // Un gros ordre fait monter le cours : plus cher que l'achat d'urgence, le bouton n'est pas mis en avant.
    expect(big.cheaperNow).toBe(false);
    let html = renderMaterials(view, lang);
    let row = html.slice(at(html, 'data-commodity="sugar"'));
    expect(row).toContain(escaped(m.cappedOrder(fmt.lots(max))));
    expect(row).toContain(`<button type="button" class="btn small">${escaped(m.buy(fmt.lots(max)))}</button>${infoTip(m.notCheaper, 'right')}</span>`);

    company.cash = 200;
    const poor = gapOf(view, company, 'sugar')!;
    const affordable = maxAffordableLots('sugar', price('sugar'), 200);
    expect(affordable).toBeGreaterThan(0);
    expect(poor).toMatchObject({ lots: affordable, cap: 'cash' });
    html = renderMaterials(view, lang);
    row = html.slice(at(html, 'data-commodity="sugar"'));
    expect(row).toContain(escaped(m.cappedCash(fmt.lots(affordable))));

    company.cash = 0;
    expect(gapOf(view, company, 'sugar')).toMatchObject({ lots: 0, cap: 'cash', cheaperNow: false });
    html = renderMaterials(view, lang);
    row = html.slice(at(html, 'data-commodity="sugar"'));
    expect(row).toContain(escaped(m.noCash));
    expect(button(m.buy(fmt.lots(1995)))!.disabled).toBe(true);
  });

  it('« Matières couvertes » seulement si rien ne manque, contrats compris ; un lot dû non livrable s’achète avec le manque', () => {
    const { view, company } = drinks();
    company.private!.inventory = { sugar: { lots: 100, avgCost: 30 }, oil: { lots: 10, avgCost: 80 } };
    expect(materialGaps(company, view.commodities, view.turn)).toEqual([]);
    expect(renderMaterials(view, lang)).toContain(escaped(m.covered));
    // Un contrat dû de 150 lots de sucre : 100 livrés (le stock), 50 non livrables, et la production en manque de 30.
    const contract: SupplyContract = { id: 'k1', sellerCompanyId: company.id, buyerCompanyId: 'other', commodityId: 'sugar', lots: 150, price: 40, turnsLeft: 2 };
    view.self!.contracts = [contract];
    expect(gapOf(view, company, 'sugar')).toMatchObject({ missing: 30, undeliverable: 50, wanted: 80 });
    let html = renderMaterials(view, lang);
    expect(html).not.toContain(escaped(m.covered));
    let row = html.slice(at(html, 'data-commodity="sugar"'));
    expect(row).toContain(escaped(m.contract(fmt.num(50), 50)));
    expect(row).toContain(escaped(m.buy(fmt.lots(80))));
    // Sans production : le contrat seul empêche encore « Matières couvertes ».
    company.products[0].private!.production = 0;
    expect(gapOf(view, company, 'sugar')).toMatchObject({ missing: 0, undeliverable: 50, wanted: 50 });
    html = renderMaterials(view, lang);
    expect(html).not.toContain(escaped(m.covered));
    row = html.slice(at(html, 'data-commodity="sugar"'));
    expect(plain(row)).not.toContain(plain(escaped(m.short(fmt.num(0), 0))));
    expect(row).toContain(escaped(m.contract(fmt.num(50), 50)));
    expect(m.contract('3', 3)).toMatch(lang === 'fr' ? /^Contrat.*3 lots non livrables → pénalité$/ : /^Contract: 3 lots you can’t deliver → penalty$/);
  });

  /** Plan de clôture minimal : obligations prélevées d'abord, mises, manque aux ventes attendues. */
  function closePlan(company: CompanyView, o: { obligations?: number; bids?: number; shortfall?: number; bankrupt?: boolean }): ClosePlan {
    const total = o.obligations ?? 0;
    const short = o.shortfall ?? 0;
    return {
      cash: company.cash,
      obligations: { fixed: total, interest: 0, taxDue: 0, finesDue: 0, contracts: 0, total },
      bids: o.bids ?? 0,
      bidsCovered: o.bids ?? 0,
      production: { planned: 0, funded: 0, plannedCost: 0, cost: 0 },
      lots: {},
      marketing: { planned: 0, funded: 0 },
      sales: { planned: 0, funded: 0 },
      margin: 0,
      sites: [],
      shortfall: short,
      loan: short,
      safeShortfall: short,
      safeLoan: short,
      bankrupt: o.bankrupt ?? false,
    };
  }

  it('l’achat n’entame jamais ce que la clôture prélève d’abord (obligations, puis mises) : sinon faillite', () => {
    const { view, company, price } = drinks();
    const now = commodityBuyCost('sugar', price('sugar'), 25);
    // Obligations et mises laissent moins que le prix des 25 lots : tout acheter mettrait la clôture en faillite.
    const obligations = company.cash - now;
    const bids = now / 2;
    company.private!.closePlan = closePlan(company, { obligations, bids });
    const reserve = closeReserve(company);
    expect(reserve).toBe(obligations + bids);
    expect(company.cash - now).toBeLessThan(reserve);
    const sugar = gapOf(view, company, 'sugar')!;
    const lots = maxAffordableLots('sugar', price('sugar'), company.cash - reserve);
    expect(lots).toBeGreaterThan(0);
    expect(lots).toBeLessThan(25);
    expect(sugar).toMatchObject({ wanted: 25, lots, cap: 'cash' });
    expect(sugar.cashAfter).toBe(company.cash - commodityBuyCost('sugar', price('sugar'), lots));
    expect(sugar.cashAfter).toBeGreaterThanOrEqual(reserve);
    let html = renderMaterials(view, lang);
    let row = html.slice(at(html, 'data-commodity="sugar"'));
    expect(row).toContain(escaped(m.cappedReserve(fmt.lots(lots), fmt.money(reserve))));
    expect(row).toContain(escaped(m.cashAfter(fmt.money(sugar.cashAfter))));
    expect(row).toContain(`>${escaped(m.buy(fmt.lots(lots)))}</button>`);

    // Les obligations prennent toute la trésorerie : rien d'achetable, le bouton est grisé et la ligne dit pourquoi.
    company.private!.closePlan = closePlan(company, { obligations: company.cash });
    expect(gapOf(view, company, 'sugar')).toMatchObject({ lots: 0, cap: 'cash', primary: false });
    html = renderMaterials(view, lang);
    row = html.slice(at(html, 'data-commodity="sugar"'));
    expect(row).toContain(escaped(m.noCashReserve(fmt.money(company.cash))));
    expect(row).not.toContain(escaped(m.cashAfter('')));
    expect(button(m.buy(fmt.lots(25)))!.disabled).toBe(true);
  });

  it('clôture déjà à court d’argent : achat possible, jamais mis en avant, et la raison est affichée', () => {
    const { view, company } = drinks();
    let html = renderMaterials(view, lang);
    expect(html).not.toContain(escaped(m.closeShort));
    for (const plan of [closePlan(company, { obligations: 100, shortfall: 50 }), closePlan(company, { obligations: 100, bankrupt: true })]) {
      company.private!.closePlan = plan;
      const sugar = gapOf(view, company, 'sugar')!;
      expect(sugar).toMatchObject({ lots: 25, cheaperNow: true, primary: false });
      html = renderMaterials(view, lang);
      expect(html).toContain(`<p class="small warn material-short">${escaped(m.closeShort)}</p>`);
      expect(html).toContain(`<button type="button" class="btn small">${escaped(m.buy(fmt.lots(25)))}</button>`);
      expect(html).not.toContain('btn small primary');
    }
    // Rien ne manque : « Matières couvertes », sans l'avertissement.
    company.private!.inventory = { sugar: { lots: 100, avgCost: 30 }, oil: { lots: 10, avgCost: 80 } };
    html = renderMaterials(view, lang);
    expect(html).toContain(escaped(m.covered));
    expect(html).not.toContain(escaped(m.closeShort));
  });

  it('un manque qui s’afficherait « 0,0 » n’a pas de ligne ; dès 0,1 lot, la ligne dit ce qui manque', () => {
    const { view, company } = drinks();
    // 60 lots : 30 lots de sucre et 6 de pétrole nécessaires.
    company.private!.inventory = { sugar: { lots: 100, avgCost: 30 }, oil: { lots: 5.98, avgCost: 80 } };
    expect(materialGaps(company, view.commodities, view.turn)).toEqual([]);
    expect(renderMaterials(view, lang)).toContain(escaped(m.covered));
    company.private!.inventory.oil = { lots: 5.9, avgCost: 80 };
    const oil = gapOf(view, company, 'oil')!;
    expect(oil.missing).toBeCloseTo(0.1, 9);
    expect(oil).toMatchObject({ wanted: 1, lots: 1 });
    const html = renderMaterials(view, lang);
    const row = html.slice(at(html, 'data-commodity="oil"'));
    expect(plain(row)).toContain(plain(escaped(m.short(fmt.num(0.1), 0.1))));
  });
});
