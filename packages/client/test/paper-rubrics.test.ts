import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyAction,
  createGame,
  formatMoney,
  getContent,
  getPlayerView,
  resolveTurn,
  startsWithVowelSound,
  takesAn,
  type Article,
  type CompanyView,
  type JournalIssue,
  type Lang,
  type PaperFigureKind,
  type PlayerView,
  type ProductView,
  type QuarterReport,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { JournalTab } from '../src/screens/game/JournalTab';
import { bestFigure, pickFigure } from '../src/screens/game/paper/figure';
import { fill, pickReclame, pickRubrics, type FillCtx, type PaperRubrics } from '../src/screens/game/paper/rubrics';
import { getState, setState, type AppState } from '../src/store';

// Même montage que journal-language.test.ts : sélecteurs de langue réels sur le store courant.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

function gameView(lang: Lang, turns = 3): PlayerView {
  const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang }, [
    { id: 'human', name: 'Ada', isBot: false, companyName: 'Compagnie Test', sectorId: 'gadgets', connected: true, color: '#123456' },
  ]);
  for (let t = 0; t < turns; t++) {
    const company = Object.values(game.companies).find((c) => c.controllerId === 'human');
    if (company) applyAction(game, 'human', { type: 'ceoBonus', companyId: company.id, amount: 600 });
    resolveTurn(game);
  }
  return getPlayerView(game, 'human');
}

function renderJournal(view: PlayerView, uiLang: Lang = 'fr'): string {
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: createElement(JournalTab, { selectedTurn: null, onSelectTurn: () => {} }) }));
}

function idsOf(r: PaperRubrics) {
  return {
    letters: r.letters.map((l) => l.id),
    oddNews: r.oddNews.map((o) => o.id),
    horoscope: r.horoscope.map((s) => s.id),
    ads: r.ads.map((a) => a.id),
  };
}

function stringsOf(r: PaperRubrics): string[] {
  return [
    ...r.letters.flatMap((l) => [l.text, l.signature]),
    ...r.oddNews.flatMap((o) => [o.place, o.text]),
    ...r.horoscope.flatMap((s) => [s.name, s.text]),
    ...r.ads.flatMap((a) => [a.head, a.text]),
  ];
}

