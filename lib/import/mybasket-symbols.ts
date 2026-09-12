/**
 * lib/import/mybasket-symbols.ts
 * ---------------------------------------------------------------------------
 * NIVEAU 1 — RECONNAISSANCE DES SYMBOLES MYBASKET.
 *
 * Une grande partie des documents importés sont des exports ou des captures de
 * MyBasket lui-même. Pour ceux-là, il n'y a rien à deviner : on sait exactement
 * ce que la Plaquette dessine, au pixel près.
 *
 * D'où le principe de ce module : les gabarits de référence ne sont PAS des
 * formes théoriques réécrites à la main. Ce sont les MÊMES instructions canvas
 * que `app/plaquette/PlaquetteClient.tsx`, recopiées telles quelles depuis
 * `drawAttackerShape`, `drawDefenderShape`, `drawBall` et `drawObject`, et
 * réellement rendues ici. Si la Plaquette change ses formes, on met à jour ces
 * fonctions et la reconnaissance suit — il n'y a pas de description parallèle
 * qui puisse diverger.
 *
 * CE MODULE NE REMPLACE PAS LE MOTEUR GÉNÉRIQUE.
 * Il ne prend la main que lorsque la signature correspond franchement. En
 * dessous du seuil, il ne dit rien et le moteur générique (niveau 2) travaille
 * comme avant. C'est ce qui empêche de fabriquer des faux positifs sur un
 * dessin fait à la main.
 *
 * ---------------------------------------------------------------------------
 * DESCRIPTEURS
 *
 * La comparaison se fait sur la SILHOUETTE (encre / pas encre), jamais sur les
 * couleurs — une capture d'écran, un moiré, une compression JPEG ou un simple
 * changement de couleur d'équipe déplacent les teintes mais pas la forme.
 *
 * Tous les descripteurs sont normalisés par la boîte englobante, donc
 * invariants à l'échelle :
 *   - proportions      : largeur / hauteur ;
 *   - remplissage      : part de la boîte réellement encrée ;
 *   - centre de masse  : où pèse l'encre dans la boîte ;
 *   - profil vertical  : largeur d'encre par bande horizontale (8 bandes) ;
 *   - profil horizontal: hauteur d'encre par bande verticale (8 bandes) ;
 *   - symétrie         : miroir gauche/droite et haut/bas.
 *
 * Le profil vertical est ce qui sépare vraiment les symboles : un défenseur est
 * étroit en haut (la tête), très large au milieu (les bras) et rond en bas (le
 * corps) ; un plot est pointu en haut et posé sur une base plus large que lui ;
 * un attaquant est un disque, donc son profil est un demi-cercle.
 */

import type { CourtKind } from "./court-geometry";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type MyBasketSymbolKind = "attacker" | "defender" | "cone" | "ball" | "lateralBasket";

export type SymbolMatch = {
  kind: MyBasketSymbolKind;
  /** Score de similarité 0..1. Ce n'est jamais un oui/non. */
  confidence: number;
  /** Centre LOGIQUE du symbole : le corps pour un défenseur, pas la boîte. */
  centre: { x: number; y: number };
  /** Rayon logique : `r` d'un joueur, `s` d'un objet. */
  radius: number;
  source: "mybasket-template";
  reasons: string[];
};

/** Accès minimal à l'encre : ce module ne connaît rien du reste du moteur. */
export type InkProbe = {
  isInk: (x: number, y: number) => boolean;
  step: number;
};

export type SymbolBox = { x0: number; y0: number; x1: number; y1: number };

type Descriptor = {
  aspect: number;
  fill: number;
  centroidX: number;
  centroidY: number;
  vertical: number[];
  horizontal: number[];
  symmetryV: number;
  symmetryH: number;
};

const BANDS = 8;

/* -------------------------------------------------------------------------- */
/* 1. Gabarits — instructions canvas RECOPIÉES de PlaquetteClient.tsx         */
/* -------------------------------------------------------------------------- */
/**
 * Chaque fonction reproduit EXACTEMENT la géométrie de la Plaquette, à ceci
 * près que tout est tracé en noir : on ne veut que la silhouette. Les parties
 * blanches d'un symbole (l'anneau intérieur du défenseur, les bandes d'un plot)
 * sont dessinées en noir elles aussi, parce que sur une photo elles diffèrent
 * du fond au même titre que le reste — elles sont donc de l'encre.
 *
 * Les constantes ci-dessous ne doivent JAMAIS être « arrondies » ou
 * « simplifiées » : elles viennent du code de rendu.
 */

/** `drawAttackerShape` — PlaquetteClient.tsx : disque plein + anneau. */
function traceAttacker(ctx: CanvasRenderingContext2D, r: number) {
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** `drawDefenderShape` — PlaquetteClient.tsx : deux bras, tête, cou, corps. */
function traceDefender(ctx: CanvasRenderingContext2D, r: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const armW = Math.max(3, r * 0.52);
  ctx.lineWidth = armW;
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, r * 0.05);
  ctx.bezierCurveTo(-r * 1.35, r * 0.55, -r * 2.45, r * 0.15, -r * 2.55, -r * 1.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.45, r * 0.05);
  ctx.bezierCurveTo(r * 1.35, r * 0.55, r * 2.45, r * 0.15, r * 2.55, -r * 1.05);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-r * 2.55, -r * 1.05, armW * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 2.55, -r * 1.05, armW * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.55);
  ctx.lineTo(0, -r * 1.18);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -r * 1.42, r * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}

/** `drawBall` — PlaquetteClient.tsx : disque + croix. */
function traceBall(ctx: CanvasRenderingContext2D, r: number) {
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.moveTo(0, -r);
  ctx.lineTo(0, r);
  ctx.stroke();
}

