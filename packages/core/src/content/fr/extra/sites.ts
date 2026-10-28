import type { FakeRumor, NewsCard } from '../../../types';

/**
 * Lot « sites » : la vie des puits, mines, raffineries et fonderies (ids préfixés par « st_ »). Chaque carte fait
 * varier le coût d'extraction des filiales d'une matière (effet « siteCost », GAME_DESIGN §5.5 bis), sans toucher au
 * cours : c'est l'exploitant qui trinque ou qui jubile, pas le marché. La plupart sont annoncées par une rumeur, pour
 * qui veut relancer une filiale endormie à temps. Textes anglais : ../../en/extra/sites.ts.
 * Ton du lot : dépêche d'agence impassible, comme le lot « commodities ».
 */
export const NEWS_SITES: NewsCard[] = [
  // -------------------------------------------------------------------------
  // Puits de pétrole
  // -------------------------------------------------------------------------
  {
    id: 'st_oil_drillers_helmets',
    category: 'commodities',
    headline: 'Grève des foreurs : ils exigent des casques « qui ne décoiffent pas »',
    body: 'Les puits tournent au ralenti depuis lundi. La direction propose des casques à visière, jugés « trop années 80 ». Extraire un baril coûte deux fois plus cher, le temps de trouver un coiffeur.',
    tone: 'bad',
    weight: 1.5,
    rumor: 'Les foreurs se plaindraient de leurs casques. Un préavis de grève aurait été déposé « au rayon coiffure ».',
    effects: [{ type: 'siteCost', commodityId: 'oil', multiplier: 2, duration: 2 }],
  },
  {
    id: 'st_oil_well_inspection',
    category: 'commodities',
    headline: 'Inspection des puits de pétrole : chaque boulon devra signer le registre',
    body: 'Le ministère a lancé une vérification exhaustive. Les boulons signent lentement, certains refusent. Extraire du brut coûte nettement plus cher pour trois trimestres.',
    tone: 'bad',
    weight: 1.5,
    rumor: 'Le ministère préparerait une « tournée des boulons » dans les puits de pétrole.',
    effects: [{ type: 'siteCost', commodityId: 'oil', multiplier: 1.8, duration: 3 }],
  },
  {
    id: 'st_oil_robot_drills',
    category: 'commodities',
    headline: 'Des robots foreurs travaillent la nuit sans demander d’heures supplémentaires',
    body: 'Ils ne réclament ni prime ni café. Les syndicats étudient la représentation des perceuses. Pomper un baril coûte près d’un tiers de moins.',
    tone: 'good',
    weight: 1.5,
    rumor: 'Des robots foreurs seraient testés « en toute discrétion » sur plusieurs puits de pétrole.',
    effects: [{ type: 'siteCost', commodityId: 'oil', multiplier: 0.7, duration: 3 }],
  },
  {
    id: 'st_oil_field_fog',
    category: 'commodities',
    headline: 'Brouillard sur les champs de pétrole : les foreurs ne retrouvent plus leurs puits',
    body: 'Des équipes errent entre les derricks, lampe torche à la main. Deux puits ont été retrouvés, un troisième est « en cours de localisation ». Extraire du brut coûte bien plus cher.',
    tone: 'bad',
    weight: 1.5,
    effects: [{ type: 'siteCost', commodityId: 'oil', multiplier: 1.7, duration: 2 }],
  },

  // -------------------------------------------------------------------------
  // Mines de lithium
  // -------------------------------------------------------------------------
  {
    id: 'st_lithium_bats',
    category: 'commodities',
    headline: 'Des chauves-souris protégées s’installent dans les mines de lithium',
    body: 'Les mineurs travaillent désormais sans bruit ni lumière, sur la pointe des pieds. Le rendement s’en ressent : extraire du lithium coûte plus du double.',
    tone: 'bad',
    weight: 1.5,
    rumor: 'Des colonies de chauves-souris auraient été repérées à l’entrée de plusieurs mines de lithium.',
    effects: [{ type: 'siteCost', commodityId: 'lithium', multiplier: 2.2, duration: 2 }],
  },
  {
    id: 'st_lithium_poetry_break',
    category: 'commodities',
    headline: 'Les mineurs de lithium obtiennent une pause poésie de vingt minutes par heure',
    body: 'L’accord a été signé en alexandrins. Les galeries résonnent de sonnets, les wagonnets attendent. Le coût d’extraction grimpe pour trois trimestres.',
    tone: 'bad',
    weight: 1.5,
    rumor: 'Un syndicat de mineurs de lithium préparerait ses revendications… en vers.',
    effects: [{ type: 'siteCost', commodityId: 'lithium', multiplier: 1.7, duration: 3 }],
  },
  {
    id: 'st_lithium_polite_dynamite',
    category: 'commodities',
    headline: 'Une dynamite « éco-responsable » creuse les galeries en s’excusant auprès de la roche',
    body: 'Plus rapide et moins chère, elle laisse un petit mot après chaque explosion. Extraire du lithium coûte près d’un tiers de moins.',
    tone: 'good',
    weight: 1.5,
    rumor: 'Un explosif « très poli » serait en cours d’homologation pour les mines de lithium.',
    effects: [{ type: 'siteCost', commodityId: 'lithium', multiplier: 0.7, duration: 3 }],
  },
  {
    id: 'st_lithium_lost_map',
    category: 'commodities',
    headline: 'Le plan des mines de lithium égaré : les mineurs creusent « au feeling »',
    body: 'L’unique exemplaire aurait servi à caler une table. Les équipes percent un peu partout, parfois chez le voisin. Extraire du lithium coûte beaucoup plus cher.',
    tone: 'bad',
    weight: 1.5,
    effects: [{ type: 'siteCost', commodityId: 'lithium', multiplier: 1.8, duration: 2 }],
  },

  // -------------------------------------------------------------------------
  // Raffineries de sucre
  // -------------------------------------------------------------------------
  {
    id: 'st_sugar_bees',
    category: 'commodities',
    headline: 'Des abeilles occupent les raffineries de sucre et réclament une part des bénéfices',
    body: 'Les négociations piétinent : les ouvrières refusent tout interlocuteur sans rayures. Raffiner coûte deux fois plus cher, le temps d’un accord.',
    tone: 'bad',
    weight: 1.5,
    rumor: 'Des essaims auraient été vus en repérage autour de plusieurs raffineries de sucre.',
    effects: [{ type: 'siteCost', commodityId: 'sugar', multiplier: 2, duration: 2 }],
  },
  {
    id: 'st_sugar_hairnets',
    category: 'commodities',
    headline: 'Nouvelle norme d’hygiène : trois charlottes superposées obligatoires dans les raffineries',
    body: 'Les ouvriers ne voient plus les machines, les machines ne voient plus les ouvriers. Le coût de raffinage grimpe pour trois trimestres.',
    tone: 'bad',
    weight: 1.5,
    rumor: 'Une norme sur les charlottes serait en préparation « par couches successives ».',
    effects: [{ type: 'siteCost', commodityId: 'sugar', multiplier: 1.7, duration: 3 }],
  },
  {
    id: 'st_sugar_free_steam',
    category: 'commodities',
    headline: 'L’État offre la vapeur aux raffineries de sucre, « pour que la ville sente le caramel »',
    body: 'La mesure vise l’attractivité touristique. Les riverains apprécient, les dentistes moins. Raffiner le sucre coûte nettement moins cher.',
    tone: 'good',
    weight: 1.5,
    rumor: 'Un plan « Ville caramel » serait à l’étude au ministère du Tourisme.',
    effects: [{ type: 'siteCost', commodityId: 'sugar', multiplier: 0.65, duration: 3 }],
  },
  {
    id: 'st_sugar_sticky_valves',
    category: 'commodities',
    headline: 'Les vannes des raffineries collent : le sucre a tout caramélisé pendant le week-end',
    body: 'Les techniciens tentent de décoller les installations au sèche-cheveux. Le coût de raffinage flambe, lui aussi.',
    tone: 'bad',
    weight: 1.5,
    effects: [{ type: 'siteCost', commodityId: 'sugar', multiplier: 1.7, duration: 2 }],
  },

  // -------------------------------------------------------------------------
  // Fonderies de puces
  // -------------------------------------------------------------------------
  {
    id: 'st_chips_allergic_inspector',
    category: 'commodities',
    headline: 'Audit des salles blanches : un inspecteur allergique à la poussière fait arrêter les fonderies',
    body: 'Chaque éternuement déclenche une nouvelle vérification. Les wafers attendent sous cloche. Fabriquer une puce coûte deux fois plus cher.',
    tone: 'bad',
    weight: 1.5,
    rumor: 'Un inspecteur « très sensible » aurait été nommé à la tête des audits de salles blanches.',
    effects: [{ type: 'siteCost', commodityId: 'chips', multiplier: 2, duration: 2 }],
  },
  {
    id: 'st_chips_exercise_bikes',
    category: 'commodities',
    headline: 'Coupure de courant : les fonderies de puces tournent au vélo d’appartement',
    body: 'Les ingénieurs pédalent en trois-huit. Les mollets progressent, la production beaucoup moins. Le coût de fabrication s’envole.',
    tone: 'bad',
    weight: 1.5,
    rumor: 'Le réseau électrique des zones industrielles donnerait des « signes de fatigue ».',
    effects: [{ type: 'siteCost', commodityId: 'chips', multiplier: 1.8, duration: 2 }],
  },
  {
    id: 'st_chips_window_ai',
    category: 'commodities',
    headline: 'Une IA optimise les fonderies de puces et découvre qu’il suffisait de fermer la fenêtre',
    body: 'Le rendement bondit, la poussière reste dehors. Le cabinet de conseil qui planchait sur le dossier depuis six ans demande un délai. Fabriquer une puce coûte près d’un tiers de moins.',
    tone: 'good',
    weight: 1.5,
    rumor: 'Une IA d’optimisation serait déployée « à titre expérimental » dans plusieurs fonderies de puces.',
    effects: [{ type: 'siteCost', commodityId: 'chips', multiplier: 0.7, duration: 3 }],
  },
  {
    id: 'st_chips_beige_cleanrooms',
    category: 'commodities',
    headline: 'Salles blanches repeintes en beige : les ingénieurs ne retrouvent plus les wafers',
    body: 'Tout est de la même couleur, puces comprises. Les équipes avancent à tâtons. Le coût de fabrication grimpe.',
    tone: 'bad',
    weight: 1.5,
    effects: [{ type: 'siteCost', commodityId: 'chips', multiplier: 1.7, duration: 2 }],
  },

  // -------------------------------------------------------------------------
  // Toutes matières
  // -------------------------------------------------------------------------
  {
    id: 'st_any_royalty_holiday',
    category: 'commodities',
    headline: '{commodity} : l’État oublie de facturer les redevances d’extraction',
    body: 'Le logiciel de facturation a été mis à jour un vendredi soir. Les exploitants se gardent bien de le signaler. Extraire coûte nettement moins cher, tant que ça dure.',
    tone: 'good',
    weight: 1.5,
    effects: [{ type: 'siteCost', commodityId: 'random', multiplier: 0.7, duration: 2 }],
  },
  {
    id: 'st_any_foremen_strike',
    category: 'commodities',
    headline: '{commodity} : grève des contremaîtres, plus personne ne sait sur quel bouton appuyer',
    body: 'Les équipes appuient au hasard en attendant la fin du mouvement. Une machine s’est mise à jouer de l’accordéon, une autre a commandé quarante pizzas. Le coût d’extraction s’envole.',
    tone: 'bad',
    weight: 1.5,
    rumor: 'Les contremaîtres menaceraient de « rendre leurs sifflets ».',
    effects: [{ type: 'siteCost', commodityId: 'random', multiplier: 1.8, duration: 2 }],
  },
];

/** Fausses rumeurs du lot : de quoi hésiter avant de relancer une filiale endormie. */
export const RUMORS_SITES: FakeRumor[] = [
  { id: 'st_fake_oil_low_derricks', text: 'Les foreurs réclameraient des derricks « plus bas, pour le vertige ». Un mouvement serait envisagé.' },
  { id: 'st_fake_lithium_ghost', text: 'Un fantôme hanterait les mines de lithium ; les mineurs refuseraient les équipes de nuit.' },
  { id: 'st_fake_sugar_diet', text: 'Les raffineries de sucre seraient mises au régime « par solidarité » avec leurs clients.' },
  { id: 'st_fake_chips_mood', text: 'Un audit interne reprocherait aux fonderies de puces un « manque d’enthousiasme ». Des sanctions seraient à l’étude.' },
];
