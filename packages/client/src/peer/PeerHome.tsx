import { useRef, useState } from 'react';
import { SECTOR_IDS, type BotLevel, type SectorId } from '@muchomoney/core';
import { GuideModal } from '../components/Guide';
import { LangSwitch } from '../components/LangSwitch';
import { SoundButton } from '../components/SoundButton';
import { useContent, useT, useUiLang } from '../i18n';
import {
  acceptPeerAnswer, createPeerInvite, joinPeerOffer, leavePeerGame, startPeerGame,
  startPeerHost, usePeerClient,
} from './client';
import { peerMessages } from './messages';
import './peer.css';

type World = 'classic' | 'hex' | 'square';
type Quarters = 8 | 12 | 16 | 20 | 24;

function CodeOutput({ code, label, selectLabel }: { code: string; label: string; selectLabel: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  return <div className="peer-code-output">
    <label className="field"><span>{label}</span><textarea ref={field} readOnly value={code} spellCheck={false} autoComplete="off" rows={4} /></label>
    <button type="button" className="btn ghost" onClick={() => { field.current?.focus(); field.current?.select(); }}>{selectLabel}</button>
  </div>;
}

export function PeerHome() {
  const lang = useUiLang();
  const m = peerMessages(lang);
  const t = useT();
  const content = useContent();
  const state = usePeerClient();
  const [choice, setChoice] = useState<'host' | 'guest' | null>(null);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('Synergix');
  const [sectorId, setSectorId] = useState<SectorId>('energy_drinks');
  const [botCount, setBotCount] = useState(2);
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const [mapMode, setMapMode] = useState<World>('classic');
  const [totalTurns, setTotalTurns] = useState<Quarters>(16);
  const [offer, setOffer] = useState('');
  const [answer, setAnswer] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const busy = working || state.busy;

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setWorking(true);
    setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : m.failed); }
    finally { setWorking(false); }
  };
  const host = () => run(() => startPeerHost({ playerName: name.trim() || m.defaultName, companyName: companyName.trim() || 'Synergix', sectorId, botCount, botLevel, mapMode, totalTurns, lang }));
  const createInvite = () => run(async () => { setAnswer(''); await createPeerInvite(); });
  const leave = () => { leavePeerGame(); setChoice(null); setOffer(''); setAnswer(''); setError(null); };

  const people = <section className="peer-members" aria-labelledby="peer-members-title">
    <h3 id="peer-members-title">{m.members}</h3>
    <ul>{state.players.map((player) => <li key={player.id}>
      <strong>{player.name}</strong>
      <span className="small muted">{player.isBot ? m.botRole : player.isHost ? m.hostRole : m.guestRole}</span>
      <span className={`peer-status ${player.connected || player.isBot ? 'connected' : ''}`}>{player.connected || player.isBot ? m.connected : m.waiting}</span>
    </li>)}</ul>
  </section>;

  return <main className="home peer-home">
    <div className="home-lang"><SoundButton /><LangSwitch /></div>
    <header className="masthead">
      <div className="masthead-top"><span>{m.edition}</span><span>{m.noTimer.split(':')[0]}</span></div>
      <h1 className="logo">Casholoco <span className="peer-stamp">{m.stamp}</span></h1>
      <div className="masthead-bottom"><span>{t.home.slogan}</span></div>
    </header>
    <p className="tagline">{m.title}</p>
    <p className="peer-intro">{m.intro}</p>
    <aside className="peer-limits">
      <h2>{m.limitsTitle}</h2>
      <p>{m.limits}</p>
      <p>{m.hostOpen}</p>
    </aside>
    {(error || state.error) && <p className="notice" role="alert">{error || state.error}</p>}
    {state.phase === 'disconnected' && <p className="notice" role="status">{m.connectionLost}</p>}

    {state.mode === 'idle' && !choice && <div className="peer-choice-grid">
      <section className="home-card"><h2>{m.host}</h2><p>{m.hostBody}</p><button type="button" className="btn primary big" onClick={() => setChoice('host')}>{m.host}</button></section>
      <section className="home-card"><h2>{m.join}</h2><p>{m.joinBody}</p><button type="button" className="btn big" onClick={() => setChoice('guest')}>{m.join}</button></section>
    </div>}

    {state.mode === 'idle' && choice && <section className="home-card peer-setup">
      <div className="row between"><h2>{choice === 'host' ? m.host : m.join}</h2><button type="button" className="btn ghost" disabled={busy} onClick={() => setChoice(null)}>{m.back}</button></div>
      <div className="field"><label htmlFor="peer-name">{m.name}</label><input id="peer-name" maxLength={24} value={name} placeholder={m.namePlaceholder} autoComplete="nickname" disabled={busy} onChange={(event) => setName(event.target.value)} /></div>
      {choice === 'host' ? <>
        <div className="peer-fields">
          <div className="field"><label htmlFor="peer-company">{m.company}</label><input id="peer-company" maxLength={40} value={companyName} disabled={busy} onChange={(event) => setCompanyName(event.target.value)} /></div>
          <div className="field"><label htmlFor="peer-sector">{m.sector}</label><select id="peer-sector" value={sectorId} disabled={busy} onChange={(event) => setSectorId(event.target.value as SectorId)}>{SECTOR_IDS.map((sector) => <option key={sector} value={sector}>{content.sectors[sector].name}</option>)}</select></div>
          <div className="field"><label htmlFor="peer-bots">{m.bots}</label><select id="peer-bots" value={botCount} disabled={busy} onChange={(event) => setBotCount(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
          <div className="field"><label htmlFor="peer-level">{m.difficulty}</label><select id="peer-level" value={botLevel} disabled={busy || botCount === 0} onChange={(event) => setBotLevel(event.target.value as BotLevel)}><option value="intern">{m.intern}</option><option value="normal">{m.normal}</option><option value="expert">{m.expert}</option></select></div>
          <div className="field"><label htmlFor="peer-world">{m.world}</label><select id="peer-world" value={mapMode} disabled={busy} onChange={(event) => setMapMode(event.target.value as World)}><option value="classic">{m.classic}</option><option value="hex">{m.hex}</option><option value="square">{m.square}</option></select></div>
          <div className="field"><label htmlFor="peer-quarters">{m.quarters}</label><select id="peer-quarters" value={totalTurns} disabled={busy} onChange={(event) => setTotalTurns(Number(event.target.value) as Quarters)}>{[8, 12, 16, 20, 24].map((n) => <option key={n} value={n}>{m.quarterCount(n)}</option>)}</select></div>
        </div>
        <p className="muted small">{m.noTimer}</p>
        <button type="button" className="btn primary big" disabled={busy} onClick={() => void host()}>{busy ? m.busy : m.createLobby}</button>
      </> : <>
        <label className="field" htmlFor="peer-offer"><span>{m.invitation}</span><textarea id="peer-offer" value={offer} onChange={(event) => setOffer(event.target.value)} disabled={busy} placeholder={m.invitationPlaceholder} spellCheck={false} autoComplete="off" rows={5} /></label>
        <button type="button" className="btn primary" disabled={busy || !offer.trim()} onClick={() => void run(() => joinPeerOffer(offer, name.trim() || m.defaultName))}>{busy ? m.busy : m.joinAction}</button>
      </>}
    </section>}

    {state.mode === 'host' && <section className="home-card peer-lobby">
      <div className="row between"><h2>{m.lobby}</h2><button type="button" className="btn ghost" disabled={busy} onClick={leave}>{m.leave}</button></div>
      {people}
      <div className="peer-invite-block">
        <h3>{m.inviteStep}</h3>
        <p>{m.inviteHint}</p>
        <button type="button" className="btn" disabled={busy || state.players.length >= 8} onClick={() => void createInvite()}>{busy ? m.busy : m.createInvite}</button>
        {state.offerCode && <CodeOutput code={state.offerCode} label={m.invitation} selectLabel={m.selectText} />}
      </div>
      {state.offerCode && <div className="peer-invite-block">
        <h3>{m.replyStep}</h3>
        <label className="field" htmlFor="peer-answer"><span>{m.response}</span><textarea id="peer-answer" value={answer} disabled={busy} onChange={(event) => setAnswer(event.target.value)} placeholder={m.responsePlaceholder} spellCheck={false} autoComplete="off" rows={4} /></label>
        <button type="button" className="btn" disabled={busy || !answer.trim()} onClick={() => void run(() => acceptPeerAnswer(answer))}>{busy ? m.busy : m.acceptResponse}</button>
      </div>}
      <p className="small muted">{m.privacy}</p>
      <div className="peer-start"><button type="button" className="btn primary big" disabled={busy || !state.canStart} onClick={() => void run(startPeerGame)}>{busy ? m.busy : m.start}</button>{!state.canStart && <p className="small muted">{m.needGuest}</p>}</div>
    </section>}

    {state.mode === 'guest' && <section className="home-card peer-guest">
      <div className="row between"><h2>{m.join}</h2><button type="button" className="btn ghost" disabled={busy} onClick={leave}>{m.leave}</button></div>
      {state.answerCode && <><h3>{m.guestReplyStep}</h3><p>{m.guestReplyHelp}</p><CodeOutput code={state.answerCode} label={m.response} selectLabel={m.selectText} /><p className="small muted">{m.privacy}</p></>}
      {state.phase === 'connecting' ? <div className="notice" role="status"><strong>{m.connecting}</strong><p>{m.connectingHelp}</p></div> : state.phase !== 'disconnected' && <p className="notice" role="status">{m.waitingHost}</p>}
      {state.players.length > 0 && people}
    </section>}

    <section className="peer-manual"><h2>{m.manualTitle}</h2><ol><li>{m.manualOne}</li><li>{m.manualTwo}</li><li>{m.manualThree}</li></ol></section>
    <div className="home-guide"><button type="button" className="btn ghost" onClick={() => setGuide(true)}>{t.guide.open}</button></div>
    {guide && <GuideModal onClose={() => setGuide(false)} />}
  </main>;
}
