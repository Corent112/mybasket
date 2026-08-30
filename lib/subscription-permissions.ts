/**
 * Catalogue unique des permissions commerciales MyBasket.
 *
 * La matrice CEO est la source de vérité : les presets de l'interface ne font
 * que cocher/décocher ces permissions, ils ne créent aucune logique parallèle.
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
  | "video_tool"
  | "offline_mode"
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

export type PermissionGroup = {
  key: string;
  label: string;
  items: PermissionDefinition[];
};

export const INDIVIDUAL_PERMISSION_GROUPS: PermissionGroup[] = [
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
      { key: "annonces", label: "Annonces · consultation", group: "Starter Pack" },
      { key: "annonces_submit", label: "Annonces · proposer", group: "Starter Pack" },
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
    label: "LiveStats & performance",
    items: [
      {
        key: "stats_jeu",
        label: "LiveStats · collectif",
        group: "LiveStats & performance",
        hint: "Statistiques équipe, systèmes, temps forts et résultats.",
      },
      {
        key: "stats_joueur",
        label: "LiveStats · individuel",
        group: "LiveStats & performance",
        hint: "Statistiques et fiches individuelles des joueurs.",
      },
      {
        key: "stats_live",
        label: "Outil de prise de stats LiveStats",
        group: "LiveStats & performance",
        hint: "Prise de stats connectée. Ce droit n'accorde pas le mode hors ligne.",
      },
      { key: "rotation", label: "Rotation", group: "LiveStats & performance" },
      { key: "gameplan", label: "Game Plan", group: "LiveStats & performance" },
    ],
  },
  {
    key: "video",
    label: "Vidéo & hors ligne",
    items: [
      {
        key: "video_tool",
        label: "Outil vidéo / codage",
        group: "Vidéo & hors ligne",
        hint: "Analyse vidéo, clips, montage et codification.",
      },
      {
        key: "offline_mode",
        label: "Mode hors ligne",
        group: "Vidéo & hors ligne",
        hint: "Utilisation locale de l'outil vidéo sans connexion Internet.",
      },
    ],
  },
];

export const CLUB_PERMISSION_GROUPS: PermissionGroup[] = [
  ...INDIVIDUAL_PERMISSION_GROUPS,
  {
    key: "club",
    label: "Espace Club",
    items: [
      {
        key: "club_space",
        label: "Espace Club",
        group: "Espace Club",
        hint: "Accès au dashboard et aux fonctions propres au club.",
      },
      {
        key: "gestion_administrative",
        label: "Gestion administrative",
        group: "Espace Club",
        hint: "Licenciés, documents et fonctions administratives du club.",
      },
    ],
  },
];

export const OTHER_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "other",
    label: "Autres espaces",
    items: [
      { key: "gestion_administrative", label: "Gestion administrative", group: "Autres espaces" },
      { key: "club_space", label: "Espace club", group: "Autres espaces" },
      { key: "institutionnel", label: "Institution", group: "Autres espaces" },
    ],
  },
];

export const ALL_MATRIX_PERMISSION_KEYS = Array.from(
  new Set<SubscriptionPermissionKey>([
    ...INDIVIDUAL_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
    ...CLUB_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
    ...OTHER_PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
  ]),
);

/** Alias de compatibilité pour tout le code historique. */
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
  stats_individuel: ["stats_joueur"],
  stats_jeu: ["stats_jeu"],
  stats_collectif: ["stats_jeu"],
  stats_live: ["stats_live"],
  livestats: ["stats_live"],
  video_tool: ["video_tool"],
  video_analysis: ["video_tool"],
  offline_mode: ["offline_mode"],
  offline_video: ["offline_mode"],
  rotation: ["rotation"],
  gameplan: ["gameplan"],
  gestion_administrative: ["gestion_administrative"],
  club_space: ["club_space"],
  institutionnel: ["institutionnel"],
  management: ["stats_joueur", "stats_jeu", "stats_live", "rotation", "gameplan", "video_tool"],
};

export const SYSTEM_ACCESS = {
  abonnement: true,
  boutique: true,
  profil: true,
  calendrier: true,
} as const;
