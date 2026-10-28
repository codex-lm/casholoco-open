/**
 * Catalogue des textes générés par le moteur (messages d'action, flashs, titres de secours,
 * corps d'articles, fin de partie…), en français et en anglais, avec les mêmes clés.
 *
 * Règles :
 * - la langue d'une partie est `state.config.lang` (défaut 'fr') ;
 * - les fonctions reçoivent des nombres bruts et les formatent elles-mêmes (k€ / $k) ;
 * - aucun texte ne doit influencer la simulation : le choix d'une variante passe par `flavor()`
 *   (hash, sans consommer le RNG), et les listes dont on tire au RNG (suffixes de start-up)
 *   ont la même longueur dans les deux langues.
 * La version anglaise est une adaptation (presse financière anglo-saxonne, « The Daily Capital »),
 * pas une traduction mot à mot.
 */
import { DEFAULT_LANG, type CommodityId, type GameState, type HeadlineTemplates, type Lang, type TerrainAppreciation } from '../types';
import { formatLots, formatMoney, formatPct, formatSharePrice } from '../format';

export type BodyKey =
  | 'takeoverNoCeo'
  | 'controlHandover'
  | 'controlSold'
  | 'autopilot'
  | 'stakeBuilding'
  | 'insiderBuying'
  | 'whistleblow'
  | 'startup'
  | 'productLaunch'
  | 'hexProductLaunch'
  | 'ceoBonus'
  | 'poisonPill'
  | 'buyback'
  | 'dividend'
  | 'merger'
  | 'bigProfit'
  | 'bigLoss'
  | 'bankruptcy'
  | 'scandal'
  | 'marginCall'
  | 'noNews'
  | 'finalEdition';

/** Nombre de suffixes de start-up des bots : identique dans toutes les langues (tirage au RNG). */
export const STARTUP_SUFFIX_COUNT = 6;

export interface EngineText {
  lang: Lang;
  terrainAppreciation: Record<TerrainAppreciation, string>;

  // --- Formatage ---
  money(k: number): string;
  sharePrice(k: number): string;
  pct(ratio: number, digits?: number): string;
  lots(n: number): string;
  int(n: number): string;
  /** Au plus 1 décimale. */
  dec1(n: number): string;
  /** Au plus 2 décimales. */
  dec2(n: number): string;

  // --- Moteur (engine.ts) ---
  gameOver: string;
  unknownPlayer: string;
  internalError: string;
  botTakeoverDisabled: string;
  botTakeoverLastTurn: string;
  botTakeoverUnavailable: string;
  botTakeoverNameInvalid: string;
  botTakeoverNameTaken: string;
  botTakeoverClaimed(turn: number): string;
  botTakeoverPending(turn: number): string;

  // --- Gabarits ---
  /** Formules vagues pour un placeholder sans valeur. */
  placeholders: Record<string, string>;

  // --- Création, contrôle, vue ---
  anonymous: string;
  defaultCompanyName(playerName: string): string;
  autopilotCeo: string;
  autopilotTagline: string;
  startupSuffixes: string[];
  otherCompetitors: string;
  controlHandoverTitle(heir: string, company: string): string;
  autopilotTitle(company: string): string;
  /** Flash quand la source d'un tuyau parle (§7). */
  rumorLeakTitle(player: string): string;
  rumorLeakBody: string;
  /** Filiale d'approvisionnement, avec son article (« une mine de lithium »). */
  siteName: Record<CommodityId, string>;
  /** Nom d’un gisement cité dans une phrase (« Raffinerie de Saint-Caramel »). */
  slotLabel(name: string): string;
  /** Flash d'adjudication d'une filiale (résultats du numéro suivant, §5.5 bis). */
  siteAwardTitle(company: string, site: string): string;
  siteAwardBody(price: string, bidders: number): string;
  blockSaleTitle(buyer: string, pct: string, company: string, seller: string): string;
  blockSaleBody(total: string): string;
  cartelBustedTitle(sector: string, companies: string): string;
  cartelBustedBody(total: string): string;

  // --- Journal ---
  fallbackHeadlines: HeadlineTemplates;
  bodies: Record<BodyKey, string[]>;
  profitBody(revenue: number, profit: number): string;
  lossBody(revenue: number, loss: number): string;
  marginCallTail(sold: number): string;
  calmTitle: string;
  editorialist: string;
  quoteByline(name: string, company: string): string;
  /** Brèves « délit d'initié » d'un numéro de krach crypto ; {ceo} et {company} ne paraissent que dans le titre. */
  insiderSaleBriefs: { title: string; body: string }[];
  finalTitle(winner: string, netWorth: number): string;

  // --- Actions ---
  act: ActionText;
}

export interface ActionText {
  unreadable: string;
  unknown: string;
  companyNotFound: string;
  productNotFound: string;
  unknownSector: string;
  unknownCommodity: string;
  invalidAmount: string;
  invalidShares: string;
  invalidLots: string;
  statusBankrupt(company: string): string;
  statusMerged(company: string): string;
  notAutopilot(company: string): string;
  shownTheDoor(company: string): string;
  notController(company: string): string;

  onlyPlayerBuy: string;
  noFloat(ticker: string): string;
  onlyFloat(n: number, ticker: string): string;
  cantAffordShares(n: number, ticker: string, total: number, cash: number): string;
  bought(n: number, ticker: string, total: number, avg: number, company: string, stake: number): string;
  boughtControl(company: string): string;
  /** Fin de message : achat de ses propres actions par le contrôleur (délit d'initié), hausse de la jauge. */
  insiderBought(scandalUp: number): string;
  /** Refus : l'achat (ou le rachat) ferait passer un actionnaire au-delà de 50 % + 1 avec un flottant sous FLOAT_MIN (40 %). */
  floatMin(maxShares: number, ticker: string, minFloat: number): string;

  onlyPlayerSell: string;
  noneHeld(ticker: string): string;
  onlyHeld(n: number, ticker: string): string;
  founderLocked(company: string): string;
  pillLocked(locked: number, ticker: string, free: number): string;
  sold(n: number, ticker: string, total: number, avg: number): string;
  lostControl(company: string): string;

  onlyPlayerLoan: string;
  personalLoanCap(limit: number): string;
  personalLoan(amount: number, rate: number, debt: number): string;
  onlyPlayerRepay: string;
  noPersonalDebt: string;
  personalCashShort(cash: number): string;
  personalRepaid(amount: number, debt: number): string;

  onlyPlayerStartup: string;
  startupNeedsName: string;
  invalidInvestment: string;
  minInvestment(min: number): string;
  alreadyFounded: string;
  /** Refus : la start-up est réservée au joueur qui ne contrôle plus aucune entreprise (retour en jeu). */
  startupComebackOnly: string;
  /** Refus : le joueur vient de céder le contrôle d'une entreprise en vendant ce tour. */
  startupAfterSellOut(company: string): string;
  startupBorn(label: string, cash: number, subsidy: number, product: string): string;

  noDecision: string;
  invalidPrice: string;
  invalidProduction: string;
  invalidMarketing: string;
  invalidRnd: string;
  notePrice(price: number, clamped: boolean): string;
  noteProduction(production: number, cappedAt: number | null): string;
  noteMarketing(amount: number): string;
  noteRnd(amount: number): string;
  decisions(product: string, notes: string[]): string;

  productNeedsName: string;
  maxProducts(max: number): string;
  launchCash(sector: string, cost: number, company: string, cash: number): string;
  launched(product: string, sector: string, cost: number, capacity: number, price: number): string;
  /** Fin de message : étalement du coût du lancement dans le compte de résultat. */
  launchAmortized(perTurn: number, turns: number): string;
  /** Fin de message : le produit lancé ne vend qu'à partir du trimestre suivant. */
  launchNextQuarter: string;
  discontinued(product: string, stock: number, capacity: number, cash: number): string;

  orderTooBig(max: number): string;
  expandCash(lots: number, cost: number, company: string, cash: number): string;
  expanded(lots: number, product: string, cost: number): string;

  marketDepth(commodity: string, liquidity: number): string;
  commodityCash(lots: number, commodity: string, total: number): string;
  commodityBought(lots: number, commodity: string, total: number, avg: number, newPrice: number): string;
  onlyInStock(have: number, commodity: string): string;
  commoditySold(lots: number, commodity: string, total: number, avg: number, newPrice: number): string;

  companyLoanCap(company: string, limit: number): string;
  companyLoan(amount: number, company: string, debt: number, rate: number): string;
  noCompanyDebt(company: string): string;
  companyCashShort(company: string, cash: number): string;
  companyRepaid(amount: number, company: string, debt: number): string;

  dividendJustFounded(company: string): string;
  dividendCap(max: number, borrowed: number): string;
  dividendPaid(amount: number, perShare: number, price: number, mine: number | null): string;

  autopilotNoBonus: string;
  bonusJustFounded(company: string): string;
  bonusCap(max: number): string;
  bonusPaid(amount: number, company: string, scandalUp: number): string;

  oneBuyback: string;
  buybackCash(total: number, company: string, cash: number): string;
  buybackDone(n: number, ticker: string, total: number, remaining: number): string;
  buybackTakeover(player: string): string;

  pillHumansOnly: string;
  pillCooldown: string;
  pillNoRaider: string;
  pillCash(cost: number, n: number, unit: number): string;
  pillDone(n: number, unit: number, cost: number, raider: string, raiderStake: number, myStake: number, price: number): string;

  crisisCash(cost: number): string;
  crisisDone(cost: number, scandal: number, reputation: number): string;
  crisisOncePerTurn: string;

  onlyPlayerWhistle: string;
  whistleTargetGone: string;
  whistleSelf(company: string): string;
  whistleOncePerTurn: string;
  whistleCash(cost: number): string;
  whistleDone(company: string, level: number, cost: number, scandalUp: number): string;

  onlyPlayerTip: string;
  tipStale: string;
  tipNoRumor: string;
  tipOncePerTurn: string;
  tipCash(cost: number): string;
  tipDone(truthful: boolean, cost: number, leaked: boolean): string;

  siteExists(site: string): string;
  siteMissing(site: string): string;
  siteAlreadyDormant: string;
  siteNotDormant: string;
  siteDormantDone(upkeep: number): string;
  siteRestarted: string;
  siteSlotUnknown: string;
  siteSlotTaken(site: string): string;
  siteBidLastTurn: string;
  siteBidLow(site: string, reserve: number): string;
  siteBidCash(site: string, amount: number, company: string, cash: number): string;
  siteBidPlaced(site: string, amount: number, reserve: number): string;
  siteNoBid: string;
  siteBidCancelled: string;
  unknownZone: string;
  unknownHex: string;
  hexNotBuildable: string;
  hexOccupied: string;
  hexBoardFull: string;
  hexBidLastTurn: string;
  hexBidLow(hex: string, reserve: number): string;
  hexBidCash(bid: number, cost: number, company: string, cash: number): string;
  hexBidDuplicate: string;
  hexFallbackInvalid: string;
  hexBidOnly: string;
  hexNoBid: string;
  hexBidCancelled: string;
  hexLaunchPlanned(product: string, hex: string, bid: number): string;
  hexMovePlanned(product: string, hex: string, bid: number): string;
  hexStartupPlanned(product: string, hex: string, bid: number, fallback: 'nearest' | 'abandon'): string;
  incubatorOver(product: string, hex: string, price: number): string;
  incubatorExtended(product: string, hex: string, price: number): string;
  hexFallbackBody(hex: string): string;
  hexStartupBody: string;
  factoryAlreadyThere(product: string, zone: string): string;
  factoryMovePending(product: string, hex: string): string;
  factoryMoveLastTurn: string;
  factoryMoveCash(product: string, cost: number, company: string, cash: number): string;
  factoryMoved(product: string, zone: string, cost: number): string;
  factoryMovedFree(product: string, zone: string): string;
  factoryMovePlanned(product: string, zone: string, cost: number): string;
  launchZone(zone: string): string;

  offerOnlyPlayers: string;
  offerUnknownPlayer: string;
  offerSelf: string;
  offerAutopilot(company: string): string;
  offerLimit(n: number): string;
  offerSent(to: string): string;
  offerBotAccepted(bot: string, details: string): string;
  offerBotDeclined(bot: string): string;
  offerNotFound: string;
  offerNotForYou: string;
  offerNotYours: string;
  offerDeclined: string;
  offerCancelled: string;
  blockPriceBand(min: number, max: number): string;
  blockNotEnough(seller: string, held: number, ticker: string): string;
  blockCash(buyer: string, total: number): string;
  blockFloat: string;
  blockOwnFounder(company: string): string;
  blockDone(n: number, ticker: string, seller: string, buyer: string, price: number, total: number): string;
  contractBounds(minPrice: number, maxPrice: number, maxLots: number, maxTurns: number): string;
  contractNotYours: string;
  contractSameCompany: string;
  contractArmsLength(minPrice: number, maxPrice: number): string;
  contractExists(commodity: string): string;
  contractSigned(seller: string, buyer: string, lots: number, commodity: string, price: number, turns: number): string;
  cartelNeedsProducts(sector: string): string;
  cartelSelf: string;
  cartelAlready: string;
  cartelOther: string;
  cartelSigned(sector: string, members: number, risk: string): string;
  cartelNone(sector: string): string;
  cartelLeft(sector: string): string;
  cartelLeaving(sector: string): string;

  shadyUnknownEvenForYou: string;
  shadyOncePerTurn: string;
  shadyCash(cost: number): string;
  lobbyingNeedsSector: string;
  lobbyingDetails(sector: string): string;
  taxDetails: string;
  greenwashingDetails: string;
  offshoringDetails: string;
  spyTargetGone: string;
  spySelf: string;
  spyNobody: string;
  spyNothingToSteal: string;
  spyDetails(gains: { product: string; gain: number }[]): string;
  smearNeedsTarget: string;
  smearSelf: string;
  smearDetails(ticker: string): string;
  shadyUnknown: string;
  shadyDone(details: string, cost: number, scandal: number): string;

  autopilotNoMerge: string;
  mergeSelf: string;
  mergeTooMany(absorber: string, max: number, a: number, b: number): string;
  mergeJustFounded: string;
  merged(target: string, absorber: string, issued: number, absorberTicker: string, targetTicker: string, ratio: number): string;
  mergeTakeover(player: string): string;
}

// ---------------------------------------------------------------------------
// Français (texte d'origine du jeu)
// ---------------------------------------------------------------------------

const FR_NF0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const FR_NF1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const FR_NF2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

