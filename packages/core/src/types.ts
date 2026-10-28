/**
 * Contrat central de muchomoney.
 *
 * Conventions :
 * - Tous les montants sont en k€ (milliers d'euros), en nombres flottants.
 *   12 000 = 12 M€. Le prix d'une action est aussi en k€.
 * - Les volumes de produits et de matières premières sont en « lots ».
 * - Un tour = un trimestre. Le tour 1 est « T1 <startYear> ».
 * - Le moteur mute l'état en place (GameState est un objet JSON sérialisable,
 *   sans classes ni Map/Set).
 */

export type Id = string;

/** Privilèges de l'usine de départ et leviers des nouvelles locales (§5.8 ter). */
export type TerrainLever = 'labor' | 'rnd' | 'marketing' | 'perishability' | 'tax' | 'scandal' | 'fixedCost' | 'demand' | 'heat' | 'perceivedPrice' | 'salvage';
export interface TerrainEffect {
  lever: TerrainLever;
  mult?: number;
  rate?: number;
  turns?: number;
}
export interface TerrainDef {
  id: string;
  hex: string;
  effects: TerrainEffect[];
  name: string;
  strengthLabel: string;
  counterLabel: string | null;
  blurb: string;
  allocation: { headline: string; body: string };
}
export type TerrainAppreciation = 'very_good' | 'good' | 'average' | 'poor';
export interface TerrainAssessment {
  value: number;
  appreciation: TerrainAppreciation;
  label: string;
}
export interface TerrainView {
  id: string;
  hex: string;
  name: string;
  strengthLabel: string;
  counterLabel: string | null;
  blurb: string;
  companyId: Id | null;
  active: boolean;
  /** Effets de la dotation encore en cours ce trimestre : siège (taxe, scandale) vs usine (autres leviers). */
  runningEffects: { headquarters: boolean; factory: boolean };
}

/** Langue d'un salon (textes générés par le moteur) ou de l'interface d'un joueur. */
export type Lang = 'fr' | 'en';
export const LANGS: Lang[] = ['fr', 'en'];
export const DEFAULT_LANG: Lang = 'fr';

// ---------------------------------------------------------------------------
// Identifiants de contenu
// ---------------------------------------------------------------------------

export type SectorId = 'energy_drinks' | 'gadgets' | 'scooters' | 'yogurts' | 'crypto';
export const SECTOR_IDS: SectorId[] = ['energy_drinks', 'gadgets', 'scooters', 'yogurts', 'crypto'];

export type CommodityId = 'oil' | 'lithium' | 'sugar' | 'chips';
export const COMMODITY_IDS: CommodityId[] = ['oil', 'lithium', 'sugar', 'chips'];

/** Villes de la carte (§5.8) : la capitale (port, bourses) et quatre autres, de tailles différentes. */
export type CityId = 'capital' | 'north_east' | 'south' | 'east' | 'north';
export const CITY_IDS: CityId[] = ['capital', 'north_east', 'south', 'east', 'north'];

/** Zones d'usine (§5.8) : une par ville, plus la plaine et la montagne. La capitale est la zone par défaut. */
export type ZoneId = CityId | 'plain' | 'mountain';
export const ZONE_IDS: ZoneId[] = [...CITY_IDS, 'plain', 'mountain'];

/** Repères du décor de la carte (§5.8), sans effet sur la partie. */
export type LandmarkId = 'sea' | 'gulf' | 'bay' | 'cape' | 'island' | 'lake' | 'river' | 'valley';
export const LANDMARK_IDS: LandmarkId[] = ['sea', 'gulf', 'bay', 'cape', 'island', 'lake', 'river', 'valley'];

/**
 * Sortes de routes (§5.8) : le transport d'un lot coûte la longueur de la route × son facteur (`ROAD_FACTOR`).
 * Autoroute (moins chère), nationale, route de montagne (plus chère), liaison maritime (pipeline, bac).
 */
export type RoadKind = 'highway' | 'road' | 'mountain' | 'sea';
export const ROAD_KINDS: RoadKind[] = ['highway', 'road', 'mountain', 'sea'];

export type ShadyKind =
  | 'lobbying' // +demande sur un secteur pendant 2 tours
  | 'tax_optimisation' // impôt réduit à 5 % ce tour
  | 'greenwashing' // attractivité +30 % sur tous les produits ce tour
  | 'industrial_espionage' // vole de la qualité à un concurrent du même secteur
  | 'offshoring' // coût de main-d'œuvre -30 % pendant 3 tours
  | 'smear_campaign'; // fait chuter le sentiment d'une entreprise cible
export const SHADY_KINDS: ShadyKind[] = [
  'lobbying',
  'tax_optimisation',
  'greenwashing',
  'industrial_espionage',
  'offshoring',
  'smear_campaign',
];

export type TrophyId =
  | 'magnat' // 1er au classement
  | 'pollueur' // plus de pétrole consommé
  | 'machiavel' // plus d'actions discutables
  | 'parachute' // plus gros total de parachutes dorés reçus
  | 'visionnaire' // plus de R&D dépensée
  | 'marketeux' // plus de marketing dépensé
  | 'predateur' // plus de prises de contrôle réussies
  | 'proie' // plus de prises de contrôle subies
  | 'casserole' // plus de scandales
  | 'fisc' // plus d'amendes payées
  | 'naufrage' // plus grosse perte de fortune en un tour
  | 'rentier' // plus de dividendes reçus
  | 'serial' // plus de startups fondées
  | 'bonus'; // plus de bonus de PDG encaissés
export const TROPHY_IDS: TrophyId[] = [
  'magnat',
  'pollueur',
  'machiavel',
  'parachute',
  'visionnaire',
  'marketeux',
  'predateur',
  'proie',
  'casserole',
  'fisc',
  'naufrage',
  'rentier',
  'serial',
  'bonus',
];

// ---------------------------------------------------------------------------
// Définitions de contenu (données statiques, dans src/content)
// ---------------------------------------------------------------------------

export interface SectorDef {
  id: SectorId;
  name: string; // « Boissons énergisantes »
  emoji: string;
  description: string; // une ligne satirique
  refPrice: number; // k€ par lot, prix de référence
  refDemand: number; // lots/trimestre, marché total au prix de référence
  elasticity: number; // sensibilité au prix propre au secteur
  /** Sector demand sensitivity to the attractiveness-weighted national market price; absent means 0. */
  marketElasticity?: number;
  laborCost: number; // k€ par lot produit
  inputs: Partial<Record<CommodityId, number>>; // lots de matière par lot produit
  launchCost: number; // k€ pour lancer un produit
  capacityCost: number; // k€ par lot de capacité ajoutée
  fixedCost: number; // k€ par produit et par tour
  volatility: number; // écart-type de la marche aléatoire de la demande (log)
  growth: number; // croissance tendancielle par tour (ex. 0.01)
  perishability: number; // fraction du stock invendu perdue par tour
  /** « Fabriqué ici » (§5.2 bis) : bonus d'attractivité dans la ville de l'usine (0,35 = +35 %), 0 partout ailleurs. */
  localBonus: number;
  /** Poids au fret : lots → chargements de camion pour la facture de livraison (0 = rien à camionner). */
  freightWeight: number;
  outsideAttractiveness: number; // poids des « autres concurrents » hors jeu
  startingCapacity: number; // capacité d'une ligne neuve (lots)
  /** Sector sensitivity to advertising; absent means 1. */
  marketingMultiplier?: number;
  /** Retained share of last quarter's brand; absent means 0.75. */
  brandPersistence?: number;
  /** Recurring customer base toward which an unadvertised brand tends; absent means 0.3. */
  brandBase?: number;
  /** Sector sensitivity to R&D, multiplied by local budget effects; absent means 1. */
  rndMultiplier?: number;
  /** Retained share of last quarter's quality before R&D; absent means 0.99. */
  qualityDecay?: number;
  /** Quality's exponent in consumer choice; absent means 1.3. */
  qualityExponent?: number;
  /** Quarterly outside quality progress; absent means 0.04. */
  outsideQualityGrowth?: number;
  /** Sensitivity to sector-demand news; absent means 1. */
  newsSensitivity?: number;
  /** Established brand of an initial business; later entrants start at 0.3. */
  startingBrand?: number;
  /** Digital products incur neither inbound haul nor delivery costs. */
  intangible?: boolean;
}

export interface CommodityDef {
  id: CommodityId;
  name: string; // « Pétrole »
  emoji: string;
  unit: string; // « baril-lot »
  basePrice: number; // k€ par lot
  volatility: number; // écart-type log par tour
  meanReversion: number; // 0..1, force du retour vers basePrice
  liquidity: number; // lots : acheter `liquidity` lots fait +100 % de prix
  /** Poids au fret : lots → chargements pour la facture d'acheminement (port ou gisement → usine). */
  freightWeight: number;
}

/** Point de la carte (§5.8), en km : x d'ouest en est, y du nord au sud. */
export interface MapPoint {
  x: number;
  y: number;
}

/** Parcelle : colonnes/rangées odd-r pour le plateau hexagonal, orthogonales pour les IDs carrés S-*. */
export interface HexDef extends MapPoint {
  id: Id;
  q: number;
  r: number;
  terrain: 'land' | 'mountain' | 'island';
  city?: CityId;
  zone?: ZoneId;
  deposit?: Id;
}

export interface CityDef extends MapPoint {
  id: CityId;
  /** Part de la population du pays (somme des villes = 1). */
  share: number;
  /** Goût de la ville pour chaque secteur (§5.2 bis) : sa part des clients d'un secteur ∝ population × goût. */
  taste: Record<SectorId, number>;
}

