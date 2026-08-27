/**
 * lib/import/court-geometry.ts
 * ---------------------------------------------------------------------------
 * Le terrain présent dans l'image source sert UNIQUEMENT de repère géométrique.
 * Il n'est jamais reproduit sous forme de tracés.
 *
 * Ce module :
 *   1. isole le rectangle du terrain dans la zone Graphic ;
 *   2. détermine s'il s'agit d'un demi-terrain ou d'un terrain complet ;
 *   3. détermine son orientation (côté du panier) ;
 *   4. construit un MASQUE des lignes de terrain (touche, fond, médiane,
 *      cercle central, raquette, lancers francs, 3 points, cercle du panier,
 *      planche, zone restrictive) afin de ne JAMAIS les confondre avec des
 *      tracés du coach ;
 *   5. convertit les coordonnées du terrain source vers le repère CANONIQUE
 *      de la Plaquette.
 *
 * Repère canonique Plaquette (cf. app/plaquette/PlaquetteClient.tsx) :
 *   x ∈ [0,1], y ∈ [0,1] en plein terrain, y = 0.5 = ligne médiane,
 *   un demi-terrain n'utilise que y ∈ [0, 0.5], panier haut vers y ≈ 0.10.
 */

import type { AiPoint, AiRect } from "./types";

export type CourtKind = "half" | "full";
export type CourtOrientation = "identity" | "rot180" | "rot90cw" | "rot90ccw";

export type CourtGeometry = {
  /** Rectangle du terrain dans les pixels de l'image source. */
  rect: AiRect;
  kind: CourtKind;
  orientation: CourtOrientation;
  /** Confiance de la classification demi / complet (0..1). */
  confidence: number;
  reasons: string[];
};

/* -------------------------------------------------------------------------- */
/* Calibration du terrain de la Plaquette — MESURÉE sur les images réelles     */
/* -------------------------------------------------------------------------- */
/**
 * Ces valeurs ne sont PAS estimées : elles ont été mesurées au pixel près sur
 * MYBASKET_DEMI_URL et MYBASKET_FULL_URL (app/plaquette/PlaquetteClient.tsx,
 * lignes 26 et 27), en détectant les lignes de touche et de fond blanches.
 *
 * DEMI-TERRAIN — image 746 × 584, dessinée étirée sur tout le canvas 900 × 704
 * (getCourtDrawRect renvoie le canvas entier), donc fraction image = fraction
 * d'affichage.
 *   lignes de touche : x = 103.5 et 643.5  → 0.1387 et 0.8626
 *   ligne de fond    : y = 76.5            → 0.1310
 *   échelle          : 540 px / 15 m = 36.0 px/m
 *   ligne médiane    : 76.5 + 14 × 36.0 = 580.5 → 0.9940
 *   contrôle d'aspect : (0.7239 × 900) / (0.8630 × 704) = 1.072 ≈ 15/14 ✓
 *
 * TERRAIN COMPLET — image 1024 × 658 (terrain horizontal), pivotée de 90° et
 * ajustée « contain » dans le canvas 704 × 1100 :
 *   dh = 704, dw = 704 × (1024/658) = 1095.59, rect = (0, 2.21, 704, 1095.59)
 *   → affichage y = u_image,  affichage x = 1 − v_image
 *   lignes de fond   : u = 69/1024 et 954/1024  → y ∈ [0.0674, 0.9316]
 *   lignes de touche : v = 91.5/658 et 565.5/658 → x ∈ [0.1406, 0.8609]
 *   contrôle d'aspect : (0.8643 × 1100) / (0.7204 × 704) = 1.874 ≈ 28/15 ✓
 *
 * Les constantes HALF_BASKET / FULL_BASKET_TOP de la Plaquette (y = 0.1 et
 * 0.09 en canonique) sont des approximations de son auteur — le commentaire du
 * code dit « ajuste si besoin ». La géométrie mesurée ci-dessus donne le panier
 * à y ≈ 0.114 (demi) et 0.116 (complet) en canonique. On se cale sur les
 * MESURES, qui correspondent à ce que l'utilisateur voit à l'écran.
 */
export const HALF_COURT_LEFT = 0.1387;
export const HALF_COURT_RIGHT = 0.8626;
export const HALF_COURT_TOP = 0.131; // ligne de fond
export const HALF_COURT_BOTTOM = 0.994; // ligne médiane

