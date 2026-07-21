# Zone 7 — Scouting & exports professionnels

## Corrigé dans le code

- [x] Le retour de la plaquette sélectionne Mon compte > Management > Game Plan > Scouting.
- [x] La page Mon compte lit le paramètre `module=gameplan`.
- [x] Le Game Plan lit `gamePlanTab=scout`.
- [x] Le bouton de la plaquette mémorise une URL de retour différente pour un système adverse.
- [x] L'export contient tous les chiffres clés, le tableau ATT/DEF/V-D, les meilleurs joueurs, le plan adverse, les forces/faiblesses, les systèmes et les fiches joueurs.
- [x] Le titre des situations spéciales inclut BLOB, SLOB et ATO.
- [x] Le PDF est téléchargé directement, sans popup ni boîte d'impression navigateur.
- [x] Mise en page A4 multipage avec rendu des schémas et des zones de tir.
- [x] Une copie du PDF est archivée dans Supabase Storage (`scouting-exports`).
- [x] L'URL du dernier export est enregistrée dans `management_gameplans.scouting_pdf_url`.

## À valider localement

- [ ] Exécuter `zone7_scouting_exports.sql`.
- [ ] Dessiner un système depuis l'onglet Scouting et confirmer le retour au même onglet.
- [ ] Exporter un dossier avec photos et schémas distants afin de confirmer les règles CORS des images.
- [ ] Vérifier l'ouverture de l'URL Storage depuis un second appareil.
