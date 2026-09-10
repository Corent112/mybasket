/**
 * lib/import/homography.ts
 * ---------------------------------------------------------------------------
 * Algèbre minimale pour redresser une photo de terrain.
 *
 * Une homographie est la transformation qui relie deux vues planes d'un même
 * plan. Un terrain de basket EST un plan : quelle que soit la position de
 * l'appareil (de biais, en hauteur, penché), l'image du terrain se déduit du
 * terrain réel par une homographie. Il suffit donc de quatre correspondances de
 * points pour retrouver la transformation, et l'inverser pour obtenir une vue
 * de dessus parfaite.
 *
 * C'est ce qui manquait au pipeline : tout le reste supposait un terrain vu de
 * face, sans rotation ni perspective — autrement dit une capture d'écran, pas
 * une photo.
 *
 * Aucune dépendance : 3×3, résolution par élimination de Gauss.
 */

export type Matrix3 = [number, number, number, number, number, number, number, number, number];

export type Point = { x: number; y: number };

/**
 * Homographie envoyant les 4 points `from` sur les 4 points `to`.
 * DLT classique : 8 inconnues (h33 = 1), donc un système 8×8.
 * Renvoie null si la configuration est dégénérée (points alignés, confondus).
 */
export function solveHomography(from: Point[], to: Point[]): Matrix3 | null {
  if (from.length < 4 || to.length < 4) return null;

  // A · h = b
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem(a, b);
  if (!h) return null;
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Élimination de Gauss avec pivot partiel. */
function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null;
    if (pivot !== col) {
      const swap = m[pivot];
      m[pivot] = m[col];
      m[col] = swap;
    }
    const divisor = m[col][col];
    for (let k = col; k <= n; k += 1) m[col][k] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      if (!factor) continue;
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }

  return m.map((row) => row[n]);
}

/** Applique une homographie à un point. */
export function applyHomography(matrix: Matrix3, point: Point): Point {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const w = g * point.x + h * point.y + i;
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0 };
  return {
    x: (a * point.x + b * point.y + c) / w,
    y: (d * point.x + e * point.y + f) / w,
  };
}

/** Inverse d'une matrice 3×3 (null si singulière). */
export function invert(matrix: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    (e * i - f * h) * inv,
    (c * h - b * i) * inv,
    (b * f - c * e) * inv,
    (f * g - d * i) * inv,
    (a * i - c * g) * inv,
    (c * d - a * f) * inv,
    (d * h - e * g) * inv,
    (b * g - a * h) * inv,
    (a * e - b * d) * inv,
  ];
}

/* -------------------------------------------------------------------------- */
/* Droites et quadrilatères                                                   */
/* -------------------------------------------------------------------------- */

/** Droite en forme normale : x·cosθ + y·sinθ = ρ. */
export type Line = { theta: number; rho: number; weight: number };

/** Intersection de deux droites normales, null si quasi parallèles. */
export function intersect(a: Line, b: Line): Point | null {
  const ca = Math.cos(a.theta);
  const sa = Math.sin(a.theta);
  const cb = Math.cos(b.theta);
  const sb = Math.sin(b.theta);
  const det = ca * sb - sa * cb;
  if (Math.abs(det) < 1e-6) return null;
  return {
    x: (a.rho * sb - b.rho * sa) / det,
    y: (ca * b.rho - cb * a.rho) / det,
  };
}

/** Aire signée d'un polygone (positive si sens trigonométrique inverse). */
export function polygonArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/** Un quadrilatère est convexe si tous ses produits vectoriels ont le même signe. */
export function isConvex(quad: Point[]): boolean {
  if (quad.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const current = cross > 0 ? 1 : -1;
    if (!sign) sign = current;
    else if (sign !== current) return false;
  }
  return sign !== 0;
}

/**
 * Ordonne 4 points en sens horaire à partir du coin le plus en haut à gauche.
 * Indispensable : une homographie construite sur des coins mal appariés produit
 * une image repliée sur elle-même.
 */
export function orderQuad(points: Point[]): Point[] {
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const sorted = [...points].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
  // Démarre au point le plus proche du coin supérieur gauche.
  let start = 0;
  let best = Infinity;
  for (let i = 0; i < sorted.length; i += 1) {
    const score = sorted[i].x + sorted[i].y;
    if (score < best) {
      best = score;
      start = i;
    }
  }
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]);
}
