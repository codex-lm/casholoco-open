import { Children, createElement, Fragment, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, capitalHexId, createGame, getPlayerView, resolveTurn, SECTOR_IDS, type CompanyView, type Lang, type PlayerView } from '@muchomoney/core';
import { sendAction } from '../src/api';
import { AmountForm } from '../src/components/AmountForm';
import { fmtFor } from '../src/fmt';
import type { GameData } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { decisionText } from '../src/i18n/decisionReadability';
import { maxProductsOf } from '../src/rules';
import { getState, setState, type AppState } from '../src/store';
import { HexPendingProjects, HexStartupModal, initialBidHex } from '../src/screens/game/HexBidForms';
import { HexBidSummary, HexLaunchForm } from '../src/screens/game/LaunchForms';
import { HexMoveForm } from '../src/screens/game/MoveForms';
import { SiteBidFooter } from '../src/screens/game/DepositPanel';
import { depositPayback, depositSavings } from '../src/screens/game/sitesPickerModel';
import { hexPaybackAtPrice } from '../src/screens/game/hexPayback';
import { hexEstimate, hexMarginValue } from '../src/screens/game/city/hexModel';

const hooks = vi.hoisted(() => ({ cursor: 0, id: 0, overrides: {} as Record<number, unknown>, updates: [] as { index: number; value: unknown }[] }));
const data = vi.hoisted(() => ({ current: null as GameData | null }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useId: () => `hex-bid-test-${++hooks.id}`, useEffect: () => {}, useState: (initial: unknown) => {
    const i = hooks.cursor++;
    const value = i in hooks.overrides ? hooks.overrides[i] : typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [value, vi.fn((next: unknown) => hooks.updates.push({ index: i, value: typeof next === 'function' ? (next as (previous: unknown) => unknown)(value) : next }))];
  } };
});
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
vi.mock('../src/hooks/useGame', () => ({ useGame: () => data.current }));
vi.mock('../src/api', () => ({ sendAction: vi.fn(async () => ({ ok: true, message: '' })) }));

const savedState = getState();
afterEach(() => { setState(savedState); vi.mocked(sendAction).mockClear(); });

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
  data.current = { view, me: view.players.find((p) => p.id === view.you)!, sectorsById: new Map(view.sectors.map((s) => [s.id, s])) } as GameData;
}

type Element = ReactElement<Record<string, unknown>>;
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
function find(node: ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (predicate(child)) return child;
    const nested = find(child.props.children as ReactNode, predicate);
    if (nested) return nested;
  }
  return undefined;
}

function amount(node: ReactNode): ReactElement<ComponentProps<typeof AmountForm>> {
  return find(node, (element) => element.type === AmountForm) as ReactElement<ComponentProps<typeof AmountForm>>;
}

/** Run the actual AmountForm validation and the form component's actual sendAction callback. */
async function submitBid(element: ReactElement<ComponentProps<typeof AmountForm>>, raw: string) {
  hooks.cursor = 0;
  hooks.overrides = { 0: raw };
  const form = AmountForm(element.props);
  await form.props.onSubmit({ preventDefault: vi.fn() });
  await Promise.resolve();
}

