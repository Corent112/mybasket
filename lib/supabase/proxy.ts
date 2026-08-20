import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const PRIVATE_PREFIXES = [
  "/mon-compte",
  "/management",
  "/prise-stats-pro",
  "/admin",
];

const ADMIN_PREFIX = "/admin";

function isPrivatePath(pathname: string) {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAdminPath(pathname: string) {
  return pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
}

function redirectTo(
  pathname: string,
  request: NextRequest,
  options?: { preserveNext?: boolean; error?: string },
) {
  const url = request.nextUrl.clone();
  const original =
    `${request.nextUrl.pathname}${request.nextUrl.search}`;

  url.pathname = pathname;
  url.search = "";

  if (options?.preserveNext) {
    url.searchParams.set("next", original);
  }
  if (options?.error) {
    url.searchParams.set("error", options.error);
  }

  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error(
      "Variables Supabase manquantes : NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );

    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const pathname = request.nextUrl.pathname;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPrivatePath(pathname) && !user) {
    return redirectTo("/connexion", request, {
      preserveNext: true,
    });
  }

  if (!user) {
    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role,status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.status === "suspended") {
    // Évite une boucle connexion -> page privée -> connexion :
    // le compte suspendu ne doit pas conserver une session active.
    await supabase.auth.signOut();
    return redirectTo("/connexion", request, {
      error: "Ce compte est suspendu. Contacte MyBasket.",
    });
  }

  if (isAdminPath(pathname)) {
    const role = profile?.platform_role;

    if (!role || !["ceo", "superadmin"].includes(role)) {
      return redirectTo("/mon-compte", request);
    }
  }

  return response;
}