/** Listing preference only. Never use this as an authorization check. */
export function institutionTeamVisible(metadata: Record<string, any> | null | undefined): boolean {
  if (!metadata) return true;
  const selection = metadata.institutionKind === 'selection' || Boolean(metadata.institutionSelectionId);
  return !selection || metadata.institutionShowInMyTeams === true;
}
