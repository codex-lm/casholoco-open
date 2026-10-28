import type {
  BotPersonality,
  CommodityDef,
  CommodityId,
  FakeRumor,
  HeadlineTemplates,
  Lang,
  MapNames,
  NewsCard,
  NpcCompanyDef,
  SectorDef,
  SectorId,
  ShadyKind,
  TrophyDef,
  TrophyId,
} from '../types';
import { COMMODITIES, SECTORS } from './sectors';
import { FAKE_RUMORS, NEWS_CARDS } from './fr/news';
import { HEADLINES } from './fr/headlines';
import { BOT_PERSONALITIES, NPC_COMPANIES } from './fr/bots';
import { TROPHIES } from './fr/trophies';
import { ACTION_QUIPS, COMPANY_NAME_IDEAS, PRODUCT_NAME_IDEAS, REFUSAL_QUIPS, SHADY_INFO, SITE_NAMES } from './fr/flavor';
import { MAP_NAMES } from './fr/map';
import { HEX_NAMES } from './fr/hexNames';
import { PAPER_FR, type PaperContent } from './fr/paper';
import { EN_CONTENT } from './en';
import { TERRAIN_CONTENT, type TerrainContent } from './fr/terrains';

// Exports historiques = contenu français (données chiffrées communes à toutes les langues).
export { SECTORS, COMMODITIES, NEWS_CARDS, FAKE_RUMORS, HEADLINES, BOT_PERSONALITIES, NPC_COMPANIES, TROPHIES };
export { PRODUCT_NAME_IDEAS, COMPANY_NAME_IDEAS, SHADY_INFO, ACTION_QUIPS, REFUSAL_QUIPS, SITE_NAMES, MAP_NAMES, HEX_NAMES };
export { PAPER_FR } from './fr/paper';
export { TERRAINS, TERRAIN_CONTENT } from './fr/terrains';
export type { TerrainContent } from './fr/terrains';
export type { PaperAd, PaperContent, PaperEntry, PaperFigureKind, PaperLetter, PaperLetterTrigger, PaperSign } from './fr/paper';
export {
  CITIES,
  COASTLINE,
  DEFAULT_ZONE,
  DEPOSITS,
  ISLAND,
  JUNCTIONS,
  LAKE,
  LANDMARKS,
  MAP_HEIGHT,
  MAP_WIDTH,
  MOUNTAIN_RANGE,
  RIVERS,
  ROADS,
  ROAD_FACTOR,
  ZONES,
  distanceKm,
  roadNode,
  roadPoints,
  roadRoute,
  zoneOf,
} from './map';
export type { EnglishContent } from './en/types';
export type { EnglishPaperContent } from './en/paper';

/** Couleurs attribuées aux joueurs, dans l'ordre d'arrivée. */
export const PLAYER_COLORS = [
  '#e4572e',
  '#2e86ab',
  '#8cb369',
  '#f4a259',
  '#9b5de5',
  '#00bbf9',
  '#f15bb5',
  '#5b8e7d',
];

/** Tout le contenu d'une langue. Les ids et les nombres sont identiques d'une langue à l'autre. */
export interface ContentBundle {
  lang: Lang;
  terrains: TerrainContent;
  sectors: Record<SectorId, SectorDef>;
  commodities: Record<CommodityId, CommodityDef>;
  newsCards: NewsCard[];
  fakeRumors: FakeRumor[];
  headlines: HeadlineTemplates;
  bots: BotPersonality[];
  npcCompanies: NpcCompanyDef[];
  trophies: Record<TrophyId, TrophyDef>;
  productNameIdeas: Record<SectorId, string[]>;
  companyNameIdeas: string[];
  /** Noms des filiales d'approvisionnement, par matière (§5.5 bis). */
  siteNames: Record<CommodityId, string[]>;
  /** Noms de la carte : pays, villes, zones, repères (§5.8). */
  mapNames: MapNames;
  /** Noms de lieu des cases hors villes, terrains de départ et gisements (clé = id de case, ex. G7). */
  hexNames: Readonly<Record<string, string>>;
  shadyInfo: Record<ShadyKind, { label: string; emoji: string; description: string }>;
  actionQuips: Record<string, string[]>;
  refusalQuips: string[];
  /** Rubriques burlesques du journal papier : contenu purement éditorial, jamais lu par le moteur. */
  paper: PaperContent;
}

const FR_BUNDLE: ContentBundle = {
  lang: 'fr',
  terrains: TERRAIN_CONTENT,
  sectors: SECTORS,
  commodities: COMMODITIES,
  newsCards: NEWS_CARDS,
  fakeRumors: FAKE_RUMORS,
  headlines: HEADLINES,
  bots: BOT_PERSONALITIES,
  npcCompanies: NPC_COMPANIES,
  trophies: TROPHIES,
  productNameIdeas: PRODUCT_NAME_IDEAS,
  companyNameIdeas: COMPANY_NAME_IDEAS,
  siteNames: SITE_NAMES,
  mapNames: MAP_NAMES,
  hexNames: HEX_NAMES,
  shadyInfo: SHADY_INFO,
  actionQuips: ACTION_QUIPS,
  refusalQuips: REFUSAL_QUIPS,
  paper: PAPER_FR,
};

