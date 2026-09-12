/**
 * lib/import/court-geometry.ts
 * ---------------------------------------------------------------------------
 * Le terrain présent dans l'image source sert UNIQUEMENT de repère géométrique.
 * Il n'est jamais reproduit sous forme de tracés.
 *
 * Ce module :
 *   1. isole le rectangle du terrain dans la zone Graphic ;
 *   1bis. isole l'AIRE DE JEU à l'intérieur (les lignes de touche / de fond) ;
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
 *
 * ---------------------------------------------------------------------------
 * NOTE DE CORRECTION (import v2)
 * Le pipeline confondait trois rectangles distincts :
 *   (1) la zone graphique,
 *   (2) l'IMAGE du terrain (bois + cadre + bandeau/filigrane),
 *   (3) l'AIRE DE JEU (l'intérieur des lignes blanches).
 * Toute la conversion en canonique suppose (3). Quand on lui donnait (1) ou
 * (2), le masque des lignes tombait à côté, le panier était mal placé, et tout
 * ce qui se trouvait dans la marge se retrouvait ÉCRASÉ sur le bord par le
 * clamp — d'où les amas de pastilles sur la ligne de fond.
 *
 * `detectPlayingArea()` isole désormais (3). Il est volontairement conservateur :
 * chaque côté non trouvé retombe sur le bord du rectangle fourni, donc au pire
 * on retrouve exactement le comportement précédent.
 */

import type { AiPoint, AiRect } from "./types";

export type CourtKind = "half" | "full";
export type CourtOrientation = "identity" | "rot180" | "rot90cw" | "rot90ccw";

