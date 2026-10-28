import { useLayoutEffect, useState } from 'react';

/**
 * Largeur (px) d'un élément, suivie par ResizeObserver.
 * Renvoie un ref-callback : l'élément observé peut changer d'un rendu à l'autre.
 */
export function useElementWidth<T extends HTMLElement>(fallback = 600) {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.round(w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}
