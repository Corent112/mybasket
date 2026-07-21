import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

function applySecurityHeaders(response: NextResponse, request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-DNS-Prefetch-Control", "on");

  if (pathname.startsWith("/admin")) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  return applySecurityHeaders(response, request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};