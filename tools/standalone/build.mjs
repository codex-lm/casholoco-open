import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const edition = process.argv[2] ?? 'solo';
if (edition !== 'solo' && edition !== 'peer') throw new Error('Edition must be solo or peer');
const client = path.join(root, 'packages/client');
const require = createRequire(path.join(client, 'package.json'));
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const result = spawnSync(process.execPath, [vite, 'build'], {
  cwd: client, env: { ...process.env, VITE_EDITION: edition }, stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const output = path.join(client, edition === 'peer' ? 'dist-peer' : 'dist');
async function scripts(directory) {
  const contents = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) contents.push(...await scripts(filename));
    else if (/\.m?js$/.test(item.name)) contents.push(await readFile(filename, 'utf8'));
  }
  return contents;
}
const javascript = (await scripts(output)).join('\n');
const hasPeer = /\bRTCPeerConnection\b|CASHOLOCO-PEER-1|casholoco-peer\/1/.test(javascript);
if (edition === 'solo' && hasPeer) throw new Error('Solo isolation check failed: peer networking remains in its bundle');
if (edition === 'peer' && !hasPeer) throw new Error('Peer build is missing its direct transport');
console.log(JSON.stringify({ edition, output, peerTransportIncluded: hasPeer }));
