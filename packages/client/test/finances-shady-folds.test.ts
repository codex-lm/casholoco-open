/**
 * Finances et « Actions discutables » : le fréquent visible, le rare replié. Finances : prêt, dividende et bonus
 * visibles, « Rembourser » seulement avec une dette, rachat, fusion et pilule dans « Autres opérations » ; la pilule sort
 * du volet dès qu'un rival détient 20 % (grisée jusqu'à 25 %) ou pendant sa recharge, et le volet s'ouvre alors de
 * lui-même (le rachat est l'autre défense). Actions discutables : jauge, effets et communication de crise visibles, les
 * six combines dans un volet qui s'ouvre de lui-même (jauge « moyenne », réputation sous 1, scandale à la dernière
 * clôture), le reste jusqu'à la fin du trimestre et retient le choix du joueur. Harnais SSR.
 */
import { createElement, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_COLORS,
  SHADY_KINDS,
  createGame,
  getPlayerView,
  resolveTurn,
  type ActionResult,
  type CompanyView,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { fmtFor } from '../src/fmt';
import { POISON_PILL, scandalRisk } from '../src/rules';
import { CompanyTab } from '../src/screens/game/CompanyTab';
import { FinancePanel } from '../src/screens/game/FinancePanel';
import { CRISIS_COMMS_ANCHOR, SHADY_ANCHOR, ShadyPanel } from '../src/screens/game/ShadyPanel';
import { THREAT_STAKE } from '../src/screens/game/city/model';
import {
  forgetShadyFolds,
  rememberShadyFold,
  scandalBurstAtLastClose,
  shadyFoldChoice,
  shadyFoldOpenNow,
  shadyFoldOpensItself,
  showsCrisisComms,
} from '../src/screens/game/shadyFold';
import { getState, setState, type AppState } from '../src/store';

/** Volets rendus : on invoque leur onToggle à la main (pas de DOM). */
const toggles = vi.hoisted(() => ({ els: [] as Record<string, unknown>[] }));

vi.mock('react/jsx-dev-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-dev-runtime')>();
  return {
    ...actual,
    jsxDEV: (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (props && typeof props.onToggle === 'function') toggles.els.push(props);
      return (actual.jsxDEV as (...a: unknown[]) => unknown)(type, props, ...rest);
    },
  };
});

vi.mock('react/jsx-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react/jsx-runtime')>();
  const wrap =
    <F extends (...args: never[]) => unknown>(fn: F) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) => {
      if (props && typeof props.onToggle === 'function') toggles.els.push(props);
      return (fn as (...a: unknown[]) => unknown)(type, props, ...rest);
    };
  return { ...actual, jsx: wrap(actual.jsx), jsxs: wrap(actual.jsxs) };
});

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  sendAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true, message: '' })),
}));

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => {
  setState(initialState);
  forgetShadyFolds();
});

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));
/** Texte d'un fragment HTML : balises (et séparateurs `<!-- -->` du rendu serveur) retirées. */
const plain = (html: string) => html.replace(/<[^>]+>/g, '');

function seat(id: string, name: string, companyName: string, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId: 'gadgets', connected: true, color: PLAYER_COLORS[i] };
}

