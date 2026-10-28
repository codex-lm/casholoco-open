/**
 * Barre du jeu : le score avec le rang (vers le Classement), la dette perso seulement quand il y en a une, une seule
 * puce d'alerte (faillite ou manque prévus > participation d'un rival > scandale), et « Je suis prêt » qui avertit
 * d'une faillite prévue. Harnais : React remplacé par un registre d'états, la barre appelée à la main et ses boutons
 * cliqués directement (les sous-composants restent des éléments non rendus).
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, resolveTurn, type CompanyView, type Lang, type PlayerView } from '@muchomoney/core';
import { readyWhenSaved, setReady } from '../src/api';
import { ConfirmModal } from '../src/components/Modal';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { quarterCloseMessages } from '../src/i18n/quarterClose';
import { navigationDetailsMessages } from '../src/i18n/navigationDetails';
import { scandalRisk } from '../src/rules';
import { TopBar } from '../src/screens/game/TopBar';
import { alertDestination, bankruptAtClose, followAlert, nextStockFocus, topBarAlerts } from '../src/screens/game/topBarAlerts';
import { threatSign, threatSigns } from '../src/screens/game/city/model';
import { getState, setState, type AppState } from '../src/store';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const slot = (initial: () => unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial();
    return index;
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = slot(() => (typeof initial === 'function' ? (initial as () => unknown)() : initial));
      return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(hooks.values[index]) : value; }];
    },
    useRef: (initial: unknown) => hooks.values[slot(() => ({ current: initial }))],
    useEffect: () => {},
    useLayoutEffect: () => {},
  };
});
vi.mock('../src/hooks/useGame', () => ({
  useGame: () => {
    const view = data.view!;
    return {
      view,
      me: view.players.find((p) => p.id === view.you) ?? { ...view.players[0], id: view.you, cash: 0, debt: 0, portfolioValue: 0, netWorth: 0, ready: false },
      myCompanies: view.companies.filter((c) => c.controllerId === view.you && c.status === 'active'),
    };
  },
}));
vi.mock('../src/api', () => ({ readyWhenSaved: vi.fn(async () => true), setReady: vi.fn() }));
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  vi.mocked(readyWhenSaved).mockClear();
  vi.mocked(setReady).mockClear();
});
afterEach(() => {
  setState(initial);
  data.view = null;
});

function elements(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [...(predicate(node) ? [node] : []), ...elements(node.props.children as ReactNode, predicate)];
}
/** Visible text of an element tree (strings and numbers only). */
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (!isValidElement<Record<string, unknown>>(node)) return '';
  return text(node.props.children as ReactNode);
}
const byClass = (node: ReactNode, className: string) => elements(node, (element) => typeof element.props.className === 'string' && element.props.className.split(' ').includes(className));

function fixture(lang: Lang) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: '#654321' },
  ]);
  const view = getPlayerView(game, 'human');
  const own = view.companies.find((c) => c.controllerId === 'human')!;
  // Calm by default: no shortfall, no stake, no scandal.
  own.private!.closePlan = { ...own.private!.closePlan!, bankrupt: false, shortfall: 0, bids: 0, safeShortfall: 0 };
  own.private!.scandal = 0;
  for (const id of Object.keys(own.holdings)) if (id !== 'human') delete own.holdings[id];
  return { view, own };
}

function bar(view: PlayerView, lang: Lang, props: Partial<Parameters<typeof TopBar>[0]> = {}) {
  data.view = view;
  setState({ lang, view, lobby: null });
  hooks.cursor = 0;
  const goTo = vi.fn();
  const openAlert = vi.fn();
  return { node: TopBar({ goTo, openMapFor: vi.fn(), openAlert, ...props }), goTo, openAlert };
}

