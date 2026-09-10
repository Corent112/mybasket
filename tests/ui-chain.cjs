/**
 * TEST DE CHAÎNE D'INTERFACE
 * ---------------------------------------------------------------------------
 * Monte le vrai composant `ExercisePhotoImport` dans un DOM et clique dessus
 * comme le ferait l'utilisateur, pour vérifier le câblage :
 *
 *   bouton → scanExerciseLocally (bouché) → écran « Analyse terminée »
 *          → Corriger → ImportReview → Valider l'import → onImported
 *          → importToPlaquetteSchema → entrées schemaDataList
 *
 * Le moteur d'analyse n'est PAS testé ici (c'est le rôle de import-suite.cjs) :
 * on injecte des résultats d'import connus et on observe ce que fait l'écran.
 *
 * Lancer : node tests/ui-chain.cjs
 */

const { JSDOM } = require("jsdom");

/* --------------------------------------------------------------- environnement */

const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
  url: "https://mybasket.test/exercices/creer",
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.Image = dom.window.Image;
global.File = dom.window.File;
global.Blob = dom.window.Blob;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ne fournit ni canvas 2D ni URL objet : on branche @napi-rs/canvas pour
// que les rendus (aperçu, miniatures) s'exécutent réellement.
const { createCanvas } = require("@napi-rs/canvas");
dom.window.HTMLCanvasElement.prototype.getContext = function getContext(kind) {
  if (kind !== "2d") return null;
  if (!this.__napi) this.__napi = createCanvas(this.width || 300, this.height || 150);
  if (this.__napi.width !== this.width || this.__napi.height !== this.height) {
    this.__napi = createCanvas(this.width || 300, this.height || 150);
  }
  return this.__napi.getContext("2d");
};
dom.window.HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
  if (!this.__napi) return "";
  return this.__napi.toDataURL("image/png");
};

// Le composant tourne ici sous Node : c'est l'objet URL GLOBAL qu'il utilise.
let objectUrls = 0;
const createObjectURL = () => {
  objectUrls += 1;
  return `blob:mybasket/${objectUrls}`;
};
const revokeObjectURL = () => {
  objectUrls -= 1;
};
dom.window.URL.createObjectURL = createObjectURL;
dom.window.URL.revokeObjectURL = revokeObjectURL;
globalThis.URL.createObjectURL = createObjectURL;
globalThis.URL.revokeObjectURL = revokeObjectURL;

// Images : on utilise le décodeur de @napi-rs/canvas, sinon ctx.drawImage
// refuserait une image jsdom. Les chemins d'assets (/plaquette/...) n'existent
// pas ici : leur chargement échoue, ce qui exerce précisément le repli
// « terrain tracé » des miniatures.
const { Image: NapiImage } = require("@napi-rs/canvas");

class TestImage extends NapiImage {
  set src(value) {
    this._src = value;
    if (typeof value === "string" && value.startsWith("data:image")) {
      try {
        super.src = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
        setTimeout(() => this.onload && this.onload(), 0);
        return;
      } catch {
        // décodage impossible : traité comme une erreur de chargement
      }
    }
    setTimeout(() => this.onerror && this.onerror(new Error(`404 ${value}`)), 0);
  }

  get src() {
    return this._src;
  }
}

global.Image = TestImage;
dom.window.Image = TestImage;

/** Petite image PNG réelle, pour tenir lieu de terrain redressé. */
function makePng(width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}

const RECTIFIED_PNG = makePng(120, 90, "#C8B08A");

const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = require("react");

const ui = require("./.build/ui.cjs");

/* -------------------------------------------------------------------- outils */

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const text = () => document.getElementById("root").textContent || "";

function buttons() {
  return Array.from(document.querySelectorAll("button"));
}

