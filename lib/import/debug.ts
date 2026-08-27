/**
 * lib/import/debug.ts
 * ---------------------------------------------------------------------------
 * Collecteur de debug pour la numérisation d'exercice (photo / vidéo).
 *
 * Règle : AUCUN console.log en production. Le collecteur est inerte dès que
 * process.env.NODE_ENV !== "development" : il ne stocke rien et ne journalise
 * rien. Le panneau de debug de <ExercisePhotoImport /> n'est affiché que dans
 * les mêmes conditions.
 */

import type { AiRect } from "./types";

export const IMPORT_DEBUG_ENABLED = process.env.NODE_ENV === "development";

export type ImportDebugRejection = {
  stage: string;
  what: string;
  why: string;
  count?: number;
};

export type ImportDebugZone = {
  key: string;
  label: string;
  rect: AiRect;
  text: string;
  confidence: number;
};

export type ImportDebugGraphic = {
  index: number;
  frame: number;
  regionRect: AiRect;
  courtRect: AiRect;
  courtKind: "half" | "full";
  orientation: string;
  players: number;
  objects: number;
  lines: number;
  lineKinds: Record<string, number>;
  rejections: ImportDebugRejection[];
};

export type ImportDebug = {
  enabled: boolean;
  frames: number;
  ocrRawText: string;
  ocrConfidence: number;
  ignoredChromeLines: string[];
  zones: ImportDebugZone[];
  graphics: ImportDebugGraphic[];
  rejections: ImportDebugRejection[];
  timingsMs: Record<string, number>;
};

export type ImportDebugCollector = {
  readonly enabled: boolean;
  setFrames: (count: number) => void;
  setRawOcr: (text: string, confidence: number) => void;
  addIgnoredChrome: (lines: string[]) => void;
  addZone: (zone: ImportDebugZone) => void;
  addGraphic: (graphic: ImportDebugGraphic) => void;
  reject: (rejection: ImportDebugRejection) => void;
  time: <T>(label: string, run: () => Promise<T>) => Promise<T>;
  snapshot: () => ImportDebug | undefined;
};

const emptyDebug = (): ImportDebug => ({
  enabled: true,
  frames: 0,
  ocrRawText: "",
  ocrConfidence: 0,
  ignoredChromeLines: [],
  zones: [],
  graphics: [],
  rejections: [],
  timingsMs: {},
});

/**
 * Crée un collecteur. En production il renvoie un objet no-op : les appels sont
 * conservés dans le code (lisibilité) mais ne coûtent rien et n'exposent rien.
 */
export function createImportDebug(enabled = IMPORT_DEBUG_ENABLED): ImportDebugCollector {
  if (!enabled) {
    return {
      enabled: false,
      setFrames: () => undefined,
      setRawOcr: () => undefined,
      addIgnoredChrome: () => undefined,
      addZone: () => undefined,
      addGraphic: () => undefined,
      reject: () => undefined,
      time: async (_label, run) => run(),
      snapshot: () => undefined,
    };
  }

  const data = emptyDebug();

  return {
    enabled: true,
    setFrames: (count) => {
      data.frames = count;
    },
    setRawOcr: (text, confidence) => {
      data.ocrRawText = text;
      data.ocrConfidence = confidence;
    },
    addIgnoredChrome: (lines) => {
      for (const line of lines) {
        if (line && !data.ignoredChromeLines.includes(line)) data.ignoredChromeLines.push(line);
      }
    },
    addZone: (zone) => {
      data.zones.push(zone);
    },
    addGraphic: (graphic) => {
      data.graphics.push(graphic);
    },
    reject: (rejection) => {
      const existing = data.rejections.find(
        (item) => item.stage === rejection.stage && item.why === rejection.why && item.what === rejection.what
      );
      if (existing) existing.count = (existing.count || 1) + (rejection.count || 1);
      else data.rejections.push({ ...rejection, count: rejection.count || 1 });
    },
    time: async (label, run) => {
      const start = performance.now();
      try {
        return await run();
      } finally {
        data.timingsMs[label] = Math.round(performance.now() - start);
      }
    },
    snapshot: () => data,
  };
}
