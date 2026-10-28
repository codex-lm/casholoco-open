import type { TrophyId } from '../../types';

/** English end-of-game trophies (emojis come from ../fr/trophies.ts). */
export const EN_TROPHIES: Record<TrophyId, { title: string; description: string }> = {
  magnat: {
    title: 'The Tycoon',
    description: 'Biggest fortune at the end of the game. Money can’t buy happiness, but it does buy first place.',
  },
  pollueur: {
    title: 'The Great Polluter',
    description: 'Most oil burned in production. The polar bears have embroidered a banner with your name on it.',
  },
  machiavel: {
    title: 'Machiavelli of the Quarter',
    description: 'Most shady moves. The ends justified the means, and there were a lot of means.',
  },
  parachute: {
    title: 'The Golden Parachute',
    description: 'Biggest total of golden parachutes received. Fired with honors, and more importantly with a check.',
  },
  visionnaire: {
    title: 'The Visionary',
    description: 'Most R&D spending. Invented the future, then forgot to sell it.',
  },
  marketeux: {
    title: 'Monarch of Hype',
    description: 'Most marketing spending. The product was so-so, but what a billboard!',
  },
  predateur: {
    title: 'The Shark',
    description: 'Most successful takeovers. Never says “hello,” only “how much?”',
  },
  proie: {
    title: 'The Sitting Duck',
    description: 'Most takeovers suffered. Always the last to know who the boss is.',
  },
  casserole: {
    title: 'The Walking Scandal',
    description: 'Most scandals. Newsrooms keep a file with your name on it. Actually, a whole cabinet.',
  },
  fisc: {
    title: 'Patron of the Treasury',
    description: 'Most fines paid. The Treasury is considering naming a wing of the building after you.',
  },
  naufrage: {
    title: 'The Shipwreck',
    description: 'Biggest loss of personal fortune in a single quarter. The band played on until the very end.',
  },
  rentier: {
    title: 'The Coupon Clipper',
    description: 'Most dividends received. Worked really hard… at opening the mail.',
  },
  serial: {
    title: 'Serial Entrepreneur',
    description: 'Most startups founded. One idea per quarter, one grant per idea.',
  },
  bonus: {
    title: 'The Well-Deserved Bonus',
    description: 'Most CEO bonuses cashed. Always the first to congratulate management, meaning themselves.',
  },
};
