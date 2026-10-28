import { useUiLang } from '../../../i18n';
import { mapFlowText } from '../../../i18n/mapFlows';
import { mapWorkspaceMessages } from '../../../i18n/mapWorkspace';
import { FLOW_MODES, type FlowMode } from './mapFlows';
import './mapFlows.css';

export interface MapFlowControlsProps {
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  figures: boolean;
  onFiguresChange: (shown: boolean) => void;
  rivals: boolean;
  onRivalsChange: (shown: boolean) => void;
  /** A launch reference has no operational flows yet. */
  unavailable?: boolean;
}

/**
 * Calques de lecture : ils ne changent ni les décisions ni la lentille de la carte. « Aucun » (par défaut) laisse
 * la carte telle qu'elle est sans eux ; les options n'apparaissent qu'avec un calque.
 */
export function MapFlowControls({ mode, onModeChange, figures, onFiguresChange, rivals, onRivalsChange,
  unavailable = false }: MapFlowControlsProps) {
  const lang = useUiLang();
  const text = mapFlowText(lang);
  const on = mode !== 'off';
  return <section className="map-flow-controls" aria-label={text.layers}>
    <div className="map-flow-tools">
      <div className="map-flow-modes" role="group" aria-label={text.modes}>
        <span className="map-flow-kicker">{text.layers}</span>
        {FLOW_MODES.map((id) => (
          <button key={id} type="button" className="btn tiny ghost map-flow-button" aria-pressed={mode === id} onClick={() => onModeChange(id)}>
            {text.mode[id]}
          </button>
        ))}
      </div>
      {on && <div className="map-flow-options">
        <label><input type="checkbox" checked={figures} onChange={(event) => onFiguresChange(event.target.checked)} /> {text.figures}</label>
        <label><input type="checkbox" checked={rivals} onChange={(event) => onRivalsChange(event.target.checked)} /> {text.rivals}</label>
      </div>}
    </div>
    {on && <p className="map-flow-hint" role={unavailable ? 'status' : undefined}>
      {unavailable ? mapWorkspaceMessages(lang).needsProduct : text.hint[mode]}
    </p>}
  </section>;
}
