import { useState } from 'react';
import { ConfirmModal } from '../components/Modal';
import { useUiLang } from '../i18n';
import { flushProductSaves } from '../productSaves';
import { pushToast } from '../store';
import { leavePeerGame, usePeerClient } from './client';
import { peerMessages } from './messages';
import './peer.css';

export function PeerControls() {
  const state = usePeerClient();
  const m = peerMessages(useUiLang());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const host = state.mode === 'host';
  const disconnected = state.phase === 'disconnected';
  const leave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!disconnected && !(await flushProductSaves())) { pushToast('bad', m.saveFailed); return; }
      leavePeerGame();
    } finally { setBusy(false); }
  };
  return <>
    <nav className="peer-toolbar" aria-label={m.edition}>
      <strong>Casholoco Direct</strong>
      <span className={disconnected ? 'peer-connection-lost' : 'muted'} role={disconnected ? 'status' : undefined}>{disconnected ? m.connectionLost : host ? m.hostGame : m.guestGame}</span>
      <button type="button" className="btn tiny ghost" disabled={busy} onClick={() => host && !disconnected ? setConfirm(true) : void leave()}>{host ? m.closeGame : m.leaveGame}</button>
    </nav>
    {confirm && <ConfirmModal title={m.closeTitle} message={m.closeBody} confirmLabel={m.closeGame} onClose={() => setConfirm(false)} onConfirm={() => void leave()} />}
  </>;
}