describe.each(['fr', 'en'] as const)('hex bid forms (%s)', (lang) => {
  it('does not estimate a launch budget or payback for an empty, low or unaffordable live bid', () => {
    const { view, company } = fixture(lang);
    const hexId = view.hexes!.free[0];
    const sectorId = SECTOR_IDS[0];
    const cost = view.sectors.find((sector) => sector.id === sectorId)!.launchCost;
    const reserve = view.hexes!.reserve[hexId];
    const d = decisionText(lang);
    for (const raw of ['', String(reserve - 1), String(company.cash - cost + 1)]) {
      setup(view, lang, { 1: 'Launch', 4: { key: `${hexId}-${sectorId}-0`, raw } });
      const html = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId }));
      expect(html).toContain(`<dt>${escaped(d.maximum)}</dt><dd>—</dd>`);
      expect(html).toContain(`<dt>${escaped(d.payback)}</dt><dd>—</dd>`);
      expect(html).toContain(`<dt>${escaped(d.reserve)}</dt><dd>${escaped(fmtFor(lang).money(reserve))}</dd>`);
      expect(html).not.toContain(escaped(d.latePayback));
      expect(html).not.toContain(escaped(d.riskyPayback));
    }
  });

  it('invalidates a deposit summary for empty, low and unaffordable live amounts', () => {
    const { view, company } = fixture(lang);
    const slot = view.siteSlots.find((slot) => slot.commodityId === 'sugar' && !slot.companyId)!;
    const d = decisionText(lang);
    for (const raw of ['', '1', String(company.cash + 1)]) {
      setup(view, lang, { 0: { key: `${company.id}:${slot.id}:`, raw } });
      const html = renderToStaticMarkup(createElement(SiteBidFooter, { company, slot, desktop: true }));
      expect(html).toContain(`<dt>${escaped(d.maximum)}</dt><dd>—</dd>`);
      expect(html).toContain(`<dt>${escaped(d.payback)}</dt><dd>—</dd>`);
      expect(html).not.toContain(escaped(d.quarters(0)));
      expect(html).toContain(escaped(d.reserve));
    }
  });

  it('recomputes a deposit budget and payback from the valid live amount', () => {
    const { view, company } = fixture(lang);
    const slot = view.siteSlots.find((slot) => slot.commodityId === 'sugar' && !slot.companyId)!;
    const typed = 10_000;
    setup(view, lang, { 0: { key: `${company.id}:${slot.id}:`, raw: String(typed) } });
    const html = renderToStaticMarkup(createElement(SiteBidFooter, { company, slot, desktop: true }));
    const d = decisionText(lang);
    const payback = depositPayback(typed, depositSavings(view, company, slot.id).total, view.config.totalTurns - view.turn);
    expect(html).toContain(`<dt>${escaped(d.maximum)}</dt><dd>${escaped(fmtFor(lang).money(typed))}</dd>`);
    expect(html).toContain(`<dt>${escaped(d.payback)}</dt><dd>${escaped(payback.quarters === null ? d.noPayback : d.quarters(payback.quarters))}</dd>`);
  });

  it('launches with only the explicit hex fields and enforces reserve/cash bounds', async () => {
    const { view, company } = fixture(lang);
    const hexId = view.hexes!.free[0];
    setup(view, lang, { 1: '  New Widget  ', 2: 'abandon' });
    const form = amount(HexLaunchForm({ company, hexId }));
    const cost = view.sectors.find((s) => s.id === SECTOR_IDS[0])!.launchCost;
    const reserve = view.hexes!.reserve[hexId];
    expect(form.props).toMatchObject({ min: reserve, max: company.cash - cost, initial: reserve });
    await submitBid(form, String(reserve - 1));
    await submitBid(form, String(company.cash - cost + 1));
    expect(sendAction).not.toHaveBeenCalled();
    await submitBid(form, String(reserve + 10));
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'launchProduct', companyId: company.id, sectorId: SECTOR_IDS[0], name: 'New Widget', hexId, bid: reserve + 10, fallback: 'abandon' });
  });

  it('moves with a hex bid, excludes move cost from its maximum and sends no classic zone or fallback', async () => {
    const { view, company } = fixture(lang);
    const product = company.products[0];
    const hexId = view.hexes!.free[0];
    setup(view, lang);
    const form = amount(HexMoveForm({ company, product, hexId }));
    const cost = product.private!.hexes!.moveCost;
    const reserve = view.hexes!.reserve[hexId];
    expect(form.props).toMatchObject({ min: reserve, initial: reserve, max: company.cash - cost });
    await submitBid(form, String(reserve));
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'moveFactory', companyId: company.id, productId: product.id, hexId, bid: reserve });
  });

  it('restores the reserve default after a successful launch and cancellation on the same selected cell', async () => {
    const { game, view, company } = fixture(lang);
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    setup(view, lang, { 1: 'First' });
    const first = amount(HexLaunchForm({ company, hexId }));
    vi.mocked(sendAction).mockImplementationOnce(async (action) => applyAction(game, 'human', action));
    await submitBid(first, String(reserve));
    const generation = hooks.updates.find((update) => update.index === 3)!.value;
    expect(generation).toBe(1);
    const pending = getPlayerView(game, 'human').self!.hexBids!.find((bid) => bid.kind === 'launch')!;
    expect(applyAction(game, 'human', { type: 'cancelHexBid', companyId: company.id, projectId: pending.project!.id }).ok).toBe(true);
    const refreshed = getPlayerView(game, 'human');
    const refreshedCompany = refreshed.companies.find((c) => c.id === company.id)!;
    setup(refreshed, lang, { 1: 'Second', 3: generation });
    const second = amount(HexLaunchForm({ company: refreshedCompany, hexId }));
    expect(second.key).not.toBe(first.key);
    hooks.cursor = 0;
    hooks.overrides = {};
    const remounted = AmountForm(second.props);
    expect(find(remounted, (el) => el.type === 'input')!.props.value).toBe(String(reserve));
    expect(find(remounted, (el) => el.type === 'button' && el.props.type === 'submit')!.props.disabled).toBe(false);
  });

  it('includes the fallback for incubator products, with zero move cost', async () => {
    const { view, company } = fixture(lang);
    const product = company.products[0];
    product.incubator = true;
    delete product.hexId;
    product.private!.hexes!.moveCost = 999;
    const hexId = view.hexes!.free[0];
    setup(view, lang, { 0: 'abandon' });
    const form = amount(HexMoveForm({ company, product, hexId }));
    expect(form.props.max).toBe(company.cash);
    await submitBid(form, String(view.hexes!.reserve[hexId]));
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'moveFactory', companyId: company.id, productId: product.id, hexId, bid: view.hexes!.reserve[hexId], fallback: 'abandon' });
  });

  it('founds a startup with the exact hex payload and caps the bid at investment plus subsidy', async () => {
    const { view } = fixture(lang);
    for (const company of view.companies) if (company.controllerId === view.you) company.controllerId = null;
    const me = view.players.find((p) => p.id === view.you)!;
    me.cash = 9000;
    const hexId = view.hexes!.free[0];
    setup(view, lang, { 0: '  Young Holding  ', 1: 'crypto', 2: '3000', 3: hexId, 4: 'nearest' });
    const form = amount(HexStartupModal({ onClose: vi.fn() }));
    expect(form.props.max).toBe(3000 + view.self!.startupSubsidy!);
    await submitBid(form, String(view.hexes!.reserve[hexId]));
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'foundStartup', name: 'Young Holding', sectorId: 'crypto', investment: 3000, hexId, bid: view.hexes!.reserve[hexId], fallback: 'nearest' });
  });

  it('withdraws pending product and launch bids using their correct identifiers', async () => {
    const { game, company: original } = fixture(lang);
    const first = getPlayerView(game, 'human');
    const moveHex = first.hexes!.free[0];
    const launchHex = first.hexes!.free[1];
    const productId = original.products[0].id;
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: original.id, productId, hexId: moveHex, bid: first.hexes!.reserve[moveHex] }).ok).toBe(true);
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: original.id, name: 'Awaiting', sectorId: 'crypto', hexId: launchHex, bid: first.hexes!.reserve[launchHex], fallback: 'nearest' }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    const company = view.companies.find((c) => c.id === original.id)!;
    setup(view, lang);
    const move = HexMoveForm({ company, product: company.products[0] });
    const cancelMove = find(move, (el) => el.type === 'button' && el.props.children === messages(lang).hex.formWithdraw)!;
    await (cancelMove.props.onClick as () => void)();
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'cancelHexBid', companyId: company.id, productId });
    const projects = HexPendingProjects({ company });
    const cancelProject = find(projects, (el) => el.type === 'button')!;
    await (cancelProject.props.onClick as () => void)();
    expect(sendAction).toHaveBeenLastCalledWith({ type: 'cancelHexBid', companyId: company.id, projectId: company.private!.launchProjects![0].id });
  });

  it('counts launch projects as slots and leaves their cancel panel visible when full', () => {
    const { view, company } = fixture(lang);
    company.private!.launchProjects = Array.from({ length: 3 }, (_, i) => ({ id: `project-${i}`, name: `Project ${i}`, sectorId: 'crypto' as const }));
    setup(view, lang, { 1: 'Next' });
    const form = HexLaunchForm({ company });
    expect(amount(form).props.disabledReason).toContain(messages(lang).launch.full(maxProductsOf(company)));
    expect(find(form, (el) => el.type === HexPendingProjects)).toBeDefined();
  });

  it('shows the engine grid and accessible bid amount with room currency, including partial estimate views', () => {
    const { view, company } = fixture(lang);
    const hexId = view.hexes!.free[0];
    delete view.sectors.find((s) => s.id === SECTOR_IDS[0])!.launchByHex![hexId];
    setup(view, lang);
    const html = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId }));
    // Autonome dans le panneau latéral : pas la grille du sélecteur à deux colonnes.
    expect(html).not.toContain('hx-bid-picker');
    expect(html).toContain(`aria-label="${messages(lang).hex.formBid}"`);
    expect(html).toContain(`value="${view.hexes!.reserve[hexId]}"`);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    if (lang === 'en') expect(html).not.toMatch(/[àâçéèêëîïôûùœ«»€]/i);
  });

  it('keeps missing candidate estimates safe with neutral values under the normal numeric labels', () => {
    const { view, company } = fixture(lang);
    const hexId = view.hexes!.free[0];
    delete view.sectors.find((s) => s.id === SECTOR_IDS[0])!.launchByHex![hexId];
    setup(view, lang);
    expect(initialBidHex(view, { kind: 'launch', sectorId: SECTOR_IDS[0] }, hexId)).toBe(hexId);
    const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
    // Monté seul sous la fiche de la case (qui chiffre déjà la case) : le résumé ne garde que sa marge, neutre, sans
    // les lignes de la carte (coût par lot, demande).
    const h = messages(lang).hex;
    const standalone = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId }));
    expect(standalone).toContain(`<dt>${escaped(h.marginLabel)}</dt><dd>—</dd>`);
    expect(standalone).not.toContain(`<dt>${escaped(h.unitCostLabel)}</dt>`);
    expect(standalone).not.toContain(`<dt>${escaped(h.demandLabel)}</dt>`);
    expect(standalone).not.toContain('NaN');
    expect(standalone).not.toContain('Infinity');
    // Dans la fenêtre de start-up (plateau, pas de fiche de case au-dessus) : valeurs neutres sous les libellés,
    // les mêmes que ceux de la fiche de case.
    setup(view, lang, { 1: SECTOR_IDS[0], 3: hexId });
    const startup = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
    expect(startup).toContain(`<dt>${escaped(h.marginLabel)}</dt><dd>—</dd>`);
    expect(startup).toContain(`<dt>${escaped(h.unitCostLabel)}</dt><dd>—</dd>`);
    expect(startup).toContain(`<dt>${escaped(h.demandLabel)}</dt><dd>—</dd>`);
    expect(startup).not.toContain('NaN');
    expect(startup).not.toContain('Infinity');
  });

  it('uses only land price for actual start-up payback and omits relocation fees', () => {
    const { game } = fixture(lang);
    for (let turn = 0; turn < 3; turn++) resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const sector = view.sectors.find((candidate) => Object.values(candidate.launchByHex ?? {}).some((estimate) => estimate.quarterlyProfit > 0))!;
    expect(sector).toBeDefined();
    const [hexId, estimate] = Object.entries(sector.launchByHex!).filter(([id, candidate]) => view.hexes!.free.includes(id) && candidate.quarterlyProfit > 0).sort(([, a], [, b]) => b.quarterlyProfit - a.quarterlyProfit)[0];
    const expected = Math.ceil(view.hexes!.reserve[hexId] / estimate.quarterlyProfit);
    expect(expected).not.toBe(estimate.paybackQuarters);
    setup(view, lang, { 1: sector.id, 3: hexId });
    const html = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
    const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
    expect(html).toContain(`<dt>${escaped(messages(lang).hex.formPayback)}</dt><dd>${escaped(messages(lang).hex.formPaybackQuarters(expected))}</dd>`);
    expect(html).not.toContain(`<dt>${escaped(messages(lang).hex.formMoveCost)}</dt>`);
  });

  it('does not grant start-ups a launch waiting quarter in the remaining-time verdict', () => {
    const { view } = fixture(lang);
    view.turn = view.config.totalTurns - 1;
    const sectorId = SECTOR_IDS[0];
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    const estimate = view.sectors.find((sector) => sector.id === sectorId)!.launchByHex![hexId];
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    estimate.quarterlyProfit = reserve / 2;
    setup(view, lang, { 1: sectorId, 3: hexId });
    const late = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
    expect(late).toContain('hx-verdict hx-verdict-late');
    expect(late).toContain(escaped(h.verdictLate(fmt.money(reserve / 2), fmt.money(reserve), 2, 1)));
    estimate.quarterlyProfit = reserve;
    setup(view, lang, { 1: sectorId, 3: hexId });
    const onTime = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
    expect(onTime).toContain('hx-verdict hx-verdict-ok');
    expect(onTime).toContain(escaped(h.verdictOk(fmt.money(reserve), 1, 1)));
    estimate.quarterlyProfit = 0;
    setup(view, lang, { 1: sectorId, 3: hexId });
    const unprofitable = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
    expect(unprofitable).toContain('hx-verdict hx-verdict-none');
    expect(unprofitable).toContain(escaped(h.verdictNone));
    expect(unprofitable).toContain(`<dt>${escaped(h.formPayback)}</dt><dd>—</dd>`);
  });

  it('uses the shared capital-cell estimate for an incubator relocation gain', () => {
    const { view, company } = fixture(lang);
    const product = company.products[0];
    const own = product.private!;
    product.incubator = true;
    delete product.hexId;
    const hexId = view.hexes!.free.find((id) => id !== capitalHexId)!;
    const currentMargin = own.estimate!.margin;
    const reference = { kind: 'product' as const, productId: product.id };
    const margin = hexEstimate(view, reference, hexId)!.margin!;
    expect(Number.isFinite(margin - currentMargin)).toBe(true);
    setup(view, lang);
    const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
    // L'écart chiffre le verdict de la carte complète (fenêtre de start-up : pas de fiche de case au-dessus).
    const summary = renderToStaticMarkup(createElement(HexBidSummary, { view, hexId, reference, delta: true, bid: view.hexes!.reserve[hexId] }));
    const gainRow = `<dt>${escaped(messages(lang).hex.deltaLabel)}</dt><dd>${escaped(fmtFor(lang).signedMoney(margin - currentMargin))}</dd>`;
    expect(summary).toContain(gainRow);
    // Monté seul, le formulaire donne le même gain une seule fois, sous le même libellé, dans son résumé.
    const standalone = renderToStaticMarkup(createElement(HexMoveForm, { company, product, hexId }));
    expect(standalone.split(gainRow)).toHaveLength(2);
  });

  it('allows another controlled company to bid on a cell after the original bidder sells control', async () => {
    const { game, company: original } = fixture(lang);
    game.players.human.cash = 1e8;
    const acquired = Object.values(game.companies).find((company) => company.controllerId === null && company.status === 'active')!;
    expect(applyAction(game, 'human', { type: 'buyShares', companyId: acquired.id, shares: Math.floor(acquired.sharesOutstanding / 2) + 1 }).ok).toBe(true);
    acquired.cash = 100_000;
    const before = getPlayerView(game, 'human');
    const hexId = before.hexes!.free[0];
    const bid = before.hexes!.reserve[hexId];
    expect(applyAction(game, 'human', { type: 'moveFactory', companyId: original.id, productId: original.products[0].id, hexId, bid }).ok).toBe(true);
    const projectHex = before.hexes!.free[1];
    expect(applyAction(game, 'human', { type: 'launchProduct', companyId: original.id, sectorId: 'crypto', name: 'Old project', hexId: projectHex, bid: before.hexes!.reserve[projectHex], fallback: 'nearest' }).ok).toBe(true);
    const controlled = getPlayerView(game, 'human');
    const controlledAcquired = controlled.companies.find((company) => company.id === acquired.id)!;
    const staleOriginal = controlled.companies.find((company) => company.id === original.id)!;
    setup(controlled, lang, { 1: 'Before sale' });
    expect(amount(HexLaunchForm({ company: controlledAcquired, hexId })).props.disabledReason).toBe(messages(lang).hex.formDuplicate);
    expect(applyAction(game, 'human', { type: 'sellShares', companyId: original.id, shares: game.companies[original.id].holdings.human }).ok).toBe(true);
    const view = getPlayerView(game, 'human');
    expect(view.companies.find((company) => company.id === original.id)!.controllerId).not.toBe('human');
    const oldBid = view.self!.hexBids!.find((pending) => pending.companyId === original.id && pending.hexId === hexId)!;
    expect(oldBid).toBeDefined();
    expect(oldBid.result).toBeUndefined();
    const company = view.companies.find((candidate) => candidate.id === acquired.id)!;
    setup(view, lang, { 1: 'After sale' });
    const form = amount(HexLaunchForm({ company, hexId }));
    expect(form.props.disabledReason).toBeNull();
    expect(HexPendingProjects({ company: staleOriginal })).toBeNull();
    vi.mocked(sendAction).mockImplementationOnce(async (action) => applyAction(game, 'human', action));
    await submitBid(form, String(bid));
    expect(sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'launchProduct', companyId: acquired.id, sectorId: SECTOR_IDS[0], name: 'After sale', hexId, bid, fallback: 'nearest' });
    expect(game.hexBids).toContainEqual(expect.objectContaining({ companyId: acquired.id, hexId }));
  });

  it('keeps one decimal in costs per lot and flags a launch that cannot pay back in time', () => {
    const { view, company } = fixture(lang);
    view.turn = view.config.totalTurns - 1;
    const sector = view.sectors.find((s) => s.id === SECTOR_IDS[0])!;
    const estimates = sector.launchByHex!;
    const hexId = Object.keys(estimates)[0];
    const reserve = view.hexes!.reserve[hexId];
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const quartersLeft = view.config.totalTurns - view.turn + 1;
    estimates[hexId] = { ...estimates[hexId], unitCost: 59.54, quarterlyProfit: (sector.launchCost + reserve) / 5 };
    const lateQuarters = 1 + Math.max(1, Math.ceil((sector.launchCost + reserve) / estimates[hexId].quarterlyProfit));
    expect(lateQuarters).toBeGreaterThan(quartersLeft);
    const reference = { kind: 'launch' as const, sectorId: sector.id };
    setup(view, lang);
    // Le coût par lot chiffre la carte complète (une décimale) ; le formulaire autonome ne le répète pas.
    const summary = renderToStaticMarkup(createElement(HexBidSummary, { view, hexId, reference, bid: reserve }));
    expect(summary).toContain(`<dt>${escaped(h.unitCostLabel)}</dt><dd>${escaped(fmt.lotPrice(59.54))}</dd>`);
    setup(view, lang);
    const html = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId }));
    expect(html).not.toContain(`<dt>${escaped(h.unitCostLabel)}</dt>`);
    expect(html).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackQuarters(lateQuarters))}</dd>`);
    expect(html).toContain(escaped(decisionText(lang).latePayback));
    expect(html).toContain(`<dt>${escaped(decisionText(lang).maximum)}</dt><dd>${escaped(fmt.money(sector.launchCost + reserve))}</dd>`);
    estimates[hexId].quarterlyProfit = sector.launchCost + reserve;
    setup(view, lang);
    const onTime = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId }));
    expect(onTime).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackQuarters(2))}</dd>`);
    expect(onTime).not.toContain(escaped(decisionText(lang).latePayback));
  });

  it('shows the financial summary first in move and launch forms, retaining the verdict above the start-up picker', () => {
    const { view, company } = fixture(lang);
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const sector = view.sectors.find((s) => s.id === SECTOR_IDS[0])!;
    const launchHex = view.hexes!.free[0];
    const launchReserve = view.hexes!.reserve[launchHex];
    sector.launchByHex![launchHex].quarterlyProfit = sector.launchCost + launchReserve;
    setup(view, lang);
    // Le résumé autonome précède secteur/repli, avec le gain et le remboursement affichés une seule fois.
    const launch = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId: launchHex }));
    expect(launch).toContain('decision-summary');
    // Le choix du secteur vient d'abord (il fixe les chiffres), puis le résumé, avant tout le reste.
    expect(launch.indexOf('seg wrap')).toBeLessThan(launch.indexOf('decision-summary'));
    expect(launch.indexOf('decision-summary')).toBeLessThan(launch.indexOf('hx-fallback'));
    expect(launch).not.toContain('hx-board');
    expect(launch).not.toContain('hx-bid-picker');
    // Signed like the sheet’s headline and the sector buttons.
    expect(launch).toContain(`<dt>${escaped(h.marginLabel)}</dt><dd>${escaped(fmt.signedMoney(sector.launchCost + launchReserve))}</dd>`);
    expect(launch).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackQuarters(2))}</dd>`);
    // Fenêtre de start-up : toujours le sélecteur sur le plateau, verdict au-dessus du plateau.
    const startupHex = view.hexes!.free[1];
    const startupReserve = view.hexes!.reserve[startupHex];
    sector.launchByHex![startupHex].quarterlyProfit = startupReserve;
    setup(view, lang, { 1: sector.id, 3: startupHex });
    const startup = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
    expect(startup).toContain('hx-verdict hx-verdict-ok');
    expect(startup.indexOf('hx-verdict')).toBeLessThan(startup.indexOf('hx-board'));
    expect(startup.indexOf('hx-board')).toBeLessThan(startup.indexOf('hx-bid-sheet'));
    expect(startup).toContain('hx-bid-picker');
    expect(startup).toContain(escaped(h.verdictOk(fmt.money(startupReserve), 1, view.config.totalTurns - view.turn)));
    const product = company.products[0];
    const moveHex = view.hexes!.free[0];
    const moveReserve = view.hexes!.reserve[moveHex];
    const moveCost = product.private!.hexes!.moveCost;
    const moveReference = { kind: 'product' as const, productId: product.id };
    const cellMargin = hexEstimate(view, moveReference, moveHex)!.margin!;
    product.private!.estimate!.margin = cellMargin - (moveCost + moveReserve) / 4.2;
    const gain = hexMarginValue(view, moveReference, moveHex, true)!;
    expect(gain).toBeGreaterThan(0);
    const moveQuarters = Math.ceil((moveCost + moveReserve) / gain);
    expect(moveQuarters).toBeLessThanOrEqual(view.config.totalTurns - view.turn);
    setup(view, lang);
    const move = renderToStaticMarkup(createElement(HexMoveForm, { company, product, hexId: moveHex }));
    expect(move).toContain('decision-summary');
    expect(move.indexOf('decision-summary')).toBeLessThan(move.indexOf(escaped(h.formMoveHelp)));
    // The move rule waits in the closed « Comment se règle l'enchère ? ».
    expect(move.indexOf(`<details class="hx-bid-rules"><summary>${escaped(h.formRulesTitle)}</summary>`)).toBeLessThan(move.indexOf(escaped(h.formMoveHelp)));
    expect(move).not.toContain('hx-board');
    expect(move).not.toContain('hx-bid-picker');
    expect(move).toContain(`<dt>${escaped(h.deltaLabel)}</dt><dd>${escaped(fmt.signedMoney(gain))}</dd>`);
    expect(move).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackQuarters(moveQuarters))}</dd>`);
  });

  it('shows a payback range once the bid beats the reserve', () => {
    const h = messages(lang).hex;
    {
      const { view } = fixture(lang);
      const sectorId = SECTOR_IDS[0];
      const sector = view.sectors.find((s) => s.id === sectorId)!;
      const hexId = view.hexes!.free[0];
      const reserve = view.hexes!.reserve[hexId];
      const estimate = sector.launchByHex![hexId];
      expect(estimate).toBeDefined();
      estimate.quarterlyProfit = reserve / 2;
      const margin = reserve / 2;
      const bid = reserve * 3;
      setup(view, lang, { 1: sectorId, 3: hexId, 5: { key: hexId, raw: String(bid) } });
      const html = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
      expect(html).toContain(`<dt>${escaped(h.formPayback)}</dt><dd>${escaped(h.formPaybackRange(Math.ceil(reserve / margin), Math.ceil(bid / margin)))}</dd>`);
      setup(view, lang, { 1: sectorId, 3: hexId, 5: { key: hexId, raw: String(reserve) } });
      const atReserve = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
      expect(atReserve).toContain(`<dt>${escaped(h.formPayback)}</dt><dd>${escaped(h.formPaybackQuarters(Math.ceil(reserve / margin)))}</dd>`);
    }
    {
      const { view, company } = fixture(lang);
      const product = company.products[0];
      const reference = { kind: 'product' as const, productId: product.id };
      const moveCost = product.private!.hexes!.moveCost;
      const hexId = view.hexes!.free[0];
      const reserve = view.hexes!.reserve[hexId];
      const cellMargin = hexEstimate(view, reference, hexId)!.margin!;
      product.private!.estimate!.margin = cellMargin - (moveCost + reserve) / 4.2;
      const gain = hexMarginValue(view, reference, hexId, true)!;
      expect(gain).toBeGreaterThan(0);
      const bid = reserve * 3;
      const low = Math.ceil((moveCost + reserve) / gain);
      const high = Math.ceil((moveCost + bid) / gain);
      expect(high).toBeGreaterThan(low);
      setup(view, lang, { 1: { key: hexId, raw: String(bid) } });
      const html = renderToStaticMarkup(createElement(HexMoveForm, { company, product, hexId }));
      expect(html).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackRange(low, high))}</dd>`);
      expect(html).toContain(`<dt>${escaped(decisionText(lang).maximum)}</dt><dd>${escaped(fmtFor(lang).money(moveCost + bid))}</dd>`);
    }
  });

  it('warns about the running effects a move would cut, with the wording matching what still runs', () => {
    const { view, company } = fixture(lang);
    const h = messages(lang).hex;
    const terrain = view.terrains!.find((candidate) => candidate.active && candidate.companyId === company.id)!;
    expect(terrain).toBeDefined();
    const product = company.products.find((candidate) => candidate.hexId === terrain.hex)!;
    expect(product).toBeDefined();
    const originalHex = product.hexId!;
    const hexId = view.hexes!.free[0];
    const hqText = escaped(h.verdictPerksHq(terrain.name));
    const factoryText = escaped(h.verdictPerksFactory(terrain.name));
      const setRunning = (headquarters: boolean, factory: boolean) => {
      view.terrains = view.terrains!.map((candidate) => candidate.hex === terrain.hex ? { ...candidate, runningEffects: { headquarters, factory } } : candidate);
      };
      // Exercise each visible effect combination independently of the fair
      // assignment selected by the current sector economy.
      setRunning(true, true);
    const moveHtml = () => {
      setup(view, lang);
      return renderToStaticMarkup(createElement(HexMoveForm, { company, product, hexId }));
    };
    const headquarters = moveHtml();
    expect(headquarters).toContain('decision-summary');
    expect(headquarters).toContain('decision-losses warn');
    expect(headquarters).toContain(hqText);
    setRunning(false, true);
    const factoryOnly = moveHtml();
    expect(factoryOnly).toContain(factoryText);
    expect(factoryOnly).not.toContain(hqText);
    setRunning(false, false);
    const expired = moveHtml();
    expect(expired).toContain('decision-summary');
    expect(expired).not.toContain(hqText);
    expect(expired).not.toContain(factoryText);
    setRunning(true, true);
    product.hexId = view.hexes!.free.find((id) => !view.terrains!.some((candidate) => candidate.hex === id))!;
    const elsewhere = moveHtml();
    expect(elsewhere).not.toContain(hqText);
    expect(elsewhere).not.toContain(factoryText);
    product.hexId = originalHex;
    product.incubator = true;
    delete product.hexId;
    const incubator = moveHtml();
    expect(incubator).not.toContain(hqText);
    expect(incubator).not.toContain(factoryText);
  });

  it('prints the risky verdict with the reserve payback before the full-bid payback', () => {
    const { view } = fixture(lang);
    for (const company of view.companies) if (company.controllerId === view.you) company.controllerId = null;
    const h = messages(lang).hex;
    const hexId = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexId];
    const sector = view.sectors.find((candidate) => candidate.id === SECTOR_IDS[0])!;
    sector.launchByHex![hexId].quarterlyProfit = reserve / 2;
    const atReserve = Math.ceil(reserve / (reserve / 2));
    const typed = reserve * 9;
    const atBid = Math.ceil(typed / (reserve / 2));
    const quartersLeft = view.config.totalTurns - view.turn;
    expect(atReserve).toBeLessThanOrEqual(quartersLeft);
    expect(atBid).toBeGreaterThan(quartersLeft);
    setup(view, lang, { 3: hexId, 5: { key: hexId, raw: String(typed) } });
    const html = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
    expect(html).toContain('hx-verdict hx-verdict-risky');
    expect(html).toContain(escaped(h.verdictRisky(atReserve, atBid, quartersLeft)));
    expect(html).not.toContain(escaped(h.verdictRisky(atBid, atReserve, quartersLeft)));
  });

  it('keeps the typed launch bid when the sector changes on the same cell, the verdict following the new sector', () => {
    const { view, company } = fixture(lang);
    const h = messages(lang).hex;
    const sectorId = SECTOR_IDS[0];
    const sector = view.sectors.find((candidate) => candidate.id === sectorId)!;
    const hexA = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexA];
    const cost = sector.launchCost;
    sector.launchByHex![hexA].quarterlyProfit = (cost + reserve) / 4;
    const low = 1 + Math.max(1, Math.ceil((cost + reserve) / sector.launchByHex![hexA].quarterlyProfit));
    const typed = reserve * 3;
    const high = 1 + Math.max(1, Math.ceil((cost + typed) / sector.launchByHex![hexA].quarterlyProfit));
    expect(high).toBeGreaterThan(low);
    // La case ne change plus dans le formulaire (la carte le remonte avec sa clé) ; le secteur, si.
    const live = { 4: { key: `${hexA}-${sectorId}-0`, raw: String(typed) } };
    setup(view, lang, live);
    const withBid = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId: hexA }));
    expect(withBid).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackRange(low, high))}</dd>`);
    setup(view, lang, live);
    const other = SECTOR_IDS[1];
    const sectorButton = find(HexLaunchForm({ company, hexId: hexA }), (element) => element.type === 'button' && String(element.key).replace(/^\.\$/, '') === other)!;
    (sectorButton.props.onClick as () => void)();
    // Same cell, same reserve: the draft follows the new sector instead of being dropped, and the bid form keeps
    // its key (no reset to the reserve).
    expect(hooks.updates).toContainEqual({ index: 4, value: { key: `${hexA}-${other}-0`, raw: String(typed) } });
    expect(hooks.updates).toContainEqual({ index: 0, value: other });
    expect(hooks.updates.some((update) => update.index === 3)).toBe(false);
    const otherSector = view.sectors.find((candidate) => candidate.id === other)!;
    otherSector.launchByHex![hexA].quarterlyProfit = (otherSector.launchCost + reserve) / 2;
    const otherLow = 1 + Math.max(1, Math.ceil((otherSector.launchCost + reserve) / otherSector.launchByHex![hexA].quarterlyProfit));
    const otherHigh = 1 + Math.max(1, Math.ceil((otherSector.launchCost + typed) / otherSector.launchByHex![hexA].quarterlyProfit));
    setup(view, lang, { 0: other, 4: { key: `${hexA}-${other}-0`, raw: String(typed) } });
    const kept = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId: hexA }));
    expect(kept).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackRange(otherLow, otherHigh))}</dd>`);
    expect(kept).toContain(`<dt>${escaped(decisionText(lang).maximum)}</dt><dd>${escaped(fmtFor(lang).money(otherSector.launchCost + typed))}</dd>`);
  });

  it('prices every sector on the cell in its button, with the same payback as the summary', () => {
    const { view, company } = fixture(lang);
    const h = messages(lang).hex;
    const fmt = fmtFor(lang);
    const hexA = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexA];
    setup(view, lang);
    const tree = HexLaunchForm({ company, hexId: hexA });
    for (const id of SECTOR_IDS) {
      const sector = view.sectors.find((candidate) => candidate.id === id)!;
      const margin = sector.launchByHex?.[hexA]?.quarterlyProfit ?? null;
      const button = renderToStaticMarkup(find(tree, (element) => element.type === 'button' && String(element.key).replace(/^\.\$/, '') === id)!);
      if (margin === null) continue;
      expect(button).toContain(escaped(fmt.signedMoney(margin)));
      const payback = hexPaybackAtPrice('launch', reserve, margin, sector.launchCost);
      if (payback === null) expect(button).not.toContain(escaped(h.formSectorPayback(1)).slice(1));
      else {
        expect(button).toContain(escaped(h.formSectorPayback(payback)));
        // The active sector's summary says the same at the reserve.
        setup(view, lang, { 0: id });
        const html = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId: hexA }));
        expect(html).toContain(`<dt>${escaped(decisionText(lang).payback)}</dt><dd>${escaped(h.formPaybackQuarters(payback))}</dd>`);
      }
    }
  });

  it('says a late payback in words in the sector buttons, not by colour alone', () => {
    const { view, company } = fixture(lang);
    const h = messages(lang).hex;
    // Last quarter to bid: a launch has two quarters left (the close, then the quarter it opens).
    view.turn = view.config.totalTurns - 1;
    const hexA = view.hexes!.free[0];
    const reserve = view.hexes!.reserve[hexA];
    setup(view, lang);
    const tree = HexLaunchForm({ company, hexId: hexA });
    let late = 0;
    for (const id of SECTOR_IDS) {
      const sector = view.sectors.find((candidate) => candidate.id === id)!;
      const margin = sector.launchByHex?.[hexA]?.quarterlyProfit ?? null;
      const payback = margin === null ? null : hexPaybackAtPrice('launch', reserve, margin, sector.launchCost);
      if (payback === null) continue;
      const button = renderToStaticMarkup(find(tree, (element) => element.type === 'button' && String(element.key).replace(/^\.\$/, '') === id)!);
      if (payback > 2) {
        late++;
        expect(button).toContain(`<span class="down hx-sector-late">${escaped(h.formSectorPaybackLate(payback))}</span>`);
      } else {
        expect(button).toContain(escaped(h.formSectorPayback(payback)));
        expect(button).not.toContain('hx-sector-late');
      }
    }
    expect(late).toBeGreaterThan(0);
    expect(h.formSectorPaybackLate(9)).toBe(lang === 'fr' ? '9 trim., trop tard' : '9 qtr, too late');
  });

  it('drops the ¼ / ½ / max shortcuts on cell bids, keeps the rule in one line and the details in a closed fold', () => {
    const { view, company } = fixture(lang);
    const h = messages(lang).hex;
    const hexId = view.hexes!.free[0];
    setup(view, lang);
    expect(amount(HexLaunchForm({ company, hexId })).props.presets).toEqual([]);
    setup(view, lang);
    expect(amount(HexMoveForm({ company, product: company.products[0], hexId })).props.presets).toEqual([]);
    setup(view, lang);
    const launch = renderToStaticMarkup(createElement(HexLaunchForm, { company, hexId }));
    expect(launch).toContain(`<p class="small muted">${escaped(h.formBidRule)}</p>`);
    expect(launch.indexOf(escaped(h.formBidRule))).toBeLessThan(launch.indexOf('hx-bid-rules'));
    const fold = launch.slice(launch.indexOf('<details class="hx-bid-rules">'));
    expect(fold.startsWith(`<details class="hx-bid-rules"><summary>${escaped(h.formRulesTitle)}</summary>`)).toBe(true);
    for (const text of [h.formAuctionHelp, h.formFallbackHelp, decisionText(lang).launchClose, decisionText(lang).launchBoardOperating]) expect(fold).toContain(escaped(text));
    expect(launch).not.toMatch(/<details[^>]*open/);
    // The fallback's cost is in the radio labels themselves.
    const label = (value: string) => launch.split('<label>').find((part) => part.includes(`value="${value}"`))!.split('</label>')[0];
    expect(label('nearest')).toContain(escaped(h.formNearest));
    expect(label('abandon')).toContain(escaped(h.formAbandon));
    expect(h.formNearest).toMatch(lang === 'fr' ? /mise à prix/ : /reserve/);
  });

  it('drops the typed start-up bid when the cell or sector changes, so the verdict follows the field', () => {
    const { view } = fixture(lang);
    for (const company of view.companies) if (company.controllerId === view.you) company.controllerId = null;
    const h = messages(lang).hex;
    const [hexA, hexB] = view.hexes!.free;
    const reserve = view.hexes!.reserve[hexA];
    const sector = view.sectors.find((candidate) => candidate.id === SECTOR_IDS[0])!;
    sector.launchByHex![hexA].quarterlyProfit = reserve / 2;
    const low = Math.ceil(reserve / (reserve / 2));
    const typed = reserve * 3;
    const high = Math.ceil(typed / (reserve / 2));
    expect(high).toBeGreaterThan(low);
    const live = { 3: hexA, 5: { key: hexA, raw: String(typed) } };
    setup(view, lang, live);
    const withBid = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
    expect(withBid).toContain(`<dt>${escaped(h.formPayback)}</dt><dd>${escaped(h.formPaybackRange(low, high))}</dd>`);
    setup(view, lang, live);
    const picker = find(HexStartupModal({ onClose: vi.fn() }), (element) => typeof element.props.onSelect === 'function')!;
    (picker.props.onSelect as (id: string) => void)(hexB);
    expect(hooks.updates).toContainEqual({ index: 3, value: hexB });
    expect(hooks.updates).toContainEqual({ index: 5, value: null });
    setup(view, lang, live);
    const sectorButton = find(HexStartupModal({ onClose: vi.fn() }), (element) => element.type === 'button' && String(element.props.className).includes('seg-btn') && !String(element.props.className).includes('active'))!;
    (sectorButton.props.onClick as () => void)();
    expect(hooks.updates).toContainEqual({ index: 5, value: null });
    setup(view, lang, { 3: hexA, 5: null });
    const back = renderToStaticMarkup(createElement(HexStartupModal, { onClose: vi.fn() }));
    expect(back).toContain(`<dt>${escaped(h.formPayback)}</dt><dd>${escaped(h.formPaybackQuarters(low))}</dd>`);
    expect(back).not.toContain(escaped(h.formPaybackRange(low, high)));
  });
});
