import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { decisionText } from '../src/i18n/decisionReadability';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_COLORS,
  SITE_OPENING_COST_MULT,
  SITE_DORMANT_UPKEEP,
  SITE_UNIT_COST_RATIO,
  COMMODITIES,
  COMMODITY_IDS,
  applyAction,
  createGame,
  getContent,
  getPlayerView,
  resolveTurn,
  slotCapacity,
  type Action,
  type CommodityId,
  type GameState,
  type Lang,
  type LobbyPlayer,
  type PlayerView,
  type SectorId,
} from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { fmtFor, parseNumber } from '../src/fmt';
import { messages } from '../src/i18n';
import { pctDigits } from '../src/rules';
import { DealsTab } from '../src/screens/game/DealsTab';
import { DepositPanel, commodityNeed } from '../src/screens/game/DepositPanel';
import { defaultSlot, depositPayback, depositSavings } from '../src/screens/game/sitesPickerModel';
import { eventText, nameAt, timelineEntries, type TimelineEntry } from '../src/screens/game/timeline/model';
import { getState, setState, type AppState } from '../src/store';

/**
 * useState piloté par le test (même technique que test/amount-form.test.ts) : `values[i]` force le i-ème
 * appel (ordre de rendu), sinon la valeur initiale. Les tests des filiales rendent DepositPanel (la fiche
 * de gisement que monte la carte) avec ses valeurs par défaut — la mise en page « ordinateur » sans jsdom.
 */
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.cursor++;
      const v = i < hooks.values.length ? hooks.values[i] : typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [v, vi.fn()];
    },
  };
});

// Le store client n'a pas de snapshot SSR : seul son abonnement React est remplacé.
vi.mock('../src/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/store')>();
  return { ...actual, useApp: <T,>(selector: (state: AppState) => T): T => selector(actual.getState()) };
});

const initialState = getState();
afterEach(() => setState(initialState));

const escaped = (text: string) => renderToStaticMarkup(createElement(Fragment, null, text));

function seat(id: string, name: string, companyName: string, sectorId: SectorId, i: number): LobbyPlayer {
  return { id, name, isBot: false, companyName, sectorId, connected: true, color: PLAYER_COLORS[i] };
}

function ok(g: GameState, who: string, a: Action): void {
  const r = applyAction(g, who, a);
  expect(r.ok, r.message).toBe(true);
}

/**
 * Ada et Bob font des gadgets, Cleo des yaourts. Ada propose 500 actions à Bob (en attente) ; Cleo mise sur une raffinerie
 * de sucre et signe un contrat avec Ada ; Ada et Bob s'entendent sur le prix des gadgets.
 */
function dealsGame(lang: Lang, seed = 5) {
  const g = createGame({ seed, totalTurns: 16, turnSeconds: 90, startYear: 2027, lang }, [
    seat('ada', 'Ada', 'Atelier Ada', 'gadgets', 0),
    seat('bob', 'Bob', 'Bob Corp', 'gadgets', 1),
    seat('cleo', 'Cleo', 'Cleo SA', 'yogurts', 2),
  ]);
  const of = (id: string) => Object.values(g.companies).find((c) => c.founderId === id)!;
  const [ada, bob, cleo] = [of('ada'), of('bob'), of('cleo')];
  g.players.bob.cash = 1e6;
  ok(g, 'ada', { type: 'offerShares', companyId: ada.id, counterpartyId: 'bob', shares: 500, price: ada.sharePrice, side: 'sell' });
  ok(g, 'cleo', { type: 'bidSite', companyId: cleo.id, slotId: 'sugar-2', amount: COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT });
  ok(g, 'cleo', { type: 'offerContract', sellerCompanyId: cleo.id, buyerCompanyId: ada.id, commodityId: 'sugar', lots: 10, price: 35, turns: 3 });
  ok(g, 'ada', { type: 'answerOffer', offerId: g.offers!.at(-1)!.id, accept: true });
  ok(g, 'ada', { type: 'proposeCartel', companyId: ada.id, targetCompanyId: bob.id, sectorId: 'gadgets' });
  ok(g, 'bob', { type: 'answerOffer', offerId: g.offers!.at(-1)!.id, accept: true });
  return { g, ada, bob, cleo };
}

