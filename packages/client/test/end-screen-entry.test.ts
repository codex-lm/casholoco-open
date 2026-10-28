/** Entry lifecycle only; browser QA verifies real focus and scroll after GameScreen unmounts. */
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, resolveTurn, type Lang } from '@muchomoney/core';
import type { GameData } from '../src/hooks/useGame';
import { EndScreen } from '../src/screens/EndScreen';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { getState, setState, type AppState } from '../src/store';

type Effect = { deps?: readonly unknown[]; cleanup?: () => void };
const hooks = vi.hoisted(() => ({ cursor: 0, refs: [] as unknown[], effects: [] as Effect[],
  pending: [] as (() => void)[] }));
const data = vi.hoisted(() => ({ current: null as Pick<GameData, 'view' | 'playersById'> | null }));
vi.mock('../src/hooks/useGame', () => ({ useGame: () => data.current! }));
vi.mock('../src/api', () => ({ leaveRoom: vi.fn() }));
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(select: (state: AppState) => T): T => select(actual.getState()) };
});
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual,
    useRef: (initial: unknown) => {
      const i = hooks.cursor++;
      return hooks.refs[i] ??= { current: initial };
    },
    useEffect: (run: () => void | (() => void), deps?: readonly unknown[]) => {
      const i = hooks.cursor++, previous = hooks.effects[i];
      if (!previous || !deps || !previous.deps || deps.some((value, j) => !Object.is(value, previous.deps![j]))) {
        hooks.pending.push(() => {
          previous?.cleanup?.();
          const cleanup = run();
          hooks.effects[i] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
        });
      }
    },
  };
});

const initialState = getState();
const title = { focus: vi.fn(() => { Object.assign(document, { activeElement: title }); }) };
function unmount() {
  hooks.effects.forEach((effect) => effect.cleanup?.());
  hooks.cursor = 0; hooks.refs = []; hooks.effects = []; hooks.pending = [];
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function render() {
  hooks.cursor = 0;
  const tree = EndScreen();
  const section = elements(tree).find((element) => element.props.className === 'end-headline')!;
  const heading = elements(section).find((element) => element.type === 'h2')!;
  const ref = heading.props.ref as { current: unknown } | undefined;
  if (ref) ref.current = title;
  hooks.pending.splice(0).forEach((run) => run());
  return heading;
}
function fixture(lang: Lang) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang }, [
    { id: 'me', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Ben', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: '#654321' },
  ]);
  while (game.phase === 'playing') resolveTurn(game);
  const view = getPlayerView(game, 'me');
  data.current = { view, playersById: new Map(view.players.map((player) => [player.id, player])) };
  setState({ lang, view, lobby: null });
  return view;
}
beforeEach(() => {
  unmount(); title.focus.mockClear();
  vi.stubGlobal('document', { activeElement: null });
  vi.stubGlobal('window', { scrollX: 25, scrollY: 698, scrollTo: vi.fn((options: ScrollToOptions) => {
    Object.assign(window, { scrollX: options.left, scrollY: options.top });
  }) });
});
afterEach(() => { unmount(); data.current = null; setState(initialState); vi.unstubAllGlobals(); });

describe.each(['fr', 'en'] as const)('entrée sur le résultat (%s)', (lang) => {
  it('quitte la position du jeu et place le focus sur le titre du vainqueur, sans ajouter une étape Tab', () => {
    const view = fixture(lang);
    const heading = render();
    const first = view.results!.ranking[0];
    const winner = view.players.find((player) => player.id === first.playerId)!;
    expect(heading.props.children).toBe(messages(lang).end.winner(winner.name, fmtFor(lang).money(first.netWorth)));
    expect(heading.props.tabIndex).toBe(-1);
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0, behavior: 'instant' });
    expect(title.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(document.activeElement).toBe(title);
    expect(window.scrollY).toBe(0);
  });

  it('préserve la lecture des rapports lors des nouveaux snapshots et changements de langue, puis réinitialise une nouvelle entrée', () => {
    const view = fixture(lang);
    render();
    const reportControl = { id: 'report-range' };
    Object.assign(window, { scrollY: 1260 });
    Object.assign(document, { activeElement: reportControl });
    data.current = { ...data.current!, view: structuredClone(view) };
    setState({ lang: lang === 'fr' ? 'en' : 'fr' });
    render();
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(title.focus).toHaveBeenCalledTimes(1);
    expect(window.scrollY).toBe(1260);
    expect(document.activeElement).toBe(reportControl);

    unmount(); render();
    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(window.scrollY).toBe(0);
    expect(document.activeElement).toBe(title);
  });
});