export interface ZoneDef extends MapPoint {
  id: ZoneId;
  /**
   * Multiplicateur de la main-d'œuvre d'une usine de la zone, par secteur (capitale = 1, §5.8) : chaque zone a ses
   * spécialités (la plaine pour l'agroalimentaire, la grande ville pour la tech, la montagne pour les batteries…).
   */
  labor: Record<SectorId, number>;
}

/** Gisement d'un emplacement de filiale (§5.8) : sa position est fixe, son nom tiré à la création de la partie. */
export interface DepositDef extends MapPoint {
  /** Identifiant de l'emplacement (`SiteSlot.id`). */
  id: Id;
  commodityId: CommodityId;
  /** Richesse : lots extraits par trimestre par la filiale qui l'exploite (`SupplySite.capacity`). */
  capacity: number;
}

/** Repère du décor (§5.8) : où poser son nom. */
export interface LandmarkDef extends MapPoint {
  id: LandmarkId;
}

/**
 * Tronçon de route (§5.8) entre deux nœuds du réseau : une zone (ou sa ville), un gisement ou un carrefour. `via` :
 * points intermédiaires du tracé (sa longueur est celle de la ligne brisée).
 */
export interface RoadDef {
  id: string;
  from: string;
  to: string;
  kind: RoadKind;
  via: MapPoint[];
}

/** Itinéraire le moins cher entre deux nœuds du réseau (§5.8), calculé une fois pour toutes. */
export interface RoadRoute {
  /** Longueur réelle (km). */
  km: number;
  /** Longueur pondérée par la sorte de chaque tronçon (km × facteur) : c'est elle qui fait le prix du transport. */
  cost: number;
  /** Nœuds traversés, du départ à l'arrivée. */
  nodes: string[];
  /** Tracé à dessiner, du départ à l'arrivée. */
  points: MapPoint[];
}

/** Noms de la carte dans une langue (content/fr, content/en) : satiriques, aucun vrai lieu. */
export interface MapNames {
  country: string;
  cities: Record<CityId, string>;
  /** Zones hors des villes ; celle d'une ville porte le nom de sa ville. */
  zones: Record<Exclude<ZoneId, CityId>, string>;
  landmarks: Record<LandmarkId, string>;
}

export type NewsCategory =
  | 'local'
  | 'commodities'
  | 'sector'
  | 'macro'
  | 'politics'
  | 'scandal'
  | 'tech'
  | 'absurd';

export type Tone = 'good' | 'bad' | 'neutral' | 'drama';

/** Cible d'un effet visant des entreprises. */
export type CompanyTarget =
  | 'all'
  | 'random' // une entreprise cotée au hasard (non en faillite)
  | 'richest' // plus grosse capitalisation
  | 'smallest' // plus petite capitalisation
  | 'mostScandalous' // jauge de scandale la plus haute
  | 'topProfit' // plus gros bénéfice au dernier trimestre
  | 'playerCompanies' // entreprises contrôlées par des joueurs (humains ou bots)
  | { sectorId: SectorId }; // entreprises ayant au moins un produit dans ce secteur

export type NewsEffect =
  | { type: 'terrain'; terrain: string; lever: TerrainLever; multiplier?: number; suspend?: boolean; duration: number }
  | { type: 'heat'; lever: 'heat' | 'demand'; scope: 'all' | 'mountain' | CityId; multiplier: number; duration: number }
  | { type: 'sectorDemand'; sectorId: SectorId | 'random'; multiplier: number; duration: number }
  | { type: 'commodityPrice'; commodityId: CommodityId | 'random'; multiplier: number } // saut immédiat
  | { type: 'commoditySupply'; commodityId: CommodityId | 'random'; multiplier: number; duration: number } // pression durable sur le prix d'équilibre
  | { type: 'siteCost'; commodityId: CommodityId | 'random'; multiplier: number; duration: number } // coût d'extraction des filiales de la matière (§5.5 bis)
  | { type: 'interestRate'; delta: number; duration: number } // ex. +0.005 = +0,5 pt par trimestre
  | { type: 'taxRate'; delta: number; duration: number }
  | { type: 'laborCost'; sectorId: SectorId | 'all'; multiplier: number; duration: number }
  | { type: 'zoneLabor'; zoneId: ZoneId; multiplier: number; duration: number } // main-d'œuvre d'une zone : grève, subvention (§5.8)
  | { type: 'transportCost'; multiplier: number; duration: number } // prix du transport partout : gazole, péages (§5.8)
  | { type: 'marketSentiment'; multiplier: number } // toutes les actions, immédiat, s'estompe
  | { type: 'companySentiment'; target: CompanyTarget; multiplier: number }
  | { type: 'companyCash'; target: CompanyTarget; pctOfCash: number; flat?: number } // négatif = amende
  | { type: 'scandal'; target: CompanyTarget; delta: number }
  | { type: 'reputation'; target: CompanyTarget; delta: number };

export interface NewsCard {
  /** Trimestres calendaires éligibles, par exemple l'hiver [4, 1]. */
  quarters?: number[];
  id: string;
  category: NewsCategory;
  /** Placeholders possibles : {company} {ceo} {sector} {commodity} (résolus depuis les cibles 'random'/'richest'…). */
  headline: string;
  body: string;
  tone: Tone;
  weight: number; // probabilité relative de tirage
  minTurn?: number;
  maxTurn?: number;
  /** Si présent, une rumeur est publiée au tour précédent. */
  rumor?: string;
  effects: NewsEffect[];
}

export interface FakeRumor {
  id: string;
  text: string;
  /** Matière dont la rumeur (fausse) annonce la hausse : les bots s'y laissent prendre comme les humains. */
  commodityId?: CommodityId;
}

/**
 * Modèles de titres pour les événements dynamiques.
 * Placeholders : {acquirer} {target} {company} {ceo} {player} {product} {sector} {amount} {pct}
 * ({amount} est déjà formaté, ex. « 3,2 M€ »).
 */
export interface HeadlineTemplates {
  takeover: string[]; // {acquirer} prend le contrôle de {target}
  ousted: string[]; // {player} évincé de {company}, parachute {amount}
  oustedBroke: string[]; // {player} évincé de {company} sans parachute (trésorerie vide)
  scandal: string[]; // scandale chez {company}, amende {amount}
  bankruptcy: string[]; // {company} fait faillite
  productLaunch: string[]; // {company} lance {product} ({sector})
  hexProductLaunch: string[]; // {company} lance {product} en rayon ce trimestre ({sector})
  bigProfit: string[]; // {company} annonce {amount} de bénéfice
  bigLoss: string[]; // {company} perd {amount}
  ceoBonus: string[]; // {ceo} s'accorde un bonus de {amount} chez {company}
  startup: string[]; // {player} fonde {company}
  merger: string[]; // {acquirer} absorbe {target}
  poisonPill: string[]; // {company} dégaine la pilule empoisonnée
  buyback: string[]; // {company} rachète ses propres actions pour {amount}
  dividend: string[]; // {company} verse {amount} de dividendes
  marginCall: string[]; // {player} victime d'un appel de marge
  stakeBuilding: string[]; // {player} monte à {pct} du capital de {company}
  insiderBuying: string[]; // {ceo} rachète {pct} du capital de sa propre entreprise {company} (délit d'initié)
  whistleblow: string[]; // un lanceur d'alerte (anonyme) dénonce {company} : jauge de scandale publiée {level}
  quarterIntro: string[]; // phrase d'ouverture du journal, {sector} = secteur du trimestre
}

export type LandSituation = 'won' | 'overpaid' | 'lostToHuman' | 'lostToBot' | 'fallback';
/** Issue d'un bot en fin de partie, pour sa réplique d'adieu (« Ils ont dit », §11). */
export type FarewellOutcome = 'won' | 'podium' | 'pack' | 'ruined';

export interface BotPersonality {
  id: string;
  ceoName: string;
  companyName: string;
  ticker: string; // 3-4 lettres
  emoji: string;
  tagline: string; // devise satirique
  preferredSectors: SectorId[];
  aggressiveness: number; // 0..1 : appétit pour les prises de contrôle
  riskTolerance: number; // 0..1 : endettement, paris sur les matières
  marketingBias: number; // 0..1
  rndBias: number; // 0..1
  pricePremium: number; // multiplicateur de prix vs référence (0.85..1.3)
  shadyPropensity: number; // 0..1
  greed: number; // 0..1 : bonus et dividendes vers sa fortune perso
  quotes: string[]; // citations publiées dans le journal
  landQuotes?: Record<LandSituation, string[]>;
  farewells: Record<FarewellOutcome, string[]>; // répliques d'adieu de fin de partie, 3 par issue (§11)
}

export interface NpcCompanyDef {
  id: string;
  name: string;
  ticker: string;
  ceoName: string;
  emoji: string;
  sectorId: SectorId;
  description: string;
  sizeFactor: number; // 0.5..1.2 : taille relative à une entreprise de joueur
  productName: string;
}

export interface TrophyDef {
  id: TrophyId;
  emoji: string;
  title: string; // « Le Machiavel du trimestre »
  description: string; // explication courte
}

// ---------------------------------------------------------------------------
// Configuration et lobby
// ---------------------------------------------------------------------------

/**
 * Niveau d'un bot (§10) : 'intern' (« stagiaire », pour une première partie : prix de référence, pas de lancement, ni
 * OPA, ni action discutable, ni lanceur d'alerte), 'normal' (défaut) ou 'expert'. Chaque bot a le sien, réglé au salon.
 */
export type BotLevel = 'intern' | 'normal' | 'expert';
export const BOT_LEVELS: BotLevel[] = ['intern', 'normal', 'expert'];

