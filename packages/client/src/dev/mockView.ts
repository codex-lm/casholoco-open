/**
 * Maquette de développement : fausse PlayerView pour contrôler le rendu sans serveur.
 * Activée uniquement en dev via ?mock=… (voir main.tsx) :
 *   ?mock=1      partie en cours (T1 2028, 2 entreprises contrôlées, historique)
 *   ?mock=fresh  tout début de partie (historiques d'un point, aucun rapport)
 *   ?mock=none   joueur sans entreprise (évincé)
 *   ?mock=lobby  salon d'attente (hôte) ; ajouter &hex=1 pour le plateau hexagonal (cartes des terrains de départ)
 *   ?mock=end    fin de partie (podium, trophées)
 *   ?mock=hex    plateau hexagonal reel, terrains equitables, premier trimestre contre les bots
 *   ?mock=engine vraie partie du moteur contre 7 bots, jouée dans le navigateur (voir engineMock.ts)
 *   ?mock=ousted la même, où un bot vient de vous prendre votre entreprise (chronologie, « Ce qui s'est passé »)
 * Ajouter &lang=en pour un salon anglais (journal, noms, dollars) avec l'interface en anglais.
 */
import type {
  Action,
  ActionResult,
  BotLevel,
  CityId,
  CommodityId,
  CommodityView,
  CompanyView,
  JournalIssue,
  Lang,
  LobbyView,
  PlayerView,
  ProductView,
  PublicPlayer,
  QuarterReport,
  SectorId,
  SectorView,
  SimpleAck,
  SiteSlotView,
  SupplySiteView,
  ZoneId,
} from '@muchomoney/core';
import {
  CITY_IDS,
  COMMODITIES,
  COMMODITY_IDS,
  DEFAULT_ZONE,
  FACTORY_MOVE_COST_RATIO,
  PLAYER_COLORS,
  SECTOR_IDS,
  SECTORS,
  SITE_DORMANT_UPKEEP,
  SITE_OPENING_COST_MULT,
  SITE_UNIT_COST_RATIO,
  ZONE_IDS,
  brandAfter,
  buildSiteSlots,
  cityWeights,
  dateLabel,
  deliveryPerLot,
  estimateSales,
  getContent,
  portHaul,
  productAttractiveness,
  proximity,
  qualityAfter,
  slotCapacity,
  terrainLobbyPayload,
  transportBreakdown,
  zoneLabor,
  isSpatialMap,
} from '@muchomoney/core';
import { installMock, receiveView, type MockBackend } from '../api';
import { startEngineMock } from './engineMock';
import { applyDocumentLang } from '../i18n';
import { getState, pushToast, setState } from '../store';
import { shareBuyCost, sharePriceAfter, shareSellProceeds } from '../rules';

// ---------------------------------------------------------------------------
// Générateur déterministe (captures d'écran reproductibles)
// ---------------------------------------------------------------------------

let seed = 42;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function walk(start: number, n: number, vol: number, drift = 0): number[] {
  const out = [start];
  for (let i = 1; i < n; i++) out.push(Math.max(0.05, out[i - 1] * Math.exp(drift + (rand() - 0.5) * 2 * vol)));
  return out;
}

const START_YEAR = 2027;
const ME = 'p1';

/** Langue du salon simulé (&lang=en). */
let mockLang: Lang = 'fr';

/** Textes de la maquette (contenu « serveur » simulé), par langue du salon. */
const TXT = {
  fr: {
    players: ['Jean-Mi Liquidité', 'Maxence Tweetard', 'Sophie Levier', 'Octave Dividende', 'Gérard Absent'],
    headlineNow: 'Une influenceuse déclare le lithium « pas très feng shui »',
    headlineFirst: 'Ouverture des marchés : huit PDG et zéro scrupule',
    headlineOther: 'Le ministre de l’Économie confond PIB et PIN de carte bleue',
    headlineBody:
      'Ses 12 millions d’abonnés boycottent les batteries. Les cours s’effondrent, les trottinettes aussi. Les analystes, eux, recommandent « d’acheter la peur et de vendre l’espoir », sans préciser dans quel ordre.',
    resultGood: 'Synergix annonce 3,1 M€ de bénéfice',
    resultGoodBody: 'Le PDG attribue ce succès à « la vision » et au prix du sucre.',
    resultBad: 'Tweetard Galactic perd 2,4 M€',
    resultBadBody: 'La trottinette volante n’a pas décollé. Le marketing, si.',
    news1: 'Le yaourt « bio » élu produit le plus mystérieux de l’année',
    news1Body: 'Aucune vache n’a pu être interrogée.',
    news2: 'Pénurie de puces : les grille-pain retrouvent leur dignité',
    news2Body: 'Les fabricants de gadgets connectés, eux, pleurent.',
    quote: '« Je rachète tout ce qui bouge. Et ce qui ne bouge pas, je le fais bouger. »',
    quoteBy: 'Maxence Tweetard, PDG de Tweetard Galactic',
    editorial: '« Ce trimestre, la trottinette décide. Le reste du marché prend des notes. »',
    editorialist: 'L’éditorialiste du Capital Quotidien',
    flash1: 'Sophie Levier monte à 26 % du capital de Synergix',
    flash1Body: 'Le PDG « reste serein » et vérifie son parachute.',
    flash2: 'Octave Capital lance « Vache Zen Max »',
    flash2Body: 'Un yaourt qui médite pour vous.',
    rumors: [
      'Le gouvernement envisagerait d’interdire le sucre le dimanche.',
      'Une célèbre influenceuse préparerait une vidéo « choc » sur les métaux rares.',
      'Un fonds souverain lorgnerait sur le secteur des trottinettes.',
    ],
    others: 'Autres',
    saved: 'Décisions enregistrées. Le comité de direction (vous) applaudit.',
    notFound: 'Entreprise introuvable.',
    tooPoor: 'Refusé : même votre banquier imaginaire dit non.',
    notOwned: 'Vous ne pouvez pas vendre ce que vous n’avez pas. Pas encore.',
    pill: 'Refusé (maquette) : la pharmacie est fermée le dimanche.',
    done: 'C’est fait. (maquette)',
    noLobby: 'Pas de salon.',
    noBots: 'Plus de bots.',
    pickNotAllowed: 'Le choix des terrains est réservé aux humains du salon avec un plateau en mode « au choix ».',
    hostMapInChoice: 'En mode « au choix », chacun prend son terrain à son tour : l’hôte ne place personne.',
    notYourTurn: 'Patience : le Commissariat n’a pas encore appelé votre nom.',
    terrainTaken: 'Ce terrain a déjà trouvé son propriétaire. Choisissez-en un autre.',
    unknownTerrain: 'Terrain inconnu du Commissariat.',
    badRequest: 'Requête invalide.',
    toastNewTitle: 'Nouveau trimestre',
    toastNew: (date: string) => `Le Capital Quotidien du ${date} est dans les kiosques.`,
    toastPredatorTitle: 'Alerte prédateur',
    toastPredator: 'Sophie Levier détient désormais 26,0 % de Synergix.',
  },
  en: {
    players: ['Chad Liquidity', 'Chad Moonshot', 'Sophie Leverage', 'Octavia Dividend', 'Gerald Absent'],
    headlineNow: 'Influencer declares lithium “not very feng shui”',
    headlineFirst: 'Markets open: eight CEOs, zero scruples',
    headlineOther: 'Treasury Secretary confuses GDP with his PIN code',
    headlineBody:
      'Her 12 million followers are boycotting batteries. Prices crash, and so do the scooters. Analysts recommend “buying the fear and selling the hope”, without specifying in which order.',
    resultGood: 'Synergix posts $3.1M profit',
    resultGoodBody: 'The CEO credits “vision” and the price of sugar.',
    resultBad: 'Moonshot Galactic loses $2.4M',
    resultBadBody: 'The flying scooter never took off. The marketing budget did.',
    news1: '“Organic” yogurt voted most mysterious product of the year',
    news1Body: 'No cows were available for comment.',
    news2: 'Chip shortage: toasters regain their dignity',
    news2Body: 'Smart gadget makers, meanwhile, are in tears.',
    quote: '“I buy everything that moves. And what doesn’t move, I make move.”',
    quoteBy: 'Chad Moonshot, CEO of Moonshot Galactic',
    editorial: '“This quarter, scooters call the shots. The rest of the market takes notes.”',
    editorialist: 'The Daily Capital editorial board',
    flash1: 'Sophie Leverage climbs to 26% of Synergix',
    flash1Body: 'The CEO “remains calm” and checks his parachute.',
    flash2: 'Octavia Capital launches “Zen Cow Max”',
    flash2Body: 'A yogurt that meditates so you don’t have to.',
    rumors: [
      'The government is said to be mulling a ban on sugar on Sundays.',
      'A famous influencer is reportedly preparing a “shocking” video about rare metals.',
      'A sovereign wealth fund is rumored to be eyeing the e-scooter sector.',
    ],
    others: 'Others',
    saved: 'Decisions saved. The executive committee (you) applauds.',
    notFound: 'Company not found.',
    tooPoor: 'Denied: even your imaginary banker says no.',
    notOwned: 'You can’t sell what you don’t own. Not yet, anyway.',
    pill: 'Denied (mock-up): the pharmacy is closed on Sundays.',
    done: 'Done. (mock-up)',
    noLobby: 'No room.',
    noBots: 'No bots left.',
    pickNotAllowed: 'Only human players in a board lobby with choice mode can pick a starting terrain.',
    hostMapInChoice: 'In choice mode, everyone picks their own terrain in turn: the host places nobody.',
    notYourTurn: 'Please wait: the Levelling-Up Agency has not called your name yet.',
    terrainTaken: 'That terrain already has an owner. Choose another one.',
    unknownTerrain: 'The Levelling-Up Agency has no record of that terrain.',
    badRequest: 'Invalid request.',
    toastNewTitle: 'New quarter',
    toastNew: (date: string) => `The Daily Capital for ${date} is on the newsstands.`,
    toastPredatorTitle: 'Predator alert',
    toastPredator: 'Sophie Leverage now owns 26.0% of Synergix.',
  },
};

