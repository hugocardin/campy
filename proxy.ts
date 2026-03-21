import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { createServerClient } from "@supabase/ssr";
import { getUserRoleName } from "@/data/users/get-user-role";
import { USER_ROLE_PLATEFORMADMIN } from "./lib/constants";
import { routes } from "./lib/routes";

const handleI18nRouting = createMiddleware(routing);

const publicBasePaths = [routes.home(), routes.auth()];

export default async function middleware(request: NextRequest) {
  const response = handleI18nRouting(request);

  if (response.status !== 200) {
    return response;
  }

  const pathname = request.nextUrl.pathname;
  const pathnameWithoutLocale =
    pathname.replace(/^\/(?:en-CA|fr-CA)(?=\/|$)/, "") || "/";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic =
    publicBasePaths.some(
      (base) =>
        pathnameWithoutLocale === base ||
        pathnameWithoutLocale.startsWith(base + "/"),
    ) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".");

  if (isPublic) {
    return response;
  }

  // Require login
  if (!user) {
    const locale =
      response.headers.get("x-next-intl-locale") || routing.defaultLocale;

    const prefix = `/${locale}`;
    const loginUrl = new URL(`${prefix}${routes.auth()}`, request.url);
    loginUrl.searchParams.set("redirect", pathname);

    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes
  if (pathname.startsWith(routes.platformAdmin.root())) {
    const result = await getUserRoleName(user.id);

    if (!result.success || result.data !== USER_ROLE_PLATEFORMADMIN) {
      const locale =
        response.headers.get("x-next-intl-locale") || routing.defaultLocale;
      const prefix = `/${locale}`;
      const redirectUrl = new URL(`${prefix}${routes.home()}`, request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
