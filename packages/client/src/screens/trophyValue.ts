import type { TrophyId } from '@muchomoney/core';
import type { Messages } from '../i18n';
import type { Fmt } from '../fmt';

/** Valeur d'un trophée : compteur (pluriel selon la langue de l'interface), lots ou montant (langue du salon). */
export function formatTrophyValue(id: TrophyId, value: number, t: Messages, fmt: Fmt): string {
  const unit = t.end.units[id];
  if (unit) return `${fmt.int(value)} ${t.plural(value, unit[0], unit[1])}`;
  if (id === 'pollueur') return t.end.oil(fmt.lots(value));
  if (id === 'naufrage') return t.end.worst(fmt.money(Math.abs(value)));
  return fmt.money(value);
}
