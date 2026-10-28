/**
 * Réglages d'un produit enregistrés sans « Appliquer » : au relâcher du curseur, à la sortie du champ, sur Entrée,
 * après une pause pour − et + ; une action par enregistrement, avec les quatre valeurs, sans toast de succès.
 * Harnais SSR (pas de jsdom) : les gestionnaires des éléments sont capturés au rendu et appelés à la main.
 */
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SPEND_PER_PRODUCT, PRICE_MAX_RATIO, PRICE_MIN_RATIO, PRODUCTION_MAX_RATIO, createGame, getPlayerView, type ActionResult, type Lang, type PlayerView } from '@muchomoney/core';
import { readyWhenSaved, sendAction, setReady } from '../src/api';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { learningMessages } from '../src/i18n/learning';
import { AdjustedNote, ProductCard, SaveState } from '../src/screens/game/ProductCard';
import { fmtFor } from '../src/fmt';
import { TopBar } from '../src/screens/game/TopBar';
import {
  ProductSaver, SAVE_DEBOUNCE_MS, captureTurnStart, flushProductSaves, forgetProductSaves, orphanSaver, productKey, pruneProductSaves,
  settingsOf, turnStartOf, unsavedProductNames, type ProductSettings, type SaveStatus, type SaverPlace, type SettingField,
} from '../src/productSaves';
import { getState, setState, type AppState } from '../src/store';

/** Éléments rendus (champs, curseurs, boutons) avec leurs props, dans l'ordre du rendu. */
const captured = vi.hoisted(() => ({ els: [] as { type: string; props: Record<string, unknown> }[] }));

vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-dev-runtime')>();
  return {
    ...actual,
    jsxDEV: (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (type === 'input' || type === 'button') captured.els.push({ type, props });
      return (actual.jsxDEV as (...a: unknown[]) => unknown)(type, props, ...rest);
    },
  };
});

vi.mock('react/jsx-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-runtime')>();
  const wrap =
    <F extends (...args: never[]) => unknown>(fn: F) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (type === 'input' || type === 'button') captured.els.push({ type, props });
      return (fn as (...a: unknown[]) => unknown)(type, props, ...rest);
    };
  return { ...actual, jsx: wrap(actual.jsx), jsxs: wrap(actual.jsxs) };
});

vi.mock('../src/api', () => ({
  sendAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true, message: 'ok' })),
  readyWhenSaved: vi.fn(async () => true),
  setReady: vi.fn(),
}));

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

/** Écouteurs posés sur la page (relâcher du curseur hors de lui). */
const page = new Map<string, Set<() => void>>();
function dispatch(type: string): void {
  for (const fn of [...(page.get(type) ?? [])]) fn();
}

const initialState = getState();
const detach: (() => void)[] = [];
beforeEach(() => {
  page.clear();
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: () => void, opts?: { signal?: AbortSignal }) => {
      if (!page.has(type)) page.set(type, new Set());
      page.get(type)!.add(fn);
      opts?.signal?.addEventListener('abort', () => page.get(type)?.delete(fn));
    },
    removeEventListener: (type: string, fn: () => void) => page.get(type)?.delete(fn),
    setTimeout,
    clearTimeout,
  });
  vi.mocked(sendAction).mockClear();
  vi.mocked(readyWhenSaved).mockClear();
  vi.mocked(setReady).mockClear();
});
afterEach(async () => {
  for (const off of detach.splice(0)) off();
  forgetProductSaves();
  await flushProductSaves();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setState(initialState);
});

function fixture(lang: Lang) {
  const game = createGame(
    { seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang },
    [{ id: 'human', name: 'Ada', isBot: false, companyName: 'Test Holding', sectorId: 'gadgets', connected: true, color: '#123456' }],
  );
  const view = getPlayerView(game, 'human');
  const company = view.companies.find((c) => c.controllerId === 'human')!;
  return { view, company, product: company.products[0] };
}

