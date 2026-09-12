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
import {
  matchMyBasketSymbol,
  findMyBasketSymbols,
  scoreMyBasketTemplates,
  level1ComponentEnabled,
  level1DirectScanEnabled,
  detectProvenance,
  type SymbolMatch,
  type SymbolBox,
  type DirectDetection,
} from "./mybasket-symbols";

const MAX_PLAYERS = 12;
const MAX_LINES = 14;
const MAX_OBJECTS = 12;
const MAX_TEXTS = 3;
const WORK_LONG_SIDE = 900;

/** Marge conservée autour de l'aire de jeu (un joueur peut être sur la touche). */
const PLAY_MARGIN = 0.08;

/**
 * ÉLARGISSEMENT DE LA FENÊTRE, POUR LES TRACÉS SEULEMENT.
 *
 * Ne concerne que l'extraction et l'assemblage des composantes candidates de
 * trajectoire. Ni la géométrie, ni les joueurs, ni le ballon, ni les plots, ni
 * les seuils de niveau 1, ni le minimum de 9 % de longueur, ni la suppression
 * des lignes du terrain n'en dépendent — vérifié : toutes ces mesures sont
 * strictement identiques drapeau éteint et allumé.
 *
 * POURQUOI. L'image de travail est recadrée sur l'aire de jeu plus PLAY_MARGIN
 * (8 %). Une flèche qui file vers un coin hors terrain est coupée par ce
 * recadrage et le moignon tombe sous le minimum de longueur. Sur le cas 01,
 * deux des sept tracés relevés sortent de la fenêtre — la grande courbe marine
 * de 10 px, la grande courbe rouge de 2 px.
 *
 * LES TROIS MARGES ONT ÉTÉ MESURÉES, sur les 7 tracés relevés du cas 01 :
 *
 *   marge   détectés   appariés   dont inversés   en trop   bon endroit   cadre exact
 *    8 %       6          2            1             4        1/7            3/7
 *   10 %       4          1            1             3        1/7            2/7
 *   15 %       7          2            2             5        2/7            2/7
 *   20 %       7          3            2             4        2/7            3/7
 *
 * 20 % est la seule qui gagne un tracé SANS rien perdre : les faux positifs
 * restent à 4, et la mesure au cadre exact — celle qui ne dépend pas de
 * l'erreur de géométrie — tient à 3/7 là où 15 % la fait tomber à 2/7. 10 % est
 * une régression franche.
 *
 * ATTENTION, LE LEVIER N'EST PAS MONOTONE : 10 % fait PIRE que 8 %. Élargir la
 * fenêtre déplace aussi le modèle de fond local, donc le masque d'encre, donc
 * les composantes — le gain n'est pas seulement « on ne coupe plus ». Ne pas
 * supposer qu'une marge plus grande fera mieux : remesurer.
 *
 * Le cas 02 et la batterie synthétique sont strictement inchangés aux quatre
 * marges.
 */
const TRACE_EXTRACTION_MARGIN = true;

/**
 * Classification cut / dribble : voir le commentaire dans `classify`.
 * Ne change QUE le choix de l'action ; ni l'extraction, ni la longueur
 * minimale, ni le nombre de tracés ne dépendent de ce drapeau.
 */
const TRACE_ACTION_CLASSIFIER_V2 = true;
/** Marge employée quand le drapeau est actif (fraction de l'aire de jeu). */
const TRACE_MARGIN = 0.2;

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
  geometry: CourtGeometry,
  // Marge autour de l'aire de jeu. Le défaut reproduit exactement le
  // comportement historique : seul le passage des tracés en demande une autre.
  margin: number = PLAY_MARGIN
): { canvas: HTMLCanvasElement; play: AiRect } {
  const play = geometry.play ?? geometry.rect;
  const pw = Math.max(1, play.x1 - play.x0);
  const ph = Math.max(1, play.y1 - play.y0);

  const crop: AiRect = {
    x0: Math.max(0, play.x0 - pw * margin),
    y0: Math.max(0, play.y0 - ph * margin),
    x1: Math.min(source.width, play.x1 + pw * margin),
    y1: Math.min(source.height, play.y1 + ph * margin),
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
  /**
   * SECOND fond, pour les seules cellules posées sur une frontière de matière
   * (voir `splitFrontierCell`). `split[k] = 1` signale que la cellule k possède
   * deux références : (rgb, tol) et (alt, altTol). Ailleurs, `alt` est ignoré et
   * le comportement est exactement celui d'avant.
   */
  split: Uint8Array;
  alt: Float32Array;
  altTol: Float32Array;
  /** DIAGNOSTIC uniquement : candidats de frontière et verdict de continuité. */
  frontierCandidates?: Array<FrontierSplit | null>;
  frontierReports?: BoundaryReport[];
};

/*
 * MÉTHODE ESSAYÉE ET ÉCARTÉE nº 5 — « deux fonds par cellule, séparés par le
 * critère du POURTOUR ». Conservée ici, désactivée, parce que c'est la première
 * qui atteint la cible sur les plots : la reprendre ne doit pas coûter une
 * réécriture, seulement remettre ce drapeau à `true`.
 *
 * Ce qu'elle réussit — et c'est la confirmation du diagnostic :
 *
 *   plot 1, encre finale        : 2,2 %  →  14,9 %   (plot 2 sain : 13,9 %)
 *   RECHERCHE DIRECTE, plots    : 3/4  →  4/4 · 0 FP · rappel 100 %
 *
 * Ce qu'elle casse :
 *
 *   RECHERCHE DIRECTE, ballon   : 1/1  →  0/1 · 8 faux positifs
 *   SYNTHÉTIQUE                 : régressions « ombre » et « trajectoires-croisées »
 *   CAS RÉEL 01, Plaquette      : 5/10 →  3/10
 *   CAS RÉEL 02, faux positifs  : 0    →  1
 *
 * La cause de l'échec est la même que celle des variantes 2 et 3, et elle est
 * maintenant cernée : une région PLEINE et HOMOGÈNE — un ballon — est
 * indiscernable d'un second fond. Le critère du pourtour (un fond traverse la
 * fenêtre, un objet y est contenu) élimine bien le contenu fin (14 % de la
 * fenêtre mais 10 % du pourtour → écarté) mais pas le ballon. Élargir la
 * fenêtre du test de 3 × 3 à 5 × 5 cellules supprime les faux positifs sur les
 * plots (plots 4/4 · 0 FP) sans rendre le ballon au moteur, et ajoute une
 * régression synthétique : ce n'est donc pas une affaire de taille de fenêtre.
 *
 * Deux critères géométriques ont en outre été mesurés et ne séparent PAS les
 * vraies frontières des textures :
 *   - traversées par ligne de balayage : plot 1 à 3,6 ; scène « trajectoires »
 *     de 2,4 à 7,7 — recouvrement complet. Le plafonner à 4 dégrade l'ensemble
 *     (joueurs 143 → 140, tracés 3 → 2) ;
 *   - épaisseur de la classe minoritaire : plot 1 à 28 px, scène « trajectoires »
 *     de 17 à 58 px — recouvrement complet.
 *
 * SUITE — la continuité inter-cellules a été implémentée (`linkedBoundaries`)
 * et mesurée. Elle règle les objets et ne coûte rien au synthétique ni au cas
 * réel 01, mais elle dégrade les JOUEURS du cas 02 :
 *
 *   plots        3/4 → 4/4 · 0 FP        ballon    1/1 conservé · 0 FP
 *   SYNTHÉTIQUE  aucune régression       CAS 01    vision 4 → 6, fantômes 7 → 5
 *   CAS 02       défenseurs 2 → 1        CAS 02    faux positifs joueurs 0 → 2
 *
 * CES TROIS ÉLÉMENTS SONT MAINTENANT EXPLIQUÉS (tests/debug-split-diff.cjs) :
 *
 *   DÉFENSEUR PERDU (X1, cellule 11,1) — la séparation l'EFFACE.
 *     encre de la cellule 970 px → 74 px (−92 %) ; ses 8 composantes, dont le
 *     corps du défenseur (33 × 53, 752 px), disparaissent toutes.
 *     Cause exacte : la fenêtre est à 52 % bandeau bleu et 48 % gris clair. La
 *     séparation promeut donc le GRIS CLAIR au rang de fond — or c'est la
 *     couleur du CORPS du défenseur MyBasket. Son intérieur, qui était de
 *     l'encre parce qu'il était loin du bleu, devient « proche du second fond »
 *     et cesse d'exister.
 *
 *   FAUX POSITIF nº 1 (cellule 5,3) — une frontière devient un jeton.
 *     La cellule elle-même n'est pas séparée et son encre reste à 0, mais une
 *     cellule voisine séparée fait naître une composante 8 × 12 / 62 px, lue
 *     comme « jeton numéroté · arc d'encre au-dessus », confiance 0,92.
 *
 *   FAUX POSITIFS nº 2 et 3 (cellules 14,6 et 2,7) — perturbation en aval.
 *     Masque inchangé (0 et −2 px), composantes quasi identiques (66 × 79 :
 *     1410 px → 1430 px), et pourtant la décision bascule. C'est la
 *     récupération de jetons dans un amas fusionné qui change d'avis pour
 *     vingt pixels.
 *
 * VERDICT — ce n'est pas une zone identifiable, donc pas de garde locale
 * possible. 96 cellules sur 272 sont séparées, et les trois défauts sont
 * dispersés. Surtout, la cause du défenseur perdu est STRUCTURELLE : le modèle
 * décide par PROXIMITÉ DE COULEUR, et la même couleur est un fond à un endroit
 * de l'image et le corps d'un symbole à un autre. Corriger cela demanderait
 * d'attribuer le fond par la POSITION — de quel côté de la frontière se trouve
 * le pixel — et non par sa couleur : c'est une refonte du masque, pas un
 * réglage. L'activation est donc abandonnée. Le code est complet et les deux états sont rejouables sans
 * modifier ce fichier :
 *
 *   node tests/<batterie>.cjs                   → référence (séparation inactive)
 *   FRONTIER_SPLIT=1 node tests/<batterie>.cjs   → expérimental
 *
 * Ce fichier n'a pas à être modifié pour passer de l'un à l'autre : les bundles
 * de test réécrivent cette constante à la volée (tests/build.cjs et
 * tests/diag-build.cjs), comme ils ajoutent les exports de diagnostic. La
 * production, elle, lit toujours `false`.
 *
 * `node tests/harness.cjs --both` rejoue les deux modes et affiche l'écart.
 */
const FRONTIER_SPLIT_ENABLED = false;

/** Tolérance au-delà de laquelle une cellule est suspectée d'être un mélange. */
const FRONTIER_TOL = 95;

/** Part minimale de la fenêtre, et de son POURTOUR, pour qu'une classe soit un fond. */
const FRONTIER_MIN_SHARE = 0.2;
const FRONTIER_MIN_BORDER = 0.2;


const medianOf = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};

/**
 * SÉPARATION D'UNE CELLULE POSÉE SUR UNE FRONTIÈRE DE FOND.
 *
 * Le problème, mesuré sur le cas 02 : une cellule à cheval sur deux matières —
 * bandeau bleu et parquet — n'a pas un fond mais un mélange. Sa médiane tombe
 * entre les deux, sa dispersion explose, sa tolérance sature à 109, et un plot
 * posé là (distance 77 au mélange) cesse d'être vu.
 *
 * Relevé de cette cellule, fenêtre 159 × 159 :
 *
 *   classe 1  31,6 %  bleu 68,114,155   tolérance propre 67 · pourtour 40 %
 *   classe 2  68,4 %  bois 150,144,137  tolérance propre 70 · pourtour 60 %
 *   le plot (134,71,92) est à 101 de la première et 87 de la seconde
 *     → ENCRE au regard de l'une comme de l'autre.
 *
 * Ce que les variantes 2 et 3 (documentées dans `buildBackground`) n'avaient
 * pas : le POURTOUR. Un vrai fond TRAVERSE la fenêtre, donc il en occupe une
 * part importante du bord. Un objet plein — un ballon, un jeton, une raquette
 * peinte — y est CONTENU : il n'en touche rien. C'est ce chiffre qui les
 * distingue, et la couleur seule ne le pouvait pas.
 *
 *   cellule témoin voisine : classe minoritaire à 14,4 % de la fenêtre mais
 *   seulement 10 % du pourtour → écartée, la cellule n'est pas séparée.
 *
 * Trois conditions cumulatives, donc, et la séparation ne s'applique qu'aux
 * cellules dont la tolérance est déjà saturée :
 *   1. chaque classe pèse au moins 20 % de la fenêtre ;
 *   2. chaque classe occupe au moins 20 % du pourtour ;
 *   3. les deux couleurs sont franchement séparées — sinon on découpe un simple
 *      dégradé d'éclairage en deux, ce qui n'apporte rien et fait passer une
 *      ombre portée pour un fond (échec mesuré de la variante « maille fine »).
 */