export type CourtGeometry = {
  /** Rectangle du terrain dans les pixels de l'image source (bois + marges). */
  rect: AiRect;
  /**
   * Aire de jeu (intérieur des lignes de touche / de fond) dans les pixels de
   * l'image source. C'est LE repère de conversion. Toujours inclus dans `rect`.
   * Optionnel pour ne casser aucun appelant existant : absent, les consommateurs
   * retombent sur `rect` (comportement historique).
   */
  play?: AiRect;
  /** true si l'aire de jeu a été détectée, false si elle retombe sur `rect`. */
  playDetected?: boolean;
  /** Nombre de côtés du terrain réellement trouvés (0..4). */
  playSides?: number;
  /** Côtés réellement vus, par opposition à un repli sur le bord de l'image. */
  playEdges?: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  /** true si l'aire de jeu déduite dépasse l'image : le terrain est coupé. */
  playCropped?: boolean;
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

/** Teinte 0..360. Utile pour distinguer un ballon orange d'un jeton bordeaux. */
export const hueOf = (r: number, g: number, b: number): number => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
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
/* 1ter. Isolation de l'AIRE DE JEU (lignes de touche et de fond)             */
/* -------------------------------------------------------------------------- */

/**
 * Cherche, dans les 32 % extérieurs de chaque côté, la première LIGNE DROITE
 * continue : c'est une ligne de touche ou de fond.
 *
 * On raisonne sur le plus long segment CONTINU et non sur un simple comptage :
 * un filigrane (« MYBASKET.FR »), un titre ou une légende occupent beaucoup de
 * pixels clairs sur une ligne, mais jamais de façon continue.
 *
 * Conservateur par construction : chaque côté non trouvé retombe sur le bord
 * du rectangle fourni, donc au pire on retrouve le comportement précédent.
 */
export type PlayingArea = {
  rect: AiRect;
  found: boolean;
  sides: number;
  /** Côtés réellement vus (par opposition à un repli sur le bord de l'image). */
  edges: { top: boolean; bottom: boolean; left: boolean; right: boolean };
  reason: string;
};

export function detectPlayingArea(canvas: HTMLCanvasElement, rect: AiRect): PlayingArea {
  const fallback: PlayingArea = {
    rect: { ...rect },
    found: false,
    sides: 0,
    edges: { top: false, bottom: false, left: false, right: false },
    reason: "aire de jeu non détectée",
  };
  const px = readPixels(canvas, rect);
  if (px.w < 24 || px.h < 24) return fallback;

  const step = Math.max(1, Math.round(Math.min(px.w, px.h) / 300));

  // Régime clair (feuille de papier) ou terrain colorié ?
  let bright = 0;
  let total = 0;
  for (let y = 0; y < px.h; y += step * 3) {
    for (let x = 0; x < px.w; x += step * 3) {
      const [r, g, b] = pixelAt(px, x, y);
      total += 1;
      if ((r + g + b) / 3 > 205) bright += 1;
    }
  }
  const paper = total > 0 && bright / total > 0.55;

  const isLine = (x: number, y: number): boolean => {
    const [r, g, b] = pixelAt(px, x, y);
    const avg = (r + g + b) / 3;
    return paper ? avg < 130 : avg > 176 && saturationOf(r, g, b) < 0.3;
  };

  /**
   * Note « c'est une ligne de bord » pour une rangée ou une colonne.
   *
   * Deux mesures, on garde la meilleure :
   *
   *  1. le PLUS LONG SEGMENT CONTINU (tolérance de 2 échantillons pour
   *     l'anticrénelage) — le cas simple, une ligne tracée d'un bord à l'autre ;
   *
   *  2. la PORTÉE × REMPLISSAGE : distance du premier au dernier pixel de ligne,
   *     retenue seulement si la majeure partie de cette portée est effectivement
   *     tracée.
   *
   * La deuxième mesure existe parce qu'une raquette PEINTE posée sur la ligne de
   * fond coupe celle-ci en deux tronçons. Chaque tronçon fait environ un quart de
   * la largeur du terrain : avec le seul critère du plus long segment, la ligne de
   * fond devient invisible et l'aire de jeu part du bord de l'image. C'est le cas
   * de tous les graphiques de terrain à raquette pleine — la majorité des dessins
   * de coach, et le gabarit de MyBasket lui-même.
   *
   * Une ligne de bord reste une ligne de bord quand un aplat la traverse ; en
   * revanche une rangée qui traverse trois objets épars a une portée large mais un
   * remplissage faible, et reste écartée.
   */
  const SPAN_FILL = 0.6;

  const runScore = (fixed: number, horizontal: boolean): number => {
    const length = horizontal ? px.w : px.h;
    let best = 0;
    let current = 0;
    let gap = 0;
    let first = -1;
    let last = -1;
    let covered = 0;
    let samples = 0;
    for (let i = 0; i < length; i += step) {
      const on = horizontal ? isLine(i, fixed) : isLine(fixed, i);
      samples += 1;
      if (on) {
        covered += 1;
        if (first < 0) first = i;
        last = i;
        current += gap + 1;
        gap = 0;
        if (current > best) best = current;
      } else if (current > 0 && gap < 2) {
        gap += 1;
      } else {
        current = 0;
        gap = 0;
      }
    }
    void samples;

    const longest = (best * step) / length;
    if (first < 0 || last <= first) return longest;

    const spanPx = last - first + step;
    const spanSamples = Math.max(1, Math.round(spanPx / step));
    const fill = covered / spanSamples;
    const span = fill >= SPAN_FILL ? spanPx / length : 0;

    return Math.max(longest, span);
  };

  const THRESHOLD = 0.55;
  const band = 0.32;

  const scanRows = (from: number, to: number, direction: 1 | -1): number | null => {
    for (let y = from; direction > 0 ? y <= to : y >= to; y += direction * step) {
      if (runScore(y, true) >= THRESHOLD) return y;
    }
    return null;
  };
  const scanCols = (from: number, to: number, direction: 1 | -1): number | null => {
    for (let x = from; direction > 0 ? x <= to : x >= to; x += direction * step) {
      if (runScore(x, false) >= THRESHOLD) return x;
    }
    return null;
  };

  const top = scanRows(0, Math.floor(px.h * band), 1);
  const bottom = scanRows(px.h - 1, Math.ceil(px.h * (1 - band)), -1);
  const left = scanCols(0, Math.floor(px.w * band), 1);
  const right = scanCols(px.w - 1, Math.ceil(px.w * (1 - band)), -1);

  const sides = [top, bottom, left, right].filter((value) => value !== null).length;
  if (sides < 2) return fallback;

  const y0 = top ?? 0;
  const y1 = bottom ?? px.h - 1;
  const x0 = left ?? 0;
  const x1 = right ?? px.w - 1;

  // Garde-fou : une aire de jeu qui ne couvre presque rien est une erreur de
  // détection (un trait isolé, une légende soulignée…).
  if (x1 - x0 < px.w * 0.4 || y1 - y0 < px.h * 0.35) return fallback;

  return {
    rect: {
      x0: rect.x0 + x0,
      y0: rect.y0 + y0,
      x1: rect.x0 + x1 + 1,
      y1: rect.y0 + y1 + 1,
    },
    found: true,
    // Quel côté a été VU, et lequel n'est qu'un repli sur le bord de l'image.
    // Sans cette distinction, on ne peut pas savoir si la longueur mesurée est
    // une mesure ou un artefact de cadrage.
    edges: {
      top: top !== null,
      bottom: bottom !== null,
      left: left !== null,
      right: right !== null,
    },
    sides,
    reason: `aire de jeu : ${sides}/4 côtés détectés (${paper ? "trait sombre" : "ligne claire"})`,
  };
}

/* -------------------------------------------------------------------------- */
/* 1bis. Détection VISUELLE d'un terrain, sans dépendre de l'OCR              */
/* -------------------------------------------------------------------------- */
/**
 * Repli indispensable : sur une photo, l'étiquette « Graphic N° » n'existe pas.
 * On propose alors des régions candidates de façon PERMISSIVE, et c'est la
 * détection d'éléments (diagram-vision) qui tranche : une région sans joueur ni
 * tracé est rejetée en aval. C'est plus robuste qu'un détecteur strict qui
 * laisserait passer zéro terrain.
 *
 * Méthode : un dessin d'exercice est presque toujours une SURFACE de jeu posée
 * sur un fond de couleur différente (bandeau bleu, fond bordeaux, page…). On
 * cherche donc les grands aplats colorés, puis, à l'intérieur, les régions qui
 * ne sont PAS de cette couleur : ce sont les terrains.
 */

type Mask = { data: Uint8Array; w: number; h: number };

const makeMask = (w: number, h: number): Mask => ({ data: new Uint8Array(w * h), w, h });

function dilate(mask: Mask, radius: number): Mask {
  const out = makeMask(mask.w, mask.h);
  for (let y = 0; y < mask.h; y += 1) {
    for (let x = 0; x < mask.w; x += 1) {
      if (!mask.data[y * mask.w + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= mask.h) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= mask.w) continue;
          out.data[yy * mask.w + xx] = 1;
        }
      }
    }
  }
  return out;
}

