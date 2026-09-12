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
import { strokeCourtLines, saturationOf, findPaintSides, readPixels, type CourtKind } from "./court-geometry";
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

/*
 * SECOND TERRAIN DU CAS 02 — deux corrections mesurées, aucune retenue.
 *
 * Les deux atteignent la cible (schémas 1/2 → 2/2) mais chacune casse autre
 * chose. Elles sont conservées, complètes et rejouables, derrière ces deux
 * drapeaux ; la référence les laisse à `false`.
 *
 *   CURVED_ON_RAW_MAP — noter les COURBES sur la carte brute et les DROITES sur
 *     la carte amincie, au lieu de tout demander à la carte amincie.
 *       gain   : cas 02 marquages du second terrain 38 % → 43 %, attaquants 4 → 9
 *       coût   : cas 02 défenseurs 2 → 0 et faux positifs joueurs 0 → 2
 *     Le cadre du PREMIER terrain change aussi (marquages 64 % → 88 %), donc le
 *     recadrage change, et les défenseurs n'y survivent pas. Le cas 02 n'ayant
 *     pas de vérité de position, on ne peut pas dire si le nouveau cadre est
 *     géométriquement meilleur : il faudrait relever ses positions à la main.
 *
 *   REFINE_ENABLED — affinage local de l'hypothèse retenue (voir refineQuad).
 *       gain   : cas 02 schémas 1/2 → 2/2, joueurs 10 → 14, attaquants 4 → 8
 *       coût   : cas 01 détruit — Plaquette 5/10 → 1/10, erreur des touches
 *                0,026 m → 1,908 m, ligne de fond 0,021 m → 1,066 m
 *     Cause mesurée : le terrain du cas 01 est COUPÉ en bas et sa détection
 *     classique est excellente. L'affinage fait monter un cadre faux au-dessus
 *     du seuil d'acceptation, le redressement prend la main et place le terrain
 *     de travers. Plafonner la confiance d'une hypothèse affinée à « moyenne »
 *     (fait, voir plus bas) ne suffit pas : l'orchestrateur accepte quand même.
 *     Le vrai correctif est ailleurs — quand la détection classique est forte et
 *     mesurablement meilleure, le redressement ne doit pas lui passer devant.
 */
const CURVED_ON_RAW_MAP = false;
const REFINE_ENABLED = false;

/**
 * SECOND CHEMIN D'ACCEPTATION, fondé sur la géométrie plutôt que sur le nombre
 * de zones tenues. Voir `scoreHypothesis` pour les quatre conditions et les
 * mesures qui les fondent. Le chemin historique, lui, n'est pas modifié.
 */
const STRONG_GEOMETRY_PATH = true;

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
  /**
   * Le terrain est-il coupé, et de quel côté ? Renseigné seulement quand
   * `TRUNCATED_COURT_DETECTION` est actif. Information descriptive : aucune
   * géométrie n'en dépend.
   */
  truncation?: CourtTruncation;
  reasons: string[];
};

/* -------------------------------------------------------------------------- */
/* 1. Carte des lignes                                                        */
/* -------------------------------------------------------------------------- */

type LineMap = {
  /**
   * Carte AMINCIE : seuls les pixels appartenant à un trait fin. C'est elle qui
   * sert à Hough et aux DROITES — sans elle, la table sous la feuille ou une
   * raquette pleine fournissent des droites qui n'existent pas.
   */
  data: Uint8Array;
  /**
   * Carte BRUTE, avant amincissement. Les courbes y survivent : mesuré sur le
   * second terrain du cas 02, l'amincissement fait tomber le cercle restrictif
   * de 91 % à 0 % et la raquette de 88 % à 39 %. On ne demande donc plus à une
   * seule carte de tout porter.
   */
  raw: Uint8Array;
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
    raw: data,
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
/**
 * Hypothèses à TROIS droites (deux touches + ligne de fond, la profondeur étant
 * déduite des proportions du terrain).
 *
 * Elles existent parce qu'un terrain COUPÉ par le cadrage ne peut pas être
 * décrit par quatre droites : la quatrième n'est pas dans le dessin. Elles ne
 * régressent rien, mais elles n'ont encore apporté AUCUN gain mesuré, et elles
 * coûtent cher : la batterie synthétique passe de 43 s à 58 s, soit un tiers de
 * temps en plus sur le fil principal du navigateur.
 *
 * Conservées parce que la lacune qu'elles comblent est réelle et démontrée ;
 * à retirer si le gain ne se matérialise pas sur les prochains cas réels.
 */
const DEDUCE_ENABLED = true;
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

const featureCache = new Map<CourtKind, FeaturePoint[]>();

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
type FeaturePoint = Point & {
  /**
   * `true` si le point appartient à une COURBE (cercles, arc à 3 points). Ces
   * marquages doivent être cherchés dans la carte BRUTE : l'amincissement les
   * détruit. Les droites, elles, restent notées sur la carte amincie.
   */
  curved: boolean;
  /** `true` si le point appartient à la RAQUETTE — preuve structurelle. */
  key: boolean;
};

function idealFeaturePoints(kind: CourtKind): FeaturePoint[] {
  const cached = featureCache.get(kind);
  if (cached) return cached;

  const width = 160;
  const height = Math.round((width * (kind === "full" ? 28 : 14)) / 15);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  // Deux rendus issus de LA MÊME géométrie : on ne recopie pas les cotes.
  ctx.clearRect(0, 0, width, height);
  strokeCourtLines(ctx, width, height, kind, 1.4, "curved");
  const curvedMask = ctx.getImageData(0, 0, width, height).data;

  ctx.clearRect(0, 0, width, height);
  strokeCourtLines(ctx, width, height, kind, 1.4, "key");
  const keyMask = ctx.getImageData(0, 0, width, height).data;

  ctx.clearRect(0, 0, width, height);
  strokeCourtLines(ctx, width, height, kind, 1.4);
  const data = ctx.getImageData(0, 0, width, height).data;

  const points: FeaturePoint[] = [];
  const border = 0.045;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4 + 3;
      if (data[at] < 40) continue;
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      if (u < border || u > 1 - border || v < border || v > 1 - border) continue;
      points.push({ x: u, y: v, curved: curvedMask[at] >= 40, key: keyMask[at] >= 40 });
    }
  }

  // Échantillonnage régulier : ~420 points suffisent et bornent le coût.
  const target = 420;
  const sampled: FeaturePoint[] = points.length > target
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
function hitsLine(map: LineMap, x: number, y: number, radius: number, curved = false): boolean {
  // Les COURBES sont cherchées dans la carte brute, les DROITES dans la carte
  // amincie. Demander les deux à la même carte coûtait le cercle restrictif en
  // entier (91 % → 0 %) et la moitié de la raquette (88 % → 39 %).
  const plane = CURVED_ON_RAW_MAP && curved ? map.raw : map.data;
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let dy = -radius; dy <= radius; dy += 1) {
    const yy = cy + dy;
    if (yy < 0 || yy >= map.h) continue;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const xx = cx + dx;
      if (xx < 0 || xx >= map.w) continue;
      if (plane[yy * map.w + xx]) return true;
    }
  }
  return false;
}