/** `drawObject` case 'cone' — PlaquetteClient.tsx : base + triangle + bandes. */
function traceCone(ctx: CanvasRenderingContext2D, s: number) {
  ctx.lineWidth = Math.max(2, s * 0.16);
  // base arrondie
  ctx.beginPath();
  const bx = -s * 1.05;
  const by = s * 0.82;
  const bw = s * 2.1;
  const bh = s * 0.38;
  const rad = s * 0.12;
  ctx.moveTo(bx + rad, by);
  ctx.lineTo(bx + bw - rad, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rad);
  ctx.lineTo(bx + bw, by + bh - rad);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rad, by + bh);
  ctx.lineTo(bx + rad, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rad);
  ctx.lineTo(bx, by + rad);
  ctx.quadraticCurveTo(bx, by, bx + rad, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // cône
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.45);
  ctx.lineTo(s * 0.72, s * 0.86);
  ctx.lineTo(-s * 0.72, s * 0.86);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** `drawObject` case 'lateralBasket' — panneau + cercle. */
function traceLateralBasket(ctx: CanvasRenderingContext2D, s: number) {
  ctx.lineWidth = Math.max(2.2, s * 0.18);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 1.65, -s * 0.28);
  ctx.lineTo(s * 1.65, -s * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, s * 0.18, s * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

const TRACERS: Record<MyBasketSymbolKind, (ctx: CanvasRenderingContext2D, r: number) => void> = {
  attacker: traceAttacker,
  defender: traceDefender,
  ball: traceBall,
  cone: traceCone,
  lateralBasket: traceLateralBasket,
};

/**
 * Position du CENTRE LOGIQUE et rayon, exprimés en fractions de la boîte
 * englobante du symbole. Calculés à partir des mêmes constantes que le tracé.
 *
 *  - attaquant / ballon : disque centré, boîte 2r × 2r ;
 *  - défenseur : boîte 5,62 r × 2,84 r, corps à (0,0) donc à 64,8 % de la
 *    hauteur ; c'est le corps qui donne la position du joueur, pas la boîte,
 *    sinon le défenseur se retrouve posé un demi-mètre trop haut ;
 *  - plot : boîte 2,10 s × 2,65 s, le point d'appui est la base.
 */
const ANCHORS: Record<MyBasketSymbolKind, { cx: number; cy: number; radiusOverWidth: number }> = {
  attacker: { cx: 0.5, cy: 0.5, radiusOverWidth: 0.5 },
  ball: { cx: 0.5, cy: 0.5, radiusOverWidth: 0.5 },
  defender: { cx: 0.5, cy: 1.84 / 2.84, radiusOverWidth: 1 / 5.62 },
  cone: { cx: 0.5, cy: 1.45 / 2.65, radiusOverWidth: 1 / 2.1 },
  lateralBasket: { cx: 0.5, cy: 0.28 / 1.08, radiusOverWidth: 1 / 3.3 },
};

/* -------------------------------------------------------------------------- */
/* 2. Descripteurs                                                            */
/* -------------------------------------------------------------------------- */

function describe(
  sample: (x: number, y: number) => boolean,
  box: SymbolBox,
  samplesX = 48,
  samplesY = 48
): Descriptor | null {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  if (w <= 0 || h <= 0) return null;

  const grid: boolean[][] = [];
  for (let j = 0; j < samplesY; j += 1) {
    const row: boolean[] = [];
    const y = box.y0 + ((j + 0.5) / samplesY) * h;
    for (let i = 0; i < samplesX; i += 1) {
      const x = box.x0 + ((i + 0.5) / samplesX) * w;
      row.push(sample(x, y));
    }
    grid.push(row);
  }

  /*
   * BOUCHAGE DES TROUS — un symbole, c'est son CONTOUR EXTÉRIEUR.
   *
   * Selon le style, le même symbole arrive plein ou creux : un jeton MyBasket
   * est un disque plein bordeaux, mais dès qu'un utilisateur choisit une
   * couleur claire, ou que le fond du terrain est colorié et que le blanc
   * intérieur est écarté comme peinture, il ne reste qu'un anneau. La
   * silhouette n'a pas changé pour l'œil ; elle a changé du tout au tout pour
   * un descripteur de remplissage.
   *
   * On remplit donc toute zone non encrée qui n'est PAS reliée au bord de la
   * boîte : c'est l'intérieur de la forme. Un anneau redevient un disque, un
   * plot en fil de fer redevient un plot, et le gabarit peut comparer ce qui
   * est comparable.
   */
  const outside: boolean[][] = grid.map((row) => row.map(() => false));
  const stack: Array<[number, number]> = [];
  for (let i = 0; i < samplesX; i += 1) {
    if (!grid[0][i]) stack.push([i, 0]);
    if (!grid[samplesY - 1][i]) stack.push([i, samplesY - 1]);
  }
  for (let j = 0; j < samplesY; j += 1) {
    if (!grid[j][0]) stack.push([0, j]);
    if (!grid[j][samplesX - 1]) stack.push([samplesX - 1, j]);
  }
  while (stack.length) {
    const [i, j] = stack.pop()!;
    if (i < 0 || j < 0 || i >= samplesX || j >= samplesY) continue;
    if (outside[j][i] || grid[j][i]) continue;
    outside[j][i] = true;
    stack.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }

  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let j = 0; j < samplesY; j += 1) {
    for (let i = 0; i < samplesX; i += 1) {
      if (!grid[j][i] && !outside[j][i]) grid[j][i] = true;
      if (grid[j][i]) {
        count += 1;
        sumX += i + 0.5;
        sumY += j + 0.5;
      }
    }
  }
  if (count < 12) return null;

  const vertical = new Array(BANDS).fill(0);
  const horizontal = new Array(BANDS).fill(0);
  for (let j = 0; j < samplesY; j += 1) {
    const band = Math.min(BANDS - 1, Math.floor((j / samplesY) * BANDS));
    for (let i = 0; i < samplesX; i += 1) {
      if (!grid[j][i]) continue;
      vertical[band] += 1;
      horizontal[Math.min(BANDS - 1, Math.floor((i / samplesX) * BANDS))] += 1;
    }
  }
  const perBandV = (samplesX * samplesY) / BANDS;
  for (let k = 0; k < BANDS; k += 1) {
    vertical[k] /= perBandV;
    horizontal[k] /= perBandV;
  }

  let mirrorV = 0;
  let mirrorH = 0;
  let total = 0;
  for (let j = 0; j < samplesY; j += 1) {
    for (let i = 0; i < samplesX; i += 1) {
      total += 1;
      if (grid[j][i] === grid[j][samplesX - 1 - i]) mirrorV += 1;
      if (grid[j][i] === grid[samplesY - 1 - j][i]) mirrorH += 1;
    }
  }

  return {
    aspect: w / h,
    fill: count / (samplesX * samplesY),
    centroidX: sumX / count / samplesX,
    centroidY: sumY / count / samplesY,
    vertical,
    horizontal,
    symmetryV: mirrorV / total,
    symmetryH: mirrorH / total,
  };
}

