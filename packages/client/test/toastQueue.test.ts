import { describe, expect, it } from 'vitest';
import { MAX_INFO_TOASTS, MAX_TOASTS, stackToast, type QueuedToast } from '../src/toastQueue';

let seq = 0;
const toast = (kind: QueuedToast['kind'], tag?: string): QueuedToast => ({ id: ++seq, kind, ...(tag ? { tag } : {}) });
const push = (list: QueuedToast[], ...ts: QueuedToast[]) => ts.reduce((l, t) => stackToast(l, t), list);

describe('toasts', () => {
  it(`au plus ${MAX_INFO_TOASTS} toasts d’info : les plus anciens partent, les autres restent`, () => {
    const bad = toast('bad');
    const infos = [toast('info'), toast('info'), toast('info'), toast('info')];
    const list = push([], infos[0], bad, infos[1], infos[2], infos[3]);
    expect(list.map((t) => t.id)).toEqual([bad.id, infos[1].id, infos[2].id, infos[3].id]);
  });

  it('« Nouveau trimestre » successifs : le dernier remplace le précédent', () => {
    const q1 = toast('info', 'newQuarter');
    const other = toast('good');
    const q2 = toast('info', 'newQuarter');
    expect(push([], q1, other, q2).map((t) => t.id)).toEqual([other.id, q2.id]);
  });

  it(`au plus ${MAX_TOASTS} toasts en tout`, () => {
    const list = push([], ...Array.from({ length: 8 }, () => toast('drama')));
    expect(list).toHaveLength(MAX_TOASTS);
  });
});
