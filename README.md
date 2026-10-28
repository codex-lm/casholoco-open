# Casholoco — Solo et Direct expérimental

## Français

### Jouer sur LOB7

- [Casholoco Solo](https://lob7.com/player/br_s_9d210dc2-b120-4930-862c-530849f2ba67)
- [Casholoco Direct — expérimental](https://lob7.com/player/br_s_b36e9acc-ca73-4812-ad50-67b00dc2babf)

Les deux éditions sont publiées dans la même famille LOB7. Direct est une variante
issue du Solo ; le Solo reste disponible indépendamment. Sur GitHub, `main`
conserve l'export Solo, `multiplayer` l'export Direct et `source` leurs sources
modifiables. L'historique public commence avec ces éditions autonomes.

Une édition autonome de Casholoco : dirigez une entreprise cotée, produisez,
investissez et affrontez un à six PDG contrôlés par le jeu. Le moteur et les
règles économiques sont ceux de Casholoco. Les trimestres avancent à votre rythme.
Trois plateaux sont disponibles : classique, hexagonal et île 3D.

Le jeu tourne entièrement dans le navigateur, sans compte ni serveur de jeu.
La sauvegarde reste dans ce navigateur. Exportez son texte pour la transférer
ou la conserver avant de changer d’édition : LOB7 isole chaque édition sur une
origine différente et ne transfère pas automatiquement les sauvegardes.

### Développer et vérifier

Node.js 20.19+ ou 22.12+ est requis pour reconstruire le jeu (pas pour y jouer).

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run sim
npm run build:solo
npm run export:lob7
npm run validate:lob7
```

`npm run dev` ouvre un serveur local de développement. `npm run preview` sert
le build de production. Le dossier `dist/` à la racine contient le paquet statique
pour LOB7 ; les sources de développement ne font pas partie de ce paquet.

La branche `source` conserve les sources modifiables, tests et modèles Blender.
La branche `main` contient le jeu compilé. Les mises à jour de `source` ne
publient pas automatiquement une nouvelle édition LOB7.

Pour vérifier le paquet avec une copie locale du validateur courant de LOB7 :

```sh
python tools/standalone/validate.py --recipe /path/to/lob7/workers/browser-games/static_game.py
```

Ce contrôle statique ne remplace pas une partie dans le lecteur hébergé.

### Deuxième édition : Direct expérimental

```sh
npm run build:peer
npm run export:peer
npm run validate:peer
```

Cette édition utilise des connexions WebRTC directes. L’hôte crée une invitation
distincte par joueur ; chacun colle l’invitation et lui retourne son code réponse
par un canal de confiance. Aucun serveur de jeu ou de signalisation, STUN ou TURN
n’est configuré. Le même réseau local est conseillé : la connexion sur Internet
ne peut pas être garantie, notamment derrière des NAT ou pare-feu.

L’onglet de l’hôte doit rester ouvert : il fait tourner le moteur et transmet à
chaque invité sa propre vue. Ce prototype ne restaure ni les connexions ni la
partie multijoueur après rechargement ; il ne migre pas le rôle d’hôte. Les codes
contiennent les métadonnées réseau de la connexion et ne doivent pas être publiés.

`packages/client/dist-peer/` contient le build et `dist-peer/` l’export autonome.
Le manifeste `LOB7-GAME.peer.json` est distinct de celui du solo. Le build solo
est vérifié pour ne contenir aucun `RTCPeerConnection` ni protocole Direct.
Le manifeste déclare le mode LOB7 `webrtc-direct`. Cette édition a été publiée
avec ce mode le 28 octobre 2026. Un test sur un seul ordinateur avec l'export
hébergé a confirmé l'invitation, la connexion et le passage synchronisé au
trimestre 2, avec l'hôte dans le lecteur LOB7. Cela ne valide pas une connexion
entre deux appareils ou deux réseaux Internet. Le test local a aussi couvert
une partie complète de huit trimestres entre deux fenêtres.

## English

Both [Solo](https://lob7.com/player/br_s_9d210dc2-b120-4930-862c-530849f2ba67)
and [Direct experimental](https://lob7.com/player/br_s_b36e9acc-ca73-4812-ad50-67b00dc2babf)
are published on LOB7. Direct derives from Solo, which remains independently
available. GitHub branches `main` and `multiplayer` contain their respective
compiled exports; `source` contains the editable sources for both.

A standalone Casholoco edition. Run a listed company, produce, invest and face
one to six computer-controlled CEOs. It preserves Casholoco’s economic engine
and rules. Quarters advance when you are ready. Classic, hexagonal and 3D island
boards are available, with French and English interfaces.

The game runs entirely in your browser without a game server or account. Saves
stay in this browser. Export the save text to keep or transfer it before changing
editions: LOB7 isolates each edition on its own origin and does not automatically
carry saves to another edition.

Use the commands above with Node.js 20.19+ or 22.12+ to develop, test and build. `source` is
the editable branch; `main` is the compiled static edition. Static validation is
not a hosted playthrough. See the license and asset notices before redistribution.

The second build, `npm run build:peer`, produces **Casholoco Direct — experimental**.
Use `npm run export:peer` for the separate `dist-peer/` export. Each guest receives
a distinct invitation and returns an answer code manually over a trusted channel.
There is no game server, signalling service, STUN or TURN. The same local network
is recommended; Internet connectivity is not guaranteed. Codes contain connection
metadata and should not be published. Keep the host tab open: this prototype does
not reconnect, restore the multiplayer match or migrate the host after a reload.

The solo bundle is checked to exclude the Direct transport. Direct was published
with LOB7's declared `webrtc-direct` mode on October 28, 2026. Hosted connection
and synchronized quarter advancement were checked on one computer, with the host
inside the LOB7 player. This does not establish connectivity between two devices
or Internet networks. A complete eight-quarter game was also checked locally
between two windows.
