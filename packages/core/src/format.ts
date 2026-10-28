/**
 * Formatage partagé (client + messages du moteur). Montants en k (milliers d'unités monétaires).
 * La monnaie dépend de la langue : euros en français, dollars en anglais. Les nombres
 * du moteur ne changent pas, seul l'affichage change (1 k€ affiché comme $1k).
 */
import type { Lang } from './types';

const FR = {
  nf0: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }),
  nf1: new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  nf2: new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};
const EN = {
  nf0: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  nf1: new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  nf2: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/**
 * fr : 12500 -> « 12,5 M€ », 850 -> « 850 k€ », 1.5 -> « 1 500 € ».
 * en : 12500 -> « $12.5M », 850 -> « $850k », 1.5 -> « $1,500 ».
 */
export function formatMoney(k: number, lang: Lang = 'fr'): string {
  const abs = Math.abs(k);
  const sign = k < 0 ? '-' : '';
  if (lang === 'en') {
    if (abs >= 1_000_000) return `${sign}$${EN.nf1.format(abs / 1_000_000)}B`;
    if (abs >= 1_000) return `${sign}$${EN.nf1.format(abs / 1_000)}M`;
    if (abs >= 10) return `${sign}$${EN.nf0.format(abs)}k`;
    return `${sign}$${EN.nf0.format(abs * 1000)}`;
  }
  if (abs >= 1_000_000) return `${sign}${FR.nf1.format(abs / 1_000_000)} Md€`;
  if (abs >= 1_000) return `${sign}${FR.nf1.format(abs / 1_000)} M€`;
  if (abs >= 10) return `${sign}${FR.nf0.format(abs)} k€`;
  return `${sign}${FR.nf0.format(abs * 1000)} €`;
}

/** Prix d'une action (k) -> fr « 5,23 k€ » / « 830 € », en « $5.23k » / « $830 ». */
export function formatSharePrice(k: number, lang: Lang = 'fr'): string {
  if (lang === 'en') return k >= 1 ? `$${EN.nf2.format(k)}k` : `$${EN.nf0.format(k * 1000)}`;
  if (k >= 1) return `${FR.nf2.format(k)} k€`;
  return `${FR.nf0.format(k * 1000)} €`;
}

/** Unité monétaire des montants saisis (en k) : « k€ » ou « k$ ». */
export function moneyUnit(lang: Lang = 'fr'): string {
  return lang === 'en' ? 'k$' : 'k€';
}

/** Formate un nombre brut selon la langue (séparateurs de milliers et décimale). */
export function formatNumber(n: number, digits = 0, lang: Lang = 'fr'): string {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** fr « 12,5 % », en « 12.5% ». */
export function formatPct(ratio: number, digits = 1, lang: Lang = 'fr'): string {
  const s = (ratio * 100).toFixed(digits);
  return lang === 'en' ? `${s}%` : `${s.replace('.', ',')} %`;
}

export function formatSignedPct(ratio: number, digits = 1, lang: Lang = 'fr'): string {
  const s = formatPct(Math.abs(ratio), digits, lang);
  return ratio >= 0 ? `+${s}` : `-${s}`;
}

export function formatLots(lots: number, lang: Lang = 'fr'): string {
  return `${(lang === 'en' ? EN : FR).nf0.format(lots)} lots`;
}

/** fr « T3 2027 », en « Q3 2027 ». */
export function dateLabel(turn: number, startYear: number, lang: Lang = 'fr'): string {
  const q = ((turn - 1) % 4) + 1;
  const y = startYear + Math.floor((turn - 1) / 4);
  return `${lang === 'en' ? 'Q' : 'T'}${q} ${y}`;
}
