/** La carte du pays : panneaux publics puis carte classique, ou plateau hexagonal seul (sa barre porte la piste). */
import { useState } from 'react';
import { isSpatialMap, type CompanyView } from '@muchomoney/core';
import { STILL_KEY, loadFlag, saveFlag } from '../../../storageFlags';
import type { BoardCellRequest } from '../../../tutorialBoard';
import type { TabId } from '../../GameScreen';
import type { MapIntent } from '../mapIntent';
import { MapView } from './MapView';
import { Signs } from './Signs';
import { useGame } from '../../../hooks/useGame';
import { HexMapView } from './HexMapView';

interface Props {
  company: CompanyView | null;
  onSelect: (id: string) => void;
  goTo: (tab: TabId) => void;
  selectedProductId?: string | null;
  onSelectProduct?: (id: string) => void;
  onOpenFactory?: (companyId: string, productId?: string) => void;
  /** Décision géographique demandée (lancement, déménagement, gisement, case du plateau) : la vue s'initialise dessus. */
  intent?: MapIntent | null;
  /** Numéro d'envoi de l'intention : deux envois identiques remontent quand même la vue (formulaire rouvert). */
  intentSeq?: number;
  /** Envoie le joueur sur la carte avec une intention (panneau « Occasion » des Signs). */
  openMapFor: (intent: MapIntent) => void;
  /** Case demandée par « Vos premiers pas » (plateau seulement) : sélectionnée sur place, sans remonter la vue. */
  cellRequest?: BoardCellRequest | null;
}

/** Une nouvelle intention remonte la vue pour qu'elle se réinitialise dessus. */
export function intentKey(intent: MapIntent | null | undefined, seq = 0): string {
  if (!intent) return 'plain';
  if (intent.kind === 'move') return `intent:move:${intent.productId}:${seq}`;
  if (intent.kind === 'cell') return `intent:cell:${intent.hexId}:${seq}`;
  if (intent.kind === 'launch') return `intent:launch:${intent.companyId}:${intent.sectorId ?? ''}:${intent.zoneId ?? ''}:${intent.hexId ?? ''}:${intent.existingProductId ?? ''}:${seq}`;
  return `intent:deposit:${intent.companyId}:${intent.slotId ?? ''}:${seq}`;
}

export function CityTab({ company, onSelect, goTo, selectedProductId, onSelectProduct, onOpenFactory = (id) => { onSelect(id); goTo('factories'); }, intent, intentSeq, openMapFor, cellRequest }: Props) {
  const { view } = useGame();
  // « Figer la scène » : un seul état pour la carte et les panneaux, mémorisé ; CityTab le détient.
  const [frozen, setFrozen] = useState(() => loadFlag(STILL_KEY));
  const toggleStill = () => {
    saveFlag(STILL_KEY, !frozen);
    setFrozen(!frozen);
  };
  const fromCity = () => {
    // Signs sélectionne déjà l'entreprise de sa fiche avant de demander cet onglet.
    goTo('factories');
  };
  const key = intentKey(intent, intentSeq);
  const hex = isSpatialMap(view.config);
  return (
    <div className="city-tab">
      {/* Sur le plateau, plus de panneaux : rang et menaces sont dans la barre du jeu, la piste dans la barre de la carte. */}
      {!hex && <Signs company={company} onSelect={onSelect} goTo={goTo} onFactories={fromCity} frozen={frozen} openMapFor={openMapFor} />}
      {hex ? (
        <HexMapView key={key} company={company} onSelect={onSelect} goTo={goTo} selectedProductId={selectedProductId} onSelectProduct={onSelectProduct} onOpenFactory={onOpenFactory} intent={intent} cellRequest={cellRequest} frozen={frozen} onToggleStill={toggleStill} />
      ) : (
        <MapView key={key} company={company} onSelect={onSelect} goTo={goTo} selectedProductId={selectedProductId} onSelectProduct={onSelectProduct} onOpenFactory={onOpenFactory} frozen={frozen} onToggleStill={toggleStill} intent={intent} />
      )}
    </div>
  );
}
