/**
 * La piste du plateau, au bout de la barre d'outils (elle remplace le panneau « Occasion » de la carte classique) :
 * même règle que `openingSign` — le lancement le plus vite rentabilisé sur une case libre s'il reste un emplacement et
 * le temps de l'amortir, sinon une matière qu'on utilise à 85 % ou moins de son prix de base, sinon rien du tout.
 * « Voir » sélectionne la case et chiffre ce lancement (rien n'est engagé) ; « Matières » ouvre l'onglet.
 * Faute de place, la puce rétrécit (le secteur et le lieu se coupent, jamais le délai de remboursement) plutôt que de
 * passer à la ligne ; son infobulle donne toujours la phrase entière, puis l'avertissement « constat, pas un conseil ».
 */
import { hexPlaceLabel, type PlayerView, type SectorId } from '@muchomoney/core';
import { useContent, useRoomLang, useT, useUiLang } from '../../../i18n';
import { mapWorkspaceMessages } from '../../../i18n/mapWorkspace';
import { mapFlowText } from '../../../i18n/mapFlows';
import { useFmt } from '../../../fmt';
import { frenchSpacing } from '../../../util';
import { openingSign, type OpeningSign } from './model';
import './mapToolbar.css';

export interface OpeningChipProps {
  view: PlayerView;
  /** Sélectionne la case et fait du lancement de ce secteur la référence de « Chiffrer pour ». */
  onShowLaunch: (sectorId: SectorId, hexId: string) => void;
  onCommodities: () => void;
  /** Piste déjà calculée (colonne de gauche : pour l'entreprise aux manettes) ; sinon `openingSign(view)`. */
  sign?: OpeningSign;
}

export function OpeningChip({ view, onShowLaunch, onCommodities, sign }: OpeningChipProps) {
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const roomLang = useRoomLang();
  const uiLang = useUiLang();
  const text = mapWorkspaceMessages(uiLang);
  const opening = sign ?? openingSign(view);
  if (opening.kind === 'none' || (opening.kind === 'launch' && opening.hexId === undefined)) return null;
  // Infobulle : la phrase entière, puis l'avertissement.
  const title = (sentence: string) => `${sentence}\n${t.city.signs.observation}`;
  if (opening.kind === 'launch') {
    const hexId = opening.hexId!;
    const place = hexPlaceLabel(hexId, roomLang, view.siteSlots);
    const sector = frenchSpacing(content.sectors[opening.sectorId]?.name ?? opening.sectorId);
    const lead = text.openingLaunch(sector, place);
    const payback = text.openingPayback(opening.payback);
    return <div className="map-opening-chip" data-opening="launch" title={title(`${lead} · ${payback}`)}>
      <span className="map-opening-text">{lead}</span>
      <span className="map-opening-payback">· {payback}</span>
      <button type="button" className="btn tiny" aria-label={text.openingShowAria(place)} data-opening-hex={hexId}
        onClick={() => onShowLaunch(opening.sectorId, hexId)}>{text.openingShow}</button>
    </div>;
  }
  const commodity = content.commodities[opening.commodityId]?.name ?? opening.commodityId;
  const sentence = text.openingCommodity(commodity, fmt.pct(opening.ratio, 0));
  return <div className="map-opening-chip" data-opening="commodity" title={title(sentence)}>
    <span className="map-opening-text">{sentence}</span>
    <button type="button" className="btn tiny" onClick={onCommodities}>{mapFlowText(uiLang).materials}</button>
  </div>;
}
