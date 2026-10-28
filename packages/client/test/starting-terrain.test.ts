/**
 * Le terrain de départ en partie : une puce dans l'en-tête de « Mon entreprise » et une ligne visible dans la
 * fiche de ma case, tant que l'usine de départ reste dessus et que la dotation produit ses effets.
 * Rendu SSR ; les onClick sont capturés en moquant le runtime JSX, puis invoqués à la main.
 */
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_COLORS,
  applyAction,
  createGame,
  getContent,
  getPlayerView,
  heatCredit,
  hexReservePrice,
  resolveTurn,
  type CompanyView,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { CompanyTab } from '../src/screens/game/CompanyTab';
import { HexCellSheet } from '../src/screens/game/city/HexCellSheet';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { hexCellBid, hexMoveCost } from '../src/screens/game/hexPayback';
import { decisionText } from '../src/i18n/decisionReadability';
import { activeStartingTerrains, startingTerrainAt, startingTerrainEffectsText, startingTerrainTip, terrainFxLabel } from '../src/screens/game/startingTerrain';
import { getState, setState, type AppState } from '../src/store';

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
// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
const count = (html: string, fragment: string) => html.split(fragment).length - 1;
const signed = (lang: Lang, mult: number) => fmtFor(lang).signedPct(mult - 1, 0).replace('-', '−');

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

/** Partie plateau : l'hôte place Ada (gadgets par défaut) sur `terrain`, Bob au quai de Port-Dividende par défaut. */
function hexGame(lang: Lang, terrain: string, opts: { sector?: SectorId; rival?: string } = {}): { g: GameState; companyId: string } {
  const g = createGame({
    seed: 11, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang, mapMode: 'hex',
    terrainAssignment: 'host', terrains: { human: terrain, rival: opts.rival ?? 'quai-port-dividende' },
  }, [seat('human', 'Ada', 'Atelier Ada', opts.sector ?? 'gadgets', 0), seat('rival', 'Bob', 'Bob Corp', 'yogurts', 1)]);
  const company = Object.values(g.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 1e6;
  return { g, companyId: company.id };
}

function mine(view: PlayerView): CompanyView {
  return view.companies.find((c) => c.controllerId === view.you && c.status === 'active')!;
}

function renderCompany(view: PlayerView, lang: Lang, onMap?: (productId: string) => void): string {
  setState({ lang, view, lobby: null });
  clicks.els.length = 0;
  return renderToStaticMarkup(createElement(GameProvider, {
    view,
    children: createElement(CompanyTab, { company: mine(view), onSelect: () => {}, goTo: () => {}, openMapFor: () => {}, onMap }),
  }));
}

function renderSheet(view: PlayerView, lang: Lang, hexId: string): string {
  setState({ lang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(HexCellSheet, { view, hexId }) }));
}

/** Effets attendus de l'Île-aux-Niches au premier trimestre, dans l'ordre de la dotation. */
function islandEffects(lang: Lang): string {
  const fx = messages(lang).lobby.terrainFx;
  const fmt = fmtFor(lang);
  return [fx.tax(fmt.pct(0, 0)), fx.scandal(fmt.num(1.5)), fx.perceivedPrice(signed(lang, 0.96)), fx.salvage(fmt.pct(0.8, 0))].join(' · ');
}