function renderCard(lang: Lang, view: PlayerView, patch: Partial<AppState> = {}) {
  setState({ lang, view, lobby: null, session: null, ...patch });
  const company = view.companies.find((c) => c.controllerId === 'human')!;
  const product = company.products[0];
  captured.els.length = 0;
  const html = renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(ProductCard, { company, product }) }));
  const els = [...captured.els];
  return {
    html,
    /** Curseurs prix, production, marketing, R&D. */
    ranges: els.filter((e) => e.type === 'input' && e.props.type === 'range').map((e) => e.props),
    /** Champs texte, même ordre. */
    fields: els.filter((e) => e.type === 'input' && e.props.inputMode === 'decimal').map((e) => e.props),
    /** Boutons − et + : [prix −, prix +, production −, production +, marketing −, marketing +, R&D −, R&D +]. */
    steps: els.filter((e) => e.type === 'button' && e.props.className === 'btn-step').map((e) => e.props),
    button: (label: string) => els.find((e) => e.type === 'button' && e.props.children === label)?.props,
  };
}

type Handler = (e: unknown) => void;
const call = (props: Record<string, unknown> | undefined, name: string, e: unknown = {}) => (props![name] as Handler)(e);

function sent(): { action: Record<string, unknown>; opts: unknown }[] {
  return vi.mocked(sendAction).mock.calls.map(([action, opts]) => ({ action: action as unknown as Record<string, unknown>, opts }));
}