/** Partie classique sans bot : Ada et Tweetard fabriquent des gadgets. */
function game(lang: Lang): { g: GameState; companyId: string; rivalCompanyId: string } {
  const g = createGame({ seed: 23, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [
    seat('human', 'Ada', 'Atelier Ada', 0),
    seat('rival', 'Tweetard', 'Tweetard SA', 1),
  ]);
  const mine = Object.values(g.companies).find((c) => c.controllerId === 'human')!;
  const theirs = Object.values(g.companies).find((c) => c.controllerId === 'rival')!;
  mine.cash = 50_000;
  g.players.human.cash = 100_000;
  return { g, companyId: mine.id, rivalCompanyId: theirs.id };
}

const mineOf = (view: PlayerView): CompanyView => view.companies.find((c) => c.controllerId === view.you && c.status === 'active')!;

function render(view: PlayerView, lang: Lang, el: ReactElement): string {
  setState({ lang, view, lobby: null });
  toggles.els.length = 0;
  return renderToStaticMarkup(createElement(GameProvider, { view, children: el }));
}
const renderFinance = (view: PlayerView, lang: Lang, company = mineOf(view)) => render(view, lang, createElement(FinancePanel, { company }));
const renderShady = (view: PlayerView, lang: Lang, company = mineOf(view)) => render(view, lang, createElement(ShadyPanel, { company }));

/** Position d'un fragment dans la page, en échouant s'il manque. */
function at(html: string, fragment: string): number {
  const i = html.indexOf(fragment);
  expect(i, fragment).toBeGreaterThan(-1);
  return i;
}

/** Part du rival dans mon entreprise (registre public de la vue). */
function giveStake(company: CompanyView, pct: number): void {
  company.holdings.rival = Math.round(company.sharesOutstanding * pct);
}

const FINANCE_FOLD = '<details class="tab-fold finance-more"';
const SHADY_FOLD = '<details class="tab-fold shady-fold"';

/** Le volet « Autres opérations » est-il ouvert dans ce rendu ? */
const financeOpen = (html: string) => html.includes(`${FINANCE_FOLD} open=""`);
/** Titre d'un volet : son nom, puis « · » et ce qu'il contient. */
const foldSummary = (title: string, meta: string) => `<summary>${escaped(title)} <span class="muted fold-meta">${escaped(`· ${meta}`)}</span></summary>`;

/** Le volet des combines est-il ouvert dans ce rendu ? */
const shadyOpen = (html: string) => html.includes(`${SHADY_FOLD} open=""`);

/** Bouton « Dégainer » de la pilule : grisé ou non. */
function pillButton(html: string, label: string): { disabled: boolean } {
  const found = html.match(new RegExp(`<button type="button" class="btn danger"( disabled="")?>${escaped(label)}</button>`));
  expect(found, label).not.toBeNull();
  return { disabled: Boolean(found![1]) };
}

describe.each(['fr', 'en'] as const)('Finances : le fréquent visible, le rare replié (%s)', (lang) => {
  const t = messages(lang);
  const f = t.finance;
  const fmt = fmtFor(lang);

  it('prêt, dividende et bonus visibles ; « Rembourser » seulement avec une dette', () => {
    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    expect(company.debt).toBe(0);
    let html = renderFinance(view, lang);
    const fold = at(html, FINANCE_FOLD);
    for (const label of [f.loanLabel, f.dividendLabel, f.bonusLabel]) expect(at(html, escaped(label))).toBeLessThan(fold);
    expect(html).not.toContain(escaped(f.repayLabel));
    // Avec une dette, le remboursement revient parmi les opérations visibles, avec sa ligne « après ».
    company.debt = 800;
    html = renderFinance(view, lang);
    const repay = at(html, escaped(f.repayLabel));
    expect(repay).toBeGreaterThan(at(html, escaped(f.loanLabel)));
    expect(repay).toBeLessThan(at(html, FINANCE_FOLD));
    expect(html).toContain(escaped(t.common.maxOf(fmt.money(Math.min(800, company.cash)))));
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('« Autres opérations » : un volet fermé dont le titre nomme le rachat, la fusion et la pilule', () => {
    const { g, rivalCompanyId } = game(lang);
    let view = getPlayerView(g, 'human');
    let html = renderFinance(view, lang);
    // Une seule entreprise : pas de fusion possible, le titre ne la nomme pas. Fermé (personne à 20 %).
    const summary = foldSummary(f.otherOps, [f.otherOpsItems.buyback, f.otherOpsItems.pill].join(' · '));
    const fold = at(html, `${FINANCE_FOLD}>${summary}`);
    expect(plain(summary)).toBe(lang === 'fr' ? 'Autres opérations · Rachat d’actions · Pilule empoisonnée' : 'Other moves · Share buyback · Poison pill');
    expect(at(html, escaped(f.buybackLabel))).toBeGreaterThan(fold);
    // Sans rival à 20 % : la pilule attend dans le volet, grisée, avec la règle des 25 %.
    expect(at(html, escaped(f.pillTitle))).toBeGreaterThan(fold);
    expect(html.slice(fold)).toContain(escaped(f.pillReserved));
    expect(pillButton(html, f.unleash).disabled).toBe(true);
    expect(html).not.toContain(escaped(f.mergeTitle));
    // Deux entreprises dirigées : la fusion entre dans le volet et dans son titre.
    g.companies[rivalCompanyId].controllerId = 'human';
    view = getPlayerView(g, 'human');
    html = renderFinance(view, lang);
    const items = [f.otherOpsItems.buyback, f.otherOpsItems.merge, f.otherOpsItems.pill].join(' · ');
    expect(items).toBe(lang === 'fr' ? 'Rachat d’actions · Fusion · Pilule empoisonnée' : 'Share buyback · Merger · Poison pill');
    const fold2 = at(html, `${FINANCE_FOLD}>${foldSummary(f.otherOps, items)}`);
    expect(at(html, escaped(f.mergeTitle))).toBeGreaterThan(fold2);
    expect(at(html, escaped(f.mergeTitle))).toBeLessThan(at(html, escaped(f.pillTitle)));
    // La communication de crise n'est plus ici : elle est avec la jauge, dans les actions discutables.
    expect(html).not.toContain(escaped(f.crisisTitle));
  });

  it('un rival de 20 à 25 % : la pilule sort du volet, grisée, « utilisable dès 25 % (Tweetard : 22,0 %) » ; le volet s’ouvre', () => {
    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    // Sous 20 % : toujours dans le volet, fermé.
    giveStake(company, 0.15);
    let html = renderFinance(view, lang);
    expect(at(html, escaped(f.pillTitle))).toBeGreaterThan(at(html, FINANCE_FOLD));
    expect(financeOpen(html)).toBe(false);
    // 20 % (la menace de la barre du jeu) : la tuile entière avant le volet, et le titre du volet ne la nomme plus.
    giveStake(company, THREAT_STAKE);
    html = renderFinance(view, lang);
    expect(at(html, escaped(f.pillTitle))).toBeLessThan(at(html, FINANCE_FOLD));
    // Le volet s'ouvre de lui-même : le rachat d'actions, l'autre défense, est à portée.
    expect(at(html, `${FINANCE_FOLD} open="">${foldSummary(f.otherOps, f.otherOpsItems.buyback)}`)).toBeLessThan(at(html, escaped(f.buybackLabel)));
    giveStake(company, 0.22);
    html = renderFinance(view, lang);
    const reason = f.pillFrom(fmt.pct(POISON_PILL.triggerPct, 0), 'Tweetard', fmt.pct(0.22));
    expect(reason).toBe(lang === 'fr' ? `Utilisable dès ${fmt.pct(0.25, 0)} (Tweetard\u00a0: ${fmt.pct(0.22)}).` : `Usable from 25% (Tweetard: ${fmt.pct(0.22)}).`);
    expect(at(html, escaped(reason))).toBeLessThan(at(html, FINANCE_FOLD));
    expect(pillButton(html, f.unleash).disabled).toBe(true);
    // La raison nomme déjà le rival : pas de deuxième ligne « plus gros actionnaire rival ».
    expect(html).not.toContain(escaped(f.biggestRival('Tweetard', fmt.pct(0.22))));
    // Juste sous le seuil, la part est tronquée : jamais « 25,0 % » sur une pilule encore grisée.
    company.holdings.rival = company.sharesOutstanding * 0.2499;
    html = renderFinance(view, lang);
    expect(html).toContain(escaped(f.pillFrom(fmt.pct(0.25, 0), 'Tweetard', fmt.pct(0.249))));
    expect(pillButton(html, f.unleash).disabled).toBe(true);
  });

  it('dès 25 % : la pilule hors du volet est utilisable (si le cash perso suit)', () => {
    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    giveStake(company, POISON_PILL.triggerPct);
    let html = renderFinance(view, lang);
    expect(at(html, escaped(f.pillTitle))).toBeLessThan(at(html, FINANCE_FOLD));
    expect(pillButton(html, f.unleash).disabled).toBe(false);
    expect(html).toContain(escaped(f.biggestRival('Tweetard', fmt.pct(POISON_PILL.triggerPct))));
    expect(html).not.toContain(escaped(f.pillReserved));
    // Sans assez de cash perso : la tuile reste dehors, grisée avec le montant.
    view.players.find((p) => p.id === 'human')!.cash = 0;
    html = renderFinance(view, lang);
    expect(at(html, escaped(f.pillTitle))).toBeLessThan(at(html, FINANCE_FOLD));
    expect(pillButton(html, f.unleash).disabled).toBe(true);
    const pillCost = Math.round(company.sharesOutstanding * POISON_PILL.newSharesPct) * company.sharePrice * POISON_PILL.pricePct;
    expect(html).toContain(escaped(f.pillNeedCash(fmt.money(pillCost))));
  });

  it('pendant la recharge : la pilule reste hors du volet, même sans rival, avec les trimestres restants', () => {
    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    company.private!.modifiers = [{ kind: 'poison_pill_cooldown', turnsLeft: 2 }];
    let html = renderFinance(view, lang);
    expect(at(html, escaped(f.pillTitle))).toBeLessThan(at(html, FINANCE_FOLD));
    expect(at(html, escaped(f.pillCooldown(2)))).toBeLessThan(at(html, FINANCE_FOLD));
    expect(pillButton(html, f.unleash).disabled).toBe(true);
    // Sans menace, « Autres opérations » reste fermé.
    expect(financeOpen(html)).toBe(false);
    // Recharge et rival à 22 % : la raison est la recharge, et la ligne du rival le nomme toujours.
    giveStake(company, 0.22);
    html = renderFinance(view, lang);
    const tile = html.slice(at(html, escaped(f.pillTitle)), at(html, FINANCE_FOLD));
    expect(tile).toContain(escaped(f.pillCooldown(2)));
    expect(tile).toContain(escaped(f.biggestRival('Tweetard', fmt.pct(0.22))));
    expect(html).not.toContain(escaped(f.pillFrom(fmt.pct(POISON_PILL.triggerPct, 0), 'Tweetard', fmt.pct(0.22))));
    expect(pillButton(html, f.unleash).disabled).toBe(true);
    expect(financeOpen(html)).toBe(true);
  });
});

describe.each(['fr', 'en'] as const)('« Actions discutables » : jauge visible, combines repliées (%s)', (lang) => {
  const t = messages(lang);
  const fmt = fmtFor(lang);

  it('au calme : la jauge et son risque, ni effets ni communication de crise, le volet fermé avec son résumé', () => {
    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    expect(company.private!.scandal).toBe(0);
    expect(company.reputation).toBe(1);
    const html = renderShady(view, lang);
    const block = at(html, `id="${SHADY_ANCHOR}" tabindex="-1"`);
    const fold = at(html, SHADY_FOLD);
    expect(block).toBeLessThan(fold);
    expect(at(html, 'class="gauge"')).toBeLessThan(fold);
    expect(html.slice(block, fold)).toContain(`<strong>${escaped(fmt.pct(scandalRisk(0), 0))}</strong>`);
    expect(html).not.toContain(escaped(t.company.effects));
    expect(showsCrisisComms(company)).toBe(false);
    expect(html).not.toContain(`id="${CRISIS_COMMS_ANCHOR}"`);
    expect(shadyOpen(html)).toBe(false);
    const summary = html.slice(fold, html.indexOf('</summary>', fold));
    expect(plain(summary)).toBe(`${t.shady.foldCount(SHADY_KINDS.length)} · ${t.shady.foldScandal(0, t.scandalLevel.faible)}`);
    // Les six combines sont dans le volet, sous le bandeau court et son ⓘ.
    expect(html.slice(fold).match(/class="shady-card/g)).toHaveLength(SHADY_KINDS.length);
    const warning = at(html, `<p class="shady-warning small">${escaped(t.shady.warning)}`);
    expect(warning).toBeGreaterThan(fold);
    expect(html.slice(warning)).toContain(`aria-label="${escaped(t.shady.warningTip)}"`);
  });

  it('résumé : « 6 combines · scandale 12/100 (faible) · 1 effet : Lobbying (2 trim.) » ; la tuile de crise dès qu’il y a du scandale', () => {
    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    const priv = mineOf(view).private!;
    priv.scandal = 12;
    priv.modifiers = [{ kind: 'lobbying', turnsLeft: 2 }];
    let html = renderShady(view, lang);
    const fold = at(html, SHADY_FOLD);
    const summary = plain(html.slice(fold, html.indexOf('</summary>', fold)));
    expect(summary).toBe(
      lang === 'fr'
        ? '6 combines · scandale 12/100 (faible) · 1 effet\u00a0: Lobbying (2 trim.)'
        : '6 schemes · scandal 12/100 (low) · 1 active effect: Lobbying (2 qtr)',
    );
    // Effets en cours et communication de crise : visibles, au-dessus du volet, dans le bloc de la jauge.
    const block = at(html, `id="${SHADY_ANCHOR}"`);
    expect(at(html, escaped(t.company.effects))).toBeGreaterThan(block);
    const tile = at(html, `id="${CRISIS_COMMS_ANCHOR}" tabindex="-1"`);
    expect(tile).toBeGreaterThan(block);
    expect(tile).toBeLessThan(fold);
    expect(html.slice(tile, fold)).toContain(escaped(t.finance.crisisTitle));
    // Jauge « faible », réputation intacte : le volet reste fermé.
    expect(shadyOpen(html)).toBe(false);
    // Deux effets : les deux dans le résumé.
    priv.modifiers.push({ kind: 'offshoring', turnsLeft: 3 });
    html = renderShady(view, lang);
    expect(plain(html)).toContain(
      t.shady.foldEffects(2, [t.shady.foldEffect(t.modifiers.lobbying, t.company.turnsLeft(2)), t.shady.foldEffect(t.modifiers.offshoring, t.company.turnsLeft(3))].join(', ')),
    );
  });

  it('réputation sous 1 sans scandale : la tuile de crise est là (elle répare la réputation) et le volet s’ouvre', () => {
    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    company.reputation = 0.95;
    const html = renderShady(view, lang);
    expect(company.private!.scandal).toBe(0);
    expect(html).toContain(`id="${CRISIS_COMMS_ANCHOR}"`);
    expect(shadyOpen(html)).toBe(true);
  });

  it('déjà publiée ce trimestre, la tuile de crise reste pour le dire, même jauge à 0 et réputation à 1', () => {
    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    company.private!.turnFlags.crisisDone = true;
    const html = renderShady(view, lang);
    expect(html).toContain(`id="${CRISIS_COMMS_ANCHOR}"`);
    expect(html).toContain(escaped(t.finance.crisisDone));
  });

  it('scandale éclaté à la clôture (jauge 15, réputation sous 1) : tuile de crise visible, volet ouvert', () => {
    const { g, companyId } = game(lang);
    g.companies[companyId].scandal = 100; // éclatement certain à la clôture
    resolveTurn(g);
    let view = getPlayerView(g, 'human');
    let company = mineOf(view);
    expect(company.private!.scandal).toBe(15);
    expect(company.reputation).toBeLessThan(1);
    expect(scandalBurstAtLastClose(view, companyId)).toBe(true);
    let html = renderShady(view, lang);
    expect(html).toContain(`id="${CRISIS_COMMS_ANCHOR}" tabindex="-1"`);
    expect(at(html, `id="${CRISIS_COMMS_ANCHOR}"`)).toBeLessThan(at(html, SHADY_FOLD));
    expect(shadyOpen(html)).toBe(true);
    expect(html).toContain(escaped(t.shady.foldScandal(15, t.scandalLevel.faible)));
    // Le scandale seul suffit à ouvrir le volet, même réputation réparée.
    company.reputation = 1;
    expect(shadyFoldOpensItself(view, company)).toBe(true);
    expect(shadyOpen(renderShady(view, lang))).toBe(true);
    // Le trimestre suivant, sans nouvel éclatement : jauge sous « moyen », réputation à 1, le volet reste fermé.
    resolveTurn(g);
    view = getPlayerView(g, 'human');
    company = mineOf(view);
    company.reputation = 1;
    expect(scandalBurstAtLastClose(view, companyId)).toBe(false);
    html = renderShady(view, lang);
    expect(shadyOpen(html)).toBe(false);
  });

  it('ouverture d’office dès « moyen » ; le choix du joueur l’emporte pour le trimestre, puis la règle revient', () => {
    const { g, companyId } = game(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    const priv = company.private!;
    priv.scandal = 29;
    expect(shadyOpen(renderShady(view, lang))).toBe(false);
    // 29,6 s'affiche « 30/100 » comme la jauge, mais reste « faible » comme son badge : volet fermé.
    priv.scandal = 29.6;
    const html = renderShady(view, lang);
    expect(shadyOpen(html)).toBe(false);
    const fold = at(html, SHADY_FOLD);
    expect(plain(html.slice(fold, html.indexOf('</summary>', fold)))).toBe(
      `${t.shady.foldCount(SHADY_KINDS.length)} · ${t.shady.foldScandal(30, t.scandalLevel.faible)}`,
    );
    expect(html.slice(0, fold)).toContain(`<span class="scandal-badge low">${escaped(t.scandalLevel.faible)}</span>`);
    priv.scandal = 30;
    expect(shadyOpen(renderShady(view, lang))).toBe(true);
    // Refermé par le joueur : fermé ce trimestre, même jauge haute.
    rememberShadyFold('local', companyId, view.turn, false);
    priv.scandal = 45;
    expect(shadyOpen(renderShady(view, lang))).toBe(false);
    // Ouvert par le joueur au calme : ouvert.
    rememberShadyFold('local', companyId, view.turn, true);
    priv.scandal = 0;
    expect(shadyOpen(renderShady(view, lang))).toBe(true);
    // Un autre salon, ou le trimestre suivant : la règle seule.
    expect(shadyFoldChoice('other-room', companyId, view.turn)).toBeUndefined();
    view.turn += 1;
    expect(shadyFoldChoice('local', companyId, view.turn)).toBeUndefined();
    expect(shadyOpen(renderShady(view, lang))).toBe(false);
    // Un nouveau choix efface celui du trimestre passé.
    rememberShadyFold('local', companyId, view.turn, true);
    expect(shadyFoldChoice('local', companyId, view.turn - 1)).toBeUndefined();
  });

  it('ouvert de lui-même, le volet le reste jusqu’à la fin du trimestre, puis la règle revient', () => {
    // La règle seule : retenue ouverte ce trimestre, oubliée au suivant ; fermée, rien n'est retenu.
    expect(shadyFoldOpenNow('r', 'c', 3, false)).toBe(false);
    expect(shadyFoldChoice('r', 'c', 3)).toBeUndefined();
    expect(shadyFoldOpenNow('r', 'c', 3, true)).toBe(true);
    expect(shadyFoldChoice('r', 'c', 3)).toBe(true);
    expect(shadyFoldOpenNow('r', 'c', 3, false)).toBe(true);
    expect(shadyFoldOpenNow('r', 'c', 4, false)).toBe(false);
    expect(shadyFoldChoice('r', 'c', 4)).toBeUndefined();
    // Un choix du joueur passe avant la règle.
    rememberShadyFold('r', 'c', 4, false);
    expect(shadyFoldOpenNow('r', 'c', 4, true)).toBe(false);

    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    const company = mineOf(view);
    const priv = company.private!;
    // Jauge à 35 : ouvert ; elle redescend à 22 dans le trimestre (communication de crise) : toujours ouvert.
    priv.scandal = 35;
    expect(shadyOpen(renderShady(view, lang))).toBe(true);
    priv.scandal = 22;
    expect(shadyFoldOpensItself(view, company)).toBe(false);
    expect(shadyOpen(renderShady(view, lang))).toBe(true);
    // Le trimestre suivant : la règle seule, fermé.
    view.turn += 1;
    expect(shadyOpen(renderShady(view, lang))).toBe(false);
    // Réputation sous 1 : ouvert ; réparée jusqu'à 1 dans le trimestre : toujours ouvert.
    company.reputation = 0.9;
    expect(shadyOpen(renderShady(view, lang))).toBe(true);
    company.reputation = 1;
    expect(shadyOpen(renderShady(view, lang))).toBe(true);
    view.turn += 1;
    expect(shadyOpen(renderShady(view, lang))).toBe(false);
  });

  it('le joueur ouvre ou ferme le volet : retenu ; une ouverture venue du rendu ne compte pas comme un choix', () => {
    const { g, companyId } = game(lang);
    const view = getPlayerView(g, 'human');
    const priv = mineOf(view).private!;
    const toggle = (open: boolean) => (toggles.els.at(-1)!.onToggle as (e: { currentTarget: { open: boolean } }) => void)({ currentTarget: { open } });
    // Fermé au calme ; l'événement qui suit un rendu fermé et dit « fermé » vient du rendu : rien n'est retenu.
    expect(shadyOpen(renderShady(view, lang))).toBe(false);
    toggle(false);
    expect(shadyFoldChoice('local', companyId, view.turn)).toBeUndefined();
    // Le joueur l'ouvre : retenu, et le rendu suivant l'affiche ouvert.
    toggle(true);
    expect(shadyFoldChoice('local', companyId, view.turn)).toBe(true);
    expect(shadyOpen(renderShady(view, lang))).toBe(true);
    // Jauge « moyenne » : ouvert d'office ; le joueur le referme, et il reste fermé.
    forgetShadyFolds();
    priv.scandal = 40;
    expect(shadyOpen(renderShady(view, lang))).toBe(true);
    toggle(false);
    expect(shadyFoldChoice('local', companyId, view.turn)).toBe(false);
    expect(shadyOpen(renderShady(view, lang))).toBe(false);
  });

  it('dans « Mon entreprise » : la puce mène au bloc de la jauge, hors du volet ; la section garde sa classe', () => {
    const { g } = game(lang);
    const view = getPlayerView(g, 'human');
    mineOf(view).private!.scandal = 20;
    const html = render(
      view,
      lang,
      createElement(CompanyTab, { company: mineOf(view), onSelect: () => {}, goTo: () => {}, openIssue: () => {}, openMapFor: () => {} }),
    );
    const section = at(html, '<section class="section section-shady">');
    const block = at(html, `id="${SHADY_ANCHOR}" tabindex="-1"`);
    expect(block).toBeGreaterThan(section);
    expect(block).toBeLessThan(at(html, SHADY_FOLD));
    // Finances avant, sans la tuile de crise ; la différence des deux caisses seulement dans l'ⓘ du titre.
    const finances = at(html, `<h3>${escaped(t.company.finances)}`);
    expect(finances).toBeLessThan(section);
    expect(at(html, `id="${CRISIS_COMMS_ANCHOR}"`)).toBeGreaterThan(section);
    const pockets = escaped(t.company.cashPockets);
    expect(html.split(pockets)).toHaveLength(3);
    expect(at(html, `aria-label="${pockets}" data-tip="${pockets}"`)).toBeGreaterThan(finances);
    expect(at(html, `aria-label="${pockets}"`)).toBeLessThan(at(html, FINANCE_FOLD));
  });
});
