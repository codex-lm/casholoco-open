/**
 * File des toasts (logique pure, testée) : pas d'avalanche de notifications.
 *  - un toast étiqueté remplace le précédent de même étiquette (« Nouveau trimestre » successifs) ;
 *  - au plus MAX_INFO_TOASTS toasts d'information à la fois (les plus anciens partent) ;
 *  - au plus MAX_TOASTS toasts en tout.
 */
export const MAX_TOASTS = 5;
export const MAX_INFO_TOASTS = 3;

export interface QueuedToast {
  id: number;
  kind: 'good' | 'bad' | 'info' | 'drama';
  tag?: string;
}

export function stackToast<T extends QueuedToast>(list: readonly T[], toast: T): T[] {
  const next = (toast.tag ? list.filter((t) => t.tag !== toast.tag) : [...list]).concat(toast);
  if (toast.kind === 'info') {
    let excess = next.filter((t) => t.kind === 'info').length - MAX_INFO_TOASTS;
    for (let i = 0; excess > 0 && i < next.length; ) {
      if (next[i].kind === 'info') {
        next.splice(i, 1);
        excess--;
      } else i++;
    }
  }
  return next.slice(-MAX_TOASTS);
}
