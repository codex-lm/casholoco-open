import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getPlayerView, MAX_COMPANY_RATE, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { DealsTab } from '../src/screens/game/DealsTab';
import { CommoditiesTab } from '../src/screens/game/CommoditiesTab';
import { materialGaps } from '../src/screens/game/CompanyMaterials';
import { FinancePanel } from '../src/screens/game/FinancePanel';
import { companyLoanPreview, shareBlockPreview } from '../src/screens/game/economicDecisionModel';
import { uiDecisionCopy } from '../src/screens/game/uiDecisionCopy';
import { getState, setState, type AppState } from '../src/store';
import { sendAction } from '../src/api';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, updates: {} as Record<number, unknown>, buttons: [] as Record<string, unknown>[] }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => {
    const index = hooks.cursor++;
    return [index < hooks.values.length ? hooks.values[index] : typeof initial === 'function' ? (initial as () => unknown)() : initial, (value: unknown) => { hooks.updates[index] = value; }];
  } };
});
// Capture the actual offer button callback, then exercise its async action/refusal path without a browser DOM.
vi.mock('react/jsx-dev-runtime', async (original) => {
  const actual = await original<typeof import('react/jsx-dev-runtime')>();
  return { ...actual, jsxDEV: (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
    if (type === 'button') hooks.buttons.push(props);
    return (actual.jsxDEV as (...args: unknown[]) => unknown)(type, props, ...rest);
  } };
});
vi.mock('react/jsx-runtime', async (original) => {
  const actual = await original<typeof import('react/jsx-runtime')>();
  const wrap = <F extends (...args: never[]) => unknown>(fn: F) => (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
    if (type === 'button') hooks.buttons.push(props);
    return (fn as (...args: unknown[]) => unknown)(type, props, ...rest);
  };
  return { ...actual, jsx: wrap(actual.jsx), jsxs: wrap(actual.jsxs) };
});
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
vi.mock('../src/api', () => ({ sendAction: vi.fn(async () => ({ ok: true, message: '' })) }));
const initial = getState();
afterEach(() => { setState(initial); hooks.values = []; hooks.cursor = 0; vi.mocked(sendAction).mockReset().mockResolvedValue({ ok: true, message: '' }); });
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function fixture(lang: Lang = 'fr') {
  const game = createGame({ seed: 23, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang }, [
    { id: 'ada', name: 'Ada', isBot: false, companyName: 'Atelier Ada', sectorId: 'yogurts', connected: true, color: '#369' },
    { id: 'bob', name: 'Bob', isBot: false, companyName: 'Bob SA', sectorId: 'gadgets', connected: true, color: '#963' },
  ]);
  const ada = Object.values(game.companies).find((c) => c.controllerId === 'ada')!;
  const bob = Object.values(game.companies).find((c) => c.controllerId === 'bob')!;
  return { game, ada, bob };
}

function render(view: PlayerView, lang: Lang, children: ReturnType<typeof createElement>, values: unknown[] = []) {
  hooks.values = values;
  hooks.cursor = 0;
  hooks.updates = {};
  hooks.buttons = [];
  setState({ view, lang, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children }));
}

