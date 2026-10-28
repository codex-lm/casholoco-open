import type { NewsText } from '../types';
import { EN_NEWS_COMMODITIES, EN_RUMORS_COMMODITIES } from './commodities';
import { EN_NEWS_SECTORS_FOOD, EN_RUMORS_SECTORS_FOOD } from './sectors_food';
import { EN_NEWS_SECTORS_TECH, EN_RUMORS_SECTORS_TECH } from './sectors_tech';
import { EN_NEWS_MACRO, EN_RUMORS_MACRO } from './macro';
import { EN_NEWS_POLITICS, EN_RUMORS_POLITICS } from './politics';
import { EN_NEWS_SCANDAL, EN_RUMORS_SCANDAL } from './scandal';
import { EN_NEWS_TECH, EN_RUMORS_TECH } from './tech';
import { EN_NEWS_ABSURD, EN_RUMORS_ABSURD } from './absurd';
import { EN_NEWS_GUEST, EN_RUMORS_GUEST } from './guest';
import { EN_NEWS_GUEST2, EN_RUMORS_GUEST2 } from './guest2';
import { EN_NEWS_SITES, EN_RUMORS_SITES } from './sites';
import { EN_NEWS_MAP, EN_RUMORS_MAP } from './map';

/** English texts of the extra batches (merged into ../news.ts). */
export const EN_EXTRA_NEWS: Record<string, NewsText> = {
  ...EN_NEWS_COMMODITIES,
  ...EN_NEWS_SECTORS_FOOD,
  ...EN_NEWS_SECTORS_TECH,
  ...EN_NEWS_MACRO,
  ...EN_NEWS_POLITICS,
  ...EN_NEWS_SCANDAL,
  ...EN_NEWS_TECH,
  ...EN_NEWS_ABSURD,
  ...EN_NEWS_GUEST,
  ...EN_NEWS_GUEST2,
  ...EN_NEWS_SITES,
  ...EN_NEWS_MAP,
};

export const EN_EXTRA_RUMORS: Record<string, string> = {
  ...EN_RUMORS_COMMODITIES,
  ...EN_RUMORS_SECTORS_FOOD,
  ...EN_RUMORS_SECTORS_TECH,
  ...EN_RUMORS_MACRO,
  ...EN_RUMORS_POLITICS,
  ...EN_RUMORS_SCANDAL,
  ...EN_RUMORS_TECH,
  ...EN_RUMORS_ABSURD,
  ...EN_RUMORS_GUEST,
  ...EN_RUMORS_GUEST2,
  ...EN_RUMORS_SITES,
  ...EN_RUMORS_MAP,
};
