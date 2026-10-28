import { describe, expect, it } from 'vitest';
import { getPlayerView, resolveTurn } from '../src/engine';
import { bots, companyOf, human, newGame } from './helpers';

describe('vue joueur redigée', () => {
  const s = newGame(5, [human('a', 'energy_drinks', 'Alice'), human('b', 'gadgets', 'Bob'), ...bots(3)]);
  resolveTurn(s);
  const mine = companyOf(s, 'a');
  mine.scandal = 42;
  companyOf(s, 'b').scandal = 77;
  const view = getPlayerView(s, 'a');
  const json = JSON.stringify(view);

  it('ne contient ni graine, ni état du RNG, ni news programmées', () => {
    expect(json).not.toContain('rngState');
    expect(json).not.toContain('scheduledNews');
    expect(json).not.toContain('recentNewsIds');
    expect(view.config.seed).toBe(0);
    for (const card of s.scheduledNews) expect(json).not.toContain(`"${card.cardId}"`);
  });

  it('jauge de scandale exacte seulement pour ses propres entreprises', () => {
    const scandalKeys = json.match(/"scandal":/g) ?? [];
    const own = view.companies.filter((c) => c.private);
    expect(scandalKeys.length).toBe(own.length);
    expect(own.every((c) => c.controllerId === 'a')).toBe(true);
    const bob = view.companies.find((c) => c.id === companyOf(s, 'b').id)!;
    expect(bob.private).toBeUndefined();
    expect(bob.scandalLevel).toBe('élevé');
    expect(view.companies.find((c) => c.id === mine.id)!.scandalLevel).toBe('moyen');
    expect(view.companies.find((c) => c.id === mine.id)!.private!.scandal).toBe(42);
  });

  it('lignes produit des rapports (production, coût unitaire) seulement pour ses entreprises', () => {
    for (const c of view.companies) {
      expect(c.reports.length).toBeGreaterThan(0);
      if (c.controllerId === 'a' && c.status === 'active') expect(c.reports.at(-1)!.products.length).toBeGreaterThan(0);
      else expect(c.reports.every((r) => r.products.length === 0)).toBe(true);
    }
    // Le compte de résultat de l'entreprise reste public.
    const bob = view.companies.find((c) => c.id === companyOf(s, 'b').id)!;
    expect(bob.reports.at(-1)!.revenue).toBe(companyOf(s, 'b').reports.at(-1)!.revenue);
  });

  it('décisions privées (stock, production, budgets) seulement pour ses produits', () => {
    for (const c of view.companies) {
      for (const p of c.products) {
        if (c.controllerId === 'a' && c.status === 'active') expect(p.private).toBeDefined();
        else expect(p.private).toBeUndefined();
        expect(p).not.toHaveProperty('marketing');
        expect(p).not.toHaveProperty('stock');
      }
      if (c.controllerId !== 'a') {
        expect(c.private).toBeUndefined();
        expect(c).not.toHaveProperty('modifiers');
        expect(c).not.toHaveProperty('inventory');
      }
    }
    const own = view.companies.find((c) => c.id === mine.id)!;
    expect(own.private!.loanLimit).toBeGreaterThanOrEqual(0);
    expect(own.private!.maxBonus).toBeGreaterThan(0);
    expect(own.products[0].private!.estimatedUnitCost).toBeGreaterThan(0);
  });

  it('vue publique complète : joueurs, parts de marché avec « Autres concurrents », taux', () => {
    expect(view.you).toBe('a');
    expect(view.players).toHaveLength(5);
    const alice = view.players.find((p) => p.id === 'a')!;
    expect(alice.controlledCompanyIds).toContain(mine.id);
    expect(alice.netWorth).toBeCloseTo(alice.cash + alice.portfolioValue - alice.debt, 6);
    expect(view.personalLoanLimit).toBeGreaterThan(0);
    for (const sec of view.sectors) {
      const others = sec.shares[sec.shares.length - 1];
      expect(others.productId).toBe('others');
      expect(others.name).toBe('Autres concurrents');
      const total = sec.shares.reduce((a, x) => a + x.share, 0);
      expect(total).toBeCloseTo(1, 6);
    }
    expect(view.interestRate).toBeGreaterThanOrEqual(0);
    expect(view.taxRate).toBeGreaterThanOrEqual(0);
    expect(view.dateLabel).toBe('T2 2027');
    expect(view.journal).toHaveLength(2);
  });

  it('la vue est une copie : la modifier ne touche pas l’état', () => {
    const v = getPlayerView(s, 'a');
    v.companies[0].holdings.hacker = 1e9;
    v.journal[0].articles.length = 0;
    v.players[0].netWorthHistory.push(1e9);
    expect(s.companies[v.companies[0].id].holdings.hacker).toBeUndefined();
    expect(s.journal[0].articles.length).toBeGreaterThan(0);
    expect(s.players[v.players[0].id].netWorthHistory).toHaveLength(1);
  });

  it('un spectateur inconnu ne voit rien de privé', () => {
    const v = getPlayerView(s, 'inconnu');
    expect(v.companies.every((c) => !c.private)).toBe(true);
    expect(v.personalLoanLimit).toBe(0);
  });

  it('botPersonalityId publié pour les bots, y compris repris, jamais pour les humains', () => {
    const v = getPlayerView(s, 'a');
    for (const row of v.players) {
      if (row.isBot) expect(typeof row.botPersonalityId, row.id).toBe('string');
      else expect(row, row.id).not.toHaveProperty('botPersonalityId');
    }
    const botRow = v.players.find((p) => p.isBot)!;
    expect(Object.keys(botRow).sort()).toEqual(
      [
        'botLevel',
        'botPersonalityId',
        'cash',
        'color',
        'connected',
        'controlledCompanyIds',
        'debt',
        'id',
        'isBot',
        'name',
        'netWorth',
        'netWorthHistory',
        'portfolioValue',
        'ready',
        'stats',
      ].sort(),
    );
    // Un bot repris par un humain garde sa personnalité publique (§11).
    s.players.bot1.botTakeover = { previousName: 'Ancien Nom', activeFromTurn: 2 };
    const after = getPlayerView(s, 'a');
    const repris = after.players.find((p) => p.id === 'bot1')!;
    expect(typeof repris.botPersonalityId).toBe('string');
    expect(repris.botPersonalityId).toBe(botRow.botPersonalityId);
  });
});
