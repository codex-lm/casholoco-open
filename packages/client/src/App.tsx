import { useApp } from './store';
import { Toasts } from './components/Toasts';
import { GameScreen } from './screens/GameScreen';
import { EndScreen } from './screens/EndScreen';
import { GameProvider } from './hooks/useGame';
import { AudioBridge } from './audio/AudioBridge';
import { SoloHome } from './solo/SoloHome';
import { SoloControls } from './solo/SoloControls';
import './solo/solo.css';
import { IS_PEER } from './edition';
import { PeerHome } from './peer/PeerHome';
import { PeerControls } from './peer/PeerControls';

export function App() {
  const view = useApp((s) => s.view);
  const visit = useApp((s) => s.soloVisit);

  return (
    <>
      <AudioBridge />
      {view ? <GameProvider key={visit} view={view}>{IS_PEER ? <PeerControls /> : <SoloControls />}{view.phase === 'finished' ? <EndScreen /> : <GameScreen />}</GameProvider> : IS_PEER ? <PeerHome /> : <SoloHome />}
      <Toasts />
    </>
  );
}
