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

/* -------------------------------------------------------------------------- */
/* Confiance et traçabilité (V3)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Nature d'un jeton. `unknown` est une VALEUR DE PLEIN DROIT : on ne force
 * jamais attaquant ou défenseur quand les indices sont faibles. L'interface
 * demandera à l'utilisateur de trancher, ce qui coûte un clic — bien moins
 * qu'une erreur silencieuse à retrouver.
 *
 * `team` reste renseigné pour ne rien casser en aval (la Plaquette ne connaît
 * que att / def) : un `unknown` est stocké en `att` ET marqué à revoir.
 */
export type AiDetectionType = "attacker" | "defender" | "unknown";

/** Toute détection porte son niveau de certitude et la raison qui l'a produite. */
export type AiEvidence = {
  /** 0..1. En dessous de 0.5, l'élément doit être présenté comme à confirmer. */
  confidence: number;
  /** Ce qui a déclenché la détection : lisible dans le panneau de debug. */
  source?: string;
};

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
  /** Nature détectée, `unknown` compris (V3). Champ optionnel : `team` fait foi. */
  type?: AiDetectionType;
  /** Confiance de la DÉTECTION du jeton (est-ce bien un joueur ?). */
  confidence?: number;
  /** Confiance de la CLASSIFICATION attaquant / défenseur. */
  typeConfidence?: number;
  /** Ce qui a produit la détection, pour le debug. */
  source?: string;
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
  /** V3 — confiance et origine de la détection. */
  confidence?: number;
  source?: string;
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
  /** V3 — confiance et origine de la détection. */
  confidence?: number;
  source?: string;
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
  /** true si ce schéma vient d'un terrain redressé par homographie. */
  rectified?: boolean;
  /** Score du redressement (marquages officiels retrouvés), quand applicable. */
  rectifyScore?: number;
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
  /**
   * Terrain REDRESSÉ (vue de dessus, perspective annulée), en data URL.
   * Renseigné dès que le redressement a réussi, même si aucun élément n'a pu
   * être reconnu ensuite : l'utilisateur a toujours de quoi partir — calque à
   * décalquer dans Plaquette, ou image jointe à l'exercice.
   * Champ OPTIONNEL : aucun consommateur existant n'est impacté.
   */
  rectifiedImage?: string;
  /**
   * Confiance GLOBALE de l'import (0..1), agrégée depuis la géométrie, l'OCR et
   * les éléments détectés. Sert à choisir le ton de l'aperçu : « prêt à
   * vérifier » vs « à reprendre largement ».
   */
  importConfidence?: number;
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
