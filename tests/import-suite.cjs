/**
 * tests/import-suite.cjs
 * ---------------------------------------------------------------------------
 * Batterie de non-régression du module de numérisation.
 *
 * Principe : on ne juge JAMAIS sur un seul cas. Chaque catégorie d'entrée est
 * représentée, y compris celles qu'on sait mal traiter — un cas en échec doit
 * rester visible, pas disparaître de la liste.
 *
 * Régression contrôlée : le premier passage écrit `tests/baseline.json`. Les
 * suivants comparent, cas par cas. Une modification qui améliore sept cas et en
 * casse trois est signalée comme un ÉCHEC, pas comme un progrès.
 *
 *   node tests/import-suite.cjs                 → compare à la référence
 *   node tests/import-suite.cjs --update        → réécrit la référence
 *   node tests/import-suite.cjs --only=perspective
 *   node tests/import-suite.cjs --verbose       → trace de debug par cas
 */

const fs = require("fs");
const path = require("path");
const { createCanvas } = require("@napi-rs/canvas");

globalThis.document = {
  createElement: (tag) => {
    if (tag !== "canvas") throw new Error("balise inattendue : " + tag);
    return createCanvas(1, 1);
  },
  querySelector: () => null,
  head: { appendChild() {} },
};

const engine = require(path.join(__dirname, ".build", "engine.cjs"));
const { renderScene, degrade, makeQuad } = require("./scene.cjs");

const ARGS = process.argv.slice(2);
const UPDATE = ARGS.includes("--update");
const VERBOSE = ARGS.includes("--verbose");
const ONLY = (ARGS.find((a) => a.startsWith("--only=")) || "").slice(7);
const BASELINE = path.join(__dirname, "baseline.json");

/* -------------------------------------------------------------------------- */
/* Vérité terrain → repère canonique Plaquette                                */
/* -------------------------------------------------------------------------- */

const CANON = {
  half: { x0: 0.1387, x1: 0.8626, y0: 0.131, y1: 0.994, halfScale: 0.5 },
  full: { x0: 0.1406, x1: 0.8609, y0: 0.0674, y1: 0.9316, halfScale: 1 },
};

function toCanonical(kind, u, v) {
  const c = CANON[kind];
  return {
    x: c.x0 + u * (c.x1 - c.x0),
    y: (c.y0 + v * (c.y1 - c.y0)) * c.halfScale,
  };
}

// Le repère est étiré : une distance « ronde » pondère y.
const dist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.6);
const TOL = 0.05; // 5 % de la largeur du terrain ≈ 75 cm

/* -------------------------------------------------------------------------- */
/* Scènes de base                                                             */
/* -------------------------------------------------------------------------- */

const P = (u, v, type, label) => ({ u, v, type, label });

const SCENE_HALF = {
  kind: "half",
  style: "parquet",
  tokens: "plein",
  players: [
    P(0.18, 0.26, "attacker", "1"),
    P(0.50, 0.66, "attacker", "2"),
    P(0.82, 0.30, "attacker", "3"),
    P(0.30, 0.50, "attacker", "4"),
    P(0.68, 0.74, "attacker", "5"),
    P(0.22, 0.42, "defender", "X1"),
    P(0.62, 0.54, "defender", "X2"),
  ],
  arrows: [],
  cones: [],
  text: false,
};

const SCENE_FULL = {
  kind: "full",
  style: "parquet",
  tokens: "plein",
  players: [
    P(0.20, 0.18, "attacker", "1"),
    P(0.50, 0.35, "attacker", "2"),
    P(0.80, 0.22, "attacker", "3"),
    P(0.35, 0.62, "attacker", "4"),
    P(0.65, 0.80, "attacker", "5"),
  ],
  arrows: [],
  cones: [],
  text: false,
};

const SCENE_PAPER = { ...SCENE_HALF, style: "papier" };

const withArrows = (scene, arrows) => ({ ...scene, arrows });

const FLAT_QUAD = (w, h) => makeQuad({ cx: 750, cy: 575, w, h });

/* -------------------------------------------------------------------------- */
/* Catégories de test                                                         */
/* -------------------------------------------------------------------------- */

