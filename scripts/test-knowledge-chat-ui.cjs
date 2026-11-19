const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
const { JSDOM } = require("jsdom");
const dom = new JSDOM('<div id="root"></div>', {
  url: "https://mybasket.test/mon-compte",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "navigator",
])
  Object.defineProperty(global, key, {
    value: dom.window[key],
    configurable: true,
  });
global.IS_REACT_ACT_ENVIRONMENT = true;
HTMLElement.prototype.scrollIntoView = function () {};
const React = require("react"),
  { act } = React,
  { createRoot } = require("react-dom/client");
require.extensions[".tsx"] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
require.extensions[".css"] = (m) => {
  m.exports = new Proxy({}, { get: (_, key) => String(key) });
};
let authCallback;
let questionBodies = [];
let fail = false;
const mockDb = {
  auth: {
    getUser: async () => ({ data: { user: { id: "one" } } }),
    onAuthStateChange: (callback) => {
      authCallback = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    },
  },
};
const original = Module._load;
Module._load = function (name, parent, main) {
  if (name === "next/navigation") return { usePathname: () => "/mon-compte" };
  if (name === "@/lib/supabase/client") return { createClient: () => mockDb };
  return original.call(this, name, parent, main);
};
global.fetch = async (url, options) => {
  assert.equal(url, "/api/ai/chat");
  const body = JSON.parse(options.body);
  questionBodies.push(body);
  if (fail)
    return Response.json(
      { error: "provider private configuration detail" },
      { status: 503 },
    );
  const frames = [
    [
      "context",
      {
        conversationId: "conversation",
        citations: [
          {
            kind: "term",
            id: "possession",
            label: "Lexique MyBasket · Possession",
          },
        ],
      },
    ],
    [
      "delta",
      {
        text: body.message.startsWith("Oui")
          ? "Voici le calcul demandé."
          : "Une possession est une séquence de contrôle du ballon. Veux-tu voir le calcul ?",
      },
    ],
    ["done", {}],
  ]
    .map(
      ([event, payload]) =>
        `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
    )
    .join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        const b = new TextEncoder().encode(frames);
        controller.enqueue(b.slice(0, 73));
        controller.enqueue(b.slice(73));
        controller.close();
      },
    }),
  );
};
(async () => {
  const Chat = require("../components/assistant/KnowledgeChat.tsx").default;
  const root = createRoot(document.getElementById("root"));
  await act(async () => {
    root.render(React.createElement(Chat));
    await new Promise((r) => setTimeout(r, 5));
  });
  const click = async (element) => {
    assert(element);
    await act(async () => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 10));
    });
  };
  await click(
    document.querySelector('[aria-label="Ouvrir l’assistant MyBasket"]'),
  );
  assert(document.querySelector('[role="dialog"]'));
  assert.equal(
    document.activeElement.getAttribute("aria-label"),
    "Ta question",
  );
  await click(
    [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("possession"),
    ),
  );
  assert(document.body.textContent.includes("Lexique MyBasket · Possession"));
  assert(document.body.textContent.includes("Oui, explique-moi"));
  assert.equal(questionBodies[0].module, "coach-chat");
  await click(
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Oui, explique-moi",
    ),
  );
  assert.equal(questionBodies[1].conversationId, "conversation");
  assert(document.body.textContent.includes("Voici le calcul demandé."));
  await act(async () =>
    authCallback("TOKEN_REFRESHED", { user: { id: "one" } }),
  );
  assert(
    document.body.textContent.includes("Voici le calcul demandé."),
    "Token refresh must preserve the conversation",
  );
  await act(async () => {
    document
      .querySelector('[role="dialog"]')
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
  });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(
    document.activeElement.getAttribute("aria-label"),
    "Ouvrir l’assistant MyBasket",
  );
  await act(async () => authCallback("SIGNED_IN", { user: { id: "two" } }));
  await click(
    document.querySelector('[aria-label="Ouvrir l’assistant MyBasket"]'),
  );
  assert(
    !document.body.textContent.includes("Voici le calcul demandé."),
    "Account switch clears private conversation",
  );
  fail = true;
  await click(
    [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("possession"),
    ),
  );
  assert(document.body.textContent.includes("temporairement indisponible"));
  assert(!document.body.textContent.includes("private configuration"));
  await act(async () => root.unmount());
  Module._load = original;
  console.log(
    "Knowledge chat UI passed: SSE frame boundaries, grounded citations, follow-up choices and conversation linkage, keyboard focus, token refresh continuity, account isolation and clear provider-error display. No AI request made.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
