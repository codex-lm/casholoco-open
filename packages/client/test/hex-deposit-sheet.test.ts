/**
 * Fiche d'une case de gisement sur le plateau, avec le panneau du gisement monté dedans (HexMapView) : un seul pli
 * « Détails du lieu », et la matière, le statut et la capacité dits une seule fois à l'écran (le statut de la case reste
 * annoncé aux lecteurs d'écran). Sans entreprise aux manettes (spectateur), la fiche garde son propre bloc « Gisement
 * d'approvisionnement ».
 */
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEXES, createGame, getContent, getPlayerView, slotCapacity, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor } from '../src/fmt';
import { messages } from '../src/i18n';
import { sheetReadabilityMessages } from '../src/i18n/sheetReadability';
import { DepositDetails, DepositPanel, richness } from '../src/screens/game/DepositPanel';
import { HexCellSheet } from '../src/screens/game/city/HexCellSheet';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
const count = (html: string, part: string) => html.split(part).length - 1;

function fixture(lang: Lang) {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang, mapMode: 'hex', terrainAssignment: 'fair' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
    { id: 'rival', name: 'Bob', isBot: false, companyName: 'Rival', sectorId: 'yogurts', connected: true, color: '#abcdef' },
  ]);
  const view = getPlayerView(game, 'human');
  const company = view.companies.find((c) => c.controllerId === 'human')!;
  const rival = view.companies.find((c) => c.controllerId === 'rival')!;
  const hex = HEXES.find((cell) => cell.deposit && view.siteSlots.some((slot) => slot.id === cell.deposit && !slot.companyId))!;
  return { view, company, rival, hex, slotId: hex.deposit! };
}

/** Comme HexMapView : le panneau dans le corps de la fiche, ce qu'il replie dans le pli de la case. */
function renderSheet(view: PlayerView, lang: Lang, hexId: string, slotId: string, acting = true): string {
  setState({ lang, view, lobby: null });
  const company = view.companies.find((c) => c.controllerId === view.you)!;
  const slot = view.siteSlots.find((s) => s.id === slotId)!;
  const sheet = createElement(HexCellSheet, {
    view, hexId,
    details: acting ? createElement(DepositDetails, { company, slot }) : undefined,
    children: acting ? createElement('div', { className: 'hx-map-form' }, createElement(DepositPanel, { company, slot, hideTitle: true, hostDetails: true })) : undefined,
  });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: sheet }));
}

describe.each(['fr', 'en'] as const)('fiche d’une case de gisement sur le plateau (%s)', (lang) => {
  it('pendant une enchère : un seul pli « Détails du lieu », matière, statut et capacité dits une fois, au-dessus de l’enchère', () => {
    const { view, hex, slotId } = fixture(lang);
    const t = messages(lang);
    const h = t.hex;
    const p = t.sitesPicker;
    const html = renderSheet(view, lang, hex.id, slotId);
    const detailsAt = html.indexOf('<details');
    expect(count(html, '<details')).toBe(1);
    expect(count(html, escaped(sheetReadabilityMessages(lang).locationDetails))).toBe(1);
    const status = escaped(p.statusFree(slotCapacity(slotId)));
    const kind = escaped(p.kindRich(t.sites.names[view.siteSlots.find((s) => s.id === slotId)!.commodityId], richness(t, slotId)));
    expect(count(html, status)).toBe(1);
    expect(count(html, kind)).toBe(1);
    expect(html.indexOf(status)).toBeLessThan(html.indexOf('type="submit"'));
    expect(html.indexOf('type="submit"')).toBeLessThan(detailsAt);
    // Plus de bloc propre à la fiche ni de second statut visible : le panneau les dit. Le statut de la case reste dans
    // l'en-tête annoncé, pour les seuls lecteurs d'écran.
    expect(html).not.toContain(escaped(h.depositTitle));
    expect(count(html, escaped(h.depositFree))).toBe(1);
    expect(html).toContain(`<p class="hx-sheet-status sr-only">${escaped(h.depositFree)}</p>`);
    expect(html).not.toContain(escaped(h.depositCapacity(fmtFor(lang).lots(slotCapacity(slotId)))));
    expect(html).not.toContain('pk-title');
    // Le reste de la fiche du gisement (extraction, besoins) est dans le pli, avec les voisins.
    const extraction = escaped(p.extraction('@').split('@')[0]);
    expect(count(html, extraction)).toBe(1);
    expect(html.indexOf(extraction)).toBeGreaterThan(detailsAt);
    expect(html.indexOf(escaped(h.neighborsTitle))).toBeGreaterThan(detailsAt);
    if (lang === 'en') expect(html).not.toMatch(/[«»€]/);
  });

  it('gisement d’un rival : la fiche du gisement reste visible, son statut une fois, et le pli de la case seul', () => {
    const { view, rival, hex, slotId } = fixture(lang);
    const taken = structuredClone(view);
    taken.siteSlots = taken.siteSlots.map((slot) => (slot.id === slotId ? { ...slot, companyId: rival.id } : slot));
    const t = messages(lang);
    const html = renderSheet(taken, lang, hex.id, slotId);
    const status = escaped(t.sitesPicker.statusTaken(rival.name, slotCapacity(slotId)));
    expect(count(html, '<details')).toBe(1);
    expect(count(html, status)).toBe(1);
    expect(html.indexOf(status)).toBeLessThan(html.indexOf('<details'));
    expect(html).toContain(`<p class="hx-sheet-status sr-only">${escaped(t.hex.depositOperatedBy(rival.name))}</p>`);
    expect(html).not.toContain(escaped(t.hex.depositTitle));
    expect(html).toContain(escaped(t.sitesPicker.takenFoot));
  });

  it('sans entreprise aux manettes, la fiche garde son bloc du gisement et son statut', () => {
    const { view, hex, slotId } = fixture(lang);
    const t = messages(lang);
    const html = renderSheet(view, lang, hex.id, slotId, false);
    const slot = view.siteSlots.find((s) => s.id === slotId)!;
    expect(html).toContain(escaped(t.hex.depositTitle));
    expect(html).toContain(`<p class="hx-sheet-status">${escaped(t.hex.depositFree)}</p>`);
    expect(html).toContain(escaped(getContent(lang).commodities[slot.commodityId].name));
    expect(count(html, '<details')).toBe(1);
  });
});
