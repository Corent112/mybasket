/** Le rôle est attaché au poste, jamais au créateur historique de la session. */
export function sharedMatchFollower(session: unknown, codingMode: string): boolean {
  return Boolean(session) && codingMode !== 'live-individual';
}
export function sharedSessionKey(teamId: string, matchId: string | null, sessionId: string | undefined, codingMode: string): string {
  return sessionId
    ? `mybasket_live_session_${sessionId}_${matchId || teamId}_${codingMode}`
    : `mybasket_prise_stats_session_${teamId}`;
}
