import { describe, expect, it } from 'vitest';
import { HEXES, getContent, hexById, hexPlaceLabel, hexPlaceName } from '../src/content';
import { HEX_NAMES as FR_HEX_NAMES } from '../src/content/fr/hexNames';
import { HEX_NAMES as EN_HEX_NAMES } from '../src/content/en/hexNames';
import { buildSiteSlots } from '../src/sim/deals';
import type { Lang } from '../src/types';

const LANGS: Lang[] = ['fr', 'en'];
const SEED = 42;
const HEX_NAMES: Record<Lang, Readonly<Record<string, string>>> = { fr: FR_HEX_NAMES, en: EN_HEX_NAMES };

function slots(lang: Lang) {
  return buildSiteSlots(SEED, getContent(lang).siteNames);
}

// Cases représentatives : ville (aussi un terrain de départ, la ville prime), terrain seul, gisement, case ordinaire.
const CITY_HEX = 'A10';
const TERRAIN_HEX = 'D17';
const DEPOSIT_HEX = 'B7';
const PLAIN_HEX = 'G7';

describe('hexPlaceName : couverture', () => {
  it('nomme chaque case du plateau, en français comme en anglais, sans emplacements de filiale', () => {
    for (const lang of LANGS) {
      for (const h of HEXES) {
        const name = hexPlaceName(h.id, lang);
        expect(typeof name, `${lang}:${h.id}`).toBe('string');
        expect(name.length, `${lang}:${h.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('ne retombe jamais sur l’identifiant nu quand la source du nom existe', () => {
    for (const lang of LANGS) {
      const drawn = slots(lang);
      for (const h of HEXES) {
        expect(hexPlaceName(h.id, lang, drawn), `${lang}:${h.id} avec filiales`).not.toBe(h.id);
        // Sans emplacements fournis, seules les cases de gisement peuvent retomber sur l'identifiant.
        if (!h.deposit) expect(hexPlaceName(h.id, lang), `${lang}:${h.id}`).not.toBe(h.id);
      }
    }
  });

  it('donne des noms tous distincts dans une langue, gisements nommés par le tirage des filiales', () => {
    for (const lang of LANGS) {
      const drawn = slots(lang);
      const names = HEXES.map((h) => hexPlaceName(h.id, lang, drawn));
      expect(new Set(names).size, lang).toBe(names.length);
    }
  });
});

describe('hexPlaceName : priorité des sources', () => {
  it('nomme une case de ville par mapNames, même quand un terrain de départ s’y pose', () => {
    const hex = hexById(CITY_HEX);
    expect(hex?.city).toBeDefined();
    expect(getContent('fr').terrains.definitions.some((t) => t.hex === CITY_HEX)).toBe(true);
    for (const lang of LANGS) {
      const expected = getContent(lang).mapNames.cities[hex!.city!];
      expect(hexPlaceName(CITY_HEX, lang), lang).toBe(expected);
      expect(hexPlaceName(CITY_HEX, lang, slots(lang)), lang).toBe(expected);
    }
  });

  it('nomme une case de terrain de départ par la définition du terrain', () => {
    const hex = hexById(TERRAIN_HEX);
    expect(hex?.city).toBeUndefined();
    expect(hex?.deposit).toBeUndefined();
    for (const lang of LANGS) {
      const terrain = getContent(lang).terrains.definitions.find((t) => t.hex === TERRAIN_HEX);
      expect(terrain, lang).toBeDefined();
      expect(hexPlaceName(TERRAIN_HEX, lang), lang).toBe(terrain!.name);
    }
  });

  it('nomme une case de gisement par l’emplacement tiré, sinon par le repli cadastral', () => {
    const hex = hexById(DEPOSIT_HEX);
    expect(hex?.deposit).toBeDefined();
    for (const lang of LANGS) {
      const slot = slots(lang).find((s) => s.id === hex!.deposit);
      expect(slot, lang).toBeDefined();
      expect(hexPlaceName(DEPOSIT_HEX, lang, slots(lang)), lang).toBe(slot!.name);
      // Sans tirage fourni : le nom cadastral s'il existe, l'identifiant sinon.
      expect(hexPlaceName(DEPOSIT_HEX, lang), lang).toBe(HEX_NAMES[lang][DEPOSIT_HEX] ?? DEPOSIT_HEX);
      // Un tirage sans l'emplacement du gisement : même repli.
      expect(hexPlaceName(DEPOSIT_HEX, lang, []), lang).toBe(HEX_NAMES[lang][DEPOSIT_HEX] ?? DEPOSIT_HEX);
    }
  });

  it('nomme une case ordinaire par son entrée HEX_NAMES', () => {
    expect(hexPlaceName(PLAIN_HEX, 'fr')).toBe('Moulin-Rentier');
    expect(hexPlaceName(PLAIN_HEX, 'en')).toBe('Rentier Mill');
    for (const lang of LANGS) {
      expect(hexPlaceName(PLAIN_HEX, lang), lang).toBe(HEX_NAMES[lang][PLAIN_HEX]);
      expect(hexPlaceName(PLAIN_HEX, lang, slots(lang)), lang).toBe(HEX_NAMES[lang][PLAIN_HEX]);
    }
  });

  it('rejoue l’identifiant d’une case inconnue', () => {
    expect(hexPlaceName('Z99')).toBe('Z99');
    expect(hexPlaceName('Z99', 'en')).toBe('Z99');
  });

  it('prend le français par défaut', () => {
    expect(hexPlaceName(PLAIN_HEX)).toBe(hexPlaceName(PLAIN_HEX, 'fr'));
  });
});

describe('hexPlaceLabel', () => {
  it('formate « Nom (ID) »', () => {
    expect(hexPlaceLabel(PLAIN_HEX, 'fr')).toBe('Moulin-Rentier (G7)');
    expect(hexPlaceLabel(PLAIN_HEX, 'en')).toBe('Rentier Mill (G7)');
    for (const lang of LANGS) {
      expect(hexPlaceLabel(CITY_HEX, lang), lang).toBe(`${hexPlaceName(CITY_HEX, lang)} (${CITY_HEX})`);
      expect(hexPlaceLabel(DEPOSIT_HEX, lang, slots(lang)), lang).toBe(`${hexPlaceName(DEPOSIT_HEX, lang, slots(lang))} (${DEPOSIT_HEX})`);
    }
  });
});
