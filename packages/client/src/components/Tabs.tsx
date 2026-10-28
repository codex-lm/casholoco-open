import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useT } from '../i18n';
import { usePublishedHeight } from '../hooks/usePublishedHeight';

export interface TabDef<K extends string> {
  id: K;
  label: ReactNode;
  /** Pastille : `true` pour « nouveau », ou ce qu'elle signale. */
  badge?: boolean | string;
}

interface Props<K extends string> {
  tabs: TabDef<K>[];
  active: K;
  onChange: (id: K) => void;
  /** Nom de la liste d'onglets pour les lecteurs d'écran. */
  ariaLabel?: string;
  /** Barre de la partie : collée sous la barre du jeu, sa hauteur publiée en `--tabs-h` (0 quand elle ne colle pas). */
  sticky?: boolean;
  idPrefix?: string;
  panelId?: string;
}

export function Tabs<K extends string>({ tabs, active, onChange, ariaLabel, sticky = false, idPrefix, panelId }: Props<K>) {
  const newLabel = useT().common.newBadge;
  const generatedId = useId();
  const prefix = idPrefix ?? generatedId;
  const ref = useRef<HTMLElement>(null);
  usePublishedHeight(ref, sticky ? '--tabs-h' : null, true);
  useLayoutEffect(() => {
    const nav = ref.current;
    const selected = nav?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!nav || !selected || nav.scrollWidth <= nav.clientWidth) return;
    const bounds = nav.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    // Reveal horizontal keyboard/programmatic navigation without changing the page's saved scroll position.
    if (item.right > bounds.right) nav.scrollLeft += item.right - bounds.right;
    else if (item.left < bounds.left) nav.scrollLeft -= bounds.left - item.left;
  }, [active]);
  return (
    <nav ref={ref} className={sticky ? 'tabs tabs-sticky' : 'tabs'} role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${prefix}-${t.id}`}
          aria-controls={panelId}
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          className={`tab${t.id === active ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
          onKeyDown={(event) => {
            const index = tabs.findIndex((item) => item.id === t.id);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
              : event.key === 'ArrowRight' ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
            if (next < 0) return;
            event.preventDefault();
            ref.current?.querySelector<HTMLButtonElement>(`[id="${prefix}-${tabs[next].id}"]`)?.focus({ preventScroll: true });
            onChange(tabs[next].id);
          }}
        >
          {t.label}
          {t.badge && <span className="tab-badge" aria-label={typeof t.badge === 'string' ? t.badge : newLabel} title={typeof t.badge === 'string' ? t.badge : undefined} />}
        </button>
      ))}
    </nav>
  );
}