/* -------------------------------------------------------------------------- */
/* 3. Gabarits de référence, rendus une seule fois                            */
/* -------------------------------------------------------------------------- */

let templates: Array<{ kind: MyBasketSymbolKind; descriptor: Descriptor }> | null = null;

function buildTemplates(): Array<{ kind: MyBasketSymbolKind; descriptor: Descriptor }> {
  if (templates) return templates;
  const built: Array<{ kind: MyBasketSymbolKind; descriptor: Descriptor }> = [];
  if (typeof document === "undefined") {
    templates = built;
    return built;
  }

  const R = 40;
  const SIZE = 480;
  for (const kind of Object.keys(TRACERS) as MyBasketSymbolKind[]) {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "#000000";
    TRACERS[kind](ctx, R);
    ctx.restore();

    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const on = (x: number, y: number) => {
      const xx = Math.round(x);
      const yy = Math.round(y);
      if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) return false;
      return px[(yy * SIZE + xx) * 4] < 128;
    };
    // Boîte englobante réelle du tracé.
    let x0 = SIZE;
    let y0 = SIZE;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (px[(y * SIZE + x) * 4] >= 128) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < x0 || y1 < y0) continue;
    const descriptor = describe(on, { x0, y0, x1: x1 + 1, y1: y1 + 1 });
    if (descriptor) built.push({ kind, descriptor });
  }
  templates = built;
  return built;
}

/** Descripteurs de référence — exposés pour les tests et le panneau de debug. */
export function myBasketTemplates() {
  return buildTemplates().map((item) => ({ kind: item.kind, ...item.descriptor }));
}

/* -------------------------------------------------------------------------- */
/* 4. Comparaison                                                             */
/* -------------------------------------------------------------------------- */

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Similarité entre deux descripteurs, dans [0, 1].
 *
 * Les poids reflètent la fiabilité de chaque indice sur une photo :
 *   - les proportions sont très stables (elles ne dépendent ni de la couleur ni
 *     du bruit) : poids fort ;
 *   - le profil vertical porte la structure interne : poids fort ;
 *   - le remplissage bouge un peu avec l'anticrénelage et la compression :
 *     poids moyen ;
 *   - la symétrie bouge avec la perspective : poids faible.
 */
function similarity(a: Descriptor, b: Descriptor): number {
  const aspect = clamp01(1 - Math.abs(Math.log(a.aspect / b.aspect)) / 0.55);
  const fill = clamp01(1 - Math.abs(a.fill - b.fill) / 0.3);
  const centroid = clamp01(1 - (Math.abs(a.centroidY - b.centroidY) + Math.abs(a.centroidX - b.centroidX)) / 0.3);

  let vDiff = 0;
  let hDiff = 0;
  for (let k = 0; k < BANDS; k += 1) {
    vDiff += Math.abs(a.vertical[k] - b.vertical[k]);
    hDiff += Math.abs(a.horizontal[k] - b.horizontal[k]);
  }
  const vertical = clamp01(1 - vDiff / 2.2);
  const horizontal = clamp01(1 - hDiff / 2.2);

  const symmetry = clamp01(1 - (Math.abs(a.symmetryV - b.symmetryV) + Math.abs(a.symmetryH - b.symmetryH)) / 0.5);

  return (
    aspect * 0.26 + vertical * 0.24 + horizontal * 0.14 + fill * 0.14 + centroid * 0.12 + symmetry * 0.1
  );
}

/**
 * Compare une composante aux symboles MyBasket.
 *
 * Renvoie null quand rien ne ressort franchement : le moteur générique reprend
 * alors la main, exactement comme avant ce module.
 *
 * `calibre` est la taille de jeton observée sur le schéma, si elle est connue.
 * Elle sert uniquement à départager l'ATTAQUANT du BALLON, dont les silhouettes
 * sont identiques — un disque — et que seule la taille sépare : le ballon
 * attaché à un joueur a un rayon de 0,42 r.
 */
/**
 * DIAGNOSTIC — tous les scores de gabarit d'une silhouette, sans aucun seuil.
 *
 * `matchMyBasketSymbol` ne renvoie que son verdict. Pour comprendre POURQUOI un
 * défenseur ressort en attaquant, il faut savoir si c'est un départage serré
 * (0,79 contre 0,78) ou un gabarit réellement très loin (0,79 contre 0,42) :
 * ce sont deux problèmes différents, et le verdict seul ne les distingue pas.
 *
 * Cette fonction ne prend aucune décision et n'est appelée par aucun chemin de
 * production : elle expose les scores bruts, dans l'ordre.
 */
export function scoreMyBasketTemplates(
  probe: InkProbe,
  box: SymbolBox
): Array<{ kind: MyBasketSymbolKind; score: number }> {
  const list = buildTemplates();
  if (!list.length) return [];
  const descriptor = describe((x, y) => probe.isInk(x, y), box);
  if (!descriptor) return [];
  return list
    .map((item) => ({ kind: item.kind, score: similarity(descriptor, item.descriptor) }))
    .sort((a, b) => b.score - a.score);
}

