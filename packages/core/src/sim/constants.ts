/**
 * Paramètres numériques du moteur (cf. docs/GAME_DESIGN.md).
 * Toute modification d'une valeur qui figure dans la spec doit être reportée dans la doc.
 * Réexporté par src/index.ts : le client peut s'en servir pour afficher coûts et plafonds.
 */
import type { RumorReliability, ShadyKind } from '../types';

// --- Démarrage (§4) ---
export const COMPANY_START_CASH = 12_000;
export const START_SHARES = 10_000;
export const FOUNDER_STAKE = 0.4;
export const PLAYER_START_CASH = 4_000;
export const START_QUALITY = 1;
export const START_BRAND = 0.3;
export const START_PRODUCTION_RATIO = 0.8;
export const START_MARKETING_RATIO = 0.015; // × taille du marché
export const START_RND_RATIO = 0.01; // × taille du marché

// --- Économie réelle (§5) ---
export const HQ_COST = 250;
export const EMERGENCY_PURCHASE_PREMIUM = 1.1; // spec initiale 1,25 : cf. GAME_DESIGN §5.3 (équilibrage)
export const OFFSHORING_LABOR_MULT = 0.7;
export const GREENWASHING_BONUS = 1.3;
export const LOBBYING_MULT = 1.15;
export const OUTSIDE_QUALITY_GROWTH = 0.04;
export const DEMAND_MEAN_REVERSION = 0.85; // exposant du retour vers 1 en log
export const MARKETING_SCALE_RATIO = 0.02;
export const RND_SCALE_RATIO = 0.05;
export const COMMODITY_FLOOR_RATIO = 0.2; // plancher = 20 % du prix de base
export const COMMODITY_CAP_RATIO = 10; // plafond de sûreté = 10 × prix de base
export const COMMODITY_SELL_DISCOUNT = 0.95;

// --- Finances (§5.6, §5.7) ---
export const BASE_INTEREST_RATE = 0.012;
export const BASE_TAX_RATE = 0.25;
export const OPTIMISED_TAX_RATE = 0.05;
export const MAX_TAX_RATE = 0.9;
export const MAX_COMPANY_RATE = 0.25; // plafond de sûreté du taux trimestriel d'une entreprise
export const LOAN_REVENUE_MULT = 3;
export const LOAN_BOOK_MULT = 0.5;

// --- Bourse (§6) ---
export const PE_MULTIPLE = 40; // multiple des bénéfices lissés
export const LOSS_MULTIPLE = 8; // multiple des pertes lissées (asymétrie, cf. §6.1)
export const PROFIT_EMA_KEEP = 0.8; // profitEma ← keep × profitEma + (1 − keep) × résultat courant
export const PRICE_FLOOR = 0.01;
export const PRICE_NOISE = 0.03;
export const SENTIMENT_DECAY = 0.7;
export const SENTIMENT_MIN = 0.2;
export const SENTIMENT_MAX = 5;
export const PARACHUTE_PCT = 0.05;
export const PARACHUTE_MIN = 500;
export const CONTROL_TRANSFER_MIN = 0.1;
export const STAKE_THRESHOLDS = [0.4, 0.25]; // du plus haut au plus bas
export const PERSONAL_LOAN_LTV = 0.5;
/** Actions d'une entreprise que l'on contrôle : comptées à 25 % seulement dans le plafond du prêt perso (§6.4). */
export const CONTROLLED_COLLATERAL_LTV = 0.25;
/** Délit d'initié (§6.2) : +1 de jauge de scandale par 1 % du capital acheté par le contrôleur. */
export const INSIDER_SCANDAL_PER_PCT = 1;
/** Seuil (part du capital achetée dans le tour par le contrôleur) du flash « l'autorité des marchés s'interroge ». */
export const INSIDER_FLASH_MIN = 0.05;
/**
 * Flottant minimal (§6.2) : un joueur ne peut pas dépasser 50 % + 1 action d'une entreprise (achat perso ou rachat
 * d'actions par l'entreprise qu'il contrôle) si le flottant doit tomber sous 40 % du capital (au plus 60 % détenus).
 */
export const FLOAT_MIN = 0.4;
export const PERSONAL_LOAN_SPREAD = 0.005;
export const MARGIN_CALL_LTV = 0.8;

