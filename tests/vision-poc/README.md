# MyBasket – POC vision RF-DETR

Ce dossier isole le POC de reconnaissance locale des symboles de schémas basket.
Aucun fichier de production MyBasket n'est modifié.

## Convention métier figée

Classes d'entraînement :
1. `attacker` : attaquant sans ballon, généralement numéro seul.
2. `ball_carrier` : attaquant porteur, généralement numéro entouré.
3. `defender` : joueur adverse, rouge ou dessiné avec crochet/parenthèses/croix.
4. `ball` : pictogramme de ballon explicite.
5. `cone` : plot/cône.

`ball_carrier` est volontairement distinct pendant l'apprentissage. Dans MyBasket,
il devra être converti en `attacker` + possession du ballon.

## Pipeline

1. Préparer le corpus COCO avec `prepare_dataset.py`.
2. Ouvrir `MyBasket_RFDETR_POC.ipynb` dans Google Colab.
3. Activer un GPU gratuit s'il est disponible.
4. Charger le zip du dataset.
5. Exécuter le notebook.
6. Récupérer le checkpoint et le `.onnx`.
7. Tester localement via `browser/index.html`.

Les schémas réels de test doivent être exclus de toute augmentation ou copie d'entraînement.
