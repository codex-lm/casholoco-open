import { Children, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_COLORS,
  ZONE_IDS,
  createGame,
  getContent,
  getPlayerView,
  resolveTurn,
  type CompanyView,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
  type ZoneId,
} from '@muchomoney/core';
import { sendAction } from '../src/api';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { decisionText } from '../src/i18n/decisionReadability';
import { ZoneMoveForm } from '../src/screens/game/MoveForms';
import { zoneRows } from '../src/screens/game/zoneChoice';
import { getState, setState, type AppState } from '../src/store';

// Seul `sendAction` sert au composant : on l'espionne sans charger le module réel (socket).
vi.mock('../src/api', () => ({ sendAction: vi.fn(async () => ({ ok: true, message: '' })) }));
const data = vi.hoisted(() => ({ view: null as PlayerView | null }));
vi.mock('../src/hooks/useGame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/hooks/useGame')>();
  return {
    ...actual,
    useGame: () => ({ view: data.view!, sectorsById: new Map((data.view?.sectors ?? []).map((s) => [s.id, s])) }),
  };
});
// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => {
  setState(initialState);
  data.view = null;
  vi.mocked(sendAction).mockClear();
});

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

/**
 * Cleo et Bob font tous deux des yaourts (Bob est le concurrent direct de la fiche, à la capitale).
 * Un tour est résolu pour avoir des ventes par ville et un déménagement payant.
 */
function moveGame(lang: Lang) {
  const g = createGame({ seed: 7, totalTurns: 12, turnSeconds: 90, startYear: 2027, lang }, [
    seat('cleo', 'Cleo', 'Cleo SA', 'yogurts', 0),
    seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
  ]);
  resolveTurn(g);
  return g;
}

function zoneName(lang: Lang, id: ZoneId): string {
  const names = getContent(lang).mapNames;
  return id === 'plain' || id === 'mountain' ? names.zones[id] : names.cities[id];
}

function renderForm(view: PlayerView, lang: Lang, company: CompanyView, productId: string, zoneId: ZoneId, onDone?: () => void): string {
  setState({ lang, view, lobby: null });
  data.view = view;
  const product = company.products.find((p) => p.id === productId)!;
  return renderToStaticMarkup(
    createElement(GameProvider, { view, children: createElement(ZoneMoveForm, { company, product, zoneId, onDone }) }),
  );
}

function find(node: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Record<string, unknown>>(child)) continue;
    if (predicate(child)) return child;
    const nested = find(child.props.children as ReactNode, predicate);
    if (nested) return nested;
  }
  return undefined;
}

