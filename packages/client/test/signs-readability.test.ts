import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, getContent, getPlayerView, type Lang, type PlayerView } from '@muchomoney/core';
import { fmtFor } from '../src/fmt';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { signsReadability } from '../src/i18n/signsReadability';
import { Signs } from '../src/screens/game/city/Signs';
import { SIGNS_EXPANDED_KEY, saveFlag } from '../src/storageFlags';
import { getState, setState, type AppState } from '../src/store';

// Same SSR callback harness as companyEntry.test.ts: native buttons are exercised directly.
const clicks = vi.hoisted(() => ({ elements: [] as Record<string, unknown>[] }));
vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-dev-runtime')>();
  return { ...actual, jsxDEV: (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
    if (props && typeof props.onClick === 'function') clicks.elements.push(props);
    return (actual.jsxDEV as (...args: unknown[]) => unknown)(type, props, ...rest);
  } };
});
vi.mock('react/jsx-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-runtime')>();
  const wrap = <F extends (...args: never[]) => unknown>(fn: F) => (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
    if (props && typeof props.onClick === 'function') clicks.elements.push(props);
    return (fn as (...args: unknown[]) => unknown)(type, props, ...rest);
  };
  return { ...actual, jsx: wrap(actual.jsx), jsxs: wrap(actual.jsxs) };
});
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
  // Isolate visits between cases, including a previous case whose storage writes failed.
  saveFlag(SIGNS_EXPANDED_KEY, false);
});
afterEach(() => { setState(initial); vi.unstubAllGlobals(); });
const escape = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

/** The signs only exist on the classic map (the hex board moved them to the game bar and its toolbar). */
function fixture(lang: Lang, mapMode: 'classic' | 'hex' = 'classic') {
  const view = getPlayerView(createGame({ seed: 19, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang,
    ...(mapMode === 'hex' ? { mapMode, terrainAssignment: 'fair' as const } : {}) }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: '#654321' },
  ]), 'human');
  for (const sector of view.sectors) {
    if (sector.launchEstimate) sector.launchEstimate.paybackQuarters = null;
    for (const estimate of Object.values(sector.launchByHex ?? {})) estimate.paybackQuarters = null;
  }
  const sector = view.sectors[1];
  const hexId = view.hexes?.free[0];
  if (hexId) sector.launchByHex![hexId] = { unitCost: 10, quarterlyProfit: 500, paybackQuarters: 2, demand: 100 };
  else sector.launchEstimate = { quarterlyProfit: 500, paybackQuarters: 2 };
  const company = view.companies.find((c) => c.controllerId === 'human')!;
  company.holdings.rival = company.sharesOutstanding * .31;
  return { view, company, sector, hexId };
}

function render(view: PlayerView, lang: Lang, openMapFor = vi.fn()) {
  setState({ lang, view, lobby: null });
  clicks.elements.length = 0;
  return renderToStaticMarkup(createElement(GameProvider, { view,
    children: createElement(Signs, { company: null, onSelect: vi.fn(), goTo: vi.fn(), onFactories: vi.fn(), frozen: true, openMapFor }) }));
}

function storage(values: Record<string, string> = {}, reads: string[] = []) {
  return { getItem: (key: string) => { reads.push(key); return values[key] ?? null; },
    setItem: (key: string, value: string) => { values[key] = value; } };
}