export const FULL_COURT_LEFT = 0.1406;
export const FULL_COURT_RIGHT = 0.8609;
export const FULL_COURT_TOP = 0.0674;
export const FULL_COURT_BOTTOM = 0.9316;

/* -------------------------------------------------------------------------- */
/* Utilitaires image                                                          */
/* -------------------------------------------------------------------------- */

export const saturationOf = (r: number, g: number, b: number): number => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

export type Pixels = { data: Uint8ClampedArray; w: number; h: number };

export function readPixels(canvas: HTMLCanvasElement, rect?: AiRect): Pixels {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponible");
  const x0 = Math.max(0, Math.floor(rect?.x0 ?? 0));
  const y0 = Math.max(0, Math.floor(rect?.y0 ?? 0));
  const w = Math.max(1, Math.min(canvas.width - x0, Math.round((rect?.x1 ?? canvas.width) - x0)));
  const h = Math.max(1, Math.min(canvas.height - y0, Math.round((rect?.y1 ?? canvas.height) - y0)));
  const image = ctx.getImageData(x0, y0, w, h);
  return { data: image.data, w, h };
}

export const pixelAt = (px: Pixels, x: number, y: number): [number, number, number] => {
  const xx = Math.max(0, Math.min(px.w - 1, Math.round(x)));
  const yy = Math.max(0, Math.min(px.h - 1, Math.round(y)));
  const i = (yy * px.w + xx) * 4;
  return [px.data[i], px.data[i + 1], px.data[i + 2]];
};

/** Couleurs dominantes quantifiées (fond de terrain, aplats, lignes blanches). */
export function dominantColors(px: Pixels, count = 4): Array<{ r: number; g: number; b: number; share: number }> {
  const bins = new Map<number, number>();
  const step = Math.max(1, Math.round(Math.min(px.w, px.h) / 220));
  let total = 0;
  for (let y = 0; y < px.h; y += step) {
    for (let x = 0; x < px.w; x += step) {
      const [r, g, b] = pixelAt(px, x, y);
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      bins.set(key, (bins.get(key) || 0) + 1);
      total += 1;
    }
  }
  return [...bins.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, hits]) => ({
      r: ((key >> 10) & 31) * 8 + 4,
      g: ((key >> 5) & 31) * 8 + 4,
      b: (key & 31) * 8 + 4,
      share: total ? hits / total : 0,
    }));
}

/* -------------------------------------------------------------------------- */
/* 1. Isolation du terrain                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Détecte le rectangle du terrain à l'intérieur d'une zone Graphic.
 * Deux régimes :
 *   - terrain colorié (captures FIBA) : bbox de l'aplat dominant saturé ;
 *   - terrain au trait sur fond blanc (feuille papier) : bbox de l'encre.
 */
