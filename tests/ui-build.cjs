/**
 * Bundle du test de chaîne d'interface.
 *
 * - `@/…` est résolu comme dans Next (racine du projet) ;
 * - `local-exercise-scanner` est remplacé par le bouchon, rien d'autre.
 */
const path = require("path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");

const fs = require("fs");

const withExtension = (base) => {
  for (const extension of [".ts", ".tsx", ".js", "/index.ts", "/index.tsx"]) {
    if (fs.existsSync(base + extension)) return base + extension;
  }
  return base;
};

const alias = {
  name: "mybasket-alias",
  setup(build) {
    build.onResolve({ filter: /local-exercise-scanner$/ }, () => ({
      path: path.join(__dirname, "scanner-stub.ts"),
    }));
    build.onResolve({ filter: /^@\// }, (args) => ({
      path: withExtension(path.join(root, args.path.slice(2))),
    }));
  },
};

esbuild
  .build({
    entryPoints: [path.join(__dirname, "ui-entry.tsx")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    jsx: "automatic",
    external: ["react", "react-dom", "react/jsx-runtime"],
    outfile: path.join(__dirname, ".build", "ui.cjs"),
    logLevel: "warning",
    plugins: [alias],
  })
  .then(() => console.log("bundle interface prêt : tests/.build/ui.cjs"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
