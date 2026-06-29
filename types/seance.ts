export type SeanceLevel = "Débutant" | "Intermédiaire" | "Confirmé";

export type SeanceCategory =
  | "U9"
  | "U11"
  | "U13"
  | "U15"
  | "U18"
  | "U21"
  | "Seniors";

export type SeanceItem = {
  id: string;
  title: string;
  category: SeanceCategory | "";
  level: SeanceLevel | "";
  duration: string;
  description: string;
  objectifs: string;
  contenu: string;
  image?: string;
  images?: string[];
  createdAt: number;
  updatedAt: number;
};