// --- Actions (§7) ---
export const MAX_PRODUCTS = 4;
/** Une entreprise issue d'une fusion peut porter jusqu'à 6 produits actifs (§7). */
export const MAX_PRODUCTS_MERGED = 6;
/** Le coût d'un lancement est étalé dans le compte de résultat sur 4 trimestres (§5.6, §7). */
export const LAUNCH_AMORTIZATION_TURNS = 4;
export const PRICE_MIN_RATIO = 0.3;
export const PRICE_MAX_RATIO = 3;
export const PRODUCTION_MAX_RATIO = 2;
export const MAX_SPEND_PER_PRODUCT = 1_000_000; // k€ par tour : garde-fou de saisie
export const MAX_CAPACITY_ORDER = 100_000; // lots
export const MIN_STARTUP_INVESTMENT = 1_500;
/** Subvention minimale de la start-up de retour en jeu ; elle vaut au moins le dernier parachute reçu (§7). */
export const STARTUP_SUBSIDY = 1_000;
export const STARTUP_FOUNDER_STAKE = 0.5;
export const BONUS_CAP = 0.1;
export const BONUS_TRANCHE = 0.05;
export const BONUS_SCANDAL_PER_TRANCHE = 8;
export const BONUS_SENTIMENT_PER_TRANCHE = 0.97;
export const FLASH_BONUS_MIN = 500;
export const DIVIDEND_SENTIMENT_FACTOR = 0.1; // sentiment ×(1 + 0,1 × min(1, dividende / capitalisation))
export const POISON_PILL_TRIGGER = 0.25;
export const POISON_PILL_ISSUE = 0.4;
export const POISON_PILL_DISCOUNT = 0.5;
export const POISON_PILL_SCANDAL = 15;
export const POISON_PILL_SENTIMENT = 0.9;
export const POISON_PILL_COOLDOWN = 3;
export const CRISIS_COMMS_COST = 400;
export const CRISIS_COMMS_SCANDAL = -13; // une seule par entreprise et par tour (§7)
/** Réputation rendue par la com' de crise, seulement tant qu'elle est sous 1 : elle répare, elle n'embellit pas (§7). */
export const CRISIS_COMMS_REPUTATION = 0.05;
export const CRISIS_COMMS_REPUTATION_CAP = 1;
/**
 * Lanceur d'alerte (§7) : coût en cash perso ; la jauge de la cible double, dans la limite de +15 (on ne révèle que
 * ce qui existe) ; une fois par tour et par joueur.
 */
export const WHISTLEBLOW_COST = 500;
export const WHISTLEBLOW_SCANDAL = 15;
/**
 * Tuyau (§7) : une source du journal dit au seul payeur si une rumeur est vraie. Tarif en part de sa valeur nette
 * à la dernière clôture : de 2 % au premier tuyau vers 5 % à force d'en redemander (asymptote, 1 − e^(−0,5 n)),
 * × l'humeur du journaliste (± 15 %, tirée chaque trimestre), jamais moins de 500 k. Un par trimestre ;
 * une fois sur dix, la source parle : flash qui nomme le joueur, +8 de jauge sur ses entreprises.
 */
export const RUMOR_CHECK_RATE_MIN = 0.02;
export const RUMOR_CHECK_RATE_MAX = 0.05;
export const RUMOR_CHECK_RAMP = 0.5;
export const RUMOR_CHECK_GREED = 0.15;
export const RUMOR_CHECK_MIN_COST = 500;
export const RUMOR_CHECK_LEAK_PROB = 0.1;
export const RUMOR_CHECK_LEAK_SCANDAL = 8;

// --- Filiales d'approvisionnement (§5.5 bis) ---
/** Lots extraits par trimestre par une filiale (de quoi nourrir un produit de départ). */
export const SITE_CAPACITY = 40;
/** Coût d'extraction d'un lot, en part du prix de base de la matière (hors effets de news, §5.5 bis). */
export const SITE_UNIT_COST_RATIO = 0.75;
/** Emplacements de filiale par matière : nommés à la création de la partie, attribués aux enchères (§5.5 bis). */
export const SITES_PER_COMMODITY = 3;
/** Mise à prix d'une filiale, en multiple du prix de base (payée comptant, comme une usine : hors compte de résultat). */
export const SITE_OPENING_COST_MULT = 125;
/** Part du prix payé d'une filiale comptée dans la valeur comptable, comme les usines (§5.7). */
export const SITE_BOOK_VALUE_RATIO = 0.5;
/** Filiale en sommeil : entretien par trimestre, en part de sa facture d'extraction habituelle (capacité × coût du lot). */
export const SITE_DORMANT_UPKEEP = 0.25;

// --- Géographie (§5.8) ---
/**
 * Prix du transport d'un chargement (k par km pondéré par la sorte de route, `ROAD_FACTOR`) : multiplié par le
 * `freightWeight` du produit ou de la matière — la distance est une facture au poids, rien d'autre.
 */
export const TRANSPORT_COST_PER_KM = 0.0045;
/** Déménager une usine après le trimestre où son produit démarre : cette part de la valeur de sa capacité. */
export const FACTORY_MOVE_COST_RATIO = 0.25;
/** Pression sur les salaires (hors capitale) : la main-d'œuvre d'une usine renchérit de 3 % par autre usine de sa zone… */
export const WAGE_PRESSURE_PER_PLANT = 0.03;
/** … au plus pour 5 autres usines (+15 %). */
export const WAGE_PRESSURE_MAX_PLANTS = 5;
/**
 * Livraison (§5.8) : les ventes par ville d'un produit de référence (attractivité 1) face à 3,5 d'attractivité venue de
 * la capitale, environ 22 % du marché. Fixe par secteur et par zone : le transport ne dépend ni des rivaux ni des prix.
 */
