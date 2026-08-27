/**
 * lib/import/types.ts
 * ---------------------------------------------------------------------------
 * Contrat de données de la numérisation d'exercice.
 *
 * IMPORTANT — SYSTÈME DE COORDONNÉES
 * Les coordonnées x / y portées par AiDiagramPlayer, AiDiagramObject et
 * AiDiagramAction sont DÉJÀ exprimées dans le repère CANONIQUE de la Plaquette
 * (cf. app/plaquette/PlaquetteClient.tsx) :
 *
 *   - repère « plein terrain », x ∈ [0,1] et y ∈ [0,1] ;
 *   - y = 0.5 correspond à la ligne médiane ;
 *   - un schéma DEMI-TERRAIN n'utilise donc que y ∈ [0, 0.5] ;
 *   - le panier haut se situe autour de y ≈ 0.10.
 *
 * La conversion « pixels de la photo → repère canonique » est faite une seule
 * fois, dans lib/import/court-geometry.ts. Aucun autre module ne doit
 * re-normaliser ces valeurs : plaquette-converter.ts se contente de borner.
 */

export type AiPoint = { x: number; y: number };

export type AiRect = { x0: number; y0: number; x1: number; y1: number };

export type AiDiagramPlayer = {
  key: string;
  label: string;
  team: "att" | "def";
  /** Repère canonique Plaquette (voir en-tête). */
  x: number;
  y: number;
  hasBall?: boolean;
  color?: string;
  shape?: "circle" | "square";
  coach?: boolean;
  /** false quand le numéro n'a pas pu être lu de façon fiable. */
  labelConfident?: boolean;
};

/** Uniquement les kinds réellement gérés par la Plaquette. */
export type AiDiagramObjectKind =
  | "ball"
  | "cone"
  | "text"
  | "circle"
  | "square"
  | "triangle"
  | "handoff";

export type AiDiagramObject = {
  kind: AiDiagramObjectKind;
  /** Repère canonique Plaquette (voir en-tête). */
  x: number;
  y: number;
  text?: string;
  color?: string;
};

/** Uniquement les actions réellement gérées par la Plaquette. */
export type AiDiagramActionKind =
  | "pass"
  | "dribble"
  | "cut"
  | "screen"
  | "shoot"
  | "giveball"
  | "freedraw";

export type AiDiagramAction = {
  action: AiDiagramActionKind;
  fromPlayer?: string;
  toPlayer?: string;
  /** Repère canonique Plaquette (voir en-tête). */
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
  /** Libellé « Graphic N°x » lu sur le document, quand il existe. */
  sourceLabel?: string;
  /** Empreinte visuelle du graphique, utilisée pour dédoublonner les vidéos. */
  signature?: string;
  confidence?: number;
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
  /** Renseigné uniquement en développement (voir lib/import/debug.ts). */
  debug?: import("./debug").ImportDebug;
};

/**
 * Forme EXACTE d'une entrée de `schemaDataList` telle que la produit
 * app/plaquette/PlaquetteClient.tsx → buildPlaquetteResult().
 * Un schéma à N phases produit N entrées partageant le même schemaGroupId et
 * le même tableau `phases`, et ne différant que par phaseIndex / current /
 * imageData.
 */
export type PlaquettePhase = {
  players: any[];
  objects: any[];
  lines: any[];
  notes: string;
  duration?: number;
  startMode?: "withPrevious" | "afterPrevious";
};

export type PlaquetteSchemaData = {
  title: string;
  schemaGroupId: string;
  phaseIndex: number;
  courtType: "half" | "full";
  phases: PlaquettePhase[];
  sheet: null;
  current: number;
  imageData: string;
  phaseImages: string[];
  editable: true;
};
