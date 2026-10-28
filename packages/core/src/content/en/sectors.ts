import type { CommodityId, SectorId } from '../../types';

/** English names of the sectors and commodities (the numbers live in ../sectors.ts). */
export const EN_SECTORS: Record<SectorId, { name: string; description: string }> = {
  energy_drinks: {
    name: 'Energy Drinks',
    description: 'Sugar, caffeine and a very angry logo. Gen Z can’t get enough, as long as the ads keep coming: trends fade fast.',
  },
  gadgets: {
    name: 'Smart Gadgets',
    description: 'Pointless objects that need Wi-Fi, an app and a firmware update every Tuesday. The cheapest wins, and last year’s model is worth nothing.',
  },
  scooters: {
    name: 'E-Scooters',
    description: 'Sustainable urban mobility, right up until the first curb. Pricey plants, steady demand, lithium by the ton.',
  },
  yogurts: {
    name: '“Organic” Yogurts',
    description: 'A happy cow on the label. Everything else is on a need-to-know basis. Loyal customers who never check the price.',
  },
  crypto: {
    name: 'Crypto & NFTs',
    description: 'The decentralized financial revolution, conveniently centralized in your wallet. The higher it goes, the more people want it… until the crash.',
  },
};

export const EN_COMMODITIES: Record<CommodityId, { name: string; unit: string }> = {
  oil: { name: 'Oil', unit: 'lot of barrels' },
  lithium: { name: 'Lithium', unit: 'lot of tons' },
  sugar: { name: 'Sugar', unit: 'lot of tons' },
  chips: { name: 'Microchips', unit: 'lot of wafers' },
};