type FrontierSplit = {
  /** Population la plus SOMBRE. L'ordre est canonique, pour être comparable d'une cellule à l'autre. */
  a: number[];
  tolA: number;
  /** Population la plus CLAIRE. */
  b: number[];
  tolB: number;
  /**
   * Orientation de la séparation, en degrés dans [0,180) : la perpendiculaire
   * au vecteur qui joint le centre de masse des deux populations.
   */
  orientation: number;
  /**
   * Écart des deux centres de masse, rapporté à la taille de la fenêtre. Une
   * vraie frontière met les deux populations de part et d'autre : l'écart est
   * grand. Une texture — moiré, faisceau de flèches — les entremêle : les deux
   * centres se confondent et l'écart tend vers zéro.
   */
  centroidGap: number;
};

function splitFrontierCell(
  px: Pixels,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sample: number,
  quantile: number
): FrontierSplit | null {
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 12 || h < 12) return null;

  // ---- axe de plus grande variance ---------------------------------------
  const mean = [0, 0, 0];
  let count = 0;
  for (let y = y0; y < y1; y += sample) {
    for (let x = x0; x < x1; x += sample) {
      const [r, g, b] = pixelAt(px, x, y);
      mean[0] += r;
      mean[1] += g;
      mean[2] += b;
      count += 1;
    }
  }
  if (count < 32) return null;
  for (let i = 0; i < 3; i += 1) mean[i] /= count;

  const variance = [0, 0, 0];
  for (let y = y0; y < y1; y += sample) {
    for (let x = x0; x < x1; x += sample) {
      const rgb = pixelAt(px, x, y);
      for (let i = 0; i < 3; i += 1) variance[i] += (rgb[i] - mean[i]) ** 2;
    }
  }
  let axis = 0;
  if (variance[1] > variance[axis]) axis = 1;
  if (variance[2] > variance[axis]) axis = 2;

  // ---- seuil d'Otsu sur la projection ------------------------------------
  const hist = new Int32Array(256);
  for (let y = y0; y < y1; y += sample) {
    for (let x = x0; x < x1; x += sample) {
      hist[Math.max(0, Math.min(255, Math.round(pixelAt(px, x, y)[axis])))] += 1;
    }
  }
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * hist[i];
  let weightLow = 0;
  let sumLow = 0;
  let bestBetween = -1;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    weightLow += hist[t];
    if (weightLow === 0) continue;
    const weightHigh = count - weightLow;
    if (weightHigh === 0) break;
    sumLow += t * hist[t];
    const between =
      weightLow * weightHigh * (sumLow / weightLow - (sumAll - sumLow) / weightHigh) ** 2;
    if (between > bestBetween) {
      bestBetween = between;
      threshold = t;
    }
  }

  // ---- statistiques des deux classes -------------------------------------
  const low: number[][] = [];
  const high: number[][] = [];
  for (let y = y0; y < y1; y += sample) {
    for (let x = x0; x < x1; x += sample) {
      const rgb = pixelAt(px, x, y);
      (rgb[axis] <= threshold ? low : high).push([rgb[0], rgb[1], rgb[2]]);
    }
  }
  if (low.length < count * FRONTIER_MIN_SHARE || high.length < count * FRONTIER_MIN_SHARE) return null;

  // ---- occupation du POURTOUR : c'est le test décisif ---------------------
  let borderLow = 0;
  let borderTotal = 0;
  const walk = (x: number, y: number) => {
    borderTotal += 1;
    if (pixelAt(px, x, y)[axis] <= threshold) borderLow += 1;
  };
  for (let x = x0; x < x1; x += 1) {
    walk(x, y0);
    walk(x, y1 - 1);
  }
  for (let y = y0 + 1; y < y1 - 1; y += 1) {
    walk(x0, y);
    walk(x1 - 1, y);
  }
  if (borderTotal === 0) return null;
  const shareLow = borderLow / borderTotal;
  if (shareLow < FRONTIER_MIN_BORDER || 1 - shareLow < FRONTIER_MIN_BORDER) return null;

  // ---- longueur de la frontière : UNE ligne, pas des dizaines -------------
  let crossings = 0;
  let scanlines = 0;
  for (let y = y0; y < y1; y += sample) {
    let previous = pixelAt(px, x0, y)[axis] <= threshold;
    for (let x = x0 + 1; x < x1; x += 1) {
      const current = pixelAt(px, x, y)[axis] <= threshold;
      if (current !== previous) crossings += 1;
      previous = current;
    }
    scanlines += 1;
  }
  for (let x = x0; x < x1; x += sample) {
    let previous = pixelAt(px, x, y0)[axis] <= threshold;
    for (let y = y0 + 1; y < y1; y += 1) {
      const current = pixelAt(px, x, y)[axis] <= threshold;
      if (current !== previous) crossings += 1;
      previous = current;
    }
    scanlines += 1;
  }
  const perScanline = scanlines ? crossings / scanlines : 99;
  // Épaisseur moyenne de la classe MINORITAIRE, en pixels : c'est ce qui
  // distingue une plage de fond d'un faisceau de traits. Sur une ligne de
  // balayage de longueur L, la classe minoritaire occupe `part × L` pixels
  // répartis en `traversées / 2` segments.
  const areaMinority = Math.min(low.length, high.length) / count;
  const runsPerScanline = Math.max(0.5, perScanline / 2);
  const meanRun = (areaMinority * ((w + h) / 2)) / runsPerScanline;
  if (process.env.TRACE_FRONTIER) {
    console.error(
      `    [frontière] ${x0},${y0} → ${x1},${y1} · classes ` +
        `${((low.length / count) * 100).toFixed(0)}/${((high.length / count) * 100).toFixed(0)} % · ` +
        `pourtour ${(shareLow * 100).toFixed(0)} % · traversées/ligne ${perScanline.toFixed(1)} · ` +
        `épaisseur ${meanRun.toFixed(0)} px sur ${Math.round((w + h) / 2)}`
    );
  }

  const describe = (cls: number[][]) => {
    const median = (index: number) => medianOf(cls.map((c) => c[index]));
    const colour = [median(0), median(1), median(2)];
    const deltas = cls
      .map((c) => Math.hypot(c[0] - colour[0], c[1] - colour[1], c[2] - colour[2]))
      .sort((m, n) => m - n);
    const spread = deltas.length
      ? deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * quantile))]
      : 0;
    return { colour, tol: Math.min(120, Math.max(46, spread * 3 + 22)) };
  };

  const first = describe(low);
  const second = describe(high);

  // ---- séparation franche exigée -----------------------------------------
  const gap = Math.hypot(
    first.colour[0] - second.colour[0],
    first.colour[1] - second.colour[1],
    first.colour[2] - second.colour[2]
  );
  if (gap < (first.tol + second.tol) / 2) return null;

  // ---- géométrie de la séparation ----------------------------------------
  // Centres de masse SPATIAUX des deux populations. Ils donnent l'orientation
  // de la frontière (perpendiculaire à la droite qui les joint) et, surtout,
  // disent si les populations sont séparées dans l'espace ou entremêlées.
  let lowX = 0;
  let lowY = 0;
  let lowN = 0;
  let highX = 0;
  let highY = 0;
  let highN = 0;
  for (let y = y0; y < y1; y += sample) {
    for (let x = x0; x < x1; x += sample) {
      if (pixelAt(px, x, y)[axis] <= threshold) {
        lowX += x;
        lowY += y;
        lowN += 1;
      } else {
        highX += x;
        highY += y;
        highN += 1;
      }
    }
  }
  if (!lowN || !highN) return null;
  const vx = highX / highN - lowX / lowN;
  const vy = highY / highN - lowY / lowN;
  const centroidGap = Math.hypot(vx, vy) / ((w + h) / 2);
  // Perpendiculaire au vecteur des centres, ramenée dans [0,180).
  let orientation = (Math.atan2(vy, vx) * 180) / Math.PI + 90;
  orientation = ((orientation % 180) + 180) % 180;

  // ---- ordre canonique : la population SOMBRE d'abord ---------------------
  // Sans cela, deux cellules voisines décrivant la même frontière peuvent
  // présenter leurs populations dans l'ordre inverse, et la comparaison
  // couleur à couleur échoue alors qu'il s'agit de la même matière.
  const luminance = (c: number[]) => (c[0] + c[1] + c[2]) / 3;
  const darkFirst = luminance(first.colour) <= luminance(second.colour);
  const dark = darkFirst ? first : second;
  const light = darkFirst ? second : first;
  // L'orientation est celle du vecteur sombre → clair ; si l'ordre s'inverse,
  // la perpendiculaire reste la même droite, donc rien à corriger.

  return {
    a: dark.colour,
    tolA: dark.tol,
    b: light.colour,
    tolB: light.tol,
    orientation,
    centroidGap,
  };
}

/**
 * CONTINUITÉ INTER-CELLULES — est-ce la MÊME frontière physique ?
 *
 * Vérifier qu'une cellule contient deux populations ne suffit pas : un ballon,
 * une ombre, un faisceau de flèches en contiennent aussi. Ce qui distingue une
 * vraie frontière de matière, c'est qu'elle SE POURSUIT :
 *
 *   - chez les voisines, avec les MÊMES deux couleurs de fond ;
 *   - dans le même ORDRE (sombre / clair, ordre canonique) ;
 *   - avec une ORIENTATION de séparation comparable ;
 *   - sur une CHAÎNE d'au moins quelques cellules contiguës ;
 *   - horizontalement, verticalement ou en diagonale.
 *
 * Un objet plein apparaît localement : il ne forme pas de chaîne.
 */
type BoundaryReport = {
  isPersistentBoundary: boolean;
  lengthInCells: number;
  colorPairDistance: number;
  orientationDelta: number;
  confidence: number;
};

/** Écart de couleur toléré entre deux cellules décrivant la même frontière. */
const FRONTIER_COLOR_TOL = 40;
/** Écart d'orientation toléré, en degrés. */
const FRONTIER_ORIENT_TOL = 25;
/** Longueur minimale de la chaîne, en cellules. */
const FRONTIER_MIN_CHAIN = 3;
/** Écart minimal des centres de masse : en deçà, les populations sont entremêlées. */
const FRONTIER_MIN_CENTROID = 0.12;

/** Distance angulaire dans [0,180), donc modulo 180. */
function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

