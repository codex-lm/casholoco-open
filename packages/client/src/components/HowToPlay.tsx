import { useState } from 'react';
import { useT, useUiLang } from '../i18n';
import { Rich } from '../i18n/Rich';
import { useFmt } from '../fmt';
import { EMERGENCY_PURCHASE_MARKUP } from '../rules';
import { useApp } from '../store';
import { GuideModal } from './Guide';
import { industryMessages } from '../i18n/industry';
import { islandGuideMessages } from '../i18n/islandGuide';

/**
 * Règles en dix lignes (lobby et aide « ? »). Sur le plateau (carte de la partie ou du salon, ou `mapMode`), une
 * dernière ligne résume le plateau ; `onBoard` y ajoute le lien vers le sujet « Plateau » du mode d'emploi.
 */
export function HowToPlay({ mapMode, onBoard }: { mapMode?: 'classic' | 'hex' | 'square'; onBoard?: () => void } = {}) {
  const t = useT();
  const fmt = useFmt();
  const storeMapMode = useApp((s) => s.view?.config.mapMode ?? s.lobby?.config.mapMode);
  const hex = (mapMode ?? storeMapMode) === 'hex' || (mapMode ?? storeMapMode) === 'square';
  const uiLang = useUiLang();
  const network = useApp(s => (s.view?.config.industryRules ?? s.lobby?.config.industryRules) === 'network');
  return (
    <ul className="how-to-play">
      {t.help.lines(fmt.pct(EMERGENCY_PURCHASE_MARKUP - 1, 0)).map((line, i) => (
        <li key={i}>
          <Rich text={line} />
        </li>
      ))}
      {hex && (
        <li className="how-to-play-board">
          <Rich text={(mapMode ?? storeMapMode) === 'square' ? islandGuideMessages(uiLang).basics : network ? industryMessages(uiLang).basics : t.guide.basicsBoard} />
          {onBoard && (
            <>
              {' '}
              <button type="button" className="btn ghost tiny" data-guide-board-link onClick={onBoard}>
                {t.guide.basicsBoardLink}
              </button>
            </>
          )}
        </li>
      )}
    </ul>
  );
}

/** Encart repliable « Comment jouer » (fermé par défaut : les habitués ne le voient pas), avec un lien vers tout le mode d'emploi. */
export function HowToPlayDetails({ className }: { className?: string }) {
  const t = useT();
  const [guide, setGuide] = useState(false);
  return (
    <>
      <details className={className ? `how-to-play-box ${className}` : 'how-to-play-box'}>
        <summary>{t.help.summary}</summary>
        <HowToPlay />
        <button type="button" className="btn ghost small guide-link" onClick={() => setGuide(true)}>
          {t.guide.openFull}
        </button>
      </details>
      {guide && <GuideModal onClose={() => setGuide(false)} />}
    </>
  );
}