function erode(mask: Mask, radius: number): Mask {
  const out = makeMask(mask.w, mask.h);
  for (let y = 0; y < mask.h; y += 1) {
    for (let x = 0; x < mask.w; x += 1) {
      let keep = 1;
      for (let dy = -radius; dy <= radius && keep; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= mask.h) { keep = 0; break; }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= mask.w || !mask.data[yy * mask.w + xx]) { keep = 0; break; }
        }
      }
      out.data[y * mask.w + x] = keep;
    }
  }
  return out;
}

const close = (m: Mask, r = 2) => erode(dilate(m, r), r);
const open = (m: Mask, r = 1) => dilate(erode(m, r), r);

type Blob = { x0: number; y0: number; x1: number; y1: number; area: number };

/** Composantes connexes 4-voisins d'un masque. */
function blobs(mask: Mask, minArea: number): Blob[] {
  const seen = new Uint8Array(mask.w * mask.h);
  const out: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.data.length; start += 1) {
    if (!mask.data[start] || seen[start]) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    let x0 = mask.w;
    let x1 = -1;
    let y0 = mask.h;
    let y1 = -1;
    let area = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % mask.w;
      const y = (p / mask.w) | 0;
      area += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && mask.data[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < mask.w - 1 && mask.data[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && mask.data[p - mask.w] && !seen[p - mask.w]) { seen[p - mask.w] = 1; stack.push(p - mask.w); }
      if (y < mask.h - 1 && mask.data[p + mask.w] && !seen[p + mask.w]) { seen[p + mask.w] = 1; stack.push(p + mask.w); }
    }
    if (area >= minArea) out.push({ x0, y0, x1: x1 + 1, y1: y1 + 1, area });
  }
  return out;
}

export type CourtCandidate = {
  /** Rectangle dans les pixels de l'image SOURCE. */
  rect: AiRect;
  area: number;
  fill: number;
  ratio: number;
  /** Origine de la proposition, pour le panneau de debug. */
  from: string;
};

const WORK_W = 400;

/**
 * Propose les régions susceptibles de contenir un terrain de basket.
 * Permissif par construction : le tri final est fait par la détection
 * d'éléments, qui rejette toute région sans joueur ni tracé.
 */
