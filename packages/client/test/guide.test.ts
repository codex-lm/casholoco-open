import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEPOSITS, MIN_STARTUP_INVESTMENT, OFFERS_PER_TURN, SECTORS, SECTOR_IDS, SITE_OPENING_COST_MULT, type Lang } from '@muchomoney/core';
import { GuidePanel } from '../src/components/Guide';
import { fmtFor } from '../src/fmt';
import { GUIDE_SECTIONS, GUIDE_TABS, GUIDE_TOPICS, gameTabOrder, guideNumbers } from '../src/guide';
import { en, fr, messages } from '../src/i18n';
import { SoloHome } from '../src/solo/SoloHome';
import { getState, setState, type AppState } from '../src/store';

vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initial = getState();
afterEach(() => {
  setState(initial);
  vi.unstubAllGlobals();
});
const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

describe('mode d’emploi', () => {
  it('couvre chaque onglet de la partie, avec les mêmes sujets en français et en anglais', () => {
    const gameTabs = Object.keys(fr.game.tabs).filter((k) => k !== 'companies');
    expect([...GUIDE_TABS].sort()).toEqual(gameTabs.sort());
    for (const m of [fr, en]) {
      expect(Object.keys(m.guide.tabs).sort()).toEqual([...GUIDE_TABS].sort());
      expect(Object.keys(m.guide.more).sort()).toEqual([...GUIDE_TOPICS].sort());
      expect(Object.keys(m.guide.sections).sort()).toEqual([...GUIDE_SECTIONS].sort());
    }
  });

  it('cite les chiffres des règles : nombres dans la langue du texte, montants dans la monnaie du salon', () => {
    const nFr = guideNumbers(fmtFor('fr'), fmtFor('fr'));
    const nEn = guideNumbers(fmtFor('en'), fmtFor('en'));
    expect(nFr.control).toBe('50 %');
    expect(nEn.control).toBe('50%');
    expect(nFr.offers).toBe(String(OFFERS_PER_TURN));
    expect(nFr.siteMult).toBe(String(SITE_OPENING_COST_MULT));
    // La fourchette des capacités suit le contenu de la carte (gisements pauvre à riche), pas une constante.
    const caps = Object.values(DEPOSITS).map((d) => d.capacity);
    expect(nFr.siteLotsMin).toBe(String(Math.min(...caps)));
    expect(nFr.siteLotsMax).toBe(String(Math.max(...caps)));
    expect(nFr.startupMin).toBe(fmtFor('fr').money(MIN_STARTUP_INVESTMENT));
    expect(nEn.startupMin).toBe(fmtFor('en').money(MIN_STARTUP_INVESTMENT));
    expect(nFr.tipLeak).toBe('10');
    // La fourchette du « fabriqué ici » suit SECTORS (la crypto, sans bonus, n'y entre pas), pas une constante.
    const localBonuses = SECTOR_IDS.map((s) => SECTORS[s].localBonus).filter((b) => b > 0);
    expect(nFr.localBonusMin).toBe(fmtFor('fr').pct(Math.min(...localBonuses), 0));
    expect(nFr.localBonusMax).toBe(fmtFor('fr').pct(Math.max(...localBonuses), 0));
    expect(nEn.localBonusMin).toBe(fmtFor('en').pct(Math.min(...localBonuses), 0));
    expect(nEn.localBonusMax).toBe(fmtFor('en').pct(Math.max(...localBonuses), 0));
    // Le sujet « Usines et transport » les interpole, dans les deux langues.
    expect(fr.guide.more.zones.body(nFr)).toContain(nFr.localBonusMin);
    expect(fr.guide.more.zones.body(nFr)).toContain(nFr.localBonusMax);
    expect(en.guide.more.zones.body(nEn)).toContain(nEn.localBonusMin);
    expect(en.guide.more.zones.body(nEn)).toContain(nEn.localBonusMax);
    // Texte français, partie en dollars : les pourcentages restent à la française, les montants en dollars.
    const mixed = guideNumbers(fmtFor('fr'), fmtFor('en'));
    expect(mixed.control).toBe('50 %');
    expect(mixed.startupMin).toBe(fmtFor('en').money(MIN_STARTUP_INVESTMENT));
    for (const [m, n] of [
      [fr, nFr],
      [en, nEn],
    ] as const) {
      const texts = [
        ...GUIDE_TABS.map((id) => m.guide.tabs[id](n)),
        ...GUIDE_TOPICS.flatMap((id) => [m.guide.more[id].title, m.guide.more[id].body(n)]),
      ];
      for (const s of texts) {
        expect(s.trim()).not.toBe('');
        expect(s).not.toMatch(/undefined|NaN|\$\{/);
      }
      if (m === en) for (const s of texts) expect(s, s).not.toMatch(/[àâçéèêëîïôûùœ«»]/i);
    }
  });

  it.each(['fr', 'en'] as const)('affiche les trois parties (%s)', (lang: Lang) => {
    setState({ ...initial, lang });
    const t = messages(lang);
    const basics = renderToStaticMarkup(createElement(GuidePanel, { section: 'basics' }));
    expect(basics).toContain('class="how-to-play"');
    const tabs = renderToStaticMarkup(createElement(GuidePanel, { section: 'tabs' }));
    for (const id of GUIDE_TABS) expect(tabs).toContain(escaped(id === 'company' ? t.game.tabs.company : t.game.tabs[id]));
    expect(tabs).not.toContain('undefined');
    const more = renderToStaticMarkup(createElement(GuidePanel, { section: 'more' }));
    for (const id of GUIDE_TOPICS) expect(more).toContain(escaped(t.guide.more[id].title));
    expect(more.match(/<details/g)?.length).toBe(GUIDE_TOPICS.length);
    expect(more).not.toContain('undefined');
  });

  it.each(['fr', 'en'] as const)('« Onglet par onglet » suit l’ordre de la barre : classique ou plateau (%s)', (lang: Lang) => {
    setState({ ...initial, lang });
    const t = messages(lang);
    const order = (mapMode: 'classic' | 'hex') => [...renderToStaticMarkup(createElement(GuidePanel, { section: 'tabs', mapMode }))
      .matchAll(/<dt>([\s\S]*?)<\/dt>/g)].map((m) => m[1]);
    const labels = (ids: readonly (keyof typeof t.guide.tabs)[]) => ids.map((id) => escaped(id === 'company' ? t.game.tabs.company : t.game.tabs[id]));
    expect(order('classic')).toEqual(labels(GUIDE_TABS));
    expect(gameTabOrder('classic')).toEqual(GUIDE_TABS);
    expect(gameTabOrder(undefined)).toEqual(GUIDE_TABS);
    expect(order('hex')).toEqual(labels(['journal', 'company', 'map', 'commodities', 'stocks', 'markets', 'deals', 'ranking', 'factories']));
    expect([...gameTabOrder('hex')].sort()).toEqual([...GUIDE_TABS].sort());
  });

  it.each(['fr', 'en'] as const)('s’ouvre depuis l’accueil solo (%s)', (lang: Lang) => {
    setState({ ...initial, lang });
    const t = messages(lang);
    const home = renderToStaticMarkup(createElement(SoloHome));
    expect(home).toContain(escaped(t.guide.open));
  });
});

describe('sujet « board » et carte hexadécimale', () => {
  it.each(['fr', 'en'] as const)('sur carte, « board » est le premier sujet et le seul ouvert (%s)', (lang: Lang) => {
    setState({ ...initial, lang });
    const t = messages(lang);
    const more = renderToStaticMarkup(createElement(GuidePanel, { section: 'more', mapMode: 'hex' }));
    expect(more.match(/<details/g)?.length).toBe(GUIDE_TOPICS.length);
    expect(more.match(/<details[^>]* open=""/g)?.length).toBe(1);
    const summaries = [...more.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => m[1]);
    expect(summaries[0]).toBe(escaped(t.guide.more.board.title));
    // Le sujet ouvert est bien « board » : c'est le premier `<details>` du rendu.
    expect(more.match(/<details[^>]*>/)![0]).toContain('open=""');
  });

  it.each(['fr', 'en'] as const)('sur carte, « L’essentiel » finit par une ligne sur le plateau et son lien ; pas sur la carte classique (%s)', (lang: Lang) => {
    setState({ ...initial, lang });
    const t = messages(lang);
    const hex = renderToStaticMarkup(createElement(GuidePanel, { section: 'basics', mapMode: 'hex', onOpenBoard: () => {} }));
    const lines = [...hex.matchAll(/<li[^>]*>/g)];
    // Les dix lignes de « Comment jouer », puis le plateau.
    expect(lines).toHaveLength(t.help.lines('10 %').length + 1);
    expect(lines.at(-1)![0]).toContain('how-to-play-board');
    expect(hex).toContain(escaped(t.guide.basicsBoard.split('**')[2]));
    expect(hex).toContain(escaped(t.guide.basicsBoardLink));
    expect(hex).toContain('data-guide-board-link');
    // Le salon et l'accueil montrent la ligne sans lien (pas de partie « Pour aller plus loin » sous la main).
    expect(renderToStaticMarkup(createElement(GuidePanel, { section: 'basics', mapMode: 'hex' }))).not.toContain('data-guide-board-link');
    for (const mapMode of ['classic', undefined] as const) {
      expect(renderToStaticMarkup(createElement(GuidePanel, { section: 'basics', mapMode, onOpenBoard: () => {} }))).not.toContain('how-to-play-board');
    }
  });

  it.each(['fr', 'en'] as const)('le sujet « board » commence par un résumé de deux ou trois phrases, la règle complète suit (%s)', (lang: Lang) => {
    setState({ ...initial, lang });
    const t = messages(lang);
    for (const mapMode of ['hex', 'classic'] as const) {
      const more = renderToStaticMarkup(createElement(GuidePanel, { section: 'more', mapMode }));
      const board = more.match(/<details[^>]*data-guide-topic="board"[^>]*>([\s\S]*?)<\/details>/)![1];
      const lead = board.indexOf('class="guide-topic-lead"');
      expect(lead).toBeGreaterThan(board.indexOf('</summary>'));
      expect(board.indexOf('<p>')).toBeGreaterThan(lead);
    }
    const sentences = t.guide.boardLead.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(3);
    expect(t.guide.boardLead.length).toBeLessThan(t.guide.more.board.body(guideNumbers(fmtFor(lang), fmtFor(lang))).length / 3);
    if (lang === 'fr') {
      for (const text of [t.guide.boardLead, t.guide.basicsBoard]) {
        expect(text).toMatch(/\bvotre\b|\bvous\b|une usine/);
        expect(text).not.toMatch(/ [:;?!]|\btu\b/);
      }
    }
  });

  it.each(['fr', 'en'] as const)('hors carte, l’ordre des sujets est inchangé et aucun n’est ouvert (%s)', (lang: Lang) => {
    setState({ ...initial, lang });
    const t = messages(lang);
    for (const props of [{ section: 'more', mapMode: 'classic' } as const, { section: 'more' } as const]) {
      const more = renderToStaticMarkup(createElement(GuidePanel, props));
      expect(more.match(/<details[^>]* open/g)).toBeNull();
      const summaries = [...more.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => m[1]);
      expect(summaries).toEqual(GUIDE_TOPICS.map((id) => escaped(t.guide.more[id].title)));
    }
  });
});
