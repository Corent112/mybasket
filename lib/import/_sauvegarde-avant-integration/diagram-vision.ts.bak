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
 *
 * ---------------------------------------------------------------------------
 * NOTES DE CORRECTION (import v2)
 *
 * 1. FOND LOCAL, PAS DE COULEUR ABSOLUE.
 *    `isDefenseRed` et `isOrange` testaient des valeurs RGB absolues. Un pixel
 *    de parquet, ~rgb(222,160,90), satisfaisait LES DEUX :
 *      - tout jeton posé sur du bois se retrouvait entouré de « rouge défense »
 *        ⇒ 100 % des joueurs importés devenaient des défenseurs (X8, X11, X12…) ;
 *      - toute composante tirant vers le bois partait en ballon ou en plot.
 *    Le fond est désormais modélisé LOCALEMENT (médiane robuste par cellule),
 *    et la marque de défense est cherchée dans l'ENCRE, pas dans une teinte.
 *
 * 2. REPÈRE = AIRE DE JEU.
 *    `norm()` supposait que le canvas de travail était exactement l'aire de jeu.
 *    On lui donnait l'image entière du terrain (bois + cadre + filigrane) : le
 *    masque des lignes tombait à côté, le panier était mal placé, et tout ce qui
 *    dépassait était écrasé sur le bord par le clamp — l'amas de pastilles sur
 *    la ligne de fond. On travaille maintenant dans le repère `geometry.play`.
 *
 * 3. TIRETS. Un tiret de passe (allongé, court) n'était ni un jeton ni un tracé :
 *    il tombait dans le rejet « composante indéterminée ». La détection des
 *    passes en pointillés ne pouvait donc jamais aboutir.
 */

import type {
  AiDetectionType,
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
  canonicalBounds,
  courtLengthM,
  courtToCanonical,
  hueOf,
  orientedSize,
  pixelAt,
  readPixels,
  saturationOf,
  type CourtGeometry,
  type CourtKind,
  type CourtOrientation,
  type Pixels,
} from "./court-geometry";

const MAX_PLAYERS = 12;
const MAX_LINES = 14;
const MAX_OBJECTS = 12;
const MAX_TEXTS = 3;
const WORK_LONG_SIDE = 900;

/** Marge conservée autour de l'aire de jeu (un joueur peut être sur la touche). */
const PLAY_MARGIN = 0.08;

/**
 * Le repère canonique est étiré : en demi-terrain, x couvre 0.72 pour 15 m et y
 * couvre 0.43 pour 14 m. Une distance « ronde » doit donc pondérer y.
 */
const Y_WEIGHT = 1.6;

export type GraphicAnalysis = {
  players: AiDiagramPlayer[];
  objects: AiDiagramObject[];
  actions: AiDiagramAction[];
  rejections: ImportDebugRejection[];
  workCanvas: HTMLCanvasElement;
  /** Aire de jeu dans les pixels du canvas de travail (debug). */
  playRect: AiRect;
};

/* -------------------------------------------------------------------------- */
/* Préparation de l'image de travail                                          */
/* -------------------------------------------------------------------------- */

