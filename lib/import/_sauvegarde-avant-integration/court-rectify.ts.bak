/**
 * lib/import/court-rectify.ts
 * ---------------------------------------------------------------------------
 * REDRESSEMENT du terrain : photo quelconque → vue de dessus exacte.
 *
 * Pourquoi c'est le maillon décisif
 * ---------------------------------
 * Tout le reste du pipeline (masque des lignes, position du panier, conversion
 * en coordonnées Plaquette) suppose un terrain vu de face, droit, entier. C'est
 * vrai d'une capture d'écran. Ce n'est jamais vrai d'une photo : la fiche est
 * posée de biais, l'appareil est penché, le cadrage est de travers.
 *
 * Un terrain est un PLAN. Deux vues d'un même plan sont reliées par une
 * homographie. Quatre points suffisent donc à annuler d'un coup la perspective,
 * la rotation, l'échelle et le cadrage — et à obtenir une image où un pixel vaut
 * une distance connue en mètres.
 *
 * Comment on trouve ces quatre points
 * -----------------------------------
 *   1. carte des LIGNES (peinture claire sur terrain colorié, encre sombre sur
 *      papier) ;
 *   2. transformée de Hough → les droites dominantes de l'image ;
 *   3. deux familles de droites à peu près perpendiculaires : les touches d'un
 *      côté, les lignes de fond de l'autre ;
 *   4. les droites extrêmes de chaque famille délimitent un quadrilatère.
 *
 * Comment on sait qu'on ne s'est pas trompé
 * -----------------------------------------
 * On ne DEVINE plus le type de terrain ni son orientation : on TESTE. Pour
 * chaque quadrilatère candidat, chaque type (demi / complet) et chacune des
 * quatre rotations, on projette les marquages officiels — raquette, cercle des
 * lancers francs, arc à 3 points, ligne médiane — et on mesure combien tombent
 * réellement sur une ligne de l'image. La bonne hypothèse est celle qui colle.
 * Une hypothèse qui ne colle pas est rejetée, et le pipeline retombe alors sur
 * l'ancien chemin : jamais moins bien qu'avant.
 */

import type { AiRect } from "./types";
import { strokeCourtLines, saturationOf, type CourtKind } from "./court-geometry";
import {
  applyHomography,
  intersect,
  isConvex,
  orderQuad,
  polygonArea,
  solveHomography,
  type Line,
  type Matrix3,
  type Point,
} from "./homography";

/** Taille de travail pour la détection de droites. Au-delà, coût inutile. */
const WORK_LONG_SIDE = 640;

/** Largeur du terrain redressé, en pixels (15 m). */
const OUTPUT_COURT_WIDTH = { half: 900, full: 620 } as const;

/** Marge conservée autour du terrain : un joueur peut être posé sur la touche. */
const OUTPUT_MARGIN = 0.06;

/**
 * Trois niveaux, jamais un seul seuil :
 *   - haute   : on redresse et on fait confiance ;
 *   - moyenne : on redresse MAIS on prévient l'utilisateur, et l'orchestrateur
 *               garde le droit de revenir à l'ancien moteur si le résultat est
 *               plus pauvre ;
 *   - en deçà : on ne redresse pas du tout.
 * Une homographie douteuse ne doit jamais dégrader un cas qui marchait.
 */
export const RECTIFY_CONFIDENCE_HIGH = 0.6;
export const RECTIFY_CONFIDENCE_MEDIUM = 0.42;

/** @deprecated conservé pour les appels existants. */
export const MIN_RECTIFY_SCORE = RECTIFY_CONFIDENCE_MEDIUM;

/** Boîte englobante d'un quadrilatère, en pixels de l'image source. */
export function quadBounds(quad: Point[]): AiRect {
  return {
    x0: Math.min(...quad.map((p) => p.x)),
    y0: Math.min(...quad.map((p) => p.y)),
    x1: Math.max(...quad.map((p) => p.x)),
    y1: Math.max(...quad.map((p) => p.y)),
  };
}

