import { useEffect, useState } from 'react';

/**
 * Vrai tant que la requête média correspond à la fenêtre. Sans `window`/`matchMedia` (rendu jsdom des tests),
 * vrai par défaut : le rendu statique suit alors la mise en page « ordinateur ».
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}
