/**
 * Client OpenAI — SERVEUR UNIQUEMENT.
 *
 * La clé `OPENAI_API_KEY` ne doit jamais être exposée au navigateur : elle
 * n'est pas préfixée `NEXT_PUBLIC_` et ce module lève une erreur s'il est
 * importé côté client.
 */
import OpenAI from "openai";

let cached: OpenAI | null = null;

function assertServer() {
  if (typeof window !== "undefined") {
    throw new Error(
      "[MyBasket AI] lib/ai/openai.ts a été importé côté navigateur. " +
        "Tous les appels IA doivent passer par une route serveur."
    );
  }
}

/** Retourne le client OpenAI, ou `null` si la clé n'est pas configurée. */
export function getOpenAI(): OpenAI | null {
  assertServer();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  if (!cached) {
    cached = new OpenAI({
      apiKey,
      organization: process.env.OPENAI_ORG_ID || undefined,
      project: process.env.OPENAI_PROJECT_ID || undefined,
      maxRetries: 2,
      timeout: 60_000,
    });
  }

  return cached;
}

/** Variante stricte : lève une erreur explicite si la clé manque. */
export function requireOpenAI(): OpenAI {
  const client = getOpenAI();
  if (!client) {
    throw new Error(
      "OPENAI_API_KEY manquante. Ajoute-la dans .env.local (côté serveur uniquement)."
    );
  }
  return client;
}