function render(view: PlayerView, uiLang: Lang, node: ReturnType<typeof createElement>, values: unknown[] = []): string {
  hooks.values = values;
  hooks.cursor = 0;
  setState({ lang: uiLang, view, lobby: null });
  return renderToStaticMarkup(createElement(GameProvider, { view, children: node }));
}

const deals = (g: GameState, who: string, uiLang: Lang) => render(getPlayerView(g, who), uiLang, createElement(DealsTab));

describe.each([
  { uiLang: 'fr' as const, roomLang: 'fr' as const },
  { uiLang: 'en' as const, roomLang: 'fr' as const },
  { uiLang: 'en' as const, roomLang: 'en' as const },
])('onglet Tractations : interface $uiLang, partie $roomLang', ({ uiLang, roomLang }) => {
  const { g, ada, bob, cleo } = dealsGame(roomLang);
  const t = messages(uiLang);
  const fmt = fmtFor(roomLang);
  const content = getContent(uiLang);
  const shares = t.deals.sharesDeal(fmt.int(500), ada.name, fmt.sharePrice(ada.sharePrice), fmt.money(500 * ada.sharePrice));
  const contract = t.deals.contract(cleo.name, ada.name, fmt.int(10), content.commodities.sugar.name, fmt.money(35), 3);
  const cartel = t.deals.cartelMembers(content.sectors.gadgets.name, `${ada.name}, ${bob.name}`);
  // Gisement libre le plus riche d'une matière, en l'absence de filiale ou de mise en attente.
  const richestFree = (view: PlayerView, cid: CommodityId) =>
    view.siteSlots.filter((s) => s.commodityId === cid && !s.companyId).sort((a, b) => slotCapacity(b.id) - slotCapacity(a.id))[0];

  it('Bob reçoit l’offre d’Ada, avec de quoi répondre, et voit l’entente qu’il a signée', () => {
    const html = deals(g, 'bob', uiLang);
    expect(html).toContain(escaped(t.deals.from('Ada')));
    expect(html).toContain(escaped(shares));
    expect(html).toContain(escaped(t.deals.sellerBuyer('Ada', t.common.you)));
    expect(html).toContain(`>${escaped(t.deals.accept)}</button>`);
    expect(html).toContain(`>${escaped(t.deals.decline)}</button>`);
    expect(html).toContain(escaped(t.deals.badge(1)));
    // L'entente acceptée reste dans la liste, avec son issue, et le risque de la prochaine clôture.
    expect(html).toContain(escaped(t.deals.status.accepted));
    expect(html).toContain(escaped(cartel));
    const risk = getPlayerView(g, 'bob').self!.cartels![0].risk;
    expect(html).toContain(`<strong>${escaped(fmt.pct(risk, 0))}</strong>`);
    expect(html).toContain(`>${escaped(t.deals.leave)}</button>`);
    // Le contrat de Cleo et d'Ada ne le regarde pas : pas de section « Contrats en cours » vide.
    expect(html).not.toContain(`<h3>${escaped(t.deals.contracts)}</h3>`);
    expect(html).toContain(`<h3>${escaped(t.deals.cartels)}</h3>`);
    expect(html).not.toContain(escaped(contract));
    // Une offre reçue attend sa réponse : les offres passent avant le formulaire.
    expect(html.indexOf(`<h3>${escaped(t.deals.incoming)}</h3>`)).toBeLessThan(html.indexOf(`<h3>${escaped(t.deals.propose)}</h3>`));
  });

  it('le prix proposé s’écrit avec la décimale de l’interface (« 5,16 » en français), relu tel quel', () => {
    const html = deals(g, 'ada', uiLang);
    const price = html.match(/id="deal-share-price"[^>]*value="([^"]*)"/)?.[1] ?? '';
    // Le cours d'Atelier Ada a des centimes : la décimale de la langue de l'interface, pas celle du salon.
    expect(price).toMatch(uiLang === 'fr' ? /^\d+,\d{1,2}$/ : /^\d+\.\d{1,2}$/);
    expect(parseNumber(price, uiLang)).toBe(Math.round(getPlayerView(g, 'ada').companies.find((c) => c.id === ada.id)!.sharePrice * 100) / 100);
  });

  it('Ada voit son offre en attente (à retirer), le contrat signé avec Cleo et l’entente', () => {
    const html = deals(g, 'ada', uiLang);
    expect(html).toContain(escaped(t.deals.to('Bob')));
    expect(html).toContain(escaped(shares));
    expect(html).toContain(`>${escaped(t.deals.cancel)}</button>`);
    expect(html).not.toContain(`>${escaped(t.deals.accept)}</button>`);
    expect(html).toContain(escaped(t.deals.from('Cleo')));
    expect(html).toContain(escaped(contract));
    // Contrats en cours : la durée n'apparaît qu'une fois, en « encore N trimestres ».
    expect(html).toContain(escaped(t.deals.contractLine(cleo.name, ada.name, fmt.int(10), content.commodities.sugar.name, fmt.money(35))));
    expect(html).toContain(escaped(t.deals.turnsLeft(3)));
    expect(html).toContain(escaped(cartel));
    // Rien à accepter : pas de pastille.
    expect(html).not.toContain(escaped(t.deals.badge(1)));
  });

  it('Cleo ne voit ni l’offre d’actions ni l’entente, seulement son contrat', () => {
    const html = deals(g, 'cleo', uiLang);
    expect(html).not.toContain(escaped(shares));
    expect(html).not.toContain(escaped(cartel));
    expect(html).not.toContain(`<h3>${escaped(t.deals.cartels)}</h3>`);
    expect(html).toContain(`<h3>${escaped(t.deals.contracts)}</h3>`);
    expect(html).toContain(escaped(contract));
    // Une offre envoyée (acceptée) : les deux listes restent, la vide avec sa phrase.
    expect(html).toContain(escaped(t.deals.noIncoming));
    expect(html).not.toContain(escaped(t.deals.noOffers));
    // Rien à répondre : le formulaire d'abord.
    expect(html.indexOf(`<h3>${escaped(t.deals.propose)}</h3>`)).toBeLessThan(html.indexOf(`<h3>${escaped(t.deals.incoming)}</h3>`));
  });

  it('sans offre, contrat ni entente : le formulaire, puis une seule ligne', () => {
    const quiet = createGame({ seed: 7, totalTurns: 8, turnSeconds: 90, startYear: 2027, lang: roomLang }, [
      seat('ada', 'Ada', 'Atelier Ada', 'gadgets', 0),
      seat('bob', 'Bob', 'Bob Corp', 'yogurts', 1),
    ]);
    const html = deals(quiet, 'ada', uiLang);
    expect(html).toContain(escaped(t.deals.noOffers));
    for (const title of [t.deals.incoming, t.deals.outgoing, t.deals.contracts, t.deals.cartels]) expect(html).not.toContain(`<h3>${escaped(title)}</h3>`);
    expect(html).not.toContain(escaped(t.deals.noIncoming));
    expect(html.indexOf(`<h3>${escaped(t.deals.propose)}</h3>`)).toBeLessThan(html.indexOf(escaped(t.deals.noOffers)));
  });

  it('Bob demande à sortir de l’entente : elle court jusqu’à la clôture', () => {
    const g2 = structuredClone(g);
    ok(g2, 'bob', { type: 'leaveCartel', companyId: bob.id, sectorId: 'gadgets' });
    const html = deals(g2, 'bob', uiLang);
    expect(html).toContain(escaped(cartel));
    expect(html).toContain(escaped(t.deals.leaving));
    expect(html).not.toContain(`>${escaped(t.deals.leave)}</button>`);
    // Ada, elle, reste membre et voit toujours l'entente.
    expect(deals(g2, 'ada', uiLang)).toContain(`>${escaped(t.deals.leave)}</button>`);
  });

  it('un joueur sans entreprise est prévenu', () => {
    const view = getPlayerView(g, 'bob');
    const html = render({ ...view, self: undefined }, uiLang, createElement(DealsTab));
    expect(html).toContain(escaped(t.deals.noCompany));
  });

  it('les filiales : besoins par matière, et la fiche du gisement de la mise de Cleo (DepositPanel)', () => {
    const view = getPlayerView(g, 'cleo');
    const mine = view.companies.find((c) => c.id === cleo.id)!;
    // La fiche d'un gisement, comme la monte la carte dans son panneau latéral.
    const fiche = (v: PlayerView, slotId: string, company = v.companies.find((c) => c.id === cleo.id)!) =>
      render(v, uiLang, createElement(DepositPanel, { company, slot: v.siteSlots.find((s) => s.id === slotId)! }));
    const reserve = COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT;
    // Le besoin de l'entreprise, matière par matière.
    for (const cid of COMMODITY_IDS) {
      const need = commodityNeed(mine, cid);
      // Les yaourts mangent du sucre et un peu de pétrole ; ni puces ni lithium.
      expect(need > 0).toBe(cid === 'sugar' || cid === 'oil');
    }
    // La fiche du gisement de sa mise en attente sur le sucre : libre, mise affichée, modifiable ou retirable.
    const defSugar = view.siteSlots.find((s) => s.id === 'sugar-2')!;
    const html = fiche(view, 'sugar-2');
    expect(html).toContain(escaped(t.sitesPicker.statusFree(slotCapacity(defSugar.id))));
    expect(html).toContain(escaped(t.sites.pending(fmt.money(reserve), defSugar.name)));
    expect(html).toContain(`aria-label="${escaped(t.sites.withdrawAria(t.sites.names.sugar))}"`);
    expect(html).toContain(`>${escaped(t.sites.bidChange)}</button>`);
    // La fiche dit le besoin couvert et la mise à prix (remboursement calculé par le modèle).
    const needSugar = commodityNeed(mine, 'sugar');
    expect(html).toContain(escaped(t.sitesPicker.needLine(fmt.int(needSugar), fmt.int(Math.min(needSugar, slotCapacity(defSugar.id))))));
    const sav = depositSavings(view, mine, defSugar.id);
    const pb = depositPayback(reserve, sav.total, view.config.totalTurns - view.turn);
    const decision = decisionText(uiLang);
    expect(html).toContain(escaped(pb.quarters === null ? decision.noPayback : decision.quarters(pb.quarters)));
    expect(html).toContain(escaped(decision.depositConditions));
    if (pb.never && pb.quarters !== null) expect(html).toContain(escaped(decision.latePayback));
    // Les autres matières invitent à miser : le lithium (sans besoin) annonce que tout partirait au marché,
    // le pétrole montre ce que coûterait l'extraction ce trimestre sur le gisement libre le plus riche.
    const lithium = fiche(view, richestFree(view, 'lithium').id);
    expect(lithium).toContain(`>${escaped(t.sitesPicker.bidCta)}</button>`);
    expect(lithium).not.toContain(escaped(t.sites.pending(fmt.money(reserve), defSugar.name)));
    const market = view.commodities.find((c) => c.id === 'lithium')!.price;
    expect(lithium).toContain(escaped(t.sitesPicker.needNoneMarket(fmt.money(market))));
    expect(lithium).toContain(`<dt>${escaped(decision.reserve)}</dt><dd>${escaped(fmt.money(COMMODITIES.lithium.basePrice * SITE_OPENING_COST_MULT))}</dd>`);
    // Cette entreprise ne peut pas payer la réserve : pas de budget ni de remboursement promis.
    expect(lithium).toContain(`<dt>${escaped(decision.maximum)}</dt><dd>—</dd>`);
    expect(lithium).toContain(`<dt>${escaped(decision.payback)}</dt><dd>—</dd>`);
    expect(lithium).toContain(escaped(t.sites.noCash));
    const oilTarget = richestFree(view, 'oil');
    const oil = fiche(view, oilTarget.id);
    expect(oil).toContain(escaped(t.sitesPicker.statusFree(slotCapacity(oilTarget.id))));
    expect(oil).toContain(escaped(t.sitesPicker.extraction(fmt.money(COMMODITIES.oil.basePrice * SITE_UNIT_COST_RATIO))));
    // Après la clôture, la raffinerie est à Cleo : fiche « en service » avec le prix de l'enchère ;
    // la mise n'a plus de formulaire.
    const later = structuredClone(g);
    resolveTurn(later);
    const after = getPlayerView(later, 'cleo');
    const slot = after.siteSlots.find((x) => x.companyId === cleo.id)!;
    const won = fiche(after, slot.id);
    expect(won).toContain(escaped(t.sitesPicker.statusTaken(cleo.name, slotCapacity(slot.id))));
    expect(won).toContain(escaped(t.sites.active));
    expect(won).toContain(`aria-label="${escaped(t.sites.sleepAria(t.sites.names.sugar))}"`);
    expect(won).toContain(escaped(t.sites.wonAt(fmt.money(reserve), 1)));
    expect(won).not.toContain(`>${escaped(t.sites.bidChange)}</button>`);
    expect(won).not.toContain('class="amount-form"');
    // Un rival voit la même filiale, à son nom, sans en connaître la mise ni pouvoir miser.
    const rival = getPlayerView(later, 'ada');
    const html3 = render(rival, uiLang, createElement(DepositPanel, {
      company: rival.companies.find((c) => c.id === ada.id)!,
      slot: rival.siteSlots.find((s) => s.id === slot.id)!,
    }));
    expect(html3).toContain(escaped(t.sitesPicker.statusTaken(cleo.name, slotCapacity(slot.id))));
    expect(html3).toContain(escaped(t.sitesPicker.takenNote));
    expect(html3).not.toContain(escaped(t.sites.wonAt(fmt.money(reserve), 1)));
    expect(html3).not.toContain('class="amount-form"');
  });

  it('les filiales : une mise sans suite est expliquée, et un gisement pris ne propose plus de mise', () => {
    const fiche = (v: PlayerView, slotId: string) =>
      render(v, uiLang, createElement(DepositPanel, {
        company: v.companies.find((c) => c.id === cleo.id)!,
        slot: v.siteSlots.find((s) => s.id === slotId)!,
      }));
    const reserve = COMMODITIES.sugar.basePrice * SITE_OPENING_COST_MULT;
    const sugar2 = getPlayerView(g, 'cleo').siteSlots.find((s) => s.id === 'sugar-2')!.name;
    // Cleo n'a plus de quoi payer à la clôture : sa mise tombe, et la fiche du sucre le dit.
    const broke = structuredClone(g);
    broke.companies[cleo.id].cash = 10;
    resolveTurn(broke);
    const html = fiche(getPlayerView(broke, 'cleo'), 'sugar-2');
    expect(html).toContain(escaped(t.sites.failed));
    expect(html).not.toContain(escaped(t.sites.pending(fmt.money(reserve), sugar2)));
    // Les trois gisements de sucre sont pris (ici par des PNJ) : la fiche d'un gisement pris dit qui
    // l'exploite et ne propose plus de mise.
    const full = structuredClone(g);
    const holders = Object.values(full.companies).filter((c) => c.npcDefId !== undefined).slice(0, 3);
    full.siteSlots!.filter((x) => x.commodityId === 'sugar').forEach((slot, i) => {
      holders[i].sites = [{ id: slot.id, commodityId: 'sugar', capacity: slotCapacity(slot.id), unitCost: 1, activeFrom: 1 }];
    });
    const view2 = getPlayerView(full, 'cleo');
    const def = defaultSlot(view2, 'sugar')!;
    const owner = view2.companies.find((c) => c.id === def.companyId)!;
    const html2 = fiche(view2, def.id);
    expect(html2).toContain(escaped(t.sitesPicker.statusTaken(owner.name, slotCapacity(def.id))));
    expect(html2).toContain(escaped(t.sitesPicker.takenNote));
    expect(html2).toContain(escaped(t.sitesPicker.takenFoot));
    expect(html2).not.toContain('class="amount-form"');
    expect(html2).not.toContain(`>${escaped(t.sitesPicker.bidCta)}</button>`);
  });

  it('les filiales : au dernier trimestre, plus de mise possible', () => {
    const view = getPlayerView(g, 'cleo');
    const last = { ...view, turn: view.config.totalTurns };
    const html = render(last, uiLang, createElement(DepositPanel, {
      company: last.companies.find((c) => c.id === cleo.id)!,
      slot: last.siteSlots.find((s) => s.id === 'sugar-2')!,
    }));
    expect(html).toContain(escaped(t.sites.lastTurn));
    expect(html).not.toContain(escaped(t.sites.noCash));
  });

  it('les filiales : coût d’extraction du moment (news), mise en sommeil avec entretien, relance', () => {
    const later = structuredClone(g);
    resolveTurn(later);
    later.activeEffects = later.activeEffects.filter((e) => e.kind !== 'siteCost');
    later.activeEffects.push({ id: 'e-test', newsId: 'st_sugar_bees', kind: 'siteCost', commodityId: 'sugar', value: 2, turnsLeft: 2 });
    later.activeEffects.push({ id: 'e-test2', newsId: 'st_oil_robot_drills', kind: 'siteCost', commodityId: 'oil', value: 0.7, turnsLeft: 3 });
    const fiche = (slotId: string) => {
      const v = getPlayerView(later, 'cleo');
      return render(v, uiLang, createElement(DepositPanel, {
        company: v.companies.find((c) => c.id === cleo.id)!,
        slot: v.siteSlots.find((s) => s.id === slotId)!,
      }));
    };
    const usual = COMMODITIES.sugar.basePrice * SITE_UNIT_COST_RATIO;
    // La raffinerie remportée par Cleo : sa fiche donne l'extraction du trimestre et la news qui la fait varier.
    const wonId = later.companies[cleo.id].sites![0].id;
    let html = fiche(wonId);
    expect(html).toContain(escaped(t.sitesPicker.news(fmt.num(2), fmt.money(usual))));
    expect(html).toContain(escaped(t.sitesPicker.extraction(fmt.money(2 * usual))));
    // Pas de puits : la fiche du gisement libre le plus riche du pétrole montre quand même ce que coûterait
    // l'extraction ce trimestre.
    const oilUsual = COMMODITIES.oil.basePrice * SITE_UNIT_COST_RATIO;
    const oil = fiche(richestFree(getPlayerView(later, 'cleo'), 'oil').id);
    expect(oil).toContain(escaped(t.sitesPicker.news(fmt.num(0.7), fmt.money(oilUsual))));
    expect(oil).toContain(escaped(t.sitesPicker.extraction(fmt.money(0.7 * oilUsual))));
    // Sommeil : plus d'extraction, entretien réduit, bouton de relance.
    ok(later, 'cleo', { type: 'setSiteDormant', companyId: cleo.id, commodityId: 'sugar', dormant: true });
    html = fiche(wonId);
    expect(html).toContain(escaped(t.sites.dormant(fmt.money(slotCapacity(wonId) * usual * SITE_DORMANT_UPKEEP))));
    expect(html).toContain(`aria-label="${escaped(t.sites.wakeAria(t.sites.names.sugar))}"`);
    expect(html).not.toContain(escaped(t.sites.active));
    // Relance : un trimestre de remise en route.
    ok(later, 'cleo', { type: 'setSiteDormant', companyId: cleo.id, commodityId: 'sugar', dormant: false });
    html = fiche(wonId);
    expect(html).toContain(escaped(t.sites.building(fmt.date(later.turn + 1, later.config.startYear))));
  });
});

