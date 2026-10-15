// Actual React board tests, offline. Run with NODE_PATH pointing to an external jsdom install.
const fs = require("fs"),
  ts = require("typescript"),
  assert = require("node:assert/strict"),
  { JSDOM } = require("jsdom");
const dom = new JSDOM('<div id="root"></div>', {
  url: "https://mybasket.test",
  pretendToBeVisual: true,
});
for (const k of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "CustomEvent",
])
  global[k] = dom.window[k];
global.IS_REACT_ACT_ENVIRONMENT = true;
const Module = require("module"),
  originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/shot-chart-zones")
    request = require("path").resolve("lib/shot-chart-zones.ts");
  return originalLoad.call(this, request, parent, isMain);
};
require.extensions[".css"] = (mod) =>
  (mod.exports = new Proxy(
    {},
    { get: (_, k) => (k === "__esModule" ? false : String(k)) },
  ));
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (mod, p) =>
    mod._compile(
      ts.transpileModule(fs.readFileSync(p, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      p,
    );
const React = require("react"),
  { act } = React,
  { createRoot } = require("react-dom/client"),
  Board =
    require("../components/prise-stats-pro/MatchReviewBuilder.tsx").default;
window.confirm = () => true;
const template = {
  id: "old-template",
  name: "Ancienne fenêtre",
  description: "legacy",
  flow: [{ id: "flow", type: "player", required: true }],
  layout: {
    columns: 2,
    compact: false,
    showPlayerPanel: true,
    showVideo: true,
    showHistory: true,
  },
  updatedAt: "2026-10-14",
  blocks: [
    {
      id: "old-block",
      title: "Défense",
      color: "#861b3a",
      columns: 2,
      controls: [
        {
          id: "old-control",
          label: "Switch",
          type: "button",
          color: "#861b3a",
          requirePlayer: true,
          createClip: true,
          preRoll: 4,
          postRoll: 6,
        },
      ],
    },
  ],
};
window.localStorage.setItem(
  "mybasket.match-review.templates.v2",
  JSON.stringify([template]),
);
window.localStorage.setItem("unrelated-mode", "unchanged");
let root,
  time = 14,
  savedIds = [],
  recorded = [],
  seek = [];
const render = async () => {
  root = createRoot(document.getElementById("root"));
  await act(async () =>
    root.render(
      React.createElement(Board, {
        embedded: true,
        projectId: "match-a",
        players: [{ id: "p1", name: "ONDZE", num: 4 }],
        getVideoTime: () => time,
        onSeek: (t) => seek.push(t),
        onRecord: (e) => recorded.push(e),
        onSaved: (id) => savedIds.push(id),
      }),
    ),
  );
};
const buttons = () => [...document.querySelectorAll("button")];
const btn = (text) => buttons().find((b) => b.textContent.trim() === text);
const click = async (el) => {
  assert(el, "button exists");
  await act(async () =>
    el.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
};
const fill = async (el, value) => {
  assert(el);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
(async () => {
  await render();
  assert(btn("Switch"));
  assert(!document.querySelector("[class*=flowPreview]"));
  await click(btn("Switch"));
  assert(!document.querySelector("[class*=pendingOverlay]"));
  time = 30;
  await click(btn("Enregistrer l’action"));
  assert.equal(recorded.length, 0, "required player blocks save");
  const select = [...document.querySelectorAll("select")].find((s) =>
    s.textContent.includes("Équipe / sans joueur"),
  );
  await act(async () => {
    select.value = "p1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await click(btn("Enregistrer l’action"));
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].videoTime, 14, "time captured when action clicked");
  assert.equal(recorded[0].playerId, "p1");
  assert.equal(recorded[0].controlId, "old-control");
  assert.equal(recorded[0].preRoll, 4);
  await click(btn("Timeline des saisies"));
  await click(document.querySelector("[class=timeline] button"));
  assert.equal(seek[0], 10);
  await click(btn("Modifier"));
  await click(document.querySelector('[aria-label="Configurer Défense"]'));
  await fill(document.querySelector('[aria-label="Largeur du bloc"]'), 600);
  await fill(document.querySelector('[aria-label="Hauteur du bloc"]'), 320);

  const canvas = document.querySelector("[class=canvas]");
  canvas.getBoundingClientRect = () => ({ width: 960 });
  HTMLElement.prototype.setPointerCapture = () => {};
  const pointer = async (el, type, x, y) => {
    await act(async () => {
      const e = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(e, "pointerId", { value: 1 });
      el.dispatchEvent(e);
    });
  };
  let grip = document.querySelector('[aria-label="Déplacer Défense"]');
  await pointer(grip, "pointerdown", 0, 0);
  await pointer(grip, "pointermove", 80, 48);
  await pointer(grip, "pointerup", 80, 48);
  let section = document.querySelector("section");
  assert.equal(section.style.left, "8.333333333333334%");
  assert.equal(section.style.top, "48px");
  let resize = document.querySelector('[aria-label="Redimensionner Défense"]');
  await pointer(resize, "pointerdown", 0, 0);
  await pointer(resize, "pointermove", 40, 32);
  await pointer(resize, "pointerup", 40, 32);
  assert.equal(section.style.height, "352px");
  await click(document.querySelector('[aria-label="Annuler la modification"]'));
  assert.equal(section.style.height, "320px");
  await click(
    document.querySelector('[aria-label="Rétablir la modification"]'),
  );
  assert.equal(section.style.height, "352px");
  await fill(document.querySelector('[aria-label="Largeur du bloc"]'), 600);
  await fill(document.querySelector('[aria-label="Hauteur du bloc"]'), 320);
  await click(btn("＋ Bloc ▾"));
  await click(btn("Shot chart"));
  assert(document.querySelector("svg"));
  await click(btn("Enregistrer"));
  let stored = JSON.parse(
    window.localStorage.getItem("mybasket.match-review.templates.v2"),
  );
  assert.equal(stored[0].blocks[0].frame.width, 600);
  assert.equal(stored[0].blocks[0].frame.height, 320);
  assert(stored[0].blocks.some((b) => b.kind === "shot-chart"));
  assert.equal(stored[0].blocks[0].controls[0].id, "old-control");
  await act(async () => root.unmount());
  await render();
  assert(document.querySelector("svg"));
  await click(btn("Switch"));
  const svg = document.querySelector("svg");
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 500,
    height: 470,
  });
  assert.equal(
    svg.querySelectorAll("path.sc-zone").length,
    16,
    "shared official 16-zone court",
  );
  assert(
    svg.querySelector("image").getAttribute("href").startsWith("data:image/"),
    "existing offline court image",
  );
  await click(svg.querySelector("path.sc-zone.act"));
  assert(document.body.textContent.includes("Position de tir renseignée"));
  await click(btn("Annuler la saisie"));
  assert.equal(recorded.length, 1, "cancel never saves");
  assert(!document.querySelector('svg circle[fill="#ffc857"]'));
  assert.equal(window.localStorage.getItem("unrelated-mode"), "unchanged");
  assert.equal(
    window.localStorage.getItem("mybasket.match-review.events.v2.match-b"),
    null,
  );
  assert.equal(
    JSON.parse(
      window.localStorage.getItem("mybasket.match-review.events.v2.match-a"),
    ).length,
    1,
  );

  await click(btn("Modifier"));
  await click(document.querySelector('[aria-label="Configurer Défense"]'));
  await fill(document.querySelector('[aria-label="Largeur du bloc"]'), 500);
  const oldSet = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = () => {
    throw Error("quota");
  };
  await click(btn("Enregistrer"));
  assert(document.body.textContent.includes("Enregistrement impossible"));
  assert.equal(
    JSON.parse(
      window.localStorage.getItem("mybasket.match-review.templates.v2"),
    )[0].blocks[0].frame.width,
    600,
  );
  window.Storage.prototype.setItem = oldSet;
  await click(btn("Enregistrer"));
  assert.equal(
    JSON.parse(
      window.localStorage.getItem("mybasket.match-review.templates.v2"),
    )[0].blocks[0].frame.width,
    500,
  );
  assert(savedIds.length >= 2, "save emits selected window id only on success");
  await click(btn("Dupliquer"));
  await fill(
    document.querySelector('[aria-label="Nom de la fenêtre"]'),
    "Analyse essai",
  );
  await click(btn("Enregistrer"));
  const selectedId = window.localStorage.getItem(
    "mybasket.match-review.active-template.v2",
  );
  assert.notEqual(selectedId, "old-template");
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root"));
  const Picker =
    require("../components/prise-stats-pro/MatchReviewBuilder.tsx").MatchReviewWindowPicker;
  await act(async () => root.render(React.createElement(Picker)));
  const picker = document.querySelector(
    '[aria-label="Fenêtre enregistrée de Mon mode"]',
  );
  assert.equal(picker.value, selectedId);
  assert.equal(picker.selectedOptions[0].textContent, "Analyse essai");
  await act(async () => {
    picker.value = "old-template";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.equal(
    window.localStorage.getItem("mybasket.match-review.active-template.v2"),
    "old-template",
  );
  await act(async () => root.unmount());
  await render();
  assert.equal(
    document.querySelector('[aria-label="Choisir une fenêtre"]').value,
    "old-template",
  );
  await act(async () => root.unmount());
  console.log(
    "Mon mode: legacy template preserved, free inline coding, required player, captured video time, timeline seek, block sizes and shot-chart saved/reopened, cancel, saved-window picker, duplicate naming and reopening selected window, save callback and project isolation passed.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