export type Rectified = {
  /** Terrain redressé, marge comprise. */
  canvas: HTMLCanvasElement;
  /** Aire de jeu dans ce canvas (le terrain sans la marge). */
  play: AiRect;
  kind: CourtKind;
  /** Note finale (0..1) : marquages retrouvés × répartition × couverture. */
  score: number;
  /** Part des marquages officiels retrouvés, sans pondération. */
  markings: number;
  /** Part des lignes de l'image contenues dans le quadrilatère retenu. */
  coverage: number;
  /** Nombre de zones du terrain où des marquages ont été retrouvés. */
  spread: number;
  /** Niveau de confiance, qui décide de la suite. */
  level: "haute" | "moyenne";
  /** Quadrilatère retenu, en pixels de l'image SOURCE. */
  quad: Point[];
  linesFound: number;
  quadsTested: number;
  /** Homographie « terrain normalisé (0..1) → pixels de l'image source ». */
  matrix: Matrix3;
  reasons: string[];
};

/* -------------------------------------------------------------------------- */
/* 1. Carte des lignes                                                        */
/* -------------------------------------------------------------------------- */

type LineMap = {
  data: Uint8Array;
  w: number;
  h: number;
  /** pixels de travail → pixels source : x_source = x_work / scale + offsetX */
  scale: number;
  offsetX: number;
  offsetY: number;
  paper: boolean;
  density: number;
};

/**
 * Deux régimes possibles, et on ne peut pas les deviner de façon fiable : sur
 * une PHOTO, la table, la nappe ou le mur autour de la fiche faussent la
 * luminance médiane et font passer un terrain colorié pour du papier. On
 * construit donc les deux cartes et c'est le SCORE final qui tranche.
 */
function insideQuad(quad: Point[], x: number, y: number): boolean {
  const sign = polygonArea(quad) > 0 ? 1 : -1;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross * sign < 0) return false;
  }
  return true;
}

function buildLineMap(
  source: HTMLCanvasElement,
  region: AiRect | undefined,
  mode: "light" | "dark",
  exclude?: Point[][]
): LineMap | null {
  const x0 = Math.max(0, Math.floor(region?.x0 ?? 0));
  const y0 = Math.max(0, Math.floor(region?.y0 ?? 0));
  const rw = Math.min(source.width - x0, Math.round((region?.x1 ?? source.width) - x0));
  const rh = Math.min(source.height - y0, Math.round((region?.y1 ?? source.height) - y0));
  if (rw < 40 || rh < 40) return null;

  const scale = Math.min(1, WORK_LONG_SIDE / Math.max(rw, rh));
  const w = Math.max(8, Math.round(rw * scale));
  const h = Math.max(8, Math.round(rh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, x0, y0, rw, rh, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;

  // Seuil LOCAL et non global. Une photo prise à la main a toujours un dégradé
  // d'éclairage : avec un seuil global, la ligne de touche du côté sombre passe
  // sous le seuil et disparaît — et c'est justement un des quatre points dont on
  // a besoin. On compare donc chaque pixel à la médiane de son voisinage.
  const luminance = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    luminance[i] = (pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2]) / 3;
  }

  const cell = Math.max(10, Math.round(Math.min(w, h) / 12));
  const cw = Math.max(1, Math.ceil(w / cell));
  const ch = Math.max(1, Math.ceil(h / cell));
  const local = new Float32Array(cw * ch);
  const step = Math.max(1, Math.round(cell / 6));
  for (let cy = 0; cy < ch; cy += 1) {
    for (let cx = 0; cx < cw; cx += 1) {
      const x0 = Math.max(0, (cx - 1) * cell);
      const y0 = Math.max(0, (cy - 1) * cell);
      const x1 = Math.min(w, (cx + 2) * cell);
      const y1 = Math.min(h, (cy + 2) * cell);
      const values: number[] = [];
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) values.push(luminance[y * w + x]);
      }
      values.sort((a, b) => a - b);
      local[cy * cw + cx] = values.length ? values[values.length >> 1] : 128;
    }
  }

  const paper = mode === "dark";
  const data = new Uint8Array(w * h);
  let hits = 0;
  for (let y = 0; y < h; y += 1) {
    const cy = Math.min(ch - 1, Math.floor(y / cell));
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const reference = local[cy * cw + Math.min(cw - 1, Math.floor(x / cell))];
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      const line = paper
        ? luminance[i] < reference - 42
        : luminance[i] > reference + 26 && saturationOf(r, g, b) < 0.42;
      if (line) {
        data[i] = 1;
        hits += 1;
      }
    }
  }

  // Terrains déjà retenus : on efface leurs lignes de la carte, sinon le second
  // passage retrouve le premier terrain au lieu du suivant.
  if (exclude?.length) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!data[y * w + x]) continue;
        const sx = x / scale + x0;
        const sy = y / scale + y0;
        if (exclude.some((quad) => insideQuad(quad, sx, sy))) data[y * w + x] = 0;
      }
    }
  }

  // Une LIGNE est fine. Un aplat ne l'est pas.
  // Sans ce filtre, la table sous la feuille, le parquet ou la raquette pleine
  // entrent dans la carte des lignes et Hough y trouve des droites qui n'existent
  // pas — c'est ainsi qu'on redresse le bord de la feuille au lieu du terrain.
  const thinned = keepThinStrokes(data, w, h);
  let kept = 0;
  for (let i = 0; i < thinned.length; i += 1) if (thinned[i]) kept += 1;
  void hits;

  return {
    data: thinned,
    w,
    h,
    scale,
    offsetX: x0,
    offsetY: y0,
    paper,
    density: kept / (w * h),
  };
}

