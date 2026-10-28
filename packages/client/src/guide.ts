/**
 * Mode d'emploi (aide « ? », accueil, salon) : l'ordre des parties et les chiffres des règles qu'il cite.
 * Les chiffres viennent des constantes du moteur, déjà formatés : si une règle change, le texte suit.
 * Pourcentages et nombres dans la langue du texte ; montants dans la monnaie du salon (euros ou dollars).
 */
import {
  BLOCK_PRICE_BAND,
  BONUS_CAP,
  CARTEL_FINE_RATIO,
  CARTEL_SCANDAL,
  CONTRACT_MAX_TURNS,
  CONTROLLED_COLLATERAL_LTV,
  CRISIS_COMMS_COST,
  CRISIS_COMMS_SCANDAL,
  DEPOSITS,
  EMERGENCY_PURCHASE_PREMIUM,
  FACTORY_MOVE_COST_RATIO,
  HEX_RESERVE_CITY,
  HEX_RESERVE_NEAR,
  HEX_RESERVE_REMOTE,
  HQ_COST,
  MARGIN_CALL_LTV,
  MAX_PRODUCTS,
  MAX_PRODUCTS_MERGED,
  MIN_STARTUP_INVESTMENT,
  OFFERS_PER_TURN,
  PARACHUTE_MIN,
  PARACHUTE_PCT,
  PERSONAL_LOAN_LTV,
  POISON_PILL_COOLDOWN,
  POISON_PILL_DISCOUNT,
  POISON_PILL_ISSUE,
  POISON_PILL_SCANDAL,
  POISON_PILL_TRIGGER,
  RUMOR_CHECK_LEAK_PROB,
  RUMOR_CHECK_LEAK_SCANDAL,
  RUMOR_CHECK_MIN_COST,
  RUMOR_CHECK_RATE_MAX,
  RUMOR_CHECK_RATE_MIN,
  SECTORS,
  SECTOR_IDS,
  SITE_DORMANT_UPKEEP,
  SITE_OPENING_COST_MULT,
  SITE_UNIT_COST_RATIO,
  STAKE_THRESHOLDS,
  STARTUP_FOUNDER_STAKE,
  STARTUP_SUBSIDY,
  WHISTLEBLOW_COST,
  WHISTLEBLOW_SCANDAL,
} from '@muchomoney/core';
import type { Fmt } from './fmt';
import { CONTROL_THRESHOLD } from './rules';
import type { TabId } from './screens/GameScreen';

/** Les trois parties du mode d'emploi. */
export const GUIDE_SECTIONS = ['basics', 'tabs', 'more'] as const;
export type GuideSection = (typeof GUIDE_SECTIONS)[number];

/** Les onglets de la partie, dans l'ordre de l'écran de jeu sur la carte classique. */
export const GUIDE_TABS: readonly TabId[] = ['journal', 'company', 'factories', 'map', 'stocks', 'commodities', 'markets', 'deals', 'ranking'];

/**
 * Sur le plateau, les mêmes onglets rangés par usage : la carte, outil central, suit l'entreprise, puis les matières
 * qu'elle consomme ; « Mes usines » (bêta) ferme la marche.
 */
export const HEX_TABS: readonly TabId[] = ['journal', 'company', 'map', 'commodities', 'stocks', 'markets', 'deals', 'ranking', 'factories'];

/** Ordre des onglets de l'écran de jeu (et du mode d'emploi « Onglet par onglet ») selon la carte de la partie. */
export function gameTabOrder(mapMode: 'classic' | 'hex' | 'square' | undefined): readonly TabId[] {
  return mapMode === 'hex' || mapMode === 'square' ? HEX_TABS : GUIDE_TABS;
}

/** Les sujets de « Pour aller plus loin ». */
export const GUIDE_TOPICS = ['takeover', 'merge', 'payouts', 'loans', 'scandal', 'tips', 'sites', 'zones', 'board', 'deals', 'cartels', 'startup', 'bots', 'end'] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];

/** Chiffres des règles, prêts à insérer dans le texte. */
export interface GuideNumbers {
  control: string;
  stakeLow: string;
  stakeHigh: string;
  parachutePct: string;
  parachuteMin: string;
  pillTrigger: string;
  pillIssue: string;
  pillPrice: string;
  pillScandal: string;
  pillCooldown: string;
  maxProducts: string;
  maxMerged: string;
  hq: string;
  bonusCap: string;
  loanLtv: string;
  loanLtvControlled: string;
  marginCall: string;
  emergency: string;
  crisisCost: string;
  crisisDrop: string;
  whistleCost: string;
  whistleMax: string;
  tipRateMin: string;
  tipRateMax: string;
  tipMin: string;
  tipLeak: string;
  tipScandal: string;
  siteMult: string;
  siteLotsMin: string;
  siteLotsMax: string;
  siteCost: string;
  siteUpkeep: string;
  moveCostPct: string;
  localBonusMin: string;
  localBonusMax: string;
  hexReserveCity: string;
  hexReserveNear: string;
  hexReserveRemote: string;
  offers: string;
  blockBand: string;
  contractTurns: string;
  cartelFine: string;
  cartelScandal: string;
  startupMin: string;
  startupSubsidy: string;
  startupStake: string;
}

