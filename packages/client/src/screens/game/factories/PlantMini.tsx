/**
 * Miniature de la scène d'un de mes produits, pour la carte du produit suivi dans la colonne de gauche du plateau.
 * Toujours fixe (`still`, sans lire le réglage Figer/Animer de « Mes usines ») : rien ne bouge à côté du plateau. Variante
 * `mini` de la scène : ses textes illisibles à cette taille sont masqués, les chiffres sont écrits dans la carte.
 * Le CSS ne la montre que si la colonne et la fenêtre ont la place (voir plantMini.css).
 */
import type { CompanyView, ProductView } from '@muchomoney/core';
import { PlotScene } from './PlotScene';
import { useSceneProps } from './useSceneProps';
import './plantMini.css';

export function PlantMini({ company, product }: { company: CompanyView; product: ProductView }) {
  const scene = useSceneProps(company, product);
  return <div className="side-plant-scene"><PlotScene {...scene} still mini /></div>;
}
