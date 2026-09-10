/**
 * Bouchon de `scanExerciseLocally` pour le test de chaîne d'interface.
 *
 * Le moteur d'analyse est déjà couvert par tests/import-suite.cjs. Ici, seul le
 * CÂBLAGE est testé : on injecte donc un résultat d'import connu, et on vérifie
 * ce que l'interface en fait.
 */

import type { AiExerciseImport } from "@/lib/import/types";

let queued: AiExerciseImport | null = null;
let error: string | null = null;

export function setScanResult(result: AiExerciseImport | null, failure?: string) {
  queued = result;
  error = failure ?? null;
}

export async function scanExerciseLocally(
  _file: File,
  onStatus?: (message: string) => void
): Promise<AiExerciseImport> {
  onStatus?.("Analyse…");
  if (error) throw new Error(error);
  if (!queued) throw new Error("Aucun résultat préparé");
  return queued;
}
