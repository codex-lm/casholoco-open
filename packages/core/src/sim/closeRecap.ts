/** Frozen facts from the close, before next-quarter news and bot market actions. No RNG or simulation changes. */
import type { CloseFortuneSnapshot, CloseRecap, CloseRecapCompany, CloseRecapFact, CloseRecapFortune, CloseRecapSettlements, GameState, PlayerState } from '../types';
import { currentIssue } from './journal';
import type { TurnLog } from './turn';
import { getOwn } from './util';

export function fortuneSnapshot(state: GameState, player: PlayerState): CloseFortuneSnapshot {
  const positions = Object.values(state.companies).flatMap((company) => {
    const shares = getOwn(company.holdings, player.id) ?? 0;
    return company.status === 'active' && shares > 0
      ? [{ companyId: company.id, shares, sharePrice: company.sharePrice }] : [];
  });
  return { positions, dividendsReceived: player.stats.dividendsReceived, bonusesTaken: player.stats.bonusesTaken,
    cash: player.cash, debt: player.debt,
    netWorth: player.cash + positions.reduce((sum, p) => sum + p.shares * p.sharePrice, 0) - player.debt };
}

/** Redact frozen private company details again whenever control changes after the close. */
export function closeRecapView(state: GameState, playerId: string, recap: CloseRecap): CloseRecap {
  const result = structuredClone(recap);
  result.facts = result.facts.filter((fact) => fact.type !== 'stock'
    || state.companies[fact.companyId]?.controllerId === playerId);
  for (const company of result.companies ?? []) {
    if (state.companies[company.companyId]?.controllerId === playerId) continue;
    if (company.report) company.report.products = [];
    delete company.scandalBefore;
    delete company.scandalAfter;
    for (const fine of company.fineCauses) {
      delete fine.scandalBefore;
      delete fine.scandalAfter;
      delete fine.shadyActions;
    }
  }
  return result;
}

