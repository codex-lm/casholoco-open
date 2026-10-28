import { useLayoutEffect, type RefObject } from 'react';

/**
 * Publie la hauteur réelle d'une barre collante dans une variable CSS de la page (`--topbar-h`, `--tabs-h`) : les
 * colonnes collantes, les marges de défilement et l'arrivée sur la carte se calent dessous. `onlyWhenSticky` publie
 * 0 quand la barre ne colle pas (onglets en grille sur téléphone) : elle ne cache alors rien. Sans variable, rien.
 */
export function usePublishedHeight(ref: RefObject<HTMLElement | null>, variable: string | null, onlyWhenSticky = false): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!variable || !el || typeof document === 'undefined' || typeof window === 'undefined') return;
    const root = document.documentElement;
    const set = () => {
      const sticky = !onlyWhenSticky || window.getComputedStyle(el).position === 'sticky';
      root.style.setProperty(variable, `${sticky ? Math.ceil(el.getBoundingClientRect().height) : 0}px`);
    };
    set();
    // Passer sous 700 px change la mise en page (et la position collante) sans forcément changer la taille.
    window.addEventListener('resize', set);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', set);
      root.style.removeProperty(variable);
    };
  }, [ref, variable, onlyWhenSticky]);
}
