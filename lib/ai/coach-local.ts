import OpenAI from "openai";

let client: OpenAI | null = null;

export function getLocalCoach() {
  const model = process.env.MYBASKET_COACH_LOCAL_MODEL?.trim() || "gpt-oss:20b";
  if (/cloud/i.test(model)) return null;
  const endpoint = process.env.MYBASKET_COACH_LOCAL_URL?.trim();
  if (!endpoint) return null;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/v1") && !url.pathname.endsWith("/v1/")) return null;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const localDevelopment = loopback && process.env.VERCEL !== "1";
  const apiKey = process.env.MYBASKET_COACH_LOCAL_KEY?.trim();
  if (!(url.protocol === "https:" && apiKey) && !(localDevelopment && url.protocol === "http:")) return null;

  client ??= new OpenAI({
    baseURL: url.href, apiKey: apiKey || "ollama", timeout: 55_000, maxRetries: 0,
    fetch: (input, init) => fetch(input, { ...init, redirect: "error" }),
  });
  return { client, model };
}
