import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

import { getUserRoleName } from "@/data/users/get-user-role";
import { createServerClient } from "@supabase/ssr";
import { USER_ROLE_PLATEFORMADMIN } from "./lib/constants";
import { routes } from "./lib/routes";

// 1. Create the next-intl middleware handler
const handleI18nRouting = createMiddleware(routing);

// 2. Your main middleware (combines both)
export default async function middleware(request: NextRequest) {
  // Step A: Run next-intl first → handles locale prefix, detection, rewrite/redirect
  // It may return a redirect (e.g. / → /en-CA) or rewrite internally
  const i18nResponse = handleI18nRouting(request);

  // If next-intl already decided to redirect (e.g. missing locale → add /en-CA)
  // → short-circuit and return it immediately (don't run auth)
  if (
    i18nResponse.headers.get("x-middleware-rewrite") ||
    i18nResponse.status !== 200
  ) {
    return i18nResponse;
  }

  // Step B: Create Supabase client (using the possibly rewritten request)
  const supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Your existing public routes check
  if (
    pathname === routes.home() ||
    pathname.startsWith(routes.auth()) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return supabaseResponse; // or merge with i18nResponse if needed
  }

  // Require login
  if (!user) {
    const loginUrl = new URL(routes.auth(), request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes
  if (pathname.startsWith(routes.platformAdmin.root())) {
    const result = await getUserRoleName(user.id);

    if (!result.success || result.data !== USER_ROLE_PLATEFORMADMIN) {
      return NextResponse.redirect(new URL(routes.home(), request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
