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

/** Repli : aucune étiquette Graphic (photo d'une feuille, capture partielle). */
function fallbackGraphicRegions(canvas: HTMLCanvasElement, layout: DocumentLayout): AiRect[] {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  const step = Math.max(3, Math.round(Math.min(W, H) / 260));
  const gw = Math.ceil(W / step);
  const gh = Math.ceil(H / step);
  const data = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(gw * gh);
  const seen = new Uint8Array(gw * gh);

  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const x = Math.min(W - 1, gx * step);
      const y = Math.min(H - 1, gy * step);
      const i = (y * W + x) * 4;
      const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (luminance < 236) mask[gy * gw + gx] = 1;
    }
  }

  const boxes: AiRect[] = [];
  for (let sy = 0; sy < gh; sy += 1) {
    for (let sx = 0; sx < gw; sx += 1) {
      const index = sy * gw + sx;
      if (!mask[index] || seen[index]) continue;
      seen[index] = 1;
      const stack: Array<[number, number]> = [[sx, sy]];
      let minX = sx;
      let maxX = sx;
      let minY = sy;
      let maxY = sy;
      let count = 0;
      while (stack.length) {
        const [x, y] = stack.pop()!;
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (mask[ni] && !seen[ni]) {
            seen[ni] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      const w = (maxX - minX + 1) * step;
      const h = (maxY - minY + 1) * step;
      if (count < 60 || w < W * 0.16 || h < H * 0.16) continue;
      const ratio = Math.max(w, h) / Math.max(1, Math.min(w, h));
      if (ratio > 2.8) continue;
      boxes.push({ x0: minX * step, y0: minY * step, x1: Math.min(W, (maxX + 1) * step), y1: Math.min(H, (maxY + 1) * step) });
    }
  }

  const bounds = layout.textBounds;
  const overlapsText = (rect: AiRect) => {
    if (!bounds) return false;
    const overlapX = Math.max(0, Math.min(rect.x1, bounds.x1) - Math.max(rect.x0, bounds.x0));
    const overlapY = Math.max(0, Math.min(rect.y1, bounds.y1) - Math.max(rect.y0, bounds.y0));
    const area = Math.max(1, (rect.x1 - rect.x0) * (rect.y1 - rect.y0));
    return (overlapX * overlapY) / area > 0.72;
  };

  return boxes
    .filter((rect) => !overlapsText(rect))
    .sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))
    .slice(0, 3);
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
 * Titre de repli quand le document ne porte pas de libellé « Title ».
 * On prend la ligne la PLUS GRANDE du haut de page, en excluant le chrome du
 * site et toute ligne qui est elle-même un en-tête de section.
 */
function fallbackTitle(ocr: OcrResult, layout: DocumentLayout, height: number): string {
  const labelTexts = new Set(layout.zones.map((zone) => zone.label.toLowerCase()));
  const chrome = new Set(layout.ignoredChrome.map((line) => line.toLowerCase()));

  const candidates = ocr.lines
    .filter((line) => line.y0 < height * 0.4)
    .map((line) => ({ line, text: line.text.trim() }))
    .filter(({ text }) => text.length >= 4 && text.length <= 90)
    .filter(({ text }) => /[a-zA-ZÀ-ÿ]/.test(text))
    .filter(({ text }) => !chrome.has(text.toLowerCase()))
    .filter(({ text }) => !labelTexts.has(text.toLowerCase()))
    .filter(({ text }) => !isChromeLine(text))
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
      const regions = labelled.length ? labelled : fallbackGraphicRegions(canvas, layout);

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

    const title = (bestZones.title || "").split("\n")[0].trim();
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
