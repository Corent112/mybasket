const fs = require("node:fs"),
  vm = require("node:vm"),
  ts = require("typescript"),
  assert = require("node:assert/strict"),
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
  const box = {
    exports: {},
    console,
    Request,
    Response,
    URL,
    Intl,
    Buffer,
    Date,
    crypto: crypto.webcrypto,
    process: { env },
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === "node:crypto") return crypto;
      throw Error("Unmocked " + name);
    },
  };
  vm.runInNewContext(compile(file), box);
  return box.exports;
}
const next = {
  "next/server": {
    NextResponse: { json: (data, options) => Response.json(data, options) },
  },
};
const origin = load("lib/security/request-origin.ts");
const integrity = load("lib/payments/checkout-integrity.ts");
const shipping = load("lib/shop/shipping.ts", {
  "@/lib/payments/checkout-integrity": integrity,
});
const rate = {
  "@/lib/security/rate-limit": { rateLimit: () => ({ allowed: true }) },
  "@/lib/security/request-origin": origin,
};
const address = {
  name: "Coach test",
  line1: "1 rue du Test",
  line2: "",
  postalCode: "75013",
  city: "Paris",
  country: "FR",
};
async function checkout({
  weight = 250,
  quantity = 1,
  expected = 549,
  destination = address,
  institution = false,
  digital = false,
  loggedIn = true,
} = {}) {
  let payment,
    orders = [],
    items = [];
  const product = {
    id: "book",
    name: "Cahier test",
    category: "Cahiers",
    price_cents: 3000,
    status: "active",
    metadata: { weight_g: weight, requires_shipping: !digital },
  };
  const cart = [
    {
      id: "cart",
      item_type: institution ? "subscription" : "product",
      item_id: "book",
      user_id: "u",
      quantity,
      title: "forged",
      assigned_to: "monthly",
    },
  ];
  const db = {
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        in() {
          return q;
        },
        order() {
          return q;
        },
        insert(rows) {
          if (table === "orders") orders.push(rows);
          if (table === "order_items") items = rows;
          return q;
        },
        single: async () => ({ data: { id: "order" } }),
        maybeSingle: async () => ({
          data: institution
            ? { ...product, name: "Institution", price_monthly_cents: 1 }
            : product,
        }),
        update() {
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve(
            table === "cart_items"
              ? { data: cart }
              : table === "products"
                ? { data: [product] }
                : {},
          ).then(resolve, reject);
        },
      };
      return q;
    },
  };
  const sb = {
    ...db,
    auth: {
      getUser: async () => ({
        data: {
          user: loggedIn ? { id: "u", email: "test@example.test" } : null,
        },
      }),
    },
  };
  class Stripe {
    constructor() {
      this.checkout = {
        sessions: {
          create: async (value) => {
            payment = value;
            return { id: "cs_test", url: "https://checkout.stripe.com/test" };
          },
          expire: async () => {},
        },
      };
    }
  }
  const route = load(
    "app/api/checkout/stripe/route.ts",
    {
      ...next,
      ...rate,
      stripe: Stripe,
      "@/lib/supabase/server": { createClient: async () => sb },
      "@/lib/supabase/admin-server": { createAdminClient: () => db },
      "@/lib/site-url": { getSiteUrl: () => "https://mybasket.test" },
      "@/lib/payments/checkout-integrity": integrity,
      "@/lib/shop/shipping": shipping,
    },
    { STRIPE_SECRET_KEY: "test", STRIPE_WEBHOOK_SECRET: "test" },
  );
  const response = await route.POST(
    new Request("https://mybasket.test/api/checkout/stripe", {
      method: "POST",
      headers: {
        origin: "https://mybasket.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shipping: destination,
        billing: { name: "INCOMPLETE" },
        sameAddress: true,
        shippingCents: expected,
        amount: 1,
      }),
    }),
  );
  return { response, orders, items, payment };
}
(async () => {
  let r = await checkout();
  assert.equal(r.response.status, 200);
  assert.equal(r.orders[0].total_cents, 3549);
  assert.equal(
    r.payment.shipping_options[0].shipping_rate_data.fixed_amount.amount,
    549,
  );
  assert.equal(r.payment.line_items[0].price_data.unit_amount, 3000);
  assert.equal(
    r.payment.line_items[0].price_data.product_data.description,
    undefined,
  );
  assert.equal(
    r.items[0].metadata.delivery.billingAddress.line1,
    address.line1,
  );
  assert.equal(
    r.payment.metadata.items_digest,
    integrity.checkoutItemsDigest(r.items),
  );
  const changed = JSON.parse(JSON.stringify(r.items));
  changed[0].metadata.delivery.shippingAddress.country = "DE";
  assert.notEqual(
    r.payment.metadata.items_digest,
    integrity.checkoutItemsDigest(changed),
  );
  r = await checkout({ expected: 1 });
  assert.equal(r.response.status, 409);
  assert.equal(r.orders.length, 0);
  assert.equal(r.payment, undefined);
  r = await checkout({ destination: { ...address, name: "" } });
  assert.equal(r.response.status, 400);
  assert.equal(r.orders.length, 0);
  r = await checkout({ destination: { ...address, postalCode: "97400" } });
  assert.equal(r.response.status, 400);
  assert.equal(r.orders.length, 0);
  r = await checkout({ quantity: 2, expected: 759 });
  assert.equal(r.response.status, 200);
  assert.equal(r.orders[0].total_cents, 6759);
  r = await checkout({ digital: true, destination: {}, expected: 0 });
  assert.equal(r.response.status, 200);
  assert.equal(r.orders[0].total_cents, 3000);
  assert.equal(r.payment.shipping_options, undefined);
  r = await checkout({ institution: true });
  assert.equal(r.response.status, 400);
  assert.equal(r.orders.length, 0);
  r = await checkout({ loggedIn: false });
  assert.equal(r.response.status, 401);
  let updates = [];
  const connection = load("app/api/auth/connection/route.ts", {
    ...next,
    ...rate,
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "self" } } }) },
      }),
    },
    "@/lib/supabase/admin-server": {
      createAdminClient: () => ({
        auth: {
          admin: {
            getUserById: async (id) => {
              assert.equal(id, "self");
              return { data: { user: { app_metadata: { role: "coach" } } } };
            },
            updateUserById: async (id, value) => {
              updates.push({ id, value });
              return {};
            },
          },
        },
      }),
    },
  });
  const connected = await connection.POST(
    new Request("https://mybasket.test/api/auth/connection", {
      method: "POST",
      body: JSON.stringify({ userId: "someone-else", date: "2000-01-01" }),
    }),
  );
  assert.equal(connected.status, 200);
  assert.equal(updates[0].id, "self");
  assert.equal(updates[0].value.app_metadata.role, "coach");
  assert(
    Date.parse(updates[0].value.app_metadata.mybasket_last_connected_at) >
      Date.parse("2026-01-01"),
  );
  const access = load("lib/calendar-access.ts");
  const timetable = load("lib/school-timetable.ts");
  let writes = [];
  let permitted = true;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "coach" } } }) },
    from(table) {
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        in() {
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve({
            data:
              table === "teams"
                ? [
                    { id: "u18", user_id: "coach" },
                    { id: "u21", user_id: "coach" },
                  ]
                : [],
          }).then(resolve, reject);
        },
        maybeSingle: async () => ({
          data: {
            id: "p",
            team_id: "u18",
            metadata: { additionalTeamIds: ["u21"] },
          },
        }),
        upsert: async (rows) => {
          assert.equal(table, "calendar_events");
          writes.push(...rows);
          return {};
        },
      };
      return q;
    },
  };
  const route = load("app/api/school/timetable/route.ts", {
    ...next,
    ...rate,
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/calendar-access": access,
    "@/lib/messaging/team-contacts": {
      teamMessagingContacts: async () => ({ canLinkPlayers: permitted }),
    },
    "@/lib/ai/openai": {
      getOpenAI: () => {
        throw Error("No AI call expected in apply");
      },
    },
    "@/lib/ai/config": {},
    "@/lib/school-timetable": timetable,
  });
  const request = () =>
    new Request("https://mybasket.test/api/school/timetable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId: "u21",
        playerId: "p",
        courses: [
          {
            day: 1,
            title: "Maths",
            start: "08:00",
            end: "09:00",
            location: "",
          },
        ],
        from: "2026-11-16",
        to: "2026-11-30",
      }),
    });
  let applied = await route.POST(request());
  assert.equal(applied.status, 200);
  assert.equal(writes.length, 3);
  assert(
    writes.every(
      (row) =>
        row.assigned_player_ids[0] === "p" &&
        row.owner_id === "coach" &&
        row.team_id === "u21" &&
        row.event_type === "school",
    ),
  );
  const ids = writes.map((row) => row.id);
  await route.POST(request());
  assert.equal(
    JSON.stringify(writes.slice(3).map((row) => row.id)),
    JSON.stringify(ids),
    "A repeated validated import is idempotent",
  );
  permitted = false;
  writes = [];
  applied = await route.POST(request());
  assert.equal(applied.status, 403);
  assert.equal(writes.length, 0);
  console.log(
    "Server workflows passed: trusted weights and catalog prices, shipping total and metadata, changed-fee rejection, digital/quote-only plans, authenticated connection timestamps, school ownership and multi-team relation, idempotent schedule imports. No payment or real message sent.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
