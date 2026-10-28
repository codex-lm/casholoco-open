import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lang } from '@muchomoney/core';
import { AmountForm } from '../src/components/AmountForm';
import { messages } from '../src/i18n';
import { getState, setState, type AppState } from '../src/store';

// Sans DOM de test, on fixe seulement les hooks d'état pour obtenir un rendu et
// appeler son vrai gestionnaire de soumission. Parsing, validation et messages
// sont ceux du composant, y compris lorsque le bouton désactivé est contourné.
const hooks = vi.hoisted(() => ({ raw: '', cursor: 0, id: 0 }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useId: () => `amount-test-${++hooks.id}`,
    useState: (initial: unknown) => [hooks.cursor++ === 0 ? hooks.raw : initial, vi.fn()],
  };
});
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

type Element = ReactElement<Record<string, unknown>>;
function find(node: ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (predicate(child)) return child;
    const nested = find(child.props.children as ReactNode, predicate);
    if (nested) return nested;
  }
  return undefined;
}

function render(raw: string, lang: Lang, props: Partial<ComponentProps<typeof AmountForm>> = {}) {
  hooks.raw = raw;
  hooks.cursor = 0;
  setState({ lang, view: null, lobby: null });
  const onSubmit = vi.fn(async () => ({ ok: true }));
  const info = vi.fn((amount: number) => `estimate:${amount}`);
  const form = AmountForm({ label: 'Order', max: 100, unit: 'lots', submitLabel: 'Send', onSubmit, info, ...props });
  const button = find(form, (el) => el.type === 'button' && el.props.type === 'submit')!;
  const input = find(form, (el) => el.type === 'input')!;
  const alert = find(form, (el) => el.props.role === 'alert');
  const submit = () => form.props.onSubmit({ preventDefault: vi.fn() });
  return { form, button, input, alert, onSubmit, info, submit };
}

describe.each([
  { lang: 'fr' as const, fractional: '20,6', lessThanOne: '0,9', money: '20,6' },
  { lang: 'en' as const, fractional: '20.6', lessThanOne: '0.9', money: '20.6' },
])('AmountForm — $lang', ({ lang, fractional, lessThanOne, money }) => {
  it.each(['fractional', 'lessThanOne'] as const)('refuse les lots fractionnaires (%s) sans estimation tronquée ni ordre', (example) => {
    const raw = example === 'fractional' ? fractional : lessThanOne;
    const result = render(raw, lang);
    expect(result.input.props.value).toBe(raw);
    expect(result.input.props['aria-invalid']).toBe(true);
    expect(result.button.props.disabled).toBe(true);
    expect(result.alert?.props.children).toBe(messages(lang).form.wholeLots);
    expect(result.info).not.toHaveBeenCalled();
    result.submit();
    expect(result.onSubmit).not.toHaveBeenCalled();
  });

  it('envoie et estime la même quantité entière, sans arrondir une saisie', () => {
    const result = render('21', lang, { max: 21 });
    expect(result.button.props.disabled).toBe(false);
    expect(result.alert).toBeUndefined();
    expect(result.info).toHaveBeenCalledWith(21);
    result.submit();
    expect(result.onSubmit).toHaveBeenCalledExactlyOnceWith(21);
  });

  it('refuse zéro, le dépassement du volume et le dépassement du budget', () => {
    for (const [raw, max] of [['0', 100], ['21', 20], ['1', 0.9]] as const) {
      const result = render(raw, lang, { max });
      expect(result.button.props.disabled).toBe(true);
      result.submit();
      expect(result.onSubmit).not.toHaveBeenCalled();
    }
  });

  it('écrit les raccourcis avec la décimale de la langue', () => {
    const onRawChange = vi.fn();
    const result = render('', lang, { unit: 'money', max: 20.6, presets: [0.5], onRawChange });
    const half = find(result.form, (el) => el.type === 'button' && el.props.type === 'button' && el.props.className === 'btn tiny ghost')!;
    (half.props.onClick as () => void)();
    expect(onRawChange).toHaveBeenCalledWith(lang === 'fr' ? '10,3' : '10.3');
  });

  it('préserve les montants monétaires décimaux', () => {
    const result = render(money, lang, { unit: 'money', max: 20.6 });
    expect(result.button.props.disabled).toBe(false);
    expect(result.alert).toBeUndefined();
    expect(result.info).toHaveBeenCalledWith(20.6);
    result.submit();
    expect(result.onSubmit).toHaveBeenCalledExactlyOnceWith(20.6);
  });

  it('conserve les actions entières et refuse leur fractionnement', () => {
    const fractionalShares = render(fractional, lang, { unit: 'shares' });
    expect(fractionalShares.alert?.props.children).toBe(messages(lang).form.wholeShares);
    fractionalShares.submit();
    expect(fractionalShares.onSubmit).not.toHaveBeenCalled();
    const wholeShares = render('20', lang, { unit: 'shares' });
    wholeShares.submit();
    expect(wholeShares.onSubmit).toHaveBeenCalledExactlyOnceWith(20);
  });

  it('ne soumet pas une action désactivée même avec une quantité valide', () => {
    const result = render('20', lang, { disabledReason: 'Unavailable' });
    result.submit();
    expect(result.onSubmit).not.toHaveBeenCalled();
  });
});
