export type DefenseAttributionKind = "none" | "player_or_team" | "player";

export type DefenseResultRule = {
  id: string; label: string; icon: string; attribution: DefenseAttributionKind;
  attributionLabel?: string; actionType?: string; reboundType?: string;
};

/** Défense MyBasket : TEMPS FORT -> RÉSULTAT -> ATTRIBUTION ÉVENTUELLE -> COMMIT */
export const DEFENSE_RESULTS: DefenseResultRule[] = [
  { id: "shot-made", label: "Panier encaissé", icon: "🔴", attribution: "none", actionType: "tir" },
  { id: "shot-missed-def-rebound", label: "Tir raté · rebond défensif", icon: "🟢", attribution: "player_or_team", attributionLabel: "Qui prend le rebond ?", actionType: "tir", reboundType: "def" },
  { id: "shot-missed-off-rebound", label: "Tir raté · rebond offensif adverse", icon: "🟠", attribution: "none", actionType: "tir", reboundType: "off" },
  { id: "turnover-recovery", label: "BP adverse · récupération", icon: "🖐", attribution: "player_or_team", attributionLabel: "Qui récupère le ballon ?", actionType: "perte-adverse" },
  { id: "steal", label: "Interception", icon: "✋", attribution: "player_or_team", attributionLabel: "Qui intercepte ?", actionType: "interception" },
  { id: "block", label: "Contre", icon: "🛑", attribution: "player", attributionLabel: "Qui contre ?", actionType: "contre" },
  { id: "foul-committed", label: "Faute commise", icon: "🟨", attribution: "player", attributionLabel: "Qui commet la faute ?", actionType: "faute-commise" },
  { id: "foul-drawn", label: "Faute provoquée", icon: "🔔", attribution: "player_or_team", attributionLabel: "Attribuer l’action ?", actionType: "faute-provoquee" },
  { id: "other-stop", label: "Stop / autre", icon: "✓", attribution: "player_or_team", attributionLabel: "Attribuer le stop ?", actionType: "autre" },
];

export function defenseResultRule(id: string) { return DEFENSE_RESULTS.find((rule) => rule.id === id) || null; }
export function defenseNeedsAttribution(id: string) { const rule=defenseResultRule(id); return Boolean(rule && rule.attribution !== "none"); }
export function defenseAllowsTeamAttribution(id: string) { return defenseResultRule(id)?.attribution === "player_or_team"; }
