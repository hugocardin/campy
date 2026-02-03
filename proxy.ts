import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getUserRoleName } from "@/app/data/users/get-user-role";
import { routes } from "./lib/routes";

export async function proxy(request: NextRequest) {
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

  // Always refresh session if needed (core magic)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 1. Public routes → always allow (add more if needed: /about, /search, /login, /signup ...)
  if (
    pathname === routes.home() ||
    pathname.startsWith(routes.auth()) ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return supabaseResponse;
  }

  // 2. Require login for protected routes
  if (!user) {
    // Redirect to login + preserve original path (so after login you can redirect back)
    const loginUrl = new URL(routes.auth(), request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Admin-only routes: check role_id === 4 from profiles
  if (pathname.startsWith(routes.platformAdmin.root())) {
    const userRole = await getUserRoleName(user.id);

    if (userRole !== "platform_admin") {
      // Redirect to home (or to a /unauthorized page if you create one)
      return NextResponse.redirect(new URL(routes.home(), request.url));
    }
  }

  // 4. /profile (and subpaths) → just needs login (already checked above)
  // Add more role-based branches here later if needed (e.g. moderator routes)

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
