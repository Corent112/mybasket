// ============================================================
// MYBASKET — Données mock (Étape 1)
// À remplacer plus tard par les données Supabase.
// ============================================================

export type ContentType = "exercise" | "system";

export interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  category: string;
  createdAt: string; // ISO 8601
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  text: string;
}

// --- Exercices + Systèmes (mélangés volontairement, non triés) ---
export const CONTENT_ITEMS: ContentItem[] = [
  {
    id: "ex-1",
    title: "Montée de balle 3 lignes",
    type: "exercise",
    category: "Transition",
    createdAt: "2026-05-20T09:30:00Z",
  },
  {
    id: "sy-1",
    title: "Système Horns Flare",
    type: "system",
    category: "Attaque placée",
    createdAt: "2026-05-27T14:05:00Z",
  },
  {
    id: "ex-2",
    title: "Shooting catch & shoot",
    type: "exercise",
    category: "Tir",
    createdAt: "2026-05-25T18:45:00Z",
  },
  {
    id: "sy-2",
    title: "Système Iverson Cut",
    type: "system",
    category: "Attaque placée",
    createdAt: "2026-05-15T11:00:00Z",
  },
  {
    id: "ex-3",
    title: "Défense sur écran porteur",
    type: "exercise",
    category: "Défense",
    createdAt: "2026-05-26T08:20:00Z",
  },
  {
    id: "sy-3",
    title: "Système Spain Pick & Roll",
    type: "system",
    category: "Pick and Roll",
    createdAt: "2026-05-22T16:10:00Z",
  },
  {
    id: "ex-4",
    title: "1 contre 1 départ croisé",
    type: "exercise",
    category: "Fondamentaux",
    createdAt: "2026-05-10T10:00:00Z",
  },
  {
    id: "sy-4",
    title: "Système Box UCLA",
    type: "system",
    category: "Remise en jeu",
    createdAt: "2026-05-28T07:15:00Z",
  },
];

// --- Témoignages (mock) ---
export const TESTIMONIALS: Testimonial[] = [
  {
    id: "t-1",
    name: "Julien M.",
    role: "Coach U15 — Club de Lyon",
    text:
      "MyBasket m'a fait gagner un temps fou dans la préparation de mes séances. Tout est clair et prêt à l'emploi.",
  },
  {
    id: "t-2",
    name: "Sophie D.",
    role: "Entraîneure Seniors — Bordeaux",
    text:
      "L'éditeur de systèmes est exactement ce qu'il me manquait. Mes joueuses comprennent enfin mes schémas !",
  },
  {
    id: "t-3",
    name: "Karim B.",
    role: "Responsable technique — Marseille",
    text:
      "Une bibliothèque d'exercices très complète. Je recommande à tous les coachs, débutants comme confirmés.",
  },
];