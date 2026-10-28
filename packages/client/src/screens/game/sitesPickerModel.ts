/**
 * Calculs des fiches de gisements (DepositPanel) : ce qu'une filiale sur tel gisement
 * ferait économiser face à l'achat au port, en combien de trimestres la mise à prix serait remboursée,
 * et quel gisement montrer par défaut pour une matière. Fonctions pures (test/sitesPicker.test.ts) ;
 * le serveur reste seul juge, ce sont des estimations d'aide à la décision.
 */
import {
  COMMODITIES, COMMODITY_IDS, DEFAULT_ZONE, DEPOSITS, SECTORS, SITE_UNIT_COST_RATIO, hexTransportRoute, roadRoute,
  slotCapacity, capitalCellId, isSpatialMap, type CommodityId, type CompanyView, type PlayerView, type SiteSlotView,
  type ZoneId,
} from '@muchomoney/core';
import { deliveredLotPrice, deliveredLotPriceHex, extractionCostNow } from '../../transport';

/** Livraison d'un gisement à l'usine d'un produit qui en consomme la matière (§5.8). */
export interface DepositDelivery {
  productId: string;
  productName: string;
  zoneId: ZoneId;
  /** Case de l'usine, en mode plateau (la zone classique n'en détermine pas les trajets). */
  hexId?: string;
  /** Besoin de cette usine multiplié par la part couverte, répartie au prorata entre les usines. */
  lots: number;
  /** Prix du lot livré depuis le gisement (extraction + transport). */
  herePrice: number;
  /** Prix du même lot acheté au port (marché + transport). */
  portPrice: number;
  /** Trajet routier gisement → usine (km). */
  km: number;
}

export interface DepositSavings {
  deliveries: DepositDelivery[];
  /** Économie moyenne par lot livré (0 si la filiale ne couvre rien). */
  perLotAvg: number;
  /** Économie totale par trimestre face au port (négative si le gisement est mal placé). */
  total: number;
  /** Lots couverts par la filiale, toutes usines confondues (≤ capacité du gisement). */
  coveredLots: number;
}

const EMPTY: DepositSavings = { deliveries: [], perLotAvg: 0, total: 0, coveredLots: 0 };

function computeSavings(view: PlayerView, company: CompanyView, slotId: string, extractionCost: number): DepositSavings {
  const slot = DEPOSITS[slotId];
  if (!slot) return EMPTY;
  const cid = slot.commodityId;
  const factor = view.transportFactor ?? 1;
  const market = view.commodities.find((c) => c.id === cid)?.price ?? COMMODITIES[cid].basePrice;
  const consumers = company.products.map((product) => ({
    product,
    wanted: Math.max(0, Math.floor(Math.min(product.private?.production ?? product.capacity, product.capacity))) *
      (SECTORS[product.sectorId].inputs[cid] ?? 0),
  })).filter(({ wanted }) => wanted > 0);
  const need = consumers.reduce((sum, { wanted }) => sum + wanted, 0);
  const own = company.sites?.find((site) => site.id === slotId);
  // Les filiales en service servent les besoins dans l'ordre du moteur. Une filiale inactive montre son
  // potentiel de reprise (explicitement nommé dans la fiche), sans recompter les autres filiales actives.
  let remaining = need;
  let available = own?.capacity ?? slotCapacity(slotId);
  if (own) {
    let owed = (view.self?.contracts ?? []).reduce((sum, contract) =>
      contract.sellerCompanyId === company.id && contract.commodityId === cid && contract.turnsLeft > 0 &&
      view.companies.some((buyer) => buyer.id === contract.buyerCompanyId && buyer.status === 'active')
        ? sum + Math.max(0, contract.lots) : sum, 0);
    for (const site of company.sites ?? []) {
      if (site.commodityId !== cid) continue;
      const capacity = Math.max(0, Math.floor(site.capacity));
      if (site.id === slotId) {
        available = capacity - Math.min(capacity, owed);
        break;
      }
      if (!site.dormant && site.activeFrom <= view.turn) {
        const toBuyers = Math.min(capacity, owed);
        owed -= toBuyers;
        remaining -= capacity - toBuyers;
      }
    }
  }
  const covered = Math.min(available, Math.max(0, remaining));
  const deliveries: DepositDelivery[] = [];
  for (const { product: p, wanted } of consumers) {
    const zoneId = p.zoneId ?? DEFAULT_ZONE;
    const hexId = isSpatialMap(view.config) ? p.hexId ?? capitalCellId(view.config) : undefined;
    const delivered = (source: Parameters<typeof deliveredLotPrice>[0]) => hexId
      ? deliveredLotPriceHex(source, hexId, factor, p.sectorId)
      : deliveredLotPrice(source, zoneId, factor, p.sectorId);
    const lots = need > 0 ? wanted * covered / need : 0;
    deliveries.push({
      productId: p.id,
      productName: p.name,
      zoneId,
      ...(hexId ? { hexId } : {}),
      lots,
      herePrice: delivered({ kind: 'deposit', slotId, extractionCost }),
      portPrice: delivered({ kind: 'port', commodityId: cid, marketPrice: market }),
      km: SECTORS[p.sectorId].intangible ? 0 : hexId ? hexTransportRoute(hexId, slotId)?.km ?? 0 : roadRoute(slotId, zoneId)?.km ?? 0,
    });
  }
  const coveredLots = deliveries.reduce((n, d) => n + d.lots, 0);
  const total = deliveries.reduce((n, d) => n + (d.portPrice - d.herePrice) * d.lots, 0);
  return { deliveries, perLotAvg: coveredLots > 0 ? total / coveredLots : 0, total, coveredLots };
}