function txt() {
  return TXT[mockLang];
}

/**
 * Transport par lot d'une usine de la zone (§5.8) : livraison aux villes + matières venues du port,
 * chaque flux au kilomètre et au poids ; la livraison reste payante à la capitale.
 * La maquette emploie les mêmes routes que `portOnlyTransport`, matières venues du port.
 */
function haulPerLot(sectorId: SectorId, zoneId: ZoneId): number {
  if (SECTORS[sectorId].intangible) return 0;
  const s = getContent(mockLang).sectors[sectorId];
  let k = deliveryPerLot(zoneId, sectorId);
  for (const [cid, per] of Object.entries(s.inputs)) k += (per ?? 0) * portHaul(zoneId, cid as CommodityId);
  return Math.round(k * 100) / 100;
}

/**
 * Attrait relatif d'une zone pour la demande d'un produit du secteur (§5.2 bis) : les clients des villes
 * (`cityWeights`) ; un produit plaît autant partout, sauf dans la ville de l'usine, où le « fabriqué ici »
 * (`proximity`) fait vendre plus. La plaine et la montagne, sans ville à elles, restent sur la moyenne des villes.
 */
function zoneAppeal(sectorId: SectorId, zoneId: ZoneId): number {
  const w = cityWeights(sectorId);
  if ((CITY_IDS as readonly string[]).includes(zoneId)) return w[zoneId as CityId] * proximity(sectorId, zoneId)[zoneId as CityId];
  return CITY_IDS.reduce((a, c) => a + w[c], 0) / CITY_IDS.length;
}

/**
 * Répartition entière de `total` lots entre les villes (somme = total) : poids des clients du secteur
 * (`cityWeights`) × bonus « fabriqué ici » de la ville de l'usine (`proximity`, 1 partout ailleurs),
 * plus un peu de bruit ; arrondi par les plus fortes décimales.
 */
function splitByCity(sectorId: SectorId, zoneId: ZoneId | undefined, total: number): Record<CityId, number> {
  const w = cityWeights(sectorId);
  const pi = proximity(sectorId, zoneId ?? DEFAULT_ZONE);
  const shares = CITY_IDS.map((c) => Math.max(0.01, w[c] * pi[c] * (0.8 + rand() * 0.4)));
  const sum = shares.reduce((a, b) => a + b, 0);
  const exact = shares.map((s) => (total * s) / sum);
  const lots = exact.map(Math.floor);
  let rest = total - lots.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k = (k + 1) % CITY_IDS.length) {
    lots[order[k][1]] += 1;
    rest -= 1;
  }
  return Object.fromEntries(CITY_IDS.map((c, i) => [c, lots[i]])) as Record<CityId, number>;
}

interface Options {
  turn: number;
  phase: PlayerView['phase'];
  meControls: boolean;
}

// ---------------------------------------------------------------------------
// Construction de la vue
// ---------------------------------------------------------------------------

function stats(over: Partial<PublicPlayer['stats']> = {}): PublicPlayer['stats'] {
  return {
    shadyActions: 0,
    scandals: 0,
    finesPaid: 0,
    takeoversWon: 0,
    takeoversSuffered: 0,
    parachutes: 0,
    rndSpent: 0,
    marketingSpent: 0,
    oilConsumed: 0,
    bonusesTaken: 0,
    dividendsReceived: 0,
    startupsFounded: 0,
    worstTurnLoss: 0,
    bankruptcies: 0,
    ...over,
  };
}

