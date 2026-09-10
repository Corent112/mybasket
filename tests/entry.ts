/**
 * tests/entry.ts
 * ---------------------------------------------------------------------------
 * Point d'entrée bundlé pour la batterie de tests.
 *
 * Il n'expose QUE des fonctions de production : la batterie exerce exactement
 * le chemin qu'empruntera un utilisateur, jamais une copie parallèle qui
 * finirait par diverger.
 */

export {
  analyseRegion,
  richness,
  scanExerciseLocally,
  diagramContentSignature,
  collectFromRegion,
  createDiagramCollector,
} from "../lib/import/local-exercise-scanner";
export { rectifyCourt, quadBounds } from "../lib/import/court-rectify";
export { analyseGraphic } from "../lib/import/diagram-vision";
export { classifyCourt, detectCourtCandidates, detectCourtRect } from "../lib/import/court-geometry";
export {
  importToPlaquetteSchema,
  aiDiagramsToPlaquette,
  aiDiagramToPlaquette,
} from "../lib/import/plaquette-converter";
export { createImportDebug } from "../lib/import/debug";
export { solveHomography, invert, applyHomography } from "../lib/import/homography";
