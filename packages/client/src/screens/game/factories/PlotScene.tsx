/**
 * Scène 2D d'un terrain (onglet « Mes usines », bêta) : chaque élément dessiné traduit un chiffre du produit.
 *   centre de R&D : taille = qualité, chercheurs aux fenêtres = budget R&D du trimestre ;
 *   usine : halles = capacité, fumée et caisses qui sortent = production, grue = capacité en chantier ;
 *   cour : caisses = stock ; boutique : étiquette = prix ; passants = demande estimée (servis ou non) ;
 *   panneaux : taille et nombre = notoriété, projecteurs = budget marketing du trimestre.
 * Pur affichage : rien ici ne touche aux règles.
 */
import type { ReactNode } from 'react';
import type { SectorId } from '@muchomoney/core';
import { SECTORS } from '@muchomoney/core';
import { factoryLevel, sceneWalkers, type ProductFlow } from './model';
import {
  Billboard,
  Crane,
  Crate,
  DARK,
  DEPTH,
  Fan,
  GREEN,
  GROUND,
  Ground,
  HAIR,
  Hall,
  INK,
  LAB_W,
  LIT,
  Lab,
  MIN_W,
  ASPECT,
  PAPER,
  Smoke,
  TOWER_W,
  HALL_W,
  Tower,
  Walkers,
  factoryWidth,
  shapeOf,
  type FactoryShape,
} from './parts';

/** Ce que le terrain montre, déjà traduit en quantités à dessiner. */
export interface SceneModel {
  sectorId: SectorId;
  color: string;
  flow: ProductFlow;
  /** Qualité → taille du centre de R&D (1 à 4). */
  lab: number;
  /** Budget R&D → chercheurs aux fenêtres (0 à 6). */
  researchers: number;
  /** Notoriété → panneaux (1 à 5). */
  billboard: number;
  /** Budget marketing → projecteurs (0 à 3). */
  spots: number;
  productName: string;
  priceLabel: string;
  greenwashing: boolean;
}

export interface SceneTexts {
  closed: string;
  opening: string;
  /** Bulles d'aide (survol) : un texte par élément. */
  tips: { lab: string; factory: string; crane?: string; stock: string; shop: string; billboard: string; walkers?: string };
}

function viewBox(width: number): { w: number; h: number; box: string } {
  const h = Math.round(width * ASPECT);
  return { w: width, h, box: `0 ${GROUND + DEPTH - h} ${width} ${h}` };
}

/**
 * `mini` : la miniature fixe de la colonne de gauche du plateau (≈ 0,7-0,95 px par unité). Ses textes y seraient
 * illisibles (étiquette de prix, panneaux, « Fermé », panneau du chantier) : le CSS les masque (`.plot-scene-mini`), les
 * formes, la pile de caisses, les passants et le « ! » rouge restent, avec leurs bulles d'aide.
 */
