/**
 * lib/import/ocr.ts
 * ---------------------------------------------------------------------------
 * Accès OCR gratuit et 100 % navigateur (Tesseract.js).
 *
 * - Aucune API payante, aucun appel serveur.
 * - Chargement prioritaire depuis la dépendance npm `tesseract.js`
 *   (import dynamique, donc jamais embarqué dans le bundle serveur).
 * - Repli automatique sur le script CDN historique si le paquet n'est pas
 *   installé, afin de ne jamais casser l'import existant.
 *
 * Deux workers distincts sont utilisés :
 *   - `text`   : lecture des zones de texte (français puis anglais) ;
 *   - `digits` : lecture d'un jeton joueur isolé (chiffres + X, PSM 8).
 * Les paramètres restrictifs du second ne polluent donc jamais le premier.
 *
 * ---------------------------------------------------------------------------
 * NOTE DE CORRECTION (import v2) — lecture des dossards
 *
 * 1. PSM 10 signifie « un seul caractère ». Un dossard à deux chiffres était
 *    donc illisible par construction, alors que le code fait bien `slice(0, 2)`.
 *    On passe en PSM 8 (« un seul mot »).
 * 2. Aucun prétraitement n'était appliqué. Les jetons MyBasket sont OR SUR
 *    BORDEAUX : Tesseract LSTM est mauvais sur du clair-sur-foncé. On binarise
 *    désormais le disque (Otsu) en ramenant systématiquement le chiffre en NOIR
 *    sur BLANC, et on efface tout ce qui déborde du jeton (bras du symbole
 *    défenseur, tracés qui passent à côté).
 * Le canvas brut reste tenté en second recours : aucune régression possible.
 */

import type { AiRect } from "./types";

export type OcrBox = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
};

export type OcrResult = {
  text: string;
  lines: OcrBox[];
  words: OcrBox[];
  confidence: number;
};

type AnyWorker = {
  recognize: (
    image: HTMLCanvasElement | HTMLImageElement,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>
  ) => Promise<{ data: any }>;
  setParameters?: (params: Record<string, string>) => Promise<void>;
  terminate: () => Promise<void>;
};

type WorkerFactory = (
  lang?: string | string[],
  oem?: number,
  options?: Record<string, unknown>
) => Promise<AnyWorker>;

/**
 * Point d'injection facultatif pour auto-héberger Tesseract.
 *
 * Par défaut, tesseract.js va chercher son worker, son cœur WASM et les données
 * de langue sur un CDN. Sur un réseau fermé (ou pour éviter tout appel externe),
 * il suffit de définir avant l'import :
 *
 *   window.__MB_TESSERACT_OPTIONS__ = {
 *     workerPath: "/tesseract/worker.min.js",
 *     corePath:   "/tesseract/",
 *     langPath:   "/tessdata",
 *   };
 *
 * C'est également ce que le harnais de test utilise pour tourner hors ligne.
 */
/**
 * OEM 1 = LSTM uniquement (le moteur moderne de Tesseract).
 *
 * Ce n'est pas un détail de performance : tesseract.js choisit le jeu de
 * données selon l'OEM. Par défaut il télécharge les données « legacy + LSTM »
 * (fra 6 Mo + eng 11 Mo). En LSTM seul, il prend `4.0.0_best_int` :
 * fra 0,7 Mo + eng 2,9 Mo, et un cœur WASM de 2,8 Mo au lieu de 3,3 Mo.
 *
 * Premier import : ~6,5 Mo au lieu de ~21 Mo, sans perte de qualité — le
 * moteur legacy ne sert qu'aux polices anciennes que nous ne visons pas.
 * Ensuite tout est mis en cache par le navigateur (IndexedDB).
 */
const OEM_LSTM_ONLY = 1;

function tesseractOptions(): Record<string, unknown> | undefined {
  if (typeof window === "undefined") return undefined;
  const options = (window as unknown as { __MB_TESSERACT_OPTIONS__?: Record<string, unknown> })
    .__MB_TESSERACT_OPTIONS__;
  return options && typeof options === "object" ? options : undefined;
}

const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

let factoryPromise: Promise<WorkerFactory> | null = null;
let textWorker: Promise<AnyWorker> | null = null;
let digitWorker: Promise<AnyWorker> | null = null;

async function loadFromCdn(): Promise<WorkerFactory> {
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-mb-tesseract="1"]');
    if (existing) {
      if ((window as any).Tesseract) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("cdn")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = TESSERACT_CDN;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.mbTesseract = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("cdn"));
    document.head.appendChild(script);
  });
  const global = (window as any).Tesseract;
  if (!global?.createWorker) throw new Error("Le moteur OCR gratuit n'a pas pu être chargé.");
  return global.createWorker as WorkerFactory;
}