export interface GameConfig {
  /** Industrial network rules for new hex rooms; absent preserves existing saves. */
  industryRules?: 'network';
  /** Plateau spatial optionnel ; absent = règles classiques. */
  mapMode?: 'classic' | 'hex' | 'square';
  terrainAssignment?: 'fair' | 'fair_varied' | 'random' | 'choice' | 'host';
  /** Choix des joueurs ou placements de l'hôte : identifiant du joueur vers son terrain de départ. */
  terrains?: Record<Id, string>;
  totalTurns: number; // défaut 16
  turnSeconds: number; // défaut 90 ; 0 = sans chrono (le trimestre attend que tous les humains connectés soient prêts)
  startYear: number; // défaut 2027
  seed: number;
  /**
   * Graine des choix visibles qui ne comptent pas (noms des filiales, textes d'ambiance, noms suggérés), tirée par le
   * serveur indépendamment de `seed` : publique, elle ne trahit rien de la simulation. Absent = `seed` (tests, simulations).
   */
  textSeed?: number;
  /** Langue des textes générés (journal, messages, noms des bots et PNJ). Défaut 'fr'. */
  lang?: Lang;
  /** Niveau des bots qui n'ont pas le leur (`LobbyPlayer.botLevel`). Défaut 'normal'. */
  botLevel?: BotLevel;
  /** Autorise un nouvel humain à reprendre un bot en cours de partie. Défaut false. */
  allowBotTakeover?: boolean;
}

export const DEFAULT_CONFIG: Omit<GameConfig, 'seed'> = {
  industryRules: 'network',
  totalTurns: 16,
  turnSeconds: 90,
  startYear: 2027,
  lang: 'fr',
  allowBotTakeover: false,
};

export interface LobbyPlayer {
  id: Id;
  name: string;
  isBot: boolean;
  botPersonalityId?: string;
  /** Niveau de ce bot (§10), réglé au salon ; absent = `GameConfig.botLevel`, puis 'normal'. */
  botLevel?: BotLevel;
  companyName: string;
  sectorId: SectorId;
  connected: boolean;
  color: string;
}

// ---------------------------------------------------------------------------
// État de partie
// ---------------------------------------------------------------------------

export interface PlayerStats {
  shadyActions: number;
  scandals: number;
  finesPaid: number; // k€
  takeoversWon: number;
  takeoversSuffered: number;
  parachutes: number; // k€ reçus
  rndSpent: number; // k€
  marketingSpent: number; // k€
  oilConsumed: number; // lots
  bonusesTaken: number; // k€
  dividendsReceived: number; // k€
  startupsFounded: number;
  worstTurnLoss: number; // k€, valeur positive = perte
  bankruptcies: number;
  /** Alertes lancées (lanceur d'alerte, §7). Absent = 0. */
  whistleblows?: number;
}

/** A verified fact frozen at a quarter close. Company profits do not decompose personal fortune. */
export type CloseRecapFact =
  | { type: 'netProfit' | 'fines'; companyId: Id; companyName: string; amount: number }
  | { type: 'firstSales' | 'stock'; companyId: Id; companyName: string; productId: Id; productName: string; lots: number }
  | { type: 'bankruptcy'; companyId: Id; companyName: string }
  | { type: 'takeover'; companyId: Id; companyName: string; direction: 'won' | 'lost'; journalTurn: number };

/** Display-only personal baseline. Never used to decide an action or draw randomness. */
export interface CloseFortuneSnapshot {
  positions: { companyId: Id; shares: number; sharePrice: number }[];
  dividendsReceived: number;
  bonusesTaken: number;
  cash?: number;
  debt?: number;
  netWorth?: number;
}

export interface CloseRecapFortune {
  cashBefore?: number;
  cashAfter: number;
  portfolioBefore?: number;
  portfolioAfter: number;
  debtBefore?: number;
  debtAfter: number;
  netWorthBefore?: number;
  holdings: {
    companyId: Id;
    companyName: string;
    sharesBefore?: number;
    sharesAfter: number;
    priceBefore?: number;
    priceAfter: number;
    bought: number;
    sold: number;
  }[];
  dividends?: number;
  bonuses?: number;
  interest?: number;
  tips?: number;
  whistleblowing?: number;
  /** First close can use the opening baseline while previousNetWorth remains absent. */
  breakdown?: CloseRecap['breakdown'];
}

export interface CloseRecapFine {
  cause: 'scandal' | 'cartel';
  amount: number;
  sectorId?: SectorId;
  scandalBefore?: number;
  scandalAfter?: number;
  reputationBefore?: number;
  reputationAfter?: number;
  /** Actions observed this quarter, not an assertion about what caused an accumulated scandal. */
  shadyActions?: ShadyKind[];
}

export interface CloseRecapCompany {
  companyId: Id;
  companyName: string;
  status: CompanyStatus;
  report?: QuarterReport;
  fineCauses: CloseRecapFine[];
  scandalBefore?: number;
  scandalAfter?: number;
  reputationBefore?: number;
  reputationAfter: number;
  priceBefore: number;
  priceAfter: number;
}

export interface CloseRecapSettlements {
  offers: ((Omit<ShareOffer, 'status'> | Omit<ContractOffer, 'status'> | Omit<CartelOffer, 'status'>)
    & { status: OfferStatus | 'expired' })[];
  contracts: (SupplyContract & { outcome: 'delivered' | 'partial' | 'failed' | 'ended' })[];
  events: { event: ArticleEvent; companyIds: Id[]; companyNames: string[]; journalTurn: number }[];
}

/** Latest close, captured before the following quarter's news and bot actions. */
export interface CloseRecap {
  turn: number;
  netWorth: number;
  /** Absent at T1; comparison starts with the second actual close. */
  previousNetWorth?: number;
  /** At most three facts, scoped to the player who receives this recap. */
  facts: CloseRecapFact[];
  /** Signed personal net-worth movements in k; absent until two complete snapshots exist. */
  breakdown?: {
    sharePrices: number;
    dividendsAndBonuses: number;
    personalCosts: number;
    otherMovements: number;
  };
  /** Private display baseline, replaced each close; no effect on the simulation. */
  fortuneSnapshot?: CloseFortuneSnapshot;
  fortune?: CloseRecapFortune;
  companies?: CloseRecapCompany[];
  settlements?: CloseRecapSettlements;
}

export interface PlayerState {
  id: Id;
  name: string;
  isBot: boolean;
  botPersonalityId?: string;
  /** Niveau de ce bot (§10) ; absent = `GameConfig.botLevel`, puis 'normal'. Gardé pendant une reprise en attente. */
  botLevel?: BotLevel;
  /** Reprise d'un bot : l'humain peut agir à partir de ce trimestre seulement. */
  botTakeover?: { previousName: string; activeFromTurn: number };
  color: string;
  cash: number; // fortune personnelle liquide, k€
  debt: number; // prêt personnel (effet de levier), k€
  connected: boolean;
  ready: boolean;
  stats: PlayerStats;
  netWorthHistory: number[]; // valeur nette à la fin de chaque tour résolu
  /** Frozen private recap; absent in older saves and before the first close. */
  closeRecap?: CloseRecap;
  /** Display-only fees since the last close; absent means this quarter was not tracked completely. */
  quarterPersonalCosts?: number;
  /** Detailed fees are optional so old, partially observed quarters stay honest. */
  quarterPersonalCostDetails?: { interest: number; tips: number; whistleblowing: number };
  /** Initial reference for the first report; absent in older saves. */
  openingFortuneSnapshot?: CloseFortuneSnapshot;
  /** Tour où le joueur a été évincé pour la dernière fois (pour l'UI). */
  lastOustedTurn?: number;
  /**
   * Subvention de la start-up de retour en jeu (§7) : le dernier parachute doré reçu, consommé à la fondation.
   * Absent = 0 (la subvention vaut alors STARTUP_SUBSIDY).
   */
  comebackGrant?: number;
  /** Dernier tour où le joueur a lancé une alerte (une par tour, §7). */
  lastWhistleblowTurn?: number;
  /** Tuyaux achetés (§7), du plus ancien au plus récent : le tarif monte avec leur nombre. Absent = aucun. */
  rumorChecks?: RumorCheck[];
  /** Mémoire d'un bot expert (§10) : calibrage de son modèle de demande, produit par produit. Jamais dans une vue. */
  expertMemory?: ExpertMemory;
  /** Un bot « petit patron » n'arrête qu'une fois par partie un produit crypto dans la panique (§10). Jamais dans une vue. */
  cryptoPanicCloseUsed?: boolean;
  /** Private controller-scoped launch-project sequence; excluded from every view. */
  hexLaunchProjectCounter?: number;
}

/**
 * Calibrage d'un bot expert : pour chaque produit, correction (log) de son attractivité, et ce qu'il prévoyait au
 * dernier tour (cote a / A de sa part de marché), pour la comparer à la part obtenue.
 */
export interface ExpertMemory {
  calib: Record<Id, { logk: number; odds: number; turn: number }>;
  /** Dernier tour de sortie crypto par entreprise (§10) : cooldown des ventes et verrou du rachat par consolidate avant le krach. */
  cryptoDump?: Record<Id, number>;
}

/** Réponse d'une source à un tuyau (§7) : la rumeur n° `index` du numéro `turn` est-elle vraie ? */
export interface RumorCheck {
  turn: number;
  index: number;
  truthful: boolean;
}

/**
 * Emplacement de filiale (§5.5 bis) : trois par matière, nommés à la création de la partie, attribués aux enchères.
 * Chacun est un gisement de la carte (§5.8, `DEPOSITS[id]` : position et richesse fixes). L'exploitant est l'entreprise
 * dont `sites` contient une filiale de même `id` ; sans exploitant, il est libre.
 */
export interface SiteSlot {
  id: Id;
  commodityId: CommodityId;
  name: string;
}