function product(
  id: string,
  name: string,
  sectorId: SectorId,
  mine: boolean,
  turn: number,
  over: Partial<ProductView> = {},
): ProductView {
  const s = getContent(mockLang).sectors[sectorId];
  const cap = s.startingCapacity;
  const unit = s.laborCost + Object.entries(s.inputs).reduce((a, [c, q]) => a + (q ?? 0) * COMMODITIES[c as CommodityId].basePrice, 0);
  const p: ProductView = {
    id,
    name,
    sectorId,
    quality: 1 + rand() * 0.4 * (turn - 1) * 0.3,
    brand: 0.3 + rand() * 0.5,
    capacity: cap,
    price: s.refPrice * (0.9 + rand() * 0.3),
    lastSales: turn > 1 ? Math.round(cap * (0.6 + rand() * 0.35)) : 0,
    lastRevenue: turn > 1 ? s.refPrice * cap * 0.7 : 0,
    lastMarketShare: turn > 1 ? 0.08 + rand() * 0.15 : 0,
    launchedTurn: 1,
    ...over,
  };
  if (mine) {
    // Facture réelle du trimestre (§5.8), livraison comprise même à la capitale.
    const zoneId = p.zoneId ?? DEFAULT_ZONE;
    const haul = haulPerLot(sectorId, zoneId);
    const estCapital = unit * (0.95 + rand() * 0.15);
    p.private = {
      pendingCapacity: 0,
      stock: turn > 1 ? Math.round(cap * 0.1) : 0,
      production: Math.round(cap * 0.8),
      marketing: Math.round(0.015 * s.refPrice * s.refDemand),
      rnd: Math.round(0.01 * s.refPrice * s.refDemand),
      lastProduced: turn > 1 ? Math.round(cap * 0.8) : 0,
      lastUnitCost: unit + haul,
      estimatedUnitCost: estCapital + haul,
      estimatedTransport: haul,
      zones: {
        unitCost: Object.fromEntries(
          ZONE_IDS.map((z) => [z, Math.round((estCapital + s.laborCost * (zoneLabor(z, sectorId) - 1) + haulPerLot(sectorId, z)) * 100) / 100]),
        ) as Record<ZoneId, number>,
        // Gratuit le trimestre où le produit démarre, ensuite une part de la valeur de la capacité (§5.8).
        moveCost: p.launchedTurn >= turn ? 0 : Math.round(FACTORY_MOVE_COST_RATIO * cap * s.capacityCost),
      },
    };
    // Estimation des ventes (§5.2) : une demande propre au produit entre 75 % et 135 % de sa capacité,
    // pour voir ruptures et invendus dans la maquette.
    const pr = p.private;
    const a = productAttractiveness(sectorId, qualityAfter(sectorId, p.quality, pr.rnd), brandAfter(sectorId, p.brand, pr.marketing), 1, p.price);
    const wanted = cap * (0.75 + rand() * 0.6);
    pr.market = {
      demand: s.refDemand,
      othersAttractiveness: a * Math.max(0.2, s.refDemand / wanted - 1),
      reputation: 1,
      bonus: 1,
      unitCost: pr.estimatedUnitCost,
      fixedCost: s.fixedCost,
    };
    refreshEstimate(p);
  }
  return p;
}

/** Recalcule l'estimation d'un produit de la maquette après un changement de décisions. */
function refreshEstimate(p: ProductView): void {
  const pr = p.private;
  if (!pr?.market) return;
  if (p.comingSoon) {
    delete pr.estimate;
    delete pr.zones.demand;
    return;
  }
  pr.estimate = estimateSales(p.sectorId, pr.market, {
    quality: p.quality,
    brand: p.brand,
    price: p.price,
    production: pr.production,
    capacity: p.capacity,
    stock: pr.stock,
    marketing: pr.marketing,
    rnd: pr.rnd,
  });
  // Demande estimée si l'usine était dans chaque zone (§5.2 bis) : attrait de la zone avec un peu de bruit,
  // calée pour que la zone actuelle donne exactement la demande de l'estimation.
  const cur = p.zoneId ?? DEFAULT_ZONE;
  const raw = ZONE_IDS.map((z) => zoneAppeal(p.sectorId, z) * (0.85 + rand() * 0.3));
  const at = ZONE_IDS.indexOf(cur);
  pr.zones.demand = Object.fromEntries(ZONE_IDS.map((z, i) => [z, Math.round((pr.estimate!.demand * raw[i]) / raw[at])])) as Record<ZoneId, number>;
  pr.zones.demand[cur] = pr.estimate.demand;
}

function reports(turn: number, products: ProductView[], scale = 1): QuarterReport[] {
  const out: QuarterReport[] = [];
  const produced = products.map((p) => Math.round(p.capacity * 0.8));
  const freight = transportBreakdown({ products }, produced, []);
  let cash = 12000 * scale;
  for (let t = 1; t < turn; t++) {
    const revenue = (18000 + rand() * 8000) * scale;
    const cogs = revenue * (0.45 + rand() * 0.1);
    const marketing = 1500 * scale;
    const rnd = 900 * scale;
    const fixedCosts = 450 * scale;
    const interest = t > 2 ? 60 : 0;
    const fines = t === 3 ? 820 : 0;
    const amortization = t <= 4 ? 500 * scale : 0; // lancement étalé sur 4 trimestres
    const specialCharges = t > 1 ? 500 : 0; // greenwashing
    const pre = revenue - cogs - marketing - rnd - fixedCosts - amortization - specialCharges - interest - fines;
    const tax = Math.max(0, pre) * 0.25;
    const netProfit = pre - tax;
    cash += netProfit;
    out.push({
      turn: t,
      revenue,
      cogs,
      marketing,
      rnd,
      fixedCosts,
      interest,
      fines,
      ...(amortization > 0 ? { amortization } : {}),
      ...(specialCharges > 0 ? { specialCharges } : {}),
      tax,
      netProfit,
      cashEnd: cash,
      debtEnd: t > 2 ? 2000 : 0,
      products: products.map((p, i) => ({
        productId: p.id,
        name: p.name,
        sectorId: p.sectorId,
        produced: produced[i],
        sold: Math.round(p.capacity * 0.7),
        revenue: revenue / Math.max(1, products.length),
        marketShare: 0.1 + rand() * 0.1,
        unitCost: 60 + rand() * 50,
        // Facture réelle de transport sur les lots produits, y compris à la capitale.
        ...(freight[i].total !== 0 ? { transport: freight[i].total } : {}),
        transportMaterials: freight[i].materialsCost * produced[i],
        transportDelivery: freight[i].deliveryCost * produced[i],
        freight: freight[i],
      })),
    });
  }
  return out;
}

/** Filiale vue, cohérente avec l'emplacement qu'elle exploite (pas de news ici : coût courant = tarif de base). */
function siteView(slot: { id: string; commodityId: CommodityId; name: string }): SupplySiteView {
  const unit = Math.round(COMMODITIES[slot.commodityId].basePrice * SITE_UNIT_COST_RATIO * 100) / 100;
  const capacity = slotCapacity(slot.id);
  return {
    id: slot.id,
    commodityId: slot.commodityId,
    name: slot.name,
    capacity,
    unitCost: unit,
    currentUnitCost: unit,
    activeFrom: 1,
    upkeep: Math.round(capacity * unit * SITE_DORMANT_UPKEEP),
    cost: Math.round(COMMODITIES[slot.commodityId].basePrice * SITE_OPENING_COST_MULT),
  };
}

