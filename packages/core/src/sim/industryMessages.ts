import type { Lang } from '../types';
const fr = {
  unavailable: 'Ces règles foncières ne sont pas actives dans ce salon.',
  fixedFactory: 'Une usine reste sur sa parcelle. Construisez une autre usine pour fabriquer ce produit ailleurs.',
  landOwned: 'Cette parcelle appartient déjà à votre compagnie.',
  landNotOwned: 'Cette parcelle ne vous appartient pas.',
  occupied: 'Fermez d’abord l’usine avant de vendre ce terrain.',
  reserve: (amount: string) => `Minimum pour ce terrain sans construction : ${amount}.`,
  capacity: (lots: number) => `Cette usine est limitée à ${lots} lots, extensions en commande comprises. Construisez un autre site pour produire davantage.`,
  landBid: (place: string) => `Mise déposée sur ${place}, sans construction. Une seule mise foncière par joueur et par trimestre ; une nouvelle mise remplace la précédente.`,
  sold: (place: string, amount: string) => `Terrain de ${place} vendu pour ${amount}.`,
  factory: (name: string, place: string) => `Nouvelle usine de ${name} en chantier à ${place}. Prix, qualité, notoriété et budgets restent communs au produit.`,
  newProductFactory: (name: string, place: string) => `Usine du nouveau produit ${name} en chantier à ${place}.`,
  factoryBid: (name: string, place: string) => `Construction d’une usine de ${name} proposée à ${place}. La parcelle est attribuée aux enchères à la clôture.`,
};
const en: typeof fr = {
  unavailable: 'These land rules are not enabled in this room.',
  fixedFactory: 'A factory stays on its parcel. Build another factory to manufacture this product elsewhere.',
  landOwned: 'Your company already owns this parcel.',
  landNotOwned: 'Your company does not own this parcel.',
  occupied: 'Close the factory before selling this land.',
  reserve: amount => `Minimum for this land without construction: ${amount}.`,
  capacity: lots => `This factory is limited to ${lots} lots, including ordered extensions. Build another site to produce more.`,
  landBid: place => `Land bid submitted for ${place}, without construction. One land bid per player per quarter; a new bid replaces the previous one.`,
  sold: (place, amount) => `Land at ${place} sold for ${amount}.`,
  factory: (name, place) => `A new ${name} factory is under construction at ${place}. Price, quality, brand and budgets remain shared by the product.`,
  newProductFactory: (name, place) => `A factory for the new product ${name} is under construction at ${place}.`,
  factoryBid: (name, place) => `A new ${name} factory proposed at ${place}. Land is awarded by auction at quarter close.`,
};
export const industryMessages = (lang: Lang) => lang === 'en' ? en : fr;
