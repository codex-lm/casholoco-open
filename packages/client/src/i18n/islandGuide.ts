import type { Lang } from '@muchomoney/core';

const fr = {
  basics: '🏝️ **Île 3D** : des parcelles carrées, une usine fixe par parcelle. Glisse un profil depuis la palette pour préparer une construction, puis vérifie son coût et confirme. Clique sur une usine pour la gérer ou l’agrandir.',
  manual: 'Déplace la caméra en glissant sur le décor et rapproche la vue avec la molette ou les boutons + et −. « Voir toute l’île » donne la vue d’ensemble ; « Centrer la sélection » revient au quartier choisi. Les quatre parcelles qui partagent un côté sont voisines. Le quadrillage peut être masqué. Dépose un profil d’usine sur un terrain disponible, ou une filiale sur un gisement compatible : le formulaire présente l’opération avant toute commande. Une usine construite reste fixe. Une extension s’affiche en chantier jusqu’à sa livraison au trimestre suivant. Les piétons et véhicules d’ambiance sont décoratifs ; les flux sélectionnés montrent des approvisionnements possibles ou les ventes du trimestre clos. Le bouton « Figer la scène » arrête les animations.',
};
const en: typeof fr = {
  basics: '🏝️ **3D island**: square parcels, one fixed factory per parcel. Drag a profile from the palette to prepare a build, then review its cost and confirm. Select a factory to manage or expand it.',
  manual: 'Drag the scenery to pan and use the wheel or + and − buttons to zoom. “Show the whole island” gives an overview; “Focus selection” returns to the selected district. The four parcels sharing an edge are neighbors. You can hide the grid. Drop a factory profile onto available land, or a subsidiary onto a matching deposit: the form shows the transaction before you place an order. Built factories remain fixed. An ordered extension appears as construction until delivery next quarter. Background pedestrians and vehicles are decorative; selected flows show possible supply routes or last quarter’s sales. “Freeze scene” pauses animations.',
};

export const islandGuideMessages = (lang: Lang): typeof fr => lang === 'en' ? en : fr;
