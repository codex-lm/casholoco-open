/**
 * Boutons − et + de part et d'autre d'un champ numérique : changer une quantité sans la taper. Un clic fait un pas ;
 * bouton maintenu, la valeur défile, dix fois plus vite au bout d'un moment. Au clavier, Entrée ou Espace font un pas.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useFmt } from '../fmt';
import { useT } from '../i18n';

/** Pas rond (1, 2 ou 5 × 10^k) juste sous `x`, jamais sous `floor`. */
export function niceStep(x: number, floor = 1): number {
  if (!Number.isFinite(x) || x <= floor) return floor;
  const p = 10 ** Math.floor(Math.log10(x));
  const m = x / p;
  return Math.max(floor, (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p);
}

/**
 * Valeur après un pas vers le haut (+1) ou le bas (−1) : on se cale sur la grille du pas (13 → 15 → 20 avec un pas
 * de 5), dans les bornes [lo, hi]. Champ vide ou illisible : + part de `lo`, − ne fait rien (null).
 */
export function stepValue(current: number, dir: 1 | -1, step: number, lo: number, hi: number): number | null {
  if (!(step > 0) || hi < lo) return null;
  if (!Number.isFinite(current)) return dir > 0 ? lo : null;
  const k = current / step;
  const raw = dir > 0 ? (Math.floor(k + 1e-9) + 1) * step : (Math.ceil(k - 1e-9) - 1) * step;
  const next = Math.min(hi, Math.max(lo, raw));
  return Math.round(next * 1e6) / 1e6;
}

/** Délai avant que le bouton maintenu ne défile, cadence, et nombre de pas avant d'accélérer. */
const HOLD_DELAY_MS = 450;
const HOLD_EVERY_MS = 90;
const HOLD_BOOST_AFTER = 12;
const HOLD_BOOST = 10;

function StepButton({ dir, onStep, disabled, label }: { dir: 1 | -1; onStep: (mult: number) => void; disabled: boolean; label: string }) {
  const latest = useRef(onStep);
  latest.current = onStep;
  const timer = useRef<number | undefined>(undefined);
  const press = useRef<AbortController | null>(null);
  // Le défilement a joué : le clic qui suit le relâcher ne compte pas (remis à zéro à chaque nouvel appui).
  const repeated = useRef(false);
  const stop = () => {
    window.clearTimeout(timer.current);
    press.current?.abort();
    press.current = null;
  };
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      press.current?.abort();
    },
    [],
  );

  return (
    <button
      type="button"
      className="btn-step"
      disabled={disabled}
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        stop();
        repeated.current = false;
        let n = 0;
        const tick = (delay: number) => {
          timer.current = window.setTimeout(() => {
            repeated.current = true;
            n++;
            latest.current(n > HOLD_BOOST_AFTER ? HOLD_BOOST : 1);
            tick(HOLD_EVERY_MS);
          }, delay);
        };
        tick(HOLD_DELAY_MS);
        // Un bouton qui se désactive en butée ne reçoit plus le relâcher : on l'écoute sur la page.
        const ac = new AbortController();
        press.current = ac;
        window.addEventListener('pointerup', stop, { signal: ac.signal });
        window.addEventListener('pointercancel', stop, { signal: ac.signal });
      }}
      onPointerLeave={stop}
      onKeyDown={() => {
        repeated.current = false;
      }}
      onClick={() => {
        if (repeated.current) repeated.current = false;
        else latest.current(1);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span aria-hidden>{dir > 0 ? '+' : '−'}</span>
    </button>
  );
}

interface Props {
  /** Valeur actuelle (NaN si le champ est vide ou illisible). */
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Le pas tel qu'on le dit (« 1 lot », « 200 k€ ») ; par défaut, le nombre. */
  stepLabel?: string;
  /** Le champ lui-même, entre les deux boutons. */
  children: ReactNode;
  className?: string;
}

/** Champ encadré de − et + (pas `step`, bornes `min` et `max`). */
export function Stepper({ value, step, min, max, onChange, disabled, stepLabel, children, className }: Props) {
  const t = useT();
  const fmt = useFmt();
  const move = (dir: 1 | -1) => (mult: number) => {
    const next = stepValue(value, dir, step * mult, min, max);
    if (next !== null && next !== value) onChange(next);
  };
  const off = disabled || max < min;
  const said = stepLabel ?? fmt.num(step);
  return (
    <span className={className ? `stepper ${className}` : 'stepper'}>
      <StepButton dir={-1} onStep={move(-1)} disabled={off || !Number.isFinite(value) || value <= min} label={t.form.stepDown(said)} />
      {children}
      <StepButton dir={1} onStep={move(1)} disabled={off || (Number.isFinite(value) && value >= max)} label={t.form.stepUp(said)} />
    </span>
  );
}
