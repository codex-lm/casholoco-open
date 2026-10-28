import type { Lang } from '@muchomoney/core';

const plural = (n: number, one: string, other: string): string => (Math.abs(n) < 2 ? one : other);

/**
 * Colonne de gauche du plateau (dès 1200 px) : « Mes usines » (la carte du produit suivi et une ligne par autre
 * produit), les emplacements libres, les plis et le repli de la colonne. Les montants arrivent déjà formatés ; une case
 * est nommée par son identifiant (« D5 »), son nom complet est dans l'infobulle.
 */
const fr = {
  // En-tête : l'entreprise aux manettes, sa trésorerie et ce que ses mises en attente en réservent déjà.
  committed: (amount: string) => `dont ${amount} engagés en mises`,
  // Repli de la colonne (seulement au-delà du zoom 1 : le plateau prend alors la place).
  foldSide: 'Replier vos usines et les outils du plateau',
  reopenSide: 'Vos usines et outils ›',
  reopenSideAria: 'Rouvrir vos usines et les outils du plateau',
  /** Infobulle de la petite clé des couleurs qui reste sur la colonne repliée. */
  stripKey: (lens: string, reference: string) => `Couleurs : ${lens}, chiffrées pour ${reference}`,
  heading: 'Mes usines',
  hidePicture: 'Masquer l’image',
  showPicture: 'Montrer l’image',
  track: (name: string, status: string) => `Suivre ${name} (${status})`,
  margin: (amount: string) => `marge ${amount}`,
  /** Verdict court de la carte ; la phrase entière de « Mes usines » est dans son infobulle. */
  verdict: {
    shortage: (lots: string) => `≈ ${lots} de demande non servie`,
    surplus: (lots: string, lost: string) => `≈ ${lots} invendus, dont ${lost} perdus`,
    balanced: (lots: string) => `≈ ${lots} vendus, pile ce qu’il faut`,
    building: (date: string) => `Ouvre en ${date}`,
    idle: 'À l’arrêt : rien à vendre',
    unknown: 'Plus d’estimation : la partie est jouée.',
  },
  madeStock: (made: string, stock: string) => `≈ ${made} produits, ${stock} en stock`,
  showPlant: (place: string) => `Montrer l’usine sur le plateau : ${place}`,
  // La ligne de décision de la carte, le premier cas qui s'applique.
  better: (gain: string, cell: string, n: number) => `Ailleurs, remboursable à temps : ${gain}/trim. à ${cell}, en ~${n} trim.`,
  betterPerks: (gain: string, cell: string, n: number) => `Ailleurs, remboursable à temps : ${gain}/trim. à ${cell}, en ~${n} trim. hors privilèges`,
  lateAlso: (cell: string, gain: string) => `(${cell} ferait ${gain}/trim. mais trop tard)`,
  late: (gain: string, cell: string) => `Mieux ailleurs (${gain}/trim. à ${cell}), mais trop tard pour rembourser.`,
  none: 'Rien de mieux ailleurs pour l’instant.',
  bid: (kind: string, cell: string, amount: string) => `${kind} · ${cell} · mise ${amount}`,
  bidFees: (kind: string, cell: string, amount: string, fees: string) => `${kind} · ${cell} · mise ${amount} + frais ${fees}`,
  bidBeaten: (cell: string, gain: string) => `(${cell} ferait ${gain}/trim. de mieux)`,
  // Start-up à l'incubateur : rester n'est pas une option, la carte dit où s'installer et ce qui arrive sinon.
  settle: (gain: string, cell: string, reserve: string) => `Où vous installer : ${cell}, ${gain}/trim. de mieux qu’à l’incubateur (mise à prix ${reserve})`,
  deadlineNow: 'Sans case gagnée à cette clôture, l’État vous case d’office au plus près de la capitale, à sa mise à prix.',
  /** The probable cell (rival bids at the close may still take it), its reserve and the margin the plant would make there. */
  deadlineNowAt: (cell: string, reserve: string, margin: string | null) =>
    `Sans case gagnée à cette clôture, l’État vous case d’office au plus près de la capitale : sans doute ${cell}, mise à prix ${reserve}${margin === null ? '' : `, marge ≈ ${margin}/trim.`}.`,
  deadlineLater: (date: string) => `Sans case gagnée d’ici la clôture de ${date}, l’État vous case d’office au plus près de la capitale.`,
  fallbackNearest: (cell: string) => `Si la mise échoue : case libre la plus proche de ${cell}`,
  fallbackAbandon: (date: string) => `Si la mise échoue : reste à l’incubateur jusqu’à la clôture de ${date}`,
  lastClose: (what: string) => `Dernière clôture : ${what}`,
  // Lignes des autres produits.
  elsewhere: (gain: string) => `↗ ${gain} ailleurs`,
  elsewhereTitle: (gain: string) => `Une case libre ferait ${gain}/trim. de mieux`,
  noProduct: 'Aucune usine en service : tout reste à construire.',
  // Sous les cartes.
  launchLine: (n: number) => `Emplacements libres : ${n} · choisir où lancer ›`,
  bestLaunch: (sector: string, cell: string) => `Meilleure marge pour ${sector} : ${cell} ›`,
  // Plis.
  /** L'entrée neutre du pli : le gisement (ou la filiale) de la matière la plus demandée. */
  depositEntry: (cell: string, commodity: string) => `Gisement ${/^[aeiouyhàâéèêîïôû]/i.test(commodity) ? 'd’' : 'de '}${commodity.toLowerCase()} (${cell})`,
  depositsSummary: (title: string, subsidiaries: number, bids: number) => [title,
    subsidiaries > 0 ? `${subsidiaries} ${plural(subsidiaries, 'filiale', 'filiales')}` : null,
    bids > 0 ? `${bids} ${plural(bids, 'mise', 'mises')}` : null].filter(Boolean).join(' · '),
};

