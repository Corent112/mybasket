const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
const original = Module._load;
const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
Module._load = function (name, parent, isMain) {
  return original.call(
    this,
    name.startsWith("@/") ? path.join(root, name.slice(2)) : name,
    parent,
    isMain,
  );
};
const shipping = require("../lib/shop/shipping.ts");
const analytics = require("../lib/analytics/matches.ts");
const calendar = require("../lib/calendar-access.ts");
const { reconcileCalendarFixtures } = require("../lib/calendar-fixtures.ts");
const school = require("../lib/school-timetable.ts");
(async () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const quote = (g, c = "FR", zip = "75013", date = now) =>
    shipping.colissimoDomicile(g, c, zip, date);
  assert.equal(quote(250).cents, 549);
  assert.equal(quote(251).cents, 759);
  assert.equal(quote(500).cents, 759);
  assert.equal(quote(501).cents, 929);
  assert.equal(quote(30000).cents, 3959);
  assert.throws(() => quote(30001));
  assert.throws(() => quote(NaN));
  assert.throws(() => quote(0));
  assert.throws(() => quote(200, "FR", "97400"));
  assert.throws(() => quote(200, "FR", "00000"));
  assert.throws(() => quote(200, "DE", "10115"));
  assert.equal(quote(250, "MC", "98000").cents, 549);
  assert.equal(
    quote(250, "FR", "75013", new Date("2026-12-31T22:59:59Z")).cents,
    549,
  );
  assert.equal(
    quote(250, "FR", "75013", new Date("2026-12-31T23:00:00Z")).cents,
    579,
  );
  assert.throws(() => quote(250, "FR", "75013", new Date("2028-01-01")));
  const db = {
    from(table) {
      assert.equal(table, "products");
      return {
        select() {
          return this;
        },
        in: async () => ({
          data: [
            {
              id: "book",
              name: "Cahier coach",
              status: "active",
              metadata: {},
            },
            { id: "other", name: "Maillot", status: "active", metadata: {} },
            {
              id: "digital",
              status: "active",
              metadata: { requires_shipping: false },
            },
          ],
        }),
      };
    },
  };
  assert.equal(
    (
      await shipping.resolveShippingQuote(
        db,
        [{ item_type: "product", item_id: "book", quantity: 2 }],
        "FR",
        "75013",
      )
    ).cents,
    759,
  );
  assert.equal(
    (
      await shipping.resolveShippingQuote(
        db,
        [{ item_type: "subscription" }],
        "",
        "",
      )
    ).cents,
    0,
  );
  assert.equal(
    (
      await shipping.resolveShippingQuote(
        db,
        [{ item_type: "product", item_id: "digital" }],
        "",
        "",
      )
    ).required,
    false,
  );
  await assert.rejects(
    shipping.resolveShippingQuote(
      db,
      [{ item_type: "product", item_id: "other" }],
      "FR",
      "75013",
    ),
    /poids/,
  );
  await assert.rejects(
    shipping.resolveShippingQuote(
      db,
      [{ item_type: "product", item_id: "missing" }],
      "FR",
      "75013",
    ),
    /disponible/,
  );
  assert.throws(() =>
    shipping.validateAddress({
      name: "",
      line1: "x",
      city: "Paris",
      postalCode: "75013",
      country: "FR",
    }),
  );
  assert.equal(
    shipping.validateAddress({
      name: " Coach ",
      line1: " 1 rue ",
      city: " Paris ",
      postalCode: "75013",
      country: "fr",
    }).name,
    "Coach",
  );
  const box = {
    pts: 82,
    p2m: 20,
    p2a: 40,
    p3m: 10,
    p3a: 20,
    ftm: 12,
    fta: 16,
    off_reb: 10,
    def_reb: 20,
    ast: 20,
    turnovers: 12,
  };
  const opp = { ...box, pts: 75, def_reb: 30, off_reb: 8 };
  const v = analytics.indicators(box, opp);
  assert.equal(v.efg, 58.333333333333336);
  assert.equal(v.ts, (82 / (2 * (60 + 0.44 * 16))) * 100);
  assert.equal(v.orb, 25);
  assert.equal(v.tov, (12 / (60 + 0.44 * 16 + 12)) * 100);
  assert(Math.abs(v.net - ((82 - 75) / v.possessions) * 100) < 1e-10);
  assert.equal(analytics.boxOf([]).pts, null);
  assert.equal(analytics.boxOf([{ pts: null }]).pts, null);
  assert.equal(analytics.boxOf([{ pts: 0, p2a: 0 }]).pts, 0);
  assert.equal(analytics.indicators({ ...box, fta: null }).ortg, null);
  assert.equal(analytics.ratio(0, 0), null);
  const pooled = analytics.boxOf([
    { ...box, p3m: 1, p3a: 2 },
    { ...box, p3m: 0, p3a: 8 },
  ]);
  assert.equal(
    analytics.ratio(pooled.p3m, pooled.p3a, 100),
    10,
    "Ratios use pooled attempts",
  );
  const participation = analytics.participation(
    [
      { match_id: "m1", player_id: "p", minutes_seconds: 120, plus_minus: 2 },
      { match_id: "m1", player_id: "p", minutes_seconds: 120 },
      { match_id: "m2", player_id: "p", minutes_seconds: null },
      { match_id: "m2", player_id: "absent", present: false },
    ],
    new Map([
      ["m1", { project_state: { starters: ["p", "a", "b", "c", "d"] } }],
      ["m2", { project_state: { starters: [] } }],
    ]),
  );
  assert.deepEqual(participation.p, {
    games: 2,
    starts: 1,
    startsKnown: 1,
    seconds: 120,
    minutesKnown: 1,
  });
  assert.equal(participation.absent, undefined);
  const defensive = [
    {
      id: "a",
      match_id: "m",
      context: "defense",
      action_type: "tir",
      shot_type: "2PTS",
      shot_result: "made",
      ft_attempts: 0,
      ft_made: 0,
    },
  ];
  assert.equal(
    analytics.opponentBoxOf({ id: "m", them_score: 2 }, defensive).p2m,
    1,
  );
  assert.equal(
    analytics.opponentBoxOf({ id: "m", them_score: 20 }, defensive).p2m,
    null,
    "Partial coding must not masquerade as a full opponent boxscore",
  );
  assert.equal(
    analytics.opponentBoxOf({ id: "m", them_score: 2 }, []).p2m,
    null,
  );
  assert.equal(
    analytics.matchMinutes({ per_q: { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} } }),
    45,
  );
  const medical = {
    team_id: "t",
    event_type: "health",
    assigned_player_ids: ["p1"],
  };
  assert(calendar.playerCanSeeCalendarEvent(medical, "p1"));
  assert(!calendar.playerCanSeeCalendarEvent(medical, "p2"));
  assert(
    !calendar.playerCanSeeCalendarEvent(
      { ...medical, assigned_player_ids: [] },
      "p1",
    ),
  );
  assert(
    calendar.playerCanSeeCalendarEvent(
      { ...medical, event_type: "training", assigned_player_ids: [] },
      "p1",
    ),
  );
  assert(
    !calendar.linkedPlayerCanSeeCalendarEvent(medical, "u", [
      { id: "p1", team_id: "other" },
    ]),
  );
  assert(
    calendar.linkedPlayerCanSeeCalendarEvent(
      { ...medical, owner_id: "u" },
      "u",
      [],
    ),
  );
  const fixtures = [
    {
      id: "1",
      team_id: "t",
      title: "U18 vs Nantes",
      event_type: "game",
      event_date: "2026-11-19",
      description: "Match FFBB · Compétition : U18 · Domicile",
      location: "Domicile",
    },
    {
      id: "2",
      team_id: "t",
      title: "U18 @ Nantes",
      event_type: "game",
      event_date: "2026-11-19",
      description: "Synchronisé FFBB · Compétition : U18 · Extérieur",
      location: "Extérieur",
    },
  ];
  assert.equal(
    reconcileCalendarFixtures(fixtures, [{ id: "t", name: "U18" }]).length,
    1,
  );
  assert.equal(
    reconcileCalendarFixtures(
      [
        { ...medical, event_date: "2026-11-19", title: "Kiné" },
        {
          ...medical,
          event_date: "2026-11-19",
          title: "Kiné",
          assigned_player_ids: ["p2"],
        },
      ],
      [],
    ).length,
    2,
  );
  const courses = school.normalizeSchoolCourses([
    { day: 1, title: "Maths", start: "08:00", end: "09:00" },
    { day: 9, title: "Bad", start: "08:00", end: "09:00" },
    { day: 2, title: "Bad", start: "25:00", end: "26:00" },
    { day: 3, title: "Bad", start: "10:00", end: "09:00" },
  ]);
  assert.equal(courses.length, 1);
  assert.equal(
    school.schoolOccurrences(courses, "2026-11-16", "2026-11-30").length,
    3,
  );
  assert.throws(() =>
    school.schoolOccurrences(courses, "2026-11-30", "2026-11-16"),
  );
  assert.throws(() =>
    school.schoolOccurrences(courses, "2026-02-31", "2026-03-10"),
  );
  const docs = require("../lib/ai/knowledge/extract.ts");
  const { zipSync, strToU8 } = require("fflate");
  const ppt = zipSync({
    "ppt/slides/slide2.xml": strToU8("<a:t>Rebond &amp; possession</a:t>"),
    "ppt/slides/slide1.xml": strToU8("<a:t>Défense</a:t>"),
    "ppt/notesSlides/notesSlide1.xml": strToU8("<a:t>Note du coach</a:t>"),
    "other.xml": strToU8("<a:t>NE PAS INDEXER</a:t>"),
  });
  const extracted = await docs.extractDocumentText(ppt.buffer, "pptx");
  assert.equal(extracted.pages.length, 3);
  assert(extracted.pages.some((p) => p.text === "Rebond & possession"));
  assert(!extracted.pages.some((p) => p.text.includes("NE PAS")));
  const { jsPDF } = require("jspdf");
  let saved;
  Module._load = function (name, parent, isMain) {
    if (name === "jspdf")
      return {
        jsPDF: function (options) {
          const doc = new jsPDF(options);
          doc.save = () => {
            saved = doc.output("arraybuffer");
          };
          return doc;
        },
      };
    return original.call(
      this,
      name.startsWith("@/") ? path.join(root, name.slice(2)) : name,
      parent,
      isMain,
    );
  };
  const {
    exportMatchAnalysisPdf,
  } = require("../lib/analytics/export-match-pdf.ts");
  await exportMatchAnalysisPdf({
    name: "Équipe test",
    mode: "matches",
    matches: [
      {
        id: "m",
        opponent: "Nantes",
        match_date: "2026-11-19",
        us_score: 82,
        them_score: 75,
      },
    ],
    rows: [{ ...box, match_id: "m", player_id: "p" }],
    actions: [],
  });
  assert(saved?.byteLength > 1000);
  fs.mkdirSync("/tmp/mybasket-product-tests", { recursive: true });
  fs.writeFileSync(
    "/tmp/mybasket-product-tests/report.pdf",
    Buffer.from(saved),
  );
  console.log(
    "Shipping tariffs and cart validation, missing stats and ratios, starts/minutes, defensive coverage, calendar isolation/deduplication, school schedule validation, PPTX extraction and PDF generation passed. No external email, SMS, push or AI call made.",
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    Module._load = original;
  });
