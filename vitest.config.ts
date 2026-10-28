import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
    // Les campagnes déterministes sont CPU-intensives ; 32 workers sur les machines à beaucoup
    // de cœurs saturent les tests statistiques et leurs délais sans changer leurs assertions.
    maxWorkers: 4,
    // Les tests statistiques du moteur (ex. engine.rumors) simulent des dizaines de parties complètes :
    // sous la charge de la suite complète, ils dépassent les 5 s par défaut sans être pour autant en échec.
    testTimeout: 15000,
  },
});