function linkedBoundaries(
  candidates: Array<FrontierSplit | null>,
  cw: number,
  ch: number
): BoundaryReport[] {
  const reports: BoundaryReport[] = new Array(cw * ch);
  for (let i = 0; i < cw * ch; i += 1) {
    reports[i] = {
      isPersistentBoundary: false,
      lengthInCells: 0,
      colorPairDistance: 0,
      orientationDelta: 0,
      confidence: 0,
    };
  }

  const compatible = (p: FrontierSplit, q: FrontierSplit) => {
    const dark = Math.hypot(p.a[0] - q.a[0], p.a[1] - q.a[1], p.a[2] - q.a[2]);
    const light = Math.hypot(p.b[0] - q.b[0], p.b[1] - q.b[1], p.b[2] - q.b[2]);
    const colour = (dark + light) / 2;
    const orient = angleDelta(p.orientation, q.orientation);
    return colour <= FRONTIER_COLOR_TOL && orient <= FRONTIER_ORIENT_TOL
      ? { colour, orient }
      : null;
  };

  // Composantes connexes en 8-voisinage, sur les seules cellules candidates
  // dont les populations sont réellement séparées dans l'espace.
  const seen = new Uint8Array(cw * ch);
  const eligible = (index: number) => {
    const part = candidates[index];
    return part !== null && part !== undefined && part.centroidGap >= FRONTIER_MIN_CENTROID;
  };

  for (let start = 0; start < cw * ch; start += 1) {
    if (seen[start] || !eligible(start)) continue;

    const chain: number[] = [];
    const colours: number[] = [];
    const orients: number[] = [];
    const queue = [start];
    seen[start] = 1;

    while (queue.length) {
      const index = queue.pop() as number;
      chain.push(index);
      const cx = index % cw;
      const cy = Math.floor(index / cw);
      const here = candidates[index] as FrontierSplit;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const neighbour = ny * cw + nx;
          if (seen[neighbour] || !eligible(neighbour)) continue;
          const link = compatible(here, candidates[neighbour] as FrontierSplit);
          if (!link) continue;
          seen[neighbour] = 1;
          colours.push(link.colour);
          orients.push(link.orient);
          queue.push(neighbour);
        }
      }
    }

    const length = chain.length;
    const meanColour = colours.length ? colours.reduce((a, b) => a + b, 0) / colours.length : 0;
    const meanOrient = orients.length ? orients.reduce((a, b) => a + b, 0) / orients.length : 0;
    const persistent = length >= FRONTIER_MIN_CHAIN;
    const confidence = persistent
      ? Math.max(
          0,
          Math.min(
            1,
            Math.min(1, length / (FRONTIER_MIN_CHAIN * 2)) *
              (1 - meanColour / FRONTIER_COLOR_TOL) *
              (1 - meanOrient / FRONTIER_ORIENT_TOL)
          )
        )
      : 0;

    for (const index of chain) {
      reports[index] = {
        isPersistentBoundary: persistent,
        lengthInCells: length,
        colorPairDistance: Number(meanColour.toFixed(1)),
        orientationDelta: Number(meanOrient.toFixed(1)),
        confidence: Number(confidence.toFixed(2)),
      };
    }
  }

  return reports;
}

function buildBackground(px: Pixels, moire = 0, cellOverride?: number): Background {
  const cell = cellOverride ?? Math.max(12, Math.round(Math.min(px.w, px.h) / 16));
  const cw = Math.max(1, Math.ceil(px.w / cell));
  const ch = Math.max(1, Math.ceil(px.h / cell));
  const rgb = new Float32Array(cw * ch * 3);
  const tol = new Float32Array(cw * ch);
  const split = new Uint8Array(cw * ch);
  const alt = new Float32Array(cw * ch * 3);
  const altTol = new Float32Array(cw * ch);
  const candidates: Array<FrontierSplit | null> = new Array(cw * ch).fill(null);
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
      // La tolérance doit mesurer le bruit du FOND, pas la variété du CONTENU.
      // Avec la médiane des écarts, une zone chargée — plusieurs symboles, un
      // aplat de couleur, du moiré — fait grimper la tolérance jusqu'à son
      // plafond, et plus rien n'y est reconnu comme encre. Mesuré sur une photo
      // d'écran : la tolérance saturait à 120 autour des défenseurs, dont le
      // corps ressortait à 40-115 du fond, donc restait invisible.
      // Le premier quartile ne retient que les pixels PROCHES de la couleur
      // médiane, c'est-à-dire le fond lui-même : c'est bien son bruit qu'on
      // mesure, et le contenu ne peut plus se protéger tout seul.
      deltas.sort((a, b) => a - b);
      // Sur une image nette, la médiane des écarts mesure bien le bruit du fond.
      // Sur une PHOTO D'ÉCRAN, le moiré fait alterner un pixel sur deux : la
      // médiane monte alors avec le contenu et la tolérance sature à son
      // plafond — mesuré, le corps des défenseurs ressortait à 40-115 du fond
      // pour une tolérance de 120, donc restait invisible. Là, et là seulement,
      // on prend le premier quartile : il ne retient que les pixels proches de
      // la couleur médiane, c'est-à-dire le fond lui-même.
      const quantile = moire > 0.18 ? 0.25 : 0.5;
      const spread = deltas.length ? deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * quantile))] : 0;

      const index = cy * cw + cx;
      rgb[index * 3] = mr;
      rgb[index * 3 + 1] = mg;
      rgb[index * 3 + 2] = mb;
      // Tolérance : au moins 46 (bruit JPEG), au plus 120 (fond très texturé).
      tol[index] = Math.min(120, Math.max(46, spread * 3 + 22));

      // Une tolérance saturée est le SYMPTÔME d'un mélange : on tente alors, et
      // alors seulement, de séparer la cellule en deux fonds. Les garde-fous
      // sont dans `splitFrontierCell` ; s'ils ne sont pas tous réunis, la
      // cellule garde exactement son modèle d'avant.
      // Première passe : on note seulement le CANDIDAT. Rien n'est appliqué
      // avant que la continuité inter-cellules ait confirmé qu'il s'agit d'une
      // vraie frontière de matière (voir `linkedBoundaries`).
      if (FRONTIER_SPLIT_ENABLED && tol[index] >= FRONTIER_TOL) {
        candidates[index] = splitFrontierCell(px, x0, y0, x1, y1, sample, quantile);
      }

      // MÉTHODE ESSAYÉE ET ÉCARTÉE — modéliser DEUX fonds par cellule, pour
      // qu'un objet posé contre une frontière (parquet / bandeau coloré) ne
      // disparaisse plus dans une tolérance gonflée par le mélange.
      // Trois variantes mesurées :
      //   1. écart à la médiane → ne se déclenche jamais : sur une frontière la
      //      médiane tombe ENTRE les deux fonds, aucun échantillon n'en paraît
      //      éloigné ;
      //   2. k-moyennes (k=2) + séparation des centres → se déclenche sur 236
      //      cellules sur 272, donc partout : ce n'est plus une correction
      //      locale, et le ballon, région pleine et homogène, est pris pour un
      //      fond et cesse d'être de l'encre (63 % → 3 %) ;
      //   3. idem + cohérence spatiale + présence des deux populations sur le
      //      pourtour de la fenêtre → l'objet passe de 4 % à 9 % d'encre, mais
      //      plots 3/4 → 2/4, ballon 1/1 → 0/1 avec 7 faux positifs, et une
      //      régression synthétique.
      // Le fond de l'affaire : une région pleine et homogène — un ballon, un
      // jeton, une raquette peinte — est indiscernable d'un second fond par la
      // couleur et la cohérence seules. Le critère « un fond traverse la
      // fenêtre, un objet y est contenu » va dans le bon sens mais ne suffit pas
      // à cette taille de fenêtre. Ne pas retenter sans passer les trois
      // batteries.

    }
  }

  /*
   * Seconde passe : la CONTINUITÉ tranche.
   *
   * Un candidat isolé n'est pas une frontière de matière — c'est un objet, une
   * ombre, ou une texture qui se trouve avoir deux populations. Seules les
   * cellules appartenant à une chaîne confirmée reçoivent leur second fond.
   */
  if (FRONTIER_SPLIT_ENABLED) {
    const reports = linkedBoundaries(candidates, cw, ch);
    for (let index = 0; index < cw * ch; index += 1) {
      const parts = candidates[index];
      if (!parts || !reports[index].isPersistentBoundary) continue;
      split[index] = 1;
      rgb[index * 3] = parts.a[0];
      rgb[index * 3 + 1] = parts.a[1];
      rgb[index * 3 + 2] = parts.a[2];
      tol[index] = parts.tolA;
      alt[index * 3] = parts.b[0];
      alt[index * 3 + 1] = parts.b[1];
      alt[index * 3 + 2] = parts.b[2];
      altTol[index] = parts.tolB;
    }
    return { cell, cw, ch, rgb, tol, split, alt, altTol, frontierCandidates: candidates, frontierReports: reports };
  }

  return { cell, cw, ch, rgb, tol, split, alt, altTol };
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
  /**
   * NIVEAU 1 — identification par gabarit MyBasket, quand la silhouette
   * correspond franchement. Absente, le moteur générique (niveau 2) décide,
   * exactement comme avant l'introduction des gabarits.
   */
  template?: SymbolMatch;
};

type InkContext = {
  px: Pixels;
  mask: Uint8Array;
  /** Image intégrale du masque : « y a-t-il une ligne de terrain à moins de r ? ». */
  maskIntegral: Int32Array;
  /** Encre finale : brute, moins les lignes, mais symboles denses préservés. */
  ink: Uint8Array;
  /** Étapes intermédiaires, exposées pour le panneau de debug seulement. */
  rawBefore?: Uint8Array;
  raw?: Uint8Array;
  bg: Background;
  paper: boolean;
  step: number;
  gw: number;
};

/**
 * MOIRÉ — mesure de l'énergie haute fréquence périodique.
 *
 * Photographier un ÉCRAN produit un moiré : de fines rayures régulières qui se
 * superposent au dessin. Elles ne gênent pas l'œil, mais elles alternent au
 * pixel près autour du seuil d'encre : un aplat rouge devient une grille de
 * pixels dont la moitié est jugée « fond ». Mesuré sur une vraie photo d'écran,
 * le corps des défenseurs disparaissait entièrement et leurs bras ne
 * ressortaient qu'en pointillés — alors que les jetons foncés, plus
 * contrastés, passaient sans problème.
 *
 * On mesure donc la part de pixels dont la luminance ALTERNE avec ses deux
 * voisins immédiats (un extremum local strict à un pixel d'écart). Sur une
 * image nette cette part est faible ; sur un moiré elle explose.
 */
function moireLevel(px: Pixels): number {
  const stepX = Math.max(1, Math.round(px.w / 320));
  const stepY = Math.max(1, Math.round(px.h / 320));
  let flips = 0;
  let total = 0;
  const lum = (x: number, y: number) => {
    const [r, g, b] = pixelAt(px, x, y);
    return (r + g + b) / 3;
  };
  for (let y = stepY; y < px.h - stepY; y += stepY) {
    for (let x = 1; x < px.w - 1; x += stepX) {
      const a = lum(x - 1, y);
      const c = lum(x, y);
      const d = lum(x + 1, y);
      total += 1;
      if ((c - a > 6 && c - d > 6) || (a - c > 6 && d - c > 6)) flips += 1;
    }
  }
  return total ? flips / total : 0;
}

/** Médiane 3×3 par canal : efface le moiré, garde les contours. */
function medianFilter(px: Pixels): Pixels {
  const out = new Uint8ClampedArray(px.data.length);
  const values = new Array(9);
  for (let y = 0; y < px.h; y += 1) {
    for (let x = 0; x < px.w; x += 1) {
      const target = (y * px.w + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = Math.min(px.h - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = Math.min(px.w - 1, Math.max(0, x + dx));
            values[n] = px.data[(yy * px.w + xx) * 4 + channel];
            n += 1;
          }
        }
        values.sort((a, b) => a - b);
        out[target + channel] = values[4];
      }
      out[target + 3] = 255;
    }
  }
  return { data: out, w: px.w, h: px.h };
}

