// Généré une seule fois depuis docs/terrains-recits.md (octobre 2026).
// Ce fichier est désormais la source de vérité ; données, textes et types sont maintenus ici.
import type { NewsCard, TerrainDef } from '../../types';
export interface TerrainArticle { id: string; headline: string; body: string }
export interface SettlementArticle extends TerrainArticle { terrain: string }
export interface Commissariat { id: string; name: string; acronym: string; motto: string; blurb: string }
export interface TerrainContent {
  commissariat: Commissariat;
  definitions: TerrainDef[];
  editorial: TerrainArticle;
  newsCards: NewsCard[];
  settlements: SettlementArticle[];
  auctions: TerrainArticle[];
}

export const TERRAINS: TerrainDef[] = [
  {
    "id": "quai-port-dividende",
    "name": "Quai de Port-Dividende",
    "strengthLabel": "Bourse au quai",
    "counterLabel": null,
    "blurb": "40 % de la population sur place. Du port à l’usine : gratuit ; les livraisons restent payantes. La Bourse et ses agences de pub sont au portail : marketing x1,5.",
    "allocation": {
      "headline": "{company} décroche le quai le plus convoité de Port-Dividende",
      "body": "Le CAT offre à {company} le quai vedette de la capitale : 40 % des clients sur place. Du port à l’usine : gratuit ; livraison payante. La Bourse et ses agences de pub sont au portail : marketing x1,5. {ceo} commande le champagne."
    },
    "hex": "A10",
    "effects": [
      {
        "lever": "marketing",
        "mult": 1.5
      }
    ]
  },
  {
    "id": "faubourgs-croissance",
    "name": "Faubourgs de Croissance-la-Grande",
    "strengthLabel": "Campus voisin",
    "counterLabel": "Loin du port",
    "blurb": "La R&D tourne x2 sous le ronron des drones du campus de la Vallée des Licornes, mais le port est à l’autre bout de la carte.",
    "allocation": {
      "headline": "{company} s’installe à deux pas de la Vallée des Licornes",
      "body": "Le CAT a relégué {company} dans les faubourgs de Croissance-la-Grande, sous le ronron des drones du campus : la R&D tourne à x2. Le port, lui, est à l’autre bout de la carte ; {ceo} parle déjà « d’écosystème »."
    },
    "hex": "H5",
    "effects": [
      {
        "lever": "rnd",
        "mult": 2
      }
    ]
  },
  {
    "id": "front-de-mer-saint-benefice",
    "name": "Front de mer de Saint-Bénéfice",
    "strengthLabel": "École de commerce",
    "counterLabel": "Station saisonnière",
    "blurb": "Le marketing fait des vagues (x1,8) grâce à la grande école, mais la station vit au rythme des saisons.",
    "allocation": {
      "headline": "{company} plante son usine face à la mer à Saint-Bénéfice",
      "body": "Le CAT a offert à {company} un terrain face à la Baie des Bonus, en face de l’école de commerce : le marketing y fait x1,8 de bruit. La station vit au rythme des saisons ; {ceo} promet des réunions pieds nus."
    },
    "hex": "E16",
    "effects": [
      {
        "lever": "marketing",
        "mult": 1.8
      }
    ]
  },
  {
    "id": "portes-petit-rabais",
    "name": "Portes de Petit-Rabais",
    "strengthLabel": "Exonération 8 trimestres",
    "counterLabel": "Bout du monde",
    "blurb": "Main-d’œuvre à −20 % pendant 8 trimestres, à condition d’accepter que votre adresse officielle finisse par « le bout ».",
    "allocation": {
      "headline": "{company} exilée aux Portes de Petit-Rabais",
      "body": "Le CAT, qui indemnise généreusement ceux qu’il envoie au bout du monde, accorde à {company} une exonération de charges : main-d’œuvre −20 % pendant 8 trimestres. En échange, Petit-Rabais est petit, loin, et le GPS de {ceo} a rendu l’âme quelque part sur la départementale."
    },
    "hex": "C3",
    "effects": [
      {
        "lever": "labor",
        "mult": 0.8,
        "turns": 8
      }
    ]
  },
  {
    "id": "ristourne-le-bourg",
    "name": "Ristourne-le-Bourg",
    "strengthLabel": "Bassin d’emploi",
    "counterLabel": "Chaîne du froid",
    "blurb": "Main-d’œuvre −10 % et péremption divisée par deux : le bassin d’emploi est plein, les yaourts immortels, la banque locale ravie.",
    "allocation": {
      "headline": "{company} décroche le pactole de Ristourne-le-Bourg",
      "body": "Le CAT a gâté {company} : bassin d’emploi rural (main-d’œuvre −10 %) et chaîne du froid publique qui divise la périssabilité par deux. À Ristourne-le-Bourg, même les yaourts prennent leur retraite. La banque locale, elle, se réjouit : on ne lui demande plus de prêter à perte."
    },
    "hex": "K11",
    "effects": [
      {
        "lever": "labor",
        "mult": 0.9
      },
      {
        "lever": "perishability",
        "mult": 0.5
      }
    ]
  },
  {
    "id": "plaine-aux-subventions",
    "name": "Plaine-aux-Subventions",
    "strengthLabel": "Salaires subventionnés",
    "counterLabel": "Personne sur place",
    "blurb": "Salaires à −20 %, mais pas un client sur place : même le nom du village a été obtenu sur subvention.",
    "allocation": {
      "headline": "{company} élue domicile à la Plaine-aux-Subventions",
      "body": "Fidèle à son cadastre, le CAT installe {company} à la Plaine-aux-Subventions : l’État paie une part des salaires (main-d’œuvre −20 %). Seul hic : personne n’habite la plaine, donc personne n’y achète. {ceo} envisage déjà de demander une subvention pour attirer des clients."
    },
    "hex": "D17",
    "effects": [
      {
        "lever": "labor",
        "mult": 0.8
      }
    ]
  },
  {
    "id": "monts-defiscalises",
    "name": "Monts-Défiscalisés",
    "strengthLabel": "Impôt à 5 %",
    "counterLabel": "Routes de montagne",
    "blurb": "Impôt de l’entreprise à 5 %, main-d’œuvre −10 % pour l’usine de départ ; routes de montagne : ici, l’oxygène est rare et les camions aussi.",
    "allocation": {
      "headline": "{company} grimpe dans les Monts-Défiscalisés",
      "body": "Le CAT a expédié {company} dans les Monts-Défiscalisés : impôt à 5 % pour l’entreprise, main-d’œuvre −10 % pour l’usine de départ. Routes de montagne et freins de camion à espérance de vie limitée : {ceo} s’achète un baudet."
    },
    "hex": "K8",
    "effects": [
      {
        "lever": "tax",
        "rate": 0.05
      },
      {
        "lever": "labor",
        "mult": 0.9
      }
    ]
  },
  {
    "id": "ile-aux-niches",
    "name": "Île-aux-Niches",
    "strengthLabel": "Paradis fiscal",
    "counterLabel": "Sous surveillance",
    "blurb": "Aucun impôt, des prix « duty free » qui font vendre, une usine revendue à 80 % ; hausses de scandale une fois et demie plus fortes : le paradis, mais avec des caméras.",
    "allocation": {
      "headline": "{company} jette l’ancre sur l’Île-aux-Niches",
      "body": "{company} reçoit une adresse au large du Golfe des Dividendes : zéro impôt, prix perçus 4 % plus bas (étiquette « duty free »), usine revendue à 80 % de sa valeur. L’Office Supranational de l’Audit applaudit d’une seule main : hausses de scandale +50 %. {ceo} a posé des rideaux."
    },
    "hex": "A15",
    "effects": [
      {
        "lever": "tax",
        "rate": 0
      },
      {
        "lever": "scandal",
        "mult": 1.5
      },
      {
        "lever": "perceivedPrice",
        "mult": 0.96
      },
      {
        "lever": "salvage",
        "rate": 0.8
      }
    ]
  }
];

