/** Keep the historical transition key so saved matches and playbook mappings still resolve. */
export const OFFENSIVE_SYSTEM_SLOTS = [
  "contre-attaque", "libre", "transition", "transition-2",
  "systeme-1", "systeme-2", "systeme-3", "systeme-4", "systeme-5", "systeme-6", "systeme-7", "systeme-8",
  "slob-1", "slob-2", "blob-1", "blob-2",
] as const;

export function orderOffensiveSystems<T extends { id: string }>(buttons: T[]): T[] {
  const ranks = new Map<string, number>(OFFENSIVE_SYSTEM_SLOTS.map((id, index) => [id, index]));
  return [...buttons].sort((a,b)=>(ranks.get(a.id)??ranks.size)-(ranks.get(b.id)??ranks.size));
}

export function isPickCoverage(button: { key: string; label: string }): boolean {
  const excluded = /^(passe|pass|skip)$/i;
  return !excluded.test(button.key.trim()) && !excluded.test(button.label.trim());
}

export function matchCompetitionType(value: unknown): "friendly" | "league" | "cup" | null {
  const type=String(value??"").trim().toLowerCase();
  if(type==="league"||type==="championship"||type==="championnat")return "league";
  if(type==="cup"||type==="coupe")return "cup";
  if(type==="friendly"||type==="amical")return "friendly";
  return null;
}

export function matchCompetitionLabel(setting: unknown, stored: unknown): string | null {
  const type=matchCompetitionType(setting)??matchCompetitionType(stored);
  if(type==="league")return "Championnat";
  if(type==="cup")return "Coupe";
  if(type==="friendly")return "Amical";
  return null;
}