function drawOriented(
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

/**
 * Découpe le terrain et le remet dans l'orientation de la Plaquette
 * (panier en haut pour un demi-terrain, terrain vertical pour un complet).
 *
 * Signature historique conservée telle quelle.
 */
export function buildWorkCanvas(
  source: HTMLCanvasElement,
  rect: AiRect,
  orientation: CourtOrientation
): HTMLCanvasElement {
  return drawOriented(source, rect, orientation);
}

/**
 * Canvas de travail + position de l'AIRE DE JEU à l'intérieur de celui-ci.
 * On garde une marge autour de l'aire de jeu pour ne pas amputer un joueur
 * placé sur la ligne de touche.
 */
function prepareWork(
  source: HTMLCanvasElement,
  geometry: CourtGeometry
): { canvas: HTMLCanvasElement; play: AiRect } {
  const play = geometry.play ?? geometry.rect;
  const pw = Math.max(1, play.x1 - play.x0);
  const ph = Math.max(1, play.y1 - play.y0);

  const crop: AiRect = {
    x0: Math.max(0, play.x0 - pw * PLAY_MARGIN),
    y0: Math.max(0, play.y0 - ph * PLAY_MARGIN),
    x1: Math.min(source.width, play.x1 + pw * PLAY_MARGIN),
    y1: Math.min(source.height, play.y1 + ph * PLAY_MARGIN),
  };

  const canvas = drawOriented(source, crop, geometry.orientation);

  const cw = Math.max(1, crop.x1 - crop.x0);
  const ch = Math.max(1, crop.y1 - crop.y0);
  const a = applyOrientation((play.x0 - crop.x0) / cw, (play.y0 - crop.y0) / ch, geometry.orientation);
  const b = applyOrientation((play.x1 - crop.x0) / cw, (play.y1 - crop.y0) / ch, geometry.orientation);

  return {
    canvas,
    play: {
      x0: Math.min(a.x, b.x) * canvas.width,
      y0: Math.min(a.y, b.y) * canvas.height,
      x1: Math.max(a.x, b.x) * canvas.width,
      y1: Math.max(a.y, b.y) * canvas.height,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Modèle de fond local                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Médiane robuste du fond, par cellule, calculée sur un voisinage 3×3 cellules.
 * Le voisinage large garantit que l'encre (quelques pourcents des pixels) ne
 * tire jamais la médiane — y compris sur un parquet texturé, où l'ancienne
 * palette « 4 couleurs dominantes » se diluait au point de classer tout le bois
 * comme de l'encre.
 */
type Background = {
  cell: number;
  cw: number;
  ch: number;
  rgb: Float32Array;
  tol: Float32Array;
};

const medianOf = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

function buildBackground(px: Pixels): Background {
  const cell = Math.max(12, Math.round(Math.min(px.w, px.h) / 16));
  const cw = Math.max(1, Math.ceil(px.w / cell));
  const ch = Math.max(1, Math.ceil(px.h / cell));
  const rgb = new Float32Array(cw * ch * 3);
  const tol = new Float32Array(cw * ch);
  const sample = Math.max(1, Math.round(cell / 8));

  for (let cy = 0; cy < ch; cy += 1) {
    for (let cx = 0; cx < cw; cx += 1) {
      const x0 = Math.max(0, (cx - 1) * cell);
      const y0 = Math.max(0, (cy - 1) * cell);
      const x1 = Math.min(px.w, (cx + 2) * cell);
      const y1 = Math.min(px.h, (cy + 2) * cell);

      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      for (let y = y0; y < y1; y += sample) {
        for (let x = x0; x < x1; x += sample) {
          const [r, g, b] = pixelAt(px, x, y);
          rs.push(r);
          gs.push(g);
          bs.push(b);
        }
      }

      const mr = medianOf(rs);
      const mg = medianOf(gs);
      const mb = medianOf(bs);

      const deltas: number[] = [];
      for (let i = 0; i < rs.length; i += 1) {
        deltas.push(Math.hypot(rs[i] - mr, gs[i] - mg, bs[i] - mb));
      }
      const spread = medianOf(deltas);

      const index = cy * cw + cx;
      rgb[index * 3] = mr;
      rgb[index * 3 + 1] = mg;
      rgb[index * 3 + 2] = mb;
      // Tolérance : au moins 46 (bruit JPEG), au plus 120 (fond très texturé).
      tol[index] = Math.min(120, Math.max(46, spread * 3 + 22));
    }
  }

  return { cell, cw, ch, rgb, tol };
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
  /** Image intégrale du masque : « y a-t-il une ligne de terrain à moins de r ? ». */
  maskIntegral: Int32Array;
  /** Encre finale : brute, moins les lignes, mais symboles denses préservés. */
  ink: Uint8Array;
  bg: Background;
  paper: boolean;
  step: number;
  gw: number;
};

function makeInkContext(canvas: HTMLCanvasElement, kind: CourtKind, play: AiRect): InkContext {
  const px = readPixels(canvas);
  const bg = buildBackground(px);
  const step = Math.max(1, Math.round(Math.min(px.w, px.h) / 700));

  // Régime « feuille de papier » : fond globalement très clair.
  let bright = 0;
  let total = 0;
  for (let y = 0; y < px.h; y += Math.max(1, step * 4)) {
    for (let x = 0; x < px.w; x += Math.max(1, step * 4)) {
      const [r, g, b] = pixelAt(px, x, y);
      total += 1;
      if ((r + g + b) / 3 > 210) bright += 1;
    }
  }
  const paper = total > 0 && bright / total > 0.6;

  // Sur un terrain COLORIÉ, le test de couleur écarte déjà la peinture blanche :
  // le masque géométrique peut rester fin et ne pas manger les tracés du coach.
  // Sur PAPIER, les lignes sont de la même encre que le dessin et la géométrie
  // est approximative (photo, perspective, tracé à main levée) : il faut un
  // masque plus généreux, sinon une ligne qui fuit engloutit les jetons voisins.
  const mask = buildCourtLineMask(px.w, px.h, kind, play, paper ? 0.028 : 0.012);

  // ---- Encre BRUTE, avant tout masquage ---------------------------------
  // On la calcule une fois pour toutes : c'est aussi bien plus rapide que de
  // refaire le test par pixel à chaque visite.
  const raw = new Uint8Array(px.w * px.h);
  for (let y = 0; y < px.h; y += 1) {
    const cy = Math.min(bg.ch - 1, Math.floor(y / bg.cell));
    for (let x = 0; x < px.w; x += 1) {
      const i = y * px.w + x;
      const r = px.data[i * 4];
      const g = px.data[i * 4 + 1];
      const b = px.data[i * 4 + 2];
      const avg = (r + g + b) / 3;
      if (paper) {
        if (avg > 226) continue;
      } else if (avg > 228 && saturationOf(r, g, b) < 0.3) {
        continue;
      }
      const index = cy * bg.cw + Math.min(bg.cw - 1, Math.floor(x / bg.cell));
      const d = Math.hypot(
        r - bg.rgb[index * 3],
        g - bg.rgb[index * 3 + 1],
        b - bg.rgb[index * 3 + 2]
      );
      if (d > bg.tol[index]) raw[i] = 1;
    }
  }

  // ---- NOTE : symboles posés sur une ligne du terrain --------------------
  // Un jeton dessiné SUR une ligne est amputé par le masque, puis rejeté pour
  // cause de forme. La piste évidente — protéger du masquage les amas denses,
  // puisqu'un symbole est dense et une ligne ne l'est pas — a été implémentée
  // et MESURÉE par la batterie : elle gagnait un joueur sur le cas dédié et en
  // perdait sur six autres (une raquette pleine est dense elle aussi, et se
  // fragmentait en joueurs fantômes). Elle a donc été retirée.
  // Le problème reste ouvert, et documenté dans les limites connues.

  const ink = new Uint8Array(px.w * px.h);
  for (let i = 0; i < ink.length; i += 1) ink[i] = raw[i] && !mask[i] ? 1 : 0;

  // ---- SYMBOLES POSÉS SUR UNE LIGNE : deux méthodes essayées, rejetées ----
  // 1) Protéger du masquage les zones DENSES (un symbole est dense, une ligne
  //    ne l'est pas) : +1 joueur sur le cas dédié, 9 régressions ailleurs — la
  //    raquette pleine est dense elle aussi et se fragmentait en fantômes.
  // 2) SOUSTRAIRE localement la ligne : ne rendre un pixel effacé par le masque
  //    que s'il est entouré d'encre de part et d'autre dans au moins deux
  //    directions (le long d'une ligne isolée, une seule direction remplit la
  //    condition). Résultat mesuré : +1 joueur, 3 régressions, et deux
  //    trajectoires perdues.
  // Les deux ont été retirées. Le problème reste ouvert : voir les limites
  // connues. Ne pas les retenter sans passer la batterie.

  const maskIntegral = new Int32Array((px.w + 1) * (px.h + 1));
  for (let y = 0; y < px.h; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < px.w; x += 1) {
      rowSum += mask[y * px.w + x];
      maskIntegral[(y + 1) * (px.w + 1) + (x + 1)] = maskIntegral[y * (px.w + 1) + (x + 1)] + rowSum;
    }
  }

  return {
    px,
    mask,
    maskIntegral,
    ink,
    bg,
    paper,
    step,
    gw: Math.ceil(px.w / step),
  };
}

/** Une ligne officielle du terrain passe-t-elle à moins de `radius` pixels ? */
function nearCourtLine(ctx: InkContext, x: number, y: number, radius: number): boolean {
  const w = ctx.px.w;
  const x0 = Math.max(0, Math.round(x - radius));
  const y0 = Math.max(0, Math.round(y - radius));
  const x1 = Math.min(ctx.px.w - 1, Math.round(x + radius));
  const y1 = Math.min(ctx.px.h - 1, Math.round(y + radius));
  if (x1 < x0 || y1 < y0) return false;
  const sum =
    ctx.maskIntegral[(y1 + 1) * (w + 1) + (x1 + 1)] -
    ctx.maskIntegral[y0 * (w + 1) + (x1 + 1)] -
    ctx.maskIntegral[(y1 + 1) * (w + 1) + x0] +
    ctx.maskIntegral[y0 * (w + 1) + x0];
  return sum > 0;
}

function isInk(ctx: InkContext, x: number, y: number): boolean {
  const xx = Math.round(x);
  const yy = Math.round(y);
  if (xx < 0 || yy < 0 || xx >= ctx.px.w || yy >= ctx.px.h) return false;
  return ctx.ink[yy * ctx.px.w + xx] === 1;
}

const gridKey = (ctx: InkContext, x: number, y: number) =>
  Math.round(y / ctx.step) * ctx.gw + Math.round(x / ctx.step);

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
          seen[ni] = 1;
          if (isInk(ctx, nx * step, ny * step)) stack.push([nx, ny]);
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

/** Fusionne plusieurs composantes en une seule (pour recoller un trait coupé). */
function mergeComponents(parts: Component[]): Component {
  const points = parts.flatMap((part) => part.points);
  const x0 = Math.min(...parts.map((part) => part.x0));
  const y0 = Math.min(...parts.map((part) => part.y0));
  const x1 = Math.max(...parts.map((part) => part.x1));
  const y1 = Math.max(...parts.map((part) => part.y1));
  const bw = x1 - x0;
  const bh = y1 - y0;
  const total = parts.reduce((sum, part) => sum + part.points.length, 0) || 1;
  return {
    points,
    x0,
    y0,
    x1,
    y1,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    bw,
    bh,
    fillRatio: Math.min(1, points.length / Math.max(1, (bw * bh) / 4)),
    color: {
      r: parts.reduce((sum, part) => sum + part.color.r * part.points.length, 0) / total,
      g: parts.reduce((sum, part) => sum + part.color.g * part.points.length, 0) / total,
      b: parts.reduce((sum, part) => sum + part.color.b * part.points.length, 0) / total,
    },
  };
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
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of projected) {
    if (p.t < tMin) tMin = p.t;
    if (p.t > tMax) tMax = p.t;
  }
  const span = tMax - tMin;
  if (!Number.isFinite(span) || span < 1) return null;

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

/**
 * Ballon / plot : on raisonne en TEINTE et non en valeurs RGB absolues. Un
 * parquet clair satisfaisait l'ancien test `isOrange` et transformait n'importe
 * quelle tache en ballon. La composante est de toute façon déjà de l'encre,
 * donc distincte du fond local.
 */
const isOrangeInk = (r: number, g: number, b: number): boolean => {
  const hue = hueOf(r, g, b);
  return hue >= 8 && hue <= 48 && saturationOf(r, g, b) > 0.45 && Math.max(r, g, b) > 110;
};

const weighted = (a: AiPoint, b: AiPoint) => Math.hypot(a.x - b.x, (a.y - b.y) * Y_WEIGHT);

/**
 * Grille d'occupation d'une composante, en cellules relatives à sa boîte.
 */
function occupancy(component: Component, cols: number, rows: number): Uint8Array {
  const grid = new Uint8Array(cols * rows);
  const bw = Math.max(1, component.bw);
  const bh = Math.max(1, component.bh);
  for (const point of component.points) {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(((point.x - component.x0) / bw) * cols)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(((point.y - component.y0) / bh) * rows)));
    grid[cy * cols + cx] = 1;
  }
  return grid;
}

/**
 * Le symbole défenseur de la Plaquette (deux bras incurvés + tête) TOUCHE le
 * jeton : les bras font partie de la même composante d'encre. Leur signature est
 * que le HAUT de la composante se scinde en plusieurs traits séparés, ce qu'un
 * simple disque ne fait jamais.
 */
function hasSplitTop(component: Component): boolean {
  const cols = 24;
  const rows = 18;
  const grid = occupancy(component, cols, rows);
  let split = 0;
  const limit = Math.max(2, Math.round(rows * 0.4));

  // Un ROND VIDE se scinde lui aussi en deux traits, mais sur toute sa hauteur :
  // c'est un anneau, son CENTRE DE MASSE tombe dans le vide. Le symbole
  // défenseur, lui, a un disque plein sous ses bras. Sans ce garde-fou, un
  // croquis au stylo verrait tous ses joueurs passer en défenseurs.
  let sx = 0;
  let sy = 0;
  for (const point of component.points) {
    sx += (point.x - component.x0) / Math.max(1, component.bw);
    sy += (point.y - component.y0) / Math.max(1, component.bh);
  }
  const gx = Math.min(cols - 1, Math.max(0, Math.round((sx / component.points.length) * cols)));
  const gy = Math.min(rows - 1, Math.max(0, Math.round((sy / component.points.length) * rows)));
  let solid = 0;
  let probed = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const r = gy + dy;
      const c = gx + dx;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      probed += 1;
      if (grid[r * cols + c]) solid += 1;
    }
  }
  const solidCore = probed > 0 && solid / probed >= 0.55;

  // Largeur occupée par une ligne, du premier au dernier pixel.
  const extent = (r: number): number => {
    let first = -1;
    let last = -1;
    for (let c = 0; c < cols; c += 1) {
      if (!grid[r * cols + c]) continue;
      if (first < 0) first = c;
      last = c;
    }
    return first < 0 ? 0 : last - first + 1;
  };
  let topExtent = 0;
  let bodyExtent = 0;
  for (let r = 0; r < limit; r += 1) topExtent = Math.max(topExtent, extent(r));
  for (let r = limit; r < Math.max(limit + 1, Math.round(rows * 0.8)); r += 1) {
    bodyExtent = Math.max(bodyExtent, extent(r));
  }
  // Bras qui débordent nettement du jeton : c'est la marque du défenseur même
  // quand le rond est vide (croquis au stylo).
  const armsStickOut = bodyExtent > 0 && topExtent > bodyExtent * 1.3;

  if (!solidCore && !armsStickOut) return false;

  for (let r = 0; r < limit; r += 1) {
    let runs = 0;
    let gap = 0;
    let widestGap = 0;
    let previous = false;
    let runWidth = 0;
    const solidRuns = new Set<number>();
    for (let c = 0; c < cols; c += 1) {
      const on = grid[r * cols + c] === 1;
      if (on) {
        if (!previous) {
          runs += 1;
          runWidth = 0;
          if (runs > 1 && gap > widestGap) widestGap = gap;
        }
        runWidth += 1;
        if (runWidth >= 2) solidRuns.add(runs);
        gap = 0;
      } else if (runs > 0) {
        gap += 1;
      }
      previous = on;
    }
    // Deux traits d'AU MOINS deux cellules : une poussière isolée au-dessus d'un
    // jeton ne doit pas suffire à en faire un défenseur.
    if (solidRuns.size >= 2 && widestGap >= cols * 0.18) split += 1;
  }
  return split >= 3;
}