async function getFactory(): Promise<WorkerFactory> {
  if (factoryPromise) return factoryPromise;
  factoryPromise = (async () => {
    try {
      const mod: any = await import(/* webpackIgnore: false */ "tesseract.js");
      const create = mod?.createWorker || mod?.default?.createWorker;
      if (typeof create === "function") return create as WorkerFactory;
    } catch {
      // paquet absent : on bascule sur le CDN
    }
    return loadFromCdn();
  })();
  return factoryPromise;
}

async function getTextWorker(): Promise<AnyWorker> {
  if (textWorker) return textWorker;
  textWorker = (async () => {
    const createWorker = await getFactory();
    const options = tesseractOptions();
    try {
      return await createWorker(["fra", "eng"], OEM_LSTM_ONLY, options);
    } catch {
      try {
        return await createWorker("fra", OEM_LSTM_ONLY, options);
      } catch {
        return await createWorker("eng", OEM_LSTM_ONLY, options);
      }
    }
  })();
  return textWorker;
}

async function getDigitWorker(): Promise<AnyWorker> {
  if (digitWorker) return digitWorker;
  digitWorker = (async () => {
    const createWorker = await getFactory();
    const worker = await createWorker("eng", OEM_LSTM_ONLY, tesseractOptions());
    await worker.setParameters?.({
      tessedit_char_whitelist: "0123456789XxCÉ",
      // PSM 8 = un seul MOT. PSM 10 (un seul caractère) rendait tout dossard à
      // deux chiffres illisible.
      tessedit_pageseg_mode: "8",
    });
    return worker;
  })();
  return digitWorker;
}

/** Libère les workers OCR. À appeler à la fin d'un scan. */
export async function releaseOcr(): Promise<void> {
  const workers = [textWorker, digitWorker];
  textWorker = null;
  digitWorker = null;
  await Promise.all(
    workers.map(async (pending) => {
      try {
        const worker = await pending;
        await worker?.terminate();
      } catch {
        // rien à faire
      }
    })
  );
}

const box = (item: any): OcrBox => ({
  text: String(item?.text ?? "").replace(/\s+/g, " ").trim(),
  x0: Number(item?.bbox?.x0 ?? 0),
  y0: Number(item?.bbox?.y0 ?? 0),
  x1: Number(item?.bbox?.x1 ?? 0),
  y1: Number(item?.bbox?.y1 ?? 0),
  confidence: Math.max(0, Math.min(1, Number(item?.confidence ?? 0) / 100)),
});

/**
 * Tesseract.js v4 exposait data.lines / data.words, v5 et v6 ne renvoient plus
 * que data.blocks[].paragraphs[].lines[].words[]. On gère les deux formes.
 */
function extractBoxes(data: any): { lines: OcrBox[]; words: OcrBox[] } {
  const blocks: any[] = Array.isArray(data?.blocks) ? data.blocks : [];
  const nestedLines = blocks.flatMap((block) =>
    (Array.isArray(block?.paragraphs) ? block.paragraphs : []).flatMap((paragraph: any) =>
      Array.isArray(paragraph?.lines) ? paragraph.lines : []
    )
  );
  const rawLines: any[] = nestedLines.length
    ? nestedLines
    : Array.isArray(data?.lines)
    ? data.lines
    : [];
  const rawWords: any[] = rawLines.length
    ? rawLines.flatMap((line: any) => (Array.isArray(line?.words) ? line.words : []))
    : Array.isArray(data?.words)
    ? data.words
    : [];

  return {
    lines: rawLines.map(box).filter((item) => item.text.length > 0),
    words: rawWords.map(box).filter((item) => item.text.length > 0),
  };
}

/** OCR complet d'un canvas (détection de structure). */
export async function ocrCanvas(canvas: HTMLCanvasElement): Promise<OcrResult> {
  const worker = await getTextWorker();
  const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
  const data = result?.data;
  const { lines, words } = extractBoxes(data);
  const source = lines.length ? lines : words;
  const confidence = source.length
    ? source.reduce((sum, item) => sum + item.confidence, 0) / source.length
    : Math.max(0, Math.min(1, Number(data?.confidence ?? 0) / 100));
  return {
    text: String(data?.text ?? "").trim(),
    lines,
    words,
    confidence,
  };
}