/** Issue d'une enchère pour l'entreprise qui a misé. */
export type SiteBidOutcome = 'won' | 'lost' | 'failed';

/**
 * Enchère sous pli fermé sur un gisement précis (§5.5 bis), réglée à la résolution : la plus haute mise sur ce gisement
 * l'emporte et paie la meilleure mise perdante sur ce gisement, ou la mise à prix (jamais plus que sa mise). Une
 * entreprise ne mise qu'une fois par matière.
 */
export interface SiteBid {
  companyId: Id;
  /** Dirigeant qui a misé : l'enchère tombe si l'entreprise change de main avant la clôture. */
  playerId: Id;
  commodityId: CommodityId;
  /** Emplacement visé (`SiteSlot.id`), de cette matière. */
  slotId: Id;
  /** Prix maximal accepté, k. */
  amount: number;
  turn: number;
  /**
   * Issue, renseignée à la résolution et gardée jusqu'à la suivante pour que le joueur la lise. `price` : prix
   * d'adjudication du gisement (payé si `won`) ; `bidders` : nombre d'entreprises en lice sur ce gisement ; `failed` :
   * trésorerie insuffisante, entreprise passée à un autre dirigeant, ou filiale de cette matière déjà possédée.
   */
  result?: { outcome: SiteBidOutcome; price: number; bidders: number };
}

/** Emplacement vu par un joueur (public) : qui l'exploite, s'il l'est. */
export interface SiteSlotView extends SiteSlot {
  companyId?: Id;
}

/** Private launch proposal: no product or plant exists before adjudication. */
export interface HexLaunchProject {
  id: Id;
  sectorId: SectorId;
  name: string;
}

export type HexBidOutcome = 'won' | 'lost' | 'fallback' | 'abandoned' | 'failed';
export interface HexBid {
  kind: 'move' | 'launch' | 'startup' | 'land' | 'factory';
  /** Quoted personal reserve for a bare-land bid, fixed when submitted. */
  reserve?: number;
  companyId: Id;
  playerId: Id;
  hexId: Id;
  amount: number;
  turn: number;
  productId?: Id;
  project?: HexLaunchProject;
  /** Moves never fall back; ignored for that kind. */
  fallback?: 'nearest' | 'abandon';
  result?: { outcome: HexBidOutcome; hexId?: Id; price: number; bidders: number;
    /** Ligne localisée générée par le moteur à la clôture (comme les textes du journal), ex. fin d'incubation. */
    note?: string };
}

/** Public awards contain settlement facts, never a bid or its original fallback target. */
export interface HexAuctionResult {
  hexId: Id;
  companyId: Id;
  playerId: Id;
  kind: HexBid['kind'];
  price: number;
  reserve: number;
  bidders: number;
  fallback: boolean;
  /** An invalid contender dropped out of this direct auction; no identity or bid is revealed. */
  failedContenders?: boolean;
}

/** Filiale d'approvisionnement (§5.5 bis) : extrait une matière chaque trimestre pour son entreprise. */
export interface SupplySite {
  /** Identifiant de l'emplacement occupé (`SiteSlot.id`). */
  id: Id;
  commodityId: CommodityId;
  /** Lots extraits à chaque résolution (tant que la trésorerie paie l'extraction). */
  capacity: number;
  /** Coût d'extraction, k par lot, hors effets de news (voir SupplySiteView.currentUnitCost). */
  unitCost: number;
  /** Premier trimestre dont la résolution produit (le chantier, comme la relance, dure un trimestre). */
  activeFrom: number;
  /** En sommeil : n'extrait plus et paie son entretien à chaque résolution, jusqu'à sa relance. */
  dormant?: boolean;
  /** Prix payé à l'adjudication (k) : la moitié compte dans la valeur comptable, comme une usine (§5.7). Absent = 0. */
  cost?: number;
}

/** Filiale vue par un joueur (publique) : l'état du moteur, plus ce qu'elle coûte ce trimestre. */
export interface SupplySiteView extends SupplySite {
  /** Nom de l'emplacement. */
  name: string;
  /** Coût du lot extrait à la prochaine résolution, effets de news compris (k). */
  currentUnitCost: number;
  /** Entretien d'un trimestre en sommeil (k). */
  upkeep: number;
}

/** Cession d'actions de gré à gré (§7 bis) : hors marché, sans effet sur le cours. */
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'failed';

/** Commun à toutes les offres : qui propose, qui répond, et où en est l'affaire. */
export interface OfferBase {
  id: Id;
  turn: number;
  /** Joueur qui propose, joueur qui répond. */
  fromId: Id;
  toId: Id;
  status: OfferStatus;
}

export interface ShareOffer extends OfferBase {
  kind: 'shares';
  companyId: Id;
  shares: number;
  /** Prix par action, k. */
  price: number;
  /** 'sell' : le proposant vend ; 'buy' : il achète. */
  side: 'sell' | 'buy';
}

/** Contrat de fourniture proposé (§7 bis) : l'entreprise vendeuse livre `lots` lots par trimestre à `price` k le lot. */
export interface ContractOffer extends OfferBase {
  kind: 'contract';
  sellerCompanyId: Id;
  buyerCompanyId: Id;
  commodityId: CommodityId;
  lots: number;
  price: number;
  turns: number;
}

/** Entente sur les prix proposée (§7 bis) entre deux entreprises d'un même secteur. */
export interface CartelOffer extends OfferBase {
  kind: 'cartel';
  companyId: Id;
  targetCompanyId: Id;
  sectorId: SectorId;
}

/** Offre entre joueurs, valable jusqu'à la fin du trimestre. */
export type Offer = ShareOffer | ContractOffer | CartelOffer;

/** Contrat de fourniture en cours : livré à chaque résolution, avant la production. */
export interface SupplyContract {
  id: Id;
  sellerCompanyId: Id;
  buyerCompanyId: Id;
  commodityId: CommodityId;
  lots: number;
  price: number;
  turnsLeft: number;
  /** Lots livrés à la dernière résolution (absent avant la première). */
  lastDelivered?: number;
  /** Dédit payé par le vendeur à la dernière résolution pour les lots manquants (absent = aucun). */
  lastPenalty?: number;
}

/** Entente secrète sur les prix d'un secteur (§7 bis). */
export interface Cartel {
  id: Id;
  sectorId: SectorId;
  /**
   * Membres : une entreprise et le dirigeant qui a signé (l'entente ne survit pas à un changement de dirigeant).
   * `leaving` : sortie demandée ce trimestre, effective à la clôture (le risque du trimestre court encore).
   */
  members: { companyId: Id; controllerId: Id; leaving?: boolean }[];
  since: number;
}

export interface InventoryLine {
  lots: number;
  avgCost: number; // k€ par lot
}

/** Position de l'usine lors des ventes du dernier trimestre clôturé, indépendante de ses déménagements. */
export interface ProductSalesOrigin {
  turn: number;
  zoneId: ZoneId;
  hexId?: Id;
}

export interface ProductProfile {
  id: Id;
  name: string;
  sectorId: SectorId;
  price: number;
  quality: number;
  brand: number;
  marketing: number;
  rnd: number;
  /** Pays the common budgets and supplies their terrain efficiencies. */
  budgetFactoryId: Id;
}

export interface ProductState {
  /** Shared commercial product, distinct from this factory's id. Absent in legacy single-site products. */
  factoryProductId?: Id;
  /** Physical capacity when this factory was built; extensions cannot exceed twice this value. */
  initialCapacity?: number;
  /** Dotation de l'usine de départ ; supprimée définitivement après son départ ou sa fermeture. */
  terrainId?: string;
  /** Destination won at settlement, executed after the quarter's accounts. */
  pendingHexId?: Id;
  /** Land purchase price; half contributes to book value. */
  landCost?: number;
  /** Start-up capital incubator: no occupied cell and no terrain grant. */
  incubator?: boolean;
  /** Position publique de l’usine, présente seulement en mode hexagonal. */
  hexId?: Id;
  id: Id;
  name: string;
  sectorId: SectorId;
  quality: number; // ~1 au lancement, ~2-3 en fin de partie
  brand: number; // notoriété ~0.3 au lancement
  capacity: number; // lots/trimestre
  pendingCapacity: number; // livrée au prochain tour
  stock: number; // lots invendus en stock
  // Décisions (persistent d'un tour à l'autre) :
  price: number; // k€ par lot
  production: number; // lots visés ce tour (plafonné par la capacité)
  marketing: number; // k€ ce tour
  rnd: number; // k€ ce tour
  // Résultats du dernier trimestre :
  lastSales: number;
  /** Absente avant la première clôture ou dans une ancienne sauvegarde. */
  lastSalesOrigin?: ProductSalesOrigin;
  lastProduced: number;
  lastRevenue: number;
  lastMarketShare: number; // 0..1 du marché du secteur (autres concurrents inclus)
  lastUnitCost: number;
  launchedTurn: number;
  /** Lancement différé : premier trimestre de ventes possibles, purement descriptif. */
  firstSalesTurn?: number;
  /** Zone de l'usine (§5.8), publique. Absent = la capitale (`DEFAULT_ZONE`). */
  zoneId?: ZoneId;
  /** Ventes du dernier trimestre par ville (§5.2 bis), publiques ; seulement quand le secteur est régional. */
  lastSalesByCity?: Record<CityId, number>;
  /**
   * Prix en vigueur à la dernière résolution (ou au lancement) : c'est le prix que voient les autres joueurs
   * pendant le tour (décisions cachées jusqu'à la résolution, §12). Absent = `price`.
   */
  lastPrice?: number;
}

export type ModifierKind =
  | 'tax_optimisation'
  | 'greenwashing'
  | 'offshoring'
  | 'lobbying'
  | 'poison_pill_cooldown';