describe.each(['fr', 'en'] as const)('terrain de départ dans « Mon entreprise » (%s)', (lang) => {
  it('une puce à côté de la ligne du PDG : nom et point fort, effets en vigueur dans la bulle, clic vers la carte', () => {
    const { g } = hexGame(lang, 'ile-aux-niches');
    const view = getPlayerView(g, 'human');
    const h = messages(lang).hex;
    const company = mine(view);
    const terrain = view.terrains!.find((ter) => ter.id === 'ile-aux-niches')!;
    const product = company.products.find((p) => p.hexId === terrain.hex)!;
    expect(terrain.active && terrain.companyId === company.id).toBe(true);
    const onMap = vi.fn();
    const html = renderCompany(view, lang, onMap);
    const label = h.terrainChip(terrain.name, terrain.strengthLabel);
    const tip = [h.terrainInForce(islandEffects(lang)), h.terrainLostOnMove, h.terrainChipGo].join(' ');
    // Dans la ligne du PDG, une seule puce (une seule usine de départ).
    const line = html.split('<div class="company-ceo-line">')[1]?.split('</div>')[0] ?? '';
    expect(line).toContain(`data-tip="${escaped(tip)}"`);
    expect(line).toContain(`>${escaped(label)}</button>`);
    expect(line.match(/terrain-chip/g)).toHaveLength(1);
    // La bulle est aussi lue par les lecteurs d'écran.
    expect(html).toContain(`<span id="${line.match(/aria-describedby="([^"]+)"/)![1]}" class="sr-only">${escaped(tip)}</span>`);
    // Le clic ouvre « La carte » sur la case de l'usine de départ.
    const chip = clicks.els.find((props) => props.children === label);
    expect(chip).toBeDefined();
    (chip!.onClick as () => void)();
    expect(onMap).toHaveBeenCalledWith(product.id);
  });

  it('sans accès à la carte : la puce reste, sans bouton ni invitation à cliquer', () => {
    const { g } = hexGame(lang, 'ile-aux-niches');
    const view = getPlayerView(g, 'human');
    const h = messages(lang).hex;
    const html = renderCompany(view, lang);
    expect(html).toContain('<span class="terrain-chip has-tip tip-left"');
    expect(html).not.toContain('<button type="button" class="terrain-chip');
    expect(html).not.toContain(escaped(h.terrainChipGo));
    expect(html).toContain(escaped(h.terrainLostOnMove));
  });

  it('effet temporaire : les trimestres restants, celui-ci compris, à la place de « pendant 8 trim. »', () => {
    const { g } = hexGame(lang, 'portes-petit-rabais');
    const h = messages(lang).hex;
    const fx = messages(lang).lobby.terrainFx;
    const labor = fx.labor(signed(lang, 0.8));
    const first = getPlayerView(g, 'human');
    expect(renderCompany(first, lang, () => {})).toContain(escaped(h.terrainInForce(h.terrainEffectLeft(labor, 8))));
    expect(renderCompany(first, lang, () => {})).not.toContain(escaped(fx.laborTurns(signed(lang, 0.8), '8')));
    for (let i = 0; i < 5; i++) resolveTurn(g);
    const sixth = getPlayerView(g, 'human');
    expect(sixth.turn).toBe(6);
    expect(renderCompany(sixth, lang, () => {})).toContain(escaped(h.terrainInForce(h.terrainEffectLeft(labor, 3))));
    // Après le huitième trimestre, la dotation ne produit plus rien : plus de puce.
    for (let i = 0; i < 3; i++) resolveTurn(g);
    const ninth = getPlayerView(g, 'human');
    expect(ninth.turn).toBe(9);
    const terrain = ninth.terrains!.find((ter) => ter.id === 'portes-petit-rabais')!;
    expect(terrain.active).toBe(true); // l'usine est toujours là…
    expect(terrain.runningEffects).toEqual({ headquarters: false, factory: false }); // …mais l'exonération a expiré
    expect(activeStartingTerrains(ninth, mine(ninth))).toEqual([]);
    expect(renderCompany(ninth, lang, () => {})).not.toContain('terrain-chip');
  });

  it('après un déménagement, le terrain n’est plus actif : ni puce ni ligne', () => {
    const { g, companyId } = hexGame(lang, 'ile-aux-niches');
    const before = getPlayerView(g, 'human');
    const product = mine(before).products[0];
    const island = product.hexId!;
    const terrainCells = new Set(before.terrains!.map((ter) => ter.hex));
    const target = before.hexes!.free.find((id) => !terrainCells.has(id))!;
    const moved = applyAction(g, 'human', { type: 'moveFactory', companyId, productId: product.id, hexId: target, bid: hexReservePrice(target) });
    expect(moved.ok, moved.message).toBe(true);
    resolveTurn(g);
    const after = getPlayerView(g, 'human');
    expect(mine(after).products[0].hexId).toBe(target);
    expect(after.terrains!.find((ter) => ter.id === 'ile-aux-niches')!.active).toBe(false);
    expect(renderCompany(after, lang, () => {})).not.toContain('terrain-chip');
    expect(renderSheet(after, lang, target)).not.toContain('hx-sheet-terrain-line');
    expect(renderSheet(after, lang, island)).not.toContain('hx-sheet-terrain-line');
  });

  it('privilège suspendu : la bulle le dit sans « En vigueur », la perte au déménagement reste', () => {
    const { g } = hexGame(lang, 'portes-petit-rabais');
    const view = getPlayerView(g, 'human');
    mine(view).products[0].private!.terrainEffects = []; // ce que renvoie le moteur pendant une suspension
    const h = messages(lang).hex;
    const html = renderCompany(view, lang, () => {});
    const tip = [h.terrainSuspendedTip, h.terrainLostOnMove, h.terrainChipGo].join(' ');
    expect(html).toContain(`data-tip="${escaped(tip)}"`);
    expect(html).not.toContain(escaped(h.terrainInForce(h.terrainSuspended)));
    expect(count(html, 'terrain-chip')).toBe(1);
  });

  it('après une fusion : une puce par usine de départ, sans les privilèges du siège (impôt, scandales)', () => {
    const { g, companyId } = hexGame(lang, 'ile-aux-niches', { rival: 'monts-defiscalises' });
    const target = Object.values(g.companies).find((c) => c.controllerId === 'rival')!;
    target.controllerId = 'human';
    target.holdings = { human: 6000 };
    const merged = applyAction(g, 'human', { type: 'merge', absorberId: companyId, targetId: target.id });
    expect(merged.ok, merged.message).toBe(true);
    const view = getPlayerView(g, 'human');
    const company = mine(view);
    expect(company.id).toBe(companyId);
    const t = messages(lang);
    const fx = t.lobby.terrainFx;
    const fmt = fmtFor(lang);
    const found = activeStartingTerrains(view, company);
    expect(found.map((f) => f.terrain.id).sort()).toEqual(['ile-aux-niches', 'monts-defiscalises']);
    const text = (id: string) => startingTerrainEffectsText(t, fmt, found.find((f) => f.terrain.id === id)!);
    expect(text('ile-aux-niches')).toBe([fx.perceivedPrice(signed(lang, 0.96)), fx.salvage(fmt.pct(0.8, 0))].join(' · '));
    expect(text('monts-defiscalises')).toBe(fx.labor(signed(lang, 0.9)));
    const html = renderCompany(view, lang, () => {});
    const line = html.split('<div class="company-ceo-line">')[1]?.split('</div>')[0] ?? '';
    expect(count(line, 'class="terrain-chip')).toBe(2);
    for (const f of found) expect(line).toContain(`>${escaped(t.hex.terrainChip(f.terrain.name, f.terrain.strengthLabel))}</button>`);
    for (const absent of [fx.tax(fmt.pct(0, 0)), fx.tax(fmt.pct(0.05, 0)), fx.scandal(fmt.num(1.5))]) expect(line).not.toContain(escaped(absent));
    for (const f of found) expect(line).toContain(`data-tip="${escaped(startingTerrainTip(t, fmt, f, true))}"`);
  });

  it('pas de puce en partie classique', () => {
    const g = createGame({ seed: 11, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang }, [seat('human', 'Ada', 'Atelier Ada', 'gadgets', 0)]);
    expect(renderCompany(getPlayerView(g, 'human'), lang, () => {})).not.toContain('terrain-chip');
  });
});

