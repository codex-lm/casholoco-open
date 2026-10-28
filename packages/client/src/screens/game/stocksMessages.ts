/** Libellés du parcours de la cote, dans la langue de l'interface. */
export const stocksMessages = {
  fr: {
    caption: 'Entreprises classées par capitalisation. Ouvrez une fiche pour consulter les détails et négocier des actions.',
    open: 'Voir la fiche',
    close: 'Fermer la fiche',
    myStake: 'Ma part',
    companyDetail: (name: string) => `Fiche de ${name}`,
  },
  en: {
    caption: 'Companies ranked by market capitalisation. Open a company to view its details and trade shares.',
    open: 'View company',
    close: 'Close details',
    myStake: 'My stake',
    companyDetail: (name: string) => `${name} details`,
  },
};