function makeInkContext(canvas: HTMLCanvasElement, kind: CourtKind, play: AiRect): InkContext {
  const px = readPixels(canvas);
  // Le moiré est mesuré ici et RÉPARÉ plus bas, sur le masque d'encre et non
  // sur les pixels : un filtre appliqué à l'image efface aussi les traits fins,
  // et l'anneau rouge du corps d'un défenseur ne fait que trois pixels.
  const moire = moireLevel(px);
  const bg = buildBackground(px, moire);

  /*
   * MÉTHODE ESSAYÉE ET REJETÉE nº 4 — « fond fin sur les cellules frontière ».
   *
   * Constat de départ, mesuré et juste : le plot 1 du cas 02 est parfaitement
   * visible dans la carte des DISTANCES ; c'est la TOLÉRANCE de sa cellule —
   * 109, contre 97 pour la distance du plot à son fond — qui l'efface. La
   * cellule est à cheval sur trois matières (bandeau coloré, ligne blanche,
   * parquet) : elle n'a pas un fond mais un mélange, sa dispersion interne
   * explose, sa tolérance sature.
   *
   * Correction tentée : calculer un SECOND fond trois fois plus fin et ne
   * l'utiliser QUE là où le premier sature (tolérance ≥ 95), en pariant qu'une
   * fenêtre trois fois plus petite est dominée par une seule matière.
   *
   *   plot 1, encre finale : 2,2 % → 3,0 %   (cible : « nettement visible »)
   *   batterie SYNTHÉTIQUE : 2 RÉGRESSIONS — « ombre », « trajectoires-croisees »
   *
   * Deux échecs simultanés : le gain est insuffisant (la cellule fine reste à
   * cheval, car la frontière passe au milieu du plot lui-même, pas à côté), et
   * un fond plus fin épouse les dégradés lents — une ombre portée devient le
   * fond local et le trait qui la traverse cesse d'être de l'encre.
   *
   * Retenu : ne pas raffiner la MAILLE. Si cette piste est reprise, il faut
   * estimer la tolérance sur la POPULATION de fond majoritaire autour du pixel
   * (mode / classe dominante), pas sur une fenêtre plus petite — une fenêtre
   * plus petite déplace la frontière, elle ne la supprime pas.
   *
   * Voir aussi les variantes 1 à 3 (multi-fond) documentées plus bas.
   */
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
        // Le blanc n'est écarté d'office QUE s'il tombe sur une ligne du
        // terrain. Ailleurs, le blanc est du contenu : le numéro blanc et
        // l'anneau blanc au centre d'un défenseur MyBasket, une bande blanche
        // sur un plot, un symbole clair sur un terrain colorié. En l'écartant
        // partout, on vidait l'intérieur des symboles de la Plaquette : sur une
        // photo d'écran, le corps des défenseurs disparaissait complètement et
        // il ne restait que deux bras flottants, que rien ne pouvait plus
        // identifier.
        continue;
      }
      const index = cy * bg.cw + Math.min(bg.cw - 1, Math.floor(x / bg.cell));
      let d = Math.hypot(
        r - bg.rgb[index * 3],
        g - bg.rgb[index * 3 + 1],
        b - bg.rgb[index * 3 + 2]
      );
      let limit = bg.tol[index];

      // Cellule à cheval sur deux fonds : le pixel est jugé par rapport au fond
      // dont il est LE PLUS PROCHE, avec la tolérance propre à ce fond. Un pixel
      // de parquet reste du parquet, un pixel de bandeau reste du bandeau, et ce
      // qui est loin des deux redevient de l'encre — ce que la médiane du
      // mélange, encadrée d'une tolérance saturée, ne permettait plus.
      if (bg.split[index]) {
        const other = Math.hypot(
          r - bg.alt[index * 3],
          g - bg.alt[index * 3 + 1],
          b - bg.alt[index * 3 + 2]
        );
        if (other < d) {
          d = other;
          limit = bg.altTol[index];
        }
      }

      if (d > limit) raw[i] = 1;
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

  // Copie de l'encre BRUTE, avant toute réparation. Sert uniquement au panneau
  // de debug : aucune décision du moteur ne la lit.
  const rawBefore = new Uint8Array(raw);

  // ---- MOIRÉ : réparation du masque d'encre ------------------------------
  // Photographier un écran crible les aplats : un pixel sur deux retombe sous
  // le seuil et un trait plein devient une grille de trous. Une FERMETURE
  // morphologique (dilatation puis érosion, rayon 1) rebouche ces trous sans
  // épaissir la forme, et surtout sans effacer les traits fins — contrairement
  // à un filtre appliqué aux pixels, qui gomme l'anneau de trois pixels du
  // corps d'un défenseur.
  if (moire > 0.18) {
    const w = px.w;
    const h = px.h;
    const dilated = new Uint8Array(raw.length);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let on = 0;
        for (let dy = -1; dy <= 1 && !on; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            if (raw[yy * w + xx]) {
              on = 1;
              break;
            }
          }
        }
        dilated[y * w + x] = on;
      }
    }
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let all = 1;
        for (let dy = -1; dy <= 1 && all; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            if (!dilated[yy * w + xx]) {
              all = 0;
              break;
            }
          }
        }
        raw[y * w + x] = raw[y * w + x] || all ? 1 : 0;
      }
    }

    // La tolérance abaissée laisse passer un semis de pixels isolés : ce sont
    // les crêtes du moiré, pas du dessin. Un pixel d'encre appartient à un
    // trait, donc il a des voisins ; on retire ceux qui n'en ont presque pas.
    const cleaned = new Uint8Array(raw);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!raw[y * w + x]) continue;
        let neighbours = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= w || (!dx && !dy)) continue;
            if (raw[yy * w + xx]) neighbours += 1;
          }
        }
        if (neighbours < 4) cleaned[y * w + x] = 0;
      }
    }
    raw.set(cleaned);
  }

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
    /** Encre brute avant réparation du moiré — DEBUG uniquement. */
    rawBefore,
    /** Encre brute après réparation, avant retrait des lignes — DEBUG. */
    raw,
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
/**
 * GARDE-FOU TRAJECTOIRE — un trait du coach ne doit pas être consommé comme
 * joueur avant d'atteindre le détecteur de tracés.
 *
 * Mesuré sur le second terrain du cas 02 : deux dribbles ondulés et une flèche
 * pleine sortaient en joueurs, ce qui les retirait du détecteur de polylignes —
 * lequel rejetait ensuite les miettes restantes comme « trop courtes ». Trois
 * faux joueurs et trois tracés perdus, d'un seul coup.
 *
 * Aucun critère simple ne les sépare des vrais symboles : remplissage,
 * compacité, tortuosité et épaisseur se recouvrent tous. Relevé complet :
 *
 *   élément               compac.  squel.  extrémités  épaiss.  tortu.  hue   sat
 *   défenseur « 3 »        0.271    107         3        2.3     1.93   353°  0.45
 *   défenseur « 1 » brasD  0.415     62         3        2.0     1.60   348°  0.54
 *   attaquant ①            0.164    135         5        2.3     2.29   140°  0.02
 *   défenseur « 5 »        0.214     64         1        1.3     1.55   352°  0.40
 *   #5 dribble ondulé      0.191    100         1        2.0     1.53    38°  0.13
 *   #9 dribble ondulé      0.086    138         1        1.3     1.82    37°  0.17
 *   #10 flèche pleine      0.234     64         2        1.3     1.20    32°  0.16
 *
 * Ce qui sépare, c'est la STRUCTURE du squelette, corrigée par la couleur :
 *
 *   extrémités ≤ 2                       → 3 tracés sur 3, mais perd le défenseur « 5 »
 *   saturation < 0,35                    → 3 sur 3, mais perd deux attaquants
 *   extrémités ≤ 2 ET saturation < 0,35  → 3 sur 3, aucun joueur perdu
 *
 * Un symbole de joueur a un squelette RAMIFIÉ — un anneau avec un chiffre
 * dedans, un corps à deux bras — donc trois extrémités ou plus. Un trait en a
 * deux, une ou zéro s'il boucle. La couleur n'intervient qu'en second : elle
 * rattrape le symbole dont le squelette s'est appauvri, et un symbole MyBasket
 * reste franchement coloré là où un trait posé sur du parquet en prend la teinte.
 */
const PLAYER_TRAJECTORY_GUARD = true;

/**
 * TROISIÈME INDICE DÉFENSIF — voir `massConcentration` plus bas.
 *
 * Les deux indices historiques ne se déclenchent JAMAIS sur un défenseur du
 * rendu MyBasket photographié, et se déclenchent à tort sur ses attaquants.
 * Ce drapeau ajoute un indice de forme, indépendant de la couleur, qui ne peut
 * que PROMOUVOIR un candidat déjà classé attaquant par défaut : il ne retire
 * jamais un typage obtenu par gabarit ou par les indices historiques.
 *
 * RÉSULTAT MESURÉ (tests/harness.cjs --both --flag=GT_DEFGUARD, puis
 * tests/debug-typage-defenseurs.cjs qui seul dispose de la vérité terrain) :
 *
 *   batterie synthétique   145/157 · FP 15 · tracés 3/7 — STRICTEMENT IDENTIQUE
 *   cas 01 Plaquette       5/10 — inchangé
 *   cas 02 terrain 2       0 → 5 défenseurs réels correctement typés
 *   cas 02 terrain 1       0 → 1 défenseur réel correctement typé
 *   attaquants réels convertis à tort   0 sur 5
 *   faux positifs joueurs               0 → 0
 *
 * COÛT MESURÉ, et raison pour laquelle le drapeau reste à `false` : deux
 * composantes qui NE SONT PAS des joueurs — un plot de la ligne de fond du
 * terrain 1 et le ballon du terrain 2 — passent de `attacker` à `defender`.
 * Elles étaient déjà de faux joueurs, leur nombre ne change pas, mais le
 * terrain 1 n'est donc pas « inchangé » au sens strict.
 *
 * PIÈGE DE MESURE À NE PAS REFAIRE : les lignes `attaquants X/10` et
 * `défenseurs X/10` de tests/real-suite.cjs sont des DÉNOMBREMENTS sans
 * appariement de position. Elles affichent ici « attaquants 10/10 → 2/10 ·
 * défenseurs 2/10 → 10/10 », ce qui ressemble à une régression et n'en est pas :
 * avant le garde-fou, aucun défenseur réel n'était correctement typé, et les
 * « 2/10 défenseurs » de la référence sont deux erreurs (une composante de
 * bruit de la bande bleue, et l'attaquant ① fusionné avec l'arc ①). Ces deux
 * lignes ne peuvent pas arbitrer ce changement.
 */
const GENERIC_DEFENDER_GUARD = true;

/** Nombre d'extrémités du squelette d'une composante (amincissement Zhang-Suen). */
function skeletonEnds(component: Component): number {
  const w = component.bw;
  const h = component.bh;
  if (w < 3 || h < 3) return 0;
  const mask = new Uint8Array(w * h);
  for (const point of component.points) {
    const x = point.x - component.x0;
    const y = point.y - component.y0;
    if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1;
  }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);

  let changed = true;
  let guard = 0;
  while (changed && guard < 40) {
    changed = false;
    guard += 1;
    for (const step of [0, 1]) {
      const remove: number[] = [];
      for (let y = 1; y < h - 1; y += 1) {
        for (let x = 1; x < w - 1; x += 1) {
          if (!at(x, y)) continue;
          const p = [
            at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1),
            at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1),
          ];
          const n = p.reduce((sum, v) => sum + v, 0);
          if (n < 2 || n > 6) continue;
          let transitions = 0;
          for (let i = 0; i < 8; i += 1) if (p[i] === 0 && p[(i + 1) % 8] === 1) transitions += 1;
          if (transitions !== 1) continue;
          if (step === 0) {
            if (p[0] * p[2] * p[4] !== 0) continue;
            if (p[2] * p[4] * p[6] !== 0) continue;
          } else {
            if (p[0] * p[2] * p[6] !== 0) continue;
            if (p[0] * p[4] * p[6] !== 0) continue;
          }
          remove.push(y * w + x);
        }
      }
      if (remove.length) {
        changed = true;
        for (const index of remove) mask[index] = 0;
      }
    }
  }

  let ends = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          if (at(x + dx, y + dy)) n += 1;
        }
      }
      if (n === 1) ends += 1;
    }
  }
  return ends;
}

/** La composante ressemble-t-elle à un TRAIT plutôt qu'à un symbole ? */
function trajectoryLike(component: Component): boolean {
  if (!PLAYER_TRAJECTORY_GUARD) return false;
  if (saturationOf(component.color.r, component.color.g, component.color.b) >= 0.35) return false;
  return skeletonEnds(component) <= 2;
}

const isOrangeInk = (r: number, g: number, b: number): boolean => {
  const hue = hueOf(r, g, b);
  return hue >= 8 && hue <= 48 && saturationOf(r, g, b) > 0.45 && Math.max(r, g, b) > 110;
};

const weighted = (a: AiPoint, b: AiPoint) => Math.hypot(a.x - b.x, (a.y - b.y) * Y_WEIGHT);