export function PlotScene({ model, texts, ariaLabel, still, mini = false }: { model: SceneModel; texts: SceneTexts; ariaLabel: string; still: boolean; mini?: boolean }) {
  const { flow, sectorId, color } = model;
  const crypto = sectorId === 'crypto';
  const building = flow.status === 'building';
  const levelNow = building ? 0 : factoryLevel(flow.capacity, sectorId);
  const levelNext = factoryLevel(flow.capacity + flow.pending, sectorId);
  const now = shapeOf(levelNow);
  const next = shapeOf(Math.max(levelNow, levelNext));
  const util = flow.capacity > 0 ? flow.planned / flow.capacity : 0;
  const producing = flow.planned > 0 && !building;

  // Centre de R&D à gauche, puis l'usine (tour, halles), la grue, la cour, la boutique et les panneaux.
  const labW = LAB_W[model.lab] ?? LAB_W[1];
  const fx = 8 + labW + 10;
  const towerNow = now.tower ? TOWER_W : 0;
  const towerNext = next.tower ? TOWER_W : 0;
  const hallX = (i: number) => fx + towerNext + i * HALL_W;
  const factoryEnd = fx + factoryWidth(next);
  const underConstruction = flow.pending > 0;
  const craneX = factoryEnd + 8;
  const yardX = underConstruction ? craneX + 20 : factoryEnd + 10;

  const crates = Math.max(0, Math.min(12, Math.ceil(flow.stock / flow.unit - 0.25)));
  const crateNodes: ReactNode[] = [];
  for (let i = 0; i < crates; i++) {
    const col = Math.floor(i / 3);
    const row = i % 3;
    crateNodes.push(<Crate key={i} x={yardX + col * 11} y={GROUND - 10 - row * 10} fill="#c9a86a" />);
  }
  const yardW = Math.max(24, Math.ceil(crates / 3) * 11);
  const shopX = yardX + yardW + 14;
  const doorX = shopX + 36;

  const chimneyX = (k: number, s: FactoryShape) => hallX(Math.min(s.halls - 1, Math.floor(((k + 0.5) * s.halls) / Math.max(1, s.chimneys)))) + 17;
  const puffs = !producing ? 0 : util > 0.66 ? 3 : util > 0.33 ? 2 : 1;

  const bb = [
    { w: 40, h: 20 },
    { w: 40, h: 20 },
    { w: 54, h: 24 },
    { w: 70, h: 30 },
    { w: 86, h: 34 },
    { w: 96, h: 36 },
  ][model.billboard] ?? { w: 40, h: 20 };
  const bbX = shopX + 54 + 12;
  const bbY = GROUND - 44 - bb.h;
  // La caméra recule quand le terrain se remplit ; à droite, le trottoir d'où arrivent les clients.
  const vb = viewBox(Math.max(MIN_W, bbX + bb.w + 44));
  const walkers = sceneWalkers(flow);
  const emoji = SECTORS[sectorId]?.emoji ?? '📦';

  return (
    <svg className={mini ? 'plot-scene plot-scene-mini' : 'plot-scene'} viewBox={vb.box} role="img" aria-label={ariaLabel}>
      <Ground width={vb.w} />

      <g>
        <title>{texts.tips.lab}</title>
        <Lab x={8} level={model.lab} researchers={model.researchers} still={still} />
      </g>

      {/* La grue passe derrière l'usine et le panneau du chantier. */}
      {underConstruction && (
        <g>
          {texts.tips.crane && <title>{texts.tips.crane}</title>}
          <Crane mx={craneX} hookX={Math.max(craneX - 60, factoryEnd - 14)} still={still} />
        </g>
      )}

      <g>
        <title>{texts.tips.factory}</title>
        {building ? (
          <g>
            {next.tower > 0 && <rect x={fx} y={GROUND - (next.tower === 2 ? 72 : 58)} width={TOWER_W} height={next.tower === 2 ? 72 : 58} fill="none" stroke={DARK} strokeDasharray="3 2" />}
            {Array.from({ length: next.halls }, (_, i) => (
              <Hall key={i} x={hallX(i)} color={color} crypto={crypto} lit={false} ghost />
            ))}
            {/* Palissade de chantier */}
            <path
              d={`M${fx - 4} ${GROUND - 12} H${factoryEnd + 4} ${Array.from({ length: Math.ceil((factoryEnd - fx + 8) / 10) + 1 }, (_, i) => `M${fx - 4 + i * 10} ${GROUND} V${GROUND - 14}`).join(' ')}`}
              stroke={INK}
              strokeWidth={0.9}
            />
            {/* Panneau « Ouverture T3 2027 » sur deux piquets, centré sur le chantier. */}
            {(() => {
              const w = Math.max(60, texts.opening.length * 4.4 + 12);
              const cx = Math.max(fx - 4 + w / 2, (fx + factoryEnd) / 2);
              return (
                <g>
                  <line x1={cx - w / 4} y1={GROUND} x2={cx - w / 4} y2={GROUND - 30} stroke={INK} strokeWidth={1} />
                  <line x1={cx + w / 4} y1={GROUND} x2={cx + w / 4} y2={GROUND - 30} stroke={INK} strokeWidth={1} />
                  <rect x={cx - w / 2} y={GROUND - 44} width={w} height={14} fill={LIT} stroke={INK} strokeWidth={0.9} />
                  <text x={cx} y={GROUND - 37} fontSize={6.8} textAnchor="middle" dominantBaseline="central" className="scene-sign" letterSpacing="0.02em">
                    {texts.opening}
                  </text>
                </g>
              );
            })()}
          </g>
        ) : (
          <g>
            {now.tower > 0 && <Tower x={fx + towerNext - towerNow} height={now.tower === 2 ? 72 : 58} color={model.greenwashing ? GREEN : color} lit={producing} flag={now.flag} />}
            {next.tower > now.tower && now.tower === 0 && (
              <rect x={fx} y={GROUND - 58} width={TOWER_W} height={58} fill="none" stroke={DARK} strokeDasharray="3 2" />
            )}
            {Array.from({ length: next.halls }, (_, i) =>
              i < now.halls ? (
                <Hall key={i} x={hallX(i)} color={color} crypto={crypto} lit={producing} green={model.greenwashing} still={still} />
              ) : (
                <Hall key={i} x={hallX(i)} color={color} crypto={crypto} lit={false} ghost />
              ),
            )}
            {Array.from({ length: now.chimneys }, (_, k) => {
              const cx = chimneyX(k, now);
              const top = GROUND - 66 - (k % 2) * 5;
              return crypto ? (
                <Fan key={k} cx={cx + 3} cy={GROUND - 42} spinning={producing} still={still} />
              ) : (
                <g key={k}>
                  <rect x={cx} y={top} width={6} height={GROUND - 44 - top} fill={PAPER} stroke={INK} strokeWidth={1} />
                  <rect x={cx} y={top + 3} width={6} height={3} fill={model.greenwashing ? GREEN : color} />
                  <Smoke x={cx + 3} y={top - 2} puffs={puffs} still={still} />
                </g>
              );
            })}
            {/* Quai : les caisses produites sortent vers la cour. */}
            {now.halls > 0 && (
              <g>
                <rect x={hallX(now.halls - 1) + 9} y={GROUND - 13} width={10} height={13} fill={producing ? INK : DARK} />
                {!producing && (
                  <g className="scene-closed">
                    <rect x={hallX(now.halls - 1) + 2} y={GROUND - 22} width={24} height={8} fill={PAPER} stroke="#b0271d" strokeWidth={0.8} />
                    <text x={hallX(now.halls - 1) + 14} y={GROUND - 17.8} fontSize={5.2} textAnchor="middle" dominantBaseline="central" fill="#b0271d" fontWeight={700}>
                      {texts.closed}
                    </text>
                  </g>
                )}
                {producing && !still &&
                  [0, 1].map((i) => (
                    <g key={i}>
                      <animateMotion dur="2.6s" begin={`${-i * 1.3}s`} repeatCount="indefinite" path={`M${hallX(now.halls - 1) + 14} ${GROUND - 5} H${yardX + 6}`} />
                      <rect x={-3} y={-3} width={6} height={6} fill="#c9a86a" stroke={INK} strokeWidth={0.5} />
                    </g>
                  ))}
              </g>
            )}
            {model.greenwashing && now.halls > 0 && (
              <text x={hallX(0) + 14} y={GROUND - 48} fontSize={9} textAnchor="middle" dominantBaseline="central">
                🌿
              </text>
            )}
          </g>
        )}
      </g>

      <g>
        <title>{texts.tips.stock}</title>
        <rect x={yardX - 3} y={GROUND - 1} width={48} height={3} fill={HAIR} />
        {crateNodes}
      </g>

      <g>
        <title>{texts.tips.shop}</title>
        <rect x={shopX} y={GROUND - 34} width={54} height={34} fill={PAPER} stroke={INK} strokeWidth={1.1} />
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={shopX - 3 + i * 10} y={GROUND - 42} width={10} height={9} fill={i % 2 ? PAPER : color} stroke={INK} strokeWidth={0.6} />
        ))}
        <path
          d={`M${shopX - 3} ${GROUND - 33} ${Array.from({ length: 6 }, (_, i) => `q5 5 10 0`).join(' ')}`}
          fill="none"
          stroke={INK}
          strokeWidth={0.6}
        />
        <rect x={shopX + 5} y={GROUND - 58} width={44} height={13} fill={PAPER} stroke={INK} strokeWidth={0.9} />
        <text x={shopX + 27} y={GROUND - 51.3} fontSize={8} textAnchor="middle" dominantBaseline="central" className="scene-price">
          {model.priceLabel}
        </text>
        <line x1={shopX + 14} y1={GROUND - 45} x2={shopX + 14} y2={GROUND - 42} stroke={INK} />
        <line x1={shopX + 40} y1={GROUND - 45} x2={shopX + 40} y2={GROUND - 42} stroke={INK} />
        <rect x={shopX + 5} y={GROUND - 24} width={17} height={14} fill="#eef2ee" stroke={INK} strokeWidth={0.8} />
        <text x={shopX + 13.5} y={GROUND - 17} fontSize={9} textAnchor="middle" dominantBaseline="central">
          {emoji}
        </text>
        <rect x={doorX - 6} y={GROUND - 20} width={12} height={20} fill={building ? DARK : INK} />
      </g>

      <g>
        <title>{texts.tips.billboard}</title>
        <Billboard x={bbX} y={bbY} w={bb.w} h={bb.h} name={model.productName} emoji={emoji} spots={model.spots} bulbs={model.billboard >= 4} still={still} />
        {model.billboard >= 5 && (
          <g>
            <rect x={shopX + 4} y={GROUND - 78} width={46} height={16} fill={color} stroke={INK} strokeWidth={0.9} />
            <text x={shopX + 27} y={GROUND - 70} fontSize={9} textAnchor="middle" dominantBaseline="central">
              {emoji} ★
            </text>
            <line x1={shopX + 27} y1={GROUND - 62} x2={shopX + 27} y2={GROUND - 58} stroke={INK} />
          </g>
        )}
      </g>

      <g>
        {texts.tips.walkers && <title>{texts.tips.walkers}</title>}
        <Walkers sectorId={sectorId} served={walkers.served} unserved={walkers.unserved} doorX={doorX} width={vb.w} still={still} />
      </g>
    </svg>
  );
}