/**
 * Économies au coût d'extraction NORMAL (tarif de base §5.5 bis, sans l'effet des news) : le chiffre stable
 * des étiquettes sur la carte et du remboursement de la mise à prix.
 */
export function depositSavings(view: PlayerView, company: CompanyView, slotId: string): DepositSavings {
  const cid = DEPOSITS[slotId]?.commodityId;
  if (!cid) return EMPTY;
  const own = company.sites?.find((site) => site.id === slotId);
  return computeSavings(view, company, slotId, own?.unitCost ?? COMMODITIES[cid].basePrice * SITE_UNIT_COST_RATIO);
}

/** Même calcul aux coûts de ce trimestre ; les effets de news ne prédisent pas le prochain trimestre. */
export function depositSavingsNow(view: PlayerView, company: CompanyView, slotId: string): DepositSavings {
  const cid = DEPOSITS[slotId]?.commodityId;
  if (!cid) return EMPTY;
  const own = company.sites?.find((site) => site.id === slotId);
  return computeSavings(view, company, slotId, own?.currentUnitCost ?? extractionCostNow(cid, view.commodities.find((c) => c.id === cid)?.siteCostFactor));
}

/**
 * Remboursement de la mise à prix par les économies : `quarters` trimestres de production (null si la filiale
 * n'économise rien). `productiveQuarters` compte les clôtures du prochain trimestre à la fin, soit N − T.
 */
export function depositPayback(
  reserve: number,
  quarterlySavings: number,
  productiveQuarters: number,
): { quarters: number | null; never: boolean } {
  const quarters = quarterlySavings > 0 ? Math.ceil(reserve / quarterlySavings) : null;
  return { quarters, never: quarters === null || quarters > productiveQuarters };
}

/** Gisement propre, mise en attente encore libre, gisement de la dernière enchère réglée, puis plus riche libre (sinon plus riche). */
export function defaultSlot(view: PlayerView, cid: CommodityId, company?: CompanyView): SiteSlotView | undefined {
  const slots = view.siteSlots.filter((s) => s.commodityId === cid);
  const own = company?.sites?.find((s) => s.commodityId === cid);
  const ownSlot = slots.find((s) => s.id === own?.id || s.companyId === company?.id && !!company);
  if (ownSlot) return ownSlot;
  const pending = view.self?.siteBids?.find((bid) => bid.companyId === company?.id && bid.commodityId === cid && !bid.result);
  const pendingSlot = slots.find((s) => s.id === pending?.slotId && !s.companyId);
  if (pendingSlot) return pendingSlot;
  // L'issue du dernier règlement (perdue ou sans suite) ne se lit que sur la fiche du gisement misé.
  const resulted = view.self?.siteBids?.find((bid) => bid.companyId === company?.id && bid.commodityId === cid && bid.result);
  const resultSlot = slots.find((s) => s.id === resulted?.slotId);
  if (resultSlot) return resultSlot;
  const byRichest = (a: SiteSlotView, b: SiteSlotView) => slotCapacity(b.id) - slotCapacity(a.id);
  return [...slots.filter((s) => !s.companyId)].sort(byRichest)[0] ?? [...slots].sort(byRichest)[0];
}

/**
 * Gisement où l'entreprise peut vraiment miser pour la matière `cid` : libre (pas d'exploitant),
 * sans mise de l'entreprise en attente dessus, et seulement si elle ne possède pas déjà un site
 * de cette matière. Le plus riche d'abord ; undefined s'il n'y en a pas (repli sur defaultSlot).
 */
export function freeDepositSlot(view: PlayerView, cid: CommodityId, company: CompanyView): SiteSlotView | undefined {
  if (company.sites?.some((s) => s.commodityId === cid)) return undefined;
  const spokenFor = new Set(
    (view.self?.siteBids ?? []).filter((bid) => bid.companyId === company.id && !bid.result).map((bid) => bid.slotId),
  );
  const byRichest = (a: SiteSlotView, b: SiteSlotView) => slotCapacity(b.id) - slotCapacity(a.id);
  return view.siteSlots.filter((s) => s.commodityId === cid && !s.companyId && !spokenFor.has(s.id)).sort(byRichest)[0];
}

/**
 * Gisement proposé quand le joueur vient « miser sur un gisement » sans en nommer un, sur les deux cartes : un gisement
 * libre (sans exploitant, pas déjà misé) de la matière la plus demandée que l'entreprise n'exploite pas encore ; à
 * défaut seulement, `defaultSlot` (qui peut rendre sa propre filiale). `need` : besoin de l'entreprise par matière
 * (`commodityNeed`, qui lit les données privées hors de ce module pur).
 */
export function biddableDepositSlot(view: PlayerView, company: CompanyView, need: (cid: CommodityId) => number): SiteSlotView | undefined {
  const unowned = COMMODITY_IDS.filter((c) => !company.sites?.some((s) => s.commodityId === c));
  const ids = unowned.length > 0 ? unowned : COMMODITY_IDS;
  const cid = ids.reduce((best, c) => (need(c) > need(best) ? c : best), ids[0]);
  return freeDepositSlot(view, cid, company) ?? defaultSlot(view, cid, company);
}
