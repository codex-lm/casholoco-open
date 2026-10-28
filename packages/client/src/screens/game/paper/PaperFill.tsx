/**
 * Bas de page du journal : « Le chiffre du trimestre » et les rubriques burlesques (courrier des
 * lecteurs, faits divers, horoscope des affaires, petites annonces). Purement décoratif, dans la
 * langue du salon, sans aucun élément interactif (les tests du journal comptent les boutons).
 *
 * La zone (.paper-fill) occupe exactement le vide de la colonne de gauche (rangée de grille bornée
 * par la colonne de droite, plancher ~250 px côté CSS) : on rend tous les blocs candidats puis on
 * retire les blocs de plus basse priorité (annonces, puis horoscope, puis faits divers, puis la
 * réclame, puis la deuxième lettre du courrier, puis le courrier — jamais l'encadré chiffré) tant
 * que ça déborde.
 * Dans jsdom les mesures valent 0 : tout est rendu, le CSS
 * (overflow: hidden) garde la vraie mise en page. Sur téléphone (< 900 px), pas d'ajustement :
 * la rangée est en hauteur automatique (rien ne déborde jamais) et les annonces sont cachées en CSS.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { JournalIssue } from '@muchomoney/core';
import { useGame } from '../../../hooks/useGame';
import { messages, type Messages } from '../../../i18n';
import { useFmt, type Fmt } from '../../../fmt';
import { pickFigure, type PaperFigure } from './figure';
import { pickReclame, pickRubrics, type PaperReclame, type PaperRubrics } from './rubrics';

/** Blocs masquables, dans l'ordre où on les sacrifie : annonces, horoscope, faits divers, réclame, puis la 2e lettre du courrier, puis le courrier entier (l'encadré chiffré, ~150 px, tient toujours dans le plancher de 232 px). */
const DROPPABLE = ['ads', 'horo', 'odd', 'reclame', 'letter2', 'letters'] as const;
type Droppable = (typeof DROPPABLE)[number];

function figureNumber(figure: PaperFigure, fmt: Fmt): string {
  if (figure.kind === 'turns') return fmt.int(figure.turns);
  if (figure.kind === 'commodity' || figure.kind === 'sector') return fmt.signedPct(figure.pct, 0);
  return fmt.money(figure.amount);
}

function figureCaption(figure: PaperFigure, quarter: string, t: Messages): string {
  const c = t.journal.paper.figureCaption;
  switch (figure.kind) {
    case 'fines':
      return c.fines(quarter, figure.count);
    case 'bonuses':
      return c.bonuses(quarter, figure.count);
    case 'dividends':
      return c.dividends(quarter, figure.count);
    case 'tax':
      return c.tax(quarter);
    case 'commodity':
      return c.commodity(figure.name, quarter);
    case 'sector':
      return c.sector(figure.name, quarter);
    case 'gap':
      return c.gap(quarter);
    case 'turns':
      return c.turns();
  }
}

/** L'encadré chiffré, entre doubles filets ; aussi utilisé dans les brèves quand il n'y en a qu'une. */
export function FigureBox({ figure, quarter, fmt, t }: { figure: PaperFigure; quarter: string; fmt: Fmt; t: Messages }) {
  return (
    <div className={`figure-box tone-${figure.tone}`}>
      <div className="figure-kicker">{t.journal.paper.figure}</div>
      <div className="figure-num">{figureNumber(figure, fmt)}</div>
      <div className="figure-caption">{figureCaption(figure, quarter, t)}</div>
      {figure.quip && <div className="figure-quip">{figure.quip}</div>}
    </div>
  );
}

function LettersBlock({ letters, t }: { letters: PaperRubrics['letters']; t: Messages }) {
  if (!letters.length) return null;
  return (
    <div className="paper-block paper-letters">
      <h3 className="rubric">{t.journal.paper.letters}</h3>
      {letters.map((l) => (
        <p key={l.id}>
          {t.quote(l.text)}
          {l.signature && <span className="sig"> — {l.signature}</span>}
        </p>
      ))}
    </div>
  );
}

function OddBlock({ rubrics, t }: { rubrics: PaperRubrics; t: Messages }) {
  if (!rubrics.oddNews.length) return null;
  return (
    <div className="paper-block paper-odd">
      <h3 className="rubric">{t.journal.paper.odd}</h3>
      {rubrics.oddNews.map((o) => (
        <p key={o.id}>{o.place ? <><b className="place">{o.place}.</b> {o.text}</> : o.text}</p>
      ))}
    </div>
  );
}

