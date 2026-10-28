import type { hexIntegrationFr } from './hexIntegration-fr';

export const hexIntegrationEn: typeof hexIntegrationFr = {
  location: (cell: string, basin: string) => `${cell} · ${basin} basin`,
  incubator: 'at the capital’s incubator',
  bidsTitle: 'My bids',
  bidsEmpty: 'No board bids this quarter.',
  bidKind: { move: 'Factory move', launch: 'Product launch', startup: 'Leaving the incubator', land: 'Land only', factory: 'New factory' },
  bidState: { pending: 'Awaiting the close', won: 'Won', lost: 'Lost', fallback: 'Fallback', abandoned: 'Abandoned', failed: 'Failed' },
  bidLostControl: 'Fails at the close (you no longer control the company)',
  incubatorStays: 'Still in the incubator',
  bidAmount: 'Bid',
  bidPrice: 'Price paid',
  bidBidders: (n: number) => `${n} bidder${n === 1 ? '' : 's'}`,
  bidCell: (cell: string) => cell,
  bidObtained: (cell: string) => `Cell obtained: ${cell}`,
  bidFallback: { nearest: 'nearest free cell', abandon: 'abandon, free of charge' },
  bidFallbackLabel: 'If the cell is lost',
  bidCancel: 'Withdraw bid',
  bidCommitment: 'Pending commitment (bids and fees)',
  bidSecret: 'Your bids stay secret until the close. The price paid and bidder count then become public.',
};