function company(
  id: string,
  name: string,
  ticker: string,
  emoji: string,
  ceoName: string,
  controllerId: string | null,
  products: ProductView[],
  holdings: Record<string, number>,
  turn: number,
  over: Partial<CompanyView> = {},
): CompanyView {
  const shares = over.sharesOutstanding ?? 10000;
  const held = Object.values(holdings).reduce((a, b) => a + b, 0);
  const history = walk(2 + rand() * 2, turn, 0.12, 0.02);
  const sharePrice = history[history.length - 1] * (1 + (rand() - 0.45) * 0.08);
  const mine = controllerId === ME;
  const c: CompanyView = {
    id,
    name,
    ticker,
    emoji,
    color: controllerId ? PLAYER_COLORS[Number(controllerId.slice(1)) - 1] : '#7a7a7a',
    ceoName,
    founderId: controllerId,
    controllerId,
    status: 'active',
    sharesOutstanding: shares,
    holdings,
    floatShares: shares - held,
    sharePrice,
    marketCap: sharePrice * shares,
    priceHistory: history,
    reputation: 0.9 + rand() * 0.3,
    scandalLevel: 'faible',
    cash: 9000 + rand() * 6000,
    debt: turn > 3 ? 2000 : 0,
    products,
    reports: reports(turn, products),
    private: mine
      ? {
          scandal: 38,
          inventory: { sugar: { lots: 60, avgCost: 41.2 }, oil: { lots: 12, avgCost: 83 } },
          modifiers: turn > 1 ? [{ kind: 'tax_optimisation', turnsLeft: 1 }] : [],
          loanLimit: 14500,
          maxBonus: 1150,
          launchChargesLeft: turn <= 4 ? 500 * (4 - turn + 1) : 0,
          turnFlags: { bonusTaken: 0, buybackDone: false, shadyDone: turn > 1 ? ['greenwashing'] : [] },
        }
      : undefined,
    ...over,
  };
  if (c.private && c.status === 'active') c.private.closePlan = closePlan(c, turn);
  return c;
}

/**
 * Clôture prévue d'une de mes entreprises (§5.7) : à partir du deuxième trimestre, une mise de 11 M sur un puits,
 * réglée en fin de trimestre avec les ventes attendues, qui ne la couvrent pas tout à fait (bandeau « il manquerait… »,
 * deux emprunts proposés). Intérêts de 3 % par trimestre : l'emprunt les compte en plus.
 */
function closePlan(c: CompanyView, turn: number): NonNullable<CompanyView['private']>['closePlan'] {
  const obligations = { fixed: 750, interest: c.debt * 0.03, taxDue: 420, finesDue: 0, contracts: 0, total: 0 };
  obligations.total = obligations.fixed + obligations.interest + obligations.taxDue;
  const planned = c.products.reduce((n, p) => n + (p.private?.production ?? 0), 0);
  const plannedCost = Math.round(planned * 55);
  const marketing = 900;
  const sales = Math.round(plannedCost * 1.4);
  const margin = Math.round(sales * 0.1);
  const bids = turn > 1 ? 11_000 : 0;
  const gap = bids + plannedCost + marketing - sales;
  const shortfall = Math.max(0, obligations.total + Math.max(0, gap) - c.cash);
  const safeShortfall = Math.max(0, obligations.total + Math.max(0, gap + margin) - c.cash);
  const end = c.cash - obligations.total - plannedCost - marketing + sales;
  return {
    cash: c.cash,
    obligations,
    bids,
    bidsCovered: Math.max(0, Math.min(bids, end)),
    production: { planned, funded: planned, plannedCost, cost: plannedCost },
    lots: {},
    marketing: { planned: marketing, funded: marketing },
    sales: { planned: sales, funded: sales },
    margin,
    sites: [],
    shortfall,
    loan: Math.ceil(shortfall / 0.97),
    safeShortfall,
    safeLoan: Math.ceil(safeShortfall / 0.97),
    bankrupt: false,
  };
}

function journal(turn: number): JournalIssue[] {
  const x = txt();
  const issues: JournalIssue[] = [];
  for (let t = 1; t <= turn; t++) {
    const current = t === turn;
    issues.push({
      turn: t,
      dateLabel: dateLabel(t, START_YEAR, mockLang),
      articles: [
        {
          id: `h${t}`,
          kind: 'headline',
          tone: t % 2 ? 'drama' : 'bad',
          title: t === turn ? x.headlineNow : t === 1 ? x.headlineFirst : x.headlineOther,
          body: x.headlineBody,
          commodityIds: ['lithium'],
          sectorIds: ['scooters'],
        },
        ...(t > 1
          ? [
              {
                id: `r${t}a`,
                kind: 'results' as const,
                tone: 'good' as const,
                title: x.resultGood,
                body: x.resultGoodBody,
                companyIds: ['c1'],
                event: { type: 'bigProfit' as const, leaderId: 'p3', amount: 3100 },
              },
              {
                id: `r${t}b`,
                kind: 'results' as const,
                tone: 'bad' as const,
                title: x.resultBad,
                body: x.resultBadBody,
                companyIds: ['c3'],
                event: { type: 'bigLoss' as const, leaderId: 'p2', amount: 2400 },
              },
            ]
          : []),
        {
          id: `n${t}a`,
          kind: 'news',
          tone: 'neutral',
          title: x.news1,
          body: x.news1Body,
          sectorIds: ['yogurts'],
        },
        // Une brève seule un numéro sur deux (le chiffre du trimestre prend alors sa place à droite).
        ...(t % 2 === 0
          ? [
              {
                id: `n${t}b`,
                kind: 'news' as const,
                tone: 'good' as const,
                title: x.news2,
                body: x.news2Body,
                commodityIds: ['chips' as const],
              },
            ]
          : []),
        {
          id: `q${t}`,
          kind: 'quote',
          tone: 'neutral',
          title: x.quote,
          body: x.quoteBy,
        },
        // Comme le moteur : l'édito est la dernière citation du numéro et la seule avec des sectorIds.
        {
          id: `e${t}`,
          kind: 'quote',
          tone: 'neutral',
          title: x.editorial,
          body: x.editorialist,
          sectorIds: ['scooters'],
        },
        ...(current && t > 1
          ? [
              {
                id: `f${t}a`,
                kind: 'flash' as const,
                tone: 'drama' as const,
                title: x.flash1,
                body: x.flash1Body,
                companyIds: ['c1'],
              },
              {
                id: `f${t}b`,
                kind: 'flash' as const,
                tone: 'good' as const,
                title: x.flash2,
                body: x.flash2Body,
                companyIds: ['c5'],
              },
            ]
          : []),
      ],
      rumors: [
        { text: x.rumors[0], reliability: 'faible' },
        { text: x.rumors[1], reliability: 'élevée' },
        { text: x.rumors[2], reliability: 'moyenne' },
      ],
    });
  }
  return issues;
}

