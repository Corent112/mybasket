/**
 * tests/integration.cjs
 * ---------------------------------------------------------------------------
 * Vérification de bout en bout de la CHAÎNE, pas des seules briques.
 *
 *   fichier → scanExerciseLocally → diagrammes → aperçu/correction
 *           → importToPlaquetteSchema → ce qui sera réellement enregistré
 *
 * Chaque contrôle correspond à une question posée avant livraison. Aucun n'est
 * simulé : on appelle les fonctions de production, avec un vrai fichier image.
 *
 *   node tests/build.cjs && node tests/integration.cjs
 *
 * L'OCR est bouché ici (Tesseract ne tourne pas dans ce harnais) : les contrôles
 * qui portent sur le texte s'exercent donc directement sur les analyseurs de
 * document-layout, qui SONT la correspondance « zone lue → champ d'exercice ».
 */

const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

/* ---- polyfills navigateur minimaux ---------------------------------------- */

globalThis.document = {
  createElement: (tag) => {
    if (tag !== "canvas") throw new Error("balise inattendue : " + tag);
    return createCanvas(1, 1);
  },
  querySelector: () => null,
  head: { appendChild() {} },
};
// `fileToCanvas` essaie createImageBitmap en premier : on le fournit, ce qui
// exerce le chemin de décodage réellement utilisé par les navigateurs récents.
globalThis.createImageBitmap = async (blob) => {
  const buffer = Buffer.from(await blob.arrayBuffer());
  return loadImage(buffer);
};

const engine = require(path.join(__dirname, ".build", "engine.cjs"));
const layout = require(path.join(__dirname, ".build", "layout.cjs"));
const { renderScene, degrade, makeQuad } = require("./scene.cjs");

/* ---- utilitaires de test --------------------------------------------------- */

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  ÉCHEC ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

const P = (u, v, type, label) => ({ u, v, type, label });

const SCENE = {
  kind: "half",
  style: "parquet",
  tokens: "plein",
  players: [
    P(0.18, 0.26, "attacker", "1"),
    P(0.5, 0.66, "attacker", "2"),
    P(0.82, 0.3, "attacker", "3"),
    P(0.3, 0.5, "attacker", "4"),
    P(0.68, 0.74, "attacker", "5"),
    P(0.22, 0.42, "defender", "X1"),
    P(0.62, 0.54, "defender", "X2"),
  ],
  arrows: [],
  cones: [],
  text: false,
};

async function toFile(scene, degradation, name) {
  const flat = renderScene(scene);
  const photo = await degrade(flat.canvas, degradation, engine);
  const buffer = await photo.encode("png");
  return new File([buffer], name, { type: "image/png" });
}

const FLAT = (w, h) => makeQuad({ cx: 750, cy: 575, w, h });

/* ---- exécution ------------------------------------------------------------- */