export interface CompanyModifier {
  kind: ModifierKind;
  turnsLeft: number; // décrémenté à chaque résolution, retiré à 0
  sectorId?: SectorId;
  value?: number;
}

/** Détail pur du fret, en k par lot produit ; les km sont ceux facturés (pondérés par le type de route). */
export interface FreightMaterialLeg {
  commodityId: CommodityId;
  source: 'port' | 'site';
  siteId?: Id;
  /** Lots de matière fournis par cette source pour un lot produit. */
  lots: number;
  km: number;
  cost: number;
}
export interface FreightDeliveryLeg {
  city: CityId;
  share: number;
  km: number;
  cost: number;
}
export interface FreightBreakdown {
  sectorId: SectorId;
  /** Id de case, ou de zone en mode classique. */
  hexId: Id;
  zoneId?: ZoneId;
  intangible: boolean;
  transportFactor: number;
  materials: FreightMaterialLeg[];
  delivery: FreightDeliveryLeg[];
  materialsCost: number;
  deliveryCost: number;
  total: number;
}

export interface ProductReport {
  productId: Id;
  /** Immutable physical factory location in network games, so shared product names remain distinguishable. */
  hexId?: Id;
  name: string;
  sectorId: SectorId;
  produced: number;
  sold: number;
  revenue: number;
  marketShare: number;
  unitCost: number;
  /** Actual private close figures; absent in older reports. */
  demand?: number;
  averagePrice?: number;
  margin?: number;
  stockLeft?: number;
  spoiled?: number;
  /** Dont fret absolu, k par lot produit (§5.8). Absent = 0. */
  transport?: number;
  /** Fret payé ce trimestre, en k au total ; absents dans les anciennes sauvegardes. */
  transportMaterials?: number;
  transportDelivery?: number;
  /** Détail historique du fret effectivement payé par lot ; indépendant des décisions et nouvelles suivantes. */
  freight?: FreightBreakdown;
  /** Ventes par ville (§5.2 bis), seulement quand le secteur est régional. */
  byCity?: Record<CityId, number>;
}

export interface QuarterReport {
  turn: number;
  revenue: number;
  cogs: number; // main-d'œuvre + matières consommées + achats d'urgence
  marketing: number;
  rnd: number;
  fixedCosts: number; // frais fixes produits + frais de siège
  interest: number;
  fines: number;
  /** Quote-part des lancements de produit passée en charge ce trimestre (un quart par trimestre, §5.6). Absent = 0. */
  amortization?: number;
  /** Actions discutables et communication de crise du trimestre (§5.6). Absent = 0. */
  specialCharges?: number;
  /** Deductible stock disposal loss, excluded from operating revenue and profitEma. Absent = 0. */
  exceptionalLoss?: number;
  /** Tax saved by the disposal loss, used to exclude its effect from profit-based news. Absent = 0. */
  exceptionalLossTaxBenefit?: number;
  tax: number;
  netProfit: number;
  cashEnd: number;
  debtEnd: number;
  products: ProductReport[];
}

export type CompanyStatus = 'active' | 'bankrupt' | 'merged';

export interface CompanyState {
  /** Commercial profiles shared by several fixed factories. Factory records remain in products for save compatibility. */
  productProfiles?: ProductProfile[];
  /** Independently owned buildable parcels, including occupied ones. */
  land?: { hexId: Id; cost: number }[];
  /** Privilèges du siège ; supprimés par une fusion ou la perte de l'usine de départ. */
  terrainId?: string;
  id: Id;
  name: string;
  ticker: string;
  emoji: string;
  color: string;
  ceoName: string; // nom affiché du PDG (joueur, bot ou PNJ)
  founderId: Id | null; // joueur fondateur (null pour une entreprise PNJ)
  controllerId: Id | null; // joueur aux commandes ; null = pilote automatique PNJ
  npcDefId?: string;
  status: CompanyStatus;
  foundedTurn: number;
  /** Secteur du produit de fondation : une entreprise née crypto reste sensible aux signaux crypto, même diversifiée. */
  foundedSectorId?: SectorId;
  cash: number;
  debt: number;
  sharesOutstanding: number;
  holdings: Record<Id, number>; // playerId -> actions ; flottant = sharesOutstanding - somme
  sharePrice: number; // k€ par action
  priceHistory: number[]; // prix en fin de chaque tour résolu (index 0 = prix initial)
  sentiment: number; // multiplicateur propre, revient vers 1
  reputation: number; // 0.5..1.3, affecte l'attractivité
  scandal: number; // 0..100, jauge cachée
  profitEma: number; // bénéfice trimestriel lissé
  revenueEma: number; // CA trimestriel lissé
  products: ProductState[];
  inventory: Partial<Record<CommodityId, InventoryLine>>;
  modifiers: CompanyModifier[];
  reports: QuarterReport[]; // un par tour résolu
  /**
   * Lancements en cours d'étalement dans le compte de résultat (§5.6) : chaque ligne passe `perTurn`
   * en charge à chaque résolution, `turnsLeft` fois encore. Absent = aucun.
   */
  launchCharges?: { perTurn: number; turnsLeft: number }[];
  /** Nombre maximal de produits actifs : MAX_PRODUCTS_MERGED après une fusion (§7). Absent = MAX_PRODUCTS. */
  productSlots?: number;
  /** Filiales d'approvisionnement (§5.5 bis) : puits, mines, raffineries, fonderies. Absent = aucune. */
  sites?: SupplySite[];
  /** Clôtures passées dans une entente sur les prix (§7 bis), jamais remises à zéro ; secret (absent de la vue). */
  cartelQuarters?: number;
  /** Impôt du dernier trimestre clos, payé en tête de la clôture suivante ; une dette d'ici là (§5.7). Absent = 0. */
  taxDue?: number;
  /** Amendes et dédits de contrat du dernier trimestre clos, payés en tête de la clôture suivante (§5.7). Absent = 0. */
  finesDue?: number;
  /** Compteurs remis à zéro à chaque tour. */
  turnFlags: {
    bonusTaken: number; // k€ de bonus pris ce tour
    buybackDone: boolean;
    shadyDone: ShadyKind[];
    /** k€ empruntés par l'entreprise ce tour (exclus de la base du bonus et du dividende). */
    borrowed?: number;
    /** Actions bloquées jusqu'à la fin du tour (pilule empoisonnée), par joueur. */
    lockedShares?: Record<Id, number>;
    /** Vrai le tour de la création d'une start-up : ni bonus, ni dividende, ni revente par le fondateur. */
    justFounded?: boolean;
    /** Communication de crise déjà faite ce tour (une seule par tour). */
    crisisDone?: boolean;
    /** k€ d'actions discutables et de communication de crise ce tour : passés en charge à la résolution. */
    specialCharges?: number;
    /** Stock loss on discontinued products: deductible, with no further cash payment or profitEma effect. */
    exceptionalLoss?: number;
    /** Actions achetées ce tour par le contrôleur de l'entreprise (délit d'initié), par joueur. */
    insiderBought?: Record<Id, number>;
    /**
     * Joueurs qui ont cédé le contrôle de l'entreprise ce tour en vendant leurs actions : leurs rachats du tour
     * comptent comme délit d'initié, et ils ne peuvent pas fonder la start-up de retour en jeu ce tour (§6.2, §7).
     */
    exControllers?: Id[];
  };
}

export interface SectorState {
  id: SectorId;
  demandMultiplier: number; // marche aléatoire, ~1
  outsideQuality: number; // qualité des concurrents hors jeu, croît avec le temps
  demandHistory: number[]; // demande totale effective par tour
  lastTotalDemand: number;
  /** Price response applied to the last total demand, for intrinsic-demand momentum. */
  lastMarketPriceMultiplier?: number;
}

export interface CommodityState {
  id: CommodityId;
  price: number; // k€ par lot, prix spot
  priceHistory: number[]; // prix en fin de tour (index 0 = initial)
}

export interface MacroState {
  baseInterestRate: number; // par trimestre, ex. 0.012
  baseTaxRate: number; // ex. 0.25
  marketSentiment: number; // multiplicateur global, revient vers 1
}

export type ActiveEffectKind =
  | 'sectorDemand'
  | 'commoditySupply'
  | 'siteCost'
  | 'interestRate'
  | 'taxRate'
  | 'laborCost'
  | 'zoneLabor'
  | 'transportCost'
  | 'terrain'
  | 'heat';

export interface ActiveEffect {
  terrain?: string;
  lever?: TerrainLever;
  suspend?: boolean;
  scope?: 'all' | 'mountain' | CityId;
  productId?: Id;
  id: Id;
  newsId: string;
  kind: ActiveEffectKind;
  sectorId?: SectorId | 'all';
  commodityId?: CommodityId;
  /** Zone visée (effet 'zoneLabor'). */
  zoneId?: ZoneId;
  value: number; // multiplicateur ou delta selon le type
  turnsLeft: number;
}

/**
 * Nature de l'événement qu'un article rapporte (flashs « Dernière minute » et résultats du trimestre),
 * indépendante de la langue : le client en tire la chronologie de la partie. Les news, les citations
 * et l'édito n'en ont pas.
 */
