import type { Lang } from '@muchomoney/core';

const fr = {
  locationDetails: 'Détails du lieu',
};

const en: typeof fr = {
  locationDetails: 'Location details',
};

export const sheetReadabilityMessages = (lang: Lang) => lang === 'en' ? en : fr;
