"use client";

/**
 * Client HTTP de la page Connaissances IA.
 * Toutes les requêtes passent par les routes serveur : aucune clé OpenAI,
 * aucun accès direct à Supabase depuis ce module.
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json();
  } catch {
    // réponse vide
  }

  if (!response.ok) {
    throw new ApiError(
      typeof payload.error === "string" ? payload.error : "Une erreur est survenue.",
      response.status
    );
  }

  return payload as T;
}

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body?: unknown) =>
    request<T>(url, {
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: <T,>(url: string, body: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T,>(url: string) => request<T>(url, { method: "DELETE" }),
};

export const API = {
  overview: "/api/ai/knowledge/overview",
  categories: "/api/ai/knowledge/categories",
  sources: "/api/ai/knowledge/sources",
  terms: "/api/ai/knowledge/terms",
  rules: "/api/ai/knowledge/rules",
  references: "/api/ai/knowledge/references",
  referenceCandidates: "/api/ai/knowledge/references/candidates",
  corrections: "/api/ai/knowledge/corrections",
  conversations: "/api/ai/conversations",
  chat: "/api/ai/chat",
} as const;