export function closeRecap(state: GameState, player: PlayerState, log: TurnLog): CloseRecap {
  const facts: CloseRecapFact[] = [];
  const companies = Object.values(state.companies);
  for (const id of log.bankruptcies) {
    const company = state.companies[id];
    if (company && log.leaders[id] === player.id) facts.push({ type: 'bankruptcy', companyId: id, companyName: company.name });
  }
  // Immediate OPA flashes belong to the closing quarter, unlike its results (published in the next issue).
  const issue = currentIssue(state);
  for (const article of issue?.articles ?? []) {
    const event = article.event;
    if (event?.type !== 'takeover' || (event.actorId !== player.id && event.subjectId !== player.id)) continue;
    for (const id of article.companyIds ?? []) {
      const company = state.companies[id];
      if (company) facts.push({ type: 'takeover', companyId: id, companyName: company.name,
        direction: event.actorId === player.id ? 'won' : 'lost', journalTurn: issue!.turn });
    }
  }
  // The report's leader was captured before margin calls can pass control to somebody else.
  const reported = companies.flatMap((company) => {
    if (log.leaders[company.id] !== player.id) return [];
    const report = company.reports.find((r) => r.turn === log.resolvedTurn);
    return report ? [{ company, report }] : [];
  });
  for (const { company, report } of reported) {
    if (report.fines > 0) facts.push({ type: 'fines', companyId: company.id, companyName: company.name, amount: report.fines });
  }
  // Put the largest company result first without claiming it caused the change in personal fortune.
  for (const { company, report } of [...reported].sort((a, b) => Math.abs(b.report.netProfit) - Math.abs(a.report.netProfit))) {
    facts.push({ type: 'netProfit', companyId: company.id, companyName: company.name, amount: report.netProfit });
  }
  // A merger moves products, ids unchanged, into the absorbing company while the absorbed one keeps its
  // reports: past sales are searched in every company's reports, not only in the current owner's.
  const soldBefore = (productId: string) => companies.some((c) => c.reports.some((r) => r.turn < log.resolvedTurn
    && r.products.some((p) => p.productId === productId && p.sold > 0)));
  for (const { company, report } of reported) {
    for (const product of report.products) {
      // firstSalesTurn is only an eligibility date; verify actual sales and all previous reports instead.
      if (product.sold > 0 && !soldBefore(product.productId)) {
        facts.push({ type: 'firstSales', companyId: company.id, companyName: company.name,
          productId: product.productId, productName: product.name, lots: product.sold });
      }
    }
  }
  // Stock is private: only for a company the player still controls once this close is over (a margin call
  // or a takeover can hand it to somebody else after the report).
  for (const { company } of reported) {
    if (company.controllerId !== player.id) continue;
    for (const product of company.products) {
      if (product.stock > 0) facts.push({ type: 'stock', companyId: company.id, companyName: company.name,
        productId: product.id, productName: product.name, lots: product.stock });
    }
  }
  const history = player.netWorthHistory;
  const netWorth = history[history.length - 1];
  const previousNetWorth = history.length > 1 ? history[history.length - 2] : undefined;
  const previous = player.closeRecap;
  const baseline = previous?.fortuneSnapshot;
  // Missing metadata means a restored quarter may have been observed only in part: never invent its flows.
  const complete = baseline && previous?.turn === log.resolvedTurn - 1 && previous?.netWorth === previousNetWorth
    && player.quarterPersonalCosts !== undefined;
  const initial = !previous && log.resolvedTurn === 1 && history.length === 1
    && player.quarterPersonalCosts !== undefined ? player.openingFortuneSnapshot : undefined;
  let breakdown: CloseRecap['breakdown'];
  if (complete && previousNetWorth !== undefined) {
    const sharePrices = baseline.positions.reduce((sum, position) => {
      const company = getOwn(state.companies, position.companyId);
      // Bankrupt/absorbed shares no longer have a portfolio value; merger conversions go in the remainder.
      const price = company?.status === 'active' ? company.sharePrice : 0;
      return sum + position.shares * (price - position.sharePrice);
    }, 0);
    const dividendsAndBonuses = (player.stats.dividendsReceived - baseline.dividendsReceived)
      + (player.stats.bonusesTaken - baseline.bonusesTaken);
    const personalCosts = player.quarterPersonalCosts! > 0 ? -player.quarterPersonalCosts! : 0;
    const attributed = sharePrices + dividendsAndBonuses + personalCosts;
    breakdown = { sharePrices, dividendsAndBonuses, personalCosts,
      otherMovements: (netWorth - previousNetWorth) - attributed };
  }
  const current = fortuneSnapshot(state, player);
  const displayBaseline = complete ? baseline : initial;
  const beforeNetWorth = previousNetWorth ?? initial?.netWorth;
  const closing = new Map(current.positions.map((p) => [p.companyId, p]));
  const opening = new Map((displayBaseline?.positions ?? []).map((p) => [p.companyId, p]));
  const bought = new Map<string, number>(), sold = new Map<string, number>();
  for (const p of state.shareBuys ?? []) if (p.turn === log.resolvedTurn && p.playerId === player.id) {
    bought.set(p.companyId, (bought.get(p.companyId) ?? 0) + p.shares);
  }
  for (const p of [...(state.shareSales ?? []), ...(log.forcedShareSales ?? [])]) if (p.turn === log.resolvedTurn && p.playerId === player.id) {
    sold.set(p.companyId, (sold.get(p.companyId) ?? 0) + p.shares);
  }
  const fortune: CloseRecapFortune = {
    cashAfter: player.cash, portfolioAfter: current.positions.reduce((sum, p) => sum + p.shares * p.sharePrice, 0),
    debtAfter: player.debt,
    ...(beforeNetWorth !== undefined ? { netWorthBefore: beforeNetWorth } : {}),
    ...(displayBaseline ? {
      ...(displayBaseline.cash !== undefined ? { cashBefore: displayBaseline.cash } : {}),
      ...(displayBaseline.debt !== undefined ? { debtBefore: displayBaseline.debt } : {}),
      portfolioBefore: displayBaseline.positions.reduce((sum, p) => sum + p.shares * p.sharePrice, 0),
      dividends: player.stats.dividendsReceived - displayBaseline.dividendsReceived,
      bonuses: player.stats.bonusesTaken - displayBaseline.bonusesTaken,
    } : {}),
    ...(player.quarterPersonalCosts !== undefined && player.quarterPersonalCostDetails
      ? player.quarterPersonalCostDetails : {}),
    holdings: [...new Set([...opening.keys(), ...closing.keys(), ...bought.keys(), ...sold.keys()])].map((companyId) => {
      const company = state.companies[companyId];
      const after = closing.get(companyId), before = opening.get(companyId);
      return { companyId, companyName: company?.name ?? companyId,
        ...(displayBaseline ? { sharesBefore: before?.shares ?? 0, priceBefore: before?.sharePrice ?? company?.priceHistory.at(-2) ?? 0 } : {}),
        sharesAfter: after?.shares ?? 0, priceAfter: company?.status === 'active' ? company.sharePrice : 0,
        bought: bought.get(companyId) ?? 0, sold: sold.get(companyId) ?? 0 };
    }),
    ...(breakdown ? { breakdown } : {}),
  };
  if (initial && beforeNetWorth !== undefined) {
    const sharePrices = initial.positions.reduce((sum, position) => {
      const company = getOwn(state.companies, position.companyId);
      return sum + position.shares * ((company?.status === 'active' ? company.sharePrice : 0) - position.sharePrice);
    }, 0);
    const dividendsAndBonuses = (fortune.dividends ?? 0) + (fortune.bonuses ?? 0);
    const personalCosts = (player.quarterPersonalCosts ?? 0) > 0 ? -player.quarterPersonalCosts! : 0;
    fortune.breakdown = { sharePrices, dividendsAndBonuses, personalCosts,
      otherMovements: (netWorth - beforeNetWorth) - (sharePrices + dividendsAndBonuses + personalCosts) };
  }
  const companyDetails: CloseRecapCompany[] = companies.filter((company) => log.leaders[company.id] === player.id).map((company) => {
    const before = log.closeBefore?.[company.id];
    const report = company.reports.find((r) => r.turn === log.resolvedTurn);
    const mine = company.controllerId === player.id;
    const details: CloseRecapCompany = { companyId: company.id, companyName: company.name, status: company.status,
      ...(report ? { report: structuredClone(report) } : {}),
      fineCauses: structuredClone(log.fineCauses?.[company.id] ?? []),
      ...(before ? { reputationBefore: before.reputation } : {}), reputationAfter: company.reputation,
      priceBefore: before?.sharePrice ?? company.priceHistory.at(-2) ?? company.sharePrice,
      priceAfter: company.status === 'active' ? company.sharePrice : 0,
      ...(mine ? { ...(before ? { scandalBefore: before.scandal } : {}), scandalAfter: company.scandal } : {}) };
    if (!mine) {
      if (details.report) details.report.products = [];
      for (const fine of details.fineCauses) {
        delete fine.scandalBefore; delete fine.scandalAfter; delete fine.shadyActions;
      }
    }
    return details;
  });
  const eventTypes = new Set(['takeover', 'stakeBuilding', 'poisonPill', 'controlHandover', 'autopilot', 'merger']);
  const settlements: CloseRecapSettlements = {
    offers: (log.offers ?? []).filter((o) => o.fromId === player.id || o.toId === player.id).map((o) => ({ ...o,
      status: o.status === 'pending' ? 'expired' as const : o.status })),
    contracts: (log.contracts ?? []).filter((k) => k.playerIds.includes(player.id)).map(({ contract: k, delivered }) => {
      const contract = { ...k,
        outcome: !delivered ? 'ended' as const : (k.lastDelivered ?? 0) >= k.lots ? 'delivered' as const
          : (k.lastDelivered ?? 0) > 0 ? 'partial' as const : 'failed' as const };
      if (!delivered) { delete contract.lastDelivered; delete contract.lastPenalty; }
      return contract;
    }),
    events: (issue?.articles ?? []).flatMap((article) => {
      const event = article.event;
      if (!event || !eventTypes.has(event.type) || (event.actorId !== player.id && event.subjectId !== player.id
        && !(article.companyIds ?? []).some((id) => log.leaders[id] === player.id))) return [];
      const companyIds = article.companyIds ?? [];
      return [{ event: { ...event }, companyIds: [...companyIds], companyNames: companyIds.map((id) => state.companies[id]?.name ?? id),
        journalTurn: issue!.turn }];
    }),
  };
  return {
    turn: log.resolvedTurn,
    netWorth,
    ...(previousNetWorth !== undefined ? { previousNetWorth } : {}),
    facts: facts.slice(0, 3),
    ...(breakdown ? { breakdown } : {}),
    fortuneSnapshot: current,
    fortune,
    companies: companyDetails,
    settlements,
  };
}
