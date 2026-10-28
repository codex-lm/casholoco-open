/**
 * Évaluation des optimizer-* sur les graines de TOURNOI (défaut 1-20), sièges tournés, 3 bots.
 *   tsx strategies/optimizer-eval.ts [nbGraines=20] [premièreGraine=1] [parties=solo,ladder,mirror]
 *
 *   solo   : chaque optimizer seul face à passive + 3 bots (même tablée que l'autotest du banc) ;
 *   ladder : ops, clean, full et passive à la même table + 3 bots (l'expérience se voit-elle ?) ;
 *   mirror : full contre full + passive + 3 bots (deux joueurs de même niveau : qu'est-ce qui les départage ?).
 */
import { runTournament, formatReport, passive, runGame, type TournamentResult } from '../harness';
import { OPTIMIZERS, optimizerOps, optimizerClean, optimizerFull, makeOptimizer, PRESETS } from './optimizer';

const n = Number(process.argv[2] ?? 20);
const first = Number(process.argv[3] ?? 1);
const parts = (process.argv[4] ?? 'solo,ladder,mirror').split(',');
const seeds = Array.from({ length: n }, (_, i) => first + i);
const M = (k: number) => (k / 1000).toFixed(1);

function details(res: TournamentResult) {
  for (const s of res.summary) {
    if (!s.name.startsWith('optimizer')) continue;
    const bs = Object.entries(s.medianNWBySector).map(([k, v]) => `${k} ${M(v)}`).join(', ');
    console.log(`\n${s.name} : NW médiane par secteur de départ (M) : ${bs}`);
    const h = res.headToHead[s.name];
    const vs = Object.entries(h).filter(([k]) => k.startsWith('bot:')).map(([k, c]) => `${k} ${(c.rate * 100).toFixed(0)}%`).join(', ');
    console.log(`  devant les bots : ${vs}`);
    const ms = s.meanStats;
    console.log(`  stats moy. : OPA+ ${ms.takeoversWon.toFixed(2)} OPA- ${ms.takeoversSuffered.toFixed(2)} scandales ${ms.scandals.toFixed(2)} discutables ${ms.shadyActions.toFixed(1)} appels de marge ${ms.marginCalls.toFixed(2)} productions réduites ${ms.productionCuts.toFixed(2)} contrôle fin ${ms.controlledAtEnd.toFixed(2)} refus ${ms.actionsRefused.toFixed(1)}/${(ms.actionsOk + ms.actionsRefused).toFixed(0)}`);
  }
}

if (parts.includes('solo')) {
  const t0 = Date.now();
  const res = runTournament({ seeds, lineups: OPTIMIZERS.map((s) => [s, passive]), bots: 3 });
  console.log(`== SOLO : ${res.games.length} parties en ${((Date.now() - t0) / 1000).toFixed(0)} s (graines ${first}-${first + n - 1}), chaque optimizer + passive + 3 bots\n`);
  console.log(formatReport(res));
  details(res);
}
if (parts.includes('ladder')) {
  const t0 = Date.now();
  const res = runTournament({ seeds, lineups: [[optimizerOps, optimizerClean, optimizerFull, passive]], bots: 3 });
  console.log(`\n== LADDER : ${res.games.length} parties en ${((Date.now() - t0) / 1000).toFixed(0)} s, ops + clean + full + passive + 3 bots\n`);
  console.log(formatReport(res));
}
if (parts.includes('mirror')) {
  const t0 = Date.now();
  const twin = makeOptimizer('optimizer-full-B', PRESETS['optimizer-full']);
  const res = runTournament({ seeds, lineups: [[optimizerFull, twin, passive]], bots: 3 });
  console.log(`\n== MIROIR : ${res.games.length} parties en ${((Date.now() - t0) / 1000).toFixed(0)} s, full + full(B) + passive + 3 bots\n`);
  console.log(formatReport(res));
  // Qu'est-ce qui départage deux joueurs identiques ? le secteur de départ
  const wins: Record<string, [number, number]> = {};
  for (const g of res.games) {
    const a = g.ranking.filter((r) => r.strategy.startsWith('optimizer-full'));
    const win = a[0];
    for (const r of a) {
      const w = (wins[r.sector] ??= [0, 0]);
      w[1]++;
      if (r === win) w[0]++;
    }
  }
  console.log('  part des duels gagnés selon le secteur de départ : ' + Object.entries(wins).map(([k, [w, t]]) => `${k} ${((100 * w) / t).toFixed(0)}% (n=${t})`).join(', '));
  const ratios = res.games.map((g) => {
    const a = g.ranking.filter((r) => r.strategy.startsWith('optimizer-full'));
    return a[0].netWorth / Math.max(a[1].netWorth, 1);
  }).sort((x, y) => x - y);
  console.log(`  écart gagnant/perdant entre jumeaux : médiane ×${ratios[Math.floor(ratios.length / 2)].toFixed(2)}, max ×${ratios[ratios.length - 1].toFixed(2)}`);
}

const a = runGame({ seed: first, players: [{ strategy: optimizerFull }, { strategy: passive }], bots: 3, botOffset: first, log: false });
const b = runGame({ seed: first, players: [{ strategy: optimizerFull }, { strategy: passive }], bots: 3, botOffset: first, log: false });
console.log(`\ndéterminisme (rejeu graine ${first}) : ${a.ranking.map((p) => p.netWorth.toFixed(4)).join() === b.ranking.map((p) => p.netWorth.toFixed(4)).join() ? 'OK' : 'ÉCHEC'}`);
