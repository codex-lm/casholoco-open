# Écrire des news pour Casholoco (consigne pour un rédacteur externe)

Tu écris des cartes de news satiriques pour *Le Capital Quotidien* (FR) / *The Daily Capital* (EN), le journal d'un jeu multijoueur de capitalisme sauvage.

## Où écrire

Uniquement ces deux fichiers :

- `packages/core/src/content/fr/extra/guest.ts` : `NEWS_GUEST` (cartes FR, avec leurs effets) et `RUMORS_GUEST` (fausses rumeurs FR).
- `packages/core/src/content/en/extra/guest.ts` : `EN_NEWS_GUEST` et `EN_RUMORS_GUEST` (textes anglais, **mêmes ids**).

Ids en snake_case préfixés par `gk_` (rumeurs : `gk_fake_…`).

## Modèles à imiter

- Format et exemples : `packages/core/src/content/fr/news.ts` et `packages/core/src/content/en/news.ts` (lire l'en-tête : bornes des effets et règles des placeholders).
- Types : `NewsCard`, `NewsEffect`, `CompanyTarget`, `FakeRumor` dans `packages/core/src/types.ts`.
- Secteurs : `energy_drinks`, `gadgets`, `scooters`, `yogurts`, `crypto`. Matières : `oil`, `lithium`, `sugar`, `chips`.

## Règles

- Aucune vraie personne, marque, entreprise, parti ou pays identifiable.
- Placeholders (`{company}`, `{ceo}`, `{sector}`, `{commodity}`) seulement dans les titres, et le titre anglais garde exactement les mêmes que le français.
- Une carte avec `rumor` en FR a une `rumor` en EN, et inversement.
- Le texte correspond à l'effet réel (pénurie → prix en hausse, etc.). Effets dans les bornes de l'en-tête de `fr/news.ts`, poids entre 0,5 et 1,5.
- FR : apostrophe ’, guillemets « ». EN : anglais américain idiomatique, dollars, guillemets “ ”, adaptation plutôt que traduction.
- Titre ≤ 100 caractères, corps ≤ 220, rumeur ≤ 160. Drôle, catchy, sans répéter les blagues existantes.

## Vérifier

```bash
npx tsc -p packages/core
npx vitest run packages/core/test/content.test.ts packages/core/test/content.en.test.ts
```

Les deux doivent passer (ils contrôlent bornes, placeholders et couverture anglaise).
