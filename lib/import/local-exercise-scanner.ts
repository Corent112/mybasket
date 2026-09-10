/**
 * lib/import/local-exercise-scanner.ts
 * ---------------------------------------------------------------------------
 * Numérisation d'une fiche d'exercice (photo ou vidéo), 100 % dans le
 * navigateur, sans API payante.
 *
 * Chaîne de traitement :
 *   fichier → image(s)
 *          → OCR de repérage (structure seulement)
 *          → détection des zones du document + rejet du chrome du site
 *          → OCR CIBLÉ de chaque zone utile
 *          → détection de la ou des zones Graphic
 *          → isolation du terrain, masquage de ses lignes
 *          → reconstruction des éléments en objets Plaquette natifs
 *
 * Règle absolue : on n'invente RIEN. Une zone absente du document laisse le
 * champ correspondant vide. Seules exceptions assumées et SIGNALÉES à
 * l'utilisateur : `type` et `niveau`, que le formulaire exige non nuls — un
 * avertissement dit explicitement qu'il s'agit de valeurs par défaut.
 */

import type {
  AiExerciseDiagram,
  AiExerciseImport,
  AiRect,
} from "./types";
import { createImportDebug, type ImportDebugCollector } from "./debug";
import { ocrCanvas, ocrRegion, releaseOcr, type OcrResult } from "./ocr";
import {
  cleanZoneText,
  detectLayout,
  isChromeLine,
  parseCategory,
  parseDuration,
  parseEquipment,
  parsePlayers,
  toLines,
  type DetectedZone,
  type DocumentLayout,
  type ZoneKey,
} from "./document-layout";
import {
  classifyCourt,
  detectCourtCandidates,
  detectCourtRect,
  regionSignature,
  signatureDistance,
} from "./court-geometry";
import { analyseGraphic } from "./diagram-vision";
import { courtMarkingScore, quadBounds, rectifyCourt, type Rectified } from "./court-rectify";
import type { CourtGeometry } from "./court-geometry";
import type { Point } from "./homography";
import type { GraphicAnalysis } from "./diagram-vision";

/** Une tentative d'analyse d'une région, par l'un des deux moteurs. */
type Attempt = {
  path: "redressé" | "classique";
  geometry: CourtGeometry;
  analysis: GraphicAnalysis;
  score: number;
};

/**
 * Richesse d'un résultat : ce qu'il apporte réellement à l'utilisateur, pondéré
 * par la confiance. Sert d'arbitre entre l'ancien et le nouveau moteur — on ne
 * compare pas « qui est le plus malin », on compare ce qui est utilisable.
 */
export function richness(analysis: GraphicAnalysis): number {
  const players = analysis.players.reduce((sum, player) => sum + (player.confidence ?? 0.5), 0);
  const actions = analysis.actions.reduce((sum, action) => sum + (action.confidence ?? 0.5), 0);
  const objects = analysis.objects.reduce((sum, object) => sum + (object.confidence ?? 0.5), 0);
  return players * 1 + actions * 0.6 + objects * 0.3;
}

const MAX_SIDE = 2400;
/**
 * En dessous de cette taille, les dossards font une dizaine de pixels et l'OCR
 * décroche. Une capture d'écran de 876 px de large était traitée telle quelle.
 */
const MIN_SIDE = 1500;
const MAX_UPSCALE = 2.5;
const MAX_GRAPHICS = 8;

