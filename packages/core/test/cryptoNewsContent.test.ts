import { describe, expect, it } from 'vitest';
import { getContent } from '../src/content';

const EUPHORIA_IDS = ['crypto_bubble_fomo', 'crypto_bubble_grandmas', 'crypto_bubble_metaverse'];
const CRASH_IDS = ['crypto_crash_founders', 'crypto_crash_exchange', 'crypto_crash_regulator'];

describe('crypto bubble news content', () => {
  it('keeps the six bilingual forced cards outside the ordinary draw with sector-wide effects', () => {
    for (const lang of ['fr', 'en'] as const) {
      const content = getContent(lang);
      for (const id of [...EUPHORIA_IDS, ...CRASH_IDS]) {
        const card = content.newsCards.find((c) => c.id === id)!;
        expect(card, `${lang}:${id}`).toBeDefined();
        expect(card.category).toBe('sector');
        expect(card.weight).toBe(0);
        expect(card.headline.length).toBeGreaterThan(20);
        expect(card.body.length).toBeGreaterThan(20);
        expect(card.rumor!.length).toBeGreaterThan(20);
        const crash = CRASH_IDS.includes(id);
        expect(card.effects).toEqual([
          { type: 'sectorDemand', sectorId: 'crypto', multiplier: crash ? 0.35 : 1.1, duration: crash ? 2 : 1 },
          { type: 'companySentiment', target: { sectorId: 'crypto' }, multiplier: crash ? 0.7 : 1.1 },
        ]);
      }
    }
  });

  it('provides bilingual false crash rumors distinct from real warnings', () => {
    for (const lang of ['fr', 'en'] as const) {
      const content = getContent(lang);
      const trueRumors = new Set(content.newsCards.flatMap((c) => c.rumor ? [c.rumor] : []));
      for (const id of CRASH_IDS.map((id) => `fake_${id}`)) {
        const rumor = content.fakeRumors.find((r) => r.id === id)!;
        expect(rumor, `${lang}:${id}`).toBeDefined();
        expect(rumor.text.length).toBeGreaterThan(20);
        expect(trueRumors.has(rumor.text)).toBe(false);
      }
    }
  });
});