/** Phrases de la frise, comme les affiche l'interface. */
function line(view: PlayerView, entry: TimelineEntry, uiLang: Lang): string {
  const fmt = fmtFor(view.config.lang);
  const t = messages(uiLang);
  return eventText(entry, {
    h: t.history,
    player: (id) => nameAt(view.players.find((p) => p.id === id), entry.turn) ?? t.history.someone,
    company: (id) => view.companies.find((c) => c.id === id)?.name ?? t.common.unknown,
    product: () => undefined,
    sector: (id) => (id ? getContent(uiLang).sectors[id].name : t.common.unknown),
    money: fmt.money,
    pct: (r) => fmt.pct(r, pctDigits(r)),
  }).line;
}

describe('chronologie : filiales, cessions et ententes', () => {
  // Graine contrôlée : découverte par le vrai RNG avant la borne de 14 clôtures.
  const { g, ada, bob, cleo } = dealsGame('fr', 2);
  // Bob accepte le bloc d'Ada ; puis on laisse filer jusqu'à ce que l'entente soit découverte.
  ok(g, 'bob', { type: 'answerOffer', offerId: g.offers!.find((o) => o.kind === 'shares')!.id, accept: true });
  for (let i = 0; i < 14 && (g.cartels ?? []).length > 0; i++) {
    ada.scandal = 0;
    bob.scandal = 0;
    resolveTurn(g);
  }
  const fmt = fmtFor('fr');
  const entries = (who: string) => timelineEntries(getPlayerView(g, who));
  const of = (who: string, type: TimelineEntry['event']['type']) => {
    const e = entries(who).find((x) => x.event.type === type);
    expect(e, type).toBeDefined();
    return e!;
  };

  it('l’entente a fini par être découverte', () => {
    expect(g.cartels ?? []).toEqual([]);
  });

  it('dit qui remporte quoi, qui cède à qui, et qui paie l’amende', () => {
    expect(line(getPlayerView(g, 'ada'), of('ada', 'siteOpened'), 'fr')).toBe(`${cleo.name} remporte une raffinerie de sucre aux enchères.`);
    expect(line(getPlayerView(g, 'ada'), of('ada', 'siteOpened'), 'en')).toBe(`${cleo.name} wins a sugar refinery at auction.`);
    const sale = of('bob', 'blockSale');
    const pct = fmt.pct(sale.event.pct!, pctDigits(sale.event.pct!));
    const amount = fmt.money(sale.event.amount!);
    expect(line(getPlayerView(g, 'bob'), sale, 'fr')).toBe(`Vous rachetez ${pct} d’${ada.name} à Ada (${amount}), hors marché.`);
    expect(line(getPlayerView(g, 'ada'), of('ada', 'blockSale'), 'fr')).toBe(`Bob vous rachète ${pct} d’${ada.name} (${amount}), hors marché.`);
    expect(line(getPlayerView(g, 'cleo'), of('cleo', 'blockSale'), 'en')).toContain('off-market');
    const busted = of('ada', 'cartelBusted');
    expect(busted.role).not.toBeNull();
    expect(line(getPlayerView(g, 'ada'), busted, 'fr')).toMatch(/^Votre entente est découverte : /);
    const third = of('cleo', 'cartelBusted');
    expect(third.role).toBeNull();
    expect(line(getPlayerView(g, 'cleo'), third, 'en')).toMatch(/^Price-fixing busted: /);
  });
});
