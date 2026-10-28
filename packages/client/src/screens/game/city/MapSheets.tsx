/**
 * La carte (§5.8) : les fiches de la colonne de droite (ordinateur) ou de la modale (téléphone).
 * Toute décision géographique se prend ici, dans la fiche, pour l'entreprise qui agit (`acting`) :
 *   - Fiche d'une zone : part des clients, port et bourses à la capitale ou distance routière du port,
 *     spécialités de main-d'œuvre, usines de la zone (les miennes ouvrent « Mes usines »), coût estimé de
 *     chacun de mes produits s'il déménageait ici (« Déménager ici » montre ZoneMoveForm dans la fiche,
 *     avec un retour à la fiche), l'écart de lancement par secteur face à la capitale, puis la section
 *     « Lancer ici » (ZoneLaunchForm pour cette zone ; une intention « lancer » la monte juste sous le titre).
 *   - Fiche d'un gisement : DepositPanel (enchère, retrait, sommeil/relance, dernier résultat) pour
 *     l'entreprise qui agit ; sans entreprise qui agit (spectateur), la fiche montre elle-même matière,
 *     richesse, exploitant (ou « libre ») et, pour chacun de mes produits qui consomme la matière, le prix
 *     du lot livré face au port — autant d'informations que le panneau affiche déjà quand il est là.
 * Règles de confidentialité : aucune lecture directe des données privées — `ownProduct` de ./privacy,
 * puis DÉSTRUCTURATION (`const { zones } = own; const { unitCost } = zones;`), vérifié par test/city.test.ts.
 * Les formulaires (LaunchForms, MoveForms, DepositPanel) vivent hors de city/ et gèrent les leurs.
 */
import type { ReactNode, Ref } from 'react';
import type { CityId, CommodityId, CompanyView, PlayerView, ProductView, SectorId, ZoneId } from '@muchomoney/core';
import { CITIES, COMMODITIES, DEFAULT_ZONE, SECTORS, SECTOR_IDS, ZONES, cityWeights, roadRoute, zoneOf } from '@muchomoney/core';
import { useContent, useT, useUiLang } from '../../../i18n';
import { sheetReadabilityMessages } from '../../../i18n/sheetReadability';
import { useFmt } from '../../../fmt';
import { cx } from '../../../util';
import type { TabId } from '../../GameScreen';
import { deliveredLotPrice, extractionCostNow } from '../../../transport';
import { isOwn, ownProduct } from './privacy';
import type { DepositNode, FactoryMark, ValueReference } from './mapModel';
import { ZoneLaunchForm } from '../LaunchForms';
import { ZoneMoveForm } from '../MoveForms';
import { DepositPanel } from '../DepositPanel';
import { FreightDetails } from '../../../components/FreightDetails';
import { launchFreightClassic, productFreightClassic } from './freight';

/** Pilote automatique (pas de joueur dirigeant) : gris des scènes d'usine. */
const AUTOPILOT = '#8a8273';

/** Nom d'une zone dans la langue de l'interface : la zone d'une ville porte le nom de sa ville. */
export function zoneLabel(mapNames: ReturnType<typeof useContent>['mapNames'], zoneId: ZoneId): string {
  return zoneId === 'plain' || zoneId === 'mountain' ? mapNames.zones[zoneId] : mapNames.cities[zoneId as CityId];
}

type T = ReturnType<typeof useT>;

/** Richesse d'un gisement d'après sa capacité (50 = riche, 40 = moyen, 30 = pauvre). */
export function richnessTier(t: T, capacity: number): string {
  return capacity >= 50 ? t.sites.richness.rich : capacity >= 40 ? t.sites.richness.medium : t.sites.richness.poor;
}

/** « 561 km » : la distance accompagne les prix livrés (même libellé dans les deux langues). */
export function kmLabel(fmt: ReturnType<typeof useFmt>, km: number): string {
  return `${fmt.int(Math.round(km))} km`;
}

/** Moins typographique (−, U+2212) : le '-' ASCII de formatSignedPct du cœur devient celui des fiches. */
const minus = (s: string) => s.replace('-', '−');

// ---------------------------------------------------------------------------
// Pictogrammes des matières (traits, cadre 16 × 16) — pas d'emoji sur la carte
// ---------------------------------------------------------------------------

