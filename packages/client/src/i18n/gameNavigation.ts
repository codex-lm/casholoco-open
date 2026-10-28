import type { Lang } from '@muchomoney/core';

const fr = {
  primary: 'Rubriques du jeu',
  companyViews: 'Vues de mon entreprise',
  management: 'Gestion',
  workshop: 'Atelier',
  managementHint: 'Produits, trésorerie et décisions de l’entreprise',
  workshopHint: 'Usines, clients et chantiers en images',
};
const en: typeof fr = {
  primary: 'Game sections',
  companyViews: 'Company views',
  management: 'Management',
  workshop: 'Workshop',
  managementHint: 'Products, company cash and decisions',
  workshopHint: 'Factories, customers and construction at a glance',
};
export const gameNavigationMessages = (lang: Lang) => lang === 'en' ? en : fr;
