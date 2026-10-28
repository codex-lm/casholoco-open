import { act, createElement } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, getPlayerView, type Lang, type PlayerView } from '@muchomoney/core';
import { GameProvider } from '../src/hooks/useGame';
import { messages } from '../src/i18n';
import { DealsTab } from '../src/screens/game/DealsTab';
import { getState, setState } from '../src/store';

const api = vi.hoisted(() => ({ sendAction: vi.fn(async () => ({ ok: true })) }));
vi.mock('../src/api', () => api);

/** Minimal DOM host for the real React reconciler and delegated events. No mocked hooks or component state.
 * Layout, native focus and browser event generation remain browser-QA responsibilities. */
class HostNode extends EventTarget {
  parentNode: HostNode | null = null;
  childNodes: HostNode[] = [];
  attributes = new Map<string, string>();
  style = {};
  namespaceURI = 'http://www.w3.org/1999/xhtml';
  disabled = false;
  private optionSelected = false;
  defaultSelected = false;
  multiple = false;
  oninput = null;
  onclick = null;
  private rawValue = '';
  constructor(readonly nodeName: string, readonly ownerDocument: HostDocument, readonly nodeType = 1, private text = '') { super(); }
  get tagName() { return this.nodeName; }
  get type() { return this.getAttribute('type') ?? (this.nodeName === 'INPUT' ? 'text' : ''); }
  set type(value: string) { this.setAttribute('type', value); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null; }
  get options() { return descendants(this).filter(node => node.nodeName === 'OPTION'); }
  get selected() { return this.optionSelected; }
  set selected(value: boolean) {
    if (value && this.parentNode?.nodeName === 'SELECT' && !this.parentNode.multiple) {
      this.parentNode.options.forEach(option => { option.optionSelected = false; });
    }
    this.optionSelected = value;
  }
  get value(): string {
    if (this.nodeName === 'OPTION') return this.getAttribute('value') ?? this.textContent;
    if (this.nodeName === 'SELECT') return this.options.find(option => option.selected)?.value ?? '';
    return this.rawValue;
  }
  set value(value: string) {
    if (this.nodeName === 'SELECT') this.options.forEach(option => { option.selected = option.value === value; });
    else this.rawValue = String(value);
  }
  get textContent(): string { return this.text + this.childNodes.map(node => node.textContent).join(''); }
  set textContent(value: string) { this.childNodes.forEach(node => { node.parentNode = null; }); this.childNodes = []; this.text = String(value); }
  appendChild(node: HostNode) { return this.insertBefore(node, null); }
  insertBefore(node: HostNode, before: HostNode | null) {
    node.parentNode?.removeChild(node);
    const index = before ? this.childNodes.indexOf(before) : this.childNodes.length;
    this.childNodes.splice(index, 0, node); node.parentNode = this; return node;
  }
  removeChild(node: HostNode) { this.childNodes.splice(this.childNodes.indexOf(node), 1); node.parentNode = null; return node; }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  contains(node: HostNode | null): boolean { return node === this || this.childNodes.some(child => child.contains(node)); }
  focus() { this.ownerDocument.activeElement = this; }
}
class HostDocument extends EventTarget {
  nodeType = 9;
  oninput = null;
  documentElement = new HostNode('HTML', this);
  body = new HostNode('BODY', this);
  activeElement = this.body;
  defaultView = { document: this, HTMLIFrameElement: class {}, HTMLElement: HostNode, event: undefined, setTimeout, clearTimeout };
  createElement(tag: string) { return new HostNode(tag.toUpperCase(), this); }
  createElementNS(_namespace: string, tag: string) { return this.createElement(tag); }
  createTextNode(text: string) { return new HostNode('#text', this, 3, text); }
}
function descendants(node: HostNode): HostNode[] { return node.childNodes.flatMap(child => [child, ...descendants(child)]); }
const initialState = getState();
let root: Root;
let host: HostNode;
beforeEach(async () => {
  api.sendAction.mockClear();
  const document = new HostDocument();
  host = document.createElement('div'); document.body.appendChild(host);
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', document.defaultView);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Import after the DOM host exists, so React uses its standard input-event path.
  const { createRoot } = await import('react-dom/client');
  root = createRoot(host as unknown as HTMLElement);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  setState(initialState); vi.unstubAllGlobals();
});