const ALLOWED_THEMES = [
  "Fondamentaux individuel",
  "Fondamentaux pré collectif",
  "Collectif",
  "Défense",
  "Surnombre",
  "Jeu rapide",
  "Repli",
  "Rebond",
  "Physique",
  "Adresse",
];

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Présence en tant que MOT : « collectif » ne doit pas matcher dans un autre mot. */
const containsWord = (haystack: string, needle: string): boolean =>
  new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`).test(haystack);

/* -------------------------------------------------------------------------- */
/* Entrées : image et vidéo                                                   */
/* -------------------------------------------------------------------------- */

function drawToCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const longest = Math.max(width, height, 1);
  let scale = 1;
  if (longest > MAX_SIDE) scale = MAX_SIDE / longest;
  else if (longest < MIN_SIDE) scale = Math.min(MAX_UPSCALE, MIN_SIDE / longest);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  // createImageBitmap gère davantage de formats que <img> et décode hors du
  // thread principal. On garde <img> en repli pour les navigateurs anciens.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = drawToCanvas(bitmap, bitmap.width, bitmap.height);
      bitmap.close?.();
      return canvas;
    } catch {
      // on retombe sur <img>
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(
          new Error(
            "Image illisible par le navigateur. Les photos HEIC d'iPhone ne sont pas lues hors de Safari : exporte-la en JPEG ou PNG."
          )
        );
      element.src = url;
    });
    return drawToCanvas(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function frameSignature(canvas: HTMLCanvasElement): string {
  return regionSignature(canvas, { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height });
}

/**
 * Extrait des vues utiles d'une vidéo en éliminant les images quasi
 * identiques : une vidéo qui filme une seule fiche ne doit pas produire
 * vingt fois le même schéma.
 */
async function videoFrames(file: File, onStatus?: (message: string) => void): Promise<HTMLCanvasElement[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Vidéo illisible"));
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const sampleCount = duration < 4 ? 4 : duration < 20 ? 8 : 12;
    const frames: HTMLCanvasElement[] = [];
    const signatures: string[] = [];

    for (let i = 0; i < sampleCount; i += 1) {
      const ratio = (i + 0.5) / sampleCount;
      onStatus?.(`Extraction des vues utiles… ${i + 1}/${sampleCount}`);
      video.currentTime = Math.min(Math.max(0, duration * ratio), Math.max(0, duration - 0.05));
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        video.addEventListener("seeked", done, { once: true });
        window.setTimeout(done, 1400);
      });

      const frame = drawToCanvas(video, video.videoWidth || 1280, video.videoHeight || 720);
      const signature = frameSignature(frame);
      if (signatures.some((previous) => signatureDistance(previous, signature) < 10)) continue;
      signatures.push(signature);
      frames.push(frame);
      if (frames.length >= 5) break;
    }

    if (frames.length) return frames;
    return [drawToCanvas(video, video.videoWidth || 1280, video.videoHeight || 720)];
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* -------------------------------------------------------------------------- */
/* Zones Graphic                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Rectangle réel d'un graphique : la zone descend jusqu'au libellé Graphic
 * suivant de la même colonne, ou jusqu'au bas de la page (pas de plafond de
 * hauteur, contrairement aux zones de texte).
 */
function graphicRegions(layout: DocumentLayout, width: number, height: number): AiRect[] {
  const labels = layout.zones.filter((zone) => zone.key === "graphic");
  if (!labels.length) return [];

  return labels.map((label, index) => {
    const column = layout.columns[label.column] || { x0: 0, x1: width };
    const next = labels
      .slice(index + 1)
      .find((other) => other.column === label.column && other.labelRect.y0 > label.labelRect.y0);
    return {
      x0: Math.max(0, column.x0 - width * 0.01),
      y0: Math.min(height - 4, label.labelRect.y1 + height * 0.004),
      x1: Math.min(width, column.x1 + width * 0.01),
      y1: next ? Math.max(label.labelRect.y1 + 40, next.labelRect.y0 - 4) : height,
    };
  });
}

/**
 * Repli VISUEL : aucune étiquette « Graphic » n'a été lue (photo, capture
 * recadrée, fiche sans libellé). On ne dépend donc pas de l'OCR pour trouver le
 * dessin : detectCourtCandidates() propose des régions par analyse d'image.
 */
function fallbackGraphicRegions(canvas: HTMLCanvasElement, debug: ImportDebugCollector): AiRect[] {
  const candidates = detectCourtCandidates(canvas);
  for (const candidate of candidates) {
    debug.reject({
      stage: "zone Graphic",
      what: `candidat visuel (${candidate.from})`,
      why: `ratio ${candidate.ratio.toFixed(2)} · remplissage ${candidate.fill.toFixed(2)} — proposé, validé ou non par la détection d'éléments`,
    });
  }
  return candidates.map((candidate) => candidate.rect);
}

/* -------------------------------------------------------------------------- */
/* Lecture des zones                                                          */
/* -------------------------------------------------------------------------- */

type ZoneTexts = Partial<Record<ZoneKey, string>>;

async function readZones(
  canvas: HTMLCanvasElement,
  layout: DocumentLayout,
  debug: ImportDebugCollector
): Promise<ZoneTexts> {
  const texts: ZoneTexts = {};
  const wanted: ZoneKey[] = [
    "title",
    "organisation",
    "description",
    "goals",
    "variations",
    "tips",
    "equipment",
    "players",
    "agegroup",
  ];

  for (const zone of layout.zones as DetectedZone[]) {
    if (!wanted.includes(zone.key)) continue;
    if (texts[zone.key]) continue;

    let value = zone.inline;
    let confidence = 1;

    if (!value || value.length < 3) {
      const result = await ocrRegion(canvas, zone.rect);
      confidence = result.confidence;
      // On n'invente pas de texte : sous 0,45 de confiance, la relecture ciblée
      // produit surtout du bruit de forme « | T | 0) au, E | FE », pire qu'un
      // champ vide que l'utilisateur remplira en dix secondes.
      if (confidence >= 0.45) {
        value = [zone.inline, result.text].filter(Boolean).join("\n");
      } else {
        value = zone.inline;
        debug.note(
          `zone « ${zone.label} » ignorée : confiance OCR ${(confidence * 100).toFixed(0)} % (< 45 %)`
        );
      }
    }

    const cleaned = cleanZoneText(value || "", zone.label);
    texts[zone.key] = cleaned;

    debug.addZone({
      key: zone.key,
      label: zone.label,
      rect: zone.rect,
      text: cleaned,
      confidence,
    });
  }

  return texts;
}

