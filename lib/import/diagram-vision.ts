/**
 * lib/import/diagram-vision.ts
 * ---------------------------------------------------------------------------
 * Analyse du DESSIN posé sur le terrain, une fois le fond géométrique éliminé.
 *
 * Ce module ne connaît que le vocabulaire réellement disponible dans la
 * Plaquette :
 *   - joueurs   : team 'att' | 'def', shape 'circle' | 'square', coach
 *   - objets    : ball, cone, triangle, square, circle, text, handoff
 *   - actions   : pass, dribble, cut, screen, shoot, giveball, freedraw
 *
 * Doctrine : PRÉCISION avant exhaustivité. Mieux vaut 5 joueurs et 3 flèches
 * justes que 80 composantes parasites. Tout élément écarté est journalisé avec
 * sa raison (visible dans le panneau de debug en développement).
 */

import type {
  AiDiagramAction,
  AiDiagramActionKind,
  AiDiagramObject,
  AiDiagramPlayer,
  AiPoint,
  AiRect,
} from "./types";
import type { ImportDebugRejection } from "./debug";
import { ocrRegion, ocrToken } from "./ocr";
import {
  applyOrientation,
  buildCourtLineMask,
  courtToCanonical,
  dominantColors,
  orientedSize,
  pixelAt,
  readPixels,
  saturationOf,
  type CourtGeometry,
  type CourtOrientation,
  type Pixels,
} from "./court-geometry";

const MAX_PLAYERS = 12;
const MAX_LINES = 14;
const MAX_OBJECTS = 12;
const WORK_LONG_SIDE = 900;

export type GraphicAnalysis = {
  players: AiDiagramPlayer[];
  objects: AiDiagramObject[];
  actions: AiDiagramAction[];
  rejections: ImportDebugRejection[];
  workCanvas: HTMLCanvasElement;
};

/* -------------------------------------------------------------------------- */
/* Préparation de l'image de travail                                          */
/* -------------------------------------------------------------------------- */

/**
 * Découpe le terrain et le remet dans l'orientation de la Plaquette
 * (panier en haut pour un demi-terrain, terrain vertical pour un complet).
 */
export function buildWorkCanvas(
  source: HTMLCanvasElement,
  rect: AiRect,
  orientation: CourtOrientation
): HTMLCanvasElement {
  const w = Math.max(1, Math.round(rect.x1 - rect.x0));
  const h = Math.max(1, Math.round(rect.y1 - rect.y0));
  const oriented = orientedSize(w, h, orientation);
  const scale = Math.min(3, Math.max(0.5, WORK_LONG_SIDE / Math.max(oriented.w, oriented.h)));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(oriented.w * scale));
  canvas.height = Math.max(1, Math.round(oriented.h * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  switch (orientation) {
    case "rot180":
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
      break;
    case "rot90cw":
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case "rot90ccw":
      ctx.translate(0, canvas.height);
      ctx.rotate(-Math.PI / 2);
      break;
    default:
      break;
  }
  const drawW = orientation === "rot90cw" || orientation === "rot90ccw" ? canvas.height : canvas.width;
  const drawH = orientation === "rot90cw" || orientation === "rot90ccw" ? canvas.width : canvas.height;
  ctx.drawImage(source, rect.x0, rect.y0, w, h, 0, 0, drawW, drawH);
  ctx.restore();
  return canvas;
}

/* -------------------------------------------------------------------------- */
/* Composantes d'encre                                                        */
/* -------------------------------------------------------------------------- */

type Component = {
  points: Array<{ x: number; y: number }>;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  bw: number;
  bh: number;
  fillRatio: number;
  color: { r: number; g: number; b: number };
};

type InkContext = {
  px: Pixels;
  mask: Uint8Array;
  fills: Array<{ r: number; g: number; b: number }>;
  step: number;
};

function makeInkContext(canvas: HTMLCanvasElement, kind: "half" | "full"): InkContext {
  const px = readPixels(canvas);
  const mask = buildCourtLineMask(px.w, px.h, kind);
  const palette = dominantColors(px, 4).filter((color) => color.share > 0.05);
  const step = Math.max(1, Math.round(Math.min(px.w, px.h) / 450));
  return {
    px,
    mask,
    fills: palette.map((color) => ({ r: color.r, g: color.g, b: color.b })),
    step,
  };
}

/** Teinte 0..360 d'un pixel, -1 si trop peu saturé pour être fiable. */
function hueAt(ctx: InkContext, x: number, y: number): number {
  const [r, g, b] = pixelAt(ctx.px, x, y);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === 0 || (mx - mn) / mx < 0.25 || mx < 60) return -1;
  const d = mx - mn;
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return (h + 360) % 360;
}

