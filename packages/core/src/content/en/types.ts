/**
 * Textes anglais du contenu, indexés par identifiant. Les données chiffrées
 * (effets des news, paramètres des bots, calibrage des secteurs) restent celles
 * du contenu français : seule la langue change, jamais la simulation.
 */
import type { CommodityId, FarewellOutcome, HeadlineTemplates, LandSituation, MapNames, SectorId, ShadyKind, TrophyId } from '../../types';
import type { EnglishPaperContent } from './paper';
import type { EnglishTerrainContent } from './terrains';

export interface NewsText {
  headline: string;
  body: string;
  /** Obligatoire si la carte française a une rumeur. */
  rumor?: string;
}

export interface BotText {
  ceoName: string;
  companyName: string;
  ticker: string;
  tagline: string;
  quotes: string[];
  landQuotes?: Record<LandSituation, string[]>;
  farewells: Record<FarewellOutcome, string[]>;
}

export interface NpcText {
  name: string;
  ticker: string;
  ceoName: string;
  description: string;
  productName: string;
}

export interface EnglishContent {
  terrains: EnglishTerrainContent;
  sectors: Record<SectorId, { name: string; description: string }>;
  commodities: Record<CommodityId, { name: string; unit: string }>;
  news: Record<string, NewsText>; // clé = NewsCard.id
  fakeRumors: Record<string, string>; // clé = FakeRumor.id
  headlines: HeadlineTemplates;
  bots: Record<string, BotText>; // clé = BotPersonality.id
  npcs: Record<string, NpcText>; // clé = NpcCompanyDef.id
  trophies: Record<TrophyId, { title: string; description: string }>;
  productNameIdeas: Record<SectorId, string[]>;
  companyNameIdeas: string[];
  siteNames: Record<CommodityId, string[]>; // même nombre de noms que SITE_NAMES
  mapNames: MapNames;
  hexNames: Record<string, string>; // clé = id de case (A4, G7…), mêmes clés que le français
  shadyInfo: Record<ShadyKind, { label: string; description: string }>;
  actionQuips: Record<string, string[]>; // mêmes clés que ACTION_QUIPS
  refusalQuips: string[];
  paper: EnglishPaperContent; // mêmes ids que PAPER_FR
}
