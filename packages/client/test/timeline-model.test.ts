import { describe, expect, it } from 'vitest';
import type { Article, ArticleEvent, PlayerView } from '@muchomoney/core';
import {
  EVENT_WEIGHT,
  RESULT_TYPES,
  fanOut,
  pinCap,
  pinsFor,
  quarterOf,
  quarters,
  timelineEntries,
  type TimelineEntry,
  type TimelineFilter,
} from '../src/screens/game/timeline/model';

/** Vue réduite à ce que lit la reconstitution (qui regarde, entreprises, numéros), pour des cas précis. */
function fakeView(you: string, companies: { id: string; controllerId: string | null }[], issues: { turn: number; articles: Partial<Article>[] }[]): PlayerView {
  return {
    you,
    turn: issues.at(-1)!.turn,
    config: { totalTurns: 8, startYear: 2027, lang: 'fr' },
    players: [],
    companies: companies.map((c) => ({ status: 'active', products: [], ...c })),
    journal: issues.map((i) => ({
      turn: i.turn,
      dateLabel: `T${i.turn}`,
      rumors: [],
      articles: i.articles.map((a, k) => ({ id: `a${i.turn}-${k}`, title: 'titre', body: '', tone: 'neutral', kind: 'flash', ...a })),
    })),
  } as unknown as PlayerView;
}

function entries(you: string, companies: { id: string; controllerId: string | null }[], issues: { turn: number; articles: Partial<Article>[] }[]): TimelineEntry[] {
  return timelineEntries(fakeView(you, companies, issues));
}

const ALL: TimelineFilter = { families: ['control', 'scandals', 'products', 'money'], mineOnly: false };

describe('quarterOf : les résultats sont datés du trimestre qu’ils closent', () => {
  it('les 7 types de résultats remontent d’un trimestre, les autres restent au numéro', () => {
    const results = RESULT_TYPES.map((type) => ({ kind: 'results' as const, companyIds: ['x'], event: { type, leaderId: 'ada' } as ArticleEvent }));
    const found = entries('cleo', [{ id: 'x', controllerId: 'ada' }], [
      { turn: 2, articles: [{ companyIds: ['x'], event: { type: 'dividend' as const, actorId: 'ada', amount: 5 } }] },
      { turn: 3, articles: [...results, { companyIds: ['x'], event: { type: 'stakeBuilding' as const, actorId: 'bob', pct: 0.26 } }] },
    ]);
    expect(RESULT_TYPES).toEqual(['bigProfit', 'bigLoss', 'bankruptcy', 'scandal', 'cartelBusted', 'siteOpened', 'marginCall']);
    for (const e of found.filter((e) => RESULT_TYPES.includes(e.event.type))) expect(quarterOf(e), e.event.type).toBe(2);
    expect(quarterOf(found[0])).toBe(2); // dividende, flash du T2
    expect(quarterOf(found.at(-1)!)).toBe(3); // montée au capital, flash du T3
  });

  it('le champ quarter du moteur, le jour où il existe, fait foi', () => {
    const [entry] = entries('ada', [], [
      { turn: 3, articles: [{ kind: 'results', event: { type: 'bigProfit', leaderId: 'ada', quarter: 7 } as ArticleEvent }] },
    ]);
    expect(quarterOf(entry)).toBe(7);
  });

  it('quarters() groupe par trimestre des faits, pas par numéro de parution', () => {
    const view = fakeView('ada', [{ id: 'x', controllerId: 'ada' }], [
      { turn: 2, articles: [{ companyIds: ['x'], event: { type: 'dividend' as const, actorId: 'ada', amount: 5 } }] },
      { turn: 3, articles: [{ kind: 'results', companyIds: ['x'], event: { type: 'bigLoss' as const, leaderId: 'ada', amount: 100 } }] },
    ]);
    const cols = quarters(view, timelineEntries(view));
    expect(cols[1].entries.map((e) => e.event.type)).toEqual(['dividend', 'bigLoss']);
    expect(cols[2].entries).toEqual([]);
    expect(cols.filter((c) => c.hasIssue).map((c) => c.turn)).toEqual([2, 3]);
  });
});