export function buildMockView(opts: Options): PlayerView {
  seed = 42;
  const { turn, meControls } = opts;
  const n = Math.max(1, turn);

  const L = (frText: string, enText: string) => (mockLang === 'en' ? enText : frText);
  const [meName, p2Name, p3Name, p4Name] = txt().players;
  // Emplacements de filiale : le premier gisement de chaque matière est pris par c6 (Volt Mobility), et
  // sugar-2 par c1 quand le joueur la dirige (sa filiale en service extrait le sucre de ses produits).
  const siteSlots: SiteSlotView[] = buildSiteSlots(1, getContent(mockLang).siteNames).map((sl, i) =>
    i % 3 === 0 ? { ...sl, companyId: 'c6' } : meControls && sl.id === 'sugar-2' ? { ...sl, companyId: 'c1' } : sl,
  );
  // Usines placées (§5.8) : « Vache Zen » au sud, les rivales au nord-est et dans la plaine ; le reste à la capitale.
  const c1Products = [product('pr1', 'Taurine Fury', 'energy_drinks', meControls, turn), product('pr2', L('Vache Zen', 'Zen Cow'), 'yogurts', meControls, turn, { zoneId: 'south' })];
  const companies: CompanyView[] = [
    company('c1', 'Synergix', 'SYN', '⚡', meControls ? meName : p3Name, meControls ? ME : 'p3', c1Products, meControls ? { p1: 4200, p3: 2600, p2: 300 } : { p3: 5400, p1: 900 }, n),
    company('c2', L('Sucrâlin SA', 'Sugarama Inc.'), 'SUC', '🥤', meControls ? meName : L('Bernadette Glucose', 'Brenda Glucose'), meControls ? ME : null, [product('pr3', L('Sucrâlin Turbo', 'Sugarama Turbo'), 'energy_drinks', meControls, turn)], meControls ? { p1: 5300 } : {}, n),
    company('c3', L('Tweetard Galactic', 'Moonshot Galactic'), L('TWG', 'MOON'), '🚀', p2Name, 'p2', [product('pr4', L('Trott’Apocalypse', 'Scootpocalypse'), 'scooters', false, turn, { zoneId: 'north_east' }), product('pr5', 'ShibaCoin 2', 'crypto', false, turn)], { p2: 4000, p1: 1200 }, n, { scandalLevel: 'élevé' }),
    company('c4', L('Levier & Fils', 'Leverage & Sons'), 'LEV', '📱', p3Name, 'p3', [product('pr6', L('iFrigo Pro Max', 'iFridge Pro Max'), 'gadgets', false, turn)], { p3: 4000 }, n, { scandalLevel: 'moyen' }),
    company('c5', L('Octave Capital', 'Octavia Capital'), 'OCT', '🥛', p4Name, 'p4', [product('pr7', L('Vache Zen Max', 'Zen Cow Max'), 'yogurts', false, turn, { zoneId: 'plain' })], { p4: 4000, p1: 500 }, n),
    company('c6', 'Volt Mobility', 'VLT', '🛴', L('Hervé Watt', 'Harvey Watt'), null, [product('pr8', 'Volt City', 'scooters', false, turn)], {}, n),
    company('c7', L('CryptoFerme', 'CryptoFarm'), 'CRF', '🪙', 'Kevin Blockchain', null, [], {}, n, { status: 'bankrupt', sharePrice: 0, marketCap: 0 }),
    company('c8', 'Gadgetron', 'GDT', '📡', L('Lise Firmware', 'Lisa Firmware'), null, [], {}, n, { status: 'merged' }),
  ];
  const c1 = companies[0];
  // Filiales cohérentes avec les emplacements pris (§5.5 bis) : celles de c6, et sugar-2 en service pour c1
  // quand je la dirige — une route d'approvisionnement depuis un gisement s'affiche alors sur la carte.
  companies[5].sites = siteSlots.filter((sl) => sl.companyId === 'c6').map((sl) => siteView(sl));
  if (meControls) c1.sites = siteSlots.filter((sl) => sl.companyId === 'c1').map((sl) => siteView(sl));
  if (meControls && c1.private) {
    c1.products[0].private!.pendingCapacity = 10;
    // Un déménagement encore gratuit (comme un produit qui démarre) et un payant, pour exercer les deux affichages.
    c1.products[1].private!.zones.moveCost = 0;
  }

  // Ventes par ville (§5.2 bis) : publiques quand le secteur est régional (une usine hors de la capitale).
  // Ici les yaourts (sud, plaine) et les trottinettes (nord-est) ; les autres secteurs restent nationaux.
  if (turn > 1) {
    const regional = new Set<SectorId>();
    for (const c of companies) for (const p of c.products) if (p.zoneId !== undefined) regional.add(p.sectorId);
    for (const c of companies) {
      for (const p of c.products) {
        if (!regional.has(p.sectorId) || p.lastSales <= 0) continue;
        p.lastSalesByCity = splitByCity(p.sectorId, p.zoneId, p.lastSales);
        for (const r of c.reports) {
          const line = r.products.find((x) => x.productId === p.id);
          if (line && line.sold > 0) line.byCity = splitByCity(p.sectorId, p.zoneId, line.sold);
        }
      }
    }
  }

  const portfolio = (pid: string) => companies.reduce((a, c) => a + (c.holdings[pid] ?? 0) * c.sharePrice, 0);
  const mkPlayer = (id: string, name: string, isBot: boolean, cash: number, debt: number, over: Partial<PublicPlayer> = {}): PublicPlayer => {
    const pv = portfolio(id);
    const nw = cash + pv - debt;
    const hist = turn > 1 ? walk(4000 + 4000 * 2.5, turn - 1, 0.15, 0.03).map((v) => v * (0.8 + Number(id.slice(1)) * 0.1)) : [];
    return {
      id,
      name,
      isBot,
      color: PLAYER_COLORS[Number(id.slice(1)) - 1],
      cash,
      debt,
      portfolioValue: pv,
      netWorth: nw,
      connected: true,
      ready: false,
      controlledCompanyIds: companies.filter((c) => c.controllerId === id && c.status === 'active').map((c) => c.id),
      netWorthHistory: hist,
      stats: stats(),
      ...over,
    };
  };

  const names = txt().players;
  const players: PublicPlayer[] = [
    mkPlayer(ME, names[0], false, 3180, meControls ? 1500 : 0, {
      stats: stats({ takeoversSuffered: meControls ? 0 : 1, shadyActions: 3, bonusesTaken: 2400 }),
    }),
    mkPlayer('p2', names[1], true, 5200, 3000, { ready: true, botPersonalityId: 'tweetard' }),
    mkPlayer('p3', names[2], false, 1400, 0, { ready: true }),
    mkPlayer('p4', names[3], true, 7400, 0, { ready: true, botPersonalityId: 'delarente' }),
    mkPlayer('p5', names[4], false, 800, 0, { connected: false }),
  ];

  const sectors: SectorView[] = SECTOR_IDS.map((sid) => {
    const s = getContent(mockLang).sectors[sid];
    const prods = companies.flatMap((c) => c.products.filter((p) => p.sectorId === sid).map((p) => ({ p, c })));
    const shares = turn > 1 ? prods.map(({ p, c }) => ({ productId: p.id, companyId: c.id, name: p.name, share: p.lastMarketShare })) : [];
    const used = shares.reduce((a, x) => a + x.share, 0);
    return {
      id: sid,
      name: s.name,
      emoji: s.emoji,
      description: s.description,
      refPrice: s.refPrice,
      demandMultiplier: 0.9 + rand() * 0.25,
      demandHistory: turn > 1 ? walk(s.refDemand, turn - 1, s.volatility, s.growth) : [],
      lastTotalDemand: turn > 1 ? s.refDemand * (0.9 + rand() * 0.2) : 0,
      launchCost: s.launchCost,
      capacityCost: s.capacityCost,
      laborCost: s.laborCost,
      inputs: s.inputs,
      shares: turn > 1 ? [...shares, { productId: 'others', companyId: null, name: txt().others, share: Math.max(0, 0.95 - used) }] : [],
      // Estimation d'un lancement par zone (§5.8) : main-d'œuvre de la zone, matières au port × 1,1, transport compris.
      launchByZone: Object.fromEntries(
        ZONE_IDS.map((z) => {
          const unitZone =
            s.laborCost * zoneLabor(z, sid) +
            Object.entries(s.inputs).reduce((a, [c, q]) => a + (q ?? 0) * COMMODITIES[c as CommodityId].basePrice * 1.1, 0) +
            haulPerLot(sid, z);
          const profit = Math.round((s.refPrice * 0.9 - unitZone) * s.refDemand * 0.06 - s.fixedCost);
          // Demande de la zone (§5.2 bis) : celle de la capitale pondérée par l'attrait relatif de la zone.
          const demand = Math.round((s.refDemand * 0.06 * zoneAppeal(sid, z)) / zoneAppeal(sid, DEFAULT_ZONE));
          return [z, { unitCost: Math.round(unitZone * 100) / 100, quarterlyProfit: profit, paybackQuarters: profit > 0 ? Math.ceil(s.launchCost / profit) + 1 : null, demand }];
        }),
      ) as SectorView['launchByZone'],
    };
  });

  const commodities: CommodityView[] = COMMODITY_IDS.map((cid) => {
    const d = getContent(mockLang).commodities[cid];
    const hist = walk(d.basePrice, n, d.volatility);
    return { id: cid, name: d.name, emoji: d.emoji, unit: d.unit, price: hist[hist.length - 1] * (1 + (rand() - 0.5) * 0.06), priceHistory: hist };
  });

  const view: PlayerView = {
    you: ME,
    config: { totalTurns: 16, turnSeconds: 90, startYear: START_YEAR, seed: 1, lang: mockLang },
    turn,
    dateLabel: dateLabel(turn, START_YEAR, mockLang),
    phase: opts.phase,
    players,
    companies,
    // Trois emplacements par matière ; ceux pris (c6, et c1 si je la dirige) ont chacun leur filiale.
    siteSlots,
    sectors,
    commodities,
    interestRate: 0.012,
    taxRate: 0.25,
    marketSentiment: 1.04,
    personalLoanLimit: 2100,
    journal: journal(turn),
    turnEndsAt: Date.now() + 75_000,
  };

  if (opts.phase === 'finished') {
    const ranking = [...players].sort((a, b) => b.netWorth - a.netWorth).map((p) => ({ playerId: p.id, netWorth: p.netWorth }));
    view.results = {
      ranking,
      trophies: [
        { trophyId: 'magnat', playerId: ranking[0].playerId, value: ranking[0].netWorth },
        { trophyId: 'pollueur', playerId: 'p2', value: 412 },
        { trophyId: 'machiavel', playerId: ME, value: 7 },
        { trophyId: 'parachute', playerId: 'p3', value: 1250 },
        { trophyId: 'predateur', playerId: 'p2', value: 2 },
        { trophyId: 'proie', playerId: ME, value: 1 },
        { trophyId: 'casserole', playerId: 'p2', value: 3 },
        { trophyId: 'naufrage', playerId: 'p5', value: 5400 },
        { trophyId: 'bonus', playerId: ME, value: 6200 },
      ],
    };
    view.turnEndsAt = undefined;
  }
  return view;
}

