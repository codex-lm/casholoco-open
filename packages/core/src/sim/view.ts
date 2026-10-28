/**
 * Vue redigée d'un joueur (§12) : aucune jauge de scandale d'autrui (seulement un niveau),
 * aucune décision privée d'une entreprise non contrôlée, ni news programmée, ni état du RNG, ni graine.
 */
import { candidateHexes, freeBuildableHexes, heatCredit, hexOf, occupiedHexes, zoneHexId } from './hexes';
import { boardCells, boardBuildable, isSpatialMap } from '../content/hexes';
import { boardTerrains } from '../content/boardTerrains';

import { getContent } from '../content';
import { closeRecapView } from './closeRecap';
import { dateLabel } from '../format';
import {
  COMMODITY_IDS,
  SECTOR_IDS,
  type CommodityView,
  type CompanyState,
  type CompanyView,
  type GameState,
  type Id,
  type PlayerStats,
  type PlayerView,
  type ProductView,
  type PublicPlayer,
  type ScandalLevel,
  type SectorView,
  type SiteSlotView,
  type ZoneId,
  ZONE_IDS,
} from '../types';
import { estimateLaunchIn, estimateLaunchInHex, estimateSales, expectedSectorDemand, hexDemand, marketInputs, valuationPerShare, zoneDemand } from './advice';
import { parcelPopulationShares } from './demandMap';
import {
  bookValue,
  companyLoanLimit,
  computeNetWorth,
  effectiveBaseRate,
  effectiveTaxRate,
  estimatedUnitCost,
  laborPerLotHex,
  unitCostByZone,
  unitCostByHex,
  floatShares,
  launchChargesLeft,
  launchChargesNext,
  marketCap,
  maxBonus,
  maxProductsOf,
  personalLoanLimit,
  portfolioValue,
  rumorCheckPrice,
} from './finance';
import { langOf, tr } from './i18n';
import { STARTUP_SUBSIDY } from './constants';
import { cartelMembers, cartelQuarters, cartelRisk, seesCurrentPrice, siteCostFactor, siteCurrentUnitCost, siteUpkeep, slotOperators } from './deals';
import { botLevelOf, clamp, fin, getOwn } from './util';
import { estimatedTransport, factoryMoveCost, transportFactor } from './transport';
import { planClose } from './close';

import { bareLandReserve, hexReservePrice, pendingHexCommitments } from './hexAuctions';
import { factoryCapacityLimit, factoryOnLand, ownedLand, productProfile, usesIndustryNetwork, VACANT_LAND_UPKEEP_RATIO } from './industry';
import { activeTerrain, activePlantTerrain, activeSeatTerrain, companyTaxRate, companySeatTaxRate, effectiveFixedCost, effectiveHeatCredit, runningTerrainEffects, terrainMultiplier, terrainSalvageRate } from './terrains';
import type { TerrainEffect, TerrainLever } from '../types';