/**
 * Deux pixels d'encre appartiennent au même élément seulement si leur teinte
 * est compatible. Sans cela, un arc ROUGE tracé contre un jeton NOIR fusionne
 * avec lui : le blob devient trop gros pour être un joueur et finit classé en
 * trajectoire. C'est exactement ce qui faisait chuter le nombre de joueurs
 * détectés sur une fiche où chaque joueur est doublé d'un arc de couleur.
 */
function sameElement(ctx: InkContext, ax: number, ay: number, bx: number, by: number): boolean {
  const ha = hueAt(ctx, ax, ay);
  const hb = hueAt(ctx, bx, by);
  if (ha < 0 && hb < 0) return true; // deux neutres (noir / gris)
  if (ha < 0 || hb < 0) return false; // neutre vs coloré : éléments distincts
  const delta = Math.abs(ha - hb);
  return Math.min(delta, 360 - delta) < 45;
}

function isInk(ctx: InkContext, x: number, y: number): boolean {
  const xx = Math.round(x);
  const yy = Math.round(y);
  if (xx < 0 || yy < 0 || xx >= ctx.px.w || yy >= ctx.px.h) return false;
  if (ctx.mask[yy * ctx.px.w + xx]) return false; // ligne officielle du terrain
  const [r, g, b] = pixelAt(ctx.px, xx, yy);
  if ((r + g + b) / 3 > 234) return false; // fond blanc
  for (const fill of ctx.fills) {
    if (Math.abs(r - fill.r) < 44 && Math.abs(g - fill.g) < 44 && Math.abs(b - fill.b) < 44) return false;
  }
  return true;
}

