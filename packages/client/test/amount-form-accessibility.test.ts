import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmountForm } from '../src/components/AmountForm';
import { InfoTip } from '../src/components/bits';
import { messages } from '../src/i18n';
import { getState, setState, type AppState } from '../src/store';

// Keep React's real useId: multiple rendered amount forms must never share a label identity.
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(select: (state: AppState) => T) => select(actual.getState()) };
});
const initialState = getState();
afterEach(() => setState(initialState));
const escaped = (value: string) => renderToStaticMarkup(createElement(Fragment, null, value));
const field = (label: ReactNode) => createElement(AmountForm, {
  label, max: 1000, initial: 270, unit: 'money', submitLabel: 'OK', onSubmit: vi.fn(async () => ({ ok: true })),
});
const textInputs = (html: string) => [...html.matchAll(/<input\b[^>]*type="text"[^>]*>/g)].map(match => match[0]);

describe.each(['fr', 'en'] as const)('amount field accessible label (%s)', lang => {
  it('names a rich loan label while retaining the independently focusable help', () => {
    setState({ lang, view: null, lobby: null });
    const t = messages(lang);
    const label = createElement(Fragment, null, t.finance.loanLabel, ' ', createElement(InfoTip, { text: t.tips.loanCap, align: 'left' }));
    const html = renderToStaticMarkup(field(label));
    const input = textInputs(html)[0];
    const labelId = input.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelId).toBeTruthy();
    expect(html).toContain(`<span class="amount-label" id="${labelId}">${escaped(t.finance.loanLabel)}`);
    expect(input).toContain('value="270"');
    expect(html).toContain(`class="info-tip tip-left" tabindex="0" role="img" aria-label="${escaped(t.tips.loanCap)}"`);
  });

  it('gives simultaneous rich labels distinct ids which each input references exactly once', () => {
    setState({ lang, view: null, lobby: null });
    const t = messages(lang);
    const html = renderToStaticMarkup(createElement(Fragment, null,
      field(createElement('strong', null, t.finance.loanLabel)),
      field(createElement('strong', null, t.finance.repayLabel)),
    ));
    const ids = textInputs(html).map(input => input.match(/aria-labelledby="([^"]+)"/)?.[1]);
    expect(ids).toHaveLength(2);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html.split(`id="${id}"`)).toHaveLength(2);
    expect(html).toContain(`<span class="amount-label" id="${ids[0]}"><strong>${escaped(t.finance.loanLabel)}</strong>`);
    expect(html).toContain(`<span class="amount-label" id="${ids[1]}"><strong>${escaped(t.finance.repayLabel)}</strong>`);
  });

  it('preserves the existing accessible name of a plain text label', () => {
    setState({ lang, view: null, lobby: null });
    const label = messages(lang).finance.repayLabel;
    const html = renderToStaticMarkup(field(label));
    expect(textInputs(html)[0]).toContain(`aria-label="${escaped(label)}"`);
  });
});
