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
const React = require("react"), { act } = React;
const { createRoot } = require("react-dom/client");
const ShotChart = require("../components/prise-stats-pro/ShotChart.tsx").default;
const root = createRoot(document.getElementById("root"));
let picks = [];
const render = (extra = {}) => act(() => root.render(React.createElement(ShotChart, {
  mode: "pick", shotType: "2PTS", onPick: (zone, point) => picks.push({zone, point}), ...extra
})));
render();
assert.ok(document.querySelector("image").getAttribute("href").startsWith("data:image/webp;base64,"));
assert.equal(document.querySelectorAll(".sc-fallback path").length, 16);
act(() => document.querySelector("image").dispatchEvent(new Event("error")));
assert.equal(document.querySelector("image"), null, "Remove broken bitmap including Safari's question mark");
assert.equal(document.querySelectorAll(".sc-zone").length, 16);
act(() => document.querySelector(".sc-zone.act").dispatchEvent(new MouseEvent("click", {bubbles:true})));
assert.equal(picks.length, 1);
assert.equal(picks[0].zone.type, "2PTS");
assert.ok(Number.isFinite(picks[0].point.x));
render({shotType:"3PTS"});
assert.equal(document.querySelector("image"), null);
act(() => document.querySelector(".sc-zone.act").dispatchEvent(new MouseEvent("click", {bubbles:true})));
assert.equal(picks[1].zone.type, "3PTS");
render({imageSrc:"/replacement.webp"});
assert.equal(document.querySelector("image").getAttribute("href"), "/replacement.webp");
act(() => document.querySelector("image").dispatchEvent(new Event("error")));
assert.equal(document.querySelector("image"), null);
render({locked:true});
assert.equal(document.querySelectorAll(".sc-zone.act").length, 0, "Keep workflow locks");
act(() => root.unmount());
console.log("Shot chart: embedded background, decode failure fallback, 16 zones, 2/3-point clicks, source changes and locks passed.");