/** Deux bots disponibles, dans la langue du salon (comme le serveur les enverrait). */
function mockBots(): LobbyView['availableBots'] {
  return getContent(mockLang)
    .bots.filter((b) => b.id !== 'tweetard')
    .slice(0, 2)
    .map((b) => ({ id: b.id, ceoName: b.ceoName, companyName: b.companyName, emoji: b.emoji, tagline: b.tagline }));
}

function buildMockLobby(hex = false): LobbyView {
  const [meName, p2Name, p3Name] = txt().players;
  const en = mockLang === 'en';
  const config: LobbyView['config'] = { totalTurns: 16, turnSeconds: 90, startYear: START_YEAR, lang: mockLang };
  if (hex) config.mapMode = 'hex';
  const players: LobbyView['players'] = [
    { id: ME, name: meName, isBot: false, companyName: 'Synergix', sectorId: 'energy_drinks', connected: true, color: PLAYER_COLORS[0] },
    { id: 'p2', name: p2Name, isBot: true, botPersonalityId: 'tweetard', botLevel: 'normal', companyName: en ? 'Moonshot Galactic' : 'Tweetard Galactic', sectorId: 'scooters', connected: true, color: PLAYER_COLORS[1] },
    { id: 'p3', name: p3Name, isBot: false, companyName: en ? 'Leverage & Sons' : 'Levier & Fils', sectorId: 'gadgets', connected: false, color: PLAYER_COLORS[2] },
  ];
  const lobby: LobbyView = {
    roomCode: 'KXMP',
    hostId: ME,
    you: ME,
    maxPlayers: 8,
    config,
    players,
    availableBots: mockBots(),
  };
  if (hex) lobby.terrains = terrainLobbyPayload(config, players);
  return lobby;
}

/** Mode « au choix » du serveur (§12 bis) : plateau hexagonal + attribution choice. */
function isTerrainChoice(lobby: LobbyView): boolean {
  return isSpatialMap(lobby.config) && lobby.config.terrainAssignment === 'choice';
}

/** Premier humain de l'ordre sans terrain ; null lorsque chacun a choisi (comme nextTerrainPicker du serveur). */
function nextTerrainPicker(lobby: LobbyView): string | null {
  return lobby.terrainPickOrder?.find((id) => lobby.config.terrains?.[id] === undefined) ?? null;
}

/** Met à jour le tour exposé sur la vue, ou efface ordre et tour hors mode « au choix ». */
function refreshTerrainPick(lobby: LobbyView): void {
  if (isTerrainChoice(lobby)) {
    lobby.terrainPickTurn = nextTerrainPicker(lobby);
  } else {
    delete lobby.terrainPickOrder;
    delete lobby.terrainPickTurn;
  }
}

