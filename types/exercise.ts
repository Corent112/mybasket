export type ExerciseReviewStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected";

export type ExerciseVisibility = "private" | "public";

export type ExerciseDiagram = {
  id: string;
  title: string;
  imageUrl: string;
  playData?: string;
  phases?: any[];
  courtType?: "half" | "full" | "demi" | "complet";
  notes?: string;
  createdAt?: number;
  order?: number;
};

export type Diagram = ExerciseDiagram;

export type Exercise = {
  id: string;
  title: string;

  theme?: string;
  themes?: string[];

  type?: string;
  category?: string;
  categorie?: string;

  level?: string;
  niveau?: string;

  description?: string;
  instructions?: string;
  consignes?: string[] | string;

  material?: string;
equipment?: string;

organisation?: string;
deroulement?: string[] | string;
variantes?: string[] | string;

  duration?: string;
  temps?: string | number;

  schemaImage?: string;
  schemaImages?: string[];
  schemaVideo?: string;
  schemaData?: any;
  schemaDataList?: any[];

  images?: string[];
  videos?: string[];

  plots?: string | number;
  ballons?: string | number;
  paniers?: string | number;
  joueurs?: string | number;

  tags?: string[];
  diagrams?: Diagram[];

  owner_id?: string | null;
  user_id?: string | null;

  visibility?: ExerciseVisibility | string | null;
  review_status?: ExerciseReviewStatus | string | null;

  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;

  original_exercise_id?: string | null;

  createdAt?: number;
  updatedAt?: number;
  popularity?: number;
};

export type ExerciseDraftFromPlaybook = {
  title: string;
  diagram: ExerciseDiagram;
};