const icons: Record<string, string> = {
  Shooteur: "shooter", Driver: "slasher", Créateur: "creator",
  "Joueur de pick and roll": "pick-roll", Physique: "physical", Rebondeur: "rebounder",
  "Post-up": "post-up", Défenseur: "defender", Slasher: "slasher", Scoreur: "scorer",
  Energizer: "energizer", "Floor General": "floor-general", Précision: "precision",
  Polyvalent: "versatile",
};

export const scoutingProfiles = Object.keys(icons);

export function scoutingProfileLabel(profile?: string) {
  return profile === "P&R Handler" ? "Joueur de pick and roll" : profile;
}

export function scoutingProfileIcon(profile?: string) {
  const label = scoutingProfileLabel(profile);
  const icon = label && Object.hasOwn(icons, label) ? icons[label] : null;
  return icon ? `/scouting-icons/${icon}.png` : null;
}