/**
 * Ne garde que les pixels appartenant à un trait fin : ceux dont le voisinage
 * n'est pas majoritairement rempli. Image intégrale, donc coût constant par
 * pixel quelle que soit la taille de la fenêtre.
 */
function keepThinStrokes(data: Uint8Array, w: number, h: number): Uint8Array {
  const radius = Math.max(2, Math.round(Math.min(w, h) / 90));
  const integral = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < w; x += 1) {
      rowSum += data[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }

  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x += 1) {
      if (!data[y * w + x]) continue;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      if (sum <= area * 0.55) out[y * w + x] = 1;
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 2. Transformée de Hough                                                    */
/* -------------------------------------------------------------------------- */

const THETA_STEPS = 180;
const RHO_STEP = 2;

function houghLines(map: LineMap, maxLines = 32): Line[] {
  const diagonal = Math.ceil(Math.hypot(map.w, map.h));
  const rhoOffset = Math.ceil(diagonal / RHO_STEP);
  const rhoBins = rhoOffset * 2 + 1;
  const accumulator = new Int32Array(THETA_STEPS * rhoBins);

  const cos = new Float64Array(THETA_STEPS);
  const sin = new Float64Array(THETA_STEPS);
  for (let t = 0; t < THETA_STEPS; t += 1) {
    const theta = (t * Math.PI) / THETA_STEPS;
    cos[t] = Math.cos(theta);
    sin[t] = Math.sin(theta);
  }

  // Sous-échantillonnage si la carte est très dense : on ne perd pas de droite,
  // on économise du temps.
  const stride = map.density > 0.12 ? 2 : 1;
  for (let y = 0; y < map.h; y += stride) {
    for (let x = 0; x < map.w; x += stride) {
      if (!map.data[y * map.w + x]) continue;
      for (let t = 0; t < THETA_STEPS; t += 1) {
        const rho = Math.round((x * cos[t] + y * sin[t]) / RHO_STEP) + rhoOffset;
        if (rho < 0 || rho >= rhoBins) continue;
        accumulator[t * rhoBins + rho] += 1;
      }
    }
  }

  let peak = 0;
  for (let i = 0; i < accumulator.length; i += 1) if (accumulator[i] > peak) peak = accumulator[i];
  if (peak < 12) return [];

  const minimum = Math.max(12, peak * 0.22);
  const found: Line[] = [];
  const taken = new Uint8Array(accumulator.length);

  // Extraction des maxima locaux, du plus fort au plus faible.
  const order: number[] = [];
  for (let i = 0; i < accumulator.length; i += 1) if (accumulator[i] >= minimum) order.push(i);
  order.sort((a, b) => accumulator[b] - accumulator[a]);

  for (const index of order) {
    if (found.length >= maxLines) break;
    if (taken[index]) continue;
    const t = Math.floor(index / rhoBins);
    const r = index - t * rhoBins;

    // Suppression des non-maxima autour du pic.
    for (let dt = -4; dt <= 4; dt += 1) {
      const tt = (t + dt + THETA_STEPS) % THETA_STEPS;
      for (let dr = -5; dr <= 5; dr += 1) {
        const rr = r + dr;
        if (rr < 0 || rr >= rhoBins) continue;
        taken[tt * rhoBins + rr] = 1;
      }
    }

    found.push({
      theta: (t * Math.PI) / THETA_STEPS,
      rho: (r - rhoOffset) * RHO_STEP,
      weight: accumulator[index],
    });
  }

  return found;
}

/** Écart angulaire entre deux droites, modulo π. */
function angleGap(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/**
 * Sépare les droites en deux familles à peu près perpendiculaires : les lignes
 * de touche d'un côté, les lignes de fond de l'autre.
 */
function splitFamilies(lines: Line[]): { a: Line[]; b: Line[] } | null {
  if (lines.length < 4) return null;
  const reference = lines[0].theta;
  const a: Line[] = [];
  const b: Line[] = [];
  for (const line of lines) {
    const gap = angleGap(line.theta, reference);
    if (gap < 0.52) a.push(line); // < 30°
    else if (gap > 1.05) b.push(line); // > 60°
  }
  if (a.length < 2 || b.length < 2) return null;
  return { a, b };
}

/** Distance signée d'une droite au centre de l'image : sert à trier les côtés. */
function signedOffset(line: Line, cx: number, cy: number): number {
  return line.rho - (cx * Math.cos(line.theta) + cy * Math.sin(line.theta));
}

/** Les droites les plus extrêmes de chaque côté d'une famille. */
function extremes(family: Line[], cx: number, cy: number, depth: number): { low: Line[]; high: Line[] } {
  const sorted = [...family].sort((p, q) => signedOffset(p, cx, cy) - signedOffset(q, cx, cy));
  return {
    low: sorted.slice(0, depth),
    high: sorted.slice(Math.max(0, sorted.length - depth)).reverse(),
  };
}

/* -------------------------------------------------------------------------- */
/* 3. Marquages officiels servant de preuve                                   */
/* -------------------------------------------------------------------------- */

const featureCache = new Map<CourtKind, Point[]>();

/**
 * Points d'un terrain officiel, en coordonnées normalisées (0..1 sur la largeur
 * et sur la longueur), BORDURE EXCLUE.
 *
 * On exclut la bordure parce qu'elle coïncide avec le quadrilatère testé : elle
 * collerait toujours et ne prouverait rien. Ce sont la raquette, le cercle des
 * lancers francs, l'arc à 3 points et la médiane qui distinguent un demi-terrain
 * d'un terrain complet, et le haut du bas.
 *
 * Les points sont produits par le MÊME tracé que le masque des lignes
 * (strokeCourtLines) : une seule source de vérité géométrique.
 */
function idealFeaturePoints(kind: CourtKind): Point[] {
  const cached = featureCache.get(kind);
  if (cached) return cached;

  const width = 160;
  const height = Math.round((width * (kind === "full" ? 28 : 14)) / 15);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  ctx.clearRect(0, 0, width, height);
  strokeCourtLines(ctx, width, height, kind, 1.4);
  const data = ctx.getImageData(0, 0, width, height).data;

  const points: Point[] = [];
  const border = 0.045;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 40) continue;
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      if (u < border || u > 1 - border || v < border || v > 1 - border) continue;
      points.push({ x: u, y: v });
    }
  }

  // Échantillonnage régulier : ~420 points suffisent et bornent le coût.
  const target = 420;
  const sampled = points.length > target
    ? points.filter((_p, i) => i % Math.ceil(points.length / target) === 0)
    : points;

  featureCache.set(kind, sampled);
  return sampled;
}