export const TERRAIN_CONTENT: TerrainContent = {
  commissariat: {
  "id": "commissariat",
  "name": "Commissariat à l’Aménagement du Territoire",
  "acronym": "CAT",
  "motto": "Égalité des territoires, gravité des chances.",
  "blurb": "Le CAT attribue les parcelles de départ aux entreprises et compense généreusement celles qu’il envoie au bout du monde : pas un k€, juste des effets sous conditions et beaucoup de reconnaissance."
},
  definitions: TERRAINS,
  editorial: {
  "id": "ouverture-n1",
  "headline": "Le CAT attribue ses huit parcelles : compensation en effets, pas en espèces",
  "body": "Huit parcelles de départ : le CAT dévoile son plan d’attribution aux entreprises fondatrices. Pas un k€ de compensation : des effets sous conditions, pour l’usine de départ ou son entreprise. « Nous compensons généreusement », assure le Commissariat."
},
  newsCards: [
  {
    "id": "loc-quai-port-dividende-1",
    "tone": "bad",
    "headline": "Grève au port : les clients de l’usine de {company} restent bloqués dans le Golfe des Dividendes",
    "body": "Piquets de grève aux portes du port : pendant deux trimestres, les clients renoncent à venir jusqu’à l’usine de départ de {company}. Sa demande fond de 20 % ; les grues font de très belles silhouettes.",
    "rumor": "Les dockers de Port-Dividende prépareraient un préavis « avec de belles pancartes et un calendrier ambitieux ».",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "quai-port-dividende",
        "lever": "demand",
        "multiplier": 0.8,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-quai-port-dividende-2",
    "tone": "bad",
    "headline": "Fusion d’agences à Port-Dividende : la pub de l’usine de départ passe à la trappe",
    "body": "Les trois agences du quai ont fusionné « pour la synergie » et licencié leurs créatifs par plateaux entiers. Pendant trois trimestres, le marketing de l’usine de départ de {company} perd 25 % d’efficacité ; le logo provisoire est un rectangle bleu.",
    "rumor": "Le nouveau logo de l’agence fusionnée serait « en cours de réflexion » depuis le printemps.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "quai-port-dividende",
        "lever": "marketing",
        "multiplier": 0.75,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-quai-port-dividende-3",
    "tone": "good",
    "headline": "Saison des croisières : des paquebots de clients accostent au pied de l’usine de départ",
    "body": "Les croisiéristes envahissent la capitale avec un appétit de retraité en soldes. Pendant deux trimestres, la demande de l’usine de départ de {company} grimpe de 10 % ; sa boutique n’a jamais vu autant de casquettes.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "quai-port-dividende",
        "lever": "demand",
        "multiplier": 1.1,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-faubourgs-croissance-1",
    "tone": "bad",
    "headline": "Grève à la Vallée des Licornes : les chercheurs de {company} gardent leurs idées",
    "body": "Le campus voisin est en grève et, par solidarité ou par habitude, le bureau d’études de l’usine de départ de {company} tourne au ralenti. Sa recherche perd 30 % d’efficacité pendant trois trimestres ; les tableaux blancs restent blancs.",
    "rumor": "Des syndicats de chercheurs de la Vallée des Licornes commanderaient des banderoles « en latex naturel ».",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "faubourgs-croissance",
        "lever": "rnd",
        "multiplier": 0.7,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-faubourgs-croissance-2",
    "tone": "good",
    "headline": "Promotion record à la Vallée des Licornes : les ingénieurs pleuvent sur les faubourgs",
    "body": "Des centaines de jeunes diplômés cherchent un premier emploi à vélo-distance du campus. Pendant trois trimestres, l’usine de départ de {company} recrute à prix doux : sa main-d’œuvre coûte 10 % de moins, vélo non compris.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "faubourgs-croissance",
        "lever": "labor",
        "multiplier": 0.9,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-faubourgs-croissance-3",
    "tone": "bad",
    "headline": "Bulle immobilière aux faubourgs : {company} voit ses loyers faire de la traction",
    "body": "Chaque mètre carré proche du campus se dispute à coups de levées de fonds. Pendant trois trimestres, les charges fixes de l’usine de départ de {company} grimpent de 20 % ; les propriétaires parlent déjà « d’écosystème ».",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "faubourgs-croissance",
        "lever": "fixedCost",
        "multiplier": 1.2,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-front-de-mer-saint-benefice-1",
    "tone": "bad",
    "headline": "Saint-Bénéfice : l’école de commerce perd ses professeurs, débauchés par un campus concurrent",
    "body": "Les stars du marketing ont signé ailleurs, « pour la qualité de vie », disent-elles en regardant la mer s’éloigner. Pendant deux trimestres, les campagnes de l’usine de départ de {company} perdent 25 % d’efficacité.",
    "rumor": "Des professeurs de Saint-Bénéfice auraient été vus dans une agence de voyage, « en groupe ».",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "front-de-mer-saint-benefice",
        "lever": "marketing",
        "multiplier": 0.75,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-front-de-mer-saint-benefice-2",
    "tone": "good",
    "headline": "Été record à Saint-Bénéfice : les touristes achètent tout, y compris la production locale",
    "body": "La station est pleine comme une valise de départ en vacances. Pendant deux trimestres, la demande de l’usine de départ de {company} grimpe de 15 % ; ses produits se vendent avec un parfum de monoï.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "front-de-mer-saint-benefice",
        "lever": "demand",
        "multiplier": 1.15,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-front-de-mer-saint-benefice-3",
    "tone": "bad",
    "headline": "Festival du scooter des mers d’affaires : les loyers du front de mer prennent le soleil et 15 %",
    "body": "Trois mille cadres en combinaison néoprène débarquent pour « networkinguer » sur l’eau. Pendant deux trimestres, les charges fixes de l’usine de départ de {company} augmentent de 15 %, même si {ceo} déteste les scooters des mers.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "front-de-mer-saint-benefice",
        "lever": "fixedCost",
        "multiplier": 1.15,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-portes-petit-rabais-1",
    "tone": "bad",
    "headline": "Contrôle fiscal à Petit-Rabais : l’exonération de charges suspendue avant l’heure",
    "body": "Un contrôleur du CAT a fait le trajet jusqu’au bout du monde et compte bien le rentabiliser. Pendant deux trimestres, l’exonération de 20 % sur la main-d’œuvre de l’usine de départ de {company} est suspendue.",
    "rumor": "Un contrôleur du CAT aurait demandé un plan de Petit-Rabais à la gare la plus proche, « c’est-à-dire à trois heures ».",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "portes-petit-rabais",
        "lever": "labor",
        "suspend": true,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-portes-petit-rabais-2",
    "tone": "good",
    "headline": "Un reportage télé sacre Petit-Rabais « village le plus authentique du bout du monde »",
    "body": "Depuis le reportage, les curieux font le voyage pour voir « comment c’était avant ». Pendant trois trimestres, la demande de l’usine de départ de {company} grimpe de 15 %, portée par le tourisme de la nostalgie.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "portes-petit-rabais",
        "lever": "demand",
        "multiplier": 1.15,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-portes-petit-rabais-3",
    "tone": "good",
    "headline": "Prime d’éloignement du CAT : les candidats débarquent à Petit-Rabais par cars entiers",
    "body": "Le CAT paie les candidats pour venir travailler « là où même le GPS hésite ». Pendant quatre trimestres, la main-d’œuvre de l’usine de départ de {company} coûte 12 % de moins.",
    "rumor": "Le CAT préparerait une prime « pour ceux qui acceptent de rester plus d’un hiver ».",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "portes-petit-rabais",
        "lever": "labor",
        "multiplier": 0.88,
        "duration": 4
      }
    ]
  },
  {
    "id": "loc-ristourne-le-bourg-1",
    "tone": "bad",
    "headline": "Exode rural : le bassin d’emploi de Ristourne-le-Bourg se vide à vue d’œil",
    "body": "Le dernier car de la vallée supprimé, la grande usine voisine débauche la main-d’œuvre du bourg. Pour l’usine de départ de {company}, employer coûte 20 % plus cher pendant trois trimestres.",
    "rumor": "Les cars de la métropole attendraient les ouvriers du bourg directement à la sortie de messe.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "ristourne-le-bourg",
        "lever": "labor",
        "multiplier": 1.2,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-ristourne-le-bourg-2",
    "tone": "good",
    "headline": "Les frigos de Ristourne-le-Bourg passent au froid nouvelle génération",
    "body": "La coopérative du froid remplace les compresseurs « qui toussaient ». À l’usine de départ de {company}, le stock vieillit plus lentement que les promesses : la péremption baisse de 20 % pendant trois trimestres.",
    "rumor": "Des camions frigorifiques flambant neufs auraient été aperçus sur la route de Ristourne-le-Bourg.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "ristourne-le-bourg",
        "lever": "perishability",
        "multiplier": 0.8,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-ristourne-le-bourg-3",
    "tone": "good",
    "headline": "Folie du yaourt fermier : l’Est a le vent en poche dans les rayons frais",
    "body": "Les influenceurs bien-être ne jurent plus que par « l’authenticité de Ristourne-le-Bourg ». La demande de l’usine de départ de {company} grimpe de 10 % pendant deux trimestres, au seau comme au rayon.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "ristourne-le-bourg",
        "lever": "demand",
        "multiplier": 1.1,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-plaine-aux-subventions-1",
    "tone": "bad",
    "headline": "Le CAT rabote les salaires subventionnés de la Plaine-aux-Subventions",
    "body": "Un « incident budgétaire » — le formulaire 47-B manquait — réduit l’aide sur les salaires de l’usine de départ de {company}. Employer coûte 15 % plus cher pendant trois trimestres, le temps de retrouver le formulaire.",
    "rumor": "Au guichet du CAT, on murmurerait qu’un formulaire « très important » se serait égaré dans la plaine.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "plaine-aux-subventions",
        "lever": "labor",
        "multiplier": 1.15,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-plaine-aux-subventions-2",
    "tone": "good",
    "headline": "La télé nationale tourne dans la Plaine-aux-Subventions : les clients arrivent par cars",
    "body": "Un magazine de consommation a consacré vingt minutes à « l’usine perdue au milieu de nulle part » de {company}. Résultat : les cars de curieux se pressent et la demande de son usine de départ grimpe de 20 % pendant trois trimestres.",
    "rumor": "La production de l’émission chercherait déjà des figurants « au regard de plaine ».",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "plaine-aux-subventions",
        "lever": "demand",
        "multiplier": 1.2,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-plaine-aux-subventions-3",
    "tone": "neutral",
    "headline": "La Rente déborde : l’usine de {company} pompe en cadence",
    "body": "Personne n’est surpris : la plaine est plate, l’eau aussi. Location de pompes, sacs de sable et heures de serpillière : les frais fixes de l’usine de départ de {company} montent de 10 % pour deux trimestres.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "plaine-aux-subventions",
        "lever": "fixedCost",
        "multiplier": 1.1,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-monts-defiscalises-1",
    "tone": "bad",
    "headline": "Le BSVM gèle la zone franche des Monts-Défiscalisés : fini l’impôt à 5 %",
    "body": "Les inspecteurs du BSVM ont trouvé les Monts-Défiscalisés « suspectement peu taxés ». La zone franche est suspendue : toute l’entreprise {company}, nouveaux produits compris, perd son taux de faveur et paie l’impôt de droit commun pendant trois trimestres.",
    "rumor": "Des fonctionnaires en doudoune siglée BSVM auraient pris pension dans les Monts-Défiscalisés.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "monts-defiscalises",
        "lever": "tax",
        "suspend": true,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-monts-defiscalises-2",
    "tone": "bad",
    "headline": "Prime d’altitude dans les Monts-Défiscalisés : l’air rare se paye comptant",
    "body": "Les saisonniers bloqués par la neige ont obtenu une prime « pour services rendus au-dessus des nuages ». Employer dans l’usine de départ de {company} coûte 15 % plus cher pendant deux trimestres.",
    "rumor": "Les saisonniers des Monts-Défiscalisés prépareraient des revendications « à la hauteur ».",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "monts-defiscalises",
        "lever": "labor",
        "multiplier": 1.15,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-monts-defiscalises-3",
    "tone": "good",
    "headline": "Hiver exceptionnel : les skieurs dévalent jusqu’à l’usine de {company}",
    "body": "Record d’enneigement, record de ventes : les touristes achètent tout ce qui porte une étiquette « fabriqué en montagne ». La demande de l’usine de départ de {company} grimpe de 10 % pendant deux trimestres.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "monts-defiscalises",
        "lever": "demand",
        "multiplier": 1.1,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-ile-aux-niches-1",
    "tone": "bad",
    "headline": "BonusPapers : les montages de l’Île-aux-Niches étalés en une du monde entier",
    "body": "Un lanceur d’alerte a livré douze mille clés USB de fiduciaires. Contrôles renforcés : toute l’entreprise {company}, nouveaux produits compris, perd son taux de paradis fiscal et paie l’impôt de droit commun pendant trois trimestres.",
    "rumor": "Un stagiaire de fiduciaire aurait été vu copiant « beaucoup, beaucoup » de fichiers sur l’Île-aux-Niches.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "ile-aux-niches",
        "lever": "tax",
        "suspend": true,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-ile-aux-niches-2",
    "tone": "bad",
    "headline": "Les régulateurs campent sur l’Île-aux-Niches : chaque facture devient un document sensible",
    "body": "Depuis les BonusPapers, les contrôleurs ont loué des transats avec vue sur les fiduciaires. Sous les projecteurs, la moindre facétie se voit : les hausses de scandale de toute l’entreprise {company} sont amplifiées de 30 % pendant trois trimestres.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "ile-aux-niches",
        "lever": "scandal",
        "multiplier": 1.3,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-ile-aux-niches-3",
    "tone": "good",
    "headline": "Bureaux vides à louer : les coquilles sous-louent à l’usine de {company}",
    "body": "Les sièges de sociétés écrans, désertés depuis les fuites, se sous-louent à vil prix. L’usine de départ de {company} hérite de chaises ergonomiques et de frais fixes en baisse de 10 % pour trois trimestres.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "terrain",
        "terrain": "ile-aux-niches",
        "lever": "fixedCost",
        "multiplier": 0.9,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-chaleur-1",
    "tone": "good",
    "headline": "Hiver polaire : la chaleur des serveurs de {company} se vend à prix d’or",
    "body": "Le thermomètre a rendu l’âme. Les villes chauffées aux serveurs de {company} paient le double : pendant deux trimestres, le crédit chaleur de son usine est multiplié par 2. {ceo} prie pour que l’hiver dure.",
    "rumor": "Les météorologues annonceraient « un hiver à ne pas mettre un algorithme dehors ».",
    "category": "local",
    "weight": 1,
    "quarters": [
      4,
      1
    ],
    "effects": [
      {
        "type": "heat",
        "scope": "all",
        "lever": "heat",
        "multiplier": 2,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-chaleur-2",
    "tone": "bad",
    "headline": "Canicule : la ville renvoie la chaleur de {company} à l’expéditeur",
    "body": "Quarante degrés à l’ombre des antennes. Plus personne ne veut du chauffage urbain : pendant deux trimestres, le crédit chaleur de l’usine de {company} tombe à zéro, et les serveurs tournent fenêtres ouvertes.",
    "rumor": "Le ministère de la Transition préparerait un plan « un ventilateur pour tous ».",
    "category": "local",
    "weight": 1,
    "quarters": [
      3
    ],
    "effects": [
      {
        "type": "heat",
        "scope": "all",
        "lever": "heat",
        "multiplier": 0,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-chaleur-3",
    "tone": "bad",
    "headline": "La mairie s’offre une pompe à chaleur géante : les serveurs de {company} refroidissent",
    "body": "Après trois ans de travaux et un dépassement de budget qualifié d’« historique », le réseau municipal se passe à moitié des serveurs : pendant trois trimestres, le crédit chaleur de l’usine de {company} est divisé par deux.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "heat",
        "scope": "all",
        "lever": "heat",
        "multiplier": 0.5,
        "duration": 3
      }
    ]
  },
  {
    "id": "loc-chaleur-4",
    "tone": "good",
    "headline": "Label « Chaleur verte » : les clients de {company} minent la conscience tranquille",
    "body": "Le réseau de chaleur a reçu un label. Les publicités montrent des retraités souriants devant un radiateur, et les ventes suivent : pendant deux trimestres, la demande de l’usine de {company} grimpe de 10 %.",
    "category": "local",
    "weight": 1,
    "effects": [
      {
        "type": "heat",
        "scope": "all",
        "lever": "demand",
        "multiplier": 1.1,
        "duration": 2
      }
    ]
  },
  {
    "id": "loc-chaleur-5",
    "tone": "good",
    "headline": "Saison record aux Monts-Défiscalisés : la station commande moitié plus de chaleur à {company}",
    "body": "Pistes pleines, chalets gelés, skieurs exigeants. La station rachète toute la chaleur disponible : pendant deux trimestres, le crédit chaleur de l’usine de {company} aux Monts est multiplié par 1,5.",
    "rumor": "La station aurait commandé des canons à neige « au cas où l’hiver oublierait ».",
    "category": "local",
    "weight": 1,
    "quarters": [
      4,
      1
    ],
    "effects": [
      {
        "type": "heat",
        "scope": "mountain",
        "lever": "heat",
        "multiplier": 1.5,
        "duration": 2
      }
    ]
  }
],
  settlements: [
  {
    "id": "settle-quai-port-dividende-1",
    "terrain": "quai-port-dividende",
    "headline": "{company} ouvre au Quai de Port-Dividende : le {product} prend le port d’assaut",
    "body": "Quarante pour cent des clients à portée de grue. Du port à l’usine : gratuit ; les livraisons restent payantes. Les agences de pub sont au portail : marketing x1,5. La Bourse applaudit."
  },
  {
    "id": "settle-quai-port-dividende-2",
    "terrain": "quai-port-dividende",
    "headline": "{company} lance {product} : l’agence de pub applaudit des deux grues",
    "body": "L’agence du quai réserve son marketing x1,5 à l’usine de départ. Le {product} n’hérite d’aucun effet du terrain : la Bourse applaudit, mais la campagne n’est pas comprise."
  },
  {
    "id": "settle-faubourgs-croissance-1",
    "terrain": "faubourgs-croissance",
    "headline": "{company} ouvre aux Faubourgs de Croissance-la-Grande : {product} sous les drones",
    "body": "Le campus de la Vallée des Licornes est à deux pas de l’usine de départ : sa R&D tourne x2. Le port, lui, est au bout du monde ; le CAT appelle ça un écosystème."
  },
  {
    "id": "settle-faubourgs-croissance-2",
    "terrain": "faubourgs-croissance",
    "headline": "{company} dévoile {product} : les licornes bêlent d’envie",
    "body": "Le campus ne travaille que pour l’usine de départ : sa R&D reste x2. Le {product} ne reçoit aucun effet du terrain. Les licornes appellent ça « une exclusion disruptive »."
  },
  {
    "id": "settle-front-de-mer-saint-benefice-1",
    "terrain": "front-de-mer-saint-benefice",
    "headline": "{company} ouvre face à la mer : le {product} aura vue sur la Baie des Bonus",
    "body": "L’école de commerce de Saint-Bénéfice accompagne l’usine de départ : marketing x1,8. La vue sur la Baie des Bonus n’est pas facturée ; le parasol, si : il faut l’apporter."
  },
  {
    "id": "settle-front-de-mer-saint-benefice-2",
    "terrain": "front-de-mer-saint-benefice",
    "headline": "{company} lance {product} : l’école de commerce vend surtout ses conditions",
    "body": "Les diplômés réservent le marketing x1,8 à l’usine de départ. Le {product} n’hérite d’aucun effet du terrain. Entre deux bains de soleil, l’école a pitché une clause d’exclusion ; la facture ne sent même plus l’iode."
  },
  {
    "id": "settle-portes-petit-rabais-1",
    "terrain": "portes-petit-rabais",
    "headline": "{company} ouvre aux Portes de Petit-Rabais : le {product} ira très, très loin",
    "body": "L’usine de départ obtient l’exonération de charges : main-d’œuvre −20 % pendant les 8 premiers trimestres, merci le CAT. En échange, le village est au bout du monde et la carte des clients s’arrête juste avant."
  },
  {
    "id": "settle-portes-petit-rabais-2",
    "terrain": "portes-petit-rabais",
    "headline": "{company} lance {product} : le CAT ne fait pas de tarif famille",
    "body": "L’exonération de charges (−20 % sur les 8 premiers trimestres) reste à l’usine de départ. Le {product} n’hérite d’aucun effet du terrain. Le facteur a demandé une prime de risque pour livrer le formulaire de refus."
  },
  {
    "id": "settle-ristourne-le-bourg-1",
    "terrain": "ristourne-le-bourg",
    "headline": "{company} ouvre à Ristourne-le-Bourg : {product}, bras à −10 %, yaourt éternel",
    "body": "Le bassin rural offre à l’usine de départ la main-d’œuvre à −10 %, et la chaîne du froid divise la péremption par deux. Le {product} de {company} vieillira deux fois moins vite que les élus locaux."
  },
  {
    "id": "settle-ristourne-le-bourg-2",
    "terrain": "ristourne-le-bourg",
    "headline": "{company} lance {product} : les concurrents soupçonnent un complot lacté",
    "body": "Main-d’œuvre −10 % et péremption divisée par deux restent réservées à l’usine de départ. Le {product} n’hérite d’aucun effet du terrain. Le conseil municipal refuse de partager l’immortalité."
  },
  {
    "id": "settle-plaine-aux-subventions-1",
    "terrain": "plaine-aux-subventions",
    "headline": "{company} ouvre dans la Plaine-aux-Subventions : {product}, salaires −20 %, zéro client",
    "body": "Le CAT subventionne 20 % de la masse salariale de l’usine de départ. {company} n’a plus qu’à produire le {product}, puis à trouver des clients ailleurs : la plaine est vide."
  },
  {
    "id": "settle-plaine-aux-subventions-2",
    "terrain": "plaine-aux-subventions",
    "headline": "{company} lance {product} : même la subvention n’a pas de petits",
    "body": "Le CAT garde les salaires à −20 % pour l’usine de départ. Le {product} ne reçoit aucun effet du terrain. {company} a demandé une subvention pour remplir sa demande de subvention ; le formulaire est encore à l’étude."
  },
  {
    "id": "settle-monts-defiscalises-1",
    "terrain": "monts-defiscalises",
    "headline": "{company} ouvre dans les Monts-Défiscalisés : {product}, impôt 5 %, vertiges inclus",
    "body": "L’usine de départ paie sa main-d’œuvre 10 % de moins ; chaque livraison est une randonnée. L’entreprise est imposée à 5 % tant que cette usine reste active sur sa case, sans fusion. Le CAT recommande le baudet."
  },
  {
    "id": "settle-monts-defiscalises-2",
    "terrain": "monts-defiscalises",
    "headline": "{company} lance {product} : le fisc voyage léger, la main-d’œuvre reste sur place",
    "body": "Le {product} relève de l’impôt à 5 % de {company}, tant que l’usine de départ reste active sur sa case, sans fusion. La main-d’œuvre −10 % reste à cette usine ; la nouvelle n’hérite ni du rabais ni de ses pneus neige."
  },
  {
    "id": "settle-ile-aux-niches-1",
    "terrain": "ile-aux-niches",
    "headline": "{company} ouvre à l’Île-aux-Niches : {product}, zéro impôt, caméras comprises",
    "body": "Zéro impôt, prix perçus 4 % plus bas, revente à 80 % et hausses de scandale x1,5 pour {company}, tant que l’usine de départ reste active sur sa case, sans fusion. Le fisc du Golfe surveille : la jauge grimpe plus vite que le marégraphe."
  },
  {
    "id": "settle-ile-aux-niches-2",
    "terrain": "ile-aux-niches",
    "headline": "{company} lance {product} : un produit, zéro problème, presque",
    "body": "Le {product} relève du zéro impôt, des prix perçus 4 % plus bas, de la revente à 80 % et des hausses de scandale x1,5 de {company}, tant que l’usine de départ reste active sur sa case, sans fusion. Le service presse a déjà un bateau."
  }
],
  auctions: [
  {
    "id": "auction-hex-1",
    "headline": "Bagarre pour {hex} : {bidders} enchérisseurs, le marteau de vente demande un arrêt maladie",
    "body": "{company} remporte {hex} pour {price} à l’issue d’un duel d’enchères à {bidders}. Le CAT salue « un beau moment de marché » ; le trésorier salue depuis l’infirmerie."
  },
  {
    "id": "auction-hex-2",
    "headline": "Enchères : {company} attend le silence, rafle {hex} au premier coup de marteau",
    "body": "Personne d’autre ne s’est présenté au guichet : {company} repart avec l’hexagone {hex} au prix de réserve, {price}. Le commissaire-priseur n’a pas eu le temps de servir le thé."
  },
  {
    "id": "auction-hex-3",
    "headline": "{price} pour {hex} : un prix à faire pleurer le cadastre",
    "body": "{company} a emporté {hex} pour {price}, montant jugé « franchement décoratif » par les experts du CAT. Le Commissariat précise que l’hexagone ne comprend ni plage, ni gisement, ni excuse."
  },
  {
    "id": "auction-hex-4",
    "headline": "Battu sur {hex}, un repoussé réclame le recomptage des enveloppes scellées",
    "body": "{company} gagne {hex} pour {price}. Le perdant, arrivé second, dénonce « des enveloppes trop bien scellées » et porte réclamation. Le CAT lui a offert un plan du terrain et ses condoléances."
  },
  {
    "id": "auction-hex-5",
    "headline": "{hex} adjugé pour {price} : le marteau a vérifié deux fois les zéros",
    "body": "Pour {price}, {company} repart avec l’hexagone {hex} et un soupçon de malaise général. Le Commissariat assure que l’enchère était « tout à fait régulière, merci de ne pas insister »."
  },
  {
    "id": "auction-hex-6",
    "headline": "{company} rafle {hex} après la disparition mystérieuse du favori de la vente",
    "body": "Favori de la vente, un enchérisseur anonyme n’a jamais déposé son enveloppe. {company} emporte {hex} pour {price}. Le CAT parle de hasard ; tout le monde hoche la tête."
  }
],
};
