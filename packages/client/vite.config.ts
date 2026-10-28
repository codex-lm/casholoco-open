import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The standalone edition resolves every asset relative to its LOB7 release.
// One bundle also removes lazy import() calls unsupported by the hosted recipe.
const peerEdition = process.env.VITE_EDITION === 'peer';

export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_EDITION': JSON.stringify(peerEdition ? 'peer' : 'solo') },
  plugins: [react(), {
    name: 'casholoco-edition-title',
    transformIndexHtml(html) {
      if (!peerEdition) return html;
      return html
        .replace('<title>Casholoco Solo</title>', '<title>Casholoco Direct — expérimental</title>')
        .replace(/(<meta name="description" content=")[^"]*(")/, '$1Casholoco Direct : partie expérimentale entre navigateurs, sans serveur de jeu. Codes de connexion manuels, réseau local conseillé. French and English.$2')
        .replace(/(<meta property="og:site_name" content=")[^"]*(")/, '$1Casholoco Direct$2')
        .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1Casholoco Direct — multijoueur expérimental$2')
        .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1Play directly with friends using manual connection codes. The host keeps the game tab open. No game server, signalling service, STUN or TURN.$2');
    },
  }],
  server: {
    port: 5173,
  },
  build: {
    outDir: peerEdition ? 'dist-peer' : 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
});