export function matchMyBasketSymbol(
  probe: InkProbe,
  box: SymbolBox,
  options: { calibre?: number | null; minimum?: number } = {}
): SymbolMatch | null {
  const list = buildTemplates();
  if (!list.length) return null;

  const descriptor = describe((x, y) => probe.isInk(x, y), box);
  if (!descriptor) return null;

  /*
   * Seuil d'acceptation. Il ne s'agit pas d'un réglage de confort : en dessous,
   * le gabarit se tait et le moteur générique décide seul, exactement comme
   * avant. Mesuré sur une photo d'écran, un jeton MyBasket parfaitement net
   * ressort à 0,85 — le moiré, la compression et la perspective coûtent
   * facilement dix points de similarité. Le garde-fou contre les faux positifs
   * n'est donc pas ce seuil mais la MARGE exigée plus bas : une silhouette qui
   * ressemble autant à deux symboles différents n'est une preuve pour aucun.
   */
  const minimum = options.minimum ?? 0.8;
  const scored = list
    .map((item) => ({ kind: item.kind, score: similarity(descriptor, item.descriptor) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < minimum) return null;

  // Le deuxième candidat doit rester nettement derrière : une silhouette qui
  // ressemble autant à deux symboles différents n'est une preuve pour aucun.
  const second = scored[1];
  const margin = second ? best.score - second.score : 1;

  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const anchor = ANCHORS[best.kind];
  const radius = width * anchor.radiusOverWidth;

  let kind = best.kind;
  const reasons = [`silhouette ${best.kind} à ${(best.score * 100).toFixed(0)} %`];

  // Attaquant ou ballon : même disque, seule la taille tranche.
  if ((kind === "attacker" || kind === "ball") && options.calibre) {
    const ratio = (radius * 2) / options.calibre;
    if (ratio < 0.62) {
      kind = "ball";
      reasons.push(`disque de ${(ratio * 100).toFixed(0)} % du calibre → ballon`);
    } else {
      kind = "attacker";
      reasons.push(`disque au calibre du schéma → jeton joueur`);
    }
  }

  // La marge n'est pas décisive entre attaquant et ballon (silhouettes
  // identiques par construction) : on ne la pénalise que sur les autres.
  const ambiguousPair =
    (best.kind === "attacker" && second?.kind === "ball") || (best.kind === "ball" && second?.kind === "attacker");
  const confidence = ambiguousPair ? best.score : clamp01(best.score * (0.72 + Math.min(0.28, margin * 2.8)));

  if (confidence < minimum) return null;

  return {
    kind,
    confidence: Number(confidence.toFixed(3)),
    centre: { x: box.x0 + width * anchor.cx, y: box.y0 + height * anchor.cy },
    radius,
    source: "mybasket-template",
    reasons,
  };
}

/* -------------------------------------------------------------------------- */
/* 5. Provenance probable du document                                         */
/* -------------------------------------------------------------------------- */

export type ImportProvenance = "mybasket-export" | "computer-drawn" | "hand-drawn";

/**
 * Provenance probable, déduite de ce qui a été reconnu et de la netteté du
 * tracé. Ce n'est pas une certitude et ça n'a pas besoin de l'être : ça sert à
 * choisir la stratégie, pas à trancher un résultat.
 *
 *  - `mybasket-export`  : des symboles MyBasket ont été reconnus franchement ;
 *  - `computer-drawn`   : pas de symbole reconnu, mais des traits d'épaisseur
 *    très régulière — un dessin fait à l'ordinateur ;
 *  - `hand-drawn`       : épaisseurs irrégulières, contours tremblés.
 */
export function detectProvenance(input: {
  templateMatches: number;
  tokens: number;
  strokeWidthSpread: number;
}): { provenance: ImportProvenance; confidence: number } {
  const { templateMatches, tokens, strokeWidthSpread } = input;
  if (tokens > 0 && templateMatches / Math.max(1, tokens) >= 0.5) {
    return { provenance: "mybasket-export", confidence: clamp01(0.6 + (templateMatches / Math.max(1, tokens)) * 0.4) };
  }
  if (strokeWidthSpread <= 0.25) {
    return { provenance: "computer-drawn", confidence: clamp01(0.55 + (0.25 - strokeWidthSpread) * 1.6) };
  }
  return { provenance: "hand-drawn", confidence: clamp01(0.5 + Math.min(0.4, (strokeWidthSpread - 0.25) * 1.2)) };
}

/** Type de terrain conservé ici pour éviter un import circulaire côté appelant. */
export type { CourtKind };

/* -------------------------------------------------------------------------- */
/* 6. RECHERCHE DIRECTE DANS LE MASQUE D'ENCRE                                */
/* -------------------------------------------------------------------------- */
/**
 * Balayage position × échelle, sans passer par les composantes connexes.
 *
 * POURQUOI
 * Comparer un gabarit à une composante suppose que le symbole soit d'un seul
 * tenant. Sur une photo, il ne l'est presque jamais : mesuré sur un export
 * MyBasket photographié, un défenseur arrive en trois morceaux — les deux bras,
 * la tête, et un corps réduit à quelques fragments d'anneau. Pire, le défenseur
 * et l'attaquant qu'il défend sont plus proches l'un de l'autre que les
 * morceaux d'un même défenseur : aucune distance de regroupement ne peut les
 * séparer.
 *
 * On cesse donc de demander au symbole d'être d'un seul tenant. On cherche sa
 * STRUCTURE là où elle est, en glissant le gabarit sur l'image à plusieurs
 * échelles.
 *
 * COMMENT — appariement de contours (Chamfer)
 * On calcule une fois la CARTE DES DISTANCES à l'encre : pour chaque pixel, à
 * quelle distance se trouve l'encre la plus proche. Pour une position et une
 * échelle données, on projette les points du contour du gabarit et on lit leur
 * distance. Un contour qui tombe pile sur l'encre donne des distances nulles ;
 * un morceau manquant donne quelques distances moyennes, pas un échec total.
 * C'est précisément la tolérance qu'il faut : fragments, contours partiels,
 * moiré et compression déplacent ou trouent le trait, ils ne le déménagent pas.
 *
 * Deux mesures, et il faut les deux :
 *   - RAPPEL    : le contour du gabarit retrouve-t-il de l'encre ?
 *   - PRÉCISION : l'encre présente dans la fenêtre est-elle expliquée par le
 *     gabarit ? Sans elle, n'importe quel gabarit se pose sur un aplat.
 */

type ContourTemplate = {
  kind: MyBasketSymbolKind;
  /** Points du contour, en fractions de la LARGEUR du gabarit (repère centré). */
  contour: Array<{ x: number; y: number }>;
  /** Points intérieurs, pour mesurer ce que le gabarit prétend remplir. */
  interior: Array<{ x: number; y: number }>;
  /** Hauteur du gabarit rapportée à sa largeur. */
  heightOverWidth: number;
  /** Part de la boîte que la silhouette occupe réellement. */
  fillRef: number;
};

let contourTemplates: ContourTemplate[] | null = null;

function buildContourTemplates(): ContourTemplate[] {
  if (contourTemplates) return contourTemplates;
  const built: ContourTemplate[] = [];
  if (typeof document === "undefined") {
    contourTemplates = built;
    return built;
  }

  const R = 40;
  const SIZE = 480;
  for (const kind of Object.keys(TRACERS) as MyBasketSymbolKind[]) {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = "#000000";
    TRACERS[kind](ctx, R);
    ctx.restore();

    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const on = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < SIZE && y < SIZE && data[(y * SIZE + x) * 4] < 128;

    let x0 = SIZE;
    let y0 = SIZE;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (!on(x, y)) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < x0) continue;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    // CONTOUR : pixel encré ayant au moins un voisin vide. C'est ce que l'on
    // retrouve dans l'encre, que le symbole soit rendu plein ou creux.
    const contour: Array<{ x: number; y: number }> = [];
    const interior: Array<{ x: number; y: number }> = [];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!on(x, y)) continue;
        const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
        const point = { x: (x - cx) / w, y: (y - cy) / w };
        if (edge) contour.push(point);
        else interior.push(point);
      }
    }
    const thin = <T,>(list: T[], target: number): T[] => {
      if (list.length <= target) return list;
      const stride = list.length / target;
      const out: T[] = [];
      for (let i = 0; i < target; i += 1) out.push(list[Math.floor(i * stride)]);
      return out;
    };

    let filled = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) if (on(x, y)) filled += 1;
    }
    built.push({
      kind,
      contour: thin(contour, 150),
      interior: thin(interior, 90),
      heightOverWidth: h / w,
      fillRef: filled / (w * h),
    });
  }
  contourTemplates = built;
  return built;
}

