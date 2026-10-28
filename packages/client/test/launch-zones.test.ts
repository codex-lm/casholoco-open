import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGame,
  DEFAULT_ZONE,
  getContent,
  getPlayerView,
  SECTOR_IDS,
  type CompanyView,
  type Lang,
  type PlayerView,
  type ZoneId,
} from '@muchomoney/core';
import { sendAction } from '../src/api';
import { messages } from '../src/i18n';
import { decisionText } from '../src/i18n/decisionReadability';
import { fmtFor } from '../src/fmt';
import type { GameData } from '../src/hooks/useGame';
import { ZoneLaunchForm } from '../src/screens/game/LaunchForms';
import { getState, setState, type AppState } from '../src/store';

// Sans DOM de test (même approche qu'amount-form.test.ts) : on fixe les hooks d'état pour obtenir un rendu et
// appeler le vrai gestionnaire de soumission ; `overrides` force certains états par position. Dans
// ZoneLaunchForm : 0 = secteur, 1 = nom, 2 = idées, 3 = envoi en cours (la zone est une prop).
const hooks = vi.hoisted(() => ({ cursor: 0, overrides: {} as Record<number, unknown> }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: () => {},
    useState: (initial: unknown) => {
      const i = hooks.cursor++;
      const value =
        i in hooks.overrides ? hooks.overrides[i] : typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [value, vi.fn()];
    },
  };
});
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});
// Seul `sendAction` sert au composant : on l'espionne sans charger le module réel (socket).
vi.mock('../src/api', () => ({ sendAction: vi.fn(async () => ({ ok: true, message: '' })) }));

// Le composant est rendu hors GameProvider (appel direct ou rendu statique) : `useGame` lit cette donnée.
const gameData = vi.hoisted(() => ({ current: null as GameData | null }));
vi.mock('../src/hooks/useGame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/hooks/useGame')>();
  return { ...actual, useGame: () => gameData.current as GameData };
});

const initialState = getState();
afterEach(() => {
  setState(initialState);
  vi.mocked(sendAction).mockClear();
});

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

function setup(view: PlayerView, lang: Lang) {
  hooks.cursor = 0;
  hooks.overrides = {};
  setState({ lang, view, lobby: null });
  gameData.current = { view, sectorsById: new Map(view.sectors.map((s) => [s.id, s])) } as GameData;
}

function renderForm(view: PlayerView, company: CompanyView, lang: Lang, zoneId: ZoneId): string {
  setup(view, lang);
  return renderToStaticMarkup(createElement(ZoneLaunchForm, { company, zoneId }));
}

/** Le nom d'une zone dans la langue de l'interface : celui de sa ville, ou le sien (plaine, montagne). */
const zoneNameOf = (lang: Lang, z: ZoneId): string => {
  const names = getContent(lang).mapNames;
  return z === 'plain' || z === 'mountain' ? names.zones[z] : names.cities[z];
};

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

describe.each(['fr', 'en'] as const)('lancement — choix de la zone (%s)', (lang) => {
  it('affiche la fiche de la zone visée (coût, solde, demande, déménagement gratuit)', () => {
    const { view, company } = fixture(lang);
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const sector = view.sectors.find((s) => s.id === SECTOR_IDS[0])!;
    const est = sector.launchByZone!.mountain;
    const html = renderForm(view, company, lang, 'mountain');
    const decision = decisionText(lang);
    expect(html).toContain(`<dt>${escaped(decision.destination)}</dt><dd>${escaped(zoneNameOf(lang, 'mountain'))}</dd>`);
    expect(html).toContain(`<dt>${escaped(decision.margin)}</dt><dd>${escaped(fmt.money(est.quarterlyProfit))}</dd>`);
    expect(html).toContain(escaped(t.launch.zoneDemand(fmt.lots(est.demand))));
    expect(html).toContain(escaped(t.launch.zoneFreeMove));
  });

  it.each([3, 4, null])('suit la rentabilité de la zone sélectionnée et la limite de fin de partie (%s)', (payback) => {
    const { view, company } = fixture(lang);
    view.turn = view.config.totalTurns - 2;
    const sector = view.sectors.find((s) => s.id === SECTOR_IDS[0])!;
    sector.launchEstimate = { ...sector.launchEstimate!, quarterlyProfit: 999, paybackQuarters: 1 };
    sector.launchByZone!.mountain = { ...sector.launchByZone!.mountain, quarterlyProfit: 123, paybackQuarters: payback };
    setup(view, lang);
    const html = renderToStaticMarkup(createElement(ZoneLaunchForm, { company, zoneId: 'mountain' }));
    const t = messages(lang);
    const fmt = fmtFor(lang);
    const decision = decisionText(lang);
    expect(html).toContain(`<dt>${escaped(decision.margin)}</dt><dd>${escaped(fmt.money(123))}</dd>`);
    expect(html).not.toContain(`<dt>${escaped(decision.margin)}</dt><dd>${escaped(fmt.money(999))}</dd>`);
    expect(html).toContain(`>${escaped(t.company.launch)}</button>`);
    expect(html).toContain(`<dt>${escaped(decision.total)}</dt><dd>${escaped(fmt.money(sector.launchCost))}</dd>`);
    if (payback === null) {
      expect(html).toContain(escaped(t.launch.noPayback));
    } else {
      expect(html).toContain(`<dt>${escaped(decision.payback)}</dt><dd>${escaped(decision.quarters(payback))}</dd>`);
      if (payback > 3) expect(html).toContain(escaped(t.launch.late(3)));
      else {
        expect(html).not.toContain(escaped(t.launch.late(3)));
      }
    }
  });

  it('envoie `zoneId` seulement quand la zone choisie n’est pas la capitale', async () => {
    const { view, company } = fixture(lang);
    setup(view, lang);
    const submit = (zoneId: ZoneId) => {
      hooks.cursor = 0;
      const form = ZoneLaunchForm({ company, zoneId });
      form.props.onSubmit({ preventDefault: vi.fn() });
    };

    // Zone par défaut (capitale) : rien de plus dans l'action.
    hooks.overrides = { 1: 'Zing' };
    submit(DEFAULT_ZONE);
    await vi.waitFor(() => expect(sendAction).toHaveBeenCalled());
    const capital = vi.mocked(sendAction).mock.calls[0][0];
    expect(capital).toEqual({ type: 'launchProduct', companyId: company.id, sectorId: SECTOR_IDS[0], name: 'Zing' });
    expect(capital).not.toHaveProperty('zoneId');

    // Zone choisie hors capitale : elle part avec l'action.
    vi.mocked(sendAction).mockClear();
    submit('mountain');
    await vi.waitFor(() => expect(sendAction).toHaveBeenCalled());
    expect(sendAction).toHaveBeenCalledWith({
      type: 'launchProduct',
      companyId: company.id,
      sectorId: SECTOR_IDS[0],
      name: 'Zing',
      zoneId: 'mountain',
    });
  });
});