/**
 * Centre du DISQUE et non de la boîte : quand les bras du symbole défenseur sont
 * fusionnés avec le jeton, la boîte est décentrée vers le haut. On retient les
 * lignes et colonnes les plus DENSES, qui sont celles du disque.
 */
function discCentre(component: Component): { x: number; y: number } {
  const rows = new Map<number, number>();
  const cols = new Map<number, number>();
  for (const point of component.points) {
    rows.set(point.y, (rows.get(point.y) || 0) + 1);
    cols.set(point.x, (cols.get(point.x) || 0) + 1);
  }
  const centreOf = (counts: Map<number, number>, fallback: number): number => {
    let max = 0;
    for (const value of counts.values()) if (value > max) max = value;
    if (max <= 1) return fallback;
    let sum = 0;
    let weight = 0;
    for (const [key, value] of counts) {
      if (value < max * 0.7) continue;
      sum += key * value;
      weight += value;
    }
    return weight ? sum / weight : fallback;
  };
  return { x: centreOf(cols, component.cx), y: centreOf(rows, component.cy) };
}

/**
 * Marque de défense : un arc (ou deux bras) DESSINÉ au-dessus du jeton, de part
 * et d'autre de son axe. On le cherche dans l'encre, pas dans une teinte rouge :
 * l'ancien test couleur était satisfait par le parquet lui-même et faisait de
 * chaque joueur un défenseur.
 */
function hasDefenseMark(ctx: InkContext, candidate: Component, own: Set<number>): boolean {
  const step = ctx.step;
  const { bw, bh, cx } = candidate;
  const yTop = candidate.cy - bh * 1.8;
  const yBottom = candidate.cy - bh * 0.15;
  const x0 = cx - bw * 1.35;
  const x1 = cx + bw * 1.35;

  let left = 0;
  let right = 0;
  let above = 0;

  for (let y = yTop; y <= yBottom; y += step) {
    for (let x = x0; x <= x1; x += step) {
      if (!isInk(ctx, x, y)) continue;
      if (own.has(gridKey(ctx, x, y))) continue;
      above += 1;
      if (x < cx - bw * 0.25) left += 1;
      else if (x > cx + bw * 0.25) right += 1;
    }
  }

  const need = Math.max(3, Math.round((bw / step) * 0.45));
  if (left < need || right < need || above < need * 2.5) return false;
  // Symétrie : un simple tracé qui passe au-dessus n'est pas une marque.
  return Math.min(left, right) >= Math.max(left, right) * 0.28;
}

type OrangeKind = "ball" | "cone" | "unknown";

