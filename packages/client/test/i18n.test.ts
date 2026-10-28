import { describe, expect, it } from 'vitest';
import { fr } from '../src/i18n/fr';
import { en } from '../src/i18n/en';
import { langFromNavigator } from '../src/i18n/detect';
import { formatMoney } from '@muchomoney/core';
import { fmtFor, inputNumber, parseNumber } from '../src/fmt';
import { turnLabels } from '../src/util';
import { HEX_FIRST_STEPS, HEX_SECOND_STEPS, TUTORIAL_STEPS } from '../src/tutorial';

type Tree = Record<string, unknown>;

/** Chemins de toutes les feuilles (chaînes, fonctions avec leur arité, tableaux avec leur longueur). */
function shape(v: unknown, path = ''): string[] {
  if (typeof v === 'function') return [`${path}()/${v.length}`];
  if (Array.isArray(v)) return [`${path}[${v.length}]`, ...v.flatMap((x, i) => (typeof x === 'object' && x ? shape(x, `${path}[${i}]`) : []))];
  if (v && typeof v === 'object') return Object.keys(v as Tree).sort().flatMap((k) => shape((v as Tree)[k], path ? `${path}.${k}` : k));
  return [`${path}:${typeof v}`];
}

/** Toutes les chaînes produites (fonctions appelées avec des arguments factices). */
function strings(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]];
  if (typeof v === 'function') {
    const args = Array.from({ length: v.length }, (_, i) => (i === 0 ? 2 : 'X'));
    const out = (v as (...a: unknown[]) => unknown)(...args);
    const argsStr = Array.from({ length: v.length }, () => 'X');
    const out2 = (v as (...a: unknown[]) => unknown)(...argsStr);
    return [...strings(out, `${path}(2)`), ...strings(out2, `${path}(X)`)];
  }
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v as Tree).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  return [];
}