export type ArticleEventType =
  | 'takeover' // prise de contrôle par achat d'actions (OPA)
  | 'controlHandover' // le dirigeant a tout vendu : le plus gros actionnaire joueur prend la main
  | 'autopilot' // le dirigeant a tout vendu, personne ne reprend : pilote automatique
  | 'stakeBuilding' // un joueur franchit 25 % ou 40 % d'une entreprise qu'il ne dirige pas
  | 'insiderBuying' // le dirigeant rachète massivement sa propre entreprise
  | 'startup'
  | 'whistleblow' // source anonyme : jamais d'actorId
  | 'productLaunch'
  | 'dividend'
  | 'ceoBonus'
  | 'buyback'
  | 'poisonPill'
  | 'merger' // companyIds = [absorbante, absorbée]
  | 'bigProfit'
  | 'bigLoss'
  | 'bankruptcy'
  | 'scandal'
  | 'marginCall'
  | 'rumorLeak' // un joueur surpris à acheter un tuyau : la source a parlé
  | 'siteOpened' // une entreprise ouvre une filiale d'approvisionnement
  | 'blockSale' // cession d'actions de gré à gré entre joueurs (actorId = acheteur, subjectId = vendeur)
  | 'cartelBusted' // entente sur les prix découverte : companyIds = membres, leaderIds = leurs dirigeants
  | 'insiderSale'; // le dirigeant avait vendu sa ligne avant le krach crypto (actorId = vendeur, subjectId = entreprise)

export interface ArticleEvent {
  type: ArticleEventType;
  /** Joueur qui agit (acquéreur, fondateur, PDG…), s'il est nommé par l'article. */
  actorId?: Id;
  /** Joueur qui subit (PDG évincé, vendeur, dirigeant d'une entreprise en faillite, victime d'un appel de marge). */
  subjectId?: Id;
  /**
   * Résultats du trimestre (meilleur bénéfice, pire perte, scandale) : dirigeant de l'entreprise quand ses comptes
   * ont été arrêtés. Ces articles paraissent au numéro suivant, après une faillite ou une passation de la résolution.
   */
  leaderId?: Id;
  /** Même chose pour un article qui cite plusieurs entreprises (entente découverte). */
  leaderIds?: Id[];
  /** Matière (filiale ouverte). */
  commodityId?: CommodityId;
  /** Produit lancé. */
  productId?: Id;
  /** Montant en k (parachute, dividende, bonus, rachat, bénéfice, perte, amende, ventes forcées). */
  amount?: number;
  /** Part du capital (0..1) : prise de contrôle, montée au capital, achat d'initié. */
  pct?: number;
}

export interface Article {
  id: Id;
  title: string;
  body: string;
  tone: Tone;
  /** 'flash' = publié pendant le tour (Dernière minute). */
  kind: 'headline' | 'news' | 'results' | 'flash' | 'quote';
  companyIds?: Id[];
  sectorIds?: SectorId[];
  commodityIds?: CommodityId[];
  /** Événement rapporté, en données structurées (même contenu dans toutes les langues). */
  event?: ArticleEvent;
}

export type RumorReliability = 'faible' | 'moyenne' | 'élevée';

export interface Rumor {
  text: string;
  reliability: RumorReliability;
}

export interface JournalIssue {
  turn: number;
  dateLabel: string; // « T3 2027 »
  articles: Article[]; // le premier de kind 'headline' est la une
  rumors: Rumor[];
}

/** Nouvelle programmée pour le tour suivant (cachée aux joueurs). */
export interface ScheduledNews {
  turn: number;
  cardId: string;
  /** Frozen demand effect of a forced crypto euphoria card; never sent to clients. */
  cryptoMultiplier?: number;
}

/** Vente d'actions enregistrée pour les brèves « délit d'initié » d'un krach crypto (conservée deux trimestres). */
export interface ShareSale {
  turn: number;
  playerId: Id;
  companyId: Id;
  shares: number;
  /** Ligne du vendeur juste avant cette vente. */
  holdingBefore: number;
  /** Le vendeur contrôlait l'entreprise au moment de la vente. */
  sellerController: boolean;
  /** L'entreprise avait un produit crypto au moment de la vente : fermer la ligne ensuite n'efface pas le délit. */
  hadCryptoLine: boolean;
}

/** Achat d'actions enregistré pour neutraliser les allers-retours du calcul de délit d'initié crypto (idem, deux trimestres). */
export interface SharePurchase {
  turn: number;
  playerId: Id;
  companyId: Id;
  shares: number;
}

export interface TrophyAward {
  trophyId: TrophyId;
  playerId: Id;
  value: number;
}

export interface FinalResults {
  ranking: { playerId: Id; netWorth: number }[];
  trophies: TrophyAward[];
}

export interface GameState {
  /** Opening listed crypto price, used only as the baseline of the first realized sale. */
  openingCryptoPrice?: number;
  /** Hidden sector-wide bubble, initialized on the first close (old saves remain valid). */
  cryptoMarket?: {
    momentum: number;
    bubble: number;
    volatility: number;
    lastGrowth: number;
    cooldown: number;
    /** Previous realized demand after stripping active news multipliers. */
    lastUnderlyingDemand?: number;
    /** Previous sales-weighted crypto price; carried forward if nobody sold. */
    lastAveragePrice?: number;
  };
  /** Ventes d'actions du trimestre en cours et du précédent (brèves « délit d'initié » au krach crypto). */
  shareSales: ShareSale[];
  /** Achats d'actions de la même fenêtre : ils neutralisent les ventes du calcul de délit d'initié crypto. Absent sur les vieilles sauvegardes. */
  shareBuys?: SharePurchase[];
  /** L'attribution historique est conservée après déménagement, fusion et faillite. */
  terrainAssignments?: Record<string, { companyId: Id; playerId: Id; productId: Id }>;
  config: GameConfig;
  turn: number; // tour en cours de jeu (1..totalTurns)
  phase: 'playing' | 'finished';
  rngState: number;
  nextId: number;
  players: Record<Id, PlayerState>;
  companies: Record<Id, CompanyState>;
  sectors: Record<SectorId, SectorState>;
  commodities: Record<CommodityId, CommodityState>;
  macro: MacroState;
  activeEffects: ActiveEffect[];
  /** Offres entre joueurs du trimestre en cours (§7 bis) ; elles expirent à la résolution. Absent = aucune. */
  offers?: Offer[];
  /** Contrats de fourniture en cours. Absent = aucun. */
  contracts?: SupplyContract[];
  /** Ententes sur les prix en cours (secrètes). Absent = aucune. */
  cartels?: Cartel[];
  /** Emplacements de filiale, nommés à la création (§5.5 bis). */
  siteSlots?: SiteSlot[];
  /** Enchères sur les filiales : en cours (secrètes) ou réglées à la dernière clôture. Absent = aucune. */
  siteBids?: SiteBid[];
  /** Secret pending cell bids, or their outcomes retained until the next settlement. */
  hexBids?: HexBid[];
  /** Public awards of the last close, refreshed by every hex settlement. */
  hexAuctionResults?: HexAuctionResult[];
  journal: JournalIssue[]; // un numéro par tour, le dernier = tour en cours
  scheduledNews: ScheduledNews[];
  recentNewsIds: string[]; // pour éviter les répétitions
  /**
   * Origine cachée des rumeurs publiées, par tour : clés parallèles à `journal[i].rumors`
   * ('news:<cardId>' pour une vraie rumeur, 'fake:<fakeRumorId>' pour une fausse).
   * Sert aux bots et à l'anti-répétition sans dépendre du texte (donc de la langue). Jamais exposé dans la vue.
   */
  rumorKeys?: Record<number, string[]>;
  results?: FinalResults;
}

// ---------------------------------------------------------------------------
// Actions (validées et appliquées immédiatement par applyAction)
// ---------------------------------------------------------------------------

export type Action =
  // --- Perso (fortune personnelle du joueur) ---
  | { type: 'buyShares'; companyId: Id; shares: number }
  | { type: 'sellShares'; companyId: Id; shares: number }
  | { type: 'takePersonalLoan'; amount: number }
  | { type: 'repayPersonalLoan'; amount: number }
  | { type: 'foundStartup'; name: string; sectorId: SectorId; investment: number; hexId?: Id; bid?: number; fallback?: 'nearest' | 'abandon' } // retour en jeu : sans entreprise contrôlée
  | { type: 'whistleblow'; companyId: Id } // lanceur d'alerte : 500 k perso, +15 de jauge, niveau publié
  | { type: 'checkRumor'; turn: number; index: number } // tuyau : une source dit, au seul payeur, si une rumeur du numéro est vraie
  | { type: 'bidSite'; companyId: Id; slotId: Id; amount: number } // enchère sur un gisement, pour une filiale (§5.5 bis)
  | { type: 'cancelSiteBid'; companyId: Id; commodityId: CommodityId } // retire sa mise avant la clôture
  | { type: 'setSiteDormant'; companyId: Id; commodityId: CommodityId; dormant: boolean } // mise en sommeil (entretien) ou relance (un trimestre)
  | { type: 'offerShares'; companyId: Id; counterpartyId: Id; shares: number; price: number; side: 'sell' | 'buy' } // cession de gré à gré (§7 bis)
  | { type: 'offerContract'; sellerCompanyId: Id; buyerCompanyId: Id; commodityId: CommodityId; lots: number; price: number; turns: number } // contrat de fourniture
  | { type: 'proposeCartel'; companyId: Id; targetCompanyId: Id; sectorId: SectorId } // entente sur les prix
  | { type: 'answerOffer'; offerId: Id; accept: boolean }
  | { type: 'cancelOffer'; offerId: Id }
  | { type: 'leaveCartel'; companyId: Id; sectorId: SectorId }
  // --- Entreprise (le joueur doit être controllerId de companyId) ---
  | {
      type: 'setProductDecisions';
      companyId: Id;
      productId: Id;
      price?: number;
      production?: number;
      marketing?: number;
      rnd?: number;
    }
  | { type: 'launchProduct'; companyId: Id; sectorId: SectorId; name: string; zoneId?: ZoneId; hexId?: Id; bid?: number; fallback?: 'nearest' | 'abandon' } // usine à la capitale par défaut (§5.8)
  | ({ type: 'moveFactory'; companyId: Id; productId: Id; bid?: number; fallback?: 'nearest' | 'abandon' } & ({ zoneId: ZoneId; hexId?: Id } | { hexId: Id; zoneId?: ZoneId })) // gratuit le trimestre où le produit démarre en classique (§5.8)
  | { type: 'cancelHexBid'; companyId: Id; productId?: Id; projectId?: Id; hexId?: Id }
  | { type: 'discontinueProduct'; companyId: Id; productId: Id }
  | { type: 'expandCapacity'; companyId: Id; productId: Id; lots: number }
  | { type: 'bidLand'; companyId: Id; hexId: Id; bid: number }
  | { type: 'sellLand'; companyId: Id; hexId: Id }
  | { type: 'buildFactory'; companyId: Id; productId: Id; hexId: Id; bid?: number }
  | { type: 'buyCommodity'; companyId: Id; commodityId: CommodityId; lots: number }
  | { type: 'sellCommodity'; companyId: Id; commodityId: CommodityId; lots: number }
  | { type: 'takeLoan'; companyId: Id; amount: number }
  | { type: 'repayLoan'; companyId: Id; amount: number }
  | { type: 'payDividend'; companyId: Id; amount: number }
  | { type: 'ceoBonus'; companyId: Id; amount: number }
  | { type: 'buyback'; companyId: Id; shares: number }
  | { type: 'poisonPill'; companyId: Id }
  | { type: 'crisisComms'; companyId: Id }
  | {
      type: 'shady';
      companyId: Id;
      kind: ShadyKind;
      targetCompanyId?: Id; // espionnage, campagne de dénigrement
      sectorId?: SectorId; // lobbying
    }
  | { type: 'merge'; absorberId: Id; targetId: Id };

