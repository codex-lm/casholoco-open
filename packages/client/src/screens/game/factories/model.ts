/**
 * Onglet « Mes usines » (bêta) : lecture visuelle des chiffres d'un produit, sans règle nouvelle.
 * Tout vient de la PlayerView (capacité, production décidée, stock, estimation des ventes §5.2,
 * parts de marché) : ces fonctions pures ne font que répartir ces chiffres en pictogrammes.
 */
import type { CompanyView, ProductView, SectorId, SectorView } from '@muchomoney/core';
import { SECTORS } from '@muchomoney/core';

// ---------------------------------------------------------------------------
// Pictogrammes : 1 icône = `unit` lots
// ---------------------------------------------------------------------------

/** Pas « ronds » : 1, 2, 2,5 et 5 × 10ⁿ. */
const UNIT_STEPS = [1, 2, 2.5, 5, 10];

/** Nombre maximal d'icônes sur une ligne de pictogrammes. */
export const MAX_ICONS = 20;

/** Plus petit pas « rond » (au moins 1) tel que `maxLots` tienne en `maxIcons` icônes. */
export function pictoUnit(maxLots: number, maxIcons = MAX_ICONS): number {
  const need = Math.max(0, Number.isFinite(maxLots) ? maxLots : 0) / Math.max(1, maxIcons);
  if (need <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(need));
  for (const m of UNIT_STEPS) if (m * p >= need - 1e-9) return m * p;
  return 10 * p;
}

// ---------------------------------------------------------------------------
// Offre et demande d'un produit ce trimestre
// ---------------------------------------------------------------------------

/**
 * - building : lancé ce trimestre, l'usine ouvre au suivant ;
 * - idle : rien à vendre (production à 0 et stock vide) ;
 * - shortage / surplus / balanced : demande estimée au-dessus, au-dessous ou au niveau de l'offre ;
 * - unknown : pas d'estimation (fin de partie).
 */
export type FlowStatus = 'building' | 'idle' | 'shortage' | 'surplus' | 'balanced' | 'unknown';

export interface ProductFlow {
  capacity: number;
  /** Capacité en chantier, livrée au prochain trimestre. */
  pending: number;
  /** Production décidée (peut dépasser la capacité). */
  requested: number;
  /** Lots réellement produits à la clôture : ⌊min(production, capacité)⌋ (§5.3). */
  planned: number;
  stock: number;
  /** Stock + production : ce qui peut être vendu ce trimestre. */
  available: number;
  /** Demande estimée au prix actuel (§5.2), null sans estimation. */
  demand: number | null;
  sales: number | null;
  /** Demande non servie (lots). */
  shortage: number;
  /** Lots invendus en fin de trimestre, avant péremption. */
  surplus: number;
  /** Part des invendus perdue à la clôture (péremption du secteur). */
  spoiled: number;
  perishability: number;
  status: FlowStatus;
  /** Lots par icône, commun à l'offre et à la demande pour qu'elles se comparent à l'œil. */
  unit: number;
}

export function productFlow(p: ProductView): ProductFlow {
  const priv = p.private;
  const capacity = Math.max(0, p.capacity);
  const pending = Math.max(0, priv?.pendingCapacity ?? 0);
  const requested = Math.max(0, priv?.production ?? 0);
  const planned = Math.floor(Math.min(requested, capacity));
  const stock = Math.max(0, priv?.stock ?? 0);
  const available = stock + planned;
  const building = p.comingSoon === true;
  const est = building ? undefined : priv?.estimate;
  const demand = est ? Math.max(0, est.demand) : null;
  const sales = est ? Math.max(0, Math.min(est.sales, available)) : null;
  const perishability = Math.min(1, Math.max(0, (SECTORS[p.sectorId]?.perishability ?? 0) * (priv?.market?.perishabilityMultiplier ?? 1)));
  const shortage = demand !== null ? Math.max(0, demand - available) : 0;
  const surplus = demand !== null ? Math.max(0, available - demand) : 0;

  let status: FlowStatus;
  if (building) status = 'building';
  else if (available < 0.5) status = 'idle';
  else if (demand === null) status = 'unknown';
  else {
    // Tolérance de 5 % (au moins un lot) : un écart d'un lot sur soixante n'est pas une alerte.
    const tolerance = Math.max(1, 0.05 * Math.max(demand, available));
    status = shortage > tolerance ? 'shortage' : surplus > tolerance ? 'surplus' : 'balanced';
  }

  return {
    capacity,
    pending,
    requested,
    planned,
    stock,
    available,
    demand,
    sales,
    shortage,
    surplus,
    spoiled: surplus * perishability,
    perishability,
    status,
    unit: pictoUnit(Math.max(stock + capacity + pending, demand ?? 0)),
  };
}

