/**
 * Formulaires de déménagement autonomes : pour un emplacement déjà choisi, la fiche et l'action.
 * Mode classique : ZoneMoveForm pour une zone (marge, coûts, clients, rentabilité), le tableau
 * comparatif des 7 zones en repli et le pied « Rester » / « Déménager ». Mode hexagonal :
 * HexMoveForm pour une case (mise en attente, verdict et fiche chiffrée, repli, enchère).
 * Le panneau latéral de « La carte » les monte directement.
 */
import { useState } from 'react';
import type { CityId, CompanyView, ContentBundle, ProductView, ZoneId } from '@muchomoney/core';
import { CITY_IDS, SECTORS, hexPlaceName, proximityByHex, zoneLabor } from '@muchomoney/core';
import { sendAction } from '../../api';
import { AmountForm } from '../../components/AmountForm';
import { FreightDetails } from '../../components/FreightDetails';
import { productFreightClassic } from './city/freight';
import { useGame } from '../../hooks/useGame';
import { plannedLots, zoneRows } from './zoneChoice';
import { cityClientShare, clientBars, moveQuartersLeft, plantsInZone, rivalInZone, unitCostSplit, unitMoney, wagePressure } from './movePickerModel';
import { useContent, useRoomLang, useT, useUiLang } from '../../i18n';
import { decisionText } from '../../i18n/decisionReadability';
import { DecisionSummary } from './DecisionSummary';
import { parseNumber, useFmt } from '../../fmt';
import type { HexReference } from './city/hexModel';
import { liveHexBids, ownProduct } from './city/privacy';
import { HexBidRules, HexBidSummary, HexFallbackChoice, cellReason, initialBidHex, type Fallback } from './LaunchForms';
import { hexMoveCost } from './hexPayback';
import { moveLeavesTerrain } from './startingTerrain';
import './HexBidForms.css';

/** Nom d'une zone dans la langue de l'interface (§5.8) : la zone d'une ville porte le nom de sa ville. */
function zoneName(mapNames: ContentBundle['mapNames'], id: ZoneId): string {
  return id === 'plain' || id === 'mountain' ? mapNames.zones[id] : mapNames.cities[id];
}

/** Only report known local bonuses actually lost at the destination, never private rival data. */
export function moveLostCities(product: ProductView, destination: { zoneId: ZoneId } | { hexId: string }): CityId[] {
  if (!ownProduct(product) || product.incubator || SECTORS[product.sectorId].localBonus <= 0) return [];
  if ('hexId' in destination) {
    if (!product.hexId) return [];
    const before = proximityByHex(product.sectorId, product.hexId);
    const after = proximityByHex(product.sectorId, destination.hexId);
    return CITY_IDS.filter((city) => city !== 'capital' && before[city] > 1 && after[city] <= 1);
  }
  return CITY_IDS.filter((city) => city !== 'capital' && city === product.zoneId && city !== destination.zoneId);
}

export function MoveLosses({ product, destination, perksText }: { product: ProductView; destination: { zoneId: ZoneId } | { hexId: string }; perksText?: string | null }) {
  const decision = decisionText(useUiLang());
  const mapNames = useContent().mapNames;
  const fmt = useFmt();
  const cities = moveLostCities(product, destination);
  if (!perksText && cities.length === 0) return null;
  return <section className="decision-losses warn" aria-label={decision.losses}>
    <p><strong>{decision.losses}</strong></p>
    <ul>{perksText && <li>{perksText}</li>}{cities.map((city) => <li key={city}>{decision.localLoss(mapNames.cities[city], fmt.pct(SECTORS[product.sectorId].localBonus, 0))}</li>)}</ul>
  </section>;
}

/**
 * Déménagement classique vers une zone déjà choisie : le coût et l'indice transport, la fiche de
 * la zone, le tableau des 7 zones en repli (aide clavier et lecteur d'écran) et le pied d'action.
 * `onDone` : appelé par « Rester » et après un déménagement accepté (la fenêtre se referme).
 * Null sans données privées de zones.
 */
