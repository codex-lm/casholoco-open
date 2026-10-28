import { runGame, passive } from '../harness';
import { ARCHETYPES, speculatorNaive } from './archetypes';
for (const s of [...ARCHETYPES, speculatorNaive]) {
  const t0 = Date.now();
  const g = runGame({ seed: 3, players: [{ strategy: s }, { strategy: passive }], bots: 3, strict: true });
  const r = g.ranking.map(p => `${p.strategy}:${(p.netWorth/1000).toFixed(1)}`).join(' ');
  const ko = g.log.filter(l => l.includes('KO')).slice(0, 4);
  console.log(s.name, Date.now()-t0, 'ms |', r); if (ko.length) console.log('  ', ko.join('\n   '));
}
