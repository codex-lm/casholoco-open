import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getPlayerView, resolveTurn } from '../src/engine';
import { CARTEL_FINE_MIN, CARTEL_SCANDAL, HQ_COST, SITE_BOOK_VALUE_RATIO, SITE_CAPACITY, SITE_DORMANT_UPKEEP } from '../src/sim/constants';
import { closeObligations } from '../src/sim/close';
import { bookValue } from '../src/sim/finance';
import { awardSites, capacityNeed, cartelRisk, contractPriceRange, deliverContracts, siteOpeningCost, siteUnitCost, siteUpkeep, slotCapacity } from '../src/sim/deals';
import { applyNewsCard } from '../src/sim/news';
import { flavor } from '../src/sim/util';
import { COMMODITY_IDS, type Action, type CommodityId, type CompanyState, type GameState } from '../src/types';
import { DEPOSITS, NEWS_CARDS, SECTORS, getContent } from '../src/content';
import { bots, companyOf, config, human, newGame } from './helpers';

const ok = (s: GameState, who: string, a: Action) => {
  const r = applyAction(s, who, a);
  expect(r.ok, r.message).toBe(true);
  return r;
};
const ko = (s: GameState, who: string, a: Action) => {
  const r = applyAction(s, who, a);
  expect(r.ok, r.message).toBe(false);
  return r;
};

/** Alice (gadgets), Bob (gadgets), Cleo (yaourts) : trois humains, aucun bot. */
function trio(): GameState {
  return newGame(5, [human('a', 'gadgets', 'Alice'), human('b', 'gadgets', 'Bob'), human('c', 'yogurts', 'Cleo')]);
}

/** Le gisement moyen d'une matière (40 lots, comme SITE_CAPACITY) : celui que visent les tests sans autre précision. */
const mid = (cid: CommodityId) => `${cid}-2`;

/** Mise à la mise à prix, puis clôture du trimestre : la filiale est attribuée, en chantier pour un trimestre. */
function win(s: GameState, who: string, companyId: string, cid: CommodityId, slotId = mid(cid)): void {
  ok(s, who, { type: 'bidSite', companyId, slotId, amount: siteOpeningCost(cid) });
  resolveTurn(s);
}

describe('filiales d’approvisionnement (§5.5 bis)', () => {
  it('s’attribuent à la clôture, se paient comptant comme une usine, comptent à moitié dans la valeur comptable, produisent dès le trimestre suivant', () => {
    const s = trio();
    const c = companyOf(s, 'a');
    const t0 = s.turn;
    ok(s, 'a', { type: 'bidSite', companyId: c.id, slotId: 'sugar-2', amount: siteOpeningCost('sugar') });
    // Rien n'est payé ni attribué avant la clôture ; la mise reste secrète.
    expect(c.sites).toBeUndefined();
    expect(getPlayerView(s, 'a').self!.siteBids).toEqual([
      expect.objectContaining({ companyId: c.id, commodityId: 'sugar', slotId: 'sugar-2', amount: siteOpeningCost('sugar') }),
    ]);
    resolveTurn(s);
    const slot = s.siteSlots!.find((x) => x.id === 'sugar-2')!;
    expect(slotCapacity(slot.id)).toBe(SITE_CAPACITY);
    expect(c.sites).toEqual([
      { id: slot.id, commodityId: 'sugar', capacity: SITE_CAPACITY, unitCost: siteUnitCost('sugar'), activeFrom: t0 + 1, cost: siteOpeningCost('sugar') },
    ]);
    // Un seul candidat : il paie la mise à prix, comptant, hors compte de résultat (comme une usine).
    expect(s.siteBids).toEqual([expect.objectContaining({ companyId: c.id, result: { outcome: 'won', price: siteOpeningCost('sugar'), bidders: 1 } })]);
    expect(c.reports.at(-1)!.amortization ?? 0).toBe(0);
    expect(c.launchCharges ?? []).toEqual([]);
    // La moitié du prix reste dans la valeur comptable.
    const withoutSite = { ...c, sites: [] };
    expect(bookValue(c) - bookValue(withoutSite)).toBeCloseTo(siteOpeningCost('sugar') * SITE_BOOK_VALUE_RATIO, 6);
    ko(s, 'a', { type: 'bidSite', companyId: c.id, slotId: 'sugar-1', amount: siteOpeningCost('sugar') }); // une seule par matière
    // Publique : les autres la voient, avec son nom, et le journal l'annonce au numéro suivant.
    const seen = getPlayerView(s, 'b');
    expect(seen.companies.find((x) => x.id === c.id)?.sites?.[0]).toMatchObject({ commodityId: 'sugar', name: slot.name });
    expect(seen.siteSlots.find((x) => x.id === slot.id)).toMatchObject({ companyId: c.id, name: slot.name });
    expect(seen.self!.siteBids).toBeUndefined();
    const article = s.journal.at(-1)!.articles.find((x) => x.event?.type === 'siteOpened')!;
    expect(article.event).toMatchObject({ actorId: 'a', commodityId: 'sugar', amount: siteOpeningCost('sugar') });
    expect(article.title).toContain(slot.name);
    // Le chantier a duré la clôture : 40 lots à la suivante (les gadgets ne mangent pas de sucre).
    expect(c.inventory.sugar).toBeUndefined();
    resolveTurn(s);
    expect(c.inventory.sugar).toEqual({ lots: SITE_CAPACITY, avgCost: siteUnitCost('sugar') });
  });

  it('prennent la richesse de leur gisement : 50 lots pour le riche, 30 pour le pauvre (§5.8)', () => {
    const s = trio();
    const [a, b] = [companyOf(s, 'a'), companyOf(s, 'b')];
    for (const c of [a, b]) c.cash += 20_000; // l'extraction en surplus passe après tout le reste (§5.7) : de quoi tout extraire
    ok(s, 'a', { type: 'bidSite', companyId: a.id, slotId: 'sugar-1', amount: siteOpeningCost('sugar') });
    ok(s, 'b', { type: 'bidSite', companyId: b.id, slotId: 'sugar-3', amount: siteOpeningCost('sugar') });
    resolveTurn(s);
    expect(a.sites![0]).toMatchObject({ id: 'sugar-1', capacity: 50 });
    expect(b.sites![0]).toMatchObject({ id: 'sugar-3', capacity: 30 });
    expect(DEPOSITS['sugar-1'].capacity).toBe(50);
    expect(siteUpkeep(a.sites![0])).toBeCloseTo(50 * siteUnitCost('sugar') * SITE_DORMANT_UPKEEP, 6);
    s.activeEffects = s.activeEffects.filter((e) => e.kind !== 'siteCost');
    for (const c of [a, b]) c.cash += 20_000;
    resolveTurn(s); // les gadgets ne mangent pas de sucre : tout part au stock
    expect(a.inventory.sugar!.lots).toBe(50);
    expect(b.inventory.sugar!.lots).toBe(30);
  });

  it('coûtent plus ou moins cher à exploiter selon les news de leur matière (effet « siteCost »), au vu de tous', () => {
    const s = trio();
    const c = companyOf(s, 'a');
    win(s, 'a', c.id, 'sugar'); // attribuée, puis en chantier
    s.activeEffects = s.activeEffects.filter((e) => e.kind !== 'siteCost');
    // « Des abeilles occupent les raffineries de sucre » : extraction plus chère pendant 2 trimestres, cours intact.
    const card = NEWS_CARDS.find((x) => x.id === 'st_sugar_bees')!;
    const eff = card.effects.find((e) => e.type === 'siteCost')!;
    expect(eff).toMatchObject({ commodityId: 'sugar', duration: 2 });
    const k = (eff as { multiplier: number }).multiplier;
    expect(k).toBeGreaterThan(1);
    const price = s.commodities.sugar.price;
    applyNewsCard(s, card, 'news');
    expect(s.commodities.sugar.price).toBe(price);
    expect(s.activeEffects.find((e) => e.kind === 'siteCost')).toMatchObject({ commodityId: 'sugar', value: k, turnsLeft: 2 });
    const seen = getPlayerView(s, 'b').companies.find((x) => x.id === c.id)!.sites![0];
    expect(seen.currentUnitCost).toBeCloseTo(k * siteUnitCost('sugar'), 6);
    expect(seen.unitCost).toBeCloseTo(siteUnitCost('sugar'), 6);
    // Le multiplicateur est public, filiale ouverte ou non (pour qui hésite à en ouvrir une).
    const market = getPlayerView(s, 'b').commodities;
    expect(market.find((x) => x.id === 'sugar')!.siteCostFactor).toBeCloseTo(k, 6);
    expect(market.find((x) => x.id === 'oil')!.siteCostFactor).toBeUndefined();
    c.cash += 20_000; // l'extraction en surplus passe après production et marketing (§5.7) : de quoi tout extraire
    resolveTurn(s); // les gadgets ne mangent pas de sucre : le stock garde le coût du trimestre
    expect(c.inventory.sugar!.lots).toBe(SITE_CAPACITY);
    expect(c.inventory.sugar!.avgCost).toBeCloseTo(k * siteUnitCost('sugar'), 6);
  });

  it('en sommeil : plus d’extraction, l’entretien compte dans les coûts fixes ; la relance prend un trimestre', () => {
    const s = trio();
    const c = companyOf(s, 'a');
    const fixedOf = (x: CompanyState) => HQ_COST + x.products.reduce((sum, p) => sum + SECTORS[p.sectorId].fixedCost, 0);
    const calm = () => (s.activeEffects = s.activeEffects.filter((e) => e.kind !== 'siteCost'));
    win(s, 'a', c.id, 'sugar'); // attribuée, puis en chantier
    calm();
    ko(s, 'b', { type: 'setSiteDormant', companyId: c.id, commodityId: 'sugar', dormant: true }); // pas son entreprise
    ko(s, 'a', { type: 'setSiteDormant', companyId: c.id, commodityId: 'oil', dormant: true }); // pas de puits
    ko(s, 'a', { type: 'setSiteDormant', companyId: c.id, commodityId: 'sugar', dormant: false }); // tourne déjà
    ok(s, 'a', { type: 'setSiteDormant', companyId: c.id, commodityId: 'sugar', dormant: true });
    ko(s, 'a', { type: 'setSiteDormant', companyId: c.id, commodityId: 'sugar', dormant: true }); // dort déjà
    const upkeep = siteUpkeep(c.sites![0]);
    expect(upkeep).toBeCloseTo(SITE_CAPACITY * siteUnitCost('sugar') * SITE_DORMANT_UPKEEP, 6);
    expect(getPlayerView(s, 'b').companies.find((x) => x.id === c.id)!.sites![0]).toMatchObject({ dormant: true, upkeep });
    resolveTurn(s);
    expect(c.inventory.sugar).toBeUndefined();
    expect(c.reports.at(-1)!.fixedCosts).toBeCloseTo(fixedOf(c) + upkeep, 6);
    // Relance : un trimestre de remise en route (ni extraction ni entretien), puis 40 lots.
    ok(s, 'a', { type: 'setSiteDormant', companyId: c.id, commodityId: 'sugar', dormant: false });
    expect(c.sites![0].dormant).toBeUndefined();
    expect(c.sites![0].activeFrom).toBe(s.turn + 1);
    calm();
    resolveTurn(s);
    expect(c.inventory.sugar).toBeUndefined();
    expect(c.reports.at(-1)!.fixedCosts).toBeCloseTo(fixedOf(c), 6);
    calm();
    resolveTurn(s);
    expect(c.inventory.sugar).toEqual({ lots: SITE_CAPACITY, avgCost: siteUnitCost('sugar') });
  });

  it('refuse une mise sans trésorerie, et suit l’entreprise absorbée dans une fusion', () => {
    const s = trio();
    const c = companyOf(s, 'a');
    const cash = c.cash;
    c.cash = 100;
    ko(s, 'a', { type: 'bidSite', companyId: c.id, slotId: 'lithium-2', amount: siteOpeningCost('lithium') });
    expect(s.siteBids).toBeUndefined();
    c.cash = cash;
    // Bob remporte une mine, Alice rachète son entreprise puis l'absorbe : la mine (et son nom) passe chez Alice.
    const bob = companyOf(s, 'b');
    bob.cash = 2 * siteOpeningCost('lithium');
    win(s, 'b', bob.id, 'lithium');
    const slotId = bob.sites![0].id;
    s.players.a.cash = 1e9;
    ok(s, 'a', { type: 'buyShares', companyId: bob.id, shares: 5001 });
    ok(s, 'a', { type: 'merge', absorberId: c.id, targetId: bob.id });
    expect(c.sites?.map((x) => x.id)).toEqual([slotId]);
    expect(bob.sites).toBeUndefined();
    expect(getPlayerView(s, 'b').siteSlots.find((x) => x.id === slotId)?.companyId).toBe(c.id);
  });
});

