import { useState } from 'react';
import type { Article, JournalIssue, Rumor } from '@muchomoney/core';
import { formatMoney } from '@muchomoney/core';
import { sendAction } from '../../api';
import { useGame } from '../../hooks/useGame';
import { Delta, Empty } from '../../components/bits';
import { ConfirmModal } from '../../components/Modal';
import { priceChange } from '../../rules';
import { cx } from '../../util';
import { messages, useRoomContent, useT, useUiLang } from '../../i18n';
import { Rich } from '../../i18n/Rich';
import { useFmt } from '../../fmt';
import { IssueNav } from './IssueNav';
import { FigureBox, PaperFill } from './paper/PaperFill';
import { pickFigure } from './paper/figure';
import { navigationDetailsMessages } from '../../i18n/navigationDetails';
import './navigationDetails.css';

const RELIABILITY_DOTS: Record<Rumor['reliability'], number> = { faible: 1, moyenne: 2, élevée: 3 };
interface CompanyNavigation {
  openCompany?: (companyId: string) => void;
  openStock?: (companyId: string) => void;
}

/**
 * `selectedTurn` : numéro conservé par la partie ; null suit le dernier paru.
 * `onTimeline` : ouvrir la chronologie (onglet Classement) sur le trimestre du numéro affiché.
 */
export function JournalTab({ selectedTurn, onSelectTurn, onTimeline, openCompany, openStock }: CompanyNavigation & {
  selectedTurn: number | null;
  onSelectTurn: (turn: number | null) => void;
  onTimeline?: (turn: number) => void;
}) {
  const { view } = useGame();
  const t = useT();
  const issues = view.journal;
  const latest = issues[issues.length - 1];
  const issue = issues.find((i) => i.turn === selectedTurn) ?? latest;

  if (!issue) return <Empty>{t.journal.firstIssue}</Empty>;
  const isCurrent = issue === latest;
  const select = (turn: number | null) => onSelectTurn(turn === null || turn === latest.turn ? null : turn);

  return (
    <div className="journal-wrap">
      {/* La frise est passée sous le graphique des fortunes ; la barre tient lieu d'archives. */}
      <IssueNav issue={issue} isCurrent={isCurrent} onSelect={select} onTimeline={onTimeline} />
      <Newspaper key={issue.turn} issue={issue} isCurrent={isCurrent} openCompany={openCompany} openStock={openStock} />
    </div>
  );
}