const BUCKET_COLS = 3;
const BUCKET_ROWS = 4;

/** Proportions réelles, en mètres (FIBA) : profondeur / largeur. */
const COURT_ASPECT: Record<CourtKind, number> = { half: 14 / 15, full: 28 / 15 };

/**
 * CARTE DE VISIBILITÉ — quelles zones de l'image portent réellement un dessin ?
 *
 * Première version : une cellule était « dessinée » dès qu'elle contenait UN
 * pixel de la carte des lignes. Mesuré sur le cas 02 : la moitié basse de la
 * page, vide à l'œil, est pleine de grain de papier et de bruit de compression ;
 * elle était donc déclarée visible, les marquages qui y tombaient étaient
 * comptés comme MANQUANTS, et le bon quadrilatère perdait avec 38 % contre 40 %
 * à un cadre entièrement faux mais posé sur la zone dense.
 *
 * On raisonne donc en DENSITÉ, et sur la carte des lignes structurées — pas sur
 * le masque d'encre général. Le seuil n'est pas absolu : il est relatif à ce que
 * pèse une cellule qui porte vraiment un trait dans CETTE image (quantile 0,75
 * des cellules non vides). Du grain reste très en dessous ; une ligne qui
 * traverse une cellule passe largement au-dessus.
 */
function visibilityGrid(map: LineMap): (x: number, y: number) => boolean {
  const OCC = 16;
  const counts = new Int32Array(OCC * OCC);
  for (let y = 0; y < map.h; y += 1) {
    const oy = Math.min(OCC - 1, Math.floor((y / map.h) * OCC));
    for (let x = 0; x < map.w; x += 1) {
      if (!map.data[y * map.w + x]) continue;
      counts[oy * OCC + Math.min(OCC - 1, Math.floor((x / map.w) * OCC))] += 1;
    }
  }
  const area = Math.max(1, (map.w / OCC) * (map.h / OCC));
  const density = new Float64Array(OCC * OCC);
  const nonEmpty: number[] = [];
  for (let i = 0; i < counts.length; i += 1) {
    density[i] = counts[i] / area;
    if (counts[i] > 0) nonEmpty.push(density[i]);
  }
  nonEmpty.sort((a, b) => a - b);
  const reference = nonEmpty.length ? nonEmpty[Math.floor(nonEmpty.length * 0.75)] : 0;
  // 0,004 = plancher absolu : en dessous de 4 pixels pour mille, une cellule ne
  // porte pas de trait, quel que soit le reste de l'image.
  const floor = Math.max(0.004, reference * 0.18);

  const dense = new Uint8Array(OCC * OCC);
  for (let i = 0; i < density.length; i += 1) dense[i] = density[i] >= floor ? 1 : 0;

  return (x: number, y: number): boolean => {
    const ox = Math.floor((x / map.w) * OCC);
    const oy = Math.floor((y / map.h) * OCC);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = ox + dx;
        const ny = oy + dy;
        if (nx < 0 || ny < 0 || nx >= OCC || ny >= OCC) continue;
        if (dense[ny * OCC + nx]) return true;
      }
    }
    return false;
  };
}

/**
 * La grille ne dépend que de la carte des lignes : on la calcule une fois par
 * carte, et non à chaque hypothèse (elles se comptent par milliers).
 */
const visibilityCache = new WeakMap<LineMap, (x: number, y: number) => boolean>();
function memoVisibility(map: LineMap): (x: number, y: number) => boolean {
  let grid = visibilityCache.get(map);
  if (!grid) {
    grid = visibilityGrid(map);
    visibilityCache.set(map, grid);
  }
  return grid;
}

/**
 * COHÉRENCE DE PROFONDEUR — un petit cadre ne doit pas gagner en découpant la
 * partie la plus dense du terrain.
 *
 * Mesuré sur le cas 02 : le cadre gagnant fait 311 × 111 px, soit une
 * profondeur projetée de 0,36 largeur là où un demi-terrain en vaut 0,93. Il
 * prétend donc écraser la profondeur de 62 % — un plan incliné à 68 ° — tout en
 * n'affichant que 5 % d'écart entre son bord haut et son bord bas. Une vraie
 * inclinaison de 68 ° fait converger les bords bien davantage.
 *
 * On ne rejette pas : on PONDÈRE. Une perspective réelle reste acceptée (c'est
 * la demande explicite pour les hypothèses à trois droites), mais un
 * aplatissement que rien dans le quadrilatère ne justifie coûte des points.
 *
 * Le lien utilisé est volontairement grossier et assumé comme tel : sous
 * perspective faible, l'aplatissement vaut cos θ et la convergence des bords de
 * largeur croît comme (profondeur/distance) × sin θ. On exige donc seulement
 * qu'une convergence de l'ordre du quart de sin θ soit visible — ce qui
 * correspond à une prise de vue très éloignée, donc au cas le plus permissif.
 */
