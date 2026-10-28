import type { TrophyDef, TrophyId } from '../../types';

/** Trophées de fin de partie (cf. docs/GAME_DESIGN.md §11) : un par TrophyId. */
export const TROPHIES: Record<TrophyId, TrophyDef> = {
  magnat: {
    id: 'magnat',
    emoji: '👑',
    title: 'Le Magnat',
    description: 'Plus grosse fortune en fin de partie. L’argent ne fait pas le bonheur, mais il fait le classement.',
  },
  pollueur: {
    id: 'pollueur',
    emoji: '🛢️',
    title: 'Le Grand Pollueur',
    description: 'Plus de pétrole englouti par la production. Les ours polaires ont brodé une banderole à votre nom.',
  },
  machiavel: {
    id: 'machiavel',
    emoji: '🐍',
    title: 'Machiavel du trimestre',
    description: 'Plus d’actions discutables. La fin justifiait les moyens, et les moyens étaient nombreux.',
  },
  parachute: {
    id: 'parachute',
    emoji: '🪂',
    title: 'Le Parachute doré',
    description: 'Plus gros total de parachutes dorés reçus. Viré avec les honneurs, et surtout avec le chèque.',
  },
  visionnaire: {
    id: 'visionnaire',
    emoji: '🔭',
    title: 'Le Visionnaire',
    description: 'Plus de R&D dépensée. A inventé l’avenir, puis a oublié de le vendre.',
  },
  marketeux: {
    id: 'marketeux',
    emoji: '📣',
    title: 'Le Roi du buzz',
    description: 'Plus de marketing dépensé. Le produit était moyen, mais quelle affiche !',
  },
  predateur: {
    id: 'predateur',
    emoji: '🦈',
    title: 'Le Requin',
    description: 'Plus de prises de contrôle réussies. Ne dit jamais « bonjour », seulement « combien ? ».',
  },
  proie: {
    id: 'proie',
    emoji: '🐟',
    title: 'La Proie idéale',
    description: 'Plus de prises de contrôle subies. Toujours le dernier à savoir qui est le patron.',
  },
  casserole: {
    id: 'casserole',
    emoji: '🍳',
    title: 'La Batterie de casseroles',
    description: 'Plus de scandales. Les rédactions ont un dossier à votre nom. Et une étagère.',
  },
  fisc: {
    id: 'fisc',
    emoji: '⚖️',
    title: 'Mécène du Trésor public',
    description: 'Plus d’amendes payées. Le ministère des Finances envisage de donner votre nom à une aile du bâtiment.',
  },
  naufrage: {
    id: 'naufrage',
    emoji: '🚢',
    title: 'Le Naufrage',
    description: 'Plus grosse perte de fortune en un seul trimestre. L’orchestre a joué jusqu’au bout.',
  },
  rentier: {
    id: 'rentier',
    emoji: '🛋️',
    title: 'Le Rentier',
    description: 'Plus de dividendes reçus. A travaillé dur… à ouvrir son courrier.',
  },
  serial: {
    id: 'serial',
    emoji: '🔁',
    title: 'Serial entrepreneur',
    description: 'Plus de startups fondées. Une idée par trimestre, une subvention par idée.',
  },
  bonus: {
    id: 'bonus',
    emoji: '💰',
    title: 'Le Bonus bien mérité',
    description: 'Plus de bonus de PDG encaissés. Toujours le premier à féliciter la direction, c’est-à-dire soi-même.',
  },
};
