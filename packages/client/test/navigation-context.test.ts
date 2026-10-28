/** Real navigation callbacks and controlled views, with persistent hook slots and effect cleanup.
 * Browser QA covers layout/scroll geometry; these tests cover the room-scoped navigation lifecycle. */
import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECTORS, createGame, getPlayerView, resolveTurn, type Lang, type PlayerView } from '@muchomoney/core';
import type { GameData } from '../src/hooks/useGame';
import { Tabs } from '../src/components/Tabs';
import { GameScreen, type TabId } from '../src/screens/GameScreen';
import { JournalTab } from '../src/screens/game/JournalTab';
import { IssueNav } from '../src/screens/game/IssueNav';
import { RankingTab } from '../src/screens/game/RankingTab';
import { StocksTab } from '../src/screens/game/StocksTab';
import { CompanyDetail } from '../src/screens/game/CompanyDetail';
import { StartupModal } from '../src/screens/game/StartupModal';
import { QuarterClose } from '../src/screens/game/QuarterClose';
import { FortuneTimeline } from '../src/screens/game/timeline/FortuneTimeline';
import { QuarterDetail } from '../src/screens/game/timeline/QuarterDetail';
import { getState, setState, type AppState } from '../src/store';

interface EffectSlot { deps?: readonly unknown[]; cleanup?: () => void }
interface Slots {
  cursor: number; values: unknown[]; dirty: boolean;
  effects: Map<number, EffectSlot>;
  pending: Map<number, { effect: () => void | (() => void); deps?: readonly unknown[] }>;
}
const hooks = vi.hoisted(() => ({ active: null as Slots | null }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const effect = (run: () => void | (() => void), deps?: readonly unknown[]) => {
    const slots = hooks.active!, i = slots.cursor++, previous = slots.effects.get(i);
    if (!previous || !deps || !previous.deps || deps.some((value, j) => !Object.is(value, previous.deps![j]))) {
      slots.pending.set(i, { effect: run, deps });
    }
  };
  return { ...actual,
    useState: (initial: unknown) => {
      const slots = hooks.active!, i = slots.cursor++;
      if (!(i in slots.values)) slots.values[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [slots.values[i], (next: unknown) => {
        const value = typeof next === 'function' ? (next as (previous: unknown) => unknown)(slots.values[i]) : next;
        if (!Object.is(value, slots.values[i])) { slots.values[i] = value; slots.dirty = true; }
      }];
    },
    useRef: (initial: unknown) => {
      const slots = hooks.active!, i = slots.cursor++;
      if (!(i in slots.values)) slots.values[i] = { current: initial };
      return slots.values[i];
    },
    useEffect: effect, useLayoutEffect: effect,
    useId: () => `context-${hooks.active!.cursor++}`,
    useMemo: (make: () => unknown) => make(),
  };
});
const data = vi.hoisted(() => ({ current: null as GameData | null }));
vi.mock('../src/hooks/useGame', () => ({ useGame: () => data.current! }));
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(select: (state: AppState) => T): T => select(actual.getState()) };
});

const initial = getState();
const slotsByName = new Map<string, Slots>();
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
let sessionKey: string | null = null;
let previousTab: TabId | null = null;
let stockKey: string | null = null;
const detail = { scrollIntoView: vi.fn(), focus: vi.fn() };
const querySelector = vi.fn((selector: string) => selector.startsWith('[data-stock-detail=') ? detail : null);

