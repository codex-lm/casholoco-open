/**
 * Recherche de politique pour les optimizer-* sur des graines d'ENTRAÎNEMENT (10001+), disjointes du tournoi (1-20).
 *
 *   tsx strategies/optimizer-search.ts ablation [nbGraines=10]     # retire un levier à la fois de optimizer-full
 *   tsx strategies/optimizer-search.ts random  [nbGraines=10] [nbEssais=30] [base=optimizer-full] [graineRng=1]
 *                                                                   # recherche aléatoire locale (hill climbing)
 *   tsx strategies/optimizer-search.ts grid    [nbGraines=10]     # grilles 1D sur les paramètres d'exploitation
 *
 * Tablée : candidat + passive + 3 bots, sièges tournés (2 parties par graine), bots = personnalités (graine % 6).
 * Score : moyenne de ln(valeur nette du candidat) (robuste aux parties extrêmes) ; on affiche aussi médiane et victoires.
 */
import * as fs from 'node:fs';
import { runTournament, passive, makeRng, quantile, mean } from '../harness';
import { makeOptimizer, BASE_PARAMS, PRESETS, type OptParams } from './optimizer';
// lot 2 : adversaire d'entraînement (défaut : passive ; OPP=optimizer-clean, etc. pour tester les leviers d'interaction)
const OPP = process.env.OPP ? makeOptimizer(process.env.OPP, PRESETS[process.env.OPP]) : passive;

const mode = process.argv[2] ?? 'ablation';
const nSeeds = Number(process.argv[3] ?? 10);
const firstSeed = Number(process.env.FIRST_SEED ?? 10001);
const SEEDS = Array.from({ length: nSeeds }, (_, i) => firstSeed + i);

interface Score {
  label: string;
  logNW: number;
  medNW: number;
  win: number;
  vsBest: number; // NW / meilleur adversaire (médiane)
  ms: number;
}

function evaluate(label: string, params: Partial<OptParams>): Score {
  const t0 = Date.now();
  const s = makeOptimizer('cand', params);
  const res = runTournament({ seeds: SEEDS, lineups: [[s, OPP]], bots: 3 });
  const nws: number[] = [];
  const ratios: number[] = [];
  let wins = 0;
  for (const g of res.games) {
    const me = g.ranking.find((r) => r.strategy === 'cand')!;
    nws.push(me.netWorth);
    if (me.rank === 1) wins++;
    const other = Math.max(...g.ranking.filter((r) => r !== me).map((r) => r.netWorth));
    ratios.push(me.netWorth / Math.max(other, 1));
  }
  return {
    label,
    logNW: mean(nws.map((x) => Math.log(Math.max(x, 100)))),
    medNW: quantile(nws, 0.5),
    win: wins / res.games.length,
    vsBest: quantile(ratios, 0.5),
    ms: Date.now() - t0,
  };
}

const fmt = (s: Score) =>
  `${s.label.padEnd(34)} lnNW ${s.logNW.toFixed(3)}  médiane ${(s.medNW / 1000).toFixed(1).padStart(6)} M  ×meilleur adv. ${s.vsBest.toFixed(2).padStart(6)}  victoires ${(s.win * 100).toFixed(0).padStart(3)} %  (${(s.ms / 1000).toFixed(0)} s)`;