function cropToCanvas(
  source: HTMLCanvasElement,
  rect: AiRect,
  targetLongSide: number
): { canvas: HTMLCanvasElement; scale: number } | null {
  const x0 = Math.max(0, Math.floor(rect.x0));
  const y0 = Math.max(0, Math.floor(rect.y0));
  const w = Math.min(source.width - x0, Math.ceil(rect.x1 - rect.x0));
  const h = Math.min(source.height - y0, Math.ceil(rect.y1 - rect.y0));
  if (w < 4 || h < 4) return null;

  const scale = Math.max(1, Math.min(6, targetLongSide / Math.max(w, h)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, x0, y0, w, h, 0, 0, canvas.width, canvas.height);
  return { canvas, scale };
}

/**
 * OCR CIBLÉ d'une zone : on ne relit que le rectangle demandé, agrandi pour
 * que Tesseract travaille sur des glyphes de taille confortable.
 * Les boîtes renvoyées sont ramenées dans le repère pixel du canvas source.
 */
export async function ocrRegion(
  source: HTMLCanvasElement,
  rect: AiRect,
  targetLongSide = 1900
): Promise<OcrResult> {
  const cropped = cropToCanvas(source, rect, targetLongSide);
  if (!cropped) return { text: "", lines: [], words: [], confidence: 0 };

  const raw = await ocrCanvas(cropped.canvas);
  const back = (item: OcrBox): OcrBox => ({
    ...item,
    x0: rect.x0 + item.x0 / cropped.scale,
    y0: rect.y0 + item.y0 / cropped.scale,
    x1: rect.x0 + item.x1 / cropped.scale,
    y1: rect.y0 + item.y1 / cropped.scale,
  });

  return {
    text: raw.text,
    lines: raw.lines.map(back),
    words: raw.words.map(back),
    confidence: raw.confidence,
  };
}

/* -------------------------------------------------------------------------- */
/* Prétraitement d'un jeton                                                   */
/* -------------------------------------------------------------------------- */

/** Seuil d'Otsu sur un histogramme de luminances 0..255. */
function otsuThreshold(values: number[]): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of values) histogram[Math.max(0, Math.min(255, Math.round(value)))] += 1;

  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i];

  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 128;
  for (let i = 0; i < 256; i += 1) {
    weightB += histogram[i];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += i * histogram[i];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) * (meanB - meanF);
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

/**
 * Ramène un jeton à du NOIR SUR BLANC, quelle que soit sa polarité d'origine :
 *   - on ne garde que le disque central (le reste devient blanc) ;
 *   - on binarise par Otsu ;
 *   - la classe MINORITAIRE devient noire — c'est le chiffre, qu'il soit or sur
 *     bordeaux ou noir sur papier.
 */
function binarizeToken(source: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;

  const w = source.width;
  const h = source.height;
  if (w < 8 || h < 8) return source;

  const image = ctx.getImageData(0, 0, w, h).data;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.42;
  const radius2 = radius * radius;

  const inside = new Uint8Array(w * h);
  const luminance = new Float32Array(w * h);
  const sample: number[] = [];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const l = 0.299 * image[i * 4] + 0.587 * image[i * 4 + 1] + 0.114 * image[i * 4 + 2];
      luminance[i] = l;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius2) {
        inside[i] = 1;
        sample.push(l);
      }
    }
  }
  if (sample.length < 32) return source;

  const threshold = otsuThreshold(sample);
  let dark = 0;
  for (const value of sample) if (value <= threshold) dark += 1;
  // La classe minoritaire porte le chiffre.
  const inkIsDark = dark <= sample.length / 2;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) return source;

  const target = octx.createImageData(w, h);
  for (let i = 0; i < w * h; i += 1) {
    let value = 255;
    if (inside[i]) value = (luminance[i] <= threshold) === inkIsDark ? 0 : 255;
    target.data[i * 4] = value;
    target.data[i * 4 + 1] = value;
    target.data[i * 4 + 2] = value;
    target.data[i * 4 + 3] = 255;
  }
  octx.putImageData(target, 0, 0);
  return out;
}

async function recognizeToken(canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number } | null> {
  const worker = await getDigitWorker();
  const result = await worker.recognize(canvas, {}, { text: true });
  const text = String(result?.data?.text ?? "")
    .replace(/[^0-9Xx]/g, "")
    .slice(0, 2);
  const confidence = Math.max(0, Math.min(1, Number(result?.data?.confidence ?? 0) / 100));
  return text ? { text, confidence } : null;
}

/**
 * Lecture d'un jeton joueur isolé : chiffres et X uniquement.
 * Renvoie null si rien de lisible.
 */
export async function ocrToken(
  source: HTMLCanvasElement,
  rect: AiRect
): Promise<{ text: string; confidence: number } | null> {
  const pad = Math.max(3, Math.round(Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0) * 0.28));
  const padded: AiRect = {
    x0: rect.x0 - pad,
    y0: rect.y0 - pad,
    x1: rect.x1 + pad,
    y1: rect.y1 + pad,
  };
  const cropped = cropToCanvas(source, padded, 260);
  if (!cropped) return null;

  try {
    const binarized = await recognizeToken(binarizeToken(cropped.canvas));
    if (binarized) return binarized;
    // Filet de sécurité : l'image brute, comme avant.
    return await recognizeToken(cropped.canvas);
  } catch {
    return null;
  }
}
