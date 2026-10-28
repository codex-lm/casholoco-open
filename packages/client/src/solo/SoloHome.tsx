import { useState } from 'react';
import { SECTOR_IDS, type BotLevel, type SectorId } from '@muchomoney/core';
import { getSavedSoloGameInfo, hasSavedSoloGame, resumeSoloGame, soloStorageAvailable, startSoloGame } from '../api';
import { GuideModal } from '../components/Guide';
import { LangSwitch } from '../components/LangSwitch';
import { ConfirmModal } from '../components/Modal';
import { SoundButton } from '../components/SoundButton';
import { useContent, useT, useUiLang } from '../i18n';
import { pushToast, useApp } from '../store';
import { SaveDialog } from './SoloControls';
import { soloMessages } from './messages';

type World = 'classic' | 'hex' | 'square';
type Quarters = 8 | 12 | 16 | 20 | 24;

export function SoloHome() {
  const lang = useUiLang();
  const m = soloMessages(lang);
  const t = useT();
  const content = useContent();
  const notice = useApp((s) => s.notice);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('Synergix');
  const [sectorId, setSectorId] = useState<SectorId>('energy_drinks');
  const [botCount, setBotCount] = useState(3);
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const [mapMode, setMapMode] = useState<World>('classic');
  const [totalTurns, setTotalTurns] = useState<Quarters>(16);
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState<'standard' | 'guided' | null>(null);
  const [saveMode, setSaveMode] = useState<'export' | 'import' | null>(null);
  const [guide, setGuide] = useState(false);
  const saved = getSavedSoloGameInfo();
  const hasSave = hasSavedSoloGame();
  const storage = soloStorageAvailable();

  const start = async (kind: 'standard' | 'guided') => {
    setBusy(true);
    setReplace(null);
    try {
      const result = await startSoloGame({
        playerName: name.trim() || m.defaultName,
        companyName: companyName.trim() || 'Synergix',
        sectorId: kind === 'guided' ? 'energy_drinks' : sectorId,
        botCount: kind === 'guided' ? 2 : botCount,
        botLevel: kind === 'guided' ? 'intern' : botLevel,
        mapMode: kind === 'guided' ? 'classic' : mapMode,
        totalTurns: kind === 'guided' ? 8 : totalTurns,
        lang,
        guided: kind === 'guided',
      });
      if (result && !result.ok) pushToast('bad', result.error ?? m.failed);
    } catch {
      pushToast('bad', m.failed);
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    try {
      const result = await resumeSoloGame();
      if (result && !result.ok) pushToast('bad', result.error ?? m.failed);
    } catch {
      pushToast('bad', m.failed);
    } finally {
      setBusy(false);
    }
  };

  const requestStart = (kind: 'standard' | 'guided') => {
    if (hasSave) setReplace(kind);
    else void start(kind);
  };

  return (
    <main className="home solo-home">
      <div className="home-lang"><SoundButton /><LangSwitch /></div>
      <header className="masthead">
        <div className="masthead-top"><span>{m.edition}</span><span>{m.atYourPace}</span></div>
        <h1 className="logo">Casholoco <span className="solo-title">Solo</span></h1>
        <div className="masthead-bottom"><span>{t.home.slogan}</span></div>
      </header>
      <p className="tagline">{m.tagline}</p>
      <p className="solo-intro">{m.intro}</p>

      {notice && <div className="notice" role="status">{notice}</div>}
      {!storage && <p className="notice" role="status">{m.storageUnavailable}</p>}

      {hasSave && (
        <section className="home-card solo-resume" aria-labelledby="solo-resume-title">
          <div>
            <h2 id="solo-resume-title">{m.resumeTitle}</h2>
            {saved && <p>{saved.phase === 'finished' ? m.finished : m.savedAt(saved.playerName, saved.turn, saved.totalTurns)}</p>}
          </div>
          <div className="row wrap">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void resume()}>{m.resume}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setSaveMode('export')}>{m.save}</button>
          </div>
        </section>
      )}

      <section className="home-card solo-new-game" aria-labelledby="solo-new-title">
        <h2 id="solo-new-title">{m.newGame}</h2>
        <div className="solo-fields">
          <div className="field"><label htmlFor="solo-name">{m.name}</label><input id="solo-name" value={name} placeholder={m.namePlaceholder} maxLength={24} autoComplete="nickname" onChange={(e) => setName(e.target.value)} disabled={busy} /></div>
          <div className="field"><label htmlFor="solo-company">{m.company}</label><input id="solo-company" value={companyName} placeholder={m.companyPlaceholder} maxLength={40} autoComplete="organization" onChange={(e) => setCompanyName(e.target.value)} disabled={busy} /></div>
        </div>
        <details className="solo-settings">
          <summary>{m.settings}</summary>
          <div className="solo-fields">
            <div className="field"><label htmlFor="solo-sector">{m.sector}</label><select id="solo-sector" value={sectorId} onChange={(e) => setSectorId(e.target.value as SectorId)} disabled={busy}>{SECTOR_IDS.map((sector) => <option value={sector} key={sector}>{content.sectors[sector].name}</option>)}</select></div>
            <div className="field"><label htmlFor="solo-bots">{m.botCount}</label><select id="solo-bots" value={botCount} onChange={(e) => setBotCount(Number(e.target.value))} disabled={busy}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
            <div className="field"><label htmlFor="solo-level">{m.difficulty}</label><select id="solo-level" value={botLevel} onChange={(e) => setBotLevel(e.target.value as BotLevel)} disabled={busy}><option value="intern">{m.intern}</option><option value="normal">{m.normal}</option><option value="expert">{m.expert}</option></select></div>
            <div className="field"><label htmlFor="solo-world">{m.map}</label><select id="solo-world" value={mapMode} onChange={(e) => setMapMode(e.target.value as World)} disabled={busy}><option value="classic">{m.classic}</option><option value="hex">{m.hex}</option><option value="square">{m.square}</option></select></div>
            <div className="field"><label htmlFor="solo-quarters">{m.quarters}</label><select id="solo-quarters" value={totalTurns} onChange={(e) => setTotalTurns(Number(e.target.value) as Quarters)} disabled={busy}>{([8, 12, 16, 20, 24] as const).map((n) => <option key={n} value={n}>{m.quarterCount(n)}</option>)}</select></div>
          </div>
        </details>
        <div className="solo-start-actions">
          <button type="button" className="btn primary big" disabled={busy} onClick={() => requestStart('standard')}>{busy ? m.preparing : m.newGame}</button>
          <div className="solo-guided"><button type="button" className="btn ghost" disabled={busy} onClick={() => requestStart('guided')}>{m.guided}</button><p className="small muted">{m.guidedBody}</p></div>
        </div>
      </section>

      <section className="home-howto solo-howto">
        <article><h3>{m.atYourPace}</h3><p>{m.atYourPaceBody}</p></article>
        <article><h3>{m.local}</h3><p>{m.localBody}</p></article>
      </section>
      <div className="home-guide row wrap center"><button type="button" className="btn ghost" onClick={() => setGuide(true)}>{t.guide.open}</button><button type="button" className="btn ghost" onClick={() => setSaveMode('import')}>{m.import}</button></div>

      {replace && <ConfirmModal title={m.replaceTitle} message={m.replaceBody} confirmLabel={m.replaceConfirm} onConfirm={() => void start(replace)} onClose={() => setReplace(null)} />}
      {saveMode && <SaveDialog initialMode={saveMode} onClose={() => setSaveMode(null)} />}
      {guide && <GuideModal onClose={() => setGuide(false)} />}
    </main>
  );
}