describe('players et lead : qui est impliqué, et qui d’abord', () => {
  it('une prise de contrôle donne l’acquéreur et le sortant, l’acquéreur d’abord', () => {
    const [takeover] = entries('cleo', [{ id: 'x', controllerId: 'bob' }], [
      { turn: 2, articles: [{ companyIds: ['x'], event: { type: 'takeover', actorId: 'bob', subjectId: 'ada', pct: 0.5 } }] },
    ]);
    expect(takeover.players).toEqual(['bob', 'ada']);
    expect(takeover.lead).toBe('bob');
  });

  it('une montée au capital donne l’acheteur et le dirigeant de l’époque', () => {
    const [stake] = entries('cleo', [{ id: 'x', controllerId: 'ada' }], [
      { turn: 2, articles: [{ companyIds: ['x'], event: { type: 'stakeBuilding', actorId: 'bob', pct: 0.26 } }] },
    ]);
    expect(new Set(stake.players)).toEqual(new Set(['bob', 'ada']));
    expect(stake.lead).toBe('bob');
  });

  it('une entente démantelée donne ses dirigeants', () => {
    const [cartel] = entries('cleo', [{ id: 'x', controllerId: 'ada' }, { id: 'y', controllerId: 'bob' }], [
      { turn: 3, articles: [{ kind: 'results', companyIds: ['x', 'y'], event: { type: 'cartelBusted', leaderIds: ['ada', 'bob'], amount: 50 } }] },
    ]);
    expect(cartel.players).toEqual(['ada', 'bob']);
    expect(cartel.lead).toBe('ada');
  });

  it('le lanceur d’alerte n’y est jamais : le dirigeant de l’époque, lui, y est', () => {
    const [blow] = entries('cleo', [{ id: 'x', controllerId: 'ada' }], [
      { turn: 2, articles: [{ companyIds: ['x'], event: { type: 'whistleblow', actorId: 'bob' } }] },
    ]);
    expect(blow.players).toEqual(['ada']);
    expect(blow.lead).toBe('ada');
  });

  it('un événement purement PNJ n’implique personne', () => {
    const [dividend] = entries('ada', [{ id: 'x', controllerId: null }], [
      { turn: 2, articles: [{ companyIds: ['x'], event: { type: 'dividend', amount: 5 } }] },
    ]);
    expect(dividend.players).toEqual([]);
    expect(dividend.lead).toBeNull();
  });
});