if (mode === 'ablation') {
  const full = PRESETS['optimizer-full'];
  const runs: [string, Partial<OptParams>][] = [
    ['full', full],
    ['ops seul (aucun levier)', PRESETS['optimizer-ops']],
    ['ops sans lancements', { launchHurdle: 1e9 }],
    ['ops myope (gMult=0 : pas d investissement)', { gMult: 0 }],
    ['clean (sans actions discutables)', PRESETS['optimizer-clean']],
    ['full − com. de crise (réputation)', { ...full, repTarget: 0 }],
    ['full − optimisation fiscale', { ...full, taxOpt: false }],
    ['full − greenwashing', { ...full, greenwash: false }],
    ['full − délocalisation', { ...full, offshore: false }],
    ['full − espionnage', { ...full, espionage: false }],
    ['full − lobbying', { ...full, lobbying: false }],
    ['full − levier perso (ownTarget 0)', { ...full, ownTarget: 0, ltv: 0 }],
    ['full − rachats d actions', { ...full, buyback: false }],
    ['full − levier et rachats', { ...full, ownTarget: 0, ltv: 0, buyback: false }],
    ['full − sélection de titres', { ...full, pick: false }],
    ['full − dénigrement final', { ...full, smearEnd: 0 }],
    ['full − matières', { ...full, commodities: false }],
    ['full + bonus 100 % (stop T−4)', { ...full, bonusFrac: 1, bonusStop: 4 }],
    ['full + OPA PNJ (raider)', PRESETS['optimizer-raider']],
    ['full + 1 start-up', PRESETS['optimizer-startup']],
  ];
  for (const [label, p] of runs) console.log(fmt(evaluate(label, p)));
} else if (mode === 'grid') {
  const base = PRESETS['optimizer-ops'];
  const grids: [keyof OptParams, number[]][] = [
    ['gMult', [0, 0.5, 1, 1.5, 2.5, 4]],
    ['capHurdle', [0, 0.25, 0.5, 1, 2]],
    ['capMult', [0.5, 1, 1.5, 2]],
    ['launchHurdle', [0, 1, 3, 1e9]],
    ['debtMax', [0, 0.3, 0.6, 1]],
    ['sigmaExtra', [0, 0.1, 0.2]],
  ];
  for (const [k, vals] of grids) {
    for (const v of vals) console.log(fmt(evaluate(`ops ${k}=${v}`, { ...base, [k]: v })));
    console.log('');
  }
} else if (mode === 'random') {
  const trials = Number(process.argv[4] ?? 30);
  const baseName = process.argv[5] ?? 'optimizer-full';
  const rng = makeRng(Number(process.argv[6] ?? 1));
  let best: Partial<OptParams> = { ...BASE_PARAMS, ...(PRESETS[baseName] ?? JSON.parse(baseName.startsWith('@') ? fs.readFileSync(baseName.slice(1), 'utf8') : baseName)) };
  let bestScore = evaluate(`${baseName.slice(0, 30)} (départ)`, best);
  console.log(fmt(bestScore));
  const num: [keyof OptParams, number, number][] = [
    ['gMult', 0, 4],
    ['capMult', 0.3, 2.5],
    ['capHurdle', 0, 2],
    ['launchHurdle', 0, 4],
    ['launchMaxTurnFromEnd', 1, 10],
    ['sigmaExtra', 0, 0.3],
    ['effPersist', 0, 1],
    ['loanUse', 0.2, 1],
    ['debtMax', 0, 1.2],
    ['ownTarget', 0.51, 0.95],
    ['ltv', 0, 0.5],
    ['pickHurdle', 0.05, 0.8],
    ['pickShrink', 0.1, 1],
    ['smearEnd', 0, 3],
    ['repTarget', 0, 1.0], // lot 2 : la com' de crise ne remonte la réputation que jusqu'à 1
    ['whistle', 0, 2], // lot 2 : lanceur d'alerte (0, 1, 2)
    ['whistleRatio', 0.5, 2],
    ['repMinCash', 0, 60000],
    ['buybackShrink', 0.1, 1.5],
    // lot 1 : budget de jauge (risque non nul dès 10, une com' de crise par tour) et délit d'initié
    ['scandalMax', 0, 60],
    ['scandalMaxEnd', 0, 40],
    ['insiderMax', 0, 60],
    ['ownPerTurn', 0.02, 0.3],
    ['profitFloor', -4000, 2000],
  ];
  const bools: (keyof OptParams)[] = ['taxOpt', 'greenwash', 'offshore', 'espionage', 'lobbying', 'pick', 'commodities', 'buyback', 'ctrlFirst', 'raid', 'raidPlayers', 'merge'];
  for (let i = 0; i < trials; i++) {
    const cand: any = { ...best };
    const nMut = 1 + Math.floor(rng() * 3);
    const changes: string[] = [];
    for (let k = 0; k < nMut; k++) {
      if (rng() < 0.75) {
        const [key, lo, hi] = num[Math.floor(rng() * num.length)];
        const cur = cand[key] as number;
        const v = clamp(cur + (rng() - 0.5) * (hi - lo) * 0.5, lo, hi);
        cand[key] = key === 'smearEnd' || key === 'launchMaxTurnFromEnd' || key === 'whistle' ? Math.round(v) : +v.toFixed(3);
        changes.push(`${key}=${cand[key]}`);
      } else {
        const key = bools[Math.floor(rng() * bools.length)];
        cand[key] = !cand[key];
        changes.push(`${key}=${cand[key]}`);
      }
    }
    const sc = evaluate(`#${i} ${changes.join(' ')}`, cand);
    const better = sc.logNW > bestScore.logNW + 0.005;
    console.log(fmt(sc) + (better ? '  <== meilleur' : ''));
    if (better) {
      best = cand;
      bestScore = sc;
    }
  }
  const diff = Object.fromEntries(Object.entries(best).filter(([k, v]) => (BASE_PARAMS as any)[k] !== v));
  console.log('\nmeilleurs paramètres (écarts à BASE_PARAMS) :', JSON.stringify(diff));
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(diff));
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
