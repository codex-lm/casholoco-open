import { useReducer, useRef, useState } from 'react';
import type { CompanyView, SectorId, ShadyKind } from '@muchomoney/core';
import { SECTOR_IDS, SHADY_KINDS } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useGame } from '../../hooks/useGame';
import { useApp } from '../../store';
import { ConfirmModal } from '../../components/Modal';
import { InfoTip, ScandalGauge } from '../../components/bits';
import {
  CRISIS_COMMS_COST,
  CRISIS_COMMS_REPUTATION,
  CRISIS_COMMS_REPUTATION_CAP,
  CRISIS_COMMS_SCANDAL,
  MODIFIER_INFO,
  SHADY_RULES,
  companySectors,
  espionageGains,
  scandalLevelOf,
} from '../../rules';
import { cx } from '../../util';
import { useContent, useT } from '../../i18n';
import { useFmt } from '../../fmt';
import { rememberShadyFold, shadyFoldOpenNow, shadyFoldOpensItself, showsCrisisComms } from './shadyFold';

/** Ancre du bloc scandale (jauge, effets en cours, communication de crise), en tête des actions discutables : la puce de l'en-tête y mène. */
export const SHADY_ANCHOR = 'company-scandal';

/**
 * Ancre de la tuile de communication de crise : le lien « Excuses publiques » de l'en-tête y mène et lui donne le focus
 * (d'où son `tabIndex={-1}`). La tuile est dans le bloc scandale, toujours visible quand la réputation est sous 1.
 */
export const CRISIS_COMMS_ANCHOR = 'crisis-comms';

/**
 * « Actions discutables » : la jauge, les effets en cours (s'il y en a) et la communication de crise (s'il y a de quoi
 * réparer) toujours visibles ; les six combines dans un volet dont le titre résume l'état (voir shadyFold.ts).
 */
