import type { Lang } from '@muchomoney/core';

const fr = {
  productCount: 'Produits / limite',
  factoryCount: 'Usines',
  freeProducts: (count: number) => `Nouveaux produits possibles : ${count}`,
  reservedProducts: (count: number) => `${count} lancement${count > 1 ? 's' : ''} en attente compris dans la limite.`,
  networkIntro: 'Chaque scène représente une usine. Un même produit commercial peut être fabriqué sur plusieurs sites.',
  networkBuild: 'Développer le réseau',
  networkCost: (min: string, max: string) => `Construction : de ${min} à ${max} selon le secteur, hors terrain.`,
  networkTiming: 'Sur un terrain déjà détenu, la construction est payée immédiatement. Sur une case libre, terrain et construction sont attribués et payés à la clôture. L’usine ouvre au trimestre suivant.',
  boardTiming: (min: string, max: string) => `Nouveau produit : de ${min} à ${max} selon le secteur, plus le terrain. L’attribution et le paiement ont lieu à la clôture ; l’usine ouvre au trimestre suivant.`,
  networkFull: 'La limite de produits est atteinte. Vous pouvez encore construire d’autres usines pour vos produits existants.',
  productsFull: (canMerge: boolean) => `La limite de produits est atteinte.${canMerge ? ' Une fusion-absorption permet deux produits supplémentaires.' : ''}`,
  alertsTitle: 'Alertes de vos entreprises',
  allAlerts: (count: number) => `Voir les ${count} alertes`,
  noAlerts: 'Les alertes ont été résolues.',
  alertCompany: 'Vérifier la clôture',
  alertScandal: 'Voir les actions discutables',
  alertStock: 'Voir en Bourse',
  companyLink: (name: string) => `Gérer ${name} dans Entreprise`,
  stockLink: (name: string) => `Voir ${name} en Bourse`,
  backToRecap: 'Retour au bilan',
};

const en: typeof fr = {
  productCount: 'Products / limit',
  factoryCount: 'Factories',
  freeProducts: count => `New products available: ${count}`,
  reservedProducts: count => `Includes ${count} pending product launch${count > 1 ? 'es' : ''}.`,
  networkIntro: 'Each scene represents one factory. The same commercial product can be made at several sites.',
  networkBuild: 'Grow the factory network',
  networkCost: (min, max) => `Construction: ${min} to ${max} depending on the sector, excluding land.`,
  networkTiming: 'On land you already own, construction is paid immediately. On an available cell, land and construction are awarded and paid at the close. The factory opens next quarter.',
  boardTiming: (min, max) => `New product: ${min} to ${max} depending on the sector, plus land. The award and payment happen at the close; the factory opens next quarter.`,
  networkFull: 'The product limit is reached. You can still build more factories for your existing products.',
  productsFull: canMerge => `The product limit is reached.${canMerge ? ' An absorption merger allows two more products.' : ''}`,
  alertsTitle: 'Your company alerts',
  allAlerts: count => `View all ${count} alerts`,
  noAlerts: 'The alerts have been resolved.',
  alertCompany: 'Check the quarter close',
  alertScandal: 'View dubious actions',
  alertStock: 'View in Stocks',
  companyLink: name => `Manage ${name} in Company`,
  stockLink: name => `View ${name} in Stocks`,
  backToRecap: 'Back to the quarter recap',
};

export const navigationDetailsMessages = (lang: Lang) => lang === 'en' ? en : fr;
