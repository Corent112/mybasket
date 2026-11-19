const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  crypto = require("node:crypto");
const compile = (file) =>
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
function load(file, mocks = {}, env = {}) {
  const context = {
    exports: {},
    console,
    Request,
    Response,
    URL,
    Intl,
    Buffer,
    Date,
    process: { env },
    require: (name) =>
      name === "node:crypto"
        ? crypto
        : name in mocks
          ? mocks[name]
          : (() => {
              throw Error("Unexpected " + name);
            })(),
  };
  vm.runInNewContext(compile(file), context);
  return context.exports;
}
const next = {
  "next/server": {
    NextResponse: { json: (data, options) => Response.json(data, options) },
  },
};
const access = load("lib/calendar-access.ts");
const origin = load("lib/security/request-origin.ts");
function queryDb(tables) {
  return {
    from(table) {
      let filters = [],
        offset = 0,
        end = 499;
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          filters.push((row) => row[key] === value);
          return q;
        },
        contains(key, value) {
          filters.push((row) =>
            Object.entries(value).every(([k, v]) => row[key]?.[k] === v),
          );
          return q;
        },
        in(key, values) {
          filters.push((row) => values.includes(row[key]));
          return q;
        },
        or(expression) {
          const parts = expression.split(",").map((s) => s.split(".eq."));
          filters.push((row) => parts.some(([key, v]) => row[key] === v));
          return q;
        },
        limit() {
          return q;
        },
        gte() {
          return q;
        },
        lte() {
          return q;
        },
        order() {
          return q;
        },
        range(a, b) {
          offset = a;
          end = b;
          return q;
        },
        maybeSingle: async () => ({
          data:
            (tables[table] || []).find((row) => filters.every((f) => f(row))) ||
            null,
        }),
        then(resolve, reject) {
          return Promise.resolve({
            data: (tables[table] || [])
              .filter((row) => filters.every((f) => f(row)))
              .slice(offset, end + 1),
          }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}
(async () => {
  const players = [
    {
      id: "p1",
      team_id: "u18",
      metadata: {
        messagingUserId: "player",
        additionalTeamIds: ["u21"],
        email: "p1@example.test",
      },
    },
    { id: "p2", team_id: "u18", metadata: { email: "p2@example.test" } },
  ];
  const teams = [
    { id: "u18", user_id: "coach" },
    { id: "u21", user_id: "coach" },
    { id: "other", user_id: "foreign" },
  ];
  const events = [
    {
      id: "school",
      team_id: "u18",
      event_type: "school",
      assigned_player_ids: ["p1"],
      owner_id: "coach",
    },
    {
      id: "medical-other",
      team_id: "u18",
      event_type: "health",
      assigned_player_ids: ["p2"],
      owner_id: "coach",
    },
    {
      id: "training",
      team_id: "u21",
      event_type: "training",
      assigned_player_ids: [],
      owner_id: "coach",
    },
    {
      id: "private",
      team_id: "u18",
      event_type: "other",
      assigned_player_ids: [],
      owner_id: "coach",
    },
    { id: "own", team_id: null, event_type: "other", owner_id: "player" },
    {
      id: "foreign",
      team_id: "other",
      event_type: "game",
      assigned_player_ids: [],
      owner_id: "foreign",
    },
  ];
  const forged = await access.verifiedPlayerMemberships(queryDb({ teams }), [
    { id: "p1", team_id: "u18", metadata: { additionalTeamIds: ["other"] } },
  ]);
  assert.equal(
    forged.some((p) => p.team_id === "other"),
    false,
    "A forged metadata link cannot expose another owner’s team",
  );
  let user = { id: "player" },
    permitted = true;
  const admin = queryDb({ teams, players, calendar_events: events });
  const db = { ...admin, auth: { getUser: async () => ({ data: { user } }) } };
  const feed = load("app/api/calendar/feed/route.ts", {
    ...next,
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/supabase/admin-server": { createAdminClient: () => admin },
    "@/lib/messaging/team-contacts": {
      teamMessagingContacts: async () => ({ canLinkPlayers: permitted }),
    },
    "@/lib/calendar-access": access,
  });
  let response = await feed.GET(
    new Request("https://mybasket.test/api/calendar/feed"),
  );
  assert.equal(response.status, 200);
  let rows = (await response.json()).events;
  assert.deepEqual(rows.map((r) => r.id).sort(), ["own", "school", "training"]);
  assert(rows.find((r) => r.id === "school").can_edit === false);
  response = await feed.GET(
    new Request(
      "https://mybasket.test/api/calendar/feed?teamId=u21&playerId=p1",
    ),
  );
  assert.equal(response.status, 200);
  rows = (await response.json()).events;
  assert.deepEqual(
    rows.map((r) => r.id).sort(),
    ["school", "training"],
    "A linked player sees school and appointments across their teams",
  );
  user = { id: "coach" };
  response = await feed.GET(
    new Request(
      "https://mybasket.test/api/calendar/feed?teamId=u21&playerId=p1",
    ),
  );
  assert.equal(response.status, 200);
  rows = (await response.json()).events;
  assert.deepEqual(rows.map((r) => r.id).sort(), ["school", "training"]);
  permitted = false;
  response = await feed.GET(
    new Request(
      "https://mybasket.test/api/calendar/feed?teamId=u21&playerId=p1",
    ),
  );
  assert.equal(response.status, 403);
  user = null;
  assert.equal(
    (await feed.GET(new Request("https://mybasket.test/api/calendar/feed")))
      .status,
    401,
  );
  user = { id: "coach" };
  permitted = true;
  const sent = [];
  const claims = new Map();
  const event = {
    id: "event",
    team_id: "u18",
    user_id: "coach",
    owner_id: "coach",
    event_date: "2026-11-19",
    start_time: "09:00",
    title: "PRIVATE MEDICAL CONTENT",
    event_type: "health",
    assigned_player_ids: ["p1"],
    updated_at: "2026-11-19T08:00:00Z",
  };
  const notificationDB = queryDb({
    teams,
    players,
    calendar_events: [event],
    profiles: [{ id: "player", email: "p1@example.test" }],
  });
  const bucket = {
    upload: async (key, body, options) => {
      if (!options.upsert && claims.has(key))
        return { error: { message: "duplicate" } };
      claims.set(key, body);
      return {};
    },
  };
  const service = {
    ...notificationDB,
    storage: {
      getBucket: async () => ({ data: { public: false } }),
      from: () => bucket,
    },
  };
  const notify = load(
    "app/api/calendar/notify/route.ts",
    {
      ...next,
      "@/lib/calendar-access": access,
      "@/lib/supabase/server": {
        createClient: async () => ({ ...notificationDB, auth: db.auth }),
      },
      "@/lib/supabase/admin-server": { createAdminClient: () => service },
      "@/lib/messaging/team-contacts": {
        teamMessagingContacts: async () => ({ canLinkPlayers: true }),
      },
      "@/lib/security/request-origin": origin,
      "@/lib/security/rate-limit": { rateLimit: () => ({ allowed: true }) },
      "@/lib/site-url": { getSiteUrl: () => "https://mybasket.test" },
      "@/lib/messaging/push-server": {
        sendMessagePush: async () => {
          throw Error("Push not selected");
        },
      },
      "@/lib/server-notifications": {
        sendTransactionalEmail: async (message) => {
          sent.push(message);
          return { sent: true };
        },
      },
    },
    { RESEND_API_KEY: "test", RESEND_FROM: "test@example.test" },
  );
  const req = (channels) =>
    new Request("https://mybasket.test/api/calendar/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "event",
        channels,
        to: "foreign@example.test",
      }),
    });
  response = await notify.POST(req(["email"]));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "p1@example.test");
  assert(!sent[0].html.includes(event.title));
  response = await notify.POST(req(["email"]));
  assert.equal((await response.json()).skipped, 1);
  assert.equal(sent.length, 1, "Repeat delivery is not sent twice");
  response = await notify.POST(req(["sms"]));
  assert.equal(
    response.status,
    503,
    "An unavailable provider is not reported as delivery",
  );
  user = { id: "foreign" };
  response = await notify.POST(req(["email"]));
  assert.equal(response.status, 404);
  assert.equal(sent.length, 1);
  const reconcile = load("lib/calendar-fixtures.ts").reconcileCalendarFixtures;
  const fixture = {
    id: "import",
    team_id: "u18",
    event_type: "game",
    event_date: "2026-11-19",
    title: "U18 vs Nantes",
    description: "Match FFBB · Compétition : U18",
    start_time: "18:00",
  };
  const finished = {
    ...fixture,
    id: "live",
    title: "Match vs Nantes",
    description: "Match terminé — boxscores accessibles",
    start_time: null,
  };
  assert.equal(
    reconcile([fixture, finished], [{ id: "u18", name: "U18" }]).length,
    1,
  );
  assert.equal(
    reconcile(
      [fixture, { ...finished, start_time: "09:00" }],
      [{ id: "u18", name: "U18" }],
    ).length,
    2,
  );
  console.log(
    "Calendar sharing passed: owner versus recipient views, private appointment isolation, U18/U21 relations, denied foreign access, saved-event-only notifications, recipient selection, no duplicate sends, missing-provider status. No real notification sent.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