/**
 * TROISIÈME INDICE DÉFENSIF — concentration de masse.
 *
 * Les deux indices historiques (`hasSplitTop`, `hasDefenseMark`) supposent tous
 * deux la MÊME silhouette : un disque plein surmonté de bras. C'est celle de la
 * batterie synthétique et celle d'un croquis au stylo. Le rendu MyBasket
 * photographié à l'écran (cas réel 02) ne la respecte pas : le symbole défenseur
 * y est un ARC seul, numéro compris, sans disque sous les bras. Mesuré sur les
 * dix-huit candidats des deux schémas du cas 02 :
 *
 *   - `hasSplitTop` : rangs scindés 0/3 sur 5 défenseurs réels sur 5. Le haut ne
 *     se scinde pas puisque les bras SONT la composante ; débord haut/corps
 *     0,65–1,00 pour un seuil 1,30, donc `armsStickOut` reste faux lui aussi.
 *   - `hasDefenseMark` : gauche 0–112, droite 0–24 pour un requis de 13–24, avec
 *     143–240 pixels d'encre EXCLUS comme appartenant au candidat. Les bras sont
 *     dans `own` : l'indice est aveugle par construction sur un vrai défenseur,
 *     et il se déclenche à l'inverse sur les ATTAQUANTS placés sous l'arc d'un
 *     défenseur voisin (274/228 et 294/246 pixels).
 *
 * Ce qui SÉPARE réellement les deux familles n'est ni la largeur relative, ni la
 * symétrie, ni les extensions latérales mesurées en profil de largeur — toutes
 * se recouvrent — mais le CONTRASTE entre un noyau dense et des extensions
 * fines. On le mesure comme la part de masse tombant dans le disque central
 * (rayon 0,25 de la plus petite dimension autour du centre de gravité),
 * rapportée à la part d'AIRE que ce disque occupe. Un disque uniformément
 * rempli donne ≈ 1 ; une forme à noyau dense et bras fins donne nettement plus.
 *
 * Relevés (tests/debug-typage-defenseurs.cjs) :
 *   attaquants réels cas 02      0,00 · 0,54 · 1,08 · 1,35 · 1,51
 *   attaquants synthétiques      0,93 · 0,99 · 1,03 · 1,05 · 1,06 · 1,07 · 1,11 · 1,18
 *   défenseurs synthétiques      1,79 · 1,90 · 2,01 · 2,10
 *   défenseurs réels cas 02      1,05 · 1,84 · 1,93 · 1,97 · 2,08 · 2,40 · 2,42 · 2,57
 *
 * La coupure est posée à 1,65 : au-dessus du maximum attaquant observé (1,51) et
 * au-dessous du minimum défenseur synthétique (1,79). Elle ne capture pas le
 * défenseur ⑤ du terrain 1 (1,05), dont la composante est tronquée.
 *
 * HYPOTHÈSES ÉCARTÉES, avec leurs chiffres, pour qu'on ne les retente pas à
 * l'aveugle (8 défenseurs réels, 5 attaquants réels, 5 non-joueurs du cas 02) :
 *   extensions latérales mesurées en profil de largeur (haut/milieu ≥ 1,20)
 *       1 défenseur sur 8. Les bras ne débordent pas VERS LE HAUT : ils sont
 *       à mi-hauteur, ils SONT le corps.
 *   largeur médiane importante        6/8 mais 1 attaquant converti, 5 non-joueurs.
 *       Le signe est d'ailleurs inverse : les défenseurs sont plus ÉTROITS à
 *       mi-hauteur (0,24–0,89) que les attaquants (0,80–1,00).
 *   les trois réunies (signature proposée)   1 défenseur sur 8.
 *   saturation ≥ 0,25                 8/8 et 0 attaquant — mais INUTILISABLE :
 *       la batterie synthétique dessine attaquants ET défenseurs avec la même
 *       encre (MAROON #6B1A2C, teinte 349°, saturation 0,72), donc la règle
 *       convertirait les 157 joueurs synthétiques. Vérifié : elle se déclenche
 *       sur 7/7 jetons d'une scène de contrôle.
 *   teinte rouge stricte ET saturation ≥ 0,25   8/8, 0 attaquant, 0 non-joueur
 *       sur le cas 02 — et 7/7 sur la même scène synthétique. Même rejet.
 * Aucune règle de COULEUR n'est donc recevable : la seule séparation propre
 * qu'elle offre est la convention d'équipe du rendu MyBasket, absente partout
 * ailleurs.
 */
const DEFENSE_MASS_MIN = 1.65;

function massConcentration(component: Component): number {
  const w = Math.max(1, component.bw);
  const h = Math.max(1, component.bh);
  const area = component.points.length;
  if (area < 12) return 0;
  let sx = 0;
  let sy = 0;
  for (const point of component.points) {
    sx += point.x - component.x0;
    sy += point.y - component.y0;
  }
  const gx = sx / area;
  const gy = sy / area;
  const radius = Math.min(w, h) * 0.25;
  if (radius < 1) return 0;
  let inside = 0;
  for (const point of component.points) {
    if (Math.hypot(point.x - component.x0 - gx, point.y - component.y0 - gy) <= radius) inside += 1;
  }
  const share = (Math.PI * radius * radius) / (w * h);
  if (share <= 0) return 0;
  return inside / area / share;
}

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
/* -------------------------------------------------------------------------- */
/* Jetons NOYÉS dans une composante — recherche de cercles                    */
/* -------------------------------------------------------------------------- */
/**
 * Retrouve les jetons contenus dans une composante trop grande pour en être un.
 *
 * POURQUOI CE PASSAGE EXISTE
 * Sur un dessin de coach, tout se touche. Une file d'attente est une chaîne de
 * ronds qui se chevauchent ; le ballon touche son porteur ; chaque trajectoire
 * part d'un jeton et arrive sur un autre. L'extraction par composantes connexes
 * fusionne donc l'essentiel du dessin en deux ou trois blocs, et le test « cette
 * composante est-elle un jeton ? » répond non pour chacun : ni jeton (trop
 * allongé), ni tracé (trop plein). Tout est jeté d'un bloc.
 *
 * Mesuré sur le premier document réel : sur dix jetons, les deux SEULS que le
 * moteur retrouvait étaient les deux qui ne touchaient rien.
 *
 * LA RÈGLE, ET ELLE EST GÉNÉRALE
 * Un jeton de joueur est un CERCLE — plein ou en anneau, peu importe — et il a
 * de l'air autour de lui. Un cercle reste un cercle quand on lui colle un
 * voisin ou une flèche. On cherche donc les cercles directement dans l'encre,
 * au lieu de juger la forme globale de la composante.
 *
 * Deux tests, tous deux exprimés RELATIVEMENT au rayon cherché, donc valables à
 * n'importe quelle échelle :
 *   - COURONNE : la part du pourtour de rayon r qui est encrée ;
 *   - DÉGAGEMENT : la part du pourtour de rayon 1,5 r qui ne l'est PAS.
 * Le dégagement est ce qui distingue un jeton d'un point quelconque au milieu
 * d'un aplat : à l'intérieur d'une masse d'encre, la couronne est parfaite mais
 * rien n'est dégagé. Deux jetons qui se touchent ne se masquent l'un l'autre
 * que sur un petit arc : le dégagement reste largement majoritaire.
 *
 * CE QUI GARANTIT L'ABSENCE DE RÉGRESSION
 * Ce passage ne s'applique QU'AUX composantes que le tamis précédent écarte
 * parce qu'elles sont trop grandes pour être un jeton (plus de 19 % de la
 * largeur du terrain, soit au moins une fois et demie le plus gros jeton
 * possible). Une composante déjà reconnue comme jeton n'y passe jamais. Sur un
 * schéma aux éléments séparés — toute la batterie synthétique — il ne change
 * donc rigoureusement rien.
 *
 * MÉTHODE ESSAYÉE ET ÉCARTÉE — écarter les cercles posés sur le MASQUE DES
 * LIGNES du terrain, pour ne pas prendre l'arceau, le rond des lancers francs
 * ou le rond central pour des joueurs. L'intention est bonne (ces faux positifs
 * existent, mesurés : 4 sur le premier cas réel) mais la mise en œuvre casse la
 * catégorie « rotation marquée » de la batterie synthétique sans rien gagner sur
 * le cas réel. À reprendre avec une batterie réelle plus large.
 *
 * SEUILS DE FUSION ESSAYÉS : 0,12 / 0,13 / 0,16 → cassent « symboles collés aux
 * lignes » et/ou « trajectoires croisées ». 0,19 et 0,22 sont propres. Retenu :
 * 0,19, le plus bas qui ne casse rien.
 */
function circlesInComponent(
  ctx: InkContext,
  component: Component,
  unit: number,
  limit: number,
  calibre: number | null
): Component[] {
  const step = ctx.step;
  // Fourchette de rayon. Si le schéma a déjà montré des jetons isolés, leur
  // taille EST la référence : sur un même dessin, tous les jetons ont le même
  // calibre. Sans cette contrainte, chaque composante choisit son échelle dans
  // son coin — mesuré : l'une trouvait des cercles sur les CHIFFRES à
  // l'intérieur des anneaux, l'autre des cercles autour de PAIRES de jetons.
  const rMin = calibre
    ? Math.max(step * 2, (calibre / 2) * 0.72)
    : Math.max(step * 2, (unit * 0.03) / 2);
  const rMax = calibre ? (calibre / 2) * 1.32 : (unit * 0.12) / 2;
  if (rMax <= rMin * 1.05 || component.points.length < 24) return [];

  const RING_MIN = 0.78;
  const FREE_MIN = 0.5;
  const OUTSIDE = 1.5;
  /** Écart-type toléré sur le rayon du contour, en fraction du rayon. */
  const SPREAD_MAX = 0.14;

  /**
   * Mesure du contour : dans chaque direction, à quelle distance rencontre-t-on
   * l'encre ? Renvoie la part des directions où on la rencontre, ET la
   * régularité de cette distance.
   *
   * La RÉGULARITÉ est le test qui compte. Un jeton — plein ou en anneau — a un
   * contour à distance constante : l'écart-type des distances est quasi nul.
   * Un « anneau » formé par le hasard, par exemple deux trajectoires qui se
   * frôlent en tournant, rencontre l'encre à des distances très différentes
   * selon la direction. Sans ce test, chaque courbe un peu serrée engendre une
   * file de faux jetons — mesuré, c'est ce qui cassait les trajectoires croisées.
   */
  const outline = (cx: number, cy: number, r: number, samples: number): { hit: number; spread: number } => {
    const inner = r * 0.68;
    const outer = r * 1.32;
    const found: number[] = [];
    let hit = 0;
    for (let a = 0; a < samples; a += 1) {
      const angle = (a / samples) * Math.PI * 2;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      let distance = -1;
      for (let d = inner; d <= outer; d += step) {
        if (isInk(ctx, cx + d * ux, cy + d * uy)) {
          distance = d;
          break;
        }
      }
      if (distance > 0) {
        hit += 1;
        found.push(distance);
      }
    }
    if (!found.length) return { hit: 0, spread: 1 };
    const mean = found.reduce((sum, value) => sum + value, 0) / found.length;
    const variance = found.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / found.length;
    return { hit: hit / samples, spread: Math.sqrt(variance) / Math.max(1, r) };
  };

  const ring = (cx: number, cy: number, r: number, samples: number): number => outline(cx, cy, r, samples).hit;

  /** Part du pourtour de rayon 1,5 r qui est LIBRE. */
  const free = (cx: number, cy: number, r: number, samples: number): number => {
    let open = 0;
    for (let a = 0; a < samples; a += 1) {
      const angle = (a / samples) * Math.PI * 2;
      if (!isInk(ctx, cx + r * OUTSIDE * Math.cos(angle), cy + r * OUTSIDE * Math.sin(angle))) open += 1;
    }
    return open / samples;
  };

  const RADII = 8;
  const radii: number[] = [];
  for (let i = 0; i < RADII; i += 1) radii.push(rMin + ((rMax - rMin) * i) / (RADII - 1));

  const grid = Math.max(step, Math.round(rMin / 2));
  const found: Array<{ x: number; y: number; r: number; score: number }> = [];

  for (let cy = component.y0; cy <= component.y1; cy += grid) {
    for (let cx = component.x0; cx <= component.x1; cx += grid) {
      for (const r of radii) {
        // Pré-test à 8 échantillons : élimine l'immense majorité des positions
        // pour le prix d'un huitième du test complet.
        if (ring(cx, cy, r, 8) < RING_MIN) continue;
        if (free(cx, cy, r, 8) < FREE_MIN) continue;
        const shape = outline(cx, cy, r, 36);
        if (shape.hit < RING_MIN || shape.spread > SPREAD_MAX) continue;
        const freeScore = free(cx, cy, r, 36);
        if (freeScore < FREE_MIN) continue;
        found.push({
          x: cx,
          y: cy,
          r,
          score: shape.hit * 0.4 + freeScore * 0.3 + (1 - Math.min(1, shape.spread / SPREAD_MAX)) * 0.3,
        });
      }
    }
  }

  if (!found.length) return [];

  // Affinage : autour du meilleur réglage grossier, on cherche le rayon et le
  // centre qui maximisent la note. Sans cela le rayon reste celui d'un pas de
  // la grille, et le disque effacé avant l'extraction des tracés est trop grand.
  const refine = (seed: { x: number; y: number; r: number; score: number }) => {
    let best = seed;
    for (let pass = 0; pass < 2; pass += 1) {
      const dr = best.r * 0.12;
      const dp = Math.max(step, best.r * 0.12);
      for (const rr of [best.r - dr, best.r, best.r + dr]) {
        if (rr < rMin * 0.85 || rr > rMax * 1.15) continue;
        for (const dx of [-dp, 0, dp]) {
          for (const dy of [-dp, 0, dp]) {
            const x = best.x + dx;
            const y = best.y + dy;
            const shape = outline(x, y, rr, 36);
            if (shape.hit < RING_MIN || shape.spread > SPREAD_MAX) continue;
            const score =
              shape.hit * 0.4 + free(x, y, rr, 36) * 0.3 + (1 - Math.min(1, shape.spread / SPREAD_MAX)) * 0.3;
            if (score > best.score + 1e-6) best = { x, y, r: rr, score };
          }
        }
      }
    }
    return best;
  };

  found.sort((a, b) => b.score - a.score || b.r - a.r);

  const kept: Array<{ x: number; y: number; r: number; score: number }> = [];
  for (const candidate of found) {
    if (kept.length >= limit) break;
    // Deux jetons qui se chevauchent restent deux jetons : on n'écarte que les
    // cercles quasi confondus.
    if (kept.some((item) => Math.hypot(item.x - candidate.x, item.y - candidate.y) < Math.max(item.r, candidate.r) * 0.9)) {
      continue;
    }
    kept.push(refine(candidate));
  }

  if (kept.length < 2) return buildFromCircles(ctx, component, kept);

  // CALIBRE COMMUN : sur un même schéma, les jetons ont tous la même taille.
  // Un cercle qui s'écarte nettement du calibre dominant est autre chose — un
  // rond central, une tête de flèche, le cercle des lancers francs.
  const radiiKept = kept.map((item) => item.r).sort((a, b) => a - b);
  const median = radiiKept[radiiKept.length >> 1];
  const consistent = kept.filter((item) => Math.abs(item.r - median) <= median * 0.35);

  return buildFromCircles(ctx, component, consistent.length ? consistent : kept);
}

