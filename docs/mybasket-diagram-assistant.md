# Assistant de lecture des schémas MyBasket — v1

## Ce qui est réellement implémenté

L’assistant utilise un modèle visuel serveur (OPENAI_DIAGRAM_MODEL, sinon OPENAI_VISION_MODEL), des règles basket et un suivi des pixels dans le navigateur. Il ne s’agit pas d’un modèle entraîné sur un corpus MyBasket. La clé reste sur le serveur.

1. **Inventaire indépendant** : terrain/perspective, joueurs encerclés ou non, positions, porteur ; comptage et identification des pointes de flèche et barres terminales.
2. **Reconstruction** : rattachement des traits aux joueurs, nature des actions, quelques points de trajectoire, récepteur et prédécesseur éventuels. Les mouvements restent présents indépendamment des choix de passe.
3. **Contrôle déterministe** : correspondance entre chaque repère et une vraie arrivée de trait ; une seule reprise ciblée est autorisée lorsqu’un repère manque et que le budget le permet. Un échec conserve l’inventaire pour correction.
4. **Géométrie** : le même calque calibré est utilisé pour l’IA et la révision. Le navigateur suit l’encre sombre dans un couloir autour de la trajectoire proposée. Un support visuel insuffisant marque le trait à confirmer. Le suivi ne recherche pas arbitrairement un trajet sur tout le terrain.
5. **Révision** : les repères non reliés apparaissent sur le calque et dans le panneau. L’import est bloqué tant qu’un repère reste sans action ou qu’un numéro de joueur reste inconnu. Le coach retrace/corrige, ou écarte explicitement un faux repère. Annuler rétablit aussi ces doutes.
6. **Édition et phases** : les points d’un tracé vectorisé survivent à la conversion Plaquette, sans afficher une poignée pour chaque pixel. Le moteur existant de continuité par identité relie les phases. Les positions finales de la photo précédente sont fournies comme indices à la lecture suivante ; elles n’écrasent pas les positions visibles.

Chaque photo utilise deux lectures et au maximum une reprise ciblée. Les appels disposent d’un timeout de 50 secondes sans retry SDK ; l’ensemble reste borné par la route (180 secondes) et le navigateur (175 secondes). Une photo contenant plusieurs terrains reste dans le parcours local existant : importer une photo par phase.

## Validation et limites

- `node scripts/test-diagram-assistant.cjs` : graphe écran → déplacement, propriété des actions, coins/perspective, doublons, repères manquants après suppression, échec d’une lecture, nombre limité de reprises et continuité des indices.
- Ce script suit aussi de vrais traits sur les deux images fournies (feutre et crayon) dans `scripts/fixtures/diagram-assistant/` et vérifie que les géométries sont conservées dans les objets Plaquette natifs.
- Les couloirs utilisés par ces tests photo sont **indiqués humainement**. Ces tests mesurent la géométrie, pas la capacité du modèle à trouver seul tous les joueurs et tous les traits.
- Les tests DOM vérifient qu’un repère manquant bloque l’import et qu’Annuler restaure ce blocage après exclusion manuelle.
- Aucun appel à un vrai fournisseur n’a été effectué depuis cet environnement : aucune clé n’y est configurée. Une validation complète doit importer les photos par l’application authentifiée avec la configuration IA serveur active.

L’inventaire visuel peut lui-même oublier une flèche : « tous les repères détectés sont reliés » ne signifie pas « toutes les actions présentes dans la photo ont été reconnues ». Les croisements, les traits effacés, les ombres et les chiffres accolés à des traits restent des cas à évaluer sur un jeu d’images varié. Aucune garantie de reconnaissance parfaite n’est annoncée.

## Références techniques

- Topology-driven vectorization of clean line drawings (ETH Zürich) : analyse de la topologie et ambiguïtés des jonctions — https://cgl.ethz.ch/publications/papers/paperNor13.php
- Potrace FAQ : différence entre conversion des contours et suivi de ligne médiane — https://potrace.sourceforge.net/faq.html

L’implémentation de suivi guidé est propre au projet ; elle n’utilise pas Potrace ni le code de cette publication.

## Diagnostic des échecs

Chaque appel de lecture reçoit une référence. Les erreurs d’accès, de modèle, de quota, de débit, de délai, de format JSON et de géométrie sont distinguées, ainsi que les réponses interrompues par la limite de génération. Le journal associe cette référence à l’étape en cause et aux informations de statut autorisées, sans texte brut du fournisseur, image, prompt ou clé. Les écritures du journal sont différées après la réponse. Une lecture partielle n’est plus journalisée comme un succès complet.

L’interface conserve le diagnostic en révision et au retour au résumé. Un résultat local après échec est présenté comme un brouillon, avec le calque d’origine visible, et ses numéros inconnus doivent être corrigés avant validation. Ces corrections améliorent le diagnostic et la transparence ; elles n’établissent pas à elles seules la cause d’un incident de production ni la qualité de reconnaissance du modèle.
