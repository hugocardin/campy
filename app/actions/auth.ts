"use server";

import { redirect } from "@/i18n/navigation";
import { ActionResult, resultSuccess } from "@/lib/errors";
import { revalidateLocalizedPath } from "@/lib/revalidate-localized-path";
import { routes } from "@/lib/routes";
import { toSafeInternalHref } from "@/lib/safe-internal-href";
import { handleAuthResponse } from "@/lib/supabase/db-utils";
import { createClient } from "@/lib/supabase/server";
import { AUTH_MODES, AuthMode } from "@/lib/types/auth";
import { getLocale } from "next-intl/server";

export async function authAction(
  mode: AuthMode,
  email: string,
  password: string,
  redirectTo: string = routes.profile(),
): Promise<ActionResult<void>> {
  const supabase = await createClient();

  let result: ActionResult<void>;

  if (mode === AUTH_MODES.SIGNIN) {
    result = await handleAuthResponse(() =>
      supabase.auth.signInWithPassword({ email, password }),
    );
  } else {
    result = await handleAuthResponse(() =>
      supabase.auth.signUp({ email, password }),
    );
  }

  if (!result.success) {
    return result;
  }

  if (mode === AUTH_MODES.SIGNUP) {
    return resultSuccess();
  }

  // Refresh the whole localized tree so auth-dependent UI (Header) updates
  // on any previously visited page, not just home.
  revalidateLocalizedPath("/", "layout");

  const locale = await getLocale();
  return redirect({
    href: toSafeInternalHref(redirectTo),
    locale,
  });
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidateLocalizedPath("/", "layout");

  const locale = await getLocale();
  return redirect({ href: routes.home(), locale });
}
