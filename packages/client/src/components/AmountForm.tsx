import { useId, useState, type ReactNode } from 'react';
import { inputNumber, parseNumber, useFmt, type Fmt } from '../fmt';
import { useT, useUiLang, type Messages } from '../i18n';
import { Stepper, niceStep } from './Stepper';

type Unit = 'money' | 'shares' | 'lots';

interface Props {
  label: ReactNode;
  /** Montant maximal autorisé (0 = action impossible). */
  max: number;
  min?: number;
  unit?: Unit;
  submitLabel: string;
  onSubmit: (amount: number) => Promise<{ ok: boolean }>;
  /** Estimation affichée sous le champ pour le montant saisi. */
  info?: (amount: number) => ReactNode;
  /** Ce qu'il resterait après l'opération (trésorerie, cash perso, dette…), sous l'estimation. */
  after?: (amount: number) => ReactNode;
  /** Si défini, le formulaire est désactivé avec cette explication. */
  disabledReason?: string | null;
  danger?: boolean;
  presets?: number[];
  initial?: number;
  /** Appelé à chaque changement du texte brut saisi (hors réinitialisation après envoi). */
  onRawChange?: (raw: string) => void;
}

export function formatUnit(v: number, unit: Unit, fmt: Fmt, t: Messages): string {
  if (unit === 'money') return fmt.money(v);
  if (unit === 'lots') return fmt.lots(v);
  return t.common.shares(fmt.int(v), Math.round(v));
}

/**
 * Formulaire « montant + bouton » : boutons − et + autour du champ (1 lot, sinon un pas rond d'environ 1/20 de la
 * plage), raccourcis en part du maximum affiché (« ¼ max », « ½ max », « max »), estimation et reste après l'opération.
 */
export function AmountForm({
  label,
  max,
  min = 0,
  unit = 'money',
  submitLabel,
  onSubmit,
  info,
  after,
  disabledReason,
  danger,
  presets = [0.25, 0.5, 1],
  initial,
  onRawChange,
}: Props) {
  const t = useT();
  const fmt = useFmt();
  const uiLang = useUiLang();
  const labelId = useId();
  const parse = (s: string) => parseNumber(s, uiLang);
  const [raw, setRaw] = useState(initial ? inputNumber(initial, uiLang) : '');
  const [busy, setBusy] = useState(false);
  const changeRaw = (value: string) => { setRaw(value); onRawChange?.(value); };
  const integer = unit !== 'money';
  const finiteMax = Math.max(0, Number.isFinite(max) ? max : 0);
  const safeMax = integer ? Math.floor(finiteMax) : finiteMax;
  const amount = parse(raw);
  const fractional = integer && Number.isFinite(amount) && !Number.isInteger(amount);
  const valid = raw.trim() !== '' && Number.isFinite(amount) && !fractional && amount > 0 && amount >= min && amount <= safeMax + 1e-6;
  const disabled = Boolean(disabledReason) || busy;

  const presetValue = (ratio: number) => {
    const v = safeMax * ratio;
    return integer ? Math.floor(v) : Math.floor(v * 10) / 10;
  };
  const setPreset = (ratio: number) => changeRaw(inputNumber(presetValue(ratio), uiLang));
  // − et + : un lot à la fois ; sinon un pas rond (1, 2 ou 5 × 10^k) d'environ 1/20 de la plage, dans les bornes (le
  // haut calé au dixième, comme les raccourcis ; le bas sur la mise à prix, une unité ou un pas).
  const step = unit === 'lots' ? 1 : niceStep((safeMax - min) / 20);
  const hi = integer ? safeMax : Math.floor(safeMax * 10) / 10;
  const lo = min > 0 ? min : Math.min(integer ? 1 : step, hi);
  const typed = raw.trim() !== '' && Number.isFinite(amount) ? amount : Number.NaN;

  const submit = async () => {
    if (!valid || disabled) return;
    setBusy(true);
    try {
      const r = await onSubmit(amount);
      if (r.ok) setRaw('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="amount-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="amount-head">
        <span className="amount-label" id={labelId}>{label}</span>
        <span className="muted small">{t.common.maxOf(formatUnit(safeMax, unit, fmt, t))}</span>
      </div>
      <div className="amount-row">
        <Stepper
          className="grow"
          value={typed}
          step={step}
          min={lo}
          max={hi}
          disabled={disabled || hi <= 0}
          stepLabel={unit === 'lots' ? t.form.lotStep(step) : formatUnit(step, unit, fmt, t)}
          onChange={(v) => changeRaw(inputNumber(v, uiLang))}
        >
          <span className="num-input grow">
            <input
              type="text"
              inputMode="decimal"
              placeholder={min > 0 ? `≥ ${fmt.int(min)}` : '0'}
              value={raw}
              disabled={disabled}
              onChange={(e) => changeRaw(e.target.value)}
              aria-label={typeof label === 'string' ? label : undefined}
              aria-labelledby={typeof label === 'string' ? undefined : labelId}
              aria-invalid={fractional || amount > safeMax + 1e-6 || undefined}
            />
            <span className="suffix">{unit === 'money' ? fmt.unit : unit === 'lots' ? 'lots' : t.common.sharesSuffix}</span>
          </span>
        </Stepper>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className="btn tiny ghost"
            disabled={disabled || safeMax <= 0}
            title={t.form.presetTitle(p, fmt.pct(p, 0), formatUnit(presetValue(p), unit, fmt, t))}
            onClick={() => setPreset(p)}
          >
            {t.form.preset(p, fmt.pct(p, 0))}
          </button>
        ))}
        <button type="submit" className={`btn${danger ? ' danger' : ''}`} disabled={disabled || !valid}>
          {busy ? '…' : submitLabel}
        </button>
      </div>
      {disabledReason ? (
        <div className="muted small">{disabledReason}</div>
      ) : (
        info && Number.isFinite(amount) && !fractional && amount > 0 && <div className="amount-info small">{info(amount)}</div>
      )}
      {!disabledReason && after && Number.isFinite(amount) && !fractional && amount > 0 && amount <= safeMax + 1e-6 && (
        <div className="amount-after small">{after(amount)}</div>
      )}
      {!disabledReason && fractional && (
        <div className="warn small" role="alert">{unit === 'lots' ? t.form.wholeLots : t.form.wholeShares}</div>
      )}
      {!disabledReason && raw.trim() !== '' && Number.isFinite(amount) && amount > safeMax + 1e-6 && (
        <div className="warn small">{t.form.overMax}</div>
      )}
    </form>
  );
}