export function detectCourtCandidates(canvas: HTMLCanvasElement, limit = 6): CourtCandidate[] {
  const scale = Math.min(1, WORK_W / canvas.width);
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));

  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!sctx) return [];
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, w, h);
  const px = sctx.getImageData(0, 0, w, h).data;

  const at = (i: number) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]] as const;

  // 1. aplats colorés = « panneaux » (bandeau bleu, fond bordeaux, page teintée…)
  const colored = makeMask(w, h);
  for (let i = 0; i < w * h; i += 1) {
    const [r, g, b] = at(i);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (sat > 0.2 && mx > 38) colored.data[i] = 1;
  }
  const panels = blobs(close(colored, 1), Math.round(0.05 * w * h))
    .sort((a, b) => b.area - a.area)
    .slice(0, 2);

  const proposals: CourtCandidate[] = [];
  const inv = 1 / scale;
  const pushBlob = (blob: Blob, from: string) => {
    const bw = blob.x1 - blob.x0;
    const bh = blob.y1 - blob.y0;
    if (bw < 4 || bh < 4) return;
    const fill = blob.area / (bw * bh);
    const ratio = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    if (blob.area < 0.03 * w * h) return;
    if (ratio > 3 || fill < 0.5) return;
    proposals.push({
      rect: { x0: blob.x0 * inv, y0: blob.y0 * inv, x1: blob.x1 * inv, y1: blob.y1 * inv },
      area: blob.area,
      fill,
      ratio,
      from,
    });
  };

  // 2. dans chaque panneau, ce qui n'est PAS la couleur du panneau = surface de jeu
  for (const panel of panels) {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let n = 0;
    for (let y = panel.y0; y < panel.y1; y += 1) {
      for (let x = panel.x0; x < panel.x1; x += 1) {
        const i = y * w + x;
        if (!colored.data[i]) continue;
        const [r, g, b] = at(i);
        sr += r; sg += g; sb += b; n += 1;
      }
    }
    if (!n) continue;
    const pr = sr / n;
    const pg = sg / n;
    const pb = sb / n;

    const surface = makeMask(w, h);
    for (let y = panel.y0; y < panel.y1; y += 1) {
      for (let x = panel.x0; x < panel.x1; x += 1) {
        const i = y * w + x;
        const [r, g, b] = at(i);
        const d = Math.sqrt((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2);
        const mx = Math.max(r, g, b);
        if (d > 70 && mx > 64) surface.data[i] = 1;
      }
    }
    for (const blob of blobs(open(close(surface, 2), 1), Math.round(0.03 * w * h))) {
      pushBlob(blob, "surface");
    }
    // le panneau lui-même peut être le terrain (terrain colorié plein cadre)
    pushBlob(panel, "panneau");
  }

  // 3. repli : encre sur fond clair (feuille papier, capture recadrée)
  if (!proposals.length) {
    const ink = makeMask(w, h);
    for (let i = 0; i < w * h; i += 1) {
      const [r, g, b] = at(i);
      if ((r + g + b) / 3 < 236) ink.data[i] = 1;
    }
    for (const blob of blobs(close(ink, 2), Math.round(0.05 * w * h))) pushBlob(blob, "encre");
  }

  // 4. dernier repli : l'image entière est le terrain (photo déjà recadrée)
  if (!proposals.length) {
    proposals.push({
      rect: { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height },
      area: w * h,
      fill: 1,
      ratio: Math.max(w, h) / Math.min(w, h),
      from: "image entière",
    });
  }

  proposals.sort((a, b) => b.area - a.area);
  const kept: CourtCandidate[] = [];
  for (const p of proposals) {
    const overlap = kept.some((k) => {
      const ix = Math.max(0, Math.min(p.rect.x1, k.rect.x1) - Math.max(p.rect.x0, k.rect.x0));
      const iy = Math.max(0, Math.min(p.rect.y1, k.rect.y1) - Math.max(p.rect.y0, k.rect.y0));
      const inter = ix * iy;
      const ua =
        (p.rect.x1 - p.rect.x0) * (p.rect.y1 - p.rect.y0) +
        (k.rect.x1 - k.rect.x0) * (k.rect.y1 - k.rect.y0) -
        inter;
      return ua > 0 && inter / ua > 0.3;
    });
    if (!overlap) kept.push(p);
    if (kept.length >= limit) break;
  }
  return kept;
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

type PaintSide = "top" | "bottom" | "left" | "right";

/**
 * Cherche les RAQUETTES : des blocs compacts de couleur nettement différente du
 * reste du terrain, centrés sur un axe et collés à un bord. C'est le repère le
 * plus fiable, à la fois pour l'orientation d'un demi-terrain (la Plaquette
 * place toujours le panier en haut) et pour la distinction demi / complet :
 * DEUX raquettes opposées ⇒ terrain complet.
 */
/**
 * Côtés du terrain portant une RAQUETTE peinte (aplat de couleur différente du
 * sol, aux proportions d'une raquette). Un demi-terrain en a une, un terrain
 * complet en a deux, opposées. C'est le seul indice indépendant de la géométrie
 * des lignes — donc le seul capable de contredire un gabarit qui « colle » bien.
 */
export function findPaintSides(px: Pixels): PaintSide[] {
  const step = Math.max(1, Math.round(Math.min(px.w, px.h) / 160));
  const gw = Math.ceil(px.w / step);
  const gh = Math.ceil(px.h / step);

  // couleur médiane approximative du terrain
  const samples: number[][] = [];
  for (let gy = 0; gy < gh; gy += 2) {
    for (let gx = 0; gx < gw; gx += 2) {
      samples.push([...pixelAt(px, gx * step, gy * step)]);
    }
  }
  if (!samples.length) return [];
  const med = [0, 1, 2].map((c) => {
    const v = samples.map((s) => s[c]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  });

  // Sur un terrain colorié, les LIGNES peintes (claires et désaturées) forment
  // un réseau connexe qui relie la raquette au reste du marquage : la raquette
  // disparaissait alors dans un blob géant, rejeté pour cause de remplissage
  // trop faible. On les écarte du masque : une raquette est un APLAT DE COULEUR.
  const paper = (med[0] + med[1] + med[2]) / 3 > 200;
  const isPaintedLine = (r: number, g: number, b: number) =>
    !paper && (r + g + b) / 3 > 190 && saturationOf(r, g, b) < 0.35;

  const mask = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const [r, g, b] = pixelAt(px, gx * step, gy * step);
      if (isPaintedLine(r, g, b)) continue;
      const d = Math.sqrt((r - med[0]) ** 2 + (g - med[1]) ** 2 + (b - med[2]) ** 2);
      if (d > 90) mask[gy * gw + gx] = 1;
    }
  }

  const seen = new Uint8Array(gw * gh);
  const found: Array<{ side: PaintSide; area: number }> = [];
  for (let s0 = 0; s0 < mask.length; s0 += 1) {
    if (!mask[s0] || seen[s0]) continue;
    seen[s0] = 1;
    const stack = [s0];
    let x0 = gw;
    let x1 = -1;
    let y0 = gh;
    let y1 = -1;
    let area = 0;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % gw;
      const y = (p / gw) | 0;
      area += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - gw, p + gw]) {
        if (q < 0 || q >= mask.length || seen[q] || !mask[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === gw - 1)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const frac = area / (gw * gh);
    if (frac < 0.015 || frac > 0.30) continue;
    if (area / (bw * bh) < 0.55) continue;

    // Une raquette FIBA mesure 4,9 × 5,8 m : elle occupe environ un tiers de la
    // largeur du terrain et deux cinquièmes de sa longueur. Sans ces bornes, un
    // bandeau décoratif collé au bord (le logo du gabarit MyBasket sur le cercle
    // central, par exemple) passait pour une raquette et RETOURNAIT le terrain.
    const fw = bw / gw;
    const fh = bh / gh;
    const cx = (x0 + x1) / 2 / gw;
    const cy = (y0 + y1) / 2 / gh;
    const near = 0.14;

    let side: PaintSide | null = null;
    const horizontalOk = fw > 0.15 && fw < 0.62 && fh > 0.15 && fh < 0.68;
    const verticalOk = fh > 0.15 && fh < 0.62 && fw > 0.15 && fw < 0.68;
    if (horizontalOk && Math.abs(cx - 0.5) < 0.22 && y0 / gh < near) side = "top";
    else if (horizontalOk && Math.abs(cx - 0.5) < 0.22 && y1 / gh > 1 - near) side = "bottom";
    else if (verticalOk && Math.abs(cy - 0.5) < 0.22 && x0 / gw < near) side = "left";
    else if (verticalOk && Math.abs(cy - 0.5) < 0.22 && x1 / gw > 1 - near) side = "right";
    if (side) found.push({ side, area });
  }

  found.sort((a, b) => b.area - a.area);
  const sides: PaintSide[] = [];
  for (const item of found) if (!sides.includes(item.side)) sides.push(item.side);
  return sides;
}