export function ZoneMoveForm({
  company,
  product,
  zoneId,
  onDone,
}: {
  company: CompanyView;
  product: ProductView;
  zoneId: ZoneId;
  onDone?: () => void;
}) {
  const t = useT();
  const mp = t.movePicker;
  const fmt = useFmt();
  const { view } = useGame();
  const mapNames = useContent().mapNames;
  const decision = decisionText(useUiLang());
  const here: ZoneId = product.zoneId ?? 'capital';
  const sel = zoneId;
  // Trimestres restant après cette clôture : sans eux, la capacité en chantier ne servira plus.
  const quartersAfter = moveQuartersLeft(view) - 1;
  const rows = zoneRows(product, quartersAfter);
  if (!rows) return null;
  const zones = product.private!.zones;
  const currentCost = zones.unitCost[here];
  const planned = plannedLots(product, quartersAfter);
  // Le déménagement se paie comptant (en charges exceptionnelles) : la trésorerie doit le couvrir.
  const noCash = zones.moveCost > company.cash;
  const name = (z: ZoneId) => zoneName(mapNames, z);
  const row = rows.find((r) => r.zoneId === sel)!;
  const currentRow = rows.find((r) => r.isCurrent)!;
  const sectorName = mp.sectorNames[product.sectorId];
  const steady = planned.steadyState;
  // La capacité qui compte : l'installée ; en régime (lancement), celle du chantier.
  const capacity = product.capacity + (steady ? product.private!.pendingCapacity : 0);

  const split = unitCostSplit(view, product, sel);
  const plants = plantsInZone(view, sel, product.id);
  const pressure = wagePressure(sel, plants);
  const laborMult = zoneLabor(sel, product.sectorId);
  // split.labour est le résidu exact du moteur : au-delà d'un point d'écart avec zone × pression
  // salariale, la note nomme le reste (actualités, délocalisation).
  const labourBase = SECTORS[product.sectorId].laborCost * laborMult * (1 + pressure);
  const labourResidual = split && labourBase > 0 ? split.labour / labourBase - 1 : 0;
  const labourNote =
    (laborMult === 1 ? mp.labourStd : mp.labourSpec(fmt.signedPct(laborMult - 1, 0))) +
    (pressure > 0 ? mp.labourPlants(plants, fmt.signedPct(pressure, 0)) : '') +
    (Math.abs(labourResidual) > 0.01 ? mp.labourOther(fmt.signedPct(labourResidual, 0)) : '');
  const share = cityClientShare(product.sectorId, sel);
  const blurb = mp.blurbs[sel](sectorName, share === null ? null : fmt.pct(share, 0));
  // Même quantité que les marges des épingles : les lots vendables à cette clôture
  // (ou, en régime, ceux du chantier), plafonnés par la demande.
  const fullLots = Math.min(row.demand ?? planned.lots, planned.lots);
  const bars = clientBars(view, product, sel);
  const barMax = bars ? Math.max(1, ...bars.map((b) => Math.max(b.lots, b.today ?? 0))) : 1;
  const rival = rivalInZone(view, company.id, product, sel);
  const remaining = moveQuartersLeft(view);

  const sheet = (
    <>
      <p className="pk-kicker">{mp.sheetKicker}</p>
      <p className="pk-sub">{blurb}</p>

      <div className="pk-save" style={{ marginTop: 8 }}>
        <p className="pk-save-note">{steady ? mp.marginTitleSteady(fmt.lots(fullLots)) : mp.marginTitle(fmt.lots(fullLots))}</p>
        {row.margin === null ? (
          <p className="pk-save-note">{mp.marginUnknown}</p>
        ) : (
          <div className="row between">
            <span className="pk-save-num">{fmt.money(row.margin)}</span>
            {row.isCurrent ? (
              <span className="pk-note">{mp.marginYours}</span>
            ) : null}
          </div>
        )}
        <p className="pk-save-note">{mp.marginFoot(fmt.lots(fullLots))}</p>
      </div>

      <div className="pk-kv" style={{ marginTop: 8 }}>
        {split && <>
          <div className="pk-kv-row">
            <span className="pk-kv-k">{mp.kvLabour}</span>
            <span className="pk-kv-v">{unitMoney(fmt, split.labour)}</span>
            <span className="pk-kv-note">{labourNote}</span>
          </div>
          <div className="pk-kv-row">
            <span className="pk-kv-k">{mp.kvMaterials}</span>
            <span className="pk-kv-v">{unitMoney(fmt, split.materials)}</span>
            <span className="pk-kv-note">{mp.materialsPort}</span>
          </div>
        </>}
          <div className="pk-kv-row">
            <span className="pk-kv-k">{mp.kvUnit}</span>
            <span className="pk-kv-v">{unitMoney(fmt, row.unitCost)}</span>
            {!row.isCurrent && <span className="pk-kv-note">{mp.unitToday(unitMoney(fmt, currentCost))}</span>}
          </div>
          <div className="pk-kv-row">
            <span className="pk-kv-k">{mp.kvDemand}</span>
            <span className="pk-kv-v">{row.demand === null ? '—' : fmt.lots(row.demand)}</span>
            <span className="pk-kv-note">
              {row.demand === null ? mp.demandUnknown : !row.isCurrent && currentRow.demand !== null ? mp.demandToday(fmt.lots(currentRow.demand)) : ''}
            </span>
          </div>
      </div>

      <FreightDetails view={view} freight={productFreightClassic(view, company, product, sel)} />

      {row.demand !== null && (
        <p className="pk-note" style={{ marginTop: 8 }}>
          {row.demand >= capacity ? mp.clientsOk(fmt.lots(capacity)) : mp.clientsShort(fmt.lots(capacity))}
        </p>
      )}

      {bars && (
        <div style={{ marginTop: 8 }}>
          <p className="pk-note">
            <strong>{mp.clientsTitle}</strong>
          </p>
          <div className="pk-bars">
            {bars.map((b) => (
              <div className="pk-bar-row" key={b.city} title={mp.barTitle(mapNames.cities[b.city], fmt.lots(b.lots))}>
                <span className="pk-bar-name">{mapNames.cities[b.city]}</span>
                <span className="pk-bar-track">
                  <span className="pk-bar-fill" style={{ width: `${(b.lots / barMax) * 100}%` }} />
                  {b.today !== null && <span className="pk-bar-today" style={{ left: `${Math.min(100, (b.today / barMax) * 100)}%` }} />}
                </span>
                <span className="pk-bar-value">{fmt.fixed(b.lots, 1)}</span>
                <span className="pk-bar-delta">{b.today === null ? '—' : Math.abs(b.lots - b.today) < 0.05 ? '=' : `${b.lots > b.today ? '+' : ''}${fmt.fixed(b.lots - b.today, 1)}`}</span>
              </div>
            ))}
          </div>
          {bars.some((b) => b.today !== null) && <p className="pk-bars-cap">{mp.clientsCaption(name(here))}</p>}
        </div>
      )}

      <p className="pk-note" style={{ marginTop: 8 }}>
        {plants === 0 ? mp.plantsNone : sel === 'capital' ? mp.plantsCapital(plants) : mp.plantsSome(plants, fmt.signedPct(pressure, 0))}
      </p>
      {rival && <p className="pk-note">{mp.competitor(rival.product, rival.company)}</p>}
      {row.isCurrent && (
        <p className="pk-note" style={{ marginTop: 8 }}>
          {mp.currentNote}
        </p>
      )}
    </>
  );

  const footer = (
    <div>
      {noCash && !row.isCurrent && <p className="pk-note">{t.product.moveNoCash}</p>}
      <div className="row end" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" className="btn ghost" onClick={onDone}>
          {mp.ctaStay(name(here))}
        </button>
        {!row.isCurrent && (
          <button
            type="button"
            className="btn primary"
            disabled={noCash}
            title={noCash ? t.product.moveNoCash : undefined}
            onClick={() =>
              void sendAction({ type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: sel }).then((r) => {
                if (r.ok) onDone?.();
              })
            }
          >
            {t.product.move}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <DecisionSummary destination={name(sel)} total={zones.moveCost === 0 ? t.product.moveFree : fmt.money(zones.moveCost)}
        timing={decision.moveNow} gain={row.marginDiff === null ? '—' : fmt.signedMoney(row.marginDiff)} savings
        payback={row.isCurrent ? '—' : zones.moveCost === 0 && (row.marginDiff ?? 0) > 0 ? decision.quarters(0) : row.paybackQuarters === null ? decision.noPayback : decision.quarters(row.paybackQuarters)}>
        {row.paybackQuarters !== null && row.paybackQuarters > remaining && <p className="small warn">{decision.latePayback}</p>}
        {(product.private?.pendingCapacity ?? 0) > 0 && zones.moveCost > 0 && <p className="small muted">{decision.construction(fmt.lots(product.private!.pendingCapacity))}</p>}
        <MoveLosses product={product} destination={{ zoneId: sel }} />
        {footer}
      </DecisionSummary>
      <p className="small muted">{t.product.moveHint}</p>
      {sheet}
      <details className="pk-details">
        <summary>{decision.otherZones}</summary>
        <table>
          <thead>
            <tr>
              <th>{mp.tableZone}</th>
              <th>{mp.tableCost}</th>
              <th>{mp.tableDemand}</th>
              <th>{mp.tableMargin}</th>
              <th>{mp.tableDiff}</th>
            </tr>
          </thead>
          <tbody>
            {rows.filter((r) => r.zoneId !== sel).map((r) => (
              <tr key={r.zoneId}>
                <th scope="row">
                  {name(r.zoneId)}
                  {r.isCurrent ? ` ${mp.currentMark}` : ''}
                </th>
                <td>{unitMoney(fmt, r.unitCost)}</td>
                <td>{r.demand === null ? '—' : fmt.lots(r.demand)}</td>
                <td>{r.margin === null ? '—' : fmt.money(r.margin)}</td>
                <td>{r.isCurrent || r.marginDiff === null ? '—' : fmt.signedMoney(r.marginDiff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

/* -----------------------------------------------------------------------------------------------
 * Mode hexagonal : déménagement (ou installation d'un produit d'incubateur) vers une case déjà
 * choisie, avec enchère.
 * --------------------------------------------------------------------------------------------- */

/**
 * Déménagement vers une case choisie : résumé, pertes et enchère d'abord, puis repli (à
 * l'incubateur, avec son échéance) ; la règle de l'enchère et les aides dans un pli fermé.
 * `onDone` est appelé par « Annuler » et après une mise de déménagement acceptée. `inSheet` :
 * monté dans la fiche de la case.
 */
export function HexMoveForm({ company, product, hexId, onDone, inSheet = false, compact = false }: {
  company: CompanyView;
  product: ProductView;
  hexId?: string | null;
  onDone?: () => void;
  inSheet?: boolean;
  /** The map palette supplies the location; retain bid, fallback and withdrawal without another summary sheet. */
  compact?: boolean;
}) {
  const { view } = useGame();
  const t = useT();
  const h = t.hex;
  const fmt = useFmt();
  const uiLang = useUiLang();
  const decision = decisionText(uiLang);
  const roomLang = useRoomLang();
  const pending = liveHexBids(view).find((bid) => bid.companyId === company.id && bid.productId === product.id);
  const [fallback, setFallback] = useState<Fallback>(pending?.fallback ?? 'nearest');
  const [bidLive, setBidLive] = useState<{ key: string; raw: string } | null>(null);
  const reference: HexReference = { kind: 'product', productId: product.id };
  const selected = hexId ?? pending?.hexId ?? initialBidHex(view, reference);
  const cost = hexMoveCost(product);
  const reserve = selected ? view.hexes?.reserve[selected] ?? 0 : 0;
  const amountKey = selected ?? '';
  const bid = bidLive && bidLive.key === amountKey ? parseNumber(bidLive.raw, uiLang) : reserve;
  const perksTerrain = moveLeavesTerrain(view, company, product);
  const perksText = !perksTerrain ? null : perksTerrain.runningEffects.headquarters ? h.verdictPerksHq(perksTerrain.name) : h.verdictPerksFactory(perksTerrain.name);
  const max = Math.max(0, company.cash - cost);
  const reason = cellReason(view, selected, max, reserve, h, product.id);
  const amountForm = <AmountForm key={selected} label={h.formBid} min={reserve} max={max} initial={reserve} presets={[]} disabledReason={reason} submitLabel={h.formMoveBid} after={(bid) => h.formCashAfter(fmt.money(company.cash - cost - bid))} onRawChange={(raw) => setBidLive({ key: amountKey, raw })} onSubmit={async (bid) => {
    if (reason || !selected) return { ok: false };
    const result = await sendAction({ type: 'moveFactory', companyId: company.id, productId: product.id, hexId: selected, bid, ...(product.incubator ? { fallback } : {}) });
    if (result.ok) onDone?.();
    return result;
  }} />;
  const pendingControls = pending && <div className="hx-pending row between"><span className="small">{h.formPendingMove(hexPlaceName(pending.hexId, roomLang, view.siteSlots), fmt.money(pending.amount))}</span><button type="button" className="btn small ghost" onClick={() => void sendAction({ type: 'cancelHexBid', companyId: company.id, productId: product.id })}>{h.formWithdraw}</button></div>;
  if (compact) return <div className="hx-action-fields hx-move-compact">
    {amountForm}
    <p className="hx-action-costs" title={decision.moveClose}>{h.formMoveCost} : <strong>{fmt.money(cost)}</strong> · {h.formReserve} : <strong>{fmt.money(reserve)}</strong></p>
    {product.incubator && <HexFallbackChoice value={fallback} onChange={setFallback} id={`move-${product.id}`} incubator compact />}
    {selected && !product.incubator && <details className="hx-action-explanation"><summary>{decision.losses}</summary><MoveLosses product={product} destination={{ hexId: selected }} perksText={perksText} /></details>}
    {pendingControls}
    <HexBidRules compact>
      <p className="small muted">{h.formAuctionHelp}</p><p className="small muted">{product.incubator ? h.formFallbackHelp : h.formMoveHelp}</p>
      <p className="small muted">{decision.moveClose}</p>
    </HexBidRules>
  </div>;
  return <div className="stack hx-move">
    <HexBidSummary view={view} hexId={selected} reference={reference} delta cost={cost} costLabel={h.formMoveCost} bid={bid} bidMax={max} hideCellNumbers inSheet={inSheet}>
      {selected && <MoveLosses product={product} destination={{ hexId: selected }} perksText={perksText} />}
      {!product.incubator && (product.private?.pendingCapacity ?? 0) > 0 && cost > 0 && <p className="small muted">{decision.construction(fmt.lots(product.private!.pendingCapacity))}</p>}
      {amountForm}
      <p className="small muted">{h.formBidRule}</p>
      <button type="button" className="btn ghost small" onClick={onDone}>{t.common.cancel}</button>
    </HexBidSummary>
    {product.incubator && <HexFallbackChoice value={fallback} onChange={setFallback} id={`move-${product.id}`} incubator />}
    {pendingControls}
    <HexBidRules>
      <p className="small muted">{h.formAuctionHelp}</p>
      <p className="small muted">{product.incubator ? h.formFallbackHelp : h.formMoveHelp}</p>
      <p className="small muted">{t.product.moveHint}</p>
    </HexBidRules>
  </div>;
}