describe('i18n : fr et en', () => {
  it('ont exactement les mêmes clés (et la même arité pour les messages paramétrés)', () => {
    expect(shape(en)).toEqual(shape(fr));
  });

  it('checklist : un texte par étape (liste classique et plateau), aide en dix lignes au plus', () => {
    const ids = [...new Set([...TUTORIAL_STEPS, ...HEX_FIRST_STEPS, ...HEX_SECOND_STEPS].map((s) => s.id))].sort();
    for (const m of [fr, en]) {
      expect(Object.keys(m.tutorial.steps).sort()).toEqual(ids);
      expect(m.help.lines('10 %').length).toBeLessThanOrEqual(10);
    }
  });

  it('aucun texte vide', () => {
    for (const [path, s] of [...strings(fr), ...strings(en)]) expect(s.trim(), path).not.toBe('');
  });

  it('l’anglais ne contient pas de français résiduel (accents, guillemets français)', () => {
    const allowed = new Set(['lang.names.fr', 'dateLocale']);
    const offenders = strings(en)
      .filter(([path]) => !allowed.has(path) && !path.startsWith('scandalLevel') && !path.startsWith('reliability'))
      .filter(([, s]) => /[àâçéèêëîïôûùœ«»]/i.test(s));
    expect(offenders).toEqual([]);
  });

  it('les formulaires du plateau vouvoient et gardent les apostrophes typographiques', () => {
    const forms = strings(fr.hex).filter(([path]) => path.startsWith('form'));
    const offenders = forms.filter(([, text]) => /\b(?:tu|ton|ta|tes|choisis|donne)\b|[a-zàâçéèêëîïôûùœ]'[a-zàâçéèêëîïôûùœ]/i.test(text));
    expect(offenders).toEqual([]);
  });

  it('le plateau anglais parle de lots et terrains de départ, avec l’orthographe américaine', () => {
    const offenders = strings(en.hex).filter(([, text]) => /\b(?:per unit|units per quarter|colours?|neighbour\w*|labour|starting plots)\b/i.test(text));
    expect(offenders).toEqual([]);
  });

  it('pluriels et ordinaux propres à chaque langue', () => {
    expect(fr.common.shares('0', 0)).toBe('0 action');
    expect(en.common.shares('0', 0)).toBe('0 shares');
    expect(en.common.shares('1', 1)).toBe('1 share');
    expect(fr.ordinal(1)).toBe('1er');
    expect(fr.ordinal(3)).toBe('3e');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(en.ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe('langue par défaut de l’interface', () => {
  it('fr* → français, tout le reste → anglais', () => {
    expect(langFromNavigator('fr-FR')).toBe('fr');
    expect(langFromNavigator('fr')).toBe('fr');
    expect(langFromNavigator('FR-ca')).toBe('fr');
    expect(langFromNavigator('en-GB')).toBe('en');
    expect(langFromNavigator('de-DE')).toBe('en');
    expect(langFromNavigator(undefined)).toBe('en');
  });
});

describe('formatage lié à la langue du salon', () => {
  it('euros en français, dollars en anglais', () => {
    expect(fmtFor('fr').money(12500)).toBe('12,5 M€');
    expect(fmtFor('en').money(12500)).toBe('$12.5M');
    expect(fmtFor('fr').unit).toBe('k€');
    expect(fmtFor('en').unit).toBe('k$');
    expect(fmtFor('en').pct(0.125)).toBe('12.5%');
    expect(fmtFor('en').date(3, 2027)).toBe('Q3 2027');
    expect(fmtFor('fr').date(3, 2027)).toBe('T3 2027');
    expect(fmtFor(undefined).lang).toBe('fr');
  });

  it('sous 10 k, les montants restent en k avec une décimale ; zéro aussi ; le journal du moteur garde ses euros', () => {
    const nb = ' ';
    expect(fmtFor('fr').money(3.993)).toBe(`4,0${nb}k€`);
    expect(fmtFor('en').money(3.993)).toBe('$4.0k');
    expect(fmtFor('fr').money(0)).toBe(`0${nb}k€`);
    expect(fmtFor('en').money(0)).toBe('$0k');
    expect(fmtFor('fr').money(-0.7)).toBe(`-0,7${nb}k€`);
    expect(fmtFor('en').money(-0.7)).toBe('-$0.7k');
    expect(fmtFor('fr').signedMoney(3.993)).toBe(`+4,0${nb}k€`);
    expect(fmtFor('en').signedMoney(3.993)).toBe('+$4.0k');
    // Ce qui s'arrondit à zéro s'écrit comme zéro, sans signe ; ce qui s'arrondit à 10 comme 10 k.
    for (const k of [-0.01, 0.01, 0.04, -0.049]) {
      expect(fmtFor('fr').money(k)).toBe(`0${nb}k€`);
      expect(fmtFor('en').money(k)).toBe('$0k');
      expect(fmtFor('fr').signedMoney(k)).toBe(`0${nb}k€`);
      expect(fmtFor('en').signedMoney(k)).toBe('$0k');
    }
    expect(fmtFor('fr').money(0.05)).toBe(`0,1${nb}k€`);
    expect(fmtFor('fr').money(9.96)).toBe('10 k€');
    expect(fmtFor('en').money(9.96)).toBe('$10k');
    expect(fmtFor('fr').money(-9.97)).toBe('-10 k€');
    expect(fmtFor('fr').signedMoney(9.96)).toBe('+10 k€');
    expect(fmtFor('fr').money(9.94)).toBe(`9,9${nb}k€`);
    // À partir de 10 k, rien ne change.
    expect(fmtFor('fr').money(10)).toBe('10 k€');
    expect(fmtFor('fr').money(850)).toBe('850 k€');
    expect(fmtFor('en').money(850)).toBe('$850k');
    // Précision imposée (légendes du plateau) : en k aussi, jamais en euros, espace insécable, pas de « -0,0 ».
    expect(fmtFor('fr').money(0.5, 1)).toBe(`0,5${nb}k€`);
    expect(fmtFor('en').money(0.5, 1)).toBe('$0.5k');
    expect(fmtFor('fr').money(-0.01, 1)).toBe(`0,0${nb}k€`);
    expect(fmtFor('fr').signedMoney(0.01, 1)).toBe(`0,0${nb}k€`);
    expect(fmtFor('fr').signedMoney(0.06, 1)).toBe(`+0,1${nb}k€`);
    // Garde-fou : jamais d'unités sous 10 k (« 3 993 € », « $3,993 »). Le motif reconnaît bien l'ancienne écriture.
    const inUnits = /\d\s€$|\$[\d,]+$/;
    for (const k of [0, 3.993, -9.5]) for (const lang of ['fr', 'en'] as const) expect(formatMoney(k, lang)).toMatch(inUnits);
    for (const lang of ['fr', 'en'] as const) for (const k of [0, 0.004, 3.993, -9.5, 9.99]) expect(fmtFor(lang).money(k)).not.toMatch(inUnits);
    // Le journal (moteur) formate toujours lui-même ses petits montants en euros.
    expect(formatMoney(3.993, 'fr')).toMatch(/993 €$/);
  });

  it('libellés d’axe : dates et mots dans la bonne langue', () => {
    expect(turnLabels(3, 1, 2027, { start: 'Start', now: 'Now' }, 'en')).toEqual(['Start', 'Q1 2027', 'Now']);
    expect(turnLabels(2, 2, 2027, { start: 'Départ' })).toEqual(['T1 2027', 'T2 2027']);
  });
});

describe('saisie des nombres', () => {
  it('valeur d’un champ : décimale de la langue, sans séparateur de milliers, deux décimales au plus', () => {
    expect(inputNumber(114.75, 'fr')).toBe('114,75');
    expect(inputNumber(114.75, 'en')).toBe('114.75');
    expect(inputNumber(12500.5, 'fr')).toBe('12500,5');
    expect(inputNumber(12500.5, 'en')).toBe('12500.5');
    expect(inputNumber(2.3456, 'fr')).toBe('2,35');
    expect(inputNumber(40, 'fr')).toBe('40');
    expect(inputNumber(-0.001, 'fr')).toBe('0');
    // Relue par parseNumber, la valeur affichée redonne le nombre.
    for (const lang of ['fr', 'en'] as const) for (const n of [114.75, 12500.5, 0.25, 12000]) expect(parseNumber(inputNumber(n, lang), lang)).toBe(n);
  });

  it('virgule décimale française, séparateurs anglais', () => {
    expect(parseNumber('1,5', 'fr')).toBe(1.5);
    expect(parseNumber('1 500,5', 'fr')).toBe(1500.5);
    expect(parseNumber('1.5', 'fr')).toBe(1.5);
    expect(parseNumber('1,500', 'en')).toBe(1500);
    expect(parseNumber('1,500.25', 'en')).toBe(1500.25);
    expect(parseNumber('1.500,25', 'fr')).toBe(1500.25);
    expect(parseNumber('2,5', 'en')).toBe(2.5);
    expect(parseNumber('abc', 'en')).toBeNaN();
  });
});