describe.each(['fr', 'en'] as const)('economic decision UI — %s', (lang) => {
  it.each(['Infinity', '-Infinity', 'NaN', '1e999'])('rejects a non-finite typed price %s in both share and supply offers', (price) => {
    const { game, ada, bob } = fixture(lang);
    const view = getPlayerView(game, 'ada');
    for (const values of [
      ['shares', 'sell', ada.id, 'bob', '1', price, false, null],
      ['contract', ada.id, 'buy', bob.id, 'oil', '2', price, '4', false],
    ]) {
      const html = render(view, lang, createElement(DealsTab), values);
      expect(html).toContain(`<button type="button" class="btn primary" disabled="">${escaped(messages(lang).deals.send)}</button>`);
      expect(html).not.toContain('class="decision-summary"');
    }
  });

  it.each(['holdings', 'price', 'cash'] as const)('keeps an acceptance refusal inline when an offer became stale through %s', async (changed) => {
    const { game, ada } = fixture(lang);
    game.players.bob.cash = 100_000;
    const sent = applyAction(game, 'ada', { type: 'offerShares', companyId: ada.id, counterpartyId: 'bob', shares: 1, price: ada.sharePrice, side: 'sell' });
    expect(sent.ok, sent.message).toBe(true);
    if (changed === 'holdings') ada.holdings.ada = 0;
    if (changed === 'price') ada.sharePrice *= 5;
    if (changed === 'cash') game.players.bob.cash = 0;
    const offer = game.offers!.at(-1)!;
    const cashBefore = game.players.bob.cash;
    const sharesBefore = ada.holdings.bob;
    vi.mocked(sendAction).mockImplementation(async (action) => applyAction(game, 'bob', action));
    const view = getPlayerView(game, 'bob');
    render(view, lang, createElement(DealsTab));
    const accept = hooks.buttons.find((button) => button.children === messages(lang).deals.accept)!;
    (accept.onClick as () => void)();
    await Promise.resolve();
    expect(sendAction).toHaveBeenCalledWith({ type: 'answerOffer', offerId: offer.id, accept: true });
    const failure = hooks.updates[1];
    expect(typeof failure).toBe('string');
    expect(offer.status).toBe('pending');
    expect(game.players.bob.cash).toBe(cashBefore);
    expect(ada.holdings.bob).toBe(sharesBefore);
    const html = render(view, lang, createElement(DealsTab), [false, failure]);
    expect(html).toContain(`<p id="offer-${offer.id}-error" class="small warn" role="status">${escaped(failure as string)}</p>`);
    expect(html).toContain(`aria-describedby="offer-${offer.id}-error"`);
    expect(html).toContain(`>${escaped(messages(lang).deals.decline)}</button>`);
  });

  it('disables a manually typed oversized share sale and explains the available quantity beside the fields', () => {
    const { game, ada } = fixture(lang);
    const view = getPlayerView(game, 'ada');
    const html = render(view, lang, createElement(DealsTab), ['shares', 'sell', ada.id, 'bob', '999999', '', false, null]);
    expect(html).toContain(escaped(uiDecisionCopy(lang).holdings(fmtFor(lang).int(ada.holdings.ada))));
    expect(html).toMatch(/id="deal-share-n"[^>]*aria-invalid="true"[^>]*aria-describedby="deal-share-reason"/);
    expect(html).toContain(`<button type="button" class="btn primary" disabled="">${escaped(messages(lang).deals.send)}</button>`);
    expect(applyAction(game, 'ada', { type: 'offerShares', companyId: ada.id, counterpartyId: 'bob', shares: 999999, price: ada.sharePrice, side: 'sell' }).ok).toBe(false);
  });

  it('uses personal cash for a buy offer, even when the buyer owns a rich company', () => {
    const { game, ada, bob } = fixture(lang);
    game.players.ada.cash = 0;
    ada.cash = 1e6;
    const html = render(getPlayerView(game, 'ada'), lang, createElement(DealsTab), ['shares', 'buy', bob.id, 'bob', '1', '', false, null]);
    expect(html).toContain(escaped(uiDecisionCopy(lang).cash(fmtFor(lang).money(bob.sharePrice), fmtFor(lang).money(0))));
    expect(html).toContain(`<button type="button" class="btn primary" disabled="">${escaped(messages(lang).deals.send)}</button>`);
    expect(applyAction(game, 'ada', { type: 'offerShares', companyId: bob.id, counterpartyId: 'bob', shares: 1, price: bob.sharePrice, side: 'buy' }).ok).toBe(false);
  });

  it('keeps a server refusal beside an unchanged valid draft, and clears it from a revised draft', () => {
    const { game, ada } = fixture(lang);
    const view = getPlayerView(game, 'ada');
    const refusal = { draft: JSON.stringify(['sell', ada.id, 'bob', '1', '']), message: 'The counterparty left.' };
    const state = ['shares', 'sell', ada.id, 'bob', '1', '', false, refusal];
    expect(render(view, lang, createElement(DealsTab), state)).toContain('<p id="deal-share-reason" class="small warn" role="status">The counterparty left.</p>');
    expect(render(view, lang, createElement(DealsTab), state.map((v, i) => i === 4 ? '2' : v))).not.toContain(refusal.message);
  });

  it.each([false, true])('summarizes payer, recipient, timing and commitment before a contract (same group: %s)', (sameGroup) => {
    const { game, ada, bob } = fixture(lang);
    const view = getPlayerView(game, 'ada');
    if (sameGroup) view.companies.find((c) => c.id === bob.id)!.controllerId = 'ada';
    const html = render(view, lang, createElement(DealsTab), ['contract', ada.id, 'buy', bob.id, 'oil', '2', '', '4', false]);
    const copy = uiDecisionCopy(lang);
    const fmt = fmtFor(lang);
    const price = Math.round(view.commodities.find((c) => c.id === 'oil')!.price);
    expect(html).toContain(`<dt>${copy.payer}</dt><dd>${ada.name}</dd>`);
    expect(html).toContain(`<dt>${copy.recipient}</dt><dd>${bob.name}</dd>`);
    expect(html).toContain(`<dt>${copy.perQuarter}</dt><dd>${escaped(fmt.money(2 * price))}</dd>`);
    expect(html).toContain(`<dt>${copy.contractTotal(4)}</dt><dd>${escaped(fmt.money(8 * price))}</dd>`);
    expect(html).toContain(escaped(copy.closeAt(fmt.date(view.turn, view.config.startYear))));
    expect(html).toContain(escaped(sameGroup ? copy.contractImmediate : copy.contractPending));
    expect(html).toContain(`>${escaped(sameGroup ? copy.createContract : messages(lang).deals.send)}</button>`);
  });

  it('offers the same reserved-cash shortage purchases in Materials as in My company', () => {
    const { game, ada } = fixture(lang);
    const view = getPlayerView(game, 'ada');
    const company = view.companies.find((c) => c.id === ada.id)!;
    company.cash = 100_000;
    company.private!.inventory = {};
    company.products[0].private!.production = 60;
    const gaps = materialGaps(company, view.commodities, view.turn, view.self?.contracts);
    expect(gaps.length).toBeGreaterThan(0);
    const html = render(view, lang, createElement(CommoditiesTab, { company, onSelect: vi.fn() }));
    expect(html).toContain(uiDecisionCopy(lang).coverNeeds);
    for (const gap of gaps) {
      const row = html.match(new RegExp(`<li class="material-gap" data-commodity="${gap.commodityId}">([\\s\\S]*?)</li>`))?.[1];
      expect(row).toBeDefined();
      expect(row).toContain(escaped(fmtFor(lang).money(gap.now)));
      expect(row).toContain(escaped(messages(lang).materials.cashAfter(fmtFor(lang).money(gap.cashAfter))));
      expect(row).toContain(`>${escaped(messages(lang).materials.buy(fmtFor(lang).lots(gap.lots)))}</button>`);
    }
  });

  it('shows the loan estimate for the typed amount and labels its assumptions', () => {
    const { game, ada } = fixture(lang);
    const view = getPlayerView(game, 'ada');
    const company = view.companies.find((c) => c.id === ada.id)!;
    const quote = companyLoanPreview(company, view.interestRate, 100)!;
    const html = render(view, lang, createElement(FinancePanel, { company }), [null, '', '100', false]);
    expect(html).toContain(escaped(uiDecisionCopy(lang).loanEstimate));
    expect(html).toContain(`<dt>${uiDecisionCopy(lang).nextInterest}</dt><dd>${escaped(fmtFor(lang).money(quote.interest))}</dd>`);
  });
});

