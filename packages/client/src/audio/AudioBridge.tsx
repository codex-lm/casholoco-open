import { useEffect } from 'react';
import { useApp } from '../store';
import { musicContext } from './catalog';
import { director } from './director';

/** Relie le lecteur à l'écran affiché (musique du contexte) et lui transmet les gestes du joueur (déblocage du son). */
export function AudioBridge() {
  const view = useApp((s) => s.view);
  const lobby = useApp((s) => s.lobby);
  const context = musicContext(view, lobby);

  useEffect(() => {
    director.setContext(context);
  }, [context]);

  useEffect(() => {
    // Seuls un clic, une touche ou la fin d'un toucher autorisent le son (règle des navigateurs). On écoute chaque geste,
    // en capture (avant qu'un composant n'arrête l'événement) : le lecteur relance ce qui aurait été bloqué.
    const unlock = () => director.unlock();
    const events = ['click', 'keydown', 'touchend'] as const;
    for (const e of events) window.addEventListener(e, unlock, { capture: true, passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, unlock, { capture: true });
    };
  }, []);

  return null;
}