async function renderView(view: PlayerView, lang: Lang) {
  await act(async () => {
    setState({ view, lang, lobby: null });
    root.render(createElement(GameProvider, { view, children: createElement(DealsTab) }));
  });
}
function byId(id: string) {
  const node = descendants(host).find(node => node.getAttribute('id') === id);
  expect(node, id).toBeDefined(); return node!;
}
function button(label: string) {
  const node = descendants(host).find(node => node.nodeName === 'BUTTON' && node.textContent === label);
  expect(node, label).toBeDefined(); return node!;
}
async function fire(node: HostNode, type: string) {
  await act(async () => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: node });
    host.dispatchEvent(event);
  });
}
async function fill(id: string, value: string) {
  const node = byId(id);
  // Simulate a browser edit, bypassing React's value-tracking property descriptor.
  Object.getOwnPropertyDescriptor(HostNode.prototype, 'value')!.set!.call(node, value);
  await fire(node, node.nodeName === 'SELECT' ? 'change' : 'input');
}
function sectionOrder(lang: Lang) {
  const text = host.textContent, t = messages(lang);
  return { proposal: text.indexOf(t.deals.propose), incoming: text.indexOf(t.deals.incoming) };
}

describe.each(['fr', 'en'] as const)('Tractations draft lifecycle (%s)', lang => {
  it.each([false, true])('keeps the draft through offer reordering (initial pending offer: %s)', async initiallyPending => {
    const game = createGame({ seed: 17, totalTurns: 8, turnSeconds: 0, startYear: 2027, lang }, [
      { id: 'me', name: 'Ada', isBot: false, companyName: 'Alpha', sectorId: 'gadgets', connected: true, color: '#123456' },
      { id: 'rival', name: 'Ben', isBot: false, companyName: 'Beta', sectorId: 'yogurts', connected: true, color: '#654321' },
    ]);
    const mine = Object.values(game.companies).find(company => company.controllerId === 'me')!;
    const rival = Object.values(game.companies).find(company => company.controllerId === 'rival')!;
    const view = () => getPlayerView(game, 'me');
    const t = messages(lang), price = lang === 'fr' ? '42,5' : '42.5';
    const receiveOffer = () => {
      const offered = applyAction(game, 'rival', { type: 'offerContract', sellerCompanyId: rival.id,
        buyerCompanyId: mine.id, commodityId: 'sugar', lots: 5, price: 35, turns: 2 });
      expect(offered.ok, offered.message).toBe(true);
    };
    if (initiallyPending) receiveOffer();
    await renderView(view(), lang);
    await fire(button(t.deals.kinds.contract), 'click');
    await fire(button(t.deals.roleBuy), 'click');
    await fill('deal-k-commodity', 'sugar');
    await fill('deal-k-lots', '37');
    await fill('deal-k-price', price);
    await fill('deal-k-turns', '3');
    const quantity = byId('deal-k-lots');
    const assertDraft = () => {
      expect(byId('deal-k-lots')).toBe(quantity); // Actual DOM identity: the React subtree was moved, not remounted.
      expect(byId('deal-k-lots').value).toBe('37');
      expect(byId('deal-k-price').value).toBe(price);
      expect(byId('deal-k-turns').value).toBe('3');
      expect(byId('deal-k-commodity').options.find(option => option.selected)?.getAttribute('value')).toBe('sugar');
      expect(button(t.deals.roleBuy).getAttribute('aria-pressed')).toBe('true');
    };
    // An unchanged authoritative snapshot must retain edits too: the events updated real React state.
    await renderView(view(), lang);
    assertDraft();
    expect(api.sendAction).not.toHaveBeenCalled();

    if (!initiallyPending) {
      receiveOffer();
      await renderView(view(), lang);
      expect(sectionOrder(lang).incoming).toBeLessThan(sectionOrder(lang).proposal);
      assertDraft();
      expect(api.sendAction).not.toHaveBeenCalled();
    }

    const offer = game.offers!.at(-1)!;
    await fire(button(t.deals.decline), 'click');
    expect(api.sendAction).toHaveBeenCalledExactlyOnceWith({ type: 'answerOffer', offerId: offer.id, accept: false });
    expect(applyAction(game, 'me', { type: 'answerOffer', offerId: offer.id, accept: false }).ok).toBe(true);
    await renderView(view(), lang);
    expect(sectionOrder(lang).proposal).toBeLessThan(sectionOrder(lang).incoming);
    assertDraft();
  });
});
