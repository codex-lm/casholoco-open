import { GuideModal } from '../../components/Guide';
import { useT } from '../../i18n';
import { useApp } from '../../store';
import { closeHelp, showTutorialAgain } from '../../tutorialStore';
import { isGuidedTutorial } from '../../tutorial';
import { useLearning } from '../../i18n/learning';

/** Mode d'emploi ouvert par le bouton « ? » de la barre du jeu, avec un seul bouton qui réaffiche « Vos premiers pas ». */
export function HelpModal() {
  const t = useT();
  const learning = useLearning();
  const guided = useApp((s) => isGuidedTutorial(s.tutorial, s.session?.roomCode ?? 'local'));
  const open = useApp((s) => s.helpOpen);
  if (!open) return null;
  return (
    <GuideModal
      onClose={closeHelp}
      actions={
        <button type="button" className="btn" onClick={showTutorialAgain}>
          {guided ? learning.show : t.help.showChecklist}
        </button>
      }
    />
  );
}
