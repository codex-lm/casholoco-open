import { cp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const edition = process.argv[2] ?? 'solo';
if (edition !== 'solo' && edition !== 'peer') throw new Error('Edition must be solo or peer');
const directory = edition === 'peer' ? 'dist-peer' : 'dist';
const manifestName = edition === 'peer' ? 'LOB7-GAME.peer.json' : 'LOB7-GAME.json';
const client = path.join(root, 'packages/client', directory);
const target = path.join(root, directory);
const metadata = ['LICENSE', 'ASSETS-LICENSE.md', 'THIRD_PARTY_NOTICES.md'];

// Never export a source checkout or replace an arbitrary directory.
if (path.dirname(target) !== root || !['dist', 'dist-peer'].includes(path.basename(target))) throw new Error('Invalid export directory');
await readFile(path.join(client, 'index.html'));
for (const file of metadata) await readFile(path.join(root, file));
const manifest = JSON.parse(await readFile(path.join(root, manifestName), 'utf8'));
if (manifest.entrypoint !== 'index.html') throw new Error('The standalone export entrypoint must be index.html');

try {
  if (await realpath(target) !== target) throw new Error('Export directory may not be a symbolic link');
  await rm(target, { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(target);
await cp(client, target, { recursive: true });
for (const file of metadata) await cp(path.join(root, file), path.join(target, file));
await cp(path.join(root, manifestName), path.join(target, 'LOB7-GAME.json'));
for (const file of ['LOB7-ATTRIBUTION.json']) {
  try {
    const attribution = JSON.parse(await readFile(path.join(root, file), 'utf8'));
    if (edition === 'peer') {
      const contribution = attribution.contributions.find(item => item.kind === 'agent');
      if (contribution) contribution.summary = 'An experimental direct multiplayer edition with browser-hosted simulation and manually exchanged WebRTC connection codes, without signalling, STUN or TURN services.';
    }
    await writeFile(path.join(target, file), JSON.stringify(attribution, null, 2) + '\n');
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
// A LOB7 public ownership challenge is metadata, not an account credential.
const ownership = path.join(root, '.lob7/ownership');
try {
  for (const entry of await readdir(ownership, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[A-Za-z0-9_-]{3,100}\.txt$/.test(entry.name)) throw new Error('Unexpected ownership metadata');
    const value = await readFile(path.join(ownership, entry.name));
    if (value.byteLength > 16384) throw new Error('Oversized ownership challenge');
    await mkdir(path.join(target, '.lob7/ownership'), { recursive: true });
    await writeFile(path.join(target, '.lob7/ownership', entry.name), value);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const runtimeNote = edition === 'peer'
  ? 'Experimental direct multiplayer. Exchange the offer and answer codes manually using a trusted channel. No game server, signalling service, STUN or TURN is used. The same local network is recommended; Internet connectivity is not guaranteed. The host must keep this tab open. Reloading or closing a tab does not reconnect or migrate the match. / Multijoueur direct expérimental : codes échangés manuellement, réseau local conseillé et onglet de l’hôte maintenu ouvert ; pas de reprise ou migration après rechargement.'
  : 'No backend, account, installation or external service is required to play. / Aucun serveur de jeu, compte ou service externe n’est nécessaire.';
await writeFile(path.join(target, 'README.md'), `# ${manifest.title}\n\nThis branch contains the built browser edition. Editable sources, build instructions and tests are on the repository's source branch.\n\nCette branche contient l’édition compilée pour navigateur. Les sources modifiables, instructions et tests sont sur la branche source du dépôt.\n\n${runtimeNote}\n\nSee LICENSE, ASSETS-LICENSE.md and THIRD_PARTY_NOTICES.md.\n`);

async function inventory(folder, prefix = '') {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink in export: ${relative}`);
    if (entry.isDirectory()) files.push(...await inventory(path.join(folder, entry.name), relative));
    else files.push(relative);
  }
  return files;
}
const files = await inventory(target);
const bytes = (await Promise.all(files.map(file => readFile(path.join(target, file))))).reduce((sum, file) => sum + file.byteLength, 0);
console.log(JSON.stringify({ edition, directory: target, files: files.length, bytes }));
