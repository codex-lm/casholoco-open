# Kit industriel isométrique / Isometric industrial kit

## Français

Les vingt modèles sont des créations originales construites dans Blender, sans
modèle téléchargé ni texture externe. Ils sont destinés à la vue île optionnelle.
Ils représentent la simulation existante : les petites animations ne calculent
ni livraison, ni emploi, ni production supplémentaire.

### Reconstruire et vérifier

```powershell
blender --background --factory-startup --python tools/isometric/build_library.py
python tools/isometric/verify_library.py
```

Tout autre Blender 4.5 compatible peut servir à la première commande ; le
contrôle accepte un Python 3 standard, sans dépendance. Le générateur écrit :

- `packages/client/public/isometric/library.glb` : bibliothèque autonome de vingt racines.
- `packages/client/public/isometric/manifest.json` : bornes locales glTF, nombre de triangles, noms et empreinte SHA-256.
- `art_sources/isometric/library.blend` : source éditable, modèles disposés sur une planche avec caméra et lumières.
- `art_sources/isometric/contact-sheet.png` : rendu Cycles de contrôle visuel.

Le GLB est exporté avant la disposition de la planche : toutes ses racines ont
une translation nulle, une rotation nulle et une échelle de un. Le `.blend`
contient ensuite les mêmes modèles déplacés pour faciliter leur inspection.

### Contrat de rendu

- Une parcelle = une unité, axe Y vertical, façade vers +Z, origine au centre au sol.
- Usines : sol 0,74 × 0,66 unité ; hauteurs de 0,32 à 0,47.
- Filiales : sol 0,68 × 0,62 ; silhouettes distinctes pour chaque matière.
- `asset_extension_warehouse` : largeur 0,24, profondeur 0,47, hauteur 0,26.
- `asset_extension_tanks` : largeur 0,22, profondeur 0,10, hauteur 0,26.
- Camion : longueur 0,22 ; personnage : hauteur 0,088 ; cargo : longueur 0,32.
- Les pieux du port descendent à Y = −0,035 ; c'est volontaire pour l'implantation côtière.
- `company_accent` est la seule matière à recolorer selon le propriétaire.
- Les teintes fixes sont stockées dans `COLOR_0` avec quatre matières partagées
  (mat, métal, verre, lumière). Conserver les couleurs de sommets lors des fusions.
- Les fenêtres sont opaques : éviter le tri de transparence à cette échelle.
- Les volumes exacts et noms de racines sont dans le manifeste.

Les racines sont `asset_factory_{energy_drinks,gadgets,scooters,yogurts,crypto}`,
`asset_site_{oil,lithium,sugar,chips}`, `asset_extension_warehouse`,
`asset_extension_tanks`, `asset_construction`, `asset_truck`, `asset_person`,
`asset_boat`, `asset_tree`, `asset_tree_pine`, `asset_house`, `asset_port`, `asset_civic`.

Le contrôleur vérifie l'identité des racines, leur nom, les indices des triangles,
les coordonnées finies, les bornes, les teintes fixes, l'absence de ressources
externes et l'empreinte du GLB. Ce contrôle ne remplace pas la vérification du jeu
dans le navigateur ou une mesure de fluidité sur un appareil réel.

## English

This is an original twenty-model Blender kit for the optional island view. It
uses no downloaded geometry or external textures. Small scene animations display
the existing game state; they do not simulate deliveries, jobs, or extra output.

Run `build_library.py` with Blender 4.5 to rebuild the GLB, manifest, editable
compressed `.blend`, and Cycles contact sheet. Run `verify_library.py` with any
standard Python 3 to verify the actual shipped binary without Blender libraries.

Runtime coordinates are X right, Y up, Z forward. One parcel is one unit. Every
GLB root has an identity transform and a ground-centred pivot. Factory footprints
are 0.74 × 0.66 units; heights range from 0.32 to 0.47. Supply sites use a 0.68 ×
0.62 footprint. Port piles intentionally extend 0.035 below ground. The manifest
records each exact local bounding box, triangle count, node name and GLB hash.

Recolour only `company_accent`. Preserve `COLOR_0` when merging geometry: fixed
colours share four shaders for matte, metallic, glass and emissive surfaces. Glass
is opaque to keep tiny windows stable. The editable source arranges models for
inspection after exporting the runtime library; source positions are therefore
different from GLB root positions. The contact sheet is a visual asset check,
not proof of gameplay correctness or device performance.
