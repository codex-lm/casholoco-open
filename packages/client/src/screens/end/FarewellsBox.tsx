import { useGame } from '../../hooks/useGame';
import { Section } from '../../components/bits';
import { useContent, useT } from '../../i18n';
import { useFmt } from '../../fmt';
import { pickFarewells } from './farewells';

/** Boîte « Ils ont dit » : une réplique d'adieu par bot, sous le classement final.
 *  Fichier nommé FarewellsBox.tsx (et non Farewells.tsx) : sur Windows, « Farewells.tsx » et « farewells.ts » entreraient en collision. */
export function Farewells() {
  const { view, playersById } = useGame();
  const t = useT();
  const fmt = useFmt();
  const content = useContent();
  const lines = pickFarewells(view, content);
  if (lines.length === 0) return null;
  const ranking = view.results?.ranking.length
    ? view.results.ranking
    : [...view.players].sort((a, b) => b.netWorth - a.netWorth).map((p) => ({ playerId: p.id, netWorth: p.netWorth }));
  const byId = new Map(ranking.map((r, i) => [r.playerId, { rank: i + 1, netWorth: r.netWorth }]));

  return (
    <Section title={t.end.farewells} className="farewells">
      {lines.map((line) => {
        const p = playersById.get(line.playerId);
        const r = byId.get(line.playerId);
        if (!p || !r) return null;
        const text =
          line.neutral && p.botTakeover
            ? t.end.farewellHandover(p.botTakeover.previousName, p.name, fmt.date(p.botTakeover.activeFromTurn, view.config.startYear))
            : line.text;
        return (
          <blockquote key={line.playerId} className="farewell">
            <p className="farewell-text">{text}</p>
            <footer className="farewell-byline">
              — {p.name}, {t.end.farewellRank(r.rank)}, {fmt.money(r.netWorth)}
            </footer>
          </blockquote>
        );
      })}
    </Section>
  );
}
