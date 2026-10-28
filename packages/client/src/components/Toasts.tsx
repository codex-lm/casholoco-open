import { dismissToast, useApp } from '../store';

const ICONS = { good: '✓', bad: '✗', info: '📰', drama: '⚠' } as const;

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast toast-${t.kind}`} onClick={() => dismissToast(t.id)}>
          <span className="toast-icon" aria-hidden>
            {ICONS[t.kind]}
          </span>
          <span>
            {t.title && <strong className="toast-title">{t.title}</strong>}
            {t.message}
          </span>
        </button>
      ))}
    </div>
  );
}
