/**
 * Construit le bundle de test à partir des SOURCES DE PRODUCTION.
 * Seul `./ocr` est remplacé par un bouchon : Tesseract ne tourne pas ici.
 */
const path = require("path");
const esbuild = require("esbuild");

const stubOcr = {
  name: "stub-ocr",
  setup(build) {
    build.onResolve({ filter: /(^|\/)ocr$/ }, () => ({ path: path.join(__dirname, "ocr-stub.ts") }));
  },
};

esbuild
  .build({
    entryPoints: [path.join(__dirname, "entry.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    outfile: path.join(__dirname, ".build", "engine.cjs"),
    logLevel: "warning",
    plugins: [stubOcr],
  })
  .then(() => console.log("bundle de test prêt : tests/.build/engine.cjs"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// Bundle des analyseurs de document, pour le test d'intégration.
esbuild
  .build({
    entryPoints: [path.join(__dirname, "..", "lib", "import", "document-layout.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    outfile: path.join(__dirname, ".build", "layout.cjs"),
    logLevel: "warning",
    plugins: [stubOcr],
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// Bundle NAVIGATEUR : pipeline complet, Tesseract inclus (aucun bouchon).
esbuild
  .build({
    entryPoints: [path.join(__dirname, "..", "lib", "import", "local-exercise-scanner.ts")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    outfile: path.join(__dirname, "browser", "engine.js"),
    logLevel: "warning",
  })
  .then(() => console.log("bundle navigateur prêt : tests/browser/engine.js"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