/** Détail d'une fenêtre candidate, étape par étape. Diagnostic uniquement. */
export type SymbolTrace = {
  label: string;
  kind: MyBasketSymbolKind;
  x: number;
  y: number;
  scale: number;
  recall: number;
  chamfer: number;
  touching: number;
  density: number;
  fillRef: number;
  precision: number;
  isolation: number;
  confidence: number;
  rejectedBy: string | null;
};

/**
 * ACTIVATION DU NIVEAU 1 — DEUX MÉCANISMES DISTINCTS, DEUX TABLES.
 *
 * Le niveau 1 ne parle pas d'une seule voix. Deux mécanismes très différents
 * portent le même nom, et les confondre a failli faire disparaître un
 * comportement qui marchait :
 *
 *   VOIE PAR COMPOSANTES (`matchMyBasketSymbol`) — historique.
 *     Chaque composante d'encre, seule ou regroupée avec ses voisines, est
 *     comparée aux gabarits. Elle ne se déclenche que là où le moteur générique
 *     a DÉJÀ trouvé quelque chose : elle ne peut pas inventer un symbole dans
 *     une zone vide. Elle est en production depuis le début et participe aux
 *     bons résultats — mesuré, la couper coûtait un attaquant sur le cas 02.
 *
 *   BALAYAGE DIRECT (`findMyBasketSymbols`) — nouveau.
 *     Position × échelle dans tout le masque d'encre, sans passer par les
 *     composantes. Beaucoup plus puissant, et beaucoup plus dangereux : il peut
 *     faire naître un symbole n'importe où. Sur le cas 03 — un croquis fait
 *     main où aucun symbole MyBasket n'existe, donc où toute détection est un
 *     faux positif par construction — il en produit 53.
 *
 * Les métriques qui décident sont donc celles du BALAYAGE :
 *
 *   type        cas 02 (export MyBasket)     cas 03 (fait main, doit se taire)
 *   ----------------------------------------------------------------------------
 *   ball        1/1 · 0 FP · rappel 100 %    0 FP · confiance max 0,000
 *   cone        3/4 · 0 FP · rappel  75 %    1 à 2 FP · confiance jusqu'à 0,90
 *   attacker    —                            15 à 48 FP · confiance jusqu'à 0,956
 *   defender    —                            2 à 3 FP · confiance jusqu'à 0,79
 *
 * Le ballon est le seul dont le silence est DÉMONTRÉ et non chanceux : sur le
 * cas 03 sa confiance maximale est exactement 0,000, il n'a jamais approché le
 * seuil. Il est donc le seul type dont le balayage direct est activé.
 *
 * Les autres gabarits restent entièrement implémentés, mesurés et
 * diagnosticables — voir tests/trace-symbols.cjs et
 * tests/trace-level1-silence.cjs — mais leur balayage ne produit rien.
 */

/**
 * VOIE PAR COMPOSANTES — comportement HISTORIQUE, inchangé.
 *
 * Tout est à `true` parce que c'est ce qui tournait avant que ces tables
 * n'existent, et que ce comportement participe aux résultats de référence. Ne
 * pas mettre un de ces types à `false` sans une mesure qui le justifie : ce
 * serait couper en silence quelque chose qui marche.
 */
export const LEVEL1_COMPONENT_ENABLED_TYPES: Record<MyBasketSymbolKind, boolean> = {
  attacker: true,
  defender: true,
  cone: true,
  ball: true,
  lateralBasket: true,
};

/**
 * BALAYAGE DIRECT — seul le ballon, seul gain validé.
 *
 * Chaque `false` est adossé aux chiffres du cas 03 rappelés ci-dessus.
 */
