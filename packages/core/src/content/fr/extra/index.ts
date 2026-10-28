import type { FakeRumor, NewsCard } from '../../../types';
import { NEWS_COMMODITIES, RUMORS_COMMODITIES } from './commodities';
import { NEWS_SECTORS_FOOD, RUMORS_SECTORS_FOOD } from './sectors_food';
import { NEWS_SECTORS_TECH, RUMORS_SECTORS_TECH } from './sectors_tech';
import { NEWS_MACRO, RUMORS_MACRO } from './macro';
import { NEWS_POLITICS, RUMORS_POLITICS } from './politics';
import { NEWS_SCANDAL, RUMORS_SCANDAL } from './scandal';
import { NEWS_TECH, RUMORS_TECH } from './tech';
import { NEWS_ABSURD, RUMORS_ABSURD } from './absurd';
import { NEWS_GUEST, RUMORS_GUEST } from './guest';
import { NEWS_GUEST2, RUMORS_GUEST2 } from './guest2';
import { NEWS_SITES, RUMORS_SITES } from './sites';
import { NEWS_MAP, RUMORS_MAP } from './map';

/** Cartes et fausses rumeurs des lots supplémentaires (fusionnées dans ../news.ts). */
export const EXTRA_NEWS: NewsCard[] = [
  ...NEWS_COMMODITIES,
  ...NEWS_SECTORS_FOOD,
  ...NEWS_SECTORS_TECH,
  ...NEWS_MACRO,
  ...NEWS_POLITICS,
  ...NEWS_SCANDAL,
  ...NEWS_TECH,
  ...NEWS_ABSURD,
  ...NEWS_GUEST,
  ...NEWS_GUEST2,
  ...NEWS_SITES,
  ...NEWS_MAP,
];

export const EXTRA_RUMORS: FakeRumor[] = [
  ...RUMORS_COMMODITIES,
  ...RUMORS_SECTORS_FOOD,
  ...RUMORS_SECTORS_TECH,
  ...RUMORS_MACRO,
  ...RUMORS_POLITICS,
  ...RUMORS_SCANDAL,
  ...RUMORS_TECH,
  ...RUMORS_ABSURD,
  ...RUMORS_GUEST,
  ...RUMORS_GUEST2,
  ...RUMORS_SITES,
  ...RUMORS_MAP,
];