describe.each(['fr', 'en'] as const)('ZoneMoveForm — déménagement vers une zone choisie (%s)', (lang) => {
  const g = moveGame(lang);
  const t = messages(lang);
  const mp = t.movePicker;
  const fmt = fmtFor(lang);
  const decision = decisionText(lang);
  const view = getPlayerView(g, 'cleo');
  const company = view.companies.find((c) => c.controllerId === 'cleo')!;
  const product = company.products[0];
  const rows = zoneRows(product)!;
  const zones = product.private!.zones;
  const here: ZoneId = product.zoneId ?? 'capital';
  const hereName = zoneName(lang, here);

  it('zone actuelle : fiche « votre zone », note, et seul le bouton « Rester »', () => {
    const html = renderForm(view, lang, company, product.id, here);
    expect(html).toContain(`<dt>${escaped(decision.destination)}</dt><dd>${escaped(hereName)}</dd>`);
    expect(html).not.toContain(`<h4 class="pk-title">${escaped(hereName)}</h4>`);
    expect(html).toContain(escaped(mp.marginYours));
    expect(html).toContain(escaped(mp.currentNote));
    expect(html).toContain(`>${escaped(mp.ctaStay(hereName))}<`);
    expect(html).not.toContain('btn primary');
    // Autonome : pas de carte.
    expect(html).not.toContain('pk-pin');
  });

  it('réunit le coût dans le résumé et compare les six autres zones dans un repli fermé', () => {
    const html = renderForm(view, lang, company, product.id, here);
    expect(html).toContain(`<dt>${escaped(decision.total)}</dt><dd>${escaped(fmt.money(zones.moveCost))}</dd>`);
    expect(html).toContain(`<dt>${escaped(decision.timing)}</dt><dd>${escaped(decision.moveNow)}</dd>`);
    expect(html).toContain(escaped(decision.conditions));
    expect(html).not.toContain(escaped(t.product.moveCost(fmt.money(zones.moveCost))));
    expect(html).toContain(escaped(t.product.moveHint));
    const details = html.slice(html.indexOf('<details class="pk-details"'));
    expect(details).toMatch(/^<details class="pk-details"><summary>/);
    expect(details).toContain(escaped(decision.otherZones));
    for (const header of [mp.tableZone, mp.tableCost, mp.tableDemand, mp.tableMargin, mp.tableDiff]) {
      expect(details).toContain(escaped(header));
    }
    expect(details.split('<tr')).toHaveLength(8); // 1 entête + 6 autres zones
    expect(details).not.toContain(escaped(`${hereName} ${mp.currentMark}`));
  });

  it('autre zone : destination, économies et remboursement sont près des deux boutons', () => {
    const remaining = view.config.totalTurns - view.turn + 1;
    const target =
      rows.find((r) => !r.isCurrent && r.paybackQuarters !== null && r.paybackQuarters <= remaining) ??
      rows.find((r) => !r.isCurrent)!;
    const html = renderForm(view, lang, company, product.id, target.zoneId);
    const targetName = zoneName(lang, target.zoneId);
    const summary = html.slice(html.indexOf('<section class="decision-summary"'), html.indexOf('</section>') + '</section>'.length);
    expect(summary).toContain(`<dt>${escaped(decision.destination)}</dt><dd>${escaped(targetName)}</dd>`);
    expect(summary).toContain(`<dt>${escaped(decision.total)}</dt><dd>${escaped(fmt.money(zones.moveCost))}</dd>`);
    expect(summary).toContain(`<dt>${escaped(decision.savings)}</dt><dd>${escaped(target.marginDiff === null ? '—' : fmt.signedMoney(target.marginDiff))}</dd>`);
    expect(summary).toContain(`<dt>${escaped(decision.payback)}</dt><dd>${escaped(target.paybackQuarters === null ? decision.noPayback : decision.quarters(target.paybackQuarters))}</dd>`);
    expect(summary).toContain(`>${escaped(mp.ctaStay(hereName))}<`);
    expect(summary).toContain(`>${escaped(t.product.move)}<`);
    expect(html).not.toContain(`<h4 class="pk-title">${escaped(targetName)}</h4>`);
    const details = html.slice(html.indexOf('<details class="pk-details"'));
    expect(details).not.toContain(`<th scope="row">${escaped(targetName)}</th>`);
    expect(details).toContain(escaped(`${hereName} ${mp.currentMark}`));
  });

  it('« Rester » referme, « Déménager » envoie moveFactory avec la zone puis referme à l’accusé', async () => {
    const target = rows.find((r) => !r.isCurrent)!;
    const onDone = vi.fn();
    setState({ lang, view, lobby: null });
    data.view = view;
    const tree = ZoneMoveForm({ company, product, zoneId: target.zoneId, onDone });
    const stay = find(tree, (el) => el.type === 'button' && el.props.children === mp.ctaStay(hereName))!;
    const move = find(tree, (el) => el.type === 'button' && el.props.children === t.product.move)!;

    stay.props.onClick();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(sendAction).not.toHaveBeenCalled();

    move.props.onClick();
    await vi.waitFor(() => expect(sendAction).toHaveBeenCalled());
    expect(sendAction).toHaveBeenCalledWith({ type: 'moveFactory', companyId: company.id, productId: product.id, zoneId: target.zoneId });
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(2));
  });

  it('sans trésorerie, « Déménager » est désactivé et la raison est affichée', () => {
    const changed = structuredClone(view);
    const mine = changed.companies.find((c) => c.id === company.id)!;
    mine.cash = 0;
    const p = mine.products[0];
    const target = ZONE_IDS.find((z) => z !== here)!;
    const html = renderForm(changed, lang, mine, p.id, target);
    expect(html).toContain(escaped(t.product.moveNoCash));
    expect(html).toMatch(/<button type="button" class="btn primary"[^>]*disabled/);
  });

  if (lang === 'en') {
    it('n\'utilise ni guillemets français ni euro dans le formulaire anglais', () => {
      const html = renderForm(view, lang, company, product.id, here);
      expect(html).not.toContain('«');
      expect(html).not.toContain('»');
      expect(html).not.toContain('€');
      expect(html).not.toMatch(/aria-label="[^"]* : /);
      expect(html).not.toMatch(/title="[^"]* : /);
    });
  }
});