describe.each(['fr', 'en'] as const)('compact signs (%s)', (lang) => {
  it('starts with three one-line summaries, their identity, and all key figures', () => {
    const { view, sector } = fixture(lang);
    const html = render(view, lang);
    const t = messages(lang);
    const compact = signsReadability(lang);
    expect(html).toContain('ent-compact');
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(3);
    expect(html.match(/<div id="[^"]+" hidden=""><\/div>/g)).toHaveLength(3);
    for (const kind of ['you', 'threat', 'opening']) expect(html).toContain(`ent-${kind}`);
    for (const title of [t.city.signs.you, t.city.signs.threat, t.city.signs.opening]) expect(html).toContain(escape(title));
    expect(html).toContain(escape(fmtFor(lang).money(view.players.find((p) => p.id === view.you)!.netWorth).replaceAll(' ', '\u00a0')));
    expect(html).toContain(escape(compact.stake(fmtFor(lang).pct(.31, 0).replaceAll(' ', '\u00a0'))));
    expect(html).toContain(escape(getContent(lang).sectors[sector.id].name));
    expect(html).toContain(escape(compact.payback(2)));
    expect(html).not.toContain('ent-sign-body');
    expect(html).not.toContain('ent-fortunes');
    expect(html).not.toContain('ent-art');
    expect(html).toContain('class="ent-icon"');
    const controls = [...html.matchAll(/<button[^>]+class="ent-sign-toggle"[^>]+aria-controls="([^"]+)"/g)].map((m) => m[1]);
    expect(controls).toHaveLength(3);
    for (const id of controls) expect(html).toContain(`<div id="${id}" hidden="">`);
  });

  it('the separate Opportunity button opens the launch intent', () => {
    const { view, company, sector, hexId } = fixture(lang);
    expect(hexId).toBeUndefined();
    const openMapFor = vi.fn();
    const html = render(view, lang, openMapFor);
    const button = clicks.elements.find((p) => p.className === 'ent-summary-action')!;
    expect(button).toBeDefined();
    expect(button.children).toBe(signsReadability(lang).launch);
    expect(button).not.toHaveProperty('aria-expanded');
    expect(html).toContain(`>${escape(signsReadability(lang).launch)}</button>`);
    (button.onClick as () => void)();
    expect(openMapFor).toHaveBeenCalledExactlyOnceWith({ kind: 'launch', companyId: company.id, sectorId: sector.id });
  });

  it('the same global preference expands or collapses all panels in every match', () => {
    const values: Record<string, string> = {};
    const reads: string[] = [];
    vi.stubGlobal('localStorage', storage(values, reads));
    const { view } = fixture(lang);
    render(view, lang);
    const toggles = clicks.elements.filter((p) => p.className === 'ent-sign-toggle');
    expect(toggles).toHaveLength(3);
    (toggles[1].onClick as () => void)();
    expect(values).toEqual({ [SIGNS_EXPANDED_KEY]: '1' });
    for (const nextView of [view, fixture(lang).view]) {
      const html = render(nextView, lang);
      expect(html).not.toContain('ent-compact');
      expect(html.match(/aria-expanded="true"/g)).toHaveLength(3);
      expect(html.match(/class="ent-sign-body/g)).toHaveLength(3);
      expect(html).toContain('ent-fortunes');
    }
    (clicks.elements.find((p) => p.className === 'ent-sign-toggle')!.onClick as () => void)();
    expect(values).toEqual({ [SIGNS_EXPANDED_KEY]: '0' });
    expect(render(view, lang).match(/aria-expanded="false"/g)).toHaveLength(3);
    expect(new Set(reads)).toEqual(new Set([SIGNS_EXPANDED_KEY]));
  });

  it('unavailable storage starts compact and retains changes across remounts for the visit', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(render(fixture(lang).view, lang)).toContain('ent-compact');
    expect(() => (clicks.elements.find((p) => p.className === 'ent-sign-toggle')!.onClick as () => void)()).not.toThrow();
    expect(render(fixture(lang).view, lang).match(/aria-expanded="true"/g)).toHaveLength(3);
    (clicks.elements.find((p) => p.className === 'ent-sign-toggle')!.onClick as () => void)();
    expect(render(fixture(lang).view, lang).match(/aria-expanded="false"/g)).toHaveLength(3);
  });

  it('summarizes the scandal gauge when no shareholder threat has priority', () => {
    const { view, company } = fixture(lang);
    delete company.holdings.rival;
    company.private!.scandal = 42;
    const html = render(view, lang);
    expect(html).toContain(escape(signsReadability(lang).scandal(42)));
    expect(html).not.toContain('ent-sign-body');
  });
});

it('new sign texts have FR/EN parity and French addresses the player with vous', () => {
  const fr = signsReadability('fr');
  const en = signsReadability('en');
  expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
    const french = fr[key];
    const english = en[key];
    expect(typeof english).toBe(typeof french);
    const output = typeof french === 'function' ? (french as (value: never) => string)('X' as never) : french;
    expect(output).not.toMatch(/\b(?:tu|ton|ta|tes)\b/i);
    expect(output.trim()).not.toBe('');
    if (typeof french === 'function' && typeof english === 'function') expect(english.length).toBe(french.length);
  }
});