function Newspaper({ issue, isCurrent, ...navigation }: CompanyNavigation & { issue: JournalIssue; isCurrent: boolean }) {
  const { view } = useGame();
  const fmt = useFmt();
  // Les rubriques et les articles partagent la langue du salon.
  const t = messages(fmt.lang);
  const content = useRoomContent();
  const headline = issue.articles.find((a) => a.kind === 'headline');
  const rest = issue.articles.filter((a) => a !== headline);
  const flashes = rest.filter((a) => a.kind === 'flash').reverse();
  const results = rest.filter((a) => a.kind === 'results');
  const briefs = rest.filter((a) => a.kind === 'news' || a.kind === 'headline');
  const quotes = rest.filter((a) => a.kind === 'quote');
  // « Le chiffre du trimestre » : dans les brèves quand il n'y en a qu'une, sinon en tête du bas de page.
  const figure = pickFigure(issue, view, fmt.lang);
  const figureInBriefs = figure !== null && briefs.length === 1;

  return (
    <article className="paper" lang={fmt.lang}>
      <header className="paper-masthead">
        <div className="paper-meta small">
          <span>{t.journal.issueNo(issue.turn)}</span>
          <span>{issue.dateLabel}</span>
          <span>{isCurrent ? t.journal.today : t.journal.archives}</span>
          {/* Le prix du numéro reste en unités, comme le reste du journal (formatMoney) : « 3 000 € », « $3,000 ». */}
          <span>{t.journal.price(formatMoney(3, fmt.lang))}</span>
        </div>
        <h1 className="paper-title">{t.common.paperName}</h1>
        <div className="paper-motto small">{t.journal.motto}</div>
      </header>

      {isCurrent && (
        <div className="paper-ticker small" aria-label={t.journal.tickerAria}>
          {view.commodities.map((c) => (
            <span key={c.id}>
              {c.emoji} {content.commodities[c.id]?.name ?? c.name} {fmt.sharePrice(c.price)} <Delta value={priceChange(c.priceHistory, c.price)} />
            </span>
          ))}
          <span>{t.journal.rate(fmt.pct(view.interestRate, 2))}</span>
          <span>{t.journal.tax(fmt.pct(view.taxRate, 0))}</span>
          <span>
            {t.journal.mood} {view.marketSentiment >= 1 ? '😀' : '😟'} ×{fmt.fixed(view.marketSentiment, 2)}
          </span>
        </div>
      )}

      {flashes.length > 0 && (
        <section className="flashes">
          <div className="flash-label">{t.journal.flash}</div>
          <ul>
            {flashes.map((a) => (
              <li key={a.id} className={`tone-${a.tone}`}>
                <strong>{a.title}</strong>
                {a.body && <span> — {a.body}</span>}
                <CompanyChips article={a} {...navigation} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="paper-grid">
        <div className="paper-main">
          {headline ? (
            <section className={cx('une', `tone-${headline.tone}`)}>
              <div className="kicker">{t.journal.front}</div>
              <h2>{headline.title}</h2>
              {headline.body && <p className="dropcap">{headline.body}</p>}
              <CompanyChips article={headline} {...navigation} />
            </section>
          ) : (
            <section className="une">
              <div className="kicker">{t.journal.front}</div>
              <h2>{t.journal.nothingTitle}</h2>
              <p className="dropcap">{t.journal.nothingBody}</p>
            </section>
          )}

          {briefs.length > 0 && (
            <section className="briefs">
              <h3 className="rubric">{t.journal.briefs}</h3>
              <div className={cx('briefs-cols', briefs.length === 1 && (figureInBriefs ? 'with-figure' : 'single'))}>
                {briefs.map((a) => (
                  <ArticleBlock key={a.id} article={a} {...navigation} />
                ))}
                {figureInBriefs && <FigureBox figure={figure} quarter={fmt.date(figure.quarter, view.config.startYear)} fmt={fmt} t={t} />}
              </div>
            </section>
          )}
        </div>

        {/* Clé numéro|langue : nouveau contenu = remontage, donc nouvelle mesure depuis zéro. */}
        <PaperFill key={`${issue.turn}|${fmt.lang}|${issue.articles.length}`} issue={issue} figure={figureInBriefs ? null : figure} />

        <aside className="paper-side">
          <section>
            <h3 className="rubric">{t.journal.results}</h3>
            {results.length ? (
              results.map((a) => <ArticleBlock key={a.id} article={a} {...navigation} />)
            ) : (
              <p className="muted small">{t.journal.noResults}</p>
            )}
          </section>

          {quotes.map((q, i) => (
            <section key={q.id} className="quote">
              {/* L'édito, poussé par le moteur à chaque parution : dernière citation et seule à porter des sectorIds. */}
              <h3 className="rubric">{i === quotes.length - 1 && q.sectorIds?.length ? t.journal.paper.editorial : t.journal.quote}</h3>
              <blockquote>{q.title}</blockquote>
              {q.body && <div className="quote-author small">— {q.body}</div>}
            </section>
          ))}

          <section className="rumors">
            <h3 className="rubric">{t.journal.rumors}</h3>
            {issue.rumors.length ? (
              <ul>
                {issue.rumors.map((r, i) => (
                  <li key={i}>
                    <p className="italic">{t.quote(r.text)}</p>
                    <div className="reliability small">
                      {t.journal.reliability}{' '}
                      <span className="rel-dots" aria-label={t.reliability[r.reliability] ?? r.reliability}>
                        {[1, 2, 3].map((d) => (
                          <span key={d} className={cx('rel-dot', d <= RELIABILITY_DOTS[r.reliability] && 'on')} />
                        ))}
                      </span>{' '}
                      {t.reliability[r.reliability] ?? r.reliability}
                    </div>
                    <RumorTip turn={issue.turn} index={i} isCurrent={isCurrent} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{t.journal.noRumors}</p>
            )}
            {isCurrent && issue.rumors.length > 0 && <TipUsedNote turn={issue.turn} />}
            <p className="small muted">{t.journal.disclaimer}</p>
          </section>
        </aside>
      </div>
    </article>
  );
}

/**
 * Tuyau (§7) : sous une rumeur du numéro du jour, payer une source pour savoir si elle est vraie ; ensuite, le
 * verdict (visible de vous seul). Contrôles dans la langue de l'interface, au milieu d'un journal dans celle du salon.
 */
function RumorTip({ turn, index, isCurrent }: { turn: number; index: number; isCurrent: boolean }) {
  const { view, me } = useGame();
  const ui = useT();
  const uiLang = useUiLang();
  const fmt = useFmt();
  const [asking, setAsking] = useState(false);
  const self = view.self;
  if (!self) return null;
  const checks = self.rumorChecks ?? [];
  const verdict = checks.find((c) => c.turn === turn && c.index === index);
  if (verdict) {
    return (
      <div className={cx('tip-verdict small', verdict.truthful ? 'up' : 'down')} lang={uiLang}>
        {verdict.truthful ? ui.tip.truthful : ui.tip.false}
      </div>
    );
  }
  if (!isCurrent || view.phase !== 'playing' || checks.some((c) => c.turn === turn)) return null;
  const price = fmt.money(self.rumorCheckPrice);
  const noCash = me.cash < self.rumorCheckPrice;
  return (
    <>
      <button
        type="button"
        className="btn tiny ghost tip-btn"
        lang={uiLang}
        aria-label={ui.tip.aria(price)}
        disabled={noCash}
        title={noCash ? ui.tip.noCash : undefined}
        onClick={() => setAsking(true)}
      >
        <span aria-hidden>🕵️ </span>
        {ui.tip.button(price)}
      </button>
      {asking && (
        <ConfirmModal
          title={ui.tip.confirmTitle}
          message={<Rich text={ui.tip.confirmBody(price)} />}
          confirmLabel={ui.tip.confirm}
          onConfirm={() => void sendAction({ type: 'checkRumor', turn, index })}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}

/** Une fois le tuyau du trimestre acheté, les autres rumeurs n'ont plus de bouton : le dire. */
function TipUsedNote({ turn }: { turn: number }) {
  const { view } = useGame();
  const ui = useT();
  const uiLang = useUiLang();
  if (!view.self?.rumorChecks?.some((c) => c.turn === turn)) return null;
  return (
    <p className="small muted" lang={uiLang}>
      {ui.tip.used}
    </p>
  );
}

function ArticleBlock({ article, ...navigation }: CompanyNavigation & { article: Article }) {
  return (
    <div className={cx('article', `tone-${article.tone}`)}>
      <h4>{article.title}</h4>
      {article.body && <p>{article.body}</p>}
      <CompanyChips article={article} {...navigation} />
    </div>
  );
}

function CompanyChips({ article, openCompany, openStock }: CompanyNavigation & { article: Article }) {
  const { companiesById, view } = useGame();
  const uiLang = useUiLang();
  const labels = navigationDetailsMessages(uiLang);
  const ids = article.companyIds ?? [];
  const companies = ids.map((id) => companiesById.get(id)).filter((c) => c !== undefined);
  if (!companies.length) return null;
  return (
    <span className="company-chips">
      {companies.map((c) => {
        const owned = c.controllerId === view.you && c.status === 'active';
        const navigate = owned && openCompany ? openCompany : openStock;
        const label = owned && openCompany ? labels.companyLink(c.name) : labels.stockLink(c.name);
        return navigate ? <button key={c.id} type="button" className="ticker-chip ticker-chip-link" lang={uiLang}
          data-journal-company={c.id} title={label} aria-label={label} onClick={() => navigate(c.id)}>{c.ticker}</button>
          : <span key={c.id} className="ticker-chip" title={c.name}>{c.ticker}</span>;
      })}
    </span>
  );
}
