import { useRef, useState } from 'react';
import { exportSoloGame, importSoloGame, leaveRoom, soloStorageAvailable } from '../api';
import { Modal } from '../components/Modal';
import { useUiLang } from '../i18n';
import { flushProductSaves } from '../productSaves';
import { pushToast } from '../store';
import { soloMessages } from './messages';

export function SaveDialog({ onClose, initialMode = 'export' }: { onClose: () => void; initialMode?: 'export' | 'import' }) {
  const m = soloMessages(useUiLang());
  const [mode, setMode] = useState(initialMode);
  const [saved] = useState(() => exportSoloGame());
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const importSave = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await flushProductSaves())) {
        setError(m.saveBeforeLeavingFailed);
        return;
      }
      const result = await importSoloGame(text);
      if (!result.ok) setError(result.error || m.failed);
      else onClose();
    } catch {
      setError(m.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={m.transfer} onClose={onClose} wide>
      <div className="stack solo-save-dialog">
        <div className="row wrap" role="group" aria-label={m.transfer}>
          <button type="button" className={`btn ${mode === 'export' ? 'primary' : 'ghost'}`} aria-pressed={mode === 'export'} onClick={() => { setMode('export'); setError(null); }}>{m.export}</button>
          <button type="button" className={`btn ${mode === 'import' ? 'primary' : 'ghost'}`} aria-pressed={mode === 'import'} onClick={() => { setMode('import'); setError(null); }}>{m.import}</button>
        </div>
        <p>{mode === 'export' ? m.exportHelp : m.importHelp}</p>
        {mode === 'export' && !saved ? <p className="notice">{m.noSave}</p> : (
          <label className="field" htmlFor="solo-save-text">
            <span>{m.savedText}</span>
            <textarea ref={field} id="solo-save-text" spellCheck={false} autoComplete="off" readOnly={mode === 'export'} value={mode === 'export' ? saved ?? '' : text} placeholder={mode === 'import' ? m.importPlaceholder : undefined} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        {error && <p className="notice" role="alert">{error}</p>}
        <div className="row wrap">
          {mode === 'export' ? saved && <button type="button" className="btn primary" onClick={() => { field.current?.focus(); field.current?.select(); }}>{m.selectAll}</button> : <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={() => void importSave()}>{busy ? m.preparing : m.importPlay}</button>}
        </div>
      </div>
    </Modal>
  );
}

export function SoloControls() {
  const m = soloMessages(useUiLang());
  const [saveOpen, setSaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const storage = soloStorageAvailable();
  const run = async (action: 'home' | 'save') => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await flushProductSaves())) {
        pushToast('bad', m.saveBeforeLeavingFailed);
        return;
      }
      if (action === 'home') leaveRoom();
      else setSaveOpen(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <nav className="solo-toolbar" aria-label={m.playingSolo}>
        <span className="solo-toolbar-label">Casholoco <strong>Solo</strong></span>
        <span className={`solo-save-status ${storage ? '' : 'warn'}`}>{storage ? m.savedAutomatically : m.storageUnavailable}</span>
        <div className="row">
          <button type="button" className="btn tiny ghost" disabled={busy} onClick={() => void run('save')}>{m.save}</button>
          <button type="button" className="btn tiny ghost" disabled={busy} onClick={() => void run('home')} title={m.homeTitle}>{m.home}</button>
        </div>
      </nav>
      {saveOpen && <SaveDialog onClose={() => setSaveOpen(false)} />}
    </>
  );
}
