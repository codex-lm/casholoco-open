import { Children, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getPlayerView, hexPlaceName, type Lang, type PlayerView } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import type { GameData } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { decisionText } from '../src/i18n/decisionReadability';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { getState, setState, type AppState } from '../src/store';

/**
 * HexMoveForm monté seul, pour une case déjà choisie (panneau latéral de « La carte ») : mêmes
 * textes qu'avant l'extraction, même charge utile moveFactory à l'envoi, même retrait d'une mise en
 * attente. Les rendus sont statiques (SSR) ; les props réellement passées à AmountForm sont
 * capturées par la maquette ci-dessous, et la maquette socket suit la charge utile jusqu'à
 * 'game:action' (motif de test/guided-game-api.test.ts). useState est simulé par ordre d'appel pour
 * les appels directs au composant (motif de test/hexBidForms.test.ts) — indices : 0 repli,
 * 1 mise saisie.
 */
const hooks = vi.hoisted(() => ({ cursor: 0, overrides: {} as Record<number, unknown>, updates: [] as { index: number; value: unknown }[] }));
const data = vi.hoisted(() => ({ current: null as GameData | null }));
const amountForms = vi.hoisted(() => ({ list: [] as Record<string, unknown>[] }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => {
    const i = hooks.cursor++;
    const value = i in hooks.overrides ? hooks.overrides[i] : typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [value, vi.fn((next: unknown) => hooks.updates.push({ index: i, value: typeof next === 'function' ? (next as (previous: unknown) => unknown)(value) : next }))];
  } };
});
vi.mock('../src/hooks/useGame', () => ({ useGame: () => data.current }));
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
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

interface CapturedForm {
  label: ReactNode;
  min?: number;
  max: number;
  initial?: number;
  presets?: number[];
  submitLabel: string;
  disabledReason?: string | null;
  onSubmit: (amount: number) => Promise<{ ok: boolean }>;
}

const initialState = getState();
beforeEach(() => {
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  transport.emit.mockReset();
  transport.emit.mockImplementation((_event: string, _payload: unknown, ack?: (r: unknown) => void) => ack?.({ ok: true }));
});
afterEach(() => {
  setState(initialState);
  vi.unstubAllGlobals();
});

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
const lastForm = (): CapturedForm => amountForms.list[amountForms.list.length - 1] as unknown as CapturedForm;

function fixture(lang: Lang) {
  const game = createGame(
    { seed: 71, totalTurns: 8, turnSeconds: 90, startYear: 2027, mapMode: 'hex', terrainAssignment: 'fair', lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Holding', sectorId: 'gadgets', connected: true, color: '#123456' }],
  );
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  const view = getPlayerView(game, 'human');
  return { game, view, company: view.companies.find((c) => c.id === company.id)! };
}

function setup(view: PlayerView, lang: Lang, overrides: Record<number, unknown> = {}) {
  setState({ lang, view, lobby: null });
  hooks.cursor = 0;
  hooks.overrides = overrides;
  hooks.updates = [];
  amountForms.list.length = 0;
  data.current = { view, me: view.players.find((p) => p.id === view.you)!, sectorsById: new Map(view.sectors.map((s) => [s.id, s])) } as GameData;
}

function find(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (predicate(child)) return child;
    const nested = find(child.props.children as ReactNode, predicate);
    if (nested) return nested;
  }
  return undefined;
}

