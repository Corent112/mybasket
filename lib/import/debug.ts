/**
 * lib/import/debug.ts
 * ---------------------------------------------------------------------------
 * Collecteur de debug pour la numérisation d'exercice (photo / vidéo).
 *
 * Règle : AUCUN console.log en production. Le collecteur reste inerte tant qu'il
 * n'est pas activé, et n'expose alors rien.
 *
 * V3 — activation à la demande.
 * Le collecteur était compilé « mort » hors développement. Conséquence : quand
 * un coach signalait « ça a mal importé », il n'y avait STRICTEMENT rien à
 * regarder. Il s'active désormais aussi à chaud :
 *
 *     window.__MB_IMPORT_DEBUG__ = true;   // avant de lancer un import
 *
 * Rien n'est journalisé dans la console : les données sont attachées au
 * résultat (`AiExerciseImport.debug`) et affichables par l'interface.
 */

import type { AiRect } from "./types";

/** Vrai en développement, ou si l'interrupteur global a été posé. */
export function isImportDebugEnabled(): boolean {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") return true;
  if (typeof window === "undefined") return false;
  return (window as unknown as { __MB_IMPORT_DEBUG__?: boolean }).__MB_IMPORT_DEBUG__ === true;
}

/** @deprecated Évalué au chargement du module — préférer isImportDebugEnabled(). */
export const IMPORT_DEBUG_ENABLED = typeof process !== "undefined" && process.env?.NODE_ENV === "development";

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
  /** V3 — chemin réellement emprunté et sa note. */
  path?: "redressé" | "classique";
  score?: number;
  playRect?: AiRect;
  playersRejected?: number;
  linesRejected?: number;
};

/** V3 — trace complète d'une tentative de redressement. */
export type ImportDebugRectify = {
  frame: number;
  regionRect: AiRect;
  /** Toutes les étapes, y compris celles qui ont échoué. */
  steps: string[];
  linesFound?: number;
  quadsTested?: number;
  /** Meilleur quadrilatère, en pixels de l'image source. */
  quad?: Array<{ x: number; y: number }>;
  score?: number;
  coverage?: number;
  spread?: number;
  kind?: "half" | "full";
  matrix?: number[];
  outcome: "haute" | "moyenne" | "faible" | "échec";
};

export type ImportDebug = {
  enabled: boolean;
  frames: number;
  /** V3 — taille de chaque image analysée, après normalisation. */
  imageSizes: Array<{ w: number; h: number }>;
  ocrRawText: string;
  ocrConfidence: number;
  ignoredChromeLines: string[];
  zones: ImportDebugZone[];
  /** V3 — régions graphiques proposées, avant tout tri. */
  regions: Array<{ frame: number; rect: AiRect; from: string }>;
  /** V3 — tentatives de redressement, réussies ou non. */
  rectify: ImportDebugRectify[];
  graphics: ImportDebugGraphic[];
  rejections: ImportDebugRejection[];
  /** V3 — journal libre des étapes, dans l'ordre. Rien n'est masqué. */
  notes: string[];
  timingsMs: Record<string, number>;
  /** V3 — confiance globale calculée à la fin. */
  confidence?: number;
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
  /* --- V3 --- */
  addImageSize: (size: { w: number; h: number }) => void;
  addRegion: (region: { frame: number; rect: AiRect; from: string }) => void;
  addRectify: (entry: ImportDebugRectify) => void;
  note: (message: string) => void;
  setConfidence: (value: number) => void;
};

const emptyDebug = (): ImportDebug => ({
  enabled: true,
  frames: 0,
  imageSizes: [],
  ocrRawText: "",
  ocrConfidence: 0,
  ignoredChromeLines: [],
  zones: [],
  regions: [],
  rectify: [],
  graphics: [],
  rejections: [],
  notes: [],
  timingsMs: {},
});

/**
 * Crée un collecteur. Désactivé, il renvoie un objet no-op : les appels restent
 * dans le code (lisibilité) mais ne coûtent rien et n'exposent rien.
 */
export function createImportDebug(enabled = isImportDebugEnabled()): ImportDebugCollector {
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
      addImageSize: () => undefined,
      addRegion: () => undefined,
      addRectify: () => undefined,
      note: () => undefined,
      setConfidence: () => undefined,
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
      const start = typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        return await run();
      } finally {
        const end = typeof performance !== "undefined" ? performance.now() : Date.now();
        data.timingsMs[label] = Math.round(end - start);
      }
    },
    snapshot: () => data,
    addImageSize: (size) => {
      data.imageSizes.push(size);
    },
    addRegion: (region) => {
      data.regions.push(region);
    },
    addRectify: (entry) => {
      data.rectify.push(entry);
    },
    note: (message) => {
      data.notes.push(message);
    },
    setConfidence: (value) => {
      data.confidence = value;
    },
  };
}