/* -------------------------------------------------------------------------- */
/* 4. Notation d'une hypothèse                                                */
/* -------------------------------------------------------------------------- */

const CANONICAL_CORNERS: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Le point (x,y) tombe-t-il sur une ligne, à `radius` près ? */
function hitsLine(map: LineMap, x: number, y: number, radius: number): boolean {
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -radius; dy <= radius; dy += 1) {
    const yy = cy + dy;
    if (yy < 0 || yy >= map.h) continue;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const xx = cx + dx;
      if (xx < 0 || xx >= map.w) continue;
      if (map.data[yy * map.w + xx]) return true;
    }
  }
  return false;
}

const BUCKET_COLS = 3;
const BUCKET_ROWS = 4;

/**
 * Note d'une hypothèse, avec RÉPARTITION obligatoire.
 *
 * Piège n° 4 : une homographie fausse peut obtenir un score global élevé si tous
 * les marquages projetés tombent par hasard sur un même paquet de pixels — un
 * bord de feuille bien contrasté, une zone hachurée, un aplat de texte. On
 * découpe donc le terrain en 12 zones et on exige que les marquages soient
 * retrouvés DANS PLUSIEURS zones. La note retenue est la moyenne des taux par
 * zone, pas le taux global : une seule zone parfaite ne peut plus porter le
 * score à elle seule.
 */
