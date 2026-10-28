/**
 * La carte (bêta) : éléments SVG utilisables au clavier et au lecteur d'écran, animations en pause hors écran.
 */
import { useEffect, useState, type KeyboardEvent } from 'react';

/** Props d'un élément SVG (ou HTML) cliquable : rôle bouton, focus clavier, Entrée et Espace. */
export function pressable(label: string, onPress: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: onPress,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPress();
      }
    },
  };
}

/**
 * Vrai tant que l'élément est (presque) visible : un quartier hors de l'écran se fige.
 * Sans IntersectionObserver (rendu serveur, vieux navigateurs), l'élément est considéré visible.
 */
export function useInView<T extends Element>(): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return [setEl, visible];
}
