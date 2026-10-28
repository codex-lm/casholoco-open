import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SECTOR_IDS, createGame, getContent, getPlayerView, type CompanyView, type Lang, type PlayerView, type SectorId, type ZoneId } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { decisionText } from '../src/i18n/decisionReadability';
import { freightMessages } from '../src/i18n/freight';
import { launchFreightClassic } from '../src/screens/game/city/freight';
import { fmtFor } from '../src/fmt';
import { MAX_ACTIVE_PRODUCTS, MAX_ACTIVE_PRODUCTS_MERGED, maxProductsOf } from '../src/rules';
import { ZoneLaunchForm } from '../src/screens/game/LaunchForms';
import { bestLaunchZone, launchZoneEstimates } from '../src/screens/game/launchPickerModel';
import { getState, setState, type AppState } from '../src/store';

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function fixture(lang: Lang) {
  const game = createGame(
    { seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' }],
  );
  const company = Object.values(game.companies).find((c) => c.controllerId === 'human')!;
  company.cash = 100_000;
  const view = getPlayerView(game, 'human');
  return { view, company: view.companies.find((c) => c.id === company.id)! };
}

/** Le nom d'une zone dans la langue de l'interface : celui de sa ville, ou le sien (plaine, montagne). */
const zoneNameOf = (lang: Lang, z: ZoneId): string => {
  const names = getContent(lang).mapNames;
  return z === 'plain' || z === 'mountain' ? names.zones[z] : names.cities[z];
};

function renderForm(view: PlayerView, company: CompanyView, lang: Lang, props: { zoneId: ZoneId; initialSector?: SectorId }): string {
  setState({ lang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(ZoneLaunchForm, { company, ...props }) }));
}