function scoreHypothesis(
  map: LineMap,
  quad: Point[],
  kind: CourtKind,
  rotation: number
): { score: number; markings: number; spread: number; matrix: Matrix3 } | null {
  const corners = [0, 1, 2, 3].map((i) => quad[(i + rotation) % 4]);
  const matrix = solveHomography(CANONICAL_CORNERS, corners);
  if (!matrix) return null;

  const features = idealFeaturePoints(kind);
  if (!features.length) return null;

  const radius = Math.max(1, Math.round(Math.min(map.w, map.h) / 180));
  const bucketHits = new Int32Array(BUCKET_COLS * BUCKET_ROWS);
  const bucketTotal = new Int32Array(BUCKET_COLS * BUCKET_ROWS);
  let hits = 0;
  let inside = 0;

  for (const feature of features) {
    const p = applyHomography(matrix, feature);
    if (p.x < -2 || p.y < -2 || p.x > map.w + 2 || p.y > map.h + 2) continue;
    inside += 1;
    const bx = Math.min(BUCKET_COLS - 1, Math.floor(feature.x * BUCKET_COLS));
    const by = Math.min(BUCKET_ROWS - 1, Math.floor(feature.y * BUCKET_ROWS));
    const bucket = by * BUCKET_COLS + bx;
    bucketTotal[bucket] += 1;
    if (hitsLine(map, p.x, p.y, radius)) {
      hits += 1;
      bucketHits[bucket] += 1;
    }
  }

  // Une hypothèse qui projette la moitié du terrain hors de l'image ne prouve
  // rien : on la refuse plutôt que de la noter sur ce qui reste.
  if (inside < features.length * 0.6) return null;

  // PIÈGE : deux demi-terrains côte à côte sur une page forment, ensemble, un
  // rectangle de proportions plausibles pour un terrain complet — et la
  // « ligne médiane » tombe alors dans le blanc qui les sépare. On exige donc
  // que la bande CENTRALE porte réellement des marquages avant d'accepter un
  // terrain complet.
  if (kind === "full") {
    let centreHits = 0;
    let centreTotal = 0;
    for (let row = 1; row <= 2; row += 1) {
      for (let col = 0; col < BUCKET_COLS; col += 1) {
        const bucket = row * BUCKET_COLS + col;
        centreHits += bucketHits[bucket];
        centreTotal += bucketTotal[bucket];
      }
    }
    if (centreTotal < 12 || centreHits / centreTotal < 0.4) return null;
  }

  let sum = 0;
  let used = 0;
  let spread = 0;
  for (let i = 0; i < bucketTotal.length; i += 1) {
    if (bucketTotal[i] < 6) continue;
    const rate = bucketHits[i] / bucketTotal[i];
    sum += rate;
    used += 1;
    if (rate >= 0.35) spread += 1;
  }
  if (used < 5) return null;
  if (spread < Math.max(3, Math.ceil(used * 0.5))) return null;

  return { score: sum / used, markings: hits / inside, spread, matrix };
}

