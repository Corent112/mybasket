# Player tests and institutional groups

- Team player > Tests > Ajouter un test opens the QR/link panel. Saisir ici keeps the existing manual input.
- Only a team owner, an active team member with players rights, or an authorized institution sports manager can generate/revoke the shared measurement link.
- The new link replaces the previous link. Only its SHA-256 hash and issuer are stored in the existing teams.metadata.playerTestsLink. The token is disclosed once to its creator. No automatic expiry; explicit revocation/rotation and issuer permissions are checked on access.
- Public form lists player IDs and names only. It accepts an existing catalog test, finite non-negative numeric value, valid date and client submission UUID. It appends to player_tests with the same fields as manual entry. Repeated identical requests are idempotent. No editing/deleting other results, arbitrary units, private details or arbitrary team/player IDs.
- Tests reload on focus and every 30 seconds while the player Tests tab is visible. Existing charts/PDF use these same rows. QR generation uses the local qrcode dependency, not a third-party QR service.
- Dashboard shows Joueurs and existing institution groups instead of the four fixed U13/U14 boxes. Ligue/Pôle player count reads the existing primary roster.
- Creation offers Sélection or Pôle. Existing institutional_selections/teams are reused; institutionGroupType identifies Pôle. Pôle group roster is uncapped and still creates/reuses team-player links. Final selections keep their 10/12 cap; preselection behavior is retained.
- Joueurs > Supprimer confirms reversible archival in players.metadata.institutionRosterArchived. Fiches archivées > Restaurer undoes it. No player identity, canonical record, partner link or match statistic is deleted. Public test form omits archived primary records.
- No schema migration is required. No real invitations or test measurements were submitted during automated checks. Tests use mock database/provider boundaries; live Supabase policies are not changed.