function extractComponents(ctx: InkContext, limit = 900): Component[] {
  const { px, step } = ctx;
  const gw = Math.ceil(px.w / step);
  const gh = Math.ceil(px.h / step);
  const seen = new Uint8Array(gw * gh);
  const components: Component[] = [];

  for (let sy = 0; sy < gh && components.length < limit; sy += 1) {
    for (let sx = 0; sx < gw && components.length < limit; sx += 1) {
      const index = sy * gw + sx;
      if (seen[index]) continue;
      if (!isInk(ctx, sx * step, sy * step)) {
        seen[index] = 1;
        continue;
      }
      seen[index] = 1;

      const stack: Array<[number, number]> = [[sx, sy]];
      const points: Array<{ x: number; y: number }> = [];
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      while (stack.length && points.length < 20000) {
        const [gx, gy] = stack.pop()!;
        const x = gx * step;
        const y = gy * step;
        points.push({ x, y });
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const [r, g, b] = pixelAt(px, x, y);
        sumR += r;
        sumG += g;
        sumB += b;

        for (const [nx, ny] of [
          [gx + 1, gy],
          [gx - 1, gy],
          [gx, gy + 1],
          [gx, gy - 1],
          [gx + 1, gy + 1],
          [gx - 1, gy - 1],
          [gx + 1, gy - 1],
          [gx - 1, gy + 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const ni = ny * gw + nx;
          if (seen[ni]) continue;
          if (!isInk(ctx, nx * step, ny * step)) { seen[ni] = 1; continue; }
          if (!sameElement(ctx, x, y, nx * step, ny * step)) continue;
          seen[ni] = 1;
          stack.push([nx, ny]);
        }
      }

      if (points.length < 3) continue;
      const bw = maxX - minX + step;
      const bh = maxY - minY + step;
      components.push({
        points,
        x0: minX,
        y0: minY,
        x1: maxX + step,
        y1: maxY + step,
        cx: (minX + maxX + step) / 2,
        cy: (minY + maxY + step) / 2,
        bw,
        bh,
        fillRatio: Math.min(1, (points.length * step * step) / Math.max(1, bw * bh)),
        color: {
          r: sumR / points.length,
          g: sumG / points.length,
          b: sumB / points.length,
        },
      });
    }
  }

  return components;
}

/* -------------------------------------------------------------------------- */
/* Polylignes                                                                 */
/* -------------------------------------------------------------------------- */

type Polyline = { points: AiPoint[]; density: number[]; length: number };

/** Ordonne un nuage de points le long de son axe principal (ACP). */
function componentPolyline(component: Component, buckets = 22): Polyline | null {
  const points = component.points;
  if (points.length < 4) return null;

  let mx = 0;
  let my = 0;
  for (const p of points) {
    mx += p.x;
    my += p.y;
  }
  mx /= points.length;
  my /= points.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ax = Math.cos(theta);
  const ay = Math.sin(theta);

  const projected = points.map((p) => ({
    t: (p.x - mx) * ax + (p.y - my) * ay,
    s: -(p.x - mx) * ay + (p.y - my) * ax,
  }));
  const tMin = Math.min(...projected.map((p) => p.t));
  const tMax = Math.max(...projected.map((p) => p.t));
  const span = tMax - tMin;
  if (span < 1) return null;

  const slots: number[][] = Array.from({ length: buckets }, () => []);
  for (const p of projected) {
    const index = Math.min(buckets - 1, Math.max(0, Math.floor(((p.t - tMin) / span) * buckets)));
    slots[index].push(p.s);
  }

  const out: AiPoint[] = [];
  const density: number[] = [];
  for (let i = 0; i < buckets; i += 1) {
    const values = slots[i];
    if (!values.length) continue;
    values.sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    const t = tMin + ((i + 0.5) / buckets) * span;
    out.push({ x: mx + t * ax - median * ay, y: my + t * ay + median * ax });
    density.push(values.length);
  }
  if (out.length < 2) return null;

  let length = 0;
  for (let i = 1; i < out.length; i += 1) {
    length += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
  }

  return { points: out, density, length };
}

/* -------------------------------------------------------------------------- */
/* Analyse principale                                                         */
/* -------------------------------------------------------------------------- */

const isOrange = (r: number, g: number, b: number) =>
  r > 120 && r > b * 1.5 && g > b && g < r * 0.92 && saturationOf(r, g, b) > 0.35;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export async function analyseGraphic(
  source: HTMLCanvasElement,
  geometry: CourtGeometry,
  keyPrefix: string
): Promise<GraphicAnalysis> {
  const rejections: ImportDebugRejection[] = [];
  const reject = (what: string, why: string) => {
    const existing = rejections.find((item) => item.what === what && item.why === why);
    if (existing) existing.count = (existing.count || 1) + 1;
    else rejections.push({ stage: "schéma", what, why, count: 1 });
  };

  const work = buildWorkCanvas(source, geometry.rect, geometry.orientation);
  const ink = makeInkContext(work, geometry.kind);
  const unit = work.width; // largeur du terrain en pixels de travail
  const components = extractComponents(ink);

  const players: AiDiagramPlayer[] = [];
  const objects: AiDiagramObject[] = [];
  const actions: AiDiagramAction[] = [];

  const norm = (x: number, y: number): AiPoint =>
    courtToCanonical({ x: x / work.width, y: y / work.height }, geometry.kind);

  /* ---------------------------------------------------------------- jetons */

  const tokenCandidates: Component[] = [];
  const strokeCandidates: Component[] = [];
  const orangeCandidates: Component[] = [];

  for (const component of components) {
    const maxSide = Math.max(component.bw, component.bh);
    const minSide = Math.min(component.bw, component.bh);
    const ratio = maxSide / Math.max(1, minSide);

    if (maxSide < unit * 0.016) {
      reject("composante minuscule", "taille inférieure à 1,6 % de la largeur du terrain (bruit)");
      continue;
    }
    if (component.bw > unit * 0.82 && component.bh > work.height * 0.7) {
      reject("composante géante", "occupe presque tout le terrain (fond non masqué)");
      continue;
    }

    if (isOrange(component.color.r, component.color.g, component.color.b) && maxSide < unit * 0.09) {
      orangeCandidates.push(component);
      continue;
    }

    const tokenSized = maxSide > unit * 0.03 && maxSide < unit * 0.12;
    if (tokenSized && ratio < 1.75) {
      tokenCandidates.push(component);
      continue;
    }

    if (maxSide > unit * 0.075) {
      strokeCandidates.push(component);
      continue;
    }

    reject("composante indéterminée", "ni jeton joueur ni trajectoire exploitable");
  }

  tokenCandidates.sort((a, b) => b.points.length - a.points.length);

  /** Position PIXEL des joueurs retenus, alignée sur `players` par sa clé. */
  const playerPixel: Array<{ key: string; x: number; y: number }> = [];

  let attackIndex = 0;
  let defenseIndex = 0;

  for (const candidate of tokenCandidates) {
    if (players.length >= MAX_PLAYERS) {
      reject("jeton joueur", `limite de ${MAX_PLAYERS} joueurs atteinte`);
      continue;
    }
    const candidatePoint = norm(candidate.cx, candidate.cy);
    if (players.some((p) => dist({ x: p.x, y: p.y }, candidatePoint) < 0.012)) {
      reject("jeton joueur", "doublon à la même position");
      continue;
    }

    const read = await ocrToken(work, {
      x0: candidate.x0,
      y0: candidate.y0,
      x1: candidate.x1,
      y1: candidate.y1,
    });

    const raw = read?.text ?? "";
    const isDefense = /x/i.test(raw);
    const digits = raw.replace(/\D/g, "").slice(0, 2);

    let label: string;
    let labelConfident = false;
    if (isDefense) {
      defenseIndex += 1;
      label = `X${digits || defenseIndex}`;
      labelConfident = Boolean(digits) && (read?.confidence ?? 0) > 0.5;
    } else if (digits) {
      label = digits;
      labelConfident = (read?.confidence ?? 0) > 0.5;
      attackIndex += 1;
    } else {
      attackIndex += 1;
      label = String(attackIndex);
      reject("numéro de joueur", "chiffre illisible → numéro provisoire à corriger");
    }

    // Forme : un carré remplit ses coins, pas un rond.
    const corners = [
      { x: candidate.x0 + candidate.bw * 0.12, y: candidate.y0 + candidate.bh * 0.12 },
      { x: candidate.x1 - candidate.bw * 0.12, y: candidate.y0 + candidate.bh * 0.12 },
      { x: candidate.x0 + candidate.bw * 0.12, y: candidate.y1 - candidate.bh * 0.12 },
      { x: candidate.x1 - candidate.bw * 0.12, y: candidate.y1 - candidate.bh * 0.12 },
    ];
    const filledCorners = corners.filter((corner) => isInk(ink, corner.x, corner.y)).length;

    const nearOrange = orangeCandidates.some(
      (orange) => Math.hypot(orange.cx - candidate.cx, orange.cy - candidate.cy) < Math.max(candidate.bw, candidate.bh) * 1.3
    );

    const key = `${keyPrefix}p${players.length + 1}`;
    players.push({
      key,
      label,
      team: isDefense ? "def" : "att",
      x: candidatePoint.x,
      y: candidatePoint.y,
      shape: filledCorners >= 3 ? "square" : "circle",
      hasBall: nearOrange,
      labelConfident,
    });
    playerPixel.push({ key, x: candidate.cx, y: candidate.cy });
  }

  /* --------------------------------------------------------------- objets */

  for (const candidate of orangeCandidates) {
    if (objects.length >= MAX_OBJECTS) break;
    const point = norm(candidate.cx, candidate.cy);
    const attached = players.some((player) => dist({ x: player.x, y: player.y }, point) < 0.03 && player.hasBall);
    if (attached) continue; // le ballon est déjà porté par le joueur

    const ratio = candidate.bh / Math.max(1, candidate.bw);
    // Un cône est un triangle plus haut que large, un ballon est rond.
    objects.push({
      kind: ratio > 1.15 && candidate.fillRatio < 0.7 ? "cone" : "ball",
      x: point.x,
      y: point.y,
    });
  }

  /* ------------------------------------------------------------- textes */

  try {
    const textOcr = await ocrRegion(work, { x0: 0, y0: 0, x1: work.width, y1: work.height }, 1200);
    for (const word of textOcr.words) {
      if (objects.length >= MAX_OBJECTS) break;
      const clean = word.text.trim();
      if (clean.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 3) continue;
      if (word.confidence < 0.6) continue;
      const point = norm((word.x0 + word.x1) / 2, (word.y0 + word.y1) / 2);
      if (players.some((player) => dist({ x: player.x, y: player.y }, point) < 0.03)) continue;
      objects.push({ kind: "text", x: point.x, y: point.y, text: clean });
    }
  } catch {
    reject("texte du schéma", "OCR de la zone graphique indisponible");
  }

  /* -------------------------------------------------------- trajectoires */

  const tokenBoxes = tokenCandidates.map((candidate) => ({
    x0: candidate.x0 - candidate.bw * 0.2,
    y0: candidate.y0 - candidate.bh * 0.2,
    x1: candidate.x1 + candidate.bw * 0.2,
    y1: candidate.y1 + candidate.bh * 0.2,
  }));

  const insideToken = (p: { x: number; y: number }) =>
    tokenBoxes.some((boxRect) => p.x >= boxRect.x0 && p.x <= boxRect.x1 && p.y >= boxRect.y0 && p.y <= boxRect.y1);

  const hoop: AiPoint = {
    x: work.width * 0.5,
    y: work.height * (geometry.kind === "full" ? 1.575 / 28 : 1.575 / 14),
  };

  const nearestPlayer = (point: { x: number; y: number }, maxDistance: number) => {
    let best: { key: string; d: number } | null = null;
    for (const item of playerPixel) {
      const d = Math.hypot(item.x - point.x, item.y - point.y);
      if (d <= maxDistance && (!best || d < best.d)) best = { key: item.key, d };
    }
    return best?.key;
  };

  // Regroupement des tirets alignés → une passe.
  const dashParts = strokeCandidates.filter(
    (component) => Math.max(component.bw, component.bh) < unit * 0.14 && component.fillRatio < 0.75
  );
  const usedDash = new Set<Component>();
  const dashChains: Component[][] = [];

  for (const seed of dashParts) {
    if (usedDash.has(seed)) continue;
    const chain = [seed];
    usedDash.add(seed);
    let current = seed;
    for (let guard = 0; guard < 12; guard += 1) {
      let best: Component | null = null;
      let bestDistance = unit * 0.13;
      for (const other of dashParts) {
        if (usedDash.has(other)) continue;
        const d = Math.hypot(other.cx - current.cx, other.cy - current.cy);
        if (d < bestDistance) {
          bestDistance = d;
          best = other;
        }
      }
      if (!best) break;
      usedDash.add(best);
      chain.push(best);
      current = best;
    }
    if (chain.length >= 3) dashChains.push(chain);
    else chain.forEach((item) => usedDash.delete(item));
  }

  const classify = (poly: Polyline, component: Component): AiDiagramActionKind => {
    const first = poly.points[0];
    const last = poly.points[poly.points.length - 1];
    const chord = Math.hypot(last.x - first.x, last.y - first.y);

    // Dribble : trait ondulé (offsets alternés autour de la corde).
    const offsets = poly.points.map((p) => {
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const len = Math.hypot(dx, dy) || 1;
      return ((p.x - first.x) * -dy + (p.y - first.y) * dx) / len;
    });
    let changes = 0;
    let amplitude = 0;
    for (let i = 1; i < offsets.length; i += 1) {
      amplitude = Math.max(amplitude, Math.abs(offsets[i]));
      if (offsets[i] === 0 || offsets[i - 1] === 0) continue;
      if (Math.sign(offsets[i]) !== Math.sign(offsets[i - 1])) changes += 1;
    }
    if (changes >= 3 && amplitude > unit * 0.012) return "dribble";

    // Tir : la trajectoire se termine sur le cercle du panier.
    if (Math.hypot(last.x - hoop.x, last.y - hoop.y) < unit * 0.11) return "shoot";

    // Écran : la fin forme un T perpendiculaire au reste du tracé.
    if (poly.points.length >= 5) {
      const tail = poly.points.slice(-3);
      const tailAngle = Math.atan2(tail[2].y - tail[0].y, tail[2].x - tail[0].x);
      const mainAngle = Math.atan2(last.y - first.y, last.x - first.x);
      let delta = Math.abs(tailAngle - mainAngle);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      const tailLength = Math.hypot(tail[2].x - tail[0].x, tail[2].y - tail[0].y);
      if (delta > 1.05 && tailLength < chord * 0.35) return "screen";
    }

    void component;
    return "cut";
  };

  const pushAction = (kind: AiDiagramActionKind, poly: Polyline, freeform: boolean) => {
    if (actions.length >= MAX_LINES) {
      reject("trajectoire", `limite de ${MAX_LINES} tracés par schéma atteinte`);
      return;
    }
    let ordered = poly.points;
    // L'extrémité la plus « épaisse » porte la pointe de flèche : c'est l'arrivée.
    const head = poly.density[0] || 1;
    const tail = poly.density[poly.density.length - 1] || 1;
    if (head > tail * 1.5) ordered = [...ordered].reverse();

    const start = ordered[0];
    const end = ordered[ordered.length - 1];
    const fromPlayer = nearestPlayer(start, unit * 0.13);
    const toPlayer = kind === "pass" ? nearestPlayer(end, unit * 0.11) : undefined;

    actions.push({
      action: kind,
      fromPlayer,
      toPlayer,
      from: norm(start.x, start.y),
      to: norm(end.x, end.y),
      order: actions.length + 1,
      points: freeform ? ordered.map((p) => norm(p.x, p.y)) : undefined,
    });
  };

  for (const chain of dashChains) {
    const merged: Component = {
      points: chain.flatMap((item) => item.points),
      x0: Math.min(...chain.map((item) => item.x0)),
      y0: Math.min(...chain.map((item) => item.y0)),
      x1: Math.max(...chain.map((item) => item.x1)),
      y1: Math.max(...chain.map((item) => item.y1)),
      cx: chain.reduce((sum, item) => sum + item.cx, 0) / chain.length,
      cy: chain.reduce((sum, item) => sum + item.cy, 0) / chain.length,
      bw: 0,
      bh: 0,
      fillRatio: 0,
      color: chain[0].color,
    };
    merged.bw = merged.x1 - merged.x0;
    merged.bh = merged.y1 - merged.y0;
    const poly = componentPolyline(merged);
    if (!poly || poly.length < unit * 0.12) {
      reject("passe en pointillés", "segments alignés trop courts");
      continue;
    }
    pushAction("pass", poly, false);
  }

  for (const component of strokeCandidates) {
    if (usedDash.has(component)) continue;
    const maxSide = Math.max(component.bw, component.bh);
    if (maxSide < unit * 0.09) {
      reject("trajectoire", "tracé trop court (moins de 9 % de la largeur du terrain)");
      continue;
    }
    if (component.fillRatio > 0.55) {
      reject("trajectoire", "composante trop pleine pour être un tracé (aplat ou symbole)");
      continue;
    }
    const inside = component.points.filter(insideToken).length / component.points.length;
    if (inside > 0.6) {
      reject("trajectoire", "confondue avec un jeton joueur");
      continue;
    }

    const poly = componentPolyline(component);
    if (!poly || poly.points.length < 3) {
      reject("trajectoire", "impossible d'ordonner le tracé");
      continue;
    }

    const kind = classify(poly, component);
    pushAction(kind, poly, false);
  }

  return { players, objects, actions, rejections, workCanvas: work };
}

/** Réexport pratique pour le scanner. */
export { applyOrientation };
