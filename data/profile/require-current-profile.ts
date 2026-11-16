import "server-only";

import { getUserProfile } from "@/data/profile/get-profile";
import { UserProfile } from "@/entities/user-profile";
import { redirect } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";

export type CurrentProfileContext = {
  user: User;
  profile: UserProfile;
};

/**
 * Auth-gated profile pages: require a session + own profile row.
 * Unsigned → localized `/auth`. Signed-in but missing/unreadable profile → 404
 * (not `/auth`, which implies the session is gone).
 */
export async function requireCurrentProfile(): Promise<CurrentProfileContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const locale = await getLocale();
    return redirect({
      href: routes.auth(),
      locale,
    });
  }

  const profileResult = await getUserProfile(user.id);
  if (!profileResult.success || !profileResult.data) {
    notFound();
  }

  return { user, profile: profileResult.data };
}
