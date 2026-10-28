import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { inputNumber, parseNumber } from '../fmt';
import { useUiLang } from '../i18n';
import { Stepper } from './Stepper';

interface Props {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Affiche un curseur en plus du champ numérique. */
  slider?: boolean;
  /** Bornes du curseur si différentes des bornes du champ. */
  sliderMin?: number;
  sliderMax?: number;
  suffix?: string;
  hint?: ReactNode;
  disabled?: boolean;
  /**
   * Fin d'un réglage, pour enregistrer : 'now' au relâcher du curseur, à la sortie du champ ou sur Entrée ;
   * 'soon' après les boutons − et + ou les flèches du clavier sur le curseur (l'appelant regroupe les pas).
   */
  onCommit?: (when: 'now' | 'soon') => void;
}

/** Touches qui déplacent un curseur. */
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

/**
 * Champ numérique tolérant (virgule française ou point anglais), boutons − et + (pas `step`), curseur optionnel.
 * La valeur s'affiche avec la décimale de la langue de l'interface (« 114,75 » en français), sans séparateur de milliers.
 */
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  slider,
  sliderMin,
  sliderMax,
  suffix,
  hint,
  disabled,
  onCommit,
}: Props) {
  const id = useId();
  const uiLang = useUiLang();
  const parse = (s: string) => parseNumber(s, uiLang);
  const [raw, setRaw] = useState(() => inputNumber(value, uiLang));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setRaw(inputNumber(value, uiLang));
  }, [value, editing, uiLang]);

  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  // Curseur : le relâcher peut avoir lieu hors de lui (glissé au-delà du bout), on l'écoute donc sur la page.
  const release = useRef<AbortController | null>(null);
  useEffect(() => () => release.current?.abort(), []);

  // À la sortie du champ : on borne, et on réaffiche la valeur réellement retenue.
  const commit = (s: string) => {
    const v = parse(s);
    const next = Number.isFinite(v) && s.trim() !== '' ? Math.min(max, Math.max(min, v)) : value;
    if (next !== value) onChange(next);
    setRaw(inputNumber(next, uiLang));
  };

  const sMin = sliderMin ?? min;
  const sMax = Math.max(sliderMax ?? max, sMin + step);

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </label>
      <div className="field-row">
        {slider && (
          <input
            type="range"
            min={sMin}
            max={sMax}
            step={step}
            value={Math.min(sMax, Math.max(sMin, value))}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            onPointerDown={() => {
              if (!commitRef.current) return;
              release.current?.abort();
              const ac = new AbortController();
              release.current = ac;
              const done = () => {
                ac.abort();
                if (release.current === ac) release.current = null;
                commitRef.current?.('now');
              };
              window.addEventListener('pointerup', done, { signal: ac.signal });
              window.addEventListener('pointercancel', done, { signal: ac.signal });
            }}
            onKeyUp={(e) => {
              if (SLIDER_KEYS.has(e.key)) onCommit?.('soon');
            }}
            aria-label={typeof label === 'string' ? label : undefined}
          />
        )}
        <Stepper
          value={value}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(v) => {
            // Le champ peut garder le focus (Safari ne le donne pas au bouton) : on y écrit la valeur tout de suite.
            setRaw(inputNumber(v, uiLang));
            onChange(v);
            onCommit?.('soon');
          }}
        >
          <span className="num-input">
            <input
              id={id}
              type="text"
              inputMode="decimal"
              value={raw}
              disabled={disabled}
              onFocus={() => setEditing(true)}
              onChange={(e) => {
                setEditing(true);
                setRaw(e.target.value);
                const v = parse(e.target.value);
                if (Number.isFinite(v) && e.target.value.trim() !== '') onChange(Math.min(max, Math.max(min, v)));
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                // Entrée vaut validation : le champ réaffiche ensuite la valeur retenue (plafond, écho du serveur).
                setEditing(false);
                commit(e.currentTarget.value);
                onCommit?.('now');
              }}
              onBlur={(e) => {
                setEditing(false);
                commit(e.target.value);
                onCommit?.('now');
              }}
            />
            {suffix && <span className="suffix">{suffix}</span>}
          </span>
        </Stepper>
      </div>
    </div>
  );
}
