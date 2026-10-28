# Casholoco : document de conception

> Jeu multijoueur satirique de capitalisme sauvage, dans le navigateur.
> Deux à huit PDG sans scrupules, seize trimestres, une seule question : qui finira le plus riche ?

## 1. Pitch

Chaque joueur dirige une entreprise cotée en bourse. Il fixe les prix, produit, fait du marketing, achète des matières premières, s'endette, se verse des bonus, et surtout **achète les actions des autres**. Quiconque détient plus de 50 % d'une entreprise en prend le contrôle : c'est l'**OPA hostile**. Le PDG évincé repart avec un parachute doré, qui finance la startup de sa revanche.

On négocie aussi en coulisses : blocs d'actions cédés hors marché, contrats de fourniture (surtout quand on possède ses propres puits, mines, raffineries ou fonderies) et, sous la table, des ententes sur les prix, jusqu'au jour où elles se savent (§5.5 bis, §7 bis).

Chaque trimestre, le journal du jeu, **Le Capital Quotidien**, publie des nouvelles absurdes qui secouent les marchés, et des rumeurs parfois fiables et parfois fausses sur le trimestre suivant. Ceux qui lisent le journal gagnent.

Le ton est **satirique**. La satire vit dans le texte (news, titres, messages, trophées). La simulation dessous reste **cohérente** : prix, demande, dettes et valorisations obéissent à des formules stables, pour que les stratégies paient.

## 2. Déroulement d'une partie

- **Lobby** : un joueur crée une partie et obtient un code de salon (ex. `KXMP` ; alphabet sans chiffres, sans I ni O). Les autres rejoignent avec le code et un pseudo. Chacun choisit le nom de son entreprise et son secteur de départ. L'hôte règle le nombre de tours (8/12/16/20/24, défaut 16) et la durée d'un tour (60/90/120/180/300 s ou ∞, défaut 90), ajoute des bots et choisit leur niveau (« petit patron », niveau `normal`, par défaut ; « stagiaire », `intern`, pour une première partie ; « magnat », `expert`, pour des joueurs aguerris ; §10), bot par bot ou pour tous d'un coup, puis lance. La durée de 5 minutes laisse davantage de temps pour découvrir le jeu ; tous les humains prêts peuvent toujours clôturer plus tôt. Avec ∞ (`turnSeconds = 0`), il n'y a pas de chrono : le trimestre attend que tous les humains connectés soient prêts (un humain déconnecté depuis plus de 20 s ne bloque plus ; quand plus aucun humain n'est là, la partie est en pause ; au retour d'un joueur déjà prêt, le tour se clôt peu après, une fois écoulés le délai minimal de reprise et le délai de grâce des absents ; si les seuls humains présents attendent de reprendre un bot, le tour se clôt aussitôt). Un salon encore ouvert réglé sur l'ancienne durée de 7 minutes passe à ∞ ; une partie déjà lancée garde ses 7 minutes. La simulation ignore la durée du tour.
- **Tours simultanés** : un tour = un trimestre (« T1 2027 »). Pendant le tour, tout le monde agit en même temps.
  - Les **actions de marché** (acheter/vendre des actions, des matières premières, emprunter, verser un bonus, lancer un produit, miser sur une filiale, proposer ou accepter une affaire…) s'appliquent **immédiatement**. La bourse bouge en direct pendant le tour.
  - Les **décisions de production** (prix, volume, marketing, R&D) sont enregistrées et appliquées à la **résolution**. Elles persistent d'un tour à l'autre. Elles restent **cachées jusqu'à la résolution** : pendant le tour, les autres joueurs voient les prix du trimestre précédent (§12). Un lancement de produit est annoncé tout de suite (flash), mais le produit ne vend qu'à partir du trimestre suivant (§7). Jouer vite ou attendre de voir ce que font les autres ne donne donc aucun avantage sur les décisions de production ; seule la bourse (et les matières) bouge en direct.
  - Le tour se termine à la fin du chrono, ou quand tous les humains connectés ont cliqué « Prêt ».
- **Résolution** : la trésorerie de chaque entreprise paie d'abord ses obligations (faillite sinon) ; le reste, mises, production, marketing et R&D, se paie avec ce qui reste et les ventes du trimestre (§5.7) ; puis comptes, impôts, scandales, cours de bourse, publication du journal du trimestre suivant et actions des bots.
- **Fin** : après le dernier tour, classement par **valeur nette** et remise des trophées.

## 3. Le joueur et son argent

Deux poches distinctes, affichées clairement :

| Poche | Contenu | Sert à |
|---|---|---|
| **Fortune personnelle** (joueur) | cash perso, actions détenues, prêt perso | acheter/vendre des actions, fonder une startup |
| **Trésorerie de l'entreprise** | cash, dette, stocks, infrastructures | produire, marketing, R&D, matières, rachats |

**Score = valeur nette = cash perso + Σ (actions détenues × cours) − dette perso.**

Ponts entre les deux poches :

- **Dividende** (entreprise → tous les actionnaires, au prorata). Le flottant (public) touche sa part, qui sort du jeu. Le cours baisse aussitôt du dividende par action (détachement du coupon), et l'argent emprunté par l'entreprise dans le trimestre ne peut pas être distribué.
- **Bonus du PDG** (entreprise → cash perso du contrôleur). Plafonné à 10 % du cash de l'entreprise par tour : la base est le cash d'avant les bonus du tour, **hors emprunts contractés ce tour** (un aller-retour emprunt → bonus → remboursement ne gonfle pas le plafond). Scandale +8 et sentiment ×0,97 par tranche de 5 % de cette base, au prorata (un bonus de 2,5 % = une demi-tranche : +4). Le cours baisse aussitôt de bonus / nombre d'actions (le cash sort de l'entreprise).
- **Pilule empoisonnée** : le contrôleur paie de sa poche des actions neuves à prix cassé (cf. §7).
- **Startup** : le joueur qui ne contrôle plus aucune entreprise (évincé ou en faillite) investit sa fortune perso dans une nouvelle entreprise (retour en jeu, §7).

## 4. Démarrage

- **Entreprise de joueur** (humain ou bot) : cash 12 000 k€, dette 0, 10 000 actions. Le fondateur détient **40 %** (4 000 actions), le flottant 60 %. Un produit dans le secteur choisi, avec la capacité de départ du secteur, qualité 1,0 et notoriété `startingBrand` (0,3 si absent ; clientèle déjà fidèle en yaourts). Cette clientèle établie appartient aux entreprises de départ, PNJ compris : les produits lancés et les start-ups en cours de partie commencent à 0,3 et doivent construire leur marque. Le prix et les budgets de départ suivent les économies propres au secteur, plutôt qu'un prix de référence et des pourcentages communs.
- **Réglages de départ** : `startingDecisions` compare des décisions récurrentes sur 16 trimestres, face à un concurrent ordinaire au prix de référence et à la concurrence extérieure. La projection utilise `estimateSales`, les deux élasticités, la notoriété et la qualité du secteur, sa croissance, son obsolescence extérieure, les coûts de production et la péremption ; les stocks restants sont capitalisés. La recherche compare toutes les combinaisons de prix, marketing, R&D et production de sa grille finie. Le prix va de 0,7 à 2,5 × référence par pas de 0,05, avec au moins 8 % au-dessus du coût unitaire ; chaque budget compare 0,2 / 0,4 / 0,8 / 1,2 / 1,6 / 2,2 / 3 % × taille du marché × sizeFactor, ainsi que son ancienne valeur initiale ; la production compare les lots entiers jusqu'à la capacité ou au plafond de demande projetée, arrondi au lot supérieur. Produire au-delà de ce plafond n'ajoute aucune vente et finance seulement du stock supplémentaire. Les chemins de demande sont calculés une seule fois par combinaison de prix et budgets, puis le stock et sa péremption sont évalués pour chaque lot candidat. Les résultats sont mis en cache selon tous les paramètres économiques, la capacité, sizeFactor et la notoriété initiale ; chaque appel reçoit une copie. Ce modèle reste une aide initiale : les décisions persistent et le joueur peut ensuite les adapter.
- **Premier lot** : une fois toutes les entreprises créées, le marché réel de départ détermine la production : `floor(demande attendue × (1 − 0,5 × volatility))`, entre 1 lot et la capacité. Marketing et R&D sont réduits ensemble si leur somme dépasse **35 % de la marge brute attendue** de ce lot. En mode hexagonal, ce dimensionnement précède l'attribution des terrains ; les PNJ occupent déjà leurs cases fixes. Les stagiaires gardent leur règle volontairement naïve de prix de référence (§10), les autres bots ajustent leurs décisions dès le premier journal.
- **Fortune perso de départ** : 4 000 k€.
- **Entreprises PNJ** : 5, une par secteur (contenu `NPC_COMPANIES`). Cash = 12 000 × sizeFactor, capacité = capacité de départ × sizeFactor (arrondie), 10 000 actions, 100 % flottant, `controllerId = null` (pilote automatique).
- **Cours initial** = valeur fondamentale (§6), avec un `profitEma` initial projeté par `expectedStartProfits` sur les quatre premiers trimestres aux réglages effectivement attribués. Toutes les entreprises partagent une seule projection, sans répéter tout le marché pour chaque cotation. Les estimations utilisent les produits de départ, leur qualité et leur notoriété après budgets, les coûts unitaires du moteur et les deux élasticités. Chaque bénéfice est `ventes × prix − production × coût unitaire + variation du stock final valorisé − fixedCost − 250 − marketing − R&D`, après impôt ; le stock final tient compte de la péremption. Les quatre bénéfices sont moyennés avec les poids `0,8³ / 0,8² / 0,8 / 1` du lissage courant, sans plafond artificiel de 3 % du marché ni plancher de bénéfice à zéro. Pas de tirage, ni de nouvelles futures inventées. En mode hexagonal, tous les terrains des joueurs sont neutralisés et leurs usines replacées à la capitale dans cette seule projection ; les PNJ gardent leurs cases. Une attribution avantageuse doit améliorer les résultats futurs, pas créer davantage de fortune de fondateur dès T0.
  *Régression sur l'économie actuelle : chaque secteur est vérifié sur les mêmes 15 graines, avec un humain inactif et quatre bots ordinaires dans leurs secteurs préférés. Les ratios médians `cours de clôture T4 / cours d'introduction` et `valeur fondamentale par action à la clôture T4 / cours d'introduction` doivent rester entre 0,85 et 1,15 pour les cinq secteurs, sans remplacer les paramètres du catalogue par une ancienne économie. Les entreprises doivent rester actives aux quatre clôtures mesurées. Ces observations précèdent les opérations automatiques du journal T5 : une OPA ou une fusion du trimestre suivant ne modifie pas rétroactivement la clôture T4. Une mutation locale qui supprime les bénéfices initiaux de la crypto doit dépasser la même borne de 1,15. Les réglages initiaux sont aussi testés dans tous les secteurs contre les trois stagiaires du salon par défaut, avec un débutant qui suit seulement ses ventes pour la production et avec un débutant qui ne touche à rien.*
- `revenueEma` initial = production réellement prévue au départ × prix attribué. Les PNJ reçoivent les mêmes formules de départ, à leur capacité et leurs budgets dimensionnés par sizeFactor. Toutes les entreprises démarrent sans stock de matières.
- Les bots démarrent dans le secteur choisi dans le lobby (par défaut leur premier secteur préféré) et avec le ticker de leur personnalité.
- Les matières premières démarrent à leur prix de base, les secteurs à `demandMultiplier = 1`, `outsideQuality = 1`.

## 5. Économie réelle

### 5.1 Demande d'un secteur

À chaque résolution, pour le secteur *s* au tour *t* :

```
demandMultiplier ← demandMultiplier^0.85 × exp(N(0, volatility))       (retour vers 1 en log)
D_base = refDemand × demandMultiplier × (1 + growth)^(t−1) × Π (effets 'sectorDemand' actifs)^newsSensitivity × Π lobbying
outsideQuality = 1 + outsideQualityGrowth × (t − 1)
```

#### Crypto : bulle cachée et nouvelles sectorielles (classique et hexagonal)

La crypto partage une seule bulle, jamais copiée dans une vue joueur ou spectateur. À chaque clôture,
le moteur initialise au besoin `cryptoMarket` (sauvegardes anciennes compatibles), puis utilise la demande
réalisée après la réponse au prix du marché (§5.2), le marketing crypto **effectivement payé** et les prix des ventes, PNJ compris :

```
D_sous_jacente = D / (Π effets 'sectorDemand' actifs × dernierMultiplicateurPrixMarché)
g = clamp(D_sous_jacente / D_sous_jacente_précédente − 1, −0.8, 1)
intensité = marketing_crypto_payé / (refPrice × refDemand)
publicité = min(0.02, 6 × (intensité − 0.03))
P = Σ prix_effectivement_vendu × lots_vendus / Σ lots_vendus (sans ventes : P précédent)
hausse_prix = clamp(P / P_précédent − 1, −0.8, 1)
momentum = clamp(0.62 × momentum + 0.9 × g + publicité + 0.7 × hausse_prix, −0.6, 1.5)
bulle = clamp(0.65 × bulle + 0.35 × (clamp(D / tendance − 1, 0, 2) + 3.5 × max(hausse_prix, 0)), 0, 2)
volatilité = clamp(0.6 × volatilité + 0.4 × abs(g − g_précédent), 0, 1.5)
tendance = refDemand × (1 + growth)^(t − 1)
```

Le marketing ordinaire entretient la notoriété ; seule son intensité au-delà de 3 % du marché ajoute
un surplus au momentum, plafonné à 0,02 par clôture pour que la multiplication des lignes crypto chez les experts
ne suffise pas à rendre l'euphorie permanente. La notoriété crypto conserve son multiplicateur marketing ×2.
Pendant un krach actif, les contributions positives de publicité et de prix sont nulles ; la bulle ne reçoit
pas de hausse de prix. La demande nette mémorisée empêche l'expiration d'un choc ×0,35 de compter comme une
croissance de +186 %. Les anciennes sauvegardes normalisent aussi leur observation précédente lorsqu'un
krach est encore actif ou vient d'expirer. À la création, `openingCryptoPrice` mémorise les prix affichés avant les
décisions automatiques, pondérés par les ventes estimées publiques. Cette base séparée sert seulement à comparer
le premier prix réellement vendu ; elle ne crée ni historique de vente, ni risque ou rumeur de krach avant une
vente. Elle est conservée pendant les clôtures sans ventes, puis consommée à la première observation réelle.
Une hausse décidée après l'ouverture conserve donc sa contribution au momentum. L'historique réalisé existant
reste prioritaire ; une ancienne sauvegarde sans cette base garde le prix de référence comme comparaison
initiale. Première observation de demande : historique normalisé s'il existe, sinon demande de référence.
Un prix affiché sans aucune vente ne nourrit pas la bulle ; un prix stable élevé ne l'alimente pas à nouveau
chaque trimestre, mais conserve son risque de niveau après une vente réelle.

Le numéro suivant la clôture publie immédiatement une nouvelle d'euphorie si le momentum le justifie,
en plus de la une déjà annoncée ; une clôture T1 peut donc stimuler la demande T2. Aucun chiffre privé
ne modifie directement la demande. Le journal prépare aussi sa prochaine une : si le momentum
atteint 0,27, la bulle 0,10, ou le prix moyen réellement vendu 1,5 × référence, le RNG à graine tire un krach avec
`p = clamp(0.02 + 0.22 × bulle + 0.10 × volatilité + 0.78 × clamp((prixVendu / refPrice − 1) / 2, 0, 1)^3, 0.02, 0.85)`.
Le niveau du prix conserve donc un risque même lorsque le prix cesse de monter : à 3 × référence,
le risque vaut au moins 80 % par tirage éligible, hors convalescence. La rumeur conserve son délai habituel.
Le krach éventuel est annoncé en rumeur T2 et publié T3. À partir de 0,27 de momentum, tant qu'aucun krach
n'est actif et que le délai de convalescence est écoulé, une des trois nouvelles d'euphorie est forcée : effet de demande
`1.1 + 0.4 × clamp((momentum − 0.27) / 0.53, 0, 1)`, un trimestre, sentiment des entreprises crypto
`1 + 0.35 × (effet − 1)`. L'effet est calculé au moment de la publication ; une vraie rumeur de krach
engage bien la carte qui paraîtra au trimestre suivant.
Le multiplicateur atteint donc 1,5 à partir de 0,8 de momentum. La volatilité propre à la demande crypto est
0,28 ; celle des quatre autres secteurs reste inchangée. Les six cartes nouvelles ont un poids nul dans le tirage ordinaire.

Un krach publié multiplie la demande crypto par 0,35 pendant deux clôtures et le sentiment de toutes les
entreprises qui en vendent par 0,7. Il remet le momentum à −0,6, la bulle, la volatilité et la dernière croissance
à zéro, et bloque le mécanisme
pendant douze clôtures (trois ans de convalescence spéculative, contre deux trimestres de choc de demande).
Cette durée vise environ un krach par partie experte ayant connu une euphorie, sans réduire le risque au
plafond de prix. La vraie rumeur paraît dans le numéro précédent avec la fiabilité habituelle ;
trois fausses alertes crypto rejoignent le pool de fausses rumeurs. Les cartes crypto aléatoires existantes
restent : hausses pondérées par `1 + 1.5 × max(momentum, 0) / 1.5`, baisses par
`1 − 0.4 × max(momentum, 0) / 1.5` en boom et par 2 pendant les **trois premières clôtures après le krach**. Ce renfort bref des mauvaises nouvelles est indépendant du blocage de douze clôtures des krachs et des euphories forcées.
La mémoire habituelle des douze dernières nouvelles s'applique aussi aux titres forcés ; lorsque les trois
titres sont encore en mémoire, le dernier titre de cette famille reste exclu. Pas de carte crypto ordinaire
négative avec une euphorie, ni de carte positive pendant un krach, y compris les cartes de sentiment ou scandale.
Une une négative déjà promise garde sa rumeur vraie et retarde l'euphorie ; les tirages de secteur aléatoire évitent
la crypto si le signe serait contradictoire. Une euphorie attend aussi la fin d'une baisse sectorielle encore active.
Le krach retire les anciens effets positifs de demande crypto avant d'appliquer son choc.
Les lecteurs disposent seulement du journal et de la demande publique par trimestre ; les prix restent ceux
des mécanismes habituels.

**Signaux publics du cycle** (`sim/cryptoSignals.ts`, lus par les bots pour leurs sorties du §10) : une carte
d'euphorie publiée dans le dernier numéro (le sommet est proche, on vend dans la force ; poids 0,25), une
rumeur de krach — vraie ou sosie du pool des fausses, indiscernables, toutes comptent — pondérée par sa
fiabilité affichée (« élevée » 0,55, « moyenne » 0,4, « faible » 0,25), le krach publié dans le numéro
(poids 0,75, en une comme en brève), la demande réalisée qui se retourne (0,25 quand la dernière entrée
repasse sous la précédente ; −0,15 tant qu'elle monte encore, malus levé une fois le krach publié) et
l'envolée des cours des entreprises cotées qui ont un produit crypto (accélération du dernier trimestre
contre la tendance propre de chaque entreprise sur les quatre trimestres précédents — une hausse régulière,
même forte, ne compte pas —, contribution pleine à +150 %, poids 0,3). Le score combiné (0..1, déterministe) ne dépend que de
la vue : l'état caché de la bulle (`cryptoMarket`, `scheduledNews`, `rumorKeys`) reste interdit de lecture.

### 5.2 Partage entre produits (logit simplifié)

Attractivité d'un produit *i* :

```
a_i = quality^qualityExponent × (0.5 + brand) × reputation × (refPrice / price)^elasticity × bonus
bonus = 1.3 si greenwashing actif
A_autres = outsideAttractiveness × outsideQuality^qualityExponent
prixMoyen = (A_autres × refPrice + Σ a_j × price_j) / (A_autres + Σ a_j)
D = D_base × (refPrice / prixMoyen)^marketElasticity
demande_i = D × a_i / (Σ a_j + A_autres)
```

Ventes : `vendu_i = min(demande_i, stock_i + produit_i)`. La part de marché publiée est `vendu_i / D`.
Une ligne sans stock ni production prévue réalisable a une attractivité nulle : même avec une usine
installée, elle ne prend aucune part de demande et ne pèse pas dans le prix moyen. Une ligne ne vendant
que son stock reste en rayon ; une capacité encore en commande ne produit pas ce trimestre.

L'élasticité du choix entre produits vient du secteur : **2 pour les yaourts**, **3,5 pour les boissons**,
**4,5 pour les trottinettes**, **6,5 pour les gadgets**, **1,5 pour la crypto**.
L'élasticité de la demande totale (`marketElasticity`) est également sectorielle (§13) ; une valeur absente
ou nulle conserve le comportement historique sans réponse du marché au prix.
Le prix moyen est pondéré par l'attractivité nationale des produits en rayon, avec les concurrents extérieurs au
prix de référence. Cette pondération ne dépend ni des ventes réalisées ni de la capacité, ce qui permet de recalculer
le même marché avant la production et pour un changement hypothétique de prix. Le même multiplicateur national
s'applique à toutes les villes ; le bonus « fabriqué ici » intervient ensuite dans le partage régional. Les prévisions
emploient les plans connus de toutes les lignes du dirigeant (pilote automatique compris). La production
et les stocks des rivaux restent secrets : leurs capacités publiques servent d'hypothèse de disponibilité,
et une fermeture secrète peut donc créer un écart avec la résolution.
La demande publique et les parts de marché utilisent la demande après cette réponse au prix. Pour mesurer la
croissance organique de la bulle, cette réponse explicite est retirée comme les effets des nouvelles : la hausse
du prix moyen crypto réellement vendu alimente déjà son momentum propre (§5.1).
La sensibilité reste positive et le plafond reste **3 × le prix de référence**. Moteur, bots, recherche de prix
des experts, plan de clôture et estimations du client utilisent les deux élasticités sectorielles.

Quand une usine du secteur est hors de la capitale, ce partage se fait ville par ville (§5.2 bis).

### 5.2 bis Marchés régionaux

Les clients d'un secteur habitent les cinq villes de la carte (§5.8) ; un produit se vend partout au même titre, sauf dans la ville de son usine, où le « fabriqué ici » le fait mieux vendre. La distance ne joue plus sur l'attractivité : c'est une facture de transport, rien d'autre (§5.8). Tout reste automatique : un seul prix par produit, la production, le stock et les ventes restent nationaux, rien à régler ville par ville (`sim/regions.ts`).

```
w_k     = σ_k × τ_k,s / Σ_j σ_j × τ_j,s                     part de la ville k dans les clients du secteur s (Σ = 1)
Δ(z,k)  = route(z, k) − route(capitale, k)                  détour depuis la zone z, en km pondérés (roadRoute) — sert à la facture de transport (§5.8), plus à l'attractivité
π(z,k)  = 1 si z est la capitale
        = 1 + localBonus_s × [k est la ville de z]          sinon (« fabriqué ici » ; 1 partout ailleurs)
T_k     = A_autres + Σ_j a_j × π(z_j, k)
demande_i = Σ_k D × w_k × a_i × π(z_i, k) / T_k
```

- σ : la part de la population de chaque ville (`CityDef.share` : 40 / 20 / 20 / 10 / 10 %) ; τ : son goût pour chaque secteur (`CityDef.taste`). Chaque ville a son secteur fétiche. Boissons, gadgets, trottinettes, yaourts, crypto : capitale 0,9 / 1 / 0,9 / 0,8 / **1,4** (les traders) ; nord-est 0,9 / **1,6** / 0,9 / 0,8 / 1,3 (la tech) ; sud 1,2 / 0,7 / **1,5** / 0,9 / 0,6 (soleil, rues plates) ; est 0,8 / 1 / 0,9 / **3** / 0,5 (le « bio », au seau) ; nord **2,2** / 0,6 / 0,6 / 1 / 0,6 (les nuits sont longues). La capitale a 40 % de la population, mais de 30 % (yaourts) à 53 % (crypto) des clients d'un secteur.
- localBonus : le bonus « fabriqué ici » du secteur (`SectorDef.localBonus`, qui remplace `proximity`) : yaourts 0,35 (le frais du terroir), boissons 0,20 (la pression du coin), trottinettes 0,10 (service après-vente de proximité), gadgets 0,05, crypto 0 (immatérielle).
- **Les importateurs débarquent au port** : les « autres concurrents » (`A_autres`, §5.2) ont un facteur de 1 dans toutes les villes, comme une usine à la capitale. C'est la seule façon que rien ne change quand toutes les usines sont à la capitale : avec un profil par ville pour les importateurs, le partage ville par ville ne redonnerait pas le partage national.
- **Le bonus « fabriqué ici »** (`localBonus`, par secteur) : une usine installée dans une ville de province (nord-est, sud, est, nord) y vend mieux, d'un facteur 1 + localBonus. La capitale reste exactement neutre : une usine à la capitale a un facteur de 1 partout, sans bonus (les importateurs y sont aussi chez eux) — ne rien faire ne change donc rien pour une usine de la capitale. La plaine et la montagne n'ont pas de ville, donc pas de bonus : ce sont des choix de coût. C'est ce bonus qui permet à une usine de province de battre la capitale sur la demande. `HOME_MARKET_KM` et `PROXIMITY_KM` sont supprimés ; `RegionParams` ne garde que `tasteAmplitude` et `legacyDelivery`.
- **Marché national** : tant qu'aucune usine du secteur (en rayon) n'est hors de la capitale, un seul marché de poids 1 et de facteur 1, le calcul du §5.2 à l'identique (les parties sans déménagement sortent identiques au bit près). Dès qu'une usine est ailleurs, le calcul ville par ville, qui redonne le résultat national aux arrondis près tant qu'aucun bonus « fabriqué ici » ne s'applique.
- Le même calcul sert partout : la résolution (demande de chaque produit, plan du marketing), le plan de clôture et les estimations (`MarketEstimateInputs.othersByCity` : l'attractivité des autres ville par ville, données publiques seulement), le lancement par zone, et les bots.
- Ventes par ville : `vendu_i,k = vendu_i × demande_i,k / demande_i`, publiques (`ProductView.lastSalesByCity`, ligne du rapport `byCity`), seulement quand le secteur est régional.

### 5.3 Production et coûts

- `produit = min(production décidée, capacity)`. Chaque lot consomme `inputs[c]` lots de matière *c*, prélevés dans l'inventaire de l'entreprise, au coût moyen. S'il manque de la matière : **achat d'urgence** au prix spot × 1,1 (pas d'impact sur le cours). La production (main-d'œuvre, extraction des filiales pour les besoins, achats d'urgence) se paie avec la trésorerie et les ventes du trimestre : une production qui se vend avec une marge se paie elle-même ; si elle coûte plus qu'elle ne rapporte et que la trésorerie ne suit pas, tous les produits sont réduits dans la même proportion (§5.7).
  *Équilibrage : la spec initiale disait × 1,25. La consommation cumulée des entreprises est du même ordre que la liquidité des marchés de matières (ex. ~160 lots de puces par tour pour une liquidité de 400) : acheter tous ses besoins au marché fait flamber les cours, donc l'achat d'urgence est la voie normale. À × 1,25, la crypto (86 % de matières) et les yaourts perdaient de l'argent à coup sûr ; à × 1,1, acheter au marché dans les creux (news, rumeurs) reste rentable sans être obligatoire.*
- Main-d'œuvre : `laborCost × Π effets laborCost × (0.7 si délocalisation) × main-d'œuvre de la zone pour le secteur` (§5.8 ; 1 à la capitale) par lot produit.
- Transport (§5.8) : par lot produit, l'écart de route avec une usine à la capitale, au poids de fret de la marchandise (matières et livraison), payé avec la production ; nul à la capitale, négatif si la zone en fait économiser.
- Stock invendu : `stock ← (stock + produit − vendu) × (1 − perishability)`.
- Coûts fixes : `fixedCost` par produit + **frais de siège 250 k€** par entreprise active (même sans produit) + entretien des filiales en sommeil (§5.5 bis), payés en tête de clôture (§5.7).
- Capacité : `expandCapacity` coûte `lots × capacityCost` tout de suite, livrée au tour suivant (`pendingCapacity` → `capacity`).
- `lastUnitCost` = (main-d'œuvre + matières + transport) / lots produits (inchangé si rien n'est produit) ; le rapport du trimestre en donne la part du transport (`ProductReport.transport`).
- Coût unitaire **estimé** (fiche produit, bots) : pour la production prévue, matières prises dans l'inventaire au coût moyen, le reste au prix spot × 1,1 (achat d'urgence), plus la main-d'œuvre effective et le transport estimé (`estimatedTransport`, même règle que la résolution : les filiales en service fournissent d'abord, le reste vient du port). La vue en donne aussi l'estimation pour chaque zone (`private.zones.unitCost`), la demande que le produit y aurait (`private.zones.demand`, §5.2 bis) et le prix du déménagement ce trimestre (`private.zones.moveCost`).

### 5.4 Marketing et R&D

Payés à la résolution, avec ce que laissent la production et les mises, ventes du trimestre comprises (§5.7) : ils agissent sur les ventes du trimestre même.

```
marketingScale = 0.02 × refPrice × refDemand
brand ← brandPersistence × brand + (1 − brandPersistence) × (brandBase + ln(1 + marketing × marketingMultiplier × multiplicateurTerrain / marketingScale))

rndScale = 0.05 × refPrice × refDemand
quality ← quality × qualityDecay + 0.5 × ln(1 + rnd × rndMultiplier × multiplicateurTerrain / rndScale) / quality
```

Les paramètres sectoriels sont facultatifs. Les valeurs absentes gardent les paramètres historiques :
`brandPersistence = 0,75`, `brandBase = 0,3`, `marketingMultiplier = 1`,
`rndMultiplier = 1`, `qualityDecay = 0,99`, `qualityExponent = 1,3`, `outsideQualityGrowth = 0,04`,
`newsSensitivity = 1`, `startingBrand = 0,3`. `brandBase` est la cible de notoriété sans publicité :
une marque en dessous se construit progressivement vers cette base, une marque au-dessus s'en rapproche
si la publicité ne l'entretient pas. `brandPersistence` détermine la vitesse de cette convergence.
Ce soutien sectoriel persiste pour toutes les lignes, y compris les nouveaux produits.
`startingBrand` est distinct : il donne seulement la clientèle déjà établie aux entreprises présentes
au démarrage. Un lancement ou une start-up en cours de partie commence toujours à 0,3 et construit
ensuite sa marque avec la même formule, sans recevoir immédiatement la marque des fondateurs.
Les yaourts gardent une clientèle fidèle ; les boissons oublient vite mais leur publicité est amplifiée.
Les gadgets bénéficient de leur R&D, leur qualité vieillit plus vite, et leurs concurrents progressent plus vite :
la qualité pèse davantage dans le choix des clients. La publicité crypto garde son multiplicateur ×2. Les multiplicateurs de secteur
et de terrain se cumulent. Résolution, clôture, conseil, prévisions client et bots partagent ces formules.

### 5.5 Matières premières

À chaque résolution :

```
équilibre = basePrice × Π effets 'commoditySupply'
price ← price × exp(N(0, volatility)) × (équilibre / price)^meanReversion
```

Acheter *n* lots pendant le tour (impact exponentiel, comme les actions au §6.2, avec L = liquidity) : coût = `price × L × (e^(n/L) − 1)`, puis `price ← price × e^(n/L)` ; au-delà du plafond de sûreté (10 × prix de base), les lots restants se paient au plafond. Vendre : produit = `0.95 × price × L × (1 − e^(−n/L))`, puis `price ← price × e^(−n/L)` ; sous le plancher (20 % du prix de base), les lots restants se vendent au plancher. Un ordre est limité à `liquidity` lots. Les effets `commodityPrice` d'une news font un saut immédiat du prix.

### 5.5 bis Filiales d'approvisionnement

Il existe **trois emplacements de filiale par matière** (`GameState.siteSlots`, `SITES_PER_COMMODITY`) : puits de pétrole, mine de lithium, raffinerie de sucre, fonderie de puces, soit douze en tout, chacun avec un nom (« Puits du Mont-Noir », « Sucrerie des Trois Betteraves »…) tiré à la création de la partie parmi huit par matière (`content/*/flavor.ts`, `SITE_NAMES`) par hachage de la **graine des textes** (`GameConfig.textSeed`, §12 bis), jamais de celle de la simulation, et sans toucher au RNG : les mêmes emplacements dans toutes les langues, seuls les noms changent. Chaque emplacement est un **gisement** de la carte (§5.8), à une position fixe et d'une **richesse** fixe (`DEPOSITS`, `slotCapacity`) : par matière, un riche (50 lots par trimestre, `…-1`), un moyen (40, `…-2`) et un pauvre (30, `…-3`), soit 40 en moyenne (`SITE_CAPACITY`). Un emplacement est **libre** ou **exploité** par une entreprise (l'exploitant est public, `PlayerView.siteSlots`). Une entreprise ne peut exploiter qu'**une filiale par matière** (deux seulement après une fusion). Constantes `SITE_*` :

- **attribution aux enchères, gisement par gisement** (`bidSite { slotId }`, `cancelSiteBid`), sous pli fermé, réglées en fin de trimestre, après les ventes (`awardSites`, `sim/deals.ts`, §5.7). Une entreprise mise sur **un gisement précis** et une fois par matière, au plus ce qu'elle veut payer, au moins la **mise à prix** de 125 × le prix de base de la matière (pétrole 10 M€, lithium 15 M€, sucre 5 M€, puces 7,5 M€, la même pour les trois gisements) et sans dépasser sa trésorerie du moment ; miser de nouveau, sur ce gisement ou un autre de la même matière, remplace sa propre mise. Refusé si le gisement est inconnu ou déjà exploité, si l'entreprise exploite déjà une filiale de la matière, ou au dernier trimestre (la filiale ne produirait jamais). Une mise appartient au dirigeant qui l'a posée : un nouveau dirigeant ne la voit pas, ne peut pas la retirer, et elle tombe à la clôture. À la clôture, les matières se règlent dans l'ordre du catalogue (pétrole, lithium, sucre, puces), et chaque matière gisement par gisement. Chaque mise ne vaut que ce qu'elle **engage vraiment** : au plus la trésorerie de l'entreprise en fin de trimestre, ventes encaissées (§5.7), et après ses achats des matières déjà réglées. Une entreprise en faillite à cette clôture ne mise plus. Les mises valables sur un gisement (gisement libre, entreprise active, toujours dirigée par celui qui a misé, sans filiale de cette matière, engageant au moins la mise à prix) se classent par montant engagé, les égalités étant départagées par hachage de la graine secrète, du tour et de l'entreprise (jamais le RNG). La plus haute l'emporte et paie **la meilleure mise perdante sur ce gisement** (montant engagé), ou la mise à prix si elle est seule : jamais plus que sa mise. Les perdants ne paient rien et peuvent viser un autre gisement au trimestre suivant ;
- le gagnant paie **comptant**, comme pour une usine : le prix ne passe pas par le compte de résultat, et la filiale compte pour **la moitié du prix payé** (`SupplySite.cost`, `SITE_BOOK_VALUE_RATIO`) dans la valeur comptable (§5.7), qu'elle suit en cas de fusion. Elle prend la richesse de son gisement (`SupplySite.capacity`). Les articles du journal suivent l'ordre des gisements. La filiale produit à partir de la résolution suivante (`SupplySite.activeFrom = tour + 1`) : mise pendant un tour, premiers lots à la clôture du tour suivant, comme lorsqu'on ouvrait sa filiale directement ;
- les mises sont **secrètes** : chacun ne voit que les siennes (`PlayerView.self.siteBids`), jamais celles des autres joueurs ni des bots. Chaque mise garde son issue (`result` : gagnée, perdue, ou sans suite quand elle n'engageait pas la mise à prix ou que l'entreprise a changé de mains, avec le prix d'adjudication public du gisement et son nombre de candidats) jusqu'au règlement suivant. Le journal du numéro suivant annonce l'adjudication (« Adjugé ! … remporte la filiale « … » », événement `siteOpened`) ;
- **faillite** : les filiales de l'entreprise retournent aux enchères ; libres dès la clôture où elle tombe (la faillite se décide en tête de clôture), elles acceptent des mises au trimestre suivant. Une fusion les transfère à l'absorbante avec leur emplacement ; la prise de contrôle d'une entreprise les laisse en place ;
- à chaque résolution, la filiale extrait jusqu'à sa richesse (30, 40 ou 50 lots) au coût d'extraction du trimestre : **avant la production**, ce que demandent la production et les contrats à livrer (payé avec la production) ; **en fin de trimestre**, après les ventes et les enchères, du surplus vers le stock, avec ce qui reste une fois gardé de quoi payer une clôture d'obligations (sans quoi une filiale viderait la caisse dont la clôture suivante a besoin, §5.7). Les lots entrent en stock à ce coût (coût moyen pondéré) : la production les consomme avant tout achat d'urgence, et le coût des ventes les compte à ce coût (§5.6) ;
- **coût d'extraction** = 75 % du prix de base (`SupplySite.unitCost` : pétrole 60 k€, lithium 90 k€, sucre 30 k€, puces 45 k€ le lot) × Π effets `siteCost` en cours sur la matière. Ces effets viennent des news (§9) : une grève, une inondation, une inspection le renchérissent (×1,4 à ×2,5), des robots foreurs ou une subvention le baissent (×0,65 à ×0,8), pendant 2 à 4 trimestres. Ils ne touchent que l'extraction, pas le cours de la matière. Beaucoup sont annoncés par une rumeur au numéro précédent ;
- **mise en sommeil** (`setSiteDormant`, `dormant: true`) : dès la clôture du trimestre, la filiale n'extrait plus, mais elle paie à chaque résolution un **entretien** de 25 % de sa facture d'extraction habituelle (`SITE_DORMANT_UPKEEP` × richesse × coût hors news ; pour un gisement moyen de 40 lots : pétrole 600 k€, lithium 900 k€, sucre 300 k€, puces 450 k€ par trimestre), compté dans les coûts fixes (§5.3). **Relance** (`dormant: false`) : un trimestre de remise en route, comme un chantier ; la filiale n'extrait rien (et ne paie plus d'entretien) à la clôture du trimestre de la relance, et reprend à la suivante. S'endormir puis se relancer dans le même trimestre coûte donc une extraction. Après une fusion, les filiales de la même matière dorment et repartent ensemble ;
- le surplus se revend au marché (§5.5) ou par contrat de fourniture (§7 bis). Comme tout achat ou vente de matières, la revente ne passe pas par le compte de résultat : elle entre dans la trésorerie, donc dans la valeur comptable ;
- publiques : chacun voit les filiales de tous, leur nom, leur état et leur coût d'extraction du moment (`CompanyView.sites`, `SupplySiteView.currentUnitCost`), ainsi que le multiplicateur des news en cours pour chaque matière (`CommodityView.siteCostFactor`, absent s'il vaut 1). Deux filiales de la même matière chez une même entreprise (après une fusion) additionnent leur extraction.

*Équilibrage : une filiale qui nourrit sa propre production économise environ 25 % du prix de ses matières, et les achats d'urgence ; elle ne se rentabilise qu'ouverte tôt. Premier réglage (ouverture 80 × le prix de base, extraction à 50 %) : valeur nette médiane des bots 41,2 → 48,0 M€, trop généreux. Deuxième (100 ×, 70 %, coût fixe) : un passage obligé ; un joueur fort qui en ouvrait dès qu'il le pouvait finissait 18 % plus riche et gagnait quatre fois plus souvent. Avec le réglage actuel, une filiale ouverte à bon escient rapporte un peu, une filiale ouverte par réflexe est un pari, et s'en passer reste viable (§13). Les enchères ajoutent de la rareté, sans pouvoir de marché : une matière n'a pas de cours propre à un exploitant, les autres continuent d'acheter au marché, donc même un joueur qui tiendrait les trois emplacements d'une matière ne ferait payer personne. Prix unique plutôt que « le gagnant paie sa mise » : on peut miser ce qu'on est prêt à payer sans craindre de trop payer, et un candidat qui ne gagne pas ne fait monter le prix qu'à sa propre mise.*

*Comptabilité (octobre 2026) : l'achat d'une filiale était passé en charge sur 4 trimestres comme un lancement, et la filiale ne comptait pas dans la valeur comptable. Acheter faisait donc chuter le cours pendant un an et rapprochait l'entreprise de la faillite (une filiale à 10 M€ retirait 10 M€ à sa valeur comptable). Elle est désormais traitée comme une usine : payée comptant, hors compte de résultat, comptée pour moitié au bilan. Sur 60 parties (`npm run sim`), bots normaux : valeur nette médiane 41,4 → 44,5 M€, prêts d'urgence 0,28 → 0,13 et faillites 0,02 → 0 par partie, filiales ouvertes inchangées (0,85) ; bots experts : 39,6 → 40,0 M€.*

### 5.6 Compte de résultat (par entreprise, par tour)

```
coût des ventes (cogs) = main-d'œuvre + matières consommées + achats d'urgence + stock initial − stock final
                         (stocks de produits finis valorisés à lastUnitCost, pertes de péremption incluses)
résultat avant impôt = CA − cogs − marketing − R&D − coûts fixes − lancements étalés − frais spéciaux − intérêts − amendes − pertes exceptionnelles
lancements étalés     = Σ quart du coût de chaque lancement des 4 derniers trimestres (celui du tour compris)
frais spéciaux        = actions discutables et communication de crise du tour
pertes exceptionnelles = moitié du coût comptable du stock revendu à l'arrêt d'un produit (§7)
impôt = max(0, résultat avant impôt) × taux  (taux = 5 % si optimisation fiscale active, sinon baseTaxRate + effets, borné à [0, 90 %]) ;
        payé, comme les amendes du trimestre, en tête de la clôture suivante (§5.7)
bénéfice net = résultat avant impôt − impôt
résultat courant = même calcul sans les amendes et sans les pertes exceptionnelles
profitEma ← 0.8 × profitEma + 0.2 × résultat courant net ;  revenueEma ← 0.6 × revenueEma + 0.4 × CA
```

En mode hexagonal, `companyTaxRate` prend le minimum de ce taux et du taux du siège multiplié par les news
locales applicables. Une suspension retire le privilège : le taux ordinaire, optimisation éventuelle comprise,
reprend effet (§5.8 ter).

Lancements étalés et frais spéciaux sont payés en trésorerie **pendant le tour** (au moment de l'action) : à la résolution, ils n'entrent que dans le compte de résultat (et donc dans l'impôt et dans profitEma), sans seconde sortie de cash. Ils apparaissent dans le rapport trimestriel sur deux lignes, « Lancements » et « Frais spéciaux » (champs `amortization` et `specialCharges` de `QuarterReport`, absents quand ils valent 0). L'échéancier des lancements vit dans `CompanyState.launchCharges` ; la part restant à passer en charge est visible du contrôleur (`private.launchChargesLeft`), ainsi que celle de la prochaine résolution (`private.launchChargesNext`). La valeur comptable ne compte pas cette part (§5.7) : sinon, un lancement au dernier tour, dont les charges ne seraient jamais passées, ne coûterait rien au score. Une fusion transfère à l'absorbante l'échéancier, les frais spéciaux et les pertes exceptionnelles du tour de la cible ; une faillite efface l'échéancier.

**Arrêt d'un produit : récupération nette, sans impôt.** L'usine (capacité installée et commandée) et le terrain éventuel sont revendus à leur valeur déjà retenue au bilan, soit la moitié de leur coût d'achat : aucun gain imposable. Le stock est revendu à la moitié de son coût unitaire comptable ; la moitié non récupérée passe en perte exceptionnelle déductible (`QuarterReport.exceptionalLoss`), sans nouvelle sortie de trésorerie. Exception : tant que sa dotation de terrain est active (le taux se lit avant la révocation du terrain), l'usine de départ de l'Île-aux-Niches se revend à 80 % — usine, terrain et stock — au lieu de 50 % (§5.8 ter). La récupération ne constitue ni du CA ni un revenu exceptionnel. La perte et son économie d'impôt restent hors de `profitEma`, des articles de meilleur bénéfice ou pire perte, de la sélection de l'entreprise la plus rentable et de l'évaluation de l'optimisation fiscale par l'expert. Le bénéfice utilisé pour ces articles et cette sélection est `netProfit + exceptionalLoss − exceptionalLossTaxBenefit` ; cette dernière donnée conserve l'économie d'impôt effectivement réalisée, y compris si la perte annule tout le bénéfice imposable. Une fusion additionne aussi ces données dans les rapports pro forma.

*Équilibrage (lot 1 de l'audit de profondeur) : le cours valant ~40 × le bénéfice lissé, tout ce qui passait hors du compte de résultat (lancement, actions discutables, com' de crise) ne coûtait qu'une fois son prix au score, alors que ce qu'il rapportait était multiplié par 40 : lancer trois produits au T1 et tricher à chaque tour était toujours gagnant. Étalés sur 4 trimestres, un lancement tôt dans la partie reste rentable mais pèse temporairement sur le cours (~4 × son coût au pic, qui s'estompe de 20 % par trimestre), et un lancement tardif n'a plus le temps de s'amortir ; une action discutable coûte ~6 × son prix en valorisation immédiate, qui s'estompe de même.*

*Équilibrage : la spec initiale imputait le coût de la production (pas des ventes), lissait profitEma à 0,6/0,4 et y incluait les amendes. Stocker puis déstocker faisait alors osciller le bénéfice, une amende ponctuelle était multipliée par 40 dans la valorisation, et les cours bougeaient de 16 à 24 % par trimestre (médiane). Avec le coût des ventes, le résultat courant et un lissage 0,8/0,2, la médiane tombe vers 11-12 %. Le bénéfice net publié (rapports, journal) inclut toujours les amendes ; l'amende pèse sur le cours via la trésorerie et le sentiment (×0,75).*

Le marketing et la R&D sont payés à la résolution, avec ce que laissent les obligations, les mises et la production, ventes du trimestre comprises (§5.7) : s'il ne reste pas de quoi les payer, ils sont réduits dans la même proportion (on ne s'endette pas d'office pour du marketing).

### 5.7 Dette et trésorerie de l'entreprise

- Taux trimestriel : `(baseInterestRate + effets) × (1 + 0.5 × dette / max(bookValue, 1000))`, avec baseInterestRate = 1,2 % (taux de base effectif borné à [0, 20 %], taux d'une entreprise plafonné à 25 % par trimestre, garde-fou). Emprunter fait monter le taux de toute la dette : la valeur comptable ne bouge pas, trésorerie et dette montant d'autant.
- Plafond d'emprunt : `max(0, 3 × revenueEma + 0.5 × max(bookValue, 0)) − dette`.
- **Clôture** (`sim/close.ts`) :
  1. en tête de clôture, la trésorerie paie les **obligations** : siège, coûts fixes des produits, entretien des filiales en sommeil, intérêts (sur la dette du moment, emprunts du tour compris), impôt et amendes du trimestre précédent ; elle met aussi de côté les achats prévus par contrat (payés à la livraison, §7 bis). Faute de les couvrir : faillite (ci-dessous) ;
  2. **tout le reste se paie avec ce qui reste et les ventes du trimestre**, et la trésorerie de fin de trimestre ne passe jamais sous zéro. Par ordre de priorité : les **mises aux enchères** (§5.5 bis, réglées en fin de trimestre), la **production** (§5.3 : le stock d'abord, puis l'extraction des filiales et les livraisons des contrats, puis les achats d'urgence, plus la main-d'œuvre et le transport, §5.8), le **marketing et la R&D** (§5.4), enfin l'**extraction en surplus** des filiales (§5.5 bis), qui garde de quoi payer une clôture d'obligations.

  Quand l'argent manque, le moins prioritaire saute d'abord : l'extraction en surplus, puis le marketing et la R&D (réduits dans la même proportion), puis la production, et la mise en dernier (elle ne compte que jusqu'à la trésorerie de fin de trimestre). Comme une production qui se vend avec une marge se paie elle-même, elle n'est réduite que si elle coûte plus qu'elle ne rapporte au trimestre (invendus, prix sous le coût) : tous les produits dans la même proportion, la plus grande qu'on peut payer, lots arrondis à l'unité inférieure. Si, même sans rien produire, l'extraction promise aux acheteurs de ses contrats dépasse ce qu'on a, on n'extrait que ce qu'on paie (le reste des livraisons manque et le dédit sera dû). **Aucun emprunt automatique** : c'est au dirigeant d'emprunter avant la clôture.

  À la résolution, tout est exact : la demande est tirée, et la décision de chacun suppose que les produits des autres reçoivent tout leur marketing prévu (si un rival en coupe, la part de chacun ne fait que monter). Le marketing et la R&D se décident avant les ventes qu'ils font ; la production, une fois connue la demande qui revient à chaque produit.
- **Impôt, amendes et dédits** : l'impôt et les amendes (scandales §8, ententes §7 bis) entrent dans les comptes du trimestre où ils tombent ; avec les dédits des contrats (§7 bis), ils se paient en tête de la clôture suivante (`CompanyState.taxDue`, `finesDue`). D'ici là ce sont des dettes : la valeur comptable les déduit. Une fusion les transfère à l'absorbante ; une faillite les efface.
- **Faillite** si, en tête de clôture, la trésorerie ne couvre pas les obligations. Les faillites d'une clôture se décident ensemble, sans dépendre de l'ordre des entreprises : les livraisons d'un vendeur qui ne couvre même pas ses obligations hors contrats ne comptent pas dans celles de ses acheteurs. L'entreprise passe `bankrupt` avant les enchères, sans comptes pour ce trimestre : cours 0, produits retirés, plus aucune action possible, filiales rendues aux enchères. Titre de journal. Le contrôleur est évincé sans parachute (stat `bankruptcies`).
- **Plan de clôture** : pendant le tour, le dirigeant voit ce que fera la clôture si rien ne change (`CompanyView.private.closePlan`, `planClose`), le calcul de la résolution sur les **ventes attendues** : la demande attendue (sans le tirage du trimestre) et les produits des autres à leurs prix connus (ceux du trimestre précédent, §12), à leur qualité et leur notoriété publiques. Il donne les obligations détaillées, les mises (de son dirigeant actuel) et la part que la trésorerie de fin de trimestre en couvrirait, les lots prévus et payés, le marketing et la R&D prévus et payés, les ventes attendues, l'extraction de chaque filiale, ce qui manque (`shortfall` = obligations + ce que les ventes attendues ne couvrent pas des mises, de la production, du marketing et de la R&D − trésorerie), l'emprunt qui le comble (`loan`, intérêts en plus compris : emprunter fait monter le taux, donc les intérêts de la clôture), la **marge** (`margin` : un écart type de la demande, Σ ventes attendues × volatilité du secteur, §5.1) avec ce qui manquerait si les ventes déçoivent d'autant (`safeShortfall`, `safeLoan`), et la faillite annoncée (`bankrupt`). Le client en fait un bandeau (§12).

`bookValue = cash − dette − impôt et amendes dus + Σ inventaire (lots × avgCost) + Σ stock produits × lastUnitCost + 0,5 × Σ (capacité + capacité en commande) × capacityCost + 0,5 × Σ prix payé des filiales` (les lancements restant à passer en charge, §5.6, n'y figurent pas : leur coût a déjà quitté la trésorerie).

Les intérêts de la dette d'entreprise sont calculés sur la dette au moment de la clôture et payés en tête de clôture ; ils entrent dans le compte de résultat du trimestre, comme les coûts fixes.

### 5.8 Géographie

Toutes les parties se jouent sur le même pays imaginaire, la **République de Haute-Marge** (« Republic of Upper Margin » en anglais). Rien ne s'y construit : c'est un plateau fixe (`content/map.ts`), positions en km (x d'ouest en est, y du nord au sud, cadre de 1 000 × 1 200 km), distances à vol d'oiseau (`distanceKm`). Les noms sont dans le contenu de chaque langue (`ContentBundle.mapNames`) ; l'état ne garde que des identifiants.

- **Cinq villes** (`CITIES`), chacune avec sa part de la population et ses goûts : la capitale, Port-Dividende (port, bourse des matières, bourse des actions ; 40 %), une grande ville au nord-est (20 %), une ville moyenne au sud (20 %), deux petites villes à l'est et au nord (10 % chacune). Les clients de chaque secteur s'y répartissent, et un produit vend mieux dans la ville de son usine (bonus « fabriqué ici », marchés régionaux §5.2 bis).
- **Sept zones d'usine** (`ZONES`) : une par ville, plus la plaine (au sud-ouest, pays du sucre) et la montagne (à l'est, pays du lithium). Chaque produit a son usine dans une zone (`ProductState.zoneId`, publique ; absente = la capitale, `DEFAULT_ZONE`).
- **Douze gisements** (`DEPOSITS`), un par emplacement de filiale (§5.5 bis, ids `oil-1`… `chips-3`) : leur position est fixe, leur nom se tire toujours par la graine des textes. Deux sont en mer (pétrole du large et du golfe).
- **Le relief** (décor) : une côte découpée (presqu'île du nord-ouest, Baie des Bonus, Golfe des Dividendes et son Île-aux-Niches, Cap de Bonne-Évasion), le Lac Offshore au centre, le fleuve La Rente qui en descend vers la capitale, la chaîne des Monts-Défiscalisés à l'est (`COASTLINE`, `ISLAND`, `LAKE`, `RIVERS`, `MOUNTAIN_RANGE`, noms dans `mapNames.landmarks`).
- **Les routes** (`ROADS`) relient les zones, les gisements et quelques carrefours (`JUNCTIONS`) : deux autoroutes depuis la capitale (A1 vers le nord-est par la rive nord du lac, A2 vers le sud), des nationales qui contournent le lac, un col vers la montagne, des pipelines vers le pétrole en mer. Chaque sorte de route a son facteur de prix au km (`ROAD_FACTOR` : autoroute 0,7, nationale 1, montagne 1,6, pipeline 1,2). Entre deux points du réseau, les marchandises prennent toujours l'**itinéraire le moins cher** (`roadRoute` : longueur réelle, longueur pondérée par les facteurs, tracé), calculé une fois pour toutes au chargement : le même pour tous et dans toutes les parties. Les routes font le prix du transport (ci-dessous).
- **Les usines placées.** Chaque usine est dans une zone ; une zone n'a pas de limite d'usines. Elle se choisit au lancement (`launchProduct { zoneId }`, la capitale par défaut) et se change par `moveFactory { companyId, productId, zoneId }` : **gratuit le trimestre où le produit démarre** (premier trimestre pour les produits de départ, trimestre du lancement, trimestre de la fondation d'une start-up), ensuite `FACTORY_MOVE_COST_RATIO` (25 %) × (capacité + capacité en commande) × `capacityCost`, payés comptant et passés en charges spéciales du trimestre. L'effet est immédiat : la production de la clôture part de la nouvelle zone. Refusé si la zone est inconnue ou la même. Une fusion garde la zone des produits ; les PNJ et le pilote automatique restent à la capitale.
- **La main-d'œuvre de chaque zone, par secteur** (`ZoneDef.labor`, capitale = 1) : chaque zone a ses spécialités. Boissons, gadgets, trottinettes, yaourts, crypto : nord-est 1 / 0,91 / 0,97 / 1 / 0,9 (la tech) ; sud 0,92 / 0,97 / 0,9 / 0,9 / 1 (trottinettes, yaourts) ; est 0,95 / 0,88 / 0,9 / 0,95 / 0,95 ; nord 0,86 / 0,94 / 0,95 / 0,92 / 0,97 (boissons) ; plaine 0,88 / 0,97 / 0,97 / 0,85 / 1 (l'agroalimentaire) ; montagne 1 / 0,93 / 0,84 / 1 / 0,95 (les batteries).
- **Le transport** (`sim/transport.ts`) : `TRANSPORT_COST_PER_KM` (0,0045 k par lot et par km pondéré, `roadRoute`) × le **poids de fret** de la marchandise (`freightWeight`) × les km. « Un lot, c'est un camion », mais tous les camions ne pèsent pas pareil. Par secteur (livraison) : boissons 3 (canettes lourdes), yaourts 2,5 (la chaîne du froid), trottinettes 2 (encombrantes), gadgets 0,6 (la poste), crypto 0 (immatérielle, drapeau `intangible`). Par matière (appro) : pétrole 1,5 (citerne), sucre 1,5 (sacs), lithium 1, puces 0,2 (tiennent dans une enveloppe). Donc ce qui vaut peu par lot a intérêt à voyager peu, et ce qui pèse lourd aussi. **Fret absolu** : chaque flux paie son trajet réel depuis zéro, capitale comprise, au poids de la marchandise :
  - **exception crypto** : produit intangible (drapeau `intangible`, `freightWeight` 0), transport nul des intrants et de la livraison dans les deux modes, résolution et estimations comprises ; les matières et les salaires restent payants ;
  - matière venue du port (achats, achats d'urgence, contrats reçus, stock) : le trajet port → usine, au `freightWeight` de la matière ;
  - matière fournie par sa filiale : trajet gisement → usine, au `freightWeight` de la matière. Le coût d'extraction ne comprend pas le trajet. Les filiales en service fournissent d'abord la production, filiale par filiale, jusqu'à leur capacité moins ce que l'entreprise doit livrer par contrat de la même matière (`siteSupply`), que les lots sortent de l'extraction du trimestre ou du stock que la filiale a rempli ; le reste vient du port ; chaque produit prend le mélange de la matière au prorata de sa consommation. Le surplus extrait part au stock, sans transport en plus ;
  - livraison : par lot produit, `freightWeight` du secteur × Σ part de chaque ville dans les ventes de référence du secteur depuis la zone × km(usine → ville). Ventes de référence (`salesMix`) : celles d'un produit d'attractivité 1 face à 3,5 d'attractivité venue de la capitale (`MIX_REF_OTHERS`, environ 22 % du marché), au partage ville par ville du §5.2 bis — l'attractivité étant plate, le mélange suit les goûts des villes et le bonus « fabriqué ici ». Ce mélange est fixe par secteur et par zone, pour que le transport ne dépende ni des rivaux ni des prix (et que le plan, les estimations et la résolution comptent le même) ; le rapport donne les ventes réelles par ville, la livraison est facturée au mélange de référence. Une usine dans sa ville vend surtout sur place et livre donc moins loin.

  Le transport se paie avec la production (trésorerie, coût des ventes, `lastUnitCost`), compté à l'identique par la résolution (et sa garde de fin de trimestre), le plan de clôture (§5.7) et les estimations (coût unitaire estimé, ventes estimées, lancement par zone `SectorView.launchByZone`). **Une usine à la capitale paie les livraisons aux autres villes**, et le trajet des matières de ses filiales jusqu'à elle ; seul le trajet port → capitale est nul. Les deux parts « Fret matières premières » et « Fret livraison » sont des moyennes par lot produit, dont les lignes détaillent recette, sources, distances routières pondérées, poids et coût. Le détail est accessible au survol, au focus clavier et au clic : pour la livraison, ville par ville, le coût d'un lot livré là (avec la distance par la route), la part des ventes de la ville et le coût pondéré qui en résulte ; pour les matières, source par source (port ou filiale), le coût d'un lot de matière acheminé jusqu'à l'usine (avec la distance), la part de cette source, les lots de matière par lot produit et le coût pondéré. Le rapport mémorise les sources et les coûts du trimestre clos (`ProductReport.freight`), sans les recalculer avec les décisions ou nouvelles suivantes.

  **Prix de référence (fret réel, octobre 2026)** : chaque secteur ajoute uniquement sa livraison standard depuis la capitale hexagonale, puis arrondit au k entier : `round(ancien refPrice + deliveryPerLotHex(capitalHexId, secteur))`. La même livraison depuis la zone capitale classique donne exactement les mêmes montants. Au tarif 0,0045 × poids × Σ mélange de ventes × route capitale → ville : boissons 4,164433368951229 k (85 → **89**), gadgets 0,7890258619449443 k (305 → **306**), trottinettes 2,577692113358869 k (435 → **438**), yaourts 4,379272687812108 k (57 → **61**), crypto 0 k (**260** inchangé). Aucun autre paramètre n'est compensé. Bornes de prix, prix des bots et produits nouveaux, taille monétaire du marché, conseils et lancement utilisent toujours `refPrice` ; ce changement déplace volontairement leurs chiffres. Les réglages d'ouverture incluent désormais cette livraison standard dans leur coût unitaire.
- **Pression sur les salaires** (hors capitale, dont le bassin d'emploi est sans fond) : la main-d'œuvre d'une usine renchérit de `WAGE_PRESSURE_PER_PLANT` (3 %) par autre usine de sa zone, au plus pour `WAGE_PRESSURE_MAX_PLANTS` (5) autres (+15 %). Arriver tôt dans une zone a donc de la valeur, et l'emplacement que tout le monde prend se paie. Les estimations comptent la pression comme si l'usine y était (la sienne exclue ; une usine nouvelle compte toutes celles déjà là), et les bots en tiennent compte en choisissant leur zone.
- **Nouvelles locales** (§9, lot « carte », `content/*/extra/map.ts`) : un effet `zoneLabor` (zone, multiplicateur, durée) change la main-d'œuvre de toutes les usines d'une zone (grève ×1,15 à ×1,4, subvention ×0,8 à ×0,92) ; un effet `transportCost` (multiplicateur, durée) change le prix de tout le transport (gazole, péages, route coupée ; ×0,6 à ×2). Les deux comptent à l'identique dans la résolution, le plan de clôture et les estimations ; le multiplicateur s’applique aux matières et à la livraison, capitale comprise.
- **Ce que voient les joueurs** : la zone de chaque usine et les ventes par ville du dernier trimestre sont publiques (`ProductView.zoneId`, `lastSalesByCity`) ; le reste seulement pour ses produits : coût unitaire, demande estimée (aux décisions actuelles, face aux mêmes rivaux) et prix du déménagement zone par zone (`private.zones.unitCost`, `demand`, `moveCost`), coût, demande et bénéfice d'un lancement par zone (`SectorView.launchByZone`).
- **Bots** : le trimestre où un produit démarre, un bot (normal ou expert) installe l'usine dans la zone qui rapporte le plus par trimestre (`zoneValues`) : pour chaque zone, la meilleure marge (prix − coût unitaire estimé de la zone : main-d'œuvre avec la pression sur les salaires, transport, ses filiales) × demande, prix de 30 à 300 % du prix de référence, demande non plafonnée par la capacité, au premier trimestre de ventes, face aux rivaux connus ; il déménage si le gain sur la capitale dépasse 1 % du coût des ventes à la capitale. Il choisit avant de régler prix et production, et ne déménage jamais ensuite. L'expert estime aussi un lancement à sa meilleure zone (`launchByZone`). Les stagiaires, les PNJ et le pilote automatique restent à la capitale.

### 5.8 bis Le plateau (mode hexagonal)

`GameConfig.mapMode: 'hex'` active un plateau distinct ; absent ou `'classic'`, le jeu conserve exactement ses règles,
son RNG et ses résultats. Le plateau est complété par les terrains de départ (§5.8 ter) et les enchères de cases
(§5.8 quater) ; l'interface du salon vient au lot 4. Le cahier de la variante est [terrains.md](terrains.md).

- **Grille** : hexagones pointus de rayon 45 km (environ 78 km de large), rangées décalées (`q` = colonne,
  `r` = rangée à partir de zéro), construits au chargement depuis la géométrie fixe de la carte. Identifiants A1,
  A2… B1… ; villes A10/H5/E16/C3/K11, plaine D17, montagne K8, île A15. Les routes ne bloquent aucune case.
  Le relevé de référence compte **158 cases continentales** ; l’ajout explicite d’A15 donne **159 cases terrestres,
  dont 149 constructibles** après exclusion des dix gisements terrestres. Les deux gisements marins restent des
  destinations du réseau, sans case de plateau. Les montagnes et l’île sont constructibles.
- **Occupation** : une usine par case, tous produits des entreprises actives compris, même en attente de capacité.
  Les PNJ reçoivent d’abord leurs cases dans l’ordre du catalogue, sans occuper A10 ni sa première couronne : les
  deux premiers prennent les premières cases libres à distance exactement 2 d’A10 ; les suivants la case libre
  la plus proche d’une ville de province, dans l’ordre nord-est, sud, est, nord, puis en boucle. Les huit cases de
  départ (§5.8 ter) sont exclues du placement des PNJ, même lorsqu'elles ne sont pas attribuées. Distances
  hexagonales, égalités dans l’ordre du plateau, sans RNG pour les PNJ. Les joueurs reçoivent leur terrain selon
  l'attribution du §5.8 ter. Les lancements, déménagements et fondations demandent désormais une case explicite,
  une mise et, pour les lancements/start-ups, un choix de repli (§5.8 quater). Les mises ne réservent pas la case.
  Le déménagement gagné s'exécute après les comptes : l'usine produit ce trimestre sur sa case d'origine, avec
  ses effets de terrain, puis sur sa destination dès le suivant. Arrêt et faillite libèrent les cases ; fusion :
  les produits et le coût de leurs terrains sont transférés, les mises de l'entreprise absorbée tombent.

Les coûts des routes sont calculés une fois pour toutes. Pour une case ordinaire h et
une destination t (zone, gisement ou carrefour), en kilomètres pondérés :

```
piste(h,n) = 1,5 × (km hors montagne + 1,6 × km en montagne)
route(h,t) = min_n(piste(h,n) + roadRoute(n,t).cost)   n accessible à sec, y compris t s’il est terrestre
bassin(h)  = argmin_z route(h,z)                       z dans les sept zones, ordre du catalogue en cas d’égalité
ring(h)    = distance hexagonale(h, case du bassin(h))
travail(h,s) = ZONES[bassin(h)].labor[s] × (1 + 0,02 × max(0, ring(h) − 1))
              × effets zoneLabor × (1 + 0,03 × min(5, autres usines actives du bassin))
```

Une case portant un nœud (ville, zone, gisement) est **ancrée à ce nœud**, accès zéro : ses routes sont exactement
`roadRoute`, sans raccourci par une piste issue du centre approché de l’hexagone. Cela préserve la symétrie et la
parité avec le réseau classique. Une piste ne touche jamais le lac et reste dans le polygone côtier (sa frontière
est admise). Les gisements marins ne sont accessibles que par les pipelines du réseau. La portion montagneuse est
mesurée au chargement par échantillonnage déterministe : segments égaux d’au plus 5 km, relief testé au milieu de
chacun. Aucun tracé de piste ne constitue une nouvelle route.
L’île passe uniquement par le bac : `route(A15,t) = 325 × 0,7 + route(A10,t)`.
Le bassin de la capitale est exempt de pression salariale ; le facteur d’éloignement reste applicable.

```
port(h)     = route(h,capitale)
site(h,g)   = route(h,g)
ville(h,k)  = route(h,k)
π(h,k)      = 1 + localBonus_s × [k ≠ capitale] × [distanceHex(h,case(k)) ≤ 1]    (« fabriqué ici » ; 1 partout ailleurs)
π(A10,k)    = 1                                                (la capitale reste neutre, elle et ses voisines)
livraison(h,s) = Σ_k salesMix(h,s,k) × ville(h,k)
```

Le mélange de ventes de référence reprend le §5.8 (attractivité 1 face à 3,5 au port), avec le profil π de la case.
Les kilomètres sont multipliés par `TRANSPORT_COST_PER_KM` (0,0045 k par lot) et par le `freightWeight` du produit
ou de la matière, les flux de matières et les effets
`transportCost`. Sur A10, seul le trajet du port est nul ; les matières de filiales et les livraisons aux autres villes sont payées. Le bonus « fabriqué ici » vaut sur la case de la ville et ses six voisines,
sauf pour la capitale : A10 conserve son exception nationale et ni A10 ni ses voisines n'ont de bonus.
Sans usine en rayon hors d’A10, le calcul national à une composante reste utilisé.
Les voisines d’A10 conservent donc leurs propres trajets et un facteur π de 1 partout ; elles ne partagent ni l’accès
gratuit au port ni le profil national d’A10. Le placement provincial des PNJ active les marchés régionaux dès le départ.

**Chaleur vendue** : uniquement pour la crypto, crédit de **5 k par lot produit** × climat de la ville de province
sur sa case et ses six voisines (nord 1,5 ; nord-est 1,2 ; est 1 ; sud 0,5). Si plusieurs réseaux provinciaux sont
accessibles, choisir la ville la plus proche à vol d’oiseau, puis l’ordre du catalogue. La case de la montagne et
ses voisines reçoivent **10 k par lot** (station de ski), en priorité. Capitale, plaine, île et cases hors réseau : 0.
Le crédit est retranché après les multiplicateurs de main-d’œuvre, sans plancher artificiel ; les nouvelles de chaleur
du §9 peuvent le multiplier temporairement. Une estimation de déménagement ne conserve une news de chaleur
que si la nouvelle case remplit toujours ses conditions (réseau provincial ou station de ski).
Résolution, financement de la clôture, coûts unitaires, estimations et bots utilisent tous ce même montant ; la vue
privée expose `heatCredit` (k par lot).

**Vues et bots** : position et occupation publiques (`ProductView.hexId`, `PlayerView.hexes.occupied/free`). Les
estimations par case (`unitCostByHex`, `hexValues`, `hexDemand`, `estimateLaunchInHex`) acceptent une liste de
candidates. Les vues privées évaluent toutes les cases constructibles libres, plus la case actuelle et la destination
adjugée de chaque produit ; les bots prennent au plus dix cases libres par bassin, les plus proches de son centre par
distance hexagonale (égalité : ordre du plateau), plus la case actuelle. Les champs historiques de
coût/demande par zone restent des repères évalués à la case du centre, même si celle-ci est occupée ; les candidats
hexagonaux sont seuls utilisables pour choisir une case libre. Pas de nouveau champ privé dans les vues des rivaux.

Les bots normaux et experts déposent des mises explicites (`hexId`, `bid`, `fallback`) pour leurs lancements.
Ils classent les cases par valeur nette sur les trimestres restants, terrain et frais de lancement déduits ; la
mise dépend aussi de leur personnalité et de leur trésorerie après engagements. Les prévisions de l'expert
utilisent le profil π de la case dans chaque ville. Les usines existantes peuvent miser chaque trimestre, sauf
le dernier : leur gain depuis la case actuelle, après impôt et perte éventuelle du siège, doit amortir le terrain
et le déménagement sur les trimestres restants. Pour une usine déjà placée, le gain trimestriel doit aussi atteindre
au moins 1 % du coût des ventes de la référence capitale ; un départ de l'incubateur n'applique pas ce seuil. Un projet ou
une usine déjà en attente d'adjudication ne dépose pas une deuxième mise ; les autres mises du même dirigeant
excluent leur case des candidates.

`--pin-capital` interdit les déménagements des bots et fait miser les lancements sur la candidate libre la plus
proche d'A10 (égalité : ordre du plateau), éventuellement au-delà de la première couronne si celle-ci est pleine.
Les PNJ gardent leurs positions de départ, y compris provinciales ; les stagiaires ne déposent pas de nouvelles
mises. Les cours d'introduction gardent le calcul national initial pour ne
pas réévaluer les dotations de départ ; les flux et les comptes utilisent ensuite les positions réelles dès le
premier trimestre.

`npm run sim -- --hex` rapporte aussi les usines actives par bassin à la fin des parties (total et moyenne), les
déménagements exécutés, les adjudications, replis, abandons et lancements effectifs, ainsi que les résultats par
terrain attribué et secteur de départ. Le diagnostic `engineDiagnostics.factoryMoves`, hors état du jeu et RNG,
compte les déménagements hexagonaux gagnés à leur exécution, départs de l'incubateur exclus ; les demandes, les
lancements et les déplacements annulés ne comptent pas. En mode classique, il compte les demandes réussies,
y compris au lancement. Le script le remet à zéro avant chaque partie. Les placements initiaux et refus ne
comptent pas. `--summary-json` exporte ces mesures, les quantiles, faillites, appels de marge et joueurs sous 5 M.

### 5.8 ter Les terrains de départ

En mode hexagonal, les huit terrains de [terrains.md, §2 à §4](terrains.md#2-les-huit-terrains) associent une case et
des effets : marketing au quai (×1,5) et au front de mer (×1,8), R&D aux Faubourgs (×2), salaires aux Portes
(×0,8 pendant huit trimestres), à Ristourne (×0,9), dans la plaine (×0,8) et aux Monts (×0,9), périssabilité à
Ristourne (×0,5), impôt à 5 % aux Monts et zéro impôt sur l'île, hausses de scandale sur l'île (×1,5).
*Équilibrage (4 octobre 2026, après les mesures du lot 5) : l'île passe de l'impôt à 5 % à zéro impôt et des hausses
de scandale ×2 à ×1,5 ; part de victoire nette de l'effet de secteur 0,60 → 0,70, au-dessus du critère des deux tiers
([terrains.md §6.5](terrains.md#65-le-calage-sur-les-parties-simulées-lot-5)).*
Les données bilingues et
les récits ont été importés une seule fois depuis [terrains-recits.md](terrains-recits.md) en octobre 2026.
`content/fr/terrains.ts` et `content/en/terrains.ts` sont désormais la source de vérité, maintenue à la main,
puis chargée par `ContentBundle.terrains`.

- **Attribution** : cinq modes, `terrainAssignment: 'fair'` par défaut, `'fair_varied'`, `'random'`, `'choice'` ou
  `'host'`. Les choix de `choice` et les placements de `host` arrivent dans `terrains: Record<playerId, terrainId>`.
  La valeur est estimée par le moteur depuis la position et les effets,
  au prorata des trimestres où ils s'appliquent. La recherche équitable examine toutes les injections des joueurs
  dans les huit terrains : elle maximise d'abord la valeur minimale, puis minimise l'écart maximum-minimum ; les
  égalités sont départagées par le RNG. Le mode équitable varié tire uniformément, avec ce RNG, parmi toutes les
  injections dont le minimum vaut au moins le meilleur minimum moins 20 k par trimestre, sans départage par l'écart.
  Le mode aléatoire utilise une permutation du même RNG. L'appréciation par
  secteur exposée dans le salon utilise cette même estimation. En mode hôte, les choix valides et distincts sont
  conservés ; pour les joueurs sans choix, la recherche équitable utilise seulement les terrains restants et
  maximise le minimum de ces joueurs, puis réduit leur écart. Le serveur nomme à l’hôte les joueurs placés
  automatiquement après le démarrage. En mode au choix, le serveur tire l'ordre des humains, puis chacun choisit
  un terrain libre à son tour ; les bots n'ont pas de tour au salon. En solo comme à plusieurs, les choix explicites
  sont conservés, puis chaque bot sans choix prend le terrain restant de plus haute valeur pour son secteur, dans
  l'ordre des joueurs ; une égalité suit l'ordre du catalogue. Les humains sans choix reçoivent ensuite un remplissage
  équitable sur les terrains restants, et le serveur en informe l'hôte. L'hôte peut démarrer à tout moment. En mode
  hôte, tous les joueurs sans choix, bots compris, gardent le remplissage équitable. Choix inconnus ou en double :
  refus. Un terrain non attribué reste ordinaire.
  La valeur est le gain net trimestriel moyen face à la capitale ordinaire sur toute la partie : qualité et
  notoriété progressent avec les budgets initiaux, la demande suit sa croissance et les ventes sont plafonnées
  par la production et la capacité. Chaque effet expire à sa date. Coûts fixes, budgets, impôt, pertes sur un stock
  attendu de 20 % de la production et amendes attendues entrent dans le calcul. Le risque de référence est une
  jauge de 20 appliquée à la trésorerie initiale ; le levier de scandale multiplie l’amende attendue (×1,5 sur l’île). Ces hypothèses communes ne prédisent ni triche ni news futures, et n’optimisent pas le patrimoine final
  ([terrains.md §4](terrains.md#4-lattribution-au-salon)). Seuils d’appréciation : +100, 0 et −100 k par trimestre.
  La valeur du modèle est corrigée, pour huit couples terrain × secteur, par la table `TERRAIN_CALIBRATION`
  (k par trimestre) issue des parties simulées du lot 5 ([terrains.md §6.5](terrains.md#65-le-calage-sur-les-parties-simulées-lot-5)) :
  l'île pour la crypto (−95), les trottinettes (−115), les boissons (−55) et les yaourts (+50), les Monts pour les yaourts
  (−90), les Faubourgs pour les boissons (−65) et la crypto (+70), le front de mer pour les yaourts (+40). Le mode
  classique n'y touche pas.
- **Propriété** : effets d'usine sur le seul produit de départ ; effets de siège (`tax`, `scandal`) sur toute
  l'entreprise. Une pause de production les conserve, une prise de contrôle aussi. Départ effectif à la clôture,
  arrêt du produit de départ ou faillite les retirent définitivement. Une fusion supprime les effets de siège des
  deux sociétés mais conserve ceux des usines tant qu'elles restent sur leur case. Une start-up n'en reçoit aucun.
- **Calculs communs** : travail, budgets de qualité/notoriété, stock périssable, coût fixe, demande après logit et
  chaleur passent par les mêmes fonctions dans la résolution, le plan de clôture, les estimations et les bots.
  Le taux d’impôt d’une société est le minimum de son taux ordinaire (optimisation comprise) et de son privilège
  de siège modifié par les news locales, sauf suspension du privilège. `addScandal` multiplie seulement les hausses,
  après le plafond propre au lanceur d’alerte ; les baisses de communication de crise restent inchangées.
- **Vues** : attribution publique, nom, étiquettes et activité dans `PlayerView.terrains` ; domicile dans
  `CompanyView.terrainId` ; multiplicateur public des hausses dans `CompanyView.scandalMultiplier`. Le taux public
  `CompanyView.taxRate` combine taux national et siège, news locales comprises, sans optimisation fiscale secrète.
  `CompanyView.horizonSeatTaxRate` donne le taux de siège sans optimisation ni news fiscale locale temporaire.
  Le seul contrôleur voit `CompanyView.private.taxRate` (taux effectif actuel) et `private.taxRateHorizon`
  (taux du trimestre courant jusqu’à la fin, avec expiration des effets connus), ainsi que
  `ProductView.private.terrainEffects` et `private.terrainProjection` (case, coûts unitaires/fixes et multiplicateurs de
  R&D, marketing, demande et périssabilité projetés jusqu’à leur expiration). Une mise de déménagement ne suppose
  aucune victoire dans ces projections. `pendingHexId` ne porte que la destination gagnée entre règlement et
  exécution ; `ProductView.private.market.demandMultiplier` et
  `market.perishabilityMultiplier` donnent les multiplicateurs de demande et de périssabilité du terrain et des news
  locales en cours, pour les estimations du client. L’attribution initiale dans `GameState.terrainAssignments` mesure les résultats par terrain
  et secteur d’origine après déménagement, prise de contrôle, fusion ou faillite.
  En partie, `ProductView.private.hexes.unitCost/demand` couvre toutes les cases constructibles libres, plus la
  case actuelle et `pendingHexId` du produit ; `SectorView.launchByHex` couvre toutes les cases libres. Ces tables
  utilisent les calculs exacts existants ; les bots continuent à choisir parmi `candidateHexes`.

Les enchères et les projets de lancement suivent désormais le §5.8 quater. Le mode classique ne tire aucune carte de terrain et n'effectue aucun tirage
d'attribution supplémentaire.

### 5.8 quater Les enchères sur les cases

#### Terrains indépendants et réseaux d’usines (nouvelles parties, octobre 2026)

Les **nouveaux salons hexagonaux** portent `industryRules: 'network'`. Un salon sauvegardé sans ce drapeau garde
ses règles précédentes ; le mode classique reste inchangé. Les règles ci-dessous remplacent le déménagement et
la propriété liée au produit dans ces nouveaux salons.

- Une entreprise peut acheter une case constructible sans usine (`bidLand`). Une seule mise foncière est en cours
  par joueur et par trimestre, toutes ses entreprises comprises ; une nouvelle mise remplace la précédente.
  Si `n` terrains **vacants** sont détenus par ses entreprises actives, la mise minimale est
  `prixDeBase(case) × 2^n`. Ce minimum est fixé au dépôt de la mise. L’enchère reste au second prix : le gagnant
  paie le maximum de **son** minimum et de la meilleure mise perdante admissible, jamais plus que sa mise.
  Les constructions productives paient la réserve de base, sans cette majoration foncière.
- La propriété (`CompanyState.land`) est indépendante des usines. Un terrain vacant coûte chaque trimestre
  `0,05 × max(prixPayé, prixDeBase(case))`, dans les obligations fixes payées avant production. Une construction
  en commande compte déjà comme une occupation. Le terrain entre au bilan à **50 % du prix payé** une seule fois.
- Construire sur un terrain déjà détenu paie uniquement le coût de lancement du secteur ; sur une case libre,
  terrain et construction sont adjugés à la clôture. Une usine est disponible au trimestre suivant. Les nouveaux
  chantiers sont interdits au dernier trimestre. Une seule usine par case ; gisements et cases non constructibles
  restent exclus des achats de terrain.
- Les usines sont **fixes**. Le premier départ d’une start-up de l’incubateur reste une installation initiale.
  Chaque usine a un plafond de capacité de `2 × capacitéInitiale`, extensions livrées ou en commande comprises.
  La capacité initiale est enregistrée à sa création, et ne grandit jamais avec les extensions.
- `buildFactory` ouvre un autre site du **même produit commercial**. Le nom, le secteur, le prix, la qualité,
  la notoriété, la publicité et la R&D sont communs (`productProfiles`). Chaque usine conserve un identifiant,
  une position, des coûts, une capacité, une production et un stock propres. Une seule usine porte les budgets
  communs : celle d’origine, puis la première survivante si elle ferme. Ses multiplicateurs de terrain servent
  à la publicité et à la R&D du produit. Qualité et notoriété évoluent **une seule fois** par clôture.
- Une marque contribue une seule attractivité au marché : les usines actives se partagent cette attractivité
  proportionnellement à leur capacité physique. Le bonus local de chaque usine s’applique ensuite dans le logit
  par ville. Cette règle conserve la demande à positions identiques et évite de multiplier artificiellement une
  marque par son nombre de sites. Le calcul de clôture, la vue et les estimations utilisent les mêmes poids.
  Il s’agit d’une répartition par capacité, sans optimisation automatique des trajets de livraison.
- Fermer une usine liquide sa capacité et son stock, conserve le terrain et les autres usines du produit.
  Le dernier site fermé arrête le produit. Vendre un terrain vacant (`sellLand`) rapporte **50 % du prix payé**
  et libère la case. Une fusion transfère les terrains et profils ; une faillite les libère. La limite de 4 produits
  (6 après fusion) compte les marques commerciales, et non le nombre d’usines.
- Le territoire utilise la couleur de l’entreprise en Bourse ; un drapeau distingue le terrain vacant.
  Le bandeau au-dessus de la carte propose achat de terrain et construction du produit existant ou nouveau choisi dans la palette, avec prix et frais dans son formulaire.
  Les anciennes descriptions de déménagement ci-dessous s’appliquent uniquement aux salons sans ce drapeau.

Vérification : tests `engine.industry.test.ts`, sauvegarde/restauration serveur et simulation
`npm run sim -- --hex --network`. Aucun paramètre économique sectoriel n’est modifié par ces règles.

En mode hexagonal seulement, [terrains.md, §5](terrains.md#5-les-enchères-sur-les-cases) définit les règles détaillées.
`GameState.hexBids` garde les mises privées (`move`, `launch`, `startup`) et leur résultat jusqu'au règlement suivant.
Les cases coûtent 400 k€ sur une ville et ses voisines, 250 k€ à distance 2, 150 k€ au-delà (`HEX_RESERVE_*`).
Leur prix payé, `ProductState.landCost`, compte pour moitié au bilan ; les attributions de départ coûtent zéro.

Après les ventes et `awardSites`, les enchères directes suivent l'ordre du plateau : une mise vaut au plus le cash
restant moins les frais de déplacement/lancement. Seul candidat, le gagnant paie la réserve ; plusieurs, la meilleure
mise perdante, jamais plus que sa propre mise. Les égalités utilisent un hachage de la graine secrète, du tour et
de l'entreprise, sans RNG. Le plan de clôture réserve toutes les mises et leurs frais.

Les perdants de lancement/start-up avec `fallback: 'nearest'` se replient ensuite par la route, dans un ordre haché
par entreprise, sur des cases libres au début du règlement n'ayant reçu aucune mise valable. Égalités de distance :
ordre du plateau ; plusieurs projets de la même entreprise : ordre des cibles puis identifiant. Un repli trop cher
est abandonné. Une case quittée ce soir, par déménagement ou faillite à cette clôture, attend les enchères du
trimestre suivant. Les mises invalides tombent sans repli.

Un lancement dépose seulement un projet privé qui compte dans les places de produits. Son identifiant utilise
un compteur privé du joueur qui le dépose, sans consommer le compteur des identifiants publics ; un projet annulé
ne laisse donc aucune trace dans les vues rivales, même après la clôture ou une prise de contrôle. En cas d'attribution, il paie
le lancement et le terrain à la clôture ; le premier quart d'amortissement est compté immédiatement, les budgets
et coûts fixes commencent au trimestre suivant, comme ses premières ventes. Le flash et le récit du domicile
paraissent dans le nouveau numéro au lancement réel ; leur contenu est construit après les déménagements gagnés
à cette clôture et après le décompte des effets, avec les durées évaluées au trimestre du nouveau numéro : un
privilège expirant ce soir n'est plus annoncé, et une suspension finissant ce soir ne masque plus le domicile.
Le flash hexagonal a ses propres textes (`hexProductLaunch`), annonçant la mise en rayon dès ce trimestre.
Une start-up vend dès sa fondation dans l'incubateur de la capitale (`incubator`,
sans case ni effet de terrain), puis quitte cet incubateur après adjudication ; abandon : elle peut remiser au tour
suivant. Au plus tard après deux trimestres d'incubation (F et F + 1), elle est placée d'office à la clôture, après
les enchères et les replis, sur la case libre la plus proche de la capitale par la route, à sa mise à prix ; si la
trésorerie ne suit pas, ou si l'entreprise n'a pas de dirigeant à la clôture (ni placement ni ligne privée, personne
à qui en facturer la décision), elle reste à l'incubateur et nouvel essai à la clôture suivante. Jamais à la dernière
clôture : les mises foncières y sont déjà refusées et une case nouvelle n'y vendrait plus rien. La ligne privée
« Fin de l'incubation » / « Incubation prolongée » revient au dirigeant actuel, pas au fondateur.

`PlayerView.self.hexBids` et `CompanyView.private.launchProjects` restent privés ; `PlayerView.hexes.reserve` et
`hexes.results` rendent publics les réserves et les résultats de la dernière clôture (case, attributaire, prix,
nombre de mises valables ; zéro sur une case de repli). Une mise tombée (trésorerie, changement de dirigeant) sur
la case attribuée est signalée, sans nom ni montant (`failedContenders`) ; ce fait public nourrit le récit de
l'enchérisseur anonyme absent. Aucun montant, cible ou repli rival en cours n'est révélé.

### 5.8 quinquies L’île 3D à parcelles carrées

Le lobby propose une troisième carte, **Île 3D** (`mapMode: 'square'`). Elle crée une nouvelle partie avec les
règles de réseaux d’usines ci-dessus. La carte classique et le plateau hexagonal restent disponibles ; le mode
est conservé dans la sauvegarde et ne change plus pendant la partie.

- Le quadrillage utilise des parcelles de **75 km de côté**, identifiées par `S-A1`, etc. Les quatre cases qui
  partagent un côté sont voisines ; une diagonale ne l’est pas. Les identifiants des plateaux carré et hexagonal
  sont distincts, et le serveur refuse une action visant une case d’un autre plateau.
- Le pays, les villes, les gisements et les routes conservent leur géographie. Les huit dotations de départ
  gardent leurs effets et sont rattachées aux parcelles du nouveau quadrillage. Les coûts et la demande utilisent
  les nouvelles parcelles ; les cases portant un nœud gardent son ancrage géographique. Les routes restent le réseau existant, avec ses accès,
  cols et traversées ; la grille n’invente pas des routes entre tous les voisins.
- Les paramètres économiques des secteurs ne changent pas. Les distances et les possibilités de voisinage
  diffèrent naturellement entre les plateaux ; l’équivalence de leur équilibrage n’est pas présumée. Les corrections
  empiriques d’attribution mesurées sur le plateau hexagonal ne sont pas appliquées au carré ; aucun calage propre
  au plateau carré n’a encore été mesuré.
- La caméra orthographique présente un diorama en 3D. Chaque secteur et chaque matière première possède son
  modèle Blender. Une extension livrée agrandit visuellement le site ; les commandes d’extension de l’entreprise
  contrôlée font apparaître un chantier jusqu’à leur livraison. La représentation dépend de la capacité réelle,
  sans ajouter de niveaux, de bonus ou de coûts de construction.
- La rotation et la navigation entre parcelles au clavier conservent le grossissement choisi. Les commandes
  de centrage rapproché et de vue d’ensemble restent explicites. Le quadrillage est mémorisé sur l’appareil ;
  si le stockage est indisponible, les préférences booléennes restent valables pendant la visite. Les étiquettes
  suivent la caméra même lorsque les animations sont figées.
- Sur la carte au clavier, les flèches restent dans la navigation des parcelles, même en bordure ; Tab permet
  de quitter le canevas. Échap efface le survol et son contour sans modifier la sélection. Annuler un dépôt
  retire aussi son aperçu et permet de reprendre immédiatement les outils.
- La sélection au pointeur demande un clic principal sans modificateur. Un déplacement de plus de 5 px,
  même suivi d'un retour au départ, un bouton secondaire, un second contact tactile ou une annulation
  excluent la sélection. Les gestes de caméra restent disponibles ; le double-clic principal ouvre toujours
  la fiche ou change la référence selon la parcelle.
- Les terrains acquis portent une teinte de propriétaire, une bordure continue et un drapeau, y compris
  avant la construction d’une usine. Le décor végétal et résidentiel laisse ces parcelles lisibles. Les couches
  économiques remplacent la teinte de fond mais conservent bordures et drapeaux ; sélection et référence
  gardent leurs repères distincts. La fiche sous la carte nomme le propriétaire et signale un terrain sans usine.
- La légende de l’île décrit les contours réellement dessinés : sélection orange, survol ou aperçu de placement
  bleu, référence de calcul violette lorsqu’elle diffère de la sélection. Elle nomme les couleurs des propriétaires
  des terrains et installations et conserve l’échelle économique, avec des pastilles carrées. Les symboles de
  mise, d’adjudication et de terrain de départ de la carte 2D ne sont pas annoncés dans cette légende 3D.
  Son aide clavier reprend la navigation propre à l’île, y compris Tab pour quitter le canevas.
- Sélectionner une parcelle ouvre sa fiche. Déposer un profil d’usine sur une parcelle disponible, ou une filiale
  sur un gisement compatible, prépare le formulaire de commande. Le coût, la cible et la confirmation restent
  explicites. Les usines construites restent fixes ; le glisser-déposer n’autorise pas leur déplacement gratuit.
- Le journal et les fiches de gestion restent accessibles. Les lectures économiques utilisent les mêmes
  estimations que les autres vues. Le renderer ne reçoit que la `PlayerView` autorisée : ni les projets privés,
  ni les stocks, ni les productions prévues des concurrents ne sont reconstitués à partir des animations.
- Les déplacements ambiants illustrent la vie de l’île. Les livraisons de produits correspondent au dernier
  trimestre clos ; les trajets d’approvisionnement représentent des liaisons possibles, car le moteur partage
  les matières au niveau de l’entreprise. Aucun nombre de véhicules n’est présenté comme un suivi exact de lots.
  Les produits dématérialisés n’utilisent ni camion ni trajet animé de livraison : leurs chiffres restent dans les villes.
- En calque Ventes, « Chiffres » montre les quantités publiées du produit suivi près des villes (au plus cinq
  cartouches, un seul si la scène fait moins de 500 px de large). Les cartouches évitent les contrôles et les
  autres étiquettes, restent près de leur ville et s’effacent si la place manque. Une liste HTML sous la scène
  conserve toutes les valeurs, le nom du produit et le trimestre clos lorsqu’il est connu ; elle reste lisible
  au clavier et sur petit écran. Les chiffres restent indépendants d’une autre référence de coloration.
  Une ancienne sauvegarde sans ventilation urbaine conserve son total national, sans inventer de parts par ville ;
  l’absence d’origine historique ne supprime pas les chiffres urbains disponibles. Une référence de lancement
  n’affiche pas de ventes. L’option n’ajoute pas de volumes sur les trajets d’approvisionnement.

Les sources Blender, le générateur et le catalogue exporté sont conservés dans `art_sources/isometric/`,
`tools/isometric/` et `packages/client/public/isometric/`. Le renderer 3D est chargé à la demande pour cette carte.

## 6. Bourse

### 6.1 Valeur fondamentale et cours

```
croissance = clamp(EMA_CA(dernier rapport) / max(EMA_CA(4 rapports plus tôt, ou le plus ancien), 1) − 1, −0.3, 0.5)
             (EMA 0,6/0,4 du CA reconstruite à partir des rapports trimestriels ; 0 avant deux rapports)
résultats = 40 × profitEma si profitEma ≥ 0, sinon 8 × profitEma
trésorerie nette = max(cash − dette, 0)
plancher = trésorerie nette + 0.3 × max(bookValue − trésorerie nette, 0) + 500      (valeur de liquidation)
fondamentale = max(plancher, bookValue + résultats) × (1 + 0.5 × croissance)
cible = fondamentale / sharesOutstanding × sentiment × marketSentiment
sharePrice ← 0.5 × sharePrice + 0.5 × cible, puis × exp(N(0, 0.03))
             (dernière résolution : sharePrice ← cible × exp(N(0, 0.03)), cours de clôture sans inertie)
sentiment ← 1 + (sentiment − 1) × 0.7 ;  marketSentiment ← 1 + (marketSentiment − 1) × 0.7   (bornés à [0,2 ; 5])
```

Plancher du cours : 0,01 k€ (0 pour une entreprise en faillite ; le cours d'une entreprise absorbée est figé).

*Équilibrage : le plancher valait 0,3 × max(bookValue, 0) + 500 : le marché ne valorisait alors qu'à 30 % la trésorerie d'une entreprise très déficitaire, et la distribuer en dividende enrichissait ses actionnaires. La trésorerie nette compte désormais à 100 %. La spec initiale appliquait aussi le multiple 40 aux pertes. Une entreprise qui perdait 300 k€ par trimestre valait alors moins du tiers de sa trésorerie ; avec un multiple de 8 sur les pertes (deux ans de pertes), elle se rapproche de ses fonds propres.*

Les effets de news `marketSentiment` et `companySentiment`, ainsi que la campagne de dénigrement, multiplient aussi **immédiatement** le cours (le marché lit le journal) en plus du sentiment ; les autres variations de sentiment (bonus, dividende, pilule, scandale) ne jouent qu'à la résolution.

Mouvements **immédiats** du cours dus aux flux de trésorerie (plancher 0,01) : un dividende ou un bonus fait baisser le cours de `montant / sharesOutstanding` ; une pilule empoisonnée le dilue en moyenne pondérée des anciennes actions et des actions émises à prix cassé : `(p × S + n × 0,5p) / (S + n)`.

Le **cours de clôture** (dernière résolution) est la cible elle-même, sans l'inertie de 0,5 × cours précédent : un gonflement du cours pendant le dernier tour (achats de ses propres actions à crédit, par exemple) ne compte pas au classement final.

### 6.2 Achat et vente (immédiat)

- On achète au **flottant** uniquement (actions non détenues par un joueur). Impossible de dépasser le flottant.
- **Flottant minimal** : un achat (ou un rachat d'actions par l'entreprise, qui fait monter tous les actionnaires) est refusé s'il ferait passer un actionnaire au-delà de **50 % + 1 action** alors que le flottant tomberait sous **40 %** du capital (`FLOAT_MIN`). Monter à 50 % + 1 action pour prendre ou défendre le contrôle reste toujours possible ; au-delà, on peut aller jusqu'à 60 % tant que le reste est en bourse. Le refus indique le plus gros achat permis.
  *Équilibrage (lot 2) : même avec le délit d'initié, l'optimiseur finissait à 100 % de sa propre entreprise (le rachat d'actions par l'entreprise n'est pas un achat d'initié). Mesuré sur une copie du moteur : part détenue en fin de partie 100 % → 70 %, ablation « sans auto-contrôle » 0,47 → 0,58. Mesure finale (optimiseur ré-optimisé pour le lot 2) : `FLOAT_MIN` passe de 30 % à 40 % ; part détenue en fin de partie 70 % → 60 %, ablation « sans auto-contrôle » 0,53 → 0,60, optimizer-full devant optimizer-clean 95 % → 89 % des duels, aucun effet sur le bas de l'échelle (novice, casual, compétent, expert : mêmes résultats).*
- Impact de prix : acheter *n* actions sur *S* en circulation coûte `p × S × (e^(n/S) − 1)`, puis `p ← p × e^(n/S)`. Vente symétrique : produit `p × S × (1 − e^(−n/S))`, puis `p ← p × e^(−n/S)` (plancher 0,01). Le cours est une fonction du volume net échangé dans le tour : un aller-retour ne rapporte rien et fractionner un ordre ne change pas son coût (prix moyen ≈ `p × (1 + n / 2S)` pour de petits ordres).
  *Équilibrage (QA exploits) : avec l'ancien impact linéaire (prix moyen `p × (1 ± n / 2S)`, puis `p × (1 ± n / S)`), vendre toute sa ligne puis la racheter dans le même tour rapportait `n × p × (n / S)² / 2` (8 % de la ligne pour une participation de 40 %), à refaire chaque trimestre : +63 % de valeur nette en fin de partie (médiane, 30 graines), sans aucun risque. Même défaut, moins rentable, sur les matières premières (vendre tout le stock au plancher puis le racheter). Effet sur `npm run sim` (200 graines) : valeur nette médiane 39,6 → 38,0 M€, OPA 1,79 → 1,75 par partie (les grosses prises de contrôle coûtent ~4 % de plus).*
- Le paiement se fait en cash perso. On ne peut pas acheter les actions d'une entreprise en faillite ou absorbée.
- **Délit d'initié** : le contrôleur d'une entreprise qui en achète des actions fait monter sa jauge de scandale de **+1 par 1 % du capital acheté** (au prorata : 250 actions sur 10 000 = +2,5). Le contrôle s'apprécie avant l'achat : l'achat qui fait franchir 50 % (OPA) n'est pas concerné. Dès que les achats du contrôleur dans le tour atteignent **5 % du capital** (cumulés, `turnFlags.insiderBought`), un flash « insiderBuying » paraît (« … l'autorité des marchés s'interroge »), une fois par tour. Le rachat d'actions par l'entreprise (`buyback`) n'est pas concerné. Le joueur qui a **cédé le contrôle en vendant ses actions ce tour** (`turnFlags.exControllers`) reste un initié pour ses rachats du même tour : vendre toute sa ligne, laisser le pilote automatique aux commandes, puis racheter plus de 50 % contournait la règle. Un PDG évincé par une OPA, lui, peut racheter sans délit d'initié.
  *Équilibrage : racheter sa propre boîte à crédit, en sachant la hausse à venir, multipliait la fortune de l'optimiseur par ~2,3 et asséchait le flottant (plus aucune OPA possible contre lui).*
- **Registre des ventes et délit d'initié au krach crypto** : chaque vente d'actions (action `sellShares` ou cession de gré à gré acceptée ; les ventes forcées d'un appel de marge, elles, n'y vont pas) est enregistrée dans `GameState.shareSales` (tour, vendeur, entreprise, nombre, ligne d'avant la vente, contrôle du vendeur et présence d'une ligne crypto **au moment de la vente**), conservée deux trimestres (le courant et le précédent) ; les achats du même joueur sur la même entreprise sont tenus dans `GameState.shareBuys` sur la même fenêtre. Quand un krach crypto est publié (§5.1), tout dirigeant qui a cédé au trimestre précédent, en une ou plusieurs ventes **nettes de ses rachats du trimestre**, au moins **25 % de sa ligne de début de trimestre** (`CRYPTO_INSIDER_SALE_FRACTION`) d'une entreprise active qui avait une ligne crypto au moment de la vente — alors qu'il la contrôlait — écope d'une brève « délit d'initié » dans le numéro du krach, à son nom (événement `insiderSale` : `actorId` = vendeur, `subjectId` = entreprise ; la variante de texte est choisie par hachage, sans RNG) et l'entreprise prend **+15 de jauge de scandale** (`CRYPTO_INSIDER_SCANDAL`), même s'il n'en est plus le contrôleur : céder le contrôle en vendant n'efface pas le délit, fermer la ligne crypto avant le krach non plus. Un simple actionnaire n'est jamais visé, et une vente plus ancienne a été élaguée du registre.

### 6.3 Contrôle

- Dès qu'un joueur détient **> 50 %** des actions et qu'il n'est pas déjà contrôleur, il **prend le contrôle** (`controllerId`). Titre « takeover » dans le journal (flash).
- Le PDG évincé (s'il y en avait un) reçoit un **parachute doré** : 5 % du cash de l'entreprise, au moins 500 k€ (plafonné au cash), versé sur sa fortune perso. Stats `takeoversSuffered`, `parachutes`, `lastOustedTurn`. Le montant du parachute est aussi retenu (`PlayerState.comebackGrant`) : il fixe la subvention de sa start-up de retour en jeu (§7). Si la trésorerie est vide ou négative, pas de parachute : le flash utilise alors le titre `oustedBroke` (« … quitte … sans parachute »).
- Si le contrôleur ne détient plus **aucune** action, le contrôle passe au plus gros actionnaire joueur (s'il en a au moins 10 %), sinon au pilote automatique (`null`).
- Une entreprise PNJ peut donc devenir la filiale d'un joueur. Un joueur peut contrôler plusieurs entreprises.
- Franchir 25 % ou 40 % du capital d'une entreprise que l'on ne contrôle pas (PNJ comprises) publie un flash « stakeBuilding » : tout le monde est prévenu. Pas de flash de seuil quand l'achat donne directement le contrôle.
- Le contrôle est vérifié après chaque achat, vente, rachat d'actions, pilule, fusion et à la fin de chaque résolution (un rachat d'actions peut donc faire passer un autre actionnaire au-dessus de 50 %).

### 6.4 Prêt personnel (effet de levier, LBO)

- Plafond : `Σ taux × valeur de la ligne − dette perso`, avec un taux de **50 %** par ligne, mais **25 %** pour les entreprises que le joueur contrôle (la banque se méfie du PDG qui gage sa propre boîte pour la racheter). Chaque ligne est valorisée ici au **plus bas du cours actuel et du dernier cours de résolution** : acheter ses propres actions pendant le tour fait monter le cours, pas la capacité d'emprunt (pas de boucle prêt → achat → prêt).
- Intérêts trimestriels : `baseInterestRate effectif + 0.5 %`, prélevés sur le cash perso (qui peut devenir négatif et s'ajoute alors à la dette).
- **Appel de marge** en fin de résolution (après la mise à jour des cours) si `dette > 0.8 × (portefeuille + max(cash, 0))` : le cash disponible rembourse d'abord, puis ventes forcées (avec impact), chaque vente remboursant la dette :
  - le seuil est évalué au **cours d'avant l'appel** ; l'impact de prix ne pèse que sur la recette. Sinon, vendre une grosse ligne (> 25 % du capital, typiquement un fondateur) ferait chuter le cours du reste de la ligne plus vite que la dette ne baisse, et l'appel liquiderait tout ;
  - les lignes sont vendues en commençant par les plus petites participations (en % du capital) ; sur chaque ligne, on vend le **minimum** d'actions qui ramène sous le seuil (recherche par dichotomie), au plus 20 % du capital de l'entreprise (au-delà, vendre n'améliore plus l'écart) ;
  - si l'écart subsiste après toutes les lignes, la dette reste et l'appel se renouvelle à la résolution suivante.
  Titre de journal « marginCall » dans les résultats du numéro suivant.
  L'appel de marge compte toutes les lignes à 100 % de leur cours, y compris celles des entreprises contrôlées : le plafond d'emprunt plus bas suffit à limiter le levier sur sa propre boîte, et un seuil plus strict déclencherait des ventes forcées chez les fondateurs endettés avant la règle.

## 7. Actions du joueur

Toutes sont validées côté serveur (montants > 0 et finis, joueur contrôleur, cash suffisant…). En cas de refus, un message clair, et l'état n'est pas modifié. En mode hexagonal, toutes les hausses de scandale ci-dessous (achats d’initié compris, §6.2) sont multipliées par le levier de siège actif (§8) ; les baisses restent inchangées. Détails :

- Montants en k€ : tout nombre fini > 0. Nombres d'actions et de lots : arrondis à l'entier inférieur, refusés s'ils valent moins de 1.
- Un ordre sur une matière première est limité à `liquidity` lots (au-delà, le prix moyen de vente deviendrait négatif) ; une commande de capacité à 100 000 lots ; marketing et R&D à 1 000 000 k€ par produit.
- Le prix et la production hors bornes sont ramenés dans les bornes (le message le signale) plutôt que refusés.
- Aucune action n'est possible sur une entreprise en faillite ou absorbée, ni une fois la partie terminée.

**Perso**

| Action | Effet |
|---|---|
| `buyShares` / `sellShares` | cf. §6.2, puis vérification du contrôle §6.3 |
| `takePersonalLoan` / `repayPersonalLoan` | cf. §6.4 |
| `foundStartup` | **Retour en jeu** : réservé au joueur qui ne contrôle plus aucune entreprise active (évincé, en faillite, ou qui a tout vendu) ; sinon refus clair. Celui qui vient de céder le contrôle d'une entreprise en vendant ses actions attend le trimestre suivant (sinon : vendre, fonder avec la subvention, racheter son entreprise dans le même tour). Investissement ≥ 1 500 k€ de cash perso. Nouvelle entreprise : cash = investissement + subvention, la subvention valant **max(1 000 k€, dernier parachute reçu)** (« subvention publique à l'innovation » ; le parachute retenu est consommé à la fondation), 10 000 actions, fondateur 50 % et contrôleur, cours initial = (investissement + subvention) / 10 000 (la capitalisation vaut la trésorerie), profitEma = revenueEma = 0. Un produit dans le secteur choisi (réglages de départ du §4), qui vend dès la résolution du tour (c'est une fondation, pas un lancement). Au plus une entreprise fondée par tour et par joueur : au tour 1, l'entreprise de départ compte, la première start-up est donc possible au tour 2. **Le tour de sa création** (`turnFlags.justFounded`), la start-up ne verse ni bonus ni dividende, ne fusionne pas, et le fondateur ne peut pas revendre ses actions. *Équilibrage : avec un cours d'introduction de 2 × investissement / 10 000 et sans détachement du dividende, fonder, se verser bonus et dividende puis revendre au cours d'introduction rapportait ~30 % de la mise par tour, sans risque. Lot 2 : ouverte à tous, la start-up ne gagnait jamais (0 victoire sur ~1 000 cas dans l'audit) et dispersait le joueur ; elle devient une seconde chance pour la victime d'une OPA.* |
| `whistleblow` | **Lanceur d'alerte** : coûte **500 k€ de cash perso**, une fois par tour et par joueur, contre une entreprise active qu'il ne contrôle pas (refus sur la sienne). La jauge de scandale de la cible **double, dans la limite de +15 avant le multiplicateur de siège** en mode hexagonal (jusqu’à +22,5 sur l’île, +29,25 si une news porte le multiplicateur à 1,95 ; jauge toujours plafonnée à 100). En mode classique, le plafond reste +15 (on ne révèle que ce qui existe : une entreprise propre ne risque rien), et son niveau exact est publié dans un flash « whistleblow » (« … jauge de scandale à 57/100 »), sans nommer la source. Stat `whistleblows`. *Lot 2 : c'est le contre de la triche qui manquait. Le tricheur bat l'honnête, le dénonciateur fait exploser le tricheur, l'honnête ne craint pas le dénonciateur, qui dépense pour rien.* |
| `offerShares`, `offerContract`, `proposeCartel`, `answerOffer`, `cancelOffer`, `leaveCartel` | Tractations entre joueurs, cf. §7 bis. |
| `checkRumor` | **Tuyau** (`turn`, `index` : une rumeur du numéro du jour) : une source du journal dit au **seul payeur** si la rumeur est vraie (réponse certaine, lue dans `GameState.rumorKeys`), gardée dans `PlayerState.rumorChecks` et montrée dans sa seule vue. **Un par trimestre**, payé en **cash perso** : part de sa valeur nette à la dernière clôture, `taux = clamp((2 % + 3 % × (1 − e^(−0,5 n))) × (1 ± 15 %), 2 %, 5 %)` où `n` = tuyaux déjà achetés (asymptote vers 5 %) et ± 15 % l'humeur du journaliste, tirée chaque trimestre ; jamais moins de 500 k€. **Une fois sur dix, la source parle** : flash « rumorLeak » qui nomme le joueur, +8 de jauge de scandale sur chacune de ses entreprises. Humeur et fuite sont tirées par hachage (graine, trimestre, joueur) : acheter un tuyau ne consomme pas le RNG de la simulation. Les bots n'en achètent pas. |

**Entreprise** (le joueur doit être contrôleur)

| Action | Effet |
|---|---|
| `setProductDecisions` | Prix entre 30 % et 300 % du prix de référence ; production entre 0 et 2 × capacité (plafonnée à la capacité à la résolution) ; marketing et R&D ≥ 0 |
| `launchProduct` | Coût `launchCost`, payé tout de suite, passé en charge au compte de résultat par quarts sur 4 trimestres (dont celui du lancement, §5.6). Produit neuf (qualité 1, notoriété 0,3, prix de référence, production prévue 80 % de la capacité de départ, marketing et R&D du §4). **La capacité de départ est livrée au trimestre suivant** (`pendingCapacity`) : le produit ne produit ni ne vend le trimestre de son lancement (le marketing et la R&D de ce trimestre préparent la sortie), puis tourne normalement. Max 4 produits actifs, **6 pour une entreprise issue d'une fusion** (`CompanyState.productSlots`). Flash « productLaunch ». *Lot 2 : un lancement visible et vendu tout de suite donnait un avantage à qui jouait en premier dans le tour (jusqu'à 77 % de victoires entre deux copies du même joueur).* |
| `launchProduct` (hex) | `hexId`, `bid`, `fallback: 'nearest' \| 'abandon'` : projet privé sans paiement ni flash, compté dans les places. Lancement et terrain payés seulement si une case est obtenue à la clôture (§5.8 quater). |
| `moveFactory` (hex) | `companyId`, `productId`, `hexId`, `bid` : mise remplaçable sans paiement, sans déplacement gratuit au démarrage. Gagnée : terrain et tarif de déménagement, effet au trimestre suivant ; perdue : rien ne bouge. Dans l'incubateur, mise de type `startup` avec `fallback`, sans frais de déménagement. |
| `foundStartup` (hex) | Ajoute `hexId`, `bid`, `fallback` aux champs de fondation : ventes immédiates à l'incubateur de la capitale, adjudication à cette clôture. Abandon : reste dans l'incubateur, peut remiser par `moveFactory`. Après deux trimestres au plus dans l'incubateur, la start-up est placée d'office sur la case libre la plus proche de la capitale, à sa mise à prix (§5.8 quater) ; jamais à la dernière clôture, et sans dirigeant à la clôture elle reste à l'incubateur. |
| `cancelHexBid` | Mode hexagonal : `companyId` et soit `productId`, soit `projectId`. Retire sa mise avant la clôture ; le projet annulé disparaît sans frais. Dernier trimestre : toutes les nouvelles mises sont refusées ; case inconnue, non constructible, occupée, mise sous la réserve, frais + mise au-delà du cash, ou deuxième mise du même joueur sur la même case : refus sans mutation. |
| `discontinueProduct` | Retire le produit et encaisse **net, sans impôt** `0.5 × ((capacity + pendingCapacity) × capacityCost + stock × lastUnitCost + landCost)` ; `landCost` uniquement sur le plateau hexagonal. Usine et terrain revendus à leur valeur comptable déjà retenue, sans gain ; la moitié non récupérée du coût du stock est une perte exceptionnelle déductible. Exception : tant que sa dotation de terrain est active (le taux se lit avant la révocation du terrain), l'usine de départ de l'Île-aux-Niches se revend à 80 % — usine, terrain et stock — au lieu de 50 % (§5.8 ter). Aucun revenu exceptionnel, aucun ajout au CA ni effet sur le résultat courant (§5.6). |
| `expandCapacity` | cf. §5.3 |
| `buyCommodity` / `sellCommodity` | cf. §5.5 ; l'inventaire garde un coût moyen pondéré. |
| `bidSite` | Enchère sous pli fermé sur une filiale d'une matière (`amount` : le plus qu'on accepte de payer, au moins la mise à prix, au plus la trésorerie), réglée à la clôture au prix d'équilibre, cf. §5.5 bis. Refusé s'il n'y a plus d'emplacement libre, si l'entreprise en exploite déjà une de cette matière, ou sous la mise à prix. Une mise par matière et par entreprise : miser de nouveau la remplace. |
| `cancelSiteBid` | Retire la mise en cours sur une matière. |
| `setSiteDormant` | Met en sommeil (`dormant: true` : plus d'extraction dès la clôture, entretien de 25 % de la facture d'extraction habituelle à chaque résolution) ou relance (`dormant: false` : un trimestre de remise en route) la filiale d'une matière, cf. §5.5 bis. Refusé s'il n'y a pas de filiale de cette matière, si elle dort déjà (mise en sommeil) ou si elle tourne déjà (relance). |
| `takeLoan` / `repayLoan` | cf. §5.7 |
| `payDividend` | Montant ≤ cash − emprunts contractés ce tour, réparti au prorata des actions ; stats `dividendsReceived`. Le cours baisse aussitôt de montant / sharesOutstanding (détachement du coupon, plancher 0,01). Sentiment ×(1 + 0,1 × min(1, montant / capitalisation)). Refusé le tour de création d'une start-up. Flash « dividend ». |
| `ceoBonus` | cf. §3. Refusé le tour de création d'une start-up. |
| `buyback` | Rachat au flottant avec le cash de l'entreprise, au prix d'impact §6.2 ; les actions sont annulées (`sharesOutstanding` baisse). Une fois par tour. Soumis au flottant minimal (§6.2). Flash « buyback ». |
| `poisonPill` | Seulement si un autre joueur détient ≥ 25 %. Émet 40 % d'actions neuves (arrondi) au contrôleur à 50 % du cours, payées sur son cash perso (qui va à l'entreprise) ; refusée si le cash perso ne suffit pas. Le cours est dilué aussitôt (§6.1) et les actions émises sont **bloquées jusqu'à la fin du trimestre** (`turnFlags.lockedShares` : `sellShares` refuse d'y toucher). Scandale +15, sentiment ×0,9. Recharge de 3 tours (utilisable de nouveau 3 tours plus tard). Flash « poisonPill ». |
| `crisisComms` | Coût 400 k€ (frais spéciaux du trimestre, §5.6) : scandale −13, réputation +0,05 **seulement tant qu'elle est sous 1** (sans dépasser 1 : la com' répare, elle n'embellit pas). **Une seule par entreprise et par tour** (`turnFlags.crisisDone`). *Équilibrage : sans limite et à −25, elle effaçait toute la jauge et rendait la triche gratuite et sans risque (clé de voûte de la stratégie dominante de l'audit). Lot 2 : utilisée à chaque tour, elle poussait aussi la réputation à 1,3 (+30 % d'attractivité) ; mesuré : optimizer-full −12 %, ablation « sans com' de crise » 0,55 → 0,60. Mesure finale : −15 → −13 ; ablation « sans com' de crise » (variante qui garde un budget de jauge) 0,58 → 0,63, écart de fortune optimizer-full / optimizer-clean ×1,59 → ×1,47, meilleur contre 2e 78 → 71 % des duels. −12 allait trop loin (meilleur contre 2e 60 %, sous la cible 65-80 %).* |
| `shady` | cf. tableau ci-dessous. Stat `shadyActions` +1. Une action du même type par tour. Le coût entre dans les frais spéciaux du trimestre (§5.6). |
| `merge` | Le joueur contrôle les deux entreprises. Refusée si l'ensemble dépasserait **6** produits actifs (l'entreprise issue de la fusion peut en porter 6, contre 4 pour les autres : conquérir un rival est la seule façon de grossir au-delà de 4 produits), ou si l'une des deux est une start-up créée ce tour. La cible est absorbée : cash, dette, inventaire (coût moyen pondéré) et produits sont transférés, profitEma et revenueEma s'additionnent, la jauge de scandale prend le maximum des deux, les modificateurs de la cible disparaissent. Les compteurs du tour suivent : bonus déjà pris, emprunts du tour et actions bloquées de la cible (converties au ratio) comptent pour l'absorbante. **Comptes pro forma** : le CA (et le bénéfice) de chaque rapport de la cible s'ajoute au rapport de l'absorbante du même tour ; pour les tours antérieurs au premier rapport de la cible, on ajoute son premier CA publié. Une fusion ne fabrique donc pas de croissance du CA (§6.1). Les actionnaires joueurs de la cible reçoivent `floor(actions × cours cible / cours absorbante)` actions de l'absorbante, le flottant de la cible devient du flottant de l'absorbante au même ratio. La cible passe `merged` (registre vidé, cours figé). Flash « merger ». |

**Actions discutables**

| Type | Coût | Effet | Scandale |
|---|---|---|---|
| Lobbying | 1 000 k€ | Demande du secteur choisi (par défaut celui du premier produit) ×1,15 pendant 2 tours, pour tout le secteur | +10 |
| Optimisation fiscale | 300 k€ | Impôt à 5 % ce tour | +15 |
| Greenwashing | 500 k€ | Attractivité ×1,3 sur tous les produits ce tour | +10 |
| Espionnage industriel | 1 000 k€ | Pour chaque produit distancé dans son secteur : +30 % de l'écart de qualité avec le meilleur produit concurrent. Un produit déjà en tête ne gagne rien ; si aucun produit n'est distancé, l'action est refusée (« rien à copier »). `targetCompanyId` facultatif restreint la comparaison à cette entreprise. *Équilibrage : le gain minimal de +0,1 profitait au leader, qui espionnait le vide.* | +20 |
| Délocalisation | 800 k€ | Main-d'œuvre ×0,7 pendant 3 tours, réputation −0,1 | +15 |
| Campagne de dénigrement | 500 k€ | Sentiment et cours de la cible ×0,85 immédiatement | +20 |

## 7 bis. Tractations entre joueurs

Onglet « Tractations ». Un joueur envoie au plus **6 offres par trimestre** (`OFFERS_PER_TURN`, toutes issues confondues), chacune à un joueur précis, humain ou bot. Une offre ne vaut que pour le trimestre en cours : elle expire à la clôture (`GameState.offers` est vidé au début de la résolution). Un humain l'accepte ou la décline (`answerOffer`) ; son auteur peut la retirer tant qu'elle attend (`cancelOffer`) ; un bot répond sur-le-champ (§10). À l'acceptation, tout est revérifié (cours, stocks, dirigeants, trésorerie) : une offre devenue impossible est refusée avec sa raison, sans rien changer. Seuls les deux joueurs voient l'offre (`PlayerView.self.offers`). Une entreprise sans dirigeant (pilote automatique) ne traite pas.

Les offres reçues en attente passent avant le formulaire de proposition. L’arrivée d’une première offre ou la
réponse à la dernière ne réinitialise pas le type de proposition choisi ni les champs du brouillon en cours.
Ce brouillon reste local à l’onglet ouvert et ne constitue pas une offre envoyée.

| Offre | Règles |
|---|---|
| `offerShares` : cession d'actions de gré à gré | `side` = `sell` (le proposant vend) ou `buy` (il achète). Prix par action dans **± 25 % du cours** du moment (`BLOCK_PRICE_BAND`). Le vendeur doit détenir les actions (hors actions bloquées, et pas celles du fondateur d'une start-up le trimestre de sa création) ; l'acheteur paie comptant (vérifié à l'envoi pour le proposant, à l'acceptation pour l'autre). Hors marché : ni le cours ni le flottant ne bougent, mais le flottant minimal (§6.2) s'applique au-delà de 50 % + 1 action. Racheter des actions de l'entreprise qu'on dirige, ou dont on vient de céder le contrôle ce trimestre, reste un achat d'initié (§6.2). Le contrôle se vérifie aussitôt (§6.3 : prise de contrôle, franchissement de seuil) ; mais si c'est le dirigeant lui-même qui cède le bloc qui fait passer l'acheteur au-dessus de 50 %, c'est une **passation** (flash « controlHandover »), pas une OPA : ni parachute doré ni compteur d'OPA. Flash « blockSale ». |
| `offerContract` : contrat de fourniture | L'entreprise vendeuse livre à l'entreprise acheteuse `lots` lots d'une matière par trimestre (200 au plus), à un prix fixe par lot, pendant `turns` trimestres (8 au plus). Le proposant dirige l'une des deux. Prix entre 50 % et 150 % du prix de base de la matière. Entre deux entreprises du même dirigeant, pas d'offre (le contrat vaut tout de suite) mais un **prix de pleine concurrence** : ± 10 % du cours de la dernière clôture (`CONTRACT_GROUP_BAND`), sans quoi le contrat ferait passer l'argent des actionnaires minoritaires d'une entreprise vers l'autre. **Un seul contrat par paire d'entreprises et par matière**, dans un sens ou dans l'autre. Livraison à chaque résolution, dans l'ordre de signature, après l'extraction des filiales et avant la production : le vendeur livre ce qu'il avait en stock au début des livraisons (extraction du trimestre comprise) ; ce qu'il reçoit lui-même par contrat ne repart qu'au trimestre suivant (sinon deux contrats croisés feraient tourner les mêmes lots). Les lots entrent chez l'acheteur au prix du contrat : l'achat prévu est une obligation de sa clôture (§5.7), mise de côté avant tout le reste. Pour chaque lot manquant, le vendeur doit à l'acheteur un **dédit** de `max(0, cours × 1,1 − prix du contrat)`, ce que l'acheteur paiera de plus pour l'acheter en urgence (§5.3) : l'acheteur le reçoit tout de suite, le vendeur le paie en tête de la clôture suivante, avec ses amendes (§5.7). Livraisons et dédits passent de trésorerie à trésorerie, hors compte de résultat, comme tout achat de matières (`lastDelivered` et `lastPenalty` gardent la dernière clôture). Un contrat s'arrête si l'une des entreprises disparaît ; une fusion le transfère à l'absorbante (et l'annule s'il reliait les deux). Visible des seuls dirigeants des deux entreprises (`self.contracts`). |
| `proposeCartel` : entente sur les prix | Deux entreprises de dirigeants différents, qui vendent toutes deux dans le secteur choisi. Si l'entreprise du proposant est déjà dans une entente de ce secteur, l'invitée la rejoint (et en voit les membres) : seul un membre fait entrer quelqu'un. Une entreprise déjà dans une autre entente du secteur ne peut pas accepter ; à l'envoi, rien n'est dit de l'entente de la cible (ce serait trahir un secret), et un bot décline sans explication. Deux ententes ne fusionnent pas, et une entente ne compte qu'une entreprise par dirigeant. Effet : chaque membre voit le **prix du trimestre en cours** des produits des autres membres dans ce secteur, au lieu du prix du trimestre précédent (§12) ; les bots membres ne descendent plus sous 110 % de leur prix habituel (§10). Secrète : seuls ses membres la voient (`self.cartels`, avec le risque du moment). Une entreprise en sort aussitôt si elle change de dirigeant, disparaît ou quitte le secteur. `leaveCartel` demande à sortir : la sortie prend effet **à la clôture**, après le tirage du trimestre, qui compte encore le sortant (sinon on entrerait, lirait les prix des partenaires et sortirait avant le tirage, sans rien risquer). Sous deux membres, l'entente est dissoute. |

**Découverte** (résolution, juste après les scandales, §8) : chaque entente, sortants du trimestre compris, est tirée au sort avec la probabilité `p = min(35 %, 6 % + 3 % × (membres − 2) + 2 % × q)`, où `q` est le nombre de clôtures déjà passées en entente par le membre le plus aguerri (`CompanyState.cartelQuarters`, jamais remis à zéro et jamais montré : quitter l'entente puis la reformer n'efface rien ; une fusion garde le plus chargé des deux). Si elle est découverte, chaque membre paie une amende de **15 % de son chiffre d'affaires du trimestre dans le secteur** (300 k€ au moins ; une amende, donc hors bénéfice lissé, §5.6), prend **+20 de jauge de scandale**, et l'entente est dissoute ; article « cartelBusted » dans les résultats du numéro suivant. Sinon, chaque membre ajoute une clôture à son compteur, puis les sorties demandées prennent effet.

*Pourquoi s'entendre rapporte : la demande d'un secteur est donnée (§5.1) puis partagée par un logit dont l'élasticité dépend du secteur (2 pour les yaourts, 3,5 pour les boissons, 4,5 pour les trottinettes, 6,5 pour les gadgets et 1,5 pour la crypto), avec des concurrents hors jeu (§5.2). Seul, monter son prix fait fuir les clients vers les rivaux ; si tous les membres montent ensemble, et d'autant plus qu'ils pèsent lourd dans le secteur, les clients ont moins d'endroits où aller et la hausse de prix l'emporte sur les ventes perdues. Aucune formule spéciale : l'entente rend seulement la coordination possible (voir les prix des autres en direct) et crédible (les bots tiennent le prix convenu).*

## 8. Scandales

En mode hexagonal, `addScandal` multiplie toute hausse par le levier de siège actif, news locales comprises :
scandale ×1,5 sur l’île, ×1,95 avec les régulateurs (×1,3). Le plafond propre au lanceur d’alerte est appliqué
avant ce multiplicateur ; la jauge finale reste bornée à 100. Les diminutions, dont la communication de crise
et la baisse naturelle, sont inchangées. Les valeurs chiffrées des actions sont les hausses avant multiplicateur.

- Jauge cachée 0-100 par entreprise, remplie par les actions discutables, les bonus, la pilule empoisonnée, certaines news, l'achat de ses propres actions (§6.2), les lanceurs d'alerte (§7), les tuyaux éventés (§7) et les ententes découvertes (§7 bis) (les autres joueurs voient seulement « faible / moyen / élevé » : < 30 / < 60 / ≥ 60, sauf quand un lanceur d'alerte publie le niveau exact).
- À chaque résolution : probabilité d'éclatement `p = clamp((scandale − 10) / 90, 0, 1)^1.5` (20 → 3,7 %, 30 → 10,5 %, 55 → 35 %, 100 → 100 %).
  *Équilibrage : avec `(scandale − 20) / 80`, une jauge tenue à 20 ou moins (com' de crise à volonté) ne risquait exactement rien. Désormais, tricher reste un pari.*
- Si ça éclate : amende = `(10 % + scandale / 500) × max(cash, 0) + 500`, sentiment ×0,75, réputation −0,15, jauge ramenée à 15, stats `scandals` et `finesPaid` du contrôleur, titre « scandal ».
- Sinon la jauge baisse de 4. La réputation revient de 0,02 par tour vers 1, par le haut comme par le bas (bornes 0,5-1,3).
- Les scandales sont tirés après les ventes et avant l'impôt : l'amende entre dans le résultat du trimestre (mais pas dans profitEma, cf. §5.6).

## 9. Le Capital Quotidien

Un numéro par tour (`JournalIssue`), créé au début du tour :

1. **La une** : la news principale du tour (tirée au tour précédent et éventuellement annoncée par une rumeur), ou l'événement dynamique le plus spectaculaire de la résolution.
2. **Résultats du trimestre** : meilleur bénéfice, pire perte (titres bigProfit / bigLoss), faillites, scandales, ententes découvertes, filiales adjugées aux enchères (§5.5 bis).
3. **Brèves** : 1 à 2 news secondaires tirées ce tour.
4. **Citation** : une citation d'un bot (champ `quotes`, ou `landQuotes` après une adjudication en mode hexagonal).
5. **Rumeurs** pour le trimestre suivant : la news principale suivante est tirée maintenant ; si elle a une `rumor`, celle-ci est publiée (fiabilité « élevée » 50 %, « moyenne » 38 %, « faible » 12 %). On ajoute 0 à 2 **fausses rumeurs** (fiabilité « faible » 63 %, « moyenne » 30 %, « élevée » 7 %). Au bout du compte (300 parties de bots, 4 500 numéros), une rumeur « élevée » est vraie 80 % du temps, « moyenne » 40 %, « faible » 10 % : aucune fiabilité n'est une certitude. Pour en avoir le cœur net, un joueur peut acheter un tuyau (§7).

Pendant le tour, les événements immédiats (prise de contrôle, startup, lancement de produit, bonus > 500 k€, pilule empoisonnée, rachat d'actions, dividende, fusion, franchissement de seuil, achat massif de ses propres actions par un PDG, lanceur d'alerte, passation de contrôle faute d'actionnaire, cession d'actions de gré à gré) ajoutent des articles `flash` (« Dernière minute ») au numéro en cours. Les actions des bots en début de tour produisent aussi des flashs.

Composition d'un numéro (ordre de `articles`) :

1. la une (`headline`) : une faillite de la résolution précédente si elle existe (la news principale devient alors une brève `news`), sinon la news principale ;
2. les autres faillites, puis les résultats (`results`) : meilleur bénéfice, pire perte, scandales, ententes découvertes, appels de marge ;
3. les brèves (`news`) ;
4. deux articles `quote` : la citation d'un bot présent dans la partie (n'importe quel bot à défaut), puis l'édito (`quarterIntro`, `{sector}` = secteur de la news principale). Convention : `title` = texte cité, `body` = auteur ;
5. les flashs du tour, ajoutés au fil de l'eau.

**Citation après les enchères (mode hexagonal seulement)** : `quoteArticle()` cherche d'abord une réplique dans
`landQuotes` chez les bots ayant un résultat réglé à la clôture précédente (`hexBids`, `turn = state.turn − 1`).
Chaque bot garde une seule situation, dans cet ordre de priorité : perte face à un humain (`lostToHuman`), victoire
payée au moins 1,5 fois la réserve (`overpaid`), repli obtenu (`fallback`), autre victoire (`won`), perte face à un bot
(`lostToBot`). Une mise perdue ou un projet abandonné ne compte que si la case a un attributaire direct public ;
une mise tombée (`failed`) ne nourrit jamais une réplique. Les candidats sont triés par identifiant de joueur ;
`flavor()` choisit le bot (`quote:hex:who`), puis sa réplique (`quote:hex:<playerId>`), par hachage sans consommer
le RNG. Comme `say()`, le texte vient du catalogue de la langue du salon, avec repli français si le texte local manque.
`fillTemplate()` remplit uniquement des faits publics : `{hex}` (case adjugée ; en repli, case visée `bid.hexId`
uniquement si elle a un attributaire direct public), `{price}` (prix d'adjudication formaté dans la langue du salon),
`{winner}` (entreprise attributaire), `{company}` (entreprise du bot qui avait misé) et `{bidders}` (nombre
d'enveloppes valables). En repli, `{price}`, `{winner}` et `{bidders}` viennent de l'adjudication directe publique
sur la cible. Sans cette adjudication (gagnant incapable de payer), le bot n'est pas candidat : un autre bot
admissible peut parler, sinon la citation ordinaire reprend.
Le prix d'une perte est celui du gagnant ; aucun montant de mise ni cible privée n'est cité. L'article reste
`kind: 'quote'`, `tone: 'neutral'`, avec le nom du bot et de son entreprise en signature (`quoteByline`). En l'absence
de candidat ou de réplique, le tirage ordinaire de `quotes` reprend. La citation remplace celle du bot : elle n'ajoute
aucun article, et les deux langues gardent le même choix de bot et le même nombre d'articles. Le mode classique
conserve son tirage existant.

**Données structurées** : chaque flash et chaque article de résultats porte aussi son événement (`Article.event`, type `ArticleEvent`) : sa nature (`takeover`, `controlHandover`, `autopilot`, `stakeBuilding`, `insiderBuying`, `startup`, `whistleblow`, `productLaunch`, `dividend`, `ceoBonus`, `buyback`, `poisonPill`, `merger`, `bigProfit`, `bigLoss`, `bankruptcy`, `scandal`, `marginCall`, `rumorLeak`, `siteOpened`, `blockSale`, `cartelBusted`), le joueur qui agit (`actorId` ; l'acheteur d'une cession de gré à gré), celui qui subit (`subjectId` : PDG évincé, vendeur, dirigeant de l'entreprise au moment de sa faillite, victime d'un appel de marge), pour les résultats du trimestre (meilleur bénéfice, pire perte, scandale) le dirigeant de l'entreprise quand ses comptes ont été arrêtés (`leaderId` ; ces articles paraissent au numéro suivant, après une éventuelle faillite ou passation de la résolution), les dirigeants des membres d'une entente découverte (`leaderIds`), le produit lancé (`productId`), la matière d'une filiale adjugée (`commodityId`), le montant en k (`amount` : parachute, dividende, bonus, rachat, bénéfice, perte, amende, ventes forcées, prix d'une cession) et la part du capital (`pct` : détenue après une prise de contrôle ou une montée au capital, achetée dans le tour pour un délit d'initié, cédée de gré à gré). Ces données sont les mêmes dans toutes les langues et ne disent rien que l'article ou la vue publique (capital, trésorerie) ne publient déjà ; le lanceur d'alerte n'a jamais d'`actorId`. Fusion : `companyIds` = [absorbante, absorbée]. Les news, brèves, citations et l'édito n'en ont pas. Le client en tire la chronologie (§12).

Les effets des news (principale et brèves) s'appliquent à la publication. Une cible `random` (entreprise, secteur ou matière) est tirée une seule fois par carte. Un effet `siteCost` (multiplicateur, durée) change le coût d'extraction des filiales d'une matière (§5.5 bis), pas son cours : 32 cartes en portent un (7,7 % du poids du paquet), soit 14 news de matières premières qui parlent d'un lieu de production (mine inondée, puits à sec, fourmis dans une raffinerie, écureuils dans une fonderie…) et le lot « filiales » (`content/*/extra/sites.ts`) : 18 cartes sur la vie des puits, mines, raffineries et fonderies, dont 12 annoncées par une rumeur, et 4 fausses rumeurs. Les effets `zoneLabor` et `transportCost` (§5.8) touchent la main-d'œuvre d'une zone de la carte et le prix du transport : le lot « carte » (`content/*/extra/map.ts`) raconte la vie des zones et des routes (grèves, subventions, gazole, péages, col enneigé…). Un effet `companyCash` négatif compte dans la stat `finesPaid` du contrôleur, sans entrer dans le compte de résultat. Les rumeurs n'ont pas de placeholders ; les fausses rumeurs évitent celles des trois numéros précédents (le numéro en cours exclu), comparées par identifiant (`GameState.rumorKeys`). Au dernier tour, pas de rumeur. Après la dernière résolution, les résultats du trimestre et une brève de clôture sont ajoutés au dernier numéro.

Tirage des news : pondéré par `weight`, respectant `minTurn`/`maxTurn`, sans reprendre une des 12 dernières, et sans les cartes dont la cible unique ne désigne personne au moment du tirage. Les cibles d'entreprise (`random`, `richest`…) sont résolues au moment de l'application, une seule fois par carte (tous les effets frappent la même entreprise), et les placeholders du titre (`{company}`, `{ceo}`, `{sector}`, `{commodity}`) remplis avec la première cible résolue. `topProfit` exige un dernier bénéfice net strictement positif, `mostScandalous` une jauge > 0 ; à égalité de score, la cible est tirée au sort (RNG de la partie). Si personne n'est concerné, l'effet ne s'applique à personne et le titre garde sa formule vague (« une entreprise cotée »).

**Terrains et chaleur (mode hexagonal seulement)** : 24 cartes locales (trois par terrain) et cinq cartes de
chaleur rejoignent le tirage ordinaire. Une carte de terrain n'est éligible que tant que l'usine de départ et ses
effets sont actifs ; `ActiveEffect.kind: 'terrain'` vise son levier et sa durée. Les effets d'usine touchent le
produit de départ, les effets de siège l’entreprise. Une carte qui modifie ou suspend un levier de base exige
que ce levier n’ait pas expiré. `suspend: true` retire temporairement le privilège visé : l’exonération de
main-d’œuvre aux Portes, ou le taux fiscal réduit aux Monts et sur l’île (le taux ordinaire réel, optimisation
éventuelle comprise, reprend effet). La portée `heat` rend éligibles les usines de
crypto qui vendent leur chaleur, y compris celles sans terrain attribué ; la station de ski a sa portée propre.
Une usine éligible est tirée au sort par carte, conformément aux textes qui nomment une entreprise et son usine.
L'hiver et la saison de ski se tirent en T1/T4, la canicule en T3 ; les effets gardent la durée annoncée par la carte.
Le premier numéro présente le Commissariat, son éditorial, chaque attribution et l'ouverture des usines de départ.
Les 16 annonces d'installation (ouverture et nouveau produit, deux par terrain) accompagnent aussi les lancements
par une société domiciliée ; elles restent absentes si tous les privilèges ont expiré ou tant qu’une news modifie
ou suspend les effets annoncés. Une news portant seulement sur un autre levier ne les bloque pas. En l’absence
d’annonce d’installation applicable, un lancement produit son flash ordinaire.
Les six articles d'adjudication sont chargés dans le contenu pour le lot 3, sans déclenchement à ce stade.

Textes : « de {x} » et « que {x} » s'élident (« d'Agile Pivot Group », « qu'Alice ») quand la valeur commence par une voyelle, un h (traité comme muet) ou un y suivi d'une consonne. Les titres n'accordent jamais un verbe avec `{commodity}` (certains noms de matières sont au pluriel).

**Rubriques de bas de page** (client, `screens/game/paper/`, contenu `content/*/paper.ts`) : pour combler le bas de la colonne de gauche, le client ajoute des rubriques burlesques sans aucun enjeu — « Courrier des lecteurs » (2 lettres : une qui réagit au ton de la une, une à un résultat du trimestre s'il y en a un — y compris la faillite en une, qui n'a pas de montant d'événement : la lettre reprend alors la dernière perte publiée par l'entreprise, à défaut sa dette, toutes deux publiques), « Faits divers » (3), « Horoscope des affaires » (4 signes), « Petites annonces » (3) — plus l'encadré « Le chiffre du trimestre » (à droite d'une brève seule, sinon en tête du bloc de remplissage) : le chiffre le plus savoureux du trimestre clos (amendes, bonus de PDG, dividendes, impôt, écart de fortunes, gros mouvement d'une matière ou d'un secteur ; le genre gagnant du numéro précédent est pénalisé ×0,6 pour varier). Tout est déterministe par numéro (hachage FNV-1a de `textSeed|tour|rubrique|i`, sans tirage aléatoire ni effet sur la partie : le moteur ne lit jamais ce contenu), identique pour tous les joueurs et dans les deux langues, et les rubriques ne nomment jamais une entreprise ou un joueur des flashs du numéro (« Dernière minute »), pour ne pas les dédoubler. Le dernier article `quote` porte la rubrique « L'édito ».

À partir du N° 2, l'encart « Publicité » (`pickReclame`) couronne l'entreprise qui a dépensé le plus de marketing au trimestre clos q = N° − 1 : elle « achète » un encadré vantant un de ses produits (pioché par hachage dans son vivier, voir ci-dessous), rédigé dans la voix de son secteur, avec deux mentions légales en petit et un pied nommant l'entreprise, la somme (le marketing du candidat retenu) et le trimestre. Les candidats sont classés par score décroissant — marketing × 0,6 pour l'annonceur du numéro précédent (recalculé en chaîne sur les numéros présents, comme le chiffre du trimestre), afin de faire tourner la réclame —, à égalité le plus petit id gagne, et le premier candidat qui remplit un gabarit l'emporte : s'il échoue sur tous les gabarits, on descend le classement et l'encart ne tombe que si aucun candidat n'en remplit un (les clés de hachage `…|reclame|product` et `…|reclame|tpl` ne changent pas quel que soit le rang du candidat : la page reste identique dans les deux langues). Une entreprise nommée par un flash du numéro est exclue comme dans les autres rubriques, par sous-chaîne sur son nom et son ticker.

Le vivier d'un annonceur est son catalogue public : les produits lancés au plus tard au trimestre clos et déjà en vente (pas « bientôt »), dont le nom ne contient aucun nom d'un flash du numéro ; le produit vanté y est pioché par hachage. L'éligibilité se juge sur le rapport publié du trimestre clos (marketing > 0), jamais sur le statut du moment, et les comptes sont en ajout seul : un encadré paru ne change donc pas tant que l'entreprise garde un catalogue, et il est identique pour tous les joueurs (les lignes produits des rapports, servies au seul dirigeant, n'entrent jamais en jeu). Une faillite vide le catalogue et fait passer l'encadré archivé à l'annonceur suivant ; une fusion peut changer le produit vanté.

## 10. Bots et pilote automatique

Les prix des bots normaux et du pilote automatique sont revérifiés après le passage de tous les bots,
avant la couverture de trésorerie : les achats de matières d'un bot tardif peuvent renchérir le prochain
lot d'un bot qui a déjà joué. Cette dernière passe applique le même plancher de coût +5 % à la production neuve, sans rejouer
les budgets ni consommer de tirage aléatoire. Les experts et les stagiaires gardent leur propre stratégie.
Cette passe réserve l'inventaire commun dans l'ordre réel des produits, déduit les livraisons sortantes
connues et borne le coût des entrées connues. Les lots chers gardent leur coût dans le plancher même
si une réduction de production empêche de les diluer avec des achats d'urgence moins chers.

- **Bots** : des joueurs à part entière (fortune perso, entreprise), pilotés par une personnalité (`BotPersonality`). Ils agissent **au début de chaque tour**, juste après la publication du journal, ce qui laisse aux humains le temps de réagir ; ils ne voient donc jamais les décisions du tour en cours des humains (seulement celles en vigueur au trimestre précédent, comme tout le monde). Leur ordre de passage est tiré au sort à chaque tour. Ils passent par les mêmes actions validées que les humains (mêmes refus, mêmes flashs). Pour chaque entreprise qu'ils contrôlent (filiales comprises) :
  - Prix : le premier prix conserve le réglage sectoriel rentable de l'entreprise, modulé par `pricePremium`. Le pas du tâtonnement des secteurs physiques dépend de `elasticity + 0,5 × marketElasticity` ; la crypto garde un pas de 5 %. Le bot conserve son apprentissage sur la marge passée, puis compare trois prix voisins sur leur contribution avec la prévision publique du client. Le plafond est 3 × référence ; une entente conserve son plancher. Toute **production neuve** doit couvrir **1,05 × son coût unitaire estimé**, arrondi vers le haut au centime ; son coût est recalculé pour la nouvelle quantité et la capacité commandée. Une liquidation sans production peut vendre un stock périssable sous son coût historique, déjà engagé, et descendre au plancher légal de 30 % de la référence. Elle compare plusieurs remises selon le revenu récupérable sur trois trimestres, ou les trimestres restants. Le stock qui survit reste disponible aux clôtures suivantes ; qualité, notoriété, concurrence extérieure, demande attendue et expiration des nouvelles et combines connues sont projetées par les mêmes estimations publiques. Les bonus des autres entreprises du même dirigeant expirent également ; ceux des rivaux restent privés. Les stocks non périssables gardent leur plancher historique. Si le coût d'une production neuve dépasse le plafond légal, elle s'arrête et son plancher de coût est retiré pour liquider le stock périssable existant, y compris après les achats de matières des autres bots ; une ligne vide peut reprendre à 80 % de sa capacité lorsque les coûts redeviennent viables.
  - Invendus : la réponse aux remises varie continûment avec `r = elasticity² / (elasticity² + 16)`. Un historique où une remise n'a pas accru les ventes réduit encore cette réponse selon le rapport entre ventes gagnées et ventes nécessaires pour maintenir le chiffre d'affaires. La remise d'invendus vaut `pas × r` ; le tampon de production varie avec la même réponse. La recherche locale conserve seulement les remises qui améliorent la contribution prévue, ou la récupération du stock périssable lors d'une liquidation.
  - Production : les réglages de départ suivent les défauts du secteur (§5.1), puis `ventes × (1,05 + 0,10 × r) + 1 + 4 × r − stock` (toute la capacité si tout a été vendu), bornés par la capacité. La règle ancienne qui divisait la production par deux sous coût a disparu : le plancher de prix couvre la production neuve, et celle-ci s'arrête seulement si son coût dépasse le plafond légal. Un produit lancé ce tour garde sa production prévue pour le trimestre suivant.
  - Marketing = min(taille du marché × (0,5 % + 2,5 % × marketingBias), marge brute potentielle × (10 % + 40 % × marketingBias)) ; R&D = min(taille du marché × (0,3 % + 2 % × rndBias), marge brute potentielle × (8 % + 35 % × rndBias)), où marge brute potentielle = capacité × (prix − coût unitaire estimé), au moins 3 % du CA potentiel. Réduits quand la trésorerie approche de la réserve (1 000 k€ + 2 × coûts fixes + impôt et amendes dus).
  - Tempéraments physiques : le budget marketing ci-dessus est multiplié par `sqrt(marketingMultiplier × (1 − brandPersistence) / 0,25)`. Ce montant est un plafond de tempérament : une recherche générique compare d'abord 0, 25, 50, 75 et 100 % du budget publicitaire ordinaire, puis 0, 0,5, 1, 2, 3, 4 et 6 fois le budget de R&D, selon leur contribution récurrente prévue sur les trois prochains trimestres (ou les trimestres restants). Aucun multiplicateur de R&D stratégique n'est imposé par l'obsolescence. Elle accumule qualité et notoriété avec les mêmes formules que la résolution et projette la demande, la concurrence extérieure et l'expiration des nouvelles et combines connues. Le calcul est celui de la contribution industrielle : CA moins coût de la production, valeur du stock initial et budgets, plus valeur du stock survivant ; les pertes par péremption sont donc comptées, et l'inventaire final reste un actif compté une seule fois, sans multiple de capitalisation expert. Chaque trimestre ne conserve que le stock invendu après péremption ; seules les capacités déjà payées sont livrées. Les coûts futurs suivent les déplacements déjà payés et la fin des effets connus. Marketing et R&D restent bornés par 65 % de la marge potentielle et la trésorerie ; un investissement sans rendement peut donc recevoir zéro publicité ou R&D.
  - Crypto : le plafond marketing lié à la taille du marché monte de 15 % après deux hausses consécutives de la demande publique (trois points d'historique). Le plafond de marge et la réserve de trésorerie restent applicables ; ni stagiaires ni pilote automatique ne suivent ce signal. Les multiplicateurs de stratégie physique ci-dessus ne changent pas ce comportement.
  - Panique crypto : sur les seuls signaux publics du cycle (§5.1, journal du jour — jamais l'état caché de la bulle), une rumeur de krach fait vendre ~40 % des participations dans chaque entreprise qui a un produit crypto (± personnalité : cupides et prudents allègent davantage, les téméraires gardent leurs jetons ; borné à 25-60 %) ; le krach en une fait liquider 85 % — délibérément souvent trop tard. La panique ne cède jamais le contrôle : la vente est plafonnée pour garder 50 % + 1 action (la défense rachèterait dans le même tour, ce qui serait un délit d'initié, §6.2). Une fois par partie au plus (`PlayerState.cryptoPanicCloseUsed`) — quand le krach est publié, ou quand rumeur, demande qui se retourne et cours au moins doublés se conjuguent —, le produit crypto au plus petit CA d'une entreprise contrôlée est arrêté impulsivement pour en récupérer la moitié ; jamais le dernier produit.
  - Matières : achat au marché seulement quand le cours est ≤ 0,95 × prix de base (ordres ≤ 6 % de la liquidité), ou sur une rumeur de hausse de fiabilité « élevée » si riskTolerance > 0,6 (+60 % de stock) ; sinon achat d'urgence à la résolution. Les bots ne lisent que le journal publié (rumeur et fiabilité affichée) : une table statique relie l'origine de chaque rumeur (carte de news ou fausse rumeur de pénurie, champ `commodityId`) aux matières annoncées en hausse ; ils se font donc piéger par les fausses rumeurs « élevées », comme les humains. L'origine est lue dans `GameState.rumorKeys` (clés `news:<id>` / `fake:<fakeRumorId>`, cachées de la vue), jamais dans le texte, qui dépend de la langue.
  - **Argent de la clôture** (§5.7) : avant de distribuer (bonus, dividende, rachat d'actions), d'investir (usine, lancement), de miser sur une filiale ou de tricher, un bot garde en caisse, en plus de la réserve, ce que la clôture demandera à la caisse : intérêts, achats par contrat, et ce que les ventes attendues ne couvriraient pas des mises, de la production, du marketing et de la R&D, avec la marge d'un écart type de la demande. Sinon il dépenserait l'argent de la clôture et l'emprunterait ensuite, et sa dette enflerait de tour en tour.
  - Zones d'usine classiques (§5.8) : le trimestre où un produit démarre, le bot place l'usine (règle de §5.8, valeur = marge × demande) avant de régler prix et production, puis une seconde fois en fin de tour pour les lancements et les start-ups du tour. Chez les experts, placer d'abord les produits de départ change les lancements du premier tour (les entreprises de trottinettes lancent des boissons plutôt que de la crypto), sans effet mesurable sur leur résultat.
  - Cases hexagonales (§5.8 quater) : environ dix candidates libres par bassin, évaluées par les mêmes estimations de demande, transport, main-d'œuvre, chaleur et effets que la vue. Valeur sur les trimestres restants moins réserve et frais ; pour un déménagement, gain depuis la case actuelle après impôt et perte du siège. La mise ajoute à la réserve une part croissante de cette valeur selon l'agressivité, plafonnée au budget après engagements. Repli au plus proche pour les lancements, sauf trésorerie courte ; aucune deuxième mise du même bot sur la même case. Les usines existantes peuvent remiser si le déplacement se rentabilise.
  - Capacité : +20 % quand tout est vendu à plus de 90 % de la capacité avec une marge d'au moins 20 %, en empruntant si besoin quand riskTolerance ≥ 0,5.
  - Nouveau produit (probabilité 20 % par tour) dans un secteur préféré qui compte au plus 2 produits en jeu, si l'entreprise était bénéficiaire et a plus que l'argent de la clôture + 2 × launchCost ; au plus 3 produits ; jamais pendant les 4 derniers trimestres (le lancement serait encore en charge à la clôture).
  - Communication de crise dès que la jauge atteint 35 (45 pour le pilote automatique et les stagiaires), si la trésorerie reste au-dessus de la réserve. Le bot la décide **en fin de tour**, après son bonus et son action discutable, qui font monter la jauge.
  - Trésorerie : emprunt si le cash passe sous la moitié de la réserve, remboursement de ce qui dépasse de plus de 2 × la réserve l'argent de la clôture. **Couverture de la clôture** : une fois que tous les bots et le pilote automatique ont joué (leurs achats ont pu renchérir les matières), chaque entreprise qu'ils dirigent, s'il lui manque quelque chose ou qu'elle a une mise en cours, emprunte ce que son plan de clôture demande avec la marge (`ClosePlan.safeLoan` + 2 % + 20 k€, §5.7 : une mise, tout ou rien, ne doit pas tomber pour des ventes un peu décevantes), dans la limite du plafond.
  - Finance perso : bonus = 50 % × greed × bonus maximal (au plus ce qui dépasse l'argent de la clôture), si la jauge de scandale est < 30 + 25 × greed et l'entreprise bénéficiaire (ou très riche) ; dividende occasionnel (probabilité 0,3 × greed) quand la trésorerie dépasse de 3 × la réserve l'argent de la clôture.
  - Défense : si un autre joueur détient ≥ 30 %, rachat d'actions (sans jamais faire passer ce joueur au-dessus de 50 %), achat perso pour repasser au-dessus de 50 % (avec levier selon riskTolerance ; c'est un achat d'initié, qui fait monter la jauge, §6.2), puis pilule empoisonnée si la menace persiste et que le cash perso suffit.
  - Prédation (à partir du tour 3 : les bots observent deux trimestres avant de chasser) : avec une probabilité `aggressiveness`, poursuit la cible déjà entamée (≥ 10 % détenus), sinon choisit la meilleure affaire parmi les PNJ à portée (coût du contrôle ≤ 5 × budget) et, si aggressiveness ≥ 0,4, les entreprises de joueurs **rentables** (coût ≤ 3 × budget, flottant suffisant, dernier trimestre bénéficiaire, cours ≤ valeur fondamentale / 0,9). Score = (valeur fondamentale / capitalisation) × 1,3 pour une entreprise de joueur (la conquête ouvre des emplacements de produit) / √(coût / budget). Si le contrôle est à portée (cash + riskTolerance × plafond de prêt perso), assaut final avec levier (jusqu'à riskTolerance × le plafond) ; sinon accumulation avec une partie du cash (et (riskTolerance − 0,3) × le plafond de levier si riskTolerance > 0,3). *Ces parts du plafond valaient la moitié ; elles ont doublé quand les actions de sa propre entreprise sont passées à 25 % dans le plafond (§6.4), pour garder ~2 OPA par partie.*
  - Actions discutables : une par tour avec probabilité 0,5 × `shadyPropensity`, si la jauge est ≤ 40, choisie au hasard parmi celles qui ont un sens (optimisation fiscale si le résultat avant impôt dépasse 1,5 M€, greenwashing, lobbying sur son secteur principal, espionnage s'il est distancé en qualité, délocalisation, dénigrement du plus gros concurrent contrôlé par un joueur).
  - Lanceur d'alerte (dès le tour 2) : s'il a plus de 2 M€ de cash perso, dénonce l'entreprise du joueur le plus riche qui le devance parmi celles dont la jauge publique est au moins « moyenne » (≥ 30), avec une probabilité 0,15 + 0,35 × aggressiveness.
  - Fusion : s'il contrôle plusieurs entreprises, absorbe la plus petite dans la plus grosse (probabilité 25 % par tour), si l'ensemble ne dépasse pas 6 produits.
  - Start-up : un bot évincé sans entreprise en fonde une (probabilité 60 % par tour, 70 % de son cash, entre 1,5 et 8 M€), dans son secteur préféré.
  - Désendettement : rembourse son prêt perso quand la dette dépasse 30-50 % du portefeuille (selon riskTolerance), ou systématiquement s'il est prudent.
  - Filiales (§5.5 bis ; les bots experts suivent les mêmes règles) : si riskTolerance ≥ 0,4 et qu'il reste plus de 8 trimestres (le temps de la rentabiliser), un bot mise au plus sur une matière par tour, celle dont ses besoins pèsent le plus (lots consommés × prix de base), s'il en consomme au moins 30 lots par trimestre, s'il reste un emplacement libre et s'il peut payer 2 × la mise à prix sans toucher à l'argent de la clôture ; jamais pendant qu'une news renchérit l'extraction de cette matière (produit des effets `siteCost` > 1). Sa mise est la mise à prix majorée de 40 % × son agressivité (de 10 % pour Brevet à 34 % pour Tweetard ; Bas-de-Laine et de La Rente, trop prudents, ne misent jamais) ; il ne paie de toute façon que le prix d'équilibre, donc la mise à prix tant que les candidats sont moins nombreux que les emplacements libres. Chaque tour, il compare le coût d'extraction du moment à ce que vaut un lot extrait : l'achat d'urgence évité (cours × 1,1) si ses besoins absorbent au moins la moitié de l'extraction, sinon la revente (cours × 0,95). Il endort une filiale en marche quand l'extraction coûte plus de 115 % de cette valeur, et la relance quand elle retombe sous 95 % (l'écart lui évite de changer d'avis à chaque trimestre : l'entretien et le trimestre de relance coûtent). Il revend au marché le stock de ses filiales au-delà de 1,5 × ses besoins (au moins 10 lots, ordres ≤ 6 % de la liquidité) quand le cours dépasse 1,1 × son coût d'extraction hors news.
  - Tractations (§7 bis) : un bot ne propose rien ; il répond sur-le-champ aux offres, sans tirage (`sim/botDeals.ts`). Ses prix de référence ne se manipulent pas dans le trimestre : il compare au cours du moment **et** à celui de la dernière clôture, et retient le moins favorable pour lui (sinon, gonfler un cours à coups d'achats puis lui revendre au prix gonflé rapporterait à coup sûr). Actions (jamais celles de l'entreprise qu'il dirige, ni à l'achat, qui serait un délit d'initié, ni à la vente) : il achète au plus au moins cher des deux (+ 5 % × aggressiveness), jamais au-dessus de la valeur fondamentale par action, s'il garde 20 % de marge de cash ; il vend au moins à (1,1 − 0,1 × greed) × le plus cher des deux. Contrat : ses besoins se lisent sur ses capacités, publiques (lots par trimestre à pleine capacité), jamais sur sa production prévue, secrète, que ses réponses trahiraient sinon ; il achète une matière qu'il consomme, pour ses seuls besoins non couverts (filiales et contrats déjà signés déduits), à 97 % au plus du moins cher du cours, de la dernière clôture et du prix de base ; il vend le surplus de ses filiales (extraction moins ses besoins et ses contrats), à au moins 90 % du plus cher des trois et 1,3 × son coût d'extraction. Entente : il signe si shadyPropensity ≥ 0,5 (Magouillac oui, les autres non) ; membre d'une entente, il ne descend plus sous 110 % de son prix habituel (référence × pricePremium × 1,1).
- **Niveau de chaque bot** : le sien (`LobbyPlayer.botLevel`, repris dans `PlayerState.botLevel`), réglé au salon par l'hôte ; à défaut celui du salon (`GameConfig.botLevel`), puis « normal ». Un bot invité prend le niveau du salon ; choisir le niveau du salon (`lobby:config`) l'applique à tous les bots présents, et quand l'hôte règle un bot (`lobby:botLevel`) de sorte que tous aient le même niveau, ce niveau devient celui du salon. Des bots tous réglés au même niveau jouent exactement comme ce niveau réglé pour le salon. Le niveau d'un bot est public (salon, `PublicPlayer.botLevel`) ; en partie, le badge d'un bot montre 🎓 (stagiaire) ou 🎩 (magnat), rien pour le petit patron.
- **Bots « stagiaires »** (niveau `'intern'`, pour une première partie) : ils gardent leurs réglages de départ (prix de référence, production, marketing et R&D par défaut), ne lancent aucun produit, ne font ni OPA, ni défense, ni action discutable, ni alerte, ni bonus, ni start-up ; ils empruntent seulement si leur trésorerie passe sous la moitié de la réserve, ou ce que leur clôture demanderait (§5.7), et font une com' de crise si une news pousse leur jauge à 45. Une première partie se gagne alors en réglant bien son prix et sa production.
- **Arrêt chez les experts** : sur les seuls chiffres de leur vue, ils comparent la récupération nette au score
  final de conservation : valeur comptable conservée de l'usine, du terrain et du stock, plus bénéfices courants
  marginaux de l'entreprise pondérés comme leurs autres investissements. La perte du taux fiscal du siège porte
  sur tous les produits restants ; un siège qui protège du scandale est conservé par prudence. La déduction de
  la décote du stock ne rapporte que son économie fiscale, sans multiple de bénéfice. Les budgets projetés sont
  ceux restant après le plancher de résultat. L'arrêt exige un gain supérieur à `max(2 000 k, 50 % de la récupération)`
  dans **deux scénarios** : coûts courants et progression habituelle des rivaux ; retour connu des matières vers
  leur prix de base et aucune croissance supplémentaire des rivaux. Une tension temporaire sur les matières
  ne suffit donc pas. Jamais le dernier produit, une ligne âgée de quatre trimestres ou moins ou encore en chantier :
  après la livraison de sa capacité au trimestre suivant le lancement, quatre trimestres d'exploitation doivent
  pouvoir être observés, et la période d'amortissement du lancement doit être terminée. Deux pertes précoces
  peuvent encore provenir du démarrage ou de l'écoulement du stock, même si le modèle pessimiste conseille l'arrêt ;
  il faut aussi deux marges de ventes observées déficitaires (après coût unitaire et frais fixes, avant les budgets
  marketing/R&D facultatifs), chacune sous −50 k. Cette règle s'applique à tous les secteurs.
- **Bots « experts »** (niveau `'expert'`, pour joueurs aguerris ; `sim/botExpert.ts`) : un joueur chevronné, porté des stratégies « compétent » et « expert » du banc d'essai (`tools/balance-lab`). Ils ne lisent que **leur vue de joueur** (`buildPlayerView`, relue après chaque action réussie), comme un humain : prix des rivaux du trimestre précédent, jauges des autres en trois paliers, rumeurs avec leur fiabilité affichée (une table statique relie le texte de chaque rumeur, vraie ou fausse, aux pénuries qu'elle annonce ; ils ne misent que sur les « élevées »). Aucun tirage : tout se décide sur la vue. Pour chaque entreprise contrôlée :
  - Modèle de demande : le logit du §5.2, recalculé depuis la vue, **calibré en ligne** : à chaque tour, la part de marché obtenue est comparée à la part prévue et l'attractivité supposée du produit corrigée (`logk ← logk + 0,17 × ln(cote observée / cote prévue)`, borné à ±0,8 ; seulement à la hausse si le produit était en rupture). Cette mémoire vit dans `PlayerState.expertMemory` et n'apparaît dans aucune vue.
  - Prix et production à l'optimum du modèle (marge brute + 1,5 % du CA, 12 % dans les 5 derniers trimestres : la croissance du CA porte la valorisation, §6.1), production calée sur la demande prévue.
  - Marketing et R&D (0 à 5 % de la taille du marché chacun) choisis en simulant les trimestres restants, chaque bénéfice pesé par son poids dans la valeur finale, `1 + 40 × 0,2 × 0,8^(T−1−t)` (1 k de bénéfice au T15 vaut ~9 k de capitalisation, au T1 ~1,4 k), que l'expert escompte un peu (`1 + 0,9 × 40 × 0,2 × 0,8^(T−1−t)`), les rivaux progressant de 8 % par tour et les produits annoncés comptés : investir tôt, récolter tard. Le marketing est coupé au dernier tour ; la R&D est coupée dès l'avant-dernier dans les secteurs à déclin lent (`qualityDecay ≥ 0,99`). Avec une obsolescence rapide, l'optimiseur peut conserver la R&D jusqu'au dernier tour : l'entretien de la qualité peut payer dès les ventes du trimestre. Les projections de retrait utilisent la même règle.
  - **Plancher de bénéfice** : si le bénéfice avant impôt prévu du trimestre (87 % de la marge brute prévue, moins budgets, siège et coûts fixes, lancements passés en charge à la prochaine résolution, intérêts, charges déjà engagées) passe sous le plancher du trimestre, marketing et R&D sont rabotés d'autant. Le plancher suit les trimestres restants : −500 k€ au premier, −800 k€ au dernier (interpolation linéaire) ; une perte modérée pour investir est donc permise. Sans plancher, une table d'experts investissait à perte en même temps, les cours retombaient vers la valeur de l'actif (le multiple passe de 40 à 8) et tout finissait racheté ou en faillite ; à 0, les experts renonçaient à des investissements rentables (§13).
  - Lancement du meilleur secteur absent de la gamme si sa valeur pondérée dépasse 30 % de son coût, que le premier quart de charge tient au-dessus du plancher et que la trésorerie suit (emprunt si besoin, dette ≤ 50 % de la capitalisation) ; jamais dans les 5 derniers trimestres ; un emplacement reste libre chez les conquérants (pour fusionner). Sur le plateau, chaque case libre évaluée dans sa vue est comparée sur cet horizon, avec la capacité de départ payée, les coûts locaux et les échéances connues. La prévision de la case retenue sert aussi à l'enchère : la mise engage une fraction du gain de trésorerie après impôt sur les trimestres restants, moins le lancement, sans capitalisation des bénéfices ni valeur comptable de l'usine. Une projection pondérée rentable mais négative en cash peut miser la réserve ; une perte aux réglages humains du premier trimestre ne bloque pas une projection rentable. Le produit lancé attend le trimestre suivant sans marketing ni R&D. Les start-ups de reprise utilisent les estimations publiques de premier trimestre pour choisir leur case.
  - Capacité agrandie quand la demande au prix optimal dépasse l'usine et que le gain pondéré sur les tours restants dépasse 50 % du coût net (la moitié reste au bilan) ; matières achetées au creux (≤ 98 % du prix de base) ou d'avance sur une pénurie annoncée « élevée », revendues si le saut a eu lieu ; emprunt de précaution, remboursement quand la trésorerie déborde (dette ≤ 60 % de la valeur comptable) ; la réserve compte l'impôt et les amendes dus, et bonus, rachats, lancements et combines gardent l'argent de la clôture (plan de sa vue, §5.7).
  - Jauge tenue sous 20 à la résolution (risque d'éclatement ~3,7 % par trimestre) : combines et achats d'initié dosés dans ce budget, l'unique com' de crise du tour en dernier.
  - Défense anti-OPA (rachat d'actions, achat perso à crédit, pilule), puis **contrôle** : 50 % + 1 de son entreprise principale dès que possible, et jusqu'à 50 + 15 × riskTolerance % tant que le cours reste sous le juste prix (levier perso ≤ 34 + 30 × riskTolerance % du portefeuille, remboursé au-delà de 44 + 30 × riskTolerance % et en fin de partie).
  - Personnalité : l'agressivité (≥ 0,3) ouvre les OPA sur les entreprises dont le contrôle coûte moins que ce qu'elles valent (emprunt perso jusqu'à 20 + 60 × riskTolerance % de son plafond), puis la fusion, les paris de valeur en bourse (achat sous 97 % du juste prix, revente quand il est rejoint) et l'alerte contre le plus riche devant soi ; le goût des combines (≥ 0,3) ouvre greenwashing et optimisation fiscale quand ils paient, et le lobbying (≥ 0,6) ; le goût du risque, le levier. Un expert ne se verse **aucun bonus** (le réglage automatique l'a ramené à zéro : laissé dans l'entreprise, l'argent finance des investissements que la bourse valorise à 40 fois le bénéfice lissé, et la jauge de scandale sert mieux aux combines et au rachat de ses propres actions) ; l'avidité ne joue donc plus chez lui. Au dernier tour, achat des titres qui cotent nettement sous leur juste prix (le cours de clôture est la cible sans inertie). Filiales et réponses aux offres suivent les règles des autres bots.
  - Réglages : ces seuils et dosages sont les `ExpertParams` du jeu (`DEFAULT_EXPERT_PARAMS`), trouvés par réglage automatique sur le banc d'essai (§13).
  - Sortie crypto (`cryptoExitPlay`) : sur le score public du §5.1, au-dessus d'un premier seuil (0,55 de base) **et sur un vrai signal crypto** (euphorie publiée, rumeur de krach ou krach — l'envolée des cours ou un creux de demande seuls ne déclenchent rien), vente d'une part de chaque participation dans une entreprise dont la crypto pèse au moins 40 % du CA (ou née crypto) — `0,3 + 0,4 × score`, +0,15 sur celles qu'il contrôle, plafonnée à 0,9. Sur une entreprise contrôlée, la vente ne descend jamais sous 52 % du capital (marge de sécurité au-dessus du seuil de contrôle) ; une même ligne ne peut être re-vendue qu'après deux trimestres (mémoire `cryptoDump`, effacée quand le krach est publié — jusque-là, `consolidate` ne rachète pas non plus la ligne cédée : pas d'aller-retour d'initié). Au-dessus d'un second seuil (0,8 de base), le produit crypto au plus petit CA d'une entreprise contrôlée est liquidé d'abord, tant que l'expert en garde le contrôle, sans le filtre habituel d'âge et de perte persistante — jamais le dernier produit ; la vue est relue après la liquidation, pour ne pas vendre une entreprise qui n'a plus de ligne crypto. Les deux seuils bougent de ±0,15 avec la personnalité (le goût du risque retarde, l'avidité avance) : chacun sort tôt ou tard, jamais sur l'état caché de la bulle.
  - Coût : ~15 ms par bot et par tour.
- **Mode hexagonal** : la valeur d’un déménagement compare les positions après impôt et ajoute à la case actuelle
  l’économie récurrente de son siège sur les marges des produits, moins coûts fixes, budgets et siège, sans dépenses
  exceptionnelles ni constitution de stock du premier trimestre. Une fusion est écartée si les privilèges fiscaux
  perdus par les deux sociétés valent plus que le coût de siège économisé sur les trimestres restants ; l’expert
  ne compte alors aucune synergie de fusion pour son OPA. Les combines fiscales utilisent le taux privé effectif
  du trimestre. Les prévisions des experts utilisent ce taux pour le trimestre courant, puis les taux et effets
  projetés à chaque trimestre : une optimisation d’un tour, une news de deux ou trois tours et l’exonération des
  Portes ne sont jamais prolongées jusqu’à la fin.
- **Pilote automatique PNJ** (entreprise sans contrôleur) : même logique de gestion, avec une personnalité neutre (prix ×1,0, biais 0,4, riskTolerance 0,3, pas de prédation, pas d'actions discutables, pas de nouveau produit, pas de bonus). Il verse un dividende annuel (tours 4, 8, 12…) de 40 % des bénéfices des quatre derniers trimestres quand la trésorerie dépasse de 2 × la réserve l'argent de la clôture, et couvre sa clôture comme les bots.
- **Joueur humain déconnecté** : son entreprise garde ses dernières décisions.

### Arrivées en cours de partie

L’hôte peut activer dans le salon **« Autoriser les arrivées en cours de partie »** (`allowBotTakeover`, désactivé par défaut). Ce réglage permet de reprendre une place de bot ; il ne crée ni joueur supplémentaire ni nouvelle entreprise et reste limité aux huit places existantes.

Une personne qui saisit le code d’une partie en cours voit les bots encore disponibles, leur fortune personnelle, leur cash, leur dette et les entreprises qu’ils contrôlent. Consulter cette liste ne réserve aucune place. La personne choisit un bot ; le serveur vérifie et réserve la place avant d’envoyer sa session. Une place humaine, même déconnectée, n’est jamais proposée. Si le bot vient d’être pris, la personne peut actualiser la liste et en choisir un autre.

La reprise conserve l’identifiant de la place, les actions détenues, les sociétés, les dettes, les restrictions déjà consommées, les statistiques et l’historique du bot. Aucun capital, parachute doré ou bonus n’est ajouté. Le joueur utilise son pseudo ; le nom du bot repris et le trimestre de prise en main restent signalés. Les anciennes nouvelles restent historiques, et le classement comme les trophées incluent les performances héritées.

Le bot a déjà agi au début du trimestre courant. Ses décisions restent en vigueur jusqu’à la clôture, et le nouvel arrivant attend **le trimestre suivant** avant toute action. Il ne bloque pas la clôture anticipée pendant cette attente. Au début du trimestre suivant, il dispose du temps complet et le bot n’agit plus à sa place. Aucune arrivée n’est donc acceptée pendant le dernier trimestre ni après la fin de partie.

Avant la prise en main, quitter volontairement annule la réservation et rend la place au bot, sans rejouer ses actions. Une coupure de connexion conserve la réservation et permet la reconnexion avec le jeton de cette place. Après la prise en main, les règles ordinaires de départ et de reconnexion d’un joueur humain s’appliquent. Le menu et l’attente n’exposent que des informations publiques, afin de ne pas permettre d’espionner les bots en réservant puis en annulant successivement. Les vues privées des entreprises de la place reprise deviennent accessibles à la prise en main effective.

## 11. Fin de partie et trophées

À l’arrivée sur le résultat, la page remonte immédiatement et le titre du vainqueur reçoit le focus clavier.
Les mises à jour suivantes ne déplacent plus la lecture des comptes ou des trophées.

Après la résolution du dernier tour : `phase = 'finished'`, classement par valeur nette décroissante (actions valorisées au cours de clôture, §6.1), et un trophée par `TrophyId` au joueur ayant la plus grande stat correspondante (s'il y en a une > 0 ; à égalité, le mieux classé). « Magnat » = premier du classement ; « Naufrage » = `worstTurnLoss` maximal, c'est-à-dire la plus forte baisse de valeur nette entre deux fins de tour consécutives (`netWorthHistory` contient la valeur nette à la fin de chaque tour résolu, sans valeur initiale). L'écran de fin ajoute un encart « Ils ont dit » / "They said" : une réplique d'adieu par bot, tirée par hachage (`textSeed`) dans le répertoire `farewells` de sa personnalité selon son issue (vainqueur, podium, peloton, ruiné sans entreprise et sous 25 % de sa mise de départ) ; un bot repris par un humain en cours de partie a droit à une ligne neutre de passation, jamais à une réplique.

## 12. Architecture technique

```
packages/
  core/     moteur pur TypeScript : types, contenu, simulation, vue joueur, protocole
  server/   Node + Express + Socket.IO : salons, chrono, diffusion des vues
  client/   React + Vite : lobby, tableau de bord, journal, bourse
```

- **Serveur autoritaire** : le client n'envoie que des `Action` ; le serveur appelle `applyAction` et renvoie à chaque joueur sa `PlayerView` redigée (`getPlayerView`). Aucune donnée cachée ne sort du serveur (jauges de scandale des autres, news programmées, décisions privées).
- **Décisions cachées jusqu'à la résolution** : pour une entreprise que le joueur ne contrôle pas, le prix affiché (`ProductView.price`) est celui du trimestre précédent (`ProductState.lastPrice`, mis à jour à chaque résolution ; au T1, le prix de départ), sauf entre partenaires d'une entente sur le secteur, qui voient le prix du trimestre en cours (§7 bis) ; production, marketing et R&D des autres ne sont jamais montrés. Leurs rapports trimestriels n'ont pas de lignes produit pendant la partie (`QuarterReport.products` vide : la production et le coût unitaire du trimestre passé trahiraient la production en cours) ; le compte de résultat de l'entreprise reste public. Un produit lancé ce tour est visible (flash, `ProductView.comingSoon`, capacité 0) mais ne vend qu'au trimestre suivant. Les achats et ventes d'actions restent immédiats et visibles : la bourse en direct est le lieu de la tension.
- **Aides de lecture** (moteur, `sim/advice.ts`, fonctions pures réexportées par `@muchomoney/core`) :
  - `ProductView.private.estimate` : ventes, CA et marge estimés du produit aux décisions actuelles (même formule que la résolution, §5.2, avec la demande attendue sans le choc aléatoire, la notoriété et la qualité après le marketing et la R&D prévus, et les prix connus des autres produits). `private.market` en donne les entrées, pour que le client recalcule l'estimation à un autre prix avec `estimateSales(sectorId, market, décisions)` ;
  - `SectorView.launchEstimate` : bénéfice trimestriel attendu d'un produit lancé dans ce secteur (réglages de départ, prix de référence, matières au prix spot × 1,1, face aux produits actuels) et trimestres pour rentabiliser le lancement, `launchPaybackQuarters(coût, bénéfice)` = 1 trimestre d'attente + ⌈coût / bénéfice⌉ (null si le bénéfice est ≤ 0) ;
  - `CompanyView.valuation` : valeur comptable, bénéfice lissé (`profitEma`) et `valuationPerShare(valeur comptable, bénéfice lissé, actions)` = (valeur comptable + 40 × bénéfice lissé) / actions (8 × si négatif) : « votre cours ≈ valeur comptable + 40 × votre bénéfice moyen récent », sans plancher, croissance ni sentiment (§6.1) ;
  - `CompanyView.maxProducts` : 4, ou 6 après une fusion ;
  - `CompanyView.private.closePlan` (dirigeant seulement, pendant la partie) : le plan de clôture du §5.7, calculé par `planClose` comme à la résolution ;
  - `PlayerView.self` (joueur qui regarde) : subvention de sa start-up de retour en jeu (`startupSubsidy` = max(1 000 k, dernier parachute)), tarif de son tuyau ce trimestre (`rumorCheckPrice`) et réponses de ses sources (`rumorChecks`, de lui seul), ses tractations (`offers` : offres reçues et envoyées ce trimestre ; `contracts` : contrats de ses entreprises ; `cartels` : ses ententes, avec les membres encore valables et le risque de découverte à la prochaine clôture), `whistleblownThisTurn` (alerte déjà lancée ce trimestre) et `soldControlThisTurn` (entreprises dont il a cédé le contrôle en vendant ce trimestre : rachat = délit d'initié, start-up au trimestre suivant).
  - Les filiales et leurs emplacements sont publics (`CompanyView.sites`, `PlayerView.siteSlots` : nom et exploitant) ; les mises aux enchères (`GameState.siteBids`) ne sortent que vers leur auteur (`self.siteBids`), jamais celles des autres joueurs ni des bots ; les offres, contrats et ententes des autres ne sortent jamais du serveur, pas plus que le passé d'entente d'une entreprise (`cartelQuarters`). Une entente ne se lit publiquement que le jour où elle est découverte.
  - Pendant la partie, le compteur d'alertes (`stats.whistleblows`) d'un autre joueur est masqué : la source d'un flash du lanceur d'alerte reste anonyme. Son compteur d'actions discutables (`stats.shadyActions`) est ramené à 0 : il trahirait en direct une décision cachée et l'état de la jauge. Les deux sont révélés à la fin de la partie (trophées). L'estimation de la demande (`expectedSectorDemand`) ignore le lobbying décidé ce tour par une entreprise que le joueur ne contrôle pas (il compte à partir de la résolution).
  - `PublicPlayer.botPersonalityId` : l'identifiant de la personnalité d'un bot (déjà public au salon), présent aussi pour un bot repris par un humain ; il sert au client à choisir la réplique d'adieu de l'écran de fin (§11), sans rien révéler de plus.
- **Interface** : le client affiche ces aides telles quelles (fiche produit : ventes et marge estimées, recalculées en direct quand on bouge le prix ; ligne du coût d'un lot d'un seul tenant, « Coût de production estimé 73,0 k€/lot (dont fret 4,0 k€) · marge par lot 42,0 k€ (37 %) », le fret (§5.8) compris dans le coût et nommé juste après lui — « une économie » quand il est négatif —, l'infobulle détaillant main-d'œuvre + matières + fret ; ce chiffre s'appelle « fret » partout où il s'affiche — « dont fret … » aussi dans « Atelier » et le rapport du trimestre, et jusqu'à la couleur « Fret » du plateau — ; bouton de lancement « rentabilisé en N trimestres » ; infobulle du cours). La fiche Bourse d'une entreprise dit en toutes lettres si l'on en a le contrôle, sinon combien d'actions il manque pour dépasser 50 % (et s'il en reste assez au flottant) ; les parts du capital proches de 50 % s'affichent avec assez de décimales pour trancher (« 50,01 % », « 49,99 % »). Il mentionne que les prix des rivaux sont ceux du trimestre précédent, montre un produit lancé comme « opérationnel au prochain trimestre », ne propose la start-up qu'au joueur sans entreprise et le lanceur d'alerte dans le détail d'une entreprise qu'il ne dirige pas. Chaque champ numérique a ses boutons − et + : un lot à la fois pour des lots ; sur la fiche produit, le pas du curseur (1 lot de production, 10 k de marketing ou de R&D, 1 % du prix de référence et au moins 0,5 k pour le prix) ; ailleurs, un pas rond (1, 2 ou 5 × 10^k) d'environ un vingtième de la plage. La valeur se cale sur la grille du pas, dans les bornes du champ ; bouton maintenu, elle défile, dix fois plus vite après douze pas. Quand le jeu écrit la valeur d'un champ (valeur proposée, boutons − et +, raccourcis, relecture à la sortie du champ de la fiche produit), il utilise la décimale de la langue de l'interface, sans séparateur de milliers ni plus de deux décimales (« 114,75 » en français, « 114.75 » en anglais), dans tous les champs : fiche produit, montants, Tractations, start-up ; la saisie accepte les deux décimales. Les raccourcis disent de quoi ils sont la part (« ¼ max », « ½ max », « max » du maximum affiché, leur valeur au survol), sauf sur une mise pour une case du plateau, qui n'en a pas, et, sous le champ, une ligne dit ce qui restera après l'opération : trésorerie, cash perso, dette ou stock (au pire, pour une mise aux enchères). Le niveau des bots (🎓 stagiaires, 💼 petits patrons, 🎩 magnats ; en anglais interns, small-cap CEOs, tycoons) se règle au salon, par l'hôte seulement : pour tous les bots avec `lobby:config` (`botLevel`), ou bot par bot avec `lobby:botLevel` (sélecteur dans la liste des actionnaires ; le réglage commun dit « panaché » quand les niveaux diffèrent). Le serveur valide et transmet chaque niveau à `createGame` avec les joueurs du salon.
- **Réglages des produits** (client, `ProductCard` et `productSaves.ts`) : pas de bouton « Appliquer ». Un réglage (prix, production, marketing, R&D) s'enregistre au relâcher du curseur, à la sortie d'un champ ou sur Entrée ; les boutons − et + et les flèches du clavier sur un curseur attendent une pause de 500 ms, pour que plusieurs pas ne fassent qu'un enregistrement. Chaque enregistrement est une action `setProductDecisions` avec les quatre valeurs, sans toast de succès (un échec garde son toast). Dans le pied de la fiche, à gauche des actions du produit (pas de ligne en plus), l'état dit « Enregistrement automatique » (la règle dans une infobulle atteignable au clavier), « Enregistrement… », « Enregistré ✓ » ou « Non enregistré — Réessayer » ; au trimestre suivant, « Enregistré ✓ » s'efface (un échec qui attend reste affiché). Marketing et R&D au-delà du plafond par produit et par trimestre (`MAX_SPEND_PER_PRODUCT`, la seule borne que les champs n'appliquent pas eux-mêmes) sont ramenés avant l'envoi : sans cela, le serveur pourrait retenir la valeur qu'il avait déjà, sans nouvel état à renvoyer, et la fiche garderait un chiffre faux. Quand une valeur est ainsi ramenée, ou bornée par le serveur, la fiche montre la valeur retenue et une ligne en donne la raison, champ par champ et sans la réplique du moteur (« Le garde-fou a tranché : marketing plafonné à 1,0 Md€ par produit et par trimestre. ») ; la ligne s'efface au geste suivant ou au trimestre suivant. Pendant le geste, la prévision suit les valeurs à l'écran ; une nouvelle valeur du serveur ne remplace jamais un champ en cours de réglage, et les envois partent un par un, toujours avec les dernières valeurs. Le serveur répond à `game:action` avant de publier le nouvel état (au plus toutes les 200 ms), la maquette de développement peut publier avant : un état reçu pendant un envoi n'est pris pour son résultat que si aucun écho d'un envoi précédent n'était encore attendu, de sorte que deux enregistrements rapprochés ne font jamais revenir la fiche en arrière. Refermer la fiche (changement d'onglet, fenêtre de « La carte » ou de la vue « Atelier ») enregistre ce qui attendait. Une fiche refermée sur un échec n'est pas oubliée : la fiche rouverte reprend son brouillon et « Réessayer », et « Je suis prêt » la réessaie ; elle n'est abandonnée que si elle n'a plus d'objet (produit arrêté ou plus dirigé, réglage changé ailleurs depuis, plus rien à enregistrer, autre salon). « Je suis prêt » enregistre de même ce qui attend et n'envoie le signal qu'après les accusés : si un enregistrement échoue, le joueur reste non prêt et un toast le dit en nommant les produits ; pendant l'attente, le bouton reste focalisable (`aria-disabled`) et ignore un second clic. « ↺ Début du trimestre » (nom complet pour les lecteurs d'écran : « Revenir aux réglages du début du trimestre ») remet et enregistre les valeurs relevées dans ce navigateur à la première vue du trimestre (au chargement de la page si elle a été rouverte en cours de trimestre ; l'infobulle le dit) ; le bouton est grisé quand les réglages n'ont pas bougé. Rien ne change côté moteur : `setProductDecisions` ne touche pas au statut « prêt », et les rivaux ne voient que le prix du trimestre précédent, de sorte qu'enregistrer au relâcher ne révèle rien de plus.
- **« Mon entreprise » — Gestion** (client, `CompanyTab`) : l'écran du trimestre courant. En tête, le nom, la ligne du PDG (et la puce du terrain de départ, §5.8 ter), puis quatre chiffres : trésorerie ; dette, avec la sous-ligne « encore empruntable X » (le maximum du formulaire de prêt, sa règle en infobulle) ; cours et sa variation ; réputation (sous 1, un lien « Excuses publiques ↓ » mène à la tuile de communication de crise, dans le bloc du scandale des actions discutables, qui la répare jusqu'à 1, et lui donne le focus). S'y ajoute une puce « Scandale 25/100 · risque 7 % » : mêmes seuils et même risque que la jauge (neutre sous « moyen », ambre dès « moyen », rouge dès « élevé »), un clic mène au bloc du scandale ; elle passe sur deux lignes en largeur étroite. La bulle du lien et celle de la puce s'ouvrent au survol comme au clavier et sont lues par les lecteurs d'écran. La capitalisation n'y est plus (elle est dans « Bourse »). Suivent, dans cet ordre : le bandeau de trésorerie de la clôture ; « Produits (n/max) », le lancement étant un bouton du titre (« + Lancer un produit (choisir l'emplacement sur la carte) », qui ouvre la carte sur le formulaire de lancement) ; « Matières pour ce trimestre », toujours là, même sans produit (lots dus par contrat, « Miser sur un gisement… ») ; « Filiales d'approvisionnement » et « Mes mises », chacune seulement quand elle a quelque chose à montrer ; « Finances » (la différence entre la trésorerie de l'entreprise et le cash perso dans l'infobulle du titre) ; « Actions discutables » ; enfin « Rapport du dernier trimestre », un volet fermé, absent avant le premier bilan.
  - **Finances** : prêt à l'entreprise, dividende et bonus du PDG visibles (deux par ligne quand la place le permet), « Rembourser la dette » seulement quand l'entreprise a une dette. Un volet « Autres opérations », fermé d'habitude, garde le rachat d'actions, la fusion (seulement avec une deuxième entreprise dirigée) et la pilule empoisonnée ; son titre nomme ce qu'il contient (« Autres opérations · Rachat d'actions · Fusion · Pilule empoisonnée »). La pilule en sort, en tuile entière avant le volet, dès qu'un autre joueur détient 20 % du capital (le seuil de la menace de la barre du jeu) ou pendant sa recharge. Sous cette menace, le volet s'ouvre aussi de lui-même, puisque le rachat d'actions est l'autre défense (le joueur peut le refermer). Entre 20 et 25 %, la pilule reste grisée avec « Utilisable dès 25 % (Tweetard : 22,0 %) » (la part du rival tronquée au dixième, pour ne jamais lire « 25,0 % » sur une pilule grisée) ; à partir de 25 %, elle est utilisable si le cash perso suffit (§7). Pendant la recharge, la tuile dit les trimestres restants et nomme toujours le plus gros actionnaire rival. Le formulaire de prêt affiche le taux trimestriel après emprunt, les intérêts prévus à la prochaine clôture et les intérêts supplémentaires. L'estimation garde le taux de base et la valeur comptable actuels ; elle précise que le nouveau taux s'applique à toute la dette. Les lignes de trésorerie et dette après l'opération restent visibles, avec les limites et alertes existantes.
  - **Actions discutables** : toujours visibles, la jauge de scandale et son risque d'éclatement, les effets en cours (seulement s'il y en a) et la tuile de communication de crise, quand la jauge dépasse 0 ou que la réputation est sous 1 (elle la répare jusqu'à 1) ; déjà publiée ce trimestre, la tuile reste pour le dire. Les six combines sont dans un volet dont le titre dit l'état : « 6 combines · scandale 12/100 (faible) · 1 effet : Lobbying (2 trim.) » (le chiffre arrondi comme sur la jauge, le niveau celui de son badge, tiré de la valeur exacte : 29,6 se lit « 30/100 (faible) »). Au-dessus des cartes, un bandeau court : « Chaque combine : scandale en hausse et coût dans le résultat. Une par type et par trimestre. » (« Every scheme: the scandal meter climbs and the cost hits your results. One of each kind per quarter. »), les seuils de la jauge dans son infobulle. Le volet s'ouvre de lui-même quand la jauge est au moins « moyenne », quand la réputation est sous 1 ou quand un scandale de l'entreprise a éclaté à la dernière clôture (son article « scandal » est dans le numéro du trimestre) ; ouvert ainsi, il le reste jusqu'à la fin du trimestre, même si la jauge redescend ou que la réputation revient à 1 (communication de crise). Le joueur peut toujours l'ouvrir ou le fermer : son choix vaut pour cette entreprise jusqu'à la fin du trimestre, le temps de la visite (un rechargement revient à la règle).
- **Fiche produit** (client, `ProductCard`) : avec une ou deux fiches, chacune prend toute la largeur, en deux colonnes (l'une sous l'autre sous 900 px) : à gauche le nom, l'emplacement, les chiffres et les quatre réglages ; à droite le verdict de l'offre face à la demande (rupture, invendus, équilibre ou rien à vendre, les textes de la vue « Atelier »), la prévision, la ligne des rivaux, les alertes (au-delà de la capacité, vente à perte), puis l'état de l'enregistrement et les boutons. Avec trois produits ou plus, la grille habituelle ; dans les fenêtres de la carte et de la vue « Atelier », une colonne. Verdict et prévision suivent les réglages à l'écran. Sous la ligne du coût d'un lot, une seule prévision : « Prévision : ~49 lots vendus (demande ~59) · CA ~5,6 M€ · marge du trimestre +924 k€ ⓘ » (l'infobulle : rivaux à prix inchangés, marge du produit seul, avant le siège et les charges de l'entreprise). « Si tout se vend (n lots) : … » ne s'ajoute que si au moins un demi-lot resterait invendu, sur la même base (sans le siège) : les deux montants ne diffèrent que du prix de ces lots. « Comprendre cette prévision » détaille chiffre d'affaires, production, marketing, R&D et frais fixes jusqu'à la marge du trimestre, puis la quote-part du siège (siège ÷ nombre de produits, payée par l'entreprise) et « ≈ résultat du produit après quote-part du siège (avant intérêts et impôt) », sans le donner pour le bilan. « Face aux rivaux » tient en une ligne de places parmi les produits en rayon du secteur (« Prix 2e/4 · Qualité 3e/4 · Notoriété 1re/4 » ; pour le prix, 1re = le moins cher) et se déplie sur les réglettes de la vue « Atelier », avec la mention que les prix des rivaux sont ceux du trimestre précédent. Sous la production, « Caler sur la demande (~59 lots) » règle la production sur la demande estimée au prix à l'écran, moins le stock, entre 0 et la capacité, et l'enregistre comme tout réglage ; la bulle ⓘ collée au bouton (atteignable au clavier) donne le calcul et rappelle que l'estimation suppose les prix des rivaux inchangés ; le bouton est grisé quand la production y est déjà, absent pour un produit en chantier.
- **Matières pour ce trimestre** (client, `CompanyMaterials`, sous les produits) : d'après les réglages enregistrés (avec l'enregistrement au relâcher, ceux à l'écran une fois le curseur lâché) et `commodityOutlook`, une ligne par matière qui manquera à la clôture : « Sucre : manque 24,5 lots — maintenant ≈ 1,0 M€ · à la clôture ≈ 1,1 M€ (urgence ×1,1) [Acheter 25 lots] ». Les contrats sont servis avant la production : les lots dus par contrat que le stock et l'extraction ne couvrent pas s'ajoutent au manque, et la ligne le dit (« Contrat : n lots non livrables → pénalité ») ; leur pénalité (cours × 1,1 moins le prix du contrat) plus la vente perdue revient au prix d'un achat d'urgence. Le bouton achète par l'achat ordinaire (`buyCommodity`, hausse du cours comprise) le manque arrondi au lot entier supérieur (le marché ne vend que des lots entiers ; le surplus reste en stock), borné par le plafond d'un ordre et par la trésorerie, ce que la ligne dit alors. Cette trésorerie est celle qui reste une fois mis de côté ce que la clôture prélève d'abord (§5.7, `closePlan`) : ses obligations (siège, coûts fixes, intérêts, impôt, amendes, achats sous contrat), dont le défaut est la faillite, puis les mises en cours ; l'achat d'urgence de la clôture, lui, ne se paie qu'après, avec le reste et les ventes. Acheter ne peut donc ni mettre la clôture en faillite ni priver une mise : « la trésorerie n'en paie que 12 lots en gardant 1,2 M€ pour la clôture » ; sans rien d'achetable, le bouton est grisé et la ligne le dit. La ligne donne aussi la trésorerie après l'achat. « Maintenant » est le coût de cet achat, « à la clôture » celui des mêmes lots en achat d'urgence ; le bouton n'est mis en avant que si maintenant coûte moins et que la clôture ne manque pas déjà d'argent (faillite ou manque annoncés par le bandeau) — dans ce cas, une ligne le dit au-dessus des matières. Les raisons d'un bouton non mis en avant ou d'un achat supérieur au manque (lots entiers) sont dans une bulle ⓘ à côté du bouton, atteignable au clavier. Rien n'est acheté sans clic. Un manque qui s'afficherait « 0,0 » (moins de 0,05 lot) n'a pas de ligne : la clôture l'achète pour presque rien. Sans manque ni lot de contrat non livrable : « ✓ Matières couvertes ». La règle est dans l'infobulle du titre ; à droite du titre, « Miser sur un gisement… » (la carte) et « Détail dans Matières » (l'onglet).
- **Bandeau « trésorerie de la clôture »** (client, `CloseBanner`) : en tête de l'onglet de l'entreprise, quand son plan de clôture (§5.7) annonce la faillite, un manque en fin de trimestre (ventes attendues comprises), ou qu'une mise en cours dépend de ventes qui peuvent décevoir (rien ne manque aux ventes attendues, mais il manquerait avec un écart type de moins : simple mise en garde). Il dit ce qui manque, la trésorerie, ce que la clôture paie en tête (obligations détaillées) puis, avec ce qui reste et les ventes attendues, dans l'ordre (mises, production, marketing et R&D), que les ventes sont une estimation (à environ un écart type près), ce qui arrivera si rien ne change (faillite, mises plafonnées, production réduite à n lots sur m, marketing et R&D réduits) et propose deux emprunts, intérêts en plus compris, bornés au plafond : « Emprunter X », juste ce qui manque (`ClosePlan.loan`), et « Avec une marge : Y » (`ClosePlan.safeLoan`), seul proposé pour la mise en garde (sinon il dit ce qui manquera encore, ou que les banques ne prêtent plus). Une pastille marque l'onglet tant qu'une de ses entreprises est dans ce cas. La carte d'une filiale en service dit combien de lots elle extraira à la clôture, et le tableau des matières compte l'extraction du plan.
- **Mode d'emploi** (client) : une fenêtre en trois parties, en français et en anglais, ouverte par l'aide « ? » de la barre du jeu, par un bouton de l'accueil et par un lien de l'encart « Comment jouer » du salon. « L'essentiel » reprend les dix lignes de « Comment jouer » ; dans une partie (ou un salon) sur le plateau, une onzième ligne résume le plateau (« 🗺️ Plateau : une usine par case ; lancer ou déménager, c’est miser sous pli sur une case libre, réglé à la clôture. ») et, dans la fenêtre, un lien « Pour aller plus loin › Le plateau » ouvre cette partie sur le sujet du plateau, déplié et focalisé ; « Onglet par onglet » dit en deux lignes ce que montre et permet chaque onglet de la partie ; « Pour aller plus loin » explique les coups plus rares, un sujet par encart dépliable (OPA et défense, fusion, dividende et bonus, trésorerie, emprunts et faillite, scandales et alertes, tuyaux, filiales, cessions et contrats, ententes, start-up, niveaux des bots, fin de partie) ; le sujet du plateau commence par un résumé de trois phrases (une usine par case, terrain de départ, mises sous pli réglées à la clôture, une mise perdue ne coûte rien, la fiche chiffre avant de miser), la règle complète suit. Des règles, jamais de conseils de stratégie. Les chiffres cités (seuils, coûts, plafonds) viennent des constantes du moteur (`client/src/guide.ts`) : pourcentages dans la langue du texte, montants dans la monnaie du salon. En partie, la fenêtre garde un seul bouton, « Revoir les premiers pas » / « Revisit the first steps » (« Rouvrir le guide » en partie guidée), qui réaffiche la checklist dépliée et l'amène à l'écran, qu'elle ait été fermée ou seulement repliée sur sa ligne.
- **Tractations et filiales** (client) : l'onglet « Tractations » commence par les trois formulaires de « Proposer une affaire » (actions de gré à gré avec la fourchette de ± 25 % du cours ; contrat de fourniture avec la fourchette de prix, étroite entre deux de ses entreprises ; entente, précédée de son avertissement), puis les offres reçues (avec Accepter / Décliner, et une pastille sur l'onglet tant qu'une offre attend) et les offres envoyées ce trimestre (avec Retirer, puis leur issue) ; tant qu'une offre reçue attend une réponse, les offres passent avant les formulaires. Sans offre reçue ni envoyée, une seule ligne le dit. Avant l'envoi d'un bloc d'actions, le formulaire valide ce que la vue permet de vérifier : contrepartie, nombre entier positif, fourchette de prix, titres disponibles après les blocages connus, interdiction de céder les titres de fondation ce trimestre et cash personnel en cas d'achat. Un refus local explique la cause près des champs et désigne les champs invalides ; un refus du serveur reste affiché pour le brouillon concerné. Une offre valide montre le total et le cash personnel après acceptation, avec la précision que paiement, transfert et disponibilité seront revérifiés à l'acceptation. Le contrat de fourniture nomme l'entreprise qui paie et celle qui encaisse, le paiement trimestriel, le total prévu sur la durée et la première clôture de livraison et paiement. Ces montants supposent des livraisons complètes et utilisent les trésoreries des entreprises. Avec un tiers, ils dépendent de l'acceptation avant la clôture ; entre deux de ses entreprises, « Créer le contrat » l'établit immédiatement, sans paiement personnel. Les contrats en cours (trimestres restants, dernière livraison) et les ententes (membres, risque de découverte à la prochaine clôture, bouton pour en sortir) n'apparaissent que s'il y en a. Dans l'onglet entreprise, la section « Filiales d'approvisionnement », présente seulement avec une filiale (même en sommeil ou en chantier) ou une mise en attente, est une liste compacte : chaque filiale (nom du gisement, matière, état — en service, en chantier ou en sommeil — et extraction prévue à la clôture) et chaque mise en attente (montant), avec un bouton « Voir sur la carte » qui ouvre la fiche du gisement sur « La carte » ; « Miser sur un gisement… » est dans le bloc « Matières pour ce trimestre » et les règles des enchères dans le mode d'emploi. L'enchère elle-même se prépare sur la carte (§12), dans la fiche du gisement : le coût d'extraction du moment face au cours (et, quand une news le change, son multiplicateur et le coût habituel), les besoins de l'entreprise, l'exploitant (« libre », « exploité par … »), puis, selon le cas : pour un gisement libre, la mise à prix, le remboursement estimé, un formulaire de mise (avec l'estimation de ce qu'on paiera), la mise en attente (avec un bouton Retirer) ou l'issue du dernier règlement (perdue avec le prix d'équilibre et le nombre de candidats, ou sans suite) ; pour une filiale possédée, son état (en service, en chantier, en sommeil avec son entretien), le prix de l'adjudication et les boutons Mettre en sommeil et Relancer, chacun derrière une confirmation. Sans emplacement libre, plus de mise possible. L'onglet « Matières » détaille, pour l'entreprise choisie, matière par matière et la plus demandée d'abord : le besoin de la production enregistrée (plafonnée à la capacité), le stock, ce qui arrive à la clôture avant la production (extraction des filiales en service, tant que la trésorerie la paie après marketing et R&D ; contrats reçus, moins les livraisons dues, dans la limite du stock et de l'extraction — cet ordre des opérations est dans l'infobulle de la colonne « À la clôture »), le manque (acheté d'urgence, avec son surcoût) et ce qui restera en stock ; ce stock n'est jamais vendu d'office (seuls les bots revendent le leur). Une matière sans besoin, stock, arrivée ni départ à la clôture, contrat en cours (même non livrable) ni filiale (même en sommeil) n'a pas de ligne : une ligne grise « Non utilisées : … » les nomme. Les cartes des matières (cours, courbe, stock et coût moyen, prix de base et plafond par ordre juste avant les formulaires d'achat et de vente) suivent le même ordre ; celles des matières non utilisées sont dans un volet fermé « Autres matières (n) », achat spéculatif compris, et les recettes par secteur dans un autre volet fermé. Cette répartition des cartes est prise à l'ouverture de l'onglet et tient jusqu'au trimestre suivant : un achat dans le volet ou la vente du dernier lot ne déplace pas la carte (le tableau, lui, suit le stock). Sous le tableau des besoins, « Couvrir les manques » reprend les achats immédiats de Gestion : manque calculé sur les réglages enregistrés, filiales et contrats, lots entiers, coût courant et coût d'urgence, réserve pour les obligations et mises de clôture, puis trésorerie après achat. Chaque achat reste un clic explicite, borné par ce qui peut être payé sans entamer cette réserve. Sans entreprise, toutes les cartes sont visibles.
- **Marchés** (client) : les secteurs où le joueur a un produit d'abord, en fiche complète (description, prix de référence, demande du dernier trimestre, conjoncture, marché de référence, estimation de lancement, courbe de la demande totale dès deux trimestres connus — « Pas encore de ventes » avant le premier —, parts de marché avec les prix affichés, coûts, matières par lot et sensibilité au prix). Les autres secteurs tiennent sur une ligne d'un tableau (prix de référence, demande, conjoncture, estimation de lancement ; sur ordinateur, colonnes de largeur fixe pour qu'une fiche dépliée ne les déplace pas) ; le bouton du nom déplie la fiche complète sous la ligne. La définition de la part de marché est dans l'infobulle de « Parts de marché », et une étiquette visible rappelle que les prix des rivaux sont ceux du trimestre précédent ; quand le joueur a une entente dans le secteur, elle ajoute que ceux des partenaires sont du trimestre en cours, et la barre de chaque partenaire le marque (« 🤝 ce trim. »). La sensibilité au prix est un mot (forte dès une élasticité-prix de 5, moyenne dès 3, faible en dessous), l'élasticité dans l'infobulle. Estimation de lancement : sur la carte classique, `launchEstimate` (« Si vous lanciez ici ») ; sur le plateau, où `launchEstimate` ne vaut que pour une case par défaut, la « Meilleure case libre » du secteur, calculée par le client sur `launchByHex` (`bestLaunchCell`, règle partagée avec l'occasion de lancement que signale la carte : rentabilisée avant la fin de la partie, terrain compris à sa mise à prix, puis le plus gros bénéfice, puis l'ordre du plateau ; cases portant une de ses mises en attente écartées), ou « aucune ne se rembourse d'ici la fin ». Quand une de ses entreprises a un emplacement libre, « Voir sur la carte » ouvre la carte sur cette case, formulaire de lancement prêt, pour l'entreprise choisie comme depuis la carte (la sélectionnée si elle a de la place, sinon la première qui en a) ; sinon la case est suivie de « (aucun emplacement libre) ». Une ligne dépliée laisse ce bouton à sa fiche.
- **Bourse** (client) : les statistiques personnelles restent dans la barre du jeu (cash perso, portefeuille, score et rang, dette perso quand il y en a une). En tête, le bouton de la start-up de retour en jeu quand le joueur n'a plus d'entreprise, puis un volet « Prêt personnel (effet de levier) · encore possible X », replié tant qu'il n'y a pas de dette et ouvert d'office sinon : le formulaire d'emprunt, et celui de remboursement seulement quand il y a une dette. Avec une dette, le titre du volet rappelle la dette, sa part des actions au cours et du cash positif, et le seuil de l'appel de marge (§6.4). « La cote » classe les entreprises actives par capitalisation, les plus grosses en tête, et les entreprises disparues à la fin. Les lignes du joueur restent à leur rang, repérées par un trait à gauche (rouge pour une entreprise qu'il dirige, noir pour une entreprise dont il détient seulement des actions) ; « Mes actions » donne le nombre, la part du capital et la valeur au cours. Le nom de chaque entreprise est un bouton natif, atteignable avec Tab et activable avec Entrée ou Espace, qui annonce si sa fiche est ouverte ; cliquer ailleurs sur la ligne ouvre aussi cette fiche. Une ouverture depuis la cote amène la fiche à l'écran et lui donne le focus ; sa fermeture revient au bouton de la même entreprise dans la cote. Un lien précis (alerte de participation, journal ou bilan) ouvre la bonne fiche et amène le bouton de sa ligne au milieu de l'écran, avec le focus. Sous 700 px, la cote conserve entreprise, cours, variation et part du capital détenue, avec « Voir la fiche » / « Fermer la fiche » visible ; les autres colonnes sont masquées dans la cote compacte et la fiche garde le détail de l'entreprise.
- **Bilan de clôture** (client) : à la première vue de chaque nouveau trimestre après une clôture, une fenêtre « Bilan de T3 2027 » / « Q3 2027 report » s'ouvre automatiquement. Aucune au T1 avant la première clôture, aucune pour les spectateurs. Comme toutes les fenêtres du jeu, son titre et son bouton de fermeture restent visibles pendant que seul le corps défile, y compris sur téléphone. Elle se ferme par son bouton, un clic sur le voile ou Échap, garde le focus dans la fenêtre puis le rend à son point d'ouverture. Quand une seconde fenêtre est ouverte au-dessus, seule celle du dessus répond à Échap et garde le focus ; la page reste verrouillée jusqu'à la fermeture de la dernière fenêtre. L'ouverture est mémorisée par salon et trimestre dans ce navigateur, y compris après un rechargement ; la case « Ne plus l'ouvrir automatiquement » / « Stop opening automatically » mémorise une préférence unique dans le navigateur. Si le stockage est indisponible, la fenêtre et son bouton fonctionnent toujours. Le bouton « Bilan T3 » / « Q3 report » de la barre du jeu la rouvre pendant tout le trimestre. Le bandeau sous la barre disparaît. Ouvrir la fenêtre coche l'étape « Lire le bilan » des premiers pas et de la partie guidée ; son bouton peut la rouvrir.

  Trois blocs compacts, en k€ ou k$ dans la langue du salon, présentent les chiffres arrêtés à la clôture, avant les nouvelles et actions des bots du trimestre suivant. **Votre fortune** : cash personnel avant → après ; portefeuille au cours avant → après, avec une ligne par entreprise détenue (quantités et cours, titres achetés ou vendus) ; dividendes et bonus reçus ; intérêts, tuyaux et alertes payés de sa poche ; prêt personnel avant → après ; valeur nette avant → après et variation. Les quatre lignes existantes expliquent exactement cette variation : cours sur les quantités de la référence précédente, dividendes et bonus, frais personnels et autres mouvements calculés comme le reste (achats et ventes, créations d'entreprises, aides, parachutes, conversions lors des fusions…). Emprunter ou rembourser du capital est neutre : cash et dette bougent ensemble. Les amendes des entreprises restent dans leurs comptes, pas dans les frais personnels. Cash, portefeuille, prêt et valeur nette avant et après s’affichent comme dans la barre du jeu (M€ au-delà d’un million) ; les variations, elles, restent au k entier. La variation affichée est la différence de ces deux valeurs nettes arrondies, et les quatre lignes de décomposition absorbent l’arrondi dans leur résidu pour s’additionner exactement à cette même variation (displayedFortuneBalances, displayedFortuneBreakdown). Une action absorbée ou en faillite vaut zéro ; les nouvelles actions de fusion entrent dans les autres mouvements. Les instantanés conservent positions, cours, dette et compteurs personnels ; la première clôture se compare au début de la partie. Une ancienne sauvegarde sans référence complète reste lisible : les soldes dont la référence manque montrent seulement leur valeur après la clôture, avec une note signalant que l’avant n’a pas été conservé ; les chiffres manquants ne sont pas inventés.

  **Vos entreprises** : toutes celles que le joueur dirigeait à l'arrêté des comptes, sans limite de trois faits. Chaque produit donne lots vendus / demande, prix moyen, chiffre d'affaires, marge, stock restant et lots périmés ; suivent bénéfice net, amendes avec leur cause, tentatives d'OPA, scandale et réputation avant → après, cours avant → après. Chaque amende distingue un scandale découvert d’une entente découverte, avec le secteur éventuel et les effets réellement enregistrés ; les actions discutables du trimestre donnent le contexte, sans les présenter comme la cause certaine d’un scandale accumulé. Ces détails privés ne sortent que vers le dirigeant concerné ; les faits publics du journal peuvent être repris. Les chiffres et noms restent figés ; si le joueur a ensuite perdu le contrôle, les détails privés des produits, la jauge de scandale et les actions discutables sont retirés de sa vue, tandis que les rapports financiers et causes publiques d’amendes restent consultables. **Ce qui s'est réglé** : toutes les mises du joueur réglées à cette clôture, sur le plateau comme sur les gisements, avec leur issue (remportée, perdue, repli, abandonnée, tombée et raison disponible), la case obtenue, ce qui est payé, le prix d'adjudication public et les candidats ; offres acceptées, refusées ou expirées, contrats livrés ou manqués avec leurs dédits, OPA et fusions impliquant le joueur. Les mises sont lues dans sa seule vue privée ; une offre d'un autre joueur ne dévoile aucun secret. Un trimestre calme le dit brièvement dans chaque bloc ; sans entreprise, « Pas d'entreprise ce trimestre » / « No company this quarter » garde la fortune visible. Les liens vers une fiche produit encore dirigé, une ligne de Bourse, une case ou un gisement sur la carte, ou Tractations ferment le bilan avant de naviguer. Le rapport d'une entreprise s'ouvre, lui, dans une seconde fenêtre au-dessus du bilan : « Retour au bilan », la fermeture ou Échap rendent le bilan à sa position de défilement et à son bouton d'ouverture du rapport. Ses comptes privilégient l'instantané de clôture, même si une fusion ultérieure a réécrit les comptes publics. Le moteur enregistre `PlayerState.closeRecap` après cours, appels de marge et historiques ; seul `self.closeRecap` du joueur concerné est transmis. Ces données d'affichage ne changent ni l'économie ni les tirages de la simulation.
- **Première partie guidée** : un bouton de l'accueil crée un salon puis le prépare : huit trimestres, sans chrono, carte classique, secteur des boissons énergisantes et deux bots stagiaires (le débutant y est seul sur son marché : une étude de 3 000 parties simulées l'y trouve le plus à l'aise ; l'un des stagiaires prend les yaourts). Le guide est activé dès que le salon existe. Si une étape de la préparation échoue, un seul message dit quelles parties n'ont pas pu être préparées (règles, secteur, bots) et le salon reste ouvert, guide actif ; si le joueur quitte le salon pendant la préparation, celle-ci s'arrête sans rien afficher. Pendant la préparation, seules les commandes de ce salon sont verrouillées (règles, secteur, bots, bouton Lancer) ; ensuite tout reste modifiable et la partie démarre seulement par le bouton normal du salon. La checklist accompagne les deux premiers trimestres : lire le journal (coché après trois secondes de lecture), ouvrir l'usine, comparer offre et demande, changer un réglage (enregistré au relâcher du curseur), examiner les matières, puis être prêt ; au deuxième trimestre, lire le bilan, comparer l'estimation mémorisée aux ventes réalisées (tableau prévision contre réel intégré à la checklist), ajuster la production (changer le seul prix ne suffit pas) et découvrir la Bourse et le lancement. Les étapes de visite ne se cochent que lorsque le joueur ouvre réellement l'onglet ; aucun réglage de jeu n'est appliqué à sa place et la simulation ignore la checklist. Les félicitations n'apparaissent qu'une fois par salon. Les estimations restent indicatives et utilisent les prix connus des rivaux. Le guide se ferme, se rouvre depuis l'aide et reprend sa progression du salon après reconnexion dans le même navigateur.
- **« Vos premiers pas »** (client, `tutorial.ts`, `TutorialChecklist`) : hors partie guidée, une seule liste au-dessus de chaque onglet, cochée d'après la vue et quelques marques locales (`muchomoney:tutorial`, jamais envoyées au serveur ; la simulation l'ignore). Sur la carte classique, cinq étapes : lire la une, régler prix et production d'un produit, vérifier les matières, jeter un œil à la Bourse, cliquer « Je suis prêt ». Sur le plateau, la liste est échelonnée par trimestre : au premier, lire la une, régler un produit, vérifier les matières, « Retrouver votre usine et votre terrain », « Je suis prêt » ; après la première clôture s'ajoutent, les coches du premier trimestre restant acquises, « Lire le bilan de clôture », « Comparer une case libre », « Préparer un lancement ou un déménagement (facultatif) » et « Jeter un œil à la Bourse ». Une marque posée plus tôt (une case libre déjà comparée au premier trimestre) coche d'avance l'étape qui arrive. Ce qui coche : la une après trois secondes de lecture ; un réglage enregistré, ou « Garder ces réglages » / « Keep these settings », qui ne fait que poser la marque (aucune action serveur) ; les matières quand l'onglet est ouvert par le joueur ou que rien ne manque ; « Je suis prêt » au premier clic, marque gardée ensuite (l'étape ne se décoche plus quand le statut est remis à zéro au trimestre suivant) ; sa case quand le joueur sélectionne une de ses usines sur le plateau ; une case libre quand il sélectionne une case constructible libre ; l'étape facultative quand un formulaire de lancement ou de déménagement s'ouvre sur la carte — rien n'est jamais misé ni envoyé ; la Bourse à l'ouverture de l'onglet ; le bilan dès l’ouverture de sa fenêtre. Les boutons des étapes du plateau sélectionnent sur « La carte » sa propre usine ou la meilleure case libre (celle de « Aller à › Meilleure case » pour la référence chiffrée par la carte ; ce qui vaut sélection) — sur place, sans rien réinitialiser, quand la carte est déjà affichée —, ou l'ouvrent sur un formulaire de lancement prêt, sur la meilleure case du secteur de son premier produit (de déménagement si aucune entreprise n'a d'emplacement libre), sans l'envoyer. Une étape est sans objet (comptée comme faite) sans entreprise, sans usine sur une case (start-up à l'incubateur) ou sans case libre. L'étape facultative n'est ni comptée dans la progression ni exigée pour finir. Pliage : la liste est dépliée sur le journal au premier trimestre et, sur le plateau, à la première vue après l'arrivée des étapes du deuxième trimestre (jusqu'au changement d'onglet) ; ailleurs, elle tient sur une ligne : titre, progression, « Prochaine étape : … » et le bouton de cette étape, puis ▸ et ✕ (repliée, elle prend toute la largeur de la page, pour tenir sur une ligne dès 1280 px ; rouverte depuis l'aide, elle s'arrête sous la barre du jeu et les onglets collants). Le pliage choisi par le joueur tient d'un onglet à l'autre. Sur le plateau, une étape faite se réduit à son libellé. Chaque étape dit aux lecteurs d'écran si elle est faite (« · fait » / « · à faire », en anglais « · done » / « · to do » ; ✓ et ○ sont décoratifs). Quand un bouton de la liste coche son étape et disparaît avec elle (« Garder ces réglages », sa case ou une case libre sélectionnée sur la carte déjà affichée), le focus passe au bouton de l'étape suivante, à défaut au bouton de pliage, au lieu de retomber sur la page. Tout coché (le requis), la liste reste jusqu'à la fin du trimestre avec ses félicitations (un toast, une fois par partie), puis s'efface ; la liste du plateau ne peut finir qu'au deuxième trimestre (au premier, « Trimestre 1 en ordre. La suite arrive après la clôture. »). Dans tous les cas, elle prend sa retraite à la clôture du deuxième trimestre, quoi qu'il reste. Une liste finie ne revient pas d'elle-même dans les parties suivantes ; celle du plateau et la classique sont tenues à part. ✕ la ferme ; l'aide « ? » la rouvre, dépliée et amenée à l'écran, sans effacer les coches, y compris après sa retraite (pour ce salon seulement). La liste du plateau n'existe pas sur la carte classique. L'ancienne « Découverte du plateau » (carte d'étapes séparée sur « La carte ») n'existe plus : ses repères utiles sont dans cette liste, et ses notes d'une fois sur les fiches des cases sont gardées (« Le plateau à l’écran », plus bas).
- **Barre du jeu** (client, `TopBar.tsx`, `topBarAlerts.ts`) : collée en haut de la page, elle donne la date, le chrono, le cash perso, le portefeuille, la dette perso seulement quand il y en a une (son infobulle donne la dette rapportée aux actions au cours et au cash positif, face au seuil de l'appel de marge, §6.4) et le score : la valeur nette suivie du rang dans le salon (« 21,5 M€ · 3e/3 », « $21.5M · 3rd/3 », ordinaux de chaque langue), un bouton qui ouvre le Classement. Une puce montre l'alerte prioritaire parmi les entreprises dirigées : faillite prévue par le plan de clôture (`private.closePlan`, §5.7), manque d'argent prévu, participation d'un rival d'au moins 20 % (de la plus grosse à la plus petite), puis scandale au moins « moyen ». Elle reste courte (260 px au plus) ; son infobulle et son nom accessible donnent la phrase entière, avec l'entreprise concernée. Le clic direct est conservé pour cette alerte prioritaire. S'il y en a plusieurs, un bouton « +n » distinct ouvre la liste complète, dans le même ordre : chaque ligne nomme l'entreprise, décrit le risque et ouvre sa propre destination. Faillite ou manque mènent au bandeau de clôture dans Gestion ; participation, à la ligne Bourse de cette entreprise ; scandale, à ses actions discutables. La liste se ferme avant la navigation ; les destinations prennent le focus et restent visibles sous les barres collantes. Toutes les alertes sont donc consultables et actionnables au clavier comme au toucher, sans dépendre d'une infobulle. Elles utilisent seulement les données publiques ou celles du joueur. Quand le plan de clôture prévoit la faillite d'une de ses entreprises, « Je suis prêt » demande d'abord confirmation (« Voir », « Annuler », « Être prêt quand même ») ; annuler « Prêt » ne demande rien.
- **Barre d'onglets** (client, `GameScreen.tsx`, ordre dans `guide.ts`) : huit entrées principales aux libellés courts — « 📰 Journal » (le papier conserve *Le Capital Quotidien* dans ses pages), « 🏢 Mon entreprise » (« Mes entreprises (n) » à plusieurs), « 🗺️ La carte », « 🛢️ Matières », « 📈 Bourse », « 🛒 Marchés », « 🤝 Tractations », « 🏆 Classement » ; en anglais « 📰 The paper », « 🏢 My company », « 🗺️ The map », « 🛢️ Commodities », « 📈 Stocks », « 🛒 Markets », « 🤝 Deals », « 🏆 Leaderboard ». Sur la carte classique : Journal, Mon entreprise, La carte, Bourse, Matières, Marchés, Tractations, Classement ; sur le plateau : Journal, Mon entreprise, La carte, Matières, Bourse, Marchés, Tractations, Classement. « Mon entreprise » réunit deux vues secondaires, **Gestion / Atelier** (**Management / Workshop**) : produits, trésorerie et décisions d'un côté, représentation des usines, clients et chantiers de l'autre. Le dernier choix est conservé pendant la visite ; les liens précis vers une gestion ou une usine ouvrent directement la bonne vue. Les identifiants internes `company` et `factories` restent distincts, mais les deux sélectionnent « Mon entreprise » dans la barre principale. Le mode d'emploi présente aussi Atelier comme une vue de l'entreprise. Chaque barre utilise de vrais onglets avec un seul arrêt de tabulation : ← et → changent d'onglet, Début et Fin atteignent les extrémités ; l'onglet actif défile horizontalement dans sa barre si nécessaire. Une première visite commence en haut ; les retours par la barre restaurent la position propre à chaque vue. Les liens vers une décision ou une entreprise conservent leur arrivée et leur focus précis. Dès 1280 px, les huit entrées tiennent sur une ligne. La barre principale reste collée sous la barre du jeu ; sa hauteur mesurée (`--tabs-h`) entre dans les positions collantes et les marges de défilement des cartes et formulaires. Sous 700 px, les onglets en grille ne collent pas et comptent pour zéro.
- **Contexte de lecture** : les retours ordinaires entre onglets conservent aussi le numéro du Journal, le trimestre de la chronologie et la fiche Bourse consultés, avec leur position de lecture. L’édition du jour suit les nouvelles parutions ; une archive choisie reste sur son numéro. La chronologie suit le trimestre courant tant qu’aucun autre trimestre n’a été choisi ; sélectionner de nouveau le trimestre courant reprend ce suivi. Lire une archive ne retire pas la pastille signalant une nouvelle édition. Un lien vers un numéro, un trimestre ou une entreprise impose sa destination et son focus. Ce contexte vit uniquement pendant la visite et se réinitialise pour un autre salon ou joueur ; une cible disparue est oubliée.
- **Atelier (bêta)** (client, `FactoriesTab`) : vue secondaire de « Mon entreprise », avec les mêmes chiffres et décisions que Gestion (client seul, aucune règle économique nouvelle). Le produit sélectionné reste le même quand on passe à la carte et revient. Chaque scène 2D représente une usine ; dans un réseau, plusieurs scènes peuvent fabriquer le même produit commercial. Chaque élément traduit un chiffre :
  - centre de R&D : taille = qualité ; chercheurs aux fenêtres = budget R&D du trimestre, un par tranche de 0,5 % de la taille du marché (6 au plus) ;
  - usine : un niveau par palier de capacité (0,8 / 1,1 / 1,35 / 1,65 / 2 / 2,5 / 3,2 × la capacité de départ du secteur ; une ligne neuve est au niveau 2) ; fumée et caisses qui sortent = production prévue ; grue et halle en pointillés = capacité en chantier ; palissade = produit lancé ce trimestre ;
  - cour : caisses = stock ; boutique : étiquette = prix ; passants = demande estimée (§12, aides de lecture), un « ! » pour la demande non servie ;
  - panneaux : taille = notoriété ; projecteurs = budget marketing du trimestre ; toits verts = greenwashing en cours.

  L'en-tête donne la trésorerie, les produits commerciaux et leur limite, le nombre d'usines et les chantiers en cours. Les projets de nouveau produit en attente sont compris dans la limite et leur nombre est précisé. La légende « Comment lire la scène » reste repliée par défaut ; son ouverture est mémorisée. Une seule carte de construction distingue les nouveaux produits encore possibles des usines physiques. En réseau, atteindre la limite de produits laisse la possibilité de construire d'autres usines pour un produit existant : « Construire une usine » ouvre alors la carte sur le premier produit actuel de cette entreprise et son formulaire de construction, avec une case chiffrée pour ce produit ; une référence périmée ou appartenant à une autre entreprise n'est pas transformée en lancement. Avec de la place pour un produit, le bouton prépare un nouveau lancement. Les coûts affichés excluent le terrain. Sur un terrain détenu, la construction est payée immédiatement ; sur une case libre, terrain et construction sont attribués et payés à la clôture ; l'usine ouvre au trimestre suivant. Le classique garde son lancement payé immédiatement, les anciens plateaux leur lancement attribué à la clôture. Hors réseau, la limite atteinte est décrite comme une limite de produits, pas comme une pénurie de terrains.

  Dessous, des pictogrammes sur une même échelle (1 icône = 1, 2, 5, 10… lots, 20 icônes au plus) comparent l'offre (stock + production plafonnée à la capacité) et la demande estimée ; au-delà de 5 % d'écart (au moins un lot), le terrain affiche « Rupture » ou « Invendus », avec la part d'invendus perdue à la péremption. Suivent des réglettes face aux produits du secteur (notoriété et qualité, avant et après le trimestre ; prix) et une foule de 20 clients (parts de marché du dernier trimestre). Les réglages passent par la même fiche produit que Gestion (décisions, agrandissement) ; le bouton de construction et, lorsqu'il est proposé, « Déménager » renvoient sur « La carte », où la décision se prend (§12). Les animations s'arrêtent si le système demande moins de mouvement, ou d'un clic (« Figer la scène »).
- **La carte** : onglet directement accessible « 🗺️ La carte » : le pays de §5.8 vu d'en haut, pour tous les joueurs, sans règle nouvelle (client seul, `screens/game/city/MapView.tsx`, modèle pur `mapModel.ts`). C'est aussi le seul endroit où se prennent les décisions géographiques — lancement, déménagement, enchères des gisements —, dans la fiche du panneau latéral, pour l'entreprise « aux manettes » (§12, « La carte comme sélecteur »). Chez soi : tout ; chez les autres : leurs données publiques (zones des usines, filiales, joueurs qui les dirigent), jamais leurs décisions de production. De haut en bas :
  - sur la carte classique, trois panneaux de constats chiffrés (pas des conseils) : « Vous » (rang, valeur nette, variation depuis la clôture, verdicts de ses produits ; ouvre la fiche du joueur), « Menace » (plus grosse participation d'un autre joueur, à partir de 20 %, dans une de ses entreprises ; sinon sa jauge de scandale si elle atteint 30), « Occasion » (lancement le plus vite rentabilisé s'il reste un emplacement et le temps de l'amortir ; son bouton ouvre la fiche de la zone conseillée, le formulaire de lancement prêt ; sinon une matière qu'on utilise à 85 % ou moins de son prix de base). Le plateau hexagonal n'a pas ces panneaux : le rang est dans le score de la barre du jeu, les menaces dans sa puce d'alerte (visible depuis tous les onglets) et l'occasion devient la « Piste » des outils du plateau (colonne de gauche dès 1200 px, où elle vaut pour l'entreprise aux manettes ; barre d’une ligne en dessous), même règle que la « Meilleure case libre » de l'onglet Marchés (`bestLaunchCell`) appliquée aux cinq secteurs (voir « Le plateau à l'écran ») ;
  - deux lentilles : « Qui possède quoi » (usines aux couleurs du joueur qui les dirige, la sienne cerclée ; filtre « Tout le salon | Mes affaires ») et « Ce que vaut chaque zone » (pour un de ses produits, ou une usine nouvelle d'un secteur : chaque zone en vert ou en rouge selon l'écart de coût unitaire estimé avec la zone de référence) ;
  - une barre compacte nomme l’entreprise « aux manettes » et sa trésorerie (distincte de l’argent personnel du bandeau supérieur), puis le « Produit suivi » commun aux lentilles, aux estimations de la fiche et aux calques de flux ; « Comparer avec un autre produit » permet de séparer explicitement la référence de la lentille, les deux références restant nommées ;
  - la carte, large : mer, côte, lac, fleuve, montagnes, routes (autoroutes, nationales, route de montagne, pipelines), villes (disque selon leur part de clients), zones de la plaine et de la montagne, gisements (pictogramme de la matière, en pointillés s'ils sont libres, pastille de l'exploitant), usines groupées par zone, port et bourse à la capitale (ils ouvrent les matières premières et la bourse). Tant qu'aucun calque de flux n'est allumé, ses propres approvisionnements sont tracés le long des routes, avec le prix du lot livré (coût d'extraction ou prix du marché, plus le trajet, au multiplicateur des news du transport du trimestre, `PlayerView.transportFactor`) ; un calque allumé remplace ces routes et dessine les sources possibles de matières ou les ventes réalisées du produit choisi, suivant les itinéraires du moteur ;
  - sur ordinateur, la carte classique occupe toute la largeur laissée par la fiche et tient, sans perdre ses proportions, dans la hauteur de la fenêtre sous le bandeau fixe, les onglets collés dessous et sa barre d’outils : tout le pays reste visible à 1440 × 900, sans zoom ni déplacement du dessin ; le plateau hexagonal tient dans un cadre ajusté à l'écran, avec son zoom, entre la colonne de ses outils et la fiche (voir « Le plateau à l’écran ») ; les panneaux « Vous », « Menace » et « Occasion » (carte classique), le récapitulatif et la checklist (une ligne, hors journal au premier trimestre et première vue du deuxième trimestre, où elle se déplie jusqu'au changement d'onglet) restent compacts au-dessus. À l’arrivée sans intention, la page amène la barre d’outils (sur le plateau en trois colonnes, les colonnes et le cadre) sous le bandeau fixe et les onglets, puis, si le lieu sélectionné d’office (sa propre usine) sort de l’écran, défile juste assez pour le montrer (sur le plateau zoomé, c'est le cadre qui défile) : la fiche ne décrit jamais une case hors de vue ; une intention conserve la priorité au formulaire demandé. Les sélections ordinaires amènent le formulaire dans la fiche défilante sans faire disparaître le pays ;
  - à droite, une fiche contextuelle du lieu touché (dans une fenêtre en largeur limitée), avec le nom, l’état et les chiffres essentiels avant les actions ; les explications longues et la légende se déplient à la demande. « Replier la fiche » ou Échap depuis la fiche la réduit à une mince bande, qui rend sa largeur à la carte ; une nouvelle sélection la rouvre. Ce repli n’est pas mémorisé entre visites. Au besoin, la page défile pour garder le lieu sélectionné visible, sans déplacer la carte elle-même : pour une zone, sa part des clients, sa route jusqu'au port, ses spécialités de main-d'œuvre, ses usines (« Déménager ici » pour les siennes, avec le coût estimé — le formulaire chiffré du déménagement s'affiche dans la fiche, avec un retour à celle-ci), l'écart de coût avec la capitale secteur par secteur, et une section « Lancer ici » avec le formulaire de lancement ; pour un gisement, sa matière, sa richesse, son exploitant ou « libre », le prix livré à ses usines qui peuvent s'en servir, puis le panneau complet de l'emplacement (enchère, retrait de la mise, sommeil et relance d'une filiale possédée, dernier résultat). Quand le joueur dirige plusieurs entreprises, la barre d’outils permet de changer celle « aux manettes » — celle qui lance, déménage et mise —, même avec la fiche repliée ;
  - dessous, le carnet en trois colonnes : « Mon réseau » (chaque matière de chaque usine et d'où elle vient, puis les gisements libres sur lesquels on peut miser, du moins cher livré au plus cher), « Zones », « Gisements » (par matière, du plus riche au plus pauvre) ;
  - le port : prix de chaque matière rapporté à son prix de base, son stock de matières, taux d'intérêt, impôt, moral des marchés et rumeurs du numéro (jamais rattachées à une entreprise).

  Confidentialité : un seul module lit les données privées, et seulement quand la vue les contient (entreprises que l'on dirige) ; les rivaux n'apparaissent qu'avec leurs données publiques. Les animations s'arrêtent si le système demande moins de mouvement, ou d'un clic (« Figer la scène », panneaux compris).
- **Calques de lecture des flux** (cartes classique et hexagonale, `city/mapFlows.ts`, `MapFlowControls`, `MapFlowLayer`, `MapFlowDetail`) : trois vues sans nouvelle décision économique, précédées d'un mode « Aucun » choisi par défaut sur les deux cartes, qui leur rend exactement leur aspect sans les calques (sur la carte classique, les routes d'approvisionnement et le prix du lot livré). Un seul sélecteur « Produit suivi » propose ses produits et les options « Nouvelle usine de <secteur> » : il pilote par défaut les couleurs de la lentille, les estimations de la fiche et les flux. Une référence de lancement n’a pas de flux actuels : le panneau explique qu’il faut sélectionner un de ses produits et ne dessine aucun flux. L’option « Comparer avec un autre produit » active un second sélecteur explicite : les flux gardent le produit suivi et la lentille ainsi que les estimations utilisent la référence comparée, toutes deux nommées à l’écran. Sur le plateau, la palette d’icônes choisit l’activité à poser et les calques vivent dans « Flux » (un pli de la colonne de gauche dès 1200 px de large, dont le titre nomme le calque allumé ; un menu de la barre d’une ligne en dessous), avec « Chiffres », « Concurrents » et la comparaison, renommée « Colorer selon un autre produit » ; le détail du calque pour le produit suivi s'affiche dans sa carte de « Mes usines » dès 1200 px (sans son titre ni son bouton « Mes usines », que la carte porte déjà, et rien de plus en production), sous le plateau en dessous (voir « Le plateau à l’écran »). Dans l’onglet Carte du plateau, un clic simple ou Entrée choisit la case d’origine pour l’activité courante ; le survol ou le focus d’une autre case lit ses chiffres de livraison sans changer cette origine. Un glisser-déposer place directement le profil choisi, sans fenêtre de choix ni double clic, même avec les flux éteints. Le scénario théorique et les flux aux emplacements réels sont nommés séparément. Les raccourcis explicites de navigation vers ses usines continuent à suivre leur produit. Le mode de comparaison, le calque et les cases « Chiffres » et « Concurrents » ne sont pas mémorisés d’une visite à l’autre ; le produit suit la sélection partagée avec « Atelier » :
  - « Production » montre la production prévue plafonnée à la capacité, le stock et la demande estimée du produit sélectionné. Le surplus est estimé avant péremption. Les chiffres actuels n'existent que pour les entreprises contrôlées ; les rivaux restent publics. Les anneaux de production entourent les icônes d'usine sur la carte classique (celle de l'usine suivie plus épais, les rivales estompées) et se posent au centre de la case ou de l'îlot sur le plateau. Les chiffres peuvent être masqués et les concurrents estompés ; leurs étiquettes ne recouvrent ni une icône d'usine ni le nom d'une ville. Les quantités s'accordent (« 0,5 lot », « 3 lots »). Les polygones du plateau restent ceux de `HexBoard`.
  - « Approvisionnement » donne les besoins prévus du produit, puis les besoins, le stock partagé et le manque prévu au niveau de l'entreprise. Les contrats sont supposés livrés entièrement pour cette prévision et le financement peut limiter la production. Les flèches pointillées sont des **sources possibles**, sans quantité attribuée à un trajet ni provenance historique du stock : les filiales en service, parcourues dans l'ordre du moteur et amputées d'abord de ce qu'elles réservent à leurs contrats sortants, puis le port seulement pour ce qu'elles laissent à découvert. Une activité immatérielle ne dessine aucun trajet physique (les sources restent listées au détail).
  - « Ventes » donne les quantités réalisées `lastSalesByCity`, avec flèches vers leurs villes. L'origine publique optionnelle `lastSalesOrigin` (`turn`, `zoneId` — le bassin de la case en mode hexagonal —, `hexId` en mode hexagonal) est figée au calcul des ventes, avant un déménagement adjugé à cette clôture, puis copiée dans la vue. Une ancienne sauvegarde sans cette origine conserve ses chiffres mais ne dessine pas de trajet historique ; une vente nationale sans ventilation ne reçoit pas de destination locale inventée. Un produit immatériel (crypto) n'a pas de trajet : ses ventes par ville s'affichent directement aux villes clientes. Ce calque n'est pas une décomposition de la facture de livraison, qui continue à utiliser son mélange de référence (§5.8).
  - Les itinéraires suivent `roadRoute.points` en classique et `hexTransportRoute` en hexagonal : route ancrée, piste retenue vers le réseau, puis routes existantes. Le bac reprend ses 325 km forfaitaires et son raccord maritime est explicitement indicatif. Les pointes sont uniquement à l'arrivée. Le détail fournit des accès directs à l'usine précise, aux matières premières et au rapport de son entreprise. Aucune donnée d'affichage ne change les coûts, les ventes ou le RNG.
- **La carte comme sélecteur** (client seul, données issues de `PlayerView`) : toute décision géographique se prend sur « La carte » : dans la fiche du panneau latéral en classique, dans le bandeau d’activité au-dessus du plateau hexagonal. Aucune carte n’est imbriquée dans une modale ni aucun sélecteur séparé. Depuis « Mon entreprise » (« + Lancer un produit (choisir l'emplacement sur la carte) » dans le titre des produits, « Voir sur la carte » d'une filiale ou d'une mise, « Miser sur un gisement… » du bloc des matières, « Déménager » d'une fiche produit), « Atelier » (lancement, « Déménager » lorsque les règles le permettent), « Marchés » (« Voir sur la carte » de la meilleure case libre d'un secteur, sur le plateau) et le panneau « Occasion » (carte classique), une intention à usage unique (`MapIntent` dans `GameScreen.tsx`, effacée en quittant l'onglet) sélectionne l'entreprise et le produit concernés, puis ouvre la carte sur la bonne fiche : un lancement ouvre la zone (ou la case) de l'intention, sinon la plus rentable du secteur, avec le formulaire de lancement ; en réseau, l'option `existingProductId` prépare à la place une usine du produit existant, vérifié dans l'entreprise contrôlée concernée, et chiffre sa destination parmi les cases libres ou les terrains vacants de cette entreprise (la destination explicitement demandée est conservée si elle est admissible) ; un déménagement ouvre la meilleure autre zone du produit — sa zone actuelle à défaut — sur la carte classique, la meilleure case libre (`bestMoveHex`) sur le plateau, avec le formulaire de déménagement ; un gisement ouvre l'emplacement de l'intention, sinon un gisement libre et pas encore misé de la matière la plus demandée que l'entreprise n'exploite pas encore (`biddableDepositSlot`, même règle sur les deux cartes), avec le panneau de la filiale. « Voir sur la carte » d'une mise du bilan de clôture pose une intention qui montre seulement une case du plateau (la case obtenue, sinon la case visée), sans formulaire, chiffrée pour son produit quand il y est ; l'onglet arrive alors comme une visite simple. L’entrée « Gisements et filiales » du menu « Aller à » du plateau (dès 1200 px, l’entrée « Gisement de … » du pli du même nom de la colonne de gauche) montre, elle, la filiale de la matière la plus demandée, ou à défaut son meilleur gisement. Sur le plateau, le formulaire de lancement fait suivre au plateau le secteur choisi, pour que la fiche de la case chiffre bien ce lancement. L'entreprise « aux manettes » est celle qui agit dans ces formulaires : l'entreprise choisie si le joueur la dirige, sinon sa première ; la barre d’outils la nomme et affiche sa trésorerie ; quand il en dirige plusieurs, une pastille par entreprise permet d’en changer d’un clic, même avec la fiche repliée. Les formulaires (lancement, déménagement, enchère) gardent leurs aides chiffrées — marges et coûts estimés zone par zone ou case par case, remboursement, mise à prix — calculées par les mêmes modèles purs (`launchPickerModel`, `movePickerModel`, `sitesPickerModel`). Le formulaire de déménagement affiche la marge sur les lots effectivement comptés (demande plafonnée par capacité, capacité en chantier et stock), les coûts par lot (main-d'œuvre — nouvelles, délocalisation et pression salariale réelle comprises —, matières au coût moyen du stock puis en achat d'urgence, transport), les ventes estimées par ville comparées à la même estimation depuis la zone actuelle, et les usines propres et concurrentes ; son remboursement compte la clôture courante, celui d'une filiale remportée commence au trimestre suivant. Sur la carte classique, « Déménager ici » montre le formulaire dans la fiche de la zone, avec un retour à celle-ci ; sur le plateau, le formulaire s’affiche dans le bandeau au-dessus de la carte, tandis que la fiche reste consacrée aux informations, et le « Déménager » de la fiche produit (ouverte depuis la fiche de sa case) met le plateau en mode déménagement (la destination se choisit sur le plateau), comme « Chercher où déménager » sur la fiche de sa propre usine, qui sélectionne d’emblée la meilleure case libre (`bestMoveHex`). En largeur limitée, la fiche passe en fenêtre modale, sans carte imbriquée.
- **Course aux trophées** (client seul, `screens/game/trophyRace.ts`, aucune donnée ni règle nouvelle) : pendant la partie (`view.phase === 'playing'`), sous le tableau de l'onglet « Classement », une bande compacte « Trophées en jeu » suit les titres du §11 en direct : pour chacun, l'emoji, le titre, le meneur et sa valeur, et « talonné par X (v) » quand le titre est contesté. Sont montrés les trophées contestés — le second atteint au moins 80 % du meneur, seuil inclusif — et ceux que vous menez, même sans rival. Deux exclusions : « magnat » (c'est le tableau lui-même) et « machiavel » (les `shadyActions` des autres joueurs sont masquées à 0 dans les vues, cf. plus haut). Meneur et second se calculent exactement comme dans `computeResults` : parcours dans l'ordre du classement par valeur nette, à stat égale le mieux classé l'emporte (puis, à valeur nette égale, le plus petit identifiant), et un zéro ne mène jamais. Quand vous prenez ou perdez une tête, un toast `info` (tag `trophyLead:<trophée>`, pour que deux titres basculant ensemble aient chacun leur toast) le signale. L'écran de fin est inchangé.
- **Courbes consultables** (client, `LineChart`) : les graphiques autonomes de cours et de demande gardent le survol et ajoutent un volet « Explorer les valeurs ». Il contient un curseur de période utilisable au clavier (date et valeurs annoncées) et un tableau des valeurs par période et par série, lisible sans pointer une courbe. Une série trop courte laisse un tiret pour les points absents. La chronologie des fortunes conserve sa navigation dédiée et ne reçoit pas ce second contrôle.
- **Chronologie** (client, `screens/game/timeline/`, sans règle nouvelle) : tirée des événements structurés de tous les numéros (§9). Elle vit dans l'onglet « Classement », sous le tableau, en section « Fortunes et infortunes » (note à droite du titre : « T8/16 · dernier point en direct ») : une ligne d'aide (« Chaque courbe est une fortune, chaque pastille le coup qui l'a fait bouger. Touchez un trimestre pour le détail. »), une pastille de légende par joueur (trait de sa couleur et son nom, « (vous) » pour soi), puis, alignés sur une même colonne par trimestre, le graphique des fortunes, la frise, les filtres et le détail du trimestre.
  - **Graphique des fortunes** : échelle en bandes sur toute la partie (`slots = max(totalTurns, tour en cours)`, le point du trimestre q au centre de sa colonne), courbes du T1 au tour en cours, dernier segment — la valeur en direct — en pointillés avec un point creux. Les trimestres à venir sont hachurés (45°) derrière une règle verticale en pointillés « Maintenant » ; sur ordinateur seulement, et seulement quand la légende tient dans la zone (largeur du texte estimée, marge comprise — environ 320 px pour la légende française la plus longue), une légende en italiques compte à rebours (« Encore 8 trimestres avant le parachute doré. ») ; sinon elle est masquée, pour ne jamais déborder sur la règle « Maintenant », sur les points en direct ni hors du graphique. Quand la zone à venir fait moins de 80 px, l'étiquette « Maintenant » passe à gauche de la règle : elle ne sort jamais du graphique. Au dernier trimestre, plus de zone hachurée ni de règle « Maintenant » : « Dernier trimestre : remplissez vos poches. » s'affiche en italiques au bout de la ligne d'aide, aussi sur téléphone. Un filet très léger sépare les années (entre T4 et T1), traversant graphique et frise. Pas de dates sous l'axe (la frise les porte). Le survol d'une colonne la souligne d'un bandeau visible, plus clair que celui de la sélection ; le trimestre choisi est un bandeau `--paper-2` bordé d'un filet de chaque côté, continu du haut du graphique au bas de la frise, sans interstice.
  - **Frise**, collée sous le graphique, mêmes colonnes et mêmes marges : par trimestre passé, au plus 3 pictogrammes (ceux qui vous concernent d'abord, cerclés de votre couleur, puis les plus importants ; « +n » pour le reste), chacun avec un point de 7 px dans la couleur du joueur principalement concerné (l'acteur, sinon celui qui subit, sinon le dirigeant de l'entreprise à ce moment-là ; rien pour un événement de PNJ) ; l'axe marque le passé (point plein), le présent (anneau de votre couleur) et le futur (point creux en pointillés) ; la date sur deux lignes (« T3 / 2027 ») ; les colonnes à venir sont inertes et un drapeau d'arrivée clôt l'axe. Clavier : un seul arrêt de tabulation, ← et → déplacent la sélection.
  - **Filtres**, mémorisés dans le navigateur (clés `casholoco.timeline.*`) : « Rachats, créations, faillites » (prise de contrôle, montée au capital, cession de gré à gré, passation, pilote automatique, pilule empoisonnée, fusion, création d'entreprise, faillite, appel de marge) et « Scandales » (scandale, lanceur d'alerte, délit d'initié, bonus du PDG, tuyau éventé, entente découverte), cochées par défaut ; « Lancements et filiales » (lancement de produit, ouverture d'une filiale) et « Argent » (dividende, rachat d'actions, bénéfice record, grosse perte) en option ; « Seulement ce qui me concerne » ; et « Repères sur les courbes » (clé `casholoco.timeline.pins`), coché par défaut. Le détail signale les événements du trimestre masqués par les filtres.
  - **Repères sur les courbes** : une pastille sur la courbe pour les coups qui comptent — les événements de poids 3 (prise de contrôle, passation, pilote automatique, faillite, fusion, création d'entreprise, appel de marge, cession de gré à gré, entente découverte) des familles cochées, plus ceux qui vous concernent de poids 2 ou plus. La pastille porte sur la courbe de son joueur principal (la vôtre si l'événement vous concerne ; sinon l'acteur d'une prise de contrôle, d'une passation ou d'une cession de gré à gré, celui qui subit un pilote automatique, une faillite ou un appel de marge, le dirigeant d'un résultat du trimestre, chaque dirigeant d'une entente découverte, le patron de l'entreprise dénoncée — jamais le lanceur d'alerte ; aucun joueur : frise seule), à la hauteur de sa fortune en fin de trimestre (valeur en direct pour le trimestre en cours). Au plus une pastille par courbe et par trimestre (priorité aux vôtres, puis au poids, puis au plus récent ; le reste groupé sous un chiffre) et au plus 3, 2 ou 1 par colonne selon sa largeur (3 dès 60 px, 2 dès 38 px, 1 dès 26 px ; en dessous, de simples points) : le dépassement reste dans la frise, qui liste toujours tout. Deux pastilles à moins de 18 px l'une de l'autre s'écartent de côté (± 11 px, ou −20 / 0 / +20 à trois), chacune reliée à son point exact. Le survol d'une pastille, d'un pictogramme de la frise ou d'une ligne du détail garde pleines les courbes des joueurs concernés et estompe les autres.
  - **Détail du trimestre** (suit le trimestre en cours tant qu'on n'en choisit pas un autre) : en-tête « ◀ T4 2029 · 4 événements ▶ », à droite « Lire le N° 13 » (ouvre ce numéro dans l'onglet du journal). À partir de 900 px, deux colonnes : à gauche les événements en phrases claires (langue de l'interface, montants au format du salon), chacun avec le titre que le journal lui a consacré (langue du salon), cliquable vers le numéro qui l'a publié (« Paru dans le N° 5 » pour les résultats) ; à droite, le classement « À la clôture du T4 2029 » (ou « En direct, au cours actuel » pour le trimestre en cours) : une ligne par joueur, rang, point de couleur, nom, valeur nette, variation sur le trimestre et places gagnées ou perdues.
  - **Convention de trimestre** : les articles de résultats (meilleur bénéfice, pire perte, faillite, scandale, entente découverte, filiale ouverte, appel de marge) paraissent au numéro suivant (§9) mais se rangent au trimestre qu'ils clôturent (`turn − 1`) ; tous les autres événements se rangent à leur numéro. La même convention vaut partout où la chronologie est montrée.
  - **Sur téléphone** (moins de 700 px) : pastilles réduites à un point par colonne (la colonne choisie déploie les siennes, écartées), frise en mode points (l'année écrite une fois, centrée sous ses 4 colonnes), filtres repliés dans un bouton « Filtres · 2/4 » ; toucher n'importe où dans une colonne la choisit, un glisser horizontal sur le graphique fait défiler les trimestres, sans infobulle (les chiffres sont dans l'en-tête du détail, et une ligne de repères juste dessous donne votre fortune, votre rang et le leader), les boutons ◀ ▶ du détail font 44 px ; aucun défilement horizontal.
  - **Journal** : la frise n'y est plus ; une barre de navigation (`IssueNav`) au-dessus du papier, dans la langue de l'interface : [◀ N° 12] [N° 13 · T1 2030 ▾] [N° 14 ▶] ; la liste déroulante va du plus récent au plus ancien, avec « · vous concerne » quand un événement du numéro vous concerne ; « Retour à l'édition du jour » n'apparaît que dans les archives ; à droite, « Ce trimestre dans la chronologie → » bascule vers l'onglet « Classement », ce trimestre choisi. Les tickers des entreprises nommées dans les articles sont des boutons natifs, utilisables au clavier : une entreprise active encore dirigée ouvre sa Gestion ; une autre ouvre sa fiche Bourse. L'identifiant de l'entreprise est transmis à la destination, y compris dans les archives ; le libellé accessible précise son nom et la destination, dans la langue de l'interface. Le contenu du journal reste dans la langue du salon.
  - Un événement vous concerne si vous agissez, si vous le subissez, ou s'il touche une entreprise que vous dirigiez à ce moment-là : on part de qui dirige quoi aujourd'hui et l'on défait, du plus récent au plus ancien, les changements de contrôle publiés (tous le sont) ; les résultats du trimestre désignent eux-mêmes leur dirigeant (`leaderId`). Le nom d'un bot repris en cours de partie reste l'ancien pour ce qu'il a fait avant la reprise ; un produit retiré depuis (ou d'une entreprise en faillite) n'a plus de nom dans la vue : la phrase donne alors son secteur.
  - Sans entreprise, l'onglet entreprise commence par « Ce qui s'est passé » : la dernière perte (prise de contrôle, faillite ou passation après avoir tout vendu), avec le parachute touché, le titre du journal et un bouton vers ce numéro ; puis « Mon historique » (tout ce qui vous concerne, même convention de trimestre que la chronologie). Avec une entreprise, une perte des deux derniers trimestres y reste signalée. Le panneau « Vous » de la carte la rappelle.
- **Son** (client seul, `client/src/audio/`, sans règle ni donnée nouvelles) : musique de fond et ponctuations générées avec Suno (commande, choix des prises et traitement : `docs/AUDIO_BRIEF.md` ; crédits et mention de l'IA : `docs/AUDIO_CREDITS.csv`).
  - Rien ne joue avant le premier geste du joueur (clic, touche, fin de toucher : règle des navigateurs) ; chaque geste suivant relance ce que le navigateur aurait bloqué. La musique se met en pause quand l'onglet est caché ou le son coupé.
  - Musique selon l'écran : thème à l'accueil, musique d'attente au salon et pendant l'attente de la reprise d'un bot, gala à la fin. En partie, la playlist suit l'avancée : premier tiers (5 morceaux), milieu (6) et dernier tiers (5) des trimestres qui précèdent le dernier, tiers = ⌈max(1, T) × 3 / (N − 1)⌉ pour le trimestre T d'une partie de N trimestres ; le dernier trimestre a son morceau. Morceaux mélangés, sans rejouer tout de suite le dernier entendu, enchaînés en fondu de 2,5 s (le suivant part 3 s avant la fin) ; un contexte d'un seul morceau le boucle en fondu.
  - Ponctuations, par-dessus la musique (qui descend à 30 % le temps de la ponctuation ; deux au plus en attente, les suivantes oubliées) : le jingle au lancement de la partie (pas à une reconnexion) ; celle du journal à chaque nouveau trimestre ; à chaque mise à jour, celle de l'événement le plus grave parmi les nouveaux articles qui concernent le joueur (il agit, il subit, ou il dirigeait l'entreprise nommée avant ou après la mise à jour ; correspondance et priorités : `EVENT_STINGS` et `PRIORITY` dans `catalog.ts`, pas de son pour le pilote automatique, la montée au capital, le rachat d'actions, la pilule empoisonnée ni la cession de gré à gré) ; en fin de partie, la fanfare pour le premier, le trombone triste pour les autres.
  - Bouton son (🔊, 🔇 une fois coupé) à côté de FR | EN sur chaque écran : son activé, volumes de la musique et des effets (le volume suit le carré du curseur), mémorisés dans le navigateur.
    Échap ferme le panneau et rend le focus au bouton Son si l’on était encore dans ses contrôles ; un clic
    extérieur ou un focus déjà déplacé ailleurs conserve sa destination, sans modifier les réglages.
  - Fichiers : `client/public/audio` (MP3, musique à −18 LUFS, ponctuations à −16 LUFS, 42 Mo en tout) ; chacun ne se télécharge que lorsqu'il va jouer.
- **Moteur déterministe** : générateur pseudo-aléatoire à graine (mulberry32) dont l'état vit dans `GameState.rngState`. L'état est du JSON pur (sérialisable pour une future sauvegarde). Les textes d'ambiance (titres, citations, quips) sont choisis par hachage, sans consommer le RNG de la simulation. La graine est masquée dans la `PlayerView` (`config.seed = 0`).
- **Moteur** (`packages/core/src/sim/`) : `i18n` (catalogue des textes du moteur, fr/en), `create` (création), `turn` (numéro du journal, news, rumeurs, bots), `resolve` (résolution, appels de marge, fin de partie), `actions` (validation et application), `market` (impact de prix), `control` (OPA, seuils), `finance` (formules), `deals` (filiales, contrats, ententes), `news`, `journal`, `bots`, `botDeals` (réponses des bots aux offres), `view`, `trophies`, `sanitize` (filet de sécurité numérique), `constants` (paramètres, réexportés par `@muchomoney/core`).
- **Salons** en mémoire, code de 4 lettres, reconnexion par jeton (sessionStorage de l'onglet, copie de repli en localStorage reprise automatiquement seulement si aucun autre onglet vivant ne tient la session).
- **Règles de salon** (serveur) :
  - Lobby : l'hôte peut retirer un humain (`lobby:removeBot` sur un humain) ; l'expulsé reçoit `room:closed` (avec `code: 'kicked'`, pour un message dédié côté client ; `'takenOver'` pour un onglet supplanté), son jeton est invalidé, son pseudo (et son IP si elle diffère de celle de l'hôte) est banni du salon. Si l'hôte reste déconnecté 5 s, la main passe au premier humain connecté. Un lobby inactif 15 min est fermé. Une connexion au-delà du quota par IP reçoit `server:refused` (raison localisée d'après `handshake.auth.lang`) avant d'être coupée.
  - Partie : un humain déconnecté et pas prêt bloque la fin anticipée du tour pendant 20 s (le chrono continue) ; un départ volontaire (`room:leave`) la débloque tout de suite. La partie ferme dès que tous les humains l'ont quittée volontairement, sinon 10 min après la dernière déconnexion.
  - `game:ready` porte `{ ready, turn }` : un « prêt » visant un autre tour est ignoré ; sans `turn`, un « prêt » reçu moins de 1,5 s après un changement de tour est ignoré.
  - `game:action` porte `{ action, turn }` : le client y joint le tour de la vue affichée au moment de l'envoi. Un `turn` qui n'est pas un entier est refusé comme action invalide ; un autre tour que le tour en cours est refusé (« le trimestre a tourné entre-temps »), sans appeler le moteur ; sans `turn`, l'action passe comme avant. La garde couvre une action partie avant la clôture et arrivée après ; un réglage de produit enregistré après le changement de tour (curseur relâché, champ quitté, pause des boutons − et + écoulée) part avec le nouveau tour.
  - Limites par IP : 30 sockets, 5 salons ouverts, 20 créations/entrées/reconnexions en rafale puis 1/s ; reconnexion limitée par joueur (5 en rafale, 0,5/s). L'IP vient de `X-Forwarded-For` seulement si `TRUST_PROXY=1`.
- Déploiement : un seul processus Node sert le client compilé et le WebSocket (Render, Fly.io, Railway…).

### Le plateau à l’écran

Les outils de « La carte » ne portent plus de carte de découverte : les repères du plateau sont des étapes de
« Vos premiers pas » (décrite plus haut), au-dessus de l'onglet. Sélectionner une de ses usines coche « Retrouver votre
usine et votre terrain », sélectionner une case constructible libre coche « Comparer une case libre » ; une sélection
initiale automatique ne coche rien. Un formulaire de lancement ou de déménagement réellement ouvert sur la carte (dans le bandeau du plateau ou la fiche classique, par
son bouton, une intention ou l'étape elle-même) coche « Préparer un lancement ou un déménagement (facultatif) ». Changer
la couleur des cases n'est plus une étape (l'échelle des couleurs, dans les outils du plateau, l'explique), et le résultat d'une mise
n'en est pas une non plus : il se lit dans le bilan de clôture et dans « Mes mises », sans rien attendre pour finir la liste. Depuis la checklist, la
carte sélectionne sa propre usine ou la meilleure case libre (même règle que « Aller à › Meilleure case », pour la
référence chiffrée par la carte ; à défaut de marge chiffrable, une case libre). Ce n'est pas une intention : ni
formulaire, ni changement d'entreprise, ni nouvelle clé de la vue. Carte déjà affichée, la case est sélectionnée sur
place comme une navigation demandée : couleurs, flux et comparaison restent, et sa propre usine devient la référence suivie ; sinon
« La carte » s'ouvre dessus. Elle vaut sélection et coche son étape ; une intention envoyée ensuite (formulaire de
l'étape facultative) l'emporte. Aucun de ces boutons ne paie ni n'envoie une mise.

Lors de la première sélection explicite d'un terrain de départ, d'une case libre ordinaire et d'un gisement,
la fiche affiche, sous son action (au-dessus du formulaire ouvert ou du panneau d'un gisement), une courte note (30 mots au plus) qui ne parle que de son type de case, sans comparaison avec les
autres : les effets du terrain appartiennent à l'usine de départ et sont définitivement perdus avec ceux du siège
quand elle déménage ; une case ordinaire n'a aucun privilège, et sa fiche estime coûts et clients pour y installer
une usine ; un gisement accueille une filiale d'approvisionnement, pas une usine. La carte ouverte par « Retrouver
votre usine et votre terrain » sur une usine de départ montre ainsi la note du terrain, si elle n'a pas déjà été vue. La note reste lisible pendant
cette sélection, puis ne revient plus : elle est comptée vue quand elle est au moins aux trois quarts à l'écran. Les
notes vues sont mémorisées dans ce navigateur, entre les parties (`muchomoney:cellNotes`, sans donnée serveur ; à la
première lecture, celles de l'ancienne clé `muchomoney:boardTour` sont reprises, le reste de cette clé est ignoré). Une
sélection initiale automatique ne consomme pas de note ; une intention (formulaire demandé) ou une case demandée par
la checklist montre celle de sa case. Les spectateurs et la carte classique n'ont pas ces notes.

En mode hexagonal, « La carte » affiche les 159 cases officielles de `HEXES` sur le décor et la projection
kilométrique de `BaseMap`. Cette vue est conçue et vérifiée pour l’ordinateur ; son activation dépend du mode
de carte, sans seuil de largeur. Les 159 cases se choisissent au clic ou au clavier, avec une fiche pour les villes
et les gisements ; seuls les 149 emplacements constructibles peuvent accueillir une usine. Les couleurs des cases
Marge, Fret et Demande (ou « Aucune ») prennent pour référence un produit dirigé ou un lancement. Les marges absolues des
lancements utilisent les quintiles des cases libres estimées ; le transport et la demande divisent leur plage de
valeurs en cinq intervalles égaux. Les écarts de marge utilisent aussi les quintiles, et la légende donne les bornes
des classes. Le moteur estime toutes
les 159 cases pour la vue du joueur, y compris les positions théoriques occupées ou non constructibles ; les bots
gardent leur sélection de cases candidates et les règles de placement ne changent pas. Une clé manquante reste
neutre, sans chiffre inventé. Une palette compacte au-dessus du dessin, hors du zoom et des colonnes repliables,
remplace les bandeaux de contexte et le sélecteur « Chiffrer pour ». Elle propose les usines et filiales dirigées,
les secteurs pour une nouvelle usine et les matières pour une nouvelle filiale, avec les mêmes pictogrammes que
sur la carte. Le nom de l'activité qui sert aux calculs reste visible. Le produit des flux réels est nommé
séparément lorsque leur contexte diffère, y compris en comparaison.
Les parcelles occupées par une compagnie active (usine ou filiale sur un gisement terrestre) portent un fond
translucide et une frontière dans `CompanyView.color`, la même couleur que sa cotation en Bourse, indépendamment
de celle du joueur qui la contrôle. Cette identité reste visible dans tous les modes de coloration ; les autres
cases utilisent l'échelle de marge, de fret ou de demande. La légende nomme les compagnies et leurs couleurs.
Chaque ville garde un symbole de bâtiments, même occupée ; les usines portent le pictogramme de leur secteur.
Un clic sur une usine dirigée la choisit comme origine et affiche sa synthèse réelle sur tout le marché : demande totale estimée,
fret moyen par lot (approvisionnement + livraison aux villes), marge totale estimée par trimestre et production
prévue. La marge reprend l'estimation existante du moteur, avec stocks, production et budgets courants,
frais fixes compris, avant impôts et frais de l'entreprise. Les chiffres de livraison vers une autre case
s'affichent au survol ou au focus, sans changer cette origine. Les prévisions privées des rivaux
restent masquées.
Dans l'onglet Carte, l'origine garde un contour violet continu, sans pastille « Réf. » ; le survol ou le focus
d'une autre case la souligne en noir. Il n'y a plus de destination sélectionnée persistante ni de double clic
pour choisir l'origine. Un clic simple ou Entrée choisit la case d'origine : une usine ou une filiale dirigée y
reprend son activité réelle ; ailleurs, le profil choisi dans la palette définit l'installation théorique.
Cliquer sur une icône choisit directement ce profil, sans étape de placement à annuler. Glisser une icône sur
une case place ce profil comme origine. Au clavier, les flèches parcourent les cases pour consulter leurs chiffres,
puis Entrée ou Espace confirme l'origine ; le focus seul ne déplace pas la référence. La lecture n'envoie aucune
action au serveur. Les cartes qui servent de sélecteurs dans les formulaires gardent leur interaction propre.
Pour une filiale, la rangée « Pour » choisit le produit destinataire, avant ou après le placement. Les clés de
glisser-déposer sont validées contre les profils présents dans la vue redigée, sans action serveur.
Une installation théorique est atténuée et encadrée en pointillé, sans changer la couleur du propriétaire.
Le panneau de droite décrit l'origine sélectionnée ; dessous, les chiffres de la case survolée ou au focus
suivent le pointeur ou le clavier. Les boutons « Acheter terrain », « Construire usine » ou « Construire filiale »
sont à droite des choix d'activité, dans le bandeau au-dessus de la carte. Leurs formulaires (montant de la mise,
nom du produit, confirmation ou retrait) s'ouvrent dans ce bandeau, jamais dans la fiche de lecture. Ils visent
toujours l'origine sélectionnée, et non une case simplement survolée. Le bouton de filiale remplace celui d'usine
pour un profil de matière et exige un gisement disponible compatible. Les permissions, coûts et règles du moteur
continuent à déterminer les actions admissibles, notamment pour les anciennes parties.
Échap depuis un formulaire du bandeau le referme comme son bouton Fermer, sans changer l'origine ni le profil.
Le focus revient à l'action correspondante si elle reste disponible ; une destination extérieure déjà choisie
garde le focus. Depuis une confirmation au-dessus, Échap ferme seulement la confirmation, puis permet de
reprendre le formulaire. Fermer un formulaire de déménagement ne quitte pas ce mode ; son bouton Annuler
reste la sortie explicite du mode.
En lecture de livraison, l'usine reste à l'origine : les couleurs et le panneau montrent des valeurs absolues de ce
scénario, sans comparaison d'écarts entre emplacements. Fret : `routeBetweenHexes(origine, destination)
× TRANSPORT_COST_PER_KM × freightWeight(produit ou matière) × transportFactor`. Marge par lot livré d'un produit :
prix − (coût unitaire à l'origine − livraison moyenne aux villes + fret du trajet choisi), avant frais fixes,
marketing et R&D. La **marge totale théorique** d'une case, affichée au survol ou au focus et utilisée par la couleur
« Marge », vaut `demandeSurLaCase × margeParLotLivré`, avec toute cette demande satisfaite. Elle ne constitue
pas le bénéfice trimestriel réalisable avec la capacité, le stock et les budgets courants. Les pertes restent
négatives ; une demande ou marge absente/non finie, ou un résultat non fini, donne un chiffre manquant et une couleur neutre.
Une filiale montre son fret et calcule sa marge au prix spot après extraction et fret ; la marge totale multiplie
cette marge par les besoins de matière du destinataire (production prévue × recette). Ces besoins ne sont connus
que pour une usine dirigée effectivement à destination ou un destinataire théorique explicitement placé sur cette
case. Sans destinataire local, demande et marge totale restent inconnues : aucun besoin n'est copié sur toutes
les cases vides, et les plans privés des usines rivales ne sont jamais inférés. Capacité, autres contrats et frais
de filiale ne sont pas évalués par cette marge partielle. Les règles d'ouverture des gisements restent les mêmes.

**Population et demande par parcelle (décomposition de lecture).** Le moteur garde ses cinq marchés urbains et ses
ventes nationales. `estimateDemandByCity` réutilise exactement les paramètres de l'estimation (prix, qualité,
notoriété, réputation, budgets, bonus local, goûts, concurrence connue et effets du terrain). Une densité spatiale
fixe répartit chaque marché sur les cases terrestres, île comprise, sans résidents en mer ni dans le lac :
`poids(case, ville) = 1 / (1 + route(case, ville) / HEX_R)²`, normalisé par ville. La demande de chaque case est la
somme des contributions des cinq villes. `projectDemandToHexes` la normalise sur la demande totale existante du
produit à l'origine ; la dernière case habitée reçoit le résidu d'arrondi afin que la somme dans l'ordre `HEXES`
retrouve exactement ce total. La population estimée utilise ces mêmes densités et les parts de population
existantes des villes (40/20/20/10/10 %), pour un total exact de 100 %. Elle est publique dans
`PlayerView.hexes.populationShare` et affichée en pourcentage du pays. Cette population est une estimation
géographique, pas une nouvelle donnée de population réelle. La fiche donne la demande de la cible en lots
fractionnaires, le total national inchangé et la règle de lecture. Ces fonctions sont pures, stables et sans RNG ;
ni la densité ni les nouvelles demandes par parcelle n'interviennent dans la résolution, les décisions des bots,
les prix ou les ventes. Les anciennes vues sans les composantes nécessaires gardent une estimation inconnue.

La palette offre « Voir l'origine » et un retour à la position réelle (ou le retrait de l'origine pour un
lancement/une filiale). Les flux restent calculés aux positions
réelles ; en comparaison de produits, choisir une usine change seulement le produit des couleurs. Les actions et
leur fiche réelle restent dans « Lieu et actions disponibles » ; commencer un déménagement ou un lancement quitte
la lecture de livraison ; le chiffrage de la décision garde l'usine réelle comme base, les écarts trimestriels et
les trois meilleures cases de déménagement. Un bouton explicite de construction dans la fiche ouvre le formulaire
d'enchère à l'origine simulée, même si une autre case est consultée. Une nouvelle filiale ne peut ouvrir une vraie
enchère que sur un gisement libre de la matière choisie. Le placement graphique ne dépense jamais d'argent.
« Voir la référence » consulte l'origine sans changer le scénario. Hors simulation, une référence de lancement n'a
pas encore d'usine d'origine, donc aucun repère d'origine. Les frontières et les petites marques de propriété
prennent la couleur de la compagnie, comme la Bourse ; les pictogrammes d'usine désignent leur secteur.
La légende distingue propriété, référence et consultation.
**Le fret depuis une case** sert deux
décisions et suit exactement la règle de la clôture (§5.8, `transportPerLotBy`), décomposée par `city/freight.ts` et
vérifiée contre l'estimation du moteur : sur une case libre, « Que lancer ici ? » donne pour les cinq secteurs la marge
estimée par trimestre et le fret par lot d'une usine neuve (matières achetées au port, livraison aux villes ; la crypto
ne paie aucun fret), le plus rentable marqué, et un clic sur un secteur en fait la référence suivie ; ce tableau est
ouvert quand la référence suivie est une usine neuve, replié quand c'est l'un de mes produits, et s'efface tant qu'un
formulaire est ouvert dans la fiche. Quand le produit suivi est l'un des miens, son fret tient en une ligne des
chiffres de la fiche : sur une case libre, « dont fret », la part du fret dans le gain du déménagement, aux lots prévus
ce trimestre et avec le signe du gain, une économie étant positive (« dont fret : +35 k€/trim. économisés (−0,7 k€/lot) »,
en rouge « −35 k€/trim. de plus (+0,7 k€/lot) ») ; sans lot prévu, par lot seul et avec le même signe
(« +0,7 k€/lot économisés ») ; « inchangé » quand les chiffres affichés s'arrondissent à zéro. La case de son usine et une case candidate donnent
les deux moyennes absolues par lot : « Fret matières premières : 0,9 k€/lot » et « Fret livraison : 7,2 k€/lot ».
Chaque ligne propose au survol et au focus un résumé de ses composantes, et au clic une table complète : une ligne
par matière de la recette, les lots consommés, le partage port/filiales, la distance et le poids de chaque source,
puis son coût ; une ligne par ville pour la livraison, sa part des ventes, sa distance et son coût. Le pied de table
précise le tarif, le poids du produit et les effets du transport. La couleur Fret montre l'écart de fret total avec
l'usine actuelle (zéro sur sa case) ; pour une référence de lancement, elle montre le fret absolu de l'usine nouvelle,
et sa légende le dit. Les parcelles occupées portent la couleur de la compagnie ; les bâtiments restent neutres,
les terrains de départ leur repère, les mises encore valables une enveloppe et les adjudications de la dernière
clôture un marteau.
**Sur ordinateur, le pays tient dans l'écran.** Le plateau est posé dans un cadre (`MapZoomFrame`) à ses proportions
(largeur / hauteur de `MAP_VIEW`), aussi haut que la fenêtre sous le bandeau fixe et les onglets collés, moins 24 px
de marge et moins ce qui le précède dans la page de la carte (la barre d'une ligne quand elle est au-dessus) : au zoom 1,
tout le pays se voit sans faire défiler la page, et l'arrivée amène le cadre sous les barres. Dès 1200 px de large,
l'écran a **trois colonnes** : à gauche « Mes usines » et les outils du plateau (collés sous les barres comme la fiche,
et qui défilent d'eux-mêmes s'ils dépassent la fenêtre), au milieu le cadre, à droite la fiche. Ce que laisse le
cadre va d'abord à la fiche (de 360 à 520 px), puis à la colonne de gauche (de 280 à 400 px) ; si la place manque, le
cadre se rétrécit et le pays y tient en largeur. Les trois colonnes sont toujours tracées et centrées, la place de la
fiche gardée même repliée ou sans sélection : rien ne bouge quand elle s'ouvre ou se replie. De 960 à 1199 px, la
barre d'une ligne reste au-dessus du cadre, la fiche à droite (330 px) ; sous 960 px, tout s'empile comme avant, le
plateau à la largeur de la page, sans cadre ni zoom. **Le zoom** : dans le coin supérieur droit du cadre, « + » et
« − » (« Zoom avant » / « Zoom arrière », « Zoom in » / « Zoom out ») passent par 1, 1,25, 1,5, 2 et 2,5 (inactifs aux
bornes, sans perdre le focus ; la tabulation les atteint avant les cases) et « Ajuster » (« Fit » ; nom complet
« Ajuster le pays à l’écran » / « Fit the whole country on screen »), affiché au-delà de 1, y revient ; Ctrl (⌘ sur Mac) + molette
au-dessus du cadre zoome aussi, à la place du zoom de la page (un cran de souris par niveau, un pincement en cumule
plusieurs). Au-delà de 1, le dessin grandit et le cadre défile dans les deux sens ; il se déplace en glissant à la
souris (au-delà de 5 px, un appui est un glisser, et le clic qui le termine ne sélectionne pas de case ; au doigt, le
cadre défile comme toute zone défilante). Un changement de zoom garde le centre du cadre, sauf si la case
sélectionnée allait en sortir : elle vient alors au centre. Une case choisie ailleurs que sur le plateau (« Aller à »,
une intention, « Vos premiers pas ») fait défiler le cadre jusqu'à elle — au centre si elle était hors de vue, juste
assez si elle était coupée —, et la page seulement pour ramener le cadre entier sous les barres quand elle a défilé.
Au zoom 1, il n'y a rien à déplacer : un appui qui tremble reste un clic sur sa case. Le zoom est mémorisé dans ce
navigateur (`casholoco.map.zoom`, 1 par défaut). **Zoomer ne déplace ni ne redimensionne rien autour du cadre** : le
dessin grandit dans le cadre, qui garde sa largeur ajustée ; les colonnes et les boutons du zoom restent sous le
pointeur d'un cran à l'autre. **Au-delà de 1 seulement, la colonne de gauche se replie** par « ‹ » en haut à droite
(nom complet « Replier vos usines et les outils du plateau » / « Collapse your factories and the board tools ») en une
bande de 40 px : un bouton vertical « Vos usines et outils › » / « Factories & tools › » (« Rouvrir vos usines et les
outils du plateau » / « Reopen your factories and the board tools ») et une petite clé des couleurs (l'emoji du produit
ou du secteur chiffré, le nom de la couleur, ses cinq bandes ; infobulle « Couleurs : Marge, chiffrées pour … »), et le
plateau prend la place libérée, à la même hauteur : le cadre a la largeur du dessin agrandi plus sa barre de
défilement verticale, sans dépasser ce que laissent la bande et la fiche (`frameWidth` dans `city/mapZoom.ts`, même
règle que la grille) ; quand le dessin y tient, le cadre ne défile plus que verticalement. Repliées, les colonnes se
rangent à droite : d'un cran de zoom à l'autre, la fiche et les boutons du zoom ne bougent pas, seule la bande glisse.
Au zoom 1, le pays est ajusté à la hauteur et ne pourrait pas se servir de cette largeur : pas de bouton, la colonne est
toujours ouverte, et elle se rouvre d'elle-même quand le zoom revient à 1 (le choix, `casholoco.map.sideFolded`, ne
vaut qu'au-delà). Quand la largeur du cadre change (colonne repliée ou rouverte, zoom avec la colonne repliée, fenêtre
redimensionnée), le même centre reste au milieu, ou la case sélectionnée si elle allait sortir. Le dessin est projeté sur au moins 760 px de large puis réduit au cadre : noms, identifiants et pastilles
gardent leur taille par rapport aux cases au lieu de les encombrer ; un cadre zoomé plus large est dessiné à sa
largeur. La légende ajoute « Ctrl (⌘ sur Mac) + molette : zoomer. Glisser : déplacer le plateau agrandi. » (« Ctrl (⌘
on a Mac) + wheel: zoom. Drag: pan the zoomed board. »). Le plateau n'a plus de bouton « Tout le pays » / « Agrandir » ;
la carte classique garde « Voir tout le pays » / « Agrandir la carte » (mémorisé, `casholoco.map.whole`) et sa mise en
page en deux colonnes.
**Les outils du plateau**, sous 1200 px, forment **la barre d’outils**, une seule rangée de commandes au-dessus du cadre, qui passe à la ligne quand la fenêtre manque de largeur : de
gauche à droite viennent « Chiffrer pour : <référence ▾> » / « Figures for: », un sélecteur
neutre rangé en deux groupes, « Vos produits » et « Nouvelle usine » (les cinq secteurs), qui pilote les couleurs, les
estimations de la fiche et les flux sans rien engager ; choisir un produit sélectionne sa case seulement si rien
n’est sélectionné ou si c’est une autre de ses usines (une case libre reste sélectionnée, pour comparer plusieurs
produits sur la même case). Puis « Couleurs : Marge · Fret · Demande · Aucune », suivies de l’échelle compacte (les
deux bornes et jusqu’à cinq bandes, chaque bande et le titre de la légende en infobulle) et, le cas échéant, de
« Aucune case libre ne bat la position actuelle. » ; quand la comparaison est active, le libellé devient « Couleurs
selon <référence> : ». Puis trois menus : **« Flux : aucun ▾ »** (« Flows: none ▾ »), dont le bouton nomme toujours
le calque allumé (« Flux : ventes ▾ », ou « Flux : ventes (sans produit) ▾ » quand « Chiffrer pour » vise une nouvelle
usine, qui n’a rien à tracer) et qui contient les quatre modes, et, calque allumé, « Chiffres »,
« Concurrents » et « Colorer selon un autre produit » (la comparaison ; éteindre les calques l’arrête, pour que les
couleurs ne suivent jamais une référence cachée) ; **« Aller à ▾ »** (« Go to ▾ »), dont chaque entrée sélectionne sa
case comme un clic : ses usines (nom et lieu), ses filiales, les cases de ses mises en attente (plateau et
gisements), la meilleure case libre pour la référence des couleurs, les dernières adjudications (seulement s’il y en
a) et « Gisements et filiales » ; **« Légende ▾ »**, qui donne ce que mesurent les couleurs avec leurs bandes, les
symboles du plateau, l’aide clavier et celle du zoom. Vient enfin l’entreprise aux manettes et sa trésorerie, en bref
(« Blé & Oseille · 12,0 M€ » ; à partir de deux entreprises, une pastille par entreprise, la trésorerie dans celle
qui agit). Entre « Légende » et l’entreprise, la **piste** remplace le
panneau « Occasion » de la carte classique, avec la même règle (`openingSign`) et rien du tout quand il n’y a pas
d’occasion : « Piste : Gadgets connectés à Croissance-la-Grande (H5) · remb. ~3 trim. [Voir] » (« Hot tip: Smart
Gadgets at … · pays back in ~3 qtrs [Show] »), dont le bouton sélectionne la case et fait de ce lancement la référence
de « Chiffrer pour », sans ouvrir de formulaire ; sinon « Piste : Sucre à 82 % du prix de base [Matières] », qui ouvre
l’onglet Matières. Faute de place, la piste rétrécit (jusqu’à 180 px) plutôt que de faire passer la barre d’outils sur
une ligne de plus : le secteur et le lieu se coupent, jamais le délai de remboursement ni le bouton ; son infobulle
donne la phrase entière, puis « Constat tiré des chiffres publics (et des vôtres), pas un conseil. ». Les panneaux « Vous » et « Menace » n’ont pas d’équivalent sur la carte : rang et menaces sont dans
la barre du jeu. Les menus suivent « Mon trimestre » : bouton
`aria-expanded`/`aria-controls`, focus sur la première entrée à l’ouverture, Échap qui referme et rend le focus au
bouton, clic ou tabulation hors du menu qui le ferme, flèches, Début et Fin d’une entrée à l’autre. Un menu ouvert
reste dans la fenêtre (décalé vers la gauche s’il déborderait à droite, même quand son contenu s’allonge) et passe
sous la barre du jeu et les onglets quand la page défile. La hauteur de ces barres, mesurée, sert au cadre du plateau (et à
« Voir tout le pays » sur la carte classique) et à l’arrivée sur la carte. **Dès 1200 px**, la colonne de gauche
(« Vos usines et outils du plateau » / « Your factories and board tools », `HexSidePanel`, modèle pur
`city/sidePanelModel.ts`) répond à « qu'est-ce que je possède, et comment lire le plateau ? », de haut en bas :
  - l'entreprise aux manettes et sa trésorerie (ses pastilles à partir de deux entreprises), suivies, quand ses mises
    attendent la clôture, de ce qu'elles engagent, frais compris, comme « Mon trimestre » (« Blé & Oseille ·
    12,0 M€ · dont 3,4 M€ engagés en mises » / « … · $3.4M committed to bids » ; avec plusieurs entreprises, dans la
    pastille de celle aux manettes, après sa trésorerie) ; si le plan de clôture prévoit que ces
    mises ne seront pas couvertes, l'alerte de la clôture (« Il manquerait environ … », avec « vos mises ne compteraient
    que jusqu’à … ») ;
  - **« Mes usines »** / « My factories » (section nommée par ce titre) : une liste dans l'ordre de l'entreprise, le
    produit suivi par « Chiffrer pour » déplié sur place (rien ne se réordonne ; sa carte vient dans la vue de la
    colonne quand il change). Sa carte : le nom
    (bouton « Suivre Nuit Blanche Max (Rupture) »), la marge estimée (« marge +312 k€ », infobulle de l'estimation) et
    le statut de la vue « Atelier » (Rupture, Invendus, Équilibré, Chantier, À l’arrêt, Sans estimation) ; une miniature
    **fixe** de sa scène, jamais animée (le réglage Figer/Animer de la vue « Atelier » n'est pas lu), dont les textes
    illisibles à cette taille (prix, panneaux, « Fermé », panneau du chantier) sont masqués. C'est la part élastique
    de la colonne : elle n'est montrée que si la colonne a au moins 300 px de large et si, mesurée sans elle (plis
    fermés, sans le détail des flux), la colonne garde encore sa hauteur (largeur de la carte × 0,38) sous sa hauteur
    maximale, celle de la fenêtre sous les barres ; ailleurs la colonne garde ses lignes sans l'image. Mesurée sans
    elle, elle ne se retire jamais d'elle-même une fois montrée ; ouvrir un pli ou un calque de flux fait défiler la
    colonne au lieu de la retirer sous le pointeur. Il faut aussi que « Masquer l’image » / « Hide the picture »
    (mémorisé, `casholoco.map.plantSceneHidden`, proposé seulement là où elle tient) ne l'ait pas retirée ; un verdict
    court (« ≈ 12 lots de demande non servie », « ≈ 9
    lots invendus, dont 3 perdus », « ≈ 52 lots vendus, pile ce qu’il faut », « Ouvre en T3 2027 », « À l’arrêt : rien à
    vendre », après la partie « Plus d’estimation : la partie est jouée. »), la phrase entière de la vue « Atelier » et
    « ≈ 49 lots produits, 3 en stock » en infobulle ; la ligne de décision, le premier cas qui s'applique : la
    destination attribuée (« ⚒ Destination attribuée : … »), la mise en attente (« ✉ Déménagement · C4 · mise 150 k€ +
    frais 40 k€ », suivie au besoin de « (C9 ferait +20 k€/trim. de mieux) »), la meilleure case libre **remboursable à
    temps** à sa mise à prix, les cases de mes autres mises écartées (« Ailleurs, remboursable à temps : +50 k€/trim. à
    D5, en ~3 trim. », « … hors privilèges » sur un terrain de départ, puis « (C4 ferait +65 k€/trim. mais trop
    tard) » quand la plus rentable ne se rembourserait pas), sinon « Mieux ailleurs (+65 k€/trim. à C4), mais trop tard
    pour rembourser. », sinon « Rien de mieux ailleurs pour l’instant. » — au dernier trimestre et après la partie, il
    ne reste que la destination attribuée (une case gagnée à l'avant-dernière clôture s'applique à la dernière), rien
    pour un chantier ; une case trop tardive reste un lien (on peut vouloir la regarder, pour une mise au-dessus de son
    délai par exemple) ; le gain et le délai sont ceux de `hexCellBid`, que le titre de la fiche de cette case répète ;
    puis le détail du calque
    de flux allumé pour ce produit (approvisionnement ou ventes ; rien de plus en production, que le verdict dit déjà) ;
    enfin « 📍 D12 » (« Montrer l’usine sur le plateau : … »), « ⚙️ Réglages » et « Voir dans Atelier ». Une
    start-up à l'incubateur ne peut pas y rester : pas de 📍 ni de « trop tard » ou « rien de mieux », mais « Où vous
    installer : C4, +65 k€/trim. de mieux qu’à l’incubateur (mise à prix 150 k€) » (« Where to settle: C4, +$65k/qtr
    over the incubator ($150k reserve) »), puis, si sa mise échoue, « case
    libre la plus proche de C4 » ou « reste à l’incubateur jusqu’à la clôture de T3 », sans mise « Sans case gagnée
    d’ici la clôture de T3, l’État vous case d’office au plus près de la capitale. », et à l'échéance « Sans case gagnée
    à cette clôture, l’État vous case d’office au plus près de la capitale : sans doute A10, mise à prix 400 k€, marge
    ≈ … » (la case libre la plus proche de la capitale par la route, mes mises écartées ; « sans doute » car les mises
    secrètes des rivaux peuvent la prendre), jamais au dernier trimestre ; le résultat de sa dernière clôture suit
    (« Dernière clôture : … »). Les autres produits tiennent en une ligne : nom et statut, puis « D12 · marge +88 k€ ·
    ↗ +40 k€ ailleurs » (↗ seulement pour une case remboursable à temps, infobulle « Une case libre ferait … de mieux »),
    « ✉ C7 » pour une mise (il remplace toujours ↗), « ⚒ B7 » pour une destination, « Ouvre en T3 2027 » pour un
    chantier, « à l’incubateur de la capitale » pour une start-up. Sans produit : « Aucune usine en service : tout reste
    à construire. » ;
  - sous les cartes : « Emplacements libres : 2 · choisir où lancer › » (une usine neuve du secteur de la piste, sinon
    du premier secteur, devient la référence et sa meilleure case est sélectionnée, sans formulaire), ou « Tous les
    emplacements sont occupés. » ; avec une usine neuve comme référence, « Meilleure marge pour <secteur> : A4 › », sauf
    si la piste nomme déjà ce secteur et cette case ; une ligne par mise de lancement (« ✉ Lancement · Gazelle · C7 ·
    mise 220 k€ + frais 800 k€ › », qui rouvre son formulaire) ; puis la piste, calculée pour l'entreprise aux manettes :
    un lancement seulement si elle a un emplacement libre, la fiche lançant pour elle ;
  - des plis fermés par défaut, en liste serrée, dont l'état ouvert est mémorisé (`casholoco.map.sideOpen`) et dont le
    titre dit ce qu'ils contiennent : « Flux : aucun » (le calque allumé ; dedans, les quatre modes en boutons et, calque
    allumé, « Chiffres », « Concurrents », « Colorer selon un autre produit » et l'explication), « Gisements et filiales
    · 1 filiale · 1 mise » (ses filiales, ses mises sur gisement et l'entrée du gisement de la matière la plus
    demandée, nommée d'après ce qu'elle sélectionne, « Gisement de pétrole (B3) › » / « Oil deposit (B3) › », absente
    quand une filiale ou une mise du pli mène déjà à cette case ; pas de conseil chiffré d'investissement ici),
    « Dernières adjudications (2) » (absent avant la première clôture) et « Légende » (bandes, symboles, aides clavier
    et zoom) ;
  - au pied, collés en bas de la colonne comme une légende de carte (ils défilent avec elle sous 640 px de hauteur de
    fenêtre ; collés, la colonne garde leur hauteur de marge quand elle défile vers un contrôle atteint au clavier, qui
    n'est jamais caché dessous) : « Chiffrer pour : [référence ▾] » sur une ligne et « Couleurs » (dès 300 px de large,
    quatre colonnes : le titre et l'échelle sur la première ligne, les quatre boutons toujours sur la deuxième, si bien
    qu'aucun ne bouge quand « Aucune » retire l'échelle) ; « Aucune case libre ne bat la position actuelle. » y laisse
    la place quand la carte du produit suivi dit déjà « Rien de mieux ailleurs ».

Sans entreprise (spectateur, plus d'entreprise), l'en-tête, « Mes usines » et ce qui les suit cèdent la place à « Pas
d’usine à visiter. », son explication et « Voir les options » (l'onglet de l'entreprise) ; les plis (sans « Gisements et
filiales ») et le pied restent. Chaque ligne prend un chemin de la carte, sans rien miser ni envoyer : le nom d'un
produit fait comme « Chiffrer pour » (il sélectionne son usine à la place d'une autre usine, mais garde une case libre
sélectionnée, chiffrée pour lui) ; 📍 sélectionne toujours l'usine ; « Ailleurs », ↗ et une case trop tardive sélectionnent la case libre
chiffrée pour ce produit, sans mode déménagement ni formulaire (cela coche « Comparer une case libre ») ; ✉ ouvre le
formulaire de la mise sur sa case ; une entrée de pli sélectionne sa case. Suivre un produit d'une autre de mes
entreprises (au sélecteur, dans le choix de simulation hors comparaison) en fait l'entreprise aux manettes ; changer d'entreprise aux
manettes suit son premier produit, sauf si le produit suivi est déjà à elle. Le menu « Aller à » n'existe que dans la
barre d'une ligne : à sa place, la colonne répartit ses entrées entre les cartes, les lignes sous les cartes et les
plis. Une seule des deux présentations est montée à la fois ; elles partagent l'état de la carte. Il n’y a plus de carnet sous le plateau ni de liste des terrains de
départ (leur repère ☆ et leur fiche suffisent ; le sien figure aussi dans « Mon entreprise »). La fiche
contextuelle se replie par son bouton ou Échap depuis la fiche et se rouvre à la sélection suivante, sans
persistance. Elle expose d’abord le nom, le bassin (sans l’identifiant de la case, inscrit sur le plateau ; pas de
bassin pour une ville) et une ligne d’état, puis le chiffre qui décide ; voisins et explications longues restent dans
des sections repliées. Sur une case libre, l’état dit « Case libre », « Ville · 33 % des clients du pays » ou
« Terrain de départ libre : case ordinaire pour un nouveau venu », puis, tant qu’une mise reste possible, un titre chiffré : pour un de mes produits,
« Déménager Turbo Glucose ici : +65 k€/trim. · remboursé en ~3 trim. à la mise à prix (150 k€) » ; pour une usine
neuve du secteur suivi, « Usine de Boissons énergisantes ici : +1,3 M€/trim. · remboursée en ~3 trim. à la mise à
prix (…), lancement compris » (sans entreprise dirigée, le remboursement d’une start-up, terrain seul). Gain,
mise à prix, remboursement et verdict viennent de `hexCellBid` (`hexPayback.ts`), la même fonction que le résumé du
formulaire d’enchère, pris à la mise à prix et comparés aux trimestres restants : « pas rentable avant la fin :
~9 trim., il en reste 4 » ou « aucun gain à espérer » s’écrivent en rouge. Si mon produit occupe son terrain de départ
et que des effets y courent encore (même règle que l’avertissement du formulaire), le remboursement est dit « hors
privilèges » et le titre ajoute « quitte Île-aux-Niches : impôt 0 % et autres effets perdus ». Viennent ensuite au
plus trois lignes, mise à prix, demande et « dont fret », puis l’action : déménager en tête quand un de mes produits
est suivi, lancer en tête pour une usine neuve. La marge par trimestre sur la case et celle de l’usine actuelle, le
coût par lot, la chaleur vendue et la note d’estimation attendent dans le pli fermé « Pourquoi ce chiffre ? ». Sur la
case de mon usine, l’état dit « Votre usine · Nuit Blanche Max (Boissons énergisantes) », suivi du nom de
l’entreprise quand j’en dirige plusieurs (« … · Blé & Oseille », celle dont la trésorerie paierait le déménagement) ; suivent la marge estimée du
trimestre, la production prévue sur la capacité, la demande et le fret, de mon seul produit (via `privacy.ts`), et
deux boutons, « Ouvrir la fiche produit » et « Chercher où déménager » (« Meilleure marge ailleurs (hors privilèges) »
sur un terrain de départ actif), sans entreprise, direction ni mise à prix ; quand aucune case libre ne bat
l’usine actuelle, le mode déménagement le dit sous son bandeau (« Aucune case libre ne bat la position actuelle. »). Sur la case d’un concurrent, une ligne
publique, « Usine de Sucrâlin SA (dirigée par …) · Taurine Fury (Boissons énergisantes) », avec l’élision du journal
(« Usine d’Oseille SA »), et « Voir l’entreprise » ;
aucune case occupée n’affiche de mise à prix. Sur la case de son usine de départ, tant que le terrain est
actif et produit des effets, une ligne visible sous l’état les résume (« Terrain de départ actif : impôt 0 % ·
scandales ×1,5 · prix perçus −4 % · revente 80 % — perdus si l’usine déménage ») : effets en vigueur de
`ProductView.private.terrainEffects` (via `privacy.ts`), dans l’ordre de la dotation, nouvelles locales comprises,
sans la chaleur ni un impôt qui ne bat plus le taux national, ni la demande d’une usine crypto sur une case
chauffée (le moteur y fond les nouvelles de chaleur, qui suivent le produit sur toute case chauffée et ne sont donc
pas perdues au déménagement ; aucune dotation ne porte sur la demande) ; un effet temporaire y porte ses trimestres restants,
celui-ci compris, calculés par le client depuis les définitions publiques (`TERRAINS`, `turns`) et `view.turn` ; une
suspension par une nouvelle locale s’écrit « effets suspendus pour l’instant ». Le détail (texte d’ambiance, liste
des effets reçus) reste dans « Détails du lieu ». Rien de tel sur la case d’un rival. Dans l’en-tête de « Mon
entreprise », à côté de la ligne du PDG, la même condition affiche une puce « ☆ {terrain} · {point fort} » par
terrain actif (deux après une fusion, sans les privilèges du siège que la fusion annule) ; sa bulle donne les
effets en vigueur (ou « Effets suspendus pour l’instant. »), leur perte au déménagement et invite à cliquer : le clic ouvre « La carte » sur la case de l’usine (même chemin que « Voir sur la carte » de « Mes
usines »). La puce disparaît avec le terrain (déménagement, arrêt du produit, effets expirés). Sur une case libre, la fiche accueille le formulaire
de lancement ou de déménagement sous la mise à prix, la demande et le fret, à la place de ses boutons ; tant qu’il est ouvert, les boutons « Miser pour y déménager … »
et « Y lancer un produit », le titre chiffré et « Que lancer ici ? » s’effacent (le résumé et les boutons de secteur du formulaire les portent), le formulaire ayant son envoi et son « Annuler », qui les fait revenir (le focus clavier revient alors sur le bouton qui l’avait ouvert). Sur un
gisement, elle accueille le panneau complet de l’emplacement (enchère, retrait, sommeil et relance, dernier résultat),
qui dit seul la matière, la richesse, l’exploitant ou « libre » et la capacité : la fiche ne répète alors ni son statut (gardé pour les lecteurs d’écran dans l’en-tête annoncé de la case) ni
son bloc « Gisement d’approvisionnement » (tous deux visibles pour le spectateur) ; pendant une enchère, seuls cet en-tête et
l’enchère restent visibles, le reste de la fiche du gisement rejoint l’unique pli « Détails du lieu » de la case, avec
les voisins. Tout cela pour l’entreprise
« aux manettes » : comme sur la carte classique (§12), les outils du plateau la nomment et, quand le joueur en dirige
plusieurs, une pastille par entreprise permet d’en changer d’un clic. « Aller à › Gisements et filiales » sélectionne le
gisement par défaut sur le plateau, et le « Déménager » de la fiche produit (ouverte depuis la fiche de sa case) la ferme
pour mettre le plateau en mode déménagement : la case de destination se choisit sur le plateau, son formulaire
s’affiche dans la fiche de la case.

Les formulaires hexagonaux ne proposent que les cases libres et envoient case, mise et, lorsque requis, repli au
moteur : aucun paiement ni réservation locale. Dans la fiche de la case, leur résumé laisse la destination et la mise à
prix à la fiche, et nomme son gain comme elle (« Marge / trim. », « Gain vs usine actuelle / trim. »). Les boutons de
secteur du lancement donnent la marge et le remboursement de chaque secteur sur la case (« ⚡ Boissons énergisantes ·
+1,3 M€ · 3 trim. », même calcul que le résumé ; un remboursement trop tardif le dit en mots, « 9 trim., trop tard »,
pas seulement en rouge) ; changer de secteur garde la mise saisie tant que la case, donc sa mise
à prix, ne change pas. Près du champ de mise, une seule ligne de la règle : « Mise secrète. Le gagnant paie la plus
haute mise perdante (au moins la mise à prix). » Le pli fermé « Comment se règle l’enchère ? » réunit la règle complète,
le détail du repli, le calendrier et le solde du lancement, l’aide du déménagement et l’indice transport, la
description du secteur, qui paie et les places de produits. Le repli dit son coût dans ses libellés (« Case libre la
plus proche, payée à sa mise à prix » / « Abandon, sans frais ») ; à l’incubateur, l’échéance du placement d’office
reste visible, comme les pertes d’un déménagement, les avertissements de remboursement et la trésorerie après la mise.
Une mise sur une case n’a pas de raccourcis ¼ / ½ / max (ceux des gisements restent). Le plafond garde les frais de déplacement ou de lancement ; un
projet en attente occupe une place de produit. Le remboursement d’une start-up amortit seulement la réserve par
son bénéfice trimestriel, sans trimestre d’attente ni frais de déménagement. « Mes mises » rassemble les engagements
privés, leur retrait et les résultats conservés jusqu’à la clôture suivante ; dans « Mon entreprise », sous les
matières et les filiales, avant les finances, elle n’apparaît que si une mise attend ou qu’un résultat est à lire. Après une perte de contrôle, une mise
est signalée comme tombant à la clôture et son retrait est désactivé. Les lectures de `.private` dans `city/` passent
par `privacy.ts`, qui fournit aussi les mises encore valables et les contrats du joueur. `?mock=hex` utilise le vrai
moteur, l’attribution équitable et la clôture par « Je suis prêt » ; `&lang=en` active l’anglais. Le mode classique
prend les mêmes décisions dans les fiches de sa carte (§12).

À côté de « Je suis prêt », « Mon trimestre (n) » / « My quarter (n) » ouvre le panneau de contrôle du trimestre,
accessible au clavier et refermable par Échap ou un clic extérieur. Si une fenêtre est ouverte au-dessus, Échap
ferme seulement cette fenêtre. Le panneau partage avec « Mes mises » le modèle et les lignes d'enchères du plateau.
Son compteur additionne les engagements encore listés (mises, offres envoyées en attente et sorties d'entente),
les offres reçues à examiner, les chantiers déjà payés identifiables dans la vue et les mises d'une entreprise dont
le contrôle est perdu. Il ne mesure donc ni le nombre de réglages modifiés ni le nombre de décisions encore
retirables ; à zéro, le bouton dit simplement « Mon trimestre ». Les enchères résolues restent exclues : le bilan
de clôture les rapporte. Les mises sous contrôle perdu sont comptées mais séparées dans « Contrôle perdu : ces
mises tomberont à la clôture », sans retrait possible. Les lignes se regroupent par entreprise lorsqu'il y en a plusieurs.
« Engagé à la clôture » détaille la mise et les frais de lancement ou de déménagement associés ; une start-up
n’engage que son terrain, son investissement de fondation étant déjà payé. Les mises sur gisements engagent au
plus le montant proposé. Pour chaque entreprise, le total des enchères est comparé à la trésorerie et reprend
l’avertissement du plan de clôture lorsqu’elles ne sont pas couvertes. « Voir » ouvre la bonne fiche sur la carte
(lancement, destination d’une mise de déménagement ou de start-up, gisement) ; « Retirer » annule la mise sans
confirmation et permet d’en déposer une autre.

Le panneau inclut les offres envoyées encore en attente : les achats de titres chiffrent le montant engagé à
l’acceptation (nombre de titres × prix), et les contrats et propositions de cartel indiquent leurs conditions sans
inventer une dépense comptant. « Voir » mène aux Tractations ; « Retirer » annule l’offre. Les offres reçues mènent
aux Tractations pour y répondre. Une sortie de cartel prévue à la clôture est signalée sans possibilité d’annuler.
« Déjà payé ce trimestre » reste une section courte : elle montre les lancements classiques payés ce trimestre
et les extensions de capacité encore en chantier, identifiables précisément dans la vue reçue. Elle n'invente
aucun montant et ne prétend pas reconstituer les emprunts, dividendes, rachats ou transactions déjà exécutés ;
les lancements du plateau payés à la clôture précédente ne deviennent pas des achats du trimestre courant.
Ces opérations payées ne proposent aucun retrait. Une ligne « Aucune offre ni mise en attente » peut coexister
avec cette section, sans annoncer que le trimestre ne contient aucune action.

Un volet distinct, fermé par défaut, « Réglages enregistrés pour la clôture », détaille par entreprise et par
usine en production le prix, la production visée, le marketing et la R&D actuellement enregistrés. Ces valeurs
restent modifiables et reconduites au trimestre suivant ; elles ne gonflent pas le compteur des engagements et
chantiers. Le volet ne reconstitue pas les gestes de l'utilisateur et n'affiche pas de brouillons non enregistrés.

## 12 bis. Langues

Le jeu existe en **français** (langue par défaut) et en **anglais**. La version anglaise est une adaptation, pas une traduction : montants en dollars (`$12.5M`, `$850k`), dates `Q3 2027`, journal rebaptisé *The Daily Capital*, satire façon presse financière anglo-saxonne, noms de bots et de PNJ réinventés (toujours sans vraies personnes ni vraies marques).

- **Langue du salon** : `GameConfig.lang` (`'fr'` par défaut, choisie par l'hôte). Elle fixe la langue de **tout** texte produit par le moteur : journal (news, titres, citations, édito, flashs, rumeurs, clôture), messages des actions (y compris refus et erreurs), noms des bots, des PNJ et des produits par défaut, PDG « Pilote automatique » / « Autopilot ». Chaque joueur garde par ailleurs sa langue d'interface (protocole `player:lang`).
- **Protocole du choix au salon** : en carte hexagonale et mode `choice`, `lobby:pickTerrain` porte
  `{ terrainId: string | null }`. Seul l'humain dont c'est le tour peut prendre un terrain valide libre ; `null`
  libère son propre choix à tout moment dans ce mode. `LobbyView.terrainPickOrder?: Id[]` donne l'ordre public des
  humains, et `terrainPickTurn?: Id | null` le premier sans choix (`null` quand tous ont choisi) ; ces champs sont
  absents hors de ce mode. Les arrivants sont ajoutés à la fin, les partants retirés avec leur choix. Changer de
  mode d'attribution ou de carte efface choix et ordre ; entrer en `choice` tire un nouvel ordre avec le hasard du
  serveur, sans toucher au RNG du moteur. Réenvoyer le même mode garde les choix. Le chemin `lobby:config.terrains`
  reste réservé aux placements par l'hôte. Refus et message des humains placés automatiquement après démarrage
  sont envoyés dans la langue d'interface de leur destinataire, en français ou en anglais.
- **Montants à l'écran** (client, `fmt.money`) : l'interface compte en k. Sous 10 k, un montant s'écrit en k avec une décimale (« 4,0 k€ », « $4.0k », « -0,7 k€ ») ; ce qui s'arrondit à zéro s'écrit « 0 k€ » / « $0k », sans signe ni décimale, et ce qui s'arrondit à 10 comme 10 k (« 10 k€ ») ; au-delà, « 850 k€ », « 12,5 M€ » (« $850k », « $12.5M »). Le cours d'une action garde son propre format (`fmt.sharePrice` : « 5,23 k€ », et « 830 € » / « $830 » sous 1 k). Les textes écrits par le moteur (articles du journal, messages) et les rubriques du journal gardent `formatMoney`, qui écrit les petits montants en unités (« 3 993 € »), comme le prix du numéro dans l'en-tête (« Prix : 3 000 € (déductible) »).
- **Contenu** : `getContent(lang)` ; le contenu anglais (`content/en/*`) ne contient que des textes indexés par identifiant, fusionnés sur les données françaises (effets, paramètres). Textes propres au moteur : catalogue `sim/i18n.ts` (mêmes clés en `fr` et en `en`).
- **Même simulation dans toutes les langues** : les nombres ne dépendent jamais de la langue. Les choix de texte passent par hachage, sans consommer le RNG. Les choix visibles qui ne comptent pas (textes d'ambiance, noms des filiales, noms suggérés) hachent la **graine des textes** (`GameConfig.textSeed`), que le serveur tire à part : publique, elle ne trahit rien de la graine de la simulation, restée secrète (sans elle, ces choix publics permettaient de retrouver la graine par force brute, et avec elle les news et les cours à venir) ; les tirages cachés (tuyaux, départage des enchères) gardent la graine secrète ; les tirages au RNG portent sur des données communes (cartes de référence, indices de listes de même longueur) ; les bots lisent les rumeurs par identifiant. Une partie jouée avec la même graine et les mêmes ordres donne exactement les mêmes chiffres en français et en anglais (vérifié par `engine.i18n.test.ts`).
- **Gabarits** : en français, élision de « de »/« que » (§9) ; en anglais, « a »/« an » selon le son initial, possessif `{x}'s` réduit à `{x}'` après un s final, et formules vagues anglaises (« a listed company ») pour une valeur manquante.
- **Salon et plateau** : le salon offre un réglage « Carte » (« Classique » / « Plateau », réservé à l'hôte) et, en mode plateau, un réglage « Terrains de départ » avec les cinq modes d'attribution du §5.8 ter (« Équitable », « Équitable varié », « Au hasard », « Au choix », « Placés par l'hôte »), chacun accompagné de sa ligne d'aide : « Équitable varié » annonce un tirage au sort parmi les attributions presque aussi équitables que la meilleure (à 20 k par trimestre près) — l'équité reste, la surprise aussi — et « Au choix » annonce que chaque humain choisit son terrain à son tour, dans un ordre tiré au sort, les bots n'ayant pas de tour au salon. La section des terrains de départ, titrée du nom du Commissariat, vient après la liste des actionnaires et « Votre entreprise » : on choisit son secteur avant de lire « pour vous ». Quand le moteur attribue (« Équitable », « Équitable varié », « Au hasard »), elle tient en une ligne — terrains attribués équitablement au lancement de la partie, ou tirés au sort en mode « Au hasard » ; sur la carte, ☆ marque les huit terrains de départ, le sien étant celui de son usine, rappelé dans « Mon entreprise » — suivie d'un repli fermé « Voir les 8 terrains » qui contient les cartes ; la devise du Commissariat n'y figure pas. En modes « Au choix » et « Placés par l'hôte », les cartes restent ouvertes sous la devise. Chaque carte, visible par tous, est compacte : nom, case, point fort · point faible sur une ligne, puces d'effets et puce d'appréciation du secteur du lecteur (« pour vous : … »), puis les commandes du mode ; son repli « Détails » donne le texte d'ambiance, puis l'appréciation du moteur pour chaque secteur (§5.8 ter) ; en mode « Placés par l'hôte », ce repli est ouvert d'office chez l'hôte, qui place chacun selon son secteur, et son intitulé porte, pour les lecteurs d'écran, le nom du terrain. Noms, libellés et textes d'ambiance viennent du serveur dans la langue du salon (`config.lang`), tandis que la puce d'appréciation du secteur du lecteur et les puces d'effets sont rendues dans sa langue d'interface (`player:lang`). En mode « Au choix », l'ordre de choix des humains tiré par le serveur (`terrainPickOrder`) s'affiche numéroté au-dessus des cartes, le joueur dont c'est le tour (`terrainPickTurn`) en surbrillance ; quand c'est le tour du lecteur, une invitation en haut du salon, au-dessus des réglages (« À vous de choisir votre terrain de départ. »), porte un bouton « Choisir mon terrain ↓ » qui fait défiler jusqu'au titre de la section et lui donne le focus ; chaque carte de terrain libre porte un bouton « Prendre ce terrain », actif seulement pour ce joueur ; la carte de sa propre prise affiche « Votre terrain » avec un bouton « Libérer », celles prises par les autres sont marquées « pris par {joueur} », et une note rappelle que l'hôte peut démarrer à tout moment, les humains sans choix recevant alors un remplissage équitable au démarrage. En mode « Placés par l'hôte », l'hôte attribue les parcelles depuis la liste des joueurs (toute la carte est renvoyée à chaque changement) ; chaque sélecteur porte une étiquette « Terrain » visible et reste désactivé tant que le changement précédent n'est pas confirmé, et la ligne d'aide du mode, lue par tous, est rédigée de façon neutre (« L'hôte place chaque joueur à la main ; les joueurs sans choix recevront un terrain restant, attribué équitablement au démarrage. »). Les autres joueurs voient les attributions en lecture seule sur les cartes, et les parcelles non attribuées sont marquées libres (case ordinaire si personne ne les reçoit).

## 13. Équilibrage

`npm run sim` joue 20 parties de 16 tours entre 4 à 6 bots (options `--games`, `--turns`, `--seed`, `--idle-human`, `--interns` pour des bots « stagiaires », `--experts` pour des bots « experts », `--expert-params fichier.json` pour essayer d'autres réglages des experts, `--verbose`, `--lang fr|en`) et affiche valeurs nettes, OPA, faillites, scandales, fusions, filiales ouvertes, cours et un extrait du journal. Repères historiques avant les tempéraments sectoriels (graines 1 à 20) ; les mesures actuelles figurent dans le rapport de la tâche 27/27b ci-dessous :

- valeur nette finale des joueurs : médiane ~2 × la mise de départ (~45 M€ pour ~21 M€ ; 40 M€ sur 200 graines), de 0 pour les perdants à plus de 150 M€ ; écart gagnant/perdant médian ×3,5 à ×4 par partie ; la personnalité R&D (brevet) et le raider (tweetard) gagnent le plus souvent, l'escroc finit dernier ;
- ~88 % de trimestres bénéficiaires ; cours des entreprises de départ ×1,8 en médiane sur 16 tours (×1,7 sur 200 graines), avec une forte dispersion (q10 ≈ ×0,7, q90 ≈ ×3,4) ; variation médiane du cours de 9 % par trimestre ;
- ~2 OPA par partie (aucune avant le tour 3, tour moyen ~10), dont environ une sur douze évince un PDG joueur ; 1 à 2 entreprises distinctes changent de mains par partie, souvent suivies d'une fusion ; ~1,3 alerte (lanceur d'alerte) par partie ;
- faillites rares (~0,01 par partie), appels de marge rares (0 à 0,3 selon la tablée), ~4 scandales par partie ; ~0,8 filiale d'approvisionnement ouverte par partie, ~3,5 news par partie qui changent le coût d'extraction d'une matière, ~0,1 mise en sommeil par partie ;
- secteurs : énergie, gadgets, trottinettes et yaourts se valent à peu près ; la crypto (demande volatile, coûts très exposés aux puces et au pétrole) rapporte le moins aux bots ;
- un humain totalement passif termine autour des quatre cinquièmes de sa mise (~17 M€ sur 100 graines), sans jamais gagner ; son entreprise reste bénéficiaire dans tous les secteurs.
- dernier trimestre : `profitEma` n'est pas mis à jour à la dernière résolution, pour que couper marketing et R&D à la clôture ne gonfle pas la valorisation finale (l'économie réalisée compte seulement en cash, via la valeur comptable).

**Calibrage des secteurs** (`content/sectors.ts`). Dans un logit, le prix optimal d'un produit vaut à peu près `coût × e(1 − s) / (e(1 − s) − 1)` (e = élasticité, s = part de marché). La première version (e = 1,2 à 2,2) plaçait cet optimum à 2-6 × le coût, soit 1,5-5 × le prix de référence, alors que la demande dépassait la capacité au prix de référence : monter une seule fois son prix multipliait la fortune finale par 3 à 12 (la crypto culminait au plafond de 300 %). Calibrage historique, avant la bulle crypto : élasticité 4,5 partout, capacités de départ et demandes de référence ajustées pour que la demande d'un produit de départ au prix de référence soit du même ordre que sa production, bots qui baissent leur prix quand leur usine tourne à vide. Mesures (graines 1-20, un humain scripté qui fixe son prix à m × référence et cale sa production sur ses ventes) : le meilleur m est entre 1 et 1,2, et fait gagner de 0 à 40 % de valeur nette par rapport à m = 1 (≈ ×1,8 en crypto, où la demande est volatile) ; au-delà de ×1,3, on perd. Un humain « actif » (tâtonnement de prix, capacité agrandie quand tout est vendu, nouveaux produits) gagne environ deux parties sur trois contre les bots, avec ~1,4 × la fortune du meilleur bot.

Aucune valeur NaN ou infinie n'apparaît ; le filet de sécurité (`sanitize`) n'a jamais eu à corriger une valeur.

### Tempéraments sectoriels (tâches 27, 27b, revue 29 et clôture 29b, octobre 2026)

Changement volontaire des règles classiques et hexagonales : les tests d'or et les références de simulation
sont renouvelés. La référence précédente est la branche crypto finale `ef32e85` ; `fe212e2` sert de témoin
des défauts relevés en revue 29. Les élasticités crypto, son marketing ×2, sa volatilité et sa bulle sont
conservés. La valorisation d'ouverture et les décisions initiales sont recalculées pour chaque secteur (§4).
La tâche 27b corrige le pilotage normal sous coût, les lignes sans offre et la répétition des krachs (§5.1) ;
la revue 29 sépare le blocage de douze clôtures du renfort de mauvaises nouvelles limité à trois clôtures.
La demande de référence reste un levier de calibrage économique, comme celle des secteurs physiques.

Les montants sont en **k€** ; prix et coût de capacité sont par lot, demande et capacités en **lots**. Les paramètres
facultatifs absents valent persistance 0,75, marketing ×1, R&D ×1 et déclin qualité 0,99.

| Secteur | Élasticité produit | Élasticité marché | Persistance marque | Marketing | R&D | Déclin qualité | Volatilité |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Boissons | 4,5 → 3,5 | 0 → 0,8 | 0,75 → 0,55 | ×1 → ×1,5 | ×1 | 0,99 | 0,08 |
| Gadgets | 4,5 → 6,5 | 0 → 1,2 | 0,75 | ×1 | ×1 → ×1,5 | 0,99 → 0,93 | 0,12 |
| Trottinettes | 4,5 | 0 → 1 | 0,75 | ×1 | ×1 | 0,99 | 0,10 → 0,025 |
| Yaourts | 4,5 → 2 | 0 → 0,6 | 0,75 → 0,90 | ×1 | ×1 | 0,99 | 0,04 |
| Crypto | 1,5 | 1,5 | 0,75 | ×2 | ×1 | 0,99 | 0,28 |

| Secteur | Exposant qualité | Progrès qualité extérieure/trimestre | Sensibilité news | Marque initiale existante | Base de marque sans publicité |
| --- | --- | --- | --- | --- | --- |
| Boissons | 1,3 | 0,04 | 1 | 0,3 | 0,3 |
| Gadgets | 3,5 | 0,08 | 1 | 0,3 | 0,3 |
| Trottinettes | 1,3 | 0,04 | 0,3 | 0,3 | 0,3 |
| Yaourts | 1,1 | 0,04 | 1 | 1 | 0,5 |
| Crypto | 1,3 | 0,04 | 1 | 0,3 | 0,3 |

| Secteur | Prix de référence | Demande de référence | Capacité de départ | Coût de capacité | Coûts fixes/trimestre | Lancement |
| --- | --- | --- | --- | --- | --- | --- |
| Boissons | 100 → 85 → 89 | 280 → 250 | 70 | 40 | 200 | 2 000 |
| Gadgets | 300 → 305 → 306 | 100 → 105 | 30 | 150 | 300 → 150 | 3 000 → 2 500 |
| Trottinettes | 400 → 435 → 438 | 70 → 55 | 21 | 200 | 300 | 3 000 |
| Yaourts | 50 → 57 → 61 | 450 → 235 | 120 → 40 | 15 | 100 → 300 | 1 200 → 1 800 |
| Crypto | 200 → 260 | 110 → 75 | 34 | 60 | 150 → 450 | 1 500 → 2 500 |

- **Boissons** : prix 89 (85 avant le fret réel) et demande 250 limitent leur ancien avantage de marge ; le marketing ×1,5
  et la persistance 0,55 demandent une publicité régulière. Capacité 70 et coûts historiques sont conservés.
- **Gadgets** : la qualité perd 7 % par trimestre sans recherche, pèse avec un exposant 3,5 et fait face
  à une concurrence extérieure progressant de 0,08 par trimestre. La R&D ×1,5 améliore le rendement
  technique ; les bots choisissent leur budget selon son rendement estimé, sans facteur stratégique imposé.
  Les coûts fixes 150 et le prix de référence 306 (305 avant le fret réel) dégagent une contribution pour financer cette recherche.
  Le lancement revient à 2 500 : l'ancien coût de 7 000 créait une protection contraire à l'arrivée de
  produits innovants. Demande 105, capacité 30 et coût d'usine 150 restent conservés.
- **Trottinettes** : volatilité propre 0,025 et sensibilité des effets de demande des news 0,3 rendent
  leur demande plus régulière. Prix 438 (435 avant le fret réel) et demande 55 soutiennent les fondateurs dans les compositions
  tournantes et par défaut. Le coût d'usine 200 et le besoin d'un lot de lithium par lot produit maintiennent
  leur caractère industriel ; les news de matières continuent de modifier les coûts.
- **Yaourts** : élasticité produit 2, élasticité de marché 0,6 et persistance de marque 0,90 privilégient
  le prix et la fidélité. Les entreprises existantes commencent avec une marque 1 ; une base durable 0,5
  conserve une clientèle sans publicité et aide les nouveaux entrants à la construire progressivement.
  Capacité initiale 40 au lieu de 100 dans fe212e2, demande 235 et coût fixe 300 limitent la rente et les
  lancements experts. L'exposant qualité 1,1 diminue l'intérêt de la recherche dans ce secteur de fidélité.
  Le prix de référence passe de 57 à 61 pour le fret réel ; le coût d'usine 15 et le lancement 1 800 sont conservés.
- **Crypto** : prix de référence 260 et demande 75 cherchent à soutenir le pilotage normal sans augmenter
  toute la rente experte. Les coûts fixes 450 s'appliquent aussi aux lignes acquises et diversifiées ;
  le lancement 2 500 reste proche des autres secteurs. Capacité 34, élasticités 1,5, marketing ×2,
  volatilité 0,28 et absence de transport sont conservés. Le risque de krach à prix, bulle et volatilité égaux
  n'est pas réduit ; le blocage des krachs et euphories forcées dure douze clôtures, avec seulement trois
  clôtures de renfort des mauvaises nouvelles aléatoires.

Résolution, plan de clôture, estimations du client, valeurs des terrains et bots partagent les formules
sectorielles (§5.4). Les recherches de prix couvrent le domaine légal 0,3–3 × référence ; les deux
élasticités déterminent l'optimum. Les bots normaux adaptent aussi leurs budgets (§10), et les experts
peuvent maintenir la R&D des gadgets dans les derniers trimestres.

La clôture 29b limite le travail à trois campagnes complètes au maximum ; le réglage retenu fait l'objet
d'une confirmation de huit cellules de 240 parties : classique/hexagonal, normal/expert, secteurs tournants
et composition du simulateur. Les écarts aux cibles sont publiés même lorsqu'ils persistent : une option
explicite du générateur permet leur documentation sans relâcher les contrôles de données, d'ouverture ou
de débutants. Les mesures avant/après, prix experts médian/q90, empreintes de dépenses, marges, volatilité,
IQR de fortune, essais rejetés et contrôles sont publiés dans
[11-personnalites.md](../tools/balance-lab/results/11-personnalites.md).
Cette unique confirmation laisse **onze cibles de victoires manquées**, malgré des tempéraments visibles
dans les huit cellules et quatre garde-fous de fortune experte respectés. Les yaourts dominent encore
les campagnes expertes tournantes, les gadgets restent faibles en classique tournant et la crypto chez
les experts ; les compositions normales par défaut favorisent encore les scooters face aux boissons.
Le rapport publie les ratios exacts, leurs limites et les prochains contrôles proposés ; la calibration
n'est donc pas déclarée achevée.
La campagne de terrain du lot 5 devra être relancée après fusion : `TERRAIN_CALIBRATION` reste ajusté
sur l'économie antérieure.

### Historique des réglages

**Lot 1 de l'audit de profondeur (33 560 parties simulées, septembre 2026).** L'audit a montré que la stratégie dominante tenait à trois failles de comptabilité, et non à des choix fins : dépenses hors compte de résultat (payées une fois, capitalisées ×40), com' de crise illimitée qui rendait la triche gratuite, rachat de sa propre entreprise à crédit. Changements :

1. Com' de crise : une par tour, −15 au lieu de −25 ; risque de scandale `((jauge − 10) / 90)^1,5` au lieu de `((jauge − 20) / 80)^1,5` (§7, §8).
2. Espionnage : plus de gain minimal, rien pour le produit déjà en tête (§7).
3. Lancements étalés sur 4 trimestres dans le résultat ; actions discutables et com' de crise en frais spéciaux du trimestre, donc dans profitEma (§5.6). Le multiple de 40 n'a pas été touché.
4. Délit d'initié : +1 de jauge par 1 % de sa propre entreprise acheté, flash dès 5 % dans le tour ; ces actions ne comptent qu'à 25 % dans le plafond du prêt perso (§6.2, §6.4).

Bots adaptés : com' de crise dès 35 de jauge, plus de lancement dans les 4 derniers trimestres, actions discutables seulement sous 40 de jauge, levier de prédation recalibré (§10). Mesures `npm run sim` (graines 1 à 200), avant → après : valeur nette médiane 39,7 → 38,0 M€ ; OPA 2,33 → 1,98 par partie (sans recalibrage du levier des bots : 1,60), dont PDG joueurs évincés 25 → 18 sur 200 parties ; faillites 0,03 → 0,01 ; appels de marge 0,23 → 0,04 ; scandales 4,2 → 5,0 ; trimestres bénéficiaires 90 → 87 % ; cours médian des entreprises de départ à T16 ×1,69 → ×1,65 ; crypto ×0,94 → ×0,84 ; l'escroc (magouillac) 19,9 → 17,6 M€. Avec un humain passif (100 graines) : 15,9 → 15,1 M€.

**Lot 2 (septembre 2026).** Mesuré sur le banc d'audit (joueurs scriptés qui ne voient que leur `PlayerView`, 2 bots par table, IC à 95 % par grappes de graines ; l'optimiseur n'a pas été ré-optimisé pour ces règles). Changements :

1. Flottant minimal de 30 % au-delà de 50 % + 1 action, rachats d'actions compris (§6.2).
2. Com' de crise : réputation +0,05 seulement sous 1 (§7).
3. Décisions cachées jusqu'à la résolution : prix des rivaux du trimestre précédent, lancement livré au trimestre suivant (§2, §5.2, §7, §12).
4. Lanceur d'alerte : 500 k€ perso, jauge doublée dans la limite de +15, niveau exact publié (§7, §8).
5. Fusions à 6 produits ; bots prédateurs qui visent aussi les entreprises de joueurs rentables (§7, §10).
6. Start-up réservée au retour en jeu, subventionnée par le parachute (§7).
7. Aides de lecture dans la vue (ventes et marge estimées, rentabilité d'un lancement, relation cours / bénéfice) et bots « stagiaires » (§10, §12).

La hausse du coût de lancement avec le nombre de produits (testée : −35 % au sommet, mais ablation « sans lancements » seulement 0,12 → 0,16) n'a pas été retenue : lancer des produits est le moteur de croissance du jeu, il faut le rendre lisible (estimation de rentabilité), pas le taxer. Une variante plus forte du lanceur d'alerte (le cours de la cible perd la moitié du niveau publié, en %) a été testée et écartée : elle rendait la dénonciation rentable contre tout PDG qui rachète ses propres actions, donc contre les honnêtes.

Mesures, lot 1 → lot 2 :
- part de sa propre entreprise détenue en fin de partie par les optimiseurs : 97 % → 67 % ;
- méta (8 stratégies, 60 graines, duels) : le meilleur (optimizer-full) bat le 2e (optimizer-clean) dans 89 % des duels [84–94] (96 % au lot 1) ; face à un « vigilant » (optimizer-clean + une alerte par tour contre son rival), optimizer-full ne gagne plus que 79 % des duels, et le vigilant ne perd rien face à l'honnête (43 %, non significatif). Pas encore de cycle A > B > C > A significatif ;
- mêlée à 9 : optimizer-full gagne 14 % des parties (59 % au lot 1), le spéculateur 46 %, le raider 24 % ; OPA entre joueurs 1,26 par partie ;
- effet de l'ordre de jeu dans le tour (écart maximal à 50 %, 60 graines) : optimizer-ops 27 → 17 points, optimizer-full 15 → 13 ; « jouer en premier au T1 seulement » ne donne plus rien (optimizer-ops : 77 % → 47 %) ;
- échelle (table à 4, 200 graines) avec les bots normaux : casual devant novice 74 %, expert devant novice 99 % ; les bots, plus prédateurs, finissent plus souvent devant le novice (novice devant les 2 bots : 26 → 19 %) ;
- avec les bots stagiaires : novice devant les 2 bots **56 %**, casual devant les 2 bots 85 %, casual devant novice **76 %**, expert devant novice 99,9 %.

`npm run sim` (graines 1 à 200), lot 1 → lot 2 : valeur nette médiane 38,0 → 40,1 M€ ; OPA 1,98 → 1,79 par partie, dont PDG joueurs évincés 18 → 30 sur 200 parties ; alertes 1,74 par partie ; appels de marge 0,04 → 0,19 ; scandales 5,0 → 4,8 ; start-ups 0,02 → 0,04 ; trimestres bénéficiaires 87 % ; cours médian des entreprises de départ à T16 ×1,65 → ×1,74 ; crypto ×0,84 → ×0,68 (les bots n'achètent plus d'abord les PNJ les moins chers) ; l'escroc (magouillac), cible favorite des alertes : cours de son entreprise ×0,65 → ×0,39. Avec un humain passif (100 graines) : 15,1 → 17,4 M€. Avec des bots stagiaires et un humain passif (200 graines) : aucune OPA, humain passif ~18 M€.

**Mesure finale (septembre 2026).** Banc d'audit synchronisé sur le lot 2, optimiseur ré-optimisé pour ces règles (graines d'entraînement 10001-10012, validation 10013-10042), environ 20 000 parties. Deux réglages retenus :
1. `FLOAT_MIN` 30 % → 40 % (§6.2) : au sommet, part détenue en fin de partie 70 % → 60 %, ablation « sans auto-contrôle » 0,53 → 0,60, optimizer-full devant optimizer-clean 95 % → 89 % des duels ; aucun effet sur les parties entre bots ni sur l'humain passif.
2. Com' de crise −15 → −13 (§7) : ablation « sans com' de crise » (variante qui garde un budget de jauge) 0,58 → 0,63, écart de fortune optimizer-full / optimizer-clean ×1,59 → ×1,47, meilleur contre 2e 78 → 71 %. À −12, le meilleur ne battait plus le 2e que dans 60 % des duels (sous la cible).

Mesures avec les règles finales :
- méta : le meilleur (optimizer-full) bat le 2e (le vigilant) dans 71 % des duels [65–78], dans la cible 65-80 % (100 % avant l'audit) ; le vigilant bat l'honnête (58 %, significatif) ; toujours aucun cycle A > B > C > A ;
- le meneur de la table à 4 niveaux au T8 ne gagne plus que ~64 % des parties (98 % avant l'audit) ;
- échelle (table à 4), bots normaux / stagiaires : casual devant novice 75 / 76 %, novice devant les 2 bots 20 / 60 %, expert devant novice 97 / 100 % ;
- effet de l'ordre de jeu (écart maximal à 50 %, 100 graines) : optimizer-ops 4 points, optimizer-full 7, compétent 8, industriel 15 (seulement s'il joue toujours en premier) ;
- OPA entre joueurs : 0,31 par partie à la table à 4, 1,42 dans la mêlée à 9, ≈ 0 entre deux joueurs forts en duel ;
- leviers encore au-delà de ×2 : les lancements (×5,6) et « investir tôt, récolter tard » (×3), le cœur du jeu ; l'auto-contrôle et la com' de crise sont revenus à ×1,6.

**QA « exploits » (septembre 2026).** Recherche de séquences d'actions légales qui rapportent sans risque (scripts de reproduction hors dépôt). Corrigé :
1. Impact de prix exponentiel, indépendant du chemin, pour les actions et les matières (§5.5, §6.2) : l'aller-retour vente → rachat dans le tour rapportait +63 % de valeur nette ; il ne rapporte plus rien (actions) ou coûte la décote de 5 % (matières).
2. Délit d'initié contourné en cédant le contrôle puis en rachetant dans le tour ; start-up de retour en jeu obtenue de la même façon en gardant son entreprise (§6.2, §7).
3. Fuites de la vue : compteur d'alertes d'un rival (source « anonyme » identifiable), lobbying d'un rival visible dans les estimations avant la résolution (§12).
Vérifié sans faille rentable : lanceur d'alerte en boucle (une fois par tour, rien contre une entreprise propre), amortissement des lancements (les charges restent à l'entreprise après l'arrêt du produit, suivent la fusion, et un lancement tardif coûte son cash), com' de crise avant fusion (la jauge fusionnée est le maximum), fusion pour dépasser le flottant minimal (la part fusionnée est une moyenne des deux), 6 produits après fusion (il faut vraiment absorber une entreprise). Restent publics pendant le tour, comme avant : trésorerie, réputation et niveau de jauge des rivaux, cours des matières (§12). Les rapports trimestriels publiés (après la résolution) montrent aussi la ligne « Frais spéciaux » des rivaux : comme dans de vrais comptes, un lecteur attentif y devine les combines du trimestre passé, ce qui aide à choisir la cible d'une alerte.

**QA « cohérence » (septembre 2026).** Relecture spec / code / textes / vues :
1. Bots : la com' de crise est décidée en fin de tour, après le bonus et l'action discutable (§10). Avant, un bot cupide pouvait finir son tour à plus de 50 de jauge alors qu'il avait encore la com' de crise en main. `npm run sim` (200 graines), avant → après : scandales 5,0 → 3,7 par partie, appels de marge 0,17 → 0,07, alertes 1,8 → 1,3, OPA 1,75 → 1,91, valeur nette médiane 38,0 → 40,1 M€ ; l'escroc reste dernier (19,9 → 21,6 M€). Humain passif (100 graines) : 16,4 → 16,6 M€.
2. Vue : le compteur d'actions discutables d'un rival est masqué pendant la partie (§12).
3. Textes d'aide (FR/EN) : le flottant minimal ne s'applique qu'au-delà de 50 % (« le public garde toujours 40 % » était faux) ; la dernière résolution ne compte pas dans le bénéfice lissé (§13).

**Rumeurs (septembre 2026).** Une rumeur « faible » n'était jamais vraie (la vraie rumeur ne pouvait être que « élevée » ou « moyenne ») : un joueur qui l'avait compris les ignorait toutes. Cibles retenues : 80 / 40 / 10 %. La vraie rumeur est désormais « faible » 12 % du temps, et les fausses sont moins souvent « élevées » (§9). Part de rumeurs vraies selon la fiabilité affichée, avant → après (parties de bots, jusqu'à 4 500 numéros) : « élevée » 78 → 80 %, « moyenne » 34 → 40 %, « faible » 0 → 10 %. Les bots ne misent que sur les rumeurs « élevées », désormais un peu plus rares et plus sûres. `npm run sim` (graines 1 à 200), avant → après : valeur nette médiane 40,1 → 41,2 M€ ; OPA 1,91 → 1,89 par partie ; appels de marge 0,07 → 0,07 ; trimestres bénéficiaires 88 → 88 %.

**Intégration verticale et tractations (septembre 2026).** Filiales d'approvisionnement (§5.5 bis) ; cessions d'actions de gré à gré, contrats de fourniture et ententes sur les prix (§7 bis). Entre bots, seules les filiales changent les parties (un bot ne propose pas d'affaires). Premier réglage (ouverture 80 × le prix de base, extraction à 50 % du prix de base) : valeur nette médiane 41,2 → 48,0 M€, trop généreux ; retenu : ouverture 100 ×, extraction à 70 %, pas de nouvelle filiale pour un bot dans les 8 derniers trimestres. `npm run sim` (graines 1 à 200), avant → après : valeur nette médiane 41,2 → 43,2 M€ ; OPA 1,89 → 1,85 par partie ; 1,6 filiale ouverte par partie ; trimestres bénéficiaires 88 → 88 % ; scandales 3,9 par partie. Humain passif (100 graines) : 17,5 M€.

QA « exploits » avant la mise en ligne, corrigé :
1. Un bot jugeait une offre au cours du moment, manipulable dans le trimestre : acheter en bourse pour gonfler un cours puis lui revendre au prix gonflé rapportait toujours (on achète au prix moyen, sous le prix final) ; faire flamber une matière puis lui faire signer huit trimestres à ce prix, encore plus. Il retient désormais le moins favorable du cours du moment et de la dernière clôture (et du prix de base pour un contrat), ne paie jamais une action au-dessus de sa valeur fondamentale, et ne signe que pour ses besoins non couverts (ou le surplus de ses filiales) (§10).
2. Un contrat entre deux entreprises du même dirigeant, à n'importe quel prix de la fourchette, faisait passer l'argent des actionnaires minoritaires de l'une vers l'autre : prix de pleine concurrence, ± 10 % de la dernière clôture (§7 bis).
3. Quitter une entente puis la reformer remettait son ancienneté, donc son risque, à zéro : le passé d'entente est désormais compté par entreprise et ne s'efface pas (§7 bis).

Relecture adverse (scripts de reproduction hors dépôt), corrigé ensuite :
4. Contrats croisés entre ses propres entreprises : les mêmes 50 lots, livrés 60 fois dans une clôture, faisaient passer 10 M€ d'une entreprise à l'autre (au détriment de ses actionnaires minoritaires). Désormais : stock livrable figé au début des livraisons, un seul contrat par paire et par matière.
5. Deux complices se repassaient le bloc de contrôle au prix plancher : 12 « OPA » dans un trimestre, 6 M€ de parachutes tirés de la caisse. Une cession de contrôle par son dirigeant est une passation, sans parachute, et le rachat par l'ancien dirigeant dans le trimestre est un délit d'initié.
6. Entrer dans une entente, lire les prix des partenaires et sortir avant la clôture ne coûtait aucun tirage ; proposer une entente à quelqu'un révélait s'il était déjà dans une autre, et un bot membre faisait entrer n'importe qui. Sortie effective à la clôture, rien de révélé à l'envoi, seul un membre invite.
7. Un bot achetait un bloc de sa propre entreprise (délit d'initié public, +7 de jauge pour 65 k€ de frais) : il refuse.
8. Un vendeur sous contrat ne livrait que s'il y trouvait son compte (une option gratuite) : dédit par lot manquant ; et les réponses d'un bot à des contrats de tailles croissantes trahissaient sa production prévue : il juge ses besoins sur ses capacités, publiques.

**Bots experts (septembre 2026).** Troisième niveau de bots (§10), porté des stratégies « compétent » et « expert » du banc d'essai. Premier portage tel quel : chaque expert, excellent seul, investit à perte au même moment que les autres ; à une table d'experts (`npm run sim -- --experts`, 20 graines), valeur nette médiane 28,0 M€, 2,3 faillites, 4,35 OPA et 53 % de trimestres bénéficiaires par partie, cours des entreprises de départ ×0,35 au T8. Corrections, dans l'ordre : plancher de bénéfice (médiane 40,2 M€, 0,3 faillite) ; rivaux supposés progresser de 4 % par tour, produits annoncés comptés, seuil de lancement ; charges de lancement exactes (`private.launchChargesNext`) et produit lancé sans budget le premier trimestre (44,9 M€, 0 faillite, 2,7 OPA) ; calibrage en ligne sur les parts de marché observées : l'erreur de prévision du bénéfice avant impôt tombe de 2,6 M€ à 0,11 M€ par entreprise et par trimestre (44,1 M€, 1,7 OPA, 72 % de trimestres bénéficiaires) ; contrôle au-delà de 50 % sous le juste prix.

Mesures finales :
- tables d'experts (`npm run sim -- --experts`, graines 1 à 200) : valeur nette médiane 46,7 M€ (43,2 avec les bots normaux) ; 1,61 OPA par partie (1,85) ; aucune faillite ni appel de marge ; 73 % de trimestres bénéficiaires (88 %) ; le raider (tweetard) gagne 53 % des parties, le prudent (basdelaine) 1 % ; cours des entreprises de départ ×0,63 au T8 (phase d'investissement), ×1,07 au T16 (bonus plus gros : 34,3 M€ par partie contre 22,7) ;
- humain passif (100 graines) : 9,5 M€ contre 17,5 M€ face aux bots normaux ;
- banc d'essai (`tools/balance-lab/expert-bots.ts`, 40 graines, chaque niveau de joueur seul face à un passif et 3 bots, sièges tournés), victoires avec les bots normaux → experts : novice 1 → 0 %, occasionnel 3 → 0 %, compétent 98 → 9 %, expert du banc 99 → 38 % ; le meilleur bot finit devant l'expert du banc dans 63 % des parties (1 % avec les bots normaux) ; valeur nette médiane des bots de la table 29 → 52 M€ face à l'expert du banc.
- coût : ~15 ms par bot expert et par tour (une partie de 16 tours à 5 experts en ~1 s).

**Réglage automatique des bots experts (septembre 2026).** Les seuils et dosages des experts deviennent 22 réglages (`ExpertParams`, `sim/botExpert.ts`), dont un plancher de bénéfice qui dépend des trimestres restants : une perte d'un trimestre ou deux se rattrape s'il reste du temps. `tools/balance-lab/expert-tune.ts` les cherche par CMA-ES (12 candidats par génération). Chaque candidat joue 40 parties par génération, sur 8 graines d'entraînement : les joueurs scriptés « compétent » puis « expert » face à un passif et 3 experts (deux sièges), et une table d'un passif et 5 experts. Score : avance du meilleur bot sur le joueur scripté (moyenne de ln(valeur du meilleur bot / valeur du joueur)), plus la prospérité des bots (moyenne de ln(valeur moyenne des bots / 45 M€)), moins des pénalités presque bloquantes au-delà de 2 OPA par partie, de 25 % de parties où le joueur perd son entreprise, de 0,15 faillite par partie, de 0,02 faillite de bot, en cas d'appel de marge d'un bot et sous 65 % de trimestres bénéficiaires. Validation sur d'autres graines (20001 et suivantes).
- Premier objectif (23 générations), sans prospérité ni limite sur le joueur racheté : le réglage trouvait des prédateurs. Plancher à −1,8 M€, les bots cassaient les prix, le joueur passait dans le rouge dès le 2ᵉ trimestre, son cours retombait vers la valeur de l'actif (16 → 6 M€ en trois trimestres) et un bot le rachetait vers le 6ᵉ : le joueur « expert » perdait son entreprise dans 85 % des parties, et les bots s'appauvrissaient eux-mêmes. D'où les deux termes ajoutés (30 générations de plus, en repartant de là). Réglages retenus : la moyenne des 10 dernières générations, arrondie, sauf le budget d'OPA (`raidBase`, `raidRisk`), qui garde sa valeur d'avant : réglé (emprunt jusqu'à 27 + 80 × riskTolerance % du plafond), il faisait passer le joueur « expert » racheté de 38 à 55 % des parties (graines 1 à 20).
- Ce qui change (§10) : plancher de −500 k€ au premier trimestre à −800 k€ au dernier au lieu de 0 (la valeur de fin compte peu : les budgets y sont déjà coupés) ; aucun bonus ; jauge visée 20 au lieu de 15 (19,7 actions discutables par partie contre 15,4 à une table d'experts) ; rivaux supposés progresser de 8 % par tour au lieu de 4 ; lancements dès 30 % de leur coût au lieu de 50 %, mais plus dans les 5 derniers trimestres ; calibrage plus lent (0,17 au lieu de 0,5, borné à ±0,8 au lieu de ±2) ; levier perso plus fort pour le contrôle (34 + 30 × riskTolerance % au lieu de 15 + 30) ; paris de valeur dès 3 % sous le juste prix au lieu de 15 % ; crédit sur le CA de 1,5 % puis 12 % au lieu de 3 puis 6 %.
- Graines de validation 20001 à 20040 (200 parties), avant → après : avance 0,53 → 1,01 ; victoires des joueurs scriptés 28 → 15 % ; joueur qui perd son entreprise 17 → 22 % des parties ; OPA par partie 1,61 → 1,15 ; faillites 0,09 → 0,16 par partie (entreprises des joueurs passifs surtout, aucune de bot) ; prospérité des bots −3 % ; trimestres bénéficiaires 74 → 72 %. Par joueur scripté (160 parties chacun, graines 1 à 40 et 20001 à 20040) : le compétent gagne 12 → 2 % des parties ; l'expert du banc 39 → 33 %, mais sa valeur nette médiane tombe de ~70 à ~40 M€ ; il perd son entreprise dans 39 → 43 % des parties (le compétent, qui verrouille son contrôle, jamais) ; l'entreprise du joueur passif fait faillite dans 5 → 11 % des parties.
- Banc d'essai (`expert-bots.ts`, graines 1 à 40), victoires des joueurs face aux experts avant → après : novice 0 → 0 %, occasionnel 0 → 0 %, compétent 9 → 3 %, expert du banc 38 → 38 % (meilleur bot devant lui : 63 → 63 %).
- Tables d'experts (`npm run sim -- --experts`, graines 1 à 200) : valeur nette médiane 46,7 → 40,4 M€ ; parties plus serrées (écart gagnant/perdant médian ×3,18 → ×2,25) ; 1,61 → 0,71 OPA par partie, 29 → 6 PDG évincés sur 200 parties ; aucune faillite ni appel de marge ; trimestres bénéficiaires 73 → 67 % ; bonus 34,3 M€ → 0 par partie, donc moins de flashs (61 → 33 par partie). Humain passif (100 graines) : 9,5 → 8,2 M€.
- Autres durées (graines 20001 à 20020) : en 8 tours, avance 0,05 → 0,59 (victoires des joueurs 46 → 14 %) ; en 24 tours, avance 1,28 → 1,82, OPA 3,71 → 2,75 par partie, joueur racheté 30 → 18 % des parties, faillites 0,46 → 0,66.
- Duel direct (`tools/balance-lab/expert-duel.ts`, graines 1 à 50, 100 parties) : deux experts aux anciens réglages (`expert-params-initial.json`) et deux aux nouveaux, à la même table, avec un passif. Les nouveaux gagnent 73 % des parties (rang moyen 2,06 contre 2,95), finissent 36 % plus riches en moyenne (valeur nette médiane 64,9 contre 47,3 M€) et sont rachetés deux fois moins souvent (5 sièges sur 200 contre 11). La valeur nette plus basse des tables d'experts ne vient donc pas d'un jeu plus faible : la concurrence y est plus dure pour tous, et les bonus ont disparu.

**Filiales dynamiques (septembre 2026).** Les filiales étaient un passage obligé. Mesure sur le banc : le cerveau des bots experts joue un siège, face à un passif et 3 bots experts (graines 1 à 60, sièges intervertis, 120 parties par variante), et on compare partie par partie sa valeur nette finale à celle du même joueur qui n'ouvre jamais de filiale. Ouvrir selon la règle des bots rapportait +5,5 % ; ouvrir dès que la trésorerie le permettait (jusqu'à 6 trimestres de la fin) +18 %, avec 26 % de victoires contre 6 % sans filiale. Changements : ouverture à 125 × le prix de base au lieu de 100, extraction à 75 % au lieu de 70 % ; coût d'extraction qui suit les news (effet `siteCost`, §9) ; mise en sommeil avec entretien et relance en un trimestre (§5.5 bis) ; bots qui endorment et relancent leurs filiales, et n'en ouvrent pas pendant une mauvaise passe (§10). La hausse de prix seule ramenait l'ouverture réfléchie à +3,1 % et l'ouverture systématique à −0,6 % (mieux dans 71 parties, moins bien dans 48).
- Premier essai pour les news : doubler le poids des 14 news de matières premières qui parlent d'un lieu de production. Mais elles secouent aussi les cours, et la valeur nette médiane des bots tombait de 43,2 à 39,8 M€. Retenu : leurs poids d'origine, plus un lot de 18 news qui ne touchent que l'extraction.
- Banc, même protocole, avec tout le paquet : ouverture réfléchie +2,2 % (0,39 filiale par partie ; mieux dans 28 parties, moins bien dans 19), +2,6 % en endormant et relançant ses filiales comme les bots ; ouverture systématique −4,1 % (1,57 filiale par partie ; mieux dans 62 parties, moins bien dans 57), −3,3 % avec la gestion, mais 25 % de victoires contre 12 % sans filiale. Une filiale ouverte à bon escient rapporte un peu, en ouvrir partout est un pari, et s'en passer ne coûte presque rien.
- `npm run sim` (graines 1 à 200), avant → après : valeur nette médiane 43,2 → 42,5 M€ ; OPA 1,85 → 1,76 par partie ; filiales ouvertes 1,60 → 0,77 par partie ; faillites 0,04 → 0,01 ; trimestres bénéficiaires 88 → 87 %. Sur 100 parties : ~3,5 news par partie changent le coût d'extraction d'une matière ; 0,10 mise en sommeil et 0,08 relance par partie ; 2 % des trimestres de filiale passés en sommeil. Tables d'experts : 40,4 → 39,5 M€ ; OPA 0,71 → 0,56 ; filiales 1,70 → 0,72 ; aucune faillite. Humain passif (100 graines) : 17,5 → 17,9 M€.

**Enchères de filiales (septembre 2026).** Une filiale ne s'ouvre plus à volonté : il n'en existe que trois par matière, nommées, attribuées aux enchères sous pli fermé (§5.5 bis). Choix : trois emplacements (deux auraient donné plus de bagarre, mais plus de parties sans filiale pour personne) ; une mise par entreprise et par matière ; **prix unique** (la plus haute mise perdante, sinon la mise à prix) plutôt que « le gagnant paie sa mise » : miser son maximum sans crainte de trop payer, et un humain qui devine la mise d'un bot ne peut pas se faire piéger ; règlement à la clôture, avant tout le reste, pour que la filiale produise au même trimestre qu'avec l'ancienne ouverture directe (mise pendant un tour, premiers lots à la clôture du suivant) ; égalités départagées par hachage (jamais le RNG, donc la simulation ne change pas d'un salon à l'autre).
- Entre bots (`npm run sim`, graines 1 à 200), avant → après : rien ne change, faute de concurrence : valeur nette médiane 42,5 → 42,5 M€ ; OPA 1,76 → 1,76 par partie ; 0,77 filiale attribuée par partie sur 12 emplacements, chacune à la mise à prix, aucune mise perdante, 96 % des emplacements libres en moyenne pendant la partie ; tables d'experts : 39,5 M€, 0,72 filiale par partie. Sans surprise : les bots ne veulent une filiale que s'ils en consomment au moins 30 lots par trimestre, donc à peine plus d'un par partie. La rareté ne mord qu'à une table où plusieurs joueurs veulent la même matière.
- Banc (joueur expert, mêmes parties que la mesure des filiales dynamiques) : ouverture réfléchie +2,2 % (mieux dans 28 parties, moins bien dans 19), +2,4 % en gérant sommeil et relance ; ouverture systématique −4,3 % (62 contre 57), −3,8 % avec la gestion, 25 % de victoires contre 12 % sans filiale. Les mêmes chiffres qu'avant les enchères : elles n'ont rien changé à l'économie d'une filiale, seulement à qui peut en avoir une.
- Trouvé en écrivant : le hachage FNV seul ne classe que huit façons différentes des noms qui ne diffèrent que par leur dernier caractère (`oil|0`, `oil|1`…) : deux graines donnaient les mêmes douze noms. Brassage final (`mixedHash`, murmur3) pour les noms et les égalités.

Relecture adverse des enchères (scripts de reproduction hors dépôt), corrigé ensuite :
1. Les noms des filiales, tirés de la graine de la simulation, la trahissaient : trois noms sur huit par matière donnent plus de bits que la graine n'en a, et une force brute sur toutes les graines la retrouvait en une minute ; avec elle, on rejouait la partie (news programmées, cours et demande des trimestres suivants). Les choix cosmétiques (noms, textes d'ambiance, noms suggérés) viennent désormais d'une graine à part, tirée par le serveur (§12 bis). Le journal du premier trimestre porte encore de l'information sur la graine, mais l'exploiter demande de rejouer la simulation pour chaque candidate.
2. Une mise ne se vérifiait contre la trésorerie qu'au moment de la poser : emprunter, miser haut, rembourser dans le trimestre faisait payer plus cher les gagnants sans rien coûter. Une mise ne compte plus que jusqu'à la trésorerie à la clôture.
3. Du même coup, l'élimination des gagnants insolvables (le plus offrant d'abord) pouvait écarter un candidat solvable au profit d'une mise vide ; et l'issue « sans suite » d'un candidat écarté donnait la mise secrète d'un rival comme prix. Plus d'élimination : le prix ne dépasse jamais ce que chaque gagnant engage.
4. L'emplacement obtenu (1, 2, 3) et l'ordre des articles suivaient le classement des mises : ordre haché.
5. Un nouveau dirigeant pouvait retirer la mise de son prédécesseur, et apprendre ainsi qu'elle existait : une mise n'appartient qu'à qui l'a posée.
6. Une entreprise déjà perdue pouvait remporter un emplacement et faire faillite dans la même clôture, le bloquant un trimestre : une mise n'engage que ce qui garde l'entreprise au-dessus du seuil de faillite.
7. On pouvait miser au dernier trimestre pour une filiale qui ne produirait jamais : refusé.
Tenu : confidentialité des mises (vues des joueurs, des spectateurs et des sièges de bot en reprise, messages du serveur), déterminisme français/anglais (14 résolutions avec égalités, retraits et fusion), rejeu à l'octet près, entrées malveillantes refusées, et environ 590 parties aléatoires (prises de contrôle, fusions, faillites, enchères disputées) sans violation d'invariant. Entre bots, rien ne change (`npm run sim`, graines 1 à 200).

**Clôture par ordre de paiement (octobre 2026).** Plus de prêt d'urgence : la trésorerie paie la clôture dans un ordre fixe, obligations d'abord (§5.7), et ce qui ne peut pas être payé ne se fait pas ; la faillite tombe quand la trésorerie ne couvre plus les obligations (plus de seuil de valeur comptable à −3 M€) ; impôt, amendes et dédits se paient à la clôture suivante. Dans cette première version, les ventes arrivaient après tous les coûts : une entreprise devait avoir en caisse de quoi payer sa clôture, c'était au joueur d'emprunter (bandeau, §12), et les bots couvraient la leur.
- Premier essai, bots inchangés sinon qu'ils empruntaient ce que la clôture demandait : chez les experts, 0,28 faillite et 4 filiales par partie (contre 0 et 0,55). Ils dépensaient l'argent de la clôture (bonus, dividendes, usines, mises), l'empruntaient ensuite ; la dette montait jusqu'au taux plafond de 25 %, et les fusions additionnaient deux entreprises endettées. D'où la règle des bots : garder l'argent de la clôture avant toute dépense (§10). Deux corrections du même essai : l'emprunt proposé compte les intérêts en plus (emprunter juste le manque laissait un trou de 3 à 10 %, le taux montant avec la dette) et les bots couvrent leur clôture une fois que tous ont joué (les achats des suivants renchérissaient les matières).
- Sur 60 parties (`npm run sim`, graines 1 à 60), avant → après. Bots normaux : valeur nette médiane 44,5 → 44,5 M€ ; faillites 0 → 0 ; prêts d'urgence 0,13 → productions réduites 0 par partie ; filiales 0,85 → 0,75 ; dividendes reçus 7,7 → 3,3 M€ par partie (la trésorerie sert d'abord la clôture) ; trimestres bénéficiaires 87 → 90 %. Bots experts : 40,0 → 41,7 M€ ; faillites 0 → 0 ; productions réduites 0,03 par partie ; filiales 0,55 → 0,82 ; actions discutables 18 → 12 par partie. Stagiaires : 19,8 → 19,8 M€.

**Les ventes du trimestre comptent (octobre 2026).** Retour de partie : un joueur qui avait de quoi payer une mise de 10 M€ sur un puits de pétrole s'est vu proposer d'emprunter environ 10 M€, et a fini le trimestre avec 10 M€ de trésorerie en trop, alors qu'il ne lui manquait qu'environ 1 M€ sur le trimestre. La clôture payait la mise puis toute la production avant que les ventes ne rentrent : sa trésorerie couvrait la mise, la production devait donc être avancée en entier, et les ventes arrivaient ensuite. Une entreprise devait garder un trimestre de coûts en caisse, et l'emprunt pour l'avancer ne s'éteignait jamais. Désormais, seules les obligations se paient d'avance ; mises (réglées en fin de trimestre), production, marketing et R&D, extraction en surplus se paient avec la trésorerie et les ventes du trimestre (§5.7). Le plan de clôture devient une estimation (demande attendue, prix connus des rivaux), d'où une marge d'un écart type de la demande et deux emprunts proposés. Dans le cas du joueur, le bandeau propose 1,01 M€ (ou 1,7 M€ avec la marge) ; avec le premier, la filiale est gagnée et le trimestre finit à zéro.
- Justesse de l'estimation (30 parties, ventes réelles / ventes attendues, par entreprise et par trimestre) : médiane 1,00 (q10 0,87, q90 1,08) entre bots normaux, 0,97 (q10 0,76, q90 1,04) entre experts, qui cassent les prix. Les ventes restent au-dessus de « attendues − marge » dans 84 % des trimestres entre bots normaux, 70 % entre experts.
- Bots : la règle de la version précédente, garder un trimestre de coûts en caisse, devient « garder ce que les ventes ne couvriraient pas, avec la marge ». Les experts reprennent leur gestion de trésorerie réglée automatiquement (emprunt de précaution à 30 % des besoins du trimestre), faite pour une économie où les ventes paient la production. Les bots misent de nouveau sur une filiale avec leur seule trésorerie (2 × la mise à prix en plus de l'argent de la clôture) : l'emprunt qu'on leur avait permis pour la mise, sans objet désormais, leur faisait ouvrir 2,7 filiales par partie.
- Sur 60 parties (graines 1 à 60), avant la refonte de la clôture (prêts d'urgence) → maintenant. Bots normaux : valeur nette médiane 44,5 → 42,7 M€ (écart dans le bruit de 60 parties) ; faillites 0 → 0 ; productions réduites 0,07 par partie ; filiales 0,85 → 0,80 ; dividendes reçus 7,7 → 6,6 M€ par partie (3,3 M€ dans la version précédente) ; appels de marge 0,02 → 0,17 par partie, tous dans deux parties. Bots experts : 40,0 → 40,3 M€ ; faillites 0 → 0 ; productions réduites 0,03 par partie ; filiales 0,55 → 0,58. Stagiaires : 19,8 → 19,8 M€.

**Gisements (octobre 2026).** Premier pas de la carte (§5.8) : chaque emplacement de filiale devient un gisement d'une richesse fixe (par matière, un riche à 50 lots par trimestre, un moyen à 40, un pauvre à 30 ; 40 en moyenne, comme avant), et l'on mise sur un gisement précis. Chaque gisement a sa propre enchère : la plus haute mise l'emporte et paie la meilleure mise perdante sur ce gisement (le prix unique par matière n'avait plus de sens quand les lots ne se valent plus). Les bots visent le gisement libre qui couvre le plus de leurs besoins, puis le plus riche ; leur seuil (au moins 30 lots consommés par trimestre) ne change pas.
- Sur 60 parties (graines 1 à 60), avant → après. Bots normaux : valeur nette médiane 42,7 → 43,7 M€ ; faillites 0 → 0 ; productions réduites 0,07 → 0,07 ; filiales 0,80 → 0,80 par partie ; dividendes reçus 6,6 → 6,8 M€ ; appels de marge 0,17 → 0,17. Bots experts : 40,3 → 40,7 M€ ; faillites 0 → 0 ; filiales 0,58 → 0,55. Stagiaires (qui ne misent pas) : 19,8 → 19,8 M€. Les bots prennent d'abord les gisements riches : un peu plus de lots pour la même mise à prix.

**Usines placées (octobre 2026).** Troisième pas de la carte (§5.8) : main-d'œuvre par zone et transport. Réglage par sonde (coût unitaire de chaque zone par rapport à la capitale, matières du port), puis simulations. Premier essai, main-d'œuvre par zone seule (× 0,85 à 0,95) et 0,006 k par lot et par km : la plaine, la moins chère, l'emportait pour les gadgets et les trottinettes (deux tiers des usines de ces secteurs), et les autres zones ne servaient à personne. D'où une main-d'œuvre par zone **et par secteur**, et un transport à 0,0045 : sans filiale, chaque secteur a sa zone (boissons au nord −2,7 %, gadgets au nord-est −2,9 %, trottinettes au sud −2,2 % ou en montagne −2,1 %, yaourts et crypto à la capitale) ; avec sa filiale, −3 à −5 % (sucre de la plaine pour les boissons, puces de la vallée pour les gadgets, lithium de la montagne pour les trottinettes).
- Vérification : toutes les usines à la capitale, les simulations sortent identiques au bit près (60 parties).
- Sur 60 parties (graines 1 à 60), avant → après. Bots normaux : valeur nette médiane 43,7 → 45,5 M€ ; faillites 0 → 0 ; productions réduites 0,07 → 0,07 ; appels de marge 0,17 → 0,07 ; filiales 0,80 → 0,95 par partie ; en fin de partie, les usines de gadgets sont aux deux tiers au nord-est, celles de trottinettes au sud (quelques-unes en montagne), celles de boissons au nord ; yaourts et crypto à la capitale. Bots experts : 40,7 → 38,7 M€ (quand tous déménagent ensemble, leurs coûts baissent et ils se livrent une guerre des prix plus dure) ; une faillite d'une entreprise PNJ sur 60 parties ; filiales 0,55 → 0,68. Sur 30 graines face à un humain passif, les experts restent nettement plus forts que les bots normaux (+17 %, contre +25 % avant). Stagiaires : 19,8 → 19,8 M€.

**Zones vivantes (octobre 2026).** Quatrième pas de la carte (§5.8) : pression sur les salaires hors de la capitale (+3 % par autre usine de la zone, au plus +15 %) et nouvelles locales (lot « carte » : 20 cartes, dont 11 sur la main-d'œuvre d'une zone, chaque zone au moins une fois, et 6 sur le prix du transport). Sur 60 parties, la médiane bouge de quelques M€ d'un tirage à l'autre, et ajouter des cartes au paquet change tous les tirages : l'effet de la pression se mesure donc sur 200 parties (graines 1 à 200), même paquet, pression à 0 puis à 3 %.
- Sur 200 parties, sans → avec pression. Bots normaux : valeur nette médiane 44,9 → 42,8 M€ ; les usines se partagent les zones au lieu de s'entasser dans la meilleure : trottinettes au sud 333 → 192 et en montagne 36 → 161, boissons au nord 358 → 202 et dans la plaine 3 → 151 ; gadgets toujours surtout au nord-est (369 → 351). Bots experts : 40,5 → 40,1 M€ ; même partage (boissons au nord 805 → 385, dans la plaine 5 → 192, à la capitale 219 → 428 ; trottinettes au sud 500 → 290, en montagne 44 → 224 ; gadgets au nord-est 590 → 498).
- Sur 60 parties (graines 1 à 60), avant → après (paquet et pression ensemble). Bots normaux : 45,5 → 41,9 M€ ; faillites 0 → 0 ; productions réduites 0,07 → 0,08 ; appels de marge 0,07 → 0,08 ; filiales 0,95 → 0,70. Bots experts : 38,7 → 41,9 M€ ; faillites 0 → 0 ; filiales 0,68 → 0,77. Stagiaires : 19,8 → 20,7 M€.

**Marchés régionaux (octobre 2026).** Cinquième pas de la carte (§5.2 bis) : demande par ville (population × goût), proximité de l'usine à chaque ville, bonus de sa propre ville, livraison au mélange de ventes de référence, et bots qui choisissent leur zone à la valeur (meilleure marge × demande) au lieu du seul coût unitaire.
- Vérification : toutes les usines à la capitale, les parties sont identiques au bit près (empreintes relevées avant le changement, bots stagiaires, normaux et experts, et la partie scriptée : `engine.regions.golden.test.ts`). Le plan de clôture, l'estimation de la fiche produit et la résolution donnent la même demande à 4e-16 près, usines hors de la capitale comprises.
- Premier réglage (goûts du nord pour les boissons 1,9, de l'est pour les yaourts 2,6 ; κ des boissons 0,6) : les deux effets tirent en sens contraires. Le mélange de livraison seul enverrait 92 % des usines de boissons au nord ; la demande seule les garde à 95 % à la capitale (la plaine, sans ville, y perd) ; ensemble, le gain du nord tombait sur le seuil des bots (1 % du coût des ventes) et 81 % restaient à la capitale. Les gadgets restaient à 96 % au nord-est quel que soit le réglage de la demande (κ 0,2 : ±2 % au plus) : c'était la main-d'œuvre (0,86) qui décidait.
- Réglage retenu, par sonde (sur le moteur) puis 200 et 400 parties : goût du nord pour les boissons 2,2, de l'est pour les yaourts 3, κ des boissons 0,5, main-d'œuvre des gadgets au nord-est 0,91 (l'est, à 0,88, devient le moins cher pour les gadgets). Chaque secteur se partage alors entre la capitale et sa région (usines des bots normaux en fin de partie, 200 parties) : boissons 48 % capitale / 52 % nord, gadgets 47 / 52 % nord-est, trottinettes 53 / 46 % sud, yaourts 39 % capitale / 40 % sud / 21 % est ; la crypto reste à la capitale. La plaine et la montagne ne servent plus aux bots (sans ville, un produit y perd de 6 à 27 % de demande). Ces partages sont des paliers : main-d'œuvre des gadgets au nord-est à 0,89, 88 % des usines y vont ; à 0,93, 7 %.
- Bots normaux, valeur nette médiane sur 400 parties : 44,1 → 43,5 M€ (−1,3 %, intervalle à 90 % de −6,6 à +2,0 %), 0 faillite. Experts sur 120 parties : 40,7 → 40,2 M€. Sur 200 parties (réglage précédent), la médiane des experts passait de 40,1 à 39,4 M€ mais la moyenne de 45,5 à 45,8 M€ : sur 60 parties, la médiane va de 39,1 à 41,9 M€ selon le bloc de graines, à code égal. Face à un humain passif, les experts restent nettement plus forts que les bots normaux : +21,4 % → +22,4 % sur 200 graines (le +17 % sur 30 graines du pas précédent était du bruit). Les fondateurs d'une entreprise de boissons y perdent (d'autres experts lancent des boissons au nord et prennent la ville), ceux des yaourts et de la crypto y gagnent ; la marge brute totale ne change pas.
- 60 parties (graines 1 à 60), avant → après : bots normaux 41,9 → 43,0 M€ ; faillites 0 → 0 ; appels de marge 0,08 → 0,02 ; filiales 0,70 → 0,72. Experts 41,9 → 40,8 M€. Stagiaires 20,7 → 20,7 M€ (ils restent à la capitale).
- Vitesse : l'expert calcule la demande ville par ville dès qu'une usine du secteur est ailleurs (78 % de ses évaluations de prix). En préparant une fois ce qui ne dépend pas du prix, et en ne copiant plus les lignes de rapport des rivaux qu'on vide ensuite, les parties d'experts vont 19 % plus vite qu'avant ce pas, avec les mêmes résultats au bit près.

**Formule commune de qualité et de notoriété (octobre 2026).** Préalable au plateau : la résolution, le plan de clôture, les estimations, les bots experts et le client utilisent `qualityAfter` et `brandAfter`, avec un multiplicateur de budget optionnel (1 par défaut). Les bornes, le filet numérique et l’ordre des opérations de la résolution sont conservés. Les quatre empreintes de `engine.regions.golden.test.ts` passent sans nouvel enregistrement ; sur 60 parties (graines 1 à 60), le rapport classique est identique à `main` hors temps d’exécution : valeur nette médiane **43,0 M€** avant et après.

**Plateau, premier lot (octobre 2026).** Comparaison classique/hexagonal après correction des routes, du placement et des seuils des bots : [mesures du lot 1](../tools/balance-lab/results/5-plateau-lot1.md).

**Terrains de départ, deuxième lot (octobre 2026).** Huit terrains, effets d'usine et de siège, nouvelles locales,
attribution équitable exacte, aléatoire ou imposée par l'hôte ; conservation de l'attribution d'origine pour les
mesures malgré les changements de propriétaire ou d'usine. Les déménagements hexagonaux s'exécutent après la
clôture ; les effets sont donc perdus au départ effectif, sans anticiper les enchères du lot 3. Vérifications et
résultats des 60 parties normales et 30 parties expertes : [mesures du lot 2](../tools/balance-lab/results/6-terrains-lot2.md).

**Enchères de cases, troisième lot (octobre 2026).** Mises secrètes, deuxième prix, engagements de clôture,
projets privés, replis et incubateur des start-ups ; aucun changement du mode classique (60 parties identiques,
hors durée, et test d'or inchangé). Sur 60 parties normales / 30 expertes : 6,20 / 16,03 mises par partie,
18,95 % / 56,79 % de cases disputées, prix/réserve moyen ×1,14 / ×1,49, 0,75 / 5,27 replis et aucun abandon.
Lancements par partie : 4,57 → 3,97 / 11,33 → 10,00 ; déménagements exécutés : 2,15 → 1,88 / 3,07 → 3,37.
Valeur nette médiane : 45,25 → 44,68 M€ / 46,03 → 47,02 M€ ; appels de marge : 0 → 3 / 0 → 2 au total.
Aucune faillite, aucun NaN/Infinity ni correction du filet de sécurité. Le bot normal essaie un autre secteur
viable si son premier choix ne rentabilise pas le terrain, sans changer sa probabilité de lancement ni le RNG
classique. Tableaux par terrain × secteur, protocole et référence `main` :
[mesures du lot 3](../tools/balance-lab/results/7-encheres-lot3.md). Le dosage des terrains reste au lot 5.

**Choix des terrains, quatrième lot moteur/serveur (octobre 2026).** Estimations sur toutes les cases libres,
attribution équitable variée à 20 k du meilleur minimum, choix des humains au salon et remplissage des bots.
À huit joueurs au trimestre 8, 320 vues : moyenne **2,55 → 5,71 ms**, maximum **5,31 → 9,65 ms**, pour **133 cases
libres** au lieu de 63 candidates dans les tables de lancement. Aucun chemin d'approximation nécessaire ; les
profils de proximité par secteur et case sont déjà précalculés. Le mode équitable existant et le test d'or
classique restent inchangés. Vérifications et décisions : [rapport du lot 4](../tools/balance-lab/results/8-terrain-choice-lot4.md).

**Terrains, premier calage (octobre 2026, lot 5).** Campagne de 840 parties du simulateur (`tools/balance-lab/terrain-campaign.ts`, attribution au hasard et équitable, 4/6/8 joueurs, secteurs tournants, bots normaux et experts), dont les 420 au hasard servent au calage, et 240 parties classiques de comparaison. Les écarts de victoires viennent d'abord des secteurs (bots normaux : boissons 1,7 fois leur part, yaourts 0,3, sur le plateau comme en classique ; experts sur le plateau : trottinettes 1,6, boissons 0,9 ; en classique 2,1 et 0,7), pas des terrains. Le modèle d'estimation des terrains, centré par secteur, explique le patrimoine final mesuré avec une corrélation de 0,66 (normaux) et 0,73 (experts). Huit couples où les deux niveaux se trompent dans le même sens sont corrigés par `TERRAIN_CALIBRATION` (§5.8 ter) ; dans le salon de référence, l'île pour la crypto passe de « très bon » à « bon ». Détail : [9-calage-lot5.md](../tools/balance-lab/results/9-calage-lot5.md).

**Bulle crypto et récupération (octobre 2026).** Changement voulu dans les deux modes (§5.1, §5.4, §5.6, §7).
La récupération reste non imposable. Le premier réglage à élasticité produit 1,5 permettait aux experts de
vendre au plafond sans réduire suffisamment la demande totale ; les lignes crypto acquises propageaient
les bénéfices à toute l'économie. La correction ajoute une élasticité de marché 1,5, normalise la croissance
de la bulle des nouvelles et de la réponse au prix, et conserve la hausse des prix vendus dans le momentum.
Le niveau du prix augmente aussi le risque de krach (§5.1). Sur les 30 graines du signalement initial,
le patrimoine expert médian revient de **138,7 à 45,4 M€**, contre **38,9 M€ sur main** (+16,8 %) ; le prix
crypto vendu par les entreprises contrôlées passe de **2,88/3,00 à 2,34/2,75 × référence** (médiane/q90).
Les six campagnes de 1 320 parties reprennent les mêmes graines et publient les écarts restants : en classique,
le patrimoine expert est à +13,4 % de main et le ratio de victoires crypto normal de 0,688 reste sous la cible 0,8.
Les gardes de patrimoine expert passent aussi en hexagonal (+8,9/+16,8 %, aléatoire/équitable). Les trois ratios
normaux restent sous la cible ; l'écart Q10–Q90 crypto arrive deuxième en hexagonal aléatoire, malgré le plus
grand IQR et écart type. L'euphorie reste dans 15–30 %, mais les experts connaissent environ deux krachs par
partie gonflée, contre environ un chez les normaux.
Sur 100 essais appariés, une hausse programmée suivie d'une vente au début de T5 gagne en médiane 2,25 M€
par rapport au prix stable, mais perd dans 28 essais ; 30 essais connaissent un krach avant la vente.
Les quatre empreintes classiques sont renouvelées intentionnellement. Les paramètres des quatre secteurs
physiques et la calibration des terrains restent identiques ; leurs résultats peuvent varier par concurrence
et acquisitions. Un résidu de trésorerie compris entre −0,000001 k€ et zéro est réglé à zéro, conformément
à la tolérance du financement ; les déficits plus grands restent visibles. Protocole, garde-fous, quartiles,
comptes par partie, sorties comparées au maintien du produit et contrôles :
[10-crypto-bubble.md](../tools/balance-lab/results/10-crypto-bubble.md).

**La distance est une facture, rien d'autre (5 octobre 2026).** L'attractivité ne dépend plus de la distance :
le facteur π vaut 1 pour toute usine et toute ville, sauf dans la ville de l'usine, où le bonus « fabriqué ici »
s'applique (`SectorDef.localBonus`, qui remplace `proximity` : yaourts 0,35, boissons 0,20, trottinettes 0,10,
gadgets 0,05, crypto 0 ; en hexagonal, la case de la ville et ses six voisines). La capitale reste exactement
neutre — une usine à la capitale a un facteur de 1 partout, comme les importateurs — donc ne rien faire ne change
rien pour une usine de la capitale. `PROXIMITY_KM` et `HOME_MARKET_KM` sont supprimés ; `RegionParams` ne garde que
`tasteAmplitude` et `legacyDelivery`. Le transport passe au poids : `TRANSPORT_COST_PER_KM × freightWeight × km`,
pour la livraison (boissons 3, yaourts 2,5, trottinettes 2, gadgets 0,6, crypto 0) comme pour l'appro (pétrole 1,5,
sucre 1,5, lithium 1, puces 0,2) ; le modèle relatif conservait alors les détours signés et le mélange de ventes
de référence. Les trajets signés sont remplacés par des trajets absolus le 7 octobre (§5.8). Les
quatre empreintes d'or (`engine.regions.golden.test.ts`) étaient alors inchangées : le fret était relatif et
nul à la capitale. **Fret réel (7 octobre 2026, tâche 39)** : les trajets de filiales et livraisons sont désormais
absolus (§5.8), la capitale paie ses trajets, et seuls les prix de référence physiques reçoivent leur livraison
standard arrondie. Les empreintes sont régénérées intentionnellement pour ce changement de simulation ; aucun
nouveau bilan d'équilibrage n'est réalisé.

## 14. Pistes pour plus tard

Comptes et parties classées ; saison et classement général ; banque centrale jouée par un joueur ; syndicats et grèves ; paradis fiscaux à plusieurs niveaux ; marchés à terme sur les matières ; ventes à découvert ; alliances et pactes d'actionnaires ; lobbying contre une loi précise ; chat et messages privés entre joueurs ; des bots qui proposent eux-mêmes des affaires (cessions, contrats, ententes).