describe('rubriques du bas de page du journal', () => {
  it('le lot de contenu paper du moteur est présent', () => {
    expect(getContent('fr').paper, 'getContent("fr").paper (lot de contenu du bas de page)').toBeTruthy();
    expect(getContent('en').paper, 'getContent("en").paper').toBeTruthy();
  });

  it('sont déterministes, complètes et identiques d’une langue à l’autre (mêmes ids)', () => {
    const view = gameView('fr', 3);
    for (const issue of view.journal) {
      const fr = pickRubrics(issue, view, 'fr');
      const fr2 = pickRubrics(issue, view, 'fr');
      const en = pickRubrics(issue, view, 'en');
      expect(fr).not.toBeNull();
      expect(fr2).toEqual(fr);
      expect(idsOf(en!)).toEqual(idsOf(fr!));
      expect(fr!.letters).toHaveLength(2);
      expect(fr!.oddNews).toHaveLength(3);
      expect(fr!.horoscope).toHaveLength(4);
      expect(fr!.ads).toHaveLength(3);
      // Le numéro de référence des annonces est déterministe.
      expect(fr!.ads.map((a) => a.ref)).toEqual(en!.ads.map((a) => a.ref));
    }
  });

  it('ne laisse aucun placeholder {…} dans les textes rendus', () => {
    const view = gameView('fr', 3);
    for (const issue of view.journal) {
      for (const lang of ['fr', 'en'] as const) {
        for (const s of stringsOf(pickRubrics(issue, view, lang)!)) expect(s).not.toContain('{');
        const figure = pickFigure(issue, view, lang);
        if (figure) expect(figure.quip).not.toContain('{');
      }
    }
  });

  it('ne nomme jamais une entreprise ou un joueur des flashs du numéro', () => {
    const view = gameView('fr', 2);
    const company = view.companies.find((c) => c.controllerId === 'human')!;
    const player = view.players.find((p) => p.id === 'human')!;
    const other = view.companies.find((c) => c.id !== company.id && c.status === 'active')!;
    const issue = (resultsCompanyId: string): JournalIssue => ({
      turn: 3,
      dateLabel: 'T3 2027',
      rumors: [],
      articles: [
        { id: 'h', kind: 'headline', tone: 'bad', title: 'La une du jour', body: '', sectorIds: ['gadgets'] },
        { id: 'r', kind: 'results', tone: 'bad', title: 'Grosse perte', body: '', companyIds: [resultsCompanyId], event: { type: 'bigLoss', amount: 1234, leaderId: player.id } },
        { id: 'f', kind: 'flash', tone: 'drama', title: 'OPA surprise', body: '', companyIds: [company.id], event: { type: 'takeover', actorId: player.id } },
      ],
    });

    // Le seul résultat nomme une entreprise des flashs : repli sur une lettre libre, nom jamais cité.
    const avoided = pickRubrics(issue(company.id), view, 'fr')!;
    const flat = stringsOf(avoided).join(' ');
    for (const name of [company.name, company.ticker, player.name]) expect(flat).not.toContain(name);

    // Un résultat hors flashs, lui, alimente bien le courrier (entreprise et montant remplis).
    const named = pickRubrics(issue(other.id), view, 'fr')!;
    expect(named.letters.some((l) => l.text.includes(other.name))).toBe(true);
  });

  it('le chiffre du trimestre a les mêmes genre et nombres en fr et en', () => {
    const view = gameView('fr', 3);
    for (const issue of view.journal) {
      const fr = pickFigure(issue, view, 'fr');
      const en = pickFigure(issue, view, 'en');
      expect(en === null).toBe(fr === null);
      if (fr && en) {
        expect(en.kind).toBe(fr.kind);
        expect([en.quarter, en.amount, en.pct, en.count, en.turns, en.tone]).toEqual([fr.quarter, fr.amount, fr.pct, fr.count, fr.turns, fr.tone]);
      }
    }
    // N° 1 : pas de trimestre clos, on annonce la durée de la partie.
    const first = pickFigure(view.journal[0], view, 'fr');
    expect(first?.kind).toBe('turns');
    expect(first?.turns).toBe(view.config.totalTurns);
  });

  it('la zone de remplissage ne contient aucun bouton', () => {
    const view = gameView('fr', 3);
    const html = renderJournal(view);
    const fill = html.slice(html.indexOf('paper-fill'), html.indexOf('paper-side'));
    expect(fill).not.toContain('<button');
  });

  it('avec une seule brève le chiffre est dans les brèves ; avec deux, dans le bas de page', () => {
    const view = gameView('fr', 1);
    const base = view.journal[0]; // N° 1 : le chiffre « turns » est toujours disponible
    for (const [briefCount, inBriefs] of [
      [1, true],
      [2, false],
    ] as const) {
      const briefs: Article[] = Array.from({ length: briefCount }, (_, i) => ({
        id: `nb${i}`,
        kind: 'news',
        tone: 'neutral',
        title: `Brève numéro ${i}`,
        body: 'Texte de la brève.',
      }));
      const issue: JournalIssue = { ...base, articles: [...base.articles.filter((a) => a.kind !== 'news'), ...briefs] };
      const html = renderJournal({ ...view, journal: [issue] });
      const briefsHtml = html.slice(html.indexOf('briefs-cols'), html.indexOf('paper-fill'));
      const fillHtml = html.slice(html.indexOf('paper-fill'));
      expect(briefsHtml.includes('figure-box'), `figure dans les brèves (${briefCount} brève(s))`).toBe(inBriefs);
      expect(fillHtml.includes('figure-box'), `figure dans le bas de page (${briefCount} brève(s))`).toBe(!inBriefs);
    }
  });
});

/** Vue dont la première entreprise porte une faillite publique (dette + dernière perte publiée). */
function bankruptView(view: PlayerView): { view: PlayerView; company: PlayerView['companies'][number] } {
  const company = view.companies[0];
  const report = { ...company.reports[company.reports.length - 1], turn: 1, netProfit: -1800 };
  return {
    view: { ...view, companies: view.companies.map((c) => (c.id === company.id ? { ...c, debt: 2500, reports: [report] } : c)) },
    company,
  };
}

function letterTrigger(lang: Lang, id: string): string | undefined {
  return getContent(lang).paper?.letters.find((l) => l.id === id)?.trigger;
}

function letterTemplate(lang: Lang, id: string): string {
  return getContent(lang).paper!.letters.find((l) => l.id === id)!.text;
}

