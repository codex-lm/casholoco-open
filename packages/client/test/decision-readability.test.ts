import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CITY_IDS, SECTORS, createGame, getContent, getPlayerView, zoneHexId, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { decisionEn, decisionFr, decisionText } from '../src/i18n/decisionReadability';
import { HexLaunchForm, ZoneLaunchForm } from '../src/screens/game/LaunchForms';
import { HexMoveForm, MoveLosses, ZoneMoveForm, moveLostCities } from '../src/screens/game/MoveForms';
import { DepositPanel } from '../src/screens/game/DepositPanel';
import { hexBidPayback } from '../src/screens/game/hexPayback';
import { hexEstimate, hexMarginValue } from '../src/screens/game/city/hexModel';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/api', () => ({ sendAction: vi.fn(async () => ({ ok: true })) }));
vi.mock('../src/store', async (original) => {
  const actual = await original<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
const initial = getState();
afterEach(() => setState(initial));
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
const fixture = (lang: Lang, hex = false) => {
  const game = createGame({ seed: 23, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang, ...(hex ? { mapMode: 'hex' as const, terrainAssignment: 'fair' as const } : {}) }, [
    { id: 'me', name: 'Test', isBot: false, companyName: 'Holding', sectorId: 'yogurts', connected: true, color: '#369' },
  ]);
  Object.values(game.companies)[0].cash = 100_000;
  const view = getPlayerView(game, 'me');
  const company = view.companies.find((company) => company.controllerId === 'me')!;
  return { view, company, product: company.products[0] };
};
function render(view: PlayerView, lang: Lang, children: ReturnType<typeof createElement>) {
  setState({ view, lang, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children }));
}
function summary(html: string) {
  return html.slice(html.indexOf('<section class="decision-summary"'), html.indexOf('</section>') + 10);
}

describe.each(['fr', 'en'] as const)('decision readability (%s)', (lang) => {
  const text = decisionText(lang);
  const fmt = fmtFor(lang);
  it('ties raw-material needs to the close of this quarter in the title, the note and the column tip', () => {
    const t = messages(lang);
    expect(t.commodities.needsTitle('Holding')).toContain(lang === 'fr' ? 'à la clôture de ce trimestre' : 'at this quarter’s close');
    expect(t.commodities.needsNote('1,1')).toContain(lang === 'fr' ? 'à la clôture' : 'at the close');
    expect(t.commodities.incomingTip).toContain(lang === 'fr' ? 'À la clôture, avant la production' : 'At the close, before production');
    expect(t.commodities.needsTitle('Holding') + t.commodities.needsNote('1,1') + t.commodities.incomingTip).not.toMatch(/prochain trimestre|next quarter/);
  });
  it('puts the classic launch cost, selected return, timing and action together without repeating selected figures', () => {
    const { view, company } = fixture(lang);
    const sector = view.sectors.find((sector) => sector.id === 'yogurts')!;
    const estimate = sector.launchByZone!.east;
    const html = render(view, lang, createElement(ZoneLaunchForm, { company, zoneId: 'east', initialSector: 'yogurts' }));
    const block = summary(html);
    expect(block).toContain(escaped(getContent(lang).mapNames.cities.east));
    expect(block).toContain(escaped(fmt.money(sector.launchCost)));
    expect(block).toContain(escaped(fmt.money(estimate.quarterlyProfit)));
    if (estimate.paybackQuarters !== null) expect(block).toContain(escaped(text.quarters(estimate.paybackQuarters!)));
    expect(block).toContain(escaped(text.launchTiming));
    expect(block).toContain(escaped(text.launchNow));
    expect(block).toContain(escaped(text.launchOperating));
    expect(block).toContain('type="submit"');
    // Le secteur d'abord (il fixe les chiffres), puis le résumé et le bouton, avant les descriptions.
    expect(html.indexOf('class="seg wrap"')).toBeLessThan(html.indexOf('decision-summary'));
    expect(html.indexOf('type="submit"')).toBeLessThan(html.indexOf('pk-details'));
    expect(block).toContain(escaped(text.conditions));
    expect(block.split(`<dd>${escaped(fmt.money(sector.launchCost))}</dd>`)).toHaveLength(2);
    expect(html).toContain(escaped(text.referencePrice));
    expect(html).toContain(escaped(`${text.referencePrice}: ${fmt.money(SECTORS.yogurts.refPrice)}`));
  });
  it('shows launch-plus-land total and the existing hex payback beside the bid action, the notes folded', () => {
    const { view, company } = fixture(lang, true);
    const hexId = view.hexes!.free[0];
    const cost = view.sectors.find((sector) => sector.id === 'yogurts')!.launchCost;
    const bid = view.hexes!.reserve[hexId];
    const estimate = hexEstimate(view, { kind: 'launch', sectorId: 'yogurts' }, hexId)!;
    const payback = hexBidPayback('launch', bid, bid, estimate.margin, cost);
    const html = render(view, lang, createElement(HexLaunchForm, { company, hexId, initialSector: 'yogurts' }));
    const block = summary(html);
    expect(block).toContain(escaped(fmt.money(cost + bid)));
    // The timing and operating notes wait in the closed « Comment se règle l’enchère ? » ; one rule line stays by the bid.
    const fold = html.slice(html.indexOf('<details class="hx-bid-rules">'));
    expect(block).not.toContain(escaped(text.launchClose));
    expect(fold).toContain(escaped(text.launchClose));
    expect(fold).toContain(escaped(text.launchBoardOperating));
    expect(block).toContain(escaped(messages(lang).hex.formBidRule));
    expect(block).toContain(escaped(fmt.money(estimate.margin!)));
    if (payback) expect(block).toContain(escaped(messages(lang).hex.formPaybackQuarters(payback.atReserve)));
    expect(block).toContain(escaped(text.conditions));
    expect(block).toContain('type="submit"');
    expect(html.indexOf('type="submit"')).toBeLessThan(html.indexOf('hx-fallback'));
  });
  it('shows classic move losses, the actual immediate timing, and construction in move costs', () => {
    const { view, company, product } = fixture(lang);
    product.zoneId = 'east';
    product.private!.zones!.moveCost = 200;
    product.private!.pendingCapacity = 20;
    const html = render(view, lang, createElement(ZoneMoveForm, { company, product, zoneId: 'north' }));
    expect(html).toContain(escaped(text.moveNow));
    expect(html).toContain(escaped(text.construction(fmt.lots(20))));
    expect(html).toContain('<ul><li>');
    expect(html).toContain(escaped(text.localLoss(getContent(lang).mapNames.cities.east, fmt.pct(SECTORS.yogurts.localBonus, 0))));
    expect(summary(html)).toContain(escaped(text.conditions));
    expect(html.indexOf('btn primary')).toBeLessThan(html.indexOf('pk-kicker'));
  });
  it('shows hex move losses and move-plus-land budget using the existing margin difference', () => {
    const { view, company, product } = fixture(lang, true);
    product.hexId = zoneHexId('east');
    const terrain = view.terrains![0];
    terrain.hex = product.hexId;
    terrain.active = true;
    terrain.companyId = company.id;
    const hexId = zoneHexId('north');
    view.hexes!.free.push(hexId);
    const reference = { kind: 'product' as const, productId: product.id };
    const html = render(view, lang, createElement(HexMoveForm, { company, product, hexId }));
    expect(html).toContain(escaped(text.moveClose));
    expect(html).toContain(escaped(fmt.money(product.private!.hexes!.moveCost + view.hexes!.reserve[hexId])));
    const gain = hexMarginValue(view, reference, hexId, true);
    if (gain !== null) expect(html).toContain(escaped(fmt.signedMoney(gain)));
    expect(html).toContain(escaped(text.localLoss(getContent(lang).mapNames.cities.east, fmt.pct(SECTORS.yogurts.localBonus, 0))));
    const h = messages(lang).hex;
    const perks = terrain.runningEffects.headquarters ? h.verdictPerksHq(terrain.name) : terrain.runningEffects.factory ? h.verdictPerksFactory(terrain.name) : null;
    if (perks) expect(html).toContain(escaped(perks));
    expect(html).toContain(escaped(text.conditions));
    expect(html.indexOf('type="submit"')).toBeLessThan(html.indexOf(escaped(h.formAuctionHelp)));
  });
  it('starts deposit decisions with budget, savings, timing, payback and bid before folded details', () => {
    const { view, company } = fixture(lang);
    const slot = view.siteSlots.find((slot) => slot.commodityId === 'sugar' && !slot.companyId)!;
    const html = render(view, lang, createElement(DepositPanel, { company, slot }));
    const block = summary(html);
    for (const value of [slot.name, text.maximum, text.savings, text.payback, text.depositClose, text.depositConditions]) expect(block).toContain(escaped(value));
    expect(block).toContain('type="submit"');
    expect(html.indexOf('type="submit"')).toBeLessThan(html.indexOf('<details'));
    expect(html).not.toMatch(/<details[^>]*open/);
  });
});

describe('known move losses and bilingual text', () => {
  it('only loses a hex bonus when leaving its city neighborhood, never at the capital or with unknown private data', () => {
    const { product } = fixture('fr', true);
    product.hexId = zoneHexId('east');
    expect(moveLostCities(product, { hexId: zoneHexId('north') })).toEqual(['east']);
    expect(moveLostCities(product, { hexId: product.hexId })).toEqual([]);
    product.hexId = zoneHexId('capital');
    expect(moveLostCities(product, { hexId: zoneHexId('north') })).toEqual([]);
    delete product.private;
    product.hexId = zoneHexId('east');
    expect(moveLostCities(product, { hexId: zoneHexId('north') })).toEqual([]);
  });
  it('does not invent losses for crypto, the flats, a retained city bonus or an incubator', () => {
    const { product } = fixture('fr');
    product.zoneId = 'plain';
    expect(moveLostCities(product, { zoneId: 'east' })).toEqual([]);
    product.zoneId = 'east';
    expect(moveLostCities(product, { zoneId: 'east' })).toEqual([]);
    product.sectorId = 'crypto';
    expect(moveLostCities(product, { zoneId: 'north' })).toEqual([]);
    product.sectorId = 'yogurts';
    product.incubator = true;
    expect(moveLostCities(product, { zoneId: 'north' })).toEqual([]);
    expect(CITY_IDS).toContain('east');
  });
  it('lists running terrain warnings separately from local attractiveness', () => {
    const { view, product } = fixture('fr', true);
    product.hexId = zoneHexId('east');
    const warning = messages('fr').hex.verdictPerksHq('Terrain');
    const html = render(view, 'fr', createElement(MoveLosses, { product, destination: { hexId: zoneHexId('north') }, perksText: warning }));
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain(escaped(warning));
  });
  it('keeps message keys and function arities in parity, with no informal French', () => {
    const entries = Object.entries(decisionFr);
    expect(Object.keys(decisionEn)).toEqual(Object.keys(decisionFr));
    for (const [key, value] of entries) {
      const en = decisionEn[key as keyof typeof decisionEn];
      expect(typeof en).toBe(typeof value);
      if (typeof value === 'function') expect(en.length).toBe(value.length);
      const text = typeof value === 'function' ? (value as (...args: never[]) => string)(...(['Ville', '35 %', 4] as never[])) : value;
      expect(text).not.toMatch(/\b(?:tu|ton|ta|tes)\b/i);
    }
  });
});