describe.each(['fr', 'en'] as const)('top bar (%s)', (lang) => {
  const t = messages(lang);
  const fmt = fmtFor(lang);

  it('reopens the closed-quarter report with its localized quarter label, absent at T1 and for spectators', () => {
    const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang }, [
      { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
    ]);
    const reopen = vi.fn();
    let view = getPlayerView(game, 'human');
    let node = bar(view, lang, { onOpenQuarterClose: reopen }).node;
    expect(elements(node, (element) => 'data-reopen-quarter-close' in element.props)).toHaveLength(0);
    resolveTurn(game);
    view = getPlayerView(game, 'human');
    node = bar(view, lang, { onOpenQuarterClose: reopen }).node;
    const [button] = elements(node, (element) => 'data-reopen-quarter-close' in element.props);
    expect(text(button)).toBe(quarterCloseMessages(lang).button(1));
    expect(text(button)).toBe(lang === 'fr' ? 'Bilan T1' : 'Q1 report');
    (button.props.onClick as () => void)();
    expect(reopen).toHaveBeenCalledOnce();
    const spectator = { ...view, you: 'spectator', self: undefined };
    node = bar(spectator, lang, { onOpenQuarterClose: reopen }).node;
    expect(elements(node, (element) => 'data-reopen-quarter-close' in element.props)).toHaveLength(0);
  });

  it('the score carries the rank (ordinals of each language) and opens the leaderboard', () => {
    const { view } = fixture(lang);
    const [me, other] = [view.players.find((p) => p.id === 'human')!, view.players.find((p) => p.id === 'rival')!];
    me.netWorth = 21_500;
    other.netWorth = 30_000;
    let { node, goTo } = bar(view, lang);
    let [score] = byClass(node, 'topbar-score');
    expect(text(score)).toBe(`${fmt.money(21_500)} · ${t.topbar.rank(t.ordinal(2), 2)}`);
    expect(text(score)).toContain(lang === 'fr' ? '2e/2' : '2nd/2');
    expect(score.props['aria-label']).toBe(t.topbar.scoreAria(fmt.money(21_500), t.ordinal(2), 2));
    (score.props.onClick as () => void)();
    expect(goTo).toHaveBeenCalledExactlyOnceWith('ranking');
    me.netWorth = 40_000;
    ({ node } = bar(view, lang));
    [score] = byClass(node, 'topbar-score');
    expect(text(score)).toContain(lang === 'fr' ? '1er/2' : '1st/2');
    // A spectator has a score of nothing: no rank, no button.
    view.you = 'spectator';
    ({ node, goTo } = bar(view, lang));
    expect(byClass(node, 'topbar-score')).toHaveLength(0);
  });

  it('shows « Dette perso » only with a debt', () => {
    const { view } = fixture(lang);
    let { node } = bar(view, lang);
    expect(byClass(node, 'topbar-debt')).toHaveLength(0);
    view.players.find((p) => p.id === 'human')!.debt = 400;
    ({ node } = bar(view, lang));
    expect(text(byClass(node, 'topbar-debt')[0])).toContain(t.topbar.debt);
  });

  it('keeps the priority alert direct and exposes every additional alert in an actionable list', () => {
    const { view, own } = fixture(lang);
    expect(byClass(bar(view, lang).node, 'topbar-alert')).toHaveLength(0);
    // Everything at once.
    own.private!.closePlan = { ...own.private!.closePlan!, bankrupt: true };
    own.holdings.rival = own.sharesOutstanding * 0.32;
    own.private!.scandal = 47;
    let { node, openAlert } = bar(view, lang);
    let [chip] = byClass(node, 'topbar-alert');
    // The chip is short, the company named last (the part an ellipsis may cut); the tooltip says it in full.
    const stake = t.topbar.alertStake('Bob', fmt.pct(0.32, 0), own.name);
    const stakeLine = t.topbar.alertStakeLine('Bob', fmt.pct(0.32, 0), own.name);
    expect(stake.endsWith(own.name)).toBe(true);
    const scandalLine = t.topbar.alertScandalLine(own.name, 47, fmt.pct(scandalRisk(47), 0));
    expect(text(byClass(chip, 'topbar-alert-text')[0])).toBe(t.topbar.alertBankrupt(own.name));
    const [more] = byClass(node, 'topbar-alert-count');
    expect(text(more)).toBe(t.topbar.alertMore(2));
    expect(more.props['aria-label']).toBe(navigationDetailsMessages(lang).allAlerts(3));
    expect(chip.props.title).toBe(t.topbar.alertBankrupt(own.name));
    expect(chip.props.className).toContain('danger');
    (chip.props.onClick as () => void)();
    expect(openAlert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'bankrupt', company: own }));
    (more.props.onClick as () => void)();
    ({ node, openAlert } = bar(view, lang));
    const actions = byClass(node, 'company-alert-action');
    expect(actions).toHaveLength(3);
    expect(text(actions[1])).toContain(stakeLine);
    expect(text(actions[2])).toContain(scandalLine);
    (actions[2].props.onClick as () => void)();
    expect(openAlert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'scandal', company: own }));
    expect(byClass(bar(view, lang).node, 'company-alert-list')).toHaveLength(0);
    // Shortfall next.
    own.private!.closePlan = { ...own.private!.closePlan!, bankrupt: false, shortfall: 1200 };
    [chip] = byClass(bar(view, lang).node, 'topbar-alert');
    expect(text(byClass(chip, 'topbar-alert-text')[0])).toBe(t.topbar.alertShort(own.name, fmt.money(1200)));
    expect(t.topbar.alertShort(own.name, fmt.money(1200)).endsWith(own.name)).toBe(true);
    // Then the stake, then the scandal (its chip without the company, its tooltip line with it).
    own.private!.closePlan = { ...own.private!.closePlan!, shortfall: 0 };
    ({ node, openAlert } = bar(view, lang));
    [chip] = byClass(node, 'topbar-alert');
    expect(text(byClass(chip, 'topbar-alert-text')[0])).toBe(stake);
    expect(chip.props['aria-label']).toBe(stakeLine);
    expect(chip.props.className).not.toContain('danger');
    (chip.props.onClick as () => void)();
    expect(openAlert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'stake', company: own, pct: 0.32 }));
    delete own.holdings.rival;
    [chip] = byClass(bar(view, lang).node, 'topbar-alert');
    expect(text(byClass(chip, 'topbar-alert-text')[0])).toBe(t.topbar.alertScandal(47, fmt.pct(scandalRisk(47), 0)));
    expect(byClass(chip, 'topbar-alert-more')).toHaveLength(0);
    expect(chip.props.title).toBe(scandalLine);
    // Below « moyen » (30), or a mere tight bid plan: nothing.
    own.private!.scandal = 29;
    own.private!.closePlan = { ...own.private!.closePlan!, bids: 100, safeShortfall: 50 };
    expect(byClass(bar(view, lang).node, 'topbar-alert')).toHaveLength(0);
  });

  it('« Je suis prêt » warns first when a close plan predicts bankruptcy: Voir, ready anyway, or cancel', async () => {
    const { view, own } = fixture(lang);
    let { node, openAlert } = bar(view, lang);
    const ready = () => elements(node, (element) => element.type === 'button' && element.props['aria-pressed'] !== undefined)[0];
    (ready().props.onClick as () => void)();
    expect(readyWhenSaved).toHaveBeenCalledExactlyOnceWith(view.turn);
    await Promise.resolve();
    vi.mocked(readyWhenSaved).mockClear();
    hooks.values = [];
    own.private!.closePlan = { ...own.private!.closePlan!, bankrupt: true };
    ({ node, openAlert } = bar(view, lang));
    expect(elements(node, (element) => element.type === ConfirmModal)).toHaveLength(0);
    (ready().props.onClick as () => void)();
    expect(readyWhenSaved).not.toHaveBeenCalled();
    ({ node } = bar(view, lang, { openAlert }));
    const [modal] = elements(node, (element) => element.type === ConfirmModal);
    expect(modal.props.title).toBe(t.topbar.readyBankruptTitle);
    expect(text(modal.props.message as ReactNode)).toBe(lang === 'fr'
      ? `${own.name} fera faillite à la clôture si rien ne change.`
      : `${own.name} will go bankrupt at the close unless something changes.`);
    expect(modal.props.confirmLabel).toBe(t.topbar.readyAnyway);
    const secondary = modal.props.secondary as { label: string; onClick: () => void };
    expect(secondary.label).toBe(t.topbar.readyBankruptView);
    secondary.onClick();
    expect(openAlert).toHaveBeenCalledExactlyOnceWith({ kind: 'bankrupt', company: own });
    (modal.props.onConfirm as () => void)();
    expect(readyWhenSaved).toHaveBeenCalledExactlyOnceWith(view.turn);
    // The save-then-ready wait ends before the next click.
    await new Promise((resolve) => setTimeout(resolve, 0));
    (modal.props.onClose as () => void)();
    ({ node } = bar(view, lang, { openAlert }));
    expect(elements(node, (element) => element.type === ConfirmModal)).toHaveLength(0);
    // Already ready: cancelling never asks.
    view.players.find((p) => p.id === 'human')!.ready = true;
    ({ node } = bar(view, lang, { openAlert }));
    (ready().props.onClick as () => void)();
    expect(setReady).toHaveBeenCalledExactlyOnceWith(false, view.turn);
  });

  it('names every doomed company in the warning', () => {
    const fr = messages('fr').topbar.readyBankrupt;
    const en = messages('en').topbar.readyBankrupt;
    expect(fr(['Alpha', 'Beta', 'Gamma'])).toBe('Alpha, Beta et Gamma feront faillite à la clôture si rien ne change.');
    expect(en(['Alpha', 'Beta'])).toBe('Alpha and Beta will go bankrupt at the close unless something changes.');
    expect(t.topbar.readyBankrupt(['Alpha'])).not.toMatch(/\b(?:tu|ton|ta|tes)\b/);
  });
});

