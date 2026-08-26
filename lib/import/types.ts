export type AiPoint = { x: number; y: number };

export type AiDiagramPlayer = {
  key: string;
  label: string;
  team: "att" | "def";
  x: number;
  y: number;
  hasBall?: boolean;
  color?: string;
};

export type AiDiagramObject = {
  kind: "cone" | "ball" | "text" | "circle" | "square" | "triangle";
  x: number;
  y: number;
  text?: string;
};

export type AiDiagramAction = {
  action: "pass" | "dribble" | "cut" | "screen" | "shoot" | "freedraw";
  fromPlayer?: string;
  toPlayer?: string;
  from?: AiPoint;
  to: AiPoint;
  order?: number;
  points?: AiPoint[];
};

export type AiExerciseDiagram = {
  detected: boolean;
  courtType: "half" | "full";
  players: AiDiagramPlayer[];
  objects: AiDiagramObject[];
  actions: AiDiagramAction[];
  notes: string;
};

export type AiExerciseImport = {
  title: string;
  organisation: string;
  deroulement: string[];
  consignes: string[];
  variantes: string[];
  plots: number | null;
  ballons: number | null;
  paniers: number | null;
  joueurs: number | null;
  categorie: "— Choisir —" | "U9" | "U11" | "U13" | "U15" | "U18" | "U21" | "Senior";
  type: "Individuel" | "Pré-co" | "Collectif";
  niveau: "Débutant" | "Intermédiaire" | "Confirmé";
  temps: number | null;
  themes: string[];
  diagram: AiExerciseDiagram;
  diagrams?: AiExerciseDiagram[];
  source?: "local" | "ai";
  confidence: {
    text: number;
    diagram: number;
  };
  warnings: string[];
};

export type PlaquetteSchemaData = {
  title: string;
  schemaGroupId: string;
  phaseIndex: number;
  courtType: "half" | "full";
  phases: Array<{
    players: any[];
    objects: any[];
    lines: any[];
    notes: string;
    duration?: number;
    startMode?: "withPrevious" | "afterPrevious";
  }>;
  sheet: null;
  current: number;
  imageData: string;
  phaseImages: string[];
  editable: true;
};
