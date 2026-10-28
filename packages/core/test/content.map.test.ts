import { describe, expect, it } from 'vitest';
import { CITY_IDS, COMMODITY_IDS, LANDMARK_IDS, ZONE_IDS, type MapPoint } from '../src/types';
import {
  CITIES,
  COASTLINE,
  DEFAULT_ZONE,
  DEPOSITS,
  ISLAND,
  JUNCTIONS,
  LAKE,
  LANDMARKS,
  MAP_HEIGHT,
  MAP_WIDTH,
  MOUNTAIN_RANGE,
  RIVERS,
  ROADS,
  ROAD_FACTOR,
  ZONES,
  distanceKm,
  getContent,
  roadNode,
  roadRoute,
  zoneOf,
} from '../src/content';
import { MAP_NAMES } from '../src/content/fr/map';
import { EN_MAP_NAMES } from '../src/content/en/map';
import { buildSiteSlots } from '../src/sim/deals';
import { SITES_PER_COMMODITY } from '../src/sim/constants';
import { createGame, getPlayerView } from '../src/engine';
import { bots, config, human, mapTexts } from './helpers';

const sorted = (xs: Iterable<string>) => [...xs].sort();

describe('La carte (§5.8) : le plateau', () => {
  it('une ville, une zone, un repère par identifiant', () => {
    expect(sorted(Object.keys(CITIES))).toEqual(sorted(CITY_IDS));
    expect(sorted(Object.keys(ZONES))).toEqual(sorted(ZONE_IDS));
    expect(sorted(Object.keys(LANDMARKS))).toEqual(sorted(LANDMARK_IDS));
    for (const [id, def] of [...Object.entries(CITIES), ...Object.entries(ZONES), ...Object.entries(LANDMARKS), ...Object.entries(DEPOSITS)]) {
      expect(def.id, id).toBe(id);
    }
  });

  it('les parts des clients font 100 %, la capitale en tête', () => {
    const shares = Object.values(CITIES).map((c) => c.share);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (const s of shares) expect(s).toBeGreaterThan(0);
    expect(Math.max(...shares)).toBe(CITIES.capital.share);
  });

  it('chaque ville a sa zone, au même endroit ; la zone par défaut est la capitale', () => {
    for (const id of CITY_IDS) expect({ x: ZONES[id].x, y: ZONES[id].y }).toEqual({ x: CITIES[id].x, y: CITIES[id].y });
    expect(DEFAULT_ZONE).toBe('capital');
    expect(zoneOf({})).toBe(ZONES.capital);
    expect(zoneOf({ zoneId: 'plain' })).toBe(ZONES.plain);
    // Une zone inconnue (ancienne partie, état bricolé) compte comme la capitale.
    expect(zoneOf({ zoneId: 'atlantis' as never })).toBe(ZONES.capital);
    expect(zoneOf({ zoneId: 'toString' as never })).toBe(ZONES.capital);
  });

  it('un gisement par emplacement de filiale, de la bonne matière', () => {
    const slots = buildSiteSlots(1, getContent('fr').siteNames);
    expect(sorted(Object.keys(DEPOSITS))).toEqual(sorted(slots.map((s) => s.id)));
    for (const s of slots) expect(DEPOSITS[s.id].commodityId, s.id).toBe(s.commodityId);
    for (const cid of COMMODITY_IDS) {
      expect(Object.values(DEPOSITS).filter((d) => d.commodityId === cid), cid).toHaveLength(SITES_PER_COMMODITY);
    }
  });

  it('tout tient dans le cadre, et deux points ne se confondent pas', () => {
    const points = [...Object.values(CITIES), ...Object.values(ZONES), ...Object.values(DEPOSITS), ...Object.values(LANDMARKS)];
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(MAP_WIDTH);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(MAP_HEIGHT);
    }
    const deposits = Object.values(DEPOSITS);
    for (let i = 0; i < deposits.length; i++) {
      for (let j = i + 1; j < deposits.length; j++) expect(distanceKm(deposits[i], deposits[j])).toBeGreaterThan(30);
    }
  });

  it('le relief : tout est à terre (sauf le pétrole en mer), rien dans le lac, la montagne et son lithium dans la chaîne', () => {
    const inside = (p: MapPoint, poly: MapPoint[]) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [a, b] = [poly[i], poly[j]];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    const nodes = { ...ZONES, ...DEPOSITS, ...JUNCTIONS };
    for (const [id, p] of Object.entries(nodes)) {
      expect(inside(p, COASTLINE), id).toBe(id !== 'oil-1' && id !== 'oil-2');
      expect(inside(p, LAKE), id).toBe(false);
      expect(inside(p, ISLAND), id).toBe(false);
    }
    expect(inside(ZONES.mountain, MOUNTAIN_RANGE)).toBe(true);
    expect(inside(DEPOSITS['lithium-1'], MOUNTAIN_RANGE)).toBe(true);
    for (const r of RIVERS) for (const p of r) expect(inside(p, COASTLINE) || inside(p, LAKE)).toBe(true);
  });

  it('les routes relient tout, par l’itinéraire le moins cher, le même dans les deux sens', () => {
    expect(ROAD_FACTOR.highway).toBeLessThan(ROAD_FACTOR.road);
    expect(ROAD_FACTOR.mountain).toBeGreaterThan(ROAD_FACTOR.road);
    for (const r of ROADS) {
      expect(roadNode(r.from), r.id).toBeDefined();
      expect(roadNode(r.to), r.id).toBeDefined();
    }
    const ends = [...Object.keys(ZONES), ...Object.keys(DEPOSITS)];
    for (const a of ends) {
      for (const b of ends) {
        const route = roadRoute(a, b)!;
        expect(route, `${a} → ${b}`).toBeDefined();
        expect(route.nodes[0]).toBe(a);
        expect(route.nodes.at(-1)).toBe(b);
        expect(route.points[0]).toEqual(roadNode(a));
        expect(route.points.at(-1)).toEqual(roadNode(b));
        // Une route n'est jamais plus courte que le vol d'oiseau.
        expect(route.km + 1e-9).toBeGreaterThanOrEqual(distanceKm(roadNode(a)!, roadNode(b)!));
        expect(route.cost).toBeCloseTo(roadRoute(b, a)!.cost, 9);
        if (a === b) expect(route).toMatchObject({ km: 0, cost: 0, nodes: [a] });
      }
    }
    expect(roadRoute('capital', 'atlantis')).toBeUndefined();
    expect(roadRoute('toString', 'capital')).toBeUndefined();
  });

  it('l’autoroute et le lac dessinent les itinéraires', () => {
    // De la capitale au nord-est : l'A1 par la rive nord du lac.
    expect(roadRoute('capital', 'north_east')!.nodes).toEqual(['capital', 'j-cn', 'j-lake-n', 'north_east']);
    // De la capitale à l'est : on contourne le lac par le sud.
    expect(roadRoute('capital', 'east')!.nodes).toEqual(['capital', 'j-cs', 'j-lake-s', 'j-east', 'east']);
    // Le pétrole en mer arrive par pipeline.
    expect(roadRoute('oil-1', 'north')!.nodes).toEqual(['oil-1', 'north']);
    // Le lithium de la montagne ne passe pas le col : la vallée vers l'est est moins chère.
    expect(roadRoute('lithium-1', 'capital')!.nodes.slice(0, 3)).toEqual(['lithium-1', 'mountain', 'east']);
  });

  it('distanceKm : à vol d’oiseau', () => {
    expect(distanceKm({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500);
    expect(distanceKm(CITIES.capital, ZONES.capital)).toBe(0);
  });
});

describe('La carte : les noms', () => {
  it('chaque langue nomme le pays, chaque ville, chaque zone hors des villes et chaque repère', () => {
    for (const names of [MAP_NAMES, EN_MAP_NAMES]) {
      expect(sorted(Object.keys(names.cities))).toEqual(sorted(CITY_IDS));
      expect(sorted(Object.keys(names.zones))).toEqual(sorted(ZONE_IDS.filter((z) => !(CITY_IDS as string[]).includes(z))));
      expect(sorted(Object.keys(names.landmarks))).toEqual(sorted(LANDMARK_IDS));
      const all = mapTexts(names);
      for (const t of all) expect(t.trim().length, t).toBeGreaterThan(0);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('getContent donne les noms de la langue, jamais d’autres nombres', () => {
    expect(getContent('fr').mapNames).toBe(MAP_NAMES);
    expect(getContent('en').mapNames).toBe(EN_MAP_NAMES);
    expect(getContent().mapNames).toBe(MAP_NAMES);
  });
});

describe('La carte : l’état et la vue', () => {
  it('une partie neuve : usines des humains et des PNJ à la capitale ; les bots s’installent gratuitement, pareil dans les deux langues', () => {
    const zones = (lang: 'fr' | 'en') => {
      const s = createGame({ ...config(3), lang }, [human('a', 'gadgets'), ...bots(3)]);
      for (const c of Object.values(s.companies)) {
        const bot = c.controllerId !== null && s.players[c.controllerId]?.isBot;
        for (const p of c.products) if (!bot) expect(p.zoneId, `${c.id}/${p.id}`).toBeUndefined();
      }
      const view = getPlayerView(s, 'a');
      return view.companies.map((c) => c.products.map((p) => p.zoneId ?? 'capital').join(',')).join(';');
    };
    expect(zones('en')).toBe(zones('fr'));
  });

  it('la zone d’une usine est publique', () => {
    const s = createGame(config(3), [human('a', 'gadgets'), human('b', 'yogurts'), ...bots(2)]);
    const theirs = Object.values(s.companies).find((c) => c.controllerId === 'b')!;
    theirs.products[0].zoneId = 'plain';
    const seen = getPlayerView(s, 'a').companies.find((c) => c.id === theirs.id)!;
    expect(seen.products[0].zoneId).toBe('plain');
    expect(getPlayerView(s, 'nobody').companies.find((c) => c.id === theirs.id)!.products[0].zoneId).toBe('plain');
  });
});
