/**
 * Fret depuis une case du plateau, pour décider (§5.8) :
 *   - `FreightRow` : sur une case libre, « dont fret » : ce que le fret pèse dans le gain du déménagement, par trimestre
 *     aux lots prévus, avec le signe du gain (une économie est positive) ;
 *   - le détail absolu matières / livraison vient de `FreightDetails`, partagé par toutes les fiches ;
 *   - `LaunchChoices` : « Que lancer ici ? » sur une case libre, les cinq secteurs, leur marge estimée et leur fret par lot.
 * Les chiffres viennent de ./freight (mêmes règles que la clôture) et des estimations de lancement du moteur.
 */
import { SECTOR_IDS, capitalCellId, type PlayerView, type SectorId } from '@muchomoney/core';
import { useContent, useUiLang } from '../../../i18n';
import { freightMessages } from '../../../i18n/freight';
import { useFmt } from '../../../fmt';
import { cx } from '../../../util';
import { InfoTip } from '../../../components/bits';
import { ownHexProduct } from './privacy';
import { launchFreight, productFreight, type FreightBreakdown } from './freight';
import { hexIsBuildable, type HexReference } from './hexModel';

/** Le fret d'un de mes produits vu depuis une case : la sienne, ou une case libre où il pourrait déménager. */
export interface ProductFreightFacts {
  intangible: boolean;
  /** La case est celle de l'usine du produit. */
  current: boolean;
  here: FreightBreakdown;
  now: FreightBreakdown;
  /** Écart de fret par lot avec l'usine actuelle (négatif : moins cher ici). */
  perLot: number;
  /** Lots prévus ce trimestre, plafonnés par la capacité. */
  planned: number;
}

/** Null hors de mes produits, et sur une case qui n'est ni la sienne ni une case libre constructible. */
export function productFreightFacts(view: PlayerView, productId: string, hexId: string): ProductFreightFacts | null {
  const tracked = ownHexProduct(view, productId);
  if (!tracked) return null;
  const { company, product, own } = tracked;
  const currentHex = product.hexId ?? capitalCellId(view.config);
  const current = hexId === currentHex;
  if (!current && !((view.hexes?.free ?? []).includes(hexId) && hexIsBuildable(hexId))) return null;
  const here = productFreight(view, company, product, hexId);
  const now = current ? here : productFreight(view, company, product, currentHex);
  const planned = Math.max(0, Math.floor(Math.min(own.production, product.capacity)));
  return { intangible: here.intangible, current, here, now, perLot: here.total - now.total, planned };
}

/** La ligne de fret, à placer dans la liste de chiffres (`dl`) de la fiche. */
export function FreightRow({ facts }: { facts: ProductFreightFacts }) {
  const fmt = useFmt();
  const text = freightMessages(useUiLang());
  if (facts.current) return null;
  if (facts.intangible) return <><dt>{text.partLabel}</dt><dd>{text.noFreight} <InfoTip text={text.intangible} align="right" /></dd></>;
  const { perLot, planned } = facts;
  // « inchangé » se décide sur les chiffres affichés (un dixième de k) : jamais un « 0 » en vert ou en rouge.
  const lotRoundsToZero = Math.round(Math.abs(perLot) * 10) === 0;
  const quarterRoundsToZero = planned === 0 || Math.round(Math.abs(perLot * planned) * 10) === 0;
  const unchanged = lotRoundsToZero && quarterRoundsToZero;
  const saving = !unchanged && perLot < 0;
  // Entre parenthèses, l'écart de coût par lot (négatif : moins cher ici), avec deux décimales s'il s'arrondit à zéro.
  const lotPrecision = lotRoundsToZero ? 2 : undefined;
  const lot = `${perLot > 0 ? '+' : ''}${fmt.lotPrice(perLot, lotPrecision)}`;
  // Même convention que le gain : une économie de fret est positive, par trimestre comme par lot seul.
  const quarter = fmt.signedMoney(-perLot * planned);
  const gainLot = `${perLot < 0 ? '+' : ''}${fmt.lotPrice(-perLot)}`;
  const value = unchanged ? text.unchanged
    : planned > 0 ? (saving ? text.saved(quarter, lot) : text.extra(quarter, lot))
    : saving ? text.savedPerLot(gainLot) : text.extraPerLot(gainLot);
  return <><dt>{text.partLabel}</dt><dd className={unchanged ? undefined : saving ? 'up' : 'down'}>{value}</dd></>;
}

/**
 * « Que lancer ici ? » : ouvert quand la référence suivie est une usine neuve, replié quand c'est l'un de mes produits.
 * Un clic sur un secteur en fait la référence suivie.
 */
export function LaunchChoices({ view, hexId, reference, onPickSector }: {
  view: PlayerView;
  hexId: string;
  reference: HexReference | null | undefined;
  onPickSector?: (sectorId: SectorId) => void;
}) {
  const fmt = useFmt();
  const content = useContent();
  const text = freightMessages(useUiLang());
  if (!(view.hexes?.free ?? []).includes(hexId) || !hexIsBuildable(hexId)) return null;
  const rows = SECTOR_IDS.map((sectorId) => {
    const estimate = view.sectors.find((s) => s.id === sectorId)?.launchByHex?.[hexId];
    return { sectorId, margin: estimate?.quarterlyProfit ?? null, freight: launchFreight(view, sectorId, hexId) };
  });
  const best = rows.reduce<{ sectorId: SectorId; margin: number } | null>((top, row) =>
    row.margin !== null && (!top || row.margin > top.margin) ? { sectorId: row.sectorId, margin: row.margin } : top, null);
  const activeSector = reference?.kind === 'launch' ? reference.sectorId : null;
  const table = <table className="hx-freight-table">
    <thead><tr><th scope="col">{text.sector}</th><th scope="col">{text.margin}</th><th scope="col">{text.freight}</th></tr></thead>
    <tbody>{rows.map((row) => {
      const sector = content.sectors[row.sectorId];
      const isBest = best?.sectorId === row.sectorId;
      return <tr key={row.sectorId} className={cx(isBest && 'hx-freight-best', activeSector === row.sectorId && 'hx-freight-active')}>
        <th scope="row">
          {onPickSector
            ? <button type="button" className="btn tiny ghost" aria-pressed={activeSector === row.sectorId} title={text.pickSector(sector.name)} onClick={() => onPickSector(row.sectorId)}>{sector.emoji} {sector.name}</button>
            : <>{sector.emoji} {sector.name}</>}
          {isBest && <span className="hx-freight-badge"> ★ {text.best}</span>}
        </th>
        <td>{row.margin === null ? text.noEstimate : fmt.signedMoney(row.margin)}</td>
        {/* Le détail matières / livraison en infobulle : la colonne reste lisible sur une ligne. */}
        <td title={row.freight.intangible ? undefined : text.split(fmt.lotPrice(row.freight.materialsCost), fmt.lotPrice(row.freight.deliveryCost))}>
          {row.freight.intangible ? text.noFreight : fmt.lotPrice(row.freight.total)}
        </td>
      </tr>;
    })}</tbody>
  </table>;
  return reference?.kind === 'product'
    ? <details className="hx-freight hx-freight-launch"><summary>{text.launchTitle}</summary><p className="hx-sheet-note">{text.launchHint}</p>{table}</details>
    : <section className="hx-freight hx-freight-launch" aria-label={text.launchTitle}><h4>{text.launchTitle}</h4><p className="hx-sheet-note">{text.launchHint}</p>{table}</section>;
}