function frText(): EngineText {
  const m = (k: number) => formatMoney(k, 'fr');
  const sp = (k: number) => formatSharePrice(k, 'fr');
  const pct = (r: number, d = 1) => formatPct(r, d, 'fr');
  const lots = (n: number) => formatLots(n, 'fr');
  const int = (n: number) => FR_NF0.format(n);
  const low = (s: string) => s.toLowerCase();

  const act: ActionText = {
    unreadable: 'Action illisible.',
    unknown: 'Action inconnue.',
    companyNotFound: 'Entreprise introuvable.',
    productNotFound: 'Produit introuvable dans cette entreprise.',
    unknownSector: 'Secteur inconnu.',
    unknownCommodity: 'Matière première inconnue.',
    invalidAmount: 'Montant invalide : il faut un nombre positif.',
    invalidShares: 'Nombre d’actions invalide : il faut un entier positif.',
    invalidLots: 'Nombre de lots invalide : il faut un entier positif.',
    statusBankrupt: (c) => `${c} est en faillite : cotation suspendue, plus aucune opération possible.`,
    statusMerged: (c) => `${c} a été absorbée : elle n’existe plus que dans les livres d’histoire.`,
    notAutopilot: (c) => `${c} n’est pas en pilote automatique.`,
    shownTheDoor: (c) => `On vous a montré la sortie : ${c} est désormais contrôlée par un autre actionnaire.`,
    notController: (c) => `Vous ne contrôlez pas ${c} : il faut en détenir plus de 50 % (ou l’avoir fondée sans vous être fait évincer).`,

    onlyPlayerBuy: 'Seul un joueur peut acheter des actions.',
    noFloat: (t) => `Plus aucune action ${t} sur le marché : tout le capital est entre les mains des joueurs.`,
    onlyFloat: (n, t) => `Seulement ${int(n)} actions ${t} disponibles au flottant.`,
    cantAffordShares: (n, t, total, cash) => `Fonds insuffisants : ${int(n)} actions ${t} coûtent ${m(total)}, vous avez ${m(cash)}.`,
    bought: (n, t, total, avg, c, stake) =>
      `${int(n)} actions ${t} achetées pour ${m(total)} (${sp(avg)} l’une). Participation dans ${c} : ${pct(stake)}.`,
    boughtControl: (c) => ` Vous prenez le contrôle : ${c} est à vous !`,
    insiderBought: (up) =>
      ` Un PDG qui rachète sa propre entreprise, ça se remarque : jauge de scandale +${FR_NF1.format(up)} (soupçon de délit d’initié).`,
    floatMin: (max, t, minFloat) =>
      `Flottant minimal : personne ne dépasse 50 % + 1 action de ${t} si moins de ${pct(minFloat, 0)} du capital reste en bourse. ${max > 0 ? `Maximum possible : ${int(max)} actions.` : 'Plus rien à ramasser.'} Les petits porteurs ont des droits, paraît-il.`,

    onlyPlayerSell: 'Seul un joueur peut vendre des actions.',
    noneHeld: (t) => `Vous ne détenez aucune action ${t}.`,
    onlyHeld: (n, t) => `Vous ne détenez que ${int(n)} actions ${t}.`,
    founderLocked: (c) => `${c} vient d’être introduite en bourse : les actions du fondateur sont bloquées jusqu’à la fin du trimestre.`,
    pillLocked: (locked, t, free) =>
      `${int(locked)} de vos actions ${t} (issues de la pilule empoisonnée) sont bloquées jusqu’à la fin du trimestre : vous pouvez en vendre ${int(free)}.`,
    sold: (n, t, total, avg) => `${int(n)} actions ${t} vendues pour ${m(total)} (${sp(avg)} l’une).`,
    lostControl: (c) =>
      ` Vous n’êtes plus aux commandes : ${c} vous échappe. Racheter ses actions ce trimestre compterait comme délit d’initié.`,

    onlyPlayerLoan: 'Seul un joueur peut emprunter à titre personnel.',
    personalLoanCap: (limit) =>
      `Plafond de prêt personnel : ${m(limit)} (50 % de votre portefeuille d’actions, au plus bas du cours actuel et du dernier cours de clôture, moins votre dette actuelle).`,
    personalLoan: (amount, rate, debt) => `Prêt de ${m(amount)} accordé à ${pct(rate, 2)} par trimestre. Dette perso : ${m(debt)}.`,
    onlyPlayerRepay: 'Seul un joueur peut rembourser un prêt personnel.',
    noPersonalDebt: 'Vous n’avez aucune dette personnelle à rembourser.',
    personalCashShort: (cash) => `Cash perso insuffisant : vous avez ${m(cash)}.`,
    personalRepaid: (amount, debt) => `${m(amount)} remboursés. Dette perso restante : ${m(debt)}.`,

    onlyPlayerStartup: 'Seul un joueur peut fonder une start-up.',
    startupNeedsName: 'Il faut un nom à votre start-up (40 caractères max).',
    invalidInvestment: 'Investissement invalide : il faut un nombre positif.',
    minInvestment: (min) => `Investissement minimum : ${m(min)}.`,
    alreadyFounded: 'Vous avez déjà fondé une entreprise ce trimestre. Même les licornes ont besoin de sommeil.',
    startupComebackOnly:
      'La start-up est réservée aux PDG sans entreprise (évincés ou en faillite) : c’est un retour en jeu, pas une filiale de plus. Occupez-vous déjà de celle que vous avez.',
    startupAfterSellOut: (c) =>
      `Vous venez de lâcher ${c} en vendant vos actions : la subvention de retour en jeu attendra le trimestre prochain. Le ministère connaît le coup du « je sors, je fonde, je rachète ».`,
    startupBorn: (label, cash, subsidy, product) =>
      `${label} est née : ${m(cash)} en caisse (dont ${m(subsidy)} de subvention), un produit « ${product} » et 50 % du capital pour vous (bloqué jusqu’à la fin du trimestre, comme les bonus et dividendes).`,

    noDecision: 'Aucune décision fournie.',
    invalidPrice: 'Prix invalide : il faut un nombre positif.',
    invalidProduction: 'Production invalide : il faut un nombre positif ou nul.',
    invalidMarketing: 'Budget marketing invalide : il faut un nombre positif ou nul.',
    invalidRnd: 'Budget R&D invalide : il faut un nombre positif ou nul.',
    notePrice: (price, clamped) => `prix ${m(price)} le lot${clamped ? ' (ramené dans les bornes 30 %-300 % du prix de référence)' : ''}`,
    noteProduction: (prod, cap) => `production ${lots(prod)}${cap !== null ? ` (plafonnée à ${lots(cap)} à la résolution)` : ''}`,
    noteMarketing: (x) => `marketing ${m(x)}`,
    noteRnd: (x) => `R&D ${m(x)}`,
    decisions: (product, notes) => `${product} : ${notes.join(', ')}.`,

    productNeedsName: 'Il faut un nom au produit (40 caractères max).',
    maxProducts: (max) => `Maximum ${max} produits actifs pour cette entreprise (6 pour une entreprise issue d’une fusion).`,
    launchCash: (sector, cost, c, cash) => `Trésorerie insuffisante : un lancement (${sector}) coûte ${m(cost)}, ${c} a ${m(cash)}.`,
    launched: (product, sector, cost, capacity, price) =>
      `${product} annoncé (${sector}) pour ${m(cost)} : capacité prévue ${lots(capacity)}, prix ${m(price)} le lot.`,
    launchAmortized: (per, n) => ` Le coût est étalé dans le compte de résultat : ${m(per)} par trimestre pendant ${n} trimestres.`,
    launchNextQuarter: ' Infrastructure installée à cette clôture, sans ventes ce trimestre. Le produit sera opérationnel au prochain trimestre ; premières ventes comptabilisées à la clôture de celui-ci.',
    discontinued: (product, stock, capacity, cash) =>
      `${product} retiré du marché : l’usine (${lots(capacity)}), le stock (${lots(stock)}) et le terrain éventuel rapportent ${m(cash)} nets, sans impôt. C’est la moitié de leur coût d’achat, stock valorisé à son coût unitaire.`,

    orderTooBig: (max) => `Commande trop grosse : ${lots(max)} maximum.`,
    expandCash: (n, cost, c, cash) => `Trésorerie insuffisante : ${lots(n)} de capacité coûtent ${m(cost)}, ${c} a ${m(cash)}.`,
    expanded: (n, product, cost) => `+${lots(n)} de capacité pour ${product}, livrés au prochain trimestre. Coût : ${m(cost)}.`,

    marketDepth: (cm, liq) => `Le marché (${low(cm)}) ne peut pas absorber plus de ${lots(liq)} d’un coup.`,
    commodityCash: (n, cm, total) => `Trésorerie insuffisante : ${lots(n)} de ${low(cm)} coûtent ${m(total)}.`,
    commodityBought: (n, cm, total, avg, np) =>
      `${lots(n)} de ${low(cm)} achetés pour ${m(total)} (${m(avg)} le lot). Le cours passe à ${m(np)}.`,
    onlyInStock: (have, cm) => `Vous n’avez que ${FR_NF2.format(have)} lots de ${low(cm)} en stock.`,
    commoditySold: (n, cm, total, avg, np) =>
      `${lots(n)} de ${low(cm)} vendus pour ${m(total)} (${m(avg)} le lot). Le cours passe à ${m(np)}.`,

    companyLoanCap: (c, limit) => `Plafond d’emprunt (${c}) : ${m(limit)} (3 × CA lissé + 50 % des fonds propres, moins la dette).`,
    companyLoan: (amount, c, debt, rate) =>
      `${m(amount)} empruntés par ${c}. Dette : ${m(debt)}, taux estimé ${pct(rate, 2)} par trimestre.`,
    noCompanyDebt: (c) => `${c} n’a aucune dette.`,
    companyCashShort: (c, cash) => `Trésorerie insuffisante : ${c} a ${m(cash)}.`,
    companyRepaid: (amount, c, debt) => `${m(amount)} remboursés. Dette restante (${c}) : ${m(debt)}.`,

    dividendJustFounded: (c) => `${c} vient d’être créée : pas de dividende avant la fin du premier trimestre.`,
    dividendCap: (max, borrowed) =>
      `Dividende plafonné à ${m(max)} : on ne distribue pas l’argent emprunté ce trimestre (${m(borrowed)}).`,
    dividendPaid: (amount, perShare, price, mine) =>
      `${m(amount)} de dividendes versés (${sp(perShare)} par action, détachés du cours : ${sp(price)}).${mine !== null ? ` Vous touchez ${m(mine)}.` : ''}`,

    autopilotNoBonus: 'Le pilote automatique ne se verse pas de bonus. Lui.',
    bonusJustFounded: (c) => `${c} vient d’être créée : pas de bonus avant la fin du premier trimestre. La décence, déjà.`,
    bonusCap: (max) => `Bonus plafonné à ${m(max)} ce trimestre (10 % de la trésorerie, hors emprunts du trimestre).`,
    bonusPaid: (amount, c, up) => `${m(amount)} virés sur votre compte perso. Jauge de scandale (${c}) : +${FR_NF1.format(up)}.`,

    oneBuyback: 'Un seul rachat d’actions par trimestre.',
    buybackCash: (total, c, cash) => `Trésorerie insuffisante : ce rachat coûte ${m(total)}, ${c} a ${m(cash)}.`,
    buybackDone: (n, t, total, remaining) => `${int(n)} actions ${t} rachetées et annulées pour ${m(total)}. Il en reste ${int(remaining)}.`,
    buybackTakeover: (p) => ` Aïe : ${p} dépasse désormais 50 % et prend le contrôle !`,

    pillHumansOnly: 'Seul un PDG en chair et en os peut avaler la pilule.',
    pillCooldown: 'Pilule empoisonnée en recharge : il faut attendre 3 trimestres entre deux prises.',
    pillNoRaider: 'Pilule empoisonnée impossible : aucun autre joueur ne détient 25 % du capital.',
    pillCash: (cost, n, unit) => `Il faut ${m(cost)} de cash perso pour souscrire ${int(n)} actions neuves à ${sp(unit)}.`,
    pillDone: (n, unit, cost, raider, rs, ms, price) =>
      `${int(n)} actions neuves souscrites à ${sp(unit)} pour ${m(cost)} (bloquées jusqu’à la fin du trimestre). ${raider} retombe à ${pct(rs)}, vous montez à ${pct(ms)}. Cours dilué : ${sp(price)}.`,

    crisisCash: (cost) => `Trésorerie insuffisante : une communication de crise coûte ${m(cost)}.`,
    crisisDone: (cost, scandal, rep) =>
      `${m(cost)} dépensés (en charge dans le résultat du trimestre) : jauge de scandale −${FR_NF0.format(Math.abs(scandal))}, ${
        rep > 0 ? `réputation +${FR_NF2.format(rep)}` : 'réputation inchangée (la com’ de crise répare, elle n’embellit pas)'
      }.`,
    crisisOncePerTurn: 'Une seule communication de crise par trimestre : à la deuxième, même les journalistes complaisants décrochent.',

    onlyPlayerWhistle: 'Seul un joueur peut tirer la sonnette d’alarme.',
    whistleTargetGone: 'Entreprise introuvable, en faillite ou absorbée : il n’y a plus personne à dénoncer.',
    whistleSelf: (c) => `Dénoncer ${c}, que vous dirigez ? Même les repentis attendent d’avoir quitté la maison.`,
    whistleOncePerTurn: 'Une seule alerte par trimestre : au-delà, les rédactions vous classent parmi les illuminés.',
    whistleCash: (cost) => `Il faut ${m(cost)} de cash perso pour payer avocats, clé USB et pseudonyme.`,
    whistleDone: (c, level, cost, up) =>
      up > 0
        ? `Dossier transmis à la presse sous pseudonyme pour ${m(cost)}. Jauge de scandale de ${c} : +${FR_NF0.format(up)}, désormais publiée à ${FR_NF0.format(level)}/100.`
        : `Dossier transmis à la presse pour ${m(cost)}… et il est vide : ${c} affiche ${FR_NF0.format(level)}/100 de scandale. On ne révèle que ce qui existe.`,

    onlyPlayerTip: 'Seul un joueur peut acheter un tuyau.',
    tipStale: 'Cette rumeur date d’un autre numéro : les tuyaux ne portent que sur le journal du jour.',
    tipNoRumor: 'Aucune rumeur à cet endroit du journal. Même les sources ont leurs limites.',
    tipOncePerTurn: 'Un seul tuyau par trimestre : votre source ne répond plus, elle est « en réunion ».',
    tipCash: (cost) => `Votre source demande ${m(cost)} de cash perso. En liquide, évidemment.`,
    tipDone: (truthful, cost, leaked) =>
      `${truthful ? 'Votre source est formelle : cette rumeur est fondée.' : 'Votre source ricane : cette rumeur ne tient pas debout.'} Tuyau payé ${m(cost)}.${
        leaked ? ' Mauvaise nouvelle : elle a aussi parlé de vous au journal.' : ''
      }`,

    siteExists: (site) => `Cette entreprise a déjà ${site}. Une seule par matière : même les barons ont un plafond.`,
    siteMissing: (site) => `Il faudrait d’abord remporter ${site} aux enchères. On ne met pas en sommeil ce qui n’existe pas.`,
    siteAlreadyDormant: 'Cette filiale dort déjà. Plus profond, c’est la faillite.',
    siteNotDormant: 'Cette filiale tourne déjà. Pour la relancer, il faudrait d’abord l’arrêter.',
    siteDormantDone: (upkeep) =>
      `Filiale mise en sommeil : plus d’extraction dès la clôture, mais un entretien de ${m(upkeep)} par trimestre (gardiens, pompes, assurance). La relancer prendra un trimestre.`,
    siteRestarted: 'Relance lancée : un trimestre de remise en route, l’extraction reprend à la clôture suivante.',
    siteSlotUnknown: 'Gisement inconnu : il n’est sur aucune carte, même pas celle du cadastre.',
    siteSlotTaken: (site) => `${site} est déjà exploité. Il faudra attendre une faillite, ou racheter son propriétaire.`,
    siteBidLastTurn: 'Dernier trimestre : une filiale remportée à la clôture n’aurait plus le temps d’extraire un seul lot. Le commissaire-priseur range son marteau.',
    siteBidLow: (site, reserve) => `La mise à prix pour ${site} est de ${m(reserve)} : en dessous, le commissaire-priseur ne lève même pas les yeux.`,
    siteBidCash: (site, amount, c, cash) => `Miser ${m(amount)} pour ${site} : ${c} n’a que ${m(cash)} en caisse.`,
    siteBidPlaced: (site, amount, reserve) =>
      `Jusqu’à ${m(amount)} pour ${site}. Résultat à la clôture : la plus haute mise sur ce gisement l’emporte et paie la meilleure mise perdante (${m(reserve)} sans concurrent), jamais plus que sa mise. Elle ne compte que jusqu’à la trésorerie de l’entreprise à ce moment-là ; une mise sur un autre gisement de la même matière remplacerait celle-ci.`,
    siteNoBid: 'Aucune mise en cours sur cette matière : rien à retirer.',
    siteBidCancelled: 'Mise retirée.',
    unknownZone: 'Zone inconnue : même les promoteurs ne l’ont pas encore bétonnée.',
    unknownHex: 'Case inconnue : le cadastre refuse ce numéro.',
    hexNotBuildable: 'Case réservée à un gisement : pas de place pour une usine.',
    hexOccupied: 'Cette case accueille déjà une usine. Une seule usine par case.',
    hexBoardFull: 'Le plateau est complet : aucune case constructible libre.',
    hexBidLastTurn: 'Dernier trimestre : les enchères de cases sont closes, aucune usine ne pourrait y vendre.',
    hexBidLow: (h, reserve) => `La mise à prix pour ${h} est de ${m(reserve)}. Le cadastre refuse les petites enveloppes.`,
    hexBidCash: (bid, cost, c, cash) => `Mise de ${m(bid)} et frais de ${m(cost)} : ${c} n’a que ${m(cash)} en caisse.`,
    hexBidDuplicate: 'Tu as déjà une mise sur cette case, toutes tes entreprises confondues.',
    hexFallbackInvalid: 'Choisis un repli vers la case libre la plus proche, ou l’abandon.',
    hexBidOnly: 'Les enchères de cases sont réservées au plateau hexagonal.',
    hexNoBid: 'Aucune mise en cours pour cette usine ou ce projet.',
    hexBidCancelled: 'Mise retirée ; un projet de lancement annulé disparaît sans frais.',
    hexLaunchPlanned: (p, h, bid) => `Projet ${p} : jusqu’à ${m(bid)} pour ${h}, sous pli fermé. Aucun paiement ni lancement avant l’adjudication à la clôture.`,
    hexMovePlanned: (p, h, bid) => `Usine de ${p} : jusqu’à ${m(bid)} pour ${h}, sous pli fermé. Elle garde sa position ce trimestre ; terrain et déménagement se paient seulement si elle gagne.`,
    hexStartupPlanned: (p, h, bid, fallback) => `Start-up ${p} : jusqu’à ${m(bid)} pour ${h}, sous pli fermé. Elle vend depuis l’incubateur de la capitale ce trimestre ; le terrain ne se paie qu’à l’adjudication. ` +
      (fallback === 'nearest' ? 'Si la case lui échappe : la case libre la plus proche.' : 'Si la case lui échappe, elle reste à l’incubateur et pourra miser de nouveau ; au bout de deux trimestres, elle prend d’office la case libre la plus proche.'),
    incubatorOver: (p, h, price) => `Fin de l’incubation : ${p} s’installe d’office à ${h}, à la mise à prix (${m(price)}).`,
    incubatorExtended: (p, h, price) => `Incubation prolongée : ${p} n’a pas de quoi payer la case libre la plus proche (${h}, ${m(price)}). Nouvel essai à la prochaine clôture.`,
    hexFallbackBody: (h) => ` Repli sur ${h}, sans mise valable sur cette case : le cadastre facture sa mise à prix.`,
    hexStartupBody: ' La start-up quitte l’incubateur de la capitale ; ses prochaines ventes partiront de cette case.',
    factoryAlreadyThere: (p, z) => `L’usine de ${p} est déjà à ${z}. Déménager sur place, c’est juste repeindre.`,
    factoryMovePending: (p, h) => `Le déménagement de l’usine de ${p} vers ${h} est déjà réservé. Il sera exécuté après la clôture.`,
    factoryMoveLastTurn: 'Dernier trimestre : il est trop tard pour réserver un déménagement après la clôture.',
    factoryMoveCash: (p, cost, c, cash) => `Déménager l’usine de ${p} coûte ${m(cost)} : ${c} n’a que ${m(cash)} en caisse.`,
    factoryMoved: (p, z, cost) =>
      `L’usine de ${p} déménage à ${z} pour ${m(cost)}, passés en charges spéciales. Elle produit d’ici dès cette clôture ; les routes, elles, n’ont pas été consultées.`,
    factoryMovedFree: (p, z) => `L’usine de ${p} s’installe à ${z}, sans frais : le produit démarre ce trimestre. Elle produit d’ici dès cette clôture.`,
    factoryMovePlanned: (p, z, cost) => `Déménagement de l’usine de ${p} vers ${z} réservé pour ${m(cost)}. Elle produit encore sur sa case actuelle ce trimestre et s’installe après la clôture.`,
    launchZone: (z) => ` Usine installée à ${z}.`,

    offerOnlyPlayers: 'Seul un joueur peut négocier.',
    offerUnknownPlayer: 'Interlocuteur introuvable : il a dû partir avec la caisse.',
    offerSelf: 'Négocier avec soi-même ? Même les holdings ont leurs limites.',
    offerAutopilot: (c) => `${c} est en pilote automatique : personne n’y signe quoi que ce soit.`,
    offerLimit: (n) => `Pas plus de ${int(n)} offres par trimestre : les avocats facturent à l’heure.`,
    offerSent: (to) => `Offre envoyée à ${to}. Réponse attendue avant la clôture du trimestre.`,
    offerBotAccepted: (bot, details) => `${bot} accepte sans même relire. ${details}`,
    offerBotDeclined: (bot) => `${bot} décline poliment, et note votre nom quelque part.`,
    offerNotFound: 'Offre introuvable ou expirée : les affaires se concluent dans le trimestre.',
    offerNotForYou: 'Cette offre ne vous est pas adressée.',
    offerNotYours: 'Cette offre n’est pas la vôtre.',
    offerDeclined: 'Offre déclinée. La politesse ne coûte rien.',
    offerCancelled: 'Offre retirée. On fera comme si de rien n’était.',
    blockPriceBand: (min, max) => `Prix hors des clous : entre ${sp(min)} et ${sp(max)} par action (± 25 % du cours). Au-delà, c’est un cadeau déguisé.`,
    blockNotEnough: (seller, held, ticker) => `${seller} n’a que ${int(held)} actions ${ticker} à céder.`,
    blockCash: (buyer, total) => `${buyer} n’a pas ${m(total)} de cash perso.`,
    blockFloat: 'Au-delà de 50 % + 1 action, le flottant minimal s’applique aussi aux cessions de gré à gré.',
    blockOwnFounder: (c) => `${c} a été fondée ce trimestre : les actions du fondateur sont bloquées jusqu’à la clôture.`,
    blockDone: (n, ticker, seller, buyer, price, total) =>
      `${int(n)} actions ${ticker} passent de ${seller} à ${buyer} à ${sp(price)} l’une (${m(total)}), hors marché : le cours ne bouge pas.`,
    contractBounds: (min, max, lots, turns) =>
      `Contrat hors des clous : prix du lot entre ${m(min)} et ${m(max)}, ${int(lots)} lots par trimestre et ${int(turns)} trimestres au plus.`,
    contractNotYours: 'Il faut diriger l’une des deux entreprises pour proposer un contrat.',
    contractSameCompany: 'Une entreprise ne se livre pas à elle-même, même pour embellir ses comptes.',
    contractArmsLength: (min, max) =>
      `Entre deux entreprises de votre groupe, le prix reste à ± 10 % du cours de la dernière clôture : entre ${m(min)} et ${m(max)} le lot. Le fisc a lu les mêmes manuels que vos fiscalistes.`,
    contractExists: (cname) => `Ces deux entreprises ont déjà un contrat de ${cname} en cours : un seul à la fois par matière.`,
    contractSigned: (seller, buyer, lots, cname, price, turns) =>
      `Contrat signé : ${seller} livrera ${int(lots)} lots de ${cname} par trimestre à ${buyer}, à ${m(price)} le lot, pendant ${int(turns)} trimestres (livraison à chaque clôture, avant la production).`,
    cartelNeedsProducts: (sector) => `Pour s’entendre sur les prix des ${sector}, il faut que les deux entreprises en vendent.`,
    cartelSelf: 'Une entente avec vous-même, c’est une stratégie, pas un cartel.',
    cartelAlready: 'Ces deux entreprises s’entendent déjà. Un deuxième déjeuner n’y changera rien.',
    cartelOther: 'Votre entreprise est déjà dans une autre entente sur ce secteur : on ne sert pas deux maîtres.',
    cartelSigned: (sector, n, risk) =>
      `Entente conclue sur les ${sector} (${int(n)} membres) : vous voyez les prix du trimestre en cours de vos partenaires. Risque d’être découverts à la prochaine clôture : ${risk}, et il grandit avec le temps.`,
    cartelNone: (sector) => `Aucune entente en cours sur les ${sector} pour cette entreprise.`,
    cartelLeft: (sector) =>
      `Vous quitterez l’entente sur les ${sector} à la clôture : d’ici là, le risque de ce trimestre court toujours. Vos partenaires apprécieront.`,
    cartelLeaving: (sector) => `Vous quittez déjà l’entente sur les ${sector} à la clôture.`,

    shadyUnknownEvenForYou: 'Action discutable inconnue (même pour vous).',
    shadyOncePerTurn: 'Une seule action de ce type par trimestre. Même la corruption a ses horaires.',
    shadyCash: (cost) => `Trésorerie insuffisante : il faut ${m(cost)}.`,
    lobbyingNeedsSector: 'Lobbying : précisez un secteur valide.',
    lobbyingDetails: (s) => `Demande du secteur ${s} ×1,15 pendant 2 trimestres.`,
    taxDetails: 'Impôt à 5 % ce trimestre.',
    greenwashingDetails: 'Attractivité ×1,3 sur tous vos produits ce trimestre.',
    offshoringDetails: 'Main-d’œuvre −30 % pendant 3 trimestres, réputation −0,1.',
    spyTargetGone: 'Cible d’espionnage introuvable ou disparue.',
    spySelf: 'S’espionner soi-même : audacieux, mais inutile.',
    spyNobody: 'Aucun concurrent à espionner dans vos secteurs.',
    spyNothingToSteal: 'Vos produits font déjà mieux que la concurrence : il n’y a rien à copier chez eux.',
    spyDetails: (gains) => gains.map((g) => `${g.product} +${FR_NF2.format(g.gain)} de qualité`).join(', ') + '.',
    smearNeedsTarget: 'Campagne de dénigrement : il faut une cible cotée.',
    smearSelf: 'Vous dénigrer vous-même ? Les journalistes s’en chargent déjà.',
    smearDetails: (t) => `L’action ${t} perd 15 %.`,
    shadyUnknown: 'Action discutable inconnue.',
    shadyDone: (details, cost, scandal) => `${details} Coût : ${m(cost)}, jauge de scandale +${scandal}.`,

    autopilotNoMerge: 'Le pilote automatique ne fusionne rien.',
    mergeSelf: 'Fusionner une entreprise avec elle-même : même les banquiers d’affaires n’osent pas.',
    mergeTooMany: (abs, max, a, b) =>
      `Fusion impossible : ${abs} dépasserait ${max} produits actifs (${a} + ${b}). Arrêtez d’abord des produits.`,
    mergeJustFounded:
      'Fusion impossible le trimestre même de la création d’une start-up : laissez-lui au moins le temps d’imprimer ses cartes de visite.',
    merged: (target, abs, issued, at, tt, ratio) =>
      `${target} absorbée par ${abs} : ${int(issued)} actions ${at} émises (1 action ${tt} = ${FR_NF2.format(ratio)} ${at}).`,
    mergeTakeover: (p) => ` Coup de théâtre : ${p} dépasse 50 % de l’ensemble et en prend le contrôle !`,
  };

  return {
    lang: 'fr',
    terrainAppreciation: { very_good: 'très bon', good: 'bon', average: 'moyen', poor: 'mauvais' },
    money: m,
    sharePrice: sp,
    pct,
    lots,
    int,
    dec1: (n) => FR_NF1.format(n),
    dec2: (n) => FR_NF2.format(n),

    gameOver: 'La partie est terminée : place au classement.',
    unknownPlayer: 'Joueur inconnu dans cette partie.',
    internalError: 'Erreur interne : action ignorée. Le service comptable enquête.',
    botTakeoverDisabled: 'Cette partie n’autorise pas la reprise des bots.',
    botTakeoverLastTurn: 'Le dernier trimestre a commencé : il est trop tard pour reprendre un bot.',
    botTakeoverUnavailable: 'Ce joueur n’est plus un bot disponible.',
    botTakeoverNameInvalid: 'Choisissez un pseudo non vide.',
    botTakeoverNameTaken: 'Ce pseudo est déjà utilisé dans la partie.',
    botTakeoverClaimed: (turn) => `Bot repris : vous pourrez agir à partir du trimestre ${turn}. Ses décisions déjà prises restent en place jusque-là.`,
    botTakeoverPending: (turn) => `La reprise devient active au trimestre ${turn}. Vous pouvez consulter la partie en attendant.`,

    placeholders: {
      level: 'un niveau inquiétant',
      company: 'une entreprise cotée',
      ceo: 'un PDG',
      sector: 'un secteur porteur',
      commodity: 'une matière première',
      player: 'un investisseur',
      acquirer: 'un prédateur',
      target: 'une proie',
      product: 'un produit miracle',
      amount: 'une somme indécente',
      pct: 'une part significative',
    },

    anonymous: 'Anonyme',
    defaultCompanyName: (name) => `${name} & Cie`,
    autopilotCeo: 'Pilote automatique',
    autopilotTagline: 'Rien à signaler.',
    startupSuffixes: ['Revanche', 'Reloaded', '2.0', 'Phénix', 'Le Retour', 'Next'],
    otherCompetitors: 'Autres concurrents',
    controlHandoverTitle: (heir, c) => `${heir} reprend les commandes chez ${c}`,
    autopilotTitle: (c) => `${c} passe en pilote automatique`,
    rumorLeakTitle: (p) => `${p} surpris·e en train de glisser une enveloppe à un journaliste`,
    rumorLeakBody: 'Le Capital Quotidien rappelle que ses sources ne sont pas à vendre. Sauf exception, et sur facture.',
    siteName: { oil: 'un puits de pétrole', lithium: 'une mine de lithium', sugar: 'une raffinerie de sucre', chips: 'une fonderie de puces' },
    slotLabel: (name) => `« ${name} »`,
    siteAwardTitle: (c, site) => `Adjugé ! ${c} remporte la filiale « ${site} »`,
    siteAwardBody: (price, n) =>
      `Prix d’adjudication ${price}, ${n} candidat${n > 1 ? 's' : ''} sur ce gisement. Intégration verticale : on ne dépend plus des marchés, on les fait. Les riverains n’ont pas été consultés, ils sont en aval.`,
    blockSaleTitle: (buyer, pct, c, seller) => `Cession de gré à gré : ${buyer} rachète ${pct} de ${c} à ${seller}`,
    blockSaleBody: (total) => `Montant de la transaction : ${total}, conclue hors marché, entre la poire et le fromage.`,
    cartelBustedTitle: (sector, list) => `Entente sur les prix dans le secteur ${sector} : ${list} condamnées`,
    cartelBustedBody: (total) => `Les enquêteurs ont retrouvé les comptes rendus de déjeuners « strictement amicaux ». Amendes : ${total} au total.`,

    fallbackHeadlines: {
      takeover: ['{acquirer} prend le contrôle de {target}'],
      ousted: ['Éviction de {player} chez {company} : parachute doré de {amount}'],
      oustedBroke: ['{player} quitte {company} sans parachute : la caisse était vide'],
      scandal: ['Scandale chez {company} : {amount} d’amende'],
      bankruptcy: ['{company} dépose le bilan'],
      productLaunch: ['{company} lance {product} ({sector})'],
      hexProductLaunch: ['{company} lance {product} ({sector})'],
      bigProfit: ['{company} annonce {amount} de bénéfice'],
      bigLoss: ['{company} perd {amount}'],
      ceoBonus: ['{ceo} s’accorde un bonus de {amount} chez {company}'],
      startup: ['{player} fonde {company}'],
      merger: ['{acquirer} absorbe {target}'],
      poisonPill: ['{company} dégaine la pilule empoisonnée'],
      buyback: ['{company} rachète ses propres actions pour {amount}'],
      dividend: ['{company} verse {amount} de dividendes'],
      marginCall: ['{player} victime d’un appel de marge'],
      stakeBuilding: ['{player} monte à {pct} du capital de {company}'],
      insiderBuying: ['{ceo} rachète {pct} de sa propre entreprise {company} : l’autorité des marchés s’interroge'],
      whistleblow: ['Un lanceur d’alerte dénonce {company} : jauge de scandale à {level}'],
      quarterIntro: ['Nouveau trimestre, nouvelles occasions de s’enrichir.'],
    },

    bodies: {
      takeoverNoCeo: [
        'Le pilote automatique n’a opposé aucune résistance. Il n’avait d’ailleurs pas été consulté.',
        'Aucun PDG à évincer : le conseil d’administration a simplement changé de fauteuil.',
        'Prise de contrôle sans combat : il n’y avait personne pour signer la reddition.',
        'Le pilote automatique a été remercié par courriel. Il n’a pas répondu : c’est un pilote automatique.',
        'Ni résistance, ni parachute, ni larmes : l’OPA la plus paisible de l’année.',
        'Le nouveau patron a trouvé un bureau vide et une plante verte morte depuis des mois.',
        'Pas de PDG à licencier, donc pas d’indemnités à verser. Les avocats sont presque déçus.',
        'Le conseil d’administration a appris qu’il avait un nouveau propriétaire en lisant le journal.',
        'Racheter une entreprise sans dirigeant, c’est cambrioler une maison dont la porte est grande ouverte.',
        'L’acquéreur parle d’un « projet industriel ». Il a surtout vu une proie sans défense.',
        'Le standard téléphonique annonce désormais un nouveau nom. Personne ne l’avait prévenu non plus.',
        'Les salariés ont appris la nouvelle devant la machine à café, comme toutes les nouvelles importantes.',
        'Le pilote automatique rend les clés sans histoire. Il réclame seulement une mise à jour.',
        'La bataille boursière a duré un après-midi, faute d’adversaire.',
        'Les analystes saluent une « transition fluide ». Il n’y avait rien à faire transiter.',
      ],
      controlHandover: [
        'Le fauteuil était vide, quelqu’un s’est assis dedans.',
        'Faute de combattants, le plus gros actionnaire récupère les clés du bureau.',
        'Le nouveau patron a déjà fait changer la plaque sur la porte. Le reste attendra.',
        'Premier acte du nouveau dirigeant : commander un fauteuil plus haut que celui de son prédécesseur.',
        'Personne ne s’est présenté contre lui. Pas même le pilote automatique, qui n’a pas d’avis.',
        'Le conseil d’administration a voté à l’unanimité, c’est-à-dire à une voix.',
        'Le personnel découvre son nouveau chef sur une photo officielle très retouchée.',
        'Un nouveau capitaine monte à bord. Il promet de lire le manuel de navigation plus tard.',
        'Le plus gros actionnaire prend les commandes : la démocratie actionnariale fonctionne, pour lui.',
        'Le discours d’investiture promet « une nouvelle ère ». Elle commence lundi, après le séminaire.',
        'L’assistante de direction a rangé les dossiers du pilote automatique : il n’y en avait aucun.',
        'Nouveau PDG, nouvelle vision, même machine à café.',
      ],
      controlSold: [
        'Le vendeur a empoché le chèque et laissé les clés sur le bureau. Pas de parachute : on ne saute pas d’un avion qu’on vient de vendre.',
        'Poignée de main, chèque, photo souriante : la passation la plus aimable du trimestre.',
        'L’ancien patron part avec le prix de ses actions, et rien d’autre. Le parachute doré, c’est pour ceux qu’on pousse.',
        'Vendu, signé, encaissé. Le personnel a appris la nouvelle par le journal, comme d’habitude.',
        'Le siège attend avec angoisse le premier « plan de transformation ».',
        'Une passation de pouvoir sans poignée de main : il n’y avait personne à qui la serrer.',
        'Le nouveau dirigeant a déjà réclamé une place de parking réservée. L’essentiel est assuré.',
      ],
      autopilot: [
        'Plus aucun actionnaire de référence : la société passe en pilote automatique.',
        'Le dernier capitaine a quitté le navire. Le pilote automatique prend la barre.',
        'Plus de patron, plus de réunions, plus de décisions. Certains salariés parlent d’âge d’or.',
        'L’entreprise tourne toute seule, ce qui en dit long sur l’utilité de la direction précédente.',
        'Le conseil d’administration se réunit désormais pour regarder le cours et soupirer.',
        'Aucun actionnaire n’en veut vraiment. Les salariés, eux, continuent de venir par habitude.',
        'Le bureau du PDG est vide. La plante verte reçoit enfin toute l’attention qu’elle mérite.',
        'Pilote automatique enclenché : le cap est maintenu, faute de quelqu’un pour le changer.',
        'La société n’a plus de maître. Les prédateurs de la cote commencent à tourner autour.',
        'Les décisions stratégiques sont suspendues. Personne n’a remarqué la différence.',
        'L’organigramme a un grand trou tout en haut. Les consultants appellent ça « une structure plate ».',
        'Le dernier dirigeant est parti avec l’agrafeuse. L’entreprise, elle, est restée.',
        'Plus de capitaine à bord, mais le navire flotte encore. Pour combien de temps, mystère.',
        'Mode automatique activé : on produit, on vend, et on attend un nouveau propriétaire.',
        'Le poste de PDG est vacant. Candidatures acceptées uniquement par achat d’actions.',
      ],
      insiderBuying: [
        '« Je crois simplement en notre avenir », assure le PDG, qui connaît les chiffres du trimestre avant tout le monde.',
        'Le gendarme de la bourse a ouvert un dossier. Il l’a rangé entre deux autres dossiers sur le même PDG.',
        'Le PDG jure n’avoir aucune information privilégiée. Il a juste lu les comptes avant de les publier.',
        'Les petits porteurs apprécient moyennement d’apprendre qu’ils vendaient au patron.',
        'Timing parfait, comme d’habitude. Les enquêteurs adorent le timing parfait.',
        'Le conseil d’administration parle d’un « signal de confiance ». Le régulateur parle d’un « signal tout court ».',
      ],
      whistleblow: [
        'L’informateur signe « Gorge profonde, service compta ». La direction a lancé un audit… des imprimantes.',
        'Le dossier est arrivé par la poste, dans une boîte à chaussures. La rédaction a gardé les chaussures.',
        'La direction dément « des rumeurs sans fondement », puis annule sa conférence de presse.',
        'Le régulateur promet de « regarder cela de près », ce qui, chez lui, signifie en fin de trimestre.',
        'Selon nos informations, l’auteur de la fuite serait un concurrent. La rédaction ne publie que les faits, et les chiffres.',
        'Les avocats de l’entreprise ont déjà trouvé un coupable : le stagiaire. Il est en vacances depuis trois mois.',
      ],
      stakeBuilding: [
        'Tout le monde est prévenu. Le PDG en place commence à transpirer.',
        'Une montée au capital « purement financière », jure l’intéressé.',
        'Les avocats d’affaires sortent déjà les couteaux.',
        'Le registre des actionnaires est soudain devenu la lecture préférée du conseil d’administration.',
        '« Un simple placement de père de famille », assure l’acheteur, en passant un nouvel ordre.',
        'Le PDG en place a demandé à ses avocats de ne plus jamais éteindre leur téléphone.',
        'Les analystes parlent d’un « intérêt marqué ». Le PDG parle d’un « cauchemar ».',
        'Chaque titre acheté rapproche un peu plus l’acheteur du bureau du dernier étage.',
        'La cible feint l’indifférence, mais vient de réserver une salle de crise pour tout le trimestre.',
        'Le seuil est franchi, la déclaration obligatoire. Les intentions, elles, restent floues.',
        'Les petits porteurs regardent passer les gros ordres et se demandent s’il faut vendre ou prier.',
        'L’approche est « amicale », jure-t-on. Comme un loup qui passe à la bergerie pour discuter.',
        'Le conseil d’administration découvre l’expression « ramassage en bourse » et ne l’aime pas du tout.',
        'Dans les couloirs du siège, on commence discrètement à mettre à jour les CV.',
        'L’acheteur répète qu’il n’a « aucune intention hostile ». Il le répète un peu trop souvent.',
      ],
      startup: [
        'Le business plan tient en trois diapositives, dont une de remerciements.',
        'Subvention publique à l’innovation incluse. L’innovation, elle, arrivera plus tard.',
        'Le fondateur promet de « disrupter » un marché dont il n’a pas encore trouvé le nom.',
        'Premier recrutement : un responsable du bonheur. Deuxième : quelqu’un pour s’occuper du chiffre d’affaires.',
        'Le pitch tient en quatre mots : « comme l’existant, mais mieux ». Les investisseurs adorent.',
        'Une levée de fonds est imminente, selon le fondateur. Les fonds n’ont pas été prévenus.',
        'Le logo est prêt, le nom de domaine réservé, les sweats imprimés. Le produit suivra.',
        'Une start-up de plus dans le paysage. Le paysage commence à être un peu encombré.',
        'Le fondateur quitte un emploi stable pour « vivre sa passion ». Sa passion, c’est l’argent.',
        'Les bureaux occupent un ancien entrepôt, rebaptisé « campus » pour les recrutements.',
        'La jeune pousse se dit « agile ». Elle n’a pas encore de jambes.',
        'Le business plan prévoit la rentabilité en année trois. Tous les business plans prévoient l’année trois.',
        'Le fondateur a déjà donné une conférence sur l’échec, par anticipation.',
        'Valeurs affichées : audace, bienveillance, excellence. Salaires affichés : aucun.',
        'Nouvelle entreprise, grandes ambitions, et problèmes de trésorerie bientôt disponibles.',
      ],
      productLaunch: [
        'Le communiqué parle de « révolution ». Les concurrents parlent de « copie ».',
        'Keynote, fumigènes et promesses : tout y est, sauf le mode d’emploi.',
        'Le produit est « pensé pour les nouvelles générations ». Les nouvelles générations n’ont pas été consultées.',
        'Le lancement a coûté plus cher que la conception. C’est la norme du secteur.',
        'Les premiers testeurs sont enthousiastes. Ils sont aussi tous salariés de l’entreprise.',
        'Annoncé en trois versions, dont deux encore à l’état de promesse.',
        'Le marketing promet « une expérience ». Le service après-vente promet de rappeler.',
        'Présentation sur scène, col roulé noir, silence dramatique : le produit a failli passer inaperçu.',
        'La concurrence réagit avec calme, c’est-à-dire en convoquant une réunion d’urgence.',
        'Un produit « unique en son genre », selon la direction, qui n’a pas regardé la concurrence.',
        'La fiche technique fait deux pages. Le communiqué de presse en fait douze.',
        'Les affiches sont prêtes, l’infrastructure en installation. Les acheteurs attendront le prochain trimestre.',
        'La direction vise « le cœur du marché ». Le marché, lui, voit déjà quelqu’un d’autre.',
        'Le produit est le fruit « d’années de recherche ». De trois semaines, en réalité.',
        'Premiers retours : « prometteur ». Un mot qui ne veut rien dire, donc tout le monde est content.',
      ],
      hexProductLaunch: [
        'L’usine sent encore la peinture fraîche ; les premiers cartons partent quand même ce trimestre.',
        'Le terrain a été payé comptant, le discours inaugural aussi.',
        'Le maire a coupé le ruban, le marketing a coupé la parole au maire.',
        'Les premiers clients découvrent le produit en même temps que les ouvriers.',
        'Le Commissariat salue « un aménagement exemplaire du territoire ». Il dit ça de tous les parkings.',
      ],
      ceoBonus: [
        'Le montant a été validé par un comité indépendant, composé du PDG et de son miroir.',
        'Les salariés apprécieront : la prime d’intéressement, c’était donc ça.',
        'Le bonus est indexé sur la performance. La performance a été redéfinie pour l’occasion.',
        'La direction rappelle que le talent a un prix. Le prix a été fixé par le talent lui-même.',
        'Le montant équivaut à trois siècles de salaire d’un employé. Un détail d’arrondi.',
        'Un bonus « raisonnable », selon le bénéficiaire, dont le dictionnaire est très souple.',
        'Les syndicats demandent des explications. On leur a envoyé un graphique très coloré.',
        'Le PDG explique qu’il faut « retenir les meilleurs ». Il s’est donc retenu lui-même.',
        'Le virement est parti un vendredi soir, heure traditionnelle des mauvaises nouvelles.',
        'Le conseil l’a approuvé à l’unanimité, après un excellent déjeuner offert par le PDG.',
        'Les petits actionnaires grincent des dents. Le yacht, lui, a reçu une nouvelle couche de vernis.',
        'La rémunération variable n’a jamais aussi bien porté son nom : elle ne varie que vers le haut.',
        '« C’est le marché », explique le PDG. Le marché, c’est surtout lui.',
        'L’argent sera réinvesti, promet le dirigeant. Dans une résidence secondaire.',
        'L’intéressé juge son bonus « modeste ». Après tout, il aurait pu prendre toute la trésorerie.',
      ],
      poisonPill: [
        'Des actions neuves à prix cassé pour le PDG en place : le raider va devoir repasser à la caisse.',
        'Défense anti-OPA activée. Les petits porteurs, eux, sont dilués sans ménagement.',
        'Le capital gonfle d’un coup : le prédateur va devoir repasser à la banque.',
        'La cible s’est transformée en hérisson. Les petits porteurs ont récupéré les piquants.',
        'Le PDG s’accroche à son fauteuil avec une détermination qui force le respect. Ou la dilution.',
        'Les avocats applaudissent : la manœuvre est légale, lucrative, et facturée à l’heure.',
        'Le raider dénonce « une atteinte au libre marché ». Le PDG répond « une atteinte à mon bureau ».',
        'Émission express : la défense la plus chère jamais payée par des actionnaires qui n’avaient rien demandé.',
        'La pilule est avalée. Les effets secondaires seront supportés par tous les autres actionnaires.',
        'Le conseil assure agir « dans l’intérêt de la société ». La société, en l’occurrence, c’est le PDG.',
        'Le prédateur devra acheter plus d’actions, plus cher. Sa calculatrice fume.',
        'Défense classique : quand on ne peut pas gagner la partie, on rajoute des cases au plateau.',
        'Le cours tousse, les minoritaires grimacent, le PDG sourit.',
        'Les analystes parlent d’une « défense musclée ». Les minoritaires, d’un « coup de bâton ».',
        'La forteresse tient, au prix d’une nouvelle couche de béton coulée sur les petits porteurs.',
      ],
      buyback: [
        'Moins d’actions en circulation, plus de fierté dans les couloirs.',
        'La trésorerie part en bourse… pour racheter la maison.',
        'La direction n’a pas trouvé de meilleur investissement qu’elle-même. Quelle modestie.',
        'Le bénéfice par action progresse mécaniquement. Les ventes n’y sont pour rien.',
        'L’entreprise se rachète elle-même : un circuit court très apprécié des actionnaires.',
        'Pourquoi investir dans les infrastructures quand on peut investir dans le cours ? C’est plus rapide.',
        'Les stock-options de la direction saluent une décision pleine de sagesse.',
        'La R&D réclamait un budget. Elle a reçu un graphique du cours de bourse.',
        'Moins de titres en circulation : chaque action vaut un peu plus, chaque salarié un peu moins.',
        'La trésorerie faisait la sieste. On l’a réveillée pour lui faire acheter l’entreprise où elle dormait.',
        'Les actions rachetées rejoignent le paradis des titres annulés. Paix à leurs dividendes.',
        'La direction croit tellement en l’avenir de l’entreprise qu’elle en rachète des morceaux.',
        'Les analystes saluent « un signal de confiance ». Un signal qui coûte assez cher.',
        'Un rachat d’actions, c’est un dividende qui a pris des cours de discrétion.',
        'Le cours monte, la trésorerie descend : tout est question de point de vue.',
      ],
      dividend: [
        'Les actionnaires trinquent. La trésorerie, elle, paie la tournée.',
        'Il pleut des billets sur le registre des actionnaires. Parapluies interdits.',
        'Les actionnaires ouvrent le champagne. Les salariés ouvrent leur fiche de paie, sans champagne.',
        'Le dividende est « le fruit du travail de tous ». Le fruit, lui, est réservé.',
        'Un virement tombe sur le compte de chaque actionnaire. Même ceux domiciliés aux îles.',
        'La trésorerie maigrit, l’assemblée générale se remplit : tout le monde veut sa part.',
        'Les investisseurs saluent une politique de distribution « généreuse ». En privé, ils disent « le minimum ».',
        'L’argent quitte l’entreprise pour aller dormir sur d’autres comptes. Le cycle de la vie.',
        'Le directeur financier signe les virements avec la mine de quelqu’un qui rêvait d’infrastructures neuves.',
        'Les petits porteurs touchent de quoi s’offrir un café. Les gros, de quoi s’offrir le café.',
        'Distribution réussie : l’entreprise est un peu plus pauvre, ses propriétaires un peu plus riches.',
        'Le versement fait la joie des rentiers et le désespoir du service investissement.',
        'Le cours salue la nouvelle, puis se souvient que l’argent n’est plus dans la caisse.',
        'Rendement généreux ce trimestre. Personne ne demande d’où il vient : ce serait impoli.',
        'Les actionnaires ont voté à l’unanimité pour recevoir de l’argent. Surprise générale.',
      ],
      merger: [
        'Deux cantines, un seul menu : les synergies arrivent.',
        'Les actionnaires de la cible reçoivent des titres de l’absorbante. Les salariés, une note de service.',
        'Le nouvel ensemble promet des « synergies ». Traduction : les doublons ont intérêt à chercher ailleurs.',
        'Deux logos, un seul survivra. L’agence de design a déjà envoyé sa facture.',
        'La fusion crée « un champion ». Le champion doit d’abord trouver où loger deux services comptables.',
        'Les dirigeants se serrent la main devant les photographes. Les équipes se regardent en chiens de faïence.',
        'L’absorbée disparaît de la cote. Son nom survit sur quelques mugs du service marketing.',
        'Les consultants chargés de l’intégration voient leurs honoraires fusionner vers le haut.',
        'La cible perd son indépendance et gagne un nouvel organigramme. L’échange est inégal.',
        '« Une union entre égaux », dit le communiqué. Le siège social, lui, reste chez l’absorbante.',
        'Les actionnaires de la cible possèdent désormais un morceau d’un groupe plus gros, et plus confus.',
        'Les deux cultures d’entreprise vont devoir cohabiter. Un séminaire de cohésion est prévu.',
        'Le nouveau groupe pèse plus lourd en bourse. Et en réunions.',
        'Les concurrents perdent un rival, les clients un choix, et le patron gagne un bureau plus grand.',
        'Le mariage est conclu. Le contrat prévoit la garde des places de parking, pas celle des salariés.',
      ],
      bigProfit: [
        'Les actionnaires applaudissent, les salariés un peu moins.',
        'La direction attribue ce succès à « sa vision ». Les clients, à l’absence d’alternative.',
        'Le directeur financier a fait vérifier deux fois. Le chiffre était juste, il en a pleuré.',
        'Trimestre exceptionnel. La direction prévient qu’elle en attendra autant au prochain.',
        'Les analystes relèvent leurs objectifs. Ils les avaient baissés le trimestre dernier, par prudence.',
        'Les salariés ont reçu une carte de félicitations. Les actionnaires, une promesse de dividende.',
        'Un résultat « historique », selon la direction. L’histoire retiendra surtout le bonus qui suivra.',
        'Même les concurrents ont applaudi. Du bout des doigts, et en prenant des notes.',
        'Les clients paient, les coûts baissent, la marge sourit : la formule magique a fonctionné.',
        'Le PDG attribue ce succès à son leadership. Le stagiaire aussi, mais personne n’écoute le stagiaire.',
        'Les profits pleuvent. La direction rédige déjà les excuses pour la prochaine sécheresse.',
        'Les syndicats ont vu le chiffre. Ils préparent, eux aussi, une présentation.',
        'La bourse salue la performance. Le fisc aussi, mais plus discrètement.',
        'La présentation des résultats s’est achevée sur une ovation debout, surtout de la part du PDG.',
        'Le chiffre est si beau qu’on l’a imprimé en grand et accroché dans le hall.',
      ],
      bigLoss: [
        'La direction évoque « une base de comparaison très favorable pour l’an prochain ».',
        'Le directeur financier a été aperçu en train de pleurer dans l’ascenseur.',
        'Les résultats ont été présentés en police de taille 6, pour limiter les dégâts.',
        'La direction invoque « des vents contraires ». Selon la météo, il faisait beau.',
        'Le PDG assure que la stratégie est la bonne. C’est la réalité qui s’est trompée.',
        'Les analystes ont dégainé le mot « décevant », qui signifie « catastrophique » en langage financier.',
        'La perte est qualifiée de « non récurrente ». Comme celle du trimestre dernier.',
        'Le rapport annuel sera imprimé sur papier recyclé, pour une fois par nécessité.',
        'La conférence de presse a été écourtée, faute de bonnes nouvelles.',
        'Le conseil exige un plan de redressement. Le PDG exige un café.',
        'Les investisseurs se consolent : techniquement, les pertes sont reportables.',
        'La direction annonce des économies. Les plantes vertes du siège sont les premières touchées.',
        'Le graphique du cours a mieux résumé la situation que le communiqué officiel.',
        '« Un trimestre d’investissement », explique la direction. Investissement dans quoi, mystère.',
        'La machine à café du siège a été remplacée par une carafe d’eau. L’heure est grave.',
      ],
      bankruptcy: [
        'Les créanciers se partagent les meubles, les actionnaires se partagent les regrets.',
        'L’action ne vaut plus rien. Le PDG, lui, part sans parachute.',
        'Le liquidateur a fait l’inventaire : trois bureaux, un babyfoot et beaucoup de promesses.',
        'Le mobilier part aux enchères. La dignité, elle, était partie avant.',
        'Les salariés ont appris la nouvelle par courriel, le dernier jamais envoyé par la société.',
        'L’entreprise disparaît de la cote, et de la mémoire collective d’ici la semaine prochaine.',
        'Les créanciers font la queue devant le tribunal. Certains ont apporté un thermos.',
        'Le site internet affiche encore « Rejoignez l’aventure ! ». L’aventure est terminée.',
        'Les actionnaires découvrent que, dans « responsabilité limitée », c’est surtout la valeur qui est limitée.',
        'Le dernier salarié éteint la lumière. Le fournisseur d’électricité réclame déjà sa facture.',
        'Faillite prononcée : le tribunal a tranché plus vite que la direction n’a jamais décidé quoi que ce soit.',
        'Les analystes qui conseillaient d’acheter le mois dernier ont discrètement supprimé leurs notes.',
        'Les trophées « entreprise de l’année » partiront au prix du métal.',
        'Fin d’une aventure entrepreneuriale. Les consultants, eux, facturent le bilan de clôture.',
        'La marque survivra peut-être, rachetée pour une bouchée de pain par un concurrent opportuniste.',
      ],
      scandal: [
        'La direction se dit « choquée d’apprendre ce qu’elle a elle-même organisé ».',
        'Une enquête interne conclut que personne n’est responsable, ce qui rassure beaucoup les responsables.',
        'La direction se dit « sereine ». En langage courant : « nous avons d’excellents avocats ».',
        'Le communiqué évoque des « faits isolés ». Il y en a eu douze.',
        'Une cellule de crise a été créée. Elle a commencé par supprimer quelques courriels.',
        'Les enquêteurs ont saisi une déchiqueteuse encore tiède.',
        'Le PDG se dit « profondément déçu ». Surtout d’avoir été découvert.',
        'L’amende est salée, mais la direction rappelle qu’elle était provisionnée depuis longtemps.',
        'Le responsable de la conformité a découvert que l’entreprise en avait un. C’était lui.',
        'Une charte éthique sera rédigée, juste à temps pour le prochain scandale.',
        'Le service communication a mis trois jours à trouver le mot « regrettable ».',
        'Un lanceur d’alerte a tout révélé. Il a été promu dans un bureau sans fenêtre.',
        'Les avocats de l’entreprise ont déjà trouvé le coupable : « le contexte ».',
        'La direction jure qu’elle ignorait tout. Les courriels internes jurent le contraire.',
        'Le régulateur promet d’être intraitable. Il l’avait déjà promis la dernière fois.',
      ],
      marginCall: [
        'Ses banquiers ont soldé ses meilleures lignes à la casse pour se rembourser.',
        'Le levier fonctionne dans les deux sens. Cette fois, c’était le mauvais.',
        'L’appel de marge est arrivé un lundi matin, avec la délicatesse d’un huissier.',
        'Tout était sous contrôle, jusqu’au moment où plus rien ne l’était.',
        'La banque a appelé. Pas pour prendre des nouvelles de la famille.',
        'Le portefeuille a été liquidé au pire moment, ce qui est précisément le principe.',
        'L’effet de levier a rappelé qu’il pouvait aussi servir de massue.',
        'Acheter à crédit, c’est formidable tant que le cours monte. Le cours ne montait plus.',
        'Les courtiers ont vendu sans prévenir, comme le prévoient les petites lignes du contrat.',
        'L’intéressé parle de « rééquilibrage forcé ». Ses proches parlent de « déroute ».',
        'Le banquier a ouvert le tiroir des garanties et s’est servi à pleines mains.',
        'Les meilleures lignes sont parties les premières. Les pires restent, par solidarité.',
        'Le compte-titres a fondu comme un yaourt oublié au soleil.',
        'Leçon retenue : l’argent emprunté finit toujours par vouloir rentrer chez lui.',
        'Les positions ont été soldées à prix d’ami. L’ami, c’est l’acheteur.',
      ],
      noNews: [
        'Un trimestre sans nouvelle, ce qui est en soi une nouvelle.',
        'Il ne s’est rien passé. Les éditorialistes ont donc écrit sur la météo.',
        'Les marchés ont passé le trimestre à se regarder dans les yeux. Personne n’a cligné.',
        'Ni scandale, ni krach, ni rachat. La rédaction envisage le chômage technique.',
        'Trimestre sans histoire. Même les rumeurs ont pris des vacances.',
        'Le cours de bourse a fait du surplace. Les courtiers ont fait des mots croisés.',
        'Calme plat. Les analystes ont recyclé leurs commentaires du trimestre dernier, personne n’a rien remarqué.',
        'Le silence des marchés est assourdissant. À moins que ce ne soit la climatisation.',
        'Pas une OPA, pas une faillite : le capitalisme fait la sieste.',
        'Notre service économie a interrogé un pigeon sur le parvis de la Bourse. Lui non plus n’avait rien à déclarer.',
        'La volatilité est en congé. Elle reviendra : elle revient toujours.',
        'Trimestre tranquille. Les requins tournent en rond en attendant leur prochain repas.',
        'Rien à signaler, sinon que rien à signaler, c’est suspect.',
        'Les écrans sont restés vert pâle. Les traders ont atteint un niveau d’ennui historique.',
        'La rédaction a dû remplir la page. Cette phrase en est la preuve.',
      ],
      finalEdition: [
        'Les comptes sont arrêtés, les fortunes aussi. Rendez-vous au classement.',
        'Fin de partie. Les gagnants écrivent leurs mémoires, les perdants leurs excuses.',
        'Les marchés ferment, les comptes se figent. L’histoire retiendra les chiffres, pas les méthodes.',
        'Dernier numéro. Merci de nous avoir lus, et surtout d’avoir spéculé.',
        'Le rideau tombe sur la corbeille. Certains repartent en yacht, d’autres à pied.',
        'La cloche de clôture a sonné. Les fortunes sont faites, défaites ou simplement délocalisées.',
        'La partie s’achève. Les parachutes dorés sont distribués ; aucun autre modèle n’avait été commandé.',
        'Clôture définitive. Les vainqueurs remercient leur talent, les vaincus accusent le hasard.',
        'L’heure des comptes a sonné. Pour une fois, ils seront exacts.',
        'Chacun range ses titres. Le capitalisme, lui, ne ferme jamais vraiment.',
        'Rideau. Le classement dira qui a gagné ; la morale n’était pas invitée.',
        'Dernière édition du dernier trimestre. Les bilans sont arrêtés, les ego beaucoup moins.',
        'Fin de l’exercice. Les rentiers sont ravis, les autres aussi, un peu moins.',
        'Les écrans s’éteignent. Quelque part, un expert-comptable pousse un soupir de soulagement.',
        'La partie est terminée. Personne ne sera poursuivi. Probablement.',
      ],
    },
    profitBody: (rev, profit) => `Chiffre d’affaires de ${m(rev)}, bénéfice net de ${m(profit)}.`,
    lossBody: (rev, loss) => `Chiffre d’affaires de ${m(rev)}, perte nette de ${m(loss)}.`,
    marginCallTail: (sold) => `Montant liquidé : ${m(sold)}.`,
    calmTitle: 'Calme plat sur les marchés',
    editorialist: 'L’éditorialiste du Capital Quotidien',
    quoteByline: (name, c) => `${name}, ${c}`,
    insiderSaleBriefs: [
      {
        title: '{ceo} a vendu ses actions de {company} la veille du krach : « une simple coïncidence de calendrier »',
        body: 'Le PDG assure avoir suivi les conseils d’un astrologue. L’Autorité des marchés, elle, a sorti son agenda.',
      },
      {
        title: '« Je n’ai rien vu venir » : {ceo} avait pourtant tout vendu chez {company} un trimestre plus tôt',
        body: 'Les petits porteurs, eux, ont tout vu partir.',
      },
    ],
    finalTitle: (winner, nw) => `Clôture : ${winner} termine en tête avec ${m(nw)}`,

    act,
  };
}

