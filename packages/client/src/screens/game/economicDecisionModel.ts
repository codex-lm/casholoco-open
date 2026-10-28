import { BLOCK_PRICE_BAND, MAX_COMPANY_RATE, type CompanyView } from '@muchomoney/core';

export type ShareBlockIssue = 'quantity' | 'counterparty' | 'price' | 'holdings' | 'cash' | 'founder';

/** Only validate facts in this player's view. Hidden locks and later changes remain the server's responsibility. */
export function shareBlockPreview(company: CompanyView, playerId: string, counterpartyId: string | undefined,
  side: 'buy' | 'sell', shares: number, price: number, personalCash: number) {
  const sellerId = side === 'sell' ? playerId : counterpartyId;
  const held = sellerId ? company.holdings[sellerId] ?? 0 : 0;
  const flags = company.private?.turnFlags;
  const founded = flags?.justFounded === true && company.founderId === sellerId;
  const locked = sellerId ? Math.max(0, flags?.lockedShares?.[sellerId] ?? 0) : 0;
  const available = founded ? 0 : Math.max(0, held - locked);
  const total = shares * price;
  const minimum = company.sharePrice * (1 - BLOCK_PRICE_BAND);
  const maximum = company.sharePrice * (1 + BLOCK_PRICE_BAND);
  let issue: ShareBlockIssue | null = null;
  if (!counterpartyId) issue = 'counterparty';
  else if (!Number.isInteger(shares) || shares <= 0) issue = 'quantity';
  else if (!Number.isFinite(price) || price < minimum - 1e-9 || price > maximum + 1e-9) issue = 'price';
  else if (founded) issue = 'founder';
  else if (shares > available + 1e-6) issue = 'holdings';
  else if (side === 'buy' && total > personalCash + 1e-6) issue = 'cash';
  return { issue, available, total, minimum, maximum, personalAfter: personalCash + (side === 'buy' ? -total : total) };
}

/** UI estimate of §5.7 from the public book value; parity is tested against the authoritative loan action. */
export function companyLoanPreview(company: CompanyView, baseRate: number, amount: number) {
  const bookValue = company.valuation?.bookValue;
  if (bookValue === undefined || !Number.isFinite(bookValue) || !Number.isFinite(amount) || amount < 0) return null;
  const rateFor = (debt: number) => Math.min(MAX_COMPANY_RATE, Math.max(0, baseRate * (1 + 0.5 * Math.max(debt, 0) / Math.max(bookValue, 1000))));
  const debtAfter = Math.max(0, company.debt + amount);
  const rate = rateFor(debtAfter);
  const interest = debtAfter * rate;
  const currentInterest = Math.max(company.debt, 0) * rateFor(company.debt);
  return { rate, interest, extraInterest: interest - currentInterest };
}