const CASES = [
  {
    id: "screenshot-droit",
    label: "screenshot MyBasket parfaitement droit",
    scene: SCENE_HALF,
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
  {
    id: "redimensionnee",
    label: "image redimensionnée (petite)",
    scene: SCENE_HALF,
    degrade: { quad: FLAT_QUAD(1000, 940), scale: 0.55 },
  },
  {
    id: "inclinaison-legere",
    label: "photo légèrement inclinée",
    scene: SCENE_HALF,
    degrade: { quad: makeQuad({ cx: 750, cy: 575, w: 980, h: 920, rotationDeg: 4, perspective: 0.04 }), noise: 5 },
  },
  {
    id: "perspective-forte",
    label: "forte perspective",
    scene: SCENE_HALF,
    degrade: { quad: makeQuad({ cx: 750, cy: 575, w: 1000, h: 900, perspective: 0.22, tilt: 0.04 }), noise: 6 },
  },
  {
    id: "rotation",
    label: "rotation marquée (12°)",
    scene: SCENE_HALF,
    degrade: { quad: makeQuad({ cx: 750, cy: 575, w: 950, h: 880, rotationDeg: 12 }), noise: 5 },
  },
  {
    id: "eclairage-inegal",
    label: "éclairage inégal",
    scene: SCENE_HALF,
    degrade: { quad: FLAT_QUAD(1000, 940), light: { min: 0.62, max: 1.25 }, noise: 6 },
  },
  {
    id: "ombre",
    label: "ombre sur une partie du terrain",
    scene: SCENE_HALF,
    degrade: { quad: FLAT_QUAD(1000, 940), shadow: { fromX: 0.55, fromY: 0.0, factor: 0.55 }, noise: 5 },
  },
  {
    id: "bruit-jpeg",
    label: "bruit JPEG marqué",
    scene: SCENE_HALF,
    degrade: { quad: FLAT_QUAD(1000, 940), jpeg: 28, noise: 4 },
  },
  {
    id: "flou",
    label: "photo floue",
    scene: SCENE_HALF,
    degrade: { quad: FLAT_QUAD(1000, 940), blur: 2, noise: 4 },
  },
  {
    id: "papier-table-sombre",
    label: "papier blanc sur table sombre",
    scene: SCENE_PAPER,
    degrade: {
      quad: makeQuad({ cx: 750, cy: 575, w: 960, h: 900, rotationDeg: 5, perspective: 0.08 }),
      background: "#3a3128",
      noise: 6,
    },
  },
  {
    id: "demi-terrain",
    label: "terrain demi",
    scene: SCENE_HALF,
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
  {
    id: "terrain-complet",
    label: "terrain complet",
    scene: SCENE_FULL,
    degrade: { quad: makeQuad({ cx: 750, cy: 575, w: 560, h: 1040 }), outWidth: 1400, outHeight: 1200 },
  },
  {
    id: "deux-dessins",
    label: "plusieurs dessins sur une même page",
    scene: { ...SCENE_HALF, drawings: 2 },
    degrade: { quad: makeQuad({ cx: 750, cy: 500, w: 1360, h: 640 }), outWidth: 1500, outHeight: 1000 },
    expectDiagrams: 2,
  },
  {
    id: "sans-texte",
    label: "dessin sans texte",
    scene: SCENE_HALF,
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
  {
    id: "page-de-texte-seule",
    label: "page de texte, aucun dessin",
    scene: { ...SCENE_HALF, players: [], arrows: [], noCourt: true, style: "papier" },
    degrade: { quad: FLAT_QUAD(1000, 940), background: "#8d8071" },
  },
  {
    id: "terrain-vide-avec-texte",
    label: "terrain dessiné mais vide + texte",
    scene: { ...SCENE_HALF, players: [], arrows: [], text: true },
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
  {
    id: "ronds-pleins",
    label: "joueurs ronds pleins",
    scene: { ...SCENE_HALF, tokens: "plein" },
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
  {
    id: "ronds-vides",
    label: "joueurs ronds vides",
    scene: { ...SCENE_PAPER, tokens: "vide" },
    degrade: { quad: FLAT_QUAD(1000, 940), background: "#8d8071" },
  },
  {
    id: "defenseurs-croix",
    label: "défenseurs en croix",
    scene: { ...SCENE_PAPER, tokens: "croix" },
    degrade: { quad: FLAT_QUAD(1000, 940), background: "#8d8071" },
  },
  {
    id: "symboles-sur-lignes",
    label: "symboles collés aux lignes du terrain",
    scene: {
      ...SCENE_HALF,
      players: [
        P(0.5, 0.414, "attacker", "1"), // sur le cercle des lancers francs
        P(0.06, 0.30, "attacker", "2"), // sur la ligne de touche
        P(0.5, 0.02, "attacker", "3"), // sur la ligne de fond
        P(0.336, 0.20, "attacker", "4"), // sur le bord de raquette
        P(0.5, 0.60, "defender", "X1"), // sur l'arc à 3 points
      ],
    },
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
  {
    id: "fleches-fines",
    label: "flèches fines",
    scene: withArrows(SCENE_HALF, [
      { from: { u: 0.2, v: 0.3 }, to: { u: 0.45, v: 0.18 }, kind: "cut", thickness: 3 },
      { from: { u: 0.8, v: 0.34 }, to: { u: 0.6, v: 0.2 }, kind: "cut", thickness: 3 },
    ]),
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
  {
    id: "fleches-epaisses",
    label: "flèches épaisses",
    scene: withArrows(SCENE_HALF, [
      { from: { u: 0.2, v: 0.3 }, to: { u: 0.45, v: 0.18 }, kind: "cut", thickness: 9 },
      { from: { u: 0.8, v: 0.34 }, to: { u: 0.6, v: 0.2 }, kind: "cut", thickness: 9 },
    ]),
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
  {
    id: "trajectoires-croisees",
    label: "plusieurs trajectoires croisées",
    scene: withArrows(SCENE_HALF, [
      { from: { u: 0.2, v: 0.62 }, to: { u: 0.7, v: 0.24 }, kind: "cut", thickness: 5 },
      { from: { u: 0.75, v: 0.62 }, to: { u: 0.28, v: 0.22 }, kind: "cut", thickness: 5 },
      { from: { u: 0.5, v: 0.8 }, to: { u: 0.5, v: 0.4 }, kind: "dribble", thickness: 5 },
    ]),
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
  {
    id: "plots",
    label: "plots et ballon",
    scene: { ...SCENE_HALF, cones: [{ u: 0.35, v: 0.35 }, { u: 0.65, v: 0.35 }] },
    degrade: { quad: FLAT_QUAD(1000, 940) },
  },
];

/* -------------------------------------------------------------------------- */
/* Exécution d'un cas                                                         */
/* -------------------------------------------------------------------------- */

async function runCase(testCase) {
  const scene = testCase.scene;
  const flat = renderScene(scene);
  const photo = await degrade(flat.canvas, testCase.degrade, engine);

  const debug = engine.createImportDebug(true);

  // Même chemin que l'orchestrateur : redressements successifs (un terrain, on
  // l'efface, on recommence), puis repli sur les régions classiques.
  const state = engine.createDiagramCollector();
  const excluded = [];
  for (let pass = 0; pass < 8; pass += 1) {
    if (state.diagrams.length >= 8) break;
    let found = null;
    try {
      found = engine.rectifyCourt(photo, undefined, () => {}, excluded.length ? excluded : undefined);
    } catch (error) {
      found = null;
    }
    if (!found) break;
    excluded.push(found.quad);
    await engine.collectFromRegion(photo, engine.quadBounds(found.quad), false, 0, debug, state, found);
  }
  if (!state.diagrams.length) {
    const candidates = engine.detectCourtCandidates(photo);
    const regions = candidates.length
      ? candidates.map((c) => c.rect)
      : [{ x0: 0, y0: 0, x1: photo.width, y1: photo.height }];
    for (const region of regions) {
      if (state.diagrams.length >= 8) break;
      await engine.collectFromRegion(photo, region, false, 0, debug, state);
    }
  }
  const found = state.diagrams;
  const kinds = found.map((d) => d.courtType);
  const usedRectify = found.filter((d) => d.rectified).length;

  const drawings = scene.drawings || 1;
  const expectedPlayers = [];
  for (let d = 0; d < drawings; d += 1) {
    for (const player of scene.players || []) expectedPlayers.push(player);
  }
  const expectedArrows = (scene.arrows || []).length * drawings;

  const players = found.flatMap((f) => f.players);
  const actions = found.flatMap((f) => f.actions);
  const objects = found.flatMap((f) => f.objects);

  // Appariement glouton : chaque attendu prend le détecté le plus proche encore
  // libre. On mesure ce qui est UTILISABLE, pas ce qui est « proche ».
  const taken = new Set();
  let matched = 0;
  let typeOk = 0;
  let unknownType = 0;
  let errorSum = 0;
  const perDrawing = Math.max(1, drawings);
  const expectedOnce = scene.players || [];

  const shift = scene.drawingShift ?? 0.06;
  for (let d = 0; d < perDrawing; d += 1) {
    for (const expected of expectedOnce) {
      const target = toCanonical(scene.kind, expected.u, expected.v + d * shift);
      let best = -1;
      let bestDistance = TOL;
      for (let i = 0; i < players.length; i += 1) {
        if (taken.has(i)) continue;
        const d2 = dist(players[i], target);
        if (d2 < bestDistance) {
          bestDistance = d2;
          best = i;
        }
      }
      if (best < 0) continue;
      taken.add(best);
      matched += 1;
      errorSum += bestDistance;
      const detectedType = players[best].type || (players[best].team === "def" ? "defender" : "attacker");
      if (detectedType === "unknown") unknownType += 1;
      else if (detectedType === expected.type) typeOk += 1;
    }
  }

  const falsePositives = players.length - matched;
  const falseNegatives = expectedPlayers.length - matched;
  const kindOk = found.length ? kinds.every((k) => k === scene.kind) : expectedPlayers.length === 0;

  const result = {
    id: testCase.id,
    label: testCase.label,
    kindOk,
    kindFound: kinds[0] || "-",
    diagrams: found.length,
    expectedDiagrams: testCase.expectDiagrams || (expectedPlayers.length ? 1 : 0),
    players: players.length,
    expectedPlayers: expectedPlayers.length,
    matched,
    typeOk,
    unknownType,
    falsePositives,
    falseNegatives,
    meanError: matched ? Number((errorSum / matched).toFixed(4)) : null,
    actions: actions.length,
    expectedActions: expectedArrows,
    objects: objects.length,
    rectified: usedRectify,
    confidence: found.length
      ? Number((found.reduce((sum, f) => sum + (f.confidence || 0), 0) / found.length).toFixed(3))
      : 0,
  };

  if (VERBOSE) {
    const snapshot = debug.snapshot();
    console.log(`\n  ── debug ${testCase.id} ─────────────────────────────`);
    for (const note of snapshot.notes) console.log("     " + note);
    for (const entry of snapshot.rectify) {
      console.log(`     redressement [${entry.outcome}]`);
      for (const step of entry.steps) console.log("       · " + step);
    }
    for (const f of found) {
      console.log(`     schéma ${f.rectified ? "redressé" : "classique"} — ${f.players.length} joueurs, ${f.actions.length} tracés`);
      for (const pl of f.players) {
        console.log(`       · ${pl.label} ${pl.type} x=${pl.x.toFixed(3)} y=${pl.y.toFixed(3)} conf=${pl.confidence} [${pl.source}]`);
      }
      for (const ac of f.actions) {
        console.log(`       → ${ac.action} conf=${ac.confidence} [${ac.source}]`);
      }
    }
    for (const graphic of snapshot.graphics) {
      console.log(
        `     schéma via ${graphic.path} — ${graphic.players} joueurs, ${graphic.lines} tracés, ` +
          `${graphic.playersRejected} jetons rejetés, ${graphic.linesRejected} tracés rejetés`
      );
      for (const rejection of graphic.rejections) {
        console.log(`       × ${rejection.what} ×${rejection.count} : ${rejection.why}`);
      }
    }
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Comparaison à la référence                                                 */
/* -------------------------------------------------------------------------- */

function compare(current, baseline) {
  if (!baseline) return { verdict: "nouveau", details: "" };
  const problems = [];
  if (baseline.kindOk && !current.kindOk) problems.push("type de terrain perdu");
  if (current.matched < baseline.matched) problems.push(`joueurs ${baseline.matched}→${current.matched}`);
  if (current.typeOk < baseline.typeOk) problems.push(`types ${baseline.typeOk}→${current.typeOk}`);
  if (current.falsePositives > baseline.falsePositives) {
    problems.push(`faux positifs ${baseline.falsePositives}→${current.falsePositives}`);
  }
  if (
    baseline.meanError !== null &&
    current.meanError !== null &&
    current.meanError > baseline.meanError + 0.005
  ) {
    problems.push(`précision ${baseline.meanError}→${current.meanError}`);
  }
  // Un tracé de MOINS n'est pas forcément une perte : si la scène n'en contient
  // aucun, supprimer un fantôme est un progrès. On compare donc l'ÉCART à
  // l'attendu, jamais le nombre brut.
  const gap = (r) => Math.abs((r.actions || 0) - (r.expectedActions || 0));
  if (gap(current) > gap(baseline)) {
    problems.push(`tracés ${baseline.actions}→${current.actions} (attendu ${current.expectedActions})`);
  }
  if (problems.length) return { verdict: "RÉGRESSION", details: problems.join(", ") };

  const gains = [];
  if (current.matched > baseline.matched) gains.push(`joueurs +${current.matched - baseline.matched}`);
  if (current.typeOk > baseline.typeOk) gains.push(`types +${current.typeOk - baseline.typeOk}`);
  if (gap(current) < gap(baseline)) gains.push(`tracés plus justes (${baseline.actions}→${current.actions} / ${current.expectedActions})`);
  if (current.falsePositives < baseline.falsePositives) {
    gains.push(`faux positifs −${baseline.falsePositives - current.falsePositives}`);
  }
  return { verdict: gains.length ? "progrès" : "stable", details: gains.join(", ") };
}

function pad(value, width, right) {
  const text = String(value);
  return right ? text.padStart(width) : text.padEnd(width);
}

(async () => {
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;
  const selected = CASES.filter((c) => !ONLY || c.id.includes(ONLY) || c.label.includes(ONLY));
  const results = [];

  console.log("");
  console.log(
    pad("cas", 34) + pad("terr.", 7) + pad("joueurs", 9) + pad("types", 8) +
      pad("FP", 4, true) + pad("FN", 4, true) + pad("err", 9, true) + pad("tracés", 9, true) + "  état"
  );
  console.log("-".repeat(108));

  for (const testCase of selected) {
    const started = Date.now();
    let result;
    try {
      result = await runCase(testCase);
    } catch (error) {
      result = {
        id: testCase.id,
        label: testCase.label,
        crash: String(error && error.stack ? error.stack.split("\n")[0] : error),
        kindOk: false,
        matched: 0,
        typeOk: 0,
        falsePositives: 0,
        falseNegatives: 0,
        meanError: null,
        actions: 0,
        expectedActions: 0,
        players: 0,
        expectedPlayers: 0,
        diagrams: 0,
      };
    }
    result.ms = Date.now() - started;
    results.push(result);

    const previous = baseline ? baseline.find((item) => item.id === result.id) : null;
    const { verdict, details } = compare(result, previous);
    const flag = result.crash ? "PLANTAGE" : verdict;

    console.log(
      pad(result.label.slice(0, 33), 34) +
        pad(result.kindOk ? result.kindFound : "✗ " + result.kindFound, 7) +
        pad(`${result.matched}/${result.expectedPlayers}`, 9) +
        pad(`${result.typeOk}${result.unknownType ? "+" + result.unknownType + "?" : ""}`, 8) +
        pad(result.falsePositives, 4, true) +
        pad(result.falseNegatives, 4, true) +
        pad(result.meanError === null ? "-" : result.meanError.toFixed(4), 9, true) +
        pad(`${result.actions}/${result.expectedActions}`, 9, true) +
        "  " + flag + (details ? ` (${details})` : "") +
        (result.crash ? " " + result.crash : "")
    );
  }

  console.log("-".repeat(108));
  const totals = results.reduce(
    (acc, r) => {
      acc.matched += r.matched;
      acc.expected += r.expectedPlayers;
      acc.typeOk += r.typeOk;
      acc.fp += r.falsePositives;
      acc.actions += r.actions;
      acc.expectedActions += r.expectedActions;
      acc.kindOk += r.kindOk ? 1 : 0;
      acc.errors += r.meanError !== null ? r.meanError : 0;
      acc.withError += r.meanError !== null ? 1 : 0;
      return acc;
    },
    { matched: 0, expected: 0, typeOk: 0, fp: 0, actions: 0, expectedActions: 0, kindOk: 0, errors: 0, withError: 0 }
  );

  console.log(
    `TOTAL  terrain ${totals.kindOk}/${results.length} · ` +
      `joueurs ${totals.matched}/${totals.expected} (${((totals.matched / Math.max(1, totals.expected)) * 100).toFixed(0)} %) · ` +
      `types ${totals.typeOk}/${totals.matched} · ` +
      `faux positifs ${totals.fp} · ` +
      `tracés ${totals.actions}/${totals.expectedActions} · ` +
      `erreur moyenne ${(totals.errors / Math.max(1, totals.withError)).toFixed(4)}`
  );

  const regressions = baseline
    ? results.filter((r) => compare(r, baseline.find((b) => b.id === r.id)).verdict === "RÉGRESSION")
    : [];
  const crashes = results.filter((r) => r.crash);

  if (UPDATE || !baseline) {
    fs.writeFileSync(BASELINE, JSON.stringify(results, null, 2));
    console.log(`\nRéférence ${baseline ? "mise à jour" : "créée"} : tests/baseline.json`);
  } else if (regressions.length) {
    console.log(`\n${regressions.length} RÉGRESSION(S) : ${regressions.map((r) => r.id).join(", ")}`);
    console.log("La modification améliore peut-être d'autres cas, mais elle en casse. Elle ne doit pas être retenue telle quelle.");
  } else {
    console.log("\nAucune régression par rapport à la référence.");
  }

  // --update fige volontairement la référence : il ne doit pas échouer.
  process.exitCode = crashes.length || (!UPDATE && regressions.length) ? 1 : 0;
})();
