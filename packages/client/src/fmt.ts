/**
 * Formatage lié à une langue : montants (€ ou $), pourcentages, lots, nombres et dates.
 * Dans une partie, c'est la langue DU SALON qui compte (cohérence avec le journal et les
 * messages du moteur) : useFmt() s'y lie. Les libellés, eux, suivent la langue de l'interface (useT()).
 */
import type { Lang } from '@muchomoney/core';
import {
  dateLabel,
  formatLots,
  formatMoney,
  formatNumber,
  formatPct,
  formatSharePrice,
  formatSignedPct,
  moneyUnit,
} from '@muchomoney/core';
import { useRoomLang } from './i18n';

export interface Fmt {
  lang: Lang;
  /** Unité des montants saisis : « k€ » ou « k$ ». */
  unit: string;
  /** Montant : « 12,5 M€ », « 850 k€ », et sous 10 k « 4,0 k€ » (« $12.5M », « $850k », « $4.0k ») ; zéro, « 0 k€ » / « $0k ». */
  money(k: number, precision?: NumberPrecision): string;
  /** Montant signé : « +1,2 M€ » / « -$850k ». */
  signedMoney(k: number, precision?: NumberPrecision): string;
  sharePrice(k: number): string;
  /** Prix d'un lot, une décimale : « 36,0 k€ » / « $36.0k » (signe avant le symbole : « -$1.2k »). */
  lotPrice(k: number, precision?: NumberPrecision): string;
  pct(ratio: number, digits?: number): string;
  signedPct(ratio: number, digits?: number): string;
  lots(n: number, precision?: NumberPrecision): string;
  /** Entier arrondi avec séparateur de milliers. */
  int(n: number): string;
  /** Nombre, au plus 2 décimales. */
  num(n: number): string;
  /** Nombre avec exactement `digits` décimales. */
  fixed(n: number, digits: number): string;
  /** « T3 2027 » / « Q3 2027 ». */
  date(turn: number, startYear: number): string;
}

/** Optional display precision for tightly spaced map legend values; ordinary labels stay unchanged. */
export type NumberPrecision = number | 'exact';

function build(lang: Lang): Fmt {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  const nfInt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const precise = (n: number, precision: NumberPrecision) => new Intl.NumberFormat(locale, precision === 'exact'
    ? { maximumSignificantDigits: 21 }
    : { minimumFractionDigits: precision, maximumFractionDigits: precision }).format(n);
  /**
   * L'interface compte en k : sous 10 k, une décimale en k (« 4,0 k€ », « $4.0k ») plutôt que des euros, espace
   * insécable comme lotPrice. Ce qui s'arrondit à zéro s'écrit comme zéro, « 0 k€ » / « $0k », sans signe ; ce qui
   * s'arrondit à 10 s'écrit comme 10 k (« 10 k€ », pas « 10,0 k€ »). Le journal du moteur garde formatMoney (« 3 993 € »).
   */
  const smallMoney = (k: number): string => {
    const tenths = Math.round(Math.abs(k) * 10);
    if (tenths >= 100) return formatMoney(Math.sign(k) * 10, lang);
    if (tenths === 0) return lang === 'en' ? '$0k' : `0 ${moneyUnit(lang)}`;
    const sign = k < 0 ? '-' : '';
    const amount = formatNumber(tenths / 10, 1, lang);
    return lang === 'en' ? `${sign}$${amount}k` : `${sign}${amount} ${moneyUnit(lang)}`;
  };
  const money = (k: number, precision?: NumberPrecision) => {
    if (precision === undefined) return Math.abs(k) < 10 ? smallMoney(k) : formatMoney(k, lang);
    // The exact fallback retains raw k values: dividing adjacent floats into M/B can erase their difference.
    if (precision === 'exact') return lang === 'en'
      ? `${k < 0 ? '-' : ''}$${precise(Math.abs(k), precision)}k` : `${precise(k, precision)} ${moneyUnit(lang)}`;
    const abs = Math.abs(k);
    let sign = k < 0 ? '-' : '';
    // Small amounts stay in k, like the default labels (no euros below 10 k).
    const divisor = abs >= 1_000_000 ? 1_000_000 : abs >= 1_000 ? 1_000 : 1;
    const amount = precise(abs / divisor, precision);
    // An amount that rounds to zero carries no sign (« 0,0 k€ », never « -0,0 k€ »).
    if (!/[1-9]/.test(amount)) sign = '';
    const suffix = lang === 'en'
      ? divisor === 1_000_000 ? 'B' : divisor === 1_000 ? 'M' : 'k'
      : divisor === 1_000_000 ? ' Md€' : divisor === 1_000 ? ' M€' : ' k€';
    return lang === 'en' ? `${sign}$${amount}${suffix}` : `${sign}${amount}${suffix}`;
  };
  return {
    lang,
    unit: moneyUnit(lang),
    money,
    signedMoney: (k, precision) => {
      const label = money(k, precision);
      // No « +0 k€ »: a positive amount that rounds to zero is written like zero.
      return k > 0 && /[1-9]/.test(label) ? `+${label}` : label;
    },
    sharePrice: (k) => formatSharePrice(k, lang),
    lotPrice: (k, precision) => {
      const number = (n: number) => precision === undefined ? formatNumber(n, 1, lang) : precise(n, precision);
      return lang === 'en' ? `${k < 0 ? '-' : ''}$${number(Math.abs(k))}k` : `${number(k)} ${moneyUnit(lang)}`;
    },
    pct: (r, digits = 1) => formatPct(r, digits, lang),
    signedPct: (r, digits = 1) => formatSignedPct(r, digits, lang),
    lots: (n, precision) => precision === undefined ? formatLots(n, lang) : `${precise(n, precision)} lots`,
    int: (n) => nfInt.format(Math.round(n)),
    num: (n) => nf2.format(n),
    fixed: (n, digits) => formatNumber(n, digits, lang),
    date: (turn, startYear) => dateLabel(turn, startYear, lang),
  };
}

const CACHE: Partial<Record<Lang, Fmt>> = {};

export function fmtFor(lang: Lang | undefined): Fmt {
  const l: Lang = lang === 'en' ? 'en' : 'fr';
  return (CACHE[l] ??= build(l));
}

/** Formatage dans la langue du salon courant. */
export function useFmt(): Fmt {
  return fmtFor(useRoomLang());
}

const INPUT_NF: Partial<Record<Lang, Intl.NumberFormat>> = {};

/**
 * Valeur affichée dans un champ de saisie, dans la langue de l'interface : sa décimale, sans séparateur de milliers
 * (relu tel quel par parseNumber), au plus deux décimales : « 114,75 » (fr), « 1500.5 » (en).
 */
export function inputNumber(n: number, lang: Lang = 'fr'): string {
  const nf = (INPUT_NF[lang] ??= new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 2, useGrouping: false }));
  const rounded = Math.round(n * 100) / 100;
  // Pas de « -0 » pour un zéro négatif.
  return nf.format(rounded === 0 ? 0 : rounded);
}

/**
 * Lit un nombre saisi, en tolérant les deux conventions : « 1 500,5 » (fr) et « 1,500.5 » (en).
 * Seule ambiguïté, « 1,500 » : milliers en anglais (lang 'en'), décimale en français.
 */
export function parseNumber(raw: string, lang: Lang = 'fr'): number {
  let s = raw.replace(/[\s  ']/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Le dernier séparateur est la décimale, l'autre sépare les milliers.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const thousands = /^-?\d{1,3}(,\d{3})+$/.test(s);
    s = lang === 'en' && thousands ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  return Number(s);
}
