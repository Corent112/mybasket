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
 * champ correspondant vide.
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

const MAX_SIDE = 2400;
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

/* -------------------------------------------------------------------------- */
/* Entrées : image et vidéo                                                   */
/* -------------------------------------------------------------------------- */

function drawToCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image illisible"));
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
      value = [zone.inline, result.text].filter(Boolean).join("\n");
      confidence = result.confidence;
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

  try {
    const diagrams: AiExerciseDiagram[] = [];
    const signatures: string[] = [];

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

      for (const region of regions) {
        if (diagrams.length >= MAX_GRAPHICS) break;

        const courtRect = detectCourtRect(canvas, region);
        const signature = regionSignature(canvas, courtRect);
        if (signatures.some((previous) => signatureDistance(previous, signature) < 8)) {
          debug.reject({ stage: "schéma", what: "graphique", why: "quasi identique à un schéma déjà importé" });
          continue;
        }

        const geometry = classifyCourt(canvas, courtRect);
        const analysis = await debug.time(`vision-${diagrams.length}`, () =>
          analyseGraphic(canvas, geometry, `s${diagrams.length + 1}`)
        );

        const detected = analysis.players.length > 0 || analysis.actions.length > 0;
        const lineKinds: Record<string, number> = {};
        for (const action of analysis.actions) lineKinds[action.action] = (lineKinds[action.action] || 0) + 1;

        debug.addGraphic({
          index: diagrams.length,
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
        });

        if (!detected) {
          debug.reject({ stage: "schéma", what: "graphique", why: "aucun joueur ni tracé exploitable après masquage du terrain" });
          continue;
        }

        signatures.push(signature);
        diagrams.push({
          detected: true,
          courtType: geometry.kind,
          players: analysis.players,
          objects: analysis.objects,
          actions: analysis.actions,
          notes: "",
          sourceLabel: labelled.length ? `Graphic ${diagrams.length + 1}` : undefined,
          signature,
          confidence: geometry.confidence,
        });
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
    const joueurs = parsePlayers(bestZones.players || "");
    const categorieRaw = parseCategory(bestZones.agegroup || "");
    const temps = parseDuration([bestZones.description, bestZones.tips, bestZones.organisation].filter(Boolean).join("\n"));

    const themeSource = normalize(
      [bestZones.title, bestZones.description, bestZones.variations, bestZones.tips].filter(Boolean).join(" ")
    );
    const themes = ALLOWED_THEMES.filter((theme) => themeSource.includes(normalize(theme))).slice(0, 5);

    if (!title) warnings.push("Aucun titre n'a pu être lu : renseigne-le avant de créer l'exercice.");
    if (!deroulement.length) warnings.push("Aucune zone Description / Déroulement n'a été trouvée : le champ reste vide.");
    if (!diagrams.length) warnings.push("Aucun schéma exploitable n'a été reconnu : tu peux le dessiner dans Plaquette.");
    else {
      const unsure = diagrams.reduce(
        (count, diagram) => count + diagram.players.filter((player) => player.labelConfident === false).length,
        0
      );
      warnings.push(
        `${diagrams.length} schéma${diagrams.length > 1 ? "s" : ""} reconstruit${diagrams.length > 1 ? "s" : ""} dans Plaquette : vérifie les positions avant de créer l'exercice.`
      );
      if (unsure > 0) {
        warnings.push(`${unsure} numéro${unsure > 1 ? "x" : ""} de joueur n'a pas pu être lu avec certitude : un numéro provisoire a été posé.`);
      }
    }

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
