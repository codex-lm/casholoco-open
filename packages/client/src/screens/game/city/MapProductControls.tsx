import { useUiLang } from '../../../i18n';
import { mapWorkspaceMessages } from '../../../i18n/mapWorkspace';

export interface MapProductControlsProps {
  options: readonly { key: string; label: string }[];
  trackedKey: string;
  onTrackedChange: (key: string) => void;
  compare: boolean;
  onCompareChange: (enabled: boolean) => void;
  comparedKey: string;
  onComparedChange: (key: string) => void;
}

/** A single reference for colours, estimates and flows, with an explicit optional comparison. */
export function MapProductControls({ options, trackedKey, onTrackedChange, compare, onCompareChange,
  comparedKey, onComparedChange }: MapProductControlsProps) {
  const text = mapWorkspaceMessages(useUiLang());
  const picker = (label: string, value: string, onChange: (key: string) => void) => (
    <label className="map-product-picker">{label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </label>
  );
  return <div className="map-product-controls">
    {picker(text.trackedProduct, trackedKey, onTrackedChange)}
    <label className="map-compare-toggle"><input type="checkbox" checked={compare}
      onChange={(event) => onCompareChange(event.target.checked)} /> {text.compare}</label>
    {compare && <>
      {picker(text.comparedReference, comparedKey, onComparedChange)}
      <p className="map-comparison" role="status">{text.comparison(
        options.find((option) => option.key === trackedKey)?.label ?? '',
        options.find((option) => option.key === comparedKey)?.label ?? '',
      )}</p>
    </>}
  </div>;
}
