/** Champ numérique de la fiche produit : la valeur s'affiche avec la décimale de la langue de l'interface. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumberField } from '../src/components/NumberField';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

/** La valeur du champ texte (le curseur, lui, garde la notation HTML à point). */
function render(lang: 'fr' | 'en', value: number): string {
  setState({ lang, view: null, lobby: null });
  const html = renderToStaticMarkup(createElement(NumberField, { label: 'Prix', value, onChange: () => {}, min: 0, max: 100_000, step: 0.5, slider: true }));
  return html.match(/<input[^>]*type="text"[^>]*>/)?.[0] ?? '';
}

describe('NumberField', () => {
  it('affiche « 114,75 » en français et « 114.75 » en anglais', () => {
    expect(render('fr', 114.75)).toContain('value="114,75"');
    expect(render('fr', 114.75)).not.toContain('value="114.75"');
    expect(render('en', 114.75)).toContain('value="114.75"');
  });

  it('sans séparateur de milliers ni plus de deux décimales', () => {
    expect(render('fr', 12500.456)).toContain('value="12500,46"');
    expect(render('en', 12500.456)).toContain('value="12500.46"');
    expect(render('fr', 40)).toContain('value="40"');
  });
});