export type ActionType = Action['type'];

export interface ActionResult {
  ok: boolean;
  /** Message en français, satirique si possible, affiché en toast. */
  message: string;
}

// ---------------------------------------------------------------------------
// Vue joueur (ce que le serveur envoie à chaque client)
// ---------------------------------------------------------------------------

export type ScandalLevel = 'faible' | 'moyen' | 'élevé';

export interface PublicPlayer {
  id: Id;
  name: string;
  isBot: boolean;
  /** Niveau d'un bot (réglé au salon, public comme au salon) ; absent pour un humain. */
  botLevel?: BotLevel;
  /** Informations publiques de la reprise, sans personnalité ni données internes du bot. */
  botTakeover?: { previousName: string; activeFromTurn: number };
  /** Personnalité d'un bot (déjà publique au salon) ; présente aussi pour un bot repris par un humain (§11). */
  botPersonalityId?: string;
  color: string;
  cash: number;
  debt: number;
  portfolioValue: number;
  netWorth: number;
  connected: boolean;
  ready: boolean;
  controlledCompanyIds: Id[];
  netWorthHistory: number[];
  stats: PlayerStats;
}

/**
 * Estimation des ventes d'un produit au prix actuel (§5.2), avec le modèle de demande et les prix connus
 * (ceux des rivaux au dernier trimestre). Aide pour les débutants : ce n'est pas une promesse.
 */
export interface SalesEstimate {
  demand: number; // lots demandés au produit
  sales: number; // lots vendus (plafonnés par stock + production)
  revenue: number; // k
  /** Marge du produit : CA − production × coût unitaire estimé − marketing − R&D − frais fixes du produit. */
  margin: number;
}

/** Données de marché d'un secteur vues par le contrôleur d'un produit, pour recalculer l'estimation à un autre prix. */
export interface MarketEstimateInputs {
  /** A shared product's attraction is counted once across its active factories. */
  attractivenessWeight?: number;
  /** Only the budget-owning factory bears the shared product's marketing and R&D. */
  budgetShare?: number;
  perishabilityMultiplier?: number;
  /** Multiplie la demande propre à cette usine après le logit. */
  demandMultiplier?: number;
  /**
   * Multiplie le prix du produit dans son attractivité seulement (levier « prix perçus ») : le chiffre
   * d'affaires et la masse Σ(attractivité × prix) restent au prix complet.
   */
  priceMultiplier?: number;
  /** Position du plateau ; sa présence sélectionne la demande par case. */
  hexId?: Id;
  /** Efficacité des budgets (1 par défaut), partagée avec les estimations côté client. */
  rndMultiplier?: number;
  marketingMultiplier?: number;
  demand: number; // demande attendue du secteur ce trimestre (lots)
  othersAttractiveness: number; // Σ attractivité des autres produits (prix connus) + « autres concurrents »
  /** National Σ(attractiveness × known price), outside competitors at the sector reference price. */
  othersPriceAttractiveness?: number;
  reputation: number;
  bonus: number; // 1,3 si greenwashing actif, sinon 1
  unitCost: number; // coût unitaire estimé
  fixedCost: number;
  /** Σ attractivité des autres, ville par ville (§5.2 bis) : présent quand un autre produit du secteur est hors de la capitale. */
  othersByCity?: Record<CityId, number>;
  /** Zone de l'usine du produit (absent : la capitale). */
  zoneId?: ZoneId;
}

/** Entrées de terrain projetées par trimestre, sans inventer de nouvelles futures. */
export interface TerrainProjection {
  hexId?: Id;
  unitCost: number;
  fixedCost: number;
  rndMultiplier: number;
  marketingMultiplier: number;
  demandMultiplier: number;
  perishabilityMultiplier: number;
  priceMultiplier: number;
}

export interface ProductView {
  factoryProductId?: Id;
  capacityLimit?: number;
  hexId?: Id;
  landCost?: number;
  incubator?: boolean;
  id: Id;
  name: string;
  sectorId: SectorId;
  quality: number;
  brand: number;
  capacity: number;
  /**
   * Prix en rayon. Pour une entreprise que le joueur ne contrôle pas, c'est le prix du trimestre précédent :
   * les décisions de production restent cachées jusqu'à la résolution (§12).
   */
  price: number;
  /** Vrai pour un produit lancé ce tour : capacité en commande, il ne vend qu'à partir du trimestre suivant. */
  comingSoon?: boolean;
  lastSales: number;
  /** Position publique au moment des dernières ventes ; une absence historique reste inconnue. */
  lastSalesOrigin?: ProductSalesOrigin;
  lastRevenue: number;
  lastMarketShare: number;
  launchedTurn: number;
  /** Présent pour un lancement différé ; distingue son installation d'une vraie absence de ventes. */
  firstSalesTurn?: number;
  /** Zone de l'usine (§5.8), publique. Absent = la capitale. */
  zoneId?: ZoneId;
  /** Ventes du dernier trimestre par ville (§5.2 bis), publiques ; seulement quand le secteur est régional. */
  lastSalesByCity?: Record<CityId, number>;
  /** Présents uniquement si le joueur contrôle l'entreprise. */
  private?: {
    terrainEffects?: TerrainEffect[];
    /** Du trimestre courant à la fin ; les privilèges et nouvelles expirent à leur date connue. */
    terrainProjection?: TerrainProjection[];
    pendingHexId?: Id;
    pendingCapacity: number;
    stock: number;
    production: number;
    marketing: number;
    rnd: number;
    lastProduced: number;
    lastUnitCost: number;
    estimatedUnitCost: number; // coût unitaire estimé : inventaire au coût moyen, le reste au prix spot × prime d'achat d'urgence
    /** Dont fret absolu, k par lot (§5.8 : matières premières et livraison). */
    estimatedTransport: number;
    /** Chaleur vendue, k par lot produit (mode hexagonal seulement). */
    heatCredit?: number;
    /** Positions théoriques sur toutes les cases pour le joueur ; sélection candidate pour les bots. */
    hexes?: { unitCost: Record<Id, number>; moveCost: number; demand?: Record<Id, number> };
    /**
     * Coût unitaire estimé si l'usine était dans chaque zone (§5.8), aux mêmes décisions : pour choisir où déménager.
     * `moveCost` : ce que coûterait le déménagement ce trimestre (0 le trimestre où le produit démarre).
     * `demand` : demande estimée du produit si l'usine était dans chaque zone, aux décisions actuelles (§5.2 bis), pendant
     * la partie ; celle de la zone actuelle est celle de `estimate`.
     */
    zones: { unitCost: Record<ZoneId, number>; moveCost: number; demand?: Record<ZoneId, number> };
    /** Ventes et marge estimées aux décisions actuelles (§5.2). */
    estimate?: SalesEstimate;
    /** Entrées de l'estimation, pour la recalculer à un autre prix (`estimateSales`). */
    market?: MarketEstimateInputs;
  };
}