describe('courrier des lecteurs : faillites, une et signatures', () => {
  it('les lettres de faillite sont atteignables (une et résultats), montant public, fr et en', () => {
    const { view, company } = bankruptView(gameView('fr', 3));
    const bankruptcy = (kind: 'headline' | 'results'): Article => ({
      id: 'bk',
      kind,
      tone: 'drama',
      title: 'Faillite retentissante',
      body: '',
      companyIds: [company.id],
      event: { type: 'bankruptcy', subjectId: company.controllerId ?? 'human' },
    });
    const issues: JournalIssue[] = [
      // La faillite en une (montant absent de l'événement, comme le produit le moteur).
      { turn: 4, dateLabel: 'T4 2027', rumors: [], articles: [bankruptcy('headline')] },
      // La faillite dans les résultats, derrière une une ordinaire.
      {
        turn: 4,
        dateLabel: 'T4 2027',
        rumors: [],
        articles: [
          { id: 'h', kind: 'headline', tone: 'good', title: 'Bonne nouvelle', body: '', sectorIds: ['gadgets'] },
          bankruptcy('results'),
        ],
      },
    ];
    for (const issue of issues) {
      for (const lang of ['fr', 'en'] as const) {
        const r = pickRubrics(issue, view, lang)!;
        expect(r.letters, `${issue.articles[0].kind} ${lang}`).toHaveLength(2);
        const letter = r.letters[1];
        expect(letterTrigger(lang, letter.id), `${issue.articles[0].kind} ${lang}`).toBe('bankruptcy');
        expect(letter.text).toContain(company.name);
        expect(letter.text).not.toContain('{');
        expect(letter.signature).not.toContain('{');
      }
    }
  });

  it('une faillite sans perte publiée a quand même sa lettre, et passe avant les résultats ordinaires', () => {
    const { view, company } = bankruptView(gameView('fr', 3));
    // Aucune perte publiée : la lettre ne peut pas citer de montant.
    company.reports = company.reports.map((r) => ({ ...r, netProfit: Math.abs(r.netProfit) }));
    const other = view.companies.find((c) => c.id !== company.id)!;
    const issue: JournalIssue = {
      turn: 4,
      dateLabel: 'T4 2027',
      rumors: [],
      articles: [
        { id: 'h', kind: 'headline', tone: 'good', title: 'Bonne nouvelle', body: '', sectorIds: ['gadgets'] },
        { id: 'p', kind: 'results', tone: 'good', title: 'Bénéfice', body: '', companyIds: [other.id], event: { type: 'bigProfit', amount: 1200 } },
        { id: 'bk', kind: 'results', tone: 'drama', title: 'Faillite', body: '', companyIds: [company.id], event: { type: 'bankruptcy', subjectId: 'human' } },
      ],
    };
    for (let seed = 0; seed < 40; seed++) {
      const v = { ...view, config: { ...view.config, textSeed: seed } };
      for (const lang of ['fr', 'en'] as const) {
        const letter = pickRubrics(issue, v, lang)!.letters[1];
        expect(letterTrigger(lang, letter.id), `graine ${seed} ${lang}`).toBe('bankruptcy');
        expect(letter.text).toContain(company.name);
        expect(letter.text).not.toContain('{');
      }
    }
  });

  it('la lettre de une ne nomme que la matière ou le secteur que la une porte', () => {
    const base = gameView('fr', 1);
    const tones = ['good', 'bad', 'neutral'] as const;
    for (let ts = 0; ts < 200; ts++) {
      const view: PlayerView = { ...base, config: { ...base.config, textSeed: ts } };
      const tone = tones[ts % tones.length];
      const issueOf = (extra: Partial<Article>): JournalIssue => ({
        turn: 2,
        dateLabel: 'T2 2027',
        rumors: [],
        articles: [{ id: 'h', kind: 'headline', tone, title: 'La une du jour', body: '', ...extra }],
      });

      // Une sans matière ni secteur : jamais de lettre à {commodity}, {sector} ou {product}.
      const bare = pickRubrics(issueOf({}), view, 'fr')!;
      expect(letterTemplate('fr', bare.letters[0].id), `sans ids (ts=${ts})`).not.toMatch(/\{(commodity|sector|product)\}/);

      // Secteur seul : jamais une lettre à {commodity} (dont lettre-02 et lettre-08).
      const sectorOnly = pickRubrics(issueOf({ sectorIds: ['scooters'] }), view, 'fr')!;
      expect(letterTemplate('fr', sectorOnly.letters[0].id), `secteur seul (ts=${ts})`).not.toContain('{commodity}');
      expect(['lettre-02', 'lettre-08']).not.toContain(sectorOnly.letters[0].id);

      // Matière seule : jamais une lettre à {sector}/{product} (dont lettre-06, -11 et -16).
      const commodityOnly = pickRubrics(issueOf({ commodityIds: ['chips'] }), view, 'fr')!;
      expect(letterTemplate('fr', commodityOnly.letters[0].id), `matière seule (ts=${ts})`).not.toMatch(/\{(sector|product)\}/);
      expect(['lettre-06', 'lettre-11', 'lettre-16']).not.toContain(commodityOnly.letters[0].id);
    }
  });

  it('une une dramatique (faillite) pioche sa première lettre dans le lot « uneBad »', () => {
    const view = gameView('fr', 2);
    const company = view.companies[0];
    const issue: JournalIssue = {
      turn: 3,
      dateLabel: 'T3 2027',
      rumors: [],
      articles: [
        {
          id: 'h',
          kind: 'headline',
          tone: 'drama',
          title: 'Faillite en une',
          body: '',
          companyIds: [company.id],
          event: { type: 'bankruptcy', subjectId: company.controllerId ?? 'human' },
        },
      ],
    };
    const r = pickRubrics(issue, view, 'fr')!;
    expect(letterTrigger('fr', r.letters[0].id)).toBe('uneBad');
  });

  it('un flash sur une autre entreprise de résultats ne change plus la lettre de résultats', () => {
    const view = gameView('fr', 3);
    const [a, b, c] = view.companies;
    const issueWith = (flashCompanyId: string | null): JournalIssue => ({
      turn: 4,
      dateLabel: 'T4 2027',
      rumors: [],
      articles: [
        { id: 'h', kind: 'headline', tone: 'good', title: 'Une', body: '', sectorIds: ['gadgets'] },
        { id: 'r1', kind: 'results', tone: 'good', title: 'Bénéfice', body: '', companyIds: [a.id], event: { type: 'bigProfit', amount: 4200 } },
        { id: 'r2', kind: 'results', tone: 'bad', title: 'Perte', body: '', companyIds: [b.id], event: { type: 'bigLoss', amount: 3100 } },
        { id: 'r3', kind: 'results', tone: 'bad', title: 'Scandale', body: '', companyIds: [c.id], event: { type: 'scandal', amount: 900 } },
        ...(flashCompanyId
          ? [
              {
                id: 'f',
                kind: 'flash',
                tone: 'drama',
                title: 'OPA surprise',
                body: '',
                companyIds: [flashCompanyId],
                event: { type: 'takeover', actorId: 'human' },
              } as Article,
            ]
          : []),
      ],
    });
    for (const lang of ['fr', 'en'] as const) {
      const before = pickRubrics(issueWith(null), view, lang)!.letters[1];
      // Le flash vise une entreprise de résultats que la lettre ne nomme pas.
      const flashed = [a, b, c].find((co) => !before.text.includes(co.name) && !before.text.includes(co.ticker))!;
      const after = pickRubrics(issueWith(flashed.id), view, lang)!.letters[1];
      expect(after, `${lang} (flash sur ${flashed.name})`).toEqual(before);
    }
  });

  it('les deux lettres ne partagent jamais la même signature', () => {
    const base = gameView('fr', 3);
    const issue = base.journal[base.journal.length - 1];
    for (let ts = 0; ts < 600; ts++) {
      const view: PlayerView = { ...base, config: { ...base.config, textSeed: ts } };
      const r = pickRubrics(issue, view, 'fr')!;
      if (r.letters.length < 2) continue;
      const beforeComma = (s: string) => s.split(',')[0];
      expect(beforeComma(r.letters[1].signature), `ts=${ts}`).not.toBe(beforeComma(r.letters[0].signature));
    }
  });
});