describe('pinsFor : les repères sur les courbes', () => {
  it('les neuf types qui changent qui dirige quoi (ou ruinent) ont le poids 3', () => {
    const types: (keyof typeof EVENT_WEIGHT)[] = ['takeover', 'controlHandover', 'autopilot', 'bankruptcy', 'merger', 'startup', 'marginCall', 'blockSale', 'cartelBusted'];
    for (const t of types) expect(EVENT_WEIGHT[t], t).toBe(3);
  });

  it('poids 3 dans une famille cochée, sinon rien pour un tiers', () => {
    const list = entries('cleo', [{ id: 'x', controllerId: 'bob' }], [
      {
        turn: 2,
        articles: [
          { companyIds: ['x'], event: { type: 'takeover', actorId: 'bob', subjectId: 'ada', pct: 0.5 } },
          { companyIds: ['x'], event: { type: 'stakeBuilding', actorId: 'bob', pct: 0.26 } },
          { kind: 'results', companyIds: ['x'], event: { type: 'cartelBusted', leaderIds: ['ada'], amount: 50 } },
        ],
      },
    ]);
    // Rachat (poids 3, contrôle coché) : badge sur la courbe de l'acquéreur.
    const pins = pinsFor(list, { families: ['control'], mineOnly: false }, 'cleo', 73);
    expect(pins.mode).toBe('badges');
    expect(pins.pins.map((p) => [p.entry.event.type, p.player])).toEqual([['takeover', 'bob']]);
    // L'entente (poids 3, scandales décoché) n'a pas de badge ; cochée, elle en a un.
    expect(pinsFor(list, { families: ['control', 'scandals'], mineOnly: false }, 'cleo', 73).pins.map((p) => p.entry.event.type)).toEqual(['cartelBusted', 'takeover']);
  });

  it('ce qui me concerne avec un poids ≥ 2 a un badge, famille cochée ou non', () => {
    const list = entries('ada', [{ id: 'x', controllerId: 'ada' }], [
      {
        turn: 2,
        articles: [
          { companyIds: ['x'], event: { type: 'whistleblow' } },
          { kind: 'results', companyIds: ['x'], event: { type: 'bigProfit', leaderId: 'ada', amount: 100 } },
        ],
      },
    ]);
    // Alerte sur mon entreprise (poids 2, me concerne) : badge même si la famille est décochée.
    const pins = pinsFor(list, { families: [], mineOnly: false }, 'ada', 73);
    expect(pins.pins.map((p) => [p.entry.event.type, p.player, p.quarter])).toEqual([['whistleblow', 'ada', 2]]);
    // Mon meilleur bénéfice (poids 1) n'a un badge qu'avec « Seulement ce qui me concerne ».
    expect(pinsFor(list, { families: ['money'], mineOnly: false }, 'ada', 73).pins.map((p) => p.entry.event.type)).toEqual(['whistleblow']);
    expect(pinsFor(list, { families: [], mineOnly: true }, 'ada', 73).pins.map((p) => p.entry.event.type)).toEqual(['bigProfit', 'whistleblow']);
  });

  it('un événement purement PNJ reste dans la frise, même au poids 3', () => {
    const list = entries('ada', [{ id: 'x', controllerId: null }], [
      { turn: 3, articles: [{ kind: 'results', companyIds: ['x'], event: { type: 'bankruptcy' } }] },
    ]);
    expect(pinsFor(list, ALL, 'ada', 73).pins).toEqual([]);
  });

  it('un badge par courbe et par trimestre : le plus récent gagne, les autres comptés', () => {
    const list = entries('cleo', [{ id: 'x', controllerId: 'bob' }, { id: 'y', controllerId: 'bob' }, { id: 'z', controllerId: 'bob' }], [
      {
        turn: 2,
        articles: [
          { companyIds: ['x'], event: { type: 'takeover', actorId: 'bob', subjectId: 'ada', pct: 0.5 } },
          { companyIds: ['y'], event: { type: 'startup', actorId: 'bob' } },
          { companyIds: ['z', 'y'], event: { type: 'merger', actorId: 'bob' } },
        ],
      },
    ]);
    const { pins } = pinsFor(list, ALL, 'cleo', 73);
    expect(pins.length).toBe(1);
    expect(pins[0].player).toBe('bob');
    expect(pins[0].entry.event.type).toBe('merger');
    expect(pins[0].overflow.map((e) => e.event.type)).toEqual(['startup', 'takeover']);
  });

  it('ce qui me concerne passe devant le poids pour le badge d’une courbe', () => {
    const list = entries('ada', [{ id: 'x', controllerId: 'ada' }], [
      {
        turn: 2,
        articles: [
          { companyIds: ['x'], event: { type: 'startup', actorId: 'ada' } },
          { companyIds: ['x'], event: { type: 'stakeBuilding', actorId: 'ada', pct: 0.4 } },
        ],
      },
    ]);
    // Les deux sont à moi, sur ma courbe : le poids 3 (création) gagne sur le poids 2.
    const { pins } = pinsFor(list, ALL, 'ada', 73);
    expect(pins.length).toBe(1);
    expect(pins[0].entry.event.type).toBe('startup');
    expect(pins[0].overflow.map((e) => e.event.type)).toEqual(['stakeBuilding']);
  });

  it('K badges par colonne selon sa largeur ; l’excédent reste dans la frise', () => {
    const companies = ['x', 'y', 'z', 'w'].map((id) => ({ id, controllerId: null }));
    const list = entries('cleo', companies, [
      {
        turn: 2,
        articles: [
          { companyIds: ['x'], event: { type: 'takeover', actorId: 'bob', subjectId: 'ada', pct: 0.5 } },
          { companyIds: ['y'], event: { type: 'startup', actorId: 'ada' } },
          { companyIds: ['z'], event: { type: 'autopilot', subjectId: 'erin' } },
          { companyIds: ['w'], event: { type: 'blockSale', actorId: 'dave', subjectId: 'fay', pct: 0.2, amount: 5 } },
        ],
      },
    ]);
    // Quatre courbes (bob, ada, erin, dave), un badge chacune : 3 à 73 px, 2 à 49 px, 1 à 26 px.
    expect(pinsFor(list, ALL, 'cleo', 73).pins.length).toBe(3);
    expect(pinsFor(list, ALL, 'cleo', 49).pins.length).toBe(2);
    expect(pinsFor(list, ALL, 'cleo', 26).pins.length).toBe(1);
    expect(pinCap(60)).toBe(3);
    expect(pinCap(38)).toBe(2);
    expect(pinCap(37)).toBe(1);
    // Sous 26 px, un seul point par colonne.
    const dots = pinsFor(list, ALL, 'cleo', 18);
    expect(dots.mode).toBe('dots');
    expect(dots.pins.length).toBe(1);
  });

  it('à colonne étroite, ce qui me concerne passe devant le poids', () => {
    const list = entries('ada', [{ id: 'x', controllerId: 'ada' }, { id: 'y', controllerId: 'bob' }], [
      {
        turn: 2,
        articles: [
          { companyIds: ['y'], event: { type: 'takeover', actorId: 'bob', subjectId: 'cleo', pct: 0.5 } },
          { companyIds: ['x'], event: { type: 'stakeBuilding', actorId: 'bob', pct: 0.26 } },
        ],
      },
    ]);
    const { pins } = pinsFor(list, ALL, 'ada', 30);
    expect(pins.length).toBe(1);
    expect(pins[0].entry.event.type).toBe('stakeBuilding'); // mienne (poids 2) devant le rachat (poids 3)
    expect(pins[0].player).toBe('ada');
  });
});

describe('fanOut : les badges qui se chevauchent s’écartent', () => {
  it('rien ne bouge à 18 px ou plus', () => {
    expect(fanOut([])).toEqual([]);
    expect(fanOut([42])).toEqual([0]);
    expect(fanOut([0, 18, 40])).toEqual([0, 0, 0]);
  });

  it('deux badges à moins de 18 px s’écartent de ±11', () => {
    expect(fanOut([100, 100])).toEqual([-11, 11]);
    expect(fanOut([100, 117])).toEqual([-11, 11]);
  });

  it('trois badges proches prennent −20 / 0 / +20', () => {
    expect(fanOut([0, 10, 17])).toEqual([-20, 0, 20]);
  });

  it('les groupes sont indépendants et les décalages suivent l’ordre fourni', () => {
    expect(fanOut([0, 10, 40])).toEqual([-11, 11, 0]);
    expect(fanOut([10, 5])).toEqual([11, -11]);
  });
});