describe.each(['fr', 'en'] as const)('ZoneLaunchForm — formulaire de lancement pour une zone choisie (%s)', (lang) => {
  it('réunit destination, coût, solde, remboursement et lancement avant les descriptions', () => {
    const { view, company } = fixture(lang);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const sector = view.sectors.find((s) => s.id === SECTOR_IDS[0])!;
    const est = sector.launchByZone!.mountain;
    const html = renderForm(view, company, lang, { zoneId: 'mountain' });
    const freight = launchFreightClassic(view, sector.id, 'mountain');
    const freightText = freightMessages(lang);
    expect(html.match(/data-freight-kind="materials"/g)).toHaveLength(1);
    expect(html.match(/data-freight-kind="delivery"/g)).toHaveLength(1);
    expect(html).toContain(escaped(freightText.materialsLabel));
    expect(html).toContain(escaped(freightText.deliveryLabel));
    expect(html).toContain(escaped(freightText.lotValue(fmt.lotPrice(freight.deliveryCost))));
    expect(html).toContain(escaped(freightText.lotValue(fmt.lotPrice(freight.materialsCost))));
    const decision = decisionText(lang);
    const summary = html.slice(html.indexOf('<section class="decision-summary"'), html.indexOf('</section>') + '</section>'.length);

    // La décision chiffrée de la zone choisie reste près du bouton d'action.
    expect(html).toContain(escaped(t.launch.companyPays(company.name, fmt.money(company.cash))));
    expect(html).toContain(escaped(t.company.launchFunding));
    const payback = est.paybackQuarters;
    expect(summary).toContain(`<dt>${escaped(decision.destination)}</dt><dd>${escaped(zoneNameOf(lang, 'mountain'))}</dd>`);
    expect(summary).toContain(`<dt>${escaped(decision.total)}</dt><dd>${escaped(fmt.money(sector.launchCost))}</dd>`);
    expect(summary).toContain(`<dt>${escaped(decision.margin)}</dt><dd>${escaped(fmt.money(est.quarterlyProfit))}</dd>`);
    expect(summary).toContain(`<dt>${escaped(decision.payback)}</dt><dd>${escaped(payback === null ? t.launch.noPayback : decision.quarters(payback))}</dd>`);
    expect(summary).toContain(escaped(decision.launchTiming));
    expect(summary).toContain(escaped(decision.conditions));
    expect(summary).toContain(escaped(decision.launchOperating));
    expect(summary).toContain(`aria-label="${escaped(t.launch.namePlaceholder)}"`);
    expect(summary).toMatch(new RegExp(`<button type="submit"[^>]*>${escaped(t.company.launch)}</button>`));
    // Le secteur d'abord (il fixe les chiffres du résumé), puis le résumé.
    expect(html.indexOf('class="seg wrap"')).toBeLessThan(html.indexOf('decision-summary'));
    if (payback !== null) expect(html).not.toContain(escaped(t.launch.estimate(fmt.money(est.quarterlyProfit), payback)));

    // La destination et son solde ne sont pas répétés dans une ancienne fiche ou le comparatif.
    expect(html).not.toContain(`<h4 class="pk-title">${escaped(zoneNameOf(lang, 'mountain'))}</h4>`);
    expect(html).not.toContain(escaped(t.launch.zoneOption(zoneNameOf(lang, 'mountain'), fmt.money(est.unitCost), fmt.money(est.quarterlyProfit))));
    expect(html).toContain(escaped(t.launch.zoneDemand(fmt.lots(est.demand))));
    expect(html).toContain(escaped(t.launch.zoneFreeMove));

    // Autonome : pas de fieldset carte, pas de liste radio de repli.
    expect(html).not.toContain('site-target');
    expect(html).not.toContain('type="radio"');
    // La zone chiffrée en fiche est la seule en titre ; les autres le sont dans le repli ci-dessous.
    expect(html).not.toContain(`<h4 class="pk-title">${escaped(zoneNameOf(lang, 'capital'))}</h4>`);
  });

  it('compare les six autres zones dans un repli fermé, avec le badge de la meilleure alternative', () => {
    const { view, company } = fixture(lang);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const sector = view.sectors.find((s) => s.id === SECTOR_IDS[0])!;
    const zones = launchZoneEstimates(sector, view.commodities)!;
    const best = bestLaunchZone(zones);
    const html = renderForm(view, company, lang, { zoneId: 'capital' });

    const details = html.slice(html.indexOf('<details class="pk-details"'));
    expect(details).toMatch(/^<details class="pk-details"><summary>/);
    expect(details).toContain(escaped(decisionText(lang).otherZones));
    expect(details.match(/<p class="small">/g)).toHaveLength(6);
    // Chaque autre zone y est chiffrée ; la destination choisie reste uniquement dans le résumé.
    for (const { id, est: zoneEst } of zones) {
      const option = escaped(t.launch.zoneOption(zoneNameOf(lang, id), fmt.money(zoneEst.unitCost), fmt.money(zoneEst.quarterlyProfit)));
      if (id === 'capital') expect(details).not.toContain(option);
      else expect(details).toContain(option);
    }
    // Un badge uniquement si la meilleure zone est une alternative à la destination.
    expect(details.split(`<span class="badge up">${escaped(t.launch.zoneBest)}</span>`)).toHaveLength(best === 'capital' ? 1 : 2);
    if (best !== 'capital') {
      const bestEst = zones.find((z) => z.id === best)!.est;
      const bestOption = escaped(t.launch.zoneOption(zoneNameOf(lang, best), fmt.money(bestEst.unitCost), fmt.money(bestEst.quarterlyProfit)));
      expect(details.indexOf(bestOption)).toBeLessThan(details.indexOf(escaped(t.launch.zoneBest)));
    }
  });

  it('présélectionne le secteur passé en `initialSector`', () => {
    const { view, company } = fixture(lang);
    const other = SECTOR_IDS.find((id) => id !== SECTOR_IDS[0])!;
    const html = renderForm(view, company, lang, { zoneId: 'capital', initialSector: other });
    const content = getContent(lang);
    expect(html).toContain(`class="seg-btn active">${escaped(`${content.sectors[other]?.emoji} ${content.sectors[other]?.name ?? other}`)}`);
  });

  it('refuse le lancement sans trésorerie, avec la raison affichée et le bouton désactivé', () => {
    const { view, company } = fixture(lang);
    const t = messages(lang);
    company.cash = 0;
    const html = renderForm(view, company, lang, { zoneId: 'capital' });
    expect(html).toContain(escaped(t.launch.noCash));
    expect(html).toMatch(/<button type="submit"[^>]*disabled/);
  });

  it('refuse le lancement quand le nombre de produits est atteint, avec la raison affichée', () => {
    const { view, company } = fixture(lang);
    const t = messages(lang);
    const maxProducts = maxProductsOf(company);
    while (company.products.length < maxProducts) {
      company.products.push({ ...company.products[0], id: `extra-${company.products.length}` });
    }
    const html = renderForm(view, company, lang, { zoneId: 'capital' });
    expect(html).toContain(escaped(t.launch.full(maxProducts)));
    if (maxProducts <= MAX_ACTIVE_PRODUCTS) expect(html).toContain(escaped(t.launch.fullMergeHint(MAX_ACTIVE_PRODUCTS_MERGED)));
    expect(html).toMatch(/<button type="submit"[^>]*disabled/);
  });

  if (lang === 'en') {
    it("n'emploie ni guillemets français ni symbole € dans le formulaire anglais", () => {
      const { view, company } = fixture(lang);
      const html = renderForm(view, company, lang, { zoneId: 'capital' });
      expect(html).not.toContain('«');
      expect(html).not.toContain('»');
      expect(html).not.toContain('€');
    });
  }
});
