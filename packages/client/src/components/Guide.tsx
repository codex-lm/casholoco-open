import { useEffect, useRef, useState, type ReactNode } from 'react';
import { roomLangOf, useT, useUiLang } from '../i18n';
import { Rich } from '../i18n/Rich';
import { fmtFor } from '../fmt';
import { useApp } from '../store';
import { GUIDE_SECTIONS, GUIDE_TOPICS, gameTabOrder, guideNumbers, type GuideSection } from '../guide';
import type { TabId } from '../screens/GameScreen';
import { HowToPlay } from './HowToPlay';
import { Modal } from './Modal';
import { Tabs } from './Tabs';
import { industryMessages } from '../i18n/industry';
import { islandGuideMessages } from '../i18n/islandGuide';

/** Libellé d'un onglet de la partie, tel que l'écran de jeu l'affiche (au singulier pour « Mon entreprise »). */
function useTabLabel(): (id: TabId) => string {
  const tabs = useT().game.tabs;
  return (id) => (id === 'company' ? tabs.company : tabs[id]);
}

/**
 * Mode d'emploi en trois parties : l'essentiel (les dix lignes de « Comment jouer »), onglet par onglet, et les règles
 * des coups plus rares. Des règles, jamais de conseils de stratégie.
 */
export function Guide() {
  const t = useT();
  const [section, setSection] = useState<GuideSection>('basics');
  // Lien « Pour aller plus loin › Le plateau » de « L'essentiel » : la partie s'ouvre sur ce sujet, focus compris.
  const [boardAsked, setBoardAsked] = useState(false);
  return (
    <div className="guide">
      <Tabs
        tabs={GUIDE_SECTIONS.map((id) => ({ id, label: t.guide.sections[id] }))}
        active={section}
        onChange={(id) => {
          setSection(id);
          setBoardAsked(false);
        }}
        ariaLabel={t.guide.sectionsAria}
      />
      <GuidePanel section={section} focusBoard={boardAsked} onOpenBoard={() => {
        setSection('more');
        setBoardAsked(true);
      }} />
    </div>
  );
}

/**
 * Une partie du mode d'emploi. En partie hexadécimale (carte), le sujet « board » est mis en avant et ouvert, les
 * onglets suivent l'ordre du plateau, et « L'essentiel » finit par une ligne sur le plateau avec un lien vers son sujet
 * (`onOpenBoard`). Le sujet « board » commence par un résumé de deux ou trois phrases, avant la règle complète.
 */
export function GuidePanel({ section, mapMode, onOpenBoard, focusBoard = false }: {
  section: GuideSection;
  mapMode?: 'classic' | 'hex' | 'square';
  onOpenBoard?: () => void;
  /** Amène le focus sur le sujet « board » (après le lien de « L'essentiel »). */
  focusBoard?: boolean;
}) {
  const t = useT();
  const tabLabel = useTabLabel();
  // Pourcentages dans la langue du texte ; montants dans la monnaie du salon (hors salon : celle de l'interface).
  const uiLang = useUiLang();
  const moneyLang = useApp((s) => (s.view || s.lobby ? roomLangOf(s) : s.lang));
  const n = guideNumbers(fmtFor(uiLang), fmtFor(moneyLang));
  // Mode carte : prop explicitement fournie, sinon celui de la partie ou du salon en cours.
  const storeMapMode = useApp((s) => s.view?.config.mapMode ?? s.lobby?.config.mapMode);
  const mode = mapMode ?? storeMapMode;
  const network = useApp(s => ['hex', 'square'].includes(s.view?.config.mapMode ?? s.lobby?.config.mapMode ?? 'classic')
    && (s.view?.config.industryRules ?? s.lobby?.config.industryRules) === 'network');
  const topics = (mode === 'hex' || mode === 'square') ? ['board' as const, ...GUIDE_TOPICS.filter((id) => id !== 'board')] : GUIDE_TOPICS;
  const boardSummary = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusBoard && section === 'more') boardSummary.current?.focus();
  }, [focusBoard, section]);
  return (
    <div className="guide-panel" role="tabpanel" aria-label={t.guide.sections[section]}>
      {section === 'basics' && <HowToPlay mapMode={mode} onBoard={onOpenBoard} />}
      {section === 'tabs' && (
        <>
          <p className="muted small">{t.guide.tabsIntro}</p>
          <dl className="guide-tabs">
            {gameTabOrder(mode).map((id) => (
              <div key={id}>
                <dt>{tabLabel(id)}</dt>
                <dd>
                  <Rich text={mode === 'square' && id === 'map' ? islandGuideMessages(uiLang).manual
                    : network && id === 'map' ? industryMessages(uiLang).mapManual
                    : network && id === 'company' ? industryMessages(uiLang).companyManual
                    : t.guide.tabs[id](n)} />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {section === 'more' && (
        <>
          <p className="muted small">{t.guide.moreIntro}</p>
          <div className="guide-topics">
            {topics.map((id) => (
              <details key={id} className="guide-topic" data-guide-topic={id} open={(mode === 'hex' || mode === 'square') && id === 'board' ? true : undefined}>
                <summary ref={id === 'board' ? boardSummary : undefined}>{t.guide.more[id].title}</summary>
                {id === 'board' && (
                  <p className="guide-topic-lead">
                    <Rich text={mode === 'square' ? islandGuideMessages(uiLang).basics : network ? industryMessages(uiLang).basics : t.guide.boardLead} />
                  </p>
                )}
                <p>
                  <Rich text={id === 'board' && mode === 'square' ? `${islandGuideMessages(uiLang).manual} ${industryMessages(uiLang).landRule} ${industryMessages(uiLang).shared}`
                    : id === 'board' && network ? `${industryMessages(uiLang).manual} ${industryMessages(uiLang).landRule} ${industryMessages(uiLang).shared}` : t.guide.more[id].body(n)} />
                </p>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Le mode d'emploi dans une fenêtre ; `actions` s'ajoute au bouton Fermer (la checklist, en partie). */
export function GuideModal({ onClose, actions }: { onClose: () => void; actions?: ReactNode }) {
  const t = useT();
  return (
    <Modal title={t.guide.title} onClose={onClose} wide>
      <div className="stack">
        <Guide />
        <div className="row end">
          {actions}
          <button type="button" className="btn primary" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
      </div>
    </Modal>
  );
}
