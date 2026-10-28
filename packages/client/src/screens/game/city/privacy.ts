/**
 * La carte (bêta) : SEUL fichier de city/ autorisé à lire `.private` (vérifié par test/city.test.ts).
 *
 * La clé est la PRÉSENCE de `private`, jamais `controllerId === you` : le serveur ne l'envoie que pour
 * les entreprises actives que le joueur contrôle vraiment (rien pour un spectateur, rien pendant une
 * reprise de bot pas encore active). Tout le reste de la carte se dessine avec des données publiques ;
 * les rivaux apparaissent tels qu'à la dernière clôture (prix T-1, ni production, ni stock, ni décisions).
 */
import type { CompanyView, PlayerView, ProductView } from '@muchomoney/core';

export type OwnProduct = NonNullable<ProductView['private']>;
export type OwnCompany = NonNullable<CompanyView['private']>;

/** Données privées d'un de MES produits, sinon null. */
export function ownProduct(p: ProductView): OwnProduct | null {
  return p.private ?? null;
}

/** Données privées d'une de MES entreprises, sinon null. */
export function ownCompany(c: CompanyView): OwnCompany | null {
  return c.private ?? null;
}

/** Vrai pour une entreprise que je dirige (vue privée reçue). */
export function isOwn(c: CompanyView): boolean {
  return c.private !== undefined;
}

/** Only unresolved bids placed for companies I still control can settle or be cancelled. */
export function liveHexBids(view: PlayerView) {
  const controlled = new Set(view.companies.filter((c) => isOwn(c) && c.controllerId === view.you).map((c) => c.id));
  return (view.self?.hexBids ?? []).filter((bid) => !bid.result && controlled.has(bid.companyId));
}

/** The viewer's own contracts, never a rival's private decisions. */
export function ownContracts(view: PlayerView) {
  return view.self?.contracts ?? [];
}

/** Hex placement estimates retain the same controller-only boundary as classic zones. */
export function ownHexProduct(view: PlayerView, productId: string): { company: CompanyView; product: ProductView; own: OwnProduct } | null {
  for (const company of view.companies) {
    if (!isOwn(company)) continue;
    const product = company.products.find((p) => p.id === productId);
    const own = product ? ownProduct(product) : null;
    if (product && own) return { company, product, own };
  }
  return null;
}