function mapRecord<K extends string, V>(rec: Record<K, V>, fn: (k: K, v: V) => V): Record<K, V> {
  const out = {} as Record<K, V>;
  for (const k of Object.keys(rec) as K[]) out[k] = fn(k, rec[k]);
  return out;
}

function buildEnPaper(): PaperContent {
  const en = EN_CONTENT.paper;
  if (!en) return PAPER_FR;
  return {
    sectorProducts: en.sectorProducts ?? PAPER_FR.sectorProducts,
    signs: PAPER_FR.signs.map((s) => {
      const t = en.signs[s.id];
      if (!t) return s;
      return { id: s.id, name: t.name, texts: s.texts.map((x) => ({ id: x.id, text: t.texts[x.id] ?? x.text })) };
    }),
    oddNews: PAPER_FR.oddNews.map((e) => ({ id: e.id, text: en.oddNews[e.id] ?? e.text })),
    letters: PAPER_FR.letters.map((l) => ({ ...l, text: en.letters[l.id] ?? l.text })),
    signatures: PAPER_FR.signatures.map((s) => ({ id: s.id, text: en.signatures[s.id] ?? s.text })),
    ads: PAPER_FR.ads.map((a) => ({ id: a.id, ...(en.ads[a.id] ?? { head: a.head, text: a.text }) })),
    figureQuips: { ...PAPER_FR.figureQuips, ...en.figureQuips },
    reclame: {
      templates: mapRecord(PAPER_FR.reclame.templates, (sector, entries) =>
        entries.map((e) => ({ id: e.id, text: en.reclame?.templates[sector]?.[e.id] ?? e.text })),
      ),
      legal: PAPER_FR.reclame.legal.map((e) => ({ id: e.id, text: en.reclame?.legal[e.id] ?? e.text })),
    },
  };
}

function buildEnTerrains(): TerrainContent {
  const base = TERRAIN_CONTENT;
  const en = EN_CONTENT.terrains;
  if (!en) return base;
  return {
    commissariat: { ...base.commissariat, ...en.commissariat[base.commissariat.id] },
    definitions: base.definitions.map((t) => ({ ...t, ...en.definitions[t.id] })),
    editorial: { ...base.editorial, ...en.editorial[base.editorial.id] },
    newsCards: base.newsCards.map((c) => ({ ...c, ...en.newsCards[c.id] })),
    settlements: base.settlements.map((a) => ({ ...a, ...en.settlements[a.id] })),
    auctions: base.auctions.map((a) => ({ ...a, ...en.auctions[a.id] })),
  };
}

function buildEnglish(): ContentBundle {
  const en = EN_CONTENT;
  return {
    lang: 'en',
    terrains: buildEnTerrains(),
    sectors: mapRecord(SECTORS, (id, s) => ({ ...s, ...(en.sectors?.[id] ?? {}) })),
    commodities: mapRecord(COMMODITIES, (id, c) => ({ ...c, ...(en.commodities?.[id] ?? {}) })),
    newsCards: NEWS_CARDS.map((c) => {
      const t = en.news?.[c.id];
      if (!t) return c;
      return { ...c, headline: t.headline, body: t.body, ...(c.rumor !== undefined ? { rumor: t.rumor ?? c.rumor } : {}) };
    }),
    fakeRumors: FAKE_RUMORS.map((r) => ({ ...r, text: en.fakeRumors?.[r.id] ?? r.text })),
    headlines: en.headlines ?? HEADLINES,
    bots: BOT_PERSONALITIES.map((b) => ({ ...b, ...(en.bots?.[b.id] ?? {}) })),
    npcCompanies: NPC_COMPANIES.map((n) => ({ ...n, ...(en.npcs?.[n.id] ?? {}) })),
    trophies: mapRecord(TROPHIES, (id, t) => ({ ...t, ...(en.trophies?.[id] ?? {}) })),
    productNameIdeas: en.productNameIdeas ?? PRODUCT_NAME_IDEAS,
    companyNameIdeas: en.companyNameIdeas ?? COMPANY_NAME_IDEAS,
    siteNames: en.siteNames ?? SITE_NAMES,
    mapNames: en.mapNames ?? MAP_NAMES,
    hexNames: en.hexNames ?? HEX_NAMES,
    shadyInfo: mapRecord(SHADY_INFO, (id, s) => ({ ...s, ...(en.shadyInfo?.[id] ?? {}) })),
    actionQuips: { ...ACTION_QUIPS, ...(en.actionQuips ?? {}) },
    refusalQuips: en.refusalQuips ?? REFUSAL_QUIPS,
    paper: buildEnPaper(),
  };
}

const EN_BUNDLE = buildEnglish();

/** Contenu dans la langue demandée (français par défaut). */
export function getContent(lang: Lang | undefined = 'fr'): ContentBundle {
  return lang === 'en' ? EN_BUNDLE : FR_BUNDLE;
}

export { HEX_R, HEXES, BUILDABLE, SQUARES, SQUARE_SIZE, boardCells, boardBuildable, capitalCellId, isSpatialMap, cellBelongsToBoard, cellBoardConfig, hexById, neighbors, hexDistance } from './hexes';
export { boardTerrains } from './boardTerrains';
export { hexPlaceLabel, hexPlaceName } from './hexPlaceName';
export type { HexSiteSlotRef } from './hexPlaceName';