export const LEVEL1_DIRECT_SCAN_ENABLED_TYPES: Record<MyBasketSymbolKind, boolean> = {
  attacker: false,
  defender: false,
  cone: false,
  ball: true,
  lateralBasket: false,
};

/** La voie par composantes est-elle autorisée pour ce type ? */
export function level1ComponentEnabled(kind: MyBasketSymbolKind): boolean {
  return LEVEL1_COMPONENT_ENABLED_TYPES[kind] === true;
}

/** Le balayage direct est-il autorisé pour ce type ? */
export function level1DirectScanEnabled(kind: MyBasketSymbolKind): boolean {
  return LEVEL1_DIRECT_SCAN_ENABLED_TYPES[kind] === true;
}

export type DirectDetection = {
  type: MyBasketSymbolKind;
  x: number;
  y: number;
  /** Largeur du symbole en pixels de travail. */
  scale: number;
  confidence: number;
  source: "mybasket-template";
  /** Boîte occupée, pour marquer la zone comme expliquée. */
  box: SymbolBox;
};

/** Carte des distances à l'encre (approximation chanfrein 3-4). */
function distanceToInk(inside: Uint8Array, w: number, h: number): Float32Array {
  const BIG = 1e6;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < dist.length; i += 1) dist[i] = inside[i] ? 0 : BIG;
  const put = (i: number, value: number) => {
    if (value < dist[i]) dist[i] = value;
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (y > 0) {
        put(i, dist[i - w] + 3);
        if (x > 0) put(i, dist[i - w - 1] + 4);
        if (x + 1 < w) put(i, dist[i - w + 1] + 4);
      }
      if (x > 0) put(i, dist[i - 1] + 3);
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = y * w + x;
      if (y + 1 < h) {
        put(i, dist[i + w] + 3);
        if (x + 1 < w) put(i, dist[i + w + 1] + 4);
        if (x > 0) put(i, dist[i + w - 1] + 4);
      }
      if (x + 1 < w) put(i, dist[i + 1] + 3);
    }
  }
  for (let i = 0; i < dist.length; i += 1) dist[i] /= 3;
  return dist;
}

/**
 * Cherche tous les symboles MyBasket dans un masque d'encre.
 *
 * `calibre` (largeur d'un jeton, si connue) resserre la plage d'échelles ;
 * sans lui, on balaye largement.
 */