function classifyOrange(component: Component): OrangeKind {
  const ratio = component.bh / Math.max(1, component.bw);
  const inverse = component.bw / Math.max(1, component.bh);

  // Mesure la silhouette : un plot est nettement plus large à sa base qu'à
  // son sommet ; un ballon reste à peu près rond.
  const topLimit = component.y0 + component.bh * 0.38;
  const bottomLimit = component.y0 + component.bh * 0.68;
  const topXs = component.points.filter((p) => p.y <= topLimit).map((p) => p.x);
  const bottomXs = component.points.filter((p) => p.y >= bottomLimit).map((p) => p.x);
  const width = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
  const topW = width(topXs);
  const bottomW = width(bottomXs);
  const triangular = bottomW > Math.max(2, topW * 1.35) && ratio > 0.75;

  if (triangular) return "cone";
  if (ratio > 0.72 && ratio < 1.38 && inverse < 1.38 && component.fillRatio > 0.16) return "ball";
  return "unknown";
}

function arrowEvidence(poly: Polyline): { hasArrow: boolean; reverse: boolean } {
  if (poly.density.length < 4) return { hasArrow: false, reverse: false };
  const d = poly.density;
  const middle = d.slice(Math.max(1, Math.floor(d.length * 0.25)), Math.max(2, Math.ceil(d.length * 0.75)));
  const sorted = [...middle].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length / 2)] || 1;
  const headSpan = Math.max(...d.slice(0, Math.min(3, d.length)));
  const tailSpan = Math.max(...d.slice(Math.max(0, d.length - 3)));
  // Une flèche FINE a une hampe de deux ou trois pixels : exiger une pointe
  // trois fois plus large que la hampe revenait à n'accepter que les flèches
  // épaisses. On abaisse le facteur et le plancher, et on s'appuie sur la
  // comparaison des deux extrémités, qui reste discriminante.
  const firstStrong = headSpan >= Math.max(2, baseline * 1.35) && headSpan >= tailSpan * 1.15;
  const lastStrong = tailSpan >= Math.max(2, baseline * 1.35) && tailSpan >= headSpan * 1.15;
  return { hasArrow: firstStrong || lastStrong, reverse: firstStrong && !lastStrong };
}

/**
 * Un jeton joueur porte TOUJOURS quelque chose à l'intérieur : un numéro clair
 * sur un disque foncé, ou un chiffre tracé dans un rond dessiné. Un aplat uni
 * est un élément de décor.
 */
function hasInnerGlyph(ctx: InkContext, component: Component): boolean {
  const step = Math.max(1, ctx.step);
  const x0 = component.cx - component.bw * 0.3;
  const x1 = component.cx + component.bw * 0.3;
  const y0 = component.cy - component.bh * 0.3;
  const y1 = component.cy + component.bh * 0.3;

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const pixels: Array<[number, number, number]> = [];
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const [r, g, b] = pixelAt(ctx.px, x, y);
      rs.push(r);
      gs.push(g);
      bs.push(b);
      pixels.push([r, g, b]);
    }
  }
  if (pixels.length < 9) return true; // trop petit pour trancher : on n'exclut pas

  const mr = medianOf(rs);
  const mg = medianOf(gs);
  const mb = medianOf(bs);
  let different = 0;
  for (const [r, g, b] of pixels) {
    if (Math.hypot(r - mr, g - mg, b - mb) > 55) different += 1;
  }
  const share = different / pixels.length;
  return share > 0.03 && share < 0.62;
}

/**
 * Écarte les jetons qui n'en sont pas :
 *   - calibre aberrant (tous les jetons d'un schéma ont la même taille) ;
 *   - CHAÎNES de cinq jetons identiques et collés, sans rien à l'intérieur :
 *     c'est la signature d'un décor de gabarit (le bandeau de pastilles sur le
 *     rond central du terrain MyBasket), pas d'une file de joueurs — une vraie
 *     file, elle, porte des numéros.
 */
function dropDecorTokens(
  ctx: InkContext,
  tokens: Component[],
  unit: number,
  reject: (what: string, why: string) => void
): Component[] {
  if (tokens.length < 4) return tokens;

  const areaOf = (component: Component) => component.points.length;
  const median = medianOf(tokens.map(areaOf)) || 1;
  let kept = tokens.filter((component) => {
    const area = areaOf(component);
    if (area > median * 3.5 || area < median * 0.28) {
      reject("jeton joueur", "calibre très différent des autres jetons : élément de décor");
      return false;
    }
    return true;
  });
  if (kept.length < 5) return kept;

  // Règle principale : c'est le DESSIN qui fixe sa convention. Si une partie
  // nette des jetons porte un numéro, alors ce schéma utilise des jetons
  // numérotés, et les ronds vides sont du décor. Si AUCUN n'en porte (croquis
  // au stylo, ronds vides), on ne touche à rien.
  const withGlyph = kept.filter((component) => hasInnerGlyph(ctx, component));
  if (withGlyph.length >= 3 && withGlyph.length >= kept.length * 0.3 && withGlyph.length < kept.length) {
    reject("jeton joueur", "rond vide alors que le schéma numérote ses joueurs : élément de décor");
    return withGlyph;
  }

  // Composantes connexes : deux jetons distants de moins de ~1,4 m sont liés.
  const link = unit * 0.09;
  const parent = kept.map((_item, index) => index);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < kept.length; i += 1) {
    for (let j = i + 1; j < kept.length; j += 1) {
      if (Math.hypot(kept[i].cx - kept[j].cx, kept[i].cy - kept[j].cy) > link) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[a] = b;
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < kept.length; i += 1) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(i);
    else groups.set(root, [i]);
  }

  const doomed = new Set<number>();
  for (const indices of groups.values()) {
    if (indices.length < 5) continue;
    const areas = indices.map((i) => areaOf(kept[i]));
    const homogeneous = Math.max(...areas) / Math.max(1, Math.min(...areas)) < 1.8;
    if (!homogeneous) continue;

    const blank = indices.filter((i) => !hasInnerGlyph(ctx, kept[i]));
    if (blank.length) {
      for (const i of blank) doomed.add(i);
      reject("jeton joueur", "chaîne de ronds vides et identiques : décor du gabarit, pas des joueurs");
    } else {
      // Tous portent un glyphe : on ne jette pas une file de joueurs, on se
      // contente d'écarter le surplus au-delà des deux plus gros.
      indices.sort((a, b) => areaOf(kept[b]) - areaOf(kept[a]));
      for (const i of indices.slice(8)) doomed.add(i);
    }
  }

  if (doomed.size) kept = kept.filter((_item, index) => !doomed.has(index));
  return kept;
}

/* --------------------------------------------------------- jetons : lecture */

type TokenRead = {
  candidate: Component;
  /** Centre retenu pour le joueur (disque, pas boîte englobante). */
  centre: { x: number; y: number };
  area: number;
  digits: string;
  confidence: number;
  /** Somme des indices de défense (0..1). On ne tranche qu'à la fin. */
  defenseEvidence: number;
  /** Ce qui a produit ces indices, en clair. */
  defenseSource: string[];
  /** Qualité de la détection du jeton lui-même. */
  shapeScore: number;
  contrastScore: number;
  hasGlyph: boolean;
};

/**
 * Pointe de flèche, mesurée GÉOMÉTRIQUEMENT sur la composante.
 *
 * La mesure par densité de la polyligne est indirecte : quand le tracé touche un
 * jeton, la masse du jeton fausse la ligne de base et la pointe disparaît dans
 * le bruit. Ici on compte simplement les pixels d'encre autour de chaque
 * extrémité et on les compare au milieu du tracé : une pointe, c'est un
 * épaississement local, franc et localisé.
 */
