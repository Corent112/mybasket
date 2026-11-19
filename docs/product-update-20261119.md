# MyBasket — mise à jour des parcours du 19 novembre 2026

Les cases ne sont cochées qu'après implémentation et vérification. Les données existantes doivent être conservées.

- [x] Analyse après-match automatique intégrée, retrait de l'entrée IA isolée.
- [x] Analyse équipe : indicateurs, quatre facteurs, comparaisons, courbes, zones et PDF (moyennes / matchs).
- [x] Stats joueurs : MJ, 5D, minutes et moyennes ; détail match avant résumé.
- [x] Abonnements : aucune capacité affichée ; Institution sur devis.
- [x] PJ5 : alléger les cartes (titre et photo).
- [x] Boutique : poids produit, adresses livraison/facturation et case identiques, tarifs La Poste recalculés serveur.
- [x] Calendrier : dédoublonnage, rendez-vous typés, équipe / joueurs, calendriers individuels, notifications.
- [x] Fiches joueurs : emploi du temps scolaire importé visible.
- [x] Grilles de tir : création toujours vierge, modèles sauvegardés conservés.
- [x] Playbook : expliquer les familles / séries ; titres de colonnes sur une ligne.
- [x] Scouting : Équipe / Joueurs / Formes adverses, données liées préremplies, tendances et clés off/def.
- [x] Administration : séparer abonnés et contacts / prospects / participants.
- [x] Connexions : actualisation de la dernière connexion et source fiable.
- [x] Paiements : abonnements sous codes promotionnels et accès gratuits.
- [x] Connaissances : import documentaire multiple, indexation contrôlée, chatbot flottant documenté.
- [x] Vérifications : calculs, autorisations, paiement, UX responsive, TypeScript et build.

## Limites à vérifier en production

Les envois email, SMS et push et les API de transport dépendent des fournisseurs configurés. Aucun envoi de test à un vrai destinataire sans demande explicite. Une ressource importée alimente la recherche documentaire, sans entraîner le modèle. Les statistiques absentes restent non renseignées et ne deviennent pas des zéros.

## Livrables et vérifications

- Analyse des matchs accessible dans la fiche équipe et le module Stats équipe ; sélection d’un match / compétition et PDF des moyennes ou de chaque match.
- Bilan après-match déclenché à la finalisation, cache par empreinte des chiffres ; phrases IA filtrées par preuves numériques calculées côté serveur. Repli chiffré explicite si le fournisseur est indisponible.
- Le codage défensif n’alimente les quatre facteurs que lorsque ses points correspondent au score adverse. Les chiffres inconnus ne deviennent pas zéro. Les cinq de départ inconnus sont indiqués par un tiret.
- Boutique : adresses et poids enregistrés dans les métadonnées existantes ; tarifs Colissimo domicile 2026 et 2027 vérifiés sur https://www.laposte.fr/tarif-colissimo le 19/11/2026. Calcul serveur, panier sans expédition à zéro, pays et tranches hors couverture bloqués. Poids saisi = poids expédié, emballage compris. Livraison limitée à la France métropolitaine, Monaco et Andorre. Il s’agit d’un module tarifaire, pas d’une connexion au contrat d’affranchissement ou à l’impression d’étiquettes.
- Les montants, poids et adresses de livraison sont liés à l’empreinte de paiement ; un ancien montant de livraison est refusé et recalculé dans le panier.
- Calendriers : vues propriétaire / destinataire, évènements privés par joueur, liens U18/U21 vérifiés sur la propriété des équipes, notifications sur évènement sauvegardé et protection contre le double envoi.
- Import d’emploi du temps scolaire photo/PDF : aperçu modifiable, période choisie, sauvegarde idempotente ; les ambiguïtés doivent être validées avant ajout. L’import ne constitue pas une garantie OCR parfaite.
- Connaissances IA : import multiple directement dans le stockage privé (sans faire transiter les gros fichiers par une fonction Vercel), résultat et avertissements par document. PowerPoint textuel, documents texte/Word/PDF et reconnaissance visuelle des images ou PDF sans texte. Lecture visuelle limitée à 20 Mo, documents à 50 Mo. Un fichier stocké sans passages indexés n’est pas présenté comme une connaissance utilisable.
- Scouting : résultats de la compétition principale et données LNB liées, tableaux joueurs complets, champs tactiques et plan offensif/défensif modifiables, bibliothèque et dessin conservés pour les formes de jeu.
- La dernière connexion est enregistrée côté serveur dans les métadonnées d’authentification, sans permettre au client de choisir l’utilisateur ni la date.

### Pièces jointes repérées

- PJ2 / 08:33:31 : référence du tableau de bord statistique.
- Vidéo 08:36:22 (PJ5) : la surcharge est la description du produit dans le paiement hébergé Stripe ; elle est retirée de cet écran.
- 08:57:36 : familles de systèmes ; 08:58:04 : titres du tableau de rentabilité.
- Vidéo 08:59:25 (PJ10) : statistiques équipe, détail par match au-dessus des synthèses.
- Vidéo 09:03:34 et 09:08:49 : calendrier individuel et rendez-vous.
- 09:11:51 / 09:11:56 / 09:12:34 : scouting joueurs / collectif / game plan.
- 09:17:07 / 09:19:25 / 09:21:22 / 09:22:35 : répertoires, connexion, paiements et connaissances.

### Tests exécutés

Tests des tarifs et seuils 2026/2027, poids issus du catalogue, commande avec/sans expédition, refus des montants ou métadonnées altérés, droits des calendriers privés et multi-équipes, dédoublonnage, idempotence des emplois du temps, notifications sélectionnées sans double envoi, rafraîchissement de connexion, statistiques et dénominateurs, extraction PowerPoint, génération PDF (récapitulatif exemple sur une page A4 paysage), assistant documentaire en DOM (citations, oui/non, isolation de compte).

Aucun paiement, email, SMS, push ou appel de génération IA réel n’a été déclenché par les tests. Les clés des fournisseurs et leurs résultats réels restent à vérifier en production. L’accès Vercel à l’équipe corent112-mybasket a été refusé (403) ; une autorisation de cette équipe a été demandée via le lien fourni par Vercel. Les vérifications de déploiement GitHub/Vercel et le build local sont consignés dans la description de la PR.

Build production local validé avec police de substitution locale uniquement (aucune modification des polices de production). TypeScript sans erreur. ESLint des nouveaux composants/routes sans erreur ; trois avertissements sur les images distantes du scouting.

### Correctif avant déploiement

Le contrôle GitHub a détecté deux alertes modérées de cache sur Next.js 16.4.3 (GHSA-mfr8-8qww-v76h et GHSA-vc7v-qv4w-wrv8). Next.js et eslint-config-next passent à 16.4.6 ; le verrou de dépendances est mis à jour. Le contrôle npm audit et le build Vercel sont relancés sur cette version corrigée.