/** Quatre humains, riches : de quoi se disputer les gisements d'une matière. */
function quad(): GameState {
  const s = newGame(5, [human('a', 'gadgets', 'Alice'), human('b', 'gadgets', 'Bob'), human('c', 'yogurts', 'Cleo'), human('d', 'scooters', 'Dan')]);
  for (const c of Object.values(s.companies)) if (c.controllerId) c.cash = 1e6;
  return s;
}
const WHO = ['a', 'b', 'c', 'd'];
/** Mise sur un gisement (le riche par défaut : celui qu'on se dispute). */
const bid = (s: GameState, who: string, amount: number, slotId = 'sugar-1') =>
  applyAction(s, who, { type: 'bidSite', companyId: companyOf(s, who).id, slotId, amount });
const outcomeOf = (s: GameState, who: string, cid: CommodityId = 'sugar') =>
  s.siteBids!.find((b) => b.companyId === companyOf(s, who).id && b.commodityId === cid)!.result!;
/**
 * Trésorerie qui laisse `left` aux enchères, réglées en fin de trimestre : l'entreprise ne produit rien ni ne fait de
 * marketing (ni ventes ni coûts), et paie ses obligations (siège, coûts fixes…, §5.7).
 */
const leave = (s: GameState, who: string, left: number) => {
  const c = companyOf(s, who);
  for (const p of c.products) Object.assign(p, { production: 0, marketing: 0, rnd: 0 });
  c.cash = left + closeObligations(s, c).total;
};

