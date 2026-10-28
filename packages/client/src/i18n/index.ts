/**
 * i18n maison, sans dépendance.
 *  - Langue de l'INTERFACE (par joueur) : AppState.lang, libellés via useT() / t().
 *  - Langue du SALON (lobby.config.lang / view.config.lang, 'fr' par défaut) : montants, dates
 *    et contenu généré par le moteur, voir fmt.ts et useRoomLang().
 */
import { getContent, type ContentBundle, type Lang } from '@muchomoney/core';
import { getState, setState, useApp, type AppState } from '../store';
import { saveLang } from './detect';
import { fr, type Messages } from './fr';
import { en } from './en';

export type { Messages } from './fr';
export { fr } from './fr';
export { en } from './en';

const MESSAGES: Record<Lang, Messages> = { fr, en };

export function messages(lang: Lang | undefined): Messages {
  return MESSAGES[lang === 'en' ? 'en' : 'fr'];
}

/** Textes de l'interface, hors composant React (api.ts, notifications…). */
export function t(): Messages {
  return messages(getState().lang);
}

/** Textes de l'interface dans la langue du joueur (re-rendu au changement). */
export function useT(): Messages {
  return messages(useApp((s) => s.lang));
}

export function useUiLang(): Lang {
  return useApp((s) => s.lang);
}

/** Langue du salon (partie en cours ou salon d'attente), 'fr' par défaut. */
export function roomLangOf(s: Pick<AppState, 'view' | 'lobby'>): Lang {
  return s.view?.config.lang ?? s.lobby?.config.lang ?? 'fr';
}

export function useRoomLang(): Lang {
  return useApp(roomLangOf);
}

/** Contenu (noms de secteurs, matières, trophées…) dans la langue de l'interface, pour les libellés. */
export function useContent(): ContentBundle {
  return getContent(useUiLang());
}

/** Contenu dans la langue du salon (idées de noms d'entreprise et de produit). */
export function useRoomContent(): ContentBundle {
  return getContent(useRoomLang());
}

/** Met à jour <html lang>, le titre et la description de la page. */
export function applyDocumentLang(lang: Lang): void {
  if (typeof document === 'undefined') return;
  const m = messages(lang);
  document.documentElement.lang = lang;
  document.title = m.meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', m.meta.description);
}

/** Change la langue de l'interface (mémorisée). L'envoi au serveur est fait par api.ts (changeLang). */
export function setUiLang(lang: Lang): void {
  saveLang(lang);
  if (getState().lang !== lang) setState({ lang });
  applyDocumentLang(lang);
}