export interface CompanyView {
  land?: { hexId: Id; cost: number; vacant: boolean; upkeep: number }[];
  scandalMultiplier?: number;
  terrainId?: string;
  /** Taux public national/siège avec nouvelles locales, sans optimisation privée. */
  taxRate?: number;
  /** Taux durable du siège, sans optimisation ni nouvelle fiscale locale temporaire. */
  horizonSeatTaxRate?: number;
  id: Id;
  name: string;
  ticker: string;
  emoji: string;
  color: string;
  ceoName: string;
  founderId: Id | null;
  controllerId: Id | null;
  status: CompanyStatus;
  /** Secteur de fondation (public : la genèse d'une entreprise se lit dans ses vieux journaux). */
  foundedSectorId?: SectorId;
  sharesOutstanding: number;
  holdings: Record<Id, number>;
  floatShares: number;
  sharePrice: number;
  marketCap: number;
  priceHistory: number[];
  reputation: number;
  scandalLevel: ScandalLevel;
  cash: number; // public (sociétés cotées)
  debt: number;
  products: ProductView[];
  reports: QuarterReport[];
  /** Nombre maximal de produits actifs (6 après une fusion, sinon 4). */
  maxProducts?: number;
  /** Filiales d'approvisionnement (publiques : un puits se voit de loin). Absent = aucune. */
  sites?: SupplySiteView[];
  /** Valorisation (§6.1) : cours ≈ (valeur comptable + 40 × bénéfice lissé) / actions (multiple 8 sur les pertes). */
  valuation?: { bookValue: number; smoothedProfit: number; perShare: number };
  /** Présents uniquement si le joueur contrôle l'entreprise. */
  private?: {
    /** Private projects consume product slots without revealing a future launch to rivals. */
    launchProjects?: HexLaunchProject[];
    pendingHexCommitment?: number;
    /** Taux effectif privé, optimisation comprise, en mode hexagonal. */
    taxRate?: number;
    /** Taux projetés du trimestre courant à la fin, avec expiration des effets connus. */
    taxRateHorizon?: number[];
    scandal: number;
    inventory: Partial<Record<CommodityId, InventoryLine>>;
    modifiers: CompanyModifier[];
    loanLimit: number; // montant encore empruntable
    maxBonus: number; // bonus encore possible ce tour
    /** k€ de lancements restant à passer en charge dans les prochains comptes de résultat (§5.6). */
    launchChargesLeft?: number;
    /** k€ de lancements qui passeront en charge à la prochaine résolution (§5.6). */
    launchChargesNext?: number;
    turnFlags: CompanyState['turnFlags'];
    /** Ce que la trésorerie paiera à la prochaine clôture si rien ne change (§5.7). */
    closePlan?: ClosePlan;
  };
}

/**
 * Clôture prévue d'une entreprise (§5.7), si rien ne change d'ici là. En tête de clôture, la trésorerie paie les
 * obligations (faillite si elle ne les couvre pas) ; tout le reste se paie avec ce qui reste et les ventes du
 * trimestre, la trésorerie de fin de trimestre ne passant jamais sous zéro : les mises aux enchères d'abord, puis la
 * production, le marketing et la R&D, enfin l'extraction en surplus. Ce qui ne peut pas être payé ne se fait pas.
 * Les ventes sont celles qu'on peut prévoir (demande attendue, prix connus des rivaux) : une estimation.
 */
export interface ClosePlan {
  /** Trésorerie maintenant. */
  cash: number;
  obligations: {
    /** Siège, coûts fixes des produits, entretien des filiales en sommeil. */
    fixed: number;
    interest: number;
    /** Impôt du trimestre précédent. */
    taxDue: number;
    /** Amendes et dédits du trimestre précédent. */
    finesDue: number;
    /** Achats prévus par les contrats de fourniture (livraison complète). */
    contracts: number;
    total: number;
  };
  /** Mises aux enchères en cours de son dirigeant, réglées en fin de trimestre (au plus ce montant). */
  bids: number;
  /** Part des mises que la trésorerie de fin de trimestre devrait couvrir. */
  bidsCovered: number;
  /**
   * Production : lots prévus (plafonnés à la capacité) et lots payés, coût prévu et coût payé (extraction pour les
   * besoins et les contrats à livrer, achats d'urgence, main-d'œuvre).
   */
  production: { planned: number; funded: number; plannedCost: number; cost: number };
  /** Lots payés, par produit. */
  lots: Record<Id, number>;
  /** Marketing et R&D : prévus, payés. */
  marketing: { planned: number; funded: number };
  /** Ventes attendues du trimestre : si tout ce qui est prévu se fait, et avec ce qui sera payé. */
  sales: { planned: number; funded: number };
  /** Un écart type de la demande du trimestre, en ventes : ce dont elles peuvent décevoir sans surprise. */
  margin: number;
  /** Extraction de chaque filiale en service : pour les besoins, en surplus vers le stock, capacité. */
  sites: { siteId: Id; commodityId: CommodityId; needed: number; surplus: number; capacity: number }[];
  /** Ce qui manque pour tout payer (obligations, mises, production, marketing) avec les ventes attendues ; 0 sinon. */
  shortfall: number;
  /**
   * Emprunt qui comble ce manque, intérêts en plus compris (le taux monte avec la dette) ; 0 si rien ne manque. Sans
   * plafond : les banques prêtent au plus `loanLimit`.
   */
  loan: number;
  /** Ce qui manquerait si les ventes déçoivent d'un écart type (`margin`) ; 0 sinon. */
  safeShortfall: number;
  /** Emprunt qui comble `safeShortfall`, intérêts en plus compris. */
  safeLoan: number;
  /** La trésorerie ne couvre pas les obligations : faillite à la clôture. */
  bankrupt: boolean;
}

export interface SectorView {
  id: SectorId;
  name: string;
  emoji: string;
  description: string;
  refPrice: number;
  demandMultiplier: number;
  demandHistory: number[];
  lastTotalDemand: number;
  /** Public expected national demand before market-price response, current quarter onward.
   * Known news expiry and visible lobbying are included; absent in older snapshots. */
  expectedDemandHorizon?: number[];
  /** Last closed national market-price demand response (absent in older snapshots means 1). */
  lastMarketPriceMultiplier?: number;
  launchCost: number;
  capacityCost: number;
  laborCost: number;
  inputs: Partial<Record<CommodityId, number>>;
  /** Parts de marché du dernier trimestre (produits en jeu + « autres »). */
  shares: { productId: Id | 'others'; companyId: Id | null; name: string; share: number }[];
  /**
   * Estimation pour un lancement dans ce secteur (réglages de départ sectoriels, prix connus des rivaux) :
   * bénéfice trimestriel attendu du produit et trimestres pour rentabiliser le lancement (un trimestre d'attente
   * compris ; null si le produit ne serait pas rentable).
   */
  launchEstimate?: { quarterlyProfit: number; paybackQuarters: number | null };
  /** La même estimation selon la zone de la nouvelle usine (§5.8), avec son coût unitaire. */
  launchByZone?: Record<ZoneId, { unitCost: number; quarterlyProfit: number; paybackQuarters: number | null; demand: number }>;
  /** Usines théoriques sur toutes les cases en mode hexagonal ; disponibilité donnée séparément par hexes.free. */
  launchByHex?: Record<Id, { unitCost: number; quarterlyProfit: number; paybackQuarters: number | null; demand: number; demandByCity?: Record<CityId, number> }>;
}

export interface CommodityView {
  id: CommodityId;
  name: string;
  emoji: string;
  unit: string;
  price: number;
  priceHistory: number[];
  /** Multiplicateur du coût d'extraction des filiales de la matière (news en cours, §5.5 bis). Absent = 1. */
  siteCostFactor?: number;
}

export interface PlayerView {
  terrains?: TerrainView[];
  /** Occupation publique par entreprise active et toutes les cases constructibles libres. */
  hexes?: { occupied: Record<Id, Id>; free: Id[]; reserve: Record<Id, number>; landReserve?: Record<Id, number>; results: HexAuctionResult[];
    /** Read-only estimated national population shares; their sum is 1. Absent in older snapshots. */
    populationShare?: Record<Id, number> };
  you: Id;
  config: GameConfig;
  turn: number;
  dateLabel: string;
  phase: GameState['phase'];
  players: PublicPlayer[];
  companies: CompanyView[];
  /** Les emplacements de filiale et leur exploitant (publics, §5.5 bis). */
  siteSlots: SiteSlotView[];
  sectors: SectorView[];
  commodities: CommodityView[];
  interestRate: number; // taux effectif trimestriel de base (avec effets)
  taxRate: number; // taux effectif (avec effets)
  /** Multiplicateur du prix du transport ce trimestre (news « transportCost », §5.8 ; public, comme le journal). Absent = 1. */
  transportFactor?: number;
  marketSentiment: number;
  personalLoanLimit: number; // montant encore empruntable à titre perso
  journal: JournalIssue[];
  results?: FinalResults;
  /** Rempli par le serveur : timestamp (ms) de fin du tour en cours. */
  turnEndsAt?: number;
  /** Données propres au joueur qui regarde (absent pour un spectateur). */
  self?: {
    /** Only this player's frozen latest close; never inferred from current prices or controllers. */
    closeRecap?: CloseRecap;
    /** Subvention de la start-up de retour en jeu : max(STARTUP_SUBSIDY, dernier parachute reçu) (§7). */
    startupSubsidy: number;
    /** Vrai si le joueur a déjà lancé une alerte ce trimestre (une par tour, §7). */
    whistleblownThisTurn: boolean;
    /** Tarif d'un tuyau ce trimestre (k), propre à ce joueur (§7). */
    rumorCheckPrice: number;
    /** Ses tuyaux, avec la réponse de la source (lui seul la voit). Absent = aucun. */
    rumorChecks?: RumorCheck[];
    /** Offres du trimestre qu'il a faites ou reçues (§7 bis). Absent = aucune. */
    offers?: Offer[];
    /** Contrats de fourniture de ses entreprises. Absent = aucun. */
    contracts?: SupplyContract[];
    /** Ses enchères sur les filiales, en cours ou réglées à la dernière clôture (les autres restent secrètes). Absent = aucune. */
    siteBids?: SiteBid[];
    hexBids?: HexBid[];
    /** Ententes où il a une entreprise, avec le risque d'être découvertes à la prochaine résolution. Absent = aucune. */
    cartels?: (Cartel & { risk: number })[];
    /**
     * Entreprises dont le joueur a cédé le contrôle en vendant ce trimestre : les racheter compte comme délit
     * d'initié, et la start-up de retour en jeu attend le trimestre suivant (§6.2, §7). Absent = aucune.
     */
    soldControlThisTurn?: Id[];
  };
}