export const MIX_REF_OTHERS = 3.5;

// --- Tractations entre joueurs (§7 bis) ---
/** Offres qu'un joueur peut envoyer par trimestre (au-delà, on inonde les boîtes aux lettres). */
export const OFFERS_PER_TURN = 6;
/** Cession de gré à gré : prix par action dans ± 25 % du cours (sinon ce serait un cadeau déguisé). */
export const BLOCK_PRICE_BAND = 0.25;
/** Contrat de fourniture : prix du lot entre 50 % et 150 % du prix de base de la matière. */
export const CONTRACT_PRICE_MIN_RATIO = 0.5;
export const CONTRACT_PRICE_MAX_RATIO = 1.5;
export const CONTRACT_MAX_LOTS = 200;
export const CONTRACT_MAX_TURNS = 8;
/**
 * Entre deux entreprises du même dirigeant, prix de pleine concurrence : ± 10 % du cours de la dernière clôture
 * (sinon le contrat ferait passer l'argent des actionnaires minoritaires de l'une vers l'autre).
 */
export const CONTRACT_GROUP_BAND = 0.1;
/**
 * Entente sur les prix : probabilité d'être découverte à chaque résolution = 6 % + 3 % par membre au-delà de deux
 * + 2 % par trimestre déjà passé en entente par le membre le plus aguerri (compteur jamais remis à zéro), au plus 35 %.
 * Découverte : chaque membre paie 15 % de son chiffre d'affaires du trimestre dans le secteur (300 k au moins),
 * +20 de jauge de scandale, et l'entente est dissoute.
 */
export const CARTEL_RISK_BASE = 0.06;
export const CARTEL_RISK_PER_MEMBER = 0.03;
export const CARTEL_RISK_PER_TURN = 0.02;
export const CARTEL_RISK_MAX = 0.35;
export const CARTEL_FINE_RATIO = 0.15;
export const CARTEL_FINE_MIN = 300;
export const CARTEL_SCANDAL = 20;

/** Coût (k€ de trésorerie) et hausse de la jauge de scandale de chaque action discutable (§7). */
export const SHADY_COSTS: Record<ShadyKind, { cost: number; scandal: number }> = {
  lobbying: { cost: 1_000, scandal: 10 },
  tax_optimisation: { cost: 300, scandal: 15 },
  greenwashing: { cost: 500, scandal: 10 },
  industrial_espionage: { cost: 1_000, scandal: 20 },
  offshoring: { cost: 800, scandal: 15 },
  smear_campaign: { cost: 500, scandal: 20 },
};
export const LOBBYING_TURNS = 2;
export const OFFSHORING_TURNS = 3;
export const OFFSHORING_REPUTATION = -0.1;
export const ESPIONAGE_GAP_SHARE = 0.3; // seulement si l'écart est positif (§7)
export const SMEAR_SENTIMENT = 0.85;

// --- Scandales (§8) ---
/** Probabilité d'éclatement : clamp((jauge − 10) / 90, 0, 1)^1,5. */
export const SCANDAL_RISK_FLOOR = 10;
export const SCANDAL_RISK_SPAN = 90;
export const SCANDAL_RISK_EXPONENT = 1.5;
export const SCANDAL_FINE_BASE = 0.1;
export const SCANDAL_FINE_FLAT = 500;
export const SCANDAL_SENTIMENT = 0.75;
export const SCANDAL_REPUTATION = -0.15;
export const SCANDAL_RESET = 15;
export const SCANDAL_DECAY = 4;
export const REPUTATION_DRIFT = 0.02;
export const REPUTATION_MIN = 0.5;
export const REPUTATION_MAX = 1.3;

// --- Journal (§9) ---
export const RECENT_NEWS_MEMORY = 12;
/**
 * Fiabilité affichée d'une rumeur, en poids : la vraie (news programmée au tour suivant) et les fausses tirent
 * chacune leur étiquette. Mesuré sur 300 parties de bots, une rumeur est vraie ~80 % du temps si « élevée »,
 * ~40 % si « moyenne », ~10 % si « faible » : aucune étiquette n'est une certitude, dans un sens ou dans l'autre.
 */
export const TRUE_RUMOR_RELIABILITY: Record<RumorReliability, number> = { élevée: 0.5, moyenne: 0.38, faible: 0.12 };
export const FAKE_RUMOR_RELIABILITY: Record<RumorReliability, number> = { élevée: 0.07, moyenne: 0.3, faible: 0.63 };
