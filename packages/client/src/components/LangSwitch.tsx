import { LANGS } from '@muchomoney/core';
import { changeLang } from '../api';
import { useT, useUiLang } from '../i18n';
import { cx } from '../util';

/** Sélecteur FR | EN de la langue de l'interface (propre à chaque joueur). */
export function LangSwitch({ className }: { className?: string }) {
  const lang = useUiLang();
  const t = useT();
  return (
    <div className={cx('lang-switch', className)} role="group" aria-label={t.lang.switchAria}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          className={cx('lang-btn', l === lang && 'active')}
          aria-pressed={l === lang}
          title={t.lang.names[l]}
          onClick={() => changeLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
