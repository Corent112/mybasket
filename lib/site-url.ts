import type { NextRequest } from "next/server";

/**
 * URL publique de MyBasket.
 *
 * Priorité :
 * 1. NEXT_PUBLIC_SITE_URL configurée sur Vercel (recommandé)
 * 2. NEXT_PUBLIC_APP_URL
 * 3. origine réelle de la requête (domaine actuellement utilisé)
 * 4. fallback Vercel
 */
export function getSiteUrl(request?: NextRequest | Request | null) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "";

  if (configured.trim()) {
    return configured.trim().replace(/\/$/, "");
  }

  if (request) {
    try {
      return new URL(request.url).origin.replace(/\/$/, "");
    } catch {
      // fallback plus bas
    }
  }

  // Domaine public MyBasket. On évite volontairement le domaine technique
  // Vercel dans les e-mails d'authentification pour améliorer la délivrabilité.
  return "https://mybasket.fr";
}

export function safeInternalPath(
  value: unknown,
  fallback = "/mon-compte",
) {
  const path = String(value || fallback).trim();

  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  if (/^\/\s*https?:\/\//i.test(path)) return fallback;

  return path;
}

export function absoluteSiteUrl(
  path: string,
  request?: NextRequest | Request | null,
) {
  const safePath = safeInternalPath(path, "/");
  return `${getSiteUrl(request)}${safePath}`;
}
