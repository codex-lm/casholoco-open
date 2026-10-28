/**
 * Réponse d'un bot à une offre (§7 bis, §10) : immédiate, déterministe, selon sa personnalité. Pas de RNG, et pas
 * d'import des actions (le module est appelé par elles).
 *
 * Les prix de référence ne se manipulent pas dans le trimestre : le bot compare au cours du moment **et** à celui de
 * la dernière clôture, en retenant le moins favorable pour lui (sinon, gonfler un cours à coups d'achats puis lui
 * revendre au prix gonflé rapporterait à coup sûr).
 */
import { BOT_PERSONALITIES, COMMODITIES } from '../content';
import type { CommodityId, CompanyState, GameState, Offer } from '../types';
import { capacityNeed, siteUnitCost } from './deals';
import { fundamentalValue } from './finance';
import { getOwn } from './util';

/** Traits utiles aux tractations ; valeurs moyennes pour un bot inconnu. */
function traits(botPersonalityId: string | undefined) {
  const p = BOT_PERSONALITIES.find((b) => b.id === botPersonalityId);
  return { aggressiveness: p?.aggressiveness ?? 0.4, greed: p?.greed ?? 0.4, shadyPropensity: p?.shadyPropensity ?? 0.2 };
}

/** Dernier prix de clôture (le prix de départ avant la première clôture ; le prix du moment à défaut). */
function closeOf(history: number[], now: number): number {
  const last = history.at(-1);
  return last !== undefined && last > 0 ? last : now;
}

/** Lots par trimestre déjà engagés par contrat pour cette entreprise et cette matière, côté achat ou côté vente. */
function contracted(state: GameState, companyId: string, cid: CommodityId, side: 'buy' | 'sell'): number {
  return (state.contracts ?? [])
    .filter((k) => k.commodityId === cid && (side === 'buy' ? k.buyerCompanyId : k.sellerCompanyId) === companyId)
    .reduce((n, k) => n + k.lots, 0);
}

/** Extraction trimestrielle des filiales de l'entreprise pour cette matière. */
function extraction(c: CompanyState, cid: CommodityId): number {
  return (c.sites ?? []).filter((s) => s.commodityId === cid).reduce((n, s) => n + s.capacity, 0);
}

/**
 * Le bot destinataire accepte-t-il ?
 *  - actions (jamais celles de l'entreprise qu'il dirige), il achète : au plus au moins cher du cours et de la
 *    dernière clôture (+ 5 % selon son appétit), sans dépasser la valeur fondamentale, s'il garde 20 % de marge de
 *    cash ; il vend : au moins 10 % au-dessus du plus cher des deux (moins s'il est avide) ;
 *  - contrat, il achète : une matière qu'il consomme, pour ses seuls besoins non couverts (filiale, contrats signés),
 *    3 % sous le moins cher du cours, de la dernière clôture et du prix de base. Ses besoins se lisent sur ses
 *    capacités, publiques, et non sur sa production prévue, secrète (sinon ses réponses la trahiraient) ;
 *  - contrat, il vend : le surplus de sa filiale (extraction moins ses besoins et ses contrats), à 90 % au moins du plus
 *    cher des trois et 30 % au-dessus de son coût d'extraction ;
 *  - entente : il signe s'il a le goût des combines (propension ≥ 0,5).
 */
export function botAcceptsOffer(state: GameState, o: Offer): boolean {
  const bot = getOwn(state.players, o.toId);
  if (!bot || !bot.isBot) return false;
  const t = traits(bot.botPersonalityId);
  switch (o.kind) {
    case 'shares': {
      const c = getOwn(state.companies, o.companyId);
      if (!c || c.status !== 'active' || !(c.sharePrice > 0)) return false;
      const close = closeOf(c.priceHistory, c.sharePrice);
      const total = o.shares * o.price;
      // Jamais d'actions de l'entreprise qu'il dirige, ni à l'achat (délit d'initié présumé) ni à la vente.
      if (c.controllerId === bot.id) return false;
      if (o.side === 'sell') {
        const perShare = fundamentalValue(c) / Math.max(c.sharesOutstanding, 1);
        const cap = Math.min(Math.min(c.sharePrice, close) * (1 + 0.05 * t.aggressiveness), perShare);
        return o.price <= cap && bot.cash >= total * 1.2;
      }
      return o.price >= Math.max(c.sharePrice, close) * (1.1 - 0.1 * t.greed);
    }
    case 'contract': {
      const seller = getOwn(state.companies, o.sellerCompanyId);
      const buyer = getOwn(state.companies, o.buyerCompanyId);
      if (!seller || !buyer) return false;
      const cid = o.commodityId;
      const market = state.commodities[cid].price;
      const close = closeOf(state.commodities[cid].priceHistory, market);
      const base = COMMODITIES[cid].basePrice;
      if (buyer.controllerId === bot.id) {
        const open = capacityNeed(buyer, cid) - extraction(buyer, cid) - contracted(state, buyer.id, cid, 'buy');
        return o.lots <= Math.floor(open) && o.price <= Math.min(market, close, base) * 0.97;
      }
      if (seller.controllerId === bot.id) {
        const surplus = extraction(seller, cid) - capacityNeed(seller, cid) - contracted(state, seller.id, cid, 'sell');
        return o.lots <= Math.floor(surplus) && o.price >= Math.max(Math.max(market, close, base) * 0.9, siteUnitCost(cid) * 1.3);
      }
      return false;
    }
    case 'cartel':
      return t.shadyPropensity >= 0.5;
  }
}