describe('enchères de filiales (§5.5 bis)', () => {
  it('trois emplacements par matière, nommés à la création : mêmes choix en français et en anglais, sans toucher au RNG', () => {
    const players = [human('a'), human('b')];
    const fr = createGame({ ...config(9), lang: 'fr' }, players);
    const en = createGame({ ...config(9), lang: 'en' }, players);
    expect(fr.siteSlots).toHaveLength(3 * COMMODITY_IDS.length);
    for (const cid of COMMODITY_IDS) {
      const slots = fr.siteSlots!.filter((x) => x.commodityId === cid);
      expect(slots.map((x) => x.id)).toEqual([`${cid}-1`, `${cid}-2`, `${cid}-3`]);
      expect(new Set(slots.map((x) => x.name)).size).toBe(3);
      // Un riche, un moyen, un pauvre : 40 lots en moyenne, comme avant la carte.
      expect(slots.map((x) => slotCapacity(x.id))).toEqual([50, 40, 30]);
    }
    expect(en.siteSlots!.map((x) => x.id)).toEqual(fr.siteSlots!.map((x) => x.id));
    fr.siteSlots!.forEach((slot, i) => {
      const [frNames, enNames] = [getContent('fr').siteNames[slot.commodityId], getContent('en').siteNames[slot.commodityId]];
      expect(frNames.indexOf(slot.name)).toBeGreaterThanOrEqual(0);
      expect(enNames.indexOf(en.siteSlots![i].name)).toBe(frNames.indexOf(slot.name));
    });
    expect(en.rngState).toBe(fr.rngState);
    expect(JSON.stringify(createGame(config(10), players).siteSlots)).not.toBe(JSON.stringify(createGame(config(9), players).siteSlots));
  });

  it('une mise : refusée sous la mise à prix, sans trésorerie, hors de son entreprise, sur un gisement inconnu ; remplacée, retirée', () => {
    const s = trio();
    const c = companyOf(s, 'a');
    const reserve = siteOpeningCost('sugar');
    expect(bid(s, 'a', reserve - 1).ok).toBe(false);
    expect(bid(s, 'a', 0).ok).toBe(false);
    expect(bid(s, 'a', Number.NaN).ok).toBe(false);
    expect(bid(s, 'a', reserve, 'sugar-9').ok).toBe(false);
    expect(bid(s, 'a', reserve, 'toString').ok).toBe(false);
    c.cash = reserve + 10;
    expect(bid(s, 'a', reserve + 11).ok).toBe(false); // plus que sa caisse
    ko(s, 'b', { type: 'bidSite', companyId: c.id, slotId: 'sugar-1', amount: reserve }); // pas son entreprise
    ko(s, 'a', { type: 'cancelSiteBid', companyId: c.id, commodityId: 'sugar' }); // rien à retirer
    expect(bid(s, 'a', reserve).ok).toBe(true);
    expect(bid(s, 'a', reserve + 10).ok).toBe(true); // remplace la première
    expect(s.siteBids).toHaveLength(1);
    expect(s.siteBids![0]).toMatchObject({ slotId: 'sugar-1', amount: reserve + 10 });
    // Une mise sur un autre gisement de la même matière remplace la mise : une seule par matière.
    expect(bid(s, 'a', reserve, 'sugar-3').ok).toBe(true);
    expect(s.siteBids).toHaveLength(1);
    expect(s.siteBids![0]).toMatchObject({ commodityId: 'sugar', slotId: 'sugar-3', amount: reserve });
    ok(s, 'a', { type: 'cancelSiteBid', companyId: c.id, commodityId: 'sugar' });
    expect(s.siteBids).toBeUndefined();
  });

  it('chaque gisement a sa propre enchère : la plus haute mise l’emporte et paie la meilleure mise perdante sur ce gisement', () => {
    const s = quad();
    const reserve = siteOpeningCost('sugar');
    bid(s, 'a', 4 * reserve); // le riche : disputé
    bid(s, 'b', 2 * reserve);
    bid(s, 'c', 3 * reserve, 'sugar-2'); // le moyen : seule sur les rangs
    bid(s, 'd', 1.5 * reserve, 'sugar-3'); // le pauvre : seul aussi
    resolveTurn(s);
    expect(outcomeOf(s, 'a')).toMatchObject({ outcome: 'won', price: 2 * reserve, bidders: 2 });
    expect(outcomeOf(s, 'b')).toMatchObject({ outcome: 'lost', price: 2 * reserve, bidders: 2 });
    expect(outcomeOf(s, 'c')).toMatchObject({ outcome: 'won', price: reserve, bidders: 1 });
    expect(outcomeOf(s, 'd')).toMatchObject({ outcome: 'won', price: reserve, bidders: 1 });
    expect(companyOf(s, 'a').sites![0]).toMatchObject({ id: 'sugar-1', capacity: 50, cost: 2 * reserve });
    expect(companyOf(s, 'c').sites![0]).toMatchObject({ id: 'sugar-2', capacity: 40, cost: reserve });
    expect(companyOf(s, 'd').sites![0]).toMatchObject({ id: 'sugar-3', capacity: 30, cost: reserve });
    // Le perdant ne paie rien, et n'a rien : son ardoise est celle d'un trimestre sans filiale.
    expect(companyOf(s, 'b').sites).toBeUndefined();
    expect(companyOf(s, 'b').launchCharges).toBeUndefined();
    // Le journal suit l'ordre des gisements.
    const order = s.journal.at(-1)!.articles.filter((x) => x.event?.type === 'siteOpened').map((x) => x.companyIds![0]);
    expect(order).toEqual(['a', 'c', 'd'].map((w) => companyOf(s, w).id));
  });

  it('quatre mises sur un gisement : une seule l’emporte, au prix de la deuxième', () => {
    const s = quad();
    const reserve = siteOpeningCost('sugar');
    bid(s, 'a', 4 * reserve);
    bid(s, 'b', 3 * reserve);
    bid(s, 'c', 2 * reserve);
    bid(s, 'd', 1.5 * reserve);
    resolveTurn(s);
    expect(outcomeOf(s, 'a')).toMatchObject({ outcome: 'won', price: 3 * reserve, bidders: 4 });
    for (const w of ['b', 'c', 'd']) {
      expect(outcomeOf(s, w)).toMatchObject({ outcome: 'lost', price: 3 * reserve, bidders: 4 });
      expect(companyOf(s, w).sites).toBeUndefined();
    }
    // Les deux autres gisements restent libres : personne ne les visait.
    expect(getPlayerView(s, 'd').siteSlots.filter((x) => x.commodityId === 'sugar' && x.companyId !== undefined).map((x) => x.id)).toEqual(['sugar-1']);
  });

  it('une mise ne compte que jusqu’à la trésorerie de l’entreprise à la clôture', () => {
    const s = quad();
    const reserve = siteOpeningCost('sugar');
    bid(s, 'a', 4 * reserve);
    bid(s, 'b', 3 * reserve);
    leave(s, 'a', reserve + 1); // dépensé entre-temps : sa mise n'engage plus que ce qui reste après les obligations
    resolveTurn(s);
    // Alice n'engage plus que la mise à prix + 1 : elle perd, et Bob paie ce qu'elle engage vraiment.
    expect(outcomeOf(s, 'a')).toMatchObject({ outcome: 'lost', price: reserve + 1, bidders: 2 });
    expect(outcomeOf(s, 'b')).toMatchObject({ outcome: 'won', price: reserve + 1, bidders: 2 });
    expect(companyOf(s, 'a').sites).toBeUndefined();
  });

  it('miser avec de l’argent qu’on n’a plus à la clôture ne fait monter le prix de personne (relecture)', () => {
    // Une mise honnête (6 000), seule : elle paie la mise à prix (5 000).
    const run = (shill: (s: GameState) => void) => {
      const s = quad();
      bid(s, 'a', 6000);
      shill(s);
      resolveTurn(s);
      return s;
    };
    const honest = run(() => {});
    expect(outcomeOf(honest, 'a')).toMatchObject({ outcome: 'won', price: 5000 });
    // Dan mise 5 100 sur le même gisement puis vide sa caisse : sa mise tombe, sans rien coûter à Alice.
    const drained = run((s) => {
      bid(s, 'd', 5100);
      leave(s, 'd', 473);
    });
    expect(outcomeOf(drained, 'a')).toMatchObject({ outcome: 'won', price: 5000, bidders: 1 });
    expect(outcomeOf(drained, 'd')).toMatchObject({ outcome: 'failed', price: 5000 }); // le prix public, pas une mise secrète
    // Dan emprunte, mise 5 199 et rembourse dans le trimestre : même chose.
    const borrowed = run((s) => {
      const dan = companyOf(s, 'd');
      leave(s, 'd', 400);
      ok(s, 'd', { type: 'takeLoan', companyId: dan.id, amount: 6000 });
      bid(s, 'd', 5199);
      ok(s, 'd', { type: 'repayLoan', companyId: dan.id, amount: 6000 });
    });
    expect(outcomeOf(borrowed, 'a')).toMatchObject({ outcome: 'won', price: 5000 });
    expect(outcomeOf(borrowed, 'd')).toMatchObject({ outcome: 'failed' });
    // S'il garde l'argent jusqu'à la clôture, sa mise est réelle : il fait monter le prix, au risque de gagner.
    const kept = run((s) => {
      const dan = companyOf(s, 'd');
      leave(s, 'd', 400);
      ok(s, 'd', { type: 'takeLoan', companyId: dan.id, amount: 6000 });
      bid(s, 'd', 5199);
    });
    expect(outcomeOf(kept, 'a')).toMatchObject({ outcome: 'won', price: 5199, bidders: 2 });
    expect(outcomeOf(kept, 'd')).toMatchObject({ outcome: 'lost', price: 5199 });
  });

  it('une mise impayable n’écarte pas un gagnant qui peut payer (relecture)', () => {
    const s = quad();
    bid(s, 'a', 9000);
    bid(s, 'b', 8000);
    bid(s, 'c', 7000);
    leave(s, 'a', 5999);
    leave(s, 'b', 0);
    resolveTurn(s);
    // A n'engage plus que 5 999, B rien : C l'emporte au prix de ce qu'A engage vraiment.
    expect(outcomeOf(s, 'b')).toMatchObject({ outcome: 'failed' });
    expect(outcomeOf(s, 'c')).toMatchObject({ outcome: 'won', price: 5999, bidders: 2 });
    expect(outcomeOf(s, 'a')).toMatchObject({ outcome: 'lost', price: 5999 });
  });

  it('une entreprise que l’achat mettrait en faillite ne peut pas l’emporter (relecture)', () => {
    const s = quad();
    const doomed = companyOf(s, 'a');
    bid(s, 'a', 20000);
    bid(s, 'b', 5000);
    doomed.debt = 1e9; // perdue quoi qu'il arrive : elle ne doit pas bloquer un gisement
    resolveTurn(s);
    expect(doomed.status).toBe('bankrupt');
    expect(s.siteBids!.find((b) => b.companyId === doomed.id)!.result).toMatchObject({ outcome: 'failed' });
    expect(outcomeOf(s, 'b')).toMatchObject({ outcome: 'won', price: 5000, bidders: 1 });
    expect(doomed.sites).toBeUndefined();
  });

  it('un nouveau dirigeant ne voit ni ne retire la mise de l’ancien ; elle tombe à la clôture (relecture)', () => {
    const s = quad();
    const alice = companyOf(s, 'a');
    bid(s, 'a', 6000);
    s.players.b.cash = 1e9;
    ok(s, 'b', { type: 'buyShares', companyId: alice.id, shares: 5001 });
    expect(alice.controllerId).toBe('b');
    // Même refus pour le sucre (où Alice a misé) que pour le pétrole (où personne n'a misé) : rien ne transparaît.
    const sugar = applyAction(s, 'b', { type: 'cancelSiteBid', companyId: alice.id, commodityId: 'sugar' });
    const oil = applyAction(s, 'b', { type: 'cancelSiteBid', companyId: alice.id, commodityId: 'oil' });
    expect(sugar.ok).toBe(false);
    expect(sugar.message).toBe(oil.message);
    expect(getPlayerView(s, 'b').self!.siteBids).toBeUndefined();
    // Bob mise à son tour pour l'entreprise, sur le même gisement : sa mise s'ajoute, celle d'Alice reste (et tombera).
    ok(s, 'b', { type: 'bidSite', companyId: alice.id, slotId: 'sugar-1', amount: 5000 });
    expect(s.siteBids).toHaveLength(2);
    resolveTurn(s);
    expect(s.siteBids!.find((b) => b.playerId === 'a')!.result).toMatchObject({ outcome: 'failed' });
    expect(s.siteBids!.find((b) => b.playerId === 'b')!.result).toMatchObject({ outcome: 'won', price: 5000, bidders: 1 });
  });

  it('pas de mise au dernier trimestre : la filiale ne produirait jamais (relecture)', () => {
    const s = newGame(5, [human('a', 'gadgets'), human('b', 'yogurts')], 3);
    const c = companyOf(s, 'a');
    c.cash = 1e6;
    resolveTurn(s);
    resolveTurn(s);
    expect(s.turn).toBe(3);
    const r = applyAction(s, 'a', { type: 'bidSite', companyId: c.id, slotId: 'sugar-1', amount: 5000 });
    expect(r.ok).toBe(false);
    expect(s.siteBids).toBeUndefined();
  });

  it('les noms des filiales viennent de la graine des textes, publique, jamais de celle de la simulation (relecture)', () => {
    const players = [human('a'), human('b')];
    const names = (seed: number, textSeed?: number) =>
      createGame({ ...config(seed), ...(textSeed === undefined ? {} : { textSeed }) }, players).siteSlots!.map((x) => x.name);
    // Même graine des textes, graines de simulation différentes : mêmes noms, rien à en tirer.
    expect(names(1, 77)).toEqual(names(2, 77));
    expect(names(1, 77)).toEqual(names(123456789, 77));
    // Autre graine des textes : d'autres noms.
    expect([78, 79, 80, 81].some((t) => JSON.stringify(names(1, t)) !== JSON.stringify(names(1, 77)))).toBe(true);
    // Les phrases d'ambiance aussi : à état égal, changer la graine secrète ne change pas la petite phrase choisie.
    const g = createGame({ ...config(1), textSeed: 77 }, players);
    const pool = Array.from({ length: 97 }, (_, i) => `phrase ${i}`);
    const other = structuredClone(g);
    other.config.seed = 999_999;
    expect(flavor(other, pool, 'quip')).toBe(flavor(g, pool, 'quip'));
    other.config.textSeed = 78;
    expect(['quip', 'a', 'b', 'c'].some((salt) => flavor(other, pool, salt) !== flavor(g, pool, salt))).toBe(true);
    // La vue publie la graine des textes (sans risque), jamais celle de la simulation.
    const view = getPlayerView(createGame({ ...config(424242), textSeed: 77 }, players), 'a');
    expect(view.config.seed).toBe(0);
    expect(view.config.textSeed).toBe(77);
  });

  it('mises égales sur un gisement : départagées sans le RNG, de la même façon à chaque relecture, et pas toujours au même', () => {
    const winners = new Set<string>();
    for (const seed of [5, 6, 7, 8, 9, 10]) {
      const play = () => {
        const s = newGame(seed, [human('a', 'gadgets', 'Alice'), human('b', 'gadgets', 'Bob'), human('c', 'yogurts', 'Cleo'), human('d', 'scooters', 'Dan')]);
        for (const c of Object.values(s.companies)) if (c.controllerId) c.cash = 1e6;
        for (const w of WHO) bid(s, w, siteOpeningCost('sugar'));
        const rng = s.rngState;
        awardSites(s);
        expect(s.rngState).toBe(rng); // le départage ne tire pas le RNG
        return WHO.filter((w) => companyOf(s, w).sites !== undefined);
      };
      const first = play();
      expect(first).toHaveLength(1); // un gisement, quatre mises égales
      expect(play()).toEqual(first);
      winners.add(first[0]);
    }
    expect(winners.size).toBeGreaterThan(1);
  });

  it('une seule filiale par matière et par entreprise ; deux mises d’une même entreprise se paient l’une après l’autre', () => {
    const s = quad();
    const c = companyOf(s, 'a');
    const [sugar, oil] = [siteOpeningCost('sugar'), siteOpeningCost('oil')];
    c.cash = oil + sugar / 2; // de quoi miser sur les deux, pas de payer les deux
    bid(s, 'a', sugar, 'sugar-2');
    bid(s, 'a', oil, 'oil-2');
    resolveTurn(s);
    // Les matières se règlent dans l'ordre du catalogue (pétrole d'abord) : le sucre échoue faute de caisse.
    expect(outcomeOf(s, 'a', 'oil')).toMatchObject({ outcome: 'won' });
    expect(outcomeOf(s, 'a', 'sugar')).toMatchObject({ outcome: 'failed' });
    expect(c.sites!.map((x) => x.commodityId)).toEqual(['oil']);
  });

  it('les mises sont secrètes : ni les autres joueurs ni un spectateur ne les voient', () => {
    const s = quad();
    const secret = 7 * siteOpeningCost('sugar') + 3;
    expect(bid(s, 'a', secret).ok).toBe(true);
    for (const who of ['b', 'c', 'd']) expect(JSON.stringify(getPlayerView(s, who))).not.toContain(String(secret));
    expect(JSON.stringify(getPlayerView(s, 'spectator'))).not.toContain(String(secret));
    expect(JSON.stringify(getPlayerView(s, 'a').self!.siteBids)).toContain(String(secret));
  });

  it('la mise tombe si l’entreprise change de dirigeant avant la clôture', () => {
    const s = quad();
    const alice = companyOf(s, 'a');
    bid(s, 'a', siteOpeningCost('sugar'));
    s.players.b.cash = 1e9;
    ok(s, 'b', { type: 'buyShares', companyId: alice.id, shares: 5001 }); // Bob prend le contrôle d'Alice (50 % + 1)
    expect(alice.controllerId).toBe('b');
    resolveTurn(s);
    expect(outcomeOf(s, 'a')).toMatchObject({ outcome: 'failed' });
    expect(alice.sites).toBeUndefined();
  });

  it('un gisement exploité n’accepte pas de mise ; la faillite de son exploitant le remet aux enchères', () => {
    const s = quad();
    const c = companyOf(s, 'a');
    win(s, 'a', c.id, 'sugar', 'sugar-1');
    const r = bid(s, 'b', siteOpeningCost('sugar'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain(s.siteSlots!.find((x) => x.id === 'sugar-1')!.name);
    expect(s.siteBids?.some((b) => b.companyId === companyOf(s, 'b').id && b.result === undefined)).toBeFalsy();
    expect(bid(s, 'b', siteOpeningCost('sugar'), 'sugar-2').ok).toBe(true); // un autre gisement de sucre, libre
    c.debt = 1e9; // ruinée : faillite en tête de clôture, avant les enchères (§5.7)
    resolveTurn(s);
    expect(c.status).toBe('bankrupt');
    expect(c.sites).toBeUndefined();
    expect(outcomeOf(s, 'b')).toMatchObject({ outcome: 'won', bidders: 1 });
    // Le riche est libre de nouveau : Cleo le remporte à la clôture suivante.
    const view = getPlayerView(s, 'c');
    expect(view.siteSlots.find((x) => x.id === 'sugar-1')?.companyId).toBeUndefined();
    expect(view.companies.find((x) => x.id === c.id)?.sites).toBeUndefined();
    expect(bid(s, 'c', siteOpeningCost('sugar')).ok).toBe(true);
    resolveTurn(s);
    expect(companyOf(s, 'c').sites![0]).toMatchObject({ id: 'sugar-1', capacity: 50 });
  });

  it('avec des bots : jamais deux exploitants pour un gisement, des mises cohérentes, et des filiales attribuées', () => {
    let won = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = newGame(seed, [...bots(5), human('h', 'gadgets', 'Hugo')]);
      while (s.phase === 'playing') {
        // Hugo mise chaque trimestre sur le premier gisement libre de sucre, puis de puces, à la mise à prix.
        const mine = Object.values(s.companies).find((c) => c.founderId === 'h' && c.status === 'active');
        if (mine) {
          const slots = getPlayerView(s, 'h').siteSlots;
          for (const cid of ['sugar', 'chips'] as const) {
            const free = slots.find((x) => x.commodityId === cid && x.companyId === undefined);
            if (free) applyAction(s, 'h', { type: 'bidSite', companyId: mine.id, slotId: free.id, amount: siteOpeningCost(cid) });
          }
        }
        resolveTurn(s);
        const held = new Map<string, string>();
        for (const c of Object.values(s.companies)) {
          if (c.status !== 'active') continue;
          for (const site of c.sites ?? []) {
            expect(s.siteSlots!.some((x) => x.id === site.id && x.commodityId === site.commodityId), site.id).toBe(true);
            expect(held.has(site.id), `${site.id} exploité deux fois`).toBe(false);
            expect(site.capacity, site.id).toBe(slotCapacity(site.id));
            held.set(site.id, c.id);
          }
        }
        const seen = new Set<string>();
        for (const b of s.siteBids ?? []) {
          const key = `${b.companyId}|${b.commodityId}|${b.playerId}`;
          expect(seen.has(key), key).toBe(false);
          seen.add(key);
          expect(s.siteSlots!.find((x) => x.id === b.slotId)?.commodityId, b.slotId).toBe(b.commodityId);
          expect(Number.isFinite(b.amount) && b.amount >= siteOpeningCost(b.commodityId)).toBe(true);
          if (b.result?.outcome === 'won') won++;
        }
      }
    }
    expect(won).toBeGreaterThan(0);
  });
});

describe('cessions d’actions de gré à gré (§7 bis)', () => {
  it('Alice vend un bloc à Bob : hors marché, sans toucher au cours, annoncé dans le journal', () => {
    const s = trio();
    const c = companyOf(s, 'a');
    const price = c.sharePrice;
    s.players.b.cash = 1e6;
    ok(s, 'a', { type: 'offerShares', companyId: c.id, counterpartyId: 'b', shares: 1000, price, side: 'sell' });
    const offer = s.offers![0];
    expect(offer).toMatchObject({ kind: 'shares', fromId: 'a', toId: 'b', status: 'pending' });
    // Seuls Alice et Bob voient l'offre.
    expect(getPlayerView(s, 'b').self!.offers).toHaveLength(1);
    expect(getPlayerView(s, 'c').self!.offers).toBeUndefined();
    ko(s, 'c', { type: 'answerOffer', offerId: offer.id, accept: true });
    const aCash = s.players.a.cash;
    ok(s, 'b', { type: 'answerOffer', offerId: offer.id, accept: true });
    expect(c.holdings.b).toBe(1000);
    expect(c.holdings.a).toBe(3000);
    expect(s.players.a.cash).toBeCloseTo(aCash + 1000 * price, 6);
    expect(c.sharePrice).toBe(price);
    expect(offer.status).toBe('accepted');
    const flash = s.journal.at(-1)!.articles.find((x) => x.event?.type === 'blockSale')!;
    expect(flash.event).toMatchObject({ actorId: 'b', subjectId: 'a', pct: 0.1 });
    // Une offre acceptée ne se rejoue pas ; les offres expirent à la clôture.
    ko(s, 'b', { type: 'answerOffer', offerId: offer.id, accept: true });
    resolveTurn(s);
    expect(s.offers).toEqual([]);
  });

  it('prix dans ± 25 % du cours, pas plus de 6 offres par trimestre, retrait et refus', () => {
    const s = trio();
    const c = companyOf(s, 'a');
    ko(s, 'a', { type: 'offerShares', companyId: c.id, counterpartyId: 'b', shares: 10, price: c.sharePrice * 2, side: 'sell' });
    ko(s, 'a', { type: 'offerShares', companyId: c.id, counterpartyId: 'a', shares: 10, price: c.sharePrice, side: 'sell' });
    ko(s, 'a', { type: 'offerShares', companyId: c.id, counterpartyId: 'b', shares: 999_999, price: c.sharePrice, side: 'sell' });
    for (let i = 0; i < 6; i++) ok(s, 'a', { type: 'offerShares', companyId: c.id, counterpartyId: 'b', shares: 10, price: c.sharePrice, side: 'sell' });
    ko(s, 'a', { type: 'offerShares', companyId: c.id, counterpartyId: 'b', shares: 10, price: c.sharePrice, side: 'sell' });
    const [first, second] = s.offers!;
    ko(s, 'b', { type: 'cancelOffer', offerId: first.id });
    ok(s, 'a', { type: 'cancelOffer', offerId: first.id });
    ok(s, 'b', { type: 'answerOffer', offerId: second.id, accept: false });
    expect([first.status, second.status]).toEqual(['cancelled', 'declined']);
  });

  it('Alice cède elle-même le contrôle à Bob : une passation, sans parachute', () => {
    const s = trio();
    const c = companyOf(s, 'a');
    s.players.b.cash = 1e9;
    ok(s, 'b', { type: 'buyShares', companyId: c.id, shares: 3000 });
    const cash = c.cash;
    const aliceCash = s.players.a.cash;
    // Bob propose d'acheter 2 001 actions à Alice : il passerait à 50,01 %.
    ok(s, 'b', { type: 'offerShares', companyId: c.id, counterpartyId: 'a', shares: 2001, price: c.sharePrice, side: 'buy' });
    ok(s, 'a', { type: 'answerOffer', offerId: s.offers![0].id, accept: true });
    expect(c.controllerId).toBe('b');
    const events = s.journal.at(-1)!.articles.map((x) => x.event?.type);
    expect(events).toContain('controlHandover');
    expect(events).not.toContain('takeover');
    expect(c.cash).toBe(cash);
    expect(s.players.a.cash).toBeCloseTo(aliceCash + 2001 * c.sharePrice, 6);
    expect(s.players.a.stats.parachutes).toBe(0);
    expect(c.turnFlags.exControllers).toContain('a');
  });

  it('se repasser le contrôle en boucle ne rapporte rien, et le rachat est un délit d’initié', () => {
    const s = trio();
    const c = companyOf(s, 'a');
    s.players.a.cash = 1e8;
    s.players.b.cash = 1e8;
    ok(s, 'b', { type: 'buyShares', companyId: c.id, shares: 3001 });
    const cash = c.cash;
    const pass = (from: string, to: string, n: number) => {
      ok(s, to, { type: 'offerShares', companyId: c.id, counterpartyId: from, shares: n, price: c.sharePrice * 0.75, side: 'buy' });
      ok(s, from, { type: 'answerOffer', offerId: s.offers!.at(-1)!.id, accept: true });
    };
    pass('a', 'b', 2000); // Bob : 5 001 actions, 50,01 %
    expect(c.controllerId).toBe('b');
    const scandal = c.scandal;
    pass('b', 'a', 3001); // Alice rachète au-delà de ce qu'elle vient de céder : 5 001 actions
    expect(c.controllerId).toBe('a');
    expect(c.scandal).toBeGreaterThan(scandal);
    expect(c.cash).toBe(cash);
    expect(s.players.a.stats.parachutes + s.players.b.stats.parachutes).toBe(0);
  });
});

describe('contrats de fourniture (§7 bis)', () => {
  it('Cleo vend le sucre de sa raffinerie à Alice ; livré à chaque clôture, avant la production', () => {
    const s = trio();
    const cleo = companyOf(s, 'c');
    const alice = companyOf(s, 'a');
    ok(s, 'c', { type: 'bidSite', companyId: cleo.id, slotId: 'sugar-2', amount: siteOpeningCost('sugar') });
    ok(s, 'c', { type: 'offerContract', sellerCompanyId: cleo.id, buyerCompanyId: alice.id, commodityId: 'sugar', lots: 10, price: 35, turns: 3 });
    expect(getPlayerView(s, 'a').self!.offers?.[0]).toMatchObject({ kind: 'contract', toId: 'a' });
    ok(s, 'a', { type: 'answerOffer', offerId: s.offers![0].id, accept: true });
    expect(s.contracts).toHaveLength(1);
    expect(getPlayerView(s, 'b').self!.contracts).toBeUndefined();
    resolveTurn(s); // raffinerie attribuée, en chantier : rien à livrer (sauf du stock préexistant, ici aucun)
    expect(s.contracts![0].lastDelivered).toBe(0);
    resolveTurn(s);
    expect(s.contracts![0].lastDelivered).toBe(10);
    // 10 lots entrent chez Alice au prix du contrat (les gadgets ne consomment pas de sucre) ;
    // la raffinerie de Cleo en a extrait 40, en a livré 10 et consommé une partie pour ses yaourts.
    expect(alice.inventory.sugar).toEqual({ lots: 10, avgCost: 35 });
    expect(cleo.inventory.sugar?.lots ?? 0).toBeLessThan(30);
    resolveTurn(s);
    expect(s.contracts).toEqual([]);
  });

  it('entre deux entreprises du même groupe, le contrat vaut sans offre ; les bornes sont vérifiées', () => {
    const s = trio();
    const alice = companyOf(s, 'a');
    const bob = companyOf(s, 'b');
    s.players.a.cash = 1e9;
    ok(s, 'a', { type: 'buyShares', companyId: bob.id, shares: 5001 });
    expect(bob.controllerId).toBe('a');
    const close = s.commodities.chips.priceHistory.at(-1)!;
    ok(s, 'a', { type: 'offerContract', sellerCompanyId: alice.id, buyerCompanyId: bob.id, commodityId: 'chips', lots: 5, price: close, turns: 2 });
    expect(s.offers ?? []).toEqual([]);
    expect(s.contracts).toHaveLength(1);
    ko(s, 'a', { type: 'offerContract', sellerCompanyId: alice.id, buyerCompanyId: bob.id, commodityId: 'chips', lots: 5, price: 1000, turns: 2 });
    ko(s, 'a', { type: 'offerContract', sellerCompanyId: alice.id, buyerCompanyId: alice.id, commodityId: 'chips', lots: 5, price: close, turns: 2 });
    ko(s, 'c', { type: 'offerContract', sellerCompanyId: alice.id, buyerCompanyId: bob.id, commodityId: 'chips', lots: 5, price: close, turns: 2 });
    // Prix de pleine concurrence entre ses propres entreprises : ± 10 % de la dernière clôture, même en gonflant le
    // cours dans le trimestre (sinon le contrat siphonnerait les actionnaires minoritaires de Bob Corp).
    expect(contractPriceRange('chips', s.commodities.chips, true)).toEqual([close * 0.9, close * 1.1]);
    const r = ko(s, 'a', { type: 'offerContract', sellerCompanyId: alice.id, buyerCompanyId: bob.id, commodityId: 'chips', lots: 5, price: close * 1.3, turns: 2 });
    expect(r.message).toMatch(/10 %/);
    alice.cash = 1e6;
    ok(s, 'a', { type: 'buyCommodity', companyId: alice.id, commodityId: 'chips', lots: 150 });
    expect(s.commodities.chips.price).toBeGreaterThan(close * 1.2);
    ko(s, 'a', { type: 'offerContract', sellerCompanyId: alice.id, buyerCompanyId: bob.id, commodityId: 'chips', lots: 5, price: s.commodities.chips.price, turns: 2 });
    // Entre deux dirigeants, la fourchette reste celle du prix de base (50 % à 150 %).
    expect(contractPriceRange('chips', s.commodities.chips, false)).toEqual([30, 90]);
  });
});

describe('contrats de fourniture : garde-fous (§7 bis)', () => {
  it('un seul contrat par paire et par matière : pas de contrats croisés pour faire tourner les mêmes lots', () => {
    const s = trio();
    const alice = companyOf(s, 'a');
    const bob = companyOf(s, 'b');
    s.players.a.cash = 1e9;
    ok(s, 'a', { type: 'buyShares', companyId: bob.id, shares: 5001 });
    const close = s.commodities.sugar.priceHistory.at(-1)!;
    ok(s, 'a', { type: 'offerContract', sellerCompanyId: bob.id, buyerCompanyId: alice.id, commodityId: 'sugar', lots: 50, price: close * 1.1, turns: 4 });
    const r = ko(s, 'a', { type: 'offerContract', sellerCompanyId: alice.id, buyerCompanyId: bob.id, commodityId: 'sugar', lots: 50, price: close * 0.9, turns: 4 });
    expect(r.message).toMatch(/un seul à la fois/);
    ko(s, 'a', { type: 'offerContract', sellerCompanyId: bob.id, buyerCompanyId: alice.id, commodityId: 'sugar', lots: 10, price: close, turns: 2 });
    expect(s.contracts).toHaveLength(1);
  });

  it('ce qu’on reçoit par contrat ne repart qu’au trimestre suivant ; un lot manquant coûte un dédit', () => {
    const s = trio();
    const [alice, bob, cleo] = [companyOf(s, 'a'), companyOf(s, 'b'), companyOf(s, 'c')];
    const close = s.commodities.sugar.priceHistory.at(-1)!;
    // Cleo a 30 lots de sucre et en vend 30 à Alice ; Alice en revend 30 à Bob, sans en avoir.
    cleo.inventory.sugar = { lots: 30, avgCost: close };
    ok(s, 'c', { type: 'offerContract', sellerCompanyId: cleo.id, buyerCompanyId: alice.id, commodityId: 'sugar', lots: 30, price: close, turns: 1 });
    ok(s, 'a', { type: 'answerOffer', offerId: s.offers!.at(-1)!.id, accept: true });
    ok(s, 'a', { type: 'offerContract', sellerCompanyId: alice.id, buyerCompanyId: bob.id, commodityId: 'sugar', lots: 30, price: close * 0.8, turns: 1 });
    ok(s, 'b', { type: 'answerOffer', offerId: s.offers!.at(-1)!.id, accept: true });
    const [toAlice, toBob] = s.contracts!;
    const cashA = alice.cash;
    const cashB = bob.cash;
    const spot = s.commodities.sugar.price;
    deliverContracts(s);
    expect(toAlice.lastDelivered).toBe(30);
    expect(toBob.lastDelivered).toBe(0);
    const penalty = 30 * Math.max(0, spot * 1.1 - close * 0.8);
    expect(toBob.lastPenalty).toBeCloseTo(penalty, 6);
    // Le dédit est versé tout de suite à Bob ; Alice le doit, comme une amende, à la clôture suivante (§5.7).
    expect(alice.cash).toBeCloseTo(cashA - 30 * close, 6);
    expect(alice.finesDue).toBeCloseTo(penalty, 6);
    expect(bob.cash).toBeCloseTo(cashB + penalty, 6);
    expect(alice.inventory.sugar?.lots).toBe(30);
  });
});

describe('ententes sur les prix (§7 bis)', () => {
  it('les membres voient les prix du trimestre en cours les uns des autres ; les autres, ceux du trimestre précédent', () => {
    const s = trio();
    const alice = companyOf(s, 'a');
    const bob = companyOf(s, 'b');
    const bobGadget = bob.products[0];
    ok(s, 'b', { type: 'setProductDecisions', companyId: bob.id, productId: bobGadget.id, price: bobGadget.price * 1.2 });
    const shown = (who: string) => getPlayerView(s, who).companies.find((x) => x.id === bob.id)!.products[0].price;
    expect(shown('a')).toBeCloseTo(bobGadget.lastPrice ?? 0, 6);
    ok(s, 'a', { type: 'proposeCartel', companyId: alice.id, targetCompanyId: bob.id, sectorId: 'gadgets' });
    ok(s, 'b', { type: 'answerOffer', offerId: s.offers![0].id, accept: true });
    expect(s.cartels).toHaveLength(1);
    expect(shown('a')).toBeCloseTo(bobGadget.price, 6);
    expect(shown('c')).toBeCloseTo(bobGadget.lastPrice ?? 0, 6);
    // Secrète : Cleo n'en sait rien.
    expect(getPlayerView(s, 'c').self!.cartels).toBeUndefined();
    const mine = getPlayerView(s, 'a').self!.cartels!;
    expect(mine[0]).toMatchObject({ sectorId: 'gadgets', risk: cartelRisk(2, 0) });
    // Une entreprise hors du secteur ne peut pas s'y joindre.
    ko(s, 'a', { type: 'proposeCartel', companyId: alice.id, targetCompanyId: companyOf(s, 'c').id, sectorId: 'gadgets' });
    // Sortir ne prend effet qu'à la clôture : d'ici là, on voit toujours les prix et on court le risque du trimestre.
    ok(s, 'b', { type: 'leaveCartel', companyId: bob.id, sectorId: 'gadgets' });
    ko(s, 'b', { type: 'leaveCartel', companyId: bob.id, sectorId: 'gadgets' });
    expect(s.cartels).toHaveLength(1);
    expect(shown('a')).toBeCloseTo(bobGadget.price, 6);
    expect(getPlayerView(s, 'b').self!.cartels![0].members.find((m) => m.companyId === bob.id)?.leaving).toBe(true);
    resolveTurn(s);
    expect(s.cartels).toEqual([]);
    // Le trimestre de la sortie compte dans le passé d'entente (le tirage a eu lieu avec Bob dedans).
    expect(bob.cartelQuarters ?? 0).toBe(alice.cartelQuarters ?? 0);
  });

  it('seeded detection triggers fines, scandal, an article and cartel dissolution on the current economy', () => {
    let caught = 0, escaped = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(seed, [human('a', 'gadgets', 'Alice'), human('b', 'gadgets', 'Bob'), human('c', 'yogurts', 'Cleo')]);
      const alice = companyOf(s, 'a'), bob = companyOf(s, 'b');
      ok(s, 'a', { type: 'proposeCartel', companyId: alice.id, targetCompanyId: bob.id, sectorId: 'gadgets' });
      ok(s, 'b', { type: 'answerOffer', offerId: s.offers![0].id, accept: true });
      // A closing quarter excludes the next news issue, while every draw in the
      // economic resolution and the detector still uses the real seeded RNG.
      s.config.totalTurns = s.turn;
      s.activeEffects = [];
      for (const company of Object.values(s.companies)) company.scandal = 0;
      const clone = structuredClone(s);
      resolveTurn(s); resolveTurn(clone);
      expect(s.rngState).toBe(clone.rngState);
      expect(s.cartels).toEqual(clone.cartels);
      const article = s.journal.at(-1)!.articles.find((x) => x.event?.type === 'cartelBusted');
      if (!article) {
        escaped++;
        expect(s.cartels).toHaveLength(1);
        expect(alice.cartelQuarters).toBe(1);
        expect(alice.reports.at(-1)!.fines).toBe(0);
        continue;
      }
      caught++;
      expect(s.cartels).toEqual([]);
      expect(article.kind).toBe('results');
      expect(new Set(article.companyIds)).toEqual(new Set([alice.id, bob.id]));
      expect(new Set(article.event!.leaderIds)).toEqual(new Set(['a', 'b']));
      expect(article.event!.amount).toBeGreaterThanOrEqual(2 * CARTEL_FINE_MIN);
      expect(alice.scandal).toBe(CARTEL_SCANDAL);
      expect(bob.scandal).toBe(CARTEL_SCANDAL);
      expect(alice.reports.at(-1)!.fines).toBeGreaterThanOrEqual(CARTEL_FINE_MIN);
    }
    expect(caught).toBeGreaterThan(0);
    expect(escaped).toBeGreaterThan(0);
  });

  it('un non-membre ne peut ni rejoindre ni sonder une entente ; un membre peut inviter', () => {
    const s = newGame(9, [human('a', 'gadgets', 'Ada'), human('b', 'gadgets', 'Bea'), human('c', 'gadgets', 'Cid')]);
    const [ada, bea, cid] = [companyOf(s, 'a'), companyOf(s, 'b'), companyOf(s, 'c')];
    ok(s, 'b', { type: 'proposeCartel', companyId: bea.id, targetCompanyId: cid.id, sectorId: 'gadgets' });
    ok(s, 'c', { type: 'answerOffer', offerId: s.offers!.at(-1)!.id, accept: true });
    // Ada propose à Bea : l'envoi ne dit rien de l'entente de Bea…
    ok(s, 'a', { type: 'proposeCartel', companyId: ada.id, targetCompanyId: bea.id, sectorId: 'gadgets' });
    // … et Bea ne peut pas accepter (elle, elle sait pourquoi).
    const r = ko(s, 'b', { type: 'answerOffer', offerId: s.offers!.at(-1)!.id, accept: true });
    expect(r.message).toMatch(/autre entente/);
    expect(getPlayerView(s, 'a').self!.cartels).toBeUndefined();
    // Bea, membre, invite Ada : Ada rejoint l'entente et en voit les membres.
    ok(s, 'b', { type: 'answerOffer', offerId: s.offers!.at(-1)!.id, accept: false });
    ok(s, 'b', { type: 'proposeCartel', companyId: bea.id, targetCompanyId: ada.id, sectorId: 'gadgets' });
    ok(s, 'a', { type: 'answerOffer', offerId: s.offers!.at(-1)!.id, accept: true });
    expect(new Set(getPlayerView(s, 'a').self!.cartels![0].members.map((m) => m.companyId))).toEqual(new Set([ada.id, bea.id, cid.id]));
    expect(getPlayerView(s, 'a').self!.cartels![0].risk).toBeCloseTo(cartelRisk(3, 0), 6);
  });

  it('un bot déjà en entente décline sans rien révéler', () => {
    const s = newGame(7, [human('h', 'gadgets', 'Ada'), human('z', 'gadgets', 'Zoé'), ...bots(3)]);
    const magouillac = companyOf(s, 'bot3');
    if (!magouillac.products.some((p) => p.sectorId === 'gadgets')) magouillac.products[0].sectorId = 'gadgets';
    ok(s, 'z', { type: 'proposeCartel', companyId: companyOf(s, 'z').id, targetCompanyId: magouillac.id, sectorId: 'gadgets' });
    expect(s.offers!.at(-1)!.status).toBe('accepted');
    ok(s, 'h', { type: 'proposeCartel', companyId: companyOf(s, 'h').id, targetCompanyId: magouillac.id, sectorId: 'gadgets' });
    expect(s.offers!.at(-1)!.status).toBe('declined');
    expect(getPlayerView(s, 'h').self!.cartels).toBeUndefined();
    expect(s.cartels![0].members).toHaveLength(2);
  });

  it('le risque grandit avec le nombre de membres et le passé d’entente, plafonné', () => {
    expect(cartelRisk(2, 0)).toBeCloseTo(0.06, 6);
    expect(cartelRisk(4, 0)).toBeCloseTo(0.12, 6);
    expect(cartelRisk(2, 5)).toBeCloseTo(0.16, 6);
    expect(cartelRisk(9, 27)).toBeCloseTo(0.35, 6);
  });

  it('quitter l’entente puis la reformer n’efface pas le passé', () => {
    const s = trio();
    const alice = companyOf(s, 'a');
    const bob = companyOf(s, 'b');
    const sign = () => {
      ok(s, 'a', { type: 'proposeCartel', companyId: alice.id, targetCompanyId: bob.id, sectorId: 'gadgets' });
      ok(s, 'b', { type: 'answerOffer', offerId: s.offers!.at(-1)!.id, accept: true });
    };
    sign();
    // Deux clôtures en entente sans se faire prendre (graine fixe) : chacun porte deux trimestres de passé.
    let closes = 0;
    while (closes < 2 && (s.cartels ?? []).length > 0) {
      resolveTurn(s);
      closes++;
    }
    expect(s.cartels, 'graine à changer : entente découverte trop tôt').toHaveLength(1);
    expect([alice.cartelQuarters, bob.cartelQuarters]).toEqual([2, 2]);
    ok(s, 'b', { type: 'leaveCartel', companyId: bob.id, sectorId: 'gadgets' });
    resolveTurn(s);
    expect(s.cartels, 'graine à changer : entente découverte à la clôture de la sortie').toEqual([]);
    expect([alice.cartelQuarters, bob.cartelQuarters]).toEqual([3, 3]);
    sign();
    expect(getPlayerView(s, 'a').self!.cartels![0].risk).toBeCloseTo(cartelRisk(2, 3), 6);
    // Le passé ne se voit pas dans la vue publique.
    expect(JSON.stringify(getPlayerView(s, 'c'))).not.toContain('cartelQuarters');
  });
});

