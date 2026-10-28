/**
 * Langue de l'interface au démarrage : ?lang= dans l'URL, sinon le choix mémorisé
 * (localStorage 'muchomoney:lang'), sinon la langue du navigateur (fr* → français, sinon anglais).
 * Sans dépendance au store (importé par lui).
 */
import type { Lang } from '@muchomoney/core';

export const LANG_KEY = 'muchomoney:lang';

export function isLang(v: unknown): v is Lang {
  return v === 'fr' || v === 'en';
}

/** Langue d'après navigator.language : 'fr…' → fr, tout le reste → en. */
export function langFromNavigator(language: string | undefined | null): Lang {
  return (language ?? '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function loadLang(): Lang | null {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* navigation privée stricte */
  }
}

function langFromUrl(): Lang | null {
  try {
    const v = new URLSearchParams(window.location.search).get('lang');
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function detectLang(): Lang {
  if (typeof window === 'undefined') return 'fr';
  const url = langFromUrl();
  if (url) return url;
  const saved = loadLang();
  if (saved) return saved;
  try {
    return langFromNavigator(window.navigator?.language);
  } catch {
    return 'fr';
  }
}
