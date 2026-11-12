import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { createServerClient } from "@supabase/ssr";
import { getUserRoleName } from "@/data/users/get-user-role";
import { USER_ROLE_PLATEFORMADMIN } from "./lib/constants";
import { isUuid } from "./lib/is-uuid";
import { stripLocalePrefix } from "./lib/locale-path";
import { routes } from "./lib/routes";

const handleI18nRouting = createMiddleware(routing);

/** Known static asset extensions — not a blanket "any path with a dot". */
const STATIC_ASSET_EXT =
  /\.(?:png|jpe?g|gif|svg|ico|webp|css|js|mjs|map|txt|xml|woff2?|ttf|eot)$/i;

/** Exact guest detail only — not `/campgrounds/<id>/book` etc. */
function isPublicCampgroundDetailPath(pathnameWithoutLocale: string): boolean {
  const prefix = `${routes.campgrounds()}/`;
  if (!pathnameWithoutLocale.startsWith(prefix)) return false;
  const rest = pathnameWithoutLocale.slice(prefix.length);
  return !rest.includes("/") && isUuid(rest);
}

function isPublicPath(pathnameWithoutLocale: string): boolean {
  if (pathnameWithoutLocale === routes.home()) return true;

  if (
    pathnameWithoutLocale === routes.auth() ||
    pathnameWithoutLocale.startsWith(`${routes.auth()}/`)
  ) {
    return true;
  }

  return isPublicCampgroundDetailPath(pathnameWithoutLocale);
}

export default async function middleware(request: NextRequest) {
  const response = handleI18nRouting(request);

  if (response.status !== 200) {
    return response;
  }

  const pathname = request.nextUrl.pathname;
  const pathnameWithoutLocale = stripLocalePrefix(pathname);

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
    isPublicPath(pathnameWithoutLocale) ||
    pathname.startsWith("/_next") ||
    STATIC_ASSET_EXT.test(pathname);

  if (isPublic) {
    return response;
  }

  if (!user) {
    const locale =
      response.headers.get("x-next-intl-locale") || routing.defaultLocale;

    const prefix = `/${locale}`;
    const loginUrl = new URL(`${prefix}${routes.auth()}`, request.url);
    loginUrl.searchParams.set("redirect", pathname);

    return NextResponse.redirect(loginUrl);
  }

  if (pathnameWithoutLocale.startsWith(routes.platformAdmin.root())) {
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|svg|ico|webp|css|js|mjs|map|txt|xml|woff2?|ttf|eot)$).*)",
  ],
};