describe('bots et tractations (§10)', () => {
  it.each([false, true])('normal offers and the cartel anchor remain effective (excess stock: %s)', (liquidating) => {
    // bot1 = Tweetard (combines 0,35), bot3 = Magouillac (combines 0,85).
    const s = newGame(9, [human('h', 'gadgets', 'Ada'), ...bots(3).map((b) => ({ ...b, sectorId: 'gadgets' as const }))]);
    const mine = companyOf(s, 'h');
    const tweetard = companyOf(s, 'bot1');
    const magouillac = companyOf(s, 'bot3');
    const persona = getContent(s.config.lang ?? 'fr').bots.find((p) => p.id === s.players.bot3.botPersonalityId)!;
    const def = SECTORS.gadgets;
    const sensitivity = def.elasticity + 0.5 * (def.marketElasticity ?? 0);
    const markup = Math.max(0.75, Math.min(1.5, (4.5 / Math.max(sensitivity, 1)) ** 0.35));
    const usualPrice = def.refPrice * persona.pricePremium * markup;
    // Start at the documented ordinary anchor so the agreed floor is binding.
    // The paired control has the same RNG state and prices, but no agreement.
    magouillac.products[0].price = usualPrice;
    if (liquidating) {
      magouillac.products[0].stock = 30 * magouillac.products[0].capacity;
      magouillac.products[0].production = 0;
      magouillac.products[0].lastUnitCost = def.refPrice * 2;
    }
    ok(s, 'h', { type: 'proposeCartel', companyId: mine.id, targetCompanyId: tweetard.id, sectorId: 'gadgets' });
    expect(s.offers!.at(-1)!.status).toBe('declined');
    ok(s, 'h', { type: 'proposeCartel', companyId: mine.id, targetCompanyId: magouillac.id, sectorId: 'gadgets' });
    expect(s.offers!.at(-1)!.status).toBe('accepted');
    expect(s.cartels).toHaveLength(1);
    // Au trimestre suivant, Magouillac tient le prix convenu : jamais sous 110 % de son prix habituel.
    const next = structuredClone(s);
    const ordinary = structuredClone(s);
    ordinary.cartels = [];
    resolveTurn(ordinary);
    resolveTurn(next);
    expect(next.cartels, 'graine à changer : entente découverte dès la première clôture').toHaveLength(1);
    const gadget = companyOf(next, 'bot3').products.find((p) => p.sectorId === 'gadgets')!;
    expect(gadget.price).toBeGreaterThanOrEqual(usualPrice * 1.1 - 0.01);
    const uncoordinated = companyOf(ordinary, 'bot3').products.find((p) => p.sectorId === 'gadgets')!;
    expect(uncoordinated.price).toBeLessThan(usualPrice * 1.1 - 0.01);
    expect(gadget.price).toBeGreaterThan(uncoordinated.price + 0.01);
    if (liquidating) {
      expect(gadget.production).toBe(0);
      expect(uncoordinated.production).toBe(0);
      expect(gadget.price).toBeLessThan(gadget.lastUnitCost);
    }
    // Actions : le bot achète un bloc au cours s'il a de quoi.
    s.players.bot1.cash = 1e6;
    ok(s, 'h', { type: 'offerShares', companyId: mine.id, counterpartyId: 'bot1', shares: 500, price: mine.sharePrice, side: 'sell' });
    expect(s.offers!.at(-1)!.status).toBe('accepted');
    expect(mine.holdings.bot1).toBe(500);
    // … mais ne lâche pas sa propre entreprise.
    s.players.h.cash = 1e6;
    ok(s, 'h', { type: 'offerShares', companyId: tweetard.id, counterpartyId: 'bot1', shares: 100, price: tweetard.sharePrice * 1.2, side: 'buy' });
    expect(s.offers!.at(-1)!.status).toBe('declined');
  });

  it('un bot n’achète jamais un bloc de l’entreprise qu’il dirige (ce serait un délit d’initié)', () => {
    const s = newGame(7, [human('h', 'gadgets', 'Ada'), ...bots(3)]);
    const theirs = companyOf(s, 'bot2');
    s.players.h.cash = 1e8;
    s.players.bot2.cash = 1e8;
    ok(s, 'h', { type: 'buyShares', companyId: theirs.id, shares: 700 });
    const scandal = theirs.scandal;
    ok(s, 'h', { type: 'offerShares', companyId: theirs.id, counterpartyId: 'bot2', shares: 700, price: theirs.priceHistory.at(-1)!, side: 'sell' });
    expect(s.offers!.at(-1)!.status).toBe('declined');
    expect(theirs.scandal).toBe(scandal);
  });

  it('un bot ne se fait pas avoir par un cours gonflé dans le trimestre', () => {
    const s = newGame(7, [human('h', 'gadgets', 'Ada'), ...bots(3)]);
    const target = companyOf(s, 'bot2');
    s.players.h.cash = 1e8;
    s.players.bot1.cash = 1e8;
    const close = target.priceHistory.at(-1)!;
    // Ada achète en bourse (le cours monte), puis propose ses actions au bot au cours du moment.
    ok(s, 'h', { type: 'buyShares', companyId: target.id, shares: 1500 });
    expect(target.sharePrice).toBeGreaterThan(close * 1.1);
    ok(s, 'h', { type: 'offerShares', companyId: target.id, counterpartyId: 'bot1', shares: 1000, price: target.sharePrice, side: 'sell' });
    expect(s.offers!.at(-1)!.status).toBe('declined');
    // À l'inverse, casser le cours puis racheter au bot au prix cassé ne marche pas non plus : le bot détient des
    // actions de l'entreprise d'Ada, qui en vend en bourse pour faire plonger le cours.
    const mine = companyOf(s, 'h');
    const mineClose = mine.priceHistory.at(-1)!;
    ok(s, 'bot1', { type: 'buyShares', companyId: mine.id, shares: 800 });
    ok(s, 'h', { type: 'sellShares', companyId: mine.id, shares: 2500 });
    const low = mine.sharePrice;
    expect(low * 1.1).toBeLessThan(mineClose);
    ok(s, 'h', { type: 'offerShares', companyId: mine.id, counterpartyId: 'bot1', shares: 500, price: low * 1.1, side: 'buy' });
    expect(s.offers!.at(-1)!.status).toBe('declined');
  });

  it('un bot n’achète par contrat que ses besoins, sous le cours de la clôture et le prix de base', () => {
    const s = newGame(7, [human('h', 'gadgets', 'Ada'), ...bots(3)]);
    const mine = companyOf(s, 'h');
    const buyer = Object.values(s.companies).find((c) => c.controllerId !== null && s.players[c.controllerId]?.isBot && capacityNeed(c, 'chips') >= 2)!;
    expect(buyer).toBeDefined();
    // Ses besoins se lisent sur sa capacité (publique), pas sur sa production prévue (secrète).
    const need = Math.floor(capacityNeed(buyer, 'chips'));
    // Cours des puces au prix de base au départ : les news du premier numéro ne doivent pas fausser le scénario.
    s.commodities.chips.price = 60;
    s.commodities.chips.priceHistory[s.commodities.chips.priceHistory.length - 1] = 60;
    const close = s.commodities.chips.priceHistory.at(-1)!;
    const fair = Math.min(close, 60) * 0.9;
    const offer = (lots: number, price: number) => {
      ok(s, 'h', { type: 'offerContract', sellerCompanyId: mine.id, buyerCompanyId: buyer.id, commodityId: 'chips', lots, price, turns: 8 });
      return s.offers!.at(-1)!.status;
    };
    // Ada fait flamber les puces en bourse, puis veut verrouiller ce prix pour huit trimestres : refusé.
    mine.cash = 1e6;
    ok(s, 'h', { type: 'buyCommodity', companyId: mine.id, commodityId: 'chips', lots: 150 });
    expect(offer(need, s.commodities.chips.price * 0.97)).toBe('declined');
    // Plus que ses besoins : refusé ; ses besoins à un prix honnête : signé ; au-delà, ses besoins sont couverts.
    expect(offer(need + 1, fair)).toBe('declined');
    expect(offer(need, fair)).toBe('accepted');
    // Un seul contrat par paire et par matière.
    ko(s, 'h', { type: 'offerContract', sellerCompanyId: mine.id, buyerCompanyId: buyer.id, commodityId: 'chips', lots: 1, price: fair, turns: 8 });
  });
});
