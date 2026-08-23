/**
 * Catalogue unique des permissions commerciales MyBasket.
 *
 * Important :
 * - Les clés ci-dessous sont les seules clés éditables dans la matrice CEO.
 * - Une case cochée correspond à UNE permission précise.
 * - Les regroupements (ex: management) ne sont que des vues dérivées et ne
 *   doivent jamais être enregistrés comme des droits autonomes.
 */

export type SubscriptionPermissionKey =
  | "bibliotheque"
  | "plaquette"
  | "accompagnement"
  | "annonces"
  | "annonces_submit"
  | "creation_exercices"
  | "creation_systemes"
  | "creation_seances"
  | "favoris"
  | "playbooks"
  | "papiers"
  | "equipes"
  | "collaboration_equipe"
  | "stats_joueur"
  | "stats_jeu"
  | "stats_live"
  | "rotation"
  | "gameplan"
  | "gestion_administrative"
  | "club_space"
  | "institutionnel"
  | "messagerie"
  | "calendrier"
  | "profil_coach";

export type PermissionDefinition = {
  key: SubscriptionPermissionKey;
  label: string;
  group: string;
  hint?: string;
};

export const INDIVIDUAL_PERMISSION_GROUPS: Array<{
  key: string;
  label: string;
  items: PermissionDefinition[];
}> = [
  {
    key: "starter",
    label: "Starter Pack",
    items: [
      {
        key: "bibliotheque",
        label: "Bibliothèque",
        group: "Starter Pack",
        hint: "Exercices, systèmes et séances publiés.",
      },
      { key: "plaquette", label: "Plaquette tactique", group: "Starter Pack" },
      { key: "accompagnement", label: "Accompagnement", group: "Starter Pack" },
      {
        key: "annonces",
        label: "Annonces · consultation",
        group: "Starter Pack",
      },
      {
        key: "annonces_submit",
        label: "Annonces · proposer",
        group: "Starter Pack",
      },
    ],
  },
  {
    key: "creation",
    label: "Création & organisation",
    items: [
      { key: "creation_exercices", label: "Créer ses exercices", group: "Création & organisation" },
      { key: "creation_systemes", label: "Créer ses systèmes", group: "Création & organisation" },
      { key: "creation_seances", label: "Créer ses séances", group: "Création & organisation" },
      { key: "favoris", label: "Favoris", group: "Création & organisation" },
      { key: "playbooks", label: "Playbooks", group: "Création & organisation" },
      { key: "papiers", label: "Documents personnels", group: "Création & organisation" },
    ],
  },
  {
    key: "team",
    label: "Équipe & collaboration",
    items: [
      { key: "equipes", label: "Mes équipes", group: "Équipe & collaboration" },
      {
        key: "collaboration_equipe",
        label: "Collaboration / assistants",
        group: "Équipe & collaboration",
        hint: "La limite d'assistants est réglée séparément dans les limites du plan.",
      },
    ],
  },
  {
    key: "performance",
    label: "Management & performance",
    items: [
      { key: "stats_joueur", label: "Stats joueurs / équipe", group: "Management & performance" },
      { key: "stats_jeu", label: "Stats jeu / systèmes", group: "Management & performance" },
      { key: "stats_live", label: "LiveStats", group: "Management & performance" },
      { key: "rotation", label: "Rotation", group: "Management & performance" },
      { key: "gameplan", label: "Game Plan", group: "Management & performance" },
    ],
  },
];

/**
 * Permissions conservées hors matrice individuelle pour les autres univers.
 * Club et Institution restent volontairement séparés de l'offre individuelle.
 */
export const OTHER_PERMISSION_GROUPS: Array<{
  key: string;
  label: string;
  items: PermissionDefinition[];
}> = [
  {
    key: "other",
    label: "Autres espaces",
    items: [
      { key: "gestion_administrative", label: "Gestion administrative", group: "Autres espaces" },
      { key: "club_space", label: "Espace club", group: "Autres espaces" },
      { key: "institutionnel", label: "Institutionnel", group: "Autres espaces" },
    ],
  },
];

export const ALL_MATRIX_PERMISSION_KEYS = [
  ...INDIVIDUAL_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
  ...OTHER_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
] as SubscriptionPermissionKey[];

/**
 * Alias de compatibilité pour le code historique. Ils ne sont PAS affichés
 * dans la matrice et permettent une migration sans casse.
 */
export const PUBLIC_ACCESS_ALIASES: Record<string, SubscriptionPermissionKey[]> = {
  messagerie: ["messagerie"],
  calendrier: ["calendrier"],
  coach_space: ["profil_coach"],
  bibliotheque: ["bibliotheque"],
  exercices: ["creation_exercices"],
  systemes: ["creation_systemes"],
  seances: ["creation_seances"],
  plaquette: ["plaquette"],
  accompagnement: ["accompagnement"],
  annonces: ["annonces"],
  annonces_submit: ["annonces_submit"],
  favoris: ["favoris"],
  playbooks: ["playbooks"],
  documents: ["papiers"],
  equipes: ["equipes"],
  collaboration: ["collaboration_equipe"],
  stats_joueur: ["stats_joueur"],
  stats_jeu: ["stats_jeu"],
  stats_live: ["stats_live"],
  rotation: ["rotation"],
  gameplan: ["gameplan"],
  gestion_administrative: ["gestion_administrative"],
  club_space: ["club_space"],
  institutionnel: ["institutionnel"],
  // Agrégat d'affichage uniquement : il ouvre le menu Management si au moins
  // une sous-fonction est autorisée, mais n'accorde jamais les autres droits.
  management: ["stats_joueur", "stats_jeu", "stats_live", "rotation", "gameplan"],
};

export const SYSTEM_ACCESS = {
  abonnement: true,
  boutique: true,
  profil: true,
  calendrier: true,
} as const;
