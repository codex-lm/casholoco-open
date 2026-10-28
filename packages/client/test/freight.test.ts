import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMMODITIES,
  SECTORS,
  SECTOR_IDS,
  capitalHexId,
  createGame,
  deliveryPerLotHex,
  getPlayerView,
  portHaulHex,
  type CommodityId,
  type Lang,
  type SectorId,
} from '@muchomoney/core';
import { estimatedTransportHex } from '../../core/src/sim/transport';
import { freightMessages } from '../src/i18n/freight';
import { getState, setState, type AppState } from '../src/store';
import { fmtFor } from '../src/fmt';
import { FreightRow, LaunchChoices, productFreightFacts, type ProductFreightFacts } from '../src/screens/game/city/CellFreight';
import { FreightDetails } from '../src/components/FreightDetails';
import { launchFreight, productFreight, type FreightBreakdown } from '../src/screens/game/city/freight';
import { hexLensValue, hexTransportDelta } from '../src/screens/game/city/hexModel';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
afterEach(() => setState(initial));
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function fixture(lang: Lang, sectorId: SectorId = 'energy_drinks', withSite = false) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode: 'hex', terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId, connected: true, color: '#123456' },
  ]);
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  if (withSite) {
    const slot = getPlayerView(game, 'human').siteSlots.find((s) => s.commodityId === 'sugar' && !s.companyId)!;
    company.sites = [{ id: slot.id, commodityId: 'sugar', capacity: 20, unitCost: 20, activeFrom: 0 }];
  }
  const view = getPlayerView(game, 'human');
  const companyView = view.companies.find((c) => c.id === company.id)!;
  return { game, company, product: company.products[0], view, companyView, productView: companyView.products[0] };
}

describe('freight from a cell: the same bill as the close', () => {
  it('a new plant pays its materials from the port and its delivery to the cities, as the engine estimates', () => {
    const { view } = fixture('fr');
    const factor = view.transportFactor ?? 1;
    for (const hexId of view.hexes!.free.slice(0, 12)) {
      for (const sectorId of SECTOR_IDS) {
        const freight = launchFreight(view, sectorId, hexId);
        let expected = 0;
        if (!SECTORS[sectorId].intangible) {
          expected = deliveryPerLotHex(hexId, sectorId);
          for (const [cid, per] of Object.entries(SECTORS[sectorId].inputs) as [CommodityId, number][]) {
            if (per > 0 && cid in COMMODITIES) expected += per * portHaulHex(hexId, cid);
          }
        }
        expect(freight.total).toBeCloseTo(expected * factor, 9);
        expect(freight.deliveryCost).toBeCloseTo((SECTORS[sectorId].intangible ? 0 : deliveryPerLotHex(hexId, sectorId)) * factor, 9);
        expect(freight.materialsCost + freight.deliveryCost).toBeCloseTo(freight.total, 12);
      }
    }
  });

  it('my product, with its subsidiary first and the rest from the port, matches the engine estimate on every cell', () => {
    const { game, company, product, view, companyView, productView } = fixture('fr', 'energy_drinks', true);
    for (const hexId of [...view.hexes!.free.slice(0, 20), productView.hexId ?? capitalHexId]) {
      const freight = productFreight(view, companyView, productView, hexId);
      expect(freight.total).toBeCloseTo(estimatedTransportHex(game, company, product, hexId), 9);
    }
    const somewhere = view.hexes!.free.find((id) => id !== capitalHexId)!;
    const legs = productFreight(view, companyView, productView, somewhere).materials;
    expect(legs.some((leg) => leg.source === 'site' && leg.commodityId === 'sugar')).toBe(true);
  });

  it('crypto travels free of charge', () => {
    const { view } = fixture('fr');
    const freight = launchFreight(view, 'crypto', view.hexes!.free[0]);
    expect(freight.intangible).toBe(true);
    expect(freight.total).toBe(0);
    expect(freight.materials).toEqual([]);
    expect(freight.delivery).toEqual([]);
  });

  it('the Transport lens shows the difference with my plant, zero at home', () => {
    const { view, productView } = fixture('fr');
    const home = productView.hexId ?? capitalHexId;
    expect(hexTransportDelta(view, productView.id, home)).toBeCloseTo(0, 12);
    const other = view.hexes!.free[3];
    const ref = { kind: 'product' as const, productId: productView.id };
    expect(hexLensValue(view, ref, other, 'transport', true)).toBeCloseTo(hexTransportDelta(view, productView.id, other)!, 12);
    // A new-plant reference uses its absolute bill, including delivery at the capital.
    expect(hexLensValue(view, { kind: 'launch', sectorId: 'yogurts' }, other, 'transport', false)).toBeCloseTo(launchFreight(view, 'yogurts', other).total, 9);
  });
});

