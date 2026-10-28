import type { SectorId } from '../../types';

/**
 * Rubriques burlesques du journal papier (horoscope des affaires, faits divers,
 * courrier des lecteurs, petites annonces, formules satiriques). Contenu purement
 * éditorial : le moteur ne lit jamais ce lot, aucun id n'est consommé par la
 * simulation. Placeholders autorisés : {city} {zone} {landmark} {sector} {product}
 * {commodity}, plus {company} et {amount} uniquement dans les lettres de bilan,
 * et {company} (facultatif) avec {product} (obligatoire) dans les réclames ;
 * les mentions légales des réclames n'ont aucun placeholder.
 * L'anglais (content/en/paper.ts) reprend les mêmes ids, textes adaptés.
 */

export type PaperLetterTrigger =
  | 'uneGood'
  | 'uneBad'
  | 'uneNeutral'
  | 'bigProfit'
  | 'bigLoss'
  | 'scandal'
  | 'bankruptcy'
  | 'any';

export type PaperFigureKind = 'fines' | 'bonuses' | 'dividends' | 'commodity' | 'sector' | 'tax' | 'gap' | 'turns';

export interface PaperEntry {
  id: string;
  text: string;
}
export interface PaperLetter extends PaperEntry {
  trigger: PaperLetterTrigger;
}
export interface PaperAd {
  id: string;
  head: string;
  text: string;
}
export interface PaperSign {
  id: string;
  name: string;
  texts: PaperEntry[];
}

export interface PaperContent {
  /** Generic product word(s) per sector, for the {product} placeholder (e.g. « un pot de yaourt », « une trottinette »). */
  sectorProducts: Record<SectorId, string[]>;
  /** Horoscope des affaires : the 12 signs, ≥ 6 texts each. */
  signs: PaperSign[];
  /** Faits divers : ≥ 60 absurd local news items. */
  oddNews: PaperEntry[];
  /** Courrier des lecteurs : ≥ 48 letters, ≥ 6 per trigger. */
  letters: PaperLetter[];
  /** ≥ 24 signatures (« Gérard, retraité, {city} »). */
  signatures: PaperEntry[];
  /** Petites annonces : ≥ 60 ads. */
  ads: PaperAd[];
  /** ≥ 5 satirical quips per figure kind. */
  figureQuips: Record<PaperFigureKind, string[]>;
  /** Réclame : encart publicitaire « acheté » par l'entreprise la plus dépensière en marketing. */
  reclame: {
    templates: Record<SectorId, PaperEntry[]>;
    legal: PaperEntry[];
  };
}