function depthCoherence(corners: Point[], kind: CourtKind): number {
  const side = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  const top = side(corners[0], corners[1]);
  const bottom = side(corners[3], corners[2]);
  const left = side(corners[0], corners[3]);
  const right = side(corners[1], corners[2]);
  const width = (top + bottom) / 2;
  const depth = (left + right) / 2;
  if (width <= 0 || depth <= 0) return 1;

  const flatten = depth / width / COURT_ASPECT[kind];

  /*
   * ZONE MORTE — le garde-fou ne doit JAMAIS départager deux cadres presque
   * corrects, seulement écarter une incohérence grossière.
   *
   * Sans elle, mesuré : le classement changeait sur des cadres déjà justes
   * (aplatissement 0,99 contre 1,00) et la batterie synthétique renvoyait deux
   * régressions — « rotation » et « flou » — pour deux progrès ailleurs. Le
   * relevé des 24 cas synthétiques donne un aplatissement compris entre 0,865
   * et 1,079 pour les cadres RETENUS : sous 0,75, on est très au-delà du bruit
   * de détection, et il faut alors une vraie perspective pour le justifier.
   */
  const FLATTEN_FREE = 0.75;
  if (flatten >= FLATTEN_FREE) return 1;

  const longer = Math.max(top, bottom);
  const convergence = longer > 0 ? 1 - Math.min(top, bottom) / longer : 0;
  const excess = flatten / FLATTEN_FREE;
  const sinTilt = Math.sqrt(Math.max(0, 1 - excess * excess));
  const required = 0.25 * sinTilt;

  const MARGIN = 0.08;
  return Math.max(0, Math.min(1, (convergence + MARGIN) / (required + MARGIN)));
}

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
): {
  score: number;
  markings: number;
  spread: number;
  matrix: Matrix3;
  perspective: number;
  visible: number;
  /**
   * Note de GÉOMÉTRIE FORTE, renseignée uniquement quand l'hypothèse est passée
   * par le second chemin. Elle ne vit pas sur la même échelle que la note
   * historique et ne doit jamais lui être comparée directement.
   */
  strong: number | null;
} | null {
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
  // Raquette : comptée à part, elle sert de preuve au second chemin.
  let keyHits = 0;
  let keyTotal = 0;

  /*
   * VISIBILITÉ — un marquage hors du dessin n'est pas un marquage manquant.
   *
   * Un terrain coupé par le bord de la photo n'a ni ligne médiane ni cercle
   * central : ils sont hors cadre. Les compter comme absents condamne le bon
   * quadrilatère. Les marquages tombant dans une zone non dessinée sont donc
   * retirés du calcul — du numérateur ET du dénominateur.
   *
   * « Dessiné » est une question de DENSITÉ, pas de présence : voir
   * `visibilityGrid`, et la mesure qui a imposé ce changement.
   */
  const drawnAt = memoVisibility(map);

  for (const feature of features) {
    const p = applyHomography(matrix, feature);
    if (p.x < -2 || p.y < -2 || p.x > map.w + 2 || p.y > map.h + 2) continue;
    if (!drawnAt(p.x, p.y)) continue;
    inside += 1;
    const bx = Math.min(BUCKET_COLS - 1, Math.floor(feature.x * BUCKET_COLS));
    const by = Math.min(BUCKET_ROWS - 1, Math.floor(feature.y * BUCKET_ROWS));
    const bucket = by * BUCKET_COLS + bx;
    bucketTotal[bucket] += 1;
    if (feature.key) keyTotal += 1;
    if (hitsLine(map, p.x, p.y, radius, feature.curved)) {
      hits += 1;
      bucketHits[bucket] += 1;
      if (feature.key) keyHits += 1;
    }
  }

  // Une hypothèse qui ne garde qu'une poignée de marquages visibles ne prouve
  // rien : on la refuse plutôt que de la noter sur un reste minuscule. Le seuil
  // porte désormais sur ce qui est VISIBLE, pas sur le gabarit complet — sinon
  // un terrain coupé est éliminé d'office, quelle que soit sa justesse.
  if (inside < features.length * 0.35) return null;

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

  /* ------------------------------------------------------------------------ */
  /* DEUX CHEMINS D'ACCEPTATION                                               */
  /* ------------------------------------------------------------------------ */
  /**
   * CHEMIN NORMAL — inchangé : au moins la moitié des zones exploitables
   * doivent tenir. C'est le critère calibré sur des images propres, et il n'est
   * ni assoupli ni remplacé.
   *
   * CHEMIN « GÉOMÉTRIE FORTE » — pour un cadre dont la justesse est prouvée
   * autrement que par le nombre de zones.
   *
   * Pourquoi il existe : mesuré contre une vérité terrain relevée à la main, le
   * bon cadre du second terrain du cas 02 est juste à 21,8 px (IoU 0,91, panier
   * projeté à 4 px) et ne tient pourtant que 3 zones sur 10 — parce que son arc
   * à 3 points est détruit par le moiré et n'existe plus dans l'image. Aucun
   * réglage de carte ne le récupère : on l'a vérifié.
   *
   * Ce que le chemin alternatif exige, et pourquoi c'est plus dur, pas plus
   * facile — relevé des candidats réels du même terrain :
   *
   *   candidat                    coins  aplat.  conv.  zones  raquette
   *   bon cadre                     22    1.03    13%    3/10     74 %
   *   faux cadre le mieux noté     180    0.38     5%    6/10     53 %
   *   faux cadre, carte sombre     206    1.55    49%    5/10     22 %
   *   bon cadre, carte sombre      200    1.42    24%    2/10     14 %
   *
   * Le faux cadre tient PLUS de zones que le bon : un critère de zones, si
   * permissif soit-il, ne les sépare pas. Ce qui les sépare, ce sont les
   * PROPORTIONS — un demi-terrain fait 15 × 14 m, l'aplatissement d'un cadre
   * juste vaut 1 — et la RAQUETTE, le seul marquage qui survive au moiré.
   *
   * Les quatre conditions sont donc cumulatives et indépendantes les unes des
   * autres : proportions justes, perspective plausible, raquette réellement
   * retrouvée, et des preuves réparties dans au moins deux colonnes dont la
   * centrale. Le faux cadre à 180 px échoue sur les proportions (0,38), celui à
   * 206 px sur les proportions ET la perspective, celui à 200 px sur les deux
   * aussi.
   */
  const historique = spread >= Math.max(3, Math.ceil(used * 0.5));
  let fortGeometrique = false;

  if (STRONG_GEOMETRY_PATH && !historique) {
    const side = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
    const top = side(corners[0], corners[1]);
    const bottom = side(corners[3], corners[2]);
    const widthPx = (top + bottom) / 2;
    const depthPx = (side(corners[0], corners[3]) + side(corners[1], corners[2])) / 2;
    const flatten = widthPx > 0 ? depthPx / widthPx / COURT_ASPECT[kind] : 0;
    const longer = Math.max(top, bottom);
    const convergence = longer > 0 ? 1 - Math.min(top, bottom) / longer : 1;

    // Colonnes portant au moins une zone forte.
    const colonne = [0, 1, 2].map((col) =>
      [0, 1, 2, 3].some((row) => {
        const bucket = row * BUCKET_COLS + col;
        return bucketTotal[bucket] >= 6 && bucketHits[bucket] / bucketTotal[bucket] >= 0.35;
      })
    );

    const keyRate = keyTotal > 0 ? keyHits / keyTotal : 0;

    fortGeometrique =
      Math.abs(flatten - 1) <= 0.15 &&
      convergence <= 0.35 &&
      keyRate >= 0.6 &&
      spread >= 3 &&
      colonne[1] &&
      (colonne[0] || colonne[2]);
  }

  if (!historique && !fortGeometrique) return null;

  /*
   * NOTE DE GÉOMÉTRIE FORTE — séparée, et volontairement d'une autre nature.
   *
   * La note historique vaut « moyenne par zone × marquages ». Mesuré, c'est
   * exactement cette formule qui classait un faux cadre (180 px d'erreur) devant
   * le bon (22 px) : le faux tient plus de zones, parce qu'il est ramassé sur la
   * partie dense du dessin. La refaire ici reviendrait à reproduire l'erreur.
   *
   * Celle-ci récompense donc la GÉOMÉTRIE, et n'utilise les marquages que comme
   * preuve secondaire — un facteur borné entre 0,85 et 1, incapable de renverser
   * un classement à lui seul.
   *
   * Relevé des 3 candidats qui passent le garde-fou sur le second terrain du cas
   * 02, et des faux pour comparaison (aucune vérité terrain dans les signaux) :
   *
   *   |aplat-1|  conv  raquette  poids  ortho  couv.  → note   ║ erreur réelle
   *     0.029    13%     76%      238    3,0°   51%    0.747   ║  22 px
   *     0.020    12%     67%      238    5,0°   47%    0.720   ║  24 px
   *     0.013    12%     70%      152    5,0°   45%    0.719   ║  25 px
   *     0.618     5%     56%      156    0,0°   33%    écarté  ║ 180 px
   *     0.683     1%     63%      149    0,0°   37%    écarté  ║ 208 px
   *
   * Les faux n'atteignent même pas la note : ils échouent sur les proportions,
   * très loin du seuil. Et le classement des trois retenus met bien le meilleur
   * cadre en tête.
   */
  let strong: number | null = null;
  if (fortGeometrique) {
    const side = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
    const top = side(corners[0], corners[1]);
    const bottom = side(corners[3], corners[2]);
    const widthPx = (top + bottom) / 2;
    const depthPx = (side(corners[0], corners[3]) + side(corners[1], corners[2])) / 2;
    const flatten = widthPx > 0 ? depthPx / widthPx / COURT_ASPECT[kind] : 0;
    const longer = Math.max(top, bottom);
    const convergence = longer > 0 ? 1 - Math.min(top, bottom) / longer : 1;
    const keyRate = keyTotal > 0 ? keyHits / keyTotal : 0;

    // Orthogonalité des deux familles, lue sur les côtés du quadrilatère.
    const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
    let gap = Math.abs(angle(corners[0], corners[1]) - angle(corners[0], corners[3])) % Math.PI;
    if (gap > Math.PI / 2) gap = Math.PI - gap;
    const ortho = Math.abs(gap - Math.PI / 2);

    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const proportions = clamp(1 - Math.abs(flatten - 1) / 0.15);
    const perspectiveTerm = clamp(1 - convergence / 0.35);
    const orthoTerm = clamp(1 - ortho / (10 * (Math.PI / 180)));
    const couverture = clamp(inside / Math.max(1, features.length));

    const base =
      0.3 * proportions +
      0.25 * keyRate +
      0.15 * perspectiveTerm +
      0.1 * orthoTerm +
      0.2 * couverture;
    // Preuve SECONDAIRE : les marquages modulent, ils ne décident pas.
    const secondaire = 0.85 + 0.15 * clamp(hits / Math.max(1, inside) / 0.35);
    strong = clamp(base * secondaire);
  }

  return {
    score: sum / used,
    markings: hits / inside,
    spread,
    matrix,
    perspective: depthCoherence(corners, kind),
    visible: inside / features.length,
    strong,
  };
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
/**
 * ZONES RÉSIDUELLES autour des terrains déjà retenus.
 *
 * Pourquoi c'est nécessaire : les passes suivantes travaillaient sur la page
 * ENTIÈRE avec le terrain déjà trouvé simplement masqué. Or `extremes()` ne
 * retient que les droites les plus éloignées du centre de la carte. Un second
 * terrain, situé au milieu de la page, est donc structurellement inéligible —
 * mesuré sur le cas 02 : sa ligne de fond est la droite nº 1 de l'image, à
 * 0,2 px de la vérité relevée à la main, et elle n'est jamais combinée.
 *
 * En recadrant PHYSIQUEMENT la carte sur la bande résiduelle, les mêmes droites
 * deviennent les extrêmes de cette bande, sans toucher à `extremes()` :
 *
 *   page entière     ligne de fond rang 1, distance au centre 28  → écartée
 *   bande du dessous ligne de fond rang 1, sélectionnable         → retenue
 *   meilleur quad    371 px d'erreur  →  22 px d'erreur
 *
 * Les quatre orientations sont produites sans présumer de la disposition : un
 * second schéma peut être au-dessus, en dessous ou à côté du premier. Les
 * bandes trop petites pour contenir un terrain sont écartées.
 */
function residualBands(
  width: number,
  height: number,
  exclude: Point[][]
): Array<{ label: string; rect: AiRect }> {
  if (!exclude.length) return [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const quad of exclude) {
    const bounds = quadBounds(quad);
    x0 = Math.min(x0, bounds.x0);
    y0 = Math.min(y0, bounds.y0);
    x1 = Math.max(x1, bounds.x1);
    y1 = Math.max(y1, bounds.y1);
  }

  const MARGIN = 2;
  const MIN = 60;
  const candidates = [
    { label: "bande du dessous", rect: { x0: 0, y0: Math.min(height, y1 + MARGIN), x1: width, y1: height } },
    { label: "bande du dessus", rect: { x0: 0, y0: 0, x1: width, y1: Math.max(0, y0 - MARGIN) } },
    { label: "bande de gauche", rect: { x0: 0, y0: 0, x1: Math.max(0, x0 - MARGIN), y1: height } },
    { label: "bande de droite", rect: { x0: Math.min(width, x1 + MARGIN), y0: 0, x1: width, y1: height } },
  ];
  return candidates.filter(
    (item) => item.rect.x1 - item.rect.x0 >= MIN && item.rect.y1 - item.rect.y0 >= MIN
  );
}

/**
 * Recadrage des passes suivantes sur les zones résiduelles, plutôt que masquage
 * du terrain déjà trouvé sur la page entière. Voir `residualBands`.
 */
const RESIDUAL_BANDS_ENABLED = true;

/* -------------------------------------------------------------------------- */
/* Terrain tronqué                                                            */
/* -------------------------------------------------------------------------- */

/**
 * LE TERRAIN EST-IL COUPÉ, OU SIMPLEMENT FINI ?
 *
 * Question purement descriptive : elle ne change aucune géométrie. Elle ne sert
 * qu'à dire au reste de la chaîne que le cadre porte sur un terrain dont une
 * partie n'est pas dans l'image.
 *
 * CE QUI NE MARCHE PAS, ET QU'IL NE FAUT PAS RÉESSAYER. Le discriminant naturel
 * serait « une ligne médiane est peinte, une coupe ne l'est pas » : on mesure
 * l'encre le long du bord du cadre. Mesuré sur cinq schémas, il donne 95 à 100 %
 * sur LES QUATRE côtés de TOUS, faux bords compris. C'est mécanique et sans
 * remède : le cadre est construit à partir des droites de Hough, donc ses côtés
 * reposent sur de l'encre par construction. Voir tests/debug-troncature.cjs.
 *
 * CE QUI MARCHE : REGARDER DERRIÈRE LE BORD. Un terrain complet est entouré du
 * FOND DE PAGE ; un terrain coupé a autre chose derrière lui.
 *      · le balayage sort de l'image          → coupé par le cadrage
 *      · aucun fond de page retrouvé derrière  → coupé par une zone d'affichage
 *
 * Mesuré (côtés déclarés tronqués, et convergence des touches) :
 *      synthétique complet, à plat        aucun                          0,0 %
 *      synthétique complet, perspective   aucun                         27,1 %
 *      cas01                              profond                        0,0 %
 *      cas02 T1                           fond, droite, profond, gauche  6,9 %
 *      cas02 T2                           fond                          12,5 %
 *
 * Les deux témoins COMPLETS ne basculent pas, y compris en forte perspective.
 *
 * UN FAUX NÉGATIF CONNU : le bord profond du cas 02 T2, réellement coupé, est
 * déclaré complet parce que le gris d'interface derrière lui est à 0 % du gris
 * du pourtour de l'image — sur une photo d'écran, « fond de page » et
 * « interface » sont la même couleur. La détection est donc CONSERVATRICE :
 * elle rate des coupes, elle n'en invente pas.
 */
const TRUNCATED_COURT_DETECTION = false;

export type CourtTruncation = {
  fond: boolean;
  profond: boolean;
  gauche: boolean;
  droite: boolean;
  /** Part de largeur perdue sur une profondeur de terrain. 0 = orthographique. */
  convergence: number;
  reasons: string[];
};

/** Bande comparée de part et d'autre, en fraction de largeur de terrain. */
const TRUNC_SWEEP = 0.2;
/** Un pixel appartient au fond de page s'il en est à moins de ceci. */
const TRUNC_PAGE_TOL = 40;

function courtTruncation(source: HTMLCanvasElement, quad: Point[]): CourtTruncation | null {
  const px = readPixels(source);
  const at = (x: number, y: number): [number, number, number] | null => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= px.w || yi >= px.h) return null;
    const i = (yi * px.w + xi) * 4;
    return [px.data[i], px.data[i + 1], px.data[i + 2]];
  };
  const ecart = (a: [number, number, number], b: [number, number, number]): number =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // Fond de page : couleur moyenne du pourtour de l'image.
  const marge = Math.max(4, Math.round(Math.min(px.w, px.h) * 0.03));
  const somme: [number, number, number] = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < px.h; y += 3) {
    for (let x = 0; x < px.w; x += 3) {
      const bord = x < marge || y < marge || x >= px.w - marge || y >= px.h - marge;
      if (!bord) continue;
      const c = at(x, y);
      if (!c) continue;
      somme[0] += c[0]; somme[1] += c[1]; somme[2] += c[2];
      n += 1;
    }
  }
  if (!n) return null;
  const page: [number, number, number] = [somme[0] / n, somme[1] / n, somme[2] / n];

  const coins = orderQuad(quad);
  const largeur = Math.hypot(coins[1].x - coins[0].x, coins[1].y - coins[0].y);
  if (!(largeur > 24)) return null;

  const reasons: string[] = [];

  /**
   * Un côté est TRONQUÉ si, en s'éloignant de lui vers l'extérieur, on sort de
   * l'image ou on ne retrouve jamais le fond de page. `A`→`B` parcourt le côté
   * dans le sens direct ; la normale sortante est à sa droite.
   */
  const coteTronque = (nom: string, A: Point, B: Point): boolean => {
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const L = Math.hypot(dx, dy);
    if (!(L > 8)) return false;
    const nx = -dy / L;
    const ny = dx / L;
    const pas = Math.max(1, Math.round(largeur * 0.004));
    const fin = Math.round((largeur * TRUNC_SWEEP) / pas);
    let horsTotal = 0;
    let horsN = 0;
    let pageA: number | null = null;
    for (let k = 1; k <= fin; k += 1) {
      const delta = k * pas;
      let hors = 0;
      let fond = 0;
      let vus = 0;
      for (let i = 0; i <= 40; i += 1) {
        const t = 0.2 + (0.6 * i) / 40;
        const c = at(A.x + dx * t + nx * delta, A.y + dy * t + ny * delta);
        vus += 1;
        if (!c) { hors += 1; continue; }
        if (ecart(c, page) <= TRUNC_PAGE_TOL) fond += 1;
      }
      if (delta >= largeur * 0.02) { horsTotal += hors / vus; horsN += 1; }
      const dedans = vus - hors;
      if (pageA === null && dedans > 0 && fond / Math.max(1, dedans) >= 0.6) pageA = delta;
    }
    const horsImage = horsN ? horsTotal / horsN : 0;
    if (horsImage >= 0.4) {
      reasons.push(`${nom} : tronqué — le balayage sort de l'image à ${(horsImage * 100).toFixed(0)} %`);
      return true;
    }
    if (pageA === null) {
      reasons.push(`${nom} : tronqué — aucun fond de page derrière le bord`);
      return true;
    }
    reasons.push(`${nom} : complet — fond de page retrouvé à ${((pageA / largeur) * 100).toFixed(0)} % derrière le bord`);
    return false;
  };

  const fond = coteTronque("ligne de fond", coins[1], coins[0]);
  const droite = coteTronque("touche droite", coins[2], coins[1]);
  const profond = coteTronque("bord profond", coins[3], coins[2]);
  const gauche = coteTronque("touche gauche", coins[0], coins[3]);

  /*
   * CONVERGENCE DES TOUCHES : part de largeur perdue sur une profondeur de
   * terrain. Elle vaut 0 sur un dessin orthographique, dont les deux touches
   * sont parallèles — et c'est ce qui distingue un terrain coupé mais SANS
   * danger (l'extrapolation de profondeur en 14/15 y est exacte) d'un terrain
   * coupé EN PERSPECTIVE, où la même extrapolation dérive avec la profondeur.
   */
  const fuite = intersect(
    lineThrough(coins[3], coins[0]),
    lineThrough(coins[1], coins[2])
  );
  const profondeurImage = Math.hypot(coins[3].x - coins[0].x, coins[3].y - coins[0].y);
  const convergence = fuite
    ? profondeurImage / Math.max(1e-6, Math.hypot(fuite.x - coins[0].x, fuite.y - coins[0].y))
    : 0;
  reasons.push(`convergence des touches ${(convergence * 100).toFixed(1)} %`);

  return { fond, profond, gauche, droite, convergence, reasons };
}