// ---------------------------------------------------------------------------
// English (adaptation : The Daily Capital)
// ---------------------------------------------------------------------------

const EN_NF0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const EN_NF1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const EN_NF2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function enText(): EngineText {
  const m = (k: number) => formatMoney(k, 'en');
  const sp = (k: number) => formatSharePrice(k, 'en');
  const pct = (r: number, d = 1) => formatPct(r, d, 'en');
  const lots = (n: number) => formatLots(n, 'en');
  const int = (n: number) => EN_NF0.format(n);
  const low = (s: string) => s.toLowerCase();
  const shares = (n: number) => (n === 1 ? 'share' : 'shares');

  const act: ActionText = {
    unreadable: 'Unreadable order.',
    unknown: 'Unknown order.',
    companyNotFound: 'Company not found.',
    productNotFound: 'No such product in this company.',
    unknownSector: 'Unknown sector.',
    unknownCommodity: 'Unknown commodity.',
    invalidAmount: 'Invalid amount: a positive number, please.',
    invalidShares: 'Invalid number of shares: a positive whole number, please.',
    invalidLots: 'Invalid number of lots: a positive whole number, please.',
    statusBankrupt: (c) => `${c} is bankrupt: trading suspended, nothing left to do but write the memoirs.`,
    statusMerged: (c) => `${c} has been swallowed whole: it now only exists in the history books.`,
    notAutopilot: (c) => `${c} is not on autopilot.`,
    shownTheDoor: (c) => `You have been shown the door: ${c} is now run by another shareholder.`,
    notController: (c) => `You don’t control ${c}: you need more than 50% of it (or to have founded it without getting ousted).`,

    onlyPlayerBuy: 'Only a player can buy shares.',
    noFloat: (t) => `No ${t} shares left on the market: the whole float is in players’ hands.`,
    onlyFloat: (n, t) => `Only ${int(n)} ${t} ${shares(n)} available in the float.`,
    cantAffordShares: (n, t, total, cash) => `Insufficient funds: ${int(n)} ${t} ${shares(n)} cost ${m(total)}, you have ${m(cash)}.`,
    bought: (n, t, total, avg, c, stake) =>
      `Bought ${int(n)} ${t} ${shares(n)} for ${m(total)} (${sp(avg)} apiece). Your stake in ${c}: ${pct(stake)}.`,
    boughtControl: (c) => ` You now control ${c}. Congratulations, it’s all yours!`,
    insiderBought: (up) =>
      ` A CEO buying up their own company tends to get noticed: scandal meter +${EN_NF1.format(up)} (suspected insider trading).`,
    floatMin: (max, t, minFloat) =>
      `Minimum free float: nobody goes past 50% + 1 share of ${t} if less than ${pct(minFloat, 0)} of the equity stays on the market. ${max > 0 ? `Most you can take: ${int(max)} shares.` : 'Nothing left to scoop up.'} Retail investors have rights, allegedly.`,

    onlyPlayerSell: 'Only a player can sell shares.',
    noneHeld: (t) => `You don’t own a single ${t} share.`,
    onlyHeld: (n, t) => `You only own ${int(n)} ${t} ${shares(n)}.`,
    founderLocked: (c) => `${c} has only just listed: the founder’s shares are locked up until the end of the quarter.`,
    pillLocked: (locked, t, free) =>
      `${int(locked)} of your ${t} shares (from the poison pill) are locked up until the end of the quarter: you can sell ${int(free)}.`,
    sold: (n, t, total, avg) => `Sold ${int(n)} ${t} ${shares(n)} for ${m(total)} (${sp(avg)} apiece).`,
    lostControl: (c) =>
      ` You’re no longer in charge: ${c} slips through your fingers. Buying its shares back this quarter would count as insider trading.`,

    onlyPlayerLoan: 'Only a player can take out a personal loan.',
    personalLoanCap: (limit) =>
      `Personal loan limit: ${m(limit)} (50% of your share portfolio, valued at the lower of the current and last closing price, minus your current debt).`,
    personalLoan: (amount, rate, debt) => `Loan of ${m(amount)} approved at ${pct(rate, 2)} per quarter. Personal debt: ${m(debt)}.`,
    onlyPlayerRepay: 'Only a player can repay a personal loan.',
    noPersonalDebt: 'You have no personal debt to repay.',
    personalCashShort: (cash) => `Not enough personal cash: you have ${m(cash)}.`,
    personalRepaid: (amount, debt) => `${m(amount)} repaid. Personal debt outstanding: ${m(debt)}.`,

    onlyPlayerStartup: 'Only a player can found a startup.',
    startupNeedsName: 'Your startup needs a name (40 characters max).',
    invalidInvestment: 'Invalid investment: a positive number, please.',
    minInvestment: (min) => `Minimum investment: ${m(min)}.`,
    alreadyFounded: 'You have already founded a company this quarter. Even unicorns need their sleep.',
    startupComebackOnly:
      'Startups are reserved for CEOs without a company (ousted or bankrupt): it’s a comeback, not another subsidiary. Run the one you’ve got.',
    startupAfterSellOut: (c) =>
      `You just dumped ${c} by selling your shares: the comeback grant can wait until next quarter. The ministry has seen the “sell, found, buy back” trick before.`,
    startupBorn: (label, cash, subsidy, product) =>
      `${label} is born: ${m(cash)} in the bank (of which ${m(subsidy)} is a government grant), one product (“${product}”) and 50% of the equity for you (locked up until the end of the quarter, like bonuses and dividends).`,

    noDecision: 'No decision supplied.',
    invalidPrice: 'Invalid price: a positive number, please.',
    invalidProduction: 'Invalid production: zero or a positive number, please.',
    invalidMarketing: 'Invalid marketing budget: zero or a positive number, please.',
    invalidRnd: 'Invalid R&D budget: zero or a positive number, please.',
    notePrice: (price, clamped) => `price ${m(price)} per lot${clamped ? ' (brought back within 30%-300% of the reference price)' : ''}`,
    noteProduction: (prod, cap) => `production ${lots(prod)}${cap !== null ? ` (capped at ${lots(cap)} at resolution)` : ''}`,
    noteMarketing: (x) => `marketing ${m(x)}`,
    noteRnd: (x) => `R&D ${m(x)}`,
    decisions: (product, notes) => `${product}: ${notes.join(', ')}.`,

    productNeedsName: 'The product needs a name (40 characters max).',
    maxProducts: (max) => `No more than ${max} active products for this company (6 for a company born of a merger).`,
    launchCash: (sector, cost, c, cash) => `Insufficient cash: a launch (${sector}) costs ${m(cost)}, ${c} has ${m(cash)}.`,
    launched: (product, sector, cost, capacity, price) =>
      `${product} announced (${sector}) for ${m(cost)}: planned capacity ${lots(capacity)}, price ${m(price)} per lot.`,
    launchAmortized: (per, n) => ` The cost is spread over the income statement: ${m(per)} per quarter for ${n} quarters.`,
    launchNextQuarter: ' Infrastructure is installed at this close, with no sales this quarter. The product becomes operational next quarter; first sales are reported at that quarter’s close.',
    discontinued: (product, stock, capacity, cash) =>
      `${product} pulled from the shelves: the plant (${lots(capacity)}), stock (${lots(stock)}) and any land recover ${m(cash)} net, tax-free. That is half their purchase cost, with stock valued at its unit cost.`,

    orderTooBig: (max) => `Order too large: ${lots(max)} maximum.`,
    expandCash: (n, cost, c, cash) => `Insufficient cash: ${lots(n)} of capacity cost ${m(cost)}, ${c} has ${m(cash)}.`,
    expanded: (n, product, cost) => `+${lots(n)} of capacity for ${product}, delivered next quarter. Cost: ${m(cost)}.`,

    marketDepth: (cm, liq) => `The ${low(cm)} market can’t absorb more than ${lots(liq)} in one go.`,
    commodityCash: (n, cm, total) => `Insufficient cash: ${lots(n)} of ${low(cm)} cost ${m(total)}.`,
    commodityBought: (n, cm, total, avg, np) =>
      `Bought ${lots(n)} of ${low(cm)} for ${m(total)} (${m(avg)} per lot). The price moves to ${m(np)}.`,
    onlyInStock: (have, cm) => `You only have ${EN_NF2.format(have)} lots of ${low(cm)} in stock.`,
    commoditySold: (n, cm, total, avg, np) =>
      `Sold ${lots(n)} of ${low(cm)} for ${m(total)} (${m(avg)} per lot). The price moves to ${m(np)}.`,

    companyLoanCap: (c, limit) => `Borrowing limit (${c}): ${m(limit)} (3 × smoothed revenue + 50% of equity, minus existing debt).`,
    companyLoan: (amount, c, debt, rate) =>
      `${c} borrows ${m(amount)}. Debt: ${m(debt)}, estimated rate ${pct(rate, 2)} per quarter.`,
    noCompanyDebt: (c) => `${c} has no debt.`,
    companyCashShort: (c, cash) => `Insufficient cash: ${c} has ${m(cash)}.`,
    companyRepaid: (amount, c, debt) => `${m(amount)} repaid. Remaining debt (${c}): ${m(debt)}.`,

    dividendJustFounded: (c) => `${c} was only just created: no dividend before the end of its first quarter.`,
    dividendCap: (max, borrowed) =>
      `Dividend capped at ${m(max)}: you can’t hand out money borrowed this quarter (${m(borrowed)}).`,
    dividendPaid: (amount, perShare, price, mine) =>
      `${m(amount)} paid out in dividends (${sp(perShare)} per share, shaved off the price: ${sp(price)}).${mine !== null ? ` Your cut: ${m(mine)}.` : ''}`,

    autopilotNoBonus: "The autopilot doesn’t pay itself a bonus. Unlike some.",
    bonusJustFounded: (c) => `${c} was only just created: no bonus before the end of its first quarter. Decency first. Briefly.`,
    bonusCap: (max) => `Bonus capped at ${m(max)} this quarter (10% of cash, excluding this quarter’s borrowing).`,
    bonusPaid: (amount, c, up) => `${m(amount)} wired to your personal account. Scandal meter (${c}): +${EN_NF1.format(up)}.`,

    oneBuyback: 'Only one share buyback per quarter.',
    buybackCash: (total, c, cash) => `Insufficient cash: this buyback costs ${m(total)}, ${c} has ${m(cash)}.`,
    buybackDone: (n, t, total, remaining) =>
      `${int(n)} ${t} ${shares(n)} bought back and canceled for ${m(total)}. ${int(remaining)} remain outstanding.`,
    buybackTakeover: (p) => ` Ouch: ${p} now holds more than 50% and takes control!`,

    pillHumansOnly: 'Only a flesh-and-blood CEO can swallow the pill.',
    pillCooldown: 'Poison pill recharging: you must wait 3 quarters between doses.',
    pillNoRaider: 'No poison pill possible: no other player holds 25% of the equity.',
    pillCash: (cost, n, unit) => `You need ${m(cost)} of personal cash to subscribe to ${int(n)} new ${shares(n)} at ${sp(unit)}.`,
    pillDone: (n, unit, cost, raider, rs, ms, price) =>
      `${int(n)} new ${shares(n)} subscribed at ${sp(unit)} for ${m(cost)} (locked up until the end of the quarter). ${raider} drops to ${pct(rs)}, you rise to ${pct(ms)}. Diluted price: ${sp(price)}.`,

    crisisCash: (cost) => `Insufficient cash: crisis communications cost ${m(cost)}.`,
    crisisDone: (cost, scandal, rep) =>
      `${m(cost)} spent (expensed in this quarter’s results): scandal meter −${EN_NF0.format(Math.abs(scandal))}, ${
        rep > 0 ? `reputation +${EN_NF2.format(rep)}` : 'reputation unchanged (crisis comms repairs, it doesn’t polish)'
      }.`,
    crisisOncePerTurn: 'One crisis communication per quarter: by the second one, even the friendliest reporters stop picking up.',

    onlyPlayerWhistle: 'Only a player can blow the whistle.',
    whistleTargetGone: 'Company not found, bankrupt or absorbed: there’s nobody left to expose.',
    whistleSelf: (c) => `Blow the whistle on ${c}, which you run? Even repentant insiders wait until they’ve left the building.`,
    whistleOncePerTurn: 'One tip-off per quarter: any more and newsrooms file you under “cranks.”',
    whistleCash: (cost) => `You need ${m(cost)} of personal cash for lawyers, a burner phone and a pseudonym.`,
    whistleDone: (c, level, cost, up) =>
      up > 0
        ? `File leaked to the press under a pseudonym for ${m(cost)}. ${c}’s scandal meter: +${EN_NF0.format(up)}, now published at ${EN_NF0.format(level)}/100.`
        : `File leaked to the press for ${m(cost)}… and it’s empty: ${c} shows ${EN_NF0.format(level)}/100 on the scandal meter. You can only expose what exists.`,

    onlyPlayerTip: 'Only a player can buy a tip.',
    tipStale: 'That rumor is from another issue: tips only cover today’s paper.',
    tipNoRumor: 'No rumor there. Even sources have their limits.',
    tipOncePerTurn: 'One tip per quarter: your source has gone quiet. “In a meeting.”',
    tipCash: (cost) => `Your source wants ${m(cost)} of personal cash. In an envelope, obviously.`,
    tipDone: (truthful, cost, leaked) =>
      `${truthful ? 'Your source is adamant: the rumor is true.' : 'Your source laughs: the rumor is nonsense.'} Tip paid: ${m(cost)}.${
        leaked ? ' Bad news: they also talked to the paper about you.' : ''
      }`,

    siteExists: (site) => `This company already has ${site}. One per commodity: even barons have a ceiling.`,
    siteMissing: (site) => `You would need to win ${site} at auction first. You can’t mothball what doesn’t exist.`,
    siteAlreadyDormant: 'This site is already asleep. Any deeper and it’s bankruptcy.',
    siteNotDormant: 'This site is already running. To restart it, you’d have to stop it first.',
    siteDormantDone: (upkeep) =>
      `Site mothballed: no extraction from the close, but ${m(upkeep)} of upkeep per quarter (guards, pumps, insurance). Restarting it will take a quarter.`,
    siteRestarted: 'Restart under way: one quarter to get going again; extraction resumes at the following close.',
    siteSlotUnknown: 'Unknown deposit: it is on no map, not even the tax assessor’s.',
    siteSlotTaken: (site) => `${site} is already being worked. Wait for a bankruptcy, or buy out its owner.`,
    siteBidLastTurn: 'Final quarter: a site won at the close would not have time to extract a single lot. The auctioneer puts away his gavel.',
    siteBidLow: (site, reserve) => `The reserve price for ${site} is ${m(reserve)}: below that, the auctioneer doesn’t even look up.`,
    siteBidCash: (site, amount, c, cash) => `Bidding ${m(amount)} for ${site}: ${c} only has ${m(cash)} in the till.`,
    siteBidPlaced: (site, amount, reserve) =>
      `Up to ${m(amount)} for ${site}. Result at the close: the highest bid on this deposit wins and pays the best losing bid (${m(reserve)} if unopposed), never more than its own bid. It only counts up to the company’s cash at that moment; a bid on another deposit of the same commodity would replace this one.`,
    siteNoBid: 'No bid on this commodity: nothing to withdraw.',
    siteBidCancelled: 'Bid withdrawn.',
    unknownZone: 'Unknown zone: not even the developers have paved it yet.',
    unknownHex: 'Unknown cell: the land registry does not recognise that address.',
    hexNotBuildable: 'This cell is reserved for a deposit: no room for a plant.',
    hexOccupied: 'This cell already has a plant. One plant per cell.',
    hexBoardFull: 'The board is full: no buildable cell is available.',
    hexBidLastTurn: 'Final quarter: land auctions are closed; a new location would never make a sale.',
    hexBidLow: (h, reserve) => `The reserve for ${h} is ${m(reserve)}. The land registry rejects lightweight envelopes.`,
    hexBidCash: (bid, cost, c, cash) => `A ${m(bid)} bid plus ${m(cost)} in setup costs: ${c} only has ${m(cash)} in cash.`,
    hexBidDuplicate: 'You already have a bid on this cell across the companies you control.',
    hexFallbackInvalid: 'Choose the nearest available cell as a fallback, or abandon the bid.',
    hexBidOnly: 'Land auctions are available on the hex board.',
    hexNoBid: 'There is no pending bid for this plant or launch project.',
    hexBidCancelled: 'Bid withdrawn; a cancelled launch project disappears at no cost.',
    hexLaunchPlanned: (p, h, bid) => `${p} launch project: up to ${m(bid)} for ${h}, sealed. Payment and launch wait for the auction at the close.`,
    hexMovePlanned: (p, h, bid) => `${p} plant: up to ${m(bid)} for ${h}, sealed. It stays put this quarter; land and moving costs are paid only if it wins.`,
    hexStartupPlanned: (p, h, bid, fallback) => `Startup ${p}: up to ${m(bid)} for ${h}, sealed. It sells from the capital’s incubator this quarter; the land is paid only at the award. ` +
      (fallback === 'nearest' ? 'If it loses the cell: the nearest free cell.' : 'If it loses the cell, it stays in the incubator and can bid again; after two quarters it gets moved to the nearest free cell, like it or not.'),
    incubatorOver: (p, h, price) => `Incubation’s over: ${p} gets moved to ${h} at the ${m(price)} reserve. The couch has been reassigned.`,
    incubatorExtended: (p, h, price) => `Incubation extended: ${p} can’t afford the nearest free cell (${h}, ${m(price)}). It will try again at the next close.`,
    hexFallbackBody: (h) => ` Fallback to ${h}, which received no valid bid: the land registry charges its reserve.`,
    hexStartupBody: ' The startup leaves the capital’s incubator; next quarter’s sales will come from this cell.',
    factoryAlreadyThere: (p, z) => `The ${p} plant is already in ${z}. Moving it on the spot is just repainting.`,
    factoryMovePending: (p, h) => `The ${p} plant’s move to ${h} is already booked. It will take place after closing.`,
    factoryMoveLastTurn: 'Final quarter: it is too late to book a move after closing.',
    factoryMoveCash: (p, cost, c, cash) => `Moving the ${p} plant costs ${m(cost)}: ${c} only has ${m(cash)} in the till.`,
    factoryMoved: (p, z, cost) =>
      `The ${p} plant moves to ${z} for ${m(cost)}, booked as special charges. It produces from there at this close; the roads were not consulted.`,
    factoryMovedFree: (p, z) => `The ${p} plant sets up in ${z} at no cost: the product starts this quarter. It produces from there at this close.`,
    factoryMovePlanned: (p, z, cost) => `The ${p} plant's move to ${z} is reserved for ${m(cost)}. It still produces at its current location this quarter and moves after closing.`,
    launchZone: (z) => ` Plant set up in ${z}.`,

    offerOnlyPlayers: 'Only a player can negotiate.',
    offerUnknownPlayer: 'Counterparty not found: they must have left with the till.',
    offerSelf: 'Negotiating with yourself? Even holding companies have limits.',
    offerAutopilot: (c) => `${c} is on autopilot: nobody there signs anything.`,
    offerLimit: (n) => `No more than ${int(n)} offers per quarter: the lawyers bill by the hour.`,
    offerSent: (to) => `Offer sent to ${to}. Answer expected before the quarter closes.`,
    offerBotAccepted: (bot, details) => `${bot} accepts without even reading it. ${details}`,
    offerBotDeclined: (bot) => `${bot} politely declines, and writes your name down somewhere.`,
    offerNotFound: 'Offer not found or expired: deals close within the quarter.',
    offerNotForYou: 'This offer is not addressed to you.',
    offerNotYours: 'This offer is not yours.',
    offerDeclined: 'Offer declined. Manners cost nothing.',
    offerCancelled: 'Offer withdrawn. Let us pretend it never happened.',
    blockPriceBand: (min, max) => `Price out of bounds: between ${sp(min)} and ${sp(max)} per share (within 25% of the market). Beyond that, it is a gift in disguise.`,
    blockNotEnough: (seller, held, ticker) => `${seller} only has ${int(held)} ${ticker} shares to sell.`,
    blockCash: (buyer, total) => `${buyer} does not have ${m(total)} of personal cash.`,
    blockFloat: 'Above 50% plus one share, the minimum float rule applies to private sales too.',
    blockOwnFounder: (c) => `${c} was founded this quarter: the founder's shares are locked until the close.`,
    blockDone: (n, ticker, seller, buyer, price, total) =>
      `${int(n)} ${ticker} shares move from ${seller} to ${buyer} at ${sp(price)} each (${m(total)}), off-market: the price does not move.`,
    contractBounds: (min, max, lots, turns) =>
      `Contract out of bounds: price per lot between ${m(min)} and ${m(max)}, at most ${int(lots)} lots per quarter and ${int(turns)} quarters.`,
    contractNotYours: 'You must run one of the two companies to propose a contract.',
    contractSameCompany: 'A company cannot supply itself, not even to dress up its books.',
    contractArmsLength: (min, max) =>
      `Between two companies of your own group, the price stays within 10% of the last closing price: ${m(min)} to ${m(max)} a lot. The taxman read the same textbooks as your tax lawyers.`,
    contractExists: (cname) => `These two companies already have a running ${cname} contract: one per commodity at a time.`,
    contractSigned: (seller, buyer, lots, cname, price, turns) =>
      `Contract signed: ${seller} will deliver ${int(lots)} lots of ${cname} per quarter to ${buyer}, at ${m(price)} a lot, for ${int(turns)} quarters (delivered at each close, before production).`,
    cartelNeedsProducts: (sector) => `To fix prices in ${sector}, both companies have to sell there.`,
    cartelSelf: 'An agreement with yourself is a strategy, not a cartel.',
    cartelAlready: 'These two companies already have an understanding. A second lunch will not change that.',
    cartelOther: 'Your company is already in another cartel in this sector: you cannot serve two masters.',
    cartelSigned: (sector, n, risk) =>
      `Cartel formed in ${sector} (${int(n)} members): you now see your partners' current-quarter prices. Risk of being caught at the next close: ${risk}, and it grows over time.`,
    cartelNone: (sector) => `This company is not in any cartel in ${sector}.`,
    cartelLeft: (sector) =>
      `You will leave the ${sector} cartel at the close: until then, this quarter's risk still applies. Your partners will appreciate it.`,
    cartelLeaving: (sector) => `You are already leaving the ${sector} cartel at the close.`,

    shadyUnknownEvenForYou: 'Unknown shady move (even by your standards).',
    shadyOncePerTurn: 'Only one move of this kind per quarter. Even corruption keeps office hours.',
    shadyCash: (cost) => `Insufficient cash: this takes ${m(cost)}.`,
    lobbyingNeedsSector: 'Lobbying: name a valid sector.',
    lobbyingDetails: (s) => `Demand in the ${s} sector ×1.15 for 2 quarters.`,
    taxDetails: 'Tax rate of 5% this quarter.',
    greenwashingDetails: 'Appeal ×1.3 on all your products this quarter.',
    offshoringDetails: 'Labor costs −30% for 3 quarters, reputation −0.1.',
    spyTargetGone: 'Espionage target not found or no longer listed.',
    spySelf: 'Spying on yourself: bold, but pointless.',
    spyNobody: 'No competitor to spy on in your sectors.',
    spyNothingToSteal: 'Your products already beat the competition: there is nothing worth copying.',
    spyDetails: (gains) => gains.map((g) => `${g.product} +${EN_NF2.format(g.gain)} quality`).join(', ') + '.',
    smearNeedsTarget: 'Smear campaign: you need a listed target.',
    smearSelf: 'Smear yourself? The journalists already have that covered.',
    smearDetails: (t) => `${t} stock drops 15%.`,
    shadyUnknown: 'Unknown shady move.',
    shadyDone: (details, cost, scandal) => `${details} Cost: ${m(cost)}, scandal meter +${scandal}.`,

    autopilotNoMerge: "The autopilot doesn’t do mergers.",
    mergeSelf: "Merging a company with itself: even investment bankers wouldn’t dare.",
    mergeTooMany: (abs, max, a, b) =>
      `Merger impossible: ${abs} would exceed ${max} active products (${a} + ${b}). Discontinue some products first.`,
    mergeJustFounded: 'No merger in the very quarter a startup is founded: at least let it print its business cards.',
    merged: (target, abs, issued, at, tt, ratio) =>
      `${target} absorbed by ${abs}: ${int(issued)} ${at} ${shares(issued)} issued (1 ${tt} share = ${EN_NF2.format(ratio)} ${at}).`,
    mergeTakeover: (p) => ` Plot twist: ${p} now holds more than 50% of the combined group and takes control!`,
  };

  return {
    lang: 'en',
    terrainAppreciation: { very_good: 'very good', good: 'good', average: 'average', poor: 'poor' },
    money: m,
    sharePrice: sp,
    pct,
    lots,
    int,
    dec1: (n) => EN_NF1.format(n),
    dec2: (n) => EN_NF2.format(n),

    gameOver: 'The game is over: on to the leaderboard.',
    unknownPlayer: 'Unknown player in this game.',
    internalError: 'Internal error: order ignored. Accounting is looking into it.',
    botTakeoverDisabled: 'This game does not allow players to take over bots.',
    botTakeoverLastTurn: 'The final quarter has started: it is too late to take over a bot.',
    botTakeoverUnavailable: 'This player is no longer an available bot.',
    botTakeoverNameInvalid: 'Choose a non-empty player name.',
    botTakeoverNameTaken: 'That player name is already in use in this game.',
    botTakeoverClaimed: (turn) => `Bot taken over: you can act from quarter ${turn}. Its existing decisions stay in place until then.`,
    botTakeoverPending: (turn) => `Your takeover becomes active in quarter ${turn}. You can review the game while waiting.`,

    placeholders: {
      level: 'a worrying level',
      company: 'a listed company',
      ceo: 'a CEO',
      sector: 'a booming sector',
      commodity: 'a raw material',
      player: 'an investor',
      acquirer: 'a corporate raider',
      target: 'a sitting duck',
      product: 'a miracle product',
      amount: 'an obscene sum',
      pct: 'a sizeable chunk',
    },

    anonymous: 'Anonymous',
    defaultCompanyName: (name) => `${name} & Co`,
    autopilotCeo: 'Autopilot',
    autopilotTagline: 'Nothing to report.',
    startupSuffixes: ['Revenge', 'Reloaded', '2.0', 'Phoenix', 'Strikes Back', 'Next'],
    otherCompetitors: 'Other competitors',
    controlHandoverTitle: (heir, c) => `${heir} takes the helm at ${c}`,
    autopilotTitle: (c) => `${c} switches to autopilot`,
    rumorLeakTitle: (p) => `${p} caught slipping an envelope to a journalist`,
    rumorLeakBody: 'The Daily Capital reminds readers that its sources are not for sale. Barring exceptions, and against an invoice.',
    siteName: { oil: 'an oil well', lithium: 'a lithium mine', sugar: 'a sugar refinery', chips: 'a chip foundry' },
    slotLabel: (name) => `“${name}”`,
    siteAwardTitle: (c, site) => `Sold! ${c} wins the “${site}” site`,
    siteAwardBody: (price, n) =>
      `Hammer price ${price}, ${n} bidder${n === 1 ? '' : 's'} on this deposit. Vertical integration: why depend on markets when you can be one? The neighbors were not consulted; they live downstream.`,
    blockSaleTitle: (buyer, pct, c, seller) => `Private block sale: ${buyer} buys ${pct} of ${c} from ${seller}`,
    blockSaleBody: (total) => `Deal size: ${total}, closed off-market somewhere between the main course and the cheese.`,
    cartelBustedTitle: (sector, list) => `Price-fixing in ${sector}: ${list} fined`,
    cartelBustedBody: (total) => `Investigators found the minutes of some "strictly social" lunches. Fines: ${total} in total.`,

    fallbackHeadlines: {
      takeover: ['{acquirer} seizes control of {target}'],
      ousted: ['{player} ousted from {company} with a golden parachute worth {amount}'],
      oustedBroke: ['{player} leaves {company} without a parachute: the coffers were empty'],
      scandal: ['Scandal at {company}: {amount} fine'],
      bankruptcy: ['{company} files for bankruptcy'],
      productLaunch: ['{company} launches {product} ({sector})'],
      hexProductLaunch: ['{company} launches {product} ({sector})'],
      bigProfit: ['{company} posts {amount} profit'],
      bigLoss: ['{company} loses {amount}'],
      ceoBonus: ['{ceo} pockets a bonus of {amount} at {company}'],
      startup: ['{player} founds {company}'],
      merger: ['{acquirer} swallows {target}'],
      poisonPill: ['{company} reaches for the poison pill'],
      buyback: ['{company} buys back its own shares for {amount}'],
      dividend: ['{company} pays out {amount} in dividends'],
      marginCall: ['{player} hit by a margin call'],
      stakeBuilding: ['{player} builds up a stake of {pct} in {company}'],
      insiderBuying: ['{ceo} buys {pct} of their own company {company}; market regulators start asking questions'],
      whistleblow: ['Whistleblower exposes {company}: scandal meter at {level}'],
      quarterIntro: ['New quarter, fresh opportunities to get filthy rich.'],
    },

    bodies: {
      takeoverNoCeo: [
        'The autopilot put up no resistance. Nobody had asked for its opinion anyway.',
        'No CEO to oust: the board simply swapped chairs.',
        'A takeover without a fight: there was nobody around to sign the surrender.',
        'The autopilot was let go by email. It didn’t reply. It’s an autopilot.',
        'No resistance, no golden parachute, no tears: the most peaceful takeover of the year.',
        'The new boss found an empty office and a houseplant that died months ago.',
        'No CEO to fire means no severance to pay. The lawyers are almost disappointed.',
        'The board learned it had a new owner by reading the paper.',
        'Buying a company with nobody at the helm is like burgling a house with the door wide open.',
        'The buyer talks about an “industrial vision.” Mostly, it saw defenseless prey.',
        'The switchboard now answers with a new name. Nobody warned the switchboard either.',
        'Employees heard the news at the water cooler, like all important news.',
        'The autopilot hands over the keys without a fuss. All it asks for is a software update.',
        'The market battle lasted one afternoon, for lack of an opponent.',
        'Analysts hail a “seamless transition.” There was nothing to transition.',
      ],
      controlHandover: [
        'The corner office was empty, so somebody sat down in it.',
        'With nobody else in the running, the largest shareholder picks up the keys.',
        'The new boss already had the nameplate changed. Everything else can wait.',
        'First act of the new chief: order a chair taller than the last one.',
        'Nobody ran against the new boss. Not even the autopilot, which has no opinions.',
        'The board voted unanimously, which is to say, one vote.',
        'Staff meet their new boss through a heavily retouched official portrait.',
        'A new captain comes aboard and promises to read the navigation manual later.',
        'The largest shareholder takes charge: shareholder democracy works beautifully, for them.',
        'The inaugural speech promised “a new era.” It starts Monday, right after the offsite.',
        'The executive assistant cleared out the autopilot’s files. There weren’t any.',
        'New CEO, new vision, same coffee machine.',
      ],
      controlSold: [
        'The seller pocketed the cheque and left the keys on the desk. No parachute: you do not bail out of a plane you just sold.',
        'Handshake, cheque, smiling photo: the friendliest handover of the quarter.',
        'The old boss leaves with the price of the shares and nothing else. Golden parachutes are for people who get pushed.',
        'Sold, signed, cashed. Staff learned the news from the paper, as usual.',
        'Headquarters braces for the first “transformation plan.”',
        'A handover without a handshake: there was nobody to shake hands with.',
        'The new chief has already claimed a reserved parking spot. The essentials are covered.',
      ],
      autopilot: [
        'No controlling shareholder left: the company flies on autopilot.',
        'The last captain has jumped ship. The autopilot takes the wheel.',
        'No boss, no meetings, no decisions. Some employees call it a golden age.',
        'The company runs itself, which says a lot about the previous management.',
        'The board now meets to stare at the stock price and sigh.',
        'No shareholder really wants it. Employees keep showing up out of habit.',
        'The CEO’s office sits empty. The houseplant finally gets the attention it deserves.',
        'Autopilot engaged: the course holds steady, for lack of anyone to change it.',
        'The company has no master. The market’s predators are starting to circle.',
        'Strategic decisions are on hold. Nobody has noticed the difference.',
        'The org chart now has a big hole at the top. Consultants call it a “flat structure.”',
        'The last boss left with the stapler. The company stayed.',
        'No captain on board, but the ship still floats. For how long, nobody knows.',
        'Auto mode on: make stuff, sell stuff, wait for a new owner.',
        'The CEO job is open. Applications accepted by share purchase only.',
      ],
      insiderBuying: [
        '“I simply believe in our future,” says the CEO, who happens to see the quarterly numbers before anyone else.',
        'The market watchdog has opened a file. It sits neatly between two other files on the same CEO.',
        'The CEO swears to have no inside information. They merely read the accounts before publishing them.',
        'Small shareholders are not thrilled to learn who was on the other side of their sell orders.',
        'Perfect timing, as usual. Investigators love perfect timing.',
        'The board calls it “a strong vote of confidence.” The regulator calls it “a strong signal,” full stop.',
      ],
      whistleblow: [
        'The source signs off as “Deep Throat, Accounts Payable.” Management has ordered an audit… of the printers.',
        'The file arrived by mail in a shoebox. The newsroom kept the shoes.',
        'Management denies “baseless rumors,” then quietly cancels its earnings call.',
        'The regulator vows to “look into it closely,” which in regulator means sometime next quarter.',
        'Word is the leak came from a competitor. We only print facts, and numbers.',
        'Company lawyers have already found a culprit: the intern, who has been on vacation for three months.',
      ],
      stakeBuilding: [
        'Everyone has been put on notice. The incumbent CEO is starting to sweat.',
        'A stake “purely for investment purposes,” the buyer swears.',
        'The M&A lawyers are already sharpening their knives.',
        'The shareholder register has suddenly become the board’s favorite bedtime reading.',
        '“Just a nice long-term investment,” insists the buyer, while placing another order.',
        'The incumbent CEO has told the lawyers to keep their phones on at all times.',
        'Analysts call it “significant interest.” The CEO calls it “a nightmare.”',
        'Every share bought brings the buyer one step closer to the top-floor office.',
        'The target feigns indifference, but just booked a war room for the whole quarter.',
        'The threshold has been crossed and the filing is mandatory. The intentions remain vague.',
        'Small shareholders watch the big orders roll by and wonder whether to sell or pray.',
        'The approach is “friendly,” we are told. Like a wolf dropping by the henhouse for a chat.',
        'The board has just learned the phrase “creeping takeover” and does not like it one bit.',
        'At headquarters, people are quietly updating their resumes.',
        'The buyer keeps saying there is “no hostile intent.” The buyer keeps saying it a lot.',
      ],
      startup: [
        'The business plan fits on a cocktail napkin, but it is a very nice napkin.',
        'Government innovation grant included. The innovation itself will follow later.',
        'The founder promises to “disrupt” a market that doesn’t have a name yet.',
        'First hire: a Chief Happiness Officer. Second hire: someone to handle revenue.',
        'The pitch fits in four words: “Like theirs, but better.” Investors love it.',
        'A funding round is imminent, according to the founder. The funds haven’t been informed.',
        'The logo is ready, the domain is reserved, the hoodies are printed. The product will follow.',
        'One more startup on the landscape. The landscape is getting a little crowded.',
        'The founder quit a steady job to “follow their passion.” Their passion is money.',
        'The office is a garage, by tradition. The rent is a loft’s, also by tradition.',
        'The fledgling company describes itself as “agile.” It doesn’t have legs yet.',
        'The business plan projects profitability in year three. Every business plan projects year three.',
        'The founder has already given a talk about failure, just to get ahead.',
        'Company values: boldness, kindness, excellence. Company salaries: to be announced.',
        'New company, big ambitions, and cash-flow problems coming soon.',
      ],
      productLaunch: [
        'The press release says “revolution.” The competition says “rip-off.”',
        'Keynote, smoke machines and promises: everything is there except the user manual.',
        'The product is “built for the next generation.” The next generation was not consulted.',
        'The launch cost more than the design. That’s the industry standard.',
        'Early testers are enthusiastic. They are also all on the payroll.',
        'Announced in three versions, two of which are still promises.',
        'Marketing promises “an experience.” Customer service promises to call you back.',
        'Stage presentation, black turtleneck, dramatic pause: the product itself almost went unnoticed.',
        'The competition responded calmly, by calling an emergency meeting.',
        'A “one-of-a-kind” product, according to management, which never looked at the competition.',
        'The spec sheet is two pages long. The press release is twelve.',
        'The billboards are ready and infrastructure is being installed. Buyers will have to wait until next quarter.',
        'Management is aiming for “the heart of the market.” The market is already seeing someone else.',
        'The product is the result of “years of research.” Three weeks, actually.',
        'Early feedback: “promising.” A word that means nothing, so everyone is happy.',
      ],
      hexProductLaunch: [
        'The plant still smells of fresh paint; the first boxes ship this quarter anyway.',
        'The land was paid in cash, and so was the opening speech.',
        'The mayor cut the ribbon; marketing cut the mayor off.',
        'The first customers discover the product at the same time as the workers.',
        'The Agency hails “exemplary regional development”. It says that about every parking lot.',
      ],
      ceoBonus: [
        'The amount was approved by an independent committee made up of the CEO and a mirror.',
        'Staff will be thrilled to learn where the profit-sharing went.',
        'The bonus is tied to performance. Performance was redefined for the occasion.',
        'Management reminds everyone that talent has a price. The price was set by the talent.',
        'The amount equals three centuries of an employee’s pay. A rounding detail.',
        'A “reasonable” bonus, according to the recipient, whose dictionary is very flexible.',
        'The unions demand an explanation. They were sent a very colorful chart.',
        'The CEO stresses the need to “retain top talent.” So the CEO retained the CEO.',
        'The wire went out on a Friday night, the traditional hour for bad news.',
        'The board approved it unanimously, after an excellent lunch paid for by the CEO.',
        'Small shareholders grind their teeth. The yacht just got a fresh coat of varnish.',
        'Variable pay has never lived up to its name so well: it only varies upward.',
        '“That’s the market,” the CEO explains. The market is, mostly, the CEO.',
        'The money will be reinvested, the CEO promises. In a beach house.',
        'The recipient calls the bonus “modest.” After all, they could have taken the whole treasury.',
      ],
      poisonPill: [
        'Cut-price new shares for the incumbent CEO: the raider will have to reach for its wallet again.',
        'Takeover defense activated. Small shareholders get diluted without so much as a thank-you.',
        'The share count balloons overnight: the raider will have to go back to the bank.',
        'The target has turned into a porcupine. Small shareholders got the quills.',
        'The CEO clings to the corner office with admirable determination. Or admirable dilution.',
        'The lawyers applaud: the maneuver is legal, lucrative and billed by the hour.',
        'The raider decries “an attack on free markets.” The CEO replies: “an attack on my office.”',
        'Express share issuance: the priciest defense ever paid for by shareholders who never asked.',
        'The pill has been swallowed. Side effects will be borne by every other shareholder.',
        'The board insists it is acting “in the company’s best interest.” The company, in this case, is the CEO.',
        'The predator will have to buy more shares at a higher price. Its calculator is smoking.',
        'Classic defense: when you can’t win the game, add more squares to the board.',
        'The stock coughs, minority holders wince, the CEO smiles.',
        'Analysts call it “a muscular defense.” Minority holders call it “a punch in the gut.”',
        'The fortress holds, at the cost of fresh concrete poured over the small shareholders.',
      ],
      buyback: [
        'Fewer shares outstanding, more swagger in the corridors.',
        'The treasury goes shopping on the stock market… for the company itself.',
        'Management couldn’t find a better investment than itself. How modest.',
        'Earnings per share rise mechanically. Sales had nothing to do with it.',
        'The company buys itself back: a short supply chain shareholders adore.',
        'Why invest in infrastructure when you can invest in the stock price? It’s faster.',
        'Management’s stock options salute this very wise decision.',
        'R&D asked for a budget. R&D received a chart of the share price.',
        'Fewer shares outstanding: each share is worth a bit more, each employee a bit less.',
        'The cash pile was napping. It got woken up to go buy back the house.',
        'The repurchased shares head to the great cancellation in the sky. Rest in dividends.',
        'Management believes in the company’s future so much it’s buying pieces of it.',
        'Analysts hail “a vote of confidence.” A fairly expensive vote.',
        'A buyback is just a dividend that took a course in discretion.',
        'The stock goes up, the cash goes down: it’s all a matter of perspective.',
      ],
      dividend: [
        'Shareholders raise a glass. The small fry pocket their share and walk off.',
        'It is raining banknotes on the share register.',
        'Shareholders pop the champagne. Employees open their pay stubs, no champagne.',
        'The dividend is “the fruit of everyone’s hard work.” The fruit, however, is reserved.',
        'A wire lands in every shareholder’s account. Even the ones on sunny islands.',
        'Cash reserves shrink, the annual meeting fills up: everyone wants a piece.',
        'Investors praise a “generous” payout policy. Privately, they call it “the bare minimum.”',
        'Money leaves the company to go nap in other accounts. The circle of life.',
        'The CFO signs the transfers with the face of someone who wanted new infrastructure.',
        'Small holders get enough for a coffee. Big holders get enough for the coffee shop.',
        'Payout complete: the company is a bit poorer, its owners a bit richer.',
        'The payout delights the trust-fund crowd and depresses the capital spending team.',
        'The stock cheers the news, then remembers the cash is no longer in the till.',
        'A generous yield this quarter. Nobody asks where it came from; it would be rude.',
        'Shareholders voted unanimously to receive money. Shocking, truly.',
      ],
      merger: [
        'Two head offices, one coffee machine: the synergies are coming.',
        'Target shareholders receive shares in the acquirer. Employees receive a memo.',
        'The new group promises “synergies.” Translation: duplicate staff should start job hunting.',
        'Two logos; only one will survive. The design agency has already sent its invoice.',
        'The merger creates “a champion.” The champion first has to find room for two accounting departments.',
        'The executives shake hands for the cameras. The teams eye each other warily.',
        'The target vanishes from the exchange. Its name lives on, on a few marketing mugs.',
        'The integration consultants watch their fees merge upward.',
        'The target loses its independence and gains a new org chart. Not a fair trade.',
        '“A merger of equals,” says the press release. Headquarters stays with the buyer.',
        'Target shareholders now own a piece of something bigger, and more confusing.',
        'The two corporate cultures must now live together. A team-building retreat is scheduled.',
        'The new group weighs more on the stock market. And in meetings.',
        'Competitors lose a rival, customers lose a choice, the boss gains a bigger office.',
        'The deal is sealed. The prenup covers the parking spaces, not the employees.',
      ],
      bigProfit: [
        'Shareholders applaud, employees somewhat less so.',
        'Management credits “its vision.” Customers credit the lack of alternatives.',
        'The CFO had the numbers checked twice. They were right. The CFO wept.',
        'An exceptional quarter. Management warns it will expect the same next quarter.',
        'Analysts raise their targets. They had cut them last quarter, to be safe.',
        'Employees received a congratulations card. Shareholders received the promise of a dividend.',
        'A “historic” result, says management. History will mostly remember the bonus that follows.',
        'Even competitors applauded. With their fingertips, while taking notes.',
        'Customers pay, costs fall, margins smile: the magic formula worked.',
        'The CEO credits their own leadership. So does the intern, but nobody listens to the intern.',
        'Profits are pouring in. Management is already drafting excuses for the next dry spell.',
        'The unions have seen the number. They’re preparing a slide deck of their own.',
        'The market cheers the performance. The taxman does too, more quietly.',
        'The earnings call ended with a standing ovation, mostly from the CEO.',
        'The number is so pretty it was blown up and hung in the lobby.',
      ],
      bigLoss: [
        'Management speaks of “a transition quarter.”',
        'The CFO was spotted crying in the elevator.',
        'Results were presented in six-point font, to limit the damage.',
        'Management blames “headwinds.” According to the weather service, it was sunny.',
        'The CEO insists the strategy is right. Reality just got it wrong.',
        'Analysts reached for “disappointing,” which is finance-speak for “catastrophic.”',
        'The loss is described as “non-recurring.” Just like last quarter’s.',
        'The annual report will be printed on recycled paper, for once out of necessity.',
        'The press conference was cut short due to a shortage of good news.',
        'The board demands a turnaround plan. The CEO demands a coffee.',
        'Investors console themselves that, technically, losses can be carried forward.',
        'Management announced cost cuts. The office plants are the first casualties.',
        'The stock chart summed up the situation better than the official statement.',
        '“An investment quarter,” management explains. Investment in what remains unclear.',
        'The coffee machine at headquarters has been replaced by a water pitcher. Things are serious.',
      ],
      bankruptcy: [
        'Creditors split the furniture, shareholders split the regrets.',
        'The stock is worthless. The CEO, for once, leaves without a parachute.',
        'The liquidator took inventory: three desks, a foosball table and a lot of promises.',
        'The logo goes to auction. So does the furniture. Dignity left earlier.',
        'Employees got the news by email, the last one the company will ever send.',
        'The company vanishes from the exchange, and from collective memory by next week.',
        'Creditors line up outside the courthouse. Some brought thermoses.',
        'The website still says “Join the adventure!” The adventure is over.',
        'Shareholders discover that in “limited liability,” what’s limited is mostly the value.',
        'The last employee turns off the lights. The power company already wants its bill paid.',
        'Bankruptcy declared: the court decided faster than management ever decided anything.',
        'Analysts who said “buy” last month have quietly deleted their notes.',
        'The “Company of the Year” trophies will be sold for scrap metal.',
        'The end of an entrepreneurial adventure. The consultants are billing for the post-mortem.',
        'The brand may survive, bought for pennies by an opportunistic rival.',
      ],
      scandal: [
        'Management declares itself “shocked to discover what it organized itself.”',
        'An internal inquiry concludes that nobody is to blame, except possibly the intern.',
        'Management “acknowledges the situation.” In plain English: “we got caught.”',
        'The statement mentions “isolated incidents.” There were twelve.',
        'A crisis unit has been set up. Its first move was to delete some emails.',
        'Investigators found a folder labeled “Do Not Open.” They opened it.',
        'The CEO is “deeply disappointed.” Mostly about getting caught.',
        'The fine is steep, but management notes it was budgeted for long ago.',
        'The head of compliance discovered the company had one. It was him.',
        'An ethics charter will be drafted, just in time for the next scandal.',
        'The communications team took three days to land on the word “regrettable.”',
        'A whistleblower spilled everything and was promoted to an office with no windows.',
        'The company’s lawyers have already identified the culprit: “the context.”',
        'Management swears it knew nothing. Internal emails swear otherwise.',
        'The regulator promises to be relentless. It promised that last time too.',
      ],
      marginCall: [
        'The bankers dumped the best holdings at fire-sale prices to get their money back.',
        'Leverage works both ways. This time it was the wrong way.',
        'The margin call arrived on a Monday morning, with all the tenderness of a repo man.',
        'Everything was under control, right up until nothing was.',
        'The bank called. It wasn’t to ask about the family.',
        'The portfolio was liquidated at the worst possible moment, which is exactly how it works.',
        'Leverage reminded everyone that it doubles as a sledgehammer.',
        'Buying on margin is great while the stock goes up. The stock stopped going up.',
        'The brokers sold without warning, exactly as the fine print allows.',
        'The investor calls it “forced rebalancing.” Friends call it “a rout.”',
        'The banker opened the collateral drawer and helped himself generously.',
        'The best holdings went first. The worst ones stayed, out of solidarity.',
        'The brokerage account melted like a yogurt left out in the sun.',
        'Lesson learned: borrowed money always wants to go home eventually.',
        'The positions were closed at friendly prices. Friendly to the buyer.',
      ],
      noNews: [
        'A quarter without news, which is news in itself.',
        'Nothing happened. So the columnists wrote about the weather.',
        'The markets spent the quarter in a staring contest. Nobody blinked.',
        'No scandal, no crash, no takeover. The newsroom is considering furloughs.',
        'An uneventful quarter. Even the rumors took a vacation.',
        'The stock price ran in place. The brokers did crosswords.',
        'Dead calm. Analysts recycled last quarter’s commentary and nobody noticed.',
        'The silence on the markets is deafening. Or maybe it’s the air conditioning.',
        'Not one takeover, not one bankruptcy: capitalism is taking a nap.',
        'Our business desk interviewed a pigeon outside the stock exchange. It had no comment either.',
        'Volatility is on vacation. It’ll be back. It always comes back.',
        'A quiet quarter. The sharks are circling, waiting for their next meal.',
        'Nothing to report, except that having nothing to report is itself suspicious.',
        'Trading screens stayed a pale shade of green. Traders reached historic levels of boredom.',
        'The newsroom had to fill space. This sentence is proof.',
      ],
      finalEdition: [
        'The books are closed, and so are the fortunes. See you on the leaderboard.',
        'Game over. The winners write their memoirs, the losers their excuses.',
        'The markets close and the books freeze. History will remember the numbers, not the methods.',
        'Final issue. Thanks for reading, and above all for speculating.',
        'The curtain falls on the trading floor. Some leave by yacht, others on foot.',
        'The closing bell has rung. Fortunes were made, unmade or simply moved offshore.',
        'The game ends. Golden parachutes are handed out; no other kind was ever ordered.',
        'Final close. The winners thank their talent, the losers blame luck.',
        'The day of reckoning is here. For once, the books will be accurate.',
        'Everyone puts away their shares. Capitalism itself never really closes.',
        'Curtain. The leaderboard will say who won; morality was not invited.',
        'Last edition of the last quarter. The balance sheets are closed; the egos, much less so.',
        'End of the fiscal year. The heirs are delighted, and so is everyone else, slightly less.',
        'The screens go dark. Somewhere, an accountant lets out a sigh of relief.',
        'The game is over. Nobody will be prosecuted. Probably.',
      ],
    },
    profitBody: (rev, profit) => `Revenue of ${m(rev)}, net profit of ${m(profit)}.`,
    lossBody: (rev, loss) => `Revenue of ${m(rev)}, net loss of ${m(loss)}.`,
    marginCallTail: (sold) => `Amount liquidated: ${m(sold)}.`,
    calmTitle: 'Dead calm on the markets',
    editorialist: 'The Daily Capital editorial board',
    quoteByline: (name, c) => `${name}, ${c}`,
    insiderSaleBriefs: [
      {
        title: '{ceo} sold {company} shares the day before the crash: “a simple scheduling coincidence”',
        body: 'The CEO says it was on an astrologer’s advice. The market regulator has already pulled out its calendar.',
      },
      {
        title: '“I never saw it coming”: yet {ceo} had sold everything in {company} a quarter earlier',
        body: 'Small shareholders, for their part, saw everything go.',
      },
    ],
    finalTitle: (winner, nw) => `Closing bell: ${winner} finishes on top with ${m(nw)}`,

    act,
  };
}

const TEXTS: Record<Lang, EngineText> = { fr: frText(), en: enText() };

/** Langue d'une partie (défaut : français), tolérante à un état ancien ou incomplet. */
export function langOf(state: GameState | null | undefined): Lang {
  const l = state?.config?.lang;
  return l === 'en' || l === 'fr' ? l : DEFAULT_LANG;
}

/** Catalogue d'une langue. */
export function textsFor(lang: Lang | undefined): EngineText {
  return lang === 'en' ? TEXTS.en : TEXTS.fr;
}

/** Catalogue de la langue de la partie. */
export function tr(state: GameState | null | undefined): EngineText {
  return textsFor(langOf(state));
}