/** Terrain libre : un emplacement de produit encore disponible. */
export function EmptyPlotScene({ sign, ariaLabel }: { sign: string; ariaLabel: string }) {
  const vb = viewBox(MIN_W);
  return (
    <svg className="plot-scene" viewBox={vb.box} role="img" aria-label={ariaLabel}>
      <Ground width={vb.w} />
      <rect x={30} y={GROUND - 4} width={290} height={4} fill="none" stroke={DARK} strokeDasharray="4 3" />
      {[60, 110, 190, 250, 300].map((x, i) => (
        <path key={x} d={`M${x} ${GROUND} l-3 -5 M${x} ${GROUND} l0 -6 M${x} ${GROUND} l3 -5`} stroke={GREEN} strokeWidth={1} opacity={0.7 + (i % 2) * 0.3} />
      ))}
      {[{ x: 340, h: 40 }, { x: 374, h: 30 }].map((tree) => (
        <g key={tree.x}>
          <line x1={tree.x} y1={GROUND} x2={tree.x} y2={GROUND - tree.h + 10} stroke={INK} strokeWidth={1.4} />
          <circle cx={tree.x} cy={GROUND - tree.h + 4} r={12} fill="#b9cf9a" stroke={INK} strokeWidth={1} />
        </g>
      ))}
      <line x1={150} y1={GROUND} x2={150} y2={GROUND - 40} stroke={INK} strokeWidth={1.4} />
      <line x1={210} y1={GROUND} x2={210} y2={GROUND - 40} stroke={INK} strokeWidth={1.4} />
      <rect x={126} y={GROUND - 72} width={108} height={34} fill={PAPER} stroke={INK} strokeWidth={1.4} />
      <text x={180} y={GROUND - 55} fontSize={13} textAnchor="middle" dominantBaseline="central" className="scene-sign" fill="#b0271d">
        {sign}
      </text>
    </svg>
  );
}