/** Tire l'ordre de choix parmi les humains seulement (les bots choisiront au démarrage, comme le serveur). */
function drawTerrainPickOrder(lobby: LobbyView): void {
  const order = lobby.players.filter((x) => !x.isBot).map((x) => x.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  lobby.terrainPickOrder = order;
}

// ---------------------------------------------------------------------------
// Backend simulé (grossier : juste de quoi voir l'UI réagir)
// ---------------------------------------------------------------------------

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function quip(type: string): string {
  const list = getContent(mockLang).actionQuips[type];
  return list?.length ? list[Math.floor(Math.random() * list.length)] : txt().done;
}

function mutate(fn: (v: PlayerView) => void): void {
  const cur = getState().view;
  if (!cur) return;
  const v = clone(cur);
  fn(v);
  receiveView(v);
}

const backend: MockBackend = {
  action(action: Action, turn?: number): ActionResult {
    // Comme le serveur : le trimestre a tourné depuis l'affichage, on refuse sans appliquer.
    const cur = getState().view;
    if (turn !== undefined && cur && turn !== cur.turn) {
      return {
        ok: false,
        message:
          getState().lang === 'en'
            ? 'The quarter closed in the meantime, so that action was not applied. Check your numbers and send it again.'
            : 'Le trimestre a tourné entre-temps : action non appliquée. Vérifiez vos chiffres et renvoyez-la.',
      };
    }
    switch (action.type) {
      case 'setProductDecisions':
        mutate((v) => {
          const p = v.companies.find((c) => c.id === action.companyId)?.products.find((x) => x.id === action.productId);
          if (!p) return;
          if (action.price !== undefined) p.price = action.price;
          if (p.private) {
            if (action.production !== undefined) p.private.production = action.production;
            if (action.marketing !== undefined) p.private.marketing = action.marketing;
            if (action.rnd !== undefined) p.private.rnd = action.rnd;
          }
          refreshEstimate(p);
        });
        return { ok: true, message: txt().saved };
      case 'launchProduct': {
        let result: ActionResult = { ok: false, message: txt().notFound };
        mutate((v) => {
          const c = v.companies.find((x) => x.id === action.companyId);
          if (!c) return;
          const def = getContent(mockLang).sectors[action.sectorId];
          const p = product(`pr-${c.products.length + 1}-${v.turn}`, action.name, action.sectorId, true, v.turn, {
            capacity: 0,
            comingSoon: true,
            quality: 1,
            brand: 0.3,
            price: def.refPrice,
            lastSales: 0,
            lastRevenue: 0,
            lastMarketShare: 0,
            launchedTurn: v.turn,
            firstSalesTurn: v.turn + 1,
            // Comme le moteur : la capitale (défaut) ne s'écrit pas, `zoneId` absent = capitale (§5.8).
            ...(action.zoneId !== undefined && action.zoneId !== DEFAULT_ZONE ? { zoneId: action.zoneId } : {}),
          });
          if (p.private) {
            p.private.pendingCapacity = def.startingCapacity;
            p.private.stock = 0;
            p.private.lastProduced = 0;
          }
          refreshEstimate(p);
          c.products.push(p);
          c.cash -= def.launchCost;
          result = { ok: true, message: quip(action.type) };
        });
        return result;
      }
      case 'moveFactory': {
        let result: ActionResult = { ok: false, message: txt().notFound };
        mutate((v) => {
          const c = v.companies.find((x) => x.id === action.companyId);
          const p = c?.products.find((x) => x.id === action.productId);
          // La maquette reste en mode classique ; les déplacements par case passent par le moteur.
          if (!c || !p?.private || action.zoneId === undefined) return;
          if (action.zoneId === (p.zoneId ?? DEFAULT_ZONE)) return;
          const cost = p.private.zones.moveCost;
          if (cost > c.cash) {
            result = { ok: false, message: txt().tooPoor };
            return;
          }
          c.cash -= cost;
          // Comme le moteur : retour à la capitale = `zoneId` effacé (§5.8).
          if (action.zoneId === DEFAULT_ZONE) delete p.zoneId;
          else p.zoneId = action.zoneId;
          p.private.estimatedTransport = haulPerLot(p.sectorId, action.zoneId);
          p.private.estimatedUnitCost = p.private.zones.unitCost[action.zoneId];
          if (p.private.market) p.private.market.unitCost = p.private.estimatedUnitCost;
          // Le trimestre de démarrage est passé : le prochain déménagement se paiera.
          if (cost === 0 && p.launchedTurn >= v.turn) {
            p.private.zones.moveCost = Math.round(FACTORY_MOVE_COST_RATIO * (p.capacity + p.private.pendingCapacity) * getContent(mockLang).sectors[p.sectorId].capacityCost);
          }
          refreshEstimate(p);
          result = { ok: true, message: quip(action.type) };
        });
        return result;
      }
      case 'expandCapacity':
        mutate((v) => {
          const c = v.companies.find((x) => x.id === action.companyId);
          const p = c?.products.find((x) => x.id === action.productId);
          if (!c || !p?.private) return;
          p.private.pendingCapacity += action.lots;
          c.cash -= action.lots * getContent(mockLang).sectors[p.sectorId].capacityCost;
        });
        return { ok: true, message: quip(action.type) };
      case 'buyShares':
      case 'sellShares': {
        let result: ActionResult = { ok: false, message: txt().notFound };
        mutate((v) => {
          const c = v.companies.find((x) => x.id === action.companyId);
          const me = v.players.find((p) => p.id === v.you);
          if (!c || !me) return;
          const S = c.sharesOutstanding;
          const n = action.shares;
          if (action.type === 'buyShares') {
            const cost = shareBuyCost(c.sharePrice, n, S);
            if (cost > me.cash || n > c.floatShares) {
              result = { ok: false, message: txt().tooPoor };
              return;
            }
            me.cash -= cost;
            c.holdings[v.you] = (c.holdings[v.you] ?? 0) + n;
            c.floatShares -= n;
            c.sharePrice = sharePriceAfter(c.sharePrice, n, S, 'buy');
            if (c.holdings[v.you] / S > 0.5 && c.controllerId !== v.you) {
              c.controllerId = v.you;
              c.ceoName = me.name;
              c.private = {
                scandal: 10,
                inventory: {},
                modifiers: [],
                loanLimit: 5000,
                maxBonus: c.cash * 0.1,
                turnFlags: { bonusTaken: 0, buybackDone: false, shadyDone: [] },
              };
            }
          } else {
            const held = c.holdings[v.you] ?? 0;
            if (n > held) {
              result = { ok: false, message: txt().notOwned };
              return;
            }
            me.cash += shareSellProceeds(c.sharePrice, n, S);
            c.holdings[v.you] = held - n;
            c.floatShares += n;
            c.sharePrice = sharePriceAfter(c.sharePrice, n, S, 'sell');
          }
          c.marketCap = c.sharePrice * S;
          me.portfolioValue = v.companies.reduce((a, x) => a + (x.holdings[v.you] ?? 0) * x.sharePrice, 0);
          me.netWorth = me.cash + me.portfolioValue - me.debt;
          me.controlledCompanyIds = v.companies.filter((x) => x.controllerId === v.you).map((x) => x.id);
          result = { ok: true, message: quip(action.type) };
        });
        return result;
      }
      case 'poisonPill':
        return { ok: false, message: txt().pill };
      default:
        return { ok: true, message: quip(action.type) };
    }
  },
  ready(ready: boolean) {
    mutate((v) => {
      const me = v.players.find((p) => p.id === v.you);
      if (me) me.ready = ready;
    });
  },
  lobby(kind, payload): SimpleAck {
    const lobby = getState().lobby;
    if (!lobby) return { ok: false, error: txt().noLobby };
    const next = clone(lobby);
    const me = next.players.find((p) => p.id === next.you);
    const p = (payload ?? {}) as Record<string, unknown>;
    if (kind === 'update' && me) {
      if (typeof p.companyName === 'string') me.companyName = p.companyName;
      if (typeof p.sectorId === 'string') me.sectorId = p.sectorId as SectorId;
    } else if (kind === 'config') {
      // Comme le serveur : en mode « au choix », l'hôte ne peut pas imposer une carte (chacun prend son terrain).
      const prevAssignment = next.config.terrainAssignment ?? 'fair';
      if (p.terrains !== undefined && ((p.terrainAssignment as string | undefined) ?? prevAssignment) === 'choice') {
        return { ok: false, error: txt().hostMapInChoice };
      }
      const prevMapMode = next.config.mapMode ?? 'classic';
      // Comme le serveur : les terrains envoyés avec un changement de mode survivent (appliqués après la remise à zéro).
      const sentTerrains = p.terrains;
      Object.assign(next.config, p);
      // Comme le serveur : le niveau du salon vaut pour tous les bots présents.
      if (typeof p.botLevel === 'string') for (const x of next.players) if (x.isBot) x.botLevel = p.botLevel as BotLevel;
      if (p.lang === 'fr' || p.lang === 'en') {
        // Langue du salon changée par l'hôte : noms des bots et monnaie suivent.
        mockLang = p.lang;
        next.availableBots = mockBots();
      }
      // Changer de plateau ou de mode d'attribution efface les terrains et, en mode « au choix », retire l'ordre.
      const resetTerrains =
        (typeof p.mapMode === 'string' && p.mapMode !== prevMapMode) ||
        (typeof p.terrainAssignment === 'string' && p.terrainAssignment !== prevAssignment);
      if (resetTerrains) {
        delete next.config.terrains;
        delete next.terrainPickOrder;
        if (isTerrainChoice(next)) drawTerrainPickOrder(next);
      }
      if (sentTerrains !== undefined) next.config.terrains = { ...(sentTerrains as Record<string, string>) };
    } else if (kind === 'addBot') {
      const bot = next.availableBots.find((b) => b.id === p.personalityId) ?? next.availableBots[0];
      if (!bot) return { ok: false, error: txt().noBots };
      next.availableBots = next.availableBots.filter((b) => b !== bot);
      next.players.push({
        id: `b${next.players.length + 1}`,
        name: bot.ceoName,
        isBot: true,
        botPersonalityId: bot.id,
        botLevel: next.config.botLevel ?? 'normal',
        companyName: bot.companyName,
        sectorId: 'yogurts',
        connected: true,
        color: PLAYER_COLORS[next.players.length % PLAYER_COLORS.length],
      });
    } else if (kind === 'removeBot') {
      next.players = next.players.filter((x) => x.id !== p.playerId);
      // Comme le serveur : le joueur retiré perd aussi son terrain et sa place dans l'ordre de choix.
      if (next.config.terrains) delete next.config.terrains[p.playerId as string];
      if (next.terrainPickOrder) next.terrainPickOrder = next.terrainPickOrder.filter((id) => id !== p.playerId);
    } else if (kind === 'botLevel') {
      const bot = next.players.find((x) => x.id === p.playerId && x.isBot);
      if (bot) bot.botLevel = p.level as BotLevel;
      const levels = new Set(next.players.filter((x) => x.isBot).map((x) => x.botLevel ?? 'normal'));
      if (levels.size === 1) next.config.botLevel = p.level as BotLevel;
    } else if (kind === 'pickTerrain') {
      // Comme le serveur : réservé aux humains, en salon, en mode hexagonal « au choix ».
      const who = next.players.find((x) => x.id === next.you);
      if (!who || who.isBot || !isTerrainChoice(next)) return { ok: false, error: txt().pickNotAllowed };
      if (p.terrainId === null) {
        // null libère son propre terrain à tout moment ; le tour revient alors à ce joueur (recalculé plus bas).
        if (next.config.terrains) delete next.config.terrains[next.you];
      } else if (typeof p.terrainId === 'string') {
        if (next.you !== nextTerrainPicker(next)) return { ok: false, error: txt().notYourTurn };
        if (!getContent(mockLang).terrains.definitions.some((terrain) => terrain.id === p.terrainId)) {
          return { ok: false, error: txt().unknownTerrain };
        }
        if (Object.values(next.config.terrains ?? {}).includes(p.terrainId)) return { ok: false, error: txt().terrainTaken };
        next.config.terrains = { ...next.config.terrains, [next.you]: p.terrainId };
      } else {
        // Comme le serveur : un terrainId qui n'est ni null ni une chaîne est refusé.
        return { ok: false, error: txt().badRequest };
      }
    } else if (kind === 'start') {
      receiveView(buildMockView({ turn: 1, phase: 'playing', meControls: true }));
      return { ok: true };
    }
    // Salon hexagonal : les cartes des terrains suivent la config et les joueurs ; sinon elles n'existent pas.
    if (isSpatialMap(next.config)) next.terrains = terrainLobbyPayload(next.config, next.players);
    else delete next.terrains;
    // Mode « au choix » : le tour exposé suit les choix faits ; ordre et tour n'existent pas sinon.
    refreshTerrainPick(next);
    setState({ lobby: next });
    return { ok: true };
  },
};

export function startMock(mode: string, lang: Lang = 'fr', hex = false): void {
  mockLang = lang;
  if (mode === 'hex' || mode === 'square') {
    setState({ lang, lobby: null });
    applyDocumentLang(lang);
    startEngineMock(lang, { mapMode: mode });
    return;
  }
  if (mode === 'engine' || mode === 'ousted') {
    startEngineMock(lang, { ousted: mode === 'ousted' });
    return;
  }
  installMock(backend);
  setState({ session: { roomCode: 'KXMP', playerId: ME, token: 'mock' } });
  if (mode === 'lobby') {
    setState({ lobby: buildMockLobby(hex) });
    return;
  }
  const opts: Options =
    mode === 'end'
      ? { turn: 16, phase: 'finished', meControls: true }
      : mode === 'fresh'
        ? { turn: 1, phase: 'playing', meControls: true }
        : mode === 'none'
          ? { turn: 6, phase: 'playing', meControls: false }
          : { turn: 5, phase: 'playing', meControls: true };
  setState({ view: buildMockView(opts) });
  if (mode === '1') {
    const x = txt();
    pushToast('info', x.toastNew(dateLabel(opts.turn, START_YEAR, mockLang)), x.toastNewTitle, 60_000, 'newQuarter');
    pushToast('drama', x.toastPredator, x.toastPredatorTitle, 60_000);
  }
}