export function findMyBasketSymbols(
  ink: Uint8Array,
  width: number,
  height: number,
  options: {
    calibre?: number | null;
    unit: number;
    minimum?: number;
    limit?: number;
    kinds?: MyBasketSymbolKind[];
    /** Points à tracer : pour chacun, le détail de chaque étape est collecté. */
    probes?: Array<{ x: number; y: number; label: string; expect?: MyBasketSymbolKind }>;
    onTrace?: (record: SymbolTrace) => void;
    /**
     * Teinte 0..360 et saturation 0..1 d'un pixel. Facultatif, et utilisé pour
     * UN SEUL usage : reconnaître le ballon. Voir la note ci-dessous.
     */
    colourAt?: (x: number, y: number) => { hue: number; saturation: number };
  } = { unit: 0 }
): DirectDetection[] {
  /*
   * Le PANIER LATÉRAL est exclu du balayage par défaut : sa silhouette est une
   * barre surmontée d'un cercle, c'est-à-dire à peu près n'importe quel trait
   * accompagné d'une tache. Mesuré, il produisait 18 faux positifs sur une
   * seule image, davantage que tous les autres gabarits réunis. Il reste
   * disponible pour une recherche explicite, mais il ne peut pas participer à
   * une reconnaissance de masse sans discriminant supplémentaire.
   */
  const wanted = options.kinds ?? (["attacker", "defender", "cone", "ball"] as MyBasketSymbolKind[]);
  const templates = buildContourTemplates().filter((item) => wanted.includes(item.kind));
  if (!templates.length) return [];

  const unit = options.unit || width;
  const minimum = options.minimum ?? 0.62;
  const limit = options.limit ?? 60;

  const dist = distanceToInk(ink, width, height);

  // Image intégrale de l'encre : sauter instantanément les fenêtres vides.
  const integral = new Int32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += ink[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + row;
    }
  }
  const inkIn = (x0: number, y0: number, x1: number, y1: number) => {
    const ax = Math.max(0, Math.min(width, Math.round(x0)));
    const ay = Math.max(0, Math.min(height, Math.round(y0)));
    const bx = Math.max(0, Math.min(width, Math.round(x1)));
    const by = Math.max(0, Math.min(height, Math.round(y1)));
    return (
      integral[by * (width + 1) + bx] -
      integral[ay * (width + 1) + bx] -
      integral[by * (width + 1) + ax] +
      integral[ay * (width + 1) + ax]
    );
  };

  // Plage d'échelles. La LARGEUR du gabarit est l'unité : un attaquant fait
  // 2 r de large, un défenseur 5,62 r. On balaye donc en largeur de symbole.
  const base = options.calibre && options.calibre > 4 ? options.calibre : unit * 0.055;
  const widths: number[] = [];
  for (let k = -3; k <= 4; k += 1) widths.push(base * Math.pow(1.18, k));

  const found: DirectDetection[] = [];

  for (const template of templates) {
    // Un défenseur occupe 2,81 fois la largeur d'un attaquant du même rayon :
    // la plage d'échelles doit suivre le gabarit, pas l'inverse.
    const widthFactor = template.kind === "defender" ? 2.81 : template.kind === "cone" ? 1.05 : 1;
    for (const tokenWidth of widths) {
      const w = tokenWidth * widthFactor;
      const h = w * template.heightOverWidth;
      if (w < 8 || h < 8 || w > width * 0.9 || h > height * 0.9) continue;
      const stepX = Math.max(2, Math.round(w / 6));
      const stepY = Math.max(2, Math.round(h / 6));
      const tolerance = w * 0.09;

      // La fenêtre doit tenir ENTIÈREMENT dans l'image, avec la marge que le
      // test d'entourage va inspecter. Au bord, cette marge sort du cadre, le
      // pourtour paraît vide et n'importe quel amas passe pour un symbole
      // parfaitement isolé — mesuré, une colonne entière de faux jetons
      // s'alignait le long du bord droit.
      const margin = Math.max(w, h) * 0.28;
      for (let cy = h / 2 + margin; cy <= height - h / 2 - margin; cy += stepY) {
        for (let cx = w / 2 + margin; cx <= width - w / 2 - margin; cx += stepX) {
          const probe = options.probes?.find(
            (item) =>
              Math.abs(item.x - cx) <= Math.max(6, w * 0.22) && Math.abs(item.y - cy) <= Math.max(6, h * 0.22)
          );
          const note = (rejectedBy: string | null, values: Partial<SymbolTrace>) => {
            if (!probe || !options.onTrace) return;
            options.onTrace({
              label: probe.label,
              kind: template.kind,
              x: cx,
              y: cy,
              scale: w,
              recall: 0,
              chamfer: 0,
              touching: 0,
              density: 0,
              fillRef: template.fillRef,
              precision: 0,
              isolation: 0,
              confidence: 0,
              rejectedBy,
              ...values,
            });
          };

          // Fenêtre vide : rien à comparer.
          const inside = inkIn(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
          if (inside < (w * h) * 0.04) {
            note("fenêtre quasi vide", {});
            continue;
          }

          let sum = 0;
          let hits = 0;
          for (const point of template.contour) {
            const px = Math.round(cx + point.x * w);
            const py = Math.round(cy + point.y * w);
            if (px < 0 || py < 0 || px >= width || py >= height) {
              sum += tolerance * 2;
              continue;
            }
            const d = dist[py * width + px];
            sum += Math.min(d, tolerance * 2);
            if (d <= tolerance) hits += 1;
          }
          const recall = hits / template.contour.length;
          if (recall < 0.55) {
            note("rappel du contour < 0,55", { recall });
            continue;
          }
          const mean = sum / template.contour.length;
          const chamfer = Math.max(0, 1 - mean / (tolerance * 1.6));

          // AJUSTEMENT — le symbole doit toucher les quatre bords de sa fenêtre.
          // Sans cette exigence, le gabarit grandit sans fin : une fenêtre deux
          // fois trop grande contient toujours le symbole, ses points de contour
          // trouvent toujours de l'encre quelque part, et l'échelle dérive.
          const bandT = h * 0.14;
          const bandS = w * 0.14;
          let touching = 0;
          if (inkIn(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2 + bandT) > 0) touching += 1;
          if (inkIn(cx - w / 2, cy + h / 2 - bandT, cx + w / 2, cy + h / 2) > 0) touching += 1;
          if (inkIn(cx - w / 2, cy - h / 2, cx - w / 2 + bandS, cy + h / 2) > 0) touching += 1;
          if (inkIn(cx + w / 2 - bandS, cy - h / 2, cx + w / 2, cy + h / 2) > 0) touching += 1;
          if (touching < 4) {
            note("ajustement : le symbole ne touche pas les 4 bords", { recall, chamfer, touching });
            continue;
          }

          // SUR-REMPLISSAGE — un gabarit posé sur un aplat retrouve son contour
          // partout. On compare la densité d'encre de la fenêtre à celle que le
          // gabarit occupe réellement.
          const density = inside / Math.max(1, w * h);
          const over = density / Math.max(0.05, template.fillRef);
          const precision = over <= 1.15 ? 1 : Math.max(0, 1 - (over - 1.15) / 1.1);

          // ENTOURAGE — un symbole a de l'air autour de lui. On compare la
          // densité juste à l'extérieur de la fenêtre à celle de l'intérieur.
          const outer = inkIn(cx - w * 0.78, cy - h * 0.78, cx + w * 0.78, cy + h * 0.78);
          const ring = Math.max(1, w * h * (0.78 * 0.78 * 4 - 1));
          const around = (outer - inside) / ring;
          const isolation = Math.max(0, Math.min(1, 1 - around / Math.max(0.04, density * 0.9)));

          const confidence = recall * 0.4 + chamfer * 0.28 + precision * 0.18 + isolation * 0.14;
          note(confidence < minimum ? `confiance ${confidence.toFixed(3)} < seuil ${minimum}` : null, {
            recall,
            chamfer,
            touching,
            density,
            precision,
            isolation,
            confidence,
          });
          if (confidence < minimum) continue;

          found.push({
            type: template.kind,
            x: cx,
            y: cy,
            scale: w,
            confidence: Number(confidence.toFixed(3)),
            source: "mybasket-template",
            box: { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 },
          });
        }
      }
    }
  }

  /* ---------------------------------------- suppression non maximale */

  found.sort((a, b) => b.confidence - a.confidence);
  const kept: DirectDetection[] = [];
  for (const candidate of found) {
    if (kept.length >= limit) break;
    const overlap = kept.find((item) => {
      const dx = Math.abs(item.x - candidate.x);
      const dy = Math.abs(item.y - candidate.y);
      return dx < Math.max(item.scale, candidate.scale) * 0.45 && dy < Math.max(item.scale, candidate.scale) * 0.45;
    });
    if (overlap) continue;

    // MARGE : au même endroit, un autre gabarit ne doit pas faire aussi bien.
    // Sans cette exigence, un rond quelconque devient tour à tour attaquant,
    // ballon ou plot selon le hasard du bruit.
    //
    // Un rival n'en est un que s'il parle de LA MÊME CHOSE. Une détection
    // nettement plus petite, entièrement contenue dans la fenêtre du candidat,
    // n'est pas un concurrent : c'est un détail de l'objet — un disque logé dans
    // le triangle d'un plot, un chiffre imprimé dans un jeton. Mesuré : un vrai
    // plot à 0,945 perdait contre un disque à 0,906 tenant à l'intérieur de son
    // triangle, et le plot disparaissait.
    const rivals = found.filter((item) => {
      if (item === candidate || item.type === candidate.type) return false;
      if (
        Math.abs(item.x - candidate.x) >= candidate.scale * 0.35 ||
        Math.abs(item.y - candidate.y) >= candidate.scale * 0.35
      ) {
        return false;
      }
      const nested = item.scale < candidate.scale * 0.75;
      return !nested;
    });
    const best = rivals.reduce((max, item) => Math.max(max, item.confidence), 0);
    // Attaquant et ballon ont la MÊME silhouette : la marge ne peut pas les
    // départager, c'est la taille qui le fait, plus bas.
    const sameShape =
      (candidate.type === "attacker" && rivals.some((item) => item.type === "ball")) ||
      (candidate.type === "ball" && rivals.some((item) => item.type === "attacker"));
    if (!sameShape && best > candidate.confidence - 0.05) continue;

    kept.push(candidate);
  }

  /* ------------------------------- attaquant ou ballon : la taille tranche */
  /**
   * Les deux ont la MÊME silhouette — un disque — parce que `drawBall` dessine
   * un disque plein dont la croix intérieure, tracée dans un brun proche de
   * l'orange, disparaît dès que l'image est compressée ou photographiée. Seule
   * la taille les sépare : attaché à un joueur, le ballon fait 0,42 rayon.
   *
   * Cette séparation doit avoir lieu AVANT la cohérence de calibre, sinon le
   * ballon — légitimement plus petit — se fait écarter comme intrus de la
   * famille des jetons.
   */
  {
    const discs = kept.filter((item) => item.type === "attacker" || item.type === "ball");
    if (discs.length >= 2) {
      const sizes = discs.map((item) => item.scale).sort((a, b) => a - b);
      const median = sizes[sizes.length >> 1];
      for (const disc of discs) disc.type = disc.scale < median * 0.68 ? "ball" : "attacker";
    }

    /*
     * LA TEINTE, POUR LE BALLON SEULEMENT — et voici pourquoi.
     *
     * `drawBall` trace bien une croix intérieure, mais dans un brun (#7a3a10)
     * posé sur un orange (#E8743C). MESURÉ sur le cas réel 02 : entre les deux
     * diamètres de la croix et les deux diagonales, l'écart de luminance est de
     * −4,3 niveaux de gris — autrement dit les diamètres sont même légèrement
     * plus CLAIRS que le reste. La croix ne porte aucun signal à la taille où
     * un ballon est réellement dessiné (34 px de diamètre ici). Sa silhouette,
     * elle, est un disque : rigoureusement celle d'un jeton.
     *
     * Le ballon est donc le seul symbole que la forme ne peut pas identifier.
     * Restent la taille (0,42 rayon quand il est attaché) et la teinte. La
     * teinte mesurée ici est de 11°, franchement orange, loin du bordeaux (348°)
     * et de l'or (40°) de la charte.
     *
     * On l'utilise donc, mais strictement : elle ne peut que PROMOUVOIR un
     * disque en ballon, jamais déclasser un défenseur ni un plot, et jamais
     * décider seule d'une détection. Si un utilisateur colore ses jetons en
     * orange, il verra des ballons — c'est le prix, et il est assumé et écrit.
     */
    if (options.colourAt) {
      for (const disc of discs) {
        if (disc.type === "ball") continue;
        const samples: Array<{ hue: number; saturation: number }> = [];
        const radius = disc.scale * 0.3;
        for (let a = 0; a < 8; a += 1) {
          const angle = (a / 8) * Math.PI * 2;
          samples.push(options.colourAt(disc.x + radius * Math.cos(angle), disc.y + radius * Math.sin(angle)));
        }
        samples.push(options.colourAt(disc.x, disc.y));
        const hues = samples.map((item) => item.hue).sort((a, b) => a - b);
        const saturations = samples.map((item) => item.saturation).sort((a, b) => a - b);
        const hue = hues[hues.length >> 1];
        const saturation = saturations[saturations.length >> 1];
        if (hue >= 5 && hue <= 33 && saturation > 0.35) disc.type = "ball";
      }
    }
  }

  /* ------------------------------------------- cohérence de calibre */
  /**
   * UN SCHÉMA, UN CALIBRE — MAIS PAR TYPE DE SYMBOLE.
   *
   * Un disque est une signature faible : à peu près tout ce qui est rond lui
   * ressemble, et le balayage en renvoie donc beaucoup — chiffres imprimés dans
   * les jetons, arceau, fragments. En revanche, sur un même schéma, tous les
   * jetons ont la même taille, tous les plots aussi.
   *
   * On ne relie PAS les échelles entre types. Le code de rendu donne bien un
   * rapport fixe entre un défenseur et un jeton de même rayon (5,62 r contre
   * 2 r), mais chaque élément porte son propre `size` : mesuré sur un vrai
   * export, les défenseurs étaient dessinés à la moitié de la taille des
   * attaquants. Lier les échelles reviendrait à faire confiance à une hypothèse
   * que le produit lui-même ne garantit pas.
   */
  const byType = new Map<MyBasketSymbolKind, DirectDetection[]>();
  for (const item of kept) {
    const list = byType.get(item.type) || [];
    list.push(item);
    byType.set(item.type, list);
  }

  const coherent: DirectDetection[] = [];
  for (const [type, list] of byType) {
    if (list.length < 3) {
      coherent.push(...list);
      continue;
    }
    let bestScore = -1;
    let bestFamily: DirectDetection[] = list;
    for (const anchor of list) {
      const family = list.filter((item) => {
        const ratio = item.scale / anchor.scale;
        return ratio > 0.8 && ratio < 1.25;
      });
      // On privilégie la famille la plus SÛRE, pas la plus nombreuse : une nuée
      // de petites fausses détections ne doit pas l'emporter sur cinq jetons
      // francs.
      const score = family.reduce((sum, item) => sum + Math.pow(item.confidence, 3), 0);
      if (score > bestScore) {
        bestScore = score;
        bestFamily = family;
      }
    }
    coherent.push(...bestFamily);
    void type;
  }
  kept.length = 0;
  kept.push(...coherent);

  return kept;
}