const en: typeof fr = {
  committed: (amount) => `${amount} committed to bids`,
  foldSide: 'Collapse your factories and the board tools',
  reopenSide: 'Factories & tools ›',
  reopenSideAria: 'Reopen your factories and the board tools',
  stripKey: (lens, reference) => `Colors: ${lens}, figured for ${reference}`,
  heading: 'My factories',
  hidePicture: 'Hide the picture',
  showPicture: 'Show the picture',
  track: (name, status) => `Track ${name} (${status})`,
  margin: (amount) => `margin ${amount}`,
  verdict: {
    shortage: (lots) => `≈ ${lots} of demand left unserved`,
    surplus: (lots, lost) => `≈ ${lots} unsold, ${lost} of them spoiled`,
    balanced: (lots) => `≈ ${lots} sold, right on the money`,
    building: (date) => `Opens in ${date}`,
    idle: 'Idle: nothing to sell',
    unknown: 'No estimate: the game is over.',
  },
  madeStock: (made, stock) => `≈ ${made} made, ${stock} in stock`,
  showPlant: (place) => `Show the factory on the board: ${place}`,
  better: (gain, cell, n) => `Elsewhere, paying back in time: ${gain}/qtr at ${cell}, in ~${n} ${n === 1 ? 'qtr' : 'qtrs'}`,
  betterPerks: (gain, cell, n) => `Elsewhere, paying back in time: ${gain}/qtr at ${cell}, in ~${n} ${n === 1 ? 'qtr' : 'qtrs'}, perks aside`,
  lateAlso: (cell, gain) => `(${cell} would do ${gain}/qtr, but too late)`,
  late: (gain, cell) => `Better elsewhere (${gain}/qtr at ${cell}), but too late to pay back.`,
  none: 'Nowhere better, for now.',
  bid: (kind, cell, amount) => `${kind} · ${cell} · bid ${amount}`,
  bidFees: (kind, cell, amount, fees) => `${kind} · ${cell} · bid ${amount} + fees ${fees}`,
  bidBeaten: (cell, gain) => `(${cell} would do ${gain}/qtr better)`,
  settle: (gain, cell, reserve) => `Where to settle: ${cell}, ${gain}/qtr over the incubator (${reserve} reserve)`,
  deadlineNow: 'Win no cell at this close and the State boxes you in next to the capital, at its reserve price.',
  deadlineNowAt: (cell, reserve, margin) =>
    `Win no cell at this close and the State boxes you in next to the capital: probably ${cell}, ${reserve} reserve${margin === null ? '' : `, margin ≈ ${margin}/qtr`}.`,
  deadlineLater: (date) => `Win no cell by the ${date} close and the State boxes you in next to the capital.`,
  fallbackNearest: (cell) => `If the bid fails: the nearest free cell to ${cell}`,
  fallbackAbandon: (date) => `If the bid fails: back to the incubator until the ${date} close`,
  lastClose: (what) => `Last close: ${what}`,
  elsewhere: (gain) => `↗ ${gain} elsewhere`,
  elsewhereTitle: (gain) => `A free cell would do ${gain}/qtr better`,
  noProduct: 'No factory running yet: it is all still on paper.',
  launchLine: (n) => `${n} free ${n === 1 ? 'slot' : 'slots'} · pick where to launch ›`,
  bestLaunch: (sector, cell) => `Best margin for ${sector}: ${cell} ›`,
  depositEntry: (cell, commodity) => `${commodity} deposit (${cell})`,
  depositsSummary: (title, subsidiaries, bids) => [title,
    subsidiaries > 0 ? `${subsidiaries} ${subsidiaries === 1 ? 'subsidiary' : 'subsidiaries'}` : null,
    bids > 0 ? `${bids} ${bids === 1 ? 'bid' : 'bids'}` : null].filter(Boolean).join(' · '),
};

export const mapSideMessages = (lang: Lang) => lang === 'en' ? en : fr;