/** Segment d'une ligne de pictogrammes, en icônes (fractionnaires). */
export interface PictoSegment {
  from: number;
  to: number;
  kind: 'stock' | 'made' | 'spare' | 'pending' | 'served' | 'unserved';
  /** Lots offerts au-delà de la demande estimée : ils resteront en stock. */
  unsold?: boolean;
}

function cut(segments: PictoSegment[], at: number): PictoSegment[] {
  return segments.flatMap((s) =>
    at > s.from && at < s.to ? [{ ...s, to: at }, { ...s, from: at }] : [s],
  );
}

/** Ligne « offre » : stock, production, capacité inutilisée, capacité en chantier. */
export function supplySegments(flow: ProductFlow): PictoSegment[] {
  const u = flow.unit;
  const parts: [PictoSegment['kind'], number][] = [
    ['stock', flow.stock],
    ['made', flow.planned],
    ['spare', Math.max(0, flow.capacity - flow.planned)],
    ['pending', flow.pending],
  ];
  let x = 0;
  let out: PictoSegment[] = [];
  for (const [kind, lots] of parts) {
    if (!(lots > 1e-9)) continue;
    out.push({ from: x, to: x + lots / u, kind });
    x += lots / u;
  }
  if (flow.demand !== null && flow.surplus > 0) {
    const limit = flow.demand / u;
    out = cut(out, limit).map((s) =>
      (s.kind === 'stock' || s.kind === 'made') && s.from >= limit - 1e-9 ? { ...s, unsold: true } : s,
    );
  }
  return out;
}

/** Ligne « demande » : clients servis, puis clients qui repartent les mains vides. */
export function demandSegments(flow: ProductFlow): PictoSegment[] {
  if (flow.demand === null || !(flow.demand > 1e-9)) return [];
  const u = flow.unit;
  const served = Math.min(flow.demand, flow.sales ?? flow.demand) / u;
  const total = flow.demand / u;
  const out: PictoSegment[] = [];
  if (served > 1e-9) out.push({ from: 0, to: served, kind: 'served' });
  if (total - served > 1e-9) out.push({ from: served, to: total, kind: 'unserved' });
  return out;
}

// ---------------------------------------------------------------------------
// L'usine qui grandit
// ---------------------------------------------------------------------------

/** Seuils de capacité (en multiple de la capacité de départ du secteur) : un niveau d'usine par seuil franchi. */
export const LEVEL_STEPS = [0.8, 1.1, 1.35, 1.65, 2, 2.5, 3.2];
export const MAX_FACTORY_LEVEL = LEVEL_STEPS.length + 1;

/** Niveau de l'usine, de 1 à 8 (0 = rien de construit). Une ligne neuve est au niveau 2 ; +20 % de capacité suffisent à la faire grandir. */
export function factoryLevel(capacity: number, sectorId: SectorId): number {
  if (!(capacity > 0)) return 0;
  const start = SECTORS[sectorId]?.startingCapacity || 1;
  const r = capacity / start;
  return 1 + LEVEL_STEPS.filter((s) => r >= s - 1e-9).length;
}

/** Passants dans la scène : au plus 8, servis puis déçus, en proportion de la demande estimée. */
export function sceneWalkers(flow: ProductFlow): { served: number; unserved: number } {
  if (flow.demand === null || !(flow.demand > 0.5)) return { served: 0, unserved: 0 };
  const total = Math.max(1, Math.min(8, Math.round(flow.demand / flow.unit / 2.5)));
  // À l'arrêt, personne n'est servi.
  if (flow.status === 'idle') return { served: 0, unserved: total };
  if (flow.status !== 'shortage') return { served: total, unserved: 0 };
  const unserved = Math.max(1, Math.min(total, Math.round((total * flow.shortage) / flow.demand)));
  return { served: total - unserved, unserved };
}

// ---------------------------------------------------------------------------
// Parts de marché et concurrents du secteur
// ---------------------------------------------------------------------------