/** Chemin du pictogramme d'une matière : goutte (pétrole), pile (lithium), cube (sucre), puce. */
export const COMMODITY_GLYPH: Record<CommodityId, ReactNode> = {
  oil: <path d="M8 2C8 2 3.5 7.6 3.5 10.6a4.5 4.5 0 0 0 9 0C12.5 7.6 8 2 8 2z" />,
  lithium: (
    <>
      <rect x="2" y="5" width="11" height="7" rx="1" />
      <path d="M13.5 7.2v2.6M5 8.5h4" />
    </>
  ),
  sugar: <path d="M8 2.2l5.6 2.9v6l-5.6 2.9-5.6-2.9v-6z M2.4 5.1L8 8l5.6-2.9 M8 8v5.8" />,
  chips: (
    <>
      <rect x="4" y="4" width="8" height="8" rx="0.8" />
      <path d="M6 2v2M10 2v2M6 12v2M10 12v2M2 6h2M2 10h2M12 6h2M12 10h2" />
    </>
  ),
};

/** Pictogramme autonome d'une matière (listes, fiches). */
export function CommodityGlyph({ id, size = 14, color }: { id: CommodityId; size?: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="map-glyph"
    >
      {COMMODITY_GLYPH[id]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Fiche d'une zone
// ---------------------------------------------------------------------------

interface ZoneSheetProps {
  zoneId: ZoneId;
  view: PlayerView;
  /** Toutes les usines du salon (mapFactories), la fiche garde celles de la zone. */
  factories: FactoryMark[];
  goTo: (tab: TabId) => void;
  /** Une de mes usines cliquée : sélectionne l'entreprise puis bascule sur « Mes usines ». */
  onOpenFactory: (companyId: string, productId: string) => void;
  /** Entreprise qui agit dans la fiche (section « Lancer ici ») ; null : spectateur, pas de formulaire. */
  acting: CompanyView | null;
  /** Secteur présélectionné du formulaire de lancement (intention « lancer » à l'ouverture de la fiche). */
  launchSector?: SectorId;
  /** Tracked/compared lens reference; undefined keeps the legacy list of owned products. */
  reference?: ValueReference | null;
  /** Sector changes in the launch form update the shared tracked reference. */
  onLaunchSectorChange?: (sectorId: SectorId) => void;
  /** Retained for callers with a launch intent; every open form now comes first. */
  launchFirst?: boolean;
  /** Produit en déménagement vers cette zone : ZoneMoveForm remplace le corps de la fiche. */
  move?: { company: CompanyView; product: ProductView } | null;
  /** « Déménager ici » : montre le formulaire de déménagement dans la fiche (MapView pilote `move`). */
  onMove: (productId: string) => void;
  /** Retour à la fiche de la zone depuis le formulaire de déménagement (lien et `onDone` du formulaire). */
  onBackToZone: () => void;
  /** Focus clavier à l'ouverture de la fiche (titre). */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Accessible group focused on every form opening, including in-sheet decisions. */
  formRef?: Ref<HTMLDivElement>;
}

/** Marge de défilement des titres de fiche : la barre du haut est collante (scrollIntoView de l'intention). */
const SHEET_SCROLL_MARGIN = { scrollMarginTop: 'calc(var(--topbar-h) + var(--tabs-h, 0px) + 8px)' } as const;

export function ZoneSheet({ zoneId, view, factories, goTo, onOpenFactory, acting, launchSector, reference, onLaunchSectorChange, move, onMove, onBackToZone, headingRef, formRef }: ZoneSheetProps) {
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const readability = sheetReadabilityMessages(useUiLang());
  const m = t.city.map;
  const zs = m.zoneSheet;
  const mapNames = content.mapNames;
  const name = zoneLabel(mapNames, zoneId);
  const city = Object.hasOwn(CITIES, zoneId) ? CITIES[zoneId as CityId] : null;
  const capital = zoneId === DEFAULT_ZONE;

  // Spécialités de main-d'œuvre : les secteurs sous × 1, regroupés quand le tarif est le même.
  const sectorName = (id: SectorId) => content.sectors[id]?.name ?? view.sectors.find((s) => s.id === id)?.name ?? id;
  const laborGroups = new Map<number, SectorId[]>();
  for (const id of SECTOR_IDS) {
    const rate = ZONES[zoneId].labor[id];
    if (rate < 1) laborGroups.set(rate, [...(laborGroups.get(rate) ?? []), id]);
  }

  const here = factories.filter((f) => f.zoneId === zoneId);
  // Mes produits (données privées déstructurées) : coût estimé dans cette zone et écart avec la zone actuelle.
  const mine = view.companies.filter(isOwn).flatMap((c) =>
    c.products.flatMap((p) => {
      const own = ownProduct(p);
      if (!own) return [];
      const { zones } = own;
      const { unitCost } = zones;
      return [{ company: c, product: p, unitCost }];
    }),
  );
  const visibleMine = reference === undefined ? mine
    : reference?.kind === 'product' ? mine.filter(({ product }) => product.id === reference.productId) : [];
  const referencedLaunch = reference?.kind === 'launch' ? view.sectors.find((s) => s.id === reference.sectorId) : null;
  const launchCosts = referencedLaunch?.launchByZone;
  const { unitCost: launchCost } = launchCosts?.[zoneId] ?? {};
  const { unitCost: capitalCost } = launchCosts?.[DEFAULT_ZONE] ?? {};
  const launchGap = launchCost !== undefined && capitalCost !== undefined && capitalCost > 0 ? (launchCost - capitalCost) / capitalCost : null;
  const route = capital ? null : roadRoute(zoneId, DEFAULT_ZONE);
  const formOpen = Boolean(move || acting);

  return (
    <div className="map-sheet-body">
      <h3 className="map-sheet-title" ref={headingRef} tabIndex={-1} style={SHEET_SCROLL_MARGIN}>
        {name}
      </h3>
      {city && (
        <p className="small">
          <b>{m.clientShare(fmt.pct(city.share, 0))}</b>
        </p>
      )}
      {formOpen && (
        <div className="map-sheet-form" data-map-form ref={formRef} role="group" tabIndex={-1}
          aria-label={move ? `${t.product.move} · ${move.product.name}` : zs.launchHere} style={SHEET_SCROLL_MARGIN}>
          {move ? <>
            <ZoneMoveForm company={move.company} product={move.product} zoneId={zoneId} onDone={onBackToZone} />
            <button type="button" className="btn tiny ghost" onClick={onBackToZone}>{zs.backToZone}</button>
          </> : acting && <>
            <h4 className="map-sheet-sub">{zs.launchHere}</h4>
            <ZoneLaunchForm company={acting} zoneId={zoneId} initialSector={launchSector ?? (reference?.kind === 'launch' ? reference.sectorId : undefined)} trackedSector={launchSector} onSectorChange={onLaunchSectorChange} />
          </>}
        </div>
      )}
      {visibleMine.map(({ company, product, unitCost }) => {
        const current = zoneOf(product).id;
        const diff = unitCost[zoneId] - unitCost[current];
        return (
          <div key={product.id} className="map-sheet-own">
            <div className="small">
              <b>{product.name}</b> · {company.name}
            </div>
            <div className="small">
              {zs.unitCostHere(fmt.money(unitCost[zoneId]))}{' '}
              {diff < 0 ? (
                <span className="up">{t.product.moveCheaper(fmt.money(-diff))}</span>
              ) : diff > 0 ? (
                <span className="down">{t.product.moveDearer(fmt.money(diff))}</span>
              ) : null}
            </div>
            {move?.product.id !== product.id && <FreightDetails view={view} freight={productFreightClassic(view, company, product, zoneId)} />}
            {zoneId !== current && (
              <div>
                <button type="button" className="btn tiny" onClick={() => onMove(product.id)}>
                  {zs.moveHere}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {referencedLaunch && launchCost !== undefined && <div className="map-sheet-own">
        <div className="small"><b>{m.refNewPlant(sectorName(referencedLaunch.id))}</b></div>
        <div className="small">{zs.unitCostHere(fmt.money(launchCost))}</div>
        {(!acting || move) && <FreightDetails view={view} freight={launchFreightClassic(view, referencedLaunch.id, zoneId)} />}
        {launchGap !== null && <div className={cx('small', launchGap < 0 ? 'up' : launchGap > 0 ? 'down' : undefined)}>
          {zs.sectorGap(sectorName(referencedLaunch.id), minus(fmt.signedPct(launchGap, 1)))}
        </div>}
      </div>}

      {capital ? (
        <>
          <p className="small">{zs.capitalLine}</p>
          <div className="row wrap">
            <button type="button" className="btn small" onClick={() => goTo('commodities')}>
              {zs.portButton}
            </button>
            <button type="button" className="btn small ghost" onClick={() => goTo('stocks')}>
              {zs.stocksButton}
            </button>
          </div>
        </>
      ) : (
        route && <p className="small">{zs.roadKm(kmLabel(fmt, route.km))}</p>
      )}
      <h4 className="map-sheet-sub">{zs.factoriesTitle}</h4>
      {here.length === 0 ? (
        <p className="small muted">{zs.empty}</p>
      ) : (
        <ul className="map-sheet-lines">
          {here.map((f) => (
            <li key={f.productId}>
              {f.mine ? (
                <button type="button" className="map-row-btn" aria-label={zs.openFactoryAria(f.productName)} onClick={() => onOpenFactory(f.companyId, f.productId)}>
                  <span className="map-swatch" style={{ background: f.color ?? AUTOPILOT }} aria-hidden />
                  <span className="map-row-main">
                    <b>{f.productName}</b> · {f.companyName} <span className="muted">{zs.youMark}</span>
                  </span>
                </button>
              ) : (
                <span className="map-line">
                  <span className="map-swatch" style={{ background: f.color ?? AUTOPILOT }} aria-hidden />
                  <span className="map-row-main">
                    <b>{f.productName}</b> · {f.companyName}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <details key={`${zoneId}:${move ? move.product.id : acting ? `launch:${acting.id}` : 'description'}`} className="map-sheet-description">
        <summary>{readability.locationDetails}</summary>
        {city && (
          // Marchés régionaux (§5.2 bis) : la part des clients de chaque secteur qui habitent ici, le secteur fétiche en tête.
          <div className="small">
            <p className="map-sheet-sub">{zs.customersTitle}</p>
            <ul className="map-sheet-lines">
              {[...SECTOR_IDS]
                .sort((a, b) => cityWeights(b)[city.id] - cityWeights(a)[city.id])
                .map((id) => {
                  const favourite = SECTOR_IDS.every((other) => CITIES[city.id].taste[id] >= CITIES[city.id].taste[other]);
                  return (
                    <li key={id}>
                      {favourite ? <b>{sectorName(id)}</b> : sectorName(id)} {fmt.pct(cityWeights(id)[city.id], 0)}
                      {favourite && <span className="badge up">{zs.favourite}</span>}
                    </li>
                  );
                })}
            </ul>
            <p className="muted">{zs.salesNote}</p>
          </div>
        )}
        {laborGroups.size > 0 && (
          <ul className="map-sheet-lines">
            {[...laborGroups.entries()].map(([rate, ids]) => (
              <li key={rate} className="small">
                {zs.laborSpecial(`−${fmt.pct(1 - rate, 0)}`, zs.join(ids.map(sectorName)))}
              </li>
            ))}
          </ul>
        )}

        {!capital && (
          <>
            <h4 className="map-sheet-sub">{zs.vsCapitalTitle}</h4>
            <div className="map-gap-cells">
              {view.sectors.flatMap((s) => {
                const byZone = s.launchByZone;
                if (!byZone) return [];
                const { unitCost: atCapital } = byZone[DEFAULT_ZONE];
                const { unitCost: atZone } = byZone[zoneId];
                if (!(atCapital > 0)) return [];
                const gap = (atZone - atCapital) / atCapital;
                const sName = content.sectors[s.id]?.name ?? s.name;
                const label = zs.sectorGap(sName, minus(fmt.signedPct(gap, 1)));
                return [
                  <div key={s.id} className={cx('map-gap-cell', gap < 0 ? 'up' : gap > 0 ? 'down' : undefined)} title={label} aria-label={label}>
                    <span className="map-gap-sector">{sName}</span>
                    <b>{minus(fmt.signedPct(gap, 1))}</b>
                  </div>,
                ];
              })}
            </div>
          </>
        )}

      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fiche d'un gisement
// ---------------------------------------------------------------------------

interface DepositSheetProps {
  deposit: DepositNode;
  view: PlayerView;
  /** Entreprise qui agit dans la fiche (DepositPanel : enchère, retrait, sommeil) ; null : spectateur. */
  acting: CompanyView | null;
  headingRef?: Ref<HTMLHeadingElement>;
  formRef?: Ref<HTMLDivElement>;
}

export function DepositSheet({ deposit, view, acting, headingRef, formRef }: DepositSheetProps) {
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const ds = t.city.map.depositSheet;
  const mapNames = content.mapNames;
  const cid = deposit.commodityId;
  const commodityName = content.commodities[cid]?.name ?? COMMODITIES[cid].name;
  const market = view.commodities.find((c) => c.id === cid)?.price ?? COMMODITIES[cid].basePrice;

  // Coût d'extraction : le mien si je l'exploite (données publiques de mes filiales), sinon l'estimation
  // du tarif de base sous l'effet des news — le même chiffre que le panneau des filiales.
  let extraction = extractionCostNow(cid, view.commodities.find((c) => c.id === cid)?.siteCostFactor);
  for (const c of view.companies) {
    if (!isOwn(c)) continue;
    const site = (c.sites ?? []).find((s) => s.id === deposit.slotId);
    if (site) extraction = site.currentUnitCost;
  }

  // Mes produits qui consomment la matière : le lot livré à leur usine, face à l'achat au port. Seulement sur un
  // gisement libre (il se dispute aux enchères) ou exploité par leur propre entreprise : une filiale ne sert que la
  // sienne (§5.8) ; inutile sur le gisement d'un rival ou d'une autre de mes entreprises.
  const consumers = view.companies
    .filter((c) => isOwn(c) && (deposit.operatorId === null || deposit.operatorId === c.id))
    .flatMap((c) => c.products.filter((p) => (SECTORS[p.sectorId].inputs[cid] ?? 0) > 0));

  // L'emplacement de filiale du gisement : DepositPanel (enchère, retrait, sommeil/relance, dernier
  // résultat) pour l'entreprise qui agit, à la suite de la fiche.
  const slot = acting ? view.siteSlots.find((s) => s.id === deposit.slotId) : undefined;
  // Quand DepositPanel est là, il dit déjà nom, matière et richesse (kicker + titre), exploitant ou
  // « libre » (statut) et les prix livrés (table) : la fiche ne garde que son titre, sans rien répéter.
  const panel = acting && slot ? <DepositPanel company={acting} slot={slot} hideTitle /> : null;

  return (
    <div className="map-sheet-body">
      <h3 className="map-sheet-title" ref={headingRef} tabIndex={-1} style={SHEET_SCROLL_MARGIN}>
        {deposit.name}
      </h3>
      {panel && <div className="map-sheet-form" data-map-form ref={formRef} role="group" tabIndex={-1} aria-label={deposit.name} style={SHEET_SCROLL_MARGIN}>{panel}</div>}
      {!panel && (
        <>
          <p className="small">
            {commodityName} · {ds.richnessLine(richnessTier(t, deposit.capacity), deposit.capacity)}
          </p>
          <p className="small">
            {deposit.operatorId ? (
              <>
                <span className="map-swatch" style={{ background: deposit.color ?? AUTOPILOT }} aria-hidden />{' '}
                {ds.operatedBy(deposit.operatorName ?? '')}
              </>
            ) : (
              <span className="up">{ds.free}</span>
            )}
          </p>
          {consumers.length > 0 && (
            <ul className="map-sheet-lines">
              {consumers.map((p) => {
                const zoneId = zoneOf(p).id;
                const km = SECTORS[p.sectorId].intangible ? 0 : roadRoute(deposit.slotId, zoneId)?.km ?? 0;
                const price = deliveredLotPrice({ kind: 'deposit', slotId: deposit.slotId, extractionCost: extraction }, zoneId, view.transportFactor ?? 1, p.sectorId);
                const atPort = deliveredLotPrice({ kind: 'port', commodityId: cid, marketPrice: market }, zoneId, view.transportFactor ?? 1, p.sectorId);
                return (
                  <li key={p.id} className="small">
                    {ds.delivered(p.name, zoneLabel(mapNames, zoneId), kmLabel(fmt, km), fmt.money(price))}{' '}
                    <span className="muted">({t.sites.atPort(fmt.money(atPort))})</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
