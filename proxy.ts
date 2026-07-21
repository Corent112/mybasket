import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

/**
 * Routes qui nécessitent réellement une session Supabase.
 * Les pages publiques ne doivent pas attendre un appel réseau d'authentification.
 */
const AUTHENTICATED_ROUTES = [
  "/admin",
  "/mon-compte",
  "/management",
  "/equipes",
  "/prise-stats-pro",
];

function requiresAuthentication(pathname: string) {
  return AUTHENTICATED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

function applySecurityHeaders(response: NextResponse, request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.headers.set("X-DNS-Prefetch-Control", "on");

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Pages publiques : aucune requête Supabase dans le proxy.
  if (!requiresAuthentication(pathname)) {
    return applySecurityHeaders(NextResponse.next(), request);
  }

  // Pages privées : rafraîchissement et vérification de la session.
  try {
    const response = await updateSession(request);
    return applySecurityHeaders(response, request);
  } catch (error) {
    console.error("[proxy] Échec de mise à jour de la session:", error);

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/connexion";
    loginUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`
    );

    return applySecurityHeaders(NextResponse.redirect(loginUrl), request);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf|otf|mp4|webm|pdf)$).*)",
  ],
};