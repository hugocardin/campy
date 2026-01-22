import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  if (isAdminRoute(req)) {
    if (!userId) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(`role_name:user_roles ( name )`)
      .eq("id", userId)
      .single();

    if (error || !profile) {
      console.error(
        "Admin role check failed:",
        error?.message || "No profile found",
      );
      return NextResponse.redirect(new URL("/", req.url));
    }

    // @ts-expect-error Even if visual thinks name doesn't exist, it does, ignore the warning.
    const roleName = profile?.role_name?.name;

    const allowedRoles = ["admin", "platform_admin"];

    if (!roleName || !allowedRoles.includes(roleName)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Covers almost everything except static
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    // Keep Clerk's API routes
    "/(api|trpc)(.*)",
  ],
};
