/**
 * Vigilante (lot 2) : optimizer-clean, plus le lanceur d'alerte à chaque tour (dès T2), joué en début de tour, contre
 * la plus grosse entreprise du joueur non bot le plus riche après soi. Emprunte les 500 k s'il le faut.
 * Ne lit que la vue.
 */
import type { Strategy } from '../harness';
import { optimizerClean } from './optimizer';

export const vigilante: Strategy = {
  name: 'vigilante',
  tier: 'expert',
  pickSector: optimizerClean.pickSector,
  act(view, api, ctx) {
    if (view.turn >= 2) {
      const me = view.players.find((p) => p.id === view.you)!;
      const rivals = view.players.filter((p) => p.id !== view.you && !p.isBot).sort((a, b) => b.netWorth - a.netWorth);
      for (const r of rivals) {
        const cs = view.companies.filter((c) => c.status === 'active' && c.controllerId === r.id).sort((a, b) => b.marketCap - a.marketCap);
        if (cs.length === 0) continue;
        if (me.cash < 520 && view.personalLoanLimit >= 600) api.act({ type: 'takePersonalLoan', amount: 600 });
        api.act({ type: 'whistleblow', companyId: cs[0].id });
        break;
      }
    }
    optimizerClean.act(api.view(), api, ctx);
  },
};
