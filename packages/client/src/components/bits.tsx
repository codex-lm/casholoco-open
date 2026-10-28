/** Petits éléments d'affichage partagés. */
import type { ReactNode } from 'react';
import type { BotLevel, PublicPlayer, ScandalLevel } from '@muchomoney/core';
import { cx } from '../util';
import { useFmt } from '../fmt';
import { useT } from '../i18n';
import { SCANDAL_LEVEL_THRESHOLDS, scandalLevelOf, scandalRisk } from '../rules';

export function Delta({ value, digits = 1 }: { value: number; digits?: number }) {
  const fmt = useFmt();
  if (!Number.isFinite(value) || Math.abs(value) < 0.0005) return <span className="delta flat">= {fmt.pct(0, 0)}</span>;
  const up = value > 0;
  return (
    <span className={cx('delta', up ? 'up' : 'down')}>
      {up ? '▲' : '▼'} {fmt.signedPct(value, digits)}
    </span>
  );
}

export function SignedMoney({ value }: { value: number }) {
  const fmt = useFmt();
  const cls = value > 0.5 ? 'up' : value < -0.5 ? 'down' : 'flat';
  return <span className={cx('money', cls)}>{value > 0.5 ? '+' : ''}{fmt.money(value)}</span>;
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' }) {
  return (
    <div className={cx('stat', tone)}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="swatch" style={{ background: color, width: size, height: size }} aria-hidden />;
}

/** Emoji du niveau d'un bot (stagiaire, magnat), rien pour le petit patron (le niveau par défaut). */
const BOT_LEVEL_EMOJI: Record<BotLevel, string> = { intern: '🎓', normal: '', expert: '🎩' };

export function PlayerTag({
  player,
  you,
  compact,
}: {
  player: Pick<PublicPlayer, 'name' | 'color' | 'isBot' | 'botTakeover' | 'botLevel'>;
  you?: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const level = player.botLevel;
  const levelEmoji = level ? BOT_LEVEL_EMOJI[level] : '';
  return (
    <span className="player-tag">
      <Swatch color={player.color} />
      <span className="player-name">{player.name}</span>
      {player.isBot && (
        <span className="badge" title={level ? `${t.common.botTitle} · ${t.lobby.botLevelOne[level]}` : t.common.botTitle}>
          🤖{compact ? '' : ` ${t.common.bot}`}
          {levelEmoji && ` ${levelEmoji}`}
        </span>
      )}
      {you && <span className="badge ink">{t.common.you}</span>}
      {player.botTakeover && <span className="badge" title={t.takeover.inheritedFrom(player.botTakeover.previousName)} aria-label={t.takeover.inheritedFrom(player.botTakeover.previousName)}>{t.takeover.inheritedBadge}</span>}
    </span>
  );
}

const LEVEL_CLASS: Record<ScandalLevel, string> = { faible: 'low', moyen: 'mid', élevé: 'high' };

export function ScandalBadge({ level }: { level: ScandalLevel }) {
  const t = useT();
  return <span className={cx('scandal-badge', LEVEL_CLASS[level] ?? 'low')}>{t.scandalLevel[level] ?? level}</span>;
}

export function ScandalGauge({ value }: { value: number }) {
  const t = useT();
  const fmt = useFmt();
  const v = Math.min(100, Math.max(0, value));
  const { moyen, eleve } = SCANDAL_LEVEL_THRESHOLDS;
  const level = scandalLevelOf(v);
  return (
    <div className="gauge">
      <div className="gauge-head">
        <span>
          {t.bits.gauge} <InfoTip text={t.tips.scandal} align="left" /> <ScandalBadge level={level} />
        </span>
        <strong>{Math.round(v)}/100</strong>
      </div>
      <div className="gauge-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
        <div className={cx('gauge-fill', LEVEL_CLASS[level])} style={{ width: `${v}%` }} />
        <span className="gauge-mark" style={{ left: `${moyen}%` }} />
        <span className="gauge-mark" style={{ left: `${eleve}%` }} />
      </div>
      <div className="small muted">
        {t.bits.risk} <strong>{fmt.pct(scandalRisk(v), 0)}</strong>
        {v >= eleve ? t.bits.riskHigh : v >= moyen ? t.bits.riskMid : t.bits.riskLow}
      </div>
    </div>
  );
}

/**
 * Bulle d'aide « ⓘ » : infobulle CSS au survol et au focus (clavier, tactile), texte lu par
 * les lecteurs d'écran via aria-label. Sans bibliothèque.
 */
export function InfoTip({ text, align }: { text: string; align?: 'left' | 'right' }) {
  return (
    <span className={cx('info-tip', align && `tip-${align}`)} tabIndex={0} role="img" aria-label={text} data-tip={text}>
      ⓘ
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Section({ title, children, aside, className }: { title: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={cx('section', className)}>
      <header className="section-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}
