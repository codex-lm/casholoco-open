import { useEffect, useRef, useState } from 'react';
import { setAudioSettings, useAudioSettings } from '../audio/settings';
import { useT } from '../i18n';
import { cx } from '../util';

/** Bouton son (à côté de FR | EN) : couper le son, régler la musique et les effets. Réglages propres au navigateur. */
export function SoundButton({ className }: { className?: string }) {
  const s = useAudioSettings();
  const t = useT();
  const [open, setOpen] = useState(false);
  // Le panneau s'ouvre du côté où il a la place : le bouton est à gauche de la barre en partie, à droite à l'accueil.
  const [fromLeft, setFromLeft] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const off = s.muted || (s.music === 0 && s.sfx === 0);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      // Le contrôle va disparaître ; un focus déjà sorti du panneau reste à sa destination.
      if (box.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const pct = (v: number) => Math.round(v * 100);
  return (
    <div className={cx('sound', className)} ref={box}>
      <button
        ref={trigger}
        type="button"
        className="btn-icon sound-btn"
        aria-expanded={open}
        aria-label={t.sound.button(off)}
        title={t.sound.button(off)}
        onClick={() => {
          const r = box.current?.getBoundingClientRect();
          if (!open && r) setFromLeft(r.left + r.width / 2 < window.innerWidth / 2);
          setOpen(!open);
        }}
      >
        <span aria-hidden>{off ? '🔇' : '🔊'}</span>
      </button>
      {open && (
        <div className={cx('sound-panel', fromLeft && 'from-left')} role="group" aria-label={t.sound.title}>
          <label className="sound-toggle">
            <input type="checkbox" checked={!s.muted} onChange={(e) => setAudioSettings({ muted: !e.target.checked })} />
            {t.sound.on}
          </label>
          <label className="sound-range">
            <span>
              {t.sound.music} <span className="muted">{pct(s.music)} %</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct(s.music)}
              disabled={s.muted}
              onChange={(e) => setAudioSettings({ music: Number(e.target.value) / 100 })}
            />
          </label>
          <label className="sound-range">
            <span>
              {t.sound.effects} <span className="muted">{pct(s.sfx)} %</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct(s.sfx)}
              disabled={s.muted}
              onChange={(e) => setAudioSettings({ sfx: Number(e.target.value) / 100 })}
            />
          </label>
          <p className="small muted">{t.sound.hint}</p>
        </div>
      )}
    </div>
  );
}
