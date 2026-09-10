/**
 * Point d'entrée du test de chaîne d'interface.
 *
 * On monte le VRAI composant `ExercisePhotoImport` (aucune copie, aucune
 * réécriture) ; seul `scanExerciseLocally` est remplacé par un bouchon, pour
 * fournir des résultats d'import contrôlés sans exécuter le moteur.
 */

import ExercisePhotoImport from "@/components/ai/ExercisePhotoImport";
import ImportReview, { countReviewItems, diagramsOf, reviewItemsOfDiagram } from "@/components/import/ImportReview";
import { importToPlaquetteSchema, renderSchemaPreviews } from "@/lib/import/plaquette-converter";
import { setScanResult } from "./scanner-stub";

export {
  ExercisePhotoImport,
  ImportReview,
  countReviewItems,
  diagramsOf,
  reviewItemsOfDiagram,
  importToPlaquetteSchema,
  renderSchemaPreviews,
  setScanResult,
};