describe('le chiffre du trimestre : chaînage et comptages', () => {
  it('pénalise le genre réellement affiché au numéro précédent (chaînage)', () => {
    const game = createGame({ seed: 2000, totalTurns: 16, turnSeconds: 90, startYear: 2027, lang: 'fr' }, [
      { id: 'human', name: 'Ada', isBot: false, companyName: 'Compagnie Test', sectorId: 'gadgets', connected: true, color: '#123456' },
    ]);
    for (let t = 0; t < 16; t++) resolveTurn(game);
    const view = getPlayerView(game, 'human');
    const kindOf = new Map<number, PaperFigureKind | null>();
    for (const issue of view.journal) kindOf.set(issue.turn, pickFigure(issue, view, 'fr')?.kind ?? null);
    for (const issue of view.journal) {
      if (issue.turn < 3 || !view.journal.some((i) => i.turn === issue.turn - 1)) continue;
      const prevKind = kindOf.get(issue.turn - 1) ?? undefined;
      const expected = bestFigure(view, issue.turn - 1, prevKind);
      expect(kindOf.get(issue.turn) ?? null, `N°${issue.turn}`).toBe(expected);
    }
  });

  it('compte les entreprises (dividendes) et les PDG (bonus), pas les versements', () => {
    const base = gameView('fr', 1);
    const company = base.companies[0];
    const flatView = (articles: Article[]): PlayerView => ({
      ...base,
      companies: base.companies.map((c) => ({ ...c, reports: [] })),
      commodities: base.commodities.map((c) => ({ ...c, priceHistory: [10, 10] })),
      sectors: base.sectors.map((s) => ({ ...s, demandHistory: [100] })),
      players: base.players.map((p) => ({ ...p, netWorthHistory: [1000] })),
      journal: [
        { turn: 1, dateLabel: 'T1 2027', rumors: [], articles },
        { turn: 2, dateLabel: 'T2 2027', rumors: [], articles: [{ id: 'h', kind: 'headline', tone: 'neutral', title: 'Une', body: '' }] },
      ],
    });

    // Trois dividendes sur la même entreprise : une seule entreprise généreuse.
    const dividends = [0, 1, 2].map(
      (i): Article => ({ id: `d${i}`, kind: 'flash', tone: 'good', title: '', body: '', companyIds: [company.id], event: { type: 'dividend', amount: 50000, actorId: 'human' } }),
    );
    const figD = pickFigure(flatView(dividends).journal[1], flatView(dividends), 'fr')!;
    expect(figD.kind).toBe('dividends');
    expect(figD.count).toBe(1);
    expect(figD.amount).toBe(150000);

    // Trois bonus mais deux PDG distincts : deux bénéficiaires.
    const bonuses = [0, 1, 2].map(
      (i): Article => ({
        id: `b${i}`,
        kind: 'flash',
        tone: 'good',
        title: '',
        body: '',
        companyIds: [company.id],
        event: { type: 'ceoBonus', amount: 50000, actorId: i === 2 ? 'other-ceo' : 'human' },
      }),
    );
    const figB = pickFigure(flatView(bonuses).journal[1], flatView(bonuses), 'fr')!;
    expect(figB.kind).toBe('bonuses');
    expect(figB.count).toBe(2);
    expect(figB.amount).toBe(150000);
  });

  it('accord du singulier dans les légendes du chiffre (fr)', () => {
    const caption = messages('fr').journal.paper.figureCaption;
    expect(caption.bonuses('T3', 1)).toContain('1 bénéficiaire modeste');
    expect(caption.bonuses('T3', 2)).toContain('2 bénéficiaires modestes');
    expect(caption.dividends('T3', 1)).toContain('1 entreprise généreuse');
    expect(caption.dividends('T3', 2)).toContain('2 entreprises généreuses');
  });
});

