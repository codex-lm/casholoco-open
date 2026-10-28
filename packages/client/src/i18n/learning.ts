import { IS_PEER } from '../edition';
import type { Lang } from '@muchomoney/core';
import type { GuidedStepId } from '../tutorial';
import { useUiLang } from './index';

/** Ce que le raccourci « Première partie guidée » prépare dans le salon. */
export type GuidedSetupPart = 'rules' | 'sector' | 'bots';

interface StepText {
  label: string;
  /** Texte d'aide ; une fonction reçoit la majoration des achats d'urgence (« 10 % »). */
  hint: string | ((premium: string) => string);
  /** Libellé du bouton : la destination (onglet ou élément de l'écran). */
  go: string;
}

export interface LearningMessages {
  create: string;
  creating: string;
  preset: string;
  preparing: string;
  lobby: string;
  /** Un seul toast quand une partie du salon guidé n'a pas pu être préparée. */
  setupFailed: (parts: readonly GuidedSetupPart[], botsMissing: number) => string;
  title: (turn: number) => string;
  intro: (turn: number) => string;
  show: string;
  compared: string;
  forecast: string;
  actual: string;
  product: string;
  noForecast: string;
  forecastNote: string;
  allDone: string;
  steps: Record<GuidedStepId, StepText>;
}

/** « a », « a et b », « a, b et c » (ou « and »). */
function listOf(items: readonly string[], and: string): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