function find(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) { for (const child of node) { const hit = find(child, predicate); if (hit) return hit; } return undefined; }
  if (!isValidElement<Record<string, unknown>>(node)) return undefined;
  if (predicate(node)) return node;
  return find(node.props.children as ReactNode, predicate);
}

const row = (facts: ProductFreightFacts) => renderToStaticMarkup(createElement('dl', null, createElement(FreightRow, { facts })));
const breakdown = (total: number): FreightBreakdown => ({ sectorId: 'energy_drinks', hexId: 'X', intangible: false, transportFactor: 1, materials: [], delivery: [], materialsCost: total / 2, deliveryCost: total / 2, total });

describe.each(['fr', 'en'] as const)('freight in the cell sheet (%s)', (lang) => {
  const text = freightMessages(lang);
  const fmt = fmtFor(lang);

  it('a free cell answers « what should go here? » with the five sectors, the best one marked, open for a new plant', () => {
    const { view } = fixture(lang);
    setState({ ...initial, lang, view });
    const hexId = view.hexes!.free.find((id) => id !== capitalHexId)!;
    const onPickSector = vi.fn();
    const html = renderToStaticMarkup(createElement(LaunchChoices, { view, hexId, reference: { kind: 'launch', sectorId: 'yogurts' }, onPickSector }));
    expect(html).toContain(`<section class="hx-freight hx-freight-launch" aria-label="${escaped(text.launchTitle)}">`);
    expect(html.match(/<tr class="[^"]*"|<tr>/g)!.length).toBeGreaterThanOrEqual(SECTOR_IDS.length);
    expect(html).toContain(escaped(text.best));
    expect(html).toContain(escaped(text.noFreight)); // crypto
    expect(html).not.toMatch(/\btu\b|\bton\b|\btes\b|Touchez|Tap /);
    // Choosing a sector makes it the tracked launch reference.
    const tree = LaunchChoices({ view, hexId, reference: { kind: 'launch', sectorId: 'yogurts' }, onPickSector });
    const buttons: ReactElement<Record<string, unknown>>[] = [];
    find(tree, (el) => { if (el.type === 'button' && el.props.title) buttons.push(el); return false; });
    expect(buttons).toHaveLength(SECTOR_IDS.length);
    (buttons[SECTOR_IDS.indexOf('gadgets')]!.props.onClick as () => void)();
    expect(onPickSector).toHaveBeenCalledWith('gadgets');
    // Tracking one of my products: the same table, folded. Not on an occupied cell.
    const { productView } = fixture(lang);
    const folded = renderToStaticMarkup(createElement(LaunchChoices, { view, hexId, reference: { kind: 'product', productId: productView.id } }));
    expect(folded).toContain(`<details class="hx-freight hx-freight-launch"><summary>${escaped(text.launchTitle)}</summary>`);
    expect(folded).not.toMatch(/<details[^>]*open/);
    expect(LaunchChoices({ view, hexId: productView.hexId!, reference: { kind: 'launch', sectorId: 'yogurts' } })).toBeNull();
  });

  it('on a free cell, « of which freight » retains the gain’s sign beside the absolute lines', () => {
    const { view, productView } = fixture(lang, 'energy_drinks', true);
    setState({ ...initial, lang, view });
    const home = productView.hexId ?? capitalHexId;
    const hexId = view.hexes!.free.find((id) => id !== home && id !== capitalHexId)!;
    const facts = productFreightFacts(view, productView.id, hexId)!;
    const here = productFreight(view, view.companies.find((c) => c.private)!, productView, hexId);
    const now = productFreight(view, view.companies.find((c) => c.private)!, productView, home);
    expect(facts).toMatchObject({ current: false, intangible: false });
    expect(facts.perLot).toBeCloseTo(here.total - now.total, 12);
    expect(facts.planned).toBe(Math.floor(Math.min(productView.private!.production, productView.capacity)));
    const line = row(facts);
    expect(line).toContain(`<dt>${escaped(text.partLabel)}</dt>`);
    const lot = `${facts.perLot > 0 ? '+' : ''}${fmt.lotPrice(facts.perLot)}`;
    const quarter = fmt.signedMoney(-facts.perLot * facts.planned);
    expect(line).toContain(escaped(facts.perLot < 0 ? text.saved(quarter, lot) : text.extra(quarter, lot)));
    // The delta remains one row; the two absolute lines have their own shared disclosures.
    expect(line.match(/<dt>/g)).toHaveLength(1);
    const details = renderToStaticMarkup(createElement(FreightDetails, { view, freight: here }));
    expect(details).toContain(escaped(text.materialsLabel));
    expect(details).toContain(escaped(text.deliveryLabel));
    expect(details.match(/<summary /g)).toHaveLength(2);
    expect(details).not.toMatch(/<details[^>]*open/);
  });

  it('a saving is positive, an extra cost negative, by quarter and by lot', () => {
    setState({ ...initial, lang, view: fixture(lang).view });
    const base = { intangible: false, current: false, here: breakdown(3), now: breakdown(3.7) };
    const saving = row({ ...base, perLot: -0.7, planned: 50 });
    expect(saving).toContain('<dd class="up">');
    expect(saving).toContain(escaped(text.saved(fmt.signedMoney(35), `${fmt.lotPrice(-0.7)}`)));
    const extra = row({ ...base, perLot: 0.7, planned: 50 });
    expect(extra).toContain('<dd class="down">');
    expect(extra).toContain(escaped(text.extra(fmt.signedMoney(-35), `+${fmt.lotPrice(0.7)}`)));
    expect(fmt.signedMoney(35).startsWith('+')).toBe(true);
    // Nothing planned this quarter: per lot only, with the gain's sign too (a saving reads +0,7 k€/lot saved).
    const savingPerLot = row({ ...base, perLot: -0.7, planned: 0 });
    expect(savingPerLot).toContain('<dd class="up">');
    expect(savingPerLot).toContain(escaped(text.savedPerLot(`+${fmt.lotPrice(0.7)}`)));
    const extraPerLot = row({ ...base, perLot: 0.7, planned: 0 });
    expect(extraPerLot).toContain('<dd class="down">');
    expect(extraPerLot).toContain(escaped(text.extraPerLot(fmt.lotPrice(-0.7))));
    expect(fmt.lotPrice(-0.7).startsWith('-')).toBe(true);
    expect(row({ ...base, perLot: 0, planned: 50 })).toContain(escaped(text.unchanged));
  });

  it('says « unchanged » when the shown figures round to zero, never a coloured zero', () => {
    setState({ ...initial, lang, view: fixture(lang).view });
    const base = { intangible: false, current: false, here: breakdown(3), now: breakdown(3.03) };
    // Under a twentieth of a k per lot, nothing planned or too few lots for the quarter to show: « unchanged », uncoloured.
    for (const facts of [{ perLot: -0.03, planned: 0 }, { perLot: 0.04, planned: 0 }, { perLot: -0.03, planned: 1 }]) {
      const line = row({ ...base, ...facts });
      expect(line).toContain(`<dd>${escaped(text.unchanged)}</dd>`);
      expect(line).not.toMatch(/0[.,]0/);
    }
    // The quarter shows (100 lots × 0,04 k = 4 k): the per-lot gap gets two decimals instead of « -0,0 ».
    const quarterOnly = row({ ...base, perLot: -0.04, planned: 100 });
    expect(quarterOnly).toContain('<dd class="up">');
    expect(quarterOnly).toContain(escaped(text.saved(fmt.signedMoney(4), fmt.lotPrice(-0.04, 2))));
    // Just above the rounding: the usual one-decimal line.
    expect(row({ ...base, perLot: 0.06, planned: 0 })).toContain(escaped(text.extraPerLot(fmt.lotPrice(-0.06))));
  });

  it('on its own cell, two absolute freight lines disclose the whole recipe and all cities, including zero legs', () => {
    const { view, productView } = fixture(lang, 'energy_drinks', true);
    setState({ ...initial, lang, view });
    const home = productView.hexId ?? capitalHexId;
    const facts = productFreightFacts(view, productView.id, home)!;
    expect(facts.current).toBe(true);
    expect(row(facts)).toBe('<dl></dl>');
    const html = renderToStaticMarkup(createElement(FreightDetails, { view, freight: facts.here }));
    expect(html.match(/<summary /g)).toHaveLength(2);
    expect(html.match(/role="tooltip"/g)).toHaveLength(2);
    expect(html.match(/aria-describedby=/g)).toHaveLength(2);
    expect(html).toContain(escaped(text.lotValue(fmt.lotPrice(facts.here.materialsCost))));
    expect(html).toContain(escaped(text.lotValue(fmt.lotPrice(facts.here.deliveryCost))));
    expect(html).toContain(escaped(text.recipe));
    expect(html).toContain(escaped(text.sources));
    expect(html).toContain(escaped(text.totalMaterials));
    expect(html).toContain(escaped(text.totalDelivery));
    expect(facts.here.delivery).toHaveLength(5);
    expect(facts.here.delivery.reduce((sum, leg) => sum + leg.cost, 0)).toBeCloseTo(facts.here.deliveryCost, 12);
    expect(facts.here.materials.reduce((sum, leg) => sum + leg.cost, 0)).toBeCloseTo(facts.here.materialsCost, 12);
    expect(html).toContain(escaped(text.port));
    for (const leg of facts.here.materials.filter((leg) => leg.siteId)) {
      expect(html).toContain(escaped(view.siteSlots.find((s) => s.id === leg.siteId)!.name));
    }
    // A rival's product, or a cell that is neither mine nor free: no freight line at all.
    const rivalCell = view.hexes!.free.length ? Object.keys(view.hexes!.occupied).find((id) => id !== home) : undefined;
    if (rivalCell) expect(productFreightFacts(view, productView.id, rivalCell)).toBeNull();
    expect(productFreightFacts(view, 'nobody', home)).toBeNull();
  });

  it('crypto displays two zero-cost lines with its intangible explanation', () => {
    const { view, productView } = fixture(lang, 'crypto');
    setState({ ...initial, lang, view });
    const hexId = view.hexes!.free.find((id) => id !== capitalHexId)!;
    const facts = productFreightFacts(view, productView.id, hexId)!;
    expect(facts.intangible).toBe(true);
    expect(row(facts)).toContain(escaped(text.noFreight));
    expect(row(facts)).toContain(`data-tip="${escaped(text.intangible)}"`);
    const html = renderToStaticMarkup(createElement(FreightDetails, { view, freight: facts.here }));
    expect(html.match(/<summary /g)).toHaveLength(2);
    expect(html).toContain(escaped(text.intangible));
    expect(html).toContain(escaped(text.lotValue(fmt.lotPrice(0))));
  });

  it('shows a transport news multiplier in each disclosure footer when it differs from one', () => {
    const { view, companyView, productView } = fixture(lang, 'energy_drinks', true);
    view.transportFactor = 1.6;
    setState({ ...initial, lang, view });
    const freight = productFreight(view, companyView, productView, productView.hexId ?? capitalHexId);
    const html = renderToStaticMarkup(createElement(FreightDetails, { view, freight }));
    expect(html).toContain(escaped(text.newsFactor(fmt.num(1.6))));
    expect(html).toContain(escaped(text.productWeight(fmt.num(SECTORS[productView.sectorId].freightWeight))));
  });
});
