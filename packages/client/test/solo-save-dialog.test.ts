import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveDialog } from '../src/solo/SoloControls';
import { importSoloGame } from '../src/api';
import { flushProductSaves } from '../src/productSaves';
import { soloMessages } from '../src/solo/messages';
import { getState, setState, type AppState } from '../src/store';

const hooks = vi.hoisted(() => ({ cursor: 0, state: [] as unknown[], refs: [] as unknown[] }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.state)) hooks.state[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [hooks.state[index], (value: unknown) => { hooks.state[index] = value; }];
    },
    useRef: (initial: unknown) => {
      const index = hooks.cursor++;
      return hooks.refs[index] ??= { current: initial };
    },
  };
});
vi.mock('../src/api', () => ({
  importSoloGame: vi.fn(async () => ({ ok: true })),
  exportSoloGame: () => '{"format":"casholoco-solo"}',
  soloStorageAvailable: () => true,
  leaveRoom: vi.fn(),
}));
vi.mock('../src/productSaves', () => ({ flushProductSaves: vi.fn(async () => true) }));
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(select: (state: AppState) => T) => select(actual.getState()) };
});

const initial = getState();
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
function render(onClose: () => void) {
  hooks.cursor = 0;
  return SaveDialog({ initialMode: 'import', onClose });
}
function enterText(onClose: () => void) {
  const textarea = elements(render(onClose)).find((item) => item.type === 'textarea')!;
  (textarea.props.onChange as (event: unknown) => void)({ target: { value: 'saved-game' } });
}
function submit(onClose: () => void, label: string) {
  const button = elements(render(onClose)).find((item) => item.type === 'button' && item.props.children === label)!;
  (button.props.onClick as () => void)();
}

beforeEach(() => {
  hooks.cursor = 0; hooks.state = []; hooks.refs = [];
  vi.mocked(flushProductSaves).mockReset().mockResolvedValue(true);
  vi.mocked(importSoloGame).mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => setState(initial));

describe.each(['fr', 'en'] as const)('import save boundary (%s)', (lang) => {
  it('waits for product decisions and keeps the dialog open if they cannot be saved', async () => {
    setState({ lang });
    const onClose = vi.fn();
    let finish: (saved: boolean) => void = () => {};
    vi.mocked(flushProductSaves).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    enterText(onClose);
    submit(onClose, soloMessages(lang).importPlay);
    expect(importSoloGame).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    finish(false);
    await vi.waitFor(() => {
      expect(elements(render(onClose)).some((item) => item.props.role === 'alert' && item.props.children === soloMessages(lang).saveBeforeLeavingFailed)).toBe(true);
    });
    expect(importSoloGame).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('imports only after saved decisions and closes the old dialog on success', async () => {
    setState({ lang });
    const onClose = vi.fn();
    enterText(onClose);
    submit(onClose, soloMessages(lang).importPlay);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(flushProductSaves).toHaveBeenCalledOnce();
    expect(importSoloGame).toHaveBeenCalledExactlyOnceWith('saved-game');
    expect(vi.mocked(flushProductSaves).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(importSoloGame).mock.invocationCallOrder[0]);
  });
});
