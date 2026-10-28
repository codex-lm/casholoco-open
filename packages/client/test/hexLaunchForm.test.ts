import { Children, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getContent, SECTOR_IDS, applyAction, createGame, getPlayerView, hexPlaceName, type Lang, type PlayerView } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import type { GameData } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { decisionText } from '../src/i18n/decisionReadability';
import { maxProductsOf } from '../src/rules';
import { HexLaunchForm, HexPendingProjects } from '../src/screens/game/LaunchForms';
import { getState, setState, type AppState } from '../src/store';

/**
 * HexLaunchForm monté seul, pour une case déjà choisie (panneau latéral de « La carte ») : mêmes
 * textes qu'avant l'extraction, même charge utile launchProduct à l'envoi. Les rendus sont statiques
 * (SSR) ; les props réellement passées à AmountForm sont capturées par la maquette ci-dessous, et la
 * maquette socket suit la charge utile jusqu'à 'game:action' (motif de test/guided-game-api.test.ts).
 * Le nom du produit est un état interne : useState est simulé par ordre d'appel (motif de
 * test/hexBidForms.test.ts) — indices du formulaire : 0 secteur, 1 nom, 2 repli, 3 génération,
 * 4 mise saisie.
 */
const hooks = vi.hoisted(() => ({ cursor: 0, overrides: {} as Record<number, unknown>, updates: [] as { index: number; value: unknown }[] }));
const data = vi.hoisted(() => ({ current: null as GameData | null }));
const amountForms = vi.hoisted(() => ({ list: [] as Record<string, unknown>[] }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useEffect: () => {}, useState: (initial: unknown) => {
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

describe.each(['fr', 'en'] as const)('HexLaunchForm — lancement hexagonal pour une case choisie (%s)', (lang) => {
  it('montre les textes du lancement et la fiche de la case, sans plateau ni grille', () => {
    const { view, company } = fixture(lang);
    const t = messages(lang);
    const h = t.hex;
    const fmt = fmtFor(lang);
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    const cost = view.sectors.find((s) => s.id === SECTOR_IDS[0])!.launchCost;
    setup(view, lang);
    const html = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId }));

    // Visibles : nom, légende de la case, une ligne de la règle près de la mise, repli (son coût dans ses libellés).
    const fold = html.slice(html.indexOf('<details class="hx-bid-rules">'));
    const visible = html.slice(0, html.indexOf('<details class="hx-bid-rules">'));
    expect(visible).toContain(`aria-label="${escaped(t.launch.namePlaceholder)}"`);
    expect(visible).toContain(`<legend>${escaped(h.formLaunchLegend)}</legend>`);
    expect(visible).toContain(escaped(h.formBidRule));
    expect(visible).toContain(escaped(h.formNearest));
    expect(visible).toContain(escaped(h.formAbandon));
    // Repliés sous « Comment se règle l'enchère ? » : la règle complète, le repli, le calendrier, le secteur et son
    // financement, les places.
    expect(fold.startsWith(`<details class="hx-bid-rules"><summary>${escaped(h.formRulesTitle)}</summary>`)).toBe(true);
    expect(fold).toContain(escaped(h.formAuctionHelp));
    expect(fold).toContain(escaped(h.formFallbackHelp));
    expect(fold).toContain(escaped(decisionText(lang).launchClose));
    expect(fold).toContain(escaped(t.launch.companyPays(company.name, fmt.money(company.cash))));
    expect(fold).toContain(escaped(t.company.launchFunding));
    expect(fold).toContain(escaped(h.formSlots(company.products.length, maxProductsOf(company))));

    // Le résumé rassemble la destination, le maximum engagé, les frais, la réserve et le remboursement.
    const decision = decisionText(lang);
    expect(html).toContain(`<dt>${escaped(decision.destination)}</dt><dd>${escaped(hexPlaceName(hexId, lang, view.siteSlots))}</dd>`);
    expect(html).toContain(`<dt>${escaped(decision.maximum)}</dt><dd>${escaped(fmt.money(cost + reserve))}</dd>`);
    expect(html).toContain(`<dt>${escaped(decision.reserve)}</dt><dd>${escaped(fmt.money(reserve))}</dd>`);
    expect(html).toContain(`<dt>${escaped(h.formLaunchCost)}</dt><dd>${escaped(fmt.money(cost))}</dd>`);
    expect(html).toContain(`<dt>${escaped(decision.payback)}</dt>`);
    expect(html).toContain('decision-summary');
    expect(html).toContain(escaped(decision.conditions));
    // Autonome dans le panneau latéral : ni plateau, ni la grille du sélecteur à deux colonnes.
    expect(html).not.toContain('hx-board');
    expect(html).not.toContain('hx-bid-picker');
    expect(html).not.toContain('NaN');
    if (lang === 'en') expect(html).not.toMatch(/[àâçéèêëîïôûùœ«»€]/i);

    // Le formulaire d'enchère reçoit exactement les mêmes props qu'avant l'extraction.
    expect(amountForms.list).toHaveLength(1);
    const form = lastForm();
    expect(form.label).toBe(h.formBid);
    expect(form.min).toBe(reserve);
    expect(form.max).toBe(company.cash - cost);
    expect(form.initial).toBe(reserve);
    expect(form.submitLabel).toBe(h.formPlaceBid);
    expect(form.disabledReason).toBe(h.formNeedName);
    // Une mise sur une case n'a pas de raccourcis ¼ / ½ / max.
    expect(form.presets).toEqual([]);
  });

  it('dans la fiche de la case, le résumé laisse la destination et la mise à prix à la fiche', () => {
    const { view, company } = fixture(lang);
    const fmt = fmtFor(lang);
    const decision = decisionText(lang);
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    const cost = view.sectors.find((s) => s.id === SECTOR_IDS[0])!.launchCost;
    setup(view, lang);
    const html = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId, inSheet: true }));
    expect(html).not.toContain(`<dt>${escaped(decision.destination)}</dt>`);
    expect(html).not.toContain(`<dt>${escaped(decision.reserve)}</dt>`);
    expect(html).toContain(`<dt>${escaped(decision.maximum)}</dt><dd>${escaped(fmt.money(cost + reserve))}</dd>`);
    expect(html).toContain(`<dt>${escaped(messages(lang).hex.formLaunchCost)}</dt><dd>${escaped(fmt.money(cost))}</dd>`);
    expect(html).toContain(`<dt>${escaped(decision.payback)}</dt>`);
  });

  it('envoie la même charge utile launchProduct qu\'avant quand le formulaire est soumis', async () => {
    const { view, company } = fixture(lang);
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    const onLaunched = vi.fn();
    setup(view, lang, { 1: '  New Widget  ', 2: 'abandon' });
    renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId, onLaunched }));
    const r = await lastForm().onSubmit(reserve + 10);
    expect(r.ok).toBe(true);
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'launchProduct', companyId: company.id, sectorId: SECTOR_IDS[0], name: 'New Widget', hexId, bid: reserve + 10, fallback: 'abandon' }, turn: view.turn },
      expect.any(Function),
    );
    expect(onLaunched).toHaveBeenCalledTimes(1);
  });

  it('refuse le lancement quand le nombre de produits est atteint, avec la raison affichée', () => {
    const { view, company } = fixture(lang);
    const t = messages(lang);
    const maxProducts = maxProductsOf(company);
    company.private!.launchProjects = Array.from({ length: maxProducts - company.products.length }, (_, i) => ({ id: `project-${i}`, name: `Project ${i}`, sectorId: 'crypto' as const }));
    setup(view, lang);
    renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId: view.hexes!.free[0] }));
    expect(lastForm().disabledReason).toContain(t.launch.full(maxProducts));
  });

  it('prévient la carte quand le joueur change de secteur, pour que la fiche chiffre le secteur lancé', () => {
    const { game, company: original } = fixture(lang);
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((c) => c.id === original.id)!;
    setup(view, lang);
    const onSectorChange = vi.fn();
    const tree = HexLaunchForm({ company, hexId: view.hexes!.free[0], initialSector: 'yogurts', onSectorChange });
    const content = getContent(lang);
    const gadgets = find(tree, (el) => el.type === 'button' && Array.isArray(el.props.children) && el.props.children.includes(content.sectors.gadgets.name))!;
    (gadgets.props.onClick as () => void)();
    expect(onSectorChange).toHaveBeenCalledWith('gadgets');
  });

  it('retire un projet en attente avec son identifiant, comme avant', async () => {
    const { game, company: original } = fixture(lang);
    const first = getPlayerView(game, 'human');
    const hexId = first.hexes!.free[0];
    const applied = applyAction(game, 'human', { type: 'launchProduct', companyId: original.id, name: 'Awaiting', sectorId: 'crypto', hexId, bid: first.hexes!.reserve[hexId], fallback: 'nearest' });
    expect(applied.ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((c) => c.id === original.id)!;
    setup(view, lang);
    const tree = HexLaunchForm({ company, hexId: view.hexes!.free[1] });
    expect(find(tree, (el) => el.type === HexPendingProjects)).toBeDefined();
    const projects = HexPendingProjects({ company });
    const withdraw = find(projects, (el) => el.type === 'button' && el.props.children === messages(lang).hex.formWithdrawProject)!;
    await (withdraw.props.onClick as () => void)();
    expect(transport.emit).toHaveBeenCalledWith(
      'game:action',
      { action: { type: 'cancelHexBid', companyId: company.id, projectId: company.private!.launchProjects![0].id }, turn: view.turn },
      expect.any(Function),
    );
  });
});
