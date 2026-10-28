import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMODITIES, SITE_OPENING_COST_MULT, applyAction, createGame, getPlayerView, type CompanyState, type GameState, type Lang } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { CloseBanner, closeAlert, closeShort } from '../src/screens/game/CloseBanner';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function game(lang: Lang): GameState {
  return createGame(
    { seed: 5, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Acme', sectorId: 'energy_drinks', connected: true, color: '#123456' }],
  );
}

const mine = (s: GameState): CompanyState => Object.values(s.companies).find((x) => x.controllerId === 'human')!;
const planOf = (s: GameState) => getPlayerView(s, 'human').companies.find((c) => c.controllerId === 'human')!.private!.closePlan!;

function render(state: GameState, lang: Lang) {
  const view = getPlayerView(state, 'human');
  const company = view.companies.find((c) => c.controllerId === 'human')!;
  setState({ lang, view, lobby: null });
  const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(CloseBanner, { company }) }));
  return { html, company, plan: company.private!.closePlan! };
}

/** Texte rendu, entités HTML décodées. */
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

/** Mise à prix d'un puits de pétrole, puis une trésorerie qui laisse `left` en fin de trimestre, ventes attendues comprises. */
function oilBid(s: GameState, left: (plan: ReturnType<typeof planOf>) => number): void {
  const c = mine(s);
  const reserve = SITE_OPENING_COST_MULT * COMMODITIES.oil.basePrice;
  c.cash = reserve + 1;
  expect(applyAction(s, 'human', { type: 'bidSite', companyId: c.id, slotId: 'oil-2', amount: reserve }).ok).toBe(true);
  const p = planOf(s);
  c.cash = p.obligations.total + p.bids + p.production.plannedCost + p.marketing.planned - p.sales.planned + left(p);
}

describe('bandeau « trésorerie de la clôture » (§5.7)', () => {
  it.each(['fr', 'en'] as const)('rien ne manque : pas de bandeau, pas de pastille (%s)', (lang) => {
    const { html, company } = render(game(lang), lang);
    expect(html).toBe('');
    expect(closeShort([company])).toBe(false);
  });

  it.each(['fr', 'en'] as const)('une mise que les ventes ne couvrent pas tout à fait : ce qui manque, l’ordre, les deux emprunts (%s)', (lang) => {
    const s = game(lang);
    oilBid(s, () => -1000);
    const { html, company, plan } = render(s, lang);
    const t = messages(lang).closeBanner;
    const fmt = fmtFor(lang);
    expect(closeAlert(plan)).toBe('short');
    expect(plan.shortfall).toBeCloseTo(1000, 6);
    expect(closeShort([company])).toBe(true);
    const shown = text(html);
    expect(shown).toContain(text(t.shortTitle(fmt.money(plan.shortfall))));
    expect(shown).toContain(text(t.order(fmt.money(plan.cash))));
    expect(shown).toContain(text(t.thenWithSales(fmt.money(plan.sales.planned))));
    expect(shown).toContain(text(t.estimate(fmt.money(plan.margin))));
    expect(shown).toContain(t.ifNothing);
    expect(shown).toContain(t.bidsCapped(fmt.money(plan.bidsCovered)));
    // Juste le manque (intérêts compris), pas le prix du puits ; ou avec la marge.
    expect(plan.loan).toBeLessThan(1100);
    expect(shown).toContain(text(t.borrow(fmt.money(plan.loan))));
    expect(shown).toContain(text(t.borrowSafe(fmt.money(plan.safeLoan))));
    expect(shown).toContain(t.borrowCovers(true));
    expect(html).not.toContain('danger');
  });

  it.each(['fr', 'en'] as const)('rien ne manque aux ventes attendues, mais la mise en dépend : mise en garde, emprunt avec marge (%s)', (lang) => {
    const s = game(lang);
    oilBid(s, (p) => p.margin / 2);
    const { html, company, plan } = render(s, lang);
    const t = messages(lang).closeBanner;
    const fmt = fmtFor(lang);
    expect(plan.shortfall).toBe(0);
    expect(closeAlert(plan)).toBe('tight');
    expect(closeShort([company])).toBe(true);
    const shown = text(html);
    expect(shown).toContain(text(t.tightTitle(fmt.money(plan.safeShortfall))));
    expect(shown).toContain(text(t.borrowSafe(fmt.money(plan.safeLoan))));
    expect(shown).not.toContain(text(t.borrow(fmt.money(plan.loan))));
    expect(html).toContain('close-banner soft');
  });

  it.each(['fr', 'en'] as const)('les obligations ne sont pas couvertes : faillite annoncée (%s)', (lang) => {
    const s = game(lang);
    mine(s).cash = 100;
    const { html, plan } = render(s, lang);
    const t = messages(lang).closeBanner;
    expect(plan.bankrupt).toBe(true);
    expect(closeAlert(plan)).toBe('bankrupt');
    const shown = text(html);
    expect(shown).toContain(t.bankruptTitle);
    expect(shown).toContain(t.bankrupt);
    expect(html).toContain('close-banner danger');
  });

  it.each(['fr', 'en'] as const)('les banques ne prêtent plus : pas de bouton, ce qu’il reste à faire (%s)', (lang) => {
    const s = game(lang);
    const c = mine(s);
    // Endettée jusqu'au plafond, et un marketing que les ventes ne paient pas.
    expect(applyAction(s, 'human', { type: 'setProductDecisions', companyId: c.id, productId: c.products[0].id, marketing: 15_000 }).ok).toBe(true);
    c.cash = 3000;
    const loanLimit = getPlayerView(s, 'human').companies.find((x) => x.id === c.id)!.private!.loanLimit;
    expect(applyAction(s, 'human', { type: 'takeLoan', companyId: c.id, amount: loanLimit }).ok).toBe(true);
    // Le prêt a déjà été investi ; il reste juste de quoi payer les obligations.
    c.cash = 3000;
    c.cash = planOf(s).obligations.total + 100;
    const { html, company, plan } = render(s, lang);
    expect(company.private!.loanLimit).toBeLessThan(1);
    expect(plan.shortfall).toBeGreaterThan(0);
    expect(plan.bankrupt).toBe(false);
    expect(html).not.toContain('<button');
    expect(text(html)).toContain(messages(lang).closeBanner.banksDone(false));
  });
});