function unmount(name: string) {
  const slots = slotsByName.get(name);
  slots?.effects.forEach((slot) => slot.cleanup?.());
  slotsByName.delete(name);
}
function reset() {
  [...slotsByName.keys()].forEach(unmount);
  hooks.active = null; sessionKey = null; previousTab = null; stockKey = null; frames.clear(); frameId = 0;
}
function render<T>(name: string, make: () => T): T {
  let slots = slotsByName.get(name);
  if (!slots) {
    slots = { cursor: 0, values: [], dirty: false, effects: new Map(), pending: new Map() };
    slotsByName.set(name, slots);
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    hooks.active = slots; slots.cursor = 0; slots.dirty = false;
    const result = make();
    for (const [i, next] of slots.pending) {
      slots.effects.get(i)?.cleanup?.();
      const cleanup = next.effect();
      slots.effects.set(i, { deps: next.deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined });
    }
    slots.pending.clear();
    if (!slots.dirty) return result;
  }
  throw new Error('Navigation effects did not settle');
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function props<C extends (props: any) => ReactNode>(node: ReactNode, type: C): ComponentProps<C> {
  const found = elements(node).find((element) => element.type === type);
  expect(found, type.name).toBeDefined();
  return found!.props as ComponentProps<C>;
}
function screen(): ReactNode {
  const wrapper = GameScreen();
  if (wrapper.key !== sessionKey) {
    reset(); sessionKey = wrapper.key;
  }
  const tree = render('session', () => (wrapper.type as (p: typeof wrapper.props) => ReactNode)(wrapper.props));
  const primary = props(tree, Tabs);
  const tab = primary.active as TabId;
  if (previousTab && previousTab !== tab) unmount(previousTab);
  previousTab = tab;
  return tree;
}
function visit(tab: TabId) {
  props(screen(), Tabs).onChange(tab);
  return screen();
}
function journalNav() {
  const tabProps = props(screen(), JournalTab);
  return props(render('journal', () => JournalTab(tabProps)), IssueNav);
}
function timeline() {
  const tabProps = props(screen(), RankingTab);
  const timelineProps = props(RankingTab(tabProps), FortuneTimeline);
  return props(render('ranking', () => FortuneTimeline(timelineProps)), QuarterDetail);
}
function stockView() {
  const tree = screen();
  const element = elements(tree).find((item) => item.type === StocksTab)!;
  if (element.key !== stockKey) { unmount('stocks'); stockKey = element.key; }
  const tabProps = props(tree, StocksTab);
  return render('stocks', () => StocksTab(tabProps));
}
function flushFrames() {
  for (const [id, frame] of frames) { frames.delete(id); frame(0); }
}
function setView(view: PlayerView, lang: Lang = 'fr', room = 'ROOM') {
  const playersById = new Map(view.players.map((p) => [p.id, p]));
  const companiesById = new Map(view.companies.map((c) => [c.id, c]));
  const sectorsById = new Map(view.sectors.map((s) => [s.id, s]));
  data.current = { view, me: playersById.get(view.you)!, playersById, companiesById, sectorsById,
    myCompanies: view.companies.filter((c) => c.controllerId === view.you && c.status === 'active'),
    playerName: (id) => playersById.get(id ?? '')?.name ?? '?',
    refPrice: (id) => sectorsById.get(id)?.refPrice ?? SECTORS[id].refPrice,
  };
  setState({ lang, view, lobby: null, session: { roomCode: room, playerId: view.you, token: 'token' } });
}
function fixture(lang: Lang = 'fr') {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: '#654321' },
  ]);
  resolveTurn(game); resolveTurn(game); resolveTurn(game);
  const view = getPlayerView(game, 'human');
  setView(view, lang);
  return { game, view, rival: view.companies.find((c) => c.controllerId === 'rival')! };
}
beforeEach(() => {
  reset(); detail.focus.mockClear(); detail.scrollIntoView.mockClear(); querySelector.mockClear();
  vi.stubGlobal('window', { scrollY: 0, scrollTo: vi.fn(), setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(),
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  vi.stubGlobal('document', { querySelector });
});
afterEach(() => { reset(); data.current = null; setState(initial); vi.unstubAllGlobals(); });

describe.each(['fr', 'en'] as const)('contexte de consultation (%s)', (lang) => {
  it('retrouve l’archive, son défilement et le trimestre après les allers-retours ; les liens gardent leur cible', () => {
    fixture(lang);
    journalNav().onSelect(2);
    Object.assign(window, { scrollY: 620 });
    visit('company'); visit('journal');
    expect(journalNav().issue.turn).toBe(2);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 620, behavior: 'instant' });
    journalNav().onTimeline!(2);
    expect(timeline().quarter.turn).toBe(2);
    timeline().onSelect(1);
    visit('commodities'); visit('ranking');
    expect(timeline().quarter.turn).toBe(1);
    // A new link replaces the remembered quarter, including a repeated target.
    visit('journal'); journalNav().onTimeline!(2);
    expect(timeline().quarter.turn).toBe(2);
    timeline().openIssue!(3);
    expect(journalNav().issue.turn).toBe(3);
  });

  it('suit les nouvelles publications avec null, garde l’archive et ne la compte pas comme lecture de l’actualité', () => {
    const { game } = fixture(lang);
    expect(journalNav().issue.turn).toBe(4);
    visit('ranking');
    expect(timeline().quarter.turn).toBe(4);
    resolveTurn(game); setView(getPlayerView(game, 'human'), lang);
    expect(timeline().quarter.turn).toBe(5);
    visit('journal'); expect(journalNav().issue.turn).toBe(5);
    journalNav().onSelect(2);
    resolveTurn(game); setView(getPlayerView(game, 'human'), lang);
    expect(journalNav().issue.turn).toBe(2);
    expect(props(screen(), Tabs).tabs.find((tab) => tab.id === 'journal')!.badge).toBe(true);
    visit('company'); visit('journal');
    expect(journalNav().issue.turn).toBe(2);
    expect(props(screen(), Tabs).tabs.find((tab) => tab.id === 'journal')!.badge).toBe(true);
    journalNav().onSelect(6); // Choosing today's issue returns to null/live mode.
    expect(props(screen(), JournalTab).selectedTurn).toBeNull();
    expect(props(screen(), Tabs).tabs.find((tab) => tab.id === 'journal')!.badge).toBe(false);
    resolveTurn(game); setView(getPlayerView(game, 'human'), lang);
    expect(journalNav().issue.turn).toBe(7);
    expect(props(screen(), Tabs).tabs.find((tab) => tab.id === 'journal')!.badge).toBe(false);
  });

  it.each(['selection', 'link'] as const)('reprend le suivi après avoir choisi le trimestre courant (%s)', (source) => {
    const { game } = fixture(lang);
    visit('ranking'); timeline().onSelect(1);
    resolveTurn(game); setView(getPlayerView(game, 'human'), lang);
    expect(timeline().quarter.turn).toBe(1); // A closed quarter stays pinned.
    if (source === 'selection') timeline().onSelect(game.turn); // Current column, End or the next-quarter arrow.
    else { visit('journal'); journalNav().onTimeline!(game.turn); }
    expect(props(screen(), RankingTab).selectedTurn).toBeNull();
    resolveTurn(game); setView(getPlayerView(game, 'human'), lang);
    expect(timeline().quarter.turn).toBe(6);
    visit('commodities'); visit('ranking');
    expect(timeline().quarter.turn).toBe(6);
  });

  it('garde une fiche Bourse sans nouveau focus au retour, puis respecte fermeture et liens répétés', () => {
    const { rival } = fixture(lang);
    props(screen(), JournalTab).openStock!(rival.id);
    expect(props(stockView(), CompanyDetail).company.id).toBe(rival.id);
    flushFrames(); expect(detail.focus).toHaveBeenCalledTimes(1);
    Object.assign(window, { scrollY: 850 });
    visit('commodities'); visit('stocks');
    expect(props(stockView(), CompanyDetail).company.id).toBe(rival.id);
    expect(props(screen(), StocksTab).focusCompanyId).toBeNull();
    flushFrames(); expect(detail.focus).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 850, behavior: 'instant' });
    props(stockView(), CompanyDetail).onClose();
    expect(elements(stockView()).some((element) => element.type === CompanyDetail)).toBe(false);
    visit('commodities'); visit('stocks');
    expect(props(screen(), StocksTab).selectedCompanyId).toBeNull();
    // The close-report route remains available even while Stocks is already mounted.
    props(screen(), QuarterClose).openStock!(rival.id);
    stockView(); flushFrames(); expect(detail.focus).toHaveBeenCalledTimes(2);
    props(stockView(), CompanyDetail).onClose(); stockView();
    props(screen(), QuarterClose).openStock!(rival.id);
    expect(props(stockView(), CompanyDetail).company.id).toBe(rival.id);
    flushFrames(); expect(detail.focus).toHaveBeenCalledTimes(3);
  });
});