export const PAPER_FR: PaperContent = {
  sectorProducts: {
    energy_drinks: ['une boisson énergisante', 'une canette énergisante'],
    gadgets: ['un gadget connecté', 'un objet connecté'],
    scooters: ['une trottinette électrique', 'une trottinette'],
    yogurts: ['un pot de yaourt', 'un yaourt'],
    crypto: ['un jeton', 'un NFT'],
  },

  // ---------------------------------------------------------------------------
  // Horoscope des affaires (≤ 140 caractères par texte).
  // ---------------------------------------------------------------------------
  signs: [
    {
      id: 'aries',
      name: 'Bélier',
      texts: [
        { id: 'aries-1', text: 'Mars entre dans votre maison du bilan. Évitez les fusions avant midi, et les PDG après.' },
        { id: 'aries-2', text: 'Votre ascendant en cash-flow favorise les dividendes. Votre banquier, lui, est ascendant Scorpion.' },
        { id: 'aries-3', text: 'Jupiter sourit à vos marges. En revanche, il ignore délibérément vos charges sociales.' },
        { id: 'aries-4', text: 'Semaine propice aux rachats hostiles. L’hostilité, c’est surtout ce que vous y mettez.' },
        { id: 'aries-5', text: 'La Lune en Capricorne éclaire votre compte en banque. Dommage, il n’y a rien à voir.' },
        { id: 'aries-6', text: 'Mercure rétrograde : reportez la signature. Le contrat, lui, a déjà signé sans vous.' },
      ],
    },
    {
      id: 'taurus',
      name: 'Taureau',
      texts: [
        { id: 'taurus-1', text: 'Signe de terre et de rente. Ce trimestre, vous fructifiez lentement, comme un bon compost.' },
        { id: 'taurus-2', text: 'Vénus dans votre secteur boursier : vos actions montent, votre humilité descend.' },
        { id: 'taurus-3', text: 'Un héritage se précise. Malheureusement, c’est vous qui êtes l’héritage.' },
        { id: 'taurus-4', text: 'Saturne bloque vos dépenses. Tant mieux : vous n’aviez rien prévu d’utile.' },
        { id: 'taurus-5', text: 'Les astres conseillent d’acheter bas et de vendre haut. Personne ne les avait consultés avant.' },
        { id: 'taurus-6', text: 'Votre maison du travail s’agite : un stagiaire pourrait bientôt exiger un salaire.' },
      ],
    },
    {
      id: 'gemini',
      name: 'Gémeaux',
      texts: [
        { id: 'gemini-1', text: 'Double personnalité, double imposition. Les astres déplorent une coïncidence.' },
        { id: 'gemini-2', text: 'Mercure, votre maître, fusionne avec Vénus : belle semaine pour racheter votre concurrent.' },
        { id: 'gemini-3', text: 'Vous hésitez entre deux stratégies. Prenez les deux, vous licencierez dans celle qui échoue.' },
        { id: 'gemini-4', text: 'Un jumeau astral vous conseille l’audace. L’autre a déjà pris vos bénéfices.' },
        { id: 'gemini-5', text: 'Claire semaine pour les dividendes jumeaux : un pour vous, un pour votre holding.' },
        { id: 'gemini-6', text: 'Les planètes s’alignent. Votre comptable, lui, refuse de s’aligner sur quoi que ce soit.' },
      ],
    },
    {
      id: 'cancer',
      name: 'Cancer',
      texts: [
        { id: 'cancer-1', text: 'Votre carapace protège vos actifs. Votre homard intérieur, lui, panique à chaque audit.' },
        { id: 'cancer-2', text: 'La Lune, votre maîtresse, est pleine : vos coffres aussi, si l’on en croit le communiqué.' },
        { id: 'cancer-3', text: 'Semaine rêvée pour un parachute doré. Les astres fournissent le doré, vous le parachute.' },
        { id: 'cancer-4', text: 'Évitez les scandales en début de mois. Réservez-les pour la fin, c’est plus discret.' },
        { id: 'cancer-5', text: 'Un revenu inattendu arrive. Il porte une mallette et refuse de donner son nom.' },
        { id: 'cancer-6', text: 'Jupiter recule dans votre maison des impôts. Le fisc, hélas, avance dans la vôtre.' },
      ],
    },
    {
      id: 'leo',
      name: 'Lion',
      texts: [
        { id: 'leo-1', text: 'Le Soleil entre chez vous : projecteurs, tribune, et une enquête de la concurrence.' },
        { id: 'leo-2', text: 'Votre ego est en hausse de 12 %. Le marché corrige dès lundi.' },
        { id: 'leo-3', text: 'Semaine favorable pour nommer un directeur général à votre image. Personne n’ose.' },
        { id: 'leo-4', text: 'Les astres prédisent un bonus royal. Les actionnaires prédisent une émeute.' },
        { id: 'leo-5', text: 'Vous rugirez en conseil d’administration. Les autres signes applaudiront, par sécurité.' },
        { id: 'leo-6', text: 'Mars chauffe votre cours de Bourse. Évitez de le commenter avant le dessert.' },
      ],
    },
    {
      id: 'virgo',
      name: 'Vierge',
      texts: [
        { id: 'virgo-1', text: 'Vous avez relu le bilan trois fois. Il reste une faute : le chiffre d’affaires.' },
        { id: 'virgo-2', text: 'Mercure ordonne vos comptes. Vos comptes, intimidés, s’ordonnent effectivement.' },
        { id: 'virgo-3', text: 'Semaine idéale pour optimiser, rationaliser, et pleurer discrètement en réunion.' },
        { id: 'virgo-4', text: 'Un détail du contrat vous échappe. C’est le détail qui coûte le plus cher.' },
        { id: 'virgo-5', text: 'Les astres voient une promotion. Ils voient aussi votre remplaçant, plus jeune.' },
        { id: 'virgo-6', text: 'Votre tableur est en trine avec Saturne : rigueur, austérité, et des colonnes jusqu’à XFD.' },
      ],
    },
    {
      id: 'libra',
      name: 'Balance',
      texts: [
        { id: 'libra-1', text: 'Vous pesez le pour et le contre. Le pour est plus lourd, il contient votre bonus.' },
        { id: 'libra-2', text: 'Vénus équilibre vos comptes. Votre trésorerie, jalouse, se déséquilibre.' },
        { id: 'libra-3', text: 'Indécision astrale : racheter ou être racheté ? Les deux, c’est la mode.' },
        { id: 'libra-4', text: 'Justice et profits s’alignent. C’est rare, profitez-en avant jeudi.' },
        { id: 'libra-5', text: 'Un associé se montre désagréable. C’est le vôtre, et il a 51 % des parts.' },
        { id: 'libra-6', text: 'Les planètes réclament l’harmonie. Votre directeur financier réclame des liquidités.' },
      ],
    },
    {
      id: 'scorpio',
      name: 'Scorpion',
      texts: [
        { id: 'scorpio-1', text: 'Pluton sourit à vos manœuvres discrètes. Le juge d’instruction, moins.' },
        { id: 'scorpio-2', text: 'Votre instinct de tueur s’affine. Restez-en au marché, c’est moins de paperasse.' },
        { id: 'scorpio-3', text: 'Semaine idéale pour une OPA inamicale. L’amicalité n’a jamais rien rapporté.' },
        { id: 'scorpio-4', text: 'Un secret bien gardé fructifie. Continuez à ne pas savoir de quoi il s’agit.' },
        { id: 'scorpio-5', text: 'Les astres détectent une trahison. Heureusement, c’est la vôtre, vous êtes prévenu.' },
        { id: 'scorpio-6', text: 'Votre venin est en hausse sur les marchés. Les analystes parlent de « leadership ».' },
      ],
    },
    {
      id: 'sagittarius',
      name: 'Sagittaire',
      texts: [
        { id: 'sagittarius-1', text: 'Vous visez la Lune. Le marché vise votre trésorerie, et il tire mieux.' },
        { id: 'sagittarius-2', text: 'Jupiter, votre maître, agrandit tout : ambitions, dépenses, et la facture du consultant.' },
        { id: 'sagittarius-3', text: 'Semaine propice à l’international. Votre siège social songe à une boîte aux lettres aux îles.' },
        { id: 'sagittarius-4', text: 'Une flèche bien tirée atteindra sa cible. Ce sera un salarié, mais une cible quand même.' },
        { id: 'sagittarius-5', text: 'L’aventure vous appelle. Elle a un numéro surtaxé et une option « filiale ».' },
        { id: 'sagittarius-6', text: 'Optimisme astral : votre plan de carrière prévoit la retraite à 34 ans. C’est noté.' },
      ],
    },
    {
      id: 'capricorn',
      name: 'Capricorne',
      texts: [
        { id: 'capricorn-1', text: 'Signe de sommet : vous grimpez, les autres dégringolent. C’est le principe.' },
        { id: 'capricorn-2', text: 'Saturne, votre patron, exige la rigueur. Vos salariés exigent des augmentations. Bonne chance.' },
        { id: 'capricorn-3', text: 'Vos économies prennent de l’altitude. Le mal de tête aussi, c’est la pression.' },
        { id: 'capricorn-4', text: 'Semaine favorable pour un audit interne. Définition d’« interne » : qui ne sort pas.' },
        { id: 'capricorn-5', text: 'Les astres voient une longévité remarquable. Celle de votre prêt, pas la vôtre.' },
        { id: 'capricorn-6', text: 'Votre patience paiera. Délai estimé : 16 trimestres. Vérifiez le petit astérisque.' },
      ],
    },
    {
      id: 'aquarius',
      name: 'Verseau',
      texts: [
        { id: 'aquarius-1', text: 'Uranus bouscule votre secteur. Vous appelez ça disruption, vos clients, une panne.' },
        { id: 'aquarius-2', text: 'Semaine d’innovation : votre idée révolutionnaire date de 1998, mais le logo est neuf.' },
        { id: 'aquarius-3', text: 'Les astres versent de l’eau sur vos dettes. Elles nagent très bien.' },
        { id: 'aquarius-4', text: 'Un collectif vous soutient. Il s’appelle « créanciers » et il est très uni.' },
        { id: 'aquarius-5', text: 'Votre côté visionnaire séduit les investisseurs. Votre bilan les ramène au réel.' },
        { id: 'aquarius-6', text: 'Progrès, futur, rupture : trois mots à placer dans le prochain communiqué.' },
      ],
    },
    {
      id: 'pisces',
      name: 'Poissons',
      texts: [
        { id: 'pisces-1', text: 'Vous nagez dans les liquidités. Attention au courant, il mène au redressement.' },
        { id: 'pisces-2', text: 'Neptune floute vos frontières : entreprise perso, fortune pro, tout se mélange. Délicieux.' },
        { id: 'pisces-3', text: 'Votre intuition flaire une fusion. C’est votre banquier qui regroupe vos trois découverts.' },
        { id: 'pisces-4', text: 'Semaine rêveuse. Votre rêve de rente à vie rencontre la réalité, version trimestrielle.' },
        { id: 'pisces-5', text: 'Les astres voient des requins dans votre océan. Rassurez-vous, ce sont des dauphins activistes.' },
        { id: 'pisces-6', text: 'Votre compassion touche vos actionnaires. Vos dividendes, eux, restent introuvables.' },
      ],
    },
  ],

  // ---------------------------------------------------------------------------
  // Faits divers (≤ 200 caractères, commence par un lieu suivi d’un point).
  // ---------------------------------------------------------------------------
  oddNews: [
    { id: 'fait-01', text: '{city}. Une trottinette électrique traverse la ville sans conducteur. Elle a depuis été promue directrice adjointe.' },
    { id: 'fait-02', text: '{city}. Le maire inaugure un rond-point autour d’un autre rond-point « pour fluidifier le premier ».' },
    { id: 'fait-03', text: '{zone}. Une vache échappée d’une usine de yaourts est retrouvée en réunion chez le concurrent.' },
    { id: 'fait-04', text: '{city}. Un pigeon remporte le marathon annuel. Les organisateurs invoquent « l’esprit de la course ».' },
    { id: 'fait-05', text: '{landmark}. Le monument local affiche complet pour sa propre visite. On ignore qui achète les billets.' },
    { id: 'fait-06', text: '{city}. Un habitant déclare son canapé comme siège social. Le canapé verse désormais des dividendes.' },
    { id: 'fait-07', text: '{zone}. Pénurie ({commodity}) : le café du coin sert désormais de l’eau tiède « conceptuelle ».' },
    { id: 'fait-08', text: '{city}. Un chien découvre un gisement ({commodity}) dans son jardin. Il refuse toute offre de rachat.' },
    { id: 'fait-09', text: '{city}. Le conseil municipal achète {product} pour « dynamiser l’image de la commune ».' },
    { id: 'fait-10', text: '{city}. Une panne de réveil connecté plonge trois quartiers dans un lundi sans fin.' },
    { id: 'fait-11', text: '{zone}. Un rond-point est classé troisième plus belle attraction de la région. Il n’y en a que trois.' },
    { id: 'fait-12', text: '{city}. Le club de pétanque rachète une start-up. « C’est une question de portée », explique le président.' },
    { id: 'fait-13', text: '{city}. Des plongeurs retrouvent dans une épave {product} en parfait état. Mise aux enchères prévue, estimation : trois euros.' },
    { id: 'fait-14', text: '{city}. Le panneau « Bienvenue » tombe en panne. La ville annonce un plan de relance du panneau.' },
    { id: 'fait-15', text: '{landmark}. Un autocar de touristes venu admirer le site repart avec la photo du parking.' },
    { id: 'fait-16', text: '{city}. Un distributeur refuse de rendre la monnaie « par conviction personnelle ». Une enquête est ouverte.' },
    { id: 'fait-17', text: '{city}. La foire au fromage élit son ambassadeur : un yaourt. La profession se dit « choquée mais flattée ».' },
    { id: 'fait-18', text: '{city}. Un habitant rapporte avoir vu un OVNI. Il s’agissait d’une trottinette en feu, précise la gendarmerie.' },
    { id: 'fait-19', text: '{zone}. Les sangliers se passionnent pour le secteur {sector}. Le syndicat des chasseurs dénonce une concurrence déloyale.' },
    { id: 'fait-20', text: '{city}. Le défilé du 14 juillet est remporté par un camion de livraison qui « passait par là ».' },
    { id: 'fait-21', text: '{city}. Une usine du secteur {sector} ferme pour « réflexion stratégique ». Les machines, elles, continuent de tourner.' },
    { id: 'fait-22', text: '{city}. Le boulanger lance une baguette sans gluten, sans blé et sans goût. Le succès est immédiat.' },
    { id: 'fait-23', text: '{zone}. Un GPS envoie quarante camions dans un champ. Les betteraves n’ont pas survécu.' },
    { id: 'fait-24', text: '{city}. Le médecin du travail de l’usine du secteur {sector} s’évanouit en lisant les chiffres. Il va bien.' },
    { id: 'fait-25', text: '{city}. Un ours en peluche connecté prend le contrôle de la maison. Il exige des piles neuves.' },
    { id: 'fait-26', text: '{city}. Le quotidien local imprime deux fois la même une. Personne ne s’en aperçoit, y compris la rédaction.' },
    { id: 'fait-27', text: '{city}. Une pétition réclame {product} à la cantine chaque vendredi. Elle est signée par quatre cents enfants et un maire.' },
    { id: 'fait-28', text: '{zone}. La gare ferme pour travaux. Les travaux consistent à regarder la gare fermée.' },
    { id: 'fait-29', text: '{city}. Un commercial du secteur {sector} bat le record de poignées de main en une journée : 3 412. Aucun contrat signé.' },
    { id: 'fait-30', text: '{city}. Le parc municipal installe des bancs payants. Le premier client est un canard, non solvable.' },
    { id: 'fait-31', text: '{city}. Une entreprise du secteur {sector} déménage de cinquante mètres « pour l’international ». Personne ne conteste.' },
    { id: 'fait-32', text: '{zone}. Un champ de betteraves est mis en vente en NFT. Le propriétaire parle d’« agriculture augmentée ».' },
    { id: 'fait-33', text: '{city}. Le feu rouge le plus long du département reçoit une plaque commémorative. Il est toujours rouge.' },
    { id: 'fait-34', text: '{city}. Un expert-comptable gagne au loto. Il déclare ses gains en trois exemplaires, par habitude.' },
    { id: 'fait-35', text: '{city}. La piscine municipale se chauffe désormais aux invendus ({commodity}). L’eau sent le progrès.' },
    { id: 'fait-36', text: '{zone}. Un haricot géant bloque la départementale. La préfecture évoque « une croissance forte ».' },
    { id: 'fait-37', text: '{city}. Un habitant se fait livrer {product} par drone. Le drone refuse de repartir et squatte le garage.' },
    { id: 'fait-38', text: '{city}. Le club des actionnaires du dimanche élit son président : un hérisson. « Il pique, mais il décide. »' },
    { id: 'fait-39', text: '{city}. Une place de parking est louée neuf cents euros le trimestre. Elle est vendue « avec vue sur le trottoir ».' },
    { id: 'fait-40', text: '{zone}. Les abeilles de la ruche municipale font grève. Le miel de substitution est jugé « correct ».' },
    { id: 'fait-41', text: '{city}. Un baby-sitter accepte d’être payé avec {product}. Le conseil de famille valide, les dentistes protestent.' },
    { id: 'fait-42', text: '{city}. Le clocher sonne treize coups à midi. Le curé invoque « un effet de levier temporel ».' },
    { id: 'fait-43', text: '{city}. Une tornade emporte le hangar des fêtes. Il est retrouvé, loué, puis reloué plus cher.' },
    { id: 'fait-44', text: '{zone}. Un trésor ({commodity}) est découvert sous la salle des fêtes. Le bal du samedi est maintenu dessus.' },
    { id: 'fait-45', text: '{city}. Un stagiaire est nommé « directeur de l’innovation ». Il a dix-neuf ans et un badge qui ne marche pas.' },
    { id: 'fait-46', text: '{city}. La boutique de souvenirs vend des cartes postales de la boutique de souvenirs. Stock épuisé.' },
    { id: 'fait-47', text: '{city}. Un chef d’entreprise du secteur {sector} court le semi-marathon en costume. Il finit « en bonne santé financière ».' },
    { id: 'fait-48', text: '{landmark}. Le ponton est repeint en deux couleurs « pour favoriser la diversité ». Il pleut ce jour-là.' },
    { id: 'fait-49', text: '{city}. Un distributeur de billets affiche « Au revoir » et se déconnecte. La banque parle de départ en retraite.' },
    { id: 'fait-50', text: '{city}. La cantine scolaire teste un menu « zéro budget ». Les enfants notent l’assiette vide : 4/10.' },
    { id: 'fait-51', text: '{city}. Un panneau « Sens interdit » est contredit par un panneau « Sens obligatoire ». Les voitures méditent.' },
    { id: 'fait-52', text: '{zone}. Une entreprise du secteur {sector} promet le « télétravail subaquatique ». Les CV affluent, les masques manquent.' },
    { id: 'fait-53', text: '{city}. Le maire offre {product} à chaque nouveau-né. La maternité réclame un partenariat et des bonbons.' },
    { id: 'fait-54', text: '{city}. Un immeuble de bureaux est converti en ruches. Les salariés déplorent « peu de changement notable ».' },
    { id: 'fait-55', text: '{city}. Le marché de Noël ouvre en juillet « pour prendre de l’avance ». La neige, commandée, est en retard.' },
    { id: 'fait-56', text: '{zone}. Une mouette dérobe le micro d’un journaliste en direct. Son témoignage reste introuvable.' },
    { id: 'fait-57', text: '{city}. Un conseiller municipal propose de paver la rivière. Le dossier est « à l’étude », comme chaque année.' },
    { id: 'fait-58', text: '{city}. Un frigo connecté passe commande chez le concurrent de son propriétaire. La famille est sous le choc.' },
    { id: 'fait-59', text: '{city}. La statue du fondateur reçoit un gilet jaune. L’auteur du geste est recherché, le style salué.' },
    { id: 'fait-60', text: '{zone}. Un coucher de soleil exceptionnel est déclaré « événement sponsorisé ». Le sponsoring reste flou.' },
    { id: 'fait-61', text: '{city}. Un audit révèle que la mairie possède quatre photocopieuses. Personne ne sait où est la quatrième.' },
    { id: 'fait-62', text: '{city}. Le concours du plus beau tracteur est annulé : tous les tracteurs ont gagné. L’égalité a ses fans.' },
  ],

  // ---------------------------------------------------------------------------
  // Courrier des lecteurs (≤ 220 caractères ; {company} et {amount} uniquement
  // dans les lettres de bilan, et obligatoirement ensemble).
  // ---------------------------------------------------------------------------
  letters: [
    { id: 'lettre-01', trigger: 'uneGood', text: 'Enfin une bonne nouvelle en une. J’ai vérifié la date trois fois, nous ne sommes pas le 1er avril.' },
    { id: 'lettre-02', trigger: 'uneGood', text: 'Votre une ({commodity}) m’a redonné foi en la presse. J’ai fait encadrer le titre, au-dessus de la cheminée.' },
    { id: 'lettre-03', trigger: 'uneGood', text: 'Une une optimiste ! J’ai appelé ma mère, elle n’y croyait pas non plus.' },
    { id: 'lettre-04', trigger: 'uneGood', text: 'Bravo pour cette une qui redonne le sourire. Mon banquier l’a lue, il a failli sourire aussi.' },
    { id: 'lettre-05', trigger: 'uneGood', text: 'Je lis votre journal depuis trente ans. C’est la première fois que la une ne me donne pas envie de déménager.' },
    { id: 'lettre-06', trigger: 'uneGood', text: 'Excellente nouvelle en une pour le secteur {sector}. J’attends maintenant la baisse de mes impôts. Je plaisante.' },
    { id: 'lettre-07', trigger: 'uneBad', text: 'Encore une catastrophe en une. Vous pourriez mettre les mauvaises nouvelles en page 12, comme tout le monde.' },
    { id: 'lettre-08', trigger: 'uneBad', text: 'Votre une ({commodity}) m’a gâché le petit-déjeuner. Et pourtant, il n’était déjà pas fameux.' },
    { id: 'lettre-09', trigger: 'uneBad', text: 'Je me lève, je lis la une, je me recouche. Merci de fidéliser ainsi votre lectorat.' },
    { id: 'lettre-10', trigger: 'uneBad', text: 'Une une aussi sombre un dimanche, c’est de la maltraitance. Je réclame un encart licorne en compensation.' },
    { id: 'lettre-11', trigger: 'uneBad', text: 'Le titre de une ({sector}) m’a fait renverser mon café. J’attends le remboursement sous huitaine.' },
    { id: 'lettre-12', trigger: 'uneBad', text: 'Mauvaise nouvelle en une, pluie dehors, et plus de café. Je tiens votre journal pour responsable des trois.' },
    { id: 'lettre-13', trigger: 'uneNeutral', text: 'Votre une d’hier ne m’a fait ni chaud ni froid. C’est inquiétant, je ne sais plus quoi ressentir.' },
    { id: 'lettre-14', trigger: 'uneNeutral', text: 'Une une tiède, un café tiède, un trimestre tiède. Au moins, tout est cohérent.' },
    { id: 'lettre-15', trigger: 'uneNeutral', text: 'Je n’ai rien compris à la une, mais la photo était bien cadrée. Continuez ainsi.' },
    { id: 'lettre-16', trigger: 'uneNeutral', text: 'La une parle du secteur {sector} sans rien affirmer. C’est exactement ma position sur la plupart des sujets.' },
    { id: 'lettre-17', trigger: 'uneNeutral', text: 'Trois colonnes pour ne rien dire : bravo, c’est un art. Mon beau-frère est également maître en la matière.' },
    { id: 'lettre-18', trigger: 'uneNeutral', text: 'J’ai lu la une deux fois. La deuxième lecture n’a rien ajouté, ce qui prouve sa solidité.' },
    { id: 'lettre-19', trigger: 'bigProfit', text: '{company} annonce {amount} de bénéfices. Je voudrais juste vérifier que ce n’est pas mon argent de poche.' },
    { id: 'lettre-20', trigger: 'bigProfit', text: 'Bénéfice record de {amount} chez {company}. Bravo. Mes félicitations seront facturées au tarif lecteur.' },
    { id: 'lettre-21', trigger: 'bigProfit', text: '{company} gagne {amount} en un trimestre. Moi, en un trimestre, j’ai perdu trois chaussettes. Chacun son rythme.' },
    { id: 'lettre-22', trigger: 'bigProfit', text: 'Je félicite {company} pour ses {amount}. La prochaine fois, un petit dessin pour expliquer où ils passent.' },
    { id: 'lettre-23', trigger: 'bigProfit', text: '{amount} de profits chez {company}. Ma grand-mère dit qu’à son époque, on disait merci. Et on distribuait.' },
    { id: 'lettre-24', trigger: 'bigProfit', text: '{company} : {amount} de bénéfice net. Net de quoi ? De nous, apparemment.' },
    { id: 'lettre-25', trigger: 'bigLoss', text: '{company} a perdu {amount}. Je voudrais m’assurer que ce n’est pas moi qui les ai.' },
    { id: 'lettre-26', trigger: 'bigLoss', text: '{amount} partis en fumée chez {company}. Au moins, quelqu’un sait où est passé mon pouvoir d’achat.' },
    { id: 'lettre-27', trigger: 'bigLoss', text: 'Perte de {amount} pour {company}. Ils peuvent toujours revendre les confettis de la dernière keynote.' },
    { id: 'lettre-28', trigger: 'bigLoss', text: '{company} annonce {amount} de pertes. Le PDG garde le sourire, ce qui prouve qu’il n’a pas compris non plus.' },
    { id: 'lettre-29', trigger: 'bigLoss', text: 'Chez {company}, on perd {amount} et on parle de “trimestre de transition”. Chez moi, on dit “dispute”.' },
    { id: 'lettre-30', trigger: 'bigLoss', text: 'J’ai lu à voix haute la perte de {amount} chez {company}. Mon chat a quitté la pièce.' },
    { id: 'lettre-31', trigger: 'scandal', text: '{company} éclaboussée à hauteur de {amount}. Le communiqué parle d’un “malentendu avec de gros moyens”.' },
    { id: 'lettre-32', trigger: 'scandal', text: 'Un scandale de {amount} chez {company}, et personne n’a rien vu. À ce niveau, la vue est un luxe.' },
    { id: 'lettre-33', trigger: 'scandal', text: '{company} dans la tourmente pour {amount}. J’ai hâte de lire que la faute incombe à un stagiaire.' },
    { id: 'lettre-34', trigger: 'scandal', text: 'Encore {amount} qui manquent chez {company}. Cherchez sous les coussins du conseil d’administration.' },
    { id: 'lettre-35', trigger: 'scandal', text: 'Le scandale {company} me dégoûte : {amount}, c’est mille ans de mon abonnement. Je résilie par principe, puis je me réabonne pour connaître la suite.' },
    { id: 'lettre-36', trigger: 'scandal', text: '{company} jure que les {amount} étaient “parfaitement légaux”. C’est précisément ce qui m’inquiète.' },
    { id: 'lettre-37', trigger: 'bankruptcy', text: '{company} fait faillite après {amount} de pertes. Le fondateur parle déjà de “pivot vers le néant”.' },
    { id: 'lettre-38', trigger: 'bankruptcy', text: 'Faillite de {company} : {amount} envolés. Je l’avais prédit, mais seulement dans ma tête, donc ça ne compte pas.' },
    { id: 'lettre-39', trigger: 'bankruptcy', text: '{company} dépose le bilan. Les {amount} de la dernière perte seront exposés au musée, sous verre.' },
    { id: 'lettre-40', trigger: 'bankruptcy', text: 'Adieu {company}, et adieu {amount}. On vous aimait bien au début, quand vous rendiez encore la monnaie.' },
    { id: 'lettre-41', trigger: 'bankruptcy', text: '{company} s’effondre avec un trou de {amount}. On m’avait pourtant juré que ce trou était “stratégique”.' },
    { id: 'lettre-42', trigger: 'bankruptcy', text: 'La faillite de {company} m’attriste. Leurs produits étaient mauvais, mais leurs pertes, {amount}, étaient élégantes.' },
    { id: 'lettre-43', trigger: 'any', text: 'Pourquoi la météo boursière n’est-elle jamais avant le film du soir ? On aimerait savoir s’il faut un parapluie.' },
    { id: 'lettre-44', trigger: 'any', text: 'Je déplore que vos chiffres ne soient jamais accompagnés de dessins. Un camembert, de temps en temps, ce serait bien.' },
    { id: 'lettre-45', trigger: 'any', text: 'Votre rubrique économie manque de recettes de cuisine. On ne vit pas que de dividendes.' },
    { id: 'lettre-46', trigger: 'any', text: '{commodity} : le cours monte, descend, remonte. On dirait mon ascenseur, sauf que lui finit par s’arrêter.' },
    { id: 'lettre-47', trigger: 'any', text: 'Je réclame le retour des petites annonces en vers. Les entreprises méritent aussi de la poésie.' },
    { id: 'lettre-48', trigger: 'any', text: 'Depuis que je lis votre journal, je comprends moins bien l’économie. C’est un progrès : avant, je croyais comprendre.' },
    { id: 'lettre-49', trigger: 'any', text: 'Mon voisin prétend tout savoir sur le secteur {sector}. Votre journal est le seul à résister à son influence. Tenez bon.' },
    { id: 'lettre-50', trigger: 'any', text: 'Bravo pour le sudoku de la page économie. C’est le seul chiffre de votre journal que je maîtrise.' },
    { id: 'lettre-51', trigger: 'bankruptcy', text: '{company} dépose le bilan. J’avais encore leur carte de fidélité, tamponnée neuf fois sur dix.' },
  ],

  // ---------------------------------------------------------------------------
  // Signatures du courrier des lecteurs.
  // ---------------------------------------------------------------------------
  signatures: [
    { id: 'sig-01', text: 'Gérard, retraité, {city}' },
    { id: 'sig-02', text: 'Une lectrice inquiète, {city}' },
    { id: 'sig-03', text: 'M. Pivot, expert-comptable bénévole, {city}' },
    { id: 'sig-04', text: 'Josiane, fidèle de la page 7, {city}' },
    { id: 'sig-05', text: 'Un père de famille nombreuse en actions, {city}' },
    { id: 'sig-06', text: 'Bernard, ancien du conseil municipal, {city}' },
    { id: 'sig-07', text: 'Laurence, actionnaire prudente, {city}' },
    { id: 'sig-08', text: 'Un retraité du bâtiment et des dividendes, {city}' },
    { id: 'sig-09', text: 'Marceline, abonnée depuis 1983, {city}' },
    { id: 'sig-10', text: 'Un jeune retraité (en rêve), {city}' },
    { id: 'sig-11', text: 'Huguette, fan de l’horoscope, {city}' },
    { id: 'sig-12', text: 'Didier, petit porteur et grand lecteur, {city}' },
    { id: 'sig-13', text: 'Une économiste en pantoufles, {city}' },
    { id: 'sig-14', text: 'Roger, président du club de pétanque, {city}' },
    { id: 'sig-15', text: 'Une maman qui fait les comptes, {city}' },
    { id: 'sig-16', text: 'Alain, chauffeur de salle des marchés, {city}' },
    { id: 'sig-17', text: 'Un retraité et son perroquet, {city}' },
    { id: 'sig-18', text: 'Sylvie, syndicaliste du canapé, {city}' },
    { id: 'sig-19', text: 'Un ancien banquier repenti, {zone}' },
    { id: 'sig-20', text: 'Un habitant du troisième étage, {zone}' },
    { id: 'sig-21', text: 'Mireille, championne régionale de tricot, {zone}' },
    { id: 'sig-22', text: 'Un contribuable en bonne et due forme, {zone}' },
    { id: 'sig-23', text: 'Le porte-parole des balcons fleuris, {zone}' },
    { id: 'sig-24', text: 'Une lectrice du dimanche et du jeudi' },
    { id: 'sig-25', text: 'Anonyme, mais pas trop' },
    { id: 'sig-26', text: 'René, qui avait tout prévu sauf ça, {city}' },
  ],

  // ---------------------------------------------------------------------------
  // Petites annonces (texte ≤ 160 caractères ; jamais d'entreprise ni de joueur).
  // ---------------------------------------------------------------------------
  ads: [
    { id: 'ann-01', head: 'Cherche comptable', text: 'Pour tenir les comptes d’une amicale de belote. Sérieux exigé, triche tolérée en interne. Se présenter à {city}.' },
    { id: 'ann-02', head: 'Donne usine de trottinettes', text: 'Usine complète, machines récentes, carnet de commandes vide. À retirer sur place, {zone}. Murs en bon état.' },
    { id: 'ann-03', head: 'Échange parachute doré', text: 'Parachute doré, peu servi, un seul atterrissage. Échange contre séance de bowling ou équivalent. Offres sérieuses.' },
    { id: 'ann-04', head: 'Vend collection de dividendes', text: 'Dividendes encadrés, 1987-2024. Superbe état, jamais réinvestis. Prix selon émotion. Visite possible à {city}.' },
    { id: 'ann-05', head: 'Cherche associé muet', text: 'Start-up en pleine forme cherche associé à 50 %. Apport en nature accepté. Expression orale non requise. Écrire à la rédaction.' },
    { id: 'ann-06', head: 'Cours de Bourse à domicile', text: 'Ancien directeur de salle des marchés donne cours à domicile. On commence par les pertes, pour ne pas être déçu. {city}.' },
    { id: 'ann-07', head: 'Vend lot de barils', text: 'Barils pleins ({commodity}), légèrement entamés. Idéal décoration de salon ou argument de négociation. À voir sur place ({zone}).' },
    { id: 'ann-08', head: 'Cherche stagiaire courageux', text: 'PME du secteur {sector} recherche stagiaire pour « missions variées ». Indemnités symboliques, gloire réelle. CV manuscrit exigé.' },
    { id: 'ann-09', head: 'Donne tableau de bord', text: 'Magnifique tableau de bord de direction, LED fonctionnelles, chiffres rassurants intégrés. Cause départ. À chercher à {city}.' },
    { id: 'ann-10', head: 'Achète mauvaises idées', text: 'Investisseur patient achète mauvaises idées en gros. Prix discutables garantis. Déplacement possible dans tout le pays.' },
    { id: 'ann-11', head: 'Échange trottinette', text: 'Trottinette électrique, freins poétiques, contre bicyclette honnête qui sait freiner. C’est tout ce qu’on demande. {city}.' },
    { id: 'ann-12', head: 'Cherche témoin de fusion', text: 'Pour mariage d’entreprises prévu au printemps, cherche témoin neutre. Buffet offert, clause de non-concurrence à signer. {city}.' },
    { id: 'ann-13', head: 'Vend fauteuil de PDG', text: 'Fauteuil de direction en cuir, garde la mémoire des grandes décisions et de la sieste de 16 h. Excellent état. À débattre.' },
    { id: 'ann-14', head: 'Recherche yacht échoué', text: 'Perdu : petit yacht, 12 m, coordonnées approximatives. Région {zone}. Récompense en gratitude et en produits de la mer.' },
    { id: 'ann-15', head: 'Cours de crédibilité', text: 'Consultant certifié propose stage « langue de bois appliquée ». Deux jours pour apprendre à ne rien promettre. Tarifs à {city}.' },
    { id: 'ann-16', head: 'Donne chat de bureau', text: 'Chat de copropriété, licencié pour ronron excessif en réunion. Propre, affectueux, syndiqué. À adopter sur {city}.' },
    { id: 'ann-17', head: 'Cherche banquier compréhensif', text: 'Projet audacieux : boutique ouverte uniquement la nuit, produit phare : {product}. Cherche banquier au grand cœur, petit comité.' },
    { id: 'ann-18', head: 'Vend ascenseur social', text: 'Ascenseur social d’occasion, monte très bien, descend tout seul. Quelques rayures. À voir sur site ({landmark}).' },
    { id: 'ann-19', head: 'Échange stock-options', text: 'Stock-options invendables contre bons de réduction acceptables. Étudie toute proposition sérieuse ou drôle. Écrire à la rédaction.' },
    { id: 'ann-20', head: 'Cherche graphiste bénévole', text: 'Association cherche graphiste pour « refonte urgente du logo » lancée en 2011. Ambiance sympa, budget introuvable. {city}.' },
    { id: 'ann-21', head: 'Vend baby-foot de direction', text: 'Baby-foot du comité exécutif, traces de négociations, quelques dents. Idéal open space ou salle de repos. Prix ami, {city}.' },
    { id: 'ann-22', head: 'Cherche chauffeur de salle', text: 'Salle des marchés cherche chauffeur de salle pour applaudir les chiffres. Mi-temps, prime au standing-ovation. {zone}.' },
    { id: 'ann-23', head: 'Donne business plan', text: 'Business plan complet, 240 pages, prévisions à dix ans toutes optimistes. Cause : réalité. Vient le chercher qui veut, {city}.' },
    { id: 'ann-24', head: 'Vend licence de pêche au dividende', text: 'Licence rare, valable sur les bancs d’actionnaires du pays. Rendements passés garantis, mais uniquement au passé. Renseignements à {city}.' },
    { id: 'ann-25', head: 'Recherche réunion sans objet', text: 'Cadre disponible cherche réunions sans ordre du jour pour occuper ses après-midis. Apporte croissants et présence rassurante.' },
    { id: 'ann-26', head: 'Échange congés payés', text: 'Échange deux semaines de congés contre une semaine de silence. Négociable selon météo et hiérarchie. Annonce sérieuse, {zone}.' },
    { id: 'ann-27', head: 'Cherche plume de communiqués', text: 'Entreprise du secteur {sector} recherche rédacteur capable d’écrire « trimestre difficile » de 47 façons. Poésie exigée.' },
    { id: 'ann-28', head: 'Vend entrepôt plein d’espoir', text: 'Entrepôt 2 000 m², livré avec un lot d’invendus, dont {product}, et l’optimisme d’origine. État brut. Visites à {city}, le samedi.' },
    { id: 'ann-29', head: 'Cours de sieste productive', text: 'Formateur agréé enseigne la sieste en open space sans se faire remarquer. Méthode brevetée. Séances à {city}.' },
    { id: 'ann-30', head: 'Recherche actionnaire compréhensif', text: 'Petite entreprise sympathique cherche actionnaire qui ne lit pas les bilans. Ambiance familiale, dividendes romantiques. {zone}.' },
    { id: 'ann-31', head: 'Donne plante verte de bureau', text: 'Ficus de direction, témoin de trois plans sociaux, cherche nouveau pot. Résistant à l’éclairage néon. À récupérer à {city}.' },
    { id: 'ann-32', head: 'Cherche sponsor de goûter', text: 'Équipe de pétanque semi-professionnelle recherche sponsor pour goûters officiels. Visibilité sur le bob de l’équipe. {zone}.' },
    { id: 'ann-33', head: 'Vend machine à café stratégique', text: 'Machine à café ayant servi aux décisions majeures d’un comité de direction. Bruit d’ambiance inclus. Prix négociable, {city}.' },
    { id: 'ann-34', head: 'Échange trimestre difficile', text: 'Contre trimestre simplement moyen. Le mien est certifié, fourni avec excuses et plan d’action. Région {zone} uniquement.' },
    { id: 'ann-35', head: 'Cherche second bureau', text: 'Consultant cherche second bureau pour y recevoir les clients qu’il n’a pas. Loyer en visibilité. Prestations en mystère. {city}.' },
    { id: 'ann-36', head: 'Vend stock de confettis', text: 'Confettis de lancements de produits, toutes couleurs, nombreux espoirs inclus. Vendus en vrac, sac de 10 kg. Départ {zone}.' },
    { id: 'ann-37', head: 'Cours de calcul boursier', text: 'Apprenez à diviser par zéro sans vous inquiéter. Cours du soir pour actionnaires anxieux. Inscriptions à {city}, places limitées.' },
    { id: 'ann-38', head: 'Cherche nom de licorne', text: 'Start-up prometteuse cherche nom pour sa future licorne. Propositions sérieuses uniquement, paiement en titres-restaurant. {city}.' },
    { id: 'ann-39', head: 'Donne chaise de réunion', text: 'Chaise ergonomique ayant survécu à quatre cents réunions. Légère griffure de stylo. Convient à cadre patient. À enlever à {city}.' },
    { id: 'ann-40', head: 'Recherche investisseur romantique', text: 'Cinéma de quartier transformé en salle de cotation cherche investisseur qui aime les fins heureuses. Et les pop-corns. {zone}.' },
    { id: 'ann-41', head: 'Vend trophée de l’année', text: 'Trophée « Manager de l’année », millésime 2019, édition un peu ternie. Revendu pour raisons de calendrier. {city}.' },
    { id: 'ann-42', head: 'Cherche coach en chiffres ronds', text: 'Entreprise cherche coach pour apprendre à dire « environ un million » avec conviction. Visio acceptée. Budget rond.' },
    { id: 'ann-43', head: 'Échange bureau avec vue', text: 'Bureau avec vue ({landmark}) contre bureau avec vue sur l’océan. Ou sur rien, si le rien est calme. Offres à {city}.' },
    { id: 'ann-44', head: 'Donne objectifs trimestriels', text: 'Lot d’objectifs trimestriels neufs, jamais atteints. Modèles ambitieux et réalistes. Vient les chercher qui veut, {zone}.' },
    { id: 'ann-45', head: 'Vend carnet d’adresses', text: 'Carnet d’adresses d’un directeur commercial, trente ans de déjeuners. Certains numéros fonctionnent encore. Prix confidentiel, {city}.' },
    { id: 'ann-46', head: 'Cherche retraite anticipée', text: 'Cadre de 41 ans cherche retraite anticipée, de préférence ensoleillée. Apporte expérience et bonne humeur. Toute offre étudiée.' },
    { id: 'ann-47', head: 'Cours d’optimisme comptable', text: 'Comptable zen propose ateliers « voir le bilan en positif ». Apportez votre café, nous fournissons les perspectives. {city}.' },
    { id: 'ann-48', head: 'Vend usine à gaz', text: 'Authentique usine à gaz, idéale pour projets complexes et réunions interminables. État d’origine, visite guidée sur place ({zone}).' },
    { id: 'ann-49', head: 'Cherche modèle économique', text: 'Start-up très appréciée cherche modèle économique, toute taille acceptée. En échange : bonne humeur et gratitude éternelle. {city}.' },
    { id: 'ann-50', head: 'Échange open space', text: 'Échange 80 m² d’open space contre cabane au fond d’un jardin. Électricité optionnelle, calme exigé. Région {zone}.' },
    { id: 'ann-51', head: 'Vend photocopieuse mystérieuse', text: 'Photocopieuse de mairie, modèle rare, fonctionne les jours impairs. Vendue avec sa légende et son câble. À voir à {city}.' },
    { id: 'ann-52', head: 'Cherche témoin pour assemblée', text: 'Assemblée générale animée cherche témoin calme pour valider les applaudissements. Sandwiches fournis. {city}, fin du mois.' },
    { id: 'ann-53', head: 'Donne souvenirs de fusion', text: 'Vide-greniers post-fusion : mugs, stylos, polaires au nom disparu. Tout doit partir, surtout les polaires. Hangar, région {zone}.' },
    { id: 'ann-54', head: 'Cours de poignée de main', text: 'Ancien commercial enseigne la poignée de main qui vend. Trois séances, résultats garantis au quatrième rendez-vous. {city}.' },
    { id: 'ann-55', head: 'Cherche partenaire de stand', text: 'Salon des entrepreneurs : cherche partenaire pour stand de 4 m². Apport : thermos de café et sourire du lundi. {zone}.' },
    { id: 'ann-56', head: 'Vend tableur de légende', text: 'Le fameux tableur à 14 onglets d’un groupe connu. Livré sans mode d’emploi, comme à l’origine. Collectionneurs à {city}.' },
    { id: 'ann-57', head: 'Recherche pluie de dividendes', text: 'Actionnaire patient recherche pluie de dividendes annoncée en 2012. Toute information récompensée en reconnaissance. Secteur {sector}.' },
    { id: 'ann-58', head: 'Donne chaise longue stratégique', text: 'Chaise longue ayant inspiré trois plans de relance. Légèrement affaissée, comme les plans. À retirer à {city}.' },
    { id: 'ann-59', head: 'Cherche expert en tout', text: 'Journal local cherche expert capable de commenter les cours ({commodity}), la météo et la pétanque. Rémunération en gloire locale. {city}.' },
    { id: 'ann-60', head: 'Échange climatiseur', text: 'Climatiseur puissant contre machine à brouillard pour annonces importantes. Parfait état de marche, échange sur place ({zone}).' },
    { id: 'ann-61', head: 'Vend autographe de PDG', text: 'Autographe authentique d’un grand patron, obtenu sur un chèque. Pièce unique, cadre offert. Enchères discrètes à {city}.' },
    { id: 'ann-62', head: 'Cherche mot de la fin', text: 'Rédaction cherche mot de la fin pour son éditorial. Doit rimer avec « trimestre ». Toute proposition lue avec attention.' },
  ],

  // ---------------------------------------------------------------------------
  // Formules satiriques pour habiller les chiffres du journal (≥ 5 par rubrique).
  // ---------------------------------------------------------------------------
  figureQuips: {
    fines: [
      'La profession dénonce un « acharnement » et provisionne déjà le suivant.',
      'L’entreprise conteste, fait appel, puis paie en petite monnaie. Le guichet n’a pas apprécié.',
      'Record battu : l’amende est désormais classée au patrimoine, elle revient chaque trimestre.',
      'Le directeur financier salue « une relation de confiance durable » avec le trésor public.',
      'Montant modeste, selon la direction ; monument, selon la comptabilité.',
      'La somme sera prélevée sur la cagnotte des confettis du prochain lancement.',
    ],
    bonuses: [
      'Le bonus correspond, selon le conseil, à « la valeur ajoutée ». La valeur, elle, attend toujours.',
      'Les actionnaires toussent. Le conseil d’administration entend des applaudissements.',
      'Un bonus indexé sur la performance : l’entreprise a performé deux trimestres, le bonus dure depuis six ans.',
      'Le PDG promet de reverser une partie à une bonne cause : sa collection de parapluies.',
      'Calcul simple : les résultats baissent, le coefficient d’effort compense, le bonus s’envole.',
      'La direction assure que c’est le marché qui fixe le montant. Le marché nie en bloc.',
    ],
    dividends: [
      'Les actionnaires sabrent le champagne. Les salariés sabrent les budgets.',
      'Un dividende généreux, fruit d’une gestion rigoureuse et d’un sens aigu du hasard.',
      'Distribution record : le verre d’eau de la salle de réunion est officiellement à moitié plein.',
      'Les petits porteurs reçoivent de quoi s’offrir un timbre, pour écrire leur lettre de félicitations.',
      'Le dividende est « durable », assure la direction. Il dure en effet le temps d’un virement.',
      'Pluie de dividendes annoncée. Prévoir ciré, chaussons et modestie.',
    ],
    commodity: [
      'Le marché parle de « correction technique ». Personne n’a osé demander laquelle.',
      'Les analystes restent prudents : le cours pourrait monter, baisser, ou faire autre chose.',
      'Les spéculateurs se frottent les mains. Les industriels se frottent les yeux.',
      'Mouvement sain, selon les experts qui n’en possèdent pas.',
      'La volatilité est « maîtrisée », promet un trader en terminant son troisième expresso.',
      'Les carnets de commandes ont été consultés, puis recouverts d’un plaid.',
    ],
    sector: [
      'La demande progresse, annonce un communiqué relu par douze juristes.',
      'Le secteur se porte bien. Le secteur, lui, demande à voir.',
      'Tendance lourde : les consommateurs changent d’avis plus vite que les logos.',
      'Les professionnels parlent de « dynamisme retrouvé ». Retrouvé où, mystère.',
      'Croissance maîtrisée, décroissance contenue, stagnation assumée : le triptyque parfait.',
      'Le marché se restructure. C’est le mot poli pour dire que les chaises musicales ont repris.',
    ],
    tax: [
      'Contribution record : l’État remercie, avec le sourire de celui qui n’a rien demandé.',
      'La direction salue « un partenariat constructif » avec l’administration fiscale. Constructif pour elle.',
      'Le comptable a pleuré, mais des larmes déductibles.',
      'Montant rond, conscience tranquille : l’entreprise a payé, puis a demandé un reçu à encadrer.',
      'Le fisc confirme la réception et souscrit déjà à la prochaine émission.',
      'C’est la première ligne du bilan à être parfaitement remplie. Coïncidence ?',
    ],
    gap: [
      'L’écart se creuse, mais avec des pelles dorées, alors tout va bien.',
      'Le premier pourrait racheter le dernier. Il a demandé le prix, puis une réduction.',
      'Les statisticiens parlent de « dispersion ». Le dernier parle de « pente ».',
      'Entre le haut et le bas du classement, il y a désormais un musée.',
      'L’écart est « sain », selon le premier. Le dernier prépare sa réponse par courrier.',
      'Égalité des chances confirmée : tout le monde a eu sa chance, certains en ont eu plusieurs.',
    ],
    turns: [
      'C’est long, mais c’est moins cher que le coaching.',
      'La brochure précise « sous conditions ». Les conditions occupent 40 pages.',
      'Le compte à rebours est lancé. Les rêves aussi, dans l’autre sens.',
      'Assez pour tout construire. Ou tout expliquer, ce qui est déjà pas mal.',
      'Faites vos jeux : la fortune sourit aux audacieux, et parfois aux autres, par erreur.',
      'À la fin, une couronne. Elle est en chocolat, mais chut.',
    ],
  },

  // ---------------------------------------------------------------------------
  // Réclame : encart publicitaire « acheté » par l'entreprise la plus dépensière
  // en marketing. Templates : {product} obligatoire, {company} facultatif ;
  // mentions légales : aucun placeholder.
  // ---------------------------------------------------------------------------
  reclame: {
    templates: {
      energy_drinks: [
        { id: 'rec-energy-01', text: '{product} : 300 mg de caféine, 0 g de sommeil. Recommandé par 9 cardiologues sur 10 qui n’ont pas été consultés. {company}, l’énergie qui vous regarde dormir.' },
        { id: 'rec-energy-02', text: 'Vous n’êtes pas fatigué, vous manquez de {product}. Canette de 50 cl, nuit blanche de 72 h. Ne pas mélanger avec l’alcool, les médicaments ni une vie équilibrée.' },
        { id: 'rec-energy-03', text: '{product}, la boisson des champions, des stagiaires et des gens qui ont une présentation à 9 h. Goût fruit rouge, provenance inconnue.' },
        { id: 'rec-energy-04', text: 'Nouveau : {product} version « Zéro ». Zéro sucre, zéro calorie, zéro idée de ce qu’il y a dedans. {company} préfère parler d’énergie.' },
        { id: 'rec-energy-05', text: '{product} tient en une main et vous tient debout trois jours. Le cœur bat plus vite ; selon {company}, c’est de l’enthousiasme.' },
        { id: 'rec-energy-06', text: 'Buvez {product} avant la réunion. Vos collègues entendront enfin vos idées, toutes en même temps. Fabriqué avec de vrais ingrédients, dont certains naturels.' },
      ],
      gadgets: [
        { id: 'rec-gadgets-01', text: '{product}, le gadget qui fait tout, sauf la seule chose pour laquelle vous l’avez acheté. Garantie deux ans, batterie dix-huit mois. {company}.' },
        { id: 'rec-gadgets-02', text: 'Déjà 40 000 unités vendues et presque autant de notices en PDF. {product} se connecte à votre frigo, votre voiture et vos données. Surtout vos données.' },
        { id: 'rec-gadgets-03', text: '{product} est 30 % plus fin que le modèle précédent et 30 % plus cher que le prochain. {company} appelle ça l’innovation.' },
        { id: 'rec-gadgets-04', text: 'Offrez {product} à ceux que vous aimez. Ou à ceux que vous voulez voir chercher le bouton marche pendant un an.' },
        { id: 'rec-gadgets-05', text: '{product} : la version 2 corrige les défauts de la version 1 et en inaugure de nouveaux, très élégants. Disponible en gris, gris sidéral et gris.' },
        { id: 'rec-gadgets-06', text: 'Avec {product}, {company} réinvente l’objet du quotidien : il faut maintenant le charger. Câble vendu séparément, sens de la vie non inclus.' },
      ],
      scooters: [
        { id: 'rec-scooters-01', text: '{product}, par {company}. Enfin une trottinette qui freine. Parfois. Autonomie de 40 km ou 40 minutes, selon la pente et votre foi. Casque facultatif, testament conseillé.' },
        { id: 'rec-scooters-02', text: 'Avec {product}, le trottoir vous appartient. Les piétons aussi, apparemment. Pliable en trois secondes, dépliable en vingt.' },
        { id: 'rec-scooters-03', text: '{product} atteint 25 km/h en descente et 25 km/h dans le discours commercial. {company} garantit le reste jusqu’au premier nid-de-poule.' },
        { id: 'rec-scooters-04', text: 'Louez {product} dans toute la ville et retrouvez-la dans le canal. Application gratuite, remorquage en option.' },
        { id: 'rec-scooters-05', text: '{product} : 0 émission, 0 bruit, 0 chance de la retrouver demain. {company} rappelle que l’antivol est, lui aussi, en option.' },
        { id: 'rec-scooters-06', text: 'La trottinette {product} embarque un GPS, des clignotants et une sonnette que personne n’entend. Demain, c’est aujourd’hui, en plus rapide et sans assurance.' },
      ],
      yogurts: [
        { id: 'rec-yogurts-01', text: '{product} : le goût de la ferme, fabriqué à 400 m du périphérique. Lait de vaches ayant vu une photo de pré. {company} garantit l’absence de conservateurs ajoutés depuis mardi.' },
        { id: 'rec-yogurts-02', text: 'Nouveau {product} aux fruits : 2 % de fruits, 98 % de confiance. Idéal pour le petit-déjeuner, le dessert et les fins de mois difficiles.' },
        { id: 'rec-yogurts-03', text: '{product}, le yaourt des sportifs qui regardent le sport. Riche en protéines, en calcium et en promesses.' },
        { id: 'rec-yogurts-04', text: 'Nos vaches écoutent de la musique classique. Le résultat : {product}, un yaourt mélomane, à déguster avant la date, de préférence. {company}.' },
        { id: 'rec-yogurts-05', text: '{product} « nature » : rien dedans, tout dans le prix. Pot recyclable, couvercle qui éclabousse, tradition respectée.' },
        { id: 'rec-yogurts-06', text: 'Mangez {product} tous les jours : votre flore intestinale fera partie de notre communauté. Conditions sur l’opercule, en très petit.' },
      ],
      crypto: [
        { id: 'rec-crypto-01', text: '{product}. Ce n’est pas une monnaie, c’est une conviction. {company} vous la cède au cours du jour, qui change pendant que vous lisez cette phrase. Destination la Lune, aller simple.' },
        { id: 'rec-crypto-02', text: 'Investissez dans {product} : les rendements passés ne préjugent de rien, et les futurs non plus. Un jeton par citoyen, un citoyen par jeton.' },
        { id: 'rec-crypto-03', text: '{product} est décentralisé, sauf la décision de son cours, qui dépend d’un fil de discussion. {company} vous y invite.' },
        { id: 'rec-crypto-04', text: 'Grâce à {product}, votre argent travaille pendant que vous dormez. Il travaille loin, très loin, et n’écrit pas souvent.' },
        { id: 'rec-crypto-05', text: '{product} : zéro banque, zéro frais, zéro recours. Le livre blanc fait quatre pages, dont trois de logo.' },
        { id: 'rec-crypto-06', text: 'Encore sceptique devant {product} ? Vos voisins l’étaient aussi. Ils ont depuis déménagé, on ne sait pas où. {company}, la finance du futur, payable aujourd’hui.' },
      ],
    },
    legal: [
      { id: 'legal-01', text: '* Modèle présenté avec roues, vendues séparément.' },
      { id: 'legal-02', text: '* Les prés figurant sur l’emballage sont une vue d’artiste.' },
      { id: 'legal-03', text: '* Ne pas dépasser la dose prescrite. Il n’y a pas de dose prescrite.' },
      { id: 'legal-04', text: '* Photo non contractuelle. Produit non contractuel. Contrat non contractuel.' },
      { id: 'legal-05', text: '* Résultats obtenus par un figurant rémunéré, dans de bonnes conditions d’éclairage.' },
      { id: 'legal-06', text: '* Toute ressemblance avec un produit utile serait fortuite.' },
      { id: 'legal-07', text: '* Offre valable jusqu’à épuisement des stocks, des clients ou de la patience du service juridique.' },
      { id: 'legal-08', text: '* Testé en laboratoire. Le laboratoire ne souhaite pas être cité.' },
      { id: 'legal-09', text: '* Le fabricant décline toute responsabilité, et plusieurs appels.' },
      { id: 'legal-10', text: '* Les témoignages ont été recueillis auprès de salariés, sous serment et sous pression.' },
    ],
  },
};
