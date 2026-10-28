import { useApp } from '../store';
import { useT } from '../i18n';

/** Bandeau affiché quand la liaison avec le serveur est coupée. */
export function ConnectionBanner() {
  const t = useT();
  const connection = useApp((s) => s.connection);
  const everConnected = useApp((s) => s.everConnected);
  const rejoining = useApp((s) => s.rejoining);
  const inRoom = useApp((s) => s.session !== null);
  const refused = useApp((s) => s.refused);

  if (refused && connection !== 'connected') {
    return (
      <div className="conn-banner refused" role="alert">
        {refused}{' '}
        <button type="button" className="btn tiny" onClick={() => window.location.reload()}>
          {t.conn.reload}
        </button>
      </div>
    );
  }

  if (connection === 'connected' && !(rejoining && everConnected && inRoom)) return null;
  if (!everConnected && connection !== 'disconnected') return null;

  const text = connection === 'connected' ? t.conn.rejoining : everConnected ? t.conn.lost : t.conn.unreachable;
  return (
    <div className="conn-banner" role="status">
      <span className="spinner" aria-hidden /> {text}
    </div>
  );
}
