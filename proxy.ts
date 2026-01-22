import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAdmin } from "@/data/users/get-user-role"; // ← clean import!

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // Early exit for non-admin routes → fast path
  if (!isAdminRoute(req)) {
    return NextResponse.next();
  }

  // Admin route → must be logged in
  if (!userId) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Check role
  const hasAdminAccess = await isAdmin(userId);

  if (!hasAdminAccess) {
    console.warn(
      `Unauthorized admin access attempt — user: ${userId}, url: ${req.url}`,
    );
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Covers almost everything except static assets
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/(api|trpc)(.*)",
  ],
};