const fr: LearningMessages = {
  create: 'Première partie guidée',
  creating: 'Préparation…',
  preset: 'Huit trimestres sans chrono, la carte classique et deux bots stagiaires comme sparring-partners. Vous lancez quand bon vous semble.',
  preparing: 'Préparation de la partie guidée… on installe les stagiaires.',
  lobby: 'Partie guidée : le guide vous tiendra la main pendant les deux premiers trimestres. Les réglages restent les vôtres : changez secteur ou règles si le cœur vous en dit, puis lancez.',
  setupFailed: (parts, botsMissing) => {
    const names = parts.map((part) =>
      part === 'rules' ? 'les règles (8 trimestres, sans chrono, carte classique, niveau stagiaire)'
        : part === 'sector' ? 'le secteur des boissons énergisantes'
          : botsMissing >= 2 ? 'les deux bots stagiaires' : 'le second bot stagiaire');
    return `Partie guidée montée à moitié : impossible de préparer ${listOf(names, 'et')}. Le salon est ouvert et le guide activé ; finissez les réglages à la main avant de lancer.`;
  },
  title: (turn) => turn <= 1 ? 'Première partie · trimestre 1' : 'Première partie · l’heure des comptes',
  intro: (turn) => turn <= 1
    ? 'Suivez ces étapes à votre rythme. Le guide reprend au trimestre 2 ; fermé, il attend sagement dans l’aide « ? ».'
    : 'Les ventes réelles n’ont pas lu vos prévisions. Rappel utile : votre fortune perso et la trésorerie de l’entreprise sont deux caisses séparées, et le classement ne regarde que la première.',
  show: 'Rouvrir le guide',
  compared: 'J’ai comparé',
  forecast: 'Prévision T1 (lots)',
  actual: 'Ventes réelles T1 (lots)',
  product: 'Produit',
  noForecast: 'Ce navigateur n’a pas gardé la prévision du T1 (elle n’a pas survécu au trimestre, comme beaucoup de prévisions). Les ventes réelles figurent dans le dernier rapport de votre entreprise.',
  forecastNote: 'Prévision enregistrée lors de vos derniers réglages du T1, calculée avec les prix passés des rivaux : s’ils ont changé d’avis entre-temps, elle n’en savait rien.',
  allDone: 'Repères acquis : vous voilà presque requin. Le guide prend sa retraite ; l’aide « ? » le garde au chaud.',
  steps: {
    journal: {
      label: 'Lire la une du Capital Quotidien',
      hint: 'Repérez la nouvelle qui peut toucher vos clients ou vos coûts. Les rumeurs aussi : elles sont parfois vraies, c’est tout le problème.',
      go: 'Ouvrir le journal',
    },
    factories: {
      label: 'Visiter votre usine',
      hint: 'Dans « Mon entreprise », « Atelier » montre chaque produit en images : stock, production, clients et réglages. Casque de chantier facultatif.',
      go: 'Atelier',
    },
    comparison: {
      label: 'Comparer l’offre et la demande',
      hint: 'Offre = stock + production prévue. Si elle dépasse la demande estimée, le surplus vous reste sur les bras (et certains produits, le yaourt en tête, tournent vite). Jetez aussi un œil à la marge estimée.',
      go: 'Atelier',
    },
    decisions: {
      label: 'Changer un réglage',
      hint: 'Bouton « Réglages » d’un produit : changez prix ou quantité d’après ce que vous avez vu. C’est enregistré dès que vous lâchez le curseur (« Enregistré ✓ ») : pas de bouton à oublier. Vous pouvez changer d’avis jusqu’à la clôture, où tout se joue.',
      go: 'Atelier',
    },
    commodities: {
      label: 'Vérifier les matières premières',
      hint: (premium) => `Acheter n’est pas obligatoire : ce qui manque sera acheté d’urgence à la clôture, ${premium} plus cher. Le fournisseur vous remercie d’avance.`,
      go: 'Matières',
    },
    ready: {
      label: 'Cliquer « Je suis prêt »',
      hint: IS_PEER ? 'Le trimestre se clôt quand tous les joueurs humains connectés sont prêts. Avant cette clôture, vous pouvez encore modifier vos décisions.' : 'Votre clic sur « Je suis prêt » clôture le trimestre et fait jouer les bots. Prenez le temps de vérifier vos décisions avant de cliquer.',
      go: 'Où ça ?',
    },
    recap: {
      label: 'Lire le bilan de clôture',
      hint: 'En haut de l’écran : votre fortune arrêtée à la clôture et les faits marquants du trimestre, avant que la Bourse ne reparte dans tous les sens.',
      go: 'Voir le bilan',
    },
    review: {
      label: 'Comparer prévision et ventes réelles',
      hint: 'Les deux colonnes ci-dessous. L’écart vient des nouvelles et des décisions des rivaux : une prévision n’est qu’une opinion en costume-cravate.',
      go: 'Atelier',
    },
    adjustment: {
      label: 'Ajuster la production',
      hint: 'Dans « Atelier », regardez le stock restant et la nouvelle demande, puis changez la quantité produite (enregistrée dès que vous lâchez le curseur). Toucher au prix seul ne compte pas : on parle bien de production.',
      go: 'Atelier',
    },
    stocks: {
      label: 'Jeter un œil à la Bourse',
      hint: 'Les actions s’achètent avec votre argent perso, pas avec celui de l’entreprise (la nuance passionne les juges). Regarder suffit : aucun ordre n’est exigé.',
      go: 'Bourse',
    },
    launchIntro: {
      label: 'Découvrir le lancement d’un produit',
      hint: 'Sur « La carte », la fiche d’une zone propose « Lancer ici » — celle d’une case du plateau, « Y lancer un produit » : un lancement se paie avec la trésorerie de l’entreprise, et le nouveau produit ne vend qu’à partir du trimestre suivant. Regarder ne coûte rien, c’est même la seule chose gratuite ici.',
      go: 'La carte',
    },
  },
};