/**
 * Note de marquages d'un terrain SUPPOSÉ DROIT (chemin classique, sans
 * homographie). Même preuve que pour le redressement : on projette les
 * marquages officiels dans le rectangle donné et on compte ceux qui tombent sur
 * une ligne réelle.
 *
 * C'est ce qui distingue un vrai terrain d'une feuille de papier posée sur une
 * table : une feuille a bien quatre bords, mais rien à l'intérieur.
 */
export function courtMarkingScore(
  source: HTMLCanvasElement,
  play: AiRect,
  kind: CourtKind
): number {
  const corners: Point[] = [
    { x: play.x0, y: play.y0 },
    { x: play.x1, y: play.y0 },
    { x: play.x1, y: play.y1 },
    { x: play.x0, y: play.y1 },
  ];
  let best = 0;
  for (const mode of ["light", "dark"] as const) {
    const map = buildLineMap(source, undefined, mode);
    if (!map) continue;
    const scaled = corners.map((corner) => ({
      x: (corner.x - map.offsetX) * map.scale,
      y: (corner.y - map.offsetY) * map.scale,
    }));
    const matrix = solveHomography(CANONICAL_CORNERS, scaled);
    if (!matrix) continue;
    const features = idealFeaturePoints(kind);
    if (!features.length) continue;
    const radius = Math.max(1, Math.round(Math.min(map.w, map.h) / 180));
    let hits = 0;
    let inside = 0;
    for (const feature of features) {
      const p = applyHomography(matrix, feature);
      if (p.x < -2 || p.y < -2 || p.x > map.w + 2 || p.y > map.h + 2) continue;
      inside += 1;
      if (hitsLine(map, p.x, p.y, radius)) hits += 1;
    }
    if (inside >= features.length * 0.6) best = Math.max(best, hits / inside);
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* 5. Rééchantillonnage                                                       */
/* -------------------------------------------------------------------------- */

function warp(source: HTMLCanvasElement, matrix: Matrix3, kind: CourtKind): { canvas: HTMLCanvasElement; play: AiRect } | null {
  const courtW = OUTPUT_COURT_WIDTH[kind];
  const courtH = Math.round((courtW * (kind === "full" ? 28 : 14)) / 15);
  const margin = Math.round(courtW * OUTPUT_MARGIN);
  const width = courtW + margin * 2;
  const height = courtH + margin * 2;

  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) return null;
  const src = sourceCtx.getImageData(0, 0, source.width, source.height);
  const sw = source.width;
  const sh = source.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const out = ctx.createImageData(width, height);

  const [a, b, c, d, e, f, g, h, i] = matrix;

  for (let py = 0; py < height; py += 1) {
    const v = (py + 0.5 - margin) / courtH;
    for (let px = 0; px < width; px += 1) {
      const u = (px + 0.5 - margin) / courtW;
      const w = g * u + h * v + i;
      const target = (py * width + px) * 4;
      if (Math.abs(w) < 1e-9) {
        out.data[target + 3] = 255;
        continue;
      }
      const sx = (a * u + b * v + c) / w;
      const sy = (d * u + e * v + f) / w;

      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
        // Hors de la photo : blanc neutre, jamais interprété comme de l'encre.
        out.data[target] = 255;
        out.data[target + 1] = 255;
        out.data[target + 2] = 255;
        out.data[target + 3] = 255;
        continue;
      }

      // Interpolation bilinéaire : sans elle, un agrandissement crée des marches
      // que la détection de composantes prend pour des tracés.
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const top = src.data[i00 + channel] * (1 - fx) + src.data[i10 + channel] * fx;
        const bottom = src.data[i01 + channel] * (1 - fx) + src.data[i11 + channel] * fx;
        out.data[target + channel] = top * (1 - fy) + bottom * fy;
      }
      out.data[target + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  return {
    canvas,
    play: { x0: margin, y0: margin, x1: margin + courtW, y1: margin + courtH },
  };
}

/* -------------------------------------------------------------------------- */
/* 6. Point d'entrée                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Redresse le terrain contenu dans l'image (ou dans `region`).
 * Renvoie null si aucune hypothèse ne tient : l'appelant doit alors garder son
 * chemin habituel.
 */
export function rectifyCourt(
  source: HTMLCanvasElement,
  region?: AiRect,
  trace?: (reasons: string[]) => void,
  exclude?: Point[][]
): Rectified | null {
  const reasons: string[] = [];
  const give = <T>(value: T): T => {
    trace?.(reasons);
    return value;
  };
  let best: Hypothesis | null = null;
  let bestMap: LineMap | null = null;

  for (const mode of ["light", "dark"] as const) {
    const map = buildLineMap(source, region, mode, exclude);
    if (!map) continue;
    const label = mode === "light" ? "peinture claire" : "encre sombre";
    reasons.push(`${label} : ${(map.density * 100).toFixed(1)} % de la zone`);
    if (map.density < 0.002 || map.density > 0.5) {
      reasons.push(`${label} — densité hors plage exploitable`);
      continue;
    }
    const candidate = searchBestHypothesis(map, reasons, label);
    if (candidate && (!best || candidate.score > best.score)) {
      best = candidate;
      bestMap = map;
    }
  }

  if (!best || !bestMap) {
    reasons.push("aucune hypothèse plausible");
    return give(null);
  }
  reasons.push(
    `retenu : ${best.kind} — note ${(best.score * 100).toFixed(0)} % ` +
      `(marquages ${(best.raw * 100).toFixed(0)} %, réparties sur ${best.spread} zones, ` +
      `lignes couvertes ${(best.contained * 100).toFixed(0)} %)`
  );
  if (best.score < RECTIFY_CONFIDENCE_MEDIUM) {
    reasons.push("confiance faible → on garde la détection classique, sans rien redresser");
    return give(null);
  }
  const level: "haute" | "moyenne" = best.score >= RECTIFY_CONFIDENCE_HIGH ? "haute" : "moyenne";
  if (level === "moyenne") {
    reasons.push("confiance moyenne → redressement utilisé, mais résultat à confirmer");
  }

  const map = bestMap;

  // L'homographie a été calculée en pixels de travail : on la recalcule en
  // pixels de l'image source, sinon le rééchantillonnage tire dans le vide.
  const toSource = (point: Point): Point => ({
    x: point.x / map.scale + map.offsetX,
    y: point.y / map.scale + map.offsetY,
  });
  const sourceCorners = CANONICAL_CORNERS.map((corner) => toSource(applyHomography(best!.matrix, corner)));
  const sourceMatrix = solveHomography(CANONICAL_CORNERS, sourceCorners);
  if (!sourceMatrix) {
    reasons.push("homographie source dégénérée");
    return give(null);
  }

  const warped = warp(source, sourceMatrix, best.kind);
  if (!warped) {
    reasons.push("rééchantillonnage impossible");
    return give(null);
  }

  return give({
    canvas: warped.canvas,
    play: warped.play,
    kind: best.kind,
    score: best.score,
    markings: best.raw,
    coverage: best.contained,
    spread: best.spread,
    level,
    quad: sourceCorners,
    linesFound: best.linesFound,
    quadsTested: best.quadsTested,
    matrix: sourceMatrix,
    reasons,
  });
}

type Hypothesis = {
  score: number;
  matrix: Matrix3;
  kind: CourtKind;
  quad: Point[];
  contained: number;
  raw: number;
  spread: number;
  linesFound: number;
  quadsTested: number;
};

/** Échantillon des pixels de ligne, pour mesurer ce qu'un quadrilatère contient. */
function sampleLinePixels(map: LineMap, target = 2500): Point[] {
  const all: Point[] = [];
  for (let y = 0; y < map.h; y += 1) {
    for (let x = 0; x < map.w; x += 1) {
      if (map.data[y * map.w + x]) all.push({ x, y });
    }
  }
  if (all.length <= target) return all;
  const stride = Math.ceil(all.length / target);
  return all.filter((_p, i) => i % stride === 0);
}

/**
 * Part des lignes de l'image contenue dans le quadrilatère.
 *
 * Sans ce garde-fou, la RAQUETTE gagne : c'est un rectangle parfait, tous les
 * marquages qu'on y projette tombent sur des lignes, score 100 % — et on
 * redresse un bout de terrain au lieu du terrain. Le vrai terrain, lui, contient
 * la quasi-totalité des lignes de l'image.
 */
function coverage(quad: Point[], pixels: Point[]): number {
  if (!pixels.length) return 0;
  const sign = polygonArea(quad) > 0 ? 1 : -1;
  let inside = 0;
  for (const p of pixels) {
    let ok = true;
    for (let i = 0; i < 4 && ok; i += 1) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (cross * sign < -2) ok = false;
    }
    if (ok) inside += 1;
  }
  return inside / pixels.length;
}

/** Recherche du meilleur quadrilatère + type + rotation pour une carte donnée. */
function searchBestHypothesis(map: LineMap, reasons: string[], label: string): Hypothesis | null {
  const lines = houghLines(map);
  const families = splitFamilies(lines);
  if (!families) {
    reasons.push(`${label} — ${lines.length} droites, pas deux familles perpendiculaires`);
    return null;
  }

  const cx = map.w / 2;
  const cy = map.h / 2;
  const familyA = extremes(families.a, cx, cy, 5);
  const familyB = extremes(families.b, cx, cy, 5);

  const minSide = Math.min(map.w, map.h) * 0.16;
  const minArea = map.w * map.h * 0.05;
  const linePixels = sampleLinePixels(map);

  let best: Hypothesis | null = null;
  let tested = 0;

  for (const a0 of familyA.low) {
    for (const a1 of familyA.high) {
      if (a0 === a1) continue;
      for (const b0 of familyB.low) {
        for (const b1 of familyB.high) {
          if (b0 === b1) continue;

          const corners = [intersect(a0, b0), intersect(a0, b1), intersect(a1, b1), intersect(a1, b0)];
          if (corners.some((point) => !point)) continue;
          const quad = orderQuad(corners as Point[]);
          if (!isConvex(quad)) continue;
          if (Math.abs(polygonArea(quad)) < minArea) continue;

          let shortest = Infinity;
          for (let i = 0; i < 4; i += 1) {
            const p = quad[i];
            const q = quad[(i + 1) % 4];
            shortest = Math.min(shortest, Math.hypot(q.x - p.x, q.y - p.y));
          }
          if (shortest < minSide) continue;

          // Un quadrilatère qui ne contient qu'une partie des lignes n'est pas
          // le terrain : c'est un de ses éléments (raquette, cercle, cadre).
          const contained = coverage(quad, linePixels);
          // Seuil bas ET pondération dans la note : une raquette (≈ 15 % des
          // lignes) reste écartée, mais UN terrain parmi DEUX sur la même page
          // n'en contient qu'environ la moitié — un seuil à 0.55 l'éliminait
          // aussi, et la page entière repartait en « terrain complet ».
          if (contained < 0.3) continue;

          for (const kind of ["half", "full"] as CourtKind[]) {
            for (let rotation = 0; rotation < 4; rotation += 1) {
              const result = scoreHypothesis(map, quad, kind, rotation);
              tested += 1;
              if (!result) continue;
              // On maximise « marquages retrouvés × lignes couvertes » : les deux
              // comptent, et l'un sans l'autre se fait piéger.
              // Un TERRAIN COMPLET est symétrique par rotation de 180° : les
              // marquages ne peuvent pas départager le haut du bas, et le
              // schéma sortait à l'envers une fois sur deux. À note égale, on
              // conserve donc l'orientation de la photo — c'est ce que
              // l'utilisateur s'attend à revoir. Le biais est minuscule : il ne
              // départage que les quasi-égalités.
              const orientationBias = 1 - rotation * 0.004;
              const combined = result.score * (0.6 + 0.4 * contained) * orientationBias;
              if (!best || combined > best.score) {
                best = {
                  score: combined,
                  matrix: result.matrix,
                  kind,
                  quad,
                  contained,
                  raw: result.markings,
                  spread: result.spread,
                  linesFound: lines.length,
                  quadsTested: 0,
                };
              }
            }
          }
        }
      }
    }
  }

  if (best) best.quadsTested = tested;
  reasons.push(
    `${label} — ${lines.length} droites, ${tested} hypothèses testées` +
      (best
        ? `, meilleure ${(best.raw * 100).toFixed(0)} % marquages × ${(best.contained * 100).toFixed(0)} % lignes (${best.kind}) quad=${best.quad
            .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
            .join(" ")}`
        : ", aucune retenue")
  );
  return best;
}
