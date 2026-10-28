import type { Lang } from '@muchomoney/core';

const fr = {
  expand: (title: string) => `Déplier les trois panneaux (${title})`,
  collapse: (title: string) => `Replier les trois panneaux (${title})`,
  stake: (pct: string) => `${pct} du capital`,
  scandal: (gauge: number) => `Scandale ${gauge}/100`,
  payback: (n: number) => `Remb. ${n} trim.`,
  priceRatio: (pct: string) => `${pct} du prix de base`,
  launch: 'Lancer',
};

const en: typeof fr = {
  expand: (title: string) => `Expand all three signs (${title})`,
  collapse: (title: string) => `Collapse all three signs (${title})`,
  stake: (pct: string) => `${pct} stake`,
  scandal: (gauge: number) => `Scandal ${gauge}/100`,
  payback: (n: number) => `Payback ${n} ${n === 1 ? 'qtr' : 'qtrs'}`,
  priceRatio: (pct: string) => `${pct} of base price`,
  launch: 'Launch',
};

export const signsReadability = (lang: Lang) => lang === 'en' ? en : fr;
