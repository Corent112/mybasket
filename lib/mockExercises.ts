// ============================================================
// MyBasket — Jeu de données mock pour la bibliothèque (Étape 3)
// À remplacer plus tard par les données Supabase.
// ============================================================

import type { Exercise } from "@/types/exercise";

export const MOCK_EXERCISES: Exercise[] = [
  {
    id: "ex-1",
    title: "Montée de balle 3 lignes",
    type: "exercise",
    categorie: "Transition",
    niveau: "Intermédiaire",
    description:
      "Travail de la montée de balle rapide sur 3 couloirs avec finition au cercle.",
    tags: ["transition", "contre-attaque", "finition"],
    createdAt: Date.parse("2026-05-20T09:30:00Z"),
    popularity: 87,
  },
  {
    id: "sy-1",
    title: "Système Horns Flare",
    type: "system",
    categorie: "Attaque placée",
    niveau: "Confirmé",
    theme: "Stagger",
    description:
      "Système Horns avec écran Flare pour libérer le shooteur en aile.",
    tags: ["horns", "flare", "shoot"],
    createdAt: Date.parse("2026-05-27T14:05:00Z"),
    popularity: 142,
  },
  {
    id: "ex-2",
    title: "Shooting catch & shoot",
    type: "exercise",
    categorie: "Tir",
    niveau: "Intermédiaire",
    description:
      "Série de tirs après passe et déplacement, axé sur la mécanique de catch.",
    tags: ["tir", "passe", "rythme"],
    createdAt: Date.parse("2026-05-25T18:45:00Z"),
    popularity: 64,
  },
  {
    id: "sy-2",
    title: "Système Iverson Cut",
    type: "system",
    categorie: "Attaque placée",
    niveau: "Confirmé",
    theme: "Iso",
    description:
      "Cut Iverson classique pour amener le meneur en attaquant ou en post-up.",
    tags: ["iverson", "cut", "1c1"],
    createdAt: Date.parse("2026-05-15T11:00:00Z"),
    popularity: 95,
  },
  {
    id: "ex-3",
    title: "Défense sur écran porteur",
    type: "exercise",
    categorie: "Défense",
    niveau: "Confirmé",
    description:
      "Travail des choix défensifs sur pick and roll : show, drop, switch.",
    tags: ["défense", "pick and roll", "communication"],
    createdAt: Date.parse("2026-05-26T08:20:00Z"),
    popularity: 110,
  },
  {
    id: "sy-3",
    title: "Système Spain Pick & Roll",
    type: "system",
    categorie: "Pick and Roll",
    niveau: "Expert",
    theme: "Spain PnR",
    description:
      "Pick and Roll avec back-screen sur l'aide, créant une 2v1 immédiate.",
    tags: ["spain", "pnr", "back-screen"],
    createdAt: Date.parse("2026-05-22T16:10:00Z"),
    popularity: 168,
  },
  {
    id: "ex-4",
    title: "1 contre 1 départ croisé",
    type: "exercise",
    categorie: "Fondamentaux",
    niveau: "Débutant",
    description:
      "Travail des départs croisés en 1v1, finition main faible et main forte.",
    tags: ["1v1", "départ croisé", "finition"],
    createdAt: Date.parse("2026-05-10T10:00:00Z"),
    popularity: 38,
  },
  {
    id: "sy-4",
    title: "Système Box UCLA",
    type: "system",
    categorie: "Remise en jeu",
    niveau: "Intermédiaire",
    theme: "Box",
    description:
      "Remise en jeu de côté, formation Box, écran UCLA pour libérer le scoreur.",
    tags: ["box", "ucla", "remise en jeu"],
    createdAt: Date.parse("2026-05-28T07:15:00Z"),
    popularity: 73,
  },
  {
    id: "ex-5",
    title: "Travail de gainage spécifique",
    type: "exercise",
    categorie: "Physique",
    niveau: "Débutant",
    description:
      "Circuit de gainage sur 6 stations, alterné avec dribbles bas.",
    tags: ["physique", "gainage", "préparation"],
    createdAt: Date.parse("2026-05-05T08:00:00Z"),
    popularity: 22,
  },
  {
    id: "sy-5",
    title: "Motion offense 5-out",
    type: "system",
    categorie: "Attaque placée",
    niveau: "Confirmé",
    theme: "Motion",
    description:
      "Mouvement continu 5-out avec lectures de coupes et d'écrans.",
    tags: ["motion", "5-out", "lecture"],
    createdAt: Date.parse("2026-05-18T12:30:00Z"),
    popularity: 121,
  },
];