/** Répartit `n` icônes proportionnellement aux poids (plus forts restes). */
export function allocate(weights: number[], n: number): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const total = w.reduce((a, b) => a + b, 0);
  if (!(total > 0) || n <= 0) return w.map(() => 0);
  const raw = w.map((x) => (x / total) * n);
  const out = raw.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

export interface ShareGroup {
  key: string;
  name: string;
  color: string;
  share: number;
  /** 'focus' = ce produit, 'own' = un autre de mes produits, 'rival', 'others' = concurrents hors jeu. */
  role: 'focus' | 'own' | 'rival' | 'others';
  icons: number;
}

/** Foule de `n` clients du secteur au dernier trimestre, par produit. Vide avant les premières ventes. */
export function shareCrowd(sector: SectorView | undefined, companies: CompanyView[], productId: string, you: string, n = 20): ShareGroup[] {
  if (!sector) return [];
  const byId = new Map(companies.map((c) => [c.id, c]));
  const products = sector.shares.filter((s) => s.productId !== 'others');
  if (!products.some((s) => s.share > 0)) return [];
  const role = (s: SectorView['shares'][number]): ShareGroup['role'] => {
    if (s.productId === 'others') return 'others';
    if (s.productId === productId) return 'focus';
    return s.companyId && byId.get(s.companyId)?.controllerId === you ? 'own' : 'rival';
  };
  const rank: Record<ShareGroup['role'], number> = { focus: 0, own: 1, rival: 2, others: 3 };
  const groups = sector.shares
    .filter((s) => s.share > 0 || s.productId === productId)
    .map((s) => ({
      key: s.productId,
      name: s.name,
      color: s.companyId ? (byId.get(s.companyId)?.color ?? '#888') : '#bbb',
      share: Math.max(0, s.share),
      role: role(s),
      icons: 0,
    }))
    .sort((a, b) => rank[a.role] - rank[b.role] || b.share - a.share);
  const counts = allocate(groups.map((g) => g.share), n);
  return groups.map((g, i) => ({ ...g, icons: counts[i] }));
}

export interface Rival {
  product: ProductView;
  company: CompanyView;
}

/** Produits en rayon dans le secteur (sociétés actives, lancements du trimestre exclus). */
export function sectorProducts(companies: CompanyView[], sectorId: SectorId): Rival[] {
  return companies
    .filter((c) => c.status === 'active')
    .flatMap((company) => company.products.filter((p) => p.sectorId === sectorId && !p.comingSoon).map((product) => ({ product, company })));
}

/** Rang (1 = meilleur) d'une valeur parmi d'autres, plus haut = mieux. */
export function rankAmong(value: number, others: number[]): number {
  return 1 + others.filter((v) => v > value + 1e-9).length;
}

// ---------------------------------------------------------------------------
// Traducteur visuel : un chiffre, un élément de la scène
// ---------------------------------------------------------------------------

function marketSizeOf(sectorId: SectorId): number {
  const d = SECTORS[sectorId];
  return d ? d.refPrice * d.refDemand : 0;
}

/** Taille du centre de R&D (1 à 4) : suit la qualité acquise (~1 au lancement, 2-3 en fin de partie). */
export function labLevel(quality: number): number {
  return quality < 1.15 ? 1 : quality < 1.5 ? 2 : quality < 2 ? 3 : 4;
}

/** Chercheurs aux fenêtres (0 à 6) : un par tranche de 0,5 % de la taille du marché en budget R&D ce trimestre. */
export function researchers(rnd: number, sectorId: SectorId): number {
  const step = 0.005 * marketSizeOf(sectorId);
  if (!(rnd > 0) || !(step > 0)) return 0;
  return Math.min(6, Math.ceil(rnd / step - 1e-9));
}

/** Affichage publicitaire (1 à 5) : suit la notoriété (0,3 au lancement, ~0,9 avec le marketing de départ). */
export function billboardTier(brand: number): number {
  return brand < 0.45 ? 1 : brand < 0.75 ? 2 : brand < 1.05 ? 3 : brand < 1.4 ? 4 : 5;
}

/** Projecteurs sur les panneaux (0 à 3) : budget marketing du trimestre, par rapport à celui de départ (1,5 % du marché). */
export function adSpots(marketing: number, sectorId: SectorId): number {
  const ref = 0.015 * marketSizeOf(sectorId);
  if (!(marketing > 0) || !(ref > 0)) return 0;
  const r = marketing / ref;
  return r < 0.7 ? 1 : r < 1.5 ? 2 : 3;
}
