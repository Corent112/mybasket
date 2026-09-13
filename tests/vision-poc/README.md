# MyBasket – POC vision RF-DETR

Ce dossier isole le POC de reconnaissance locale des symboles de schémas basket.
**Aucun fichier de production MyBasket n'est modifié. Aucun déploiement Vercel.**

## Voie retenue

- Détecteur : **RF-DETR Nano** (core Apache-2.0).
- Entraînement : GPU gratuit Colab si disponible.
- Dataset : COCO.
- Export : ONNX.
- Cible : `onnxruntime-web`, WebGPU avec fallback WASM.
- Terrain : toujours détecté/recalé par le moteur MyBasket existant avant interprétation finale.
- Trajectoires : restent hors du détecteur objet pour ce premier POC.

## Convention métier POC

Classes d'entraînement :

1. `attacker` : attaquant sans ballon, généralement numéro seul.
2. `ball_carrier` : attaquant porteur, généralement numéro entouré.
3. `defender` : joueur adverse, rouge ou dessiné avec crochet/parenthèses/croix.
4. `ball` : pictogramme de ballon explicite.
5. `cone` : plot/cône.

`ball_carrier` est volontairement distinct **uniquement dans le POC ML** afin que le modèle apprenne la différence visuelle numéro seul / numéro entouré. Dans MyBasket, il devra être converti en `attacker` + possession/objet ballon. Cela ne change pas le format de production actuel.

Le générateur `generate_dataset.cjs` couvre déjà les conventions essentielles : numéro seul, porteur entouré, défenseur rouge, défenseur en croix, défenseur avec formes latérales, cônes, ballon et trajectoires parasites, avec rotation/bruit/effet écran.

## 1. Générer un lot synthétique complémentaire

Depuis la racine du repo :

```bash
node tests/vision-poc/generate_dataset.cjs tests/vision-poc/generated 300 20260913
```

Ne pas utiliser le synthétique seul pour valider le POC.

## 2. Préparer le dataset sans fuite train/valid/test

`prepare_dataset.py` sépare maintenant les données **par groupe/source**, jamais aléatoirement image par image à l'intérieur d'un même groupe.

Il cherche en priorité dans chaque entrée COCO image :

- `source_group`
- `document_id`
- `source_document`
- `source_id`
- `parent_id`

Pour les vraies images sans métadonnée de groupe, il utilise le nom de fichier en retirant des suffixes usuels `crop`, `fragment`, `row`, `page`, etc. Pour les documents importants, ajouter explicitement `source_group` reste préférable.

Exemple avec le corpus réel local et le synthétique :

```bash
python3 tests/vision-poc/prepare_dataset.py \
  --source tests/corpus-poc/annotations-coco.json:tests/corpus-poc:real \
  --source tests/vision-poc/generated/annotations-coco.json:tests/vision-poc/generated/images:synthetic \
  --out tests/vision-poc/dataset \
  --valid-ratio 0.10 \
  --test-ratio 0.10
```

Le script produit `split-report.json` avec le nombre d'images, de groupes, d'annotations et le détail par classe/source. Il lève une erreur si le même groupe apparaît dans deux splits.

Pour forcer une vraie image (et donc tout son groupe) dans le test :

```bash
python3 tests/vision-poc/prepare_dataset.py ... --holdout mon-schema-reel-01.jpg
```

## 3. Contrôler le split avant entraînement

Vérifier impérativement :

- qu'il reste une proportion significative de vraies images dans `valid` et `test` ;
- que les fragments d'un même PDF/schéma sont tous dans le même split ;
- que chaque classe est représentée dans `train` et si possible dans `valid/test` ;
- que le test réel n'a jamais servi à créer une augmentation synthétique.

## 4. Entraîner gratuitement

Créer un zip contenant :

```text
train/
valid/
test/
split-report.json
```

Ouvrir `MyBasket_RFDETR_POC.ipynb` dans Google Colab, activer un GPU gratuit s'il est disponible, charger le zip puis entraîner RF-DETR Nano.

Le notebook n'est pas une preuve de réussite : conserver le checkpoint uniquement si les métriques du vrai test sont satisfaisantes.

## 5. Mesurer le vrai test

Installer les dépendances d'évaluation :

```bash
pip install "rfdetr[onnx]" pycocotools pillow numpy
```

Puis :

```bash
python3 tests/vision-poc/evaluate_rfdetr.py \
  --dataset tests/vision-poc/dataset \
  --checkpoint /chemin/vers/checkpoint.pth \
  --threshold 0.30 \
  --out tests/vision-poc/evaluation-report.json
```

Le rapport contient :

- precision / recall ;
- mAP50 et mAP50:95 ;
- AP50 par classe ;
- TP / FP / FN par classe ;
- liste détaillée des faux positifs et faux négatifs ;
- erreur de position normalisée `(u,v)` après recalage si `court_bbox` est fourni, sinon relativement à l'image déjà rectifiée.

Priorité de lecture des résultats : joueurs → attaquant/défenseur → porteur → cônes → ballon.

## 6. Export ONNX puis test navigateur

Seulement après validation du checkpoint :

```python
from rfdetr import RFDETRNano
model = RFDETRNano(pretrain_weights="checkpoint.pth")
model.export(output_dir="mybasket_onnx", format="onnx")
```

Tester ensuite le `.onnx` avec `browser/index.html`. Le modèle et l'image restent dans le navigateur ; aucune API distante n'est nécessaire.

## Règle d'intégration MyBasket

Tant que le POC n'est pas validé sur de vraies images jamais vues :

- ne pas modifier `lib/import/court-geometry.ts` ;
- ne pas modifier `lib/import/court-rectify.ts` ;
- ne pas remplacer `diagram-vision.ts`, `local-exercise-scanner.ts`, `mybasket-symbols.ts` ou `plaquette-converter.ts` ;
- ne pas activer le modèle en production ;
- ne pas déployer sur Vercel.

L'intégration future se fera derrière un feature flag avec fallback vers le moteur actuel.