/**
 * Un titre doit RESSEMBLER à du texte. Sans ce garde-fou, une photo sans aucun
 * texte produit un titre fait de bruit OCR (« | T | 0) au, E | FE »), ce qui
 * est pire qu'un champ vide.
 */
export function looksLikeRealText(value: string, minWords = 1): boolean {
  const text = value.trim();
  if (text.length < 4 || text.length > 120) return false;

  // Proportion de caractères « propres » (lettres, chiffres, ponctuation utile).
  const clean = text.replace(/[^\p{L}\p{N}\s'’\-/().,:]/gu, "");
  if (clean.length / text.length < 0.75) return false;

  // Au moins un mot alphabétique de 3 lettres, et assez de mots crédibles.
  const words = clean.split(/[\s/.,:()\-]+/u).filter(Boolean);
  const realWords = words.filter((word) => /^[\p{L}][\p{L}'’]{2,}$/u.test(word));
  if (!realWords.length) return false;
  if (realWords.length + words.filter((w) => /^\d{1,3}$/.test(w)).length < minWords) return false;

  // Le bruit OCR est saturé de séparateurs isolés.
  const isolated = words.filter((word) => word.length === 1).length;
  if (isolated > words.length * 0.5) return false;

  return true;
}

/**
 * Titre de repli quand le document ne porte pas de libellé « Title ».
 * On prend la ligne la PLUS GRANDE du haut de page, en excluant le chrome du
 * site, les en-têtes de section, et tout ce qui ne ressemble pas à du texte.
 */
function fallbackTitle(ocr: OcrResult, layout: DocumentLayout, height: number): string {
  const labelTexts = new Set(layout.zones.map((zone) => zone.label.toLowerCase()));
  const chrome = new Set(layout.ignoredChrome.map((line) => line.toLowerCase()));

  const candidates = ocr.lines
    .filter((line) => line.y0 < height * 0.4)
    .filter((line) => line.confidence >= 0.6)
    .map((line) => ({ line, text: line.text.trim() }))
    .filter(({ text }) => !chrome.has(text.toLowerCase()))
    .filter(({ text }) => !labelTexts.has(text.toLowerCase()))
    .filter(({ text }) => !isChromeLine(text))
    .filter(({ text }) => looksLikeRealText(text, 2))
    .sort((a, b) => b.line.y1 - b.line.y0 - (a.line.y1 - a.line.y0));

  return candidates[0]?.text || "";
}

/**
 * Empreinte du CONTENU d'un schéma (et non de ses pixels).
 *
 * L'empreinte pixel 12×12 rejetait comme « quasi identique » deux phases d'un
 * même système : elles ne diffèrent que par quelques pastilles sur un fond
 * commun. Le contenu, lui, diffère toujours.
 */
export function diagramContentSignature(diagram: AiExerciseDiagram): string {
  const q = (value: number) => Math.round(value * 40);
  const players = diagram.players
    .map((player) => `${player.team}:${q(player.x)},${q(player.y)}`)
    .sort()
    .join("|");
  const actions = diagram.actions
    .map((action) => `${action.action}:${q(action.to.x)},${q(action.to.y)}`)
    .sort()
    .join("|");
  const objects = diagram.objects
    .map((object) => `${object.kind}:${q(object.x)},${q(object.y)}`)
    .sort()
    .join("|");
  return `${diagram.courtType}#${players}#${actions}#${objects}`;
}


/* -------------------------------------------------------------------------- */
/* Analyse d'une région : les deux moteurs, et l'arbitrage entre eux           */
/* -------------------------------------------------------------------------- */

export type RegionOutcome = {
  chosen: Attempt;
  attempts: Attempt[];
  rectified: Rectified | null;
  courtRect: AiRect;
  rectifySteps: string[];
};

/**
 * RÉGRESSION CONTRÔLÉE.
 *
 * Le redressement est une NOUVELLE méthode. Elle ne remplace l'ancienne que si
 * elle fait au moins aussi bien : on mesure la richesse du résultat (éléments
 * trouvés, pondérés par leur confiance) et on garde le meilleur des deux. Une
 * homographie plausible mais fausse ne peut donc jamais dégrader un cas qui
 * fonctionnait avant.
 *
 * Exportée pour que la batterie de tests exerce EXACTEMENT le chemin de
 * production, et non une copie qui dériverait.
 */
export async function analyseRegion(
  canvas: HTMLCanvasElement,
  region: AiRect,
  keyPrefix: string,
  frameIndex: number,
  debug: ImportDebugCollector,
  preRectified?: Rectified | null
): Promise<RegionOutcome | null> {
  let rectified: Rectified | null = preRectified ?? null;
  let rectifySteps: string[] = preRectified ? preRectified.reasons : [];
  if (preRectified === undefined) {
    try {
      rectified = rectifyCourt(canvas, region, (steps) => {
        rectifySteps = steps;
      });
    } catch (error) {
      // On ne masque rien : un plantage du redressement doit se voir.
      rectified = null;
      rectifySteps = [`exception : ${error instanceof Error ? error.message : String(error)}`];
    }
  }

  debug.addRectify({
    frame: frameIndex,
    regionRect: region,
    steps: rectifySteps,
    linesFound: rectified?.linesFound,
    quadsTested: rectified?.quadsTested,
    quad: rectified?.quad,
    score: rectified?.score,
    coverage: rectified?.coverage,
    spread: rectified?.spread,
    kind: rectified?.kind,
    matrix: rectified ? [...rectified.matrix] : undefined,
    outcome: rectified ? rectified.level : "échec",
  });

  const courtRect = rectified ? region : detectCourtRect(canvas, region);
  const attempts: Attempt[] = [];

  if (rectified) {
    const geometry: CourtGeometry = {
      rect: { x0: 0, y0: 0, x1: rectified.canvas.width, y1: rectified.canvas.height },
      play: rectified.play,
      playDetected: true,
      kind: rectified.kind,
      orientation: "identity",
      confidence: rectified.score,
      reasons: rectified.reasons,
    };
    try {
      const analysis = await debug.time(`vision-redressee-${keyPrefix}`, () =>
        analyseGraphic(rectified!.canvas, geometry, keyPrefix)
      );
      attempts.push({ path: "redressé", geometry, analysis, score: richness(analysis) });
    } catch (error) {
      debug.note(`moteur redressé en échec : ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // On ne relance l'ancien moteur que lorsqu'il peut apporter quelque chose :
  // pas de redressement, confiance moyenne, ou résultat vide.
  const first = attempts[0];
  const needsClassic = !rectified || rectified.level === "moyenne" || !first || first.score <= 0;
  if (needsClassic) {
    try {
      const geometry = classifyCourt(canvas, courtRect);
      const analysis = await debug.time(`vision-classique-${keyPrefix}`, () =>
        analyseGraphic(canvas, geometry, keyPrefix)
      );
      attempts.push({ path: "classique", geometry, analysis, score: richness(analysis) });
    } catch (error) {
      debug.note(`moteur classique en échec : ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!attempts.length) {
    debug.reject({ stage: "schéma", what: "graphique", why: "aucun moteur n'a pu analyser la région" });
    return null;
  }

  // À égalité, on privilégie le redressement : ses coordonnées sont métriques,
  // donc plus fiables même à nombre d'éléments égal.
  attempts.sort((a, b) => b.score - a.score || (a.path === "redressé" ? -1 : 1));
  const chosen = attempts[0];
  if (attempts.length > 1) {
    debug.note(
      `région ${Math.round(region.x0)},${Math.round(region.y0)} — ` +
        attempts.map((item) => `${item.path} ${item.score.toFixed(2)}`).join(" vs ") +
        ` → ${chosen.path}`
    );
  }
  if (rectified && chosen.path === "classique") {
    debug.note("redressement écarté : l'ancien moteur donne un résultat plus riche");
  }

  return { chosen, attempts, rectified, courtRect, rectifySteps };
}


/* -------------------------------------------------------------------------- */
/* Accumulation des schémas                                                   */
/* -------------------------------------------------------------------------- */

/** État partagé pendant la collecte : ce qui a déjà été retenu, et pourquoi. */
export type DiagramCollector = {
  diagrams: AiExerciseDiagram[];
  /** Empreintes pixel des régions déjà analysées (vidéo figée). */
  signatures: string[];
  /** Empreintes de CONTENU des schémas déjà retenus. */
  contentSignatures: Set<string>;
  /** Régions déjà retenues : deux schémas ne peuvent pas se superposer. */
  accepted: AiRect[];
  rectifiedImage?: string;
  mediumConfidence: boolean;
};

export const createDiagramCollector = (): DiagramCollector => ({
  diagrams: [],
  signatures: [],
  contentSignatures: new Set<string>(),
  accepted: [],
  mediumConfidence: false,
});

/** Intersection sur union de deux rectangles. */
function overlapRatio(a: AiRect, b: AiRect): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const union = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Analyse une région et décide si elle mérite d'entrer dans le résultat.
 *
 * C'est ici que se joue la qualité perçue. Une région candidate qui n'est PAS
 * un terrain finit malgré tout par produire des « joueurs » : le moteur y voit
 * des ronds dans les marquages. Trois portes, dans cet ordre :
 *   1. recouvrement — deux schémas ne peuvent pas occuper la même surface ;
 *   2. qualité minimale — une poignée d'éléments peu sûrs ne fait pas un schéma ;
 *   3. contenu déjà vu — même dessin sous un autre cadrage.
 *
 * Exportée pour que la batterie de tests exerce ce chemin exact.
 */
export async function collectFromRegion(
  canvas: HTMLCanvasElement,
  region: AiRect,
  labelled: boolean,
  frameIndex: number,
  debug: ImportDebugCollector,
  state: DiagramCollector,
  preRectified?: Rectified | null
): Promise<void> {
  const already = state.accepted.find((rect) => overlapRatio(rect, region) > 0.3);
  if (already) {
    debug.reject({
      stage: "schéma",
      what: "région",
      why: "recouvre une région déjà retenue : deux schémas ne peuvent pas se superposer",
    });
    return;
  }

  const outcome = await analyseRegion(
    canvas,
    region,
    `s${state.diagrams.length + 1}`,
    frameIndex,
    debug,
    preRectified
  );
  if (!outcome) return;

  const { chosen, rectified, courtRect } = outcome;

  if (rectified && !state.rectifiedImage) {
    try {
      state.rectifiedImage = rectified.canvas.toDataURL("image/jpeg", 0.82);
    } catch {
      state.rectifiedImage = undefined;
    }
  }

  const signature = regionSignature(canvas, courtRect);
  if (state.signatures.some((previous) => signatureDistance(previous, signature) < 3)) {
    debug.reject({ stage: "schéma", what: "graphique", why: "image strictement identique à une vue déjà analysée" });
    return;
  }
  state.signatures.push(signature);

  const geometry = chosen.geometry;
  const analysis = chosen.analysis;
  const usedRectified = chosen.path === "redressé" && rectified !== null;

  const lineKinds: Record<string, number> = {};
  for (const action of analysis.actions) lineKinds[action.action] = (lineKinds[action.action] || 0) + 1;
  const countRejected = (prefix: string) =>
    analysis.rejections
      .filter((item) => item.what.includes(prefix))
      .reduce((sum, item) => sum + (item.count || 1), 0);

  debug.addGraphic({
    index: state.diagrams.length,
    frame: frameIndex,
    regionRect: region,
    courtRect,
    courtKind: geometry.kind,
    orientation: `${geometry.orientation} (${geometry.reasons.join(" · ")})`,
    players: analysis.players.length,
    objects: analysis.objects.length,
    lines: analysis.actions.length,
    lineKinds,
    rejections: analysis.rejections,
    path: chosen.path,
    score: usedRectified && rectified ? rectified.score : geometry.confidence,
    playRect: analysis.playRect,
    playersRejected: countRejected("jeton"),
    linesRejected: countRejected("trajectoire"),
  });

  const elements = analysis.players.length + analysis.actions.length;
  if (!elements) {
    debug.reject({ stage: "schéma", what: "graphique", why: "aucun joueur ni tracé exploitable après masquage du terrain" });
    return;
  }

  // Porte de QUALITÉ. Un terrain redressé avec une note haute s'est déjà prouvé
  // géométriquement ; on lui demande peu. Un résultat du moteur classique, lui,
  // n'a rien prouvé du tout : on exige des éléments nombreux ET sûrs, sinon on
  // préfère ne rien proposer plutôt que d'inventer un schéma dans une zone qui
  // n'est pas un terrain.
  // ---- PORTE N° 0 : PAS DE TERRAIN VALIDÉ, PAS D'ÉLÉMENTS ----------------
  // Règle absolue de la V3 : aucun joueur, aucun plot, aucune trajectoire ne
  // peut naître d'une zone dont on n'a pas d'abord établi que c'est un terrain.
  // Sans cette porte, une page de texte, un bandeau de site ou un cadre
  // quelconque produisait des « joueurs » à partir de n'importe quel rond.
  // Sans redressement, on exige des PREUVES : l'aire de jeu retrouvée sur au
  // moins trois de ses quatre côtés, et une classification qui tient. Une page
  // de texte aligne assez de traits pour en faire deviner deux — jamais trois.
  let markings = 1;
  if (!usedRectified) {
    try {
      markings = courtMarkingScore(canvas, geometry.play ?? geometry.rect, geometry.kind);
    } catch {
      markings = 0;
    }
  }
  const courtValidated = usedRectified
    ? true
    : geometry.playDetected === true &&
      (geometry.playSides ?? 0) >= 3 &&
      (geometry.confidence ?? 0) >= 0.5 &&
      markings >= 0.35;
  if (!courtValidated) {
    debug.reject({
      stage: "schéma",
      what: "région",
      why:
        "aucun terrain validé sur cette zone " +
        `(aire de jeu ${geometry.playDetected ? "détectée" : "non détectée"}, ` +
        `${geometry.playSides ?? 0}/4 côtés, ` +
        `marquages ${(markings * 100).toFixed(0)} %, ` +
        `confiance ${((geometry.confidence ?? 0) * 100).toFixed(0)} %) — ` +
        "aucun élément n'en est extrait",
    });
    return;
  }

  // Un terrain PROUVÉ a déjà été trouvé dans cette image. Une autre région où le
  // redressement échoue n'est donc, presque toujours, pas un second terrain :
  // c'est une portion du même, ou du décor. Le moteur classique, lui, y trouvera
  // toujours des « ronds » dans les marquages — c'est ainsi qu'un import propre
  // se retrouvait pollué par six joueurs fantômes.
  const provenCourtExists = state.diagrams.some(
    (diagram) => diagram.rectified && (diagram.rectifyScore ?? 0) >= 0.6
  );
  if (provenCourtExists && !usedRectified) {
    debug.reject({
      stage: "schéma",
      what: "graphique",
      why: "un terrain a déjà été prouvé sur cette image et cette région n'a pas pu être redressée",
    });
    return;
  }

  const minimum = usedRectified && rectified && rectified.level === "haute" ? 0.8 : 2.2;
  if (chosen.score < minimum) {
    debug.reject({
      stage: "schéma",
      what: "graphique",
      why:
        `éléments trop peu nombreux ou trop incertains (${chosen.score.toFixed(2)} < ${minimum}) ` +
        `sur une région ${usedRectified ? "redressée" : "non redressée"}`,
    });
    return;
  }

  const candidate: AiExerciseDiagram = {
    detected: true,
    courtType: geometry.kind,
    players: analysis.players,
    objects: analysis.objects,
    actions: analysis.actions,
    notes: "",
    sourceLabel: labelled ? `Graphic ${state.diagrams.length + 1}` : undefined,
    signature,
    confidence: geometry.confidence,
    rectified: usedRectified,
    rectifyScore: usedRectified && rectified ? rectified.score : undefined,
  };

  const content = diagramContentSignature(candidate);
  if (state.contentSignatures.has(content)) {
    debug.reject({ stage: "schéma", what: "graphique", why: "mêmes joueurs et mêmes tracés qu'un schéma déjà importé" });
    return;
  }

  if (usedRectified && rectified && rectified.level === "moyenne") state.mediumConfidence = true;
  state.contentSignatures.add(content);
  state.accepted.push(region);
  state.diagrams.push(candidate);
}

/* -------------------------------------------------------------------------- */
/* Orchestration                                                              */
/* -------------------------------------------------------------------------- */

export async function scanExerciseLocally(
  file: File,
  onStatus?: (message: string) => void
): Promise<AiExerciseImport> {
  const debug = createImportDebug();
  const warnings: string[] = [];

  const isVideo = file.type.startsWith("video/");
  onStatus?.(isVideo ? "Extraction des vues utiles de la vidéo…" : "Préparation de la photo…");

  const canvases = isVideo ? await videoFrames(file, onStatus) : [await fileToCanvas(file)];
  debug.setFrames(canvases.length);
  for (const frame of canvases) debug.addImageSize({ w: frame.width, h: frame.height });
  debug.note(`${canvases.length} image(s) à analyser, ${canvases.map((c) => `${c.width}×${c.height}`).join(", ")}`);

  try {
    const state = createDiagramCollector();
    const diagrams = state.diagrams;
    let bestZones: ZoneTexts = {};
    let bestScore = -1;
    let bestOcrConfidence = 0;

    for (let frameIndex = 0; frameIndex < canvases.length; frameIndex += 1) {
      const canvas = canvases[frameIndex];
      const suffix = canvases.length > 1 ? ` — vue ${frameIndex + 1}/${canvases.length}` : "";

      onStatus?.(`Analyse de la structure du document${suffix}…`);
      const scout = await debug.time(`ocr-structure-${frameIndex}`, () => ocrCanvas(canvas));
      const layout = detectLayout(scout, canvas.width, canvas.height);
      debug.addIgnoredChrome(layout.ignoredChrome);

      if (frameIndex === 0) debug.setRawOcr(scout.text, scout.confidence);

      onStatus?.(`Lecture ciblée des zones utiles${suffix}…`);
      const zones = await debug.time(`ocr-zones-${frameIndex}`, () => readZones(canvas, layout, debug));

      if (!zones.title) {
        const fallback = fallbackTitle(scout, layout, canvas.height);
        if (fallback) zones.title = fallback;
      }

      const score =
        (zones.title ? 30 : 0) +
        (zones.description?.length || 0) +
        (zones.variations?.length || 0) * 0.5 +
        (zones.tips?.length || 0) * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestZones = zones;
        bestOcrConfidence = scout.confidence;
      }

      onStatus?.(`Reconstruction des schémas dans Plaquette${suffix}…`);
      const labelled = graphicRegions(layout, canvas.width, canvas.height);
      const regions = labelled.length ? labelled : fallbackGraphicRegions(canvas, debug);

      if (!regions.length) {
        debug.reject({ stage: "schéma", what: "zone Graphic", why: "aucune zone graphique identifiée sur cette vue" });
      }

      // ---- PLUSIEURS DESSINS SUR UNE MÊME PAGE --------------------------
      // On cherche un terrain, on le retient, puis on l'EFFACE de la carte des
      // lignes et on recommence. Chaque terrain est ainsi trouvé pour lui-même,
      // au lieu d'espérer qu'un découpage en régions tombe juste. Une page à
      // deux schémas donne deux AiExerciseDiagram distincts.
      const excluded: Point[][] = [];
      const before = state.diagrams.length;
      for (let pass = 0; pass < MAX_GRAPHICS; pass += 1) {
        if (state.diagrams.length >= MAX_GRAPHICS) break;
        let steps: string[] = [];
        let found: Rectified | null = null;
        try {
          found = rectifyCourt(canvas, undefined, (reasons) => {
            steps = reasons;
          }, excluded.length ? excluded : undefined);
        } catch (error) {
          steps = [`exception : ${error instanceof Error ? error.message : String(error)}`];
          found = null;
        }
        if (!found) {
          debug.note(
            `passage ${pass + 1} : plus de terrain redressable${steps.length ? ` — ${steps[steps.length - 1]}` : ""}`
          );
          break;
        }
        excluded.push(found.quad);
        const bounds = quadBounds(found.quad);
        debug.addRegion({ frame: frameIndex, rect: bounds, from: `redressement, passage ${pass + 1}` });
        await collectFromRegion(canvas, bounds, Boolean(labelled.length), frameIndex, debug, state, found);
      }

      // Aucun terrain redressé : on garde intégralement l'ancien chemin.
      if (state.diagrams.length === before) {
        debug.note("aucun redressement exploitable → détection classique par régions");
        for (const region of regions) {
          if (state.diagrams.length >= MAX_GRAPHICS) break;
          debug.addRegion({
            frame: frameIndex,
            rect: region,
            from: labelled.length ? "libellé Graphic" : "détection visuelle",
          });
          await collectFromRegion(canvas, region, Boolean(labelled.length), frameIndex, debug, state);
        }
      }
    }

    /* ------------------------------------------------------------ champs */

    const titleRaw = (bestZones.title || "").split("\n")[0].trim();
    const title = looksLikeRealText(titleRaw, 1) ? titleRaw : "";
    const deroulement = toLines(bestZones.description || "");
    const consignes = toLines(bestZones.tips || "");
    const organisation = (bestZones.organisation || "").trim();

    // Goals / Purpose / Skills → Évolution / Variantes (choix produit validé).
    const variantesParts = [bestZones.variations || "", bestZones.goals || ""].map((part) => part.trim()).filter(Boolean);
    const variantes = toLines(variantesParts.join("\n"));

    const equipment = parseEquipment(bestZones.equipment || "");
    const readPlayers = parsePlayers(bestZones.players || "");
    const categorieRaw = parseCategory(bestZones.agegroup || "");
    const temps = parseDuration([bestZones.description, bestZones.tips, bestZones.organisation].filter(Boolean).join("\n"));

    // Le nombre de joueurs et le schéma reconstruit ne doivent pas se
    // contredire à l'écran : à défaut de valeur lue, on prend ce qui a été posé.
    const drawnPlayers = diagrams.reduce((max, diagram) => Math.max(max, diagram.players.length), 0);
    const joueurs = readPlayers ?? (drawnPlayers > 0 ? Math.min(30, drawnPlayers) : null);

    // Thèmes : correspondance par MOT, et le libellé le plus long gagne, sinon
    // « Collectif » se déclenchait à l'intérieur de « fondamentaux pré collectif ».
    const themeSource = normalize(
      [bestZones.title, bestZones.description, bestZones.variations, bestZones.tips].filter(Boolean).join(" ")
    );
    const matched: string[] = [];
    let remaining = themeSource;
    for (const theme of [...ALLOWED_THEMES].sort((a, b) => b.length - a.length)) {
      const needle = normalize(theme);
      if (!containsWord(remaining, needle)) continue;
      matched.push(theme);
      remaining = remaining.split(needle).join(" ");
    }
    const themes = matched
      .sort((a, b) => ALLOWED_THEMES.indexOf(a) - ALLOWED_THEMES.indexOf(b))
      .slice(0, 5);

    if (!title) warnings.push("Aucun titre n'a pu être lu : renseigne-le avant de créer l'exercice.");
    if (!deroulement.length) warnings.push("Aucune zone Description / Déroulement n'a été trouvée : le champ reste vide.");
    if (!diagrams.length) {
      warnings.push(
        state.rectifiedImage
          ? "Aucun élément n'a pu être reconnu, mais le terrain a été redressé : l'image est utilisable comme calque dans Plaquette."
          : "Aucun schéma exploitable n'a été reconnu : tu peux le dessiner dans Plaquette."
      );
    }
    else {
      const unsure = diagrams.reduce(
        (count, diagram) => count + diagram.players.filter((player) => player.labelConfident === false).length,
        0
      );
      const plural = diagrams.length > 1;
      warnings.push(
        `${diagrams.length} schéma${plural ? "s" : ""} reconstruit${plural ? "s" : ""} dans Plaquette : vérifie les positions avant de créer l'exercice.`
      );
      if (unsure > 0) {
        warnings.push(
          unsure > 1
            ? `${unsure} numéros de joueur n'ont pas pu être lus avec certitude : des numéros provisoires ont été posés.`
            : "1 numéro de joueur n'a pas pu être lu avec certitude : un numéro provisoire a été posé."
        );
      }
      if (readPlayers === null && drawnPlayers > 0) {
        warnings.push(`Nombre de joueurs déduit du schéma (${drawnPlayers}) : ajuste-le si besoin.`);
      }
    }
    warnings.push("Type et niveau ne sont pas lus sur le document : valeurs par défaut (Collectif / Intermédiaire).");
    if (state.mediumConfidence) {
      warnings.push(
        "Le terrain a été redressé avec une confiance moyenne : vérifie les positions de près avant de sauvegarder."
      );
    }
    const lowConfidencePlayers = diagrams.reduce(
      (count, diagram) =>
        count + diagram.players.filter((player) => (player.typeConfidence ?? 1) < 0.5 || player.type === "unknown").length,
      0
    );
    if (lowConfidencePlayers > 0) {
      warnings.push(
        `${lowConfidencePlayers} joueur${lowConfidencePlayers > 1 ? "s" : ""} attend${lowConfidencePlayers > 1 ? "ent" : ""} une confirmation attaquant / défenseur.`
      );
    }

    /* ------------------------------------------------- confiance globale */
    // Trois sources, pondérées : la géométrie (a-t-on le bon terrain ?), les
    // éléments (sont-ils sûrs ?) et le texte. Aucune détection n'est réputée
    // certaine : à défaut de mesure, on retient 0.5, jamais 1.
    const allPlayers = diagrams.flatMap((diagram) => diagram.players);
    const allActions = diagrams.flatMap((diagram) => diagram.actions);
    const mean = (values: number[]): number =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const geometryConfidence = mean(diagrams.map((diagram) => diagram.confidence ?? 0.4));
    const elementConfidence = mean([
      ...allPlayers.map((player) => (player.confidence ?? 0.5) * 0.6 + (player.typeConfidence ?? 0.5) * 0.4),
      ...allActions.map((action) => action.confidence ?? 0.5),
    ]);
    const importConfidence = diagrams.length
      ? Number((geometryConfidence * 0.45 + elementConfidence * 0.4 + bestOcrConfidence * 0.15).toFixed(3))
      : Number((bestOcrConfidence * 0.4).toFixed(3));
    debug.setConfidence(importConfidence);
    debug.note(
      `confiance globale ${(importConfidence * 100).toFixed(0)} % ` +
        `(géométrie ${(geometryConfidence * 100).toFixed(0)} %, ` +
        `éléments ${(elementConfidence * 100).toFixed(0)} %, ` +
        `texte ${(bestOcrConfidence * 100).toFixed(0)} %)`
    );

    const emptyDiagram: AiExerciseDiagram = {
      detected: false,
      courtType: "half",
      players: [],
      objects: [],
      actions: [],
      notes: "",
    };

    return {
      title,
      organisation,
      deroulement,
      consignes,
      variantes,
      plots: equipment.plots,
      ballons: equipment.ballons,
      paniers: equipment.paniers,
      joueurs,
      categorie: (categorieRaw || "— Choisir —") as AiExerciseImport["categorie"],
      type: "Collectif",
      niveau: "Intermédiaire",
      temps,
      themes,
      diagram: diagrams[0] || emptyDiagram,
      diagrams,
      source: "local",
      rectifiedImage: state.rectifiedImage,
      importConfidence,
      confidence: {
        text: bestOcrConfidence,
        diagram: diagrams.length
          ? diagrams.reduce((sum, item) => sum + (item.confidence || 0.5), 0) / diagrams.length
          : 0,
      },
      warnings,
      debug: debug.snapshot(),
    };
  } finally {
    await releaseOcr();
  }
}