/** Droite (theta, rho) passant par deux points, au format de `intersect`. */
function lineThrough(a: Point, b: Point): Line {
  const theta = Math.atan2(b.x - a.x, -(b.y - a.y));
  const rho = a.x * Math.cos(theta) + a.y * Math.sin(theta);
  return { theta, rho, weight: 0 };
}

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

  const maps: Array<{ map: LineMap; label: string }> = [];

  // Zones de travail. Sans terrain déjà retenu, c'est la région demandée. Avec,
  // ce sont les bandes résiduelles autour de lui — recadrées, pas masquées.
  const zones: Array<{ label: string; rect: AiRect | undefined }> =
    RESIDUAL_BANDS_ENABLED && exclude?.length
      ? residualBands(source.width, source.height, exclude).map((band) => ({
          label: band.label,
          rect: band.rect,
        }))
      : [{ label: "", rect: region }];
  if (RESIDUAL_BANDS_ENABLED && exclude?.length && !zones.length) {
    reasons.push("aucune zone résiduelle exploitable autour du terrain déjà retenu");
  }

  for (const zone of zones) {
    for (const mode of ["light", "dark"] as const) {
      // Une bande résiduelle ne contient plus le terrain déjà retenu : le
      // masquage devient inutile, et c'est bien le recadrage qui rend ses
      // droites éligibles à `extremes()`.
      const map = zone.rect && RESIDUAL_BANDS_ENABLED && exclude?.length
        ? buildLineMap(source, zone.rect, mode)
        : buildLineMap(source, zone.rect, mode, exclude);
      if (!map) continue;
      const base = mode === "light" ? "peinture claire" : "encre sombre";
      const label = zone.label ? `${zone.label} · ${base}` : base;
      reasons.push(`${label} : ${(map.density * 100).toFixed(1)} % de la zone`);
      if (map.density < 0.002 || map.density > 0.5) {
        reasons.push(`${label} — densité hors plage exploitable`);
        continue;
      }
      maps.push({ map, label });
    }
  }

  const search = (allowed: CourtKind[]): { best: Hypothesis | null; map: LineMap | null } => {
    let bestOne: Hypothesis | null = null;
    let bestMapOne: LineMap | null = null;
    for (const entry of maps) {
      const candidate = searchBestHypothesis(entry.map, reasons, entry.label, allowed);
      if (!candidate) continue;
      /*
       * Entre cartes, on ne compare que des grandeurs COMPARABLES. Une hypothèse
       * du chemin historique et une hypothèse de géométrie forte ne le sont pas :
       * une note de 0,74 sur l'une ne vaut pas mieux qu'une note de 0,50 sur
       * l'autre, elles ne mesurent pas la même chose. Le chemin historique garde
       * donc la priorité, et la géométrie forte ne l'emporte que faute de mieux.
       */
      if (!bestOne) {
        bestOne = candidate;
        bestMapOne = entry.map;
        continue;
      }
      const memeChemin = (bestOne.strong === undefined) === (candidate.strong === undefined);
      // Entre chemins différents, la priorité au chemin historique ne vaut que
      // s'il est RECEVABLE. Un candidat historique sous son propre seuil sera
      // rejeté juste après : le laisser évincer une géométrie forte reviendrait
      // à jeter la seule hypothèse exploitable.
      const recevable = (h: Hypothesis) =>
        h.strong !== undefined ? true : h.score >= RECTIFY_CONFIDENCE_MEDIUM;
      const meilleur = memeChemin
        ? candidate.strong !== undefined
          ? (candidate.strong ?? 0) > (bestOne.strong ?? 0)
          : candidate.score > bestOne.score
        : candidate.strong === undefined
          ? recevable(candidate) && !recevable(bestOne)
          : !recevable(bestOne);
      if (meilleur) {
        bestOne = candidate;
        bestMapOne = entry.map;
      }
    }
    return { best: bestOne, map: bestMapOne };
  };

  let { best, map: bestMap } = search(["half", "full"]);

  /* ------------------------------------------------------------------------ */
  /* COMBIEN DE RAQUETTES DANS LE CADRE RETENU ?                              */
  /* ------------------------------------------------------------------------ */
  /**
   * Contre-preuve indépendante du gabarit. Un demi-terrain a UNE raquette, un
   * terrain complet en a DEUX, opposées. C'est le seul indice qui ne dépend pas
   * de la géométrie des lignes, donc le seul capable de contredire un gabarit
   * qui « colle » bien pour de mauvaises raisons.
   *
   * Mesuré sur un vrai document : le gabarit de terrain COMPLET posé sur un
   * DEMI-terrain retrouvait 88 % de ses marquages et sortait en confiance
   * « haute » — un cadre entièrement faux, une échelle verticale doublée, et le
   * second schéma de la page purement perdu. C'est le piège du score qui monte
   * quand on se trompe de cadre.
   *
   * La raquette est comptée DANS LE QUADRILATÈRE RETENU, pas sur la page : une
   * page qui porte deux demi-terrains montre bien deux raquettes, mais elles
   * appartiennent à deux dessins différents.
   */
  if (best && best.kind === "full" && bestMap) {
    const map = bestMap;
    const toSource = (point: Point): Point => ({
      x: point.x / map.scale + map.offsetX,
      y: point.y / map.scale + map.offsetY,
    });
    const quadSource = best.quad.map(toSource);
    const bounds = quadBounds(quadSource);
    const inside = {
      x0: Math.max(0, bounds.x0),
      y0: Math.max(0, bounds.y0),
      x1: Math.min(source.width, bounds.x1),
      y1: Math.min(source.height, bounds.y1),
    };
    if (inside.x1 - inside.x0 > 24 && inside.y1 - inside.y0 > 24) {
      const paint = findPaintSides(readPixels(source, inside));
      const opposed =
        (paint.includes("top") && paint.includes("bottom")) ||
        (paint.includes("left") && paint.includes("right"));
      if (!opposed) {
        reasons.push(
          `terrain complet proposé mais ${paint.length ? `une seule raquette (${paint.join("+")})` : "aucune raquette"} ` +
            `dans le cadre → hypothèse écartée, on ne cherche plus qu'un demi-terrain`
        );
        const retry = search(["half"]);
        best = retry.best;
        bestMap = retry.map;
      }
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
  /*
   * SEUIL PROPRE AU CHEMIN DE GÉOMÉTRIE FORTE.
   *
   * Comparer sa note au 0,42 du chemin historique n'aurait aucun sens : les deux
   * nombres ne mesurent pas la même chose. La note historique pèse des
   * marquages ; celle-ci pèse des proportions, une raquette et une orthogonalité.
   * Chacune a donc son seuil.
   *
   * 0,60 : un candidat posé exactement sur les limites du garde-fou — proportions
   * à la borne, raquette à 60 %, aucune marge ailleurs — obtiendrait 0,15. Il
   * faut donc être franchement bon sur PLUSIEURS axes à la fois pour l'atteindre.
   * Les trois candidats justes du second terrain du cas 02 sont à 0,72–0,75.
   */
  const STRONG_MIN = 0.6;
  if (best.strong !== undefined) {
    if (best.strong < STRONG_MIN) {
      reasons.push(
        `géométrie forte : note ${best.strong.toFixed(3)} sous son seuil ${STRONG_MIN} → rien de redressé`
      );
      return give(null);
    }
  } else if (best.score < RECTIFY_CONFIDENCE_MEDIUM) {
    reasons.push("confiance faible → on garde la détection classique, sans rien redresser");
    return give(null);
  }
  /*
   * Une note obtenue par AFFINAGE ne vaut pas confiance aveugle.
   *
   * L'affinage déplace le cadre pour maximiser l'accord avec les lignes : c'est
   * une note AJUSTÉE, pas une note constatée. Mesuré sur le cas 01 — dont le
   * terrain est coupé en bas et dont la détection classique est excellente
   * (0,026 m d'erreur sur les touches) — l'affinage faisait passer un cadre
   * faux de « refusé » à « haute », le redressement prenait la main et l'erreur
   * montait à 1,9 m. Plafonnée à « moyenne », la même hypothèse laisse
   * l'orchestrateur revenir au moteur classique quand son résultat est meilleur,
   * ce qui est précisément le rôle de ce niveau.
   */
  const level: "haute" | "moyenne" =
    best.score >= RECTIFY_CONFIDENCE_HIGH && best.rawBefore === undefined ? "haute" : "moyenne";
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

  // Description du cadrage, jamais une décision : rien en aval ne s'en sert
  // encore. Le repli sur terrain partiel reste non posé — voir l'en-tête de
  // `courtTruncation` et tests/debug-troncature.cjs.
  const truncation = (TRUNCATED_COURT_DETECTION ? courtTruncation(source, sourceCorners) : null) ?? undefined;
  if (truncation) {
    reasons.push(
      `terrain tronqué : ${[
        truncation.fond && "ligne de fond",
        truncation.droite && "touche droite",
        truncation.profond && "bord profond",
        truncation.gauche && "touche gauche",
      ].filter(Boolean).join(", ") || "aucun côté"}`
    );
    reasons.push(...truncation.reasons);
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
    truncation,
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
  /** Rotation retenue, nécessaire pour rejouer et affiner l'hypothèse. */
  rotation: number;
  /**
   * Quelle formule de note a produit `score`. Les deux branches de recherche
   * n'utilisent pas la même pondération, et l'affinage doit rejouer CELLE de
   * l'hypothèse — sinon la note change de sens en cours de route (mesuré : le
   * second terrain retombait de 0,41 à 0,26 alors que ses marquages montaient).
   */
  formula: "markings" | "coverage";
  /** Marquages retrouvés AVANT affinage, quand un affinage a eu lieu. */
  rawBefore?: number;
  /**
   * Note de géométrie forte, si l'hypothèse vient du second chemin. Une
   * hypothèse qui la porte n'est PAS comparable, ni en valeur ni en seuil, à une
   * hypothèse du chemin historique.
   */
  strong?: number;
};

/**
 * AFFINAGE LOCAL D'UNE HYPOTHÈSE RETENUE.
 *
 * Les quatre coins sortent d'intersections de droites de Hough, quantifiées en
 * θ et ρ : le cadre est bon à quelques pixels près, pas au pixel. Mesuré sur le
 * second terrain du cas 02, les marquages manquants se répartissaient ainsi :
 * 14 % à 3–5 px d'une ligne réelle, 29 % à 6–10 px, 34 % à 11–24 px. Autrement
 * dit, l'essentiel n'était pas détruit mais DÉCALÉ.
 *
 * On ne relance donc aucun balayage : on bouge le cadre retenu de très peu, et
 * on garde le meilleur. Quatre familles d'ajustement, toutes de faible
 * amplitude et exprimées en fraction de la taille du cadre :
 *
 *   translation X · translation Y · échelle X/Y · légère perspective (keystone)
 *
 * La descente est par coordonnée, deux passes, du pas le plus grand au plus
 * petit. Le coût est celui d'une poignée de notations, pas d'une recherche.
 */
function refineQuad(
  map: LineMap,
  quad: Point[],
  kind: CourtKind,
  rotation: number,
  note: (result: NonNullable<ReturnType<typeof scoreHypothesis>>) => number
): { quad: Point[]; result: NonNullable<ReturnType<typeof scoreHypothesis>> } | null {
  const base = scoreHypothesis(map, quad, kind, rotation);
  if (!base) return null;

  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  if (width < 8 || height < 8) return null;

  /**
   * Applique un jeu d'ajustements au quadrilatère D'ORIGINE. On repart toujours
   * de l'origine plutôt que d'empiler les corrections : une dérive cumulée
   * finirait par déplacer le cadre bien au-delà de la « plage très petite ».
   */
  const apply = (p: { tx: number; ty: number; sx: number; sy: number; kx: number; ky: number }): Point[] =>
    quad.map((point) => {
      // Position relative dans le cadre, pour appliquer le keystone : -0,5 en
      // haut, +0,5 en bas.
      const v = (point.y - cy) / Math.max(1, height);
      const u = (point.x - cx) / Math.max(1, width);
      const scaledX = cx + (point.x - cx) * p.sx;
      const scaledY = cy + (point.y - cy) * p.sy;
      return {
        // Le keystone élargit le haut et rétrécit le bas (ou l'inverse) : c'est
        // une perspective légère, pas une déformation libre.
        x: scaledX + p.tx * width + p.kx * width * v * u * 2,
        y: scaledY + p.ty * height + p.ky * height * u * v * 2,
      };
    });

  const AXES: Array<keyof { tx: number; ty: number; sx: number; sy: number; kx: number; ky: number }> = [
    "ty",
    "tx",
    "sy",
    "sx",
    "ky",
    "kx",
  ];
  // Plages volontairement étroites : un affinage n'a pas à rattraper une erreur
  // de cadre, seulement une imprécision de quantification.
  const RANGE = { tx: 0.03, ty: 0.03, sx: 0.06, sy: 0.06, kx: 0.03, ky: 0.03 };

  let current = { tx: 0, ty: 0, sx: 1, sy: 1, kx: 0, ky: 0 };
  let bestQuad = quad;
  let bestResult = base;
  let bestScore = note(base);

  for (const step of [1, 0.4]) {
    for (const axis of AXES) {
      const span = RANGE[axis] * step;
      for (const delta of [-span, span, -span / 2, span / 2]) {
        const trial = { ...current, [axis]: current[axis] + delta };
        const candidate = apply(trial);
        const result = scoreHypothesis(map, candidate, kind, rotation);
        if (!result) continue;
        const value = note(result);
        if (value > bestScore) {
          bestScore = value;
          bestQuad = candidate;
          bestResult = result;
          current = trial;
        }
      }
    }
  }

  return { quad: bestQuad, result: bestResult };
}

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
function searchBestHypothesis(
  map: LineMap,
  reasons: string[],
  label: string,
  allowed: CourtKind[] = ["half", "full"]
): Hypothesis | null {
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
  /*
   * Les candidats de GÉOMÉTRIE FORTE sont classés à part, par leur propre note.
   * Les mélanger au classement historique reviendrait à comparer deux grandeurs
   * qui ne mesurent pas la même chose — l'erreur que ce chemin existe justement
   * pour éviter.
   */
  let bestStrong: Hypothesis | null = null;
  let tested = 0;

  /*
   * QUADRILATÈRES DÉDUITS — trois droites suffisent.
   *
   * Un terrain COUPÉ par le bord de l'image ne peut pas être décrit par quatre
   * droites : la quatrième n'existe pas dans le dessin. Or la quasi-totalité des
   * documents réels sont coupés — un coach cadre sur la moitié utile et
   * s'arrête. Les hypothèses à quatre droites choisissaient alors une ligne
   * intérieure au hasard comme quatrième côté, et le cadre était faux.
   *
   * Les proportions d'un terrain étant fixes (15 × 14 m en demi, 15 × 28 en
   * entier), deux lignes de touche et une ligne de fond suffisent : la longueur
   * SE CALCULE. On génère donc aussi ces quadrilatères-là, dans les deux sens
   * possibles, et on les met en concurrence avec les autres. Ce n'est pas un
   * assouplissement de seuil : c'est la seule façon de FORMER l'hypothèse juste.
   */
  const deduced: Array<{ quad: Point[]; kind: CourtKind }> = [];
  const ratioOf = (kind: CourtKind) => (kind === "full" ? 28 / 15 : 14 / 15);
  const unitAlong = (line: Line, from: Point, towards: Point): Point => {
    const dx = -Math.sin(line.theta);
    const dy = Math.cos(line.theta);
    const sign = (towards.x - from.x) * dx + (towards.y - from.y) * dy >= 0 ? 1 : -1;
    return { x: dx * sign, y: dy * sign };
  };

  // On ne prend que des paires OPPOSÉES de lignes de touche, comme le fait le
  // chemin à quatre droites : deux droites du même côté ne bornent pas un
  // terrain, et les essayer multiplie les hypothèses sans rien apporter.
  for (const side0 of (DEDUCE_ENABLED ? familyA.low : [])) {
    for (const side1 of familyA.high) {
      if (side0 === side1) continue;
      for (const base of [...familyB.low, ...familyB.high]) {
        const p1 = intersect(side0, base);
        const p2 = intersect(side1, base);
        if (!p1 || !p2) continue;
        const widthPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (widthPx < minSide) continue;
        for (const kind of allowed) {
          const nominal = widthPx * ratioOf(kind);
          if (nominal < minSide) continue;
          for (const towards of [
            { x: cx, y: cy },
            { x: p1.x * 2 - cx, y: p1.y * 2 - cy },
          ]) {
            const u0 = unitAlong(side0, p1, towards);
            const u1 = unitAlong(side1, p2, towards);
            /*
             * PLUSIEURS PROFONDEURS, ET UNE VRAIE PERSPECTIVE.
             *
             * Les deux côtés sont prolongés CHACUN selon SA propre direction :
             * si les lignes de touche convergent, le quadrilatère obtenu est un
             * trapèze — plus étroit au loin — et si elles divergent, il s'évase.
             * Les deux cas se produisent selon d'où la photo est prise.
             *
             * La profondeur nominale suppose que la largeur mesurée sur la ligne
             * de fond représente bien les 15 m. En perspective, ce n'est vrai
             * qu'au premier ordre : plus le terrain fuit, plus la profondeur
             * apparente s'écarte du produit largeur × rapport. On essaie donc
             * plusieurs profondeurs autour de la nominale et on laisse la note
             * trancher, au lieu d'imposer une valeur unique.
             */
            // MÉTHODE ESSAYÉE ET ÉCARTÉE — balayer plusieurs profondeurs
            // (0,85 / 1 / 1,18 fois la profondeur nominale) pour absorber
            // l'écart dû à la perspective. Mesuré : le cas réel 02 perd ses deux
            // défenseurs (2 → 0), et le temps de la batterie synthétique passe
            // de 30 s à 85 s pour zéro gain. Le nombre d'hypothèses explose et
            // les mauvaises gagnent aussi souvent que les bonnes.
            for (const factor of [1]) {
              const length = nominal * factor;
              if (length < minSide) continue;
              const quad = orderQuad([
                p1,
                p2,
                { x: p2.x + u1.x * length, y: p2.y + u1.y * length },
                { x: p1.x + u0.x * length, y: p1.y + u0.y * length },
              ]);
              if (!isConvex(quad)) continue;
              deduced.push({ quad, kind });
            }
          }
        }
      }
    }
  }

  for (const item of deduced) {
    // Même garde-fou que pour les hypothèses à quatre droites : un quadrilatère
    // qui ne contient qu'une petite part des lignes de l'image est un de ses
    // éléments, pas le terrain. Il reste valable pour un terrain coupé : seule
    // la portion visible compte, et c'est bien elle qui doit contenir le dessin.
    const contained = coverage(item.quad, linePixels);
    if (contained < 0.3) continue;
    for (let rotation = 0; rotation < 4; rotation += 1) {
      const result = scoreHypothesis(map, item.quad, item.kind, rotation);
      tested += 1;
      if (!result) continue;
      const orientationBias = 1 - rotation * 0.004;
      // `perspective` : garde-fou de cohérence de profondeur (voir depthCoherence).
      const score = result.score * result.markings * result.perspective * orientationBias;
      if (result.strong !== null && (!bestStrong || (bestStrong.strong ?? 0) < result.strong)) {
        bestStrong = {
          score, matrix: result.matrix, kind: item.kind, quad: item.quad, contained,
          raw: result.markings, spread: result.spread, linesFound: lines.length,
          quadsTested: tested, rotation, formula: "markings", strong: result.strong,
        };
      }
      if (!best || score > best.score) {
        best = {
          score,
          matrix: result.matrix,
          kind: item.kind,
          quad: item.quad,
          contained,
          raw: result.markings,
          spread: result.spread,
          linesFound: lines.length,
          quadsTested: tested,
          rotation,
          formula: "markings",
        };
      }
    }
  }

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

          for (const kind of allowed) {
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
              const combined =
                result.score * (0.6 + 0.4 * contained) * result.perspective * orientationBias;
              if (result.strong !== null && (!bestStrong || (bestStrong.strong ?? 0) < result.strong)) {
                bestStrong = {
                  score: combined, matrix: result.matrix, kind, quad, contained,
                  raw: result.markings, spread: result.spread, linesFound: lines.length,
                  quadsTested: 0, rotation, formula: "coverage", strong: result.strong,
                };
              }
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
                  rotation,
                  formula: "coverage",
                };
              }
            }
          }
        }
      }
    }
  }

  /*
   * AFFINAGE — seulement sur l'hypothèse RETENUE, jamais pendant la recherche.
   * C'est ce qui garde le coût négligeable : une poignée de notations, pas un
   * second balayage.
   */
  if (REFINE_ENABLED && best) {
    const current = best;
    const orientationBias = 1 - current.rotation * 0.004;
    const note = (r: NonNullable<ReturnType<typeof scoreHypothesis>>) =>
      current.formula === "markings"
        ? r.score * r.markings * r.perspective * orientationBias
        : r.score * (0.6 + 0.4 * current.contained) * r.perspective * orientationBias;

    const refined = refineQuad(map, current.quad, current.kind, current.rotation, note);
    if (refined && note(refined.result) > current.score) {
      reasons.push(
        `${label} — affinage local : marquages ${(current.raw * 100).toFixed(0)} % → ` +
          `${(refined.result.markings * 100).toFixed(0)} %, note ${current.score.toFixed(3)} → ` +
          `${note(refined.result).toFixed(3)}`
      );
      best = {
        ...current,
        quad: refined.quad,
        matrix: refined.result.matrix,
        rawBefore: current.raw,
        raw: refined.result.markings,
        spread: refined.result.spread,
        score: note(refined.result),
      };
    }
  }

  /*
   * Le chemin historique reste prioritaire : s'il a retenu quelque chose, rien
   * ne change. Le chemin de géométrie forte ne sert que lorsqu'il n'a RIEN —
   * c'est-à-dire quand aucune hypothèse ne tient assez de zones, faute de
   * marquages exploitables dans l'image.
   */
  if (bestStrong && (!best || best.score < RECTIFY_CONFIDENCE_MEDIUM)) {
    // Le chemin historique garde la priorité tant qu'il produit une hypothèse
    // RECEVABLE. Une hypothèse qu'il retient mais qui échoue ensuite à son
    // propre seuil ne vaut rien : à ce moment-là seulement, la géométrie forte
    // a son mot à dire. Le seuil historique n'est ni lu à la baisse ni modifié,
    // il sert uniquement à constater que ce chemin n'a pas abouti.
    reasons.push(
      `${label} — chemin historique ${best ? `sans hypothèse recevable (${best.score.toFixed(3)})` : "sans hypothèse"} ; ` +
        `chemin « géométrie forte » proposé, note ${(bestStrong.strong ?? 0).toFixed(3)}`
    );
    best = bestStrong;
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