function HoroBlock({ rubrics, t }: { rubrics: PaperRubrics; t: Messages }) {
  if (!rubrics.horoscope.length) return null;
  return (
    <div className="paper-block paper-horo">
      <h3 className="rubric">{t.journal.paper.horoscope}</h3>
      {rubrics.horoscope.map((s) => (
        <p key={s.id}>
          <b>{s.name}</b> · {s.text}
        </p>
      ))}
    </div>
  );
}

function AdsBlock({ rubrics, t }: { rubrics: PaperRubrics; t: Messages }) {
  if (!rubrics.ads.length) return null;
  return (
    <div className="paper-block paper-ads">
      <h3 className="rubric">{t.journal.paper.ads}</h3>
      {rubrics.ads.map((a) => (
        <p key={a.id} className="paper-ad">
          <b>{a.head}</b> {a.text} <span className="ref">{t.journal.paper.ref(a.ref)}</span>
        </p>
      ))}
    </div>
  );
}

/** L'encadré réclame, entre doubles filets comme le chiffre : pub achetée par le plus gros annonceur du trimestre clos. */
function ReclameBlock({ rec, quarter, fmt, t }: { rec: PaperReclame; quarter: string; fmt: Fmt; t: Messages }) {
  return (
    <div className="paper-reclame">
      <div className="figure-kicker">{t.journal.paper.reclame}</div>
      <p className="reclame-text">{rec.text}</p>
      {rec.legal.map((line, i) => (
        <p key={i} className="reclame-legal">
          {line}
        </p>
      ))}
      <p className="reclame-footer">{t.journal.paper.reclameFooter(rec.company, fmt.money(rec.amount), quarter)}</p>
    </div>
  );
}

export function PaperFill({ issue, figure }: { issue: JournalIssue; figure: PaperFigure | null }) {
  const { view } = useGame();
  const fmt = useFmt();
  const t = messages(fmt.lang);
  const rubrics = pickRubrics(issue, view, fmt.lang);
  const reclame = pickReclame(issue, view, fmt.lang);
  const [dropped, setDropped] = useState(0);
  const [el, setEl] = useState<HTMLElement | null>(null);

  // Boucle d'ajustement bornée : un bloc de moins par rendu tant que le contenu dépasse la rangée.
  useLayoutEffect(() => {
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 1 && dropped < DROPPABLE.length) setDropped(dropped + 1);
    // Filet de sécurité : tout le masquable est sacrifié et ça déborde encore — laisser la rangée
    // grandir plutôt que rogner. Le remontage (clé numéro|langue dans JournalTab) efface ce style.
    if (dropped === DROPPABLE.length && el.scrollHeight > el.clientHeight + 1) el.style.minHeight = `${el.scrollHeight}px`;
    else if (el.style.minHeight) el.style.minHeight = '';
  });

  // La rangée change de hauteur avec la colonne de droite (ex. après l'achat d'un tuyau) : re-mesurer.
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const overflow = el.scrollHeight > el.clientHeight + 1;
      // Tout changement de taille : si des blocs sont cachés, repartir de zéro (l'effet de mise en
      // page ci-dessus re-sacrifie un bloc par rendu avant affichage) ; sinon rogner si ça déborde.
      // Rendu synchrone, avant que le navigateur ne peigne une image où le contenu déborde.
      flushSync(() => setDropped((d) => (d > 0 ? 0 : overflow ? 1 : 0)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  // Les vraies fontes changent les hauteurs : on repart de zéro une fois chargées.
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) setDropped(0);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!rubrics && !figure && !reclame) return null;
  const hidden = new Set<Droppable>(DROPPABLE.slice(0, dropped));
  return (
    <section className={`paper-fill${dropped >= DROPPABLE.length ? ' grow' : ''}`} ref={setEl}>
      {figure && <FigureBox figure={figure} quarter={fmt.date(figure.quarter, view.config.startYear)} fmt={fmt} t={t} />}
      {rubrics && (
        <div className="paper-fill-cols">
          <div className="paper-fill-col">
            <LettersBlock letters={hidden.has('letters') ? [] : hidden.has('letter2') ? rubrics.letters.slice(0, 1) : rubrics.letters} t={t} />
            {!hidden.has('reclame') && reclame && <ReclameBlock rec={reclame} quarter={fmt.date(reclame.quarter, view.config.startYear)} fmt={fmt} t={t} />}
            {!hidden.has('ads') && <AdsBlock rubrics={rubrics} t={t} />}
          </div>
          <div className="paper-fill-col">
            {!hidden.has('odd') && <OddBlock rubrics={rubrics} t={t} />}
            {!hidden.has('horo') && <HoroBlock rubrics={rubrics} t={t} />}
          </div>
        </div>
      )}
    </section>
  );
}