export function detectCourtRect(canvas: HTMLCanvasElement, region: AiRect): AiRect {
  const px = readPixels(canvas, region);
  const palette = dominantColors(px, 5);
  const tinted = palette.find(
    (color) => color.share > 0.12 && saturationOf(color.r, color.g, color.b) > 0.1 && Math.max(color.r, color.g, color.b) > 60
  );

  const step = Math.max(1, Math.round(Math.min(px.w, px.h) / 400));
  let minX = px.w;
  let maxX = -1;
  let minY = px.h;
  let maxY = -1;
  let hits = 0;

  const near = (r: number, g: number, b: number, target: { r: number; g: number; b: number }) =>
    Math.abs(r - target.r) < 34 && Math.abs(g - target.g) < 34 && Math.abs(b - target.b) < 34;

  for (let y = 0; y < px.h; y += step) {
    for (let x = 0; x < px.w; x += step) {
      const [r, g, b] = pixelAt(px, x, y);
      const keep = tinted ? near(r, g, b, tinted) : (r + g + b) / 3 < 232;
      if (!keep) continue;
      hits += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (hits < 40 || maxX <= minX || maxY <= minY) return { ...region };

  return {
    x0: region.x0 + minX,
    y0: region.y0 + minY,
    x1: region.x0 + maxX + step,
    y1: region.y0 + maxY + step,
  };
}

/* -------------------------------------------------------------------------- */
/* 2 & 3. Classification demi / complet et orientation                        */
/* -------------------------------------------------------------------------- */

/** Densité de « marquage » (tout ce qui n'est pas l'aplat dominant) dans une bande. */
function bandDensity(px: Pixels, fill: { r: number; g: number; b: number } | null, band: AiRect): number {
  const step = Math.max(1, Math.round(Math.min(px.w, px.h) / 300));
  let hits = 0;
  let total = 0;
  for (let y = band.y0; y < band.y1; y += step) {
    for (let x = band.x0; x < band.x1; x += step) {
      const [r, g, b] = pixelAt(px, x, y);
      total += 1;
      if (!fill) {
        if ((r + g + b) / 3 < 200) hits += 1;
      } else if (Math.abs(r - fill.r) > 30 || Math.abs(g - fill.g) > 30 || Math.abs(b - fill.b) > 30) {
        hits += 1;
      }
    }
  }
  return total ? hits / total : 0;
}

/** Score de symétrie miroir autour du milieu de l'axe long (terrain complet). */
function mirrorScore(px: Pixels, vertical: boolean): number {
  const samples = 900;
  let agree = 0;
  let total = 0;
  for (let i = 0; i < samples; i += 1) {
    const x = ((i * 37) % 100) / 100;
    const y = ((i * 61) % 100) / 100;
    const ax = Math.round(x * (px.w - 1));
    const ay = Math.round(y * (px.h - 1));
    const bx = vertical ? ax : px.w - 1 - ax;
    const by = vertical ? px.h - 1 - ay : ay;
    const [r1, g1, b1] = pixelAt(px, ax, ay);
    const [r2, g2, b2] = pixelAt(px, bx, by);
    total += 1;
    if (Math.abs(r1 - r2) < 40 && Math.abs(g1 - g2) < 40 && Math.abs(b1 - b2) < 40) agree += 1;
  }
  return total ? agree / total : 0;
}

export function classifyCourt(canvas: HTMLCanvasElement, rect: AiRect): CourtGeometry {
  const px = readPixels(canvas, rect);
  const palette = dominantColors(px, 3);
  const fill = palette[0] && palette[0].share > 0.18 ? palette[0] : null;
  const reasons: string[] = [];

  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const longSide = Math.max(w, h);
  const shortSide = Math.max(1, Math.min(w, h));
  const ratio = longSide / shortSide;
  const vertical = h >= w;

  // Terrain complet FIBA : 28 × 15 → 1.87. Demi-terrain : 15 × 14 → 1.07.
  let kind: CourtKind = ratio > 1.45 ? "full" : "half";
  let confidence = Math.min(1, Math.abs(ratio - 1.45) / 0.45 + 0.35);
  reasons.push(`ratio ${ratio.toFixed(2)} → ${kind}`);

  // Vérification par symétrie : un terrain complet est symétrique par rapport
  // à sa ligne médiane, pas un demi-terrain.
  const symmetry = mirrorScore(px, vertical);
  if (kind === "half" && symmetry > 0.9 && ratio > 1.25) {
    kind = "full";
    confidence = 0.6;
    reasons.push(`symétrie ${symmetry.toFixed(2)} → requalifié en terrain complet`);
  } else if (kind === "full" && symmetry < 0.6) {
    kind = "half";
    confidence = 0.55;
    reasons.push(`symétrie ${symmetry.toFixed(2)} trop faible → requalifié en demi-terrain`);
  } else {
    reasons.push(`symétrie ${symmetry.toFixed(2)}`);
  }

  let orientation: CourtOrientation = "identity";

  if (kind === "full") {
    // La Plaquette affiche le terrain complet à la VERTICALE.
    orientation = vertical ? "identity" : "rot90cw";
    reasons.push(vertical ? "terrain déjà vertical" : "terrain horizontal → rotation 90°");
  } else {
    // Demi-terrain : on cherche le côté du panier (raquette + cercles = forte
    // densité de marquage) et on le ramène en haut, comme dans la Plaquette.
    const bandFrac = 0.26;
    const top = bandDensity(px, fill, { x0: 0, y0: 0, x1: px.w, y1: px.h * bandFrac });
    const bottom = bandDensity(px, fill, { x0: 0, y0: px.h * (1 - bandFrac), x1: px.w, y1: px.h });
    const left = bandDensity(px, fill, { x0: 0, y0: 0, x1: px.w * bandFrac, y1: px.h });
    const right = bandDensity(px, fill, { x0: px.w * (1 - bandFrac), y0: 0, x1: px.w, y1: px.h });

    const best = Math.max(top, bottom, left, right);
    if (best === top) orientation = "identity";
    else if (best === bottom) orientation = "rot180";
    else if (best === left) orientation = "rot90cw";
    else orientation = "rot90ccw";

    reasons.push(
      `densité panier h=${top.toFixed(2)} b=${bottom.toFixed(2)} g=${left.toFixed(2)} d=${right.toFixed(2)} → ${orientation}`
    );
  }

  return { rect, kind, orientation, confidence: Math.max(0.2, Math.min(1, confidence)), reasons };
}

/* -------------------------------------------------------------------------- */
/* 4. Masque des lignes de terrain                                            */
/* -------------------------------------------------------------------------- */

type CourtMetrics = { widthM: number; lengthM: number };

const METRICS: Record<CourtKind, CourtMetrics> = {
  half: { widthM: 15, lengthM: 14 },
  full: { widthM: 15, lengthM: 28 },
};

/**
 * Trace les lignes officielles du terrain (repère normalisé, panier en haut).
 * Sert exclusivement à construire un masque : ces lignes ne deviennent JAMAIS
 * des objets Plaquette.
 */
export function strokeCourtLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kind: CourtKind,
  lineWidth: number
) {
  const { widthM, lengthM } = METRICS[kind];
  const X = (m: number) => (m / widthM) * w;
  const Y = (m: number) => (m / lengthM) * h;
  const RX = (m: number) => (m / widthM) * w;
  const RY = (m: number) => (m / lengthM) * h;

  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#fff";

  // Limites du terrain
  ctx.strokeRect(0, 0, w, h);

  const halfEnd = (baseY: number, direction: 1 | -1) => {
    const y = (m: number) => baseY + direction * Y(m);
    const cx = X(7.5);
    const hoopY = y(1.575);

    // Planche
    ctx.beginPath();
    ctx.moveTo(X(7.5 - 0.9), y(1.2));
    ctx.lineTo(X(7.5 + 0.9), y(1.2));
    ctx.stroke();

    // Cercle du panier
    ctx.beginPath();
    ctx.ellipse(cx, hoopY, RX(0.225), RY(0.225), 0, 0, Math.PI * 2);
    ctx.stroke();

    // Raquette
    ctx.beginPath();
    ctx.rect(X(7.5 - 2.45), baseY, X(4.9), direction * Y(5.8));
    ctx.stroke();

    // Cercle des lancers francs
    ctx.beginPath();
    ctx.ellipse(cx, y(5.8), RX(1.8), RY(1.8), 0, 0, Math.PI * 2);
    ctx.stroke();

    // Zone de non-charge
    ctx.beginPath();
    ctx.ellipse(cx, hoopY, RX(1.25), RY(1.25), 0, 0, Math.PI * 2);
    ctx.stroke();

    // Ligne à 3 points : deux segments droits + arc de 6,75 m
    const straightEndM = 1.575 + Math.sqrt(6.75 * 6.75 - 6.6 * 6.6);
    ctx.beginPath();
    ctx.moveTo(X(0.9), baseY);
    ctx.lineTo(X(0.9), y(straightEndM));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(14.1), baseY);
    ctx.lineTo(X(14.1), y(straightEndM));
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, hoopY);
    ctx.scale(1, direction);
    ctx.beginPath();
    ctx.ellipse(0, 0, RX(6.75), RY(6.75), 0, 0.12, Math.PI - 0.12);
    ctx.stroke();
    ctx.restore();
  };

  if (kind === "half") {
    halfEnd(0, 1);
    // Cercle central : seule sa moitié basse est visible sur un demi-terrain.
    ctx.beginPath();
    ctx.ellipse(X(7.5), h, RX(1.8), RY(1.8), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    halfEnd(0, 1);
    halfEnd(h, -1);
    // Ligne médiane
    ctx.beginPath();
    ctx.moveTo(0, Y(14));
    ctx.lineTo(w, Y(14));
    ctx.stroke();
    // Cercle central
    ctx.beginPath();
    ctx.ellipse(X(7.5), Y(14), RX(1.8), RY(1.8), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * Masque booléen (1 = appartient au fond géométrique du terrain).
 * `w` / `h` sont les dimensions de l'image de travail, déjà orientée
 * « panier en haut » pour un demi-terrain, « vertical » pour un complet.
 */
export function buildCourtLineMask(w: number, h: number, kind: CourtKind, tolerance = 0.024): Uint8Array {
  const mask = new Uint8Array(w * h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return mask;

  ctx.clearRect(0, 0, w, h);
  strokeCourtLines(ctx, w, h, kind, Math.max(3, tolerance * w));

  const image = ctx.getImageData(0, 0, w, h).data;
  for (let i = 0, p = 3; i < mask.length; i += 1, p += 4) {
    if (image[p] > 24) mask[i] = 1;
  }
  return mask;
}

/* -------------------------------------------------------------------------- */
/* 5. Conversions                                                             */
/* -------------------------------------------------------------------------- */

/** Applique l'orientation détectée : (u,v) bruts → (u,v) « panier en haut ». */
export function applyOrientation(u: number, v: number, orientation: CourtOrientation): AiPoint {
  switch (orientation) {
    case "rot180":
      return { x: 1 - u, y: 1 - v };
    case "rot90cw":
      return { x: 1 - v, y: u };
    case "rot90ccw":
      return { x: v, y: 1 - u };
    default:
      return { x: u, y: v };
  }
}

/** Dimensions de l'image de travail après orientation. */
export function orientedSize(w: number, h: number, orientation: CourtOrientation): { w: number; h: number } {
  return orientation === "rot90cw" || orientation === "rot90ccw" ? { w: h, h: w } : { w, h };
}

const clamp01 = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/**
 * Terrain source normalisé (0..1, panier en haut) → repère CANONIQUE Plaquette.
 * C'est LE point de conversion unique du pipeline d'import.
 */
export function courtToCanonical(point: AiPoint, kind: CourtKind): AiPoint {
  if (kind === "full") {
    const x = FULL_COURT_LEFT + clamp01(point.x) * (FULL_COURT_RIGHT - FULL_COURT_LEFT);
    const y = FULL_COURT_TOP + clamp01(point.y) * (FULL_COURT_BOTTOM - FULL_COURT_TOP);
    return { x: clamp01(x, 0.01, 0.99), y: clamp01(y, 0.01, 0.99) };
  }
  // Demi-terrain : coordonnée d'affichage puis passage en canonique (× 0.5).
  const displayX = HALF_COURT_LEFT + clamp01(point.x) * (HALF_COURT_RIGHT - HALF_COURT_LEFT);
  const displayY = HALF_COURT_TOP + clamp01(point.y) * (HALF_COURT_BOTTOM - HALF_COURT_TOP);
  return {
    x: clamp01(displayX, 0.01, 0.99),
    y: clamp01(displayY * 0.5, 0.005, 0.495),
  };
}

/** Position du panier dans le repère canonique, utile pour classer les tirs. */
export const canonicalBasket = (kind: CourtKind): AiPoint =>
  kind === "full" ? { x: 0.5, y: 0.09 } : { x: 0.5, y: 0.1 };

/** Empreinte visuelle 12×12 d'une zone, pour dédoublonner les images vidéo. */
export function regionSignature(canvas: HTMLCanvasElement, rect: AiRect): string {
  const small = document.createElement("canvas");
  small.width = 12;
  small.height = 12;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "";
  const w = Math.max(1, rect.x1 - rect.x0);
  const h = Math.max(1, rect.y1 - rect.y0);
  ctx.drawImage(canvas, rect.x0, rect.y0, w, h, 0, 0, 12, 12);
  const data = ctx.getImageData(0, 0, 12, 12).data;
  const values: number[] = [];
  let mean = 0;
  for (let i = 0; i < data.length; i += 4) {
    const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
    values.push(value);
    mean += value;
  }
  mean /= values.length || 1;
  return values.map((value) => (value < mean ? "0" : "1")).join("");
}

export function signatureDistance(a: string, b: string): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 999;
  let diff = 0;
  for (let i = 0; i < length; i += 1) if (a[i] !== b[i]) diff += 1;
  return diff;
}