describe('grammaire du remplissage des gabarits', () => {
  it('élisions et articles corrects sur 200 graines de texte (fr et en)', () => {
    const base = gameView('fr', 3);
    for (let ts = 0; ts < 200; ts++) {
      const view: PlayerView = { ...base, config: { ...base.config, textSeed: ts } };
      for (const issue of view.journal) {
        // « titre de une » est un idiotisme (la une = la première page), pas une élision manquée.
        const fr = stringsOf(pickRubrics(issue, view, 'fr')!).map((s) => s.replace(/titre de une/g, ''));
        for (const s of fr) expect(s, `fr ts=${ts}`).not.toMatch(/\b[Dd]e (?:un|une|Île)\b|\b(?:du|au|le) Puces/u);
        const en = stringsOf(pickRubrics(issue, view, 'en')!);
        for (const s of en) expect(s, `en ts=${ts}`).not.toMatch(/\b[Aa] (?:Energy|E-Scooters|“Organic”|Oil)\b|unsold an? /);
      }
    }
  });

  it('chaque gabarit × chaque valeur de chaque placeholder produit un texte correct (fr et en)', () => {
    for (const lang of ['fr', 'en'] as const) {
      const content = getContent(lang);
      const paper = content.paper!;
      const view = gameView(lang, 1);
      const ctx: FillCtx = { paper, content, view, key: 'exhaustif' };
      const values: Record<string, string[]> = {
        city: Object.values(content.mapNames.cities),
        zone: Object.values(content.mapNames.zones),
        landmark: Object.values(content.mapNames.landmarks),
        commodity: view.commodities.map((c) => content.commodities[c.id]?.name ?? c.name),
        sector: view.sectors.map((s) => content.sectors[s.id]?.name ?? s.name),
        product: Object.values(paper.sectorProducts).flat(),
        company: view.companies.map((c) => c.name),
        amount: [1234.5, 800, 1000000, 8].map((k) => formatMoney(k, lang)),
      };
      const templates: string[] = [
        ...paper.letters.map((l) => l.text),
        ...paper.signatures.map((s) => s.text),
        ...paper.oddNews.map((o) => o.text),
        ...paper.signs.flatMap((s) => s.texts.map((t) => t.text)),
        ...paper.ads.flatMap((a) => [a.head, a.text]),
        ...Object.values(paper.figureQuips).flat(),
      ];
      const PLACEHOLDER = /\{(city|zone|landmark|commodity|sector|product|company|amount)\}/g;
      const broken: string[] = [];
      const check = (tpl: string, out: string, used: Readonly<Record<string, string>>, label: string) => {
        const problems: string[] = [];
        if (out.includes('{')) problems.push('placeholder restant');
        if (/ {2}/.test(out)) problems.push('double espace');
        // « titre de une » est un idiotisme (la une = la première page), pas une élision manquée.
        const elidable = out.replace(/titre de une/g, '');
        if (lang === 'fr') {
          // « de/à le(s) » et « de/à Le/La/Les » : ne sont signalés que s'ils viennent du
          // remplissage (un « de le + verbe » littéral du gabarit relève du test de contenu).
          for (const m of out.matchAll(/(?<!\p{L})(?:de|à) (?:le|les|Le|La|Les)(?!\p{L})/gu)) {
            if (!tpl.includes(m[0])) problems.push(`contraction manquée « ${m[0]} »`);
          }
          for (const m of elidable.matchAll(/(?:^|\s)([Dd]e|[Qq]ue) (\S+)/g)) {
            const word = m[2].replace(/^[«"“‘']+/, '');
            if (startsWithVowelSound(word) && !tpl.includes(`${m[1]} ${m[2]}`)) problems.push(`élision manquée « ${m[1]} ${word} »`);
          }
        } else {
          // L'article anglais n'est contrôlé que devant les valeurs insérées (les textes littéraux,
          // p. ex. « a UFO », relèvent du test de contenu ; takesAn décide, pas une liste en dur).
          for (const v of new Set(Object.values(used))) {
            const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (takesAn(v.replace(/^[“"‘'«$]+/, ''))) {
              if (new RegExp(`\\b[Aa] ${esc}`).test(out)) problems.push(`« a ${v} » devrait être « an »`);
            } else if (new RegExp(`\\b[Aa]n ${esc}`).test(out)) {
              problems.push(`« an ${v} » devrait être « a »`);
            }
          }
        }
        if (problems.length) broken.push(`${label} → ${out}  [${problems.join(', ')}]`);
      };
      for (const tpl of templates) {
        const names = [...new Set([...tpl.matchAll(PLACEHOLDER)].map((m) => m[1]))];
        if (names.length === 0) {
          check(tpl, tpl, {}, tpl);
          continue;
        }
        for (const name of names) {
          for (const v of values[name]) {
            const forceValues: Record<string, string> = {};
            for (const other of names) forceValues[other] = values[other][0];
            forceValues[name] = v;
            check(tpl, fill(tpl, { ...ctx, forceValues }), forceValues, `${tpl}  (${name}=${v})`);
          }
        }
      }
      expect(broken, `${lang} :\n${broken.join('\n')}`).toEqual([]);
    }
  });
});

describe('réclame : l’annonceur du trimestre clos', () => {
  const report = (turn: number, marketing: number): QuarterReport => ({
    turn,
    revenue: 0,
    cogs: 0,
    marketing,
    rnd: 0,
    fixedCosts: 0,
    interest: 0,
    fines: 0,
    tax: 0,
    netProfit: 0,
    cashEnd: 0,
    debtEnd: 0,
    products: [],
  });

  const stubProduct = (c: CompanyView): ProductView => ({
    id: `${c.id}-p0`,
    name: `Produit ${c.name}`,
    sectorId: 'gadgets',
    quality: 1,
    brand: 1,
    capacity: 0,
    price: 1,
    lastSales: 0,
    lastRevenue: 0,
    lastMarketShare: 0,
    launchedTurn: 1,
  });

  /** Vue aplatie : entreprises actives, au moins un produit en rayon dès le T1, aucun compte publié. */
  function blankView(): PlayerView {
    const view = gameView('fr', 1);
    return {
      ...view,
      companies: view.companies.map((c) => ({
        ...c,
        status: 'active' as const,
        reports: [],
        products: (c.products.length ? c.products : [stubProduct(c)]).map((p) => ({ ...p, comingSoon: false, launchedTurn: 1 })),
      })),
    };
  }

  const issueAt =(turn: number, extra: Article[] = []): JournalIssue => ({
    turn,
    dateLabel: `T${turn} 2027`,
    rumors: [],
    articles: [{ id: 'h', kind: 'headline', tone: 'neutral', title: 'La une du jour', body: '' }, ...extra],
  });

  /** Deux annonceurs : a dépense 500 au T1, b dépense 900. */
  function twoAdvertisers(): { view: PlayerView; a: CompanyView; b: CompanyView } {
    const view = blankView();
    const [a, b] = view.companies;
    a.reports.push(report(1, 500));
    b.reports.push(report(1, 900));
    return { view, a, b };
  }

  it('retourne null au N° 1 (pas de trimestre clos)', () => {
    const { view } = twoAdvertisers();
    expect(pickReclame(view.journal[0], view, 'fr')).toBeNull();
  });

  it('l’annonceur est l’entreprise active qui a le plus dépensé en marketing au trimestre clos', () => {
    const { view, b } = twoAdvertisers();
    const rec = pickReclame(issueAt(2), view, 'fr')!;
    expect(rec).not.toBeNull();
    expect(rec.companyId).toBe(b.id);
    expect(rec.company).toBe(b.name);
    expect(rec.amount).toBe(900);
    expect(rec.quarter).toBe(1);
  });

  it('une entreprise nommée par un flash du numéro est écartée, même avec le plus gros marketing', () => {
    const { view, a, b } = twoAdvertisers();
    const flash: Article = {
      id: 'f',
      kind: 'flash',
      tone: 'drama',
      title: 'OPA surprise',
      body: '',
      companyIds: [b.id],
      event: { type: 'takeover', actorId: 'human' },
    };
    expect(pickReclame(issueAt(2, [flash]), view, 'fr')!.companyId).toBe(a.id);
  });

  it('une entreprise sans produit en rayon (bientôt disponible ou lancé après q) est écartée', () => {
    const { view, a, b } = twoAdvertisers();
    b.products = b.products.map((p) => ({ ...p, comingSoon: true }));
    expect(pickReclame(issueAt(2), view, 'fr')!.companyId, 'comingSoon').toBe(a.id);
    b.products = b.products.map((p) => ({ ...p, comingSoon: false, launchedTurn: 3 }));
    expect(pickReclame(issueAt(2), view, 'fr')!.companyId, 'lancé après q').toBe(a.id);
  });

  it('pénalise ×0,6 l’annonceur du numéro précédent (chaînage via le journal)', () => {
    const view = blankView();
    const [a, b] = view.companies;
    a.reports.push(report(1, 1000), report(2, 1000));
    b.reports.push(report(2, 700));
    const journal = [issueAt(1), issueAt(2), issueAt(3)];
    const v: PlayerView = { ...view, journal };
    // N° 2 : seul A a publié du marketing au T1, c'est l'annonceur.
    expect(pickReclame(journal[1], v, 'fr')!.companyId).toBe(a.id);
    // N° 3 : sans pénalité A gagnerait (1000 > 700), mais 1000 × 0,6 < 700 — c'est B.
    expect(pickReclame(journal[2], v, 'fr')!.companyId).toBe(b.id);
  });

  it('un changement de statut après coup ne réécrit ni les encadrés archivés ni la chaîne ×0,6', () => {
    const view = blankView();
    const [a, b, c] = view.companies;
    a.reports.push(report(1, 900), report(2, 900));
    b.reports.push(report(1, 500), report(2, 800));
    c.reports.push(report(1, 100), report(2, 600));
    const journal = [issueAt(1), issueAt(2), issueAt(3)];
    const v: PlayerView = { ...view, journal };

    // N° 2 : A domine le T1 (900 > 500 > 100) ; N° 3 : A pénalisé (900 × 0,6 = 540 < 800) et 800 > 600 → B.
    const rec2 = pickReclame(journal[1], v, 'fr')!;
    const rec3 = pickReclame(journal[2], v, 'fr')!;
    const en2 = pickReclame(journal[1], v, 'en')!;
    expect(rec2.companyId).toBe(a.id);
    expect(rec3.companyId).toBe(b.id);

    // L'éligibilité se juge sur les comptes publiés, pas sur le statut : une entreprise absorbée qui
    // garde son catalogue laisse les encadrés archivés bit-identiques.
    a.status = 'merged';
    expect(pickReclame(journal[1], v, 'fr')).toEqual(rec2);
    expect(pickReclame(journal[2], v, 'fr')).toEqual(rec3);
    expect(pickReclame(journal[1], v, 'en')).toEqual(en2);

    // Catalogue vidé (faillite) : l'encadré archivé passe à l'annonceur suivant, pareil pour tous.
    a.status = 'bankrupt';
    a.products = [];
    const rec2b = pickReclame(journal[1], v, 'fr')!;
    expect(rec2b.companyId).toBe(b.id);
    expect(pickReclame(journal[1], v, 'en')!.companyId).toBe(b.id);
  });

  it('repli sur le second quand le nom du favori contient le nom d’un joueur d’un flash', () => {
    const view = blankView();
    const [a, b, c] = view.companies;
    a.name = 'Ada & Cie';
    a.products = a.products.map((p) => ({ ...p, name: 'Ada Max' }));
    a.reports.push(report(1, 900));
    b.reports.push(report(1, 50));
    c.reports.push(report(1, 500));

    // Sans flash : A, plus gros annonceur du T1 (900 > 500 > 50), obtient l'encadré.
    expect(pickReclame(issueAt(2), view, 'fr')!.companyId).toBe(a.id);

    // Le flash nomme B et le joueur « Ada » : « Ada & Cie » et « Ada Max » contiennent ce nom,
    // donc tous les gabarits d'A sont rejetés → repli sur C (500), pas sur B (exclu par le flash).
    const flash: Article = {
      id: 'f',
      kind: 'flash',
      tone: 'drama',
      title: 'OPA surprise',
      body: '',
      companyIds: [b.id],
      event: { type: 'takeover', actorId: 'human' },
    };
    for (const lang of ['fr', 'en'] as const) {
      const rec = pickReclame(issueAt(2, [flash]), view, lang);
      expect(rec, lang).not.toBeNull();
      expect(rec!.companyId, lang).toBe(c.id);
    }
  });

  it('mêmes entreprise, produit et gabarit en fr et en', () => {
    const { view } = twoAdvertisers();
    const issue = issueAt(2);
    const fr = pickReclame(issue, view, 'fr')!;
    const en = pickReclame(issue, view, 'en')!;
    expect([en.companyId, en.product, en.templateId]).toEqual([fr.companyId, fr.product, fr.templateId]);
  });

  it('le texte rendu cite le produit tel quel, sans placeholder, avec deux lignes légales distinctes', () => {
    const { view } = twoAdvertisers();
    const issue = issueAt(2);
    for (const lang of ['fr', 'en'] as const) {
      const rec = pickReclame(issue, view, lang)!;
      expect(rec.text, lang).toContain(rec.product);
      expect(rec.text, lang).not.toContain('{');
      expect(rec.legal, lang).toHaveLength(2);
      expect(rec.legal[0], lang).not.toBe(rec.legal[1]);
      for (const line of rec.legal) expect(line, lang).not.toContain('{');
    }
  });

  it('le bas de page rend l’encadré réclame, sans aucun bouton', () => {
    const { view } = twoAdvertisers();
    const html = renderJournal({ ...view, journal: [view.journal[0], issueAt(2)] });
    expect(html).toContain('paper-reclame');
    const block = html.slice(html.indexOf('paper-reclame'), html.indexOf('paper-reclame') + 2000);
    expect(block).not.toContain('<button');
  });
});
