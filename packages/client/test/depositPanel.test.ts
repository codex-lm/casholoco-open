import { createElement, Fragment, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMODITIES,
  PLAYER_COLORS,
  SITE_OPENING_COST_MULT,
  applyAction,
  createGame,
  getPlayerView,
  resolveTurn,
  slotCapacity,
  type Action,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
  type SiteSlotView,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { decisionText } from '../src/i18n/decisionReadability';
import { sheetReadabilityMessages } from '../src/i18n/sheetReadability';
import {
  DepositFooter,
  DepositPanel,
  SiteSheet,
  commodityNeed,
  depositHasFooter,
} from '../src/screens/game/DepositPanel';
import { depositPayback, depositSavings, depositSavingsNow } from '../src/screens/game/sitesPickerModel';
import { extractionCostNow } from '../src/transport';
import { getState, setState, type AppState } from '../src/store';

/**
 * La prise d'enchère est vérifiée sur les props réellement passées à AmountForm (capturées par la
 * maquette ci-dessous) : libellés, bornes, validation, et `onSubmit` appelé pour de bon — le dépôt
 * n'a ni jsdom ni testing-library, les rendus sont statiques (SSR). La maquette socket ci-dessous
 * suit la charge utile jusqu'à 'game:action' (motif de test/guided-game-api.test.ts).
 */
const amountForms = vi.hoisted(() => ({ list: [] as Record<string, unknown>[] }));
vi.mock('../src/components/AmountForm', () => ({
  AmountForm: (props: Record<string, unknown>) => {
    amountForms.list.push(props);
    return null;
  },
}));

const transport = vi.hoisted(() => ({ emit: vi.fn(), connected: true }));
// Preserve the tested action boundary while replacing the former network transport.
vi.mock('../src/solo/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/solo/runtime')>();
  return {
    ...actual,
    applySoloAction: (action: import('@muchomoney/core').Action, turn?: number) =>
      new Promise<import('@muchomoney/core').ActionResult>((resolve) => transport.emit('game:action', turn === undefined ? { action } : { action, turn }, resolve)),
    advanceSoloTurn: (turn?: number) => {
      transport.emit('game:ready', turn === undefined ? { ready: true } : { ready: true, turn });
      return { ok: true, message: 'OK' };
    },
  };
});

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

interface CapturedForm {
  label: ReactNode;
  min?: number;
  max: number;
  presets?: number[];
  initial?: number;
  submitLabel: string;
  disabledReason?: string | null;
  info?: (amount: number) => ReactNode;
  after?: (amount: number) => ReactNode;
  onSubmit: (amount: number) => Promise<{ ok: boolean }>;
}

const initialState = getState();
beforeEach(() => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  amountForms.list.length = 0;
  transport.emit.mockReset();
  transport.emit.mockImplementation((_event: string, _payload: unknown, ack?: (r: unknown) => void) => ack?.({ ok: true }));
});
afterEach(() => {
  setState(initialState);
  vi.unstubAllGlobals();
});

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

function ok(g: GameState, who: string, a: Action): void {
  const r = applyAction(g, who, a);
  expect(r.ok, r.message).toBe(true);
}

/** Même partie que test/sitesPicker.test.ts : Cleo a sugar-2, Bob a oil-2, l'usine de yaourts est au sud. */
function zoneGame(lang: Lang) {
  const g = createGame({ seed: 7, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang }, [
    seat('cleo', 'Cleo', 'Cleo SA', 'yogurts', 0),
    seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
  ]);
  const of = (id: string) => Object.values(g.companies).find((c) => c.founderId === id)!;
  const [cleo, bob] = [of('cleo'), of('bob')];
  g.players.cleo.cash = 1e6;
  g.players.bob.cash = 1e6;
  ok(g, 'cleo', { type: 'bidSite', companyId: cleo.id, slotId: 'sugar-2', amount: COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT });
  ok(g, 'bob', { type: 'bidSite', companyId: bob.id, slotId: 'oil-2', amount: COMMODITIES.oil.basePrice * SITE_OPENING_COST_MULT });
  ok(g, 'cleo', { type: 'moveFactory', companyId: cleo.id, productId: cleo.products[0].id, zoneId: 'south' });
  resolveTurn(g);
  return { g, cleo, bob };
}

/** Vue où Cleo n'a plus de filiale : sugar-2 redevient libre, tous les gisements sucre sont enchérissables. */
function freeViewOf(view: PlayerView, companyId: string): PlayerView {
  const free = structuredClone(view);
  free.companies.find((c) => c.id === companyId)!.sites = [];
  free.siteSlots = free.siteSlots.map((slot) => (slot.companyId === companyId ? { ...slot, companyId: undefined } : slot));
  return free;
}