/** `text` : pourcentages et nombres dans la langue du texte ; `money` : montants dans la monnaie du salon. */
export function guideNumbers(text: Fmt, money: Fmt): GuideNumbers {
  const pct = (x: number) => text.pct(x, 0);
  const int = (x: number) => text.int(x);
  const [stakeLow, stakeHigh] = [...STAKE_THRESHOLDS].sort((a, b) => a - b);
  // Bonus « fabriqué ici » des secteurs qui en ont un (la crypto, immatérielle, n'en a pas) : la fourchette suit SECTORS.
  const localBonuses = SECTOR_IDS.map((s) => SECTORS[s].localBonus).filter((b) => b > 0);
  // Capacités réelles des gisements (riche, moyen, pauvre) : la fourchette citée par le guide suit le contenu de la carte.
  const caps = Object.values(DEPOSITS).map((d) => d.capacity);
  return {
    control: pct(CONTROL_THRESHOLD),
    stakeLow: pct(stakeLow),
    stakeHigh: pct(stakeHigh),
    parachutePct: pct(PARACHUTE_PCT),
    parachuteMin: money.money(PARACHUTE_MIN),
    pillTrigger: pct(POISON_PILL_TRIGGER),
    pillIssue: pct(POISON_PILL_ISSUE),
    pillPrice: pct(POISON_PILL_DISCOUNT),
    pillScandal: int(POISON_PILL_SCANDAL),
    pillCooldown: int(POISON_PILL_COOLDOWN),
    maxProducts: int(MAX_PRODUCTS),
    maxMerged: int(MAX_PRODUCTS_MERGED),
    hq: money.money(HQ_COST),
    bonusCap: pct(BONUS_CAP),
    loanLtv: pct(PERSONAL_LOAN_LTV),
    loanLtvControlled: pct(CONTROLLED_COLLATERAL_LTV),
    marginCall: pct(MARGIN_CALL_LTV),
    emergency: pct(EMERGENCY_PURCHASE_PREMIUM - 1),
    crisisCost: money.money(CRISIS_COMMS_COST),
    crisisDrop: int(-CRISIS_COMMS_SCANDAL),
    whistleCost: money.money(WHISTLEBLOW_COST),
    whistleMax: int(WHISTLEBLOW_SCANDAL),
    tipRateMin: pct(RUMOR_CHECK_RATE_MIN),
    tipRateMax: pct(RUMOR_CHECK_RATE_MAX),
    tipMin: money.money(RUMOR_CHECK_MIN_COST),
    tipLeak: int(1 / RUMOR_CHECK_LEAK_PROB),
    tipScandal: int(RUMOR_CHECK_LEAK_SCANDAL),
    siteMult: int(SITE_OPENING_COST_MULT),
    siteLotsMin: int(Math.min(...caps)),
    siteLotsMax: int(Math.max(...caps)),
    siteCost: pct(SITE_UNIT_COST_RATIO),
    siteUpkeep: pct(SITE_DORMANT_UPKEEP),
    // Part de la valeur de la capacité payée pour déménager une usine (§5.8) : la règle change, le texte suit.
    moveCostPct: pct(FACTORY_MOVE_COST_RATIO),
    localBonusMin: pct(Math.min(...localBonuses)),
    localBonusMax: pct(Math.max(...localBonuses)),
    hexReserveCity: money.money(HEX_RESERVE_CITY),
    hexReserveNear: money.money(HEX_RESERVE_NEAR),
    hexReserveRemote: money.money(HEX_RESERVE_REMOTE),
    offers: int(OFFERS_PER_TURN),
    blockBand: pct(BLOCK_PRICE_BAND),
    contractTurns: int(CONTRACT_MAX_TURNS),
    cartelFine: pct(CARTEL_FINE_RATIO),
    cartelScandal: int(CARTEL_SCANDAL),
    startupMin: money.money(MIN_STARTUP_INVESTMENT),
    startupSubsidy: money.money(STARTUP_SUBSIDY),
    startupStake: pct(STARTUP_FOUNDER_STAKE),
  };
}