describe('alert model', () => {
  it('lists every threat on my companies, stakes by size first, then scandals by gauge; the classic sign keeps the first', () => {
    const { view, own } = fixture('fr');
    const rival = view.players.find((p) => p.id === 'rival')!;
    const third = { ...rival, id: 'third', name: 'Cy' };
    view.players.push(third);
    own.holdings.rival = own.sharesOutstanding * 0.22;
    own.holdings.third = own.sharesOutstanding * 0.35;
    own.private!.scandal = 55;
    const threats = threatSigns(view);
    expect(threats.map((threat) => threat.kind === 'stake' ? `${threat.holder.id}:${threat.pct.toFixed(2)}` : `scandal:${threat.gauge}`))
      .toEqual(['third:0.35', 'rival:0.22', 'scandal:55']);
    expect(threatSign(view)).toEqual(threats[0]);
    const alerts = topBarAlerts(view, [own]);
    expect(alerts.map((alert) => alert.kind)).toEqual(['stake', 'stake', 'scandal']);
    // Rivals' companies never count, only the ones I run (private view).
    const beta = view.companies.find((c) => c.controllerId === 'rival')!;
    beta.holdings.human = beta.sharesOutstanding * 0.4;
    expect(topBarAlerts(view, [own])).toHaveLength(3);
  });

  it('routes each alert to where it is acted on', () => {
    const company = { id: 'c1' } as CompanyView;
    expect(alertDestination({ kind: 'bankrupt', company })).toEqual({ tab: 'company', companyId: 'c1', reveal: '.close-banner' });
    expect(alertDestination({ kind: 'short', company, shortfall: 5 })).toEqual({ tab: 'company', companyId: 'c1', reveal: '.close-banner' });
    expect(alertDestination({ kind: 'scandal', company, gauge: 47, risk: 0.25 })).toEqual({ tab: 'company', companyId: 'c1', reveal: '.section-shady' });
    expect(alertDestination({ kind: 'stake', company, holder: {} as never, pct: 0.3 })).toEqual({ tab: 'stocks', companyId: 'c1' });
  });

  it('following the chip: a stake opens the Bourse on that company (a new arrival each time), the rest my company on its target', () => {
    const company = { id: 'c1' } as CompanyView;
    const calls: string[] = [];
    const nav = {
      selectCompany: (id: string) => calls.push(`select:${id}`),
      focusStock: (id: string) => calls.push(`stock:${id}`),
      goTo: (tab: string) => calls.push(`tab:${tab}`),
      reveal: (selector: string) => calls.push(`reveal:${selector}`),
    };
    followAlert({ kind: 'stake', company, holder: {} as never, pct: 0.32 }, nav);
    // The Bourse does not change the selected company: the focus names it.
    expect(calls.splice(0)).toEqual(['stock:c1', 'tab:stocks']);
    followAlert({ kind: 'bankrupt', company }, nav);
    expect(calls.splice(0)).toEqual(['select:c1', 'tab:company', 'reveal:.close-banner']);
    followAlert({ kind: 'short', company, shortfall: 5 }, nav);
    expect(calls.splice(0)).toEqual(['select:c1', 'tab:company', 'reveal:.close-banner']);
    followAlert({ kind: 'scandal', company, gauge: 47, risk: 0.25 }, nav);
    expect(calls.splice(0)).toEqual(['select:c1', 'tab:company', 'reveal:.section-shady']);
    // Each request is a new key for the Bourse tab, so a second click on the same chip arrives again.
    const first = nextStockFocus(null, 'c1');
    const second = nextStockFocus(first, 'c1');
    expect(first).toEqual({ companyId: 'c1', seq: 1 });
    expect(second).toEqual({ companyId: 'c1', seq: 2 });
  });

  it('the ready warning lists only companies whose plan predicts bankruptcy', () => {
    const { own } = fixture('en');
    expect(bankruptAtClose([own])).toEqual([]);
    own.private!.closePlan = { ...own.private!.closePlan!, shortfall: 300 };
    expect(bankruptAtClose([own])).toEqual([]);
    own.private!.closePlan = { ...own.private!.closePlan!, bankrupt: true };
    expect(bankruptAtClose([own])).toEqual([own]);
  });
});
