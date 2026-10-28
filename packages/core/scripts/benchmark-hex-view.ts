/** Mid-game, eight-player hex view benchmark: npx tsx packages/core/scripts/benchmark-hex-view.ts */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { getContent, PLAYER_COLORS } from '../src/content';
import { createGame, getPlayerView, resolveTurn } from '../src/engine';
import type { LobbyPlayer } from '../src/types';

const personalities = getContent('fr').bots;
const players: LobbyPlayer[] = Array.from({ length: 8 }, (_, i) => {
  const bot = personalities[i % personalities.length];
  return {
    id: `bot${i + 1}`, name: `${bot.ceoName} ${i + 1}`, companyName: `${bot.companyName} ${i + 1}`,
    isBot: true, botPersonalityId: bot.id, sectorId: bot.preferredSectors[0],
    connected: true, color: PLAYER_COLORS[i],
  };
});
assert.equal(players.length, 8);
const state = createGame({ seed: 42, totalTurns: 16, turnSeconds: 90, startYear: 2027, mapMode: 'hex' }, players);
while (state.turn < 8 && state.phase === 'playing') resolveTurn(state);
assert.equal(state.turn, 8);
const snapshot = JSON.stringify(state);
for (let i = 0; i < 10; i++) for (const player of players) getPlayerView(state, player.id);
const times: number[] = [];
for (let i = 0; i < 40; i++) for (const player of players) {
  const start = performance.now();
  getPlayerView(state, player.id);
  times.push(performance.now() - start);
}
assert.equal(JSON.stringify(state), snapshot, 'view generation must not mutate the game');
times.sort((a, b) => a - b);
const view = getPlayerView(state, players[0].id);
console.log(JSON.stringify({
  seed: 42, turn: state.turn, players: players.length, views: times.length,
  activeProducts: Object.values(state.companies).filter((c) => c.status === 'active').reduce((n, c) => n + c.products.length, 0),
  freeCells: view.hexes!.free.length,
  launchCells: Object.keys(view.sectors[0].launchByHex!).length,
  stateSha256: createHash('sha256').update(snapshot).digest('hex'),
  meanMs: times.reduce((a, b) => a + b, 0) / times.length,
  medianMs: times[Math.floor(times.length / 2)],
  p95Ms: times[Math.floor(times.length * 0.95)],
  maxMs: times.at(-1),
}, null, 2));