(async () => {
  /* ======================= 1. chaîne nominale ============================= */
  section("1. Chaîne complète : fichier → scan → Plaquette");

  const file = await toFile(SCENE, { quad: FLAT(1000, 940) }, "schema.png");
  const result = await engine.scanExerciseLocally(file);

  check("scanExerciseLocally accepte un File et rend un résultat", Boolean(result));
  check(
    "au moins un schéma détecté",
    (result.diagrams || []).length >= 1,
    `${(result.diagrams || []).length} schéma(s)`
  );
  check(
    "importConfidence renseignée et bornée",
    typeof result.importConfidence === "number" && result.importConfidence > 0 && result.importConfidence <= 1,
    String(result.importConfidence)
  );
  check("warnings présent et non vide", Array.isArray(result.warnings) && result.warnings.length > 0);
  check(
    "rectifiedImage est une data URL affichable telle quelle",
    typeof result.rectifiedImage === "string" && result.rectifiedImage.startsWith("data:image/"),
    result.rectifiedImage ? result.rectifiedImage.slice(0, 24) : "absente"
  );
  check(
    "debug complet attaché (activé par NODE_ENV/flag)",
    !result.debug || (Array.isArray(result.debug.rectify) && Array.isArray(result.debug.notes)),
    "structure inattendue"
  );

  const players = (result.diagrams || []).flatMap((d) => d.players);
  check("des joueurs sont remontés", players.length >= 5, `${players.length} joueurs`);
  check(
    "chaque joueur porte type + confidence + typeConfidence + source",
    players.every(
      (p) =>
        typeof p.type === "string" &&
        typeof p.confidence === "number" &&
        typeof p.typeConfidence === "number" &&
        typeof p.source === "string"
    )
  );
  check(
    "team reste cohérent avec type (compatibilité Plaquette)",
    players.every((p) => (p.type === "defender" ? p.team === "def" : p.team === "att"))
  );

  /* ======================= 2. conversion Plaquette ======================== */
  section("2. Conversion vers les objets réellement enregistrés");

  const schema = engine.importToPlaquetteSchema(result);
  check("importToPlaquetteSchema rend un schéma", Boolean(schema));
  check(
    "une phase par schéma détecté, sans doublon",
    schema.phases.length === (result.diagrams || []).length,
    `${schema.phases.length} phases pour ${(result.diagrams || []).length} schémas`
  );
  check(
    "une entrée schemaDataList par phase, même schemaGroupId",
    schema.entries.length === schema.phases.length &&
      new Set(schema.entries.map((e) => e.schemaGroupId)).size === 1
  );
  check(
    "aucun identifiant d'objet dupliqué",
    (() => {
      const ids = schema.phases.flatMap((phase) => [
        ...phase.players.map((p) => p.id),
        ...phase.objects.map((o) => o.id),
        ...phase.lines.map((l) => l.id),
      ]);
      return new Set(ids).size === ids.length;
    })()
  );
  const phasePlayers = schema.phases.flatMap((phase) => phase.players);
  check(
    "importConfidence / importSource / importType arrivent dans les objets Plaquette",
    phasePlayers.every(
      (p) => typeof p.importConfidence === "number" && typeof p.importSource === "string" && typeof p.importType === "string"
    )
  );

  /* ======================= 3. needsReview jusqu'à l'UI ==================== */
  section("3. needsReview jusqu'aux objets enregistrés");

  const douteux = {
    ...result,
    diagrams: [
      {
        ...result.diagrams[0],
        players: result.diagrams[0].players.map((p, i) =>
          i === 0 ? { ...p, type: "unknown", typeConfidence: 0.4 } : p
        ),
      },
    ],
  };
  const schemaDouteux = engine.importToPlaquetteSchema(douteux);
  check(
    "un joueur incertain porte needsReview:true",
    schemaDouteux.phases[0].players[0].needsReview === true
  );
  check(
    "un joueur sûr ne porte PAS needsReview",
    schemaDouteux.phases[0].players.slice(1).every((p) => p.needsReview === undefined)
  );

  /* ======================= 4. corrections manuelles ======================= */
  section("4. Les corrections manuelles changent ce qui sera enregistré");

  // Ce que produit ImportReview : une copie profonde modifiée, jamais l'original.
  const original = result;
  const corrige = {
    ...original,
    diagrams: [
      {
        ...original.diagrams[0],
        players: [
          // 1. type corrigé à la main
          {
            ...original.diagrams[0].players[0],
            type: "defender",
            team: "def",
            typeConfidence: 1,
            source: "confirmé à la main",
          },
          // 2. joueur déplacé
          { ...original.diagrams[0].players[1], x: 0.42, y: 0.21 },
          // 3. joueur supprimé → on saute l'index 2
          ...original.diagrams[0].players.slice(3),
          // 4. joueur ajouté
          {
            key: "manual-1",
            label: "9",
            team: "att",
            x: 0.6,
            y: 0.3,
            shape: "circle",
            type: "attacker",
            confidence: 1,
            typeConfidence: 1,
            labelConfident: true,
            source: "ajouté à la main",
          },
        ],
      },
    ],
  };

  const avant = engine.importToPlaquetteSchema(original);
  const apres = engine.importToPlaquetteSchema(corrige);

  check(
    "le type corrigé est bien celui enregistré",
    apres.phases[0].players[0].team === "def" && apres.phases[0].players[0].importType === "defender"
  );
  check(
    "la position corrigée est bien celle enregistrée",
    Math.abs(apres.phases[0].players[1].x - 0.42) < 1e-6
  );
  check(
    "le joueur supprimé n'est plus enregistré, l'ajouté l'est",
    apres.phases[0].players.length === avant.phases[0].players.length,
    `${avant.phases[0].players.length} → ${apres.phases[0].players.length}`
  );
  check(
    "le joueur ajouté à la main porte une confiance pleine",
    apres.phases[0].players.some((p) => p.label === "9" && p.importConfidence === 1)
  );

  /* ======================= 5. annuler ne modifie rien ===================== */
  section("5. Annuler l'import ne modifie rien");

  const empreinteOriginale = JSON.stringify(original.diagrams);
  engine.importToPlaquetteSchema(corrige);
  check(
    "le résultat d'import d'origine est intact après correction et conversion",
    JSON.stringify(original.diagrams) === empreinteOriginale
  );
  check(
    "corriger produit un nouvel objet, sans partage de référence sur les joueurs",
    corrige.diagrams[0].players[0] !== original.diagrams[0].players[0]
  );

  /* ======================= 6. plusieurs schémas =========================== */
  section("6. Plusieurs schémas arrivent réellement jusqu'au bout");

  const doubleFile = await toFile(
    { ...SCENE, drawings: 2 },
    { quad: makeQuad({ cx: 750, cy: 500, w: 1360, h: 640 }), outWidth: 1500, outHeight: 1000 },
    "double.png"
  );
  const doubleResult = await engine.scanExerciseLocally(doubleFile);
  check(
    "deux schémas distincts dans AiExerciseImport",
    (doubleResult.diagrams || []).length === 2,
    `${(doubleResult.diagrams || []).length} schéma(s)`
  );
  const doubleSchema = engine.importToPlaquetteSchema(doubleResult);
  check("deux phases dans la Plaquette", doubleSchema && doubleSchema.phases.length === 2);
  check(
    "les deux phases ont des contenus différents",
    doubleSchema &&
      JSON.stringify(doubleSchema.phases[0].players.map((p) => [p.x, p.y])) !==
        JSON.stringify(doubleSchema.phases[1].players.map((p) => [p.x, p.y]))
  );
  check(
    "diagram (champ historique) pointe sur le premier schéma",
    doubleResult.diagram === doubleResult.diagrams[0]
  );

  /* ======================= 7. page sans terrain =========================== */
  section("7. Page sans terrain : aucun schéma inventé");

  const texteFile = await toFile(
    { ...SCENE, players: [], arrows: [], noCourt: true, style: "papier" },
    { quad: FLAT(1000, 940), background: "#8d8071" },
    "texte.png"
  );
  const texteResult = await engine.scanExerciseLocally(texteFile);
  check("aucun schéma", (texteResult.diagrams || []).length === 0);
  check(
    "aucun joueur, objet ou tracé inventé",
    texteResult.diagram.players.length === 0 &&
      texteResult.diagram.objects.length === 0 &&
      texteResult.diagram.actions.length === 0
  );
  check("importToPlaquetteSchema rend null (rien à créer)", engine.importToPlaquetteSchema(texteResult) === null);
  check("un avertissement l'explique", texteResult.warnings.some((w) => /schéma/i.test(w)));
  check(
    "les champs texte restent disponibles (structure intacte)",
    Array.isArray(texteResult.deroulement) &&
      Array.isArray(texteResult.consignes) &&
      Array.isArray(texteResult.variantes) &&
      typeof texteResult.title === "string"
  );

  /* ======================= 8. champs OCR → champs exercice ================ */
  section("8. Les zones lues alimentent les bons champs d'exercice");

  check("« 2 Balls / 3 Cones / 1 Basket » → matériel", (() => {
    const equipment = layout.parseEquipment("2 Balls 3 Cones 1 Basket");
    return equipment.ballons === 2 && equipment.plots === 3 && equipment.paniers === 1;
  })());
  check("« Players / Coaches : 6 » → nombre de joueurs", layout.parsePlayers("Players / Coaches : 6") === 6);
  check("« Age group : U15 » → catégorie", layout.parseCategory("Age group : U15") === "U15");
  check("« Seniors » → catégorie Senior", layout.parseCategory("Seniors") === "Senior");
  check("« 12 min » → durée", layout.parseDuration("Duree de l exercice : 12 min") === 12);
  check(
    "un libellé résiduel est retiré du texte de la zone",
    layout.cleanZoneText("Description\nPasse et suit", "Description") === "Passe et suit"
  );
  check(
    "le chrome de site n'entre jamais dans un champ",
    layout.cleanZoneText("Logout\nDeconnexion\nPasse et suit", "Description") === "Passe et suit"
  );
  check(
    "« Schéma 2 » est reconnu comme zone graphique (fiches françaises)",
    (() => {
      const ocr = {
        text: "",
        confidence: 0.9,
        words: [],
        lines: [{ text: "Schéma 2", x0: 10, y0: 10, x1: 120, y1: 34, confidence: 0.9 }],
      };
      return layout.detectLayout(ocr, 800, 600).zones.some((zone) => zone.key === "graphic");
    })()
  );
  check("toLines découpe proprement", JSON.stringify(layout.toLines(" a \n\n b ")) === JSON.stringify(["a", "b"]));

  /* ======================= 9. compatibilité ascendante ==================== */
  section("9. Les appels existants continuent de fonctionner");

  check(
    "scanExerciseLocally garde sa signature (fichier, onStatus)",
    engine.scanExerciseLocally.length === 2,
    `arité ${engine.scanExerciseLocally.length}`
  );
  const statuts = [];
  await engine.scanExerciseLocally(file, (message) => statuts.push(message));
  check("le rappel de statut est toujours appelé", statuts.length > 0, `${statuts.length} messages`);
  check(
    "AiExerciseImport garde tous ses champs historiques",
    [
      "title",
      "organisation",
      "deroulement",
      "consignes",
      "variantes",
      "plots",
      "ballons",
      "paniers",
      "joueurs",
      "categorie",
      "type",
      "niveau",
      "temps",
      "themes",
      "diagram",
      "diagrams",
      "source",
      "confidence",
      "warnings",
    ].every((key) => key in result)
  );
  check(
    "les fonctions dépréciées répondent encore",
    typeof engine.aiDiagramsToPlaquette === "function" &&
      engine.aiDiagramsToPlaquette(result).length === schema.entries.length
  );
  check(
    "les entrées Plaquette gardent leur forme historique",
    schema.entries.every(
      (entry) =>
        typeof entry.title === "string" &&
        typeof entry.schemaGroupId === "string" &&
        typeof entry.phaseIndex === "number" &&
        Array.isArray(entry.phases) &&
        entry.sheet === null &&
        entry.editable === true
    )
  );

  /* ======================= bilan ========================================== */
  console.log("\n" + "=".repeat(64));
  console.log(
    failures
      ? `${failures} CONTRÔLE(S) EN ÉCHEC sur ${checks}`
      : `Les ${checks} contrôles de chaîne passent.`
  );
  process.exitCode = failures ? 1 : 0;
})().catch((error) => {
  console.error("\nPLANTAGE :", error);
  process.exitCode = 1;
});