function renderNode(view: PlayerView, lang: Lang, node: ReactElement): string {
  setState({ lang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: node }));
}

const lastForm = (): CapturedForm => amountForms.list[amountForms.list.length - 1] as unknown as CapturedForm;
const slotOf = (view: PlayerView, id: string): SiteSlotView => view.siteSlots.find((s) => s.id === id)!;

describe.each(['fr', 'en'] as const)('DepositPanel (%s)', (lang) => {
  const { g, cleo } = zoneGame(lang);
  const t = messages(lang);
  const fmt = fmtFor(lang);
  const view = getPlayerView(g, 'cleo');
  const mine = view.companies.find((c) => c.id === cleo.id)!;
  const freeView = freeViewOf(view, mine.id);
  const freeMine = freeView.companies.find((c) => c.id === mine.id)!;
  const p = t.sitesPicker;
  const decision = decisionText(lang);

  it('gisement libre : décision et enchère d’abord, description repliée et chiffres non répétés', () => {
    const slot = slotOf(freeView, 'sugar-1');
    const html = renderNode(freeView, lang, createElement(DepositPanel, { company: freeMine, slot }));
    const sav = depositSavings(freeView, freeMine, 'sugar-1');
    const reserve = COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT;
    const payback = depositPayback(reserve, sav.total, freeView.config.totalTurns - freeView.turn);
    const sugar = freeView.commodities.find((c) => c.id === 'sugar')!;
    const summary = html.slice(html.indexOf('<section class="decision-summary"'), html.indexOf('</section>') + '</section>'.length);
    const details = html.slice(html.indexOf('<details class="pk-details"'));
    expect(html).toContain(escaped(p.kindRich(t.sites.names.sugar, t.sites.richness.rich)));
    expect(summary).toContain(`<dt>${escaped(decision.destination)}</dt><dd>${escaped(slot.name)}</dd>`);
    expect(summary).toContain(`<dt>${escaped(decision.maximum)}</dt><dd>${escaped(fmt.money(reserve))}</dd>`);
    expect(summary).toContain(`<dt>${escaped(decision.savings)}</dt><dd>${escaped(fmt.money(sav.total))}</dd>`);
    expect(summary).toContain(`<dt>${escaped(decision.timing)}</dt><dd>${escaped(decision.depositClose)}</dd>`);
    expect(summary).toContain(escaped(decision.depositConditions));
    expect(html).not.toContain(`<h4 class="pk-title">${escaped(slot.name)}</h4>`);
    expect(html.indexOf('decision-summary')).toBeLessThan(html.indexOf('<details'));
    expect(details).toMatch(/^<details class="pk-details"><summary>/);
    expect(details).toContain(escaped(sheetReadabilityMessages(lang).locationDetails));
    expect(html).toContain(escaped(p.statusFree(slotCapacity('sugar-1'))));
    expect(details).not.toContain('class="pk-save"');
    expect(html).not.toContain(escaped(p.savingsNote));
    expect(html).toContain(escaped(p.deliveredTitle));
    expect(html).toContain(escaped(p.extraction(fmt.money(extractionCostNow('sugar', sugar.siteCostFactor)))));
    expect(html).toContain(escaped(p.needLine(fmt.int(commodityNeed(freeMine, 'sugar')), fmt.int(sav.coveredLots))));
    expect(payback.quarters).not.toBeNull();
    expect(summary).toContain(`<dt>${escaped(decision.payback)}</dt><dd>${escaped(decision.quarters(payback.quarters!))}</dd>`);
    expect(details).not.toContain(escaped(payback.never ? p.paybackNever(fmt.money(reserve)) : p.payback(fmt.money(reserve), payback.quarters!)));
    expect(html).toContain(escaped(p.auctionFoot));
    // Bornes et soumission sont conservées ; les chiffres viennent du résumé plutôt que d'une info répétée.
    expect(amountForms.list).toHaveLength(1);
    const form = lastForm();
    expect(form.label).toBe(p.bidField(fmt.unit));
    expect(form.min).toBe(reserve);
    expect(form.max).toBe(freeMine.cash);
    expect(form.presets).toEqual([]);
    expect(form.initial).toBe(reserve);
    expect(form.submitLabel).toBe(p.bidCta);
    expect(form.disabledReason).toBeNull();
    expect(form.info).toBeUndefined();
    expect(form.after!(reserve)).toBe(t.form.cashAfterWorst(fmt.money(freeMine.cash - reserve)));
  });

  it('envoie la même charge utile bidSite qu\'avant quand le formulaire est soumis', async () => {
    const slot = slotOf(freeView, 'sugar-1');
    renderNode(freeView, lang, createElement(DepositPanel, { company: freeMine, slot }));
    const r = await lastForm().onSubmit(6000);
    expect(r.ok).toBe(true);
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'bidSite', companyId: mine.id, slotId: 'sugar-1', amount: 6000 }, turn: freeView.turn },
      expect.any(Function),
    );
  });

  it('filiale à soi : statut, bouton « sommeil », et pas d\'enchère', () => {
    const slot = slotOf(view, 'sugar-2');
    const html = renderNode(view, lang, createElement(DepositPanel, { company: mine, slot }));
    expect(html).toContain(escaped(p.statusTaken(mine.name, slotCapacity('sugar-2'))));
    expect(html).toContain(escaped(t.sites.active));
    expect(html).toContain(`aria-label="${escaped(t.sites.sleepAria(t.sites.names.sugar))}"`);
    expect(html).not.toContain(`aria-label="${escaped(t.sites.wakeAria(t.sites.names.sugar))}"`);
    expect(amountForms.list).toHaveLength(0);
    expect(html).not.toContain(escaped(p.auctionFoot));
  });

  it('filiale en sommeil : bouton « relancer » et entretien, et pas d\'enchère', () => {
    const sleeping = structuredClone(view);
    const company = sleeping.companies.find((c) => c.id === mine.id)!;
    company.sites![0].dormant = true;
    company.sites![0].upkeep = 120;
    const slot = slotOf(sleeping, 'sugar-2');
    const html = renderNode(sleeping, lang, createElement(DepositPanel, { company, slot }));
    expect(html).toContain(escaped(t.sites.dormant(fmt.money(120))));
    expect(html).toContain(escaped(p.savingsPotential));
    expect(html).toContain(`aria-label="${escaped(t.sites.wakeAria(t.sites.names.sugar))}"`);
    expect(amountForms.list).toHaveLength(0);
  });

  it('économies « potentielles » tant que la filiale dort ou est en chantier, jamais la note courante', () => {
    const sleeping = structuredClone(view);
    const company = sleeping.companies.find((c) => c.id === mine.id)!;
    const site = company.sites![0];
    site.dormant = true;
    const slot = slotOf(sleeping, 'sugar-2');
    let html = renderNode(sleeping, lang, createElement(DepositPanel, { company, slot }));
    expect(html).toContain(escaped(p.savingsPotential));
    expect(html).not.toContain(escaped(p.savingsNote));
    site.dormant = false;
    site.activeFrom = sleeping.turn + 1; // en chantier : pareil, le chiffre est un potentiel de reprise
    html = renderNode(sleeping, lang, createElement(DepositPanel, { company, slot }));
    expect(html).toContain(escaped(p.savingsPotential));
    expect(html).not.toContain(escaped(p.savingsNote));
    // Sur un gisement libre, une news qui baisse l'extraction ne promet rien pour le trimestre suivant.
    const oil = sleeping.commodities.find((commodity) => commodity.id === 'oil')!;
    oil.siteCostFactor = 0.5;
    const free = slotOf(sleeping, 'oil-1');
    expect(free.companyId ?? null).toBeNull();
    const freeHtml = renderNode(sleeping, lang, createElement(DepositPanel, { company, slot: free }));
    expect(freeHtml).not.toContain(escaped(p.savingsNews(fmtFor(lang).money(depositSavingsNow(sleeping, company, 'oil-1').total))));
  });

  it('hideTitle : une seule destination dans le résumé libre ; les filiales gardent le titre optionnel', () => {
    const slot = slotOf(freeView, 'sugar-1');
    const hidden = renderNode(freeView, lang, createElement(DepositPanel, { company: freeMine, slot, hideTitle: true }));
    expect(hidden).not.toContain(`<h4 class="pk-title">${escaped(slot.name)}</h4>`);
    expect(hidden).toContain(`<dd>${escaped(slot.name)}</dd>`);
    // La richesse et le reste de la fiche restent.
    expect(hidden).toContain(escaped(p.kindRich(t.sites.names.sugar, t.sites.richness.rich)));
    const shown = renderNode(freeView, lang, createElement(DepositPanel, { company: freeMine, slot }));
    expect(shown).toBe(hidden);
    const ownSlot = slotOf(view, 'sugar-2');
    const ownShown = renderNode(view, lang, createElement(DepositPanel, { company: mine, slot: ownSlot }));
    const ownHidden = renderNode(view, lang, createElement(DepositPanel, { company: mine, slot: ownSlot, hideTitle: true }));
    expect(ownShown).toContain(`<h4 class="pk-title">${escaped(ownSlot.name)}</h4>`);
    expect(ownHidden).not.toContain(`<h4 class="pk-title">${escaped(ownSlot.name)}</h4>`);
  });

  it('typographie de la langue', () => {
    const slot = slotOf(freeView, 'sugar-1');
    const html = renderNode(freeView, lang, createElement(DepositPanel, { company: freeMine, slot }));
    if (lang === 'en') {
      expect(html).not.toContain('«');
      expect(html).not.toContain('»');
      expect(html).not.toContain('€');
    } else {
      expect(html).toContain('€');
    }
  });

  it('gisement d\'un rival : note « pris » en corps et en pied, pas d\'enchère', () => {
    const slot = slotOf(view, 'oil-2');
    const html = renderNode(view, lang, createElement(DepositPanel, { company: mine, slot }));
    expect(html).toContain(escaped(p.statusTaken('Bob Corp', slotCapacity('oil-2'))));
    expect(html).toContain(escaped(p.takenNote));
    expect(html).toContain(escaped(p.takenFoot));
    expect(amountForms.list).toHaveLength(0);
  });

  it('gisement libre d\'une matière déjà exploitée : siteExists, et pas de pied', () => {
    const slot = slotOf(view, 'sugar-1');
    const html = renderNode(view, lang, createElement(DepositPanel, { company: mine, slot }));
    expect(html).toContain(escaped(p.siteExists));
    expect(html).not.toContain(escaped(p.takenFoot));
    expect(html).not.toContain(escaped(p.auctionFoot));
    expect(amountForms.list).toHaveLength(0);
  });

  it('mise en attente : ligne avec retrait, formulaire pré-rempli, « déplacer » sur un autre gisement', () => {
    const pendingView = structuredClone(freeView);
    const company = pendingView.companies.find((c) => c.id === mine.id)!;
    pendingView.self!.siteBids = [
      { companyId: mine.id, playerId: 'cleo', commodityId: 'sugar', slotId: 'sugar-3', amount: 6000, turn: pendingView.turn },
    ];
    const slot3 = slotOf(pendingView, 'sugar-3');
    const html = renderNode(pendingView, lang, createElement(DepositPanel, { company, slot: slot3 }));
    expect(html).toContain(escaped(t.sites.pending(fmt.money(6000), slot3.name)));
    expect(html).toContain(`aria-label="${escaped(t.sites.withdrawAria(t.sites.names.sugar))}"`);
    expect(html).toContain(escaped(t.sites.withdraw));
    expect(lastForm().initial).toBe(6000);
    expect(lastForm().submitLabel).toBe(t.sites.bidChange);
    // Sur un autre gisement de la même matière : même mise en attente affichée, bouton « déplacer ».
    const slot1 = slotOf(pendingView, 'sugar-1');
    const moved = renderNode(pendingView, lang, createElement(DepositPanel, { company, slot: slot1 }));
    expect(moved).toContain(escaped(t.sites.pending(fmt.money(6000), slot3.name)));
    expect(lastForm().initial).toBe(COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT);
    expect(lastForm().submitLabel).toBe(p.bidMove);
  });

  it('enchère sans suite : l\'issue ne s\'affiche que sur le gisement misé', () => {
    const failed = structuredClone(freeView);
    const company = failed.companies.find((c) => c.id === mine.id)!;
    failed.self!.siteBids = [
      { companyId: mine.id, playerId: 'cleo', commodityId: 'lithium', slotId: 'lithium-3', amount: 15000, turn: failed.turn,
        result: { outcome: 'failed', price: 0, bidders: 1 } },
    ];
    const onSlot = renderNode(failed, lang, createElement(DepositPanel, { company, slot: slotOf(failed, 'lithium-3') }));
    expect(onSlot).toContain(escaped(t.sites.failed));
    const other = renderNode(failed, lang, createElement(DepositPanel, { company, slot: slotOf(failed, 'lithium-1') }));
    expect(other).not.toContain(escaped(t.sites.failed));
  });

  it('validation : dernier tour, puis trésorerie sous la mise de prix', () => {
    const lastTurn = structuredClone(freeView);
    lastTurn.turn = lastTurn.config.totalTurns;
    const company1 = lastTurn.companies.find((c) => c.id === mine.id)!;
    renderNode(lastTurn, lang, createElement(DepositPanel, { company: company1, slot: slotOf(lastTurn, 'sugar-1') }));
    expect(lastForm().disabledReason).toBe(t.sites.lastTurn);
    const broke = structuredClone(freeView);
    const company2 = broke.companies.find((c) => c.id === mine.id)!;
    company2.cash = COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT - 1;
    renderNode(broke, lang, createElement(DepositPanel, { company: company2, slot: slotOf(broke, 'sugar-1') }));
    expect(lastForm().disabledReason).toBe(t.sites.noCash);
  });

  it('depositHasFooter : à soi ou matière déjà exploitée → pas de pied ; rival ou libre → pied', () => {
    expect(depositHasFooter(mine, slotOf(view, 'sugar-2'))).toBe(false); // à soi
    expect(depositHasFooter(mine, slotOf(view, 'sugar-1'))).toBe(false); // sucre déjà exploité
    expect(depositHasFooter(mine, slotOf(view, 'oil-2'))).toBe(true); // pris par Bob
    expect(depositHasFooter(freeMine, slotOf(freeView, 'sugar-1'))).toBe(true); // libre
  });

  it('place le pied d’enchère avant le corps replié, puis conserve les filiales sans pied', () => {
    // Gisement libre : pied chiffré + description sans seconde décision.
    const freeSlot = slotOf(freeView, 'sugar-1');
    const sheet = renderNode(freeView, lang, createElement(SiteSheet, { company: freeMine, slot: freeSlot, hideTitle: true, hideDecision: true }));
    const foot = renderNode(freeView, lang, createElement(DepositFooter, { company: freeMine, slot: freeSlot, desktop: true }));
    const panel = renderNode(freeView, lang, createElement(DepositPanel, { company: freeMine, slot: freeSlot }));
    expect(panel).toBe(`${foot}<details class="pk-details"><summary>${escaped(sheetReadabilityMessages(lang).locationDetails)}</summary>${sheet}</details>`);
    // Filiale à soi : corps seul, sans pied.
    const ownSlot = slotOf(view, 'sugar-2');
    const ownSheet = renderNode(view, lang, createElement(SiteSheet, { company: mine, slot: ownSlot }));
    const ownPanel = renderNode(view, lang, createElement(DepositPanel, { company: mine, slot: ownSlot }));
    expect(ownPanel).toBe(ownSheet);
  });

  it('après une fusion, le bouton suit l’état du gisement montré et nomme l’autre filiale', () => {
    const merged = structuredClone(view);
    const company = merged.companies.find((c) => c.id === mine.id)!;
    const base = company.sites![0];
    const awakeSite = { ...base, id: 'sugar-1', name: merged.siteSlots.find((s) => s.id === 'sugar-1')!.name };
    const dormantSite = { ...base, id: 'sugar-3', name: merged.siteSlots.find((s) => s.id === 'sugar-3')!.name, dormant: true, upkeep: 120 };
    company.sites = [awakeSite, dormantSite];
    merged.siteSlots = merged.siteSlots.map((s) => (s.id === 'sugar-1' || s.id === 'sugar-3' ? { ...s, companyId: company.id } : s));
    // Sur le gisement en service : « Mettre en sommeil » et la ligne de la filiale endormie avec son entretien.
    const onAwake = renderNode(merged, lang, createElement(DepositPanel, { company, slot: slotOf(merged, 'sugar-1') }));
    expect(onAwake).toContain(`aria-label="${escaped(t.sites.sleepAria(t.sites.names.sugar))}"`);
    expect(onAwake).not.toContain(`aria-label="${escaped(t.sites.wakeAria(t.sites.names.sugar))}"`);
    expect(onAwake).toContain(escaped(t.sites.siblingDormant(dormantSite.name, fmt.money(120))));
    // Sur le gisement en sommeil : « Relancer » et la ligne de la filiale en service.
    const onDormant = renderNode(merged, lang, createElement(DepositPanel, { company, slot: slotOf(merged, 'sugar-3') }));
    expect(onDormant).toContain(`aria-label="${escaped(t.sites.wakeAria(t.sites.names.sugar))}"`);
    expect(onDormant).not.toContain(`aria-label="${escaped(t.sites.sleepAria(t.sites.names.sugar))}"`);
    expect(onDormant).toContain(escaped(t.sites.siblingActive(awakeSite.name)));
  });
});