describe.each(['fr', 'en'] as const)('terrain de départ dans la fiche de ma case (%s)', (lang) => {
  it('une ligne visible juste sous l’état, le détail restant replié', () => {
    const { g } = hexGame(lang, 'ile-aux-niches');
    const view = getPlayerView(g, 'human');
    const h = messages(lang).hex;
    const cell = mine(view).products[0].hexId!;
    const html = renderSheet(view, lang, cell);
    const line = `<p class="hx-sheet-terrain-line"><span aria-hidden="true">☆ </span>${escaped(h.terrainActiveLine(islandEffects(lang)))}</p>`;
    expect(html).toContain(line);
    const product = mine(view).products[0];
    const status = `>${escaped(h.ownFactoryLine(product.name, getContent(lang).sectors[product.sectorId].name, mine(view).name))}</p>`;
    expect(html).toContain(status);
    expect(html.indexOf(line)).toBeGreaterThan(html.indexOf(status));
    expect(html.indexOf(line)).toBeLessThan(html.indexOf('<details'));
    // Le détail (titre, texte d'ambiance, liste des effets reçus) reste dans « Détails du lieu ».
    expect(html.indexOf(escaped(h.currentEffectsTitle))).toBeGreaterThan(html.indexOf('<details'));
  });

  it('effet temporaire : trimestres restants dans la ligne', () => {
    const { g } = hexGame(lang, 'portes-petit-rabais');
    for (let i = 0; i < 3; i++) resolveTurn(g);
    const view = getPlayerView(g, 'human');
    expect(view.turn).toBe(4);
    const h = messages(lang).hex;
    const labor = messages(lang).lobby.terrainFx.labor(signed(lang, 0.8));
    const html = renderSheet(view, lang, mine(view).products[0].hexId!);
    expect(html).toContain(escaped(h.terrainActiveLine(h.terrainEffectLeft(labor, 5))));
  });

  it('jamais sur la case d’un rival, même sur son terrain de départ actif', () => {
    const { g } = hexGame(lang, 'ile-aux-niches');
    const view = getPlayerView(g, 'human');
    const quay = view.terrains!.find((ter) => ter.id === 'quai-port-dividende')!;
    expect(quay.active).toBe(true);
    const html = renderSheet(view, lang, quay.hex);
    expect(html).toContain(escaped(quay.name)); // le terrain reste décrit dans le repli…
    expect(html).not.toContain('hx-sheet-terrain-line'); // …sans ligne de privilèges
  });

  it('une case libre prévient que le déménagement quitte le terrain : remboursement hors privilèges, le même que le formulaire', () => {
    const { g } = hexGame(lang, 'ile-aux-niches');
    const view = getPlayerView(g, 'human');
    const h = messages(lang).hex;
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const company = mine(view);
    const product = company.products[0];
    const island = view.terrains!.find((ter) => ter.id === 'ile-aux-niches')!;
    const reference = { kind: 'product' as const, productId: product.id };
    const cost = hexMoveCost(product);
    const free = view.hexes!.free.find((id) => hexCellBid(view, id, reference, 'move', cost).verdict.state === 'ok')!;
    expect(free).toBeDefined();
    const bid = hexCellBid(view, free, reference, 'move', cost);
    const html = renderSheet(view, lang, free);
    const headline = html.split('<p class="hx-headline hx-headline-ok"')[1].split('</p>')[0];
    expect(headline).toContain(escaped(h.headMove(product.name, fmt.signedMoney(bid.gain!))));
    expect(headline).toContain(escaped(h.paybackMovePerks(bid.verdict.atReserve!, fmt.money(bid.reserve))));
    // Île-aux-Niches: tax first in the grant, then three more effects.
    expect(headline).toContain(`<span class="hx-headline-warn">${escaped(h.leavesTerrainMore(island.name, t.lobby.terrainFx.tax(fmt.pct(0, 0))))}</span>`);
    // The move form opened on that cell prices the same payback at the reserve, and lists the loss.
    setState({ lang, view, lobby: null });
    const form = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(HexMoveForm, { company, product, hexId: free, inSheet: true }) }));
    expect(form).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackQuarters(bid.verdict.atReserve!))}</dd>`);
    expect(form).toContain(escaped(h.verdictPerksHq(island.name)));
    // On the plant's own cell, the search for a better cell says it ignores those perks.
    const own = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(HexCellSheet, { view, hexId: product.hexId!, onSeekMove: () => {} }) }));
    expect(own).toContain(escaped(h.seekMovePerks));
    expect(own).not.toContain(`>${escaped(h.seekMove)}<`);
    // Without an active terrain: no warning, a plain payback and a plain search.
    view.terrains = view.terrains!.map((ter) => ({ ...ter, active: false }));
    const plain = renderSheet(view, lang, free);
    expect(plain).not.toContain('hx-headline-warn');
    expect(plain).toContain(escaped(h.paybackMove(bid.verdict.atReserve!, fmt.money(bid.reserve))));
    const plainOwn = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(HexCellSheet, { view, hexId: product.hexId!, onSeekMove: () => {} }) }));
    expect(plainOwn).toContain(`>${escaped(h.seekMove)}<`);
  });

  it('un seul effet en cours : le titre le nomme ; aucun libellé (suspension) : « effets perdus »', () => {
    const { g } = hexGame(lang, 'ile-aux-niches');
    const view = getPlayerView(g, 'human');
    const h = messages(lang).hex;
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const product = mine(view).products[0];
    const island = view.terrains!.find((ter) => ter.id === 'ile-aux-niches')!;
    const reference = { kind: 'product' as const, productId: product.id };
    const free = view.hexes!.free.find((id) => hexCellBid(view, id, reference, 'move', hexMoveCost(product)).gain !== null)!;
    expect(free).toBeDefined();
    // Only the tax exemption left: « quitte Île-aux-Niches : impôt 0 %, effet perdu ».
    product.private!.terrainEffects = product.private!.terrainEffects!.filter((fx) => fx.lever === 'tax');
    expect(renderSheet(view, lang, free)).toContain(`<span class="hx-headline-warn">${escaped(h.leavesTerrain(island.name, t.lobby.terrainFx.tax(fmt.pct(0, 0))))}</span>`);
    // Effects suspended by local news, the grant still running: the headline cannot list them but still warns.
    product.private!.terrainEffects = [];
    expect(renderSheet(view, lang, free)).toContain(`<span class="hx-headline-warn">${escaped(h.leavesTerrainAll(island.name))}</span>`);
  });

  it('une case libre qui ne se rembourse pas avant la fin : le titre le dit, en rouge', () => {
    const { g } = hexGame(lang, 'ile-aux-niches');
    const view = getPlayerView(g, 'human');
    view.turn = view.config.totalTurns - 1;
    const h = messages(lang).hex;
    const product = mine(view).products[0];
    const reference = { kind: 'product' as const, productId: product.id };
    const free = view.hexes!.free.find((id) => hexCellBid(view, id, reference, 'move', hexMoveCost(product)).verdict.state === 'late')!;
    expect(free).toBeDefined();
    const bid = hexCellBid(view, free, reference, 'move', hexMoveCost(product));
    const html = renderSheet(view, lang, free);
    expect(html).toContain('<p class="hx-headline hx-headline-late"');
    expect(html).toContain(escaped(h.paybackLate(bid.verdict.atReserve!, bid.quartersLeft)));
  });

  it('privilège suspendu par une nouvelle locale : la ligne le dit au lieu de lister', () => {
    const { g } = hexGame(lang, 'portes-petit-rabais');
    const view = getPlayerView(g, 'human');
    const product = mine(view).products[0];
    product.private!.terrainEffects = []; // ce que renvoie le moteur pendant une suspension de l'exonération
    const h = messages(lang).hex;
    expect(renderSheet(view, lang, product.hexId!)).toContain(escaped(h.terrainActiveLine(h.terrainSuspended)));
  });
});

describe('effets en vigueur : règles de lecture', () => {
  it('un impôt qui ne bat plus le taux national n’est pas listé ; la chaleur jamais', () => {
    const { g } = hexGame('fr', 'monts-defiscalises');
    const view = getPlayerView(g, 'human');
    const company = mine(view);
    const product = company.products[0];
    const t = messages('fr');
    const fmt = fmtFor('fr');
    const found = startingTerrainAt(view, company, product)!;
    expect(startingTerrainEffectsText(t, fmt, found)).toBe([t.lobby.terrainFx.tax(fmt.pct(0.05, 0)), t.lobby.terrainFx.labor(signed('fr', 0.9))].join(' · '));
    product.private!.terrainEffects = [...product.private!.terrainEffects!, { lever: 'heat', mult: 2 }];
    company.taxRate = view.taxRate; // privilège fiscal suspendu : taux public du siège = taux national
    expect(startingTerrainEffectsText(t, fmt, startingTerrainAt(view, company, product)!)).toBe(t.lobby.terrainFx.labor(signed('fr', 0.9)));
  });

  it.each(['fr', 'en'] as const)('une nouvelle de chaleur (demande d’une usine crypto) n’est pas un privilège du terrain (%s)', (lang) => {
    const { g } = hexGame(lang, 'monts-defiscalises', { sector: 'crypto' });
    const product = Object.values(g.companies).find((c) => c.controllerId === 'human')!.products[0];
    expect(heatCredit('crypto', product.hexId!)).toBeGreaterThan(0);
    // « Label Chaleur verte » : demande +10 % pour ce produit, sur toute case chauffée, terrain ou non.
    g.activeEffects.push({ id: 'heat-test', newsId: 'loc-chaleur-4', kind: 'heat', scope: 'all', productId: product.id, lever: 'demand', value: 1.1, turnsLeft: 2 });
    const view = getPlayerView(g, 'human');
    const company = mine(view);
    const own = company.products[0].private!;
    expect(own.terrainEffects).toContainEqual({ lever: 'demand', mult: 1.1 }); // le moteur la range avec le terrain…
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const demand = t.lobby.terrainFx.demand(signed(lang, 1.1));
    const found = startingTerrainAt(view, company, company.products[0])!;
    expect(found.effects.map((e) => e.fx.lever)).not.toContain('demand'); // …mais elle suit le produit s'il déménage
    expect(startingTerrainEffectsText(t, fmt, found)).not.toContain(demand);
    expect(startingTerrainTip(t, fmt, found, true)).not.toContain(demand);
    const sheet = renderSheet(view, lang, company.products[0].hexId!);
    const sheetLine = sheet.split('<p class="hx-sheet-terrain-line">')[1]?.split('</p>')[0] ?? '';
    expect(sheetLine).toContain(escaped(t.lobby.terrainFx.labor(signed(lang, 0.9))));
    expect(sheetLine).not.toContain(escaped(demand));
    const chips = renderCompany(view, lang, () => {}).split('<div class="company-ceo-line">')[1]?.split('</div>')[0] ?? '';
    expect(chips).toContain('terrain-chip');
    expect(chips).not.toContain(escaped(demand));
    // Dotation expirée et seule une nouvelle de chaleur en cours : plus de puce (Portes de Petit-Rabais, case chauffée).
    const portes = hexGame(lang, 'portes-petit-rabais', { sector: 'crypto' });
    const crypto = Object.values(portes.g.companies).find((c) => c.controllerId === 'human')!.products[0];
    expect(heatCredit('crypto', crypto.hexId!)).toBeGreaterThan(0);
    portes.g.turn = 9; // après le huitième trimestre, l'exonération de main-d'œuvre a expiré
    portes.g.activeEffects.push({ id: 'heat-test', newsId: 'loc-chaleur-4', kind: 'heat', scope: 'all', productId: crypto.id, lever: 'demand', value: 1.1, turnsLeft: 2 });
    const late = getPlayerView(portes.g, 'human');
    expect(late.terrains!.find((ter) => ter.id === 'portes-petit-rabais')!.runningEffects).toEqual({ headquarters: false, factory: false });
    expect(mine(late).products[0].private!.terrainEffects).toContainEqual({ lever: 'demand', mult: 1.1 });
    expect(activeStartingTerrains(late, mine(late))).toEqual([]);
  });

  it.each(['fr', 'en'] as const)('une nouvelle locale du terrain sur la demande reste listée hors crypto (%s)', (lang) => {
    const { g } = hexGame(lang, 'monts-defiscalises');
    g.activeEffects.push({ id: 'terrain-test', newsId: 'test', kind: 'terrain', terrain: 'monts-defiscalises', lever: 'demand', value: 1.1, turnsLeft: 2 });
    const view = getPlayerView(g, 'human');
    const company = mine(view);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const found = startingTerrainAt(view, company, company.products[0])!;
    expect(startingTerrainEffectsText(t, fmt, found)).toContain(t.lobby.terrainFx.demand(signed(lang, 1.1)));
  });

  it.each(['fr', 'en'] as const)('leviers des nouvelles locales : frais fixes et demande ont leur libellé (%s)', (lang) => {
    const t = messages(lang);
    const fmt = fmtFor(lang);
    expect(terrainFxLabel(t, fmt, { lever: 'fixedCost', mult: 1.2 })).toBe(t.lobby.terrainFx.fixedCost(signed(lang, 1.2)));
    expect(terrainFxLabel(t, fmt, { lever: 'demand', mult: 1.15 })).toBe(t.lobby.terrainFx.demand(signed(lang, 1.15)));
    expect(terrainFxLabel(t, fmt, { lever: 'heat', mult: 2 })).toBeNull();
  });
});
