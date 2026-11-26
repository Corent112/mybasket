const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const modules = new Map();
function read(path) {
  if (modules.has(path)) return modules.get(path);
  const result = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("exports", "require", code)(result.exports, name => read(name.replace(/^@\//, "") + ".ts"));
  modules.set(path, result.exports);
  return result.exports;
}

const { scoutingHighlights } = read("lib/scouting-highlights.ts");
const action = (id, fields) => ({ id, match_id: "a", context: "attaque", quarter: 1, ...fields });
const rows = [
  action("1", { possession_start: 0, video_time: 4, temps_fort: "pick_top", action_type: "tir", shot_type: "2PTS", shot_result: "missed" }),
  action("2", { possession_start: 0, video_time: 8, temps_fort: "rebond_offensif", action_type: "tir", shot_type: "3PTS", shot_result: "made" }),
  action("3", { possession_id: "live", coding_source: "collective", temps_fort: "pick-top", action_type: "faute-provoquee", special_case: "2pts+1lf", ft_made: 1 }),
  action("4", { possession_id: "live", coding_source: "individual", temps_fort: "pick_top", action_type: "tir", shot_type: "2PTS", shot_result: "made" }),
  action("5", { match_id: "b", possession_start: 0, temps_fort: "transition", action_type: "perte" }),
  action("6", { context: "defense", temps_fort: "pick_side", action_type: "tir", shot_type: "3PTS", shot_result: "made" }),
  action("7", { temps_fort: "marqueur", action_type: "marqueur" }),
];
assert.deepEqual(scoutingHighlights(rows, "attaque"), [
  { label: "Pick Top", possessions: 2, points: 6, share: 2 / 3, ppp: 3 },
  { label: "Transition", possessions: 1, points: 0, share: 1 / 3, ppp: 0 },
]);
assert.deepEqual(scoutingHighlights(rows, "attaque", ["b"]), [{ label: "Transition", possessions: 1, points: 0, share: 1, ppp: 0 }]);
assert.deepEqual(scoutingHighlights(rows, "defense"), [{ label: "Pick Side", possessions: 1, points: 3, share: 1, ppp: 3 }]);
assert.deepEqual(scoutingHighlights(rows, "attaque", []), []);
console.log("Scouting highlights: possession deduplication, legacy labels, match filters and scoring passed.");