describe('economic previews versus authoritative actions', () => {
  it('does not offer locked or freshly founded shares', () => {
    const { game, ada } = fixture();
    ada.turnFlags.lockedShares = { ada: ada.holdings.ada - 1 };
    let company = getPlayerView(game, 'ada').companies.find((c) => c.id === ada.id)!;
    expect(shareBlockPreview(company, 'ada', 'bob', 'sell', 2, company.sharePrice, 0).issue).toBe('holdings');
    expect(applyAction(game, 'ada', { type: 'offerShares', companyId: ada.id, counterpartyId: 'bob', shares: 2, price: ada.sharePrice, side: 'sell' }).ok).toBe(false);
    ada.turnFlags.justFounded = true;
    company = getPlayerView(game, 'ada').companies.find((c) => c.id === ada.id)!;
    expect(shareBlockPreview(company, 'ada', 'bob', 'sell', 1, company.sharePrice, 0).issue).toBe('founder');
  });

  it.each([0, 5000, 100_000])('matches closing interest after a real loan, including existing debt %s and the rate cap', (debt) => {
    const { game, ada } = fixture();
    ada.cash = 10_000;
    ada.debt = debt;
    ada.revenueEma = 1e6;
    const before = getPlayerView(game, 'ada');
    const company = before.companies.find((c) => c.id === ada.id)!;
    const quote = companyLoanPreview(company, before.interestRate, 1000)!;
    const result = applyAction(game, 'ada', { type: 'takeLoan', companyId: ada.id, amount: 1000 });
    expect(result.ok, result.message).toBe(true);
    const after = getPlayerView(game, 'ada').companies.find((c) => c.id === ada.id)!;
    expect(quote.interest).toBeCloseTo(after.private!.closePlan!.obligations.interest, 8);
    expect(quote.extraInterest).toBeCloseTo(after.private!.closePlan!.obligations.interest - company.private!.closePlan!.obligations.interest, 8);
    if (debt === 100_000) expect(quote.rate).toBe(MAX_COMPANY_RATE);
  });

  it('does not invent a borrowing rate when an older snapshot has no book value', () => {
    const { game, ada } = fixture();
    const view = getPlayerView(game, 'ada');
    const company = view.companies.find((c) => c.id === ada.id)!;
    delete company.valuation;
    expect(companyLoanPreview(company, view.interestRate, 1000)).toBeNull();
  });
});
