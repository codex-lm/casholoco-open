import { basin, DEFAULT_ZONE, hexPlaceLabel, isSpatialMap, type ContentBundle, type PlayerView, type ProductView } from '@muchomoney/core';
import type { hexIntegrationFr } from '../../i18n/hexIntegration-fr';
import { zoneLabel } from './city/MapSheets';

/** Public position only; room/UI-localised names are supplied by the caller. */
export function productLocation(view: Pick<PlayerView, 'config' | 'siteSlots'>, product: ProductView, names: ContentBundle['mapNames'], labels: Pick<typeof hexIntegrationFr, 'location' | 'incubator'>): string {
  if (isSpatialMap(view.config)) {
    if (product.incubator || !product.hexId) return labels.incubator;
    return labels.location(hexPlaceLabel(product.hexId, view.config.lang, view.siteSlots), zoneLabel(names, basin(product.hexId)));
  }
  return zoneLabel(names, product.zoneId ?? DEFAULT_ZONE);
}