export function ShadyPanel({ company }: { company: CompanyView }) {
  const { view } = useGame();
  const t = useT();
  const room = useApp((s) => s.session?.roomCode ?? 'local');
  const priv = company.private;
  const done = priv?.turnFlags.shadyDone ?? [];
  const modifiers = priv?.modifiers ?? [];
  // Le chiffre arrondi comme la jauge, le niveau tiré de la valeur brute comme son badge (29,6 : « 30/100 (faible) »).
  const rawScandal = Math.min(100, Math.max(0, priv?.scandal ?? 0));
  const scandal = Math.round(rawScandal);
  const crisis = showsCrisisComms(company);

  // Ouvert de lui-même, le volet le reste jusqu'à la fin du trimestre (pas de fermeture sous les yeux du joueur) ;
  // le choix du joueur l'emporte toujours.
  const open = shadyFoldOpenNow(room, company.id, view.turn, shadyFoldOpensItself(view, company));
  const rendered = useRef(open);
  rendered.current = open;
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const effects = modifiers.map((m) => t.shady.foldEffect(t.modifiers[m.kind] ?? m.kind, t.company.turnsLeft(m.turnsLeft)));
  const meta = [
    t.shady.foldScandal(scandal, t.scandalLevel[scandalLevelOf(rawScandal)]),
    ...(effects.length > 0 ? [t.shady.foldEffects(effects.length, effects.join(', '))] : []),
  ].join(' · ');

  return (
    <div className="shady">
      {priv && (
        <div id={SHADY_ANCHOR} tabIndex={-1} className="company-cols company-scandal">
          <ScandalGauge value={priv.scandal} />
          {(modifiers.length > 0 || crisis) && (
            <div className="shady-side">
              {modifiers.length > 0 && (
                <div>
                  <div className="small muted">{t.company.effects}</div>
                  <ul className="modifiers">
                    {modifiers.map((m, i) => {
                      const info = MODIFIER_INFO[m.kind];
                      return (
                        <li key={i} className={cx('modifier', info?.good ? 'good' : 'bad')}>
                          {info?.emoji} {t.modifiers[m.kind] ?? m.kind}
                          <span className="muted"> · {t.company.turnsLeft(m.turnsLeft)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {crisis && <CrisisCommsTile company={company} />}
            </div>
          )}
        </div>
      )}
      <details
        className="tab-fold shady-fold"
        open={open}
        onToggle={(e) => {
          const now = e.currentTarget.open;
          // Ouvert ou fermé par le rendu (la règle, un choix déjà retenu) : rien de neuf à retenir.
          if (now === rendered.current) return;
          rememberShadyFold(room, company.id, view.turn, now);
          rerender();
        }}
      >
        <summary>
          {t.shady.foldCount(SHADY_KINDS.length)} <span className="muted fold-meta">{`· ${meta}`}</span>
        </summary>
        <p className="shady-warning small">
          {t.shady.warning} <InfoTip text={t.shady.warningTip} align="left" />
        </p>
        <div className="shady-grid">
          {SHADY_KINDS.map((kind) => (
            <ShadyCard key={kind} kind={kind} company={company} done={done.includes(kind)} />
          ))}
        </div>
      </details>
    </div>
  );
}

/** Communication de crise (§7) : baisse la jauge et répare la réputation jusqu'à 1, une fois par trimestre. */
function CrisisCommsTile({ company }: { company: CompanyView }) {
  const t = useT();
  const fmt = useFmt();
  const f = t.finance;
  const [confirm, setConfirm] = useState(false);
  // Une seule par trimestre (le moteur refuse la deuxième).
  const crisisDone = company.private?.turnFlags.crisisDone === true;
  return (
    <div className="action-tile" id={CRISIS_COMMS_ANCHOR} tabIndex={-1}>
      <div>
        <strong>{f.crisisTitle}</strong>
        <p className="small muted">{f.crisisBody(fmt.money(CRISIS_COMMS_COST), CRISIS_COMMS_SCANDAL, fmt.num(CRISIS_COMMS_REPUTATION), fmt.num(CRISIS_COMMS_REPUTATION_CAP))}</p>
        {crisisDone && <p className="small muted italic">{f.crisisDone}</p>}
      </div>
      <button type="button" className="btn" disabled={crisisDone || Math.max(0, company.cash) < CRISIS_COMMS_COST} onClick={() => setConfirm(true)}>
        {f.apologize}
      </button>
      {confirm && (
        <ConfirmModal
          title={f.crisisConfirmTitle}
          message={<p>{f.crisisConfirmBody(fmt.money(CRISIS_COMMS_COST))}</p>}
          confirmLabel={f.publish}
          onConfirm={() => void sendAction({ type: 'crisisComms', companyId: company.id })}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

function ShadyCard({ kind, company, done }: { kind: ShadyKind; company: CompanyView; done: boolean }) {
  const { view } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const info = content.shadyInfo[kind];
  const rule = SHADY_RULES[kind];
  const mySectors = companySectors(company);
  const [sectorId, setSectorId] = useState<SectorId>(mySectors[0] ?? 'energy_drinks');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);

  // Cibles : entreprises actives que je ne contrôle pas (se dénigrer soi-même reste un art mineur).
  const others = view.companies.filter((c) => c.controllerId !== view.you && c.status === 'active');
  const targets =
    rule.target === 'competitor'
      ? others.filter((c) => c.products.some((p) => mySectors.includes(p.sectorId)))
      : rule.target === 'company'
        ? others
        : [];
  const target = targets.find((c) => c.id === targetId) ?? targets[0];
  // Espionnage : on ne copie que ce que la cible fait mieux (le moteur refuse sinon).
  const nothingToSpy = kind === 'industrial_espionage' && target !== undefined && espionageGains(company, view.companies, target.id).length === 0;

  const reason = done
    ? t.shady.done
    : company.cash < rule.cost
      ? t.shady.noCash
      : (rule.target === 'competitor' || rule.target === 'company') && !target
        ? t.shady.noTarget
        : nothingToSpy
          ? t.shady.spyNothing
          : null;

  const commit = async () => {
    setBusy(true);
    try {
      await sendAction({
        type: 'shady',
        companyId: company.id,
        kind,
        ...(rule.target === 'sector' ? { sectorId } : {}),
        ...(target && rule.target !== 'sector' && rule.target !== 'none' ? { targetCompanyId: target.id } : {}),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx('shady-card', done && 'done')}>
      <header>
        <span className="shady-emoji" aria-hidden>
          {info?.emoji ?? '🕶️'}
        </span>
        <strong>{info?.label ?? kind}</strong>
      </header>
      <p className="small">{info?.description}</p>
      <p className="small muted">{t.shady.effects[kind]}</p>
      <div className="shady-meta small">
        <span>{t.shady.cost(fmt.money(rule.cost))}</span>
        <span className="down">{t.shady.scandal(rule.scandal * (company.scandalMultiplier ?? 1))}</span>
      </div>
      {rule.target === 'sector' && (
        <select value={sectorId} onChange={(e) => setSectorId(e.target.value as SectorId)} aria-label={t.shady.sectorAria}>
          {SECTOR_IDS.map((id) => (
            <option key={id} value={id}>
              {content.sectors[id]?.emoji} {content.sectors[id]?.name ?? id}
            </option>
          ))}
        </select>
      )}
      {(rule.target === 'competitor' || rule.target === 'company') && targets.length > 0 && target && (
        <select value={target.id} onChange={(e) => setTargetId(e.target.value)} aria-label={t.shady.targetAria}>
          {targets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name} ({c.ticker})
            </option>
          ))}
        </select>
      )}
      <button type="button" className="btn danger" disabled={Boolean(reason) || busy} onClick={() => void commit()}>
        {done ? t.shady.doneBtn : busy ? t.common.ellipsis : t.shady.act}
      </button>
      {reason && !done && <p className="small muted italic">{reason}</p>}
    </div>
  );
}
