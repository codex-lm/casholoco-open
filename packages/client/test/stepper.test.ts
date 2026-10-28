import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AmountForm } from '../src/components/AmountForm';
import { niceStep, stepValue } from '../src/components/Stepper';
import { messages } from '../src/i18n';
import type { AppState } from '../src/store';

// Rendu hors navigateur : le store se lit tel quel (pas d'abonnement React).
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

describe('boutons − et + : des pas ronds, calés sur leur grille, dans les bornes', () => {
  it('pas rond (1, 2 ou 5 × 10^k) juste sous la valeur, jamais sous le plancher', () => {
    expect(niceStep(250)).toBe(200);
    expect(niceStep(7.5)).toBe(5);
    expect(niceStep(1000)).toBe(1000);
    expect(niceStep(1)).toBe(1);
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(0.8, 0.01)).toBe(0.5);
    expect(niceStep(0.03, 0.01)).toBe(0.02);
    expect(niceStep(Number.NaN)).toBe(1);
    expect(niceStep(-5)).toBe(1);
  });

  it('un pas mène au multiple suivant ou précédent, sans sortir des bornes', () => {
    expect(stepValue(13, 1, 5, 1, 100)).toBe(15);
    expect(stepValue(15, 1, 5, 1, 100)).toBe(20);
    expect(stepValue(13, -1, 5, 1, 100)).toBe(10);
    expect(stepValue(15, -1, 5, 1, 100)).toBe(10);
    expect(stepValue(98, 1, 5, 1, 100)).toBe(100);
    expect(stepValue(3, -1, 5, 1, 100)).toBe(1);
    // Au-delà du maximum (saisi au clavier), − ramène au maximum.
    expect(stepValue(150, -1, 5, 1, 100)).toBe(100);
    // Prix au demi : 12,37 → 12,5 ; pas décimaux sans poussière de virgule flottante.
    expect(stepValue(12.37, 1, 0.5, 0, 50)).toBe(12.5);
    expect(stepValue(0.3, 1, 0.1, 0, 1)).toBe(0.4);
    expect(stepValue(0.7, -1, 0.1, 0, 1)).toBe(0.6);
  });

  it('champ vide : + propose le minimum (la mise à prix pour une enchère), − ne fait rien', () => {
    expect(stepValue(Number.NaN, 1, 5, 20, 100)).toBe(20);
    expect(stepValue(Number.NaN, -1, 5, 20, 100)).toBeNull();
    // Rien de possible (maximum sous le minimum) : aucun pas.
    expect(stepValue(5, 1, 5, 10, 3)).toBeNull();
  });
});

describe('formulaire de montant', () => {
  const render = (props: Partial<Parameters<typeof AmountForm>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(AmountForm, {
        label: 'Acheter',
        unit: 'lots',
        max: 62,
        submitLabel: 'Acheter',
        presets: [0.25, 0.5, 1],
        onSubmit: async () => ({ ok: true }),
        ...props,
      }),
    );

  it('encadre le champ de − et +, d’un lot à la fois pour des lots', () => {
    const html = render();
    expect(html).toContain('aria-label="Diminuer de 1 lot"');
    expect(html).toContain('aria-label="Augmenter de 1 lot"');
    // Champ vide : − est grisé, + est actif.
    expect(html).toMatch(/<button type="button" class="btn-step" disabled="" aria-label="Diminuer/);
    expect(html).toMatch(/<button type="button" class="btn-step" aria-label="Augmenter/);
  });

  it('pas rond pour un montant : environ un vingtième de la plage', () => {
    const html = render({ unit: 'money', max: 5000 });
    expect(html).toContain('aria-label="Augmenter de 200 k€"');
  });

  it('les raccourcis disent de quoi ils sont la part, et ce qu’ils valent', () => {
    const html = render();
    expect(html).toContain('>¼ max<');
    expect(html).toContain('>½ max<');
    expect(html).toContain('title="Un quart du maximum : 15 lots"');
    expect(html).toContain('title="Le maximum : 62 lots"');
  });

  it('dit ce qu’il reste après l’opération, pour un montant possible seulement', () => {
    const after = (n: number) => `il restera ${62 - n}`;
    expect(render({ initial: 10, after })).toContain('il restera 52');
    expect(render({ after })).not.toContain('il restera');
    // Au-delà du maximum, pas de reste (l'avertissement suffit).
    expect(render({ initial: 80, after })).not.toContain('il restera');
  });

  it('les nouveaux textes existent en français et en anglais', () => {
    for (const lang of ['fr', 'en'] as const) {
      const f = messages(lang).form;
      expect(f.preset(0.25, '25 %')).toContain('¼');
      expect(f.presetTitle(1, '100 %', '62 lots')).toContain('62 lots');
      expect(f.cashAfter('1 k')).toContain('1 k');
      expect(f.personalCashDebtAfter('1 k', '2 k')).toContain('2 k');
      expect(f.lotStep(1)).toBe('1 lot');
    }
    expect(messages('en').form.stepUp('1 lot')).toBe('Increase by 1 lot');
  });
});
