/**
 * Fenêtres modales : rendues en portail sur document.body — ouvertes depuis le panneau latéral
 * collant d'une carte, elles recouvrent toute la page (la barre du haut comprise) — et Échap dans
 * une telle modale ne ferme plus la fiche de la carte classique. Harnais SSR (ni jsdom ni
 * testing-library dans le dépôt) : le portail et la garde clavier sont épinglés à la source,
 * le rendu statique vérifie le repli sans DOM.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, getPlayerView, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { ConfirmModal, Modal } from '../src/components/Modal';
import { getState, setState, type AppState } from '../src/store';

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function fixture(): PlayerView {
  const g = createGame({ seed: 7, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: 'fr' }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  return getPlayerView(g, 'human');
}

describe('Modal', () => {
  it('se rend normalement sans DOM (repli du rendu serveur)', () => {
    const view = fixture();
    setState({ lang: 'fr', view, lobby: null });
    const html = renderToStaticMarkup(
      createElement(GameProvider, { view, children: createElement(Modal, { title: 'Essai', onClose: () => {} }, 'Corps de la fenêtre') }),
    );
    expect(html).toContain('modal-backdrop');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Essai');
    expect(html).toContain('Corps de la fenêtre');
  });

  it('ConfirmModal garde ses boutons annuler / confirmer au rendu statique', () => {
    const view = fixture();
    setState({ lang: 'fr', view, lobby: null });
    const html = renderToStaticMarkup(
      createElement(GameProvider, {
        view,
        children: createElement(ConfirmModal, { title: 'Sûr ?', message: 'Tout vendre ?', confirmLabel: 'Tout vendre', onConfirm: () => {}, onClose: () => {} }),
      }),
    );
    expect(html).toContain(messages('fr').common.cancel);
    expect(html).toContain('Tout vendre');
  });

  it('est rendue en portail sur document.body (hors du panneau latéral collant des cartes)', () => {
    const src = readFileSync(join(__dirname, '../src/components/Modal.tsx'), 'utf8');
    expect(src).toContain('createPortal(tree, document.body)');
    expect(src).toContain("import { createPortal } from 'react-dom'");
  });

  it('Échap dont la cible est hors de la fiche carte (modale en portail) ne ferme pas la fiche', () => {
    // La fiche commune ignore les événements clavier dont la cible n'est pas dans la fiche :
    // une modale en portail remonte par l'arbre React sans être dans le DOM de la fiche.
    const src = readFileSync(join(__dirname, '../src/screens/game/city/MapWorkspace.tsx'), 'utf8');
    expect(src).toContain('!event.currentTarget.contains(event.target as Node)');
  });
});