describe.each(['fr', 'en'] as const)('HexMoveForm — déménagement hexagonal vers une case choisie (%s)', (lang) => {
  it('montre l\'aide, le coût comptant, l\'indice transport et l\'enchère, sans plateau ni grille', () => {
    const { view, company } = fixture(lang);
    const t = messages(lang);
    const h = t.hex;
    const fmt = fmtFor(lang);
    const product = company.products[0];
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    const moveCost = product.private!.hexes!.moveCost;
    setup(view, lang);
    const html = renderToStaticMarkup(createElement(HexMoveForm, { company, product, hexId }));

    // La règle complète, l'aide du déménagement et l'indice transport attendent dans le pli fermé ; une ligne de la
    // règle reste près de la mise.
    const fold = html.slice(html.indexOf('<details class="hx-bid-rules">'));
    expect(fold.startsWith(`<details class="hx-bid-rules"><summary>${escaped(h.formRulesTitle)}</summary>`)).toBe(true);
    expect(fold).toContain(escaped(h.formMoveHelp));
    expect(fold).toContain(escaped(h.formAuctionHelp));
    expect(fold).toContain(escaped(t.product.moveHint));
    expect(html.slice(0, html.indexOf('<details class="hx-bid-rules">'))).toContain(escaped(h.formBidRule));
    // Frais + mise sont réunis au résumé, avec la prise d'effet après cette clôture.
    const decision = decisionText(lang);
    expect(html).toContain(`<dt>${escaped(decision.destination)}</dt><dd>${escaped(hexPlaceName(hexId, lang, view.siteSlots))}</dd>`);
    expect(html).toContain(`<dt>${escaped(decision.maximum)}</dt><dd>${escaped(fmt.money(moveCost + reserve))}</dd>`);
    expect(html).toContain(`<dt>${escaped(decision.reserve)}</dt><dd>${escaped(fmt.money(reserve))}</dd>`);
    expect(html).toContain(`<dt>${escaped(h.deltaLabel)}</dt>`);
    expect(html).toContain(`<dt>${escaped(h.formMoveCost)}</dt><dd>${escaped(fmt.money(moveCost))}</dd>`);
    expect(html).toContain(`<dt>${escaped(decision.payback)}</dt>`);
    expect(html).toContain('decision-summary');
    expect(html).toContain(escaped(decision.moveClose));
    expect(html).toContain(escaped(decision.conditions));
    // Autonome dans le panneau latéral : ni plateau, ni la grille du sélecteur à deux colonnes.
    expect(html).not.toContain('hx-board');
    expect(html).not.toContain('hx-bid-picker');
    expect(html).not.toContain('NaN');
    if (lang === 'en') expect(html).not.toMatch(/[àâçéèêëîïôûùœ«»€]/i);

    // Hors incubateur : pas de choix de repli ; le bouton « Annuler » est là.
    expect(html).not.toContain('hx-fallback');
    expect(html).not.toContain('type="radio"');
    expect(html).toContain(`>${escaped(t.common.cancel)}<`);

    // Le formulaire d'enchère reçoit exactement les mêmes props qu'avant l'extraction.
    expect(amountForms.list).toHaveLength(1);
    const form = lastForm();
    expect(form.label).toBe(h.formBid);
    expect(form.min).toBe(reserve);
    expect(form.max).toBe(company.cash - moveCost);
    expect(form.initial).toBe(reserve);
    expect(form.submitLabel).toBe(h.formMoveBid);
    expect(form.disabledReason).toBeNull();
    expect(form.presets).toEqual([]);
  });

  it('dans la fiche de la case, sans destination ni mise à prix au résumé ; à l’incubateur, l’échéance reste visible', () => {
    const { view, company } = fixture(lang);
    const h = messages(lang).hex;
    const decision = decisionText(lang);
    const product = company.products[0];
    const hexId = view.hexes!.free[0];
    setup(view, lang);
    const inSheet = renderToStaticMarkup(createElement(HexMoveForm, { company, product, hexId, inSheet: true }));
    expect(inSheet).not.toContain(`<dt>${escaped(decision.destination)}</dt>`);
    expect(inSheet).not.toContain(`<dt>${escaped(decision.reserve)}</dt>`);
    expect(inSheet).toContain(`<dt>${escaped(decision.maximum)}</dt>`);
    // A start-up still at the incubator: the forced-placement deadline is never folded, the fallback says its cost.
    product.incubator = true;
    delete product.hexId;
    setup(view, lang);
    const incubator = renderToStaticMarkup(createElement(HexMoveForm, { company, product, hexId, inSheet: true }));
    const visible = incubator.slice(0, incubator.indexOf('<details class="hx-bid-rules">'));
    expect(visible).toContain(escaped(h.formIncubatorHelp));
    expect(visible).toContain('hx-fallback');
    expect(visible).toContain(escaped(h.formNearest));
    expect(incubator.slice(incubator.indexOf('<details class="hx-bid-rules">'))).toContain(escaped(h.formFallbackHelp));
  });

  it('envoie la même charge utile moveFactory qu\'avant quand le formulaire est soumis, sans repli', async () => {
    const { view, company } = fixture(lang);
    const product = company.products[0];
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    const onDone = vi.fn();
    setup(view, lang);
    renderToStaticMarkup(createElement(HexMoveForm, { company, product, hexId, onDone }));
    const r = await lastForm().onSubmit(reserve);
    expect(r.ok).toBe(true);
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'moveFactory', companyId: company.id, productId: product.id, hexId, bid: reserve }, turn: view.turn },
      expect.any(Function),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('montre la mise en attente et la retire avec l\'identifiant du produit, comme avant', async () => {
    const { game, company: original } = fixture(lang);
    const first = getPlayerView(game, 'human');
    const productId = original.products[0].id;
    const hexId = first.hexes!.free[0];
    const bid = first.hexes!.reserve[hexId];
    const applied = applyAction(game, 'human', { type: 'moveFactory', companyId: original.id, productId, hexId, bid });
    expect(applied.ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((c) => c.id === original.id)!;
    const product = company.products[0];
    const t = messages(lang);
    const h = t.hex;
    const fmt = fmtFor(lang);
    setup(view, lang);
    const html = renderToStaticMarkup(createElement(HexMoveForm, { company, product }));
    expect(html).toContain(escaped(h.formPendingMove(hexPlaceName(hexId, lang, view.siteSlots), fmt.money(bid))));
    expect(html).toContain(escaped(h.formWithdraw));
    // Le retrait envoie cancelHexBid avec l'identifiant du produit.
    setup(view, lang);
    const tree = HexMoveForm({ company, product });
    const withdraw = find(tree, (el) => el.type === 'button' && el.props.children === t.hex.formWithdraw)!;
    await (withdraw.props.onClick as () => void)();
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'cancelHexBid', companyId: company.id, productId }, turn: view.turn },
      expect.any(Function),
    );
  });

  it('refuse la mise sans trésorerie, avec la raison affichée', () => {
    const { view, company } = fixture(lang);
    const product = company.products[0];
    company.cash = 0;
    setup(view, lang);
    renderToStaticMarkup(createElement(HexMoveForm, { company, product, hexId: view.hexes!.free[0] }));
    expect(lastForm().disabledReason).toBe(messages(lang).hex.formNoCash);
  });
});