/** @deprecated conservé pour compatibilité — utiliser findPaintSides(). */
function findKeyBlock(px: Pixels): { side: PaintSide } | null {
  const sides = findPaintSides(px);
  return sides.length ? { side: sides[0] } : null;
}

export function classifyCourt(canvas: HTMLCanvasElement, rect: AiRect): CourtGeometry {
  const reasons: string[] = [];

  // L'aire de jeu est le SEUL repère fiable : la bbox du bois inclut les marges,
  // le cadre et le filigrane, ce qui fausse à la fois le ratio et la conversion.
  const area = detectPlayingArea(canvas, rect);
  const play = area.rect;
  reasons.push(area.reason);

  const px = readPixels(canvas, play);
  const palette = dominantColors(px, 3);
  const fill = palette[0] && palette[0].share > 0.18 ? palette[0] : null;

  const w = play.x1 - play.x0;
  const h = play.y1 - play.y0;
  const longSide = Math.max(w, h);
  const shortSide = Math.max(1, Math.min(w, h));
  const ratio = longSide / shortSide;
  const vertical = h >= w;

  // Terrain complet FIBA : 28 × 15 → 1.87. Demi-terrain : 15 × 14 → 1.07.
  let kind: CourtKind = ratio > 1.45 ? "full" : "half";
  let confidence = Math.min(1, Math.abs(ratio - 1.45) / 0.45 + 0.35);
  reasons.push(`ratio ${ratio.toFixed(2)} → ${kind}`);

  const paintSides = findPaintSides(px);
  const opposite =
    (paintSides.includes("top") && paintSides.includes("bottom")) ||
    (paintSides.includes("left") && paintSides.includes("right"));

  if (opposite && ratio > 1.3) {
    kind = "full";
    confidence = 0.9;
    reasons.push(`deux raquettes opposées (${paintSides.join("+")}) → terrain complet`);
  } else if (paintSides.length === 1 && ratio < 1.6) {
    kind = "half";
    confidence = 0.85;
    reasons.push(`une seule raquette (${paintSides[0]}) → demi-terrain`);
  } else {
    // Repli historique par symétrie. ATTENTION : un demi-terrain en paysage est
    // lui aussi symétrique selon son axe long (la largeur de 15 m EST son axe de
    // symétrie). Le test ne discrimine donc rien en dessous de 1.55 — d'où le
    // seuil relevé, sans quoi un demi-terrain à 1.27 basculait en « complet ».
    const symmetry = mirrorScore(px, vertical);
    if (kind === "half" && symmetry > 0.9 && ratio > 1.55) {
      kind = "full";
      confidence = 0.6;
      reasons.push(`symétrie ${symmetry.toFixed(2)} + ratio ${ratio.toFixed(2)} → requalifié en terrain complet`);
    } else if (kind === "full" && symmetry < 0.6) {
      kind = "half";
      confidence = 0.55;
      reasons.push(`symétrie ${symmetry.toFixed(2)} trop faible → requalifié en demi-terrain`);
    } else {
      reasons.push(`symétrie ${symmetry.toFixed(2)}`);
    }
  }

  let orientation: CourtOrientation = "identity";

  if (kind === "full") {
    // La Plaquette affiche le terrain complet à la VERTICALE.
    orientation = vertical ? "identity" : "rot90cw";
    reasons.push(vertical ? "terrain déjà vertical" : "terrain horizontal → rotation 90°");
  } else {
    // Demi-terrain : on cherche le côté du panier et on le ramène en haut.
    const key = paintSides.length ? { side: paintSides[0] } : findKeyBlock(px);
    if (key) {
      orientation = key.side === "top" ? "identity"
        : key.side === "bottom" ? "rot180"
        : key.side === "left" ? "rot90cw"
        : "rot90ccw";
      reasons.push(`raquette détectée côté ${key.side} → ${orientation}`);
    } else {
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
        `pas de raquette ; densité h=${top.toFixed(2)} b=${bottom.toFixed(2)} g=${left.toFixed(2)} d=${right.toFixed(2)} → ${orientation}`
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Longueur DÉDUITE de la largeur                                           */
  /* ------------------------------------------------------------------------ */
  /**
   * Les proportions d'un terrain sont fixes : 15 × 14 m en demi-terrain,
   * 15 × 28 m en terrain complet. Dès que la ligne de fond et les deux lignes de
   * touche sont vues, la longueur SE CALCULE — il n'est jamais nécessaire de voir
   * la ligne médiane.
   *
   * C'est indispensable parce qu'un dessin de coach est très souvent COUPÉ : il
   * montre la moitié utile du demi-terrain et s'arrête. Sans cette déduction, le
   * moteur étire les 14 m sur ce qui n'en fait que 11 ou 12, et tout ce qui est
   * dessiné se retrouve poussé vers la ligne médiane de plusieurs mètres.
   *
   * On ne remplace la longueur QUE si le côté opposé à la ligne de fond n'a pas
   * été réellement vu : quand les quatre côtés sont là, on garde la mesure.
   * L'aire de jeu peut alors dépasser l'image — c'est normal, et c'est même
   * l'information utile : le terrain est coupé.
   */
  const finalPlay = { ...play };
  let cropped = false;

  if (area.found && area.edges.left && area.edges.right) {
    const widthPx = finalPlay.x1 - finalPlay.x0;
    const heightPx = finalPlay.y1 - finalPlay.y0;
    const expected = (widthPx / METRICS[kind].widthM) * METRICS[kind].lengthM;
    const verticalCourt = heightPx >= widthPx || kind === "half";

    // Uniquement pour un terrain déjà « debout » dans l'image : sur un terrain
    // couché, largeur et longueur sont échangées et la déduction se ferait à
    // l'envers. La rotation est appliquée plus loin, pas ici.
    if (verticalCourt && expected > 4) {
      const baselineSeen = orientation === "rot180" ? area.edges.bottom : area.edges.top;

      // On déduit MÊME si une ligne a été trouvée en face : sur un dessin coupé,
      // cette « ligne » est le bord de l'image, la ligne des 3 points ou une
      // table de marque, jamais la ligne médiane. Les deux lignes de touche, elles,
      // sont longues, franches et rarement fausses : la largeur est la mesure sûre,
      // et les proportions du terrain font le reste.
      if (baselineSeen && Math.abs(expected - heightPx) / expected > 0.06) {
        if (orientation === "rot180") finalPlay.y0 = finalPlay.y1 - expected;
        else finalPlay.y1 = finalPlay.y0 + expected;
        cropped = finalPlay.y1 > canvas.height || finalPlay.y0 < 0;
        reasons.push(
          `longueur déduite de la largeur (${METRICS[kind].widthM} × ${METRICS[kind].lengthM} m) : ` +
            `${Math.round(heightPx)} px mesurés → ${Math.round(expected)} px` +
            (cropped ? " ; le terrain est coupé par le bord de l'image" : "")
        );
      }
    }
  }

  return {
    rect,
    play: finalPlay,
    playDetected: area.found,
    playSides: area.sides,
    playEdges: area.edges,
    playCropped: cropped,
    kind,
    orientation,
    confidence: Math.max(0.2, Math.min(1, confidence)),
    reasons,
  };
}

/* -------------------------------------------------------------------------- */
/* 4. Masque des lignes de terrain                                            */
/* -------------------------------------------------------------------------- */

type CourtMetrics = { widthM: number; lengthM: number };

const METRICS: Record<CourtKind, CourtMetrics> = {
  half: { widthM: 15, lengthM: 14 },
  full: { widthM: 15, lengthM: 28 },
};

/** Longueur du terrain en mètres, selon le type. Utile hors de ce module. */
export const courtLengthM = (kind: CourtKind): number => METRICS[kind].lengthM;

/**
 * Trace les lignes officielles du terrain (repère normalisé, panier en haut).
 * Sert exclusivement à construire un masque : ces lignes ne deviennent JAMAIS
 * des objets Plaquette.
 */
/**
 * Quels marquages tracer.
 *
 * `keepThinStrokes` ne traite pas les droites et les courbes de la même façon :
 * mesuré sur le second terrain du cas 02, l'amincissement fait passer le cercle
 * restrictif de 91 % à 0 % de marquages retrouvés et la raquette de 88 % à
 * 39 %, tandis que l'arc à 3 points reste à 48 % dans les deux cas. Il faut
 * donc pouvoir noter les deux familles sur des cartes différentes, et c'est la
 * même géométrie qui doit produire les deux gabarits — pas une copie.
 */
export type CourtMarkingFamily = "all" | "straight" | "curved" | "key";

export function strokeCourtLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kind: CourtKind,
  lineWidth: number,
  only: CourtMarkingFamily = "all"
) {
  const wantStraight = only === "all" || only === "straight";
  const wantCurved = only === "all" || only === "curved";
  // La RAQUETTE seule : c'est le marquage le plus distinctif d'un demi-terrain,
  // et le seul qui survive au moiré sur une photo d'écran. Elle sert de preuve
  // structurelle au second chemin d'acceptation (voir court-rectify.ts).
  const onlyKey = only === "key";
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
  if (wantStraight && !onlyKey) ctx.strokeRect(0, 0, w, h);

  const halfEnd = (baseY: number, direction: 1 | -1) => {
    const y = (m: number) => baseY + direction * Y(m);
    const cx = X(7.5);
    const hoopY = y(1.575);

    // Planche
    if (wantStraight && !onlyKey) {
      ctx.beginPath();
      ctx.moveTo(X(7.5 - 0.9), y(1.2));
      ctx.lineTo(X(7.5 + 0.9), y(1.2));
      ctx.stroke();
    }

    // Cercle du panier
    if (wantCurved) {
      ctx.beginPath();
      ctx.ellipse(cx, hoopY, RX(0.225), RY(0.225), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Raquette
    if (wantStraight || onlyKey) {
      ctx.beginPath();
      ctx.rect(X(7.5 - 2.45), baseY, X(4.9), direction * Y(5.8));
      ctx.stroke();
    }

    // Cercle des lancers francs
    if (wantCurved) {
      ctx.beginPath();
      ctx.ellipse(cx, y(5.8), RX(1.8), RY(1.8), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Zone de non-charge
    if (wantCurved) {
      ctx.beginPath();
      ctx.ellipse(cx, hoopY, RX(1.25), RY(1.25), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ligne à 3 points : deux segments droits + arc de 6,75 m
    const straightEndM = 1.575 + Math.sqrt(6.75 * 6.75 - 6.6 * 6.6);
    if (wantStraight && !onlyKey) {
      ctx.beginPath();
      ctx.moveTo(X(0.9), baseY);
      ctx.lineTo(X(0.9), y(straightEndM));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(14.1), baseY);
      ctx.lineTo(X(14.1), y(straightEndM));
      ctx.stroke();
    }

    if (wantCurved) {
      ctx.save();
      ctx.translate(cx, hoopY);
      ctx.scale(1, direction);
      ctx.beginPath();
      ctx.ellipse(0, 0, RX(6.75), RY(6.75), 0, 0.12, Math.PI - 0.12);
      ctx.stroke();
      ctx.restore();
    }
  };

  if (kind === "half") {
    halfEnd(0, 1);
    // Cercle central : seule sa moitié basse est visible sur un demi-terrain.
    if (wantCurved) {
      ctx.beginPath();
      ctx.ellipse(X(7.5), h, RX(1.8), RY(1.8), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    halfEnd(0, 1);
    halfEnd(h, -1);
    // Ligne médiane
    if (wantStraight && !onlyKey) {
      ctx.beginPath();
      ctx.moveTo(0, Y(14));
      ctx.lineTo(w, Y(14));
      ctx.stroke();
    }
    // Cercle central
    if (wantCurved) {
      ctx.beginPath();
      ctx.ellipse(X(7.5), Y(14), RX(1.8), RY(1.8), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/**
 * Masque booléen (1 = appartient au fond géométrique du terrain).
 *
 * `w` / `h` sont les dimensions de l'image de travail, déjà orientée
 * « panier en haut » pour un demi-terrain, « vertical » pour un complet.
 *
 * `play` situe l'AIRE DE JEU dans cette image de travail. Omis, il retombe sur
 * l'image entière — c'est-à-dire le comportement historique.
 *
 * L'épaisseur par défaut est passée de 0.024 à 0.012 de la largeur du terrain :
 * à 0.024 le masque faisait 22 px sur un canvas de 900 et effaçait les tracés
 * du coach qui longent une ligne.
 */
export function buildCourtLineMask(
  w: number,
  h: number,
  kind: CourtKind,
  play?: AiRect,
  tolerance = 0.012
): Uint8Array {
  const mask = new Uint8Array(w * h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return mask;

  const area: AiRect = play ?? { x0: 0, y0: 0, x1: w, y1: h };
  const aw = Math.max(1, area.x1 - area.x0);
  const ah = Math.max(1, area.y1 - area.y0);

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(area.x0, area.y0);
  strokeCourtLines(ctx, aw, ah, kind, Math.max(2, tolerance * aw));
  ctx.restore();

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
  // HORS TERRAIN N'EST PAS UNE ERREUR.
  //
  // La coordonnée reçue est relative à l'AIRE DE JEU : 0 = ligne de touche
  // gauche, 1 = ligne de touche droite. Elle était bornée à [0, 1] AVANT la
  // conversion, donc tout ce qui était dessiné à côté du terrain — une file
  // d'attente, un joueur en sortie de touche, un plot posé derrière la ligne de
  // fond — était écrasé sur la bordure. C'est exactement l'amas de pastilles
  // alignées sur la ligne que produisait l'import.
  //
  // Or un coach dessine ses files À CÔTÉ du terrain, et le repère de la
  // Plaquette va de 0 à 1 alors que le terrain n'occupe que 0,14 à 0,86 : il y a
  // toute la place pour poser ces éléments là où ils sont vraiment. On ne borne
  // donc plus que sur le CANEVAS, pour rester affichable.
  const span = (value: number, min: number, max: number) => min + value * (max - min);

  if (kind === "full") {
    const x = span(point.x, FULL_COURT_LEFT, FULL_COURT_RIGHT);
    const y = span(point.y, FULL_COURT_TOP, FULL_COURT_BOTTOM);
    return { x: clamp01(x, 0.01, 0.99), y: clamp01(y, 0.01, 0.99) };
  }
  // Demi-terrain : coordonnée d'affichage puis passage en canonique (× 0.5).
  const displayX = span(point.x, HALF_COURT_LEFT, HALF_COURT_RIGHT);
  const displayY = span(point.y, HALF_COURT_TOP, HALF_COURT_BOTTOM);
  return {
    x: clamp01(displayX, 0.01, 0.99),
    y: clamp01(displayY * 0.5, 0.005, 0.495),
  };
}

/** Bornes canoniques atteintes par le clamp — sert à repérer les artefacts. */
export const canonicalBounds = (kind: CourtKind) =>
  kind === "full"
    ? { xMin: 0.01, xMax: 0.99, yMin: 0.01, yMax: 0.99 }
    : { xMin: 0.01, xMax: 0.99, yMin: 0.005, yMax: 0.495 };

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