function arrowHeadEvidence(
  ctx: InkContext,
  poly: Polyline
): { hasArrow: boolean; reverse: boolean } {
  // Épaisseur locale du trait, mesurée perpendiculairement, point par point.
  // C'est la mesure la plus directe de « il y a une pointe » : une flèche est
  // un trait d'épaisseur constante qui s'élargit franchement à une extrémité.
  const widths: number[] = [];
  const limit = Math.max(4, Math.round(Math.min(ctx.px.w, ctx.px.h) * 0.05));
  for (let i = 0; i < poly.points.length; i += 1) {
    const previous = poly.points[Math.max(0, i - 1)];
    const next = poly.points[Math.min(poly.points.length - 1, i + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const point = poly.points[i];
    let width = 1;
    for (let d = 1; d <= limit; d += 1) {
      if (!isInk(ctx, point.x + nx * d, point.y + ny * d)) break;
      width += 1;
    }
    for (let d = 1; d <= limit; d += 1) {
      if (!isInk(ctx, point.x - nx * d, point.y - ny * d)) break;
      width += 1;
    }
    widths.push(width);
  }
  if (widths.length < 4) return { hasArrow: false, reverse: false };

  const span = Math.max(1, Math.round(widths.length * 0.25));
  const head = Math.max(...widths.slice(0, span));
  const tail = Math.max(...widths.slice(widths.length - span));
  const body = medianOf(widths.slice(span, Math.max(span + 1, widths.length - span)));
  const reference = Math.max(1, body);
  const headStrong = head >= reference * 1.6 && head >= reference + 2;
  const tailStrong = tail >= reference * 1.6 && tail >= reference + 2;
  return { hasArrow: headStrong || tailStrong, reverse: headStrong && !tailStrong };
}

/** @deprecated mesure indirecte, conservée comme second avis. */
function arrowHeadEvidenceByPoints(
  component: Component,
  poly: Polyline,
  unit: number
): { hasArrow: boolean; reverse: boolean } {
  // Le rayon doit être de l'ordre de la POINTE, pas du tracé : trop large, la
  // hampe pèse autant dans les deux mesures et l'épaississement se dilue.
  const radius = Math.max(3, unit * 0.013);
  const around = (point: AiPoint): number => {
    let count = 0;
    for (const p of component.points) {
      if (Math.abs(p.x - point.x) > radius || Math.abs(p.y - point.y) > radius) continue;
      if (Math.hypot(p.x - point.x, p.y - point.y) <= radius) count += 1;
    }
    return count;
  };

  const first = poly.points[0];
  const last = poly.points[poly.points.length - 1];
  const middle = poly.points[Math.floor(poly.points.length / 2)];
  const centre = Math.max(1, around(middle));
  const head = around(first);
  const tail = around(last);

  const headStrong = head >= centre * 1.55 && head >= 4;
  const tailStrong = tail >= centre * 1.55 && tail >= 4;
  return { hasArrow: headStrong || tailStrong, reverse: headStrong && !tailStrong };
}

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

  const prepared = prepareWork(source, geometry);
  const work = prepared.canvas;
  const play = prepared.play;
  const playW = Math.max(1, play.x1 - play.x0);
  const playH = Math.max(1, play.y1 - play.y0);

  const ink = makeInkContext(work, geometry.kind, play);
  const unit = playW; // largeur du terrain (15 m) en pixels de travail
  const components = extractComponents(ink);

  const players: AiDiagramPlayer[] = [];
  const objects: AiDiagramObject[] = [];
  const actions: AiDiagramAction[] = [];

  /** Pixels de travail → repère canonique, via l'AIRE DE JEU. */
  const norm = (x: number, y: number): AiPoint =>
    courtToCanonical({ x: (x - play.x0) / playW, y: (y - play.y0) / playH }, geometry.kind);

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
    if (component.bw > unit * 0.82 && component.bh > playH * 0.7) {
      reject("composante géante", "occupe presque tout le terrain (fond non masqué)");
      continue;
    }

    if (isOrangeInk(component.color.r, component.color.g, component.color.b) && maxSide < unit * 0.09) {
      orangeCandidates.push(component);
      continue;
    }

    const tokenSized = maxSide > unit * 0.03 && maxSide < unit * 0.12;
    if (tokenSized && ratio < 1.75) {
      tokenCandidates.push(component);
      continue;
    }

    // Un DÉFENSEUR dessiné par la Plaquette mesure ~5,6 rayons de large (les
    // deux bras) pour 2,8 de haut : ratio ≈ 2 et côté ≈ 13 % du terrain. Il
    // sortait donc systématiquement du tamis « jeton » et finissait en
    // trajectoire — autrement dit, aucun défenseur natif n'était jamais importé.
    // On élargit le gabarit UNIQUEMENT pour les formes dont le haut se scinde.
    if (
      maxSide > unit * 0.03 &&
      maxSide < unit * 0.2 &&
      ratio < 2.8 &&
      component.fillRatio > 0.15 &&
      hasSplitTop(component)
    ) {
      tokenCandidates.push(component);
      continue;
    }

    // Les TRACÉS ne sont pas collectés ici : ils le seront dans un second
    // passage, une fois les disques des joueurs retirés (voir plus bas).
    if (maxSide > unit * 0.075 || (ratio >= 2.2 && maxSide > unit * 0.03)) continue;

    reject("composante indéterminée", "ni jeton joueur ni trajectoire exploitable");
  }

  // Le décor du gabarit (logo, pastilles du rond central…) doit être écarté
  // AVANT le plafond de MAX_PLAYERS, sinon il occupe les places disponibles et
  // le filtrage arrive trop tard.
  const cleaned = dropDecorTokens(ink, tokenCandidates, unit, reject);

  // Sélection : les plus grosses composantes d'abord (les plus crédibles).
  cleaned.sort((a, b) => b.points.length - a.points.length);
  const selected = cleaned.slice(0, MAX_PLAYERS);
  if (cleaned.length > MAX_PLAYERS) {
    reject("jeton joueur", `limite de ${MAX_PLAYERS} joueurs atteinte`);
  }
  // Numérotation : de haut en bas puis de gauche à droite, pour que les numéros
  // provisoires soient au moins cohérents avec la lecture du schéma.
  selected.sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  const reads: TokenRead[] = [];
  for (const candidate of selected) {
    const own = new Set<number>();
    for (const point of candidate.points) own.add(gridKey(ink, point.x, point.y));

    const read = await ocrToken(work, {
      x0: candidate.x0,
      y0: candidate.y0,
      x1: candidate.x1,
      y1: candidate.y1,
    });

    const raw = read?.text ?? "";

    // On ACCUMULE des indices, on ne tranche pas ici. Trois sources
    // indépendantes, aucune décisive à elle seule :
    //   - bras FUSIONNÉS avec le jeton : le haut de la composante se scinde ;
    //   - bras SÉPARÉS : de l'encre en arc au-dessus, des deux côtés ;
    //   - un X lu par l'OCR.
    const merged = hasSplitTop(candidate);
    const arc = hasDefenseMark(ink, candidate, own);
    const cross = /x/i.test(raw);
    const defenseSource: string[] = [];
    let defenseEvidence = 0;
    if (merged) {
      defenseEvidence += 0.55;
      defenseSource.push("bras fusionnés au jeton");
    }
    if (arc) {
      defenseEvidence += 0.45;
      defenseSource.push("arc d'encre au-dessus");
    }
    if (cross) {
      defenseEvidence += 0.6;
      defenseSource.push("X lu par l'OCR");
    }
    defenseEvidence = Math.min(1, defenseEvidence);

    // Bras fusionnés : la boîte est décentrée vers le haut, on vise le disque.
    const centre = merged ? discCentre(candidate) : { x: candidate.cx, y: candidate.cy };

    // Qualité du jeton : rondeur et contraste avec son fond local.
    const ratio = Math.max(candidate.bw, candidate.bh) / Math.max(1, Math.min(candidate.bw, candidate.bh));
    const shapeScore = Math.max(0, Math.min(1, 1.6 - ratio * 0.6));
    const bgIndex =
      Math.min(ink.bg.ch - 1, Math.floor(candidate.cy / ink.bg.cell)) * ink.bg.cw +
      Math.min(ink.bg.cw - 1, Math.floor(candidate.cx / ink.bg.cell));
    const contrast = Math.hypot(
      candidate.color.r - ink.bg.rgb[bgIndex * 3],
      candidate.color.g - ink.bg.rgb[bgIndex * 3 + 1],
      candidate.color.b - ink.bg.rgb[bgIndex * 3 + 2]
    );
    const contrastScore = Math.max(0, Math.min(1, (contrast - 40) / 120));

    reads.push({
      candidate,
      centre,
      area: candidate.points.length,
      digits: raw.replace(/\D/g, "").slice(0, 2),
      confidence: read?.confidence ?? 0,
      defenseEvidence,
      defenseSource,
      shapeScore,
      contrastScore,
      hasGlyph: hasInnerGlyph(ink, candidate),
    });
  }

  // Attribution des libellés en DEUXIÈME passe : un numéro provisoire ne doit
  // jamais entrer en collision avec un numéro réellement lu ailleurs.
  // Seuils de décision. Entre les deux, on répond `unknown` plutôt que de
  // trancher au hasard : un clic de l'utilisateur coûte moins cher qu'une
  // erreur silencieuse.
  const DEFENSE_SURE = 0.5;
  const DEFENSE_NONE = 0.2;

  const typeOf = (evidence: number): AiDetectionType =>
    evidence >= DEFENSE_SURE ? "defender" : evidence <= DEFENSE_NONE ? "attacker" : "unknown";

  const usedAttack = new Set<string>();
  const usedDefense = new Set<string>();
  for (const item of reads) {
    if (!item.digits || item.confidence <= 0.5) continue;
    if (typeOf(item.defenseEvidence) === "defender") usedDefense.add(item.digits);
    else usedAttack.add(item.digits);
  }
  const nextFree = (used: Set<string>): string => {
    for (let i = 1; i <= 99; i += 1) {
      const value = String(i);
      if (!used.has(value)) {
        used.add(value);
        return value;
      }
    }
    return "0";
  };

  /** Position PIXEL des joueurs retenus, alignée sur `players` par sa clé. */
  const playerPixel: Array<{ key: string; x: number; y: number; area: number }> = [];

  const medianArea = medianOf(reads.map((item) => item.area)) || 1;

  for (const item of reads) {
    const point = norm(item.centre.x, item.centre.y);

    const type = typeOf(item.defenseEvidence);
    const isDefense = type === "defender";
    const confident = Boolean(item.digits) && item.confidence > 0.5;

    let label: string;
    if (isDefense) {
      label = `X${confident ? item.digits : nextFree(usedDefense)}`;
    } else if (confident) {
      label = item.digits;
    } else {
      label = nextFree(usedAttack);
    }
    if (!confident) {
      reject("numéro de joueur", "chiffre illisible → numéro provisoire à corriger");
    }

    // Confiance de DÉTECTION : est-ce bien un jeton ? Rondeur, contraste,
    // calibre cohérent avec les autres, présence d'un numéro à l'intérieur.
    const sizeScore = Math.max(0, Math.min(1, 1 - Math.abs(Math.log(item.area / medianArea)) / 1.4));
    const detection = Math.max(
      0.15,
      Math.min(
        1,
        0.25 + 0.25 * item.shapeScore + 0.2 * item.contrastScore + 0.2 * sizeScore + (item.hasGlyph ? 0.15 : 0)
      )
    );

    // Confiance de CLASSIFICATION, distincte : on peut être sûr que c'est un
    // joueur sans savoir de quel côté il joue.
    const typeConfidence =
      type === "defender"
        ? Math.min(1, 0.55 + item.defenseEvidence * 0.45)
        : type === "attacker"
        ? 0.75
        : 0.4;
    const source = [
      item.hasGlyph ? "jeton numéroté" : "jeton uni",
      ...item.defenseSource,
      type === "unknown" ? "indices défensifs ambigus" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (type === "unknown") {
      reject("type de joueur", "indices défensifs ambigus → laissé à confirmer");
    }

    // Règle produit MyBasket : tous les attaquants importés sont des ronds.
    // Les défenseurs utilisent aussi le shape circle ; leur rendu spécifique est
    // déterminé par team='def' dans PlaquetteClient.tsx.
    const nearBall = orangeCandidates.some((orange) => {
      if (classifyOrange(orange) !== "ball") return false;
      return (
        Math.hypot(orange.cx - item.centre.x, orange.cy - item.centre.y) <
        Math.max(item.candidate.bw, item.candidate.bh) * 1.75
      );
    });

    const key = `${keyPrefix}p${players.length + 1}`;
    players.push({
      key,
      label,
      // `team` reste la vérité pour la Plaquette, qui ne connaît que att / def.
      // Un `unknown` est posé en attaquant ET signalé par type + typeConfidence.
      team: isDefense ? "def" : "att",
      x: point.x,
      y: point.y,
      shape: "circle",
      hasBall: nearBall,
      labelConfident: confident,
      type,
      confidence: Number(detection.toFixed(3)),
      typeConfidence: Number(typeConfidence.toFixed(3)),
      source,
    });
    playerPixel.push({ key, x: item.centre.x, y: item.centre.y, area: item.area });
  }

  /* ------------------------------------- second passage : trajectoires */

  // Une flèche qui PART d'un joueur touche son disque : les deux ne forment
  // qu'une seule composante d'encre, la masse du jeton noie la pointe, et le
  // tracé finit rejeté « trop plein » ou « confondu avec un jeton ». On retire
  // donc temporairement les disques des joueurs retenus, puis on ré-extrait les
  // composantes : les tracés ressortent nets, avec leur pointe.
  //
  // On ne touche PAS au masque global du terrain : seul le contenu des disques
  // est effacé, et uniquement pour ce passage.
  const strokeInk = new Uint8Array(ink.ink);
  const removed: Array<{ x: number; y: number; r: number }> = [];
  for (const item of reads) {
    const radius = Math.max(3, Math.max(item.candidate.bw, item.candidate.bh) * 0.55);
    removed.push({ x: item.centre.x, y: item.centre.y, r: radius });
    const x0 = Math.max(0, Math.floor(item.centre.x - radius));
    const x1 = Math.min(ink.px.w - 1, Math.ceil(item.centre.x + radius));
    const y0 = Math.max(0, Math.floor(item.centre.y - radius));
    const y1 = Math.min(ink.px.h - 1, Math.ceil(item.centre.y + radius));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (Math.hypot(x - item.centre.x, y - item.centre.y) <= radius) strokeInk[y * ink.px.w + x] = 0;
      }
    }
  }

  // Fermeture morphologique 3×3 : l'anticrénelage laisse parfois un pixel de
  // vide entre la hampe et la pointe d'une flèche, et les deux ressortent alors
  // comme deux composantes — une « trop pleine » (la pointe), une « trop
  // courte » (la hampe). Un pixel de dilatation puis d'érosion les recolle sans
  // épaissir le trait.
  const closed = new Uint8Array(strokeInk.length);
  const W = ink.px.w;
  const H = ink.px.h;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          if (strokeInk[yy * W + xx]) { on = 1; break; }
        }
      }
      closed[y * W + x] = on;
    }
  }
  const eroded = new Uint8Array(strokeInk.length);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let keep = 1;
      for (let dy = -1; dy <= 1 && keep; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) { keep = 0; break; }
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= W || !closed[yy * W + xx]) { keep = 0; break; }
        }
      }
      eroded[y * W + x] = keep;
    }
  }
  for (let i = 0; i < strokeInk.length; i += 1) if (eroded[i]) strokeInk[i] = 1;

  const strokeContext: InkContext = { ...ink, ink: strokeInk };
  for (const component of extractComponents(strokeContext)) {
    const maxSide = Math.max(component.bw, component.bh);
    const minSide = Math.max(1, Math.min(component.bw, component.bh));
    const ratio = maxSide / minSide;
    if (maxSide < unit * 0.03) continue;
    if (maxSide > unit * 0.075 || ratio >= 2.2) strokeCandidates.push(component);
  }

  // Reconnexion : un trait qui TRAVERSE un joueur a été coupé en deux. Si deux
  // morceaux touchent le même disque retiré, de part et d'autre, ils ne font
  // qu'un seul geste — on les recolle avant de les interpréter.
  for (const disc of removed) {
    const touching = strokeCandidates.filter((component) =>
      component.points.some((point) => Math.hypot(point.x - disc.x, point.y - disc.y) < disc.r * 1.6)
    );
    if (touching.length !== 2) continue;
    const angleOf = (component: Component) => Math.atan2(component.cy - disc.y, component.cx - disc.x);
    let delta = Math.abs(angleOf(touching[0]) - angleOf(touching[1]));
    if (delta > Math.PI) delta = Math.PI * 2 - delta;
    if (delta < 2.1) continue; // pas de part et d'autre : ce n'est pas le même trait
    const merged = mergeComponents(touching);
    strokeCandidates.splice(strokeCandidates.indexOf(touching[0]), 1);
    strokeCandidates.splice(strokeCandidates.indexOf(touching[1]), 1);
    strokeCandidates.push(merged);
    reject("trajectoire", "deux morceaux recollés de part et d'autre d'un joueur");
  }

  /* ------------------------------------------------ normalisation finale */

  tidyPlayers(players, playerPixel, geometry.kind, reject);

  /* --------------------------------------------------------------- objets */

  for (const candidate of orangeCandidates) {
    if (objects.length >= MAX_OBJECTS) break;
    const point = norm(candidate.cx, candidate.cy);
    const kind = classifyOrange(candidate);
    if (kind === "unknown") {
      reject("objet orange", "forme trop ambiguë pour décider ballon ou plot");
      continue;
    }

    if (kind === "ball") {
      const attached = players.some(
        (player) => player.hasBall && weighted({ x: player.x, y: player.y }, point) < 0.05
      );
      if (attached) continue; // le ballon est porté par le joueur, pas dupliqué en objet
    }

    // Un ballon dessiné mesure ~0.035 de la largeur du terrain, un plot autant :
    // un objet orange nettement plus gros ou plus petit reste possible mais
    // moins sûr.
    const size = Math.max(candidate.bw, candidate.bh) / unit;
    const sizeScore = Math.max(0, Math.min(1, 1 - Math.abs(size - 0.038) / 0.05));
    const confidence = Math.max(0.25, Math.min(1, 0.45 + 0.3 * sizeScore + 0.25 * candidate.fillRatio));

    objects.push({
      kind,
      x: point.x,
      y: point.y,
      confidence: Number(confidence.toFixed(3)),
      source: `objet orange ${kind === "ball" ? "rond" : "triangulaire"} (${(size * 100).toFixed(1)} % du terrain)`,
    });
  }

  /* ------------------------------------------------------------- textes */

  try {
    let added = 0;
    const textOcr = await ocrRegion(work, { x0: 0, y0: 0, x1: work.width, y1: work.height }, 1200);
    for (const word of textOcr.words) {
      if (objects.length >= MAX_OBJECTS || added >= MAX_TEXTS) break;
      const clean = word.text.trim();
      if (clean.replace(/[^a-zA-ZÀ-ÿ]/g, "").length < 4) continue;
      // Seuil relevé : sur un terrain chargé, l'OCR plein cadre fabriquait des
      // objets « texte » à partir des lignes et des jetons.
      if (word.confidence < 0.72) continue;
      const point = norm((word.x0 + word.x1) / 2, (word.y0 + word.y1) / 2);
      if (players.some((player) => weighted({ x: player.x, y: player.y }, point) < 0.04)) continue;
      objects.push({
        kind: "text",
        x: point.x,
        y: point.y,
        text: clean,
        confidence: Number(word.confidence.toFixed(3)),
        source: "OCR du schéma",
      });
      added += 1;
    }
  } catch {
    reject("texte du schéma", "OCR de la zone graphique indisponible");
  }

  /* -------------------------------------------------------- trajectoires */

  const tokenBoxes = selected.map((candidate) => ({
    x0: candidate.x0 - candidate.bw * 0.2,
    y0: candidate.y0 - candidate.bh * 0.2,
    x1: candidate.x1 + candidate.bw * 0.2,
    y1: candidate.y1 + candidate.bh * 0.2,
  }));

  const insideToken = (p: { x: number; y: number }) =>
    tokenBoxes.some((boxRect) => p.x >= boxRect.x0 && p.x <= boxRect.x1 && p.y >= boxRect.y0 && p.y <= boxRect.y1);

  // Panier : exprimé dans l'AIRE DE JEU, pas dans le canvas de travail.
  const hoop: AiPoint = {
    x: play.x0 + playW * 0.5,
    y: play.y0 + playH * (1.575 / courtLengthM(geometry.kind)),
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
    let direction: { x: number; y: number } | null = null;

    for (let guard = 0; guard < 12; guard += 1) {
      let best: Component | null = null;
      let bestDistance = unit * 0.13;
      for (const other of dashParts) {
        if (usedDash.has(other)) continue;
        const dx = other.cx - current.cx;
        const dy = other.cy - current.cy;
        const d = Math.hypot(dx, dy);
        if (d >= bestDistance) continue;
        // Contrainte de colinéarité : sans elle, le chaînage glouton reliait des
        // tirets sans rapport et fabriquait des passes en zigzag.
        if (direction) {
          const cos = (dx * direction.x + dy * direction.y) / (Math.max(1e-6, d) * Math.hypot(direction.x, direction.y));
          if (cos < 0.82) continue;
        }
        bestDistance = d;
        best = other;
      }
      if (!best) break;
      direction = { x: best.cx - current.cx, y: best.cy - current.cy };
      usedDash.add(best);
      chain.push(best);
      current = best;
    }

    if (chain.length >= 3) dashChains.push(chain);
    else chain.forEach((item) => usedDash.delete(item));
  }

  const classify = (poly: Polyline): AiDiagramActionKind => {
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

    return "cut";
  };

  const pushAction = (
    kind: AiDiagramActionKind,
    poly: Polyline,
    component?: Component,
    context?: InkContext
  ) => {
    if (actions.length >= MAX_LINES) {
      reject("trajectoire", `limite de ${MAX_LINES} tracés par schéma atteinte`);
      return;
    }

    // PIÈGE : les lignes du terrain prises pour des trajectoires.
    // Le masque géométrique écarte déjà la peinture, mais il est fin et une
    // ligne mal alignée (photo, perspective résiduelle, tracé à main levée)
    // fuit toujours un peu. Seconde barrière, plus large : un tracé qui suit une
    // ligne officielle sur l'essentiel de sa longueur n'est pas une flèche du
    // coach — c'est l'arc à 3 points ou un bord de raquette.
    const onLine =
      poly.points.filter((point) => nearCourtLine(ink, point.x, point.y, unit * 0.022)).length /
      Math.max(1, poly.points.length);
    if (onLine > 0.6) {
      reject("trajectoire", `suit une ligne du terrain sur ${Math.round(onLine * 100)} % de sa longueur`);
      return;
    }

    // Deux mesures indépendantes de la pointe : profil de densité le long de la
    // polyligne, et épaississement local aux extrémités. La seconde rattrape les
    // flèches fines, que la première laissait passer.
    const byDensity = arrowEvidence(poly);
    const byWidth = arrowHeadEvidence(context ?? ink, poly);
    const byShape = component ? arrowHeadEvidenceByPoints(component, poly, unit) : { hasArrow: false, reverse: false };
    const arrow = byWidth.hasArrow ? byWidth : byDensity.hasArrow ? byDensity : byShape;
    // Ne jamais inventer une trajectoire : cut/pass/dribble/shoot exigent une
    // vraie pointe de flèche détectée. Un écran est la seule exception car son
    // symbole natif se termine par un T et non par une flèche.
    if (kind !== "screen" && !arrow.hasArrow) {
      reject("trajectoire", "aucune pointe de flèche fiable détectée");
      return;
    }

    let ordered = poly.points;
    if (arrow.reverse) ordered = [...ordered].reverse();

    const start = ordered[0];
    const end = ordered[ordered.length - 1];
    const fromPlayer = nearestPlayer(start, unit * 0.13);
    const toPlayer = kind === "pass" ? nearestPlayer(end, unit * 0.11) : undefined;

    // Confiance : pointe de flèche nette, tracé long, et bien détaché des
    // lignes du terrain. Un tracé court qui longe une ligne reste possible mais
    // sera présenté comme à confirmer.
    const lengthScore = Math.max(0, Math.min(1, poly.length / (unit * 0.3)));
    const confidence = Math.max(
      0.2,
      Math.min(1, 0.28 + (arrow.hasArrow ? 0.32 : 0) + 0.2 * (1 - onLine) + 0.2 * lengthScore)
    );

    actions.push({
      action: kind,
      fromPlayer,
      toPlayer,
      from: norm(start.x, start.y),
      to: norm(end.x, end.y),
      order: actions.length + 1,
      // Conserver la géométrie source pour que Plaquette puisse recréer la courbe.
      points: ordered.map((p) => norm(p.x, p.y)),
      confidence: Number(confidence.toFixed(3)),
      source: [
        arrow.hasArrow ? "pointe de flèche détectée" : "symbole d'écran",
        `${Math.round((1 - onLine) * 100)} % hors lignes de terrain`,
      ].join(" · "),
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
    pushAction("pass", poly, merged, strokeContext);
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

    pushAction(classify(poly), poly, component, strokeContext);
  }

  // Les joueurs supprimés par tidyPlayers ne doivent plus être référencés.
  const liveKeys = new Set(players.map((player) => player.key));
  for (const action of actions) {
    if (action.fromPlayer && !liveKeys.has(action.fromPlayer)) action.fromPlayer = undefined;
    if (action.toPlayer && !liveKeys.has(action.toPlayer)) action.toPlayer = undefined;
  }

  return { players, objects, actions, rejections, workCanvas: work, playRect: play };
}

/* -------------------------------------------------------------------------- */
/* Normalisation finale du schéma                                             */
/* -------------------------------------------------------------------------- */

/**
 * Trois nettoyages, dans l'ordre :
 *   1. doublons quasi superposés ;
 *   2. GRAPPES : plus de quatre jetons dans un mouchoir de poche, c'est une
 *      décoration du gabarit (logo, cercle central, public) prise pour des
 *      joueurs — on ne garde que les deux plus grosses composantes ;
 *   3. écartement doux des jetons qui se chevauchent encore.
 *
 * `players` et `pixels` sont modifiés en place et restent alignés.
 */
function tidyPlayers(
  players: AiDiagramPlayer[],
  pixels: Array<{ key: string; x: number; y: number; area: number }>,
  kind: CourtKind,
  reject: (what: string, why: string) => void
): void {
  const areaOf = (key: string) => pixels.find((item) => item.key === key)?.area ?? 0;

  const drop = (keys: Set<string>, what: string, why: string) => {
    if (!keys.size) return;
    for (let i = players.length - 1; i >= 0; i -= 1) {
      if (!keys.has(players[i].key)) continue;
      players.splice(i, 1);
      reject(what, why);
    }
    for (let i = pixels.length - 1; i >= 0; i -= 1) {
      if (keys.has(pixels[i].key)) pixels.splice(i, 1);
    }
  };

  // 1. doublons
  const duplicates = new Set<string>();
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      if (duplicates.has(players[j].key)) continue;
      if (weighted(players[i], players[j]) < 0.022) {
        const loser = areaOf(players[i].key) >= areaOf(players[j].key) ? players[j] : players[i];
        duplicates.add(loser.key);
      }
    }
  }
  drop(duplicates, "jeton joueur", "doublon à la même position");

  // 2. grappes décoratives (le gros du tri est déjà fait par dropDecorTokens,
  //    en pixels ; ceci ne rattrape que ce qui a survécu)
  const CLUSTER_RADIUS = 0.1;
  const clustered = new Set<string>();
  for (const player of players) {
    if (clustered.has(player.key)) continue;
    const group = players.filter((other) => weighted(player, other) < CLUSTER_RADIUS);
    if (group.length < 5) continue;
    group.sort((a, b) => areaOf(b.key) - areaOf(a.key));
    for (const item of group.slice(2)) clustered.add(item.key);
  }
  drop(
    clustered,
    "grappe de jetons",
    "plus de quatre jetons agglutinés : décor du gabarit pris pour des joueurs"
  );

  // 2bis. empilement sur la bordure (signature d'un clamp de coordonnées)
  const bounds = canonicalBounds(kind);
  const onEdge = players.filter(
    (player) =>
      Math.abs(player.y - bounds.yMax) < 0.006 ||
      Math.abs(player.y - bounds.yMin) < 0.006 ||
      Math.abs(player.x - bounds.xMax) < 0.006 ||
      Math.abs(player.x - bounds.xMin) < 0.006
  );
  if (onEdge.length >= 3) {
    drop(
      new Set(onEdge.map((player) => player.key)),
      "jeton joueur",
      "aligné sur la bordure du terrain : élément hors de l'aire de jeu"
    );
  }

  // 3. écartement doux
  const MIN_SEP = 0.042;
  for (let pass = 0; pass < 4; pass += 1) {
    let moved = false;
    for (let i = 0; i < players.length; i += 1) {
      for (let j = i + 1; j < players.length; j += 1) {
        const a = players[i];
        const b = players[j];
        const dx = b.x - a.x;
        const dy = (b.y - a.y) * Y_WEIGHT;
        const d = Math.hypot(dx, dy);
        if (d >= MIN_SEP) continue;
        const push = (MIN_SEP - Math.max(d, 1e-4)) / 2;
        const ux = d > 1e-4 ? dx / d : 1;
        const uy = d > 1e-4 ? dy / d : 0;
        a.x -= ux * push;
        b.x += ux * push;
        a.y -= (uy * push) / Y_WEIGHT;
        b.y += (uy * push) / Y_WEIGHT;
        moved = true;
      }
    }
    for (const player of players) {
      player.x = Math.min(bounds.xMax, Math.max(bounds.xMin, player.x));
      player.y = Math.min(bounds.yMax, Math.max(bounds.yMin, player.y));
    }
    if (!moved) break;
  }
}

/** Réexport pratique pour le scanner. */
export { applyOrientation };
