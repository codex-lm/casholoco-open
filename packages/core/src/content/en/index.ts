import type { EnglishContent } from './types';
import { EN_COMMODITIES, EN_SECTORS } from './sectors';
import { EN_FAKE_RUMORS, EN_NEWS } from './news';
import { EN_HEADLINES } from './headlines';
import { EN_BOTS, EN_NPCS } from './bots';
import { EN_TROPHIES } from './trophies';
import {
  EN_ACTION_QUIPS,
  EN_COMPANY_NAME_IDEAS,
  EN_PRODUCT_NAME_IDEAS,
  EN_REFUSAL_QUIPS,
  EN_SHADY_INFO,
  EN_SITE_NAMES,
} from './flavor';
import { EN_MAP_NAMES } from './map';
import { HEX_NAMES as EN_HEX_NAMES } from './hexNames';
import { EN_PAPER } from './paper';
import { EN_TERRAINS } from './terrains';

/**
 * English content (texts only, keyed by id), merged over the French data by
 * getContent('en'). Completeness is checked by test/content.en.test.ts.
 */
export const EN_CONTENT_FULL: EnglishContent = {
  terrains: EN_TERRAINS,
  sectors: EN_SECTORS,
  commodities: EN_COMMODITIES,
  news: EN_NEWS,
  fakeRumors: EN_FAKE_RUMORS,
  headlines: EN_HEADLINES,
  bots: EN_BOTS,
  npcs: EN_NPCS,
  trophies: EN_TROPHIES,
  productNameIdeas: EN_PRODUCT_NAME_IDEAS,
  companyNameIdeas: EN_COMPANY_NAME_IDEAS,
  siteNames: EN_SITE_NAMES,
  mapNames: EN_MAP_NAMES,
  hexNames: EN_HEX_NAMES,
  shadyInfo: EN_SHADY_INFO,
  actionQuips: EN_ACTION_QUIPS,
  refusalQuips: EN_REFUSAL_QUIPS,
  paper: EN_PAPER,
};

/** Kept as Partial so that getContent() still falls back to French for any missing entry. */
export const EN_CONTENT: Partial<EnglishContent> = EN_CONTENT_FULL;