/** Transforme des cercles en composantes ordinaires, exploitables par l'aval. */
function buildFromCircles(
  ctx: InkContext,
  component: Component,
  circles: Array<{ x: number; y: number; r: number }>
): Component[] {
  const step = ctx.step;
  const built: Component[] = [];
  for (const circle of circles) {
    const reach = circle.r * 1.15;
    const points: Array<{ x: number; y: number }> = [];
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (const point of component.points) {
      if (Math.hypot(point.x - circle.x, point.y - circle.y) > reach) continue;
      points.push(point);
      const [r, g, b] = pixelAt(ctx.px, point.x, point.y);
      sumR += r;
      sumG += g;
      sumB += b;
    }
    if (points.length < 8) continue;
    const size = circle.r * 2;
    built.push({
      points,
      x0: circle.x - circle.r,
      y0: circle.y - circle.r,
      x1: circle.x + circle.r,
      y1: circle.y + circle.r,
      cx: circle.x,
      cy: circle.y,
      bw: size,
      bh: size,
      fillRatio: Math.min(1, (points.length * step * step) / Math.max(1, size * size)),
      color: { r: sumR / points.length, g: sumG / points.length, b: sumB / points.length },
    });
  }
  return built;
}

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
  const fusedComponentsToScan: Component[] = [];
  let fusedRecovered = 0;
  let fusedComponents = 0;

  /* --------------------------------------------------------------- NIVEAU 1 */
  /**
   * Avant toute heuristique, on demande aux gabarits MyBasket s'ils
   * reconnaissent la silhouette. Une bonne part des documents importés sont des
   * exports ou des captures de la Plaquette : pour ceux-là il n'y a rien à
   * deviner, la forme est connue au pixel près.
   *
   * Le gabarit ne se prononce que s'il est franchement d'accord avec lui-même.
   * Sinon il se tait, et le moteur générique travaille comme avant — c'est ce
   * qui évite d'inventer des défenseurs sur un dessin fait à la main.
   */
  const inkProbe = { isInk: (x: number, y: number) => isInk(ink, x, y), step: ink.step };
  const templateCalibre = (() => {
    // Calibre du schéma : la taille médiane des composantes RONDES de taille
    // plausible pour un jeton. Prendre la médiane de toutes les composantes
    // donnerait la taille des miettes, pas celle des jetons — mesuré, on
    // trouvait 30 px là où les jetons en font 65, et le regroupement voisin ne
    // se déclenchait plus.
    const sizes = components
      .filter((item) => {
        const maxSide = Math.max(item.bw, item.bh);
        const minSide = Math.max(1, Math.min(item.bw, item.bh));
        return maxSide > unit * 0.03 && maxSide < unit * 0.14 && maxSide / minSide < 1.45;
      })
      .map((item) => Math.max(item.bw, item.bh))
      .sort((a, b) => a - b);
    return sizes.length >= 2 ? sizes[sizes.length >> 1] : null;
  })();

  /*
   * Un symbole n'est pas forcément UNE composante connexe.
   *
   * Le défenseur de la Plaquette, par exemple, arrive sur une photo en trois
   * morceaux : les deux bras d'un côté, la tête de l'autre, et le corps réduit
   * à quelques fragments d'anneau. Aucun de ces morceaux ne ressemble à quoi
   * que ce soit. Ensemble, ils forment un défenseur qui ne trompe personne.
   *
   * On regroupe donc les composantes VOISINES avant de comparer : un symbole
   * est un groupement local d'encre, et la distance de regroupement est une
   * fraction du calibre du schéma, donc elle s'adapte à l'échelle.
   */
  const clusterGap = (templateCalibre ?? unit * 0.06) * 0.5;
  const clusters: Array<{ box: SymbolBox; members: Component[] }> = [];
  const usable = components.filter((item) => {
    const maxSide = Math.max(item.bw, item.bh);
    return maxSide > unit * 0.004 && maxSide < unit * 0.35;
  });
  const assigned = new Set<Component>();
  for (const seed of usable) {
    if (assigned.has(seed)) continue;
    const members = [seed];
    assigned.add(seed);
    const box = { x0: seed.x0, y0: seed.y0, x1: seed.x1, y1: seed.y1 };
    let grew = true;
    while (grew) {
      grew = false;
      for (const other of usable) {
        if (assigned.has(other)) continue;
        const near =
          other.x0 < box.x1 + clusterGap &&
          other.x1 > box.x0 - clusterGap &&
          other.y0 < box.y1 + clusterGap &&
          other.y1 > box.y0 - clusterGap;
        if (!near) continue;
        const merged = {
          x0: Math.min(box.x0, other.x0),
          y0: Math.min(box.y0, other.y0),
          x1: Math.max(box.x1, other.x1),
          y1: Math.max(box.y1, other.y1),
        };
        // Un regroupement ne doit pas enfler jusqu'à avaler le schéma entier.
        if (merged.x1 - merged.x0 > unit * 0.35 || merged.y1 - merged.y0 > unit * 0.35) continue;
        box.x0 = merged.x0;
        box.y0 = merged.y0;
        box.x1 = merged.x1;
        box.y1 = merged.y1;
        members.push(other);
        assigned.add(other);
        grew = true;
      }
    }
    clusters.push({ box, members });
  }

  /*
   * Deux fenêtres sont essayées pour chaque symbole, et la meilleure gagne :
   *
   *  - la composante SEULE : c'est le bon cadre quand le symbole est d'un seul
   *    tenant, par exemple un jeton bien contrasté ;
   *  - le GROUPEMENT de voisines : c'est le bon cadre quand le symbole est
   *    arrivé en morceaux.
   *
   * Essayer les deux évite d'avoir à choisir une distance de regroupement
   * parfaite — elle n'existe pas : sur ce document, un défenseur et l'attaquant
   * qu'il défend sont plus proches l'un de l'autre que les morceaux d'un même
   * défenseur.
   */
  let templateHits = 0;
  const tryMatch = (box: SymbolBox) => {
    if (Math.max(box.x1 - box.x0, box.y1 - box.y0) < unit * 0.02) return null;
    return matchMyBasketSymbol(inkProbe, box, { calibre: templateCalibre });
  };

  for (const cluster of clusters) {
    const carrier = cluster.members.reduce((best, item) =>
      item.points.length > best.points.length ? item : best
    );
    const alone = tryMatch(carrier);
    const grouped = cluster.members.length > 1 ? tryMatch(cluster.box) : null;
    const best =
      alone && grouped ? (alone.confidence >= grouped.confidence ? alone : grouped) : alone || grouped;
    if (!best) continue;
    // ACTIVATION PAR TYPE, voie par COMPOSANTES. Tout y est actif : c'est le
    // comportement historique, et il participe aux résultats de référence.
    // Voir LEVEL1_COMPONENT_ENABLED_TYPES (mybasket-symbols.ts).
    if (!level1ComponentEnabled(best.kind)) continue;
    carrier.template = best;
    templateHits += 1;
  }
  if (templateHits) {
    reject("symboles MyBasket", `${templateHits} symbole(s) reconnu(s) par gabarit (niveau 1)`);
  }

  /* ------------------------------------------ NIVEAU 1 — BALLON, PAR BALAYAGE */
  /**
   * Le ballon est le SEUL symbole cherché directement dans le masque d'encre,
   * par balayage position × échelle, sans passer par les composantes connexes.
   *
   * Pourquoi lui et pas les autres : sur le cas 03 — un croquis fait main où
   * aucun symbole MyBasket n'existe, donc où toute détection est un faux
   * positif — sa confiance maximale est exactement 0,000. Il n'a jamais approché
   * le seuil. Les attaquants y montent à 0,956 et produisent jusqu'à 48 faux
   * positifs, les défenseurs et les plots en produisent quelques-uns autour de
   * 0,70–0,90. Le silence du ballon est démontré ; celui des autres ne l'est pas.
   *
   * Pourquoi par balayage : le ballon de la Plaquette est collé au porteur, donc
   * il ne forme presque jamais une composante connexe à lui seul.
   *
   * CINQ conditions cumulatives, toutes explicites ici :
   *   1. une région de terrain valide existe — sinon on ne balaye RIEN ;
   *   2. score fort, nettement au-dessus du seuil de la recherche directe ;
   *   3. marge face aux autres gabarits : le balayage tourne avec TOUS les
   *      gabarits pour que la marge inter-gabarits joue, et on ne garde que les
   *      ballons ensuite ;
   *   4. teinte compatible, revérifiée ici ;
   *   5. taille plausible, en absolu et vis-à-vis du calibre du schéma.
   *
   * `detectProvenance()` n'intervient PAS : mesuré, elle classe un vrai export
   * MyBasket en « hand-drawn ». C'est une information de diagnostic, jamais une
   * condition d'activation.
   */
  const ballBoxes: SymbolBox[] = [];
  if (level1DirectScanEnabled("ball")) {
    if (!geometry.playDetected) {
      // GARDE-FOU. Sans terrain, le balayage porterait sur toute la photo : sur
      // le cas 03 il trouvait alors 53 symboles, dont 48 attaquants nés du
      // téléviseur, du téléphone et des doigts. Pas de terrain, pas de balayage.
      reject("niveau 1 ballon", "aucune région de terrain exploitable : balayage MyBasket non lancé");
    } else {
      const BALL_MIN_CONFIDENCE = 0.8;
      const pixels = readPixels(work);
      const detections = findMyBasketSymbols(ink.ink, ink.px.w, ink.px.h, {
        unit,
        // `calibre: null` VOLONTAIREMENT. Le calibre du schéma est celui des
        // JETONS ; le ballon, lui, fait environ la moitié d'un jeton. Mesuré sur
        // le cas 02 : calibre 73 px, ballon 37 px — en imposant le calibre
        // global, la cohérence par type reclasse le ballon en attaquant et il
        // disparaît (ballon 1 → 0, attaquants 16 → 21). Laissé à null, le
        // balayage établit lui-même un calibre PAR TYPE, ce qui est la
        // configuration dont les métriques ont servi à décider l'activation.
        calibre: null,
        // Seuil de la recherche elle-même : bas, pour que les autres gabarits
        // participent à la marge. Le tri sévère se fait juste après.
        minimum: 0.62,
        colourAt: (x: number, y: number) => {
          const [r, g, b] = pixelAt(pixels, Math.round(x), Math.round(y));
          return { hue: hueOf(r, g, b), saturation: saturationOf(r, g, b) };
        },
      });

      const margin = unit * 0.02;

      /**
       * CARACTÉRISATION D'UN CANDIDAT BALLON.
       *
       * Mesurée AVANT tout tri, pour que le rejet dise sur quoi il porte. Sans
       * cela un candidat écarté sur son score ne laisse aucune trace de sa
       * couleur ni de sa forme, et on ne peut pas savoir s'il était vrai.
       */
      const decrire = (detection: DirectDetection) => {
        const hues: number[] = [];
        const saturations: number[] = [];
        const radius = detection.scale * 0.3;
        for (let a = 0; a < 8; a += 1) {
          const angle = (a / 8) * Math.PI * 2;
          const [r, g, b] = pixelAt(
            pixels,
            Math.round(detection.x + radius * Math.cos(angle)),
            Math.round(detection.y + radius * Math.sin(angle))
          );
          hues.push(hueOf(r, g, b));
          saturations.push(saturationOf(r, g, b));
        }
        hues.sort((a, b) => a - b);
        saturations.sort((a, b) => a - b);

        // Marge face aux autres gabarits, au même endroit et à la même échelle.
        const scores = scoreMyBasketTemplates(inkProbe, detection.box);
        const ball = scores.find((item) => item.kind === "ball");
        const autre = scores.find((item) => item.kind !== "ball");

        // Circularité et remplissage, sur la boîte du candidat.
        let encre = 0;
        let total = 0;
        let dansDisque = 0;
        const cx = (detection.box.x0 + detection.box.x1) / 2;
        const cy = (detection.box.y0 + detection.box.y1) / 2;
        const rayon = Math.max(1, (detection.box.x1 - detection.box.x0) / 2);
        for (let y = Math.floor(detection.box.y0); y <= Math.ceil(detection.box.y1); y += 1) {
          for (let x = Math.floor(detection.box.x0); x <= Math.ceil(detection.box.x1); x += 1) {
            total += 1;
            if (!isInk(ink, x, y)) continue;
            encre += 1;
            if (Math.hypot(x - cx, y - cy) <= rayon) dansDisque += 1;
          }
        }
        return {
          hue: hues[hues.length >> 1],
          saturation: saturations[saturations.length >> 1],
          scoreBall: ball ? ball.score : 0,
          scoreAutre: autre ? autre.score : 0,
          autreKind: autre ? autre.kind : "—",
          marge: (ball ? ball.score : 0) - (autre ? autre.score : 0),
          circularite: encre ? dansDisque / encre : 0,
          remplissage: total ? encre / total : 0,
          relative: detection.scale / unit,
          versCalibre: templateCalibre ? detection.scale / templateCalibre : null,
        };
      };

      for (const detection of detections) {
        if (detection.type !== "ball") continue;
        const d = decrire(detection);
        const carte =
          `score ${detection.confidence.toFixed(3)} · gabarit ballon ${d.scoreBall.toFixed(3)}` +
          ` · second ${d.autreKind} ${d.scoreAutre.toFixed(3)} · marge ${d.marge.toFixed(3)}` +
          ` · teinte ${Math.round(d.hue)}° sat ${d.saturation.toFixed(2)}` +
          ` · circularité ${d.circularite.toFixed(2)} · remplissage ${d.remplissage.toFixed(2)}` +
          ` · taille ${(d.relative * 100).toFixed(1)} % de la largeur` +
          (d.versCalibre === null ? " · calibre inconnu" : ` · ${d.versCalibre.toFixed(2)} × le calibre jeton`);
        reject("niveau 1 ballon — candidat", carte);

        if (detection.confidence < BALL_MIN_CONFIDENCE) {
          reject("niveau 1 ballon", `score ${detection.confidence.toFixed(2)} sous le seuil de production 0,80`);
          continue;
        }
        // Région de terrain : le ballon d'un exercice est sur le terrain.
        if (
          detection.x < play.x0 - margin ||
          detection.x > play.x1 + margin ||
          detection.y < play.y0 - margin ||
          detection.y > play.y1 + margin
        ) {
          reject("niveau 1 ballon", "hors de l'aire de jeu");
          continue;
        }
        // Taille plausible : en absolu, et vis-à-vis du calibre du schéma.
        const relative = detection.scale / unit;
        if (relative < 0.02 || relative > 0.09) {
          reject("niveau 1 ballon", `taille ${(relative * 100).toFixed(1)} % de la largeur, hors plage 2–9 %`);
          continue;
        }
        // Vis-à-vis du calibre des jetons : un ballon fait environ la moitié
        // d'un jeton (37 px pour 73 sur le cas 02). La borne basse est donc à
        // 0,35 et non à 0,5, qui l'aurait rejeté de justesse.
        if (templateCalibre && (detection.scale < templateCalibre * 0.35 || detection.scale > templateCalibre * 1.6)) {
          reject("niveau 1 ballon", "taille incohérente avec le calibre des jetons du schéma");
          continue;
        }
        // Teinte : revérifiée ici, sur un disque centré, et non déléguée.
        const hues: number[] = [];
        const saturations: number[] = [];
        const radius = detection.scale * 0.3;
        for (let a = 0; a < 8; a += 1) {
          const angle = (a / 8) * Math.PI * 2;
          const [r, g, b] = pixelAt(
            pixels,
            Math.round(detection.x + radius * Math.cos(angle)),
            Math.round(detection.y + radius * Math.sin(angle))
          );
          hues.push(hueOf(r, g, b));
          saturations.push(saturationOf(r, g, b));
        }
        hues.sort((a, b) => a - b);
        saturations.sort((a, b) => a - b);
        const hue = hues[hues.length >> 1];
        const saturation = saturations[saturations.length >> 1];
        if (hue < 5 || hue > 33 || saturation < 0.35) {
          reject("niveau 1 ballon", `teinte ${Math.round(hue)}° saturation ${saturation.toFixed(2)} : pas un ballon`);
          continue;
        }

        const centre = norm(detection.x, detection.y);
        objects.push({
          kind: "ball",
          x: centre.x,
          y: centre.y,
          confidence: Number(detection.confidence.toFixed(3)),
          source: "mybasket-template",
        });
        ballBoxes.push(detection.box);
      }
    }
  }

  /*
   * On masque UNIQUEMENT la petite zone du ballon : les composantes entièrement
   * contenues dans sa boîte sont retirées, pour que le moteur générique ne
   * fabrique pas un second objet au même endroit. Tout le reste du schéma
   * continue son chemin normalement — le ballon de la Plaquette est collé au
   * porteur, et il n'est pas question d'emporter le joueur avec lui.
   */
  const explained = new Set<Component>();
  for (const box of ballBoxes) {
    for (const component of components) {
      if (
        component.x0 >= box.x0 &&
        component.x1 <= box.x1 &&
        component.y0 >= box.y0 &&
        component.y1 <= box.y1
      ) {
        explained.add(component);
      }
    }
  }

  for (const component of components) {
    // Zone déjà expliquée par le ballon de niveau 1.
    if (explained.has(component)) continue;

    const maxSide = Math.max(component.bw, component.bh);
    const minSide = Math.min(component.bw, component.bh);
    const ratio = maxSide / Math.max(1, minSide);

    // NIVEAU 1 prioritaire : la silhouette est celle d'un symbole MyBasket.
    if (component.template) {
      const kind = component.template.kind;
      if (kind === "attacker" || kind === "defender") {
        tokenCandidates.push(component);
        continue;
      }
      if (kind === "cone" || kind === "ball" || kind === "lateralBasket") {
        objects.push({
          kind: kind === "lateralBasket" ? "circle" : kind,
          x: norm(component.template.centre.x, component.template.centre.y).x,
          y: norm(component.template.centre.x, component.template.centre.y).y,
          confidence: component.template.confidence,
          source: "mybasket-template",
        });
        continue;
      }
    }

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
      if (trajectoryLike(component)) {
        reject("jeton joueur", "squelette de trait et couleur du support : laissé au détecteur de tracés");
        continue;
      }
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

    // Composante trop grande pour être UN jeton : elle en contient peut-être
    // PLUSIEURS, collés entre eux ou accrochés à une trajectoire. On la met de
    // côté ; la recherche de cercles a lieu APRÈS la boucle, quand on connaît le
    // calibre des jetons isolés du schéma.
    if (maxSide > unit * 0.19) fusedComponentsToScan.push(component);

    // Les TRACÉS ne sont pas collectés ici : ils le seront dans un second
    // passage, une fois les disques des joueurs retirés (voir plus bas).
    if (maxSide > unit * 0.075 || (ratio >= 2.2 && maxSide > unit * 0.03)) continue;

    reject("composante indéterminée", "ni jeton joueur ni trajectoire exploitable");
  }

  // Calibre de référence : la taille des jetons DÉJÀ reconnus, c'est-à-dire
  // ceux qui ne touchaient rien. C'est la mesure la plus sûre du schéma.
  const isolatedSizes = tokenCandidates
    .map((item) => Math.max(item.bw, item.bh))
    .sort((a, b) => a - b);
  const calibre = isolatedSizes.length >= 2 ? isolatedSizes[isolatedSizes.length >> 1] : null;

  for (const component of fusedComponentsToScan) {
    const found = circlesInComponent(ink, component, unit, MAX_PLAYERS, calibre);
    if (!found.length) continue;
    for (const circle of found) tokenCandidates.push(circle);
    fusedRecovered += found.length;
    fusedComponents += 1;
  }

  if (fusedComponents) {
    reject(
      "jetons collés",
      `${fusedRecovered} jeton(s) retrouvé(s) dans ${fusedComponents} composante(s) fusionnée(s)` +
        (calibre ? ` (calibre ${Math.round(calibre)} px)` : " (calibre inconnu)")
    );
  }

  // Le décor du gabarit (logo, pastilles du rond central…) doit être écarté
  // AVANT le plafond de MAX_PLAYERS, sinon il occupe les places disponibles et
  // le filtrage arrive trop tard.
  const cleaned = dropDecorTokens(ink, tokenCandidates, unit, reject);

  // Sélection : les plus grosses composantes d'abord (les plus crédibles).
  //
  // MÉTHODE ESSAYÉE ET ÉCARTÉE — classer par proximité au CALIBRE DOMINANT
  // (« sur un schéma, les jetons ont tous la même taille »). L'idée est juste et
  // aide en théorie les jetons récupérés dans les blocs fusionnés, qui sont
  // petits. Mesuré : elle casse « symboles collés aux lignes » et « trajectoires
  // croisées » (faux positifs 16 → 18) et fait BAISSER le cas réel (5 → 4
  // joueurs). Ne pas la retenter sans une batterie réelle plus large.
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

    // TROISIÈME INDICE — concentration de masse, uniquement en PROMOTION.
    // Il n'intervient que lorsque les deux indices historiques sont muets,
    // c'est-à-dire quand le moteur générique s'apprête à répondre `attacker`
    // par défaut. Il ne peut donc pas défaire un typage déjà obtenu.
    if (GENERIC_DEFENDER_GUARD && !merged && !arc && !cross) {
      const concentration = massConcentration(candidate);
      if (concentration >= DEFENSE_MASS_MIN) {
        defenseEvidence = Math.max(defenseEvidence, 0.55);
        defenseSource.push(`noyau dense et extensions fines (${concentration.toFixed(2)})`);
      }
    }

    // NIVEAU 1 — le gabarit MyBasket tranche, quand il s'est prononcé.
    // La forme du défenseur de la Plaquette est connue exactement : quand une
    // silhouette lui correspond franchement, aucun faisceau d'indices ne vaut
    // mieux que cette correspondance. À l'inverse, un attaquant reconnu par
    // gabarit ÉTEINT les indices défensifs : un rond plein n'a pas de bras.
    if (candidate.template?.kind === "defender") {
      defenseEvidence = Math.max(defenseEvidence, candidate.template.confidence);
      defenseSource.push(`gabarit MyBasket (${(candidate.template.confidence * 100).toFixed(0)} %)`);
    } else if (candidate.template?.kind === "attacker") {
      defenseEvidence = 0;
      defenseSource.length = 0;
      defenseSource.push(`gabarit MyBasket attaquant (${(candidate.template.confidence * 100).toFixed(0)} %)`);
    }

    // Centre logique. Le gabarit sait où est le corps ; sinon, des bras
    // fusionnés décentrent la boîte vers le haut et on vise le disque.
    const centre = candidate.template
      ? candidate.template.centre
      : merged
      ? discCentre(candidate)
      : { x: candidate.cx, y: candidate.cy };

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
      confidence: Number(
        (item.candidate.template ? Math.max(detection, item.candidate.template.confidence) : detection).toFixed(3)
      ),
      typeConfidence: Number(
        (item.candidate.template ? Math.max(typeConfidence, item.candidate.template.confidence) : typeConfidence).toFixed(3)
      ),
      source: item.candidate.template ? "mybasket-template" : source,
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

  /*
   * TRACÉS QUI SORTENT DU TERRAIN.
   *
   * L'image de travail est recadrée sur l'aire de jeu plus PLAY_MARGIN (8 %).
   * Une flèche qui file vers un coin hors terrain est donc COUPÉE par ce
   * recadrage, et le moignon qui reste tombe sous le minimum de longueur. Sur
   * le cas 01, deux des sept tracés relevés sortent de la fenêtre : la grande
   * courbe marine de 10 px, la grande courbe rouge de 2 px.
   *
   * On refait donc l'extraction des composantes de tracé — ET ELLE SEULE — sur
   * un recadrage plus large, puis on ramène les composantes obtenues dans les
   * coordonnées de l'image de travail. Rien d'autre ne change de fenêtre :
   * joueurs, objets, ballon, plots, masque des lignes, `unit`, `norm`, seuils,
   * tout continue de vivre dans l'image historique.
   *
   * Le passage d'une fenêtre à l'autre se lit sur l'AIRE DE JEU, qui existe
   * dans les deux et désigne le même rectangle physique : c'est l'affinité qui
   * envoie `large.play` sur `play`. Aucune hypothèse sur l'échelle ni sur
   * l'orientation n'est nécessaire.
   */
  const strokeSource: Component[] = (() => {
    if (!TRACE_EXTRACTION_MARGIN || TRACE_MARGIN <= PLAY_MARGIN) {
      return extractComponents(strokeContext);
    }
    const large = prepareWork(source, geometry, TRACE_MARGIN);
    const largeW = Math.max(1, large.play.x1 - large.play.x0);
    const largeH = Math.max(1, large.play.y1 - large.play.y0);
    const sx = playW / largeW;
    const sy = playH / largeH;
    // large → travail, et son inverse pour y reporter les disques des joueurs.
    const versTravail = (x: number, y: number) => ({
      x: play.x0 + (x - large.play.x0) * sx,
      y: play.y0 + (y - large.play.y0) * sy,
    });
    const versLarge = (x: number, y: number) => ({
      x: large.play.x0 + (x - play.x0) / sx,
      y: large.play.y0 + (y - play.y0) / sy,
    });

    const largeInk = makeInkContext(large.canvas, geometry.kind, large.play);
    const lw = largeInk.px.w;
    const lh = largeInk.px.h;
    const largeStroke = new Uint8Array(largeInk.ink);
    // Mêmes disques retirés, aux mêmes endroits du terrain.
    for (const disc of removed) {
      const c = versLarge(disc.x, disc.y);
      const r = disc.r / Math.max(1e-6, sx);
      const x0 = Math.max(0, Math.floor(c.x - r));
      const x1 = Math.min(lw - 1, Math.ceil(c.x + r));
      const y0 = Math.max(0, Math.floor(c.y - r));
      const y1 = Math.min(lh - 1, Math.ceil(c.y + r));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if (Math.hypot(x - c.x, y - c.y) <= r) largeStroke[y * lw + x] = 0;
        }
      }
    }
    // Même fermeture morphologique 3×3 que ci-dessus.
    const lClosed = new Uint8Array(largeStroke.length);
    for (let y = 0; y < lh; y += 1) {
      for (let x = 0; x < lw; x += 1) {
        let on = 0;
        for (let dy = -1; dy <= 1 && !on; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= lh) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= lw) continue;
            if (largeStroke[yy * lw + xx]) { on = 1; break; }
          }
        }
        lClosed[y * lw + x] = on;
      }
    }
    for (let y = 0; y < lh; y += 1) {
      for (let x = 0; x < lw; x += 1) {
        let keep = 1;
        for (let dy = -1; dy <= 1 && keep; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= lh) { keep = 0; break; }
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= lw || !lClosed[yy * lw + xx]) { keep = 0; break; }
          }
        }
        if (keep) largeStroke[y * lw + x] = 1;
      }
    }

    const out: Component[] = [];
    for (const component of extractComponents({ ...largeInk, ink: largeStroke })) {
      const points = component.points.map((point) => versTravail(point.x, point.y));
      if (!points.length) continue;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let sxSum = 0;
      let sySum = 0;
      for (const point of points) {
        if (point.x < x0) x0 = point.x;
        if (point.y < y0) y0 = point.y;
        if (point.x > x1) x1 = point.x;
        if (point.y > y1) y1 = point.y;
        sxSum += point.x;
        sySum += point.y;
      }
      const bw = Math.max(1, x1 - x0);
      const bh = Math.max(1, y1 - y0);
      out.push({
        ...component,
        points,
        x0,
        y0,
        x1,
        y1,
        cx: sxSum / points.length,
        cy: sySum / points.length,
        bw,
        bh,
        fillRatio: points.length / (bw * bh),
      });
    }
    return out;
  })();

  for (const component of strokeSource) {
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
    /*
     * DRIBBLE — ALTERNER N'EST PAS ONDULER.
     *
     * La règle historique demande au tracé de repasser au moins trois fois d'un
     * côté à l'autre de sa corde, avec une amplitude d'au moins 1,2 % de la
     * largeur. Elle attrape les dribbles bien dessinés et rate les vrais.
     *
     * Mesuré sur le dribble cyan du cas 01 — un dribble à main levée,
     * parfaitement visible à l'œil : sept alternances, mais seulement 0,78 %
     * d'amplitude. Il sort en `cut`. Le dribble synthétique, lui, ondule à
     * 1,69 % et passe. Le seuil ne sépare donc pas « dribble » de « coupe » ; il
     * sépare « dribble largement dessiné » de « dribble serré ».
     *
     * Abaisser le seuil d'amplitude serait ajuster une constante entre 0,15 % et
     * 0,78 % sur une seule image. On ajoute plutôt la grandeur qui décrit
     * vraiment une ondulation : le nombre de CHANGEMENTS DE CAP. Un dribble
     * tourne sans arrêt ; un trait droit qui vibre autour de sa propre corde
     * alterne de côté sans jamais changer de direction.
     *
     *      tracé                     alternances   amplitude   changements de cap
     *      dribble synthétique            7          1,69 %           11
     *      dribble cyan, cas 01           7          0,78 %           13
     *      coupe cas 01 nº 6              5          0,15 %            0
     *      coupe cas 02 T1 nº 1           4          0,17 %            0
     *
     * Les deux vrais dribbles sont à 11 et 13 ; les deux fausses alternances à
     * zéro. La séparation est franche et porte sur la forme, pas sur l'échelle.
     *
     * Le plancher d'amplitude est conservé, très bas (0,4 %), pour qu'un tracé
     * qui ne bouge pas du tout ne puisse jamais basculer quel que soit son cap.
     *
     * LIMITE CONNUE : la polyligne est rééchantillonnée à un nombre fixe de
     * points. Un dribble très long serait sous-échantillonné et ses vagues
     * pourraient disparaître. Les deux dribbles observés donnent 11 et 13, mais
     * ne pas supposer que ça tient à toute longueur — remesurer.
     */
    if (TRACE_ACTION_CLASSIFIER_V2) {
      let virages = 0;
      let capPrecedent: number | null = null;
      for (let i = 1; i < poly.points.length; i += 1) {
        const cap = Math.atan2(poly.points[i].y - poly.points[i - 1].y, poly.points[i].x - poly.points[i - 1].x);
        if (capPrecedent !== null) {
          let delta = cap - capPrecedent;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          if (Math.abs(delta) > 0.35) virages += 1;
        }
        capPrecedent = cap;
      }
      if (changes >= 3 && virages >= 6 && amplitude > unit * 0.004) return "dribble";
    } else if (changes >= 3 && amplitude > unit * 0.012) {
      return "dribble";
    }

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
      /*
       * DIAGNOSTIC DU REJET. Le taux de recouvrement seul ne dit pas si le
       * masque est trop large, mal placé, ou si la composante est vraiment une
       * ligne du terrain. On mesure donc, au moment du rejet uniquement :
       * distance réelle au masque, forme, et présence d'une pointe de flèche.
       */
      const premier = poly.points[0];
      const dernier = poly.points[poly.points.length - 1];
      const corde = Math.hypot(dernier.x - premier.x, dernier.y - premier.y);
      let developpee = 0;
      for (let i = 1; i < poly.points.length; i += 1) {
        developpee += Math.hypot(poly.points[i].x - poly.points[i - 1].x, poly.points[i].y - poly.points[i - 1].y);
      }
      // Distance de chaque point au masque : plus petit rayon où il touche.
      const distances = poly.points.map((point) => {
        for (let r = 0; r <= unit * 0.06; r += Math.max(1, unit * 0.002)) {
          if (nearCourtLine(ink, point.x, point.y, r)) return r;
        }
        return unit * 0.06;
      });
      const moyenne = distances.reduce((a, b) => a + b, 0) / Math.max(1, distances.length);
      const maxi = distances.reduce((a, b) => Math.max(a, b), 0);
      const pointe = arrowHeadEvidence(context ?? ink, poly).hasArrow
        || arrowEvidence(poly).hasArrow
        || (component ? arrowHeadEvidenceByPoints(component, poly, unit).hasArrow : false);
      const cap = (Math.atan2(dernier.y - premier.y, dernier.x - premier.x) * 180) / Math.PI;
      // Position, en fractions de l'aire de jeu, pour nommer la ligne à l'œil.
      const f = (point: AiPoint) => `${((point.x - play.x0) / playW).toFixed(2)},${((point.y - play.y0) / playH).toFixed(2)}`;
      reject(
        "trajectoire — détail du rejet ligne",
        `recouvrement ${Math.round(onLine * 100)} % · corde ${(corde / unit * 100).toFixed(1)} %` +
          ` · développée ${(developpee / unit * 100).toFixed(1)} % · sinuosité ${(corde > 0 ? developpee / corde : 0).toFixed(2)}` +
          ` · cap ${cap.toFixed(0)}° · distance au masque moy ${(moyenne / unit * 100).toFixed(2)} %` +
          ` max ${(maxi / unit * 100).toFixed(2)} % · pointe ${pointe ? "OUI" : "non"}` +
          ` · de (${f(premier)}) à (${f(dernier)})`
      );
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