describe.each(['fr', 'en'] as const)('fiche produit, enregistrement automatique (%s)', (lang) => {
  const t = messages(lang);

  it('plus de bouton « Appliquer » ni « Annuler » : un état « Enregistrement automatique » dans le pied', () => {
    const { view } = fixture(lang);
    const { html, button } = renderCard(lang, view);
    expect(html).not.toMatch(/Appliquer|>Apply</);
    expect(button(t.common.cancel)).toBeUndefined();
    // L'état est à gauche du pied (pas de ligne en plus), son explication dans une infobulle atteignable au clavier.
    const footer = html.slice(html.indexOf('<footer class="product-actions">'));
    expect(footer).toMatch(/^<footer class="product-actions"><span class="product-save-state small" role="status">/);
    expect(footer).toContain(t.product.autosave);
    expect(footer).toContain(`tabindex="0" role="img" aria-label="${escaped(t.product.autosaveTip)}"`);
    // Sans relevé du début du trimestre (pas encore de vue reçue), pas de bouton de retour.
    expect(html).not.toContain(t.product.revert);
  });

  it('le curseur enregistre au relâcher, une seule fois, avec les quatre valeurs et sans toast de succès', async () => {
    const { view, company, product } = fixture(lang);
    const server = settingsOf(product);
    const { ranges } = renderCard(lang, view);
    const price = ranges[0];
    call(price, 'onPointerDown');
    for (const v of [server.price * 1.1, server.price * 1.2, server.price * 1.3]) call(price, 'onChange', { target: { value: String(v) } });
    await flushProductSaves();
    expect(sendAction).not.toHaveBeenCalled();
    dispatch('pointerup');
    await flushProductSaves();
    expect(sent()).toEqual([{
      action: { type: 'setProductDecisions', companyId: company.id, productId: product.id, price: server.price * 1.3, production: server.production, marketing: server.marketing, rnd: server.rnd },
      opts: { quiet: true },
    }]);
    // L'écouteur de la page est retiré : un autre relâcher n'envoie rien.
    dispatch('pointerup');
    await flushProductSaves();
    expect(sendAction).toHaveBeenCalledTimes(1);
  });

  it('au clavier, les flèches du curseur enregistrent après une pause', async () => {
    vi.useFakeTimers();
    const { view, product } = fixture(lang);
    const { ranges } = renderCard(lang, view);
    const production = ranges[1];
    call(production, 'onChange', { target: { value: String(settingsOf(product).production + 1) } });
    call(production, 'onKeyUp', { key: 'ArrowRight' });
    call(production, 'onKeyUp', { key: 'Tab' });
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    await flushProductSavesNoTimers();
    expect(sendAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await flushProductSaves();
    expect(sent().map((s) => s.action.production)).toEqual([settingsOf(product).production + 1]);
  });

  it('taper ne fait rien partir ; quitter le champ enregistre', async () => {
    const { view } = fixture(lang);
    const { fields } = renderCard(lang, view);
    const production = fields[1];
    call(production, 'onFocus');
    call(production, 'onChange', { target: { value: '7' } });
    await flushProductSaves();
    expect(sendAction).not.toHaveBeenCalled();
    call(production, 'onBlur', { target: { value: '7' } });
    await flushProductSaves();
    expect(sent().map((s) => [s.action.production, s.opts])).toEqual([[7, { quiet: true }]]);
  });

  it('Entrée enregistre sans quitter le champ ; une autre touche, non', async () => {
    const { view, product } = fixture(lang);
    const { fields } = renderCard(lang, view);
    const target = Math.round(settingsOf(product).price * 1.5);
    call(fields[0], 'onKeyDown', { key: 'a', currentTarget: { value: String(target) } });
    await flushProductSaves();
    expect(sendAction).not.toHaveBeenCalled();
    call(fields[0], 'onKeyDown', { key: 'Enter', currentTarget: { value: String(target) } });
    await flushProductSaves();
    expect(sent().map((s) => s.action.price)).toEqual([target]);
  });

  it('− et + : plusieurs clics, un seul enregistrement après une courte pause', async () => {
    vi.useFakeTimers();
    const { view, product } = fixture(lang);
    const { steps } = renderCard(lang, view);
    const marketingUp = steps[5];
    for (let i = 0; i < 3; i++) call(marketingUp, 'onClick');
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    await flushProductSavesNoTimers();
    expect(sendAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await flushProductSaves();
    expect(sendAction).toHaveBeenCalledTimes(1);
    expect(sent()[0].action.marketing).toBeGreaterThan(settingsOf(product).marketing);
    expect(sent()[0].opts).toEqual({ quiet: true });
  });

  it('« Revenir aux réglages du début du trimestre » remet les valeurs relevées et les enregistre', async () => {
    const { view, company, product } = fixture(lang);
    const start: ProductSettings = { ...settingsOf(product), price: settingsOf(product).price + 5, production: 3 };
    const turnStart = { room: 'local', turn: view.turn, products: { [productKey(company.id, product.id)]: start } };
    const { html, button } = renderCard(lang, view, { turnStart });
    expect(html).toContain(t.product.revert);
    expect(html).toContain(escaped(t.product.revertTip));
    const revert = button(t.product.revert)!;
    expect(revert.disabled).toBe(false);
    // Libellé court à l'écran, phrase entière pour les lecteurs d'écran.
    expect(revert['aria-label']).toBe(t.product.revertLabel);
    expect(t.product.revert.length).toBeLessThan(t.product.revertLabel.length);
    call(revert, 'onClick');
    await flushProductSaves();
    expect(sent()).toEqual([{
      action: { type: 'setProductDecisions', companyId: company.id, productId: product.id, ...start },
      opts: { quiet: true },
    }]);
    // Réglages déjà à leur valeur de début de trimestre : bouton grisé.
    const same = renderCard(lang, view, { turnStart: { ...turnStart, products: { [productKey(company.id, product.id)]: settingsOf(product) } } });
    expect(same.button(t.product.revert)!.disabled).toBe(true);
  });

  it('état affiché : enregistrement, enregistré, échec avec « Réessayer », automatique au repos', () => {
    const render = (status: SaveStatus, onRetry = () => {}) => {
      setState({ lang });
      captured.els.length = 0;
      return renderToStaticMarkup(createElement(SaveState, { status, onRetry }));
    };
    expect(render('saving')).toContain(t.product.saving);
    expect(render('saved')).toContain(t.product.saved);
    expect(render('idle')).toContain(t.product.autosave);
    const onRetry = vi.fn();
    const failed = render('failed', onRetry);
    expect(failed).toContain(t.product.notSaved);
    expect(failed).toContain(t.product.retry);
    call(captured.els.find((e) => e.props.children === t.product.retry)!.props, 'onClick');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('« Je suis prêt » passe par l’attente des enregistrements ; « Prêt (annuler) » repart tout de suite', () => {
    const { view } = fixture(lang);
    const renderBar = (v: PlayerView) => {
      setState({ lang, view: v, lobby: null });
      captured.els.length = 0;
      renderToStaticMarkup(createElement(GameProvider, { view: v, children: createElement(TopBar, { openMapFor: () => {}, goTo: () => {} }) }));
      return captured.els.filter((e) => e.type === 'button' && e.props['aria-pressed'] !== undefined).map((e) => e.props)[0];
    };
    const bar = renderBar(view);
    // Pendant l'attente, le bouton reste focalisable : jamais l'attribut `disabled`.
    expect(bar.disabled).toBeUndefined();
    expect(bar['aria-disabled']).toBeUndefined();
    call(bar, 'onClick');
    expect(readyWhenSaved).toHaveBeenCalledExactlyOnceWith(view.turn);
    expect(setReady).not.toHaveBeenCalled();
    const ready = { ...view, players: view.players.map((p) => (p.id === view.you ? { ...p, ready: true } : p)) };
    call(renderBar(ready), 'onClick');
    expect(setReady).toHaveBeenCalledExactlyOnceWith(false, view.turn);
    expect(readyWhenSaved).toHaveBeenCalledTimes(1);
  });

  it('ligne des bornes : la valeur retenue et la raison, construite par champ, sans réplique du moteur', () => {
    // Montants dans la langue du salon (ici la même que l'interface).
    const fmt = fmtFor(lang);
    const { view } = fixture(lang);
    const render = (fields: SettingField[], values: ProductSettings) => {
      setState({ lang, view });
      return renderToStaticMarkup(createElement(AdjustedNote, { fields, values, refPrice: 100 }));
    };
    const capped = { ...BASE, marketing: MAX_SPEND_PER_PRODUCT };
    expect(render(['marketing'], capped)).toBe(
      `<p class="small warn product-save-note">${escaped(t.product.saveAdjusted(t.product.capped.marketing(fmt.money(MAX_SPEND_PER_PRODUCT))))}</p>`,
    );
    expect(render(['marketing'], capped)).toContain(lang === 'fr' ? 'par produit et par trimestre' : 'per product per quarter');
    const both = render(['price', 'production'], { ...BASE, price: 300, production: 40 });
    expect(both).toContain(escaped(t.product.capped.price(fmt.lotPrice(300), fmt.lotPrice(100 * PRICE_MIN_RATIO), fmt.lotPrice(100 * PRICE_MAX_RATIO))));
    expect(both).toContain(escaped(t.product.capped.production(fmt.lots(40), fmt.num(PRODUCTION_MAX_RATIO))));
    expect(t.product.capped.rnd('1')).toMatch(/R&D/);
  });

  it('checklist et partie guidée : plus de « Appliquer », l’enregistrement au relâcher est dit', () => {
    const steps = learningMessages(lang).steps;
    const hint = (h: string | ((premium: string) => string)) => (typeof h === 'function' ? h('10 %') : h);
    const slider = lang === 'fr' ? 'lâchez le curseur' : 'let go of the slider';
    const said = [t.tutorial.steps.decisions.hint(''), hint(steps.decisions.hint), hint(steps.adjustment.hint), t.company.productsAside,
      t.help.lines('10 %').join(' '), t.guide.tabs.company({ maxProducts: 4, hq: '250 k' } as Parameters<typeof t.guide.tabs.company>[0])];
    for (const text of [t.tutorial.steps.decisions.label, steps.decisions.label, ...said]) expect(text).not.toMatch(/Appliquer|Apply/);
    for (const text of said) expect(text).toContain(slider);
    // La règle de la partie guidée (changer la production, pas seulement le prix) reste dite.
    expect(hint(steps.adjustment.hint)).toMatch(lang === 'fr' ? /prix seul ne compte pas/ : /price tweak alone doesn’t count/);
    // Typographie : espaces insécables dans les guillemets et avant les deux-points.
    if (lang === 'fr') for (const text of [hint(steps.decisions.hint), hint(steps.adjustment.hint)]) expect(text).not.toMatch(/« | »| :/);
  });
});

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

/** Laisse passer les promesses en attente sans avancer les minuteries factices. */
async function flushProductSavesNoTimers(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Logique de la fiche, hors React
// ---------------------------------------------------------------------------

const BASE: ProductSettings = { price: 100, production: 50, marketing: 20, rnd: 10 };

/** Envoi piloté à la main : chaque appel attend sa réponse. */
function manualSend() {
  const calls: { values: ProductSettings; answer: (r: ActionResult) => void }[] = [];
  const send = vi.fn((values: ProductSettings) => new Promise<ActionResult>((resolve) => calls.push({ values, answer: resolve })));
  return { send, calls };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('ProductSaver', () => {
  it('rien ne part tant que rien n’a changé ; un geste, un envoi avec les dernières valeurs', async () => {
    const { send, calls } = manualSend();
    const saver = new ProductSaver(BASE, send);
    await saver.flush();
    expect(send).not.toHaveBeenCalled();
    saver.edit({ price: 110 });
    saver.edit({ price: 120 });
    const done = saver.flush();
    await settle();
    expect(saver.getSnapshot().status).toBe('saving');
    expect(calls.map((c) => c.values)).toEqual([{ ...BASE, price: 120 }]);
    calls[0].answer({ ok: true, message: 'ok' });
    expect(await done).toBe(true);
    expect(saver.getSnapshot().status).toBe('saved');
    // Même valeur relâchée deux fois : pas de second envoi.
    await saver.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('échec : la fiche reste « Non enregistré » et « Réessayer » renvoie les mêmes valeurs', async () => {
    const { send, calls } = manualSend();
    const saver = new ProductSaver(BASE, send);
    saver.edit({ production: 70 });
    const first = saver.flush();
    await settle();
    calls[0].answer({ ok: false, message: 'Refusé' });
    expect(await first).toBe(false);
    expect(saver.getSnapshot()).toMatchObject({ status: 'failed', draft: { ...BASE, production: 70 } });
    const retry = saver.flush();
    await settle();
    expect(calls.map((c) => c.values.production)).toEqual([70, 70]);
    calls[1].answer({ ok: true, message: 'ok' });
    expect(await retry).toBe(true);
    expect(saver.getSnapshot().status).toBe('saved');
  });

  it('les envois partent un par un, toujours avec ce qui est à l’écran', async () => {
    const { send, calls } = manualSend();
    const saver = new ProductSaver(BASE, send);
    saver.edit({ price: 110 });
    void saver.flush();
    await settle();
    saver.edit({ price: 130 });
    void saver.flush();
    saver.edit({ price: 140 });
    void saver.flush();
    await settle();
    expect(calls).toHaveLength(1);
    calls[0].answer({ ok: true, message: 'ok' });
    await settle();
    expect(calls.map((c) => c.values.price)).toEqual([110, 140]);
    calls[1].answer({ ok: true, message: 'ok' });
    await settle();
    expect(calls).toHaveLength(2);
  });

  it('l’écho du serveur ne remplace pas un champ que le joueur règle encore, mais suit les autres', async () => {
    const { send, calls } = manualSend();
    const saver = new ProductSaver(BASE, send);
    saver.edit({ price: 120 });
    void saver.flush();
    await settle();
    // Pendant l'envoi, le joueur tape une production (pas encore relâchée).
    saver.edit({ production: 80 });
    calls[0].answer({ ok: true, message: 'ok' });
    await settle();
    // Écho (après l'accusé, comme le serveur) : prix enregistré, production en cours d'édition gardée.
    saver.receiveServer({ ...BASE, price: 120 });
    expect(saver.getSnapshot().draft).toEqual({ ...BASE, price: 120, production: 80 });
    // Un autre changement côté serveur, sur un champ intact : adopté.
    saver.receiveServer({ ...BASE, price: 120, rnd: 15 });
    expect(saver.getSnapshot().draft).toEqual({ ...BASE, price: 120, production: 80, rnd: 15 });
    // La production en cours part au relâcher.
    void saver.flush();
    await settle();
    expect(calls.map((c) => c.values)).toEqual([{ ...BASE, price: 120 }, { ...BASE, price: 120, production: 80, rnd: 15 }]);
    calls[1].answer({ ok: true, message: 'ok' });
    await settle();
  });

  it('valeur bornée par le serveur, dans les deux ordres : la fiche montre la valeur retenue et le champ concerné', async () => {
    for (const echoFirst of [false, true]) {
      const { send, calls } = manualSend();
      const saver = new ProductSaver(BASE, send);
      saver.edit({ price: 999 });
      const done = saver.flush();
      await settle();
      const bounded = { ...BASE, price: 300 };
      // La maquette peut publier le nouvel état avant l'accusé ; le serveur, après.
      if (echoFirst) saver.receiveServer(bounded);
      calls[0].answer({ ok: true, message: 'Décisions enregistrées. Gadget : prix 300 k€ le lot.' });
      await done;
      if (!echoFirst) saver.receiveServer(bounded);
      expect(saver.getSnapshot()).toMatchObject({ draft: bounded, adjusted: ['price'], status: 'saved' });
      // Le prochain geste efface la ligne.
      saver.edit({ rnd: 12 });
      expect(saver.getSnapshot().adjusted).toBeNull();
    }
  });

  it('marketing ou R&D au-delà du plafond : ramenés avant l’envoi, la fiche dit pourquoi', async () => {
    const { send, calls } = manualSend();
    const saver = new ProductSaver(BASE, send);
    saver.edit({ marketing: 5_000_000, rnd: 2_000_000 });
    void saver.flush();
    await settle();
    const capped = { ...BASE, marketing: MAX_SPEND_PER_PRODUCT, rnd: MAX_SPEND_PER_PRODUCT };
    expect(calls.map((c) => c.values)).toEqual([capped]);
    expect(saver.getSnapshot()).toMatchObject({ draft: capped, adjusted: ['marketing', 'rnd'], status: 'saving' });
    calls[0].answer({ ok: true, message: 'ok' });
    await settle();
    saver.receiveServer(capped);
    expect(saver.getSnapshot()).toMatchObject({ draft: capped, adjusted: ['marketing', 'rnd'], status: 'saved' });
    // Déjà au plafond, on retape plus : rien ne part (le serveur garderait la même valeur, sans nouvel état), la ligne revient.
    saver.edit({ marketing: 3_000_000 });
    expect(saver.getSnapshot().adjusted).toBeNull();
    expect(await saver.flush()).toBe(true);
    expect(calls).toHaveLength(1);
    expect(saver.getSnapshot()).toMatchObject({ draft: capped, adjusted: ['marketing'], status: 'saved' });
  });

  it('deux enregistrements de suite, accusé avant écho (ordre du serveur) : la fiche ne revient jamais en arrière', async () => {
    const { send, calls } = manualSend();
    const saver = new ProductSaver(BASE, send);
    const drafts: ProductSettings[] = [];
    saver.subscribe(() => drafts.push(saver.getSnapshot().draft));
    const ok = { ok: true, message: 'Décisions enregistrées. Le comité applaudit, par habitude.' };
    // 1 : le prix part (sortie du champ) ; accusé, l'écho viendra plus tard (le serveur publie après avoir répondu).
    saver.edit({ price: 120 });
    void saver.flush();
    await settle();
    calls[0].answer(ok);
    await settle();
    // 2 : clic sur la piste du curseur de production, dans le même aller-retour.
    saver.edit({ production: 80 });
    void saver.flush();
    await settle();
    saver.receiveServer({ ...BASE, price: 120 }); // écho 1, pendant l'envoi 2
    calls[1].answer(ok); // accusé 2
    await settle();
    expect(saver.getSnapshot()).toMatchObject({ draft: { ...BASE, price: 120, production: 80 }, adjusted: null, status: 'saved' });
    // 3 : un autre réglage part avant l'écho 2.
    saver.edit({ rnd: 15 });
    void saver.flush();
    await settle();
    saver.receiveServer({ ...BASE, price: 120, production: 80 }); // écho 2, pendant l'envoi 3
    calls[2].answer(ok); // accusé 3
    await settle();
    saver.receiveServer({ ...BASE, price: 120, production: 80, rnd: 15 }); // écho 3
    expect(calls.map((c) => c.values)).toEqual([
      { ...BASE, price: 120 },
      { ...BASE, price: 120, production: 80 },
      { ...BASE, price: 120, production: 80, rnd: 15 },
    ]);
    const from = drafts.findIndex((d) => d.production === 80);
    expect(from).toBeGreaterThan(-1);
    expect(drafts.slice(from).every((d) => d.production === 80)).toBe(true);
    expect(saver.getSnapshot()).toMatchObject({ draft: { ...BASE, price: 120, production: 80, rnd: 15 }, adjusted: null, status: 'saved' });
  });

  it('nouveau trimestre : « Enregistré ✓ » et la ligne des bornes s’effacent ; un échec qui attend reste', async () => {
    const { send, calls } = manualSend();
    const saver = new ProductSaver(BASE, send);
    saver.startTurn(3);
    saver.edit({ marketing: 5_000_000 });
    void saver.flush();
    await settle();
    calls[0].answer({ ok: true, message: 'ok' });
    await settle();
    expect(saver.getSnapshot()).toMatchObject({ status: 'saved', adjusted: ['marketing'] });
    saver.startTurn(3);
    expect(saver.getSnapshot()).toMatchObject({ status: 'saved', adjusted: ['marketing'] });
    saver.startTurn(4);
    expect(saver.getSnapshot()).toMatchObject({ status: 'idle', adjusted: null });
    saver.edit({ price: 90 });
    void saver.flush();
    await settle();
    calls[1].answer({ ok: false, message: 'Refusé' });
    await settle();
    saver.startTurn(5);
    expect(saver.getSnapshot()).toMatchObject({ status: 'failed', draft: { ...BASE, marketing: MAX_SPEND_PER_PRODUCT, price: 90 } });
  });

  it('fiche refermée sur un échec : « Je suis prêt » la réessaie et reste bloqué, la fiche rouverte la reprend', async () => {
    const { send, calls } = manualSend();
    const place: SaverPlace = { room: 'R', companyId: 'c', productId: 'p', name: 'Gadget' };
    const saver = new ProductSaver(BASE, send, place);
    const off = saver.attach();
    saver.edit({ price: 90 });
    off(); // refermer enregistre
    await settle();
    calls[0].answer({ ok: false, message: 'Refusé' });
    await settle();
    expect(orphanSaver(place)).toBe(saver);
    expect(unsavedProductNames()).toEqual(['Gadget']);
    let all: boolean | undefined;
    void flushProductSaves().then((ok) => (all = ok));
    await settle();
    expect(calls.map((c) => c.values.price)).toEqual([90, 90]);
    calls[1].answer({ ok: false, message: 'Refusé' });
    await settle();
    expect(all).toBe(false);
    // La fiche rouverte reprend le brouillon et « Réessayer » ; un succès vide la liste.
    const reopened = orphanSaver(place)!;
    detach.push(reopened.attach());
    expect(orphanSaver(place)).toBeUndefined();
    expect(reopened.getSnapshot()).toMatchObject({ status: 'failed', draft: { ...BASE, price: 90 } });
    expect(unsavedProductNames()).toEqual(['Gadget']);
    void reopened.flush();
    await settle();
    calls[2].answer({ ok: true, message: 'ok' });
    await settle();
    expect(unsavedProductNames()).toEqual([]);
    expect(await flushProductSaves()).toBe(true);
  });

  it('fiche refermée : la pause en cours part tout de suite, et « Je suis prêt » attend son accusé', async () => {
    vi.useFakeTimers();
    const { send, calls } = manualSend();
    const saver = new ProductSaver(BASE, send);
    const off = saver.attach();
    saver.edit({ marketing: 30 });
    saver.commit('soon');
    expect(saver.getSnapshot().status).toBe('saving');
    off();
    await settle();
    expect(calls.map((c) => c.values.marketing)).toEqual([30]);
    let all: boolean | undefined;
    void flushProductSaves().then((ok) => (all = ok));
    await settle();
    expect(all).toBeUndefined();
    calls[0].answer({ ok: true, message: 'ok' });
    await settle();
    expect(all).toBe(true);
    // La minuterie annulée n'envoie rien de plus.
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('« Je suis prêt » enregistre une fiche ouverte qui attendait, et échoue si l’envoi échoue', async () => {
    const { send, calls } = manualSend();
    const saver = new ProductSaver(BASE, send);
    detach.push(saver.attach());
    saver.edit({ price: 90 });
    let all: boolean | undefined;
    void flushProductSaves().then((ok) => (all = ok));
    await settle();
    expect(calls.map((c) => c.values.price)).toEqual([90]);
    calls[0].answer({ ok: false, message: 'Refusé' });
    await settle();
    expect(all).toBe(false);
    expect(saver.getSnapshot().status).toBe('failed');
    // Le joueur remet la valeur enregistrée : plus rien n'attend.
    saver.edit({ price: BASE.price });
    expect(await flushProductSaves()).toBe(true);
    expect(saver.getSnapshot().status).toBe('idle');
  });
});

describe('échecs des fiches refermées', () => {
  /** Fiche refermée sur un échec, pour le produit du joueur dans la vue de test. */
  async function orphan(view: PlayerView) {
    const company = view.companies.find((c) => c.controllerId === 'human')!;
    const product = company.products[0];
    const place: SaverPlace = { room: 'ROOM', companyId: company.id, productId: product.id, name: product.name };
    const saver = new ProductSaver(settingsOf(product), async () => ({ ok: false, message: 'Refusé' }), place);
    const off = saver.attach();
    saver.edit({ price: product.price + 5 });
    off();
    await settle();
    expect(orphanSaver(place)).toBe(saver);
    return { place, company };
  }
  const withPrice = (view: PlayerView, companyId: string, delta: number) => {
    const copy = structuredClone(view);
    copy.companies.find((c) => c.id === companyId)!.products[0].price += delta;
    return copy;
  };

  it('oubliés quand ils n’ont plus d’objet : autre salon, produit arrêté, réglage changé ailleurs, rien à enregistrer', async () => {
    const { view } = fixture('fr');
    const kept = await orphan(view);
    pruneProductSaves('ROOM', view);
    expect(orphanSaver(kept.place)).toBeDefined();
    pruneProductSaves('OTHER', view);
    expect(orphanSaver(kept.place)).toBeUndefined();

    const gone = await orphan(view);
    const without = structuredClone(view);
    without.companies.find((c) => c.id === gone.company.id)!.products = [];
    pruneProductSaves('ROOM', without);
    expect(orphanSaver(gone.place)).toBeUndefined();

    const elsewhere = await orphan(view);
    pruneProductSaves('ROOM', withPrice(view, elsewhere.company.id, 1));
    expect(orphanSaver(elsewhere.place)).toBeUndefined();

    const done = await orphan(view);
    pruneProductSaves('ROOM', withPrice(view, done.company.id, 5));
    expect(orphanSaver(done.place)).toBeUndefined();

    const left = await orphan(view);
    forgetProductSaves();
    expect(orphanSaver(left.place)).toBeUndefined();
  });
});

describe('réglages du début du trimestre', () => {
  it('relève les premières valeurs vues par trimestre et par salon, sans les écraser ensuite', () => {
    const { view, company, product } = fixture('fr');
    const key = productKey(company.id, product.id);
    const first = captureTurnStart(null, 'ROOM', view);
    expect(first.products[key]).toEqual(settingsOf(product));
    expect(turnStartOf(first, 'ROOM', view.turn, company.id, product.id)).toEqual(settingsOf(product));
    // Plus tard dans le trimestre, les réglages ont changé : le relevé ne bouge pas (même objet).
    const later = structuredClone(view);
    later.companies.find((c) => c.id === company.id)!.products[0].price += 7;
    expect(captureTurnStart(first, 'ROOM', later)).toBe(first);
    // Nouveau trimestre, ou autre salon : nouveau relevé.
    const next = { ...later, turn: view.turn + 1 };
    expect(captureTurnStart(first, 'ROOM', next).products[key].price).toBe(product.price + 7);
    expect(turnStartOf(first, 'ROOM', view.turn + 1, company.id, product.id)).toBeUndefined();
    expect(turnStartOf(first, 'OTHER', view.turn, company.id, product.id)).toBeUndefined();
    // Seuls les produits dirigés (vue privée) sont relevés.
    const rivals = view.companies.filter((c) => c.id !== company.id).flatMap((c) => c.products.map((p) => productKey(c.id, p.id)));
    for (const k of rivals) expect(first.products[k]).toBeUndefined();
  });

  it('un produit qui apparaît en cours de trimestre est relevé à sa première vue, sans toucher aux autres', () => {
    const { view, company, product } = fixture('fr');
    const without = structuredClone(view);
    without.companies.find((c) => c.id === company.id)!.products = [];
    const first = captureTurnStart(null, 'ROOM', without);
    expect(Object.keys(first.products)).toEqual([]);
    const second = captureTurnStart(first, 'ROOM', view);
    expect(second).not.toBe(first);
    expect(second.products[productKey(company.id, product.id)]).toEqual(settingsOf(product));
  });
});