function terrainSummary(state: GameState, c: CompanyState, p: CompanyState['products'][number]): TerrainEffect[] {
  const out: TerrainEffect[] = [];
  const levers: TerrainLever[] = ['labor', 'rnd', 'marketing', 'perishability', 'scandal', 'fixedCost', 'demand', 'heat', 'perceivedPrice'];
  for (const lever of levers) {
    const mult = terrainMultiplier(state, c, p, lever);
    if (mult !== 1) out.push({ lever, mult });
  }
  if (activeSeatTerrain(state, c)?.effects.some((e) => e.lever === 'tax')) out.push({ lever: 'tax', rate: companyTaxRate(state, c) });
  if (activePlantTerrain(state, p, c)?.effects.some((e) => e.lever === 'salvage')) out.push({ lever: 'salvage', rate: terrainSalvageRate(state, p, c) });
  return out;
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export function scandalLevel(scandal: number): ScandalLevel {
  return scandal < 30 ? 'faible' : scandal < 60 ? 'moyen' : 'élevé';
}

function companyView(state: GameState, c: CompanyState, viewerId: Id | null, freeCells: string[]): CompanyView {
  const mine = viewerId !== null && c.controllerId === viewerId && c.status === 'active';
  const playing = state.phase === 'playing';
  const hexMode = isSpatialMap(state.config);
  // Projections privées : seules les échéances connues changent, sans consommer le RNG ni muter l'état.
  const horizon = hexMode && mine && playing ? Array.from({ length: Math.max(1, state.config.totalTurns - state.turn + 1) }, (_, offset) => {
    if (offset === 0) return { state, company: c };
    // Les réservations du dirigeant sont connues ; leur exécution retire les dotations après cette clôture.
    const company: CompanyState = { ...c,
      terrainId: c.products.some((p) => p.pendingHexId && p.terrainId === c.terrainId) ? undefined : c.terrainId,
      products: c.products.map((p) => p.pendingHexId ? { ...p, hexId: p.pendingHexId, terrainId: undefined, pendingHexId: undefined } : p),
      modifiers: c.modifiers.filter((m) => m.turnsLeft > offset).map((m) => ({ ...m, turnsLeft: m.turnsLeft - offset })),
    };
    return { company, state: {
      ...state, turn: state.turn + offset, companies: { ...state.companies, [c.id]: company },
      activeEffects: state.activeEffects.filter((e) => e.turnsLeft > offset).map((e) => ({ ...e, turnsLeft: e.turnsLeft - offset })),
    } };
  }) : [];
  const products: ProductView[] = c.products.map((p) => {
    const profile = productProfile(c, p);
    const v: ProductView = {
      id: p.id,
      name: p.name,
      sectorId: p.sectorId,
      quality: p.quality,
      brand: p.brand,
      capacity: p.capacity,
      // Décisions cachées jusqu'à la résolution (§12) : les autres voient le prix du trimestre précédent, sauf les
      // partenaires d'une entente sur ce secteur (§7 bis).
      price: mine || seesCurrentPrice(state, viewerId, c, p.sectorId) ? p.price : (p.lastPrice ?? p.price),
      lastSales: p.lastSales,
      lastRevenue: p.lastRevenue,
      lastMarketShare: p.lastMarketShare,
      launchedTurn: p.launchedTurn,
      ...(p.factoryProductId ? { factoryProductId: p.factoryProductId } : {}),
      ...(usesIndustryNetwork(state) ? { capacityLimit: factoryCapacityLimit(p) } : {}),
    };
    if (p.capacity <= 0 && p.pendingCapacity > 0 && p.stock <= 0) v.comingSoon = true;
    if (p.firstSalesTurn !== undefined) v.firstSalesTurn = p.firstSalesTurn;
    // Où est l'usine : public (§5.8), comme la capacité.
    if (p.zoneId !== undefined) v.zoneId = p.zoneId;
    if (hexMode && p.hexId !== undefined) v.hexId = p.hexId;
    if (hexMode && p.incubator) v.incubator = true;
    if (hexMode && p.landCost !== undefined) v.landCost = p.landCost;
    // Ventes du dernier trimestre par ville (§5.2 bis) : un résultat public, comme les ventes.
    if (p.lastSalesByCity) v.lastSalesByCity = { ...p.lastSalesByCity };
    if (p.lastSalesOrigin) v.lastSalesOrigin = { ...p.lastSalesOrigin };
    if (mine) {
      const unitCost = estimatedUnitCost(state, c, p);
      const moveCost = hexMode && p.incubator ? 0 : factoryMoveCost(state, p);
      const currentLabor = hexMode && playing ? laborPerLotHex(state, c, p) : 0;
      const cells = hexMode ? [...new Set([...freeCells, hexOf(p, state.config), ...(p.pendingHexId ? [p.pendingHexId] : [])])] : [];
      // Ancien contrat du client : les zones restent des repères, évalués à leur case exacte.
      const zoneCells = hexMode ? unitCostByHex(state, c, p, ZONE_IDS.map(z => zoneHexId(z, state.config))) : undefined;
      const zoneCosts = zoneCells ? Object.fromEntries(ZONE_IDS.map((z) => [z, zoneCells[zoneHexId(z, state.config)]])) as Record<ZoneId, number> : unitCostByZone(state, c, p);
      v.private = {
        pendingCapacity: p.pendingCapacity,
        stock: p.stock,
        production: p.production,
        marketing: profile?.marketing ?? p.marketing,
        rnd: profile?.rnd ?? p.rnd,
        lastProduced: p.lastProduced,
        lastUnitCost: p.lastUnitCost,
        estimatedUnitCost: unitCost,
        estimatedTransport: fin(estimatedTransport(state, c, p)),
        zones: { unitCost: zoneCosts, moveCost },
        ...(hexMode ? {
          heatCredit: effectiveHeatCredit(state, p),
          terrainEffects: terrainSummary(state, c, p),
          ...(playing ? { terrainProjection: horizon.map(({ state: future, company }) => {
            const projected = company.products.find((q) => q.id === p.id)!;
            return {
              hexId: projected.hexId,
              unitCost: future === state ? unitCost : projected.hexId !== p.hexId ? estimatedUnitCost(future, company, projected)
                : unitCost + laborPerLotHex(future, company, projected) - currentLabor,
              fixedCost: effectiveFixedCost(future, projected, company),
              rndMultiplier: terrainMultiplier(future, company, projected, 'rnd'),
              marketingMultiplier: terrainMultiplier(future, company, projected, 'marketing'),
              demandMultiplier: terrainMultiplier(future, company, projected, 'demand'),
              perishabilityMultiplier: terrainMultiplier(future, company, projected, 'perishability'),
              priceMultiplier: terrainMultiplier(future, company, projected, 'perceivedPrice'),
            };
          }) } : {}),
          ...(p.pendingHexId ? { pendingHexId: p.pendingHexId } : {}),
          hexes: { unitCost: unitCostByHex(state, c, p, cells), moveCost },
        } : {}),
      };
      if (playing) {
        const market = marketInputs(state, c, p, viewerId, unitCost);
        v.private.market = market;
        const decisions = {
          quality: p.quality,
          brand: p.brand,
          price: p.price,
          production: p.production,
          capacity: p.capacity,
          stock: p.stock,
          marketing: profile?.marketing ?? p.marketing,
          rnd: profile?.rnd ?? p.rnd,
        };
        v.private.estimate = estimateSales(p.sectorId, market, decisions);
        if (hexMode) {
          v.private.hexes!.demand = hexDemand(p.sectorId, market, decisions, cells, { state, c, p });
          const demand = hexDemand(p.sectorId, market, decisions, ZONE_IDS.map(z => zoneHexId(z, state.config)), { state, c, p });
          v.private.zones.demand = Object.fromEntries(ZONE_IDS.map((z) => [z, demand[zoneHexId(z, state.config)]])) as Record<ZoneId, number>;
        } else v.private.zones.demand = zoneDemand(p.sectorId, market, decisions);
      }
    }
    return v;
  });
  const view: CompanyView = {
    ...(hexMode ? { taxRate: companySeatTaxRate(state, c), horizonSeatTaxRate: companySeatTaxRate(state, c, true), scandalMultiplier: terrainMultiplier(state, c, undefined, 'scandal'),
      ...(activeSeatTerrain(state, c) ? { terrainId: c.terrainId } : {}) } : {}),
    id: c.id,
    name: c.name,
    ticker: c.ticker,
    emoji: c.emoji,
    color: c.color,
    ceoName: c.ceoName,
    founderId: c.founderId,
    controllerId: c.controllerId,
    status: c.status,
    foundedSectorId: c.foundedSectorId,
    sharesOutstanding: c.sharesOutstanding,
    holdings: { ...c.holdings },
    floatShares: floatShares(c),
    sharePrice: c.sharePrice,
    marketCap: marketCap(c),
    priceHistory: [...c.priceHistory],
    reputation: c.reputation,
    scandalLevel: scandalLevel(c.scandal),
    cash: c.cash,
    debt: c.debt,
    products,
    ...(usesIndustryNetwork(state) ? { land: ownedLand(c).map(parcel => ({ ...parcel,
      vacant: !factoryOnLand(c, parcel.hexId), upkeep: factoryOnLand(c, parcel.hexId) ? 0 : VACANT_LAND_UPKEEP_RATIO * Math.max(parcel.cost, hexReservePrice(parcel.hexId)),
    })) } : {}),
    // Les lignes produit des rapports (production, coût unitaire) des entreprises que le joueur ne contrôle pas
    // restent cachées pendant la partie (§12) : la production passée trahirait la production en cours.
    reports: mine ? clone(c.reports) : c.reports.map((r) => clone({ ...r,
      products: playing ? [] : r.products.map(({ demand: _demand, averagePrice: _price, margin: _margin,
        stockLeft: _stock, spoiled: _spoiled, ...publicProduct }) => publicProduct),
    })),
  };
  // Filiales d'approvisionnement : publiques (§5.5 bis).
  if (c.sites && c.sites.length > 0) {
    view.sites = c.sites.map((s) => ({
      ...s,
      name: (state.siteSlots ?? []).find((x) => x.id === s.id)?.name ?? s.commodityId,
      currentUnitCost: siteCurrentUnitCost(state, s),
      upkeep: siteUpkeep(s),
    }));
  }
  if (c.status === 'active') {
    const bv = bookValue(c);
    view.maxProducts = maxProductsOf(c);
    view.valuation = { bookValue: bv, smoothedProfit: c.profitEma, perShare: valuationPerShare(bv, c.profitEma, c.sharesOutstanding) };
  }
  if (mine) {
    view.private = {
      ...(hexMode ? { taxRate: companyTaxRate(state, c),
        ...(playing ? { taxRateHorizon: horizon.map(({ state: future, company }) => companyTaxRate(future, company)) } : {}),
        launchProjects: (state.hexBids ?? []).filter((b) => !b.result && b.companyId === c.id && b.playerId === viewerId
          && b.project !== undefined).map((b) => clone(b.project!)),
        pendingHexCommitment: pendingHexCommitments(state, c),
      } : {}),
      scandal: c.scandal,
      inventory: clone(c.inventory),
      modifiers: clone(c.modifiers),
      loanLimit: companyLoanLimit(c),
      maxBonus: maxBonus(c),
      launchChargesLeft: launchChargesLeft(c),
      launchChargesNext: launchChargesNext(c),
      turnFlags: clone(c.turnFlags),
    };
    // Ce que la trésorerie paiera à la prochaine clôture (§5.7) : bandeau du dirigeant, et repère des bots experts.
    if (playing && c.status === 'active') view.private.closePlan = planClose(state, c);
  }
  return view;
}

function sectorView(state: GameState, id: (typeof SECTOR_IDS)[number], viewerId: Id | null, freeCells: string[], defaultHex: string | undefined, includeDestinations = false): SectorView {
  const def = getContent(langOf(state)).sectors[id];
  const s = state.sectors[id];
  const shares: SectorView['shares'] = [];
  let total = 0;
  for (const c of Object.values(state.companies)) {
    if (c.status !== 'active') continue;
    for (const p of c.products) {
      if (p.sectorId !== id) continue;
      shares.push({ productId: p.id, companyId: c.id, name: p.name, share: p.lastMarketShare });
      total += p.lastMarketShare;
    }
  }
  shares.sort((a, b) => b.share - a.share);
  shares.push({ productId: 'others', companyId: null, name: tr(state).otherCompetitors, share: clamp(1 - total, 0, 1) });
  const view: SectorView = {
    id,
    name: def.name,
    emoji: def.emoji,
    description: def.description,
    refPrice: def.refPrice,
    demandMultiplier: s.demandMultiplier,
    demandHistory: [...s.demandHistory],
    lastTotalDemand: s.lastTotalDemand,
    expectedDemandHorizon: Array.from({ length: Math.max(0, state.config.totalTurns - state.turn + 1) },
      (_, offset) => expectedSectorDemand(state, id, state.turn + offset, viewerId)),
    ...(s.lastMarketPriceMultiplier !== undefined ? { lastMarketPriceMultiplier: s.lastMarketPriceMultiplier } : {}),
    launchCost: def.launchCost,
    capacityCost: def.capacityCost,
    laborCost: def.laborCost,
    inputs: { ...def.inputs },
    shares,
  };
  if (state.phase === 'playing' && isSpatialMap(state.config)) {
    const byHex = estimateLaunchInHex(state, id, viewerId, freeCells, includeDestinations);
    view.launchByHex = byHex;
    if (defaultHex && byHex[defaultHex]) {
      const estimate = byHex[defaultHex];
      view.launchEstimate = { quarterlyProfit: estimate.quarterlyProfit, paybackQuarters: estimate.paybackQuarters };
    }
  } else if (state.phase === 'playing') {
    const byZone = estimateLaunchIn(state, id, viewerId, ZONE_IDS) as NonNullable<SectorView['launchByZone']>;
    view.launchEstimate = { quarterlyProfit: byZone.capital.quarterlyProfit, paybackQuarters: byZone.capital.paybackQuarters };
    view.launchByZone = byZone;
  }
  return view;
}

/**
 * Statistiques d'un joueur telles que les voit un autre : pendant la partie, le nombre d'alertes lancées est masqué,
 * sinon la source « anonyme » d'un flash du lanceur d'alerte se lirait dans le compteur (§7, §12). Le compteur
 * d'actions discutables aussi (ramené à 0) : il trahirait en direct une décision cachée et la jauge de scandale.
 * Tout est révélé à la fin de la partie (trophées).
 */
function publicStats(state: GameState, stats: PlayerStats, own: boolean): PlayerStats {
  const out = { ...stats };
  if (!own && state.phase !== 'finished') {
    delete out.whistleblows;
    out.shadyActions = 0;
  }
  return out;
}

/**
 * `journal: 'last'` ne copie que le numéro du jour : les bots experts relisent leur vue après chaque action, et
 * n'ont besoin que des rumeurs du jour.
 * `hexEstimates: 'candidates'` garde leur petite sélection et son ordre ; l'API publique évalue toutes les cases.
 */
export function buildPlayerView(state: GameState, playerId: Id, opts: { journal?: 'all' | 'last'; hexEstimates?: 'candidates' } = {}): PlayerView {
  // Même occupation pour toute la vue ; chaque produit ajoute sa case et sa destination adjugée.
  const freeCells = isSpatialMap(state.config) ? freeBuildableHexes(state) : [];
  // Le résumé de lancement garde sa destination historique ; seule la couverture des tables s'élargit.
  const botCandidates = isSpatialMap(state.config) ? candidateHexes(state) : [];
  // Human map scenarios may start on any parcel, including occupied land and deposits. This evaluates the
  // viewer's own product at those positions; it neither reveals rival decisions nor makes the land available.
  const estimateCells = opts.hexEstimates === 'candidates' ? botCandidates : boardCells(state.config).map((hex) => hex.id);
  const me = getOwn(state.players, playerId);
  // Réserver puis annuler plusieurs bots ne doit pas permettre d'espionner leurs décisions.
  // L'identité reste visible, mais les accès privés n'arrivent qu'au trimestre d'activation.
  const viewerId = me && !(me.botTakeover && state.turn < me.botTakeover.activeFromTurn) ? playerId : null;
  const players: PublicPlayer[] = Object.values(state.players).map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    ...(p.botPersonalityId ? { botPersonalityId: p.botPersonalityId } : {}),
    ...(p.isBot ? { botLevel: botLevelOf(state, p) } : {}),
    ...(p.botTakeover ? { botTakeover: { previousName: p.botTakeover.previousName, activeFromTurn: p.botTakeover.activeFromTurn } } : {}),
    color: p.color,
    cash: p.cash,
    debt: p.debt,
    portfolioValue: portfolioValue(state, p.id),
    netWorth: computeNetWorth(state, p.id),
    connected: p.connected,
    ready: p.ready,
    controlledCompanyIds: Object.values(state.companies)
      .filter((c) => c.status === 'active' && c.controllerId === p.id)
      .map((c) => c.id),
    netWorthHistory: [...p.netWorthHistory],
    stats: publicStats(state, p.stats, p.id === viewerId),
  }));
  const companies = Object.values(state.companies).map((c) => companyView(state, c, viewerId, estimateCells));
  const content = getContent(langOf(state));
  const commodities: CommodityView[] = COMMODITY_IDS.map((id) => {
    const cv: CommodityView = {
      id,
      name: content.commodities[id].name,
      emoji: content.commodities[id].emoji,
      unit: content.commodities[id].unit,
      price: state.commodities[id].price,
      priceHistory: [...state.commodities[id].priceHistory],
    };
    // Public comme la news qui l'a causé (et comme le coût du moment des filiales, déjà visible de tous).
    const factor = siteCostFactor(state, id);
    if (factor !== 1) cv.siteCostFactor = factor;
    return cv;
  });
  // Emplacements de filiale : qui les exploite est public (§5.5 bis) ; les mises restent secrètes.
  const operators = slotOperators(state);
  const siteSlots: SiteSlotView[] = (state.siteSlots ?? []).map((sl) => {
    const companyId = operators.get(sl.id);
    return companyId ? { ...sl, companyId } : { ...sl };
  });
  const view: PlayerView = {
    you: playerId,
    // La graine est masquée : avec elle, un client pourrait rejouer le RNG et lire l'avenir.
    config: { ...state.config, seed: 0, ...(state.config.terrains ? { terrains: { ...state.config.terrains } } : {}) },
    turn: state.turn,
    dateLabel: dateLabel(state.turn, state.config.startYear, langOf(state)),
    phase: state.phase,
    players,
    companies,
    siteSlots,
    ...(isSpatialMap(state.config) ? {
      hexes: { occupied: occupiedHexes(state), free: [...freeCells],
        populationShare: parcelPopulationShares(state.config),
        reserve: Object.fromEntries(boardBuildable(state.config).map((id) => [id, hexReservePrice(id)])),
        ...(usesIndustryNetwork(state) && playerId ? { landReserve: Object.fromEntries(boardBuildable(state.config).map(id => [id, bareLandReserve(state, playerId, id)])) } : {}),
        results: clone(state.hexAuctionResults ?? []),
      },
      terrains: boardTerrains(state.config, content.lang).map((t) => {
        const active = activeTerrain(state, t.id);
        return { id: t.id, hex: t.hex, name: t.name, strengthLabel: t.strengthLabel, counterLabel: t.counterLabel,
          blurb: t.blurb, companyId: active?.company.id ?? state.terrainAssignments?.[t.id]?.companyId ?? null, active: !!active,
          runningEffects: active ? runningTerrainEffects(state, t, active.company) : { headquarters: false, factory: false } };
      }),
    } : {}),
    sectors: SECTOR_IDS.map((id) => sectorView(state, id, viewerId, estimateCells, botCandidates[0], opts.hexEstimates !== 'candidates')),
    commodities,
    interestRate: effectiveBaseRate(state),
    taxRate: effectiveTaxRate(state),
    ...(transportFactor(state) !== 1 ? { transportFactor: transportFactor(state) } : {}),
    marketSentiment: state.macro.marketSentiment,
    personalLoanLimit: me && viewerId !== null ? personalLoanLimit(state, me) : 0,
    journal: clone(opts.journal === 'last' ? state.journal.slice(-1) : state.journal),
  };
  if (me && viewerId !== null) {
    view.self = {
      startupSubsidy: Math.max(STARTUP_SUBSIDY, me.comebackGrant ?? 0),
      whistleblownThisTurn: me.lastWhistleblowTurn === state.turn,
      rumorCheckPrice: rumorCheckPrice(state, me),
      ...(me.closeRecap ? { closeRecap: closeRecapView(state, playerId, me.closeRecap) } : {}),
    };
    // Les réponses des sources ne regardent que celui qui a payé.
    if (me.rumorChecks && me.rumorChecks.length > 0) view.self.rumorChecks = me.rumorChecks.map((r) => ({ ...r }));
    // Tractations (§7 bis) : chacun ne voit que ses offres, les contrats de ses entreprises et ses ententes.
    const offers = (state.offers ?? []).filter((o) => o.fromId === playerId || o.toId === playerId);
    if (offers.length > 0) view.self.offers = clone(offers);
    // Enchères de filiales (§5.5 bis) : chacun ne voit que les siennes, jamais celles des autres ni des bots.
    const siteBids = (state.siteBids ?? []).filter((b) => b.playerId === playerId);
    if (siteBids.length > 0) view.self.siteBids = clone(siteBids);
    const hexBids = (state.hexBids ?? []).filter((b) => b.playerId === playerId);
    if (isSpatialMap(state.config)) view.self.hexBids = clone(hexBids);
    const runs = (id: string) => getOwn(state.companies, id)?.controllerId === playerId;
    const contracts = (state.contracts ?? []).filter((k) => runs(k.sellerCompanyId) || runs(k.buyerCompanyId));
    if (contracts.length > 0) view.self.contracts = clone(contracts);
    const cartels = (state.cartels ?? [])
      .map((k) => ({ k, members: cartelMembers(state, k) }))
      .filter(({ members }) => members.length >= 2 && members.some((c) => c.controllerId === playerId))
      .map(({ k, members }) => ({
        ...clone(k),
        members: members.map((c) => {
          const leaving = k.members.find((m) => m.companyId === c.id)?.leaving === true;
          return { companyId: c.id, controllerId: c.controllerId as string, ...(leaving ? { leaving } : {}) };
        }),
        risk: cartelRisk(members.length, cartelQuarters(members)),
      }));
    if (cartels.length > 0) view.self.cartels = cartels;
    const soldOut = Object.values(state.companies)
      .filter((c) => c.status === 'active' && (c.turnFlags?.exControllers ?? []).includes(playerId))
      .map((c) => c.id);
    if (soldOut.length > 0) view.self.soldControlThisTurn = soldOut;
  }
  if (state.results) view.results = clone(state.results);
  return view;
}