it.each(['room', 'player'] as const)('réinitialise toute la consultation quand %s change, même si les ids se ressemblent', (identity) => {
  const { view, rival } = fixture();
  journalNav().onSelect(2);
  journalNav().onTimeline!(1);
  visit('stocks'); props(screen(), StocksTab).onSelectCompany!(rival.id);
  const previousKey = GameScreen().key;
  setView({ ...view, you: identity === 'player' ? 'rival' : view.you }, 'fr', identity === 'room' ? 'NEXT' : 'ROOM');
  expect(GameScreen().key).not.toBe(previousKey);
  expect(journalNav().issue.turn).toBe(view.turn);
  visit('ranking'); expect(timeline().quarter.turn).toBe(view.turn);
  visit('stocks'); expect(props(screen(), StocksTab).selectedCompanyId).toBeNull();
});

it('efface les cibles absentes, sans perdre une entreprise inactive toujours consultable', () => {
  const { view, rival } = fixture();
  journalNav().onSelect(2); journalNav().onTimeline!(3);
  visit('stocks'); props(screen(), StocksTab).onSelectCompany!(rival.id);
  const inactive = { ...view, companies: view.companies.map((c) => c.id === rival.id ? { ...c, status: 'bankrupt' as const } : c) };
  setView(inactive);
  expect(props(stockView(), CompanyDetail).company.status).toBe('bankrupt');
  setView({ ...view, turn: 2, journal: view.journal.filter((issue) => issue.turn !== 2), companies: view.companies.filter((c) => c.id !== rival.id) });
  screen();
  setView(view); // A later snapshot must not silently resurrect the discarded targets.
  expect(props(screen(), StocksTab).selectedCompanyId).toBeNull();
  visit('journal'); expect(journalNav().issue.turn).toBe(view.turn);
  visit('ranking'); expect(timeline().quarter.turn).toBe(view.turn);
});

it('une demande explicite dans la Bourse déjà ouverte ferme la fenêtre locale avant le focus de destination', () => {
  const { view, rival } = fixture();
  setView({ ...view, companies: view.companies.map((company) => ({ ...company, controllerId: 'rival' })) });
  visit('stocks');
  const start = elements(stockView()).find((element) => element.type === 'button' && element.props.className === 'btn primary')!;
  expect(start).toBeDefined();
  (start.props.onClick as () => void)();
  expect(elements(stockView()).some((element) => element.type === StartupModal)).toBe(true);
  props(screen(), QuarterClose).openStock!(rival.id);
  const opened = stockView();
  expect(elements(opened).some((element) => element.type === StartupModal)).toBe(false);
  expect(props(opened, CompanyDetail).company.id).toBe(rival.id);
  flushFrames(); expect(detail.focus).toHaveBeenCalledTimes(1);
});
