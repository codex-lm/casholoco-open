import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Variante « carte » : encore plus large (sélecteurs avec la carte du pays), implique `wide`. */
  size?: 'map';
}

/**
 * Fenêtres ouvertes, de la plus ancienne à la plus récente. Seule la dernière (celle du dessus) répond à Échap
 * et garde le focus clavier : une fenêtre ouverte depuis une autre (réglages depuis une fiche produit) se ferme
 * seule, sans emporter celle du dessous.
 */
interface OpenModal {
  el: HTMLElement;
  close: () => void;
}
const stack: OpenModal[] = [];
let previousBodyOverflow = '';
let previousBodyPadding = '';

/** Closing a nested dialog must not unlock the page behind the remaining modal. */
function lockPage() {
  previousBodyOverflow = document.body.style.overflow;
  previousBodyPadding = document.body.style.paddingRight;
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
  document.body.style.overflow = 'hidden';
}

function unlockPage() {
  document.body.style.overflow = previousBodyOverflow;
  document.body.style.paddingRight = previousBodyPadding;
}

/** Éléments atteignables avec Tab (les éléments masqués, dans un <details> fermé par exemple, n'ont pas de boîte). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}

/** Un seul écouteur pour toutes les fenêtres : Échap ferme celle du dessus, Tab tourne en boucle à l'intérieur. */
function onKey(e: KeyboardEvent) {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    top.close();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = focusables(top.el);
  const active = document.activeElement;
  if (items.length === 0) {
    e.preventDefault();
    top.el.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  // Focus sorti de la fenêtre (clic sur la page derrière, élément retiré) : on le ramène au bord voulu.
  if (!(active instanceof Node) || !top.el.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && (active === first || active === top.el)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

export function Modal({ title, onClose, children, wide, size }: Props) {
  const t = useT();
  const dialog = useRef<HTMLDivElement>(null);
  // Dernière version de onClose (souvent une flèche recréée à chaque rendu) : l'écouteur, lui, ne change pas.
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  // Focus au premier rendu : l'élément qui a ouvert la fenêtre, avant qu'un champ autoFocus ne le prenne.
  const [renderFocus] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    // Qui a ouvert la fenêtre : l'élément actif maintenant (une fiche remplacée par une autre vient de lui rendre
    // le focus), sauf si un champ de la fenêtre l'a déjà pris.
    const opener = el.contains(document.activeElement) ? renderFocus : document.activeElement;
    const entry: OpenModal = { el, close: () => closeRef.current() };
    stack.push(entry);
    if (stack.length === 1) {
      lockPage();
      window.addEventListener('keydown', onKey);
    }
    // Le focus entre dans la fenêtre (sauf si un champ l'a déjà pris) : le lecteur d'écran annonce son titre,
    // et Tab part du haut de la fiche plutôt que du bâtiment resté derrière le voile.
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) {
        window.removeEventListener('keydown', onKey);
        unlockPage();
      }
      // Retour au bouton (ou au bâtiment) qui a ouvert la fenêtre, s'il est encore là.
      if ((opener instanceof HTMLElement || opener instanceof SVGElement) && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, [renderFocus]);

  const tree = (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        className={`modal${wide || size === 'map' ? ' wide' : ''}${size === 'map' ? ' map' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // La fenêtre elle-même reçoit le focus à l'ouverture : pas d'anneau autour de toute la fiche.
        style={{ outline: 'none' }}
      >
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label={t.common.close}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
  // Portail sur <body> : ouverte depuis le panneau latéral collant d'une carte (z-index sous la barre
  // du haut), la fenêtre doit recouvrir toute la page. Le repli sans DOM sert le rendu serveur des tests.
  return typeof document === 'undefined' ? tree : createPortal(tree, document.body);
}

/**
 * Confirmation simple (actions irréversibles). `secondary` ajoute, en tête, une autre issue que l'annulation
 * (« Voir » : aller régler le problème) ; la fenêtre se ferme avant.
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  secondary,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  secondary?: { label: string; onClick: () => void };
}) {
  const t = useT();
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        <div>{message}</div>
        <div className="row end">
          {secondary && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                onClose();
                secondary.onClick();
              }}
            >
              {secondary.label}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
