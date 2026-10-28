import type { CommodityDef, CommodityId, SectorDef, SectorId } from '../types';

/**
 * Tempéraments et calibrage : GAME_DESIGN §13, campagne reproductible 11-personnalites.md.
 * Élasticité produit = choix entre marques ; élasticité de marché = réponse du volume total au prix moyen.
 * Fidélité, publicité et obsolescence restent distinctes : l'équilibrage ne ramène pas les secteurs
 * à une formule commune. Les champs facultatifs absents gardent les valeurs historiques.
 */
export const SECTORS: Record<SectorId, SectorDef> = {
  energy_drinks: {
    id: 'energy_drinks',
    name: 'Boissons énergisantes',
    emoji: '⚡',
    description: 'Du sucre, de la caféine et un logo agressif. La jeunesse en redemande, tant que la pub suit : la mode passe vite.',
    // Fret absolu (oct. 2026) : round(85 + livraison standard hex capitale 4.164433368951229) = 89 k.
    // Livraison = 0.0045 × poids 3 × Σ salesMixByHex × route(capitalHexId, ville) ; classique identique.
    refPrice: 89,
    refDemand: 250,
    elasticity: 3.5,
    marketElasticity: 0.8,
    marketingMultiplier: 1.5,
    brandPersistence: 0.55,
    laborCost: 30,
    inputs: { sugar: 0.5, oil: 0.1 },
    launchCost: 2000,
    capacityCost: 40,
    fixedCost: 200,
    volatility: 0.08,
    growth: 0.01,
    perishability: 0.2,
    localBonus: 0.2, // la boisson du coin
    freightWeight: 3, // canettes lourdes, distributeurs
    outsideAttractiveness: 1.5,
    startingCapacity: 70,
  },
  gadgets: {
    id: 'gadgets',
    name: 'Gadgets connectés',
    emoji: '📱',
    description: 'Des objets inutiles qui ont besoin du wifi et d’une mise à jour par semaine. Le moins cher gagne, et le modèle de l’an dernier ne vaut plus rien.',
    // Fret absolu (oct. 2026) : round(305 + livraison standard hex capitale 0.7890258619449443) = 306 k.
    // Livraison = 0.0045 × poids 0.6 × Σ salesMixByHex × route(capitalHexId, ville) ; classique identique.
    refPrice: 306,
    refDemand: 105,
    elasticity: 6.5,
    marketElasticity: 1.2,
    rndMultiplier: 1.5,
    qualityDecay: 0.93,
    qualityExponent: 3.5,
    outsideQualityGrowth: 0.08,
    laborCost: 70,
    inputs: { lithium: 0.4, chips: 1.2 },
    launchCost: 2500,
    capacityCost: 150,
    fixedCost: 150,
    volatility: 0.12,
    growth: 0.02,
    perishability: 0.1,
    localBonus: 0.05, // personne ne lit « fabriqué à… »
    freightWeight: 0.6, // part par la poste
    outsideAttractiveness: 1.5,
    startingCapacity: 30,
  },
  scooters: {
    id: 'scooters',
    name: 'Trottinettes électriques',
    emoji: '🛴',
    description: 'La mobilité douce, jusqu’au premier trottoir. Usines chères, demande régulière, lithium à volonté.',
    // Fret absolu (oct. 2026) : round(435 + livraison standard hex capitale 2.577692113358869) = 438 k.
    // Livraison = 0.0045 × poids 2 × Σ salesMixByHex × route(capitalHexId, ville) ; classique identique.
    refPrice: 438,
    refDemand: 55,
    elasticity: 4.5,
    marketElasticity: 1,
    laborCost: 95,
    inputs: { lithium: 1, chips: 0.5, oil: 0.2 },
    launchCost: 3000,
    capacityCost: 200,
    fixedCost: 300,
    volatility: 0.025,
    newsSensitivity: 0.3,
    growth: 0.015,
    perishability: 0.05,
    localBonus: 0.1, // fierté régionale, service après-vente
    freightWeight: 2, // encombrant
    outsideAttractiveness: 1.5,
    startingCapacity: 21,
  },
  yogurts: {
    id: 'yogurts',
    name: 'Yaourts « bio »',
    emoji: '🥛',
    description: 'Une vache heureuse sur l’emballage. Pour le reste, on ne sait pas. Des clients fidèles, qui ne regardent jamais le prix.',
    // Fret absolu (oct. 2026) : round(57 + livraison standard hex capitale 4.379272687812108) = 61 k.
    // Livraison = 0.0045 × poids 2.5 × Σ salesMixByHex × route(capitalHexId, ville) ; classique identique.
    refPrice: 61,
    refDemand: 235,
    elasticity: 2,
    marketElasticity: 0.6,
    qualityExponent: 1.1,
    brandBase: 0.5,
    brandPersistence: 0.9,
    startingBrand: 1,
    laborCost: 14,
    inputs: { sugar: 0.3, oil: 0.1 },
    launchCost: 1800,
    capacityCost: 15,
    fixedCost: 300,
    volatility: 0.04,
    growth: 0.005,
    perishability: 0.35,
    localBonus: 0.35, // le yaourt d'ici, forcément meilleur
    freightWeight: 2.5, // frais, camion frigorifique
    outsideAttractiveness: 1.5,
    startingCapacity: 40,
  },
  crypto: {
    id: 'crypto',
    name: 'Crypto & NFT',
    emoji: '🪙',
    description: 'La révolution financière décentralisée, centralisée chez vous. Plus ça monte, plus on en veut… jusqu’au krach.',
    refPrice: 260,
    refDemand: 75,
    elasticity: 1.5,
    marketElasticity: 1.5,
    laborCost: 20,
    inputs: { chips: 1, oil: 0.6 },
    launchCost: 2500,
    capacityCost: 60,
    fixedCost: 450,
    volatility: 0.28,
    growth: 0.02,
    perishability: 0.3,
    localBonus: 0, // numérique : vendu pareil partout
    freightWeight: 0, // numérique : rien à camionner
    outsideAttractiveness: 1.5,
    marketingMultiplier: 2,
    intangible: true,
    startingCapacity: 34,
  },
};

export const COMMODITIES: Record<CommodityId, CommodityDef> = {
  oil: {
    id: 'oil',
    name: 'Pétrole',
    emoji: '🛢️',
    unit: 'lot de barils',
    basePrice: 80,
    volatility: 0.08,
    meanReversion: 0.25,
    liquidity: 600,
    freightWeight: 1.5, // citernes
  },
  lithium: {
    id: 'lithium',
    name: 'Lithium',
    emoji: '🔋',
    unit: 'lot de tonnes',
    basePrice: 120,
    volatility: 0.12,
    meanReversion: 0.2,
    liquidity: 250,
    freightWeight: 1, // caisses de concentrate
  },
  sugar: {
    id: 'sugar',
    name: 'Sucre',
    emoji: '🍬',
    unit: 'lot de tonnes',
    basePrice: 40,
    volatility: 0.06,
    meanReversion: 0.3,
    liquidity: 900,
    freightWeight: 1.5, // sacs de tonnes
  },
  chips: {
    id: 'chips',
    name: 'Puces électroniques',
    emoji: '🔌',
    unit: 'lot de wafers',
    basePrice: 60,
    volatility: 0.1,
    meanReversion: 0.2,
    liquidity: 400,
    freightWeight: 0.2, // des wafers dans une enveloppe
  },
};