function findButton(label) {
  const wanted = label.replace(/['’]/g, "'").toLowerCase();
  return buttons().find((button) => {
    const content = (button.textContent || "").replace(/['’]/g, "'").toLowerCase().trim();
    return content === wanted || content.startsWith(wanted);
  });
}

async function click(label) {
  const button = findButton(label);
  if (!button) throw new Error(`Bouton introuvable : « ${label} » (présents : ${buttons().map((b) => b.textContent).join(" | ")})`);
  if (button.disabled) throw new Error(`Bouton désactivé : « ${label} »`);
  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  return button;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

/* ------------------------------------------------------------------ fixtures */

const point = (x, y) => ({ x, y });

function player(label, x, y, extra = {}) {
  return {
    label,
    x,
    y,
    team: extra.team || "att",
    shape: extra.shape || "circle",
    type: extra.type || "attacker",
    confidence: extra.confidence ?? 0.9,
    typeConfidence: extra.typeConfidence ?? 0.9,
    labelConfident: extra.labelConfident ?? true,
    source: extra.source || "test",
  };
}

function diagram(overrides = {}) {
  return {
    detected: true,
    courtType: "half",
    orientation: "up",
    players: [player("1", 0.3, 0.2), player("2", 0.6, 0.3)],
    objects: [],
    actions: [],
    rectified: true,
    rectifyScore: 0.72,
    ...overrides,
  };
}

function importResult(overrides = {}) {
  return {
    title: "Montée de balle",
    organisation: "",
    deroulement: ["Deux passes puis tir."],
    consignes: [],
    variantes: [],
    themes: [],
    categorie: "",
    plots: null,
    ballons: null,
    paniers: null,
    joueurs: null,
    temps: null,
    warnings: [],
    diagram: diagram(),
    diagrams: [diagram()],
    importConfidence: 0.71,
    importSource: "photo",
    needsReview: false,
    rectifiedImage: RECTIFIED_PNG,
    debug: undefined,
    ...overrides,
  };
}

/* --------------------------------------------------------------- montage */

let root = null;
let injections = [];
let lastImported = null;

function Harness() {
  return React.createElement(ui.ExercisePhotoImport, {
    onImported: async (exercise) => {
      injections.push(exercise);
      lastImported = exercise;
    },
  });
}

async function mount() {
  injections = [];
  lastImported = null;
  await act(async () => {
    root = createRoot(document.getElementById("root"));
    root.render(React.createElement(Harness));
  });
  await flush();
}

async function unmount() {
  await act(async () => {
    root.unmount();
  });
}

/** Simule le clic « Importer » + la sélection d'un fichier. */
async function runImport(result, { video = false } = {}) {
  ui.setScanResult(result);
  const input = document.querySelector("input[type=file]");
  const file = new dom.window.File(["x"], video ? "clip.mp4" : "photo.jpg", {
    type: video ? "video/mp4" : "image/jpeg",
  });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await flush();
  if (process.env.UI_DEBUG) console.log("[debug] après import :", text().slice(0, 300));
}

/* ------------------------------------------------------------------ scénarios */

async function main() {
  console.log("\nCHAÎNE D'INTERFACE — ExercisePhotoImport → ImportReview → onImported\n");

  /* 1. Ouverture de l'écran de validation ------------------------------- */
  console.log("1. Ouverture de ImportReview");
  await mount();
  check("aucun écran de validation avant import", !text().includes("Analyse terminée"));
  await runImport(importResult());
  check("écran « Analyse terminée » affiché", text().includes("Analyse terminée"));
  check("nombre de schémas annoncé", text().includes("1 schéma détecté"), text().slice(0, 200));
  check("aucune injection à ce stade", injections.length === 0, `injections=${injections.length}`);
  check("bouton « Corriger » présent", !!findButton("Corriger"));
  check("bouton « Comparer avec la photo » présent", !!findButton("Comparer avec la photo"));
  check("bouton « Valider l'import » présent", !!findButton("Valider l'import"));
  check("bouton « Annuler » présent", !!findButton("Annuler"));
  await click("Corriger");
  check("ImportReview ouvert", text().includes("Vérifie le schéma importé"));
  check("toujours aucune injection", injections.length === 0);
  await unmount();

  /* 2. Plusieurs schémas ------------------------------------------------ */
  console.log("\n2. Plusieurs schémas");
  await mount();
  const three = importResult({
    diagrams: [
      diagram(),
      diagram({ players: [player("3", 0.4, 0.25)] }),
      diagram({ players: [player("4", 0.5, 0.35)] }),
    ],
  });
  await runImport(three);
  check("« 3 schémas détectés » annoncé", text().includes("3 schémas détectés"), text().slice(0, 200));
  await click("Corriger");
  check("onglets de schémas présents", !!findButton("Schéma 2"), buttons().map((b) => b.textContent).join(" | ").slice(0, 200));
  await click("Schéma 3");
  check("changement de schéma sans injection", injections.length === 0);
  await click("Valider l'import");
  check("une seule injection", injections.length === 1, `injections=${injections.length}`);
  check("les 3 schémas sont transmis", ui.diagramsOf(lastImported).length === 3, `n=${ui.diagramsOf(lastImported).length}`);
  const schema3 = ui.importToPlaquetteSchema(lastImported);
  check("3 phases Plaquette", schema3 && schema3.phases.length === 3, schema3 ? `phases=${schema3.phases.length}` : "null");
  check("3 entrées schemaDataList", schema3 && schema3.entries.length === 3);
  check(
    "un seul schemaGroupId",
    schema3 && new Set(schema3.entries.map((entry) => entry.schemaGroupId)).size === 1
  );
  await unmount();

  /* 3. Correction manuelle --------------------------------------------- */
  console.log("\n3. Correction manuelle");
  await mount();
  const doubtful = importResult({
    diagrams: [
      diagram({
        players: [
          player("5", 0.3, 0.2),
          player("6", 0.6, 0.3, { type: "unknown", typeConfidence: 0.3 }),
        ],
      }),
    ],
  });
  doubtful.diagram = doubtful.diagrams[0];
  await runImport(doubtful);
  check("« 1 élément à vérifier » annoncé", text().includes("1 élément à vérifier"), text().slice(0, 240));
  check(
    "compteur cohérent avec la règle unique",
    ui.countReviewItems(doubtful) === 1,
    `count=${ui.countReviewItems(doubtful)}`
  );
  await click("Corriger");
  check("liste « À confirmer » affichée", text().includes("Joueur 6"), text().slice(0, 400));
  await click("Joueur 6");
  const attacker = findButton("Attaquant");
  check("choix attaquant/défenseur proposé", !!attacker, buttons().map((b) => b.textContent).join(" | ").slice(0, 300));
  await click("Défenseur");
  await click("Valider l'import");
  check("une injection", injections.length === 1);
  const corrected = ui.diagramsOf(lastImported)[0].players.find((p) => p.label === "6");
  check("correction appliquée au résultat", corrected && corrected.type === "defender", corrected ? corrected.type : "absent");
  const schemaCorrected = ui.importToPlaquetteSchema(lastImported);
  const converted = schemaCorrected.phases[0].players.find((p) => p.label === "6");
  check("correction présente dans l'objet Plaquette", converted && converted.team === "def", converted ? converted.team : "absent");
  // Un défenseur importé est un rond d'équipe « def » : c'est team qui décide du
  // rendu défenseur dans la Plaquette (drawDefenderShape), jamais shape.
  check(
    "objet Plaquette natif (champs standard)",
    converted &&
      typeof converted.id === "string" &&
      typeof converted.x === "number" &&
      typeof converted.y === "number" &&
      typeof converted.label === "string" &&
      converted.shape === "circle" &&
      converted.rotation === 0 &&
      typeof converted.hasBall === "boolean",
    converted ? JSON.stringify({ shape: converted.shape, rotation: converted.rotation }) : "absent"
  );
  check(
    "plus aucun élément à vérifier après correction",
    ui.countReviewItems(lastImported) === 0,
    `count=${ui.countReviewItems(lastImported)}`
  );
  await unmount();

  /* 4. Annulation sans effet ------------------------------------------- */
  console.log("\n4. Annulation");
  await mount();
  await runImport(importResult());
  await click("Annuler");
  check("aucune injection après annulation", injections.length === 0, `injections=${injections.length}`);
  check("écran de validation refermé", !text().includes("Analyse terminée"));
  check("bouton d'import de nouveau disponible", !!findButton("📸 Importer photo / vidéo"));
  // Annulation depuis l'écran de correction : retour au résumé, toujours rien.
  await runImport(importResult());
  await click("Corriger");
  await click("Retour");
  check("retour au résumé depuis la correction", text().includes("Analyse terminée"));
  check("toujours aucune injection", injections.length === 0);
  await unmount();

  /* 5. Validation sans double injection --------------------------------- */
  console.log("\n5. Double clic sur « Valider l'import »");
  await mount();
  await runImport(importResult());
  const validateButton = findButton("Valider l'import");
  await act(async () => {
    validateButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    validateButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    validateButton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  check("triple clic → une seule injection", injections.length === 1, `injections=${injections.length}`);
  check("écran de validation refermé après validation", !text().includes("Analyse terminée"));
  check("message de fin affiché", text().includes("Numérisation terminée"), text().slice(0, 200));
  await unmount();

  /* 6. Retour vers Plaquette -------------------------------------------- */
  console.log("\n6. Retour vers Plaquette");
  await mount();
  await runImport(importResult({ diagrams: [diagram(), diagram()] }));
  await click("Valider l'import");
  const schemaBack = ui.importToPlaquetteSchema(lastImported);
  const entry = schemaBack.entries[1];
  // Champs lus par openDraw() de CreerExerciceClient pour remplir
  // mybasket_plaquette_load.
  check("entry.title", typeof entry.title === "string" && entry.title.length > 0, entry.title);
  check("entry.schemaGroupId", typeof entry.schemaGroupId === "string" && entry.schemaGroupId.length > 0);
  check("entry.courtType half|full", entry.courtType === "half" || entry.courtType === "full", entry.courtType);
  check("entry.phases est un tableau", Array.isArray(entry.phases) && entry.phases.length === 2);
  check("entry.current = index de phase", entry.current === 1, String(entry.current));
  check("entry.sheet présent (null accepté)", "sheet" in entry);
  const phase = entry.phases[0];
  check(
    "phase au format Plaquette",
    Array.isArray(phase.players) && Array.isArray(phase.objects) && Array.isArray(phase.lines) && typeof phase.notes === "string"
  );
  const previews = await ui.renderSchemaPreviews(schemaBack);
  check("miniatures rendues", previews.length === 2 && previews.every((image) => image.startsWith("data:image/png")), previews.map((p) => p.slice(0, 22)).join(" / "));
  check("miniatures non vides (repli terrain tracé)", previews.every((image) => image.length > 3000), previews.map((p) => p.length).join(" / "));
  await unmount();

  /* 7. rectifiedImage ---------------------------------------------------- */
  console.log("\n7. rectifiedImage");
  await mount();
  await runImport(importResult());
  check("comparaison photo activable", !findButton("Comparer avec la photo").disabled);
  await click("Comparer avec la photo");
  const images = Array.from(document.querySelectorAll("img"));
  check("photo d'origine affichée", images.some((image) => (image.getAttribute("alt") || "") === "Document d'origine"));
  check("terrain redressé affiché", images.some((image) => (image.getAttribute("alt") || "") === "Terrain redressé"));
  await click("Corriger");
  check(
    "calque de comparaison disponible dans la correction",
    /calque/i.test(text()),
    text().slice(0, 400)
  );
  await unmount();

  await mount();
  await runImport(importResult({ rectifiedImage: undefined }));
  await click("Comparer avec la photo");
  check(
    "sans redressement, message explicite",
    text().includes("n’a pas pu être redressé") || text().includes("n'a pas pu être redressé"),
    text().slice(0, 300)
  );
  await unmount();

  /* 8. needsReview ------------------------------------------------------- */
  console.log("\n8. needsReview");
  await mount();
  const review = importResult({
    needsReview: true,
    diagrams: [
      diagram({
        players: [
          player("7", 0.3, 0.2, { type: "unknown", typeConfidence: 0.2 }),
          player("8", 0.5, 0.25, { labelConfident: false }),
        ],
        actions: [
          {
            action: "pass",
            from: point(0.3, 0.2),
            to: point(0.5, 0.25),
            points: [point(0.3, 0.2), point(0.5, 0.25)],
            confidence: 0.3,
            source: "test",
          },
        ],
      }),
    ],
  });
  review.diagram = review.diagrams[0];
  await runImport(review);
  check("« 3 éléments à vérifier » annoncé", text().includes("3 éléments à vérifier"), text().slice(0, 260));
  await click("Corriger");
  check(
    "bouton de validation prévient qu'il reste des doutes",
    !!findButton("Valider malgré"),
    buttons().map((b) => b.textContent).join(" | ").slice(0, 300)
  );
  await click("Valider malgré");
  const schemaReview = ui.importToPlaquetteSchema(lastImported);
  const flagged = schemaReview.phases[0].players.filter((p) => p.needsReview === true);
  check("needsReview propagé aux objets Plaquette", flagged.length >= 1, `marqués=${flagged.length}`);
  const labelFlag = schemaReview.phases[0].players.find((p) => p.label === "8");
  check(
    "numéro illisible signalé sans bloquer",
    labelFlag && labelFlag.importLabelConfident === false,
    labelFlag ? String(labelFlag.importLabelConfident) : "absent"
  );
  check(
    "importConfidence transmis",
    schemaReview.phases[0].players.every((p) => typeof p.importConfidence === "number")
  );
  check(
    "importSource transmis",
    schemaReview.phases[0].players.every((p) => typeof p.importSource === "string")
  );
  await unmount();

  /* 9. Import sans terrain ---------------------------------------------- */
  console.log("\n9. Import sans terrain");
  await mount();
  const noCourt = importResult({
    diagrams: [],
    diagram: { detected: false, courtType: "half", orientation: "up", players: [], objects: [], actions: [] },
    rectifiedImage: undefined,
    warnings: ["Aucun terrain reconnu : le schéma reste à dessiner."],
  });
  await runImport(noCourt);
  check("« Aucun schéma détecté »", text().includes("Aucun schéma détecté"), text().slice(0, 260));
  check("bouton « Corriger » désactivé", findButton("Corriger").disabled);
  check("avertissement affiché", text().includes("Aucun terrain reconnu"));
  await click("Valider l'import");
  check("une injection (texte seul)", injections.length === 1);
  check("aucun schéma converti", ui.importToPlaquetteSchema(lastImported) === null);
  check("le titre lu est bien transmis", lastImported.title === "Montée de balle");
  await unmount();

  /* 10. Deuxième import -------------------------------------------------- */
  console.log("\n10. Deuxième import");
  await mount();
  // On rejoue la logique d'ajout de CreerExerciceClient.applyAIImport.
  const form = { schemaImages: [], schemaDataList: [], title: "" };
  const applyAIImport = async (result) => {
    const imported = ui.importToPlaquetteSchema(result);
    const previews = imported ? await ui.renderSchemaPreviews(imported) : [];
    if (result.title) form.title = result.title;
    if (!imported) return;
    const dataList = imported.entries.map((item, index) => ({
      ...item,
      imageData: previews[index] || "",
      phaseImages: previews,
    }));
    form.schemaImages = [...form.schemaImages, ...previews].slice(0, 50);
    form.schemaDataList = [...form.schemaDataList, ...dataList].slice(0, 50);
  };

  await runImport(importResult());
  await click("Valider l'import");
  await applyAIImport(lastImported);
  check("1er import : 1 schéma dans le formulaire", form.schemaImages.length === 1, `n=${form.schemaImages.length}`);
  const firstGroup = form.schemaDataList[0].schemaGroupId;

  await runImport(importResult({ title: "Défense sur écran", diagrams: [diagram(), diagram()] }));
  check("2e import : nouvel écran de validation", text().includes("Analyse terminée"));
  check("le formulaire n'a pas encore bougé", form.schemaImages.length === 1);
  await click("Valider l'import");
  await applyAIImport(lastImported);
  check("2e import ajouté sans écraser", form.schemaImages.length === 3, `n=${form.schemaImages.length}`);
  check("le 1er schéma est intact", form.schemaDataList[0].schemaGroupId === firstGroup);
  check(
    "groupes distincts entre les deux imports",
    form.schemaDataList[1].schemaGroupId !== firstGroup,
    `${firstGroup} / ${form.schemaDataList[1].schemaGroupId}`
  );
  check("titre mis à jour par le 2e import", form.title === "Défense sur écran", form.title);
  check("deux injections au total", injections.length === 2, `injections=${injections.length}`);

  // Un 3e import annulé ne doit rien changer.
  await runImport(importResult({ title: "Ignoré" }));
  await click("Annuler");
  check("import annulé : formulaire inchangé", form.schemaImages.length === 3 && form.title === "Défense sur écran");
  check("import annulé : pas d'injection supplémentaire", injections.length === 2);
  await unmount();

  /* --------------------------------------------------------------- bilan */
  console.log(`\n${"─".repeat(70)}`);
  console.log(`${passed} vérifications passées, ${failures.length} échec(s).`);
  if (failures.length) {
    console.log("\nÉchecs :");
    failures.forEach((failure) => console.log(`  ✗ ${failure}`));
    process.exit(1);
  }
  console.log("Chaîne d'interface conforme.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