const en: LearningMessages = {
  create: 'Guided first game',
  creating: 'Setting up…',
  preset: 'Eight quarters, no clock, the classic map and two intern bots as sparring partners. You start whenever you like.',
  preparing: 'Setting up your guided game… onboarding the interns.',
  lobby: 'Guided game: the guide will hold your hand for the first two quarters. The settings are still yours: change the sector or the rules if you fancy, then start.',
  setupFailed: (parts, botsMissing) => {
    const names = parts.map((part) =>
      part === 'rules' ? 'the rules (8 quarters, no clock, classic map, intern level)'
        : part === 'sector' ? 'the energy drink sector'
          : botsMissing >= 2 ? 'the two intern bots' : 'the second intern bot');
    return `Guided game half-assembled: couldn’t set up ${listOf(names, 'and')}. The room is open and the guide is on; finish the settings by hand before you start.`;
  },
  title: (turn) => turn <= 1 ? 'First game · quarter 1' : 'First game · facing the numbers',
  intro: (turn) => turn <= 1
    ? 'Take these steps at your own pace. The guide picks up again in quarter 2; close it and it waits patiently under “?”.'
    : 'Actual sales did not read your forecast. Worth remembering: your personal net worth and your company’s cash are separate wallets, and the leaderboard only counts the first.',
  show: 'Reopen the guide',
  compared: 'Done comparing',
  forecast: 'Q1 forecast (lots)',
  actual: 'Q1 actual sales (lots)',
  product: 'Product',
  noForecast: 'This browser didn’t keep the Q1 forecast (it didn’t survive the quarter; few forecasts do). Actual sales are in your company’s latest report.',
  forecastNote: 'Forecast saved from your last Q1 settings, using rivals’ previous prices. If they changed their minds since, the forecast never got the memo.',
  allDone: 'You’ve got the basics: practically a shark already. The guide is retiring; the “?” help keeps it on file.',
  steps: {
    journal: {
      label: 'Read the front page of The Daily Capital',
      hint: 'Spot the story that could hit your customers or your costs. Rumors too: sometimes they’re true, which is the whole problem.',
      go: 'Open the paper',
    },
    factories: {
      label: 'Tour your factory',
      hint: 'In “My company”, “Workshop” shows each product in pictures: inventory, output, customers and settings. Hard hat optional.',
      go: 'Workshop',
    },
    comparison: {
      label: 'Compare supply and demand',
      hint: 'Supply = inventory + planned output. If it beats estimated demand, you’re stuck with the surplus (and some products, yogurt for one, go off fast). Check the estimated margin too.',
      go: 'Workshop',
    },
    decisions: {
      label: 'Change a setting',
      hint: 'A product’s “Settings” button: change price or output based on what you just saw. It saves the moment you let go of the slider (“Saved ✓”), so there’s no button to forget. Flip-flop all you like until the close, when everything plays out.',
      go: 'Workshop',
    },
    commodities: {
      label: 'Check your commodity needs',
      hint: (premium) => `Buying is optional: whatever’s missing gets panic-bought at the close, ${premium} pricier. Your supplier thanks you in advance.`,
      go: 'Commodities',
    },
    ready: {
      label: 'Click “I’m ready”',
      hint: IS_PEER ? 'The quarter closes when all connected human players are ready. You can still adjust your decisions until that close.' : 'Choosing “I’m ready” closes the quarter and lets the bots play. Take your time to check your decisions before clicking.',
      go: 'Where?',
    },
    recap: {
      label: 'Read the quarter-close recap',
      hint: 'At the top of the screen: your net worth as of the close and the quarter’s highlights, before the market starts lurching again.',
      go: 'Show the recap',
    },
    review: {
      label: 'Compare forecast with actual sales',
      hint: 'The two columns below. The gap comes from the news and your rivals’ decisions: a forecast is just an opinion wearing a tie.',
      go: 'Workshop',
    },
    adjustment: {
      label: 'Adjust your output',
      hint: 'In “Workshop”, check remaining inventory and the new demand, then change the quantity produced (it saves the moment you let go of the slider). A price tweak alone doesn’t count: we said output.',
      go: 'Workshop',
    },
    stocks: {
      label: 'Take a peek at the stock market',
      hint: 'Shares are bought with your personal cash, not the company’s (a distinction regulators find fascinating). Looking is enough: no order required.',
      go: 'Stocks',
    },
    launchIntro: {
      label: 'Explore launching a product',
      hint: 'On “The map”, a zone’s sheet offers “Launch here” — a board cell’s sheet, “Launch a product here”: a launch is paid from company cash, and the new product only sells from the following quarter. Looking costs nothing, which makes it the only free thing around here.',
      go: 'The map',
    },
  },
};

export function learningMessages(lang: Lang): LearningMessages {
  return lang === 'en' ? en : fr;
}

export function useLearning(): LearningMessages {
  return learningMessages(useUiLang());
}
