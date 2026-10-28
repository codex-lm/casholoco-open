import { DEFAULT_ZONE, EMERGENCY_PURCHASE_PREMIUM, ZONE_IDS, portOnlyTransport, type CommodityView, type SectorView, type ZoneId } from '@muchomoney/core';

export interface LaunchZoneEstimate {
  unitCost: number;
  quarterlyProfit: number;
  paybackQuarters?: number | null;
  demand?: number;
}

export interface LaunchZone {
  id: ZoneId;
  est: LaunchZoneEstimate;
}

/** A missing non-capital estimate must not silently display the capital's return. */
export function selectedLaunchEstimate(
  zones: readonly LaunchZone[] | null,
  zoneId: ZoneId,
  capitalEstimate?: Pick<LaunchZoneEstimate, 'quarterlyProfit' | 'paybackQuarters'>,
) {
  return zones?.find((zone) => zone.id === zoneId)?.est ?? (zoneId === DEFAULT_ZONE ? capitalEstimate : undefined);
}

/**
 * Coût et bénéfice estimés d'un lancement dans ce secteur, zone par zone (§5.8). Sans `launchByZone`
 * (vue d'un ancien serveur), la capitale retombe sur `launchEstimate` : mêmes hypothèses que le moteur
 * (main-d'œuvre × 1, matières au prix spot majoré, port). Null dès qu'une zone n'a pas d'estimation.
 */
export function launchZoneEstimates(
  sector: Pick<SectorView, 'id' | 'inputs' | 'laborCost' | 'launchEstimate' | 'launchByZone'> | undefined,
  commodities: readonly Pick<CommodityView, 'id' | 'price'>[],
  transportFactor = 1,
): LaunchZone[] | null {
  if (!sector) return null;
  const spotInputs = Object.entries(sector.inputs ?? {}).reduce(
    (sum, [cid, per]) => sum + (per ?? 0) * (commodities.find((c) => c.id === cid)?.price ?? 0) * EMERGENCY_PURCHASE_PREMIUM,
    0,
  );
  const estimateOf = (z: ZoneId): LaunchZoneEstimate | undefined =>
    sector.launchByZone?.[z] ??
    (z === DEFAULT_ZONE && sector.launchEstimate
      ? {
          unitCost: sector.laborCost + spotInputs + portOnlyTransport(sector.id, DEFAULT_ZONE) * transportFactor,
          quarterlyProfit: sector.launchEstimate.quarterlyProfit,
          paybackQuarters: sector.launchEstimate.paybackQuarters,
        }
      : undefined);
  const list = ZONE_IDS.map((id) => ({ id, est: estimateOf(id) }));
  return list.every((l): l is LaunchZone => l.est !== undefined) ? list : null;
}

/** La plus rentable (la première à ce bénéfice en cas d'égalité), mise en avant. */
export function bestLaunchZone(zones: readonly LaunchZone[]): ZoneId {
  return zones.reduce((a, b) => (b.est.quarterlyProfit > a.est.quarterlyProfit ? b : a)).id;
}
